'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor,goto,shot}=require('./support.cjs');
const report={startedAt:new Date().toISOString(),cases:[]};
const session=role=>JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR,`auth-${role}.json`))).origins[0].localStorage.find(e=>e.name==='ulp:auth').value);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
(async()=>{
 const browser=await chromium.launch();
 try{
  for(const sourceRole of ['A','B'])for(const method of ['GET','PATCH']){
   const who=await actor(browser,sourceRole),targetRole=sourceRole==='A'?'B':'A';
   const target=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${targetRole}.json`))).id;
   const committed=deferred(),release=deferred();let held=false;
   const row={sourceRole,targetRole,method,expected:'current me must stay equal to current session user'};
   try{
    await goto(who,'/settings.html#community');
    await who.page.route(BASE+'/api/v1/me',async route=>{
     if(route.request().method()!==method || held)return route.continue();
     held=true;const response=await route.fetch();assert.equal(response.status(),200);
     committed.resolve();await release.promise;await route.fulfill({response});
    });
    await who.page.evaluate(method=>{window.__avf3Outcome=null;const p=method==='PATCH'?window.ULAuth.updateProfile({sharePracticeLog:true}):window.ULAuth.fetchMe();window.__avf3Pending=p.then(value=>{window.__avf3Outcome={value}},error=>{window.__avf3Outcome={error:error.name}});},method);
    await committed.promise;
    const token=session(targetRole);
    await who.page.evaluate(async s=>{const{error}=await window.ULAuth.getClient().auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});if(error)throw new Error(error.message)},token);
    await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(target);
    const before=await who.page.evaluate(()=>({me:window.ULAuth.getMe(),keys:localStorage.getItem('ulp:keys'),lang:localStorage.getItem('ulp:lang')}));
    const delivered=who.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me'&&r.request().method()===method);
    release.resolve();await delivered;
    await who.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await who.page.evaluate(()=>window.__avf3Pending);
    const after=await who.page.evaluate(()=>({me:window.ULAuth.getMe(),keys:localStorage.getItem('ulp:keys'),lang:localStorage.getItem('ulp:lang')}));
    assert.deepEqual(after,before);
    const outcome=await who.page.evaluate(()=>window.__avf3Outcome);
    if(method==='PATCH')assert.equal(outcome.error,'AbortError');else assert.equal(outcome.value,null);
    const state=await who.page.evaluate(()=>({session:window.ULAuth.getUser()?.id,me:window.ULAuth.getMe()?.id}));
    row.sessionRemainedTarget=state.session===target;
    row.meRemainedTarget=state.me===target;
    await shot(who,`profile-race-${sourceRole}-${method}`);
    assert.equal(state.session,target);assert.equal(state.me,target,'stale /me response changed the active account profile');
    row.status='pass';
   }catch(error){row.status='fail';row.error=error.message.split('\n')[0];process.exitCode=1;}
   finally{release.resolve();report.cases.push(row);fs.writeFileSync(path.join(DIR,'profile-races.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(row));await who.context.close()}
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
