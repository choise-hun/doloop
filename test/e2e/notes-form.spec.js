// M2-1b: 노트 요청 폼 경량화·예상 크레딧·작업 경과 시간 — 명세 개발산출물/명세/M2-1b_구현명세.md §6-2
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');

const PRO_ME = {
  tier: 'pro',
  billingTier: 'pro',
  limits: { ...DEFAULT_ME.limits, ai: true },
  credits: { monthly: 30, purchased: 0 },
};
const VID = { a: 'aaaaaaaaaa1', b: 'bbbbbbbbbb2', c: 'cccccccccc3' };
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;
const isEstimate = (r) => new URL(r.url()).pathname === '/api/v1/credits/estimate';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

/** 영상 id 끝 숫자 n → 예상 n·예약 n+8. calls에 요청 본문을 쌓는다. gate[id]가 있으면 그 약속이 풀릴 때까지 응답을 미룬다 */
function estimateRoute(calls, gate = {}) {
  return [
    (url) => url.pathname === '/api/v1/credits/estimate',
    async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      calls.push(body);
      const id = new URL(body.url).searchParams.get('v') || '';
      if (gate[id]) await gate[id];
      const n = Number(id.slice(-1));
      return json(route, { estimatedCredits: n, reserveCredits: n + 8 });
    },
  ];
}

async function open(page, width, opts) {
  await page.setViewportSize({ width, height: 844 });
  await mockApp(page, { ...STATES.user, ...opts });
  await page.goto('/notes.html', { waitUntil: 'load' });
  return (await page.locator('#root').count()) > 0;
}

test('N1 390 첫 화면: 링크·태그(화성 선택)·요청 버튼이 스크롤 없이 보이고 메모는 접힘', async ({ page }) => {
  test.skip(!(await open(page, 390, { me: PRO_ME, routes: [estimateRoute([])] })), 'legacy 모드: React 화면 아님');
  await expect(page.locator('#tags button', { hasText: '화성' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tags button[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('#memo')).toBeHidden();
  await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'false');
  const submit = await page.locator('#submit').boundingBox();
  const tabBar = await page.locator('[data-tabbar]').boundingBox();
  expect(submit.y + submit.height).toBeLessThanOrEqual(tabBar.y); // 탭 바에 가리지 않고 첫 화면 안
});

test('N2 메모 옵션: 펼치면 메모, 접어도 입력은 남고 "입력함" 표시', async ({ page }) => {
  test.skip(!(await open(page, 390, { me: PRO_ME, routes: [estimateRoute([])] })), 'legacy 모드: React 화면 아님');
  await page.locator('#noteOptToggle').click();
  await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#memo').fill('3:20 보이싱');
  await page.locator('#noteOptToggle').click();
  await expect(page.locator('#memo')).toBeHidden();
  await expect(page.locator('#noteOptToggle')).toHaveText('+ 메모 옵션 (입력함)');
  await page.locator('#noteOptToggle').click();
  await expect(page.locator('#memo')).toHaveValue('3:20 보이싱');
});

test('N3 예상 크레딧: 빠르게 세 번 바꾸면 마지막 영상만 한 번 묻는다', async ({ page }) => {
  const calls = [];
  test.skip(!(await open(page, 1280, { me: PRO_ME, routes: [estimateRoute(calls)] })), 'legacy 모드: React 화면 아님');
  const url = page.locator('#url');
  await url.fill(yt(VID.a));
  await url.fill(yt(VID.b));
  await url.fill(yt(VID.c));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 3크레딧 · 남은 30');
  expect(calls).toEqual([{ kind: 'note', url: yt(VID.c) }]);
  // 같은 영상으로 돌아오면 다시 묻지 않는다(계정·영상별 캐시)
  await url.fill('');
  await expect(page.locator('#noteEstimate')).toHaveCount(0);
  await url.fill(yt(VID.c));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 3크레딧 · 남은 30');
  expect(calls).toHaveLength(1);
});

test('N4 예상 크레딧 레이스: 먼저 보낸 A 응답이 B 뒤에 와도 B가 남는다', async ({ page }) => {
  const calls = [];
  let releaseA;
  const gate = { [VID.a]: new Promise((r) => (releaseA = r)) };
  test.skip(!(await open(page, 1280, { me: PRO_ME, routes: [estimateRoute(calls, gate)] })), 'legacy 모드: React 화면 아님');
  const reqA = page.waitForRequest((r) => isEstimate(r) && r.postData().includes(VID.a));
  await page.locator('#url').fill(yt(VID.a));
  await reqA; // A가 서버로 나갔고 응답은 막혀 있다
  await page.locator('#url').fill(yt(VID.b));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 2크레딧 · 남은 30');
  const resA = page.waitForResponse((r) => isEstimate(r.request()) && r.request().postData().includes(VID.a));
  releaseA();
  await resA;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 2크레딧 · 남은 30');
  expect(calls.map((c) => c.url)).toEqual([yt(VID.a), yt(VID.b)]);
});

test('N5 잔액 부족 안내: 남은 크레딧 < 예약액이면 경고, 버튼은 막지 않는다', async ({ page }) => {
  const low = { ...PRO_ME, credits: { monthly: 5, purchased: 0 } };
  test.skip(!(await open(page, 390, { me: low, routes: [estimateRoute([])] })), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID.c));
  await expect(page.locator('#noteCreditWarn')).toContainText('남은 크레딧(5)이 요청할 때 잡아 두는 11크레딧보다 적어');
  await expect(page.locator('#noteCreditWarn a')).toHaveAttribute('href', 'settings.html#credits');
  await expect(page.locator('#submit')).toBeEnabled();
});

test('N6 예상 실패(400): "계산하지 못했어요", 요청 버튼은 그대로', async ({ page }) => {
  const routes = [[(url) => url.pathname === '/api/v1/credits/estimate', (route) => json(route, { code: 'INVALID_INPUT', message: '길이를 알 수 없는 영상' }, 400)]];
  test.skip(!(await open(page, 1280, { me: PRO_ME, routes })), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID.a));
  await expect(page.locator('#noteEstimate')).toHaveText('예상 크레딧을 계산하지 못했어요');
  await expect(page.locator('#noteCreditWarn')).toHaveCount(0);
  await expect(page.locator('#submit')).toBeEnabled();
});

