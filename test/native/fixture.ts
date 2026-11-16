// Only bundled by prepare-native-tests.mjs into an isolated test copy.
import { App } from '@capacitor/app';
import { initNativeNavigation, blockNativeNavigation } from '../../frontend/src/lib/nativeNavigation';
initNativeNavigation();
const status = document.getElementById('state')!;
const page = location.pathname.split('/').pop() || 'index.html';
document.getElementById('page')!.textContent = 'Page ' + page;
let release: (() => void) | null = null;
for (const reason of ['recording', 'upload', 'take', 'note']) {
  document.getElementById(reason)!.onclick = () => {
    release?.(); release = blockNativeNavigation();
    status.textContent = 'Locked ' + reason;
    if (reason === 'recording') {
      // Neither a stale main-frame notification nor an iframe may unlock us.
      queueMicrotask(() => window.webkit?.messageHandlers?.redoNavigation?.postMessage({ document: 'old-document', sequence: 0, blocked: false }));
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.srcdoc = '<script>window.webkit?.messageHandlers?.redoNavigation?.postMessage({document:"iframe",sequence:1,blocked:false})<\/script>';
      document.body.append(iframe);
    }
  };
}
document.getElementById('unlock')!.onclick = () => { release?.(); release = null; status.textContent = 'Unlocked'; };
document.getElementById('modal')!.onclick = () => { document.getElementById('dialog')!.hidden = false; };
document.getElementById('close')!.onclick = () => { document.getElementById('dialog')!.hidden = true; };
document.getElementById('push')!.onclick = () => { history.pushState({}, '', '?v=test&t=17&a=12&b=48&r=0.75#account'); status.textContent = 'SPA pushed'; };
document.getElementById('replace')!.onclick = () => { history.replaceState({}, '', '?v=test&t=19&a=12&b=48&r=0.75#account'); status.textContent = 'SPA replaced'; };
window.onpopstate = () => { status.textContent = 'URL [' + location.search + location.hash + ']'; };

// Production auth module + native App URL bridge; SDK/HTTP are deterministic fixtures.
const sessionKey = 'uxn:session';
let session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
let changed = (_event: string, _session: unknown) => {};
let pendingMe: (() => void) | null = null;
let holdMe = false;
const count = (key: string) => { const n = Number(localStorage.getItem(key) || 0) + 1; localStorage.setItem(key, String(n)); return n; };
const sdk = {
  async getSession() { return { data: { session } }; },
  onAuthStateChange(cb: typeof changed) { changed = cb; return {}; },
  async signInWithOAuth() {
    const flowId = 'fixture-flow-' + crypto.randomUUID();
    localStorage.setItem('uxn:flow', flowId);
    localStorage.setItem('uxn:verifier', 'fixture-verifier-' + flowId);
    return { data: { provider: 'google', flowId, url: 'https://auth.test/auth/v1/authorize?provider=google' } };
  },
  async exchangeCodeForSession(code: string, options: { flowId: string }) {
    if (options.flowId !== localStorage.getItem('uxn:flow') || localStorage.getItem('uxn:verifier') !== 'fixture-verifier-' + options.flowId) throw Error('pending verifier missing');
    count('uxn:exchanges');
    session = { access_token: 'fixture-' + code, user: { id: code } };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    changed('SIGNED_IN', session);
    return { data: { session } };
  },
  async signOut() {
    session = null; localStorage.removeItem(sessionKey); changed('SIGNED_OUT', null); return {};
  },
};
Object.assign(window, {
  ULEVELP_CONFIG: { supabaseUrl: 'https://auth.test', supabaseAnonKey: 'fixture-public-key' },
  supabase: { createClient: () => ({ auth: sdk }) },
});
window.fetch = async (_url, options) => {
  const uid = (new Headers(options?.headers).get('Authorization') || '').replace('Bearer fixture-', '').split('-')[0];
  if (holdMe && uid === 'A') await new Promise<void>(resolve => { pendingMe = resolve; });
  return new Response(JSON.stringify({ id: uid, displayName: 'Profile ' + uid, keys: {}, locale: 'ko' }), { status: 200 });
};
const { auth } = await import('../../frontend/src/lib/auth');
let loginStatus = 'idle';
const render = () => {
  document.getElementById('auth')!.textContent = ['Auth', auth.getUser()?.id || 'guest', 'Profile', auth.getMe()?.id || 'none', loginStatus, 'Exchanges', localStorage.getItem('uxn:exchanges') || '0'].join(' ');
};
auth.onChange(next => { loginStatus = next.login?.status || 'idle'; render(); });
render();
document.getElementById('login')!.onclick = () => { void auth.signIn().catch(render); };
document.getElementById('logout')!.onclick = () => { void auth.signOut().then(render); };
document.getElementById('hold')!.onclick = () => { holdMe = true; status.textContent = 'Holding A profile'; };
document.getElementById('release')!.onclick = () => { holdMe = false; pendingMe?.(); pendingMe = null; status.textContent = 'Released A profile'; };
document.getElementById('userB')!.onclick = () => {
  session = { access_token: 'fixture-B', user: { id: 'B' } };
  localStorage.setItem(sessionKey, JSON.stringify(session));
  changed('SIGNED_IN', session); render();
};
document.getElementById('refresh')!.onclick = async () => {
  if (!session) return;
  session = { ...session, access_token: 'fixture-' + session.user.id + '-v2' };
  localStorage.setItem(sessionKey, JSON.stringify(session));
  changed('TOKEN_REFRESHED', session);
  const observed = await auth.getAccessToken();
  status.textContent = observed === session.access_token ? 'Token refreshed' : 'Token refresh mismatch'; render();
};
document.getElementById('expire')!.onclick = () => { session = null; localStorage.removeItem(sessionKey); changed('SIGNED_OUT', null); status.textContent = 'Token expired'; render(); };
document.getElementById('reset')!.onclick = () => { localStorage.clear(); sessionStorage.clear(); location.replace('index.html'); };
await App.addListener('appUrlOpen', () => { document.getElementById('trace')!.textContent = 'OS URL received'; });
document.addEventListener('click', event => { document.getElementById('trace')!.textContent = 'Clicked ' + (event.target as HTMLElement).id; });
status.textContent = 'Native fixture ready';

window.addEventListener('pageshow', () => {
  const key = 'uxn:visits:' + page;
  const count = Number(sessionStorage.getItem(key) || 0) + 1;
  sessionStorage.setItem(key, String(count));
  document.getElementById('visit')!.textContent = 'Visit ' + page + ' ' + count;
});
