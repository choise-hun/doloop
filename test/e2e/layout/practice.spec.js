// 연습 화면 정렬 검사 (FT-2 · SR-1): 공통 검사 G0~G8 + #songRecord 배치 약속(sr-left, 1열) + 트랜스포트(transport)
// 규격: 개발산출물/프론트_정렬규격.md · 명세: 개발산출물/명세/SR-1_구현명세.md §3
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, FIXTURES, DEFAULT_ME, LONG_TITLE } = require('../support/mock-app');
const { pickOptionAt, expectValueAt } = require('../support/app-select');

const SONG_0 = FIXTURES.longSongs(1)[0];

// SL-1 ⑤: 플레이어 선택창은 공용 AppSelect(박스 = #id, 목록 = #id-list). 고른 값은 박스의 data-value
async function pickOption(page, id, value) {
  await page.locator(`#${id}`).click();
  await page.locator(`#${id}-list [data-value="${value}"]`).click();
  await expect(page.locator(`#${id}-list`)).toHaveCount(0);
}

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

  // 브라우저 기본 입력창(prompt/confirm)은 더 쓰지 않는다 — 모달로 이름을 받는다
  const dialogTypes = [];
  page.on('dialog', (dialog) => { dialogTypes.push(dialog.type()); void dialog.dismiss(); });

  await page.locator('#btnSavePreset').click();
  const modal = page.locator('#presetDialog');
  await expect(modal).toBeVisible();
  await expect(page.locator('#presetDialogInput')).toBeFocused();
  await expect(page.locator('#presetDialogSave')).toBeDisabled(); // 빈 이름은 저장 불가

  // Esc로 닫으면 PUT 없이 닫히고 저장 버튼으로 초점이 돌아온다
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#btnSavePreset')).toBeFocused();
  expect(putPayload).toBeNull();

  await page.locator('#btnSavePreset').click();
  await page.locator('#presetDialogInput').fill('인트로');
  // 같은 이름이면 합쳐진다는 안내와 버튼 문구가 바뀐다
  await expect(page.locator('#presetDialogNote')).toHaveText('같은 이름의 프리셋이 있어요. 저장하면 기존 구간에 합쳐집니다.');
  await expect(page.locator('#presetDialogSave')).toHaveText('합쳐서 저장');
  await page.locator('#presetDialogInput').press('Enter');
  await expect.poll(() => putPayload).not.toBeNull();
  await expect(modal).toHaveCount(0);
  expect(dialogTypes).toEqual([]);
  expect(putPayload.name).toBe('인트로');
  expect(putPayload.merge).toBe(true);
});

test('T2b: 프리셋 저장 응답을 기다리는 동안 초점이 모달 안에 남아 Space가 재생으로 새지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release;
  const gate = new Promise((r) => { release = r; });
  await mockApp(page, {
    ...USER_DATA_SR,
    routes: [...(USER_DATA_SR.routes || []), [(url) => url.pathname.includes('/presets'), async (route) => {
      if (route.request().method() !== 'PUT') return route.fulfill({ json: { presets: [] } });
      await gate;
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: { preset: { id: 'p-new', name: body.name, a: body.a, b: body.b, rate: 1, parts: [] } } });
    }]],
  });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#presetSection').waitFor();
  await page.locator('#setA').click();
  await page.locator('#setB').click();
  await page.locator('#btnSavePreset').click();
  await page.locator('#presetDialogInput').fill('벌스');
  await page.locator('#presetDialogInput').press('Enter');
  await expect(page.locator('#presetDialogSave')).toBeDisabled();
  const inside = () => page.evaluate(() => document.getElementById('presetDialog').contains(document.activeElement));
  expect(await inside()).toBe(true);
  await page.keyboard.press('Tab');
  expect(await inside()).toBe(true);
  const label = await page.locator('#playBtn').getAttribute('aria-label');
  await page.keyboard.press('Space');
  await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', label);
  release();
  await expect(page.locator('#presetDialog')).toHaveCount(0);
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
  await pickOptionAt(page, abSelects.nth(0), 'a');
  await pickOptionAt(page, abSelects.nth(1), 'b');
  await expectValueAt(abSelects.nth(0), 'a');
  await expectValueAt(abSelects.nth(1), 'b');

  const btnComp = page.locator('#songRecord .btnComplete').first();
  await expect(btnComp).toBeVisible();
  await btnComp.click();
  await expect.poll(() => patchCompleted).not.toBeNull();
  expect(patchCompleted.completed).toBe(true);
  await expect(btnComp).toContainText('✓');
});

// UI-3 검증 테스트 (시작/끝 라벨, ✕ 가드, 프리셋 2행 카드, 재생 중심 필, 1120px 정렬)
test('T5 (UI-3): 시작/끝 라벨, 0/3초 버튼, 1120px 정렬 및 재생 버튼 중심 필 검증', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();

  // 1. A/B 라벨이 '시작' / '끝'으로 렌더링되는지 확인
  await expect(page.locator('#setA small')).toHaveText('시작');
  await expect(page.locator('#setB small')).toHaveText('끝');

  // UXN correction: the timer button is the only wait control.
  await expect(page.locator('#waitSelect')).toHaveCount(0);
  await expect(page.locator('#btnWaitTimer')).toHaveText('0s');

  // 3. WF-2: 창이 낮으면(1280×800) 플레이어 틀은 기존 1120px을 유지한다(넓은 창은 WF2-W)
  const shell = page.locator('[data-shell-variant="player"]');
  const box = await shell.boundingBox();
  expect(box.width).toBe(1120);

  // 4. 재생 버튼(#playBtn)도 보조 버튼(#backBtn)과 같은 3px 블록(UXR-1 D8 같은 모양 유지 + DS2-3 블록 3px)
  const playRadius = await page.locator('#playBtn').evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(playRadius).toBe('3px'); // UXR-1 D8: 단독 pill 제거, 5버튼 동일 모양
  const backRadius = await page.locator('#backBtn').evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(backRadius).toBe('3px');
});

// DS2-3: 토큰을 실제 계산값으로 해석한다(라이트·다크 공통 비교).
async function ds23Tokens(page) {
  return page.evaluate(() => {
    const read = (prop, val) => {
      const el = document.createElement('span');
      el.style[prop] = val;
      document.body.appendChild(el);
      const out = window.getComputedStyle(el)[prop];
      el.remove();
      return out;
    };
    return {
      fill2: read('color', 'var(--fill2)'),
      seamHairline: read('color', 'var(--seam-hairline)'),
      reliefBottomMid: read('color', 'var(--relief-bottom-mid)'),
      shadowAmbient: read('color', 'var(--shadow-ambient)'),
      accent: read('backgroundColor', 'var(--accent)'),
    };
  });
}
const ds23Box = (el) => {
  const s = window.getComputedStyle(el);
  return {
    left: s.borderLeftWidth, leftColor: s.borderLeftColor, top: s.borderTopWidth, topColor: s.borderTopColor,
    radius: s.borderTopLeftRadius, shadow: s.boxShadow, bgImage: s.backgroundImage, bg: s.backgroundColor,
    border: s.borderTopStyle,
  };
};

