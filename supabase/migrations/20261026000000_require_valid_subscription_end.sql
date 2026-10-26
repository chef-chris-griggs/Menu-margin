-- Do not grant paid access forever when a subscription row is incomplete.
-- Trialing subscriptions may use trial_end while current_period_end is absent;
-- active subscriptions must have a future current_period_end.
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
        and (
          s.current_period_end > pg_catalog.now()
          or (s.status = 'trialing' and s.trial_end > pg_catalog.now())
        )
    );
$$;

revoke all on function public.menu_margin_has_paid_access() from public;
grant execute on function public.menu_margin_has_paid_access() to anon, authenticated;
