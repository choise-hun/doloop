// test/e2e/community.spec.js
// M2-23 E2E 테스트 (CM-1 ~ CM-14): 홈 큐레이션 · 재생목록 가져오기 · TRAILS 커뮤니티 · 공유 설정 · 개인정보
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');
const {
  COMMUNITY_FREE_ME,
  COMMUNITY_PRO_ME,
  CURATION_HOME_FIXTURE,
  FOLDER_CURATED_1,
  FOLDER_CURATED_2,
  EPISODE_POST_1,
  PLAYLIST_PREVIEW_FIXTURE,
  communityRoutes,
  skipNameModal,
} = require('./support/community-fixtures');

test('CM-1 홈 줄: 순서 curated·monthly·showcase·following, 빈 줄 제외, 이달의 곡 href에 a=·b=', async ({ page }) => {
  const customCuration = {
    ...CURATION_HOME_FIXTURE,
    following: [], // 빈 줄은 렌더하지 않아야 함
  };
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({ curationHome: customCuration }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const rows = page.locator('#discover [data-row]');
  await expect(rows).toHaveCount(3);
  const rowKeys = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-row')));
  expect(rowKeys).toEqual(['curated', 'monthly', 'showcase']);

  const firstMonthlyLink = page.locator('#discover [data-row="monthly"] a').first();
  const href = await firstMonthlyLink.getAttribute('href');
  expect(href).toContain('practice.html?v=abcdefghij1');
  expect(href).toContain('a=38');
  expect(href).toContain('b=55');
  expect(href).toContain('r=0.75');
});

test('CM-2 홈 숨김: curation이 {}인 기존 userData 및 비로그인에서 #discover 없음·콘솔 에러 0', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await mockApp(page, STATES.userData);
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await page.locator('#weeklyStreakCard').waitFor();
  await expect(page.locator('#discover')).toHaveCount(0);

  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();
  await expect(page.locator('#discover')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('CM-3 시트·좋아요: 카드 클릭 → #folderLike 클릭 시 낙관적 +1 뒤 500 실패 시 원래 숫자로 복원 및 경고 표시', async ({ page }) => {
  let resolveLike;
  const likePromise = new Promise((r) => {
    resolveLike = r;
  });

  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      onLike: async (route, fulfillJson) => {
        await likePromise;
        return fulfillJson(route, { ok: false, code: 'INTERNAL_ERROR', message: 'error' }, 500);
      },
    }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator(`#discover [data-folder-id="${FOLDER_CURATED_1.id}"]`).click();
  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderLike')).toContainText('12');

  if (process.env.LAYOUT_SHOTS === '1') {
    const outDir = path.join(process.cwd(), 'test-results/layout-shots');
    fs.mkdirSync(outDir, { recursive: true });
    for (const w of [390, 768, 1150, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.screenshot({ path: path.join(outDir, `folder-sheet-${w}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  await page.locator('#folderLike').click();
  // 낙관적 +1 확인
  await expect(page.locator('#folderLike')).toContainText('13');

  // 500 응답 반환 후 원래 숫자(12)로 복원 및 경고 줄 표시
  resolveLike();
  await expect(page.locator('#folderLike')).toContainText('12');
  await expect(page.locator('#folderSheetAlert')).toHaveText('요청을 처리하지 못했어요');
});

test('CM-4 늦은 응답: 폴더 A 상세 지연 중 닫고 폴더 B를 열면 B 제목만 보임', async ({ page }) => {
  let resolveFolderA;
  const folderAPromise = new Promise((r) => {
    resolveFolderA = r;
  });

  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      onFolderDetail: async (route, fulfillJson) => {
        const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[5]);
        if (id === FOLDER_CURATED_1.id) {
          await folderAPromise;
          return fulfillJson(route, { folder: FOLDER_CURATED_1, items: [] });
        }
        return fulfillJson(route, { folder: FOLDER_CURATED_2, items: [] });
      },
    }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator(`#discover [data-folder-id="${FOLDER_CURATED_1.id}"]`).click();
  await expect(page.locator('#folderSheet')).toBeVisible();
  await page.locator('#folderClose').click();
  await expect(page.locator('#folderSheet')).toHaveCount(0);

  await page.locator(`#discover [data-folder-id="${FOLDER_CURATED_2.id}"]`).click();
  await expect(page.locator('#folderSheetTitle')).toHaveText(FOLDER_CURATED_2.title);

  // 뒤늦게 폴더 A 응답 도착해도 B가 유지되어야 함
  resolveFolderA();
  await expect(page.locator('#folderSheetTitle')).toHaveText(FOLDER_CURATED_2.title);
});

test('CM-5 무료 담기: 무료 계정에서 #folderClone 클릭 시 서버 호출 0건 및 업그레이드 문구 표시', async ({ page }) => {
  let cloneCalls = 0;
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      onClone: async (route, fulfillJson) => {
        cloneCalls += 1;
        return fulfillJson(route, {});
      },
    }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator(`#discover [data-folder-id="${FOLDER_CURATED_1.id}"]`).click();
  await expect(page.locator('#folderClone')).toBeVisible();
  await page.locator('#folderClone').click();

  await expect(page.locator('#folderSheetAlert')).toHaveText('Pro로 업그레이드하면 쓸 수 있어요');
  expect(cloneCalls).toBe(0);
});

test('CM-6 가져오기(홈): watch?v=x&list=PL1 입력 → #goImport → 새 분류 → 가져오기 POST 본문 및 결과 줄 검증', async ({ page }) => {
  let postedBody = null;
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      onImport: async (route, fulfillJson) => {
        postedBody = route.request().postDataJSON();
        return fulfillJson(route, {
          categoryId: 'cat-new',
          categoryCreated: true,
          playlistTitle: '네오소울 입문 플레이리스트 모음집 2026',
          imported: 4,
          alreadyInLibrary: 1,
          skippedLimit: 2,
          skippedUnavailable: 1,
        });
      },
    }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const plUrl = 'https://www.youtube.com/watch?v=abcdefghij1&list=PL1';
  await page.locator('#goUrl').fill(plUrl);
  await expect(page.locator('#goImport')).toBeVisible();
  await page.locator('#goImport').click();

  await expect(page.locator('#playlistImportModal')).toBeVisible();
  await expect(page.locator('#playlistSummary')).toContainText('5곡');
  await expect(page.locator('#playlistFreeNotice')).toContainText('Free 플랜 사용자는 10곡 이상 가져올 수 없습니다');

  if (process.env.LAYOUT_SHOTS === '1') {
    const outDir = path.join(process.cwd(), 'test-results/layout-shots');
    fs.mkdirSync(outDir, { recursive: true });
    for (const w of [1280, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.screenshot({ path: path.join(outDir, `playlist-modal-${w}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  await page.locator('#playlistCatName').fill('내 새 분류');
  await page.locator('#playlistSubmit').click();

  await expect(page.locator('#playlistDoneMsg')).toHaveText(
    '4곡을 가져왔어요 · 이미 있던 곡 1 · 한도로 건너뜀 2 · 볼 수 없는 영상 1',
  );
  expect(postedBody).toEqual({
    url: plUrl,
    newCategory: true,
    categoryName: '내 새 분류',
  });
});

test('CM-7 분류 칸 없음: remainingCategorySlots:0이면 새 분류 라디오 disabled + 업그레이드 안내', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      preview: {
        ...PLAYLIST_PREVIEW_FIXTURE,
        remainingCategorySlots: 0,
      },
    }),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#goUrl').fill('https://www.youtube.com/playlist?list=PL1');
  await page.locator('#goImport').click();

  await expect(page.locator('#playlistChoiceNew')).toBeDisabled();
  await expect(page.locator('#playlistCatSlotNotice')).toHaveText(
    '분류 칸이 없어요. 더 많은 분류 칸을 쓰려면 업그레이드해 주세요',
  );
});

test('CM-8 PLAY 가져오기: 연습 화면 #urlForm에 list URL 제출 → 이 곡만 열기 클릭 시 모달 닫히고 곡 열림(가져오기 POST 0)', async ({ page }) => {
  let importPostCount = 0;
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes({
      onImport: async (route, fulfillJson) => {
        importPostCount += 1;
        return fulfillJson(route, {});
      },
    }),
  });
  await page.goto('/practice.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#urlInput').fill('https://www.youtube.com/watch?v=abcdefghij1&list=PL1');
  await page.locator('#urlForm button[type="submit"]').click();

  await expect(page.locator('#playlistImportModal')).toBeVisible();
  await page.locator('#playlistOnlyThis').click();

  await expect(page.locator('#playlistImportModal')).toHaveCount(0);
  await expect(page.locator('#songTitle')).toContainText('1 ·');
  expect(importPostCount).toBe(0);
});

test('CM-9 TRAILS LOG: /community.html#summary → 84일 집계 탭 → 팔로잉 선택 시 logs?scope=following 호출 및 카드 표시', async ({ page }) => {
  const scopesCalled = [];
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes({
      onLogs: async (route, fulfillJson) => {
        const u = new URL(route.request().url());
        const sc = u.searchParams.get('scope') || 'all';
        scopesCalled.push(sc);
        return fulfillJson(route, {
          logs: [
            {
              user: {
                id: '00000000-0000-4000-8000-000000000003',
                publicName: '박블루스',
                isCreator: false,
                creatorBadge: null,
              },
              days: [{ date: '2026-11-06', seconds: 900 }],
              streakDays: 5,
              thisWeekSeconds: 1800,
              today: [],
            },
          ],
          next: null,
        });
      },
    }),
  });
  await page.goto('/community.html#summary', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#summaryPane')).toBeVisible();
  await expect(page.locator('#logScopeAll')).toBeVisible();

  await page.locator('#logScopeFollowing').click();
  await expect(page.locator('#summaryPane')).toContainText('박블루스');
  await expect(page.locator('#summaryPane')).toContainText('연속 5일');
  expect(scopesCalled).toContain('following');
});

test('CM-10 이름: 이름 없는 상태에서 이름 모달 폼에 공백 이름 입력 시 요청 0 + 형식 문구, 중복 이름 409 시 중복 문구', async ({ page }) => {
  let nameCalls = 0;
  await mockApp(page, {
    ...STATES.userData,
    me: { ...COMMUNITY_PRO_ME, publicName: null, publicNameNextChangeAt: null },
    routes: communityRoutes({
      onSetPublicName: async (route, fulfillJson) => {
        nameCalls += 1;
        return fulfillJson(
          route,
          { ok: false, code: 'PUBLIC_NAME_TAKEN', message: 'Already taken' },
          409,
        );
      },
    }),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const banner = page.locator('#communityNameModal');
  await expect(banner).toBeVisible();

  await page.locator('#communityNameModalInput').fill('존 메이어');
  await page.locator('#communityNameModalSave').click();
  await expect(banner.locator('[role="alert"]')).toHaveText('2~20자, 띄어쓰기 없이 입력해 주세요');
  expect(nameCalls).toBe(0);

  await page.locator('#communityNameModalInput').fill('존메이어');
  await page.locator('#communityNameModalSave').click();
  await expect(banner.locator('[role="alert"]')).toHaveText('이미 쓰는 이름이에요');
  expect(nameCalls).toBe(1);
});

test('CM-11 내 공유: Pro·이름 있음, 분류 2개 중 하나 공개 PUT 본문 {isPublic:true,title}, 자동 연동 409 OFF 시 스위치 되돌림 및 안내', async ({ page }) => {
  const putBodies = [];
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes({
      onSetShare: async (route, fulfillJson, catId) => {
        const body = route.request().postDataJSON();
        putBodies.push({ catId, body });
        if (body.autoSync === true) {
          return fulfillJson(
            route,
            { ok: false, code: 'SHARE_AUTOSYNC_OFF', message: 'Autosync is off' },
            409,
          );
        }
        return fulfillJson(route, {
          share: {
            folderId: 'f-cat-2',
            categoryId: catId,
            title: body.title || '블루스',
            isPublic: true,
            autoSync: false,
            hidden: false,
            itemCount: 2,
            likeCount: 0,
            cloneCount: 0,
            publishedAt: '2026-11-06T00:00:00Z',
            publicName: '네오소울러',
          },
        });
      },
    }),
  });
  await page.goto('/community.html#my-shares', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const pubSwitch = page.locator('[data-share-public="cat-2"]');
  const autoSwitch = page.locator('[data-share-autosync="cat-2"]');
  await expect(pubSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(autoSwitch).toBeDisabled();
  expect(putBodies).toHaveLength(0);

  await pubSwitch.click();
  await expect(pubSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(autoSwitch).toBeEnabled();
  expect(putBodies[0]).toEqual({
    catId: 'cat-2',
    body: { isPublic: true, title: '블루스' },
  });

  await autoSwitch.click();
  await expect(autoSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#mySharesErr')).toHaveText(
    "설정에서 '연습 리스트 공유 자동 연동'을 먼저 켜 주세요",
  );
});

test('CM-12 설정: 무료는 두 스위치 disabled, Pro에서 shareAutosync 켜기 PATCH 500 실패 시 꺼짐으로 되돌림', async ({ page }) => {
  await mockApp(page, {
    ...STATES.user,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes(),
  });
  await page.goto('/settings.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#community > details > summary').click();
  await expect(page.locator('#commAutosync')).toBeDisabled();
  await expect(page.locator('#commPracticeLog')).toBeDisabled();
  await expect(page.locator('#commProNotice')).toHaveText('Pro 기능이에요');

  await mockApp(page, {
    ...STATES.user,
    me: { ...COMMUNITY_PRO_ME, shareAutosync: false },
    routes: [
      ...communityRoutes(),
      [
        (url) => url.pathname === '/api/v1/me',
        async (route) => {
          if (route.request().method() === 'PATCH') {
            return route.fulfill({
              status: 500,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', message: 'fail' }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              ...STATES.user.me,
              id: '00000000-0000-4000-8000-000000000001',
              email: 'a@example.com',
              ...COMMUNITY_PRO_ME,
              shareAutosync: false,
            }),
          });
        },
      ],
    ],
  });
  await page.goto('/settings.html', { waitUntil: 'load' });
  await page.locator('#community > details > summary').click();
  await expect(page.locator('#commAutosync')).toBeEnabled();
  await expect(page.locator('#commAutosync')).toHaveAttribute('aria-checked', 'false');

  await page.locator('#commAutosync').click();
  await expect(page.locator('#commAutosync')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#commErrMsg')).toHaveText('요청을 처리하지 못했어요');
});

test('CM-13 계정 전환: 사용자 A 줄·시트 표시 후 로그아웃 시 줄과 시트가 즉시 사라짐', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes(),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#discover')).toBeVisible();
  await page.locator(`#discover [data-folder-id="${FOLDER_CURATED_1.id}"]`).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  // Supabase auth listener로 로그아웃 이벤트 전달
  await page.evaluate(() => {
    if (typeof window.__supabaseAuthListener === 'function') {
      window.__supabaseAuthListener('SIGNED_OUT', null);
    }
  });

  await expect(page.locator('#folderSheet')).toHaveCount(0);
  await expect(page.locator('#discover')).toHaveCount(0);
});

test('CM-14 개인정보: /privacy.html에 #privH5(5. 커뮤니티 공개 범위)와 7개 항목이 있음', async ({ page }) => {
  await mockApp(page, STATES.guest);
  await page.goto('/privacy.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const h5 = page.locator('#privH5');
  await expect(h5).toHaveText('5. 커뮤니티 공개 범위');
  const section = page.locator('section[aria-labelledby="privH5"]');
  await expect(section.locator('ul > li')).toHaveCount(7);
});

// CMR-2: 이름 모달·공유 가드 (명세 개발산출물/명세/CMR-2_구현명세.md §8)
const NO_NAME_ME = { ...COMMUNITY_PRO_ME, publicName: null, publicNameNextChangeAt: null };

test('CMR2-1 소개·CTA: Pro·이름 있음, 1280/390에서 소개 문구·CTA·힌트 표시, 모달 0, 탭보다 앞', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes(),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityIntroDesc')).toHaveText('서로의 연습 기록을 보고, 나의 성장을 공유하세요');
  const cta = page.locator('#communityShareCta');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', /log\.html$/);
  await expect(cta).toHaveText('내 연습 공유하기');
  await expect(page.locator('#communityShareHint')).toHaveText('연습 세션을 선택한 뒤 공유할 수 있어요');
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  const isBeforeTabs = await page.evaluate(() => {
    const intro = document.getElementById('communityIntro');
    const tabs = document.querySelector('[role="tablist"]');
    return Boolean(intro && tabs && (intro.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(isBeforeTabs).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#communityIntroDesc')).toBeVisible();
  await expect(cta).toBeVisible();
});

test('CMR2-2 guest: 설명 표시, CTA 0, 로그인 링크, 인증 API 호출 0, 모달 0', async ({ page }) => {
  const authCalls = [];
  page.on('request', (req) => {
    const p = new URL(req.url()).pathname;
    if (p.startsWith('/api/v1/community') || p.startsWith('/api/v1/curation')) {
      authCalls.push(p);
    }
  });
  await mockApp(page, { ...STATES.guest, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityIntroDesc')).toBeVisible();
  await expect(page.locator('#communityShareCta')).toHaveCount(0);
  await expect(page.locator('#communityGuest a[href="settings.html#account"]')).toBeVisible();
  expect(authCalls).toEqual([]);
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
});

test('CMR2-3 me 로딩: /api/v1/me 보류 시 loading+설명 표시, CTA 0, 모달 0, 해제 후 정상', async ({ page }) => {
  let releaseMe;
  const meHold = new Promise((resolve) => { releaseMe = resolve; });
  await mockApp(page, {
    ...STATES.user,
    routes: [
      [
        (url) => url.pathname === '/api/v1/me',
        async (route) => {
          await meHold;
          return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              ...STATES.userData.me,
              id: '00000000-0000-4000-8000-000000000001',
              ...COMMUNITY_PRO_ME,
            }),
          });
        },
      ],
      ...communityRoutes(),
    ],
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityLoading')).toBeVisible();
  await expect(page.locator('#communityIntroDesc')).toBeVisible();
  await expect(page.locator('#communityShareCta')).toHaveCount(0);
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  releaseMe();
  await expect(page.locator('#chipAll')).toBeVisible();
  await expect(page.locator('#communityLoading')).toHaveCount(0);
});

test('CMR2-4 첫 진입 모달: 이름 없으면 모달 자동 열림·입력 focus·배너 0·사유 0·body 스크롤 잠금', async ({ page }) => {
  await mockApp(page, { ...STATES.userData, me: NO_NAME_ME, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const modal = page.locator('#communityNameModal');
  await expect(modal).toHaveCount(1);
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#communityNameModalInput')).toBeFocused();
  await expect(page.locator('#communityNameModalReason')).toHaveCount(0);
  await expect(page.locator('#communityNameBanner')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
});

test('CMR2-5 건너뛰기 기억: 닫기·ESC·나중에·배경 클릭 모두 skip 기억, overflow 원복, 새로고침 후 모달 0', async ({ page }) => {
  await mockApp(page, { ...STATES.userData, me: NO_NAME_ME, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 1) 나중에 (#communityNameModalSkip)
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.locator('#communityNameModalSkip').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  // 2) ESC
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  // 3) 닫기 버튼 (#communityNameModalClose)
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.locator('#communityNameModalClose').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  // 4) 배경 클릭
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.locator('#communityNameModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
});

test('CMR2-6 공유 가드: 건너뛴 뒤 CTA 클릭 시 share 모달·URL 유지·이름/공유 요청 0', async ({ page }) => {
  const calls = [];
  page.on('request', (req) => {
    const p = new URL(req.url()).pathname;
    if (req.method() !== 'GET' && (p.includes('/public-name') || p.includes('/share') || p.includes('/episode'))) calls.push(`${req.method()} ${p}`);
  });
  await mockApp(page, { ...STATES.userData, me: NO_NAME_ME, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#communityNameModalSkip').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  const cta = page.locator('#communityShareCta');
  await expect(cta).toHaveAttribute('href', /log\.html$/);
  await cta.click();
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await expect(page.locator('#communityNameModalReason')).toBeVisible();
  await expect(page).toHaveURL(/community\.html/);
  expect(calls).toEqual([]);
});

test('CMR2-7 저장 후 이동: 공유 모달에서 이름 저장 성공 시 log.html 1회 이동 및 PUT 1회', async ({ page }) => {
  let putCalls = 0;
  let currentMe = { ...NO_NAME_ME };
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: [
      [
        (url) => url.pathname === '/api/v1/me',
        async (route) => {
          if (route.request().method() === 'GET') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({
                ...STATES.userData.me,
                id: '00000000-0000-4000-8000-000000000001',
                ...currentMe,
              }),
            });
          }
          return route.continue();
        },
      ],
      ...communityRoutes({
        onSetPublicName: async (route, fulfillJson) => {
          putCalls += 1;
          currentMe = { ...currentMe, publicName: '새이름' };
          return fulfillJson(route, { ok: true, publicName: '새이름' }, 200);
        },
      }),
    ],
  });
  await skipNameModal(page);
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#communityShareCta').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await expect(page.locator('#communityNameModalReason')).toBeVisible();

  await page.locator('#communityNameModalInput').fill('새이름');
  await Promise.all([
    page.waitForURL(/log\.html/),
    page.locator('#communityNameModalSave').click(),
  ]);
  expect(putCalls).toBe(1);
});

test('CMR2-8 저장 실패: PUT 409 시 모달·입력값 유지, 경고 문구 표시, 이동 0', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: communityRoutes({
      onSetPublicName: async (route, fulfillJson) => {
        return fulfillJson(route, { ok: false, code: 'PUBLIC_NAME_TAKEN', message: 'Already taken' }, 409);
      },
    }),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#communityNameModalInput').fill('존메이어');
  await page.locator('#communityNameModalSave').click();

  const modal = page.locator('#communityNameModal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#communityNameModalInput')).toHaveValue('존메이어');
  await expect(modal.locator('[role="alert"]')).toHaveText('이미 쓰는 이름이에요');
  await expect(page).toHaveURL(/community\.html/);
});

test('CMR2-9 저장 중 잠금: PUT 응답 보류 중 Skip·Close disabled, ESC 무시, 중복 클릭 시 PUT 1회 유지', async ({ page }) => {
  let releasePut;
  const putHold = new Promise((resolve) => { releasePut = resolve; });
  let putCount = 0;

  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: communityRoutes({
      onSetPublicName: async (route, fulfillJson) => {
        putCount += 1;
        await putHold;
        return fulfillJson(route, { ok: true, publicName: '새이름' }, 200);
      },
    }),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#communityNameModalInput').fill('새이름');
  await page.locator('#communityNameModalSave').click();

  await expect(page.locator('#communityNameModalSkip')).toBeDisabled();
  await expect(page.locator('#communityNameModalClose')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#communityNameModal')).toBeVisible();

  // 저장 버튼 재클릭 시도
  await page.locator('#communityNameModalSave').click({ force: true }).catch(() => {});
  expect(putCount).toBe(1);

  releasePut();
});

test('CMR2-10 포커스 트랩: 마지막 요소에서 Tab 시 첫 요소, 첫 요소에서 Shift+Tab 시 마지막 요소', async ({ page }) => {
  await mockApp(page, { ...STATES.userData, me: NO_NAME_ME, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const input = page.locator('#communityNameModalInput');
  const close = page.locator('#communityNameModalClose');
  await expect(input).toBeFocused();

  // 첫 요소에서 Shift+Tab -> 마지막 요소(Close 버튼)
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();

  // 마지막 요소에서 Tab -> 첫 요소(Input)
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
});

test('CMR2-11 storage 실패: sessionStorage 예외 시에도 모달·건너뛰기 정상 동작, console 에러 0, 새로고침 시 다시 열림', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
    Storage.prototype.getItem = () => { throw new Error('storage disabled'); };
  });

  await mockApp(page, { ...STATES.userData, me: NO_NAME_ME, routes: communityRoutes() });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.locator('#communityNameModalSkip').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(errors).toEqual([]);

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
});

test('CMR2-12 계정별 skip: 사용자 A skip 기록이 사용자 B에게 영향 없음', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: { ...NO_NAME_ME, id: '00000000-0000-4000-8000-000000000001' },
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'a@example.com' },
    routes: communityRoutes(),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await page.locator('#communityNameModalSkip').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);

  // 사용자 B (이름 없음)로 전환
  await mockApp(page, {
    ...STATES.userData,
    me: { ...NO_NAME_ME, id: '00000000-0000-4000-8000-000000000002' },
    user: { id: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' },
    routes: communityRoutes(),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
});

test('CMR2-13 내 공유 가드: 이름 없음·skip 후 공개 스위치 클릭 시 share 모달 열림, PUT 0, 스위치 복귀 및 focus 복귀', async ({ page }) => {
  const shareCalls = [];
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: communityRoutes({
      onSetShare: async (route, fulfillJson, catId) => {
        shareCalls.push(catId);
        return fulfillJson(route, { share: { isPublic: true } });
      },
    }),
  });
  await skipNameModal(page);
  await page.goto('/community.html#my-shares', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const pubSwitch = page.locator('[data-share-public="cat-2"]');
  await expect(pubSwitch).toHaveAttribute('aria-checked', 'false');

  await pubSwitch.click();
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await expect(page.locator('#communityNameModalReason')).toBeVisible();
  expect(shareCalls).toEqual([]);
  await expect(pubSwitch).toHaveAttribute('aria-checked', 'false');

  await page.locator('#communityNameModalClose').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  await expect(pubSwitch).toBeFocused();
});

test('CMR2-14 저장 후 재실행 없음: 이름 저장 성공 후 모달 닫힘·share PUT 0(자동 게시 없음), 다시 클릭 시 PUT 1', async ({ page }) => {
  const shareCalls = [];
  let currentMe = { ...NO_NAME_ME };
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: [
      [
        (url) => url.pathname === '/api/v1/me',
        async (route) => {
          if (route.request().method() === 'GET') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({
                ...STATES.userData.me,
                id: '00000000-0000-4000-8000-000000000001',
                ...currentMe,
              }),
            });
          }
          return route.continue();
        },
      ],
      ...communityRoutes({
        onSetPublicName: async (route, fulfillJson) => {
          currentMe = { ...currentMe, publicName: '기타장인' };
          return fulfillJson(route, { ok: true, publicName: '기타장인' }, 200);
        },
        onSetShare: async (route, fulfillJson, catId) => {
          shareCalls.push(catId);
          return fulfillJson(route, {
            share: {
              folderId: 'f-cat-2',
              categoryId: catId,
              title: '블루스',
              isPublic: true,
              autoSync: false,
              hidden: false,
              itemCount: 2,
              likeCount: 0,
              cloneCount: 0,
              publishedAt: '2026-11-06T00:00:00Z',
              publicName: '기타장인',
            },
          });
        },
      }),
    ],
  });
  await skipNameModal(page);
  await page.goto('/community.html#my-shares', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const pubSwitch = page.locator('[data-share-public="cat-2"]');
  await pubSwitch.click();
  await expect(page.locator('#communityNameModal')).toHaveCount(1);

  await page.locator('#communityNameModalInput').fill('기타장인');
  await page.locator('#communityNameModalSave').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  expect(shareCalls).toEqual([]); // 자동 게시/재실행 없음

  await pubSwitch.click();
  await expect(pubSwitch).toHaveAttribute('aria-checked', 'true');
  expect(shareCalls).toEqual(['cat-2']);
});

test('CMR2-15 서버 409 대응: 클라이언트 통과 후 서버 PUBLIC_NAME_REQUIRED 시 스위치 원복 + share 모달 열림', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes({
      onSetShare: async (route, fulfillJson) => {
        return fulfillJson(route, { ok: false, code: 'PUBLIC_NAME_REQUIRED', message: 'Name required' }, 409);
      },
    }),
  });
  await page.goto('/community.html#my-shares', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const pubSwitch = page.locator('[data-share-public="cat-2"]');
  await pubSwitch.click();

  await expect(pubSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#communityNameModal')).toHaveCount(1);
  await expect(page.locator('#communityNameModalReason')).toBeVisible();
});

test('CMR2-16 빈 상태 단계: 전체 빈 상태에서 3단계 li 순서·문구, CTA href, 가짜 카드 0', async ({ page }) => {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes({
      curationHome: { curated: [], monthlyPick: null, showcase: [], following: [] },
      onEpisodeLogs: (r, json) => json(r, { posts: [], next: null }),
    }),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const empty = page.locator('#communityAllEmpty');
  await expect(empty).toBeVisible();

  const steps = page.locator('#communityEmptySteps li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveText('TRAILS에서 공유할 연습 세션을 골라요');
  await expect(steps.nth(1)).toHaveText('공개되는 내용을 확인해요');
  await expect(steps.nth(2)).toHaveText('동의한 뒤 공유해요');

  const emptyCta = page.locator('#communityEmptyShareCta');
  await expect(emptyCta).toBeVisible();
  await expect(emptyCta).toHaveAttribute('href', /log\.html$/);
  await expect(emptyCta).toHaveText('내 연습 공유하기');

  await expect(page.locator('[data-folder-id]')).toHaveCount(0);
  await expect(page.locator('[data-post-id]')).toHaveCount(0);
});

test('CMR2-17 프로필 보존: 프로필 화면에서 이름 없어도 공유 스위치 클릭 시 기존대로 PUT 발생, 커뮤니티 모달 0', async ({ page }) => {
  const shareCalls = [];
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: communityRoutes({
      onSetShare: async (route, fulfillJson, catId) => {
        shareCalls.push(catId);
        return fulfillJson(route, { share: { isPublic: true } });
      },
    }),
  });
  await page.goto('/profile.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const pubSwitch = page.locator('#mySharesPanel [data-share-public="cat-2"]');
  await pubSwitch.click();

  expect(shareCalls).toEqual(['cat-2']);
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
});

// ---- CMR-3: 단일 표지·빠른 추가·상세 화면 (명세 CMR-3 §9, 시니어 핵심 표적) ----
const { MONTHLY_ITEMS } = require('./support/community-fixtures');
const CMR3_CURATED = `[data-row="curated"] [data-folder-id="${FOLDER_CURATED_1.id}"]`;

async function openCommunityPro(page, curationHome) {
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes(curationHome ? { curationHome } : {}),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator(CMR3_CURATED)).toBeVisible();
}

async function touchEvent(locator, type) {
  const box = await locator.boundingBox();
  await locator.dispatchEvent(type, {
    pointerType: 'touch', isPrimary: true, pointerId: 1,
    clientX: box.x + box.width / 2, clientY: box.y + box.height / 3,
  });
}

async function captureSongPost(page, status, body) {
  const posts = [];
  await page.route((url) => url.pathname === '/api/v1/songs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return posts;
}

test('CMR3-1 단일 표지: coverVideoIds 4개여도 모자이크 0, 표지 img 1개(coverVideoId 우선, 없으면 첫 ID)', async ({ page }) => {
  const withCover = { ...FOLDER_CURATED_2, coverVideoId: 'abcdefghij9' };
  await openCommunityPro(page, { ...CURATION_HOME_FIXTURE, curated: [FOLDER_CURATED_1, withCover] });

  await expect(page.locator('[class*="coverMosaic"]')).toHaveCount(0);
  const imgs = page.locator(`${CMR3_CURATED} [class*="cardCoverWrap"] img`);
  await expect(imgs).toHaveCount(1);
  await expect(imgs).toHaveAttribute('src', /abcdefghij1/);
  const second = page.locator(`[data-row="curated"] [data-folder-id="${withCover.id}"] [class*="cardCoverWrap"] img`);
  await expect(second).toHaveAttribute('src', /abcdefghij9/);
});

test('CMR3-2 빈 표지: coverVideoId null·coverVideoIds 빈 배열이면 .coverEmpty(배경 --ink 계산값) 안에 .coverLabel(제목, aria-hidden)', async ({ page }) => {
  const emptyCover = { ...FOLDER_CURATED_1, id: 'empty-1', coverVideoId: null, coverVideoIds: [], title: '빈 표지 폴더', titleI18n: { ko: '빈 표지 폴더' } };
  await openCommunityPro(page, { ...CURATION_HOME_FIXTURE, curated: [FOLDER_CURATED_1, emptyCover] });

  const card = page.locator(`[data-row="curated"] [data-folder-id="${emptyCover.id}"]`);
  const emptyDiv = card.locator('[class*="coverEmpty"]');
  await expect(emptyDiv).toHaveCount(1);
  await expect(emptyDiv).toHaveAttribute('aria-hidden', 'true');
  const label = emptyDiv.locator('[class*="coverLabel"]');
  await expect(label).toHaveText('빈 표지 폴더');

  const isMatch = await page.evaluate(() => {
    const el = document.querySelector('[class*="coverEmpty"]');
    if (!el) return false;
    const tester = document.createElement('div');
    tester.style.color = 'var(--ink)';
    document.body.appendChild(tester);
    const inkColor = getComputedStyle(tester).color;
    tester.remove();
    return getComputedStyle(el).backgroundColor === inkColor;
  });
  expect(isMatch).toBe(true);
});

test('CMR3-3 홈 보존: #discover 카드에 셸·빠른 추가 0, 표지 단일', async ({ page }) => {
  await mockApp(page, { ...STATES.userData, me: COMMUNITY_PRO_ME, routes: communityRoutes() });
  await page.goto('/index.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#discover')).toBeVisible();
  await expect(page.locator('#discover [class*="cardShell"]')).toHaveCount(0);
  await expect(page.locator('#discover [data-quick-add]')).toHaveCount(0);
  await expect(page.locator('#discover [class*="coverMosaic"]')).toHaveCount(0);
});

test('CMR3-4 + 노출: 1280 hover 시 opacity 1, 클릭하면 빠른 추가 시트만 열림', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  const plus = page.locator(CMR3_CURATED).locator('xpath=..').locator('[data-quick-add]');
  await page.locator(CMR3_CURATED).hover();
  await expect.poll(() => plus.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await plus.click();
  await expect(page.locator('#quickAddSheet')).toBeVisible();
  await expect(page.locator('#folderSheet')).toHaveCount(0);
  await expect(page.locator('#quickAddClone')).toBeVisible();
  await expect(page.locator('#quickAddTitle')).toBeFocused();
});

test.describe('CMR-3 터치', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('CMR3-5 + 숨김: hasTouch+isMobile 390에서 [data-quick-add] display:none', async ({ page }) => {
    await openCommunityPro(page);
    const card = page.locator(CMR3_CURATED);
    const plus = card.locator('xpath=..').locator('[data-quick-add]');
    await expect(plus).toHaveCSS('display', 'none');
  });

  test('CMR3-6 꾹 누르기: 500ms 유지 시 빠른 추가 시트, 뒤따른 click으로 상세 0', async ({ page }) => {
    await page.clock.install();
    await openCommunityPro(page);
    const card = page.locator(CMR3_CURATED);
    await expect(card.locator('xpath=..').locator('[data-quick-add]')).toBeHidden();
    await touchEvent(card, 'pointerdown');
    await page.clock.runFor(500);
    await touchEvent(card, 'pointerup');
    await card.dispatchEvent('click');
    await expect(page.locator('#quickAddSheet')).toBeVisible();
    await expect(page.locator('#folderSheet')).toHaveCount(0);
  });

  test('CMR3-7 꾹 누르기 취소: pointermove 20px 후에는 600ms 지나도 시트 0, 이후 click은 본체 실행', async ({ page }) => {
    await page.clock.install();
    await openCommunityPro(page);
    const card = page.locator(CMR3_CURATED);
    const box = await card.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 3;

    await card.dispatchEvent('pointerdown', {
      pointerType: 'touch', isPrimary: true, pointerId: 1,
      clientX: startX, clientY: startY,
    });
    await card.dispatchEvent('pointermove', {
      pointerType: 'touch', isPrimary: true, pointerId: 1,
      clientX: startX + 20, clientY: startY,
    });
    await page.clock.runFor(600);
    await card.dispatchEvent('pointerup', {
      pointerType: 'touch', isPrimary: true, pointerId: 1,
      clientX: startX + 20, clientY: startY,
    });

    await expect(page.locator('#quickAddSheet')).toHaveCount(0);
    await card.dispatchEvent('click');
    await expect(page.locator('#folderSheet')).toBeVisible();
  });

  test('CMR3-8 짧은 탭: 200ms 뒤 손 떼고 click하면 시트 0, 상세 열림', async ({ page }) => {
    await page.clock.install();
    await openCommunityPro(page);
    const card = page.locator(CMR3_CURATED);
    await touchEvent(card, 'pointerdown');
    await page.clock.runFor(200);
    await touchEvent(card, 'pointerup');
    await card.dispatchEvent('click');
    await page.clock.runFor(600);
    await expect(page.locator('#folderSheet')).toBeVisible();
    await expect(page.locator('#quickAddSheet')).toHaveCount(0);
  });
});

test('CMR3-9 곡 추가 a/b: 이달의 곡 + → 추가 시 본문에 rate·a·b, 성공 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  const posts = await captureSongPost(page, 201, { song: { id: 's-1', videoId: MONTHLY_ITEMS[0].videoId } });
  const song = page.locator(`[data-row="monthly"] [data-video-id="${MONTHLY_ITEMS[0].videoId}"]`);
  await song.hover();
  await song.locator('xpath=..').locator('[data-quick-add]').click();
  await page.locator('#quickAddSong').click();
  await expect(page.locator('#quickAddStatus')).toHaveText('내 곡 리스트에 있어요');
  expect(posts).toEqual([{
    videoId: MONTHLY_ITEMS[0].videoId, title: MONTHLY_ITEMS[0].title, artist: 'John Mayer', rate: 0.75, a: 38, b: 55,
  }]);
});

test('CMR3-10 멱등: POST 200(기존 곡)에도 내 곡 리스트에 있어요 성공 문구 표시', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  const posts = await captureSongPost(page, 200, { song: { id: 's-existing', videoId: MONTHLY_ITEMS[0].videoId } });
  const song = page.locator(`[data-row="monthly"] [data-video-id="${MONTHLY_ITEMS[0].videoId}"]`);
  await song.hover();
  await song.locator('xpath=..').locator('[data-quick-add]').click();
  await page.locator('#quickAddSong').click();
  await expect(page.locator('#quickAddStatus')).toHaveText('내 곡 리스트에 있어요');
  expect(posts).toHaveLength(1);
});

test('CMR3-11 a≥b·범위 밖: a·b·rate 키 없이 전송', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const bad = { ...MONTHLY_ITEMS[0], a: 60, b: 30, rate: 3 };
  await openCommunityPro(page, {
    ...CURATION_HOME_FIXTURE,
    monthlyPick: { ...CURATION_HOME_FIXTURE.monthlyPick, items: [bad] },
  });
  const posts = await captureSongPost(page, 200, { song: { id: 's-1', videoId: bad.videoId } });
  const song = page.locator(`[data-row="monthly"] [data-video-id="${bad.videoId}"]`);
  await song.hover();
  await song.locator('xpath=..').locator('[data-quick-add]').click();
  await page.locator('#quickAddSong').click();
  await expect(page.locator('#quickAddStatus')).toHaveText('내 곡 리스트에 있어요');
  expect(posts).toHaveLength(1);
  expect(Object.keys(posts[0]).sort()).toEqual(['artist', 'title', 'videoId']);
});

test('CMR3-12 곡 한도: POST 403 SONG_LIMIT_EXCEEDED 시 #quickAddAlert에 한도 문구, 성공 문구 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  await captureSongPost(page, 403, { code: 'SONG_LIMIT_EXCEEDED', message: 'Limit reached' });
  const song = page.locator(`[data-row="monthly"] [data-video-id="${MONTHLY_ITEMS[0].videoId}"]`);
  await song.hover();
  await song.locator('xpath=..').locator('[data-quick-add]').click();
  await page.locator('#quickAddSong').click();
  await expect(page.locator('#quickAddAlert')).toHaveText('곡 한도에 도달했어요. 플랜을 확인해 주세요');
  await expect(page.locator('#quickAddStatus')).toHaveCount(0);
});

test('CMR3-13 폴더 담기: Pro는 clone POST 1회 및 성공 문구, 무료 사용자는 요청 0 및 업그레이드 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1) Pro 사용자
  const cloneCalls = [];
  await openCommunityPro(page);
  await page.route((url) => url.pathname.includes('/clone'), async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    cloneCalls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ imported: 3, alreadyInLibrary: 0, skippedLimit: 0 }),
    });
  });

  const card = page.locator(CMR3_CURATED);
  await card.hover();
  await card.locator('xpath=..').locator('[data-quick-add]').click();
  await expect(page.locator('#quickAddSheet')).toBeVisible();
  await page.locator('#quickAddClone').click();
  await expect(page.locator('#quickAddStatus')).toContainText('3곡을 담았어요');
  expect(cloneCalls).toHaveLength(1);

  // 2) 무료 사용자
  const freeCloneCalls = [];
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    routes: communityRoutes(),
  });
  await page.route((url) => url.pathname.includes('/clone'), async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    freeCloneCalls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/community.html', { waitUntil: 'load' });
  const freeCard = page.locator(CMR3_CURATED);
  await freeCard.hover();
  await freeCard.locator('xpath=..').locator('[data-quick-add]').click();
  await expect(page.locator('#quickAddSheet')).toBeVisible();
  await page.locator('#quickAddClone').click();
  await expect(page.locator('#quickAddAlert')).toHaveText('Pro로 업그레이드하면 쓸 수 있어요');
  expect(freeCloneCalls).toHaveLength(0);
});

