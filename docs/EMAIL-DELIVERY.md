# Authentication email delivery — Mise en Price

## Production setup observed 11 November 2026

- The owner added and verified **miseenprice.co.uk** in Resend, region Ireland. DKIM and the two CNAME sending records were marked verified in Resend.
- The owner configured Supabase Auth custom SMTP for the production project with sender `no-reply@miseenprice.co.uk`, sender name Mise en Price, host `smtp.resend.com`, port `465`, username `resend`, and a private Resend API key as password. The Supabase UI reported the settings successfully saved.
- **Owner-reported test update (11 November 2026):** The owner confirmed that signup emails arrived with Mise en Price branding, forgot-password email/recovery worked, and two additional checks were successful. These are owner-reported manual checks, not independently verified end-to-end CI results. The complete new-user signup → confirmation → trial → recipe persistence → billing journey and redirect/expiry edge cases remain unverified; do not mark the full funnel passed.
- Do not put Resend API keys or other secrets into GitHub, chat, browser code or screenshots.
- The existing support inbox `admin.menumargin@gmail.com` is separate from outgoing Supabase Auth emails. Do not change its routing without verifying replacement support delivery.
- Cloudflare email routing and existing records must be retained. The suggested DMARC record should be checked against existing policy before adding it.

## Launch verification checklist (disposable mailbox, no customer data)

1. Confirm that Supabase Authentication has custom SMTP enabled and the settings saved. Keep email confirmation enabled.
2. Verify the actual production **Site URL** and allowlisted redirect URLs match the current deployed Cloudflare Pages application. Avoid obsolete GitHub Pages or temporary test redirect paths.
3. From the public marketing site, click **Start your free 14-day trial**. Follow the link to the real app and register a fresh, controlled address not present on the Supabase project team.
4. Confirm exactly one signup-confirmation email arrives from `no-reply@miseenprice.co.uk`; check spam, the clicked link's host and the resulting application session.
5. Confirm the new account is confirmed and can start the free cardless 14-day trial **once**. Check a recipe can be saved and retrieved after sign-out/sign-in.
6. Use **Forgot password?** for that disposable account. Verify an actual email, the correct reset screen, password update and subsequent sign-in.
7. Review Supabase Auth logs and Resend email logs for failed delivery, quota, sender authentication or incorrect redirect evidence. Respect per-user rate limits; do not repeatedly retry.
8. Confirm email-sending limits and abuse controls (including CAPTCHA feasibility) are appropriate before increasing traffic.
9. Record dated outcomes and screenshots with any secrets or customer details hidden. A saved SMTP setting is **not** proof of working customer registration.

## Prior context

The earlier Supabase built-in sender was restricted to project-team addresses and an extremely low hourly limit. This is why custom SMTP was established.

The browser client already includes a resend cooldown and simulated password-recovery tests, but those are not substitutes for the real-email end-to-end checks above.

References:
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
