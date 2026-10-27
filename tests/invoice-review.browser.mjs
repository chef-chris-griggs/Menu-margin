import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch (error) {
  try { playwright = require(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
  catch { throw new Error('Install the Playwright development dependency and its browsers before running the invoice review browser checks.', { cause: error }); }
}
const { chromium, webkit } = playwright;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const debugDirectory = join(root, 'scanner-debug');
await mkdir(debugDirectory, { recursive: true });
const html = (await readFile(root + '/index.html', 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const browserName = process.argv.includes('--webkit') || process.env.MENUMARGIN_UI_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await (browserName === 'webkit' ? webkit : chromium).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent(html);
  await page.addStyleTag({ path: root + '/styles.css' });
  await page.addStyleTag({ path: root + '/styles/invoice-scanner.css' });
  await page.evaluate(() => {
    // Exercise the real scroll targets without racing smooth-scroll animation
    // against the next browser action. Motion itself is not an import rule.
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) { scrollIntoView.call(this, typeof options === 'object' ? { ...options, behavior: 'instant' } : options); };
    window.$ = id => document.getElementById(id);
    window.mmUser = { id: 'ui-test' };
    window.MM_PRICEBOOK_KEY = 'prices';
    window.testBook = [
      { id: 'macaroni', name: 'Macaroni', code: '70488', supplier: 'Bidfood', price: 30, packBase: 3000, baseUnit: 'g', sourcePackSize: 3, sourceUnit: 'kg', caseCount: 1, unitPackSize: 3, unitPackUnit: 'kg', priceBasis: 'ex_vat', updatedAt: '2026-10-01T00:00:00Z' },
      { id: 'haddock', name: 'Haddock fillet MSC', code: '', supplier: 'Bidfood', price: 2, packBase: 1, baseUnit: 'each', sourcePackSize: 1, sourceUnit: 'each', caseCount: 1, unitPackSize: 1, unitPackUnit: 'each', updatedAt: '2026-10-01T00:00:00Z' }
    ];
    window.mmReadUserCache = () => structuredClone(window.testBook);
    window.mmWriteUserCache = (key, items) => { window.testBook = structuredClone(items); };
    let testId = 0;
    window.mmNewUuid = () => 'ui-test-' + (++testId);
    window.money = value => '£' + Number(value).toFixed(2);
    window.setActiveView = () => {};
    window.MenuMarginScanner = { scanFile: async () => { throw new Error('not called in UI fixture'); } };
    document.body.classList.add('mm-authenticated');
    document.body.dataset.activeView = 'invoices';
    document.querySelectorAll('.app-view').forEach(view => { view.hidden = view.id !== 'view-invoices'; });
  });
  await page.addScriptTag({ path: root + '/js/pricebook.js' });
  await page.addScriptTag({ path: root + '/js/invoice.js' });
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 900);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    window.fixturePage = { pageNumber: 1, width: 600, height: 900, original: blob, cleaned: blob, overlay: blob, words: [], columns: [] };
    window.renderFixture = (rows, extra = {}) => {
      const sum = Math.round(rows.reduce((value, row) => value + row.lineTotal, 0) * 100) / 100;
      return invoiceRenderScanResult({
      version: 1, supplier: 'Bidfood', filename: 'test.jpg', invoiceNumber: 'TEST', orderNumber: '',
      pages: [window.fixturePage], rows, totals: { subtotal: sum, vat: 0, total: sum },
      validation: { matchesSubtotal: true, sumLineTotals: sum }, warnings: [], ...extra
      });
    };
    window.fixtureRows = [
      { id: 'row-case', pageNumber: 1, productCode: '70488', description: 'Macaroni OCR typo', quantity: 1, unitPrice: 28.16, lineTotal: 28.16, quantityBasis: 'case', priceBasis: 'ex_vat', pack: { caseCount: 1, eachSize: 3, unit: 'kg' }, confidence: .99, needsReview: false, reasons: [], sourceBox: [80, 200, 450, 35] },
      { id: 'row-unit', pageNumber: 1, productCode: '41192', description: 'Marmalade', quantity: 1, unitPrice: 10.34, lineTotal: 10.34, quantityBasis: 'unit', priceBasis: 'ex_vat', pack: { caseCount: 4, eachSize: 2.72, unit: 'kg' }, confidence: .99, needsReview: false, reasons: [], sourceBox: [80, 250, 450, 35] },
      { id: 'row-weight', pageNumber: 1, productCode: '912', description: 'Sliced salami', quantity: 1, unitPrice: 31.69, lineTotal: 15.85, quantityBasis: 'weight', weight: .5, unit: 'kg', priceBasis: 'ex_vat', pack: null, confidence: .99, needsReview: false, reasons: [], sourceBox: [80, 300, 450, 35] }
    ];
    window.renderFixture(window.fixtureRows);
  });
  assert.equal(await page.locator('.invoice-import-check:checked').count(), 0);
  await page.locator('.scan-row').nth(0).locator('.invoice-import-check').check();
  await page.evaluate(() => importInvoiceReview());
  assert.equal((await page.evaluate(() => testBook))[0].price, 30, 'unchecked review acknowledgement must block writes');
  await page.locator('.scan-row').nth(0).locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  let book = await page.evaluate(() => testBook);
  assert.equal(book.length, 2, 'only selected row updated');
  assert.equal(book[0].price, 28.16);
  assert.equal(book[0].priceHistory.length, 1);
  assert.equal(book[0].priceHistory[0].price, 30);
  assert.equal(book[0].name,'Macaroni','OCR price updates preserve the existing product name');
  assert.equal(book[0].priceSource.description,'Macaroni OCR typo','the invoice description remains available as source evidence');
  assert.equal(await page.locator('.scan-row').nth(1).locator('.invoice-case-qty').inputValue(), '1');
  await page.locator('.scan-row').nth(1).locator('.invoice-import-check').check();
  await page.locator('.scan-row').nth(1).locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  book = await page.evaluate(() => testBook);
  assert.equal(book.find(item => item.code === '41192').packBase, 2720, 'loose item price must not use the full standard case weight');
  assert.equal(book.find(item => item.code === '41192').price, 10.34);
  await page.locator('.scan-row').nth(2).locator('.invoice-import-check').check();
  await page.locator('.scan-row').nth(2).locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  book = await page.evaluate(() => testBook);
  assert.equal(book.find(item => item.code === '912').packBase, 500);
  assert.equal(book.find(item => item.code === '912').price, 15.85);
  await page.evaluate(() => renderFixture([{ ...fixtureRows[0], id: 'fuzzy', productCode: '', description: 'Haddock fillets MSC', quantity: 1, unitPrice: 2.2, lineTotal: 2.2, pack: { caseCount: 1, eachSize: 1, unit: 'each' } }]));
  await page.locator('.invoice-import-check').check();
  await page.locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  assert.equal((await page.evaluate(() => testBook)).find(item => item.id === 'haddock').price, 2, 'fuzzy match must not update before a choice');
  await page.locator('.scan-match-area select').selectOption('haddock');
  await page.evaluate(() => importInvoiceReview());
  book = await page.evaluate(() => testBook);
  assert.equal(book.find(item => item.id === 'haddock').price, 2.2);
  assert.equal(book.find(item => item.id === 'haddock').priceHistory[0].price, 2);
  await page.evaluate(() => {
    document.getElementById('pbName').value = 'Macaroni';
    document.getElementById('pbSupplier').value = 'Bidfood';
    document.getElementById('pbCode').value = '70488';
    document.getElementById('pbPack').value = '3';
    document.getElementById('pbCaseQty').value = '1';
    document.getElementById('pbUnit').value = 'kg';
    document.getElementById('pbPrice').value = '29';
    savePriceEntry({ preventDefault() {} });
  });
  book = await page.evaluate(() => testBook);
  assert.deepEqual(book.find(item => item.id === 'macaroni').priceHistory.map(item => item.price), [30, 28.16], 'manual edits must preserve earlier invoice history');
  await page.evaluate(() => renderFixture([{ ...fixtureRows[0], id: 'different-code', productCode: '99999', description: 'Macaroni' }]));
  assert.equal(await page.locator('.scan-match-area select').count(), 0, 'known different product codes must not fuzzy-match');
  assert.match(await page.locator('.scan-match-area').innerText(), /new supplier item/);
  for (const [field, value, message] of [['quantity', null, 'quantity'], ['lineTotal', null, 'line total'], ['unitPrice', null, 'unit price'], ['priceBasis', 'unknown', 'VAT basis']]) {
    await page.evaluate(({ field, value }) => renderFixture([{ ...fixtureRows[0], [field]: value }]), { field, value });
    const before = await page.evaluate(() => JSON.stringify(testBook));
    await page.locator('.invoice-import-check').check(); await page.locator('.invoice-row-confirm').check();
    await page.evaluate(() => importInvoiceReview());
    assert.equal(await page.evaluate(() => JSON.stringify(testBook)), before, field + ' must remain mandatory after photo acknowledgement');
    assert.ok((await page.locator('#invoiceToast').innerText()).includes(message));
  }
  await page.evaluate(() => renderFixture([{ ...fixtureRows[0], quantity: 2 }]));
  await page.locator('.invoice-import-check').check(); await page.locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  assert.match(await page.locator('#invoiceToast').innerText(), /matching the line total/);
  await page.evaluate(() => renderFixture([{ ...fixtureRows[0], productCode: 'rounded-weight', description: 'Billed meat', quantity: null, quantityBasis: 'weight', weight: 1.23, unit: 'kg', unitPrice: 31.69, lineTotal: 39.1 }]));
  assert.equal(await page.locator('[aria-label="Billed weight / volume"]').isDisabled(), true);
  assert.equal(await page.locator('[aria-label="Billed weight / volume"]').inputValue(), '1.23');
  await page.locator('.invoice-import-check').check(); await page.locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  assert.equal((await page.evaluate(() => testBook)).find(item => item.code === 'rounded-weight').price, 39.1, 'engine rounding tolerance applies to billed weight');
  await page.locator('[aria-label="Actual weight / volume"]').fill('2');
  assert.equal(await page.locator('[aria-label="Billed weight / volume"]').inputValue(), '2');
  assert.equal(await page.locator('.invoice-row-confirm').isChecked(), false, 'a weight edit requires another photo check');
  await page.locator('[aria-label="Unit price (£)"]').fill('3'); await page.locator('[aria-label="Line total (£)"]').fill('6');
  await page.locator('.invoice-import-check').check(); await page.locator('.invoice-row-confirm').check();
  await page.locator('#invoiceTotalsConfirm').check();
  await page.evaluate(() => importInvoiceReview());
  const updatedWeight = (await page.evaluate(() => testBook)).find(item => item.code === 'rounded-weight');
  assert.equal(updatedWeight.packBase, 2000); assert.equal(updatedWeight.priceSource.quantity, 2);
  assert.equal(updatedWeight.price, 6);
  await page.evaluate(() => renderFixture([fixtureRows[0]], { validation: { matchesSubtotal: null, blockingIssues: ['duplicate_printed_page'] } }));
  await page.locator('.invoice-import-check').check(); await page.locator('.invoice-row-confirm').check();
  const beforeBlocked = await page.evaluate(() => JSON.stringify(testBook));
  await page.evaluate(() => importInvoiceReview());
  assert.equal(await page.evaluate(() => JSON.stringify(testBook)), beforeBlocked);
  assert.match(await page.locator('#invoiceToast').innerText(), /one complete invoice/);
  await page.evaluate(() => renderFixture([fixtureRows[0]], { totals: { subtotal: 29.16, total: 29.16, vat: 0 }, validation: { matchesSubtotal: false, subtotalDifference: 1, sumLineTotals: 28.16 } }));
  await page.locator('.invoice-import-check').check();
  await page.locator('.invoice-row-confirm').check();
  await page.evaluate(() => importInvoiceReview());
  assert.match(await page.locator('#invoiceToast').innerText(), /subtotal difference/);
  await page.evaluate(() => renderFixture([fixtureRows[0]], { validation: { matchesSubtotal: null, sumLineTotals: 28.16, missingPages: [2] } }));
  assert.match(await page.locator('#invoiceWarnings').innerText(), /missing: 2/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#invoiceShowPhoto').click();
  await page.locator('#invoicePhotoMode').selectOption('original');
  await page.locator('#invoiceShowRows').click();
  await page.locator('.scan-source-button').click();
  assert.equal(await page.locator('#invoicePhotoMode').inputValue(), 'cleaned', 'source coordinates must be shown on the cleaned image');
  await page.waitForSelector('#invoiceSourceHighlight', { state: 'visible' });
  assert.equal(await page.locator('#invoiceSourceHighlight').isVisible(), true);
  await page.evaluate(() => {
    const photo = invoiceScanResult.pages[0];
    window.reviewPhotoUrls = photo._reviewUrls;
    photo._reviewUrls = { original: photo._reviewUrls.original };
    invoiceShowPage();
  });
  assert.equal(await page.locator('#invoicePhotoMode').inputValue(), 'original');
  assert.equal(await page.locator('#invoiceSourceHighlight').isVisible(), false, 'cleaned coordinates must never be drawn on an original perspective photo');
  await page.evaluate(() => {
    invoiceScanResult.pages[0]._reviewUrls = window.reviewPhotoUrls;
    invoiceFocusSource(invoiceFocusedRow);
  });
  assert.equal(await page.locator('#invoicePhotoPane').isVisible(), true);
  assert.equal(await page.locator('#invoiceReviewRows').isVisible(), false);
  await page.locator('#invoiceBackToRow').click();
  assert.equal(await page.locator('#invoiceReviewRows').isVisible(), true);
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, 'mobile review must fit viewport: ' + JSON.stringify(dimensions));
  await page.screenshot({ path: join(debugDirectory, 'invoice-review-' + browserName + '.png'), fullPage: true });
  await page.locator('#invoiceShowPhoto').click();
  const [debugDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#invoiceDownloadDebug').click()
  ]);
  const debugFile = join(debugDirectory, 'invoice-review-' + browserName + '.json');
  await debugDownload.saveAs(debugFile);
  const debug = JSON.parse(await readFile(debugFile, 'utf8'));
  assert.equal(debug.version, 1);
  assert.equal(debug.pages[0].pageNumber, 1);
  assert.ok(Array.isArray(debug.pages[0].words));
  await page.evaluate(() => clearInvoiceScanner());
  assert.equal(await page.locator('#invoiceReviewArea').isVisible(), false);
  assert.equal(await page.locator('.scan-row').count(), 0);
  await page.evaluate(() => {
    window.MenuMarginScanner = {
      scanFile: (file, options) => new Promise(resolve => { window.scanCount = 1; window.finishScan = resolve; window.testSignal = options.signal; }),
      scanFiles: (files, options) => new Promise(resolve => { window.scanCount = files.length; window.finishScan = resolve; window.testSignal = options.signal; })
    };
  });
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=', 'base64');
  await page.locator('#invoiceFile').setInputFiles([{ name: 'page1.png', mimeType: 'image/png', buffer: tinyPng }, { name: 'page2.png', mimeType: 'image/png', buffer: tinyPng }]);
  await page.locator('#scanInvoice').click();
  await page.waitForFunction(() => window.scanCount === 2);
  await page.locator('#invoiceCancelScan').click();
  assert.equal(await page.evaluate(() => window.testSignal.aborted), true);
  await page.evaluate(() => window.finishScan({ version: 1, pages: [window.fixturePage], rows: window.fixtureRows, totals: {}, validation: {} }));
  await page.waitForFunction(() => document.getElementById('invoiceProgress').textContent.includes('cancelled'));
  assert.equal(await page.locator('#invoiceReviewArea').isVisible(), false, 'a cancelled result must never appear');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browserName, checks: ['unchecked import blocked', 'only selected row updated', 'case price history', 'loose unit pack', 'weighed amount', 'fuzzy confirmation', 'different-code protection', 'manual history preservation', 'mandatory quantity', 'mandatory line total', 'mandatory unit price', 'mandatory VAT basis', 'arithmetic blocks import', 'printed weight rounding', 'weight edit synchronization', 'document conflicts block import', 'subtotal acknowledgement', 'missing-page warning', 'mobile source view', 'mobile width', 'debug download', 'clear releases review', 'multi-photo API', 'cancelled result discarded'], passed: true, browserErrors: errors }));
} catch (error) {
  await page.screenshot({ path: join(debugDirectory, 'invoice-review-' + browserName + '-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
