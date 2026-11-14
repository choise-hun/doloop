// RE:DO 크롬 확장 — 서비스 워커: API 중계, 우클릭 메뉴, 메시지 처리 (EX-1 명세 §5.2~§5.4)
// 토큰은 여기서만 쓴다. 콘텐츠 스크립트에는 결과(알림 문구·열기 주소)만 돌려준다.
import { AuthError, FETCH_TIMEOUT_MS, SESSION_KEY, createAuth, fetchWithTimeout, readJsonOrNull } from './auth.js';

export const DEFAULT_API_BASE = 'https://ulevelp-d5ympfsmfq-du.a.run.app';
export const DEV_API_BASE = 'http://127.0.0.1:3000';
export const SETTINGS_KEY = 'redo:settings';
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

/** 유튜브 주소(watch · youtu.be · shorts)에서 videoId를 꺼낸다. 아니면 null. */
export function extractVideoId(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] || null;
  } else if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || null;
  }
  return isVideoId(id) ? id : null;
}

/** 저장된 설정을 허용 값으로 정규화한다. 서비스 주소는 두 값 중 하나만 받는다. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    apiBase: s.apiBase === DEV_API_BASE ? DEV_API_BASE : DEFAULT_API_BASE,
    menuItem: s.menuItem !== false,
  };
}

/**
 * 저장된 세션 변화가 계정 변경(로그인·로그아웃·다른 로그인으로 교체)인지. 토큰 갱신은 sid가 같아 해당하지 않는다.
 * 콘텐츠 스크립트는 이때만 사용자별 화면 상태를 다시 조회한다.
 */
export function isAccountChange(oldValue, newValue) {
  if (!oldValue !== !newValue) return true;
  if (!oldValue) return false;
  return (oldValue.sid || '') !== (newValue.sid || '');
}

export function practiceUrl(apiBase, videoId) {
  return `${apiBase}/practice.html?v=${encodeURIComponent(videoId)}`;
}

const MSG = {
  added: 'RE:DO에 추가했습니다',
  exists: '이미 RE:DO에 있는 곡입니다',
  login: '로그인이 필요합니다',
  switched: '요청 도중 계정이 바뀌어 추가하지 않았습니다',
  failed: '추가하지 못했습니다',
  network: '서버에 연결하지 못했습니다',
  invalid: '추가할 수 있는 영상이 아닙니다',
};

function errorMessage(body) {
  return body && typeof body.message === 'string' && body.message.trim() ? body.message.trim() : null;
}

/**
 * @param {object} deps
 * @param {ReturnType<typeof createAuth>} deps.auth
 * @param {Function} deps.fetchImpl
 * @param {() => Promise<{apiBase: string, menuItem: boolean}>} deps.getSettings
 */
