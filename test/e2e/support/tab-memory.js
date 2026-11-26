'use strict';
// Windows Edge: run the local product server, then node test/e2e/support/tab-memory.js <run>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { setupTabPage, testSongs, observeTabResources, readTabResources, readTabRms } = require('./tab-fixtures');

const run = process.argv[2];
if (!/^\d+$/.test(run)) throw new Error('Supply the run number');
const origin = process.env.TB2_ORIGIN || 'http://127.0.0.1:3000';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'doloop-tb2-'));
const marker = path.basename(profile);
const output = path.resolve('test-results/tb2-memory', 'run-' + run + '.json');
const MB = 1_000_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (points) => [...points].sort((a, b) => a - b)[Math.floor(points.length / 2)];
const samples = [];
const source = fs.readFileSync('dist/index.html');
const bundle = source.toString().match(/src="(\/assets\/[^"]+\.js)"/)[1];
const evidence = {
  run, platform: os.platform(), os: os.release(), cpu: os.cpus()[0].model,
  buildBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  bundle, bundleSha256: createHash('sha256').update(fs.readFileSync('dist' + bundle)).digest('hex'),
  coreSha256: createHash('sha256').update(fs.readFileSync('dist/at/alphaTab.core.mjs')).digest('hex'),
  fixtures: testSongs.slice(0, 2).map(({ tabFileName, tabFileSize }) => ({ tabFileName, tabFileSize })),
  cache: 'Fresh Edge profile. Warmup fills IndexedDB. Every open reauthorizes.',
  route: 'Product React PLAYER via local server, mocked authenticated API and signed-file transport',
  sample: 'Windows renderer PrivatePageCount bytes, marker-scoped process sum',
  timeline: [],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
const save = () => fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
const mark = (phase) => { console.log('TB2-M run', run, phase); save(); };
const sampler = spawn('powershell.exe', ['-NoProfile', '-Command', `
while ($true) {
  $ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $renderers = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object {
    $_.CommandLine -like '*${marker}*' -and $_.CommandLine -like '*--type=renderer*' -and $_.CommandLine -notlike '*--extension-process*'
  })
  $bytes = [int64](($renderers | Measure-Object -Property PrivatePageCount -Sum).Sum)
  Write-Output "$ts,$bytes,$($renderers.Count)"
  Start-Sleep -Milliseconds 400
}
`], { stdio: ['ignore', 'pipe', 'inherit'] });
let incompleteLine = '';
sampler.stdout.on('data', (chunk) => {
  const lines = (incompleteLine + chunk).split(/\r?\n/);
  incompleteLine = lines.pop();
  for (const line of lines) {
    const [ts, bytes, renderers] = line.split(',').map(Number);
    if (ts && bytes && renderers) samples.push({ ts, bytes, renderers });
  }
});

(async () => {
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: 'msedge', viewport: { width: 1280, height: 800 }, args: ['--mute-audio'] });
    evidence.browser = context.browser()?.version() || await context.pages()[0].evaluate(() => navigator.userAgent);
    const page = await context.newPage();
    await context.pages()[0].close();
    await observeTabResources(page);
    await setupTabPage(page, { instrumentApi: true });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const score = page.getByTestId('tab-score');
    const choose = (song) => page.locator('#folderList').getByRole('button', { name: new RegExp(song.title.replace('.', '\\.')) }).click();
    const route = (href) => page.evaluate((url) => {
      history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, href);
    const waitForCanvas = async (song) => {
      await page.locator('#songTitle').filter({ hasText: song.title }).waitFor({ timeout: 30_000 });
      await score.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await page.locator('[data-testid="tab-score"][data-ready="true"] canvas').first().waitFor({ timeout: 30_000 });
    };
    const scroll = () => score.evaluate(async (element) => {
      for (const target of [0.5, 1, 0]) {
        element.scrollTop = element.scrollHeight * target;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    });

    async function settle(label) {
      await sleep(30_000);
      const points = [];
      for (let index = 0; index < 3; index++) {
        if (index) await sleep(5000);
        const at = Date.now();
        for (let i = 0; i < 30 && samples.at(-1)?.ts < at; i++) await sleep(100);
        const point = samples.reduce((nearest, sample) => Math.abs(sample.ts - at) < Math.abs(nearest.ts - at) ? sample : nearest);
        assert.ok(Math.abs(point.ts - at) < 3000, 'Renderer sample current');
        const { metrics } = await cdp.send('Performance.getMetrics');
        const stats = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
        points.push({ ...point, heap: stats.JSHeapUsedSize, nodes: stats.Nodes, listeners: stats.JSEventListeners });
      }
      const reading = { label, points, bytes: median(points.map((point) => point.bytes)) };
      evidence.timeline.push(reading);
      mark(label + ' ' + (reading.bytes / MB).toFixed(2) + ' MB');
      return reading.bytes;
    }

    async function playSong(song, open, label) {
      const begin = Date.now();
      await open(song);
      await waitForCanvas(song);
      const readyMs = Date.now() - begin;
      assert.ok(readyMs <= 30_000);
      const before = await readTabResources(page);
      await page.locator('#playBtn').click();
      const rms = await readTabRms(page, 5000);
      assert.ok(rms.peak > 0.005 && rms.audibleSamples > 15, JSON.stringify(rms));
      await page.locator('#playBtn').click();
      await scroll();
      const after = await readTabResources(page);
      assert.deepEqual(after.violations, []);
      assert.equal(after.worklets.length, Math.max(before.worklets.length, before.contexts.length));
      const range = samples.filter((sample) => sample.ts >= begin && sample.ts <= Date.now());
      assert.ok(range.length);
      const peak = Math.max(...range.map((sample) => sample.bytes));
      const embeds = await page.locator('#videoBox iframe').evaluateAll((frames) => frames.map((frame) => ({
        id: frame.id, src: frame.getAttribute('src'),
      })));
      assert.deepEqual(embeds, []);
      evidence.timeline.push({ label, file: song.tabFileName, readyMs, peak, before, after, rms, memory: range });
      mark(label + ' ready ' + readyMs + 'ms');
      return peak;
    }

    async function leave(contextCount) {
      await route('/index.html');
      await score.waitFor({ state: 'detached' });
      for (let i = 0; i < 100; i++) {
        const res = await readTabResources(page);
        if (res.canvas === 0 && res.objectUrls === 0 && !res.workers.some((w) => w.alive) &&
            res.contexts.length === contextCount && res.contexts.every((a) => a.closed) &&
            res.apis.length === contextCount && res.apis.every((api) => api.destroys === 1)) {
          evidence.timeline.push({ label: 'exit', res });
          return;
        }
        await sleep(50);
      }
      throw new Error('TAB resources remained after exit: ' + JSON.stringify(await readTabResources(page)));
    }

    await page.goto(origin + '/index.html');
    const open = (song) => route('/practice.html?song=' + song.id);
    await playSong(testSongs[0], open, 'warmup');
    await leave(1);
    const B0 = await settle('B0');
    const P = [], R = [];
    for (let i = 0; i <= 10; i++) {
      P.push(await playSong(testSongs[i % 2], i === 0 ? open : choose, 'P' + i));
      const res = await readTabResources(page);
      assert.equal(res.apis.length, 2, 'One TAB API per PLAYER lifetime');
      assert.deepEqual(res.apis[1], { destroys: 0, scores: i + 1 });
      assert.equal(res.contexts.length, 2, 'No additional context between selections');
      assert.equal(res.workers.length, 2, 'No additional worker between selections');
      assert.equal(res.worklets.length, 2, 'No additional worklet between selections');
      assert.equal(res.objectUrls, 0);
      assert.equal(res.contexts.filter((entry) => !entry.closed).length, 1);
      R.push(await settle('R' + i));
    }
    await leave(2);
    const REnd = await settle('R_end');
    const budget = Math.max(10 * MB, B0 * 0.1);
    const peak = Math.max(...P) - B0;
    const exit = REnd - B0;
    const drift = median(R.slice(8, 11)) - median(R.slice(1, 4));
    evidence.result = {
      B0, REnd, P, R, peak, exit, drift, budget,
      A: R.slice(1).map((point) => point - R[0]),
      B: R.slice(1).map((point) => point - B0),
    };
    const common = peak <= 150 * MB && exit <= budget && drift <= 5 * MB;
    evidence.result.passA = common && evidence.result.A.every((delta) => delta <= budget);
    evidence.result.passB = common && evidence.result.B.every((delta) => delta <= budget);
    mark(JSON.stringify(evidence.result));
    assert.ok(evidence.result.passA, 'D3-A thresholds');
  } catch (error) {
    evidence.error = error.stack;
    save();
    console.error(error);
    process.exitCode = 1;
  } finally {
    await context?.close();
    sampler.kill();
  }
})();
