import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),pw=require('playwright');
const browserName=process.argv.includes('--webkit')?'webkit':'chromium',checks=[],errors=[],prefix='/Menu-margin/';
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix))throw Error();
  const name=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
  if(!/^(?:index\.html|privacy\.html|help\.html|terms\.html|styles\.css|sw\.js|manifest\.webmanifest|js\/|styles\/|icons\/|vendor\/)/.test(name))throw Error();
  const file=path.resolve(root,name);if(!file.startsWith(root))throw Error();
  res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,start=origin+prefix;
const id='70000000-0000-4000-8000-000000000001',now=Math.floor(Date.now()/1000),exp=now+3600;
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
// Synthetic tokens accepted only by the intercepted fixture API, never sent externally.
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:id,exp,iat:now,role:'authenticated',aud:'authenticated'})+'.test-only-signature';
const user={id,aud:'authenticated',role:'authenticated',email:'recovery@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const session={access_token:token,refresh_token:'fixture-refresh-only',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const callback=start+'?auth=recovery#'+new URLSearchParams({access_token:token,refresh_token:session.refresh_token,expires_in:'3600',expires_at:String(exp),token_type:'bearer',type:'recovery'});
let browser;
try{
 browser=await pw[browserName].launch({headless:true});
 async function fixture({oldSession=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),requests=[],settings={failUpdate:false,failLogout:false,failRecoverRate:false};
  if(oldSession)await context.addInitScript(value=>localStorage.setItem('sb-phwdyckedcqxbojpbqgz-auth-token',JSON.stringify(value)),session);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin||url.protocol==='blob:')return route.continue();
   if(url.origin!=='https://phwdyckedcqxbojpbqgz.supabase.co')throw Error('Unexpected external request');
   const method=request.method(),entry={path:url.pathname,method,redirectTo:url.searchParams.get('redirect_to')};if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'*'},body:''});requests.push(entry);
   const respond=(status,value)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
   if(url.pathname==='/auth/v1/recover')return settings.failRecoverRate?respond(429,{code:'over_email_send_rate_limit',msg:'Email rate limit exceeded'}):respond(200,{});
   if(url.pathname==='/auth/v1/user'&&method==='GET')return respond(200,user);
   if(url.pathname==='/auth/v1/user'&&method==='PUT'){
    entry.passwordSubmitted=Boolean(request.postDataJSON()?.password);
    return settings.failUpdate?respond(422,{code:'same_password',msg:'Choose a different password'}):respond(200,user);
   }
   if(url.pathname==='/auth/v1/logout')return settings.failLogout?respond(500,{msg:'Fixture logout failure'}):route.fulfill({status:204,body:''});
   if(url.pathname.startsWith('/rest/v1/'))return respond(200,url.pathname.includes('/rpc/')?false:[]);
   return respond(400,{msg:'Unexpected fixture auth request'});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));return {context,page,requests,settings};
 }
 {
  const {context,page,requests,settings}=await fixture();await page.goto(start);await page.waitForFunction(()=>mmAppBooted);
  await page.locator('#mmEmail').fill('recovery@example.invalid');await page.locator('#mmReset').click();
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('reset link has been sent'));
  assert.equal(requests.find(row=>row.path==='/auth/v1/recover'&&row.method==='POST')?.redirectTo,start+'?auth=recovery',JSON.stringify(requests));
  checks.push('reset email request uses a canonical same-app recovery URL, including subfolder hosting');
  await page.goto(callback);await page.locator('#mmPasswordRecoveryForm').waitFor({state:'visible'});
  await page.evaluate(()=>mmSupabase.auth.getSession().then(()=>true));
  assert.equal(await page.locator('#mmAuthForm').isVisible(),false);assert.equal(await page.evaluate(()=>document.body.classList.contains('mm-authenticated')),false);
  assert.equal(requests.filter(row=>row.path.startsWith('/rest/')).length,0);
  checks.push('real SDK PASSWORD_RECOVERY callback displays the new-password form','normal session startup cannot hide recovery or load account data');
  await page.reload();await page.locator('#mmPasswordRecoveryForm').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>mmRecoveryMode),'editing');checks.push('reloading the validated same-browser recovery session keeps the password form');
  await page.locator('#mmNewPassword').fill('fixture-new-password-123');await page.locator('#mmConfirmPassword').fill('different-fixture-password');await page.locator('#mmUpdatePassword').click();
  assert.match(await page.locator('#mmAuthMessage').textContent(),/do not match/);assert.equal(requests.filter(row=>row.method==='PUT').length,0);
  checks.push('mismatched passwords are rejected without calling the auth API');
  await page.locator('#mmConfirmPassword').fill('fixture-new-password-123');settings.failUpdate=true;await page.locator('#mmUpdatePassword').click();
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('Could not update password'));
  assert.equal(await page.locator('#mmPasswordRecoveryForm').isVisible(),true);checks.push('auth API password errors remain visible and allow a retry');
  settings.failUpdate=false;await page.locator('#mmUpdatePassword').click();
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('Password updated. Sign in'));
  assert.equal(await page.locator('#mmAuthForm').isVisible(),true);assert.equal(await page.locator('#mmPasswordRecoveryForm').isVisible(),false);
  assert.equal(await page.evaluate(()=>mmSupabase.auth.getSession().then(result=>result.data.session)),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem(MM_RECOVERY_CONTEXT)),null);assert.equal(new URL(page.url()).searchParams.has('auth'),false);
  assert.equal(requests.filter(row=>row.path.startsWith('/rest/')).length,0);
  checks.push('password update succeeds through the real SDK and USER_UPDATED cannot start the app','successful recovery closes its session, removes callback state and returns to sign-in');
  await context.close();
 }
 {
  const {context,page,requests}=await fixture({oldSession:true});
  await page.goto(start+'?auth=recovery#error=access_denied&error_code=otp_expired&error_description=Expired');
  await page.waitForFunction(()=>mmRecoveryMode==='error');
  assert.equal(await page.locator('#mmAuthForm').isVisible(),true);assert.equal(await page.locator('#mmPasswordRecoveryForm').isVisible(),false);
  assert.equal(requests.filter(row=>row.path.startsWith('/rest/')).length,0);assert.equal(requests.filter(row=>row.method==='PUT').length,0);
  assert.match(await page.locator('#mmAuthMessage').textContent(),/fresh|expired/);checks.push('expired links show recovery instructions rather than an unexplained sign-in page','an existing unrelated sign-in session cannot turn an invalid reset link into password-change access');
  await context.close();
 }
 {
  const {context,page,requests}=await fixture({oldSession:true});await page.goto(start+'?auth=recovery');await page.waitForFunction(()=>mmRecoveryMode==='error');
  assert.equal(await page.locator('#mmPasswordRecoveryForm').isVisible(),false);assert.equal(requests.filter(row=>row.path.startsWith('/rest/')).length,0);
  checks.push('a recovery query flag alone does not authorize changing an existing signed-in account');await context.close();
 }
 {
  const {context,page,requests}=await fixture();await page.goto(callback);await page.locator('#mmPasswordRecoveryForm').waitFor({state:'visible'});await page.locator('#mmCancelPasswordRecovery').click();
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('reset cancelled'));assert.equal(await page.locator('#mmAuthForm').isVisible(),true);assert.equal(requests.filter(row=>row.method==='PUT').length,0);
  checks.push('cancelling recovery closes the session without changing the password');await context.close();
 }
 {
  const {context,page,requests,settings}=await fixture();await page.goto(callback);await page.locator('#mmPasswordRecoveryForm').waitFor({state:'visible'});
  settings.failLogout=true;await page.locator('#mmNewPassword').fill('fixture-new-password-456');await page.locator('#mmConfirmPassword').fill('fixture-new-password-456');await page.locator('#mmUpdatePassword').click();
  await page.locator('#mmFinishRecoverySignOut').waitFor({state:'visible'});assert.equal(await page.locator('#mmUpdatePassword').isVisible(),false);assert.equal(requests.filter(row=>row.method==='PUT').length,1);
  settings.failLogout=false;await page.locator('#mmFinishRecoverySignOut').click();await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('Recovery session closed'));
  assert.equal(await page.locator('#mmAuthForm').isVisible(),true);assert.equal(requests.filter(row=>row.method==='PUT').length,1);
  checks.push('a sign-out failure after password update offers sign-out retry without submitting the password again');await context.close();
 }
 {
  const {context,page,requests,settings}=await fixture();await page.goto(start);await page.waitForFunction(()=>mmAppBooted);await page.locator('#mmEmail').fill('recovery@example.invalid');
  await page.evaluate(()=>{mmRequestPasswordReset();mmRequestPasswordReset();});
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('reset link has been sent'));
  assert.equal(requests.filter(row=>row.path==='/auth/v1/recover'&&row.method==='POST').length,1);assert.equal(await page.locator('#mmReset').isDisabled(),true);
  checks.push('double clicks send only one reset request and start a visible resend cooldown');
  await page.reload();await page.waitForFunction(()=>mmAppBooted);assert.equal(await page.locator('#mmReset').isDisabled(),true);assert.equal(requests.filter(row=>row.path==='/auth/v1/recover'&&row.method==='POST').length,1);
  checks.push('reloading preserves the resend cooldown and never automatically sends another email');
  await context.close();
 }
 {
  const {context,page,requests,settings}=await fixture();settings.failRecoverRate=true;await page.goto(start);await page.waitForFunction(()=>mmAppBooted);await page.locator('#mmEmail').fill('recovery@example.invalid');await page.locator('#mmReset').click();
  await page.waitForFunction(()=>document.getElementById('mmAuthMessage').textContent.includes('Email sending limit reached'));
  assert.match(await page.locator('#mmAuthMessage').textContent(),/cooldown does not reset that quota/);assert.equal(await page.locator('#mmReset').isDisabled(),true);assert.equal(requests.filter(row=>row.path==='/auth/v1/recover'&&row.method==='POST').length,1);
  assert.equal(requests.filter(row=>row.method==='PUT').length,0);checks.push('server email quota errors explain the block without claiming a reset time or changing the password');await context.close();
 }
 assert.deepEqual(errors,[]);await mkdir(path.join(root,'reports'),{recursive:true});
 const report={browser:browserName,passed:true,checks,browserErrors:errors,scope:'Real self-hosted Supabase SDK with intercepted synthetic auth responses; no real email, password or account changes'};
 await writeFile(path.join(root,`reports/password-recovery-${browserName}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
