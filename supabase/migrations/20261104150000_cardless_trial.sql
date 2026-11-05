-- Card-free trial, server-authoritative and one-time per authenticated account.
create table if not exists public.menu_margin_cardless_trials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 started_at timestamptz not null default now(),
 ends_at timestamptz not null default (now() + interval '14 days'),
 constraint trial_14_days check (ends_at = started_at + interval '14 days')
);
alter table public.menu_margin_cardless_trials enable row level security;
revoke all on public.menu_margin_cardless_trials from anon, authenticated;
-- Trial activation is restricted to authenticated users; no direct table writes.
create or replace function public.menu_margin_start_cardless_trial()
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare uid uuid := (select auth.uid()); deadline timestamptz;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.menu_margin_billing_enabled() then raise exception 'Billing is not enabled'; end if;
 if exists(select 1 from public.menu_margin_subscriptions where user_id=uid)
    or exists(select 1 from public.menu_margin_billing_customers where user_id=uid) then
    raise exception 'Existing billing account: manage your subscription';
 end if;
 insert into public.menu_margin_cardless_trials(user_id) values(uid)
 on conflict(user_id) do nothing;
 select ends_at into deadline from public.menu_margin_cardless_trials where user_id=uid;
 return deadline;
end $$;
revoke all on function public.menu_margin_start_cardless_trial() from public, anon;
grant execute on function public.menu_margin_start_cardless_trial() to authenticated;

create or replace function public.menu_margin_has_paid_access()
returns boolean language sql stable security definer set search_path = ''
as $$
 select not public.menu_margin_billing_enabled()
 or exists(select 1 from public.menu_margin_access_grants g where g.user_id=(select auth.uid()))
 or exists(select 1 from public.menu_margin_cardless_trials t where t.user_id=(select auth.uid()) and t.ends_at>pg_catalog.now())
 or exists(select 1 from public.menu_margin_subscriptions s
 where s.user_id=(select auth.uid()) and s.status in ('active','trialing')
 and (s.current_period_end>pg_catalog.now() or (s.status='trialing' and s.trial_end>pg_catalog.now())));
$$;
