// RE:DO 크롬 확장 — 로그인(Supabase PKCE)·토큰 보관·갱신 (EX-1 명세 §5.1)
// 서비스 워커(background.js)와 옵션 화면(options.js)이 import한다. 콘텐츠 스크립트에서는 쓰지 않는다.
// 엔드포인트 근거(V2): supabase/auth openapi.yaml, auth-js GoTrueClient
//   GET  /auth/v1/authorize?provider&redirect_to&code_challenge&code_challenge_method=s256
//   POST /auth/v1/token?grant_type=pkce           { auth_code, code_verifier }
//   POST /auth/v1/token?grant_type=refresh_token  { refresh_token }
//   POST /auth/v1/logout?scope=local              (Authorization: Bearer)

// public/config.js와 같은 공개 값이다(비밀 값 아님).
export const SUPABASE_URL = 'https://vefrfhafmiiivpgjhqiu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_MmTjc8Xk831VCYkVvMT6nw_jhnmrfE-';

export const SESSION_KEY = 'redo:session';
export const FETCH_TIMEOUT_MS = 10_000;
/** 만료가 이 시간 안으로 다가오면 호출 전에 갱신한다 */
export const REFRESH_MARGIN_MS = 60_000;

export class AuthError extends Error {
  /** @param {'network'|'rejected'|'cancelled'} kind cancelled: 로그인 창을 닫았거나, 요청 도중 계정이 바뀌었다 */
  constructor(kind, message) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
  }
}

/**
 * 시간 제한이 있는 fetch. 시간 초과·연결 실패는 그대로 던진다(호출 쪽에서 network로 분류).
 * readBody를 주면 본문 읽기까지 같은 제한 시간 안에 끝내고 { res, body }를 돌려준다.
 * (헤더만 먼저 오고 본문이 멈추면 res.json()이 제한 없이 기다리기 때문이다)
 */
export async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = FETCH_TIMEOUT_MS, readBody) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), timeout]);
    if (!readBody) return res;
    const body = await Promise.race([readBody(res), timeout]);
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