test('N7 무료 티어: 예상 크레딧을 묻지 않는다', async ({ page }) => {
  const calls = [];
  await page.clock.install();
  test.skip(!(await open(page, 1280, { routes: [estimateRoute(calls)] })), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID.a));
  await page.clock.runFor(2000); // 디바운스(600ms)를 지나도
  await expect(page.locator('#noteEstimate')).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('N8 진행 중 작업: 경과 시간이 1초마다 바뀌고 단계 안내가 보인다', async ({ page }) => {
  const T = Date.parse('2026-11-07T03:00:00Z');
  await page.clock.setFixedTime(T);
  const job = {
    id: '00000000-0000-4000-8000-0000000000j1', kind: 'note', url: yt(VID.a), tags: ['화성'], status: 'running',
    error: null, noteId: null, reservedCredits: 11, chargedCredits: null,
    createdAt: new Date(T - 80_000).toISOString(), startedAt: new Date(T - 65_000).toISOString(), finishedAt: null,
  };
  const routes = [[(url) => url.pathname === '/api/v1/notes/jobs', (route) => json(route, { jobs: [job] })]];
  test.skip(!(await open(page, 1280, { me: PRO_ME, routes })), 'legacy 모드: React 화면 아님');
  const row = page.locator('#jobs li').first();
  await expect(row).toContainText('분석 중 · 1:05');
  await expect(row.locator('[data-job-stage="running"]')).toHaveText('영상을 보고 노트를 정리하는 중이에요. 보통 1~3분 걸려요.');
  await page.clock.setFixedTime(T + 10_000);
  await expect(row).toContainText('분석 중 · 1:15'); // 1초 타이머가 다시 그린다
  await page.clock.setFixedTime(T + 200_000);
  await expect(row.locator('[data-job-stage="slow"]')).toHaveText('평소보다 오래 걸리고 있어요. 이 화면을 닫아도 분석은 계속돼요.');
});

test('N9 두 번 제출해도 요청은 한 번, 성공하면 메모 접고 /me 다시 받기', async ({ page }) => {
  const analyze = [];
  let meCalls = 0;
  const routes = [
    estimateRoute([]),
    [(url) => url.pathname === '/api/v1/me', (route) => { meCalls += 1; return json(route, { ...DEFAULT_ME, ...PRO_ME }); }],
    [(url) => url.pathname === '/api/v1/notes/analyze', (route) => {
      analyze.push(JSON.parse(route.request().postData() || '{}'));
      return json(route, { jobId: '00000000-0000-4000-8000-0000000000j2', status: 'queued', reservedCredits: 11 }, 202);
    }],
  ];
  test.skip(!(await open(page, 1280, { me: PRO_ME, routes })), 'legacy 모드: React 화면 아님');
  await page.locator('#url').fill(yt(VID.c));
  await page.locator('#noteOptToggle').click();
  await page.locator('#memo').fill('후렴');
  await expect(page.locator('#noteEstimate')).toHaveText('예상 3크레딧 · 남은 30');
  const meBefore = meCalls;
  const meAgain = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/me');
  // 같은 작업 안에서 두 번 제출(React가 버튼을 막기 전) — submittingRef만 막을 수 있다
  await page.evaluate(() => {
    const form = document.getElementById('form');
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator('#msg')).toContainText('분석을 요청했어요');
  await meAgain;
  expect(analyze).toEqual([{ url: yt(VID.c), tags: ['화성'], memo: '후렴' }]);
  expect(meCalls).toBeGreaterThan(meBefore);
  await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#url')).toHaveValue('');
});
