import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = read('supabase/migrations/20261023000000_subscription_billing.sql');
const switchSql = read('supabase/migrations/20261025000000_billing_feature_switch.sql');
const trial = read('supabase/migrations/20261104150000_cardless_trial.sql');
const identity = read('supabase/migrations/20261105190000_persist_cardless_trial_identity.sql');

// Source-contract regression checks only. Live RLS, grants, and role-based RPC
// behaviour require independent staging tests with disposable accounts.
test('private billing tables have RLS and revoke anonymous/client access', () => {
  for (const name of ['menu_margin_billing_customers', 'menu_margin_access_grants', 'menu_margin_webhook_events']) {
    assert.match(base, new RegExp('alter table public\\.' + name + ' enable row level security', 'i'));
    assert.match(base, new RegExp('revoke all on public\\.' + name + ' from anon, authenticated', 'i'));
  }
  assert.match(switchSql, /revoke all on public\.menu_margin_app_config from public, anon, authenticated/i);
  assert.match(trial, /revoke all on public\.menu_margin_cardless_trials from anon, authenticated/i);
  assert.match(identity, /revoke all on public\.menu_margin_trial_key from public, anon, authenticated/i);
});

test('recipe and price book require row ownership for both existing and new data', () => {
  for (const table of ['recipes', 'price_book']) {
    const start = base.indexOf('create policy "menu margin owner boundary" on public.' + table);
    assert.ok(start >= 0, 'missing restrictive owner boundary for ' + table);
    const section = base.slice(start, base.indexOf(';', start));
    assert.match(section, /as restrictive for all to public/i);
    assert.match(section, /using\s*\(auth\.uid\(\) is not null and user_id = \(select auth\.uid\(\)\)\)/i);
    assert.match(section, /with check\s*\(auth\.uid\(\) is not null and user_id = \(select auth\.uid\(\)\)\)/i);
  }
});

test('cardless trial RPC requires authenticated identity and confirmed email', () => {
  assert.match(identity, /uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(identity, /if uid is null then raise exception 'Authentication required'/i);
  assert.match(identity, /email_confirmed_at is not null/i);
  assert.match(identity, /if email_address is null or email_address='' then raise exception 'Verified email required'/i);
  assert.match(identity, /revoke all on function public\.menu_margin_start_cardless_trial\(\) from public, anon/i);
  assert.match(identity, /grant execute on function public\.menu_margin_start_cardless_trial\(\) to authenticated/i);
});

test('one trial per verified email survives account deletion', () => {
  assert.match(identity, /identity_fingerprint text/i);
  assert.match(identity, /create unique index if not exists menu_margin_cardless_trial_identity_unique/i);
  assert.match(identity, /extensions\.hmac\(email_address::bytea/i);
  assert.match(identity, /where identity_fingerprint=fingerprint/i);
  assert.match(identity, /Free trial already used: subscribe to continue/i);
  assert.match(identity, /Existing billing account: manage your subscription/i);
});

test('privileged functions use restricted search paths', () => {
  for (const sql of [base, switchSql, trial, identity]) {
    const functions = [...sql.matchAll(/create or replace function public\.menu_margin_\w+\(\)[\s\S]*?as \$\$/gi)];
    for (const [header] of functions) assert.match(header, /security definer\s+set search_path = ''/i);
  }
});

test('RLS optimisation preserves owner and paid-access checks', () => {
  const sql = read('supabase/migrations/20261111211500_optimize_rls_policy_performance.sql');
  for (const table of ['recipes', 'price_book']) {
    assert.match(sql, new RegExp('create policy "menu margin subscription required" on public\\.' + table));
    assert.match(sql, /as restrictive for all to public/i);
    assert.match(sql, /using \(\(select auth\.uid\(\)\) is not null and \(select public\.menu_margin_has_paid_access\(\)\)\)/i);
    assert.match(sql, /with check \(\(select auth\.uid\(\)\) is not null and \(select public\.menu_margin_has_paid_access\(\)\)\)/i);
  }
  assert.match(sql, /Missing owner or subscription policy/);
  assert.match(sql, /Unexpected owner\/subscription policy mode/);
  for (const operation of ['view','create','update','delete']) {
    assert.match(sql, new RegExp('drop policy if exists "Users can ' + operation + ' their own recipes" on public\\.recipes', 'i'));
  }
  for (const operation of ['view','add to','update','delete']) {
    assert.match(sql, new RegExp('drop policy if exists "Users can ' + operation + ' their own price book" on public\\.price_book', 'i'));
  }
  assert.doesNotMatch(sql, /drop policy.*"menu margin owner (rows|boundary)"/i);
  assert.doesNotMatch(sql, /revoke .* on public\.(recipes|price_book)/i);
});
