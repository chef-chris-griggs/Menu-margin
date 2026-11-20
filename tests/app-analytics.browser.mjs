import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';

const script = await readFile(resolve('js/app-analytics.js'));
const stylesheet = await readFile(resolve('styles/app-analytics.css'));
const html = '<!doctype html><html><head><title>Test app consent</title><link rel="stylesheet" href="/app-analytics.css"></head><body><main>Test</main><button id="tab-menu" style="position:fixed;right:8px;bottom:8px">Menu</button><script src="/app-analytics.js"></script></body></html>';
const server = createServer((req, res) => {
  if (req.url === '/app-analytics.css') {
    res.writeHead(200, {'content-type':'text/css'}).end(stylesheet);
  } else if (req.url === '/app-analytics.js') {
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
    await page.goto(origin + '/?token=secret#secret', {referer:'https://miseenprice.co.uk/sensitive?email=private%40example.com#token'});
    assert.equal(await page.getByRole('region', {name:'Optional app analytics'}).isVisible(), true);
    await page.locator('#tab-menu').click(); // Analytics controls must never intercept app navigation.
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
    assert.equal(locationCall[1].page_referrer, 'https://miseenprice.co.uk/');
    assert.doesNotMatch(JSON.stringify(before), /private%40example.com|sensitive|token=secret/);
    await page.evaluate(() => {
      window.mmAnalyticsTrack('signup_start', {method:'email'});
      window.mmAnalyticsTrack('sign_up', {method:'email'});
      window.mmAnalyticsTrack('trial_started', {trial_type:'cardless_14_day'});
      window.mmAnalyticsTrack('trial_cta_click');
      for (const event of ['first_recipe_saved','first_invoice_imported','first_recipe_saved']) window.mmTrackFirstUse(event, 'private-account');
    });
    const events = await page.evaluate(() => window.dataLayer.filter(a => a[0] === 'event').map(a => Array.from(a)));
    assert.deepEqual(events.map(e => e[1]), ['signup_start', 'sign_up', 'trial_started', 'first_recipe_saved', 'first_invoice_imported']);
    assert.doesNotMatch(JSON.stringify(events), /secret|email_address|account_id|private-account/);
    await page.getByRole('button', {name:'Analytics settings'}).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name:'Reject analytics'}).click()]);
    const after = await page.evaluate(() => ({disabled:window['ga-disable-G-E2DHD366MW'],tag:document.querySelector('#mep-app-google-tag')}));
    assert.equal(after.disabled, true);
    assert.equal(after.tag, null);
    assert.equal(thirdParty.length, 1, 'No Google calls after withdrawing consent');
    console.log('PASS app consent', engine.name());
    await context.close();

    // The marketing host's consent does not grant consent on this distinct
    // app hostname. An incoming linker must never bypass the app's choice.
    const handoff = await browser.newContext();
    const handoffRequests = [];
    await handoff.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      handoffRequests.push(route.request().url());
      return route.fulfill({status:200, body:'', contentType:'text/javascript'});
    });
    const landing = await handoff.newPage();
    await landing.goto(origin + '/?intent=trial&_gl=1~synthetic-linker', {
      referer:'https://miseenprice.co.uk/'
    });
    assert.equal(await landing.getByRole('region', {name:'Optional app analytics'}).isVisible(), true);
    await landing.evaluate(() => window.mmAnalyticsTrack('trial_started', {trial_type:'cardless_14_day'}));
    assert.deepEqual(handoffRequests, [], 'Marketing-only consent cannot load Google on the app host');
    assert.equal(await landing.evaluate(() => typeof window.gtag), 'undefined');
    await landing.getByRole('button', {name:'Accept analytics'}).click();
    await landing.waitForFunction(() => document.querySelector('#mep-app-google-tag'));
    const acceptedCalls = await landing.evaluate(() => window.dataLayer.map(a => Array.from(a)));
    assert.ok(acceptedCalls.some(a => a[0] === 'set' && a[1] === 'linker'),
      'Consented app tag configures cross-domain linker');
    assert.equal(acceptedCalls.filter(a => a[0] === 'event' && a[1] === 'trial_started').length, 0,
      'Consent must not retroactively manufacture an unconsented trial conversion');
    assert.equal(handoffRequests.length, 1, 'Only acceptance may load Google on app host');
    await handoff.close();
  } finally { await browser.close(); }
}
server.closeAllConnections();
await new Promise(ok => server.close(ok));
