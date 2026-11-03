// R1-2 설정(SettingsPage) · 노트(NotesPage/NoteDetailPage) · Gemini 1분 온보딩 모달 검증 테스트 (R1-S1 ~ R1-S8)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
}

// GeminiKeyOnboardingModal.tsx에서 validateGeminiKeyFormat 함수만 추출해 VM에서 실행
function loadValidateGeminiKeyFormat() {
  const src = readText('frontend/src/components/common/GeminiKeyOnboardingModal.tsx');
  const m = src.match(/export const GEMINI_KEY_REGEX[\s\S]*?export function validateGeminiKeyFormat[\s\S]*?\n\}/);
  assert.ok(m, 'validateGeminiKeyFormat 정의가 존재해야 함');
  const jsCode = m[0]
    .replace(/export\s+interface\s+[A-Za-z0-9_]+\s*\{[\s\S]*?\n\}/g, '')
    .replace(/export const /g, 'const ')
    .replace(/export function validateGeminiKeyFormat\([^)]*\):\s*GeminiKeyValidationResult/, 'function validateGeminiKeyFormat(rawInput)')
    .concat('\nmodule.exports = { GEMINI_KEY_REGEX, validateGeminiKeyFormat };');
  const mod = { exports: {} };
  vm.runInNewContext(jsCode, { module: mod, exports: mod.exports, String });
  return mod.exports.validateGeminiKeyFormat;
}

// NoteDetailPage.tsx에서 parseTimestampSec 함수 추출
function loadParseTimestampSec() {
  const src = readText('frontend/src/pages/NoteDetailPage.tsx');
  const m = src.match(/export function parseTimestampSec[\s\S]*?\n\}/);
  assert.ok(m, 'parseTimestampSec 정의가 존재해야 함');
  const jsCode = m[0]
    .replace(/export function parseTimestampSec\([^)]*\):\s*number\s*\|\s*null/, 'function parseTimestampSec(ts)')
    .concat('\nmodule.exports = parseTimestampSec;');
  const mod = { exports: {} };
  vm.runInNewContext(jsCode, { module: mod, Number, parseInt });
  return mod.exports;
}

test('R1-S1: validateGeminiKeyFormat — 빈 문자열·공백 포함 39자 유효 키·오류 입력 경계값 검증', () => {
  const validate = loadValidateGeminiKeyFormat();

  const rIdle = validate('   ');
  assert.equal(rIdle.valid, false);
  assert.equal(rIdle.status, 'idle');

  const validFakeKey = 'AI' + 'za' + 'A1b2_-'.repeat(5) + 'abcde'; // 4 + 30 + 5 = 39자
  assert.equal(validFakeKey.length, 39);
  const rOk = validate('  ' + validFakeKey + '\n ');
  assert.equal(rOk.valid, true);
  assert.equal(rOk.status, 'ok');
  assert.equal(rOk.trimmed, validFakeKey);
  assert.ok(rOk.hint.includes('39자'));

  const rShort = validate('AIza12345');
  assert.equal(rShort.valid, false);
  assert.equal(rShort.status, 'err');
  assert.ok(rShort.hint.includes('현재 9자'));
});

test('R1-S2: <GeminiKeyOnboardingModal /> 및 정적 HTML — 3대 안심 배지·AI Studio 링크·4단계 가이드·verify: true 검증', () => {
  const modalTsx = readText('frontend/src/components/common/GeminiKeyOnboardingModal.tsx');
  const pubSettings = readText('public/settings.html');
  const pubNotes = readText('public/notes.html');

  for (const target of [modalTsx, pubSettings, pubNotes]) {
    assert.ok(target.includes('AI 기능을 무료로 이용하기 위한 1분 설정'), '온보딩 모달 타이틀 필수');
    assert.ok(target.includes('무료 사용 가능 (분당 15회 무료 요청)'), '안심 배지 1 필수');
    assert.ok(target.includes('신용카드 등록 불필요'), '안심 배지 2 필수');
    assert.ok(target.includes('AES-256-GCM 암호화 보관'), '안심 배지 3 필수');
    assert.ok(target.includes('https://aistudio.google.com/app/apikey'), 'AI Studio 원클릭 링크 필수');
    assert.ok(target.includes('Create API key in new project'), '4단계 발급 안내 문구 필수');
  }

  assert.ok(modalTsx.includes('verify: true'), '모달 저장 시 verify: true 전달 필수');
});

