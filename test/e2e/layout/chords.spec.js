// 코드 연습 화면 정렬 검사 (FT-2): 공통 검사 G0~G8, 탭 8개 × 4폭. 로그인과 무관한 화면이라 guest만
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
// FT-3-chords: tf 탭 다이어그램 넘침(F1·F2)을 고쳐 알려진 실패(known) 없음 — 결과/FT-3-chords_정렬수정.md
'use strict';
const { layoutSuite } = require('../support/layout-check');
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('../support/mock-app');
const { pickOption, expectValue } = require('../support/app-select');

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
      expect(button.radius).toBe('3px'); // DS2-3: 블록 3px
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
        await pickOption(page, 'sc-type', 'harmMinor');
        await expect(page.locator('#sc-block-msg')).toBeVisible();
      } else {
        await page.locator('#sc-mode button').nth(1).click();
        await expect(page.locator('#sc-circle')).toBeVisible();
      }
    },
  });
}

// DS2-3: Chords 4:6 전환 — 스파인 fill3·T1 제목·탭 종이+밑줄·패널 필 1개(.playbtn)
async function chTokens(page) {
  return page.evaluate(() => {
    const read = (prop, val) => {
      const el = document.createElement('span');
      el.style[prop] = val;
      document.body.appendChild(el);
      const out = window.getComputedStyle(el)[prop];
      el.remove();
      return out;
    };
    return {
      fill3: read('color', 'var(--fill3)'),
      paper: read('backgroundColor', 'var(--paper)'),
      cream: read('backgroundColor', 'var(--cream)'),
      inkStrong: read('color', 'var(--ink-strong)'),
      accent: read('backgroundColor', 'var(--accent)'),
      wood: read('color', 'var(--wood)'),
    };
  });
}
// 보이는 a·button 중 필(9999px) 목록
async function chPills(page, scope) {
  return page.locator(scope).evaluate((root) => [...root.querySelectorAll('a, button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && window.getComputedStyle(el).borderTopLeftRadius === '9999px';
  }).map((el) => el.id || el.textContent.trim().slice(0, 20)));
}
// 요소의 가장 가까운 스파인 카드 조상(왼쪽 테두리 12px)
async function chCardOf(page, sel) {
  return page.locator(sel).first().evaluate((el) => {
    let n = el.parentElement;
    while (n && n.tagName !== 'SECTION') {
      if (parseFloat(window.getComputedStyle(n).borderLeftWidth) > 1) break;
      n = n.parentElement;
    }
    const s = window.getComputedStyle(n);
    return { tag: n.tagName, left: s.borderLeftWidth, leftColor: s.borderLeftColor, radius: s.borderTopLeftRadius };
  });
}

test('DS23-C1 스파인·T1 제목 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#scale');
  await expect(page.locator('#sc-board svg')).toBeVisible();
  const tk = await chTokens(page);
  const card = await chCardOf(page, '#sc-board');
  expect(card.left).toBe('12px');
  expect(card.leftColor).toBe(tk.fill3);
  expect(card.radius).toBe('3px');
  const h1 = await page.locator('h1').first().evaluate((el) => ({ w: getComputedStyle(el).fontWeight, f: getComputedStyle(el).fontSize }));
  expect(h1).toEqual({ w: '300', f: '24px' });
  const sc = await page.locator('#sc-title').evaluate((el) => ({ w: getComputedStyle(el).fontWeight, f: getComputedStyle(el).fontSize }));
  expect(sc).toEqual({ w: '300', f: '24px' });
});

test('DS23-C2 탭 종이+밑줄·셀렉트 3px·스케일 패널 필 1개 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#scale');
  await expect(page.locator('#sc-board svg')).toBeVisible();
  const tk = await chTokens(page);
  const tabs = page.locator('[role="tablist"] [role="tab"]');
  await expect(tabs).toHaveCount(8);
  for (const tab of await tabs.all()) {
    const st = await tab.evaluate((el) => ({ r: getComputedStyle(el).borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor, sh: getComputedStyle(el).boxShadow, sel: el.getAttribute('aria-selected') }));
    expect(st.r).toBe('3px');
    if (st.sel === 'true') {
      expect(st.bg).toBe(tk.paper);
      expect(st.sh).toContain(tk.inkStrong);
    } else {
      expect(st.bg).toBe(tk.cream);
    }
  }
  expect(await page.locator('#sc-type').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  expect(await chPills(page, '#pane-scale')).toHaveLength(1);
});

