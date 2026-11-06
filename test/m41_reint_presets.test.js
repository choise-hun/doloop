// M4-1: 코드 재해석 프리셋 — 표준 이름·엔진 해석 확인 (명세: 개발산출물/명세/M4-1_구현명세.md)
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let P;
let CT;
before(async () => {
  P = await import('../frontend/src/lib/chords/reintPresets.mts');
  CT = (await import('../frontend/src/lib/engine/theory.mjs')).default;
});

function names(frets) {
  const notes = frets
    .map((f, s) => (f < 0 ? null : { s, f, pitch: CT.OPEN[s] + f }))
    .filter(Boolean);
  return CT.interpret(notes).map((i) => i.name);
}

test('M41-1 프리셋 5개 · id·label 중복 없음 · 6줄 · 기본 id 존재', () => {
  assert.equal(P.REINT_PRESETS.length, 5);
  assert.equal(new Set(P.REINT_PRESETS.map((p) => p.id)).size, 5);
  assert.equal(new Set(P.REINT_PRESETS.map((p) => p.label)).size, 5);
  for (const p of P.REINT_PRESETS) {
    assert.equal(p.frets.length, 6, p.id);
    assert.ok(p.hint.length > 0, p.id);
  }
  assert.ok(P.REINT_PRESETS.some((p) => p.id === P.DEFAULT_REINT_PRESET_ID));
});

test('M41-2 각 프리셋의 기준 해석이 엔진 결과에 있다', () => {
  const expect = {
    drop2: ['Gmaj7'],
    quartal: ['D7sus4', 'Am7(11)'],
    rootless9: ['Eb7(9)'],
    rootless13: ['B7(9,13)'],
    m6: ['Gm6', 'Em7(b5)'],
  };
  for (const p of P.REINT_PRESETS) {
    const got = names(p.frets);
    for (const n of expect[p.id]) assert.ok(got.includes(n), `${p.id}: ${n} 없음 — ${got.join(', ')}`);
  }
});

test('M41-3 옛 이름(모양 n)이 남지 않음', () => {
  for (const p of P.REINT_PRESETS) assert.doesNotMatch(p.label, /모양\s*\d/);
});
