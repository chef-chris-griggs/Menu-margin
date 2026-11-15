import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [pricing,recipe,impact,attention]=await Promise.all(['js/pricing.js','js/recipe.js','js/price-impact.js','js/recipe-attention.js'].map(read));
const helpers=recipe.slice(recipe.indexOf('function mmUnitKind('),recipe.indexOf('\nfunction calculate('));
const api=vm.runInNewContext(pricing+'\n'+helpers+'\n'+impact+'\n'+attention+'\n({mmRecipeAttention,mmRecipeAttentionReport})');
const row=(extra={})=>({name:'Olive oil',qty:200,qtyUnit:'ml',pack:5000,packUnit:'ml',price:25,priceEntered:true,priceLinkMode:'manual',priceBasis:'ex_vat',...extra});
const dish=(extra={})=>({id:'dish',name:'Sauce',yield:2,sellingPrice:5,targetGp:70,ingredients:[row()],...extra});
const book=(extra={})=>({id:'oil-a',name:'Olive oil',supplier:'Supplier A',packBase:5000,baseUnit:'ml',price:30,priceBasis:'ex_vat',...extra});
const run=(recipe=dish(),prices=[])=>api.mmRecipeAttention(recipe,prices),has=(r,category)=>r.categories.includes(category);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);

test('healthy manual prices and legacy entered prices are usable without a supplier book',()=>{
 for(const extra of [{},{priceLinkMode:'auto'}]){const r=run(dish({ingredients:[row(extra)]}));assert.equal(r.issues.length,0);near(r.gp,90);near(r.portionCost,.5);}
});
test('current trusted supplier prices determine completeness and GP, rather than old saved-price issues',()=>{
 const r=run(dish({ingredients:[row({priceLinkMode:'linked',priceBookId:'oil-a',priceEntered:false,priceBasis:'unknown',price:''})]}),[book()]);assert.equal(r.issues.length,0);near(r.gp,88);near(r.portionCost,.6);
});
test('missing or negative pack prices and pack sizes require checking; explicit zero is valid',()=>{
 for(const extra of [{price:''},{price:null},{price:undefined},{price:NaN},{price:Infinity},{price:-1},{priceEntered:false},{pack:0},{pack:''}]){const r=run(dish({ingredients:[row(extra)]}));assert.ok(has(r,'prices'));assert.equal(r.gp,null);}
 const zero=run(dish({ingredients:[row({price:0})]}));assert.equal(zero.issues.length,0);near(zero.gp,100);
});
test('a complete saved recipe below target is flagged even when no supplier prices changed',()=>{
 const r=run(dish({sellingPrice:1,targetGp:70}));assert.deepEqual(Array.from(r.categories),['gp']);near(r.gp,50);near(r.shortfall,20);assert.equal(r.issues[0].field,'sellingPrice');
});
test('actual selling price controls GP; negative GP is valid and no price is estimated',()=>{
 const negative=run(dish({sellingPrice:.25}));near(negative.gp,-100);assert.ok(has(negative,'gp'));
 for(const sellingPrice of ['',null,0,-1,Infinity]){const r=run(dish({sellingPrice}));assert.ok(has(r,'details'));assert.equal(r.gp,null);assert.ok(!has(r,'gp'));}
});
test('an equal GP target and floating-point noise do not create false below-target warnings',()=>{
 assert.equal(run(dish({sellingPrice:2,targetGp:75})).issues.length,0);
 assert.equal(run(dish({sellingPrice:2,targetGp:75+1e-10})).issues.length,0);
});
test('unclear or VAT-inclusive prices suppress reliable GP, including manual ingredients',()=>{
 for(const priceBasis of ['unknown','inc_vat',undefined]){const r=run(dish({sellingPrice:1,ingredients:[row({priceBasis})]}));assert.ok(has(r,'vat'));assert.ok(!has(r,'gp'));assert.equal(r.gp,null);assert.equal(r.issues.find(i=>i.category==='vat').field,'.ingredient-vat-basis');}
});
test('supplier VAT and invalid supplier prices lead to the exact supplier editor, without a substitution',()=>{
 const linked=dish({ingredients:[row({priceLinkMode:'linked',priceBookId:'oil-a'})]});
 const vat=run(linked,[book({priceBasis:'unknown'})]);assert.equal(vat.issues.find(i=>i.category==='vat').priceBookId,'oil-a');assert.equal(vat.issues.find(i=>i.category==='vat').field,'pbPriceBasis');
 const invalid=run(linked,[book({price:null})]);assert.equal(invalid.gp,null);assert.equal(invalid.issues.find(i=>i.category==='prices').priceBookId,'oil-a');
});
test('ambiguous, removed and renamed products do not silently use another supplier or expose reliable GP',()=>{
 const linked=dish({ingredients:[row({priceLinkMode:'linked',priceBookId:'oil-a'})]});
 for(const prices of [[],[book({id:'oil-b'})],[book({name:'Vegetable oil'})]]){const r=run(linked,prices);assert.ok(has(r,'prices'));assert.equal(r.gp,null);}
 const r=run(dish({ingredients:[row({priceLinkMode:'auto'})]}),[book(),book({id:'oil-b'})]);assert.ok(has(r,'prices'));assert.equal(r.issues[0].field,'.price-link-choice');assert.equal(r.gp,null);
});
test('an explicit supplier stays selected even if a same-name supplier has another price',()=>{
 const r=run(dish({ingredients:[row({priceLinkMode:'linked',priceBookId:'oil-a'})]}),[book(),book({id:'oil-b',price:100})]);assert.equal(r.issues.length,0);near(r.gp,88);
});
test('invalid quantities, names and incompatible or unknown units block GP',()=>{
 for(const extra of [{qty:''},{qty:0},{qty:-1},{qty:Infinity},{name:''},{qtyUnit:'g'},{qtyUnit:'box'},{packUnit:'box'}]){const r=run(dish({ingredients:[row(extra)]}));assert.ok(has(r,'units'),JSON.stringify(extra));assert.equal(r.gp,null);}
});
test('current supplier unit-kind mismatch is a unit check and never a reliable GP',()=>{
 const r=run(dish({ingredients:[row({priceLinkMode:'linked',priceBookId:'oil-a'})]}),[book({baseUnit:'g'})]);assert.ok(has(r,'units'));assert.equal(r.gp,null);
});
test('existing metric and count conversion rules determine full-recipe GP',()=>{
 for(const [qty,qtyUnit,pack,packUnit] of [[.2,'kg',1,'kg'],[200,'ml',1,'l'],[2,'each',10,'each']]){
  const r=run(dish({ingredients:[row({qty,qtyUnit,pack,packUnit,price:10})]}));assert.equal(r.issues.length,0);near(r.portionCost,1);near(r.gp,80);
 }
});
test('incomplete ingredients block a below-target assertion, untouched blank lines do not',()=>{
 const blank={name:'',qty:'',pack:'',price:'',priceEntered:false};assert.equal(run(dish({ingredients:[row(),blank]})).issues.length,0);
 const incomplete=run(dish({sellingPrice:1,ingredients:[row(),{...blank,name:'Salt'}]}));assert.equal(incomplete.gp,null);assert.ok(!has(incomplete,'gp'));assert.ok(has(incomplete,'prices'));
});
test('missing/invalid portions, recipe name and target are actionable details without guessed defaults',()=>{
 for(const yieldValue of [null,'',0,-1,1.5,NaN,Infinity]){const r=run(dish({yield:yieldValue}));assert.ok(has(r,'details'));assert.equal(r.gp,null);assert.equal(r.issues.find(i=>i.field==='yield').rowIndex,null);}
 for(const targetGp of [null,'',0,-1,100,Infinity]){const r=run(dish({targetGp}));assert.ok(has(r,'details'));assert.ok(!has(r,'gp'));assert.equal(r.targetGp,null);}
 assert.ok(has(run(dish({name:''})),'details'));
});
test('empty and malformed ingredient lists and extreme values never look healthy',()=>{
 for(const ingredients of [[],null,{},[null],[row({pack:1e308,packUnit:'l'})]]){const r=run(dish({ingredients}));assert.ok(r.issues.length);assert.equal(r.gp,null);}
});
test('reports put costing problems ahead of reliable GP shortfalls, retain source line indices and do not mutate data',()=>{
 const recipes=[dish({id:'gp-small',sellingPrice:1}),dish({id:'healthy'}),dish({id:'price',ingredients:[row({price:''})]}),dish({id:'gp-large',sellingPrice:.5})],prices=[book()];
 const before=JSON.stringify({recipes,prices}),r=api.mmRecipeAttentionReport(recipes,prices);assert.deepEqual(Array.from(r,item=>item.id),['price','gp-large','gp-small']);assert.equal(r[0].issues[0].rowIndex,0);assert.equal(JSON.stringify({recipes,prices}),before);
});
test('a different account book cannot resolve the signed-in account’s pinned product ID',()=>{
 const r=run(dish({ingredients:[row({priceBookId:'account-a-item',priceLinkMode:'linked'})]}),[book({id:'account-b-item'})]);assert.ok(has(r,'prices'));assert.equal(r.gp,null);
});
