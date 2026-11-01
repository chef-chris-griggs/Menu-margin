# Invoice scanner EvalError repair

Severity: high. Invoice photographs could be selected, but OCR failed before
reading any text. Existing recipe and price-book data were not involved.

## Cause

Commit `686479a95b399c3d2d99d837636911e9f1a4b4d8` added a Pages response
Content-Security-Policy to every asset. That included the dedicated scanner
worker. The bundled OpenCV runtime creates JavaScript functions during startup;
`wasm-unsafe-eval` alone does not permit those functions. A fresh-browser scan
of a generated fictional invoice reproduced the reported EvalError on the live
site. No login, upload, customer invoice or database request was used.

The earlier invoice-review tests stubbed OCR and did not serve the production
response headers, so they could not detect this deployment regression.

## Change

The exact `/vendor/scanner/scanner.worker.js` response receives its own policy,
allowing the function construction required by OpenCV. It can fetch only
same-origin resources and cannot create further workers. The document and all
other assets retain the original policy, including the prohibition on JavaScript
eval. Scanner algorithms, models, application data and payment integrations are
unchanged.

Pages combines matching headers, so the worker rule explicitly detaches the
inherited CSP before setting its replacement. Simply adding a second CSP would
leave the scanner broken. Syntax was checked against Cloudflare's actual parser;
the test server applies the same unset-before-set and append behavior documented
in the [Pages asset handler](https://github.com/cloudflare/workers-sdk/blob/main/packages/pages-shared/asset-server/handler.ts).

The service-worker shell cache version advances to `v2.0.2-scanner-csp`. This
refreshes cached worker responses carrying the old policy. It does not clear
localStorage, IndexedDB, account data or other applications' caches.

## Regression coverage

Run `npm run test:scanner:csp` and `npm run test:scanner:csp:webkit` after
`npm ci` and `npx playwright install chromium webkit`.

Both engines use the actual application, bundled OCR and generated fictional
JPEG at a mobile viewport. The tests:

- Reproduce EvalError with the previous response policy and cached worker.
- Install the updated service worker and wait for it to take control.
- Verify cached assets refresh while fictional local data and unrelated caches survive.
- Select the photo through the file input and click Read invoice.
- Verify a reviewable Butter row appears, with no prices selected for import.
- Restart OCR with HTTP unavailable and successfully read the photo again.
- Reject external requests and verify the page still blocks inline scripts.

These checks run in the existing pull-request regression workflow. They cover
WebKit engine behavior; they do not claim physical iPhone device validation.

## Release controls

This is a proposed code repair. Merge and production deployment require the
owner's explicit approval. No database migration or Stripe change is needed.
After an approved deployment, verify the deployed worker has exactly one CSP
with the worker exception, the document remains strict, and a fictional invoice
scans on the deployed site and an existing installed copy after refresh.

Do not instruct users to clear site data: that may contain unsynced work.
Rollback of the worker exception would reintroduce this failure. Any rollback
must preserve a compatible worker policy and advance the shell cache version
again so cached response headers are refreshed.
