import {parseRecipeText,prepareRecipeImport} from './recipe-scan-parser.mjs';
import {suggestRecipePriceMatches,compatibleRecipeProduct,recipeScanCost,recipeScanManualCost} from './recipe-price-suggestions.mjs?v=0.5.0-manual-prices';
const el=id=>document.getElementById(id);
let controller=null,parsed=null,scanLines=null,scanUser=null,revision=0,rowSequence=0,sourceUrl=null,rendering=false,renderPrices=null;
const UNITS=['g','kg','ml','l','each'];
const user=()=>typeof mmUser!=='undefined'?mmUser?.id:null;
const book=()=>user()&&typeof readPriceBook==='function'?readPriceBook():[];
const productSnapshot=p=>JSON.stringify([p.id,p.name,p.supplier||'',p.baseUnit,Number(p.packBase),Number(p.price),p.priceBasis||'unknown']);
function clearSource(){if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;el('recipeScanSource').hidden=true;el('recipeScanSource').removeAttribute('href');}
function resetReview(){revision++;controller?.abort();controller=null;parsed=null;scanLines=null;scanUser=null;el('recipeScanRows').replaceChildren();el('recipeScanReview').hidden=true;el('recipeScanStart').disabled=false;for(const id of ['recipeScanName','recipeScanYield','recipeScanSellingPrice'])el(id).value='';clearSource();}
const money=value=>value.toLocaleString('en-GB',{style:'currency',currency:'GBP'});
function status(message){el('recipeScanStatus').textContent=message;}
function field(type,value,label){const input=document.createElement('input');input.type=type;input.value=value??'';input.setAttribute('aria-label',label);if(type==='number'){input.min='0';input.step='any';input.inputMode='decimal';}return input;}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function selection(tr,prices=book()){
 if(tr.dataset.priceMode==='manual')return null;
 const product=prices.find(p=>String(p.id)===tr.querySelector('.recipe-supplier-match').value);
 return compatibleRecipeProduct(product,tr.querySelector('.scan-unit').value)?product:null;
}
function ownPrice(tr){return {pack:tr.querySelector('.scan-pack').value,packUnit:tr.querySelector('.scan-pack-unit').value,price:tr.querySelector('.scan-pack-price').value,priceBasis:tr.querySelector('.scan-pack-vat').value};}
function totals(){
 if(rendering)return;
 const prices=book();
 let total=0,missing=0,unknownVat=0,includedVat=0;
 for(const tr of el('recipeScanRows').children){
  const product=selection(tr,prices),qty=Number(tr.querySelector('.scan-qty').value),unit=tr.querySelector('.scan-unit').value;
  const manual=tr.dataset.priceMode==='manual'?ownPrice(tr):null;
  const cost=manual?recipeScanManualCost(qty,unit,manual):recipeScanCost(qty,unit,product);
  tr.querySelector('.scan-product-details').textContent=manual?'Own pack price — no supplier link. Enter the price for the whole pack.':product?(product.supplier||'Supplier')+' · '+product.name+' · Pack: '+product.packBase+' '+product.baseUnit+' · '+money(Number(product.price)):'Choose a supplier product, or use Enter pack price. Prices are never guessed.';
  const notice=tr.querySelector('.scan-notice');
  notice.textContent=cost===null?(manual?'Enter a pack size, compatible pack unit and pack price.':'Unpriced — select a supplier product or enter a pack price.'):money(cost)+' · '+(manual?'Own price':'Confirmed supplier price');
  if(cost===null)missing++;else{total+=cost;const basis=manual?.priceBasis??product.priceBasis;if(!['ex_vat','inc_vat'].includes(basis))unknownVat++;if(basis==='inc_vat')includedVat++;}
 }
 const portions=Number(el('recipeScanYield').value),sell=Number(el('recipeScanSellingPrice').value);
 const complete=!missing&&el('recipeScanRows').children.length>0&&Number.isInteger(portions)&&portions>0;
 el('recipeScanTotals').textContent=(complete?'Batch cost: ':'Partial cost: ')+money(total)+(complete?' · Per portion: '+money(total/portions):' · Complete all quantities, units, prices and portions for full costing.')+(complete&&sell>0?' · GP: '+((sell-total/portions)/sell*100).toFixed(1)+'%':' · Enter the actual selling price per portion to calculate GP.')+(unknownVat?' · VAT basis unconfirmed for '+unknownVat+' price(s).':'')+(includedVat?' · Some prices include VAT; no VAT has been deducted.':'');
}
function addRow(item={}){
 const index=++rowSequence,tr=document.createElement('tr');
 const cell=(label,node)=>{const td=document.createElement('td');td.dataset.label=label;if(node)td.append(node);tr.append(td);return td;};
 const name=field('text',item.name,'Ingredient '+index);name.className='scan-name';cell('Ingredient',name);
 const qty=field('number',item.qty,'Quantity '+index);qty.className='scan-qty';cell('Quantity',qty);
 const unit=document.createElement('select');unit.className='scan-unit';unit.setAttribute('aria-label','Unit '+index);option(unit,'','Choose unit');UNITS.forEach(u=>option(unit,u,u));unit.value=item.qtyUnit||'';cell('Unit',unit);
 const match=cell('Price'),supplier=document.createElement('select');supplier.className='recipe-supplier-match';supplier.setAttribute('aria-label','Supplier product '+index);
 const search=field('search','','Search your price book '+index);search.placeholder='Search all your products';
 tr.dataset.priceMode='supplier';
 const supplierFields=document.createElement('div');supplierFields.append(supplier,search);
 const manualFields=document.createElement('fieldset');manualFields.className='scan-manual-price';manualFields.id='scanManualPrice'+index;manualFields.hidden=true;
 const legend=document.createElement('legend');legend.textContent='Enter the pack you buy';manualFields.append(legend);
 const label=(text,input)=>{const node=document.createElement('label');node.textContent=text;node.append(input);manualFields.append(node);};
 const pack=field('number','','Pack size '+index);pack.className='scan-pack';pack.placeholder='e.g. 5';label('Pack size',pack);
 const packUnit=document.createElement('select');packUnit.className='scan-pack-unit';packUnit.setAttribute('aria-label','Pack unit '+index);option(packUnit,'','Choose unit');UNITS.forEach(u=>option(packUnit,u,u==='l'?'litre':u));packUnit.value=item.qtyUnit||'';label('Pack unit',packUnit);
 const packPrice=field('number','','Pack price in pounds '+index);packPrice.className='scan-pack-price';packPrice.placeholder='e.g. 25.00';packPrice.step='0.01';label('Whole pack price (£)',packPrice);
 const vat=document.createElement('select');vat.className='scan-pack-vat';vat.setAttribute('aria-label','Price VAT basis '+index);for(const [value,text] of [['unknown','VAT not confirmed'],['ex_vat','Excluding VAT'],['inc_vat','Including VAT']])option(vat,value,text);label('Price basis',vat);
 manualFields.addEventListener('input',totals);manualFields.addEventListener('change',totals);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='secondary scan-manual-toggle';toggle.textContent='Enter pack price';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',manualFields.id);
 toggle.addEventListener('click',()=>{const manual=tr.dataset.priceMode!=='manual';tr.dataset.priceMode=manual?'manual':'supplier';supplier.value='';delete tr.dataset.supplierSnapshot;supplierFields.hidden=manual;manualFields.hidden=!manual;toggle.textContent=manual?'Use supplier product':'Enter pack price';toggle.setAttribute('aria-expanded',String(manual));if(manual&&!packUnit.value)packUnit.value=unit.value;totals();});
 const notice=cell('Check');notice.className='scan-notice';notice.setAttribute('role','status');
 const original=document.createElement('small');original.textContent=item.source?'Original OCR: '+item.source:'';name.parentElement.append(original);
 function updateMatches(){
  delete tr.dataset.supplierSnapshot;
   original.textContent=item.source?'Original OCR: '+item.source:'';
   supplier.replaceChildren();option(supplier,'','No supplier selected');
  const prices=rendering?renderPrices:book(),suggested=suggestRecipePriceMatches(name.value.trim(),unit.value,prices,{limit:20});
  const term=search.value.trim().toLocaleLowerCase('en-GB');
  const choices=term?prices.filter(p=>compatibleRecipeProduct(p,unit.value)&&(p.name+' '+(p.supplier||'')).toLocaleLowerCase('en-GB').includes(term)).slice(0,50).map(item=>({item,matchType:'manual'})):suggested;
  for(const {item:p,matchType} of choices)option(supplier,String(p.id),(matchType==='manual'?'Manual: ':matchType==='exact'?'Exact: ':'Suggested: ')+p.name+' · '+(p.supplier||'Supplier')+' · '+p.packBase+' '+p.baseUnit+' · '+money(Number(p.price)));
  if(choices.length>1)original.textContent=(item.source?'Original OCR: '+item.source+'. ':'')+'Multiple products: chef selection required.';
  totals();
 }
 const details=document.createElement('small');details.className='scan-product-details';match.append(toggle,supplierFields,manualFields,details);
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.setAttribute('aria-label','Remove scanned ingredient '+index);remove.addEventListener('click',()=>{tr.remove();totals();});cell('Remove',remove);
 el('recipeScanRows').append(tr);
 tr.addEventListener('refreshmatches',updateMatches);name.addEventListener('input',updateMatches);unit.addEventListener('change',updateMatches);search.addEventListener('input',updateMatches);qty.addEventListener('input',totals);supplier.addEventListener('change',()=>{const p=selection(tr);if(p)tr.dataset.supplierSnapshot=productSnapshot(p);else delete tr.dataset.supplierSnapshot;totals();});updateMatches();
}
function review(){
 rowSequence=0;el('recipeScanRows').replaceChildren();el('recipeScanName').value=parsed.name;el('recipeScanYield').value=parsed.yield??'';el('recipeScanSellingPrice').value='';
 rendering=true;renderPrices=book();try{parsed.ingredients.forEach(addRow);}finally{rendering=false;renderPrices=null;}el('recipeScanReview').hidden=false;totals();
 status('Review every ingredient against the original document. '+[...parsed.warnings,...(scanLines?.warnings||[])].join(' '));
}
async function scan(){
 const file=el('recipeScanFile').files?.[0];
 if(!user()){status('Sign in to scan and search your own price book.');return;}
 if(!file){status('Choose a recipe photo or PDF first.');return;}
 if(!window.MenuMarginScanner?.scanRecipeFile){status('Recipe OCR is unavailable in this scanner build.');return;}
 const run=++revision;controller?.abort();controller=new AbortController();scanUser=user();parsed=null;scanLines=null;el('recipeScanReview').hidden=true;el('recipeScanStart').disabled=true;
 try{
  status('Reading recipe on this device...');
  const result=await window.MenuMarginScanner.scanRecipeFile(file,{signal:controller.signal,onProgress:message=>{if(run===revision)status(message);}});
  if(run!==revision)return;
  if(user()!==scanUser){status('Account changed. Scan again in the current account.');return;}
  scanLines=result;parsed=parseRecipeText(result.text);clearSource();sourceUrl=URL.createObjectURL(file);el('recipeScanSource').href=sourceUrl;el('recipeScanSource').textContent='View original: '+file.name;el('recipeScanSource').hidden=false;review();
 }catch(error){if(run===revision)status(error.name==='AbortError'?'Scan cancelled.':'Could not read recipe: '+error.message);}
 finally{if(run===revision)el('recipeScanStart').disabled=false;}
}
function importRecipe(){
 if(!parsed)return;
 if(!user()||user()!==scanUser){el('recipeScanReview').hidden=true;parsed=null;status('Account changed. Scan again in the current account.');return;}
 const name=el('recipeScanName').value.trim(),yieldCount=Number(el('recipeScanYield').value),selling=el('recipeScanSellingPrice').value.trim(),sellingPrice=Number(selling);
 if(!name||!Number.isInteger(yieldCount)||yieldCount<1||yieldCount>100000||!Number.isFinite(sellingPrice)||sellingPrice<0){status('Enter a recipe name, valid portions and a non-negative selling price.');return;}
 const prices=book();let invalidSelection=false;
 const items=[...el('recipeScanRows').children].map(tr=>{
  const product=selection(tr,prices);if(tr.querySelector('.recipe-supplier-match').value&&(!product||tr.dataset.supplierSnapshot!==productSnapshot(product))){invalidSelection=true;tr.querySelector('.recipe-supplier-match').value='';delete tr.dataset.supplierSnapshot;tr.dispatchEvent(new Event('refreshmatches'));}
  return {name:product?product.name:tr.querySelector('.scan-name').value.trim(),qty:Number(tr.querySelector('.scan-qty').value),qtyUnit:tr.querySelector('.scan-unit').value,product,manual:tr.dataset.priceMode==='manual'?ownPrice(tr):null,signature:tr.dataset.supplierSnapshot};
 });
 if(invalidSelection){totals();status('Supplier details changed or the item is unavailable. Review its current pack and price, then select it again.');return;}
 if(!items.length||items.some(x=>!x.name||!Number.isFinite(x.qty)||x.qty<=0||!UNITS.includes(x.qtyUnit))){status('Complete every ingredient quantity and unit before importing. Remove incorrect OCR rows or correct them in the review table.');return;}
 if(items.some(x=>x.manual&&recipeScanManualCost(x.qty,x.qtyUnit,x.manual)===null)){status('Complete each manual pack size, compatible pack unit and whole pack price before importing. Zero is allowed only when you enter it explicitly.');return;}
 if(typeof hasUnsavedChanges!=='undefined'&&hasUnsavedChanges&&!window.confirm('Replace your current unsaved recipe with the scanned recipe?'))return;
 const unpriced=items.filter(x=>!x.product&&!x.manual).length;
 if(!window.confirm('Have you checked all ingredients, quantities and prices? '+(unpriced?unpriced+' ingredient(s) have no price. Their pack prices will be blank and GP will remain unavailable until priced. ':'')+'Import for costing without saving?'))return;
 if(user()!==scanUser){resetReview();status('Account changed. Scan again in the current account.');return;}
 const latestPrices=book();
 if(items.some(x=>x.product&&!latestPrices.some(p=>p.id===x.product.id&&compatibleRecipeProduct(p,x.qtyUnit)&&productSnapshot(p)===x.signature))){for(const tr of el('recipeScanRows').children)tr.dispatchEvent(new Event('refreshmatches'));totals();status('Supplier details changed while confirming. Review and select again.');return;}
 const imported=prepareRecipeImport({...parsed,name,yield:yieldCount,ingredients:items});imported.sellingPrice=sellingPrice;
 imported.ingredients.forEach((ingredient,i)=>{const p=items[i].product,manual=items[i].manual;if(p)Object.assign(ingredient,{priceBookId:p.id,priceLinkMode:'linked',pack:Number(p.packBase),packUnit:p.baseUnit,price:Number(p.price),priceEntered:true,priceBasis:p.priceBasis||'unknown'});else if(manual)Object.assign(ingredient,{priceBookId:null,priceLinkMode:'manual',pack:Number(manual.pack),packUnit:manual.packUnit,price:Number(manual.price),priceEntered:true,priceBasis:manual.priceBasis});});
 loadRecipe(imported);currentRecipeId=null;hasUnsavedChanges=true;calculate();updateRecipeHeader();el('recipeScanReview').hidden=true;el('recipeScanFile').value='';parsed=null;clearSource();setActiveView('costing');showToast('Recipe imported for costing. Check unmatched ingredients and GP, then Save recipe.');
}
el('recipeScanStart').addEventListener('click',scan);el('recipeScanImport').addEventListener('click',importRecipe);el('recipeScanAdd').addEventListener('click',()=>addRow());
for(const id of ['recipeScanYield','recipeScanSellingPrice'])el(id).addEventListener('input',totals);
el('recipeScanCancel').addEventListener('click',()=>{resetReview();status('Recipe scan cancelled.');});
el('recipeScanFile').addEventListener('change',()=>{resetReview();status('File selected. Read the new recipe to begin.');});

// Observe existing sessions only; no auth configuration or credentials change.
if(typeof mmSupabase!=='undefined'&&mmSupabase?.auth?.onAuthStateChange){
 mmSupabase.auth.onAuthStateChange((event,session)=>{
  if(scanUser&&(session?.user?.id??null)!==scanUser){resetReview();el('recipeScanFile').value='';status('Account changed. Scan again in the current account.');}
 });
}
