// M1A-2 앱 번들 조립: dist/ + public/ → dist-app/ (명세 §3).
// Capacitor 로컬 서버는 확장자 있는 경로(practice.html 등)를 index.html로 돌리지 않으므로
// 진입 페이지마다 앱용 index.html 사본을 둔다. 앱용 index.html은 CSP frame-src에 플레이어 출처를 더한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// server.js SPA_PAGES · Main.kt SPA_ENTRY_PAGES · App.tsx 라우트와 같아야 한다(test/app_web_bundle.test.js B1).
export const APP_ENTRY_PAGES = [
  'index.html', 'chords.html', 'practice.html', 'log.html', 'community.html',
  'notes.html', 'note.html', 'settings.html', 'privacy.html', 'progressions.html',
  'profile.html',
];

function requireHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}: URL 형식이 아니다 (${value})`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label}: https URL만 허용한다 (${value})`);
  return url;
}

export function readConfigPlayerEmbedUrl(configSource) {
  const m = /playerEmbedUrl:\s*'([^']+)'/.exec(configSource);
  if (!m) throw new Error('public/config.js에서 playerEmbedUrl을 읽지 못했다');
  return m[1];
}

function addCspOrigin(html, origin, directive) {
  const meta = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/.exec(html);
  if (!meta) throw new Error('index.html에 CSP meta가 없다');
  const directives = meta[2].split(';').map((d) => d.trim());
  const idx = directives.findIndex((d) => new RegExp(`^${directive}(\\s|$)`).test(d));
  if (idx < 0) throw new Error(`index.html CSP에 ${directive} 지시문이 없다`);
  if (!directives[idx].split(/\s+/).includes(origin)) directives[idx] = `${directives[idx]} ${origin}`;
  return html.slice(0, meta.index) + meta[1] + directives.join('; ') + meta[3] + html.slice(meta.index + meta[0].length);
}

export function addFrameSrcOrigin(html, origin) {
  return addCspOrigin(html, origin, 'frame-src');
}

const DEFAULT_API_ORIGIN = 'https://ulevelp-d5ympfsmfq-du.a.run.app';

function requireApiOrigin(value) {
  const url = requireHttpsUrl(String(value).trim(), 'apiBaseUrl');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('apiBaseUrl: HTTPS Origin만 허용한다');
  }
  return url.origin;
}

export function buildAppWeb({ distDir, publicDir, outDir, playerEmbedUrl, apiBaseUrl = DEFAULT_API_ORIGIN }) {
  const distIndex = path.join(distDir, 'index.html');
  if (!fs.existsSync(distIndex)) throw new Error(`${distIndex} 없음 — 먼저 npm run build`);

  const configSource = fs.readFileSync(path.join(publicDir, 'config.js'), 'utf8');
  const overrideUrl = playerEmbedUrl ? requireHttpsUrl(playerEmbedUrl, 'playerEmbedUrl') : null;
  const effectiveUrl = overrideUrl || requireHttpsUrl(readConfigPlayerEmbedUrl(configSource), 'config.js playerEmbedUrl');

  const apiOrigin = requireApiOrigin(apiBaseUrl);
  const appIndex = addCspOrigin(addFrameSrcOrigin(fs.readFileSync(distIndex, 'utf8'), effectiveUrl.origin), apiOrigin, 'connect-src');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(distDir, outDir, { recursive: true });
  fs.cpSync(publicDir, outDir, { recursive: true });

  for (const page of APP_ENTRY_PAGES) fs.writeFileSync(path.join(outDir, page), appIndex);

  if (overrideUrl) {
    fs.appendFileSync(
      path.join(outDir, 'config.js'),
      `\nwindow.ULEVELP_CONFIG.playerEmbedUrl = ${JSON.stringify(overrideUrl.href)};\n`,
    );
  }
  fs.appendFileSync(path.join(outDir, 'config.js'), `\nwindow.ULEVELP_CONFIG.apiBaseUrl = ${JSON.stringify(apiOrigin)};\n`);
  return { apiBaseUrl: apiOrigin, playerEmbedUrl: effectiveUrl.href, pages: APP_ENTRY_PAGES.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = buildAppWeb({
      distDir: path.join(root, 'dist'),
      publicDir: path.join(root, 'public'),
      outDir: path.join(root, 'dist-app'),
      apiBaseUrl: process.env.APP_API_BASE_URL,
      playerEmbedUrl: process.env.APP_PLAYER_EMBED_URL || undefined,
    });
    console.log(`dist-app/ 조립 완료: 진입 페이지 ${result.pages}개, 플레이어 ${result.playerEmbedUrl}`);
  } catch (err) {
    console.error(`build-app-web 실패: ${err.message}`);
    process.exit(1);
  }
}