test('DS23-P1 스파인 카드: 재생·구간·폴더·곡 기록 fill2 3px(UF-1), 머리 막대·영상 제외 (1280)', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  await page.locator('#songRecord .panel:visible').first().waitFor();
  const tk = await ds23Tokens(page);
  for (const sel of ['#ppPlayCard', '#ppCtl', '#ppFolderPanel', '#songRecord .panel:visible']) {
    const b = await page.locator(sel).first().evaluate(ds23Box);
    expect(b.left, sel).toBe('3px');
    expect(b.leftColor, sel).toBe(tk.fill2);
    expect(b.top, sel).toBe('1px');
    expect(b.topColor, sel).toBe(tk.seamHairline);
    expect(b.radius, sel).toBe('3px');
    expect(b.shadow, sel).toContain(tk.shadowAmbient);
    expect(b.shadow, sel).not.toContain(tk.reliefBottomMid);
  }
  const head = await page.locator('header.pp-head').evaluate(ds23Box);
  expect(head.radius).toBe('3px');
  expect(head.left).toBe('1px');
  expect(head.leftColor).toBe(tk.seamHairline);
  const video = await page.locator('#videoBox').evaluate(ds23Box);
  expect(video.radius).toBe('0px');
  expect(video.left).toBe('1px');
});

test('DS23-P2 영상 있음: 필 0개, 트랜스포트·보조 버튼 3px, 속도 세그먼트 (1280)', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  await page.locator('#songRecord .panel:visible').first().waitFor();
  const tk = await ds23Tokens(page);
  expect(await page.locator('header.pp-head').evaluate((el) => {
    const wrap = el.parentElement;
    return [...wrap.querySelectorAll('a, button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && window.getComputedStyle(b).borderTopLeftRadius === '9999px';
    }).map((b) => b.id || b.textContent.trim().slice(0, 20));
  })).toEqual([]);
  for (const sel of ['#playBtn', '#backBtn', '#recBtn', '#saveBtn', '#loopBtn', '#songCatBtn', '#libBtn', '#folderSelect', '#presetSelect', '#clearBtn', '#btnWaitTimer']) {
    expect(await page.locator(sel).evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius), sel).toBe('3px');
  }
  // 공용 .ghostBtn을 덮은 보조 버튼: 줄눈 테두리 + cream 배경(필·먹색 테두리 잔존 금지)
  const cat = await page.locator('#songCatBtn').evaluate(ds23Box);
  expect(cat.topColor).toBe(tk.seamHairline);
  // 프리셋 텍스트 버튼은 배경·테두리 없음 유지(주의 3)
  const presetBtns = page.locator('#ppCtl button[class*="presetBtn"], #ppCtl button[class*="presetDeleteBtn"]');
  expect(await presetBtns.count()).toBeGreaterThan(0);
  for (const b of await presetBtns.all()) {
    const st = await b.evaluate(ds23Box);
    expect(st.bg).toBe('rgba(0, 0, 0, 0)');
    expect(st.border).toBe('none');
  }
  const rates = page.locator('#rates');
  expect(await rates.evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  for (const b of await rates.locator('button').all()) {
    expect(await b.evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('0px');
  }
  expect(await rates.locator('button[aria-pressed="true"]').first().evaluate((el) => window.getComputedStyle(el).backgroundColor)).toBe(tk.accent);
});

test('DS23-P3 영상 없음: #urlForm 열기만 필, 서랍 열기는 3px, 입력 16px, 시간 T4 (1280)', async ({ page }) => {
  await mockApp(page, STATES.guest);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/practice.html', { waitUntil: 'load' });
  await page.locator('#urlForm').waitFor();
  const submit = page.locator('#urlForm button[type="submit"]');
  expect(await submit.evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('9999px');
  expect(await page.locator('header.pp-head').evaluate((el) => [...el.parentElement.querySelectorAll('a, button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && window.getComputedStyle(b).borderTopLeftRadius === '9999px';
  }).length)).toBe(1);
  const input = await page.locator('#urlInput').evaluate((el) => ({ r: window.getComputedStyle(el).borderTopLeftRadius, f: window.getComputedStyle(el).fontSize }));
  expect(input).toEqual({ r: '3px', f: '16px' });
  await page.locator('#libBtn').click();
  await expect(page.locator('#lib')).toBeVisible();
  expect(await page.locator('#urlForm2 button[type="submit"]').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  const input2 = await page.locator('#urlInput2').evaluate((el) => ({ r: window.getComputedStyle(el).borderTopLeftRadius, f: window.getComputedStyle(el).fontSize }));
  expect(input2).toEqual({ r: '3px', f: '16px' });
  expect(await page.locator('#lib').evaluate((el) => [...el.querySelectorAll('a, button')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && window.getComputedStyle(b).borderTopLeftRadius === '9999px';
  }).length)).toBe(0);
  const tNow = await page.locator('#tNow').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { family: s.fontFamily, spacing: s.letterSpacing, weight: s.fontWeight, transform: s.textTransform };
  });
  expect(tNow.family.toLowerCase()).toMatch(/mono/);
  expect(tNow.spacing).toBe('0.96px');
  expect(tNow.weight).toBe('500');
  expect(tNow.transform).toBe('uppercase');
});

test('DS23-P4 다크: 스파인 fill2 다크 값(UF-1 화이트)·평면 배경 (1280)', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const ctl = await page.locator('#ppCtl').evaluate(ds23Box);
  expect(ctl.leftColor).toBe('rgb(236, 236, 228)');
  const play = await page.locator('#ppPlayCard').evaluate(ds23Box);
  expect(play.bgImage).toBe('none'); // UF-1 D1: 그라데이션 두께감 제거
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
  await pickOption(page, 'presetSelect', 'preset-1');
  await expect(page.locator('#btnUpdatePreset')).toBeVisible();
  await expect(page.locator('#btnDeletePreset')).toBeVisible();
  await expect(page.locator('#btnDeletePreset')).toHaveText('삭제');
  await expect(page.locator('#btnSavePreset')).toHaveText('다른 이름 저장');

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



// WF-2: 창이 크면 영상도 커진다(폭 상한 1760px, 높이는 창 안)
for (const [w, h, minVideo] of [[1920, 1080, 1200], [1440, 900, 900], [2560, 1440, 1380]]) {
  test(`WF2-W: ${w}×${h} 창에서 영상 폭 ≥ ${minVideo}px, 재생 줄까지 한 화면, 머리 메뉴·본문 좌우선 일치`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await mockApp(page, USER_DATA_SR);
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#seekRow').waitFor();
    const r = await page.evaluate(() => {
      const b = (sel) => document.querySelector(sel).getBoundingClientRect();
      return { shell: b('[data-shell-variant="player"]'), nav: b('nav.site-nav'), foot: b('footer'), video: b('#videoBox'), play: b('#ppPlayCard'), ctl: b('#ppCtl') };
    });
    expect(r.video.width).toBeGreaterThanOrEqual(minVideo);
    expect(r.shell.width).toBeLessThanOrEqual(1760);
    expect(r.play.bottom).toBeLessThanOrEqual(h);
    expect(Math.abs(r.nav.left - r.video.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.nav.right - r.ctl.right)).toBeLessThanOrEqual(1);
    expect(Math.round(r.ctl.width)).toBe(360); // 오른쪽 열은 그대로
    // 꼬리(라이트|다크 줄)도 머리 메뉴처럼 넓어진 틀 폭을 따른다
    expect(Math.abs(r.foot.left - r.nav.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.foot.right - r.nav.right)).toBeLessThanOrEqual(1);
  });
}

