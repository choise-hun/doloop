// M2-4a·M2-4b 운영 섹션(owner 전용): 비 owner 미노출·/admin 요청 0건, owner인데 /admin 403이면 안내 한 줄, 크리에이터 검색·저장 요청 본문,
// M2-4b 큐레이션·이달의 곡: 만들기 → 곡 저장 → 공개, 6곡째 막힘, PATCH 본문에 기존 en 보존, 삭제, 잘못된 구간
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
  // M2-4b: 펼치면 폴더 목록을 불러오므로 그 403에서 바로 안내
  await page.locator('#hOps').click();
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

// ---- M2-4b 큐레이션·이달의 곡 (결과/M1-4b_큐레이션API.md §3-3) ----

function folderDto(over) {
  return {
    id: '00000000-0000-4000-8000-000000000300',
    kind: 'curated',
    ownerId: null,
    title: '',
    isPublic: false,
    autoSync: false,
    hidden: false,
    hiddenAt: null,
    hiddenReason: null,
    titleI18n: {},
    descriptionI18n: {},
    month: null,
    sortOrder: 0,
    itemCount: 0,
    likeCount: 0,
    cloneCount: 0,
    publishedAt: null,
    createdAt: '2026-11-06T00:00:00Z',
    ...over,
  };
}

function itemDto(videoId, i, over = {}) {
  return { videoId, position: i, title: `YouTube 제목 ${videoId}`, artist: '채널', a: null, b: null, rate: 1, noteI18n: {}, ...over };
}

/** 가짜 /admin/shared-folders 서버(상태 있음). 요청은 calls에 쌓는다 */
function folderServer(initial) {
  const state = { folders: initial.map((d) => ({ folder: { ...d.folder }, items: d.items.map((x) => ({ ...x })) })) };
  const calls = [];
  const handler = (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = method === 'GET' ? null : req.postDataJSON();
    calls.push({ method, path: url.pathname, body });
    const m = url.pathname.match(/^\/api\/v1\/admin\/shared-folders(?:\/([^/]+))?(\/items)?$/);
    const id = m && m[1];
    const found = id ? state.folders.find((d) => d.folder.id === id) : null;
    if (method === 'GET' && !id) return json(route, { folders: state.folders });
    if (method === 'POST' && !id) {
      const folder = folderDto({
        id: '00000000-0000-4000-8000-000000000399',
        kind: body.kind,
        title: body.titleI18n.ko,
        titleI18n: body.titleI18n,
        descriptionI18n: body.descriptionI18n || {},
        month: body.month || null,
      });
      state.folders.push({ folder, items: [] });
      return json(route, folder, 201);
    }
    if (!found) return json(route, { error: 'NOT_FOUND', message: '폴더가 없습니다.' }, 404);
    if (method === 'PATCH') {
      const { reason, ...patch } = body;
      Object.assign(found.folder, patch);
      if (patch.titleI18n) found.folder.title = patch.titleI18n.ko;
      if (patch.isPublic) found.folder.publishedAt = '2026-11-06T01:00:00Z';
      return json(route, found.folder);
    }
    if (method === 'PUT' && m[2]) {
      found.items = body.items.map((x, i) => itemDto(x.videoId, i, { a: x.a ?? null, b: x.b ?? null, rate: x.rate ?? 1, noteI18n: x.noteI18n || {} }));
      found.folder.itemCount = found.items.length;
      return json(route, found);
    }
    if (method === 'DELETE') {
      state.folders = state.folders.filter((d) => d !== found);
      return json(route, { id, deleted: true });
    }
    return json(route, {}, 400);
  };
  return { calls, route: [(url) => url.pathname.startsWith('/api/v1/admin/shared-folders'), handler] };
}

const writes = (calls) => calls.filter((c) => c.method !== 'GET');

async function openOps(page, server) {
  await open(page, { ...STATES.user, me: { role: 'owner' }, routes: [server.route] });
  await page.locator('#hOps').click();
  await expect(page.locator('#opsFolders')).toBeVisible();
}

