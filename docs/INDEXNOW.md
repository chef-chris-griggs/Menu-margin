# Notify search engines without a Bing browser session

This is the direct IndexNow protocol route for issue #77. It does not require
Bing Webmaster Tools login, Google consent, Cloudflare Crawler Hints or a paid
service. It does not supply authenticated Bing performance or index-status data.

## Release scope

- One static ownership text file in `marketing/`, generated as 32 random hex
  characters, with a matching filename. It serves only IndexNow ownership
  verification, not app authentication, customer data or payment access.
- A dependency-free Node submission command, with dry-run as the default.
- Eight focused tests included in the existing `npm run test:seo` CI step.
- No app code, page copy, sitemap, robots rules, headers, redirects, DNS,
  account security, payment settings or database changes.
- No automatic workflow, schedule or network notification on checkout, tests,
  build, deploy or dry-run. An operator must explicitly use `--submit`.

## Before any notification

Obtain the separately required production approval and merge only after the PR's
checks pass. Wait for Cloudflare's production deployment, then use a checkout of
that exact released revision. The tool verifies the public key and every public
page against that revision before it makes any notification request. A wrong key,
redirect, non-200 page, noindex directive, changed canonical, stale HTML or network
error stops the entire batch. An error never triggers an automatic retry.

## Usage

Choose only public acquisition pages actually added or updated. Do not submit the
entire sitemap repeatedly, fabricate changes, include private data in URLs, or
send old unchanged pages merely because their index status is unknown.

Preview the three public pages updated by PR #79:

```sh
npm run indexnow -- https://miseenprice.co.uk/free-recipe-costing-calculator https://miseenprice.co.uk/recipe-costing-software https://miseenprice.co.uk/catering-recipe-costing
```

After approved release and live verification, make one explicit notification:

```sh
npm run indexnow -- --submit https://miseenprice.co.uk/free-recipe-costing-calculator https://miseenprice.co.uk/recipe-costing-software https://miseenprice.co.uk/catering-recipe-costing
```

The command accepts exact HTTPS apex URLs in the current sitemap with a matching
self-canonical source page. It rejects app/external/www URLs, credentials, queries,
fragments, absent pages, the legacy demo and the privacy page. Duplicates collapse
into one URL. There is no implicit default batch.

The receipt contains a timestamp, endpoint, HTTP status and explicit URLs, not the
ownership key. Save the actual receipt in issue #77 after a real notification:

- 200: notification accepted. This does not prove indexing, ranking or a visit.
- 202: URL notification received, ownership key validation pending. Do not report
  ownership validation as complete.
- Other status/network failure: report the actual failure and investigate before
  another intentional attempt. A 429 must not trigger an immediate retry loop.

No successful production notification is claimed by this document or its tests.
Tests use fake HTTP responses. They never call the real IndexNow service.

## Existing Bing work

The Bing site was verified and its sitemap submission accepted on 16 November
2026. The homepage was shown as indexed. Bing accepted one indexing request each
for the calculator and recipe scanner. Do not recreate those actions. The GP page
request was only prepared, not confirmed submitted. Direct IndexNow does not
replace authenticated inspection of these results or Search/AI Performance.

PR #78's canonical/sitemap work is separate and unmerged. This command reads the
current sitemap/canonicals, so that later change does not require a hardcoded URL
inventory update. Do not merge the two PRs as an untested combined release.

## Sources

- https://www.indexnow.org/documentation
- https://www.bing.com/indexnow/getstarted

## Rollback

Revert this PR through the usual reviewed and tested release process. Remove only
its static ownership file, command and tests, and restore the prior package
scripts. This also stops future use of this command. Search engines control their
indexes; removing a key file does not retract prior notifications or indexed URLs.