test('CMR3-14 상세 열기: 빠른 추가 시트에서 #quickAddOpen 클릭 시 빠른 추가 시트 닫히고 #folderSheet 열림', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  const card = page.locator(CMR3_CURATED);
  await card.hover();
  await card.locator('xpath=..').locator('[data-quick-add]').click();
  await expect(page.locator('#quickAddSheet')).toBeVisible();

  await page.locator('#quickAddOpen').click();
  await expect(page.locator('#quickAddSheet')).toHaveCount(0);
  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderSheetTitle')).toHaveText(FOLDER_CURATED_1.title);
});

test('CMR3-15 상세 구조: 히어로 → 컨트롤 바 → 곡 목록, 바 순서, 제목 focus, ESC 닫기 후 카드 focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  const card = page.locator('[data-row="showcase"] [data-folder-id]').first();
  await card.click();
  const sheet = page.locator('#folderSheet');
  await expect(sheet.locator('#folderSheetItems li')).toHaveCount(2);
  await expect(page.locator('#folderSheetTitle')).toBeFocused();

  const ordered = await sheet.evaluate((root) => {
    const els = ['[class*="detailHero"]', '#folderSheetControls', '#folderSheetItems'].map((s) => root.querySelector(s));
    if (els.some((x) => !x)) return false;
    return els.every((el, i) => i === 0 || Boolean(els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(ordered).toBe(true);
  const ids = await page.locator('#folderSheetControls > button').evaluateAll((els) => els.map((e) => e.id));
  expect(ids.slice(0, 4)).toEqual(['folderClone', 'folderSelectMode', 'folderShare', 'folderLike']);
  await expect(page.locator('#folderSheetControls')).toHaveAttribute('role', 'toolbar');
  await expect(sheet.locator('[class*="practiceLink"]')).toHaveCount(0);
  await expect(sheet.locator('a[class*="detailTrackLink"]').first()).toHaveAttribute('href', /practice\.html\?v=abcdefghij1/);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('CMR3-17 행 이동: a.detailTrackLink 클릭 시 practice.html?v=...&a=...&b=... 로 이동', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  const link = page.locator('#folderSheetItems a[class*="detailTrackLink"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/practice\.html\?v=abcdefghij1/);

  await Promise.all([
    page.waitForURL(/practice\.html/),
    link.click(),
  ]);
});

test('CMR3-18 부분 선택: 3곡 중 1·3 체크 → #folderAddSelected(2) → 1번 201, 3번 200, 순서 1→3, 성공 행 선택 해제', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const THREE_ITEMS = [
    { videoId: 'v1', position: 0, title: '곡 1', artist: '아티스트 1' },
    { videoId: 'v2', position: 1, title: '곡 2', artist: '아티스트 2' },
    { videoId: 'v3', position: 2, title: '곡 3', artist: '아티스트 3' },
  ];
  const posts = [];
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: [
      [(url) => url.pathname === '/api/v1/songs', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const data = JSON.parse(route.request().postData() || '{}');
        posts.push(data);
        const status = data.videoId === 'v1' ? 201 : 200;
        return route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ song: { id: `s-${data.videoId}`, videoId: data.videoId } }),
        });
      }],
      ...communityRoutes({
        folderDetails: {
          [FOLDER_CURATED_1.id]: {
            folder: { ...FOLDER_CURATED_1, itemCount: 3 },
            items: THREE_ITEMS,
          },
        },
      }),
    ],
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await page.locator('#folderSelectMode').click();
  await expect(page.locator('#folderSelectMode')).toHaveAttribute('aria-pressed', 'true');

  const items = page.locator('#folderSheetItems li');
  await expect(items).toHaveCount(3);

  const cb1 = items.nth(0).locator('input[type="checkbox"]');
  const cb2 = items.nth(1).locator('input[type="checkbox"]');
  const cb3 = items.nth(2).locator('input[type="checkbox"]');
  await cb1.check();
  await cb3.check();

  const addBtn = page.locator('#folderAddSelected');
  await expect(addBtn).toHaveText('선택한 곡 추가 (2)');

  await addBtn.click();

  await expect.poll(() => posts.length).toBe(2);
  expect(posts[0].videoId).toBe('v1');
  expect(posts[1].videoId).toBe('v3');

  await expect(items.nth(0).locator('[data-item-status="ok"]')).toHaveText('내 곡 리스트에 있어요');
  await expect(items.nth(2).locator('[data-item-status="ok"]')).toHaveText('내 곡 리스트에 있어요');
  await expect(items.nth(1).locator('[data-item-status]')).toHaveCount(0);

  expect(await cb1.isChecked()).toBe(false);
  expect(await cb3.isChecked()).toBe(false);
  expect(await cb2.isChecked()).toBe(false);
});

