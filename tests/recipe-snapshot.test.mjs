import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const [pricing,recipe]=await Promise.all(['js/pricing.js','js/recipe.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
const readers=recipe.slice(recipe.indexOf('function mmReadStoredLibrary('),recipe.indexOf('function writeLibrary('));
function setup(value,{user={id:'account-a'},error=null}={}){
 const calls=[],context={mmUser:user,mmReadUserCache:(key,id)=>{calls.push({key,id});if(error)throw error;return value;},MM_LIBRARY_KEY:'recipes',readPriceBook:()=>[{id:'butter',name:'Butter',supplier:'Test supplier',packBase:1000,baseUnit:'g',price:12,priceBasis:'ex_vat'}]};
 const api=vm.runInNewContext(pricing+'\n'+readers+'\n({mmReadStoredLibrary,readLibrary})',context);return {api,calls};
}
const saved=()=>[{id:'dish',name:'Dish',yield:4,sellingPrice:5,ingredients:[{name:'Butter',qty:100,qtyUnit:'g',pack:1000,packUnit:'g',price:10,priceBookId:'butter',priceLinkMode:'linked',priceBasis:'ex_vat'}],futureMetadata:{keep:true}}];
test('stored snapshots retain original prices and extension fields while read views use current prices',()=>{
 const raw=saved(),before=JSON.stringify(raw),{api,calls}=setup(raw);assert.equal(api.mmReadStoredLibrary()[0].ingredients[0].price,10);assert.equal(api.readLibrary()[0].ingredients[0].price,12);assert.equal(JSON.stringify(raw),before);assert.equal(api.mmReadStoredLibrary()[0].futureMetadata.keep,true);assert.ok(calls.every(c=>c.id==='account-a'));
});
test('malformed storage fails closed for writes instead of silently becoming an empty library',()=>{
 for(const value of [null,{},[null],[{}],[[]]]){const {api}=setup(value);assert.throws(()=>api.mmReadStoredLibrary(),/could not be read/);assert.equal(api.readLibrary().length,0);}
});
test('device read errors reach write callers without erasing or replacing stored data',()=>{
 const raw=saved(),before=JSON.stringify(raw),{api}=setup(raw,{error:Error('device copy unreadable')});assert.throws(()=>api.mmReadStoredLibrary(),/device copy unreadable/);assert.equal(api.readLibrary().length,0);assert.equal(JSON.stringify(raw),before);
});
test('signed-out callers cannot read another account snapshot; an authenticated empty library stays valid',()=>{
 const {api,calls}=setup(saved(),{user:null});assert.throws(()=>api.mmReadStoredLibrary(),/Sign in/);assert.equal(api.readLibrary().length,0);assert.equal(calls.length,0);const empty=setup([]);assert.equal(empty.api.mmReadStoredLibrary().length,0);
});
