// 설정 화면 간격 검사: 세로로 쌓인 형제 사이 간격이 간격 스케일(섹션 16 · 패널 12 · 라벨 6) 안이고 상자마다 일정
// React 화면 전용(legacy 모드는 skip)
'use strict';
const { test, expect } = require('@playwright/test');

const WIDTHS = [1280, 390];
const SCALE = [6, 12, 16];

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

// 가짜 인증·API 모킹 (home-align.spec.js setupLoggedIn에서 설정 화면에 필요한 부분만 옮김)
async function setupLoggedIn(page) {
  await page.route(
    (url) => url.pathname.endsWith('.html') || url.pathname === '/',
    async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const body = text.replace(/\sintegrity="[^"]*"/g, '');
      await route.fulfill({
        response,
        body,
        headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) },
      });
    }
  );

  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@.*/, async (route) => {
    const stub = `
      window.supabase = {
        createClient: function() {
          const fakeSession = { access_token: 'fake-jwt-token', user: { id: '00000000-0000-4000-8000-000000000001', email: 'a@example.com', user_metadata: {} } };
          return {
            auth: {
              getSession: async function() { return { data: { session: fakeSession }, error: null }; },
              onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; },
              signInWithOAuth: async function() { return { error: null }; },
              signOut: async function() { return { error: null }; }
            }
          };
        }
      };
    `;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: stub });
  });

  // 나중에 등록한 route가 먼저 매칭된다: 모르는 API는 빈 객체
  await page.route((url) => url.pathname.startsWith('/api/v1/'), (route) => json(route, {}));
  await page.route((url) => url.pathname.startsWith('/api/v1/me'), (route) =>
    json(route, {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'a@example.com',
      displayName: 'Tester',
      role: 'user',
      storageProvider: 'supabase',
      driveFolderId: null,
      takeUsedBytes: 0,
      takeQuotaBytes: 209715200,
      migratedLocalAt: '2026-10-30T00:00:00Z',
      keys: { notion: null, gemini: null },
    })
  );
}

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
  test(`S 로그인 ${width}px 설정 화면 간격 스케일·일정함`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupLoggedIn(page);
    await page.goto('/settings.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await expect(page.locator('#accEmail')).toHaveText('a@example.com');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const problems = await page.evaluate(collectGapProblems, SCALE);
    expect(problems).toEqual([]);
  });
}
