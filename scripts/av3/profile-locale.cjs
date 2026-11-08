'use strict';
const {fs,path,assert,chromium,expect,DIR,BASE,actor,goto}=require('./support.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
(async()=>{const browser=await chromium.launch(),report=[];
 try{for(const role of ['A','B'])for(const targetChoice of [false,true])for(const failure of [false,true]){
 const who=await actor(browser,role),reached=deferred(),release=deferred();const requests=[];let held=false;const row={role,targetChoice,failure};
 try{
 await goto(who,'/settings.html');await who.page.route(BASE+'/api/v1/me',async route=>{
 if(route.request().method()!=='PATCH')return route.continue();
 const uid=JSON.parse(Buffer.from(route.request().headers().authorization.split(' ')[1].split('.')[1],'base64url')).sub;
 requests.push({uid,locale:route.request().postDataJSON().locale});
 if(held)return route.continue();held=true;const response=await route.fetch();assert.equal(response.status(),200);reached.resolve();await release.promise;
 if(failure)await route.fulfill({status:500,contentType:'application/json',body:'{"code":"AVF3_INJECTED_FAILURE"}'});else await route.fulfill({response});
 });
 await who.page.locator('#langSelect [data-lang="en"]').click();await reached.promise;
 await who.page.locator('#langSelect [data-lang="ja"]').click();
 const next=role==='A'?'B':'A';const id=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${next}.json`))).id;
 const storage=JSON.parse(fs.readFileSync(path.join(DIR,`auth-${next}.json`)));const s=JSON.parse(storage.origins[0].localStorage.find(x=>x.name==='ulp:auth').value);
 await who.page.evaluate(async s=>{const {error}=await window.ULAuth.getClient().auth.setSession(s);if(error)throw error},s);
 await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(id);
 if(targetChoice)await who.page.locator('#langSelect [data-lang="ko"]').click();
 const delivered=who.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me'&&r.request().method()==='PATCH');release.resolve();await delivered;
 if(targetChoice){await expect.poll(()=>requests.length).toBe(2);await expect.poll(()=>who.page.evaluate(()=>window.ULAuth.getMe()?.locale)).toBe('ko');assert.deepEqual(requests[1],{uid:id,locale:'ko'});await expect(who.page.locator('#langSelect [data-lang="ko"]')).toHaveAttribute('aria-pressed','true')}
 await who.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(requests.length,targetChoice?2:1);assert.equal(requests.some(r=>r.uid===id&&r.locale==='ja'),false);
 row.status='pass';
 }catch(e){row.status='fail';row.error=e.message;process.exitCode=1}
 finally{release.resolve();report.push(row);fs.writeFileSync(path.join(DIR,'profile-locale.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(row));await who.context.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
