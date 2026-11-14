// 홈 화면 정렬 검사 (FT-1): 공통 검사 G0~G8 + 배치 약속(HomePage.tsx data-align-group)
// 규격: 개발산출물/프론트_정렬규격.md · 옛 H1~H6 대응: 개발산출물/결과/FT-0_규격설계.md §3
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');
const { COMMUNITY_FREE_ME, communityRoutes } = require('../support/community-fixtures');

const HOME_CURATION = {
  ...STATES.userData,
  me: COMMUNITY_FREE_ME,
  routes: communityRoutes(),
};

layoutSuite({
  name: 'home',
  path: '/index.html',
  states: ['guest', 'guestLocal', 'userData', { name: 'curation', mock: HOME_CURATION }],
  ready: async (page, state) => {
    await page.locator('#weeklyStreakCard').waitFor();
    if (state === 'userData' || state === 'curation') {
      await expect(page.locator('#songs li a')).toHaveCount(5);
      await page.locator('#recentNoteBody').waitFor();
    }
    if (state === 'curation') {
      await expect(page.locator('#discover [data-row]')).toHaveCount(4);
      await expect(page.locator('#discover')).not.toContainText('i18n-keep');
    }
  },
  options: { forbidColors: ['--link'] },
  dark: 'curation',
});

// H6 홈 모듈 CSS에 링크 파란색 토큰 없음 (전역 a 색을 홈에서 덮는다)
test('FT home HomePage.module.css에 링크 파란색 토큰 없음', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/HomePage.module.css'), 'utf8');
  expect(css.match(/var\(--(link|accent-text)\)/g) || []).toEqual([]);
});

test('UI-1 T2 단일 푸터 검증: 홈 화면에 중복 푸터 없이 단 하나의 footer만 존재', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();
  await expect(page.locator('footer')).toHaveCount(1);
});

test('UI-1 T3 버튼 폭 일치 검증: #betterChordsBtn의 너비가 상위 #modes 리스트 박스의 너비와 일치', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#betterChordsBtn').waitFor();
  const list = page.locator('#modes');
  const btn = page.locator('#betterChordsBtn');
  const listBox = await list.boundingBox();
  const btnBox = await btn.boundingBox();
  expect(listBox).not.toBeNull();
  expect(btnBox).not.toBeNull();
  expect(Math.abs(btnBox.width - listBox.width)).toBeLessThanOrEqual(1);
});

test('UIUX-R T1 홈 분할 대시보드 검증: splitFrames 그리드 16px 간격 및 개별 카드 스타일 적용', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#betterFrame').waitFor();
  await page.locator('#vaultFrame').waitFor();

  const better = page.locator('#betterFrame');
  const vault = page.locator('#vaultFrame');
  const betterBox = await better.boundingBox();
  const vaultBox = await vault.boundingBox();

  expect(betterBox).not.toBeNull();
  expect(vaultBox).not.toBeNull();
  // 데스크톱 2열 배치에서 좌우 카드 사이 간격이 16px (오차 1px 이내)
  const horizontalGap = vaultBox.x - (betterBox.x + betterBox.width);
  expect(Math.abs(horizontalGap - 16)).toBeLessThanOrEqual(1);

  // 개별 프레임 카드의 테두리(border) 독립 분리 검증 (DS-2: 상단 3px 바, 나머지 세 변 1px)
  const betterSides = await better.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
  });
  const vaultSides = await vault.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
  });
  expect(betterSides).toEqual(['3px', '1px', '1px', '1px']);
  expect(vaultSides).toEqual(['3px', '1px', '1px', '1px']);
});

async function resolveTokenColors(page) {
  return page.evaluate(() => {
    const readColor = (prop, val) => {
      const el = document.createElement('span');
      el.style[prop] = val;
      document.body.appendChild(el);
      const out = window.getComputedStyle(el)[prop];
      el.remove();
      return out;
    };
    return {
      nowRing: readColor('color', 'var(--now-ring)'),
      ink: readColor('color', 'var(--ink)'),
      line: readColor('color', 'var(--line)'),
      surface2: readColor('color', 'var(--surface2)'),
      muted: readColor('color', 'var(--muted)'),
      accent: readColor('backgroundColor', 'var(--accent)'),
      accentInk: readColor('color', 'var(--accent-ink)'),
      tint: readColor('backgroundColor', 'color-mix(in srgb, var(--now-ring) 12%, transparent)'),
    };
  });
}

