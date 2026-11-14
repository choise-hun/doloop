// W-1: 하단 탭 바(≤820px)·위 메뉴 한 줄 — 명세 개발산출물/명세/W-1_구현명세.md
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');

const TAB_LABELS = ['LEARN', 'PRACTICE', 'TRAILS', 'COMMUNITY', 'CHORDS', 'NOTES'];
const TAB_HREFS = ['chords.html', 'practice.html', 'log.html', 'community.html', 'progressions.html', 'notes.html'];

async function open(page, path, width) {
  await page.setViewportSize({ width, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto(path, { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await page.locator('nav[data-tabbar="1"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [390, 768]) {
  test(`W1-1 ${width}px 탭 바: 6칸·순서·화면 바닥 고정`, async ({ page }) => {
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

for (const width of [1280, 390]) {
  test(`DS2-N1 ${width}px 위 메뉴 로고`, async ({ page }) => {
    await open(page, '/privacy.html', width);
    const homeLink = page.locator('nav.site-nav a[href="./"]');
    await expect(homeLink).toHaveCount(1);
    await expect(homeLink).toContainText('HOME');
    expect(await homeLink.getAttribute('aria-current')).toBeNull();

    const logo = homeLink.locator('svg[role="img"][aria-label="RE:DO"]');
    await expect(logo).toHaveCount(1);
    await expect(logo).toBeVisible();
    const box = await logo.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box.height - 16)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.width - 66.56)).toBeLessThanOrEqual(1);
  });
}

test('DS2-N2 홈에서 위 메뉴', async ({ page }) => {
  await open(page, '/index.html', 1280);
  const homeLink = page.locator('nav.site-nav a[href="./"]');
  await expect(homeLink).toHaveCount(1);
  await expect(homeLink).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('nav.site-nav svg[aria-label="RE:DO"]')).toHaveCount(1);
});


// DS-2 3단계: 로고(66.56px + 간격 12px)를 넣은 뒤 위 메뉴가 두 줄이 되던 폭(회귀). layoutSuite 4개 폭(1280·1150·768·390) 사이라 따로 본다.
// 820px 이하는 기능 메뉴가 탭 바로 내려가므로 821px 바로 위와 가장 좁은 폭이 빠듯하다
for (const [stateName, width] of [
  ['guest', 880],
  ['user', 834],
  ['guest', 320],
]) {
  test(`DS2-N3 ${stateName} ${width}px 로고가 있어도 위 메뉴 한 줄`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockApp(page, STATES[stateName]);
    await page.goto('/privacy.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    const top = page.locator('nav.site-nav');
    await top.locator('svg[aria-label="RE:DO"]').waitFor();
    await expect(page.locator('#navAuth')).toHaveAttribute('data-auth-state', stateName === 'user' ? 'signed-in' : 'signed-out');
    await page.evaluate(() => document.fonts.ready);

    const home = await top.locator('a[href="./"]').boundingBox();
    const setting = await top.locator('a[href="settings.html"]').boundingBox();
    const account = await page.locator('#navAuth').boundingBox();
    // 같은 줄: 오른쪽 링크들의 윗선이 홈 링크 아랫선보다 위
    expect(setting.y, 'SETTING이 다음 줄로 내려감').toBeLessThan(home.y + home.height - 0.5);
    expect(account.y, '계정 링크가 다음 줄로 내려감').toBeLessThan(home.y + home.height - 0.5);
    expect((await top.boundingBox()).height).toBeLessThan(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}
