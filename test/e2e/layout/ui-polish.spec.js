// UI 다듬기(2026-11-15): 커뮤니티 숨김 · PLAYER 메뉴 이름 · 로고↔HOME 간격 · 플레이어 재생:녹음 10:2 · 제목 세로 가운데
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');

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
  await expect(bar.locator('a, span')).toHaveText(['LEARN', 'PLAYER', 'TRAILS', 'CHORDS', 'NOTES']);
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

for (const width of [1280, 1150]) {
  test(`UP-4: 플레이어 재생 카드 : 녹음 카드 ≈ 10 : 2, 같은 윗선 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, { ...STATES.user, community: false });
    await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
    await page.locator('#ppRecCard').waitFor();
    const r = await page.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect();
      return { play: b('#ppPlayCard'), rec: b('#ppRecCard'), recBtn: b('#recBtn') };
    });
    expect(Math.abs(r.play.top - r.rec.top)).toBeLessThanOrEqual(1);
    const ratio = r.play.width / r.rec.width;
    expect(ratio).toBeGreaterThan(3.5); // 녹음 최소 폭(150px) 때문에 좁은 폭에서는 5보다 작을 수 있다
    expect(ratio).toBeLessThanOrEqual(5.2);
    expect(r.recBtn.right).toBeLessThanOrEqual(r.rec.right); // 녹음 버튼이 카드 밖으로 넘치지 않는다
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
