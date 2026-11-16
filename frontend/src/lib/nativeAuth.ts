import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { SupabaseClientLike, SupabaseSessionLike } from '../vite-env';

export type NativeLoginState = {
  status: 'idle' | 'opening' | 'waiting' | 'exchanging' | 'error';
  errorCode: string | null;
};
type Pending = { version: 1; flowId: string; startedAt: number; cancelled?: boolean };
type Listener = { remove: () => Promise<void> };
type NativePorts = {
  app: Pick<typeof App, 'addListener' | 'getLaunchUrl'>;
  browser: Pick<typeof Browser, 'open' | 'close' | 'addListener'>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
};
const KEY = 'ulp:native-oauth';
const CALLBACK = 'ulevelp://auth/callback';
const TTL = 10 * 60 * 1000;

function authError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

// SDK events during exchange are quarantined: the SDK persists before resolving.
export function createNativeAuth(options: {
  client: SupabaseClientLike;
  supabaseUrl: string;
  changed: (state: NativeLoginState) => void;
  authenticated: (session: SupabaseSessionLike) => void;
}, ports: NativePorts = { app: App, browser: Browser, storage: localStorage }) {
  let state: NativeLoginState = { status: 'idle', errorCode: null };
  let pending: Pending | null = null;
  let blocked = true;
  let generation = 0;
  const operations = new Set<Promise<void>>();
  function track(work: () => Promise<void>): Promise<void> {
    const task = Promise.resolve().then(work);
    operations.add(task);
    void task.then(() => operations.delete(task), () => operations.delete(task));
    return task;
  }
  let cleanup: Promise<void> | null = null;
  let loginPromise: Promise<void> | null = null;
  let resolveLogin: (() => void) | null = null;
  let rejectLogin: ((error: Error) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners: Listener[] = [];
  let disposed = false;

  function change(status: NativeLoginState['status'], errorCode: string | null = null) {
    state = { status, errorCode };
    options.changed(state);
  }
  function save(record: Pending) {
    ports.storage.setItem(KEY, JSON.stringify(record));
    pending = record;
  }
  function clear() {
    ports.storage.removeItem(KEY);
    pending = null;
    clearTimeout(timer);
    clearTimeout(closeTimer);
  }
  function settle(error?: Error) {
    const resolve = resolveLogin, reject = rejectLogin;
    loginPromise = null; resolveLogin = null; rejectLogin = null;
    if (error) reject?.(error); else resolve?.();
  }
  function fail(code: string) {
    generation++;
    clearTimeout(timer); clearTimeout(closeTimer);
    try { clear(); blocked = false; }
    catch { blocked = true; code = 'NATIVE_AUTH_CONFIG'; console.warn('Could not clear authentication state'); }
    change('error', code); settle(authError(code));
  }
  function armExpiry() {
    clearTimeout(timer);
    if (!pending || pending.cancelled) return;
    timer = setTimeout(expire, Math.max(0, pending.startedAt + TTL - Date.now()));
  }
  function expire() {
    if (pending && !pending.cancelled && Date.now() >= pending.startedAt + TTL && state.status !== 'exchanging') {
      generation++; fail('NATIVE_AUTH_CANCELLED');
    }
  }
  async function closeBrowser() {
    try { await ports.browser.close(); }
    catch { console.warn('Could not close authentication browser'); }
  }

  async function handleUrl(value: string) {
    if (!pending || pending.cancelled || state.status !== 'waiting') return;
    expire();
    if (!pending) return;
    // Some Android WebViews parse non-special schemes with an empty hostname.
    // Parse a special-scheme surrogate, but validate the original authority too:
    // HTTPS normalization must not admit ports, credentials, or extra slashes.
    const callback = /^ulevelp:\/\/([^/?#]+)(.*)$/i.exec(value);
    if (!callback) return;
    let url: URL;
    try { url = new URL(`https://${callback[1]}${callback[2]}`); } catch { return; }
    if (url.hostname !== 'auth' || url.pathname !== '/callback') return;
    const params = url.searchParams;
    const keys = [...params.keys()];
    const allowed = ['code', 'error', 'error_code', 'error_description'];
    if (callback[1] !== 'auth' || url.host !== 'auth' || url.username || url.password || url.hash ||
        keys.some(key => !allowed.includes(key) || params.getAll(key).length !== 1) ||
        (params.has('code') && keys.some(key => key.startsWith('error'))) ||
        (!params.get('code') && !params.get('error'))) {
      fail('NATIVE_AUTH_CALLBACK_INVALID'); return;
    }
    if (params.has('error')) { fail('NATIVE_AUTH_EXCHANGE_FAILED'); return; }
    const record = pending, epoch = generation;
    clearTimeout(closeTimer); clearTimeout(timer);
    change('exchanging');
    // Assign flight before invoking the SDK so synchronous events cannot escape.
    const flight = track(async () => {
      try {
        const result = await options.client.auth.exchangeCodeForSession(params.get('code') || '', { flowId: record.flowId });
        if (generation !== epoch || pending?.cancelled) return;
        if (result.error || !result.data?.session) { fail('NATIVE_AUTH_EXCHANGE_FAILED'); return; }
        const session = result.data.session;
        generation++;
        clear(); blocked = false; change('idle');
        options.authenticated(session);
        settle();
        void closeBrowser();
      } catch {
        if (generation === epoch && !pending?.cancelled) fail('NATIVE_AUTH_EXCHANGE_FAILED');
      }
    });
    await flight;

  }

  async function cleanSdk() {
    const result = await options.client.auth.signOut({ scope: 'local' });
    if (result?.error) throw result.error;
    ports.storage.removeItem('ulp:auth');
  }
  const ready = (async () => {
    const raw = ports.storage.getItem(KEY);
    if (raw) {
      try {
        const value: unknown = JSON.parse(raw);
        if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1 &&
            'flowId' in value && typeof value.flowId === 'string' &&
            'startedAt' in value && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt)) {
          pending = { version: 1, flowId: value.flowId, startedAt: value.startedAt,
            cancelled: 'cancelled' in value && value.cancelled === true };
        } else throw new Error('Invalid pending authentication');
      } catch { save({ version: 1, flowId: '', startedAt: Date.now(), cancelled: true }); }
    }
    if (pending?.cancelled) {
      try { await cleanSdk(); clear(); }
      catch { change('error', 'NATIVE_AUTH_CONFIG'); }
    }
    listeners.push(await ports.app.addListener('appUrlOpen', event => {
      void ready.then(() => handleUrl(event.url)).catch(() => fail('NATIVE_AUTH_CONFIG'));
    }));
    listeners.push(await ports.app.addListener('appStateChange', event => { if (event.isActive) expire(); }));
    listeners.push(await ports.browser.addListener('browserFinished', () => {
      if (state.status !== 'waiting') return;
      const epoch = generation;
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (generation === epoch && state.status === 'waiting') {
          generation++; fail('NATIVE_AUTH_CANCELLED');
        }
      }, 0);
    }));
    if (pending && !pending.cancelled) {
      const record = pending, epoch = generation;
      const restored = await options.client.auth.getSession();
      if (generation === epoch && pending === record && !pending.cancelled) {
        if (restored.data?.session) { clear(); blocked = false; change('idle'); options.authenticated(restored.data.session); }
        else { change('waiting'); armExpiry(); expire(); }
      }
    }
    if (!pending) blocked = false;
    const launch = await ports.app.getLaunchUrl();
    if (launch?.url) await handleUrl(launch.url);
  })();
  // The caller observes readiness failures; prevent unhandled listener chains.
  void ready.catch(() => { change('error', 'NATIVE_AUTH_CONFIG'); });

  function signIn(): Promise<void> {
    if (loginPromise) return loginPromise;
    loginPromise = new Promise<void>((resolve, reject) => { resolveLogin = resolve; rejectLogin = reject; });
    const promise = loginPromise;
    void (async () => {
      let epoch: number | null = null;
      try {
        await ready;
        if (cleanup) await cleanup;
        if (pending?.cancelled) await cancel(false);
        if (pending && state.status === 'waiting') return;
        blocked = true;
        epoch = ++generation;
        change('opening');
        const flight = track(async () => {
          const result = await options.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: CALLBACK, skipBrowserRedirect: true } });
          if (generation !== epoch) return;
          if (result.error || !result.data?.url || !result.data.flowId) throw authError('NATIVE_AUTH_CONFIG');
          const url = new URL(result.data.url);
          if (url.protocol !== 'https:' || url.origin !== new URL(options.supabaseUrl).origin ||
              url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.hash) throw authError('NATIVE_AUTH_CONFIG');
          save({ version: 1, flowId: result.data.flowId, startedAt: Date.now() });
          change('waiting'); armExpiry();
          try { await ports.browser.open({ url: url.href }); }
          catch { throw authError('NATIVE_AUTH_OPEN_FAILED'); }
        });
        await flight;
      } catch (error) {
        if (epoch !== null && epoch !== generation) return;
        if (pending?.cancelled) { change('error', 'NATIVE_AUTH_CONFIG'); settle(authError('NATIVE_AUTH_CONFIG')); return; }
        const code = error instanceof Error && 'code' in error && error.code === 'NATIVE_AUTH_OPEN_FAILED'
          ? 'NATIVE_AUTH_OPEN_FAILED' : 'NATIVE_AUTH_CONFIG';
        fail(code);
      }
    })();
    return promise;
  }

  function cancel(settlePending = true): Promise<void> {
    if (cleanup) return cleanup;
    generation++; blocked = true;
    clearTimeout(timer); clearTimeout(closeTimer);
    save({ version: 1, flowId: pending?.flowId || '', startedAt: pending?.startedAt || Date.now(), cancelled: true });
    if (settlePending) settle(authError('NATIVE_AUTH_CANCELLED'));
    const running = [...operations];
    cleanup = (async () => {
      // ready may already be running cold cleanup; SDK operations remain serialized.
      await ready;
      await Promise.allSettled(running);
      await cleanSdk();
      clear(); blocked = false; change('idle');
      void closeBrowser();
    })().catch(error => { change('error', 'NATIVE_AUTH_CONFIG'); throw error; }).finally(() => { cleanup = null; });
    return cleanup;
  }

  return {
    ready, signIn, cancel,
    blocksSession: () => blocked || Boolean(pending?.cancelled),
    getState: () => state,
    async dispose() {
      if (disposed) return;
      disposed = true; clearTimeout(timer); clearTimeout(closeTimer);
      await Promise.all(listeners.map(listener => listener.remove()));
    },
  };
}