test('DS23-C3 재해석·찾기·진행 패널마다 필 1개, .btn 사각 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#reint');
  const tk = await chTokens(page);
  for (const tab of ['reint', 'tf', 'prog']) {
    await page.locator(`#tab-${tab}`).click();
    await expect(page.locator(`#pane-${tab}`)).toBeVisible();
    // 찾기 탭은 진입 시 자동 검색(runTfSearch, 20ms 뒤 결과)한다 → 검색 전 상태는 타이밍 경합이라 단언하지 않는다.
    // 자동 검색 결과의 재생(#a-vplay)이 보인 뒤, 다시 검색해도 필은 #a-vplay 1개
    if (tab === 'tf') {
      await expect(page.locator('#a-vplay')).toBeVisible();
      await page.locator('#a-go').click();
      await expect(page.locator('#a-vplay')).toBeVisible();
    }
    // 진행 연주 빈 상태는 재생 버튼이 없다(입력 확인 .btn만 사각) → 0개, 진행을 받으면 #pp-play 1개
    if (tab === 'prog') {
      expect(await chPills(page, '#pane-prog'), 'prog 빈 상태').toEqual([]);
      await page.goto('/chords.html#prog?c=C%2CG%2CAm%2CF');
      await expect(page.locator('#pp-play')).toBeVisible();
    }
    expect(await chPills(page, `#pane-${tab}`), tab).toHaveLength(1);
  }
  await page.locator('#tab-tf').click();
  const go = await page.locator('#a-go').evaluate((el) => ({ r: getComputedStyle(el).borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor }));
  expect(go).toEqual({ r: '3px', bg: tk.cream });
  await page.locator('#tab-reint').click();
  const next = page.locator('#qz-next');
  if (await next.isVisible()) {
    expect(await next.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('3px');
  }
  // 건반: #ri-keyboard-toggle 눌림 = 먹색 채움
  await page.locator('#instrument-keyboard').click();
  await page.locator('#tab-reint').click();
  const toggle = page.locator('#ri-keyboard-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(tk.accent);
  expect(await chPills(page, '#pane-reint')).toHaveLength(1);
});

test('DS23-C4 다크: 스파인 fill3 다크 값, 지판 나무 토큰 그대로 (1280)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#scale');
  await expect(page.locator('#sc-board svg')).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const card = await chCardOf(page, '#sc-board');
  expect(card.leftColor).toBe('rgb(108, 125, 114)');
  const tk = await chTokens(page);
  const wood = await page.locator('#sc-board svg.fb .wood').first().evaluate((el) => getComputedStyle(el).fill);
  expect(wood).toBe(tk.wood);
});

