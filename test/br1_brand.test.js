// BR-1 브랜드 교체(RE:DO) · 로고 · 파비콘 정적 검증 (개발산출물/명세/BR-1_구현명세.md §7-1)
// 외부 의존성 없이 Node 내장 모듈만 사용한다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

const R_PATH =
  'M0 0H50C70 0 82 13 82 30C82 44 74 53 63 57L84 100H55L37 62H26V100H0Z M26 24H48C54 24 57 27 57 32C57 36 54 38 48 38H26Z';
const E_PATH = 'M0 0H70V24H26V38H70V62H26V76H70V100H0Z';
const D_PATH = 'M0 0H40A50 50 0 0 1 40 100H0Z M26 24H40A26 26 0 0 1 40 76H26Z';
const O_PATH =
  'M50 0A50 50 0 0 1 50 100A50 50 0 0 1 50 0Z M50 24A26 26 0 0 0 50 76A26 26 0 0 0 50 24Z';

const LEGACY_BRAND_RE = new RegExp('ULeve' + 'LP|ULeve' + 'lP');

test('BR1-1: 노출 코드·설정·서버에 옛 브랜드명은 drive.ts 레거시 폴더 상수 1줄뿐이다', () => {
  const targets = [
    path.join(ROOT, 'frontend', 'index.html'),
    ...walk(path.join(ROOT, 'frontend', 'src'), ['.ts', '.tsx', '.mts', '.css']),
    ...fs
      .readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
      .filter((e) => e.isFile() && ['.svg', '.js'].includes(path.extname(e.name)))
      .map((e) => path.join(ROOT, 'public', e.name)),
    ...walk(path.join(ROOT, 'src', 'main', 'kotlin'), ['.kt']),
  ].sort();

  const hits = [];
  for (const abs of targets) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const lines = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, idx) => {
      const stripped = line.replace(/ULevelPConfig/g, '');
      if (LEGACY_BRAND_RE.test(stripped)) {
        hits.push({ rel, lineNo: idx + 1, line: line.trim() });
      }
    });
  }

  const formatted = hits.map((h) => `${h.rel}:${h.lineNo}: ${h.line}`).join('\n');
  assert.equal(hits.length, 1, `기대 1줄, 실제 ${hits.length}줄:\n${formatted}`);
  assert.equal(hits[0].rel, 'frontend/src/lib/drive.ts');
  assert.ok(
    hits[0].line.startsWith('const LEGACY_DRIVE_FOLDER_NAME ='),
    `예상치 못한 줄: ${formatted}`
  );
});

test('BR1-2: frontend/index.html에 RE:DO 제목과 favicon·apple-touch-icon 링크가 있다', () => {
  const html = readRel('frontend/index.html');
  assert.ok(html.includes('<title>RE:DO</title>'), '<title>RE:DO</title> 누락');

  const links = html.match(/<link\b[^>]*>/gi) || [];
  const hasFavicon = links.some(
    (tag) => /rel=["']icon["']/i.test(tag) && /href=["']\/favicon\.svg["']/i.test(tag)
  );
  const hasAppleTouch = links.some(
    (tag) =>
      /rel=["']apple-touch-icon["']/i.test(tag) && /href=["']\/icon-180\.png["']/i.test(tag)
  );
  assert.ok(hasFavicon, 'rel="icon" href="/favicon.svg" 누락');
  assert.ok(hasAppleTouch, 'rel="apple-touch-icon" href="/icon-180.png" 누락');
});

test('BR1-3: public/favicon.svg와 public/icon-180.png가 존재하고 favicon.svg 규칙을 만족한다', () => {
  const faviconPath = path.join(ROOT, 'public', 'favicon.svg');
  const iconPath = path.join(ROOT, 'public', 'icon-180.png');
  assert.ok(fs.existsSync(faviconPath), 'public/favicon.svg 없음');
  assert.ok(fs.existsSync(iconPath), 'public/icon-180.png 없음');

  const svg = readRel('public/favicon.svg');
  assert.ok(svg.includes(R_PATH), 'R 경로 누락');
  assert.ok(svg.includes('viewBox="0 0 200 200"'), 'viewBox="0 0 200 200" 누락');
  assert.ok(!/style/i.test(svg), 'favicon.svg에 style 금지');
  assert.ok(!/<script/i.test(svg), 'favicon.svg에 <script 금지');
});

test('BR1-4: BrandLogo.tsx에 4개 도형 경로, 3개 viewBox, 접근성 속성, currentColor가 있고 인라인 style·hex가 없다', () => {
  const rel = 'frontend/src/components/common/BrandLogo.tsx';
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} 없음`);
  const src = readRel(rel);

  for (const d of [R_PATH, E_PATH, D_PATH, O_PATH]) {
    assert.ok(src.includes(d), `경로 누락: ${d}`);
  }
  for (const vb of ['0 0 416 100', '0 0 202 210', '0 0 120 100']) {
    assert.ok(src.includes(vb), `viewBox 누락: ${vb}`);
  }
  assert.ok(src.includes('aria-label'), 'aria-label 누락');
  assert.ok(src.includes('role="img"'), 'role="img" 누락');
  assert.ok(src.includes('currentColor'), 'currentColor 누락');
  assert.ok(!src.includes('style={{'), 'style={{ 금지');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'hex 색 금지');
});

test('BR1-5: docs/brand/ SVG 3개가 존재하고 각 viewBox가 명세와 같다', () => {
  const expected = {
    'docs/brand/redo-wordmark.svg': '0 0 416 100',
    'docs/brand/redo-stack.svg': '0 0 202 210',
    'docs/brand/redo-mark.svg': '0 0 120 100',
  };
  for (const [rel, vb] of Object.entries(expected)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} 없음`);
    const svg = readRel(rel);
    assert.ok(svg.includes(`viewBox="${vb}"`), `${rel} viewBox="${vb}" 누락`);
  }
});

