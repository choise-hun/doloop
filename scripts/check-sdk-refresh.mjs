// Opt-in network probe: execute the exact SRI-pinned product SDK with an isolated clock/HTTP fixture.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const script = /<script src="([^"]+supabase\.js)" integrity="sha384-([^"]+)"/.exec(html);
if (!script) throw Error('Pinned Supabase script/SRI missing');
const response = await fetch(script[1], { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw Error('SDK download HTTP ' + response.status);
const source = await response.text();
assert.equal(createHash('sha384').update(source).digest('base64'), script[2], 'Product SRI must match');
let now = Date.UTC(2026, 10, 17);
const initialTime = now;
const RealDate = Date;
class ClockDate extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const timers = new Map();
let nextId = 0;
function schedule(callback, delay = 0, interval = false, args = []) {
  const timer = { id: ++nextId, at: now + delay, delay, interval, callback, args, unref() {} };
  timers.set(timer, timer); return timer;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
async function advance(ms) {
  const end = now + ms;
  let steps = 0;
  while (true) {
    const timer = [...timers.values()].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!timer) break;
    assert.ok(++steps < 1000, 'Bounded timer execution');
    now = timer.at;
    if (timer.interval) timer.at += timer.delay; else timers.delete(timer);
    timer.callback(...timer.args); await flush();
  }
  now = end; await flush();
}
const owner = '00000000-0000-4000-8000-000000000001';
const jwt = version => ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', exp: Math.floor(now / 1000) + 3600, version })).toString('base64url'), 'fixture'].join('.');
const oldToken = jwt(1);
let newToken;
const values = new Map([['ulp:auth', JSON.stringify({ access_token: oldToken, refresh_token: 'fixture-refresh', expires_at: Math.floor(now / 1000) + 180, expires_in: 180, token_type: 'bearer', user: { id: owner, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' } })]]);
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const requests = [], events = [];
const fakeFetch = async (url, options) => {
  assert.equal(new URL(url).pathname, '/auth/v1/token');
  assert.equal(new URL(url).searchParams.get('grant_type'), 'refresh_token');
  assert.equal(JSON.parse(options.body).refresh_token, 'fixture-refresh');
  requests.push({ at: now }); newToken = jwt(2);
  return new Response(JSON.stringify({ access_token: newToken, refresh_token: 'fixture-refreshed', expires_in: 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const window = { document, location: { href: 'https://fixture.test/', origin: 'https://fixture.test', search: '', hash: '' }, addEventListener() {}, removeEventListener() {}, localStorage: storage };
const context = vm.createContext({ console, window, document, navigator: {}, location: window.location, localStorage: storage, Date: ClockDate,
  URL, URLSearchParams, Headers, Request, Response, AbortController, WebSocket, TextEncoder, TextDecoder, Buffer, atob, btoa, crypto: globalThis.crypto,
  fetch: fakeFetch, BroadcastChannel: undefined,
  setTimeout: (callback, delay, ...args) => schedule(callback, delay, false, args), clearTimeout: timer => timers.delete(timer),
  setInterval: (callback, delay, ...args) => schedule(callback, delay, true, args), clearInterval: timer => timers.delete(timer),
});
vm.runInContext(source, context, { timeout: 15000 });
const sdk = context.supabase || window.supabase;
assert.equal(typeof sdk?.createClient, 'function');
const client = sdk.createClient('https://auth.test', 'fixture-public-key', { global: { fetch: fakeFetch }, auth: { storage, storageKey: 'ulp:auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
const subscription = client.auth.onAuthStateChange((event, session) => { events.push({ event, uid: session?.user.id }); });
try {
  await client.auth.initialize(); await flush();
  assert.equal(requests.length, 0, 'Session must not refresh before the clock advances');
  await advance(240000);
  assert.equal(requests.length, 1, 'SDK scheduler must perform one refresh');
  assert.ok(requests[0].at > initialTime, 'Refresh must be driven by the simulated clock');
  assert.equal(events.filter(item => item.event === 'TOKEN_REFRESHED').length, 1);
  const result = await client.auth.getSession();
  assert.equal(result.data.session.user.id, owner);
  assert.equal(result.data.session.access_token, newToken);
  assert.notEqual(newToken, oldToken);
  assert.equal(JSON.parse(values.get('ulp:auth')).access_token, newToken);
  console.log(JSON.stringify({ sriMatched: true, simulatedSeconds: 240, refreshRequests: requests.length, tokenRefreshedEvents: 1, sameOwner: true, newTokenPersisted: true, liveAccountUsed: false }));
} finally { subscription.data.subscription.unsubscribe(); await client.auth.stopAutoRefresh(); }
