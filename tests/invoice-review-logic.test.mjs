import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (await readFile(resolve(root, 'js/pricing.js'), 'utf8'))+'\n'+(await readFile(resolve(root, 'js/pricebook.js'), 'utf8')) +
  '\n' + (await readFile(resolve(root, 'js/invoice.js'), 'utf8'));

function createReviewApi() {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { value: '', dataset: {}, style: {}, addEventListener() {} });
    return elements.get(id);
  };
  $('invoiceSupplier').value = 'Bidfood';
  const api = vm.runInNewContext(source + '\n({invoicePrepareRow,invoiceFindMatches,invoiceRowIssues,invoiceValidateImport,invoiceSetWeight,importInvoiceReview,mmPriceHistoryForUpdate,invoiceCurrentValidation,seed:(result,states)=>{invoiceScanResult=result;invoiceReviewStates=states}})', {
    $, document: { getElementById: $, querySelectorAll() { return []; } }, window: {}, console, URL, Blob, setTimeout, clearTimeout
  });
  return { api, $ };
}
const sameRealm = value => JSON.parse(JSON.stringify(value));
const basic = () => ({
  productCode: '123', description: 'Haddock fillet', quantity: 1,
  unitPrice: 12, lineTotal: 12, pack: { caseCount: 1, eachSize: 1, unit: 'kg' },
  priceBasis: 'ex_vat', confidence: .99, sourceBox: [1, 2, 3, 4]
});
const existing = () => ({
  id: 'p1', name: 'Haddock fillet', code: '123', supplier: 'Bidfood', price: 12,
  packBase: 1000, baseUnit: 'g', priceHistory: [{ price: 10 }], updatedAt: '2026-10-01T00:00:00Z'
});

test('a price update preserves previous prices without mutating the saved item', () => {
  const { api } = createReviewApi();
  const old = existing(), next = { ...old, price: 13, updatedAt: '2026-10-27T00:00:00Z' };
  const history = api.mmPriceHistoryForUpdate(old, next, 'invoice');
  assert.deepEqual(sameRealm(history.map(row => row.price)), [10, 12]);
  assert.equal(history[1].changedBy, 'invoice');
  assert.equal(history[1].updatedAt, old.updatedAt);
  assert.equal(old.priceHistory.length, 1);
});

test('manual edits retain invoice history and unchanged prices do not create duplicate history', () => {
  const { api } = createReviewApi();
  const old = existing();
  const history = api.mmPriceHistoryForUpdate(old, { ...old, price: 14 }, 'manual');
  assert.deepEqual(sameRealm(history.map(row => row.price)), [10, 12]);
  assert.equal(history[1].changedBy, 'manual');
  assert.equal(api.mmPriceHistoryForUpdate(old, old, 'manual').length, 1);
});

test('exact supplier codes match while different known codes cannot fuzzy-match', () => {
  const { api } = createReviewApi();
  const state = api.invoicePrepareRow(basic(), 0), old = existing();
  assert.equal(api.invoiceFindMatches(state, [old]).exact.id, 'p1');
  assert.equal(api.invoiceFindMatches({ ...state, productCode: '999' }, [old]).close.length, 0);
  assert.equal(api.invoiceFindMatches(state, [{ ...old, supplier: 'Another supplier' }]).exact, null);
});

test('non-exact names are never update suggestions and duplicate exact names require a choice', () => {
  const { api } = createReviewApi();
  const state = api.invoicePrepareRow({ ...basic(), productCode: '', description: 'Haddock fillets' }, 0), old = existing();
  const fuzzy = api.invoiceFindMatches(state, [old]);
  assert.equal(fuzzy.exact, null);
  assert.equal(fuzzy.close.length,0);
  const duplicate = api.invoiceFindMatches({ ...state, description:old.name, productCode: '123' }, [old, { ...old, id: 'p2' }]);
  assert.equal(duplicate.exact, null);
  assert.equal(duplicate.requiresExisting, true);
  assert.equal(duplicate.close.length, 2);
});
test('a matching supplier code does not bypass exact-name matching',()=>{
 const {api}=createReviewApi(),old=existing();
 for(const description of ['Haddock fillets','Haddock fillet!','Haddock fillet smoked']){
  const match=api.invoiceFindMatches(api.invoicePrepareRow({...basic(),description},0),[old]);
  assert.equal(match.exact,null);assert.equal(match.close.length,0);assert.equal(match.blockedName,true);
 }
 assert.equal(api.invoiceFindMatches(api.invoicePrepareRow({...basic(),description:' HADDOCK   FILLET '},0),[old]).exact.id,'p1');
});

test('loose-item and weighed purchases use the amount actually priced', () => {
  const { api } = createReviewApi();
  const loose = api.invoicePrepareRow({ ...basic(), quantityBasis: 'unit', pack: { caseCount: 4, eachSize: 2.72, unit: 'kg' } }, 0);
  assert.equal(loose.caseCount, 1);
  assert.equal(loose.eachSize, 2.72);
  const weighed = api.invoicePrepareRow({ ...basic(), quantityBasis: 'weight', weight: .5, unit: 'kg', unitPrice: 31.69, lineTotal: 15.85 }, 0);
  assert.equal(weighed.caseCount, 1);
  assert.equal(weighed.eachSize, .5);
  assert.equal(weighed.packUnit, 'kg');
});

