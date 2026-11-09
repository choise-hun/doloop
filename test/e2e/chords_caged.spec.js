'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

async function openScale(page) {
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#scale');
  await expect(page.locator('#sc-board svg')).toBeVisible();
}

test('CH-A 전체·5블럭과 미지원 스케일 폴백·복귀', async ({ page }) => {
  await openScale(page);
  const buttons = page.locator('#sc-block button');
  const forms = [];
  for (let i = 0; i < 5; i++) {
    await buttons.nth(i).click();
    await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sc-board .blk'), `block ${i}`).toHaveCount(1);
    await expect(page.locator('#sc-board .press').first()).toBeVisible();
    await expect(page.locator('#sc-board .lowestRoot')).toHaveCount(1);
    forms.push(await page.locator('#sc-board').innerHTML());
  }
  expect(new Set(forms).size).toBe(5);
  await buttons.nth(5).focus();
  await page.keyboard.press('Enter');
  await expect(buttons.nth(5)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sc-board .blk, #sc-board .press, #sc-board .ctx')).toHaveCount(0);
  await buttons.nth(3).click();
  for (const scale of ['harmMinor', 'melMinor']) {
    await page.locator('#sc-type').selectOption(scale);
    await expect(buttons.nth(5)).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 5; i++) await expect(buttons.nth(i)).toBeDisabled();
    await expect(page.locator('#sc-block-msg')).toBeVisible();
    await expect(page.locator('#sc-board .blk')).toHaveCount(0);
  }
  await page.locator('#sc-type').selectOption('major');
  await expect(buttons.nth(3)).toBeEnabled();
  await expect(buttons.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sc-block-msg')).toBeHidden();
  await page.locator('#tab-tone').click();
  await expect(page.locator('#tone-seq .seqn').first()).toBeVisible();
});

for (const tuning of ['g6', 'b4']) {
  test(`CH-A ${tuning} 재생·현재음·정지·탭 이탈`, async ({ page }) => {
    // 실제 AudioContext 동작을 보존하고 oscillator 시작만 관찰한다.
    await page.addInitScript(() => {
      window.__audioStarts = 0;
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) {
        const osc = original.apply(this, args);
        const start = osc.start.bind(osc);
        osc.start = (...values) => { window.__audioStarts++; return start(...values); };
        return osc;
      };
    });
    await page.clock.install();
    await openScale(page);
    if (tuning === 'b4') await page.locator('#sc-inst-chips button').nth(2).click();
    await page.locator('#sc-play').click();
    await page.clock.runFor(400);
    await expect(page.locator('#sc-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sc-board g.nd.now')).toHaveCount(1);
    expect(await page.evaluate(() => window.__audioStarts)).toBeGreaterThan(0);
    await page.locator('#sc-play').click();
    await expect(page.locator('#sc-board g.nd.now')).toHaveCount(0);
    await expect(page.locator('#sc-play')).toHaveAttribute('aria-pressed', 'false');
    const stopped = await page.evaluate(() => window.__audioStarts);
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => window.__audioStarts)).toBe(stopped);
    await page.locator('#sc-play').click();
    await page.clock.runFor(400);
    await expect(page.locator('#sc-board g.nd.now')).toHaveCount(1);
    await page.locator('#tab-tone').click();
    const left = await page.evaluate(() => window.__audioStarts);
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => window.__audioStarts)).toBe(left);
    await page.locator('#tab-scale').click();
    await expect(page.locator('#sc-board g.nd.now')).toHaveCount(0);
    await expect(page.locator('#sc-play')).toHaveAttribute('aria-pressed', 'false');
  });
}
