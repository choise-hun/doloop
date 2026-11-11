// 연습 화면 정렬 검사 (FT-2 · SR-1): 공통 검사 G0~G8 + #songRecord 배치 약속(sr-left, 1열) + 트랜스포트(transport)
// 규격: 개발산출물/프론트_정렬규격.md · 명세: 개발산출물/명세/SR-1_구현명세.md §3
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, FIXTURES, DEFAULT_ME, LONG_TITLE } = require('../support/mock-app');

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

// UXR-3: 연습 화면은 분류 목록도 함께 읽는다. 오형태({})는 오류가 되므로 빈 분류를 명시한다
const EMPTY_CATEGORIES_ROUTE = [
  (url) => url.pathname === '/api/v1/categories',
  (route) =>
    route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ categories: [] }) }),
];

const USER_DATA_SR = {
  ...STATES.userData,
  songDetail: SR_SONG_DETAIL,
  routes: [EMPTY_CATEGORIES_ROUTE],
};

const USER_EMPTY_SR = {
  ...STATES.userData,
  songDetail: { song: SONG_0, takes: [], sessions: [] },
  routes: [EMPTY_CATEGORIES_ROUTE],
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
      await expect(page.locator('#songRecord .take-row')).toHaveCount(2);
      await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);
    } else if (state === 'userEmpty') {
      await expect(page.locator('#songRecord .take-row')).toHaveCount(0);
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
  await page.locator('#srTimeline .take-row').first().waitFor();

  const abSelects = page.locator('#songRecord .ab-select');
  await expect(abSelects).toHaveCount(2);
  await abSelects.nth(0).selectOption('a');
  await abSelects.nth(1).selectOption('b');
  await expect(abSelects.nth(0)).toHaveValue('a');
  await expect(abSelects.nth(1)).toHaveValue('b');

  const btnComp = page.locator('#songRecord .btnComplete').first();
  await expect(btnComp).toBeVisible();
  await btnComp.click();
  await expect.poll(() => patchCompleted).not.toBeNull();
  expect(patchCompleted.completed).toBe(true);
  await expect(btnComp).toContainText('✓');
});

// UI-3 검증 테스트 (시작/끝 라벨, ✕ 가드, 프리셋 2행 카드, 재생 중심 필, 1120px 정렬)
test('T5 (UI-3): 시작/끝 라벨, 대기 드롭다운, 1120px 정렬 및 재생 버튼 중심 필 검증', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();

  // 1. A/B 라벨이 '시작' / '끝'으로 렌더링되는지 확인
  await expect(page.locator('#setA small')).toHaveText('시작');
  await expect(page.locator('#setB small')).toHaveText('끝');

  // 2. 대기 시간 드롭다운(#waitSelect) 렌더링 확인
  const waitSel = page.locator('#waitSelect');
  await expect(waitSel).toBeVisible();
  await expect(waitSel).toHaveValue('0');

  // 3. 1120px 컨테이너 규격 확인 (playerShell 너비가 1120px 이하)
  const shell = page.locator('[data-shell-variant="player"]');
  const box = await shell.boundingBox();
  expect(box.width).toBeLessThanOrEqual(1120);

  // 4. 재생 버튼(#playBtn)도 보조 버튼(#backBtn)과 같은 0px 직각(UXR-1 D8)
  const playRadius = await page.locator('#playBtn').evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(playRadius).toBe('0px'); // UXR-1 D8: 단독 pill 제거, 5버튼 동일 모양
  const backRadius = await page.locator('#backBtn').evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(backRadius).toBe('0px');
});

