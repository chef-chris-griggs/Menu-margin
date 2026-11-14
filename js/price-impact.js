// Read-only comparisons. Existing pricing and costing helpers remain authoritative.
function mmImpactNumber(value){return (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));}
function mmImpactCost(row){
 if(!row||typeof row!=='object'||!String(row.name||'').trim()||row.priceEntered===false)return null;
 if(!['qty','pack','price'].every(key=>mmImpactNumber(row[key]))||Number(row.qty)<=0||Number(row.pack)<=0||Number(row.price)<0)return null;
 if(![row.qtyUnit||'g',row.packUnit||'g'].every(unit=>['g','kg','ml','l','each'].includes(unit)))return null;
 if(![mmToBase(row.qty,row.qtyUnit||'g'),mmToBase(row.pack,row.packUnit||'g')].every(value=>Number.isFinite(value)&&value>0))return null;
 const value=mmIngredientCost(row);
 return value.complete&&!value.invalid&&!value.incompatible&&Number.isFinite(value.cost)?value.cost:null;
}
function mmRecipePriceImpact(recipe,prices){
 const index=prices?.isPriceIndex?prices:mmBuildPriceIndex(prices),changes=[],issues=new Set();
 let before=0,after=0,complete=true,allExVat=true,relevant=false;
 const rows=Array.isArray(recipe?.ingredients)?recipe.ingredients:[];
 for(const value of rows){
  if(!value||typeof value!=='object'){complete=false;issues.add('An ingredient needs checking.');continue;}
  if(!mmIngredientTouched(value))continue;
  const resolved=mmResolveIngredientPrice(value,index),current=resolved.ingredient;
  const oldCost=mmImpactCost(value),newCost=mmImpactCost(current);
  if(oldCost===null||newCost===null){complete=false;issues.add('Complete every ingredient quantity, pack price and compatible unit.');}
  else{before+=oldCost;after+=newCost;}
  if(value.priceBasis!=='ex_vat'||current.priceBasis!=='ex_vat')allExVat=false;
  if(['missing','name-mismatch','ambiguous','invalid','unit-mismatch'].includes(resolved.status)){relevant=true;issues.add(resolved.message);}
  if(resolved.status!=='linked')continue;
  if(oldCost===null||newCost===null){relevant=true;continue;}
  const delta=newCost-oldCost,basisChanged=(value.priceBasis||'unknown')!==(current.priceBasis||'unknown');
  if(Math.abs(delta)>1e-9||basisChanged){
   relevant=true;const item=index.byId.get(current.priceBookId);
   changes.push({name:value.name,supplier:item.supplier||'Supplier not recorded',priceBookId:item.id,quantity:value.qty,unit:value.qtyUnit||'g',before:{price:Number(value.price),pack:Number(value.pack),unit:value.packUnit||'g',priceBasis:value.priceBasis||'unknown',cost:oldCost},after:{price:Number(current.price),pack:Number(current.pack),unit:current.packUnit,priceBasis:current.priceBasis,cost:newCost},delta});
  }
 }
 const portions=mmImpactNumber(recipe?.yield)&&Number.isInteger(Number(recipe.yield))&&Number(recipe.yield)>0?Number(recipe.yield):null;
 if(!portions)issues.add('Check the saved number of portions.');
 if(!rows.some(row=>row&&typeof row==='object'&&mmIngredientTouched(row))){complete=false;issues.add('This recipe has no costed ingredients.');}
 if(!Number.isFinite(before)||!Number.isFinite(after)){complete=false;issues.add('Ingredient costs are too large to compare.');}
 if(relevant&&!allExVat)issues.add('Check VAT: GP comparisons require every saved and current price to exclude VAT. No VAT is deducted automatically.');
 const comparable=complete&&Boolean(portions),delta=comparable?after-before:null;
 const selling=mmImpactNumber(recipe?.sellingPrice)&&Number(recipe.sellingPrice)>0?Number(recipe.sellingPrice):null;
 const gpReady=comparable&&allExVat&&selling!==null&&issues.size===0;
 const oldGp=gpReady?(selling-before/portions)/selling*100:null,newGp=gpReady?(selling-after/portions)/selling*100:null;
 const validGp=gpReady&&Number.isFinite(oldGp)&&Number.isFinite(newGp);
 const target=mmImpactNumber(recipe?.targetGp)&&Number(recipe.targetGp)>0&&Number(recipe.targetGp)<100?Number(recipe.targetGp):null;
 const status=!relevant?'unchanged':issues.size?'review':Math.abs(delta)>1e-9?(delta>0?'increase':'decrease'):'unchanged';
 return {id:recipe?.id,name:recipe?.name||'Untitled recipe',status,changes,issues:[...issues],portions,sellingPrice:selling,beforeCost:comparable?before:null,afterCost:comparable?after:null,delta,portionDelta:comparable?delta/portions:null,beforeGp:validGp?oldGp:null,afterGp:validGp?newGp:null,targetGp:target,belowTarget:validGp&&target!==null&&newGp<target,crossedTarget:validGp&&target!==null&&oldGp>=target&&newGp<target};
}
function mmPriceImpactReport(recipes,prices){
 const index=mmBuildPriceIndex(prices),order={increase:0,review:1,decrease:2};
 return (Array.isArray(recipes)?recipes:[]).filter(recipe=>recipe&&typeof recipe==='object'&&recipe.id).map(recipe=>mmRecipePriceImpact(recipe,index)).filter(item=>item.status!=='unchanged').sort((a,b)=>order[a.status]-order[b.status]||(b.portionDelta||0)-(a.portionDelta||0)||String(a.name).localeCompare(String(b.name),'en-GB'));
}
