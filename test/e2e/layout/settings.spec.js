// 설정 화면 정렬 검사 (FT-2): 공통 검사 G0~G8 + 옛 settings-spacing.spec.js 간격 검사(본문 섹션 세로 간격 6·12·16, 상자마다 일정)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');

layoutSuite({
  name: 'settings',
  path: '/settings.html',
  states: ['guest', 'user'],
  ready: async (page, state) => {
    if (state === 'user') await expect(page.locator('#accEmail')).toHaveText('a@example.com');
    else await page.locator('#accGuest').waitFor();
  },
  dark: 'user',
});

// 옛 settings-spacing.spec.js에서 옮김(판정 함수 그대로, 가짜 인증만 mockApp으로)
const WIDTHS = [1280, 390];
const SCALE = [6, 12, 16];

// 브라우저 안에서 도는 검사. 실패 문구 배열을 돌려준다
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
      if (cur.top < prev.bottom - 1) continue; // 같은 줄(가로 배치)은 대상 아님
      gaps.push(Math.round(cur.top - prev.bottom));
    }
    if (gaps.length === 0) continue;
    const bad = gaps.filter((g) => !scale.includes(g));
    if (bad.length) out.push(`${label(box)} 간격 ${gaps.join('/')} (스케일 밖 ${bad.join(',')})`);
    else if (new Set(gaps).size > 1) out.push(`${label(box)} 간격 들쭉날쭉 ${gaps.join('/')}`);
  }

  // 버튼이 감싼 상자(패널·섹션)의 안쪽 여백을 넘지 않음
  for (const btn of document.querySelectorAll('main section button, main section a.pillBtn, main section a.ghostBtn')) {
    if (!stacked(btn)) continue;
    let box = btn.parentElement;
    while (box && parseFloat(getComputedStyle(box).paddingRight) === 0) box = box.parentElement;
    if (!box) continue;
    const inner = R(box).right - parseFloat(getComputedStyle(box).paddingRight);
    if (R(btn).right > inner + 0.5) out.push(`${label(btn)} 상자 안쪽 여백 밖으로 ${Math.round(R(btn).right - inner)}px`);
  }
  return out;
}

for (const width of WIDTHS) {
  test(`FT settings user ${width}px 본문 간격 스케일·일정함(고급 설정 펼침 포함)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, STATES.user);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await expect(page.locator('#accEmail')).toHaveText('a@example.com');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const problems = await page.evaluate(collectGapProblems, SCALE);
    expect(problems).toEqual([]);
    // 노션 연동은 고급 설정 접힘 안(계획/앱_명세.md §5) — 기본 접힘, 펼쳐도 간격 규칙 같음
    await expect(page.locator('#advNotion')).not.toHaveAttribute('open', '');
    await expect(page.locator('#ntnToken')).toBeHidden();
    await page.locator('#advNotion > summary').click();
    await expect(page.locator('#ntnToken')).toBeVisible();
    expect(await page.evaluate(collectGapProblems, SCALE)).toEqual([]);
  });
}
