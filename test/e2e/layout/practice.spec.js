// 연습 화면 정렬 검사 (FT-2 · SR-1): 공통 검사 G0~G8 + #songRecord 배치 약속(sr-left, sr-cols)
// 규격: 개발산출물/프론트_정렬규격.md · 명세: 개발산출물/명세/SR-1_구현명세.md §3
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, FIXTURES } = require('../support/mock-app');

const SONG_0 = FIXTURES.longSongs(1)[0];

const SR_SONG_DETAIL = {
  song: SONG_0,
  takes: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      sessionId: '00000000-0000-4000-8000-000000000801',
      recordedAt: '2026-11-05T10:00:00Z',
      a: 12,
      b: 48,
      rate: 0.75,
      durationSec: 25,
      mime: 'audio/webm',
      sizeBytes: 12000,
      storage: 'supabase',
      storageKey: 'u1/tk1.weba',
      memo: '',
    },
    {
      id: '00000000-0000-4000-8000-000000000902',
      sessionId: '00000000-0000-4000-8000-000000000802',
      recordedAt: '2026-11-06T11:30:00Z',
      a: 12,
      b: 48,
      rate: 1,
      durationSec: 36,
      mime: 'audio/webm',
      sizeBytes: 18000,
      storage: 'supabase',
      storageKey: 'u1/tk2.weba',
      memo: '',
    },
  ],
  sessions: Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000080${i + 1}`,
    date: `2026-11-0${6 - i}`,
    seconds: (6 - i) * 180,
    minutes: (6 - i) * 3,
    loops: (6 - i) * 2,
    a: 12,
    b: 48,
    segment: '0:12–0:48',
    rate: 0.75,
    memo: i === 0 ? '인트로 구간 박자 맞춰 반복 연습' : '',
  })),
};

const USER_DATA_SR = {
  ...STATES.userData,
  songDetail: SR_SONG_DETAIL,
};

const USER_EMPTY_SR = {
  ...STATES.userData,
  songDetail: { song: SONG_0, takes: [], sessions: [] },
};

// 영상 없이 연 빈 화면
layoutSuite({
  name: 'practice-empty',
  path: '/practice.html',
  states: ['guest'],
  ready: async (page) => {
    await page.locator('#emptyState').waitFor();
  },
});

// 영상을 연 화면(기기 저장 진행 있음 · 로그인 곡 있음 + 곡 상세 녹음 2·세션 6 · 빈 곡 상세)
layoutSuite({
  name: 'practice',
  path: '/practice.html?v=jNQXAC9IVRw',
  states: [
    'guest',
    'guestLocal',
    { name: 'userData', mock: USER_DATA_SR },
    { name: 'userEmpty', mock: USER_EMPTY_SR },
  ],
  ready: async (page, state) => {
    await page.locator('#seekRow').waitFor();
    await page.locator('#songRecord').waitFor();
    if (state === 'userData') {
      await expect(page.locator('#srTakes .take-row')).toHaveCount(2);
      await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);
    } else if (state === 'userEmpty') {
      await expect(page.locator('#srTakes')).toContainText('아직 녹음이 없어요');
      await expect(page.locator('#srTimeline')).toContainText('아직 연습 세션 기록이 없어요');
    }
  },
  dark: 'userData',
  // 알려진 실패(FT-2 기록, M2에서 다시 만들 때 data-layout-ignore로 표기). 결과/FT-2_전화면점검.md §3
  known: [{ match: /^G3 #songTitle /, why: '곡 제목은 의도한 한 줄 말줄임(nowrap+ellipsis). 예외 표기만 없음' }],
});

// UI-2 검증 테스트 (T1 ~ T4)
test('T1: #leads 제거 및 음수 대기 타이머(#btnWaitTimer) 렌더링', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  await expect(page.locator('#leads')).toHaveCount(0);
  const btnWait = page.locator('#btnWaitTimer');
  await expect(btnWait).toBeVisible();
  await expect(btnWait).toHaveAttribute('aria-pressed', 'false');
  await btnWait.click();
  await expect(btnWait).toHaveAttribute('aria-pressed', 'true');
});

test('T2: 프리셋 저장 및 병합 다이얼로그 호출', async ({ page }) => {
  let putPayload = null;
  const mockWithPresets = {
    ...USER_DATA_SR,
    routes: [
      ...(USER_DATA_SR.routes || []),
      [
        (url) => url.pathname.includes('/presets'),
        (route) => {
          if (route.request().method() === 'GET') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({
                presets: [
                  {
                    id: 'preset-1',
                    songId: SONG_0.id,
                    name: '인트로',
                    a: 10,
                    b: 25,
                    rate: 1,
                    completed: false,
                    createdAt: '2026-11-07T00:00:00Z',
                    updatedAt: '2026-11-07T00:00:00Z',
                  },
                ],
              }),
            });
          }
          if (route.request().method() === 'PUT') {
            putPayload = JSON.parse(route.request().postData() || '{}');
            return route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({
                ok: true,
                preset: {
                  id: 'preset-1',
                  songId: SONG_0.id,
                  name: putPayload.name,
                  a: putPayload.a,
                  b: putPayload.b,
                  rate: putPayload.rate || 1,
                  completed: false,
                  createdAt: '2026-11-07T00:00:00Z',
                  updatedAt: '2026-11-07T00:00:00Z',
                },
              }),
            });
          }
          return route.continue();
        },
      ],
    ],
  };

  await mockApp(page, mockWithPresets);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  await page.locator('#presetSection').waitFor();

  await page.locator('#setA').click();
  await page.locator('#setB').click();

  const dialogTypes = [];
  page.on('dialog', async (dialog) => {
    dialogTypes.push(dialog.type());
    if (dialog.type() === 'prompt') {
      await dialog.accept('인트로');
    } else if (dialog.type() === 'confirm') {
      await dialog.accept();
    }
  });

  await page.locator('#btnSavePreset').click();
  await expect.poll(() => putPayload).not.toBeNull();
  // 같은 이름이면 병합 확인(confirm)을 거쳐야 PUT이 나간다 — confirm 가드를 지우면 여기서 깨진다
  expect(dialogTypes).toEqual(['prompt', 'confirm']);
  expect(putPayload.name).toBe('인트로');
  expect(putPayload.merge).toBe(true);
});

test('T3: 세션 커버리지 게이지 바 및 아코디언 상세 목록', async ({ page }) => {
  const sessionWithParts = {
    ...USER_DATA_SR,
    songDetail: {
      ...SR_SONG_DETAIL,
      sessions: [
        {
          id: 's-1',
          date: '2026-11-07',
          seconds: 300,
          minutes: 5,
          loops: 0,
          a: 10,
          b: 40,
          segment: '0:10–0:40',
          rate: 1,
          memo: '메모',
          coveragePct: 75,
          partStats: [
            { name: 'Part A', a: 10, b: 25, rate: 1, completed: true, seconds: 150, loops: 3 },
            { name: 'Part B', a: 25, b: 40, rate: 1, completed: false, seconds: 150, loops: 2 },
          ],
        },
      ],
    },
  };

  await mockApp(page, sessionWithParts);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#songRecord').waitFor();

  await expect(page.locator('.tl-memo')).toHaveCount(0);
  const covBar = page.locator('.tlCoverageBar').first();
  await expect(covBar).toBeVisible();

  const btnAccordion = page.locator('.btnAccordion').first();
  await expect(btnAccordion).toBeVisible();
  const partStats = page.locator('.tlPartStats').first();
  await expect(partStats).toBeHidden();
  await btnAccordion.click();
  await expect(partStats).toBeVisible();
  await expect(partStats).toContainText('Part A');
  await expect(partStats).toContainText('Part B');
});

test('T4: 테이크 .ab-select 매핑 및 구간 완료 토글', async ({ page }) => {
  let patchCompleted = null;
  const mockWithPatch = {
    ...USER_DATA_SR,
    routes: [
      ...(USER_DATA_SR.routes || []),
      [
        (url) => url.pathname.includes('/complete'),
        (route) => {
          patchCompleted = JSON.parse(route.request().postData() || '{}');
          return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              ok: true,
              take: {
                ...SR_SONG_DETAIL.takes[0],
                completed: patchCompleted.completed,
              },
            }),
          });
        },
      ],
    ],
  };

  await mockApp(page, mockWithPatch);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#srTakes').waitFor();

  const abSelects = page.locator('#srTakes .ab-select');
  await expect(abSelects).toHaveCount(2);
  await abSelects.nth(0).selectOption('a');
  await abSelects.nth(1).selectOption('b');
  await expect(abSelects.nth(0)).toHaveValue('a');
  await expect(abSelects.nth(1)).toHaveValue('b');

  const btnComp = page.locator('#srTakes .btnComplete').first();
  await expect(btnComp).toBeVisible();
  await btnComp.click();
  await expect.poll(() => patchCompleted).not.toBeNull();
  expect(patchCompleted.completed).toBe(true);
  await expect(btnComp).toContainText('✓');
});

