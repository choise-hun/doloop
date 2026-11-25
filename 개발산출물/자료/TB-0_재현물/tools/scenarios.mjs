// CSP-03 + PLAY-01~04 시나리오. evidence/play/<tag>.json 저장.
// node tools/scenarios.mjs --policy candidate --engine html5 --styleHash <h1,h2>
import fs from 'node:fs';
import { chromium } from '../../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const policy = opt('policy', 'candidate');
const engine = opt('engine', 'html5');
const hash = opt('styleHash', '');
const channel = process.env.TB_CHANNEL || 'msedge';
const base = process.env.TB_BASE || 'http://127.0.0.1:5179';
const other = base.replace(/:(\d+)$/, (_, p) => `:${Number(p) + 1}`);
const tag = opt('tag', `${policy}-${engine}${hash ? '-hash' : ''}-${channel}`);
const evDir = new URL('../evidence/play/', import.meta.url);
fs.mkdirSync(evDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLog = [];
page.on('console', (m) => { if (!['log', 'debug'].includes(m.type())) consoleLog.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
const ev = (fn, a) => page.evaluate(fn, a);
const waitFor = async (fn, ms, a) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await page.evaluate(fn, a).catch(() => false)) return true; await sleep(100); }
  return false;
};
const out = { tag, policy, engine, hash, channel, ua: '', startedAt: new Date().toISOString() };
await page.goto(`${base}/?policy=${policy}&engine=${engine}${hash ? `&styleHash=${encodeURIComponent(hash)}` : ''}`);
await waitFor(() => window.tbReady, 15000);
out.ua = await ev(() => navigator.userAgent);
await page.click('#tap');

// ---------- CSP-03: 허용되지 않은 출처·Blob Worker·타 출처 폰트 차단 ----------
out.csp03 = await ev(async (otherOrigin) => {
  const before = tb.violations.length;
  const r = {};
  const tryWorker = (make) => new Promise((resolve) => {
    try {
      const w = make();
      const t = setTimeout(() => { w.terminate(); resolve('no-message(blocked?)'); }, 1500);
      w.onmessage = () => { clearTimeout(t); w.terminate(); resolve('ALIVE'); };
      w.onerror = () => { clearTimeout(t); w.terminate(); resolve('error-event'); };
    } catch (e) { resolve(`throw:${e.name}`); }
  });
  r.crossOriginWorker = await tryWorker(() => new Worker(`${otherOrigin}/x-worker.js`));
  const blobUrl = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
  r.blobWorker = await tryWorker(() => new Worker(blobUrl));
  URL.revokeObjectURL(blobUrl);
  try { await new FontFace('xfont', `url(${otherOrigin}/x-font.woff2)`).load(); r.crossOriginFont = 'LOADED'; } catch (e) { r.crossOriginFont = `fail:${e.name}`; }
  await new Promise((res) => setTimeout(res, 300));
  r.violations = tb.violations.slice(before).map((v) => `${v.directive} ${v.blocked} ${v.disposition}`);
  return r;
}, other);

// ---------- 공통: 곡 열기·준비 대기·재생 ----------
async function openReady(file) {
  const t0 = Date.now();
  await ev((f) => tb.open(f), file);
  const ok = await waitFor(() => !!(tb.state.cur?.ready.render && (tb.state.cur?.ready.player || tb.state.cur?.ready.error)), 30000);
  return { ok, ms: Date.now() - t0, ready: await ev(() => tb.state.cur?.ready) };
}
async function playFor(ms) {
  await ev(() => tb.play());
  const p0 = await ev(() => tb.state.cur?.pos?.time ?? 0);
  const peak = await ev((m) => tb.peakRms(m), ms);
  const p1 = await ev(() => tb.state.cur?.pos?.time ?? 0);
  return { peakRms: peak, cursorFrom: p0, cursorTo: p1 };
}
const cursorEl = () => ev(() => { const c = document.querySelector('.at-cursor-beat'); return c ? c.getBoundingClientRect().x : null; });

// ---------- PLAY-01: 포맷별 열기·5초 재생 ----------
out.play01 = {};
for (const f of ['A.gp', 'B.xml', 'B.mxl', 'gp3', 'gp4', 'gp5', 'gpx']) {
  if (!f.includes('.')) { out.play01[f] = { status: 'HOLD', reason: '권리 확인된 해당 형식 fixture 없음(자체 제작 수단 없음)' }; continue; }
  const r = await openReady(f);
  const cx0 = await cursorEl();
  const p = await playFor(5200);
  const cx1 = await cursorEl();
  await ev(() => tb.pause());
  out.play01[f] = { ...r, ...p, cursorX: [cx0, cx1], canvases: await ev(() => document.querySelectorAll('.at-surface canvas, .at-surface svg').length) };
  await page.screenshot({ path: decodeURIComponent(new URL(`${tag}-play01-${f}.png`, evDir).pathname).slice(1) });
  await ev(() => tb.close());
}

