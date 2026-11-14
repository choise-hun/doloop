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

// DS-3: 글자 크기 단계 (docs/rules/frontend-design.md §3)
const FONT_STEPS = new Set([
  '12px', '13px', '14px', '15px', '16px', '17px', '18px', '24px', '32px',
  'clamp(24px, 5vw, 38px)', 'clamp(36px, 7vw, 56px)', 'clamp(48px, 10vw, 96px)',
]);
const SMALL_TEXT = new Set(['6px', '8px', '9px', '10px', '11px']);
// 11px 이하는 지판·건반·다이어그램·썸네일·요일 칸처럼 공간이 정해진 표기에만 쓴다.
// 본문용으로 이 표에 파일을 추가하거나 숫자를 올리지 않는다.
const KNOWN_SMALL_TEXT = {
  'frontend/src/pages/ChordsPage.module.css': 19,
  'frontend/src/pages/HomePage.module.css': 2,
  'frontend/src/components/community/EpisodeLogCard.module.css': 1,
  'frontend/src/components/songRecord/EpisodeShareDialog.module.css': 1,
};
// 실행 중에 스크립트가 넣는 변수(tokens.css에 정의가 없다)
const RUNTIME_VARS = ['--tabbar-real-height'];

function walkFiles(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

test('DR-6: 글자 크기는 단계 값만 쓰고 11px 이하는 허용 표의 파일에만 있다', () => {
  const offStep = [];
  const shorthand = [];
  const over = [];
  const stale = [];
  for (const { rel, src } of cssFiles) {
    let small = 0;
    for (const m of src.matchAll(/(?:^|[\s;{])font-size\s*:\s*([^;}]+)/g)) {
      const val = m[1].replace(/!important/i, '').trim().replace(/\s+/g, ' ');
      if (SMALL_TEXT.has(val)) small += 1;
      else if (!FONT_STEPS.has(val)) offStep.push(rel + ' → font-size: ' + val);
    }
    for (const m of src.matchAll(/(?:^|[\s;{])font\s*:\s*([^;}]+)/g)) {
      if (/\d(?:px|rem|em|pt|%)/.test(m[1])) shorthand.push(rel + ' → font: ' + m[1].trim());
    }
    const allowed = KNOWN_SMALL_TEXT[rel] || 0;
    if (small > allowed) over.push(rel + ' → ' + small + '개 (허용 ' + allowed + ')');
    if (small < allowed) stale.push(rel + ' → 실제 ' + small + '개, 표는 ' + allowed);
  }
  assert.deepEqual(offStep, [], '단계 밖 글자 크기. 12·13·14·15·16·17·18·24·32px 또는 정해진 clamp() 3가지만 쓴다');
  assert.deepEqual(shorthand, [], 'font: 축약으로 글자 크기를 정하지 않는다');
  assert.deepEqual(over, [], '11px 이하 글자가 늘었다. 본문은 12px 이상으로 쓴다');
  assert.deepEqual(stale, [], '11px 이하 글자가 줄었다. KNOWN_SMALL_TEXT의 숫자를 실제 값으로 내린다');
  for (const rel of Object.keys(KNOWN_SMALL_TEXT)) {
    assert.ok(cssFiles.some((f) => f.rel === rel), 'KNOWN_SMALL_TEXT에 없는 파일이 적혀 있음: ' + rel);
  }
});

test('DR-7: 정의하지 않은 CSS 변수를 쓰지 않는다', () => {
  const tokens = cssFiles.find((f) => f.rel === TOKENS);
  assert.ok(tokens, TOKENS + '가 대상에 없음');
  const defined = new Set();
  for (const m of tokens.src.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)) defined.add(m[1]);
  assert.ok(defined.size >= 20, 'tokens.css에서 모은 변수 수가 예상보다 적음: ' + defined.size);

  const bad = [];
  for (const { rel, src } of cssFiles) {
    for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!defined.has(m[1]) && !RUNTIME_VARS.includes(m[1])) bad.push(rel + ' → ' + m[1]);
    }
  }
  assert.deepEqual(bad, [], 'tokens.css에 없는 변수. 있는 토큰으로 바꾸거나 선언을 지운다');

  const scripts = walkFiles(CSS_ROOT, ['.tsx', '.ts']).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  for (const name of RUNTIME_VARS) {
    assert.ok(scripts.includes("setProperty('" + name + "'"), 'RUNTIME_VARS의 ' + name + '를 넣는 코드(setProperty)가 없음');
  }
});
