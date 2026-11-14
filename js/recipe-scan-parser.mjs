/* Recipe scan interpreter. This module never modifies recipes or prices. */
const UNIT={g:"g",gram:"g",gramme:"g",grammes:"g",grams:"g",kg:"kg",kilogram:"kg",kilograms:"kg",ml:"ml",millilitre:"ml",milliliter:"ml",milliliters:"ml",millilitres:"ml",l:"l",litre:"l",liter:"l",liters:"l",litres:"l",each:"each",ea:"each",piece:"each",pieces:"each",pcs:"each"};
const amount=/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(kg|kilograms?|g|gram(?:me)?s?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|each|ea|pieces?|pcs)\b\s*(?:of\s+)?(.+)$/i;
const tail=/^(.+?)\s*[:,-]?\s*(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(kg|kilograms?|g|gram(?:me)?s?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|each|ea|pieces?|pcs)\s*$/i;
const section=/^(ingredients?|method|instructions?|directions?|preparation)\s*:?\s*$/i;
const action=/^(step\s*\d+|preheat|heat|cook|mix|stir|bake|simmer|serve|add)\b/i;
function number(s){const f=/^(\d+)\/(\d+)$/.exec(s);return f?Number(f[1])/Number(f[2]):Number(s.replace(",","."));}
function ingredient(line){
 const raw=line.replace(/^\s*(?:(?:[-*]\s+|•\s*)|\d+[.)]\s+)/,"").trim();
 const first=amount.exec(raw),last=first?null:tail.exec(raw),m=first||last;
 if(m){
  const candidateName=(first?m[3]:m[1]).replace(/\s*\(notes?\s+\d+\)\s*/gi,' ').replace(/,\s*(?:sliced|chopped|diced|finely|roughly|cold\b|torn\b|peeled|crushed|grated)\b.*$/i,'').trim();
  if(/\bor\b|\//i.test(candidateName))return {name:candidateName,qty:null,qtyUnit:null,needsReview:true,source:raw};
  if(/\d/.test(candidateName))return {name:raw,qty:null,qtyUnit:null,needsReview:true,source:raw};
  const numeric=first?m[1]:m[2];
  if(/^\d+[,.]\d{3}$/.test(numeric))return {name:raw,qty:null,qtyUnit:null,needsReview:true,source:raw};
  const qty=number(first?m[1]:m[2]),unit=UNIT[(first?m[2]:m[3]).toLowerCase()],name=candidateName;
  if(Number.isFinite(qty)&&qty>0&&qty<=100000&&unit&&name.length<=200)return {name,qty,qtyUnit:unit,needsReview:false,source:raw};
 }
 const unmeasured=/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s+(.+)$/.exec(raw);
 if(unmeasured&&/[a-z]/i.test(unmeasured[2])&&!/^[-+]/.test(raw)){
  const name=unmeasured[2].replace(/^(?:tbsp|tsp|tablespoons?|teaspoons?)\s+/i,'').replace(/,.*$/,'').replace(/\s*\(notes?\s+\d+\)/gi,'').trim();
  return {name,qty:null,qtyUnit:null,needsReview:true,source:raw};
 }
 if(raw.length<=200&&/[a-z]/i.test(raw)&&!action.test(raw))return {name:raw,qty:null,qtyUnit:null,needsReview:true,source:raw};
 return null;
}
export function parseRecipeText(text){
 if(typeof text!=="string"||text.length>30000)throw Error("Invalid or oversized recipe text.");
 const lines=text.split(/\r?\n/).map(x=>x.trim().replace(/^(?:[☐□☑✓]\s*|\[\s*\]\s*)/,'' )).filter(Boolean).slice(0,180);
 let name="",yieldCount=null,inIngredients=false,finished=false;const ingredients=[],warnings=[];
 if(text.split(/\r?\n/).filter(x=>x.trim()).length>180)warnings.push("Only the first 180 lines were interpreted. Add missing ingredients manually.");
 for(const line of lines){
  if(/^\d{1,2}:\d{2}\b/.test(line)||(/\bfaq\b/i.test(line)&&/\bvideo\b/i.test(line))){warnings.push('Ignored screenshot clock or navigation text: '+line);continue;}
  if(/^\d+(?:[.,]\d+)?$/.test(line))warnings.push("Unattached OCR quantity: "+line+". Check the original; it was not assigned to an ingredient.");
  const servings=/\b(?:serves?|portions?|yield(?:s)?)\s*:?\s*(\d{1,4})\b(?![.,]\d)/i.exec(line);
  if(servings&&!yieldCount)yieldCount=Number(servings[1]);
  if(/^(?:method|instructions?|directions?|preparation)\s*:/i.test(line))finished=true;
  if(section.test(line)){if(/^(method|instructions?|directions?|preparation)/i.test(line))finished=true;if(/^ingredients?/i.test(line))inIngredients=true;continue;}
  if(/^for serving\s*:?$/i.test(line)){finished=true;continue;}
  if(finished)continue;
  if(inIngredients&&(/^(?:plus extra|torn into|finely chopped|REFRIGERATED until|\(find a recipe)/i.test(line)||/^\d+(?:[.,]\d+)?\s*mm\b.*thick/i.test(line))){
   if(ingredients.length)ingredients.at(-1).source+=' '+line;
   warnings.push('Check preparation or additional quantity: '+line);continue;
  }
  if(inIngredients&&/^(?:SAUCE\s+[A-Z ]+|FOR\s+THE\s+[A-Z ]+|TO\s+SERVE)$/.test(line)){warnings.push('Check section heading: '+line);continue;}
  if(!name&&!ingredients.length&&!inIngredients&&!servings&&!amount.test(line)&&!tail.test(line)&&!/^recipe\b/i.test(line)&&!/^[\d•*-]/.test(line)){name=line.slice(0,120);continue;}
  if(servings)continue;
  if(inIngredients||/^\d/.test(line)||amount.test(line)||tail.test(line)){const item=ingredient(line);if(item){inIngredients=true;ingredients.push(item);if(item.needsReview)warnings.push("Check quantity and unit: "+item.name);}}
 }
 if(!yieldCount)warnings.unshift("Confirm number of portions.");
 if(!ingredients.length)warnings.push("No ingredients identified. Check the source.");
 return {name:name||"Scanned recipe",yield:yieldCount,ingredients,warnings,requiresReview:true};
}
export function prepareRecipeImport(parsed){
 if(!parsed||!Array.isArray(parsed.ingredients))throw Error("Invalid recipe scan.");
 return {name:String(parsed.name||"Scanned recipe").slice(0,120),yield:Number.isInteger(parsed.yield)&&parsed.yield>0?parsed.yield:1,sellingPrice:0,targetGp:70,
 ingredients:parsed.ingredients.map(item=>({name:String(item.name||"").slice(0,200),qty:Number.isFinite(item.qty)&&item.qty>0?item.qty:0,qtyUnit:UNIT[item.qtyUnit]||"g",pack:0,packUnit:(["ml","l"].includes(item.qtyUnit)?"ml":item.qtyUnit==="each"?"each":"g"),price:0,priceEntered:false,priceBookId:null,priceLinkMode:"manual",priceBasis:"unknown"}))};
}
