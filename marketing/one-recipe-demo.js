'use strict';
const rows=document.getElementById('ingredientRows'),money=n=>'£'+n.toFixed(2);
const examples=[['Tomatoes','2','kg','5','kg','8.00'],['Onions','0.5','kg','5','kg','5.00'],['Vegetable stock','1','l','2','l','3.00']];
function addRow(data=['','1','kg','1','kg','0']){const row=document.createElement('div');row.className='demo-ingredient';const fields=[['Ingredient','text',data[0]],['Used','number',data[1]],['Unit','select',data[2]],['Pack size','number',data[3]],['Pack unit','select',data[4]],['Pack price (£)','number',data[5]]];fields.forEach(([label,type,value],index)=>{const wrapper=document.createElement('label');wrapper.textContent=label;let el;if(type==='select'){el=document.createElement('select');['g','kg','ml','l','each'].forEach(u=>{const option=document.createElement('option');option.value=u;option.textContent=u;el.append(option)})}else{el=document.createElement('input');el.type=type;if(type==='number'){el.min=index===5?'0':'0.000001';el.step='any'}else el.maxLength=100}el.value=value;el.addEventListener('input',calculate);el.addEventListener('change',calculate);wrapper.append(el);row.append(wrapper)});const remove=document.createElement('button');remove.type='button';remove.className='demo-secondary demo-remove';remove.textContent='Remove';remove.setAttribute('aria-label','Remove ingredient');remove.addEventListener('click',()=>{row.remove();calculate()});row.append(remove);rows.append(row);calculate()}
function toBase(q,u){return q*({kg:1000,g:1,l:1000,ml:1,each:1}[u]||NaN)}
function family(u){return ['kg','g'].includes(u)?'weight':['l','ml'].includes(u)?'volume':'each'}
function calculate(){const portionsField=document.getElementById('portions'),sellField=document.getElementById('sellPrice');const portions=Number(portionsField.value),sell=Number(sellField.value);let total=0,error='';const list=[...rows.children];if(!portionsField.value.trim()||!sellField.value.trim()||!Number.isInteger(portions)||portions<1||!Number.isFinite(sell)||sell<=0)error='Enter a valid portion count and a selling price greater than zero.';if(!list.length)error='Add at least one ingredient.';for(const row of list){const [name,used,unit,pack,packUnit,price]=[...row.querySelectorAll('input,select')].map(e=>e.value),u=Number(used),p=Number(pack),c=Number(price);if(!name.trim()||!Number.isFinite(u)||u<=0||!Number.isFinite(p)||p<=0||!price.trim()||!Number.isFinite(c)||c<0){error='Complete each ingredient with positive quantities and a non-negative pack price.';break}if(family(unit)!==family(packUnit)){error='Ingredient and pack units must match (weight, volume or each).';break}total+=toBase(u,unit)/toBase(p,packUnit)*c}if(!Number.isFinite(total))error='Check your quantities and pack prices.';const portion=total/portions,gp=sell-portion;document.getElementById('demoError').textContent=error;for(const [id,val] of [['batchCost',total],['portionCost',portion],['gpValue',gp]])document.getElementById(id).textContent=error?'—':money(val);document.getElementById('gpPercent').textContent=error?'—':sell>0?(gp/sell*100).toFixed(1)+'%':'N/A'}
document.getElementById('addIngredient').addEventListener('click',()=>{
  addRow();
  const newRow=rows.lastElementChild;
  if(!newRow)return;
  newRow.classList.add('demo-new-ingredient');
  // The new ingredient sits ABOVE the button; keep it in view on iPhone.
  newRow.scrollIntoView({block:'center',behavior:'instant'});
  const nameInput=newRow.querySelector('input[type="text"]');
  if(nameInput){try{nameInput.focus({preventScroll:true})}catch{nameInput.focus()}}
  const status=document.getElementById('demoAddStatus');
  if(status)status.textContent='Ingredient added. Enter a name and pack details.';
});document.getElementById('demoForm').addEventListener('submit',e=>e.preventDefault());['portions','sellPrice'].forEach(id=>document.getElementById(id).addEventListener('input',calculate));examples.forEach(addRow);
// Preserve a user-controlled copy of demo inputs without transmitting supplier prices.
const copyDemoButton=document.getElementById('copyDemoRecipe');
if(copyDemoButton){copyDemoButton.addEventListener('click',async()=>{
  const status=document.getElementById('copyDemoStatus');
  const recipe=document.getElementById('recipeName').value.trim();
  const portions=document.getElementById('portions').value;
  const selling=document.getElementById('sellPrice').value;
  const ingredientLines=[...rows.children].map(row=>{
    const fields=[...row.querySelectorAll('input,select')].map(el=>el.value.trim());
    return fields[0]+': '+fields[1]+' '+fields[2]+' used; pack '+fields[3]+' '+fields[4]+' at £'+fields[5];
  });
  const content=['Mise en Price recipe calculator','Recipe: '+recipe,'Portions: '+portions,'Selling price per portion ex VAT: £'+selling,'Ingredients:',...ingredientLines,'Batch cost: '+document.getElementById('batchCost').textContent,'Cost per portion: '+document.getElementById('portionCost').textContent,'Food-cost GP: '+document.getElementById('gpPercent').textContent].join('\n');
  try{
    if(!navigator.clipboard || !navigator.clipboard.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(content);
    const oldFallback=document.getElementById('recipeCopyFallback');
    if(oldFallback)oldFallback.remove();
    if(status)status.textContent='Recipe details copied. Keep them to refer to when adding your recipe in the app.';
  }catch(error){
    if(status){
      status.textContent='Clipboard copy is unavailable. Select and copy the recipe details below before continuing.';
      let fallback=document.getElementById('recipeCopyFallback');
      if(!fallback){
        fallback=document.createElement('div');
        fallback.id='recipeCopyFallback';
        const label=document.createElement('label');
        label.htmlFor='recipeCopyText';
        label.textContent='Your recipe details';
        const textarea=document.createElement('textarea');
        textarea.id='recipeCopyText';
        textarea.readOnly=true;
        textarea.rows=9;
        textarea.style.width='100%';
        const selectButton=document.createElement('button');
        selectButton.type='button';
        selectButton.className='demo-secondary';
        selectButton.textContent='Select all recipe details';
        selectButton.addEventListener('click',()=>{textarea.focus();textarea.select()});
        fallback.append(label,textarea,selectButton);
        status.insertAdjacentElement('afterend',fallback);
      }
      const textarea=fallback.querySelector('textarea');
      textarea.value=content;
      textarea.focus();
      textarea.select();
    }
  }
});}

const carryDish = document.getElementById('carryDish');
if (carryDish) {
  let appTab, draft, acknowledgmentTimer;
  const ACKNOWLEDGMENT_TIMEOUT_MS = 12000;
  function clearAcknowledgmentTimer() {
    if (acknowledgmentTimer) clearTimeout(acknowledgmentTimer);
    acknowledgmentTimer = undefined;
  }
  const appOrigin = new URL(carryDish.href).origin;
  const status = document.getElementById('dishTransferStatus');
  function showTrialFallback(message) {
    clearAcknowledgmentTimer();
    status.textContent = message + ' Copy your recipe details before continuing. ';
    const link = document.createElement('a');
    link.href = carryDish.href;
    link.textContent = 'Start my free trial in this tab';
    status.append(link);
  }
  carryDish.addEventListener('click', event => {
    event.preventDefault();
    calculate();
    if (document.getElementById('demoError').textContent) {
      status.textContent = 'Complete the highlighted costing details before continuing.';
      document.getElementById('demoError').scrollIntoView({block:'center'});
      return;
    }
    draft = {
      name: document.getElementById('recipeName').value.trim(),
      yield: Number(document.getElementById('portions').value),
      sellingPrice: Number(document.getElementById('sellPrice').value),
      ingredients: [...rows.children].map(row => {
        const [name, qty, qtyUnit, pack, packUnit, price] = [...row.querySelectorAll('input,select')].map(field => field.value);
        return {name, qty:Number(qty), qtyUnit, pack:Number(pack), packUnit, price:Number(price)};
      })
    };
    clearAcknowledgmentTimer();
    appTab = window.open(carryDish.href + '&from=calculator', '_blank');
    if (appTab) {
      status.textContent = 'Keep this calculator open until the app receives your dish.';
      const pendingTab = appTab;
      acknowledgmentTimer = setTimeout(() => {
        if (appTab !== pendingTab || !draft) return;
        showTrialFallback('The app has not confirmed receipt of your dish. Your recipe is still here.');
      }, ACKNOWLEDGMENT_TIMEOUT_MS);
    } else {
      // A blocked pop-up cannot complete the cross-tab handoff. Keep every entry intact.
      showTrialFallback('The app tab did not open. Your recipe is still here.');
      const copyButton = document.getElementById('copyDemoRecipe');
      if (copyButton) copyButton.focus();
    }
  });
  window.addEventListener('message', event => {
    if (!appTab || event.source !== appTab || event.origin !== appOrigin) return;
    if (event.data === 'mep-request-calculator-draft' && draft) appTab.postMessage({type:'mep-calculator-draft', draft}, appOrigin);
    if (event.data === 'mep-calculator-draft-unavailable') showTrialFallback('The app could not keep the draft on this device. Your entries are still here.');
    if (event.data === 'mep-calculator-draft-received' && draft) {
      clearAcknowledgmentTimer();
      draft = null;
      status.textContent = 'Your dish is in the app tab. Return to that tab after confirming your email.';
    }
  });
}
