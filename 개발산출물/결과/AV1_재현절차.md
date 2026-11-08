# AV-1 추가 브라우저 재현 절차

앱 코드 기준 `b0aa818`. 저장소 루트에서 기존 의존성을 사용한다. 두 스크립트는 mock API 조사 도구이며 실제 DB·운영을 호출하지 않는다. 결함 존재를 단언하므로 수정 후에는 AV-2 회귀 테스트로 기대값을 바꿔 정식화한다.

1. `npm run build`
2. 별도 터미널에서 `PORT=3001 node server.js`
3. 아래 블록을 각각 `/tmp/av1-browser.cjs`, `/tmp/av1-actions.cjs`로 저장하고 저장소 루트에서 `node <경로>` 실행.
4. 첫 도구는 AV-F1 노출과 AV-F2 오염, A 중복 요청 1건을 확인한다. 둘째는 유료 담기와 신고 201/409의 UI를 확인한다. 결과·한계는 [검수 결과](AV1_사용가능성검수.md) 참조.

## AV-F1·AV-F2 재현

```javascript
const root=process.cwd();
const {chromium,expect}=require(root+'/node_modules/@playwright/test');
const {mockApp,STATES}=require(root+'/test/e2e/support/mock-app');
const f=require(root+'/test/e2e/support/community-fixtures');
(async()=>{
 const browser=await chromium.launch(); const page=await browser.newPage({locale:'ko-KR'});
 let release; const gate=new Promise(r=>release=r); let followCalls=0;
 await mockApp(page,{...STATES.userData,me:f.COMMUNITY_FREE_ME,routes:f.communityRoutes({onFollow:async(route,json)=>{followCalls++;await gate;return json(route,{following:true,followerCount:11});}})});
 await page.goto('http://127.0.0.1:3001/index.html');
 await expect(page.locator('#discover')).toBeVisible();
 const visibleComment=await page.locator('#discover').innerText();
 console.log('AV-F1 visibleComment='+visibleComment.includes('// i18n-keep: G3'));
 await expect(page.locator('#discover')).toContainText('// i18n-keep: G3');
 const [a]=f.CURATION_HOME_FIXTURE.showcase;const [b]=f.CURATION_HOME_FIXTURE.following;
 await page.locator(`[data-folder-id="${a.id}"]`).first().click();
 await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked','false');
 await page.locator('#folderFollow').click();
 await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked','true');
 await page.locator('#folderFollow').click(); // 요청 중 중복 클릭
 await page.locator('#folderClose').click();
 await page.locator(`[data-folder-id="${b.id}"]`).first().click();
 await expect(page.locator('#folderSheetTitle')).toHaveText(b.title);
 await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked','false');
 const response=page.waitForResponse(r=>r.url().includes('/follows/'+a.owner.id)&&r.request().method()==='PUT');
 release(); await response;
 await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked','true');
 console.log('AV-F2 B title='+await page.locator('#folderSheetTitle').innerText()+'; B follow=false -> true after A response; A requests='+followCalls);
 await page.screenshot({path:'/tmp/av1-follow-contamination.png',fullPage:true});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
```

## 담기·신고 화면 확인

```javascript
const root=process.cwd();
const {chromium,expect}=require(root+'/node_modules/@playwright/test');
const {mockApp,STATES}=require(root+'/test/e2e/support/mock-app');
const f=require(root+'/test/e2e/support/community-fixtures');
(async()=>{
 const browser=await chromium.launch(); const page=await browser.newPage({locale:'ko-KR'});
 let reports=0,clones=0;const folder=f.CURATION_HOME_FIXTURE.showcase[0];
 await mockApp(page,{...STATES.userData,me:f.COMMUNITY_PRO_ME,routes:f.communityRoutes({
  onClone:async(route,json)=>{clones++;return json(route,{categoryId:'av1-copy',imported:2,alreadyInLibrary:1,skippedLimit:0});},
  onReport:async(route,json)=>{reports++;console.log('report request '+JSON.stringify(route.request().postDataJSON()));return reports===1?json(route,{reportId:1},201):json(route,{ok:false,code:'ALREADY_REPORTED',message:'duplicate'},409);}
 })});
 await page.goto('http://127.0.0.1:3001/index.html');
 await page.locator(`[data-folder-id="${folder.id}"]`).first().click();
 await page.locator('#folderClone').click();
 await expect(page.locator('#folderSheet')).toContainText('2곡');
 console.log('clone calls='+clones+'; '+await page.locator('#folderSheet').innerText());
 console.log('report buttons='+await page.locator('#folderSheet button').evaluateAll(bs=>bs.map(b=>b.id+':'+b.innerText).join('|')));
 await page.locator('#folderReportBtn').click();
 await page.locator('#folderReportDetail').fill('광고 같아요');
 await page.locator('#folderReportSubmit').click();
 await expect(page.locator('#folderSheetOk')).toBeVisible();
 console.log('report 201: '+await page.locator('#folderSheetOk').innerText());
 await page.locator('#folderReportBtn').click();
 await page.locator('#folderReportSubmit').click();
 await expect(page.locator('#folderSheetAlert')).toBeVisible();
 console.log('report 409: '+await page.locator('#folderSheetAlert').innerText()+'; calls='+reports);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
```
