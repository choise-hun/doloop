// TB-0 격리 재현물 — 곡 세대(gen)별 AlphaTab 인스턴스와 자원 카운터
// 계측은 ID·상태·수치만 보관한다(진단용 강한 참조가 누수를 만들지 않도록 WeakRef 사용).

const violations = [];
document.addEventListener('securitypolicyviolation', (e) => {
  violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI, disposition: e.disposition, sample: (e.sample || '').slice(0, 60), source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : '' });
});
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandled: ${e.reason?.message || e.reason}`));

// ---- 자원 카운터 ----
let seq = 0;
let currentGen = 0;
const res = {
  workers: new Map(),     // id → {gen, url, alive}
  contexts: new Map(),    // id → {gen, state, ref}
  worklets: new Map(),    // id → {gen, ctxId}
  blobs: new Map(),       // url → gen (재현물+라이브러리 생성 전체)
  styleTexts: [],         // 라이브러리가 주입한 <style> 원문(CSP 해시 계산용)
};

const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url, opts) {
    super(url, opts);
    const id = ++seq;
    const rec = { gen: currentGen, url: String(url).slice(0, 80), alive: true };
    res.workers.set(id, rec);
    const term = this.terminate.bind(this);
    this.terminate = () => { rec.alive = false; term(); };
  }
};
const NativeAC = window.AudioContext;
window.AudioContext = class extends NativeAC {
  constructor(...a) {
    super(...a);
    const id = ++seq;
    const rec = { gen: currentGen, state: this.state, closeCalled: false, closeResolved: false };
    res.contexts.set(id, rec);
    this.__tbId = id;
    this.addEventListener('statechange', () => { rec.state = this.state; });
    const close = this.close.bind(this);
    this.close = () => { rec.closeCalled = true; return close().then((v) => { rec.closeResolved = true; rec.state = this.state; return v; }); };
  }
};
const NativeAWN = window.AudioWorkletNode;
window.AudioWorkletNode = class extends NativeAWN {
  constructor(ctx, name, opts) {
    super(ctx, name, opts);
    res.worklets.set(++seq, { gen: currentGen, ctxId: ctx.__tbId, name });
    // 출력 탭: destination 연결 시 analyser를 병렬로 붙여 실제 샘플 출력(RMS)을 관찰
    const connect = this.connect.bind(this);
    this.connect = (dest, ...rest) => {
      if (dest === ctx.destination && state.cur && state.cur.gen === currentGen) {
        const an = ctx.createAnalyser();
        an.fftSize = 2048;
        connect(an);
        state.cur.analyser = an;
      }
      return connect(dest, ...rest);
    };
  }
};
const nativeCreate = URL.createObjectURL.bind(URL);
const nativeRevoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (o) => { const u = nativeCreate(o); res.blobs.set(u, currentGen); return u; };
URL.revokeObjectURL = (u) => { res.blobs.delete(u); nativeRevoke(u); };
new MutationObserver((ms) => {
  for (const m of ms) for (const n of m.addedNodes) if (n.nodeName === 'STYLE') res.styleTexts.push({ id: n.id, text: n.innerHTML });
}).observe(document.head, { childList: true });

const alphaTab = await import('/at/alphaTab.mjs');

// ---- 곡 세대 상태 ----
const host = document.getElementById('host');
const statusEl = document.getElementById('status');
const state = { cur: null, discardedLate: 0, timeline: [] };
const mark = (ev, extra = {}) => state.timeline.push({ t: Math.round(performance.now()), gen: state.cur?.gen ?? currentGen, ev, ...extra });

function buildSettings(el) {
  return {
    core: { fontDirectory: '/at/font/', enableLazyLoading: true, logLevel: 'warning', engine: new URLSearchParams(location.search).get('engine') || 'svg', useWorkers: new URLSearchParams(location.search).get('useWorkers') !== '0' },
    player: { playerMode: new URLSearchParams(location.search).get('player') === '0' ? 'Disabled' : 'EnabledSynthesizer', outputMode: 'WebAudioAudioWorklets', soundFont: '/at/soundfont/sonivox.sf2', scrollElement: host },
  };
}

async function open(file, { delay = 0 } = {}) {
  await close();
  const gen = ++currentGen;
  const el = document.createElement('div');
  el.className = 'tb-player';
  el.dataset.gen = String(gen);
  host.appendChild(el);
  const cur = { gen, file, el, api: null, abort: new AbortController(), subs: [], pendingFetch: 1, ready: {}, analyser: null };
  state.cur = cur;
  mark('open', { file });
  let bytes;
  try {
    const r = await fetch(`/fixtures/${file}${delay ? `?delay=${delay}` : ''}`, { signal: cur.abort.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    cur.pendingFetch = 0;
    if (state.cur !== cur) { state.discardedLate++; mark('late-discard', { file, reason: e.name }); return { discarded: true }; }
    mark('fetch-error', { message: e.message });
    return { error: e.message };
  }
  cur.pendingFetch = 0;
  if (state.cur !== cur) { state.discardedLate++; mark('late-discard', { file }); return { discarded: true }; }
  const api = new alphaTab.AlphaTabApi(el, buildSettings(el));
  cur.api = api;
  const on = (emitter, name, fn) => cur.subs.push(emitter.on((a) => { if (state.cur === cur) fn(a); }));
  on(api.scoreLoaded, 'scoreLoaded', (s) => { cur.ready.score = { bars: s.masterBars.length, tracks: s.tracks.map((t) => t.name) }; mark('scoreLoaded'); });
  on(api.renderFinished, 'renderFinished', () => { cur.ready.render = true; mark('renderFinished'); });
  on(api.soundFontLoaded, 'soundFontLoaded', () => { cur.ready.soundFont = true; mark('soundFontLoaded'); });
  on(api.playerReady, 'playerReady', () => { cur.ready.player = true; mark('playerReady'); });
  on(api.error, 'error', (e) => { cur.ready.error = String(e?.message || e); mark('error', { message: cur.ready.error }); });
  on(api.playerStateChanged, 'state', (e) => mark('playerState', { state: e.state }));
  on(api.playerPositionChanged, 'pos', (e) => { cur.pos = { time: Math.round(e.currentTime), tick: e.currentTick }; });
  const ok = api.load(bytes);
  mark('load', { ok });
  return { gen, ok };
}

async function close() {
  const cur = state.cur;
  if (!cur) return null;
  state.cur = null;
  cur.abort.abort();
  for (const off of cur.subs) try { off(); } catch {}
  const subsLeft = 0;
  cur.subs.length = 0;
  const ctxIds = [...res.contexts.entries()].filter(([, c]) => c.gen === cur.gen).map(([id]) => id);
  if (cur.api) { cur.api.destroy(); cur.api = null; }
  cur.analyser = null;
  cur.el.remove();
  // 라이브러리 소유 컨텍스트의 close() 완료를 기다린다(재차 닫지 않는다)
  const t0 = performance.now();
  while (ctxIds.some((id) => !res.contexts.get(id).closeResolved) && performance.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 20));
  mark('closed', { file: cur.file, subsLeft });
  return counters(cur.gen);
}

function counters(gen) {
  const byGen = (m, pred) => [...m.values()].filter((v) => (gen === undefined || v.gen <= gen) && pred(v)).length;
  return {
    gen,
    liveWorkers: byGen(res.workers, (w) => w.alive),
    openContexts: byGen(res.contexts, (c) => c.state !== 'closed'),
    contextsCloseCalledNotResolved: byGen(res.contexts, (c) => c.closeCalled && !c.closeResolved),
    workletNodesOnOpenContext: [...res.worklets.values()].filter((w) => (gen === undefined || w.gen <= gen) && res.contexts.get(w.ctxId)?.state !== 'closed').length,
    outstandingBlobUrls: [...res.blobs.values()].filter((g) => gen === undefined || g <= gen).length,
    playerDom: host.querySelectorAll('.tb-player').length,
    surfaces: document.querySelectorAll('.at-surface').length,
    activeSubs: state.cur ? state.cur.subs.length : 0,
    pendingFetch: state.cur ? state.cur.pendingFetch : 0,
    totals: { workers: res.workers.size, contexts: res.contexts.size, worklets: res.worklets.size },
  };
}

function rms() {
  const an = state.cur?.analyser;
  if (!an) return null;
  const buf = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(buf);
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}
// 일정 시간 동안 RMS 최대값(무음 판정용)
async function peakRms(ms) {
  let max = 0;
  const end = performance.now() + ms;
  while (performance.now() < end) { max = Math.max(max, rms() ?? 0); await new Promise((r) => setTimeout(r, 25)); }
  return Number(max.toFixed(5));
}

function tracks() { return state.cur?.api?.score?.tracks ?? []; }
const T = (name) => tracks().filter((t) => t.name === name);

window.tb = {
  open, close, counters, rms, peakRms, violations, errors, state, res, alphaTab,
  get api() { return state.cur?.api; },
  play: () => state.cur?.api?.play(),
  pause: () => state.cur?.api?.pause(),
  solo: (n, v) => state.cur.api.changeTrackSolo(T(n), v),
  mute: (n, v) => state.cur.api.changeTrackMute(T(n), v),
  volume: (n, v) => state.cur.api.changeTrackVolume(T(n), v),
  showOnly: (n) => state.cur.api.renderTracks(T(n)),
  showAll: () => state.cur.api.renderTracks(tracks()),
  fonts: () => [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
  styleTexts: () => res.styleTexts,
};
document.getElementById('tap').addEventListener('click', () => { statusEl.textContent = 'tapped'; mark('tap'); });
statusEl.textContent = 'ready';
window.tbReady = true;
