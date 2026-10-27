# Third-party assets

MenuMargin bundles its browser libraries locally. The current positioned
scanner uses PaddleOCR, OpenCV.js and ONNX Runtime Web; its attribution, model
origins, full license texts and HEIC source materials are in the
[scanner-specific NOTICE](./scanner/NOTICE.md).

| Current scanner component | Bundled version | Licence / notices |
|---|---:|---|
| PaddleOCR.js SDK and PP-OCRv5 mobile models | SDK 0.4.2 | Apache-2.0 — [notice and modifications](./scanner/NOTICE.md) |
| OpenCV.js | 4.10.0-release.1 | [Apache-2.0](./scanner/licenses/OpenCV-Apache-2.0.txt) |
| ONNX Runtime Web | 1.22.0 | [MIT](./scanner/licenses/onnxruntime-MIT.txt), [third-party notices](./scanner/licenses/onnxruntime-ThirdPartyNotices.txt) |
| Clipper JavaScript / JSBN subset | 6.4.2 | [Boost and Tom Wu terms](./scanner/NOTICE.md) |
| heic-to / libheif / libde265 | 1.6.7 / 1.23.7 / 1.0.16 | [LGPL/GPL texts and replaceable decoder source](./scanner/source/README.md) |

Other app dependencies and retained legacy assets:

| Package | Bundled version | Licence / notices |
|---|---:|---|
| Supabase JavaScript client | 2.49.1 | MIT — [license](./licenses/supabase-js-MIT.txt) |
| PDF.js | 3.11.174 | Apache-2.0 — [upstream license](./licenses/pdfjs-Apache-2.0.txt) |
| Tesseract.js (legacy, unused by current scanner) | 5.1.1 | Apache-2.0 — [upstream project](https://github.com/naptha/tesseract.js); bundled `regenerator-runtime` notice — [notices](./licenses/tesseract.js-bundle-notices.txt) |
| Tesseract.js core (legacy) | 5.0.0 | Apache-2.0 — [upstream project](https://github.com/naptha/tesseract.js-core) |
| English Tesseract trained data (legacy) | 4.0.0 | Tesseract language data; distributed under Apache-2.0 |
| HEIC2Any (legacy) | 0.0.4 | MIT — [license](./licenses/heic2any-MIT.txt) |

The Apache-2.0 text is included at [APACHE-2.0.txt](./licenses/APACHE-2.0.txt). Source projects and version pins are recorded here so the bundled files can be updated deliberately.
