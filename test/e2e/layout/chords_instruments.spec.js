'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');
const { layoutSuite } = require('../support/layout-check');

test('CH-B 악기 전환은 지원 탭과 튜닝을 첫 렌더부터 정규화한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#ds');
  await page.locator('#instrument-bass').click();
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute('id', 'tab-scale');
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await expect(page.locator('#instrument-tuning')).toHaveValue('b4');
  await page.locator('#instrument-settings summary').click();
  for (const tuning of ['b4', 'b5', 'b6']) {
    await page.locator('#instrument-tuning').selectOption(tuning);
    await page.locator('#tab-tone').click();
    await expect(page.locator('#tone-board svg')).toHaveAttribute('data-strings', tuning.slice(1));
    await expect(page.locator('#tone-seq .seqn')).toHaveCount(Number(tuning.slice(1)) * 2);
  }
  await page.locator('#instrument-keyboard').click();
  await expect(page.locator('[role="tab"]')).toHaveCount(5);
  await expect(page.locator('#tab-matrix, #tab-circle, #tab-ds')).toHaveCount(0);
  await expect(page.locator('#tone-board svg')).toHaveAttribute('data-keyboard', 'true');
  await page.locator('#tab-tone').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-reint')).toBeFocused();
  await expect(page.locator('#tab-reint')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#tab-tone').click();
  await page.locator('#instrument-guitar').click();
  await expect(page.locator('[role="tab"]')).toHaveCount(8);
  await expect(page.locator('#instrument-tuning')).toHaveValue('g6');
  await page.locator('#instrument-settings summary').click();
  await page.locator('#instrument-tuning').selectOption('g7');
  await expect(page.locator('#tone-board svg')).toHaveAttribute('data-strings', '7');
  await page.locator('#instrument-bass').click();
  await page.evaluate(() => { location.hash = '#ds'; });
  await expect(page).toHaveURL(/#scale$/);
  await expect(page.locator('#pane-ds, #pane-prog, #pane-matrix')).toHaveCount(0);
  await page.locator('#instrument-guitar').click();
  await expect(page.locator('#instrument-tuning')).toHaveValue('g7');
  await page.locator('#tab-ds').click();
  await expect(page.locator('#ds-board svg')).toHaveAttribute('data-strings', '7');
  expect(errors).toEqual([]);
});

for (const instrument of ['bass', 'keyboard']) {
  for (const tab of instrument === 'bass' ? ['scale', 'tone'] : ['scale', 'tone', 'reint', 'tf', 'prog']) {
    layoutSuite({
      name: `ch-b-${instrument}-${tab}`,
      path: `/chords.html#${tab}`,
      states: ['guest'],
      ready: async (page) => {
        await page.locator(`#instrument-${instrument}`).click();
        await page.locator(`#tab-${tab}`).click();
        await expect(page.locator(`#pane-${tab}`)).toBeVisible();
        if (instrument === 'keyboard' && tab !== 'prog') {
          await expect(page.locator(`#pane-${tab} svg[data-keyboard]`).first()).toBeVisible();
        }
      },
      dark: instrument === 'keyboard' && tab === 'scale' ? 'guest' : undefined,
    });
  }
}

for (const state of ['progression', 'empty-reint']) {
  layoutSuite({
    name: `ch-b-keyboard-${state}`,
    path: state === 'progression' ? '/chords.html#prog?c=C%2FE,Dm7,G7' : '/chords.html#reint',
    states: ['guest'],
    ready: async (page) => {
      await page.locator('#instrument-keyboard').click();
      if (state === 'progression') await expect(page.locator('#pp-boxes svg')).toHaveCount(3);
      else { await page.locator('#ri-clear').click(); await expect(page.locator('#ri-board [data-pressed="true"]')).toHaveCount(0); }
    },
  });
}

// ---- UXR-2: 악기 버튼군·접이식 설정·스케일 행·재해석 2열 ----
const rectOf = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
});
const visible = (page, selector) => page.locator(selector).first().isVisible();

