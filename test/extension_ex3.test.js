// EX-3 크롬 확장 — 저장 연결: 조회 확장·SAVE_PRACTICE·패널 저장 줄·시간/횟수 누적·경합 (개발산출물/명세/EX-2_구현명세.md §9)
// 외부 의존성 없이 Node 내장 모듈만 사용한다. 실제 유튜브·운영 서버 동작은 수동 검수로 확인한다.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.join(__dirname, '..', 'extension');
const load = (name) => import(require('node:url').pathToFileURL(path.join(EXT, name)).href);
const plain = (o) => JSON.parse(JSON.stringify(o));

const VID = 'dQw4w9WgXcQ';
const VID2 = 'jNQXAC9IVRw';
const SONG_ID = '11111111-2222-4333-8444-555555555555';
const flush = () => new Promise((r) => setTimeout(r, 0));

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// ───────── 가짜 유튜브 재생 화면 (content.js + practice-panel.js) ─────────

function panelEnv(href = `https://www.youtube.com/watch?v=${VID}`) {
  const docListeners = {};
  const msgListeners = [];
  let adActive = false;
  let clock = 1_800_000_000_000;
  /** 패널이 보낸 메시지. 응답은 resolve로 직접 준다 */
  const calls = [];

  const match = (el, sel) => {
    if (sel.startsWith('.')) return el.className.split(' ').includes(sel.slice(1));
    const m = sel.match(/^\[data-redo-(act|out)="([^"]+)"\]$/);
    return Boolean(m) && el.dataset[m[1] === 'act' ? 'redoAct' : 'redoOut'] === m[2];
  };
  const find = (root, sel) => {
    for (const c of root.children) {
      if (match(c, sel)) return c;
      const deep = find(c, sel);
      if (deep) return deep;
    }
    return null;
  };
  const make = (tag) => {
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
      offsetWidth: 280,
      offsetHeight: 200,
      classList: { add: (c) => (el.className = `${el.className} ${c}`.trim()) },
      setAttribute(k, v) {
        el.attrs[k] = String(v);
      },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      removeAttribute(k) {
        delete el.attrs[k];
      },
      append(...kids) {
        for (const k of kids) el.appendChild(k);
      },
      appendChild(k) {
        k.parent = el;
        el.children.push(k);
        return k;
      },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
        el.parent = null;
      },
      addEventListener(type, fn) {
        (el.listeners[type] ||= []).push(fn);
      },
      getBoundingClientRect: () => ({ left: 984, top: 64, width: 280, height: 200 }),
      querySelector: (sel) => find(el, sel),
    };
    return el;
  };

  const body = make('body');
  const video = make('video');
  Object.assign(video, { currentTime: 0, duration: 300, playbackRate: 1, seeking: false, paused: true, ended: false });
  video.play = () => Promise.resolve();

  const document = {
    body,
    createElement: make,
    createElementNS: (_ns, tag) => make(tag),
    querySelector(sel) {
      if (sel === '#movie_player video.html5-main-video') return video;
      if (sel === '#movie_player.ad-showing') return adActive ? {} : null;
      return find(body, sel);
    },
    querySelectorAll: () => [],
    addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn),
  };
  const window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, open() {} };
  const chrome = {
    runtime: {
      id: 'ext',
      sendMessage(m) {
        if (m.type === 'GET_SETTINGS') return Promise.resolve({ menuItem: true });
        return new Promise((resolve) => calls.push({ msg: m, resolve }));
      },
      onMessage: { addListener: (fn) => msgListeners.push(fn) },
    },
  };
  // Date.now만 시계로 바꾼다(new Date()는 실제 날짜)
  const FakeDate = function (...a) {
    return new Date(...a);
  };
  FakeDate.now = () => clock;

  const ctx = vm.createContext({
    URL,
    Date: FakeDate,
    Element: function Element() {},
    document,
    location: { href, origin: 'https://www.youtube.com' },
    window,
    chrome,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'practice-panel.js'), 'utf8'), ctx);

  const el = (sel) => find(body, sel);
  const env = {
    ctx,
    video,
    calls,
    el,
    setAd: (v) => (adActive = v),
    click: (act) => el(`[data-redo-act="${act}"]`).listeners.click[0](),
    out: (name) => el(`[data-redo-out="${name}"]`),
    status: () => el('[data-redo-out="status"]').textContent,
    of: (type) => calls.filter((c) => c.msg.type === type),
    last: (type) => env.of(type).at(-1),
    fireVideo: (type) => (video.listeners[type] || []).forEach((fn) => fn()),
    message: (m) => msgListeners.forEach((fn) => fn(m)),
    navigate(next) {
      ctx.location.href = next;
      (docListeners['yt-navigate-finish'] || []).forEach((fn) => fn());
    },
    /** 재생 중으로 두고 timeupdate를 1초 간격으로 n번 보낸다(첫 번째는 기준점) */
    play(seconds) {
      video.paused = false;
      env.fireVideo('timeupdate');
      for (let i = 0; i < seconds; i += 1) {
        clock += 1000;
        env.fireVideo('timeupdate');
      }
    },
    advance: (ms) => (clock += ms),
    /** 저장 줄이 등록 상태인지 */
    registered: () => !el('[data-redo-out="exists"]').hidden,
    dirty: () => !el('[data-redo-out="dirty"]').hidden,
    toast: () => body.children.find((c) => c.className === 'redo-toast') || null,
  };
  return env;
}

