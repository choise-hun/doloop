// test/app_web_bundle.test.js
// M1A-2 앱 번들 조립(scripts/build-app-web.mjs) — 명세 §8.1 B1~B4
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { pathToFileURL } = require('node:url');
const loadBuilder = () => import(pathToFileURL(path.join(ROOT, 'scripts/build-app-web.mjs')).href);

const CSP_INDEX = '<!doctype html><html><head>'
  + '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; frame-src https://www.youtube.com https://accounts.google.com; connect-src \'self\'; object-src \'none\'">'
  + '</head><body><div id="root"></div><script src="/config.js"></script></body></html>';
const CONFIG_JS = "window.ULEVELP_CONFIG = {\n  apiBaseUrl: '',\n  playerEmbedUrl: 'https://player.example.test/player-embed.html',\n};\n";

function fixture({ index = CSP_INDEX, withIndex = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulp-appweb-'));
  const distDir = path.join(dir, 'dist');
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.mkdirSync(publicDir);
  if (withIndex) fs.writeFileSync(path.join(distDir, 'index.html'), index);
  fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log(1)');
  fs.writeFileSync(path.join(publicDir, 'config.js'), CONFIG_JS);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), '<svg/>');
  return { distDir, publicDir, outDir: path.join(dir, 'dist-app') };
}

const frameSrcOf = (html) => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)[1];
  return csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-src')).split(/\s+/).slice(1);
};