test('CMR3-19 선택 중 한도: 1·2·3 선택, 2번 403 한도 시 3번 호출 0, 2·3 선택 유지, #folderAddSelectedAlert 한도 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const THREE_ITEMS = [
    { videoId: 'v1', position: 0, title: '곡 1', artist: '아티스트 1' },
    { videoId: 'v2', position: 1, title: '곡 2', artist: '아티스트 2' },
    { videoId: 'v3', position: 2, title: '곡 3', artist: '아티스트 3' },
  ];
  const posts = [];
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: [
      [(url) => url.pathname === '/api/v1/songs', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const data = JSON.parse(route.request().postData() || '{}');
        posts.push(data);
        if (data.videoId === 'v1') {
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ song: { id: 's-1', videoId: 'v1' } }) });
        }
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'SONG_LIMIT_EXCEEDED', message: 'Limit' }) });
      }],
      ...communityRoutes({
        folderDetails: {
          [FOLDER_CURATED_1.id]: {
            folder: { ...FOLDER_CURATED_1, itemCount: 3 },
            items: THREE_ITEMS,
          },
        },
      }),
    ],
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await page.locator('#folderSelectMode').click();
  const items = page.locator('#folderSheetItems li');
  const cb1 = items.nth(0).locator('input[type="checkbox"]');
  const cb2 = items.nth(1).locator('input[type="checkbox"]');
  const cb3 = items.nth(2).locator('input[type="checkbox"]');
  await cb1.check();
  await cb2.check();
  await cb3.check();

  await page.locator('#folderAddSelected').click();

  await expect(page.locator('#folderAddSelectedAlert')).toHaveText('곡 한도에 도달했어요. 플랜을 확인해 주세요');
  expect(posts.map((p) => p.videoId)).toEqual(['v1', 'v2']);

  expect(await cb1.isChecked()).toBe(false);
  await expect(items.nth(0).locator('[data-item-status="ok"]')).toBeVisible();

  expect(await cb2.isChecked()).toBe(true);
  expect(await cb3.isChecked()).toBe(true);
  await expect(items.nth(1).locator('[data-item-status="err"]')).toBeVisible();
});

