# Search visibility investigation, issue #77

## 17 November refresh

This historical audit is now rebased onto production `3b0c3ef` (PRs #79 and #80).
The canonical/menu-costing/structured-data changes below remain the proposed PR
#78 release; they are not live yet. The later calculator walkthrough and direct
IndexNow implementation are retained unchanged.

The original www error was diagnosed as absent DNS and fixed with an approved
exact-host 301 redirect. Bing ownership verification and sitemap submission were
accepted on 16 November. The homepage was observed indexed; calculator/scanner
indexing requests were accepted. PR #80 is live, and the one approved three-page
IndexNow batch returned 202 at 06:18 UK time on 17 November. Engine-side key
validation and authenticated reporting remain unconfirmed. Do not recreate those
actions. Issue #77 contains release IDs and the actual receipt. Its latest status
supersedes the historical blocker table below.

The source-level conversion audit and researched partnership handoff are in
`SEO-GROWTH-HANDOFF-2026-11-17.md`. No new traffic or conversion result is claimed.

---

Checked 16 November 2026 against production marketing source at `c8cf9bf`.
This document records a read-only audit and a proposed branch change, not a release.

## Completed production checks

- Ordinary GET requests from this workspace reached the apex site. All 12 current sitemap pages returned 200, matched the committed marketing HTML byte for byte, and contained the expected self-canonical URLs. No noindex meta directive was present on those pages.
- Node fetch verified `/robots.txt` as 200 `text/plain; charset=utf-8`, `/sitemap.xml` as 200 `application/xml; charset=utf-8`, and `/` as 200 `text/html; charset=utf-8`. None of those three responses had an X-Robots-Tag header.
- Deployed robots, sitemap and llms.txt matched the corresponding marketing files. Robots allows all paths and declares the apex sitemap. llms.txt is descriptive, not evidence of search inclusion.
- All 11 non-homepage `.html` variants redirected once to their clean canonical URL and then returned 200. Five used explicit 301 rules and six used Cloudflare's 308 handling. HTTP apex redirected once with 301 to HTTPS.
- A deliberately nonexistent path returned 404 with a noindex meta directive, rather than a soft 404.
- Source HTML links and fragment targets were inspected. No missing internal HTML page or fragment was found; the linked CSV resource exists.
- Homepage GETs carrying Googlebot, bingbot, OAI-SearchBot and PerplexityBot user-agent identifiers returned 200 and the same source bytes. These are user-agent simulations from this workspace, NOT evidence of requests from genuine crawler IP ranges or actual indexing/citations.
- One separate Python default-client check received Cloudflare error 1010 on the apex. Ordinary Node fetch and Mozilla-identified GETs succeeded. Client-dependent filtering needs authenticated Cloudflare event/log review; do not generalise either result to all bots.
- The www hostname returned a 503 proxy/upstream connection failure from this workspace, twice. Its DNS, certificate and origin configuration were not independently established. Treat www redirect handling as unresolved, not a confirmed website-wide outage. No DNS or routing edit was made.

## Existing implementation retained

PRs #73, #74 and #76 are already merged. The scanner landing page, privacy indexing and calculator-copy continuity work must not be recreated. Existing food-cost-calculator metadata and worked GP examples already target the observed food-cost query. No new keyword page is justified by this small data sample.

## Proposed safe improvements

1. Consolidate the older `/one-recipe-demo` with `/free-recipe-costing-calculator` using a canonical link, and remove only the duplicate from the proposed sitemap. Both forms use the same calculator implementation and initial example. Keep the old URL usable, crawlable and free of redirects/noindex so saved links still work.
2. Add a concise menu-costing section to the existing recipe software page. Search Console already shows `menu costing software` impressions on that page; link readers to the existing catering and menu-pricing guides rather than creating another overlapping landing page.
3. Add accurate WebPage descriptions on the software and scanner pages, connected to the existing website/application. No ratings, testimonials, author credentials or guarantees are invented. This is descriptive markup, not a claim of rich-result or AI eligibility.
4. Extend existing SEO and browser checks for structured JSON, canonical consistency and continued use of the old calculator.

## Search measurement baseline

Fresh Supermetrics queries on 16 November, Google Search Console property `sc-domain:miseenprice.co.uk`, 7–13 November 2026, UK country filter `GBR`, finalized results:

| Measure | Result |
| --- | ---: |
| Impressions | 21 |
| Clicks | 1 |
| Average position | 63.3333 |

The visible click was `mise en price` to the homepage. The visible `food cost calculator` row had 1 impression at position 49. `menu costing software` on the software page had 1 impression at position 91. These are low-volume observations, not stable rank estimates. Unknown query rows remain in the aggregate; query/page rows must not replace country totals.

Fresh GA4 property `564297441`, same dates, `countryIsoCode == GB`: 7 sessions, 4 total users and 4 engaged sessions. Source rows show 6 direct sessions and 1 lm.facebook.com referral session. These are consented analytics measurements with unclassified owner/test activity, not verified prospects. A fresh aggregate replaces the earlier stored 8-session observation; do not silently reuse that older figure.

The website event query returned page_view, app_link_click, click, session_start, first_visit, user_engagement, calculator_interaction, form_start and scroll. It did not return a confirmed signup/trial event. App-link clicks are not trials. Trial records must be checked separately, classified for tests/owner activity and attributed before calculating acquisition conversion rates. No Google AI-only performance total or verified AI citation was established.

## Blocked account-level checks and next actions

| Check | Actual state | Required next evidence |
| --- | --- | --- |
| Bing Webmaster ownership | Browser opened the public about page and showed Sign In; no authenticated ownership dashboard available | Sign in to the existing Bing account, inspect the exact property; import from GSC only if ownership is absent and authorised |
| Bing sitemap and URL inspection | Unknown; no submission made | Record sitemap state and dated inspection results for homepage, calculator, scanner and GP guide |
| Bing clicks/impressions | Supermetrics BW connection NOT_AUTHENTICATED | Connect the existing property or read its dashboard; never report unavailable data as zero |
| IndexNow | No repository key, submission code or Bing verification tag found; this does not exclude CDN-managed IndexNow | Inspect Cloudflare Crawler Hints and Bing IndexNow history before proposing a new implementation |
| Cloudflare WAF/bot controls | No authenticated configuration or crawler logs inspected | Read security events for genuine bot requests and verify current official IP ranges; separate approval before security changes |
| www canonical redirect | Workspace upstream errors; not independently diagnosed | Verify DNS/certificate/domain attachment from an authorised dashboard and another network before requesting a production fix |
| AI search recommendations | Unverified | Record actual dated answers and cited URLs if observed, separately from crawler tests |

IndexNow should notify only changed canonical production URLs after an approved release. If Cloudflare already supplies notifications, avoid duplicate setup. If absent, prepare a public verification key and an explicit submission workflow on a branch, validate it on a separate staging host, and obtain production approval before activation. A 200/202 IndexNow response acknowledges processing, not indexing.

## Coordination

Continue the existing SEO/QA automation, not a duplicate. This investigation and PR are the handoff record. Sales remains the sole outbound operator; no outreach or social publication was undertaken. Creative should link useful calculator or scanner content to existing canonical pages and record tagged referrals separately from verified trials. Do not resend old indexing requests or repeat merged fixes.

## Official references

- [Canonical consolidation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google AI features and website eligibility](https://developers.google.com/search/docs/appearance/ai-features)
- [OpenAI search and training crawler controls](https://developers.openai.com/api/docs/bots)
- [Perplexity search crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
- [IndexNow setup and acknowledgement limits](https://www.bing.com/indexnow/getstarted)
- [Cloudflare Crawler Hints](https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/)
- [Cloudflare clean URLs and 404 behaviour](https://developers.cloudflare.com/pages/configuration/serving-pages/)
