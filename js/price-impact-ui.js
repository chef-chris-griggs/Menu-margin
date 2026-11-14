// Optional presentation only. No writes, background requests or new stored state.
(() => {
 'use strict';
 const byId=id=>document.getElementById(id),panel=byId('priceImpactPanel'),details=byId('priceImpactDetails'),list=byId('priceImpactList'),filter=byId('priceImpactFilter'),notice=byId('priceImpactNotice'),show=byId('priceImpactShow');
 if(!panel||!show||typeof mmPriceImpactReport!=='function'||typeof mmReadUserCache!=='function')return;
 let account=null,dirty=true,scheduled=false,items=[],limit=20,revision=0,rendered=-1;
 const node=(tag,className,value)=>{const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=value;return n;};
 const text=(id,value)=>{const n=byId(id);if(n.textContent!==value)n.textContent=value;};
 const changeMoney=value=>value>0&&value<.005?'< £0.01':money(value);
 const pack=value=>Number(value.pack).toLocaleString('en-GB',{maximumFractionDigits:6})+' '+value.unit;
 function clear(){panel.hidden=true;notice.hidden=true;show.hidden=true;items=[];list.replaceChildren();details.open=false;filter.value='all';limit=20;rendered=-1;account=null;dirty=true;}
 function render(){
  if(!details.open||rendered===revision)return;rendered=revision;list.replaceChildren();
  const selected=items.filter(item=>filter.value==='all'||item.status===filter.value);
  byId('priceImpactMore').hidden=selected.length<=limit;
  if(!selected.length){list.append(node('p','price-impact-empty','No recipes in this view.'));return;}
  for(const item of selected.slice(0,limit)){
   const card=node('article','price-impact-card');card.dataset.recipeId=item.id;card.dataset.state=item.status;
   const header=node('div','price-impact-card-header'),badge=node('span','price-impact-badge',item.status==='review'?'Check prices':item.status==='increase'?'Costs more':'Costs less');
   header.append(badge,node('h3','',item.name));card.append(header);
   if(item.status==='review'){
    const reasons=node('ul','price-impact-issues');for(const issue of item.issues)reasons.append(node('li','',issue));card.append(reasons);
    card.append(node('p','price-impact-note','A reliable profit change is unavailable until these prices are checked.'));
   }else{
    const metrics=node('dl','price-impact-metrics');
    for(const [label,value] of [['Cost per portion',money(item.beforeCost/item.portions)+' → '+money(item.afterCost/item.portions)],['Gross profit',item.afterGp===null?'Selling price needed':item.beforeGp.toFixed(1)+'% → '+item.afterGp.toFixed(1)+'%']]){const cell=node('div');cell.append(node('dt','',label),node('dd','',value));metrics.append(cell);}card.append(metrics);
    const amount=Math.abs(item.portionDelta),direction=item.delta>0?'more':'less';
    card.append(node('p','price-impact-change',changeMoney(amount)+' '+direction+' per portion · '+changeMoney(Math.abs(item.delta))+' '+direction+' per batch'));
    card.append(node('p','price-impact-note','Batch cost: '+money(item.beforeCost)+' → '+money(item.afterCost)+' · '+item.portions+' portions'));
    if(item.afterGp!==null)card.append(node('p','price-impact-note','Selling price '+money(item.sellingPrice)+' per portion, excluding VAT. GP '+Math.abs(item.afterGp-item.beforeGp).toFixed(1)+' percentage points '+(item.afterGp<item.beforeGp?'lower':'higher')+'.'));
    else card.append(node('p','price-impact-note','Enter the actual selling price in this recipe to compare GP.'));
    if(item.belowTarget)card.append(node('p','price-impact-target',(item.crossedTarget?'Now below':'Below')+' your '+item.targetGp+'% GP target.'));
   }
   if(item.changes.length){
    const breakdown=node('details','price-impact-breakdown');breakdown.append(node('summary','','Changed ingredient prices'));
    const rows=node('ul');for(const change of item.changes){const row=node('li');row.append(node('strong','',change.name),node('span','',change.supplier),node('span','','Saved '+money(change.before.price)+' / '+pack(change.before)+' → Current '+money(change.after.price)+' / '+pack(change.after)));rows.append(row);}breakdown.append(rows);card.append(breakdown);
   }
   const open=node('button','secondary','Review recipe');open.type='button';open.addEventListener('click',()=>{if(account===signedAccount())openRecipeById(item.id);});card.append(open);list.append(card);
  }
 }
 function signedAccount(){return typeof mmUser!=='undefined'&&mmUser?.id&&document.body.classList.contains('mm-authenticated')?mmUser.id:null;}
 function refresh(){
  const id=signedAccount();
  if(!id||typeof mmHydrating!=='undefined'&&mmHydrating){clear();return;}
  if(id!==account){clear();account=id;}
  show.hidden=false;
  if(!['recipes','pricebook','menu'].includes(document.body.dataset.activeView))return;
  if(dirty){
   try{
    const recipes=mmReadUserCache(MM_LIBRARY_KEY,id),prices=mmReadUserCache(MM_PRICEBOOK_KEY,id);
    if(!Array.isArray(recipes)||!Array.isArray(prices))throw Error('Unreadable saved records');
    items=mmPriceImpactReport(recipes,prices);dirty=false;revision++;panel.hidden=recipes.length===0;
    const increases=items.filter(item=>item.status==='increase').length,checks=items.filter(item=>item.status==='review').length,decreases=items.filter(item=>item.status==='decrease').length;
    const summary=items.length?[increases?increases+' recipe'+(increases===1?' costs':'s cost')+' more':'',checks?checks+' need'+(checks===1?'s':'')+' a price check':'',decreases?decreases+' cost'+(decreases===1?'s':'')+' less':''].filter(Boolean).join(' · '):'No cost changes found against saved recipe prices.';
    text('priceImpactStatus',summary);text('priceImpactNoticeText',summary);notice.hidden=!items.length;details.hidden=!items.length;
    for(const option of filter.options){const type=option.value;option.textContent=({all:'All changes',increase:'Cost increases',review:'Price checks',decrease:'Cost decreases'})[type]+' ('+(type==='all'?items.length:items.filter(item=>item.status===type).length)+')';}
   }catch{
    items=[];list.replaceChildren();revision++;panel.hidden=false;details.hidden=true;notice.hidden=true;text('priceImpactStatus','Saved prices could not be read. Keep your device data and try Refresh & sync.');
   }
  }
  const offline=typeof mmCloudOffline!=='undefined'&&mmCloudOffline;
  text('priceImpactBasis',offline?'Offline: comparing this device’s saved recipes and supplier prices. Refresh online for newer prices.':'Compared with pack prices stored in each saved recipe, using your own price book.');
  render();
 }
 function schedule(changed=false){if(changed)dirty=true;if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}
 function reveal(){if(!signedAccount())return;byId('tab-recipes').click();refresh();if(!panel.hidden&&!details.hidden){details.open=true;render();}panel.scrollIntoView({block:'start'});panel.focus({preventScroll:true});}
 show.addEventListener('click',reveal);byId('priceImpactNoticeOpen').addEventListener('click',reveal);
 details.addEventListener('toggle',render);
 filter.addEventListener('change',()=>{limit=20;revision++;render();});
 byId('priceImpactMore').addEventListener('click',()=>{limit+=20;revision++;render();});
 for(const id of ['recipeCards','pricebookList','mmCloudStatus'])if(byId(id))new MutationObserver(()=>schedule(true)).observe(byId(id),{childList:true,subtree:true,characterData:true});
 new MutationObserver(()=>schedule()).observe(document.body,{attributes:true,attributeFilter:['class','data-active-view']});
 window.addEventListener('storage',event=>{const id=signedAccount();if(!id||typeof mmAccountCacheKey!=='function')return;if(event.key===mmAccountCacheKey(MM_LIBRARY_KEY,id)||event.key===mmAccountCacheKey(MM_PRICEBOOK_KEY,id))schedule(true);});
 refresh();
})();
