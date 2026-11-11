// L1-2b: 다국어(ko·en·ja) 전환 · 자동 감지 · 3개 언어×4폭 레이아웃·한글 잔존 0건 검증
// 명세: 개발산출물/명세/L1-2b_구현명세.md §6, §7
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { checkLayout, WIDTHS } = require('./support/layout-check');
const { mockApp, STATES, FIXTURES, DEFAULT_ME, LONG_TITLE } = require('./support/mock-app');

const I18N_NOTE = {
  ...FIXTURES.note,
  title: `Note · ${LONG_TITLE}`,
  headline: `Summary · ${LONG_TITLE}`,
  tags: ['화성', '리듬'],
  analysis: {
    harmony: {
      progressions: [
        {
          name: 'Intro Progression',
          key: 'C Major',
          instrument: 'Guitar',
          chords: [
            { symbol: 'Cmaj7', roman: 'IM7', function: 'T', timestamp: '01:24' },
            { symbol: 'Dm7', roman: 'ii7', function: 'SD', timestamp: '01:30' },
          ],
        },
      ],
    },
    moments: [{ timestamp: '00:30', point: 'Key Moment 1' }],
    practice: ['Practice Task 1'],
  },
};

function collectWrappedPills() {
  const out = [];
  for (const el of document.querySelectorAll('main button, main a.pillBtn, main a.ghostBtn')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !(el.textContent || '').trim()) continue;
    const before = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    const oneLine = el.getBoundingClientRect().height;
    el.style.whiteSpace = before;
    if (r.height > oneLine + 1) {
      out.push(`${el.id ? '#' + el.id : el.tagName.toLowerCase()} "${el.textContent.trim()}" 두 줄(높이 ${Math.round(r.height)}px > 한 줄 ${Math.round(oneLine)}px, 폭 ${Math.round(r.width)}px)`);
    }
  }
  return out;
}

function collectGapProblems(scale) {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const label = (el) =>
    el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(/\s+/)[0] + ' ' + (el.textContent || '').trim().slice(0, 12);
  const stacked = (el) => {
    const s = getComputedStyle(el);
    if (s.display.startsWith('inline') || s.display === 'none' || s.position === 'absolute') return false;
    const r = R(el);
    return r.width > 0 && r.height > 0;
  };
  for (const box of document.querySelectorAll('main section, main section *')) {
    if (!stacked(box) || /^(UL|OL|LABEL|SUMMARY|P|B|SPAN|BUTTON|A)$/.test(box.tagName)) continue;
    const kids = [...box.children].filter(stacked);
    if (kids.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < kids.length; i++) {
      const prev = R(kids[i - 1]);
      const cur = R(kids[i]);
      if (cur.top < prev.bottom - 1) continue;
      gaps.push(Math.round(cur.top - prev.bottom));
    }
    if (gaps.length === 0) continue;
    const bad = gaps.filter((g) => !scale.includes(g));
    if (bad.length) out.push(`${label(box)} 간격 ${gaps.join('/')} (스케일 밖 ${bad.join(',')})`);
    else if (new Set(gaps).size > 1) out.push(`${label(box)} 간격 들쭉날쭉 ${gaps.join('/')}`);
  }
  return out;
}

function collectVisibleHangul() {
  const remains = [];
  const hangulRe = /[가-힣]/;
  const visible = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    // 언어 선택기의 한국어 고유명사 버튼 제외
    if (el.getAttribute('data-lang') === 'ko') continue;
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const txt = (node.textContent || '').trim();
        if (txt && hangulRe.test(txt)) {
          remains.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}: "${txt}"`);
        }
      }
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const ph = el.getAttribute('placeholder') || '';
      if (hangulRe.test(ph)) {
        remains.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[placeholder]: "${ph}"`);
      }
    }
  }
  return remains;
}

