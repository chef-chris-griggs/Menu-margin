import { adminClient, env, json, preflight, requireUser, safeError, stripeClient } from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const user = await requireUser(request);
    const admin = adminClient();
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

    const trialDays = Math.max(0, Math.min(30, Number.parseInt(Deno.env.get("STRIPE_TRIAL_DAYS") ?? "14", 10) || 0));
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
