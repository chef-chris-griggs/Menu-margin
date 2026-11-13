import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestRecipePriceMatches} from '../js/recipe-price-suggestions.mjs';
const item=(name,unit='ml',extra={})=>({id:name,name,supplier:'Fresh Direct',baseUnit:unit,packBase:5000,price:27,priceBasis:'ex_vat',...extra});
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
