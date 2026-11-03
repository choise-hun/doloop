// R1-1 홈 대시보드(BETTER | VAULT, 주간 스트릭, 최근 연습 곡, 코드 진행 카드) 검증 테스트 (R1-H1 ~ R1-H8)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
}

// TypeScript 소스에서 순수 런타임 검증을 위해 타입 어노테이션만 제거하는 경량 변환기
function transpileTsForVm(tsCode) {
  return tsCode
    .replace(/import\s+type\s+[^;]+;/g, '')
    .replace(/import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"];/g, 'const {$1} = __require("$2");')
    .replace(/export\s+type\s+[A-Za-z0-9_]+\s*=[\s\S]*?;/g, '')
    .replace(/export\s+interface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\n\}/g, '')
    .replace(/export\s+const\s+([A-Za-z0-9_]+)\s*:[^=]+=/g, 'const $1 = exports.$1 =')
    .replace(/export\s+const\s+([A-Za-z0-9_]+)\s*=/g, 'const $1 = exports.$1 =')
    .replace(/export\s+function\s+([A-Za-z0-9_]+)/g, 'const $1 = exports.$1 = function $1')
    .replace(/:\s*ReadonlyArray<[^>]+>/g, '')
    .replace(/:\s*Iterable<[^>]+>/g, '')
    .replace(/:\s*ProgressionItem\[\]/g, '')
    .replace(/:\s*ProgressionItem/g, '')
    .replace(/:\s*WeeklyStreakDay\[\]/g, '')
    .replace(/:\s*WeeklyStreakSummary/g, '')
    .replace(/:\s*Date\s*\|\s*null/g, '')
    .replace(/:\s*Date/g, '')
    .replace(/:\s*number\s*\|\s*null\s*\|\s*undefined/g, '')
    .replace(/:\s*string/g, '')
    .replace(/:\s*number/g, '')
    .replace(/:\s*boolean/g, '')
    .replace(/:\s*any/g, '')
    .replace(/:\s*\(\)\s*=>\s*number/g, '')
    .replace(/:\s*\{[^}]+\}/g, '')
    .replace(/as\s+NoteDetailDto/g, '')
    .replace(/json\.get<[^>]+>/g, 'json.get')
    .replace(/new\s+Set<string>\(\)/g, 'new Set()')
    .replace(/!\s*;/g, ';');
}

function loadProgressionsModule(storageMap = new Map()) {
  const secFake = {
    raw: {
      get: (k) => storageMap.get(k) || '',
      set: (k, v) => (v ? storageMap.set(k, v) : storageMap.delete(k)),
    },
    json: {
      get: (k, d) => (storageMap.has(k) ? JSON.parse(storageMap.get(k)) : d),
      set: (k, v) => storageMap.set(k, JSON.stringify(v)),
    },
    videoIdFrom: (s) => {
      const str = String(s ?? '').trim();
      if (/^[\w-]{11}$/.test(str)) return str;
      const m = str.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live)\/)([\w-]{11})/);
      return m ? m[1] : null;
    },
  };
  const code = transpileTsForVm(readText('frontend/src/lib/progressions.ts'));
  const exportsObj = {};
  const ctx = vm.createContext({
    exports: exportsObj,
    __require: () => secFake,
    Date,
    Math,
    Number,
    String,
    Array,
    Set,
    URLSearchParams,
    encodeURIComponent,
  });
  vm.runInContext(code, ctx);
  return exportsObj;
}

