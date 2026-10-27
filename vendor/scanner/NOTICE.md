# MenuMargin local scanner — third-party notice

This scanner runs third-party software and pretrained models on the user's
device. The files in this directory are self-hosted; they do not call a remote
invoice-processing service. All original licenses continue to apply.

## PaddleOCR and model weights

- PaddleOCR.js SDK 0.4.2, Copyright 2026 PaddlePaddle Authors.
- PP-OCRv5 mobile detection and dedicated English recognition models.
- License: Apache-2.0; [full text](licenses/PaddleOCR-Apache-2.0.txt).
- SDK source: <https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js>.
- Exact model URLs, lengths and SHA-256 values:
  [models/manifest.json](models/manifest.json).

MenuMargin restores the SDK TypeScript sources under
`scanner/paddleocr/` and modifies recognition decoding to preserve CTC emission
positions/confidence and inverse crop geometry. Recognition words remain
alignment-derived estimates rather than independent word detector boxes. The
adapter also selects the CPU WASM import. The modified source, preserved
copyright headers and focused tests are included in the repository.

## Browser inference and image processing

| Component | Version | License/notices |
| --- | --- | --- |
| ONNX Runtime Web | 1.22.0 | Microsoft Corporation; [MIT](licenses/onnxruntime-MIT.txt), [upstream third-party notices](licenses/onnxruntime-ThirdPartyNotices.txt) |
| OpenCV.js / Techstark wrapper | 4.10.0-release.1 | OpenCV contributors and package authors; [Apache-2.0](licenses/OpenCV-Apache-2.0.txt) |
| Clipper JavaScript | npm 6.4.2, internal 6.4.2.2 | Angus Johnson 2010–2017 and Timo; [attributions](licenses/clipper-lib-NOTICE.txt), [Boost Software License 1.0](licenses/Boost-1.0.txt) |
| JSBN subset used by Clipper | bundled with Clipper | Tom Wu 2003–2005; [copyright, permission and disclaimer](licenses/JSBN-Tom-Wu.txt) |
| js-yaml | 4.3.2 in the lockfile | [MIT](licenses/js-yaml-MIT.txt) |

The following additional dependency notices are retained from the installed
inference dependency tree, even where bundling removes unused code:
[platform MIT](licenses/platform-MIT.txt),
[long Apache-2.0](licenses/long-Apache-2.0.txt),
[protobufjs BSD-3-Clause](licenses/protobufjs-BSD-3-Clause.txt) and
[FlatBuffers Apache-2.0](licenses/flatbuffers-Apache-2.0.txt).
The complete dependency versions and integrity values are pinned in
`package-lock.json`.

Source projects:

- <https://github.com/microsoft/onnxruntime/tree/v1.22.0>
- <https://github.com/Techstark/opencv-js>
- <https://github.com/opencv/opencv/tree/4.10.0>
- <https://sourceforge.net/projects/jsclipper/>
- <https://github.com/nodeca/js-yaml>

## HEIC / HEIF decoder

The lazy-loaded `heic-decoder.js` module contains:

- heic-to 1.6.7 by Hopper Gee. Package metadata says LGPL-3.0; its
  [included license](licenses/heic-to-LGPL-3.0.txt) grants LGPL version 3 or later.
- libheif 1.23.7 and libde265 1.0.16, as declared in the first line of the
  supplied `heic-to/src/lib/libheif.js` source.
- [libheif license texts](licenses/libheif-LGPL-3.0.txt),
  [libde265 license texts](licenses/libde265-LGPL-3.0.txt),
  [GNU GPL version 3](licenses/GPL-3.0.txt) incorporated by LGPL version 3,
  and [Emscripten runtime license](licenses/Emscripten-LICENSE.txt).

Matching declared source archives, checksums, upstream build script and
replacement instructions are supplied in [source/](source/README.md).
The decoder remains a separate replaceable module; invoice OCR does not depend
on modifying or concealing it. Preserve the source and license materials when
redistributing the module, and permit replacement/debugging as required by its
upstream license. No proprietary app term in this repository overrides those
upstream rights.

The upstream package does not identify its exact Emscripten compiler revision.
The supplied sources match the declared library versions; a bit-identical WASM
rebuild has not been established. This notice records that provenance limit and
does not certify a complete commercial-distribution review.

## Other app libraries

PDF.js and the Supabase JavaScript client are recorded in
[../LICENSES.md](../LICENSES.md). Older Tesseract and HEIC2Any files may remain
in the repository for previous releases; the positioned scanner does not use
them. Do not infer that a legacy trained-data file is part of PaddleOCR.

This file preserves attribution and source information. It does not change any
upstream license or make an OCR accuracy/release-readiness claim.
