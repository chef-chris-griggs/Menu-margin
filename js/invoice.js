// v0.6 Invoice scanner beta. OCR runs in-browser; review is required before import.
const invoiceStatus=(message)=>{$('invoiceProgress').textContent=message};
function invoiceToast(message){$('invoiceToast').textContent=message}
function extractInvoiceReferences(text){
 const lines=String(text||'').split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
 const result={invoice:'',order:''};
 const patterns={
  invoice:/\b(?:tax\s+)?invoice\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{2,})/i,
  order:/\b(?:(?:web\s*\/\s*)?order)\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{2,})/i
 };
 for(const kind of ['invoice','order']){
  for(let i=0;i<lines.length&&!result[kind];i++){
   const match=lines[i].match(patterns[kind]);
   const candidate=match&&match[1]&&/\d/.test(match[1])?match[1].replace(/[.,;:]$/,''):'';
   if(candidate){result[kind]=candidate;break}
   const labelOnly=kind==='invoice'?/\b(?:tax\s+)?invoice\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:#-]?\s*$/i:/\b(?:(?:web\s*\/\s*)?order)\s*(?:no\.?|number|#|ref(?:erence)?)\s*[:#-]?\s*$/i;
   const next=(lines[i+1]||'').match(/^([A-Z0-9][A-Z0-9./-]{2,})$/i);
   if(labelOnly.test(lines[i])&&next&&/\d/.test(next[1]))result[kind]=next[1].replace(/[.,;:]$/,'');
  }
 }
 return result;
}
function syncInvoiceReferences(text){
 const refs=extractInvoiceReferences(text);
 [['invoiceNumber',refs.invoice],['invoiceOrderNumber',refs.order]].forEach(([id,value])=>{
  const field=$(id),previous=field.dataset.autoValue||'';
  if(field.value.trim()===previous||(!field.value.trim()&&value)){field.value=value;field.dataset.autoValue=value}
 });
 return refs;
}
function syncInvoiceSupplier(text){
 const field=$('invoiceSupplier'),previous=field.dataset.autoValue||'';
 const known=[
  {name:'Fresh Direct',pattern:/\bfresh\s*direct\b/i},
  {name:'Bidfood',pattern:/\bbid\s*food\b/i},
  {name:'Brakes',pattern:/\bbrakes\b/i},
  {name:'Sysco',pattern:/\bsysco\b/i},
  {name:'JJ Foodservice',pattern:/\bj\s*\.?\s*j\s*\.?\s*food\s*service\b/i},
  {name:'3663',pattern:/\b3663\b/}
 ];
 const detected=known.find(supplier=>supplier.pattern.test(text))?.name||'';
 if(field.value.trim()===previous||!field.value.trim()){
  field.value=detected;field.dataset.autoValue=detected;
 }
 return detected;
}
function clearInvoiceScanner(){
 $('invoiceFile').value='';$('invoiceText').value='';$('invoiceNumber').value='';$('invoiceOrderNumber').value='';$('invoiceNumber').dataset.autoValue='';$('invoiceOrderNumber').dataset.autoValue='';$('invoiceReviewRows').innerHTML='';$('invoiceReviewArea').hidden=true;
 $('invoiceFileName').textContent='No invoice selected';
 const supplier=$('invoiceSupplier');if(supplier.value.trim()===supplier.dataset.autoValue)supplier.value='';supplier.dataset.autoValue='';
 invoiceStatus('Choose a supplier invoice to read its prices.');invoiceToast('');
}
function loadScriptOnce(src,test){
 return new Promise((resolve,reject)=>{
  if(test()){resolve();return}
  const absolute=new URL(src,document.baseURI).href;
  const existing=[...document.scripts].find(script=>script.src===absolute);
  if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('A local invoice scanning library could not be loaded. Reload MenuMargin and try again.')),{once:true});return}
  const script=document.createElement('script');script.src=absolute;script.async=true;
  script.onload=resolve;script.onerror=()=>reject(new Error('A local invoice scanning library could not be loaded. Reload MenuMargin and try again.'));
  document.head.appendChild(script);
 });
}
function invoiceIsHeic(file){return /\.(?:heic|heif)$/i.test(file.name)||/heic|heif/i.test(file.type)}
async function invoiceDecodeImage(blob){
 if(window.createImageBitmap){
  try{return await createImageBitmap(blob,{imageOrientation:'from-image'})}catch{}
  try{return await createImageBitmap(blob)}catch{}
 }
 const url=URL.createObjectURL(blob);
 try{const image=new Image();image.src=url;await image.decode();image._invoiceObjectUrl=url;return image;}
 catch(error){URL.revokeObjectURL(url);throw error;}
}
async function invoiceConvertHeic(file){
 await loadScriptOnce('./vendor/heic2any/heic2any.min.js',()=>typeof window.heic2any==='function');
 const converted=await window.heic2any({blob:file,toType:'image/jpeg',quality:.94});
 return Array.isArray(converted)?converted[0]:converted;
}
async function* invoiceFilePages(file){
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  await loadScriptOnce('./vendor/pdfjs/pdf.min.js',()=>!!window.pdfjsLib);
  const pdfjs=window.pdfjsLib;pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.js',document.baseURI).href;
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
  const pageCount=Math.min(pdf.numPages,12);
  if(pdf.numPages>pageCount)invoiceStatus(`This invoice has ${pdf.numPages} pages. Scanning the first ${pageCount}; split larger invoices into smaller PDFs.`);
  try{
   for(let pageNo=1;pageNo<=pageCount;pageNo++){
    invoiceStatus(`Preparing page ${pageNo} of ${pageCount}…`);
    const page=await pdf.getPage(pageNo),base=page.getViewport({scale:1}),scale=Math.min(1.65,2100/Math.max(base.width,base.height)),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
    canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;
    yield {canvas,pageNo,pageCount,isPhoto:false};
    canvas.width=0;canvas.height=0;page.cleanup();
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{await pdf.destroy();}
  return;
 }
 let imageBlob=file;
 if(invoiceIsHeic(file)){
  invoiceStatus('Converting iPhone HEIC photo…');
  try{imageBlob=await invoiceConvertHeic(file);}
  catch(error){throw new Error('Could not convert this HEIC photo. Try sharing the original photo again or choose a JPEG version. '+(error.message||''));}
 }
 const image=await invoiceDecodeImage(imageBlob);
 try{
  const scale=Math.min(1,2200/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d',{alpha:false});context.filter='grayscale(1) contrast(1.22) brightness(1.03)';context.drawImage(image,0,0,canvas.width,canvas.height);context.filter='none';
  yield {canvas,pageNo:1,pageCount:1,isPhoto:true};
  canvas.width=0;canvas.height=0;
 }finally{
  if(typeof image.close==='function')image.close();
  if(image._invoiceObjectUrl)URL.revokeObjectURL(image._invoiceObjectUrl);
 }
}
function invoiceEnhancePhoto(source){
 const out=document.createElement('canvas');out.width=source.width;out.height=source.height;
 const context=out.getContext('2d',{alpha:false});context.filter='grayscale(1) contrast(1.42) brightness(1.08)';context.drawImage(source,0,0);context.filter='none';
 return out;
}
function invoiceRowsFromTsv(tsv){
 const tokens=[];
 for(const row of String(tsv||'').split(/\r?\n/).slice(1)){
  const c=row.split('\t');if(c.length<12||c[0]!=='5')continue;
  const left=Number(c[6]),top=Number(c[7]),width=Number(c[8]),height=Number(c[9]),confidence=Number(c[10]),word=(c[11]||'').trim();
  if(!word||!Number.isFinite(left)||!Number.isFinite(top)||!(height>0)||confidence<0)continue;
  tokens.push({left,centerX:left+width/2,center:top+height/2,width,height,confidence,word});
 }
 if(!tokens.length)return {text:'',records:[],quality:0};
 const heights=tokens.map(t=>t.height).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)],tolerance=Math.max(7,median*.72);
 const bands=[];
 tokens.slice().sort((a,b)=>a.center-b.center||a.left-b.left).forEach(token=>{
  let band=bands[bands.length-1];
  if(!band||Math.abs(token.center-band.center)>tolerance){band={center:token.center,tokens:[]};bands.push(band)}
  band.tokens.push(token);band.center=band.tokens.reduce((sum,t)=>sum+t.center,0)/band.tokens.length;
 });
 const positioned=bands.map(b=>b.tokens.sort((a,c)=>a.left-c.left).map(t=>t.word).join(' ')).join('\n');
 const maxY=Math.max(...tokens.map(t=>t.center+t.height/2)),minY=Math.min(...tokens.map(t=>t.center));
 const codeWord=/^(?:[A-Za-z]{1,4}\d{4,8}|\d{4,8})$/;
 const candidates=tokens.filter(t=>t.center>minY+(maxY-minY)*.2&&codeWord.test(t.word));
 if(candidates.length<3)return {text:positioned,records:[],quality:0};
 const xTolerance=Math.max(24,median*2.2);
 const cluster=candidates.map(candidate=>({x:candidate.left,count:candidates.filter(t=>Math.abs(t.left-candidate.left)<=xTolerance).length})).sort((a,b)=>b.count-a.count)[0];
 let anchorX=cluster.x;
 const clusteredCodeCandidates=candidates.filter(t=>Math.abs(t.left-cluster.x)<=xTolerance);
 const firstCodeY=Math.min(...clusteredCodeCandidates.map(t=>t.center));
 const headerBand=tokens.filter(t=>t.center<firstCodeY&&t.center>firstCodeY-median*12);
 const pageLeft=Math.min(...tokens.map(t=>t.left)),pageRight=Math.max(...tokens.map(t=>t.left+t.width));
 const normalizeHeader=value=>String(value||'').toLowerCase().replace(/[^a-z]/g,'');
 const centerOf=word=>{
  const hits=headerBand.filter(t=>word.test(normalizeHeader(t.word))).sort((a,b)=>b.center-a.center);
  return hits.length?hits[0].centerX:null;
 };
 const nearestPair=(firstRx,secondRx)=>{
  const firsts=headerBand.filter(t=>firstRx.test(normalizeHeader(t.word)));
  const pairs=[];
  for(const first of firsts){
   for(const second of headerBand.filter(t=>secondRx.test(normalizeHeader(t.word))&&Math.abs(t.center-first.center)<median*2&&Math.abs(t.centerX-first.centerX)<Math.max(median*4,(pageRight-pageLeft)*.08))){
    pairs.push({first,second,score:Math.abs(second.center-first.center)+Math.abs(second.centerX-first.centerX)});
   }
  }
  pairs.sort((a,b)=>a.score-b.score);
  return pairs.length?(pairs[0].first.centerX+pairs[0].second.centerX)/2:null;
 };
 const header={
  code:nearestPair(/^product$|^prod$/, /^code$/)??centerOf(/^productcode$/)??centerOf(/^code$/),
  description:centerOf(/^description$|^descriptio/),brand:centerOf(/^brand$/),
  pack:nearestPair(/^pack$/, /^size$/)??centerOf(/^packsize$|^pack$/),
  measure:centerOf(/^measure$|^measur/),unit:centerOf(/^unit$/),
  quantity:centerOf(/^quantity$|^quantit/),ordered:centerOf(/^ordered$/),
  unitPrice:nearestPair(/^unit$/, /^price$/)??centerOf(/^unitprice$/),price:null,vat:centerOf(/^vat$/),total:centerOf(/^total$/)
 };
 const priceHeaders=headerBand.filter(t=>/^price$/.test(normalizeHeader(t.word))).sort((a,b)=>a.centerX-b.centerX);
 const nextPriceHeader=priceHeaders.find(t=>header.unitPrice===null||t.centerX>header.unitPrice+Math.max(median*1.5,(pageRight-pageLeft)*.02));
 header.price=nextPriceHeader?.centerX??null;
 if(header.code!==null)anchorX=header.code;
 const anchorWindow=Math.max(xTolerance, (pageRight-pageLeft)*.045);
 const codeTokens=candidates.filter(t=>Math.abs(t.left-anchorX)<=anchorWindow).sort((a,b)=>a.center-b.center);
 const uniqueAnchors=[];
 for(const token of codeTokens){
  const previous=uniqueAnchors[uniqueAnchors.length-1];
  if(previous&&Math.abs(token.center-previous.center)<=median*1.2){if(token.confidence>previous.confidence)uniqueAnchors[uniqueAnchors.length-1]=token;continue}
  uniqueAnchors.push(token);
 }
 if(uniqueAnchors.length<3)return {text:positioned,records:[],quality:0};
 const anchorCenters=uniqueAnchors.map(t=>t.center),minAnchorY=Math.min(...anchorCenters),maxAnchorY=Math.max(...anchorCenters);
 const headerBaseline=headerBand.filter(t=>/^(?:description|brand|vat|total)$/.test(normalizeHeader(t.word))&&t.center>firstCodeY-median*8);
 let bestSlope=0;
 if(headerBaseline.length>=3){
  const meanX=headerBaseline.reduce((sum,t)=>sum+t.centerX,0)/headerBaseline.length,meanY=headerBaseline.reduce((sum,t)=>sum+t.center,0)/headerBaseline.length;
  const variance=headerBaseline.reduce((sum,t)=>sum+(t.centerX-meanX)**2,0),covariance=headerBaseline.reduce((sum,t)=>sum+(t.centerX-meanX)*(t.center-meanY),0);
  const estimated=variance?covariance/variance:0;
  if(Math.abs(estimated)<=.25&&Math.max(...headerBaseline.map(t=>t.centerX))-Math.min(...headerBaseline.map(t=>t.centerX))>(pageRight-pageLeft)*.35)bestSlope=estimated;
 }
 if(!bestSlope){
  const scoreSlope=slope=>{
   let score=0;
   for(const token of tokens){
    const rowY=token.center-slope*(token.left-anchorX);
    if(rowY<minAnchorY-median*2||rowY>maxAnchorY+median*2)continue;
    let nearest=Infinity;
    for(const center of anchorCenters)nearest=Math.min(nearest,Math.abs(rowY-center));
    if(nearest<tolerance*1.8)score+=1-nearest/(tolerance*1.8);
   }
   return score;
  };
  const flatScore=scoreSlope(0);let bestScore=flatScore;
  for(let slope=-.25;slope<=.2501;slope+=.0025){
   const score=scoreSlope(slope);
   if(score>bestScore+.05||(Math.abs(score-bestScore)<=.05&&Math.abs(slope)<Math.abs(bestSlope))){bestScore=score;bestSlope=slope}
  }
  if(bestScore<flatScore*1.025)bestSlope=0;
 }
 let rowAnchors=uniqueAnchors.map(t=>({...t,rowCenter:t.center-bestSlope*(t.left-anchorX),code:t.word,anchorKind:'code'})).sort((a,b)=>a.rowCenter-b.rowCenter);
 const rowTokens=tokens.map(t=>({...t,rowCenter:t.center-bestSlope*(t.left-anchorX)}));
 const mid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?(a+b)/2:null;
 const column={
  code:header.code,
  description:header.description,
  brand:header.brand,
  pack:header.pack,
  measure:header.measure,
  unit:header.unit,
  quantity:header.quantity,
  unitPrice:header.unitPrice,
  price:header.price,
  vat:header.vat,
  total:header.total
 };
 const descLeft=mid(column.code,column.description),descRight=column.brand!==null?mid(column.description,column.brand)+(pageRight-pageLeft)*.012:mid(column.description,column.pack);
 const packLeft=column.brand!==null?mid(column.brand,column.pack):mid(column.description,column.pack),packRight=column.measure!==null?mid(column.pack,column.measure):mid(column.pack,column.quantity);
 const measureLeft=column.measure!==null?mid(column.pack,column.measure):mid(column.pack,column.unit),measureRight=column.quantity!==null?mid(column.measure??column.unit,column.quantity):null;
 const qtyLeft=column.quantity!==null?mid(column.unit??column.measure,column.quantity):null,qtyRight=mid(column.quantity,column.unitPrice);
 const priceLeft=mid(column.quantity,column.unitPrice),priceRight=column.price!==null?mid(column.unitPrice,column.price):mid(column.unitPrice,column.vat??column.total);
 const linePriceLeft=column.price!==null?mid(column.unitPrice,column.price):null,linePriceRight=column.vat!==null?mid(column.price,column.vat):mid(column.price,column.total);
 const totalLeft=column.total!==null?mid(column.vat??column.price,column.total):null,totalRight=pageRight+median;
 const within=(token,left,right)=>left!==null&&right!==null&&token.centerX>=Math.min(left,right)&&token.centerX<Math.max(left,right);
 const fieldText=(row, left, right)=>row.filter(t=>within(t,left,right)).sort((a,b)=>a.rowCenter-b.rowCenter||a.left-b.left).map(t=>t.word).join(' ').replace(/\s+/g,' ').trim();
 const layoutReady=column.code!==null&&column.description!==null&&column.pack!==null&&column.unitPrice!==null;
 if(layoutReady){
  const alternateAnchors=rowTokens.filter(t=>within(t,packLeft,packRight)&&/\d.*[-x].*\d/i.test(t.word)||within(t,priceLeft,priceRight)&&/(?:[.,]\d{2}|[£€$]\s*\d)/i.test(t.word));
  for(const token of alternateAnchors){
   if(rowAnchors.some(anchor=>Math.abs(anchor.rowCenter-token.rowCenter)<median*1.25))continue;
   rowAnchors.push({...token,code:'',anchorKind:'field'});
  }
  rowAnchors.sort((a,b)=>a.rowCenter-b.rowCenter);
  const distinctAnchors=[];
  for(const anchor of rowAnchors){
   const previous=distinctAnchors[distinctAnchors.length-1];
   if(previous&&Math.abs(anchor.rowCenter-previous.rowCenter)<median*1.1){if(anchor.anchorKind==='code'&&previous.anchorKind!=='code')distinctAnchors[distinctAnchors.length-1]=anchor;continue}
   distinctAnchors.push(anchor);
  }
  rowAnchors=distinctAnchors;
 }
 const moneyIn=text=>{
  const found=normaliseInvoiceMoneyText(text).match(/(?:[£€$]|\bE\s*)?\s*(\d{1,4}(?:,\d{3})*(?:[.,]\d{2})?)\b/);
  if(!found)return null;
  const value=parseMoney(found[1]);return Number.isFinite(value)&&value>=0?value:null;
 };
  const moneyNear=(row,x)=>{
  if(!Number.isFinite(x))return null;
  const radius=Math.max(median*6,(pageRight-pageLeft)*.07);
  const candidates=row.map(token=>{
   const word=String(token.word||'').trim();
   // Restrict this fallback to visible amounts: decimals, currency-marked values,
   // or whole-pence OCR such as £6427. This keeps quantities and pack counts out.
   const amountLike=/\d+[.,]\d{2}\b/.test(word)||/[£€$]/.test(word)||/^E\s*\d{3,}$/i.test(word)||/^\d{3,5}$/.test(word);
   if(!amountLike)return null;
   const value=moneyIn(word);
   return value===null?null:{value,distance:Math.abs(token.centerX-x)};
  }).filter(candidate=>candidate&&candidate.distance<=radius).sort((a,b)=>a.distance-b.distance);
  return candidates.length?candidates[0].value:null;
 };
 const records=rowAnchors.map((anchor,i)=>{
  const prev=rowAnchors[i-1],next=rowAnchors[i+1],top=anchor.rowCenter-median*.4;
  // Bidfood codes sit at the start of a variable-height product row. The next code starts the next row;
  // splitting at the midpoint cut off wrapped descriptions and made brands look like new products.
  const bottom=next?next.rowCenter-median*.4:anchor.rowCenter+Math.max(median*3,(anchor.rowCenter-(prev?.rowCenter??anchor.rowCenter-median*3))*.82);
  const row=rowTokens.filter(t=>t.rowCenter>=top&&t.rowCenter<bottom);
  const code=anchor.code||'';
  let description=fieldText(row,descLeft,descRight);
  let packText=fieldText(row,packLeft,packRight),measureText=fieldText(row,measureLeft,measureRight);
  let quantityText=fieldText(row,qtyLeft,qtyRight),unitPriceText=fieldText(row,priceLeft,priceRight),linePriceText=fieldText(row,linePriceLeft,linePriceRight);
  const totalText=column.total!==null?fieldText(row,totalLeft,totalRight):'';
  const raw=row.slice().sort((a,b)=>a.rowCenter-b.rowCenter||a.left-b.left).map(t=>t.word).join(' ');
  const descriptionLayout=descLeft!==null&&descRight!==null&&descRight>descLeft;
  const packLayout=packLeft!==null&&packRight!==null&&packRight>packLeft;
  const priceLayout=priceLeft!==null&&priceRight!==null&&priceRight>priceLeft;
  if(!descriptionLayout||!packLayout||!priceLayout){
   const sorted=row.slice().sort((a,b)=>a.left-b.left||a.rowCenter-b.rowCenter);
   const codeIndex=sorted.findIndex(t=>t===anchor),packIndex=sorted.findIndex(t=>/\d+(?:[.,]\d+)?\s*[-x]\s*\d/i.test(t.word));
   if(!description&&codeIndex>=0){description=sorted.slice(codeIndex+1,packIndex>codeIndex?packIndex:undefined).map(t=>t.word).join(' ')}
   if(!packText&&packIndex>=0)packText=sorted.slice(packIndex,packIndex+3).map(t=>t.word).join(' ');
   if(!unitPriceText){const tail=sorted.slice(Math.max(0,packIndex+1)).map(t=>t.word).join(' ');unitPriceText=tail}
  }
  const quantityMatch=quantityText.match(/\b\d+(?:[.,]\d+)?\b/),quantity=quantityMatch?parseAmount(quantityMatch[0]):0;
  const unitPrice=moneyIn(unitPriceText)??moneyNear(row,column.unitPrice),
        linePriceValue=moneyIn(linePriceText)??moneyNear(row,column.price),
        totalValue=moneyIn(totalText)??moneyNear(row,column.total),
        linePrice=linePriceValue===null?totalValue:linePriceValue;
  return {code,description,pack:packText,measure:measureText,quantity,unitPrice,linePrice,rowCenter:anchor.rowCenter,raw,codeConfidence:anchor.confidence};
 });
 const tableRecords=layoutReady?records.filter(r=>r.code||r.description||r.pack||r.unitPrice!==null):[];
 const recordText=tableRecords.map(r=>[r.code,r.description,r.pack,r.measure,r.quantity||'',r.unitPrice===null?'':r.unitPrice.toFixed(2),r.linePrice===null?'':r.linePrice.toFixed(2)].join('\t')).join('\n');
 const legacyLines=rowAnchors.map((anchor,i)=>{
  const next=rowAnchors[i+1],prev=rowAnchors[i-1],top=anchor.rowCenter-median*.4;
  const bottom=next?next.rowCenter-median*.4:anchor.rowCenter+Math.max(median*3,(anchor.rowCenter-(prev?.rowCenter??anchor.rowCenter-median*3))*.82);
  return rowTokens.filter(t=>t.rowCenter>=top&&t.rowCenter<bottom).sort((a,b)=>a.left-b.left||a.rowCenter-b.rowCenter).map(t=>t.word).join(' ');
 }).filter(Boolean);
 const structuredText=tableRecords.length?`\n--- MenuMargin positioned invoice rows: code | description | pack size | unit of measure | quantity | unit price | line total (tab-separated) ---\n${recordText}`:'';
 const text=`${positioned}\n--- Product rows grouped by item code ---\n${legacyLines.join('\n')}${structuredText}`;
 const completeness=tableRecords.reduce((sum,r)=>sum+1+(r.description?1:0)+(r.pack?1:0)+(r.unitPrice!==null?1:0)+(r.quantity?1:0),0);
 return {text,records:tableRecords,quality:tableRecords.length*10+completeness};
}
function invoiceProductCodeMatches(line){
 const text=String(line||'');
 return [...text.matchAll(/\b(?:[A-Za-z]{1,4}\d{4,8}|\d{4,8})\b/g)].filter(match=>!/[£€$]\s*$/.test(text.slice(Math.max(0,match.index-8),match.index)));
}
function invoiceTablePassScore(candidate){
 const structured=candidate?.records||[];
 if(structured.length)return structured.length*10+structured.reduce((sum,r)=>sum+(r.description?1:0)+(r.pack?1:0)+(r.unitPrice!==null?1:0),0);
 const rowsText=String(candidate?.rows||'');
 let inRows=false,score=0,rowCount=0;
 for(const raw of String(rowsText||'').split(/\r?\n/)){
  const line=raw.trim();
  if(/^---\s*product rows grouped by item code\s*---$/i.test(line)){inRows=true;continue}
  if(/^---/.test(line)){inRows=false;continue}
  if(!inRows||!line)continue;
  rowCount++;
  const codes=invoiceProductCodeMatches(line);
  score+=1+(codes.length?6:0)+(/\d\s*[-x]\s*\d/.test(line)?2:0)+(/[£€$]\s*\d|\b\d+[.,]\d{2}\b/.test(line)?2:0)+(/[A-Za-z]{3,}/.test(line)?2:0);
 }
 return rowCount?score:-1;
}
async function scanInvoiceFile(){
 const file=$('invoiceFile').files[0];if(!file){invoiceToast('Choose a PDF or photo first.');return}
 if(file.size>20*1024*1024){invoiceToast('Please use a file smaller than 20 MB.');return}
 $('scanInvoice').disabled=true;$('invoiceText').value='';
 try{
  invoiceStatus('Loading the offline invoice scanner…');
  await loadScriptOnce('./vendor/tesseract/tesseract.min.js',()=>!!window.Tesseract);
  const worker=await window.Tesseract.createWorker('eng',1,{
   workerPath:new URL('./vendor/tesseract/worker.min.js',document.baseURI).href,
   corePath:new URL('./vendor/tesseract/tesseract-core.wasm.js',document.baseURI).href,
   langPath:new URL('./vendor/tesseract/lang-data/',document.baseURI).href,
   logger:message=>{if(message.status==='recognizing text')invoiceStatus(`Reading invoice… ${Math.round((message.progress||0)*100)}%`);}
  });
  const chunks=[];
  try{
   await worker.setParameters({preserve_interword_spaces:'1'});
   for await(const page of invoiceFilePages(file)){
    const candidates=[];
    await worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.AUTO,preserve_interword_spaces:'1'});
    invoiceStatus(`Reading page ${page.pageNo} of ${page.pageCount}…`);
    const first=await worker.recognize(page.canvas,{}, {text:true,tsv:true});
    const firstTable=invoiceRowsFromTsv(first.data.tsv||'');
    candidates.push({modeName:'automatic',text:first.data.text||'',rows:firstTable.text,records:firstTable.records,quality:firstTable.quality});
    if(invoiceTablePassScore(candidates[0])<32){
     invoiceStatus(`Checking page ${page.pageNo} with a second layout pass…`);
     await worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});
     const target=page.isPhoto?invoiceEnhancePhoto(page.canvas):page.canvas;
     const second=await worker.recognize(target,{}, {text:true,tsv:true});
     const secondTable=invoiceRowsFromTsv(second.data.tsv||'');
     candidates.push({modeName:page.isPhoto?'high-contrast photo':'sparse',text:second.data.text||'',rows:secondTable.text,records:secondTable.records,quality:secondTable.quality});
     if(target!==page.canvas){target.width=0;target.height=0;}
    }
    const best=candidates.reduce((chosen,candidate)=>invoiceTablePassScore(candidate)>invoiceTablePassScore(chosen)?candidate:chosen,candidates[0]);
    const rawPasses=candidates.map(candidate=>`--- OCR text · ${candidate.modeName} ---\n${candidate.text}`).join('\n');
    chunks.push(`--- Page ${page.pageNo} ---\n${rawPasses}${best?.rows?`\n--- Selected table reconstruction · ${best.modeName} ---\n${best.rows}`:''}`);
    page.canvas.width=0;page.canvas.height=0;
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
   }
  }finally{await worker.terminate();}
  $('invoiceText').value=chunks.join('\n\n');
  const references=syncInvoiceReferences($('invoiceText').value);
  if(references.invoice||references.order)$('invoiceNumber').closest('.invoice-references').open=true;
  syncInvoiceSupplier($('invoiceText').value);
  invoiceStatus('Scan complete. Check each detected product and price against the invoice below.');
  buildInvoiceReview();
  if(!$('invoiceReviewArea').hidden)requestAnimationFrame(()=>$('invoiceReviewArea').scrollIntoView({behavior:'smooth',block:'start'}));
  if(!$('invoiceSupplier').value.trim())invoiceStatus('Scan complete. Enter the supplier name, then check each detected product below.');
 }catch(error){invoiceStatus('Could not scan this file.');invoiceToast(error.message||'The scan failed. Try a clearer image or PDF.');}
 finally{$('scanInvoice').disabled=false;}
}
function buildInvoiceReview(){
 const text=$('invoiceText').value.trim();
 if(!text){invoiceToast('Scan an invoice or paste extracted text first.');return}
 const invoiceRefs=syncInvoiceReferences(text),referenceValues=[invoiceRefs.invoice,invoiceRefs.order].filter(Boolean).map(value=>value.toLowerCase());
 const allLines=text.split(/\r?\n/).map(s=>s.replace(/ +/g,' ').trim()).filter(Boolean);
 const tableRows=[],structuredRows=[];let collectingTableRows=false,collectingStructuredRows=false;
 for(const line of allLines){
  if(/^---\s*MenuMargin positioned invoice rows:/i.test(line)){collectingStructuredRows=true;collectingTableRows=false;continue}
  if(/^---\s*product rows grouped by item code\s*---$/i.test(line)){collectingTableRows=true;continue}
  if(/^---/.test(line)){collectingTableRows=false;collectingStructuredRows=false;continue}
  if(collectingStructuredRows&&line.includes('\t')){structuredRows.push(line.split('\t'));continue}
  if(collectingTableRows&&line)tableRows.push(line);
 }
 const distinctTableCodes=new Set(tableRows.flatMap(line=>invoiceProductCodeMatches(line).map(match=>match[0])));
 const structuredCodeCount=new Set(structuredRows.map(row=>(row[0]||'').trim()).filter(Boolean)).size;
 const usingStructuredInvoiceRows=structuredRows.length>=4&&structuredCodeCount>=3;
 const usingPositionedTableRows=usingStructuredInvoiceRows||(tableRows.length>=6&&distinctTableCodes.size>=4);
 const lines=usingStructuredInvoiceRows?[]:usingPositionedTableRows?tableRows:allLines;
 const invoiceIsBidfood=/\b(?:bid\s*food|everyday\s+favourites|millhouse|new\s+york\s+bakery\s+company)\b/i.test(($('invoiceSupplier').value||'')+' '+text);
 const bidfoodBrands=['everyday favourites','everyday','new york bakery company','new york bakery','da vinci gourmet','davinci gourmet','tate & lyle','tate and lyle','millhouse','callebaut','davinci','alpro','cirio'];
 const isBidfoodBrandOnly=name=>{
  const words=String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  return !!words.length&&bidfoodBrands.some(brand=>{const brandWords=brand.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/);return words.length<=brandWords.length&&words.every((word,index)=>word===brandWords[index])});
 };
 const stripBidfoodBrand=name=>{
  if(!invoiceIsBidfood)return name;
  for(const brand of bidfoodBrands){const escaped=brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),tail=new RegExp('\\s+'+escaped+'\\s*$','i'),head=new RegExp('^'+escaped+'\\s+','i'),trimmed=name.replace(tail,'').replace(head,'').trim();if(trimmed!==name&&nameScore(trimmed)>3)return trimmed}
  return name;
 };
 const skip=/^(?:---\s*(?:page|product rows grouped by item code|(?:alternate\s+)?(?:table rows reconstructed|sparse layout)|enhanced photo(?: table rows reconstructed)?)|description\b|product\s+code|code\s+description|order date|delivery date|web\/order ref|your order ref|(?:tax\s+)?invoice(?:\s*(?:no\.?|number|#|ref(?:erence)?))?\b|(?:web\s*\/\s*)?order\s*(?:no\.?|number|#|ref(?:erence)?)\b|customer\s+(?:account\s+)?(?:no\.?|number|code)\b|page\s+\d+|[-_=]{4,}|total order value|order lines|item code|category\b|product\s+unit\s+of)/i;
 const codeRx=/\b([A-Za-z]{1,4}\d{4,8}|\d{4,8})\b/;
 const unitRx='(kilograms?|kgs?|kg|grams?|grammes?|gms?|gm|gr|g|litres?|liters?|ltr|litre|liter|millilitres?|milliliters?|ml|dzn|dozen|each|ea|pieces?|pcs?)';
 const categoryText='Dairy\\s+Eggs\\s+Juices|Herbs\\s+Spices\\s+Nuts|Meat\\s+Fish\\s+Poultry|Vegetables|Salad|Bakery|Frozen|Ambient';
 const categoryRx=new RegExp('\\b(?:'+categoryText+')\\b','i'),categoryGlobalRx=new RegExp('\\b(?:'+categoryText+')\\b','ig');
 const nameScore=value=>{const words=String(value||'').match(/[A-Za-z][A-Za-z']*/g)||[],generic=/^(?:item|name|not|read|description|code|unknown)$/i;return words.filter(w=>!generic.test(w)).reduce((score,w)=>score+w.length+2,0)};
 const toUnit=u=>/^(kg|kgs|kilogram)/i.test(u)?'kg':/^(g|gr|gram|gm)/i.test(u)?'g':/^(l|ltr|litre|liter)/i.test(u)?'l':/^(ml|millil)/i.test(u)?'ml':'each';
 const cleanDescription=value=>{
  let name=String(value||'').replace(/\s+/g,' ').trim();
  // Bidfood often appends its range in brackets and OCR leaves a dangling
  // bracket behind. Keep the actual product name, remove only that suffix.
  name=name.replace(/[\[\]]+\s*$/,'').trim();
  name=name.replace(/\s*[\[(]\s*(?:everyday\s+favourites|everyday|new\s+york\s+bakery(?:\s+company)?|millhouse|da\s*vinci(?:\s+gourmet)?)\s*[\])]\s*$/i,'').trim();
  name=name.replace(/[\[\]{}]+/g,' ').replace(/\s*[\[(]\s*$/,'').replace(/[|:;,.-]+$/,'').replace(/\s+/g,' ').trim();
  return stripBidfoodBrand(name);
 };
 const parseStructuredPack=(packValue,measureValue)=>{
  const packText=String(packValue||'').replace(/[×％]/g,'x').replace(/\b(\d+(?:[.,]\d+)?)\s*gm\b/ig,'$1g').trim();
  const measureText=String(measureValue||'').replace(/[×％]/g,'x').replace(/\b(\d+(?:[.,]\d+)?)\s*gm\b/ig,'$1g').trim();
  const combined=[packText,measureText].filter(Boolean).join(' ');
  const packRe=new RegExp('(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*[-x]\\s*(?:(\\d+(?:[.,]\\d+)?)\\s*x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*'+unitRx+'\\b','i');
  let match=packRe.exec(combined);
  if(!match)match=/\b(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*)(kilograms?|kgs?|kg|grams?|grammes?|gms?|gm|gr|g|litres?|liters?|ltr|litre|liter|millilitres?|milliliters?|ml|dzn|dozen|each|ea|pieces?|pcs?)\b/i.exec(combined);
  if(match){
   const sizeToken=match.length===5?match[3]:match[2],unitToken=match.length===5?match[4]:match[3];
   let caseCount=parseAmount(match[1])*(match.length===5&&match[2]?parseAmount(match[2]):1),eachSize=parseAmount(sizeToken),unit=toUnit(unitToken);
   if(/^dzn|dozen$/i.test(unitToken)){eachSize*=12;unit='each'}
   if(unit==='each'&&match.length===5&&!match[2]&&caseCount===1&&eachSize>1){caseCount=eachSize;eachSize=1}
   return {caseCount,eachSize,unit,packMissing:false};
  }
  const values=[...combined.matchAll(/\b\d+(?:[.,]\d+)?\b/g)].map(m=>parseAmount(m[0])).filter(Number.isFinite);
  const unitMatch=combined.match(new RegExp(unitRx,'i'));
  if(values.length>=2)return {caseCount:values[0],eachSize:values[1],unit:unitMatch?toUnit(unitMatch[0]):'each',packMissing:false};
  if(values.length===1&&unitMatch)return {caseCount:1,eachSize:values[0],unit:toUnit(unitMatch[0]),packMissing:false};
  return {caseCount:0,eachSize:0,unit:unitMatch?toUnit(unitMatch[0]):'each',packMissing:true};
 };
 const rows=[];
 if(usingStructuredInvoiceRows){
  for(const fields of structuredRows){
   const [codeValue='',descriptionValue='',packValue='',measureValue='',quantityValue='',unitPriceValue='',lineTotalValue='']=fields;
   const code=String(codeValue).trim(),rawName=String(descriptionValue).replace(/\s+/g,' ').trim();
   // The description cell already excludes Bidfood's separate Brand cell.
   // Keep the wording printed in Description, including a brand when it is part of the product name.
   const name=cleanDescription(rawName);
   const parsedPack=parseStructuredPack(packValue,measureValue),caseCount=parsedPack.caseCount,eachSize=parsedPack.eachSize,unit=parsedPack.unit,packMissing=parsedPack.packMissing;
   const quantity=parseAmount(String(quantityValue).replace(/[^\d.,]/g,''))||0;
   const unitPriceText=String(unitPriceValue).trim(),lineTotalText=String(lineTotalValue).trim();
   if(!code&&!rawName&&!packValue&&!measureValue&&!quantityValue&&!unitPriceText&&!lineTotalText)continue;
   const selectedPrice=invoiceSelectPrice(unitPriceText,lineTotalText,quantity);
   const price=selectedPrice?.value??null,priceInferred=selectedPrice?.inferred??false;
   const nameMissing=nameScore(name)<3||isBidfoodBrandOnly(name);
   const displayName=nameMissing?(code?`Item ${code} — name not read`:rawName?`Possible product — name needs review`:'Possible product — name not read'):name;
   if(!displayName&&!code&&price===null&&!rawName&&!packValue&&!quantityValue)continue;
   rows.push({code,name:displayName,nameMissing,caseCount,eachSize,unit,price:Number.isFinite(price)?price:null,priceInferred,packMissing,raw:`${code} | ${rawName} | ${packValue} | ${measureValue} | qty ${quantityValue} | unit ${unitPriceValue} | total ${lineTotalValue}`});
  }
 }
 if(!usingStructuredInvoiceRows)for(const rawLine of lines){
  if(skip.test(rawLine)||referenceValues.includes(rawLine.replace(/[^a-z0-9]/gi,'').toLowerCase()))continue;
  const positionedCodes=usingPositionedTableRows?invoiceProductCodeMatches(rawLine).map(match=>match[0]):[];
  const packClues=usingPositionedTableRows?(rawLine.match(/\b\d+(?:[.,]\d+)?\s*(?:[-x]\s*\d+(?:[.,]\d+)?\s*)?(?:kilograms?|kgs?|kg|grams?|grammes?|gms?|gm|gr|g|litres?|liters?|ltr|litre|liter|millilitres?|milliliters?|ml|dzn|dozen|each|ea|pieces?|pcs?)\b/ig)||[]):[];
  if(positionedCodes.length>1||packClues.length>1){
   const ambiguousCount=Math.max(positionedCodes.length,packClues.length);
   for(let i=0;i<ambiguousCount;i++){
    const ambiguousCode=positionedCodes[i]||'';
    rows.push({code:ambiguousCode,name:ambiguousCode?`Item ${ambiguousCode} — name not read`:`Possible product ${i+1} — details need review`,nameMissing:true,caseCount:1,eachSize:0,unit:'each',price:null,priceInferred:false,packMissing:true,raw:`Ambiguous OCR row: ${rawLine}`});
   }
   continue;
  }
  const line=rawLine.replace(/[×％]/g,'x').replace(/(\d)\s*%\s*(?=\d)/g,'$1x').replace(/\b(\d+(?:[.,]\d+)?)\s*gm\b/ig,'$1g').replace(/(\d)\s*[.,]\s+(\d{1,2})\b/g,'$1.$2').replace(/([£€$]\s*\d{1,3})\s+(\d{2})(?!\d)/g,'$1.$2').replace(/\s+/g,' ').trim();
  const codeMatch=invoiceProductCodeMatches(line)[0]||null,code=codeMatch?codeMatch[0]:'';
  // Keep case count and item size distinct: 40x250g is 40 items of 250 g,
  // while an order quantity later in the row is only used to resolve its price.
  const number='(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:[.,]\\d+)?';
  const packRe=new RegExp('(?:^|\\s)('+number+')\\s*[-x]\\s*(?:('+number+')\\s*x\\s*)?('+number+')\\s*'+unitRx+'\\b','i');
  let pm=packRe.exec(line),caseCount=0,eachSize=0,unit='each',packIndex=-1,packEnd=0;
  if(pm){
   caseCount=parseAmount(pm[1])*(pm[2]?parseAmount(pm[2]):1);eachSize=parseAmount(pm[3]);const u=pm[4];unit=toUnit(u);packIndex=line.indexOf(pm[0].trim());packEnd=packIndex+pm[0].trim().length;
   if(/^dzn|dozen$/i.test(u)){eachSize*=12;unit='each'}
   if(unit==='each'&&!pm[2]&&caseCount===1&&eachSize>1){caseCount=eachSize;eachSize=1}
  }else{
   // Countable packs such as 1x1 often have no printed unit.
   const countPack=new RegExp('\\b('+number+')\\s*x\\s*('+number+')\\b','i').exec(line);
   if(countPack){caseCount=parseAmount(countPack[1]);eachSize=parseAmount(countPack[2]);packIndex=line.indexOf(countPack[0]);packEnd=packIndex+countPack[0].length;unit='each'}
  }
  const packMissing=!(caseCount>0&&eachSize>0);
  // Keep identifiable rows when OCR loses the code or pack size, so the user
  // can fill missing details instead of the product disappearing entirely.
  const hasCurrencyPrice=/[£€$]\s*\d/.test(line);
  if(packMissing){
   const possiblePositionedName=usingPositionedTableRows&&nameScore(line)>=6;
   if(!codeMatch&&!hasCurrencyPrice&&!possiblePositionedName)continue;
   caseCount=1;eachSize=0;unit='each';
  }
  const currencyTokens=[...line.matchAll(/[£€$]\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{1,2})?)/g)].map(m=>({raw:m[1],index:m.index}));
  const moneyMatches=currencyTokens.flatMap(token=>invoiceMoneyOptions(token.raw).map(option=>({...option,index:token.index,currency:true,source:token.raw}))).filter(m=>m.value>=0&&Number.isFinite(m.value));
  const priceTail=packMissing?(codeMatch?line.slice(codeMatch.index+codeMatch[0].length):''):line.slice(packEnd),barePrices=[];
  if(!moneyMatches.length&&priceTail){
   const bareMatches=[...priceTail.matchAll(/\b((?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{1,2})\b/g)];
   for(const m of bareMatches){const after=priceTail.slice(m.index+m[0].length),isPackNumber=new RegExp('^\\s*'+unitRx+'\\b','i').test(after);if(!isPackNumber)barePrices.push(...invoiceMoneyOptions(m[1]).map(option=>({...option,raw:m[1],index:m.index,currency:false})))}
   if(!barePrices.length&&!packMissing)for(const m of priceTail.matchAll(/\b(\d{3,})\b/g))barePrices.push(...invoiceMoneyOptions(m[1]).map(option=>({...option,raw:m[1],index:m.index,currency:false})));
   moneyMatches.push(...barePrices.filter(m=>m.value>0&&Number.isFinite(m.value)));
  }
  const currencyQty=new RegExp('\\b('+number+')\\s*[£€$]','i').exec(line);
  const bareQty=barePrices.length?new RegExp('(?:^|\\s)('+number+')\\s*$').exec(priceTail.slice(0,barePrices[0].index)):null;
  const orderedQty=currencyQty?parseAmount(currencyQty[1]):bareQty?parseAmount(bareQty[1]):0;
  const qtyPrice=currencyTokens.length?new RegExp('\\b('+number+')\\s*[£€$]\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:[.,]\\d{1,2})?)','i').exec(line):null;
  let selectedPrice=null;
  if(qtyPrice){
   const quantity=parseAmount(qtyPrice[1]),unitRaw=qtyPrice[2],unitEnd=qtyPrice.index+qtyPrice[0].length;
   const following=currencyTokens.find(token=>token.index>=unitEnd);
   selectedPrice=invoiceSelectPrice(unitRaw,following?.raw||'',quantity);
  }else if(barePrices.length){
   const first=barePrices[0],before=priceTail.slice(0,first.index),qtyMatch=before.match(/(?:^|\\s)(\\d{1,3})\\s*$/),quantity=qtyMatch?Number(qtyMatch[1]):0;
   const next=barePrices.find(candidate=>candidate.index>first.index);
   selectedPrice=invoiceSelectPrice(first.raw,next?.raw||'',quantity);
  }
  if(!selectedPrice&&moneyMatches.length){
   const first=moneyMatches[0];selectedPrice={value:first.value,inferred:Boolean(first.inferred)};
   if(invoiceIsBidfood&&orderedQty>1)selectedPrice.inferred=true;
  }
  const price=selectedPrice?.value??null,priceInferred=selectedPrice?.inferred??false;
  // Fresh Direct puts its product description before the item code; using that
  // column boundary avoids copying OCR-corrupted category and quantity text.
  let name=codeMatch&&codeMatch.index>0?line.slice(0,codeMatch.index):'';
  if(nameScore(name)<3&&codeMatch){
   const afterCode=line.slice(codeMatch.index+codeMatch[0].length),stops=[];
   if(packIndex>=codeMatch.index+codeMatch[0].length)stops.push(packIndex-codeMatch.index-codeMatch[0].length);
   const categoryIndex=afterCode.search(categoryRx);if(categoryIndex>=0)stops.push(categoryIndex);
   const currencyIndex=afterCode.search(/[£€$]/);if(currencyIndex>=0)stops.push(currencyIndex);
   const end=stops.length?Math.min(...stops):afterCode.length;
   if(nameScore(afterCode.slice(0,end))>nameScore(name))name=afterCode.slice(0,end);
  }
  if(!codeMatch&&packIndex>=0)name=line.slice(0,packIndex);
  else if(!codeMatch&&packIndex<0&&hasCurrencyPrice){const moneyAt=line.search(/[£€$]/),prefix=line.slice(0,moneyAt);name=prefix.replace(/\s+\d{1,3}\s*$/,'').trim()}
  name=cleanDescription(name.replace(codeMatch?codeMatch[0]:'',' ').replace(categoryGlobalRx,' '));
  const nameMissing=nameScore(name)<3||isBidfoodBrandOnly(name);
  if(nameMissing)name=code?`Item ${code} — name not read`:usingPositionedTableRows?'Possible product — name needs review':'';
  if(!name&&code)name=`Item ${code} — name not read`;
  if(!name)continue;
  rows.push({code,name,nameMissing,caseCount,eachSize,unit,price,priceInferred,packMissing,raw:line});
 }
 const normalizeProductName=value=>String(value||'').toLowerCase().replace(/\bitem\s+\S+\s+[—-]\s+name not read\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const canMergeRows=(a,b)=>{
  if(!a.code||!b.code||a.code.toLowerCase()!==b.code.toLowerCase())return false;
  // A missing name is not proof that two OCR fragments are the same product.
  // Keeping those rows separate prevents a second product being swallowed by
  // a confident-looking code match.
  if(a.nameMissing||b.nameMissing)return false;
  const nameA=normalizeProductName(a.name),nameB=normalizeProductName(b.name);
  return !!nameA&&nameA===nameB;
 };
 const unique=usingStructuredInvoiceRows?rows:[];
 if(!usingStructuredInvoiceRows)for(const r of rows){
  const current=unique.find(existing=>canMergeRows(existing,r));
  if(!current){unique.push(r);continue}
  if(current.nameMissing&&!r.nameMissing){current.name=r.name;current.nameMissing=false}
  else if(!current.nameMissing&&!r.nameMissing&&nameScore(r.name)>nameScore(current.name))current.name=r.name;
  if(!current.code&&r.code)current.code=r.code;
  if(current.packMissing&&!r.packMissing){Object.assign(current,{caseCount:r.caseCount,eachSize:r.eachSize,unit:r.unit,packMissing:false})}
  else if(!current.packMissing&&!r.packMissing&&(current.caseCount!==r.caseCount||Math.abs(current.eachSize-r.eachSize)>.001||current.unit!==r.unit))current.packConflict=true;
  if(!current.priceConflict&&current.price===null&&r.price!==null){current.price=r.price;current.priceInferred=r.priceInferred}
  else if(current.price!==null&&r.price!==null&&Math.abs(current.price-r.price)>.005){
   if(current.priceInferred&&!r.priceInferred){current.price=r.price;current.priceInferred=false;current.priceConflict=false}
   else if(current.priceInferred===r.priceInferred){current.price=null;current.priceInferred=false;current.priceConflict=true}
  }else if(current.priceInferred&&!r.priceInferred&&current.price!==null){current.priceInferred=false}
 }
 const tbody=$('invoiceReviewRows');tbody.innerHTML='';
 if(!unique.length){$('invoiceReviewArea').hidden=true;invoiceToast('No product rows could be confidently structured. Nothing imported.');return}
 unique.forEach(item=>{
  const tr=document.createElement('tr');
  const tdCheck=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=false;check.setAttribute('aria-label','Import '+item.name);tdCheck.appendChild(check);
  const tdCode=document.createElement('td'),code=document.createElement('input');code.className='invoice-product-code';code.type='text';code.value=item.code||'';code.placeholder='Optional';code.setAttribute('aria-label','Supplier product code');tdCode.appendChild(code);
  const tdName=document.createElement('td'),name=document.createElement('textarea');name.className='invoice-item-name';name.rows=2;name.value=item.name;name.setAttribute('aria-label','Ingredient name');name.title=item.nameMissing?'OCR did not find the product description. Enter it from the invoice.':item.name; if(item.nameMissing){name.style.borderColor='#c47a12';name.style.background='#fff8e8'}tdName.appendChild(name);
  if(item.raw){const source=document.createElement('details');source.className='invoice-source';const summary=document.createElement('summary');summary.textContent='OCR source';const pre=document.createElement('pre');pre.textContent=item.raw;source.append(summary,pre);tdName.appendChild(source)}
  const tdCase=document.createElement('td'),caseQty=document.createElement('input');caseQty.className='invoice-case-qty';caseQty.type='number';caseQty.min='1';caseQty.step='1';caseQty.value=item.packMissing?'':item.caseCount;caseQty.setAttribute('aria-label','Items in this case');if(item.packMissing||item.packConflict){caseQty.title='OCR did not find a reliable number of items per case. Enter it from the invoice.';caseQty.style.borderColor='#c47a12';caseQty.style.background='#fff8e8'}tdCase.appendChild(caseQty);
  const tdEach=document.createElement('td'),eachSize=document.createElement('input');eachSize.className='invoice-item-size';eachSize.type='number';eachSize.min='0.001';eachSize.step='any';eachSize.value=item.packMissing?'':item.eachSize;eachSize.setAttribute('aria-label','Size of each item in the case');if(item.packMissing||item.packConflict){eachSize.title=item.packMissing?'OCR did not find the pack size. Enter it from the invoice before importing.':'OCR passes disagreed on this pack size. Check it against the invoice.';eachSize.style.borderColor='#c47a12';eachSize.style.background='#fff8e8'}tdEach.appendChild(eachSize);
  const tdUnit=document.createElement('td'),unit=document.createElement('select');[['kg','kg'],['g','g'],['l','litres'],['ml','ml'],['each','each']].forEach(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;unit.appendChild(o)});unit.value=item.unit;unit.setAttribute('aria-label','Unit');if(item.packMissing||item.packConflict){unit.title='Check the unit against the invoice.';unit.style.borderColor='#c47a12';unit.style.background='#fff8e8'}tdUnit.appendChild(unit);
  const tdTotal=document.createElement('td'),total=document.createElement('output');const updateTotal=()=>{const count=Number(caseQty.value),size=Number(eachSize.value);total.textContent=count>0&&size>0?((count*size).toLocaleString('en-GB',{maximumFractionDigits:3})+' '+unit.value):'Enter pack size'};updateTotal();tdTotal.appendChild(total);caseQty.addEventListener('input',updateTotal);eachSize.addEventListener('input',updateTotal);unit.addEventListener('change',updateTotal);
  const tdPrice=document.createElement('td'),price=document.createElement('input');price.className='invoice-price';price.type='number';price.min='0';price.step='0.01';price.value=item.price===null?'':item.price.toFixed(2);price.setAttribute('aria-label','Total price for case');if(item.price===null||item.priceInferred||item.priceConflict){price.title=item.priceConflict?'OCR passes found different prices. Enter the correct one from the invoice.':item.price===null?'OCR did not find a reliable price. Enter it from the invoice.':'OCR found an ambiguous whole-number amount. Check whether it is a full-pound price or whether OCR dropped the decimal point.';price.style.borderColor='#c47a12';price.style.background='#fff8e8'}tdPrice.appendChild(price);
  if(item.price===null||item.priceInferred||item.priceConflict){
   tr.dataset.priceNeedsConfirm='true';const verifyLabel=document.createElement('label');verifyLabel.className='invoice-price-verify';
   const verify=document.createElement('input');verify.type='checkbox';verify.className='invoice-price-confirm';verify.setAttribute('aria-label','I checked this case price against the invoice');
   verifyLabel.append(verify,document.createTextNode('I checked this price'));tdPrice.appendChild(verifyLabel);
  }
  tr.append(tdCheck,tdCode,tdName,tdCase,tdEach,tdUnit,tdTotal,tdPrice);tr.dataset.raw=item.raw;tr.dataset.unitsPerCase='1';tr.dataset.nameMissing=item.nameMissing?'true':'false';name.addEventListener('input',()=>{name.title=name.value.trim()||'Enter the product description from the invoice.';if(name.value.trim()&&name.value.trim()!==item.name){tr.dataset.nameMissing='false';name.style.borderColor='';name.style.background=''}});tbody.appendChild(tr);
 });
 $('invoiceReviewArea').hidden=false;
 const inferred=unique.filter(r=>r.priceInferred).length,missing=unique.filter(r=>r.price===null).length,missingPack=unique.filter(r=>r.packMissing).length,missingName=unique.filter(r=>r.nameMissing).length,conflicts=unique.filter(r=>r.priceConflict||r.packConflict).length;
 invoiceToast(`Built ${unique.length} review rows ${usingPositionedTableRows?'from the clearest reconstructed table layout':'from the available OCR text'}. Rows combine only when the same supplier code and product name match; ambiguous rows stay separate. All start unchecked. ${missingName} name(s), ${missing} price(s) and ${missingPack} pack size(s) need entry; ${inferred} inferred price(s) and ${conflicts} OCR conflict(s) are highlighted. Open “OCR source” under a name to inspect the recognized row.`);
}
function parseAmount(value){
 const text=String(value).replace(/\s/g,'');
 if(text.includes(',')&&text.includes('.'))return Number(text.replace(/,/g,''));
 if(/^\d{1,3}(?:,\d{3})+$/.test(text))return Number(text.replace(/,/g,''));
 return Number(text.replace(',','.'));
}
function normaliseInvoiceMoneyText(value){
 // OCR frequently separates the pence from the pounds ("20 91"). Join only
 // a two-digit pence group; a three-digit group such as "1 250" stays a
 // genuine whole-pound amount and is never silently divided by 100.
 const text=String(value||'').trim();
 const dottedPence=text.match(/^([£€$]?\s*\d{1,3})\s*[.,]\s*(\d{2})$/);
 if(dottedPence)return `${dottedPence[1]}.${dottedPence[2]}`;
 const pence=text.match(/^([£€$]?\s*\d{1,3})\s+(\d{2})$/);
 if(pence)return `${pence[1]}.${pence[2]}`;
 const wholePounds=text.match(/^([£€$]?\s*\d{1,3})\s+(\d{3})$/);
 if(wholePounds)return `${wholePounds[1]}${wholePounds[2]}`;
 return text;
}
function parseMoney(value){
 const text=normaliseInvoiceMoneyText(value).replace(/\s/g,'');
 // A whole-number OCR result is preserved literally. The scanner must never
 // silently turn a genuine £1,250 price into £12.50.
 return parseAmount(text);
}
function invoiceMoneyOptions(value){
 const raw=normaliseInvoiceMoneyText(value).replace(/[^\d.,]/g,'').trim();if(!raw)return [];
 const literal=parseMoney(raw);if(!Number.isFinite(literal))return [];
 if(/^\d{3,}$/.test(raw))return [
  {value:literal,inferred:true,decimalHypothesis:false},
  {value:literal/100,inferred:true,decimalHypothesis:true}
 ];
 return [{value:literal,inferred:false,decimalHypothesis:false}];
}
function invoiceSelectPrice(unitRaw,totalRaw,quantity){
 const units=invoiceMoneyOptions(unitRaw),totals=invoiceMoneyOptions(totalRaw),qty=Number(quantity)||0;
 if(!units.length){
  if(totals.length&&qty>0)return {value:totals[0].value/qty,inferred:true};
  return null;
 }
 if(totals.length&&qty>0){
  const matches=[];
  for(const unit of units)for(const total of totals){
   if(Math.abs(unit.value*qty-total.value)<=Math.max(.025,total.value*.0005))matches.push({unit,total});
  }
  if(matches.length===1)return {value:matches[0].unit.value,inferred:Boolean(matches[0].unit.inferred||matches[0].total.inferred)};
  if(matches.length>1){
   const literal=matches.find(match=>!match.unit.decimalHypothesis&&!match.total.decimalHypothesis)||matches[0];
   return {value:literal.unit.value,inferred:true};
  }
 }
 const literal=units.find(option=>!option.decimalHypothesis)||units[0];
 return {value:literal.value,inferred:Boolean(literal.inferred||units.length>1)};
}
function importInvoiceReview(){
 const supplier=$('invoiceSupplier').value.trim();if(!supplier){invoiceToast('Enter the supplier name before importing.');return}
 const selected=[...$('invoiceReviewRows').querySelectorAll('tr')].filter(tr=>tr.querySelector('input[type="checkbox"]')?.checked);
 if(!selected.length){invoiceToast('Tick at least one invoice row to import.');return}
 const items=readPriceBook();let added=0,updated=0,skipped=0;
 selected.forEach(tr=>{
  const check=tr.querySelector('input[type="checkbox"]'),codeField=tr.querySelector('.invoice-product-code'),nameField=tr.querySelector('.invoice-item-name'),caseField=tr.querySelector('.invoice-case-qty'),sizeField=tr.querySelector('.invoice-item-size'),unitField=tr.querySelector('select'),priceField=tr.querySelector('.invoice-price');
  if(!check||!codeField||!nameField||!caseField||!sizeField||!unitField||!priceField){skipped++;return}
  const code=codeField.value.trim(),name=nameField.value.trim(),caseCount=Number(caseField.value),eachSize=Number(sizeField.value),unit=unitField.value,priceText=priceField.value.trim(),price=Number(priceText);
  const priceConfirmed=tr.dataset.priceNeedsConfirm!=='true'||tr.querySelector('.invoice-price-confirm')?.checked===true;
  if(!priceConfirmed){skipped++;return}
  if(!name||tr.dataset.nameMissing==='true'||/^Item\s+\S+\s+—\s+name not read$/i.test(name)||!Number.isInteger(caseCount)||caseCount<1||!(eachSize>0)||!Number.isFinite(eachSize)||priceText===''||!(price>=0)||!Number.isFinite(price)||!['kg','g','l','ml','each'].includes(unit)){skipped++;return}
  const totalSize=caseCount*eachSize,base=baseUnit(unit),packBase=unitBaseSize(totalSize,unit);
  if(!Number.isFinite(totalSize)||!Number.isFinite(packBase)||!(packBase>0)){skipped++;return}
  // Supplier codes are the strongest match. Fall back to name only where a
  // code is missing on one side, so similar products with different codes stay separate.
  const supplierKey=mmNormalizeProductKey(supplier),codeKey=mmNormalizeProductKey(code),nameKey=mmNormalizeProductKey(name);
  let idx=codeKey?items.findIndex(x=>mmNormalizeProductKey(x.supplier)===supplierKey&&mmNormalizeProductKey(x.code)===codeKey):-1;
  if(idx<0)idx=items.findIndex(x=>mmNormalizeProductKey(x.supplier)===supplierKey&&mmNormalizeProductKey(x.name)===nameKey&&(!codeKey||!mmNormalizeProductKey(x.code)));
  const entry={id:idx>=0?items[idx].id:((window.crypto&&crypto.randomUUID)?crypto.randomUUID():'price-'+Date.now()+'-'+Math.random().toString(16).slice(2)),name,supplier,code:code||(idx>=0?items[idx].code||'':''),packBase,baseUnit:base,price,sourcePackSize:totalSize,sourceUnit:unit,caseCount,unitPackSize:eachSize,unitPackUnit:unit,updatedAt:new Date().toISOString()};
  if(idx>=0){items[idx]=entry;updated++}else{items.push(entry);added++}
 });
 if(!added&&!updated){invoiceToast(`No rows were imported.${skipped?` ${skipped} selected row(s) have missing or invalid fields.`:''} Check the selected rows and try again.`);return}
 try{writePriceBook(items);setActiveView('pricebook');pbToast(`${added} new item${added===1?'':'s'} added${updated?`; ${updated} existing item${updated===1?' was':'s were'} updated`:''}${skipped?`; ${skipped} invalid row(s) skipped`:''}. Existing recipe costs were not changed.`)}
 catch(e){invoiceToast('Could not save imported items. Check browser storage and try fewer rows.')}
}
$('scanInvoice').addEventListener('click',scanInvoiceFile);
$('clearInvoice').addEventListener('click',clearInvoiceScanner);
$('buildInvoiceReview').addEventListener('click',buildInvoiceReview);
$('importInvoiceRows').addEventListener('click',importInvoiceReview);
$('invoiceFile').addEventListener('change',()=>{
 const file=$('invoiceFile').files[0];$('invoiceFileName').textContent=file?file.name:'No invoice selected';
 $('invoiceFileName').title=file?.name||'';$('invoiceText').value='';$('invoiceReviewRows').replaceChildren();$('invoiceReviewArea').hidden=true;
 ['invoiceNumber','invoiceOrderNumber'].forEach(id=>{const field=$(id);if(field.value.trim()===field.dataset.autoValue)field.value='';field.dataset.autoValue='';});
 const supplier=$('invoiceSupplier');if(supplier.value.trim()===supplier.dataset.autoValue)supplier.value='';supplier.dataset.autoValue='';
 document.querySelector('.invoice-references').open=false;
 $('invoiceToast').textContent='';
 if(file)invoiceStatus('Ready to read this invoice.');
 else invoiceStatus('Choose a supplier invoice to read its prices.');
});
$('invoiceText').addEventListener('input',()=>{syncInvoiceReferences($('invoiceText').value);syncInvoiceSupplier($('invoiceText').value)});
$('selectInvoiceRows').addEventListener('click',()=>{$('invoiceReviewRows').querySelectorAll('input[type="checkbox"]').forEach(check=>check.checked=true);invoiceToast('All detected rows selected. Check each price, pack size and product name before importing.')});
$('clearInvoiceSelection').addEventListener('click',()=>{$('invoiceReviewRows').querySelectorAll('input[type="checkbox"]').forEach(check=>check.checked=false);invoiceToast('All invoice rows deselected.')});
