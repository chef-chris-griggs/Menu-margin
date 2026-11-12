import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');
test('owner dashboard updates PWA shell and script revision together', () => {
 const html=source('index.html');
 const sw=source('sw.js');
 const auth=source('js/auth.js');
 assert.match(html,/id="mmOwnerDashboardLink" hidden/);
 assert.match(html,/js\\/auth\\.js\\?v=2\\.1\\.5-trial-clarity/);
 assert.match(sw,/v2\.0\.5-trial-clarity/);
 assert.match(sw,/js\\/auth\\.js\\?v=2\\.1\\.5-trial-clarity/);
 assert.match(auth,/mmRefreshOwnerDashboardLink/);
 assert.match(auth,/rpc\('menu_margin_owner_signup_metrics'\)/);
});
