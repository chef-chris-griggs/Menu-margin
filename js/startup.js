// The app shell loads before sign-in, but no account data is read into the page until
// mmEnterApp has established which signed-in user's cache should be opened.
document.body.dataset.appVersion='1.0.0';
loadRecipe({name:'',yield:10,sellingPrice:0,targetGp:70,ingredients:[]});
hasUnsavedChanges=false;
renderPriceBook();
mmAppBooted=true;
mmResolveAppBoot();

if('serviceWorker' in navigator&&window.location.protocol!=='file:'){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(error=>{
    console.warn('MenuMargin offline storage could not start:',error);
    const status=document.getElementById('mmCloudStatus');
    if(status)status.textContent='Online app ready. Offline install is unavailable in this browser.';
  });
}

let mmInstallPrompt=null;
const installButton=document.getElementById('mmInstallApp');
const isAppleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!window.MSStream;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();mmInstallPrompt=event;if(installButton)installButton.hidden=false;
});
if(isAppleMobile&&installButton)installButton.hidden=false;
if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){
  if(installButton)installButton.hidden=true;
}
installButton?.addEventListener('click',async()=>{
  if(isAppleMobile){
    alert('To install MenuMargin on iPhone or iPad, tap Share in Safari, then choose Add to Home Screen.');
    return;
  }
  if(!mmInstallPrompt){alert('Use your browser menu and choose Install app or Add to Home Screen.');return;}
  mmInstallPrompt.prompt();await mmInstallPrompt.userChoice;mmInstallPrompt=null;installButton.hidden=true;
});