test('T6 (UI-3): ✕ 구간 해제 확인 가드 및 프리셋 덮어쓰기 검증', async ({ page }) => {
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

  // 프리셋 선택 시 업데이트 버튼(#btnUpdatePreset)과 삭제 버튼(#btnDeletePreset) 노출
  const presetSelect = page.locator('#presetSelect');
  await presetSelect.selectOption('preset-1');
  await expect(page.locator('#btnUpdatePreset')).toBeVisible();
  await expect(page.locator('#btnDeletePreset')).toBeVisible();

  // 360px 모바일 뷰포트에서 프리셋 액션 버튼 줄바꿈(flex-wrap) 및 가로 스크롤 없음 검증
  await page.setViewportSize({ width: 360, height: 740 });
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHScroll).toBe(false);

  // 덮어쓰기 클릭 시 confirm 호출 검증
  let confirmCalled = false;
  page.once('dialog', async (dialog) => {
    confirmCalled = true;
    await dialog.accept();
  });
  await page.locator('#btnUpdatePreset').click();
  await expect.poll(() => putPayload).not.toBeNull();
  expect(confirmCalled).toBe(true);
  expect(putPayload.merge).toBe(false);

  // ✕ 클릭 시 루프 해제 confirm 가드 호출 검증
  let clearConfirmCalled = false;
  page.once('dialog', async (dialog) => {
    clearConfirmCalled = true;
    await dialog.accept();
  });
  await page.locator('#clearBtn').click();
  expect(clearConfirmCalled).toBe(true);
  await expect(page.locator('#aTime')).toHaveText('--:--');
  await expect(page.locator('#bTime')).toHaveText('--:--');
});



// UXR-1 D8: 트랜스포트 5버튼은 같은 모양(단독 pill·반전 채움 없음) — 4개 폭
for (const width of [1280, 1150, 768, 390]) {
  test(`UXR1-L: 트랜스포트 5버튼 top/bottom/height 일치·재생 버튼 동일 스타일 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, USER_DATA_SR);
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#seekRow').waitFor();
    const info = await page.evaluate(() => {
      const ids = ['backBtn', 'startBtn', 'playBtn', 'fwdBtn', 'saveBtn'];
      const els = ids.map((i) => document.getElementById(i));
      const cs = (el) => getComputedStyle(el);
      const rects = els.map((el) => el.getBoundingClientRect());
      return {
        tops: rects.map((r) => Math.round(r.top * 10) / 10),
        bottoms: rects.map((r) => Math.round(r.bottom * 10) / 10),
        heights: rects.map((r) => Math.round(r.height * 10) / 10),
        play: { radius: cs(els[2]).borderRadius, bg: cs(els[2]).backgroundColor, color: cs(els[2]).color, border: cs(els[2]).borderTopColor },
        back: { radius: cs(els[0]).borderRadius, bg: cs(els[0]).backgroundColor, color: cs(els[0]).color, border: cs(els[0]).borderTopColor },
      };
    });
    for (const k of ['tops', 'bottoms', 'heights']) expect(new Set(info[k]).size, k + ' ' + info[k]).toBe(1);
    expect(info.play).toEqual(info.back);
    // 재생 중으로 바뀌어도 모양 유지
    await page.locator('#playBtn').click();
    const after = await page.evaluate(() => {
      const el = document.getElementById('playBtn');
      const c = getComputedStyle(el);
      return { radius: c.borderRadius, bg: c.backgroundColor, h: el.getBoundingClientRect().height };
    });
    expect(after.radius).toBe(info.back.radius);
    expect(after.bg).toBe(info.back.bg);
    expect(after.h).toBe(info.heights[0]);
  });
}

// ---------- UXR-3: 연습 화면 재배치 + 선택 폴더 곡 목록 ----------
const CAT_JAZZ = '00000000-0000-4000-8000-000000000301';
const CAT_POP = '00000000-0000-4000-8000-000000000302';
const CAT_EMPTY = '00000000-0000-4000-8000-000000000303';
const UX3_CATEGORIES = [
  { id: CAT_JAZZ, name: 'Jazz', sortOrder: 0, onHome: true, songCount: 2 },
  { id: CAT_POP, name: 'Pop', sortOrder: 1, onHome: true, songCount: 1 },
  { id: CAT_EMPTY, name: '빈 분류', sortOrder: 2, onHome: false, songCount: 0 },
];
// 곡1: Jazz+Pop(두 폴더), 곡2: Jazz, 곡3: 미분류
const UX3_SONGS = FIXTURES.longSongs(3).map((s, i) => ({
  ...s,
  title: `Song ${i + 1}`,
  categoryIds: [[CAT_JAZZ, CAT_POP], [CAT_JAZZ], []][i],
}));
const UX3_JSON = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });

function ux3Mock({ categories = () => ({ categories: UX3_CATEGORIES }), songs, count = {} } = {}) {
  const base = { ...STATES.userData, songs: songs || UX3_SONGS, songDetail: SR_SONG_DETAIL };
  return {
    ...base,
    routes: [
      [
        (url) => url.pathname === '/api/v1/categories',
        (route) => {
          count.cat = (count.cat || 0) + 1;
          const r = categories(count.cat);
          return r && r.__status ? UX3_JSON(route, r.body, r.__status) : UX3_JSON(route, r);
        },
      ],
    ],
  };
}

for (const width of [1280, 1150]) {
  test(`UXR3-PL01: 데스크톱 2열 배치 — 영상/설정 윗선, 재생/녹음 윗선, 기록은 아래 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, ux3Mock());
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#songRecord').waitFor();
    const r = await page.evaluate(() => {
      const b = (sel) => document.querySelector(sel).getBoundingClientRect();
      const ctl = document.getElementById('ppCtl');
      return {
        video: b('#videoBox'), seek: b('#seekRow'), play: b('#ppPlayCard'), rec: b('#ppRecCard'),
        ctl: ctl.getBoundingClientRect(), folder: b('#ppFolderPanel'), record: b('#songRecord'),
        back: b('#backBtn'), recBtn: b('#recBtn'),
      };
    });
    expect(Math.abs(r.video.top - r.ctl.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.play.top - r.rec.top)).toBeLessThanOrEqual(1);
    expect(r.play.left).toBeLessThan(r.rec.left); // 재생(왼) · 녹음(오)
    expect(r.play.top).toBeGreaterThanOrEqual(r.seek.bottom - 1); // 타임라인 아래
    expect(r.ctl.left).toBeGreaterThan(r.rec.right - 1); // 설정은 오른쪽 열
    expect(Math.abs(r.ctl.left - r.folder.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.ctl.right - r.folder.right)).toBeLessThanOrEqual(1);
    expect(r.folder.top).toBeGreaterThanOrEqual(r.ctl.bottom - 1);
    expect(r.record.top).toBeGreaterThanOrEqual(Math.max(r.rec.bottom, r.folder.bottom) - 1);
    expect(r.recBtn.top).toBeGreaterThanOrEqual(r.rec.top);
  });
}

