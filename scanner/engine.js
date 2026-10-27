import { PaddleOCR, initOpenCvRuntime } from './paddleocr/index.ts';
import { preprocessImage } from './preprocess.js';
import { extractPage } from './table.js';
import { refineUnreadableCells } from './refine.js';

const assetsBase=new URL('./',self.location.href);
let runtimePromise=null,busy=false;
async function runtime(progress){
  if(!runtimePromise)runtimePromise=(async()=>{
    progress('Loading local OpenCV and PaddleOCR models…');
    const {cv}=await initOpenCvRuntime();
    const ocr=await PaddleOCR.create({
      worker:false,
      textDetectionModelName:'PP-OCRv5_mobile_det',
      textDetectionModelAsset:{url:new URL('models/PP-OCRv5_mobile_det_onnx_infer.tar',assetsBase).href},
      textRecognitionModelName:'en_PP-OCRv5_mobile_rec',
      textRecognitionModelAsset:{url:new URL('models/en_PP-OCRv5_mobile_rec_onnx_infer.tar',assetsBase).href},
      textDetectionBatchSize:1,textRecognitionBatchSize:2,
      textDetLimitSideLen:1536,textDetLimitType:'max',textDetMaxSideLimit:2600,
      textDetThresh:.2,textDetBoxThresh:.5,textDetUnclipRatio:1.5,textRecScoreThresh:0,
      ortOptions:{backend:'wasm',numThreads:1,simd:true,proxy:false,wasmPaths:assetsBase.href}
    });
    return {cv,ocr};
  })().catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}
self.addEventListener('message',async event=>{
  const {id,pixels,pageNumber=1}=event.data||{};if(!id||!pixels)return;
  const progress=message=>self.postMessage({id,type:'progress',message});
  if(busy){self.postMessage({id,type:'error',error:'The local scanner is already reading another page.'});return;}
  busy=true;let prepared=null;
  try{
    const {cv,ocr}=await runtime(progress);
    progress('Finding the paper edges and removing shadows…');
    prepared=preprocessImage(cv,{width:pixels.width,height:pixels.height,data:new Uint8ClampedArray(pixels.data)});
    progress('Reading positioned words with PaddleOCR on this device…');
    const [ocrResult]=await ocr.predict(prepared.mat,{textRecScoreThresh:0});
    const words=[];
    for(let li=0;li<(ocrResult?.items||[]).length;li++){
      const line=ocrResult.items[li];
      for(let wi=0;wi<(line.words||[]).length;wi++){
        const w=line.words[wi];words.push({id:`p${pageNumber}-l${li}-w${wi}`,text:w.text,confidence:w.score,poly:w.poly,lineId:`p${pageNumber}-l${li}`,positionSource:w.positionSource,startStep:w.startStep,endStep:w.endStep,alignmentClipped:w.alignmentClipped,characters:(line.characters||[]).filter(c=>c.startStep>=w.startStep&&c.endStep<=w.endStep)});
      }
    }
    progress('Detecting table columns and checking the invoice arithmetic…');
    const first=extractPage(words,{width:prepared.pixels.width,height:prepared.pixels.height,verticalRules:prepared.verticalRules,pageNumber});
    const refined=await refineUnreadableCells(ocr,prepared,words,first,{pageNumber,progress});
    const result=refined.page;result.rawWords=refined.words;result.refinements=refined.refinements;
    result.preprocessing=prepared.info;result.metrics=ocrResult?.metrics||{};result.lineDetections=(ocrResult?.items||[]).map(line=>({poly:line.poly,score:line.score,wordCount:line.words?.length||0}));
    result.warnings.push(...prepared.info.warnings);
    const clean={width:prepared.pixels.width,height:prepared.pixels.height,data:prepared.pixels.data.buffer};
    self.postMessage({id,type:'result',page:result,cleaned:clean},[clean.data]);
  }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
  finally{prepared?.mat?.delete();prepared?.binaryMat?.delete();busy=false;}
});
