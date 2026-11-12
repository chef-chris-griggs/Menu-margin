import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'marketing');
const origin = 'https://miseenprice.co.uk';
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert(urls.length > 0, 'Sitemap must include public marketing pages');
assert.equal(new Set(urls).size, urls.length, 'Sitemap has duplicate URLs');
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt sitemap mismatch');

for (const url of urls) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, origin, `Sitemap has off-domain URL: ${url}`);
  assert(!parsed.search && !parsed.hash, `Sitemap URL has query or hash: ${url}`);
  assert(!parsed.pathname.endsWith('.html'), `Sitemap must use canonical extensionless URLs: ${url}`);
  const path = parsed.pathname === '/' ? 'index.html' : `${parsed.pathname.slice(1)}.html`;
  const file = join(root, path);
  assert(existsSync(file), `Sitemap page missing: ${path}`);
  const html = readFileSync(file, 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  assert(title && title.length > 15, `Missing or weak title: ${path}`);
  assert(description && description.length > 50, `Missing or weak meta description: ${path}`);
  assert.equal(canonical, url, `Canonical does not match sitemap: ${path}`);
  assert.equal((html.match(/<h1(?:\s|>)/gi) || []).length, 1, `Expected one H1: ${path}`);
  assert(!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html), `Sitemap contains noindex page: ${path}`);
}

const redirects = readFileSync(join(root, '_redirects'), 'utf8');
const redirectRules = redirects.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
for (const url of urls.filter((item) => item !== origin + '/')) {
  const canonicalPath = new URL(url).pathname;
  const expected = `${canonicalPath}.html ${canonicalPath} 301`;
  // Cloudflare Pages can canonicalise existing .html assets automatically.
  // Explicit rules are optional, but any rule present must target the canonical URL.
  const matching = redirectRules.filter((rule) => rule.split(/\s+/)[0] === `${canonicalPath}.html`);
  assert(matching.length <= 1, `Duplicate redirect rules for ${canonicalPath}.html`);
  if (matching.length) assert.equal(matching[0], expected, `Unexpected redirect target: ${matching[0]}`);
}

const homepage = readFileSync(join(root, 'index.html'), 'utf8');
assert(!/href="#"/.test(homepage), 'Homepage contains empty-fragment links; use / for home');
console.log(`SEO checks passed for ${urls.length} sitemap pages, canonicals, titles, descriptions, H1s, and robots.txt`);