// WF-2(C안): 녹음은 재생 줄 안(+5와 저장 사이). 전화 폭에서는 둘째 줄 전체
for (const width of [1280, 1150, 768, 390]) {
  test(`WF2-C: 녹음 버튼 위치 — 재생 줄 안 +5 · 녹음 · 저장 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, USER_DATA_SR);
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#seekRow').waitFor();
    await expect(page.locator('#ppRecCard')).toHaveCount(0);
    const r = await page.evaluate(() => {
      const b = (id) => { const x = document.getElementById(id).getBoundingClientRect(); return { top: x.top, bottom: x.bottom, left: x.left, right: x.right, width: x.width, height: x.height }; };
      return { card: b('ppPlayCard'), start: b('startBtn'), fwd: b('fwdBtn'), rec: b('recBtn'), save: b('saveBtn'), inCard: document.getElementById('ppPlayCard').contains(document.getElementById('recBtn')) };
    });
    expect(r.inCard).toBe(true);
    if (width > 600) {
      expect(Math.abs(r.rec.top - r.fwd.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.rec.bottom - r.fwd.bottom)).toBeLessThanOrEqual(1);
      expect(r.rec.left).toBeGreaterThanOrEqual(r.fwd.right);
      expect(r.save.left).toBeGreaterThanOrEqual(r.rec.right); // 저장이 맨 오른쪽
      expect(r.rec.width).toBeLessThan(150); // 예전 녹음 상자보다 좁다
    } else {
      expect(r.rec.top).toBeGreaterThanOrEqual(r.save.bottom); // 둘째 줄
      expect(Math.abs(r.rec.left - r.start.left)).toBeLessThanOrEqual(1); // PR-1: 첫 칸은 ⏮
      expect(Math.abs(r.rec.right - r.save.right)).toBeLessThanOrEqual(1);
      expect(r.rec.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('WF2-P1: 마이크 권한 오류는 상자 밖 팝오버로 뜨고 재생 상자 높이는 변하지 않는다, ×로 닫힌다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: deny } });
  });
  await mockApp(page, USER_DATA_SR);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  const cardBox = () => page.locator('#ppPlayCard').boundingBox();
  const before = await cardBox();
  await expect(page.locator('#recPop')).toBeHidden();
  await page.locator('#recBtn').click();
  const pop = page.locator('#recPop');
  await expect(pop).toBeVisible();
  await expect(page.locator('#recMsg')).toHaveText('마이크 권한이 필요해요. 브라우저 주소창에서 마이크를 허용해 주세요');
  const after = await cardBox();
  expect(after.height).toBe(before.height);
  const popBox = await pop.boundingBox();
  expect(popBox.y + popBox.height).toBeLessThanOrEqual(after.y + 1); // 상자 위쪽 바깥
  expect(popBox.x).toBeGreaterThanOrEqual(0);
  await page.locator('#recPopClose').click();
  await expect(pop).toBeHidden();
  await expect(page.locator('#recBtn')).toBeFocused();
});

test('WF2-P2: Drive 미연결은 주황 점 + 짧은 글자, 누르면 팝오버에 안내와 연결 버튼', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  const status = page.locator('#recDriveBanner');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('Drive 미연결');
  await expect(page.locator('#recDriveBadge')).toBeHidden();
  await expect(page.locator('#btnRecDriveConnect')).toBeHidden();
  await expect(status).toHaveAttribute('aria-expanded', 'false');
  await status.click();
  await expect(status).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#recPop')).toContainText('Google Drive 미연결 시 가장 최근 연습 곡 1곡만 서버에 녹음할 수 있어요.');
  await expect(page.locator('#btnRecDriveConnect')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#recPop')).toBeHidden();
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

// PR-1: 재생 줄 순서 ⏮ 맨 왼쪽 + −5 · ▶ · +5, 대기 시간 묶음 상한·반복 버튼 확대 (결과/M0-0 §4 4~6)
for (const width of [1280, 1150, 768, 390]) {
  test(`PR1-O: 재생 줄 순서 ⏮ · −5 · ▶ · +5 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, USER_DATA_SR);
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#seekRow').waitFor();
    const r = await page.evaluate(() => {
      const b = (id) => document.getElementById(id).getBoundingClientRect();
      const ids = ['startBtn', 'backBtn', 'playBtn', 'fwdBtn', 'recBtn', 'saveBtn'];
      const row = document.getElementById('startBtn').parentElement;
      const rowCs = getComputedStyle(row);
      const rr = row.getBoundingClientRect();
      return {
        rects: Object.fromEntries(ids.map((i) => [i, b(i)])),
        rowLeft: rr.left + parseFloat(rowCs.paddingLeft),
        rowRight: rr.right - parseFloat(rowCs.paddingRight),
        firstId: row.firstElementChild.id,
      };
    });
    const { startBtn: s, backBtn: bk, playBtn: p, fwdBtn: f } = r.rects;
    expect(r.firstId).toBe('startBtn'); // DOM 순서도 ⏮이 먼저(Tab 순서 = 보이는 순서)
    expect(Math.abs(s.left - r.rowLeft)).toBeLessThanOrEqual(1); // ⏮ 맨 왼쪽
    expect(bk.left).toBeGreaterThanOrEqual(s.right);
    expect(p.left).toBeGreaterThanOrEqual(bk.right);
    expect(f.left).toBeGreaterThanOrEqual(p.right);
    expect(p.width).toBeGreaterThanOrEqual(bk.width - 1); // ▶가 가운데 묶음의 중심
    if (width <= 600) {
      // 전화 폭 5칸(⏮ −5 ▶ +5 저장): ▶가 줄 정가운데
      const mid = (r.rowLeft + r.rowRight) / 2;
      expect(Math.abs((p.left + p.right) / 2 - mid)).toBeLessThanOrEqual(1);
    } else {
      expect(r.rects.recBtn.left).toBeGreaterThanOrEqual(f.right);
    }
  });
}

test('PR1-I: 처음으로(#startBtn)는 글자 ⏮가 아니라 SVG 아이콘, 접근 이름 유지', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, USER_DATA_SR);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#seekRow').waitFor();
  const btn = page.locator('#startBtn');
  await expect(btn).toHaveAttribute('aria-label', /\S/);
  const info = await btn.evaluate((el) => {
    const svg = el.querySelector('svg');
    const r = svg && svg.getBoundingClientRect();
    return { text: el.textContent.trim(), hasSvg: !!svg, hidden: svg && svg.getAttribute('aria-hidden'), w: r && r.width, h: r && r.height, fill: svg && getComputedStyle(svg).fill, color: getComputedStyle(el).color };
  });
  expect(info.text).toBe(''); // U+23EE 같은 글자 없음(모바일 컬러 이모지 방지)
  expect(info.hasSvg).toBe(true);
  expect(info.hidden).toBe('true');
  expect(info.w).toBeGreaterThanOrEqual(18);
  expect(info.h).toBeGreaterThanOrEqual(18);
  expect(info.fill).toBe(info.color); // currentColor — 다크 모드·비활성도 글자색을 따른다
});

