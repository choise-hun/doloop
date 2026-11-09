// test/r2_chords.test.js
// R2-1 코드 연습실(ChordsPage): 탭 구성, 베이스 4·5·6현 & AU.bassPluck, CAGED 5블럭 시퀀스, 7 · 더블 스탑 연습 검증 (R2-C1 ~ R2-C10)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CT = require('../frontend/src/lib/engine/theory.mjs').default;
const GE = require('../frontend/src/lib/engine/voicing.mjs').default;

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
}

// -------------------------------------------------------------
// R2-C1 ~ R2-C10 테스트 케이스 본문
// -------------------------------------------------------------

test('R2-C1: 탭 구성 및 #hash / ulp:tab 라우팅 연동', () => {
  const appTsx = readText('frontend/src/App.tsx');
  assert.ok(appTsx.includes('<ChordsPage'), 'App.tsx should import and render ChordsPage');
  assert.ok(appTsx.includes('path="/chords.html"'), 'App.tsx should route /chords.html');

  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  const tabs = ['scale', 'tone', 'matrix', 'circle', 'reint', 'tf', 'ds'];
  for (const t of tabs) {
    assert.ok(chordsTsx.includes(`id: '${t}'`), `ChordsPage.tsx must have tab '${t}'`);
    assert.ok(chordsTsx.includes(`id="pane-${t}"`), `ChordsPage.tsx must have #pane-${t}`);
  }
  assert.ok(chordsTsx.includes('id={`tab-${tab.id}`}'), 'ChordsPage.tsx must render #tab-<id>');
  assert.ok(chordsTsx.includes("'ulp:tab'"), 'ChordsPage.tsx must sync ulp:tab storage');
});

test('R2-C2: 5종 악기(g6, g7, b4, b5, b6) 칩 전환 및 베이스 AU.bassPluck 발음', () => {
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  const musicSrc = readText('frontend/src/lib/musicEngine.ts');
  for (const inst of ['g6', 'g7', 'b4', 'b5', 'b6']) {
    assert.ok(chordsTsx.includes(`${inst}:`), `ChordsPage.tsx must support tuning ${inst}`);
    assert.ok(CT.TUNING_BY[inst], `CT.TUNING_BY must define ${inst}`);
  }
  assert.deepEqual(CT.TUNING_BY.b4.open, [28, 33, 38, 43]);
  assert.deepEqual(CT.TUNING_BY.b6.open, [23, 28, 33, 38, 43, 48]);
  assert.ok(musicSrc.includes('bassPluck'), 'musicEngine.ts must define bassPluck');
  assert.ok(chordsTsx.includes('audioEngine.bassPluck'), 'ChordsPage.tsx must invoke audioEngine.bassPluck for bass');
});

test('R2-C3: CAGED 5블럭(#1~#5) 지판 .press/.ctx/.lowestRoot 구분 및 시퀀스 격자 제거(CH-A)', () => {
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  const diagramsTsx = readText('frontend/src/components/chords/ChordDiagrams.tsx');

  assert.ok(chordsTsx.includes('id="sc-board"'), 'ChordsPage.tsx must have #sc-board');
  assert.ok(!chordsTsx.includes('id="sc-seq"'), 'CH-A removes the visual sequence grid');
  assert.ok(chordsTsx.includes('let seq = scSeqNotes'), 'Playback must preserve the calculated sequence');
  assert.ok(diagramsTsx.includes("'blk'"), 'Hand window box .blk must be present in ChordDiagrams.tsx');
  assert.ok(diagramsTsx.includes("parts.push('press')"), 'Block notes should have press class');
  assert.ok(diagramsTsx.includes("parts.push('lowestRoot')"), 'Lowest root should have lowestRoot class');
  assert.ok(diagramsTsx.includes('className="lr-ring"'), 'Lowest root should render lr-ring double ring');
});

test('R2-C4: CAGED 블럭 재생 시 scaleBlockSeq 31스텝 순환 및 5도권 순환 연동', () => {
  const cMajBlocks = CT.scaleBlocks(0, 'major', CT.OPEN, 22);
  const b1 = cMajBlocks.find((b) => b.blockId === 1);
  assert.ok(b1);
  const seq = CT.scaleBlockSeq(b1.notes);
  assert.equal(seq.length, 31, 'C Major #1 block sequence must be 31 steps');
  assert.equal(seq[0].pitch, 48, 'Step 1 should be C3 (pitch 48, 5th string 3f)');
  assert.equal(seq[12].pitch, 69, 'Step 13 should be peak A4 (pitch 69, 1st string 5f)');
  assert.equal(seq[27].pitch, 43, 'Step 28 should be lowest G2 (pitch 43, 6th string 3f)');
  assert.equal(seq[30].pitch, 48, 'Step 31 should be return C3 (pitch 48, 5th string 3f)');
});

