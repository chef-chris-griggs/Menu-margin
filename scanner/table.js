import { parseGbpCell, parseNumberCell, parsePackCell, parseQuantityCell } from './values.js';

const median=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;};
const normal=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const text=words=>words.slice().sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ').trim();
function headerToken(value,wanted){
  const actual=normal(value);if(actual===wanted)return true;
  if(actual.startsWith(wanted)&&['incvat','inclvat','exvat','exclvat'].includes(actual.slice(wanted.length)))return true;
  if(wanted.length<5||Math.abs(actual.length-wanted.length)>1)return false;
  let i=0,j=0,edits=0;while(i<actual.length&&j<wanted.length){if(actual[i]===wanted[j]){i++;j++;continue;}if(++edits>1)return false;if(actual.length>wanted.length)i++;else if(actual.length<wanted.length)j++;else{i++;j++;}}
  return edits+(actual.length-i)+(wanted.length-j)<=1;
}
const numericWords=words=>{
  const kept=words.filter(w=>/[0-9£]/.test(w.text)||/^(?:GBP|CR|CREDIT|[.,()+-])$/i.test(w.text));
  return kept.filter((w,i)=>!/^\s*[.,]\s*$/.test(w.text)||i>0&&i<kept.length-1&&/\d$/.test(kept[i-1].text)&&/^\d/.test(kept[i+1].text));
};
const descriptionText=words=>text(words.filter(w=>/[\p{L}\p{N}]/u.test(w.text)||['&','+','-','/'].includes(w.text)));
const boxOf=words=>{if(!words.length)return [0,0,0,0];const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y)),r=Math.max(...words.map(w=>w.x+w.width)),b=Math.max(...words.map(w=>w.y+w.height));return [x,y,r-x,b-y];};
export function normaliseWords(rawWords,width){
  const out=rawWords.map((w,i)=>{
    const poly=w.poly||w.polygon,px=poly.map(p=>p[0]),py=poly.map(p=>p[1]);
    const x=Math.min(...px),y=Math.min(...py),r=Math.max(...px),b=Math.max(...py);
    return {...w,id:w.id||`w${i}`,text:String(w.text||''),confidence:Number(w.confidence??w.score??0),poly,x,y,width:r-x,height:b-y,cx:(x+r)/2,cy:(y+b)/2};
  }).filter(w=>w.text.trim()&&w.width>0&&w.height>0);
  const slope=median(out.filter(w=>w.width>w.height*2).map(w=>{const p=w.poly;return (p[1][1]-p[0][1])/(p[1][0]-p[0][0]||1);}).filter(s=>Math.abs(s)<.15));
  return out.map(w=>({...w,rowY:w.cy-slope*(w.cx-width/2)}));
}
export function groupWordsIntoRows(words){
  const typical=median(words.map(w=>w.height))||16,rows=[];
  for(const word of words.slice().sort((a,b)=>a.rowY-b.rowY||a.x-b.x)){
    const recent=rows.slice(-4);
    let row=recent.filter(r=>Math.abs(r.y-word.rowY)<=Math.max(4,Math.min(typical,word.height)*.66)).sort((a,b)=>Math.abs(a.y-word.rowY)-Math.abs(b.y-word.rowY))[0];
    if(!row){row={y:word.rowY,words:[]};rows.push(row);}
    row.words.push(word);row.y=median(row.words.map(w=>w.rowY));
  }
  return rows.sort((a,b)=>a.y-b.y).map(row=>({...row,words:row.words.sort((a,b)=>a.x-b.x),box:boxOf(row.words)}));
}
function phraseAt(words,index,parts){
  const first=words[index];if(!first||!headerToken(first.text,parts[0]))return null;
  const picked=[first];let previous=first;
  for(const part of parts.slice(1)){
    const possible=words.filter(w=>w!==previous&&!picked.includes(w)&&headerToken(w.text,part)&&Math.abs(w.rowY-first.rowY)<Math.max(w.height,first.height)*2&&w.cx>first.cx-first.height*.7&&Math.abs(w.cx-previous.cx)<Math.max(180,first.height*9)).sort((a,b)=>Math.hypot(a.cx-previous.cx,a.rowY-previous.rowY)-Math.hypot(b.cx-previous.cx,b.rowY-previous.rowY));
    if(!possible.length)return null;picked.push(possible[0]);previous=possible[0];
  }
  const b=boxOf(picked);return {words:picked,x:b[0],right:b[0]+b[2],cx:b[0]+b[2]/2,y:b[1],bottom:b[1]+b[3],title:text(picked)};
}
const patterns=[
  ['description',['product','description']],['description',['productdescription']],['description',['description']],['description',['details']],
  ['description',['item','description']],['description',['item']],['description',['product']],
  ['code',['fd','product','code']],['code',['product','code']],['code',['item','code']],['code',['stock','code']],['code',['code']],['code',['sku']],
  ['lineNumber',['line','no']],
  ['pack',['pack','size']],['pack',['sizeunit']],['pack',['packsize']],['pack',['size']],
  ['looseQuantity',['unitsweight']],['looseQuantity',['units','weight']],
  ['weight',['weight','no']],['weight',['weight']],
  ['quantity',['no','of','items']],['quantity',['quantity']],['quantity',['qty']],['quantity',['cases']],['quantity',['ordered']],
  ['lineTotal',['nett','price']],['lineTotal',['net','price']],['lineTotal',['line','value']],['lineTotal',['line','total']],['lineTotal',['goods','value']],['lineTotal',['net','amount']],['lineTotal',['linevalue']],['lineTotal',['goodvalue']],['lineTotal',['goodsvalue']],['lineTotal',['nettprice']],['lineTotal',['netamount']],['lineTotal',['subtotal']],['lineTotal',['amount']],['lineTotal',['total']],
  ['unitPrice',['unit','price']],['unitPrice',['unitprice']],['unitPrice',['price']],['unitPrice',['rate']],
  ['vatRate',['vat']],['vatRate',['tax']],['vatRate',['v']],['unit',['unit']]
];
function headerMatches(words){
  const matches=[];
  for(let i=0;i<words.length;i++)for(const [key,parts] of patterns){const phrase=phraseAt(words,i,parts);if(phrase)matches.push({...phrase,key,parts});}
  const byKey=new Map();
  for(const m of matches.sort((a,b)=>b.words.length-a.words.length||a.cx-b.cx)){
    if(m.key==='description'&&m.parts.length===1&&['item','product'].includes(m.parts[0])&&matches.some(n=>n!==m&&(n.key==='description'&&!['item','product'].includes(n.parts[0])||n.key==='code'&&n.words.includes(m.words[0]))))continue;
    if(m.key==='unitPrice'&&matches.some(n=>n.key==='lineTotal'&&n.words.includes(m.words[0])))continue;
    if(m.key==='unit'&&matches.some(n=>n.key==='unitPrice'&&n.words.includes(m.words[0])))continue;
    if(m.key==='weight'&&matches.some(n=>n.key==='looseQuantity'&&n.words.some(w=>m.words.includes(w))))continue;
    if(m.key==='vatRate'&&words.some(w=>['ex','excl','excluding','inc','incl','including'].includes(normal(w.text))&&Math.abs(w.rowY-m.words[0].rowY)<m.words[0].height*.8&&w.cx<m.cx&&m.cx-w.cx<m.words[0].height*3))continue;
    if(!byKey.has(m.key))byKey.set(m.key,m);
  }
  if(!byKey.has('weight')&&byKey.has('unit')&&byKey.has('description')&&byKey.has('unitPrice')){
    const no=words.filter(w=>normal(w.text)==='no'&&w.cx>byKey.get('description').cx&&w.cx<byKey.get('unitPrice').cx).sort((a,b)=>b.cx-a.cx)[0];
    if(no){const b=boxOf([no]);byKey.set('weight',{key:'weight',words:[no],parts:['no'],x:b[0],right:b[0]+b[2],cx:no.cx,y:b[1],bottom:b[1]+b[3],title:no.text,inferred:true});}
  }
  const vat=byKey.get('vatRate'),desc=byKey.get('description');
  if(vat&&desc&&vat.cx<desc.cx)byKey.delete('vatRate');
  return [...byKey.values()];
}
export function detectHeader(rows,verticalRules,width){
  const height=median(rows.flatMap(r=>r.words.map(w=>w.height)))||16,candidates=[];
  for(const row of rows){
    const nearby=rows.filter(r=>r.y>=row.y-height*.5&&r.y<=row.y+height*2.1).flatMap(r=>r.words);
    const matched=headerMatches(nearby),keys=new Set(matched.map(m=>m.key));
    if(!keys.has('description')||(!keys.has('unitPrice')&&!keys.has('lineTotal'))||keys.size<3)continue;
    const headerYs=matched.flatMap(m=>m.words.map(w=>w.rowY));
    const span=Math.max(...headerYs)-Math.min(...headerYs);
    const score=keys.size+Number(keys.has('quantity'))+Number(keys.has('lineTotal'))+Number(keys.has('pack'))-span/height*.85;
    candidates.push({matched,score,y:row.y,bottom:Math.max(...matched.map(m=>m.bottom)),height});
  }
  const header=candidates.sort((a,b)=>b.score-a.score||a.y-b.y)[0];if(!header)return null;
  const ordered=header.matched.sort((a,b)=>a.cx-b.cx);
  const rules=verticalRules.filter(r=>r.y<=header.bottom+height*5&&r.y+r.height>header.bottom+height*4).map(r=>r.x);
  const columns=ordered.map((m,i)=>{
    const before=rules.filter(x=>x<m.cx-height*.2).at(-1),after=rules.find(x=>x>m.cx+height*.2);
    const bounded=Number.isFinite(before)&&Number.isFinite(after)&&before<m.x+height&&after>m.right-height&&!ordered.some(n=>n!==m&&n.cx>before&&n.cx<after);
    return {...m,left:bounded?before:i?(ordered[i-1].cx+m.cx)/2:0,right:bounded?after:i<ordered.length-1?(m.cx+ordered[i+1].cx)/2:width,ruled:bounded,taxBasis:taxBasis(m.words)};
  });
  const desc=columns.find(c=>c.key==='description'),di=columns.indexOf(desc);
  if(desc&&!desc.ruled){
    if(di>0){const previous=columns[di-1];const edge=Math.min(desc.cx-height,Math.max(...previous.words.map(w=>w.x+w.width))+height*.8);desc.left=edge;previous.right=edge;}
    if(di<columns.length-1){const next=columns[di+1];desc.right=next.left=Math.max(desc.cx+height,next.x-height*.8);}
  }
  const pack=columns.find(c=>c.key==='pack');
  for(const column of columns.filter(c=>c.key==='unitPrice'||c.key==='lineTotal')){
    const qualifiers=rows.flatMap(r=>r.words).filter(w=>w.cx>=column.left&&w.cx<column.right&&w.rowY>=header.y-height*.5&&w.rowY<=header.bottom+height*.2);
    column.taxBasis=taxBasis([...column.words,...qualifiers]);
  }
  if(pack&&desc&&!pack.ruled){
    const candidates=rows.filter(r=>r.y>header.bottom&&r.y<header.bottom+height*80).flatMap(r=>r.words).filter(w=>w.cx>(desc.cx+pack.cx)/2&&w.cx<pack.right&&parsePackCell([w]).unit);
    let cluster=[];
    for(const w of candidates){const same=candidates.filter(n=>Math.abs(n.x-w.x)<height*2.2);if(same.length>cluster.length)cluster=same;}
    if(cluster.length>=2){const edge=median(cluster.map(w=>w.x))-height*.35;pack.left=edge;desc.right=edge;}
  }
  // Numeric values are commonly right-aligned while their labels are centred.
  // Calibrate the gaps from repeated positioned values in each header-defined
  // neighbourhood; never widen a cell simply because OCR missed its value.
  for(const column of columns.filter(c=>['quantity','weight','unitPrice','lineTotal','vatRate'].includes(c.key))){
    const ci=columns.indexOf(column),previous=columns[ci-1],next=columns[ci+1];
    const low=previous?(previous.cx+column.cx)/2-height:0,high=next?next.cx+height:width;
    const reach=Math.min(previous?column.cx-previous.cx:Infinity,next?next.cx-column.cx:Infinity)*.8+height*.2;
    const candidates=rows.filter(r=>r.y>header.bottom&&r.y<header.bottom+height*80).flatMap(r=>r.words).filter(w=>w.cx>low&&w.cx<high&&Math.abs(w.cx-column.cx)<reach&&w.confidence>=.7&&parseGbpCell([w]).value!==null&&(column.key!=='vatRate'||w.width<height*1.6||['0.00','5.00','20.00'].includes(w.text)));
    let best=null;
    for(const candidate of candidates){
      const cluster=candidates.filter(w=>Math.abs(w.x+w.width-candidate.x-candidate.width)<height*.8);
      if(cluster.length<3)continue;
      const centre=median(cluster.map(w=>w.cx)),score=cluster.length/(1+Math.abs(centre-column.cx)/Math.max(height*2,(high-low)*.35));
      if(!best||score>best.score)best={score,centre,left:median(cluster.map(w=>w.x)),right:median(cluster.map(w=>w.x+w.width)),count:cluster.length};
    }
    if(best)column.dataAlignment=best;
  }
  for(let i=0;i<columns.length-1;i++){
    const a=columns[i],b=columns[i+1],da=a.dataAlignment,db=b.dataAlignment;
    if(da&&db&&da.centre<db.centre-height*.4){const edge=(da.right+db.left)/2;a.right=edge;b.left=edge;}
  }
  return {...header,columns};
}
function taxBasis(words){
  const n=words.map(w=>normal(w.text));
  if(n.includes('vat')&&n.some(x=>['ex','excl','excluding'].includes(x)))return 'ex_vat';
  if(n.includes('vat')&&n.some(x=>['inc','incl','including'].includes(x)))return 'inc_vat';
  if(n.some(x=>['net','nett','nettprice','netprice','exvat','excludingvat','exclvat'].includes(x)||x.endsWith('exvat')||x.endsWith('exclvat'))||n.includes('goods')&&n.includes('value')||n.includes('goodsvalue'))return 'ex_vat';
  if(n.some(x=>['incvat','inclvat','includingvat','gross'].includes(x)||x.endsWith('incvat')||x.endsWith('inclvat')))return 'inc_vat';
  return 'unknown';
}
function cellsFor(words,columns){
  const cells=Object.fromEntries(columns.map(c=>[c.key,[]]));
  for(const word of words){
    let choices=columns.filter(c=>word.cx>=c.left&&word.cx<c.right);
    if(!choices.length)choices=columns;
    const chosen=choices.slice().sort((a,b)=>Math.abs(word.cx-(a.dataAlignment?.centre??a.cx))-Math.abs(word.cx-(b.dataAlignment?.centre??b.cx)))[0];
    if(chosen)cells[chosen.key].push(word);
  }
  return cells;
}
function splitColumnSpanningWords(words,columns,width,headerBottom){
  const numeric=new Set(['quantity','weight','unitPrice','lineTotal','vatRate']);
  const split=words.flatMap(word=>{
    if(!word.characters?.length||word.cy<=headerBottom||!/[0-9]/.test(word.text)||parseGbpCell([word],{allowOcrCurrencyGlyph:true}).value!==null)return [word];
    const parts=[];
    for(const character of word.characters){
      const xs=character.poly.map(p=>p[0]),cx=(Math.min(...xs)+Math.max(...xs))/2;
      const column=columns.find(c=>cx>=c.left&&cx<c.right);
      if(!column||!numeric.has(column.key))return [word];
      let part=parts.at(-1);if(part?.column!==column.key){part={column:column.key,characters:[]};parts.push(part);}part.characters.push(character);
    }
    if(parts.length<2)return [word];
    return parts.map((part,i)=>{
      const chars=part.characters,px=chars.flatMap(c=>c.poly.map(p=>p[0])),py=chars.flatMap(c=>c.poly.map(p=>p[1]));
      const l=Math.min(...px),r=Math.max(...px),t=Math.min(...py),b=Math.max(...py);
      return {...word,id:`${word.id}-c${i}`,parentWord:word.id,columnSplit:true,text:chars.map(c=>c.text).join(''),confidence:chars.reduce((s,c)=>s+c.score,0)/chars.length,poly:[[l,t],[r,t],[r,b],[l,b]],characters:chars};
    });
  });
  return normaliseWords(split,width);
}
// Short OCR boxes are often axis-aligned even when the paper is tilted. Use
// the repeated product baselines to estimate the table tilt, rather than the
// median angle of those short boxes. The score uses geometry and column
// occupancy only; prices and arithmetic never determine a word's row.
function alignTableRows(words,header,physicalRows){
  const h=header.height,desc=header.columns.find(c=>c.key==='description');
  const firstFooter=physicalRows.find(r=>r.y>header.bottom+h&&isFooter(r));
  const bottom=firstFooter?.box[1]??Infinity;
  const body=words.filter(w=>w.cy>header.bottom&&w.cy<bottom);
  const descriptions=body.filter(w=>w.cx>=desc.left&&w.cx<desc.right&&/\p{L}/u.test(w.text));
  const anchors=groupWordsIntoRows(descriptions).filter(r=>!isFooter(r)&&!rowLabel(r.words).some(x=>['producttype','description','chilled','ambient'].includes(x)));
  if(anchors.length<3)return physicalRows;
  const x=median(descriptions.map(w=>w.cx)),anchorYs=anchors.map(r=>median(r.words.map(w=>w.cy)));
  const measured=body.flatMap(w=>{
    const cell=header.columns.find(c=>w.cx>=c.left&&w.cx<c.right);
    if(!cell||!['code','quantity','pack','unitPrice','lineTotal','weight'].includes(cell.key))return [];
    if(!/[0-9]/.test(w.text))return [];
    return [{word:w,column:cell.key}];
  });
  if(measured.length<anchors.length*2)return physicalRows;
  let best={score:Infinity,slope:0};
  for(let slope=-.08;slope<=.08001;slope+=.001){
    let score=0;const occupancy=new Map();
    for(const {word,column} of measured){
      const y=word.cy-slope*(word.cx-x);
      let nearest=0;for(let i=1;i<anchorYs.length;i++)if(Math.abs(y-anchorYs[i])<Math.abs(y-anchorYs[nearest]))nearest=i;
      const d=Math.abs(y-anchorYs[nearest])/h;score+=Math.min(d*d,2);
      const key=`${column}:${nearest}`;occupancy.set(key,(occupancy.get(key)||0)+1);
    }
    for(const count of occupancy.values())if(count>1)score+=(count-1)*.15;
    if(score<best.score)best={score,slope};
  }
  const aligned=words.map(w=>({...w,rowY:w.cy-best.slope*(w.cx-x)}));
  header.tableSlope=best.slope;
  return groupWordsIntoRows(aligned);
}
function codeFrom(words){
  for(const w of words||[]){const s=w.text.replace(/^[\[(]|[\]),;:]$/g,'');if(/[0-9]/.test(s)&&/^[A-Za-z0-9-]+$/.test(s))return s;}
  return '';
}
function unitFrom(words){
  for(const w of words||[]){const n=normal(w.text);if(['kg','kgs','kilogram','kilograms'].includes(n))return 'kg';if(['g','gm','grams','gram'].includes(n))return 'g';if(['l','ltr','litre','litres'].includes(n))return 'l';if(['ml','millilitres'].includes(n))return 'ml';if(['ea','each','units','unit'].includes(n))return 'each';}
  return null;
}
function rowLabel(words){return words.map(w=>normal(w.text));}
function isFooter(row){
  const labels=rowLabel(row.words);
  return labels.includes('subtotal')||labels.includes('vatanalysis')||labels.some(x=>x.startsWith('invoicetotal'))||labels.includes('grandtotal')||labels.includes('continued')||labels.includes('deliveryinformation')||
    (labels.includes('vat')&&labels.includes('analysis'))||(labels.includes('code')&&labels.includes('goods')&&labels.includes('vat'))||(labels.includes('delivery')&&labels.includes('information'))||(labels.includes('invoice')&&labels.some(x=>x.startsWith('total')))||
    (labels.includes('goods')&&labels.includes('value')&&!labels.includes('description'))||(labels.includes('gross')&&labels.includes('amount'));
}
function readTotals(rows,start){
  const totals={subtotal:null,vat:null,total:null},evidence={};
  const labels=[['subtotal',['subtotal']],['subtotal',['goods','value']],['subtotal',['goodsvalue']],['subtotal',['net','amount']],['total',['invoice','total']],['total',['invoicetotal']],['total',['grand','total']],['total',['gross','amount']],['vat',['vat']]];
  for(let ri=0;ri<rows.length;ri++){
    const row=rows[ri];if(row.y<start)continue;
    for(let i=0;i<row.words.length;i++)for(const [key,parts] of labels){
      const match=phraseAt(row.words,i,parts);if(!match)continue;
      if(key==='vat'&&rowLabel(row.words).some(x=>['analysis','vatanalysis','no','number','goods'].includes(x)))continue;
      let nearby=row.words.filter(w=>w.x>match.right&&!match.words.includes(w));
      let valueWords=nearby.filter(w=>parseGbpCell([w]).value!==null).sort((a,b)=>a.x-b.x),amount=parseGbpCell(valueWords.slice(0,1));
      if(amount.value===null){
        const next=rows[ri+1];
        if(next&&next.y-row.y<Math.max(60,row.box[3]*2.8)){
          nearby=next.words.filter(w=>w.cx>=match.x-row.box[3]&&w.cx<=Math.max(match.right+row.box[3]*8,row.box[0]+row.box[2]));valueWords=nearby.filter(w=>parseGbpCell([w]).value!==null).sort((a,b)=>Math.abs(a.cx-match.cx)-Math.abs(b.cx-match.cx));amount=parseGbpCell(valueWords.slice(0,1));
        }
      }
      if(amount.value!==null){totals[key]=amount.value;evidence[key]=valueWords.slice(0,1).map(w=>w.id);}
    }
    // VAT analysis tables put their net amount underneath a GOODS heading.
    // Use that explicit column, never an unlabelled amount elsewhere in a footer.
    const footerLabels=rowLabel(row.words),goods=row.words.find(w=>normal(w.text)==='goods');
    if(goods&&footerLabels.some(x=>x==='vat'||x==='vatanalysis')&&rows[ri+1]){
      const below=rows[ri+1];
      const choices=below.words.filter(w=>Math.abs(w.cx-goods.cx)<Math.max(60,goods.height*2.5)&&parseGbpCell([w]).value!==null);
      if(choices.length===1){totals.subtotal=parseGbpCell(choices).value;evidence.subtotal=choices.map(w=>w.id);}
      const amountHeader=row.words.find(w=>normal(w.text)==='amount'||normal(w.text)==='vatamount');
      if(amountHeader){const amounts=below.words.filter(w=>Math.abs(w.cx-amountHeader.cx)<Math.max(60,amountHeader.height*2.5)&&parseGbpCell([w]).value!==null);if(amounts.length===1){totals.vat=parseGbpCell(amounts).value;evidence.vat=amounts.map(w=>w.id);}}
    }
  }
  return {...totals,evidence};
}
function readReference(rows,kind,headerY){
  const patterns=kind==='invoice'?[['invoice','no'],['invoice','number']]:kind==='order'?[['order','no'],['order','number']]:kind==='page'?[['page','no'],['page']]:[['delivery','note','number'],['delivery','no']];
  for(let ri=0;ri<rows.length;ri++){
    const row=rows[ri];if(row.y>headerY)break;
    for(let i=0;i<row.words.length;i++)for(const parts of patterns){
      const found=phraseAt(row.words,i,parts);if(!found)continue;
      const valid=w=>/\d/.test(w.text)&&!found.words.includes(w)&&/^[A-Za-z0-9,./-]+$/.test(w.text);
      const same=row.words.filter(w=>w.x>=found.right&&valid(w)).sort((a,b)=>a.x-b.x);
      if(same.length)return same[0].text;
      const next=rows[ri+1];if(next&&next.y-row.y<row.box[3]*3){const values=next.words.filter(w=>w.cx>=found.x-row.box[3]&&w.cx<=found.right+row.box[3]*2&&valid(w));if(values.length)return values[0].text;}
    }
  }
  return null;
}
export function extractPage(rawWords,{width,height,verticalRules=[],pageNumber=1}={}){
  let words=normaliseWords(rawWords,width),physicalRows=groupWordsIntoRows(words);const header=detectHeader(physicalRows,verticalRules,width);
  const warnings=[],items=[],unassignedFragments=[];
  if(!header)return {pageNumber,words,columns:[],rows:[],totals:{subtotal:null,vat:null,total:null},warnings:['No reliable product-table header was detected.'],needsReview:true};
  words=splitColumnSpanningWords(words,header.columns,width,header.bottom);physicalRows=groupWordsIntoRows(words);
  physicalRows=alignTableRows(words,header,physicalRows);
  let lastBodyY=header.bottom,footerStart=Infinity,continues=false;
  const rowHeight=header.height;
  for(const physical of physicalRows.filter(r=>r.y>header.bottom-rowHeight*.15)){
    if(isFooter(physical)&&items.length){footerStart=physical.y;continues=rowLabel(physical.words).includes('continued');break;}
    const cells=cellsFor(physical.words,header.columns);
    const desc=descriptionText(cells.description||[]),productCode=codeFrom(cells.code||[]),qtyValue=parseQuantityCell(numericWords(cells.quantity||[])),weightValue=parseQuantityCell(numericWords(cells.weight||[])),qty=qtyValue.value,loose=parseNumberCell(cells.looseQuantity||[]),weight=weightValue.value;
    const price=parseGbpCell(numericWords(cells.unitPrice||[]),{allowOcrCurrencyGlyph:true}),line=parseGbpCell(numericWords(cells.lineTotal||[]),{allowOcrCurrencyGlyph:true}),packValue=parsePackCell(cells.pack||[],{allowOcrUnitGlyph:true}),u=unitFrom(cells.unit||[]);
    const fieldEvidence=Boolean(productCode||price.value!==null||line.value!==null||qty!==null||loose!==null||packValue.eachSize!==null);
    const labels=rowLabel(physical.words);
    if(labels.includes('description')||labels.includes('producttype')||labels.includes('chilled')&&labels.includes('type')||labels.includes('ambient')&&labels.includes('type'))continue;
    let ambiguousDescriptionBand=false;
    if(!fieldEvidence){
      const previous=items.at(-1);
      if(desc&&previous&&physical.y-previous._lastY<rowHeight*1.8&&/\p{L}/u.test(desc)){
        // It could be a wrapped name OR a new product whose numeric cells
        // failed OCR. Preserve the ambiguity instead of silently merging two
        // products. The extra row stays unchecked and requires photo review.
        ambiguousDescriptionBand=true;
      }else continue;
    }
    // Preserve detached number bands for inspection without inventing another
    // product. A quantity and VAT value alone do not identify an ingredient.
    if(!desc&&!productCode&&!cells.pack?.length){
      if(qty!==null||loose!==null||weight!==null)unassignedFragments.push({words:physical.words.map(w=>w.id),box:physical.box});
      continue;
    }
    if(desc&&!/[A-Za-z]/.test(desc)&&!productCode)continue;
    let quantity=qty,quantityBasis='case',pack=packValue.eachSize===null?null:{caseCount:packValue.caseCount,eachSize:packValue.eachSize,unit:packValue.unit};
    const mixedQuantities=qty>0&&loose>0;
    if(loose>0&&!(qty>0)){quantity=loose;quantityBasis='unit';if(pack)pack={...pack,caseCount:1};}
    if(mixedQuantities){quantity=null;quantityBasis='mixed';pack=null;}
    if(header.columns.some(c=>c.key==='weight')&&u&&u!=='each'){quantity=weight;quantityBasis='weight';pack=weight===null?null:{caseCount:1,eachSize:weight,unit:u};}
    const unitPriceColumn=header.columns.find(c=>c.key==='unitPrice'),lineColumn=header.columns.find(c=>c.key==='lineTotal');
    const basis=unitPriceColumn?.taxBasis&&unitPriceColumn.taxBasis!=='unknown'?unitPriceColumn.taxBasis:lineColumn?.taxBasis||'unknown';
    const essential=physical.words.filter(w=>/[\p{L}\p{N}£]/u.test(w.text));
    const confidence=essential.length?Math.min(...essential.map(w=>w.confidence)):0,reasons=[];
    if(!desc)reasons.push('Missing product description');
    if(mixedQuantities)reasons.push('Both cases and loose units were ordered; resolve the priced quantity and pack before importing');
    if(ambiguousDescriptionBand)reasons.push('Description-only band: check whether this is a separate product or a wrapped name');
    if(quantity===null)reasons.push('Missing quantity');
    if(price.value===null)reasons.push('Missing unit price');
    if(line.value===null)reasons.push('Missing line total');
    if(!pack||!pack.caseCount||!pack.eachSize||!pack.unit)reasons.push('Missing pack size or unit');
    if(confidence<.86)reasons.push('Low OCR confidence');
    if(essential.some(w=>w.alignmentClipped))reasons.push('Some word positions extend into OCR padding and need checking');
    if(essential.some(w=>w.columnSplit))reasons.push('OCR joined neighbouring columns; check the separated values against the photo');
    if(essential.some(w=>w.reread))reasons.push('An unclear cell was reread with a second image treatment; check it against the photo');
    if(quantityBasis==='weight'&&header.columns.find(c=>c.key==='weight')?.inferred)reasons.push('The weight heading was partly unreadable; check the billed weight');
    if(basis==='unknown')reasons.push('VAT basis is not specified in the price headers');
    reasons.push(...price.reasons,...line.reasons,...qtyValue.reasons,...weightValue.reasons);
    if(quantityBasis!=='weight')reasons.push(...packValue.reasons);
    const tolerance=quantityBasis==='weight'&&price.value!==null?Math.max(.02,price.value*.005+.015):.02;
    const difference=quantity!==null&&price.value!==null&&line.value!==null?Math.abs(quantity*price.value-line.value):null;
    if(difference!==null&&difference>tolerance)reasons.push('Quantity × unit price does not match the line total');
    const item={id:`p${pageNumber}-r${items.length+1}`,pageNumber,productCode,description:desc,quantity,orderedQuantity:qty,looseQuantity:loose,quantityBasis,unitPrice:price.value,lineTotal:line.value,priceBasis:basis,unitPriceTaxBasis:unitPriceColumn?.taxBasis||'unknown',lineTotalTaxBasis:lineColumn?.taxBasis||'unknown',weight:quantityBasis==='weight'?weight:null,unit:u||pack?.unit||null,pack,printedPack:packValue.eachSize===null?null:{caseCount:packValue.caseCount,eachSize:packValue.eachSize,unit:packValue.unit},confidence,reasons:[...new Set(reasons)],needsReview:reasons.length>0,arithmetic:{difference,tolerance,matches:difference===null?null:difference<=tolerance},sourceWords:physical.words.map(w=>w.id),sourceBox:physical.box,_lastY:physical.y,_words:physical.words};
    items.push(item);lastBodyY=physical.y;
  }
  const totals=readTotals(physicalRows,Number.isFinite(footerStart)?footerStart:lastBodyY+rowHeight*.8);
  const before=physicalRows.filter(r=>r.y<header.bottom);
  const invoiceNumber=readReference(before,'invoice',header.y),orderNumber=readReference(before,'order',header.y),deliveryNumber=readReference(before,'delivery',header.y),printedPage=Number(readReference(before,'page',header.y))||null;
  const tokenSet=new Set(before.flatMap(r=>r.words.map(w=>normal(w.text))));
  const supplier=tokenSet.has('bidfood')?'Bidfood':tokenSet.has('freshdirect')?'Fresh Direct':tokenSet.has('british')&&tokenSet.has('meats')?'British Premium Meats':'';
  if(unassignedFragments.length)warnings.push(`${unassignedFragments.length} detached numeric fragment(s) could not be assigned to a product. Check the source image for missing quantities.`);
  return {pageNumber:printedPage||pageNumber,printedPage,invoiceNumber,orderNumber,deliveryNumber,supplier,words,columns:header.columns.map(({words,...c})=>c),tableSlope:header.tableSlope,headerBox:boxOf(header.matched.flatMap(m=>m.words)),rows:items.map(({_lastY,_words,...item})=>({...item,pageNumber:printedPage||pageNumber})),totals,continues,unassignedFragments,warnings,needsReview:items.some(r=>r.needsReview)};
}
export function combinePages(pages,{filename=''}={}){
  const ordered=pages.slice().sort((a,b)=>a.pageNumber-b.pageNumber),rows=ordered.flatMap(p=>p.rows),warnings=ordered.flatMap(p=>p.warnings||[]);
  const blockingIssues=[];
  const refs=new Set(ordered.map(p=>p.invoiceNumber).filter(Boolean));if(refs.size>1){warnings.push('These pages have different invoice numbers. Scan one invoice at a time.');blockingIssues.push('different_invoice_numbers');}
  const deliveries=new Set(ordered.map(p=>p.deliveryNumber).filter(Boolean));if(!refs.size&&deliveries.size>1){warnings.push('These pages have different delivery note numbers. Scan one delivery note at a time.');blockingIssues.push('different_delivery_numbers');}
  const seenPages=new Set();for(const page of ordered){if(!page.printedPage)continue;if(seenPages.has(page.printedPage)){warnings.push(`More than one photo has printed page number ${page.printedPage}. Keep one clear capture of each invoice page.`);blockingIssues.push('duplicate_printed_page');}seenPages.add(page.printedPage);}
  const last=ordered.at(-1),pageNumbers=new Set(ordered.map(p=>p.printedPage).filter(Boolean)),missingPages=[];
  const count=last?.printedPage&&!last.continues?last.printedPage:null;
  if(count)for(let n=1;n<=count;n++)if(!pageNumbers.has(n))missingPages.push(n);
  if(last?.continues)missingPages.push((last.printedPage||ordered.length)+1);
  if(missingPages.length)warnings.push(`Invoice pages are missing: ${missingPages.join(', ')}. Whole-invoice subtotal validation is deferred.`);
  const totals={subtotal:null,vat:null,total:null};for(const page of ordered)for(const key of Object.keys(totals))if(page.totals[key]!==null&&page.totals[key]!==undefined)totals[key]=page.totals[key];
  const sumLineTotals=Math.round(rows.reduce((sum,r)=>sum+(r.lineTotal??0),0)*100)/100;
  const subtotalDifference=totals.subtotal===null?null:Math.round((sumLineTotals-totals.subtotal)*100)/100;
  const canCheck=!missingPages.length&&totals.subtotal!==null;
  const matchesSubtotal=canCheck?Math.abs(subtotalDifference)<=.03:null;
  if(matchesSubtotal===false){warnings.push('The extracted line totals do not add up to the printed subtotal.');for(const row of rows){row.needsReview=true;row.reasons=[...new Set([...row.reasons,'Invoice subtotal does not reconcile'])];}}
  if(totals.subtotal===null)warnings.push('No explicit invoice subtotal was found; the subtotal check could not be completed.');
  return {version:1,engine:'PaddleOCR PP-OCRv5 · ONNX Runtime WebAssembly',filename,supplier:ordered.find(p=>p.supplier)?.supplier||'',invoiceNumber:[...refs][0]||'',orderNumber:ordered.find(p=>p.orderNumber)?.orderNumber||'',deliveryNumber:ordered.find(p=>p.deliveryNumber)?.deliveryNumber||'',pages:ordered,rows,totals,validation:{sumLineTotals,matchesSubtotal,subtotalDifference,missingPages,blockingIssues:[...new Set(blockingIssues)]},warnings:[...new Set(warnings)]};
}
