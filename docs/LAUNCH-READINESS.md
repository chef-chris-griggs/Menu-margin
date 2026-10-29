# MenuMargin 2.1.3 email-protection candidate — 29 October 2026

Payment setup is deferred. This candidate is based on the owner's working
`c477122` (“updated scanner”), on isolated branch `codex/recipe-price-links`.
The public app and the GitHub Desktop checkout have not been replaced.

## Implemented and tested locally

| Original finding | Candidate behavior |
| --- | --- |
| Large cloud responses could be truncated | Counted, ordered pagination loads every page, including lower server caps. Errors, repeated rows and changing counts reject the read before replacing device data. |
| Refresh could overwrite edits or miss other devices' prices | Refresh & sync and app-resume refresh preserve the current editor. Remote supplier prices recost linked recipes. |
| Offline edits could overwrite another device's work | Pending writes retain their starting server version. Conflicting changes preserve a copy; stale deletes cannot silently remove newer work. Remote deletion preserves later local edits under a new recovery ID. |
| Save status could falsely report cloud success | Device, pending and confirmed cloud saves are distinguished, including lost connection, storage quota and saves made during an in-flight write. |
| Recipes kept old supplier-price snapshots | Stable supplier links use the current buying price. Exact names ignore capitals and extra whitespace only. Multiple suppliers require a choice; similar names cannot overwrite items. |
| Saved metadata could be lost during restore | Backup handling retains supplier links, VAT basis and price history; matching supplier IDs are remapped without downgrading current buying prices. Oversized ingredient lists are rejected instead of silently truncated. |
| VAT bases could be mixed without a warning | Prices stay exactly as entered, as requested. Manual rows have VAT labels; unconfirmed/inclusive ingredient prices produce GP warnings. VAT is not guessed or deducted. VAT basis is included in price CSV. |
| Sign-out kept a hidden device copy | Account settings offer removal of this account's device copy after safe sign-out. Unsaved edits, pending changes and recovery drafts block removal. Other accounts stay intact. Session errors do not pretend sign-out succeeded. |
| Customer support and privacy routes missing | Help, privacy, terms and manual account-deletion request instructions are accessible before signup and within the app. The dedicated inbox is admin.menumargin@gmail.com, configured in js/site-config.js. |
| Regressions had no automatic check | GitHub Actions workflow prepared for unit and synthetic browser checks. It is not deployed or proven on GitHub yet. |
| Help pages could overwrite cached app HTML | Navigation caching now keeps separate pages. Support pages remain available offline without replacing the app home. |

Device writes stage serialization and attempt to restore prior keys on a storage
error. This is not a transactional database or a guarantee against browser/OS
storage removal. A browser that discards local data can still lose unsynced work;
independent backups remain necessary.

## Scanner protection and evidence

No image preprocessing, HEIC decoder, PaddleOCR recognizer, table extraction,
model, runtime or scanner worker code was changed. SHA-256/content checks confirm
**73 of 73 protected scanner files unchanged** against c477122. The invoice
review/import layer was changed only for the requested exact-name matching.

| Test | Result | Evidence limit |
| --- | --- | --- |
| Unit extraction, values, CTC, review, recipe pricing and cloud data | 74 passed, 0 failed | Deterministic tests; not a general OCR percentage |
| Invoice review/import in Chromium | 24 checks passed | Synthetic OCR result, production review/import code |
| Invoice review/import in WebKit | 24 checks passed | Same limit; not an actual iPhone |
| Recipe pricing in Chromium and WebKit | 18 checks passed in each | Production code with synthetic account storage |
| Account/cloud/VAT/device privacy in Chromium and WebKit | 21 checks passed in each | Full production app scripts with synthetic auth/cloud; no live RLS proof |
| Real HEIC online/offline in WebKit | Passed: 4 rows identical | One existing private BPM invoice; not unseen-invoice accuracy |
| Scanner cancellation, retry and duplicate handling | Passed | Same real-photo smoke regression |
| Privacy navigation and offline help | Passed | Does not overwrite cached app home |
| External/upload requests during scanner regression | 0 | Local test origin with self-hosted assets |

Private invoice photos and debug files remain ignored and excluded from the
candidate archive. Test reports remain local in reports/ and scanner-debug/.
No customer records, paid state or live database policies were changed.

## Owner acceptance report — 29 October 2026

The owner reports that the phone app works and that two signed-in accounts do
not display each other's saved data. Record this as a passed manual phone/app
account-separation check. No passwords, tokens, account identities or customer
records were requested or captured to record the result.

The private phone-test copy is deployed separately from GitHub Pages:
https://menumargin-launch-phone-test.chrisgriggs2021.chatgpt.site
It uses the existing Supabase cloud accounts. The test Site is owner-private;
this is not a separate test database or a public release.

## Active database policy review — 29 October 2026

The owner supplied the SQL catalog results for both public app tables. Review
passed for the reported configuration:

- `recipes` and `price_book` both have row-level security enabled.
- Authenticated SELECT, INSERT, UPDATE and DELETE policies restrict access to
  `auth.uid() = user_id`. UPDATE checks apply to the resulting row as well.
