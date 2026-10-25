# MenuMargin 1.0.0

Mobile-first recipe costing and supplier price book, rebuilt from the latest v0.9.0 Desktop version. The rebuild keeps the product flows that were already useful and replaces the fragile storage interception with explicit account-scoped saves.

## What is kept and improved

- **Cost a recipe:** mass, volume, and each conversions; portion yield; selling price; food cost and GP; target GP pricing; CSV export; print/PDF.
- **Recipes:** save, reopen, rename, and delete; local edit recovery; cloud sync that queues changes while offline and keeps conflict copies instead of silently overwriting another device. Download or restore a JSON backup of recipes and supplier prices; restore merges records and protects existing versions.
- **Price book:** case quantity, item size, supplier code, and full case price; duplicate supplier items update instead of multiplying; prices can be added to a recipe and exported as CSV.
- **Invoice scan:** local PDF/photo OCR, HEIC conversion, page-by-page PDF handling, separated review rows, editable codes/names/pack sizes/prices, and explicit confirmation before importing. Invoice files and OCR text are not uploaded or saved by the app.
- **Mobile PWA:** responsive four-tab navigation, safe-area support, install metadata, and a local shell cache. OCR libraries are cached by the service worker after first use.
- **Accounts and access:** Supabase login, per-user local caches, row-level security, and Stripe subscription functions. Billing remains off by default until Stripe is configured.

## Run locally

Serve this folder over `localhost` or HTTPS. Opening `index.html` with `file://` is useful for a quick preview, but service-worker installation and reliable cloud auth need a web origin. No build step is required.

## Supabase setup

Apply the migrations in filename order from `supabase/migrations/`. The first migration creates the recipe, price-book, and billing tables plus per-user row-level security. The feature-switch migration sets billing to **off**, so recipes and prices remain available while the Stripe account is being prepared.

The browser contains only the Supabase project URL and publishable key. Do not add a secret or service-role key to browser code. Confirm that the Supabase Auth redirect allow-list includes the deployed app URL.

## Stripe setup before charging

The app is not collecting payments yet. Before offering the paid plan:

1. Create the £9.99 monthly Stripe price and confirm the 14-day trial settings.
2. Add the Stripe secret, monthly price ID, webhook secret, Supabase service-role key, Supabase URL, and deployed app URL to Supabase Edge Function secrets.
3. Deploy `create-checkout-session`, `create-portal-session`, and `stripe-webhook`; configure the Stripe webhook for subscription lifecycle and invoice payment events.
4. Only after the Stripe flow is configured, turn on the server-owned gate in Supabase SQL:

   ```sql
   update public.menu_margin_app_config
   set billing_enabled = true, updated_at = now()
   where singleton = true;
   ```

   The browser cannot change this setting. When billing is off, the database allows authenticated recipe and price-book access; when it is on, the database also requires an active or trialing subscription or an admin access grant.

## Release notes

The rebuilt source has not been deployed to GitHub or Supabase from this folder. Stripe remains disabled, and the live database policies, Auth redirects, and checkout/webhook flow still need to be confirmed in the owner's accounts before taking payments.

See [`vendor/LICENSES.md`](./vendor/LICENSES.md) for bundled OCR, PDF, and Supabase library notices.
