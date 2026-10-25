import Stripe from "npm:stripe@17.7.0";
import { adminClient, env } from "../_shared/common.ts";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"));
const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function syncSubscription(subscriptionId: string) {
  // Fetch Stripe's current object so out-of-order webhook delivery cannot roll
  // a user's access back to an older subscription status.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const admin = adminClient();
  const { data: mapping, error: mappingError } = await admin
    .from("menu_margin_billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (mappingError) throw mappingError;
  const userId = mapping?.user_id ?? subscription.metadata?.supabase_user_id;
  if (!userId) throw new Error(`No MenuMargin account is mapped to Stripe customer ${customerId}`);

  const item = subscription.items.data[0];
  const { error } = await admin.from("menu_margin_subscriptions").upsert({
    stripe_subscription_id: subscription.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: subscription.status,
    price_id: item?.price?.id ?? null,
    current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
  if (error) throw error;
}

function asStripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = adminClient();
  const { data: seen, error: lookupError } = await admin
    .from("menu_margin_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (lookupError) return new Response("Could not check webhook receipt", { status: 500 });
  if (seen) return Response.json({ received: true, duplicate: true });

  try {
    const object = event.data.object as unknown as Record<string, unknown>;
    let subscriptionId: string | null = null;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      subscriptionId = asStripeId(object.subscription);
    } else if (event.type.startsWith("customer.subscription.")) {
      subscriptionId = asStripeId(object.id);
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      subscriptionId = asStripeId(object.subscription);
    }
    if (subscriptionId) await syncSubscription(subscriptionId);

    const { error: recordError } = await admin.from("menu_margin_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
    });
    if (recordError && recordError.code !== "23505") throw recordError;
    return Response.json({ received: true });
  } catch (error) {
    // Non-2xx lets Stripe retry transient failures. Upserts make successful
    // subscription synchronization safe to repeat.
    console.error(`Stripe event ${event.id} could not be applied`, error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
