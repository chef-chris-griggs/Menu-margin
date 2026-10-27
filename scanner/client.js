import { decodeFilePages } from './decode.js';
import { combinePages } from './table.js';

const assetsBase=new URL('./',document.currentScript?.src||document.baseURI);
let worker=null,requestId=0,scanning=false;
export const engineVersion='2.0.0-positioned-paddleocr';
function getWorker(){if(!worker)worker=new Worker(new URL('scanner.worker.js',assetsBase),{type:'module',name:'MenuMargin local PaddleOCR'});return worker;}
export function reset(){worker?.terminate();worker=null;}
function recognise(pixels,pageNumber,{onProgress,signal}={}){
  return new Promise((resolve,reject)=>{
    const target=getWorker(),id=++requestId;
    const cleanup=()=>{target.removeEventListener('message',message);target.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reset();reject(new DOMException('Invoice scan cancelled.','AbortError'));};
    const fail=event=>{cleanup();reset();reject(new Error(event.message||'The local OCR worker failed.'));};
    const message=event=>{if(event.data?.id!==id)return;if(event.data.type==='progress')onProgress?.(event.data.message);else if(event.data.type==='result'){cleanup();resolve(event.data);}else if(event.data.type==='error'){cleanup();reset();reject(new Error(event.data.error));}};
    target.addEventListener('message',message);target.addEventListener('error',fail);signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    target.postMessage({id,pageNumber,pixels:{width:pixels.width,height:pixels.height,data:pixels.data.buffer}},[pixels.data.buffer]);
  });
}
function canvasBlob(canvas,type='image/png'){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the scanner debug image.')),type));}
async function imageBlobs(cleaned,words){
  const canvas=document.createElement('canvas');canvas.width=cleaned.width;canvas.height=cleaned.height;
  const context=canvas.getContext('2d',{alpha:false});context.putImageData(new ImageData(new Uint8ClampedArray(cleaned.data),cleaned.width,cleaned.height),0,0);
  const cleanBlob=await canvasBlob(canvas);
  context.lineWidth=Math.max(1,cleaned.width/1600);context.font=`${Math.max(9,cleaned.width/160)}px sans-serif`;
  for(const word of words){context.strokeStyle=word.confidence<.86?'#b45309':'#087f5b';context.beginPath();word.poly.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p));context.closePath();context.stroke();}
  const overlay=await canvasBlob(canvas);canvas.width=0;canvas.height=0;
  return {cleaned:cleanBlob,overlay};
}
export async function scanFiles(files,{onProgress,signal}={}){
  if(scanning)throw new Error('An invoice scan is already in progress.');
  if(!files?.length)throw new Error('Choose an invoice PDF or photo.');
  if(files.length>12)throw new Error('Choose at most 12 photos for one invoice.');
  if(files.some(file=>file.size>30*1024*1024))throw new Error('Each invoice file must be smaller than 30 MB.');
  scanning=true;const pages=[],hashes=new Set(),warnings=[];
  try{
    for(const file of files){
      if(signal?.aborted)throw new DOMException('Invoice scan cancelled.','AbortError');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hashes.has(hash)){warnings.push(`Duplicate photo ${file.name} was skipped.`);continue;}hashes.add(hash);
      for await(const decoded of decodeFilePages(file,{assetsBase,onProgress,signal,pageStart:pages.length+1})){
        if(pages.length>=12)throw new Error('Read at most 12 pages in one invoice. Split larger invoices into smaller files.');
        const response=await recognise(decoded.pixels,pages.length+1,{onProgress,signal});
        const blobs=await imageBlobs(response.cleaned,response.page.words);
        if(signal?.aborted)throw new DOMException('Invoice scan cancelled.','AbortError');
        pages.push({...response.page,...blobs,original:decoded.original,sourceName:decoded.sourceName,sourceHash:hash,decode:decoded.decode,width:response.cleaned.width,height:response.cleaned.height});
      }
    }
    const result=combinePages(pages,{filename:files.map(f=>f.name).join(', ')});
    if(result.validation.blockingIssues.length)throw new Error(result.warnings.filter(w=>/different invoice numbers|different delivery note numbers|More than one photo/.test(w)).join(' '));
    result.warnings.push(...warnings);onProgress?.('Scan complete. Check the photographed rows before importing.');return result;
  }finally{scanning=false;}
}
export async function scanFile(file,options){return scanFiles([file],options);}
