import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(!/^(index\.html|js\/[\w.-]+\.(?:js|mjs))$/.test(pathname))throw Error('not allowed');
  const file=path.resolve(root,pathname);if(!file.startsWith(root))throw Error();
  let data=await readFile(file,'utf8');
  if(pathname==='index.html'){
    data=data.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i,'');
  }
  res.setHeader('content-type',mime[path.extname(file)]||'text/plain');res.end(data);
 }catch{res.statusCode=404;res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await (process.argv.includes('--webkit')?webkit:chromium).launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);
 await page.evaluate(()=>{
  window.mmUser={id:'test-chef'};window.mmCloudReady=false;
  window.MM_LIBRARY_KEY='recipes';window.MM_PRICEBOOK_KEY='prices';
  window.mmReadUserCache=(key)=>key==='prices'?[{id:'price-a',name:'Chicken breast',supplier:'Test supplier',packBase:1000,baseUnit:'g',price:10,priceBasis:'ex_vat'}]:[];
  window.mmWriteUserCache=()=>{throw Error('Scanner must not auto-save')};
  window.mmNewUuid=()=> '99999999-9999-4999-8999-999999999999';
  window.mmSaveRecipeDraftSoon=()=>{};window.mmClearRecipeDraft=()=>{};window.mmAuthMessage=()=>{};
  window.confirm=()=>true;
  window.MenuMarginScanner={scanRecipeFile:async()=>({text:'Chicken curry\nServes: 10\nIngredients\n1 kg Chicken breast\n500 g onions\nMethod\nStir together',warnings:[]})};
 });
 for(const item of ['pricing.js','recipe.js','pricebook.js'])await page.addScriptTag({url:origin+'/js/'+item});
 await page.evaluate(()=>loadRecipe({name:'',yield:10,sellingPrice:0,targetGp:70,ingredients:[]}));
 await page.addScriptTag({url:origin+'/js/recipe-scan-ui.mjs',type:'module'});
 await page.locator('#recipeScanFile').setInputFiles({name:'recipe.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,217])});
 await page.locator('#recipeScanStart').click();
 await page.locator('#recipeScanReview').waitFor({state:'visible'});
 assert.equal(await page.locator('#recipeScanRows tr').count(),2);
 assert.equal(await page.locator('#recipeScanYield').inputValue(),'10');
 await page.locator('#recipeScanImport').click();
 assert.equal(await page.locator('#recipeName').inputValue(),'Chicken curry');
 assert.equal(await page.locator('#ingredients tr').count(),2);
 assert.equal(await page.locator('#ingredients tr').first().locator('.qty').inputValue(),'1');
 const price=await page.locator('#ingredients tr').first().locator('.price').inputValue();
 assert.equal(price,'10');
 assert.equal(await page.evaluate(()=>hasUnsavedChanges),true);
 assert.equal(await page.evaluate(()=>currentRecipeId),null);
 assert.deepEqual(errors,[]);
 console.log('Recipe review, exact supplier match and unsaved costing import passed');
}finally{await browser.close();server.close();}
