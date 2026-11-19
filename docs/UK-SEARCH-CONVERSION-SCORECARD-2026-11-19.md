# UK Search and trial acquisition scorecard
Baseline export: Google Search Console performance, 19 November 2026 (user-provided CSV export). These figures describe the export's selected date range, not a live Google Search Console query. Preserve the original export when comparing later periods.

## Current baseline
- Search clicks: 8; impressions: 90.
- UK: 59 impressions, 1 click, 1.69% CTR, average position 54.73.
- Homepage: 43 impressions, 7 clicks, 16.28% CTR, average position 27.14.
- Free recipe costing calculator: 24 impressions, 1 click, 4.17% CTR, average position 34.96.
- Recipe costing software: 15 impressions, 0 clicks, average position 79.
- Restaurant menu pricing guide: 5 impressions, 0 clicks, average position 59.4.

## Non-branded search queries (actual rows)
| Query | Impressions | Clicks | Avg position |
| --- | ---: | ---: | ---: |
| recipe cost software | 9 | 0 | 79 |
| menu costing software | 5 | 0 | 83.2 |
| recipe costing software | 3 | 0 | 82.67 |
| chef recipe costing software | 3 | 0 | 84 |
| chef food costing software | 2 | 0 | 82.5 |
| food cost calculator | 1 | 0 | 49 |
| food costing calculator | 1 | 0 | 78 |
| best recipe costing software | 1 | 0 | 88 |
| what is menu costing | 1 | 0 | 100 |

The highest non-branded query by impressions was `google extension recipes costs calculator free uk` (12 impressions, 0 clicks, avg position 20.58). This does NOT justify describing Mise en Price as a Chrome extension.

## Page ownership
- `/recipe-costing-software`: recipe cost software, food costing software, menu costing software, chef software.
- `/free-recipe-costing-calculator`: food cost calculator, free food costing calculator, recipe costing calculator.
- `/what-is-menu-costing`: meaning and calculations of menu costing.
- `/best-recipe-costing-software-uk`: how to compare software and spreadsheets.
- Avoid new near-identical pages for the same search intent.

## Weekly measurement and decision rules
1. Confirm the sitemap is readable at `https://miseenprice.co.uk/sitemap.xml`; check both new URLs with Google URL Inspection. Submission or crawl is not confirmation of indexing.
2. In Search Console, filter country **United Kingdom** and search type **Web**. Compare equivalent 7-day or 28-day periods. Track non-branded impressions, clicks, CTR and average position for the two commercial pages, plus indexing status. Record the period and export date.
3. In GA4, report consented sessions, calculator interactions and **trial_cta_click** separately. A trial CTA click is **not** an authenticated account or trial.
4. For actual signups, free trials and paid subscribers, use server-confirmed owner metrics and Stripe reconciliation only. Do not infer conversions from GA4 click events or email sends.
5. If impressions rise but CTR stays low, review the visible SERP titles and descriptions for the page's real query; if impressions stay flat, investigate indexing, content relevance and credible distribution; if clicks increase but no trials follow, check consented CTA intent and verified server-side registrations.
6. Don't claim that Google indexing, ranking or trial conversions are guaranteed. Avoid changing app auth, payments, database or owner metrics as part of an SEO-only release.

## Change log
- 19 Nov: PR #105 added two information guides, sitemap URLs, and internal links; merged after regression.
- 19 Nov: follow-up commercial-intent update on existing software and calculator pages prepared separately. Validate and merge only after passing required checks.