// UXN-A's previous secondary wait/wrap expectations are superseded by UXN-AC below.

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
  test(`UXR3-PL01: 데스크톱 2열 배치 — 영상/설정 윗선, 재생 줄은 타임라인 아래, 기록은 아래 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, ux3Mock());
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#songRecord').waitFor();
    const r = await page.evaluate(() => {
      const b = (sel) => document.querySelector(sel).getBoundingClientRect();
      const ctl = document.getElementById('ppCtl');
      return {
        video: b('#videoBox'), seek: b('#seekRow'), play: b('#ppPlayCard'),
        ctl: ctl.getBoundingClientRect(), folder: b('#ppFolderPanel'), record: b('#songRecord'),
        back: b('#backBtn'), recBtn: b('#recBtn'),
      };
    });
    expect(Math.abs(r.video.top - r.ctl.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.play.right - r.video.right)).toBeLessThanOrEqual(1); // WF-2: 재생 상자 하나가 영상 폭 전체
    expect(r.play.top).toBeGreaterThanOrEqual(r.seek.bottom - 1); // 타임라인 아래
    expect(r.ctl.left).toBeGreaterThan(r.play.right - 1); // 설정은 오른쪽 열
    expect(Math.abs(r.ctl.left - r.folder.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.ctl.right - r.folder.right)).toBeLessThanOrEqual(1);
    expect(r.folder.top).toBeGreaterThanOrEqual(r.ctl.bottom - 1);
    expect(r.record.top).toBeGreaterThanOrEqual(Math.max(r.play.bottom, r.folder.bottom) - 1);
    expect(r.recBtn.top).toBeGreaterThanOrEqual(r.play.top);
  });
}

test('UXR3-PL02: 모바일 단일 열·DOM 순서·목록 바로 표시(SL-1 D9), 960↔961에서 플레이어 노드·선택 폴더 유지', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#ppFolderPanel').waitFor();
  const order = await page.evaluate(() => {
    const ids = ['videoBox', 'seekRow', 'ppPlayCard', 'ppCtl', 'ppFolderPanel', 'songRecord'];
    const tops = ids.map((i) => document.getElementById(i).getBoundingClientRect().top);
    return { tops, hScroll: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect([...order.tops].sort((a, b) => a - b)).toEqual(order.tops);
  expect(order.hScroll).toBe(false);
  // SL-1 D9: 펼치기 버튼 없음 — 모바일도 목록이 바로 보이고 안에서 스크롤
  await expect(page.locator('#folderToggle')).toHaveCount(0);
  await expect(page.locator('#folderList')).toBeVisible();
  await pickOption(page, 'folderSelect', CAT_POP);

  await page.evaluate(() => { window.__playerEl = document.getElementById('player'); });
  await page.setViewportSize({ width: 961, height: 900 });
  await page.setViewportSize({ width: 960, height: 900 });
  await page.setViewportSize({ width: 961, height: 900 });
  expect(await page.evaluate(() => window.__playerEl === document.getElementById('player'))).toBe(true);
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', CAT_POP);
  await expect(page.locator('#folderList')).toBeVisible();
});

test('UXR3-PL05: 전체/폴더/미분류 필터·곡 수·중복 소속·빈 폴더', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const items = page.locator('#folderList li button');
  await expect(items).toHaveCount(3); // 기본값: 전체 곡
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', '__all');
  await pickOption(page, 'folderSelect', CAT_JAZZ);
  await expect(items).toHaveText([/Song 1/, /Song 2/]);
  await expect(page.locator('#folderCount')).toHaveText(/2/);
  await pickOption(page, 'folderSelect', CAT_POP);
  await expect(items).toHaveText([/Song 1/]); // 곡1은 Pop에도 한 번만
  await pickOption(page, 'folderSelect', '__uncategorized');
  await expect(items).toHaveText([/Song 3/]);
  await pickOption(page, 'folderSelect', CAT_EMPTY);
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
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', '__all');
  const panel = page.locator('#ppFolderPanel');
  await expect(panel).toContainText('선택한 폴더를 찾을 수 없어 전체 곡을 표시합니다');
  // 세션 스토리지 값은 소비됨
  expect(await page.evaluate(() => sessionStorage.getItem('ulp:open-category'))).toBeNull();
  // 현재 곡이 다중 분류(곡1: Jazz+Pop)여도 임의로 폴더가 변경되지 않고 __all 유지
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', '__all');
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
  await pickOption(page, 'folderSelect', CAT_EMPTY);
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

// RECFIX-1(F7): PL-11 → SL-1 D9로 접힘이 없어졌다. 390에서 폴더 박스 다음 Tab이 곧 목록 첫 곡에 닿는다
test('UXR3-PL11: 390 폴더 박스(#folderSelect) 다음 Tab으로 목록 첫 곡에 도달', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, ux3Mock());
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const box = page.locator('#folderSelect');
  await expect(box).toHaveAttribute('aria-controls', /.+/);
  await box.focus();
  const inList = async () => page.evaluate(() => Boolean(document.activeElement?.closest('#folderList')));
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
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


// UXN-Z: URL focus must not trigger iOS's small-input auto zoom.
for (const width of [390, 768, 1150, 1280]) {
  test(`UXN-Z ${width}: both video URL inputs use 16px without crowding the open button`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, STATES.guest);
    await page.goto('/practice.html', { waitUntil: 'load' });
    const input = page.locator('#urlInput');
    await expect(input).toBeVisible();
    await expect(input).toHaveCSS('font-size', '16px');
    for (const id of ['urlInput', 'urlInput2']) {
      const size = await page.locator('#' + id).evaluate(element => ({
        font: getComputedStyle(element).fontSize,
        minHeight: parseFloat(getComputedStyle(element).minHeight),
      }));
      expect(size.font).toBe('16px');
      expect(size.minHeight).toBeGreaterThanOrEqual(44);
    }
    const box = await input.boundingBox();
    const open = await page.locator('#urlForm button').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(open.x);
    expect(open.x + open.width).toBeLessThanOrEqual(width);
    if (process.env.LAYOUT_SHOTS) {
      await input.scrollIntoViewIfNeeded();
      await page.locator('#urlForm').screenshot({ path: `test-results/uxn-input/form-${width}.png` });
    }
    await page.locator('#libBtn').click();
    const drawerInput = page.locator('#urlInput2');
    await expect(drawerInput).toBeVisible();
    await expect(drawerInput).toHaveCSS('font-size', '16px');
    const drawer = await drawerInput.boundingBox();
    const drawerOpen = await page.locator('#urlForm2 button').boundingBox();
    expect(drawer.x + drawer.width).toBeLessThanOrEqual(drawerOpen.x);
    expect(drawerOpen.x + drawerOpen.width).toBeLessThanOrEqual(width);
    if (process.env.LAYOUT_SHOTS) {
      await page.locator('#urlForm2').screenshot({ path: `test-results/uxn-input/drawer-${width}.png` });
      if (width === 1280) {
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await page.locator('#urlForm2').screenshot({ path: 'test-results/uxn-input/drawer-dark.png' });
      }
    }
  });
}


for (const width of [390, 768, 1150, 1280]) {
  test(`UXN-AC ${width}: one control row, only 0/3s, save directly below loop`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, USER_DATA_SR);
    await page.goto('/practice.html?v=jNQXAC9IVRw');
    await expect(page.locator('#loopBtn')).toBeVisible();
    await expect(page.locator('#waitSelect')).toHaveCount(0);
    const rects = await page.evaluate(() => {
      const ids = ['loopBtn','presetSelect','btnWaitTimer','clearBtn'];
      const row = document.querySelector('.pp-looprow');
      const save = document.getElementById('presetSection');
      return {
        items: ids.map(id => { const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}; }),
        next: row.nextElementSibling === save,
        saveY: save.getBoundingClientRect().y,
        rowBottom: row.getBoundingClientRect().bottom,
        rowRight: row.getBoundingClientRect().right,
        saveSelects: save.querySelectorAll('select').length,
      };
    });
    expect(rects.next, 'save actions must immediately follow the loop row').toBe(true);
    expect(rects.saveSelects).toBe(0);
    expect(rects.saveY - rects.rowBottom).toBeGreaterThanOrEqual(8);
    expect(rects.saveY - rects.rowBottom).toBeLessThanOrEqual(16);
    for (const item of rects.items) { expect(item.y).toBe(rects.items[0].y); expect(item.height).toBe(44); }
    for(let i=1;i<rects.items.length;i++) expect(rects.items[i].x).toBeGreaterThanOrEqual(rects.items[i-1].right);
    expect(rects.items[3].right).toBeLessThanOrEqual(rects.rowRight + 1);
    expect(rects.items[1].width).toBeGreaterThanOrEqual(70);
    const wait=page.locator('#btnWaitTimer');
    for(let i=0;i<3;i++) {
      await expect(wait).toHaveText('0s');await wait.click();await expect(wait).toHaveText('3s');
      await expect(wait).toHaveAttribute('aria-pressed','true');await wait.click();await expect(wait).toHaveText('0s');
    }
    if(process.env.LAYOUT_SHOTS) {
      const fs=require('node:fs');fs.mkdirSync('test-results/uxn-correction',{recursive:true});
      await page.locator('#ppCtl').evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.locator('#ppCtl').screenshot({path:`test-results/uxn-correction/controls-${width}.png`});
      if(width===1280) {await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.locator('#ppCtl').screenshot({path:'test-results/uxn-correction/controls-dark.png'});}
    }
  });
}


test('UXN-AC timer: three seconds only, cancellation never resumes playback', async ({ page }) => {
  await mockApp(page, USER_DATA_SR);
  await page.route(/https:\/\/(www\.)?youtube\.com\/.*/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.__ytPlays=0;window.YT={PlayerState:{PLAYING:1,PAUSED:2},Player:function(el,opts){
      const api={getCurrentTime:()=>20,getDuration:()=>100,getAvailablePlaybackRates:()=>[1],setPlaybackRate(){},seekTo(){},
      playVideo(){window.__ytPlays++;opts.events.onStateChange({data:1})},pauseVideo(){opts.events.onStateChange({data:2})},destroy(){}};
      queueMicrotask(()=>opts.events.onReady());return api;}};window.onYouTubeIframeAPIReady?.();`,
  }));
  await page.goto('/practice.html?v=jNQXAC9IVRw');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.clock.install();
  await page.locator('#playBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.__ytPlays)).toBe(1);
  const wait=page.locator('#btnWaitTimer');
  await wait.click();await expect(wait).toHaveText('3s');
  await page.locator('#startBtn').click();await expect(wait).toHaveText('-3s');
  await page.clock.runFor(1000);await expect(wait).toHaveText('-2s');
  await wait.click();await expect(wait).toHaveText('0s');
  await page.clock.runFor(4000);expect(await page.evaluate(()=>window.__ytPlays)).toBe(1);
  await page.locator('#playBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.__ytPlays)).toBe(2);
  await wait.click();await page.locator('#startBtn').click();await expect(wait).toHaveText('-3s');
  await page.clock.runFor(2999);expect(await page.evaluate(()=>window.__ytPlays)).toBe(2);
  await page.clock.runFor(1);await expect.poll(()=>page.evaluate(()=>window.__ytPlays)).toBe(3);
  await expect(wait).toHaveText('3s');
});

