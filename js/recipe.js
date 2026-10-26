const $=id=>document.getElementById(id);

function setActiveView(name){
  const tabs=[...document.querySelectorAll('.nav-tab')];
  tabs.forEach(tab=>{const active=tab.dataset.view===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false')});
  document.body.dataset.activeView=name;
  $('view-costing').hidden=name!=='costing';
  $('view-recipes').hidden=name!=='recipes';
  $('view-pricebook').hidden=name!=='pricebook';
  $('view-invoices').hidden=name!=='invoices';
  $('costingLayout').hidden=name!=='costing';
  if(name==='pricebook')renderPriceBook();
  if(name==='recipes')refreshLibrary(currentRecipeId);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav-tab').forEach(tab=>tab.addEventListener('click',()=>setActiveView(tab.dataset.view)));

const money=n=>Number.isFinite(n)?n.toLocaleString('en-GB',{style:'currency',currency:'GBP'}):'—';
const escapeCsv=s=>{
  const value=String(s??'');
  const formulaLike=/^[\t\r\n ]*[=+\-@]/.test(value)&&!/^\s*-?\d+(?:[.,]\d+)?$/.test(value);
  return '"'+(formulaLike?"'"+value:value).replace(/"/g,'""')+'"';
};
const LEGACY_KEY='menumargin-recipe';
let rowId=0;
let currentRecipeId=null;
let hasUnsavedChanges=false;
let toastTimer=null;
let recipesToastTimer=null;

function updateRecipeHeader(){
  const name=$('recipeName').value.trim();
  $('recipeHeading').textContent=name||'New recipe';
  $('recipeStateCaption').textContent=hasUnsavedChanges?'Changes not saved':currentRecipeId?(mmCloudReady?'Saved to your account':'Saved on this device'):'Not saved yet';
}

function readLibrary(){
  if(!mmUser)return [];
  try{
    const value=mmReadUserCache(MM_LIBRARY_KEY,mmUser.id);
    return Array.isArray(value)?value.filter(r=>r&&typeof r==='object'&&r.id):[];
  }catch(e){return []}
}
function writeLibrary(items){
  mmWriteUserCache(MM_LIBRARY_KEY,items,mmUser?.id);
}
function recipeData(){
  return {id:currentRecipeId,name:$('recipeName').value.trim()||'Untitled recipe',yield:Math.max(1,Math.floor(Number($('yield').value)||1)),sellingPrice:Number($('sellingPrice').value)||0,targetGp:Number($('targetGp').value)||70,ingredients:rows(),updatedAt:new Date().toISOString()};
}
function refreshLibrary(selectedId=currentRecipeId){
  const select=$('recipeSelect'),cards=$('recipeCards'),empty=$('recipeEmpty'),items=readLibrary().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  select.innerHTML='';
  if(!items.length){
    const option=document.createElement('option');option.value='';option.textContent='No saved recipes yet';select.appendChild(option);
  }else{
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a saved recipe…';select.appendChild(placeholder);
    items.forEach(item=>{
      const option=document.createElement('option');option.value=item.id;option.textContent=item.name||'Untitled recipe';select.appendChild(option);
    });
  }
  if(selectedId&&items.some(r=>r.id===selectedId))select.value=selectedId;
  empty.hidden=items.length>0;cards.hidden=items.length===0;cards.replaceChildren();
  items.forEach(item=>{
    const card=document.createElement('article');card.className='recipe-card';
    const info=document.createElement('div'),title=document.createElement('h2'),meta=document.createElement('div');
    title.textContent=item.name||'Untitled recipe';meta.className='recipe-card-meta';
    const ingredientCount=(item.ingredients||[]).filter(row=>String(row.name||'').trim()).length;
    meta.textContent=`${Number(item.yield)||1} portions · ${ingredientCount} ingredient${ingredientCount===1?'':'s'} · Updated ${new Date(item.updatedAt||Date.now()).toLocaleDateString('en-GB')}`;
    info.append(title,meta);
    const actions=document.createElement('div');actions.className='recipe-card-actions';
    const open=document.createElement('button');open.type='button';open.textContent='Open';open.addEventListener('click',()=>openRecipeById(item.id));
    const rename=document.createElement('button');rename.type='button';rename.className='secondary';rename.textContent='Rename';rename.addEventListener('click',()=>renameRecipeById(item.id));
    const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='×';remove.setAttribute('aria-label',`Delete ${item.name||'recipe'}`);remove.addEventListener('click',()=>deleteRecipeById(item.id));
    actions.append(open,rename,remove);card.append(info,actions);cards.appendChild(card);
  });
  updateLibraryButtons();
}
function updateLibraryButtons(){
  const chosen=$('recipeSelect').value;
  ['openRecipe','renameRecipe','deleteRecipe'].forEach(id=>$(id).disabled=!chosen);
  $('openRecipe').style.opacity=chosen?'1':'.55';
  $('renameRecipe').style.opacity=chosen?'1':'.55';
  $('deleteRecipe').style.opacity=chosen?'1':'.55';
}
function showToast(message){const toast=$('toast');toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},5500)}
function showRecipesToast(message){const toast=$('recipesToast');toast.textContent=message;clearTimeout(recipesToastTimer);recipesToastTimer=setTimeout(()=>{toast.textContent='';},7000)}
function downloadAccountBackup(){
  if(!mmUser){showRecipesToast('Sign in before downloading your account backup.');return;}
  const recipes=readLibrary(),draft=hasUnsavedChanges?recipeData():null;
  const draftHasContent=draft&&(draft.name!=='Untitled recipe'||draft.ingredients.some(mmIngredientTouched));
  if(draftHasContent){draft.id=currentRecipeId||mmNewUuid();const index=recipes.findIndex(item=>item.id===draft.id);if(index>=0)recipes[index]=draft;else recipes.push(draft);}
  const backup={format:'menumargin-account-backup',schemaVersion:1,exportedAt:new Date().toISOString(),recipes,priceBook:readPriceBook()};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`menumargin-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showRecipesToast(`Backup downloaded with ${backup.recipes.length} recipe${backup.recipes.length===1?'':'s'} and ${backup.priceBook.length} supplier price${backup.priceBook.length===1?'':'s'}${draftHasContent?'; your unsaved recipe changes were included':''}.`);
}
function mmBackupUuid(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:mmNewUuid()}
function mmBackupRecipe(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const ingredients=Array.isArray(value.ingredients)?value.ingredients.slice(0,1000).map(item=>({
    name:String(item?.name||'').slice(0,300),qty:Math.max(0,Number(item?.qty)||0),qtyUnit:['g','kg','ml','l','each'].includes(item?.qtyUnit)?item.qtyUnit:'g',
    pack:Math.max(0,Number(item?.pack)||0),packUnit:['g','kg','ml','l','each'].includes(item?.packUnit)?item.packUnit:'g',
    price:Math.max(0,Number(item?.price)||0),priceEntered:item?.priceEntered===true||(item?.priceEntered==null&&item?.price!==undefined&&item?.price!==null&&item?.price!=='')
  })):[];
  return {id:mmBackupUuid(value.id),name:String(value.name||'Untitled recipe').slice(0,300),yield:Math.max(1,Math.floor(Number(value.yield)||1)),sellingPrice:Math.max(0,Number(value.sellingPrice)||0),targetGp:Math.min(99.9,Math.max(1,Number(value.targetGp)||70)),ingredients,updatedAt:new Date(Date.parse(value.updatedAt)||Date.now()).toISOString()};
}
function mmStableJson(value){
  if(Array.isArray(value))return '['+value.map(mmStableJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+mmStableJson(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function mmBackupPrice(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const unit=['g','kg','ml','l','each'].includes(value.unitPackUnit)?value.unitPackUnit:['g','kg','ml','l','each'].includes(value.sourceUnit)?value.sourceUnit:null;
  const price=Number(value.price),packBase=Number(value.packBase),caseCount=Math.floor(Number(value.caseCount)||1),unitPackSize=Number(value.unitPackSize)||Number(value.sourcePackSize)||0;
  const name=String(value.name||'').trim(),supplier=String(value.supplier||'').trim();
  if(!name||!supplier||!unit||!Number.isFinite(price)||price<0||!Number.isFinite(packBase)||packBase<=0||!Number.isFinite(unitPackSize)||unitPackSize<=0)return null;
  return {id:mmBackupUuid(value.id),name:name.slice(0,300),supplier:supplier.slice(0,200),code:String(value.code||'').slice(0,120),packBase,baseUnit:['g','kg'].includes(value.baseUnit)?'g':['ml','l'].includes(value.baseUnit)?'ml':'each',price,sourcePackSize:Math.max(0,Number(value.sourcePackSize)||packBase),sourceUnit:unit,caseCount:Math.max(1,caseCount),unitPackSize,unitPackUnit:unit,updatedAt:new Date(Date.parse(value.updatedAt)||Date.now()).toISOString()};
}
function mmBackupRecordKey(item){
  const normalize=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ');
  const supplier=normalize(item.supplier),code=normalize(item.code);
  return supplier+'|'+(code?'code:'+code:'name:'+normalize(item.name));
}
async function restoreAccountBackup(file){
  if(!mmUser){showRecipesToast('Sign in before restoring an account backup.');return;}
  if(!file)return;
  if(file.size>25*1024*1024){showRecipesToast('This backup is larger than 25 MB and cannot be opened here.');return;}
  let backup;
  try{backup=JSON.parse(await file.text())}catch{showRecipesToast('That file is not valid JSON. Choose a MenuMargin backup file.');return;}
  if(backup?.format!=='menumargin-account-backup'||backup?.schemaVersion!==1||!Array.isArray(backup.recipes)||!Array.isArray(backup.priceBook)){
    showRecipesToast('This is not a supported MenuMargin backup. Your current data has not changed.');return;
  }
  const incomingRecipes=backup.recipes.map(mmBackupRecipe).filter(Boolean),incomingPrices=backup.priceBook.map(mmBackupPrice).filter(Boolean);
  const skippedRecipes=backup.recipes.length-incomingRecipes.length,skippedPrices=backup.priceBook.length-incomingPrices.length;
  const currentRecipes=readLibrary(),currentPrices=readPriceBook();
  const accepted=confirm(`Merge ${incomingRecipes.length} recipe${incomingRecipes.length===1?'':'s'} and ${incomingPrices.length} supplier price${incomingPrices.length===1?'':'s'} from this backup into the signed-in account? Current recipes and prices are kept; conflicting recipe versions are added as copies, and matching supplier items keep their current price.${skippedRecipes||skippedPrices?` Invalid rows will be skipped (${skippedRecipes} recipe${skippedRecipes===1?'':'s'}, ${skippedPrices} price${skippedPrices===1?'':'s'}).`:''}`);
  if(!accepted)return;
  let recipeCopies=0,priceCopies=0,priceMatches=0;
  const recipes=[...currentRecipes],recipeById=new Map(recipes.map(item=>[item.id,item]));
  for(const incoming of incomingRecipes){
    const existing=recipeById.get(incoming.id);
    if(!existing){recipes.push(incoming);recipeById.set(incoming.id,incoming);continue;}
    if(mmStableJson(existing)===mmStableJson(incoming))continue;
    const copy={...incoming,id:mmNewUuid(),name:(incoming.name||'Untitled recipe')+' (restored copy)',updatedAt:new Date().toISOString()};
    recipes.push(copy);recipeById.set(copy.id,copy);recipeCopies++;
  }
  const prices=[...currentPrices],priceByProduct=new Map(prices.map(item=>[mmBackupRecordKey(item),item])),priceById=new Map(prices.map(item=>[item.id,item]));
  for(const incoming of incomingPrices){
    const productKey=mmBackupRecordKey(incoming),sameProduct=priceByProduct.get(productKey),sameId=priceById.get(incoming.id);
    if(sameProduct){priceMatches++;continue;}
    if(sameId){incoming.id=mmNewUuid();priceCopies++;}
    prices.push(incoming);priceById.set(incoming.id,incoming);priceByProduct.set(productKey,incoming);
  }
  const recipeCount=recipes.length-currentRecipes.length,priceCount=prices.length-currentPrices.length;
  try{
    if(recipeCount)writeLibrary(recipes);
    if(priceCount)writePriceBook(prices);
  }catch(error){
    refreshLibrary(currentRecipeId);renderPriceBook();
    showRecipesToast('The backup could not be fully saved. Some rows may already be on this device; check Recipes and Prices before retrying.');
    console.error('MenuMargin backup restore failed:',error);return;
  }
  refreshLibrary(currentRecipeId);renderPriceBook();
  if(mmCloudReady)await mmSyncCloud().catch(error=>console.warn('Backup data will sync when connected:',error));
  showRecipesToast(`Restored ${recipeCount} recipe${recipeCount===1?'':'s'} and ${priceCount} supplier price${priceCount===1?'':'s'}${recipeCopies?`; ${recipeCopies} conflicting recipe version${recipeCopies===1?' was':'s were'} kept as copies`:''}${priceMatches?`; ${priceMatches} existing supplier item${priceMatches===1?' was':'s were'} kept unchanged`:''}${skippedRecipes+skippedPrices?`; ${skippedRecipes+skippedPrices} invalid row${skippedRecipes+skippedPrices===1?' was':'s were'} skipped`:''}.`);
}
$('exportBackup').addEventListener('click',downloadAccountBackup);
$('importBackup').addEventListener('click',()=>$('backupFile').click());
$('backupFile').addEventListener('change',async event=>{
  const input=event.currentTarget,file=input.files?.[0];
  try{await restoreAccountBackup(file)}finally{input.value='';}
});
function addRow(data={name:'',qty:100,pack:1000,price:0}){
  const tr=document.createElement('tr');tr.dataset.id=++rowId;
  tr.innerHTML=`<td><input class="ingredient" aria-label="Ingredient name" placeholder="e.g. Chicken breast" autocomplete="off"></td>
  <td><input class="qty" aria-label="Quantity used" type="number" inputmode="decimal" min="0" step="any"></td>
  <td><select class="qty-unit" aria-label="Quantity unit"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">litre</option><option value="each">each</option></select></td>
  <td><input class="pack" aria-label="Pack size" type="number" inputmode="decimal" min="0" step="any"></td>
  <td><select class="pack-unit" aria-label="Pack unit"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">litre</option><option value="each">each</option></select></td>
  <td><input class="price" aria-label="Pack price in pounds" type="number" inputmode="decimal" min="0" step="0.01"></td>
  <td class="cost-cell">£0.00</td><td><button type="button" class="danger remove-row" aria-label="Remove ingredient" title="Remove ingredient">×</button></td>`;
  tr.querySelector('.ingredient').value=data.name??'';
  tr.querySelector('.qty').value=data.qty??'';
  tr.querySelector('.qty-unit').value=data.qtyUnit||'g';
  tr.querySelector('.pack').value=data.pack??'';
  tr.querySelector('.pack-unit').value=data.packUnit||'g';
  tr.querySelector('.price').value=data.priceEntered===false?'':data.price??'';
  tr.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{hasUnsavedChanges=true;calculate();updateRecipeHeader()}));
  tr.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{hasUnsavedChanges=true;calculate();updateRecipeHeader()}));
  tr.querySelector('.remove-row').addEventListener('click',()=>{tr.remove();hasUnsavedChanges=true;calculate();updateRecipeHeader()});
  $('ingredients').appendChild(tr);calculate();
}
function rows(){
  return [...$('ingredients').querySelectorAll('tr')].map(tr=>({
    name:tr.querySelector('.ingredient').value.trim(),
    qty:Number(tr.querySelector('.qty').value)||0,
    qtyUnit:tr.querySelector('.qty-unit').value,
    pack:Number(tr.querySelector('.pack').value)||0,
    packUnit:tr.querySelector('.pack-unit').value,
    price:Number(tr.querySelector('.price').value)||0,
    priceEntered:tr.querySelector('.price').value.trim()!==''
  }));
}
function mmUnitKind(u){return u==='kg'||u==='g'?'mass':u==='l'||u==='ml'?'volume':'count'}
function mmToBase(value,unit){const factor={g:1,kg:1000,ml:1,l:1000,each:1};return Number(value||0)*(factor[unit]||1)}
function mmIngredientTouched(r){return Boolean(String(r.name||'').trim()||Number(r.qty)!==0||Number(r.pack)!==0||r.priceEntered===true||Number(r.price)!==0)}
function mmIngredientCost(r){
  const qty=Number(r.qty)||0,pack=Number(r.pack)||0,price=Number(r.price)||0;
  const invalid=[qty,pack,price].some(value=>!Number.isFinite(value)||value<0);
  const incompatible=qty>0&&pack>0&&mmUnitKind(r.qtyUnit||'g')!==mmUnitKind(r.packUnit||'g');
  const complete=Boolean(!invalid&&String(r.name||'').trim()&&qty>0&&pack>0&&r.priceEntered!==false);
  const cost=complete&&!incompatible?(mmToBase(qty,r.qtyUnit||'g')/mmToBase(pack,r.packUnit||'g'))*price:0;
  return {cost,incompatible,complete,invalid};
}

function calculate(){
 const list=rows();let total=0,mismatch=0,incomplete=0,invalid=0;
 list.forEach((r,i)=>{
  const result=mmIngredientCost(r),touched=mmIngredientTouched(r);
  if(result.incompatible)mismatch++;
  if(result.invalid)invalid++;
  if(touched&&!result.complete)incomplete++;
  total+=result.cost;
  const tr=$('ingredients').querySelectorAll('tr')[i];
  if(tr){
   const cc=tr.querySelector('.cost-cell');
   cc.textContent=result.incompatible?'Check units':result.invalid?'Check values':touched&&!result.complete?'Incomplete':money(result.cost);
   cc.style.color=result.incompatible||result.invalid||touched&&!result.complete?'#a63d40':'';
   tr.querySelectorAll('.qty,.pack,.price').forEach(el=>{const value=Number(el.value);const bad=el.value.trim()!==''&&(!Number.isFinite(value)||value<0);el.style.borderColor=bad?'#a63d40':'';el.setAttribute('aria-invalid',bad?'true':'false')});
   tr.querySelectorAll('.qty-unit,.pack-unit').forEach(el=>{el.style.borderColor=result.incompatible?'#a63d40':'';el.setAttribute('aria-invalid',result.incompatible?'true':'false')});
  }
 });
 const portions=Math.max(1,Math.floor(Number($('yield').value)||1)),portion=total/portions,price=Math.max(0,Number($('sellingPrice').value)||0),gp=price>0?price-portion:0,gpp=price>0?(gp/price)*100:null,food=price>0?(portion/price)*100:null,target=Math.min(99.9,Math.max(1,Number($('targetGp').value)||70)),targetPrice=portion/(1-target/100);
 $('batchCost').textContent=money(total);$('batchDetail').textContent=`Across ${portions} portion${portions===1?'':'s'}`;$('portionCost').textContent=money(portion);$('grossProfit').textContent=price>0?money(gp):'—';$('foodCostPct').textContent=food===null?'—':food.toFixed(1)+'%';$('gpPct').textContent=gpp===null?'—':gpp.toFixed(1)+'%';$('targetPrice').textContent=money(targetPrice);
 $('mobilePortion').textContent=money(portion);$('mobileGp').textContent=gpp===null?'—':gpp.toFixed(1)+'%';
 const status=$('status');status.className='status';
 if(!list.some(r=>mmIngredientCost(r).complete)){status.textContent='Add ingredient names, quantities and pack prices to calculate a meaningful GP.'}
 else if(price<=0){status.textContent='Enter a selling price to see your GP.'}
 else if(gpp<0){status.classList.add('bad');status.textContent='Warning: your food cost is higher than your selling price.'}
 else if(gpp<target){status.classList.add('bad');status.textContent=`Below your ${target}% GP target by ${(target-gpp).toFixed(1)} percentage points.`}
 else{status.classList.add('good');status.textContent=`On or above your ${target}% GP target. Check labour, waste and overheads separately.`}
 const warnings=[];
 if(invalid)warnings.push(`${invalid} ingredient line${invalid===1?' contains':'s contain'} a negative or invalid quantity or price and is excluded from the total.`);
 if(incomplete)warnings.push(`${incomplete} incomplete ingredient line${incomplete===1?' is':'s are'} excluded from the total.`);
 if(mismatch)warnings.push(`${mismatch} ingredient line${mismatch===1?' has':'s have'} incompatible units and is excluded. Check the highlighted units.`);
 if(warnings.length){status.className='status bad';status.textContent=warnings.join(' ')+' '+status.textContent}
}

function loadRecipe(d){
  currentRecipeId=d.id||null;
  $('recipeName').value=d.name||'';$('yield').value=d.yield||1;$('sellingPrice').value=d.sellingPrice??0;$('targetGp').value=d.targetGp??70;
  $('ingredients').innerHTML='';(d.ingredients||[]).forEach(addRow);if(!(d.ingredients||[]).length)addRow({name:'',qty:'',pack:'',price:''});
  hasUnsavedChanges=false;calculate();updateRecipeHeader();refreshLibrary(currentRecipeId);
}
async function saveCurrentRecipe(){
  const items=readLibrary();const data=recipeData();
  if(!currentRecipeId){data.id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)})}
  const index=items.findIndex(r=>r.id===data.id);
  if(index>=0)items[index]=data;else items.push(data);
  try{
    writeLibrary(items);currentRecipeId=data.id;hasUnsavedChanges=false;refreshLibrary(currentRecipeId);updateRecipeHeader();mmClearRecipeDraft();
    if(!mmUser || !mmCloudReady) { showToast(`Saved “${data.name}” on this device. It will sync when you are online.`); if(mmUser)mmAuthMessage('Saved on this device. Cloud sync will resume when online.'); return; }
    mmAuthMessage('Saving recipe to your cloud account…');
    const res=await mmSyncCloud();
    if(res&&res.conflicts)return;
    showToast(`Saved “${data.name}” to your cloud account.`);
    mmAuthMessage('Cloud sync working — recipe saved.');
  }catch(e){console.error('MenuMargin cloud recipe save failed:',e);showToast(`Recipe saved on this device, but cloud save failed: ${e.message}`);mmAuthMessage('CLOUD SAVE ERROR: '+e.message);}
}
function maybeSaveChanges(){
  if(!hasUnsavedChanges)return true;
  return confirm('You have unsaved changes. Continue without saving them? Choose Cancel, then tap Save recipe to keep your changes.');
}
$('addIngredient').addEventListener('click',()=>{
  addRow({name:'',qty:'',pack:'',price:''});
  hasUnsavedChanges=true;
  updateRecipeHeader();
  mmSaveRecipeDraftSoon();
  const last=$('ingredients').lastElementChild;
  const input=last&&last.querySelector('.ingredient');
  if(input){input.focus({preventScroll:false});input.scrollIntoView({behavior:'smooth',block:'center'});}
  showToast('Ingredient added. Enter the name, amount used, pack size and pack price.');
});
// Pressing Enter moves through the fields in order, so recipe entry stays quick.
$('ingredients').addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  const field=event.target;
  if(!field.matches('input'))return;
  event.preventDefault();
  const row=field.closest('tr');
  const fields=[...row.querySelectorAll('input')];
  const index=fields.indexOf(field);
  if(index>=0&&index<fields.length-1){fields[index+1].focus();}
  else if(index===fields.length-1){$('addIngredient').focus();showToast('Ingredient ready. Tap “Add next ingredient” to continue.');}
});
['yield','sellingPrice','targetGp','recipeName'].forEach(id=>$(id).addEventListener('input',()=>{hasUnsavedChanges=true;calculate();updateRecipeHeader()}));
$('useTarget').addEventListener('click',()=>{$('sellingPrice').value=(Number($('targetPrice').textContent.replace(/[£,]/g,''))||0).toFixed(2);hasUnsavedChanges=true;calculate();$('sellingPrice').focus()});
$('viewSummary').addEventListener('click',()=>{$('summary').scrollIntoView({behavior:'smooth',block:'start'})});
$('saveRecipe').addEventListener('click',saveCurrentRecipe);
function startNewRecipe(){
  if(hasUnsavedChanges){
    const continueNew=confirm('Start a new recipe? Any unsaved changes to the current recipe will be lost. Tap Cancel to save the current recipe first.');
    if(!continueNew)return;
  }
  currentRecipeId=null;
  $('recipeName').value='';
  $('yield').value=10;
  $('sellingPrice').value='0';
  $('targetGp').value=70;
  $('ingredients').innerHTML='';
  addRow({name:'',qty:'',pack:'',price:''});
  hasUnsavedChanges=false;
  refreshLibrary('');
  calculate();
  updateRecipeHeader();setActiveView('costing');$('recipeName').focus();
  showToast('New recipe started. Add ingredients, then tap Save recipe.');
}
$('newRecipe').addEventListener('click',startNewRecipe);
$('recipesNew').addEventListener('click',startNewRecipe);
$('recipeEmptyStart').addEventListener('click',startNewRecipe);
$('recipeSelect').addEventListener('change',updateLibraryButtons);
function openRecipeById(id){
  if(!id)return;
  if(!maybeSaveChanges())return;
  const item=readLibrary().find(r=>r.id===id);if(item){loadRecipe(item);setActiveView('costing');showToast(`Opened “${item.name}”.`)}
}
function renameRecipeById(id){
  if(!id)return;
  const items=readLibrary(),item=items.find(r=>r.id===id);if(!item)return;
  const name=prompt('Enter a new name for this recipe:',item.name||'Untitled recipe');
  if(name===null)return;if(!name.trim()){alert('Please enter a recipe name.');return}
  item.name=name.trim();item.updatedAt=new Date().toISOString();
  try{writeLibrary(items);if(currentRecipeId===id){$('recipeName').value=item.name;hasUnsavedChanges=true;mmSaveRecipeDraftSoon();updateRecipeHeader()}refreshLibrary(id);showToast(`Renamed recipe to “${item.name}”.`)}
  catch(e){showToast('Could not rename recipe. Browser storage may be unavailable.')}
}
function deleteRecipeById(id){
  if(!id)return;
  const items=readLibrary(),item=items.find(r=>r.id===id);if(!item)return;
  if(currentRecipeId===id&&!maybeSaveChanges())return;
  if(!confirm(`Delete “${item.name}” from this device? This cannot be undone.`))return;
  try{writeLibrary(items.filter(r=>r.id!==id));if(currentRecipeId===id){currentRecipeId=null;loadRecipe({name:'',yield:10,sellingPrice:0,targetGp:70,ingredients:[]});hasUnsavedChanges=false;mmClearRecipeDraft()}refreshLibrary();showToast(`Deleted “${item.name}” from your account.`)}
  catch(e){showToast('Could not delete recipe.')}
}
$('openRecipe').addEventListener('click',()=>openRecipeById($('recipeSelect').value));
$('renameRecipe').addEventListener('click',()=>renameRecipeById($('recipeSelect').value));
$('deleteRecipe').addEventListener('click',()=>deleteRecipeById($('recipeSelect').value));
$('recipeName').addEventListener('input',updateRecipeHeader);
$('printBtn').addEventListener('click',()=>{
  try {
    calculate();
    const d = recipeData();
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
    const moneyPrint = value => '£' + (Number(value) || 0).toFixed(2);
    const printLines = d.ingredients.filter(mmIngredientTouched).map(r=>({r,...mmIngredientCost(r)}));
    const total = printLines.reduce((sum, line) => sum + line.cost, 0);
    const printMismatchCount = printLines.filter(line=>line.incompatible).length;
    const printIncompleteCount = printLines.filter(line=>!line.complete).length;
    const portions = Math.max(1, Number(d.yield) || 1);
    const portionCost = total / portions;
    const sellPrice = Number(d.sellingPrice) || 0;
    const gpValue = sellPrice - portionCost;
    const gpPercent = sellPrice > 0 ? (gpValue / sellPrice) * 100 : null;
    const foodPercent = sellPrice > 0 ? (portionCost / sellPrice) * 100 : null;
    const target = Math.min(99.9, Math.max(1, Number(d.targetGp) || 70));
    const targetPrice = portionCost / (1 - target / 100);
    const ingredientRows = printLines.map(line => {
      const r=line.r, costLabel=line.incompatible?'Check units':line.complete?moneyPrint(line.cost):'Incomplete';
      return `<tr><td>${escapeHtml(r.name || '—')}</td><td>${escapeHtml(r.qty)} ${escapeHtml(r.qtyUnit||'g')}</td><td>${escapeHtml(r.pack)} ${escapeHtml(r.packUnit||'g')}</td><td>${moneyPrint(r.price)}</td><td>${costLabel}</td></tr>`;
    }).join('');
    const printWarnings=[];
    if(printMismatchCount)printWarnings.push(`${printMismatchCount} ingredient line${printMismatchCount===1?' has':'s have'} incompatible units and was excluded from the total.`);
    if(printIncompleteCount)printWarnings.push(`${printIncompleteCount} incomplete ingredient line${printIncompleteCount===1?' was':'s were'} excluded from the total.`);
    const printHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(d.name)} — Recipe</title><style>
      *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111;margin:24px;line-height:1.4}
      h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:22px 0 8px}
      .sub{color:#444;margin-bottom:18px}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0 22px}
      .stat{border:1px solid #bbb;padding:10px;border-radius:5px}.label{font-size:11px;color:#444;text-transform:uppercase;letter-spacing:.04em}.value{font-size:18px;font-weight:bold;margin-top:4px}
      table{display:table!important;visibility:visible!important;width:100%;border-collapse:collapse;margin-top:8px}thead{display:table-header-group!important;visibility:visible!important}tbody{display:table-row-group!important;visibility:visible!important}tr{display:table-row!important;visibility:visible!important}th,td{display:table-cell!important;visibility:visible!important;text-align:left;border-bottom:1px solid #ccc;padding:8px 6px;vertical-align:top}th{background:#f1f1f1}
      .right{text-align:right}.note{font-size:11px;color:#555;margin-top:22px}.warning{font-size:12px;color:#8a2f31;background:#f9e8e7;padding:9px 10px;border-radius:5px;margin:12px 0}
      @media print{body{margin:12mm}.stat{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body>
      <h1>${escapeHtml(d.name || 'Untitled recipe')}</h1>
      <div class="sub">Batch yield: ${escapeHtml(portions)} portions</div>
      <div class="stats">
        <div class="stat"><div class="label">Batch cost</div><div class="value">${moneyPrint(total)}</div></div>
        <div class="stat"><div class="label">Cost per portion</div><div class="value">${moneyPrint(portionCost)}</div></div>
        <div class="stat"><div class="label">Target selling price (${escapeHtml(target)}% GP)</div><div class="value">${moneyPrint(targetPrice)}</div></div>
      </div>
      <h2>Ingredients</h2>
      <table><thead><tr><th>Ingredient</th><th>Qty used</th><th>Pack size</th><th>Pack price</th><th>Ingredient cost</th></tr></thead><tbody>${ingredientRows || '<tr><td colspan="5">No ingredients added</td></tr>'}</tbody></table>
      ${printWarnings.length?`<div class="warning">${escapeHtml(printWarnings.join(' '))}</div>`:''}
      <h2>Costing summary</h2>
      <table><tbody>
        <tr><th>Batch cost</th><td class="right">${moneyPrint(total)}</td></tr>
        <tr><th>Cost per portion</th><td class="right">${moneyPrint(portionCost)}</td></tr>
        <tr><th>Selling price per portion</th><td class="right">${sellPrice > 0 ? moneyPrint(sellPrice) : 'Not set'}</td></tr>
        <tr><th>Gross profit per portion</th><td class="right">${sellPrice > 0 ? moneyPrint(gpValue) : 'Not set'}</td></tr>
        <tr><th>Gross profit %</th><td class="right">${gpPercent === null ? 'Not set' : gpPercent.toFixed(1) + '%'}</td></tr>
        <tr><th>Food cost %</th><td class="right">${foodPercent === null ? 'Not set' : foodPercent.toFixed(1) + '%'}</td></tr>
      </tbody></table>
      <div class="note">Created with MenuMargin.</div>
    </body></html>`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Safari blocked the print window. Allow pop-ups for this site and click Print / PDF again.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    // Wait for the standalone recipe page to render before opening print preview (especially Safari/iOS).
    setTimeout(() => { try { printWindow.focus(); printWindow.print(); } catch (error) { console.error('Print preview could not open:', error); } }, 700);
  } catch(error) {
    alert('Could not prepare this recipe for printing. Please refresh MenuMargin and try again.');
    console.error(error);
  }
});
// v0.7.1: export monetary CSV fields rounded to 2 decimal places.
$('exportCsv').addEventListener('click',()=>{
 const d=recipeData();
 const exportLines=d.ingredients.filter(mmIngredientTouched).map(r=>({r,...mmIngredientCost(r)}));
 const total=exportLines.reduce((sum,line)=>sum+line.cost,0);
 const mismatchCount=exportLines.filter(line=>line.incompatible).length,incompleteCount=exportLines.filter(line=>!line.complete).length;
 const portions=Math.max(1,Number(d.yield)||1);
 const costPerPortion=total/portions;
 const sellingPrice=Math.max(0,Number(d.sellingPrice)||0);
 const profitPerPortion=sellingPrice-costPerPortion;
 const batchRevenue=sellingPrice*portions;
 const batchProfit=batchRevenue-total;
 const actualGp=sellingPrice>0?(profitPerPortion/sellingPrice)*100:'';
 const lines=[
  ['Recipe',d.name],
  ['Portions',portions],
  [],
  ['Ingredient','Quantity used','Pack size','Pack price (£)','Cost used (£)'],
  ...exportLines.map(line=>{const r=line.r;return [r.name,`${r.qty} ${r.qtyUnit||'g'}`,`${r.pack} ${r.packUnit||'g'}`,(Number(r.price)||0).toFixed(2),line.incompatible?'CHECK UNITS':line.complete?line.cost.toFixed(2):'INCOMPLETE']}),
  ...(mismatchCount?[[],['Warning',`${mismatchCount} ingredient line(s) use incompatible units and were excluded from totals.`]]:[]),
  ...(incompleteCount?[[],['Warning',`${incompleteCount} incomplete ingredient line(s) were excluded from totals.`]]:[]),
  [],
  ['Batch revenue (£)',sellingPrice>0?batchRevenue.toFixed(2):''],
  ['Total batch cost (£)',total.toFixed(2)],
  ['Batch profit (£)',sellingPrice>0?batchProfit.toFixed(2):''],
  ['Cost per portion (£)',costPerPortion.toFixed(2)],
  ['Selling price per portion (£)',sellingPrice>0?sellingPrice.toFixed(2):''],
  ['Profit per portion (£)',sellingPrice>0?profitPerPortion.toFixed(2):''],
  ['Actual GP (%)',actualGp===''?'':Number(actualGp).toFixed(1)],
  ['Target GP (%)',d.targetGp]
 ];
 const csv=lines.map(row=>row.map(escapeCsv).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(d.name||'menumargin-recipe').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
// v0.5 Price Book. Entries are independent of saved recipe ingredient snapshots.
