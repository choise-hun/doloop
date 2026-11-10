// 설정 화면 정렬 검사 (FT-2): 공통 검사 G0~G8 + 옛 settings-spacing.spec.js 간격 검사(본문 섹션 세로 간격 6·12·16, 상자마다 일정)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, DEFAULT_ME } = require('../support/mock-app');
const { COMMUNITY_FREE_ME, COMMUNITY_PRO_ME, communityRoutes } = require('../support/community-fixtures');

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
const USER_EXPIRED = {
  ...STATES.user, me: { tier: 'free', billingTier: 'free', credits: { monthly: 0, purchased: 0 } },
  routes: [[url => url.pathname === '/api/v1/credits', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ monthly: 0, purchased: 0, total: 0, monthlyGrant: 0, nextGrantAt: null, monthlyExpiresAt: '2026-10-31T15:00:00Z' }),
  })]],
};
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
// M2-4b: owner + 운영자 폴더 2개(이달의 곡 5곡·공개, 큐레이션 초안), 긴 제목 — 이달의 곡을 골라 편집 화면까지
const LONG = 'Neo-Soul Practice Session With A Very Long Title That Should Never Break The Card Layout';
const OPS_FOLDER = (over) => ({
  ownerId: null, isPublic: false, autoSync: false, hidden: false, hiddenAt: null, hiddenReason: null,
  descriptionI18n: {}, month: null, sortOrder: 0, likeCount: 0, cloneCount: 0, publishedAt: null, createdAt: '2026-11-06T00:00:00Z',
  ...over,
});
const OWNER_FOLDERS_ROUTE = [
  (url) => url.pathname === '/api/v1/admin/shared-folders',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        folders: [
          {
            folder: OPS_FOLDER({
              id: '00000000-0000-4000-8000-000000000301', kind: 'monthly_pick', month: '2026-12', isPublic: true, publishedAt: '2026-11-01T00:00:00Z',
              title: '12월의 곡 · ' + LONG, titleI18n: { ko: '12월의 곡 · ' + LONG, en: 'Picks of December' },
              descriptionI18n: { ko: '연말 분위기의 네오소울 곡 다섯 개. 구간을 반복하며 리듬 기타 보이싱을 익혀요.' }, itemCount: 5,
            }),
            items: [1, 2, 3, 4, 5].map((n, i) => ({
              videoId: 'abcdefghij' + n, position: i, title: `${n} · ${LONG}`, artist: 'Channel With A Long Name', a: 12, b: 48, rate: 0.75,
              noteI18n: { ko: '인트로 리프를 0.75배로 반복해요.' },
            })),
          },
          {
            folder: OPS_FOLDER({ id: '00000000-0000-4000-8000-000000000302', kind: 'curated', title: '재즈 입문 · ' + LONG, titleI18n: { ko: '재즈 입문 · ' + LONG }, sortOrder: 1, itemCount: 0 }),
            items: [],
          },
        ],
      }),
    }),
];
const USER_OWNER_DATA = { ...STATES.user, me: { role: 'owner' }, routes: [OWNER_FOLDERS_ROUTE] };
const COMMUNITY_FREE = { ...STATES.user, me: COMMUNITY_FREE_ME, routes: communityRoutes() };
const COMMUNITY_PRO = { ...STATES.user, me: COMMUNITY_PRO_ME, routes: [CREDITS_ROUTE, ...communityRoutes()] };
const SETTINGS_STATES = {
  guest: STATES.guest,
  user: STATES.user,
  userPro: USER_PRO,
  userGrace: USER_GRACE,
  userOwner: USER_OWNER,
  userOwnerData: USER_OWNER_DATA,
  communityFree: COMMUNITY_FREE,
  communityPro: COMMUNITY_PRO,
};

async function settingsReady(page, state) {
  if (state === 'guest') await page.locator('#accGuest').waitFor({ state: 'attached' });
  else await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  if (state === 'userPro' || state === 'communityPro') await expect(page.locator('#creditNext')).toContainText('170');
  if (state === 'userGrace') await expect(page.locator('#creditExpire')).toContainText('무료');
  if (state === 'communityFree' || state === 'communityPro') {
    await page.locator('#community').waitFor();
  }
  if (state === 'userOwner') {
    await page.locator('#hOps').click();
    await page.locator('#opsEmail').fill('creator.with.a.very.long.address@example.com');
    await page.locator('#opsSearch').click();
    await page.locator('#opsCreatorForm').waitFor();
  }
  if (state === 'userOwnerData') {
    await page.locator('#hOps').click();
    await page.locator('.opsFolderRow .opsFolderPick').first().click();
    await expect(page.locator('.opsItem')).toHaveCount(5);
  }
}

async function openServiceGroups(page) {
  for (const detail of await page.locator('[data-setting-disclosure]').all()) {
    if (!await detail.evaluate(node => node.open)) await detail.locator(':scope > summary').click();
    await expect(detail).toHaveAttribute('open', '');
  }
}

test('ST3-01 groups and native disclosure', async ({ browser }) => {
  for (const [role, state] of [['guest', STATES.guest], ['user', STATES.user], ['paid', USER_PRO], ['expired', USER_EXPIRED], ['owner', USER_OWNER]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    try {
      await mockApp(page, state);
      const mutations = [], admin = [];
      page.on('request', request => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) mutations.push(request.url());
        if (request.url().includes('/api/v1/admin/')) admin.push(request.url());
      });
      await page.goto('/settings.html');
      await settingsReady(page, role === 'guest' ? 'guest' : 'user');
      const groups = ['account', 'credits', ...(role === 'guest' ? [] : ['community']), 'appearanceLanguage', 'advancedData', ...(role === 'owner' ? ['operations'] : [])];
      expect(await page.locator('[data-setting-disclosure]').evaluateAll(nodes => nodes.map(node => node.dataset.settingDisclosure))).toEqual(groups);
      await expect(page.locator('[data-setting-disclosure][open]')).toHaveCount(0);
      const keys = ['account', 'credits', ...(role === 'guest' ? [] : ['community']), 'screen', 'language', 'backup', 'advanced', ...(role === 'owner' ? ['opsHost'] : [])];
      expect(await page.locator('[data-setting-render-key]').evaluateAll(nodes => nodes.map(node => node.dataset.settingRenderKey))).toEqual(keys);
      for (const key of keys) {
        const contract = ST1_RENDERED.find(item => item.renderKey === key);
        await expect(page.locator(`#${contract.targetId}`)).toBeAttached();
        // Full conditional ID coverage remains in ST1; baseline controls must stay mounted.
        if (['screen', 'language', 'backup', 'advanced'].includes(key)) {
          for (const id of contract.descendantIds) await expect(page.locator(`#${contract.targetId} #${id}`)).toBeAttached();
        }
      }
      const url = page.url();
      for (const group of ['appearanceLanguage', 'advancedData']) {
        const detail = page.locator(`[data-setting-disclosure="${group}"]`);
        const summary = detail.locator(':scope > summary'), body = detail.locator(':scope > div');
        await expect(summary).toHaveCount(1);
        await expect(body).toBeAttached();
        await expect(body).toBeHidden();
        await summary.focus();
        await page.keyboard.press('Tab');
        expect(await body.evaluate(node => node.contains(document.activeElement))).toBe(false);
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(body).toBeVisible();
        expect(await detail.evaluate(node => {
          const summary = node.firstElementChild.getBoundingClientRect(), body = node.lastElementChild.getBoundingClientRect();
          return { left: body.left - summary.left, right: body.right - summary.right, gap: body.top - summary.bottom, touch: summary.height >= 44 };
        })).toEqual({ left: 0, right: 0, gap: 16, touch: true });
        await page.keyboard.press('Space');
        await expect(body).toBeHidden();
        await summary.click();
        await expect(body).toBeVisible();
        await summary.focus();
        await page.keyboard.press('Tab');
        expect(await body.evaluate(node => node.contains(document.activeElement))).toBe(true);
      }
      await expect(page.locator('[data-setting-disclosure][open]')).toHaveCount(2);
      expect(await page.locator('#advNotion').evaluate(node => node.tagName)).toBe('DIV');
      expect(await page.locator('#hAdvanced').evaluate(node => node.tagName)).toBe('H2');
      await expect(page.locator('[data-setting-disclosure="advancedData"] details')).toHaveCount(0);
      await expect(page.locator('#ops')).toHaveCount(role === 'owner' ? 1 : 0);
      expect(page.url()).toBe(url);
      expect(mutations).toEqual([]);
      expect(admin).toEqual([]);
    } finally { await context.close(); }
  }
});

