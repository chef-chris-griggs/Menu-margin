/** Pure, read-only suggestions from the caller's account-scoped price book. */
const KIND={g:'mass',kg:'mass',ml:'volume',l:'volume',each:'count'};
const NOISE=new Set(['pet','bottle','bottles','tub','tubs','jar','jars','tin','tins','can','cans','pack','packs','case','bag','bags','carton','cartons','plastic','glass','foodservice','catering','bulk','of','the','and']);
const PREPARATION=new Set(['chopped','diced','sliced','finely','roughly','peeled','washed','trimmed','crushed','grated','fresh']);
const ALIASES={minced:'mince',ground:'mince',minces:'mince',eggs:'egg',tomatoes:'tomato',onions:'onion',potatoes:'potato',carrots:'carrot',peppers:'pepper',breasts:'breast',fillets:'fillet',litres:'l',liters:'l',litre:'l',liter:'l',grams:'g',kilograms:'kg',aubergines:'aubergine',eggplant:'aubergine',courgettes:'courgette',zucchini:'courgette',scallions:'spring onion',arugula:'rocket',cilantro:'coriander'};
function tokens(text){return String(text||'').toLocaleLowerCase('en-GB').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|litres?|liters?)\b/g,' ').replace(/[^a-z0-9]+/g,' ').split(' ').flatMap(t=>(ALIASES[t]||t).split(' ')).filter(t=>t&&!NOISE.has(t));}
export function compatibleRecipeProduct(item,unit){
 if(!item||typeof item.id!=='string'||!item.id.trim()||typeof item.name!=='string'||!item.name.trim()||!KIND[unit]||!['g','ml','each'].includes(item.baseUnit)||KIND[unit]!==KIND[item.baseUnit])return false;
 const numeric=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
 return numeric(item.price)&&Number(item.price)>=0&&numeric(item.packBase)&&Number(item.packBase)>0;
}
export function suggestRecipePriceMatches(name,quantityUnit,priceBook,{limit=6}={}){
 const query=tokens(name).filter(t=>!PREPARATION.has(t)),q=query.join(' ');
 if(!q||!KIND[quantityUnit]||!Array.isArray(priceBook))return [];
 const results=[];
 // Broad food families and meat without a cut need manual selection.
 const generic=new Set(['oil','meat','beef','pork','lamb','chicken','fish','stock','flour','milk']);
 for(const item of priceBook){
  if(!compatibleRecipeProduct(item,quantityUnit))continue;
  const words=tokens(item.name),title=words.join(' '),exact=title===q;
  if(!exact&&(query.length===1&&generic.has(query[0])||!query.every(word=>words.includes(word))))continue;
  // Composite/prepared products must not masquerade as a raw ingredient.
  const prepared=['blend','blended','substitute','flavoured','flavored','spread','sauce','dressing','marinade','spray','powder','dried','cooked','smoked','mince','minced','ground','frozen','infused'];
  if(!exact&&prepared.some(t=>words.includes(t)&&!query.includes(t)))continue;
  const cuts=['breast','thigh','wing','leg','shoulder','loin','rib','rump','brisket','fillet','sirloin'];
  if(!exact&&cuts.some(cut=>words.includes(cut)&&!query.includes(cut)&&!(cut==='fillet'&&query.includes('breast')))&&query.some(cut=>cuts.includes(cut)))continue;
  for(const family of [['olive','rapeseed','sunflower','vegetable','sesame','coconut'],['beef','pork','lamb','chicken','turkey','duck','venison']]){
   if(query.some(t=>family.includes(t))&&words.some(t=>family.includes(t)&&!query.includes(t))){words.length=0;break;}
  }
  if(!words.length)continue;
  const extra=words.filter(word=>!query.includes(word)).length;
  results.push({item,score:exact?1000:500-extra,matchType:exact?'exact':'suggested'});
 }
 results.sort((a,b)=>b.score-a.score||a.item.name.localeCompare(b.item.name)||String(a.item.id).localeCompare(String(b.item.id)));
 return results.slice(0,Math.max(1,Math.min(20,Number(limit)||6)));
}
export function recipeScanCost(qty,unit,item){
 if(!compatibleRecipeProduct(item,unit)||!Number.isFinite(qty)||qty<=0)return null;
 const factor=u=>u==='kg'||u==='l'?1000:1;
 const cost=qty*factor(unit)/(Number(item.packBase)*factor(item.baseUnit))*Number(item.price);
 return Number.isFinite(cost)?cost:null;
}
// Explicit chef-entered pack prices never create a supplier identity.
export function recipeScanManualCost(qty,unit,{pack,packUnit,price}={}){
 const numeric=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
 if(!Number.isFinite(qty)||qty<=0||!KIND[unit]||KIND[unit]!==KIND[packUnit]||!numeric(pack)||Number(pack)<=0||!numeric(price)||Number(price)<0)return null;
 const factor=u=>u==='kg'||u==='l'?1000:1;
 const quantityBase=qty*factor(unit),packBase=Number(pack)*factor(packUnit);
 if(!Number.isFinite(quantityBase)||!Number.isFinite(packBase))return null;
 const cost=quantityBase/packBase*Number(price);
 return Number.isFinite(cost)?cost:null;
}
