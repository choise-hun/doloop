// test/e2e/community.spec.js
// M2-23 E2E 테스트 (CM-1 ~ CM-14): 홈 큐레이션 · 재생목록 가져오기 · TRAILS 커뮤니티 · 공유 설정 · 개인정보
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');
const {
  COMMUNITY_FREE_ME,
  COMMUNITY_PRO_ME,
  CURATION_HOME_FIXTURE,
  FOLDER_CURATED_1,
  FOLDER_CURATED_2,
  PLAYLIST_PREVIEW_FIXTURE,
  communityRoutes,
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

test('CM-10 이름: 이름 없는 상태에서 배너 폼에 공백 이름 입력 시 요청 0 + 형식 문구, 중복 이름 409 시 중복 문구', async ({ page }) => {
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

  const banner = page.locator('#communityNameBanner');
  await expect(banner).toBeVisible();

  await page.locator('#communityBannerNameInput').fill('존 메이어');
  await page.locator('#communityBannerNameSave').click();
  await expect(banner.locator('[role="alert"]')).toHaveText('2~20자, 띄어쓰기 없이 입력해 주세요');
  expect(nameCalls).toBe(0);

  await page.locator('#communityBannerNameInput').fill('존메이어');
  await page.locator('#communityBannerNameSave').click();
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
