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
  let existing=[...document.scripts].find(script=>script.src===absolute);
  if(existing&&(existing.dataset.mmLoadState==='failed'||existing.dataset.mmLoadState==='loaded')){existing.remove();existing=null}
  if(existing){
   existing.addEventListener('load',()=>test()?resolve():reject(new Error('An invoice scanning library loaded but did not start. Reload MenuMargin and try again.')),{once:true});
   existing.addEventListener('error',()=>reject(new Error('A local invoice scanning library could not be loaded. Reload MenuMargin and try again.')),{once:true});
   return;
  }
  const script=document.createElement('script');script.src=absolute;script.async=true;
  script.dataset.mmLoadState='loading';
  script.onload=()=>{script.dataset.mmLoadState='loaded';if(test())resolve();else reject(new Error('An invoice scanning library loaded but did not start. Reload MenuMargin and try again.'))};
  script.onerror=()=>{script.dataset.mmLoadState='failed';script.remove();reject(new Error('A local invoice scanning library could not be loaded. Reload MenuMargin and try again.'))};
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
  const embeddedCode=word.match(/^(.+?)[\[(](\d{4,8})[\])]$/);
  if(embeddedCode&&/[A-Za-z]{2}/.test(embeddedCode[1])){
   const description=embeddedCode[1].replace(/[\])]+$/,'').trim(),code=`[${embeddedCode[2]}]`,descriptionWidth=width*description.length/word.length,codeWidth=Math.max(1,width-descriptionWidth);
   if(description)tokens.push({left,centerX:left+descriptionWidth/2,center:top+height/2,width:descriptionWidth,height,confidence,word:description});
   tokens.push({left:left+descriptionWidth,centerX:left+descriptionWidth+codeWidth/2,center:top+height/2,width:codeWidth,height,confidence,word:code});
  }else tokens.push({left,centerX:left+width/2,center:top+height/2,width,height,confidence,word});
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
 const pageLeft=Math.min(...tokens.map(t=>t.left)),pageRight=Math.max(...tokens.map(t=>t.left+t.width));
 const normalizeHeader=value=>String(value||'').toLowerCase().replace(/[^a-z]/g,'');
 const codeWord=/^(?:[\[(]?(?:[A-Za-z]{1,5}\d{3,10}|\d{3,10}[A-Za-z]{1,5}|\d{3,12})[\])]?)$/;
 const candidates=tokens.filter(t=>t.center>minY+(maxY-minY)*.08&&codeWord.test(t.word));
 const xTolerance=Math.max(24,median*2.2);
 const clusterAt=items=>items.map(candidate=>({x:candidate.left,count:items.filter(t=>Math.abs(t.left-candidate.left)<=xTolerance).length})).sort((a,b)=>b.count-a.count)[0]||null;
 let cluster=clusterAt(candidates),clusteredCodeCandidates=cluster?candidates.filter(t=>Math.abs(t.left-cluster.x)<=xTolerance):[];
 let firstClusterCodeY=clusteredCodeCandidates.length?Math.min(...clusteredCodeCandidates.map(t=>t.center)):null;
 const headerType=word=>{
  const h=normalizeHeader(word);
  if(/^(?:description|descriptio|desc|product|item|goods|ingredient|details|name)$/.test(h))return 'description';
  if(/^(?:code|productcode|itemcode|stockcode|sku|plu)$/.test(h))return 'code';
  if(/^(?:qty|quantity|quantit|ordered|items|cases|orderqty)$/.test(h))return 'quantity';
  if(/^(?:pack|packsize|case|casepack|itemsize|casesize|size|sizeunit|weight|weightno|measure|measur)$/.test(h))return 'pack';
  if(/^(?:category|department|route)$/.test(h))return 'category';
  if(h==='unit')return 'unit';
  if(/^(?:price|unitprice|itemprice|caseprice|cost|costprice|rate)$/.test(h))return 'price';
  if(/^(?:total|subtotal|net|nett|extended|line|lineamount|linevalue|amount|value)$/.test(h))return 'total';
  if(h==='vat'||h==='tax')return 'tax';
  return '';
 };
 const headingGroups=[];
 for(let start=0;start<bands.length;start++){
  const first=bands[start],group=[];
  for(let j=start;j<bands.length&&bands[j].center-first.center<=median*3.5;j++)group.push(...bands[j].tokens);
  const types=new Set(group.map(t=>headerType(t.word)).filter(Boolean));
  const headingTokens=group.filter(t=>headerType(t.word));
  const score=types.size+(types.has('description')?2:0)+(types.has('price')||types.has('total')?2:0);
  if(score>=4)headingGroups.push({center:first.center,bottom:Math.max(...headingTokens.map(t=>t.center+t.height/2)),tokens:headingTokens,types,score});
 }
 // Table headings are a much safer starting point than a cluster of numbers:
 // invoices contain account numbers, telephone numbers, and product codes
 // above the actual line-item table.
 const heading=headingGroups.sort((a,b)=>b.score-a.score||a.center-b.center)[0]||null;
 let headerBand,firstCodeY;
 if(heading){
  headerBand=heading.tokens;
  const belowHeading=candidates.filter(t=>t.center>heading.bottom+median*.25);
  cluster=clusterAt(belowHeading);
  clusteredCodeCandidates=cluster?belowHeading.filter(t=>Math.abs(t.left-cluster.x)<=xTolerance):[];
  firstClusterCodeY=clusteredCodeCandidates.length?Math.min(...clusteredCodeCandidates.map(t=>t.center)):null;
  firstCodeY=firstClusterCodeY??heading.bottom+median*.75;
 }else if(firstClusterCodeY!==null&&clusteredCodeCandidates.length>=3){
  firstCodeY=firstClusterCodeY;
  headerBand=tokens.filter(t=>t.center<firstCodeY&&t.center>firstCodeY-median*12);
 }else{
  if(firstClusterCodeY===null)return {text:positioned,records:[],quality:0};
  firstCodeY=firstClusterCodeY;
  headerBand=tokens.filter(t=>t.center<firstCodeY&&t.center>firstCodeY-median*12);
 }
 let anchorX=cluster?.x??pageRight;
 const centerOf=word=>{
  const hits=headerBand.filter(t=>word.test(normalizeHeader(t.word))).sort((a,b)=>b.center-a.center);
  return hits.length?hits[0].centerX:null;
 };
 const nearestPair=(firstRx,secondRx)=>{
  const firsts=headerBand.filter(t=>firstRx.test(normalizeHeader(t.word)));
  const pairs=[];
  for(const first of firsts){
   for(const second of headerBand.filter(t=>secondRx.test(normalizeHeader(t.word))&&Math.abs(t.center-first.center)<median*2&&Math.abs(t.centerX-first.centerX)<Math.max(median*4,(pageRight-pageLeft)*.035))){
    pairs.push({first,second,score:Math.abs(second.center-first.center)+Math.abs(second.centerX-first.centerX)});
   }
  }
  pairs.sort((a,b)=>a.score-b.score);
  return pairs.length?(pairs[0].first.centerX+pairs[0].second.centerX)/2:null;
 };
 const priceHeaders=headerBand.filter(t=>/^price$/.test(normalizeHeader(t.word))).sort((a,b)=>a.centerX-b.centerX);
 const combinedPackHeading=headerBand.some(t=>normalizeHeader(t.word)==='sizeunit');
 const packHeaderTokens=headerBand.filter(t=>/^(?:packsize|casepack|itemsize|casesize|pack|size|sizeunit|weight|weightno|measure|measur)$/.test(normalizeHeader(t.word)));
 const quantityHeaderTokens=headerBand.filter(t=>/^(?:quantity|quantit|qty|ordered|items|orderqty)$/.test(normalizeHeader(t.word)));
 const quantityHeaderX=quantityHeaderTokens.length?quantityHeaderTokens[0].centerX:null;
 const packHeaderX=packHeaderTokens.length?packHeaderTokens[0].centerX:null;
 const unitHeaderTokens=headerBand.filter(t=>/^unit$/.test(normalizeHeader(t.word)));
 const unitBeforeQuantity=Number.isFinite(quantityHeaderX)?unitHeaderTokens.filter(t=>t.centerX<quantityHeaderX):[];
 const unitAfterPack=Number.isFinite(packHeaderX)?unitHeaderTokens.filter(t=>t.centerX>packHeaderX):[];
 const selectedUnit=unitBeforeQuantity.sort((a,b)=>a.centerX-b.centerX)[0]||unitAfterPack.sort((a,b)=>a.centerX-b.centerX)[0]||unitHeaderTokens.sort((a,b)=>a.centerX-b.centerX)[0]||null;
 const netPriceCenter=nearestPair(/^net$|^nett$|^sub$|^subtotal$|^line$|^extended$|^amount$/, /^price$|^total$|^value$|^amount$/);
 const header={
  code:nearestPair(/^product$|^prod$|^item$|^stock$/, /^code$/)??centerOf(/^productcode$|^itemcode$|^stockcode$|^sku$|^plu$|^code$/),
  description:centerOf(/^description$|^descriptio|^ingredient$|^goods$|^details$|^name$|^item$|^product$/),brand:centerOf(/^brand$/),
  category:centerOf(/^category$|^department$/),route:centerOf(/^route$/),
  pack:nearestPair(/^pack$|^case$|^item$/, /^size$|^weight$/)??centerOf(/^packsize$|^casepack$|^itemsize$|^casesize$|^sizeunit$|^weightno$|^pack$|^size$|^weight$|^measure$|^measur/),
  measure:centerOf(/^measure$|^measur/)??(packHeaderTokens.some(t=>/^(?:weight|weightno|measure|measur)$/.test(normalizeHeader(t.word)))&&selectedUnit?.centerX>packHeaderX?selectedUnit.centerX:null),unit:selectedUnit?.centerX??null,
  quantity:quantityHeaderX,ordered:centerOf(/^ordered$/),
  unitPrice:priceHeaders.find(t=>!netPriceCenter||t.centerX<netPriceCenter)?.centerX??centerOf(/^unitprice$|^itemprice$|^caseprice$|^unitcost$|^price$|^rate$|^costprice$/),
  price:null,vat:centerOf(/^vat$|^tax$/),
  total:netPriceCenter??centerOf(/^total$|^subtotal$|^net$|^nett$|^amount$|^lineamount$|^extended$|^linevalue$|^value$/)
 };
 if(header.code!==null&&header.description!==null&&Math.abs(header.code-header.description)<(pageRight-pageLeft)*.035){
  const explicitDescription=centerOf(/^description$|^descriptio|^ingredient$|^goods$/);
  if(explicitDescription!==null)header.description=explicitDescription;
 }
 const nextPriceHeader=priceHeaders.find(t=>header.unitPrice===null||t.centerX>header.unitPrice+Math.max(median*1.5,(pageRight-pageLeft)*.02));
 header.price=nextPriceHeader?.centerX??null;
 if(header.code!==null)anchorX=header.code;
 const anchorWindow=Math.max(xTolerance, (pageRight-pageLeft)*.045);
 const headerCodeTokens=header.code!==null?candidates.filter(t=>Math.abs(t.left-header.code)<=anchorWindow):[];
 const embeddedProductCodes=header.code===null&&heading?.types.has('description')?candidates.filter(t=>{
  const digits=String(t.word||'').replace(/[\[\]()]/g,'');
  const rightNeighbors=[header.pack,header.measure,header.unit,header.quantity,header.unitPrice,header.price,header.total].filter(x=>Number.isFinite(x)&&x>=(header.description??pageLeft));
  const descriptionRight=rightNeighbors.length?Math.min(...rightNeighbors)-Math.max(median*1.2,(pageRight-pageLeft)*.012):pageRight;
  return /^\d{4,8}$/.test(digits)&&t.center>heading.bottom+median*.25&&t.centerX>pageLeft+(pageRight-pageLeft)*.025&&t.centerX<descriptionRight;
 }):[];
 const embeddedDescriptionLayout=Boolean(heading&&heading.types.has('description')&&header.code===null);
 const competingColumns=[header.pack,header.measure,header.unit,header.quantity,header.unitPrice,header.price,header.vat,header.total].filter(Number.isFinite);
 const repeatedClusterIsCode=clusteredCodeCandidates.length>=3&&(!heading||heading.types.has('code'))&&!competingColumns.some(x=>Math.abs(x-cluster.x)<Math.max(median*2,xTolerance*.75));
 const codeTokens=(headerCodeTokens.length?headerCodeTokens:(repeatedClusterIsCode?clusteredCodeCandidates:embeddedProductCodes)).sort((a,b)=>a.center-b.center);
 if(codeTokens.length)firstCodeY=Math.min(...codeTokens.map(t=>t.center));
 const uniqueAnchors=[];
 for(const token of codeTokens){
  const previous=uniqueAnchors[uniqueAnchors.length-1];
  const tokenCode=String(token.word||'').replace(/[\[\]()]/g,''),previousCode=String(previous?.word||'').replace(/[\[\]()]/g,'');
  const sameCode=previous&&(tokenCode===previousCode||tokenCode.endsWith(previousCode)||previousCode.endsWith(tokenCode));
  if(sameCode&&Math.abs(token.center-previous.center)<=median*.5&&Math.abs(token.left-previous.left)<=xTolerance){if(tokenCode.length>previousCode.length||token.confidence>previous.confidence)uniqueAnchors[uniqueAnchors.length-1]=token;continue}
  uniqueAnchors.push(token);
 }
 const anchorCenters=uniqueAnchors.map(t=>t.center),minAnchorY=Math.min(...anchorCenters),maxAnchorY=Math.max(...anchorCenters);
 const headerBaseline=headerBand.filter(t=>['description','code','pack','quantity','unit','price','total','tax','category'].includes(headerType(t.word))&&(heading||t.center>firstCodeY-median*8));
 let bestSlope=0;
 let headingSlope=0;
 if(headerBaseline.length>=3){
  const meanX=headerBaseline.reduce((sum,t)=>sum+t.centerX,0)/headerBaseline.length,meanY=headerBaseline.reduce((sum,t)=>sum+t.center,0)/headerBaseline.length;
  const variance=headerBaseline.reduce((sum,t)=>sum+(t.centerX-meanX)**2,0),covariance=headerBaseline.reduce((sum,t)=>sum+(t.centerX-meanX)*(t.center-meanY),0);
  const estimated=variance?covariance/variance:0;
  if(Math.abs(estimated)<=.25&&Math.max(...headerBaseline.map(t=>t.centerX))-Math.min(...headerBaseline.map(t=>t.centerX))>(pageRight-pageLeft)*.35)headingSlope=estimated;
 }
 if(header.code===null){
  // Embedded product codes move horizontally with description length; don't
  // fit page skew to those variable code positions.
  bestSlope=0;
 }else if(anchorCenters.length>=3){
  const scoreSlope=slope=>{
   const correctedCenters=uniqueAnchors.map(anchor=>anchor.center-slope*(anchor.left-anchorX));
   const minCorrected=Math.min(...correctedCenters),maxCorrected=Math.max(...correctedCenters);
   let score=0;
   for(const token of tokens){
    const rowY=token.center-slope*(token.left-anchorX);
    if(rowY<minCorrected-median*2||rowY>maxCorrected+median*2)continue;
    let nearest=Infinity;
    for(const center of correctedCenters)nearest=Math.min(nearest,Math.abs(rowY-center));
    if(nearest<tolerance*1.8)score+=1-nearest/(tolerance*1.8);
   }
   return score;
  };
  const flatScore=scoreSlope(0);let bestScore=flatScore,bestDataSlope=0;
  for(let slope=-.25;slope<=.2501;slope+=.0025){
   const score=scoreSlope(slope);
   if(score>bestScore+.05||(Math.abs(score-bestScore)<=.05&&Math.abs(slope)<Math.abs(bestDataSlope))){bestScore=score;bestDataSlope=slope}
  }
  bestSlope=bestScore>=flatScore*1.01?bestDataSlope:headingSlope;
 }else{
  bestSlope=headingSlope;
 }
 let rowAnchors=uniqueAnchors.map(t=>({...t,rowCenter:t.center-bestSlope*(t.left-anchorX),code:String(t.word||'').replace(/[\[\]()]/g,''),anchorKind:'code'})).sort((a,b)=>a.rowCenter-b.rowCenter);
 const rowTokens=tokens.map(t=>({...t,rowCenter:t.center-bestSlope*(t.left-anchorX)}));
 const mid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?(a+b)/2:null;
 const inferredUnitPack=header.unit!==null&&header.quantity!==null&&header.unit<header.quantity&&
  (header.unitPrice===null||header.unit<header.unitPrice-(pageRight-pageLeft)*.035)?header.unit:null;
 const column={
  code:header.code,
  description:header.description,
  brand:header.brand,
  category:header.category,
  route:header.route,
  pack:header.pack??inferredUnitPack,
  measure:header.measure,
  unit:header.unit,
  quantity:header.quantity,
  unitPrice:header.unitPrice,
  price:header.price,
  vat:header.vat,
  total:header.total
 };
 // Some supplier photos lose the small PRICE/SUBTOTAL headings even when the
 // amounts themselves are clear. Recover those columns from repeated currency
 // tokens below the table heading, never from bare decimals or pack weights.
 if(heading&&(!Number.isFinite(column.unitPrice)||!Number.isFinite(column.total))){
  const amountTokens=tokens.filter(t=>t.center>heading.bottom+median*.35&&/[£€$]\s*\d/.test(t.word));
  const amountGroups=[];
  for(const token of amountTokens.sort((a,b)=>a.centerX-b.centerX)){
   let group=amountGroups.find(g=>Math.abs(g.center-token.centerX)<=Math.max(median*2.2,(pageRight-pageLeft)*.025));
   if(group){group.tokens.push(token);group.center=group.tokens.reduce((sum,t)=>sum+t.centerX,0)/group.tokens.length}
   else amountGroups.push({center:token.centerX,tokens:[token]});
  }
  const reliableAmountColumns=amountGroups.filter(g=>g.tokens.length>=3).sort((a,b)=>a.center-b.center);
  if(reliableAmountColumns.length){
   const rightOfDescription=reliableAmountColumns.filter(g=>g.center>(column.pack??column.quantity??column.description??pageLeft));
   const moneyColumns=rightOfDescription.length?rightOfDescription:reliableAmountColumns;
   if(!Number.isFinite(column.unitPrice))column.unitPrice=moneyColumns[0].center;
   if(moneyColumns.length>=2)column.total=moneyColumns[moneyColumns.length-1].center;
   else if(!Number.isFinite(column.total))column.total=moneyColumns[0].center;
  }
 }
 const centers=[column.code,column.description,column.brand,column.category,column.route,column.pack,column.measure,column.unit,column.quantity,column.unitPrice,column.price,column.vat,column.total]
  .filter(value=>Number.isFinite(value)).sort((a,b)=>a-b).filter((value,index,array)=>index===0||Math.abs(value-array[index-1])>median*.6);
 const cellBounds=center=>{
  if(!Number.isFinite(center))return [null,null];
  let index=centers.findIndex(value=>Math.abs(value-center)<=median*.6);
  if(index<0){index=centers.findIndex(value=>value>center);if(index<0)index=centers.length;}
  const left=index===0?pageLeft:mid(centers[index-1],centers[index]??center);
  const right=index>=centers.length?pageRight:mid(centers[index],centers[index+1]??pageRight);
  return [left,right];
 };
 let [descLeft,descRight]=cellBounds(column.description);
 const descriptionNeighbors=[['code',column.code],['brand',column.brand],['category',column.category],['pack',column.pack],['measure',column.measure],['unit',column.unit],['quantity',column.quantity],['unitPrice',column.unitPrice],['price',column.price],['vat',column.vat],['total',column.total]]
  .filter(([,x])=>Number.isFinite(x)&&Number.isFinite(column.description)&&Math.abs(x-column.description)>median*.6)
  .sort((a,b)=>a[1]-b[1]);
 const previousDescriptionColumn=descriptionNeighbors.filter(([,x])=>x<column.description).at(-1)||null;
 const nextDescriptionColumn=descriptionNeighbors.find(([,x])=>x>column.description)||null;
 const descriptionGap=Math.max(median*1.5,(pageRight-pageLeft)*.018);
 if(previousDescriptionColumn?.[0]==='code')descLeft=previousDescriptionColumn[1]+descriptionGap;
 if(nextDescriptionColumn?.[0]==='code')descRight=nextDescriptionColumn[1]-descriptionGap;
 else if(!previousDescriptionColumn&&nextDescriptionColumn&&nextDescriptionColumn[0]==='pack'&&combinedPackHeading)descRight=nextDescriptionColumn[1]-descriptionGap;
 else if(previousDescriptionColumn?.[0]==='code'&&nextDescriptionColumn)descRight=mid(column.description,nextDescriptionColumn[1]);
 const [codeLeft,codeRight]=cellBounds(column.code),
       packBounds=cellBounds(column.pack),[packLeftRaw,packRight]=packBounds,
       packLeft=!column.code&&combinedPackHeading&&column.pack!==null&&column.description!==null&&column.category===null?Math.max(packLeftRaw,column.pack-descriptionGap):packLeftRaw,
       [measureLeft,measureRight]=cellBounds(column.measure),
       [qtyLeft,qtyRight]=cellBounds(column.quantity),[priceLeft,priceRight]=cellBounds(column.unitPrice),
       [linePriceLeft,linePriceRight]=cellBounds(column.price),[totalLeft,totalRightRaw]=cellBounds(column.total),totalRight=totalRightRaw??pageRight+median;
 const within=(token,left,right)=>left!==null&&right!==null&&token.centerX>=Math.min(left,right)&&token.centerX<Math.max(left,right);
 const orderedRowTokens=row=>{
  const lines=[];
  for(const token of row.slice().sort((a,b)=>a.rowCenter-b.rowCenter||a.left-b.left)){
   const line=lines.find(candidate=>Math.abs(candidate.center-token.rowCenter)<=Math.max(6,median*.78));
   if(line){line.tokens.push(token);line.center=line.tokens.reduce((sum,t)=>sum+t.rowCenter,0)/line.tokens.length}
   else lines.push({center:token.rowCenter,tokens:[token]});
  }
  return lines.sort((a,b)=>a.center-b.center).flatMap(line=>line.tokens.sort((a,b)=>a.left-b.left));
 };
 const fieldText=(row,left,right)=>orderedRowTokens(row.filter(t=>within(t,left,right))).map(t=>t.word).join(' ').replace(/\s+/g,' ').trim();
 const layoutReady=column.description!==null&&(column.unitPrice!==null||column.price!==null||column.total!==null);
 if(layoutReady){
  // Anchor on one per-line amount column so unit price and line total do not
  // create two rows for the same product. Pack-size tokens can still recover
  // a row whose preferred amount is missing.
  const rowPriceColumn=column.total??column.price??column.unitPrice;
  const priceBounds=[cellBounds(rowPriceColumn)].filter(([left,right])=>Number.isFinite(left)&&Number.isFinite(right));
  const isPriceToken=token=>/^(?:[£€$]|\d{1,5}(?:[.,]\d{2})?)$/i.test(String(token.word||'').trim())||/\d+[.,]\d{2}\b/.test(token.word)||/[£€$]\s*\d/.test(token.word);
  const alternateAnchorTop=heading?heading.bottom+median*.35:firstCodeY-median*.5;
  const isPackAnchor=token=>within(token,packLeft,packRight)&&(/\d.*[-x].*\d/i.test(token.word)||/^\d+(?:[.,]\d+)?\s*(?:kilograms?|kgs?|kg|grams?|grammes?|gms?|gm|gr|g|litres?|liters?|ltr|litre|liter|millilitres?|milliliters?|ml|dzn|dozen|each|ea|pieces?|pcs?)\b/i.test(token.word));
  const packAnchors=rowTokens.filter(isPackAnchor);
  const amountAnchors=rowTokens.filter(t=>t.rowCenter>alternateAnchorTop&&priceBounds.some(([left,right])=>within(t,left,right))&&isPriceToken(t));
  // When code OCR is weak, use pack sizes and one amount column to recover a
  // missing row without treating subtotal and total as separate products.
  const alternateAnchors=[...packAnchors,...amountAnchors];
  for(const token of alternateAnchors){
   if(rowAnchors.some(anchor=>Math.abs(anchor.rowCenter-token.rowCenter)<median*1.6))continue;
   rowAnchors.push({...token,code:'',anchorKind:'field'});
  }
  rowAnchors.sort((a,b)=>a.rowCenter-b.rowCenter);
  const distinctAnchors=[];
  for(const anchor of rowAnchors){
   const previous=distinctAnchors[distinctAnchors.length-1];
   if(previous&&Math.abs(anchor.rowCenter-previous.rowCenter)<median*1.8){
    if(anchor.anchorKind==='code'&&previous.anchorKind==='code'){
     if(anchor.code===previous.code&&Math.abs(anchor.rowCenter-previous.rowCenter)<median*.5){if(anchor.confidence>previous.confidence)distinctAnchors[distinctAnchors.length-1]=anchor;continue}
    }else if(anchor.anchorKind==='code'&&previous.anchorKind!=='code'){distinctAnchors[distinctAnchors.length-1]=anchor;continue}
    else if(anchor.anchorKind!=='code'&&previous.anchorKind==='code')continue;
    else if(anchor.anchorKind!=='code'&&previous.anchorKind!=='code')continue;
   }
   distinctAnchors.push(anchor);
  }
  rowAnchors=distinctAnchors;
 }
 const moneyIn=text=>{
  const found=normaliseInvoiceMoneyText(text).match(/(?:[£€$]|\bE\s*)?\s*(\d{1,4}(?:,\d{3})*(?:[.,]\d{2})?)\b/);
  if(!found)return null;
  const value=parseMoney(found[1]);return Number.isFinite(value)&&value>=0?value:null;
 };
 const moneyNear=(row,x,left,right)=>{
  if(!Number.isFinite(x))return null;
  const radius=Math.max(median*6,(pageRight-pageLeft)*.07);
  const candidates=row.filter(token=>!Number.isFinite(left)||!Number.isFinite(right)||within(token,left,right)).map(token=>{
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
  const prev=rowAnchors[i-1],next=rowAnchors[i+1];
  const tableTop=heading?.bottom??firstCodeY-median*.35;
  const rowEdge=median*1.2;
  const top=embeddedDescriptionLayout
   ?prev?anchor.rowCenter-rowEdge:Math.max(tableTop+median*.12,anchor.rowCenter-median*3)
   :prev?(prev.rowCenter+anchor.rowCenter)/2:Math.max(tableTop+median*.12,anchor.rowCenter-median*3);
  // Bidfood codes sit at the start of a variable-height product row. The next code starts the next row;
  // splitting at the midpoint cut off wrapped descriptions and made brands look like new products.
  const bottom=embeddedDescriptionLayout&&next
   ?next.rowCenter-rowEdge
   :next?(anchor.rowCenter+next.rowCenter)/2:anchor.rowCenter+Math.max(median*3,(anchor.rowCenter-(prev?.rowCenter??anchor.rowCenter-median*3))*.82);
  const row=rowTokens.filter(t=>t.rowCenter>=top&&t.rowCenter<bottom);
  let code=anchor.code||'';
  let description=fieldText(row,descLeft,descRight);
  if(heading&&!heading.types.has('code')){
   const trailingCode=description.match(/(?:\[|\()?([0-9]{4,8})(?:\]|\))?\s*$/);
   if(trailingCode){if(!code)code=trailingCode[1];description=description.slice(0,trailingCode.index).trim()}
   else if(code){const escaped=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const ending=new RegExp('(?:\\[|\\()?'+escaped+'(?:\\]|\\))?\\s*$');description=description.replace(ending,'').trim()}
  }
  let packText=fieldText(row,packLeft,packRight),measureText=fieldText(row,measureLeft,measureRight);
  let quantityText=fieldText(row,qtyLeft,qtyRight),unitPriceText=fieldText(row,priceLeft,priceRight),linePriceText=fieldText(row,linePriceLeft,linePriceRight);
  const totalText=column.total!==null?fieldText(row,totalLeft,totalRight):'';
  const raw=row.slice().sort((a,b)=>a.rowCenter-b.rowCenter||a.left-b.left).map(t=>t.word).join(' ');
  const descriptionLayout=descLeft!==null&&descRight!==null&&descRight>descLeft;
  const packLayout=packLeft!==null&&packRight!==null&&packRight>packLeft;
  const priceLayout=priceLeft!==null&&priceRight!==null&&priceRight>priceLeft;
  if(!description){
  const afterDescription=[column.code,column.brand,column.category,column.route,column.pack,column.measure,column.unit,column.quantity,column.unitPrice,column.price,column.vat,column.total]
    .filter(value=>Number.isFinite(value)&&value>column.description+median*.5);
   const rightEdge=afterDescription.length?Math.min(...afterDescription):pageRight+median;
   const leftEdge=descLeft??pageLeft;
   description=orderedRowTokens(row.filter(t=>t.centerX>=leftEdge&&t.centerX<rightEdge)).map(t=>t.word).join(' ').replace(/\s+/g,' ').trim();
  }
  if(!description||!descriptionLayout||!packLayout||!priceLayout){
   const sorted=row.slice().sort((a,b)=>a.left-b.left||a.rowCenter-b.rowCenter);
   const codeIndex=sorted.findIndex(t=>t.word===anchor.word&&Math.abs(t.left-anchor.left)<median&&Math.abs(t.center-anchor.center)<median),packIndex=sorted.findIndex(t=>/\d+(?:[.,]\d+)?\s*[-x]\s*\d/i.test(t.word));
   if(!description&&codeIndex>=0){
    if(column.description!==null&&column.code!==null&&column.description<column.code)description=sorted.filter(t=>t.centerX<anchor.centerX).map(t=>t.word).join(' ');
    else description=sorted.slice(codeIndex+1,packIndex>codeIndex?packIndex:undefined).map(t=>t.word).join(' ');
   }
   if(!packText&&packIndex>=0)packText=sorted.slice(packIndex,packIndex+3).map(t=>t.word).join(' ');
   if(!unitPriceText){const tail=sorted.slice(Math.max(0,packIndex+1)).map(t=>t.word).join(' ');unitPriceText=tail}
  }
  const quantityMatch=quantityText.match(/\b\d+(?:[.,]\d+)?\b/),quantity=quantityMatch?parseAmount(quantityMatch[0]):0;
  const unitPrice=moneyIn(unitPriceText)??moneyNear(row,column.unitPrice,priceLeft,priceRight),
        linePriceValue=moneyIn(linePriceText)??moneyNear(row,column.price,linePriceLeft,linePriceRight),
        totalValue=moneyIn(totalText)??moneyNear(row,column.total,totalLeft,totalRight),
        linePrice=linePriceValue===null?totalValue:linePriceValue;
  return {code,description,pack:packText,measure:measureText,quantity,unitPrice,linePrice,rowCenter:anchor.rowCenter,raw,codeConfidence:anchor.confidence};
 });
 const tableRecords=layoutReady?records.filter(r=>r.code||((r.description||r.pack||r.measure||r.quantity>0)&&!/^\s*(?:sub\s*)?total\b|^\s*(?:amount due|vat|balance due)\b/i.test(r.description))):[];
 const recordText=tableRecords.map(r=>[r.code,r.description,r.pack,r.measure,r.quantity||'',r.unitPrice===null?'':r.unitPrice.toFixed(2),r.linePrice===null?'':r.linePrice.toFixed(2)].join('\t')).join('\n');
 const legacyLines=rowAnchors.map((anchor,i)=>{
  const next=rowAnchors[i+1],prev=rowAnchors[i-1],top=anchor.rowCenter-median*.4;
  const bottom=next?next.rowCenter-median*.4:anchor.rowCenter+Math.max(median*3,(anchor.rowCenter-(prev?.rowCenter??anchor.rowCenter-median*3))*.82);
  return rowTokens.filter(t=>t.rowCenter>=top&&t.rowCenter<bottom).sort((a,b)=>a.left-b.left||a.rowCenter-b.rowCenter).map(t=>t.word).join(' ');
 }).filter(Boolean);
 const structuredText=tableRecords.length?`\n--- MenuMargin positioned invoice rows: code | description | pack size | unit of measure | quantity | unit price | line total (tab-separated) ---\n${recordText}`:'';
 const text=`${positioned}\n--- Product rows grouped by item code ---\n${legacyLines.join('\n')}${structuredText}`;
 const completeness=tableRecords.reduce((sum,r)=>sum+1+(r.description?1:0)+(r.pack?1:0)+(r.unitPrice!==null?1:0)+(r.quantity?1:0),0);
 return {text,records:tableRecords,quality:tableRecords.length*10+completeness,skew:bestSlope};
}
function invoiceProductCodeMatches(line){
 const text=String(line||'');
 return [...text.matchAll(/\b(?:[A-Za-z]{1,4}\d{4,8}|\d{4,8})\b/g)].filter(match=>!/[£€$]\s*$/.test(text.slice(Math.max(0,match.index-8),match.index)));
}
function invoiceTablePassScore(candidate){
 const structured=candidate?.records||[];
 if(structured.length){
  const quality=structured.reduce((score,r)=>{
   const hasName=/[A-Za-z]{3}/.test(String(r.description||''));
   const pack=String(r.pack||'')+' '+String(r.measure||'');
   const hasPack=/\d+(?:[.,]\d+)?\s*[-x×]\s*\d+(?:[.,]\d+)?/i.test(pack)||/\d+(?:[.,]\d+)?\s*(?:kg|kgs?|kilograms?|g|gm|gms?|grams?|litres?|liters?|ltr|ml|dzn|dozen|each|ea|pcs?)\b/i.test(pack);
   const quantity=Number(r.quantity),hasQuantity=Number.isFinite(quantity)&&quantity>0&&quantity<=999;
   const prices=[r.unitPrice,r.linePrice].filter(value=>value!==null&&value!==undefined&&value!=='').map(Number).filter(Number.isFinite);
   const hasPrice=prices.some(price=>price>=0&&price<=100000);
   return score+(hasName ? .25 : 0)+(hasPack ? .25 : 0)+(hasQuantity ? .15 : 0)+(hasPrice ? .35 : 0);
  },0);
  return quality/structured.length*60+Math.min(structured.length,8)*.5;
 }
 const rowsText=String(candidate?.rows||'');
 let inRows=false,rowCount=0,complete=0;
 for(const raw of String(rowsText||'').split(/\r?\n/)){
  const line=raw.trim();
  if(/^---\s*product rows grouped by item code\s*---$/i.test(line)){inRows=true;continue}
  if(/^---/.test(line)){inRows=false;continue}
  if(!inRows||!line)continue;
  if(!/[A-Za-z]{3,}/.test(line)&&!invoiceProductCodeMatches(line).length)continue;
  rowCount++;
  complete+=(/[A-Za-z]{3,}/.test(line)?1:0)+(/\d\s*[-x]\s*\d/i.test(line)?1:0)+(/[£€$]\s*\d|\b\d+[.,]\d{2}\b/.test(line)?1:0);
 }
 return rowCount?complete/(rowCount*3)*60+Math.min(rowCount,8)*.5:-1;
}
function invoiceTablePassesDisagree(candidates){
 const passes=(candidates||[]).map(candidate=>{
  const byCode=new Map();
  for(const row of candidate?.records||[]){
   const code=String(row.code||'').trim().toLowerCase();if(!code)continue;
   byCode.set(code,(byCode.get(code)||[]).concat(row));
  }
  return byCode;
 }).filter(byCode=>byCode.size);
 const codes=new Set(passes.flatMap(byCode=>[...byCode.keys()]));
 const normalise=value=>String(value||'').toLowerCase().replace(/[^a-z0-9.,]/g,'');
 for(const code of codes){
  const matching=passes.map(byCode=>byCode.get(code)).filter(rows=>rows?.length===1).map(rows=>rows[0]);
  if(matching.length<2)continue;
  for(const field of ['pack','measure']){
   const values=matching.map(row=>normalise(row[field])).filter(Boolean);
   if(new Set(values).size>1)return true;
  }
  for(const field of ['quantity','unitPrice','linePrice']){
   const values=matching.map(row=>Number(row[field])).filter(value=>Number.isFinite(value)&&value>0);
   if(values.length>1&&Math.max(...values)-Math.min(...values)>.01)return true;
  }
 }
 return false;
}
function invoiceChooseBestTablePass(candidates){
 const all=candidates||[],structured=all.filter(candidate=>candidate?.records?.length),choices=structured.length?structured:all;
 return choices.reduce((chosen,candidate)=>invoiceTablePassScore(candidate)>invoiceTablePassScore(chosen)?candidate:chosen,choices[0]);
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
  const chunks=[],lowConfidencePages=[];
  try{
   await worker.setParameters({preserve_interword_spaces:'1'});
   for await(const page of invoiceFilePages(file)){
    const candidates=[];
    await worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.AUTO,preserve_interword_spaces:'1'});
    invoiceStatus(`Reading page ${page.pageNo} of ${page.pageCount}…`);
    const first=await worker.recognize(page.canvas,{}, {text:true,tsv:true});
    const firstTable=invoiceRowsFromTsv(first.data.tsv||'');
    candidates.push({modeName:'automatic',text:first.data.text||'',rows:firstTable.text,records:firstTable.records,quality:firstTable.quality});
    if(invoiceTablePassScore(candidates[0])<60){
     invoiceStatus(`Checking page ${page.pageNo} with another table layout…`);
     const target=page.isPhoto?invoiceEnhancePhoto(page.canvas):page.canvas;
     await worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.SINGLE_BLOCK,preserve_interword_spaces:'1'});
     const block=await worker.recognize(target,{}, {text:true,tsv:true});
     const blockTable=invoiceRowsFromTsv(block.data.tsv||'');
     candidates.push({modeName:page.isPhoto?'high-contrast table':'single block',text:block.data.text||'',rows:blockTable.text,records:blockTable.records,quality:blockTable.quality});
     if(invoiceTablePassScore(invoiceChooseBestTablePass(candidates))<56){
      invoiceStatus(`Checking page ${page.pageNo} with a sparse text pass…`);
      await worker.setParameters({tessedit_pageseg_mode:window.Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});
      const sparse=await worker.recognize(target,{}, {text:true,tsv:true});
      const sparseTable=invoiceRowsFromTsv(sparse.data.tsv||'');
      candidates.push({modeName:page.isPhoto?'high-contrast sparse':'sparse',text:sparse.data.text||'',rows:sparseTable.text,records:sparseTable.records,quality:sparseTable.quality});
     }
     if(target!==page.canvas){target.width=0;target.height=0;}
    }
    const best=invoiceChooseBestTablePass(candidates);
    const pageScore=invoiceTablePassScore(best);
    const passDisagreement=invoiceTablePassesDisagree(candidates);
    const pageNeedsReview=pageScore<56||passDisagreement;
    if(pageNeedsReview)lowConfidencePages.push(page.pageNo);
    const reviewPasses=candidates.some(candidate=>candidate.records?.length)?candidates:[best];
    const rawPasses=reviewPasses.map(candidate=>`--- OCR text · ${candidate.modeName} ---\n${candidate.text}`).join('\n');
    const reviewWarning=pageScore<56?'low confidence':passDisagreement?'OCR layouts disagree; verify every field':'';
    chunks.push((pageNeedsReview?'--- MenuMargin OCR quality warning: '+reviewWarning+' ---\n':'')+'--- Page '+page.pageNo+' ---\n'+rawPasses+(best?.rows?'\n--- Selected table reconstruction · '+best.modeName+' ---\n'+best.rows:''));
    page.canvas.width=0;page.canvas.height=0;
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
   }
  }finally{await worker.terminate();}
  $('invoiceText').value=chunks.join('\n\n');
  const references=syncInvoiceReferences($('invoiceText').value);
  if(references.invoice||references.order)$('invoiceNumber').closest('.invoice-references').open=true;
  syncInvoiceSupplier($('invoiceText').value);
  const lowConfidenceScan=lowConfidencePages.length>0;
  invoiceStatus(lowConfidenceScan
   ?'Scan finished with fields needing extra review on page(s) '+lowConfidencePages.join(', ')+'. Check every product, pack and highlighted price against the invoice.'
   :'Scan complete. Check each detected product and price against the invoice below.');
  buildInvoiceReview();
  if(!$('invoiceReviewArea').hidden)requestAnimationFrame(()=>$('invoiceReviewArea').scrollIntoView({behavior:'smooth',block:'start'}));
  if(!$('invoiceSupplier').value.trim())invoiceStatus((lowConfidenceScan?'Low-confidence scan. Check every product and highlighted price. ':'Scan complete. ')+'Enter the supplier name before importing.');
 }catch(error){invoiceStatus('Could not scan this file.');invoiceToast(error.message||'The scan failed. Try a clearer image or PDF.');}
 finally{$('scanInvoice').disabled=false;}
}
function buildInvoiceReview(){
 const text=$('invoiceText').value.trim();
 if(!text){invoiceToast('Scan an invoice or paste extracted text first.');return}
 const lowConfidenceScan=/^---\s*MenuMargin OCR quality warning:/im.test(text);
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
 const usableStructuredRows=structuredRows.filter(row=>row.some(value=>String(value||'').trim()));
 // The positioned parser has already separated table headers and totals, so
 // preserve even a one-product invoice instead of sending it to noisier OCR text.
 const usingStructuredInvoiceRows=usableStructuredRows.length>0;
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
 const skip=/^(?:---\s*(?:MenuMargin OCR quality warning|page|product rows grouped by item code|(?:alternate\s+)?(?:table rows reconstructed|sparse layout)|enhanced photo(?: table rows reconstructed)?)|description\b|product\s+code|code\s+description|order date|delivery date|web\/order ref|your order ref|(?:tax\s+)?invoice(?:\s*(?:no\.?|number|#|ref(?:erence)?))?\b|(?:web\s*\/\s*)?order\s*(?:no\.?|number|#|ref(?:erence)?)\b|customer\s+(?:account\s+)?(?:no\.?|number|code)\b|page\s+\d+|[-_=]{4,}|total order value|order lines|item code|category\b|product\s+unit\s+of)/i;
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
   const parsedPack=parseStructuredPack(packValue,measureValue);
   let caseCount=parsedPack.caseCount,eachSize=parsedPack.eachSize,unit=parsedPack.unit,packMissing=parsedPack.packMissing;
   let quantity=parseAmount(String(quantityValue).replace(/[^\d.,]/g,''))||0;
   const unitPriceText=String(unitPriceValue).trim(),lineTotalText=String(lineTotalValue).trim();
   if(!quantity)quantity=invoiceInferQuantity(unitPriceText,lineTotalText)||0;
   if(!code&&!rawName&&!packValue&&!measureValue&&!quantityValue&&!unitPriceText&&!lineTotalText)continue;
   let selectedPrice=invoiceSelectPrice(unitPriceText,lineTotalText,quantity);
   // Meat invoices often price each kilogram but print the actual weighed
   // quantity and its extended line value. Store the weighed amount as the
   // pack size and the extended value as the case price, which preserves the
   // correct per-kg cost in the price book. This also repairs OCR that drops
   // a decimal in a weight such as 0.50 when the printed amount confirms it.
   const confirmedWeight=invoiceConfirmWeighedPack(packValue,measureValue,unitPriceText,lineTotalText);
   if(confirmedWeight){caseCount=1;eachSize=confirmedWeight.size;unit=confirmedWeight.unit;packMissing=false;selectedPrice={value:confirmedWeight.price,inferred:confirmedWeight.inferred}}
   if(lowConfidenceScan&&selectedPrice)selectedPrice={...selectedPrice,inferred:true};
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
  if(lowConfidenceScan&&selectedPrice)selectedPrice={...selectedPrice,inferred:true};
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
  const tdName=document.createElement('td'),name=document.createElement('textarea');name.className='invoice-item-name';name.rows=2;name.value=item.name;name.setAttribute('aria-label','Ingredient name');name.title=lowConfidenceScan?'This invoice page was read with low confidence. Check the product name against the original.':item.nameMissing?'OCR did not find the product description. Enter it from the invoice.':item.name; if(item.nameMissing||lowConfidenceScan){name.style.borderColor='#c47a12';name.style.background='#fff8e8'}tdName.appendChild(name);
  if(item.raw){const source=document.createElement('details');source.className='invoice-source';const summary=document.createElement('summary');summary.textContent='OCR source';const pre=document.createElement('pre');pre.textContent=item.raw;source.append(summary,pre);tdName.appendChild(source)}
  const tdCase=document.createElement('td'),caseQty=document.createElement('input');caseQty.className='invoice-case-qty';caseQty.type='number';caseQty.min='1';caseQty.step='1';caseQty.value=item.packMissing?'':item.caseCount;caseQty.setAttribute('aria-label','Items in this case');if(item.packMissing||item.packConflict||lowConfidenceScan){caseQty.title=lowConfidenceScan?'This invoice page was read with low confidence. Check the case count against the original.':'OCR did not find a reliable number of items per case. Enter it from the invoice.';caseQty.style.borderColor='#c47a12';caseQty.style.background='#fff8e8'}tdCase.appendChild(caseQty);
  const tdEach=document.createElement('td'),eachSize=document.createElement('input');eachSize.className='invoice-item-size';eachSize.type='number';eachSize.min='0.001';eachSize.step='any';eachSize.value=item.packMissing?'':item.eachSize;eachSize.setAttribute('aria-label','Size of each item in the case');if(item.packMissing||item.packConflict||lowConfidenceScan){eachSize.title=lowConfidenceScan?'This invoice page was read with low confidence. Check the pack size against the original.':item.packMissing?'OCR did not find the pack size. Enter it from the invoice before importing.':'OCR passes disagreed on this pack size. Check it against the invoice.';eachSize.style.borderColor='#c47a12';eachSize.style.background='#fff8e8'}tdEach.appendChild(eachSize);
  const tdUnit=document.createElement('td'),unit=document.createElement('select');[['kg','kg'],['g','g'],['l','litres'],['ml','ml'],['each','each']].forEach(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;unit.appendChild(o)});unit.value=item.unit;unit.setAttribute('aria-label','Unit');if(item.packMissing||item.packConflict||lowConfidenceScan){unit.title='Check the unit against the invoice.';unit.style.borderColor='#c47a12';unit.style.background='#fff8e8'}tdUnit.appendChild(unit);
  const tdTotal=document.createElement('td'),total=document.createElement('output');const updateTotal=()=>{const count=Number(caseQty.value),size=Number(eachSize.value);total.textContent=count>0&&size>0?((count*size).toLocaleString('en-GB',{maximumFractionDigits:3})+' '+unit.value):'Enter pack size'};updateTotal();tdTotal.appendChild(total);caseQty.addEventListener('input',updateTotal);eachSize.addEventListener('input',updateTotal);unit.addEventListener('change',updateTotal);
  const tdPrice=document.createElement('td'),price=document.createElement('input');price.className='invoice-price';price.type='number';price.min='0';price.step='0.01';price.value=item.price===null?'':item.price.toFixed(2);price.setAttribute('aria-label','Total price for case');if(item.price===null||item.priceInferred||item.priceConflict||lowConfidenceScan){price.title=lowConfidenceScan?'This invoice page was read with low confidence. Check the price against the original before importing.':item.priceConflict?'OCR passes found different prices. Enter the correct one from the invoice.':item.price===null?'OCR did not find a reliable price. Enter it from the invoice.':'OCR found an ambiguous whole-number amount. Check whether it is a full-pound price or whether OCR dropped the decimal point.';price.style.borderColor='#c47a12';price.style.background='#fff8e8'}tdPrice.appendChild(price);
  if(item.price===null||item.priceInferred||item.priceConflict||lowConfidenceScan){
   tr.dataset.priceNeedsConfirm='true';const verifyLabel=document.createElement('label');verifyLabel.className='invoice-price-verify';
   const verify=document.createElement('input');verify.type='checkbox';verify.className='invoice-price-confirm';verify.setAttribute('aria-label','I checked this case price against the invoice');
   verifyLabel.append(verify,document.createTextNode('I checked this price'));tdPrice.appendChild(verifyLabel);
  }
  tr.append(tdCheck,tdCode,tdName,tdCase,tdEach,tdUnit,tdTotal,tdPrice);tr.dataset.raw=item.raw;tr.dataset.unitsPerCase='1';tr.dataset.nameMissing=item.nameMissing?'true':'false';name.addEventListener('input',()=>{name.title=name.value.trim()||'Enter the product description from the invoice.';if(name.value.trim()&&name.value.trim()!==item.name){tr.dataset.nameMissing='false';name.style.borderColor='';name.style.background=''}});tbody.appendChild(tr);
 });
 $('invoiceReviewArea').hidden=false;
 const inferred=unique.filter(r=>r.priceInferred).length,missing=unique.filter(r=>r.price===null).length,missingPack=unique.filter(r=>r.packMissing).length,missingName=unique.filter(r=>r.nameMissing).length,conflicts=unique.filter(r=>r.priceConflict||r.packConflict).length;
 invoiceToast(`Built ${unique.length} review rows ${usingPositionedTableRows?'from the clearest reconstructed table layout':'from the available OCR text'}. Rows combine only when the same supplier code and product name match; ambiguous rows stay separate. All start unchecked. ${missingName} name(s), ${missing} price(s) and ${missingPack} pack size(s) need entry; ${inferred} inferred price(s) and ${conflicts} OCR conflict(s) are highlighted.${lowConfidenceScan?' OCR confidence is low: check every highlighted product, pack and price against the invoice.':''} Open “OCR source” under a name to inspect the recognized row.`);
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
function invoiceInferQuantity(unitPriceText,lineTotalText){
 const units=invoiceMoneyOptions(unitPriceText),totals=invoiceMoneyOptions(lineTotalText),matches=new Set();
 for(const unit of units)for(const total of totals){
  if(!(unit.value>0)||!(total.value>0))continue;
  const quantity=Math.round(total.value/unit.value);
  if(quantity>=1&&quantity<=1000&&Math.abs(unit.value*quantity-total.value)<=Math.max(.025,total.value*.0005))matches.add(quantity);
 }
 return matches.size===1?[...matches][0]:null;
}
function invoiceConfirmWeighedPack(packText,measureText,unitPriceText,lineTotalText){
 const unitMatch=String(measureText||'').match(/^\s*(kilograms?|kgs?|kg|grams?|grammes?|gms?|gm|gr|g|litres?|liters?|ltr|litre|liter|millilitres?|milliliters?|ml)\s*$/i);
 const rawWeight=String(packText||'').match(/^\s*[:(]?\s*(\d+(?:[.,]\d+)?)\s*[)]?\s*$/);
 if(!unitMatch||!rawWeight)return null;
 const rawUnit=unitMatch[1].toLowerCase();
 const unit=/^(?:kg|kgs|kilogram)/.test(rawUnit)?'kg':/^(?:g|gr|gram|gm)/.test(rawUnit)?'g':/^(?:l|ltr|litre|liter)/.test(rawUnit)?'l':'ml';
 const printedSize=Number(rawWeight[1].replace(',','.'));
 const massOrVolume=unit==='kg'||unit==='l',minSize=massOrVolume ? 0.05 : 0.5,maxSize=massOrVolume ? 500 : 100000;
 const unitOptions=invoiceMoneyOptions(unitPriceText),totalOptions=invoiceMoneyOptions(lineTotalText);
 const toleranceFor=total=>Math.max(.03,total*.001);
 for(const total of totalOptions){
  if(!(total.value>0))continue;
  // A normal printed weight is accepted only when the amount per unit
  // independently confirms it to normal invoice rounding tolerance.
  if(printedSize>=minSize&&printedSize<maxSize){
   const match=unitOptions.find(option=>option.value>0&&Math.abs(option.value*printedSize-total.value)<=toleranceFor(total.value));
   if(match)return {size:printedSize,unit,price:total.value,inferred:Boolean(total.inferred||match.inferred)};
   continue;
  }
  // Decimal OCR loss such as 0.50 -> 20050 is repaired only when one
  // plausible unit-rate/weight pair exactly explains the printed line total.
  const printedDigits=rawWeight[1].replace(/\D/g,'');
  const candidates=unitOptions.map(option=>({option,size:total.value/option.value})).filter(candidate=>{
   const impliedDigits=candidate.size.toFixed(2).replace(/\D/g,'');
   return candidate.option.value>=.01&&candidate.option.value<=500&&candidate.size>=minSize&&candidate.size<maxSize&&
    impliedDigits.length>=3&&printedDigits.includes(impliedDigits)&&
    Math.abs(candidate.option.value*candidate.size-total.value)<=toleranceFor(total.value);
  });
  if(candidates.length)return {size:Number(candidates[0].size.toFixed(2)),unit,price:total.value,inferred:true};
 }
 return null;
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
