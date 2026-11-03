window.addEventListener('error', event => {
  const box = document.getElementById('mmGlobalError');
  if (!box) return;
  box.hidden = false;
  box.textContent = 'Mise en Price could not load part of the app. Reload this page; your saved device data is unchanged. Details: ' + (event.message || 'A script could not start.');
}, true);

window.addEventListener('unhandledrejection', event => {
  const box = document.getElementById('mmGlobalError');
  if (!box) return;
  box.hidden = false;
  box.textContent = 'A Mise en Price operation failed. Your local changes are kept. Details: ' + String(event.reason?.message || event.reason || 'unknown error');
});
