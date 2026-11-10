'use strict';
const {test,expect}=require('@playwright/test');
const {mockApp,STATES,DEFAULT_ME}=require('./support/mock-app');
for(const operation of ['enable','disable'])for(const outcome of ['success','failure','abort'])test(`AVF3 Drive ${operation} ${outcome}: previous account completion leaves current status unchanged`,async({page})=>{
 await mockApp(page,{...STATES.user,me:{storageProvider:operation==='disable'?'drive':'supabase'}});
 await page.goto('/settings.html');await expect.poll(()=>page.evaluate(()=>window.ULAuth?.getMe()?.id)).toBe(DEFAULT_ME.id);
 await page.evaluate(({operation,outcome})=>{
  window.__driveEntered=false;window.__driveFinished=false;
  window.ULDrive[operation+'DriveStorage']=()=>new Promise((resolve,reject)=>{
   window.__driveEntered=true;window.__driveRelease=()=>{
    if(outcome==='success')resolve({id:window.ULAuth.getUser().id});else{const error=new Error('previous account failure');if(outcome==='abort')error.name='AbortError';reject(error)}
   };
  });
 },{operation,outcome});
 await page.locator('#account > details > summary').click();
 await page.locator(operation==='enable'?'#btnDriveEnable':'#btnDriveDisable').click();await page.waitForFunction(()=>window.__driveEntered);
 const id='00000000-0000-4000-8000-000000000099';await page.route('**/api/v1/me',route=>route.fulfill({json:{...DEFAULT_ME,id,email:'b@example.com'}}));
 await page.evaluate(id=>{
  const session={access_token:'b-token',user:{id,email:'b@example.com'}};
  window.ULAuth.getClient().auth.getSession=async()=>({data:{session}});
  window.__supabaseAuthListener('SIGNED_IN',session);
 },id);
 await expect.poll(()=>page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(id);await expect(page.locator('#driveStatusMsg')).toBeEmpty();
 await page.evaluate(()=>{window.__driveRelease()});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await expect(page.locator('#driveStatusMsg')).toBeEmpty();
});

for(const selector of ['#commAutosync','#commPracticeLog'])test(`AVF3 refreshed session ${selector}: current PATCH failure restores state and shows error`,async({page})=>{
 const {COMMUNITY_PRO_ME}=require('./support/community-fixtures');
 await mockApp(page,{...STATES.user,me:COMMUNITY_PRO_ME});
 await page.goto('/settings.html');await expect(page.locator(selector)).toBeEnabled();
 await page.evaluate(()=>{
  const session=window.ULAuth.getSession();
  window.ULAuth.getClient().auth.getSession=async()=>({data:{session:{...session}}});
 });
 await page.route('**/api/v1/me',route=>route.request().method()==='PATCH'?route.fulfill({status:500,json:{code:'INTERNAL_ERROR'}}):route.fallback());
 await page.locator('#community > details > summary').click();
 await page.locator(selector).click();
 await expect(page.locator(selector)).toHaveAttribute('aria-checked','true');
 await expect(page.locator('#commErrMsg')).toHaveText('요청을 처리하지 못했어요');
});
for(const operation of ['enable','disable'])for(const outcome of ['success','failure'])test(`AVF3 refreshed session Drive ${operation} ${outcome}: current completion stays visible`,async({page})=>{
 await mockApp(page,{...STATES.user,me:{storageProvider:operation==='disable'?'drive':'supabase'}});
 await page.goto('/settings.html');await expect.poll(()=>page.evaluate(()=>window.ULAuth.getMe()?.id)).toBe(DEFAULT_ME.id);
 await page.evaluate(({operation,outcome})=>{
  window.ULDrive[operation+'DriveStorage']=async()=>{
   const session={...window.ULAuth.getSession()};
   window.ULAuth.getClient().auth.getSession=async()=>({data:{session}});
   await window.ULAuth.getAccessToken();
   if(outcome==='failure')throw new Error('current Drive failure');
  };
 },{operation,outcome});
 await page.locator('#account > details > summary').click();
 await page.locator(operation==='enable'?'#btnDriveEnable':'#btnDriveDisable').click();
 if(outcome==='failure')await expect(page.locator('#driveStatusMsg')).toHaveText('current Drive failure');
 else await expect(page.locator('#driveStatusMsg')).not.toBeEmpty();
});

for(const firstFails of [false,true])test(`AVF3 overlapping settings firstFails=${firstFails}: both independent choices reach server`,async({page})=>{
 const {COMMUNITY_PRO_ME}=require('./support/community-fixtures');
 let saved={...DEFAULT_ME,...COMMUNITY_PRO_ME},calls=[];
 await mockApp(page,{...STATES.user,me:saved});
 await page.route('**/api/v1/me',async route=>{
  if(route.request().method()==='PATCH'){
   const patch=route.request().postDataJSON();calls.push(patch);
   if(firstFails&&calls.length===1)return route.fulfill({status:500,json:{code:'INTERNAL_ERROR'}});
   saved={...saved,...patch};
  }
  await route.fulfill({json:saved});
 });
 await page.goto('/settings.html');await expect(page.locator('#commAutosync')).toBeEnabled();
 await page.evaluate(()=>{
  const sdk=window.ULAuth.getClient().auth,original=sdk.getSession;let first=true;
  window.__tokenEntered=false;
  sdk.getSession=()=>{
   if(!first)return original();first=false;window.__tokenEntered=true;
   return new Promise(resolve=>{window.__releaseToken=async()=>resolve(await original())});
  };
 });
 await page.locator('#community > details > summary').click();
 await page.locator('#commAutosync').click();await page.waitForFunction(()=>window.__tokenEntered);
 await page.locator('#commPracticeLog').click();
 await page.evaluate(()=>window.__releaseToken());
 await expect.poll(()=>calls.length).toBe(2);
 expect(calls).toEqual([{shareAutosync:false},{sharePracticeLog:false}]);
 await expect.poll(()=>page.evaluate(()=>window.ULAuth.getMe()?.sharePracticeLog)).toBe(false);
 await expect(page.locator('#commPracticeLog')).toHaveAttribute('aria-checked','false');
 await expect(page.locator('#commAutosync')).toHaveAttribute('aria-checked',String(firstFails));
 expect(saved.shareAutosync).toBe(firstFails);expect(saved.sharePracticeLog).toBe(false);
});
