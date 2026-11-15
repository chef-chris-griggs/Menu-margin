// Needs attention: real app scripts with isolated synthetic account/cloud fixtures.
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
 const card=name=>page.locator('#needsAttentionList article').filter({has:page.getByRole('heading',{name,exact:true})});
 const open=async()=>{await page.locator('#tab-menu').click();await page.locator('#needsAttentionShow').click();};
 const focused=selector=>page.waitForFunction(s=>document.activeElement===document.querySelector(s),selector);
 const settle=()=>page.waitForFunction(()=>!mmSyncing&&mmReadPending().length===0);
 const save=async()=>{await page.locator('#saveRecipe').click();await settle();await open();};
 const gone=async name=>page.waitForFunction(n=>![...document.querySelectorAll('#needsAttentionList h3')].some(el=>el.textContent===n),name);
 await page.goto(origin);await page.waitForFunction(()=>mmAppBooted);
 assert.equal(await page.locator('#needsAttentionPanel').isVisible(),false);assert.equal(await page.locator('#needsAttentionShow').isVisible(),false);
 await page.evaluate(()=>{
  const price=__db.price_book[0];price.item_data.price=12;price.item_data.supplier='TEST supplier A';window.__priceId=price.id;
  __db.price_book.push({...structuredClone(price),id:'10000000-0000-4000-8000-000000000002',item_data:{...price.item_data,id:'10000000-0000-4000-8000-000000000002',supplier:'TEST supplier B',price:99}});
  window.__stockId='10000000-0000-4000-8000-000000000003';
  __db.price_book.push({...structuredClone(price),id:__stockId,item_data:{...price.item_data,id:__stockId,name:'Stock',supplier:'TEST stock supplier',code:'S1',price:12,priceBasis:'unknown'}});
  const row={name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true,priceLinkMode:'manual',priceBasis:'ex_vat'};
  const records=[['Healthy',{},{}],['Missing pack price',{price:'',priceEntered:false},{}],['Ambiguous supplier',{priceBookId:price.id,priceLinkMode:'auto'},{}],['Incompatible units',{qtyUnit:'ml'},{}],['Manual VAT check',{priceBasis:'unknown'},{}],['Selling price needed',{}, {sellingPrice:0}],['Portions needed',{}, {yield:0}],['Below target',{}, {sellingPrice:.5}],['Removed supplier',{priceBookId:'foreign-account-product',priceLinkMode:'linked'},{}],['Supplier VAT check',{name:'Stock',priceBookId:__stockId,priceLinkMode:'linked'},{}],['Empty recipe',{}, {ingredients:[]}],['Current linked price',{priceBookId:price.id,priceLinkMode:'linked'},{}]];
  records[2][1].priceBookId=null;
  records.push(['Slightly below target',{qty:300.4},{yield:1,sellingPrice:10}]);
  records.push(['Several checks',{qty:'',pack:'',price:'',priceEntered:false},{sellingPrice:0}]);
  __db.recipes=records.map(([name,extra,recipe],i)=>({id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),user_id:'account-a',name,recipe_data:{name,yield:4,sellingPrice:5,targetGp:70,ingredients:[{...row,...extra}],...recipe},updated_at:'2026-10-01T00:00:00Z'}));
  __db.recipes.push({id:'20000000-0000-4000-8000-000000000099',user_id:'account-b',name:'B private recipe',recipe_data:{name:'B private recipe',yield:1,sellingPrice:1,targetGp:99,ingredients:[{...row,name:'B private spice',priceBookId:'10000000-0000-4000-8000-000000000099',priceLinkMode:'linked'}]},updated_at:'2026-10-01T00:00:00Z'});
  __db.price_book.push({id:'10000000-0000-4000-8000-000000000099',user_id:'account-b',item_data:{...price.item_data,id:'10000000-0000-4000-8000-000000000099',name:'B private spice',supplier:'B private supplier'},updated_at:'2026-10-01T00:00:00Z'});
  return mmEnterApp({id:'account-a',email:'chef-a@example.invalid'});
 });await settle();
 await page.evaluate(()=>{window.__attentionWrites=[];window.__attentionReads=[];const original=Storage.prototype.setItem,read=mmReadUserCache;window.__restoreProbe=()=>{Storage.prototype.setItem=original;mmReadUserCache=read;};Storage.prototype.setItem=function(key,value){if([mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id)].includes(key))__attentionWrites.push(key);return original.call(this,key,value);};mmReadUserCache=(key,id)=>{__attentionReads.push(id);return read(key,id);};window.__beforeAttention=JSON.stringify({recipes:mmReadUserCache(MM_LIBRARY_KEY,mmUser.id),prices:readPriceBook()});});
 await open();await page.waitForFunction(()=>document.querySelectorAll('#needsAttentionList article').length===12);
 assert.match(await page.locator('#needsAttentionStatus').textContent(),/12 recipes need attention/);assert.equal(await card('Healthy').count(),0);assert.equal(await card('Current linked price').count(),0);
 assert.match(await card('Below target').textContent(),/GP is 50.0%, below your 70% target/);assert.doesNotMatch(await card('Missing pack price').textContent(),/Current GP/);assert.doesNotMatch(await card('Incompatible units').textContent(),/Current GP/);
 assert.match(await card('Slightly below target').textContent(),/slightly below.*less than 0.1/);assert.doesNotMatch(await card('Slightly below target').textContent(),/by 0.0|Current GP 70.0%/);
 assert.doesNotMatch(await page.locator('#needsAttentionPanel').textContent(),/B private/);
 for(const [value,count] of [['prices',4],['units',3],['vat',2],['details',3],['gp',2],['all',12]]){await page.locator('#needsAttentionFilter').selectOption(value);assert.equal(await page.locator('#needsAttentionList article').count(),count);}
 assert.deepEqual(await page.evaluate(()=>__attentionWrites),[]);assert.ok((await page.evaluate(()=>__attentionReads)).every(id=>id==='account-a'));assert.equal(await page.evaluate(()=>JSON.stringify({recipes:mmReadUserCache(MM_LIBRARY_KEY,mmUser.id),prices:readPriceBook()})===__beforeAttention),true);await page.evaluate(()=>__restoreProbe());
 checks.push('Every saved recipe is checked, including unchanged-price GP problems; all filters use actual data and reading/filtering writes nothing or reads another account');
 await mkdir(path.join(root,'reports/recipe-attention'),{recursive:true});
 for(const width of [320,390,430,768,1440]){await page.setViewportSize({width,height:900});for(const view of ['costing','recipes','pricebook','invoices','menu']){await page.evaluate(v=>setActiveView(v),view);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' fits '+width);}}
 await page.setViewportSize({width:390,height:844});await open();await page.waitForFunction(()=>document.body.dataset.activeView==='recipes'&&document.getElementById('tab-recipes').getAttribute('aria-selected')==='true'&&document.getElementById('tab-recipes').classList.contains('active'));await page.screenshot({path:path.join(root,'reports/recipe-attention/'+browserName+'-phone.png'),fullPage:true});
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('#needsAttentionPanel').isVisible(),false);await page.emulateMedia({media:'screen'});
 checks.push('All five app views and expanded checks fit 320–1440px; Needs attention is excluded from printed recipes');
 await card('Several checks').locator('.attention-checks>summary').click();await card('Several checks').locator('li').filter({hasText:'enter the pack price or choose a supplier'}).getByRole('button').click();await focused('#ingredients .price');
 await open();await card('Several checks').locator('.attention-checks>summary').click();await card('Several checks').locator('li').filter({hasText:'actual selling price'}).getByRole('button').click();await focused('#sellingPrice');
 await page.locator('#ingredients .qty').fill('100');await page.locator('#ingredients .pack').fill('1000');await page.locator('#ingredients .price').fill('10');await page.locator('#sellingPrice').fill('5');await save();await gone('Several checks');
 checks.push('Recipes with several problems offer individual review actions for the specific ingredient and recipe fields');
 await card('Missing pack price').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#ingredients .price');
 await page.locator('#ingredients .price').fill('10');await open();assert.equal(await card('Missing pack price').count(),1,'Unsaved fixes are not treated as saved');
 await card('Below target').getByRole('button',{name:'Review recipe',exact:true}).click();assert.match(dialogs.at(-1),/unsaved changes/);assert.equal(await page.locator('#recipeName').inputValue(),'Missing pack price');assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 await page.locator('#tab-costing').click();await save();await gone('Missing pack price');assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[1].ingredients[0].price),10);
 checks.push('Review jumps to the missing price, keeps the existing discard prompt, and only explicit Save clears the saved-recipe check');
 await card('Incompatible units').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#ingredients .qty-unit');await page.locator('#ingredients .qty-unit').selectOption('g');await save();await gone('Incompatible units');
 await card('Manual VAT check').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#ingredients .ingredient-vat-basis');assert.equal(await page.locator('#ingredients .ingredient-vat-basis').isVisible(),true);await page.locator('#ingredients .ingredient-vat-basis').selectOption('ex_vat');await save();await gone('Manual VAT check');
 checks.push('Ingredient unit and manual VAT checks open the relevant visible controls without inventing conversions or tax rates');
 await page.evaluate(()=>{window.__stockBeforeReview=JSON.stringify(mmReadUserCache(MM_LIBRARY_KEY,mmUser.id).find(r=>r.name==='Supplier VAT check'));});
 await card('Supplier VAT check').getByRole('button',{name:'Check supplier price',exact:true}).click();assert.equal(await page.locator('#view-pricebook').isVisible(),true);assert.equal(await page.locator('#pbName').inputValue(),'Stock');await focused('#pbPriceBasis');await page.locator('#pbPriceBasis').selectOption('ex_vat');await page.locator('#pbSave').click();await settle();await open();await gone('Supplier VAT check');
 assert.equal(await page.evaluate(()=>JSON.stringify(mmReadUserCache(MM_LIBRARY_KEY,mmUser.id).find(r=>r.name==='Supplier VAT check'))===__stockBeforeReview),true);
 assert.equal(await page.evaluate(()=>readPriceBook().find(p=>p.id===__stockId).price),12);
 checks.push('A linked VAT check opens the exact supplier editor; explicit supplier save refreshes checks without rewriting saved ingredient prices');
 await card('Ambiguous supplier').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#ingredients .price-link-choice');await page.locator('#ingredients .price-link-choice').selectOption(await page.evaluate(()=>__priceId));await save();await gone('Ambiguous supplier');assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[2].ingredients[0].priceBookId),await page.evaluate(()=>__priceId));
 await card('Removed supplier').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#ingredients .price-link-toggle');await page.locator('#ingredients .price-link-toggle').click();assert.equal(await page.locator('#ingredients .price').inputValue(),'10');await save();await gone('Removed supplier');
 checks.push('Supplier ambiguity requires an explicit choice; removed products keep their own-price fallback and never switch to another supplier');
 await card('Selling price needed').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#sellingPrice');await page.locator('#sellingPrice').fill('5');await save();await gone('Selling price needed');
 await card('Portions needed').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#yield');assert.equal(await page.evaluate(()=>mmReadUserCache(MM_LIBRARY_KEY,mmUser.id).find(r=>r.name==='Portions needed').yield),0);await page.locator('#yield').fill('4');await save();await gone('Portions needed');
 await card('Below target').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#sellingPrice');await page.locator('#sellingPrice').fill('2');await save();await gone('Below target');
 await card('Slightly below target').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#sellingPrice');await page.locator('#sellingPrice').fill('11');await save();await gone('Slightly below target');
 await card('Empty recipe').getByRole('button',{name:'Review recipe',exact:true}).click();await focused('#addIngredient');
 const blank=page.locator('#ingredients tr').first();await blank.locator('.ingredient').fill('Salt');await blank.locator('.qty').fill('100');await blank.locator('.pack').fill('1000');await blank.locator('.price').fill('0');if(!await blank.locator('.ingredient-vat-basis').isVisible())await blank.locator('.ingredient-price-disclosure').click();await blank.locator('.ingredient-vat-basis').selectOption('ex_vat');await save();
 await page.waitForFunction(()=>document.getElementById('needsAttentionStatus').textContent.includes('No outstanding checks'));
 assert.equal(await page.locator('#needsAttentionDetails').isVisible(),false);
 checks.push('Selling price, portions and empty-recipe checks focus existing controls; saved corrections and explicit free prices clear checks with no automatic save');
 await page.evaluate(()=>{const recipe=__db.recipes.find(r=>r.user_id==='account-a'&&r.name==='Healthy');recipe.recipe_data.sellingPrice=.2;recipe.updated_at=new Date().toISOString();return mmRefreshCloud(true);});await settle();
 await page.locator('#needsAttentionDetails').evaluate(node=>node.open=true);await page.waitForFunction(()=>document.getElementById('needsAttentionList').textContent.includes('GP is -25.0%'));assert.equal(await card('Healthy').count(),1);
 await page.evaluate(()=>{const key=mmAccountCacheKey(MM_LIBRARY_KEY,mmUser.id),recipes=mmReadUserCache(MM_LIBRARY_KEY,mmUser.id).map(r=>r.name==='Healthy'?{...r,sellingPrice:5}:r);localStorage.setItem(key,JSON.stringify(recipes));window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(recipes)}));});await page.waitForFunction(()=>document.getElementById('needsAttentionStatus').textContent.includes('No outstanding checks'));
 await page.evaluate(()=>{mmCloudOffline=true;document.getElementById('mmCloudStatus').textContent='Offline fixture';});await page.waitForFunction(()=>document.getElementById('needsAttentionBasis').textContent.startsWith('Offline:'));
 checks.push('Cloud and other-tab updates recheck saved recipes; cached offline results are labelled');
 await page.evaluate(()=>{const key=mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id);window.__priorAttentionPrices=localStorage.getItem(key);localStorage.setItem(key,'{invalid');document.getElementById('mmCloudStatus').textContent='Unreadable fixture';});await page.waitForFunction(()=>document.getElementById('needsAttentionStatus').textContent.includes('could not be read'));assert.equal(await page.locator('#needsAttentionList article').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id))),'{invalid');await page.evaluate(()=>{localStorage.setItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id),__priorAttentionPrices);});
 await page.evaluate(()=>mmEnterApp({id:'account-b',email:'chef-b@example.invalid'}));await open();await page.waitForFunction(()=>document.getElementById('needsAttentionList').textContent.includes('B private recipe'));assert.equal(await page.locator('#needsAttentionList article').count(),1);assert.doesNotMatch(await page.locator('#needsAttentionPanel').textContent(),/Healthy|Stock|supplier A/);
 await page.evaluate(()=>{const recipe=mmReadUserCache(MM_LIBRARY_KEY,mmUser.id)[0],copies=[];for(let i=0;i<45;i++)copies.push({...recipe,id:'20000000-0000-4000-8000-'+String(i+200).padStart(12,'0'),name:i===0?'<img src=x onerror=alert(1)>':'Long kitchen recipe name '.repeat(10)+i});mmWriteUserCache(MM_LIBRARY_KEY,copies,mmUser.id,{track:false});refreshLibrary();});await page.waitForFunction(()=>document.querySelectorAll('#needsAttentionList article').length===20);assert.equal(await page.locator('#needsAttentionList img').count(),0);await page.locator('#needsAttentionMore').click();assert.equal(await page.locator('#needsAttentionList article').count(),40);await page.locator('#needsAttentionMore').click();assert.equal(await page.locator('#needsAttentionList article').count(),45);assert.equal(await page.locator('#needsAttentionMore').isVisible(),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push('Unreadable cache never becomes an all-clear or erases data; account switches, long text-only names and large-library paging are isolated');
 await page.evaluate(()=>mmEnterApp({id:'account-c',email:'empty-chef@example.invalid'}));await open();assert.equal(await page.locator('#needsAttentionPanel').isVisible(),false);await focused('#recipeEmptyStart');
 await page.evaluate(()=>{mmUser=null;mmClearPrivateUi();});await page.locator('#needsAttentionShow').waitFor({state:'hidden'});assert.equal(await page.locator('#needsAttentionPanel').isVisible(),false);assert.equal(await page.locator('#needsAttentionList article').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={browser:browserName,passed:true,checks,browserErrors:errors,externalRequests:external,scope:'Real app scripts; synthetic isolated Auth/cloud and recipe fixtures only. No customer accounts, live data, billing or physical-iPhone claim.'};await writeFile(path.join(root,'reports/recipe-attention/'+browserName+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
