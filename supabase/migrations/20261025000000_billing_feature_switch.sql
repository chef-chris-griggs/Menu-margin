-- Billing remains disabled until the owner finishes Stripe setup. When it is
-- enabled, the same server-owned switch gates both the app UI and database.
create table if not exists public.menu_margin_app_config (
  singleton boolean primary key default true check (singleton is true),
  billing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.menu_margin_app_config (singleton, billing_enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.menu_margin_app_config enable row level security;
revoke all on public.menu_margin_app_config from public, anon, authenticated;

create or replace function public.menu_margin_billing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.billing_enabled
    from public.menu_margin_app_config c
    where c.singleton is true
  ), false);
$$;

revoke all on function public.menu_margin_billing_enabled() from public;
grant execute on function public.menu_margin_billing_enabled() to anon, authenticated;

create or replace function public.menu_margin_has_paid_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.menu_margin_billing_enabled()
    or exists (
      select 1
      from public.menu_margin_access_grants g
      where g.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.menu_margin_subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;

revoke all on function public.menu_margin_has_paid_access() from public;
grant execute on function public.menu_margin_has_paid_access() to anon, authenticated;

-- Keep subscription status as the single source of truth when paid access is
-- turned on. With the default off, the app continues to work before Stripe is
-- configured and deployed.
drop policy if exists "menu margin subscription required" on public.recipes;
create policy "menu margin subscription required" on public.recipes
  as restrictive for all to public
  using (auth.uid() is not null and (select public.menu_margin_has_paid_access()))
  with check (auth.uid() is not null and (select public.menu_margin_has_paid_access()));

drop policy if exists "menu margin subscription required" on public.price_book;
create policy "menu margin subscription required" on public.price_book
  as restrictive for all to public
  using (auth.uid() is not null and (select public.menu_margin_has_paid_access()))
  with check (auth.uid() is not null and (select public.menu_margin_has_paid_access()));