// DS23-C5 (사용자 추가 요구 2026-11-19): 지판·코드 박스의 모든 음 원이 칸 중앙에 있는지 렌더 좌표로 검사한다.
// 가로 지판(svg.fb): 원 중심 y = 줄 선(line.str) y, 프렛 음 x = 양옆 프렛 선(line.fret/.nut) 가운데, 개방현 점은 너트 바깥 칸 안.
// 인레이(circle.inlay)는 프렛 가운데·두 줄 사이 가운데. 세로 코드 박스(svg.cb): x = 줄 선(line.st), y = 양옆 프렛 선(line.fl/.nut) 가운데.
const CENTER_TOL = 0.5;
async function diagramCenterIssues(page, scope) {
  return page.locator(scope).evaluate((root, tol) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const cx = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const cy = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const between = (sorted, v) => {
      let lo = null; let hi = null;
      for (const p of sorted) { if (p <= v) lo = p; else if (hi === null) hi = p; }
      return { lo, hi };
    };
    const nearest = (arr, v) => arr.reduce((b, p) => (Math.abs(p - v) < Math.abs(b - v) ? p : b), arr[0]);
    const issues = [];
    let dots = 0;
    const desc = (svg, el) => `${svg.getAttribute('aria-label') || svg.className.baseVal}: ${el.parentElement.getAttribute('class') || el.getAttribute('class') || 'circle'}`;
    for (const svg of root.querySelectorAll('svg.fb, svg.cb')) {
      if (!visible(svg)) continue;
      const box = svg.classList.contains('cb');
      const strings = [...svg.querySelectorAll(box ? 'line.st' : 'line.str')].map(box ? cx : cy).sort((a, b) => a - b);
      const frets = [...svg.querySelectorAll(box ? 'line.fl, line.nut' : 'line.fret, line.nut')].map(box ? cy : cx).sort((a, b) => a - b);
      const nutEl = svg.querySelector('line.nut');
      const nut = nutEl ? (box ? cy(nutEl) : cx(nutEl)) : null;
      const strEls = [...svg.querySelectorAll(box ? 'line.st' : 'line.str')];
      const strStart = box ? null : Math.min(...strEls.map((e) => e.getBoundingClientRect().left));
      const strEnd = box ? null : Math.max(...strEls.map((e) => e.getBoundingClientRect().right));
      for (const c of svg.querySelectorAll('circle')) {
        if (c.classList.contains('lr-ring')) continue;
        const along = box ? cy(c) : cx(c); // 프렛 방향
        const across = box ? cx(c) : cy(c); // 줄 방향
        const inlay = c.classList.contains('inlay');
        const open = c.classList.contains('open');
        dots += 1;
        if (inlay) {
          const s = between(strings, across);
          if (s.lo === null || s.hi === null || Math.abs(across - (s.lo + s.hi) / 2) > tol) issues.push(`${desc(svg, c)} 인레이 줄 사이 중앙 아님 (${across.toFixed(2)} vs ${s.lo}~${s.hi})`);
        } else {
          const s = nearest(strings, across);
          if (Math.abs(across - s) > tol) issues.push(`${desc(svg, c)} 줄 선에서 벗어남 ${(across - s).toFixed(2)}px`);
        }
        if (open) continue; // 코드 박스 개방현 표시(너트 위 작은 원)는 줄 위만 본다
        const f = between(frets, along);
        if (f.lo !== null && f.hi !== null) {
          const mid = (f.lo + f.hi) / 2;
          if (Math.abs(along - mid) > tol) issues.push(`${desc(svg, c)} 프렛 칸 중앙에서 ${(along - mid).toFixed(2)}px`);
        } else if (!box) {
          // 너트 바깥(개방현) 칸: 줄 선 시작 ~ 너트 사이 중앙
          const edge = f.lo === null ? strStart : strEnd;
          const fret = f.lo === null ? f.hi : f.lo;
          const mid = (edge + fret) / 2;
          if (Math.abs(along - mid) > tol) issues.push(`${desc(svg, c)} 개방현 칸 중앙에서 ${(along - mid).toFixed(2)}px (칸 ${edge.toFixed(1)}~${fret.toFixed(1)}, nut ${nut})`);
        } else {
          issues.push(`${desc(svg, c)} 프렛 칸 밖`);
        }
      }
    }
    return { dots, issues };
  }, CENTER_TOL);
}

const C5_CASES = [
  ...['scale', 'tone', 'matrix', 'circle', 'reint', 'tf', 'ds'].map((tab) => ({ name: `기타 ${tab}`, tab })),
  { name: '기타 prog 진행 선택', tab: 'prog', path: '/chords.html#prog?c=C%2CG%2CAm%2CF', prep: async (page) => { await page.locator('#pp-boxes > figure').nth(1).click(); await expect(page.locator('#pp-cur')).toBeVisible(); } },
  { name: '기타 reint 개방현 입력', tab: 'reint', prep: async (page) => { for (const s of ['0', '5']) await page.locator(`#pane-reint svg.fb rect.hit[data-s="${s}"][data-f="0"]`).first().click(); } },
  { name: '기타 scale 왼손', tab: 'scale', prep: async (page) => { await page.locator('#sc-hand button').nth(1).click(); } },
  { name: '기타 scale CAGED C', tab: 'scale', prep: async (page) => { await page.locator('#sc-block button').nth(1).click(); } },
  { name: '기타 scale 확대 최대', tab: 'scale', prep: async (page) => { const zoom = page.locator('#sc-zoom'); await zoom.fill(await zoom.getAttribute('max')); } },
  { name: '베이스 scale', tab: 'scale', instrument: 'bass' },
  { name: '베이스 tone', tab: 'tone', instrument: 'bass' },
];
for (const c of C5_CASES) {
  test(`DS23-C5 지판 원 중앙 — ${c.name} (1280)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, STATES.guest);
    await page.goto(c.path || `/chords.html#${c.tab}`);
    if (c.instrument) await page.locator(`#instrument-${c.instrument}`).click();
    await page.locator(`#tab-${c.tab}`).click();
    await expect(page.locator(`#pane-${c.tab}`)).toBeVisible();
    await expect(page.locator(`#pane-${c.tab} svg.fb, #pane-${c.tab} svg.cb`).first()).toBeVisible();
    if (c.prep) await c.prep(page);
    const r = await diagramCenterIssues(page, `#pane-${c.tab}`);
    expect(r.dots).toBeGreaterThan(0);
    expect(r.issues).toEqual([]);
  });
}

