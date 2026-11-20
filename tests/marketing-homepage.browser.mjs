import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('marketing');
const cloudflareHeaders = await readFile(resolve(root,'_headers'),'utf8');
if (!cloudflareHeaders.includes('Referrer-Policy: strict-origin-when-cross-origin')) throw new Error('Website must pass only origin to the app for attribution');
const csp = cloudflareHeaders.match(/Content-Security-Policy:\s*([^\r\n]+)/)?.[1];
if (!csp) throw new Error('Cloudflare CSP header missing');
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml' };
const server = createServer(async (req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filePath = pathname==='/'?'/index.html':(!extname(pathname)?pathname+'.html':pathname);
    const target = resolve(root, '.' + filePath);
    if (!(target === root || target.startsWith(root+sep))) {res.writeHead(403).end();return;}
    const contents = await readFile(target);
    res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store','content-security-policy':csp}).end(contents);
  } catch {res.writeHead(404).end('Not found');}
});
// Verify the indexable URL inventory before testing interactions.
const sitemap = await readFile(resolve(root,'sitemap.xml'),'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
const titles = new Set();
for (const url of sitemapUrls) {
  const pathname = new URL(url).pathname;
  const html = await readFile(resolve(root, pathname==='/'?'index.html':pathname.slice(1)+'.html'),'utf8');
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  if (!title || titles.has(title)) throw new Error('Missing or duplicate title: '+url);
  titles.add(title);
  if (!html.includes('href="'+url+'"')) throw new Error('Missing self canonical: '+url);
  if (/<style[\s>]| style=/i.test(html)) throw new Error('Styles blocked by production CSP: '+url);
  if (/noindex/i.test(html)) throw new Error('Indexable sitemap URL contains noindex: '+url);
}
const notFound = await readFile(resolve(root,'404.html'),'utf8');
if (!notFound.includes('noindex, follow')) throw new Error('404 page must not be indexed');

const port = await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',()=>ok(server.address().port)).on('error',fail));
const origin = 'http://127.0.0.1:'+port;
let count=0;
function check(condition,message){if(!condition)throw new Error(message);count++;}
async function run(browserType,viewport) {
  const browser = await browserType.launch({headless:true});
  try {
    const page=await browser.newPage({viewport,deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('mep-analytics-consent-v1',JSON.stringify({value:'rejected',at:Date.now()})));
    const response=await page.goto(origin+'/',{waitUntil:'networkidle'});
    check(response.status()===200,'homepage did not return 200');
    check(response.headers()['content-security-policy']?.includes("script-src 'self'"),'Cloudflare CSP does not allow local calculator JavaScript');
    check(await page.title() === 'Recipe Costing Software for UK Chefs | Mise en Price','wrong homepage title');
    check(await page.locator('img[src="./miseenprice-logo.svg"]').count()>=1,'missing branded logo');
    check(await page.locator('#hero-title').isVisible(),'missing homepage headline');
    const assetResults=await page.locator('.mep-screen img').evaluateAll(imgs=>imgs.map(i=>({url:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0,width:i.naturalWidth,height:i.naturalHeight})));
    check(assetResults.length===3 && assetResults.every(x=>x.ok),'real screenshot assets missing: '+JSON.stringify(assetResults));
    check(await page.locator('.mep-screen').count()===3,'iPhone frames missing');
    const ratio=await page.locator('.mep-screen').first().evaluate(e=>e.offsetHeight/e.offsetWidth);
    check(ratio>=1.8&&ratio<=2.7,'unrealistic iPhone mockup ratio '+ratio);
    check(await page.locator('#demoForm').isVisible(),'real free recipe calculator not visible');
    await page.waitForFunction(()=>document.querySelector('#gpPercent')?.textContent?.includes('%'));
    check((await page.locator('#batchCost').textContent())==='£5.20','initial demo batch cost incorrect');
    check((await page.locator('#portionCost').textContent())==='£0.52','initial demo per-portion cost incorrect');
    check((await page.locator('#gpPercent').textContent())==='89.6%','initial demo GP incorrect');
    await page.locator('#sellPrice').fill('10');
    check((await page.locator('#gpPercent').textContent())==='94.8%','changing sale price did not update GP');
    // Blank and zero ex-VAT prices cannot produce a meaningful GP percentage.
    for (const value of ['', '0']) {
      await page.locator('#sellPrice').fill(value);
      check((await page.locator('#demoError').textContent()).includes('selling price greater than zero'),'blank or zero selling price incorrectly accepted: '+JSON.stringify(value));
      for (const id of ['batchCost','portionCost','gpValue','gpPercent']) {
        check((await page.locator('#'+id).textContent())==='—','invalid sale price displayed misleading '+id);
      }
    }
    await page.locator('#sellPrice').fill('10');
    check((await page.locator('#demoError').textContent())==='','valid selling price did not recover');
    check((await page.locator('#gpPercent').textContent())==='94.8%','restored selling price GP incorrect');
    await page.locator('#portions').fill('');
    check((await page.locator('#demoError').textContent()).includes('valid portion count'),'blank portions accepted as zero');
    check((await page.locator('#gpPercent').textContent())==='—','blank portions displayed GP');
    await page.locator('#portions').fill('0');
    check((await page.locator('#demoError').textContent()).includes('valid portion count'),'zero portions accepted');
    check((await page.locator('#gpPercent').textContent())==='—','zero portions displayed GP');
    await page.locator('#portions').fill('1.5');
    check((await page.locator('#demoError').textContent()).includes('valid portion count'),'fractional portions accepted');
    check((await page.locator('#gpPercent').textContent())==='—','fractional portions displayed GP');
    await page.locator('#portions').fill('10');
    check((await page.locator('#gpPercent').textContent())==='94.8%','restored portions GP incorrect');
    const firstPrice=page.locator('.demo-ingredient').first().locator('input[type="number"]').nth(2);
    await firstPrice.fill('');
    check((await page.locator('#demoError').textContent()).includes('pack price'),'blank pack price was silently treated as free');
    for (const id of ['batchCost','portionCost','gpValue','gpPercent']) {
      check((await page.locator('#'+id).textContent())==='—','blank pack price left a misleading '+id);
    }
    await firstPrice.fill('0');
    check((await page.locator('#demoError').textContent())==='','intentional zero pack price was rejected');
    check((await page.locator('#batchCost').textContent())==='£2.00','intentional zero pack price calculated incorrectly');
    await firstPrice.fill('8');
    check((await page.locator('#batchCost').textContent())==='£5.20','batch cost did not recover after restoring pack price');
    check((await page.locator('#gpPercent').textContent())==='94.8%','GP did not recover after restoring pack price');
    await page.locator('#addIngredient').click();
    check(await page.locator('.demo-ingredient').count()===4,'add ingredient failed');
    check(await page.locator('.demo-new-ingredient').count()===1,'new ingredient not highlighted');
    check(await page.locator('#demoAddStatus').textContent()==='Ingredient added. Enter a name and pack details.','ingredient feedback not shown');
    check(await page.locator('.demo-ingredient').last().locator('input[type="text"]').evaluate(e=>document.activeElement===e),'new ingredient name not focused');
    check((await page.locator('#demoError').textContent()).includes('Complete each ingredient'),'invalid empty row was not rejected');
    await page.locator('.demo-ingredient').last().getByRole('button',{name:'Remove ingredient'}).click();
    check(await page.locator('.demo-ingredient').count()===3,'remove ingredient failed');
    check((await page.locator('#gpPercent').textContent())==='94.8%','GP did not recover after row removed');
    const second=page.locator('.demo-ingredient').nth(1);
    await second.locator('select').first().selectOption('ml');
    check((await page.locator('#demoError').textContent()).includes('units must match'),'unit-family mismatch not rejected');
    await second.locator('select').first().selectOption('kg');
    check((await page.locator('#demoError').textContent())==='','valid units did not recover');
    const trialEntry=await page.getByRole('link',{name:/Start your free 14-day trial/i}).first().getAttribute('href');
    check(trialEntry==='https://menu-margin.pages.dev/?intent=trial','Hero trial CTA must signal account creation intent');
    const trialUrls=await page.locator('a[href*="menu-margin.pages.dev"]').evaluateAll(links=>links.map(a=>a.href));
    check(trialUrls.length>=3&&trialUrls.every(x=>x.startsWith('https://menu-margin.pages.dev/')),'trial/signup links invalid');
    check(await page.locator('#pricing').isVisible(),'pricing section missing');
    check(await page.locator('#faq-title').isVisible(),'FAQ missing');
    check(await page.locator('.mep-proof-panel a[href="/website-privacy"]').count()===1,'privacy link missing');
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    check(width.scroll<=width.client+2,'horizontal overflow at '+viewport.width+'px: '+JSON.stringify(width));
    check(errors.length===0,'browser JS errors: '+errors.join(' | '));
    const seoPages = [
      'free-recipe-costing-calculator.html',
      'restaurant-menu-pricing-guide.html',
      'restaurant-supplier-price-tracking.html',
      'catering-recipe-costing.html',
      'recipe-costing-software.html',
      'invoice-scanning-for-chefs.html',
      'recipe-scanning-for-chefs.html'
    ];
    for (const slug of seoPages) {
      const seo = await browser.newPage({viewport,deviceScaleFactor:1});
      const issues = [];
      seo.on('pageerror', e=>issues.push(e.message));
      seo.on('console', e=>{if(e.type()==='error' && /Content Security Policy|violates.*directive/i.test(e.text())) issues.push(e.text());});
      const reply = await seo.goto(origin+'/'+slug,{waitUntil:'networkidle'});
      check(reply.status()===200,slug+' HTTP status is not 200');
      check(await seo.locator('h1').count()===1,slug+' needs one H1');
      check(await seo.locator('h1').isVisible(),slug+' H1 not visible');
      check(await seo.locator('link[rel="canonical"]').getAttribute('href')==='https://miseenprice.co.uk/'+slug.replace(/\.html$/,''),slug+' canonical changed');
      check(await seo.locator('img[src="./miseenprice-logo.svg"]').first().isVisible(),slug+' branded logo missing');
      check(await seo.locator('link[href="./seo-premium.css"]').count()===1,slug+' premium stylesheet missing');
      if (slug !== 'recipe-scanning-for-chefs.html') {
        const shot=await seo.locator('.premium-visual img').first().evaluate(i=>({ready:i.complete,width:i.naturalWidth,visible:!!i.getClientRects().length}));
        check(shot.ready&&shot.width>0&&shot.visible,slug+' product screenshot not loaded');
      }
      if (slug === 'free-recipe-costing-calculator.html') {
        check(await seo.locator('a[href="#try-recipe"]').count()>=1,slug+' in-page calculator link missing');
        check(await seo.locator('#demoForm').isVisible(),slug+' real calculator not visible');
        await seo.waitForFunction(()=>document.querySelector('#gpPercent')?.textContent?.includes('%'));
        check((await seo.locator('#batchCost').textContent())==='£5.20',slug+' incorrect initial batch cost');
        check((await seo.locator('#gpPercent').textContent())==='89.6%',slug+' incorrect initial GP');
        await seo.locator('#addIngredient').click();
        check(await seo.locator('.demo-ingredient').count()===4,slug+' add-ingredient action failed');
        await seo.locator('.demo-ingredient').last().locator('input[type="text"]').fill('Butter');
        check((await seo.locator('#demoError').textContent())==='',slug+' valid added ingredient rejected');
        await seo.locator('#sellPrice').fill('0');
        check((await seo.locator('#demoError').textContent()).includes('selling price greater than zero'),slug+' zero selling price accepted');
        await seo.locator('#sellPrice').fill('5');
        await seo.locator('.demo-ingredient').last().locator('.demo-remove').click();
        check(await seo.locator('.demo-ingredient').count()===3,slug+' remove-ingredient action failed');
        check((await seo.locator('#gpPercent').textContent())==='89.6%',slug+' GP did not recover');
        // Reproduce the visible worked example in the actual calculator.
        const exampleRows = await seo.locator('#soup-costing-ingredients tbody tr').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.textContent.trim())));
        check(exampleRows.length===9, 'worked example needs all nine ingredients, including bread and butter');
        check(await seo.locator('.walkthrough-disclosure').textContent().then(t=>t.includes('Illustrative example.')&&t.includes('sample pack prices')&&t.includes('assumed yield')), 'sample prices must be disclosed');
        const measure = text => { const m=text.match(/^([\d.]+) (kg|g|ml|l|each)$/); if(!m)throw Error('Invalid worked quantity: '+text);return {value:m[1],unit:m[2],base:Number(m[1])*(m[2]==='kg'||m[2]==='l'?1000:1)}; };
        let exampleTotal=0;
        for(const [name,used,pack,price,cost] of exampleRows){
          const calculated=measure(used).base/measure(pack).base*Number(price.replace('£',''));
          check(Math.abs(calculated-Number(cost.replace('£','')))<0.000001, 'incorrect visible ingredient cost: '+name);
          exampleTotal+=calculated;
        }
        check(Math.abs(exampleTotal-24)<0.000001, 'visible ingredient table must total £24');
        while(await seo.locator('.demo-ingredient').count()) await seo.locator('.demo-remove').first().click();
        for(const [name,used,pack,price] of exampleRows){
          await seo.locator('#addIngredient').click();
          const row=seo.locator('.demo-ingredient').last(), usedQty=measure(used), packQty=measure(pack);
          await row.locator('input[type="text"]').fill(name);
          await row.locator('input[type="number"]').nth(0).fill(usedQty.value);
          await row.locator('select').nth(0).selectOption(usedQty.unit);
          await row.locator('input[type="number"]').nth(1).fill(packQty.value);
          await row.locator('select').nth(1).selectOption(packQty.unit);
          await row.locator('input[type="number"]').nth(2).fill(price.replace('£',''));
        }
        await seo.locator('#portions').fill('20');
        await seo.locator('#sellPrice').fill('4');
        check(await seo.locator('#batchCost').textContent()==='£24.00', 'worked example batch cost');
        check(await seo.locator('#portionCost').textContent()==='£1.20', 'worked example portion cost');
        check(await seo.locator('#gpValue').textContent()==='£2.80', 'worked example cash GP');
        check(await seo.locator('#gpPercent').textContent()==='70.0%', 'worked example GP');
        await seo.locator('#portions').fill('18');
        check(await seo.locator('#portionCost').textContent()==='£1.33', 'reduced yield must change portion cost');
        await seo.locator('#portions').fill('20');
        await seo.locator('.demo-ingredient').first().locator('input[type="number"]').nth(2).fill('15');
        check(await seo.locator('#batchCost').textContent()==='£26.00', 'tomato pack increase must add £2 to batch');
        check(await seo.locator('#portionCost').textContent()==='£1.30', 'changed-price portion cost');
        check(await seo.locator('#gpPercent').textContent()==='67.5%', 'changed-price GP');
        check(Math.ceil((1.30/(1-0.70))*100)/100===4.34, 'target selling price must round upwards');
        check((4.33-1.30)/4.33*100<70, '£4.33 does not reach the unrounded target');
        check(await seo.locator('.costing-walkthrough').textContent().then(t=>t.includes('£4.34')&&t.includes('2.5 percentage points')), 'written target/GP change explanation');
        const exampleTableLayout=await seo.locator('.walkthrough-table-scroll').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,overflow:getComputedStyle(e).overflowX}));
        check(exampleTableLayout.overflow==='auto', 'mobile table must scroll within its container');
      } else {
        if (slug === 'recipe-scanning-for-chefs.html') {
          check(await seo.locator('a[href="/free-recipe-costing-calculator#try-recipe"]').count()===1,slug+' public calculator link missing');
          check(await seo.locator('#review-title').isVisible(),slug+' manual review explanation missing');
        } else if (['restaurant-menu-pricing-guide.html','food-gp-calculator.html'].includes(slug)) {
          check(await seo.locator('a[href="./free-recipe-costing-calculator#try-recipe"]').count()>=1,slug+' dedicated calculator link missing');
          if (slug === 'restaurant-menu-pricing-guide.html') {
            const cells = await seo.locator('#menu-pricing-example td').allTextContents();
            const number = text => Number(text.match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
            const cost = number(cells[0]), target = number(cells[1]), price = number(cells[2]);
            check(Number.isFinite(cost) && cost > 0 && target > 0 && target < 100 && price > 0, 'menu pricing example needs valid visible inputs');
            check((price-cost)/price*100 >= target, 'published menu price must actually meet its target GP');
            check((price-0.01-cost)/(price-0.01)*100 < target, 'menu price should be the minimum whole-penny price meeting the target');
            check(await seo.locator('#menu-costing-definition').isVisible(), 'menu costing definition missing');
            check(await seo.locator('a[href="./free-recipe-costing-calculator#soup-costing-walkthrough"]').count() === 1, 'menu guide needs the existing whole-dish costing example');
          }
        } else if (slug === 'recipe-costing-software.html') {
          check(await seo.locator('a[href="/free-recipe-costing-calculator#try-recipe"]').count()>=1,slug+' dedicated calculator link missing');
        } else if (slug === 'catering-recipe-costing.html') {
          check(await seo.locator('a[href="./free-recipe-costing-calculator#try-recipe"]').count()>=2,slug+' both calculator actions must reach the dedicated page');
          check(await seo.locator('a[href="./#try-recipe"]').count()===0,slug+' legacy homepage calculator link remains');
        } else {
          check(await seo.locator('a[href="./free-recipe-costing-calculator#try-recipe"]').count()>=1,slug+' free calculator link missing');
        }
      }
      check(await seo.locator('a[href="https://menu-margin.pages.dev/?intent=trial"]').count()>=1,slug+' app trial link missing');
      const layout=await seo.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      check(layout.scroll<=layout.client+2,slug+' overflows '+viewport.width+'px: '+JSON.stringify(layout));
      check(issues.length===0,slug+' JavaScript errors '+issues.join('; '));
      await seo.close();
    }
    const legacy = await browser.newPage({viewport,deviceScaleFactor:1});
    await legacy.goto(origin+'/one-recipe-demo', {waitUntil:'networkidle'});
    check(await legacy.locator('link[rel="canonical"]').getAttribute('href')==='https://miseenprice.co.uk/free-recipe-costing-calculator', 'legacy demo canonical must point to the fuller calculator');
    check(await legacy.locator('#demoForm').isVisible(), 'legacy demo must stay usable');
    await legacy.waitForFunction(()=>document.querySelector('#gpPercent')?.textContent?.includes('%'));
    check(await legacy.locator('#batchCost').textContent()==='£5.20', 'legacy batch calculation changed');
    await legacy.locator('#sellPrice').fill('10');
    check(await legacy.locator('#gpPercent').textContent()==='94.8%', 'legacy GP interaction changed');
    await legacy.locator('#addIngredient').click();
    check(await legacy.locator('.demo-ingredient').count()===4, 'legacy add ingredient failed');
    await legacy.locator('.demo-ingredient').last().getByRole('button',{name:'Remove ingredient'}).click();
    check(await legacy.locator('.demo-ingredient').count()===3, 'legacy remove ingredient failed');
    await legacy.close();
    const templatePage = await browser.newPage({viewport,deviceScaleFactor:1});
    const templateErrors=[];
    templatePage.on('pageerror', e=>templateErrors.push(e.message));
    templatePage.on('console', e=>{if(e.type()==='error' && /Content Security Policy|violates.*directive/i.test(e.text())) templateErrors.push(e.text());});
    const templateResponse=await templatePage.goto(origin+'/recipe-costing-spreadsheet-template.html',{waitUntil:'networkidle'});
    check(templateResponse.status()===200,'template page not found');
    check(await templatePage.locator('h1').count()===1,'template page H1 missing');
    check(await templatePage.locator('link[rel="canonical"]').getAttribute('href')==='https://miseenprice.co.uk/recipe-costing-spreadsheet-template','template canonical wrong');
    check(await templatePage.locator('img[src="./miseenprice-logo.svg"]').first().isVisible(),'template brand missing');
    check(await templatePage.locator('a[href="./recipe-costing-template.csv"]').count()===1,'CSV download link missing');
    const csvResponse=await templatePage.request.get(origin+'/recipe-costing-template.csv');
    check(csvResponse.status()===200,'CSV file not served');
    const csvBody=await csvResponse.text();
    check(csvBody.includes('Ingredient cost GBP') && csvBody.includes('IF(COUNT(C2:E2)<>3') && csvBody.includes('COUNT(F2:F5)<>4') && csvBody.includes('I2<=0'), 'CSV guarded costing formulas or headers missing');
    const templateWidth=await templatePage.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    check(templateWidth.scroll<=templateWidth.client+2,'template mobile overflow '+viewport.width+': '+JSON.stringify(templateWidth));
    check(await templatePage.locator('.template-hero').evaluate(e=>parseFloat(getComputedStyle(e).borderRadius))===22,'template stylesheet blocked or missing');
    check(templateErrors.length===0,'template browser errors '+templateErrors.join('; '));
    await templatePage.close();
    await page.close();
    console.log('PASS',browserType.name(),viewport.width+'x'+viewport.height,'checks',count,'screenshots',assetResults.map(x=>x.width+'x'+x.height).join(','));
  } finally {await browser.close();}
}
try {
  for(const engine of [chromium,webkit]) for(const viewport of [{width:1440,height:900},{width:390,height:844}]) await run(engine,viewport);
  console.log('MARKETING HOMEPAGE BROWSER TESTS PASSED:',count,'assertions');
} catch(err) {console.error('MARKETING HOMEPAGE BROWSER TEST FAILED:',err.stack||err);process.exitCode=1;}
finally {await new Promise(ok=>server.close(ok));}
