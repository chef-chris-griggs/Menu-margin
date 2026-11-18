-- Read-only, authenticated status of the current user's cardless trial.
-- Used to distinguish a first activation from a repeat click for optional GA4.
-- Does not modify trial eligibility, billing, or underlying trial records.
create or replace function public.menu_margin_my_trial_started_at()
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select t.started_at from public.menu_margin_cardless_trials t
  where t.user_id = (select auth.uid())
  limit 1
$$;
revoke all on function public.menu_margin_my_trial_started_at() from public, anon;
grant execute on function public.menu_margin_my_trial_started_at() to authenticated;
