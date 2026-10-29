# Authentication email delivery

The contact inbox is `admin.menumargin@gmail.com`. Receiving support emails at
that inbox is separate from configuring Supabase to send signup confirmations
and password-reset messages to customers.

## Current situation

The owner reported an email rate-limit error during reset testing. We have not
inspected the project's SMTP configuration or its remaining quota. Do not keep
requesting emails while the server is rate limiting them. The error alone does
not identify the exact remaining wait.

Supabase currently documents two emails per hour across a project using the
built-in sender, plus a default 60-second per-user reset-request interval. The
built-in sender is also restricted to project-team recipients and is intended
for setup/testing, rather than public customer authentication:
[rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

MenuMargin 2.1.3 prevents double-click sends, keeps a 60-second local resend
cooldown across reloads, and explains server email-quota errors. It never
automatically resends. The local cooldown does not lift the server quota, and
the app does not claim the server limit resets when its countdown finishes.

## Owner setup before public signup

1. Check Supabase Authentication's SMTP settings to identify the current sender.
   If no production sender is configured, arrange one before inviting customers.
2. Choose a domain you control and a sending service supporting SMTP. Verify
   the sender and configure the provider's required DNS records (SPF/DKIM and
   an appropriate DMARC policy). Keep the Gmail inbox for support if desired.
   No domain purchase or provider account has been made by this work.
3. Put the provider's SMTP host, port, username, credential and verified sender
   address into **Supabase's custom SMTP settings**. Keep the credential out of
   browser code, this repository, screenshots and chat.
4. Review the project's email rate limit against the provider's actual allowance.
   Configuring custom SMTP does not remove all sending or endpoint limits.
   Keep account verification enabled; disabling it is not a delivery fix.
5. Retain the production Site URL. The owner added this private test redirect:

       https://menumargin-launch-phone-test.chrisgriggs2021.chatgpt.site/**

   For the GitHub production deployment, allow its exact app and recovery URLs:

       https://chef-chris-griggs.github.io/Menu-margin/
       https://chef-chris-griggs.github.io/Menu-margin/?auth=recovery

   Reset templates must use Supabase's verification/confirmation link and honor
   the requested redirect, rather than hard-coding a different app. See
   [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
6. After the service is ready, test actual signup/verification and password reset
   for a disposable account. Open the newest email in the intended browser,
   confirm the password form appears, set a new password and sign in again.
   Also verify sender identity, spam delivery, expiry and support requests.

The real-email reset check remains pending. Passing the intercepted browser
fixtures establishes client behavior, not real SMTP delivery or quota capacity.
