// 학습 노트 목록 화면 정렬 검사 (FT-2): 공통 검사 G0~G8
// 배치 약속: 명세/M2-1a_구현명세.md §5(제목 줄), 명세/M2-1b_구현명세.md §5(요청 줄 — pro 상태)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { STATES, DEFAULT_ME } = require('../support/mock-app');

// M2-1b: Pro + 예상 크레딧이 보이는 상태(요청 줄 submitRow 맞춤 확인)
const PRO = {
  name: 'pro',
  mock: {
    ...STATES.user,
    me: { tier: 'pro', billingTier: 'pro', limits: { ...DEFAULT_ME.limits, ai: true }, credits: { monthly: 30, purchased: 0 } },
    routes: [
      [
        (url) => url.pathname === '/api/v1/credits/estimate',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ estimatedCredits: 4, reserveCredits: 12 }),
          }),
      ],
    ],
  },
};

layoutSuite({
  name: 'notes',
  path: '/notes.html',
  states: ['guest', 'user', 'userData', PRO],
  ready: async (page, state) => {
    await page.locator('#notesList').waitFor({ state: 'attached' });
    if (state === 'userData') await expect(page.locator('#notesList a').first()).toBeVisible();
    if (state === 'pro') {
      await page.locator('#url').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
      await expect(page.locator('#noteEstimate')).toHaveText('예상 4크레딧 · 남은 30');
    }
  },
  dark: 'userData',
});
