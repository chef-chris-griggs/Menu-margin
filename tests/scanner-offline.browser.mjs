import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require('/Users/chrisgriggs/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const browserName=process.argv.includes('--webkit')?'webkit':'chromium',prefix='/Menu-margin/scanner-preview/',external=[];
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');if(req.method!=='GET'||!url.pathname.startsWith(prefix))throw new Error('Invalid request');
    if(url.pathname===prefix+'qa'){res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><script src="${prefix}vendor/scanner/client.js"></script>`);return;}
    const relative=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
    if(!/^(?:index\.html|sw\.js|styles\.css|manifest\.webmanifest|icons\/|js\/|styles\/|vendor\/|samples\/IMG_2384\.HEIC$)/.test(relative))throw new Error('Not an app asset');
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
    const bytes=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
  browser=await pw[browserName].launch({headless:true});const context=await browser.newContext();
  context.on('request',request=>{const url=new URL(request.url());if(url.protocol!=='blob:'&&(url.origin!==origin||request.method()!=='GET'))external.push({method:request.method(),url:request.url()});});
  const page=await context.newPage();page.on('pageerror',error=>console.error(error.message));page.on('console',message=>console.log(message.text()));
  await page.goto(origin+prefix+'qa');
  await page.evaluate(async()=>{const cache=await caches.open('menumargin-shell-v1.0.5');await cache.put('/Menu-margin/live-cache-sentinel',new Response('LIVE APP'));});
  // Read the private fixture before installing the worker. User-selected Files
  // never pass through fetch or the app's HTTP cache in production either.
  await page.evaluate(async prefix=>{const response=await fetch(prefix+'samples/IMG_2384.HEIC');window.invoice=new File([new Uint8Array(await response.arrayBuffer())],'BPM.HEIC',{type:'image/heic'});},prefix);
  await page.evaluate(async prefix=>{
    await navigator.serviceWorker.register(prefix+'sw.js',{scope:prefix});await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  },prefix);
  const online=await page.evaluate(async()=>{const r=await MenuMarginScanner.scanFile(window.invoice);return r.rows.map(row=>[row.productCode,row.quantity,row.unitPrice,row.lineTotal]);});
  assert.equal(online.length,4);console.log('PASS: real HEIC scanned with self-hosted assets.');
  const cached=await page.evaluate(async prefix=>{const cachesNames=await caches.keys();const legacy=await caches.open('menumargin-shell-v1.0.5');if(await(await legacy.match('/Menu-margin/live-cache-sentinel'))?.text()!=='LIVE APP')throw new Error('Preview damaged the live cache.');const cache=await caches.open(cachesNames.find(n=>n.startsWith('menumargin-shell-'+encodeURIComponent(prefix)+'-')));return (await cache.keys()).map(r=>new URL(r.url).pathname);},prefix);
  for(const name of ['scanner.worker.js','ort-wasm-simd-threaded.wasm','PP-OCRv5_mobile_det_onnx_infer.tar','en_PP-OCRv5_mobile_rec_onnx_infer.tar'])assert.ok(cached.some(p=>p.endsWith(name)),`${name} cached`);
  assert.equal(cached.some(p=>p.includes('/samples/')),false);console.log('PASS: models/runtime cached; invoice photo is absent from HTTP cache; live-app cache preserved.');
  await page.evaluate(()=>MenuMarginScanner.reset());
  // Playwright's WebKit setOffline emulation blocks even new Blob(['test'])
  // arrayBuffer() with NotReadableError. Stop the only HTTP origin instead so
  // we test unavailable network assets without breaking local File APIs.
  const offlineMode=browserName==='webkit'?'HTTP origin stopped (WebKit offline emulation blocks Blob APIs)':'browser offline mode';
  if(browserName==='webkit'){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}else await context.setOffline(true);
  const offline=await page.evaluate(async()=>{const r=await MenuMarginScanner.scanFile(window.invoice,{onProgress:message=>console.log('OFFLINE:',message)});return r.rows.map(row=>[row.productCode,row.quantity,row.unitPrice,row.lineTotal]);});
  assert.deepEqual(offline,online);console.log('PASS: fresh OCR worker scans the same HEIC with '+offlineMode+'.');
  await page.evaluate(async()=>{
    MenuMarginScanner.reset();const controller=new AbortController();
    const pending=MenuMarginScanner.scanFile(window.invoice,{signal:controller.signal,onProgress:()=>controller.abort()});
    try{await pending;throw new Error('Cancellation was ignored.');}catch(error){if(error.name!=='AbortError')throw error;}
  });console.log('PASS: cancellation rejects with AbortError.');
  const afterCancel=await page.evaluate(async()=>{const r=await MenuMarginScanner.scanFiles([window.invoice,window.invoice]);return {rows:r.rows.map(row=>[row.productCode,row.quantity,row.unitPrice,row.lineTotal]),pages:r.pages.length,warnings:r.warnings};});
  assert.deepEqual(afterCancel.rows,online);assert.equal(afterCancel.pages,1);assert.ok(afterCancel.warnings.some(w=>w.includes('Duplicate photo')));
  assert.equal(external.length,0);console.log('PASS: retry after cancellation works offline; duplicate photo produces one page; no external or upload requests.');
  await mkdir(path.join(root,'scanner-debug'),{recursive:true});await writeFile(path.join(root,'scanner-debug',`offline-${browserName}.json`),JSON.stringify({passed:true,browser:browserName,offlineMode,online,offline,cached,external},null,2));
}finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