test('CMR3-20 실행 중 잠금·닫힘: 1번 응답 보류 중 #folderClose 클릭 시 닫힌 뒤 남은 POST 0, pageerror 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const THREE_ITEMS = [
    { videoId: 'v1', position: 0, title: '곡 1', artist: '아티스트 1' },
    { videoId: 'v2', position: 1, title: '곡 2', artist: '아티스트 2' },
  ];
  let releaseFirst;
  const holdFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const posts = [];

  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: [
      [(url) => url.pathname === '/api/v1/songs', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const data = JSON.parse(route.request().postData() || '{}');
        posts.push(data);
        if (data.videoId === 'v1') {
          await holdFirst;
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ song: { id: 's-1', videoId: 'v1' } }) });
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ song: { id: 's-2', videoId: 'v2' } }) });
      }],
      ...communityRoutes({
        folderDetails: {
          [FOLDER_CURATED_1.id]: {
            folder: { ...FOLDER_CURATED_1, itemCount: 2 },
            items: THREE_ITEMS,
          },
        },
      }),
    ],
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await page.locator('#folderSelectMode').click();
  const items = page.locator('#folderSheetItems li');
  await items.nth(0).locator('input[type="checkbox"]').check();
  await items.nth(1).locator('input[type="checkbox"]').check();

  await page.locator('#folderAddSelected').click();
  await expect.poll(() => posts.length).toBe(1);

  await page.locator('#folderClose').click();
  await expect(page.locator('#folderSheet')).toHaveCount(0);

  releaseFirst();
  await page.waitForLoadState('networkidle');

  expect(posts.map((p) => p.videoId)).toEqual(['v1']);
  expect(pageErrors).toEqual([]);
});

