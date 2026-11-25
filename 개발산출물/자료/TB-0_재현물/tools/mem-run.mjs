// TB-0 §5 메모리·자원 해제 측정 (Windows 데스크톱 보조 결과용)
// node tools/mem-run.mjs --run 1 [--policy candidate --engine html5 --styleHash h1,h2]
// 1차 지표: 탭 렌더러 프로세스 private bytes (Worker·AudioWorklet 스레드 포함). 보조: 브라우저 전체 합계, CDP JSHeapUsedSize·Nodes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '../../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const run = opt('run', '1');
const policy = opt('policy', 'candidate');
const engine = opt('engine', 'html5');
const hash = opt('styleHash', '');
const settleMs = Number(opt('settle', '30000'));
const channel = process.env.TB_CHANNEL || 'msedge';
const base = process.env.TB_BASE || 'http://127.0.0.1:5179';
const evDir = new URL('../evidence/mem/', import.meta.url);
fs.mkdirSync(evDir, { recursive: true });
const tag = `run${run}-${channel}-${engine}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = 1_000_000;

// ---- 프로세스 샘플러 ----
const profile = fs.mkdtempSync(path.join(os.tmpdir(), `tb0-mem-${run}-`));
const marker = path.basename(profile);
const ps = `
$ErrorActionPreference='SilentlyContinue'
while ($true) {
  $ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $procs = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' }
  $tot=0; $ren=0; $gpu=0; $util=0; $n=0; $rn=0
  foreach ($p in $procs) {
    $b = [int64]$p.PrivatePageCount; $tot += $b; $n++
    if ($p.CommandLine -like '*--type=renderer*' -and $p.CommandLine -notlike '*--extension-process*') { $ren += $b; $rn++ }
    elseif ($p.CommandLine -like '*--type=gpu-process*') { $gpu += $b }
    elseif ($p.CommandLine -like '*--type=utility*') { $util += $b }
  }
  Write-Output "$ts,$tot,$ren,$gpu,$util,$n,$rn"
  Start-Sleep -Milliseconds 400
}`;
const samples = [];
const sampler = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: ['ignore', 'pipe', 'ignore'] });
let buf = '';
sampler.stdout.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split(/\r?\n/);
  buf = lines.pop();
  for (const l of lines) {
    const [ts, tot, ren, gpu, util, n, rn] = l.split(',').map(Number);
    if (ts) samples.push({ ts, tot, ren, gpu, util, n, rn });
  }
});

const ctx = await chromium.launchPersistentContext(profile, { channel, args: ['--mute-audio'], viewport: { width: 1280, height: 800 } });
const page = ctx.pages()[0] || (await ctx.newPage());
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const ev = (fn, a) => page.evaluate(fn, a);
const waitFor = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await page.evaluate(fn).catch(() => false)) return true; await sleep(100); }
  return false;
};
const cdpMetrics = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { jsHeapUsed: m.JSHeapUsedSize, nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents };
};
const nearest = (ts) => samples.reduce((a, s) => (Math.abs(s.ts - ts) < Math.abs(a.ts - ts) ? s : a), samples[0]);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const events = [];
const mark = (e, extra = {}) => events.push({ ts: Date.now(), e, ...extra });

// 정리 후 30초 대기 → 5초 간격 3점
async function settleSample(label) {
  await sleep(settleMs);
  const pts = [];
  for (let k = 0; k < 3; k++) {
    if (k) await sleep(5000);
    await sleep(600); // 샘플러 주기 여유
    const s = nearest(Date.now() - 300);
    pts.push({ ...s, ...(await cdpMetrics()) });
  }
  mark('settle', { label });
  return { label, ren: median(pts.map((p) => p.ren)), tot: median(pts.map((p) => p.tot)), jsHeap: median(pts.map((p) => p.jsHeapUsed)), nodes: median(pts.map((p) => p.nodes)), points: pts };
}
async function songCycle(file) {
  const t0 = Date.now();
  mark('open', { file });
  await ev((f) => tb.open(f), file);
  const ok = await waitFor(() => !!(tb.state.cur?.ready.render && tb.state.cur?.ready.player), 30000);
  const readyMs = Date.now() - t0;
  await ev(() => tb.play());
  const rms = await ev(() => tb.peakRms(5000));
  await ev(() => tb.pause());
  await ev(async () => { const h = document.getElementById('host'); for (const y of [0.5, 1, 0]) { h.scrollTop = h.scrollHeight * y; await new Promise((r) => setTimeout(r, 600)); } });
  const t1 = Date.now();
  await sleep(500);
  const win = samples.filter((s) => s.ts >= t0 && s.ts <= t1 + 400);
  const peak = win.length ? Math.max(...win.map((s) => s.ren)) : null;
  const peakTot = win.length ? Math.max(...win.map((s) => s.tot)) : null;
  mark('played', { file, ok, readyMs, rms });
  return { file, ok, timeout: !ok, readyMs, rms, peak, peakTot, samplesInWindow: win.length };
}
async function closeAndCheck() {
  const c = await ev(() => tb.close());
  mark('closed', { counters: c });
  return c;
}

await page.goto(`${base}/?policy=${policy}&engine=${engine}${hash ? `&styleHash=${encodeURIComponent(hash)}` : ''}`);
await waitFor(() => window.tbReady, 15000);
const ua = await ev(() => navigator.userAgent);
await page.click('#tap');
while (samples.length < 3) await sleep(200);

// 1) 워밍업 A → 정리 → B0
const warm = await songCycle('A.gp');
const warmCounters = await closeAndCheck();
const B0 = await settleSample('B0');
// 2) A 최초 로드 + 10회 전환
const order = ['A.gp', 'B.mxl', 'A.gp', 'B.mxl', 'A.gp', 'B.mxl', 'A.gp', 'B.mxl', 'A.gp', 'B.mxl', 'A.gp'];
const cycles = [];
const R = [];
for (let i = 0; i < order.length; i++) {
  if (i > 0) {
    const counters = await closeAndCheck();
    const r = await settleSample(`R${i}`);
    R.push({ ...r, counters });
  }
  cycles.push(await songCycle(order[i]));
}
const endCounters = await closeAndCheck();
const Rend = { ...(await settleSample('R_end')), counters: endCounters };

// 3) 판정 (명세 §5 합격선) — 1차 지표 ren(탭 렌더러 private bytes)
const peakMax = Math.max(...cycles.map((c) => c.peak));
const residualLimit = Math.max(10 * MB, B0.ren * 0.1);
const residuals = [...R, Rend].map((r) => ({ label: r.label, deltaMB: (r.ren - B0.ren) / MB }));
const drift = (median(R.slice(7, 10).map((r) => r.ren)) - median(R.slice(0, 3).map((r) => r.ren))) / MB;
const zeroKeys = ['liveWorkers', 'openContexts', 'contextsCloseCalledNotResolved', 'workletNodesOnOpenContext', 'outstandingBlobUrls', 'playerDom', 'surfaces', 'activeSubs', 'pendingFetch'];
const leftovers = [warmCounters, ...R.map((r) => r.counters), endCounters].filter((c) => zeroKeys.some((k) => c[k] !== 0));
const verdict = {
  peakDeltaMB: (peakMax - B0.ren) / MB, peakPass: peakMax - B0.ren <= 150 * MB,
  residualLimitMB: residualLimit / MB, residuals, residualPass: residuals.every((r) => r.deltaMB * MB <= residualLimit),
  driftMB: drift, driftPass: drift <= 5,
  counterLeftovers: leftovers.length, countersPass: leftovers.length === 0,
  timeouts: cycles.filter((c) => c.timeout).length,
  silentCycles: cycles.filter((c) => !(c.rms > 0.01)).length,
};
verdict.pass = verdict.peakPass && verdict.residualPass && verdict.driftPass && verdict.countersPass && verdict.timeouts === 0 && verdict.silentCycles === 0;

const out = {
  tag, run, policy, engine, hash, channel, ua, settleMs, startedAt: new Date(samples[0].ts).toISOString(),
  host: { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0].model, ramBytes: os.totalmem() },
  metric: 'ren = 탭 렌더러 프로세스 PrivatePageCount 합(bytes), tot = 해당 브라우저 인스턴스 전체 합',
  B0: { ren: B0.ren, tot: B0.tot, jsHeap: B0.jsHeap, nodes: B0.nodes },
  warm, cycles,
  R: R.map((r) => ({ label: r.label, ren: r.ren, tot: r.tot, jsHeap: r.jsHeap, nodes: r.nodes, counters: r.counters })),
  Rend: { ren: Rend.ren, tot: Rend.tot, jsHeap: Rend.jsHeap, nodes: Rend.nodes, counters: Rend.counters },
  verdict, events,
};
fs.writeFileSync(new URL(`${tag}.json`, evDir), JSON.stringify(out, null, 1));
fs.writeFileSync(new URL(`${tag}-samples.csv`, evDir), 'ts,tot,ren,gpu,util,n,rn\n' + samples.map((s) => `${s.ts},${s.tot},${s.ren},${s.gpu},${s.util},${s.n},${s.rn}`).join('\n'));
console.log(JSON.stringify({ tag, B0: out.B0, peaks: cycles.map((c) => Math.round(c.peak / MB)), R: out.R.map((r) => Math.round(r.ren / MB)), Rend: Math.round(Rend.ren / MB), verdict }));
await ctx.close();
sampler.kill();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
