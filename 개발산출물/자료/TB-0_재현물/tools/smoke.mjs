// CSP 시나리오 1회: 정책·엔진으로 fixture를 열어 렌더·플레이어 준비·출력 RMS·CSP 위반·요청 로그를 evidence/csp/에 남긴다.
// node tools/smoke.mjs <policy> [--engine svg|html5] [--styleHash sha256-..,..] [--file A.gp] [--tag name]
import fs from 'node:fs';
import { chromium } from '../../../../node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const policy = args[0] || 'candidate';
const engine = opt('engine', 'svg');
const hash = opt('styleHash', '');
const file = opt('file', 'A.gp');
const tag = opt('tag', `${policy}-${engine}${hash ? '-hash' : ''}-${file}`);
const base = process.env.TB_BASE || 'http://127.0.0.1:5179';
const channel = process.env.TB_CHANNEL || 'msedge';
const evDir = new URL('../evidence/csp/', import.meta.url);
fs.mkdirSync(evDir, { recursive: true });

const browser = await chromium.launch({ channel, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLog = [];
page.on('console', (m) => consoleLog.push(`${m.type()}: ${m.text().slice(0, 300)}`));
const responses = [];
page.on('response', (r) => responses.push({ url: r.url().replace(base, ''), status: r.status() }));
page.on('requestfailed', (r) => responses.push({ url: r.url().replace(base, ''), failed: r.failure()?.errorText }));
const waitFor = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};
await page.goto(`${base}/?policy=${policy}&engine=${engine}${hash ? `&styleHash=${encodeURIComponent(hash)}` : ''}`);
const bootOk = await waitFor(() => window.tbReady, 15000);
let result = { tag, policy, engine, hash, file, channel, bootOk };
if (bootOk) {
  await page.click('#tap');
  await page.evaluate((f) => tb.open(f), file);
  const readyOk = await waitFor(() => !!(tb.state.cur?.ready.render && (tb.state.cur?.ready.player || tb.state.cur?.ready.error)), 20000);
  await page.evaluate(() => tb.play());
  const peak = await page.evaluate(() => tb.peakRms(3000));
  const snap = await page.evaluate(() => {
    const groups = {};
    for (const v of tb.violations) { const k = `${v.directive} | ${v.blocked} | ${v.source}`; groups[k] = (groups[k] || 0) + 1; }
    const surf = document.querySelector('.at-surface');
    return {
      ready: tb.state.cur?.ready, pos: tb.state.cur?.pos, violations: groups, errors: tb.errors,
      fonts: [...document.fonts].map((f) => `${f.family}:${f.status}`),
      styleTexts: tb.styleTexts(),
      svgText: document.querySelectorAll('.at-surface svg text').length,
      canvases: document.querySelectorAll('.at-surface canvas').length,
      surfaceChildren: surf ? surf.children.length : 0,
      workers: [...tb.res.workers.values()].map((w) => w.url),
      counters: tb.counters(),
      crossOriginIsolated,
    };
  });
  result = { ...result, readyOk, peakRms: peak, ...snap };
  await page.screenshot({ path: decodeURIComponent(new URL(`${tag}.png`, evDir).pathname).slice(1) });
}
result.console = consoleLog.filter((l) => !/^log:|^debug:/.test(l)).slice(0, 40);
result.responses = responses;
fs.writeFileSync(new URL(`${tag}.json`, evDir), JSON.stringify(result, null, 1));
const { styleTexts, console: _c, responses: _r, ...brief } = result;
console.log(JSON.stringify(brief));
await browser.close();
