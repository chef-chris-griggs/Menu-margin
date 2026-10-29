// Shared exact-name rules. Case and whitespace do not change a product name;
// spelling, punctuation, accents and word order do. No fuzzy matching here.
function mmExactIngredientName(value){return String(value??'').trim().toLocaleLowerCase('en-GB').replace(/\s+/gu,' ')}
function mmPriceUnitKind(unit){return ['g','kg'].includes(unit)?'mass':['ml','l'].includes(unit)?'volume':unit==='each'?'count':null}
function mmBuildPriceIndex(items){
 const index={byId:new Map(),byName:new Map(),isPriceIndex:true};
 for(const item of Array.isArray(items)?items:[]){
  if(!item?.id)continue;
  index.byId.set(item.id,item);const key=mmExactIngredientName(item.name);
  if(key){if(!index.byName.has(key))index.byName.set(key,[]);index.byName.get(key).push(item);}
 }
 return index;
}
function mmResolveIngredientPrice(value,prices){
 const {priceLinkIssue:ignored,...row}=value||{},index=prices?.isPriceIndex?prices:mmBuildPriceIndex(prices);
 const name=mmExactIngredientName(row.name),candidates=index.byName.get(name)||[];
 const finish=(status,message,ingredient=row)=>({ingredient,status,message,candidates});
 if(row.priceLinkMode==='manual')return finish('manual','Own price — automatic updates off');
 let item=row.priceBookId?index.byId.get(row.priceBookId):null;
 if(row.priceBookId&&!item)return finish('missing','Supplier item was removed; saved price retained',{...row,priceLinkIssue:'Supplier item was removed; saved price retained'});
 if(item&&mmExactIngredientName(item.name)!==name)return finish('name-mismatch','Names no longer match exactly; saved price retained',{...row,priceLinkIssue:'Names no longer match exactly; saved price retained'});
 if(!item){
  if(candidates.length>1)return finish('ambiguous','More than one supplier item has this exact name. Choose one.',{...row,priceLinkIssue:'Choose a supplier for this exact ingredient name'});
  item=candidates[0];
 }
 if(!item)return finish('unlinked','No exact match in your price book');
 const price=Number(item.price),pack=Number(item.packBase),unit=item.baseUnit;
 if(item.price===null||item.price===''||!Number.isFinite(price)||price<0||!Number.isFinite(pack)||pack<=0||!['g','ml','each'].includes(unit))return finish('invalid','Supplier price is incomplete; saved price retained',{...row,priceLinkIssue:'Supplier price is incomplete; saved price retained'});
 if(mmPriceUnitKind(row.packUnit||'g')!==mmPriceUnitKind(unit))return finish('unit-mismatch','Supplier and recipe pack units differ; check before linking',{...row,priceLinkIssue:'Supplier and recipe pack units differ; saved price retained'});
 return finish('linked','Linked to '+(item.supplier||'supplier')+(item.code?' · '+item.code:''),{
  ...row,priceBookId:item.id,priceLinkMode:'linked',pack,packUnit:unit,price,priceEntered:true,
  priceBasis:item.priceBasis||'unknown',priceBookUpdatedAt:item.updatedAt||null
 });
}
function mmResolveRecipePrices(recipe,prices){
 const index=prices?.isPriceIndex?prices:mmBuildPriceIndex(prices);
 return {...recipe,ingredients:(recipe.ingredients||[]).map(row=>mmResolveIngredientPrice(row,index).ingredient)};
}