test('arithmetic checks allow penny rounding and flag mismatches and low-confidence words', () => {
  const { api } = createReviewApi();
  const weighed = api.invoicePrepareRow({ ...basic(), quantityBasis: 'weight', weight: .5, unit: 'kg', unitPrice: 31.69, lineTotal: 15.85 }, 0);
  assert.equal(api.invoiceRowIssues(weighed).some(value => value.includes('does not match')), false);
  assert.equal(api.invoiceRowIssues({ ...weighed, lineTotal: 30 }).some(value => value.includes('does not match')), true);
  assert.equal(api.invoiceRowIssues({ ...weighed, confidence: .4 }).some(value => value.includes('low confidence')), true);
});

test('an unverified or incomplete selected row cannot be imported', () => {
  const { api } = createReviewApi();
  const state = api.invoicePrepareRow(basic(), 0);
  assert.ok(api.invoiceValidateImport({ ...state, matchChoice: '__new__' }).includes('photo check'));
  assert.ok(api.invoiceValidateImport({ ...state, matchChoice: '__new__', confirmed: true, eachSize: null }).includes('pack size'));
  assert.equal(api.invoiceValidateImport({ ...state, matchChoice: '__new__', confirmed: true }).length, 0);
});

test('edited line totals are reconciled and partial invoices are not compared to a complete-document subtotal', () => {
  const { api } = createReviewApi();
  const state = api.invoicePrepareRow(basic(), 0);
  api.seed({ totals: { subtotal: 24 }, validation: { matchesSubtotal: true } }, [state, state]);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, true);
  api.seed({ totals: { subtotal: 25 }, validation: { matchesSubtotal: true } }, [state, state]);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, false);
  api.seed({ totals: { subtotal: 25 }, validation: { matchesSubtotal: null, missingPages: [2] } }, [state, state]);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, null);
});

test('photo acknowledgement never bypasses required finite quantities, prices, VAT basis or arithmetic', () => {
  const { api } = createReviewApi();
  const state = { ...api.invoicePrepareRow(basic(), 0), confirmed: true, matchChoice: '__new__' };
  for (const quantity of [null, 0, -1, Infinity, NaN]) assert.ok(api.invoiceValidateImport({ ...state, quantity }).includes('quantity'));
  for (const field of ['unitPrice', 'lineTotal']) {
    for (const value of [null, -1, Infinity, NaN]) assert.ok(api.invoiceValidateImport({ ...state, [field]: value }).length, field + ' ' + value);
  }
  assert.ok(api.invoiceValidateImport({ ...state, priceBasis: 'unknown' }).includes('VAT basis'));
  assert.ok(api.invoiceValidateImport({ ...state, unitPrice: 10, lineTotal: 8 }).some(issue => issue.includes('matching the line total')));
  assert.equal(api.invoiceValidateImport({ ...state, unitPrice: 0, lineTotal: 0 }).length, 0, 'an explicitly free valid pack is allowed');
});

test('weighed purchases use billed weight and the engine tolerance for a rounded printed weight', () => {
  const { api } = createReviewApi();
  const state = { ...api.invoicePrepareRow({ ...basic(), quantity: null, quantityBasis: 'weight', weight: 1.23, unit: 'kg', unitPrice: 31.69, lineTotal: 39.1 }, 0), confirmed: true, matchChoice: '__new__' };
  assert.equal(api.invoiceValidateImport(state).length, 0);
  assert.equal(api.invoiceRowIssues(state).some(issue => issue.includes('does not match')), false);
  assert.ok(api.invoiceValidateImport({ ...state, lineTotal: 40 }).some(issue => issue.includes('matching the line total')));
  api.invoiceSetWeight(state, 2);
  assert.equal(state.quantity, 2); assert.equal(state.eachSize, 2); assert.equal(state.weight, 2);
});

test('subtotal reconciliation sums exact pence and never expands tolerance with row count', () => {
  const { api } = createReviewApi();
  const states = Array.from({ length: 64 }, () => ({ lineTotal: 1 }));
  api.seed({ totals: { subtotal: 64.3 }, validation: { matchesSubtotal: false } }, states);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, false);
  assert.equal(api.invoiceCurrentValidation().subtotalDifference, -.3);
  api.seed({ totals: { subtotal: 64.03 }, validation: { matchesSubtotal: false } }, states);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, true);
  api.seed({ totals: { subtotal: .3 }, validation: { matchesSubtotal: true } }, [{ lineTotal: .1 }, { lineTotal: .2 }]);
  assert.equal(api.invoiceCurrentValidation().matchesSubtotal, true);
  assert.equal(api.invoiceCurrentValidation().subtotalDifference, 0);
});

test('conflicting invoice numbers and duplicate pages block import before any price-book access', () => {
  const { api, $ } = createReviewApi();
  for (const issue of ['different_invoice_numbers', 'duplicate_printed_page']) {
    api.seed({ validation: { blockingIssues: [issue] } }, []);
    assert.doesNotThrow(() => api.importInvoiceReview());
    assert.match($('invoiceToast').textContent, /Nothing was imported.*one complete invoice/);
  }
});
