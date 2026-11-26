// NT-2a 학습 노트 워크스페이스(가짜 API): 노트북 선택·주소·뒤로 가기, 노트북 쓰기, 자료 올리기·보상, 무료/관리자, 계정 전환
// 명세: 개발산출물/명세/NT-2_구현명세.md §4·§8.1 (NT2A-W1·W2·U1·T1·R1)
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME, FIXTURES } = require('./support/mock-app');

const FID = (n) => `00000000-0000-4000-8000-0000000003f${n}`;
const DID = (n) => `00000000-0000-4000-8000-0000000004d${n}`;
const PRO_LIMITS = { ...DEFAULT_ME.limits, ai: true, drive: false, noteFolders: 15, noteDocs: 1000, noteFiles: true, fileBytes: 524288000 };
const PRO_ME = { tier: 'pro', billingTier: 'pro', limits: PRO_LIMITS, usage: { songs: 0, categories: 0, takeBytes: 0, takeSongs: 0, fileBytes: 1048576 }, credits: { monthly: 30, purchased: 0 } };

const folder = (n, name, color = null) => ({ id: FID(n), name, color, sortOrder: n, docCount: 0, aiNoteCount: 0, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' });
const doc = (n, folderId, over) => ({
  id: DID(n), kind: 'document', title: `자료 ${n}`, folderId, rev: 1, fileCount: 1,
  firstFile: { id: `00000000-0000-4000-8000-0000000005e${n}`, mime: 'application/pdf' },
  createdAt: '2026-11-21T00:00:00Z', updatedAt: `2026-11-2${n}T00:00:00Z`, ...over,
});
const aiNote = (id, title, folderId, createdAt) => ({ ...FIXTURES.note, id, title, folderId, createdAt });

function fixture() {
  return {
    folders: [folder(1, '재즈 화성', 'orange'), folder(2, '클래식 기타', 'slate'), folder(3, '레슨 숙제')],
    docs: [doc(1, FID(1)), doc(2, FID(1)), doc(3, FID(2))],
    notes: [
      aiNote('00000000-0000-4000-8000-000000000201', 'AI 노트 하나', FID(1), '2026-11-02T00:00:00Z'),
      aiNote('00000000-0000-4000-8000-000000000202', 'AI 노트 둘', null, '2026-11-01T00:00:00Z'),
    ],
  };
}

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });

/** 상태를 가진 가짜 노트 워크스페이스 API. calls에 [method, path, body]를 남긴다 */
function workspaceRoutes(db, calls, opts = {}) {
  const countOf = (f) => ({
    ...f,
    docCount: db.docs.filter((d) => d.folderId === f.id).length,
    aiNoteCount: db.notes.filter((n) => n.folderId === f.id).length,
  });
  return [
    [(url) => url.pathname.startsWith('/api/v1/note-folders'), async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const body = req.postDataJSON ? (() => { try { return req.postDataJSON(); } catch { return null; } })() : null;
      calls.push([req.method(), p, body]);
      if (opts.holdFolders) await opts.holdFolders(req);
      if (req.method() === 'GET') return json(route, { folders: db.folders.map(countOf) });
      if (req.method() === 'POST') {
        const f = folder(db.folders.length + 4, body.name, body.color ?? null);
        db.folders.push(f);
        return json(route, { folder: countOf(f) }, 201);
      }
      if (p.endsWith('/order')) {
        db.folders = body.ids.map((id) => db.folders.find((f) => f.id === id));
        return json(route, { folders: db.folders.map(countOf) });
      }
      const id = p.split('/').pop();
      if (req.method() === 'DELETE') {
        db.folders = db.folders.filter((f) => f.id !== id);
        db.docs.forEach((d) => { if (d.folderId === id) d.folderId = null; });
        db.notes.forEach((n) => { if (n.folderId === id) n.folderId = null; });
        return json(route, { ok: true });
      }
      const f = db.folders.find((x) => x.id === id);
      Object.assign(f, body);
      return json(route, { folder: countOf(f) });
    }],
    [(url) => url.pathname.startsWith('/api/v1/note-docs'), async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const isJson = (req.headers()['content-type'] || '').includes('application/json');
      const body = isJson ? req.postDataJSON() : null;
      calls.push([req.method(), p, body ?? (req.method() === 'POST' ? 'multipart' : null)]);
      if (req.method() === 'GET' && p === '/api/v1/note-docs') {
        if (opts.holdDocs) await opts.holdDocs(req);
        return json(route, { docs: opts.docsFor ? opts.docsFor() : db.docs });
      }
      if (req.method() === 'POST' && p === '/api/v1/note-docs') {
        const d = doc(db.docs.length + 5, body.folderId, { title: body.title, fileCount: 0, firstFile: null, updatedAt: '2026-11-30T00:00:00Z' });
        db.docs.push(d);
        return json(route, { doc: { ...d, body: {}, files: [] } }, 201);
      }
      const m = p.match(/^\/api\/v1\/note-docs\/([^/]+)(\/files)?$/);
      const d = m && db.docs.find((x) => x.id === m[1]);
      if (!d) return json(route, { code: 'NOT_FOUND', message: 'no' }, 404);
      if (m[2]) {
        if (opts.failUpload) return json(route, { code: 'STORAGE_ERROR', message: 'fail' }, 503);
        d.fileCount += 1;
        const file = { id: `00000000-0000-4000-8000-00000000060${d.fileCount}`, docId: d.id, storage: 'supabase', fileName: `f${d.fileCount}.pdf`, mime: 'application/pdf', sizeBytes: 9, sortOrder: d.fileCount - 1, createdAt: '2026-11-30T00:00:00Z' };
        d.files = [...(d.files || []), file];
        d.firstFile = d.firstFile || { id: file.id, mime: file.mime };
        return json(route, { file }, 201);
      }
      if (req.method() === 'DELETE') {
        db.docs = db.docs.filter((x) => x.id !== d.id);
        return json(route, { ok: true });
      }
      if (req.method() === 'PATCH') {
        Object.assign(d, body);
        return json(route, { doc: { ...d, body: {}, files: d.files || [] } });
      }
      return json(route, { doc: { ...d, body: {}, files: d.files || [] } });
    }],
    [(url) => /^\/api\/v1\/notes\/[^/]+\/folder$/.test(url.pathname), (route) => {
      const req = route.request();
      const id = new URL(req.url()).pathname.split('/')[4];
      const body = req.postDataJSON();
      calls.push([req.method(), new URL(req.url()).pathname, body]);
      const n = db.notes.find((x) => x.id === id);
      n.folderId = body.folderId;
      return json(route, { note: n });
    }],
  ];
}

