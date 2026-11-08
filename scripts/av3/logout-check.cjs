'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor,shot}=require('./support.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const report={startedAt:new Date().toISOString(),sourceRole:'A',targetRole:'B',mode:'real Supabase logout, real JWT, delayed GET me'};
(async()=>{
 const browser=await chromium.launch();
 const release=deferred();
 try{
  const A=await actor(browser,'A');const reached=deferred();let held=false;
  const target=JSON.parse(fs.readFileSync(path.join(DIR,'identity-B.json'))).id;
  const state=JSON.parse(fs.readFileSync(path.join(DIR,'auth-B.json')));
  const session=JSON.parse(state.origins[0].localStorage.find(e=>e.name==='ulp:auth').value);
  await A.page.route(BASE+'/api/v1/me',async route=>{
   if(route.request().method()!=='GET'||held)return route.continue();held=true;
   const response=await route.fetch();assert.equal(response.status(),200);reached.resolve();await release.promise;await route.fulfill({response});
  });
  await A.page.evaluate(()=>{void window.ULAuth.fetchMe()});await reached.promise;
  const logout=A.page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/logout');
  await A.page.evaluate(()=>window.ULAuth.signOut());
  report.logoutStatus=(await logout).status();assert.ok([200,204].includes(report.logoutStatus));
  const cleared=await A.page.evaluate(()=>({session:window.ULAuth.getSession(),me:window.ULAuth.getMe(),keys:localStorage.getItem('ulp:keys')}));
  assert.deepEqual(cleared,{session:null,me:null,keys:null});report.localLogoutCleared=true;
  await A.page.evaluate(async s=>{const{error}=await window.ULAuth.getClient().auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});if(error)throw new Error(error.message)},session);
  await expect.poll(()=>A.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(target);
  const delivered=A.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me');release.resolve();await delivered;
  await A.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const current=await A.page.evaluate(()=>({session:window.ULAuth.getUser()?.id,me:window.ULAuth.getMe()?.id}));
  report.sessionRemainedB=current.session===target;report.meRemainedB=current.me===target;
  await shot(A,'real-logout-profile-race');
  assert.equal(current.session,target);assert.equal(current.me,target,'stale A profile replaced B after real logout');report.status='pass';
 }catch(error){report.status='fail';report.error=error.message.split('\n')[0];process.exitCode=1;}
 finally{release.resolve();fs.writeFileSync(path.join(DIR,'logout-check.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
