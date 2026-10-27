# MenuMargin

Mobile recipe costing, saved recipes and a supplier price book. This branch
contains an experimental replacement invoice scanner using PaddleOCR models and
OpenCV inside the browser.

**The scanner is not release-ready. The real-invoice regression report still
contains mismatches. Passing unit or review-screen tests does not establish OCR
accuracy.** Read the current per-field report before describing a build as fixed.
No deployment or paid-launch approval is implied by this source folder.

## What the app does

- Recipe costing with mass, volume and each conversions, portions, food cost,
  GP, target selling prices, CSV and print/PDF.
- Account-scoped recipe and price-book saves, offline change queues, conflict
  copies and JSON backups.
- Supplier prices with product codes, pack composition, explicit VAT basis and
  previous price/pack history. Existing recipes retain their saved price
  snapshots when the price book changes.
- A mobile four-tab layout and a static PWA shell.

## Invoice scanner architecture

The scanner runs independently on each phone. A Mac service, Python server,
paid OCR account and remote invoice-processing API are not required. GitHub
Pages can serve the browser files over HTTPS.

The local worker uses:

1. Image orientation metadata, OpenCV paper-edge detection and perspective
   correction where a reliable page boundary is found.
2. Grayscale/shadow cleanup, adaptive thresholding and size normalization.
   Preprocessing fallbacks remain visible as review warnings.
3. PaddleOCR PP-OCRv5 mobile detection and the dedicated English recognition
   model through ONNX Runtime Web CPU WebAssembly. The English model includes
   the GBP character. OCR runs one page at a time with one WASM thread.
4. Word boxes and confidence derived from the recognizer's CTC alignment,
   including recognition padding and inverse crop geometry. Detector line
   boxes are preserved. Words are not placed by equally spacing a flat string.
5. Positioned table-row grouping and header-based column assignment, followed
   by per-cell GBP parsing and arithmetic checks. Full OCR text is not passed
   through a regex product parser.

The reader distinguishes cases, loose items and weighed purchases. A printed
case composition does not turn a loose-item price into a full-case price.
Invoice references are kept separate from delivery-note and order references.
Multi-page photos belonging to one invoice should be selected together; a
subtotal printed on the last page cannot reconcile an incomplete selection.
Different invoice references and duplicate printed page numbers block review.
A name-only band is retained for review rather than appended to the previous
product. Positive cases together with positive loose units require the priced
quantity and pack to be resolved explicitly.

Some bounded, per-cell recoveries require review even when a value is retained:
an unclear GBP symbol, a litre unit read as `1tr`, or extra punctuation before
an otherwise explicit decimal. Original tokens and warnings remain available.
The scanner never inserts a missing price decimal or scales a whole-pound
amount down by 100. Unreadable cells may receive one bounded recognizer retry
using the adaptive image, capped at 12 cells per page; there is no repeated
full-page OCR loop.

## Review and privacy

The review screen shows the original/cleaned page alongside editable rows on
desktop. Phones can switch between the photo and products. Source highlighting
uses cleaned-image coordinates and is never drawn onto an uncorrected original
photo.

Every import selection starts unchecked. A row must have valid price-book
fields and an explicit photo check before it can be imported. Close product
name matches require a choice; different known supplier codes are not merged
by fuzzy name matching. Updating a price preserves the previous price, pack
composition and VAT basis in history.

Invoice photos and OCR word data stay on the device. Only selected price-book
entries and their price history use the existing account save/sync flow.
Original and cleaned scan images are held for the current review and released
when cleared or signed out. The user can explicitly download a cleaned image
or OCR debug JSON. Local regression tests also save debug files on the
developer's computer.

The first scan downloads the self-hosted worker, model and WASM files from this
site. The current asset manifest contains about 38 MB including the optional
HEIC decoder; see [the exact file sizes and checksums](vendor/scanner/assets.json).
Allow time and memory for this first load. Subsequent offline use depends on
the relevant assets having been cached successfully. Browser storage can be
evicted, so cached models and an installed PWA are not a promise that every
offline session or account sign-in will succeed.

## Install, build and serve

The generated browser assets are included under `vendor/scanner/`. After
changing scanner source, rebuild them:

    npm ci
    npm run build:scanner

The pinned detector and recognizer archives are included under
`vendor/scanner/models/`; their upstream URLs, sizes and SHA-256 hashes are in
[the model manifest](vendor/scanner/models/manifest.json). Runtime dependencies
and third-party source/notices are self-hosted. No production CDN imports are
needed.

Serve the project from `localhost` for development, for example:

