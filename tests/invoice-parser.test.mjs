import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../js/invoice.js', import.meta.url), 'utf8');
const elements = new Map();
const document = {
  baseURI: 'https://example.test/Menu-margin/',
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { addEventListener() {}, dataset: {}, style: {} });
    return elements.get(id);
  },
  querySelectorAll() { return []; },
};
const scanner = vm.runInNewContext(`${source}\n({ invoiceRowsFromTsv, invoiceMoneyOptions, invoiceSelectPrice, invoiceInferQuantity, invoiceConfirmWeighedPack, invoiceTablePassScore, invoiceTablePassesDisagree, invoiceChooseBestTablePass })`, {
  document,
  $: id => document.getElementById(id),
  window: {},
  navigator: {},
  console,
  URL,
  setTimeout,
  clearTimeout,
});

function tsvFixture(headers, rows, { rowStart = 150, rowStep = 45 } = {}) {
  const tokens = [];
  let wordNo = 0;
  const add = (word, left, top, width = Math.max(30, String(word).length * 8)) => {
    tokens.push(`5\t1\t1\t1\t${top}\t${++wordNo}\t${left}\t${top}\t${width}\t20\t96\t${word}`);
  };
  for (const [left, word] of headers) add(word, left, 100, 55);
  rows.forEach((row, index) => {
    const top = rowStart + index * rowStep;
    row.forEach(([left, word, tokenTop]) => add(word, left, tokenTop ?? top));
  });
  return `level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext\n${tokens.join('\n')}`;
}
const sameRealm = value => JSON.parse(JSON.stringify(value));

test('reconstructs multiple coded supplier rows without merging line totals into duplicate products', () => {
  const headers = [[100, 'Product'], [160, 'Code'], [260, 'Description'], [570, 'Pack'], [625, 'Size'], [700, 'Qty'], [795, 'Unit'], [840, 'Price'], [925, 'Line'], [970, 'Total']];
  const rows = [
    [[100, '70488'], [260, 'MACARONI'], [570, '1'], [625, '16 kg'], [700, '1'], [795, '£28.16'], [840, '28.16'], [925, '£28.16'], [970, '28.16']],
    [[100, '34079'], [260, 'PLAIN FLOUR'], [570, '1'], [625, '16 kg'], [700, '1'], [795, '£18.90'], [840, '18.90'], [925, '£18.90'], [970, '18.90']],
    [[100, '37898'], [260, 'MAYONNAISE'], [570, '1'], [625, '5 l'], [700, '2'], [795, '£20.91'], [840, '20.91'], [925, '£41.82'], [970, '41.82']],
  ];
  const result = sameRealm(scanner.invoiceRowsFromTsv(tsvFixture(headers, rows)).records);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(row => row.code), ['70488', '34079', '37898']);
  assert.deepEqual(result.map(row => row.description), ['MACARONI', 'PLAIN FLOUR', 'MAYONNAISE']);
  assert.deepEqual(result.map(row => row.unitPrice), [28.16, 18.9, 20.91]);
  assert.deepEqual(result.map(row => row.linePrice), [28.16, 18.9, 41.82]);
});

test('keeps a single code-free product row on the structured-table path', () => {
  const headers = [[100, 'Description'], [535, 'Pack'], [580, 'Size'], [690, 'Qty'], [780, 'Unit'], [830, 'Price'], [900, 'Line'], [950, 'Total']];
  const rows = [[[100, 'SINGLE PRODUCT'], [535, '1'], [580, '5 kg'], [690, '1'], [780, '£12.50'], [830, '12.50'], [900, '£12.50'], [950, '12.50']]];
  const result = sameRealm(scanner.invoiceRowsFromTsv(tsvFixture(headers, rows)).records);
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'SINGLE PRODUCT');
  assert.equal(result[0].pack, '1 5 kg');
  assert.equal(result[0].unitPrice, 12.5);
});

test('extracts a bracketed Bidfood code OCR attaches to the end of a wrapped description', () => {
  const headers = [[260, 'Description'], [650, 'Size/Unit'], [790, 'Qty'], [870, 'Price'], [950, 'Subtotal'], [1030, 'VAT'], [1110, 'Total']];
  const rows = [[
    [100, 'GLUTEN'], [160, 'FREE'], [220, 'CRISPY'], [280, 'FRIED'], [340, 'ONIONS'],
    [400, '(CHEEKY'], [475, 'FOOD)[36962]', 255], [520, '6962]', 255], [650, '500g/'], [700, 'CASE'], [790, '1'],
    [870, '£39.37'], [950, '£39.37'], [1030, '£0.00'], [1110, '£39.37'],
  ]];
  const parsed = scanner.invoiceRowsFromTsv(tsvFixture(headers, rows, { rowStart: 220 }));
  const result = sameRealm(parsed.records);
  assert.equal(result.length, 1);
  assert.equal(result[0].code, '36962');
  assert.match(result[0].description, /GLUTEN FREE CRISPY FRIED ONIONS/);
  assert.equal(result[0].quantity, 1);
  assert.equal(result[0].unitPrice, 39.37);
  assert.equal(result[0].linePrice, 39.37);
});