/** 등록 곡(A=10, B=20, 0.75x)으로 조회가 끝난 패널 */
async function registeredEnv(song = { id: SONG_ID, a: 10, b: 20, rate: 0.75 }) {
  const env = panelEnv();
  await flush();
  env.last('LOOKUP_SONG').resolve({ state: 'exists', openUrl: `https://x/practice.html?v=${VID}`, song });
  await flush();
  return env;
}

// ───────── 순수 함수 ─────────

test('EX3-누적·본문: redoAccumulate·redoBuildSave·redoLocalDate', () => {
  const ctx = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'practice-panel.js'), 'utf8'), ctx);
  const { redoAccumulate, redoBuildSave, redoLocalDate } = ctx;

  assert.deepEqual(plain(redoAccumulate({ acc: 0, last: null, now: 1000, counting: true })), { acc: 0, last: 1000 }, '첫 관측은 기준점');
  assert.deepEqual(plain(redoAccumulate({ acc: 1, last: 1000, now: 1500, counting: true })), { acc: 1.5, last: 1500 });
  assert.deepEqual(plain(redoAccumulate({ acc: 1, last: 1000, now: 61_000, counting: true })), { acc: 3, last: 61_000 }, '탭이 멈춘 사이는 2초까지만');
  assert.deepEqual(plain(redoAccumulate({ acc: 5, last: 1000, now: 2000, counting: false })), { acc: 5, last: null }, '멈춤·광고는 세지 않는다');

  const song = { id: SONG_ID, a: 10, b: 20, rate: 0.75 };
  const base = { songId: SONG_ID, t: 12.34, song, rate: 0.9, accSec: 61.9, accLoops: 3, date: '2026-11-15' };
  assert.deepEqual(plain(redoBuildSave({ ...base, a: 1, b: 4 })), {
    type: 'SAVE_PRACTICE',
    songId: SONG_ID,
    pos: 12.3,
    a: 1,
    b: 4,
    rate: 0.9,
    date: '2026-11-15',
    addSeconds: 61,
    addLoops: 3,
  });
  const fallback = redoBuildSave({ ...base, a: null, b: 4 });
  assert.equal(fallback.a, 10, '패널에 둘 다 없으면 마지막으로 받은 곡 구간');
  assert.equal(fallback.b, 20);
  const none = redoBuildSave({ ...base, a: null, b: null, song: { ...song, a: null, b: null } });
  assert.equal('a' in none || 'b' in none, false);
  const capped = redoBuildSave({ ...base, a: null, b: null, accSec: 99_999, accLoops: 200_000 });
  assert.equal(capped.addSeconds, 21600);
  assert.equal(capped.addLoops, 100000);

  assert.equal(redoLocalDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

// ───────── 서비스 워커 API ─────────

function apiHarness(background, { token = 'tok', respond }) {
  const calls = [];
  const api = background.createApi({
    auth: {
      getAccessToken: async () => (typeof token === 'function' ? token() : token),
      clearSessionIfToken: async () => {},
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
    getSettings: async () => background.normalizeSettings({}),
    timeoutMs: 50,
  });
  return { api, calls };
}

const saveMsg = (over = {}) => ({
  type: 'SAVE_PRACTICE',
  songId: SONG_ID,
  pos: 12.3,
  a: 10,
  b: 20,
  rate: 0.75,
  date: '2026-11-15',
  addSeconds: 45,
  addLoops: 2,
  ...over,
});

test('EX3-조회·추가: LOOKUP_SONG·ADD_SONG 응답에 song { id, a, b, rate }, 추가 요청에 패널 값', async () => {
  const background = await load('background.js');
  const dto = { id: SONG_ID, title: 't', a: 10, b: 20, rate: 0.75, pos: 3, memo: '' };

  const found = await apiHarness(background, { respond: async () => jsonResponse(200, { song: dto }) }).api.lookupSong(VID);
  assert.deepEqual(found, {
    state: 'exists',
    openUrl: `${background.DEFAULT_API_BASE}/practice.html?v=${VID}`,
    song: { id: SONG_ID, a: 10, b: 20, rate: 0.75 },
  });
  const empty = await apiHarness(background, { respond: async () => jsonResponse(200, { song: null }) }).api.lookupSong(VID);
  assert.deepEqual(empty, { state: 'none' });

  const add = apiHarness(background, { respond: async () => jsonResponse(201, { song: { ...dto, a: null, b: null } }) });
  const added = await add.api.addSong(VID, { rate: 0.8, a: 1.5, b: 4 });
  assert.deepEqual(JSON.parse(add.calls[0].init.body), { videoId: VID, rate: 0.8, a: 1.5, b: 4 });
  assert.equal(added.kind, 'added');
  assert.deepEqual(added.song, { id: SONG_ID, a: null, b: null, rate: 0.75 });

  const bad = apiHarness(background, { respond: async () => jsonResponse(200, { song: dto }) });
  await bad.api.addSong(VID, { rate: 1, a: 5, b: 5 });
  assert.deepEqual(JSON.parse(bad.calls[0].init.body), { videoId: VID, rate: 1 }, 'a >= b는 보내지 않는다');
});

test('EX3-오류: SAVE_PRACTICE 응답 7가지 → kind', async () => {
  const background = await load('background.js');
  const { AuthError } = await load('auth.js');
  const run = async (respond, token) => apiHarness(background, { respond, token }).api.savePractice(saveMsg());

  const ok = apiHarness(background, { respond: async () => jsonResponse(200, { ok: true, keep: false }) });
  assert.deepEqual(await ok.api.savePractice(saveMsg()), { kind: 'saved', keep: false });
  assert.equal(ok.calls[0].url, `${background.DEFAULT_API_BASE}/api/v1/practice/save`);
  assert.equal(ok.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(ok.calls[0].init.body), {
    songId: SONG_ID,
    pos: 12.3,
    a: 10,
    b: 20,
    rate: 0.75,
    date: '2026-11-15',
    addSeconds: 45,
    addLoops: 2,
  }, '요청 필드 그대로(type 제외)');

  assert.deepEqual(await run(async () => jsonResponse(200, { ok: true, keep: true, pendingSeconds: 45 })), { kind: 'saved', keep: true });
  assert.equal((await run(async () => jsonResponse(201, {}), null)).kind, 'login', '토큰 없음');
  assert.equal((await run(async () => jsonResponse(401, {}))).kind, 'login');
  assert.deepEqual(await run(async () => jsonResponse(404, { message: '곡을 찾을 수 없습니다.' })), {
    kind: 'gone',
    message: 'RE:DO에서 삭제된 곡입니다. 다시 추가할 수 있습니다',
  });
  assert.deepEqual(await run(async () => jsonResponse(400, { ok: false, message: 'a는 b보다 작아야 합니다.' })), {
    kind: 'error',
    status: 400,
    message: 'a는 b보다 작아야 합니다.',
  });
  assert.equal((await run(async () => ({ status: 503, ok: false, json: async () => null }))).message, '저장하지 못했습니다');
  assert.equal((await run(async () => { throw new TypeError('Failed to fetch'); })).kind, 'network');
  assert.equal((await run(async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }))).kind, 'network', '시간 초과');
  const switched = await run(async () => jsonResponse(200, {}), () => {
    throw new AuthError('cancelled', 'x');
  });
  assert.deepEqual(switched, { kind: 'switched', message: '요청 도중 계정이 바뀌어 저장하지 않았습니다' });

  const invalid = apiHarness(background, { respond: async () => jsonResponse(200, {}) });
  assert.equal((await invalid.api.savePractice(saveMsg({ songId: '../x' }))).kind, 'error');
  assert.equal(invalid.calls.length, 0, '형식이 틀린 songId는 보내지 않는다');
});