// ---------- SL-1 플레이어 곡 목록·분류 화면 (진행_SL_곡목록분류.md §2, 시안 명세/SL_시안.html) ----------
test('SL1-01 1280: ①버튼 크기 ②라벨 13px ④⑦폴더 박스·목록 간격 ⑤앱 선택창 위치·키보드 ⑨제목 수정', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, ux3Mock());
  // 현재 곡(Song 1)이 목록에 있어야 "현재 곡이 이 폴더에 없음" 안내가 박스·목록 사이에 끼지 않는다
  await page.goto(`/practice.html?v=${UX3_SONGS[0].videoId}`, { waitUntil: 'load' });
  await expect(page.locator('#folderList li button')).toHaveCount(3);

  // ① [곡 목록] = [분류] 크기·글자
  const btn = (sel) => page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { h: Math.round(r.height), font: cs.fontSize, weight: cs.fontWeight };
  });
  expect(await btn('#libBtn')).toEqual(await btn('#songCatBtn'));

  // ② 패널 라벨 13px
  for (const lab of await page.locator('.pp-lab').all()) await expect(lab).toHaveCSS('font-size', '13px');
  await expect(page.locator('#folderSelectLabel')).toHaveText('폴더 선택');

  // ⑦ 제목 줄·펼치기 없음, 박스 안 "이름 · N곡"
  await expect(page.locator('#folderToggle')).toHaveCount(0);
  await expect(page.locator('#folderSelect')).toHaveText(/전체 곡\s*·\s*3곡/);
  // ④ 박스 가로 = 곡 카드 가로, ▾ 오른쪽 여백 = 글자 왼쪽 여백, 목록은 박스 아래 8px
  const g = await page.evaluate(() => {
    const box = document.getElementById('folderSelect').getBoundingClientRect();
    const card = document.querySelector('#folderList li button').getBoundingClientRect();
    const val = document.querySelector('#folderSelect > span').getBoundingClientRect();
    const chev = document.querySelector('#folderSelect > span:last-child').getBoundingClientRect();
    return { bl: box.left, br: box.right, cl: card.left, cr: card.right, gap: card.top - box.bottom,
      padL: val.left - box.left, padR: box.right - chev.right };
  });
  expect(Math.abs(g.bl - g.cl)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.br - g.cr)).toBeLessThanOrEqual(1);
  expect(Math.abs(g.gap - 8)).toBeLessThanOrEqual(1);
  // ▾는 회전한 사각형이라 바깥 상자가 약 2px 넓다
  expect(Math.abs(g.padL - g.padR)).toBeLessThanOrEqual(3);

  // ⑤ D3: 목록은 박스 바로 아래, 같은 가로. 기본 <select> 없음
  await expect(page.locator('#ppCtl select, #ppFolderPanel select')).toHaveCount(0);
  await page.locator('#folderSelect').click();
  const list = page.locator('#folderSelect-list');
  await expect(list).toBeVisible();
  await expect(page.locator('#folderSelect')).toHaveAttribute('aria-expanded', 'true');
  const p = await page.evaluate(() => {
    const b = document.getElementById('folderSelect').getBoundingClientRect();
    const l = document.getElementById('folderSelect-list').getBoundingClientRect();
    return { dl: l.left - b.left, dw: l.width - b.width, dy: l.top - b.bottom };
  });
  expect(Math.abs(p.dl)).toBeLessThanOrEqual(1);
  expect(Math.abs(p.dw)).toBeLessThanOrEqual(1);
  expect(p.dy).toBeGreaterThanOrEqual(0);
  expect(p.dy).toBeLessThanOrEqual(6);
  await expect(list.locator('[role="option"]')).toHaveText([/전체 곡\s*3곡/, /Jazz\s*2곡/, /Pop\s*1곡/, /빈 분류\s*0곡/, /미분류\s*1곡/]);
  // Esc = 닫고 박스로 초점, 재생 단축키로 새지 않음
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.locator('#folderSelect')).toBeFocused();
  // 키보드: ↓ 열기 → ↓ → Enter = Jazz
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', CAT_JAZZ);
  await expect(page.locator('#folderCount')).toHaveText(/2곡/);
  // 바깥 누름 = 닫힘(값 그대로)
  await page.locator('#folderSelect').click();
  await page.mouse.click(5, 5);
  await expect(list).toHaveCount(0);
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', CAT_JAZZ);

  // ⑨ 저장 시각 대신 밑줄 [제목 수정]
  await expect(page.locator('#titleEditBtn')).toHaveText('제목 수정');
  await expect(page.locator('#titleEditBtn')).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.locator('#syncState')).not.toContainText('저장됨');
  await expect(page.locator('#syncState')).not.toContainText('계정 연결됨');
});

