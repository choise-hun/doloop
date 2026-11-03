'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CT = require('../public/lib/theory.js');
const GE = require('../public/lib/voicing.js');
const { routes } = require('../server.js');

const q = (o) => new URLSearchParams(o);

test('Cmaj7 Drop 2 기본형은 1-2-3-4번줄에서 x x 10 12 12 12', () => {
  const st = CT.dropStructure('d2')[0];
  const p = CT.placeOn(st, [2, 3, 4, 5], 0, 'maj7', {}).find((x) => x.ok);
  assert.deepEqual(p.frets, [10, 12, 12, 12]);
});

test('같은 자리에서 maj7 -> 7 은 7도 줄만 1프렛 내려간다', () => {
  const st = CT.dropStructure('d2')[0];
  const m = CT.mutation('maj7', '7', st, [2, 3, 4, 5]);
  assert.equal(m.length, 1);
  assert.equal(m[0].delta, -1);
  assert.equal(m[0].to, 'b7');
});

test('2-note-per-string 은 줄마다 정확히 두 음', () => {
  const ns = CT.arpeggio2nps(0, 0, 3);
  assert.equal(ns.length, 12);
  for (let s = 0; s < 6; s++) assert.equal(ns.filter((n) => n.s === s).length, 2);
  for (let i = 1; i < ns.length; i++) assert.ok(ns[i].pitch > ns[i - 1].pitch);
});

test('F# A C# G# 배열은 Dmaj7(#11), Ebm7(b5), Ab7sus4(b9) 로 해석된다', () => {
  const notes = [[2, 4], [3, 2], [4, 2], [5, 4]].map(([s, f]) => ({ s, f, pitch: CT.OPEN[s] + f }));
  const names = CT.interpret(notes).map((x) => x.name);
  assert.ok(names.includes('Dmaj7(#11)'));
  assert.ok(names.some((n) => n.startsWith('Ebm7(b5')));
  assert.ok(names.includes('Ab7sus4(b9)'));
});

test('5도권: F9 탑 G 는 Bb13, Eb7(3도) 로 이어지고 Ab 칸은 불가', () => {
  const st = CT.circleSteps(5, 2);
  assert.deepEqual(st.slice(0, 3).map((s) => s.deg), ['9', '13', '3']);
  assert.equal(st[3].q, null);
});

test('도미넌트 텐션 코드는 그 텐션이 실제로 들어간 폼만 나온다', () => {
  const vs = GE.genVoicings(0, '7b9', { lo: 1, hi: 12 });
  assert.ok(vs.length > 0);
  assert.ok(vs.every((v) => v.notes.some((n) => n.deg === 'b9')));
});

test('API: interpret 는 잘못된 입력에 오류를 낸다', () => {
  assert.throws(() => routes['/api/interpret'](q({ frets: '1,2' })));
  const ok = routes['/api/interpret'](q({ frets: 'x,x,4,2,2,4' }));
  assert.ok(ok.length >= 4);
});

test('API: matrix, circle, voicings 응답 형태', () => {
  assert.ok(routes['/api/matrix'](q({ root: 'C', drop: 'd2', inv: '0' }))[0].qualities.length === 9);
  assert.equal(routes['/api/circle'](q({ root: 'F', top: '2' })).length, 12);
  assert.equal(routes['/api/voicings'](q({ root: 'G', quality: '13' })).chord, 'G13');
});

test('스케일 음이름: 도수마다 글자를 하나씩 쓴다', () => {
  const names = (r, s) => CT.scaleInfo(r, s).notes.map((n) => n.name).join(' ');
  assert.equal(names(0, 'pentMaj'), 'C D E G A');
  assert.equal(names(2, 'harmMinor'), 'D E F G A Bb C#');
  assert.equal(names(6, 'major'), 'Gb Ab Bb Cb Db Eb F');
  assert.equal(names(11, 'lydian'), 'B C# D# E# F# G# A#');
});

