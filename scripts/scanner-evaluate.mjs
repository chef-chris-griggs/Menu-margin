/**
 * Compare positioned scanner output with independently annotated invoice rows.
 * Fuzzy matching is used only to align rows. It never earns field accuracy.
 */

const FIELD_DEFINITIONS = [
  { key: 'productCode', kind: 'code' },
  { key: 'description', kind: 'description' },
  { key: 'quantity', kind: 'number' },
  { key: 'unitPrice', kind: 'number' },
  { key: 'lineTotal', kind: 'number' },
  { key: 'priceBasis', kind: 'label' },
  { key: 'pack.caseCount', kind: 'number' },
  { key: 'pack.eachSize', kind: 'number' },
  { key: 'pack.unit', kind: 'label' },
];

const GAP_COST = 3.5;
const NUMBER_TOLERANCE = 0.005;

function isMissing(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function atPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function normaliseDescription(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-GB')
    .replace(/['’]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function normaliseCode(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleUpperCase('en-GB');
}

function normaliseLabel(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-GB');
}

function numericValue(value) {
  if (isMissing(value) || typeof value === 'boolean' || typeof value === 'object') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function levenshteinRatio(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function descriptionSimilarity(leftValue, rightValue) {
  const left = normaliseDescription(leftValue), right = normaliseDescription(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' ')), rightTokens = new Set(right.split(' '));
  const common = [...leftTokens].filter(token => rightTokens.has(token)).length;
  const tokenDice = 2 * common / (leftTokens.size + rightTokens.size);
  return 0.7 * levenshteinRatio(left, right) + 0.3 * tokenDice;
}

function matchScore(expected, actual) {
  const expectedCode = normaliseCode(expected?.productCode), actualCode = normaliseCode(actual?.productCode);
  const similarity = descriptionSimilarity(expected?.description, actual?.description);
  if (expectedCode && actualCode && expectedCode === actualCode) return 12 + 2 * similarity;
  if (similarity < 0.28) return -9;
  // A corrupt or absent code must not prevent an otherwise identifiable row
  // from being aligned. The code field will still be marked wrong below.
  return 7 * similarity - (expectedCode && actualCode ? 2.5 : 0.5);
}

function alignRows(expectedRows, actualRows) {
  const n = expectedRows.length, m = actualRows.length;
  const scores = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const actions = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { scores[i][0] = -i * GAP_COST; actions[i][0] = 2; }
  for (let j = 1; j <= m; j++) { scores[0][j] = -j * GAP_COST; actions[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const paired = scores[i - 1][j - 1] + matchScore(expectedRows[i - 1], actualRows[j - 1]);
      const missing = scores[i - 1][j] - GAP_COST;
      const extra = scores[i][j - 1] - GAP_COST;
      if (paired >= missing && paired >= extra) { scores[i][j] = paired; actions[i][j] = 1; }
      else if (missing >= extra) { scores[i][j] = missing; actions[i][j] = 2; }
      else { scores[i][j] = extra; actions[i][j] = 3; }
    }
  }
  const alignment = [];
  let i = n, j = m;
  while (i || j) {
    const action = actions[i][j];
    if (action === 1) alignment.push({ expectedRowIndex: --i, actualRowIndex: --j, kind: 'matched' });
    else if (action === 2) alignment.push({ expectedRowIndex: --i, actualRowIndex: null, kind: 'missing' });
    else alignment.push({ expectedRowIndex: null, actualRowIndex: --j, kind: 'extra' });
  }
  return alignment.reverse();
}

function valuesMatch(kind, expected, actual) {
  if (isMissing(actual)) return false;
  if (kind === 'number') {
    const wanted = numericValue(expected), found = numericValue(actual);
    return wanted !== null && found !== null && Math.abs(wanted - found) <= NUMBER_TOLERANCE + 1e-9;
  }
  if (kind === 'code') return normaliseCode(expected) === normaliseCode(actual);
  if (kind === 'description') return normaliseDescription(expected) === normaliseDescription(actual);
  return normaliseLabel(expected) === normaliseLabel(actual);
}

const percentage = (correct, total) => total ? Number((correct / total * 100).toFixed(2)) : null;
const serialisable = value => value === undefined ? null : value;

export function evaluateSample(actualDocument, expectedJson) {
  if (!Array.isArray(expectedJson?.expectedRows)) throw new TypeError('Expected sample must contain expectedRows.');
  const expectedRows = expectedJson.expectedRows;
  const actualRows = Array.isArray(actualDocument?.rows) ? actualDocument.rows : [];
  const alignment = alignRows(expectedRows, actualRows);
  const fields = Object.fromEntries(FIELD_DEFINITIONS.map(({ key }) => [key, { correct: 0, total: 0, accuracy: null }]));
  const mismatches = [];
  let matched = 0, missing = 0, extra = 0;
  for (const pair of alignment) {
    const expected = pair.expectedRowIndex === null ? null : expectedRows[pair.expectedRowIndex];
    const actual = pair.actualRowIndex === null ? null : actualRows[pair.actualRowIndex];
    if (pair.kind === 'extra') {
      extra++;
      mismatches.push({ type: 'extra_row', expectedRowIndex: null, actualRowIndex: pair.actualRowIndex,
        productCode: serialisable(actual?.productCode), description: serialisable(actual?.description), actual });
      continue;
    }
    if (pair.kind === 'missing') {
      missing++;
      mismatches.push({ type: 'missing_row', expectedRowIndex: pair.expectedRowIndex, actualRowIndex: null,
        productCode: serialisable(expected?.productCode), description: serialisable(expected?.description) });
    } else matched++;
    for (const field of FIELD_DEFINITIONS) {
      const wanted = atPath(expected, field.key);
      // Null annotation means unknown/not visible, rather than a free correct
      // answer or a required value that the scanner should invent.
      if (isMissing(wanted)) continue;
      const found = actual ? atPath(actual, field.key) : null;
      const fieldResult = fields[field.key];
      fieldResult.total++;
      if (valuesMatch(field.kind, wanted, found)) fieldResult.correct++;
      else mismatches.push({ type: 'field', field: field.key, expectedRowIndex: pair.expectedRowIndex,
        actualRowIndex: pair.actualRowIndex, productCode: serialisable(expected?.productCode),
        expected: serialisable(wanted), actual: serialisable(found), missing: isMissing(found) });
    }
  }
  for (const result of Object.values(fields)) result.accuracy = percentage(result.correct, result.total);
  const correct = Object.values(fields).reduce((sum, field) => sum + field.correct, 0);
  const total = Object.values(fields).reduce((sum, field) => sum + field.total, 0);
  const issues = [];
  if (missing) issues.push(`${missing} expected product row(s) were not found.`);
  if (extra) issues.push(`${extra} unexpected product row(s) were produced.`);
  if (!actualRows.length && expectedRows.length) issues.push('The scanner returned no product rows.');
  const pageCount = actualDocument?.pages?.length ?? 1;
  const partialDocument = Boolean(expectedJson.partialDocument && expectedJson.documentPageCount > pageCount);
  if (partialDocument) issues.push('This sample is one page of a multi-page document; the printed whole-invoice subtotal must be checked with its document group.');
  if (actualDocument?.validation?.matchesSubtotal === false && !partialDocument) issues.push('Scanner validation reports that line totals do not match the invoice subtotal.');
  if (Array.isArray(actualDocument?.warnings)) {
    for (const warning of actualDocument.warnings) {
      const message = typeof warning === 'string' ? warning : warning?.message;
      if (message && !issues.includes(message)) issues.push(message);
    }
  }
  return {
    sampleId: expectedJson.sampleId ?? expectedJson.sourceFile ?? 'unknown sample',
    sourceFile: expectedJson.sourceFile ?? null,
    rows: { expected: expectedRows.length, actual: actualRows.length, matched, missing, extra },
    fields, overall: { correct, total, accuracy: percentage(correct, total) },
    passed: missing === 0 && extra === 0 && correct === total,
    alignment, mismatches, issues,
    document: { partialDocument, expectedSubtotal: expectedJson.subtotal ?? null,
      actualSubtotal: actualDocument?.totals?.subtotal ?? null,
      validation: actualDocument?.validation ?? null },
  };
}

function shown(value) {
  const json = JSON.stringify(serialisable(value));
  return json === undefined ? 'null' : json;
}

function rowLabel(index) {
  return index === null ? 'missing' : `#${index + 1}`;
}

export function formatEvaluation(report) {
  const summary = report.rows;
  const lines = [
    `${report.sampleId}: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Rows: expected ${summary.expected}, found ${summary.actual}, aligned ${summary.matched}, missing ${summary.missing}, extra ${summary.extra}`,
    `Fields: ${report.overall.correct}/${report.overall.total} (${report.overall.accuracy ?? 'n/a'}%)`,
  ];
  for (const { key } of FIELD_DEFINITIONS) {
    const field = report.fields[key];
    lines.push(`  ${key.padEnd(17)} ${String(field.correct).padStart(3)}/${String(field.total).padEnd(3)} ${field.accuracy === null ? 'n/a' : field.accuracy.toFixed(2) + '%'}`);
  }
  if (!report.mismatches.length) lines.push('Mismatches: none.');
  else {
    lines.push(`Mismatches (${report.mismatches.length}):`);
    for (const mismatch of report.mismatches) {
      if (mismatch.type === 'missing_row') {
        lines.push(`  MISSING expected row ${rowLabel(mismatch.expectedRowIndex)} [${mismatch.productCode ?? 'no code'}] ${shown(mismatch.description)}`);
      } else if (mismatch.type === 'extra_row') {
        lines.push(`  EXTRA actual row ${rowLabel(mismatch.actualRowIndex)} [${mismatch.productCode ?? 'no code'}] ${shown(mismatch.description)}`);
      } else {
        lines.push(`  expected row ${rowLabel(mismatch.expectedRowIndex)} [${mismatch.productCode ?? 'no code'}] -> actual ${rowLabel(mismatch.actualRowIndex)} ${mismatch.field}: expected ${shown(mismatch.expected)}; actual ${shown(mismatch.actual)}`);
      }
    }
  }
  if (report.issues.length) {
    lines.push('Issues:');
    lines.push(...report.issues.map(issue => `  ${issue}`));
  }
  return lines.join('\n');
}