async function open(page, { me = PRO_ME, db = fixture(), calls = [], width = 1280, opts = {}, path = '/notes.html', extraRoutes = [] } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await mockApp(page, { ...STATES.user, me, notes: db.notes, routes: [...workspaceRoutes(db, calls, opts), ...extraRoutes] });
  await page.goto(path, { waitUntil: 'load' });
  return (await page.locator('#root').count()) > 0;
}

const cards = (page) => page.locator('#notesList .note-card');

test('NT2A-W1 ★ 전체 5개 · 노트북 선택 · ?folder=none · 뒤로 가기 복원', async ({ page }) => {
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(5);
  // 최근순: 자료(updatedAt 11-23·22·21) 다음 AI(createdAt 11-02·01)
  await expect(cards(page).first()).toContainText('자료 3');
  await page.locator(`#noteFolders [data-folder-pick="${FID(1)}"]`).click();
  await expect(cards(page)).toHaveCount(3);
  await expect(page).toHaveURL(new RegExp(`folder=${FID(1)}`));
  await expect(page.locator('#noteFolderHead h2')).toHaveText('재즈 화성');
  await expect(page.locator(`#noteFolders [data-folder-pick="${FID(1)}"]`)).toContainText('3'); // docCount 2 + aiNoteCount 1
  await page.locator('#noteFolders [data-folder-pick="none"]').click();
  await expect(page).toHaveURL(/folder=none/);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('AI 노트 둘');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`folder=${FID(1)}`));
  await expect(cards(page)).toHaveCount(3);
  // 종류 필터: 자료만 → 2개, 태그 필터는 AI 영상일 때만
  await page.locator('#noteKindFilter [data-kind="doc"]').click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('#noteTagFilter')).toBeHidden();
  await page.locator('#noteKindFilter [data-kind="ai"]').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('#noteTagFilter')).toBeVisible();
  // 주소로 바로 들어와도 그 노트북
  await page.goto(`/notes.html?folder=${FID(2)}`, { waitUntil: 'load' });
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('자료 3');
  // 카드 링크: 자료 → note.html?doc=, AI → note.html?id=
  await expect(cards(page).first().locator('.note-card-title a')).toHaveAttribute('href', `note.html?doc=${DID(3)}`);
});