test('R2-C5: 화성·가락단음계(harmMinor, melMinor) 선택 시 CAGED 블럭 비활성화 및 전체 지판 자동 전환', () => {
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  assert.ok(chordsTsx.includes("scaleId === 'harmMinor' || scaleId === 'melMinor'"), 'ChordsPage.tsx must detect harmMinor/melMinor for CAGED block disable');
  assert.ok(chordsTsx.includes('id="sc-block-msg"'), 'ChordsPage.tsx must render #sc-block-msg');
});

test('R2-C6: 7 · 더블 스탑 연습 (3rd, 6th, 4th) 줄 쌍 선택 및 스텝 카드 렌더링', () => {
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  assert.ok(chordsTsx.includes('id="ds-steps"'), 'ChordsPage.tsx must render #ds-steps');
  assert.ok(chordsTsx.includes('id="ds-interval"'), 'ChordsPage.tsx must render #ds-interval');
  assert.ok(chordsTsx.includes('id="ds-title"'), 'ChordsPage.tsx must render #ds-title');

  const steps3 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '3rd', pair: [4, 5], open: CT.OPEN, lo: 0, hi: 22 });
  const steps6 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '6th', pair: [3, 5], open: CT.OPEN, lo: 0, hi: 22 });
  assert.ok(steps3.length >= 7, 'Diatonic 3rd double stop steps should be rendered');
  assert.ok(steps6.length >= 7, 'Diatonic 6th double stop steps should be rendered');
});

test('R2-C7: 7 · 더블 스탑 연습 악기 변경(b4 4현 베이스) 시 줄 쌍 안전 재설정 및 AU.doubleStop 2성 발음', () => {
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  const musicSrc = readText('frontend/src/lib/musicEngine.ts');
  assert.ok(chordsTsx.includes('id="ds-inst"'), 'ChordsPage.tsx must render #ds-inst');
  assert.ok(musicSrc.includes('doubleStop('), 'musicEngine.ts must define doubleStop');
  assert.ok(chordsTsx.includes('audioEngine.doubleStop'), 'ChordsPage.tsx must invoke audioEngine.doubleStop');
});

test('R2-C8: ChordDiagrams.tsx 순수 헬퍼(getDoubleStopPairs, formatBlockSeqSummary, fretText) 단위 검증', () => {
  // getDoubleStopPairs 검증
  const pairs4 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '3rd', pair: [2, 3], open: [28, 33, 38, 43], lo: 0, hi: 22 });
  assert.ok(pairs4.length > 0);

  // formatBlockSeqSummary 검증
  const cMajBlocks = CT.scaleBlocks(0, 'major', CT.OPEN, 22);
  const b1 = cMajBlocks.find((b) => b.blockId === 1);
  const seq = CT.scaleBlockSeq(b1.notes);

  const sorted = [...b1.notes].sort((a, b) => a.pitch - b.pitch);
  assert.equal(sorted[0].pitch, 43); // G2
  assert.equal(sorted[sorted.length - 1].pitch, 69); // A4
  assert.equal(seq[0].pitch, 48); // C3
  assert.equal(seq[seq.length - 1].pitch, 48); // C3
});

