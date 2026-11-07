// M2-1a: AI 기능 BETA 배지·안내 문구 — 명세 개발산출물/명세/M2-1a_구현명세.md §6
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');

const NOTICE_HEAD = 'AI 분석(Beta)은 영상의 음향·화질에 따라';
const PRO = {
  ...STATES.user,
  me: { tier: 'pro', billingTier: 'pro', limits: { ...DEFAULT_ME.limits, ai: true }, credits: { monthly: 30, purchased: 0 } },
};

async function open(page, path, width, state) {
  await page.setViewportSize({ width, height: 900 });
  await mockApp(page, state);
  await page.goto(path, { waitUntil: 'load' });
  return (await page.locator('#root').count()) > 0;
}

test('B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내', async ({ page }) => {
  test.skip(!(await open(page, '/notes.html', 1280, STATES.user)), 'legacy 모드: React 화면 아님');
  const navBadge = page.locator('nav[aria-label="사이트"] a[href="notes.html"] [data-beta]');
  await expect(navBadge).toBeVisible();
  await expect(navBadge).toHaveText('BETA');
  await expect(page.locator('h1.page-title + [data-beta]')).toHaveText('BETA');
  await expect(page.locator('#notesBetaNotice')).toContainText(NOTICE_HEAD);
  // 다른 메뉴에는 배지가 없다
  await expect(page.locator('nav[aria-label="사이트"] [data-beta]')).toHaveCount(1);
});

test('B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임', async ({ page }) => {
  test.skip(!(await open(page, '/notes.html', 390, STATES.guest)), 'legacy 모드: React 화면 아님');
  await expect(page.locator('[data-tabbar] [data-beta]')).toHaveCount(0);
  await expect(page.locator('h1.page-title + [data-beta]')).toBeVisible();
  await expect(page.locator('#notesBetaNotice')).toBeVisible();
  // 안내는 버튼 아래·메시지 위
  const submit = await page.locator('#submit').boundingBox();
  const notice = await page.locator('#notesBetaNotice').boundingBox();
  expect(notice.y).toBeGreaterThanOrEqual(submit.y + submit.height);
});

test('B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내', async ({ page }) => {
  test.skip(!(await open(page, '/progressions.html', 1280, PRO)), 'legacy 모드: React 화면 아님');
  await page.locator('#progAddBtn').click();
  await expect(page.locator('#progTab-video [data-beta]')).toHaveText('BETA');
  await expect(page.locator('#progTab-manual [data-beta]')).toHaveCount(0);
  await page.locator('#progTab-video').click();
  await expect(page.locator('#progBetaNotice')).toContainText(NOTICE_HEAD);
  await page.evaluate(() => document.fonts.ready);
  const submit = await page.locator('#progVideoSubmit').boundingBox();
  const notice = await page.locator('#progBetaNotice').boundingBox();
  expect(notice.y).toBeGreaterThanOrEqual(submit.y + submit.height);
});

test('B4 탭 이름 접근성: 영상 탭 이름에 BETA가 붙어도 탭은 하나로 찾힌다', async ({ page }) => {
  test.skip(!(await open(page, '/progressions.html', 390, PRO)), 'legacy 모드: React 화면 아님');
  await page.locator('#progAddBtn').click();
  await expect(page.getByRole('tab', { name: /코드 진행 영상/ })).toHaveCount(1);
});
