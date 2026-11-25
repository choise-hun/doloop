// TB-0 격리 정적 서버. 제품 서버·API·DB를 쓰지 않는다.
// 사용: node server.mjs [port]  → 같은 출처 http://127.0.0.1:<port>, 테스트용 타 출처 http://127.0.0.1:<port+1>
// /?policy=current|candidate|candidate-blob  → 진입 HTML에 CSP meta를 주입(제품과 같은 meta 방식)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 5179);
const atDist = path.join(root, 'node_modules/@coderline/alphatab/dist');

// frontend/index.html:5 원문 (2026-11-25, main c8b5bec)
const CURRENT = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js https://www.youtube.com/iframe_api https://www.youtube.com/s/player/ https://accounts.google.com/gsi/client; style-src 'self' https://fonts.googleapis.com 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig='; font-src https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; media-src 'self' blob: https://vefrfhafmiiivpgjhqiu.supabase.co; connect-src 'self' https://vefrfhafmiiivpgjhqiu.supabase.co https://www.googleapis.com; frame-src https://www.youtube.com https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'";
const swap = (csp, dir, value) => csp.replace(new RegExp(`${dir} [^;]+`), `${dir} ${value}`);
const CANDIDATE = swap(swap(CURRENT, 'worker-src', "'self'"), 'font-src', "'self' https://fonts.gstatic.com");
export const POLICIES = {
  current: CURRENT,
  candidate: CANDIDATE,
  'candidate-blob': swap(CANDIDATE, 'worker-src', "'self' blob:"),
  // 조건부 비교안: style-src에 style 요소 inline 허용이 필요한지 확인할 때만 사용
  'candidate-style': swap(CANDIDATE, 'style-src', "'self' https://fonts.googleapis.com 'unsafe-inline'"),
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.sf2': 'application/octet-stream', '.gp': 'application/octet-stream', '.xml': 'application/xml', '.mxl': 'application/octet-stream', '.json': 'application/json' };
const log = [];

function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', ...extra });
  res.end(body);
}
function serveFile(res, file, extra) {
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream', extra);
}

const main = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const entry = { t: Date.now(), method: req.method, url: u.pathname + u.search };
  log.push(entry);
  res.on('finish', () => { entry.status = res.statusCode; });
  if (u.pathname === '/__log') return send(res, 200, JSON.stringify(log.splice(0)), 'application/json');
  if (u.pathname === '/' || u.pathname === '/index.html') {
    let policy = POLICIES[u.searchParams.get('policy') || 'candidate'];
    if (!policy) return send(res, 400, 'unknown policy', 'text/plain');
    // styleHash=sha256-...,sha256-...  → style-src 끝에 해시 토큰만 추가(‘unsafe-inline’ 대신)
    const hashes = (u.searchParams.get('styleHash') || '').split(',').filter((h) => /^sha256-[A-Za-z0-9+/=]+$/.test(h));
    if (hashes.length) policy = policy.replace(/style-src [^;]+/, (m) => `${m} ${hashes.map((h) => `'${h}'`).join(' ')}`);
    const html = fs.readFileSync(path.join(root, 'page/index.html'), 'utf8').replace('%CSP%', policy.replace(/"/g, '&quot;'));
    return send(res, 200, html, TYPES['.html']);
  }
  const delay = Number(u.searchParams.get('delay') || 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  if (u.pathname.startsWith('/at/')) return serveFile(res, path.join(atDist, decodeURIComponent(u.pathname.slice(4))));
  if (u.pathname.startsWith('/fixtures/')) return serveFile(res, path.join(root, 'fixtures', decodeURIComponent(u.pathname.slice(10))));
  return serveFile(res, path.join(root, 'page', decodeURIComponent(u.pathname.slice(1))));
});

// CSP-03용 타 출처: 허용되지 않은 출처의 Worker·폰트 요청이 차단되는지 확인
const other = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' };
  if (u.pathname === '/x-worker.js') return send(res, 200, 'postMessage("x-worker-alive")', 'text/javascript', cors);
  if (u.pathname === '/x-font.woff2') return serveFile(res, path.join(atDist, 'font/Bravura.woff2'), cors);
  send(res, 404, 'not found', 'text/plain', cors);
});

main.listen(port, '127.0.0.1', () => other.listen(port + 1, '127.0.0.1', () => console.log(`TB-0 server http://127.0.0.1:${port} (other origin :${port + 1})`)));