test('CMR3-21 계정 전환: 순차 추가 중 B 로그인 시 B 화면에 A 시트·상태 0, 남은 POST 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const THREE_ITEMS = [
    { videoId: 'v1', position: 0, title: '곡 1', artist: '아티스트 1' },
    { videoId: 'v2', position: 1, title: '곡 2', artist: '아티스트 2' },
  ];
  let releaseFirst;
  const holdFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const posts = [];

  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: [
      [(url) => url.pathname === '/api/v1/songs', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const data = JSON.parse(route.request().postData() || '{}');
        posts.push(data);
        if (data.videoId === 'v1') {
          await holdFirst;
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ song: { id: 's-1', videoId: 'v1' } }) });
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ song: { id: 's-2', videoId: 'v2' } }) });
      }],
      ...communityRoutes({
        folderDetails: {
          [FOLDER_CURATED_1.id]: {
            folder: { ...FOLDER_CURATED_1, itemCount: 2 },
            items: THREE_ITEMS,
          },
        },
      }),
    ],
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await page.locator('#folderSelectMode').click();
  const items = page.locator('#folderSheetItems li');
  await items.nth(0).locator('input[type="checkbox"]').check();
  await items.nth(1).locator('input[type="checkbox"]').check();

  await page.locator('#folderAddSelected').click();
  await expect.poll(() => posts.length).toBe(1);

  const USER_B = {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'user-b@example.com',
  };
  await page.evaluate((u) => {
    if (typeof window.__supabaseAuthListener === 'function') {
      window.__supabaseAuthListener('SIGNED_IN', { user: u });
    }
  }, USER_B);

  releaseFirst();
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#folderSheet')).toHaveCount(0);
  expect(posts.map((p) => p.videoId)).toEqual(['v1']);
});

