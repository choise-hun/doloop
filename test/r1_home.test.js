// R1-1 홈 대시보드(BETTER | VAULT, 주간 스트릭, 최근 연습 곡, 코드 진행 카드) 검증 테스트 (R1-H1 ~ R1-H8)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

let i18nMod;
test.before(async () => {
  i18nMod = await import('../frontend/src/lib/i18n.mts');
});

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
    __require: (reqPath) => (reqPath && reqPath.includes('i18n') ? i18nMod : secFake),
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

test('R1-H3: 홈 취향 코드 진행은 서버 진행 목록을 쓴다 — 노트 화성 읽기·편곡 태그 규칙 없음(CH-6)', () => {
  const progSrc = readText('frontend/src/lib/progressions.ts');
  assert.ok(!progSrc.includes('extractProgressionsFromNotes'), 'progressions.ts에 노트 진행 추출이 남아 있음');
  assert.ok(!progSrc.includes("'편곡'"), '편곡 태그 규칙이 남아 있음');
  const homeTsx = readText('frontend/src/pages/HomePage.tsx');
  assert.ok(homeTsx.includes('apiClient.progressions'), '홈이 진행 API를 읽어야 함');
  assert.ok(homeTsx.includes('tasteStats') && homeTsx.includes('pickRandom'), '홈이 stats.mts를 써야 함');
  assert.ok(homeTsx.includes('playHref('), '홈 카드에 연주하기 링크(playHref)가 있어야 함');
  assert.ok(!homeTsx.includes('apiClient.notes.get('), '홈이 노트 상세를 읽지 않아야 함');
});

test('R1-H4: apiClient.ts의 listLocalSongs 최신순 정렬 검증', () => {
  const apiSrc = readText('frontend/src/lib/apiClient.ts');
  assert.ok(apiSrc.includes('export function listLocalSongs'), 'apiClient.ts에 listLocalSongs export가 있어야 함');
  assert.ok(apiSrc.includes("readLocal('ulp:v:')"), 'ulp:v: 접두어 로컬 곡만 조회해야 함');
  assert.ok(apiSrc.includes('y.date.localeCompare(x.date)'), 'date 최신순 정렬이 포함되어야 함');
});

test('R1-H5: HomePage.module.css 순백(#ffffff/#fff) 0건 및 중간 곡률 0건', () => {
  const files = ['frontend/src/pages/HomePage.module.css'];
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

test('R1-H6: HomePage.tsx, App.tsx 핵심 위젯 ID 및 7개 모드 구성 검증', () => {
  const homeTsx = readText('frontend/src/pages/HomePage.tsx');
  const appTsx = readText('frontend/src/App.tsx');

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
    'progScope',
    'progRefPlay',
    'progTasteLink',
  ]) {
    assert.ok(homeTsx.includes(`id="${id}"`), `HomePage.tsx 누락 ID: ${id}`);
  }
});
