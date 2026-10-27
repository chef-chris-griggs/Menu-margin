# HEIC decoder source and replacement

The browser fallback decoder is built from heic-to 1.6.7. Its source header
declares:

    Build from libheif 1.23.7 with LIBDE265_VERSION=1.0.16

The following source distributions are supplied alongside the module:

- [heic-to-1.6.7.tgz](heic-to-1.6.7.tgz): exact npm package, including wrapper
  source, libheif JavaScript/WASM payload, license and esbuild script.
- [libheif-1.23.7.tar.gz](libheif-1.23.7.tar.gz): upstream release source.
- [libde265-1.0.16.tar.gz](libde265-1.0.16.tar.gz): upstream release source.
- [libheif-build-emscripten.sh](libheif-build-emscripten.sh): upstream build script
  from the libheif 1.23.7 tag. Its default libde265 version differs; override
  `LIBDE265_VERSION=1.0.16` to select the version declared in the supplied bundle.

[manifest.json](manifest.json) records retrieval URLs, byte lengths and SHA-256
checksums for these files and downloaded notices.

The MenuMargin binding is readable source at `scanner/heic-decoder.js`.
It imports heic-to's CSP build and exports `decodeHeic(blob)`, which returns a
JPEG Blob. `scanner/decode.js` loads the built module lazily.

To modify or replace the JavaScript wrapper:

1. Extract the heic-to source archive into a working directory, make changes
   to its `src/` files and rebuild using its supplied `esbuild.mjs` and
   `package.json`.
2. Install that replacement package in the MenuMargin working tree, or adjust
   the import in `scanner/heic-decoder.js` to a compatible replacement.
3. Run `npm run build:scanner`. This emits the separate
   `vendor/scanner/heic-decoder.js` module.
4. Run the original-HEIC sample tests and decode checks before distributing the
   replacement. Keep the applicable source, copyright and license notices.

To modify the codec itself, use the libheif/libde265 release sources with an
Emscripten toolchain and the supplied upstream build script. Its documented
`USE_ES6`, `USE_WASM`, `USE_UNSAFE_EVAL` and library-selection options control
the generated JavaScript/WASM. The CSP wrapper uses the no-unsafe-eval build.
Then substitute the resulting library in the heic-to source and rebuild the
wrapper/module.

The original package does not state its exact Emscripten compiler revision or
all binary build environment details. These instructions support replacement;
they do not assert a bit-identical recreation of the upstream binary. The
included LGPL/GPL texts govern the corresponding upstream code.
