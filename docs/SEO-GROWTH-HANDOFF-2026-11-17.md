# SEO growth execution handoff, 17 November 2026

## Completed work and limits

PR #78 has been integrated with current production `3b0c3ef` without conflicts.
Its original canonical consolidation, menu-costing section, factual WebPage markup
and browser coverage are retained. The soup walkthrough, copy/export continuity,
IndexNow file/command/tests and existing app code are retained. Full CI must pass
on this refreshed head before a separate production merge is proposed.

This document records source inspection and research. It does not claim a new
case study, video publication, outreach send, partnership, backlink, trial or sale.

## Conversion journey: source audit

| Stage | Existing evidence in source | Limit |
| --- | --- | --- |
| UK search visibility | Existing Search Console reporting connection | Search impressions/clicks are not trial records |
| Marketing visit/campaign | `marketing/analytics.js` opt-in tag and allowlisted UTM values | Consent-dependent website measurements |
| Calculator use | `calculator_interaction`, once per page after consent | Interaction, not registration |
| App handoff | `app_link_click` with `link_purpose` | No completed-trial event and no source-to-trial join |
| Account signup | `js/auth.js` calls `auth.signUp`; handles pending email confirmation | No campaign data is supplied in that call |
| Confirmed registration | Owner RPC counts confirmed auth records | Aggregate, not source-attributed or automatically qualified |
| Trial activation | `mmStartTrial` waits for the server RPC and future trial end | Success is authoritative; clicking the button is not success |
| Trial totals | Owner RPC counts `menu_margin_cardless_trials` | No campaign/landing dimension or explicit test exclusion in this aggregate |
| Paid subscription | Owner RPC counts active DB subscriptions with future period end | Requires Stripe reconciliation and owner/test classification before acquisition claims |

Inspection covered owned `js/` modules, marketing analytics, billing functions and
the owner reporting migration. No Google tag, campaign attribution or confirmed
signup/trial marketing event was found in the owned app modules. The website and
app use separate hostnames. Owner aggregate reporting already exists and must not
be rebuilt or described as absent. No customer rows or billing settings were read
or changed for this source audit.

### Next implementation boundary

Prepare a separately reviewed measurement change. Define consent on each domain,
allowlisted campaign/landing values, retention and owner/test classification before
any instrumentation or schema work. Record confirmed registration, first successful
server trial activation and verified active paid subscription as distinct stages.
Do not infer anonymous visitor-to-account attribution from matching timestamps.
Unknown/direct must stay unknown. Do not send emails, recipe text, auth tokens,
invoice data or customer identities into analytics. Do not change billing/auth/RLS
or introduce database writes under this documentation-only audit.

Acceptance checks for that future change:

- Trial button click followed by an RPC error produces no conversion.
- Pending email confirmation is not a confirmed registration.
- Repeated activation/login does not create additional trial conversions.
- Owner/test accounts are separated without deleting or changing their data.
- Declined analytics consent produces no marketing measurement event.
- Query strings/auth links do not leak identity or arbitrary values.
- Paid status is reconciled against Stripe, not estimated from clicks or trial totals.

## Genuine kitchen case-study evidence sheet

Status: awaiting actual chef-approved figures. The published £24 soup example uses
illustrative prices/yield and must keep that label. It is not a measured customer
result. No supplier invoice or customer recipe has been repurposed for publication.

To produce a publishable first-hand case study, retain these records privately and
approve the final anonymised presentation:

| Evidence | Required value |
| --- | --- |
| Recipe/dish | Actual recipe and included sides, garnish and consumables |
| Ingredient rows | Quantity used, unit, purchased pack quantity/unit and dated pack price |
| VAT basis | A consistent stated basis for cost and selling price |
| Yield | Measured cooked/saleable yield and number of saleable portions |
| Selling price | Actual price, with VAT treatment stated |
| Price change | Two dated prices for the same pack if claiming an increase |
| Time claim | Observed start/end and method if claiming time saved; otherwise omit |
| Permission | Chef/recipe owner approval and any employer/supplier confidentiality limits |

Publish only supported figures: batch cost, portion cost, cash ingredient GP and
GP percentage, with labour/waste/overhead scope explicit. Independently recalculate
before comparing with the app. Remove business/contact/invoice identifiers. Capture
the actual entered figures in the real app. Seek approval for the final case study
before publication; never fill missing cells with invented supplier prices.

## Sales handoff: existing thread first

A Gmail search and full thread read found the Craft Guild already received an
unpaid educational contribution proposal on 10 November, sent to its general
enquiries address. Message/thread ID: `1a1c60835a1e3478`. Subject: “Unpaid training
contribution: checking purchase units before recipe costing”. The visible thread
contains that one sent message and no reply. The pitch already covers multipacks,
sides and yield, so do not send a new cold pitch to its editor David Foad as if
uncontacted. Public Sector Catering and Craft Guild list the same editor; person
and publication overlap needs the sole sales operator's reconciliation.

Suggested follow-up direction, draft for sales review only: ask within the existing
conversation whether its training/resource editor would like to review the now-live
whole-dish worked example. Disclose sample prices and commercial founder interest.
No payment, placement, backlink or editorial acceptance is promised. No message was
sent or scheduled by this handoff. Keep exact-recipient/message approval, suppression,
shared-cap and sending-window checks.

## Researched training/consultancy candidates

| Candidate | Evidence and proposed relevance | Contact and checks |
| --- | --- | --- |
| Chef Academy London | Its menu-costing/design page explicitly offers costing reviews and training staff to create/price menus. Possible free classroom exercise using the existing calculator. | Official page lists `info@chefacademyoflondon.com`. Gmail domain/address search returned no rows on 17 Nov. This is not a full CRM/suppression check or a send authorisation. |
| CF Food Consultancy | Official search result describes menu composition with costings, supplier advice and GP workshops. Possible practical tool review by a consultant. | Primary result lists `cale@cffoodconsultancy.co.uk`, Birmingham. Direct page retrieval returned 502; reverify official details before approval. Gmail domain/address search returned no rows. Candidate, not fully cleared contact. |

Research sources checked on 17 November:

- https://www.chefacademyoflondon.com/en/58-consultancy/783-f-b-menu-costing-and-design.html
- https://www.cffoodconsultancy.co.uk/
- https://craftguildofchefs.org/contact-us
- https://www.publicsectorcatering.co.uk/contact (direct retrieval 403; official search result lists David Foad)

The sales operator should reconcile its live queue, CRM, replies, opt-outs and daily
count before drafting or requesting exact-message approval. No new qualified-contact
count, partnership, referral or send is claimed by this research. Do not offer paid
sponsorship, commission, discounts or another commitment within the £0 brief.
