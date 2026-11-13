import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
test('owner dashboard and trial messaging share a fresh PWA revision', () => {
 const html = source('index.html');
 const sw = source('sw.js');
 const auth = source('js/auth.js');
 assert.match(html, /id="mmOwnerDashboardLink" hidden/);
 assert.ok(html.includes('js/auth.js?v=2.1.5-trial-clarity'));
 assert.ok(sw.includes('js/auth.js?v=2.1.5-trial-clarity'));
 assert.match(sw, /v2\.0\.(?:5-trial-clarity|6-recipe-scanner|7-pricebook-suggestions)/);
 assert.ok(auth.includes('mmRefreshOwnerDashboardLink'));
 assert.ok(auth.includes("rpc('menu_margin_owner_signup_metrics')"));
});
test('access gate distinguishes optional trial from paid checkout without changing Stripe logic', () => {
 const html = source('index.html');
 const auth = source('js/auth.js');
 assert.ok(html.includes('£9.99/month'));
 assert.ok(html.includes('There is no automatic charge'));
 assert.ok(auth.includes('menu_margin_start_cardless_trial'));
 assert.ok(auth.includes("functions.invoke('create-checkout-session')"));
 assert.ok(auth.includes('Your free trial is unavailable or has already been used'));
});