test('SL1-02: ⑨제목 수정·⑧목록 EDIT 곡 수정 창·③분류 EDIT 추가/이름 변경/삭제', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const mock = ux3Mock();
  const calls = [];
  let cats = UX3_CATEGORIES.map((c) => ({ ...c }));
  mock.routes = [
    [
      (url) => url.pathname === '/api/v1/categories' || url.pathname.startsWith('/api/v1/categories/'),
      (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const method = req.method();
        if (method === 'GET' && path === '/api/v1/categories') return UX3_JSON(route, { categories: cats });
        const body = method === 'GET' || method === 'DELETE' ? null : req.postDataJSON();
        calls.push({ method, path, body });
        if (method === 'POST') {
          if (cats.some((c) => c.name === body.name)) return UX3_JSON(route, { code: 'CONFLICT', message: '같은 이름의 분류가 이미 있습니다.' }, 409);
          const created = { id: '00000000-0000-4000-8000-000000000304', name: body.name, sortOrder: 3, onHome: false, songCount: 0 };
          cats = [...cats, created];
          return UX3_JSON(route, { category: created }, 201);
        }
        const id = path.split('/').pop();
        if (method === 'PATCH') {
          cats = cats.map((c) => (c.id === id ? { ...c, ...body } : c));
          return UX3_JSON(route, { category: cats.find((c) => c.id === id) });
        }
        if (method === 'DELETE') {
          cats = cats.filter((c) => c.id !== id);
          return UX3_JSON(route, { ok: true });
        }
        return route.fallback();
      },
    ],
    [
      (url) => /^\/api\/v1\/songs\/[^/]+$/.test(url.pathname),
      (route) => {
        const req = route.request();
        if (req.method() !== 'PATCH') return route.fallback();
        const id = new URL(req.url()).pathname.split('/').pop();
        const body = req.postDataJSON();
        calls.push({ method: 'PATCH', path: `/songs/${id}`, body });
        const base = UX3_SONGS.find((x) => x.id === id) || UX3_SONGS[0];
        return UX3_JSON(route, { song: { ...base, ...body } });
      },
    ],
  ];
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await expect(page.locator('#folderList li button')).toHaveCount(3);
  page.on('dialog', (d) => d.accept());

  // ⑨ 제목 수정: 빈 값은 막고, 저장하면 PATCH title 1번
  await page.locator('#titleEditBtn').click();
  const titleInput = page.locator('#titleDialogInput');
  await expect(titleInput).toBeFocused();
  await titleInput.fill('   ');
  await page.locator('#titleDialogSave').click();
  await expect(page.locator('#titleDialog')).toContainText('제목을 입력해 주세요');
  await titleInput.fill('새 제목');
  await page.locator('#titleDialogSave').click();
  await expect(page.locator('#titleDialog')).toHaveCount(0);
  await expect(page.locator('#songTitle')).toHaveText('새 제목');
  expect(calls.filter((c) => c.path.startsWith('/songs/'))).toEqual([
    { method: 'PATCH', path: `/songs/${UX3_SONGS[0].id}`, body: { title: '새 제목' } },
  ]);
  await expect(page.locator('#folderList li button').first()).toContainText('새 제목');

  // ⑧ 목록 EDIT: 수정 중 표시(스파인 색 변경·라벨), 카드 누르면 곡 전환 대신 수정 창
  const panel = page.locator('#ppFolderPanel');
  const spineBefore = await panel.evaluate((el) => getComputedStyle(el).borderLeftColor);
  await page.locator('#folderEditBtn').click();
  await expect(panel).toHaveAttribute('data-editing', 'true');
  await expect(page.locator('#folderSelectLabel')).toContainText('수정 중');
  await expect(page.locator('#folderEditBtn')).toHaveText('완료');
  expect(await panel.evaluate((el) => getComputedStyle(el).borderLeftColor)).not.toBe(spineBefore);
  await page.locator('#folderList li button', { hasText: 'Song 2' }).click();
  const dlg = page.locator('#songEditDialog');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#songEditTitleInput')).toHaveValue('Song 2');
  await expect(page.locator('#songTitle')).toHaveText('새 제목'); // 곡 전환 없음
  await dlg.locator(`[data-category="${CAT_POP}"] input`).check();
  await page.locator('#songEditSave').click();
  await expect(dlg).toHaveCount(0);
  expect(calls.at(-1)).toEqual({ method: 'PATCH', path: `/songs/${UX3_SONGS[1].id}`, body: { categoryIds: [CAT_JAZZ, CAT_POP] } });
  await pickOption(page, 'folderSelect', CAT_POP);
  // SL-2 ⑥: 수정 중에는 곡 카드 왼쪽에 순서 이동 핸들(data-drag-id)이 붙으므로 카드 버튼만 센다
  await expect(page.locator('#folderList li button:not([data-drag-id])')).toHaveText([/새 제목/, /Song 2/]);
  await page.locator('#folderEditBtn').click();
  await expect(panel).not.toHaveAttribute('data-editing', /.*/);

  // ③ 분류 EDIT: 체크박스 대신 이름 버튼 + 새 분류 입력 줄
  await page.locator('#songCatBtn').click();
  const pop = page.locator('#songCatPop');
  await pop.locator('#songCatEdit').click();
  await expect(pop.locator('input[type="checkbox"]')).toHaveCount(0);
  const addInput = pop.locator('#songCatAdd input');
  await addInput.fill('Jazz');
  await pop.locator('#songCatAdd button').click();
  await expect(pop).toContainText('같은 이름의 분류가 이미 있습니다');
  await addInput.fill('Rock');
  await pop.locator('#songCatAdd button').click();
  await expect(pop.locator('li', { hasText: 'Rock' })).toHaveCount(1);
  await expect(addInput).toHaveValue('');
  expect(calls.at(-1)).toEqual({ method: 'POST', path: '/api/v1/categories', body: { name: 'Rock' } });

  // 이름 변경: 작은 창, 창 안 누름은 분류 창을 닫지 않는다
  await pop.locator(`[data-category="${CAT_POP}"] button`).click();
  const one = page.locator('#catEditDialog');
  await expect(one).toBeVisible();
  await page.locator('#catEditInput').fill('Pop 2');
  await page.locator('#catEditSave').click();
  await expect(one).toHaveCount(0);
  await expect(pop).toBeVisible();
  expect(calls.at(-1)).toEqual({ method: 'PATCH', path: `/api/v1/categories/${CAT_POP}`, body: { name: 'Pop 2' } });
  await expect(page.locator('#folderSelect')).toHaveText(/Pop 2\s*·\s*2곡/);

  // 삭제: 확인 뒤 DELETE, 곡은 남고 이 분류에서만 빠진다 → 지운 폴더를 보던 목록은 전체 곡
  await pop.locator(`[data-category="${CAT_POP}"] button`).click();
  await page.locator('#catEditDelete').click();
  await expect(one).toHaveCount(0);
  expect(calls.at(-1)).toEqual({ method: 'DELETE', path: `/api/v1/categories/${CAT_POP}`, body: null });
  await expect(pop.locator(`[data-category="${CAT_POP}"]`)).toHaveCount(0);
  await expect(page.locator('#folderSelect')).toHaveAttribute('data-value', '__all');
  await expect(page.locator('#folderList li button')).toHaveCount(3);
  await expect(page.locator('#songCatBtn')).toHaveText('분류 1');
});