test('NT2A-W2 노트북 만들기 · ↑↓ 순서(전체 id) · 삭제 뒤 기본 노트북 · AI 노트 이동', async ({ page }) => {
  const calls = [];
  const db = fixture();
  test.skip(!(await open(page, { db, calls })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(5);
  await page.locator('#noteFolderAddBtn').click();
  await page.locator('#noteFolderName').fill('새 노트북');
  await page.locator('#noteFolderDialog [data-color-opt="sage"]').click();
  await page.locator('#noteFolderSubmit').click();
  await expect(page.locator('#noteFolderDialog')).toHaveCount(0);
  await expect(page.locator('#noteFolders')).toContainText('새 노트북');
  expect(calls.find((c) => c[0] === 'POST' && c[1] === '/api/v1/note-folders')[2]).toEqual({ name: '새 노트북', color: 'sage' });

  await page.locator(`[data-folder-down="${FID(1)}"]`).click();
  await expect.poll(() => calls.filter((c) => c[1] === '/api/v1/note-folders/order').length).toBe(1);
  const order = calls.find((c) => c[1] === '/api/v1/note-folders/order')[2].ids;
  expect(order).toEqual([FID(2), FID(1), FID(3), db.folders[3].id]);

  // AI 노트(기본 노트북)를 레슨 숙제로 이동
  const ai = page.locator('[data-note-id="00000000-0000-4000-8000-000000000202"]');
  await ai.locator('[data-card-menu]').click();
  await ai.locator('[data-card-action="move"]').click();
  await ai.locator('select').selectOption(FID(3));
  await ai.getByRole('button', { name: '이동', exact: true }).click();
  await expect.poll(() => calls.some((c) => c[0] === 'PUT' && c[1].endsWith('/folder'))).toBe(true);
  expect(calls.find((c) => c[1].endsWith('/folder'))[2]).toEqual({ folderId: FID(3) });

  // 재즈 화성 삭제 → 안의 노트(AI 1 · 자료 2)는 기본 노트북으로
  await page.locator(`#noteFolders [data-folder-pick="${FID(1)}"]`).click();
  page.once('dialog', (d) => d.accept());
  await page.locator('#noteFolderDelete').click();
  await expect(page.locator(`#noteFolders [data-folder-pick="${FID(1)}"]`)).toHaveCount(0);
  await page.locator('#noteFolders [data-folder-pick="none"]').click();
  await expect(cards(page)).toHaveCount(3);
});

const PDF = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%nt2a\n') });

test('NT2A-U1 ★ 업로드: 노트 생성 → 파일 2개 multipart → 그리드 맨 앞 · /me 다시 받음', async ({ page }) => {
  const calls = [];
  let meCalls = 0;
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/v1/me') meCalls += 1; });
  test.skip(!(await open(page, { calls })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(5);
  await page.locator(`#noteFolders [data-folder-pick="${FID(2)}"]`).click();
  await page.locator('#noteUploadBtn').click();
  await expect(page.locator('#noteUploadDialog')).toBeVisible();
  await page.setInputFiles('#noteUploadInput', [PDF('ii-V-I 발췌.pdf'), PDF('보이싱.pdf')]);
  await expect(page.locator('#noteUploadDocTitle')).toHaveValue('ii-V-I 발췌');
  await expect(page.locator('#noteUploadFolder')).toHaveValue(FID(2)); // 지금 고른 노트북이 기본값
  const meBefore = meCalls;
  await page.locator('#noteUploadSubmit').click();
  await expect(page.locator('#noteUploadDialog')).toHaveCount(0);
  const posts = calls.filter((c) => c[0] === 'POST' && c[1].startsWith('/api/v1/note-docs'));
  expect(posts[0]).toEqual(['POST', '/api/v1/note-docs', { kind: 'document', title: 'ii-V-I 발췌', folderId: FID(2) }]);
  expect(posts.slice(1).map((c) => c[2])).toEqual(['multipart', 'multipart']);
  await expect(cards(page).first()).toContainText('ii-V-I 발췌');
  await expect(cards(page).first()).toContainText('파일 2');
  await expect.poll(() => meCalls).toBeGreaterThan(meBefore);
});

test('NT2A-U1 ★ 업로드 보상: 첫 파일부터 실패하면 방금 만든 빈 노트를 DELETE', async ({ page }) => {
  const calls = [];
  test.skip(!(await open(page, { calls, opts: { failUpload: true } })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(5);
  await page.locator('#noteUploadBtn').click();
  await page.setInputFiles('#noteUploadInput', [PDF('실패.pdf')]);
  await page.locator('#noteUploadSubmit').click();
  await expect(page.locator('#noteUploadError')).toHaveText('지금 파일을 저장할 수 없습니다. 잠시 뒤 다시 시도하세요.');
  const created = calls.find((c) => c[0] === 'POST' && c[1] === '/api/v1/note-docs');
  expect(created).toBeTruthy();
  await expect.poll(() => calls.some((c) => c[0] === 'DELETE' && c[1].startsWith('/api/v1/note-docs/'))).toBe(true);
  await page.locator('#noteUploadCancel').click();
  await expect(cards(page)).toHaveCount(5); // 빈 노트가 그리드에 남지 않는다
});

test('NT2A-T1 ★ 무료: 필·노트북 버튼 · PRO, 누르면 안내(요청 0건) · 노트북은 전체·기본만', async ({ page }) => {
  const calls = [];
  const db = { folders: [], docs: [], notes: [aiNote('00000000-0000-4000-8000-000000000201', 'AI 노트 하나', null, '2026-11-02T00:00:00Z')] };
  const FREE_ME = { limits: { ...DEFAULT_ME.limits, noteFolders: 0, noteDocs: 30, noteFiles: false, fileBytes: 20971520 }, usage: { songs: 0, categories: 0, takeBytes: 0, takeSongs: 0, fileBytes: 0 } };
  test.skip(!(await open(page, { me: FREE_ME, db, calls })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('#noteUploadBtn')).toContainText('· PRO');
  await expect(page.locator('#noteFolderAddBtn')).toContainText('· PRO');
  await expect(page.locator('#noteFreeNotice')).toBeVisible();
  await expect(page.locator('#noteFolders [data-folder-pick]')).toHaveCount(2);
  await page.locator('#noteUploadBtn').click();
  await expect(page.locator('#noteProDialog')).toContainText('PDF·이미지 자료 노트는 PRO부터');
  await expect(page.locator('#noteUploadDialog')).toHaveCount(0);
  await page.locator('#noteProDialog button').click();
  await page.locator('#noteFolderAddBtn').click();
  await expect(page.locator('#noteProDialog')).toContainText('노트북 나누기는 PRO부터');
  expect(calls.filter((c) => c[0] !== 'GET')).toEqual([]);
});

test('NT2A-T1 ★ 관리자(한도 null): · PRO·한도 문구 없음, 사용량 숫자만', async ({ page }) => {
  const OWNER_ME = {
    role: 'owner', tier: 'pro', limits: { ...PRO_LIMITS, noteFolders: null, noteDocs: null, fileBytes: null },
    usage: { songs: 0, categories: 0, takeBytes: 0, takeSongs: 0, fileBytes: 734003200 },
  };
  test.skip(!(await open(page, { me: OWNER_ME })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(5);
  await expect(page.locator('#noteUploadBtn')).not.toContainText('PRO');
  await expect(page.locator('#noteFolderAddBtn')).not.toContainText('PRO');
  await expect(page.locator('#noteQuota')).toContainText('파일 저장 700MB');
  await expect(page.locator('#noteQuota')).not.toContainText('/');
  await expect(page.locator('#noteQuota [role="img"]')).toHaveCount(0);
  await expect(page.locator('#noteFolders')).not.toContainText(' / ');
});

test('NT2A-R1 ★ 계정 A→B: 붙잡힌 A 목록 응답은 버리고 B 목록만, 열린 업로드 대화상자는 닫힘', async ({ page }) => {
  const bId = '00000000-0000-4000-8000-000000000002';
  let account = 'A';
  let releaseA = null;
  const db = fixture();
  const B_DOCS = [doc(9, null, { title: 'B 자료' })];
  const aHeld = new Promise((resolve) => { releaseA = resolve; });
  let heldOnce = false;
  const opts = {
    holdDocs: async () => {
      if (account === 'A' && !heldOnce) {
        heldOnce = true;
        await aHeld;
      }
    },
    docsFor: () => (account === 'B' ? B_DOCS : db.docs),
  };
  const meRoute = [(url) => url.pathname === '/api/v1/me', (route) => json(route, { ...DEFAULT_ME, ...PRO_ME, id: account === 'B' ? bId : DEFAULT_ME.id })];
  const bNotes = [(url) => url.pathname === '/api/v1/notes', (route) => json(route, { notes: account === 'B' ? [] : db.notes })];
  test.skip(!(await open(page, { db, opts, extraRoutes: [meRoute, bNotes] })), 'legacy 모드: React 화면 아님');
  await expect(cards(page)).toHaveCount(2); // A의 AI 노트만(자료 목록 응답은 붙잡혀 있다)
  await page.locator('#noteUploadBtn').click();
  await expect(page.locator('#noteUploadDialog')).toBeVisible();

  account = 'B';
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await expect(page.locator('#noteUploadDialog')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('B 자료');

  // 이제 A의 늦은 응답(자료 3개)을 푼다 → 응답이 브라우저에 도착한 뒤에도 화면에 반영되지 않는다
  const aFinished = new Promise((resolve) => {
    const done = (r) => {
      if (new URL(r.url()).pathname === '/api/v1/note-docs' && (r.headers().authorization || '').includes('fake-jwt-token')) resolve();
    };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
  });
  releaseA();
  await aFinished;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // 응답 처리 뒤 렌더 두 번
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('#notesList')).not.toContainText('자료 1');
});
