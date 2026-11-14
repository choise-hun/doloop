// EX-2 크롬 확장 — 연습 패널 순수 로직·매니페스트·우클릭 메뉴·패널 루프 검증 (개발산출물/명세/EX-2_구현명세.md §7)
// 외부 의존성 없이 Node 내장 모듈만 사용한다. 실제 유튜브 화면 동작은 수동 검수표로 확인한다.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.join(__dirname, '..', 'extension');
const load = (name) => import(require('node:url').pathToFileURL(path.join(EXT, name)).href);
// vm 컨텍스트에서 만든 객체는 프로토타입이 달라 strict deepEqual에서 호스트 객체와 맞춘다
const plain = (o) => Object.assign({}, o);

function loadPanelPure() {
  const ctx = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'practice-panel.js'), 'utf8'), ctx);
  return ctx;
}

function fakePanelEnv(href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') {
  const docListeners = {};
  const winListeners = {};
  let adActive = false;

  const makeEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      parent: null,
      dataset: {},
      style: {},
      listeners: {},
      attrs: {},
      className: '',
      textContent: '',
      title: '',
      disabled: false,
      hidden: false,
      isConnected: true,
      offsetWidth: 280,
      offsetHeight: 200,
      classList: { add: (c) => (el.className = `${el.className} ${c}`.trim()) },
      setAttribute(k, v) {
        el.attrs[k] = String(v);
      },
      getAttribute(k) {
        return k in el.attrs ? el.attrs[k] : null;
      },
      append(...kids) {
        for (const k of kids) el.appendChild(k);
      },
      appendChild(k) {
        k.parent = el;
        k.isConnected = true;
        el.children.push(k);
        return k;
      },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
        el.parent = null;
        el.isConnected = false;
      },
      addEventListener(type, fn) {
        (el.listeners[type] ||= []).push(fn);
      },
      getBoundingClientRect: () => ({ left: 984, top: 108, width: 280, height: 200 }),
      closest: () => null,
      querySelector(sel) {
        return findOne(el, sel);
      },
    };
    return el;
  };

  function matchSel(el, sel) {
    if (sel.startsWith('.')) return el.className.split(' ').includes(sel.slice(1));
    const m = sel.match(/^\[data-redo-(act|out)="([^"]+)"\]$/);
    if (m) return el.dataset[m[1] === 'act' ? 'redoAct' : 'redoOut'] === m[2];
    return false;
  }

  function findOne(root, sel) {
    for (const c of root.children) {
      if (matchSel(c, sel)) return c;
      const deep = findOne(c, sel);
      if (deep) return deep;
    }
    return null;
  }

  const video = makeEl('video');
  video.currentTime = 0;
  video.duration = 120;
  video.playbackRate = 1;
  video.seeking = false;
  video.play = () => Promise.resolve();

  const body = makeEl('body');
  const document = {
    body,
    createElement: makeEl,
    createElementNS: (_ns, tag) => makeEl(tag),
    querySelector(sel) {
      if (sel === '#movie_player video.html5-main-video') return video;
      if (sel === '#movie_player.ad-showing') return adActive ? {} : null;
      return findOne(body, sel);
    },
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      (docListeners[type] ||= []).push(fn);
    },
  };

  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, fn, capture) {
      (winListeners[type] ||= []).push({ fn, capture: Boolean(capture) });
    },
    removeEventListener(type, fn) {
      winListeners[type] = (winListeners[type] || []).filter((item) => item.fn !== fn);
    },
    open() {},
  };

  let onMessage = null;
  const chrome = {
    runtime: {
      id: 'ext',
      sendMessage: () => Promise.resolve(null),
      onMessage: { addListener: (fn) => (onMessage = fn) },
    },
  };

  let rafSeq = 0;
  const rafQueue = new Map();
  const ctx = vm.createContext({
    URL,
    Element: function Element() {},
    document,
    location: { href, origin: 'https://www.youtube.com' },
    window,
    chrome,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => {
      const id = ++rafSeq;
      rafQueue.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => rafQueue.delete(id),
  });

  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'practice-panel.js'), 'utf8'), ctx);

  return {
    ctx,
    body,
    video,
    setAd: (v) => {
      adActive = v;
    },
    panel: () => body.children.find((c) => c.className === 'redo-panel') || null,
    btn: (act) => findOne(body, `[data-redo-act="${act}"]`),
    out: (name) => findOne(body, `[data-redo-out="${name}"]`),
    flushRaf: () => {
      const pending = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, fn] of pending) fn();
    },
    fireVideo: (type) => {
      for (const fn of video.listeners[type] || []) fn();
    },
    fireMessage: (msg) => onMessage && onMessage(msg),
    fireKeydown: (ev) => {
      for (const h of winListeners.keydown || []) h.fn(ev);
    },
  };
}

