-- Preserve one-time trial history when a Supabase account is deleted.
-- HMAC hides normalized email addresses from offline dictionary attacks.
create table if not exists public.menu_margin_trial_key (
 singleton boolean primary key default true check (singleton),
 secret bytea not null
);
revoke all on public.menu_margin_trial_key from public, anon, authenticated;
alter table public.menu_margin_trial_key enable row level security;
insert into public.menu_margin_trial_key(singleton,secret)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

alter table public.menu_margin_cardless_trials
 add column if not exists identity_fingerprint text;
-- Existing trials must be backfilled before removing the FK.
update public.menu_margin_cardless_trials t
set identity_fingerprint = encode(extensions.hmac(
 lower(btrim(u.email))::bytea,
 (select secret from public.menu_margin_trial_key where singleton),
 'sha256'), 'hex')
from auth.users u
where u.id=t.user_id and t.identity_fingerprint is null;
do $$
begin
 if exists(select 1 from public.menu_margin_cardless_trials where identity_fingerprint is null) then
  raise exception 'Unmatched trial identities: migration stopped';
 end if;
end $$;
alter table public.menu_margin_cardless_trials
 alter column identity_fingerprint set not null;
create unique index if not exists menu_margin_cardless_trial_identity_unique
 on public.menu_margin_cardless_trials(identity_fingerprint);
alter table public.menu_margin_cardless_trials
 drop constraint if exists menu_margin_cardless_trials_user_id_fkey;

create or replace function public.menu_margin_start_cardless_trial()
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare
 uid uuid := (select auth.uid());
 email_address text;
 fingerprint text;
 deadline timestamptz;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.menu_margin_billing_enabled() then raise exception 'Billing is not enabled'; end if;
 select lower(btrim(email)) into email_address from auth.users
 where id=uid and email_confirmed_at is not null;
 if email_address is null or email_address='' then raise exception 'Verified email required'; end if;
 fingerprint := encode(extensions.hmac(email_address::bytea,
  (select secret from public.menu_margin_trial_key where singleton), 'sha256'), 'hex');
 if exists(select 1 from public.menu_margin_subscriptions where user_id=uid)
    or exists(select 1 from public.menu_margin_billing_customers where user_id=uid) then
    raise exception 'Existing billing account: manage your subscription';
 end if;
 -- Recreated accounts with the same verified email cannot reset the clock.
 select ends_at into deadline from public.menu_margin_cardless_trials
 where identity_fingerprint=fingerprint;
 if deadline is not null then
   if exists(select 1 from public.menu_margin_cardless_trials where user_id=uid and identity_fingerprint=fingerprint) then
     return deadline;
   end if;
   raise exception 'Free trial already used: subscribe to continue';
 end if;
 insert into public.menu_margin_cardless_trials(user_id,identity_fingerprint)
 values(uid,fingerprint)
 on conflict do nothing;
 select ends_at into deadline from public.menu_margin_cardless_trials
 where user_id=uid and identity_fingerprint=fingerprint;
 if deadline is null then raise exception 'Free trial already used: subscribe to continue'; end if;
 return deadline;
end $$;
revoke all on function public.menu_margin_start_cardless_trial() from public, anon;
grant execute on function public.menu_margin_start_cardless_trial() to authenticated;
