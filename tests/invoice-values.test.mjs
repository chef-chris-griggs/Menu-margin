import assert from 'node:assert/strict';
import test from 'node:test';

test('a case pack whose printed unit is unreadable is not silently treated as each',()=>{
  const result=parsePackCell('8-8009');
  assert.equal(result.unit,null);
  assert.equal(result.needsReview,true);
});
import { parseGbpCell, parseNumberCell, parsePackCell, parseQuantityCell } from '../scanner/values.js';

test('unclear currency glyphs require explicit opt-in and a review warning',()=>{
  assert.equal(parseGbpCell('E13.55').value,null);
  for(const value of ['E13.55','*13.55']){const result=parseGbpCell(value,{allowOcrCurrencyGlyph:true});assert.equal(result.value,13.55);assert.equal(result.needsReview,true);}
  assert.equal(parseGbpCell('€13.55',{allowOcrCurrencyGlyph:true}).value,null);
  assert.equal(parseGbpCell('E1355',{allowOcrCurrencyGlyph:true}).value,null);
});
test('a litre unit mistaken for 1tr retains the printed token and requires review',()=>{
  assert.equal(parsePackCell('2-2.271tr').unit,null);
  const result=parsePackCell('2-2.271tr',{allowOcrUnitGlyph:true});
  assert.equal(result.caseCount,2);assert.equal(result.eachSize,2.27);assert.equal(result.unit,'l');assert.equal(result.printedText,'2-2.271tr');assert.equal(result.needsReview,true);
});
test('leading numeric-cell specks retain the visible decimal and demand review',()=>{
  const result=parseQuantityCell('.8.14');assert.equal(result.value,8.14);assert.equal(result.needsReview,true);assert.equal(result.printedText,'.8.14');
  for(const bad of ['15.C4','2 2','..50','1.2.3'])assert.equal(parseQuantityCell(bad).value,null);
  assert.equal(parseQuantityCell('0.50').needsReview,false);assert.equal(parseQuantityCell('6427').value,6427);
});

test('GBP parsing uses exact pence and standard thousands separators', () => {
  for (const [text, value, pence] of [['£1,250.00', 1250, 125000], ['£0.00', 0, 0], ['12.5', 12.5, 1250], ['.50', .5, 50], ['GBP 34.77', 34.77, 3477]]) {
    assert.deepEqual(parseGbpCell(text), { value, pence, needsReview: false, reasons: [] });
  }
  assert.equal(parseGbpCell([{ text: '£' }, { text: '1,250.00' }]).pence, 125000);
});

test('whole-pound amounts remain literal and are never divided by one hundred', () => {
  assert.equal(parseGbpCell('£1250').value, 1250);
  assert.equal(parseGbpCell('6427').value, 6427);
  assert.equal(parseGbpCell('1,250').pence, 125000);
});

test('GBP negative and credit notation is preserved', () => {
  for (const text of ['-£12.50', '£-12.50', '(£12.50)', '12.50 CR', '£12.50 CREDIT', '12.50-']) {
    assert.equal(parseGbpCell(text).pence, -1250, text);
  }
});

test('unrelated amounts and split pounds/pence are returned for review rather than guessed', () => {
  for (const cell of ['£12.50 £25.00', '12.50 25.00', '£20 91', ['£', '20', '91']]) {
    const parsed = parseGbpCell(cell);
    assert.equal(parsed.value, null);
    assert.equal(parsed.pence, null);
    assert.equal(parsed.needsReview, true);
  }
});

test('visible separated punctuation is retained with an explicit review flag', () => {
  const parsed = parseGbpCell(['£', '20', '.', '91']);
  assert.equal(parsed.pence, 2091);
  assert.equal(parsed.needsReview, true);
});

test('malformed grouping, other currencies, excessive decimals and OCR letters are rejected', () => {
  for (const text of ['£12,50', '£1,25,000', '€12.50', '$12.50', '£12.345', 'E12.50', '£1O.50', '£', '', '+(£12.50)']) {
    assert.equal(parseGbpCell(text).value, null, text);
    assert.equal(parseGbpCell(text).needsReview, true, text);
  }
});

test('quantity parsing stays within its own cell and does not repair garbled digits', () => {
  for (const [cell, quantity] of [['3', 3], ['15.04 KG', 15.04], ['-2', -2], ['1,250', 1250], [[{ text: '4' }], 4]]) assert.equal(parseNumberCell(cell), quantity);
  for (const cell of ['2 3', '2x3', '1O', '3.0.0', '£3', '3 product', '1,50']) assert.equal(parseNumberCell(cell), null);
});

test('common catering pack formats retain explicit case count, item size and unit', () => {
  const cases = [
    ['40x250g', 40, 250, 'g'], ['4-2.72kg', 4, 2.72, 'kg'], ['1x100gm', 1, 100, 'g'],
    ['6-1ltr', 6, 1, 'l'], ['1x1EA', 1, 1, 'each'], ['1x14', 1, 14, 'each'],
    ['1x15dzn', 1, 180, 'each'], ['500g/ CASE', 1, 500, 'g'], ['2.72kg EACH', 1, 2.72, 'kg'],
    ['2 x 6 x 250 g', 12, 250, 'g'], ['10-220ml/CASE', 10, 220, 'ml'], ['5X1.5KG', 5, 1.5, 'kg']
  ];
  for (const [text, count, size, unit] of cases) {
    const result = parsePackCell(text);
    assert.equal(result.caseCount, count, text);
    assert.equal(result.eachSize, size, text);
    assert.equal(result.unit, unit, text);
    assert.equal(result.needsReview, false, text);
  }
});

test('portion packs retain the count but require costing confirmation', () => {
  const result = parsePackCell('1-14ptn/ CASE');
  assert.equal(result.caseCount, 1);
  assert.equal(result.eachSize, 14);
  assert.equal(result.unit, 'each');
  assert.equal(result.needsReview, true);
  assert.match(result.reasons.join(' '), /portions/);
});

test('unknown, split or garbled pack values are not silently repaired', () => {
  for (const text of ['', 'CASE', '12', '40 250g', '1-101tr', '1x1Okg', '6-1ltr CASE 2', '1/2kg']) {
    const result = parsePackCell(text);
    assert.equal(result.needsReview, true, text);
  }
  assert.equal(parsePackCell('1-101tr').unit, null);
  assert.equal(parsePackCell('1x1Okg').eachSize, null);
  assert.equal(parsePackCell('40250g').eachSize, 40250, 'literal digits are preserved instead of inserting an x');
});

test('invalid case counts and zero sizes remain visible and require review', () => {
  assert.equal(parsePackCell('1.5x100g').needsReview, true);
  assert.equal(parsePackCell('1x0g').needsReview, true);
  assert.equal(parsePackCell('0x100g').needsReview, true);
});
