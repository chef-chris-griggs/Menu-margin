# Mise en Price rebrand — 3 November 2026

Brand: **Mise en Price**. Slogan: **Prep it. Price it. Plate it.**

## Scope and compatibility

Continues the separate `rebrand/mise-en-price` branch and PR #7. PR #8 is an
alternative subset and should not be merged on top. Baseline production commit:
`bf2c0e1334e7a530e77b44293953e052e99f2927`.

The change updates app titles, icons, visible text, print/share labels, help,
privacy, terms, README and workflow display name. It refreshes the shell cache.
The new standalone `marketing/` site uses the same brand and links to
`https://menu-margin.pages.dev/` for login and trial signup.

Preserved: repository URL, app URL, PWA identity/scope, auth endpoints, form IDs,
local/session storage keys, backup format and download filenames. Scanner code,
models, review logic/styles, costing logic, auth, database code, Stripe functions
and `_headers` remain byte-identical to baseline. Some internal names and the
scanner's legacy failure message intentionally retain MenuMargin for compatibility.
The existing support inbox remains `admin.menumargin@gmail.com`; no unverified
replacement mailbox is advertised. No legal operator identity is inferred.

## Marketing website

`marketing/` is deployable as a separate static Cloudflare Pages project: no build
command; output directory `marketing` (when using this repository). All assets are
local. It has no JavaScript, trackers, payment forms, auth, cookies or database.
The example costing is explicitly illustrative, not an app screenshot. The
14-day/£9.99 offer matches the existing app copy; verify the live Stripe price
before promoting it widely. Recognition is not claimed to be error-free.

It can also be reviewed at `/marketing/` on the app's branch preview. Do not point
the new apex domain at the existing app project's root: that would serve the app,
not the separate marketing page. Do not replace the root app with this landing page.

## Domain activation — pending ownership verification

No purchase, DNS mutation, domain binding, canonical tag, redirect or new auth
allowlist entry is included. `miseenprice.co.uk` is a proposed destination, not
a claim of ownership or availability.

1. Chris must purchase/confirm control of the domain and approve any paid purchase.
2. In the correct Cloudflare account, create a separate static Pages marketing
   project using this reviewed commit and the `marketing` output directory.
3. Verify the preview, then add the owned apex and (optionally) `www` through Pages
   Custom domains. Follow the provider's DNS instructions and wait for TLS.
4. Verify apex/www HTTPS, assets, legal links and all app buttons. The app stays at
   its existing URL. No auth, billing return URL or local-storage migration is needed.
5. Only once ownership, HTTPS and content are verified, remove the noindex meta,
   replace robots.txt with an allow policy, and add the verified canonical URL,
   social URL and sitemap. Commit and test those activation changes separately.

## Dashboard branding work requiring access

Cloudflare and Supabase dashboard sessions were signed out during this run.
The Stripe connector exposed only `menumargin sandbox`, not the live account.
No credentials, live payment objects, subscription settings or customer data were modified.
The existing sandbox product was renamed from MenuMargin pro to Mise en Price pro;
a read-back confirmed the same product and price IDs, GBP 999 minor units/month
and price configuration. No test payment or subscription was created.

### Cloudflare

Keep the `menu-margin` Pages project and its pages.dev address so existing
bookmarks, installs and redirects continue working. App presentation comes from
the GitHub deployment. Configure only the separate marketing project after the
domain step above. Do not rename/move the existing app or change its environment.

### Stripe live account

Read the live account and the existing subscription product first. Update only
the public trading/display name and the existing product's customer-facing name
to Mise en Price where the dashboard/API permits. Keep the legal identity and
verified support details. Check checkout and billing-portal branding as well.

Preserve the existing product ID, all price IDs, £9.99 price, currency, recurrence,
14-day trial, customers, subscriptions, schedules, tax behaviour, cancellation
settings, invoices, webhooks, secrets and return URLs. Do not create a replacement
product/price, modify subscriptions or change bank-statement descriptors as part
of this task. Record before/after snapshots and verify only display fields changed.
Do not run a live payment to validate a visual rename.

### Supabase

Existing healthy projects observed: production `phwdyckedcqxbojpbqgz` named
MenuMargin; staging `bzpiosxlhdvsnzxpmqfq` named MenuMargin-staging.
Change dashboard display names to Mise en Price and Mise en Price-staging.
Inspect auth email subjects/body and SMTP sender display name; replace literal
brand text only, preserving template tokens, confirmation links and settings.
Never replace templates wholesale without reading their current contents.

Keep project refs/API URLs, keys, Site URL, redirect allowlist, SMTP credentials,
tables, RLS, functions, migrations, billing mapping and all account data unchanged.
The marketing domain does not need to receive sign-in tokens. No SQL or Edge
Function deployment is required for this rebrand. Email-template/send verification
requires access; do not claim it passed based on the frontend tests.

## Validation and rollback

Run `npm run test:unit` and `node scripts/check-rebrand.mjs`. The one-off rebrand
guard compares protected code and compatibility contracts with the baseline.
Marketing was visually checked on desktop and in 320/375/390px frames; the narrow
layout was corrected after an overflow check. Navigation and FAQ expansion were
checked in the browser. The existing GitHub regression workflow runs invoice review, recipe pricing and
backups, account flows, recovery, and real OCR/CSP/service-worker upgrade tests in
both Chromium and WebKit using synthetic data. It does not validate a real live
payment, production customer login, real email delivery or every supplier invoice.
The previously reported supplier-name recognition issue is outside this visual
change; scanner equality means this rebrand neither fixes nor changes that issue.

Before merging, require successful regression and Cloudflare preview checks for
the exact final head. Verify production deployment after merge. Preserve the
existing main-branch required regression protection.

For rollback, revert the rebrand merge through a branch and PR, advance the shell
cache version again, run the same tests, and redeploy. Do not clear customer browser
storage or restore a database/payment backup. Revert any dashboard display names
independently if needed. Domain activation is a separate change.
