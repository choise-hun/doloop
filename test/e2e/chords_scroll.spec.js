// J-2 소작업 e2e: 390에서 tone 탭 지판을 표시 음 위치로 처음 스크롤
// 설계: 개발산출물/명세/J_소작업명세.md §2
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

test('J2-1: 390폭에서 tone 탭 지판이 표시 음 위치로 처음 스크롤되고 표시 음이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#tone', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#pane-tone').waitFor();
  const scrollBox = page.locator('#tone-board').locator('..');

  // #tone-board의 부모 .scroll의 scrollLeft > 0
  await expect.poll(async () => {
    return await scrollBox.evaluate((el) => el.scrollLeft);
  }).toBeGreaterThan(0);

  // #tone-board 안 표시 음 하나 이상이 상자의 보이는 범위 안
  const visibleDots = await page.evaluate(() => {
    const board = document.getElementById('tone-board');
    if (!board) return 0;
    const scroll = board.parentElement;
    if (!scroll) return 0;
    const scrollRect = scroll.getBoundingClientRect();
    const dots = board.querySelectorAll('g.nd');
    let count = 0;
    for (const dot of dots) {
      const r = dot.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (cx >= scrollRect.left && cx <= scrollRect.right) {
        count++;
      }
    }
    return count;
  });
  expect(visibleDots).toBeGreaterThan(0);
});

test('J2-2: 1280폭에서는 지판이 넘치지 않아 scrollLeft === 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#tone', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#pane-tone').waitFor();
  const scrollBox = page.locator('#tone-board').locator('..');

  const scrollLeft = await scrollBox.evaluate((el) => el.scrollLeft);
  expect(scrollLeft).toBe(0);
});

test('J2-3: 탭을 떠났다 돌아와도 표시 음이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#tone', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#pane-tone').waitFor();
  const box = page.locator('#tone-board').locator('..');

  await expect.poll(() => box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  // 다른 탭으로 갔다가 돌아온다
  await page.locator('#tab-matrix').click();
  await page.locator('#tab-tone').click();

  // 복귀 후에도 poll로 대기 (rAF 때문에 즉시 단언 금지)
  await expect.poll(() => box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  const visible = await page.evaluate(() => {
    const board = document.getElementById('tone-board');
    if (!board) return 0;
    const scroll = board.parentElement;
    if (!scroll) return 0;
    const scrollRect = scroll.getBoundingClientRect();
    const dots = board.querySelectorAll('g.nd');
    let count = 0;
    for (const dot of dots) {
      const r = dot.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (cx >= scrollRect.left && cx <= scrollRect.right) {
        count++;
      }
    }
    return count;
  });
  expect(visible).toBeGreaterThan(0);
});
