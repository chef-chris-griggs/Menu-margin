import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {chromium, webkit} from 'playwright';

const root = resolve('marketing');
const csp = (await readFile(resolve(root, '_headers'), 'utf8')).match(/Content-Security-Policy:\s*([^\r\n]+)/)[1];
assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    pathname = pathname === '/' ? '/index.html' : extname(pathname) ? pathname : pathname + '.html';
    const target = resolve(root, '.' + pathname);
    if (!target.startsWith(root + sep)) throw Error('Invalid path');
    const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png'};
    const body = await readFile(target);
    res.writeHead(200, {'content-type':mime[extname(target)] || 'application/octet-stream', 'content-security-policy':csp});
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;
const key = 'mep-analytics-consent-v1';
const errors = [];
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }

async function run(engine, width) {
  const browser = await engine.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width, height:900}});
    const external = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      external.push(url.href);
      if (url.hostname === 'www.googletagmanager.com') return route.fulfill({contentType:'text/javascript', body:'window.__testVendorLoads=(window.__testVendorLoads||0)+1;'});
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error' && /Content Security Policy|violates.*directive/i.test(e.text())) errors.push(e.text()); });
    await page.goto(origin + '/', {waitUntil:'networkidle'});
    check(await page.getByRole('region', {name:'Analytics cookies'}).isVisible(), 'New visitor sees choices');
    check(external.length === 0, 'No Google requests before consent');
    check((await context.cookies()).every(c => !c.name.startsWith('_ga')), 'No GA cookies before consent');
    await page.getByRole('button', {name:'Reject analytics', exact:true}).click();
    await page.reload({waitUntil:'networkidle'});
    check(external.length === 0, 'Rejected choice survives reload without Google requests');
    check(await page.getByRole('region', {name:'Analytics cookies'}).isHidden(), 'Rejected choice does not prompt on every page');
    await page.locator('#addIngredient').click();
    check(await page.locator('.demo-ingredient').count() === 4, 'Calculator works when analytics rejected');
    await page.getByRole('button', {name:'Cookie settings', exact:true}).click();
    await page.getByRole('button', {name:'Accept analytics', exact:true}).click();
    await page.waitForFunction(() => window.__testVendorLoads === 1);
    check(external.length === 1 && external[0].includes('id=GTM-T4NBD9N5'), 'Only exact supplied tag loads after acceptance');
    const consent = await page.evaluate(() => window.dataLayer.map(a => Array.from(a)));
    check(consent[0][0] === 'consent' && consent[0][1] === 'default' && consent[0][2].analytics_storage === 'denied', 'Default consent precedes initialization');
    check(consent[1][2].analytics_storage === 'granted' && consent[1][2].ad_storage === 'denied', 'Analytics-only consent, ads denied');
    await page.locator('#sellPrice').fill('11');
    await page.locator('#sellPrice').fill('12');
    const events = await page.evaluate(() => window.dataLayer.filter(a => a[0] === 'event').map(a => Array.from(a)));
    check(events.filter(e => e[1] === 'calculator_interaction').length === 1, 'One interaction event; default example is not use');
    check(!JSON.stringify(events).includes('11') && !JSON.stringify(events).includes('12'), 'No entered costs in custom events');
    await page.getByRole('button', {name:'Cookie settings', exact:true}).click();
    await page.getByRole('button', {name:'Accept analytics', exact:true}).click();
    check(await page.locator('#mep-google-tag').count() === 1, 'Repeated acceptance never duplicates tag');
    await context.addCookies([{name:'_ga', value:'test', url:origin}, {name:'_ga_X3MGXFTE3N', value:'test', url:origin}]);
    await page.getByRole('button', {name:'Cookie settings', exact:true}).click();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name:'Reject analytics', exact:true}).click()]);
    await page.waitForLoadState('networkidle');
    check((await context.cookies()).every(c => !c.name.startsWith('_ga')), 'Withdrawal removes GA cookies');
    check(external.length === 1 && await page.locator('#mep-google-tag').count() === 0, 'Withdrawal unloads Google and makes no new request');
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({value:'accepted',at:Date.now()-181*86400000})), key);
    await page.reload({waitUntil:'networkidle'});
    check(await page.getByRole('region', {name:'Analytics cookies'}).isVisible() && external.length === 1, 'Expired acceptance requires a new choice');
    const size = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, width:innerWidth}));
    check(size.scroll <= size.width + 2, 'Consent UI fits mobile/desktop');
    await context.close();

    // Storage failures must not crash the calculator or implicitly grant consent.
    const blocked = await browser.newContext({viewport:{width,height:900}});
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = function() { throw Error('Storage blocked'); };
      Storage.prototype.setItem = function() { throw Error('Storage blocked'); };
    });
    const requests = [];
    await blocked.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      requests.push(route.request().url()); return route.abort();
    });
    const deniedPage = await blocked.newPage();
    deniedPage.on('pageerror', e => errors.push(e.message));
    await deniedPage.goto(origin+'/', {waitUntil:'networkidle'});
    await deniedPage.getByRole('button', {name:'Reject analytics', exact:true}).click();
    check(requests.length === 0 && (await deniedPage.locator('#gpPercent').textContent()).includes('%'), 'Blocked storage keeps rejection and calculator functional');
    await blocked.close();
    console.log('PASS analytics consent', engine.name(), width, checks);
  } finally { await browser.close(); }
}

