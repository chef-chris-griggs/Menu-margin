// Real PostgreSQL RLS using canonical repository migrations in a disposable,
// network-isolated container. Identity claims are supplied by this test adapter;
// this is NOT a test of GoTrue/JWT verification or the deployed Supabase project.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const image='postgres@sha256:846a7ddaa67a4b354ae1d21087b683901aa6113a4ed626d3787cfbf6c85e3e07';
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=(args,input)=>spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,input,encoding:'utf8',maxBuffer:4*1024*1024});
const name='mep-rls-'+randomUUID();let started=false;const checks=[];
const sql=(text)=>docker(['exec','-i',name,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres'],text);
const run=text=>{const r=sql(text);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const denied=text=>{const r=sql(text);assert.notEqual(r.status,0,'Operation must be denied');assert.match(r.stderr,/42501/,'Expected PostgreSQL permission/RLS denial');};
const a=randomUUID(),b=randomUUID(),c=randomUUID(),recipe=randomUUID(),price=randomUUID();
const as=(id,text)=>`set role authenticated; set request.jwt.claim.sub='${id}'; ${text}`;
try{
 const r=docker(['run','--rm','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);assert.equal(r.status,0,r.stderr);started=true;
 let ready=false;for(let n=0;n<60;n++){if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await new Promise(ok=>setTimeout(ok,250));}assert.ok(ready,'Local test database must start');
 run(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())run(await readFile(new URL(file,dir),'utf8'));
 checks.push('All repository migrations apply to the disposable PostgreSQL fixture');
 run(`insert into auth.users(id,email,email_confirmed_at)values('${a}','a@example.invalid',now()),('${b}','b@example.invalid',now()),('${c}','c@example.invalid',now());update public.menu_margin_app_config set billing_enabled=true;`);
 run(as(a,`select public.menu_margin_start_cardless_trial();insert into public.recipes(id,user_id,name,recipe_data)values('${recipe}','${a}','Local recipe','{"ingredients":[{"priceBookId":"${price}","qty":200,"qtyUnit":"ml"}]}');insert into public.price_book(id,user_id,item_data)values('${price}','${a}','{"name":"Olive oil","packBase":5000,"baseUnit":"ml","price":25}');`));
 run(as(b,'select public.menu_margin_start_cardless_trial();'));
 assert.equal(run(as(a,`select recipe_data->'ingredients'->0->>'priceBookId' from public.recipes where id='${recipe}';`)),price);
 assert.equal(run(as(a,`select item_data->>'price' from public.price_book where id='${price}';`)),'25');
 checks.push('Verified local identities activate the real trial RPC; owner recipe and price-book insert/read preserve supplier link');
 for(const [table,id] of [['recipes',recipe],['price_book',price]]){
  assert.equal(run(as(b,`select count(*) from public.${table} where id='${id}';`)),'0');
  assert.equal(run(as(b,`with changed as(update public.${table} set user_id='${b}' where id='${id}' returning id)select count(*) from changed;`)),'0');
  assert.equal(run(as(b,`with changed as(delete from public.${table} where id='${id}' returning id)select count(*) from changed;`)),'0');
  denied(as(b,`insert into public.${table}(id,user_id)values('${randomUUID()}','${a}');`));
  denied(as(a,`update public.${table} set user_id='${b}' where id='${id}';`));
  denied(`set role anon;select * from public.${table};`);
  denied(as(c,`insert into public.${table}(id,user_id)values('${randomUUID()}','${c}');`));
 }
 checks.push('Both tables: cross-account read/update/delete blocked, forged-owner inserts denied, ownership reassignment denied, anonymous denied, unentitled account writes denied');
 assert.equal(run(as(a,`update public.recipes set name='Owner update' where id='${recipe}';select name from public.recipes where id='${recipe}';`)),'Owner update');
 assert.equal(run(as(a,`update public.price_book set item_data=jsonb_set(item_data,'{price}','30') where id='${price}';select item_data->>'price' from public.price_book where id='${price}';`)),'30');
 checks.push('Owner-only recipe and supplier price updates persist');
 run(`update public.menu_margin_cardless_trials set started_at=now()-interval '15 days',ends_at=now()-interval '1 day' where user_id='${a}';`);
 assert.equal(run(as(a,`select count(*) from public.recipes where id='${recipe}';`)),'0');
 assert.equal(run(as(a,`select count(*) from public.price_book where id='${price}';`)),'0');
 denied(as(a,`insert into public.recipes(user_id)values('${a}');`));
 assert.equal(run(as(a,'select public.menu_margin_start_cardless_trial()>now();')),'f');
 checks.push('Expired trial cannot read or write its data and cannot reset its deadline');
 console.log(JSON.stringify({passed:true,scope:'Disposable local PostgreSQL migrations/RLS; does not verify live Supabase Auth, PostgREST or staging',image,checks},null,2));
}finally{if(started){const r=docker(['rm','-f',name]);assert.equal(r.status,0,'Disposable container cleanup must succeed');}}
