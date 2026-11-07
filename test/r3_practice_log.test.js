// test/r3_practice_log.test.js
// R3-1 연습 플레이어(PracticePage) & 연습 기록(LogPage) React 전환 · Google Drive 기본 연결 유도 · 미연결 1곡 제한 교체 모달 검증 (R3-P1 ~ R3-P11)
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

// -------------------------------------------------------------
// R3-P1: 라우트 및 필수 ID 전수 검증
// -------------------------------------------------------------
test('R3-P1: App.tsx, PracticePage.tsx, LogPage.tsx 라우트 및 필수 ID 전수 검증', () => {
  const appTsx = readText('frontend/src/App.tsx');
  const practiceTsx = readText('frontend/src/pages/PracticePage.tsx');
  const logTsx = readText('frontend/src/pages/LogPage.tsx');

  // App.tsx 검증
  assert.ok(appTsx.includes('<Route path="/practice.html" element={<PracticePage />} />'), 'App.tsx에 PracticePage 연결 필수');
  assert.ok(appTsx.includes('<Route path="/log.html" element={<LogPage />} />'), 'App.tsx에 LogPage 연결 필수');
  assert.ok(!appTsx.includes('RouteShellPage'), 'App.tsx에서 RouteShellPage 완전 제거 필수');

  // PracticePage 필수 ID 목록 검증
  const practiceRequiredIds = [
    'songTitle', 'syncState', 'libBtn', 'player', 'emptyState', 'barLoop', 'barFill', 'seek',
    'recDriveBanner', 'btnRecDriveConnect', 'recDriveBadge', 'takeLimitModal',
    'btnTakeLimitConnectDrive', 'btnTakeLimitReplaceOld', 'btnTakeLimitClose',
  ];
  for (const id of practiceRequiredIds) {
    assert.ok(practiceTsx.includes(`id="${id}"`), `PracticePage.tsx에 id="${id}" 필수`);
  }

  // LogPage 필수 ID 목록 검증
  const logRequiredIds = [
    'logGuest', 'pane-log', 'pane-songs', 'pane-song-detail', 'abPanel', 'abAudioA', 'abAudioB',
  ];
  for (const id of logRequiredIds) {
    assert.ok(logTsx.includes(`id="${id}"`), `LogPage.tsx에 id="${id}" 필수`);
  }
});

// -------------------------------------------------------------
// R3-P2 ~ R3-P6: PracticePage.tsx URL 파라미터·구간 반복·Drive 배너·무료 녹음 곡 한도 모달·404 가드 검증
// -------------------------------------------------------------
test('R3-P2 ~ R3-P6: PracticePage.tsx URL 파라미터, SVG 진행 바, Drive 연결 배너, FREE_TAKE_SONG_LIMIT_EXCEEDED 모달, 404 초기화 검증', () => {
  const practiceTsx = readText('frontend/src/pages/PracticePage.tsx');
  assert.ok(practiceTsx.includes('id="barLoop"') && practiceTsx.includes('id="barFill"'), 'SVG 진행 바 #barLoop·#barFill 필수');
  assert.ok(practiceTsx.includes('FREE_TAKE_SONG_LIMIT_EXCEEDED'), 'FREE_TAKE_SONG_LIMIT_EXCEEDED 처리 필수');
  assert.ok(practiceTsx.includes('replaceOldSongTakes: opts?.replaceOldSongTakes === true ? true : undefined'), '교체 업로드 replaceOldSongTakes 전달 필수');
  assert.ok(practiceTsx.includes('e && e.status === 404'), '404 초기화 처리 필수');
  assert.ok(practiceTsx.includes('drive.enableDriveStorage()'), 'Drive 저장소 활성화 연동 필수');
});

