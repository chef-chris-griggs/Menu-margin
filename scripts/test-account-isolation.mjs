// Opt-in live RLS test. Uses only two disposable accounts and generated records.
// Never supply a service-role key: that would bypass the policies being tested.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const {MM_TEST_SUPABASE_URL:base,MM_TEST_PUBLIC_KEY:key,MM_TEST_TOKEN_A:a,MM_TEST_TOKEN_B:b}=process.env;
if(!base||!key||!a||!b||!process.argv.includes('--disposable-accounts')){
 console.error('Not run: set MM_TEST_SUPABASE_URL, MM_TEST_PUBLIC_KEY, MM_TEST_TOKEN_A and MM_TEST_TOKEN_B for TWO DISPOSABLE TEST ACCOUNTS, then add --disposable-accounts. Do not paste tokens into chat or commit them.');process.exit(2);
}
assert.ok(base.startsWith('https://'),'Use the intended HTTPS Supabase test project.');
assert.ok(!key.startsWith('sb_secret_'),'A secret/service key bypasses RLS and must not be used.');
if(key.split('.').length===3){const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(payload.role,'anon','Use an anon/public key, never a service role.');}
async function request(path,{token,method='GET',body}={}){
 const response=await fetch(base.replace(/\/$/,'')+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'content-type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 let value;try{value=await response.json()}catch{value=null}return {status:response.status,ok:response.ok,value};
}
const users=await Promise.all([a,b].map(async token=>{const r=await request('/auth/v1/user',{token});assert.equal(r.ok,true,'Test session must be valid');assert.ok(r.value?.id,'Expected test user ID');return r.value.id}));
assert.notEqual(users[0],users[1],'Accounts must be different.');
const cleanup=[],checks=[];
const denied=r=>[401,403].includes(r.status)||(r.ok&&Array.isArray(r.value)&&r.value.length===0);
try{
 for(const table of ['recipes','price_book']){
  const id=randomUUID(),common={id,user_id:users[0]},record=table==='recipes'?{...common,name:'MenuMargin isolation test',recipe_data:{ingredients:[],name:'MenuMargin isolation test'}}:{...common,ingredient_name:'MenuMargin isolation test',supplier:'TEST ONLY',pack_size:1,unit:'each',pack_price:1,item_data:{name:'MenuMargin isolation test',supplier:'TEST ONLY',packBase:1,baseUnit:'each',price:1}};
  const own=await request('/rest/v1/'+table,{token:a,method:'POST',body:record});assert.equal(own.ok,true,`${table}: own create must succeed (status ${own.status})`);cleanup.push({table,id});
  const route=`/rest/v1/${table}?id=eq.${id}`;
  assert.ok(denied(await request(route,{token:b})),table+': another account cannot read');
  assert.ok(denied(await request(route)),table+': anonymous cannot read');
  const update=table==='recipes'?{name:'Unauthorized edit'}:{supplier:'Unauthorized edit'};
  assert.ok(denied(await request(route,{token:b,method:'PATCH',body:update})),table+': another account cannot update');
  assert.ok(denied(await request(route,{token:b,method:'DELETE'})),table+': another account cannot delete');
  const forgedId=randomUUID();cleanup.push({table,id:forgedId});
  const forged=await request('/rest/v1/'+table,{token:b,method:'POST',body:{...record,id:forgedId}});
  assert.ok([401,403].includes(forged.status),table+': another account cannot insert under owner A');
  const anonId=randomUUID();cleanup.push({table,id:anonId});
  assert.ok([401,403].includes((await request('/rest/v1/'+table,{method:'POST',body:{...record,id:anonId}})).status),table+': anonymous cannot insert');
  assert.ok([401,403].includes((await request(route,{token:a,method:'PATCH',body:{user_id:users[1]}})).status),table+': ownership cannot be reassigned to account B');
  const after=await request(route,{token:a});assert.equal(after.ok,true);assert.equal(after.value.length,1,'Own record must remain readable');
  assert.equal(after.value[0].user_id,users[0]);assert.equal(table==='recipes'?after.value[0].name:after.value[0].supplier,table==='recipes'?'MenuMargin isolation test':'TEST ONLY');
  const allowed=await request(route,{token:a,method:'PATCH',body:table==='recipes'?{name:'Owner update'}:{supplier:'OWNER UPDATE'}});assert.equal(allowed.ok,true);assert.equal(allowed.value.length,1,'Owner update must affect its row');
  checks.push(table+': owner CRUD, cross-account read/update/delete/insert, owner reassignment, anonymous read/write');
 }
 console.log(JSON.stringify({passed:true,checks,scope:'Disposable account API tests only; does not audit all database functions or infrastructure.'}));
}finally{
 let failures=0;
 for(const {table,id} of cleanup){
  try{
   for(const token of [a,b]){const r=await request(`/rest/v1/${table}?id=eq.${id}`,{token,method:'DELETE'});if(!r.ok)throw Error('delete denied');}
   for(const token of [a,b]){const r=await request(`/rest/v1/${table}?id=eq.${id}`,{token});if(!r.ok||r.value?.length)throw Error('record still present');}
  }catch{failures++;}
 }
 if(failures){console.error('Cleanup incomplete for '+failures+' generated test records. Inspect the disposable test accounts before reusing them.');process.exitCode=1;}
}
