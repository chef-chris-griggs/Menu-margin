// Supplier alerts with real app scripts and isolated synthetic Auth/cloud responses.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),pw=require('playwright');
const browserName=process.argv.includes('--webkit')?'webkit':'chromium',checks=[],errors=[],external=[];
checks.push=(...values)=>{console.log(JSON.stringify({progress:values}));return Array.prototype.push.apply(checks,values);};
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
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 let acceptDialog=false,dialogs=[];page.on('dialog',dialog=>{dialogs.push(dialog.message());return acceptDialog?dialog.accept():dialog.dismiss();});
 const card=name=>page.locator('#priceImpactList article').filter({has:page.getByRole('heading',{name,exact:true})});
 const settle=()=>page.waitForFunction(()=>!mmSyncing&&mmReadPending().length===0);
 await page.goto(origin);await page.waitForFunction(()=>mmAppBooted);
 assert.equal(await page.locator('#priceImpactPanel').isVisible(),false);assert.equal(await page.locator('#priceImpactShow').isVisible(),false);
 await page.evaluate(()=>{
  const price=__db.price_book[0];price.item_data.price=12;price.item_data.supplier='TEST supplier A';
  window.__priceId=price.id;
  __db.price_book.push({...structuredClone(price),id:'10000000-0000-4000-8000-000000000002',item_data:{...price.item_data,id:'10000000-0000-4000-8000-000000000002',supplier:'TEST supplier B',price:99}});
  const ingredient={name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true,priceBookId:price.id,priceLinkMode:'linked',priceBasis:'ex_vat'};
  const records=[['Mash',{},{}],['Sauce',{price:20},{yield:2,sellingPrice:4}],['Unclear VAT',{priceBasis:'unknown'},{}],['Own recipe',{priceLinkMode:'manual'},{}],['Missing selling price',{}, {sellingPrice:0}],['Removed supplier',{priceBookId:'foreign-account-product'},{}],['Ambiguous supplier',{priceBookId:null,priceLinkMode:'auto'},{}],['No change',{price:12},{}]];
  __db.recipes=records.map(([name,extra,recipe],i)=>({id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),user_id:'account-a',name,recipe_data:{name,yield:4,sellingPrice:5,targetGp:95,...recipe,ingredients:[{...ingredient,...extra}]},updated_at:'2026-10-01T00:00:00Z'}));
  __db.recipes.push({id:'20000000-0000-4000-8000-000000000099',user_id:'account-b',name:'B private recipe',recipe_data:{name:'B private recipe',yield:1,sellingPrice:10,targetGp:70,ingredients:[{...ingredient,name:'B private saffron',priceBookId:'10000000-0000-4000-8000-000000000099',price:2}]},updated_at:'2026-10-01T00:00:00Z'});
  __db.price_book.push({id:'10000000-0000-4000-8000-000000000099',user_id:'account-b',item_data:{...price.item_data,id:'10000000-0000-4000-8000-000000000099',name:'B private saffron',supplier:'B private supplier',price:3},updated_at:'2026-10-01T00:00:00Z'});
  return mmEnterApp({id:'account-a',email:'chef-a@example.invalid'});
 });
 await settle();
 await page.evaluate(()=>{window.__alertWrites=[];const original=Storage.prototype.setItem;window.__restoreWrites=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if([mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id)].includes(key))__alertWrites.push(key);return original.call(this,key,value);};window.__beforeAlert=JSON.stringify({recipes:mmReadUserCache(MM_LIBRARY_KEY,mmUser.id),prices:readPriceBook()});});
 await page.locator('#tab-menu').click();await page.locator('#priceImpactShow').click();
 await page.waitForFunction(()=>document.getElementById('priceImpactStatus').textContent.includes('2 recipes cost more'));
 assert.equal(await page.locator('#priceImpactList article').count(),6);assert.equal(await card('Mash').locator('.price-impact-metrics').textContent(),'Cost per portion£0.25 → £0.30Gross profit95.0% → 94.0%');
 assert.match(await card('Mash').textContent(),/Now below your 95% GP target/);
 await card('Mash').locator('.price-impact-breakdown summary').click();assert.match(await card('Mash').textContent(),/TEST supplier A/);assert.doesNotMatch(await card('Mash').textContent(),/TEST supplier B/);
 assert.match(await card('Missing selling price').textContent(),/Selling price needed/);
 assert.doesNotMatch(await card('Unclear VAT').textContent(),/Gross profit/);assert.match(await card('Unclear VAT').textContent(),/Check VAT/);
 assert.equal(await card('Own recipe').count(),0);assert.equal(await card('No change').count(),0);assert.doesNotMatch(await page.locator('#priceImpactPanel').textContent(),/B private/);
 for(const [value,count] of [['increase',2],['review',3],['decrease',1],['all',6]]){await page.locator('#priceImpactFilter').selectOption(value);assert.equal(await page.locator('#priceImpactList article').count(),count);}
 assert.deepEqual(await page.evaluate(()=>__alertWrites),[]);assert.equal(await page.evaluate(()=>JSON.stringify({recipes:mmReadUserCache(MM_LIBRARY_KEY,mmUser.id),prices:readPriceBook()})===__beforeAlert),true);await page.evaluate(()=>__restoreWrites());
 checks.push('Real saved-price comparisons show cost/GP changes, target crossing and VAT checks; filters and supplier identity are correct and opening alerts writes nothing');
 await mkdir(path.join(root,'reports/price-impact'),{recursive:true});
 for(const width of [320,390,430,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Price alerts fit '+width);for(const view of ['costing','recipes','pricebook','invoices','menu']){await page.evaluate(v=>setActiveView(v),view);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' fits '+width);}}
 await page.setViewportSize({width:390,height:844});await page.locator('#priceImpactShow').click();await page.screenshot({path:path.join(root,'reports/price-impact/'+browserName+'-phone.png'),fullPage:true});
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('#priceImpactPanel').isVisible(),false);await page.emulateMedia({media:'screen'});
 checks.push('All five app views and expanded alerts fit 320–1440px; alerts stay off printed recipes');
 await page.locator('#tab-costing').click();await page.locator('#recipeName').fill('Draft kept while checking alerts');await page.locator('#ingredients .qty').fill('250');
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;const image=await new Promise(resolve=>canvas.toBlob(resolve));
  invoiceRenderScanResult({version:1,supplier:'TEST supplier A',invoiceNumber:'SYNTHETIC',pages:[{pageNumber:1,width:600,height:900,original:image,cleaned:image,overlay:image,words:[]}],rows:[{id:'invoice-line',pageNumber:1,productCode:'B1',description:'BUTTER',quantity:1,quantityBasis:'case',unitPrice:13,lineTotal:13,priceBasis:'ex_vat',pack:{caseCount:1,eachSize:1,unit:'kg'},confidence:.99,needsReview:false,reasons:[]}],totals:{subtotal:13,vat:0,total:13},validation:{matchesSubtotal:true,blockingIssues:[]},warnings:[]});
  const state=invoiceReviewStates[0];state.selected=true;state.confirmed=true;state.elements.selected.checked=true;state.elements.confirmed.checked=true;importInvoiceReview();
 });await settle();await page.locator('#tab-menu').click();await page.locator('#priceImpactShow').click();
 assert.match(await card('Mash').textContent(),/£0.25 → £0.33/);assert.equal(await page.evaluate(()=>readPriceBook().find(item=>item.id===__priceId).price),13);assert.equal(await page.locator('#ingredients .qty').inputValue(),'250');assert.equal(await page.locator('#recipeName').inputValue(),'Draft kept while checking alerts');
 checks.push('Confirmed synthetic invoice prices refresh alerts against the same supplier ID and preserve the unsaved recipe');
 await page.locator('#tab-pricebook').click();await page.locator('#pricebookList .pricebook-item').filter({hasText:'TEST supplier A'}).getByRole('button',{name:'Edit price',exact:true}).click();await page.locator('#pbPrice').fill('14');await page.locator('#pbSave').click();await settle();
 assert.equal(await page.locator('#priceImpactNotice').isVisible(),true);await page.locator('#priceImpactNoticeOpen').click();
 assert.match(await card('Mash').textContent(),/£0.25 → £0.35/);assert.equal(await page.locator('#ingredients .qty').inputValue(),'250');assert.equal(await page.locator('#recipeName').inputValue(),'Draft kept while checking alerts');assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[0].ingredients[0].qty),100);
 await card('Mash').getByRole('button',{name:'Review recipe',exact:true}).click();assert.match(dialogs.at(-1),/unsaved changes/);assert.equal(await page.locator('#recipeName').inputValue(),'Draft kept while checking alerts');
 checks.push('Manual supplier updates refresh alerts from saved quantities while retaining active unsaved edits; Review recipe preserves the existing discard confirmation');
 acceptDialog=true;await card('Mash').getByRole('button',{name:'Review recipe',exact:true}).click();
 assert.equal(await page.locator('#ingredients .qty').inputValue(),'100');assert.equal(await page.locator('#ingredients .price').inputValue(),'14');assert.equal(await page.locator('#gpPct').textContent(),'93.0%');
 assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[0].ingredients[0].price),10,'Opening does not reset the saved baseline');
 await page.locator('#saveRecipe').click();await settle();await page.locator('#tab-recipes').click();await page.locator('#priceImpactDetails').evaluate(node=>node.open=true);
 await page.waitForFunction(()=>!document.querySelector('#priceImpactList [data-recipe-id="20000000-0000-4000-8000-000000000001"]'));
 assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[0].ingredients[0].price),14);
 checks.push('Only explicit Save records the current-price baseline; current costing and alert figures agree');
 await page.evaluate(()=>{const price=__db.price_book.find(p=>p.id===__priceId);price.item_data.price=16;price.updated_at=new Date().toISOString();return mmRefreshCloud(true);});await settle();
 await page.waitForFunction(()=>document.querySelector('#priceImpactList [data-recipe-id="20000000-0000-4000-8000-000000000001"]'));
 assert.match(await card('Mash').textContent(),/£0.35 → £0.40/);
 checks.push('A confirmed cloud refresh recreates an alert against the saved baseline without altering recipe quantities');
 await page.evaluate(()=>{const prices=readPriceBook().map(p=>p.id===__priceId?{...p,price:17}:p),key=mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id);localStorage.setItem(key,JSON.stringify(prices));window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(prices)}));});
 await page.waitForFunction(()=>document.querySelector('#priceImpactList').textContent.includes('£0.35 → £0.43'));
 checks.push('Another-tab price updates recompute the account’s alerts');
 await page.evaluate(()=>{mmCloudOffline=true;document.getElementById('mmCloudStatus').textContent='Offline test status';});await page.waitForFunction(()=>document.getElementById('priceImpactBasis').textContent.startsWith('Offline:'));
 checks.push('Offline comparisons are labelled as this device’s cached prices');
 await page.evaluate(()=>{writePriceBook(readPriceBook().filter(p=>p.id!==__priceId));renderPriceBook();});await settle();
 await page.waitForFunction(()=>document.querySelector('#priceImpactList [data-recipe-id="20000000-0000-4000-8000-000000000001"]')?.dataset.state==='review');assert.match(await card('Mash').textContent(),/removed/);assert.equal(await page.evaluate(()=>readLibrary()[0].ingredients[0].priceBookId),await page.evaluate(()=>__priceId));assert.equal(await page.evaluate(()=>readLibrary()[0].ingredients[0].price),14);
 checks.push('A removed product is flagged and never silently replaced with a same-name supplier');
 await page.evaluate(()=>mmEnterApp({id:'account-b',email:'chef-b@example.invalid'}));await page.locator('#tab-menu').click();await page.locator('#priceImpactShow').click();
 await page.waitForFunction(()=>document.getElementById('priceImpactList').textContent.includes('B private recipe'));
 assert.equal(await page.locator('#priceImpactList article').count(),1);assert.doesNotMatch(await page.locator('#priceImpactPanel').textContent(),/Mash|Sauce|TEST supplier A/);
 // Long customer descriptions and XSS-looking names are text, never markup.
 await page.evaluate(()=>{const recipes=mmReadUserCache(MM_LIBRARY_KEY,mmUser.id),price=readPriceBook()[0];const copy=[];for(let i=0;i<45;i++)copy.push({...recipes[0],id:'20000000-0000-4000-8000-'+String(200+i).padStart(12,'0'),name:i===0?'<img src=x onerror=alert(1)>':('Long kitchen dish description '.repeat(8)+i)});mmWriteUserCache(MM_LIBRARY_KEY,copy,mmUser.id,{track:false});refreshLibrary();});
 await page.waitForFunction(()=>document.querySelectorAll('#priceImpactList article').length===20);assert.equal(await page.locator('#priceImpactList img').count(),0);await page.locator('#priceImpactMore').click();assert.equal(await page.locator('#priceImpactList article').count(),40);await page.locator('#priceImpactMore').click();assert.equal(await page.locator('#priceImpactList article').count(),45);assert.equal(await page.locator('#priceImpactMore').isVisible(),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push('Switching accounts clears prior alerts; long/text-only names and paging keep a large library usable');
 await page.evaluate(()=>{const key=mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id);window.__priorPrices=localStorage.getItem(key);localStorage.setItem(key,'{invalid');document.getElementById('mmCloudStatus').textContent='Read-error test';});
 await page.waitForFunction(()=>document.getElementById('priceImpactStatus').textContent.includes('could not be read'));assert.equal(await page.locator('#priceImpactList article').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id))),'{invalid');
 await page.evaluate(()=>{localStorage.setItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id),__priorPrices);document.getElementById('mmCloudStatus').textContent='Read restored';});
 checks.push('Unreadable cache produces a recovery message, clears stale comparisons and never erases device data');
 await page.evaluate(()=>mmEnterApp({id:'account-c',email:'empty-chef@example.invalid'}));await page.locator('#tab-recipes').click();await page.locator('#priceImpactPanel').waitFor({state:'hidden'});
 await page.evaluate(()=>{mmUser=null;mmClearPrivateUi();});await page.locator('#priceImpactShow').waitFor({state:'hidden'});assert.equal(await page.locator('#priceImpactPanel').isVisible(),false);assert.equal(await page.locator('#priceImpactList article').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={browser:browserName,passed:true,checks,browserErrors:errors,externalRequests:external,scope:'Real app scripts; synthetic isolated Auth/cloud and supplier fixtures only. No customer accounts, billing, live data or physical-iPhone claim.'};
 await writeFile(path.join(root,'reports/price-impact/'+browserName+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
