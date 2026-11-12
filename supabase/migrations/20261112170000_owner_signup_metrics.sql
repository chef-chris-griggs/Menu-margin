-- Owner-only aggregate reporting. No customer identities, emails, or individual rows are returned.
-- SECURITY DEFINER is necessary to count auth.users and internal billing tables.
-- The authenticated caller MUST have the existing founder owner grant.
create or replace function public.menu_margin_owner_signup_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.menu_margin_access_grants g
    where g.user_id = (select auth.uid())
      and g.reason = 'founder_owner_comp_access'
  ) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  with today as (
    select (pg_catalog.now() at time zone 'Europe/London')::date as london_date
  ),
  registrations as (
    select count(*)::integer as total,
      count(*) filter (where email_confirmed_at is not null)::integer as confirmed,
      count(*) filter (where (created_at at time zone 'Europe/London')::date = (select london_date from today))::integer as today,
      count(*) filter (where (created_at at time zone 'Europe/London')::date = (select london_date from today)-1)::integer as yesterday
    from auth.users
  ),
  trials as (
    select count(*)::integer as started,
      count(*) filter (where ends_at > pg_catalog.now())::integer as active,
      count(*) filter (where (started_at at time zone 'Europe/London')::date = (select london_date from today))::integer as today,
      count(*) filter (where (started_at at time zone 'Europe/London')::date = (select london_date from today)-1)::integer as yesterday
    from public.menu_margin_cardless_trials
  ),
  billing as (
    select count(*) filter (where status = 'active' and current_period_end > pg_catalog.now())::integer as active_paid,
      count(*) filter (where status = 'trialing' and (current_period_end > pg_catalog.now() or trial_end > pg_catalog.now()))::integer as stripe_trialing
    from public.menu_margin_subscriptions
  ),
  founder as (
    select count(*)::integer as complimentary from public.menu_margin_access_grants
    where reason = 'founder_owner_comp_access'
  ),
  daily as (
    select d::date as day,
      (select count(*)::integer from auth.users u
        where (u.created_at at time zone 'Europe/London')::date = d::date) as registrations,
      (select count(*)::integer from public.menu_margin_cardless_trials t
        where (t.started_at at time zone 'Europe/London')::date = d::date) as trials
    from today cross join lateral pg_catalog.generate_series(today.london_date-13,today.london_date,interval '1 day') d
  )
  select pg_catalog.jsonb_build_object(
    'as_of',pg_catalog.now(),
    'timezone','Europe/London',
    'registrations',(select pg_catalog.to_jsonb(registrations) from registrations),
    'cardless_trials',(select pg_catalog.to_jsonb(trials) from trials),
    'subscriptions',(select pg_catalog.to_jsonb(billing) from billing),
    'owner_grants',(select pg_catalog.to_jsonb(founder) from founder),
    'daily',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',day,'registrations',registrations,'trials',trials) order by day) from daily)
  ) into result;
  return result;
end;
$function$;

revoke all on function public.menu_margin_owner_signup_metrics() from public, anon;
grant execute on function public.menu_margin_owner_signup_metrics() to authenticated;
