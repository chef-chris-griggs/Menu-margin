import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const ORIGIN = 'https://miseenprice.co.uk';
export const ENDPOINT = 'https://api.indexnow.org/indexnow';
export const KEY_FILE = 'a8a02f6e971dcb13dc297fa50cb6d7ee.txt';
const root = resolve(fileURLToPath(new URL('../marketing/', import.meta.url)));
const digest = (text) => createHash('sha256').update(text).digest('hex');
const nonAcquisition = new Set(['/one-recipe-demo', '/website-privacy']);

export function canonical(html) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  return links.find(tag => /\brel=["']canonical["']/i.test(tag))?.match(/\bhref=["']([^"']+)["']/i)?.[1];
}
export function noindex(html, header = '') {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return /\b(noindex|none)\b/i.test(header) || tags.some(tag =>
    /\bname=["'](?:robots|bingbot)["']/i.test(tag) &&
    /\bcontent=["'][^"']*\b(?:noindex|none)\b/i.test(tag));
}
export function prepare(urls, { directory = root } = {}) {
  if (!urls.length) throw new Error('Pass explicit added or updated public page URLs. No automatic sitemap submission.');
  const unique = [...new Set(urls)];
  if (unique.length > 10000) throw new Error('IndexNow permits at most 10,000 URLs per request.');
  const key = readFileSync(join(directory, KEY_FILE), 'utf8').trim();
  if (!/^[a-f0-9]{32}$/.test(key) || KEY_FILE !== key + '.txt') throw new Error('Ownership key file is invalid.');
  const sitemap = readFileSync(join(directory, 'sitemap.xml'), 'utf8');
  const known = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  const pages = unique.map(value => {
    const url = new URL(value);
    if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash || url.href !== value)
      throw new Error('Use exact HTTPS apex URLs without credentials, query strings or fragments.');
    if (!known.has(value) || nonAcquisition.has(url.pathname)) throw new Error('URL is not an eligible acquisition page in the sitemap: ' + value);
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1) + '.html';
    const html = readFileSync(join(directory, filename), 'utf8');
    if (canonical(html) !== value || noindex(html)) throw new Error('Source page must be indexable and self-canonical: ' + value);
    return { url: value, html };
  });
  return { payload: { host: new URL(ORIGIN).host, key, keyLocation: ORIGIN + '/' + KEY_FILE, urlList: pages.map(p => p.url) }, pages };
}
export async function submit(plan, { fetchImpl = fetch } = {}) {
  const options = { redirect: 'error', signal: AbortSignal.timeout(20000) };
  const keyResponse = await fetchImpl(plan.payload.keyLocation, options);
  if (keyResponse.status !== 200 || (await keyResponse.text()).trim() !== plan.payload.key)
    throw new Error('Live ownership key is not deployed. No notification sent.');
  for (const page of plan.pages) {
    const response = await fetchImpl(page.url, { ...options, signal: AbortSignal.timeout(20000) });
    const html = await response.text();
    if (response.status !== 200 || noindex(html, response.headers.get('x-robots-tag') || '') ||
        canonical(html) !== page.url || digest(html) !== digest(page.html))
      throw new Error('Live page does not match approved indexable source. No notification sent: ' + page.url);
  }
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(plan.payload),
  });
  const detail = response.status === 200 ? 'Notification accepted. Indexing is not confirmed.' :
    response.status === 202 ? 'Notification received; ownership key validation pending. Indexing is not confirmed.' :
    'Notification failed. No automatic retry.';
  const receipt = { timestamp: new Date().toISOString(), endpoint: ENDPOINT, status: response.status, urls: plan.payload.urlList, detail };
  if (![200, 202].includes(response.status)) throw Object.assign(new Error(detail + ' HTTP ' + response.status), { receipt });
  return receipt;
}
export async function main(args) {
  const send = args.includes('--submit');
  if (args.some(arg => arg.startsWith('--') && arg !== '--submit')) throw new Error('Unknown option. Only --submit is supported.');
  const plan = prepare(args.filter(arg => arg !== '--submit'));
  if (!send) return { mode: 'dry-run', urls: plan.payload.urlList, note: 'No network requests made. Add --submit only after approved production release.' };
  return submit(plan);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(JSON.stringify(error.receipt || { error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