// ============================================================
// SL-2 ⑥ 곡 순서(수정 중 핸들 드래그·키보드)·패널 높이, ⑩ 세션 삭제 ✕ (명세 SL-2 §7·§8·§11.2)
// ============================================================
const songRowIds = (page) =>
  page.locator('#folderList li[data-song-id]').evaluateAll((els) => els.map((el) => el.dataset.songId));
const handleOf = (page, id) => page.locator(`#folderList [data-drag-id="${id}"]`);
const [S1, S2, S3] = UX3_SONGS.map((s) => s.id);

// PUT /songs/order: 요청 본문을 모으고, onOrder가 응답을 정한다(기본 = 서버처럼 전체 목록에 자리 유지 반영)
function sl2Mock({ onOrder, songs = UX3_SONGS } = {}) {
  const mock = ux3Mock({ songs });
  const orders = [];
  mock.routes.push([
    (url) => url.pathname === '/api/v1/songs/order',
    async (route) => {
      const req = route.request();
      if (req.method() !== 'PUT') return route.fallback();
      const ids = req.postDataJSON().ids;
      orders.push(ids);
      if (onOrder) return onOrder(route, ids);
      const moving = new Set(ids);
      let k = 0;
      const next = songs.map((s) => {
        if (!moving.has(s.id)) return s;
        const id = ids[k++];
        return songs.find((x) => x.id === id);
      });
      return UX3_JSON(route, { songs: next });
    },
  ]);
  return { mock, orders };
}

test('SL2-01: 핸들은 수정 중·곡 2개 이상일 때 인라인 목록에만 있다(서랍 없음)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, sl2Mock().mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await expect(page.locator('#folderList li[data-song-id]')).toHaveCount(3);
  await expect(page.locator('#folderList [data-drag-id]')).toHaveCount(0);

  await page.locator('#folderEditBtn').click();
  await expect(page.locator('#folderList [data-drag-id]')).toHaveCount(3);
  await expect(handleOf(page, S1)).toHaveAttribute('aria-label', '순서 이동: Song 1');
  const hb = await handleOf(page, S1).boundingBox();
  expect(hb.width).toBeGreaterThanOrEqual(44);
  expect(hb.height).toBeGreaterThanOrEqual(44);

  // 곡 1개 폴더(Pop)에서는 핸들 없음
  await pickOption(page, 'folderSelect', CAT_POP);
  await expect(page.locator('#folderList li[data-song-id]')).toHaveCount(1);
  await expect(page.locator('#folderList [data-drag-id]')).toHaveCount(0);

  // 서랍 목록에는 핸들 없음
  await pickOption(page, 'folderSelect', '__all');
  await page.locator('#libBtn').click();
  await expect(page.locator('#lib li button').first()).toBeVisible();
  await expect(page.locator('#lib [data-drag-id]')).toHaveCount(0);
});

test('SL2-02: 키보드 ↓ 한 칸 이동 → PUT 본문 = 새 순서, 응답 반영·같은 핸들 포커스 유지', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock, orders } = sl2Mock();
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#folderEditBtn').click();
  await handleOf(page, S1).focus();
  const reqP = page.waitForRequest((r) => r.url().endsWith('/api/v1/songs/order') && r.method() === 'PUT');
  const resP = page.waitForResponse((r) => r.url().endsWith('/api/v1/songs/order'));
  await page.keyboard.press('ArrowDown');
  expect((await reqP).postDataJSON()).toEqual({ ids: [S2, S1, S3] });
  await resP;
  expect(await songRowIds(page)).toEqual([S2, S1, S3]);
  await expect(handleOf(page, S1)).toBeFocused();
  // 맨 위에서 ↑는 무시(요청 없음)
  await handleOf(page, S2).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => orders.length).toBe(2);
  expect(orders[1]).toEqual([S1, S2, S3]);
});

test('SL2-03: 포인터로 끌어 맨 위로 옮기면 저장', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock } = sl2Mock();
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#folderEditBtn').click();
  // 목록 안에서 보이는 두 번째 곡 핸들을 첫 곡 위쪽으로 끈다
  const from = await handleOf(page, S2).boundingBox();
  const top = await page.locator(`#folderList li[data-song-id="${S1}"]`).boundingBox();
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.dataset?.dragId, [fx, fy])).toBe(S2);
  const reqP = page.waitForRequest((r) => r.url().endsWith('/api/v1/songs/order') && r.method() === 'PUT');
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await expect(page.locator(`#folderList li[data-song-id="${S2}"]`)).toHaveAttribute('data-dragging', 'true');
  await page.mouse.move(fx, top.y + 4, { steps: 8 });
  // 끄는 중: 화면 순서가 바뀐다(아직 저장 요청 없음)
  await expect.poll(() => songRowIds(page)).toEqual([S2, S1, S3]);
  await page.mouse.up();
  expect((await reqP).postDataJSON()).toEqual({ ids: [S2, S1, S3] });
  await expect(page.locator('#folderList li[data-dragging]')).toHaveCount(0);
  await expect.poll(() => songRowIds(page)).toEqual([S2, S1, S3]);
});

test('SL2-03b: 4px 미만으로 움직이고 놓으면 저장하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock, orders } = sl2Mock();
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#folderEditBtn').click();
  const from = await handleOf(page, S2).boundingBox();
  await page.mouse.move(from.x + 22, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + 22, from.y + 23);
  await page.mouse.up();
  await expect(page.locator('#folderList li[data-dragging]')).toHaveCount(0);
  // 다음 키보드 저장이 첫 요청이어야 한다(앞의 놓기는 요청을 만들지 않음)
  await handleOf(page, S1).focus();
  const reqP = page.waitForRequest((r) => r.url().endsWith('/api/v1/songs/order'));
  await page.keyboard.press('ArrowDown');
  await reqP;
  expect(orders).toEqual([[S2, S1, S3]]);
});

test('SL2-04: 저장 실패 500 → 원래 순서로 되돌리고 #folderOrderErr 표시', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock } = sl2Mock({
    onOrder: (route) => UX3_JSON(route, { ok: false, status: 500, code: 'INTERNAL', message: '순서 저장 실패(테스트)' }, 500),
  });
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#folderEditBtn').click();
  await handleOf(page, S2).focus();
  const resP = page.waitForResponse((r) => r.url().endsWith('/api/v1/songs/order'));
  await page.keyboard.press('ArrowUp');
  await resP;
  await expect(page.locator('#folderOrderErr')).toHaveText('순서 저장 실패(테스트)');
  await expect.poll(() => songRowIds(page)).toEqual([S1, S2, S3]);
  // 폴더를 바꾸면 오류 문구는 지운다
  await pickOption(page, 'folderSelect', CAT_JAZZ);
  await expect(page.locator('#folderOrderErr')).toHaveCount(0);
});