test('UXR3-PL02: 모바일 단일 열·DOM 순서·접힘, 960↔961에서 플레이어 노드·선택 폴더 유지', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();
  const order = await page.evaluate(() => {
    const ids = ['videoBox', 'seekRow', 'ppPlayCard', 'ppRecCard', 'ppCtl', 'ppFolderPanel', 'songRecord'];
    const tops = ids.map((i) => document.getElementById(i).getBoundingClientRect().top);
    return { tops, hScroll: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect([...order.tops].sort((a, b) => a - b)).toEqual(order.tops);
  expect(order.hScroll).toBe(false);
  // 모바일은 기본 접힘: 본문은 Tab/탐색에서 제외(display:none)
  const toggle = page.locator('#folderToggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#folderList')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#folderList')).toBeVisible();
  await page.locator('#folderSelect').selectOption(CAT_POP);

  await page.evaluate(() => { window.__playerEl = document.getElementById('player'); });
  await page.setViewportSize({ width: 961, height: 900 });
  await page.setViewportSize({ width: 960, height: 900 });
  await page.setViewportSize({ width: 961, height: 900 });
  expect(await page.evaluate(() => window.__playerEl === document.getElementById('player'))).toBe(true);
  await expect(page.locator('#folderSelect')).toHaveValue(CAT_POP);
  await expect(page.locator('#folderList')).toBeVisible(); // 데스크톱은 항상 표시
});

test('UXR3-PL05: 전체/폴더/미분류 필터·곡 수·중복 소속·빈 폴더', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const items = page.locator('#folderList li button');
  await expect(items).toHaveCount(3); // 기본값: 전체 곡
  await expect(page.locator('#folderSelect')).toHaveValue('__all');
  await page.locator('#folderSelect').selectOption(CAT_JAZZ);
  await expect(items).toHaveText([/Song 1/, /Song 2/]);
  await expect(page.locator('#folderCount')).toHaveText(/2/);
  await page.locator('#folderSelect').selectOption(CAT_POP);
  await expect(items).toHaveText([/Song 1/]); // 곡1은 Pop에도 한 번만
  await page.locator('#folderSelect').selectOption('__uncategorized');
  await expect(items).toHaveText([/Song 3/]);
  await page.locator('#folderSelect').selectOption(CAT_EMPTY);
  await expect(items).toHaveCount(0);
  await expect(page.locator('#folderList')).toContainText('이 폴더에는 곡이 없습니다');
});

test('UXR3-PL06: 곡 GET 실패→재시도 성공, 분류 envelope 오형태는 오류(빈 목록과 구분)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // 1) 분류 응답이 잘못된 형태 → 오류 + 재시도로 복구
  const count = {};
  await mockApp(
    page,
    ux3Mock({ count, categories: (n) => (n === 1 ? { categories: { oops: true } } : { categories: UX3_CATEGORIES }) })
  );
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const panel = page.locator('#ppFolderPanel');
  await expect(panel).toContainText('곡 목록을 불러오지 못했습니다');
  await expect(page.locator('#folderList li button')).toHaveCount(0);
  await expect(panel).not.toContainText('저장한 곡이 없습니다');
  await page.locator('#folderRetry').click();
  await expect(page.locator('#folderList li button')).toHaveCount(3);
  await expect(panel).not.toContainText('곡 목록을 불러오지 못했습니다');
});

