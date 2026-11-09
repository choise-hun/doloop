// 코드 연습 화면 정렬 검사 (FT-2): 공통 검사 G0~G8, 탭 8개 × 4폭. 로그인과 무관한 화면이라 guest만
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
// FT-3-chords: tf 탭 다이어그램 넘침(F1·F2)을 고쳐 알려진 실패(known) 없음 — 결과/FT-3-chords_정렬수정.md
'use strict';
const { layoutSuite } = require('../support/layout-check');
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');

// CH-A: 기존 8탭 공통 검사에 변경되는 화면 계약을 추가한다.
for (const width of [390, 768, 1150, 1280]) {
  test(`CH-A 선택기 배치·모양 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, STATES.guest);
    await page.goto('/chords.html#scale');
    await expect(page.locator('#sc-board svg')).toBeVisible();
    await expect(page.locator('#sc-seq, [class*="seqSummary"]')).toHaveCount(0);
    const geometry = await page.locator('#sc-block').evaluate((el) => {
      const field = el.parentElement;
      const board = document.querySelector('#sc-board').parentElement;
      const legend = field.nextElementSibling;
      const rect = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return {
        samePanel: board.parentElement === field.parentElement,
        followsBoard: field.previousElementSibling === board,
        precedesLegend: legend.className.includes('legend'),
        board: rect(board), field: rect(field), legend: rect(legend),
        buttons: [...el.querySelectorAll('button')].map((b) => {
          const s = getComputedStyle(b);
          return { radius: s.borderTopLeftRadius, border: s.borderTopWidth, height: b.getBoundingClientRect().height };
        }),
      };
    });
    expect(geometry.samePanel).toBe(true);
    expect(geometry.followsBoard).toBe(true);
    expect(geometry.precedesLegend).toBe(true);
    expect(geometry.field.top).toBeGreaterThanOrEqual(geometry.board.bottom);
    expect(geometry.legend.top).toBeGreaterThanOrEqual(geometry.field.bottom);
    for (const edge of ['left', 'right']) {
      expect(Math.abs(geometry.board[edge] - geometry.field[edge])).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.legend[edge] - geometry.field[edge])).toBeLessThanOrEqual(1);
    }
    expect(geometry.buttons).toHaveLength(6);
    for (const button of geometry.buttons) {
      expect(button.radius).toBe('0px');
      expect(button.border).toBe('1px');
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#sc-block')).toHaveAttribute('role', 'group');
    await expect(page.locator('#sc-block')).toHaveAccessibleName(/CAGED/);
    // 좁은 화면의 고정 하단 내비게이션 아래에서도 각 선택에 도달할 수 있다.
    const buttons = page.locator('#sc-block button');
    for (let i = 0; i < 6; i++) {
      await buttons.nth(i).click();
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
    }
  });
}

for (const tab of ['scale', 'tone', 'matrix', 'circle', 'reint', 'tf', 'ds', 'prog']) {
  layoutSuite({
    name: `chords-${tab}`,
    path: `/chords.html#${tab}`,
    states: ['guest'],
    ready: async (page) => {
      await page.locator(`#pane-${tab}`).waitFor();
    },
    dark: tab === 'scale' ? 'guest' : undefined,
  });
}

for (const lang of ['en', 'ja']) {
  layoutSuite({
    name: `chords-scale-${lang}`,
    path: '/chords.html#scale',
    states: [{ name: 'guest', mock: { ...STATES.guest, local: { 'ulp:lang': lang } } }],
    widths: [1280, 768, 390],
    ready: async (page) => {
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('#sc-block button')).toHaveCount(6);
    },
  });
}

for (const state of ['unsupported', 'circle']) {
  layoutSuite({
    name: `chords-scale-${state}`,
    path: '/chords.html#scale',
    states: ['guest'],
    ready: async (page) => {
      await page.locator('#sc-board svg').waitFor();
      if (state === 'unsupported') {
        await page.locator('#sc-type').selectOption('harmMinor');
        await expect(page.locator('#sc-block-msg')).toBeVisible();
      } else {
        await page.locator('#sc-mode button').nth(1).click();
        await expect(page.locator('#sc-circle')).toBeVisible();
      }
    },
  });
}