test('ST3-02 hashes and identities: outer groups and stale hash', async ({ page }) => {
  await mockApp(page, STATES.user);
  await page.goto('/settings.html#advNotion');
  await expect(page.locator('#advNotion')).toBeFocused();
  const appearance = page.locator('[data-setting-disclosure="appearanceLanguage"]');
  const advanced = page.locator('[data-setting-disclosure="advancedData"]');
  await expect(advanced).toHaveAttribute('open', '');
  await expect(appearance).not.toHaveAttribute('open', '');
  for (const hash of ['screen', 'hScreen', 'langSec', 'langSelect', 'nx', 'hNx', 'advanced', 'hAdvanced']) {
    await page.evaluate(hash => { location.hash = hash; }, hash);
    await expect(page.locator(`#${hash}`)).toBeFocused();
    await expect(page.locator(`#${hash}`)).toBeVisible();
  }
  await page.goBack();
  await expect(page.locator('#advanced')).toBeFocused();
  await page.goForward();
  await expect(page.locator('#hAdvanced')).toBeFocused();
  await advanced.locator(':scope > summary').click();
  await page.locator('#settingsGroups a[href="#nx"]').click();
  await expect(page.locator('#nx')).toBeFocused();
  await advanced.locator(':scope > summary').click();
  await page.locator('#settingsGroups a[href="#nx"]').click();
  await expect(page.locator('#nx')).toBeFocused();
  await advanced.locator(':scope > summary').click();
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me');
  await page.evaluate(() => window.ULAuth.fetchMe());
  await refreshed;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(advanced).not.toHaveAttribute('open', '');
  await page.evaluate(() => {
    window.__st3OldFocus = 0;
    window.__st3Focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) {
      if (this.id === 'advanced') window.__st3OldFocus++;
      return window.__st3Focus.apply(this, args);
    };
    location.hash = 'advanced';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    location.hash = 'screen';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(page.locator('#screen')).toBeFocused();
  expect(await page.evaluate(() => window.__st3OldFocus)).toBe(0);
  await page.evaluate(() => { HTMLElement.prototype.focus = window.__st3Focus; });
  // Opening is synchronous; a subsequent destination preserves already opened groups.
  await expect(advanced).toHaveAttribute('open', '');
  await page.locator('#account > details > summary').click();
  await page.locator('#btnLogout').click();
  await expect(page.locator('#accGuest')).toBeAttached();
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(appearance).toHaveAttribute('open', '');
  await expect(page.locator('#screen')).toBeFocused();
  await expect(page.locator('#community, #ops')).toHaveCount(0);
});

test('ST2-01-03 native disclosure, canonical hashes and mounted input', async ({ browser }) => {
  for (const [role, state] of [['guest', STATES.guest], ['user', STATES.user], ['owner', USER_OWNER]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    try {
      await mockApp(page, state);
      const mutations = [], reads = [];
      page.on('request', request => {
        if (['POST', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url());
        if (request.url().includes('/api/v1/')) reads.push(request.url());
      });
      await page.goto('/settings.html');
      await settingsReady(page, role === 'guest' ? 'guest' : 'user');
      const ids = role === 'guest' ? ['account', 'credits'] : ['account', 'credits', 'community'];
      await expect(page.locator('#account > details, #credits > details, #community > details')).toHaveCount(ids.length);
      const url = page.url();
      for (const id of ids) {
        const detail = page.locator(`#${id} > details[data-setting-disclosure="${id}"]`);
        await expect(detail).not.toHaveAttribute('open', '');
        await expect(detail.locator(':scope > div')).toBeAttached();
        await expect(detail.locator(':scope > div')).toBeHidden();
        const summary = detail.locator(':scope > summary');
        await summary.focus();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(id => document.activeElement.closest(`#${id} details > div`) !== null, id)).toBe(false);
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(detail.locator(':scope > div')).toBeVisible();
        await page.keyboard.press('Space');
        await expect(detail).not.toHaveAttribute('open', '');
        await summary.click();
        await expect(detail).toHaveAttribute('open', '');
        expect(await detail.evaluate(node => {
          const summary = node.firstElementChild.getBoundingClientRect();
          const body = node.lastElementChild.getBoundingClientRect();
          return { left: body.left - summary.left, right: body.right - summary.right, gap: body.top - summary.bottom, touch: summary.height >= 44 };
        })).toEqual({ left: 0, right: 0, gap: 16, touch: true });
      }
      expect(page.url()).toBe(url);
      await expect(page.locator('#account > details[open], #credits > details[open], #community > details[open]')).toHaveCount(ids.length);
      if (role === 'guest') await expect(page.locator('#community')).toHaveCount(0);
      else {
        const inner = page.locator('#accUser details');
        await inner.locator(':scope > summary').click();
        await page.locator('#delConfirm').fill('keep this draft');
        const input = await page.locator('#delConfirm').elementHandle();
        const before = reads.length;
        await page.locator('#account > details > summary').click();
        await expect(page.locator('#delConfirm')).toBeHidden();
        await page.locator('#account > details > summary').click();
        await expect(page.locator('#delConfirm')).toHaveValue('keep this draft');
        await expect(inner).toHaveAttribute('open', '');
        expect(await input.evaluate(node => node === document.getElementById('delConfirm'))).toBe(true);
        expect(reads.length).toBe(before);
        await inner.locator(':scope > summary').click();
        await page.locator('#account > details > summary').click();
        await page.evaluate(() => { location.hash = 'delConfirm'; });
        await expect(page.locator('#delConfirm')).toBeFocused();
        await expect(inner).toHaveAttribute('open', '');
        await page.evaluate(() => { location.hash = 'commPracticeLog'; });
        await expect(page.locator('#hCommunity')).toBeFocused();
        await expect(page.locator('#hCommunity')).toBeInViewport();
      }
      for (const id of ids) {
        await page.locator(`#${id} > details[open] > summary`).click();
        await page.locator(`#settingsGroups a[href="#${id}"]`).click();
        await expect(page.locator(`#${id}`)).toBeFocused();
        await expect(page.locator(`#${id} > details`)).toHaveAttribute('open', '');
        await expect(page.locator(`#${id} h2`)).toBeInViewport();
        await page.locator(`#${id} > details > summary`).click();
        await page.locator(`#settingsGroups a[href="#${id}"]`).click();
        await expect(page.locator(`#${id} h2`)).toBeVisible();
      }
      expect(mutations).toEqual([]);
      await page.goto('/settings.html#account');
      await expect(page.locator('#account')).toBeFocused();
      await expect(page.locator('#hAccount')).toBeVisible();
    } finally { await context.close(); }
  }
});

test('ST2-04-06 pending save, rollback, identity and delayed credit navigation', async ({ page }) => {
  let releaseSave, releaseCredits;
  let saved = { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, shareAutosync: false };
  const patches = [];
  const creditGate = new Promise(resolve => { releaseCredits = resolve; });
  await mockApp(page, { ...COMMUNITY_PRO, routes: [
    [url => url.pathname === '/api/v1/credits', async route => {
      await creditGate;
      await CREDITS_ROUTE[1](route);
    }],
    [url => url.pathname === '/api/v1/me', async route => {
      if (route.request().method() === 'PATCH') {
        patches.push(route.request().postDataJSON());
        const status = await new Promise(resolve => { releaseSave = resolve; });
        if (status !== 200) return route.fulfill({ status, json: { code: 'INTERNAL_ERROR' } });
        saved = { ...saved, ...patches.at(-1) };
      }
      await route.fulfill({ json: saved });
    }],
  ] });
  await page.goto('/settings.html#account');
  await expect(page.locator('#account')).toBeFocused();
  const community = page.locator('#community > details');
  const summary = community.locator(':scope > summary');
  await summary.click();
  const toggle = page.locator('#commAutosync');
  for (const status of [200, 500]) {
    await toggle.click();
    await expect.poll(() => patches.length).toBe(status === 200 ? 1 : 2);
    await expect(toggle).toHaveAttribute('aria-checked', String(status === 200));
    await toggle.click(); // Existing commBusyRef rejects duplicate saves; it does not disable the button.
    await summary.click();
    await summary.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(status === 200));
    await summary.click();
    const response = page.waitForResponse(response => response.url().endsWith('/api/v1/me') && response.request().method() === 'PATCH');
    releaseSave(status);
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(toggle).toBeEnabled();
    await expect(community).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
    await summary.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    if (status === 500) await expect(page.locator('#commErrMsg')).toHaveText('요청을 처리하지 못했어요');
  }
  expect(patches).toEqual([{ shareAutosync: true }, { shareAutosync: false }]);
  await page.locator('#account > details > summary').click();
  await page.evaluate(() => window.ULAuth.fetchMe());
  await expect(page.locator('#account > details')).not.toHaveAttribute('open', '');
  await expect(community).toHaveAttribute('open', '');
  await page.evaluate(() => { location.hash = 'creditNext'; });
  await expect(page.locator('#creditNext')).toHaveCount(0);
  await page.evaluate(() => { location.hash = 'screen'; });
  await expect(page.locator('#screen')).toBeFocused();
  releaseCredits();
  await expect(page.locator('#creditNext')).toContainText('170');
  await expect(page.locator('#credits > details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#screen')).toBeFocused();
  await page.evaluate(() => { location.hash = 'creditNext'; });
  await expect(page.locator('#creditNext')).toBeFocused();
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');
  saved = { ...saved, id: '00000000-0000-4000-8000-000000000099', email: 'b@example.com' };
  await page.evaluate(id => {
    location.hash = 'screen';
    const session = { access_token: 'b-token', user: { id, email: 'b@example.com' } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session } });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, saved.id);
  await expect(page.locator('#accEmail')).toHaveText('b@example.com');
  await expect(page.locator('#credits > details')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-setting-disclosure="appearanceLanguage"]')).toHaveAttribute('open', '');
  await expect(page.locator('#screen')).toBeFocused();
});

