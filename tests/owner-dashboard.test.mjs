import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261112170000_owner_signup_metrics.sql');
const page = read('owner-dashboard.html');
const js = read('js/owner-dashboard.js');

test('owner metrics RPC requires an authenticated founder grant', () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /g\.reason = 'founder_owner_comp_access'/);
  assert.match(sql, /raise exception 'Owner access required'/);
  assert.match(sql, /revoke all on function public\.menu_margin_owner_signup_metrics\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.menu_margin_owner_signup_metrics\(\) to authenticated/i);
});

test('metrics return only aggregates, without individual emails or identities', () => {
  assert.match(sql, /count\(\*\)/i);
  assert.match(sql, /'daily'/);
  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*'email'/i);
  assert.doesNotMatch(sql, /select\s+\*/i);
  assert.match(js, /\.rpc\('menu_margin_owner_signup_metrics'\)/);
  assert.doesNotMatch(js, /service_role|sb_secret_/i);
  assert.doesNotMatch(page, /service_role|sb_secret_/i);
});

test('dashboard is private/noindexed and does not invent customer attribution', () => {
  assert.match(page, /noindex,nofollow,noarchive/);
  assert.match(page, /registrations and trials/i);
  assert.match(page, /including tests/i);
  assert.match(page, /Stripe/);
  assert.match(js, /auth\.getUser\(\)/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML/);
});
