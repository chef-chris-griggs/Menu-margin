# Recipe price snapshot isolation

Recipe lists and costing still resolve the signed-in account’s current supplier
prices with the existing exact supplier-ID/name rules. Those resolved objects are
views. Storage edits now start from the original stored recipe records, preventing
an explicit Save of one recipe from acknowledging other recipes’ price alerts.
Only the selected recipe receives current editor prices/quantities on Save.

Rename changes only its selected record’s name/timestamp. Delete removes only the
selected record. Exported backups retain saved ingredient-price snapshots and the
current price book separately, with the existing explicit unsaved-draft inclusion.
Restore keeps existing stored records, remaps imported supplier IDs, keeps the
current price for matching products and adds conflict copies. If adding supplier
products pins a legacy exact-name link, imported additions are appended to fresh
stored records after that step, preserving that binding and its original numbers.

Storage failures are not treated as an empty writable library: Save/rename/delete
and export/restore report the read failure without erasing device data. Backup
restore checks that the signed-in account has not changed while reading the file
or confirming the merge. Existing save, sync/conflict and discard confirmations
remain in control; no background acknowledgement or automatic Save is introduced.
Auth, billing/security configuration and database schemas/policies are unchanged.
No migration, customer record rewrite or data cleanup is required.

Tests use the real app handlers and synthetic isolated Auth/cloud fixtures. They
verify raw record and cloud-version preservation, only the intended sync queue
entry, alert retention after reload, pack-size changes, offline retry, quota and
read errors, backup draft/copy behavior, legacy supplier pinning, supplier-ID
remapping, rename/delete/new saves and both account directions. No real customer,
physical-iPhone or production-session claim is made. Existing OCR/invoice and
account regressions remain required before release.

This change protects comparisons going forward. Historical snapshots already
replaced by an earlier whole-library save cannot be restored reliably without a
known backup or chef confirmation. The fix does not invent old quantities/prices.
