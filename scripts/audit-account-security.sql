-- Read-only catalog audit. Run in Supabase SQL Editor; no data is changed.
-- Policies in the catalog are not a substitute for the two-account API test.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('recipes','price_book');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('recipes','price_book')
order by tablename,policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('recipes','price_book')
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name,grantee,privilege_type;

select tc.table_name, kcu.column_name, ccu.table_schema as foreign_schema,
       ccu.table_name as foreign_table, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
join information_schema.referential_constraints rc
  on rc.constraint_name=tc.constraint_name and rc.constraint_schema=tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name=rc.unique_constraint_name and ccu.constraint_schema=rc.unique_constraint_schema
where tc.table_schema='public' and tc.table_name in ('recipes','price_book')
  and tc.constraint_type='FOREIGN KEY';
