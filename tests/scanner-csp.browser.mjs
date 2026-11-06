import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

// Real bundled OCR, generated photo, actual app and production _headers.
// No credentials, customer fixtures, hosted services or price-book imports.
const root = fileURLToPath(new URL('../', import.meta.url));
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const workerPath = '/vendor/scanner/scanner.worker.js';
const source = await readFile(path.join(root, '_headers'), 'utf8');
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
const cacheVersion = sw.match(/CACHE_NAME = CACHE_PREFIX \+ '([^']+)'/)[1];
assert.notEqual(cacheVersion, 'v2.0.1-menu-share', 'Invalidate the cached broken worker response');

// The subset of Pages syntax used here. Pages applies matched rules in order,
// unsets before sets, and appends duplicate set headers. See Cloudflare's
// packages/pages-shared/asset-server/handler.ts and configuration/parseHeaders.ts.
// Fail on unsupported syntax rather than silently skipping a future rule.
const rules = [];
for (const raw of source.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('/')) {
    assert.ok(line === '/*' || /^\/[\w./-]+$/.test(line), 'Unsupported header path');
    rules.push({ path: line, set: [], unset: [] });
  } else if (line.startsWith('! ')) rules.at(-1).unset.push(line.slice(2).toLowerCase());
  else {
    const colon = line.indexOf(':');
    assert.ok(colon > 0 && rules.length, 'Invalid header syntax');
    rules.at(-1).set.push([line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()]);
  }
}
function headersFor(pathname, fixed) {
  const headers = new Headers();
  for (const rule of rules) {
    if (rule.path !== '/*' && (!fixed || rule.path !== pathname)) continue;
    for (const name of rule.unset) headers.delete(name);
    for (const [name, value] of rule.set) headers.append(name, value);
  }
  return Object.fromEntries(headers);
}
const documentPolicy = headersFor('/', true)['content-security-policy'];
assert.ok(documentPolicy && !documentPolicy.includes("'unsafe-eval'"));
assert.match(documentPolicy, /frame-ancestors 'none'/);
for (const asset of ['/index.html', '/help.html', '/js/invoice.js', '/sw.js', '/vendor/scanner/other.worker.js']) {
  assert.equal(headersFor(asset, true)['content-security-policy'], documentPolicy);
}
const workerPolicy = headersFor(workerPath, true)['content-security-policy'];
assert.ok(workerPolicy.includes("'unsafe-eval'") && !workerPolicy.includes(','), 'Exactly one worker policy');
assert.match(workerPolicy, /connect-src 'self'; worker-src 'none'/);