test('ST2-02 canonical initial, history, h2 and active aliases', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);
  await page.goto('/settings.html#credits');
  await settingsReady(page, 'communityPro');
  await expect(page.locator('#credits')).toBeFocused();
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');
  await expect(page.locator('#account > details')).not.toHaveAttribute('open', '');

  await page.goto('/settings.html#community');
  await settingsReady(page, 'communityPro');
  await expect(page.locator('#community')).toBeFocused();
  await expect(page.locator('#community > details')).toHaveAttribute('open', '');

  await page.evaluate(() => { location.hash = 'hAccount'; });
  await expect(page.locator('#hAccount')).toBeFocused();
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');

  await page.evaluate(() => { location.hash = 'hCredits'; });
  await expect(page.locator('#hCredits')).toBeFocused();
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.evaluate(() => { location.hash = 'btnLogout'; });
  await expect(page.locator('#btnLogout')).toBeFocused();
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');

  await page.locator('#account > details > summary').click();
  if (!await page.locator('#credits > details').evaluate(node => node.open)) {
    await page.locator('#credits > details > summary').click();
  }
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.evaluate(() => { location.hash = 'community'; });
  await expect(page.locator('#community')).toBeFocused();
  await expect(page.locator('#community > details')).toHaveAttribute('open', '');
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.goBack();
  await expect(page.locator('#btnLogout')).toBeFocused();
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.goForward();
  await expect(page.locator('#community')).toBeFocused();
  await expect(page.locator('#community > details')).toHaveAttribute('open', '');
});

test('ST2-04 error codes 403, 409, serialization and retry', async ({ page }) => {
  const patches = [];
  let releaseFirstPatch;
  const firstPatchGate = new Promise(resolve => { releaseFirstPatch = resolve; });
  let patchCounter = 0;

  await mockApp(page, {
    ...COMMUNITY_PRO,
    routes: [
      CREDITS_ROUTE,
      ...communityRoutes(),
      [
        url => url.pathname === '/api/v1/me',
        async route => {
          if (route.request().method() === 'PATCH') {
            patchCounter++;
            const body = route.request().postDataJSON();
            patches.push(body);
            if (patchCounter === 1) {
              return route.fulfill({ status: 403, json: { code: 'TIER_UPGRADE_REQUIRED' } });
            }
            if (patchCounter === 2) {
              return route.fulfill({ status: 409, json: { code: 'PUBLIC_NAME_REQUIRED' } });
            }
            if (patchCounter === 3) {
              await firstPatchGate;
              return route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, shareAutosync: false } });
            }
            if (patchCounter === 4) {
              return route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, shareAutosync: false, sharePracticeLog: false } });
            }
            return route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, shareAutosync: true } });
          }
          return route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME } });
        },
      ],
    ],
  });

  await page.goto('/settings.html#community');
  await settingsReady(page, 'communityPro');
  const community = page.locator('#community > details');
  const summary = community.locator(':scope > summary');

  const toggleSync = page.locator('#commAutosync');
  await toggleSync.click();
  await summary.click();
  await expect(toggleSync).toBeHidden();
  await summary.click();
  await expect(toggleSync).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#commErrMsg')).toHaveText('Pro로 업그레이드하면 쓸 수 있어요');

  const toggleLog = page.locator('#commPracticeLog');
  await toggleLog.click();
  await summary.click();
  await expect(toggleLog).toBeHidden();
  await summary.click();
  await expect(toggleLog).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#commErrMsg')).toHaveText('커뮤니티 이름을 먼저 정해 주세요');

  await toggleSync.click();
  await expect.poll(() => patches.length).toBe(3);
  await toggleLog.click();
  expect(patches.length).toBe(3);
  releaseFirstPatch();
  await expect.poll(() => patches.length).toBe(4);
  await expect(page.locator('#commErrMsg')).toHaveCount(0);
});

