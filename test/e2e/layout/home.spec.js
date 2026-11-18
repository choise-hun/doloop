// 홈 화면 정렬 검사 (FT-1): 공통 검사 G0~G8 + 배치 약속(HomePage.tsx data-align-group)
// 규격: 개발산출물/프론트_정렬규격.md · 옛 H1~H6 대응: 개발산출물/결과/FT-0_규격설계.md §3
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');
const { COMMUNITY_FREE_ME, communityRoutes } = require('../support/community-fixtures');

const RECENT_MEMO = '2절 코러스 들어가기 전 슬라이드가 늦다. 메트로놈 70부터 다시, 왼손 3번 손가락 위치 확인하고 넘어가기';
const HOME_RECENT_MEMO = {
  ...STATES.userData,
  songs: STATES.userData.songs.map((s, i) => (i === 0 ? { ...s, memo: RECENT_MEMO } : s)),
};

const HOME_CURATION = {
  ...STATES.userData,
  me: COMMUNITY_FREE_ME,
  routes: communityRoutes(),
};

layoutSuite({
  name: 'home',
  path: '/index.html',
  states: ['guest', 'guestLocal', 'userData', { name: 'curation', mock: HOME_CURATION }, { name: 'recentMemo', mock: HOME_RECENT_MEMO }],
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

  // 개별 프레임 카드의 테두리 독립 분리 검증 (DS2-2: 왼쪽 12px 스파인, 나머지 세 변 1px)
  const betterSides = await better.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
  });
  const vaultSides = await vault.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
  });
  expect(betterSides).toEqual(['1px', '1px', '1px', '12px']);
  expect(vaultSides).toEqual(['1px', '1px', '1px', '12px']);
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
      fill1: readColor('color', 'var(--fill1)'),
      fill2: readColor('color', 'var(--fill2)'),
      fill3: readColor('color', 'var(--fill3)'),
      seamHairline: readColor('color', 'var(--seam-hairline)'),
      panelFrosted: readColor('backgroundColor', 'var(--panel-frosted)'),
      streakDone: readColor('backgroundColor', 'var(--streak-done)'),
      paper: readColor('backgroundColor', 'var(--paper)'),
      reliefBottomMid: readColor('color', 'var(--relief-bottom-mid)'),
      fill3Tint: readColor('backgroundColor', 'color-mix(in srgb, var(--fill3) 12%, transparent)'),
    };
  });
}

// DS2-2(2026-11-19 승인): 상단 3px 바 → 왼쪽 12px 스파인 + 3px 블록 + 릴리프. 스파인 색은 카드마다 다르다(명세 D3)
const rgbOf = (c) => (c.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number).join(',');

test('DS22-1 스파인·블록 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();

  const colors = await resolveTokenColors(page);
  for (const [sel, spine] of [
    ['#weeklyStreakCard', colors.fill1],
    ['#recentSongCard', colors.fill2],
    ['#betterFrame', colors.fill3],
    ['#vaultFrame', colors.fill2],
  ]) {
    const b = await page.locator(sel).evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        leftW: s.borderLeftWidth, leftC: s.borderLeftColor,
        topW: s.borderTopWidth, topC: s.borderTopColor,
        radius: s.borderTopLeftRadius, shadow: s.boxShadow,
      };
    });
    expect(b.leftW, `${sel} borderLeftWidth`).toBe('12px');
    expect(b.leftC, `${sel} borderLeftColor`).toBe(spine);
    expect(b.topW, `${sel} borderTopWidth`).toBe('1px');
    expect(b.topC, `${sel} borderTopColor`).toBe(colors.seamHairline);
    expect(b.radius, `${sel} radius`).toBe('3px');
    const shadowRgbs = (b.shadow.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map(rgbOf);
    expect(shadowRgbs, `${sel} box-shadow 릴리프`).toContain(rgbOf(colors.reliefBottomMid));
  }
});

test('DS22-2 범위 세그먼트 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#progScope').waitFor();

  const colors = await resolveTokenColors(page);
  const btns = page.locator('#progScope button');
  expect(await btns.evaluateAll((els) => els.map((el) => el.dataset.scope))).toEqual(['all', 'reference', 'analysis']);
  await expect(btns).toHaveText(['합산', '레퍼런스', '분석']);
  expect(await btns.evaluateAll((els) => els.map((el) => el.getAttribute('aria-pressed')))).toEqual(['true', 'false', 'false']);
  await expect(page.locator('#progArchKey')).toHaveText('진행 10개');
  await expect(page.locator('#progTasteLink')).toHaveAttribute('href', 'progressions.html?scope=all#progTaste');
  expect(await page.locator('#progScope').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  expect(await btns.evaluateAll((els) => els.map((el) => window.getComputedStyle(el).borderTopLeftRadius))).toEqual(['0px', '0px', '0px']);
  expect(await page.locator('#progScope [data-scope="all"]').evaluate((el) => window.getComputedStyle(el).backgroundColor)).toBe(colors.paper);
});