test('DS2-1 프레임 바 4곳의 색', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();

  const colors = await resolveTokenColors(page);
  const readBorder = (sel) =>
    page.locator(sel).evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { topW: s.borderTopWidth, topC: s.borderTopColor, leftC: s.borderLeftColor };
    });

  for (const [sel, expectedTop] of [
    ['#weeklyStreakCard', colors.nowRing],
    ['#betterFrame', colors.nowRing],
    ['#recentSongCard', colors.ink],
    ['#vaultFrame', colors.ink],
  ]) {
    const b = await readBorder(sel);
    expect(b.topW, `${sel} borderTopWidth`).toBe('3px');
    expect(b.topC, `${sel} borderTopColor`).toBe(expectedTop);
    expect(b.leftC, `${sel} borderLeftColor`).toBe(colors.line);
  }
});

test('DS2-2 카드 제목', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();

  await expect(page.locator('#weeklyStreakCard h2')).toHaveText('WEEKLY');
  await expect(page.locator('#recentSongCard h2')).toHaveText('RECENT');
});

test('DS2-3 오늘 칸', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#streakDays').waitFor();

  const colors = await resolveTokenColors(page);
  const todayCell = page.locator('#streakDays [data-today="1"]');
  await expect(todayCell).toHaveCount(1);

  const nonTodayBg = await page
    .locator('#streakDays > div:not([data-today="1"])')
    .first()
    .evaluate((el) => window.getComputedStyle(el).backgroundColor);

  const todayStyle = await todayCell.evaluate((el) => {
    const s = window.getComputedStyle(el);
    const dow = el.querySelector('span');
    return {
      topC: s.borderTopColor,
      bg: s.backgroundColor,
      dowC: dow ? window.getComputedStyle(dow).color : null,
    };
  });

  expect(todayStyle.topC).toBe(colors.nowRing);
  expect(todayStyle.bg).toBe(colors.tint);
  expect(todayStyle.bg).not.toBe(nonTodayBg);
  expect(todayStyle.dowC).toBe(colors.ink);
});

test('DS2-4 오늘 연습을 마친 칸', async ({ page }) => {
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.user,
    sessions: { calendar: [{ date: todayLocal, totalSeconds: 600 }], sessions: [] },
  });
  await page.goto('/index.html', { waitUntil: 'load' });

  const doneToday = page.locator('#streakDays [data-today="1"][data-practiced="1"]');
  await expect(doneToday).toHaveCount(1);

  const colors = await resolveTokenColors(page);
  const style = await doneToday.evaluate((el) => {
    const s = window.getComputedStyle(el);
    const dow = el.querySelector('span');
    return {
      bg: s.backgroundColor,
      topC: s.borderTopColor,
      dowC: dow ? window.getComputedStyle(dow).color : null,
    };
  });

  expect(style.bg).toBe(colors.ink);
  expect(style.topC).toBe(colors.nowRing);
  expect(style.dowC).toBe(colors.surface2);
});

test('DS2-5 구간 배지', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.userData);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#recentSongSegment').waitFor();

  const colors = await resolveTokenColors(page);
  const loopStyle = await page.locator('#recentSongSegment').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      topW: s.borderTopWidth,
      rightW: s.borderRightWidth,
      bottomW: s.borderBottomWidth,
      leftW: s.borderLeftWidth,
      topC: s.borderTopColor,
      rightC: s.borderRightColor,
      bottomC: s.borderBottomColor,
      leftC: s.borderLeftColor,
      bg: s.backgroundColor,
      color: s.color,
      radius: s.borderTopLeftRadius,
    };
  });

  expect(loopStyle.topW).toBe('1px');
  expect(loopStyle.rightW).toBe('1px');
  expect(loopStyle.bottomW).toBe('1px');
  expect(loopStyle.leftW).toBe('1px');
  expect(loopStyle.topC).toBe(colors.nowRing);
  expect(loopStyle.rightC).toBe(colors.nowRing);
  expect(loopStyle.bottomC).toBe(colors.nowRing);
  expect(loopStyle.leftC).toBe(colors.nowRing);
  expect(loopStyle.bg).toBe(colors.tint);
  expect(loopStyle.color).toBe(colors.ink);
  expect(loopStyle.radius).toBe('0px');

  // 구간이 없을 때(a: null, b: null)는 배지가 붙지 않는다
  await mockApp(page, {
    ...STATES.userData,
    songs: STATES.userData.songs.map((s) => ({ ...s, a: null, b: null })),
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#recentSongSegment').waitFor();

  const noLoopStyle = await page.locator('#recentSongSegment').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { topW: s.borderTopWidth, color: s.color };
  });
  expect(noLoopStyle.topW).toBe('0px');
  expect(noLoopStyle.color).toBe(colors.muted);
});