test('ST2-05 drive enable/disable delay and migration confirm cancel', async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  try {
    await mockApp(page1, STATES.user);
    await page1.goto('/settings.html#account');
    await settingsReady(page1, 'user');

    await page1.evaluate(() => {
      window.__driveCalls = [];
      window.ULDrive.enableDriveStorage = () => new Promise(resolve => {
        window.__resolveEnable = () => {
          window.__driveCalls.push('enable');
          resolve({ id: window.ULAuth.getUser().id });
        };
      });
    });

    const account = page1.locator('#account > details');
    const summary = account.locator(':scope > summary');

    await page1.locator('#btnDriveEnable').click();
    await expect(page1.locator('#btnDriveEnable')).toBeDisabled();
    await summary.click();
    await expect(page1.locator('#btnDriveEnable')).toBeHidden();
    await page1.evaluate(() => window.__resolveEnable());
    await summary.click();
    await expect(page1.locator('#driveStatusMsg')).toContainText('Google Drive 저장소로 전환되었어요');
    await expect(page1.locator('#btnDriveEnable')).toBeEnabled();
  } finally {
    await ctx1.close();
  }

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  try {
    await mockApp(page2, { ...STATES.user, me: { storageProvider: 'drive' } });
    await page2.goto('/settings.html#account');
    await settingsReady(page2, 'user');
    await page2.evaluate(() => {
      window.__driveCalls = [];
      window.ULDrive.disableDriveStorage = () => new Promise((_, reject) => {
        window.__rejectDisable = () => {
          window.__driveCalls.push('disable');
          reject(new Error('드라이브 해제 중 네트워크 오류'));
        };
      });
      window.ULDrive.migrateAllToDrive = (onProgress) => new Promise(resolve => {
        window.__driveCalls.push('migrate');
        onProgress({ current: 2, total: 5 });
        resolve({ migrated: 4, skipped: 1 });
      });
    });

    const account = page2.locator('#account > details');
    const summary = account.locator(':scope > summary');

    await page2.locator('#btnDriveDisable').click();
    await expect(page2.locator('#btnDriveDisable')).toBeDisabled();
    await summary.click();
    await page2.evaluate(() => window.__rejectDisable());
    await summary.click();
    await expect(page2.locator('#driveStatusMsg')).toHaveText('드라이브 해제 중 네트워크 오류');
    await expect(page2.locator('#btnDriveDisable')).toBeEnabled();

    let dialogAction = 'dismiss';
    page2.on('dialog', dialog => {
      if (dialogAction === 'dismiss') dialog.dismiss();
      else dialog.accept();
    });
    await page2.locator('#btnDriveMigrate').click();
    expect(await page2.evaluate(() => window.__driveCalls.includes('migrate'))).toBe(false);

    dialogAction = 'accept';
    await page2.locator('#btnDriveMigrate').click();
    await expect(page2.locator('#driveStatusMsg')).toContainText('이전 완료: 4개 성공, 1개 건너뜀');
    expect(await page2.evaluate(() => window.__driveCalls.includes('migrate'))).toBe(true);
  } finally {
    await ctx2.close();
  }
});

test('ST2-06-07 creditExpire pending, same uid refresh, roles, tiers and conditional IDs', async ({ page }) => {
  let releaseGraceCredits;
  const graceGate = new Promise(resolve => { releaseGraceCredits = resolve; });

  await mockApp(page, {
    ...USER_GRACE,
    routes: [
      [
        url => url.pathname === '/api/v1/credits',
        async route => {
          await graceGate;
          await GRACE_CREDITS_ROUTE[1](route);
        },
      ],
    ],
  });

  await page.goto('/settings.html#creditExpire');
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  await expect(page.locator('#creditExpire')).toHaveCount(0);
  await page.evaluate(() => { location.hash = 'screen'; });
  await expect(page.locator('#screen')).toBeFocused();
  releaseGraceCredits();
  await expect(page.locator('#creditExpire')).toContainText('12월 1일');
  await expect(page.locator('#credits > details')).not.toHaveAttribute('open', '');
  await expect(page.locator('#screen')).toBeFocused();

  await page.locator('#account > details > summary').click();
  await page.locator('#credits > details > summary').click();
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.locator('#langSelect button[data-lang="en"]').click();
  await expect(page.locator('#account > details > summary')).toHaveText(/Account/);
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.evaluate(() => window.ULAuth.fetchMe());
  await expect(page.locator('#account > details')).toHaveAttribute('open', '');
  await expect(page.locator('#credits > details')).toHaveAttribute('open', '');

  await page.locator('#langSelect button[data-lang="ko"]').click();
  await expect(page.locator('#account > details > summary')).toHaveText(/계정/);

  await page.locator('#btnLogout').click();
  await expect(page.locator('#accGuest')).toBeAttached();
  await expect(page.locator('#credits > details')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-setting-disclosure="appearanceLanguage"]')).toHaveAttribute('open', '');

  await expect(page.locator('#community')).toHaveCount(0);
  await expect(page.locator('#ops')).toHaveCount(0);
  await page.locator('#account > details > summary').click();
  await expect(page.locator('#accGuest')).toBeVisible();
  await expect(page.locator('#accUser')).toBeHidden();

  await mockApp(page, STATES.user);
  await page.goto('/settings.html');
  await settingsReady(page, 'user');
  await openServiceGroups(page);
  await expect(page.locator('#community')).toHaveCount(1);
  await expect(page.locator('#commAutosync')).toBeDisabled();
  await expect(page.locator('#commProNotice')).toBeVisible();
  await expect(page.locator('#creditTier')).toHaveText('무료');
  await expect(page.locator('#ops')).toHaveCount(0);
});