test('UXR3-PL03: 긴 폴더/곡 제목·30곡 스크롤(높이 ≤320, scrollHeight > clientHeight, 마지막 곡 도달/선택)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const longSongs = FIXTURES.longSongs(30).map((s, i) => ({
    ...s,
    title: `Song ${i + 1} — ${LONG_TITLE}`,
    categoryIds: [CAT_JAZZ],
  }));
  const longCategories = [
    { id: CAT_JAZZ, name: 'Very Long Category Name That Should Wrap Or Ellipsize Gracefully', sortOrder: 0, onHome: true, songCount: 30 },
  ];
  await mockApp(page, ux3Mock({ songs: longSongs, categories: () => ({ categories: longCategories }) }));
  await page.goto('/practice.html?v=abcdefghij1', { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();

  const folderBody = page.locator('#folderList');
  await expect(folderBody).toBeVisible();
  const box = await folderBody.boundingBox();
  expect(box.height).toBeLessThanOrEqual(321);

  const scroll = await folderBody.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(scroll.sh).toBeGreaterThan(scroll.ch);

  const items = folderBody.locator('li button');
  await expect(items).toHaveCount(30);

  // 마지막 곡(30번째 곡)까지 목록 내부 스크롤하여 도달
  await folderBody.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const lastBtn = items.last();
  await expect(lastBtn).toBeVisible();
  await expect(lastBtn).toContainText('Song 30');

  // 목록 내부 스크롤 조작 중 페이지 전체 스크롤 점프 없음
  const pageY = await page.evaluate(() => window.scrollY);
  expect(pageY).toBeLessThanOrEqual(10);
});

test('UXR3-PL04: 홈에서 삭제/미존재 분류 전달 시 전체 곡 복구 및 안내', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, ux3Mock());
  // 존재하지 않는 분류 ID를 sessionStorage에 설정
  await page.addInitScript(() => {
    sessionStorage.setItem('ulp:open-category', '00000000-0000-4000-8000-000000000399');
  });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();

  // 삭제된 분류는 전체로 복구되고 안내 메시지 표시
  await expect(page.locator('#folderSelect')).toHaveValue('__all');
  const panel = page.locator('#ppFolderPanel');
  await expect(panel).toContainText('선택한 폴더를 찾을 수 없어 전체 곡을 표시합니다');
  // 세션 스토리지 값은 소비됨
  expect(await page.evaluate(() => sessionStorage.getItem('ulp:open-category'))).toBeNull();
  // 현재 곡이 다중 분류(곡1: Jazz+Pop)여도 임의로 폴더가 변경되지 않고 __all 유지
  await expect(page.locator('#folderSelect')).toHaveValue('__all');
});

