// test/yt_bridge.test.js
// M1A-2 원격 플레이어 어댑터(frontend/src/lib/ytBridge.ts) — 명세 §8.1 Y1~Y6. 가짜 window·iframe
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'frontend/src/lib/ytBridge.ts'), 'utf8');
const EMBED = 'https://player.example.test/player-embed.html';
const PLAYER_ORIGIN = 'https://player.example.test';
const APP_ORIGIN = 'capacitor://localhost';

function setup({ platform = 'ios', embedUrl = EMBED } = {}) {
  const listeners = [];
  const sent = [];
  const timers = [];
  const warns = [];
  let clock = 1000;
  const contentWindow = { postMessage: (msg, targetOrigin) => sent.push({ msg, targetOrigin }) };
  const iframe = {
    attrs: {},
    isConnected: false,
    contentWindow,
    setAttribute(n, v) { this.attrs[n] = v; },
    replaceWith(el) { this.isConnected = false; mount.isConnected = true; mount.replacedBy = el; },
  };
  const mount = {
    id: 'player',
    isConnected: true,
    replaceWith(el) { this.isConnected = false; el.isConnected = true; this.replacedBy = el; },
  };
  const window = {
    ULEVELP_CONFIG: { playerEmbedUrl: embedUrl },
    location: { origin: APP_ORIGIN },
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    removeEventListener: (type, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  };
  const ctx = {
    exports: {},
    require: (id) => {
      if (id === '@capacitor/core') return { Capacitor: { getPlatform: () => platform } };
      throw new Error('unexpected import: ' + id);
    },
    window,
    document: {
      getElementById: (id) => (id === 'player' && mount.isConnected ? mount : null),
      createElement: (tag) => { assert.equal(tag, 'iframe'); return iframe; },
    },
    performance: { now: () => clock },
    console: { warn: (...a) => warns.push(a.join(' ')) },
    URL, Error, Number, String, Math, Array,
  };
  const out = ts.transpileModule(SRC, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(out, ctx);
  const emit = (data, { origin = PLAYER_ORIGIN, source = contentWindow } = {}) => {
    listeners.slice().forEach((fn) => fn({ origin, source, data }));
  };
  return {
    api: ctx.exports, iframe, mount, sent, timers, warns, listeners, emit,
    tick: (ms) => { clock += ms; },
  };
}

function recorder() {
  const log = [];
  return {
    log,
    events: {
      onReady: () => log.push(['ready']),
      onStateChange: (e) => log.push(['state', e.data]),
      onPlaybackRateChange: (e) => log.push(['rate', e.data]),
      onError: (e) => log.push(['error', e.data]),
    },
  };
}

const READY = { type: 'ready', duration: 200, rates: [0.25, 0.5, 0.75, 1, 1.5, 2], title: 'Song', author: 'Band' };

test('shouldUseRemotePlayer: ios + https playerEmbedUrl일 때만 참, 설정 없으면 경고 한 번', () => {
  assert.equal(setup().api.shouldUseRemotePlayer(), true);
  assert.equal(setup({ platform: 'android' }).api.shouldUseRemotePlayer(), false);
  assert.equal(setup({ platform: 'web' }).api.shouldUseRemotePlayer(), false);
  const http = setup({ embedUrl: 'http://player.example.test/player-embed.html' });
  assert.equal(http.api.shouldUseRemotePlayer(), false);
  assert.equal(http.api.shouldUseRemotePlayer(), false);
  assert.equal(http.warns.length, 1);
  assert.deepEqual([...setup().api.REMOTE_PLAYER_PLATFORMS], ['ios']);
});

test('createRemotePlayer: #player div를 같은 id iframe으로 바꾸고 src·allow를 정한다, destroy는 되돌린다', () => {
  const s = setup();
  const p = s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', startSeconds: 12.5, events: {} });
  assert.equal(s.iframe.id, 'player');
  assert.equal(s.mount.replacedBy, s.iframe);
  const src = new URL(s.iframe.src);
  assert.equal(src.origin + src.pathname, EMBED);
  assert.equal(src.searchParams.get('v'), 'M7lc1UVf-VE');
  assert.equal(src.searchParams.get('start'), '12.5');
  assert.equal(src.searchParams.get('parent'), APP_ORIGIN);
  assert.equal(s.iframe.attrs.allow, 'autoplay; encrypted-media; picture-in-picture');
  assert.equal(s.iframe.attrs.referrerpolicy, undefined);
  p.destroy();
  assert.equal(s.listeners.length, 0);
  assert.equal(s.mount.isConnected, true);
});

test('Y1 다른 origin 또는 다른 source 메시지는 무시한다', () => {
  const s = setup();
  const r = recorder();
  s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: r.events });
  s.emit(READY, { origin: 'https://evil.example.test' });
  s.emit(READY, { source: {} });
  s.emit({ type: 'error', code: 150 }, { origin: 'https://www.youtube.com' });
  assert.deepEqual(r.log, []);
  s.emit(READY);
  assert.deepEqual(r.log, [['ready']]);
});

