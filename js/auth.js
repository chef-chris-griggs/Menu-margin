// Only the public Supabase key belongs in the browser. RLS enforces ownership.
const MM_SUPABASE_URL = 'https://phwdyckedcqxbojpbqgz.supabase.co';
const MM_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_q711FpfYM17f3d1J_dTJOg_XRgmOufq';
const MM_AUTH_REDIRECT_URL = window.location.protocol === 'file:'
  ? 'https://chef-chris-griggs.github.io/Menu-margin/'
  : new URL('./',window.location.href).href;
const MM_PASSWORD_REDIRECT_URL=MM_AUTH_REDIRECT_URL+'?auth=recovery';
const MM_LIBRARY_KEY = 'menumargin-recipes-v1';
const MM_PRICEBOOK_KEY = 'menumargin-pricebook-v1';
const MM_PENDING_PREFIX = 'menumargin-pending-v1::user:';
const MM_MANIFEST_PREFIX = 'menumargin-cloud-manifest-v1::user:';
const MM_DRAFT_PREFIX = 'menumargin-draft-v1::user:';
const MM_LEGACY_CLAIM_KEY = 'menumargin-legacy-migration-owner-v1';
const MM_ACCESS_PREFIX = 'menumargin-access-v1::user:';
const MM_BILLING_CONFIG_KEY = 'menumargin-billing-enabled-v1';
const MM_SYNC_DEBOUNCE_MS = 220;
const MM_OFFLINE_ACCESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function mmNewUuid(){
  if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
}
const mmSupabase = window.supabase.createClient(MM_SUPABASE_URL, MM_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const mmAuthMessage = message => {
  const el=document.getElementById('mmAuthMessage');if(el)el.textContent=message;
  const status=document.getElementById('mmCloudStatus');
  if(status&&document.body.classList.contains('mm-authenticated'))status.textContent=message;
};
let mmCloudReady=false,mmCloudOffline=false,mmHydrating=false,mmSyncing=false,mmSyncTimer=null,mmUser=null,mmBillingEnabled=false;
let mmEntryPromise=null,mmEntryUserId=null,mmSigningOut=false,mmSyncChain=Promise.resolve(),mmDraftTimer=null;
let mmAppBooted=false,mmResolveAppBoot;
const mmAppBootPromise=new Promise(resolve=>{mmResolveAppBoot=resolve;});
let mmCloudBaselineRecipes=new Map(),mmCloudBaselinePrices=new Map(),mmCloudVersionsRecipes=new Map(),mmCloudVersionsPrices=new Map();

function mmScopedStorageKey(key,userId=mmUser?.id){
  if(userId&&(key===MM_LIBRARY_KEY||key===MM_PRICEBOOK_KEY))return key+'::user:'+userId;
  return key;
}
function mmParseJson(value,fallback){try{return value?JSON.parse(value):fallback}catch{return fallback}}
function mmAccountCacheKey(key,userId){return mmScopedStorageKey(key,userId)}
function mmRawJson(key,fallback){return mmParseJson(localStorage.getItem(key),fallback)}
function mmPendingKey(userId=mmUser?.id){return MM_PENDING_PREFIX+userId}
function mmManifestKey(userId=mmUser?.id){return MM_MANIFEST_PREFIX+userId}
function mmDraftKey(userId=mmUser?.id){return MM_DRAFT_PREFIX+userId}
function mmAccessKey(userId=mmUser?.id){return MM_ACCESS_PREFIX+userId}
function mmReadPending(userId=mmUser?.id){
 if(!userId)return [];const text=localStorage.getItem(mmPendingKey(userId));if(!text)return [];
 let queue;try{queue=JSON.parse(text);}catch{throw new Error('Pending saves could not be read. Keep device data and contact support.');}
 if(!Array.isArray(queue))throw new Error('Pending saves are invalid. Keep device data and contact support.');return queue;
}
function mmWritePending(queue,userId=mmUser?.id){if(userId)localStorage.setItem(mmPendingKey(userId),JSON.stringify(queue))}
function mmQueueMutation(kind,action,id,record,userId=mmUser?.id){
  if(!userId||!id)return;
  const pending=mmReadPending(userId),prior=pending.find(m=>m.kind===kind&&m.id===id);
  const queue=pending.filter(m=>!(m.kind===kind&&m.id===id));
  const versions=kind==='recipes'?mmCloudVersionsRecipes:mmCloudVersionsPrices;
  const manifest=mmRawJson(mmManifestKey(userId),{});
  const baseVersion=prior?.baseVersion??versions.get(id)??manifest[kind]?.[id]??null;
  queue.push({kind,action,id,record:record||null,baseVersion,changedAt:Date.now()});
  mmWritePending(queue,userId);
}
function mmReadUserCache(key,userId){
 const text=localStorage.getItem(mmAccountCacheKey(key,userId));
 if(text===null||text==='')return [];
 let records;try{records=JSON.parse(text);}catch{throw new Error('Saved device data could not be read. Keep this browser data and contact support.');}
 if(!Array.isArray(records)||records.some(record=>!record||typeof record!=='object'||!record.id))throw new Error('Saved device data is invalid. Keep this browser data and contact support.');
 return records;
}
function mmWriteUserCache(key,records,userId=mmUser?.id,{track=true}={}){
 if(!userId)throw new Error('Sign in to save account data.');
 if(!Array.isArray(records))throw new Error('Account records must be a list.');
 const kind=key===MM_LIBRARY_KEY?'recipes':key===MM_PRICEBOOK_KEY?'prices':null;
 const before=mmReadUserCache(key,userId),entries=[[mmAccountCacheKey(key,userId),records]];
 if(track&&kind&&!mmHydrating){
  let queue=mmReadPending(userId);const versions=kind==='recipes'?mmCloudVersionsRecipes:mmCloudVersionsPrices;
  const manifest=mmRawJson(mmManifestKey(userId),{}),old=new Map(before.map(row=>[row.id,row])),next=new Map(records.map(row=>[row.id,row]));
  const add=(action,id,record)=>{
   const prior=queue.find(edit=>edit.kind===kind&&edit.id===id),baseVersion=prior?.baseVersion??versions.get(id)??manifest[kind]?.[id]??null;
   queue=queue.filter(edit=>!(edit.kind===kind&&edit.id===id));queue.push({kind,action,id,record,baseVersion,changedAt:Date.now()});
  };
  for(const [id] of old)if(!next.has(id))add('delete',id,null);
  for(const [id,row] of next)if(!old.has(id)||JSON.stringify(old.get(id))!==JSON.stringify(row))add('upsert',id,row);
  entries.push([mmPendingKey(userId),queue]);
 }
 mmCommitStorage(localStorage,entries);
 if(track&&kind&&!mmHydrating)mmScheduleSync();
}
function mmReadManifest(userId){
  const value=mmRawJson(mmManifestKey(userId),{});
  return {recipes:new Set(Object.keys(value.recipes||{})),prices:new Set(Object.keys(value.prices||{}))};
}
function mmSaveCloudManifest(userId=mmUser?.id,recipeVersions=mmCloudVersionsRecipes,priceVersions=mmCloudVersionsPrices){
  if(!userId)return;
  const manifest={recipes:{},prices:{}};
  for(const [id,version] of recipeVersions)manifest.recipes[id]=version||true;
  for(const [id,version] of priceVersions)manifest.prices[id]=version||true;
  localStorage.setItem(mmManifestKey(userId),JSON.stringify(manifest));
}
function mmApplyPending(kind,records,queue){
  const map=new Map((records||[]).map(record=>[record.id,record]));
  for(const m of queue.filter(item=>item.kind===kind)){
    if(m.action==='delete')map.delete(m.id);
    else if(m.action==='upsert'&&m.record)map.set(m.id,m.record);
  }
  return [...map.values()];
}
function mmTryMigrateLegacy(userId,recipes,prices,queueMutation=mmQueueMutation){
  const owner=localStorage.getItem(MM_LEGACY_CLAIM_KEY);
  if(owner&&owner!==userId)return {recipes,prices,migrated:false};
  // The owner key is also the completed-migration marker. Leave the legacy
  // keys intact for recovery, but never import them again for the same user.
  if(owner===userId)return {recipes,prices,migrated:false};
  const recipeValue=mmParseJson(localStorage.getItem(MM_LIBRARY_KEY),[]);
  const priceValue=mmParseJson(localStorage.getItem(MM_PRICEBOOK_KEY),[]);
  const legacyRecipes=Array.isArray(recipeValue)?recipeValue:[];
  const legacyPrices=Array.isArray(priceValue)?priceValue:[];
  const legacyRecipe=mmParseJson(localStorage.getItem('menumargin-recipe'),null);
  if(!legacyRecipes.length&&!legacyPrices.length&&!legacyRecipe)return {recipes,prices,migrated:false};
  const migratedRecipes=[...recipes],recipeIds=new Set(migratedRecipes.map(x=>x.id));
  for(const item of [...legacyRecipes,...(legacyRecipe?[legacyRecipe]:[])]){
    if(!item||typeof item!=='object')continue;
    const migrated={...item,id:item.id&&!recipeIds.has(item.id)?item.id:mmNewUuid(),name:item.name||'My saved recipe',updatedAt:item.updatedAt||new Date().toISOString()};
    migratedRecipes.push(migrated);recipeIds.add(migrated.id);queueMutation('recipes','upsert',migrated.id,migrated,userId);
  }
  const migratedPrices=[...prices],priceIds=new Set(migratedPrices.map(x=>x.id));
  for(const item of legacyPrices){
    if(!item||typeof item!=='object')continue;
    const migrated={...item,id:item.id&&!priceIds.has(item.id)?item.id:mmNewUuid(),updatedAt:item.updatedAt||new Date().toISOString()};
    migratedPrices.push(migrated);priceIds.add(migrated.id);queueMutation('prices','upsert',migrated.id,migrated,userId);
  }
  return {recipes:migratedRecipes,prices:migratedPrices,migrated:true};
}
async function mmLoadCloud(userId=mmUser?.id){
  if(!userId)throw new Error('Sign in is required to load account data.');
  mmCloudReady=false;
  const isCurrent=()=>mmUser?.id===userId&&!mmSigningOut&&mmRecoveryMode==='none';
  const [recipeRows,priceRows]=await Promise.all([
    mmFetchAccountTable(mmSupabase,'recipes','id,name,recipe_data,updated_at',userId,{isCurrent}),
    mmFetchAccountTable(mmSupabase,'price_book','id,item_data,updated_at',userId,{isCurrent})
  ]);
  if(!isCurrent())throw new Error('Account changed while data was loading.');
  const cloudRecipes=recipeRows.map(row=>{
    const value=row.recipe_data;
    if(!value||typeof value!=='object'||Array.isArray(value)||(value.ingredients!==undefined&&(!Array.isArray(value.ingredients)||value.ingredients.some(item=>!item||typeof item!=='object'||Array.isArray(item)))))throw new Error('A saved recipe has invalid data. Your device copy was kept. Contact support.');
    return {...value,ingredients:value.ingredients||[],id:row.id,name:row.name||value.name||'Untitled recipe',updatedAt:row.updated_at};
  });
  const cloudPrices=priceRows.map(row=>{
    if(!row.item_data||typeof row.item_data!=='object'||Array.isArray(row.item_data))throw new Error('A saved supplier price has invalid data. Your device copy was kept. Contact support.');
    return {...row.item_data,id:row.id,updatedAt:row.updated_at};
  });
  // Read local changes after the network calls, including edits made while loading.
  const prior=mmRawJson(mmManifestKey(userId),{}),pending=mmReadPending(userId),now=Date.now();
  const merge=(kind,cloud,key)=>mmMergeCloudRecords({kind,cloud,local:mmReadUserCache(key,userId),pending,knownVersions:prior[kind==='recipes'?'recipes':'prices']||{},newId:mmNewUuid,now});
  const recipes=merge('recipes',cloudRecipes,MM_LIBRARY_KEY),prices=merge('prices',cloudPrices,MM_PRICEBOOK_KEY);
  const queue=[...recipes.mutations,...prices.mutations];
  const merged=mmTryMigrateLegacy(userId,recipes.records,prices.records,(kind,action,id,record)=>queue.push({kind,action,id,record,baseVersion:null,changedAt:now}));
  const manifest={recipes:Object.fromEntries(recipeRows.map(row=>[row.id,row.updated_at])),prices:Object.fromEntries(priceRows.map(row=>[row.id,row.updated_at]))};
  const entries=[
    [mmAccountCacheKey(MM_LIBRARY_KEY,userId),merged.recipes],
    [mmAccountCacheKey(MM_PRICEBOOK_KEY,userId),merged.prices],
    [mmPendingKey(userId),queue],[mmManifestKey(userId),manifest]
  ];
  if(merged.migrated)entries.push([MM_LEGACY_CLAIM_KEY,userId,true]);
  mmCommitStorage(localStorage,entries);
  mmCloudBaselineRecipes=new Map(cloudRecipes.map(row=>[row.id,JSON.stringify(row)]));
  mmCloudBaselinePrices=new Map(cloudPrices.map(row=>[row.id,JSON.stringify(row)]));
  mmCloudVersionsRecipes=new Map(Object.entries(manifest.recipes));mmCloudVersionsPrices=new Map(Object.entries(manifest.prices));
  mmCloudReady=true;mmCloudOffline=false;
  const notices=[...recipes.notices,...prices.notices];
  if(merged.migrated)notices.push('Your previous device recipes and prices were copied into this account and queued to sync.');
  const note=document.getElementById('mmMigrationNotice');if(note){note.hidden=!notices.length;note.textContent=notices.join(' ');}
  if(queue.length)mmScheduleSync();
  return {...merged,notices};
}
function mmScheduleSync(){
  if(!mmUser||!mmCloudReady||!navigator.onLine)return;
  const userId=mmUser.id;
  clearTimeout(mmSyncTimer);
  mmSyncTimer=setTimeout(()=>{
    if(mmUser?.id!==userId)return;
    mmSyncCloud().catch(error=>{
    console.error(error);
    if(mmUser?.id!==userId)return;
    mmCloudReady=false;mmCloudOffline=true;
    mmAuthMessage('Saved on this device. Cloud sync failed; choose Refresh & sync to retry.');
    });
  },MM_SYNC_DEBOUNCE_MS);
}
function mmSyncCloud(){
  clearTimeout(mmSyncTimer);
  const userId=mmUser?.id;
  if(!userId||!mmCloudReady||!navigator.onLine)return Promise.resolve({offline:true});
  const run=mmSyncChain.catch(()=>{}).then(()=>mmSyncCloudInner(userId));
  mmSyncChain=run;return run;
}
function mmRemoveSyncedPending(snapshot,userId){
  const current=mmReadPending(userId),sent=new Map(snapshot.map(item=>[item.kind+':'+item.id,JSON.stringify(item)]));
  const remaining=current.filter(item=>sent.get(item.kind+':'+item.id)!==JSON.stringify(item));
  mmWritePending(remaining.map(item=>({...item,baseVersion:(item.kind==='recipes'?mmCloudVersionsRecipes:mmCloudVersionsPrices).get(item.id)??item.baseVersion??null})),userId);
}
async function mmPushOne(kind,rec,versions,userId=mmUser?.id){
  if(!userId)throw new Error('Sign in is required to sync account data.');
  const table=kind==='recipes'?'recipes':'price_book',stamp=new Date().toISOString();
  const body=kind==='recipes'?{name:rec.name||'Untitled recipe',recipe_data:rec,user_id:userId,updated_at:stamp}:{item_data:rec,user_id:userId,updated_at:stamp};
  const known=versions.get(rec.id);
  if(known){
    const {data,error}=await mmSupabase.from(table).update(body).eq('id',rec.id).eq('user_id',userId).eq('updated_at',known).select('id,updated_at');
    if(error)throw error;
    if(data&&data.length){versions.set(rec.id,data[0].updated_at);return {ok:true};}
    const {data:current,error:readError}=await mmSupabase.from(table).select('*').eq('id',rec.id).eq('user_id',userId);
    if(readError)throw readError;
    if(current&&current.length)return {conflict:current[0]};
    return {deleted:true};
  }
  const {data,error}=await mmSupabase.from(table).upsert({id:rec.id,...body},{onConflict:'id'}).select('id,updated_at');
  if(error)throw error;if(!data?.[0]?.updated_at)throw new Error('The server did not confirm this save. Your device copy is kept.');versions.set(rec.id,data[0].updated_at);return {ok:true};
}
async function mmResolveConflict(c){
 const {kind,key,rec,cloud,baseline,versions,userId}=c;
 const cloudRec=cloud?(kind==='recipes'
  ?{...cloud.recipe_data,id:cloud.id,name:cloud.name||cloud.recipe_data?.name||'Untitled recipe',updatedAt:cloud.updated_at}
  :{...cloud.item_data,id:cloud.id,updatedAt:cloud.updated_at}):null;
 const latest=mmReadUserCache(key,userId).find(row=>row.id===rec.id)||rec;
 const label=latest.name||'Untitled',suffix=cloud?' (conflict copy)':' (recovered copy)';
 const copy={...latest,id:mmNewUuid(),name:label+suffix,updatedAt:new Date().toISOString()};
 await mmPushOne(kind,copy,versions,userId);
 const current=mmReadUserCache(key,userId),newer=current.find(row=>row.id===rec.id);
 const savedCopy=newer&&JSON.stringify(newer)!==JSON.stringify(latest)?{...newer,id:copy.id,name:(newer.name||'Untitled')+suffix}:copy;
 if(cloudRec){baseline.set(cloudRec.id,JSON.stringify(cloudRec));versions.set(cloudRec.id,cloud.updated_at);}
 else{baseline.delete(rec.id);versions.delete(rec.id);}
 baseline.set(copy.id,JSON.stringify(copy));
 const fresh=current.filter(row=>row.id!==rec.id&&row.id!==copy.id);if(cloudRec)fresh.push(cloudRec);fresh.push(savedCopy);
 // Move any edit made during the conflict-copy save onto that copy's queue ID.
 const queue=mmReadPending(userId).filter(edit=>!(edit.kind===kind&&edit.id===rec.id));
 if(savedCopy!==copy)queue.push({kind,action:'upsert',id:copy.id,record:savedCopy,baseVersion:versions.get(copy.id),changedAt:Date.now()});
 mmCommitStorage(localStorage,[[mmAccountCacheKey(key,userId),fresh],[mmPendingKey(userId),queue]]);
 const msg=cloud?`“${label}” changed on another device. Both versions were kept; yours is “${savedCopy.name}”. Review both.`:`“${label}” was deleted on another device. Your edits were kept as “${savedCopy.name}”.`;
 if(mmUser?.id!==userId)return;
 mmAuthMessage(msg);
 if(kind==='recipes'){
  if(currentRecipeId===rec.id&&!hasUnsavedChanges)loadRecipe(savedCopy);else if(currentRecipeId===rec.id)currentRecipeId=copy.id;
  refreshLibrary(currentRecipeId);showToast(msg);
 }else{renderPriceBook();mmRefreshRecipePrices();const toast=document.getElementById('pbToast');if(toast)toast.textContent=msg;}
}
async function mmSyncCloudInner(userId){
  if(!userId||mmUser?.id!==userId||!mmCloudReady||!navigator.onLine)return {offline:true};
  mmSyncing=true;const pendingSnapshot=mmReadPending(userId),conflicts=[];
  try{
    const recipeVersions=mmCloudVersionsRecipes,priceVersions=mmCloudVersionsPrices;
    const sets=[['recipes',MM_LIBRARY_KEY,mmCloudBaselineRecipes,recipeVersions],['prices',MM_PRICEBOOK_KEY,mmCloudBaselinePrices,priceVersions]];
    for(const [kind,key,baseline,versions] of sets){
      if(mmUser?.id!==userId)return {stale:true};
      const list=mmReadUserCache(key,userId),ids=new Set(list.map(r=>r.id));
      for(const rec of list){
        if(mmUser?.id!==userId)return {stale:true};
        const json=JSON.stringify(rec);if(baseline.get(rec.id)===json)continue;
        const result=await mmPushOne(kind,rec,versions,userId);
        if(mmUser?.id!==userId)return {stale:true};
        if(result.conflict||result.deleted)conflicts.push({kind,key,rec,cloud:result.conflict,baseline,versions,userId});
        else baseline.set(rec.id,json);
      }
      const removed=[...baseline.keys()].filter(id=>!ids.has(id));
      for(const id of removed){
        if(mmUser?.id!==userId)return {stale:true};
        const knownVersion=versions.get(id);if(!knownVersion){baseline.delete(id);continue;}
        const {data:deleted,error}=await mmSupabase.from(kind==='recipes'?'recipes':'price_book').delete().eq('user_id',userId).eq('id',id).eq('updated_at',knownVersion).select('id');
        if(error)throw error;
        if(mmUser?.id!==userId)return {stale:true};
        if(deleted?.length){baseline.delete(id);versions.delete(id);}
        else{
          const {data:current,error:readError}=await mmSupabase.from(kind==='recipes'?'recipes':'price_book').select('id,updated_at').eq('user_id',userId).eq('id',id);
          if(readError)throw readError;
          if(mmUser?.id!==userId)return {stale:true};
          if(current?.[0]){
            versions.set(id,current[0].updated_at);
            const table=kind==='recipes'?'recipes':'price_book';
            const {data:record,error:recordError}=await mmSupabase.from(table).select(kind==='recipes'?'id,name,recipe_data,updated_at':'id,item_data,updated_at').eq('user_id',userId).eq('id',id).maybeSingle();
            if(recordError)throw recordError;
            if(mmUser?.id!==userId)return {stale:true};
            if(record){
              const restored=kind==='recipes'
                ?{...record.recipe_data,id:record.id,name:record.name||record.recipe_data?.name||'Untitled recipe',updatedAt:record.updated_at}
                :{...record.item_data,id:record.id,updatedAt:record.updated_at};
              const latest=mmReadUserCache(key,userId).filter(item=>item.id!==id);latest.push(restored);
              mmWriteUserCache(key,latest,userId,{track:false});baseline.set(id,JSON.stringify(restored));
              if(mmUser?.id===userId)mmAuthMessage('A delete was paused because this item changed on another device. The latest version was restored here.');
            }
          }
          else{baseline.delete(id);versions.delete(id);}
        }
      }
    }
    for(const conflict of conflicts){
      if(mmUser?.id!==userId)return {stale:true};
      await mmResolveConflict(conflict);
    }
    mmRemoveSyncedPending(pendingSnapshot,userId);mmSaveCloudManifest(userId,recipeVersions,priceVersions);
    if(mmUser?.id===userId){
      mmCloudOffline=false;
      if(!conflicts.length)mmAuthMessage(mmReadPending(userId).length?'Saved on this device; more changes are waiting to sync.':'Cloud sync is up to date.');
      if(typeof updateRecipeHeader==='function')updateRecipeHeader();
    }
    return {conflicts:conflicts.length};
  }finally{mmSyncing=false;}
}
let mmRefreshPromise=null,mmLastRefreshAt=0;
function mmRefreshCloud(manual=false){
 if(!mmUser||mmSigningOut||mmEntryPromise||mmRecoveryMode!=='none')return Promise.resolve({skipped:true});
 if(mmRefreshPromise)return mmRefreshPromise;
 if(!manual&&Date.now()-mmLastRefreshAt<15000)return Promise.resolve({skipped:true});
 const userId=mmUser.id,button=document.getElementById('mmRefreshCloud');
 if(button)button.disabled=true;
 const run=mmSyncChain.catch(()=>{}).then(async()=>{
  if(mmUser?.id!==userId||mmSigningOut)return {stale:true};
  if(!navigator.onLine){mmCloudOffline=true;mmAuthMessage('Offline — changes are saved on this device. Refresh & sync when connected.');return {offline:true};}
  mmAuthMessage('Refreshing your recipes and supplier prices…');
  if(mmCloudReady)await mmSyncCloudInner(userId);
  if(mmUser?.id!==userId||mmSigningOut)return {stale:true};
  if(mmBillingEnabled){
   const {data,error}=await mmSupabase.rpc('menu_margin_has_paid_access');
   if(error)throw error;
   if(!data){if(hasUnsavedChanges)mmSaveRecipeDraft();mmShowSubscriptionGate(mmUser);return {access:false};}
  }
  const result=await mmLoadCloud(userId);
  if(mmUser?.id!==userId||mmSigningOut)return {stale:true};
  if(mmReadPending(userId).length)await mmSyncCloudInner(userId);
  // Inspect the editor now: the chef may have typed while the request ran.
  if(!hasUnsavedChanges&&currentRecipeId){
   const updated=readLibrary().find(item=>item.id===currentRecipeId);
   if(updated)loadRecipe(updated);
   else{loadRecipe({name:'',yield:10,sellingPrice:0,targetGp:70,ingredients:[]});showToast('This recipe was deleted on another device.');}
  }
  mmRefreshRecipePrices();refreshLibrary(currentRecipeId);renderPriceBook();
  mmLastRefreshAt=Date.now();
  mmAuthMessage(result.notices?.length?result.notices.join(' '):mmReadPending(userId).length?'Saved on this device; changes are waiting to sync.':'Cloud sync is up to date.');
  return {ok:true,notices:result.notices};
 }).catch(error=>{
  if(mmUser?.id===userId){mmCloudReady=false;mmCloudOffline=true;mmAuthMessage('Refresh failed. Your device data and edits are kept. Choose Refresh & sync to retry. '+error.message);updateRecipeHeader();}
  return {offline:true,error:error.message};
 }).finally(()=>{mmRefreshPromise=null;if(button)button.disabled=false;});
 mmRefreshPromise=run;mmSyncChain=run;return run;
}
function mmUseOfflineCache(userId){
  mmCloudReady=false;mmCloudOffline=true;mmHydrating=true;
  try{
    const queue=mmReadPending(userId);
    const recipes=mmApplyPending('recipes',mmReadUserCache(MM_LIBRARY_KEY,userId),queue);
    const prices=mmApplyPending('prices',mmReadUserCache(MM_PRICEBOOK_KEY,userId),queue);
    localStorage.setItem(mmAccountCacheKey(MM_LIBRARY_KEY,userId),JSON.stringify(recipes));
    localStorage.setItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,userId),JSON.stringify(prices));
    return {recipes,prices};
  }finally{mmHydrating=false;}
}
function mmSaveAccessSnapshot(userId,hasAccess){
  localStorage.setItem(mmAccessKey(userId),JSON.stringify({hasAccess,checkedAt:Date.now()}));
}
function mmReadFreshAccess(userId){
  const snapshot=mmRawJson(mmAccessKey(userId),null);
  return snapshot&&Date.now()-snapshot.checkedAt<=MM_OFFLINE_ACCESS_MAX_AGE_MS?snapshot:null;
}
async function mmRefreshBillingMode(userId){
  const key=MM_BILLING_CONFIG_KEY+'::user:'+userId;
  const cached=mmRawJson(key,null);
  if(!navigator.onLine){mmBillingEnabled=cached?.enabled===true;return mmBillingEnabled;}
  try{
    const {data,error}=await mmSupabase.rpc('menu_margin_billing_enabled');
    if(error)throw error;
    mmBillingEnabled=Boolean(data);
    localStorage.setItem(key,JSON.stringify({enabled:mmBillingEnabled,checkedAt:Date.now()}));
  }catch(error){
    // Old deployments without the feature-switch migration stay in the
    // non-billing mode. The database migration applies the same default.
    mmBillingEnabled=cached?.enabled===true;
  }
  return mmBillingEnabled;
}
function mmShowSubscriptionGate(user){
  mmCloudReady=false;mmCloudOffline=false;document.body.classList.remove('mm-authenticated');document.body.classList.add('mm-payment-required');
  document.getElementById('mmSubscriptionGate').hidden=false;
  document.getElementById('mmBillingWelcome').textContent='Signed in as '+(user.email||'your account')+'.';
  const state=new URL(window.location.href).searchParams.get('billing');
  document.getElementById('mmBillingMessage').textContent=state==='success'
    ?'Checkout is complete. Stripe is confirming your trial; choose Check access in a moment.'
    :state==='cancelled'?'Checkout was cancelled. Your account is unchanged; you can start the trial whenever you are ready.'
    :'Your account is ready. Start the trial to access recipes and the supplier price book.';
}
function mmLoadCurrentAccountData(result){
  const list=result?.recipes||mmReadUserCache(MM_LIBRARY_KEY,mmUser.id);
  const draft=mmRawJson(mmDraftKey(mmUser.id),null);
  let chosen=null,recoveredDraft=false;
  if(draft?.recipe&&draft.savedAt){
    const saved=list.find(item=>item.id===draft.recipe.id),savedAt=Date.parse(draft.savedAt)||0,cloudAt=Date.parse(saved?.updatedAt||'')||0;
    if(savedAt>cloudAt&&confirm('An unsaved recipe draft from this device was recovered. Restore it?')){
      chosen=draft.recipe;recoveredDraft=true;showToast('Recovered your unsaved draft. Save recipe to sync it to your account.');
    }else if(savedAt<=cloudAt){localStorage.setItem(mmDraftKey(mmUser.id),'');}
  }
  if(!chosen&&list.length)chosen=[...list].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
  if(chosen)loadRecipe(chosen);
  else{currentRecipeId=null;loadRecipe({name:'',yield:10,sellingPrice:0,targetGp:70,ingredients:[]});hasUnsavedChanges=false;}
  if(recoveredDraft)hasUnsavedChanges=true;
  refreshLibrary(currentRecipeId);renderPriceBook();
}
function mmEnterApp(user,force=false){
  if(!user||mmRecoveryMode!=='none')return Promise.resolve();
  if(!mmAppBooted)return mmAppBootPromise.then(()=>mmEnterApp(user,force));
  if(mmEntryPromise&&mmEntryUserId===user.id)return mmEntryPromise;
  if(!force&&mmUser?.id===user.id&&document.body.classList.contains('mm-authenticated')&&(mmCloudReady||mmCloudOffline))return Promise.resolve();
  if(mmUser?.id&&mmUser.id!==user.id)mmClearPrivateUi();
  if(mmUser?.id===user.id&&hasUnsavedChanges&&typeof mmSaveRecipeDraft==='function')mmSaveRecipeDraft();
  if(mmUser?.id!==user.id)mmBillingEnabled=false;
  mmUser=user;mmEntryUserId=user.id;
  const run=(async()=>{
    currentRecipeId=null;hasUnsavedChanges=false;
    let offlineAccess=false;
    await mmRefreshBillingMode(user.id);
    if(mmUser?.id!==user.id||mmRecoveryMode!=='none')return;
    if(mmBillingEnabled){
      mmAuthMessage('Checking your subscription…');
      try{
        const {data,error}=await mmSupabase.rpc('menu_margin_has_paid_access');
        if(error)throw error;mmSaveAccessSnapshot(user.id,Boolean(data));
        if(mmUser?.id!==user.id||mmRecoveryMode!=='none')return;
        if(!data){mmShowSubscriptionGate(user);return;}
      }catch(error){
        const recent=mmReadFreshAccess(user.id);
        if(!recent?.hasAccess){mmShowSubscriptionGate(user);document.getElementById('mmBillingMessage').textContent='Connect to the internet to verify subscription access. Your saved device data has not been removed.';return;}
        offlineAccess=true;
      }
    }
    let result;
    try{result=await mmLoadCloud(user.id);}
    catch(error){
      if(mmUser?.id!==user.id||mmRecoveryMode!=='none')return;
      result=mmUseOfflineCache(user.id);
      mmAuthMessage('Offline mode — recipes and prices are available on this device. Changes are queued and will sync when online.');
    }
    if(mmUser?.id!==user.id||mmRecoveryMode!=='none')return;
    document.body.classList.remove('mm-payment-required');document.getElementById('mmSubscriptionGate').hidden=true;
    document.body.classList.add('mm-authenticated');
    document.getElementById('mmAccountLabel').textContent='Signed in: '+(user.email||'your account');
    document.getElementById('mmManageBillingAccount').hidden=!mmBillingEnabled;
    document.getElementById('mmRetryStartup').hidden=true;
    mmLoadCurrentAccountData(result);
    if(offlineAccess||mmCloudOffline)mmAuthMessage('Offline mode — local changes are safe here and will sync when the connection returns.');
    else mmAuthMessage('Signed in. Cloud sync is working.');
  })().catch(error=>{
    if(mmUser?.id!==user.id||mmRecoveryMode!=='none')return;
    console.error('MenuMargin startup error:',error);
    mmCloudReady=false;document.body.classList.remove('mm-authenticated');
    mmAuthMessage('Could not open your account. Your device copy has not been cleared. Check the connection, then choose retry.');
    const retry=document.getElementById('mmRetryStartup');if(retry)retry.hidden=false;
  }).finally(()=>{if(mmEntryUserId===user.id){mmEntryPromise=null;mmEntryUserId=null;}});
  mmEntryPromise=run;return run;
}
function mmSaveRecipeDraft(){
  if(!mmUser||typeof recipeData!=='function')return;
  clearTimeout(mmDraftTimer);
  try{localStorage.setItem(mmDraftKey(mmUser.id),JSON.stringify({recipe:recipeData(),savedAt:new Date().toISOString()}));}
  catch(error){mmAuthMessage('Could not save an edit recovery copy. Please use Save recipe before leaving this page.');}
}
function mmClearRecipeDraft(){if(mmUser)localStorage.setItem(mmDraftKey(mmUser.id),'');}
function mmSaveRecipeDraftSoon(){clearTimeout(mmDraftTimer);mmDraftTimer=setTimeout(mmSaveRecipeDraft,180);}
function mmClearPrivateUi(){
  if(typeof clearInvoiceScanner==='function')clearInvoiceScanner();
  clearTimeout(mmDraftTimer);mmDraftTimer=null;
  const passwordField=document.getElementById('mmPassword');if(passwordField)passwordField.value='';
  const recoveryPassword=document.getElementById('mmNewPassword');if(recoveryPassword)recoveryPassword.value='';
  const ids=['recipeName','yield','sellingPrice','targetGp','invoiceSupplier','invoiceNumber','invoiceOrderNumber','invoiceText'];
  ids.forEach(id=>{const node=document.getElementById(id);if(node)node.value='';});
  ['ingredients','pricebookList','invoiceReviewRows'].forEach(id=>document.getElementById(id)?.replaceChildren());
  const priceForm=document.getElementById('pricebookForm');
  if(typeof clearPriceForm==='function')clearPriceForm();else if(priceForm)priceForm.reset();
  document.getElementById('pbCaseQty').value='1';document.getElementById('pbUnit').value='g';document.getElementById('pbSearch').value='';
  ['toast','recipesToast','pbToast','invoiceToast'].forEach(id=>{const node=document.getElementById(id);if(node)node.textContent='';});
  document.getElementById('invoiceProgress').textContent='Choose a PDF or photo to begin.';
  document.getElementById('invoiceFileName').textContent='No invoice selected';
  document.getElementById('invoiceSupplier').dataset.autoValue='';
  document.getElementById('invoiceNumber').dataset.autoValue='';document.getElementById('invoiceOrderNumber').dataset.autoValue='';
  document.getElementById('toast').hidden=true;
  const select=document.getElementById('recipeSelect');if(select){select.replaceChildren(new Option('No saved recipes yet',''));}
  document.getElementById('invoiceReviewArea').hidden=true;
  document.getElementById('invoiceFile').value='';
  document.getElementById('backupFile').value='';
  document.getElementById('mmMigrationNotice').hidden=true;
  document.getElementById('mmAccountLabel').textContent='Signed out';
  document.getElementById('mmCloudStatus').textContent='Sign in to open your private data.';
  document.body.classList.remove('mm-authenticated','mm-payment-required');
  document.getElementById('mmSubscriptionGate').hidden=true;
  if(typeof setActiveView==='function')setActiveView('costing');
  currentRecipeId=null;hasUnsavedChanges=false;mmCloudReady=false;mmCloudOffline=false;mmBillingEnabled=false;
  mmCloudBaselineRecipes=new Map();mmCloudBaselinePrices=new Map();mmCloudVersionsRecipes=new Map();mmCloudVersionsPrices=new Map();
}
function mmRemoveAccountDeviceCopy(userId){
 const keys=[mmAccountCacheKey(MM_LIBRARY_KEY,userId),mmAccountCacheKey(MM_PRICEBOOK_KEY,userId),mmPendingKey(userId),mmManifestKey(userId),mmDraftKey(userId),mmAccessKey(userId),MM_BILLING_CONFIG_KEY+'::user:'+userId];
 for(const key of keys)localStorage.removeItem(key);
 if(localStorage.getItem(MM_LEGACY_CLAIM_KEY)===userId){
  // Keep the owner marker: another account must never claim old private data.
  for(const key of [MM_LIBRARY_KEY,MM_PRICEBOOK_KEY,'menumargin-recipe'])localStorage.removeItem(key);
 }
}
async function mmSignOut(){
 if(mmSigningOut)return;const userId=mmUser?.id;if(!userId)return;
 const forget=document.getElementById('mmForgetDevice')?.checked===true;
 if(forget&&hasUnsavedChanges){mmAuthMessage('Save your recipe before removing this device copy, then refresh & sync.');return;}
 mmSigningOut=true;
 try{
  if(hasUnsavedChanges)mmSaveRecipeDraft();
  if(mmCloudReady&&navigator.onLine)await mmSyncCloud().catch(()=>{});
  if(forget&&(mmReadPending(userId).length||mmRawJson(mmDraftKey(userId),null)?.recipe)){
   mmAuthMessage('Device copy kept: saved changes or a recovery draft still need attention. Save and sync them first, or sign out without removing the device copy.');return;
  }
  const {error}=await mmSupabase.auth.signOut({scope:'local'});if(error)throw error;
  // The signed-out callback is suppressed while this operation owns cleanup.
  mmUser=null;mmEntryPromise=null;mmEntryUserId=null;mmClearPrivateUi();
  if(forget)mmRemoveAccountDeviceCopy(userId);
  const checkbox=document.getElementById('mmForgetDevice');if(checkbox)checkbox.checked=false;
  mmAuthMessage(forget?'Signed out. This account’s device copy was removed.':'Signed out. This account’s data is hidden; a device copy is kept for offline recovery.');
 }catch(error){mmAuthMessage('Sign-out could not finish. '+error.message);}
 finally{mmSigningOut=false;}
}
async function mmStartTrial(){
  const button=document.getElementById('mmStartTrial');button.disabled=true;document.getElementById('mmBillingMessage').textContent='Opening secure Stripe Checkout…';
  try{const {data,error}=await mmSupabase.functions.invoke('create-checkout-session');if(error)throw error;if(!data?.url)throw new Error(data?.error||'Stripe did not return a checkout link.');window.location.assign(data.url);}
  catch(error){console.error(error);document.getElementById('mmBillingMessage').textContent='Could not open checkout. Check your connection and try again.';button.disabled=false;}
}
async function mmManageBilling(button=document.getElementById('mmManageBilling'),message=document.getElementById('mmBillingMessage')){
  button.disabled=true;message.textContent='Opening secure billing settings…';
  try{const {data,error}=await mmSupabase.functions.invoke('create-portal-session');if(error)throw error;if(!data?.url)throw new Error(data?.error||'Stripe did not return a billing link.');window.location.assign(data.url);}
  catch(error){console.error(error);message.textContent='Could not open billing settings. If this is your first visit, start the free trial first.';button.disabled=false;}
}