test('E2E-L1-1 /settings.html #langSelect 클릭·유지 및 연속 클릭 시 PATCH /api/v1/me 직렬화 수렴', async ({ page }) => {
  const patchCalls = [];
  let inFlight = 0;
  let maxConcurrent = 0;

  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.user,
    routes: [
      [
        (url) => url.pathname === '/api/v1/me',
        async (route) => {
          if (route.request().method() === 'PATCH') {
            inFlight++;
            maxConcurrent = Math.max(maxConcurrent, inFlight);
            const body = JSON.parse(route.request().postData() || '{}');
            patchCalls.push(body);
            await new Promise((r) => setTimeout(r, 60));
            inFlight--;
            return route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify({ ...DEFAULT_ME, locale: body.locale ?? null }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(DEFAULT_ME),
          });
        },
      ],
    ],
  });

  await page.goto('/settings.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('[data-setting-disclosure="appearanceLanguage"]')).not.toHaveAttribute('open', '');
  await page.locator('[data-setting-disclosure="appearanceLanguage"] > summary').click();
  await expect(page.locator('#accEmail')).toHaveText('a@example.com');

  // 1) English 클릭 → html[lang="en"], localStorage('ulp:lang') === 'en', 화면 즉시 리렌더
  await page.locator('#langSelect [data-lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#langSelect [data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hLang')).toHaveText('Language');
  expect(await page.evaluate(() => localStorage.getItem('ulp:lang'))).toBe('en');

  // 2) 페이지 이동 및 새로고침 후에도 유지
  await page.goto('/index.html', { waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/settings.html', { waitUntil: 'load' });
  await expect(page.locator('[data-setting-disclosure="appearanceLanguage"]')).not.toHaveAttribute('open', '');
  await page.locator('[data-setting-disclosure="appearanceLanguage"] > summary').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#langSelect [data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');

  // 이전 PATCH 완료 대기 후 기록 초기화
  await expect.poll(() => inFlight).toBe(0);
  patchCalls.length = 0;
  maxConcurrent = 0;

  // 3) 로그인 상태에서 연속 클릭(en → ja → auto) 시 직렬화 및 마지막 선택({ locale: null }) 수렴
  await page.evaluate(() => {
    const enBtn = document.querySelector('#langSelect [data-lang="en"]');
    const jaBtn = document.querySelector('#langSelect [data-lang="ja"]');
    const autoBtn = document.querySelector('#langSelect [data-lang="auto"]');
    enBtn.click();
    jaBtn.click();
    autoBtn.click();
  });

  await expect(page.locator('#langSelect [data-lang="auto"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('ulp:lang'))).toBeNull();
  // 직렬화된 PATCH 사이에는 inFlight가 순간 0이 되므로, 마지막 선택({ locale: null })이 서버에 도달할 때까지 먼저 대기한다.
  await expect.poll(() => patchCalls[patchCalls.length - 1]).toEqual({ locale: null });
  await expect.poll(() => inFlight).toBe(0);
  expect(maxConcurrent).toBe(1);
  expect(patchCalls[patchCalls.length - 1]).toEqual({ locale: null });
});

test('E2E-L1-2 ulp:lang 없을 때 브라우저 컨텍스트 언어(en-US → en, ja-JP → ja) 자동 감지', async ({ browser }) => {
  const ctxEn = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York' });
  const pageEn = await ctxEn.newPage();
  await mockApp(pageEn, STATES.guest);
  await pageEn.goto('/index.html', { waitUntil: 'load' });
  const isReact = (await pageEn.locator('#root').count()) > 0;
  if (!isReact) {
    await ctxEn.close();
    test.skip(true, 'legacy 모드: React 화면 아님');
  }
  await expect(pageEn.locator('html')).toHaveAttribute('lang', 'en');
  await ctxEn.close();

  const ctxJa = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const pageJa = await ctxJa.newPage();
  await mockApp(pageJa, STATES.guest);
  await pageJa.goto('/index.html', { waitUntil: 'load' });
  await expect(pageJa.locator('html')).toHaveAttribute('lang', 'ja');
  await ctxJa.close();
});

const PAGES = [
  {
    name: 'index',
    path: '/index.html',
    mock: { ...STATES.user },
    options: { forbidColors: ['--link'] },
    ready: async (page) => {
      await page.locator('#weeklyStreakCard').waitFor();
    },
  },
  {
    name: 'settings',
    path: '/settings.html',
    mock: { ...STATES.user },
    ready: async (page) => {
      await expect(page.locator('#accEmail')).toHaveText('a@example.com');
      await expect(page.locator('[data-setting-disclosure="appearanceLanguage"]')).not.toHaveAttribute('open', '');
      await page.locator('[data-setting-disclosure="appearanceLanguage"] > summary').click();
      await page.locator('#langSec').waitFor();
    },
  },
  {
    name: 'chords',
    path: '/chords.html#scale',
    mock: { ...STATES.guest },
    ready: async (page) => {
      await page.locator('#pane-scale').waitFor();
    },
  },
  {
    name: 'progressions',
    path: '/progressions.html',
    mock: {
      ...STATES.user,
      routes: [
        [
          (url) => url.pathname === '/api/v1/progressions',
          (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ progressions: [] }) }),
        ],
      ],
    },
    ready: async (page) => {
      await page.locator('#progEmpty').waitFor();
    },
  },
  {
    name: 'practice',
    path: '/practice.html?v=jNQXAC9IVRw',
    mock: { ...STATES.guest },
    ready: async (page) => {
      await page.locator('#seekRow').waitFor();
      await page.locator('#songRecord').waitFor();
    },
  },
  {
    name: 'notes',
    path: '/notes.html',
    mock: {
      ...STATES.user,
      notes: [I18N_NOTE],
    },
    ready: async (page) => {
      await page.locator('#notesList').waitFor({ state: 'attached' });
      await expect(page.locator('#notesList a').first()).toBeVisible();
    },
  },
  {
    name: 'note',
    path: `/note.html?id=${I18N_NOTE.id}`,
    mock: {
      ...STATES.user,
      notes: [I18N_NOTE],
    },
    ready: async (page) => {
      await expect(page.locator('#noteTitle')).toContainText('Note');
      await expect(page.locator('#noteActionBar')).toBeVisible();
    },
  },
];

