// 홈 화면 정렬 검사 (H-1): 4개 폭 × 3개 상태에서 카드 넘침·처짐·말줄임·높이 맞춤·버튼 줄·파란색 0건
// 설계: 개발산출물/완료/진행_홈정렬.md §3. React 화면 전용(legacy 모드는 skip)
// H5는 G-1에서 BETTER 세부 섹션 버튼 + VAULT 카드 아랫선 기준으로 바뀜(개발산출물/완료/진행_홈메뉴장르.md)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const WIDTHS = [1280, 1150, 768, 390];
const TWO_COL_MIN = 821; // HomePage.module.css @media (max-width: 820px) 위에서만 2열
const BLUES = ['rgb(31, 63, 195)', 'rgb(154, 168, 245)']; // --link 라이트 #1F3FC3 · 다크 #9AA8F5

const LONG = 'Neo-Soul Practice Session With A Very Long Title That Should Never Break The Card Layout';

const MOCK_SONGS = [1, 2, 3, 4, 5].map((n) => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  title: `${n} · ${LONG}`,
  artist: 'Artist',
  status: '연습 중',
  statusCode: 'practicing',
  videoId: `abcdefghij${n}`,
  pos: 30,
  a: 12,
  b: 48,
  rate: 0.75,
  lastDate: '2026-11-03',
  memo: '',
  totalSeconds: 600,
  resumeUrl: '',
}));

const MOCK_NOTE = {
  id: '00000000-0000-4000-8000-000000000201',
  videoId: 'abcdefghij1',
  url: 'https://www.youtube.com/watch?v=abcdefghij1',
  title: `노트 · ${LONG}`,
  channel: 'Channel',
  tags: [],
  memo: '',
  headline: `한 줄 요약 · ${LONG}`,
  points: [],
  keywords: [],
  model: 'gemini',
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
};

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

// 가짜 인증·API 모킹 (xss.spec.js setupMockAuthAndApi에서 홈에 필요한 부분만 옮김)
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
  await page.route((url) => url.pathname.startsWith('/api/v1/songs'), (route) => json(route, { songs: MOCK_SONGS }));
  await page.route((url) => url.pathname.startsWith('/api/v1/sessions'), (route) =>
    json(route, { calendar: [{ date: '2026-11-03', totalSeconds: 600 }], sessions: [] })
  );
  await page.route((url) => url.pathname.startsWith('/api/v1/notes'), (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/v1/notes') return json(route, { notes: [MOCK_NOTE] });
    return json(route, { note: MOCK_NOTE });
  });
}

const STATES = {
  S1: { name: '비로그인 빈 화면', emptySongs: true, setup: async () => {} },
  S2: {
    name: '비로그인 + 기기 곡·노션 링크',
    emptySongs: true,
    setup: async (page) => {
      await page.addInitScript(() => {
        localStorage.setItem('ulp:v:jNQXAC9IVRw', JSON.stringify({ pos: 30, a: 12, b: 48, rate: 0.75, date: '2026-11-03' }));
        localStorage.setItem('ulp:notion-practice', 'https://www.notion.so/practice');
        localStorage.setItem('ulp:notion-notes', 'https://www.notion.so/notes');
      });
    },
  },
  S3: { name: '로그인 + 곡 5개 + 노트', emptySongs: false, setup: setupLoggedIn },
};