test('CMR3-22 공유: navigator.share 제거 시 클립보드 복사 링크 URL 및 메시지, 클립보드 실패 시 실패 메시지', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1) 클립보드 성공 케이스
  await page.addInitScript(() => {
    delete window.navigator.share;
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCommunityPro(page);
  await page.locator(CMR3_CURATED).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await page.locator('#folderShare').click();
  await expect(page.locator('#folderSheetOk')).toHaveText('링크를 복사했어요');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`community.html#folder=${encodeURIComponent(FOLDER_CURATED_1.id)}`);

  // 2) 클립보드 실패 케이스
  await page.close();
  const page2 = await page.context().newPage();
  await page2.setViewportSize({ width: 1280, height: 900 });
  await page2.addInitScript(() => {
    delete window.navigator.share;
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: () => Promise.reject(new Error('Permission denied')),
      },
    });
  });
  await openCommunityPro(page2);
  await page2.locator(CMR3_CURATED).click();
  await expect(page2.locator('#folderSheet')).toBeVisible();
  await page2.locator('#folderShare').click();
  await expect(page2.locator('#folderSheetAlert')).toHaveText('링크를 복사하지 못했어요');
});

test('CMR3-23 딥링크: #folder=<id> 직접 진입 시 시트 자동 열림, 닫으면 #all, 없는 폴더면 #folderSheetErr', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1) 정상 폴더 딥링크 진입
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes(),
  });
  await page.goto(`/community.html#folder=${FOLDER_CURATED_1.id}`, { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderSheetTitle')).toHaveText(FOLDER_CURATED_1.title);

  await page.locator('#folderClose').click();
  await expect(page.locator('#folderSheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#all');

  // 2) 없는 폴더 딥링크 진입
  await page.goto('/community.html#folder=00000000-0000-4000-8000-999999999999', { waitUntil: 'load' });
  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderSheetErr')).toHaveText('더 이상 공개되지 않은 폴더예요');
});

test('CMR3-24 자기 폴더: owner=me인 경우 바에 #folderShare만 있고 #folderSelectMode·#folderClone 없음', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const myFolder = {
    ...FOLDER_CURATED_1,
    id: 'my-folder-1',
    owner: {
      id: DEFAULT_ME.id,
      publicName: COMMUNITY_PRO_ME.publicName,
    },
  };
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_PRO_ME,
    routes: communityRoutes({
      curationHome: { ...CURATION_HOME_FIXTURE, curated: [myFolder] },
      folderDetails: { [myFolder.id]: { folder: myFolder, items: MONTHLY_ITEMS } },
    }),
  });
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator(`[data-row="curated"] [data-folder-id="${myFolder.id}"]`).click();
  await expect(page.locator('#folderSheet')).toBeVisible();

  await expect(page.locator('#folderShare')).toBeVisible();
  await expect(page.locator('#folderClone')).toHaveCount(0);
  await expect(page.locator('#folderSelectMode')).toHaveCount(0);
  await expect(page.locator('#folderLike')).toHaveCount(0);
  await expect(page.locator('#folderFollow')).toHaveCount(0);
});

test('CMR3-25 ESC·포커스: 상세·하단 시트 각각 ESC 누르면 닫히고 연 요소로 focus 복귀, Tab 순환', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);

  // 1) 빠른 추가 시트 (QuickAddSheet)
  const card = page.locator(CMR3_CURATED);
  await card.hover();
  const plusBtn = card.locator('xpath=..').locator('[data-quick-add]');
  await plusBtn.click();
  await expect(page.locator('#quickAddSheet')).toBeVisible();
  await expect(page.locator('#quickAddTitle')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.locator('#quickAddClone')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('#quickAddSheet')).toHaveCount(0);
  await expect(plusBtn).toBeFocused();

  // 2) 폴더 상세 시트 (FolderSheet)
  await card.click();
  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderSheetTitle')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('#folderSheet')).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('CMR3-25b 포커스 트랩: 제목 focus 상태에서 Shift+Tab 시 focus가 시트 안에 남는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCommunityPro(page);

  const card = page.locator(CMR3_CURATED);
  await card.hover();
  await card.locator('xpath=..').locator('[data-quick-add]').click();
  await expect(page.locator('#quickAddTitle')).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById('quickAddSheet');
    return Boolean(root && document.activeElement && root.contains(document.activeElement)
      && document.activeElement.id !== 'quickAddTitle');
  })).toBe(true);
});