test('R1-S3: R1-2 신규 CSS Modules 4종 & public/site.css — 순백(#ffffff/#fff) 0건 및 중간 곡률 0건', () => {
  const cssFiles = [
    'frontend/src/components/common/GeminiKeyOnboardingModal.module.css',
    'frontend/src/pages/SettingsPage.module.css',
    'frontend/src/pages/NotesPage.module.css',
    'frontend/src/pages/NoteDetailPage.module.css',
    'public/site.css',
  ];
  const allowedRadius = new Set(['0', '0px', '50%', '9999px', 'var(--radius-pill)', 'var(--radius-card)']);

  for (const file of cssFiles) {
    const src = readText(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const whiteMatch = src.match(/#(?:ffffff|fff)\b/i);
    assert.equal(whiteMatch, null, file + '에 금지된 순백 컬러가 존재함');
    for (const m of src.matchAll(/border-radius\s*:\s*([^;!}]+)/gi)) {
      const val = m[1].trim();
      assert.ok(allowedRadius.has(val), file + '에 허용되지 않은 중간 곡률 사용: ' + val);
    }
  }
});

test('R1-S4: SettingsPage, NotesPage, NoteDetailPage, PrivacyPage 및 App.tsx 라우트·필수 ID 구조 검증', () => {
  const appTsx = readText('frontend/src/App.tsx');
  const settingsTsx = readText('frontend/src/pages/SettingsPage.tsx');
  const notesTsx = readText('frontend/src/pages/NotesPage.tsx');
  const detailTsx = readText('frontend/src/pages/NoteDetailPage.tsx');
  const privacyTsx = readText('frontend/src/pages/PrivacyPage.tsx');

  for (const comp of ['<SettingsPage />', '<NotesPage />', '<NoteDetailPage />', '<PrivacyPage />']) {
    assert.ok(appTsx.includes(comp), 'App.tsx 라우트 누락: ' + comp);
  }

  for (const id of [
    'account', 'accEmail', 'accName', 'quotaBar', 'driveStoragePanel',
    'nx', 'inpImportZip', 'btnPreviewZip', 'nxPreviewBox', 'nxPreviewList',
    'keys', 'notionKeyStatus', 'ntnSongsDb', 'ntnSessionsDb', 'geminiKeyStatus', 'gemModel', 'btnOpenGeminiModal',
  ]) {
    assert.ok(settingsTsx.includes(`id="${id}"`), 'SettingsPage.tsx 누락 ID: ' + id);
  }

  for (const id of ['keyGateBox', 'keyGateMsg', 'btnKeyGateModal', 'form', 'url', 'preview', 'tags', 'memo', 'submit', 'jobs', 'notesList']) {
    assert.ok(notesTsx.includes(`id="${id}"`), 'NotesPage.tsx 누락 ID: ' + id);
  }

  for (const id of ['noteContent', 'noteHeader', 'noteTitle', 'noteMeta', 'noteHeadline', 'noteSections', 'notePractice', 'noteMemoInput', 'noteLoadingMsg']) {
    assert.ok(detailTsx.includes(`id="${id}"`), 'NoteDetailPage.tsx 누락 ID: ' + id);
  }

  for (const id of ['privH1', 'privH2', 'privH3', 'privH4']) {
    assert.ok(privacyTsx.includes(`id="${id}"`), 'PrivacyPage.tsx 누락 ID: ' + id);
  }
});

test('R1-S5: public/settings.js 온보딩 모달 오픈·실시간 형식 검증·verify: true 저장 후 상태 배지 즉시 갱신', async () => {
  const elements = new Map();
  function makeEl(id) {
    return {
      id,
      value: '',
      hidden: id === 'geminiOnboardingModal' || id === 'nxPreviewBox',
      disabled: false,
      checked: true,
      textContent: '',
      className: '',
      href: '',
      dataset: { theme: '' },
      listeners: {},
      addEventListener(ev, fn) {
        this.listeners[ev] = fn;
      },
      setAttribute(k, v) {
        this[k] = v;
      },
      replaceChildren() {},
    };
  }

  for (const id of [
    'account', 'accGuest', 'accUser', 'btnLogin', 'btnLoginBlank', 'accEmail', 'accName', 'quotaBar', 'quotaText',
    'driveStoragePanel', 'driveProviderText', 'driveStatusMsg', 'driveConflictNotice', 'btnDriveEnable', 'btnDriveDisable', 'btnDriveMigrate',
    'btnLogout', 'delConfirm', 'btnDeleteAcc', 'accMsg',
    'btnNotionTemplate', 'chkExportAudio', 'btnExportZip', 'inpImportZip', 'btnPreviewZip', 'nxPreviewBox', 'nxPreviewSummary', 'nxPreviewList', 'btnConfirmZip', 'btnCancelZip', 'nxMsg',
    'notionKeyStatus', 'ntnToken', 'ntnSongsDb', 'ntnSessionsDb', 'ntnNotesDb', 'btnSaveNotionKey', 'btnCheckNotionKey', 'btnDelNotionKey', 'ntnKeyMsg',
    'notionSyncPanel', 'syncStatusText', 'syncErrorText', 'btnSyncEnable', 'btnSyncDisable', 'btnSyncPull', 'btnSyncPush', 'syncMsg',
    'geminiKeyStatus', 'btnOpenGeminiModal', 'gemKey', 'gemModel', 'btnSaveGeminiKey', 'btnCheckGeminiKey', 'btnDelGeminiKey', 'gemKeyMsg',
    'nlPractice', 'nlNotes', 'nlSave', 'nlMsg',
    'geminiOnboardingModal', 'btnCloseGeminiModal', 'gemModalKeyInput', 'gemModalFormatHint', 'gemModalResultMsg', 'btnModalSaveGemini',
  ]) {
    elements.set(id, makeEl(id));
  }

  let savedPayload = null;
  const user = { id: 'u-1', email: 'test@example.com' };
  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
      createElement: (t) => makeEl(t),
      documentElement: { dataset: {} },
    },
    location: { href: 'http://localhost:3000/settings.html' },
    UL: {
      raw: { get: () => '', set: () => {} },
      json: { get: (_k, d) => d, set: () => {} },
      safeUrl: (u) => String(u || ''),
    },
    window: {
      ULEVELP_CONFIG: {},
      ULAuth: {
        isEmbedded: () => false,
        getUser: () => user,
        getMe: () => ({ id: 'u-1', email: 'test@example.com', storageProvider: 'supabase', keys: {} }),
        onChange: (cb) => cb({ user, me: { id: 'u-1', email: 'test@example.com', storageProvider: 'supabase' } }),
      },
      ULData: {
        integrations: {
          list: async () => [],
          saveGemini: async (input) => {
            savedPayload = input;
            return {
              provider: 'gemini',
              hint: 'X9zQ',
              config: { model: input.model || 'gemini-flash-latest' },
              updatedAt: '2026-11-03T00:00:00Z',
              verified: true,
              displayName: 'Gemini 1.5 Flash',
            };
          },
        },
        notionSync: {
          status: async () => ({ enabled: false, pending: 0, failed: 0 }),
        },
      },
    },
    Math,
    String,
    Array,
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.UL = sandbox.UL;

  vm.runInNewContext(readText('public/settings.js'), sandbox);
  await new Promise((r) => setTimeout(r, 10));

  // 1) 가이드 모달 열기
  assert.equal(elements.get('geminiOnboardingModal').hidden, true);
  elements.get('btnOpenGeminiModal').listeners.click();
  assert.equal(elements.get('geminiOnboardingModal').hidden, false);
  assert.equal(elements.get('btnModalSaveGemini').disabled, true);

  // 2) 39자리 키 입력
  const fakeKey = 'AI' + 'za' + 'K'.repeat(35);
  elements.get('gemModalKeyInput').value = '  ' + fakeKey + ' ';
  elements.get('gemModalKeyInput').listeners.input();
  assert.equal(elements.get('btnModalSaveGemini').disabled, false);

  // 3) 키 검증 후 저장 클릭
  await elements.get('btnModalSaveGemini').listeners.click();
  assert.equal(savedPayload.apiKey, fakeKey);
  assert.equal(savedPayload.verify, true);
  assert.ok(elements.get('geminiKeyStatus').textContent.includes('X9zQ'));
  assert.ok(elements.get('gemModalResultMsg').textContent.includes('정상 작동합니다'));
});

