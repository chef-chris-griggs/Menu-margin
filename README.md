# MenuMargin

**Recipe costing, supplier prices and invoice scanning for busy kitchens.**

MenuMargin helps you cost dishes, maintain an ingredient price book and see how
buying-price changes affect your recipes. It works in a mobile or desktop
browser and can be added to a phone’s Home Screen when hosted over HTTPS.

This folder contains the **2.1.3 email-protection candidate**. The working scanner is
preserved; this update adds safer cloud saves, exact-name recipe price updates,
VAT warnings and account controls. Payment collection remains switched off.

## What you can do

| Screen | Purpose |
| --- | --- |
| **Cost** | Enter a dish, portions and ingredient quantities. See batch cost, cost per portion, food cost %, GP and a target selling price. |
| **Recipes** | Save, open, rename and delete recipes. Download or restore a complete JSON account backup. |
| **Prices** | Keep supplier buying prices, product codes, pack sizes, VAT labels and previous price history. Add an ingredient straight to a recipe. |
| **Scan** | Read a supplier invoice PDF or photo, compare products with the source image and import only the rows you select. |

Recipe costing supports weight, volume and individual items, including
conversions within each measurement type. CSV exports and print/PDF views are
also available.

## Start with your first recipe

1. Open the hosted app and sign in.
2. Choose **Cost**, enter a dish name and the number of portions in the batch.
3. Add ingredients. Enter the **amount used in the whole batch**, the size of
   the pack you buy and its total price. You can also choose **Add to recipe**
   from the price book.
4. Check the ingredient units, selling price and any warnings.
5. Choose **Save recipe** and check whether it was saved on this device or
   confirmed in your cloud account.

For example, a case containing **6 × 1 kg** costs **£24**. Its total size is
**6 kg**, so **250 g used in a batch costs £1**. Enter the whole case price,
not the price of one item in the case.

GP uses the entered ingredient costs and an **excluding-VAT selling price**.
Labour, overheads and waste are not included in the displayed food-cost GP.

## Update prices from an invoice

1. Choose **Scan** and select the invoice PDF, JPG, PNG or HEIC photo. Select
   related pages together for a multipage invoice.
2. Choose **Read invoice**. The first scan downloads the recognition files,
   so allow time and a working connection.
3. Compare the product names, pack sizes, quantities and prices with the photo.
   Correct missing or unclear fields and resolve the highlighted checks.
4. Tick only the products you want to import and complete the required photo
   confirmation. Rows start unchecked.
5. Import the selected products. Existing matching supplier items update their
   price and retain the previous price/pack details in history.

Recognition runs **on the device** using PaddleOCR and OpenCV. A Mac service
or paid invoice-processing API is not needed. MenuMargin does not upload the
invoice photo or full OCR word output. Selected price-book entries, invoice
references and price history use the account save/sync flow.

Recognition is followed by a review step: uncertain values, missing fields and
arithmetic mismatches require attention. A clear review result is not a
guarantee that every field on every supplier invoice is correct.

## How recipe prices stay current

A recipe ingredient can link to the supplier item in your price book. Confirmed
changes to that item’s price or pack size recost the linked recipes without
changing the ingredient quantities, dish names or portions.

Names must match **exactly, ignoring capitals and extra spaces only**:

- `BUTTER`, `Butter` and `  Butter  ` count as the same name.
- `Salted butter`, `Butter unsalted`, `Buter` and `Butter!` stay separate.
- Different suppliers and different known product codes are not silently merged.
  If several compatible items have the exact name, choose the intended item.

A unique exact-name legacy ingredient can link automatically. Once linked, it
stays with that supplier item. Choose **Use own price** to deliberately stop
automatic updates for an ingredient. Missing, renamed or incompatible supplier
items show a warning and retain a saved-price fallback.

Other phones fetch changed prices through **Refresh & sync** or when returning
to the app. This is not an instant push to every already-open device.

## Email delivery before launch

The owner hit an email-sending rate limit during recovery testing. The app now
prevents duplicate requests, preserves a 60-second resend cooldown across page
reloads and explains server quota errors. The cooldown does not increase or
reset the email service’s quota. A real-email recovery retest remains pending.

If the project uses Supabase’s built-in sender, its documented allowance is
currently two emails per hour for the whole project, with recipients restricted
to project-team addresses. That sender is intended for setup/testing. Connect a
production SMTP service before opening signup to customers. The support Gmail
inbox does not automatically configure authentication-email delivery.

See [email delivery setup](docs/EMAIL-DELIVERY.md) for the required owner steps.

## Reset your password

From sign-in, enter your email and choose **Forgot password?**. Open the newest
reset email: a valid link displays **Choose a new password** with a confirmation
field. After updating, sign in using the new password. Expired or used links
show instructions to request a fresh email. The 2.1.2 recovery change has passed
browser tests; the real-email retest remains a release check.

