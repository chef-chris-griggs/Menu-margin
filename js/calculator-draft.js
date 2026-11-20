// The calculator and app use separate origins. Transfer only between the two
// tabs involved in the click. Recipe data never enters a URL or analytics.
(() => {
  const key = 'mep-calculator-draft-v1';
  const website = 'https://miseenprice.co.uk';
  const panel = document.getElementById('calculatorDraftPanel');
  const units = {g:'weight', kg:'weight', l:'volume', ml:'volume', each:'each'};
  function valid(dish) {
    return dish && typeof dish.name === 'string' && Number.isSafeInteger(dish.yield) && dish.yield > 0 &&
      Number.isFinite(dish.sellingPrice) && dish.sellingPrice > 0 && Array.isArray(dish.ingredients) &&
      dish.ingredients.length > 0 && dish.ingredients.every(row => row && typeof row.name === 'string' && row.name.trim() &&
        Object.hasOwn(units,row.qtyUnit) && units[row.qtyUnit] === units[row.packUnit] &&
        Number.isFinite(row.qty) && row.qty > 0 && Number.isFinite(row.pack) && row.pack > 0 &&
        Number.isFinite(row.price) && row.price >= 0);
  }
  function read() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key));
      if (saved && Date.now() - saved.at < 86400000 && valid(saved.dish)) return saved;
      sessionStorage.removeItem(key);
    } catch {}
    return null;
  }
  window.mmDiscardCalculatorDraft = () => {
    panel.hidden = true;
    try { sessionStorage.removeItem(key); } catch {}
  };
  window.mmRefreshCalculatorDraft = () => {
    const saved = read();
    panel.hidden = !(saved && document.body.classList.contains('mm-authenticated') && mmUser?.id);
    if (!panel.hidden) {
      if (saved.account && saved.account !== mmUser.id) return window.mmDiscardCalculatorDraft();
      saved.account = mmUser.id;
      try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch { panel.hidden = true; }
    }
  };
  document.getElementById('discardCalculatorDraft').onclick = window.mmDiscardCalculatorDraft;
  document.getElementById('reviewCalculatorDraft').onclick = () => {
    const saved = read();
    if (!saved || !document.body.classList.contains('mm-authenticated') || saved.account !== mmUser?.id || !maybeSaveChanges()) return;
    const dish = saved.dish;
    const ingredients = dish.ingredients.map(({name, qty, qtyUnit, pack, packUnit, price}) => ({
      name, qty, qtyUnit, pack, packUnit, price, priceEntered:true, priceLinkMode:'manual'
    }));
    loadRecipe({name:dish.name, yield:dish.yield, sellingPrice:dish.sellingPrice, ingredients});
    hasUnsavedChanges = true;
    setActiveView('costing');
    updateRecipeHeader();
    mmSaveRecipeDraft();
    window.mmDiscardCalculatorDraft();
  };
  if (window.opener && new URLSearchParams(location.search).get('from') === 'calculator') {
    const opener = window.opener;
    function receive(event) {
      if (event.source !== opener || event.origin !== website || event.data?.type !== 'mep-calculator-draft' || !valid(event.data.draft)) return;
      try {
        sessionStorage.setItem(key, JSON.stringify({at:Date.now(),dish:event.data.draft}));
      } catch {
        opener.postMessage('mep-calculator-draft-unavailable', website);
        document.getElementById('calculatorDraftNotice').hidden = false;
        return;
      }
      opener.postMessage('mep-calculator-draft-received', website);
      window.removeEventListener('message', receive);
      window.mmRefreshCalculatorDraft();
    }
    window.addEventListener('message', receive);
    opener.postMessage('mep-request-calculator-draft', website);
  }
})();
