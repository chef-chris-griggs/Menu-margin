import assert from 'node:assert/strict';
import { readFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserName = process.argv.includes('--webkit') || process.env.MENUMARGIN_DECODE_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const skipPrivate = process.argv.includes('--skip-private');
const privateNames = ['IMG_2385', 'IMG_2384', 'IMG_2374', 'IMG_2373', 'IMG_2372'];
if (!skipPrivate) {
  for (const name of privateNames) {
    try { await access(join(root, 'samples', name + '.HEIC')); }
    catch { throw new Error('Restore private samples/' + name + '.HEIC before the decoder regression. Use --skip-private only for synthetic decoder checks.'); }
  }
}
const debugDirectory = join(root, 'scanner-debug');
await mkdir(debugDirectory, { recursive: true });
// A test-local decoder build avoids mutating production assets during an OCR run.
const bundle = await build({ entryPoints: [join(root, 'scanner/heic-decoder.js')], write: false,
  bundle: true, format: 'esm', platform: 'browser', minify: true, logLevel: 'silent' });
const decoderModule = bundle.outputFiles[0].contents;
function blankPdf(pages) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, index) => `${index + 3} 0 R`).join(' ')}] >>`,
    ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>')];
  let content = '%PDF-1.4\n'; const offsets = [0];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = Buffer.byteLength(content); content += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const start = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index++) content += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  return content + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}
const errors = [], unexpectedRequests = [], checks = [];
const browser = await (browserName === 'webkit' ? webkit : chromium).launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://menumargin.test') {
      unexpectedRequests.push(url.href); await route.abort(); return;
    }
    // WebKit exposes PDF.js's same-origin in-memory worker URL to routing.
    if (url.protocol === 'blob:') { await route.continue(); return; }
    const path = url.pathname;
    try {
      if (path === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Local decoder regression</body></html>' }); return; }
      if (path.startsWith('/blank/')) { await route.fulfill({ contentType: 'application/pdf', body: blankPdf(Number(path.slice(7))) }); return; }
      if (path === '/vendor/scanner/heic-decoder.js') { await route.fulfill({ contentType: 'application/javascript', body: Buffer.from(decoderModule) }); return; }
      const allowed = path === '/scanner/decode.js' || path.startsWith('/vendor/pdfjs/') || /^\/samples\/IMG_\d+\.HEIC$/.test(path);
      if (!allowed) { unexpectedRequests.push(url.href); await route.fulfill({ status: 404, body: '' }); return; }
      await route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', body: await readFile(join(root, path)) });
    } catch (error) { await route.fulfill({ status: 500, body: String(error) }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://menumargin.test');
  await page.evaluate(async () => {
    window.decoder = await import('/scanner/decode.js');
    window.decodeFixtures = {};
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 60;
    const context = canvas.getContext('2d'); context.fillStyle = '#f00'; context.fillRect(0, 0, 50, 60);
    context.fillStyle = '#00f'; context.fillRect(50, 0, 50, 60);
    const jpeg = new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .98))).arrayBuffer());
    function orientationJpeg(orientation) {
      // EXIF APP1 segment with a little-endian TIFF orientation entry.
      const app1 = new Uint8Array(36), view = new DataView(app1.buffer);
      app1.set([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0]);
      view.setUint16(20, 0x112, true); view.setUint16(22, 3, true); view.setUint32(24, 1, true); view.setUint16(28, orientation, true);
      return new Blob([jpeg.slice(0, 2), app1, jpeg.slice(2)], { type: 'image/jpeg' });
    }
    window.decodeFixtures.rotation = orientationJpeg(6);
    window.decodeFixtures.mirror = orientationJpeg(2);
    canvas.width = 3600; canvas.height = 1800;
    context.fillStyle = '#eee'; context.fillRect(0, 0, canvas.width, canvas.height);
    window.decodeFixtures.large = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
  });
  const run = async (source, name, type = 'image/jpeg', pageStart = 1) => page.evaluate(async ({ source, name, type, pageStart }) => {
    const blob = window.decodeFixtures[source] || await (await fetch(source)).blob();
    const file = new File([blob], name, { type }), output = [];
    for await (const decoded of window.decoder.decodeFilePages(file, { assetsBase: location.origin + '/vendor/scanner/', pageStart })) {
      const { width, height, data } = decoded.pixels;
      const offset = (Math.floor(height * .5) * width + Math.floor(width * .25)) * 4;
      const preview = await createImageBitmap(decoded.original);
      output.push({ width, height, bytes: data.length, pixel: Array.from(data.slice(offset, offset + 4)),
        preview: [preview.width, preview.height], decode: decoded.decode, filePageNumber: decoded.filePageNumber });
      preview.close();
    }
    return output;
  }, { source, name, type, pageStart });
  let output = await run('rotation', 'orientation-6.jpg');
  assert.deepEqual([output[0].width, output[0].height], [60, 100]);
  assert.deepEqual(output[0].preview, [60, 100]); checks.push({ name: 'EXIF rotation 6', result: output[0] });
  output = await run('mirror', 'orientation-2.jpg');
  assert.ok(output[0].pixel[2] > output[0].pixel[0], 'EXIF mirror must put blue on the left'); checks.push({ name: 'EXIF mirror 2', result: output[0] });
  output = await run('large', 'large-generated.jpg');
  assert.deepEqual([output[0].width, output[0].height], [3000, 1500]);
  assert.equal(output[0].bytes, 3000 * 1500 * 4); checks.push({ name: 'Large JPEG bounded dimensions', result: output[0] });
  if (!skipPrivate) for (const name of privateNames) {
    output = await run('/samples/' + name + '.HEIC', name + '.HEIC', 'image/heic');
    assert.equal(output.length, 1); assert.ok(output[0].width > 0 && output[0].height > 0);
    assert.ok(Math.max(output[0].width, output[0].height) <= 3000);
    checks.push({ name: 'Original HEIC ' + name, result: output[0] });
  }
  output = await run('/blank/2', 'two-pages.pdf', 'application/pdf', 7);
  assert.equal(output.length, 2); assert.deepEqual(output.map(item => item.decode.pageNumber), [7, 8]);
  assert.deepEqual(output.map(item => item.filePageNumber), [1, 2]); checks.push({ name: 'Serial two-page PDF numbering', result: output });
  const rejected = await page.evaluate(async () => {
    const results = {};
    async function reject(name, file, options = {}) {
      try { for await (const value of window.decoder.decodeFilePages(file, { assetsBase: location.origin + '/vendor/scanner/', ...options })) void value; results[name] = 'accepted'; }
      catch (error) { results[name] = error.name + ': ' + error.message; }
    }
    const controller = new AbortController(); controller.abort();
    await reject('pages', new File([await (await fetch('/blank/13')).blob()], '13.pdf', { type: 'application/pdf' }));
    await reject('abort', new File(['xx'], 'abort.jpg'), { signal: controller.signal });
    await reject('size', new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'large.jpg'));
    await reject('invalid', new File(['broken'], 'broken.jpg', { type: 'image/jpeg' }));
    await reject('empty', new File([], 'empty.jpg'));
    await reject('pageStart', new File(['broken'], 'broken.jpg'), { pageStart: 0 });
    return results;
  });
  assert.match(rejected.pages, /13 pages.*12 pages/); checks.push({ name: 'Reject PDF over 12 pages', result: rejected.pages });
  assert.match(rejected.abort, /^AbortError:/); checks.push({ name: 'Abort before decode', result: rejected.abort });
  assert.match(rejected.size, /30 MB/); checks.push({ name: 'Reject over 30 MB', result: rejected.size });
  assert.match(rejected.invalid, /could not be decoded/); checks.push({ name: 'Reject corrupt image', result: rejected.invalid });
  assert.match(rejected.empty, /Choose an invoice/); checks.push({ name: 'Reject empty file', result: rejected.empty });
  assert.match(rejected.pageStart, /positive integer/); checks.push({ name: 'Reject invalid starting page', result: rejected.pageStart });
  assert.deepEqual(unexpectedRequests, [], 'decoder test must not make external requests');
  assert.deepEqual(errors, [], 'decoder must not generate unhandled browser errors');
  const report = { browser: browserName, passed: true, privateSamplesIncluded: !skipPrivate, checks, browserErrors: errors, unexpectedRequests };
  await import('node:fs/promises').then(({ writeFile }) => writeFile(join(debugDirectory, 'invoice-decode-' + browserName + '.json'), JSON.stringify(report, null, 2)));
  console.log(JSON.stringify({ browser: browserName, passed: true, privateSamplesIncluded: !skipPrivate,
    checks: checks.map(check => check.name), browserErrors: errors, unexpectedRequests,
    report: 'scanner-debug/invoice-decode-' + browserName + '.json' }, null, 2));
} finally { await browser.close(); }
