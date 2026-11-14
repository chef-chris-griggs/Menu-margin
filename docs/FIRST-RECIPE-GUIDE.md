# First recipe guide

This optional guide helps a signed-in chef reach a saved, costed recipe:

1. Add supplier prices or enter pack prices directly in the recipe.
2. Enter the recipe's ingredients, portions, quantities and units.
3. Enter the actual selling price per portion.
4. Choose Save recipe.

It appears automatically only when the current account has no saved recipes.
Returning chefs can open it from More → Recipe guide. Not now hides it for the
current visit; no preference, customer record or additional account setting is
stored. It collapses while following a step and moves aside after the first save.
The supplementary mobile cost summary is hidden only while the guide is expanded.

Progress comes from the current account's existing library/price-book readers and
the current editor. Ingredient completeness and unit compatibility use the existing
costing helper. No new cost or GP formula, matching rule, sample price or product is
introduced. The guide does not call rows() or recipeData(), which also render
supplier bindings. Hidden guidance does not rescan the editor on each keystroke.

Step buttons navigate/focus existing controls. The explicit Save recipe button
delegates to the existing save action; opening the guide or entering prices does
not save a library recipe. Device-save failure cannot complete the final step.
Completion says Recipe saved without claiming a cloud sync that has not occurred.
Draft recovery, sync status, warnings, data storage and the original Save button
retain their existing behavior. No authentication, billing, database, scanner or
marketing implementation changes are included.

Browser checks in `tests/first-use.browser.mjs` use the real app with synthetic
Auth/cloud responses. They cover manual/supplier pricing, missing/negative/zero
prices, incompatible units, quota failure, explicit save, drafts, returning/new
accounts, selected supplier IDs, sign-out, printing and five viewport widths in
Chromium and WebKit. They make no live customer, email, billing or physical-iPhone
claim. They run alongside the complete existing regression workflow.

The feature is prepared on a separate branch for review. Production release
requires successful CI and the owner's approval. Any rollback must preserve all
customer data and use a fresh service-worker cache revision.
