# Supplier price alerts

Read-only alerts appear in Recipes, with a shortcut from Prices and More. They
compare ingredient pack prices stored in the current account’s saved recipes with
that account’s current price book, using the existing exact supplier resolver and
ingredient-cost helper. Alerts never save recipes, change selling prices, add
products, relink ingredients, send background requests or store new preferences.
Manual prices remain manual. Existing supplier IDs, exact-name requirements,
ambiguous matches, removed products and unit compatibility remain authoritative.

The comparison is against each recipe’s stored pack-price snapshot, not against
an invented last invoice, a market price, or a time-based notification history.
Opening a recipe does not acknowledge the alert. Explicitly saving it records
only that recipe’s current prices. Other saved recipes retain their comparison
snapshots, including during rename, delete and backup operations. Backups retain
saved recipe snapshots and the current price book separately. No historical ledger
or database schema is introduced; comparisons erased by earlier saves cannot be
reconstructed automatically without guessing.

Cost increases are ranked by extra cost per portion; decreases and price checks
are visible separately. Both pack size and price matter: a larger dearer pack may
reduce cost per unit. Cards show batch/portion changes, actual-selling-price GP
and target crossing where those figures are reliable. Missing actual selling
prices do not create an estimated GP. Any incomplete ingredient, invalid portion
count, missing/renamed/ambiguous supplier, incompatible unit or unclear VAT basis
requires review. GP comparisons require every before/after ingredient price to be
explicitly excluding VAT; no VAT rate or conversion is guessed. Manual ingredients
are included in full-recipe completeness and VAT checks. Offline comparisons are
clearly labelled as cached device prices; this is not a live supplier feed.

The optional list is collapsed initially and paged in groups of 20. It reads only
when relevant views are visited, coalesces changes and clears account state on
sign-out/switch. Names and supplier descriptions use textContent. The original
Open/unsaved-change confirmation and Save actions remain in control. Existing
pricing, invoice/scanner, Auth/cloud, billing/security, marketing and logo
implementation files are unchanged. Recipe storage operations now preserve
unreviewed comparison snapshots. No production migration is required.

Tests use actual shared costing/pricing helpers and real app scripts with
synthetic isolated accounts/cloud data. They cover packs/units, zero/missing
prices, VAT, actual GP/target crossing, same-name suppliers, manual overrides,
invoices, active drafts, explicit saves, cloud/other-tab refresh, unreadable cache,
account switching, mobile layouts, printing and large libraries. Desktop WebKit
coverage is not a physical-iPhone or handwriting claim. Production release still
requires passing CI, owner preview review and explicit approval.
