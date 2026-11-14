// Optional, read-only guidance. Existing controls own all recipe and price writes.
(() => {
 'use strict';
 const byId=id=>document.getElementById(id);
 const panel=byId('firstUseGuide'),details=byId('firstUseDetails'),show=byId('firstUseShow');
 if(!panel||!details||!show||typeof readLibrary!=='function'||typeof readPriceBook!=='function'||typeof mmIngredientRowData!=='function'||typeof mmIngredientCost!=='function')return;
 const copy=[
  ['Add ingredient prices','Use supplier prices or enter your own pack prices as you cost the recipe.','Add supplier prices'],
  ['Build your recipe','Scan a recipe or enter it yourself. Check the portions, quantities, units and pack prices.','Go to your recipe'],
  ['Enter your selling price','Use the actual selling price per portion, excluding VAT, to see your gross profit.','Enter selling price'],
  ['Save your recipe','Review your costing, then choose Save recipe to add this dish to your library.','Save recipe']
 ];
 let account=null,savedIds=new Set(),hasBookPrices=false,cacheDirty=true,visibleForVisit=false,finishedId=null,scheduled=false,current=null;
 const text=(id,value)=>{const node=byId(id);if(node&&node.textContent!==value)node.textContent=value;};
 const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
 const validPack=(name,pack,price,unit,entered=true)=>Boolean(String(name||'').trim()&&entered&&numeric(pack)&&Number(pack)>0&&numeric(price)&&Number(price)>=0&&['g','kg','ml','l','each'].includes(unit));
 const syncChrome=()=>document.body.toggleAttribute('data-first-use-open',!panel.hidden&&details.open);
 const visible=value=>{panel.hidden=!value;syncChrome();};
 function signedAccount(){return typeof mmUser!=='undefined'&&mmUser?.id&&document.body.classList.contains('mm-authenticated')?mmUser.id:null;}
 function readyAccount(){return !(typeof mmHydrating!=='undefined'&&mmHydrating)?signedAccount():null;}
 function refresh(){
  const id=signedAccount();show.hidden=!readyAccount();
  if(!id){visible(false);account=null;savedIds.clear();hasBookPrices=false;cacheDirty=true;current=null;finishedId=null;visibleForVisit=false;return null;}
  if(!readyAccount()){visible(false);cacheDirty=true;return null;}
  const changed=id!==account;
  if(changed){account=id;savedIds.clear();hasBookPrices=false;cacheDirty=true;finishedId=null;current=null;}
  if(cacheDirty){
   savedIds=new Set(readLibrary().map(item=>item.id));
   hasBookPrices=readPriceBook().some(item=>['g','ml','each'].includes(item.baseUnit)&&validPack(item.name,item.packBase,item.price,item.baseUnit));
   cacheDirty=false;
  }
  if(changed){visibleForVisit=savedIds.size===0;details.open=visibleForVisit;panel.querySelector('.first-use-all').open=false;text('firstUseTitle',visibleForVisit?'Your first costed recipe':'Recipe guide');}
  // Regular chefs who have not requested help do not need an extra editor scan.
  if(!visibleForVisit){visible(false);current={id};return current;}
  // Do not call rows() or recipeData(): those also render supplier bindings.
  const lines=[...byId('ingredients').querySelectorAll('tr')].map(mmIngredientRowData).filter(mmIngredientTouched);
  const priced=hasBookPrices||lines.some(row=>validPack(row.name,row.pack,row.price,row.packUnit,row.priceEntered));
  const portions=byId('yield').value;
  const costed=lines.length>0&&numeric(portions)&&Number(portions)>0&&Number.isInteger(Number(portions))&&lines.every(row=>{const result=mmIngredientCost(row);return result.complete&&!result.invalid&&!result.incompatible;});
  const selling=byId('sellingPrice').value,sale=numeric(selling)&&Number(selling)>0;
  const recipeId=typeof currentRecipeId!=='undefined'?currentRecipeId:null;
  const saved=Boolean(priced&&costed&&sale&&recipeId&&savedIds.has(recipeId)&&typeof hasUnsavedChanges!=='undefined'&&!hasUnsavedChanges);
  const done=[priced,costed,sale,saved],count=done.filter(Boolean).length,next=done.findIndex(value=>!value);
  if(finishedId&&(finishedId!==recipeId||hasUnsavedChanges||document.body.dataset.activeView!=='costing'))visibleForVisit=false;
  if(saved&&visibleForVisit&&!finishedId){finishedId=recipeId;details.open=false;}
  current={id,done,count,next,recipeId,saved};
  visible(visibleForVisit);panel.classList.toggle('is-complete',saved);panel.dataset.completed=String(count);
  text('firstUseProgress',count+' of 4 done');
  const content=next<0?['Recipe saved','Find this recipe in Recipes whenever you need it.','Open your recipes']:copy[next];
  text('firstUseNext',content[0]);text('firstUseHint',content[1]);text('firstUseNextAction',content[2]);
  byId('firstUseManual').hidden=next!==0;
  for(const item of panel.querySelectorAll('[data-guide-step]')){
   const index=Number(item.dataset.guideStep);item.classList.toggle('is-complete',done[index]);
   if(index===next)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
   const state=item.querySelector('.first-use-step-state'),label=item.querySelector('.first-use-step-label');
   if(state.textContent!==(done[index]?'✓':String(index+1)))state.textContent=done[index]?'✓':String(index+1);
   const status=done[index]?'Done':'To do';if(label.textContent!==status)label.textContent=status;
  }
  return current;
 }
 function schedule(dirty=false){
  if(dirty)cacheDirty=true;
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;refresh();});
 }
 function focus(node){if(!node)return;node.focus({preventScroll:true});node.scrollIntoView({block:'center',behavior:'auto'});}
 function recipeFocus(prices=false){
  byId('tab-costing').click();
  const row=[...byId('ingredients').querySelectorAll('tr')].find(tr=>{const data=mmIngredientRowData(tr),value=mmIngredientCost(data);return !data.name||!value.complete||value.invalid||value.incompatible;})||byId('ingredients').querySelector('tr');
  let target=!prices&&!byId('recipeName').value.trim()?byId('recipeName'):!row?byId('addIngredient'):!row.querySelector('.ingredient').value.trim()?row.querySelector('.ingredient'):prices?row.querySelector('.price'):row.querySelector('[aria-invalid="true"]')||row.querySelector('.qty');
  if(row&&target.matches('.price,.pack,.pack-unit')&&row.querySelector('.ingredient-price-disclosure')?.getAttribute('aria-expanded')==='false')row.querySelector('.ingredient-price-disclosure').click();
  focus(target);
 }
 function go(index,state){
  details.open=false;syncChrome();
  if(index===0){byId('tab-pricebook').click();byId('pricebookEditor').open=true;focus(byId('pbName'));}
  else if(index===1)recipeFocus();
  else if(index===2){byId('tab-costing').click();focus(byId('sellingPrice'));}
  else if(index===3){
   // A stale or early step click must never trigger a save of incomplete work.
   if(!state.done.slice(0,3).every(Boolean)){go(state.next,state);return;}
   byId('tab-costing').click();byId('saveRecipe').click();
  }else byId('tab-recipes').click();
 }
 panel.addEventListener('click',event=>{
  const button=event.target.closest('[data-guide-action]');if(!button)return;
  const state=refresh();if(!state?.done)return;
  const action=button.dataset.guideAction;
  if(action==='hide'){visibleForVisit=false;visible(false);document.querySelector('.nav-tab[aria-selected="true"]')?.focus({preventScroll:true});return;}
  if(action==='manual'){details.open=false;syncChrome();recipeFocus(true);return;}
  go(action==='next'?state.next:Number(action.slice(5)),state);
 });
 show.addEventListener('click',()=>{
  if(!refresh())return;visibleForVisit=true;finishedId=null;text('firstUseTitle','Recipe guide');
  byId('tab-costing').click();refresh();details.open=true;syncChrome();focus(details.querySelector('summary'));
 });
 details.addEventListener('toggle',syncChrome);
 // Observe only existing app output, never the guide's own DOM. Cache reads are
 // coalesced and only repeat when account/library/price-book output changes.
 for(const id of ['recipeCards','pricebookList'])if(byId(id))new MutationObserver(()=>schedule(true)).observe(byId(id),{childList:true,subtree:true,characterData:true});
 for(const id of ['ingredients','recipeStateCaption','mmCloudStatus'])if(byId(id))new MutationObserver(()=>schedule()).observe(byId(id),{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>schedule()).observe(document.body,{attributes:true,attributeFilter:['class','data-active-view']});
 for(const id of ['ingredients','recipeName','yield','sellingPrice'])byId(id)?.addEventListener('input',()=>schedule());
 byId('ingredients')?.addEventListener('change',()=>schedule());
 window.addEventListener('storage',event=>{
  const id=readyAccount();if(!id||typeof mmAccountCacheKey!=='function')return;
  if(event.key===mmAccountCacheKey(MM_LIBRARY_KEY,id)||event.key===mmAccountCacheKey(MM_PRICEBOOK_KEY,id))schedule(true);
 });
 refresh();
})();
