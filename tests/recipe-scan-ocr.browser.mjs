import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {parseRecipeText} from '../js/recipe-scan-parser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.tar':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
 try{
  const target=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if(!target){res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><title>Recipe OCR test</title></head><body></body></html>');return;}
  if(!target.startsWith('vendor/scanner/'))throw Error('unapproved');
  const full=path.resolve(root,target);if(!full.startsWith(path.join(root,'vendor/scanner/')))throw Error();
  res.setHeader('content-type',types[path.extname(full)]||'application/octet-stream');
  res.end(await readFile(full));
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await (process.argv.includes('--webkit')?webkit:chromium).launch({headless:true});
const page=await browser.newPage();page.setDefaultTimeout(120000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);
 await page.addScriptTag({url:origin+'/vendor/scanner/client.js'});
 const result=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1250;
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,1200,1250);
  context.fillStyle='#111';context.font='bold 54px Arial';context.fillText('CHICKEN CURRY',55,135);
  context.font='46px Arial';['Serves: 10','Ingredients','1000 g chicken breast','500 g onions','800 ml coconut milk','Method','Simmer and serve'].forEach((line,i)=>context.fillText(line,55,245+i*110));
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.98));
  return window.MenuMarginScanner.scanRecipeFile(new File([blob],'recipe.jpg',{type:'image/jpeg'}));
 });
 assert.ok(result.pages===1);
 assert.match(result.text,/chicken/i);
 assert.match(result.text,/onions/i);
 assert.match(result.text,/1000|1[Oo]{3}/i);
 const parsed=parseRecipeText(result.text);
 assert.deepEqual(parsed.ingredients.map(row=>[row.name.toLowerCase(),row.qty,row.qtyUnit]),[
  ['chicken breast',1000,'g'],['onions',500,'g'],['coconut milk',800,'ml']
 ],'Photographed quantities must survive OCR and recipe parsing intact');
 assert.equal(parsed.yield,10);
 assert.deepEqual(errors,[]);
 console.log('PASS real local OCR returns recipe lines',result.text.slice(0,250));
}finally{await browser.close();server.close();}
