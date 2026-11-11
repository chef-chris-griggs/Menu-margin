-- Audit #41: remove redundant legacy permissive owner policies and avoid
-- per-row auth.uid() evaluation in subscription policies.
-- Staging: bzpiosxlhdvsnzxpmqfq. Tested 11 Nov 2026; both 0003 warnings
-- cleared and no 0006 warnings remained. Production NOT modified by this file.
--
-- SAFETY: only run after a successful two-account/anon/expired-trial RLS
-- regression in the target environment. Do not alter privileged RPCs, RLS
-- table settings, Stripe state, auth records or any stored recipe/price data.
--
-- Existing owner rows policy: PERMISSIVE ALL TO authenticated,
--   using (user_id = (select auth.uid()))
--   with check (user_id = (select auth.uid()))
-- Existing owner boundary policy: RESTRICTIVE ALL TO public,
--   using/with check (auth.uid() is not null and user_id = (select auth.uid()))
-- Existing paid access policy: RESTRICTIVE ALL TO public.
-- The eight removed legacy policies duplicate the owner rows policy;
-- their OR semantics do not expand access because the restrictive
-- owner+subscription policies still apply.

do $guard$
begin
  if (select count(*) from pg_policies
      where schemaname = 'public'
        and tablename in ('recipes','price_book')
        and policyname in (
          'menu margin owner boundary',
          'menu margin owner rows',
          'menu margin subscription required'
        )) <> 6
  then
    raise exception 'Missing owner or subscription policy; aborting RLS optimisation';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('recipes','price_book')
      and (
        (policyname = 'menu margin owner boundary' and permissive <> 'RESTRICTIVE')
        or (policyname = 'menu margin owner rows' and (permissive <> 'PERMISSIVE' or roles <> array['authenticated']::name[]))
        or (policyname = 'menu margin subscription required' and permissive <> 'RESTRICTIVE')
      )
  ) then
    raise exception 'Unexpected owner/subscription policy mode; aborting';
  end if;
end $guard$;

drop policy if exists "Users can view their own recipes" on public.recipes;
drop policy if exists "Users can create their own recipes" on public.recipes;
drop policy if exists "Users can update their own recipes" on public.recipes;
drop policy if exists "Users can delete their own recipes" on public.recipes;

drop policy if exists "Users can view their own price book" on public.price_book;
drop policy if exists "Users can add to their own price book" on public.price_book;
drop policy if exists "Users can update their own price book" on public.price_book;
drop policy if exists "Users can delete their own price book" on public.price_book;

drop policy if exists "menu margin subscription required" on public.recipes;
create policy "menu margin subscription required" on public.recipes
  as restrictive for all to public
  using ((select auth.uid()) is not null and (select public.menu_margin_has_paid_access()))
  with check ((select auth.uid()) is not null and (select public.menu_margin_has_paid_access()));

drop policy if exists "menu margin subscription required" on public.price_book;
create policy "menu margin subscription required" on public.price_book
  as restrictive for all to public
  using ((select auth.uid()) is not null and (select public.menu_margin_has_paid_access()))
  with check ((select auth.uid()) is not null and (select public.menu_margin_has_paid_access()));