test('ST2-08 open disclosures across 4 widths, 3 languages and dark mode', async ({ page }) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const widths = [390, 768, 1150, 1280];
  const langs = ['ko', 'en', 'ja'];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, COMMUNITY_PRO);
    await page.goto('/settings.html');
    await settingsReady(page, 'communityPro');
    await openServiceGroups(page);
    await page.evaluate(() => document.fonts.ready);

    for (const id of ['account', 'credits', 'community', 'appearanceLanguage', 'advancedData']) {
      const detail = page.locator(`[data-setting-disclosure="${id}"]`);
      const layout = await detail.evaluate(node => {
        const summary = node.firstElementChild.getBoundingClientRect();
        const body = node.lastElementChild.getBoundingClientRect();
        return {
          left: Math.round(body.left - summary.left),
          right: Math.round(body.right - summary.right),
          gap: Math.round(body.top - summary.bottom),
          height: summary.height >= 44,
        };
      });
      expect(layout).toEqual({ left: 0, right: 0, gap: 16, height: true });
    }

    const inputs = await page.locator('main input:visible, main button:visible, main select:visible').count();
    expect(inputs).toBeGreaterThan(5);

    if (process.env.LAYOUT_SHOTS) {
      const dir = path.join(process.cwd(), 'test-results', 'layout-shots');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `settings-open-userPro-${width}.png`), fullPage: true });
    }
  }

  for (const lang of langs) {
    await page.setViewportSize({ width: 390, height: 900 });
    await mockApp(page, COMMUNITY_PRO);
    await page.goto('/settings.html');
    await settingsReady(page, 'communityPro');
    await openServiceGroups(page);
    await page.locator(`#langSelect button[data-lang="${lang}"]`).click();
    await page.evaluate(() => document.fonts.ready);
    for (const id of ['account', 'credits', 'community', 'appearanceLanguage', 'advancedData']) {
      const summary = page.locator(`[data-setting-disclosure="${id}"] > summary`);
      expect((await summary.textContent()).trim().length).toBeGreaterThan(0);
      expect(await summary.evaluate(el => el.getBoundingClientRect().height >= 44)).toBe(true);
    }
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await mockApp(page, COMMUNITY_PRO);
  await page.goto('/settings.html');
  await settingsReady(page, 'communityPro');
  await openServiceGroups(page);
  await page.locator('#screen [data-theme="dark"]').click();
  await page.evaluate(() => document.fonts.ready);
  if (process.env.LAYOUT_SHOTS) {
    const dir = path.join(process.cwd(), 'test-results', 'layout-shots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `settings-open-userPro-768-dark.png`), fullPage: true });
  }
});