- Both tables have the restrictive `menu margin owner boundary` for ALL commands,
  requiring a non-null signed-in user and that user's ownership, in both USING
  and WITH CHECK expressions.
- Restrictive subscription policies are present separately. They do not widen
  account ownership access. Earlier duplicate owner-only permissive policies
  are redundant, but the supplied expressions do not expose another account.
  No policies were removed or changed.

PostgreSQL combines applicable restrictive policies with AND, including the
owner boundary: [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html).
This is evidence from the owner's supplied catalog output, not an independently
executed API penetration test. Table grants, security-definer functions and
other exposed relations are outside this specific result. The opt-in direct
cross-account/anonymous API test remains unexecuted.

Email recovery, Android, storage eviction and upgrade scenarios were not
specifically reported in the owner's short acceptance message and remain
unverified.

## Still required for public sign-off

1. **Direct API isolation test.** The manual two-account app check and active
   RLS/owner-policy review have passed. An authenticated direct API negative
   test has not been executed. The opt-in disposable-account test is prepared. They require two real test sessions; do not use a service-role key
   or customer accounts. Database enforcement matters independently of browser
   filters: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
2. **Extended phones and email delivery.** The owner’s phone smoke test passed;
   complete the remaining scenarios in the supplied iPhone/Android checklist
   on an HTTPS candidate: keyboard, installed-app upgrade, memory, original
   invoices, offline recovery, two devices, signup/verification/password reset
   links and the support inbox. Browser-engine coverage does not replace this.
3. **Operator policy review.** Confirm the full operator identity, database region
   and any transfer details, real backup-retention and account-deletion processes,
   and the privacy/terms wording. The pages describe this implementation and use
   the supplied business/contact details; they are not legal certification. ICO
   guidance calls for clear privacy information at data collection:
   [right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/).
4. **Deployment review.** Run the CI workflow on GitHub and retain c477122 as the
   rollback code. Publish the whole app, never just index.html. Exclude private
   samples, credentials and debug reports. No new schema migration is required
   by these candidate features; direct API isolation testing remains separate from the passed policy review.

Use [TEST-BEFORE-LAUNCH.md](TEST-BEFORE-LAUNCH.md) for the exact remaining checks.
The original absence of pagination was checked against
[Supabase's documented response limit](https://supabase.com/docs/reference/javascript/select).
The candidate now paginates rather than assuming the live configured maximum.

The scanner's previous broader invoice accuracy reports are not superseded by
this smoke test. A confirmed older invoice can still replace a newer buying
price: the current workflow uses the prices the user explicitly reviews and
imports; no invoice-date ordering or guessed date extraction was added.

## Password recovery correction — 29 October 2026

The owner’s reset email returned to the older GitHub deployment rather than the
private test Site. The owner added the private Site’s redirect allow-list entry
in Supabase and confirmed it saved. The application also had a startup race:
a normal session event/getSession could enter the app during recovery.

2.1.2 captures recovery intent before SDK URL handling, keeps normal account
startup out of the recovery state, requires a matching validated session, and
shows a confirmed new-password form. It handles mismatches, API errors, reload,
expired/used links, cancellation and a sign-out failure after a successful
password update. Reset requests use a canonical same-app URL with a recovery
marker. No server-side recovery authorization is bypassed.

13 recovery checks passed in Chromium and 13 in WebKit using the actual
self-hosted Supabase SDK with synthetic intercepted auth responses. Service
workers are blocked in that isolated network fixture because WebKit worker
requests bypass Playwright routing; cached scanner/offline behavior is tested
separately with service workers enabled. Real-email delivery to the corrected
Site and a successful owner password update remain pending a fresh-email test.
The scanner source/runtime files and database policies were not changed.

If a fresh email still sends the owner to GitHub, inspect Supabase's reset
email template: it must use the verification link/RedirectTo, rather than a
hard-coded Site URL. See [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls)
and [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Email sending limit — 29 October 2026

After the recovery update, the owner reported “email rate limit exceeded” and
confirmed having only the dedicated Gmail inbox, without an owned domain. The
project’s SMTP settings have not been independently inspected. This error is
consistent with a server-side Auth email quota and is separate from the client
recovery-form correction.

2.1.3 adds in-flight/double-click protection, a 60-second local resend cooldown
that survives reload, and a specific server-email-limit message. It makes no
claim about when the server quota resets and never retries email automatically.
The client cooldown is a usability guard, not a substitute for server limits or
production SMTP. The actual Supabase SDK recovery fixture now passes 16 checks
in Chromium and 16 in WebKit, including synthetic quota errors. No real email
is needed for those fixture tests. Scanner source/runtime files are unchanged.

**Production SMTP setup is a launch blocker.** Supabase documents its built-in
sender as limited to two messages per hour across the project, restricted to
team recipients and not intended for production. Use a verified sender through
a production SMTP provider, and then repeat actual signup and reset tests. No
provider account, paid domain or SMTP credentials have been created or changed
by this work. See [EMAIL-DELIVERY.md](EMAIL-DELIVERY.md).
