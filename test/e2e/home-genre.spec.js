// 홈 장르 바로가기(G-2): 기본 7개 + `+`, 팝업에서 끄기·순서 변경이 새로고침 후 유지, 깨진 저장값은 기본값, 누르면 플레이어로
// 설계: 개발산출물/진행_홈메뉴장르.md. React 화면 전용(legacy 모드는 skip)
'use strict';
const { test, expect } = require('@playwright/test');

const DEFAULT = ['pop', 'jazz', 'rnb', 'rock', 'jpop', 'ani', 'etc'];

async function openHome(page) {
  await page.route(/youtube\.com|ytimg\.com|doubleclick\.net/, (route) => route.abort());
  await page.goto('/index.html', { waitUntil: 'load' });
  if ((await page.locator('#root').count()) === 0) return false;
  await page.locator('#genreRow').waitFor();
  return true;
}

const shownGenres = (page) => page.locator('#genreRow a[data-genre]').evaluateAll((els) => els.map((e) => e.dataset.genre));

test('G2-1 기본 장르 7개 + 설정 버튼', async ({ page }) => {
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  expect(await shownGenres(page)).toEqual(DEFAULT);
  await expect(page.locator('#genreRow #genreSettingsBtn')).toHaveText('+');
});

test('G2-2 팝업에서 끄기·순서 변경 → 새로고침 후 유지, Esc로 닫힘', async ({ page }) => {
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#genreSettingsBtn').click();
  const pop = page.locator('#genreSettings');
  await expect(pop).toBeVisible();
  // 팝업 체크박스도 파란색 없음(H6 규칙)
  expect(await pop.locator('input').first().evaluate((el) => getComputedStyle(el).accentColor)).not.toMatch(/rgb\(31, 63, 195\)|auto/);
  await pop.locator('li[data-genre="pop"] input[type="checkbox"]').uncheck();
  await pop.getByRole('button', { name: 'ANI 위로' }).click();
  expect(await shownGenres(page)).toEqual(['jazz', 'rnb', 'rock', 'ani', 'jpop', 'etc']);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  await page.reload({ waitUntil: 'load' });
  await page.locator('#genreRow').waitFor();
  expect(await shownGenres(page)).toEqual(['jazz', 'rnb', 'rock', 'ani', 'jpop', 'etc']);
});

test('G2-3 팝업 바깥을 누르면 닫힘', async ({ page }) => {
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#genreSettingsBtn').click();
  await expect(page.locator('#genreSettings')).toBeVisible();
  await page.locator('#weeklyStreakCard h2').click();
  await expect(page.locator('#genreSettings')).toHaveCount(0);
});

test('G2-4 깨진 저장값이면 기본 장르로', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ulp:home-genres', JSON.stringify([{ id: 'nope', on: true }, 'x', { id: 'rock', on: false }, { id: 'rock', on: true }]));
  });
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  // 모르는 장르·잘못된 항목·중복은 버리고, 빠진 장르는 뒤에 켜진 채로 붙인다
  expect(await shownGenres(page)).toEqual(['pop', 'jazz', 'rnb', 'jpop', 'ani', 'etc']);
});

test('G2-4b JSON이 아닌 저장값이면 기본 장르로', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ulp:home-genres', '{not json'));
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  expect(await shownGenres(page)).toEqual(DEFAULT);
});

test('G2-5 장르 버튼 → URL 그대로 플레이어, 고른 장르는 sessionStorage로 전달', async ({ page }) => {
  test.skip(!(await openHome(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#genreRow a[data-genre="jazz"]').click();
  await page.waitForURL(/\/practice\.html$/);
  expect(await page.evaluate(() => sessionStorage.getItem('ulp:open-genre'))).toBe('jazz');
});