test('Y2 ready → onReady 1회, duration·rates·videoData 반영', () => {
  const s = setup();
  const r = recorder();
  const p = s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: r.events });
  s.emit(READY);
  s.emit(READY);
  assert.deepEqual(r.log, [['ready']]);
  assert.equal(p.getDuration(), 200);
  assert.deepEqual([...p.getAvailablePlaybackRates()], READY.rates);
  assert.deepEqual({ ...p.getVideoData() }, { title: 'Song', author: 'Band' });
  assert.equal(s.timers[0].cleared, true);
});

test('Y3 재생 중이면 마지막 status 시각에 경과×배속을 더하고, 정지 중이면 그대로, duration을 넘지 않는다', () => {
  const s = setup();
  const p = s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: {} });
  s.emit(READY);
  s.emit({ type: 'status', time: 10, duration: 200, state: 1, rate: 1.5, title: 'Song', author: 'Band' });
  s.tick(1000);
  assert.ok(Math.abs(p.getCurrentTime() - 11.5) < 1e-9, String(p.getCurrentTime()));
  s.emit({ type: 'status', time: 10, duration: 200, state: 2, rate: 1.5 });
  s.tick(1000);
  assert.equal(p.getCurrentTime(), 10);
  s.emit({ type: 'status', time: 199.5, duration: 200, state: 1, rate: 1 });
  s.tick(5000);
  assert.equal(p.getCurrentTime(), 200);
});

test('Y4 state가 바뀔 때만 onStateChange, rate가 바뀔 때만 onPlaybackRateChange', () => {
  const s = setup();
  const r = recorder();
  s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: r.events });
  s.emit({ type: 'status', time: 1, duration: 200, state: 1, rate: 1 });
  assert.deepEqual(r.log, [], 'ready 전 status는 무시');
  s.emit(READY);
  s.emit({ type: 'status', time: 1, duration: 200, state: 1, rate: 1 });
  s.emit({ type: 'status', time: 1.25, duration: 200, state: 1, rate: 1 });
  s.emit({ type: 'status', time: 1.5, duration: 200, state: 2, rate: 1 });
  s.emit({ type: 'status', time: 1.5, duration: 200, state: 2, rate: 0.75 });
  s.emit({ type: 'status', time: 1.5, duration: 200, state: 2, rate: 0.75 });
  assert.deepEqual(r.log, [['ready'], ['state', 1], ['state', 2], ['rate', 0.75]]);
});

test('Y5 seekTo(30) 직후 getCurrentTime()=30, seek 명령을 플레이어 출처로 보낸다. ready 전 명령은 버린다', () => {
  const s = setup();
  const p = s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: {} });
  p.playVideo();
  p.seekTo(5, true);
  p.setPlaybackRate(1.5);
  assert.deepEqual(s.sent, []);
  s.emit(READY);
  s.emit({ type: 'status', time: 10, duration: 200, state: 1, rate: 1 });
  p.seekTo(30, true);
  assert.equal(p.getCurrentTime(), 30);
  p.playVideo();
  p.pauseVideo();
  p.setPlaybackRate(0.75);
  assert.deepEqual(s.sent.map((x) => ({ ...x.msg })), [
    { type: 'cmd', cmd: 'seek', value: 30 },
    { type: 'cmd', cmd: 'play', value: undefined },
    { type: 'cmd', cmd: 'pause', value: undefined },
    { type: 'cmd', cmd: 'rate', value: 0.75 },
  ]);
  assert.ok(s.sent.every((x) => x.targetOrigin === PLAYER_ORIGIN));
  assert.equal(p.getPlaybackRate(), 1, 'rate는 status로만 반영');
});

test('Y6 ready 전 cue는 마지막 하나만 ready 뒤 보내고, 처음 영상과 같으면 보내지 않는다', () => {
  const s = setup();
  const p = s.api.createRemotePlayer('player', { videoId: 'AAAAAAAAAAA', events: {} });
  p.cueVideoById({ videoId: 'BBBBBBBBBBB', startSeconds: 3 });
  p.cueVideoById({ videoId: 'CCCCCCCCCCC', startSeconds: 7 });
  assert.deepEqual(s.sent, []);
  s.emit(READY);
  assert.deepEqual(s.sent.map((x) => JSON.parse(JSON.stringify(x.msg))), [
    { type: 'cmd', cmd: 'cue', value: { videoId: 'CCCCCCCCCCC', startSeconds: 7 } },
  ]);
  assert.equal(s.sent[0].targetOrigin, PLAYER_ORIGIN);

  const t = setup();
  const q = t.api.createRemotePlayer('player', { videoId: 'AAAAAAAAAAA', events: {} });
  q.cueVideoById({ videoId: 'BBBBBBBBBBB', startSeconds: 3 });
  q.cueVideoById({ videoId: 'AAAAAAAAAAA', startSeconds: 0 });
  t.emit(READY);
  assert.deepEqual(t.sent, []);
});

test('ready가 15초 안에 오지 않으면 onError({data:"timeout"}), error 메시지는 코드 그대로', () => {
  const s = setup();
  const r = recorder();
  s.api.createRemotePlayer('player', { videoId: 'M7lc1UVf-VE', events: r.events });
  assert.equal(s.timers[0].ms, 15000);
  s.timers[0].fn();
  s.emit({ type: 'error', code: 150 });
  assert.deepEqual(r.log, [['error', 'timeout'], ['error', 150]]);
});
