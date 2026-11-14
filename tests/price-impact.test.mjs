import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [pricing,recipe,impact]=await Promise.all(['js/pricing.js','js/recipe.js','js/price-impact.js'].map(read));
const helpers=recipe.slice(recipe.indexOf('function mmUnitKind('),recipe.indexOf('\nfunction calculate('));
const api=vm.runInNewContext(pricing+'\n'+helpers+'\n'+impact+'\n({mmRecipePriceImpact,mmPriceImpactReport})');
const row=(extra={})=>({name:'Olive oil',qty:200,qtyUnit:'ml',pack:5000,packUnit:'ml',price:25,priceEntered:true,priceBookId:'oil-a',priceLinkMode:'linked',priceBasis:'ex_vat',...extra});
const book=(extra={})=>({id:'oil-a',name:'Olive oil',supplier:'Supplier A',packBase:5000,baseUnit:'ml',price:30,priceBasis:'ex_vat',...extra});
const dish=(extra={})=>({id:'dish',name:'Sauce',yield:2,sellingPrice:5,targetGp:70,ingredients:[row()],...extra});
const run=(recipe=dish(),prices=[book()])=>api.mmRecipePriceImpact(recipe,prices);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);

test('olive oil rise uses actual 200 ml / 5 litre packs and actual selling price',()=>{
 const r=run();assert.equal(r.status,'increase');near(r.beforeCost,1);near(r.afterCost,1.2);near(r.portionDelta,.1);near(r.beforeGp,90);near(r.afterGp,88);assert.equal(r.changes[0].priceBookId,'oil-a');
});
test('a dearer larger pack can reduce ingredient cost; equivalent unit rates cause no alert',()=>{
 const lower=run(dish(),[book({price:40,packBase:10000})]);assert.equal(lower.status,'decrease');near(lower.afterCost,.8);
 assert.equal(run(dish(),[book({price:50,packBase:10000})]).status,'unchanged');
});
test('metric mass, volume and counts use existing costing helpers including duplicate lines',()=>{
 for(const [qtyUnit,packUnit,baseUnit,qty,pack,packBase] of [['kg','kg','g',.2,1,1000],['l','l','ml',.2,1,1000],['each','each','each',2,10,10]]){
  const r=run(dish({ingredients:[row({qtyUnit,packUnit,qty,pack,price:10}),row({qtyUnit,packUnit,qty,pack,price:10})]}),[book({baseUnit,packBase,price:20})]);near(r.beforeCost,4);near(r.afterCost,8);assert.equal(r.changes.length,2);
 }
});
test('manual overrides stay manual even when an old supplier ID is present',()=>{
 assert.equal(run(dish({ingredients:[row({priceLinkMode:'manual'})]})).status,'unchanged');
});
test('an established supplier never jumps to a different same-name supplier',()=>{
 const r=run(dish(),[book({id:'oil-b',price:1}),book()]);near(r.afterCost,1.2);assert.equal(r.changes[0].supplier,'Supplier A');
 const missing=run(dish(),[book({id:'oil-b',price:1})]);assert.equal(missing.status,'review');assert.equal(missing.changes.length,0);assert.equal(missing.afterGp,null);assert.match(missing.issues.join(' '),/removed/);
});
test('legacy unique exact matches compare; ambiguous, renamed and incompatible products require review',()=>{
 const legacy=dish({ingredients:[row({priceBookId:null,priceLinkMode:'auto'})]});assert.equal(run(legacy).status,'increase');
 assert.equal(run(legacy,[book(),book({id:'other'})]).status,'review');
 for(const prices of [[book({name:'Vegetable oil'})],[book({baseUnit:'g'})],[book({price:null})]])assert.equal(run(dish(),prices).status,'review');
});
test('incomplete saved prices never create an invented baseline or profit change',()=>{
 for(const extra of [{price:''},{price:null},{price:NaN},{price:Infinity},{price:-1},{priceEntered:false},{qty:''},{qty:0},{qty:-1},{pack:0},{pack:NaN},{packUnit:'box'},{qtyUnit:'g'}]){
  const r=run(dish({ingredients:[row(extra)]}));assert.equal(r.status,'review',JSON.stringify(extra));assert.equal(r.beforeCost,null);assert.equal(r.afterGp,null);
 }
});
test('explicit free prices are valid and increases from zero have no invented relative percentage',()=>{
 const r=run(dish({ingredients:[row({price:0})]}));assert.equal(r.status,'increase');near(r.beforeCost,0);near(r.beforeGp,100);assert.equal(r.changes[0].before.price,0);
 assert.equal(run(dish(),[book({price:0})]).status,'decrease');
});
test('VAT uncertainty anywhere in an affected recipe suppresses reliable GP claims',()=>{
 for(const extra of [{priceBasis:'unknown'},{priceBasis:'inc_vat'}]){
  const r=run(dish({ingredients:[row(extra)]}));assert.equal(r.status,'review');assert.equal(r.afterGp,null);assert.match(r.issues.join(' '),/VAT/);
 }
 const sameNumbers=run(dish(),[book({price:25,priceBasis:'inc_vat'})]);assert.equal(sameNumbers.status,'review');
 const manual=row({name:'Salt',priceBookId:null,priceLinkMode:'manual',priceBasis:'unknown'});
 assert.equal(run(dish({ingredients:[row(),manual]})).status,'review');
 // Unknown VAT is not itself advertised as a new supplier price change.
 assert.equal(run(dish({ingredients:[row({priceBasis:'unknown'})]}),[book({price:25,priceBasis:'unknown'})]).status,'unchanged');
});
test('missing actual selling price keeps cost impact but never estimates GP',()=>{
 for(const sellingPrice of ['',null,0,-1,NaN,Infinity]){const r=run(dish({sellingPrice}));assert.equal(r.status,'increase');assert.equal(r.afterGp,null);}
 const r=run(dish({sellingPrice:1}));near(r.beforeGp,50);near(r.afterGp,40);
});
test('invalid portions prevent portion/GP comparisons rather than defaulting or truncating',()=>{
 for(const yieldValue of [null,'',0,-1,1.5,NaN,Infinity]){const r=run(dish({yield:yieldValue}));assert.equal(r.status,'review');assert.equal(r.portionDelta,null);assert.equal(r.beforeGp,null);}
});
test('target crossing and negative GP are calculated from actual selling price',()=>{
 const crossed=run(dish({yield:1,sellingPrice:5,ingredients:[row({qty:1000})]}),[book({price:10,packBase:1000})]);
 near(crossed.beforeGp,0);near(crossed.afterGp,-100);assert.equal(crossed.belowTarget,true);
 const r=run(dish({yield:1,sellingPrice:5,ingredients:[row()]}),[book({price:50})]);near(r.beforeGp,80);near(r.afterGp,60);assert.equal(r.crossedTarget,true);
 const noTarget=run(dish({targetGp:null}));assert.equal(noTarget.targetGp,null);assert.equal(noTarget.belowTarget,false);
});
test('incomplete unrelated ingredients block full-recipe comparisons; untouched blank rows do not',()=>{
 const blank={name:'',qty:'',pack:'',price:'',priceEntered:false};assert.equal(run(dish({ingredients:[row(),blank]})).status,'increase');
 assert.equal(run(dish({ingredients:[row(),{...blank,name:'Unpriced salt'}]})).status,'review');
});
test('large invalid conversions/overflow cannot appear as zero or reliable profit',()=>{
 const r=run(dish({ingredients:[row({pack:1e308,packUnit:'l'})]}));assert.equal(r.status,'review');assert.equal(r.afterGp,null);
});
test('offsetting ingredient changes are not counted as a net profit loss',()=>{
 const second=row({name:'Stock',priceBookId:'stock',price:25});
 const r=run(dish({ingredients:[row(),second]}),[book(),book({id:'stock',name:'Stock',price:20})]);assert.equal(r.status,'unchanged');near(r.delta,0);
});
test('reports rank real per-portion cost losses before checks and savings without mutating input',()=>{
 const recipes=[dish({id:'small'}),dish({id:'large',yield:1}),dish({id:'review',ingredients:[row({priceBookId:'foreign-account-id'})]}),dish({id:'lower',ingredients:[row({price:50})]})],prices=[book()];
 const original=JSON.stringify({recipes,prices}),r=api.mmPriceImpactReport(recipes,prices);
 assert.deepEqual(Array.from(r,item=>item.id),['large','small','review','lower']);assert.equal(JSON.stringify({recipes,prices}),original);
 assert.equal(api.mmPriceImpactReport([dish({ingredients:[row({priceLinkMode:'manual'})]})],prices).length,0);
});
