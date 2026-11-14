// EX-1 크롬 확장 — DOM과 무관한 순수 로직 검증 (개발산출물/명세/EX-1_크롬확장_구현명세.md §7 TC-EX-02·03·07·08)
// 외부 의존성 없이 Node 내장 모듈만 사용한다. 유튜브 실화면 동작은 수동 검수표로 확인한다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.join(__dirname, '..', 'extension');
const load = (name) => import(require('node:url').pathToFileURL(path.join(EXT, name)).href);

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj) {
      Object.assign(data, obj);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const SESSION_KEY = 'redo:session';
const NOW = 1_800_000_000_000;
const session = (over = {}) => ({
  accessToken: 'access-old',
  refreshToken: 'refresh-old',
  expiresAt: NOW + 3_600_000,
  email: 'a@example.com',
  ...over,
});

test('TC-EX-02: PKCE 값 — verifier 43자, challenge는 SHA-256(verifier)의 base64url', async () => {
  const { createPkcePair, buildAuthorizeUrl, parseAuthRedirect } = await load('auth.js');
  const { verifier, challenge } = await createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  const expected = require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challenge, expected);

  const url = new URL(buildAuthorizeUrl('https://abc.chromiumapp.org/', challenge));
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('redirect_to'), 'https://abc.chromiumapp.org/');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');

  assert.deepEqual(parseAuthRedirect('https://abc.chromiumapp.org/?code=xyz'), { code: 'xyz', error: null });
  assert.equal(parseAuthRedirect('https://abc.chromiumapp.org/?error=access_denied&error_description=denied').code, null);
  assert.equal(parseAuthRedirect('https://abc.chromiumapp.org/#error_description=bad').error, 'bad');
  assert.equal(parseAuthRedirect('not a url').code, null);
});

test('TC-EX-02: 만료가 멀면 갱신하지 않고, 60초 이내면 동시 요청이 겹쳐도 갱신은 1회', async () => {
  const { createAuth } = await load('auth.js');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), apikey: init.headers.apikey });
    await new Promise((r) => setTimeout(r, 20));
    return jsonResponse(200, { access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 });
  };

  const fresh = memoryStorage({ [SESSION_KEY]: session() });
  assert.equal(await createAuth({ storage: fresh, fetchImpl, now: () => NOW }).getAccessToken(), 'access-old');
  assert.equal(calls.length, 0);

  const storage = memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW + 30_000 }) });
  const auth = createAuth({ storage, fetchImpl, now: () => NOW });
  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
  assert.deepEqual(tokens, ['access-new', 'access-new', 'access-new']);
  assert.equal(calls.length, 1, '갱신 요청은 한 번만');
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=refresh_token$/);
  assert.deepEqual(calls[0].body, { refresh_token: 'refresh-old' });
  assert.ok(calls[0].apikey);
  assert.equal(storage.data[SESSION_KEY].refreshToken, 'refresh-new');
  assert.equal(storage.data[SESSION_KEY].expiresAt, NOW + 3_600_000);
  assert.equal(storage.data[SESSION_KEY].email, 'a@example.com', '갱신 응답에 이메일이 없으면 기존 값 유지');

  assert.equal(await createAuth({ storage: memoryStorage(), fetchImpl, now: () => NOW }).getAccessToken(), null);
});

test('TC-EX-02: 갱신을 서버가 거부하면 토큰 삭제, 연결 실패면 토큰을 남기고 network 오류', async () => {
  const { createAuth, AuthError } = await load('auth.js');
  const expiring = () => memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW - 1 }) });

  const rejected = expiring();
  const authRejected = createAuth({
    storage: rejected,
    fetchImpl: async () => jsonResponse(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }),
    now: () => NOW,
  });
  assert.equal(await authRejected.getAccessToken(), null);
  assert.equal(SESSION_KEY in rejected.data, false, '거부되면 삭제');

  for (const fetchImpl of [
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => jsonResponse(503, null),
  ]) {
    const kept = expiring();
    const auth = createAuth({ storage: kept, fetchImpl, now: () => NOW });
    await assert.rejects(auth.getAccessToken(), (err) => err instanceof AuthError && err.kind === 'network');
    assert.equal(kept.data[SESSION_KEY].refreshToken, 'refresh-old', '장애 때는 세션 유지');
  }

  // 갱신하는 사이 로그아웃하면 갱신 결과를 저장하지 않는다
  const raced = expiring();
  const authRaced = createAuth({
    storage: raced,
    fetchImpl: async () => {
      await raced.remove(SESSION_KEY);
      return jsonResponse(200, { access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 });
    },
    now: () => NOW,
  });
  assert.equal(await authRaced.getAccessToken(), null);
  assert.equal(SESSION_KEY in raced.data, false, '로그아웃 뒤 세션이 되살아나지 않는다');
});