test('DS2-2 카드 제목', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();

  await expect(page.locator('#weeklyStreakCard h2')).toHaveText('WEEKLY');
  await expect(page.locator('#recentSongCard h2')).toHaveText('RECENT');
});

test('DS22-3 오늘 칸', async ({ page }) => {
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

  // 오늘 칸은 테두리(--now-ring)로만 구별하고 배경은 다른 칸과 같은 --panel-frosted
  expect(todayStyle.topC).toBe(colors.nowRing);
  expect(todayStyle.bg).toBe(colors.panelFrosted);
  expect(nonTodayBg).toBe(colors.panelFrosted);
  expect(todayStyle.dowC).toBe(colors.ink);
});

test('DS22-4 오늘 연습을 마친 칸', async ({ page }) => {
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

  expect(style.bg).toBe(colors.streakDone);
  expect(style.topC).toBe(colors.nowRing);
  expect(style.dowC).toBe(colors.ink);
});

// RC-1(2026-11-15 사용자 결정): RECENT 구간 표시는 배지(주황 테두리·틴트) 없이 회색 글자다.
// 헤더 링크와 메모 유지. 2026-11-16 사용자 승인으로 썸네일·제목에도 동일한 이동 링크를 제공한다.
test('RC-1 RECENT 구간은 배지 없음·기존 헤더와 썸네일/제목 이동', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.userData);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#recentSongSegment').waitFor();

  const colors = await resolveTokenColors(page);
  const seg = await page.locator('#recentSongSegment').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { topW: s.borderTopWidth, leftW: s.borderLeftWidth, bg: s.backgroundColor, color: s.color };
  });
  expect(seg.topW).toBe('0px');
  expect(seg.leftW).toBe('0px');
  expect(seg.bg).toBe('rgba(0, 0, 0, 0)');
  expect(seg.color).toBe(colors.muted);

  await expect(page.locator('#recentSongGo')).toHaveText('이어서 연습 →');
  await expect(page.locator('#recentSongBody a')).toHaveCount(2);
  for (const id of ['recentSongThumbLink', 'recentSongTitle']) {
    await expect(page.locator('#' + id)).toHaveAttribute('href', await page.locator('#recentSongGo').getAttribute('href'));
  }
  // 메모가 빈 곡이면 메모 줄이 없다
  await expect(page.locator('#recentSongMemo')).toHaveCount(0);
});

test('RC-1 RECENT 곡 메모는 한 줄 말줄임으로 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, HOME_RECENT_MEMO);
  await page.goto('/index.html', { waitUntil: 'load' });
  const memo = page.locator('#recentSongMemo');
  await expect(memo).toHaveText(RECENT_MEMO);
  const m = await memo.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { ws: s.whiteSpace, ov: s.textOverflow };
  });
  expect(m.ws).toBe('nowrap');
  expect(m.ov).toBe('ellipsis');
});

test('DS22-5 이어서 줄', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, local: { 'ulp:tab': 'reint' } });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#modes').waitFor();

  const colors = await resolveTokenColors(page);
  const curItem = page.locator('#modes li.cur');
  await expect(curItem).toHaveCount(1);

  const cur = await curItem.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { shadow: s.boxShadow, bg: s.backgroundColor };
  });
  expect(cur.shadow).toContain('inset');
  expect(cur.shadow).toContain(colors.fill3);
  expect(cur.bg).toBe(colors.fill3Tint);

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

// UXN: user-approved thumbnail/title navigation; preserve existing card identities.
for (const width of [390, 768, 1150, 1280]) {
  test(`UXN recent note ${width}px thumbnail/title/action share destination and action aligns right`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, STATES.userData);
    await page.goto('/index.html');
    const title = page.locator('#recentNoteTitle');
    const action = page.locator('#recentNoteLink');
    const thumbnail = page.locator('#recentNoteThumbLink');
    await expect(title).toHaveAttribute('href', `note.html?id=${STATES.userData.notes[0].id}`);
    const href = await action.getAttribute('href');
    await expect(thumbnail).toHaveAttribute('href', href);
    await expect(title).toHaveAttribute('href', href);
    await expect(action).toHaveText('이동');
    const textColumn = await page.locator('#recentNoteBody > div').boundingBox();
    const actionBox = await action.boundingBox();
    expect(Math.abs(actionBox.x + actionBox.width - textColumn.x - textColumn.width)).toBeLessThanOrEqual(1);
    if (width <= 768) expect(actionBox.height).toBeGreaterThanOrEqual(44);
    for (const id of ['recentNoteThumbLink', 'recentNoteTitle', 'recentNoteLink']) {
      const link = page.locator('#' + id);
      if (id === 'recentNoteTitle') { await link.focus(); await page.keyboard.press('Enter'); }
      else await link.click();
      await expect(page).toHaveURL(new RegExp('/note\\.html\\?id=' + STATES.userData.notes[0].id + '$'));
      await page.goBack();
      await expect(page.locator('#recentNoteBody')).toBeVisible();
    }
  });
}

