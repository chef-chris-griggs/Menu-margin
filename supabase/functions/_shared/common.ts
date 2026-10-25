import { createClient } from "npm:@supabase/supabase-js@2.49.1";

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback;
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function keyFromJson(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0];
  } catch {
    return undefined;
  }
}

export function publicKey(): string {
  return env("SUPABASE_PUBLISHABLE_KEY", Deno.env.get("SUPABASE_ANON_KEY") ?? keyFromJson("SUPABASE_PUBLISHABLE_KEYS"));
}

export function adminClient() {
  const secret = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? keyFromJson("SUPABASE_SECRET_KEYS");
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY", secret), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new Response("Sign in required", { status: 401 });
  const client = createClient(env("SUPABASE_URL"), publicKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new Response("Sign in required", { status: 401 });
  return data.user;
}

function appOrigin(): string {
  return new URL(env("APP_URL")).origin;
}

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": appOrigin(),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers(corsHeaders());
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function stripeClient() {
  return import("npm:stripe@17.7.0").then(({ default: Stripe }) => {
    const client = new Stripe(env("STRIPE_SECRET_KEY"));
    return client;
  });
}

export function safeError(request: Request, error: unknown): Response {
  if (error instanceof Response) return json(request, { error: error.status === 401 ? "Sign in required" : "Request rejected" }, error.status);
  console.error("MenuMargin billing request failed", error);
  return json(request, { error: "Billing service is temporarily unavailable. Please try again." }, 500);
}
