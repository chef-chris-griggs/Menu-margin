// Presentation only: the existing recipe, price, scan and account handlers own data.
(() => {
 const byId=id=>document.getElementById(id);
 const install=byId('mmInstallApp'),menuInstall=byId('mmMenuInstall');
 if(install&&menuInstall){const syncInstall=()=>{menuInstall.hidden=install.hidden;};syncInstall();new MutationObserver(syncInstall).observe(install,{attributes:true,attributeFilter:['hidden']});menuInstall.addEventListener('click',()=>install.click());}
 const symbol=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#'+name);svg.setAttribute('aria-hidden','true');svg.append(use);return svg;};
 function updateContentState(){document.body.classList.toggle('has-recipe-ingredients',[...document.querySelectorAll('#ingredients .ingredient')].some(input=>input.value.trim()));}
 function updateCard(row){
  const price=row.querySelector('.price'),pack=row.querySelector('.pack'),unit=row.querySelector('.pack-unit'),summary=row.querySelector('.ingredient-pack-summary');
  if(!summary)return;
  const entered=price.value.trim()!==''&&pack.value.trim()!==''&&Number(pack.value)>0;
  summary.textContent=entered?Number(price.value).toLocaleString('en-GB',{style:'currency',currency:'GBP'})+' / '+pack.value+' '+(unit.value==='l'?'litre':unit.value):'Add your pack price';
  row.dataset.priceMissing=entered?'false':'true';
  // New/unpriced ingredients stay expanded until the chef chooses to close them.
  if(!entered&&row.dataset.priceTouched!=='true')setPriceOpen(row,true);
 }
 function setPriceOpen(row,open){row.dataset.priceOpen=String(open);const button=row.querySelector('.ingredient-price-disclosure');if(button)button.setAttribute('aria-expanded',String(open));}
 function enhanceCard(row){
  if(row.querySelector('.ingredient-card-action'))return;
  const id='ingredient-pricing-'+row.dataset.id,ids=[];
  for(const [i,cell] of [...row.children].entries())if([3,4,5].includes(i)){cell.id=id+'-'+i;ids.push(cell.id);}
  const link=row.querySelector('.ingredient-price-link');if(link){link.id=id+'-supplier';ids.push(link.id);}
  const cell=document.createElement('td');cell.className='ingredient-card-action';
  const button=document.createElement('button');button.type='button';button.className='ingredient-price-disclosure';button.setAttribute('aria-controls',ids.join(' '));
  const label=document.createElement('span');label.textContent='Pack & price';const summary=document.createElement('span');summary.className='ingredient-pack-summary';
  button.append(label,summary,symbol('icon-chevron'));button.addEventListener('click',()=>{row.dataset.priceTouched='true';setPriceOpen(row,row.dataset.priceOpen!=='true');});
  cell.append(button);row.append(cell);
  setPriceOpen(row,!row.querySelector('.ingredient').value.trim()||!row.querySelector('.price').value.trim()||Number(row.querySelector('.pack').value)<=0);
  row.querySelector('.price-link-toggle')?.addEventListener('click',()=>setPriceOpen(row,true));
  row.addEventListener('input',()=>updateCard(row));row.addEventListener('change',()=>updateCard(row));updateCard(row);
 }
 const ingredients=byId('ingredients');
 if(ingredients){
  ingredients.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||!event.target.matches('input'))return;
   const row=event.target.closest('tr'),fields=[...row.querySelectorAll('input')].filter(input=>!input.readOnly&&!input.disabled),next=fields[fields.indexOf(event.target)+1];
   if(next&&!next.getClientRects().length)setPriceOpen(row,true);
  },true);
  [...ingredients.children].forEach(enhanceCard);updateContentState();
  new MutationObserver(records=>{
   updateContentState();for(const record of records){
    if(record.target===ingredients)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('tr'))enhanceCard(node);
    if(record.target.nodeType===1&&record.target.matches('.cost-cell'))updateCard(record.target.closest('tr'));
   }
  }).observe(ingredients,{childList:true,subtree:true});
 }
 document.querySelectorAll('[data-ios-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.iosAction;
  if(action==='scan-recipe'){setActiveView('costing');const panel=byId('recipeScanPanel');panel.open=true;panel.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});byId('recipeScanFile').click();}
  if(action==='scan-invoice'){setActiveView('invoices');byId('invoiceFile').click();}
  if(action==='new-recipe'){byId('newRecipe').click();byId('recipeName').focus();}
  if(action==='account')byId('tab-menu').click();
 }));
 const file=byId('recipeScanFile'),fileName=byId('recipeScanFileName');
 const review=byId('recipeScanReview');
 if(review)new MutationObserver(()=>{if(review.hidden&&!file.value&&document.body.classList.contains('has-recipe-ingredients'))byId('recipeScanPanel').open=false;}).observe(review,{attributes:true,attributeFilter:['hidden']});
 file?.addEventListener('change',()=>{if(fileName)fileName.textContent=file.files?.[0]?.name||'Photo or PDF';});
 document.addEventListener('focusin',event=>{if(event.target.matches('input,textarea,select'))document.body.classList.add('is-editing-field');});
 document.addEventListener('focusout',()=>{requestAnimationFrame(()=>{if(!document.activeElement?.matches('input,textarea,select')||!document.activeElement.getClientRects().length)document.body.classList.remove('is-editing-field');});});
 const tools=byId('recipeTools');if(tools){tools.open=false;tools.addEventListener('click',event=>{if(event.target.closest('.ios-tool-menu button'))tools.open=false;});}
 byId('mmMenuPrintFlow')?.addEventListener('click',()=>{if(tools)tools.open=true;byId('printBtn').focus();});
 const priceEditor=byId('pricebookEditor');
 byId('tab-pricebook')?.addEventListener('click',()=>{if(priceEditor&&!byId('pbName').value.trim())priceEditor.open=readPriceBook().length===0;});
 byId('pricebookList')?.addEventListener('click',event=>{const button=event.target.closest('button');if(priceEditor&&button?.textContent==='Edit price')priceEditor.open=true;},true);
 byId('pricebookForm')?.addEventListener('submit',()=>{if(priceEditor&&!byId('pbName').value.trim())priceEditor.open=false;});
 document.body.classList.add('ios-interface-ready');
})();
