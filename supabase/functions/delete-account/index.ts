import { adminClient, json, preflight, requireUser, safeError, stripeClient } from "../_shared/common.ts";

const RECENT_SIGN_IN_MS = 15 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(request);
    let body: { email?: unknown; confirmation?: unknown };
    try {
      body = await request.json();
    } catch {
      return json(request, { error: "Enter your account email and type DELETE to confirm." }, 400);
    }

    const submittedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const accountEmail = user.email?.trim().toLowerCase() ?? "";
    if (!accountEmail || submittedEmail !== accountEmail || body.confirmation !== "DELETE") {
      return json(request, { error: "The email or confirmation did not match your account." }, 400);
    }

    const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : Number.NaN;
    const signInAge = Date.now() - lastSignIn;
    if (!Number.isFinite(lastSignIn) || signInAge < 0 || signInAge > RECENT_SIGN_IN_MS) {
      return json(request, { error: "For security, sign in again before deleting your account." }, 401);
    }

    const admin = adminClient();
    const { data: mapping, error: mappingError } = await admin
      .from("menu_margin_billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (mappingError) throw mappingError;

    if (mapping?.stripe_customer_id) {
      const stripe = await stripeClient();
      let cursor: string | undefined;
      while (true) {
        const subscriptions = await stripe.subscriptions.list({
          customer: mapping.stripe_customer_id,
          status: "all",
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        });

        for (const subscription of subscriptions.data) {
          if (subscription.status === "canceled" || subscription.status === "incomplete_expired") continue;
          // Cancel immediately before deleting the Supabase user. If Stripe is
          // unavailable, keep the account so the owner can retry safely.
          await stripe.subscriptions.cancel(subscription.id);
        }

        if (!subscriptions.has_more) break;
        cursor = subscriptions.data.at(-1)?.id;
        if (!cursor) throw new Error("Stripe returned an incomplete subscription page");
      }
    }

    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
    if (deletionError) throw deletionError;

    return json(request, { deleted: true });
  } catch (error) {
    return safeError(request, error);
  }
});
