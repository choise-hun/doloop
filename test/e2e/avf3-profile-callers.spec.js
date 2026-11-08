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