test('SL2-05: 저장 응답을 붙잡은 채 다른 계정으로 바뀌면 늦은 응답이 화면을 덮지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const userBId = '00000000-0000-4000-8000-000000000002';
  const songB = { ...UX3_SONGS[2], id: '00000000-0000-4000-8000-0000000002b1', title: 'User B Song', categoryIds: [] };
  let release;
  const held = new Promise((r) => { release = r; });
  let currentUid = DEFAULT_ME.id;
  const { mock } = sl2Mock({
    onOrder: async (route) => {
      await held;
      return UX3_JSON(route, { songs: [UX3_SONGS[1], UX3_SONGS[0], UX3_SONGS[2]] });
    },
  });
  mock.routes.push(
    [(url) => url.pathname.startsWith('/api/v1/me'), (route) => UX3_JSON(route, { ...DEFAULT_ME, id: currentUid })],
    [
      (url) => url.pathname === '/api/v1/songs',
      (route) => UX3_JSON(route, { songs: currentUid === userBId ? [songB] : UX3_SONGS }),
    ],
  );
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await page.locator('#folderEditBtn').click();
  await handleOf(page, S1).focus();
  const reqP = page.waitForRequest((r) => r.url().endsWith('/api/v1/songs/order'));
  await page.keyboard.press('ArrowDown');
  await reqP;
  expect(await songRowIds(page)).toEqual([S2, S1, S3]); // 낙관적 반영

  currentUid = userBId;
  await page.evaluate((bId) => {
    window.__supabaseAuthListener('SIGNED_IN', {
      access_token: 'fake-jwt-token-b',
      user: { id: bId, email: 'b@example.com', user_metadata: {} },
    });
  }, userBId);
  const panel = page.locator('#ppFolderPanel');
  await expect(panel).toContainText('User B Song');
  const resP = page.waitForResponse((r) => r.url().endsWith('/api/v1/songs/order'));
  release();
  await resP;
  await expect(panel).toContainText('User B Song');
  await expect(panel).not.toContainText('Song 1');
  await expect(page.locator('#folderOrderErr')).toHaveCount(0);
});

for (const width of [1150, 1280]) {
  test(`SL2-06: ${width} 곡 목록 패널 아래 끝 = 플레이어 버튼 섹션 아래 끝(±1), 목록은 안에서 스크롤`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const many = FIXTURES.longSongs(30).map((s, i) => ({ ...s, title: `Song ${i + 1}`, categoryIds: [] }));
    for (const songs of [UX3_SONGS, many]) {
      await mockApp(page, ux3Mock({ songs }));
      // 현재 곡이 목록에 있는 보통 상태(없으면 "이 폴더에 없음" 안내 줄만큼 오른쪽이 길어진다)
      await page.goto(`/practice.html?v=${songs[0].videoId}`, { waitUntil: 'load' });
      await expect(page.locator('#folderList li[data-song-id]')).toHaveCount(songs.length);
      const r = await page.evaluate(() => {
        let actions = document.getElementById('ppPlayCard');
        while (actions.parentElement && !actions.parentElement.classList.contains('pp-main')) actions = actions.parentElement;
        const list = document.getElementById('folderList');
        return {
          panel: document.getElementById('ppFolderPanel').getBoundingClientRect().bottom,
          actions: actions.getBoundingClientRect().bottom,
          listH: list.clientHeight,
          scroll: list.scrollHeight > list.clientHeight,
        };
      });
      expect(Math.abs(r.panel - r.actions), JSON.stringify(r)).toBeLessThanOrEqual(1);
      expect(r.listH).toBeGreaterThanOrEqual(160);
      if (songs === many) expect(r.scroll).toBe(true);
    }
  });
}

for (const width of [390, 768]) {
  test(`SL2-06: ${width} 곡 목록 최대 높이 360px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const many = FIXTURES.longSongs(30).map((s, i) => ({ ...s, title: `Song ${i + 1}`, categoryIds: [] }));
    await mockApp(page, ux3Mock({ songs: many }));
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await expect(page.locator('#folderList li[data-song-id]')).toHaveCount(30);
    const box = await page.locator('#folderList').boundingBox();
    expect(box.height).toBeLessThanOrEqual(361);
    expect(box.height).toBeGreaterThan(300);
  });
}

// ⑩ 세션 ✕: 플레이어 "이 곡의 연습 기록" 카드 아래 줄 오른쪽 끝
const SL2_SESSION = SR_SONG_DETAIL.sessions[0].id; // 2026-11-06, 18분, 녹음 tk2(…802)는 다른 세션

function sl2SessionMock({ onDelete } = {}) {
  const mock = ux3Mock();
  const calls = { del: [], detail: 0, list: 0 };
  let deleted = false;
  mock.routes.push(
    [
      (url) => url.pathname.startsWith('/api/v1/sessions/'),
      async (route) => {
        const req = route.request();
        if (req.method() !== 'DELETE') return route.fallback();
        calls.del.push(new URL(req.url()).pathname);
        if (onDelete) return onDelete(route);
        deleted = true;
        return UX3_JSON(route, { ok: true });
      },
    ],
    [
      (url) => /^\/api\/v1\/songs\/[0-9a-f-]+$/.test(url.pathname),
      (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        calls.detail++;
        const sessions = SR_SONG_DETAIL.sessions.filter((s) => !(deleted && s.id === SL2_SESSION));
        return UX3_JSON(route, { ...SR_SONG_DETAIL, sessions });
      },
    ],
    [
      (url) => url.pathname === '/api/v1/songs',
      (route) => {
        calls.list++;
        return UX3_JSON(route, { songs: UX3_SONGS });
      },
    ],
  );
  return { mock, calls };
}

test('SL2-07: 세션 ✕ → 확인 취소면 요청 없음, 확인하면 DELETE 후 카드가 빠지고 요약·곡 목록을 다시 읽는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock, calls } = sl2SessionMock();
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const card = page.locator(`#srTimeline [data-session-id="${SL2_SESSION}"]`);
  const x = page.locator(`#sessionDelete-player-${SL2_SESSION}`);
  await expect(x).toBeVisible();
  await expect(x).toHaveAttribute('aria-label', '이 연습 세션 삭제');
  const xb = await x.boundingBox();
  const cb = await card.boundingBox();
  expect(xb.width).toBeGreaterThanOrEqual(44);
  expect(xb.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(cb.x + cb.width - (xb.x + xb.width))).toBeLessThanOrEqual(24); // 카드 오른쪽 끝(카드 안쪽 여백)
  expect(xb.y + xb.height).toBeGreaterThan(cb.y + cb.height - 40); // 아래 줄

  let message = '';
  page.once('dialog', (d) => { message = d.message(); return d.dismiss(); });
  await x.click();
  expect(message).toContain('2026-11-06');
  expect(message).toContain('되돌릴 수 없습니다');
  expect(calls.del).toEqual([]);

  const detailBefore = calls.detail;
  const listBefore = calls.list;
  page.once('dialog', (d) => d.accept());
  const reqP = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith(`/api/v1/sessions/${SL2_SESSION}`));
  await x.click();
  await reqP;
  await expect(card).toHaveCount(0);
  await expect.poll(() => calls.detail).toBeGreaterThan(detailBefore);
  await expect.poll(() => calls.list).toBeGreaterThan(listBefore);
  expect(calls.del).toEqual([`/api/v1/sessions/${SL2_SESSION}`]);
  // 남은 세션 5개(6개 중 1개 삭제)가 처음 5개로 보인다
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);
});

test('SL2-08: 세션 삭제 실패 500 → 카드 유지·오류 문구', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { mock } = sl2SessionMock({
    onDelete: (route) => UX3_JSON(route, { ok: false, status: 500, code: 'INTERNAL', message: '삭제 실패(테스트)' }, 500),
  });
  await mockApp(page, mock);
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  const card = page.locator(`#srTimeline [data-session-id="${SL2_SESSION}"]`);
  page.once('dialog', (d) => d.accept());
  const resP = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await page.locator(`#sessionDelete-player-${SL2_SESSION}`).click();
  await resP;
  await expect(card).toContainText('삭제 실패(테스트)');
  await expect(card).toHaveCount(1);
  await expect(page.locator(`#sessionDelete-player-${SL2_SESSION}`)).toBeEnabled();
});