test('DS2-6 이어서 줄', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, local: { 'ulp:tab': 'reint' } });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#modes').waitFor();

  const colors = await resolveTokenColors(page);
  const curItem = page.locator('#modes li.cur');
  await expect(curItem).toHaveCount(1);

  const curShadow = await curItem.evaluate((el) => window.getComputedStyle(el).boxShadow);
  expect(curShadow).toContain('inset');
  expect(curShadow).toContain(colors.nowRing);

  const curPadLeft = await curItem.locator('a').evaluate((el) => window.getComputedStyle(el).paddingLeft);
  expect(curPadLeft).toBe('10px');

  const otherShadows = await page
    .locator('#modes li:not(.cur)')
    .evaluateAll((els) => els.map((el) => window.getComputedStyle(el).boxShadow));
  expect(otherShadows.length).toBeGreaterThan(0);
  for (const sh of otherShadows) {
    expect(sh).toBe('none');
  }
});

test('DS2-7 배너 색 (라이트)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#homeCommunityBanner').waitFor();

  const colors = await resolveTokenColors(page);
  const bannerBg = await page.locator('#homeCommunityBanner').evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const titleColor = await page.locator('#homeCommunityTitle').evaluate((el) => window.getComputedStyle(el).color);
  const linkInfo = await page.locator('#homeCommunityLink').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      color: s.color,
      textDecorationLine: s.textDecorationLine,
      href: el.getAttribute('href'),
    };
  });

  expect(bannerBg).toBe(colors.accent);
  expect(titleColor).toBe(colors.accentInk);
  expect(linkInfo.color).toBe(colors.accentInk);
  expect(linkInfo.textDecorationLine).toContain('underline');
  expect(linkInfo.href).toBe('community.html');

  await page.setViewportSize({ width: 390, height: 900 });
  const linkBox = await page.locator('#homeCommunityLink').boundingBox();
  expect(linkBox).not.toBeNull();
  expect(linkBox.height).toBeGreaterThanOrEqual(44);
});

test('DS2-7 배너 색 (다크)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#homeCommunityBanner').waitFor();

  const colors = await resolveTokenColors(page);
  const bannerBg = await page.locator('#homeCommunityBanner').evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const titleColor = await page.locator('#homeCommunityTitle').evaluate((el) => window.getComputedStyle(el).color);
  const linkInfo = await page.locator('#homeCommunityLink').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      color: s.color,
      textDecorationLine: s.textDecorationLine,
      href: el.getAttribute('href'),
    };
  });

  expect(bannerBg).toBe(colors.accent);
  expect(titleColor).toBe(colors.accentInk);
  expect(linkInfo.color).toBe(colors.accentInk);
  expect(linkInfo.textDecorationLine).toContain('underline');
  expect(linkInfo.href).toBe('community.html');
});

test('DS2-8 배너 링크 포커스와 빈 썸네일', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#homeCommunityLink').waitFor();

  const colors = await resolveTokenColors(page);
  const focusInfo = await page.locator('#homeCommunityLink').evaluate((el) => {
    el.focus();
    const s = window.getComputedStyle(el);
    return {
      focusVisible: el.matches(':focus-visible'),
      outlineColor: s.outlineColor,
      outlineStyle: s.outlineStyle,
    };
  });
  expect(focusInfo.focusVisible).toBe(true);
  expect(focusInfo.outlineColor).toBe(colors.accentInk);
  expect(focusInfo.outlineStyle).not.toBe('none');

  const songPlaceholderColor = await page
    .locator('#recentSongEmpty > div')
    .first()
    .evaluate((el) => window.getComputedStyle(el).color);
  const notePlaceholderColor = await page
    .locator('#recentNoteEmpty > div')
    .first()
    .evaluate((el) => window.getComputedStyle(el).color);

  expect(songPlaceholderColor).toBe(colors.ink);
  expect(notePlaceholderColor).toBe(colors.ink);
});
