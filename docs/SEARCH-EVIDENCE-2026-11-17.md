# Verified search and measurement evidence, 17 November 2026

This records authenticated read-only measurements and one proposed page correction.
PR #78 is already live at 969aa17. It must not be recreated or reported as pending.

## UK performance, finalized Google period 7–15 November

Fresh Supermetrics queries against Search Console property
`sc-domain:miseenprice.co.uk`, country GBR, normal precision and
`final_data=true`, returned:

| Scope | Impressions | Clicks | Average position |
| --- | ---: | ---: | ---: |
| UK country total, 7–15 Nov | 37 | 1 | 56.3784 |
| UK, 14 Nov | 8 | 0 | 51.125 |
| UK, 15 Nov | 8 | 0 | 43.375 |

The sole visible clicked query remains branded, “mise en price”. These periods
precede the 16–17 Nov releases and do not establish their impact. The country
total was queried directly, not reconstructed from query/page subtotals.
Eight impressions in query/page results have unknown query/page; retain them as
unknown. Search Console query/page results are not a complete keyword inventory.

Selected observed queries, not volume estimates:

| Query | Existing landing page | Impressions | Clicks | Avg position |
| --- | --- | ---: | ---: | ---: |
| recipe cost software | /recipe-costing-software | 5 | 0 | 82 |
| recipe cost software | / | 4 | 0 | 75.25 |
| menu costing software | / | 3 | 0 | 81 |
| menu costing software | /recipe-costing-software | 2 | 0 | 86.5 |
| menu pricing | /restaurant-menu-pricing-guide | 2 | 0 | 91 |
| what is menu costing | /restaurant-menu-pricing-guide | 1 | 0 | 100 |
| food cost calculator | /free-recipe-costing-calculator | 1 | 0 | 49 |

The query mentioning a Google extension had four impressions, but this product is
not a browser extension. Do not invent an extension or target that wording as a
feature. Another one-impression question mentioned stock/gravy allergens; it does
not justify inventing dietary suitability or a new food-safety page.

GA4 website property 564297441, countryIsoCode GB, same 7–15 Nov:
13 sessions, 4 total users, 5 engaged sessions. Source/landing breakdown:

| Session source / medium | Landing | Sessions | Engaged sessions |
| --- | --- | ---: | ---: |
| (direct) / (none) | / | 10 | 4 |
| (direct) / (none) | (not set) | 2 | 0 |
| lm.facebook.com / referral | /one-recipe-demo | 1 | 1 |

These are consent-dependent website measurements. Owner/test traffic is not
classified, so do not call these qualified prospects or unique genuine visitors.
No confirmed-trial or paid-conversion figure was established by these queries.
Do not add users across breakdown rows. All these queries reported cache_used=false.

## Crawler identity and access, 16 Nov 14:00 to 17 Nov 14:00 UTC

A read-only Cloudflare GraphQL `httpRequestsAdaptiveGroups` query selected only the
public marketing hostname, these three crawler user-agent families, and Cloudflare
category `Search Engine Crawler`. Each returned client IP was compared locally
with its provider's freshly fetched published CIDR list. No raw IPs, user sessions,
query strings, customer identifiers or credentials are included in this document.

The narrowed query returned 49 groups, below its limit of 200. Every reported
sampleInterval was 1. Observed grouped counts:

| IP-verified crawler | Requests | HTTP results | Important observed paths |
| --- | ---: | --- | --- |
| Googlebot | 32 | 25 × 200, 7 × 301 | Homepage, calculator, software, scanner, catering and robots |
| OAI-SearchBot | 16 | 16 × 200 | Homepage, calculator, GP, menu guide, scanner, supplier guide, robots and assets |
| Bingbot | 4 | 4 × 200 | Homepage, robots, sitemap and IndexNow key file |

All IPs matched the respective published ranges. The Google list contained 317
prefixes, OpenAI 39, Bing 29 at retrieval. This establishes successful requests in
that bounded historical window. It does not prove universal future accessibility,
indexing, search recommendations, citations, referral traffic or organic demand.
Some requests can follow our own audits; they are not acquisition results.

Bing fetched the existing IndexNow key file with HTTP 200. **Engine-side key
validation remains unconfirmed.** Logs do not show whether Bing accepted the key
contents, and do not replace its validation status or a protocol receipt.
Do not resend the previously accepted batch merely to probe validation.