for (const lang of ['ko', 'en', 'ja']) {
  test(`E2E-L1-3 [${lang}] 7개 화면 × 4폭(1280·1150·768·390) checkLayout 0건 및 영·일 한글 잔존 0건`, async ({ page }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const pageCfg of PAGES) {
      await mockApp(page, {
        ...pageCfg.mock,
        local: { ...(pageCfg.mock.local || {}), 'ulp:lang': lang },
      });

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pageCfg.path, { waitUntil: 'load' });
        if ((await page.locator('#root').count()) === 0) {
          test.skip(true, 'legacy 모드: React 화면 아님');
        }
        await pageCfg.ready(page);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

        await expect(page.locator('html')).toHaveAttribute('lang', lang);

        const result = await checkLayout(page, { ...(pageCfg.options || {}), width });
        expect(result.fails, `${pageCfg.name} [${lang}] ${width}px checkLayout`).toEqual([]);

        if (pageCfg.name === 'settings') {
          // #langSelect 내부 4개 버튼이 390px 포함 모든 폭에서 한 줄(top·height 일치)
          await expect(page.locator('#langSelect')).toBeVisible();
          const boxes = await page.locator('#langSelect button').evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return { top: Math.round(r.top), height: Math.round(r.height) };
            })
          );
          expect(boxes.length).toBe(4);
          for (const b of boxes) {
            expect(Math.abs(b.top - boxes[0].top)).toBeLessThanOrEqual(1);
            expect(Math.abs(b.height - boxes[0].height)).toBeLessThanOrEqual(1);
          }
          expect(await page.evaluate(collectWrappedPills), `settings [${lang}] ${width}px wrapped pills`).toEqual([]);
          expect(await page.evaluate(collectGapProblems, [6, 12, 16]), `settings [${lang}] ${width}px gap problems`).toEqual([]);
        }

        if (lang !== 'ko') {
          const hangul = await page.evaluate(collectVisibleHangul);
          expect(hangul, `${pageCfg.name} [${lang}] ${width}px 한글 잔존`).toEqual([]);
        }

        if (process.env.LAYOUT_SHOTS === '1') {
          const dir = path.join(process.cwd(), 'test-results', 'layout-shots');
          fs.mkdirSync(dir, { recursive: true });
          await page.screenshot({
            path: path.join(dir, `i18n-${pageCfg.name}-${lang}-${width}.png`),
            fullPage: true,
          });
        }
      }
    }
  });
}
