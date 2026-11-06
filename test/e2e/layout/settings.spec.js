// 설정 화면 정렬 검사 (FT-2): 공통 검사 G0~G8 + 옛 settings-spacing.spec.js 간격 검사(본문 섹션 세로 간격 6·12·16, 상자마다 일정)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');

// M1-3c: 유료(Pro) 계정 — /me 티어·잔액 + GET /credits(다음 지급). 무료는 STATES.user(DEFAULT_ME = free)
const PRO_ME = {
  tier: 'pro',
  billingTier: 'free',
  limits: { songs: 100, categories: 7, takeBytes: 104857600, takeSongs: null, takeDurationSec: null, drive: true, ai: true, communityWrite: true },
  credits: { monthly: 152, purchased: 40 },
};
const CREDITS_ROUTE = [
  (url) => url.pathname === '/api/v1/credits',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ monthly: 152, purchased: 40, total: 192, monthlyGrant: 170, nextGrantAt: '2026-11-30T15:00:00Z' }),
    }),
];
const USER_PRO = { ...STATES.user, me: PRO_ME, routes: [CREDITS_ROUTE] };
// M1-3e: 유료 → 무료 전환 뒤 주기가 남은 유예 계정 — /me tier는 pro, /credits는 다음 지급 없이 monthlyExpiresAt
const GRACE_CREDITS_ROUTE = [
  (url) => url.pathname === '/api/v1/credits',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ monthly: 152, purchased: 40, total: 192, monthlyGrant: 0, nextGrantAt: null, monthlyExpiresAt: '2026-11-30T15:00:00Z' }),
    }),
];
const USER_GRACE = { ...STATES.user, me: PRO_ME, routes: [GRACE_CREDITS_ROUTE] };
// M2-4a: owner 계정 — 운영 섹션(접힘)을 펼치고 크리에이터 검색까지 한 화면(폴더 0개)
const OWNER_ADMIN_USERS_ROUTE = [
  (url) => url.pathname === '/api/v1/admin/users',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        users: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            email: 'creator.with.a.very.long.address@example.com',
            displayName: 'Creator With A Long Display Name',
            role: 'user',
            tier: 'pro',
            billingTier: 'pro',
            tierOverride: null,
            tierOverrideUntil: null,
            credits: { monthly: 10, purchased: 0 },
            isCreator: true,
            creatorBadge: '재즈 기타',
            creatorBio: '재즈 스탠더드 커버와 코드 보이싱 강의를 올려요.',
          },
        ],
      }),
    }),
];
const USER_OWNER = { ...STATES.user, me: { role: 'owner' }, routes: [OWNER_ADMIN_USERS_ROUTE] };
const SETTINGS_STATES = { guest: STATES.guest, user: STATES.user, userPro: USER_PRO, userGrace: USER_GRACE, userOwner: USER_OWNER };

async function settingsReady(page, state) {
  if (state === 'guest') await page.locator('#accGuest').waitFor();
  else await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  if (state === 'userPro') await expect(page.locator('#creditNext')).toContainText('170');
  if (state === 'userGrace') await expect(page.locator('#creditExpire')).toContainText('무료');
  if (state === 'userOwner') {
    await page.locator('#hOps').click();
    await page.locator('#opsEmail').fill('creator.with.a.very.long.address@example.com');
    await page.locator('#opsSearch').click();
    await page.locator('#opsCreatorForm').waitFor();
  }
}

layoutSuite({
  name: 'settings',
  path: '/settings.html',
  states: ['guest', 'user', { name: 'userPro', mock: USER_PRO }, { name: 'userGrace', mock: USER_GRACE }, { name: 'userOwner', mock: USER_OWNER }],
  ready: settingsReady,
  dark: 'userPro',
});

