'use strict';
const fs = require('node:fs');
const path = require('node:path');

const UID = '00000000-0000-4000-8000-000000000011';
const STORAGE = 'https://vefrfhafmiiivpgjhqiu.supabase.co';
const FIXTURES = path.resolve(__dirname, '../../../개발산출물/자료/TB-0_재현물/fixtures');
const SF2 = path.resolve(__dirname, '../../../node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2');
const testSongs = ['A.gp', 'B.mxl', 'B.xml'].map((file, index) => {
  const format = file.split('.').pop();
  return {
    id: '00000000-0000-4000-8000-00000000010' + (index + 1),
    title: 'TB2 ' + file, artist: '', status: '연습 중', statusCode: 'practicing',
    mediaType: 'tab', videoId: null, tabFileName: file, tabFormat: format,
    tabFileSize: fs.statSync(path.join(FIXTURES, file)).size,
    pos: null, a: null, b: null, rate: 1, lastDate: null,
    memo: '', categoryIds: [], totalSeconds: 0, resumeUrl: '', durationSec: 0,
  };
});
const yt = { ...testSongs[0], id: '00000000-0000-4000-8000-000000000104', title: 'TB2 YouTube',
  mediaType: 'youtube', videoId: 'jNQXAC9IVRw' };

async function setupTabPage(page, options = {}) {
  if (options.instrumentApi) {
    await page.route('**/at/alphaTab.mjs', async (route) => {
      const response = await route.fetch();
      const body = await response.text() + `
        import { AlphaTabApi as BaseApi } from './alphaTab.core.mjs';
        export class AlphaTabApi extends BaseApi {
          constructor(...args) {
            super(...args);
            const item = { destroys: 0, scores: 0 };
            window.tb2.apis.push(item);
            const off = this.scoreLoaded.on(() => { item.scores++; });
            const destroy = this.destroy.bind(this);
            this.destroy = () => {
              item.destroys++;
              off();
              destroy();
            };
          }
        }
      `;
      await route.fulfill({ response, body });
    });
  }
  await page.route((url) => url.pathname === '/at/soundfont/sonivox.sf2', (route) =>
    route.fulfill({ path: SF2, contentType: 'application/octet-stream' }));
  await page.route((url) => url.pathname.endsWith('.html') && url.origin.startsWith('http://127.0.0.1:'), async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/(<script src="https:\/\/cdn\.jsdelivr\.net[^"]+") integrity="[^"]+"/, '$1');
    await route.fulfill({ response, body });
  });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/**', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: 'tb2-local', user: { id: '${UID}' } } } }),
      onAuthStateChange: (cb) => {
        window.tb2Auth = (uid) => cb(uid ? 'SIGNED_IN' : 'SIGNED_OUT', uid ? { access_token: 'tb2-local', user: { id: uid } } : null);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    } }) };`,
  }));
  await page.route(/youtube\.com|ytimg\.com|doubleclick\.net|fonts\.googleapis\.com/, (route) => route.abort());
  await page.route((url) => url.origin === STORAGE && url.pathname.startsWith('/tb2-fixtures/'), async (route) => {
    const filename = new URL(route.request().url()).pathname.split('/').pop();
    const song = testSongs.find((entry) => entry.tabFileName === filename);
    if (!song) return route.abort();
    if (await options.file?.(route, song)) return;
    return route.fulfill({ path: path.join(FIXTURES, filename), contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('**/api/v1/**', async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    if (await options.api?.(route, pathname, searchParams)) return;
    let result = {};
    let status = 200;
    const song = testSongs.find((entry) => pathname.split('/').includes(entry.id));
    if (pathname === '/api/v1/me') result = { id: UID, locale: 'ko', migratedLocalAt: '2026-11-25', storageProvider: 'supabase' };
    else if (pathname === '/api/v1/categories') result = { categories: [] };
    else if (pathname === '/api/v1/songs') result = { songs: searchParams.get('include') === 'tab' ? [...testSongs, yt] : [yt] };
    else if (pathname === '/api/v1/songs/by-video/' + yt.videoId) result = { song: yt };
    else if (song && pathname.endsWith('/tab-file')) {
      result = { url: STORAGE + '/tb2-fixtures/' + song.tabFileName, expiresIn: 300,
        fileName: song.tabFileName, format: song.tabFormat, sizeBytes: song.tabFileSize };
    } else if (song && pathname.endsWith(song.id)) result = { song, sessions: [], takes: [] };
    else if (pathname === '/api/v1/sessions') result = { sessions: [], calendar: [], summary: {} };
    else if (pathname.endsWith('/presets')) result = { presets: [] };
    else if (pathname.startsWith('/api/v1/songs/')) status = 404;
    return route.fulfill({ status, json: result });
  });
}


// IDs and numeric samples keep the instrumented browser from retaining detached resources.
async function observeTabResources(page) {
  await page.addInitScript(() => {
    const apis = [];
    const workers = [];
    const contexts = [];
    const worklets = [];
    const objectUrls = new Set();
    const violations = [];
    const analysers = [];
    window.tb2 = { apis, workers, contexts, worklets, objectUrls, violations, analysers };
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
    const WorkerBase = window.Worker;
    window.Worker = class extends WorkerBase {
      constructor(url, options) {
        super(url, options);
        const record = { path: new URL(url, location.href).pathname, alive: true };
        workers.push(record);
        this.terminate = () => { record.alive = false; super.terminate(); };
      }
    };
    const ContextBase = window.AudioContext;
    window.AudioContext = class extends ContextBase {
      constructor(options) {
        super(options);
        this.tb2Id = contexts.length;
        const record = { state: this.state, closed: false, modules: [] };
        contexts.push(record);
        this.addEventListener('statechange', () => { record.state = this.state; });
        this.close = async () => {
          await super.close();
          record.closed = this.state === 'closed';
          record.state = this.state;
        };
        const original = this.audioWorklet.addModule.bind(this.audioWorklet);
        this.audioWorklet.addModule = async (url, options) => {
          await original(url, options);
          record.modules.push(new URL(url, location.href).pathname);
        };
      }
    };
    const WorkletBase = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends WorkletBase {
      constructor(context, name, options) {
        super(context, name, options);
        worklets.push({ id: context.tb2Id, name });
        const tap = context.createAnalyser();
        tap.fftSize = 2048;
        analysers[context.tb2Id] = new WeakRef(tap);
        this.connect = (destination, ...ports) => {
          if (destination === context.destination) super.connect(tap);
          return super.connect(destination, ...ports);
        };
      }
    };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      objectUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (value) => {
      objectUrls.delete(value);
      revoke(value);
    };
  });
}

async function readTabResources(page) {
  return page.evaluate(() => {
    const { apis, workers, contexts, worklets, objectUrls, violations } = window.tb2;
    return { apis, workers, contexts, worklets, objectUrls: objectUrls.size, violations,
      canvas: document.querySelectorAll('[data-testid="tab-score"] canvas').length };
  });
}

async function readTabRms(page, ms) {
  return page.evaluate(async (duration) => {
    const stop = performance.now() + duration;
    const samples = [];
    while (performance.now() < stop) {
      const analyser = window.tb2.analysers.at(-1)?.deref();
      const data = new Float32Array(analyser?.fftSize ?? 0);
      analyser?.getFloatTimeDomainData(data);
      samples.push(Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / Math.max(1, data.length)));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { peak: Math.max(0, ...samples), audibleSamples: samples.filter((sample) => sample > 0.001).length, samples };
  }, ms);
}

module.exports = { setupTabPage, testSongs, yt, UID, observeTabResources, readTabResources, readTabRms };
