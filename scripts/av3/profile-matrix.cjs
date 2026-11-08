'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor}=require('./support.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const session=role=>JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR,`auth-${role}.json`))).origins[0].localStorage.find(x=>x.name==='ulp:auth').value);
(async()=>{
 const browser=await chromium.launch(),report=[];
 try{
 for(const role of ['A','B'])for(const method of ['GET','PATCH'])for(const failure of [false,true])for(const transition of ['account','sameAccount','reverse']){
  const who=await actor(browser,role),release=deferred(),reached=deferred();let held=false;
  const row={role,method,failure,transition};
  try{
   await who.page.route(BASE+'/api/v1/me',async route=>{
    if(held||route.request().method()!==method)return route.continue();held=true;
    const response=await route.fetch();assert.equal(response.status(),200);reached.resolve();await release.promise;
    if(failure)await route.fulfill({status:500,contentType:'application/json',body:'{"code":"AVF3_INJECTED_FAILURE"}'});else await route.fulfill({response});
   });
   await who.page.evaluate(method=>{
    window.__avf3Events=[];window.__avf3Unsub=window.ULAuth.onChange(s=>window.__avf3Events.push(s.me?.id??null));
    const p=method==='GET'?window.ULAuth.fetchMe():window.ULAuth.updateProfile({shareAutosync:true});
    window.__avf3Pending=p.then(value=>({value}),error=>({error:error.name}));
   },method);await reached.promise;
   if(transition==='reverse')await who.page.evaluate(async method=>{if(method==='GET')await window.ULAuth.updateProfile({shareAutosync:false});else await window.ULAuth.fetchMe()},method);
   else{
    // Return to the same uid via the other real account. Real logout is tested last.
    if(transition==='sameAccount'){
     const other=role==='A'?'B':'A';
     const otherId=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${other}.json`))).id;
     await who.page.evaluate(async s=>{const {error}=await window.ULAuth.getClient().auth.setSession(s);if(error)throw error},session(other));
     await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(otherId);
    }
    const next=transition==='account'?(role==='A'?'B':'A'):role;
    const expected=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${next}.json`))).id;
    await who.page.evaluate(async s=>{const {error}=await window.ULAuth.getClient().auth.setSession(s);if(error)throw error},session(next));
    await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(expected);
   }
   const read=()=>who.page.evaluate(()=>({me:window.ULAuth.getMe(),uid:window.ULAuth.getUser()?.id,keys:localStorage.getItem('ulp:keys'),lang:localStorage.getItem('ulp:lang'),domLang:document.documentElement.lang,events:window.__avf3Events}));
   const before=await read();release.resolve();const result=await who.page.evaluate(()=>window.__avf3Pending);
   assert.deepEqual(await read(),before);
   if(method==='GET')assert.equal(result.value,null);else assert.equal(result.error,'AbortError');row.status='pass';
  }catch(e){row.status='fail';row.error=e.message;process.exitCode=1}
  finally{release.resolve();report.push(row);fs.writeFileSync(path.join(DIR,'profile-matrix.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(row));await who.context.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
