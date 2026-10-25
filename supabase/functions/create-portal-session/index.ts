import { adminClient, env, json, preflight, requireUser, safeError, stripeClient } from "../_shared/common.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const user = await requireUser(request);
    const admin = adminClient();
    const { data: mapping, error } = await admin
      .from("menu_margin_billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!mapping) return json(request, { error: "No billing account was found." }, 404);

    const stripe = await stripeClient();
    const portal = await stripe.billingPortal.sessions.create({
      customer: mapping.stripe_customer_id,
      return_url: new URL(env("APP_URL")).toString(),
    });
    return json(request, { url: portal.url });
  } catch (error) {
    return safeError(request, error);
  }
});
