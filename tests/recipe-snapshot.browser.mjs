// Recipe snapshot isolation using real app handlers and synthetic account/cloud fixtures.
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
 browser=await pw[browserName].launch({headless:true});// Keep service-worker precaching from bypassing the synthetic SDK route on reload.
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
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
  window.__db=JSON.parse(sessionStorage.getItem('snapshot-test-cloud')||'null')||{recipes:[{id:'20000000-0000-4000-8000-000000000001',user_id:'account-a',name:'Mash',recipe_data:{name:'Mash',yield:4,sellingPrice:5,targetGp:70,ingredients:[{name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true}]},updated_at:'2026-10-01T00:00:00Z'}],price_book:[{id:price.id,user_id:'account-a',item_data:price,updated_at:'2026-10-01T00:00:00Z'}]};
  window.__testClient={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>{window.__signOutCalls=(window.__signOutCalls||0)+1;return window.__signOutError?{error:{message:'test sign-out failure'}}:{error:null}}},rpc:async()=>({data:false,error:null}),from(table){
   let action='read',body=null,start=0,end=Infinity;const filters=[];
   const query={select(){return query},eq(key,value){filters.push([key,value]);return query},order(){return query},range(a,b){start=a;end=b;return query},abortSignal(){return query},update(value){action='update';body=value;return query},delete(){action='delete';return query},upsert(value){action='upsert';body=value;return query},maybeSingle(){query.single=true;return query},then(resolve,reject){
    (async()=>{
     if(!window.__online)return {error:{message:'offline'}};
     if(window.__delayNext===action){window.__delayNext=null;await new Promise(r=>window.__release=r);}
     if(window.__failNextRead&&action==='read'){window.__failNextRead=false;return {error:{message:'interrupted read'}};}
     const matching=window.__db[table].filter(row=>filters.every(([key,value])=>row[key]===value));
     if(action==='read')return {data:query.single?matching[0]||null:matching.sort((a,b)=>a.id.localeCompare(b.id)).slice(start,Math.min(end+1,start+2)),count:matching.length,error:null};
     (window.__cloudWrites??=[]).push({table,action,id:body?.id||filters.find(([key])=>key==='id')?.[1]});
     const stamp=new Date(Date.now()+ ++tick).toISOString();
     if(action==='upsert'){const index=window.__db[table].findIndex(row=>row.id===body.id);const value=structuredClone({...body,updated_at:stamp});if(index>=0)window.__db[table][index]=value;else window.__db[table].push(value);return {data:[{id:value.id,updated_at:stamp}],error:null};}
     if(action==='update'){for(const row of matching)Object.assign(row,structuredClone(body),{updated_at:stamp});return {data:matching.map(row=>({id:row.id,updated_at:stamp})),error:null};}
     window.__db[table]=window.__db[table].filter(row=>!matching.includes(row));return {data:matching.map(row=>({id:row.id})),error:null};
    })().then(resolve,reject);
   }};return query;
  }};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let accept=true,promptValue='Renamed second dish';page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?promptValue:undefined):d.dismiss());
 const settle=()=>page.waitForFunction(()=>!mmSyncing&&mmReadPending().length===0);
 const stored=()=>page.evaluate(()=>mmReadStoredLibrary());const item=(recipes,id)=>recipes.find(r=>r.id===id);
 const A='20000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002';
 const alerts=()=>page.evaluate(()=>mmPriceImpactReport(mmReadStoredLibrary(),readPriceBook()).map(r=>r.id));
 const merge=async value=>{await page.evaluate(value=>restoreAccountBackup(new File([JSON.stringify(value)],'synthetic-backup.json',{type:'application/json'})),value);await settle();};
 await page.goto(origin);await page.waitForFunction(()=>mmAppBooted);
 await page.evaluate(()=>{
  const price=__db.price_book[0];price.item_data.price=12;window.__bookId=price.id;
  const row={name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true,priceBasis:'ex_vat',priceBookId:price.id,priceLinkMode:'linked',priceBookUpdatedAt:'2026-10-01T00:00:00Z'};
  __db.recipes[0].recipe_data={name:'First dish',yield:4,sellingPrice:5,targetGp:70,ingredients:[row]};__db.recipes[0].name='First dish';
  __db.recipes.push({...structuredClone(__db.recipes[0]),id:'20000000-0000-4000-8000-000000000002',name:'Second dish',recipe_data:{...structuredClone(__db.recipes[0].recipe_data),name:'Second dish',ingredients:[{...row,qty:200}]}});
  __db.recipes.push({id:'20000000-0000-4000-8000-000000000099',user_id:'account-b',name:'Other account dish',recipe_data:{name:'Other account dish',yield:1,sellingPrice:5,targetGp:70,ingredients:[{...row,price:1,priceBookId:'10000000-0000-4000-8000-000000000099'}]},updated_at:'2026-10-01T00:00:00Z'});
  __db.price_book.push({id:'10000000-0000-4000-8000-000000000099',user_id:'account-b',item_data:{...price.item_data,id:'10000000-0000-4000-8000-000000000099',price:2},updated_at:'2026-10-01T00:00:00Z'});
  return mmEnterApp({id:'account-a',email:'chef-a@example.invalid'});
 });await settle();
 const before=await stored(),beforeB=JSON.stringify(item(before,B)),cloudB=await page.evaluate(id=>JSON.stringify(__db.recipes.find(r=>r.id===id)),B),otherAccount=await page.evaluate(()=>JSON.stringify(__db.recipes.filter(r=>r.user_id==='account-b')));
 assert.deepEqual(await alerts(),[B,A],'Per-portion increases are ranked');
 await page.locator('#ingredients .qty').fill('150');await page.locator('#saveRecipe').click();await settle();
 let values=await stored();assert.equal(item(values,A).ingredients[0].price,12);assert.equal(item(values,A).ingredients[0].qty,150);assert.equal(JSON.stringify(item(values,B)),beforeB);assert.deepEqual(await alerts(),[B]);
 assert.equal(await page.evaluate(id=>JSON.stringify(__db.recipes.find(r=>r.id===id)),B),cloudB);assert.ok((await page.evaluate(()=>__cloudWrites)).every(w=>w.table!=='recipes'||w.id!=='20000000-0000-4000-8000-000000000002'));
 checks.push('Saving the first recipe acknowledges only its own current price; the other raw record, cloud version and price alert remain intact');
 await page.evaluate(()=>sessionStorage.setItem('snapshot-test-cloud',JSON.stringify(__db)));await page.reload();await page.waitForFunction(()=>mmAppBooted);await page.evaluate(()=>mmEnterApp({id:'account-a',email:'chef-a@example.invalid'}));await settle();assert.equal(await page.evaluate(()=>mmSupabase===__testClient),true,'Reload must retain the synthetic SDK, not a service-worker cached production SDK');assert.deepEqual(await alerts(),[B]);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);
 checks.push('Unreviewed comparison baselines survive reload and cloud rehydration');
 await page.locator('#tab-pricebook').click();await page.locator('#pricebookList .pricebook-item').getByRole('button',{name:'Edit price',exact:true}).click();await page.locator('#pbPack').fill('2');await page.locator('#pbPrice').fill('24');await page.locator('#pbSave').click();await settle();
 await page.locator('#tab-costing').click();assert.equal(await page.locator('#ingredients .pack').inputValue(),'2000');await page.locator('#saveRecipe').click();await settle();assert.equal(item(await stored(),A).ingredients[0].pack,2000);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);assert.deepEqual(await alerts(),[B]);
 checks.push('Supplier pack/price changes still recost the editor, while saving that recipe preserves other recipes’ old pack sizes and prices');
 await page.evaluate(()=>{__online=false;});await page.locator('#ingredients .qty').fill('175');await page.locator('#saveRecipe').click();await page.waitForFunction(()=>!mmSyncing&&mmReadPending().some(r=>r.id==='20000000-0000-4000-8000-000000000001'));
 assert.deepEqual(await page.evaluate(()=>mmReadPending().filter(r=>r.kind==='recipes').map(r=>r.id)),[A]);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);
 await page.evaluate(()=>{__online=true;return mmRefreshCloud(true);});await settle();assert.equal(await page.evaluate(id=>JSON.stringify(__db.recipes.find(r=>r.id===id)),B),cloudB);
 checks.push('Offline Save queues only the edited recipe; reconnect leaves the unreviewed recipe and its cloud version untouched');
 await page.locator('#ingredients .qty').fill('190');const beforeFailure=JSON.stringify(await stored());await page.evaluate(()=>{const key=mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),original=Storage.prototype.setItem;window.__restoreQuota=()=>{Storage.prototype.setItem=original;};let once=true;Storage.prototype.setItem=function(k,v){if(k===key&&once){once=false;throw Error('synthetic quota');}return original.call(this,k,v);};});await page.locator('#saveRecipe').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Could not save'));await page.evaluate(()=>__restoreQuota());assert.equal(JSON.stringify(await stored()),beforeFailure);assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);assert.equal(await page.locator('#ingredients .qty').inputValue(),'190');assert.deepEqual(await alerts(),[B]);
 checks.push('Device-save failure preserves all stored records, the active dirty draft and the unreviewed alert');
 await page.evaluate(()=>{mmDeliverFile=async(blob)=>{window.__exported=JSON.parse(await blob.text());return 'downloaded';};return downloadAccountBackup();});const exported=await page.evaluate(()=>__exported);assert.equal(item(exported.recipes,B).ingredients[0].price,10);assert.equal(item(exported.recipes,A).ingredients[0].qty,190);assert.equal(item(await stored(),A).ingredients[0].qty,175);assert.equal(exported.priceBook[0].price,24);
 await merge(exported);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);assert.equal(item(await stored(),A).ingredients[0].qty,175);assert.ok((await stored()).some(r=>r.name==='First dish (restored copy)'));assert.equal(await page.locator('#ingredients .qty').inputValue(),'190');assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 checks.push('Backup export preserves old saved-price snapshots and includes the explicit dirty draft; restore adds a conflict copy without overwriting existing recipes or alerts');
 const beforeCancel=JSON.stringify(await stored());accept=false;await merge(exported);assert.equal(JSON.stringify(await stored()),beforeCancel);await page.evaluate(id=>renameRecipeById(id),B);await page.evaluate(id=>deleteRecipeById(id),B);assert.equal(JSON.stringify(await stored()),beforeCancel);accept=true;
 const importedId='20000000-0000-4000-8000-000000000003',legacyId='20000000-0000-4000-8000-000000000004',otherPriceId='10000000-0000-4000-8000-000000000003';
 const legacy={...item(await stored(),B),id:legacyId,name:'Legacy exact match',ingredients:[{...item(await stored(),B).ingredients[0],priceBookId:null,priceLinkMode:'auto'}]};await merge({format:'menumargin-account-backup',schemaVersion:1,recipes:[legacy],priceBook:[]});
 const ownPrice=await page.evaluate(()=>readPriceBook()[0]);const otherPrice={...ownPrice,id:otherPriceId,supplier:'Other test supplier',code:'OTHER',price:99};const imported={...legacy,id:importedId,name:'Imported other product',ingredients:[{...legacy.ingredients[0],priceBookId:otherPriceId,priceLinkMode:'linked',price:99}]};await merge({format:'menumargin-account-backup',schemaVersion:1,recipes:[imported],priceBook:[otherPrice]});
 const pinned=item(await stored(),legacyId);assert.equal(pinned.ingredients[0].priceBookId,ownPrice.id);assert.equal(pinned.ingredients[0].price,10);assert.equal(pinned.ingredients[0].pack,1000);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);assert.ok((await alerts()).includes(legacyId));assert.ok((await alerts()).includes(B));
 checks.push('Restore retains existing snapshots and preserves legacy supplier-ID pinning before introducing a same-name supplier; alerts remain with the correct supplier');
 const foreignPriceId='10000000-0000-4000-8000-000000000004',remapId='20000000-0000-4000-8000-000000000005';await merge({format:'menumargin-account-backup',schemaVersion:1,priceBook:[{...ownPrice,id:foreignPriceId,price:1}],recipes:[{...legacy,id:remapId,name:'Remapped imported dish',ingredients:[{...legacy.ingredients[0],priceBookId:foreignPriceId,priceLinkMode:'linked'}]}]});assert.equal(item(await stored(),remapId).ingredients[0].priceBookId,ownPrice.id);assert.equal(await page.evaluate(id=>readPriceBook().find(p=>p.id===id).price,ownPrice.id),24);assert.equal(JSON.stringify(item(await stored(),B)),beforeB);
 checks.push('Backup supplier-ID remapping retains the user’s current supplier price without repricing unreviewed saved recipes');
 const beforeRename=await stored(),oldA=JSON.stringify(item(beforeRename,A)),oldIngredients=JSON.stringify(item(beforeRename,B).ingredients);await page.evaluate(id=>renameRecipeById(id),B);await settle();values=await stored();assert.equal(item(values,B).name,'Renamed second dish');assert.equal(JSON.stringify(item(values,B).ingredients),oldIngredients);assert.equal(JSON.stringify(item(values,A)),oldA);assert.ok((await alerts()).includes(B));const renamedB=JSON.stringify(item(values,B));
 await page.evaluate(id=>deleteRecipeById(id),importedId);await settle();assert.equal(JSON.stringify(item(await stored(),B)),renamedB);assert.ok((await alerts()).includes(B));
 checks.push('Rename changes only the chosen recipe metadata; deleting another recipe cannot acknowledge the remaining price alert');
 await page.evaluate(id=>deleteRecipeById(id),A);await settle();assert.equal(JSON.stringify(item(await stored(),B)),renamedB);assert.equal(await page.evaluate(()=>currentRecipeId),null);
 const row=page.locator('#ingredients tr').first();await row.locator('.ingredient').fill('New own-price salt');await row.locator('.qty').fill('100');await row.locator('.pack').fill('1000');await row.locator('.price').fill('0');await page.locator('#recipeName').fill('New own-price recipe');await page.locator('#sellingPrice').fill('5');await page.locator('#saveRecipe').click();await settle();assert.equal(JSON.stringify(item(await stored(),B)),renamedB);assert.ok((await alerts()).includes(B));
 checks.push('Deleting the current dirty recipe retains the original confirmation, and saving a new recipe never rewrites the unreviewed recipe');
 assert.equal(await page.evaluate(()=>JSON.stringify(__db.recipes.filter(r=>r.user_id==='account-b'))),otherAccount);
 const accountABefore=await page.evaluate(()=>JSON.stringify(__db.recipes.filter(r=>r.user_id==='account-a')));await page.evaluate(()=>mmEnterApp({id:'account-b',email:'chef-b@example.invalid'}));await page.locator('#saveRecipe').click();await settle();assert.equal(await page.evaluate(()=>JSON.stringify(__db.recipes.filter(r=>r.user_id==='account-a'))),accountABefore);
 checks.push('Both account directions keep the other account’s raw records and cloud versions isolated');
 await page.evaluate(()=>{const key=mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id);window.__beforeCorruption=localStorage.getItem(key);localStorage.setItem(key,'{invalid');window.__beforeBadExport=__exported;});await page.locator('#ingredients .qty').fill('123');await page.locator('#saveRecipe').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Could not save'));assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id))),'{invalid');await page.evaluate(()=>downloadAccountBackup());assert.equal(await page.evaluate(()=>__exported===__beforeBadExport),true);assert.equal(await page.locator('#recipesToast').textContent().then(t=>t.includes('Could not read')),true);await page.evaluate(()=>localStorage.setItem(mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),__beforeCorruption));
 const delayed={format:'menumargin-account-backup',schemaVersion:1,priceBook:[],recipes:[{...legacy,id:'20000000-0000-4000-8000-000000000055',name:'Must not enter another account'}]};await page.evaluate(value=>{window.__delayedRestore=restoreAccountBackup({size:100,text:()=>new Promise(resolve=>window.__releaseBackup=()=>resolve(JSON.stringify(value)))});},delayed);await page.evaluate(()=>mmEnterApp({id:'account-a',email:'chef-a@example.invalid'}));await page.evaluate(()=>{__releaseBackup();return __delayedRestore;});assert.equal((await stored()).some(r=>r.name==='Must not enter another account'),false);assert.match(await page.locator('#recipesToast').textContent(),/account changed/);
 checks.push('Unreadable storage fails closed without an empty-library overwrite or misleading backup; a delayed restore stops if the account changes');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await mkdir(path.join(root,'reports/recipe-snapshot'),{recursive:true});const report={browser:browserName,passed:true,checks,browserErrors:errors,externalRequests:external,scope:'Real app Save/rename/delete/backup handlers and cloud queue with synthetic isolated accounts. No customer data, billing, real login or physical-iPhone claim.'};await writeFile(path.join(root,'reports/recipe-snapshot/'+browserName+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
