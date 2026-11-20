// UI 다듬기(2026-11-15): 커뮤니티 숨김 · PLAYER 메뉴 이름 · 로고↔HOME 간격 · 플레이어 재생:녹음 10:2 · 제목 세로 가운데
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, FIXTURES } = require('../support/mock-app');

test('UP-1: 커뮤니티 숨김 기본값 — 위 메뉴·탭 바·홈 배너·설정/프로필 섹션이 없고 주소는 홈으로 간다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/', { waitUntil: 'load' });
  const nav = page.locator('nav.site-nav');
  await expect(nav.getByRole('link', { name: 'PLAYER' })).toHaveAttribute('href', 'practice.html');
  await expect(page.locator('a[href="community.html"]')).toHaveCount(0);
  await expect(page.locator('nav[data-tabbar="1"] a[href="community.html"]')).toHaveCount(0);
  await expect(page.locator('#homeCommunityBanner')).toHaveCount(0);

  await page.goto('/settings.html', { waitUntil: 'load' });
  await page.locator('#account').waitFor();
  await expect(page.locator('section#community')).toHaveCount(0);

  await page.goto('/profile.html', { waitUntil: 'load' });
  await page.locator('#profileNames').waitFor();
  await expect(page.locator('#profilePublicNameInput')).toHaveCount(0);
  await expect(page.locator('#profileSummary, #profileFolders')).toHaveCount(0);

  await page.goto('/community.html', { waitUntil: 'load' });
  await expect(page).toHaveURL(/\/$/);
});

test('UP-2: 좁은 폭 탭 바는 커뮤니티를 뺀 5칸이 같은 폭으로 화면을 채운다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/privacy.html', { waitUntil: 'load' });
  const bar = page.locator('nav[data-tabbar="1"]');
  await expect(bar.locator('a, span')).toHaveText(['PLAYER', 'LEARN', 'TRAILS', 'CHORDS', 'NOTES']);
  const m = await bar.evaluate((el) => {
    const cs = getComputedStyle(el);
    const items = [...el.querySelectorAll(':scope > a, :scope > span')].map((e) => e.getBoundingClientRect());
    const box = el.getBoundingClientRect();
    return {
      widths: items.map((r) => r.width),
      span: items[items.length - 1].right - items[0].left,
      inner: box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    };
  });
  for (const w of m.widths) expect(Math.abs(w - m.widths[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(m.span - m.inner)).toBeLessThanOrEqual(1); // 5칸이 탭 바 안쪽 폭을 다 채운다
});

test('UP-3: 로고와 HOME 글자 사이 간격은 24px 이상(1280px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/privacy.html', { waitUntil: 'load' });
  const gap = await page.evaluate(() => {
    const link = document.querySelector('nav.site-nav a[href="./"]');
    const [logo, text] = [link.firstElementChild, link.lastElementChild];
    return text.getBoundingClientRect().left - logo.getBoundingClientRect().right;
  });
  expect(gap).toBeGreaterThanOrEqual(24);
});

