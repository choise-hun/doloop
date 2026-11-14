// 디자인 규칙 정적 검사 (docs/rules/frontend-design.md §4)
// frontend/src 아래 모든 CSS를 본다. 새 CSS 파일도 자동으로 포함된다.
// 외부 의존성 없이 Node 내장 모듈만 사용한다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CSS_ROOT = path.join(ROOT, 'frontend', 'src');
const TOKENS = 'frontend/src/styles/tokens.css';

function walkCss(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkCss(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

const cssFiles = walkCss(CSS_ROOT)
  .map((abs) => ({
    rel: path.relative(ROOT, abs).split(path.sep).join('/'),
    // 주석 안의 예시 값은 검사하지 않는다
    src: fs.readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))
  .sort((a, b) => a.rel.localeCompare(b.rel));

const ALLOWED_RADIUS = new Set([
  '0', '0px', '50%', '9999px',
  'var(--radius-pill)', 'var(--radius-card)', 'var(--radius-card, 0)',
]);

// 토큰 밖 색은 0이다(DS-1). 새 예외를 이 표에 추가하지 않는다.
const KNOWN_RAW_COLORS = {};

function countRawColors(src) {
  const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  const fn = src.match(/\b(?:rgba?|hsla?)\(/g) || [];
  return hex.length + fn.length;
}

test('DR-1: 검사 대상 CSS가 실제로 수집된다', () => {
  assert.ok(cssFiles.length >= 20, 'frontend/src CSS 파일 수가 예상보다 적음: ' + cssFiles.length);
  assert.ok(cssFiles.some((f) => f.rel === TOKENS), TOKENS + '가 대상에 없음');
});

test('DR-2: 모든 CSS에서 곡률은 필(9999px)·직각(0)·원(50%)만 쓴다', () => {
  const bad = [];
  for (const { rel, src } of cssFiles) {
    for (const m of src.matchAll(/border(?:-[a-z]+){0,2}-radius\s*:\s*([^;!}]+)/gi)) {
      const val = m[1].trim();
      if (!ALLOWED_RADIUS.has(val)) bad.push(rel + ' → ' + m[0].trim());
    }
  }
  assert.deepEqual(bad, [], '허용되지 않은 곡률');
});

test('DR-3: 모든 CSS에서 순백(#fff/#ffffff)을 쓰지 않는다', () => {
  const bad = [];
  for (const { rel, src } of cssFiles) {
    const m = src.match(/#(?:ffffff|fff)\b/i);
    if (m) bad.push(rel + ' → ' + m[0]);
  }
  assert.deepEqual(bad, [], '순백 사용');
});

test('DR-4: tokens.css 밖에서 hex·rgb()·hsl()을 쓰지 않는다', () => {
  const over = [];
  const stale = [];
  for (const { rel, src } of cssFiles) {
    if (rel === TOKENS) continue;
    const n = countRawColors(src);
    const allowed = KNOWN_RAW_COLORS[rel] || 0;
    if (n > allowed) over.push(rel + ' → ' + n + '개 (허용 ' + allowed + ')');
    if (n < allowed) stale.push(rel + ' → 실제 ' + n + '개, 표는 ' + allowed);
  }
  assert.deepEqual(over, [], '토큰 밖 색이 늘었다. tokens.css 변수나 color-mix()를 쓴다');
  assert.deepEqual(stale, [], '토큰 밖 색이 줄었다. KNOWN_RAW_COLORS의 숫자를 실제 값으로 내린다');
  for (const rel of Object.keys(KNOWN_RAW_COLORS)) {
    assert.ok(cssFiles.some((f) => f.rel === rel), 'KNOWN_RAW_COLORS에 없는 파일이 적혀 있음: ' + rel);
  }
});

test('DR-5: 주황 토큰을 글자색으로 쓰지 않는다', () => {
  const bad = [];
  for (const { rel, src } of cssFiles) {
    if (rel === TOKENS) continue;
    for (const m of src.matchAll(/(?:^|[\s;{])color\s*:\s*var\(--(?:orange-[a-z]+|now-ring|moved)\)/g)) {
      bad.push(rel + ' → ' + m[0].trim());
    }
  }
  assert.deepEqual(bad, [], '주황 토큰을 글자색으로 사용');
});
