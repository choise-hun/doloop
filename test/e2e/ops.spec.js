// M2-4a 운영 섹션(owner 전용): 비 owner 미노출·/admin 요청 0건, owner인데 /admin 403이면 안내 한 줄, 크리에이터 검색·저장 요청 본문
// 근거: 개발산출물/진행_운영화면.md §2·§3, 결과/M1-2a_티어쿼터관리API.md(PUT /admin/users/{id}/creator)
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

const TARGET = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'creator@example.com',
  displayName: 'Creator Kim',
  role: 'user',
  tier: 'pro',
  billingTier: 'pro',
  tierOverride: null,
  tierOverrideUntil: null,
  credits: { monthly: 10, purchased: 0 },
  isCreator: false,
  creatorBadge: null,
  creatorBio: '',
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

const isAdmin = (url) => url.pathname.startsWith('/api/v1/admin/');

async function open(page, opts) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, opts);
  await page.goto('/settings.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');
}

test('M2-4a 비 owner: 운영 섹션 없음 + /admin 요청 0건', async ({ page }) => {
  const adminCalls = [];
  page.on('request', (req) => {
    if (isAdmin(new URL(req.url()))) adminCalls.push(req.url());
  });
  await open(page, STATES.user);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#ops')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('owner 전용');
  expect(adminCalls).toEqual([]);
});

test('M2-4a owner: 펼치기 전에는 /admin 요청 없음, 접힌 채로 보인다', async ({ page }) => {
  const adminCalls = [];
  page.on('request', (req) => {
    if (isAdmin(new URL(req.url()))) adminCalls.push(req.url());
  });
  await open(page, { ...STATES.user, me: { role: 'owner' } });
  await expect(page.locator('#hOps')).toHaveText('운영 (owner 전용)');
  await expect(page.locator('#opsDetails')).not.toHaveAttribute('open', '');
  await expect(page.locator('#opsEmail')).toBeHidden();
  expect(adminCalls).toEqual([]);
});

test('M2-4a owner인데 /admin 403: 안내 한 줄만 보이고 폼을 숨긴다', async ({ page }) => {
  await open(page, {
    ...STATES.user,
    me: { role: 'owner' },
    routes: [[isAdmin, (route) => json(route, { error: 'FORBIDDEN', message: '권한이 없습니다.' }, 403)]],
  });
  await page.locator('#hOps').click();
  await page.locator('#opsEmail').fill('creator@example.com');
  await page.locator('#opsSearch').click();
  await expect(page.locator('#opsForbidden')).toHaveText('owner 권한이 없어요. 계정 역할이 바뀌었으면 다시 로그인해 주세요.');
  await expect(page.locator('#opsCreator')).toHaveCount(0);
  await expect(page.locator('#opsEmail')).toHaveCount(0);
});

test('M2-4a 크리에이터: 이메일 검색 → 지정 저장 요청 본문, 사유가 비면 저장 불가, 없는 이메일 안내', async ({ page }) => {
  const puts = [];
  const gets = [];
  await open(page, {
    ...STATES.user,
    me: { role: 'owner' },
    routes: [
      [
        (url) => url.pathname === '/api/v1/admin/users',
        (route) => {
          const email = new URL(route.request().url()).searchParams.get('email');
          gets.push(email);
          return json(route, { users: email === TARGET.email ? [TARGET] : [] });
        },
      ],
      [
        (url) => url.pathname === `/api/v1/admin/users/${TARGET.id}/creator`,
        (route) => {
          const body = route.request().postDataJSON();
          puts.push({ method: route.request().method(), body });
          return json(route, { ...TARGET, isCreator: body.isCreator, creatorBadge: body.creatorBadge, creatorBio: body.creatorBio });
        },
      ],
    ],
  });
  await page.locator('#hOps').click();

  // 없는 이메일
  await page.locator('#opsEmail').fill('  nobody@example.com ');
  await page.locator('#opsSearch').click();
  await expect(page.locator('#opsNoUser')).toHaveText('그 이메일로 가입한 계정이 없어요.');
  await expect(page.locator('#opsCreatorForm')).toHaveCount(0);

  // 찾기 → 지정
  await page.locator('#opsEmail').fill('creator@example.com');
  await page.locator('#opsEmail').press('Enter');
  await expect(page.locator('#opsUserInfo')).toContainText('Creator Kim');
  await expect(page.locator('#opsUserInfo')).toContainText('creator@example.com');
  await expect(page.locator('#opsUserInfo')).toContainText('일반');
  expect(gets).toEqual(['nobody@example.com', 'creator@example.com']);

  await expect(page.locator('#opsReason')).toHaveValue('크리에이터 지정');
  await page.locator('#opsIsCreator').check();
  await page.locator('#opsBadge').fill('  재즈 기타 ');
  await page.locator('#opsBio').fill('재즈 스탠더드 커버');

  // 사유를 지우면 저장 버튼이 꺼진다
  await page.locator('#opsReason').fill('  ');
  await expect(page.locator('#opsCreatorSave')).toBeDisabled();
  await page.locator('#opsReason').fill('첫 크리에이터 지정');
  await expect(page.locator('#opsCreatorSave')).toBeEnabled();
  await page.locator('#opsCreatorSave').click();

  await expect(page.locator('#opsMsg')).toHaveText('✓ 저장했어요');
  await expect(page.locator('#opsUserInfo')).toContainText('크리에이터 · 재즈 기타');
  expect(puts).toEqual([
    { method: 'PUT', body: { isCreator: true, creatorBadge: '재즈 기타', creatorBio: '재즈 스탠더드 커버', reason: '첫 크리에이터 지정' } },
  ]);

  // 배지를 비우면 null(지움)로 보낸다
  await page.locator('#opsBadge').fill('');
  await page.locator('#opsCreatorSave').click();
  await expect(page.locator('#opsUserInfo')).not.toContainText('재즈 기타');
  expect(puts[1].body.creatorBadge).toBeNull();
});

test('M2-4a 크리에이터: 서버 400은 서버 문장을 그대로 보인다', async ({ page }) => {
  await open(page, {
    ...STATES.user,
    me: { role: 'owner' },
    routes: [
      [(url) => url.pathname === '/api/v1/admin/users', (route) => json(route, { users: [TARGET] })],
      [
        (url) => url.pathname.endsWith('/creator'),
        (route) => json(route, { error: 'INVALID_INPUT', message: 'creatorBadge는 1~20자여야 합니다.' }, 400),
      ],
    ],
  });
  await page.locator('#hOps').click();
  await page.locator('#opsEmail').fill(TARGET.email);
  await page.locator('#opsSearch').click();
  await page.locator('#opsCreatorSave').click();
  await expect(page.locator('#opsMsg')).toHaveText('creatorBadge는 1~20자여야 합니다.');
  await expect(page.locator('#opsCreatorForm')).toBeVisible();
});
