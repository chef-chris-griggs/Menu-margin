# iPhone-style workspace and scanner recovery

Approved for live release by the owner on 14 November 2026 after private preview review.
This branch contains the tested application assets and generated/synthetic public
tests. Private kitchen documents, account fixtures, OCR output, screenshots and
recovery evidence are excluded from both its contents and new Git history.

The app uses ingredient cards, Pack & price disclosures, a clearer margin summary
and a five-tab navigation bar. Recipe scanning requires explicit review and
supplier confirmation or manual whole-pack prices before import. Import never
saves a recipe automatically. Incomplete pricing withholds final GP figures.

The source candidate passed 41 available automated checks, including two runs of
127 unit assertions, Chromium/WebKit UI and OCR flows, supplied images locally,
offline behavior and disposable local/hosted database isolation. The public test
suite excludes private-image transcriptions; the synthetic invoice EACH case uses
invented prices and quantities. Missing legacy invoice fixtures, original iPhone
camera HEIC and real handwriting remain unverified. Do not advertise handwriting
accuracy. Chef confirmation remains essential.

No authentication, billing, Supabase schema/policy or marketing code changes are
included. Runtime assets are byte-identical to the reviewed, tested candidate.
No local-only preview adapter is included. Existing account/storage keys are kept.

Pre-release production reference: 37f70a78e1509417ff846f63d4486f14c9331542.
Remote rollback reference: rollback/pre-ios-scanner-release-20261114.
Rollbacks must preserve customer storage and cloud data; do not reset databases or
clear customer browser storage. Use a new cache revision for a rollback release.