async function openHome(page, state, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.route(/youtube\.com|ytimg\.com|doubleclick\.net/, (route) => route.abort());
  await state.setup(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  if ((await page.locator('#root').count()) === 0) return false;
  await page.locator('#weeklyStreakCard').waitFor();
  if (state === STATES.S3) {
    await expect(page.locator('#songs li a')).toHaveCount(5);
    await page.locator('#recentNoteBody').waitFor();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return true;
}

// 브라우저 안에서 도는 검사. 실패 문구 배열을 돌려준다
function collectProblems({ twoCol, emptySongs, blues }) {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    const r = R(el);
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.textContent || '').trim().slice(0, 16));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // H1 카드 넘침: 카드 안 모든 요소가 카드 경계 안
  const cards = document.querySelectorAll(
    '#weeklyStreakCard, #recentSongCard, #recentNoteBody, #recentNoteEmpty, #progRefBox, #progArchBox, #betterFrame, #vaultFrame'
  );
  for (const card of cards) {
    if (!shown(card)) continue;
    const c = R(card);
    for (const el of card.querySelectorAll('*')) {
      if (!shown(el)) continue;
      const r = R(el);
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) {
        out.push(`H1 ${label(card)} 밖으로 ${label(el)} 넘침`);
      }
    }
  }

  // H1·H2 썸네일·글 칸: 겹치지 않고 윗선 일치
  for (const body of document.querySelectorAll('#recentSongBody, #recentSongEmpty, #recentNoteBody, #recentNoteEmpty')) {
    if (!shown(body) || body.children.length < 2) continue;
    const t = R(body.children[0]);
    const info = R(body.children[1]);
    if (t.right > info.left + 0.5) out.push(`H1 ${label(body)} 썸네일이 글 칸과 ${Math.round(t.right - info.left)}px 겹침`);
    if (!near(t.top, info.top, 2)) out.push(`H2 ${label(body)} 썸네일·글 윗선 차이 ${Math.round(info.top - t.top)}px`);
    for (const a of body.children[1].querySelectorAll('a')) {
      if (!near(R(a).left, info.left, 1)) out.push(`H2 ${label(body)} 링크가 글 왼쪽선에서 ${Math.round(R(a).left - info.left)}px 떨어짐`);
    }
  }

  // H2 처짐: 카드 제목 바로 아래에서 내용 시작
  for (const card of document.querySelectorAll('#weeklyStreakCard, #recentSongCard, #recentNoteCard')) {
    if (!shown(card) || card.children.length < 2) continue;
    const gap = R(card.children[1]).top - R(card.children[0]).bottom;
    if (gap > 24) out.push(`H2 ${label(card)} 제목 아래 ${Math.round(gap)}px 빔`);
  }

  // H3 말줄임 없음
  for (const el of document.querySelectorAll('#progRefTitle, #progArchTitle, #recentSongEmpty p, #recentNoteEmpty p, #songs li.note, #songs li.note *')) {
    if (!shown(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.push(`H3 ${label(el)} 말줄임(${el.scrollWidth}>${el.clientWidth})`);
  }

  if (twoCol) {
    // H4 높이 맞춤
    const pairs = [
      ['#weeklyStreakCard', '#recentSongCard', true],
      ['#progRefBox', '#progArchBox', true],
      ['#betterFrame', '#vaultFrame', true],
      ['#streakChallengeBar', '#categoryRow', false],
    ];
    if (emptySongs) pairs.push(['#modes', '#songs', false]);
    for (const [a, b, top] of pairs) {
      const ra = R(document.querySelector(a));
      const rb = R(document.querySelector(b));
      if (top && !near(ra.top, rb.top, 1)) out.push(`H4 ${a}·${b} 윗선 차이 ${Math.round(rb.top - ra.top)}px`);
      if (!near(ra.bottom, rb.bottom, 1)) out.push(`H4 ${a}·${b} 아랫선 차이 ${Math.round(rb.bottom - ra.bottom)}px`);
    }

    // H5 BETTER 버튼: 두 버튼 높이·바닥선 같음, 각 세부 섹션 가운데. VAULT 카드 아랫선이 버튼 바닥선과 맞음
    const btnEls = ['#betterChordsBtn', '#betterPlayerBtn'].map((s) => document.querySelector(s));
    const btns = btnEls.map(R);
    for (const [i, r] of btns.entries()) {
      if (!near(r.height, btns[0].height, 0.5)) out.push(`H5 버튼 높이 ${r.height} ≠ ${btns[0].height}`);
      if (!near(r.bottom, btns[0].bottom, 0.5)) out.push(`H5 버튼 바닥선 ${Math.round(r.bottom - btns[0].bottom)}px 차이`);
      const col = R(btnEls[i].parentElement.parentElement);
      const off = (r.left + r.right) / 2 - (col.left + col.right) / 2;
      if (!near(off, 0, 1)) out.push(`H5 ${label(btnEls[i])} 섹션 가운데에서 ${Math.round(off)}px 벗어남`);
    }
    const vaultBottom = R(document.querySelector('#progRefBox')).bottom;
    if (!near(vaultBottom, btns[0].bottom, 1)) out.push(`H5 VAULT 카드 아랫선 ${Math.round(vaultBottom - btns[0].bottom)}px 차이`);
  }

  // H6 파란색 0건
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    const used = [s.color, s.backgroundColor, s.textDecorationColor];
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(s[`border${side}Width`]) > 0) used.push(s[`border${side}Color`]);
    }
    if (used.some((c) => blues.includes(c))) out.push(`H6 ${label(el)} 파란색`);
  }
  return [...new Set(out)];
}

for (const [key, state] of Object.entries(STATES)) {
  for (const width of WIDTHS) {
    test(`H ${key}(${state.name}) ${width}px 홈 정렬`, async ({ page }) => {
      test.skip(!(await openHome(page, state, width)), 'legacy 모드: React 화면 아님');
      const problems = await page.evaluate(collectProblems, {
        twoCol: width >= TWO_COL_MIN,
        emptySongs: state.emptySongs,
        blues: BLUES,
      });
      expect(problems).toEqual([]);
    });
  }
}

test('H6 다크 모드 1280px 홈 파란색 0건', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  test.skip(!(await openHome(page, STATES.S3, 1280)), 'legacy 모드: React 화면 아님');
  const problems = await page.evaluate(collectProblems, { twoCol: true, emptySongs: false, blues: BLUES });
  expect(problems.filter((p) => p.startsWith('H6'))).toEqual([]);
});

test('H6 HomePage.module.css에 링크 파란색 토큰 없음', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/HomePage.module.css'), 'utf8');
  expect(css.match(/var\(--(link|accent-text)\)/g) || []).toEqual([]);
});
