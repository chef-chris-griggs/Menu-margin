// Read-only saved-recipe checks. Existing price resolution and costing own the numbers.
function mmRecipeAttention(recipe,prices){
 const index=prices?.isPriceIndex?prices:mmBuildPriceIndex(prices),issues=[];
 const add=(category,message,rowIndex=null,field=null,priceBookId=null)=>issues.push({category,message,rowIndex,field,priceBookId});
 const rows=Array.isArray(recipe?.ingredients)?recipe.ingredients:[];
 let total=0,touched=0,complete=true,allExVat=true,linksValid=true;
 for(const [i,value] of rows.entries()){
  if(!value||typeof value!=='object'){complete=false;add('units','Check this ingredient line.',i,'.ingredient');continue;}
  if(!mmIngredientTouched(value))continue;touched++;
  const match=mmResolveIngredientPrice(value,index),row=match.ingredient,name=String(row.name||'Ingredient '+(i+1)).trim(),cost=mmImpactCost(row);
  if(!String(row.name||'').trim())add('units','Name this ingredient.',i,'.ingredient');
  if(!mmImpactNumber(row.qty)||Number(row.qty)<=0)add('units',name+': enter a positive quantity used.',i,'.qty');
  if(!mmImpactNumber(row.pack)||Number(row.pack)<=0)add('prices',name+': enter a positive pack size.',i,'.pack');
  if(row.priceEntered===false||!mmImpactNumber(row.price)||Number(row.price)<0)add('prices',name+': enter the pack price or choose a supplier. An explicit £0 price is allowed.',i,'.price');
  if(![row.qtyUnit||'g',row.packUnit||'g'].every(unit=>['g','kg','ml','l','each'].includes(unit))||mmPriceUnitKind(row.qtyUnit||'g')!==mmPriceUnitKind(row.packUnit||'g'))add('units',name+': check the quantity and pack units; weight, volume and each cannot be mixed.',i,'.qty-unit');
  if(['missing','name-mismatch','ambiguous','invalid','unit-mismatch'].includes(match.status)){
   linksValid=false;
   if(match.status==='invalid')add('prices',name+': '+match.message,i,'pbPrice',row.priceBookId);
   else if(match.status==='unit-mismatch')add('units',name+': '+match.message,i,'.qty-unit');
   else add('prices',name+': '+match.message,i,match.status==='ambiguous'?'.price-link-choice':'.price-link-toggle');
  }
  if(row.priceBasis!=='ex_vat'){
   allExVat=false;
   if(row.priceEntered!==false&&mmImpactNumber(row.price)&&Number(row.price)>=0)add('vat',name+(row.priceBasis==='inc_vat'?': price includes VAT. Check an excluding-VAT price; no VAT is deducted automatically.':': confirm the VAT basis before relying on GP.'),i,match.status==='linked'?'pbPriceBasis':'.ingredient-vat-basis',match.status==='linked'?row.priceBookId:null);
  }
  if(cost===null){complete=false;if(!issues.some(issue=>issue.rowIndex===i&&['units','prices'].includes(issue.category)))add('units',name+': check the quantity and pack size; this line cannot be costed reliably.',i,'.qty');}
  else total+=cost;
 }
 if(!touched){complete=false;add('units','Add ingredients, quantities and pack prices. Blank lines do not count.',null,'addIngredient');}
 if(!Number.isFinite(total)){complete=false;add('units','Check very large ingredient quantities and pack sizes.',null,'addIngredient');}
 const portions=mmImpactNumber(recipe?.yield)&&Number.isInteger(Number(recipe.yield))&&Number(recipe.yield)>0?Number(recipe.yield):null;
 const selling=mmImpactNumber(recipe?.sellingPrice)&&Number(recipe.sellingPrice)>0?Number(recipe.sellingPrice):null;
 const target=mmImpactNumber(recipe?.targetGp)&&Number(recipe.targetGp)>=1&&Number(recipe.targetGp)<=99.9?Number(recipe.targetGp):null;
 if(!String(recipe?.name||'').trim())add('details','Give this recipe a name.',null,'recipeName');
 if(portions===null)add('details','Enter a positive whole number of portions.',null,'yield');
 if(selling===null)add('details','Enter the actual selling price per portion, excluding VAT.',null,'sellingPrice');
 if(target===null)add('details','Set a GP target between 1% and 99.9%.',null,'targetGp');
 let gp=complete&&linksValid&&allExVat&&portions!==null&&selling!==null?(selling-total/portions)/selling*100:null;
 if(gp!==null&&!Number.isFinite(gp)){gp=null;add('details','Check the selling price and ingredient amounts; GP is too large to show reliably.',null,'sellingPrice');}
 if(gp!==null&&target!==null&&target-gp>1e-9)add('gp',target-gp<.1?'GP is slightly below your '+target+'% target (less than 0.1 percentage points below).':'GP is '+gp.toFixed(1)+'%, below your '+target+'% target by '+(target-gp).toFixed(1)+' percentage points.',null,'sellingPrice');
 const rank={prices:0,units:1,vat:2,details:3,gp:4};issues.sort((a,b)=>rank[a.category]-rank[b.category]||(a.rowIndex??-1)-(b.rowIndex??-1));
 return {id:recipe?.id,name:recipe?.name||'Untitled recipe',issues,categories:[...new Set(issues.map(issue=>issue.category))],gp,targetGp:target,shortfall:gp!==null&&target!==null?Math.max(0,target-gp):null,portionCost:complete&&linksValid&&portions!==null?total/portions:null,priority:issues.length?rank[issues[0].category]:5};
}
function mmRecipeAttentionReport(recipes,prices){
 const index=mmBuildPriceIndex(prices);
 return (Array.isArray(recipes)?recipes:[]).filter(recipe=>recipe&&typeof recipe==='object'&&recipe.id).map(recipe=>mmRecipeAttention(recipe,index)).filter(item=>item.issues.length).sort((a,b)=>a.priority-b.priority||(b.shortfall||0)-(a.shortfall||0)||String(a.name).localeCompare(String(b.name),'en-GB'));
}