export function createApi({ auth, fetchImpl, getSettings, timeoutMs = FETCH_TIMEOUT_MS }) {
  /** 같은 영상 연타: 진행 중인 요청을 함께 쓴다 */
  const adding = new Map();

  /**
   * 인증을 붙여 호출하고 본문(JSON 또는 null)까지 제한 시간 안에 읽는다.
   * { res, body, apiBase } 또는 { fail: 'login' | 'network' | 'switched' }
   */
  async function authedFetch(path, init = {}) {
    let token;
    try {
      token = await auth.getAccessToken();
    } catch (err) {
      if (err instanceof AuthError && err.kind === 'network') return { fail: 'network' };
      if (err instanceof AuthError && err.kind === 'cancelled') return { fail: 'switched' };
      throw err;
    }
    if (!token) return { fail: 'login' };
    const { apiBase } = await getSettings();
    let res;
    let body;
    try {
      ({ res, body } = await fetchWithTimeout(
        fetchImpl,
        `${apiBase}${path}`,
        { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        timeoutMs,
        readJsonOrNull
      ));
    } catch {
      return { fail: 'network' };
    }
    if (res.status === 401) {
      // 그 사이 다시 로그인한 세션은 지우지 않는다
      await auth.clearSessionIfToken(token);
      return { fail: 'login' };
    }
    return { res, body, apiBase };
  }

  async function runAddSong(videoId) {
    const out = await authedFetch('/api/v1/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    if (out.fail === 'login') return { kind: 'login', message: MSG.login, action: 'login' };
    if (out.fail === 'network') return { kind: 'network', message: MSG.network };
    if (out.fail === 'switched') return { kind: 'error', message: MSG.switched };
    const { res, body, apiBase } = out;
    const openUrl = practiceUrl(apiBase, videoId);
    if (res.status === 201) return { kind: 'added', message: MSG.added, action: 'open', openUrl };
    if (res.status === 200) return { kind: 'exists', message: MSG.exists, action: 'open', openUrl };
    return { kind: 'error', status: res.status, message: errorMessage(body) || MSG.failed };
  }

  /** 곡 추가(§5.3). 결과는 화면 알림에 그대로 쓸 수 있는 모양이다. */
  function addSong(videoId) {
    if (!isVideoId(videoId)) return Promise.resolve({ kind: 'error', message: MSG.invalid });
    const pending = adding.get(videoId);
    if (pending) return pending;
    const run = runAddSong(videoId)
      .catch(() => ({ kind: 'error', message: MSG.failed }))
      .finally(() => adding.delete(videoId));
    adding.set(videoId, run);
    return run;
  }

  /** 이미 등록된 곡인지 조회한다. state: 'exists' | 'none' | 'login' | 'unknown' */
  async function lookupSong(videoId) {
    if (!isVideoId(videoId)) return { state: 'unknown' };
    try {
      const out = await authedFetch(`/api/v1/songs/by-video/${videoId}`);
      if (out.fail === 'login') return { state: 'login' };
      if (out.fail || !out.res.ok) return { state: 'unknown' };
      const body = out.body;
      return body && body.song
        ? { state: 'exists', openUrl: practiceUrl(out.apiBase, videoId) }
        : { state: 'none' };
    } catch {
      return { state: 'unknown' };
    }
  }

  /** 옵션 화면 [연결 확인]: 서버 응답 + (로그인 시) 인증 호출 1회 */
  async function checkConnection() {
    const { apiBase } = await getSettings();
    try {
      const health = await fetchWithTimeout(
        fetchImpl,
        `${apiBase}/api/health`,
        { headers: { Accept: 'application/json' } },
        timeoutMs
      );
      if (health.status === 403) {
        return { ok: false, message: '서버가 이 확장 프로그램의 출처를 허용하지 않습니다(ALLOWED_ORIGINS 확인)' };
      }
      if (!health.ok) return { ok: false, message: `서버 응답 ${health.status}` };
      // 크롬은 확장의 GET에는 Origin을 붙이지 않고 POST에는 붙인다. 곡 추가(POST)가 막히는지는 POST로 봐야 안다.
      // 서버 CORS는 경로와 무관하게 허용 목록에 없는 출처를 403으로 거부한다(없는 POST 경로는 404·405).
      const probe = await fetchWithTimeout(fetchImpl, `${apiBase}/api/health`, { method: 'POST' }, timeoutMs);
      if (probe.status === 403) {
        return { ok: false, message: '서버가 이 확장 프로그램의 출처를 허용하지 않습니다(ALLOWED_ORIGINS 확인)' };
      }
    } catch {
      return { ok: false, message: MSG.network };
    }
    const out = await authedFetch('/api/v1/songs/by-video/aaaaaaaaaaa');
    if (out.fail === 'login') return { ok: true, message: '서버 연결됨 · 로그인이 필요합니다' };
    if (out.fail === 'network' || out.fail === 'switched') return { ok: false, message: MSG.network };
    if (!out.res.ok) return { ok: false, message: `서버 연결됨 · 인증 호출 실패(${out.res.status})` };
    return { ok: true, message: '서버 연결됨 · 로그인 확인됨' };
  }

  return { addSong, lookupSong, checkConnection };
}

// ───────────────────────── 크롬 연결부 (서비스 워커에서만 실행) ─────────────────────────

const MENU_LINK = 'redo-add-link';
const MENU_PAGE = 'redo-add-page';

/** 크롬 이벤트를 건다. 서비스 워커에서만 호출한다(테스트는 가짜 chromeApi로 부른다). */
export function registerWithChrome(chromeApi) {
  const storage = chromeApi.storage.local;
  // 토큰이 든 저장소를 콘텐츠 스크립트(유튜브 페이지 쪽)에서 읽지 못하게 한다. 워커가 깨어날 때마다 다시 건다.
  // local 영역의 setAccessLevel은 크롬 버전에 따라 없다(134에는 없음 — 결과/EX-1 §4). 없으면 건너뛴다:
  // 유튜브 페이지의 스크립트는 어느 쪽이든 chrome.storage에 닿지 못하고, 이 확장의 콘텐츠 스크립트는 저장소를 읽지 않는다.
  if (typeof storage.setAccessLevel === 'function') {
    storage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  }

  const getSettings = async () => normalizeSettings((await storage.get(SETTINGS_KEY))[SETTINGS_KEY]);
  const auth = createAuth({ storage, fetchImpl: (...a) => fetch(...a) });
  const api = createApi({ auth, fetchImpl: (...a) => fetch(...a), getSettings });

  chromeApi.runtime.onInstalled.addListener(() => {
    chromeApi.contextMenus.removeAll(() => {
      chromeApi.contextMenus.create({
        id: MENU_LINK,
        title: 'RE:DO에 추가',
        contexts: ['link'],
        documentUrlPatterns: ['https://www.youtube.com/*'],
        targetUrlPatterns: ['*://www.youtube.com/watch*', '*://youtu.be/*', '*://www.youtube.com/shorts/*'],
      });
      chromeApi.contextMenus.create({
        id: MENU_PAGE,
        title: 'RE:DO에 추가',
        contexts: ['page', 'video'],
        documentUrlPatterns: ['https://www.youtube.com/watch*', 'https://www.youtube.com/shorts/*'],
      });
    });
  });

  chromeApi.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_LINK && info.menuItemId !== MENU_PAGE) return;
    const videoId = extractVideoId(info.menuItemId === MENU_LINK ? info.linkUrl : info.pageUrl || (tab && tab.url));
    api.addSong(videoId).then((result) => {
      if (!tab || typeof tab.id !== 'number') return;
      // 설치 전에 열려 있던 탭에는 콘텐츠 스크립트가 없다. 그때는 알림을 보낼 곳이 없다.
      chromeApi.tabs.sendMessage(tab.id, { type: 'REDO_TOAST', result, videoId }).catch(() => {});
    });
  });

  // 계정이 바뀌면 유튜브 탭에 알린다: 재생 화면 버튼의 "RE:DO에 있음"은 사용자별 상태다.
  // 유튜브 host_permissions가 있어 url로 탭을 고를 수 있다. 콘텐츠 스크립트가 없는 탭은 무시한다.
  chromeApi.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SESSION_KEY]) return;
    const { oldValue, newValue } = changes[SESSION_KEY];
    if (!isAccountChange(oldValue, newValue)) return;
    chromeApi.tabs.query({ url: 'https://www.youtube.com/*' }).then(
      (tabs) => {
        for (const tab of tabs) {
          if (typeof tab.id !== 'number') continue;
          chromeApi.tabs.sendMessage(tab.id, { type: 'REDO_AUTH_CHANGED' }).catch(() => {});
        }
      },
      () => {}
    );
  });

  chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || sender.id !== chromeApi.runtime.id) return false;
    const fromExtensionPage = typeof sender.url === 'string' && sender.url.startsWith(chromeApi.runtime.getURL(''));
    let work = null;
    if (message.type === 'ADD_SONG') work = api.addSong(message.videoId);
    else if (message.type === 'LOOKUP_SONG') work = api.lookupSong(message.videoId);
    else if (message.type === 'GET_SETTINGS') work = getSettings().then((s) => ({ menuItem: s.menuItem }));
    else if (message.type === 'OPEN_OPTIONS') work = chromeApi.runtime.openOptionsPage().then(() => ({ ok: true }));
    else if (message.type === 'CHECK_CONNECTION' && fromExtensionPage) work = api.checkConnection();
    if (!work) return false;
    work.then(sendResponse, () => sendResponse(null));
    return true; // 비동기 응답
  });
}

// 옵션 화면도 이 파일의 순수 함수를 import한다. 리스너는 서비스 워커에서만 건다.
const inServiceWorker =
  typeof ServiceWorkerGlobalScope !== 'undefined' && globalThis instanceof ServiceWorkerGlobalScope;
if (inServiceWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  registerWithChrome(chrome);
}
