import {parseRecipeText,prepareRecipeImport} from './recipe-scan-parser.mjs';
const el=id=>document.getElementById(id);
let controller=null,parsed=null,scanLines=null;
const UNITS=['g','kg','ml','l','each'];
function status(message){el('recipeScanStatus').textContent=message;}
function addField(type,value,aria){
 const input=document.createElement('input');input.type=type;input.value=value??'';input.setAttribute('aria-label',aria);
 if(type==='number'){input.min='0';input.step='any';}
 return input;
}
function review(){
 const body=el('recipeScanRows');body.replaceChildren();
 if(!parsed)return;
 el('recipeScanName').value=parsed.name;
 el('recipeScanYield').value=parsed.yield??'';
 parsed.ingredients.forEach((item,index)=>{
  const tr=document.createElement('tr');
  const name=document.createElement('td'),qty=document.createElement('td'),unit=document.createElement('td'),notice=document.createElement('td');
  name.append(addField('text',item.name,'Ingredient '+(index+1)));
  qty.append(addField('number',item.qty,'Quantity '+(index+1)));
  const select=document.createElement('select');select.setAttribute('aria-label','Unit '+(index+1));
  const blank=document.createElement('option');blank.value='';blank.textContent='Choose unit';select.append(blank);
  UNITS.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option)});
  select.value=item.qtyUnit||'';unit.append(select);
  notice.textContent=item.needsReview?'Check original':'Review';
  tr.append(name,qty,unit,notice);body.append(tr);
 });
 el('recipeScanReview').hidden=false;
 const messages=[...parsed.warnings];
 if(scanLines?.warnings?.length)messages.push(...scanLines.warnings);
 status('Review every ingredient against the original document. '+messages.join(' '));
}
async function scan(){
 const file=el('recipeScanFile').files?.[0];
 if(!file){status('Choose a recipe photo or PDF first.');return;}
 if(!window.MenuMarginScanner?.scanRecipeFile){status('Recipe OCR is unavailable in this scanner build. Do not use invoice scan as a substitute.');return;}
 parsed=null;scanLines=null;el('recipeScanReview').hidden=true;
 controller?.abort();controller=new AbortController();
 el('recipeScanStart').disabled=true;
 try{
  status('Reading recipe on this device...');
  scanLines=await window.MenuMarginScanner.scanRecipeFile(file,{signal:controller.signal,onProgress:status});
  parsed=parseRecipeText(scanLines.text);
  review();
 }catch(error){status(error.name==='AbortError'?'Scan cancelled.':('Could not read recipe: '+error.message));}
 finally{el('recipeScanStart').disabled=false;}
}
function importRecipe(){
 if(!parsed)return;
 const name=el('recipeScanName').value.trim(),yieldCount=Number(el('recipeScanYield').value);
 if(!name||!Number.isInteger(yieldCount)||yieldCount<1||yieldCount>100000){status('Enter a recipe name and valid portion yield.');return;}
 const items=[...el('recipeScanRows').querySelectorAll('tr')].map(tr=>{
  const [nameCell,qtyCell,unitCell]=tr.children;
  return {name:nameCell.querySelector('input').value.trim(),qty:Number(qtyCell.querySelector('input').value),
   qtyUnit:unitCell.querySelector('select').value};
 });
 if(!items.length||items.some(x=>!x.name||!Number.isFinite(x.qty)||x.qty<=0||!UNITS.includes(x.qtyUnit))){
  status('Complete every ingredient quantity and unit before importing. Remove incorrect OCR rows by editing the source and rescanning.');return;
 }
 if(typeof mmUser==='undefined'||!mmUser){status('Sign in to import a recipe.');return;}
 if(typeof hasUnsavedChanges!=='undefined'&&hasUnsavedChanges&&!window.confirm('Replace your current unsaved recipe with the scanned recipe?'))return;
 if(!window.confirm('Have you checked all quantities against the original recipe? Import into the costing screen?'))return;
 const imported=prepareRecipeImport({...parsed,name,yield:yieldCount,ingredients:items});
 // Imported prices are empty by design. Existing exact-name matching handles supplier products.
 loadRecipe(imported);
 currentRecipeId=null;hasUnsavedChanges=true;calculate();updateRecipeHeader();
 el('recipeScanReview').hidden=true;el('recipeScanFile').value='';
 parsed=null;setActiveView('costing');
 showToast('Recipe imported for costing. Check supplier prices, missing matches and GP, then Save recipe.');
}
el('recipeScanStart').addEventListener('click',scan);
el('recipeScanImport').addEventListener('click',importRecipe);
el('recipeScanCancel').addEventListener('click',()=>{controller?.abort();parsed=null;el('recipeScanReview').hidden=true;status('Recipe scan cancelled.');});
