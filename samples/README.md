# Private invoice samples

This local folder holds five real invoice photographs, the original HEIC files,
EXIF-corrected JPEG copies and matching `*.expected.json` ground-truth files.
The photographs and expected data are excluded from Git. Do not publish them
with the application. The test runner reads the local JSON files directly.

Expected fields were transcribed by visually inspecting the photographs, never
copied from scanner output. `annotate-expected.py` contains those manual entries
and writes the JSON files reproducibly. Supplier abbreviations and truncated
descriptions remain as printed; product codes keep their leading zeroes.

The Bidfood photographs are pages 1, 2 and 3 of invoice 47687098, with 21, 22 and
6 rows respectively. The final subtotal belongs to the combined 49 rows, so an
individual page cannot be tested against that whole-document subtotal. The
manifest records this document group. Blank or missing totals remain null.

`pack` is the pack bought at the displayed price. For Bidfood loose units,
`pack.caseCount` is one and `printedPack` preserves the normal case composition.
For British Premium Meats, billing quantity is the actual weight, not the number
of physical pieces. Fresh Direct dozen packs are normalized into each units.

The visible Fresh Direct and British Premium Meats documents are delivery notes,
so their delivery numbers are not invented as invoice numbers. Fresh Direct's
Unit Price heading has no explicit VAT basis and is annotated `unknown`.

Run the full scanner accuracy report from the project root with `npm run
test:scanner`. Debug images, word positions and mismatch reports belong in the
separate ignored `scanner-debug/` folder.
