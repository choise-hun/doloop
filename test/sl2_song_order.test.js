// test/sl2_song_order.test.js
// SL-2 SL2-U1: 곡 순서 부분집합 자리 유지(서버 SongService.applySubsetOrder와 같은 규칙)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const songs = (...ids) => ids.map((id) => ({ id, title: id }));
const ids = (list) => list.map((x) => x.id);

test('SL2-U1 명세 §5.2 예시: [A,B,C,D,E]에서 폴더 [B,D,E]를 [E,B,D]로 → [A,E,C,B,D]', async () => {
  const { applySubsetOrder } = await import('../frontend/src/lib/songOrder.mts');
  const list = songs('A', 'B', 'C', 'D', 'E');
  assert.deepEqual(ids(applySubsetOrder(list, ['E', 'B', 'D'])), ['A', 'E', 'C', 'B', 'D']);
  assert.deepEqual(ids(list), ['A', 'B', 'C', 'D', 'E'], '원본 배열은 바꾸지 않는다');
});

test('SL2-U1 빈 부분집합·모르는 id·중복 id는 무시', async () => {
  const { applySubsetOrder } = await import('../frontend/src/lib/songOrder.mts');
  const list = songs('A', 'B', 'C');
  assert.deepEqual(ids(applySubsetOrder(list, [])), ['A', 'B', 'C']);
  assert.deepEqual(ids(applySubsetOrder(list, ['X', 'C', 'A'])), ['C', 'B', 'A']);
  assert.deepEqual(ids(applySubsetOrder(list, ['C', 'C', 'A'])), ['C', 'B', 'A']);
});

test('SL2-U1 moveId: 한 칸·끝으로 옮기기, 범위 밖은 그대로', async () => {
  const { moveId } = await import('../frontend/src/lib/songOrder.mts');
  assert.deepEqual(moveId(['A', 'B', 'C'], 0, 1), ['B', 'A', 'C']);
  assert.deepEqual(moveId(['A', 'B', 'C'], 2, 0), ['C', 'A', 'B']);
  assert.deepEqual(moveId(['A', 'B', 'C'], 0, 3), ['A', 'B', 'C']);
  assert.deepEqual(moveId(['A', 'B', 'C'], -1, 0), ['A', 'B', 'C']);
});
