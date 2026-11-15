// EX-4 크롬 확장 — 배속 1.0 복원(영상 이동·패널 닫기) 및 마지막 열림/닫힘 상태 기억 회귀 테스트
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.join(__dirname, '..', 'extension');
const load = (name) => import(require('node:url').pathToFileURL(path.join(EXT, name)).href);
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeFakeEnv({
  href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  initialClosed = false,
  deferPanelState = false,
  lookupSong = null,
} = {}) {
  const docListeners = {};
  const sent = [];
  let resolvePanelState = null;

  function makeEl(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      type: '',
      title: '',
      disabled: false,
      hidden: false,
      children: [],
      dataset: {},
      style: {},
      attrs: {},
      listeners: {},
      append(...nodes) {
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            n.parentNode = el;
            el.children.push(n);
          }
        }
      },
      appendChild(n) {
        el.append(n);
        return n;
      },
      remove() {
        if (!el.parentNode) return;
        el.parentNode.children = el.parentNode.children.filter((c) => c !== el);
        el.parentNode = null;
      },
      setAttribute(k, v) {
        el.attrs[k] = String(v);
      },
      getAttribute(k) {
        return el.attrs[k] ?? null;
      },
      addEventListener(type, fn) {
        (el.listeners[type] ||= []).push(fn);
      },
      closest() {
        return null;
      },
      getBoundingClientRect() {
        return { left: 984, top: 108, width: 280, height: 240 };
      },
    };
    return el;
  }

  function walk(node, fn) {
    if (!node || typeof node !== 'object') return null;
    if (fn(node)) return node;
    for (const c of node.children || []) {
      const hit = walk(c, fn);
      if (hit) return hit;
    }
    return null;
  }

  function findOne(root, sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return walk(root, (n) => n.className && n.className.split(/\s+/).includes(cls));
    }
    const m = sel.match(/^\[data-redo-(act|out)="([^"]+)"\]$/);
    if (m) return walk(root, (n) => n.dataset && n.dataset[m[1] === 'act' ? 'redoAct' : 'redoOut'] === m[2]);
    return null;
  }

  const video = {
    currentTime: 0,
    duration: 200,
    playbackRate: 1,
    seeking: false,
    paused: false,
    ended: false,
    readyState: 4,
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      (video.listeners[type] ||= []).push(fn);
    },
    play: () => Promise.resolve(),
  };

  const body = makeEl('body');
  const document = {
    body,
    createElement: makeEl,
    createElementNS: (_ns, tag) => makeEl(tag),
    querySelector(sel) {
      if (sel === '#movie_player video.html5-main-video') return video;
      if (sel === '#movie_player.ad-showing') return null;
      return findOne(body, sel);
    },
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      (docListeners[type] ||= []).push(fn);
    },
  };

  let onMessage = null;
  const chrome = {
    runtime: {
      id: 'ext',
      sendMessage(msg) {
        sent.push(msg);
        if (msg.type === 'GET_PANEL_STATE') {
          if (deferPanelState) return new Promise((r) => (resolvePanelState = r));
          return Promise.resolve({ closed: initialClosed });
        }
        if (msg.type === 'SET_PANEL_STATE') return Promise.resolve({ ok: true });
        if (msg.type === 'LOOKUP_SONG') {
          return Promise.resolve(lookupSong || { state: 'none' });
        }
        return Promise.resolve(null);
      },
      onMessage: { addListener: (fn) => (onMessage = fn) },
    },
  };

  const ctx = vm.createContext({
    URL,
    Date,
    Element: function Element() {},
    document,
    location: { href, origin: 'https://www.youtube.com' },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, open() {} },
    chrome,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'practice-panel.js'), 'utf8'), ctx);

  return {
    video,
    sent,
    panel: () => findOne(body, '.redo-panel'),
    btn: (act) => findOne(body, `[data-redo-act="${act}"]`),
    out: (name) => findOne(body, `[data-redo-out="${name}"]`),
    setHref: (next) => (ctx.location.href = next),
    fireDoc: (type) => (docListeners[type] || []).forEach((fn) => fn()),
    fireVideo: (type) => (video.listeners[type] || []).forEach((fn) => fn()),
    fireMessage: (msg) => onMessage && onMessage(msg),
    resolvePanelState: (val) => resolvePanelState && resolvePanelState(val),
  };
}

