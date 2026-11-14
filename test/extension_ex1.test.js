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
    clearSession: async () => {
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