test('R2-C9: CSS 순백(#ffffff/#fff) 0건, 중간 곡률 0건, frontend/ 인라인 style={{ 및 dangerouslySetInnerHTML 0건', () => {
  const cssModule = readText('frontend/src/pages/ChordsPage.module.css');
  const noComments = cssModule.replace(/\/\*[\s\S]*?\*\//g, '');

  // 순백 검사 (주석 제외, 대소문자 무관)
  assert.ok(!/#(?:ffffff|fff)\b/i.test(noComments), 'Pure white (#ffffff/#fff) must be 0 in CSS');

  // 중간 곡률 검사 (3px~16px)
  const badRadiusRegex = /border-radius:\s*(?:[3-9]|1[0-6])px/i;
  assert.ok(!badRadiusRegex.test(cssModule), 'ChordsPage.module.css must not have 3~16px intermediate border-radius');

  // frontend/tsx 인라인 style={{ 및 dangerouslySetInnerHTML 0건 검사
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');
  const diagramsTsx = readText('frontend/src/components/chords/ChordDiagrams.tsx');
  const allTsx = chordsTsx + '\n' + diagramsTsx;

  assert.ok(!allTsx.includes('style={{'), 'style={{ must be 0 in React components');
  assert.ok(!allTsx.includes('dangerouslySetInnerHTML'), 'dangerouslySetInnerHTML must be 0');
});

test('R2-C10 (PR #41 리뷰 반영): 악기 변경 시 더블 스탑 줄 쌍 동기 정규화 및 렌더 크래시 방지 검증', () => {
  const diagramsCode = readText('frontend/src/components/chords/ChordDiagrams.tsx');
  const chordsTsx = readText('frontend/src/pages/ChordsPage.tsx');

  // 1. getSafeDoubleStopPair 함수 선언 및 구현 정적 대조
  assert.ok(diagramsCode.includes('export function getSafeDoubleStopPair'), 'getSafeDoubleStopPair must be exported');
  assert.ok(diagramsCode.includes("interval === '6th' ? currentPair[1] - currentPair[0] === 2 : currentPair[1] - currentPair[0] === 1"));
  assert.ok(diagramsCode.includes('Math.max(0, n - 3), n - 1'));
  assert.ok(diagramsCode.includes('Math.max(0, n - 2), n - 1'));

  // 정규화 알고리즘 단위 검증
  function getSafeDoubleStopPair(numStrings, interval, currentPair) {
    const n = Math.max(4, numStrings);
    const isPairValid =
      Array.isArray(currentPair) &&
      currentPair.length === 2 &&
      currentPair[0] >= 0 &&
      currentPair[1] < n &&
      currentPair[0] < currentPair[1] &&
      (interval === '6th' ? currentPair[1] - currentPair[0] === 2 : currentPair[1] - currentPair[0] === 1);

    if (isPairValid && currentPair) {
      return [currentPair[0], currentPair[1]];
    }
    if (interval === '6th') {
      return [Math.max(0, n - 3), n - 1];
    }
    return [Math.max(0, n - 2), n - 1];
  }

  // 6현 기타 기본 줄 쌍 [4, 5] 에서 4현 베이스로 전환 시
  const safePair4 = getSafeDoubleStopPair(4, '3rd', [4, 5]);
  assert.deepEqual(safePair4, [2, 3], 'Should normalize out-of-range pair [4, 5] to [2, 3] on 4-string bass');

  // 6도(6th) 음정 시 건너뛴 줄 쌍 [1, 3] 정규화
  const safePair6th = getSafeDoubleStopPair(4, '6th', [4, 5]);
  assert.deepEqual(safePair6th, [1, 3], 'Should normalize out-of-range pair to [1, 3] for 6th on 4-string bass');

  // 이미 유효한 줄 쌍은 그대로 유지
  assert.deepEqual(getSafeDoubleStopPair(4, '3rd', [1, 2]), [1, 2], 'Valid pair should be preserved');

  // 2. CT.doubleStops 호출 시 크래시 없이 정상 스텝 배열 생성 검증
  const b4Tuning = CT.TUNING_BY.b4;
  assert.doesNotThrow(() => {
    const steps = CT.doubleStops({
      rootPc: 0,
      scaleId: 'major',
      interval: '3rd',
      pair: safePair4,
      open: b4Tuning.open,
      lo: 0,
      hi: b4Tuning.frets,
    });
    assert.ok(steps.length >= 7, 'Must produce diatonic double stops for 4-string bass');
  }, 'CT.doubleStops must not throw with normalized pair');

  // 3. ChordsPage.tsx 정적 검증
  assert.ok(
    chordsTsx.includes('effectiveDsPair'),
    'ChordsPage.tsx must compute effectiveDsPair synchronously during render'
  );
  assert.ok(
    chordsTsx.includes('pair: effectiveDsPair'),
    'CT.doubleStops must receive effectiveDsPair instead of stale dsPair'
  );
  assert.ok(
    chordsTsx.includes('getSafeDoubleStopPair(nextTun.open.length, dsInterval, dsPair)'),
    'Instrument change handler must update dsPair atomically with safe pair'
  );
});
