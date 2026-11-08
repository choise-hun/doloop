'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');
const { COMMUNITY_PRO_ME, FOLDER_SHOWCASE_1: A, FOLDER_FOLLOWING_1: B, communityRoutes } = require('./support/community-fixtures');

// 응답 본문 수신과 React 다음 paint까지 기다려 부재 단언을 응답 처리 뒤 수행한다.
async function settle(page, response) {
  await response.finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function open(page, folder) {
  await page.locator(`#discover [data-folder-id="${folder.id}"]`).click();
  await expect(page.locator('#folderSheetTitle')).toHaveText(folder.title);
  await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked', 'false');
}
async function act(page, action) {
  if (action === 'report') {
    await page.locator('#folderReportBtn').click();
    await page.locator('#folderReportDetail').fill('광고 같아요');
    await page.locator('#folderReportSubmit').click();
  } else await page.locator({ like: '#folderLike', follow: '#folderFollow', clone: '#folderClone' }[action]).click();
}
async function snapshot(page) {
  return page.locator('#discover').evaluate(el => ({
    text: el.innerText,
    switches: [...el.querySelectorAll('[role="switch"]')].map(x => [x.id, x.getAttribute('aria-checked')]),
    report: el.querySelector('#folderReportDetail')?.value,
  }));
}
for (const action of ['like', 'follow', 'clone', 'report']) {
  for (const outcome of ['success', 'failure']) {
    for (const transition of ['other-folder', 'reopen', 'account']) {
      test(`AV2 ${action} ${outcome} ${transition}: 이전 응답은 현재 시트·카드를 바꾸지 않음`, async ({ page }) => {
        let release, entered;
        const gate = new Promise(r => { release = r; });
        const requested = new Promise(r => { entered = r; });
        let calls = 0;
        const suffix = { like: '/like', follow: `/follows/${A.owner.id}`, clone: '/clone', report: '/reports' }[action];
        const success = { like: { liked: true, likeCount: 99 }, follow: { following: true, followerCount: 99 }, clone: { imported: 2, alreadyInLibrary: 1, skippedLimit: 0 }, report: { reportId: 1 } }[action];
        const handler = async (route, json) => {
          calls++; entered(); await gate;
          return json(route, outcome === 'success' ? success : { code: 'INTERNAL_ERROR' }, outcome === 'success' ? (action === 'report' ? 201 : 200) : 500);
        };
        await mockApp(page, { ...STATES.userData, me: COMMUNITY_PRO_ME, routes: communityRoutes({
          [{ like: 'onLike', follow: 'onFollow', clone: 'onClone', report: 'onReport' }[action]]: handler,
        }) });
        await page.goto('/index.html');
        await open(page, A);
        await act(page, action); await requested;
        // 진행 중 재클릭도 같은 요청을 보내지 않는다.
        if (action === 'report') await page.locator('#folderReportSubmit').click();
        else await page.locator({ like: '#folderLike', follow: '#folderFollow', clone: '#folderClone' }[action]).click();
        expect(calls).toBe(1);
        if (transition === 'account') {
          await page.evaluate(() => {
            // Keep the SDK token lookup consistent with the emitted auth event.
            window.ULAuth.getClient().auth.getSession = async () => ({ data: { session: null } });
            window.__supabaseAuthListener('SIGNED_OUT', null);
          });
          await expect(page.locator('#discover')).toHaveCount(0);
          const id = '00000000-0000-4000-8000-000000000099';
          await page.route('**/api/v1/me', route => route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id, email: 'b@example.com' } }));
          await page.evaluate(id => {
            const session = { access_token: 'b-token', user: { id, email: 'b@example.com' } };
            window.ULAuth.getClient().auth.getSession = async () => ({ data: { session } });
            window.__supabaseAuthListener('SIGNED_IN', session);
          }, id);
          await expect.poll(() => page.evaluate(() => window.ULAuth.getMe()?.id)).toBe(id);
          expect(await page.evaluate(async () => (await window.ULAuth.getClient().auth.getSession()).data.session.user.id)).toBe(id);
          await expect(page.locator('#discover')).toBeVisible();
        } else await page.locator('#folderClose').click();
        await open(page, transition === 'other-folder' ? B : A);
        // 신고 성공이 새 시트의 작성 중 폼을 닫아 버리는 경우도 단언한다.
        await page.locator('#folderReportBtn').click();
        await page.locator('#folderReportDetail').fill('현재 계정의 새 신고');
        const before = await snapshot(page);
        const response = page.waitForResponse(r => r.url().includes(suffix) && r.request().method() !== 'GET');
        release(); await settle(page, await response);
        expect(await snapshot(page)).toEqual(before);
        // 이전 요청 정리 뒤 현재 시트의 동일 작업이 다시 가능하다.
        if (action === 'report') await page.locator('#folderReportBtn').click();
        await act(page, action);
        await expect.poll(() => calls).toBe(2);
      });
    }
  }
}