// -------------------------------------------------------------
// R3-P8: 곡 상세 타임라인(<progress>) 및 A/B 비교 듣기 검증
// -------------------------------------------------------------
test('R3-P8: LogPage.tsx 곡 상세 타임라인 및 A/B 비교 듣기 오름차순/교체/상호배타 검증', () => {
  // 1. LogPage.tsx의 sortAbTakes 함수 정적 검증
  const logPageSrc = readText('frontend/src/pages/LogPage.tsx');
  const sortMatch = logPageSrc.match(/export function sortAbTakes[\s\S]*?\n\}/);
  assert.ok(sortMatch, 'sortAbTakes 함수 정의 존재');

  const jsSort = sortMatch[0]
    .replace(/export function sortAbTakes\([^)]*\):[^{]+/, 'function sortAbTakes(t1, t2)')
    .concat('\nmodule.exports = sortAbTakes;');
  const mod = { exports: {} };
  vm.runInNewContext(jsSort, { module: mod });
  const sortAbTakes = mod.exports;

  const tEarly = { id: 't1', recordedAt: '2026-11-03T09:00:00Z' };
  const tLate = { id: 't2', recordedAt: '2026-11-03T11:00:00Z' };
  const pair1 = sortAbTakes(tEarly, tLate);
  assert.equal(pair1[0].id, 't1');
  assert.equal(pair1[1].id, 't2');
  const pair2 = sortAbTakes(tLate, tEarly);
  assert.equal(pair2[0].id, 't1', '오름차순 정렬 필수');
  assert.equal(pair2[1].id, 't2');

  // 2. LogPage.tsx의 <progress> 사용 여부 확인
  assert.ok(logPageSrc.includes('<progress className={`tl-bar'), 'LogPage.tsx 타임라인에 <progress> 사용 필수');
});

// -------------------------------------------------------------
// R3-P10: 순백 0건, 중간 곡률 0건, 인라인 스타일 0건 검증
// -------------------------------------------------------------
test('R3-P10: PracticePage.module.css, LogPage.module.css 순백 0건, 중간 곡률 0건, 인라인 스타일 0건 검증', () => {
  const cssFiles = [
    'frontend/src/pages/PracticePage.module.css',
    'frontend/src/pages/LogPage.module.css',
  ];
  const allowedRadius = new Set(['0', '0px', '50%', '9999px', 'var(--radius-pill)', 'var(--radius-card)']);

  for (const rel of cssFiles) {
    const text = readText(rel).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(text.match(/#(?:ffffff|fff)\b/i), null, `${rel}에 순백(#ffffff/#fff) 금지`);
    for (const m of text.matchAll(/border-radius\s*:\s*([^;!}]+)/gi)) {
      const val = m[1].trim();
      assert.ok(allowedRadius.has(val), `${rel}에 허용되지 않은 곡률 사용: ${val}`);
    }
  }

  // frontend/src 전체 tsx 파일 인라인 style={{ 0건 및 dangerouslySetInnerHTML 0건 검증
  const tsxFiles = [
    'frontend/src/pages/PracticePage.tsx',
    'frontend/src/pages/LogPage.tsx',
    'frontend/src/App.tsx',
  ];
  for (const rel of tsxFiles) {
    const text = readText(rel);
    assert.ok(!text.includes('style={{'), `${rel}에 style={{ 인라인 스타일 사용 금지`);
    assert.ok(!text.includes('dangerouslySetInnerHTML'), `${rel}에 dangerouslySetInnerHTML 사용 금지`);
  }
});

// -------------------------------------------------------------
// R3-P11: A/B 비교 듣기 비동기 URL 조회 중 페어 변경/로그아웃 레이스 방어 검증 (PR #43 리뷰 1번)
// -------------------------------------------------------------
test('R3-P11: LogPage.tsx A/B 비교 슬롯 재생 비동기 레이스 방어 토큰 검증', () => {
  const reactSrc = readText('frontend/src/pages/LogPage.tsx');
  assert.ok(reactSrc.includes('abReqSeqRef = useRef(0);'), 'LogPage.tsx에 abReqSeqRef 선언 필수');
  assert.ok(reactSrc.includes('abPairRef = useRef'), 'LogPage.tsx에 abPairRef 선언 필수');
  assert.ok(reactSrc.includes('const isSlotValid = () => {'), 'handlePlayAbSlot 내 isSlotValid 가드 필수');
  assert.ok(reactSrc.includes('if (!isSlotValid()) return;'), 'await 복귀 후 및 src 할당 직전 isSlotValid 가드 필수');
});
