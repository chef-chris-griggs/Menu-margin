# Needs attention

An optional panel in Recipes checks the signed-in account’s saved recipe library.
More → Needs attention opens it. Existing supplier price alerts remain separate
and unchanged. The new panel catches problems even when no supplier price changed.
It checks saved recipes, not unsaved editor drafts, with visible provenance/offline
copy. It creates no records, preferences, supplier links or background requests.

Categories cover prices/suppliers, quantities/units, VAT, recipe details and
reliable GP below target. Manual prices and valid legacy entered prices without a
supplier book remain usable; chefs are not forced to link products. Existing exact
supplier-ID/name resolution remains authoritative. Missing/renamed/ambiguous or
incompatible links require review and suppress reliable GP. Blank untouched rows
are ignored; missing or invalid numbers are not converted into invented zero prices.
An explicit free price is allowed. Current resolved supplier prices determine the
checks, independently of the older snapshots used by supplier price alerts.

GP uses complete current ingredient costs, positive whole portions and actual
saved selling price, all on a confirmed excluding-VAT basis. Unknown/including-VAT
prices require checking; no tax rate or conversion is guessed. Missing/invalid
selling price, target or portions directs the chef to existing fields. A below-
target warning is shown only when a reliable actual GP and valid target exist.
Tiny genuine shortfalls are labelled slightly below target, avoiding misleading
rounded messages that imply equal GP or zero percentage-point loss.

Review actions call the existing recipe Open/unsaved-change guard, or open the
exact current supplier item in the existing price editor. They focus the relevant
field; card enhancement finishes before mobile ingredient disclosure/focus, with
stale-account/draft guards. The original explicit Save handlers remain responsible
for writes. Opening, filtering and reviewing the panel do not acknowledge/fix
warnings. Saved corrections and account/cloud/other-tab updates recheck the data.
The list is collapsed initially, pages in 20s, renders names as text, reads only in
relevant views and clears state across sign-out/account changes. Unreadable cache
shows recovery guidance instead of an all-clear and is never erased.

Existing recipe, pricing, price-book, scanner/invoice, Auth/cloud, billing/security,
Supabase schema/policies, guide, supplier-alert, logo and marketing implementation
files are unchanged. No migration or live customer account is needed to test this.

A pre-existing limitation discovered by integration testing: saveCurrentRecipe()
reads the resolved whole library before saving, so an explicit Save of one recipe
can also refresh stored supplier-price snapshots in others. This feature neither
introduces nor changes that behavior. It can affect supplier-alert comparison
baselines; a separate narrowly scoped fix should be reviewed and tested before
changing it. The Needs attention comparison uses current resolved costs.

Automated coverage uses the actual shared helpers and real app scripts with
synthetic isolated Auth/cloud records. It tests direct field focus, invoice/price
regressions, retained unsaved edits, explicit saves, zero/missing prices, supplier
choice/deletion, current-only VAT, actual GP, account switches, offline provenance,
malformed cache, text-only descriptions, paging, mobile widths and print exclusion.
Desktop WebKit is not a physical-iPhone acceptance claim. Keep production unchanged
until passing CI, separate owner preview review and explicit release approval.