for (const action of ['like', 'follow', 'clone', 'report']) {
  for (const outcome of ['success', 'failure']) {
    test(`AV2 현재 시트 ${action} ${outcome}: 정상 결과·오류 유지`, async ({ page }) => {
      const handler = (route, json) => json(route, outcome === 'failure' ? { code: 'INTERNAL_ERROR' } : {
        like: { liked: true, likeCount: 26 }, follow: { following: true, followerCount: 11 },
        clone: { imported: 2, alreadyInLibrary: 1, skippedLimit: 0 }, report: { reportId: 1 },
      }[action], outcome === 'failure' ? 500 : (action === 'report' ? 201 : 200));
      await mockApp(page, { ...STATES.userData, me: COMMUNITY_PRO_ME, routes: communityRoutes({
        [{ like: 'onLike', follow: 'onFollow', clone: 'onClone', report: 'onReport' }[action]]: handler,
      }) });
      await page.goto('/index.html'); await open(page, A); await act(page, action);
      if (outcome === 'failure') {
        await expect(page.locator('#folderSheetAlert')).toHaveText('요청을 처리하지 못했어요');
        await expect(page.locator('#folderLike')).toHaveAttribute('aria-checked', 'false');
        await expect(page.locator('#folderFollow')).toHaveAttribute('aria-checked', 'false');
      } else if (action === 'like' || action === 'follow') {
        await expect(page.locator(action === 'like' ? '#folderLike' : '#folderFollow')).toHaveAttribute('aria-checked', 'true');
      } else await expect(page.locator('#folderSheetOk')).toBeVisible();
    });
  }
}

for (const action of ['like', 'follow', 'clone', 'report']) {
  test(`AV2 ${action}: 이전 finally가 새 시트의 중복 요청 잠금을 해제하지 않음`, async ({ page }) => {
    const releases = [];
    let calls = 0;
    const handler = async (route, json) => {
      const index = calls++;
      await new Promise(r => { releases[index] = r; });
      return json(route, { liked: true, likeCount: 26, following: true, followerCount: 11, imported: 2, alreadyInLibrary: 0, skippedLimit: 0, reportId: 1 });
    };
    await mockApp(page, { ...STATES.userData, me: COMMUNITY_PRO_ME, routes: communityRoutes({
      [{ like: 'onLike', follow: 'onFollow', clone: 'onClone', report: 'onReport' }[action]]: handler,
    }) });
    await page.goto('/index.html'); await open(page, A);
    await act(page, action); await expect.poll(() => calls).toBe(1);
    await page.locator('#folderClose').click(); await open(page, A);
    if (action === 'report') await expect(page.locator('#folderReportDetail')).toHaveCount(0);
    await act(page, action); await expect.poll(() => calls).toBe(2);
    const response = page.waitForResponse(r => r.request().method() !== 'GET' && r.url().includes('/community/'));
    releases[0](); await settle(page, await response);
    if (action === 'report') await page.locator('#folderReportSubmit').click();
    else await page.locator({ like: '#folderLike', follow: '#folderFollow', clone: '#folderClone' }[action]).click();
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    expect(calls).toBe(2);
    const currentResponse = page.waitForResponse(r => r.request().method() !== 'GET' && r.url().includes('/community/'));
    releases[1](); await settle(page, await currentResponse);
    await expect(page.locator('#folderSheetAlert')).toHaveCount(0);
  });
}

for (const stage of ['folder', 'user']) {
  for (const outcome of ['success', 'failure']) {
    test(`AV2 ${stage} GET ${outcome}: 닫은 시트의 조회 응답 폐기`, async ({ page }) => {
      let release, calls = 0;
      const gate = new Promise(r => { release = r; });
      const handler = async (route, json) => {
        const id = new URL(route.request().url()).pathname.split('/').pop();
        const stale = id === (stage === 'folder' ? A.id : A.owner.id);
        if (stale) { calls++; await gate; }
        if (stale && outcome === 'failure') return json(route, { code: 'INTERNAL_ERROR' }, 500);
        return json(route, stage === 'folder' ? { folder: stale ? A : B, items: [] } : {
          ...B.owner, followerCount: 10, followingByMe: stale,
        });
      };
      await mockApp(page, { ...STATES.userData, me: COMMUNITY_PRO_ME, routes: communityRoutes({
        [stage === 'folder' ? 'onFolderDetail' : 'onUser']: handler,
      }) });
      await page.goto('/index.html');
      await page.locator(`#discover [data-folder-id="${A.id}"]`).click();
      await expect.poll(() => calls).toBe(1);
      await page.locator('#folderClose').click(); await open(page, B);
      const before = await snapshot(page);
      const response = page.waitForResponse(r => r.url().endsWith(stage === 'folder' ? A.id : A.owner.id));
      release(); await settle(page, await response);
      expect(await snapshot(page)).toEqual(before);
    });
  }
}