test.describe('UXR-2', () => {
  for (const width of [390, 768, 1150]) {
    for (const lang of ['ko', 'en', 'ja']) {
      test(`UXR2-1 악기 버튼군 ${width} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockApp(page, { ...STATES.guest, local: { 'ulp:lang': lang } });
        await page.goto('/chords.html#scale');
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        const rects = [];
        for (const kind of ['guitar', 'bass', 'keyboard']) {
          const r = await rectOf(page, `#instrument-${kind}`);
          expect(r.height).toBeGreaterThanOrEqual(44);
          expect(r.width).toBeGreaterThanOrEqual(72);
          rects.push(r);
        }
        for (let i = 1; i < rects.length; i++) {
          expect(Math.abs(rects[i].top - rects[0].top)).toBeLessThanOrEqual(1);
          expect(rects[i].left).toBeGreaterThanOrEqual(rects[i - 1].right - 0.5);
        }
        await expect(page.locator('#instrument-kind button[aria-pressed="true"]')).toHaveCount(1);
        const overflow = await page.locator('#instrument-kind').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflow).toBe(false);
      });
    }
  }

  test('UXR2-2 설정 접힘', async ({ page }) => {
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    expect(await page.locator('#instrument-settings').evaluate((el) => el.open)).toBe(false);
    await expect(page.locator('#instrument-settings-summary')).toContainText('·');
    await expect(page.locator('#instrument-tuning')).toBeHidden();
    await page.locator('#instrument-keyboard').focus();
    const reached = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => document.activeElement && document.activeElement.id));
    }
    expect(reached).not.toContain('instrument-tuning');
    await page.locator('#instrument-settings summary').click();
    await expect(page.locator('#instrument-tuning')).toBeVisible();
  });

  test('UXR2-3 튜닝 순환', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    await page.locator('#instrument-settings summary').click();
    await page.locator('#instrument-tuning').selectOption('g7');
    await page.locator('#instrument-bass').click();
    await expect(page.locator('#instrument-tuning')).toHaveValue('b4');
    await page.locator('#instrument-guitar').click();
    await expect(page.locator('#instrument-tuning')).toHaveValue('g7');
    await page.locator('#instrument-keyboard').click();
    await expect(page.locator('#instrument-settings')).toHaveCount(0);
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('UXR2-4 hidden 실효', async ({ page }) => {
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    expect(await visible(page, '#sc-row-circle')).toBe(false);
    expect(await visible(page, '#sc-circle-opts')).toBe(false);
    await expect(page.locator('#sc-hand')).toBeVisible();
    await page.locator('#sc-mode button').nth(1).click();
    await expect(page.locator('#sc-row-circle')).toBeVisible();
    await expect(page.locator('#sc-dir')).toBeVisible();
    await expect(page.locator('#sc-bars')).toBeVisible();
    await page.locator('#instrument-keyboard').click();
    await expect(page.locator('#sc-hand')).toBeHidden();
  });

  test('UXR2-5 스케일 정렬 1150', async ({ page }) => {
    await page.setViewportSize({ width: 1150, height: 900 });
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    for (const sel of ['#sc-root', '#sc-type', '#sc-bpm', '#sc-play']) {
      expect((await rectOf(page, sel)).height).toBeGreaterThanOrEqual(44);
    }
    const bpm = await rectOf(page, '#sc-bpm');
    const label = await page.locator('#sc-rootonly').evaluate((el) => {
      const r = el.closest('label').getBoundingClientRect();
      return { c: (r.top + r.bottom) / 2, h: r.height };
    });
    expect(label.h).toBeGreaterThanOrEqual(44);
    expect(Math.abs(label.c - (bpm.top + bpm.bottom) / 2)).toBeLessThanOrEqual(2);
    const a = await rectOf(page, '#sc-root');
    const b = await rectOf(page, '#sc-type');
    expect(Math.abs(a.bottom - b.bottom)).toBeLessThanOrEqual(1);
  });

  test('UXR2-6 재생 유지', async ({ page }) => {
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    await page.locator('#sc-bpm').fill('90');
    await expect(page.locator('#sc-bpm')).toHaveValue('90');
    await expect(page.locator('#sc-status')).not.toBeEmpty();
    await page.locator('#sc-play').click();
    await expect(page.locator('#sc-play')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#sc-play').click();
    await expect(page.locator('#sc-play')).toHaveAttribute('aria-pressed', 'false');
  });

  for (const [width, twoCols] of [[1024, true], [1023, false], [768, false], [767, false]]) {
    test(`UXR2-7 재해석 열 ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApp(page, STATES.guest);
      await page.goto('/chords.html#reint');
      if (process.env.LAYOUT_SHOTS === '1' && (width === 1023 || width === 1024)) {
        await page.screenshot({ path: `test-results/layout-shots/chords-reint-guest-${width}.png`, fullPage: true });
      }
      const [main, quiz] = await page.locator('[data-align-group^="reintPanels"]').evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }));
      if (twoCols) {
        expect(Math.abs(main.top - quiz.top)).toBeLessThanOrEqual(1);
        expect(main.right).toBeLessThanOrEqual(quiz.left + 1);
      } else {
        expect(quiz.top).toBeGreaterThanOrEqual(main.bottom - 1);
      }
      const cards = await page.locator('#ri-swap figure').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      expect(cards.length).toBe(3);
      if (width >= 768) {
        expect(Math.abs(cards[0].top - cards[2].top)).toBeLessThanOrEqual(1);
        expect(Math.abs(cards[0].width - cards[1].width)).toBeLessThanOrEqual(1);
      } else {
        expect(cards[1].top).toBeGreaterThan(cards[0].bottom - 1);
      }
      const opts = await page.locator('#qz-opts button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      expect(opts.length).toBeGreaterThanOrEqual(2);
      if (width >= 768) expect(Math.abs(opts[0].top - opts[1].top)).toBeLessThanOrEqual(1);
      else expect(opts[1].top).toBeGreaterThan(opts[0].bottom - 1);
    });
  }

  test('UXR2-8 퀴즈 1회 채점', async ({ page }) => {
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#reint');
    await expect(page.locator('#qz-opts button').first()).toBeEnabled();
    await page.locator('#qz-opts button').first().click();
    await expect(page.locator('#qz-fb')).toBeVisible();
    await expect(page.locator('#qz-score')).toContainText('/ 1');
    await expect(page.locator('#qz-opts button').first()).toBeDisabled();
    await page.locator('#qz-next').click();
    await expect(page.locator('#qz-opts button').first()).toBeEnabled();
    await expect(page.locator('#qz-score')).toContainText('/ 1');
  });
});
