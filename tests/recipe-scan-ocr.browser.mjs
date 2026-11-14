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
  if(!target.startsWith('vendor/scanner/')&&!target.startsWith('vendor/pdfjs/')&&!target.startsWith('tests/fixtures/recipes/'))throw Error('unapproved');
  const full=path.resolve(root,target);if(!full.startsWith(root))throw Error();
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
 for(const ext of ['jpg','png','pdf']){
 const result=await page.evaluate(async ext=>{const response=await fetch('/tests/fixtures/recipes/printed-recipe.'+ext);if(!response.ok)throw Error('Missing fixture');const blob=await response.blob();return window.MenuMarginScanner.scanRecipeFile(new File([blob],'recipe.'+ext,{type:ext==='pdf'?'application/pdf':ext==='png'?'image/png':'image/jpeg'}));},ext);
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
 console.log('PASS synthetic printed document OCR',ext,result.text.slice(0,250));
 }

 for(const variation of ['rotation','low-contrast']){
  const result=await page.evaluate(async variation=>{
   const image=await createImageBitmap(await (await fetch('/tests/fixtures/recipes/printed-recipe.jpg')).blob());
   const c=document.createElement('canvas');c.width=image.width+200;c.height=image.height+200;const x=c.getContext('2d');x.fillStyle='#eee';x.fillRect(0,0,c.width,c.height);x.translate(c.width/2,c.height/2);
   if(variation==='rotation')x.rotate(3*Math.PI/180);else x.filter='contrast(0.65) brightness(0.85)';
   x.drawImage(image,-image.width/2,-image.height/2);image.close();const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',.78));
   return MenuMarginScanner.scanRecipeFile(new File([blob],'synthetic-'+variation+'.jpg',{type:'image/jpeg'}));
  },variation);
  const p=parseRecipeText(result.text);assert.deepEqual(p.ingredients.map(i=>[i.name.toLowerCase(),i.qty,i.qtyUnit]),[['chicken breast',1000,'g'],['onions',500,'g'],['coconut milk',800,'ml']]);assert.equal(p.yield,10);
  console.log('PASS synthetic camera variation',variation);
 }
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 2 /Kids [4 0 R 6 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(const [i,lines]of [['GARDEN SOUP','Serves: 4','Ingredients','250 g carrots'],['500 ml stock','2 each eggs','Method','Simmer and serve']].entries()){
  const stream='BT /F1 24 Tf 40 750 Td '+lines.map((line,j)=>(j?'0 -60 Td ':'')+'('+line+') Tj').join(' ')+' ET';
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
 }
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});const start=Buffer.byteLength(pdf);
 pdf+='xref\n0 8\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 const result=await page.evaluate(async encoded=>MenuMarginScanner.scanRecipeFile(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],'two-pages.pdf',{type:'application/pdf'})),Buffer.from(pdf).toString('base64'));
 const parsed=parseRecipeText(result.text);assert.equal(result.pages,2);assert.deepEqual(parsed.ingredients.map(i=>[i.name.toLowerCase(),i.qty,i.qtyUnit]),[['carrots',250,'g'],['stock',500,'ml'],['eggs',2,'each']]);assert.equal(parsed.yield,4);
 console.log('PASS two-page PDF ingredients survive the page boundary');
 assert.deepEqual(errors,[]);
}finally{await browser.close();server.close();}