layoutSuite({
  name: 'settings',
  path: '/settings.html',
  states: [
    'guest',
    'user',
    { name: 'userPro', mock: USER_PRO },
    { name: 'userGrace', mock: USER_GRACE },
    { name: 'userOwner', mock: USER_OWNER },
    { name: 'userOwnerData', mock: USER_OWNER_DATA },
    { name: 'communityFree', mock: COMMUNITY_FREE },
    { name: 'communityPro', mock: COMMUNITY_PRO },
  ],
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
    await openServiceGroups(page);
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

for (const state of ['guest', 'user', 'userPro', 'userGrace', 'userOwner', 'userOwnerData', 'communityFree', 'communityPro']) {
  for (const width of [390, 768, 1280]) {
    test(`FT settings ${state} ${width}px 버튼·필 글자 한 줄(고급 설정 펼침 포함)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApp(page, SETTINGS_STATES[state]);
      await page.goto('/settings.html', { waitUntil: 'load' });
      test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
      await settingsReady(page, state);
      await openServiceGroups(page);
      await page.evaluate(() => document.fonts.ready);
      // 접힌 details(고급 설정·계정 삭제 등)를 모두 펼쳐 안쪽 버튼도 잰다
      for (const detail of await page.locator('main details:visible').all()) {
        if (!await detail.evaluate(node => node.open)) await detail.locator(':scope > summary').click();
      }
      if (state !== 'guest') await expect(page.locator('#btnDeleteAcc')).toBeVisible();
      await expect(page.locator('#btnLogin:visible, #btnLogout:visible')).toHaveCount(1);
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
    await openServiceGroups(page);
    await expect(page.locator('#btnLogout')).toBeVisible();
    await expect(page.locator('#commAutosync')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const problems = await page.evaluate(collectGapProblems, SCALE);
    expect(problems).toEqual([]);
    // 노션 연동은 고급 설정 접힘 안(계획/앱_명세.md §5) — 기본 접힘, 펼쳐도 간격 규칙 같음
    await page.locator('[data-setting-disclosure="advancedData"] > summary').click();
    await expect(page.locator('[data-setting-disclosure="advancedData"]')).not.toHaveAttribute('open', '');
    await expect(page.locator('#ntnToken')).toBeHidden();
    await page.locator('[data-setting-disclosure="advancedData"] > summary').click();
    await expect(page.locator('#ntnToken')).toBeVisible();
    expect(await page.evaluate(collectGapProblems, SCALE)).toEqual([]);
  });
}

// M2-4a·M2-4b·M2-23: 운영·커뮤니티 섹션도 설정 간격 스케일 6·12·16
for (const [state, width] of ['userOwner', 'userOwnerData', 'communityFree', 'communityPro'].flatMap((st) => WIDTHS.map((w) => [st, w]))) {
  test(`FT settings ${state} ${width}px 운영 섹션 간격 스케일·일정함`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, SETTINGS_STATES[state]);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await settingsReady(page, state);
    await openServiceGroups(page);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(collectGapProblems, SCALE)).toEqual([]);
  });
}

// Snapshot of the existing JSX contract, independent of SETTINGS_GROUPS.
// Conditional descendants are checked when present; full branch coverage is part of ST1-07/09.
const ST1_RENDERED = [
  { renderKey: 'account', targetId: 'account', availability: 'always', kind: 'fixed',
    descendantIds: ["hAccount", "accDesc", "accGuest", "btnLogin", "btnLoginBlank", "accUser", "accEmail", "accName", "accQuota", "quotaText", "quotaBar", "driveStoragePanel", "driveProviderText", "driveStatusMsg", "driveConflictNotice", "btnDriveEnable", "btnDriveDisable", "btnDriveMigrate", "btnLogout", "delConfirm", "btnDeleteAcc", "accMsg"] },
  { renderKey: 'backup', targetId: 'nx', availability: 'always', kind: 'fixed',
    descendantIds: ["hNx", "chkExportAudio", "btnExportZip", "nxMsg"] },
  { renderKey: 'credits', targetId: 'credits', availability: 'always', kind: 'fixed',
    descendantIds: ["hCredits", "creditTier", "creditMsg", "creditTotal", "creditBuckets", "creditNext", "creditExpire"] },
  { renderKey: 'community', targetId: 'community', availability: 'signedIn', kind: 'fixed',
    descendantIds: ["hCommunity", "settingsProfileLink", "commAutosync", "commPracticeLog", "commProNotice", "commNameRequiredNotice", "commErrMsg"] },
  { renderKey: 'screen', targetId: 'screen', availability: 'always', kind: 'fixed',
    descendantIds: ["hScreen"] },
  { renderKey: 'language', targetId: 'langSec', availability: 'always', kind: 'fixed',
    descendantIds: ["hLang", "langDesc", "langSelect"] },
  { renderKey: 'advanced', targetId: 'advanced', availability: 'always', kind: 'fixed',
    descendantIds: ["advNotion", "hAdvanced", "btnNotionTemplate", "notion", "notionKeyStatus", "ntnGuide", "ntnToken", "ntnSongsDb", "ntnSessionsDb", "ntnNotesDb", "btnSaveNotionKey", "btnCheckNotionKey", "btnDelNotionKey", "ntnKeyMsg", "notionSyncPanel", "syncStatusText", "syncErrorText", "btnSyncEnable", "btnSyncDisable", "btnSyncPull", "btnSyncPush", "syncMsg", "inpImportZip", "btnPreviewZip", "nxPreviewBox", "nxPreviewSummary", "nxPreviewList", "btnConfirmZip", "btnCancelZip", "links", "hLinks", "nlPractice", "nlNotes", "nlSave", "nlMsg"] },
  { renderKey: 'opsHost', targetId: 'ops', availability: 'owner', kind: 'dynamicHost',
    descendantIds: ["opsDetails", "hOps", "opsForbidden", "opsCreator", "opsEmail", "opsSearch", "opsNoUser", "opsCreatorForm", "opsUserInfo", "opsIsCreator", "opsBadge", "opsBio", "opsReason", "opsCreatorSave", "opsMsg"] },
];

async function st1Modules() {
  const [{ SETTINGS_GROUPS, validateSettingsRegistry, resolveSettingsHash }, { KO }, { EN }, { JA }] = await Promise.all([
    import('../../../frontend/src/lib/settingsRegistry.mts'), import('../../../frontend/src/lib/i18n/ko.mts'),
    import('../../../frontend/src/lib/i18n/en.mts'), import('../../../frontend/src/lib/i18n/ja.mts'),
  ]);
  return { groups: SETTINGS_GROUPS, validate: validateSettingsRegistry, resolve: resolveSettingsHash, dictionaries: { ko: KO, en: EN, ja: JA } };
}

test('ST1-02-04 registry validation and hash errors', async () => {
  const { groups, validate, resolve, dictionaries } = await st1Modules();
  const before = JSON.stringify({ groups, rendered: ST1_RENDERED, dictionaries });
  expect(validate(groups, ST1_RENDERED, dictionaries)).toEqual([]);
  const check = (mutate, expected) => {
    const input = structuredClone({ groups, rendered: ST1_RENDERED, dictionaries });
    mutate(input);
    expect(validate(input.groups, input.rendered, input.dictionaries)).toEqual(expected);
  };
  check(x => x.groups[1].id = 'account', [{ code: 'DUPLICATE_ID', subject: 'account' }]);
  check(x => x.groups[1].items[0].aliases.push('account'), [{ code: 'DUPLICATE_ALIAS', subject: 'account' }, { code: 'UNKNOWN_TARGET', subject: 'account' }]);
  check(x => x.groups[0].items[0].aliases.push('absent'), [{ code: 'UNKNOWN_TARGET', subject: 'absent' }]);
  check(x => x.groups[0].items[0].targetId = 'absent', [{ code: 'UNKNOWN_TARGET', subject: 'absent' }]);
  check(x => x.rendered.shift(), [{ code: 'UNKNOWN_RENDER_KEY', subject: 'account' }]);
  check(x => x.rendered.push({ ...x.rendered[0], renderKey: 'extra' }), [{ code: 'MISSING_RENDER_KEY', subject: 'extra' }]);
  check(x => x.rendered.push(x.rendered[0]), [{ code: 'DUPLICATE_RENDER_KEY', subject: 'account' }]);
  check(x => x.groups[0].items.push({ ...x.groups[0].items[0], id: 'copy', targetId: 'copy', aliases: [] }), [
    { code: 'DUPLICATE_RENDER_KEY', subject: 'account' }, { code: 'UNKNOWN_TARGET', subject: 'copy' },
  ]);
  check(x => x.groups[0].items = [], [{ code: 'MISSING_RENDER_KEY', subject: 'account' }]);
  for (const locale of ['ko', 'en', 'ja']) {
    for (const empty of [false, true]) {
      check(x => { if (empty) x.dictionaries[locale]['settings.secAccount'] = ' '; else delete x.dictionaries[locale]['settings.secAccount']; },
        [{ code: 'MISSING_I18N_KEY', subject: `${locale}:settings.secAccount` }]);
    }
  }
  expect(JSON.stringify({ groups, rendered: ST1_RENDERED, dictionaries })).toBe(before);
  expect(resolve('#%6cinks', groups)).toEqual({ groupId: 'advancedData', renderKey: 'advanced', targetId: 'links' });
  for (const hash of ['', '#', '#%', '#%256cinks', '#[id=account]', '#unknown']) expect(resolve(hash, groups)).toBeNull();
});

test('ST1-01 role DOM, group navigation, keyboard and hash focus', async ({ browser }) => {
  test.setTimeout(60000);
  const { groups, dictionaries } = await st1Modules();
  const cases = [
    { role: 'guest', lang: 'ko', width: 390, state: STATES.guest, keys: ['account', 'credits', 'screen', 'language', 'backup', 'advanced'], targets: ['account', 'credits', 'screen', 'nx'] },
    { role: 'user', lang: 'en', width: 768, state: STATES.user, keys: ['account', 'credits', 'community', 'screen', 'language', 'backup', 'advanced'], targets: ['account', 'credits', 'community', 'screen', 'nx'] },
    { role: 'owner', lang: 'ja', width: 1280, state: USER_OWNER, keys: ['account', 'credits', 'community', 'screen', 'language', 'backup', 'advanced', 'opsHost'], targets: ['account', 'credits', 'community', 'screen', 'nx', 'ops'] },
  ];
  for (const entry of cases) {
    const context = await browser.newContext({ viewport: { width: entry.width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await mockApp(page, { ...entry.state, local: { 'ulp:lang': entry.lang }, me: { ...entry.state.me, locale: entry.lang } });
      const mutations = [], admin = [], errors = [];
      page.on('request', request => {
        if (['POST', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url());
        if (request.url().includes('/api/v1/admin/')) admin.push(request.url());
      });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/settings.html');
      await settingsReady(page, entry.role === 'guest' ? 'guest' : 'user');
      const nav = page.locator('#settingsGroups');
      await expect(nav).toHaveAttribute('aria-label', dictionaries[entry.lang]['settings.groups.navigation']);
      const dom = await page.locator('[data-setting-render-key]').evaluateAll(nodes => nodes.map(node => {
        const section = node.tagName === 'SECTION' ? node : node.querySelector('section');
        return { key: node.dataset.settingRenderKey, target: section.id, descendants: [...section.querySelectorAll('[id]')].map(el => el.id) };
      }));
      expect(dom.map(item => item.key)).toEqual(entry.keys);
      for (const item of dom) {
        const contract = ST1_RENDERED.find(contract => contract.renderKey === item.key);
        expect(item.target).toBe(contract.targetId);
        // Dynamic server rows belong to OpsPanel; the registry owns only its fixed host.
        if (contract.kind === 'fixed') {
          expect(item.descendants.filter(id => !contract.descendantIds.includes(id))).toEqual([]);
          // These IDs depend on tier/error state; all other baseline IDs must remain mounted.
          const conditional = ['creditTier', 'creditMsg', 'creditTotal', 'creditBuckets', 'creditNext', 'creditExpire', 'commProNotice', 'commNameRequiredNotice', 'commErrMsg'];
          expect(item.descendants).toEqual(expect.arrayContaining(contract.descendantIds.filter(id => !conditional.includes(id))));
        } else expect(item.descendants).toEqual(expect.arrayContaining(['hOps', 'opsDetails', 'opsCreator']));
        const metadata = groups.flatMap(group => group.items).find(candidate => candidate.renderKey === item.key);
        expect(metadata.targetId).toBe(item.target);
      }
      const links = nav.locator('a');
      await expect(links).toHaveCount(entry.targets.length);
      const bounds = await nav.evaluate(node => {
        const rect = node.getBoundingClientRect(), account = document.getElementById('account').getBoundingClientRect();
        return { left: rect.left - account.left, right: rect.right - account.right, gap: account.top - rect.bottom };
      });
      expect(bounds).toEqual({ left: 0, right: 0, gap: 16 });
      for (let index = 0; index < entry.targets.length; index++) {
        const link = links.nth(index), target = entry.targets[index];
        await expect(link).toHaveAttribute('href', `#${target}`);
        const groupId = await link.getAttribute('data-setting-group');
        const group = groups.find(group => group.id === groupId);
        await expect(link.locator('strong')).toHaveText(dictionaries[entry.lang][group.titleKey]);
        await link.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(`#${target}`)).toBeFocused();
        await expect(page.locator(`#${target}`)).toBeInViewport();
      }
      const audio = page.locator('#chkExportAudio');
      await audio.uncheck();
      await links.first().click();
      await expect(page.locator('#account')).toBeFocused();
      await page.locator('h1').evaluate(node => { node.tabIndex = -1; node.focus(); });
      await links.first().click(); // Same hash must still move focus.
      await expect(page.locator('#account')).toBeFocused();
      for (const hash of ['langSec', 'links', 'hAdvanced']) {
        await page.evaluate(hash => { location.hash = hash; }, hash);
        await expect(page.locator(`#${hash}`)).toBeFocused();
        await expect(page.locator(`#${hash}`)).toBeVisible();
      }
      await page.goBack();
      await expect(page.locator('#links')).toBeFocused();
      await page.goForward();
      await expect(page.locator('#hAdvanced')).toBeFocused();
      await expect(audio).not.toBeChecked();
      for (const hash of ['%', '[id=account]', 'unknown', ...(entry.role === 'guest' ? ['community', 'ops'] : entry.role === 'user' ? ['ops'] : [])]) {
        await page.locator('h1').evaluate(node => { node.tabIndex = -1; node.focus(); });
        const originalHash = await page.evaluate(hash => { location.hash = hash; return location.hash; }, hash);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator('h1')).toBeFocused();
        expect(await page.evaluate(() => location.hash)).toBe(originalHash);
      }
      if (entry.role !== 'owner') { expect(admin).toEqual([]); await expect(page.locator('#ops')).toHaveCount(0); }
      if (entry.role === 'guest') await expect(page.locator('#community')).toHaveCount(0);
      expect(mutations).toEqual([]);
      expect(errors).toEqual([]);
      await page.goto('/settings.html#links');
      await expect(page.locator('#links')).toBeFocused();
    } finally { await context.close(); }
  }
});