test('EX4-배속복원: 영상 이동·홈 이동·패널 닫기 시 패널이 바꾼 배속을 1.0으로 복원하고, 유튜브 자체 변경은 건드리지 않는다', async () => {
  const env = makeFakeEnv();
  await flush();
  assert.ok(env.panel());

  // 1) 패널에서 0.75x 선택 후 다른 영상으로 이동 → 1.0 복원
  env.btn('preset1').listeners.click[0]();
  assert.equal(env.video.playbackRate, 0.75);
  env.setHref('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  env.fireDoc('yt-navigate-finish');
  assert.equal(env.video.playbackRate, 1, '다른 영상으로 이동하면 배속이 1.0으로 돌아간다');
  assert.equal(env.out('rate').textContent, '1.00x');

  // 2) 패널에서 0.5x 선택 후 /watch 밖(홈)으로 이동 → 1.0 복원
  env.btn('preset0').listeners.click[0]();
  assert.equal(env.video.playbackRate, 0.5);
  env.setHref('https://www.youtube.com/');
  env.fireDoc('yt-navigate-finish');
  assert.equal(env.video.playbackRate, 1, '재생 화면을 벗어나면 배속이 1.0으로 돌아간다');

  // 3) 다시 영상 진입 후 0.9x 선택 → 패널 X(닫기) 클릭 → 1.0 복원
  env.setHref('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  env.fireDoc('yt-navigate-finish');
  env.btn('preset2').listeners.click[0]();
  assert.equal(env.video.playbackRate, 0.9);
  env.btn('close').listeners.click[0]();
  assert.equal(env.panel(), null);
  assert.equal(env.video.playbackRate, 1, '패널 닫기 시 배속이 1.0으로 돌아간다');

  // 4) 패널을 다시 연 뒤 유튜브 자체 속도 메뉴(ratechange)로만 1.5x 설정 → 영상 이동 시 건드리지 않는다
  env.fireMessage({ type: 'REDO_PANEL_OPEN' });
  env.video.playbackRate = 1.5;
  env.fireVideo('ratechange');
  assert.equal(env.out('rate').textContent, '1.50x');
  env.setHref('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  env.fireDoc('yt-navigate-finish');
  assert.equal(env.video.playbackRate, 1.5, '유튜브 자체 속도 설정은 패널이 덮어쓰지 않는다');
});

test('EX4-배속복원(저장배속): 저장된 배속(0.75x)을 [반복]으로 적용한 뒤 영상 이동·닫기 시 1.0으로 복원한다', async () => {
  const env = makeFakeEnv({
    lookupSong: {
      state: 'exists',
      openUrl: 'https://x/practice.html?v=dQw4w9WgXcQ',
      song: { id: '11111111-2222-4333-8444-555555555555', a: 10, b: 20, rate: 0.75 },
    },
  });
  await flush();
  assert.equal(env.video.playbackRate, 1, '불러온 직후에는 자동 적용하지 않는다');

  env.btn('loop').listeners.click[0]();
  assert.equal(env.video.playbackRate, 0.75, '반복 켜면 저장 배속 적용');

  env.setHref('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  env.fireDoc('yt-navigate-finish');
  assert.equal(env.video.playbackRate, 1, '저장 배속 적용 후에도 다음 영상 이동 시 1.0으로 복원된다');
});

test('EX4-닫힘기억(패널): 새 탭에서 닫힘 상태를 읽으면 패널을 열지 않고, 닫기/재열기 시 상태를 저장하며 초기 경합을 이긴다', async () => {
  // 1) 닫힌 상태로 새 탭 진입
  const closedEnv = makeFakeEnv({ initialClosed: true });
  await flush();
  assert.equal(closedEnv.panel(), null, '마지막 상태가 닫힘이면 새 탭에서도 패널이 열리지 않는다');

  // 2) REDO_PANEL_OPEN 수신 → 패널 열림 + SET_PANEL_STATE { closed: false }
  closedEnv.fireMessage({ type: 'REDO_PANEL_OPEN' });
  assert.ok(closedEnv.panel());
  assert.ok(closedEnv.sent.some((m) => m.type === 'SET_PANEL_STATE' && m.closed === false));

  // 3) 닫기 → SET_PANEL_STATE { closed: true }
  closedEnv.btn('close').listeners.click[0]();
  assert.equal(closedEnv.panel(), null);
  assert.ok(closedEnv.sent.some((m) => m.type === 'SET_PANEL_STATE' && m.closed === true));

  // 4) GET_PANEL_STATE 응답 전에 REDO_PANEL_OPEN이 먼저 도착하면 늦은 { closed: true } 응답이 닫지 않는다
  const raceEnv = makeFakeEnv({ deferPanelState: true });
  raceEnv.fireMessage({ type: 'REDO_PANEL_OPEN' });
  assert.ok(raceEnv.panel());
  raceEnv.resolvePanelState({ closed: true });
  await flush();
  assert.ok(raceEnv.panel(), '늦게 온 GET_PANEL_STATE가 사용자가 연 패널을 닫지 않는다');
});

test('EX4-닫힘기억(서비스워커): GET_PANEL_STATE·SET_PANEL_STATE·우클릭 열기가 storage에 상태를 유지한다', async () => {
  const { registerWithChrome, PANEL_STATE_KEY } = await load('background.js');
  const store = {};
  let msgHandler = null;
  let menuClickHandler = null;
  const tabMsgs = [];

  const fakeChrome = {
    runtime: {
      id: 'ext',
      getURL: (p) => `chrome-extension://ext/${p}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => (msgHandler = fn) },
    },
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : { ...store }),
        set: async (obj) => Object.assign(store, obj),
      },
      onChanged: { addListener() {} },
    },
    contextMenus: {
      removeAll: (cb) => cb(),
      create() {},
      onClicked: { addListener: (fn) => (menuClickHandler = fn) },
    },
    tabs: {
      query: async () => [],
      sendMessage: async (tabId, msg) => tabMsgs.push({ tabId, msg }),
    },
  };

  registerWithChrome(fakeChrome);
  const ask = (msg) =>
    new Promise((resolve) => {
      const keepOpen = msgHandler(msg, { id: 'ext', url: 'https://www.youtube.com/watch?v=1' }, resolve);
      assert.equal(keepOpen, true);
    });

  assert.deepEqual(await ask({ type: 'GET_PANEL_STATE' }), { closed: false });
  await ask({ type: 'SET_PANEL_STATE', closed: true });
  assert.equal(store[PANEL_STATE_KEY], true);
  assert.deepEqual(await ask({ type: 'GET_PANEL_STATE' }), { closed: true });

  menuClickHandler({ menuItemId: 'redo-open-panel' }, { id: 42 });
  await flush();
  assert.equal(store[PANEL_STATE_KEY], false);
  assert.deepEqual(await ask({ type: 'GET_PANEL_STATE' }), { closed: false });
  assert.deepEqual(tabMsgs, [{ tabId: 42, msg: { type: 'REDO_PANEL_OPEN' } }]);
});