test('CMR3-23b 딥링크·이름 모달: 이름 미설정이면 모달만 열리고, 건너뛴 뒤 #folderSheet가 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    me: NO_NAME_ME,
    routes: communityRoutes(),
  });
  await page.goto(`/community.html#folder=${FOLDER_CURATED_1.id}`, { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await expect(page.locator('#communityNameModal')).toBeVisible();
  await expect(page.locator('#folderSheet')).toHaveCount(0);

  await page.locator('#communityNameModalSkip').click();
  await expect(page.locator('#communityNameModal')).toHaveCount(0);
  await expect(page.locator('#folderSheet')).toBeVisible();
  await expect(page.locator('#folderSheetTitle')).toHaveText(FOLDER_CURATED_1.title);
});

// ── CMR-4: 게시물 좋아요(낙관적 갱신 없음) ──
const COMMUNITY_LIKE_STATE = { ...STATES.userData, me: COMMUNITY_PRO_ME };
const likeCard = (page) => page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);

test('CMR4-E1 좋아요 반영: 요청 중 disabled, 응답 뒤 좋아요 · 7·aria-checked=true, 낙관적 +1(4)은 보이지 않음', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      onEpisodeLike: async (route, json, method) => {
        calls += 1;
        expect(method).toBe('PUT');
        await gate;
        return json(route, { liked: true, likeCount: 7 });
      },
    }),
  });
  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const btn = likeCard(page).locator('[data-episode-like]');
  await expect(btn).toHaveText('좋아요 · 3');
  await expect(btn).toHaveAttribute('aria-checked', 'false');
  // 같은 JS 작업 안의 연속 이벤트: React disabled 반영 전 진입도 ref가 막아야 한다.
  await btn.evaluate((el) => {
    el.click();
    el.click();
  });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText('좋아요 · 3'); // 낙관적 갱신 없음
  release();
  await expect(btn).toHaveText('좋아요 · 7');
  await expect(btn).toHaveAttribute('aria-checked', 'true');
  await expect(btn).toBeEnabled();
  expect(calls).toBe(1);
});

test('CMR4-E2 실패 유지: 500이면 좋아요 · 3 유지하고 카드 안 오류 문구 표시', async ({ page }) => {
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      onEpisodeLike: (route, json) => json(route, { ok: false, code: 'INTERNAL', message: 'boom' }, 500),
    }),
  });
  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const card = likeCard(page);
  const btn = card.locator('[data-episode-like]');
  await btn.click();
  await expect(card.locator('[data-episode-like-error]')).toHaveText('좋아요를 반영하지 못했어요. 다시 시도해 주세요');
  await expect(btn).toHaveText('좋아요 · 3');
  await expect(btn).toHaveAttribute('aria-checked', 'false');
  await expect(btn).toBeEnabled();
});

test('CMR4-E3 404: 사라진 글이면 안내 후 카드 제거·첫 페이지 재조회', async ({ page }) => {
  let feedCalls = 0;
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      onEpisodeLogs: (route, json) => {
        feedCalls += 1;
        return json(route, { posts: feedCalls === 1 ? [EPISODE_POST_1] : [], next: null });
      },
      onEpisodeLike: (route, json) => json(route, { ok: false, code: 'NOT_FOUND', message: 'gone' }, 404),
    }),
  });
  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await likeCard(page).locator('[data-episode-like]').click();
  await expect(likeCard(page)).toHaveCount(0);
  expect(feedCalls).toBeGreaterThanOrEqual(2);
});

test('CMR4-E4a 늦은 응답: 응답 지연 중 탭을 떠났다 돌아오면 늦은 응답이 새 화면 값을 바꾸지 않음', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const startedP = new Promise((resolve) => { started = resolve; });
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      onEpisodeLike: async (route, json) => {
        started();
        await gate;
        return json(route, { liked: true, likeCount: 7 });
      },
    }),
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await likeCard(page).locator('[data-episode-like]').click();
  await startedP;
  await page.evaluate(() => { window.location.hash = '#summary'; });
  await expect(page.locator('#summaryPane')).toBeVisible();
  await expect(likeCard(page)).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = '#log'; });
  const btn = likeCard(page).locator('[data-episode-like]');
  await expect(btn).toHaveText('좋아요 · 3');
  const lateResponse = page.waitForResponse((r) => r.url().endsWith('/like'));
  release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(btn).toHaveText('좋아요 · 3');
  await expect(btn).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});

test('CMR4-E4b 늦은 응답: 피드는 유지하고 폭 변경으로 카드를 재마운트해도 이전 요청은 폐기', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const startedP = new Promise((resolve) => { started = resolve; });
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      // 두 번째 카드는 3열의 두 번째 열에서 1열의 첫 번째 열로 이동한다.
      onEpisodeLogs: (route, json) => json(route, { posts: [
        { ...EPISODE_POST_1, postId: '00000000-0000-4000-8000-000000009999' },
        EPISODE_POST_1,
      ], next: null }),
      onEpisodeLike: async (route, json) => {
        started();
        await gate;
        return json(route, { liked: true, likeCount: 7 });
      },
    }),
  });
  await page.goto('/community.html#logs', { waitUntil: 'load' });
  const btn = likeCard(page).locator('[data-episode-like]');
  await btn.click();
  await startedP;
  const oldButton = await btn.elementHandle();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => oldButton.evaluate((el) => el.isConnected)).toBe(false);
  await expect(btn).toBeEnabled();
  const lateResponse = page.waitForResponse((r) => r.url().endsWith('/like'));
  release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(btn).toHaveText('좋아요 · 3');
  await expect(btn).toHaveAttribute('aria-checked', 'false');
});

test('CMR4-E4c 계정 A→B 전환 뒤 A의 좋아요 응답이 B의 상태를 바꾸지 않음', async ({ page }) => {
  const { DEFAULT_ME } = require('./support/mock-app');
  const bId = '00000000-0000-4000-8000-000000009998';
  let accountB = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const startedP = new Promise((resolve) => { started = resolve; });
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({
      onEpisodeLogs: (route, json) => json(route, { posts: [
        { ...EPISODE_POST_1, likeCount: accountB ? 11 : 3, likedByMe: accountB },
      ], next: null }),
      onEpisodeLike: async (route, json) => {
        started();
        await gate;
        return json(route, { liked: false, likeCount: 7 });
      },
    }),
  });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: {
    ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: accountB ? bId : DEFAULT_ME.id,
  } }));
  await page.goto('/community.html#logs', { waitUntil: 'load' });
  const btn = likeCard(page).locator('[data-episode-like]');
  await btn.click();
  await startedP;
  accountB = true;
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await expect(btn).toHaveText('좋아요 · 11');
  await expect(btn).toHaveAttribute('aria-checked', 'true');
  const lateResponse = page.waitForResponse((r) => r.url().endsWith('/like'));
  release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(btn).toHaveText('좋아요 · 11');
  await expect(btn).toHaveAttribute('aria-checked', 'true');
  await expect(btn).toBeEnabled();
});

// ── S3b-4: 피드 카드 녹음 재생(단일 플레이어) ──
const EP_ATT = EPISODE_POST_1.attachments[0];
const EP_POST_2 = {
  ...EPISODE_POST_1,
  postId: '00000000-0000-4000-8000-000000000904',
  sessionId: '00000000-0000-4000-8000-000000000804',
  title: '두 번째 녹음 카드',
  attachments: [{ attachmentId: '00000000-0000-4000-8000-00000000a904', kind: 'audio_copy', mime: 'audio/webm', durationSec: 75 }],
};

/** 실제 디코딩 없이 재생 호출을 기록한다. 요소 수·src를 페이지에서 읽는다. */
async function stubAudio(page) {
  await page.addInitScript(() => {
    window.__audioLog = [];
    window.__audioEls = new Set();
    const P = HTMLMediaElement.prototype;
    P.play = function () {
      window.__audioEls.add(this);
      window.__audioLog.push('play:' + this.getAttribute('src'));
      return Promise.resolve();
    };
    P.pause = function () { window.__audioLog.push('pause'); };
    P.load = function () { window.__audioLog.push('load'); };
  });
}
const audioState = (page) => page.evaluate(() => {
  const els = [...window.__audioEls];
  return { count: els.length, src: els[0] ? els[0].getAttribute('src') : null, att: els[0] ? els[0].dataset.attachmentId || null : null };
});
async function openFeed(page, routeOpts = {}, posts = [EPISODE_POST_1, EP_POST_2]) {
  await stubAudio(page);
  await mockApp(page, {
    ...COMMUNITY_LIKE_STATE,
    routes: communityRoutes({ onEpisodeLogs: (route, json) => json(route, { posts, next: null }), ...routeOpts }),
  });
  await page.goto('/community.html#logs', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await page.locator(`[data-post-id="${posts[0].postId}"]`).waitFor();
}

test('S3b4-P1t 재생: ▶ 클릭 → 주소 1회 요청, loading→playing, aria-pressed=true, 다시 누르면 정지', async ({ page }) => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  await openFeed(page, {
    onAttachmentUrl: async (route, json, postId, attId) => {
      calls += 1;
      expect(postId).toBe(EPISODE_POST_1.postId);
      expect(attId).toBe(EP_ATT.attachmentId);
      await gate;
      return json(route, { url: `/mock-audio/${attId}-${calls}.weba`, expiresIn: 300 });
    },
  });
  const btn = likeCard(page).locator(`[data-episode-play="${EP_ATT.attachmentId}"]`);
  await expect(btn).toHaveAttribute('aria-label', '녹음 재생 (0:42)');
  await btn.click();
  await expect(btn).toHaveAttribute('data-play-state', 'loading');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  release();
  await expect(btn).toHaveAttribute('data-play-state', 'playing');
  expect(calls).toBe(1);
  expect(await audioState(page)).toEqual({ count: 1, src: `/mock-audio/${EP_ATT.attachmentId}-1.weba`, att: EP_ATT.attachmentId });
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect((await audioState(page)).src).toBeNull();
  // 다시 재생하면 주소를 새로 받는다(캐시 금지)
  await btn.click();
  await expect(btn).toHaveAttribute('data-play-state', 'playing');
  expect(calls).toBe(2);
});

