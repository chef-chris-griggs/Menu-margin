// Only the public Supabase key belongs in the browser. RLS enforces ownership.
const MM_SUPABASE_URL = 'https://phwdyckedcqxbojpbqgz.supabase.co';
const MM_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_q711FpfYM17f3d1J_dTJOg_XRgmOufq';
const MM_AUTH_REDIRECT_URL = window.location.protocol === 'file:'
  ? 'https://chef-chris-griggs.github.io/Menu-margin/'
  : window.location.href.split('#')[0];
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
function mmReadPending(userId=mmUser?.id){return userId?mmRawJson(mmPendingKey(userId),[]):[]}
function mmWritePending(queue,userId=mmUser?.id){if(userId)localStorage.setItem(mmPendingKey(userId),JSON.stringify(queue))}
function mmQueueMutation(kind,action,id,record,userId=mmUser?.id){
  if(!userId||!id)return;
  const queue=mmReadPending(userId).filter(m=>!(m.kind===kind&&m.id===id));
  queue.push({kind,action,id,record:record||null,changedAt:Date.now()});
  mmWritePending(queue,userId);
}
function mmQueueListDiff(kind,before,after,userId){
  const oldById=new Map((Array.isArray(before)?before:[]).filter(x=>x?.id).map(x=>[x.id,x]));
  const newById=new Map((Array.isArray(after)?after:[]).filter(x=>x?.id).map(x=>[x.id,x]));
  for(const [id] of oldById)if(!newById.has(id))mmQueueMutation(kind,'delete',id,null,userId);
  for(const [id,item] of newById){
    if(!oldById.has(id)||JSON.stringify(oldById.get(id))!==JSON.stringify(item))mmQueueMutation(kind,'upsert',id,item,userId);
  }
}
function mmReadUserCache(key,userId){return mmParseJson(localStorage.getItem(mmAccountCacheKey(key,userId)),[])}
function mmWriteUserCache(key,records,userId=mmUser?.id,{track=true}={}){
  if(!userId)throw new Error('Sign in to save account data.');
  const kind=key===MM_LIBRARY_KEY?'recipes':key===MM_PRICEBOOK_KEY?'prices':null;
  const tracked=Boolean(track&&kind&&!mmHydrating);
  const before=tracked?mmReadUserCache(key,userId):[];
  localStorage.setItem(mmAccountCacheKey(key,userId),JSON.stringify(records));
  if(tracked){mmQueueListDiff(kind,before,records,userId);mmScheduleSync();}
}
function mmReadManifest(userId){
  const value=mmRawJson(mmManifestKey(userId),{});
  return {recipes:new Set(Object.keys(value.recipes||{})),prices:new Set(Object.keys(value.prices||{}))};
}
function mmSaveCloudManifest(){
  if(!mmUser)return;
  const manifest={recipes:{},prices:{}};
  for(const [id,version] of mmCloudVersionsRecipes)manifest.recipes[id]=version||true;
  for(const [id,version] of mmCloudVersionsPrices)manifest.prices[id]=version||true;
  localStorage.setItem(mmManifestKey(mmUser.id),JSON.stringify(manifest));
}
function mmApplyPending(kind,records,queue){
  const map=new Map((records||[]).map(record=>[record.id,record]));
  for(const m of queue.filter(item=>item.kind===kind)){
    if(m.action==='delete')map.delete(m.id);
    else if(m.action==='upsert'&&m.record)map.set(m.id,m.record);
  }
  return [...map.values()];
}
function mmTryMigrateLegacy(userId,recipes,prices){
  const owner=localStorage.getItem(MM_LEGACY_CLAIM_KEY);
  if(owner&&owner!==userId)return {recipes,prices,migrated:false};
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
    migratedRecipes.push(migrated);recipeIds.add(migrated.id);mmQueueMutation('recipes','upsert',migrated.id,migrated,userId);
  }
  const migratedPrices=[...prices],priceIds=new Set(migratedPrices.map(x=>x.id));
  for(const item of legacyPrices){
    if(!item||typeof item!=='object')continue;
    const migrated={...item,id:item.id&&!priceIds.has(item.id)?item.id:mmNewUuid(),updatedAt:item.updatedAt||new Date().toISOString()};
    migratedPrices.push(migrated);priceIds.add(migrated.id);mmQueueMutation('prices','upsert',migrated.id,migrated,userId);
  }
  localStorage.setItem(MM_LEGACY_CLAIM_KEY,userId);
  return {recipes:migratedRecipes,prices:migratedPrices,migrated:true};
}
function mmPreferCachedRecord(local,cloud,knownOnPriorCloud){
  if(!cloud)return !knownOnPriorCloud;
  const localTime=Date.parse(local.updatedAt||'')||0;
  const cloudTime=Date.parse(cloud.updatedAt||'')||0;
  return localTime>cloudTime;
}
async function mmLoadCloud(userId=mmUser?.id){
  if(!userId)throw new Error('Sign in is required to load account data.');
  mmCloudReady=false;mmHydrating=true;
  try{
    const [recipesResult,pricesResult]=await Promise.all([
      mmSupabase.from('recipes').select('id,name,recipe_data,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}),
      mmSupabase.from('price_book').select('id,item_data,updated_at').eq('user_id',userId).order('updated_at',{ascending:false})
    ]);
    if(recipesResult.error)throw new Error('Could not load recipes: '+recipesResult.error.message);
    if(pricesResult.error)throw new Error('Could not load price book: '+pricesResult.error.message);
    if(mmUser?.id!==userId)throw new Error('Account changed while data was loading.');
    const cloudRecipes=(recipesResult.data||[]).map(r=>({...r.recipe_data,id:r.id,name:r.name||r.recipe_data?.name||'Untitled recipe',updatedAt:r.updated_at||r.recipe_data?.updatedAt}));
    const cloudPrices=(pricesResult.data||[]).map(r=>({...r.item_data,id:r.id,updatedAt:r.updated_at||r.item_data?.updatedAt}));
    const oldManifest=mmReadManifest(userId),queue=mmReadPending(userId);
    const localRecipes=mmReadUserCache(MM_LIBRARY_KEY,userId),localPrices=mmReadUserCache(MM_PRICEBOOK_KEY,userId);
    let merged=mmTryMigrateLegacy(userId,cloudRecipes,cloudPrices);
    const mergeCache=(kind,cloud,cache,seen)=>{
      const byId=new Map(cloud.map(r=>[r.id,r]));
      for(const local of cache){
        if(!local?.id)continue;
        const existing=byId.get(local.id),known=seen.has(local.id);
        if(mmPreferCachedRecord(local,existing,known)){
          byId.set(local.id,local);mmQueueMutation(kind,'upsert',local.id,local,userId);
        }
      }
      for(const item of mmReadPending(userId).filter(m=>m.kind===kind)){
        if(item.action==='delete')byId.delete(item.id);
        else if(item.action==='upsert'&&item.record)byId.set(item.id,item.record);
      }
      return [...byId.values()];
    };
    merged.recipes=mergeCache('recipes',merged.recipes,localRecipes,oldManifest.recipes);
    merged.prices=mergeCache('prices',merged.prices,localPrices,oldManifest.prices);
    // Hydrate only the signed-in account's cache. Pending local edits and deletes have already
    // been overlaid, so a successful cloud read cannot erase work from a previous session.
    localStorage.setItem(mmAccountCacheKey(MM_LIBRARY_KEY,userId),JSON.stringify(merged.recipes));
    localStorage.setItem(mmAccountCacheKey(MM_PRICEBOOK_KEY,userId),JSON.stringify(merged.prices));
    mmCloudBaselineRecipes=new Map(cloudRecipes.map(r=>[r.id,JSON.stringify(r)]));
    mmCloudBaselinePrices=new Map(cloudPrices.map(r=>[r.id,JSON.stringify(r)]));
    mmCloudVersionsRecipes=new Map((recipesResult.data||[]).map(r=>[r.id,r.updated_at]));
    mmCloudVersionsPrices=new Map((pricesResult.data||[]).map(r=>[r.id,r.updated_at]));
    localStorage.setItem(mmManifestKey(userId),JSON.stringify({
      recipes:Object.fromEntries(mmCloudVersionsRecipes),prices:Object.fromEntries(mmCloudVersionsPrices)
    }));
    mmCloudReady=true;mmCloudOffline=false;
    if(merged.migrated){
      const note=document.getElementById('mmMigrationNotice');
      if(note){note.hidden=false;note.textContent='Your previous device recipes and price book were copied into this signed-in account and queued to sync.';}
    }
    if(mmReadPending(userId).length&&mmUser?.id===userId)mmScheduleSync();
    return {recipes:merged.recipes,prices:merged.prices,migrated:merged.migrated};
  }finally{mmHydrating=false;}
}
function mmScheduleSync(){
  if(!mmUser||!mmCloudReady||!navigator.onLine)return;
  clearTimeout(mmSyncTimer);
  mmSyncTimer=setTimeout(()=>mmSyncCloud().catch(error=>{
    console.error(error);mmCloudReady=false;mmCloudOffline=true;
    mmAuthMessage('Offline — your changes are saved on this device and will sync when the connection returns.');
  }),MM_SYNC_DEBOUNCE_MS);
}
function mmSyncCloud(){
  clearTimeout(mmSyncTimer);
  if(!mmUser||!mmCloudReady||!navigator.onLine)return Promise.resolve({offline:true});
  const run=mmSyncChain.catch(()=>{}).then(mmSyncCloudInner);
  mmSyncChain=run;return run;
}
function mmRemoveSyncedPending(snapshot,userId){
  const current=mmReadPending(userId),sent=new Map(snapshot.map(item=>[item.kind+':'+item.id,JSON.stringify(item)]));
  const remaining=current.filter(item=>sent.get(item.kind+':'+item.id)!==JSON.stringify(item));
  mmWritePending(remaining,userId);
}
async function mmPushOne(kind,rec,versions){
  const table=kind==='recipes'?'recipes':'price_book',stamp=new Date().toISOString();
  const body=kind==='recipes'?{name:rec.name||'Untitled recipe',recipe_data:rec,user_id:mmUser.id,updated_at:stamp}:{item_data:rec,user_id:mmUser.id,updated_at:stamp};
  const known=versions.get(rec.id);
  if(known){
    const {data,error}=await mmSupabase.from(table).update(body).eq('id',rec.id).eq('user_id',mmUser.id).eq('updated_at',known).select('id,updated_at');
    if(error)throw error;
    if(data&&data.length){versions.set(rec.id,data[0].updated_at);return {ok:true};}
    const {data:current,error:readError}=await mmSupabase.from(table).select('*').eq('id',rec.id).eq('user_id',mmUser.id);
    if(readError)throw readError;
    if(current&&current.length)return {conflict:current[0]};
  }
  const {data,error}=await mmSupabase.from(table).upsert({id:rec.id,...body},{onConflict:'id'}).select('id,updated_at');
  if(error)throw error;if(data&&data[0])versions.set(rec.id,data[0].updated_at);return {ok:true};
}
async function mmResolveConflict(c){
  const {kind,key,rec,cloud,baseline,versions}=c;
  const cloudRec=kind==='recipes'
    ?{...cloud.recipe_data,id:cloud.id,name:cloud.name||cloud.recipe_data?.name||'Untitled recipe',updatedAt:cloud.updated_at}
    :{...cloud.item_data,id:cloud.id,updatedAt:cloud.updated_at};
  const label=rec.name||'Untitled',copy={...rec,id:mmNewUuid(),name:label+' (conflict copy)',updatedAt:new Date().toISOString()};
  await mmPushOne(kind,copy,versions);
  baseline.set(cloudRec.id,JSON.stringify(cloudRec));versions.set(cloudRec.id,cloud.updated_at);baseline.set(copy.id,JSON.stringify(copy));
  const fresh=mmReadUserCache(key,mmUser.id).filter(x=>x.id!==rec.id&&x.id!==copy.id);
  fresh.push(cloudRec,copy);mmWriteUserCache(key,fresh,mmUser.id,{track:false});
  const msg=`“${label}” changed on another device. Both versions were kept; yours is “${copy.name}”. Review both and delete the one you do not need.`;
  mmAuthMessage(msg);
  if(kind==='recipes'){
    if(currentRecipeId===rec.id&&!hasUnsavedChanges)loadRecipe(copy);else if(currentRecipeId===rec.id)currentRecipeId=copy.id;
    refreshLibrary(currentRecipeId);showToast(msg);
  }else{renderPriceBook();const toast=document.getElementById('pbToast');if(toast)toast.textContent=msg;}
}
async function mmSyncCloudInner(){
  if(!mmCloudReady||!mmUser||!navigator.onLine)return {offline:true};
  mmSyncing=true;const userId=mmUser.id,pendingSnapshot=mmReadPending(userId),conflicts=[];
  try{
    const sets=[['recipes',MM_LIBRARY_KEY,mmCloudBaselineRecipes,mmCloudVersionsRecipes],['prices',MM_PRICEBOOK_KEY,mmCloudBaselinePrices,mmCloudVersionsPrices]];
    for(const [kind,key,baseline,versions] of sets){
      const list=mmReadUserCache(key,userId),ids=new Set(list.map(r=>r.id));
      for(const rec of list){
        const json=JSON.stringify(rec);if(baseline.get(rec.id)===json)continue;
        const result=await mmPushOne(kind,rec,versions);
        if(result.conflict)conflicts.push({kind,key,rec,cloud:result.conflict,baseline,versions});
        else baseline.set(rec.id,json);
      }
      const removed=[...baseline.keys()].filter(id=>!ids.has(id));
      for(const id of removed){
        const knownVersion=versions.get(id);if(!knownVersion){baseline.delete(id);continue;}
        const {data:deleted,error}=await mmSupabase.from(kind==='recipes'?'recipes':'price_book').delete().eq('user_id',userId).eq('id',id).eq('updated_at',knownVersion).select('id');
        if(error)throw error;
        if(deleted?.length){baseline.delete(id);versions.delete(id);}
        else{
          const {data:current,error:readError}=await mmSupabase.from(kind==='recipes'?'recipes':'price_book').select('id,updated_at').eq('user_id',userId).eq('id',id);
          if(readError)throw readError;
          if(current?.[0]){
            versions.set(id,current[0].updated_at);
            const table=kind==='recipes'?'recipes':'price_book';
            const {data:record,error:recordError}=await mmSupabase.from(table).select(kind==='recipes'?'id,name,recipe_data,updated_at':'id,item_data,updated_at').eq('user_id',userId).eq('id',id).maybeSingle();
            if(recordError)throw recordError;
            if(record){
              const restored=kind==='recipes'
                ?{...record.recipe_data,id:record.id,name:record.name||record.recipe_data?.name||'Untitled recipe',updatedAt:record.updated_at}
                :{...record.item_data,id:record.id,updatedAt:record.updated_at};
              const latest=mmReadUserCache(key,userId).filter(item=>item.id!==id);latest.push(restored);
              mmWriteUserCache(key,latest,userId,{track:false});baseline.set(id,JSON.stringify(restored));
              mmAuthMessage('A delete was paused because this item changed on another device. The latest version was restored here.');
            }
          }
          else{baseline.delete(id);versions.delete(id);}
        }
      }
    }
    for(const conflict of conflicts)await mmResolveConflict(conflict);
    mmRemoveSyncedPending(pendingSnapshot,userId);mmSaveCloudManifest();
    mmCloudOffline=false;
    if(!conflicts.length)mmAuthMessage('Cloud sync is up to date.');
    return {conflicts:conflicts.length};
  }finally{mmSyncing=false;}
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
  if(!user)return Promise.resolve();
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
    if(mmUser?.id!==user.id)return;
    if(mmBillingEnabled){
      mmAuthMessage('Checking your subscription…');
      try{
        const {data,error}=await mmSupabase.rpc('menu_margin_has_paid_access');
        if(error)throw error;mmSaveAccessSnapshot(user.id,Boolean(data));
        if(mmUser?.id!==user.id)return;
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
      if(mmUser?.id!==user.id)return;
      result=mmUseOfflineCache(user.id);
      mmAuthMessage('Offline mode — recipes and prices are available on this device. Changes are queued and will sync when online.');
    }
    if(mmUser?.id!==user.id)return;
    document.body.classList.remove('mm-payment-required');document.getElementById('mmSubscriptionGate').hidden=true;
    document.body.classList.add('mm-authenticated');
    document.getElementById('mmAccountLabel').textContent='Signed in: '+(user.email||'your account');
    document.getElementById('mmManageBillingAccount').hidden=!mmBillingEnabled;
    document.getElementById('mmRetryStartup').hidden=true;
    mmLoadCurrentAccountData(result);
    if(offlineAccess||mmCloudOffline)mmAuthMessage('Offline mode — local changes are safe here and will sync when the connection returns.');
    else mmAuthMessage('Signed in. Cloud sync is working.');
  })().catch(error=>{
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
async function mmSignOut(){
  if(mmSigningOut)return;mmSigningOut=true;
  try{
    if(hasUnsavedChanges)mmSaveRecipeDraft();
    if(mmCloudReady&&navigator.onLine)await mmSyncCloud().catch(error=>console.warn('Sync will resume after sign-in:',error));
    await mmSupabase.auth.signOut({scope:'local'});
    mmUser=null;mmEntryPromise=null;mmEntryUserId=null;mmClearPrivateUi();
    mmAuthMessage('Signed out. This account’s data is hidden on this device.');
  }finally{mmSigningOut=false;}
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
  event.preventDefault();const email=document.getElementById('mmEmail').value.trim(),password=document.getElementById('mmPassword').value;
  mmAuthMessage('Signing in…');const {error}=await mmSupabase.auth.signInWithPassword({email,password});if(error)mmAuthMessage(error.message);
});
document.getElementById('mmSignUp').addEventListener('click',async()=>{
  const email=document.getElementById('mmEmail').value.trim(),password=document.getElementById('mmPassword').value;
  if(!email||password.length<8){mmAuthMessage('Enter your email and a password of at least 8 characters first.');return;}
  mmAuthMessage('Creating your account…');const {data,error}=await mmSupabase.auth.signUp({email,password,options:{emailRedirectTo:MM_AUTH_REDIRECT_URL}});
  if(error)mmAuthMessage(error.message);else if(!data.session)mmAuthMessage('Account created. Check your email for the confirmation link, then return here and sign in.');
});
document.getElementById('mmReset').addEventListener('click',async()=>{
  const email=document.getElementById('mmEmail').value.trim();if(!email){mmAuthMessage('Enter your email address first, then choose Forgot password again.');return;}
  mmAuthMessage('Sending password reset email…');const {error}=await mmSupabase.auth.resetPasswordForEmail(email,{redirectTo:MM_AUTH_REDIRECT_URL});
  mmAuthMessage(error?error.message:'If that email is registered, a password reset link has been sent.');
});
document.getElementById('mmPasswordRecoveryForm').addEventListener('submit',async event=>{
  event.preventDefault();const password=document.getElementById('mmNewPassword').value;
  if(password.length<8){mmAuthMessage('Choose a password with at least 8 characters.');return;}
  mmAuthMessage('Updating password…');const {error}=await mmSupabase.auth.updateUser({password});
  if(error){mmAuthMessage('Could not update password: '+error.message);return;}
  document.getElementById('mmPasswordRecoveryForm').hidden=true;document.getElementById('mmAuthForm').hidden=false;document.getElementById('mmNewPassword').value='';await mmSupabase.auth.signOut({scope:'local'});mmAuthMessage('Password updated. You can now sign in with your new password.');
});
document.getElementById('mmCancelPasswordRecovery').addEventListener('click',async()=>{
  document.getElementById('mmPasswordRecoveryForm').hidden=true;document.getElementById('mmAuthForm').hidden=false;await mmSupabase.auth.signOut({scope:'local'});mmAuthMessage('Password reset cancelled. You can sign in normally.');
});
document.getElementById('mmSignOut').addEventListener('click',mmSignOut);
document.getElementById('mmStartTrial').addEventListener('click',mmStartTrial);
document.getElementById('mmManageBilling').addEventListener('click',()=>mmManageBilling());
document.getElementById('mmManageBillingAccount').addEventListener('click',()=>mmManageBilling(document.getElementById('mmManageBillingAccount'),document.getElementById('mmCloudStatus')));
document.getElementById('mmCheckBilling').addEventListener('click',()=>mmUser&&mmEnterApp(mmUser,true));
document.getElementById('mmBillingSignOut').addEventListener('click',mmSignOut);
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
  if(document.visibilityState!=='hidden')return;
  mmPersistBeforeLeave();
  if(mmCloudReady)mmSyncCloud().catch(()=>{});
});
window.addEventListener('online',()=>{if(mmUser){mmAuthMessage('Connection restored. Merging local changes and syncing…');mmEnterApp(mmUser,true);}});
mmSupabase.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    document.getElementById('mmAuthForm').hidden=true;document.getElementById('mmPasswordRecoveryForm').hidden=false;mmAuthMessage('Enter a new password below.');return;
  }
  if(event==='SIGNED_OUT'&&!mmSigningOut){mmUser=null;if(mmAppBooted)mmClearPrivateUi();}
  if(session&&['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
    Promise.resolve().then(()=>mmEnterApp(session.user));
  }
});
(async()=>{
  try{
    const {data,error}=await mmSupabase.auth.getSession();
    if(error)throw error;
    if(data.session)await mmEnterApp(data.session.user);
    else mmAuthMessage('Enter your email and password to sign in, or create a new account.');
  }catch(error){mmAuthMessage('Sign-in service unavailable. Reconnect to sign in; this device’s saved data remains intact.');}
})();
