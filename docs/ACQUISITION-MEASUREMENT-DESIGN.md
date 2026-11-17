# Acquisition measurement implementation proposal

Status: reviewable design only. No tracking, auth, database, security, consent or
billing change has been implemented or deployed by this document.

## Outcomes and truth sources

Expand the existing owner dashboard rather than creating another one. Keep these
counts separate: confirmed email registration, first server-confirmed cardless
trial, paid subscription reconciled with Stripe. Website calculator use and app
link clicks remain earlier funnel steps. A click or pending email confirmation
never counts as a trial. Historical unknown source remains unknown.

## Smallest first-party implementation

1. After explicit website analytics opt-in, allow only coarse campaign labels and
   an allowlisted landing-page identifier in a marketing-to-app handoff. Do not
   transfer a Google client ID, recipe content, identity, arbitrary referrer,
   auth parameters or the website's consent as permission on the app.
2. On the app, provide an independent optional measurement choice with equal
   accept/reject controls. Signup, recovery, trials and all existing app functions
   must work identically after rejection or storage failure. Before consent,
   retain no source data in persistent storage and send no marketing events.
3. Retain consented coarse attribution for no more than 30 days. Expired,
   malformed or unrecognised values become unknown. Treat campaign/source labels
   as visitor-supplied hints, never identity, role, access or an authenticated
   assertion that Google/AI caused a visit. Missing UTMs must not become “Google”.
4. Keep the existing trial RPC's return type and eligibility/billing behaviour
   intact. After its successful future trial-end response, an optional new
   attribution write must verify auth.uid() and an actual authoritative trial
   record server-side. Do not count success from client button clicks.
5. Enforce a server-side unique trial/user relationship so repeated logins,
   multiple devices, retries and concurrent calls cannot create new conversions.
   A failed attribution write must not prevent opening an already active trial.
   Do not backfill old trials from later campaign labels.
6. Add owner-only aggregate reporting through the existing owner permission model.
   Store classification separately from subscription entitlement: founder/owner,
   confirmed test, reviewed genuine, unknown. Default to unknown. Only an
   authorised owner may classify; browser metadata cannot grant that role or
   classify its own account as genuine. Preserve the original unclassified totals.
7. Initially keep this measurement first-party. Do not add Google tags to signed-in
   app or auth/recovery URLs. Any later third-party trial event needs its own
   reviewed consent/PII model and must stay separate from backend unique counts.

## Data boundary

Proposed fields are only coarse source/medium/campaign/landing IDs, recorded time,
expiry/consent state, and an internal reference to the existing account/trial. The
internal reference never goes into marketing analytics. Retain only what is
needed for the stated reporting purpose. Do not publish per-person campaign data
or small cohort drill-downs. Define retention deletion and aggregate preservation
before writing SQL. No customer recipes, invoices, email, auth tokens, free text
or payment details belong in source attribution.

## Required acceptance tests before production proposal

- Reject, ignore, expire or revoke consent: no marketing storage/event/write.
- Storage unavailable: all existing signup/trial/recovery flows still succeed.
- Unknown/free-text/email/token/query inputs cannot enter stored source fields.
- Unconfirmed signup, failed RPC or checkout open creates no trial conversion.
- Repeated/concurrent activation and cross-device use yield one unique conversion.
- Account A cannot read/write account B's attribution; anonymous access denied.
- Acquisition metadata cannot affect auth, RLS, entitlement, owner status or Stripe.
- Owner/test/unknown cohorts remain distinct; genuine totals require review.
- Recovery links and consent parameters coexist without intercepting or leaking tokens.
- Owner aggregate and Stripe reconciliation explain counts without inferring sales
  from GA4 events. Any timing discrepancy remains explicit.
- Full Chromium/WebKit regression and staging isolation pass on the final tree.

## Review and release boundary

Implementation requires a separate tested PR and a controlled staging validation
before requesting production approval, especially for auth integration, RPC/RLS,
retention and database changes. This document is not that approval. Existing
source audit, reporting, trial records and owner dashboard are retained. No new
Supabase/Stripe settings, credentials, permissions or production data were changed.

