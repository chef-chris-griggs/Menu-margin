// Read positioned PDF text separately from the image OCR pipeline.
// PDF.js returns text items with baseline coordinates, so join fragments by
// printed row rather than PDF stream order. This prevents column interleaving.
export function recipeLinesFromPdfText(items){
 const fragments=(Array.isArray(items)?items:[]).map((item,index)=>({
  text:String(item?.str||'').replace(/\s+/g,' ').trim(),
  x:Number(item?.transform?.[4]),
  y:Number(item?.transform?.[5]),
  index
 })).filter(item=>item.text&&Number.isFinite(item.x)&&Number.isFinite(item.y));
 const groups=[];
 for(const part of fragments.sort((a,b)=>b.y-a.y||a.x-b.x)){
  const row=groups.find(group=>Math.abs(group.y-part.y)<=2.5);
  if(row)row.parts.push(part);
  else groups.push({y:part.y,parts:[part]});
 }
 return groups.sort((a,b)=>b.y-a.y).map(row=>({
  text:row.parts.sort((a,b)=>a.x-b.x||a.index-b.index).map(x=>x.text).join(' ').trim(),
  confidence:1
 })).filter(row=>row.text);
}
