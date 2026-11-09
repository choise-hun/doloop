const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENTRY = ['index.html', 'chords.html', 'practice.html', 'log.html', 'notes.html', 'note.html', 'settings.html', 'privacy.html', 'progressions.html'];

describe('RZ3-1: Ktor·server.js SPA 진입 경로 목록 일치 및 legacy 분기 제거', () => {
  test('Main.kt SPA_ENTRY_PAGES와 server.js SPA_PAGES가 9개 진입 경로로 같고 ULP_UI 분기가 없다', () => {
    const kt = read('src/main/kotlin/ulevelp/Main.kt');
    const js = read('server.js');
    for (const p of ENTRY) {
      assert.ok(new RegExp(`SPA_ENTRY_PAGES[\\s\\S]*"${p.replace('.', '\\.')}"`).test(kt), `Main.kt에 ${p}`);
      assert.ok(js.includes(`'/${p}'`), `server.js에 /${p}`);
    }
    assert.doesNotMatch(kt, /ULP_UI|uiMode/);
    assert.match(kt, /if \(relPath in SPA_ENTRY_PAGES\) "spa\.html" else relPath/);
    assert.doesNotMatch(js, /ULP_UI|SPA_MODE/);
    assert.match(js, /if \(SPA_PAGES\.has\(rel\)\) \{ root = DIST_DIR; rel = '\/index\.html'; \}/);
  });
});

describe('RZ3-2: 엔진은 frontend/src/lib/engine의 ES 모듈 (CH-E에서 public/lib CJS 변환 제거)', () => {
  test('vite.config.ts와 server.js에 public/lib 참조가 없다', () => {
    assert.ok(!/public(\[\\\\\/\]|\/)lib/.test(read('vite.config.ts')));
    assert.ok(!/public(\[\\\\\/\]|\/)lib/.test(read('server.js')));
  });
});

describe('RZ3-3: CI·배포 계약 (LG-1)', () => {
  test('E2E가 단일 React SPA 모드로 돌고 Docker 스모크에 legacy 롤백이 없다', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /name:\s*E2E XSS & CSP \(Playwright, spa\)/);
    assert.doesNotMatch(ci, /ui:\s*\[legacy,\s*spa\]/);
    assert.doesNotMatch(ci, /ULP_UI/);
  });
  test('배포가 Cloud Run 단일 ALLOWED_ORIGINS를 쓰고 id="root" 스모크를 확인한다', () => {
    const wf = read('.github/workflows/deploy-cloudrun.yml');
    const sh = read('scripts/deploy-cloudrun.sh');
    assert.doesNotMatch(wf, /ULP_UI/);
    assert.doesNotMatch(sh, /ULP_UI/);
    assert.match(wf, /ALLOWED_ORIGINS:\s*\$\{\{\s*vars\.ALLOWED_ORIGINS\s*\|\|\s*'https:\/\/ulevelp-d5ympfsmfq-du\.a\.run\.app'\s*\}\}/);
    assert.match(sh, /ALLOWED_ORIGINS="\$\{ALLOWED_ORIGINS:-https:\/\/ulevelp-d5ympfsmfq-du\.a\.run\.app\}"/);
    assert.match(wf, /grep -q 'id="root"'/);
    assert.ok(!/ALLOWED_ORIGINS[^\n]*(localhost|choise-hun\.github\.io)/.test(wf), 'deploy-cloudrun.yml 기본값에 localhost/Pages 금지');
    assert.ok(!/ALLOWED_ORIGINS=[^\n]*(localhost|choise-hun\.github\.io)/.test(sh), 'deploy-cloudrun.sh 기본값에 localhost/Pages 금지');
  });
});

describe('RZ3-4: React 화면 제목·설정 버튼', () => {
  test('5개 React 화면이 초기 document.title을 설정한다', () => {
    const want = {
      ChordsPage: '악기 연습실',
      NotesPage: '학습 노트 · ULeveLP',
      NoteDetailPage: '학습 노트 상세 · ULeveLP',
      SettingsPage: '설정 · ULeveLP',
      PrivacyPage: '개인정보처리방침 · ULeveLP',
    };
    for (const [name, title] of Object.entries(want)) {
      assert.ok(read(`frontend/src/pages/${name}.tsx`).includes(`document.title = '${title}'`), name);
    }
  });
  test('SettingsPage에 구 Gemini 모달 버튼이 없다(M1-3c에서 버튼 삭제)', () => {
    assert.doesNotMatch(read('frontend/src/pages/SettingsPage.tsx'), /btnOpenGeminiModal|geminiGuideBtn/);
  });
});