test('R1-H1: computeWeeklyStreak — Mo~Su 7일 배열 생성 및 연속 연습일·작심삼일(0일/2일/3일/4일) 계산', () => {
  const P = loadProgressionsModule();

  // 1) 연습 기록 0건 (기준일: 2026-11-04 수요일)
  const s0 = P.computeWeeklyStreak([], '2026-11-04');
  assert.equal(s0.days.length, 7);
  assert.deepEqual(
    JSON.parse(JSON.stringify(s0.days.map((d) => d.dowLabel))),
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  );
  assert.equal(s0.days[0].dateStr, '2026-11-02');
  assert.equal(s0.days[2].dateStr, '2026-11-04');
  assert.equal(s0.days[2].isToday, true);
  assert.equal(s0.streakDays, 0);
  assert.equal(s0.cycleStep, 0);
  assert.equal(s0.challengeText, '작심삼일 도전하기 · 오늘 첫 연습을 시작해 보세요');

  // 2) 어제·오늘 2일 연속 연습
  const s2 = P.computeWeeklyStreak(['2026-11-03', '2026-11-04'], '2026-11-04');
  assert.equal(s2.streakDays, 2);
  assert.equal(s2.cycleStep, 2);
  assert.equal(s2.days[1].practiced, true);
  assert.equal(s2.days[2].practiced, true);
  assert.equal(s2.challengeText, '작심삼일 도전하기 · 연속 2일째 (2/3)');

  // 3) 오늘은 아직 연습 전이지만 어제까지 3일 연속 연습한 경우 스트릭 3일 유지
  const s3 = P.computeWeeklyStreak(['2026-11-01', '2026-11-02', '2026-11-03'], '2026-11-04');
  assert.equal(s3.streakDays, 3);
  assert.equal(s3.cycleStep, 3);
  assert.equal(s3.challengeText, '작심삼일 도전하기 · 연속 3일째 (3/3)');

  // 4) 4일 연속 연습 시 새 3일 사이클 1/3 시작
  const s4 = P.computeWeeklyStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], '2026-11-04');
  assert.equal(s4.streakDays, 4);
  assert.equal(s4.cycleStep, 1);
  assert.equal(s4.challengeText, '작심삼일 도전하기 · 연속 4일째 (1/3)');
});

test('R1-H2: formatSec, formatRecentSongSegment, buildPracticeResumeHref 포맷 검증', () => {
  const P = loadProgressionsModule();
  assert.equal(P.formatSec(0), '00:00');
  assert.equal(P.formatSec(90), '01:30');
  assert.equal(P.formatSec(102.8), '01:42');

  const segLoop = P.formatRecentSongSegment({ a: 90, b: 102, rate: 0.75 });
  assert.equal(segLoop, '01:30 ~ 01:42 구간 연습 중 · 0.75×');

  const segPos = P.formatRecentSongSegment({ pos: 65, a: null, b: null, rate: 1 });
  assert.equal(segPos, '마지막 위치 01:05 · 1× 연습 중');

  const href = P.buildPracticeResumeHref({ videoId: 'jNQXAC9IVRw', pos: 15, a: 10, b: 25, rate: 0.75 });
  assert.equal(href, 'practice.html?v=jNQXAC9IVRw&t=15&a=10&b=25&r=0.75');
});

test('R1-H3: pickNextIndex 비중복 보장 및 extractProgressionsFromNotes 노트 진행 병합', () => {
  const P = loadProgressionsModule();
  for (let cur = 0; cur < 5; cur++) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      const next = P.pickNextIndex(cur, 5, () => r);
      assert.notEqual(next, cur);
      assert.ok(next >= 0 && next < 5);
    }
  }

  const extracted = P.extractProgressionsFromNotes([
    {
      id: 'n-100',
      title: '네오소울 화성 강의',
      tags: ['화성'],
      analysis: {
        harmony: {
          progressions: [
            {
              name: '강의 핵심 진행',
              key: 'Eb Major',
              chords: [{ symbol: 'Fm9' }, { symbol: 'Bb13' }, { symbol: 'EbM9' }],
            },
          ],
        },
      },
    },
  ]);
  assert.equal(extracted.archive[0].chordsText, 'Fm9 - Bb13 - EbM9');
  assert.equal(extracted.archive[0].sourceType, 'AI');
  assert.equal(extracted.archive[0].href, 'note.html?id=n-100');
  assert.ok(extracted.reference.length >= 5);
});

