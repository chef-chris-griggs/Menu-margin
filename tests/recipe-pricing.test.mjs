import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/pricing.js',import.meta.url),'utf8');
const api=vm.runInNewContext(source+'\n({mmExactIngredientName,mmBuildPriceIndex,mmResolveIngredientPrice,mmResolveRecipePrices})');
const plain=x=>JSON.parse(JSON.stringify(x));
const butter=(extra={})=>({id:'butter-a',name:'Butter',supplier:'Supplier A',code:'B1',price:12,packBase:1000,baseUnit:'g',priceBasis:'ex_vat',...extra});
const row=(extra={})=>({name:'Butter',qty:250,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceEntered:true,...extra});

test('exact names ignore only capitals and whitespace, never spelling or punctuation',()=>{
 assert.equal(api.mmExactIngredientName('  BUTTER\n  '),'butter');
 for(const other of ['Butter unsalted','Butters','Buter','Butter!','Bütter'])assert.notEqual(api.mmExactIngredientName(other),'butter');
});
test('a unique exact legacy name uses the current supplier price without mutating the recipe',()=>{
 const old=row(),r=api.mmResolveIngredientPrice(old,[butter()]);
 assert.equal(r.status,'linked');assert.equal(r.ingredient.price,12);assert.equal(r.ingredient.priceBookId,'butter-a');assert.equal(old.price,10);assert.equal(old.priceBookId,undefined);
 assert.equal(r.ingredient.qty,250);assert.equal(r.ingredient.name,'Butter');
});
test('every occurrence in every recipe follows a confirmed rise or fall and pack-size change',()=>{
 const recipes=[{id:'r1',name:'Mash',yield:4,ingredients:[row(),row({qty:50})]},{id:'r2',name:'Sauce',yield:2,ingredients:[row({qty:100,name:' BUTTER '})]}];
 for(const [price,pack] of [[15,1000],[7,1000],[40,5000],[0,1000]]){
  const index=api.mmBuildPriceIndex([butter({price,packBase:pack})]);
  const updated=recipes.map(r=>api.mmResolveRecipePrices(r,index));
  assert.deepEqual(updated.flatMap(r=>r.ingredients.map(i=>i.price)),[price,price,price]);
  assert.deepEqual(updated.flatMap(r=>r.ingredients.map(i=>i.pack)),[pack,pack,pack]);
  assert.deepEqual(updated.flatMap(r=>r.ingredients.map(i=>i.qty)),[250,50,100]);
  assert.equal(updated[0].yield,4);assert.equal(updated[0].name,'Mash');
 }
 assert.equal(recipes[0].ingredients[0].price,10);
});
test('similar names and word-order changes do not follow a price',()=>{
 for(const name of ['Butters','Butter salted','Salted Butter','Butter!']){
  const r=api.mmResolveIngredientPrice(row({name}),[butter()]);assert.equal(r.status,'unlinked');assert.equal(r.ingredient.price,10);
 }
});
test('explicit supplier links do not jump to another supplier with the same name',()=>{
 const book=[butter(),butter({id:'butter-b',supplier:'Supplier B',price:99})];
 const linked=api.mmResolveIngredientPrice(row({priceBookId:'butter-a'}),book);
 assert.equal(linked.ingredient.price,12);assert.equal(linked.ingredient.priceBookId,'butter-a');
 const legacy=api.mmResolveIngredientPrice(row(),book);assert.equal(legacy.status,'ambiguous');assert.equal(legacy.ingredient.price,10);
});
test('missing or renamed supplier items retain saved prices and require review',()=>{
 const linked=row({priceBookId:'butter-a'});
 for(const book of [[],[butter({name:'Butter unsalted'})]]){
  const r=api.mmResolveIngredientPrice(linked,book);assert.equal(r.ingredient.price,10);assert.ok(r.ingredient.priceLinkIssue);
 }
});
test('manual override is explicit and survives price-book updates',()=>{
 const r=api.mmResolveIngredientPrice(row({priceLinkMode:'manual',price:8}),[butter()]);
 assert.equal(r.status,'manual');assert.equal(r.ingredient.price,8);assert.equal(r.ingredient.priceBookId,undefined);
});
test('volume, weight and count cannot be silently substituted for each other',()=>{
 for(const baseUnit of ['ml','each']){
  const r=api.mmResolveIngredientPrice(row(),[butter({baseUnit})]);assert.equal(r.status,'unit-mismatch');assert.equal(r.ingredient.price,10);
 }
});
test('invalid supplier prices never replace a valid saved price; zero is a valid explicit price',()=>{
 for(const price of [null,'',undefined,NaN,Infinity,-1])assert.equal(api.mmResolveIngredientPrice(row(),[butter({price})]).status,'invalid');
 assert.equal(api.mmResolveIngredientPrice(row(),[butter({price:0})]).ingredient.price,0);
});
test('resolving against one account cannot look up a different account supplier ID',()=>{
 const r=api.mmResolveIngredientPrice(row({priceBookId:'account-a-item'}),[butter({id:'account-b-item',price:99})]);
 assert.equal(r.status,'missing');assert.equal(r.ingredient.price,10);
});
test('price refresh is idempotent and does not append or delete ingredients',()=>{
 const recipe={id:'r1',ingredients:[row(),row({name:'Salt'})]},book=[butter()];
 const a=api.mmResolveRecipePrices(recipe,book),b=api.mmResolveRecipePrices(a,book);
 assert.deepEqual(plain(a),plain(b));assert.equal(b.ingredients.length,2);assert.equal(b.ingredients[1].price,10);
});
