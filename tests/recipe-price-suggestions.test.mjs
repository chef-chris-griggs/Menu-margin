import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestRecipePriceMatches,recipeScanManualCost} from '../js/recipe-price-suggestions.mjs';
const item=(name,unit='ml',extra={})=>({id:name,name,supplier:'Fresh Direct',baseUnit:unit,packBase:5000,price:27,priceBasis:'ex_vat',...extra});
test('manual whole-pack prices convert compatible metric units without a supplier identity',()=>{
 assert.equal(recipeScanManualCost(200,'ml',{pack:5,packUnit:'l',price:25}),1);
 assert.equal(recipeScanManualCost(.2,'kg',{pack:1000,packUnit:'g',price:10}),2);
 assert.equal(recipeScanManualCost(3,'each',{pack:12,packUnit:'each',price:6}),1.5);
 assert.equal(recipeScanManualCost(200,'ml',{pack:'5',packUnit:'l',price:'0'}),0);
});
test('missing, incompatible and invalid manual pack prices never become valid or free costs',()=>{
 const valid={pack:5,packUnit:'l',price:25};
 for(const value of ['',null,undefined,false,NaN,Infinity,-1])assert.equal(recipeScanManualCost(200,'ml',{...valid,price:value}),null);
 for(const value of ['',null,undefined,false,0,-1,Infinity])assert.equal(recipeScanManualCost(200,'ml',{...valid,pack:value}),null);
 assert.equal(recipeScanManualCost(200,'g',valid),null);
 assert.equal(recipeScanManualCost(200,'ml',{...valid,packUnit:'each'}),null);
 assert.equal(recipeScanManualCost(0,'ml',valid),null);
 assert.equal(recipeScanManualCost(1e308,'l',{pack:1,packUnit:'ml',price:1e308}),null);
 assert.equal(recipeScanManualCost(200,'ml',{pack:1e308,packUnit:'l',price:25}),null);
});
test('olive oil suggests Extra Virgin Olive Oil PET by compatible unit, but never auto-confirms',()=>{
 const book=[item('Extra Virgin Olive Oil PET'),item('Vegetable Oil 5L'),item('Olive Oil Organic'),item('Olive Oil Spray','each')];
 const results=suggestRecipePriceMatches('olive oil','ml',book);
 assert.ok(results.some(row=>row.item.name==='Extra Virgin Olive Oil PET'));
 assert.ok(results.some(row=>row.item.name==='Olive Oil Organic'));
 assert.ok(!results.some(row=>row.item.name==='Vegetable Oil 5L'));
 assert.ok(!results.some(row=>row.item.name==='Olive Oil Spray'));
 assert.ok(results.every(row=>row.matchType==='suggested'||row.matchType==='exact'));
});
test('specific olive oil cannot silently substitute vegetable or rapeseed oil',()=>{
 const results=suggestRecipePriceMatches('Extra Virgin Olive Oil','ml',[item('Extra Virgin Rapeseed Oil'),item('Pure Vegetable Oil'),item('Extra Virgin Olive Oil PET')]);
 assert.deepEqual(results.map(x=>x.item.name),['Extra Virgin Olive Oil PET']);
});
test('single generic terms do not trigger broad guesses',()=>{
 assert.deepEqual(suggestRecipePriceMatches('oil','ml',[item('Extra Virgin Olive Oil PET'),item('Vegetable Oil')]),[]);
 assert.equal(suggestRecipePriceMatches('Oil','ml',[item('Oil')]).length,1);
});
test('ignores missing prices, incompatible packs, and other users are never queried',()=>{
 const book=[item('Extra Virgin Olive Oil PET','g'),item('Extra Virgin Olive Oil PET','ml',{id:'no-price',price:null}),item('Extra Virgin Olive Oil PET','ml',{id:'valid'}),item('Extra Virgin Olive Oil PET','ml',{id:'empty',packBase:0})];
 assert.deepEqual(suggestRecipePriceMatches('olive oil','ml',book).map(x=>x.item.id),['valid']);
});
test('literal text treated as safe data and results are deterministic',()=>{
 const book=[item('<img src=x onerror=alert(1)> Olive Oil PET','ml',{id:'b'}),item('Olive Oil PET','ml',{id:'a'})];
 const first=suggestRecipePriceMatches('olive oil','ml',book);
 assert.deepEqual(first,suggestRecipePriceMatches('olive oil','ml',book));
 assert.equal(first.length,2);
});
test('preparation, plurals, synonyms and packaging do not hide suitable products',()=>{
 assert.equal(suggestRecipePriceMatches('finely chopped onions','g',[item('Onion bag 5kg','g')]).length,1);
 assert.equal(suggestRecipePriceMatches('diced courgettes','g',[item('Zucchini 5 kg','g')]).length,1);
});
test('raw ingredients do not suggest prepared blends or a different meat cut',()=>{
 assert.equal(suggestRecipePriceMatches('olive oil','ml',[item('Olive Oil Blend'),item('Olive Oil Dressing')]).length,0);
 assert.equal(suggestRecipePriceMatches('chicken breast','g',[item('Chicken thigh','g'),item('Chicken breast smoked','g')]).length,0);
});
test('pack costing converts metric units without mass-to-volume guesses',async()=>{
 const {recipeScanCost}=await import('../js/recipe-price-suggestions.mjs');
 const olive=item('Olive Oil','ml',{price:25});
 assert.equal(recipeScanCost(200,'ml',olive),1);assert.equal(recipeScanCost(.2,'l',olive),1);
 assert.equal(recipeScanCost(200,'g',olive),null);assert.equal(recipeScanCost(200,'ml',{...olive,price:undefined}),null);
});
test('a matching word does not permit mixed cuts or infused oils',()=>{
 assert.equal(suggestRecipePriceMatches('chicken breast','g',[item('Chicken breast and thigh','g')]).length,0);
 assert.equal(suggestRecipePriceMatches('olive oil','ml',[item('Olive Oil Lemon Infused')]).length,0);
});
test('mince descriptions can change word order without accepting mixed meats or oils',()=>{
 assert.equal(suggestRecipePriceMatches('beef mince','g',[item('Minced Beef UK','g')]).length,1);
 assert.equal(suggestRecipePriceMatches('beef mince','g',[item('Beef and Pork Mince','g')]).length,0);
 assert.equal(suggestRecipePriceMatches('olive oil','ml',[item('Olive and Rapeseed Oil')]).length,0);
 assert.equal(suggestRecipePriceMatches('chicken breast','g',[item('Chicken and Turkey Breast','g')]).length,0);
});
test('corrupt or blank price-book fields cannot invent zero-priced products',async()=>{
 const {compatibleRecipeProduct,recipeScanCost}=await import('../js/recipe-price-suggestions.mjs');
 for(const price of [' ',true,false,NaN,Infinity,{},null,undefined])assert.equal(compatibleRecipeProduct(item('Olive Oil','ml',{price}),'ml'),false);
 for(const packBase of [' ',true,0,-1,Infinity])assert.equal(compatibleRecipeProduct(item('Olive Oil','ml',{packBase}),'ml'),false);
 assert.equal(compatibleRecipeProduct(item('Olive Oil','ml',{price:0}),'ml'),true,'Explicit zero is distinct from missing');
 assert.equal(recipeScanCost(1e308,'l',item('Olive Oil')),null);
});
test('metric unit-equivalent quantities yield the same costs across ordinary pack sizes',async()=>{
 const {recipeScanCost}=await import('../js/recipe-price-suggestions.mjs');
 for(const [unit,base] of [['kg','g'],['l','ml']])for(const pack of [250,1000,5000])for(const price of [0,1.99,25]){
  const p=item('Ingredient',base,{packBase:pack,price});
  assert.ok(Math.abs(recipeScanCost(250,base,p)-recipeScanCost(.25,unit,p))<1e-10);
  assert.ok(Math.abs(recipeScanCost(pack,base,p)-price)<1e-10);
 }
});
