-- Stripe is authoritative for subscription state. The client can read its own
-- subscription but cannot write billing state or customer mappings.
-- Keep the core schema in migrations so a fresh Supabase project can be set up
-- from this folder without relying on tables created in an earlier prototype.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled recipe',
  recipe_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_book (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_user_updated
  on public.recipes (user_id, updated_at desc);
create index if not exists price_book_user_updated
  on public.price_book (user_id, updated_at desc);

create table if not exists public.menu_margin_billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_margin_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists menu_margin_subscriptions_user_updated
  on public.menu_margin_subscriptions (user_id, updated_at desc);

create table if not exists public.menu_margin_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  granted_at timestamptz not null default now()
);

create table if not exists public.menu_margin_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.menu_margin_billing_customers enable row level security;
alter table public.menu_margin_subscriptions enable row level security;
alter table public.menu_margin_access_grants enable row level security;
alter table public.menu_margin_webhook_events enable row level security;

revoke all on public.menu_margin_billing_customers from anon, authenticated;
revoke all on public.menu_margin_access_grants from anon, authenticated;
revoke all on public.menu_margin_webhook_events from anon, authenticated;
revoke all on public.menu_margin_subscriptions from anon, authenticated;
grant select on public.menu_margin_subscriptions to authenticated;

drop policy if exists "menu margin read own subscription" on public.menu_margin_subscriptions;
create policy "menu margin read own subscription"
  on public.menu_margin_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.menu_margin_has_paid_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.menu_margin_access_grants g
    where g.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.menu_margin_subscriptions s
    where s.user_id = (select auth.uid())
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

revoke all on function public.menu_margin_has_paid_access() from public, anon;
-- The function only returns a boolean for auth.uid(); granting the safe false
-- result to anon lets the restrictive policies reject unauthenticated requests.
grant execute on function public.menu_margin_has_paid_access() to anon, authenticated;

-- Keep existing policies intact while adding owner checks and a subscription
-- requirement. Restrictive policies AND with existing permissive policies.
alter table public.recipes enable row level security;
alter table public.price_book enable row level security;

-- Remove any broad table grants left by an earlier prototype. These tables are
-- accessed only through authenticated, row-scoped PostgREST requests.
revoke all on public.recipes, public.price_book from public, anon, authenticated;
grant select, insert, update, delete on public.recipes, public.price_book to authenticated;

drop policy if exists "menu margin owner rows" on public.recipes;
create policy "menu margin owner rows" on public.recipes
  as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "menu margin owner boundary" on public.recipes;
create policy "menu margin owner boundary" on public.recipes
  as restrictive for all to public
  using (auth.uid() is not null and user_id = (select auth.uid()))
  with check (auth.uid() is not null and user_id = (select auth.uid()));

drop policy if exists "menu margin subscription required" on public.recipes;
create policy "menu margin subscription required" on public.recipes
  as restrictive for all to public
  using (auth.uid() is not null and (select public.menu_margin_has_paid_access()))
  with check (auth.uid() is not null and (select public.menu_margin_has_paid_access()));

drop policy if exists "menu margin owner rows" on public.price_book;
create policy "menu margin owner rows" on public.price_book
  as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "menu margin owner boundary" on public.price_book;
create policy "menu margin owner boundary" on public.price_book
  as restrictive for all to public
  using (auth.uid() is not null and user_id = (select auth.uid()))
  with check (auth.uid() is not null and user_id = (select auth.uid()));

drop policy if exists "menu margin subscription required" on public.price_book;
create policy "menu margin subscription required" on public.price_book
  as restrictive for all to public
  using (auth.uid() is not null and (select public.menu_margin_has_paid_access()))
  with check (auth.uid() is not null and (select public.menu_margin_has_paid_access()));