test('keeps a wrapped description and embedded code inside its own Bidfood row', () => {
  const headers = [[100, 'Description'], [650, 'Size/Unit'], [790, 'Qty'], [870, 'Price'], [950, 'Subtotal'], [1030, 'VAT'], [1110, 'Total']];
  const rows = [
    [
      [100, 'GLUTEN'], [180, 'FREE'], [250, 'CRISPY'], [320, 'FRIED'], [390, 'ONIONS'],
      [100, '(CHEEKY', 245], [205, 'FOOD)', 245], [300, '[36962]', 245], [650, '500g/'], [700, 'CASE'], [790, '1'],
      [870, '£39.37'], [950, '£39.37'], [1030, '£0.00'], [1110, '£39.37'],
    ],
    [
      [100, 'PLAIN'], [180, 'FLOUR'], [280, '[34079]'], [650, '16kg/'], [700, 'CASE'], [790, '1'],
      [870, '£20.91'], [950, '£20.91'], [1030, '£0.00'], [1110, '£20.91'],
    ],
  ];
  const parsed = scanner.invoiceRowsFromTsv(tsvFixture(headers, rows, { rowStart: 220, rowStep: 80 }));
  const result = sameRealm(parsed.records);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(row => row.code), ['36962', '34079']);
  assert.match(result[0].description, /GLUTEN FREE CRISPY FRIED ONIONS.*CHEEKY FOOD/);
  assert.doesNotMatch(result[0].description, /PLAIN FLOUR/);
  assert.equal(result[1].description, 'PLAIN FLOUR');
  assert.deepEqual(result.map(row => row.linePrice), [39.37, 20.91]);
});

test('selects case price using quantity and line total, and flags ambiguous OCR amounts', () => {
  assert.deepEqual(sameRealm(scanner.invoiceSelectPrice('20.91', '41.82', 2)), { value: 20.91, inferred: false });
  const options = scanner.invoiceMoneyOptions('6427');
  assert.equal(options[0].value, 6427);
  assert.equal(options.every(option => option.inferred), true);
  const selected = scanner.invoiceSelectPrice('6427', '6427', 1);
  assert.equal(selected.value, 6427);
  assert.equal(selected.inferred, true);
});

test('infers an omitted order quantity only when price and line total agree on one integer', () => {
  assert.equal(scanner.invoiceInferQuantity('14.06', '56.24'), 4);
  assert.equal(scanner.invoiceInferQuantity('3.00', '18.00'), 6);
  assert.equal(scanner.invoiceInferQuantity('46.99', '93.98'), 2);
  assert.equal(scanner.invoiceInferQuantity('20.91', '55.66'), null);
  assert.equal(scanner.invoiceInferQuantity('', '55.66'), null);
});

test('OCR quality scoring rejects product codes misread as order quantities', () => {
  const valid = { records: [{ description: 'Macaroni', pack: '1 x 5 kg', quantity: 2, unitPrice: 20.91, linePrice: 41.82 }] };
  const misreadCode = { records: [{ description: 'Macaroni', pack: '', quantity: 37898, unitPrice: 20.91, linePrice: 41.82 }] };
  assert.ok(scanner.invoiceTablePassScore(valid) > 56, 'a complete one-row invoice should not be marked low quality just because it is short');
  assert.ok(scanner.invoiceTablePassScore(valid) > scanner.invoiceTablePassScore(misreadCode));
});

test('marks conflicting OCR layouts for review instead of trusting a single pass', () => {
  const first = { records: [{ code: '70488', pack: '3kg CASE', measure: '', quantity: 1, unitPrice: 28.16, linePrice: 28.16 }] };
  const matching = { records: [{ code: '70488', pack: '3kg/CASE', measure: '', quantity: 1, unitPrice: 28.16, linePrice: 28.16 }] };
  const conflicting = { records: [{ code: '70488', pack: '3kg CASE', measure: '', quantity: 1, unitPrice: 14.02, linePrice: 14.02 }] };
  assert.equal(scanner.invoiceTablePassesDisagree([first, matching]), false);
  assert.equal(scanner.invoiceTablePassesDisagree([first, conflicting]), true);
});

test('does not replace a structured table with a higher-scoring text-only OCR pass', () => {
  const structured = { modeName: 'automatic', records: [{ description: 'Oats', pack: '1 x 1 kg', quantity: 1, unitPrice: 10, linePrice: 10 }] };
  const textOnly = { modeName: 'block', records: [], rows: '--- Product rows grouped by item code ---\n' + Array.from({ length: 10 }, (_, i) => `Oats ${i} 1 x 1 kg £10.00`).join('\n') };
  assert.ok(scanner.invoiceTablePassScore(textOnly) > scanner.invoiceTablePassScore(structured));
  assert.equal(scanner.invoiceChooseBestTablePass([structured, textOnly]), structured);
});

test('uses checked line arithmetic to repair BPM weighed packs and OCR decimal loss', () => {
  const samples = [
    { weight: '15.04', rate: '18.95', total: '284.91', expectedWeight: 15.04, expectedPrice: 284.91 },
    { weight: '8.14', rate: '11.12', total: '90.52', expectedWeight: 8.14, expectedPrice: 90.52 },
    { weight: '0.50', rate: '31.69', total: '15.85', expectedWeight: 0.5, expectedPrice: 15.85 },
    { weight: '0.50', rate: '2434', total: '12.17', expectedWeight: 0.5, expectedPrice: 12.17 },
    { weight: '20050', rate: '31.69', total: '15.85', expectedWeight: 0.5, expectedPrice: 15.85 },
  ];
  for (const sample of samples) {
    const result = sameRealm(scanner.invoiceConfirmWeighedPack(sample.weight, 'KG', sample.rate, sample.total));
    assert.equal(result.unit, 'kg');
    assert.equal(result.size, sample.expectedWeight);
    assert.equal(result.price, sample.expectedPrice);
  }
  assert.equal(scanner.invoiceConfirmWeighedPack('20050', 'KG', '31.69', '500.00'), null);
});
