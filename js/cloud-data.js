// Cloud reads must be complete before replacing an account's device snapshot.
async function mmFetchAccountTable(client,table,columns,userId,{isCurrent=()=>true,pageSize=200,timeoutMs=20000}={}){
 const rows=[],seen=new Set();let expected=null,offset=0;
 for(let page=0;page<10000;page++){
  if(!isCurrent())throw new Error('Account changed while loading.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let result;
  try{result=await client.from(table).select(columns,{count:'exact'}).eq('user_id',userId).order('id',{ascending:true}).range(offset,offset+pageSize-1).abortSignal(controller.signal);}
  finally{clearTimeout(timer);}
  if(!isCurrent())throw new Error('Account changed while loading.');
  if(result.error)throw new Error('Could not load '+table+': '+result.error.message);
  if(!Array.isArray(result.data)||!Number.isInteger(result.count)||result.count<0)throw new Error('Could not confirm a complete '+table+' response. Retry refresh.');
  if(expected===null)expected=result.count;
  if(result.count!==expected)throw new Error('Your '+table+' changed during loading. Retry refresh.');
  for(const row of result.data){
   if(!row?.id||seen.has(row.id))throw new Error('Incomplete or repeated '+table+' page. Retry refresh.');
   seen.add(row.id);rows.push(row);
  }
  offset+=result.data.length;
  if(offset===expected)return rows;
  if(offset>expected||!result.data.length)throw new Error('Incomplete '+table+' response. Device data was kept.');
 }
 throw new Error('Cloud library is too large to load safely. Device data was kept.');
}

// Stage all serialization first, then restore the previous values if a write
// fails. Never replace a cache after receiving only part of a cloud response.
function mmCommitStorage(storage,entries){
 const staged=entries.map(([key,value,raw])=>[key,raw?String(value):JSON.stringify(value)]),before=staged.map(([key])=>[key,storage.getItem(key)]);
 try{for(const [key,value] of staged)storage.setItem(key,value);}
 catch(error){
  for(const [key,value] of before){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{}}
  throw new Error('Device storage could not save this change. Download a backup and free space. '+error.message);
 }
}
function mmRecordContent(record){
 const {updatedAt,...value}=record||{};
 const ordered=item=>Array.isArray(item)?item.map(ordered):item&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().filter(key=>item[key]!==undefined).map(key=>[key,ordered(item[key])])):item;
 return JSON.stringify(ordered(value));
}
function mmMergeCloudRecords({kind,cloud,local,pending,knownVersions,newId,now}){
 const byId=new Map(cloud.map(row=>[row.id,row])),mutations=[],notices=[];
 const edits=new Map(pending.filter(item=>item.kind===kind).map(item=>[item.id,item]));
 for(const record of local){
  if(!record?.id||edits.has(record.id))continue;
  if(!byId.has(record.id)&&!Object.hasOwn(knownVersions,record.id))edits.set(record.id,{kind,action:'upsert',id:record.id,record,changedAt:now,baseVersion:null});
 }
 for(const edit of edits.values()){
  const current=byId.get(edit.id),base=edit.baseVersion??knownVersions[edit.id]??null;
  const changed=Boolean(base&&(!current||current.updatedAt!==base));
  if(edit.action==='delete'){
   if(changed&&current){notices.push('A delete was paused because this item changed on another device.');continue;}
   byId.delete(edit.id);if(current)mutations.push({...edit,baseVersion:current.updatedAt});continue;
  }
  if(edit.action!=='upsert'||!edit.record)continue;
  if(current&&mmRecordContent(current)===mmRecordContent(edit.record))continue;
  if(changed||(current&&!base)){
   const id=newId(),copy={...edit.record,id,name:(edit.record.name||'Untitled')+' (conflict copy)',updatedAt:new Date(now).toISOString()};
   byId.set(id,copy);mutations.push({kind,action:'upsert',id,record:copy,changedAt:now,baseVersion:null});
   notices.push('Both versions of “'+(edit.record.name||'Untitled')+'” were kept. Review the conflict copy.');
  }else{
   byId.set(edit.id,edit.record);mutations.push({...edit,baseVersion:current?.updatedAt||null});
  }
 }
 return {records:[...byId.values()],mutations,notices};
}
