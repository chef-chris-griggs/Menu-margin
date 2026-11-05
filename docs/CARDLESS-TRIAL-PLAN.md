# Card-free 14-day trial: implementation and safety specification

Status: implementation complete on PR #10; database migrations installed in production, but website and checkout function release still pending. This branch must not grant trial access from browser localStorage or a client-provided signup timestamp.

## Existing behaviour inspected
- The app checks server-side `menu_margin_has_paid_access` on login and sync in `js/auth.js`.
- `create-checkout-session` currently creates a Stripe subscription with a 14-day trial and `payment_method_collection: "always"`.
- `stripe-webhook` mirrors Stripe subscription status into `menu_margin_subscriptions`.
- Existing customer mappings, subscription rows, and Stripe trial history must remain untouched.

## Proposed safe flow
1. A newly verified Supabase user activates a one-time 14-day trial through a **server-authoritative, idempotent** endpoint, without Stripe Checkout or payment details.
2. Store the server-created trial start/end against the authenticated user in a dedicated table with a unique user ID, immutable start/end, RLS, and no client-write privilege. Do not use `user_metadata` or client clock to authorize access. Block repeated trial creation after expiry, deletion/recreation attempts for the same identity where enforceable, and trial renewal by toggling billing.
3. Extend the **existing server-side** `menu_margin_has_paid_access` RPC to accept either an unexpired cardless trial or an existing eligible Stripe subscription. Preserve existing owner/admin exemptions, if any. Keep data ownership policies unchanged.
4. On day 14, access expires server-side. Preserve recipes and supplier prices in storage. Show an upgrade screen with `£9.99/month` and explicitly state **no automatic charge**.
5. After trial expiry, use Stripe Checkout for a paid subscription **without** another Stripe trial; `STRIPE_TRIAL_DAYS` must not accidentally grant a second free period. Do not reject paid checkout just because a cardless trial was previously used. Handle existing Stripe subscriptions and legacy trials without shortening their entitlement.
6. Email reminders on days 7 and 12 only after configuring an authenticated server-side mail sender, opt-out rules as applicable, delivery monitoring, and idempotent send markers. Never send sensitive invoice or recipe data in email.
7. Show trial days remaining from server timestamps. Ensure offline grace periods never extend an expired trial beyond the existing bounded policy.

## Required tests before rollout
- New verified account gets exactly one 14-day cardless trial; no Stripe object or payment method is created.
- Existing customer, existing Stripe trial, owner, expired/cancelled subscriber, and previously trialled user are handled correctly.
- User cannot restart or extend the trial by browser changes, changing devices, direct RPC calls, timezone manipulation or reconnecting offline.
- Account A cannot see or change account B's entitlement; anonymous access denied; trial table cannot be client-written.
- At day 14, server denies paid features, retains cloud data; subscription checkout charges £9.99/month immediately after trial, with no second trial.
- Webhook events, refunds, failed payments, cancelled subscriptions and retries keep correct entitlement.
- Chromium and WebKit browser regression, direct authenticated API isolation, and Stripe **test-mode** end-to-end checks pass.
- Confirm marketing copy and app CTA say '14 days free. No card required. No automatic charge.'
- Roll out via reversible feature flag, after backing up existing billing config and validating rollback.

## Deployment boundaries
Do not change live Stripe, Supabase policies/tables/functions, DNS, or production code until implementation and tests have passed and deployment is explicitly approved. No trial should be authorized solely by client JavaScript.
