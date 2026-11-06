// M2-1c: 노트 폼 구간 입력(견적 반영) · 실패 작업 원탭 재시도(폼 복원) — 결과/M2-1c_구간재시도.md
// API: 결과/M2-1s_노트구간서버.md §2 — analyze·estimate 본문 startSec·endSec는 값이 있을 때만 보낸다(S-D4)
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');

const PRO_ME = { tier: 'pro', billingTier: 'pro', limits: { ...DEFAULT_ME.limits, ai: true }, credits: { monthly: 30, purchased: 0 } };
const VID = 'aaaaaaaaaa1';
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

/** 구간이 있으면 예상 2, 없으면 9. calls에 본문을 쌓는다 */
function estimateRoute(calls) {
  return [
    (url) => url.pathname === '/api/v1/credits/estimate',
    (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      calls.push(body);
      const n = 'startSec' in body || 'endSec' in body ? 2 : 9;
      return json(route, { estimatedCredits: n, reserveCredits: n + 8 });
    },
  ];
}

function analyzeRoute(calls) {
  return [
    (url) => url.pathname === '/api/v1/notes/analyze',
    (route) => {
      calls.push(JSON.parse(route.request().postData() || '{}'));
      return json(route, { jobId: '00000000-0000-4000-8000-0000000000a1', status: 'queued', reservedCredits: 10 }, 202);
    },
  ];
}

function jobsRoute(jobs) {
  return [(url) => url.pathname === '/api/v1/notes/jobs', (route) => json(route, { jobs })];
}

function job(over) {
  return {
    id: '00000000-0000-4000-8000-0000000000f1', kind: 'note', url: yt(VID), tags: ['화성', '리듬'], memo: '후렴 보이싱',
    startSec: 60, endSec: 610, pace: null, status: 'failed', error: 'GEMINI_MAX_TOKENS: 출력 한도 초과', noteId: null,
    reservedCredits: 12, chargedCredits: 0, createdAt: '2026-11-07T03:00:00Z', startedAt: '2026-11-07T03:00:05Z',
    finishedAt: '2026-11-07T03:02:00Z', ...over,
  };
}

async function open(page, routes) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.user, me: PRO_ME, routes });
  await page.goto('/notes.html', { waitUntil: 'load' });
  return (await page.locator('#root').count()) > 0;
}

test('R1 구간 입력: 예상·요청 본문에 startSec·endSec, 성공하면 구간 칸도 비운다', async ({ page }) => {
  const est = [];
  const sent = [];
  test.skip(!(await open(page, [estimateRoute(est), analyzeRoute(sent)])), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 9크레딧 · 남은 30');
  await page.locator('#noteOptToggle').click();
  await page.locator('#noteStart').fill('1:20');
  await page.locator('#noteEnd').fill('200');
  await expect(page.locator('#noteEstimate')).toHaveText('예상 2크레딧 · 남은 30');
  expect(est).toEqual([
    { kind: 'note', url: yt(VID) },
    { kind: 'note', url: yt(VID), startSec: 80, endSec: 200 },
  ]);
  await page.locator('#submit').click();
  await expect(page.locator('#msg')).toContainText('분석을 요청했어요');
  expect(sent).toEqual([{ url: yt(VID), tags: ['화성'], memo: '', startSec: 80, endSec: 200 }]);
  await page.locator('#noteOptToggle').click();
  await expect(page.locator('#noteStart')).toHaveValue('');
  await expect(page.locator('#noteEnd')).toHaveValue('');
});

test('R2 잘못된 구간: 칸 아래 안내, 그 구간으로 예상을 묻지 않고 요청도 보내지 않는다', async ({ page }) => {
  const est = [];
  const sent = [];
  test.skip(!(await open(page, [estimateRoute(est), analyzeRoute(sent)])), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 9크레딧 · 남은 30');
  await page.locator('#noteOptToggle').click();
  await page.locator('#noteStart').fill('3:00');
  await page.locator('#noteEnd').fill('2:00');
  await expect(page.locator('#noteRangeErr')).toHaveText('끝 시간은 시작보다 1초 이상 뒤여야 해요.');
  await expect(page.locator('#noteEstimate')).toHaveCount(0);
  await page.locator('#noteOptToggle').click(); // 접어 둔 채 제출해도 막고 다시 펼친다
  await page.locator('#submit').click();
  await expect(page.locator('#msg')).toHaveText('끝 시간은 시작보다 1초 이상 뒤여야 해요.');
  await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#noteEnd').fill('abc');
  await expect(page.locator('#noteRangeErr')).toHaveText('시간은 1:20 또는 80처럼 적어 주세요(최대 24시간).');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 900))); // 디바운스(600ms)를 지나도
  expect(sent).toHaveLength(0);
  expect(est.filter((b) => 'startSec' in b || 'endSec' in b)).toHaveLength(0);
});