test('M2-4b 폴더: 펼치면 목록(초안·공개 표시), 만들기 → 곡 저장 → 공개 요청 본문', async ({ page }) => {
  const server = folderServer([]);
  await openOps(page, server);
  await expect(page.locator('#opsFoldersEmpty')).toBeVisible();
  expect(server.calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /api/v1/admin/shared-folders']);

  // 이달의 곡 만들기: 달 기본값 = KST 다음 달, 사유 기본값
  await page.locator('#opsNewKind').selectOption('monthly_pick');
  await expect(page.locator('#opsNewMonth')).toHaveValue(/^\d{4}-\d{2}$/);
  await page.locator('#opsNewMonth').fill('2026-12');
  await page.locator('#opsNewTitle').fill(' 12월의 곡 ');
  await expect(page.locator('#opsNewReason')).toHaveValue('이달의 곡 2026-12 만들기');
  await page.locator('#opsNewCreate').click();

  await expect(page.locator('#opsEditor')).toBeVisible();
  await expect(page.locator('#opsEdTitle')).toHaveValue('12월의 곡');
  await expect(page.locator('.opsFolderRow')).toHaveCount(1);
  await expect(page.locator('.opsFolderRow .opsFolderState')).toHaveText('초안');

  // 곡 추가: 주소 붙여넣기 → ID, 틀린 주소는 안내
  await page.locator('#opsAddVideo').fill('https://example.com/not-youtube');
  await page.locator('#opsAddItem').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('유튜브 주소나 영상 ID(11자)를 넣어 주세요.');
  await page.locator('#opsAddVideo').fill('https://www.youtube.com/watch?v=abcdefghij1&t=10');
  await page.locator('#opsAddItem').click();
  await page.locator('#opsAddVideo').fill('abcdefghij2');
  await page.locator('#opsAddVideo').press('Enter');
  await expect(page.locator('.opsItem')).toHaveCount(2);
  await expect(page.locator('#opsItemCount')).toHaveText('2 / 5곡');
  const first = page.locator('.opsItem').first();
  await first.locator('.opsItemA').fill('0:12');
  await first.locator('.opsItemB').fill('48');
  await first.locator('.opsItemRate').fill('0.75');
  await first.locator('.opsItemNote').fill('인트로 리프');
  await expect(page.locator('#opsEdReason')).toHaveValue('이달의 곡 2026-12 정보 수정');
  await page.locator('#opsItemsSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('✓ 곡을 저장했어요');
  await expect(first.locator('.opsItemTitle')).toContainText('YouTube 제목 abcdefghij1');

  // 공개
  await expect(page.locator('#opsEdPublish')).toHaveText('공개하기');
  await page.locator('#opsEdPublish').click();
  await expect(page.locator('#opsEdPublish')).toHaveText('비공개로');
  await expect(page.locator('.opsFolderRow .opsFolderState')).toHaveText('공개');

  expect(writes(server.calls)).toEqual([
    {
      method: 'POST',
      path: '/api/v1/admin/shared-folders',
      body: { kind: 'monthly_pick', titleI18n: { ko: '12월의 곡' }, month: '2026-12', reason: '이달의 곡 2026-12 만들기' },
    },
    {
      method: 'PUT',
      path: '/api/v1/admin/shared-folders/00000000-0000-4000-8000-000000000399/items',
      body: {
        items: [
          { videoId: 'abcdefghij1', a: 12, b: 48, rate: 0.75, noteI18n: { ko: '인트로 리프' } },
          { videoId: 'abcdefghij2', a: null, b: null, rate: 1 },
        ],
        reason: '이달의 곡 2026-12 곡 교체',
      },
    },
    {
      method: 'PATCH',
      path: '/api/v1/admin/shared-folders/00000000-0000-4000-8000-000000000399',
      body: { isPublic: true, reason: '이달의 곡 2026-12 공개' },
    },
  ]);
});

const MONTHLY_FULL = {
  folder: folderDto({
    id: '00000000-0000-4000-8000-000000000301',
    kind: 'monthly_pick',
    title: '12월의 곡',
    titleI18n: { ko: '12월의 곡', en: 'Picks of December' },
    descriptionI18n: { ko: '연말 분위기', en: 'Year-end mood' },
    month: '2026-12',
    itemCount: 5,
    isPublic: true,
    publishedAt: '2026-11-01T00:00:00Z',
  }),
  items: [1, 2, 3, 4, 5].map((n, i) => itemDto('abcdefghij' + n, i, { noteI18n: { ko: '설명 ' + n, en: 'Note ' + n } })),
};

test('M2-4b 이달의 곡 5곡이면 6곡째 추가가 막힌다, 곡 저장에 en 설명 보존', async ({ page }) => {
  const server = folderServer([MONTHLY_FULL]);
  await openOps(page, server);
  await page.locator('.opsFolderRow .opsFolderPick').first().click();
  await expect(page.locator('.opsItem')).toHaveCount(5);
  await expect(page.locator('#opsItemCount')).toHaveText('5 / 5곡');
  await page.locator('#opsAddVideo').fill('abcdefghij6');
  await expect(page.locator('#opsAddItem')).toBeDisabled();
  await expect(page.locator('#opsItemsMax')).toHaveText('이달의 곡은 5곡까지예요. 한 곡을 빼고 넣어 주세요.');

  // 한 곡 빼면 다시 추가 가능
  await page.locator('.opsItem').nth(4).locator('.opsItemDel').click();
  await expect(page.locator('#opsAddItem')).toBeEnabled();
  await page.locator('.opsItem').first().locator('.opsItemNote').fill('새 설명');
  await page.locator('#opsItemsSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('✓ 곡을 저장했어요');
  const put = writes(server.calls)[0];
  expect(put.method).toBe('PUT');
  expect(put.body.items).toHaveLength(4);
  expect(put.body.items[0].noteI18n).toEqual({ ko: '새 설명', en: 'Note 1' });
  expect(put.body.items[1].noteI18n).toEqual({ ko: '설명 2', en: 'Note 2' });
});

test('M2-4b 정보 수정: PATCH 본문에 기존 en 보존, 바뀐 칸만 보낸다', async ({ page }) => {
  const server = folderServer([MONTHLY_FULL]);
  await openOps(page, server);
  await page.locator('.opsFolderRow .opsFolderPick').first().click();
  await expect(page.locator('#opsEdTitle')).toHaveValue('12월의 곡');
  await page.locator('#opsEdTitle').fill('12월 추천곡');
  await page.locator('#opsEdReason').fill('제목 다듬기');
  await page.locator('#opsEdSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('✓ 저장했어요');
  await expect(page.locator('.opsFolderRow').first()).toContainText('12월 추천곡');
  expect(writes(server.calls)).toEqual([
    {
      method: 'PATCH',
      path: '/api/v1/admin/shared-folders/00000000-0000-4000-8000-000000000301',
      body: { titleI18n: { ko: '12월 추천곡', en: 'Picks of December' }, reason: '제목 다듬기' },
    },
  ]);
  // 설명을 비우면 ko만 빠지고 en은 남는다
  await page.locator('#opsEdDesc').fill('');
  await page.locator('#opsEdSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('✓ 저장했어요');
  expect(writes(server.calls)[1].body).toEqual({ descriptionI18n: { en: 'Year-end mood' }, reason: '제목 다듬기' });
});

test('M2-4b 잘못된 구간·사유 빈칸은 저장하지 않는다', async ({ page }) => {
  const server = folderServer([MONTHLY_FULL]);
  await openOps(page, server);
  await page.locator('.opsFolderRow .opsFolderPick').first().click();
  const first = page.locator('.opsItem').first();
  await first.locator('.opsItemA').fill('1:00');
  await first.locator('.opsItemB').fill('0:30');
  await page.locator('#opsItemsSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('1번 곡: 끝이 시작보다 뒤여야 해요.');
  await page.locator('#opsEdReason').fill(' ');
  for (const id of ['#opsItemsSave', '#opsEdSave', '#opsEdPublish', '#opsEdDelete']) await expect(page.locator(id)).toBeDisabled();
  expect(writes(server.calls)).toEqual([]);
});

test('M2-4b 서버 400(곡 상한)은 서버 문장을 그대로 보인다', async ({ page }) => {
  const server = folderServer([MONTHLY_FULL]);
  await open(page, {
    ...STATES.user,
    me: { role: 'owner' },
    routes: [
      server.route,
      [
        (url) => url.pathname.endsWith('/items'),
        (route) => json(route, { error: 'INVALID_INPUT', message: '이달의 곡은 5개까지 넣을 수 있습니다.', detail: { max: 5 } }, 400),
      ],
    ],
  });
  await page.locator('#hOps').click();
  await page.locator('.opsFolderRow .opsFolderPick').first().click();
  await page.locator('#opsItemsSave').click();
  await expect(page.locator('#opsFolderMsg')).toHaveText('이달의 곡은 5개까지 넣을 수 있습니다.');
});

test('M2-4b 삭제: 확인 → DELETE 사유, 목록에서 빠진다. 확인 취소면 요청 없음', async ({ page }) => {
  const server = folderServer([MONTHLY_FULL]);
  await openOps(page, server);
  await page.locator('.opsFolderRow .opsFolderPick').first().click();
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#opsEdDelete').click();
  await expect(page.locator('#opsEditor')).toBeVisible();
  expect(writes(server.calls)).toEqual([]);

  page.once('dialog', (d) => d.accept());
  await page.locator('#opsEdDelete').click();
  await expect(page.locator('#opsEditor')).toHaveCount(0);
  await expect(page.locator('#opsFoldersEmpty')).toBeVisible();
  expect(writes(server.calls)).toEqual([
    { method: 'DELETE', path: '/api/v1/admin/shared-folders/00000000-0000-4000-8000-000000000301', body: { reason: '이달의 곡 2026-12 삭제' } },
  ]);
});