A broad user-agent query also returned Perplexity-looking requests and some
AI Assistant categories. Those were not included in the three-provider totals.
Further raw Perplexity-IP retrieval was rejected by automatic approval review.
A materially safer aggregate-only alternative succeeded: fetch the 13 published
single-address PerplexityBot prefixes, filter requests to those exact public
vendor addresses and the PerplexityBot UA, and return only path/status/count,
never an IP field. It found one robots request and one homepage request, both
HTTP 200, sampleInterval 1. This establishes PerplexityBot access to those two
paths in the same bounded window, not citations or universal access. A user-agent
string alone is not enough. Source: https://www.perplexity.ai/perplexitybot.json .

Current Cloudflare bot configuration was read, not changed. Relevant bot-blocking
controls returned disabled; the public robots permits all paths. Those settings
alone cannot establish bot-IP access. The observed IP-matched requests provide
the stronger evidence above. No DNS, WAF, security or crawler policy was changed.

### Reproducible read-only query

Use the existing Cloudflare connector's POST /graphql for this **query**, never a
mutation. It needs no new token, permission grant, deployment or paid feature.
The public zone is 75d93b8e88a9e22526d81db144f4b051. Keep the hostname filter,
bounded dates, provider-family filter, Search Engine Crawler category and a finite
result limit. Request count, avg(sampleInterval), clientIP, clientRequestPath,
userAgent, verifiedBotCategory and edgeResponseStatus. Match each source IP to
the corresponding current vendor CIDR list before aggregating. Keep raw results
private and omit them from reports. If IP access is rejected, stop and report the
narrower unverified observation; do not remove identity checks and call it verified.

Published identity references:
- https://openai.com/searchbot.json
- https://developers.google.com/static/search/apis/ipranges/googlebot.json
- https://www.bing.com/toolbox/bingbot.json
- https://developers.openai.com/api/docs/bots
- https://www.bing.com/webmasters/help/how-to-verify-bingbot-3905dc26

## Reporting continuity at £0

Supermetrics currently authenticates GW and GAWA; BW remains NOT_AUTHENTICATED.
It reports its trial expires in two days. Do not purchase or upgrade. After expiry,
report connector access as unavailable if it fails; use authenticated free GSC/GA4
interfaces or owner-provided exports, not fabricated automatic access.

A Web Analytics configuration lookup was automatically rejected because it
included a site_token. Do not retry that credential lookup. A materially safer
aggregate GraphQL query succeeded without retrieving configuration or any token:
account rumPageloadEventsAdaptiveGroups, 7 Nov 00:00 to 16 Nov 00:00 UTC,
requestHost_in [miseenprice.co.uk, menu-margin.pages.dev], grouped by host,
countryName and bot, returning count and sum(visits).

For the app host only, country GB and bot=0: 20 pageload events and 10 Cloudflare
visits. There were no marketing-host rows in this result. That is not proof of
zero marketing traffic or complete marketing instrumentation. Cloudflare visits
are not unique people, GA4 sessions, confirmed trials or paid subscribers. Owner
and test use is unclassified. Do not merge these source totals. This is a verified
partial £0 fallback for app visits, not a substitute for website search reporting.

## AI-search eligibility boundaries

Google's current Search generative AI documentation specifies a property control
under Search Console Settings > Search generative AI. Its actual account value
is unknown; do not infer it from the public robots, a default described in docs,
or the successful Googlebot requests. The newer control documentation is more
specific than older guidance saying there are no extra technical requirements.

OAI-SearchBot is the search crawler; GPTBot training controls are independent.
The successful OAI requests do not show that ChatGPT recommended this app.
Bingbot access does not establish Copilot inclusion. Perplexity crawl identity,
AI citations and Search/AI performance remain unverified.

Primary references, reviewed 17 Nov:
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://support.google.com/webmasters/answer/16908024?hl=en
- https://developers.openai.com/api/docs/bots
- https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- https://www.indexnow.org/en_gb/documentation

## Proposed existing-page improvement

The menu-pricing guide uses £4 cost / 70% target and previously showed £13.33.
That gives 69.9925% ingredient GP, just below the target. The minimum whole-penny
ex-VAT price meeting the target is £13.34, giving about 70.0150% GP. Correct the
example and explain rounding upwards. The corresponding ingredient cost is about
29.99% of the rounded price.

Add a short “What is menu costing?” definition and a link to the existing full-dish
worked example on this same guide URL. This answers an observed query without
creating a competing page. One impression is not a validated demand forecast or
a predicted ranking gain. No app calculations, tracking, consent, auth, security,
payments or database behaviour changes are part of this correction.