test('TC-EX-10 루프 판정: t >= b이고 loopOn·!ad·!seeking·a/b 존재일 때만 jump', () => {
  const { redoLoopAction } = loadPanelPure();

  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: 5, t: 4.99, seeking: false, ad: false }), 'none');
  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: 5, t: 5, seeking: false, ad: false }), 'jump');
  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: 5, t: 8, seeking: false, ad: false }), 'jump');

  // 되감는 중(seeking)이나 광고(ad) 중에는 되감지 않는다
  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: 5, t: 5.5, seeking: true, ad: false }), 'none');
  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: 5, t: 5.5, seeking: false, ad: true }), 'none');
  assert.equal(redoLoopAction({ loopOn: false, a: 3, b: 5, t: 5.5, seeking: false, ad: false }), 'none');
  assert.equal(redoLoopAction({ loopOn: true, a: null, b: 5, t: 5.5, seeking: false, ad: false }), 'none');
  assert.equal(redoLoopAction({ loopOn: true, a: 3, b: null, t: 5.5, seeking: false, ad: false }), 'none');
});

test('TC-EX-10 100회: 가짜 video로 판정→되감기 100번 실행 시 매번 a로 돌아가고 loops === 100', () => {
  const { redoLoopAction } = loadPanelPure();

  // 순수 판정 루프 100회
  const a = 3.2;
  const b = 5.4;
  const fakeVideo = { currentTime: a, seeking: false };
  let loops = 0;
  for (let i = 0; i < 100; i += 1) {
    fakeVideo.currentTime = b + 0.02;
    if (redoLoopAction({ loopOn: true, a, b, t: fakeVideo.currentTime, seeking: fakeVideo.seeking, ad: false }) === 'jump') {
      fakeVideo.currentTime = a;
      loops += 1;
    }
    assert.equal(fakeVideo.currentTime, a);
  }
  assert.equal(loops, 100);

  // 패널 DOM·tick 통합: A=2.0, B=5.0 지정 후 rAF/timeupdate로 100회 되감기 + 광고·닫기·재오픈 검증
  const env = fakePanelEnv();
  assert.ok(env.panel(), '재생 화면에서 패널이 생성된다');
  env.video.currentTime = 2;
  env.btn('setA').listeners.click[0]();
  env.video.currentTime = 5;
  env.btn('setB').listeners.click[0]();
  env.btn('loop').listeners.click[0]();
  assert.equal(env.btn('loop').getAttribute('aria-pressed'), 'true');

  for (let i = 0; i < 100; i += 1) {
    env.video.currentTime = 5.05;
    env.flushRaf();
    assert.equal(env.video.currentTime, 2);
  }
  assert.equal(env.out('loops').textContent, '100회');

  // 광고 중에는 setA·setB·restart가 비활성화되고 되감지 않는다
  env.setAd(true);
  env.video.currentTime = 5.2;
  env.fireVideo('timeupdate');
  assert.equal(env.video.currentTime, 5.2);
  assert.equal(env.out('loops').textContent, '100회');
  assert.equal(env.out('status').textContent, '광고가 끝나면 이어집니다');
  assert.equal(env.btn('setA').disabled, true);
  assert.equal(env.btn('setB').disabled, true);
  assert.equal(env.btn('restart').disabled, true);

  // 닫기 후 단축키 무시, 우클릭 REDO_PANEL_OPEN으로 재오픈
  env.btn('close').listeners.click[0]();
  assert.equal(env.panel(), null);
  env.fireKeydown({
    code: 'KeyR',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    composedPath: () => [env.body],
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(env.video.currentTime, 5.2, '닫힌 상태에서는 단축키가 동작하지 않는다');
  env.fireMessage({ type: 'REDO_PANEL_OPEN' });
  assert.ok(env.panel(), 'REDO_PANEL_OPEN으로 다시 열린다');
});

test('EX2-AB: redoSetA·redoSetB 경계 — B 먼저(A=0), b-a 0.4·0.5, A를 B 뒤로, error: order 시 불변', () => {
  const { redoSetA, redoSetB } = loadPanelPure();

  // B 먼저 지정 (A가 null이면 A=0)
  assert.deepEqual(plain(redoSetB({ a: null, b: null, loopOn: false }, 4.24)), { a: 0, b: 4.2, loopOn: false });
  assert.deepEqual(plain(redoSetB({ a: null, b: null, loopOn: false }, 0.4)), {
    a: null,
    b: null,
    loopOn: false,
    error: 'order',
  });

  // b - a 0.4(거부·값 불변) vs 0.5(허용)
  const base = { a: 10.1, b: 15, loopOn: true };
  assert.deepEqual(plain(redoSetB(base, 10.5)), { a: 10.1, b: 15, loopOn: true, error: 'order' });
  assert.deepEqual(plain(redoSetB({ a: 10.1, b: null, loopOn: false }, 10.6)), { a: 10.1, b: 10.6, loopOn: false });

  // A를 B 뒤 또는 B-0.4로 옮기면 B=null, loopOn=false
  assert.deepEqual(plain(redoSetA({ a: 2, b: 5, loopOn: true }, 4.6)), { a: 4.6, b: null, loopOn: false });
  assert.deepEqual(plain(redoSetA({ a: 2, b: 5, loopOn: true }, 6)), { a: 6, b: null, loopOn: false });
  assert.deepEqual(plain(redoSetA({ a: 2, b: 5, loopOn: true }, 4.5)), { a: 4.5, b: 5, loopOn: true });
});

test('TC-EX-11 배속: redoClampRate·redoStepRate 경계 및 부동소수 오차 없음', () => {
  const { redoClampRate, redoStepRate } = loadPanelPure();

  assert.equal(redoClampRate(0.1), 0.25);
  assert.equal(redoClampRate(2.5), 2);
  assert.equal(redoClampRate(Number.NaN), 1);
  assert.equal(redoClampRate(0.333), 0.33);

  assert.equal(redoStepRate(0.25, -1), 0.25);
  assert.equal(redoStepRate(2, 1), 2);

  let rate = 0.9;
  rate = redoStepRate(rate, 1);
  rate = redoStepRate(rate, 1);
  rate = redoStepRate(rate, 1);
  assert.equal(rate, 1.05);
  assert.equal(rate.toFixed(2), '1.05');
});

test('TC-EX-09 단축키 표: Alt 단독 10개 code, 조합 키 차단, repeat은 rateDown·rateUp만', () => {
  const { redoShortcutAction } = loadPanelPure();

  const cases = [
    ['BracketLeft', 'setA'],
    ['BracketRight', 'setB'],
    ['KeyL', 'loop'],
    ['KeyR', 'restart'],
    ['Digit1', 'preset0'],
    ['Digit2', 'preset1'],
    ['Digit3', 'preset2'],
    ['Digit4', 'preset3'],
    ['Minus', 'rateDown'],
    ['Equal', 'rateUp'],
  ];
  for (const [code, expected] of cases) {
    assert.equal(
      redoShortcutAction({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false }),
      expected,
      code
    );
    assert.equal(
      redoShortcutAction({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false }),
      null
    );
    assert.equal(
      redoShortcutAction({ code, altKey: true, ctrlKey: true, metaKey: false, shiftKey: false, repeat: false }),
      null,
      `Ctrl+Alt+${code}`
    );
    assert.equal(
      redoShortcutAction({ code, altKey: true, ctrlKey: false, metaKey: false, shiftKey: true, repeat: false }),
      null,
      `Shift+Alt+${code}`
    );
    assert.equal(
      redoShortcutAction({ code, altKey: true, ctrlKey: false, metaKey: true, shiftKey: false, repeat: false }),
      null,
      `Meta+Alt+${code}`
    );
  }

  assert.equal(
    redoShortcutAction({ code: 'Minus', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: true }),
    'rateDown'
  );
  assert.equal(
    redoShortcutAction({ code: 'Equal', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: true }),
    'rateUp'
  );
  assert.equal(
    redoShortcutAction({ code: 'KeyL', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, repeat: true }),
    null
  );
});

test('EX2-편집: INPUT·TEXTAREA·SELECT·isContentEditable 참, DIV 거짓', () => {
  const { redoIsEditableTarget } = loadPanelPure();

  assert.equal(redoIsEditableTarget({ tagName: 'INPUT', isContentEditable: false }), true);
  assert.equal(redoIsEditableTarget({ tagName: 'TEXTAREA', isContentEditable: false }), true);
  assert.equal(redoIsEditableTarget({ tagName: 'SELECT', isContentEditable: false }), true);
  assert.equal(redoIsEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(redoIsEditableTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(redoIsEditableTarget(null), false);
});

test('EX2-시간: redoFormatTime·redoRoundTime 경계 및 60분 초과 포맷', () => {
  const { redoFormatTime, redoRoundTime } = loadPanelPure();

  assert.equal(redoFormatTime(null), '--:--.-');
  assert.equal(redoFormatTime(Number.NaN), '--:--.-');
  assert.equal(redoFormatTime(0), '00:00.0');
  assert.equal(redoFormatTime(83.44), '01:23.4');
  assert.equal(redoFormatTime(4503.26), '75:03.3');
  assert.equal(redoFormatTime(59.99), '01:00.0');

  assert.equal(redoRoundTime(-1), 0);
  assert.equal(redoRoundTime(12.34), 12.3);
  assert.equal(redoRoundTime(90000), 86400);
});

test('EX2-위치: redoClampPanelPos 화면 밖 좌·우·위·아래 클램프', () => {
  const { redoClampPanelPos } = loadPanelPure();

  assert.deepEqual(plain(redoClampPanelPos({ x: -30, y: 10, w: 280, h: 200, vw: 1280, vh: 800 })), { x: 0, y: 56 });
  assert.deepEqual(plain(redoClampPanelPos({ x: 1200, y: 790, w: 280, h: 200, vw: 1280, vh: 800 })), { x: 1000, y: 760 });
  assert.deepEqual(plain(redoClampPanelPos({ x: 500, y: 300, w: 280, h: 200, vw: 1280, vh: 800 })), { x: 500, y: 300 });
});

test('EX2-매니페스트: content_scripts 순서와 permissions 3개 유지', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js', 'practice-panel.js']);
  assert.deepEqual(manifest.permissions, ['storage', 'identity', 'contextMenus']);
  assert.ok(fs.existsSync(path.join(EXT, 'practice-panel.js')));
});

test('EX2-메뉴: 메뉴 3개 생성, redo-open-panel 클릭 시 REDO_PANEL_OPEN만 전송하고 곡 추가 요청 없음', async () => {
  const { registerWithChrome } = await load('background.js');
  const created = [];
  const sent = [];
  const listeners = {};
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { status: 200, ok: true, json: async () => ({}) };
  };

  try {
    const chromeApi = {
      storage: {
        local: { async get() { return {}; }, async set() {}, async remove() {} },
        onChanged: { addListener() {} },
      },
      runtime: {
        id: 'ext',
        onInstalled: { addListener: (fn) => (listeners.installed = fn) },
        onMessage: { addListener() {} },
        getURL: (p) => `chrome-extension://ext/${p}`,
      },
      contextMenus: {
        removeAll: (cb) => cb(),
        create: (item) => created.push(item),
        onClicked: { addListener: (fn) => (listeners.clicked = fn) },
      },
      tabs: {
        query: async () => [],
        sendMessage: async (tabId, msg) => {
          sent.push({ tabId, msg });
        },
      },
    };

    registerWithChrome(chromeApi);
    listeners.installed();
    assert.equal(created.length, 3);
    assert.deepEqual(
      created.map((c) => c.id),
      ['redo-add-link', 'redo-add-page', 'redo-open-panel']
    );
    assert.equal(created[2].title, '연습 패널 열기');
    assert.deepEqual(created[2].documentUrlPatterns, ['https://www.youtube.com/watch*']);

    listeners.clicked({ menuItemId: 'redo-open-panel', pageUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, { id: 7 });
    await new Promise((r) => setTimeout(r, 0));

    assert.deepEqual(sent, [{ tabId: 7, msg: { type: 'REDO_PANEL_OPEN' } }]);
    assert.equal(fetchCalls, 0, '곡 추가 API를 부르지 않는다');
  } finally {
    globalThis.fetch = origFetch;
  }
});
