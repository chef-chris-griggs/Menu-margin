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
    const target = resolve(root, '.' + (pathname==='/'?'/index.html':pathname));
    if (!(target === root || target.startsWith(root+sep))) {res.writeHead(403).end();return;}
    const contents = await readFile(target);
    res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store','content-security-policy':csp}).end(contents);
  } catch {res.writeHead(404).end('Not found');}
});
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
    check(await page.locator('.mep-proof-panel a[href*="privacy.html"]').count()===1,'privacy link missing');
    const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    check(width.scroll<=width.client+2,'horizontal overflow at '+viewport.width+'px: '+JSON.stringify(width));
    check(errors.length===0,'browser JS errors: '+errors.join(' | '));
    await page.close();
    console.log('PASS',browserType.name(),viewport.width+'x'+viewport.height,'checks',count,'screenshots',assetResults.map(x=>x.width+'x'+x.height).join(','));
  } finally {await browser.close();}
}
try {
  for(const engine of [chromium,webkit]) for(const viewport of [{width:1440,height:900},{width:390,height:844}]) await run(engine,viewport);
  console.log('MARKETING HOMEPAGE BROWSER TESTS PASSED:',count,'assertions');
} catch(err) {console.error('MARKETING HOMEPAGE BROWSER TEST FAILED:',err.stack||err);process.exitCode=1;}
finally {await new Promise(ok=>server.close(ok));}
