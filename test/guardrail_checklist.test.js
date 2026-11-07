'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walkFiles(dir, extFilter) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, extFilter));
    } else if (extFilter(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

test('미디어 요소의 src에 빈 문자열("")을 할당하여 초기화하지 않는다 (PR #19)', () => {
  const targetFiles = [
    ...walkFiles(path.join(__dirname, '..', 'frontend', 'src'), (n) => n.endsWith('.ts') || n.endsWith('.tsx')),
  ];

  const emptySrcRegex = /\.src\s*=\s*(['"`])\1/g;
  const violations = [];

  for (const file of targetFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = emptySrcRegex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(process.cwd(), file)}:${line} -> removeAttribute('src')와 load()를 사용하세요.`);
    }
  }

  assert.deepEqual(violations, [], `빈 src 할당 금지 위반:\n${violations.join('\n')}`);
});

test('Playwright E2E spec 파일에서 module.exports 사용 및 waitForTimeout 추측 대기를 금지한다 (PR #20, #28)', () => {
  const specFiles = walkFiles(path.join(__dirname, 'e2e'), (n) => n.endsWith('.spec.js'));
  const violations = [];

  for (const file of specFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    if (/\bmodule\.exports\b/.test(content)) {
      violations.push(`${relPath} -> spec 파일에서 헬퍼를 export하지 말고 test/e2e/support/ 로 분리하세요.`);
    }
    if (/\.waitForTimeout\s*\(/.test(content)) {
      violations.push(`${relPath} -> 임의 타이머(waitForTimeout) 대신 waitForResponse 등 이벤트 대기를 사용하세요.`);
    }
  }

  assert.deepEqual(violations, [], `E2E 테스트 규격 위반:\n${violations.join('\n')}`);
});

test('단위 테스트에서 assert.rejects 내부에 async () => 래퍼를 씌워 동기 예외를 가리지 않는다 (PR #13)', () => {
  const unitTestFiles = walkFiles(__dirname, (n) => n.endsWith('.test.js') && n !== 'guardrail_checklist.test.js');
  const violations = [];
  const asyncRejectsRegex = /assert\.rejects\s*\(\s*async\s*\(\s*\)\s*=>/g;

  for (const file of unitTestFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = asyncRejectsRegex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(process.cwd(), file)}:${line} -> async () => 대신 () => fn()을 전달하여 동기 throw 버그를 검출하세요.`);
    }
  }

  assert.deepEqual(violations, [], `assert.rejects 단언 왜곡 감지:\n${violations.join('\n')}`);
});