test('R3 재시도: 링크·태그·메모·구간을 폼에 채우고 구간 칸으로 간다 — 요청은 고쳐서 누를 때 한 번', async ({ page }) => {
  const est = [];
  const sent = [];
  test.skip(!(await open(page, [estimateRoute(est), analyzeRoute(sent), jobsRoute([job({})])])), 'legacy 모드: React 화면 아님');
  const retry = page.locator('#jobs [data-job-retry]');
  await expect(retry).toHaveText('구간 줄여서 다시 시도');
  await retry.click();
  await expect(page.locator('#url')).toHaveValue(yt(VID));
  await expect(page.locator('#tags button[aria-pressed="true"]')).toHaveText(['화성', '리듬']);
  await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#memo')).toHaveValue('후렴 보이싱');
  await expect(page.locator('#noteStart')).toHaveValue('1:00');
  await expect(page.locator('#noteEnd')).toHaveValue('10:10');
  await expect(page.locator('#noteStart')).toBeFocused();
  await expect(page.locator('#msg')).toHaveText('실패한 요청을 폼에 다시 채웠어요. 구간을 고친 뒤 분석 요청을 눌러 주세요.');
  await expect(page.locator('#noteEstimate')).toHaveText('예상 2크레딧 · 남은 30');
  expect(sent).toHaveLength(0); // 누르기만 해서는 크레딧을 잡지 않는다
  await page.locator('#noteEnd').fill('5:00');
  await page.locator('#submit').click();
  await expect(page.locator('#msg')).toContainText('분석을 요청했어요');
  expect(sent).toEqual([{ url: yt(VID), tags: ['화성', '리듬'], memo: '후렴 보이싱', startSec: 60, endSec: 300 }]);
});

test('R4 재시도 버튼은 실패한 노트 작업에만 — 구간 없는 실패는 "다시 시도", 복원 본문에 구간 없음', async ({ page }) => {
  const sent = [];
  const jobs = [
    job({ id: '00000000-0000-4000-8000-0000000000f2', kind: 'progression', tags: [], startSec: null, endSec: null, pace: 'normal' }),
    job({ id: '00000000-0000-4000-8000-0000000000f3', status: 'done', error: null, noteId: '00000000-0000-4000-8000-0000000000n1' }),
    job({ id: '00000000-0000-4000-8000-0000000000f4', error: 'GEMINI_RATE_LIMIT: 429', startSec: null, endSec: null, memo: '', tags: ['TAB', '없는태그'] }),
  ];
  test.skip(!(await open(page, [estimateRoute([]), analyzeRoute(sent), jobsRoute(jobs)])), 'legacy 모드: React 화면 아님');
  await expect(page.locator('#jobs li')).toHaveCount(3);
  const retry = page.locator('#jobs [data-job-retry]');
  await expect(retry).toHaveCount(1);
  await expect(retry).toHaveText('다시 시도');
  await retry.click();
  await expect(page.locator('#tags button[aria-pressed="true"]')).toHaveText(['TAB']); // 폼에 없는 태그는 버린다
  await expect(page.locator('#noteStart')).toHaveValue('');
  await expect(page.locator('#noteEnd')).toHaveValue('');
  await page.locator('#submit').click();
  await expect(page.locator('#msg')).toContainText('분석을 요청했어요');
  expect(sent).toEqual([{ url: yt(VID), tags: ['TAB'], memo: '' }]);
});

test('R5 구간만 적고 접어도 토글에 "입력함"', async ({ page }) => {
  test.skip(!(await open(page, [estimateRoute([])])), 'legacy 모드: React 화면 아님');
  await page.locator('#noteOptToggle').click();
  await page.locator('#noteEnd').fill('90');
  await page.locator('#noteOptToggle').click();
  await expect(page.locator('#noteOptToggle')).toHaveText('+ 구간 · 메모 옵션 (입력함)');
});