test('ST1-05 internal targets, accordion auto-expansion, and hash history', async ({ page }) => {
  await mockApp(page, USER_OWNER);
  await page.goto('/settings.html');
  await settingsReady(page, 'userOwner');

  // 1. The outer data group opens for internal targets; the legacy host stays mounted.
  await expect(page.locator('[data-setting-disclosure="advancedData"]')).not.toHaveAttribute('open', '');
  await page.evaluate(() => { location.hash = 'links'; });
  await expect(page.locator('#links')).toBeFocused();
  await expect(page.locator('#links')).toBeVisible();

  // Target internal notion link
  await page.evaluate(() => { location.hash = 'nlPractice'; });
  await expect(page.locator('#nlPractice')).toBeFocused();

  // 2. Targets across various groups
  await page.evaluate(() => { location.hash = 'accQuota'; });
  await expect(page.locator('#accQuota')).toBeFocused();

  await page.evaluate(() => { location.hash = 'chkExportAudio'; });
  await expect(page.locator('#chkExportAudio')).toBeFocused();

  await page.evaluate(() => { location.hash = 'langSelect'; });
  await expect(page.locator('#langSelect')).toBeFocused();

  await page.evaluate(() => { location.hash = 'opsDetails'; });
  await expect(page.locator('#opsDetails')).toBeFocused();

  // 3. History navigation (back and forward)
  await page.goBack();
  await expect(page.locator('#langSelect')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#chkExportAudio')).toBeFocused();
  await page.goForward();
  await expect(page.locator('#langSelect')).toBeFocused();
  await page.goForward();
  await expect(page.locator('#opsDetails')).toBeFocused();
});

test('ST1-06 auth delay, latest hash resolution, role change, and focus cancellation', async ({ page }) => {
  let resolveMe;
  const mePromise = new Promise((resolve) => { resolveMe = resolve; });
  const DELAYED_ME_ROUTE = [
    (url) => url.pathname.startsWith('/api/v1/me'),
    async (route) => {
      await mePromise;
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ ...DEFAULT_ME, role: 'owner' }),
      });
    },
  ];

  await mockApp(page, { ...USER_OWNER, routes: [DELAYED_ME_ROUTE, ...USER_OWNER.routes] });
  await page.goto('/settings.html#ops');

  // While /me is pending, #ops is not yet rendered for owner
  await expect(page.locator('#ops')).toHaveCount(0);

  // User navigates to #nx before /me resolves
  await page.evaluate(() => { location.hash = 'nx'; });

  // Resolve /me with owner
  resolveMe();
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');

  // Only latest hash #nx must be focused, not the stale #ops
  await expect(page.locator('#nx')).toBeFocused();
  await expect(page.locator('#ops')).toHaveCount(1);

  // Now explicitly navigate to #ops
  await page.evaluate(() => { location.hash = 'ops'; });
  await expect(page.locator('#ops')).toBeFocused();

  // Test queued focus cancellation on auth generation change / sign out
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.evaluate(() => {
    location.hash = 'account';
    if (window.__supabaseAuthListener) window.__supabaseAuthListener('SIGNED_OUT', null);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(errors).toEqual([]);
});

test('ST1-P1 profile saves preserve the current switch focus', async ({ page }) => {
  let saves = 0;
  await mockApp(page, { ...COMMUNITY_PRO, routes: [...COMMUNITY_PRO.routes, [
    url => url.pathname === '/api/v1/me',
    route => {
      const patch = route.request().method() === 'PATCH' ? route.request().postDataJSON() : {};
      if (route.request().method() === 'PATCH') saves++;
      return route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, ...patch } });
    },
  ]] });
  await page.goto('/settings.html#account');
  await expect(page.locator('#account')).toBeFocused();
  await page.locator('#community > details > summary').click();
  for (const id of ['commAutosync', 'commPracticeLog']) {
    const input = page.locator(`#${id}`);
    await input.focus();
    await input.press('Space');
    await expect.poll(() => saves).toBe(id === 'commAutosync' ? 1 : 2);
    await expect(input).toBeEnabled();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(input).toBeFocused();
  }
});

for (const [target, state, response] of [
  ['creditNext', USER_PRO, { monthlyGrant: 170, nextGrantAt: '2026-11-30T15:00:00Z' }],
  ['creditExpire', USER_GRACE, { monthlyGrant: 0, nextGrantAt: null, monthlyExpiresAt: '2026-11-30T15:00:00Z' }],
]) {
  test(`ST1-P2 delayed credits focus ${target}`, async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested = false;
    await mockApp(page, { ...state, routes: [[url => url.pathname === '/api/v1/credits', async route => {
      requested = true;
      await gate;
      await route.fulfill({ json: { monthly: 152, purchased: 40, total: 192, ...response } });
    }]] });
    await page.goto(`/settings.html#${target}`);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator(`#${target}`)).toHaveCount(0);
    release();
    await expect(page.locator(`#${target}`)).toBeFocused();
  });
}