test('UXR3-PL07: A 조회 중 B 로그인 계정 경합 — 지연 응답 해제 후 B 화면에 A 데이터 없음', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let resolveUserASongs;
  const userASongsDelayed = new Promise((r) => { resolveUserASongs = r; });
  let resolveUserBSongs;
  const userBSongsDelayed = new Promise((r) => { resolveUserBSongs = r; });

  const userAId = '00000000-0000-4000-8000-000000000001';
  const userBId = '00000000-0000-4000-8000-000000000002';
  const songA = { ...UX3_SONGS[0], id: 'song-a-1', title: 'User A Secret Song' };
  const songB = { ...UX3_SONGS[1], id: 'song-b-1', title: 'User B Welcome Song' };

  let currentUid = userAId;
  let songsReqCount = 0;
  await mockApp(page, {
    ...STATES.userData,
    routes: [
      [
        (url) => url.pathname.startsWith('/api/v1/me'),
        (route) => UX3_JSON(route, { ...DEFAULT_ME, id: currentUid, email: currentUid === userAId ? 'a@example.com' : 'b@example.com' }),
      ],
      [
        (url) => url.pathname === '/api/v1/songs' && url.searchParams.get('brief') !== '1',
        async (route) => {
          songsReqCount++;
          if (songsReqCount === 1) {
            await userASongsDelayed;
            return UX3_JSON(route, { songs: [songA] });
          }
          await userBSongsDelayed;
          return UX3_JSON(route, { songs: [songB] });
        },
      ],
      [
        (url) => url.pathname === '/api/v1/categories',
        (route) => UX3_JSON(route, { categories: UX3_CATEGORIES }),
      ],
    ],
  });

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();

  // A 요청이 진행 중인 상태에서 B로 로그인 전환
  currentUid = userBId;
  await page.evaluate((bId) => {
    window.__supabaseAuthListener('SIGNED_IN', {
      access_token: 'fake-jwt-token-b',
      user: { id: bId, email: 'b@example.com', user_metadata: {} },
    });
  }, userBId);

  // A 응답 먼저 해제
  resolveUserASongs();

  // B 화면에는 여전히 A 데이터가 노출되지 않음
  const panel = page.locator('#ppFolderPanel');
  await expect(panel).not.toContainText('User A Secret Song');

  // 이제 B 응답 해제
  resolveUserBSongs();

  // B 화면에는 B의 곡만 표시되고 A 곡은 없음
  await expect(panel).toContainText('User B Welcome Song');
  await expect(panel).not.toContainText('User A Secret Song');
});

