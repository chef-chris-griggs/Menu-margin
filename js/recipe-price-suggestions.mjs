/** Suggest, never auto-link, alternative supplier descriptions in scanned recipes. */
const KIND={g:'mass',kg:'mass',ml:'volume',l:'volume',each:'count'};
const NOISE=new Set(['pet','bottle','bottles','tub','tubs','jar','jars','tin','tins','can','cans','pack','packs','case','bag','bags','carton','cartons','plastic','glass','foodservice','catering','brand','bulk','of','the','and']);
function tokens(text){return String(text||'').toLocaleLowerCase('en-GB').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t&&!NOISE.has(t));}
function clean(text){return tokens(text).join(' ');}
function valid(item,unit){
 if(!item||!item.id||!item.name||KIND[unit]!==KIND[item.baseUnit])return false;
 const price=Number(item.price),pack=Number(item.packBase);
 return item.price!==null&&item.price!==''&&Number.isFinite(price)&&price>=0&&Number.isFinite(pack)&&pack>0;
}
export function suggestRecipePriceMatches(name,quantityUnit,priceBook,{limit=6}={}){
 const query=tokens(name),q=clean(name);
 if(!q||!KIND[quantityUnit]||!Array.isArray(priceBook))return [];
 const results=[];
 for(const item of priceBook){
  if(!valid(item,quantityUnit))continue;
  const words=tokens(item.name),title=words.join(' ');
  if(!words.length)continue;
  const exact=title===q,contains=title.includes(q)&&q.length>=4;
  const covered=query.every(word=>words.includes(word));
  // A lone generic token is too broad. It is never presented as a fuzzy suggestion.
  if(!exact&&!contains&&!(query.length>=2&&covered))continue;
  // An ingredient may be described more fully by the supplier, but never propose
  // a substitute that is missing a requested ingredient word.
  if(!covered&&!exact)continue;
  const extra=words.filter(word=>!query.includes(word)).length;
  results.push({item,score:exact?1000:contains?500-extra:300-extra,matchType:exact?'exact':'suggested'});
 }
 results.sort((a,b)=>b.score-a.score||a.item.name.localeCompare(b.item.name)||String(a.item.id).localeCompare(String(b.item.id)));
 return results.slice(0,Math.max(1,Math.min(20,Number(limit)||6)));
}
