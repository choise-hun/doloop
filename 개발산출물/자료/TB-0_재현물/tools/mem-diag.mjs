// 진단 반복(정규 시계열과 분리): 강제 GC 후 렌더러 메모리·DOM 요소 증가 원인 분리
// node tools/mem-diag.mjs --styleHash h1,h2 [--cycles 10]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from '../../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const hash = opt('styleHash', '');
const cycles = Number(opt('cycles', '10'));
const mode = opt('mode', 'recreate'); // recreate | reuse | noworkers | noplayer
const base = 'http://127.0.0.1:5179';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tb0-diag-'));
const marker = path.basename(profile);
const renBytes = () => Number(execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.CommandLine -like '*--type=renderer*' } | Measure-Object -Property PrivatePageCount -Sum).Sum"`).toString().trim());

const ctx = await chromium.launchPersistentContext(profile, { channel: 'msedge', args: ['--mute-audio'], viewport: { width: 1280, height: 800 } });
const page = ctx.pages()[0];
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const ev = (fn, a) => page.evaluate(fn, a);
await page.goto(`${base}/?policy=candidate&engine=html5${mode === 'noworkers' ? '&useWorkers=0' : ''}${mode === 'noplayer' ? '&player=0' : ''}&styleHash=${encodeURIComponent(hash)}`);
while (!(await ev(() => window.tbReady).catch(() => false))) await sleep(100);
await page.click('#tap');
const gc = async () => { for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await sleep(300); } };
const snap = async (label) => {
  await gc(); await sleep(3000); await gc();
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const dom = await ev(() => ({
    elements: document.querySelectorAll('*').length,
    head: [...document.head.children].map((e) => e.tagName + (e.id ? '#' + e.id : '')).join(','),
    bodyChildren: [...document.body.children].map((e) => e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).replace(/\s+/g, '.') : '')),
    timeline: tb.state.timeline.length,
  }));
  return { label, renMB: Math.round(renBytes() / 1e5) / 10, jsHeapMB: Math.round(m.JSHeapUsedSize / 1e4) / 100, nodes: m.Nodes, listeners: m.JSEventListeners, ...dom };
};
const rows = [await snap('start')];
const files = ['A.gp', 'B.mxl'];
for (let i = 0; i < cycles; i++) {
  if (mode === 'reuse' && i > 0) {
    await ev(async (f) => { const b = new Uint8Array(await (await fetch(`/fixtures/${f}`)).arrayBuffer()); tb.state.cur.ready = {}; tb.api.load(b); }, files[i % 2]);
  } else await ev((f) => tb.open(f), files[i % 2]);
  while (!(await ev(() => !!(tb.state.cur?.ready.render && (tb.state.cur?.ready.player || new URLSearchParams(location.search).get('player') === '0'))))) await sleep(100);
  await ev(() => tb.play()); await sleep(2000); await ev(() => tb.pause());
  if (mode !== 'reuse' || i === cycles - 1) await ev(() => tb.close());
  rows.push(await snap(`after close ${i + 1}`));
}
// 같은 페이지에서 alphaTab 없이 재현물 계측만 반복했을 때 비교: 빈 div 생성/제거
fs.mkdirSync(new URL('../evidence/mem/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`../evidence/mem/diag-forced-gc-${mode}.json`, import.meta.url), JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.label.padEnd(16), 'ren', r.renMB, 'heap', r.jsHeapMB, 'nodes', r.nodes, 'listeners', r.listeners, 'elements', r.elements, 'body', r.bodyChildren.join(' '));
console.log('head:', rows.at(-1).head);
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
