// First-use guidance with the real app and synthetic account/cloud responses.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),pw=require('playwright');
const browserName=process.argv.includes('--webkit')?'webkit':'chromium',checks=[],errors=[],external=[];
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(!/^(?:index\.html|privacy\.html|help\.html|terms\.html|styles\.css|sw\.js|manifest\.webmanifest|js\/|styles\/|icons\/|vendor\/)/.test(pathname))throw Error();
  const file=path.resolve(root,pathname);if(!file.startsWith(root))throw Error();
  res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await pw[browserName].launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/vendor/supabase/supabase.js')return route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>window.__testClient};'});
  if(url.origin===origin||url.protocol==='blob:')return route.continue();
  // Analytics is intentionally external; prevent network access during offline browser tests.
  if(url.origin==='https://static.cloudflareinsights.com'&&url.pathname==='/beacon.min.js')return route.fulfill({contentType:'text/javascript',body:'// Analytics intentionally omitted from this synthetic account fixture.'});
  external.push(route.request().url());return route.abort();
 });
 await context.addInitScript(()=>{
  let tick=0;window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>window.__online});
  const price={id:'10000000-0000-4000-8000-000000000001',name:'Butter',supplier:'Bidfood',code:'B1',price:10,packBase:1000,baseUnit:'g',sourcePackSize:1,sourceUnit:'kg',caseCount:1,unitPackSize:1,unitPackUnit:'kg',priceBasis:'ex_vat'};
  window.__db={recipes:[{id:'20000000-0000-4000-8000-000000000001',user_id:'account-a',name:'Mash',recipe_data:{name:'Mash',yield:4,sellingPrice:5,targetGp:70,ingredients:[{name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true}]},updated_at:'2026-10-01T00:00:00Z'}],price_book:[{id:price.id,user_id:'account-a',item_data:price,updated_at:'2026-10-01T00:00:00Z'}]};
  window.__testClient={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>{window.__signOutCalls=(window.__signOutCalls||0)+1;return window.__signOutError?{error:{message:'test sign-out failure'}}:{error:null}}},rpc:async()=>({data:false,error:null}),from(table){
   let action='read',body=null,start=0,end=Infinity;const filters=[];
   const query={select(){return query},eq(key,value){filters.push([key,value]);return query},order(){return query},range(a,b){start=a;end=b;return query},abortSignal(){return query},update(value){action='update';body=value;return query},delete(){action='delete';return query},upsert(value){action='upsert';body=value;return query},maybeSingle(){query.single=true;return query},then(resolve,reject){
    (async()=>{
     if(!window.__online)return {error:{message:'offline'}};
     if(window.__delayNext===action){window.__delayNext=null;await new Promise(r=>window.__release=r);}
     if(window.__failNextRead&&action==='read'){window.__failNextRead=false;return {error:{message:'interrupted read'}};}
     const matching=window.__db[table].filter(row=>filters.every(([key,value])=>row[key]===value));
     if(action==='read')return {data:query.single?matching[0]||null:matching.sort((a,b)=>a.id.localeCompare(b.id)).slice(start,Math.min(end+1,start+2)),count:matching.length,error:null};
     const stamp=new Date(Date.now()+ ++tick).toISOString();
     if(action==='upsert'){const index=window.__db[table].findIndex(row=>row.id===body.id);const value=structuredClone({...body,updated_at:stamp});if(index>=0)window.__db[table][index]=value;else window.__db[table].push(value);return {data:[{id:value.id,updated_at:stamp}],error:null};}
     if(action==='update'){for(const row of matching)Object.assign(row,structuredClone(body),{updated_at:stamp});return {data:matching.map(row=>({id:row.id,updated_at:stamp})),error:null};}
     window.__db[table]=window.__db[table].filter(row=>!matching.includes(row));return {data:matching.map(row=>({id:row.id})),error:null};
    })().then(resolve,reject);
   }};return query;
  }};
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 const progress=async value=>page.waitForFunction(n=>document.getElementById('firstUseProgress').textContent===n+' of 4 done',value);
 const openGuide=async()=>{if(!await page.locator('#firstUseDetails').evaluate(node=>node.open))await page.locator('#firstUseDetails>summary').click();};
 await page.goto(origin);await page.waitForFunction(()=>mmAppBooted);
 assert.equal(await page.locator('#firstUseGuide').isVisible(),false);
 await page.evaluate(()=>{
  // Preserve the existing synthetic record as a returning chef's separate account.
  __db.recipes[0].user_id='account-b';__db.recipes[0].name='Returning chef recipe';__db.recipes[0].recipe_data.name='Returning chef recipe';
  __db.price_book[0].user_id='account-b';__db.price_book[0].item_data.supplier='TEST supplier B';
  return mmEnterApp({id:'account-a',email:'new-chef@example.invalid'});
 });
 await page.locator('#firstUseGuide').waitFor({state:'visible'});await progress(0);
 assert.equal(await page.locator('.mobile-summary').isVisible(),false,'Expanded first-use help leaves the phone workspace clear');
 await page.locator('.first-use-all').evaluate(node=>node.open=true);
 for(const width of [320,390,430,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Full first-recipe steps fit '+width);}
 await page.locator('.first-use-all').evaluate(node=>node.open=false);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 assert.equal(await page.locator('#mmGlobalError').isVisible(),false);await mkdir(path.join(root,'reports/first-use'),{recursive:true});await page.screenshot({path:path.join(root,'reports/first-use/welcome-'+browserName+'.png')});
 assert.equal(await page.evaluate(()=>readLibrary().length),0);assert.equal(await page.evaluate(()=>readPriceBook().length),0);
 checks.push('Only an authenticated new account sees the automatic first-recipe guide');
 // Hiding/reopening reads existing state without writing preferences or records.
 await page.evaluate(()=>{window.__guideStorageWrites=[];window.__originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){__guideStorageWrites.push(key);return __originalStorageSet.call(this,key,value);};});
 await page.locator('[data-guide-action="hide"]').click();assert.equal(await page.locator('#firstUseGuide').isVisible(),false);
 await page.locator('#tab-menu').click();await page.locator('#firstUseShow').click();
 assert.equal(await page.locator('#view-costing').isVisible(),true);assert.equal(await page.locator('#firstUseGuide').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>__guideStorageWrites),[]);await page.evaluate(()=>{Storage.prototype.setItem=__originalStorageSet;});
 checks.push('Not now and Recipe guide preserve data and do not create persistent storage');
 await page.locator('#firstUseManual').click();
 await page.locator('#recipeName').fill('TEST olive oil recipe');await page.locator('#yield').fill('2');
 const row=page.locator('#ingredients tr').first();
 await row.locator('.ingredient').fill('TEST olive oil');await row.locator('.qty').fill('200');await row.locator('.qty-unit').selectOption('ml');await row.locator('.pack').fill('5');await row.locator('.pack-unit').selectOption('l');await row.locator('.price').fill('25');
 await progress(2);assert.equal(await page.evaluate(()=>readPriceBook().length),0);assert.equal(await page.locator('#batchCost').textContent(),'£1.00');
 await openGuide();await page.locator('#firstUseNextAction').click();assert.equal(await page.locator('#sellingPrice').evaluate(node=>node===document.activeElement),true);
 await page.locator('#sellingPrice').fill('5');await progress(3);assert.equal(await page.locator('#gpPct').textContent(),'90.0%');
 assert.equal(await page.evaluate(()=>readLibrary().length),0);assert.equal(await page.evaluate(()=>__db.recipes.filter(r=>r.user_id==='account-a').length),0);
 checks.push('Manual pack prices work without a supplier book; £1 batch / £0.50 portion / 90% GP remains unchanged and unsaved');
 // Invalid data never becomes a completed costing step or an early guided save.
 await row.locator('.qty-unit').selectOption('g');await progress(2);await openGuide();await page.locator('.first-use-all>summary').click();await page.locator('[data-guide-action="step-3"]').click();
 assert.equal(await page.evaluate(()=>readLibrary().length),0);assert.equal(await row.locator('.qty-unit').inputValue(),'g');
 await row.locator('.qty-unit').selectOption('ml');await progress(3);
 await row.locator('.price').fill('');await progress(1);await row.locator('.price').fill('-1');await progress(1);
 await row.locator('.price').fill('0');await progress(3);assert.equal(await page.locator('#batchCost').textContent(),'£0.00');
 await row.locator('.price').fill('25');await row.locator('.qty').fill('');await progress(2);await row.locator('.qty').fill('200');await progress(3);
 await page.locator('#addIngredient').click();await progress(3);const extra=page.locator('#ingredients tr').last();await extra.locator('.ingredient').fill('TEST missing ingredient');await progress(2);await extra.locator('.remove-row').click();await progress(3);
 checks.push('Incompatible units, missing/negative prices and missing quantities remain incomplete; explicit zero prices and untouched blank rows stay valid');
 // Existing device-save failure handling must not falsely complete the guide.
 await page.evaluate(()=>{const key=mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original;};let once=true;Storage.prototype.setItem=function(k,value){if(once&&k===key){once=false;throw Error('test first-use storage quota');}return original.call(this,k,value);};});
 await openGuide();await page.locator('#firstUseNextAction').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Could not save'));
 await page.evaluate(()=>__restoreStorage());await progress(3);assert.equal(await page.evaluate(()=>readLibrary().length),0);
 checks.push('Failed device saves retain the existing error and never mark the recipe saved');
 await openGuide();await page.locator('#firstUseNextAction').click();await progress(4);await page.waitForFunction(()=>!mmSyncing&&mmReadPending().length===0);
 const saved=await page.evaluate(()=>({id:currentRecipeId,data:readLibrary()[0]}));assert.ok(saved.id);assert.equal(saved.data.ingredients[0].qty,200);assert.equal(saved.data.ingredients[0].price,25);assert.equal(saved.data.ingredients[0].priceBookId,null);
 assert.equal(await page.evaluate(()=>__db.recipes.filter(r=>r.user_id==='account-a').length),1);assert.equal(await page.locator('#batchCost').textContent(),'£1.00');
 assert.equal(await page.locator('#firstUseDetails').evaluate(node=>node.open),false);
 await page.locator('#ingredients .qty').fill('201');await page.locator('#firstUseGuide').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>readLibrary()[0].ingredients[0].qty),200);assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 checks.push('Only explicit guided Save invokes the existing save; completion is real, and subsequent edits do not restart onboarding or overwrite the saved recipe');
 await page.evaluate(()=>mmEnterApp({id:'account-b',email:'returning-chef@example.invalid'}));await page.locator('#firstUseGuide').waitFor({state:'hidden'});
 assert.equal(await page.locator('#recipeName').inputValue(),'Returning chef recipe');assert.equal(await page.evaluate(()=>readLibrary().length),1);
 await page.locator('#tab-menu').click();await page.locator('#firstUseShow').click();await progress(4);
 assert.equal(await page.locator('#recipeName').inputValue(),'Returning chef recipe');assert.equal(await page.evaluate(()=>readPriceBook()[0].supplier),'TEST supplier B');
 checks.push('Returning accounts remain uncluttered; reopening help preserves their existing recipe and their own supplier book');
 await page.evaluate(()=>{__online=false;return mmEnterApp({id:'account-d',email:'offline-chef@example.invalid'});});
 await page.waitForFunction(()=>mmUser?.id==='account-d'&&mmCloudOffline);await page.locator('#firstUseGuide').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>readLibrary().length),0);
 await page.evaluate(()=>{__online=true;return mmRefreshCloud(true);});await page.locator('#firstUseGuide').waitFor({state:'visible'});await progress(0);
 await page.evaluate(()=>{__online=false;return mmEnterApp({id:'account-e',email:'explicit-offline-help@example.invalid'});});
 await page.waitForFunction(()=>mmUser?.id==='account-e'&&mmCloudOffline);await page.locator('#firstUseGuide').waitFor({state:'hidden'});
 await page.locator('#tab-menu').click();await page.locator('#firstUseShow').click();await progress(0);assert.equal(await page.locator('#firstUseGuide').isVisible(),true);
 await page.locator('[data-guide-action="hide"]').click();await page.evaluate(()=>{__online=true;return mmRefreshCloud(true);});await page.locator('#firstUseGuide').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>readLibrary().length),0);
 checks.push('An unknown empty offline cache never triggers automatic onboarding; explicit offline help and its dismissal survive reconnect without creating recipes');
 await page.evaluate(()=>mmEnterApp({id:'account-c',email:'another-new-chef@example.invalid'}));await page.locator('#firstUseGuide').waitFor({state:'visible'});await progress(0);
 assert.equal(await page.locator('#recipeName').inputValue(),'');assert.equal(await page.evaluate(()=>readPriceBook().length),0);
 await page.locator('#firstUseNextAction').click();assert.equal(await page.locator('#pricebookEditor').evaluate(node=>node.open),true);assert.equal(await page.locator('#pbName').evaluate(node=>node===document.activeElement),true);
 await page.locator('#pbName').fill('TEST salt');await page.locator('#pbSupplier').fill('TEST supplier C');await page.locator('#pbPack').fill('1');await page.locator('#pbUnit').selectOption('kg');await page.locator('#pbPrice').fill('4');await page.locator('#pbPriceBasis').selectOption('ex_vat');await page.locator('#pbSave').click();await progress(1);
 const product=await page.evaluate(()=>readPriceBook()[0]);assert.ok(product.id);
 await openGuide();await page.locator('#firstUseNextAction').click();await page.locator('#recipeName').fill('TEST unsaved salted dish');const linked=page.locator('#ingredients tr').first();await linked.locator('.ingredient').fill('TEST salt');await linked.locator('.qty').fill('100');await progress(2);
 assert.equal(await linked.getAttribute('data-price-book-id'),product.id);
 await openGuide();await page.locator('#firstUseNextAction').click();await page.locator('#sellingPrice').fill('5');await progress(3);
 await openGuide();await page.locator('[data-guide-action="hide"]').click();await page.locator('#tab-menu').click();await page.locator('#firstUseShow').click();await progress(3);
 assert.equal(await linked.getAttribute('data-price-book-id'),product.id);assert.equal(await linked.locator('.qty').inputValue(),'100');assert.equal(await page.locator('#recipeName').inputValue(),'TEST unsaved salted dish');assert.equal(await page.evaluate(()=>readLibrary().length),0);
 checks.push('Supplier-price onboarding uses the existing form and preserves selected supplier IDs, unsaved quantities and account isolation');
 for(const width of [320,390,430,768,1440]){await page.setViewportSize({width,height:900});for(const view of ['costing','recipes','pricebook','invoices','menu']){await page.locator('#tab-'+view).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guide/view fits '+width+' '+view);}}
 await page.setViewportSize({width:390,height:844});await page.locator('#tab-costing').click();await openGuide();await page.evaluate(()=>document.activeElement?.blur());await page.locator('#toast').waitFor({state:'hidden'});await mkdir(path.join(root,'reports/first-use'),{recursive:true});await page.screenshot({path:path.join(root,'reports/first-use/phone-'+browserName+'.png'),fullPage:true});
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('#firstUseGuide').isVisible(),false);await page.emulateMedia({media:'screen'});
 checks.push('All five tabs fit phone/tablet/desktop widths; the guide is excluded from printed output');
 await page.evaluate(()=>mmSignOut());await page.waitForFunction(()=>mmUser===null);assert.equal(await page.locator('#firstUseGuide').isVisible(),false);assert.equal(await page.locator('#firstUseShow').isVisible(),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result={browser:browserName,passed:true,checks,browserErrors:errors,externalRequests:external,scope:'Real app scripts with synthetic Auth/cloud only; no live account, email, billing or customer-data changes'};
 await writeFile(path.join(root,'reports/first-use/'+browserName+'.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
