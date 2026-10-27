/**
 * Parsers for ONE positioned table cell. Callers must supply only that cell's
 * tokens; these functions never receive or search a whole OCR page.
 */

function cellText(tokensOrString) {
  const text = Array.isArray(tokensOrString)
    ? tokensOrString.map(token => typeof token === 'string' ? token : token?.text ?? token?.word ?? '').join(' ')
    : typeof tokensOrString === 'string' ? tokensOrString : '';
  return text.replace(/[\u00a0\u202f]/g, ' ').replace(/[−–—]/g, '-').trim();
}

const GBP_NUMBER = /^(?:(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\.(\d{1,2}))$/;
const STRICT_NUMBER = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

function missingMoney(reason) {
  return { value: null, pence: null, needsReview: true, reasons: [reason] };
}

/** Parse standard GBP notation into integer pence without guessing OCR digits. */
export function parseGbpCell(tokensOrString,{allowOcrCurrencyGlyph=false}={}) {
  let text = cellText(tokensOrString);
  const reasons = [];
  if (!text) return missingMoney('No price was read from this cell.');
  if (/[€$¥]/.test(text)) return missingMoney('This price uses a currency other than GBP.');
  if(allowOcrCurrencyGlyph&&/^[E*]\s*\d+(?:,\d{3})*\.\d{2}$/.test(text)){
    text=text.slice(1).trim();reasons.push('The GBP currency symbol was unclear in OCR; check this amount against the photo.');
  }
  const poundSigns = text.match(/£/g)?.length ?? 0;
  const currencyCodes = text.match(/\bGBP\b/gi)?.length ?? 0;
  if (poundSigns > 1 || currencyCodes > 1) return missingMoney('This cell contains more than one price or currency marker.');
  text = text.replace(/£/g, '').replace(/\bGBP\b/gi, '').trim();

  let credit = false;
  if (/\s*(?:CR|CREDIT)$/i.test(text)) {
    credit = true;
    text = text.replace(/\s*(?:CR|CREDIT)$/i, '').trim();
  }
  if (text.startsWith('(') && text.endsWith(')')) {
    credit = true;
    text = text.slice(1, -1).trim();
  }
  let explicitPlus = false;
  if (text.startsWith('-')) { credit = true; text = text.slice(1).trim(); }
  else if (text.startsWith('+')) { explicitPlus = true; text = text.slice(1).trim(); }
  if (text.endsWith('-')) { credit = true; text = text.slice(0, -1).trim(); }
  if (explicitPlus && credit) return missingMoney('This price has conflicting positive and credit markers.');

  // A visible decimal/grouping separator can survive as a separate OCR token.
  // Keep the value, but expose that reconstruction for explicit review.
  const joined = text.replace(/(\d)\s*([.,])\s*(?=\d)/g, '$1$2');
  if (joined !== text) reasons.push('Price punctuation was separated in OCR; check the original.');
  text = joined;
  if (/\d\s+\d/.test(text)) return missingMoney('This cell has multiple amounts or pounds and pence separated without a decimal point.');

  const match = GBP_NUMBER.exec(text);
  if (!match) return missingMoney('This cell is not one valid GBP amount.');
  const wholePounds = Number((match[1] ?? '0').replace(/,/g, ''));
  const fraction = (match[2] ?? match[3] ?? '').padEnd(2, '0');
  let pence = wholePounds * 100 + Number(fraction || '0');
  if (!Number.isSafeInteger(pence)) return missingMoney('This amount is outside the supported exact-pence range.');
  if (credit) pence = -pence;
  // Do not turn whole prices such as 1250 or 6427 into 12.50 or 64.27.
  return { value: pence / 100, pence, needsReview: reasons.length > 0, reasons };
}

/** Parse a literal ordered quantity, optionally followed by its printed unit. */
export function parseNumberCell(tokensOrString) {
  const text = cellText(tokensOrString)
    .replace(/\s*(?:kilograms?|kgs?|grams?|grammes?|gms?|gm|g|litres?|liters?|ltrs?|lt|l|millilitres?|milliliters?|ml|each|ea|pcs?|pieces?|cases?|cs|units?|dozens?|dzn|dz|doz)\s*$/i, '')
    .trim();
  if (!STRICT_NUMBER.test(text)) return null;
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
}

/** Preserve an explicit decimal while exposing detached leading OCR specks.
 * Never reconstruct a missing decimal or change a digit. */
export function parseQuantityCell(tokensOrString){
  const printedText=cellText(tokensOrString),literal=parseNumberCell(printedText);
  if(literal!==null)return {value:literal,needsReview:false,reasons:[],printedText};
  const match=/^[.·:]{1,3}\s*(\d+\.\d{1,3})$/.exec(printedText);
  if(match){const value=parseNumberCell(match[1]);if(value!==null)return {value,needsReview:true,reasons:['There was extra punctuation before this quantity; check its printed decimal against the photo.'],printedText};}
  return {value:null,needsReview:true,reasons:[],printedText};
}

const PACK_UNITS = new Map([
  ...['kg', 'kgs', 'kilogram', 'kilograms'].map(unit => [unit, 'kg']),
  ...['g', 'gm', 'gms', 'gr', 'gram', 'grams', 'gramme', 'grammes'].map(unit => [unit, 'g']),
  ...['l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters'].map(unit => [unit, 'l']),
  ...['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'].map(unit => [unit, 'ml']),
  ...['ea', 'each', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units'].map(unit => [unit, 'each'])
]);
const DOZENS = new Set(['dzn', 'dz', 'doz', 'dozen', 'dozens']);
const PORTIONS = new Set(['ptn', 'ptns', 'portion', 'portions']);

/** Decode only explicitly printed pack factors and units from a pack-size cell. */
export function parsePackCell(tokensOrString,{allowOcrUnitGlyph=false}={}) {
  const printedText = cellText(tokensOrString);
  const result = { caseCount: null, eachSize: null, unit: null, printedText, needsReview: true, reasons: [] };
  if (!printedText) {
    result.reasons.push('No pack size was read from this cell.');
    return result;
  }
  let text = printedText.replace(/[×✕]/g, 'x')
    .replace(/\s*\/?\s*(?:cases?|cs|packs?|pk|cartons?|ctn)\s*$/i, '')
    .replace(/(kilograms?|kgs?|grammes?|grams?|gms?|gm|g|millilitres?|milliliters?|ml|litres?|liters?|ltrs?|lt|l)\s*\/?\s*each\s*$/i, '$1')
    .replace(/\/\s*$/, '').trim();
  if(allowOcrUnitGlyph&&/\d1tr$/i.test(text)){
    text=text.replace(/1tr$/i,'ltr');result.reasons.push('The litre unit was read as 1tr; check the printed pack against the photo.');
  }
  const match = /^((?:\d+(?:\.\d+)?\s*[xX-]\s*)*\d+(?:\.\d+)?)\s*([A-Za-z]*)$/.exec(text);
  if (!match) {
    result.reasons.push('The printed pack size is incomplete or contains unsupported text; check the original.');
    return result;
  }
  const factors = match[1].split(/\s*[xX-]\s*/).map(Number);
  const printedUnit = match[2].toLowerCase();
  if (printedUnit && !PACK_UNITS.has(printedUnit) && !DOZENS.has(printedUnit) && !PORTIONS.has(printedUnit)) {
    result.reasons.push('The pack unit was not recognised; check the original.');
    return result;
  }
  if (!printedUnit && factors.length === 1) {
    result.reasons.push('A single pack number has no unit; its meaning needs confirmation.');
    return result;
  }
  result.caseCount = factors.length > 1 ? factors.slice(0, -1).reduce((count, factor) => count * factor, 1) : 1;
  result.eachSize = factors[factors.length - 1];
  if (DOZENS.has(printedUnit)) { result.unit = 'each'; result.eachSize *= 12; }
  else if (PORTIONS.has(printedUnit)) {
    result.unit = 'each';
    result.reasons.push('This pack is measured in portions; confirm how it should be costed.');
  } else if (!printedUnit && factors.length > 1 && !match[1].includes('-')) result.unit = 'each';
  else result.unit = PACK_UNITS.get(printedUnit) ?? null;
  if (!result.unit) result.reasons.push('The pack unit was not recognised; check the original.');
  if (!Number.isSafeInteger(result.caseCount) || result.caseCount < 1) result.reasons.push('Items per case must be a positive whole number.');
  if (!(result.eachSize > 0) || !Number.isFinite(result.eachSize)) result.reasons.push('The size of each item must be greater than zero.');
  if (!Number.isFinite(result.caseCount * result.eachSize)) result.reasons.push('The total pack size is outside the supported range.');
  result.needsReview = result.reasons.length > 0;
  return result;
}