test('R1-S6: public/notes.js 온보딩 모달 키 저장 시 미저장 입력(#url, #tags, #memo) 보존 및 즉시 분석 버튼 활성화', async () => {
  const elements = new Map();
  const tagButtons = [];
  function makeEl(id) {
    return {
      id,
      value: '',
      hidden: id === 'geminiOnboardingModal',
      disabled: false,
      textContent: '',
      className: '',
      href: '',
      src: '',
      firstChild: null,
      children: [],
      listeners: {},
      classList: { toggle() {} },
      addEventListener(ev, fn) {
        this.listeners[ev] = fn;
      },
      setAttribute(k, v) {
        this[k] = v;
      },
      appendChild(c) {
        this.children.push(c);
        if (id === 'tags') tagButtons.push(c);
        return c;
      },
      removeChild() {},
      querySelector: () => ({ src: '' }),
      querySelectorAll: () => [],
    };
  }

  for (const id of [
    'msg', 'keyGateBox', 'keyGateMsg', 'btnKeyGateModal', 'form', 'url', 'preview', 'tags', 'memo', 'submit',
    'jobs', 'noteTagFilter', 'notesList', 'notionLink',
    'geminiOnboardingModal', 'btnCloseGeminiModal', 'gemModalKeyInput', 'gemModalFormatHint', 'gemModalResultMsg', 'btnModalSaveGemini',
  ]) {
    elements.set(id, makeEl(id));
  }

  let hasKey = false;
  const user = { id: 'u-notes-1' };
  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById: (id) => elements.get(id) || null,
      createElement: (t) => makeEl(t),
      addEventListener: () => {},
    },
    location: { search: '?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DjNQXAC9IVRw', pathname: '/notes.html' },
    history: { replaceState: () => {} },
    UL: {
      raw: { get: () => '', set: () => {} },
      videoIdFrom: (s) => (String(s || '').includes('jNQXAC9IVRw') ? 'jNQXAC9IVRw' : null),
      thumb: (id) => 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      safeUrl: (u) => String(u || ''),
    },
    window: {
      ULAuth: {
        getAccessToken: async () => 'tok',
        getUser: () => user,
        getMe: () => ({ id: 'u-notes-1', keys: { gemini: hasKey ? { hint: '9999' } : null } }),
        onChange: () => {},
      },
      ULData: {
        isLoggedIn: () => true,
        getCachedKeys: () => ({ notion: null, gemini: hasKey ? { hint: '9999' } : null }),
        integrations: {
          saveGemini: async () => {
            hasKey = true;
            return { provider: 'gemini', hint: '9999', config: { model: 'gemini-flash-latest' }, updatedAt: '2026-11-03T00:00:00Z', verified: true };
          },
        },
        notes: {
          listJobs: async () => [],
          list: async () => [],
        },
      },
    },
    URLSearchParams,
    Set,
    Date,
    Math,
    String,
    Array,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.UL = sandbox.UL;

  vm.runInNewContext(readText('public/notes.js'), sandbox);
  await new Promise((r) => setTimeout(r, 10));

  // 초기: 키 미등록이므로 keyGateBox 노출 및 submit 비활성
  assert.equal(elements.get('keyGateBox').hidden, false);
  assert.equal(elements.get('submit').disabled, true);

  // 사용자가 메모와 태그('화성')를 선택해 둔 상태
  elements.get('memo').value = '3:20 보이싱 집중 분석';
  tagButtons[0].listeners.click();
  assert.equal(tagButtons[0]['aria-pressed'], 'true');

  // 배너에서 1분 무료 키 발급 모달 열기 -> 키 저장
  elements.get('btnKeyGateModal').listeners.click();
  assert.equal(elements.get('geminiOnboardingModal').hidden, false);
  elements.get('gemModalKeyInput').value = 'AI' + 'za' + 'Z'.repeat(35);
  elements.get('gemModalKeyInput').listeners.input();
  await elements.get('btnModalSaveGemini').listeners.click();

  // 저장 직후: 미저장 URL, 태그, 메모가 날아가지 않고 그대로 유지되며 keyGateBox가 숨겨지고 submit이 즉시 활성화됨
  assert.equal(elements.get('url').value, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(elements.get('memo').value, '3:20 보이싱 집중 분석');
  assert.equal(tagButtons[0]['aria-pressed'], 'true');
  assert.equal(elements.get('keyGateBox').hidden, true);
  assert.equal(elements.get('submit').disabled, false);
});

test('R1-S7 & R1-S8: parseTimestampSec 검증 및 frontend/ 시크릿 패턴·인라인 스타일 0건 검증', () => {
  const parseTs = loadParseTimestampSec();
  assert.equal(parseTs('0:15'), 15);
  assert.equal(parseTs('03:20'), 200);
  assert.equal(parseTs('1:02:05'), 3725);
  assert.equal(parseTs(''), null);
  assert.equal(parseTs('abc'), null);

  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(?:ts|tsx|css|html)$/.test(e.name)) out.push(p);
    }
    return out;
  }
  const secretRe = /AIza[0-9A-Za-z_-]{30,}|\bntn_[A-Za-z0-9]{10,}/;
  for (const f of walk(path.join(ROOT, 'frontend'))) {
    const txt = fs.readFileSync(f, 'utf8');
    assert.equal(secretRe.test(txt), false, f + '에 실제 시크릿 모양 리터럴이 포함됨');
    assert.equal(/\bstyle\s*=\s*\{\{/.test(txt), false, f + '에 인라인 style={{ 속성이 포함됨');
    assert.equal(/\bdangerouslySetInnerHTML\s*=/.test(txt), false, f + '에 dangerouslySetInnerHTML 속성이 포함됨');
  }
});
