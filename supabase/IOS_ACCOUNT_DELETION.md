# iOS account deletion backend

The in-app Delete account action calls the Edge Function at supabase/functions/delete-account. Deploy it from this repository's Supabase project:

    supabase functions deploy delete-account
    supabase functions deploy stripe-webhook

The Stripe webhook change acknowledges terminal cancellation events that arrive after account deletion. It preserves the existing subscription handling for other events.

The function derives the user from the signed Supabase bearer token, requires the matching account email and exact DELETE confirmation, and requires a sign-in within the last 15 minutes. It cancels active Stripe subscriptions mapped to the account before deleting the auth user. If cancellation fails, deletion stops and the account remains available for retry. Supabase foreign-key cascades remove the account's cloud data.

Use the existing MenuMargin project secrets, including its Supabase service role key and Stripe secret key. Do not place either key in the iOS app. If no Stripe customer is mapped to the account, the function skips Stripe and deletes the account.

The iOS project can be built without deploying this function. In-app deletion remains unavailable until the function is deployed to the correct Supabase project.