for (const action of ['hashchange', 'signout']) {
  test(`ST1-P2 delayed credits discard old navigation after ${action}`, async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested = false;
    await mockApp(page, { ...USER_PRO, routes: [[url => url.pathname === '/api/v1/credits', async route => {
      requested = true;
      await gate;
      await CREDITS_ROUTE[1](route);
    }]] });
    await page.goto('/settings.html#creditNext');
    await expect.poll(() => requested).toBe(true);
    if (action === 'hashchange') {
      await page.evaluate(() => { location.hash = 'screen'; });
      await expect(page.locator('#screen')).toBeFocused();
      await page.locator('#credits > details > summary').click();
    } else {
      await page.evaluate(() => window.__supabaseAuthListener('SIGNED_OUT', null));
      await expect(page.locator('#accGuest')).not.toHaveAttribute('hidden', '');
      await page.locator('#account > details > summary').click();
      await expect(page.locator('#accGuest')).toBeVisible();
      await page.locator('[data-setting-disclosure="appearanceLanguage"] > summary').click();
    }
    const control = page.locator('#langSelect button').first();
    await control.focus();
    await expect(control).toBeFocused();
    const response = page.waitForResponse(url => url.url().includes('/api/v1/credits'));
    release();
    await response;
    if (action === 'hashchange') await expect(page.locator('#creditNext')).toBeVisible();
    else await expect(page.locator('#creditNext')).toHaveCount(0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(control).toBeFocused();
  });
}

test('ST1-07 conditional elements and descendant IDs across free, pro, grace, and expired states', async ({ page }) => {
  // 1. Guest state
  await mockApp(page, STATES.guest);
  await page.goto('/settings.html');
  await settingsReady(page, 'guest');
  await openServiceGroups(page);
  await expect(page.locator('#creditMsg')).toBeVisible();
  await expect(page.locator('#creditTier')).toHaveCount(0);
  await expect(page.locator('#creditTotal')).toHaveCount(0);
  await expect(page.locator('#creditBuckets')).toHaveCount(0);
  await expect(page.locator('#creditNext')).toHaveCount(0);
  await expect(page.locator('#creditExpire')).toHaveCount(0);
  await expect(page.locator('#community')).toHaveCount(0);

  // 2. Free user state
  await mockApp(page, STATES.user);
  await page.goto('/settings.html');
  await settingsReady(page, 'user');
  await openServiceGroups(page);
  await expect(page.locator('#creditTier')).toHaveText('무료');
  await expect(page.locator('#creditMsg')).toContainText('Pro 플랜');
  await expect(page.locator('#creditTotal')).toHaveCount(0);
  await expect(page.locator('#creditBuckets')).toHaveCount(0);
  await expect(page.locator('#creditNext')).toHaveCount(0);
  await expect(page.locator('#creditExpire')).toHaveCount(0);
  await expect(page.locator('#commProNotice')).toBeVisible();
  await expect(page.locator('#commNameRequiredNotice')).toHaveCount(0);

  // 3. Pro user state
  await mockApp(page, USER_PRO);
  await page.goto('/settings.html');
  await settingsReady(page, 'userPro');
  await openServiceGroups(page);
  await expect(page.locator('#creditTier')).toHaveText('Pro');
  await expect(page.locator('#creditTotal')).toHaveText('192');
  await expect(page.locator('#creditBuckets')).toContainText('152');
  await expect(page.locator('#creditNext')).toContainText('170');
  await expect(page.locator('#creditMsg')).toHaveCount(0);
  await expect(page.locator('#creditExpire')).toHaveCount(0);

  // 4. Grace user state
  await mockApp(page, USER_GRACE);
  await page.goto('/settings.html');
  await settingsReady(page, 'userGrace');
  await openServiceGroups(page);
  await expect(page.locator('#creditTier')).toHaveText('Pro');
  await expect(page.locator('#creditTotal')).toHaveText('192');
  await expect(page.locator('#creditBuckets')).toContainText('152');
  await expect(page.locator('#creditExpire')).toContainText('무료 플랜으로 바뀌어요');
  await expect(page.locator('#creditNext')).toHaveCount(0);

  // 5. Expired user state (free after grace period has fully lapsed)
  const USER_EXPIRED = {
    ...STATES.user,
    me: { ...PRO_ME, tier: 'free', billingTier: 'free', limits: { ...DEFAULT_ME.limits }, credits: { monthly: 0, purchased: 40 } },
    routes: [
      [
        (url) => url.pathname === '/api/v1/credits',
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ monthly: 0, purchased: 40, total: 40, monthlyGrant: 0, nextGrantAt: null, monthlyExpiresAt: null }),
          }),
      ],
    ],
  };
  await mockApp(page, USER_EXPIRED);
  await page.goto('/settings.html');
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  await openServiceGroups(page);
  await expect(page.locator('#creditTier')).toHaveText('무료');
  await expect(page.locator('#creditMsg')).toContainText('Pro 플랜');
  await expect(page.locator('#creditTotal')).toHaveCount(0);
  await expect(page.locator('#creditBuckets')).toHaveCount(0);
  await expect(page.locator('#creditNext')).toHaveCount(0);
  await expect(page.locator('#creditExpire')).toHaveCount(0);
  await expect(page.locator('#commProNotice')).toBeVisible();

  // 6. Pro community state without publicName
  const USER_PRO_NO_NAME = {
    ...STATES.user,
    me: { ...COMMUNITY_PRO_ME, publicName: '' },
    routes: [CREDITS_ROUTE, ...communityRoutes()],
  };
  await mockApp(page, USER_PRO_NO_NAME);
  await page.goto('/settings.html');
  await settingsReady(page, 'userPro');
  await openServiceGroups(page);
  await expect(page.locator('#commNameRequiredNotice')).toBeVisible();
  await expect(page.locator('#commProNotice')).toHaveCount(0);
});

test('ST1-08-09 disabled target focus to section title, deep scroll, and edge cases', async ({ page }) => {
  // 1. Disabled target focus fallback
  await mockApp(page, STATES.user);
  await page.goto('/settings.html');
  await settingsReady(page, 'user');

  // commPracticeLog is disabled for free tier without communityWrite permission
  await expect(page.locator('#commPracticeLog')).toBeDisabled();
  await page.evaluate(() => { location.hash = 'commPracticeLog'; });
  // Focus should fallback to section title #hCommunity
  await expect(page.locator('#hCommunity')).toBeFocused();

  // Enabled link target should focus directly
  await page.evaluate(() => { location.hash = 'settingsProfileLink'; });
  await expect(page.locator('#settingsProfileLink')).toBeFocused();

  // 2. Deep scroll at 390px, 768px, 1280px
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings.html#links');
    await expect(page.locator('#links')).toBeFocused();
    await expect(page.locator('#links')).toBeInViewport();
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(100);
  }

  // 3. Edge cases: malformed percent encoding and selector-like hashes
  for (const malformed of ['#%', '#%256cinks', '#[id=account]', '#invalidTarget']) {
    await page.locator('h1').evaluate((el) => { el.tabIndex = -1; el.focus(); });
    await page.evaluate((h) => { location.hash = h; }, malformed);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Should not crash and should keep h1 focused
    await expect(page.locator('h1')).toBeFocused();
    expect(await page.evaluate(() => location.hash)).toBe(malformed);
  }
});