test('TC-EX-03: videoId 추출 — watch · youtu.be · shorts · 잘못된 주소', async () => {
  const { extractVideoId, isVideoId } = await load('background.js');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=10s'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/shorts/a-b_c1D2E3F'), 'a-b_c1D2E3F');
  for (const bad of [
    '',
    null,
    'not a url',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQx',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@channel/videos',
    'https://evil.example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)//watch?v=dQw4w9WgXcQ',
  ]) {
    assert.equal(extractVideoId(bad), null, String(bad));
  }
  assert.equal(isVideoId('dQw4w9WgXcQ'), true);
  assert.equal(isVideoId('dQw4w9WgXc<'), false);

  // 콘텐츠 스크립트(일반 스크립트)의 순수 함수는 DOM 없이 읽어 확인한다
  const ctx = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  assert.equal(ctx.redoVideoIdFromCardHref('/watch?v=dQw4w9WgXcQ&pp=abc', 'https://www.youtube.com'), 'dQw4w9WgXcQ');
  assert.equal(ctx.redoVideoIdFromCardHref('/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ', 'https://www.youtube.com'), null, '재생목록·믹스 제외');
  assert.equal(ctx.redoVideoIdFromCardHref('/shorts/dQw4w9WgXcQ', 'https://www.youtube.com'), null, '쇼츠 제외');
  assert.equal(ctx.redoVideoIdFromCardHref('https://www.googleadservices.com/pagead/aclk?video_id=dQw4w9WgXcQ', 'https://www.youtube.com'), null, '광고 제외');
  assert.equal(ctx.redoWatchVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.equal(ctx.redoWatchVideoId('https://www.youtube.com/results?search_query=watch'), null);
});

function apiHarness(background, { token = 'tok', respond }) {
  const calls = [];
  let cleared = 0;
  const auth = {
    getAccessToken: async () => (typeof token === 'function' ? token() : token),
    clearSessionIfToken: async () => {
      cleared += 1;
    },
  };
  const api = background.createApi({
    auth,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
    getSettings: async () => background.normalizeSettings({}),
  });
  return { api, calls, cleared: () => cleared };
}

test('TC-EX-07: 곡 추가 응답별 알림 (§5.3 표)', async () => {
  const background = await load('background.js');
  const { AuthError } = await load('auth.js');
  const base = background.DEFAULT_API_BASE;
  const id = 'dQw4w9WgXcQ';

  const created = apiHarness(background, { respond: async () => jsonResponse(201, { song: {} }) });
  assert.deepEqual(await created.api.addSong(id), {
    kind: 'added',
    message: 'RE:DO에 추가했습니다',
    action: 'open',
    openUrl: `${base}/practice.html?v=${id}`,
  });
  assert.equal(created.calls[0].url, `${base}/api/v1/songs`);
  assert.equal(created.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(created.calls[0].init.body), { videoId: id }, 'videoId만 보낸다(P6)');
  assert.equal(created.calls[0].init.headers.Authorization, 'Bearer tok');

  const exists = await apiHarness(background, { respond: async () => jsonResponse(200, { song: {} }) }).api.addSong(id);
  assert.equal(exists.kind, 'exists');
  assert.equal(exists.message, '이미 RE:DO에 있는 곡입니다');
  assert.equal(exists.action, 'open');

  const noToken = apiHarness(background, { token: null, respond: async () => jsonResponse(201, {}) });
  assert.deepEqual(await noToken.api.addSong(id), { kind: 'login', message: '로그인이 필요합니다', action: 'login' });
  assert.equal(noToken.calls.length, 0, '토큰이 없으면 호출하지 않는다');

  const unauthorized = apiHarness(background, { respond: async () => jsonResponse(401, { message: 'x' }) });
  assert.equal((await unauthorized.api.addSong(id)).kind, 'login');
  assert.equal(unauthorized.cleared(), 1, '401이면 토큰 삭제');

  const limit = await apiHarness(background, {
    respond: async () => jsonResponse(403, { ok: false, code: 'SONG_LIMIT', message: '곡 한도를 넘었습니다' }),
  }).api.addSong(id);
  assert.deepEqual(limit, { kind: 'error', status: 403, message: '곡 한도를 넘었습니다' });

  const noBody = await apiHarness(background, {
    respond: async () => ({ status: 500, ok: false, json: async () => { throw new Error('no body'); } }),
  }).api.addSong(id);
  assert.equal(noBody.message, '추가하지 못했습니다');

  const down = await apiHarness(background, {
    respond: async () => {
      throw new TypeError('Failed to fetch');
    },
  }).api.addSong(id);
  assert.deepEqual(down, { kind: 'network', message: '서버에 연결하지 못했습니다' });

  const authDown = await apiHarness(background, {
    token: () => {
      throw new AuthError('network', 'x');
    },
    respond: async () => jsonResponse(201, {}),
  }).api.addSong(id);
  assert.equal(authDown.kind, 'network');

  const invalid = apiHarness(background, { respond: async () => jsonResponse(201, {}) });
  assert.equal((await invalid.api.addSong('../../admin')).kind, 'error');
  assert.equal(invalid.calls.length, 0, '잘못된 videoId는 보내지 않는다');
});

