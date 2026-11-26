// NT-2a: 학습 노트 워크스페이스 순수 함수(frontend/src/lib/noteWorkspace.mts) — 명세/NT-2_구현명세.md §4.3·§8.1 NT2A-U2·U3
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let W;
let I18N;
let DICTS;
before(async () => {
  W = await import('../frontend/src/lib/noteWorkspace.mts');
  I18N = await import('../frontend/src/lib/i18n.mts');
  const [ko, en, ja] = await Promise.all([
    import('../frontend/src/lib/i18n/ko.mts'),
    import('../frontend/src/lib/i18n/en.mts'),
    import('../frontend/src/lib/i18n/ja.mts'),
  ]);
  DICTS = { ko: ko.KO, en: en.EN, ja: ja.JA };
});

const MB = 1024 * 1024;
const f = (name, size, type) => ({ name, size, type: type ?? '' });

test('NT2A-U2 사전 검사: .svg·0바이트·21MB(RE:DO)·21번째 파일 거부, 21MB는 Drive면 허용', () => {
  let c = W.checkUploadFiles([f('a.pdf', 1000, 'application/pdf'), f('b.JPEG', 10, 'image/jpeg'), f('c.webp', 5), f('d.png', 5, 'image/png')], 'supabase', null);
  assert.deepEqual(c.issues, ['', '', '', '']);
  assert.equal(c.ok, true);

  c = W.checkUploadFiles([f('x.svg', 10, 'image/svg+xml'), f('y.pdf', 0), f('z.pdf', 21 * MB)], 'supabase', null);
  assert.deepEqual(c.issues, ['type', 'empty', 'big']);
  assert.equal(c.ok, false);
  assert.equal(c.needsDrive, true);

  // 확장자는 pdf인데 브라우저가 알려 준 형식이 다르면 거부, 형식이 비면 확장자로만 본다
  assert.deepEqual(W.checkUploadFiles([f('fake.pdf', 10, 'image/png'), f('noext', 10)], 'supabase', null).issues, ['type', 'type']);

  c = W.checkUploadFiles([f('z.pdf', 21 * MB)], 'drive', null);
  assert.deepEqual(c.issues, ['']);
  assert.equal(c.ok, true);
  assert.deepEqual(W.checkUploadFiles([f('huge.pdf', 2 * 1024 * MB + 1)], 'drive', null).issues, ['driveBig']);

  const many = Array.from({ length: 21 }, (_, i) => f(`p${i}.pdf`, 10));
  c = W.checkUploadFiles(many, 'supabase', null);
  assert.equal(c.tooMany, true);
  assert.equal(c.ok, false);
  assert.equal(W.checkUploadFiles(many.slice(0, 20), 'supabase', null).ok, true);

  // 남은 용량: 앞 파일부터 빼며 넘는 파일만 표시(RE:DO만)
  assert.deepEqual(W.checkUploadFiles([f('a.pdf', 6 * MB), f('b.pdf', 6 * MB)], 'supabase', 10 * MB).issues, ['', 'quota']);
  assert.deepEqual(W.checkUploadFiles([f('a.pdf', 6 * MB), f('b.pdf', 6 * MB)], 'drive', 10 * MB).issues, ['', '']);
  assert.equal(W.checkUploadFiles([], 'supabase', null).ok, false);
});

test('NT2A-U3 오류 코드 7종 → §4.3 문구(ko), 업그레이드·Drive 제안 표시', () => {
  I18N.setLang('ko');
  const err = (code, detail, status = 400) => ({ code, status, data: { code, detail } });
  let r = W.describeUploadError(err('TIER_UPGRADE_REQUIRED', { feature: 'note_files', tier: 'free', nextTier: 'pro' }, 403));
  assert.equal(r.text, 'PRO부터 쓸 수 있습니다.');
  assert.equal(r.upgrade, true);

  r = W.describeUploadError(err('NOTE_DOC_LIMIT_EXCEEDED', { limit: 1000, used: 1000, tier: 'pro', nextTier: 'pro_plus', nextLimit: 2000 }, 403));
  assert.equal(r.text, '노트는 1000개까지 만들 수 있습니다 · PRO+는 2000개');
  r = W.describeUploadError(err('NOTE_FOLDER_LIMIT_EXCEEDED', { limit: 30, used: 30, tier: 'pro_plus', nextTier: null, nextLimit: null }, 403));
  assert.equal(r.text, '노트북은 30개까지 만들 수 있습니다');

  assert.equal(W.describeUploadError(err('NOTE_FILE_COUNT_EXCEEDED', {})).text, '노트 하나에 파일은 20개까지입니다.');

  r = W.describeUploadError(err('NOTE_FILE_TOO_LARGE', {}, 413));
  assert.equal(r.text, 'RE:DO 저장공간에는 20MB 이하만 올릴 수 있습니다. 큰 파일은 Drive에 저장하세요.');
  assert.equal(r.suggestDrive, true);

  r = W.describeUploadError(err('FILE_QUOTA_EXCEEDED', { limitBytes: 524288000, usedBytes: 327155712, tier: 'pro' }, 413), 220200960);
  assert.equal(r.text, '파일 저장 한도(500MB)를 넘습니다. 지금 312MB 사용 중 · 이 파일 210MB. Drive에 저장하거나 다른 첨부·TAB 악보를 지우면 올릴 수 있습니다.');
  assert.equal(r.suggestDrive, true);

  assert.equal(W.describeUploadError(err('INVALID_NOTE_FILE', { allowed: 'pdf,png,jpg,jpeg,webp' })).text, 'PDF·PNG·JPEG·WebP 파일만 올릴 수 있습니다.');
  const storage = '지금 파일을 저장할 수 없습니다. 잠시 뒤 다시 시도하세요.';
  assert.equal(W.describeUploadError(err('STORAGE_UNAVAILABLE', null, 503)).text, storage);
  assert.equal(W.describeUploadError(err('STORAGE_ERROR', null, 502)).text, storage);
  assert.equal(W.describeUploadError(null).text, storage);
});

