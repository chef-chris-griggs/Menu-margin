// Public business details only. Keep the dedicated support inbox current.
const MM_SITE_CONFIG=Object.freeze({
 operator:'admin.menumargin',
 supportEmail:'admin.menumargin@gmail.com',
 policyUpdated:'29 October 2026'
});
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-operator]').forEach(node=>node.textContent=MM_SITE_CONFIG.operator);
 document.querySelectorAll('[data-policy-date]').forEach(node=>node.textContent=MM_SITE_CONFIG.policyUpdated);
 document.querySelectorAll('[data-support-email]').forEach(node=>{
  node.textContent=MM_SITE_CONFIG.supportEmail;
  if(node.tagName==='A')node.href='mailto:'+MM_SITE_CONFIG.supportEmail+'?subject='+encodeURIComponent(node.dataset.subject||'MenuMargin support');
 });
});
