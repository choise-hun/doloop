// test/card_audio.test.js
// S3b-4 D3·D4 단일 카드 플레이어(frontend/src/lib/cardAudio.ts) 단위 테스트 — 가짜 audio 요소
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'frontend/src/lib/cardAudio.ts'), 'utf8');

function fakeAudio(log) {
  const listeners = {};
  const el = {
    dataset: {},
    attrs: {},
    preload: '',
    playResult: () => Promise.resolve(),
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    emit: (name) => (listeners[name] || []).forEach((fn) => fn()),
    pause: () => log.push('pause'),
    load: () => log.push('load'),
    removeAttribute: (n) => { log.push('removeAttribute:' + n); delete el.attrs[n]; },
    play: () => { log.push('play:' + el.attrs.src); return el.playResult(); },
  };
  Object.defineProperty(el, 'src', {
    get: () => el.attrs.src || '',
    set: (v) => { log.push('src=' + v); el.attrs.src = v; },
  });
  // dataset 삭제를 기록한다
  el.dataset = new Proxy({}, {
    deleteProperty: (o, k) => { log.push('delete dataset.' + String(k)); delete o[k]; return true; },
  });
  return el;
}

function load() {
  const ctx = {
    exports: {},
    require: (id) => {
      if (id === './auth') return { auth: { getUser: () => null, onChange: () => () => {} } };
      if (id === './apiClient') return { apiClient: { community: {} } };
      throw new Error('unexpected import: ' + id);
    },
    AbortController, Promise, Error, Set, Number, String, console,
  };
  const out = ts.transpileModule(SRC, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(out, ctx);
  return ctx.exports;
}

function setup() {
  const { createCardAudio } = load();
  const log = [];
  const pending = [];
  let uid = 'user-A';
  let el = null;
  const calls = [];
  const player = createCardAudio({
    fetchUrl: (postId, attachmentId, signal) => {
      calls.push({ postId, attachmentId, signal });
      return new Promise((resolve, reject) => pending.push({ attachmentId, resolve, reject }));
    },
    createAudio: () => { el = fakeAudio(log); return el; },
    getUid: () => uid,
  });
  const states = [];
  player.subscribe((s) => states.push(s.status + ':' + (s.attachmentId || '-')));
  return {
    player, log, pending, calls, states,
    el: () => el,
    setUid: (u) => { uid = u; },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('S3b4-P1t 재생: 주소 1회 요청, loading → playing', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  assert.equal(h.player.getSnapshot().status, 'loading');
  assert.equal(h.calls.length, 1);
  h.pending[0].resolve({ url: 'https://x/a1', expiresIn: 300 });
  assert.equal(await p, 'playing');
  assert.deepEqual({ ...h.player.getSnapshot() }, { postId: 'post-1', attachmentId: 'att-1', status: 'playing', error: null });
  assert.equal(h.el().attrs.src, 'https://x/a1');
  assert.equal(h.el().dataset.attachmentId, 'att-1');
  assert.ok(h.states.includes('loading:att-1') && h.states.includes('playing:att-1'));
});

test('S3b4-P2t 단일 재생: A 재생 중 B 재생 → A 정리 뒤 B만 재생, 요소는 1개', async () => {
  const h = setup();
  const pa = h.player.toggle('post-1', 'att-A');
  h.pending[0].resolve({ url: 'https://x/A' });
  await pa;
  const firstEl = h.el();
  h.log.length = 0;
  const pb = h.player.toggle('post-2', 'att-B');
  assert.deepEqual(h.log.slice(0, 4), ['pause', 'removeAttribute:src', 'load', 'delete dataset.attachmentId']);
  h.pending[1].resolve({ url: 'https://x/B' });
  assert.equal(await pb, 'playing');
  assert.equal(h.el(), firstEl, '여러 Audio 요소를 만들지 않는다');
  assert.equal(h.el().attrs.src, 'https://x/B');
  assert.equal(h.player.getSnapshot().attachmentId, 'att-B');
});

test('S3b4-P3t 늦은 응답: A 주소 대기 중 B 재생 → 늦은 A 응답은 버린다', async () => {
  const h = setup();
  const pa = h.player.toggle('post-1', 'att-A');
  const pb = h.player.toggle('post-2', 'att-B');
  assert.equal(h.calls[0].signal.aborted, true, '이전 요청은 취소 신호를 받는다');
  h.pending[1].resolve({ url: 'https://x/B' });
  assert.equal(await pb, 'playing');
  h.pending[0].resolve({ url: 'https://x/A-late' });
  assert.equal(await pa, 'stale');
  await tick();
  assert.equal(h.el().attrs.src, 'https://x/B');
  assert.equal(h.el().dataset.attachmentId, 'att-B');
  assert.equal(h.player.getSnapshot().attachmentId, 'att-B');
  assert.ok(!h.log.includes('src=https://x/A-late'));
});

test('S3b4-P4t 정리 순서: stop() = pause → removeAttribute(src) → load → dataset 제거, src="" 금지', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.pending[0].resolve({ url: 'https://x/a1' });
  await p;
  h.log.length = 0;
  h.player.stop();
  assert.deepEqual(h.log, ['pause', 'removeAttribute:src', 'load', 'delete dataset.attachmentId']);
  assert.equal(h.el().attrs.src, undefined);
  assert.equal(h.player.getSnapshot().status, 'idle');
  assert.ok(!/src=\s*''/.test(SRC.replace(/\/\/.*$/gm, '')), "src = '' 대입 금지");
});

test('S3b4-P4t 같은 버튼 다시 누름 = 정지', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.pending[0].resolve({ url: 'https://x/a1' });
  await p;
  assert.equal(await h.player.toggle('post-1', 'att-1'), 'stopped');
  assert.equal(h.player.getSnapshot().status, 'idle');
  assert.equal(h.calls.length, 1);
});

