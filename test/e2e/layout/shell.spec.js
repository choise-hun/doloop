// W-1: 하단 탭 바(≤820px)·위 메뉴 한 줄 — 명세 개발산출물/명세/W-1_구현명세.md
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');

const TAB_LABELS = ['LEARN', 'PLAY', 'TRAILS', 'CHORDS', 'NOTES'];
const TAB_HREFS = ['chords.html', 'practice.html', 'log.html', 'progressions.html', 'notes.html'];

async function open(page, path, width) {
  await page.setViewportSize({ width, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto(path, { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await page.locator('nav[data-tabbar="1"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [390, 768]) {
  test(`W1-1 ${width}px 탭 바: 5칸·순서·화면 바닥 고정`, async ({ page }) => {
    await open(page, '/privacy.html', width);
    const bar = page.locator('nav[data-tabbar="1"]');
    await expect(bar).toBeVisible();
    await expect(bar.locator('a, span')).toHaveText(TAB_LABELS);
    const box = await bar.boundingBox();
    expect(Math.abs(box.y + box.height - 800)).toBeLessThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(56);
  });

  test(`W1-2 ${width}px 위 메뉴 한 줄·기능 메뉴 숨김·계정 보임`, async ({ page }) => {
    await open(page, '/privacy.html', width);
    const top = page.locator('nav.site-nav');
    for (const label of TAB_LABELS) await expect(top.getByText(label, { exact: true })).toBeHidden();
    await expect(page.locator('#navAuth')).toBeVisible();
    const h = (await top.boundingBox()).height;
    expect(h).toBeLessThan(64);
  });

  test(`W1-5 ${width}px 끝까지 내리면 푸터가 탭 바 위에 보임`, async ({ page }) => {
    await open(page, '/privacy.html', width);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const foot = await page.locator('footer').last().boundingBox();
    const bar = await page.locator('nav[data-tabbar="1"]').boundingBox();
    expect(foot.y + foot.height).toBeLessThanOrEqual(bar.y - 16);
  });
}

for (const width of [1150, 1280]) {
  test(`W1-3 ${width}px 탭 바 없음·위 메뉴에 기능 메뉴`, async ({ page }) => {
    await open(page, '/privacy.html', width);
    await expect(page.locator('nav[data-tabbar="1"]')).toBeHidden();
    const top = page.locator('nav.site-nav');
    for (const label of TAB_LABELS) await expect(top.getByText(label, { exact: true })).toBeVisible();
  });
}

test('W1-4 390px 현재 화면 탭만 aria-current', async ({ page }) => {
  await open(page, '/chords.html', 390);
  const bar = page.locator('nav[data-tabbar="1"]');
  await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(bar.locator('[aria-current="page"]')).toHaveText('LEARN');
});

test('W1-6 탭 바 링크 = 위 메뉴 링크', async ({ page }) => {
  await open(page, '/privacy.html', 390);
  const hrefs = await page.locator('nav[data-tabbar="1"] a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual(TAB_HREFS);
});

