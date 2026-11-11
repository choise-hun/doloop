// 커뮤니티 화면 정렬 검사 (CM-UI): 공통 검사 G0~G8 및 배치 약속
// 규격: 개발산출물/프론트_정렬규격.md · 상세 명세: 개발산출물/명세/CM-UI_구현명세.md §7
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { STATES } = require('../support/mock-app');
const { COMMUNITY_PRO_ME, communityRoutes, EPISODE_POST_1 } = require('../support/community-fixtures');

const COMMUNITY_PRO = {
  ...STATES.userData,
  me: COMMUNITY_PRO_ME,
  routes: communityRoutes(),
};

layoutSuite({
  name: 'community-guest',
  path: '/community.html',
  states: ['guest'],
  ready: async (page) => {
    await page.locator('#communityGuest').waitFor();
  },
  dark: 'guest',
});

layoutSuite({
  name: 'community-pro',
  path: '/community.html',
  states: [{ name: 'communityPro', mock: COMMUNITY_PRO }],
  ready: async (page) => {
    await page.locator('#episodeFeed').waitFor();
    await page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`).waitFor();
  },
  dark: 'communityPro',
});

// CMR-1: LOGS 탭(마소니 열·범위 칩)도 같은 검사기로 본다
layoutSuite({
  name: 'community-logs',
  path: '/community.html#logs',
  states: [{ name: 'communityPro', mock: COMMUNITY_PRO }],
  ready: async (page) => {
    await page.locator('#episodeScopeAll').waitFor();
    await page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`).waitFor();
  },
  dark: 'communityPro',
});

// CMR-1: 전체 빈 상태(#communityAllEmpty) 4폭 검사
const COMMUNITY_EMPTY = {
  ...STATES.userData,
  me: COMMUNITY_PRO_ME,
  routes: communityRoutes({
    curationHome: { curated: [], monthlyPick: null, showcase: [], following: [] },
    onEpisodeLogs: (r, json) => json(r, { posts: [], next: null }),
  }),
};

layoutSuite({
  name: 'community-empty',
  path: '/community.html',
  states: [{ name: 'communityEmpty', mock: COMMUNITY_EMPTY }],
  ready: async (page) => {
    await page.locator('#communityAllEmpty').waitFor();
  },
  dark: 'communityEmpty',
});

// CMR-2: 이름 없는 계정의 첫 진입 이름 모달 4폭+다크 검사
const COMMUNITY_NO_NAME = {
  ...STATES.userData,
  me: { ...COMMUNITY_PRO_ME, publicName: null, publicNameNextChangeAt: null },
  routes: communityRoutes(),
};

layoutSuite({
  name: 'community-name-modal',
  path: '/community.html',
  states: [{ name: 'communityNoName', mock: COMMUNITY_NO_NAME }],
  ready: async (page) => {
    await page.locator('#communityNameModalInput').waitFor();
  },
  dark: 'communityNoName',
});

test('CM-UI CUI-01 커뮤니티 제목과 탭 렌더 검증', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { mockApp } = require('../support/mock-app');
  await mockApp(page, COMMUNITY_PRO);
  await page.goto('/community.html', { waitUntil: 'load' });
  await page.locator('#communityHeader').waitFor();
  await expect(page.locator('#communityTitle')).toHaveText('COMMUNITY');
  await expect(page.locator('#chipAll')).toBeVisible();
  await expect(page.locator('#chipLog')).toBeVisible();
});
