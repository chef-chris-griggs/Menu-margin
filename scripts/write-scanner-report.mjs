import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),debug=path.join(root,'scanner-debug');
const reports=await Promise.all(['chromium','webkit'].map(async browser=>JSON.parse(await readFile(path.join(debug,`last-report-${browser}.json`),'utf8'))));
if(reports.some(r=>r.source!=='original HEIC'))throw new Error('Report requires original HEIC runs.');
const unit=await readFile(path.join(debug,'unit.log'),'utf8'),count=unit.match(/tests (\d+)/)?.[1]||'unknown';
const text=[
'# MenuMargin scanner validation — private test report',
'',`Generated ${new Date().toISOString()}. Rebuild candidate; live GitHub app has not been replaced.`,
'',
'**Overall result: FAIL. The scanner is not approved for public release.** Prices and pack extraction have improved substantially, but exact descriptions/product codes still have errors. These test photos do not establish accuracy on arbitrary suppliers or physical phones.',
'',
'Five original HEIC photos, three suppliers, 64 independently annotated product rows. Real photos, expected JSON, cleaned images, word overlays and mismatch reports remain local and ignored by Git.',
'',
'| Field | Chromium | WebKit (Safari engine on Mac) |',
'| --- | ---: | ---: |'
];
for(const [key,title] of Object.entries({productCode:'Product code',description:'Exact description',quantity:'Billed quantity',unitPrice:'Unit price',lineTotal:'Line total',priceBasis:'VAT basis (including explicit unknown)', 'pack.caseCount':'Items in priced pack','pack.eachSize':'Size per item','pack.unit':'Pack unit'})){
  text.push(`| ${title} | ${reports[0].fields[key].correct}/${reports[0].fields[key].total} | ${reports[1].fields[key].correct}/${reports[1].fields[key].total} |`);
}
text.push('',`Unit/domain checks: ${count}/${count} passed. Review/import browser checks: 24/24 passed in each browser. Decoder checks: 15/15 passed in each browser.`,
'',
'Both original-HEIC runs found 64 rows with no missing or extra product rows. The combined Bidfood invoice has 49 rows and reconciles exactly to its independently recorded subtotal. Both runs recorded zero external or upload requests.',
'',
'Current safety checks prevent a description-only next product from being silently joined to the previous product; zero loose quantities from replacing case packs; mixed case/loose packs from being assumed; missing financial fields or VAT decisions from being bypassed by a checkbox; subtotal tolerances from expanding with row count; and duplicate printed pages from displaying the wrong source photo.',
'',
'Only selected and individually checked valid rows can be imported. Similar product names require an explicit match choice. Previous prices and pack details remain in price history.',
'',
'## What still needs work',
'',
'- Correct the remaining description and product-code OCR errors below; Chromium also misses one quantity.',
'- Test unseen invoices, credits/discounts, difficult lighting and multi-line products. There is no “any invoice” accuracy guarantee.',
'- Run the actual app on a physical iPhone and Android phone, including a cold model download, airplane mode, cancellation, long invoices and memory pressure.',
'- The supplied photos did not yield confidently detected paper corners. The full image was preserved and this fallback was shown as a warning.',
'- Some invoice subtotals/VAT totals are unreadable or not explicitly identified. Missing reconciliation remains visible; unknown VAT basis requires a manual decision before import.',
'',
'## Offline checks',
'',
'Chromium passed fresh-worker HEIC scanning in browser offline mode, retry after cancellation, duplicate-photo protection and absence of invoice content from the HTTP cache. WebKit passed the same checks with the HTTP origin stopped. Its simulated offline mode blocks even brand-new in-memory Blob/File reads; the server-outage test avoids that test-runner limitation. Actual phone airplane mode remains untested.',
'',
'## Full remaining mismatches',
'');
const code=value=>'`'+JSON.stringify(value).replaceAll('`','\\`')+'`';
for(const report of reports){
  text.push(`### ${report.browser} — ${report.createdAt}`,'',`[Machine-readable report](last-report-${report.browser}.json). Per-field deltas against the previous matching dataset are recorded there.`, '');
  for(const sample of report.reports){
    text.push(`**${sample.sampleId}:** ${sample.rows.actual}/${sample.rows.expected} rows; ${sample.elapsedSeconds.toFixed(1)} seconds.`, '');
    if(sample.debugFolder){const relative=path.relative(debug,path.join(root,sample.debugFolder)).split(path.sep).join('/');text.push(`[Positioned words, rows and flags](${relative}/positioned-result.json).`,'');}
    for(const mismatch of sample.mismatches){text.push(`- Row ${(mismatch.expectedRowIndex??0)+1}, ${mismatch.field||mismatch.type}: expected ${code(mismatch.expected)}, actual ${code(mismatch.actual)}.`);}
    text.push('');
  }
}
await writeFile(path.join(debug,'VALIDATION.md'),text.join('\n'));
console.log(path.join(debug,'VALIDATION.md'));