test('B1 APP_ENTRY_PAGES = server.js SPA_PAGES = Main.kt SPA_ENTRY_PAGES = App.tsx .html 라우트', async () => {
  const { APP_ENTRY_PAGES } = await loadBuilder();
  const app = new Set(APP_ENTRY_PAGES);
  const node = new Set([...read('server.js').match(/const SPA_PAGES = new Set\(\[([^\]]*)\]/)[1].matchAll(/'\/([^']+)'/g)].map((m) => m[1]));
  const kt = new Set([...read('src/main/kotlin/ulevelp/Main.kt').match(/SPA_ENTRY_PAGES = setOf\(([^)]*)\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const routes = new Set([...read('frontend/src/App.tsx').matchAll(/<Route path="\/([^"]+\.html)"/g)].map((m) => m[1]));
  assert.equal(app.size, 11);
  assert.deepEqual([...node].sort(), [...app].sort());
  assert.deepEqual([...kt].sort(), [...app].sort());
  assert.deepEqual([...routes].sort(), [...app].sort());
});

test('B2 buildAppWeb: 진입 페이지 11개 사본·public·assets, 덮어쓰기 URL은 config.js 끝 줄, http는 실패', async () => {
  const { buildAppWeb, APP_ENTRY_PAGES } = await loadBuilder();
  const f = fixture();
  buildAppWeb(f);
  const appIndex = fs.readFileSync(path.join(f.outDir, 'index.html'), 'utf8');
  for (const page of APP_ENTRY_PAGES) {
    assert.equal(fs.readFileSync(path.join(f.outDir, page), 'utf8'), appIndex, page);
  }
  assert.equal(fs.readFileSync(path.join(f.outDir, 'config.js'), 'utf8'), CONFIG_JS + '\nwindow.ULEVELP_CONFIG.apiBaseUrl = \"https://ulevelp-d5ympfsmfq-du.a.run.app\";\n');
  assert.ok(fs.existsSync(path.join(f.outDir, 'assets', 'app.js')));
  assert.ok(fs.existsSync(path.join(f.outDir, 'favicon.svg')));

  const g = fixture();
  buildAppWeb({ ...g, playerEmbedUrl: 'https://m1a2---run.example.test/player-embed.html' });
  const lines = fs.readFileSync(path.join(g.outDir, 'config.js'), 'utf8').trimEnd().split('\n');
  assert.ok(lines.includes('window.ULEVELP_CONFIG.playerEmbedUrl = "https://m1a2---run.example.test/player-embed.html";'));

  const h = fixture();
  assert.throws(() => buildAppWeb({ ...h, playerEmbedUrl: 'http://insecure.example.test/player-embed.html' }), /https URL만/);
  assert.equal(fs.existsSync(h.outDir), false);
});

test('B3 dist/index.html이 없으면 실패한다', async () => {
  const { buildAppWeb } = await loadBuilder();
  const f = fixture({ withIndex: false });
  assert.throws(() => buildAppWeb(f), /먼저 npm run build/);
  assert.equal(fs.existsSync(f.outDir), false);
});

test('B4 앱용 페이지 CSP frame-src에 플레이어 출처, dist 원본은 그대로, frame-src 없으면 실패', async () => {
  const { buildAppWeb, APP_ENTRY_PAGES } = await loadBuilder();
  const f = fixture();
  buildAppWeb(f);
  for (const page of APP_ENTRY_PAGES) {
    const src = frameSrcOf(fs.readFileSync(path.join(f.outDir, page), 'utf8'));
    assert.deepEqual(src, ['https://www.youtube.com', 'https://accounts.google.com', 'https://player.example.test'], page);
  }
  assert.equal(fs.readFileSync(path.join(f.distDir, 'index.html'), 'utf8'), CSP_INDEX);

  const g = fixture();
  buildAppWeb({ ...g, playerEmbedUrl: 'https://m1a2---run.example.test/player-embed.html' });
  assert.ok(frameSrcOf(fs.readFileSync(path.join(g.outDir, 'practice.html'), 'utf8')).includes('https://m1a2---run.example.test'));
  assert.equal(frameSrcOf(fs.readFileSync(path.join(g.outDir, 'practice.html'), 'utf8')).includes('https://player.example.test'), false);

  const noFrame = CSP_INDEX.replace(/frame-src [^;]*; /, '');
  assert.throws(() => buildAppWeb(fixture({ index: noFrame })), /frame-src 지시문이 없다/);

  // 실제 웹 소스 CSP에도 frame-src가 있어야 조립이 성립한다(조용히 건너뛰지 않음)
  assert.ok(/frame-src https:\/\/www\.youtube\.com/.test(read('frontend/index.html')));
});


test('B5 app API config and all CSP connect-src match, web sources remain untouched', async () => {
  const { buildAppWeb, APP_ENTRY_PAGES } = await loadBuilder();
  const f = fixture();
  buildAppWeb({ ...f, apiBaseUrl: ' https://api.example.test/ ' });
  const config = fs.readFileSync(path.join(f.outDir, 'config.js'), 'utf8');
  const context = { window: {} };
  require('node:vm').runInNewContext(config, context);
  assert.equal(context.window.ULEVELP_CONFIG.apiBaseUrl, 'https://api.example.test');
  for(const page of APP_ENTRY_PAGES) {
    const html = fs.readFileSync(path.join(f.outDir, page), 'utf8');
    assert.match(html, /connect-src 'self' https:\/\/api.example.test/);
    assert.equal(html.split('https://api.example.test').length, 2);
  }
  assert.equal(fs.readFileSync(path.join(f.distDir, 'index.html'), 'utf8'), CSP_INDEX);
  assert.equal(fs.readFileSync(path.join(f.publicDir, 'config.js'), 'utf8'), CONFIG_JS);
});

test('B6 invalid API or missing connect-src fails before deleting an existing output', async () => {
  const { buildAppWeb } = await loadBuilder();
  for(const apiBaseUrl of ['', 'http://api.test', 'https://user@api.test', 'https://api.test/v1', 'https://api.test?x=1', 'https://api.test#x']) {
    const f=fixture();fs.mkdirSync(f.outDir);fs.writeFileSync(path.join(f.outDir,'sentinel'),'keep');
    assert.throws(()=>buildAppWeb({...f,apiBaseUrl}));
    assert.equal(fs.readFileSync(path.join(f.outDir,'sentinel'),'utf8'),'keep');
  }
  const f=fixture({index:CSP_INDEX.replace(/connect-src [^;]*; /,'')});
  fs.mkdirSync(f.outDir);fs.writeFileSync(path.join(f.outDir,'sentinel'),'keep');
  assert.throws(()=>buildAppWeb(f),/connect-src/);
  assert.equal(fs.readFileSync(path.join(f.outDir,'sentinel'),'utf8'),'keep');
});