test('BR1-6: ko/en/ja i18n 7개 키(21건)가 모두 RE:DO 또는 REDO를 포함한다', () => {
  const keys = [
    'settings.driveHintBold',
    'settings.driveUsing',
    'privacy.pageSub',
    'privacy.secCollectIntro',
    'privacy.secStorageIntro',
    'prog.pageTitle',
    'log.documentTitle',
  ];
  const langs = ['ko', 'en', 'ja'];
  let checked = 0;

  for (const lang of langs) {
    const text = readRel(`frontend/src/lib/i18n/${lang}.mts`);
    for (const key of keys) {
      const escaped = key.replace(/\./g, '\\.');
      const match = text.match(new RegExp(`^\\s*'${escaped}':\\s*(.+)$`, 'm'));
      assert.ok(match, `${lang}.mts에서 키 '${key}'를 찾지 못함`);
      assert.ok(
        /(RE:DO|REDO)/.test(match[1]),
        `${lang}.mts '${key}' 값에 RE:DO/REDO 없음: ${match[1]}`
      );
      checked += 1;
    }
  }
  assert.equal(checked, 21);
});

test('BR1-7: drive.ts가 REDO 녹음을 먼저 조회하고 LEGACY를 뒤에 조회하며 PATCH가 없다', () => {
  const src = readRel('frontend/src/lib/drive.ts');
  assert.ok(
    /DRIVE_FOLDER_NAME\s*=\s*'REDO 녹음'/.test(src),
    "DRIVE_FOLDER_NAME = 'REDO 녹음' 누락"
  );
  const ensureIdx = src.indexOf('function ensureFolder');
  assert.notEqual(ensureIdx, -1, 'ensureFolder 없음');
  const body = src.slice(ensureIdx);
  const newLookupIdx = body.indexOf('findFolderByName(token, DRIVE_FOLDER_NAME)');
  const legacyLookupIdx = body.indexOf('findFolderByName(token, LEGACY_DRIVE_FOLDER_NAME)');
  assert.notEqual(newLookupIdx, -1, 'DRIVE_FOLDER_NAME 조회 호출 없음');
  assert.notEqual(legacyLookupIdx, -1, 'LEGACY_DRIVE_FOLDER_NAME 조회 호출 없음');
  assert.ok(
    newLookupIdx < legacyLookupIdx,
    'DRIVE_FOLDER_NAME 조회가 LEGACY_DRIVE_FOLDER_NAME 조회보다 앞에 와야 함'
  );
  // 새 폴더 생성(POST)은 옛 이름 조회 뒤에 오고, 이름은 새 이름이어야 한다(D7).
  const uploadIdx = body.indexOf('function uploadBlob');
  const ensureBody = uploadIdx === -1 ? body : body.slice(0, uploadIdx);
  const createIdx = ensureBody.indexOf("method: 'POST'");
  assert.ok(createIdx > legacyLookupIdx, 'ensureFolder의 폴더 생성(POST)이 옛 이름 조회 뒤에 있어야 함');
  const createBlock = ensureBody.slice(createIdx);
  assert.ok(/name:\s*DRIVE_FOLDER_NAME\b/.test(createBlock), '폴더 생성 이름은 DRIVE_FOLDER_NAME이어야 함');
  const legacyUses = src.match(/\bLEGACY_DRIVE_FOLDER_NAME\b/g) || [];
  assert.equal(legacyUses.length, 2, `LEGACY_DRIVE_FOLDER_NAME은 선언 1회·조회 1회만 써야 함(실제 ${legacyUses.length}회)`);
  assert.ok(!/method\s*:\s*['"]PATCH['"]/i.test(src), "method: 'PATCH' 금지");
});