async function validateGoogleTag() {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const hits = [], unexpected = [], consoleErrors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname.endsWith('.google-analytics.com')) {
        // Verify real Google code emits GA4 requests without sending synthetic visits to production.
        hits.push({url:request.url(), body:request.postData() || ''});
        return route.fulfill({status:204});
      }
      if (url.hostname === 'www.googletagmanager.com') {
        const response = await route.fetch();
        check(response.ok(), 'Google tag library is accessible');
        return route.fulfill({response});
      }
      unexpected.push(request.url()); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error' && /Content Security Policy|violates.*directive/i.test(e.text())) consoleErrors.push(e.text()); });
    await page.goto(origin+'/?email=private%40example.invalid&utm_source=instagram&utm_campaign=cost_one_recipe#private-token', {waitUntil:'networkidle'});
    await page.getByRole('button', {name:'Accept analytics',exact:true}).click();
    const started = Date.now();
    while (!hits.some(h => (h.url+h.body).includes('G-X3MGXFTE3N')) && Date.now()-started<20000) await new Promise(ok=>setTimeout(ok,100));
    check(hits.some(h => (h.url+h.body).includes('G-X3MGXFTE3N')), 'Real tag routes to the correct GA4 measurement ID');
    await page.locator('#sellPrice').fill('9876.54');
    const interactionStarted = Date.now();
    while (!hits.some(h => (h.url+h.body).includes('calculator_interaction')) && Date.now()-interactionStarted<15000) await new Promise(ok=>setTimeout(ok,100));
    check(hits.some(h => (h.url+h.body).includes('calculator_interaction')), 'Real tag sends the custom calculator event');
    const payload = decodeURIComponent(hits.map(h => h.url+h.body).join('\n'));
    check(!payload.includes('private@example.invalid') && !payload.includes('private-token') && !payload.includes('9876.54'), 'Private URL parts and ingredient costs excluded from real requests');
    check(payload.includes('utm_source=instagram'), 'Campaign attribution survives URL sanitization');
    assert.deepEqual(unexpected, [], 'No advertising or unrelated destinations');
    assert.deepEqual(consoleErrors, [], 'No CSP errors from real Google tag');
    console.log('PASS real Google tag, correct GA4 destination; synthetic collection requests intercepted:',hits.length);
  } finally { await browser.close(); }
}

try {
  for (const engine of [chromium, webkit]) for (const width of [1440,390]) await run(engine, width);
  await validateGoogleTag();
  assert.deepEqual(errors, []);
  console.log('MARKETING ANALYTICS PASSED:', checks, 'assertions');
} finally { server.closeAllConnections(); await new Promise(ok=>server.close(ok)); }
