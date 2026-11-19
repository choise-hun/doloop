// 연습 기록 화면 정렬 검사 (FT-2): 공통 검사 G0~G8. M2에서 다시 만드는 화면이라 배치 약속은 M2 step에서 쓴다
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, FIXTURES } = require('../support/mock-app');
const { pickOption, expectValue } = require('../support/app-select');

layoutSuite({
  name: 'log',
  path: '/log.html',
  states: ['guest', 'user', 'userData'],
  ready: async (page, state) => {
    await page.locator(state === 'guest' ? '#logGuest' : '#calGrid').waitFor();
  },
  dark: 'userData',
  // 알려진 실패(FT-2 기록, M2에서 다시 만들 때 처리). 결과/FT-2_전화면점검.md §3
  known: [{ match: /^G6 #logGuest 제목 아래 /, why: '비로그인 안내 패널: gap 14px에 <p> 기본 여백 14px가 더해져 28px' }],
});

layoutSuite({
  name: 'log-songs',
  path: '/log.html#songs',
  states: ['userData'],
  ready: async (page) => {
    await page.locator('#pane-songs').waitFor();
    await page.locator('#songFilters').waitFor();
  },
  dark: 'userData',
});

test('UI-1 T4 TRAILS 타이틀 검증: LogPage의 h1 텍스트가 TRAILS인지 검증', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/log.html', { waitUntil: 'load' });
  await page.locator('#logHeader').waitFor();
  await expect(page.locator('#logHeader h1')).toHaveText('TRAILS');
});

test('UI-1 T5 1120px 레이아웃 검증: LogPage 메인 컨테이너 최대 너비가 1120px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/log.html', { waitUntil: 'load' });
  await page.locator('#logHeader').waitFor();
  const main = page.locator('main');
  const box = await main.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.width - 1120)).toBeLessThanOrEqual(1);
});

// DS2-3: TRAILS 4:6 전환 — 스파인 fill1·세그먼트 3px 틀·종이+밑줄 선택·필은 상태마다 1개 이하
async function lgTokens(page) {
  return page.evaluate(() => {
    const read = (prop, val) => {
      const el = document.createElement('span');
      el.style[prop] = val;
      document.body.appendChild(el);
      const out = window.getComputedStyle(el)[prop];
      el.remove();
      return out;
    };
    return { fill1: read('color', 'var(--fill1)'), paper: read('backgroundColor', 'var(--paper)'), inkStrong: read('color', 'var(--ink-strong)') };
  });
}
const lgBox = (el) => {
  const s = window.getComputedStyle(el);
  return { left: s.borderLeftWidth, leftColor: s.borderLeftColor, radius: s.borderTopLeftRadius, bg: s.backgroundColor, sh: s.boxShadow, font: s.fontSize };
};
async function lgPills(page, scope) {
  return page.locator(scope).evaluate((root) => [...root.querySelectorAll('a, button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && window.getComputedStyle(el).borderTopLeftRadius === '9999px';
  }).map((el) => el.id || el.textContent.trim().slice(0, 20)));
}
// #calGrid의 가장 가까운 스파인 카드 조상
const lgCardOf = (el) => {
  let n = el.parentElement;
  while (n && parseFloat(window.getComputedStyle(n).borderLeftWidth) <= 1) n = n.parentElement;
  const s = window.getComputedStyle(n);
  return { left: s.borderLeftWidth, leftColor: s.borderLeftColor, radius: s.borderTopLeftRadius };
};

test('DS23-L1 요약·달력 스파인 fill1, 탭 세그먼트, 달력 칸 3px, 필 0개 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.userData);
  await page.goto('/log.html', { waitUntil: 'load' });
  await page.locator('#calGrid').waitFor();
  const tk = await lgTokens(page);
  const cards = page.locator('#pane-log .summary-card');
  await expect(cards).toHaveCount(2);
  for (const c of await cards.all()) {
    const b = await c.evaluate(lgBox);
    expect(b.left).toBe('12px');
    expect(b.leftColor).toBe(tk.fill1);
    expect(b.radius).toBe('3px');
  }
  const cal = await page.locator('#calGrid').evaluate(lgCardOf);
  expect(cal).toEqual({ left: '12px', leftColor: tk.fill1, radius: '3px' });
  expect(await page.locator('#logTabs').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  for (const id of ['#tab-log', '#tab-songs']) {
    expect(await page.locator(id).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px');
  }
  const sel = await page.locator('#logTabs [aria-selected="true"]').evaluate(lgBox);
  expect(sel.bg).toBe(tk.paper);
  expect(sel.sh).toContain(tk.inkStrong);
  expect(await page.locator('#calGrid button').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  expect(await lgPills(page, '.log-page')).toEqual([]);
});

test('DS23-L2 곡 필터 세그먼트·곡 상세 필 1개·공용 버튼/메모 3px (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.userData);
  await page.goto('/log.html#songs', { waitUntil: 'load' });
  await page.locator('#songFilters').waitFor();
  expect(await page.locator('#songFilters').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  for (const b of await page.locator('#songFilters button').all()) {
    expect(await b.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px');
  }
  const song = FIXTURES.longSongs(5)[0];
  await page.goto(`/log.html?song=${encodeURIComponent(song.id)}`, { waitUntil: 'load' });
  await page.locator('#detailResume').waitFor();
  expect(await page.locator('#detailResume').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('9999px');
  expect(await lgPills(page, '.log-page')).toEqual(['detailResume']);
  for (const id of ['#btnDeleteSong', '#btnSaveSongMemo', '#detailMemo']) {
    expect(await page.locator(id).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), id).toBe('3px');
  }
  expect(await page.locator('#detailMemo').evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
});

test('DS23-L3 다크: 요약 스파인 fill1 다크 값·선택 탭 종이 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.userData);
  await page.goto('/log.html', { waitUntil: 'load' });
  await page.locator('#calGrid').waitFor();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await page.locator('#pane-log .summary-card').first().evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(255, 107, 43)');
  expect(await page.locator('#logTabs [aria-selected="true"]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 36, 34)');
});

test('AS-3 기록 화면 #songStatus-{id}·#detailStatus AppSelect 3px·접근이름·선택 계약 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const song = FIXTURES.longSongs(5)[0];
  await mockApp(page, STATES.userData);
  await page.goto('/log.html#songs', { waitUntil: 'load' });
  const cardId = `songStatus-${song.id}`;
  await page.locator(`#${cardId}`).waitFor();
  await expect(page.getByRole('combobox', { name: '곡 상태' })).toHaveCount(5);
  const cardStyle = await page.locator(`#${cardId}`).evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderTopLeftRadius, height: s.height };
  });
  expect(cardStyle).toEqual({ radius: '3px', height: '44px' });
  await pickOption(page, cardId, 'done');
  await expectValue(page, cardId, 'done');

  await page.goto(`/log.html?song=${encodeURIComponent(song.id)}`, { waitUntil: 'load' });
  await page.locator('#detailStatus').waitFor();
  await expect(page.getByRole('combobox', { name: '곡 상태' })).toHaveCount(1);
  const detailStyle = await page.locator('#detailStatus').evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: s.borderTopLeftRadius, height: s.height };
  });
  expect(detailStyle).toEqual({ radius: '3px', height: '44px' });
  await pickOption(page, 'detailStatus', 'paused');
  await expectValue(page, 'detailStatus', 'paused');
});
