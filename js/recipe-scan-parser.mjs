/* Recipe scan interpreter. This module never modifies recipes or prices. */
const UNIT={g:"g",gram:"g",grams:"g",kg:"kg",kilogram:"kg",kilograms:"kg",ml:"ml",millilitre:"ml",millilitres:"ml",l:"l",litre:"l",litres:"l",each:"each",ea:"each",piece:"each",pieces:"each",pcs:"each"};
const amount=/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(kg|kilograms?|g|grams?|ml|millilitres?|l|litres?|each|ea|pieces?|pcs)\b\s*(?:of\s+)?(.+)$/i;
const tail=/^(.+?)\s*[:,-]?\s*(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(kg|kilograms?|g|grams?|ml|millilitres?|l|litres?|each|ea|pieces?|pcs)\s*$/i;
const section=/^(ingredients?|method|instructions?|directions?|preparation)\s*:?\s*$/i;
const action=/^(step\s*\d+|preheat|heat|cook|mix|stir|bake|simmer|serve|add)\b/i;
function number(s){const f=/^(\d+)\/(\d+)$/.exec(s);return f?Number(f[1])/Number(f[2]):Number(s.replace(",","."));}
function ingredient(line){
 const raw=line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/,"").trim();
 const first=amount.exec(raw),last=first?null:tail.exec(raw),m=first||last;
 if(m){
  const qty=number(first?m[1]:m[2]),unit=UNIT[(first?m[2]:m[3]).toLowerCase()],name=(first?m[3]:m[1]).trim();
  if(Number.isFinite(qty)&&qty>0&&qty<=100000&&unit&&name.length<=200)return {name,qty,qtyUnit:unit,needsReview:false,source:raw};
 }
 if(raw.length<=200&&/[a-z]/i.test(raw)&&!action.test(raw))return {name:raw,qty:null,qtyUnit:null,needsReview:true,source:raw};
 return null;
}
export function parseRecipeText(text){
 if(typeof text!=="string"||text.length>30000)throw Error("Invalid or oversized recipe text.");
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,180);
 let name="",yieldCount=null,inIngredients=false,finished=false;const ingredients=[],warnings=[];
 for(const line of lines){
  const servings=/\b(?:serves?|portions?|yield(?:s)?)\s*:?\s*(\d{1,4})\b/i.exec(line);
  if(servings&&!yieldCount)yieldCount=Number(servings[1]);
  if(section.test(line)){if(/^(method|instructions?|directions?|preparation)/i.test(line))finished=true;if(/^ingredients?/i.test(line))inIngredients=true;continue;}
  if(finished)continue;
  if(!name&&!servings&&!/^recipe\b/i.test(line)&&!/^[\d•*-]/.test(line)){name=line.slice(0,120);continue;}
  if(servings)continue;
  if(inIngredients||/^\d/.test(line)){const item=ingredient(line);if(item){ingredients.push(item);if(item.needsReview)warnings.push("Check quantity and unit: "+item.name);}}
 }
 if(!yieldCount)warnings.unshift("Confirm number of portions.");
 if(!ingredients.length)warnings.push("No ingredients identified. Check the source.");
 return {name:name||"Scanned recipe",yield:yieldCount,ingredients,warnings,requiresReview:true};
}
export function prepareRecipeImport(parsed){
 if(!parsed||!Array.isArray(parsed.ingredients))throw Error("Invalid recipe scan.");
 return {name:String(parsed.name||"Scanned recipe").slice(0,120),yield:Number.isInteger(parsed.yield)&&parsed.yield>0?parsed.yield:1,sellingPrice:0,targetGp:70,
 ingredients:parsed.ingredients.map(item=>({name:String(item.name||"").slice(0,200),qty:Number.isFinite(item.qty)&&item.qty>0?item.qty:0,qtyUnit:UNIT[item.qtyUnit]?item.qtyUnit:"g",pack:0,packUnit:"g",price:0,priceEntered:false,priceBookId:null,priceLinkMode:"auto",priceBasis:"unknown"}))};
}
