/** Browser-local decoding. This module never sends invoice data to a server. */
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_SIDE = 3000;
const MAX_PDF_PAGES = 12;
let pdfLibraryPromise;
let heicModulePromise;

function abortError() {
  return new DOMException('Invoice decoding cancelled.', 'AbortError');
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}

function abortable(promise, signal, { onAbort, onLateValue } = {}) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      try { onAbort?.(); } catch { /* Cancellation is best effort. */ }
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (settled) { onLateValue?.(value); return; }
      settled = true;
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      reject(signal.aborted ? abortError() : error);
    });
  });
}

function assetBase(options) {
  return new URL(options.assetsBase || './vendor/scanner/', document.baseURI);
}

function progress(options, message) {
  options.onProgress?.(message);
}

function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

function canvasBlob(canvas, signal) {
  checkAbort(signal);
  return abortable(new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Could not prepare the invoice preview.'));
  }, 'image/jpeg', 0.9)), signal);
}

async function nativeImage(blob, signal) {
  checkAbort(signal);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await abortable(createImageBitmap(blob, { imageOrientation: 'from-image' }), signal,
        { onLateValue: value => value.close() });
      if (!(bitmap.width > 0 && bitmap.height > 0)) { bitmap.close(); throw new Error('Empty image.'); }
      return { image: bitmap, path: 'native-image-bitmap', release: () => bitmap.close() };
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw abortError();
    }
  }
  checkAbort(signal);
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.style.imageOrientation = 'from-image';
  image.src = url;
  try {
    await abortable(image.decode(), signal, { onAbort: () => { image.src = ''; } });
    checkAbort(signal);
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('Empty image.');
    return { image, path: 'native-image-element', release: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) {
    image.src = '';
    URL.revokeObjectURL(url);
    if (signal?.aborted || error.name === 'AbortError') throw abortError();
    throw error;
  }
}

async function isHeic(file) {
  if (/\.(?:heic|heif)$/i.test(file.name || '') || /image\/(?:heic|heif)/i.test(file.type || '')) return true;
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') return false;
  const brands = [];
  for (let offset = 8; offset + 4 <= bytes.length; offset += 4) brands.push(String.fromCharCode(...bytes.slice(offset, offset + 4)));
  return brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand));
}

async function decodedImage(file, options) {
  const signal = options.signal;
  try {
    return await nativeImage(file, signal);
  } catch (nativeError) {
    if (nativeError.name === 'AbortError' || signal?.aborted) throw abortError();
    if (!(await isHeic(file))) throw new Error('This image could not be decoded. Choose a valid JPG, PNG, HEIC or PDF.');
  }
  checkAbort(signal);
  progress(options, 'Decoding this HEIC photo on your device…');
  if (!heicModulePromise) {
    const url = new URL('heic-decoder.js', assetBase(options)).href;
    heicModulePromise = import(/* @vite-ignore */ url).catch(error => { heicModulePromise = null; throw error; });
  }
  try {
    const module = await abortable(heicModulePromise, signal);
    checkAbort(signal);
    const decoded = await abortable(module.decodeHeic(file), signal,
      { onLateValue: value => { if (typeof value?.close === 'function') value.close(); } });
    checkAbort(signal);
    if (typeof ImageBitmap !== 'undefined' && decoded instanceof ImageBitmap) {
      return { image: decoded, path: 'heic-libheif-bitmap', release: () => decoded.close() };
    }
    const result = await nativeImage(decoded, signal);
    return { ...result, path: 'heic-libheif-jpeg' };
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) throw abortError();
    throw new Error('Could not decode this HEIC photo on this device. ' + (error.message || String(error)));
  }
}