On the owner's Mac, double-click `Start MenuMargin.command` for a local preview.
This optional Python host only serves app files; OCR runs in the browser. It
blocks invoice samples, debug data, Git files and developer directories.
Alternatively:

    python3 -m http.server 8080 --bind 127.0.0.1

Then open `http://localhost:8080/`. Opening `index.html` through `file://` does
not provide a reliable worker/service-worker environment. For phones and public
hosting, use HTTPS and publish the complete app folders, including every
referenced scanner/model/WASM asset. Uploading only `index.html` is insufficient.

## Tests and accuracy

Install the two browser engines used by the regression checks:

    npx playwright install chromium webkit

Offline/cache and retry checks:

    npm run test:offline
    npm run test:offline:webkit

Chromium uses simulated browser offline mode. Playwright WebKit's offline
emulation also blocks in-memory Blob reads, so its test stops the HTTP origin
instead and verifies cached assets with a fresh OCR worker. Neither replaces
an actual iPhone airplane-mode and memory/performance test.

Run the deterministic extraction/value/CTC and price-book review rules:

    npm run test:unit

Run the synthetic review/import interaction checks:

    npm run test:review
    npm run test:review:webkit

These review checks cover selection, required acknowledgement, confirmed close
matches, price history, pack semantics, cancellation, debug downloads, source
highlight coordinates and mobile layout. They do not run OCR on real invoices.
WebKit provides useful Safari-engine coverage; it does not replace testing on
an actual iPhone with its memory and performance constraints.

Check original HEIC decoding, generated EXIF rotation/mirroring, image limits,
PDF page numbering and rejection/cancellation:

    npm run test:decode
    npm run test:decode:webkit

These use the five private original HEIC fixtures. A fresh checkout can run only
the generated orientation/JPEG/PDF cases with `npm run test:decode -- --skip-private`;
that is not a passing real-HEIC or OCR test.

Run actual OCR on every private invoice sample:

    npm run test:scanner
    npm run test:scanner:webkit

The default scanner test uses the original HEIC files. To isolate image decoding
from OCR while investigating a failure:

    npm run test:scanner -- --jpeg
    npm run test:scanner -- --only=IMG_2385

The test runner prints each mismatch and per-field accuracy, including missing
rows in the denominator. It compares against the previous report only when the
expected-data hash is unchanged, so an altered ground truth cannot silently
appear as an accuracy improvement. It also checks the combined Bidfood invoice
across all three pages.

After each scanner change, run this real-sample report and compare the per-field
deltas. Keep failures visible. Do not substitute a passing synthetic unit test
for the real-invoice accuracy gate.

### Private samples and debug output

The local `samples/` folder contains original photos, orientation-corrected
JPEG copies and independently transcribed expected JSON. See
[samples/README.md](samples/README.md) for the schema and page-group rules.
The real photos, expected values and manifest are excluded from Git so they do
not enter the published app. A fresh checkout needs those private fixtures
restored locally before the real-invoice tests can run.

Cleaned images, word-box overlays, positioned JSON, accuracy reports and review
screenshots are written under the ignored `scanner-debug/` folder. The sample
harness serves them locally and rejects external requests; invoices are not
sent to a remote OCR service.

## Supabase setup

Apply the migrations in filename order from `supabase/migrations/`. The first
migration creates the recipe, price-book and billing tables with per-user
row-level security. The feature-switch migration leaves billing off while the
Stripe account is prepared.

The browser contains only the Supabase project URL and publishable key.
Secrets and service-role keys belong in server secrets, never browser code.
Confirm the Auth redirect allow-list contains the deployed app URL. Live
database policies, account isolation, Auth redirects and recovery still require
checks against the owner's actual project before launch.

## Stripe setup before charging

1. Create the £9.99 monthly price and confirm the 14-day trial.
2. Add the Stripe secret, price ID, webhook secret, Supabase server credentials
   and deployed app URL to Edge Function secrets.
3. Deploy `create-checkout-session`, `create-portal-session` and
   `stripe-webhook`; configure subscription and invoice-payment events.
4. Verify checkout, cancellation, webhook replay and access enforcement before
   enabling billing:

       update public.menu_margin_app_config
       set billing_enabled = true, updated_at = now()
       where singleton = true;

The browser cannot change that feature switch. Database access must enforce the
server-owned subscription state after billing is enabled.

## Third-party notices

See [vendor/LICENSES.md](vendor/LICENSES.md) and the scanner-specific
[NOTICE](vendor/scanner/NOTICE.md). PaddleOCR/OpenCV/ONNX and their models remain
under their upstream licenses. The separate HEIC decoder includes LGPL-covered
libraries; its license texts, matching declared source versions and replacement
instructions are supplied under `vendor/scanner/`. Preserve those materials
when distributing the app.