test('5도권 순환: 메이저 스케일은 키마다 한 음만 바뀐다', () => {
  const ks = CT.scaleCircle(0, 'major', 1);
  assert.deepEqual(ks.map((k) => k.rootName).slice(0, 4), ['C', 'G', 'D', 'A']);
  assert.deepEqual([ks[1].removed, ks[1].added], [['F'], ['F#']]);
  ks.forEach((k) => assert.equal(k.added.length, 1));
  assert.deepEqual(CT.scaleCircle(0, 'major', -1).map((k) => k.rootName).slice(0, 3), ['C', 'F', 'Bb']);
});

test('지판 위 스케일: 6현 0~12프렛 C 메이저 펜타는 줄마다 5~6개', () => {
  const ns = CT.scaleOnBoard(0, 'pentMaj', CT.TUNING_BY.g6.open, 0, 12);
  for (let s = 0; s < 6; s++) { const c = ns.filter((n) => n.s === s).length; assert.ok(c >= 5 && c <= 6); }
  assert.ok(ns.filter((n) => n.isRoot).every((n) => CT.pc(n.pitch) === 0));
});

test('API: scale', () => {
  const r = routes['/api/scale'](q({ root: 'A', type: 'pentMin', tuning: 'b4', lo: '5', hi: '8' }));
  assert.equal(r.name, 'A Pentatonic Minor');
  assert.ok(r.positions.every((p) => p.fret >= 5 && p.fret <= 8 && p.string >= 1 && p.string <= 4));
  assert.equal(routes['/api/scale'](q({ root: 'C', circle: '5' })).length, 12);
  assert.throws(() => routes['/api/scale'](q({ type: 'nope' })));
});

test('스케일 베이스(b4, b5, b6) 튜닝 및 CAGED 5블럭 생성', () => {
  assert.ok(CT.TUNING_BY.b6);
  assert.equal(CT.TUNING_BY.b6.kind, 'bass');
  assert.deepEqual(CT.TUNING_BY.b6.open, [23, 28, 33, 38, 43, 48]);
  assert.equal(CT.TUNING_BY.b6.frets, 20);

  for (const t of ['b4', 'b5', 'b6']) {
    const blks = CT.scaleBlocks(0, 'major', CT.TUNING_BY[t].open, CT.TUNING_BY[t].frets);
    assert.equal(blks.length, 5);
    assert.deepEqual(blks.map((b) => b.shape), ['A', 'G', 'E', 'D', 'C']);
    assert.ok(blks.every((b) => b.notes.length >= 10));
  }
});

test('CAGED 5블럭 C Major #1 (A) Shape 루프 시퀀스 (5·3 C -> 1·5 A -> 6·3 G -> 5·3 C)', () => {
  const blks = CT.scaleBlocks(0, 'major', CT.TUNING_BY.g6.open, 22);
  const b1 = blks[0];
  assert.equal(b1.blockId, 1);
  assert.equal(b1.shape, 'A');
  assert.equal(b1.label, '#1 Block · (A) Shape');
  assert.equal(b1.lo, 2);
  assert.equal(b1.hi, 6);
  assert.equal(b1.notes.length, 16);

  // 최저 루트 플래그
  const lowestRoot = b1.notes.find((n) => n.isLowestRoot);
  assert.ok(lowestRoot);
  assert.equal(lowestRoot.s, 1); // 5번줄
  assert.equal(lowestRoot.f, 3);
  assert.equal(lowestRoot.pitch, 48);

  const seq = CT.scaleBlockSeq(b1.notes);
  assert.equal(seq.length, 31); // 13 + 15 + 3 = 31

  // 1) 시작: 5번줄 3프렛 C
  assert.equal(seq[0].s, 1);
  assert.equal(seq[0].f, 3);
  assert.equal(seq[0].pitch, 48);
  assert.equal(seq[0].name, 'C');

  // 2) 13번째 스텝(고음 정점): 1번줄 5프렛 A
  assert.equal(seq[12].s, 5);
  assert.equal(seq[12].f, 5);
  assert.equal(seq[12].pitch, 69);
  assert.equal(seq[12].name, 'A');

  // 3) 28번째 스텝(저음 정점): 6번줄 3프렛 G
  assert.equal(seq[27].s, 0);
  assert.equal(seq[27].f, 3);
  assert.equal(seq[27].pitch, 43);
  assert.equal(seq[27].name, 'G');

  // 4) 31번째 스텝(종착): 5번줄 3프렛 C 복귀
  assert.equal(seq[30].s, 1);
  assert.equal(seq[30].f, 3);
  assert.equal(seq[30].pitch, 48);
  assert.equal(seq[30].name, 'C');
});

