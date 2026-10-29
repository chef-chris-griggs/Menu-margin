# Tests still needed before public launch

The candidate changes no database schema and does not enable payments. Existing
scanner source, models and runtime binaries are unchanged. Do not clear site
storage to update: it can contain unsynced work. Download a JSON account backup
before testing upgrades or deletions.

## Database isolation — app/policy checks passed; direct API test pending

The owner reported separate saved data across two accounts and supplied catalog
results showing RLS enabled and restrictive owner boundaries on both tables.
These checks passed on 29 October 2026. The direct API test below has not run.

1. For further catalog checks, run `scripts/audit-account-security.sql` in the project's Supabase SQL Editor.
   It contains only SELECT statements. Both app tables need RLS enabled and an
   owner boundary. Seeing policies in the catalog is not a complete access test.
2. Use two disposable, verified test accounts in the intended project. Do not
   reuse a customer's account. Each must have normal app access; do not grant a
   service role or change billing state to make the test pass.
3. A developer can set `MM_TEST_SUPABASE_URL`, `MM_TEST_PUBLIC_KEY`,
   `MM_TEST_TOKEN_A` and `MM_TEST_TOKEN_B` in a local process and run:

       npm run test:account-isolation -- --disposable-accounts

   The tokens are the two temporary account access tokens. Never paste passwords
   or tokens in chat, put them in GitHub, or send them in support email. The test
   checks owner access, cross-account and anonymous denial, and ownership
   reassignment. It creates and cleans up generated test rows only. It cannot
   certify every database function, recovery backup or hosting configuration.
4. Verify account deletion removes the user's recipe/price rows as intended
   (foreign-key behavior in an existing database must be checked, not assumed
   from CREATE TABLE IF NOT EXISTS). Document the operator's deletion and backup
   retention process before responding to real requests.

## Actual iPhone and Android

Use an HTTPS test deployment of this exact candidate. The local Mac preview is
useful for review, but a phone cannot reach the Mac's `localhost`. Test deployments
must contain all app/model/WASM files and exclude samples, debug reports and
credentials. Do not replace the public app until the checks below are reviewed.

1. Create a test account, follow its verification link, sign in and use Forgot
   password. Confirm emails arrive and links return to the correct site. Check
   Supabase's permitted redirect URLs if they do not. Verify the support inbox
   receives mail; the app's mail link only opens a compose window.
2. Save a recipe and a supplier price. Open the same account on a second device
   and use Refresh & sync. Import a reviewed price change for the exact same
   ingredient and supplier. Confirm both devices recost the linked recipe, keep
   ingredient quantities and retain price history. Similar names must stay
   separate; capitalization and extra spaces should match.
3. On device B type an unsaved quantity, update the price on A, then refresh B.
   Its quantity must remain. Change the same saved recipe on both devices and
   confirm a conflict copy preserves both versions. Delete a test recipe on A
   while editing it on B and check recovery without resurrecting the old ID.
4. Lose the connection while saving and reload the app. Device saves must remain
   recoverable, pending work must sync on reconnect, and failed saves must not
   claim success. Test offline after assets are cached; cold offline sign-in and
   storage eviction are not guaranteed. Do not delete the original device copy
   during this test.
5. Download a JSON backup, restore it into a disposable account, and verify
   recipe quantities, supplier links, prices, VAT basis and price history. A
   second restore must not silently downgrade current supplier prices. An
   unsupported/malformed backup must show what was skipped or rejected.
6. Test Remove this account's device copy when signing out: unsaved/queued work
   blocks removal. After saving/syncing, sign out and check private screens and
   local account caches are cleared. Other accounts' device copies must remain.
   Reopen and confirm the old session does not return.
7. Use small-screen portrait/landscape, larger text, the number keyboard and an
   installed Home Screen app. Check ingredient editing, VAT warnings, navigation,
   print/CSV, support pages and updates from the previous installed version.
8. Scan original invoices on the actual phones, including HEIC, multipage and
   low-memory conditions. Confirm cancellation/retry, exact-name import, source
   photo review and totals. The browser-engine smoke test is not an accuracy
   claim for unseen invoices or an actual iPhone performance test.

## Customer information

`js/site-config.js` contains the public operator name and dedicated support inbox:
`admin.menumargin@gmail.com`. The owner still needs to confirm the operator's
full legal identity, actual Supabase hosting/transfer and backup-retention
details, the support/deletion process and the accuracy of the privacy/terms
pages. The generated pages are a reviewable starting point, not a legal
compliance certification. Add subscription-specific terms when enabling payment.

## Release and rollback

The automatic regression workflow is prepared in `.github/workflows/regression.yml`.
It has been exercised locally through its test commands, not run by GitHub yet.
Keep the previous public commit (`c477122`) and a user-data backup available for
rollback. A rollback changes code; it must not erase users' device/cloud data.
Review the candidate diff and test evidence before publishing.
