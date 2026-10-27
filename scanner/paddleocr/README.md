# MenuMargin positioned PaddleOCR adapter

This directory restores the official PaddleOCR.js SDK 0.4.2 TypeScript sources
from the npm distribution's source maps. Original PaddlePaddle copyright notices
are preserved. Source: <https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js>.

MenuMargin modifications preserve CTC character emission runs, their confidence,
and the crop geometry that upstream's line-only result discards. Each line still
has `poly`, `text`, and `score`. It now also includes `words` and `characters`
with their polygons, scores, and `positionSource: "ctc"`.

The positions come from actual CTC timestep alignment, corrected for recognition
and batch padding, then projected through the inverse perspective crop transform.
They are alignment-derived estimates; they are not separate detector boxes and
are not calculated by spreading a line's characters equally across its width.
`alignmentClipped` records emissions extending into the padded input region so
the review layer can flag them instead of silently discarding them.

Use `initOpenCvRuntime()` from `index.ts` for the same OpenCV singleton as OCR.
It resolves `{ cv }`. A host-owned worker should use `PaddleOCR.create` with
`worker: false`, pass a `cv.Mat` to `predict`, and set `textRecScoreThresh: 0`
so low-confidence text remains available for review. There is no hosted inference.

Meaningful decoder/geometry checks:

```sh
node --test scanner/paddleocr/ctc.test.mjs
```

These checks verify alignment mechanics only. Real invoice extraction accuracy
must be measured separately using the application's sample runner.
