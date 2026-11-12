import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, webkit } from 'playwright';

const root = resolve('marketing');
const cloudflareHeaders = await readFile(resolve(root,'_headers'),'utf8');
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
      'invoice-scanning-for-chefs.html'
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
      const shot=await seo.locator('.premium-visual img').first().evaluate(i=>({ready:i.complete,width:i.naturalWidth,visible:!!i.getClientRects().length}));
      check(shot.ready&&shot.width>0&&shot.visible,slug+' product screenshot not loaded');
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
      } else {
        if (['restaurant-menu-pricing-guide.html','food-gp-calculator.html'].includes(slug)) {
          check(await seo.locator('a[href="./free-recipe-costing-calculator#try-recipe"]').count()>=1,slug+' dedicated calculator link missing');
        } else {
          check(await seo.locator('a[href="./#try-recipe"]').count()>=1,slug+' free calculator link missing');
        }
      }
      check(await seo.locator('a[href="https://menu-margin.pages.dev/"]').count()>=1,slug+' app trial link missing');
      const layout=await seo.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      check(layout.scroll<=layout.client+2,slug+' overflows '+viewport.width+'px: '+JSON.stringify(layout));
      check(issues.length===0,slug+' JavaScript errors '+issues.join('; '));
      await seo.close();
    }
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
