// Positioned PaddleOCR results are reviewed as data. OCR text is never reparsed here.
let invoiceScanController = null;
let invoiceScanSequence = 0;
let invoiceScanResult = null;
let invoiceReviewStates = [];
let invoicePhotoUrls = [];
let invoiceFocusedRow = null;
let invoiceCurrentPage = 1;
let invoiceMobileView = 'rows';
let invoiceDisplayedPhotoMode = null;

function invoiceStatus(message) { $('invoiceProgress').textContent = message; }
function invoiceToast(message) { $('invoiceToast').textContent = message; }
function invoiceMoney(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value)) : '—';
}
function invoiceNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function invoiceNewElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function invoiceReleasePhotos() {
  invoicePhotoUrls.forEach(url => URL.revokeObjectURL(url));
  invoicePhotoUrls = [];
  invoiceDisplayedPhotoMode = null;
  const image = $('invoiceSourceImage');
  if (image) image.removeAttribute('src');
  if ($('invoiceSourceHighlight')) $('invoiceSourceHighlight').hidden = true;
}
function clearInvoiceScanner() {
  invoiceScanSequence += 1;
  invoiceScanController?.abort();
  invoiceScanController = null;
  invoiceScanResult = null;
  invoiceReviewStates = [];
  invoiceFocusedRow = null;
  invoiceReleasePhotos();
  $('invoiceFile').value = '';
  $('invoiceFileName').textContent = 'No invoice selected';
  $('invoiceFileName').title = '';
  $('invoiceText').value = '';
  $('invoiceNumber').value = '';
  $('invoiceOrderNumber').value = '';
  $('invoiceNumber').dataset.autoValue = '';
  $('invoiceOrderNumber').dataset.autoValue = '';
  const supplier = $('invoiceSupplier');
  if (supplier.value.trim() === (supplier.dataset.autoValue || '')) supplier.value = '';
  supplier.dataset.autoValue = '';
  $('invoiceReviewRows').replaceChildren();
  $('invoiceReviewArea').hidden = true;
  $('invoiceWarnings').replaceChildren();
  $('invoiceTotals').replaceChildren();
  $('invoiceCancelScan').hidden = true;
  $('scanInvoice').disabled = false;
  $('invoiceTotalsConfirm').checked = false;
  invoiceStatus('Choose an invoice to read its products and prices.');
  invoiceToast('');
}
async function scanInvoiceFile() {
  const files = Array.from($('invoiceFile').files || []);
  const file = files[0];
  if (!file) { invoiceToast('Choose an invoice PDF or its photos first.'); return; }
  if (!window.MenuMarginScanner?.scanFile) {
    invoiceToast('The local scanner files could not load. Reload MenuMargin and try again.');
    return;
  }
  if (files.some(item => item.size > 30 * 1024 * 1024)) { invoiceToast('Each invoice file must be smaller than 30 MB.'); return; }
  invoiceScanController?.abort();
  const sequence = ++invoiceScanSequence;
  const controller = new AbortController();
  invoiceScanController = controller;
  invoiceScanResult = null;
  invoiceReviewStates = [];
  invoiceReleasePhotos();
  $('invoiceReviewRows').replaceChildren();
  $('invoiceReviewArea').hidden = true;
  $('scanInvoice').disabled = true;
  $('invoiceCancelScan').hidden = false;
  invoiceToast('');
  invoiceStatus('Preparing the local document reader…');
  try {
    const scan = files.length > 1 && window.MenuMarginScanner.scanFiles
      ? options => window.MenuMarginScanner.scanFiles(files, options)
      : options => window.MenuMarginScanner.scanFile(file, options);
    if (files.length > 1 && !window.MenuMarginScanner.scanFiles) throw new Error('This scanner build cannot combine invoice photos. Reload the app to load the current scanner.');
    const result = await scan({
      signal: controller.signal,
      onProgress: message => {
        if (sequence === invoiceScanSequence && !controller.signal.aborted) invoiceStatus(String(message));
      }
    });
    if (sequence !== invoiceScanSequence) return;
    if (controller.signal.aborted) { invoiceStatus('Scan cancelled. Your price book has not changed.'); return; }
    invoiceRenderScanResult(result);
    invoiceStatus('Scan finished. Compare the editable rows with the photo before selecting prices to import.');
  } catch (error) {
    if (sequence !== invoiceScanSequence) return;
    const cancelled = controller.signal.aborted || error?.name === 'AbortError';
    invoiceStatus(cancelled ? 'Scan cancelled. Your price book has not changed.' : 'This invoice could not be read.');
    if (!cancelled) invoiceToast(error?.message || 'Try a sharper, straight photo or the original PDF.');
  } finally {
    if (sequence === invoiceScanSequence) {
      $('scanInvoice').disabled = false;
      $('invoiceCancelScan').hidden = true;
      invoiceScanController = null;
    }
  }
}
function invoiceSetAutoField(id, value) {
  const field = $(id);
  const previous = field.dataset.autoValue || '';
  if (!field.value.trim() || field.value.trim() === previous) field.value = value || '';
  field.dataset.autoValue = value || '';
}
function invoicePrepareRow(row, index) {
  const basis = ['case', 'unit', 'weight'].includes(row.quantityBasis) ? row.quantityBasis : 'case';
  const pack = row.pack || {};
  const weight = invoiceNumberOrNull(row.weight);
  return {
    source: row,
    id: String(row.id || 'invoice-row-' + index),
    pageNumber: Number(row.pageNumber) || 1,
    productCode: String(row.productCode || ''),
    description: String(row.description || ''),
    quantity: basis === 'weight' ? weight : invoiceNumberOrNull(row.quantity),
    unitPrice: invoiceNumberOrNull(row.unitPrice),
    lineTotal: invoiceNumberOrNull(row.lineTotal),
    quantityBasis: basis,
    priceBasis: ['ex_vat', 'inc_vat'].includes(row.priceBasis) ? row.priceBasis : 'unknown',
    weight,
    weightUnit: row.unit || pack.unit || 'kg',
    caseCount: basis === 'unit' || basis === 'weight' ? 1 : invoiceNumberOrNull(pack.caseCount),
    eachSize: basis === 'weight' ? weight : invoiceNumberOrNull(pack.eachSize),
    packUnit: basis === 'weight' ? (row.unit || pack.unit || 'kg') : (pack.unit || 'each'),
    originalReasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    confirmed: false,
    selected: false,
    matchChoice: '',
    matchExplicit: false,
    elements: {},
    originalNeedsReview: Boolean(row.needsReview),
    confidence: invoiceNumberOrNull(row.confidence)
  };
}
function invoiceRenderScanResult(result) {
  invoiceScanResult = result;
  invoiceReviewStates = (Array.isArray(result.rows) ? result.rows : []).map(invoicePrepareRow);
  invoiceSetAutoField('invoiceSupplier', result.supplier);
  invoiceSetAutoField('invoiceNumber', result.invoiceNumber);
  invoiceSetAutoField('invoiceOrderNumber', result.orderNumber);
  $('invoiceText').value = ''; // Compatibility with account cleanup only; never an OCR input.
  $('invoiceTotalsConfirm').checked = false;
  invoiceReleasePhotos();
  for (const page of result.pages || []) {
    page._reviewUrls = {};
    for (const mode of ['original', 'cleaned', 'overlay']) {
      if (page[mode] instanceof Blob) {
        const url = URL.createObjectURL(page[mode]);
        page._reviewUrls[mode] = url;
        invoicePhotoUrls.push(url);
      }
    }
  }
  const pageSelect = $('invoicePageSelect');
  pageSelect.replaceChildren();
  (result.pages || []).forEach(page => {
    const option = document.createElement('option');
    option.value = page.pageNumber;
    option.textContent = 'Page ' + page.pageNumber;
    pageSelect.appendChild(option);
  });
  invoiceCurrentPage = Number(result.pages?.[0]?.pageNumber) || 1;
  pageSelect.value = String(invoiceCurrentPage);
  pageSelect.disabled = (result.pages || []).length < 2;
  $('invoicePhotoMode').value = 'cleaned';
  invoiceRenderTotals();
  const rows = $('invoiceReviewRows');
  rows.replaceChildren();
  invoiceReviewStates.forEach((state, index) => rows.appendChild(invoiceCreateRowCard(state, index)));
  $('invoiceReviewArea').hidden = false;
  invoiceSetMobileView('rows');
  invoiceShowPage();
  invoiceUpdateSelectionSummary();
  if (!invoiceReviewStates.length) invoiceToast('No product rows were found. Check the cleaned photo and download the debug files to inspect what the reader saw.');
}
function invoiceRenderTotals() {
  const result = invoiceScanResult || {};
  const totals = result.totals || {};
  const validation = invoiceCurrentValidation();
  const box = $('invoiceTotals');
  box.replaceChildren();
  const values = [
    ['Detected line totals', validation.sumLineTotals],
    ['Printed subtotal', totals.subtotal],
    ['VAT', totals.vat],
    ['Invoice total', totals.total]
  ];
  values.forEach(([label, value]) => {
    const item = invoiceNewElement('div', 'scan-total');
    item.append(invoiceNewElement('span', '', label), invoiceNewElement('strong', '', value === null || value === undefined ? 'Not found' : invoiceMoney(value)));
    box.appendChild(item);
  });
  const warnings = $('invoiceWarnings');
  warnings.replaceChildren();
  const messages = [];
  if (validation.matchesSubtotal === false) {
    messages.push('The detected line totals do not match the printed subtotal' +
      (Number.isFinite(Number(validation.subtotalDifference)) ? ' (difference ' + invoiceMoney(Math.abs(Number(validation.subtotalDifference))) + ').' : '.'));
  } else if (validation.matchesSubtotal === true) {
    const ok = invoiceNewElement('p', 'scan-reconciliation-ok', 'Detected line totals match the printed subtotal.');
    warnings.appendChild(ok);
  } else {
    messages.push('A printed subtotal was not available to check the complete invoice. Review the page count and each selected row.');
  }
  if (Array.isArray(validation.missingPages) && validation.missingPages.length) {
    messages.push('Invoice page(s) missing: ' + validation.missingPages.join(', ') + '. Select all photos for this invoice and scan them together.');
  }
  for (const warning of result.warnings || []) {
    const message = typeof warning === 'string' ? warning : warning?.message || warning?.code || '';
    if (message && !messages.includes(message)) messages.push(message);
  }
  if (messages.length) {
    const list = invoiceNewElement('ul', 'scan-document-warnings');
    messages.forEach(message => list.appendChild(invoiceNewElement('li', '', message)));
    warnings.appendChild(list);
  }
  $('invoiceTotalsVerification').hidden = validation.matchesSubtotal !== false;
}
function invoiceCurrentValidation() {
  const original = invoiceScanResult?.validation || {};
  const values = invoiceReviewStates.map(state => state.lineTotal);
  const pence = values.map(value => Number.isFinite(value) ? Math.round(value * 100) : null);
  const sumPence = pence.reduce((total, value) => total + (value ?? 0), 0);
  const sum = sumPence / 100;
  const subtotal = invoiceNumberOrNull(invoiceScanResult?.totals?.subtotal);
  const subtotalPence = subtotal === null ? null : Math.round(subtotal * 100);
  const complete = pence.every(value => value !== null && Number.isSafeInteger(value)) && Number.isSafeInteger(sumPence);
  const canReconcile = original.matchesSubtotal !== null && original.matchesSubtotal !== undefined && subtotal !== null && complete && !(original.missingPages?.length);
  const differencePence = canReconcile ? sumPence - subtotalPence : null;
  return {
    ...original, sumLineTotals: sum,
    matchesSubtotal: canReconcile ? Math.abs(differencePence) <= 3 : null,
    subtotalDifference: canReconcile ? differencePence / 100 : null
  };
}
function invoiceCreateField(labelText, type, value, onInput, options) {
  const label = invoiceNewElement('label', 'scan-field');
  label.appendChild(invoiceNewElement('span', 'scan-field-label', labelText));
  let input;
  if (type === 'select') {
    input = document.createElement('select');
    for (const [key, text] of options) {
      const option = document.createElement('option');
      option.value = key; option.textContent = text; input.appendChild(option);
    }
  } else if (type === 'textarea') {
    input = document.createElement('textarea'); input.rows = 2;
  } else {
    input = document.createElement('input');
    input.type = type;
    if (type === 'number') { input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; }
  }
  input.value = value === null || value === undefined ? '' : String(value);
  input.setAttribute('aria-label', labelText);
  input.addEventListener(type === 'select' ? 'change' : 'input', () => onInput(input.value));
  label.appendChild(input);
  return { label, input };
}
function invoiceCreateRowCard(state, index) {
  const card = invoiceNewElement('article', 'scan-row');
  card.dataset.rowId = state.id;
  card.id = 'invoice-review-row-' + index;
  state.card = card;
  const heading = invoiceNewElement('div', 'scan-row-heading');
  const selectLabel = invoiceNewElement('label', 'scan-select-row');
  const check = document.createElement('input');
  check.type = 'checkbox'; check.className = 'invoice-import-check'; check.checked = false;
  check.setAttribute('aria-label', 'Import product ' + (index + 1));
  check.addEventListener('change', () => { state.selected = check.checked; invoiceUpdateSelectionSummary(); });
  selectLabel.append(check, invoiceNewElement('span', '', 'Product ' + (index + 1)));
  const badge = invoiceNewElement('span', 'scan-row-badge');
  const sourceButton = invoiceNewElement('button', 'secondary scan-source-button', 'View source');
  sourceButton.type = 'button';
  sourceButton.addEventListener('click', () => invoiceFocusSource(state));
  heading.append(selectLabel, badge, sourceButton);
  card.appendChild(heading);
  state.elements.selected = check; state.elements.badge = badge;
  const product = invoiceNewElement('div', 'scan-product-fields');
  const description = invoiceCreateField('Product name', 'textarea', state.description, value => invoiceEditState(state, 'description', value));
  description.input.className = 'invoice-item-name';
  const code = invoiceCreateField('Supplier product code', 'text', state.productCode, value => invoiceEditState(state, 'productCode', value));
  code.input.className = 'invoice-product-code';
  product.append(description.label, code.label);
  card.appendChild(product);
  const amounts = invoiceNewElement('div', 'scan-numeric-fields');
  const fields = [
    ['Quantity ordered', 'quantity', state.quantity],
    ['Unit price (£)', 'unitPrice', state.unitPrice],
    ['Line total (£)', 'lineTotal', state.lineTotal]
  ];
  fields.forEach(([label, key, value]) => {
    const field = invoiceCreateField(label, 'number', value, input => invoiceEditState(state, key, invoiceNumberOrNull(input)));
    state.elements[key] = field.input; amounts.appendChild(field.label);
    if (key === 'quantity') state.elements.quantityLabel = field.label.querySelector('.scan-field-label');
  });
  const basis = invoiceCreateField('Price applies to', 'select', state.quantityBasis, value => invoiceEditBasis(state, value), [
    ['case', 'One case / pack'], ['unit', 'One loose item'], ['weight', 'One kg / weight unit']
  ]);
  state.elements.quantityBasis = basis.input;
  const tax = invoiceCreateField('VAT basis', 'select', state.priceBasis, value => invoiceEditState(state, 'priceBasis', value), [
    ['unknown', 'Needs checking'], ['ex_vat', 'Excluding VAT'], ['inc_vat', 'Including VAT']
  ]);
  state.elements.priceBasis = tax.input;
  amounts.append(basis.label, tax.label);
  card.appendChild(amounts);
  const weighed = invoiceNewElement('div', 'scan-weight-fields');
  const weight = invoiceCreateField('Actual weight / volume', 'number', state.weight, value => {
    invoiceSetWeight(state, invoiceNumberOrNull(value));
    invoiceRowChanged(state);
  });
  const weightUnit = invoiceCreateField('Weight / volume unit', 'select', state.weightUnit, value => {
    state.weightUnit = value;
    if (state.quantityBasis === 'weight') { state.packUnit = value; state.elements.packUnit.value = value; }
    invoiceRowChanged(state);
  }, [['kg', 'kg'], ['g', 'g'], ['l', 'litres'], ['ml', 'ml']]);
  state.elements.weight = weight.input;
  state.elements.weightUnit = weightUnit.input;
  weighed.append(weight.label, weightUnit.label);
  card.appendChild(weighed);
  state.elements.weightFields = weighed;
  const packGroup = invoiceNewElement('fieldset', 'scan-pack-fields');
  packGroup.appendChild(invoiceNewElement('legend', '', 'Pack to save in your price book'));
  const caseCount = invoiceCreateField('Items in priced pack', 'number', state.caseCount, value => invoiceEditState(state, 'caseCount', invoiceNumberOrNull(value)));
  caseCount.input.min = '1'; caseCount.input.step = '1'; caseCount.input.className = 'invoice-case-qty';
  const eachSize = invoiceCreateField('Size per item', 'number', state.eachSize, value => invoiceEditState(state, 'eachSize', invoiceNumberOrNull(value)));
  eachSize.input.className = 'invoice-item-size';
  const unit = invoiceCreateField('Item unit', 'select', state.packUnit, value => invoiceEditState(state, 'packUnit', value), [
    ['each', 'each'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litres']
  ]);
  const savedPrice = invoiceNewElement('output', 'scan-import-price');
  savedPrice.setAttribute('aria-label', 'Price for this complete pack');
  packGroup.append(caseCount.label, eachSize.label, unit.label, savedPrice);
  state.elements.caseCount = caseCount.input; state.elements.eachSize = eachSize.input;
  state.elements.packUnit = unit.input; state.elements.savedPrice = savedPrice;
  card.appendChild(packGroup);
  const issues = invoiceNewElement('ul', 'scan-row-issues');
  state.elements.issues = issues;
  card.appendChild(issues);
  const match = invoiceNewElement('div', 'scan-match-area');
  state.elements.match = match;
  card.appendChild(match);
  const verified = invoiceNewElement('label', 'scan-row-verified');
  const confirm = document.createElement('input');
  confirm.type = 'checkbox'; confirm.className = 'invoice-row-confirm';
  confirm.addEventListener('change', () => { state.confirmed = confirm.checked; invoiceUpdateRow(state); });
  verified.append(confirm, document.createTextNode('I checked this row against the invoice photo'));
  state.elements.confirmed = confirm;
  card.appendChild(verified);
  card.addEventListener('focusin', () => { invoiceFocusedRow = state; invoiceShowHighlight(); });
  invoiceUpdateRow(state);
  invoiceRenderMatch(state);
  return card;
}
function invoiceEditState(state, key, value) {
  state[key] = value;
  invoiceRowChanged(state);
  if (key === 'description' || key === 'productCode') invoiceRenderMatch(state);
}
function invoiceEditBasis(state, value) {
  state.quantityBasis = value;
  if (value === 'unit') { state.caseCount = 1; state.elements.caseCount.value = '1'; }
  if (value === 'weight') {
    state.caseCount = 1; state.eachSize = state.weight; state.packUnit = state.weightUnit;
    state.elements.caseCount.value = '1'; state.elements.eachSize.value = state.weight ?? ''; state.elements.packUnit.value = state.weightUnit;
    invoiceSetWeight(state, state.weight);
  }
  invoiceRowChanged(state);
}
function invoiceSetWeight(state, value) {
  state.weight = value;
  if (state.quantityBasis === 'weight') {
    state.quantity = value; state.eachSize = value;
    if (state.elements.quantity) state.elements.quantity.value = value ?? '';
    if (state.elements.eachSize) state.elements.eachSize.value = value ?? '';
  }
}
function invoiceRowChanged(state) {
  state.confirmed = false;
  state.elements.confirmed.checked = false;
  invoiceUpdateRow(state);
  invoiceUpdateSelectionSummary();
  $('invoiceTotalsConfirm').checked = false;
  invoiceRenderTotals();
}
function invoiceRowPrice(state) { return state.quantityBasis === 'weight' ? state.lineTotal : state.unitPrice; }
function invoiceBilledQuantity(state) { return state.quantityBasis === 'weight' ? state.weight : state.quantity; }
function invoiceRowArithmetic(state) {
  const multiplier = invoiceBilledQuantity(state);
  if (!Number.isFinite(multiplier) || !(multiplier > 0) || !Number.isFinite(state.unitPrice) || !Number.isFinite(state.lineTotal)) return null;
  const expected = multiplier * state.unitPrice;
  const tolerance = state.quantityBasis === 'weight' ? Math.max(.02, Math.abs(state.unitPrice) * .005 + .015) : .02;
  const difference = Math.abs(expected - state.lineTotal);
  return { expected, tolerance, difference, matches: Number.isFinite(expected) && difference <= tolerance + 1e-8 };
}
function invoiceRowIssues(state) {
  const issues = [];
  if (!state.description.trim()) issues.push('Enter the product name.');
  if (!Number.isFinite(invoiceBilledQuantity(state)) || !(invoiceBilledQuantity(state) > 0)) issues.push(state.quantityBasis === 'weight' ? 'Enter the billed weight or volume.' : 'Check the ordered quantity; it was not read.');
  if (!Number.isFinite(state.unitPrice) || !(state.unitPrice >= 0)) issues.push('Enter the unit price.');
  if (!Number.isFinite(state.lineTotal) || !(state.lineTotal >= 0)) issues.push('Enter the line total.');
  if (!Number.isInteger(state.caseCount) || !(state.caseCount >= 1) || !(state.eachSize > 0)) issues.push('Complete the priced pack size.');
  if (!['kg', 'g', 'l', 'ml', 'each'].includes(state.packUnit)) issues.push('Choose the pack unit.');
  if (state.quantityBasis === 'unit' && state.caseCount !== 1) issues.push('A loose-item price must be saved against one item.');
  if (state.quantityBasis === 'weight' && (!(state.weight > 0) || !['kg', 'g', 'l', 'ml'].includes(state.weightUnit))) issues.push('Enter the actual weighed amount and its unit.');
  if (!['ex_vat', 'inc_vat'].includes(state.priceBasis)) issues.push('Confirm whether the printed price includes VAT.');
  const arithmetic = invoiceRowArithmetic(state);
  if (arithmetic && !arithmetic.matches) issues.push('Quantity × unit price (' + invoiceMoney(arithmetic.expected) + ') does not match the line total (' + invoiceMoney(state.lineTotal) + ').');
  if (state.confidence !== null && state.confidence < .85) issues.push('Some OCR words have low confidence.');
  if (state.originalNeedsReview) issues.push('The scanner marked this row for review.');
  const reasonLabels = {
    missing_description: 'The product name was not read.',
    missing_quantity: 'The ordered quantity was not read.',
    missing_unit_price: 'The unit price was not read.',
    missing_line_total: 'The line total was not read.',
    missing_pack: 'The printed pack size was not read.',
    low_confidence: 'Some OCR words have low confidence.',
    arithmetic_mismatch: 'The quantity, price and line total need checking.',
    subtotal_mismatch: 'The invoice subtotal does not reconcile.',
    unknown_price_basis: 'Check whether this price includes VAT.'
  };
  for (const reason of state.originalReasons) {
    const label = reasonLabels[reason] || reason.replace(/[_-]+/g, ' ');
    if (label && !issues.includes(label)) issues.push(label);
  }
  return issues;
}
function invoiceUpdateRow(state) {
  const issues = invoiceRowIssues(state);
  state.elements.badge.textContent = issues.length ? (state.confirmed ? 'Checked' : 'Needs review') : 'Ready to check';
  state.elements.badge.dataset.state = issues.length && !state.confirmed ? 'warning' : 'ready';
  state.card.dataset.needsReview = issues.length && !state.confirmed ? 'true' : 'false';
  state.elements.issues.replaceChildren();
  issues.forEach(issue => state.elements.issues.appendChild(invoiceNewElement('li', '', issue)));
  state.elements.issues.hidden = !issues.length;
  state.elements.weightFields.hidden = state.quantityBasis !== 'weight';
  state.elements.quantity.disabled = state.quantityBasis === 'weight';
  state.elements.quantityLabel.textContent = state.quantityBasis === 'weight' ? 'Billed weight / volume' : 'Quantity ordered';
  state.elements.quantity.setAttribute('aria-label', state.elements.quantityLabel.textContent);
  if (state.quantityBasis === 'weight') state.elements.quantity.value = state.weight ?? '';
  state.elements.caseCount.disabled = state.quantityBasis === 'weight';
  state.elements.eachSize.disabled = state.quantityBasis === 'weight';
  state.elements.packUnit.disabled = state.quantityBasis === 'weight';
  const totalSize = state.caseCount > 0 && state.eachSize > 0 ? Number((state.caseCount * state.eachSize).toFixed(6)) + ' ' + state.packUnit : 'Enter size';
  const price = invoiceRowPrice(state);
  state.elements.savedPrice.textContent = 'Save ' + (price === null ? '—' : invoiceMoney(price)) + ' for ' + totalSize;
}
function invoiceNormaliseName(value) {
  return mmExactIngredientName(value);
}
function invoiceFindMatches(state, items) {
  const supplier = mmNormalizeProductKey($('invoiceSupplier').value);
  const code = mmNormalizeProductKey(state.productCode);
  const name = invoiceNormaliseName(state.description);
  const supplierItems = items.filter(item => mmNormalizeProductKey(item.supplier) === supplier);
  const exactCode = code ? supplierItems.filter(item => mmNormalizeProductKey(item.code) === code) : [];
  const compatible = supplierItems.filter(item => !(code && item.code && mmNormalizeProductKey(item.code) !== code));
  const exactName = compatible.filter(item => invoiceNormaliseName(item.name) === name && name);
  if (exactName.length === 1) return { exact: exactName[0], close: [], requiresExisting: false };
  if(exactName.length>1)return {exact:null,close:exactName,requiresExisting:true};
  return { exact: null, close: [], requiresExisting: false, blockedName:exactCode.length>0, conflictingNames:exactCode.map(item=>item.name) };
}
function invoiceRenderMatch(state) {
  const matches = invoiceFindMatches(state, readPriceBook());
  state.matches = matches;
  const box = state.elements.match;
  box.replaceChildren();
  if(matches.blockedName){
    state.matchChoice='';state.matchExplicit=false;
    box.appendChild(invoiceNewElement('p','scan-match-note','This supplier code already exists as “'+matches.conflictingNames.join('” / “')+'”. Correct the scanned name to match exactly before updating it.'));
  } else if (matches.exact) {
    state.matchChoice = matches.exact.id;
    state.matchExplicit = false;
    box.appendChild(invoiceNewElement('p', 'scan-match-note', 'Existing supplier item: ' + matches.exact.name + ' · current price ' + invoiceMoney(matches.exact.price) + '. Import will update it and keep its old price in history.'));
  } else if (matches.close.length) {
    const validChoice = state.matchExplicit && ((!matches.requiresExisting && state.matchChoice === '__new__') || matches.close.some(item => item.id === state.matchChoice));
    if (!validChoice) { state.matchChoice = ''; state.matchExplicit = false; }
    const select = invoiceCreateField('Exact name matches — choose the supplier item', 'select', state.matchChoice, value => {
      state.matchChoice = value; state.matchExplicit = Boolean(value); invoiceUpdateSelectionSummary();
    }, [['', 'Choose before importing'], ...(!matches.requiresExisting ? [['__new__', 'Add as a new product']] : []), ...matches.close.map(item => [item.id, 'Update ' + item.name + ' · ' + invoiceMoney(item.price)])]);
    box.appendChild(select.label);
    box.appendChild(invoiceNewElement('p', 'scan-match-note', 'More than one saved item has this exact name. Choose the existing entry to update.'));
  } else {
    state.matchChoice = '__new__';
    state.matchExplicit = false;
    box.appendChild(invoiceNewElement('p', 'scan-match-note', 'This will be added as a new supplier item.'));
  }
}
function invoiceUpdateSelectionSummary() {
  const count = invoiceReviewStates.filter(state => state.selected).length;
  $('invoiceSelectionSummary').textContent = count + ' of ' + invoiceReviewStates.length + ' products selected. Only selected, checked rows will be imported.';
  $('importInvoiceRows').disabled = count === 0;
}
function invoiceSetMobileView(view) {
  invoiceMobileView = view;
  $('invoiceReviewLayout').dataset.mobileView = view;
  $('invoiceShowRows').setAttribute('aria-pressed', String(view === 'rows'));
  $('invoiceShowPhoto').setAttribute('aria-pressed', String(view === 'photo'));
}
function invoiceShowPage() {
  const page = invoiceScanResult?.pages?.find(item => Number(item.pageNumber) === invoiceCurrentPage);
  if (!page) return;
  const requested = $('invoicePhotoMode').value;
  const mode = [requested, 'cleaned', 'original', 'overlay'].find(value => page._reviewUrls?.[value]) || null;
  const url = mode ? page._reviewUrls[mode] : null;
  invoiceDisplayedPhotoMode = mode;
  for (const option of $('invoicePhotoMode').options) option.disabled = !page._reviewUrls?.[option.value];
  if (mode) $('invoicePhotoMode').value = mode;
  const image = $('invoiceSourceImage');
  if (url) image.src = url; else image.removeAttribute('src');
  image.alt = (mode === 'original' ? 'Original invoice photo' : mode === 'overlay' ? 'Invoice with OCR word boxes' : 'Cleaned invoice image') + ', page ' + invoiceCurrentPage;
  $('invoiceSourceCaption').textContent = mode === 'original' ? 'Original image. Choose Cleaned to see the selected row highlighted.' : 'Select “View source” on a product to highlight its position.';
  $('invoiceDownloadCleaned').disabled = !(page.cleaned instanceof Blob);
  invoiceShowHighlight();
}
function invoiceShowHighlight() {
  const highlight = $('invoiceSourceHighlight');
  const page = invoiceScanResult?.pages?.find(item => Number(item.pageNumber) === invoiceCurrentPage);
  const state = invoiceFocusedRow;
  const box = state?.source?.sourceBox;
  const image = $('invoiceSourceImage');
  const show = state && page && state.pageNumber === invoiceCurrentPage && Array.isArray(box) && box.length === 4 && (invoiceDisplayedPhotoMode === 'cleaned' || invoiceDisplayedPhotoMode === 'overlay');
  highlight.hidden = !show;
  if (!show) return;
  const width = Number(page.width) || image.naturalWidth, height = Number(page.height) || image.naturalHeight;
  if (!(width > 0 && height > 0)) { highlight.hidden = true; return; }
  highlight.style.left = Math.max(0, box[0] / width * 100) + '%';
  highlight.style.top = Math.max(0, box[1] / height * 100) + '%';
  highlight.style.width = Math.min(100, box[2] / width * 100) + '%';
  highlight.style.height = Math.min(100, box[3] / height * 100) + '%';
}
function invoiceFocusSource(state) {
  invoiceFocusedRow = state;
  invoiceCurrentPage = state.pageNumber;
  $('invoicePageSelect').value = String(invoiceCurrentPage);
  $('invoicePhotoMode').value = 'cleaned';
  invoiceShowPage();
  invoiceSetMobileView('photo');
  $('invoicePhotoPane').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function invoiceDownload(blob, name) {
  if (!(blob instanceof Blob)) return;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function invoiceDebugJson() {
  if (!invoiceScanResult) return;
  const result = invoiceScanResult;
  const payload = {
    version: result.version, filename: result.filename, engine: result.engine,
    supplier: result.supplier, invoiceNumber: result.invoiceNumber, orderNumber: result.orderNumber,
    pages: (result.pages || []).map(page => ({ pageNumber: page.pageNumber, width: page.width, height: page.height, preprocessing: page.preprocessing, words: page.words, columns: page.columns })),
    rows: result.rows, totals: result.totals, validation: result.validation, warnings: result.warnings,
    reviewedRows: invoiceReviewStates.map(state => ({ id: state.id, productCode: state.productCode, description: state.description, quantity: state.quantity, unitPrice: state.unitPrice, lineTotal: state.lineTotal, quantityBasis: state.quantityBasis, priceBasis: state.priceBasis, caseCount: state.caseCount, eachSize: state.eachSize, packUnit: state.packUnit, confirmed: state.confirmed, selected: state.selected })),
    reviewedValidation: invoiceCurrentValidation()
  };
  invoiceDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'menumargin-positioned-ocr-debug.json');
}
function invoiceValidateImport(state) {
  const issues = [];
  if (!state.description.trim()) issues.push('product name');
  const quantity = invoiceBilledQuantity(state);
  if (!Number.isFinite(quantity) || !(quantity > 0)) issues.push(state.quantityBasis === 'weight' ? 'billed weight' : 'quantity');
  if (!Number.isFinite(state.unitPrice) || state.unitPrice < 0) issues.push('unit price');
  if (!Number.isFinite(state.lineTotal) || state.lineTotal < 0) issues.push('line total');
  if (!['ex_vat', 'inc_vat'].includes(state.priceBasis)) issues.push('VAT basis');
  const arithmetic = invoiceRowArithmetic(state);
  if (arithmetic && !arithmetic.matches) issues.push('quantity × unit price matching the line total');
  if (!Number.isInteger(state.caseCount) || !(state.caseCount >= 1) || !(state.eachSize > 0) || !Number.isFinite(state.eachSize)) issues.push('pack size');
  if (!['kg', 'g', 'l', 'ml', 'each'].includes(state.packUnit)) issues.push('unit');
  const price = invoiceRowPrice(state);
  if (price === null || !Number.isFinite(price) || price < 0) issues.push('price');
  if (state.quantityBasis === 'unit' && state.caseCount !== 1) issues.push('loose-item pack count');
  if (state.quantityBasis === 'weight' && (!(state.weight > 0) || !['kg', 'g', 'l', 'ml'].includes(state.weightUnit) || state.eachSize !== state.weight || state.packUnit !== state.weightUnit)) issues.push('weighed pack');
  if (!state.confirmed) issues.push('photo check');
  if (!state.matchChoice) issues.push('existing-product choice');
  return issues;
}
function importInvoiceReview() {
  if (invoiceScanResult?.validation?.blockingIssues?.length) {
    invoiceToast('Nothing was imported. Select one complete invoice with only one photo of each printed page, then scan again.');
    return;
  }
  const supplier = $('invoiceSupplier').value.trim();
  if (!supplier) { invoiceToast('Enter the supplier name before importing.'); $('invoiceSupplier').focus(); return; }
  const selected = invoiceReviewStates.filter(state => state.selected);
  if (!selected.length) { invoiceToast('Select at least one product to import.'); return; }
  if (invoiceCurrentValidation().matchesSubtotal === false && !$('invoiceTotalsConfirm').checked) {
    invoiceToast('Review and acknowledge the subtotal difference before importing selected rows.');
    $('invoiceTotalsConfirm').focus(); return;
  }
  const invalid = selected.map(state => ({ state, issues: invoiceValidateImport(state) })).filter(result => result.issues.length);
  if (invalid.length) {
    invoiceToast('Nothing was imported. ' + invalid.length + ' selected row(s) still need: ' + [...new Set(invalid.flatMap(item => item.issues))].join(', ') + '.');
    invalid[0].state.card.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  const items = readPriceBook().map(item => ({ ...item }));
  const stamp = new Date().toISOString();
  let added = 0, updated = 0;
  const targets = new Set();
  const planned = [];
  for (const state of selected) {
    const currentMatches = invoiceFindMatches(state, items);
    if(currentMatches.blockedName){invoiceToast('Nothing was imported. The name for '+state.productCode+' must match its existing supplier item exactly.');invoiceRenderMatch(state);return;}
    let targetId = state.matchChoice === '__new__' ? null : state.matchChoice;
    if (currentMatches.exact && state.matchChoice !== currentMatches.exact.id) {
      invoiceToast('An exact supplier item now exists for ' + state.description + '. Review its match before importing.'); invoiceRenderMatch(state); return;
    }
    if (!currentMatches.exact && currentMatches.close.length && !state.matchExplicit) {
      invoiceToast('Review the close match for ' + state.description + ' before importing.'); invoiceRenderMatch(state); return;
    }
    let index = targetId ? items.findIndex(item => item.id === targetId) : -1;
    if (targetId && index < 0) { invoiceToast('A matched price-book item changed. Review the matching choices and try again.'); return; }
    if(index>=0&&invoiceNormaliseName(items[index].name)!==invoiceNormaliseName(state.description)){invoiceToast('Nothing was imported. Product names must match exactly; capital letters and extra spaces are ignored.');invoiceRenderMatch(state);return;}
    if (index >= 0 && mmNormalizeProductKey(items[index].supplier) !== mmNormalizeProductKey(supplier)) { invoiceToast('The supplier changed. Review the existing-product choices again.'); return; }
    if (index >= 0 && state.productCode && items[index].code && mmNormalizeProductKey(state.productCode) !== mmNormalizeProductKey(items[index].code)) { invoiceToast('Different known product codes cannot be combined. Choose a separate product.'); return; }
    const key = targetId || (mmNormalizeProductKey(supplier) + '|' + (mmNormalizeProductKey(state.productCode) || invoiceNormaliseName(state.description)));
    if (targets.has(key)) { invoiceToast('Two selected rows refer to the same product. Select one final price for each product before importing.'); return; }
    targets.add(key);
    const totalSize = state.caseCount * state.eachSize;
    const packBase = unitBaseSize(totalSize, state.packUnit);
    if (!(packBase > 0) || !Number.isFinite(packBase)) { invoiceToast('A selected pack size is invalid. Nothing was imported.'); return; }
    const previous = index >= 0 ? items[index] : null;
    const entry = {
      ...(previous || {}), id: previous?.id || mmNewUuid(), name: previous?.name || state.description.trim(), supplier,
      code: state.productCode.trim() || previous?.code || '', packBase, baseUnit: baseUnit(state.packUnit),
      price: invoiceRowPrice(state), priceBasis: state.priceBasis, sourcePackSize: totalSize, sourceUnit: state.packUnit,
      caseCount: state.caseCount, unitPackSize: state.eachSize, unitPackUnit: state.packUnit, updatedAt: stamp,
      priceSource: { type: 'invoice', description: state.description.trim(), invoiceNumber: $('invoiceNumber').value.trim(), orderNumber: $('invoiceOrderNumber').value.trim(), pageNumber: state.pageNumber, quantity: invoiceBilledQuantity(state), orderedQuantity: invoiceNumberOrNull(state.source?.orderedQuantity), quantityBasis: state.quantityBasis, weight: state.weight, weightUnit: state.weightUnit, unitPrice: state.unitPrice, lineTotal: state.lineTotal }
    };
    entry.priceHistory = typeof mmPriceHistoryForUpdate === 'function' ? mmPriceHistoryForUpdate(previous, entry, 'invoice') : (previous?.priceHistory || []).slice();
    planned.push({ index, entry });
  }
  planned.forEach(({ index, entry }) => { if (index >= 0) { items[index] = entry; updated++; } else { items.push(entry); added++; } });
  try {
    writePriceBook(items);
    selected.forEach(state => { state.selected = false; state.elements.selected.checked = false; });
    invoiceReviewStates.forEach(invoiceRenderMatch);
    invoiceUpdateSelectionSummary();
    renderPriceBook();
    invoiceToast(added + ' new product(s) added; ' + updated + ' existing price(s) updated. Previous prices are kept in the price book history.');
    pbToast(added + ' product(s) added from the invoice; ' + updated + ' price(s) updated with history. Exact-name linked recipes now use the current prices.');
  } catch (error) { invoiceToast('The price book could not be saved. Your review is still here; export important data and check device storage.'); }
}

$('scanInvoice').addEventListener('click', scanInvoiceFile);
$('clearInvoice').addEventListener('click', clearInvoiceScanner);
$('invoiceCancelScan').addEventListener('click', () => { invoiceScanController?.abort(); invoiceStatus('Cancelling the scan…'); });
$('importInvoiceRows').addEventListener('click', importInvoiceReview);
$('invoiceFile').addEventListener('change', () => {
  const files = Array.from($('invoiceFile').files || []), file = files[0];
  invoiceScanSequence += 1; invoiceScanController?.abort(); invoiceScanController = null;
  invoiceScanResult = null; invoiceReviewStates = []; invoiceFocusedRow = null; invoiceReleasePhotos();
  $('invoiceReviewRows').replaceChildren(); $('invoiceReviewArea').hidden = true;
  $('invoiceFileName').textContent = files.length > 1 ? files.length + ' invoice files selected' : file ? file.name : 'No invoice selected';
  $('invoiceFileName').title = files.map(item => item.name).join(', ');
  for (const id of ['invoiceNumber', 'invoiceOrderNumber']) { $(id).value = ''; $(id).dataset.autoValue = ''; }
  const supplier = $('invoiceSupplier');
  if (supplier.value.trim() === (supplier.dataset.autoValue || '')) supplier.value = '';
  supplier.dataset.autoValue = '';
  $('invoiceCancelScan').hidden = true; $('scanInvoice').disabled = false;
  invoiceToast(''); invoiceStatus(file ? 'Ready to read this invoice on your device.' : 'Choose an invoice to begin.');
});
$('invoiceSupplier').addEventListener('input', () => invoiceReviewStates.forEach(state => { invoiceRenderMatch(state); invoiceRowChanged(state); }));
$('invoicePageSelect').addEventListener('change', event => { invoiceCurrentPage = Number(event.target.value); invoiceShowPage(); });
$('invoicePhotoMode').addEventListener('change', invoiceShowPage);
$('invoiceSourceImage').addEventListener('load', invoiceShowHighlight);
$('invoiceShowRows').addEventListener('click', () => invoiceSetMobileView('rows'));
$('invoiceShowPhoto').addEventListener('click', () => invoiceSetMobileView('photo'));
$('invoiceBackToRow').addEventListener('click', () => { invoiceSetMobileView('rows'); invoiceFocusedRow?.card.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('invoiceDownloadCleaned').addEventListener('click', () => {
  const page = invoiceScanResult?.pages?.find(item => Number(item.pageNumber) === invoiceCurrentPage);
  if (page?.cleaned) invoiceDownload(page.cleaned, 'menumargin-cleaned-page-' + invoiceCurrentPage + '.png');
});
$('invoiceDownloadDebug').addEventListener('click', invoiceDebugJson);
$('selectInvoiceRows').addEventListener('click', () => { invoiceReviewStates.forEach(state => { state.selected = true; state.elements.selected.checked = true; }); invoiceUpdateSelectionSummary(); });
$('clearInvoiceSelection').addEventListener('click', () => { invoiceReviewStates.forEach(state => { state.selected = false; state.elements.selected.checked = false; }); invoiceUpdateSelectionSummary(); });
