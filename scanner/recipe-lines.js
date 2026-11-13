// Group OCR fragments using their page position, never by guessed numbers or units.
function bounds(poly){
 if(!Array.isArray(poly)||poly.length<3)return null;
 const points=poly.map(p=>Array.isArray(p)?p:null);
 if(points.some(p=>!p||!Number.isFinite(Number(p[0]))||!Number.isFinite(Number(p[1]))))return null;
 const xx=points.map(p=>Number(p[0])),yy=points.map(p=>Number(p[1]));
 return {left:Math.min(...xx),top:Math.min(...yy),right:Math.max(...xx),bottom:Math.max(...yy)};
}
function overlap(a,b){return Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}
export function recipeLinesFromOcr(items){
 const entries=(Array.isArray(items)?items:[]).map((line,index)=>{
  const text=(line.words||[]).map(w=>String(w.text||'')).join(' ').trim();
  const wordScores=(line.words||[]).map(w=>Number(w.score)||0);
  const box=bounds(line.poly)||bounds((line.words||[])[0]?.poly);
  return {text,confidence:wordScores.length?Math.min(...wordScores):0,box,index};
 }).filter(line=>line.text);
 // Decorative bullet glyphs must not become fabricated ingredients.
 const decorative=entries.filter(line=>/^[•−–-]$/.test(line.text));
 const positioned=entries.filter(line=>line.box&&!/^[•−–-]$/.test(line.text));
 const unpositioned=entries.filter(line=>!line.box&&!/^[•−–-]$/.test(line.text));
 const groups=[];
 for(const entry of positioned.sort((a,b)=>a.box.top-b.box.top||a.box.left-b.box.left)){
  const h=Math.max(1,entry.box.bottom-entry.box.top);
  const matching=groups.find(group=>{
   const gh=Math.max(1,group.box.bottom-group.box.top);
   return overlap(group.box,entry.box)>=Math.min(h,gh)*0.45;
  });
  if(matching){
   matching.items.push(entry);
   // Use the first fragment's vertical band to avoid chaining separate rows.
  }else groups.push({box:entry.box,items:[entry]});
 }
 const lines=groups.map(group=>{
  const parts=group.items.sort((a,b)=>a.box.left-b.box.left);
  return {text:parts.map(e=>e.text).join(' ').trim(),confidence:Math.min(...parts.map(e=>e.confidence)),
   top:group.box.top,index:Math.min(...parts.map(e=>e.index))};
 });
 for(const item of unpositioned)lines.push({text:item.text,confidence:item.confidence,index:item.index,top:Infinity});
 lines.sort((a,b)=>a.top-b.top||a.index-b.index);
 return {lines:lines.map(({top,...line})=>line),warnings:decorative.length?['Ignored isolated OCR bullet marks.']:[]};
}
