'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor,api,goto,shot}=require('./support.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const session=role=>JSON.parse(JSON.parse(fs.readFileSync(path.join(DIR,`auth-${role}.json`))).origins[0].localStorage.find(e=>e.name==='ulp:auth').value);
const report={startedAt:new Date().toISOString(),model:'actual server commit, old share response delivered after SDK account switch',cases:[]};
(async()=>{
 const browser=await chromium.launch();
 try{
  const f=JSON.parse(fs.readFileSync(path.join(DIR,'fixture.json')));
  for(const sourceRole of ['A','B'])for(const op of ['publish','autosync','republish'])for(const outcome of ['success','response500']){
   const who=await actor(browser,sourceRole),targetRole=sourceRole==='A'?'B':'A';
   const cat=sourceRole==='A'?f.category:f.cloned;
   const targetId=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${targetRole}.json`))).id;
   const endpoint=`/api/v1/categories/${cat}/share${op==='republish'?'/republish':''}`;
   const method=op==='republish'?'POST':'PUT';
   const committed=deferred(),release=deferred();
   const row={sourceRole,targetRole,op,outcome};
   try{
    await api(who,'PATCH','/api/v1/me',{shareAutosync:true});
    await api(who,'PUT',`/api/v1/categories/${cat}/share`,{isPublic:true,autoSync:false});
    await goto(who,'/log.html#community');
    await who.page.route(BASE+endpoint,async route=>{
     if(route.request().method()!==method)return route.continue();
     const response=await route.fetch();assert.equal(response.status(),200);committed.resolve();await release.promise;
     if(outcome==='response500')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,source:'server',status:500,code:'INTERNAL_ERROR',message:'AV3 post-commit response loss',retryAfter:null})});
     else await route.fulfill({response});
    });
    const attr={publish:'public',autosync:'autosync',republish:'republish'}[op];
    await who.page.locator(`[data-share-${attr}="${cat}"]`).click();await committed.promise;
    const s=session(targetRole);
    await who.page.evaluate(async s=>{const{error}=await window.ULAuth.getClient().auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});if(error)throw new Error(error.message)},s);
    await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(targetId);
    await expect(who.page.locator('#mySharesErr')).toHaveCount(0);
    const delivered=who.page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()===method);
    release.resolve();await delivered;
    await who.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    row.staleErrorShown=await who.page.locator('#mySharesErr').count()>0;
    if(row.staleErrorShown)await shot(who,`share-race-${sourceRole}-${op}`);
    assert.equal(row.staleErrorShown,false,'previous account share failure appeared in the new account');
    row.status='pass';
   }catch(error){row.status='fail';row.error=error.message.split('\n')[0];process.exitCode=1;}
   finally{release.resolve();report.cases.push(row);fs.writeFileSync(path.join(DIR,'share-races.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(row));await who.context.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
