// Capture callback intent before the Supabase client consumes URL fragments.
const mmRecoveryCallback=new URL(window.location.href);
const mmRecoveryFragment=new URLSearchParams(mmRecoveryCallback.hash.slice(1));
const mmRecoveryRequested=mmRecoveryCallback.searchParams.get('auth')==='recovery'||mmRecoveryFragment.get('type')==='recovery';
const MM_RECOVERY_CONTEXT='menumargin-password-recovery-v1';
let mmRecoveryMode=mmRecoveryRequested||mmRecoveryFragment.has('error')||mmRecoveryFragment.has('error_code')||mmRecoveryCallback.searchParams.has('error')?'checking':'none',mmRecoveryUserId=null;

function mmRecoveryContext(){try{return JSON.parse(sessionStorage.getItem(MM_RECOVERY_CONTEXT)||'null');}catch{return null;}}
function mmRecoveryClearUrl(){
 const url=new URL(window.location.href);
 for(const key of ['auth','code','token_hash','type','error','error_code','error_description'])url.searchParams.delete(key);
 if(new URLSearchParams(url.hash.slice(1)).has('access_token')||new URLSearchParams(url.hash.slice(1)).has('error'))url.hash='';
 history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function mmRecoveryShowError(message){
 mmRecoveryMode='error';mmRecoveryUserId=null;
 document.body.classList.remove('mm-authenticated','mm-payment-required');
 document.getElementById('mmPasswordRecoveryForm').hidden=true;
 document.getElementById('mmAuthForm').hidden=false;
 document.getElementById('mmNewPassword').value='';document.getElementById('mmConfirmPassword').value='';
 mmAuthMessage(message||'This reset link has expired, was already used or is invalid. Enter your email and request a fresh password reset.');
 mmRecoveryClearUrl();
 try{sessionStorage.removeItem(MM_RECOVERY_CONTEXT);}catch{}
}
function mmRecoveryStart(session){
 if(!session?.user?.id){mmRecoveryShowError();return;}
 if(mmAppBooted&&mmUser&&typeof mmSaveRecipeDraft==='function'&&hasUnsavedChanges)mmSaveRecipeDraft();
 mmRecoveryMode='editing';mmRecoveryUserId=session.user.id;
 mmUser=null;if(mmAppBooted)mmClearPrivateUi();
 document.body.classList.remove('mm-authenticated','mm-payment-required');
 document.getElementById('mmAuthForm').hidden=true;
 document.getElementById('mmPasswordRecoveryForm').hidden=false;
 document.getElementById('mmNewPassword').disabled=false;
 document.getElementById('mmConfirmPassword').disabled=false;
 document.getElementById('mmUpdatePassword').hidden=false;
 document.getElementById('mmUpdatePassword').disabled=false;
 document.getElementById('mmFinishRecoverySignOut').hidden=true;
 try{sessionStorage.setItem(MM_RECOVERY_CONTEXT,JSON.stringify({userId:session.user.id,expiresAt:Date.now()+15*60*1000}));}catch{}
 const url=new URL(window.location.href);url.searchParams.set('auth','recovery');url.hash='';history.replaceState(null,'',url.pathname+url.search);
 mmAuthMessage('Choose and confirm your new password below.');
}
async function mmRecoveryFinish(message){
 mmRecoveryMode='finishing';
 document.getElementById('mmNewPassword').value='';document.getElementById('mmConfirmPassword').value='';
 document.getElementById('mmNewPassword').disabled=true;document.getElementById('mmConfirmPassword').disabled=true;
 try{
  const {error}=await mmSupabase.auth.signOut({scope:'local'});if(error)throw error;
  mmUser=null;if(mmAppBooted)mmClearPrivateUi();
  try{sessionStorage.removeItem(MM_RECOVERY_CONTEXT);}catch{}
  mmRecoveryClearUrl();mmRecoveryUserId=null;mmRecoveryMode='none';
  document.getElementById('mmPasswordRecoveryForm').hidden=true;document.getElementById('mmAuthForm').hidden=false;
  document.getElementById('mmNewPassword').value='';document.getElementById('mmConfirmPassword').value='';
  mmAuthMessage(message);
 }catch{
  document.getElementById('mmUpdatePassword').hidden=true;
  document.getElementById('mmFinishRecoverySignOut').hidden=false;
  mmAuthMessage('Could not finish signing out. Choose Finish sign out to close this session. If your password was updated, do not submit it again.');
 }
}
async function mmRecoverySubmit(event){
 event.preventDefault();if(mmRecoveryMode!=='editing')return;
 const password=document.getElementById('mmNewPassword').value,confirmation=document.getElementById('mmConfirmPassword').value;
 if(password.length<8){mmAuthMessage('Choose a password with at least 8 characters.');return;}
 if(password!==confirmation){mmAuthMessage('The passwords do not match. Please enter the same new password twice.');return;}
 const button=document.getElementById('mmUpdatePassword');button.disabled=true;mmAuthMessage('Updating password…');
 try{
  const {data,error}=await mmSupabase.auth.getSession();
  if(error||data.session?.user?.id!==mmRecoveryUserId){mmRecoveryShowError();return;}
  mmRecoveryMode='updating';
  const result=await mmSupabase.auth.updateUser({password});
  if(result.error){mmRecoveryMode='editing';mmAuthMessage('Could not update password: '+result.error.message);return;}
  document.getElementById('mmNewPassword').value='';document.getElementById('mmConfirmPassword').value='';
  document.getElementById('mmNewPassword').disabled=true;document.getElementById('mmConfirmPassword').disabled=true;
  await mmRecoveryFinish('Password updated. Sign in with your new password.');
 }catch{mmRecoveryMode='editing';mmAuthMessage('Could not update your password. Check the connection and try again.');}
 finally{button.disabled=false;}
}
async function mmRecoveryCheckInitial(session){
 if(mmRecoveryFragment.has('error')||mmRecoveryFragment.has('error_code')||mmRecoveryCallback.searchParams.has('error')){mmRecoveryShowError();return true;}
 if(mmRecoveryMode==='none')return false;
 // The SDK can deliver PASSWORD_RECOVERY after getSession/INITIAL_SESSION.
 await new Promise(resolve=>setTimeout(resolve,0));
 if(mmRecoveryMode==='editing'||mmRecoveryMode==='updating'||mmRecoveryMode==='finishing')return true;
 const context=mmRecoveryContext();
 if(session?.user?.id&&context?.userId===session.user.id&&Number(context.expiresAt)>Date.now()){mmRecoveryStart(session);return true;}
 mmRecoveryShowError();return true;
}
