import {parseGbpCell,parseQuantityCell,parsePackCell} from './values.js';
import {extractPage} from './table.js';
const median=a=>{const s=a.filter(Number.isFinite).sort((a,b)=>a-b);return s[Math.floor(s.length/2)]||0;};
const fieldValid=(key,words)=>key==='pack'?Boolean(parsePackCell(words,{allowOcrUnitGlyph:true}).unit):['quantity','weight'].includes(key)?parseQuantityCell(words.filter(w=>/[\p{L}\p{N}]/u.test(w.text))).value!==null:['unitPrice','lineTotal'].includes(key)?parseGbpCell(words,{allowOcrCurrencyGlyph:true}).value!==null:false;

/** A bounded second look at structurally unreadable cells. Both candidates
 * remain in debug data; OCR disagreements are never hidden from review. */
export async function refineUnreadableCells(ocr,prepared,rawWords,page,{pageNumber=1,progress=()=>{}}={}){
  const requests=[],byId=new Map(page.words.map(w=>[w.id,w])),height=median(page.words.map(w=>w.height));
  for(const row of page.rows){
    const source=row.sourceWords.map(id=>byId.get(id)).filter(Boolean),desc=page.columns.find(c=>c.key==='description');
    const names=source.filter(w=>w.cx>=desc.left&&w.cx<desc.right);
    if(!names.length)continue;
    const anchorX=median(names.map(w=>w.cx)),anchorY=median(names.map(w=>w.cy));
    for(const key of ['quantity','weight','unitPrice','lineTotal','pack']){
      if(key==='quantity'&&row.quantityBasis!=='case')continue;
      const column=page.columns.find(c=>c.key===key);if(!column)continue;
      const old=source.filter(w=>w.cx>=column.left&&w.cx<column.right);
      if(fieldValid(key,old))continue;
      // A blank weight column on a case invoice is intentionally unused.
      if(key==='weight'&&row.quantityBasis!=='weight')continue;
      const x=(column.left+column.right)/2,y=anchorY+(page.tableSlope||0)*(x-anchorX);
      const halfHeight=Math.max(12,height*.57);
      let left=Math.max(0,column.left+2),right=Math.min(prepared.pixels.width-1,column.right-2);
      if(old.length){left=Math.max(left,Math.min(...old.map(w=>w.x))-height*.2);right=Math.min(right,Math.max(...old.map(w=>w.x+w.width))+height*.2);}
      const top=Math.max(0,y-halfHeight),bottom=Math.min(prepared.pixels.height-1,y+halfHeight);
      if(right-left<8||bottom-top<8)continue;
      requests.push({rowId:row.id,key,old,box:[left,top,right,bottom],poly:[[left,top],[right,top],[right,bottom],[left,bottom]]});
    }
  }
  const limited=requests.slice(0,12);if(!limited.length)return {page,words:rawWords,refinements:[]};
  progress(`Taking a closer look at ${limited.length} unclear table cell(s)…`);
  const recognized=await ocr.recognizeRegions(prepared.binaryMat,limited.map(r=>r.poly));
  let words=rawWords.slice();const refinements=[];
  for(let i=0;i<limited.length;i++){
    const request=limited[i],line=recognized[i];
    const candidates=(line?.words||[]).map((w,wi)=>({id:`p${pageNumber}-retry${i}-w${wi}`,text:w.text,confidence:w.score,poly:w.poly,lineId:`p${pageNumber}-retry${i}`,positionSource:'ctc',reread:true,alignmentClipped:w.alignmentClipped,characters:(line.characters||[]).filter(c=>c.startStep>=w.startStep&&c.endStep<=w.endStep)}));
    const accepted=candidates.length>0&&line.score>=.85&&fieldValid(request.key,candidates);
    refinements.push({rowId:request.rowId,field:request.key,box:request.box,originalWords:request.old.map(w=>({text:w.text,confidence:w.confidence,poly:w.poly})),candidateWords:candidates,accepted});
    if(!accepted)continue;
    const [l,t,r,b]=request.box;
    words=words.filter(w=>{const xs=w.poly.map(p=>p[0]),ys=w.poly.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;return !(cx>=l&&cx<=r&&cy>=t&&cy<=b);});
    words.push(...candidates);
  }
  const result=extractPage(words,{width:prepared.pixels.width,height:prepared.pixels.height,verticalRules:prepared.verticalRules,pageNumber});
  return {page:result,words,refinements};
}