// WF-2(C안)로 녹음 상자가 없어졌다. 위치 검사는 layout/practice.spec.js WF2-C가 맡는다
for (const width of [1280, 1150]) {
  test(`UP-4: 플레이어 녹음 버튼은 재생 상자 안에 있고 넘치지 않는다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, { ...STATES.user, community: false });
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#ppPlayCard').waitFor();
    await expect(page.locator('#ppRecCard')).toHaveCount(0);
    const r = await page.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect();
      return { play: b('#ppPlayCard'), recBtn: b('#recBtn') };
    });
    expect(r.recBtn.left).toBeGreaterThanOrEqual(r.play.left);
    expect(r.recBtn.right).toBeLessThanOrEqual(r.play.right);
  });
}

test('UP-5: 곡이 없을 때 "연습 플레이어" 제목이 머리 막대의 세로 가운데', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/practice.html', { waitUntil: 'load' });
  const title = page.locator('#songTitle');
  await expect(title).toHaveText('연습 플레이어');
  const r = await page.evaluate(() => {
    const head = document.getElementById('songTitle').closest('header').getBoundingClientRect();
    const t = document.getElementById('songTitle').getBoundingClientRect();
    return { head: head.top + head.height / 2, title: t.top + t.height / 2 };
  });
  expect(Math.abs(r.head - r.title)).toBeLessThanOrEqual(1);
});

// ── DS2-4(2026-11-19 승인): 공용 .ghostBtn·.inpField 본체 3px · Notes·NoteDetail·Progressions·Settings·Privacy·Profile 4:6 전환
// 색은 토큰을 화면에서 해석해 비교한다(DS2-2 resolveTokenColors 방식). 다크만 rgb 직접(DS24-D1)

async function ds24Colors(page) {
  return page.evaluate(() => {
    const read = (prop, val) => {
      const el = document.createElement('span');
      el.style[prop] = val;
      document.body.appendChild(el);
      const out = window.getComputedStyle(el)[prop];
      el.remove();
      return out;
    };
    return {
      ink: read('color', 'var(--ink)'),
      inkStrong: read('color', 'var(--ink-strong)'),
      fill2: read('color', 'var(--fill2)'),
      fill3: read('color', 'var(--fill3)'),
      seamHairline: read('color', 'var(--seam-hairline)'),
      cream: read('backgroundColor', 'var(--cream)'),
      paper: read('backgroundColor', 'var(--paper)'),
      panelFrosted: read('backgroundColor', 'var(--panel-frosted)'),
      reliefBottomMid: read('color', 'var(--relief-bottom-mid)'),
      shadowAmbient: read('color', 'var(--shadow-ambient)'),
    };
  });
}

const ds24Rgb = (c) => (c.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number).join(',');

async function ds24Box(locator) {
  return locator.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      leftW: s.borderLeftWidth, leftC: s.borderLeftColor,
      topW: s.borderTopWidth, topC: s.borderTopColor,
      radius: s.borderTopLeftRadius, shadow: s.boxShadow,
      bg: s.backgroundColor, bgImage: s.backgroundImage,
      fontSize: s.fontSize, fontWeight: s.fontWeight, height: el.getBoundingClientRect().height,
    };
  });
}

// 스파인 카드(UF-1 D1): 왼쪽 3px(색 = 스파인) · 위 1px 줄눈 · 3px · 그림자 1겹(릴리프 없음)
async function expectSpine(locator, spine, colors, label) {
  const b = await ds24Box(locator);
  expect(b.leftW, `${label} 왼쪽 테두리`).toBe('3px');
  expect(b.leftC, `${label} 스파인 색`).toBe(spine);
  expect(b.topW, `${label} 위 테두리`).toBe('1px');
  expect(b.topC, `${label} 위 테두리 색`).toBe(colors.seamHairline);
  expect(b.radius, `${label} 곡률`).toBe('3px');
  const rgbs = (b.shadow.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map(ds24Rgb);
  expect(rgbs, `${label} 그림자`).toContain(ds24Rgb(colors.shadowAmbient));
  expect(rgbs, `${label} 두께 릴리프 없음`).not.toContain(ds24Rgb(colors.reliefBottomMid));
}

// 범위 안의 보이는 필(곡률 9999px) a·button id 목록 — 규칙 §1 Q1
async function visiblePills(page, scope = 'main') {
  return page.locator(scope).evaluate((root) => [...root.querySelectorAll('a, button')]
    .filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && window.getComputedStyle(b).borderTopLeftRadius === '9999px';
    })
    .map((b) => b.id || b.getAttribute('data-act') || b.textContent.trim()));
}

test('DS24-C1 공용 본체 .ghostBtn·.inpField = 3px 블록, 크기 불변 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/settings.html#account', { waitUntil: 'load' });
  const logout = page.locator('#btnLogout');
  await expect(logout).toBeVisible();
  const colors = await ds24Colors(page);
  const b = await ds24Box(logout);
  expect(b.radius).toBe('3px');
  expect(b.topC).toBe(colors.seamHairline);
  expect(b.bg).toBe(colors.cream);
  expect(b.fontSize).toBe('17px');
  expect(b.height).toBeGreaterThanOrEqual(48);
  await logout.hover();
  await expect.poll(() => logout.evaluate((el) => window.getComputedStyle(el).borderTopColor)).toBe(colors.ink);

  await page.goto('/profile.html', { waitUntil: 'load' });
  const inp = page.locator('#profileDisplayNameInput');
  await inp.waitFor();
  const i = await ds24Box(inp);
  expect(i.radius).toBe('3px');
  expect(i.topC).toBe(colors.seamHairline);
  expect(i.fontSize).toBe('16px');
});

test('DS24-C2 textarea.inpField 3px · 홈 #goNote 회귀 없음 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.userData, community: false });
  await page.goto(`/note.html?id=${FIXTURES.note.id}`, { waitUntil: 'load' });
  await expect(page.locator('#noteTitle')).toContainText('노트');
  expect(await page.locator('#noteMemoInput').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');

  await page.goto('/', { waitUntil: 'load' });
  await page.locator('#goNote').waitFor({ state: 'attached' });
  expect(await page.locator('#goNote').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
});

test('DS24-N1 Notes: 폼 스파인 fill2 · 필은 #submit 1개 · 태그·목록 3px (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.userData, community: false });
  await page.goto('/notes.html', { waitUntil: 'load' });
  await page.locator('.note-card').first().waitFor();
  const colors = await ds24Colors(page);
  await expectSpine(page.locator('#form'), colors.fill2, colors, '#form');
  expect(await visiblePills(page)).toEqual(['submit']);
  expect(await page.locator('#tags button').evaluateAll((els) => [...new Set(els.map((el) => window.getComputedStyle(el).borderTopLeftRadius))])).toEqual(['3px']);
  const card = await ds24Box(page.locator('.note-card').first());
  expect(card.leftW).toBe('1px');
  expect(card.radius).toBe('3px');
  expect(card.bg).toBe(colors.paper);
});

test('DS24-N2 NoteDetail: 카드 스파인 fill2 · 필은 #notePracticeLink 1개 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.userData, community: false });
  await page.goto(`/note.html?id=${FIXTURES.note.id}`, { waitUntil: 'load' });
  await expect(page.locator('#noteTitle')).toContainText('노트');
  const colors = await ds24Colors(page);
  for (const sel of ['#noteHeader', '#noteSummaryBox', '#noteEditPanel']) {
    await expectSpine(page.locator(sel), colors.fill2, colors, sel);
  }
  expect(await visiblePills(page)).toEqual(['notePracticeLink']);
  expect(await page.locator('#btnCopyMarkdown').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  expect(await page.locator('#editTags button').evaluateAll((els) => [...new Set(els.map((el) => window.getComputedStyle(el).borderTopLeftRadius))])).toEqual(['3px']);
  const svg = page.locator('.svg-box');
  if (await svg.count()) expect((await ds24Box(svg.first())).bg).toBe(colors.panelFrosted);
});

test('DS24-G1 Progressions 목록: 필은 #progAddBtn 1개 · 행 연주 텍스트 · 범위 밑줄 · 취향 스파인 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/progressions.html', { waitUntil: 'load' });
  await page.locator('#progList > li').first().waitFor();
  const colors = await ds24Colors(page);
  expect(await visiblePills(page)).toEqual(['progAddBtn']);
  expect(await page.locator('#progScope').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  const on = await ds24Box(page.locator('#progScope button[aria-pressed="true"]'));
  expect(on.bg).toBe(colors.paper);
  const onShadow = await page.locator('#progScope button[aria-pressed="true"]').evaluate((el) => window.getComputedStyle(el).boxShadow);
  expect((onShadow.match(/rgba?\([^)]*\)/g) || []).map(ds24Rgb)).toContain(ds24Rgb(colors.inkStrong));
  const play = await ds24Box(page.locator('#progList > li').first().locator('[data-act="play"]'));
  expect(play.topW).toBe('0px');
  expect(play.bg).toBe('rgba(0, 0, 0, 0)');
  expect(play.height).toBeGreaterThanOrEqual(40);
  await expectSpine(page.locator('#progTaste'), colors.fill2, colors, '#progTaste');
  expect(await page.locator('#progScope button[aria-pressed="true"] span').evaluate((el) => window.getComputedStyle(el).fontWeight)).toBe('500');
});

test('DS24-G2 Progressions 넣기 패널: 열면 필은 패널 저장 1개 · guest 0개 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.user,
    community: false,
    routes: [[(url) => url.pathname === '/api/v1/progressions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ progressions: [] }) })]],
  });
  await page.goto('/progressions.html', { waitUntil: 'load' });
  await page.locator('#progEmpty').waitFor();
  await page.locator('#progAddBtn').click();
  await page.locator('#progAddPanel').waitFor();
  const colors = await ds24Colors(page);
  expect(await page.locator('#progAddBtn').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  const pills = await visiblePills(page);
  expect(pills).toHaveLength(1);
  expect(await visiblePills(page, '#progAddPanel')).toEqual(pills);
  await expectSpine(page.locator('#progAddPanel'), colors.fill2, colors, '#progAddPanel');

  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/progressions.html', { waitUntil: 'load' });
  await page.locator('#progList > li').first().waitFor();
  await page.locator('#progAddBtn').click();
  await page.locator('#progLoginGate').waitFor();
  expect(await visiblePills(page)).toEqual([]);
});

async function openAllDisclosures(page) {
  for (const detail of await page.locator('[data-setting-disclosure]').all()) {
    if (!await detail.evaluate((node) => node.open)) await detail.locator(':scope > summary').click();
    await expect(detail).toHaveAttribute('open', '');
  }
}

test('DS24-S1 Settings 계정: 섹션 스파인 fill3 · T1 제목 · 안쪽 상자 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/settings.html#account', { waitUntil: 'load' });
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  const colors = await ds24Colors(page);
  await expectSpine(page.locator('#account'), colors.fill3, colors, '#account');
  const h = await ds24Box(page.locator('#hAccount'));
  expect(h.fontSize).toBe('24px');
  expect(h.fontWeight).toBe('300');
  const panel = await ds24Box(page.locator('#driveStoragePanel'));
  expect(panel.leftW).toBe('1px');
  expect(panel.radius).toBe('3px');
  expect(panel.bg).toBe(colors.panelFrosted);
  expect(await page.locator('#btnDriveEnable').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('9999px');
});

test('DS24-S2 Settings 전부 펼침: 필은 섹션마다 최대 1개 · 세그먼트 밑줄 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/settings.html', { waitUntil: 'load' });
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');
  await openAllDisclosures(page);
  const colors = await ds24Colors(page);
  expect(await visiblePills(page, '#account')).toEqual(['btnDriveEnable']);
  expect(await visiblePills(page, '[data-setting-disclosure="advancedData"]')).toEqual(['btnSaveNotionKey']);
  expect(await visiblePills(page)).toEqual(['btnDriveEnable', 'btnSaveNotionKey']);
  for (const sel of ['#btnSyncEnable', '#btnConfirmZip']) {
    expect(await page.locator(sel).evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius), sel).toBe('3px');
  }
  const seg = page.locator('#screen [role="group"]');
  expect(await seg.evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  expect((await ds24Box(seg.locator('button[aria-pressed="true"]'))).bg).toBe(colors.paper);
});

test('DS24-S3 Privacy: 공유 .setSec 스파인 fill3 · 필 0 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/privacy.html', { waitUntil: 'load' });
  const secs = page.locator('section.set-sec');
  await expect(secs).toHaveCount(5);
  const colors = await ds24Colors(page);
  for (let i = 0; i < 5; i++) await expectSpine(secs.nth(i), colors.fill3, colors, `privacy sec ${i}`);
  expect(await visiblePills(page)).toEqual([]);
});

test('DS24-P1 Profile: 계정 카드 스파인 fill3 · guest 필 1 / user 필 0 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/profile.html', { waitUntil: 'load' });
  await page.locator('#profileLoginLink').waitFor();
  const colors = await ds24Colors(page);
  await expectSpine(page.locator('#profileAccount'), colors.fill3, colors, '#profileAccount');
  expect(await visiblePills(page)).toEqual(['profileLoginLink']);

  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/profile.html', { waitUntil: 'load' });
  await page.locator('#profileLogout').waitFor();
  expect(await visiblePills(page)).toEqual([]);
  expect(await page.locator('#profileLogout').evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  await expectSpine(page.locator('#profileNames'), colors.fill3, colors, '#profileNames');
  expect(await page.locator('#profileNamesTitle').evaluate((el) => window.getComputedStyle(el).fontWeight)).toBe('300');
});

test('DS24-D1 다크: 스파인·본체 값 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const dark = () => page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const leftC = (sel) => page.locator(sel).evaluate((el) => window.getComputedStyle(el).borderLeftColor);

  await mockApp(page, { ...STATES.userData, community: false });
  await page.goto('/notes.html', { waitUntil: 'load' });
  await page.locator('#form').waitFor();
  await dark();
  expect(await leftC('#form')).toBe('rgb(236, 236, 228)'); // UF-1: 다크 fill2 화이트

  await mockApp(page, { ...STATES.user, community: false });
  await page.goto('/settings.html#account', { waitUntil: 'load' });
  await expect(page.locator('#btnLogout')).toBeVisible();
  await dark();
  expect(await leftC('#account')).toBe('rgb(108, 125, 114)');
  expect(await page.locator('#btnLogout').evaluate((el) => window.getComputedStyle(el).backgroundColor)).toBe('rgb(32, 32, 30)');

  await mockApp(page, { ...STATES.guest, community: false });
  await page.goto('/progressions.html', { waitUntil: 'load' });
  await page.locator('#progTaste').waitFor();
  await dark();
  expect(await leftC('#progTaste')).toBe('rgb(236, 236, 228)');
});
