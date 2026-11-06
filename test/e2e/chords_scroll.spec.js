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

test('J2-3: 사용자가 직접 스크롤한 뒤에는 같은 toneNotes에서 다시 움직이지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#tone', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#pane-tone').waitFor();
  const scrollBox = page.locator('#tone-board').locator('..');

  await expect.poll(async () => {
    return await scrollBox.evaluate((el) => el.scrollLeft);
  }).toBeGreaterThan(0);

  // 사용자 제스처 이벤트(wheel) 후 수동 스크롤
  await scrollBox.dispatchEvent('wheel');
  await scrollBox.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await scrollBox.dispatchEvent('scroll');

  // 리렌더링 유발 (tonePlay 클릭)
  await page.locator('#tone-play').click();

  // 사용자 조작 후에는 scrollLeft가 0으로 유지됨
  const scrollLeftAfter = await scrollBox.evaluate((el) => el.scrollLeft);
  expect(scrollLeftAfter).toBe(0);

  // 정리를 위해 다시 클릭하여 정지
  await page.locator('#tone-play').click();
});