test('더블 스탑 3도·6도·4도 계산 엔진 검증', () => {
  // 3도 (2-1번줄: pair [4, 5])
  const ds3 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '3rd', pair: [4, 5], lo: 0, hi: 17 });
  assert.equal(ds3.length, 10);
  assert.equal(ds3[0].label, 'C+E');
  assert.equal(ds3[0].span, 1);
  assert.equal(ds3[0].isRootPair, true);
  assert.ok(ds3.every((d) => {
    const diff = d.notes[1].pitch - d.notes[0].pitch;
    return diff === 3 || diff === 4;
  }));

  // 6도 (3-1번줄: pair [3, 5])
  const ds6 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '6th', pair: [3, 5], lo: 0, hi: 17 });
  assert.equal(ds6.length, 11);
  assert.equal(ds6[0].label, 'G+E');
  assert.equal(ds6[3].label, 'C+A');
  assert.equal(ds6[3].isRootPair, true);
  assert.ok(ds6.every((d) => {
    const diff = d.notes[1].pitch - d.notes[0].pitch;
    return diff === 8 || diff === 9;
  }));

  // 4도 (2-1번줄: pair [4, 5])
  const ds4 = CT.doubleStops({ rootPc: 0, scaleId: 'major', interval: '4th', pair: [4, 5], lo: 0, hi: 17 });
  assert.equal(ds4.length, 11);
  assert.equal(ds4[1].label, 'C+F');
  assert.equal(ds4[1].isRootPair, true);
  assert.ok(ds4.every((d) => {
    const diff = d.notes[1].pitch - d.notes[0].pitch;
    return diff === 5 || diff === 6;
  }));
});

test('API: scale?block=1 및 double-stops 엔드포인트 응답', () => {
  // 1. GET /api/scale?root=C&type=major&block=1
  const b1Res = routes['/api/scale'](q({ root: 'C', type: 'major', block: '1' }));
  assert.equal(b1Res.name, 'C Major (Ionian)');
  assert.equal(b1Res.block.id, 1);
  assert.equal(b1Res.block.shape, 'A');
  assert.equal(b1Res.positions.length, 16);
  assert.equal(b1Res.sequence.length, 31);
  assert.equal(b1Res.sequence[0].note, 'C');
  assert.equal(b1Res.sequence[0].string, 5); // 5번줄

  // 2. GET /api/double-stops?root=C&type=major&interval=3rd&strings=1-2
  const dsRes = routes['/api/double-stops'](q({ root: 'C', type: 'major', interval: '3rd', strings: '1-2' }));
  assert.equal(dsRes.length, 10);
  assert.equal(dsRes[0].step, 1);
  assert.equal(dsRes[0].label, 'C+E');
  assert.equal(dsRes[0].notes.length, 2);
  assert.equal(dsRes[0].notes[0].string, 2); // 2번줄
  assert.equal(dsRes[0].notes[1].string, 1); // 1번줄

  // 3. 에러 분기
  assert.throws(() => routes['/api/scale'](q({ block: '0' })));
  assert.throws(() => routes['/api/scale'](q({ block: '6' })));
  assert.throws(() => routes['/api/double-stops'](q({ interval: 'invalid' })));
  assert.throws(() => routes['/api/double-stops'](q({ strings: '1-99' })));
});
