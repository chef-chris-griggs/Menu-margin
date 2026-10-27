import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluateSample,formatEvaluation } from './scanner-evaluate.mjs';
import { combinePages } from '../scanner/table.js';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('/Users/chrisgriggs/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const args=process.argv.slice(2),browserName=args.includes('--webkit')?'webkit':'chromium',only=args.find(a=>a.startsWith('--only='))?.slice(7),useJpeg=args.includes('--jpeg');
const manifest=JSON.parse(await readFile(path.join(root,'samples/manifest.json'),'utf8').catch(()=>{throw new Error('Private samples are missing. Put original invoice photos and independently annotated expected JSON in /samples; see samples/README.md.');}));
const fixtures=[];for(const file of manifest.samples){const expected=JSON.parse(await readFile(path.join(root,'samples',file),'utf8'));if(!only||expected.sampleId===only)fixtures.push(expected);}
if(!fixtures.length)throw new Error('No matching sample fixtures.');
const datasetHash=createHash('sha256').update(JSON.stringify(fixtures)).digest('hex');
const debugRoot=path.join(root,'scanner-debug');await mkdir(debugRoot,{recursive:true});
const runId=new Date().toISOString().replace(/[:.]/g,'-'),runFolder=path.join(debugRoot,'runs',`${runId}-${browserName}${useJpeg?'-jpeg':'-heic'}`);await mkdir(runFolder,{recursive:true});
const previous=await readFile(path.join(debugRoot,`last-report-${browserName}${useJpeg?'-jpeg':''}.json`),'utf8').then(JSON.parse).catch(()=>null);
const prefix='/Menu-margin/',networkViolations=[];
const mime={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.heic':'image/heic','.tar':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname===`${prefix}harness`){res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script src="${prefix}vendor/scanner/client.js"></script><p>Local invoice regression harness</p>`);return;}
    if(req.method!=='GET')throw new Error('GET only');
    const relative=decodeURIComponent(url.pathname).replace(prefix,'');
    if(!/^(vendor\/scanner\/|vendor\/pdfjs\/|samples\/IMG_[0-9]+\.(?:jpg|HEIC)$)/.test(relative))throw new Error('Not a harness asset');
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new Error('Invalid path');
    await stat(file);const content=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const reports=[],documents=new Map();
try{
  browser=await playwright[browserName].launch({headless:true});
  const context=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:1});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin&&req.method()==='GET')return route.continue();networkViolations.push({method:req.method(),origin:url.origin});return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Browser error:',error.message));
  page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text());});
  page.on('requestfailed',request=>console.error('Asset request failed:',request.url(),request.failure()?.errorText));
  await page.exposeFunction('sampleProgress',message=>console.log(`  ${message}`));
  await page.goto(`${origin}${prefix}harness`);
  console.log('Harness ready:',await page.evaluate(()=>({url:location.href,scanner:typeof window.MenuMarginScanner,keys:window.MenuMarginScanner?Object.keys(window.MenuMarginScanner):[],scripts:[...document.scripts].map(s=>s.src)})));
  await page.waitForFunction(()=>Boolean(window.MenuMarginScanner?.scanFile));
  for(const expected of fixtures){
    const file=useJpeg?expected.sourceFile:(expected.originalFile||expected.sourceFile);
    console.log(`\n${expected.sampleId} · ${browserName} · ${file}`);
    const started=Date.now();
    try{
      const captured=await page.evaluate(async({file,prefix})=>{
        const response=await fetch(prefix+'samples/'+file);if(!response.ok)throw new Error('Sample could not be loaded.');
        const blob=await response.blob();const input=new File([blob],file,{type:blob.type});
        const result=await window.MenuMarginScanner.scanFile(input,{onProgress:window.sampleProgress});
        const encode=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
        const images=[];for(const p of result.pages)images.push({pageNumber:p.pageNumber,cleaned:await encode(p.cleaned),overlay:await encode(p.overlay)});
        const document=JSON.parse(JSON.stringify(result,(key,value)=>value instanceof Blob?undefined:value));
        return {document,images};
      },{file,prefix});
      documents.set(expected.sampleId,captured.document);
      const folder=path.join(runFolder,expected.sampleId);await mkdir(folder,{recursive:true});
      for(const image of captured.images)for(const key of ['cleaned','overlay'])await writeFile(path.join(folder,`${key}-p${image.pageNumber}.png`),Buffer.from(image[key].split(',')[1],'base64'));
      await writeFile(path.join(folder,'positioned-result.json'),JSON.stringify(captured.document,null,2));
      const report=evaluateSample(captured.document,expected);report.debugFolder=path.relative(root,folder);report.elapsedSeconds=(Date.now()-started)/1000;reports.push(report);console.log(formatEvaluation(report));
    }catch(error){console.error(`${expected.sampleId}: SCANNER FAILED: ${error.message}`);reports.push({sampleId:expected.sampleId,passed:false,error:error.message,fields:{},mismatches:[]});}
  }
  const groups=[];
  for(const group of manifest.documentGroups||[]){
    if(!group.samples.every(id=>documents.has(id)))continue;
    const combined=combinePages(group.samples.flatMap(id=>documents.get(id).pages),{filename:group.id});
    const actual=combined.validation.sumLineTotals,ok=Math.abs(actual-group.subtotal)<=.03&&combined.rows.length===group.rowCount&&combined.validation.missingPages.length===0;
    const report={id:group.id,expectedRows:group.rowCount,actualRows:combined.rows.length,expectedSubtotal:group.subtotal,actualSubtotal:actual,subtotalDifference:Math.round((actual-group.subtotal)*100)/100,missingPages:combined.validation.missingPages,passed:ok};groups.push(report);console.log('\nCombined invoice:',JSON.stringify(report));
  }
  const fields={};for(const report of reports)for(const [key,value] of Object.entries(report.fields||{})){fields[key]??={correct:0,total:0};fields[key].correct+=value.correct;fields[key].total+=value.total;}
  console.log('\nPER-FIELD ACCURACY (all expected rows, including missing rows)');
  for(const [key,value] of Object.entries(fields)){
    value.accuracy=value.total?value.correct/value.total*100:null;
    const old=previous?.datasetHash===datasetHash?previous.fields?.[key]?.accuracy:null;
    value.delta=old===null||old===undefined||value.accuracy===null?null:value.accuracy-old;
    console.log(`${key.padEnd(18)} ${value.correct}/${value.total} ${value.accuracy?.toFixed(2)??'n/a'}%${value.delta===null?' · first baseline':` · ${value.delta>=0?'+':''}${value.delta.toFixed(2)} percentage points`}`);
  }
  const passed=reports.every(r=>r.passed)&&groups.every(g=>g.passed)&&networkViolations.length===0;
  const report={createdAt:new Date().toISOString(),browser:browserName,source:useJpeg?'orientation-normalised JPEG':'original HEIC',debugFolder:path.relative(root,runFolder),datasetHash,fields,reports,groups,networkViolations,passed};
  await writeFile(path.join(debugRoot,`last-report-${browserName}${useJpeg?'-jpeg':''}.json`),JSON.stringify(report,null,2));
  await mkdir(path.join(debugRoot,'reports'),{recursive:true});await writeFile(path.join(debugRoot,'reports',`${report.createdAt.replace(/[:.]/g,'-')}-${browserName}.json`),JSON.stringify(report,null,2));
  console.log(`\n${passed?'PASS':'FAIL'} — ${reports.length} samples; ${networkViolations.length} external or upload requests. Debug images and full mismatches saved in scanner-debug/.`);
  if(!passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