test('AS-1 코드 화면 AppSelect 21곳 접근 이름(getByRole combobox) 및 선택창 열림 확인', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);
  await page.goto('/chords.html#scale');
  await expect(page.locator('#sc-board svg')).toBeVisible();

  const checkCombo = async (id, name) => {
    const box = page.getByRole('combobox', { name, exact: true });
    await expect(box).toHaveCount(1);
    await expect(box).toHaveAttribute('id', id);
  };

  // 상단 악기 설정 (열림 시)
  await page.locator('#instrument-settings summary').click();
  await checkCombo('instrument-tuning', '현 수 · 튜닝');

  // 1. scale
  await checkCombo('sc-root', '루트 음');
  await checkCombo('sc-type', '스케일 종류');
  await page.locator('#sc-mode button').nth(1).click();
  await checkCombo('sc-root', '시작 루트');
  await checkCombo('sc-bars', '키당 마디 수');
  await page.locator('#sc-mode button').nth(0).click();

  // 선택창 열린 상태 확인 및 스크린샷(LAYOUT_SHOTS=1)
  await page.locator('#sc-type').click();
  await expect(page.locator('#sc-type-list')).toBeVisible();
  if (process.env.LAYOUT_SHOTS === '1') {
    await page.screenshot({ path: 'test-results/layout-shots/as1-chords-select-open-1280.png', fullPage: false });
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#sc-type-list')).toHaveCount(0);
  await pickOption(page, 'sc-type', 'dorian');
  await expectValue(page, 'sc-type', 'dorian');

  // 2. tone · 3. matrix · 4. circle · 5. reint · 6. tf · 7. ds
  await page.locator('#tab-tone').click();
  await checkCombo('tone-root', '루트 음');
  await page.locator('#tab-matrix').click();
  await checkCombo('mx-root', '루트 음');
  await page.locator('#tab-circle').click();
  await checkCombo('cc-root', '시작 루트');
  await checkCombo('cc-top', '탑노트 음정');
  await checkCombo('cc-str', '탑노트 줄');
  await page.locator('#tab-reint').click();
  await checkCombo('ri-key', '키 선택');
  await page.locator('#tab-tf').click();
  await checkCombo('a-kind', '진행 성격');
  await checkCombo('a-proot', '펜타토닉 기준 루트');
  await checkCombo('a-ptype', '펜타 종류');
  await checkCombo('a-guide', '가이드톤 필수');
  await page.locator('#tab-ds').click();
  await checkCombo('ds-root', '루트 음');
  await checkCombo('ds-scale', '스케일 종류');

  // 8. prog (기타)
  await page.goto('/chords.html#prog?c=C%2CG%2CAm%2CF&k=C%20Major');
  await checkCombo('pp-semis', '키 옮기기');
  await checkCombo('pp-beats', '코드당 박');

  // 건반: reint 음 선택 + prog (건반)
  await page.locator('#instrument-keyboard').click();
  await checkCombo('pp-semis', '키 옮기기');
  await checkCombo('pp-beats', '코드당 박');
  await page.locator('#tab-reint').click();
  await checkCombo('ri-keyboard-note', '음 선택');

  // 390px 선택창 열린 상태 스크린샷
  if (process.env.LAYOUT_SHOTS === '1') {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('#instrument-guitar').click();
    await page.locator('#tab-scale').click();
    await page.locator('#sc-type').click();
    await expect(page.locator('#sc-type-list')).toBeVisible();
    await page.screenshot({ path: 'test-results/layout-shots/as1-chords-select-open-390.png', fullPage: false });
    await page.keyboard.press('Escape');
  }
});