test('TC-EX-08: 같은 영상 연타는 요청 1회, 끝난 뒤에는 다시 보낼 수 있다', async () => {
  const background = await load('background.js');
  const h = apiHarness(background, {
    respond: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse(201, { song: {} });
    },
  });
  const results = await Promise.all([
    h.api.addSong('dQw4w9WgXcQ'),
    h.api.addSong('dQw4w9WgXcQ'),
    h.api.addSong('dQw4w9WgXcQ'),
    h.api.addSong('aaaaaaaaaaa'),
  ]);
  assert.equal(h.calls.length, 2, '영상별 1회');
  assert.equal(results[0], results[1]);
  assert.equal(results[3].openUrl.endsWith('v=aaaaaaaaaaa'), true);
  await h.api.addSong('dQw4w9WgXcQ');
  assert.equal(h.calls.length, 3);
});

test('EX-1: 매니페스트 — 권한·대상·파일이 명세 §4와 같고 참조 파일이 실제로 있다', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'identity', 'contextMenus']);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.youtube.com/*']);
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  const files = [
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    'auth.js',
    'options.js',
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(EXT, f)), f);
  // 확장 ID는 key로 고정된다: SHA-256(공개 키 DER) 앞 32자리를 a~p로 바꾼 값
  const der = Buffer.from(manifest.key, 'base64');
  const hex = require('node:crypto').createHash('sha256').update(der).digest('hex').slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.equal(id, 'pamcfmpmaoehcmddfieihilojkfjfpld');
});

// ───────── PR #23 리뷰 결함 회귀 (3-P) ─────────

const sessionB = () => ({
  accessToken: 'access-B',
  refreshToken: 'refresh-B',
  expiresAt: NOW + 3_600_000,
  email: 'b@example.com',
  sid: 'sid-B',
});

test('PR23-1: 갱신 중 로그아웃 후 B로 다시 로그인하면 A에서 시작한 요청은 B 토큰으로 보내지 않는다', async () => {
  const { createAuth, AuthError } = await load('auth.js');
  const background = await load('background.js');
  const storage = memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW - 1, sid: 'sid-A' }) });
  const apiCalls = [];
  let releaseRefresh;
  const fetchImpl = async (url, init) => {
    if (url.includes('/auth/v1/token')) {
      await new Promise((r) => (releaseRefresh = r));
      return jsonResponse(200, { access_token: 'access-A2', refresh_token: 'refresh-A2', expires_in: 3600 });
    }
    apiCalls.push({ url, auth: init.headers.Authorization });
    return jsonResponse(201, { song: {} });
  };
  const auth = createAuth({ storage, fetchImpl, now: () => NOW });
  const api = background.createApi({ auth, fetchImpl, getSettings: async () => background.normalizeSettings({}) });

  const pending = api.addSong('dQw4w9WgXcQ');
  await new Promise((r) => setTimeout(r, 5));
  // 옵션 화면: A 로그아웃 → B 로그인
  await storage.remove(SESSION_KEY);
  await storage.set({ [SESSION_KEY]: sessionB() });
  // B가 새로 시작한 요청은 A의 갱신에 묶이지 않고 B 토큰을 받는다
  assert.equal(await auth.getAccessToken(), 'access-B');
  releaseRefresh();
  const result = await pending;
  assert.equal(apiCalls.length, 0, 'A에서 시작한 곡 추가는 보내지 않는다');
  assert.equal(result.kind, 'error');
  assert.equal(storage.data[SESSION_KEY].accessToken, 'access-B', 'B 세션 유지');

  // auth 단위: 갱신 결과는 취소(cancelled)로 끝난다
  const s2 = memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW - 1, sid: 'sid-A' }) });
  const auth2 = createAuth({
    storage: s2,
    fetchImpl: async () => {
      await s2.set({ [SESSION_KEY]: sessionB() });
      return jsonResponse(200, { access_token: 'access-A2', refresh_token: 'refresh-A2', expires_in: 3600 });
    },
    now: () => NOW,
  });
  await assert.rejects(auth2.getAccessToken(), (err) => err instanceof AuthError && err.kind === 'cancelled');
});

test('PR23-2: 늦게 온 401은 요청에 쓴 세션일 때만 지운다', async () => {
  const { createAuth } = await load('auth.js');
  const background = await load('background.js');
  const make = (swap) => {
    const storage = memoryStorage({ [SESSION_KEY]: session({ sid: 'sid-A' }) });
    const fetchImpl = async () => {
      if (swap) {
        await storage.remove(SESSION_KEY);
        await storage.set({ [SESSION_KEY]: sessionB() });
      }
      return jsonResponse(401, { message: 'expired' });
    };
    const auth = createAuth({ storage, fetchImpl, now: () => NOW });
    const api = background.createApi({ auth, fetchImpl, getSettings: async () => background.normalizeSettings({}) });
    return { storage, api };
  };
  const swapped = make(true);
  assert.equal((await swapped.api.lookupSong('dQw4w9WgXcQ')).state, 'login');
  assert.equal(swapped.storage.data[SESSION_KEY].accessToken, 'access-B', '새 세션은 지우지 않는다');

  const same = make(false);
  assert.equal((await same.api.addSong('dQw4w9WgXcQ')).kind, 'login');
  assert.equal(SESSION_KEY in same.storage.data, false, '요청에 쓴 세션이면 지운다');
});

test('PR23-4: 응답 본문을 읽는 동안에도 제한 시간이 적용된다', async () => {
  const { createAuth, fetchWithTimeout, AuthError } = await load('auth.js');
  const background = await load('background.js');
  const hang = () => new Promise(() => {});
  const stalled = async () => ({ status: 200, ok: true, json: hang });

  await assert.rejects(fetchWithTimeout(stalled, 'https://x', {}, 30, (res) => res.json()));

  const storage = memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW - 1 }) });
  const auth = createAuth({ storage, fetchImpl: stalled, now: () => NOW, timeoutMs: 30 });
  await assert.rejects(auth.getAccessToken(), (err) => err instanceof AuthError && err.kind === 'network');
  assert.equal(storage.data[SESSION_KEY].refreshToken, 'refresh-old', '시간 초과는 장애로 보고 세션 유지');

  const fresh = memoryStorage({ [SESSION_KEY]: session() });
  const api = background.createApi({
    auth: createAuth({ storage: fresh, fetchImpl: stalled, now: () => NOW }),
    fetchImpl: stalled,
    getSettings: async () => background.normalizeSettings({}),
    timeoutMs: 30,
  });
  assert.equal((await api.lookupSong('dQw4w9WgXcQ')).state, 'unknown');
  const stalledError = async () => ({ status: 403, ok: false, json: hang });
  const api2 = background.createApi({
    auth: createAuth({ storage: fresh, fetchImpl: stalledError, now: () => NOW }),
    fetchImpl: stalledError,
    getSettings: async () => background.normalizeSettings({}),
    timeoutMs: 30,
  });
  assert.equal((await api2.addSong('dQw4w9WgXcQ')).kind, 'network');
});

// content.js를 돌릴 최소 DOM. 재생 화면 버튼에 필요한 만큼만 흉내 낸다.
function fakeDom(href) {
  const make = (tag) => {
    const el = {
      tagName: tag,
      children: [],
      parent: null,
      dataset: {},
      style: {},
      listeners: {},
      className: '',
      textContent: '',
      title: '',
      disabled: false,
      classList: { add: (c) => (el.className = `${el.className} ${c}`.trim()) },
      setAttribute() {},
      getAttribute: () => null,
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
      querySelector(sel) {
        const cls = sel.replace(/^\./, '');
        for (const c of el.children) {
          if (c.className.split(' ').includes(cls)) return c;
          const deep = c.querySelector(sel);
          if (deep) return deep;
        }
        return null;
      },
    };
    return el;
  };
  const body = make('body');
  const docListeners = {};
  const document = {
    body,
    createElement: make,
    createElementNS: (_ns, tag) => make(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => ((docListeners[type] ||= []).push(fn)),
  };
  const watchBtn = () => body.children.find((c) => c.className === 'redo-watch-btn') || null;
  return { document, body, watchBtn, location: { href, origin: 'https://www.youtube.com' } };
}

test('PR23-3: 계정이 바뀌면 같은 영상의 재생 화면 버튼 상태를 다시 조회한다', async () => {
  const dom = fakeDom('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const sent = [];
  const lookups = [];
  let onMessage = null;
  const opened = [];
  const chrome = {
    runtime: {
      id: 'ext',
      sendMessage: (m) => {
        sent.push(m);
        if (m.type === 'LOOKUP_SONG') return new Promise((r) => lookups.push(r));
        if (m.type === 'GET_SETTINGS') return Promise.resolve({ menuItem: true });
        if (m.type === 'ADD_SONG') return Promise.resolve({ kind: 'added', message: 'ok', action: 'open', openUrl: 'u' });
        return Promise.resolve(null);
      },
      onMessage: { addListener: (fn) => (onMessage = fn) },
    },
  };
  const window = { open: (...a) => opened.push(a), addEventListener() {} };
  const ctx = vm.createContext({
    URL,
    document: dom.document,
    location: dom.location,
    chrome,
    window,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'), ctx);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const label = () => dom.watchBtn().querySelector('.redo-watch-btn__label').textContent;

  await tick();
  assert.equal(lookups.length, 1);
  lookups[0]({ state: 'exists', openUrl: 'https://x/practice.html?v=dQw4w9WgXcQ' });
  await tick();
  assert.equal(label(), 'RE:DO에 있음', 'A에게 있는 곡');

  // A 계정 조회가 하나 더 진행 중인 채로 계정이 바뀐다(늦게 온 A 응답은 버려야 한다)
  onMessage({ type: 'REDO_AUTH_CHANGED' });
  await tick();
  assert.equal(lookups.length, 2, '계정이 바뀌면 같은 영상이라도 다시 조회');
  assert.equal(label(), 'RE:DO에 추가', '조회 전까지 이전 계정 상태를 보이지 않는다');
  onMessage({ type: 'REDO_AUTH_CHANGED' });
  await tick();
  assert.equal(lookups.length, 3);
  lookups[2]({ state: 'none' });
  lookups[1]({ state: 'exists', openUrl: 'stale' });
  await tick();
  assert.equal(label(), 'RE:DO에 추가', '이전 조회의 늦은 응답은 버린다');

  dom.watchBtn().listeners.click[0]();
  await tick();
  assert.equal(opened.length, 0, '열기 대신 곡 추가');
  assert.ok(sent.some((m) => m.type === 'ADD_SONG' && m.videoId === 'dQw4w9WgXcQ'));
});

test('PR23-3: 서비스 워커는 계정이 바뀔 때만(갱신 제외) 유튜브 탭에 알린다', async () => {
  const background = await load('background.js');
  const { isAccountChange, registerWithChrome } = background;
  const A = session({ sid: 'sid-A' });
  assert.equal(isAccountChange(A, { ...A, accessToken: 'n', refreshToken: 'n2' }), false, '갱신은 계정 변경이 아니다');
  assert.equal(isAccountChange(A, undefined), true, '로그아웃');
  assert.equal(isAccountChange(undefined, sessionB()), true, '로그인');
  assert.equal(isAccountChange(A, sessionB()), true, '다른 세션으로 교체');
  assert.equal(isAccountChange(undefined, undefined), false);

  const listeners = {};
  const sentTo = [];
  const storage = memoryStorage();
  const chromeApi = {
    storage: { local: storage, onChanged: { addListener: (fn) => (listeners.changed = fn) } },
    runtime: { id: 'ext', onInstalled: { addListener() {} }, onMessage: { addListener() {} }, getURL: (p) => `chrome-extension://ext/${p}` },
    contextMenus: { onClicked: { addListener() {} } },
    tabs: {
      query: async (q) => {
        assert.deepEqual(q, { url: 'https://www.youtube.com/*' });
        return [{ id: 1 }, { id: 2 }];
      },
      sendMessage: async (id, m) => {
        sentTo.push([id, m.type]);
        if (id === 2) throw new Error('no receiver');
      },
    },
  };
  registerWithChrome(chromeApi);
  listeners.changed({ [SESSION_KEY]: { oldValue: A, newValue: { ...A, accessToken: 'n' } } }, 'local');
  listeners.changed({ 'redo:settings': { newValue: {} } }, 'local');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sentTo.length, 0, '갱신·설정 변경은 알리지 않는다');
  listeners.changed({ [SESSION_KEY]: { oldValue: A } }, 'local');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sentTo, [
    [1, 'REDO_AUTH_CHANGED'],
    [2, 'REDO_AUTH_CHANGED'],
  ]);
});
