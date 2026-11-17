import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, submit, main, ORIGIN, ENDPOINT, KEY_FILE } from '../scripts/indexnow.mjs';

const url = ORIGIN + '/free-recipe-costing-calculator';
const response = (status, body, headers = {}) => new Response(body, { status, headers });
function mockServer(plan, { keyStatus = 200, keyBody = plan.payload.key, pageStatus = 200, pageBody = plan.pages[0].html, headers = {}, notificationStatus = 200 } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (target, options) => {
      calls.push({ target, options });
      if (options.method === 'POST') return response(notificationStatus, '');
      if (target === plan.payload.keyLocation) return response(keyStatus, keyBody);
      return response(pageStatus, pageBody, headers);
    },
  };
}

test('dry-run requires explicit public canonical URLs and makes no network call', async (t) => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Dry-run must not access the network'); });
  const result = await main([url, url]);
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(result.urls, [url]);
  assert(!JSON.stringify(result).includes(prepare([url]).payload.key));
  await assert.rejects(main([]), /explicit/);
  await assert.rejects(main(['--force', url]), /Unknown option/);
  assert.equal(network.mock.callCount(), 0);
});

test('rejects app, www, HTTP, external, query, fragment, credentials, privacy and duplicate-demo URLs', () => {
  for (const candidate of [
    'https://menu-margin.pages.dev/', 'https://www.miseenprice.co.uk/', 'http://miseenprice.co.uk/',
    'https://example.com/', url + '?email=customer@example.com', url + '#example',
    'https://user:password@miseenprice.co.uk/', ORIGIN + '/website-privacy',
    ORIGIN + '/one-recipe-demo', ORIGIN + '/does-not-exist',
  ]) assert.throws(() => prepare([candidate]), /HTTPS|eligible/);
  assert.throws(() => prepare(['not a URL']), /Invalid URL/);
});

test('rejects invalid ownership file, source noindex and mismatched canonical', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mep-indexnow-'));
  try {
    const key = readFileSync(new URL('../marketing/' + KEY_FILE, import.meta.url), 'utf8');
    writeFileSync(join(directory, KEY_FILE), 'invalid');
    assert.throws(() => prepare([url], { directory }), /Ownership/);
    writeFileSync(join(directory, KEY_FILE), key);
    writeFileSync(join(directory, 'sitemap.xml'), `<urlset><url><loc>${url}</loc></url></urlset>`);
    for (const html of [
      `<link rel="canonical" href="${ORIGIN}/">`,
      `<link rel="canonical" href="${url}"><meta content="noindex,follow" name="robots">`,
    ]) {
      writeFileSync(join(directory, 'free-recipe-costing-calculator.html'), html);
      assert.throws(() => prepare([url], { directory }), /indexable and self-canonical/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('failed key or live-page preflight sends no notification', async () => {
  const plan = prepare([url]);
  for (const variant of [
    { keyStatus: 404 }, { keyBody: 'wrong key' }, { pageStatus: 404 },
    { pageBody: '<html>outdated or redirected</html>' },
    { pageBody: plan.pages[0].html + '\n' },
    { headers: { 'X-Robots-Tag': 'bingbot: noindex' } },
    { headers: { 'X-Robots-Tag': 'none' } },
  ]) {
    const server = mockServer(plan, variant);
    await assert.rejects(submit(plan, server), /No notification sent/);
    assert.equal(server.calls.filter(c => c.options.method === 'POST').length, 0);
  }
});

test('all pages must pass before a batch is submitted', async () => {
  const plan = prepare([url, ORIGIN + '/catering-recipe-costing']);
  const server = mockServer(plan);
  // The second response contains the first page, so it must fail comparison.
  await assert.rejects(submit(plan, server), /No notification sent/);
  assert.equal(server.calls.length, 3);
  assert(!server.calls.some(c => c.options.method === 'POST'));
});

test('network/redirect errors stop without retries or notification', async () => {
  const plan = prepare([url]);
  let calls = 0;
  await assert.rejects(submit(plan, { fetchImpl: async (_target, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    throw new Error('redirect or network failure');
  } }), /network failure/);
  assert.equal(calls, 1);
});

test('200 and 202 produce distinct receipts and never claim indexing', async () => {
  const plan = prepare([url]);
  for (const status of [200, 202]) {
    const server = mockServer(plan, { notificationStatus: status });
    const result = await submit(plan, server);
    assert.equal(result.status, status);
    assert.match(result.detail, /Indexing is not confirmed/);
    if (status === 202) assert.match(result.detail, /validation pending/);
    assert(!Number.isNaN(Date.parse(result.timestamp)));
    assert.deepEqual(result.urls, [url]);
    assert.equal(server.calls.length, 3);
    const sent = server.calls.at(-1);
    assert.equal(sent.target, ENDPOINT);
    assert.equal(sent.options.redirect, 'error');
    assert.deepEqual(JSON.parse(sent.options.body), plan.payload);
    assert.equal(JSON.parse(sent.options.body).host, 'miseenprice.co.uk');
    assert(!JSON.stringify(result).includes(plan.payload.key));
  }
});

test('429/403/422/500 errors retain the status and never auto-retry', async () => {
  const plan = prepare([url]);
  for (const status of [429, 403, 422, 500]) {
    const server = mockServer(plan, { notificationStatus: status });
    await assert.rejects(submit(plan, server), error => {
      assert.equal(error.receipt.status, status);
      assert.match(error.message, /No automatic retry/);
      return true;
    });
    assert.equal(server.calls.filter(c => c.options.method === 'POST').length, 1);
  }
});