async function decodePhoto(file, options) {
  const resource = await decodedImage(file, options);
  const image = resource.image;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  try {
    checkAbort(options.signal);
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Your browser could not prepare the invoice image.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    resource.release();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const original = await canvasBlob(canvas, options.signal);
    checkAbort(options.signal);
    return {
      pixels: { width: pixels.width, height: pixels.height, data: pixels.data }, original,
      sourceName: file.name || 'invoice-photo', filePageNumber: 1,
      decode: { type: 'image', path: resource.path, sourceWidth, sourceHeight,
        width: pixels.width, height: pixels.height, scale, exifApplied: true,
        orientationMethod: resource.path.startsWith('heic-libheif') ? 'HEIF container transforms followed by native image orientation' : 'native from-image',
        pageNumber: options.pageStart, filePageCount: 1 },
    };
  } finally {
    resource.release();
    releaseCanvas(canvas);
  }
}

async function loadPdfLibrary(options) {
  checkAbort(options.signal);
  if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
  if (!pdfLibraryPromise) {
    const url = new URL('../pdfjs/pdf.min.js', assetBase(options)).href;
    pdfLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => globalThis.pdfjsLib ? resolve(globalThis.pdfjsLib) : reject(new Error('The local PDF reader did not start.'));
      script.onerror = () => { script.remove(); reject(new Error('Could not load the local PDF reader.')); };
      document.head.appendChild(script);
    }).catch(error => { pdfLibraryPromise = null; throw error; });
  }
  return abortable(pdfLibraryPromise, options.signal);
}

async function* decodePdf(file, options) {
  const pdfjs = await loadPdfLibrary(options);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../pdfjs/pdf.worker.min.js', assetBase(options)).href;
  const data = await abortable(file.arrayBuffer(), options.signal);
  checkAbort(options.signal);
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false });
  const destroyLoading = () => { Promise.resolve(loading.destroy()).catch(() => {}); };
  let pdf;
  try {
    pdf = await abortable(loading.promise, options.signal, { onAbort: destroyLoading });
    checkAbort(options.signal);
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages. Split it into files of ${MAX_PDF_PAGES} pages or fewer; no pages were scanned.`);
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      checkAbort(options.signal);
      progress(options, `Preparing PDF page ${pageNo} of ${pdf.numPages}…`);
      const page = await abortable(pdf.getPage(pageNo), options.signal);
      const canvas = document.createElement('canvas');
      let output;
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(4, MAX_IMAGE_SIDE / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!context) throw new Error('Your browser could not prepare this PDF page.');
        const rendering = page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' });
        await abortable(rendering.promise, options.signal, { onAbort: () => rendering.cancel() });
        checkAbort(options.signal);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const original = await canvasBlob(canvas, options.signal);
        checkAbort(options.signal);
        output = {
          pixels: { width: pixels.width, height: pixels.height, data: pixels.data }, original,
          sourceName: file.name || 'invoice.pdf', filePageNumber: pageNo,
          decode: { type: 'pdf', path: 'local-pdfjs', sourceWidth: base.width, sourceHeight: base.height,
            width: pixels.width, height: pixels.height, scale, rotation: page.rotate || 0,
            pageNumber: options.pageStart + pageNo - 1, filePageCount: pdf.numPages },
        };
      } finally {
        releaseCanvas(canvas);
        page.cleanup();
      }
      yield output;
    }
  } catch (error) {
    if (options.signal?.aborted || error.name === 'AbortError') throw abortError();
    throw error;
  } finally {
    if (pdf) await pdf.destroy();
    else await loading.destroy().catch(() => {});
  }
}

export async function* decodeFilePages(file, options = {}) {
  checkAbort(options.signal);
  if (!(file instanceof Blob) || file.size === 0) throw new Error('Choose an invoice PDF or photo first.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This invoice is larger than 30 MB. Choose a smaller original or split the PDF.');
  const pageStart = Number(options.pageStart ?? 1);
  if (!Number.isInteger(pageStart) || pageStart < 1) throw new Error('The starting page number must be a positive integer.');
  const settings = { ...options, pageStart };
  const signature = new Uint8Array(await abortable(file.slice(0, 5).arrayBuffer(), options.signal));
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '') || String.fromCharCode(...signature) === '%PDF-';
  if (pdf) yield* decodePdf(file, settings);
  else {
    progress(settings, 'Preparing this invoice photo…');
    yield await decodePhoto(file, settings);
  }
}

