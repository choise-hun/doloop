// 학습 노트 목록 화면 정렬 검사 (FT-2): 공통 검사 G0~G8
// 배치 약속: 명세/M2-1a_구현명세.md §5(제목 줄), 명세/M2-1b_구현명세.md §5(요청 줄 — pro 상태),
//           결과/M2-1c_구간재시도.md §1(구간 줄·재시도 버튼 — retry 상태)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, DEFAULT_ME } = require('../support/mock-app');

const PRO_ME = { tier: 'pro', billingTier: 'pro', limits: { ...DEFAULT_ME.limits, ai: true }, credits: { monthly: 30, purchased: 0 } };
const estimateRoute = [
  (url) => url.pathname === '/api/v1/credits/estimate',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ estimatedCredits: 4, reserveCredits: 12 }),
    }),
];

// M2-1b: Pro + 예상 크레딧이 보이는 상태(요청 줄 submitRow 맞춤 확인)
const PRO = { name: 'pro', mock: { ...STATES.user, me: PRO_ME, routes: [estimateRoute] } };

// M2-1c: 실패한 노트 작업 → 재시도로 폼 복원(옵션 패널 열림·구간·메모 채움)
const FAILED_JOB = {
  id: '00000000-0000-4000-8000-0000000000f1', kind: 'note', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  tags: ['화성', '리듬'], memo: '후렴 보이싱 위주로', startSec: 60, endSec: 610, pace: null,
  status: 'failed', error: 'GEMINI_MAX_TOKENS: 출력 한도 초과', noteId: null, reservedCredits: 12, chargedCredits: 0,
  createdAt: '2026-11-07T03:00:00Z', startedAt: '2026-11-07T03:00:05Z', finishedAt: '2026-11-07T03:02:00Z',
};
const RETRY = {
  name: 'retry',
  mock: {
    ...STATES.user,
    me: PRO_ME,
    routes: [
      estimateRoute,
      [
        (url) => url.pathname === '/api/v1/notes/jobs',
        (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ jobs: [FAILED_JOB] }) }),
      ],
    ],
  },
};

async function notesReady(page, state) {
  await page.locator('#notesList').waitFor({ state: 'attached' });
  if (state === 'userData') await expect(page.locator('#notesList a').first()).toBeVisible();
  if (state === 'pro') {
    await page.locator('#url').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    await expect(page.locator('#noteEstimate')).toHaveText('예상 4크레딧 · 남은 30');
  }
  if (state === 'retry') {
    await page.locator('[data-job-retry]').click();
    await expect(page.locator('#noteStart')).toHaveValue('1:00');
    await expect(page.locator('#noteEstimate')).toHaveText('예상 4크레딧 · 남은 30');
    await page.locator('#noteStart').blur(); // 포커스 고리는 판정·캡처에서 뺀다
  }
}

layoutSuite({
  name: 'notes',
  path: '/notes.html',
  states: ['guest', 'user', 'userData', PRO, RETRY],
  ready: notesReady,
  dark: 'userData',
});

// 버튼·필 글자가 한 줄인지(FT-4 settings.spec.js collectWrappedPills 복사 — 규격 §8).
// M2-1c: 옵션 토글 "(입력함)" 문구·재시도 버튼이 390에서 두 줄 필이 되지 않는다
function collectWrappedPills() {
  const out = [];
  for (const el of document.querySelectorAll('main button, main a.pillBtn, main a.ghostBtn')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !(el.textContent || '').trim()) continue;
    const before = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    const oneLine = el.getBoundingClientRect().height;
    el.style.whiteSpace = before;
    if (r.height > oneLine + 1) {
      out.push(`${el.id ? '#' + el.id : el.tagName.toLowerCase()} "${el.textContent.trim()}" 두 줄(높이 ${Math.round(r.height)}px > 한 줄 ${Math.round(oneLine)}px, 폭 ${Math.round(r.width)}px)`);
    }
  }
  return out;
}

for (const width of [390, 768, 1280]) {
  test(`FT notes retry ${width}px 버튼·필 글자 한 줄(옵션 접힘 "입력함" 포함)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, RETRY.mock);
    await page.goto('/notes.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await notesReady(page, 'retry');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(collectWrappedPills)).toEqual([]);
    await page.locator('#noteOptToggle').click(); // 접으면 "(입력함)" 문구 — 가장 긴 토글 글자
    await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(collectWrappedPills)).toEqual([]);
  });
}
