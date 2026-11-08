'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor,goto,api,shot}=require('./support.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
(async()=>{
 const browser=await chromium.launch(),report=[];
 try{for(const role of ['A','B'])for(const selector of ['#commAutosync','#commPracticeLog'])for(const failure of [false,true]){
  const who=await actor(browser,role),release=deferred(),reached=deferred();let held=false;
  const next=role==='A'?'B':'A';const row={role,selector,failure};
  try{
   await goto(who,'/settings.html#community');
   await who.page.route(BASE+'/api/v1/me',async route=>{
    if(held||route.request().method()!=='PATCH')return route.continue();held=true;
    const response=await route.fetch();assert.equal(response.status(),200);reached.resolve();await release.promise;
    if(failure)await route.fulfill({status:500,contentType:'application/json',body:'{"code":"AVF3_INJECTED_FAILURE"}'});else await route.fulfill({response});
   });
   await expect(who.page.locator(selector)).toBeEnabled();await who.page.locator(selector).click();await reached.promise;
   const storage=JSON.parse(fs.readFileSync(path.join(DIR,`auth-${next}.json`)));
   const s=JSON.parse(storage.origins[0].localStorage.find(x=>x.name==='ulp:auth').value);
   const target=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${next}.json`))).id;
   await who.page.evaluate(async s=>{const {error}=await window.ULAuth.getClient().auth.setSession(s);if(error)throw error},s);
   await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(target);
   const read=async()=>({autosync:await who.page.locator('#commAutosync').getAttribute('aria-checked'),practiceLog:await who.page.locator('#commPracticeLog').getAttribute('aria-checked'),error:await who.page.locator('#commErrMsg').count()});
   const before=await read();const response=who.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me'&&r.request().method()==='PATCH');release.resolve();await response;
   await who.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.deepEqual(await read(),before);
   await shot(who,`avf3-settings-${role}-${selector.slice(1)}-${failure}`);row.status='pass';
  }catch(e){row.status='fail';row.error=e.message;process.exitCode=1}
  finally{release.resolve();report.push(row);fs.writeFileSync(path.join(DIR,'profile-callers.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(row));await who.context.close()}
 }}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
