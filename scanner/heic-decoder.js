// Kept as a separately built, lazy-loaded asset so JPEG/PDF scans do not load
// the HEIF decoder. heic-to/libheif is LGPL-3.0; see bundled vendor notices.
import { heicTo } from 'heic-to/csp';

export async function decodeHeic(blob) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('The HEIC photo is empty.');
  const jpeg = await heicTo({ blob, type: 'image/jpeg', quality: 0.94 });
  if (!(jpeg instanceof Blob) || jpeg.size < 100) throw new Error('The HEIC decoder did not return a valid image.');
  return jpeg;
}