## VAT, saving and recovery

- **Prices stay as entered.** Mark prices as including VAT, excluding VAT or
  unconfirmed. MenuMargin warns about inclusive/unknown ingredient prices when
  showing GP. It does not guess a VAT rate or deduct VAT automatically.
- **Device saves and cloud saves are different.** A device save stays queued
  until the server confirms it. Use **Refresh & sync** after reconnecting and
  before relying on another device’s copy. Interrupted cloud loads keep the
  previous device snapshot. Conflicting edits can be preserved as copies.
- **Keep an independent backup.** In Recipes, choose **Download backup** for
  recipes, supplier prices, links, VAT basis and price history. A CSV is useful
  for viewing data but is not a complete account backup.
- **Shared device?** Open **Account & privacy** to select removal of this
  account’s device copy at sign-out. Unsaved edits, pending changes and recovery
  drafts must be dealt with first. Normal sign-out keeps an account-specific
  copy for recovery; MenuMargin does not encrypt that browser copy itself.

Offline use depends on a cached app, cached recognition files and an available
sign-in session. Browser storage can be removed or evicted. Do not clear site
storage to install an update while it contains unsynced work.

## Run this copy

**On a Mac:** keep the complete folder together and open
`Start MenuMargin.command`. It starts a localhost preview and opens the app.
Keep that terminal window running while using the preview. It needs Python 3;
Python serves the files only, while scanning runs in the browser.

**On a phone:** use an HTTPS-hosted copy. A Mac’s localhost link cannot be opened
on the phone. Use your browser’s Add to Home Screen option to install the
hosted app.

Opening `index.html` directly through `file://` is not a supported scanner
setup. When publishing to GitHub Pages, upload the **whole app**, including
`js/`, `styles/`, `icons/`, `vendor/`, the manifest, service worker and customer
information pages. Uploading only `index.html` will not work. Private invoice
samples, debug reports, credentials and `node_modules` must stay out of the
published files.

## Verified in this candidate

| Check | Latest local result |
| --- | --- |
| Unit tests: extraction, values, OCR alignment, review rules, recipe pricing and cloud data | **74 passed, 0 failed** |
| Invoice review/import | **24 checks passed in Chromium and 24 in WebKit** |
| Recipe price updates and backups | **18 checks passed in each browser engine** |
| App startup, cloud refresh, save failures, VAT and device privacy | **21 checks passed in each browser engine** |
| Real HEIC scan, online and offline | **Passed; the same 4 rows were returned** |
| Scanner cancellation, retry, duplicate handling and offline help | **Passed** |
| Protected scanner source/runtime files | **73 of 73 unchanged against c477122** |
| Password recovery with real Supabase browser library | **16 checks passed in each browser engine, using synthetic auth responses** |
| Owner phone test and two-account screen separation (2.1.1) | **Reported working on 29 October 2026** |
| Active database RLS/owner-policy configuration | **Reviewed from supplied SQL results on 29 October 2026** |

The browser interaction tests use synthetic cloud/auth data. The real-invoice
check above covers one existing private BPM invoice; it is not an accuracy
percentage for unseen invoices. WebKit tests are useful Safari-engine coverage.
The owner has since reported that the phone app works and that neither of two
accounts displays the other account’s saved data. This is a manual app test; it
does not by itself prove that direct database/API requests are denied. The
supplied SQL results also confirm RLS is enabled and owner boundaries are
configured on both tables; a direct API denial test remains separate. Extended
phone/Android, email recovery and upgrade checks remain on the release checklist.

Before public sign-off, complete the **live two-account database privacy test**,
**actual-phone and email-recovery checks**, and **operator review of customer
policies and deletion/retention procedures**. These are recorded separately so
a passing local test is not confused with a completed launch check.

- [Launch audit and evidence](docs/LAUNCH-READINESS.md)
- [Remaining real-device and live-account checks](docs/TEST-BEFORE-LAUNCH.md)
- [Developer setup, scanner architecture and test commands](docs/DEVELOPMENT.md)

## Support and privacy

Support, privacy enquiries and account-deletion requests:
**[admin.menumargin@gmail.com](mailto:admin.menumargin@gmail.com)**.
Never email your password or sign-in tokens.

The app includes [help](help.html), [privacy information](privacy.html) and
[terms](terms.html). The public operator/contact settings are in
`js/site-config.js`. Request account deletion through support; identity must be
verified before action. Removing a device copy does not delete the cloud account.

Third-party notices and matching source materials are included under
[vendor/](vendor/LICENSES.md), including the scanner’s
[NOTICE](vendor/scanner/NOTICE.md). Keep those materials when distributing the
app.