test('NT2A-U3 i18n: notes.ws.*·notes.upload.* 키가 ko·en·ja에 모두 있고 tab.quota는 합산 문구', () => {
  const keys = Object.keys(DICTS.ko).filter((k) => k.startsWith('notes.ws.') || k.startsWith('notes.upload.'));
  assert.ok(keys.length > 50);
  for (const lang of ['en', 'ja']) {
    const missing = keys.filter((k) => typeof DICTS[lang][k] !== 'string' || !DICTS[lang][k]);
    assert.deepEqual(missing, [], lang);
  }
  for (const k of Object.values(W.FILE_ISSUE_KEY)) assert.ok(DICTS.ko[k], k);
  assert.match(DICTS.ko['tab.quota'], /파일 저장 한도/);
  assert.match(DICTS.en['tab.quota'], /file storage limit/);
  assert.match(DICTS.ja['tab.quota'], /ファイル保存上限/);
});

test('NT2A 그리드 합치기·노트북 주소·순서 이동·크기 표기', () => {
  const notes = [
    { id: 'a1', folderId: 'f1', createdAt: '2026-11-02T00:00:00Z' },
    { id: 'a2', folderId: null, createdAt: '2026-11-05T00:00:00Z' },
  ];
  const docs = [
    { id: 'd1', kind: 'document', folderId: 'f1', updatedAt: '2026-11-04T00:00:00Z' },
    { id: 'd2', kind: 'block', folderId: null, updatedAt: '2026-11-03T00:00:00Z' },
  ];
  assert.deepEqual(W.workspaceItems(notes, docs, 'all', 'all').map((i) => i.key), ['ai:a2', 'doc:d1', 'doc:d2', 'ai:a1']);
  assert.deepEqual(W.workspaceItems(notes, docs, 'f1', 'all').map((i) => i.key), ['doc:d1', 'ai:a1']);
  assert.deepEqual(W.workspaceItems(notes, docs, 'none', 'all').map((i) => i.key), ['ai:a2', 'doc:d2']);
  assert.deepEqual(W.workspaceItems(notes, docs, 'all', 'doc').map((i) => i.key), ['doc:d1']); // 블록은 '자료'에 안 나온다
  assert.deepEqual(W.workspaceItems(notes, docs, 'all', 'ai').map((i) => i.key), ['ai:a2', 'ai:a1']);

  const id = '00000000-0000-4000-8000-0000000003f1';
  assert.equal(W.folderFromSearch(`?folder=${id}`), id);
  assert.equal(W.folderFromSearch('?folder=none'), 'none');
  assert.equal(W.folderFromSearch('?folder=../x'), 'all');
  assert.equal(W.folderFromSearch(''), 'all');
  assert.equal(W.folderToQuery('all'), null);

  assert.deepEqual(W.moveId(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
  assert.equal(W.moveId(['a', 'b'], 'a', -1), null);

  assert.equal(W.formatBytes(20 * MB), '20MB');
  assert.equal(W.formatBytes(1.5 * 1024 * MB), '1.5GB');
  assert.equal(W.foldKey('orange'), 'orange');
  assert.equal(W.foldKey('purple'), 'none');
  assert.equal(W.defaultNoteTitle('Real Book.v2.pdf'), 'Real Book.v2');
  assert.equal(W.noteFileMime('A.JPG'), 'image/jpeg');
});
