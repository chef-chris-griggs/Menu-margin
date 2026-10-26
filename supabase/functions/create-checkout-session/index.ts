import { adminClient, env, json, preflight, requireUser, safeError, stripeClient } from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const user = await requireUser(request);
    const admin = adminClient();
    const { data: billingConfig, error: configError } = await admin
      .from("menu_margin_app_config")
      .select("billing_enabled")
      .eq("singleton", true)
      .maybeSingle();
    if (configError) throw configError;
    if (billingConfig?.billing_enabled !== true) {
      return json(request, { error: "Billing is not available yet.", code: "billing_disabled" }, 403);
    }
    const stripe = await stripeClient();

    const { data: current, error: currentError } = await admin
      .from("menu_margin_subscriptions")
      .select("stripe_subscription_id,status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .limit(1);
    if (currentError) throw currentError;
    if (current?.length) return json(request, { error: "Subscription already active", code: "already_subscribed" }, 409);

    let { data: mapping, error: mappingError } = await admin
      .from("menu_margin_billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (mappingError) throw mappingError;

    if (!mapping) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      }, { idempotencyKey: `menumargin-customer-${user.id}` });
      const { error: saveMappingError } = await admin
        .from("menu_margin_billing_customers")
        .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true });
      if (saveMappingError) throw saveMappingError;
      const { data: stored, error: rereadError } = await admin
        .from("menu_margin_billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .single();
      if (rereadError) throw rereadError;
      mapping = stored;
    }

    const existingSessions = await stripe.checkout.sessions.list({
      customer: mapping.stripe_customer_id,
      status: "open",
      limit: 1,
    });
    if (existingSessions.data[0]?.url) return json(request, { url: existingSessions.data[0].url });

    let cursor: string | undefined;
    let hasUsedTrial = false;
    while (true) {
      const subscriptions = await stripe.subscriptions.list({
        customer: mapping.stripe_customer_id,
        status: "all",
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      });
      const hasUnresolvedSubscription = subscriptions.data.some((subscription) =>
        subscription.status !== "canceled" && subscription.status !== "incomplete_expired"
      );
      if (hasUnresolvedSubscription) {
        return json(request, { error: "A subscription already exists for this account. Use Manage billing to update it.", code: "subscription_exists" }, 409);
      }
      hasUsedTrial ||= subscriptions.data.some((subscription) => Boolean(subscription.trial_start || subscription.trial_end));
      if (hasUsedTrial || !subscriptions.has_more) break;
      cursor = subscriptions.data.at(-1)?.id;
      if (!cursor) break;
    }

    // One trial per Stripe customer prevents the same account from restarting
    // a fresh free period after canceling a previous trial.
    const configuredTrialDays = Math.max(0, Math.min(30, Number.parseInt(Deno.env.get("STRIPE_TRIAL_DAYS") ?? "14", 10) || 0));
    const trialDays = hasUsedTrial ? 0 : configuredTrialDays;
    const appUrl = new URL(env("APP_URL"));
    const successUrl = new URL(appUrl);
    successUrl.searchParams.set("billing", "success");
    const cancelUrl = new URL(appUrl);
    cancelUrl.searchParams.set("billing", "cancelled");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: mapping.stripe_customer_id,
      client_reference_id: user.id,
      line_items: [{ price: env("STRIPE_PRICE_ID_MONTHLY"), quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        metadata: { supabase_user_id: user.id },
      },
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
    }, { idempotencyKey: `menumargin-checkout-${user.id}-${Math.floor(Date.now() / 30000)}` });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return json(request, { url: session.url });
  } catch (error) {
    return safeError(request, error);
  }
});