test('S3b4-P2t 단일 재생: A 재생 중 B ▶ → A 정리, B만 재생, audio 요소 1개', async ({ page }) => {
  await openFeed(page);
  const a = likeCard(page).locator('[data-episode-play]');
  const b = page.locator(`[data-post-id="${EP_POST_2.postId}"] [data-episode-play]`);
  await a.click();
  await expect(a).toHaveAttribute('data-play-state', 'playing');
  await b.click();
  await expect(b).toHaveAttribute('data-play-state', 'playing');
  await expect(a).toHaveAttribute('aria-pressed', 'false');
  const st = await audioState(page);
  expect(st.count).toBe(1);
  expect(st.att).toBe(EP_POST_2.attachments[0].attachmentId);
});

test('S3b4-P5t 계정 전환: 재생 중 로그아웃 → 정지·src 없음', async ({ page }) => {
  await openFeed(page);
  const a = likeCard(page).locator('[data-episode-play]');
  await a.click();
  await expect(a).toHaveAttribute('data-play-state', 'playing');
  await page.evaluate(() => window.__supabaseAuthListener('SIGNED_OUT', null));
  await expect.poll(async () => (await audioState(page)).src).toBeNull();
  expect(await page.evaluate(() => window.__audioLog.slice(-2))).toEqual(['pause', 'load']);
});

test('S3b4-P6t 404: 재생 주소 404 → 사라진 글 문구와 카드 제거(첫 페이지 재조회)', async ({ page }) => {
  let feedCalls = 0;
  await openFeed(page, {
    onEpisodeLogs: (route, json) => {
      feedCalls += 1;
      return json(route, { posts: feedCalls === 1 ? [EPISODE_POST_1, EP_POST_2] : [EP_POST_2], next: null });
    },
    onAttachmentUrl: (route, json) => json(route, { code: 'NOT_FOUND', message: 'not found' }, 404),
  });
  await likeCard(page).locator('[data-episode-play]').click();
  await expect(likeCard(page)).toHaveCount(0);
  await expect(page.locator(`[data-post-id="${EP_POST_2.postId}"]`)).toBeVisible();
  expect(feedCalls).toBe(2);
  expect(await page.evaluate(() => window.__audioLog.filter((x) => x.startsWith('play:')))).toEqual([]);
});

test('S3b4-P7t 오류 재시도: 재생 오류 이벤트 → ⟲ 상태·카드 안 오류 문구, 다시 누르면 새 주소 요청', async ({ page }) => {
  let calls = 0;
  await openFeed(page, {
    onAttachmentUrl: (route, json, postId, attId) => { calls += 1; return json(route, { url: `/mock-audio/${attId}-${calls}.weba`, expiresIn: 300 }); },
  });
  const a = likeCard(page).locator('[data-episode-play]');
  await a.click();
  await expect(a).toHaveAttribute('data-play-state', 'playing');
  await page.evaluate(() => [...window.__audioEls][0].dispatchEvent(new Event('error')));
  await expect(a).toHaveAttribute('data-play-state', 'error');
  await expect(likeCard(page).locator('[data-episode-play-error]')).toHaveText('녹음을 재생하지 못했어요. 다시 눌러 주세요');
  await a.click();
  await expect(a).toHaveAttribute('data-play-state', 'playing');
  expect(calls).toBe(2);
  expect((await audioState(page)).src).toBe(`/mock-audio/${EP_ATT.attachmentId}-2.weba`);
  await expect(likeCard(page).locator('[data-episode-play-error]')).toHaveCount(0);
});

test('S3b4-P8t·P13t 첨부 없음·개인 필드: 버튼 0·미니 썸네일만, 큰 썸네일 열 없음, sourceTakeId·크기 미표시', async ({ page }) => {
  const noAtt = { ...EP_POST_2, attachments: [] };
  await openFeed(page, {}, [noAtt, { ...EPISODE_POST_1, sourceTakeId: 'take-secret-1', sizeBytes: 123456 }]);
  const card = page.locator(`[data-post-id="${noAtt.postId}"]`);
  await expect(card.locator('[data-episode-play]')).toHaveCount(0);
  await expect(card.locator('img, :text("NO VIDEO")').first()).toBeVisible();
  await expect(page.locator('[class*="thumbWrap"]')).toHaveCount(0);
  const html = await page.locator('#episodeFeed').innerHTML();
  expect(html).not.toContain('take-secret-1');
  expect(html).not.toContain('123456');
});

// ── S3b-4 D7: 곡 삭제 확인에 공유 영향 문장 ──
for (const [label, impact, expectExtra] of [
  ['영향 있음 {2,1}', { status: 200, body: { cards: 2, attachments: 1 } }, '공유 카드 2개·공유 녹음 1개도 커뮤니티에서 삭제됩니다.'],
  ['영향 0', { status: 200, body: { cards: 0, attachments: 0 } }, null],
  ['조회 실패 500', { status: 500, body: { code: 'INTERNAL', message: 'x' } }, null],
]) {
  test(`S3b4-P10t 곡 삭제 영향: ${label}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const impactQueries = [];
    let deletes = 0;
    await mockApp(page, {
      ...COMMUNITY_LIKE_STATE,
      routes: [
        ...communityRoutes({
          onShareImpact: (route, json, q) => { impactQueries.push(q.toString()); return json(route, impact.body, impact.status); },
        }),
        [(url) => /^\/api\/v1\/songs\/[^/]+$/.test(url.pathname), (route) => {
          if (route.request().method() === 'DELETE') { deletes += 1; return route.fulfill({ json: { ok: true } }); }
          return route.fallback();
        }],
      ],
    });
    const messages = [];
    page.on('dialog', (d) => { messages.push(d.message()); d.accept(); });
    await page.goto('/log.html#songs', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    const song = STATES.userData.songs[0];
    await page.getByRole('button', { name: '곡 삭제' }).first().click();
    await expect.poll(() => deletes).toBe(1);
    expect(impactQueries).toEqual([`songId=${song.id}`]);
    expect(messages).toHaveLength(1);
    expect(messages[0].startsWith('이 곡과 모든 연습 기록·녹음 파일을 함께 삭제할까요?')).toBe(true);
    if (expectExtra) expect(messages[0]).toContain(expectExtra);
    else expect(messages[0]).toBe('이 곡과 모든 연습 기록·녹음 파일을 함께 삭제할까요?');
  });
}

// ── S3b-4 D7: 녹음 삭제 확인에 공유 영향 문장 ──
for (const [label, impact, expectExtra] of [
  ['영향 있음 {1,1}', { status: 200, body: { cards: 1, attachments: 1 } }, '공유된 녹음이 커뮤니티 게시물에서도 삭제됩니다(카드는 유지).'],
  ['영향 0', { status: 200, body: { cards: 0, attachments: 0 } }, null],
  ['조회 실패 500', { status: 500, body: { code: 'INTERNAL', message: 'x' } }, null],
]) {
  test(`S3b4-P10t 녹음 삭제 영향: ${label}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const song = STATES.userData.songs[0];
    const takeId = '00000000-0000-4000-8000-000000000951';
    const sessionId = '00000000-0000-4000-8000-000000000851';
    const impactQueries = [];
    let deletes = 0;
    await mockApp(page, {
      ...COMMUNITY_LIKE_STATE,
      songDetail: {
        song,
        takes: [{
          id: takeId, sessionId, recordedAt: '2026-11-08T10:00:00Z',
          a: 12, b: 48, rate: 1, durationSec: 25,
          mime: 'audio/webm', sizeBytes: 9000, storage: 'supabase', storageKey: `u1/${takeId}.weba`, memo: '',
        }],
        sessions: [{
          id: sessionId, date: '2026-11-08', seconds: 300, minutes: 5, loops: 10,
          a: 12, b: 48, segment: '0:12–0:48', rate: 1, memo: '',
        }],
      },
      routes: [
        ...communityRoutes({
          onShareImpact: (route, json, q) => { impactQueries.push(q.toString()); return json(route, impact.body, impact.status); },
        }),
        [(url) => url.pathname === `/api/v1/takes/${takeId}`, (route) => {
          if (route.request().method() === 'DELETE') { deletes += 1; return route.fulfill({ json: { ok: true } }); }
          return route.fallback();
        }],
      ],
    });
    const messages = [];
    page.on('dialog', (d) => { messages.push(d.message()); d.accept(); });
    await page.goto(`/practice.html?v=${song.videoId}`, { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    const takeRow = page.locator(`#songRecord .ab-select[data-take-id="${takeId}"]`).locator('xpath=ancestor::div[contains(@class,"take-row")]');
    await takeRow.locator('.btnDelete').click();
    await expect.poll(() => deletes).toBe(1);
    expect(impactQueries).toEqual([`takeId=${takeId}`]);
    expect(messages).toHaveLength(1);
    expect(messages[0].startsWith('이 녹음을 삭제할까요?')).toBe(true);
    if (expectExtra) expect(messages[0]).toContain(expectExtra);
    else expect(messages[0]).toBe('이 녹음을 삭제할까요?');
  });
}