test('UXR3-PL09: 현재 곡 재클릭 no-op, 다른 곡 전환 중 잠금(aria-disabled)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let resolveSaveProgress;
  const saveProgressDelayed = new Promise((r) => { resolveSaveProgress = r; });
  let saveReqCount = 0;

  await mockApp(page, {
    ...STATES.userData,
    songs: UX3_SONGS,
    songDetail: { song: UX3_SONGS[0], sessions: [], takes: [] },
    routes: [
      [
        (url) => url.pathname === '/api/v1/practice/save',
        async (route) => {
          saveReqCount++;
          await saveProgressDelayed;
          return UX3_JSON(route, { ok: true, song: UX3_SONGS[0] });
        },
      ],
      [
        (url) => url.pathname === '/api/v1/categories',
        (route) => UX3_JSON(route, { categories: UX3_CATEGORIES }),
      ],
    ],
  });

  // 곡1로 진입 (videoId = UX3_SONGS[0].videoId)
  await page.goto(`/practice.html?v=${UX3_SONGS[0].videoId}`, { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();

  const song1Btn = page.locator('#folderList li button').first();
  const song2Btn = page.locator('#folderList li button').nth(1);

  // 현재 곡은 aria-current="true"
  await expect(song1Btn).toHaveAttribute('aria-current', 'true');
  await expect(song2Btn).not.toHaveAttribute('aria-current', 'true');

  // 현재 곡 재클릭: no-op (진행 저장이나 전환 발생 안 함)
  await song1Btn.click();
  expect(saveReqCount).toBe(0);

  // 배속 버튼을 클릭하여 변경 사항(dirty)을 생성
  await page.locator('#rates button', { hasText: '0.75' }).click();

  // 다른 곡 클릭: 진행 저장 완료까지 곡 버튼들에 aria-disabled="true"
  await song2Btn.click();
  await expect(song1Btn).toHaveAttribute('aria-disabled', 'true');
  await expect(song2Btn).toHaveAttribute('aria-disabled', 'true');

  // 지연된 저장 응답 완료 후 잠금 해제 및 aria-current 이동
  resolveSaveProgress();
  await expect(song2Btn).toHaveAttribute('aria-current', 'true');
  await expect(song1Btn).not.toHaveAttribute('aria-disabled', 'true');
  await expect(song2Btn).not.toHaveAttribute('aria-disabled', 'true');
});

// RECFIX-1(F7): PL-08 — 현재 곡 분류 할당 성공이 인라인 선택 폴더 목록에 같은 데이터로 반영된다
test('UXR3-PL08: 현재 곡을 빈 분류에 넣으면 그 폴더 목록·곡 수에 즉시 나타나고 실패하면 되돌린다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const mock = ux3Mock();
  let patchFail = false;
  const patches = [];
  mock.routes.push([
    (url) => /^\/api\/v1\/songs\/[^/]+$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      const body = route.request().postDataJSON();
      patches.push(body);
      if (patchFail) return UX3_JSON(route, { code: 'INTERNAL' }, 500);
      return UX3_JSON(route, { song: { ...UX3_SONGS[0], categoryIds: body.categoryIds } });
    },
  ]);
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const items = page.locator('#folderList li button');
  await page.locator('#folderSelect').selectOption(CAT_EMPTY);
  await expect(items).toHaveCount(0);

  await page.locator('#songCatBtn').click();
  await page.locator(`#songCatPop [data-category="${CAT_EMPTY}"] input`).check();
  await expect(items).toHaveText([/Song 1/]);
  await expect(page.locator('#folderCount')).toHaveText(/1/);
  expect(patches.at(-1).categoryIds).toContain(CAT_EMPTY);

  // 실패하면 화면 반영을 되돌린다(성공으로 남기지 않음)
  patchFail = true;
  await page.locator(`#songCatPop [data-category="${CAT_EMPTY}"] input`).uncheck();
  await expect(items).toHaveText([/Song 1/]);
  await expect(page.locator(`#songCatPop [data-category="${CAT_EMPTY}"] input`)).toBeChecked();
});

// RECFIX-1(F7): PL-11 — 모바일에서 접힌 목록 본문은 키보드 Tab 순서에서 빠지고, 펼치면 첫 곡에 도달한다
test('UXR3-PL11: 390 접힘 상태에서 #folderToggle 다음 Tab이 목록 안으로 들어가지 않고, 펼치면 첫 곡에 도달', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const toggle = page.locator('#folderToggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', /.+/);
  await toggle.focus();
  const inList = async () => page.evaluate(() => Boolean(document.activeElement?.closest('#folderList')));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await inList()).toBe(false);
  }
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await inList();
  }
  expect(reached).toBe(true);
});

test('UXR3-PL10: guest / Drive 미연결 / 녹음 상태 가드', async ({ page }) => {
  // 1) guest 상태: 드라이브 배너 없음, 폴더 로그인 유도
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await expect(page.locator('#recDriveBanner')).toBeHidden();
  await expect(page.locator('#ppFolderPanel')).toContainText('로그인하면 폴더별 곡 목록을 볼 수 있어요');

  // 2) 로그인 + Drive 미연결: 배너 노출, 영상 없음일 때 녹음 버튼 disabled
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html', { waitUntil: 'load' }); // 영상 없음
  await expect(page.locator('#recDriveBanner')).toBeVisible();
  await expect(page.locator('#recBtn')).toBeDisabled();
  // 로그인 목록은 영상이 없어도 사용 가능
  await expect(page.locator('#folderList li button')).toHaveCount(3);
});