test('S3b4-P5t 계정 전환: 대기 중 uid가 바뀌면 응답을 버리고 reset()은 재생을 멈춘다', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.setUid('user-B');
  h.pending[0].resolve({ url: 'https://x/a1' });
  assert.equal(await p, 'stale');
  assert.equal(h.el(), null, '다른 계정에서 src를 넣지 않는다');
  assert.equal(h.player.getSnapshot().status, 'idle', '버린 요청이 loading 상태를 남기지 않는다');

  const p2 = h.player.toggle('post-1', 'att-1');
  h.pending[1].resolve({ url: 'https://x/a1b' });
  await p2;
  h.player.reset();
  assert.equal(h.el().attrs.src, undefined);
  assert.equal(h.player.getSnapshot().status, 'idle');
});

test('S3b4-P6t 404 → gone 결과와 error 상태', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.pending[0].reject(Object.assign(new Error('nf'), { status: 404, code: 'NOT_FOUND' }));
  assert.equal(await p, 'gone');
  assert.deepEqual({ ...h.player.getSnapshot() }, { postId: 'post-1', attachmentId: 'att-1', status: 'error', error: 'gone' });
});

test('S3b4-P7t 재생 중 오류 이벤트 → error, 다시 누르면 새 주소를 요청', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.pending[0].resolve({ url: 'https://x/old' });
  await p;
  h.el().emit('error');
  assert.equal(h.player.getSnapshot().status, 'error');
  assert.equal(h.player.getSnapshot().error, 'failed');
  assert.equal(h.el().attrs.src, undefined, '오류 뒤 만료 주소를 남기지 않는다');
  const p2 = h.player.toggle('post-1', 'att-1');
  assert.equal(h.calls.length, 2, '같은 버튼이라도 error 상태면 재시도');
  h.pending[1].resolve({ url: 'https://x/new' });
  assert.equal(await p2, 'playing');
  assert.equal(h.el().attrs.src, 'https://x/new');
});

test('S3b4 ended → idle, stopPost는 그 카드가 재생 중일 때만 정지', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  h.pending[0].resolve({ url: 'https://x/a1' });
  await p;
  h.player.stopPost('post-2');
  assert.equal(h.player.getSnapshot().status, 'playing');
  h.el().emit('ended');
  assert.equal(h.player.getSnapshot().status, 'idle');
  const p2 = h.player.toggle('post-1', 'att-1');
  h.pending[1].resolve({ url: 'https://x/a1' });
  await p2;
  h.player.stopPost('post-1');
  assert.equal(h.player.getSnapshot().status, 'idle');
  assert.equal(h.el().attrs.src, undefined);
});

test('S3b4 play() 거절(자동 재생 차단 등) → failed', async () => {
  const h = setup();
  const p = h.player.toggle('post-1', 'att-1');
  // 요소가 만들어지기 전이라 playResult는 첫 play 호출 시 덮어쓴다
  h.pending[0].resolve({ url: 'https://x/a1' });
  await tick();
  // 첫 재생은 성공했으므로 정지 후 재시도에서 거절을 흉내 낸다
  await p;
  h.player.stop();
  h.el().playResult = () => Promise.reject(Object.assign(new Error('NotAllowed'), { name: 'NotAllowedError' }));
  const p2 = h.player.toggle('post-1', 'att-1');
  h.pending[1].resolve({ url: 'https://x/a1' });
  assert.equal(await p2, 'failed');
  assert.equal(h.player.getSnapshot().status, 'error');
  assert.equal(h.el().attrs.src, undefined);
});
