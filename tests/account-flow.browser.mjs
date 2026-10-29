import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),pw=require('playwright');
const browserName=process.argv.includes('--webkit')?'webkit':'chromium',checks=[],errors=[],external=[];
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
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
  if(url.origin===origin||url.protocol==='blob:')return route.continue();external.push(route.request().url());return route.abort();
 });
 await context.addInitScript(()=>{
  let tick=0;window.__online=true;Object.defineProperty(navigator,'onLine',{get:()=>window.__online});
  const price={id:'10000000-0000-4000-8000-000000000001',name:'Butter',supplier:'Bidfood',code:'B1',price:10,packBase:1000,baseUnit:'g',sourcePackSize:1,sourceUnit:'kg',caseCount:1,unitPackSize:1,unitPackUnit:'kg',priceBasis:'ex_vat'};
  window.__db={recipes:[{id:'20000000-0000-4000-8000-000000000001',user_id:'account-a',name:'Mash',recipe_data:{name:'Mash',yield:4,sellingPrice:5,targetGp:70,ingredients:[{name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true}]},updated_at:'2026-10-01T00:00:00Z'}],price_book:[{id:price.id,user_id:'account-a',item_data:price,updated_at:'2026-10-01T00:00:00Z'}]};
  window.__testClient={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>window.__signOutError?{error:{message:'test sign-out failure'}}:{error:null}},rpc:async()=>({data:false,error:null}),from(table){
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
 await page.goto(origin);await page.waitForFunction(()=>mmAppBooted);
 await page.evaluate(()=>mmEnterApp({id:'account-a',email:'test@example.invalid'}));
 assert.equal(await page.locator('#ingredients .price').inputValue(),'10');checks.push('full application boots with the production account and pricing scripts');
 await page.evaluate(()=>{for(let i=2;i<=7;i++)__db.price_book.push({...structuredClone(__db.price_book[0]),id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),item_data:{...__db.price_book[0].item_data,name:'Test ingredient '+i}});});
 await page.locator('#mmRefreshCloud').click();await page.waitForFunction(()=>!mmRefreshPromise);
 assert.equal(await page.evaluate(()=>readPriceBook().length),7);checks.push('production account load traverses every server-capped page');
 await page.locator('#recipeName').fill('A device save that must fail');
 const originalCache=await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id)));
 await page.evaluate(async()=>{
  const original=Storage.prototype.setItem;let once=true;
  Storage.prototype.setItem=function(key,value){if(once&&key===mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id)){once=false;throw Error('test storage quota')}return original.call(this,key,value)};
  try{await saveCurrentRecipe()}finally{Storage.prototype.setItem=original}
 });
 assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id))),originalCache);assert.match(await page.locator('#toast').textContent(),/Could not save/);
 checks.push('device storage failure keeps the prior recipe and never claims it was saved');
 await page.locator('#ingredients .qty').fill('250');await page.locator('#recipeName').fill('Mash — unsaved');
 await page.evaluate(()=>{__db.price_book[0].item_data.price=12;__db.price_book[0].updated_at='2026-10-29T17:00:00Z';return mmRefreshCloud(true)});
 assert.equal(await page.locator('#ingredients .price').inputValue(),'12');assert.equal(await page.locator('#ingredients .qty').inputValue(),'250');assert.equal(await page.locator('#recipeName').inputValue(),'Mash — unsaved');assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 checks.push('another phone’s price update refreshes linked recipes without overwriting unsaved editor changes');
 const before=await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id)));
 await page.evaluate(()=>{__failNextRead=true;return mmRefreshCloud(true)});
 assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id))),before);assert.match(await page.locator('#mmCloudStatus').textContent(),/Refresh failed/);
 checks.push('failed cloud refresh keeps the complete previous cache and gives a retry message');
 await page.evaluate(()=>{__online=false;return saveCurrentRecipe()});
 assert.match(await page.locator('#recipeStateCaption').textContent(),/device/);assert.ok(await page.evaluate(()=>mmReadPending().length));
 checks.push('offline save stays queued and never claims cloud-save success');
 await page.evaluate(()=>{__online=true;return mmRefreshCloud(true)});
 assert.equal(await page.evaluate(()=>mmReadPending().length),0);assert.match(await page.locator('#recipeStateCaption').textContent(),/account/);
 checks.push('reconnect uploads the queued recipe and confirms the server save');
 await page.evaluate(()=>{mmCloudReady=true;__online=false;return saveCurrentRecipe()});
 assert.match(await page.locator('#toast').textContent(),/device/);checks.push('a connection lost after cloud readiness cannot produce a false success toast');
 await page.evaluate(()=>{__online=true;return mmRefreshCloud(true)});
 await page.evaluate(()=>{__delayNext='read';window.__refresh=mmRefreshCloud(true)});await page.waitForFunction(()=>typeof __release==='function');
 await page.locator('#ingredients .qty').fill('400');await page.evaluate(()=>{__release();__release=null;return __refresh});
 assert.equal(await page.locator('#ingredients .qty').inputValue(),'400');assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 checks.push('typing while a refresh request is in flight is preserved');
 await page.evaluate(()=>saveCurrentRecipe());
 await page.evaluate(()=>{
  const records=readLibrary();records[0].name='First queued change';writeLibrary(records);clearTimeout(mmSyncTimer);__delayNext='update';window.__sync=mmSyncCloud();
 });
 await page.waitForFunction(()=>typeof __release==='function');
 await page.evaluate(()=>{const records=readLibrary();records[0].name='Latest queued change';writeLibrary(records);clearTimeout(mmSyncTimer);__release();__release=null;return __sync});
 assert.ok(await page.evaluate(()=>mmReadPending().some(edit=>edit.record?.name==='Latest queued change')));
 await page.evaluate(()=>mmSyncCloud());assert.ok(await page.evaluate(()=>__db.recipes.some(row=>row.name==='Latest queued change')));
 checks.push('a second save made during an in-flight server write stays queued and reaches the server');
 // The VAT setting is independent of the OCR implementation.
 await page.evaluate(()=>{const prices=readPriceBook();prices[0].priceBasis='inc_vat';writePriceBook(prices);});
 assert.match(await page.locator('#status').textContent(),/No VAT has been deducted/);assert.equal(await page.locator('#ingredients .price').inputValue(),'12');
 checks.push('VAT-inclusive linked prices keep their entered amount and show a GP warning');
 await page.evaluate(()=>{addRow({name:'Own ingredient',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:4,priceEntered:true,priceLinkMode:'manual'});});
 assert.match(await page.locator('#status').textContent(),/unconfirmed VAT/);
 await page.locator('#ingredients tr').last().locator('.ingredient-vat-basis').selectOption('ex_vat');assert.equal(await page.evaluate(()=>rows().at(-1).priceBasis),'ex_vat');checks.push('manual recipe VAT basis is editable and retained');
 await page.evaluate(()=>{setActiveView('pricebook');editPriceEntry(readPriceBook()[0].id)});
 assert.equal(await page.locator('#pbPriceBasis').inputValue(),'inc_vat');checks.push('manual price-book editing shows the stored VAT basis');
 await page.evaluate(()=>{setActiveView('costing');});
 for(const width of [320,375,390,430,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page fits '+width+'px');}
 checks.push('account controls and ingredient cards fit phone and tablet widths');
 await page.setViewportSize({width:390,height:844});await mkdir(path.join(root,'reports'),{recursive:true});await page.screenshot({path:path.join(root,`reports/account-mobile-${browserName}.png`),fullPage:true});
 await page.evaluate(()=>{__online=true;return saveCurrentRecipe()});
 await page.evaluate(()=>{
  const row=__db.recipes.find(item=>item.id===currentRecipeId);row.name='Other phone edit';row.recipe_data.name='Other phone edit';row.updated_at='2099-01-01T00:00:00Z';
 });
 await page.locator('#recipeName').fill('Local concurrent edit');await page.evaluate(()=>saveCurrentRecipe());
 assert.ok(await page.evaluate(()=>readLibrary().some(item=>item.name==='Other phone edit')));assert.ok(await page.evaluate(()=>readLibrary().some(item=>item.name==='Local concurrent edit (conflict copy)')));
 checks.push('an optimistic cloud-write conflict keeps both phones’ recipe versions');
 await page.evaluate(()=>{__db.recipes=__db.recipes.filter(item=>item.id!==currentRecipeId)});
 await page.locator('#recipeName').fill('Local edit after remote deletion');await page.evaluate(()=>saveCurrentRecipe());
 assert.ok(await page.evaluate(()=>readLibrary().some(item=>item.name.includes('(recovered copy)'))));
 checks.push('a remote deletion preserves subsequent local edits under a new recovery ID');
 await page.locator('#recipeName').fill('Unsaved before sign-out');
 await page.evaluate(()=>{document.querySelector('.account-settings').open=true});await page.locator('#mmForgetDevice').check();await page.evaluate(()=>mmSignOut());
 assert.equal(await page.evaluate(()=>mmUser?.id),'account-a');assert.match(await page.locator('#mmCloudStatus').textContent(),/Save your recipe/);checks.push('device removal cannot discard unsaved editor changes');
 await page.evaluate(()=>{__online=true;return saveCurrentRecipe()});await page.evaluate(()=>mmRefreshCloud(true));
 await page.evaluate(()=>{__online=false;const records=readLibrary();records[0].name='Pending offline';writeLibrary(records)});
 await page.evaluate(()=>mmSignOut());assert.equal(await page.evaluate(()=>mmUser?.id),'account-a');assert.match(await page.locator('#mmCloudStatus').textContent(),/Device copy kept/);checks.push('device removal cannot discard queued offline changes');
 await page.evaluate(()=>{__online=true;return mmRefreshCloud(true)});
 await page.evaluate(()=>{localStorage.setItem(mmAccountCacheKey(MM_LIBRARY_KEY,'account-b'),JSON.stringify([{id:'b',name:'Other account'}]));__signOutError=true;return mmSignOut()});
 assert.equal(await page.evaluate(()=>mmUser?.id),'account-a');checks.push('failed session sign-out keeps account state and device data');
 await page.evaluate(()=>{__signOutError=false;return mmSignOut()});
 assert.equal(await page.evaluate(()=>mmUser),null);assert.equal(await page.locator('#mmAuthGate').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_LIBRARY_KEY,'account-a'))),null);assert.match(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_LIBRARY_KEY,'account-b'))),/Other account/);
 assert.equal(await page.locator('#ingredients tr').count(),0);checks.push('successful shared-device sign-out clears private UI and only that account’s local copy');
 await page.goto(origin+'/help.html');assert.equal(await page.locator('[data-support-email]').first().textContent(),'admin.menumargin@gmail.com');assert.match(await page.locator('[data-subject]').getAttribute('href'),/^mailto:admin\.menumargin@gmail\.com/);
 for(const file of ['privacy.html','terms.html']){await page.goto(origin+'/'+file);assert.equal(await page.locator('h1').count(),1);}
 checks.push('help, privacy and terms pages load and use the dedicated support inbox');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await mkdir(path.join(root,'reports'),{recursive:true});const report={browser:browserName,passed:true,checks,browserErrors:errors,externalRequests:external,scope:'Production app scripts with synthetic cloud/auth; not live RLS or email delivery'};
 await writeFile(path.join(root,`reports/account-flow-${browserName}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