// M1-3c: Gemini 키 칸·키 발급 모달이 없고, 크레딧 칸이 티어별 문구를 보인다
for (const state of ['guest', 'user', 'userPro', 'userGrace']) {
  test(`M1-3c settings ${state} 크레딧 칸(Gemini 키 칸 없음)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, SETTINGS_STATES[state]);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await settingsReady(page, state);
    for (const id of ['#keys', '#gemKey', '#gemModel', '#geminiKeyStatus', '#btnOpenGeminiModal', '#geminiOnboardingModal']) {
      await expect(page.locator(id)).toHaveCount(0);
    }
    await expect(page.locator('main')).not.toContainText('BYOK');
    await expect(page.locator('main')).not.toContainText('Gemini API 키');
    const sec = page.locator('#credits');
    await expect(sec.locator('h2')).toHaveText('AI 분석 크레딧');
    if (state === 'guest') {
      await expect(page.locator('#creditMsg')).toContainText('로그인');
    } else if (state === 'user') {
      await expect(page.locator('#creditTier')).toHaveText('무료');
      await expect(page.locator('#creditMsg')).toContainText('Pro 플랜부터');
    } else if (state === 'userGrace') {
      // 2026-11-30T15:00Z = 12월 1일 0시(KST). 다음 지급 줄 대신 유예 끝 안내
      await expect(page.locator('#creditTier')).toHaveText('Pro');
      await expect(page.locator('#creditTotal')).toHaveText('192');
      await expect(page.locator('#creditNext')).toHaveCount(0);
      await expect(page.locator('#creditExpire')).toHaveText('12월 1일에 무료 플랜으로 바뀌어요 · 남은 월 지급 152크레딧은 그때 사라져요');
    } else {
      await expect(page.locator('#creditTier')).toHaveText('Pro');
      await expect(page.locator('#creditTotal')).toHaveText('192');
      await expect(page.locator('#creditBuckets')).toHaveText('월 지급 152 · 구매 40');
      // 2026-11-30T15:00Z = 12월 1일 0시(KST)
      await expect(page.locator('#creditNext')).toHaveText('다음 지급 12월 1일 · 170크레딧');
    }
  });
}

// 옛 settings-spacing.spec.js에서 옮김(판정 함수 그대로, 가짜 인증만 mockApp으로)
const WIDTHS = [1280, 390];
const SCALE = [6, 12, 16];

// 브라우저 안에서 도는 검사. 실패 문구 배열을 돌려준다
function collectGapProblems(scale) {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const label = (el) =>
    el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(/\s+/)[0] + ' ' + (el.textContent || '').trim().slice(0, 12);
  const stacked = (el) => {
    const s = getComputedStyle(el);
    if (s.display.startsWith('inline') || s.display === 'none' || s.position === 'absolute') return false;
    const r = R(el);
    return r.width > 0 && r.height > 0;
  };

  for (const box of document.querySelectorAll('main section, main section *')) {
    if (!stacked(box) || /^(UL|OL|LABEL|SUMMARY|P|B|SPAN|BUTTON|A)$/.test(box.tagName)) continue;
    const kids = [...box.children].filter(stacked);
    if (kids.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < kids.length; i++) {
      const prev = R(kids[i - 1]);
      const cur = R(kids[i]);
      if (cur.top < prev.bottom - 1) continue; // 같은 줄(가로 배치)은 대상 아님
      gaps.push(Math.round(cur.top - prev.bottom));
    }
    if (gaps.length === 0) continue;
    const bad = gaps.filter((g) => !scale.includes(g));
    if (bad.length) out.push(`${label(box)} 간격 ${gaps.join('/')} (스케일 밖 ${bad.join(',')})`);
    else if (new Set(gaps).size > 1) out.push(`${label(box)} 간격 들쭉날쭉 ${gaps.join('/')}`);
  }

  // 버튼이 감싼 상자(패널·섹션)의 안쪽 여백을 넘지 않음
  for (const btn of document.querySelectorAll('main section button, main section a.pillBtn, main section a.ghostBtn')) {
    if (!stacked(btn)) continue;
    let box = btn.parentElement;
    while (box && parseFloat(getComputedStyle(box).paddingRight) === 0) box = box.parentElement;
    if (!box) continue;
    const inner = R(box).right - parseFloat(getComputedStyle(box).paddingRight);
    if (R(btn).right > inner + 0.5) out.push(`${label(btn)} 상자 안쪽 여백 밖으로 ${Math.round(R(btn).right - inner)}px`);
  }
  return out;
}

// 버튼·필 글자가 한 줄인지(FT-4). 390 안쪽 폭(약 270px)에서 긴 문구가 두 줄 필이 되는 것을 손으로 재지 않게 한다.
// 판정: 지금 높이 > 줄바꿈을 막았을 때 높이 + 1px 이면 두 줄. 글자 크기·패딩·이모지와 상관없이 같은 식으로 잰다
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

for (const state of ['guest', 'user', 'userPro', 'userGrace', 'userOwner']) {
  for (const width of [390, 768, 1280]) {
    test(`FT settings ${state} ${width}px 버튼·필 글자 한 줄(고급 설정 펼침 포함)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApp(page, SETTINGS_STATES[state]);
      await page.goto('/settings.html', { waitUntil: 'load' });
      test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
      await settingsReady(page, state);
      await page.evaluate(() => document.fonts.ready);
      // 접힌 details(고급 설정·계정 삭제 등)를 모두 펼쳐 안쪽 버튼도 잰다
      await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => (d.open = true)));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await page.evaluate(collectWrappedPills)).toEqual([]);
    });
  }
}

for (const width of WIDTHS) {
  test(`FT settings user ${width}px 본문 간격 스케일·일정함(고급 설정 펼침 포함)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, STATES.user);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await expect(page.locator('#accEmail')).toHaveText('a@example.com');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const problems = await page.evaluate(collectGapProblems, SCALE);
    expect(problems).toEqual([]);
    // 노션 연동은 고급 설정 접힘 안(계획/앱_명세.md §5) — 기본 접힘, 펼쳐도 간격 규칙 같음
    await expect(page.locator('#advNotion')).not.toHaveAttribute('open', '');
    await expect(page.locator('#ntnToken')).toBeHidden();
    await page.locator('#advNotion > summary').click();
    await expect(page.locator('#ntnToken')).toBeVisible();
    expect(await page.evaluate(collectGapProblems, SCALE)).toEqual([]);
  });
}

// M2-4a: 운영 섹션(펼침·크리에이터 폼)도 설정 간격 스케일 6·12·16
for (const width of WIDTHS) {
  test(`FT settings userOwner ${width}px 운영 섹션 간격 스케일·일정함`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, USER_OWNER);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await settingsReady(page, 'userOwner');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(collectGapProblems, SCALE)).toEqual([]);
  });
}
