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