// ---------- PLAY-02: B 지연 렌더링·스크롤·마디 클릭 탐색·재생/일시정지/재개 ----------
{
  const r = await openReady('B.mxl');
  const scrollInfo = await ev(async () => {
    const el = document.getElementById('host');
    const total = el.scrollHeight;
    const filled = () => [...document.querySelectorAll('.at-surface > div')].filter((d) => d.children.length > 0).length;
    const placeholders = document.querySelectorAll('.at-surface > div').length;
    const before = filled();
    el.scrollTop = total / 2; await new Promise((r) => setTimeout(r, 800));
    const mid = filled();
    el.scrollTop = total; await new Promise((r) => setTimeout(r, 1500));
    const end = filled();
    const last = [...document.querySelectorAll('.at-surface > div')].at(-1);
    return { scrollHeight: total, placeholders, filledBefore: before, filledMid: mid, filledEnd: end, lastPlaceholderFilled: !!last && last.children.length > 0 };
  });
  await page.screenshot({ path: decodeURIComponent(new URL(`${tag}-play02-end.png`, evDir).pathname).slice(1) });
  // 마디 100(인덱스 99) 클릭
  const click = await ev(async () => {
    const api = tb.api, el = document.getElementById('host');
    const b = api.renderer.boundsLookup.findMasterBarByIndex(99);
    if (!b) return { found: false };
    el.scrollTop = Math.max(0, b.visualBounds.y - 100);
    await new Promise((r) => setTimeout(r, 1000));
    const surf = document.querySelector('.at-surface').getBoundingClientRect();
    const bb = api.renderer.boundsLookup.findMasterBarByIndex(99).visualBounds;
    return { found: true, x: surf.x + bb.x + bb.w * 0.3, y: surf.y + bb.y + bb.h * 0.5, expectStart: api.score.masterBars[99].start, nextStart: api.score.masterBars[100].start };
  });
  if (click.found) { await page.mouse.click(click.x, click.y); await sleep(500); }
  const tickAfterClick = await ev(() => tb.api.tickPosition);
  const p1 = await playFor(3000);
  await ev(() => tb.pause()); await sleep(1000);
  const paused = await ev(() => tb.state.cur.pos?.time);
  await sleep(1000);
  const pausedStill = await ev(() => tb.state.cur.pos?.time);
  const p2 = await playFor(2500);
  await ev(() => tb.pause());
  out.play02 = { ...r, scrollInfo, click, tickAfterClick, clickInBar100: click.found && tickAfterClick >= click.expectStart && tickAfterClick < click.nextStart, playAfterClick: p1, pauseHeld: paused === pausedStill, resume: p2, layout: 'canvas(html5)', audioOutput: 'WebAudioAudioWorklets' };
  await page.screenshot({ path: decodeURIComponent(new URL(`${tag}-play02-bar100.png`, evDir).pathname).slice(1) });
  await ev(() => tb.close());
}

// ---------- PLAY-03: 트랙 솔로·뮤트·볼륨·표시 전환, 메트로놈 ----------
out.play03 = {};
for (const f of ['A.gp', 'B.mxl']) {
  await openReady(f);
  await ev(() => tb.play());
  await sleep(500);
  const step = async (label, fn) => { if (fn) await ev(fn); await sleep(300); return [label, await ev(() => tb.peakRms(1500))]; };
  const seq = [];
  seq.push(await step('all'));
  seq.push(await step('solo Guitar', () => tb.solo('Guitar', true)));
  seq.push(await step('unsolo Guitar', () => tb.solo('Guitar', false)));
  seq.push(await step('mute Bass', () => tb.mute('Bass', true)));
  seq.push(await step('unmute Bass', () => tb.mute('Bass', false)));
  seq.push(await step('Drums vol 0', () => tb.volume('Drums', 0)));
  seq.push(await step('Drums vol 1', () => tb.volume('Drums', 1)));
  // 분리 검증: 각 트랙 단독(솔로) 출력 > 0, 전부 뮤트 → 무음, 전부 뮤트 + 메트로놈 → 메트로놈만
  seq.push(await step('solo Bass only', () => tb.solo('Bass', true)));
  seq.push(await step('solo Drums only', () => { tb.solo('Bass', false); tb.solo('Drums', true); }));
  seq.push(await step('mute all', () => { tb.solo('Drums', false); tb.mute('Guitar', true); tb.mute('Bass', true); tb.mute('Drums', true); }));
  seq.push(await step('mute all + metronome', () => { tb.api.metronomeVolume = 1; }));
  seq.push(await step('restore', () => { tb.api.metronomeVolume = 0; tb.mute('Guitar', false); tb.mute('Bass', false); tb.mute('Drums', false); }));
  const show = await ev(async () => {
    const names = () => tb.api.tracks.map((t) => t.name);
    tb.showOnly('Bass'); await new Promise((r) => setTimeout(r, 1500));
    const a = names();
    tb.showAll(); await new Promise((r) => setTimeout(r, 1500));
    return { afterShowOnlyBass: a, afterShowAll: names() };
  });
  seq.push(await step('after display toggle (mixer unchanged)'));
  await ev(() => tb.pause());
  out.play03[f] = { rms: Object.fromEntries(seq), display: show };
  await ev(() => tb.close());
}

