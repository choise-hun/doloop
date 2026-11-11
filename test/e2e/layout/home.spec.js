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

  // 개별 프레임 카드의 테두리(border) 독립 분리 검증
  const betterBorder = await better.evaluate((el) => window.getComputedStyle(el).borderWidth);
  const vaultBorder = await vault.evaluate((el) => window.getComputedStyle(el).borderWidth);
  expect(betterBorder).toBe('1px');
  expect(vaultBorder).toBe('1px');
});
