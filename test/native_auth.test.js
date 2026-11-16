'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

async function setup({ pending, native = true, session: initial = null, restoreGate = null, hostlessCustomUrl = false } = {}) {
  const storage = new Map(pending ? [['ulp:native-oauth', JSON.stringify(pending)]] : []);
  const events = new Map(), calls = [], notifications = [], requests = [];
  let sdkSession = initial, change = () => {}, exchangeGate = null, openGate = null;
  const sdk = {
    getSession: async () => { if (restoreGate) await restoreGate.promise; return { data: { session: sdkSession } }; },
    onAuthStateChange(fn) { change = fn; },
    async signInWithOAuth(params) {
      calls.push(['authorize', params]);
      return { data: { provider: 'google', url: 'https://auth.test/auth/v1/authorize?provider=google', flowId: 'flow-1' } };
    },
    async exchangeCodeForSession(code, options) {
      calls.push(['exchange', code, options]);
      if (exchangeGate) await exchangeGate.promise;
      sdkSession = { access_token: 'token-A', user: { id: 'A' } };
      storage.set('ulp:auth', 'session-A');
      change('SIGNED_IN', sdkSession); // Real SDK side effects precede resolution.
      return { data: { session: sdkSession, user: sdkSession.user } };
    },
    async signOut() { calls.push(['logout']); sdkSession = null; storage.delete('ulp:auth'); change('SIGNED_OUT', null); return {}; },
  };
  const RuntimeURL = hostlessCustomUrl ? class extends URL {
    constructor(value, base) {
      super(value, base);
      if (String(value).startsWith('ulevelp:')) Object.defineProperties(this, { hostname: { value: '' }, pathname: { value: '//auth/callback' } });
    }
  } : URL;
  const context = vm.createContext({ console, URL: RuntimeURL, Headers, queueMicrotask, setTimeout, clearTimeout, Date,
    window: { ULEVELP_CONFIG: { supabaseUrl: 'https://auth.test', supabaseAnonKey: 'public', apiBaseUrl: 'https://api.test' },
      supabase: { createClient: (_url, _key, options) => { calls.push(['config', options]); return { auth: sdk }; } } },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    fetch: async (url, opts) => { requests.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ id: sdkSession?.user.id, keys: {}, locale: 'ko' }) }; },
  });
  const register = async (event, fn) => { events.set(event, fn); return { remove: async () => events.delete(event) }; };
  const mocks = {
    react: {},
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
    '@capacitor/app': { App: { addListener: register, getLaunchUrl: async () => undefined } },
    '@capacitor/browser': { Browser: { addListener: register, open: async ({url}) => { calls.push(['open', url]); if(openGate) await openGate.promise; }, close: async () => {} } },
    './i18n.mts': { t: x => x, getLang: () => 'ko', syncLangFromProfile: () => {} },
  };
  const cache = {};
  function load(name) {
    if (mocks[name]) return mocks[name];
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} }; cache[name] = module;
    const code = ts.transpileModule(fs.readFileSync(`frontend/src/lib/${name.replace('./','')}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const fn = vm.runInContext(`(function(require,exports,module){${code}\n})`, context);
    fn(load, module.exports, module); return module.exports;
  }
  const auth = load('./auth').auth;
  auth.onChange(s => notifications.push(s.user?.id ?? null));
  await tick(); await tick();
  return { auth, storage, events, calls, notifications, requests, sdk,
    url: async url => { events.get('appUrlOpen')?.({ url }); await tick(); await tick(); },
    holdExchange() { return exchangeGate = defer(); },
    holdOpen() { return openGate = defer(); },
  };
}

test('N2 native PKCE uses the stored flow, rejects forged callbacks and exchanges duplicate notifications once', async () => {
  const h = await setup();
  const start = h.auth.signIn();
  await tick();
  assert.equal(h.calls.find(x=>x[0]==='config')[1].auth.detectSessionInUrl, false);
  assert.equal(h.calls.find(x=>x[0]==='authorize')[1].options.skipBrowserRedirect, true);
  assert.equal(h.calls.find(x=>x[0]==='authorize')[1].options.redirectTo, 'ulevelp://auth/callback');
  for(const url of ['https://auth/callback?code=bad','ulevelp://evil/callback?code=bad','ulevelp://auth/wrong?code=bad']) await h.url(url);
  assert.equal(h.calls.filter(x=>x[0]==='exchange').length, 0);
  const gate=h.holdExchange();
  await h.url('ulevelp://auth/callback?code=valid');
  await h.url('ulevelp://auth/callback?code=valid');
  assert.equal(h.auth.getUser(), null);
  assert.equal(h.calls.filter(x=>x[0]==='exchange').length, 1);
  assert.equal(h.calls.find(x=>x[0]==='exchange')[2].flowId, 'flow-1');
  gate.resolve(); await start; await tick();
  assert.equal(h.auth.getUser().id, 'A');
  assert.equal(h.storage.has('ulp:native-oauth'), false);
  assert.equal(h.requests[0].url, 'https://api.test/api/v1/me');
  await h.auth.signOut();
});

test('N3 logout quarantines SDK storage and SIGNED_IN until exchange and cleanup finish', async () => {
  const h = await setup(), gate = h.holdExchange();
  const start = h.auth.signIn().then(()=>null,e=>e);
  await tick(); await h.url('ulevelp://auth/callback?code=valid');
  const logout = h.auth.signOut();
  assert.equal(JSON.parse(h.storage.get('ulp:native-oauth')).cancelled, true);
  assert.equal(h.auth.getUser(), null);
  assert.equal(await h.auth.getAccessToken(), '');
  gate.resolve(); await logout; await start; await tick();
  assert.equal(h.notifications.includes('A'), false);
  assert.equal(h.storage.has('ulp:auth'), false);
  assert.equal(h.storage.has('ulp:native-oauth'), false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.calls.at(-1)[0], 'logout');
});

test('N3 cold cancelled marker cleans SDK before restored session can be published', async () => {
  const h = await setup({ pending: { version:1,flowId:'old',startedAt:Date.now(),cancelled:true }, session: {user:{id:'A'},access_token:'old'} });
  assert.equal(h.auth.getUser(),null);
  assert.equal(h.notifications.includes('A'), false);
  assert.equal(h.calls.filter(x=>x[0]==='logout').length,1);
  assert.equal(h.storage.has('ulp:native-oauth'),false);
  await h.auth.signOut();
});

for(const suffix of ['?code=a&code=b','?code=a#access_token=evil','?code=a&error=denied','?code=a&return=https://evil.test']) {
  test(`N2 malformed callback ${suffix} never reaches SDK`,async()=>{
    const h=await setup();const result=h.auth.signIn().then(()=>null,e=>e);await tick();
    await h.url('ulevelp://auth/callback'+suffix);
    assert.equal((await result).code,'NATIVE_AUTH_CALLBACK_INVALID');
    assert.equal(h.calls.filter(x=>x[0]==='exchange').length,0);
    assert.equal(h.storage.has('ulp:native-oauth'),false);
    await h.auth.signOut();
  });
}

test('N4 callback consumed before browserFinished cancellation turn wins once',async()=>{
  const h=await setup();const start=h.auth.signIn();await tick();
  h.events.get('browserFinished')();
  h.events.get('appUrlOpen')({url:'ulevelp://auth/callback?code=valid'});
  await start;assert.equal(h.auth.getUser().id,'A');await h.auth.signOut();
});

test('N4 closing alone cancels and allows a clean retry',async()=>{
  const h=await setup();const result=h.auth.signIn().then(()=>null,e=>e);await tick();
  h.events.get('browserFinished')();
  assert.equal((await result).code,'NATIVE_AUTH_CANCELLED');
  const second=h.auth.signIn();await tick();await h.url('ulevelp://auth/callback?code=retry');await second;
  assert.equal(h.auth.getUser().id,'A');await h.auth.signOut();
});

test('N1 web keeps URL-based OAuth and does not initialize native listeners', async()=>{
 const h=await setup({native:false});await h.auth.signIn('https://web.test/settings.html#account');
 assert.equal(h.events.size,0);
 const authorize=h.calls.find(x=>x[0]==='authorize')[1];
 assert.equal(authorize.options.redirectTo,'https://web.test/settings.html');
 assert.equal(authorize.options.skipBrowserRedirect,undefined);
 assert.equal(h.calls.find(x=>x[0]==='config')[1].auth.detectSessionInUrl,true);
});

test('N3 new login cannot start until old exchange and local logout settle',async()=>{
 const h=await setup(),gate=h.holdExchange();
 const first=h.auth.signIn().then(()=>null,e=>e);await tick();await h.url('ulevelp://auth/callback?code=old');
 const logout=h.auth.signOut();const second=h.auth.signIn().then(()=>null,e=>e);await tick();
 assert.equal(h.calls.filter(x=>x[0]==='authorize').length,1);
 gate.resolve();await logout;await first;await tick();
 assert.equal(h.calls.filter(x=>x[0]==='authorize').length,2);
 const order=h.calls.map(x=>x[0]);assert.ok(order.lastIndexOf('authorize')>order.indexOf('logout'));
 assert.equal(h.notifications.includes('A'),false);
 await h.auth.signOut();await second;
});

test('N2 cold pending code uses the persisted flow and expired pending never exchanges',async()=>{
 const h=await setup({pending:{version:1,flowId:'cold-flow',startedAt:Date.now()}});
 await h.url('ulevelp://auth/callback?code=cold');
 assert.equal(h.calls.find(x=>x[0]==='exchange')[2].flowId,'cold-flow');
 assert.equal(h.auth.getUser().id,'A');await h.auth.signOut();
 const old=await setup({pending:{version:1,flowId:'old-flow',startedAt:Date.now()-600001}});
 await old.url('ulevelp://auth/callback?code=expired');
 assert.equal(old.calls.filter(x=>x[0]==='exchange').length,0);
 assert.equal(old.storage.has('ulp:native-oauth'),false);await old.auth.signOut();
});


test('N3 logout during cold restore retains its tombstone until SDK cleanup completes',async()=>{
 const restoreGate=defer(),cleanGate=defer();
 const h=await setup({pending:{version:1,flowId:'cold',startedAt:Date.now()},session:{access_token:'token-A',user:{id:'A'}},restoreGate});
 const original=h.sdk.signOut;h.sdk.signOut=async()=>{await cleanGate.promise;return original()};
 const logout=h.auth.signOut();restoreGate.resolve();await tick();await tick();
 assert.equal(JSON.parse(h.storage.get('ulp:native-oauth')).cancelled,true);
 assert.equal(h.notifications.includes('A'),false);
 cleanGate.resolve();await logout;assert.equal(h.auth.getUser(),null);assert.equal(h.storage.has('ulp:native-oauth'),false);
});

test('N3 retry after failed native logout cleans SDK and can publish a fresh login',async()=>{
 const h=await setup({session:{access_token:'token-A',user:{id:'A'}}});
 const original=h.sdk.signOut;h.sdk.signOut=async()=>({error:new Error('offline')});
 await assert.rejects(()=>h.auth.signOut(),/offline/);
 assert.equal(h.auth.getUser(),null);assert.equal(JSON.parse(h.storage.get('ulp:native-oauth')).cancelled,true);
 h.sdk.signOut=original;
 const retry=h.auth.signIn();await tick();await tick();await h.url('ulevelp://auth/callback?code=fresh');await retry;
 assert.equal(h.auth.getUser().id,'A');assert.equal(await h.auth.getAccessToken(),'token-A');await h.auth.signOut();
});

test('N-URL: hostless custom-scheme URL parser still accepts only the exact callback authority', async () => {
  const h = await setup({ hostlessCustomUrl: true });
  const start = h.auth.signIn().then(() => null, error => error);
  try {
    await tick();
    await h.url('ulevelp://auth/callback?code=valid');
    assert.equal(h.calls.filter(call => call[0] === 'exchange').length, 1);
    assert.equal(h.auth.getUser()?.id, 'A');
    assert.equal(await start, null);
  } finally { await h.auth.signOut(); await start; }
});

for (const callback of ['ulevelp://auth:443/callback?code=x', 'ulevelp://evil@auth/callback?code=x', 'ulevelp:////auth/callback?code=x', 'https://auth/callback?code=x']) {
  test(`N-URL strict original authority: ${callback}`, async () => {
    const h = await setup({ hostlessCustomUrl: true });
    const start = h.auth.signIn().then(() => null, error => error);
    try {
      await tick(); await h.url(callback);
      assert.equal(h.calls.filter(call => call[0] === 'exchange').length, 0);
      assert.equal(h.auth.getUser(), null);
    } finally { await h.auth.signOut(); await start; }
  });
}
