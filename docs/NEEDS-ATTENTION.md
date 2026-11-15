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

The paired recipe-snapshot isolation fix updates recipe persistence so only the
selected Save acknowledges current prices. Existing pricing, price-book, invoice/
scanner, Auth/cloud, billing/security, Supabase schema/policies, guide, supplier-
alert UI, logo and marketing implementations are unchanged. No migration or live
customer account is needed to test this.

The save-snapshot issue found during integration testing is fixed by the paired
[recipe snapshot isolation change](RECIPE-SNAPSHOT-ISOLATION.md). Saving, renaming,
deleting, exporting or restoring another recipe cannot acknowledge unreviewed
price comparisons. Already overwritten historical baselines are not invented or
automatically reconstructed.

Automated coverage uses the actual shared helpers and real app scripts with
synthetic isolated Auth/cloud records. It tests direct field focus, invoice/price
regressions, retained unsaved edits, explicit saves, zero/missing prices, supplier
choice/deletion, current-only VAT, actual GP, account switches, offline provenance,
malformed cache, text-only descriptions, paging, mobile widths and print exclusion.
Desktop WebKit is not a physical-iPhone acceptance claim. Keep production unchanged
until passing CI, separate owner preview review and explicit release approval.