let fixed = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const relative = decodeURIComponent(pathname).slice(1) || 'index.html';
    assert.equal(req.method, 'GET');
    assert.match(relative, /^(?:index\.html$|privacy\.html$|help\.html$|terms\.html$|sw\.js$|styles\.css$|manifest\.webmanifest$|icons\/|js\/|styles\/|vendor\/)/);
    const file = path.resolve(root, relative);
    assert.ok(file.startsWith(root));
    // This offline scanner fixture must not execute third-party analytics.
    // Production HTML remains unchanged; the scanner and CSP are still tested.
    const bytes = relative === 'index.html'
      ? (await readFile(file, 'utf8')).replace(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/g, '')
      : relative === 'sw.js' && !fixed ? sw.replace(cacheVersion, 'v2.0.1-menu-share') : await readFile(file);
    res.writeHead(200, { ...headersFor(pathname, fixed), 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const external = [];
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if ((url.origin === origin && request.method() === 'GET') || url.protocol === 'blob:') return route.continue();
  // The page intentionally loads an analytics beacon; keep it blocked in this offline OCR test.
  if ((url.origin === 'https://static.cloudflareinsights.com' && url.pathname === '/beacon.min.js') ||
      (url.origin === 'https://cloudflareinsights.com' && url.pathname === '/cdn-cgi/rum')) return route.abort();
  external.push(url.origin + url.pathname);
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const response = await page.goto(origin, { waitUntil: 'load' });
  assert.equal(response.headers()['content-security-policy'], documentPolicy);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    localStorage.setItem('scanner-qa-fictional-recipe', JSON.stringify({ name: 'Fictional soup', cost: 1.25 }));
    const unrelated = await caches.open('unrelated-app-test');
    await unrelated.put('/unrelated-sentinel', new Response('preserve'));
  });
  const photo = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1500;
    const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, 1200, 1500); c.fillStyle = 'black'; c.font = '30px Arial';
    ['FICTIONAL TEST SUPPLIER', 'INVOICE TEST-001', 'Description      Pack       Qty      Price      Total', 'Butter               1kg          1        4.00        4.00', 'Subtotal 4.00'].forEach((text, i) => c.fillText(text, 40, 100 + i * 100));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
  async function selectPhoto() {
    // Reveal the local invoice view without signing into any account.
    await page.evaluate(() => {
      document.body.classList.add('mm-authenticated');
      document.body.dataset.activeView = 'invoices';
      document.querySelectorAll('.app-view').forEach(view => { view.hidden = view.id !== 'view-invoices'; });
    });
    await page.locator('#invoiceFile').setInputFiles({ name: 'fictional-invoice.jpg', mimeType: 'image/jpeg', buffer: photo });
  }
  await selectPhoto();
  await page.locator('#scanInvoice').click();
  await page.waitForFunction(() => document.body.textContent.includes('EvalError') || document.body.textContent.includes('Refused to evaluate'));
  console.log(`PASS ${engine}: original headers reproduce the scanner EvalError.`);
  // Ensure the failed response really is cached, as on an installed PWA.
  await page.waitForFunction(async path => {
    const cache = await caches.open('menumargin-shell-%2F-v2.0.1-menu-share');
    return !!(await cache.match(path));
  }, workerPath);

  fixed = true;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    await registration.update();
    await changed;
  });
  await page.waitForFunction(async version => {
    const names = await caches.keys();
    return names.includes('menumargin-shell-%2F-' + version) && !names.includes('menumargin-shell-%2F-v2.0.1-menu-share');
  }, cacheVersion);
  await page.reload({ waitUntil: 'load' });
  const preservation = await page.evaluate(async () => ({
    recipe: JSON.parse(localStorage.getItem('scanner-qa-fictional-recipe')),
    unrelated: await (await (await caches.open('unrelated-app-test')).match('/unrelated-sentinel')).text()
  }));
  assert.deepEqual(preservation, { recipe: { name: 'Fictional soup', cost: 1.25 }, unrelated: 'preserve' });
  assert.equal(await page.evaluate(async path => (await fetch(path)).headers.get('content-security-policy'), workerPath), workerPolicy);
  console.log(`PASS ${engine}: automatic PWA cache upgrade preserves local data and unrelated caches.`);

  // In-page script execution remains forbidden; Playwright evaluate itself is
  // privileged, so test a real script element rather than calling eval there.
  assert.equal(await page.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.scannerQaUnsafeInline = true'; document.head.append(script); script.remove();
    return window.scannerQaUnsafeInline === true;
  }), false);
  errors.length = 0;
  await selectPhoto();
  await page.locator('#scanInvoice').click();
  await page.waitForFunction(() => document.body.textContent.includes('Scan finished. Compare'));
  assert.equal(await page.locator('.scan-row').count(), 1);
  assert.match(await page.locator('.invoice-item-name').inputValue(), /butter/i);
  assert.equal(await page.locator('.invoice-import-check:checked').count(), 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS ${engine}: real JPEG selection and Read invoice produce a reviewable Butter row.`);

  // Stop HTTP instead of WebKit setOffline(), which also breaks local Blob APIs.
  await page.evaluate(() => MenuMarginScanner.reset());
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await page.locator('#scanInvoice').click();
  await page.waitForFunction(() => !document.getElementById('scanInvoice').disabled && document.body.textContent.includes('Scan finished. Compare'));
  assert.equal(await page.locator('.scan-row').count(), 1);
  assert.match(await page.locator('.invoice-item-name').inputValue(), /butter/i);
  assert.deepEqual(external, []);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS ${engine}: a fresh OCR worker reads the photo offline; no external requests or imports.`);
} finally {
  await browser.close();
  if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