/** 본문을 JSON으로 읽는다. 본문이 없거나 JSON이 아니면 null. */
export async function readJsonOrNull(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function base64UrlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE 값(RFC 7636): verifier는 43자 base64url, challenge는 SHA-256(verifier)의 base64url */
export async function createPkcePair(cryptoImpl = globalThis.crypto) {
  const random = new Uint8Array(32);
  cryptoImpl.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(redirectUri, challenge) {
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  return `${SUPABASE_URL}/auth/v1/authorize?${params}`;
}

/** 로그인 창이 돌아온 주소에서 code를 꺼낸다. 오류는 쿼리 또는 # 뒤에 온다. */
export function parseAuthRedirect(responseUrl) {
  let url;
  try {
    url = new URL(responseUrl);
  } catch {
    return { code: null, error: '로그인 응답 주소를 읽지 못했습니다' };
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const error =
    url.searchParams.get('error_description') ||
    hash.get('error_description') ||
    url.searchParams.get('error') ||
    hash.get('error');
  if (error) return { code: null, error };
  const code = url.searchParams.get('code');
  return code ? { code, error: null } : { code: null, error: '로그인 코드가 없습니다' };
}

function sessionFromTokenResponse(body, nowMs) {
  if (!body || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') return null;
  const expiresAt =
    typeof body.expires_at === 'number'
      ? body.expires_at * 1000
      : nowMs + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000;
  return {
    accessToken: body.access_token,
    // 로그인 한 번을 가리키는 값. 갱신해도 유지하고, 다시 로그인하면 바뀐다(계정 변경 판별용).
    sid: '',
    refreshToken: body.refresh_token,
    expiresAt,
    email: (body.user && typeof body.user.email === 'string' && body.user.email) || '',
  };
}

/**
 * @param {object} deps
 * @param {{get: Function, set: Function, remove: Function}} deps.storage chrome.storage.local 모양
 * @param {Function} deps.fetchImpl
 * @param {{getRedirectURL: Function, launchWebAuthFlow: Function}} [deps.identity] chrome.identity (로그인할 때만 필요)
 * @param {() => number} [deps.now]
 */
export function createAuth({ storage, fetchImpl, identity, now = () => Date.now(), timeoutMs = FETCH_TIMEOUT_MS }) {
  /**
   * 진행 중인 갱신 { refreshToken, promise }. 같은 세션의 동시 요청은 갱신을 한 번만 한다(갱신 토큰은 1회용).
   * 그 사이 다른 세션으로 바뀌었으면 새 세션의 요청은 여기에 묶이지 않는다.
   */
  let refreshing = null;

  const tokenHeaders = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };

  async function getSession() {
    const got = await storage.get(SESSION_KEY);
    const s = got && got[SESSION_KEY];
    return s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' ? s : null;
  }

  async function clearSession() {
    await storage.remove(SESSION_KEY);
  }

  async function requestToken(grantType, body) {
    let res;
    let json;
    try {
      ({ res, body: json } = await fetchWithTimeout(
        fetchImpl,
        `${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`,
        { method: 'POST', headers: tokenHeaders, body: JSON.stringify(body) },
        timeoutMs,
        readJsonOrNull
      ));
    } catch {
      throw new AuthError('network', '인증 서버에 연결하지 못했습니다');
    }
    if (res.status >= 500) throw new AuthError('network', '인증 서버에 연결하지 못했습니다');
    if (!res.ok) {
      const detail = json && (json.error_description || json.msg || json.error);
      throw new AuthError('rejected', detail ? String(detail) : '인증 서버가 요청을 거부했습니다');
    }
    const session = sessionFromTokenResponse(json, now());
    if (!session) throw new AuthError('rejected', '인증 응답에 토큰이 없습니다');
    return session;
  }

  const switched = () => new AuthError('cancelled', '요청 도중 계정이 바뀌었습니다');

  async function runRefresh(used) {
    let next;
    try {
      next = await requestToken('refresh_token', { refresh_token: used.refreshToken });
    } catch (err) {
      // 서버가 거부한 경우(만료·폐기된 갱신 토큰)에만 지운다.
      // 연결 실패·시간 초과·5xx는 잠깐의 장애일 수 있어 세션을 남기고 호출 쪽에 알린다.
      if (err instanceof AuthError && err.kind === 'rejected') {
        const current = await getSession();
        if (!current) return null;
        if (current.refreshToken !== used.refreshToken) throw switched();
        await clearSession();
        return null;
      }
      throw err;
    }
    // 갱신하는 사이 로그아웃했으면 로그인 필요, 다른 세션으로 다시 로그인했으면 요청을 취소한다.
    // 새 세션의 토큰을 돌려주면 이전 계정에서 시작한 요청이 새 계정 인증으로 나간다.
    const current = await getSession();
    if (!current) return null;
    if (current.refreshToken !== used.refreshToken) throw switched();
    if (!next.email) next.email = used.email || '';
    next.sid = used.sid || '';
    await storage.set({ [SESSION_KEY]: next });
    return next.accessToken;
  }

  /**
   * API 호출에 쓸 액세스 토큰. 없으면 null(로그인 필요).
   * 만료 60초 이내면 먼저 갱신한다. 연결 실패는 AuthError('network')를 던진다.
   */
  async function getAccessToken() {
    const session = await getSession();
    if (!session) return null;
    if (refreshing && refreshing.refreshToken === session.refreshToken) return refreshing.promise;
    if (session.expiresAt - now() > REFRESH_MARGIN_MS) return session.accessToken;
    const entry = { refreshToken: session.refreshToken, promise: null };
    entry.promise = runRefresh(session).finally(() => {
      if (refreshing === entry) refreshing = null;
    });
    refreshing = entry;
    return entry.promise;
  }

  /** 요청에 쓴 액세스 토큰이 지금 세션의 것일 때만 지운다(늦게 온 401이 새 로그인 세션을 지우지 않게). */
  async function clearSessionIfToken(usedAccessToken) {
    const current = await getSession();
    if (current && current.accessToken === usedAccessToken) await clearSession();
  }

  /** Google 로그인. 옵션 화면에서 호출한다(사용자 동작 필요). 성공하면 세션을 돌려준다. */
  async function signIn() {
    if (!identity) throw new AuthError('rejected', '이 화면에서는 로그인할 수 없습니다');
    const redirectUri = identity.getRedirectURL();
    const { verifier, challenge } = await createPkcePair();
    let responseUrl;
    try {
      responseUrl = await identity.launchWebAuthFlow({
        url: buildAuthorizeUrl(redirectUri, challenge),
        interactive: true,
      });
    } catch {
      // 창을 닫았거나, Supabase Redirect URLs에 확장 주소가 없어 돌아오지 못한 경우
      throw new AuthError('cancelled', '로그인을 마치지 못했습니다. 창을 닫았거나 로그인 주소가 등록되지 않았습니다');
    }
    const { code, error } = parseAuthRedirect(responseUrl || '');
    if (!code) throw new AuthError('rejected', error || '로그인을 마치지 못했습니다');
    const session = await requestToken('pkce', { auth_code: code, code_verifier: verifier });
    session.sid = base64UrlEncode(globalThis.crypto.getRandomValues(new Uint8Array(12)));
    await storage.set({ [SESSION_KEY]: session });
    return session;
  }

  /** 로그아웃. 서버 폐기는 실패해도 넘어가고, 보관한 토큰은 항상 지운다. */
  async function signOut() {
    const session = await getSession();
    await clearSession();
    if (!session) return;
    try {
      await fetchWithTimeout(
        fetchImpl,
        `${SUPABASE_URL}/auth/v1/logout?scope=local`,
        { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.accessToken}` } },
        timeoutMs
      );
    } catch {
      /* 이미 지웠다 */
    }
  }

  return { getSession, getAccessToken, clearSession, clearSessionIfToken, signIn, signOut };
}
