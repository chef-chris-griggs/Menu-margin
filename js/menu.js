function mmDeliverFile(blob, filename, title) {
  const file = new File([blob], filename, {type: blob.type || 'application/octet-stream'});
  if (navigator.share && typeof navigator.canShare === 'function' && navigator.canShare({files: [file]})) {
    return navigator.share({files: [file], title}).then(() => 'shared').catch(error => {
      if (error?.name === 'AbortError') return 'cancelled';
      console.warn('File share could not open; using download instead:', error);
      return mmDownloadFile(blob, filename);
    });
  }
  return Promise.resolve(mmDownloadFile(blob, filename));
}
function mmDownloadFile(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.rel = 'noopener'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
function mmDeleteStatus(message, state='') {
  const node = document.getElementById('mmDeleteAccountMessage');
  if (!node) return;
  node.textContent = message;
  if (state) node.dataset.state = state; else delete node.dataset.state;
}
function mmUpdateDeleteButton() {
  const button = document.getElementById('mmDeleteAccountSubmit');
  if (!button) return;
  const email = document.getElementById('mmDeleteEmail').value.trim().toLowerCase();
  const confirmation = document.getElementById('mmDeleteConfirmation').value.trim();
  const password = document.getElementById('mmDeletePassword').value;
  const accountEmail = String(mmUser?.email || '').trim().toLowerCase();
  button.disabled = !mmUser || !accountEmail || email !== accountEmail || confirmation !== 'DELETE' || !password;
}
function mmUpdateMenuSummary() {
  const email = document.getElementById('mmMenuAccountEmail');
  const status = document.getElementById('mmMenuSyncStatus');
  const billing = document.getElementById('mmMenuBilling');
  if (email) email.textContent = mmUser?.email ? 'Signed in as ' + mmUser.email : 'Sign in to view your account.';
  const cloud = document.getElementById('mmCloudStatus');
  if (status) status.textContent = cloud?.textContent || 'Sync status unavailable.';
  if (billing) billing.hidden = !mmBillingEnabled;
  mmUpdateDeleteButton();
}
document.getElementById('mmMenuRefresh')?.addEventListener('click', () => document.getElementById('mmRefreshCloud')?.click());
document.getElementById('mmMenuBilling')?.addEventListener('click', () => {
  if (typeof mmManageBilling === 'function') mmManageBilling();
});
document.getElementById('mmMenuSignOut')?.addEventListener('click', () => document.getElementById('mmSignOut')?.click());
document.getElementById('mmMenuCsv')?.addEventListener('click', () => document.getElementById('exportCsv')?.click());
document.getElementById('mmMenuPriceCsv')?.addEventListener('click', () => document.getElementById('pbExport')?.click());
document.getElementById('mmMenuBackup')?.addEventListener('click', () => document.getElementById('exportBackup')?.click());
document.getElementById('mmMenuPrintFlow')?.addEventListener('click', () => {
  setActiveView('costing');
  document.getElementById('printBtn')?.focus({preventScroll: true});
});
document.getElementById('tab-menu')?.addEventListener('click', mmUpdateMenuSummary);
new MutationObserver(mmUpdateMenuSummary).observe(document.getElementById('mmCloudStatus'), {childList: true, characterData: true, subtree: true});
new MutationObserver(mmUpdateMenuSummary).observe(document.getElementById('mmAccountLabel'), {childList: true, characterData: true, subtree: true});
new MutationObserver(mmUpdateMenuSummary).observe(document.getElementById('mmManageBillingAccount'), {attributes: true, attributeFilter: ['hidden']});
['mmDeleteEmail', 'mmDeletePassword', 'mmDeleteConfirmation'].forEach(id => {
  const field = document.getElementById(id);
  field?.addEventListener('input', mmUpdateDeleteButton);
});
document.getElementById('mmDeleteAccountForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('mmDeleteAccountSubmit');
  if (!mmUser || button.disabled) return;
  if (!navigator.onLine) {
    mmDeleteStatus('Connect to the internet before deleting your account.', 'error');
    return;
  }
  const userId = mmUser.id;
  const accountEmail = String(mmUser.email || '').trim();
  const email = document.getElementById('mmDeleteEmail').value.trim();
  const password = document.getElementById('mmDeletePassword').value;
  const confirmation = document.getElementById('mmDeleteConfirmation').value.trim();
  if (email.toLowerCase() !== accountEmail.toLowerCase() || confirmation !== 'DELETE') {
    mmDeleteStatus('Enter the signed-in account email and type DELETE exactly to continue.', 'error');
    return;
  }
  button.disabled = true;
  mmDeleteStatus('Verifying your password, then deleting the account…');
  try {
    const verification = await mmSupabase.auth.signInWithPassword({email: accountEmail, password});
    if (verification.error) throw new Error('Password could not be verified. Check it and try again.');
    if (verification.data?.user?.id !== userId) throw new Error('The signed-in account changed. Reload the page and try again.');
    const result = await mmSupabase.functions.invoke('delete-account', {body: {email: accountEmail, confirmation}});
    if (result.error) {
      let detail = result.error.message || 'The account deletion request failed.';
      try {
        const payload = await result.error.context?.clone?.().json();
        if (payload?.error) detail = payload.error;
      } catch {}
      throw new Error(detail);
    }
    if (!result.data?.deleted) throw new Error(result.data?.error || 'The account was not deleted. Please try again.');
    mmSigningOut = true;
    try { await mmSupabase.auth.signOut({scope: 'local'}); } catch {}
    mmSigningOut = false;
    mmUser = null; mmEntryPromise = null; mmEntryUserId = null;
    if (typeof mmRemoveAccountDeviceCopy === 'function') mmRemoveAccountDeviceCopy(userId);
    if (typeof mmClearPrivateUi === 'function') mmClearPrivateUi();
    document.getElementById('mmAuthGate').hidden = false;
    document.getElementById('mmSubscriptionGate').hidden = true;
    document.getElementById('mmAuthMessage').textContent = 'Your MenuMargin account and cloud data have been deleted.';
    document.getElementById('mmDeleteAccountForm').reset();
    mmDeleteStatus('Account deleted. You can close this page.', 'success');
  } catch (error) {
    mmSigningOut = false;
    mmDeleteStatus(error?.message || 'Account deletion could not be completed. Please try again.', 'error');
    button.disabled = false;
  }
});
mmUpdateMenuSummary();
