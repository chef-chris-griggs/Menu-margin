import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPage,combinePages } from '../scanner/table.js';
let id=0;
const word=(text,x,y,width=String(text).length*9)=>({id:`w${++id}`,text,confidence:.99,poly:[[x,y],[x+width,y],[x+width,y+20],[x,y+20]]});
function fixture(){
  return [word('Description',100,100),word('Pack',430,100),word('Size',480,100),word('Qty',600,100),word('Unit',700,100),word('Price',750,100),word('Net',850,100),word('Amount',895,100),
    word('Tomatoes',100,160),word('4x250g',440,160),word('2',600,160),word('£3.00',720,160),word('£6.00',880,160),
    word('Onions',100,205),word('1x5kg',440,205),word('1',600,205),word('£8.50',720,205),word('£8.50',880,205),
    word('Subtotal',700,270),word('£14.50',880,270)];
}
test('uses positioned headers and rows, keeps unit price separate from net amount',()=>{
  const page=extractPage(fixture(),{width:1000,height:500});assert.equal(page.rows.length,2);assert.deepEqual(page.rows.map(r=>r.description),['Tomatoes','Onions']);assert.deepEqual(page.rows.map(r=>r.quantity),[2,1]);assert.deepEqual(page.rows.map(r=>r.unitPrice),[3,8.5]);assert.deepEqual(page.rows.map(r=>r.lineTotal),[6,8.5]);assert.equal(page.totals.subtotal,14.5);assert.equal(page.rows[0].pack.caseCount,4);assert.equal(page.rows[0].pack.eachSize,250);
});
test('flags missing fields and arithmetic failures without changing printed values',()=>{
  const words=fixture().filter(w=>!(w.text==='£8.50'&&w.poly[0][0]<800));const total=words.find(w=>w.text==='£6.00');total.text='£9.00';const page=extractPage(words,{width:1000,height:500});assert.equal(page.rows[0].lineTotal,9);assert.equal(page.rows[0].arithmetic.matches,false);assert.equal(page.rows[1].unitPrice,null);assert.equal(page.rows[1].needsReview,true);
});
test('compares all line totals with the printed subtotal and flags the entire invoice on mismatch',()=>{
  const page=extractPage(fixture(),{width:1000,height:500});const good=combinePages([page]);assert.equal(good.validation.matchesSubtotal,true);page.totals.subtotal=15;const bad=combinePages([page]);assert.equal(bad.validation.matchesSubtotal,false);assert.ok(bad.rows.every(r=>r.needsReview));
});
test('defers whole-document totals when a photographed invoice page is missing',()=>{
  const page=extractPage(fixture(),{width:1000,height:500});page.printedPage=3;page.pageNumber=3;const result=combinePages([page]);assert.deepEqual(result.validation.missingPages,[1,2]);assert.equal(result.validation.matchesSubtotal,null);
});
test('does not create ingredients from a totals-only OCR page',()=>{
  const result=extractPage([word('Invoice',100,100),word('Total',200,100),word('£99.00',400,100)],{width:1000,height:500});assert.equal(result.rows.length,0);assert.ok(result.warnings.length);
});
test('tilted body rows keep neighbouring products and their numeric cells separate',()=>{
  const words=fixture().filter(w=>w.poly[0][1]===100);
  const add=(value,x,y)=>words.push(word(value,x,y-.045*(x-100)));
  for(const [index,name] of ['Tomatoes','Onions','Carrots'].entries()){
    const y=230+index*42;add(name,100,y);add('1x5kg',440,y);add(String(index+1),600,y);add('£2.00',720,y);add(`£${(2*(index+1)).toFixed(2)}`,880,y);
  }
  const page=extractPage(words,{width:1000,height:500});
  assert.deepEqual(page.rows.map(r=>r.description),['Tomatoes','Onions','Carrots']);
  assert.deepEqual(page.rows.map(r=>r.quantity),[1,2,3]);assert.deepEqual(page.rows.map(r=>r.lineTotal),[2,4,6]);
});
test('a product whose numeric cells were lost is never silently appended to the previous product',()=>{
  const words=fixture().filter(w=>w.poly[0][1]!==205);words.push(word('Onions',100,190));
  const page=extractPage(words,{width:1000,height:500});
  assert.deepEqual(page.rows.map(r=>r.description),['Tomatoes','Onions']);
  assert.equal(page.rows[1].unitPrice,null);assert.equal(page.rows[1].needsReview,true);
  assert.ok(page.rows[1].reasons.some(r=>r.includes('Description-only')));
});
test('generic Item headers and explicit inc-VAT price qualifiers keep their meaning',()=>{
  const words=[word('Item',50,100),word('Qty',430,100),word('Unit',530,100),word('Price',580,100),word('inc',630,100),word('VAT',665,100),word('Amount',820,100),word('Oil',50,170),word('1',430,170),word('£1200',555,170),word('£1200',835,170)];
  const page=extractPage(words,{width:1000,height:300});assert.equal(page.rows.length,1);assert.equal(page.rows[0].description,'Oil');assert.equal(page.rows[0].unitPrice,1200);assert.equal(page.rows[0].unitPriceTaxBasis,'inc_vat');assert.equal(page.rows[0].priceBasis,'inc_vat');
});
test('zero loose units retain the case pack; simultaneous positive cases and loose units require resolution',()=>{
  const make=loose=>[word('Cases',20,100),word('UnitsWeight',130,100),word('Description',300,100),word('Pack',520,100),word('Size',565,100),word('Price',700,100),word('Goods',850,100),word('Value',900,100),word('2',30,170),word(String(loose),160,170),word('Butter',310,170),word('4x250g',525,170),word('£3.00',700,170),word('£6.00',860,170)];
  const cases=extractPage(make(0),{width:1000,height:300}).rows[0];assert.equal(cases.quantity,2);assert.equal(cases.quantityBasis,'case');assert.equal(cases.pack.caseCount,4);assert.equal(cases.pack.eachSize,250);
  const mixed=extractPage(make(1),{width:1000,height:300}).rows[0];assert.equal(mixed.quantity,null);assert.equal(mixed.pack,null);assert.equal(mixed.quantityBasis,'mixed');assert.ok(mixed.needsReview);
});
test('two captures of the same printed page and different invoice references block document review',()=>{
  const a=extractPage(fixture(),{width:1000,height:500});a.printedPage=1;a.invoiceNumber='INV1';const b=structuredClone(a);b.pageNumber=2;
  assert.ok(combinePages([a,b]).validation.blockingIssues.includes('duplicate_printed_page'));
  b.printedPage=2;b.invoiceNumber='INV2';assert.ok(combinePages([a,b]).validation.blockingIssues.includes('different_invoice_numbers'));
});
test('a valid VAT number crossing a column boundary never adds a second line price',()=>{
  const words=[word('Description',50,100),word('Qty',500,100),word('Unit',600,100),word('Price',650,100),word('Line',780,100),word('Total',825,100),word('VAT',930,100)];
  for(let row=0;row<3;row++){
    const y=170+row*50;words.push(word('Onions',50,y),word('1',500,y),word('£18.15',610,y),word('£18.15',790,y));
    const vat=word('0.00',875,y,80);vat.characters=[...vat.text].map((text,i)=>({text,score:.99,startStep:i,endStep:i+1,poly:[[875+i*20,y],[895+i*20,y],[895+i*20,y+20],[875+i*20,y+20]]}));words.push(vat);
  }
  const page=extractPage(words,{width:1000,height:400});assert.equal(page.rows.length,3);assert.deepEqual(page.rows.map(r=>r.lineTotal),[18.15,18.15,18.15]);
});