test('EX3-연타: 같은 곡 저장 3연타는 요청 1회(서비스 워커), 끝난 뒤에는 다시 보낼 수 있다', async () => {
  const background = await load('background.js');
  const h = apiHarness(background, {
    respond: async () => {
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse(200, { ok: true, keep: false });
    },
  });
  const results = await Promise.all([h.api.savePractice(saveMsg()), h.api.savePractice(saveMsg()), h.api.savePractice(saveMsg())]);
  assert.equal(h.calls.length, 1);
  assert.equal(results[0], results[2]);
  await h.api.savePractice(saveMsg());
  assert.equal(h.calls.length, 2);
});

test('EX3-메시지: 서비스 워커가 SAVE_PRACTICE를 받아 응답하고 ADD_SONG의 패널 값을 넘긴다', async () => {
  const { registerWithChrome } = await load('background.js');
  let onMessage = null;
  const origFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push([url, JSON.parse(init.body)]);
    return jsonResponse(url.endsWith('/practice/save') ? 200 : 201, url.endsWith('/practice/save') ? { keep: false } : { song: { id: SONG_ID, rate: 1 } });
  };
  try {
    const session = { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, sid: 's' };
    registerWithChrome({
      storage: {
        local: { async get(k) { return k === 'redo:session' ? { [k]: session } : {}; }, async set() {}, async remove() {} },
        onChanged: { addListener() {} },
      },
      runtime: { id: 'ext', onInstalled: { addListener() {} }, onMessage: { addListener: (fn) => (onMessage = fn) }, getURL: (p) => `chrome-extension://ext/${p}` },
      contextMenus: { onClicked: { addListener() {} } },
      tabs: { query: async () => [], sendMessage: async () => {} },
    });
    const ask = (m) => new Promise((resolve) => assert.equal(onMessage(m, { id: 'ext', url: 'https://www.youtube.com/watch' }, resolve), true));
    assert.deepEqual(await ask(saveMsg()), { kind: 'saved', keep: false });
    assert.equal((await ask({ type: 'ADD_SONG', videoId: VID, rate: 0.75, a: 1, b: 3 })).song.id, SONG_ID);
    assert.deepEqual(bodies[1][1], { videoId: VID, rate: 0.75, a: 1, b: 3 });
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ───────── 패널 저장 줄 ─────────

test('TC-EX-13: 등록 곡 저장 — 불러온 구간·배속, A·B 미지정 시 기존 구간 전송, keep:false 1회 차감, keep:true 차감 없음', async () => {
  const env = await registeredEnv();
  assert.equal(env.registered(), true, '등록 곡이면 RE:DO에 있음 + 저장');
  assert.equal(env.out('a').textContent, '00:10.0', '저장된 구간을 채운다');
  assert.equal(env.out('b').textContent, '00:20.0');
  assert.equal(env.status(), '저장된 구간·배속(0.75x)을 불러왔습니다. [반복]을 켜면 적용됩니다');
  assert.equal(env.video.playbackRate, 1, '저장된 배속은 [반복] 전에는 적용하지 않는다');
  assert.equal(env.dirty(), false, '불러온 직후는 저장할 것이 없다');

  env.click('loop');
  assert.equal(env.video.playbackRate, 0.75, '[반복]을 켤 때 저장 배속 적용');
  assert.equal(env.out('rate').textContent, '0.75x');

  env.play(45);
  assert.equal(env.dirty(), true, '누적이 생기면 저장 안 됨');
  env.click('save');
  env.click('save');
  env.click('save');
  assert.equal(env.of('SAVE_PRACTICE').length, 1, '패널 3연타도 요청 1회');
  assert.equal(env.el('[data-redo-act="save"]').disabled, true, '저장 중에는 잠근다');
  const first = env.last('SAVE_PRACTICE').msg;
  assert.equal(first.songId, SONG_ID);
  assert.equal(first.a, 10);
  assert.equal(first.b, 20);
  assert.equal(first.rate, 0.75);
  assert.equal(first.addSeconds, 45);
  assert.match(first.date, /^\d{4}-\d{2}-\d{2}$/);

  env.play(3); // 저장 중에도 쌓인다
  env.last('SAVE_PRACTICE').resolve({ kind: 'saved', keep: false });
  await flush();
  assert.equal(env.status(), '저장했습니다');

  // 구간을 지우면(패널 A·B 없음) 마지막으로 받은 구간을 보낸다 — 이 API는 보낸 a·b로 덮어쓴다
  env.click('clear');
  env.click('save');
  const second = env.last('SAVE_PRACTICE').msg;
  assert.equal(second.addSeconds, 3, 'keep:false에서 보낸 45초만 뺐다(저장 중 쌓인 3초는 남는다)');
  assert.equal(second.a, 10);
  assert.equal(second.b, 20);
  env.last('SAVE_PRACTICE').resolve({ kind: 'saved', keep: true });
  await flush();
  assert.equal(env.status(), '구간·배속을 저장했습니다. 연습 시간은 1분부터 기록됩니다');
  assert.equal(env.dirty(), true, 'keep:true면 누적분이 남아 저장 안 됨');

  env.click('save');
  assert.equal(env.last('SAVE_PRACTICE').msg.addSeconds, 3, 'keep:true에서는 빼지 않는다');
});

test('TC-EX-13 광고: 광고 중에는 [저장]을 잠그고 시간을 세지 않는다', async () => {
  const env = await registeredEnv();
  env.play(5);
  env.setAd(true);
  env.play(30);
  env.setAd(false);
  env.fireVideo('timeupdate');
  assert.equal(env.el('[data-redo-act="save"]').disabled, false);
  env.setAd(true);
  env.fireVideo('timeupdate');
  assert.equal(env.el('[data-redo-act="save"]').disabled, true);
  env.click('save');
  assert.equal(env.of('SAVE_PRACTICE').length, 0);
  env.setAd(false);
  env.fireVideo('timeupdate');
  env.click('save');
  assert.equal(env.last('SAVE_PRACTICE').msg.addSeconds, 5, '광고 30초는 빠진다');

  // 멈춘 동안도 세지 않는다
  const paused = await registeredEnv();
  paused.play(4);
  paused.video.paused = true;
  paused.advance(60_000);
  paused.fireVideo('timeupdate');
  paused.play(2);
  paused.click('save');
  assert.equal(paused.last('SAVE_PRACTICE').msg.addSeconds, 6);
});

test('EX3-추가: 미등록이면 [RE:DO에 추가]가 패널 구간·배속을 보내고, 기존 곡(200)이면 패널 값을 유지한 채 저장 안 됨', async () => {
  const env = panelEnv();
  await flush();
  env.last('LOOKUP_SONG').resolve({ state: 'none' });
  await flush();
  assert.equal(env.registered(), false);
  env.video.currentTime = 3;
  env.click('setA');
  env.video.currentTime = 7;
  env.click('setB');
  env.click('preset2'); // 0.9

  env.click('add');
  env.click('add');
  assert.equal(env.of('ADD_SONG').length, 1);
  assert.equal(env.el('[data-redo-act="add"]').textContent, '추가하는 중…');
  assert.deepEqual(plain(env.last('ADD_SONG').msg), { type: 'ADD_SONG', videoId: VID, rate: 0.9, a: 3, b: 7 });
  env.last('ADD_SONG').resolve({
    kind: 'exists',
    message: '이미 RE:DO에 있는 곡입니다',
    action: 'open',
    openUrl: 'https://x/practice.html',
    song: { id: SONG_ID, a: 1, b: 2, rate: 1 },
  });
  await flush();
  assert.equal(env.registered(), true);
  assert.equal(env.out('a').textContent, '00:03.0', '서버가 버린 패널 값은 그대로(P11)');
  assert.equal(env.dirty(), true);
  assert.ok(env.toast(), '곡 추가 결과는 알림으로도 보인다');
  env.click('save');
  assert.equal(env.last('SAVE_PRACTICE').msg.a, 3);
  assert.equal(env.last('SAVE_PRACTICE').msg.rate, 0.9);
});

test('TC-EX-14: 영상 전환 뒤 도착한 조회·추가·저장 응답은 새 영상 패널에 들어가지 않는다', async () => {
  const env = await registeredEnv();
  env.play(20);
  env.click('save');
  const oldSave = env.last('SAVE_PRACTICE');

  env.navigate(`https://www.youtube.com/watch?v=${VID2}`);
  await flush();
  const lookups = env.of('LOOKUP_SONG');
  assert.equal(lookups.length, 2);
  assert.equal(lookups[1].msg.videoId, VID2);
  assert.equal(env.registered(), false, '새 영상은 조회 전까지 미등록으로 보인다');
  assert.equal(env.out('a').textContent, '--:--.-');

  oldSave.resolve({ kind: 'saved', keep: false });
  await flush();
  assert.notEqual(env.status(), '저장했습니다', '이전 영상의 저장 결과를 새 패널에 쓰지 않는다');
  assert.equal(env.el('[data-redo-act="add"]').disabled, false);

  // 다시 앞 영상으로 갔다가, 그 사이 늦게 온 VID2 조회 응답
  env.navigate(`https://www.youtube.com/watch?v=${VID}`);
  await flush();
  lookups[1].resolve({ state: 'exists', openUrl: 'x', song: { id: 'other', a: 50, b: 60, rate: 0.5 } });
  await flush();
  assert.equal(env.registered(), false);
  assert.equal(env.out('a').textContent, '--:--.-', '다른 영상의 저장 구간이 들어오지 않는다');

  // 영상 전환은 누적분을 버린다
  env.last('LOOKUP_SONG').resolve({ state: 'exists', openUrl: 'x', song: { id: SONG_ID, a: null, b: null, rate: 1 } });
  await flush();
  env.click('save');
  assert.equal(env.last('SAVE_PRACTICE').msg.addSeconds, 0);

  // 곡 추가 도중 다른 영상으로 가면 그 추가 결과로 새 영상을 등록 상태로 만들지 않는다
  const fresh = panelEnv();
  await flush();
  fresh.last('LOOKUP_SONG').resolve({ state: 'none' });
  await flush();
  fresh.click('add');
  const pendingAdd = fresh.last('ADD_SONG');
  fresh.navigate(`https://www.youtube.com/watch?v=${VID2}`);
  await flush();
  pendingAdd.resolve({ kind: 'added', openUrl: 'x', song: { id: SONG_ID, a: null, b: null, rate: 1 } });
  await flush();
  assert.equal(fresh.registered(), false, '이전 영상의 추가 결과');
  assert.equal(fresh.el('[data-redo-act="add"]').disabled, false);
});

test('EX3-계정: 계정이 바뀌면 누적 0·같은 영상 재조회, 그 전 저장 응답은 버린다', async () => {
  const env = await registeredEnv();
  env.play(30);
  env.video.currentTime = 25;
  env.fireVideo('timeupdate'); // 반복은 꺼져 있어 되감지 않는다
  env.click('save');
  const oldSave = env.last('SAVE_PRACTICE');

  env.message({ type: 'REDO_AUTH_CHANGED' });
  await flush();
  assert.equal(env.of('LOOKUP_SONG').length, 2, '같은 영상이라도 다시 조회');
  assert.equal(env.registered(), false, '조회 전까지 이전 계정 상태를 보이지 않는다');
  oldSave.resolve({ kind: 'saved', keep: false });
  await flush();
  assert.notEqual(env.status(), '저장했습니다');

  env.last('LOOKUP_SONG').resolve({ state: 'exists', openUrl: 'x', song: { id: SONG_ID, a: 10, b: 20, rate: 0.75 } });
  await flush();
  env.click('save');
  assert.equal(env.last('SAVE_PRACTICE').msg.addSeconds, 0, '이전 계정에서 쌓은 시간은 새 계정에 보내지 않는다');
});

test('EX3-오류(패널): 로그인·연결 실패·삭제된 곡·계정 바뀜·서버 문구', async () => {
  const cases = [
    [{ kind: 'login', message: '로그인이 필요합니다', action: 'login' }, '', 40],
    [{ kind: 'network', message: '서버에 연결하지 못했습니다' }, '서버에 연결하지 못했습니다', 40],
    [{ kind: 'gone', message: 'x' }, 'RE:DO에서 삭제된 곡입니다. 다시 추가할 수 있습니다', 40],
    [{ kind: 'switched', message: 'x' }, '요청 도중 계정이 바뀌어 저장하지 않았습니다', 0],
    [{ kind: 'error', status: 403, message: '곡 한도를 넘었습니다' }, '곡 한도를 넘었습니다', 40],
    [{ kind: 'error' }, '저장하지 못했습니다', 40],
    [null, '확장 프로그램이 갱신되었습니다. 페이지를 새로고침해 주세요', 40],
  ];
  for (const [res, text, nextSeconds] of cases) {
    const env = await registeredEnv();
    env.play(40);
    env.click('save');
    env.last('SAVE_PRACTICE').resolve(res);
    await flush();
    const label = res ? res.kind : 'null';
    if (res && res.kind === 'login') {
      assert.equal(env.toast().children.at(-1).textContent, '로그인', '로그인 알림 + [로그인]');
    } else {
      assert.equal(env.status(), text, label);
    }
    if (res && res.kind === 'gone') {
      assert.equal(env.registered(), false, '삭제된 곡이면 미등록 상태로');
      assert.equal(env.el('[data-redo-act="add"]').hidden, false);
      continue;
    }
    assert.equal(env.el('[data-redo-act="save"]').disabled, false, `${label}: 다시 저장할 수 있다`);
    env.click('save');
    assert.equal(env.last('SAVE_PRACTICE').msg.addSeconds, nextSeconds, `${label}: 누적분`);
  }
});

test('EX3-우클릭 추가: 같은 영상의 REDO_TOAST 결과로 저장 줄이 등록 상태가 된다', async () => {
  const env = panelEnv();
  await flush();
  env.last('LOOKUP_SONG').resolve({ state: 'none' });
  await flush();
  env.message({ type: 'REDO_TOAST', videoId: VID2, result: { kind: 'added', song: { id: 'x', rate: 1 } } });
  assert.equal(env.registered(), false, '다른 영상의 결과는 무시');
  env.message({ type: 'REDO_TOAST', videoId: VID, result: { kind: 'added', openUrl: 'u', song: { id: SONG_ID, a: null, b: null, rate: 1 } } });
  assert.equal(env.registered(), true);
});
