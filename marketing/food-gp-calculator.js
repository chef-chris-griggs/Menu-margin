const fields = document.getElementById('gp-fields');
const cost = document.getElementById('gp-cost');
const price = document.getElementById('gp-price');
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

function updateGrossProfit() {
  const valid = cost.validity.valid && price.validity.valid;
  const profit = price.valueAsNumber - cost.valueAsNumber;
  document.getElementById('gp-error').textContent = valid ? '' :
    'Enter a cost of £0 or more and a selling price of at least £0.01 in whole pennies.';
  document.getElementById('gp-cash').textContent = valid ? money.format(profit) : '—';
  document.getElementById('gp-percent').textContent = valid ? percent.format(profit / price.valueAsNumber) : '—';
  document.getElementById('gp-food-cost').textContent = valid ? percent.format(cost.valueAsNumber / price.valueAsNumber) : '—';
}

fields.addEventListener('input', updateGrossProfit);
window.addEventListener('pageshow', updateGrossProfit);
fields.hidden = false;
updateGrossProfit();