test('R1-H4: public/data.js 및 apiClient.ts의 listLocalSongs 최신순 정렬 검증', () => {
  const apiSrc = readText('frontend/src/lib/apiClient.ts');
  assert.ok(apiSrc.includes('export function listLocalSongs'), 'apiClient.ts에 listLocalSongs export가 있어야 함');

  const store = new Map([
    ['ulp:v:aaaaaaaaaaa', JSON.stringify({ pos: 10, a: null, b: null, rate: 1, date: '2026-11-01' })],
    ['ulp:v:bbbbbbbbbbb', JSON.stringify({ pos: 30, a: 15, b: 45, rate: 0.75, date: '2026-11-03' })],
  ]);
  const keys = Array.from(store.keys());
  const sandbox = {
    window: { ULAuth: { getSession: () => null } },
    localStorage: {
      get length() {
        return keys.length;
      },
      key: (i) => keys[i] || null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
    },
    Blob,
    FormData,
    URLSearchParams,
    encodeURIComponent,
  };
  vm.runInNewContext(readText('public/data.js'), sandbox);
  const list = sandbox.window.ULData.listLocalSongs();
  assert.equal(list.length, 2);
  assert.equal(list[0].videoId, 'bbbbbbbbbbb');
  assert.equal(list[0].a, 15);
  assert.equal(list[1].videoId, 'aaaaaaaaaaa');
});

