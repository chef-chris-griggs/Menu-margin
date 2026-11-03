// One-off release guard against the production baseline before this rebrand.
// Keep internal MenuMargin identifiers: they are compatibility contracts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const baseline = 'bf2c0e1334e7a530e77b44293953e052e99f2927';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const old = file => git('show', `${baseline}:${file}`);
const current = file => readFileSync(file, 'utf8');
const locked = ['js/invoice.js', 'js/pricing.js', 'js/cloud-data.js', 'js/auth.js', 'js/auth-recovery.js', '_headers', 'scanner', 'vendor', 'supabase', 'styles/invoice-scanner.css'];
assert.equal(git('diff', baseline, '--', ...locked), '', 'Scanner, billing, auth, database, security headers and costing must remain byte-identical');
const jsFiles = git('ls-tree', '-r', '--name-only', baseline, 'js').trim().split('\n').filter(f => f.endsWith('.js'));
for (const file of jsFiles) assert.equal(current(file).replaceAll('Mise en Price', 'MenuMargin'), old(file), `${file}: only visible brand strings may change`);
const before = JSON.parse(old('manifest.webmanifest'));
const after = JSON.parse(current('manifest.webmanifest'));
for (const key of ['name', 'short_name']) { delete before[key]; delete after[key]; }
assert.deepEqual(after, before, 'PWA identity, start URL, scope and behaviour must stay unchanged');
const controls = s => [...s.matchAll(/<(?:input|button|select|textarea|form)\b[^>]*>/g)].map(m => m[0]);
assert.deepEqual(controls(current('index.html')), controls(old('index.html')), 'Every form control, ID, type and validation attribute must remain unchanged');
const scripts = s => [...s.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0]);
assert.deepEqual(scripts(current('index.html')), scripts(old('index.html')), 'Script loading and ordering must remain unchanged');
const normalizeSW = s => s.replaceAll('Mise en Price', 'MenuMargin').replace(/v2\.0\.3-mise-en-price/g, 'v2.0.2-scanner-csp').replaceAll('styles.css?v=1.0.7', 'styles.css?v=1.0.6');
assert.equal(normalizeSW(current('sw.js')), old('sw.js'), 'Service worker may only refresh brand cache and text');
const page = current('marketing/index.html');
assert.ok(page.includes('noindex, nofollow'), 'Unclaimed domain marketing page stays noindex');
assert.ok(!/<script\b|<form\b/i.test(page), 'Marketing has no auth, payment, tracking or form logic');
assert.ok(!/href="https?:\/\/(?:www\.)?miseenprice\.co\.uk/.test(page), 'No links depend on ownership of the domain');
const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const [,href] of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (href === '#') continue;
  if (href.startsWith('#')) assert.ok(ids.has(href.slice(1)), `Missing anchor ${href}`);
  else if (href.startsWith('./')) assert.ok(existsSync(`marketing/${href.slice(2)}`), `Missing asset ${href}`);
  else assert.ok(['https://menu-margin.pages.dev/', 'https://menu-margin.pages.dev/help.html', 'https://menu-margin.pages.dev/privacy.html', 'https://menu-margin.pages.dev/terms.html'].includes(href), `Unexpected external destination ${href}`);
}
console.log(`PASS: ${jsFiles.length} JavaScript files allow branding text only; scanner/backend/auth/pricing assets byte-identical; PWA identity, controls, scripts, storage and SW behaviour preserved; marketing assets and links validated.`);
