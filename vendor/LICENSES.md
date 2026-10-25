# Third-party assets

MenuMargin bundles these pinned browser libraries locally so the app and invoice scanner do not depend on public CDN availability.

| Package | Bundled version | Licence / notices |
|---|---:|---|
| Supabase JavaScript client | 2.49.1 | MIT — [license](./licenses/supabase-js-MIT.txt) |
| PDF.js | 3.11.174 | Apache-2.0 — [upstream license](./licenses/pdfjs-Apache-2.0.txt) |
| Tesseract.js | 5.1.1 | Apache-2.0 — [upstream project](https://github.com/naptha/tesseract.js); bundled `regenerator-runtime` notice — [notices](./licenses/tesseract.js-bundle-notices.txt) |
| Tesseract.js core | 5.0.0 | Apache-2.0 — [upstream project](https://github.com/naptha/tesseract.js-core) |
| English OCR trained data | 4.0.0 | Tesseract language data; distributed under Apache-2.0 |
| HEIC2Any | 0.0.4 | MIT — [license](./licenses/heic2any-MIT.txt) |

The Apache-2.0 text is included at [APACHE-2.0.txt](./licenses/APACHE-2.0.txt). Source projects and version pins are recorded here so the bundled files can be updated deliberately.
