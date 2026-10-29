import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/cloud-data.js',import.meta.url),'utf8');
const api=vm.runInNewContext(source+'\n({mmFetchAccountTable,mmCommitStorage,mmMergeCloudRecords})',{AbortController,setTimeout,clearTimeout});
const plain=value=>JSON.parse(JSON.stringify(value));
function client(rows,{cap=1000,failPage=-1,changeCount=false}={}){
 const calls=[];
 return {calls,from(table){let start=0,end=0;const call={table};calls.push(call);
  const q={select(columns,options){assert.equal(options.count,'exact');return q;},eq(key,value){call[key]=value;return q;},order(key){assert.equal(key,'id');return q;},range(a,b){start=a;end=b;return q;},abortSignal(){return q;},then(resolve){resolve(calls.length===failPage?{error:{message:'connection lost'}}:{data:rows.slice(start,Math.min(end+1,start+cap)),count:rows.length+(changeCount&&calls.length>1?1:0)});}};return q;
 }};
}
test('loads all 1,205 records, even when the server caps each response below the requested size',async()=>{
 const rows=Array.from({length:1205},(_,i)=>({id:String(i)})),db=client(rows,{cap:75});
 const result=await api.mmFetchAccountTable(db,'price_book','id','account-a');
 assert.equal(result.length,1205);assert.equal(new Set(result.map(row=>row.id)).size,1205);assert.ok(db.calls.every(call=>call.user_id==='account-a'));
});
test('loads an empty account without inventing local records',async()=>assert.equal((await api.mmFetchAccountTable(client([]),'recipes','id','a')).length,0));
test('an interrupted later page rejects the whole cloud read',async()=>{
 await assert.rejects(api.mmFetchAccountTable(client(Array.from({length:500},(_,i)=>({id:i+1})),{cap:100,failPage:3}),'recipes','id','a'),/connection lost/);
});
test('a changing count fails closed instead of treating an incomplete read as deletion',async()=>{
 await assert.rejects(api.mmFetchAccountTable(client(Array.from({length:500},(_,i)=>({id:i+1})),{cap:100,changeCount:true}),'recipes','id','a'),/changed during loading/);
});
test('account switching prevents a response being applied to another account',async()=>{
 let checks=0;await assert.rejects(api.mmFetchAccountTable(client([{id:'one'}]),'recipes','id','a',{isCurrent:()=>++checks===1}),/Account changed/);
});
test('an uncounted response is never accepted as a complete cloud snapshot',async()=>{
 const db={from(){return {select(){return this},eq(){return this},order(){return this},range(){return this},abortSignal(){return Promise.resolve({data:[]})}}}};
 await assert.rejects(api.mmFetchAccountTable(db,'recipes','id','a'),/complete/);
});
test('a failed multi-key device write rolls back earlier keys',()=>{
 const values=new Map([['recipes','old recipes'],['prices','old prices']]);let once=true;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(k==='prices'&&once){once=false;throw Error('quota')}values.set(k,v)},removeItem:k=>values.delete(k)};
 assert.throws(()=>api.mmCommitStorage(storage,[['recipes',[1]],['prices',[2]]]),/Device storage/);
 assert.equal(values.get('recipes'),'old recipes');assert.equal(values.get('prices'),'old prices');
});
const record=(extra={})=>({id:'one',name:'Butter',price:10,updatedAt:'v1',...extra});
const merge=extra=>api.mmMergeCloudRecords({kind:'prices',cloud:[record()],local:[record()],pending:[],knownVersions:{one:'v1'},newId:()=> 'copy',now:1000,...extra});
test('an unchanged old device snapshot follows a newer cloud price',()=>{
 const result=merge({cloud:[record({price:12,updatedAt:'v2'})]});assert.equal(result.records[0].price,12);assert.equal(result.mutations.length,0);
});
test('queued local edits survive refresh against an unchanged server version',()=>{
 const edit={kind:'prices',id:'one',action:'upsert',record:record({price:14}),baseVersion:'v1'};
 const result=merge({pending:[edit]});assert.equal(result.records[0].price,14);assert.equal(result.mutations.length,1);
});
test('offline edits preserve both versions if another phone changed the same item',()=>{
 const edit={kind:'prices',id:'one',action:'upsert',record:record({price:14}),baseVersion:'v1'};
 const result=merge({cloud:[record({price:12,updatedAt:'v2'})],pending:[edit]});
 assert.deepEqual(plain(result.records.map(row=>row.price)),[12,14]);assert.equal(result.records[1].id,'copy');assert.ok(result.notices.length);assert.equal(result.mutations[0].record.price,14);
});
test('a stale offline delete cannot delete another phone’s newer edit',()=>{
 const result=merge({cloud:[record({updatedAt:'v2'})],pending:[{kind:'prices',action:'delete',id:'one',baseVersion:'v1'}]});
 assert.equal(result.records.length,1);assert.equal(result.mutations.length,0);assert.ok(result.notices.length);
});
test('a confirmed unchanged delete stays queued and absent locally',()=>{
 const result=merge({pending:[{kind:'prices',action:'delete',id:'one',baseVersion:'v1'}]});assert.equal(result.records.length,0);assert.equal(result.mutations[0].action,'delete');
});
test('a remote deletion does not resurrect a previously synced cache row',()=>assert.equal(merge({cloud:[]}).records.length,0));
test('a genuinely unsynced new local record is recovered and queued',()=>{
 const result=merge({cloud:[],knownVersions:{}});assert.equal(result.records.length,1);assert.equal(result.mutations.length,1);
});
test('a retry of an already accepted write does not create conflict copies',()=>{
 const updated=record({price:14,updatedAt:'v2'}),result=merge({cloud:[updated],pending:[{kind:'prices',action:'upsert',id:'one',record:record({price:14}),baseVersion:'v1'}]});
 assert.equal(result.records.length,1);assert.equal(result.mutations.length,0);
});
test('JSONB property order does not turn an already accepted write into a conflict',()=>{
 const current={updatedAt:'v2',price:14,name:'Butter',id:'one'},pending={kind:'prices',action:'upsert',id:'one',record:record({price:14}),baseVersion:'v1'};
 const result=merge({cloud:[current],pending:[pending]});assert.equal(result.records.length,1);assert.equal(result.mutations.length,0);
});
