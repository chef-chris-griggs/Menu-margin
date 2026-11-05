import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('card-free trial is authorized by server RPC, not browser storage',()=>{
 const auth=read('js/auth.js');
 assert.match(auth,/rpc\('menu_margin_start_cardless_trial'\)/);
 assert.match(auth,/await mmEnterApp\(mmUser,true\)/);
 assert.match(auth,/if\(trialError/);
});
test('server enforces one-time 14-day expiry and existing subscription access',()=>{
 const sql=read('supabase/migrations/20261104150000_cardless_trial.sql');
 assert.match(sql,/user_id uuid primary key/);
 assert.match(sql,/interval '14 days'/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.menu_margin_cardless_trials from anon, authenticated/);
 assert.match(sql,/on conflict\(user_id\) do nothing/);
 assert.match(sql,/ends_at>pg_catalog.now\(\)/);
 assert.match(sql,/menu_margin_access_grants/);
 assert.match(sql,/menu_margin_subscriptions/);
});
test('paid checkout never grants an additional Stripe trial',()=>{
 const checkout=read('supabase/functions/create-checkout-session/index.ts');
 assert.doesNotMatch(checkout,/trial_period_days/);
 assert.doesNotMatch(checkout,/checkout\\.sessions\\.list/);
 assert.match(checkout,/payment_method_collection: "always"/);
});
test('deleted account cannot restart a cardless trial with same verified email',()=>{
 const sql=read('supabase/migrations/20261105190000_persist_cardless_trial_identity.sql');
 assert.match(sql,/identity_fingerprint/);
 assert.match(sql,/menu_margin_cardless_trial_identity_unique/);
 assert.match(sql,/Free trial already used/);
 assert.match(sql,/email_confirmed_at is not null/);
 const auth=read('js/auth.js');
 assert.match(auth,/Free trial already used/);
});