for (const [name, state, videoId] of [['user', STATES.userData, STATES.userData.songs[0].videoId], ['local', STATES.guestLocal, 'jNQXAC9IVRw']]) {
  test(`UXN recent song ${name} thumbnail/title preserve resume query`, async ({ page }) => {
    await mockApp(page, state);
    await page.goto('/index.html');
    const href = await page.locator('#recentSongGo').getAttribute('href');
    for (const id of ['recentSongThumbLink', 'recentSongTitle']) await expect(page.locator('#' + id)).toHaveAttribute('href', href);
    const query = new URL(href, 'https://example.test').searchParams;
    expect(Object.fromEntries(query)).toEqual({ v: videoId, t: '30', a: '12', b: '48', r: '0.75' });
    await page.locator('#recentSongTitle').focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('/practice\\.html\\?'));
    expect(new URL(page.url()).search).toBe(new URL(href, 'https://example.test').search);
    await page.goBack();
    await page.locator('#recentSongThumbLink').click();
    await expect(page).toHaveURL(new RegExp('/practice\\.html\\?'));
    expect(new URL(page.url()).search).toBe(new URL(href, 'https://example.test').search);
  });
}

test('UXN empty recent cards keep their existing empty-state destinations', async ({ page }) => {
  await mockApp(page, STATES.guest); await page.goto('/index.html');
  await expect(page.locator('#recentSongEmpty')).toBeVisible();
  await expect(page.locator('#recentNoteEmpty')).toBeVisible();
  await expect(page.locator('#recentSongThumbLink, #recentSongTitle, #recentNoteThumbLink, #recentNoteTitle, #recentNoteLink')).toHaveCount(0);
  await expect(page.locator('#recentNoteEmpty a')).toHaveAttribute('href', 'notes.html');
});

test('DS22-6 버튼 3단계 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#goUrl').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(page.locator('#goPick')).toBeVisible();

  // 대표 주 행동 필은 #goPlay 하나다(히어로 폼 #go와 카드 4개 안)
  const pills = await page
    .locator('#go a, #go button, #weeklyStreakCard a, #weeklyStreakCard button, #recentSongCard a, #recentSongCard button, #betterFrame a, #betterFrame button, #vaultFrame a, #vaultFrame button')
    .evaluateAll((els) => els.filter((el) => window.getComputedStyle(el).borderTopLeftRadius === '9999px').map((el) => el.id || el.textContent.trim()));
  expect(pills).toEqual(['goPlay']);

  for (const id of ['goUrl', 'goNote', 'betterChordsBtn', 'betterPlayerBtn']) {
    expect(await page.locator('#' + id).evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius), id).toBe('3px');
  }
  const rand = await page.locator('#btnRandRef').evaluate((el) => {
    const s = window.getComputedStyle(el);
    return { topW: s.borderTopWidth, bg: s.backgroundColor };
  });
  expect(rand.topW).toBe('0px');
  expect(rand.bg).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#btnRandRef')).toHaveText('랜덤 ↻');
  await expect(page.locator('#progRefPlay')).toHaveText('연주하기 →');
  // iOS 확대 방지 16px는 유지한다(UXN)
  expect(await page.locator('#goUrl').evaluate((el) => window.getComputedStyle(el).fontSize)).toBe('16px');
});

test('DS22-7 터치 (390)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#progScope').waitFor();

  for (const sel of ['#btnRandRef', '#progRefPlay', '#progTasteLink']) {
    const box = await page.locator(sel).boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box.height, sel + ' 높이').toBeGreaterThanOrEqual(44);
  }
  const scopeHeights = await page.locator('#progScope button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(scopeHeights).toHaveLength(3);
  for (const h of scopeHeights) expect(h).toBeGreaterThanOrEqual(44);
});

test('DS22-8 다크 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#weeklyStreakCard').waitFor();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  const leftC = (sel) => page.locator(sel).evaluate((el) => window.getComputedStyle(el).borderLeftColor);
  expect(await leftC('#weeklyStreakCard')).toBe('rgb(255, 107, 43)');
  expect(await leftC('#vaultFrame')).toBe('rgb(212, 178, 106)');
  expect(await page.locator('#progScope [data-scope="all"]').evaluate((el) => window.getComputedStyle(el).backgroundColor)).toBe('rgb(36, 36, 34)');
});
