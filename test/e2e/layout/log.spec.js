// 연습 기록 화면 정렬 검사 (FT-2): 공통 검사 G0~G8. M2에서 다시 만드는 화면이라 배치 약속은 M2 step에서 쓴다
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');
const { COMMUNITY_PRO_ME, communityRoutes } = require('../support/community-fixtures');

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

const LOG_COMMUNITY_PRO = {
  ...STATES.userData,
  me: COMMUNITY_PRO_ME,
  routes: communityRoutes(),
};

layoutSuite({
  name: 'log',
  path: '/log.html#community',
  states: [{ name: 'communityPro', mock: LOG_COMMUNITY_PRO }],
  ready: async (page) => {
    await page.locator('#pane-community').waitFor();
    await expect(page.locator('#pane-community')).not.toContainText('i18n-keep');
    await expect(page.locator('#pane-community [data-row]')).toHaveCount(5);
    await expect(page.locator('#mySharesPanel [data-share-row]')).toHaveCount(2);
  },
  dark: 'communityPro',
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

// LOG creator 배지에도 JSX 주석이 사용자 텍스트로 노출되지 않아야 한다.
layoutSuite({
  name: 'log-creators', path: '/log.html#community',
  states: [{ name: 'logs', mock: LOG_COMMUNITY_PRO }],
  ready: async (page) => {
    await page.locator('#chipLog').click();
    await expect(page.locator('[data-user-id]').first()).toBeVisible();
    await expect(page.locator('#pane-community')).not.toContainText('i18n-keep');
  },
  dark: 'logs',
});