document.getElementById('mmAuthForm').addEventListener('submit',async event=>{
  event.preventDefault();if(mmRecoveryMode==='error'){mmRecoveryMode='none';mmRecoveryClearUrl();}const email=document.getElementById('mmEmail').value.trim(),password=document.getElementById('mmPassword').value;
  mmAuthMessage('Signing in…');const {error}=await mmSupabase.auth.signInWithPassword({email,password});if(error)mmAuthMessage(error.message);
});
document.getElementById('mmSignUp').addEventListener('click',async()=>{
  const email=document.getElementById('mmEmail').value.trim(),password=document.getElementById('mmPassword').value;
  if(!email||password.length<8){mmAuthMessage('Enter your email and a password of at least 8 characters first.');return;}
  mmAuthMessage('Creating your account…');const {data,error}=await mmSupabase.auth.signUp({email,password,options:{emailRedirectTo:MM_AUTH_REDIRECT_URL}});
  if(error)mmAuthMessage(error.message);else if(!data.session)mmAuthMessage('Account created. Check your email for the confirmation link, then return here and sign in.');
});
const MM_RESET_COOLDOWN_KEY='menumargin-reset-email-cooldown-v1';
let mmResetEmailSending=false,mmResetEmailUntil=0,mmResetEmailTimer=null;
try{const value=Number(sessionStorage.getItem(MM_RESET_COOLDOWN_KEY));if(Number.isFinite(value)&&value>Date.now()&&value<Date.now()+61000)mmResetEmailUntil=value;}catch{}
function mmRenderResetEmailButton(){
 const button=document.getElementById('mmReset'),seconds=Math.max(0,Math.ceil((mmResetEmailUntil-Date.now())/1000));
 button.disabled=mmResetEmailSending||seconds>0;
 button.textContent=mmResetEmailSending?'Sending reset email…':seconds>0?`Resend cooldown (${seconds}s)`:'Forgot password?';
 clearTimeout(mmResetEmailTimer);if(seconds>0)mmResetEmailTimer=setTimeout(mmRenderResetEmailButton,1000);
}
async function mmRequestPasswordReset(){
 if(mmResetEmailSending)return;
 if(Date.now()<mmResetEmailUntil){mmAuthMessage('Please wait for the resend cooldown. The email service may impose a longer sending limit.');return;}
 const field=document.getElementById('mmEmail'),email=field.value.trim();
 if(!email||!field.checkValidity()){mmAuthMessage('Enter a valid email address first, then choose Forgot password again.');return;}
 mmResetEmailSending=true;mmResetEmailUntil=Date.now()+60000;
 try{sessionStorage.setItem(MM_RESET_COOLDOWN_KEY,String(mmResetEmailUntil));}catch{}
 mmRenderResetEmailButton();mmAuthMessage('Sending password reset email…');
 try{
  const {error}=await mmSupabase.auth.resetPasswordForEmail(email,{redirectTo:MM_PASSWORD_REDIRECT_URL});
  if(error){
   const emailLimit=String(error.code||'')==='over_email_send_rate_limit'||/email.*rate|rate.*email/i.test(String(error.message||''));
   mmAuthMessage(emailLimit?'Email sending limit reached. The email service is temporarily blocking more messages. Wait for its sending quota to reset; the resend cooldown does not reset that quota. Your password has not changed.':error.status===429?'Too many requests. Wait and try again later. Your password has not changed.':error.message);
  }else mmAuthMessage('If that email is registered, a password reset link has been sent. Use the newest email; wait before requesting another.');
 }catch{mmAuthMessage('Could not request a reset email. Check the connection and try again after the cooldown.');}
 finally{mmResetEmailSending=false;mmRenderResetEmailButton();}
}
document.getElementById('mmReset').addEventListener('click',mmRequestPasswordReset);
mmRenderResetEmailButton();
document.getElementById('mmPasswordRecoveryForm').addEventListener('submit',mmRecoverySubmit);
document.getElementById('mmCancelPasswordRecovery').addEventListener('click',()=>mmRecoveryFinish('Password reset cancelled. You can sign in normally.'));
document.getElementById('mmFinishRecoverySignOut').addEventListener('click',()=>mmRecoveryFinish('Recovery session closed. Sign in with your current password.'));
document.getElementById('mmSignOut').addEventListener('click',()=>mmSignOut());
document.getElementById('mmRefreshCloud')?.addEventListener('click',()=>mmRefreshCloud(true));
document.getElementById('mmStartTrial').addEventListener('click',mmStartTrial);
document.getElementById('mmManageBilling').addEventListener('click',()=>mmManageBilling());
document.getElementById('mmManageBillingAccount').addEventListener('click',()=>mmManageBilling(document.getElementById('mmManageBillingAccount'),document.getElementById('mmCloudStatus')));
document.getElementById('mmCheckBilling').addEventListener('click',()=>mmUser&&mmEnterApp(mmUser,true));
document.getElementById('mmBillingSignOut').addEventListener('click',()=>mmSignOut());
document.getElementById('mmRetryStartup').addEventListener('click',async()=>{const {data,error}=await mmSupabase.auth.getSession();if(error)mmAuthMessage('Could not reconnect: '+error.message);else if(data.session)await mmEnterApp(data.session.user,true);});
document.addEventListener('input',event=>{if(event.target?.closest('#view-costing'))mmSaveRecipeDraftSoon();});
document.addEventListener('change',event=>{if(event.target?.closest('#view-costing'))mmSaveRecipeDraftSoon();});
document.addEventListener('click',event=>{if(event.target?.closest('#view-costing .remove-row, #addIngredient, #newRecipe'))mmSaveRecipeDraftSoon();});
function mmPersistBeforeLeave(){if(hasUnsavedChanges)mmSaveRecipeDraft();}
window.addEventListener('beforeunload',event=>{
  if(!hasUnsavedChanges)return;
  mmPersistBeforeLeave();event.preventDefault();event.returnValue='';
});
window.addEventListener('pagehide',()=>{
  mmPersistBeforeLeave();
  if(mmCloudReady)mmSyncCloud().catch(()=>{});
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='hidden'){if(document.body.classList.contains('mm-authenticated'))mmRefreshCloud();return;}
  mmPersistBeforeLeave();
  if(mmCloudReady)mmSyncCloud().catch(()=>{});
});
window.addEventListener('online',()=>{if(mmUser)mmRefreshCloud(true);});
window.addEventListener('focus',()=>{if(document.body.classList.contains('mm-authenticated'))mmRefreshCloud();});
window.addEventListener('storage',event=>{
  if(!mmUser)return;
  if(event.key===mmAccountCacheKey(MM_PRICEBOOK_KEY,mmUser.id)&&typeof mmRefreshRecipePrices==='function'){
    mmRefreshRecipePrices();renderPriceBook();refreshLibrary(currentRecipeId);
  }
});
mmSupabase.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    mmRecoveryStart(session);return;
  }
  if(event==='SIGNED_OUT'&&mmRecoveryMode!=='none'){mmUser=null;if(mmRecoveryMode==='editing')mmRecoveryShowError('The recovery session ended. Request a fresh reset link.');return;}
  if(mmRecoveryMode!=='none')return;
  if(event==='SIGNED_OUT'&&!mmSigningOut){mmUser=null;if(mmAppBooted)mmClearPrivateUi();}
  if(session&&['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
    Promise.resolve().then(()=>mmEnterApp(session.user));
  }
});
(async()=>{
  try{
    const {data,error}=await mmSupabase.auth.getSession();
    if(error)throw error;
    if(await mmRecoveryCheckInitial(data.session))return;
    if(data.session)await mmEnterApp(data.session.user);
    else mmAuthMessage('Enter your email and password to sign in, or create a new account.');
  }catch(error){if(mmRecoveryRequested){mmRecoveryShowError('Could not verify this reset link. Reconnect and request a fresh reset email.');return;}mmAuthMessage('Sign-in service unavailable. Reconnect to sign in; this device’s saved data remains intact.');}
})();