test('R1-H5: HomePage.module.css & public/site.css 순백(#ffffff/#fff) 0건 및 중간 곡률 0건', () => {
  const files = ['frontend/src/pages/HomePage.module.css', 'public/site.css'];
  const allowedRadius = new Set(['0', '0px', '50%', '9999px', 'var(--radius-pill)', 'var(--radius-card)']);

  for (const file of files) {
    const rawCss = readText(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const whiteMatch = rawCss.match(/#(?:ffffff|fff)\b/i);
    assert.equal(whiteMatch, null, file + '에 금지된 순백 컬러가 존재함');
    for (const m of rawCss.matchAll(/border-radius\s*:\s*([^;!}]+)/gi)) {
      const val = m[1].trim();
      assert.ok(allowedRadius.has(val), file + '에 허용되지 않은 중간 곡률 사용: ' + val);
    }
  }
});

test('R1-H6: HomePage.tsx, App.tsx, public/index.html 핵심 위젯 ID 및 7개 모드 구성 검증', () => {
  const homeTsx = readText('frontend/src/pages/HomePage.tsx');
  const appTsx = readText('frontend/src/App.tsx');
  const pubIndex = readText('public/index.html');

  assert.ok(appTsx.includes('<HomePage />'), 'App.tsx가 <HomePage />를 렌더링해야 함');
  for (const id of [
    'weeklyStreakCard',
    'streakDays',
    'streakChallengeBar',
    'recentSongCard',
    'betterFrame',
    'vaultFrame',
    'modes',
    'songs',
    'recentNoteCard',
    'progRefBox',
    'progArchBox',
    'btnRandRef',
    'btnRandArch',
  ]) {
    assert.ok(homeTsx.includes(`id="${id}"`), `HomePage.tsx 누락 ID: ${id}`);
    assert.ok(pubIndex.includes(`id="${id}"`), `public/index.html 누락 ID: ${id}`);
  }
});

test('R1-H7 & R1-H8: public/home.js 비로그인/로그인 위젯 바인딩·랜덤 진행·계정 전환 레이스 방어 검증', async () => {
  const elements = new Map();
  function makeEl(id) {
    const el = {
      id,
      value: '',
      hidden: false,
      textContent: '',
      innerHTML: '',
      className: '',
      href: '',
      src: '',
      target: '',
      rel: '',
      dataset: {},
      children: [],
      listeners: {},
      classList: {
        toggle(cls, force) {
          if (force) el.className = (el.className + ' ' + cls).trim();
        },
      },
      addEventListener(ev, fn) {
        el.listeners[ev] = fn;
      },
      appendChild(child) {
        el.children.push(child);
        return child;
      },
      replaceChildren() {
        el.children = [];
      },
      click() {},
    };
    return el;
  }

  for (const id of [
    'go', 'goUrl', 'goPick', 'goThumb', 'goPlay', 'goNote', 'goMsg',
    'weeklyStreakCard', 'streakDays', 'streakChallengeBar', 'streakChallengeText', 'streakDots',
    'recentSongCard', 'recentSongGo', 'recentSongBody', 'recentSongEmpty', 'recentSongThumb', 'recentSongTitle', 'recentSongSegment', 'recentSongResume',
    'modes', 'songs',
    'recentNoteCard', 'recentNoteBody', 'recentNoteEmpty', 'recentNoteThumb', 'recentNoteTitle', 'recentNoteHeadline', 'recentNoteLink',
    'progRefBox', 'progRefKey', 'progRefChords', 'progRefTitle', 'btnRandRef',
    'progArchBox', 'progArchKey', 'progArchChords', 'progArchTitle', 'btnRandArch',
    'notionBig', 'notionLinks', 'nlPractice', 'nlNotes', 'copy',
  ]) {
    elements.set(id, makeEl(id));
  }

  let authChangeCb = null;
  let currentUser = null;
  let delayedSongsResolve = null;

  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => makeEl(tag),
    },
    UL: {
      raw: {
        get: (k) => (k === 'ulp:tab' ? 'ds' : ''),
        set: () => {},
      },
      json: {
        get: (_k, d) => d,
        set: () => {},
      },
      videoIdFrom: (v) => (/^[\w-]{11}$/.test(String(v || '').trim()) ? String(v).trim() : null),
      thumb: (id) => 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      esc: (s) => String(s ?? ''),
      safeUrl: (u) => (String(u || '').startsWith('https://') ? String(u) : ''),
    },
    window: {
      ULAuth: {
        getUser: () => currentUser,
        onChange: (cb) => {
          authChangeCb = cb;
          cb({ user: currentUser });
        },
      },
      ULData: {
        isLoggedIn: () => !!currentUser,
        listLocalSongs: () => [{ videoId: 'jNQXAC9IVRw', pos: 12, a: 5, b: 20, rate: 0.75, date: '2026-11-03' }],
        songs: {
          list: () =>
            new Promise((resolve) => {
              delayedSongsResolve = resolve;
            }),
        },
        sessions: {
          list: async () => ({ calendar: [], sessions: [] }),
        },
        notes: {
          list: async () => [],
        },
      },
    },
    Date,
    Math,
    Number,
    String,
    Array,
    Set,
    encodeURIComponent,
    isFinite,
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.UL = sandbox.UL;

  vm.runInNewContext(readText('public/home.js'), sandbox);

  // R1-H7: 비로그인 초기 상태 확인
  assert.ok(elements.get('modes').innerHTML.includes('7 · 더블 스탑 연습'));
  assert.ok(elements.get('modes').innerHTML.includes('<li class="cur"><a href="chords.html#ds">'));
  assert.ok(elements.get('songs').innerHTML.includes('로그인하면 내 연습 곡이 여기 보여요'));
  assert.equal(elements.get('recentSongBody').hidden, false);
  assert.equal(elements.get('recentSongSegment').textContent, '00:05 ~ 00:20 구간 연습 중 · 0.75×');

  // 랜덤 진행 버튼 클릭 시 텍스트 변경 확인
  const prevRef = elements.get('progRefChords').textContent;
  elements.get('btnRandRef').listeners.click();
  assert.notEqual(elements.get('progRefChords').textContent, prevRef);

  // R1-H8: 사용자 A 로그인 후 곡 응답 도착 전 로그아웃 시 지연 응답 무시 검증
  currentUser = { id: 'user-a' };
  authChangeCb({ user: currentUser });
  assert.ok(elements.get('songs').innerHTML.includes('불러오는 중…'));

  // 응답 도착 전 로그아웃
  currentUser = null;
  authChangeCb({ user: null });
  assert.ok(elements.get('songs').innerHTML.includes('로그인하면 내 연습 곡이 여기 보여요'));

  // 뒤늦게 사용자 A의 곡 목록 응답 도착
  delayedSongsResolve([{ id: 's1', videoId: 'dQw4w9WgXcQ', title: 'Secret Song A', status: '연습중', rate: 1, lastDate: '2026-11-03' }]);
  await new Promise((r) => setTimeout(r, 10));

  // 사용자 A의 곡이 렌더링되지 않고 비로그인 상태 유지
  assert.ok(!elements.get('songs').innerHTML.includes('Secret Song A'));
  assert.ok(elements.get('songs').innerHTML.includes('로그인하면 내 연습 곡이 여기 보여요'));
});
