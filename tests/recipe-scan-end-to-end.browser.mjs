// Real local OCR + review + costing + explicit save/reload. Account/cloud APIs are
// intentionally absent; this is device persistence, not live Supabase validation.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.pdf':'application/pdf','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(!/^(?:index\.html|styles\.css|styles\/|js\/|vendor\/|tests\/fixtures\/recipes\/)/.test(name))throw Error();
  const file=path.resolve(root,name);if(!file.startsWith(root))throw Error();
  let bytes=await readFile(file);
  if(name==='index.html')bytes=bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i,'');
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port,external=[],errors=[];
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
const manualMode=process.argv.includes('--manual-prices');
const browser=await ({chromium,webkit}[engine]).launch({headless:true});
try{
 const context=await browser.newContext({viewport:engine==='webkit'?{width:390,height:844}:{width:1440,height:900}});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));
 async function boot(){
  await page.goto(origin);
  await page.addStyleTag({url:origin+'/styles.css'});await page.addStyleTag({url:origin+'/styles/recipe-scan.css'});
  await page.evaluate(()=>{
   window.mmUser={id:'device-test-chef'};window.mmCloudReady=false;window.MM_LIBRARY_KEY='recipes';window.MM_PRICEBOOK_KEY='prices';
   window.mmReadUserCache=(key,id)=>JSON.parse(localStorage.getItem('test:'+id+':'+key)||'[]');
   window.mmWriteUserCache=(key,value,id)=>{if(!window.explicitSave)throw Error('Unexpected automatic save');localStorage.setItem('test:'+id+':'+key,JSON.stringify(value));};
   if(!localStorage.getItem('test:device-test-chef:prices'))localStorage.setItem('test:device-test-chef:prices',JSON.stringify([
    {id:'chicken',name:'Chicken breast',supplier:'Test poultry supplier',packBase:1000,baseUnit:'g',price:10,priceBasis:'ex_vat'},
    {id:'onion',name:'Onion',supplier:'Test produce supplier',packBase:1000,baseUnit:'g',price:2,priceBasis:'ex_vat'},
    {id:'coconut',name:'Coconut Milk Catering',supplier:'Test grocery supplier',packBase:1000,baseUnit:'ml',price:4,priceBasis:'ex_vat'}]));
   window.mmNewUuid=()=>crypto.randomUUID();window.mmSaveRecipeDraftSoon=()=>{};window.mmClearRecipeDraft=()=>{};window.mmAuthMessage=()=>{};window.confirm=()=>true;
  });
  if(manualMode)await page.evaluate(()=>localStorage.setItem('test:device-test-chef:prices','[]'));
  for(const name of ['pricing.js','recipe.js','pricebook.js'])await page.addScriptTag({url:origin+'/js/'+name});
  await page.addScriptTag({url:origin+'/vendor/scanner/client.js'});await page.addScriptTag({url:origin+'/js/recipe-scan-ui.mjs',type:'module'});
  await page.evaluate(()=>{loadRecipe({name:'',yield:10,sellingPrice:0,ingredients:[]});document.body.classList.add('mm-authenticated');document.getElementById('appMain').hidden=false;setActiveView('costing');document.getElementById('recipeScanPanel').open=true;});
 }
 for(const ext of ['jpg','pdf']){
  await boot();
  const count=await page.evaluate(()=>readLibrary().length);
  await page.locator('#recipeScanFile').setInputFiles(path.join(root,'tests/fixtures/recipes/printed-recipe.'+ext));
  await page.locator('#recipeScanStart').click();await page.locator('#recipeScanReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#recipeScanRows tr').count(),3);
  for(const [index,id] of ['chicken','onion','coconut'].entries()){
   const row=page.locator('#recipeScanRows tr').nth(index);
   if(manualMode){await row.locator('.scan-manual-toggle').click();await row.locator('.scan-pack').fill('1000');await row.locator('.scan-pack-unit').selectOption(index===2?'ml':'g');await row.locator('.scan-pack-price').fill(String([10,2,4][index]));await row.locator('.scan-pack-vat').selectOption('ex_vat');}
   else await row.locator('.recipe-supplier-match').selectOption(id);
  }
  await page.locator('#recipeScanName').fill('OCR device recipe '+ext);await page.locator('#recipeScanSellingPrice').fill('10');
  assert.match(await page.locator('#recipeScanTotals').textContent(),/Batch cost: £14.20 · Per portion: £1.42 · GP: 85.8%/);
  assert.equal(await page.evaluate(()=>readLibrary().length),count,'OCR and review must not save');
  await page.locator('#recipeScanImport').click();
  assert.equal(await page.locator('#batchCost').textContent(),'£14.20');assert.equal(await page.locator('#gpPct').textContent(),'85.8%');
  assert.equal(await page.evaluate(()=>readLibrary().length),count,'Import must not save');
  await page.evaluate(()=>{window.explicitSave=true;});await page.locator('#saveRecipe').click();
  const saved=await page.evaluate(()=>recipeData());assert.ok(saved.id);
  await boot();
  assert.equal(await page.evaluate(()=>readLibrary().length),count+1,'Explicit save adds a new record');
  await page.evaluate(id=>openRecipeById(id),saved.id);
  assert.equal(await page.locator('#recipeName').inputValue(),'OCR device recipe '+ext);
  assert.equal(await page.locator('#batchCost').textContent(),'£14.20');
  assert.deepEqual(await page.evaluate(()=>recipeData().ingredients.map(i=>i.priceBookId)),manualMode?[null,null,null]:['chicken','onion','coconut']);
  assert.deepEqual(await page.evaluate(()=>recipeData().ingredients.map(i=>i.price)),[10,2,4]);
  if(manualMode)assert.deepEqual(await page.evaluate(()=>recipeData().ingredients.map(i=>i.priceLinkMode)),['manual','manual','manual']);
  console.log('PASS real OCR → review → '+(manualMode?'manual whole-pack prices':'supplier selection')+' → costing/GP → explicit save → reload',engine,ext);
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
}finally{await browser.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
