// Optional saved-library guidance. Never writes data or reads the unsaved editor.
(() => {
 'use strict';
 const byId=id=>document.getElementById(id),panel=byId('needsAttentionPanel'),details=byId('needsAttentionDetails'),list=byId('needsAttentionList'),filter=byId('needsAttentionFilter'),show=byId('needsAttentionShow');
 if(!panel||!show||typeof mmRecipeAttentionReport!=='function'||typeof mmReadUserCache!=='function')return;
 const labels={all:'All checks',prices:'Prices & suppliers',units:'Quantities & units',vat:'VAT checks',details:'Recipe details',gp:'Below target GP'};
 let account=null,dirty=true,scheduled=false,items=[],limit=20,revision=0,rendered=-1;
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 const text=(id,value)=>{const n=byId(id);if(n.textContent!==value)n.textContent=value;};
 function signed(){return typeof mmUser!=='undefined'&&mmUser?.id&&document.body.classList.contains('mm-authenticated')?mmUser.id:null;}
 function clear(){panel.hidden=true;show.hidden=true;items=[];list.replaceChildren();details.open=false;filter.value='all';limit=20;rendered=-1;account=null;dirty=true;}
 function focus(element){if(!element)return;element.focus({preventScroll:true});element.scrollIntoView({block:'center'});}
 function review(item,issue){
  if(account!==signed())return;
  if(issue.priceBookId&&readPriceBook().some(price=>price.id===issue.priceBookId)){
   byId('tab-pricebook').click();byId('pricebookEditor').open=true;editPriceEntry(issue.priceBookId);focus(byId(issue.field));return;
  }
  openRecipeById(item.id);
  // A cancelled unsaved-change prompt must not move or reset the current draft.
  if(currentRecipeId!==item.id||hasUnsavedChanges||document.body.dataset.activeView!=='costing')return;
  // Ingredient cards are enhanced by the existing observer after loadRecipe.
  requestAnimationFrame(()=>{
   if(account!==signed()||currentRecipeId!==item.id||hasUnsavedChanges||document.body.dataset.activeView!=='costing')return;
   if(issue.rowIndex===null){focus(byId(issue.field));return;}
   const row=byId('ingredients').querySelectorAll('tr')[issue.rowIndex];if(!row)return;
   const disclosure=row.querySelector('.ingredient-price-disclosure');
   if(disclosure?.getAttribute('aria-expanded')==='false'&&['.pack','.price','.price-link-choice','.price-link-toggle','.ingredient-vat-basis'].includes(issue.field))disclosure.click();
   let target=row.querySelector(issue.field.startsWith('.')?issue.field:'.price');
   if(!target||target.hidden||target.disabled||!target.getClientRects().length)target=row.querySelector('.ingredient');focus(target);
  });
 }
 function render(){
  if(!details.open||rendered===revision)return;rendered=revision;list.replaceChildren();
  const selected=items.filter(item=>filter.value==='all'||item.categories.includes(filter.value));byId('needsAttentionMore').hidden=selected.length<=limit;
  if(!selected.length){list.append(node('p','attention-note','No recipes need this check.'));return;}
  for(const item of selected.slice(0,limit)){
   const card=node('article','attention-card');card.dataset.recipeId=item.id;
   const badges=node('div','attention-badges');for(const category of item.categories)badges.append(node('span','attention-badge',labels[category]));card.append(badges,node('h3','',item.name));
   const relevant=filter.value==='all'?item.issues:item.issues.filter(issue=>issue.category===filter.value),first=relevant[0];
   card.append(node('p','attention-primary',first.message));
   if(item.gp!==null)card.append(node('p','attention-note','Current GP '+item.gp.toFixed(1)+'% at the saved selling price, excluding VAT.'));
   else card.append(node('p','attention-note','Finish the costing, supplier, VAT and selling-price checks before relying on GP.'));
   if(relevant.length>1){
    const all=node('details','attention-checks');all.append(node('summary','','See all '+relevant.length+' checks'));const checks=node('ul');
    for(const issue of relevant){const li=node('li');li.append(node('span','',issue.message));const button=node('button','text-button','Go to this check');button.type='button';button.addEventListener('click',()=>review(item,issue));li.append(button);checks.append(li);}all.append(checks);card.append(all);
   }
   const button=node('button','secondary attention-review',first.priceBookId?'Check supplier price':'Review recipe');button.type='button';button.addEventListener('click',()=>review(item,first));card.append(button);list.append(card);
  }
 }
 function refresh(){
  const id=signed();if(!id||typeof mmHydrating!=='undefined'&&mmHydrating){clear();return;}
  if(id!==account){clear();account=id;}show.hidden=false;
  if(!['recipes','menu'].includes(document.body.dataset.activeView))return;
  if(dirty){
   try{
    const recipes=mmReadUserCache(MM_LIBRARY_KEY,id),prices=mmReadUserCache(MM_PRICEBOOK_KEY,id);if(!Array.isArray(recipes)||!Array.isArray(prices))throw Error();
    items=mmRecipeAttentionReport(recipes,prices);dirty=false;revision++;panel.hidden=recipes.length===0;details.hidden=items.length===0;
    text('needsAttentionStatus',items.length?items.length+' recipe'+(items.length===1?' needs':'s need')+' attention · '+items.reduce((count,item)=>count+item.issues.length,0)+' checks':'No outstanding checks found in your saved recipes.');
    for(const option of filter.options)option.textContent=labels[option.value]+' ('+(option.value==='all'?items.length:items.filter(item=>item.categories.includes(option.value)).length)+')';
   }catch{items=[];list.replaceChildren();revision++;panel.hidden=false;details.hidden=true;text('needsAttentionStatus','Saved recipes or prices could not be read. Keep your device data and try Refresh & sync.');}
  }
  text('needsAttentionBasis',typeof mmCloudOffline!=='undefined'&&mmCloudOffline?'Offline: using this device’s saved recipes and supplier prices. Refresh online for newer data. Unsaved edits are not included.':'Your saved recipes, checked against your own current price book. Unsaved edits are not included.');render();
 }
 function schedule(changed=false){if(changed)dirty=true;if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}
 show.addEventListener('click',()=>{if(!signed())return;byId('tab-recipes').click();refresh();if(!panel.hidden){if(!details.hidden){details.open=true;render();}panel.scrollIntoView({block:'start'});panel.focus({preventScroll:true});}else focus(byId('recipeEmptyStart'));});
 details.addEventListener('toggle',render);filter.addEventListener('change',()=>{limit=20;revision++;render();});byId('needsAttentionMore').addEventListener('click',()=>{limit+=20;revision++;render();});
 for(const id of ['recipeCards','pricebookList','mmCloudStatus'])if(byId(id))new MutationObserver(()=>schedule(true)).observe(byId(id),{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>schedule()).observe(document.body,{attributes:true,attributeFilter:['class','data-active-view']});
 window.addEventListener('storage',event=>{const id=signed();if(!id||typeof mmAccountCacheKey!=='function')return;if(event.key===mmAccountCacheKey(MM_LIBRARY_KEY,id)||event.key===mmAccountCacheKey(MM_PRICEBOOK_KEY,id))schedule(true);});refresh();
})();