// ---------- PLAY-04: 지연 로딩 중 A→B→A→닫기 경합, 손상 입력 ----------
{
  const before = await ev(() => tb.state.discardedLate);
  await ev(() => { tb.open('A.gp', { delay: 3000 }); });
  await sleep(200);
  await ev(() => { tb.open('B.mxl', { delay: 2000 }); });
  await sleep(200);
  await ev(() => { tb.open('A.gp', { delay: 1000 }); });
  await sleep(100);
  await ev(() => tb.close());
  await sleep(4000); // 모든 지연 응답이 도착한 뒤
  const race = await ev(() => ({ cur: tb.state.cur ? tb.state.cur.file : null, playerDom: document.querySelectorAll('.tb-player').length, counters: tb.counters(), late: tb.state.discardedLate }));
  // 경합 2: A(지연) 열기 → 바로 B(즉시) — 최종 곡이 B인지
  await ev(() => { tb.open('A.gp', { delay: 2500 }); });
  await sleep(100);
  const rB = await openReady('B.mxl');
  await sleep(3000);
  const race2 = await ev(() => ({ cur: tb.state.cur?.file, bars: tb.state.cur?.ready.score?.bars, playerDom: document.querySelectorAll('.tb-player').length }));
  await ev(() => tb.close());
  // 경합 3(리뷰 지적): 재생 중인 곡(AudioContext 살아 있음)의 정리 대기 중에 open 두 번 → 마지막 open만 남아야 한다
  const rA = await openReady('A.gp');
  await ev(() => tb.play()); await sleep(500);
  await ev(() => { tb.open('A.gp'); tb.open('B.mxl'); });
  await sleep(5000);
  const race3 = await ev(() => ({ cur: tb.state.cur?.file, playerDom: document.querySelectorAll('.tb-player').length, openContexts: tb.counters().openContexts, liveWorkers: tb.counters().liveWorkers }));
  // 경합 4: 정리 대기 중 open 뒤 close → 아무 곡도 남지 않아야 한다
  await ev(() => tb.play()); await sleep(500);
  await ev(() => { tb.open('A.gp'); tb.close(); });
  await sleep(5000);
  const race4 = await ev(() => ({ cur: tb.state.cur ? tb.state.cur.file : null, counters: tb.counters() }));
  // 손상 입력
  await ev(() => tb.open('broken.gp'));
  await sleep(3000);
  const broken = await ev(() => ({ ready: tb.state.cur?.ready, errors: tb.errors.slice(-3) }));
  const brokenPlay = await ev(() => { try { return tb.play(); } catch (e) { return `throw:${e.message}`; } });
  const brokenRms = await ev(() => tb.peakRms(1500));
  await ev(() => tb.close());
  const recover = await openReady('A.gp');
  const recoverPlay = await playFor(2000);
  await ev(() => tb.close());
  out.play04 = { race: { ...race, discardedDelta: race.late - before }, race2: { ...race2, openB: rB.ok }, race3: { ...race3, firstOpenOk: rA.ok }, race4, broken: { ...broken, playReturn: brokenPlay, peakRms: brokenRms }, recover: { ok: recover.ok, ...recoverPlay } };
}
out.finalCounters = await ev(() => tb.counters());
out.violationsTotal = await ev(() => tb.violations.length);
out.violationsSample = await ev(() => tb.violations.slice(0, 10));
out.pageErrors = await ev(() => tb.errors);
out.console = consoleLog.slice(0, 60);
fs.writeFileSync(new URL(`${tag}.json`, evDir), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (k === 'console' ? undefined : v)));
await browser.close();
