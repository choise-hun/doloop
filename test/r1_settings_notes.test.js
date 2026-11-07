// R1-2 설정(SettingsPage) · 노트(NotesPage/NoteDetailPage) · Gemini 1분 온보딩 모달 검증 테스트 (R1-S1 ~ R1-S8)
// M1-3c: React의 Gemini 키 칸·온보딩 모달은 삭제(서버 키 + 크레딧). 모달 검사는 레거시 public/*에만 남는다(롤백용, 손대지 않음)
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

test('R1-S2: <GeminiKeyOnboardingModal /> 삭제 검증 (M1-3c 서버 키 전환)', () => {
  // M1-3c: React 쪽 모달은 없어야 한다
  assert.ok(!fs.existsSync(path.join(ROOT, 'frontend/src/components/common/GeminiKeyOnboardingModal.tsx')), 'React Gemini 온보딩 모달은 삭제');
});

test('R1-S3: R1-2 신규 CSS Modules 3종 — 순백(#ffffff/#fff) 0건 및 중간 곡률 0건', () => {
  const cssFiles = [
    'frontend/src/pages/SettingsPage.module.css',
    'frontend/src/pages/NotesPage.module.css',
    'frontend/src/pages/NoteDetailPage.module.css',
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
    'credits', 'creditTier', 'creditMsg', 'creditTotal', 'creditBuckets', 'creditNext', 'notionKeyStatus', 'ntnSongsDb', 'ntnSessionsDb',
  ]) {
    assert.ok(settingsTsx.includes(`id="${id}"`), 'SettingsPage.tsx 누락 ID: ' + id);
  }
  // M1-3c: Gemini 키 칸(BYOK) 없음
  for (const id of ['keys', 'geminiKeyStatus', 'gemKey', 'gemModel', 'btnOpenGeminiModal']) {
    assert.ok(!settingsTsx.includes(`id="${id}"`), 'SettingsPage.tsx에 남은 Gemini 키 ID: ' + id);
  }
  assert.ok(!notesTsx.includes('btnKeyGateModal'), 'NotesPage.tsx 키 발급 버튼 삭제');

  for (const id of ['keyGateBox', 'keyGateMsg', 'form', 'url', 'preview', 'tags', 'memo', 'submit', 'jobs', 'notesList']) {
    assert.ok(notesTsx.includes(`id="${id}"`), 'NotesPage.tsx 누락 ID: ' + id);
  }

  for (const id of ['noteContent', 'noteHeader', 'noteTitle', 'noteMeta', 'noteHeadline', 'noteSections', 'notePractice', 'noteMemoInput', 'noteLoadingMsg']) {
    assert.ok(detailTsx.includes(`id="${id}"`), 'NoteDetailPage.tsx 누락 ID: ' + id);
  }

  for (const id of ['privH1', 'privH2', 'privH3', 'privH4']) {
    assert.ok(privacyTsx.includes(`id="${id}"`), 'PrivacyPage.tsx 누락 ID: ' + id);
  }
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

test('R1-S9 (PR #39 리뷰 반영): NotesPage 태그 필터 변경 시 잡 폴링 타이머 유지 및 최신 필터 참조 검증', async () => {
  const notesTsx = readText('frontend/src/pages/NotesPage.tsx');
  assert.ok(notesTsx.includes('const notesReqSeqRef = useRef(0);'), 'notesReqSeqRef 분리 필수');
  assert.ok(notesTsx.includes('const jobsReqSeqRef = useRef(0);'), 'jobsReqSeqRef 분리 필수');
  assert.ok(notesTsx.includes('const filterTagRef = useRef(filterTag);'), 'filterTagRef 선언 필수');
  assert.ok(notesTsx.includes('loadNotesOnly(filterTagRef.current, uid)'), '잡 완료 시 최신 filterTagRef 참조 필수');
  assert.ok(notesTsx.includes('const refreshJobsAndNotes = async (uid: string | null) =>'), 'refreshJobsAndNotes는 특정 tag를 캡처하지 않아야 함');
});

// SettingsPage.tsx의 notionDbIdFromInput 추출
function loadNotionDbIdFromInput() {
  const src = readText('frontend/src/pages/SettingsPage.tsx');
  const m = src.match(/function notionDbIdFromInput\(raw: string\): string \{[\s\S]*?\n\}/);
  assert.ok(m, 'notionDbIdFromInput 정의가 존재해야 함');
  const jsCode = m[0]
    .replace('function notionDbIdFromInput(raw: string): string', 'function notionDbIdFromInput(raw)')
    .replace('let pathname: string;', 'let pathname;')
    .concat('\nmodule.exports = notionDbIdFromInput;');
  const mod = { exports: {} };
  vm.runInNewContext(jsCode, { module: mod, URL });
  return mod.exports;
}

test('R1-S10: 노션 DB 링크를 붙여넣어도 DB ID만 저장하고, 템플릿 기준 연결 안내가 있다', () => {
  const f = loadNotionDbIdFromInput();
  const id = '8f539d9f76f84014af586a19f965d862';
  const view = '0123456789abcdef0123456789abcdef';
  assert.equal(f(`https://www.notion.so/${id}?v=${view}`), id, '?v= 보기 ID가 아니라 경로의 DB ID');
  assert.equal(f(`https://www.notion.so/myspace/Cafe-${id}?v=${view}&pvs=4`), id, '워크스페이스·제목 slug 포함');
  assert.equal(f(`https://app.notion.com/p/${id}?pvs=204`), id);
  assert.equal(f('https://www.notion.so/8f539d9f-76f8-4014-af58-6a19f965d862'), '8f539d9f-76f8-4014-af58-6a19f965d862');
  assert.equal(f(`  ${id}  `), id, 'ID 직접 입력은 공백만 제거');
  // 잘못된 입력: ID가 없는 링크는 그대로 넘겨 서버 400(32자리 형식 오류)으로
  assert.equal(f('https://www.notion.so/no-id-here'), 'https://www.notion.so/no-id-here');
  assert.equal(f(''), '');

  const src = readText('frontend/src/pages/SettingsPage.tsx');
  assert.match(src, /songsDb: notionDbIdFromInput\(ntnSongsDb\)/);
  assert.match(src, /sessionsDb: notionDbIdFromInput\(ntnSessionsDb\)/);
  assert.match(src, /notesDb: notionDbIdFromInput\(ntnNotesDb\) \|\| null/);
  const guide = src.match(/<ol className=[^>]* id="ntnGuide">[\s\S]*?<\/ol>/);
  assert.ok(guide, '노션 연결 안내 목록');
  assert.match(guide[0], /href=\{templateHref\}/, '안내 1단계가 공식 템플릿 링크');
  assert.equal((guide[0].match(/<li>/g) || []).length, 5);
  assert.match(readText('public/config.js'), /notionTemplateUrl: 'https:\/\/app\.notion\.com\/p\/4097a337e26f8167aa10eb435edb676e\?source=copy_link'/);
});

test('CH-7b: 노션 연동은 설정 맨 아래 고급 접힘 안으로 은닉(계획/앱_명세.md §5), 다른 화면의 노션 유도 없음', () => {
  const src = readText('frontend/src/pages/SettingsPage.tsx');
  const a = src.indexOf('id="advNotion"');
  const end = src.indexOf('</details>', a);
  assert.ok(a > 0 && end > a, '고급 설정 details가 있어야 함');
  assert.ok(src.indexOf('id="screen"') < a, '고급 설정은 화면 섹션 뒤(맨 아래)');
  for (const id of ['btnNotionTemplate', 'ntnGuide', 'ntnToken', 'btnSyncEnable', 'inpImportZip', 'nlPractice']) {
    const i = src.indexOf(`id="${id}"`);
    assert.ok(i > a && i < end, `${id}는 고급 설정 안에 있어야 함`);
  }
  assert.ok(src.indexOf('id="btnExportZip"') < a, '백업 ZIP 내보내기는 밖에 남음');
  assert.ok(!/<details[^>]*id="advNotion"[^>]*\sopen\s*>/.test(src) && src.includes("useState(() => ['#advanced', '#notion', '#links'].includes(window.location.hash))"), '기본 접힘, 노션 해시로 오면 펼침');
  const home = readText('frontend/src/pages/HomePage.tsx');
  assert.ok(!home.includes('노션 연결 →'));
  assert.match(home, /id="notionBig"[\s\S]{0,120}hidden=\{!mainNotionUrl\}/, 'NOTION 큰 링크는 주소가 있을 때만');
  assert.ok(!readText('frontend/src/pages/PracticePage.tsx').includes('노션 연결 설정'));
  assert.ok(!readText('frontend/src/pages/NotesPage.tsx').includes('노션에 자동 정리'));
});
