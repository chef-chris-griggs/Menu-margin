import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';

const script = await readFile(resolve('js/app-analytics.js'));
const html = '<!doctype html><html><head><title>Test app consent</title></head><body><main>Test</main><script src="/app-analytics.js"></script></body></html>';
const server = createServer((req, res) => {
  if (req.url === '/app-analytics.js') {
    res.writeHead(200, {'content-type':'text/javascript'}).end(script);
  } else {
    res.writeHead(200, {'content-type':'text/html'}).end(html);
  }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext();
    const thirdParty = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      thirdParty.push(route.request().url());
      return route.fulfill({status:200, body:'', contentType:'text/javascript'});
    });
    const page = await context.newPage();
    await page.goto(origin + '/?token=secret#secret');
    assert.equal(await page.getByRole('region', {name:'Optional app analytics'}).isVisible(), true);
    assert.deepEqual(thirdParty, [], 'No third-party requests before consent');
    assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
    await page.getByRole('button', {name:'Reject analytics'}).click();
    await page.reload();
    assert.deepEqual(thirdParty, [], 'Rejection blocks Google after reload');
    await page.getByRole('button', {name:'Analytics settings'}).click();
    await page.getByRole('button', {name:'Accept analytics'}).click();
    await page.waitForFunction(() => document.querySelector('#mep-app-google-tag'));
    assert.equal(thirdParty.length, 1);
    assert.match(thirdParty[0], /googletagmanager.com\/gtag\/js\?id=G-E2DHD366MW/);
    const before = await page.evaluate(() => window.dataLayer.map(a => Array.from(a)));
    const locationCall = before.find(a => a[0] === 'set' && typeof a[1] === 'object' && a[1].page_location);
    assert.ok(locationCall);
    assert.equal(locationCall[1].page_location, origin + '/');
    await page.evaluate(() => {
      window.mmAnalyticsTrack('sign_up', {method:'email'});
      window.mmAnalyticsTrack('trial_started', {trial_type:'cardless_14_day'});
      window.mmAnalyticsTrack('trial_cta_click');
    });
    const events = await page.evaluate(() => window.dataLayer.filter(a => a[0] === 'event').map(a => Array.from(a)));
    assert.deepEqual(events.map(e => e[1]), ['sign_up', 'trial_started']);
    assert.doesNotMatch(JSON.stringify(events), /secret|email_address|account_id/);
    await page.getByRole('button', {name:'Analytics settings'}).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name:'Reject analytics'}).click()]);
    const after = await page.evaluate(() => ({disabled:window['ga-disable-G-E2DHD366MW'],tag:document.querySelector('#mep-app-google-tag')}));
    assert.equal(after.disabled, true);
    assert.equal(after.tag, null);
    assert.equal(thirdParty.length, 1, 'No Google calls after withdrawing consent');
    console.log('PASS app consent', engine.name());
    await context.close();
  } finally { await browser.close(); }
}
server.closeAllConnections();
await new Promise(ok => server.close(ok));
