let editingPriceId=null;
function readPriceBook(){if(!mmUser)return [];try{const x=mmReadUserCache(MM_PRICEBOOK_KEY,mmUser.id);return Array.isArray(x)?x.filter(i=>i&&i.id):[]}catch(e){return []}}
function writePriceBook(items){if(typeof mmPreserveRecipePriceLinks==='function')mmPreserveRecipePriceLinks();mmWriteUserCache(MM_PRICEBOOK_KEY,items,mmUser?.id);if(typeof mmRefreshRecipePrices==='function')mmRefreshRecipePrices()}
function unitBaseSize(size,unit){const factors={kg:1000,g:1,l:1000,ml:1,each:1};return Number(size)*factors[unit||'g']}
function baseUnit(unit){return unit==='kg'||unit==='g'?'g':unit==='l'||unit==='ml'?'ml':'each'}
function pbMoney(n){return money(Number(n)||0)}
function clearPriceForm(){editingPriceId=null;$('pricebookForm').reset();$('pbCaseQty').value='1';$('pbUnit').value='g';$('pbSave').textContent='＋ Save ingredient price'}
function pbToast(message){$('pbToast').textContent=message}
function renderPriceBook(){
 const list=$('pricebookList'),query=$('pbSearch').value.trim().toLowerCase(),items=readPriceBook().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const filtered=items.filter(i=>`${i.name||''} ${i.supplier||''} ${i.code||''}`.toLowerCase().includes(query));list.innerHTML='';
 if(!filtered.length){const empty=document.createElement('div');empty.className='pricebook-empty';empty.textContent=items.length?'No ingredients match that search.':'Your price book is empty. Save your first ingredient above.';list.appendChild(empty);return}
 filtered.forEach(item=>{
  const card=document.createElement('div');card.className='pricebook-item';
  const info=document.createElement('div');const name=document.createElement('strong');name.textContent=item.name;const meta=document.createElement('div');meta.className='pricebook-meta';const shownSize=item.sourcePackSize??item.packBase,shownUnit=item.sourceUnit||item.baseUnit,rateFactor=(shownUnit==='kg'||shownUnit==='g'||shownUnit==='l'||shownUnit==='ml')?1000:1,rateUnit=(shownUnit==='kg'||shownUnit==='g')?'kg':(shownUnit==='l'||shownUnit==='ml')?'litre':'each',rate=(Number(item.price)||0)/(Number(item.packBase)||1)*rateFactor,caseCount=Number(item.caseCount)||1,eachSize=Number(item.unitPackSize)||shownSize,eachUnit=item.unitPackUnit||shownUnit,packLabel=caseCount>1?`${caseCount} × ${eachSize} ${eachUnit} (${shownSize} ${shownUnit} total)`:`${shownSize} ${shownUnit} pack`,perItem=caseCount>1?` · ${pbMoney((Number(item.price)||0)/caseCount)} per item`:'';meta.textContent=`${item.supplier}${item.code?' · Code '+item.code:''} · ${packLabel} · ${pbMoney(item.price)} total case price${perItem} · ${pbMoney(rate)} per ${rateUnit}`;info.append(name,meta);
  const basisLabel=item.priceBasis==='ex_vat'?'excluding VAT':item.priceBasis==='inc_vat'?'including VAT':'VAT basis not recorded';
  meta.textContent+=' · '+basisLabel;
  if(Array.isArray(item.priceHistory)&&item.priceHistory.length){
   const history=document.createElement('details');history.className='pricebook-history';
   const summary=document.createElement('summary');summary.textContent='Price history ('+item.priceHistory.length+')';
   const values=document.createElement('ul');
   item.priceHistory.slice().reverse().forEach(previous=>{
    const li=document.createElement('li'),date=new Date(previous.updatedAt||previous.replacedAt||'');
    const dateLabel=Number.isNaN(date.valueOf())?'Previous price':date.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
    const historicalSize=previous.sourcePackSize??previous.packBase,historicalUnit=previous.sourceUnit||previous.baseUnit||'each';
    const taxLabel=previous.priceBasis==='ex_vat'?'ex VAT':previous.priceBasis==='inc_vat'?'inc VAT':'VAT basis unknown';
    li.textContent=dateLabel+' · '+pbMoney(previous.price)+' for '+historicalSize+' '+historicalUnit+' · '+taxLabel;
    values.appendChild(li);
   });
   history.append(summary,values);info.appendChild(history);
  }
  const actions=document.createElement('div');actions.className='pricebook-actions';
  const add=document.createElement('button');add.type='button';add.textContent='Add to recipe';add.addEventListener('click',()=>addPriceToRecipe(item));
  const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Edit price';edit.addEventListener('click',()=>editPriceEntry(item.id));
  const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='×';del.setAttribute('aria-label',`Delete ${item.name}`);del.addEventListener('click',()=>deletePriceEntry(item.id));
  actions.append(add,edit,del);card.append(info,actions);list.appendChild(card);
 });
}
async function exportPriceBookCsv(){
 const items=readPriceBook();
 if(!items.length){pbToast('There are no supplier prices to export yet.');return}
 const lines=[['Ingredient','Supplier','Supplier product code','Items per case','Size per item','Unit','Total case size','Total case price (£)','Price per item (£)','Normalized price unit','Price per kg / litre / each (£)','VAT basis','Updated']];
 items.forEach(item=>{
  const count=Math.max(1,Number(item.caseCount)||1),size=Number(item.unitPackSize)||Number(item.sourcePackSize)||Number(item.packBase)||0;
  const unit=item.unitPackUnit||item.sourceUnit||item.baseUnit||'each',casePrice=Number(item.price)||0;
  const totalSize=Number(item.sourcePackSize)||size*count,normalized=item.baseUnit||baseUnit(unit),perBase=casePrice/(Number(item.packBase)||unitBaseSize(totalSize,unit)||1);
  const rateUnit=normalized==='g'?'kg':normalized==='ml'?'litre':'each',rate=perBase*(normalized==='each'?1:1000);
  lines.push([item.name,item.supplier,item.code||'',count,size,unit,totalSize,casePrice.toFixed(2),(casePrice/count).toFixed(2),rateUnit,rate.toFixed(2),item.priceBasis||'unknown',item.updatedAt||'']);
 });
 const csv=lines.map(row=>row.map(escapeCsv).join(',')).join('\r\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),filename=`menumargin-price-book-${new Date().toISOString().slice(0,10)}.csv`;
 const delivery=await mmDeliverFile(blob,filename,'MenuMargin supplier price book CSV');
 if(delivery!=='cancelled')pbToast(delivery==='shared'?`${items.length} supplier price${items.length===1?'':'s'} ready to save or share.`:`${items.length} supplier price${items.length===1?'':'s'} exported.`);
}
function mmNormalizeProductKey(value){return String(value||'').normalize('NFKC').trim().toLocaleLowerCase('en-GB').replace(/\s+/g,' ')}
function mmPriceHistoryForUpdate(previous,next,source){
 const history=Array.isArray(previous?.priceHistory)?previous.priceHistory.map(record=>({...record})):[];
 if(!previous)return history;
 const changed=['price','packBase','baseUnit','sourcePackSize','sourceUnit','caseCount','unitPackSize','unitPackUnit','priceBasis'].some(key=>{
  const before=previous[key]??null,after=next[key]??null;
  if(typeof before==='number'&&typeof after==='number')return Math.abs(before-after)>.000001;
  return before!==after;
 });
 if(!changed)return history;
 const snapshot={
  price:Number(previous.price),packBase:previous.packBase,baseUnit:previous.baseUnit,
  sourcePackSize:previous.sourcePackSize,sourceUnit:previous.sourceUnit,caseCount:previous.caseCount,
  unitPackSize:previous.unitPackSize,unitPackUnit:previous.unitPackUnit,
  priceBasis:previous.priceBasis||'unknown',updatedAt:previous.updatedAt||null,
  replacedAt:next.updatedAt||new Date().toISOString(),changedBy:source||'manual',
  priceSource:previous.priceSource?{...previous.priceSource}:null
 };
 history.push(snapshot);
 return history;
}
function savePriceEntry(event){
 event.preventDefault();const name=$('pbName').value.trim(),supplier=$('pbSupplier').value.trim(),code=$('pbCode').value.trim(),eachSize=Number($('pbPack').value),caseCount=Math.floor(Number($('pbCaseQty').value)),unit=$('pbUnit').value,price=Number($('pbPrice').value);
 if(!name||!supplier||!Number.isFinite(eachSize)||!(eachSize>0)||!Number.isInteger(caseCount)||!(caseCount>0)||!Number.isFinite(price)||!(price>=0)){pbToast('Enter an ingredient, supplier, valid case quantity, item size and case price.');return}
 const totalSize=eachSize*caseCount;if(!Number.isFinite(totalSize)){pbToast('That case size is too large. Check the quantity and item size.');return}
 const items=readPriceBook();
 let idx=editingPriceId?items.findIndex(i=>i.id===editingPriceId):-1;
 if(idx<0){
  const supplierItems=items.filter(i=>mmNormalizeProductKey(i.supplier)===mmNormalizeProductKey(supplier));
  const sameCode=code?supplierItems.filter(i=>mmNormalizeProductKey(i.code)===mmNormalizeProductKey(code)):[];
  if(sameCode.some(i=>mmExactIngredientName(i.name)!==mmExactIngredientName(name))){pbToast('This supplier code has a different ingredient name. Use Edit price on that item to change it deliberately.');return;}
  const matches=supplierItems.filter(i=>mmExactIngredientName(i.name)===mmExactIngredientName(name)&&(!code||!i.code||mmNormalizeProductKey(i.code)===mmNormalizeProductKey(code)));
  if(matches.length>1){pbToast('More than one supplier item has this exact name. Choose Edit price on the item you want to change.');return;}
  if(matches.length===1)idx=items.findIndex(i=>i.id===matches[0].id);
 }
 const id=idx>=0?items[idx].id:mmNewUuid();
 const previous=idx>=0?items[idx]:null;
 const entry={...(previous||{}),id,name,supplier,code:code||(previous?.code||''),packBase:unitBaseSize(totalSize,unit),baseUnit:baseUnit(unit),price,priceBasis:$('pbPriceBasis').value,sourcePackSize:totalSize,sourceUnit:unit,caseCount,unitPackSize:eachSize,unitPackUnit:unit,updatedAt:new Date().toISOString(),priceSource:{type:'manual'}};
 entry.priceHistory=mmPriceHistoryForUpdate(previous,entry,'manual');
 if(idx>=0)items[idx]=entry;else items.push(entry);
 try{writePriceBook(items);clearPriceForm();renderPriceBook();pbToast(idx>=0?'Supplier price updated. Recipes linked by exact ingredient name use the current price.':'Ingredient saved to your price book. Exact-name recipe matches use this price.');}
 catch(e){pbToast('Could not save the price book. Export important recipes and check browser storage.');}
}
function editPriceEntry(id){const item=readPriceBook().find(i=>i.id===id);if(!item)return;editingPriceId=id;const count=Math.max(1,Number(item.caseCount)||1),unit=item.unitPackUnit||item.sourceUnit||item.baseUnit||'g';let each=Number(item.unitPackSize)||Number(item.sourcePackSize)||Number(item.packBase)||1;if(!item.unitPackSize&&count>1)each=Number(item.sourcePackSize||item.packBase)/count;$('pbName').value=item.name;$('pbSupplier').value=item.supplier;$('pbCode').value=item.code||'';$('pbCaseQty').value=count;$('pbPack').value=each;$('pbUnit').value=unit;$('pbPrice').value=item.price;$('pbPriceBasis').value=item.priceBasis||'unknown';$('pbSave').textContent='Save price changes';$('pbName').focus();$('pricebookForm').scrollIntoView({behavior:'smooth',block:'center'});pbToast('Enter the total case price. Exact-name linked recipes use the current supplier price.');}
function deletePriceEntry(id){const item=readPriceBook().find(i=>i.id===id);if(!item)return;if(!confirm(`Delete ${item.name} from your price book? Existing recipes will not be changed.`))return;try{writePriceBook(readPriceBook().filter(i=>i.id!==id));renderPriceBook();pbToast('Ingredient removed from the price book. Existing recipes are unchanged.')}catch(e){pbToast('Could not delete this price-book item.')}}
function addPriceToRecipe(item){
 // Store the exact supplier-item link so later confirmed prices flow through.
 const rows=[...$('ingredients').querySelectorAll('tr')];
 const empty=rows.find(tr=>!tr.querySelector('.ingredient').value.trim()&&!tr.querySelector('.qty').value&&!tr.querySelector('.pack').value&&!tr.querySelector('.price').value);
 const data={name:item.name,qty:'',qtyUnit:item.baseUnit||'g',pack:item.packBase,packUnit:item.baseUnit||'g',price:item.price,priceBookId:item.id,priceLinkMode:'linked'};
 let row;
 if(empty){
  empty.querySelector('.ingredient').value=data.name;
  empty.querySelector('.qty').value='';
  empty.querySelector('.pack').value=data.pack;
  empty.querySelector('.qty-unit').value=data.qtyUnit;
  empty.querySelector('.pack-unit').value=data.packUnit;
  empty.querySelector('.price').value=data.price;
  empty.dataset.priceBookId=item.id;empty.dataset.priceLinkMode='linked';
  row=empty;
 }else{
  addRow(data);
  row=$('ingredients').lastElementChild;
 }
 hasUnsavedChanges=true;
 calculate();
 setActiveView('costing');
 const qty=row&&row.querySelector('.qty');
 if(qty){
  requestAnimationFrame(()=>{qty.focus({preventScroll:true});qty.scrollIntoView({behavior:'smooth',block:'center'});});
 }
 showToast(`${item.name} added to your recipe using ${item.supplier}'s current pack price. Choose the quantity unit, enter the amount used, then save the recipe.`);
 pbToast(`${item.name} is linked to this supplier item. Confirmed price changes update recipes whose ingredient name matches exactly.`);
}
$('pricebookForm').addEventListener('submit',savePriceEntry);
$('pbSearch').addEventListener('input',renderPriceBook);
$('pbExport').addEventListener('click',exportPriceBookCsv);
$('pbClear').addEventListener('click',()=>{clearPriceForm();pbToast('Price entry form cleared.');});
