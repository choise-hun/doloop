// CH-5 CHORDS 코드 진행 모음: 메뉴 · 범위 토글 · 입력 3종(직접·붙여넣기·영상) · 수정·삭제 · 노트 상세 수집 토글 · 4폭 배치
// 설계: 개발산출물/결과/CH-1a_프레임.md §2, CH-1b_설계.md §3. API는 테스트 안의 가짜 저장소로 흉내 낸다. React 화면 전용(legacy 모드는 skip)
'use strict';
const { test, expect } = require('@playwright/test');

const UID = '00000000-0000-4000-8000-000000000001';
const NOTE_ID = '00000000-0000-4000-8000-0000000000aa';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

function apiError(route, status, code, message) {
  return json(route, { ok: false, source: 'server', status, code, message, retryAfter: null }, status);
}

function row(over) {
  return {
    kind: 'reference',
    origin: 'manual',
    route: 'manual',
    evidence: null,
    title: '',
    part: '',
    artist: '',
    album: '',
    channel: '',
    releaseDate: null,
    key: null,
    instrument: null,
    chords: [],
    moods: [],
    genres: [],
    tags: [],
    url: '',
    videoId: null,
    startSec: null,
    endSec: null,
    memo: '',
    noteId: null,
    createdAt: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    ...over,
  };
}

const AI_ROW = row({
  id: '00000000-0000-4000-8000-0000000000b1',
  kind: 'analysis',
  origin: 'ai',
  route: 'video',
  evidence: '화면',
  title: '네오소울 진행',
  part: '인트로',
  channel: '채널A',
  key: 'F Major',
  instrument: '건반',
  chords: [
    { symbol: 'FM9', roman: 'IM9', source: '화면', timestamp: '0:42' },
    { symbol: 'Dm9', roman: 'vim9', source: '화면', timestamp: '0:44' },
  ],
  url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  videoId: 'jNQXAC9IVRw',
  startSec: 42,
  endSec: 60,
  noteId: NOTE_ID,
});

// docs/03-api-spec.md 8.5 규칙만큼만 흉내 내는 가짜 저장소
function fakeStore(initial = []) {
  let seq = 0;
  const items = initial.map((x) => ({ ...x }));
  const calls = [];
  const jobs = [];
  let jobPolls = 0;
  let noteCollect = false;
  return {
    items,
    calls,
    async handle(route) {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const method = req.method();
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      calls.push({ method, path: p, body });
      if (p === '/api/v1/progressions' && method === 'GET') return json(route, { progressions: items });
      if (p === '/api/v1/progressions' && method === 'POST') {
        if (!body.title) return apiError(route, 400, 'INVALID_INPUT', 'title은 1~300자여야 합니다.');
        seq += 1;
        const r = row({ ...body, id: `00000000-0000-4000-8000-0000000001${String(seq).padStart(2, '0')}`, origin: 'manual', route: 'manual' });
        items.unshift(r);
        return json(route, { progression: r }, 201);
      }
      if (p === '/api/v1/progressions/analyze' && method === 'POST') {
        jobs.push({ id: '00000000-0000-4000-8000-0000000000j1', kind: 'progression', url: body.url, tags: ['화성'], status: 'queued', error: null, noteId: null, createdAt: new Date().toISOString() });
        return json(route, { jobId: jobs[0].id, status: 'queued' }, 202);
      }
      if (p === '/api/v1/notes/jobs' && method === 'GET') {
        // 두 번째 조회부터 완료 + 진행 2개 생성
        if (jobs.length && jobPolls++ >= 1 && jobs[0].status !== 'done') {
          jobs[0].status = 'done';
          jobs[0].noteId = '00000000-0000-4000-8000-0000000000n2';
          items.unshift(
            row({ ...AI_ROW, id: '00000000-0000-4000-8000-0000000000c1', noteId: jobs[0].noteId, title: '새 영상 진행 1' }),
            row({ ...AI_ROW, id: '00000000-0000-4000-8000-0000000000c2', noteId: jobs[0].noteId, title: '새 영상 진행 2' })
          );
        }
        return json(route, { jobs: [...jobs, { id: 'note-job', kind: 'note', url: 'https://youtu.be/x', tags: ['리듬'], status: 'running', createdAt: '2026-11-04T00:00:00Z' }] });
      }
      if (p === `/api/v1/notes/${NOTE_ID}/collect` && method === 'PUT') {
        noteCollect = body.collect === true;
        if (noteCollect) {
          if (!items.some((x) => x.noteId === NOTE_ID)) items.push({ ...AI_ROW, route: 'note' }, row({ ...AI_ROW, id: '00000000-0000-4000-8000-0000000000b2', route: 'note', origin: 'manual' }));
        } else {
          for (let i = items.length - 1; i >= 0; i--) if (items[i].noteId === NOTE_ID) items.splice(i, 1);
        }
        return json(route, { noteId: NOTE_ID, collect: noteCollect, progressions: items.filter((x) => x.noteId === NOTE_ID) });
      }
      if (p === `/api/v1/notes/${NOTE_ID}` && method === 'GET') {
        return json(route, {
          note: {
            id: NOTE_ID, videoId: 'jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', title: '화성 노트', channel: '채널A',
            tags: ['화성'], memo: '', headline: '', points: [], keywords: [], difficulty: null, model: 'gemini', collectProgressions: noteCollect,
            createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z', analysis: { harmony: { progressions: [{ name: '인트로', chords: [] }] } }, diagramsSvg: [],
          },
        });
      }
      const m = /^\/api\/v1\/progressions\/([^/]+)$/.exec(p);
      if (m) {
        const it = items.find((x) => x.id === m[1]);
        if (!it) return apiError(route, 404, 'NOT_FOUND', '코드 진행을 찾을 수 없습니다.');
        if (method === 'PATCH') {
          if (body.kind === 'reference' && it.route !== 'manual') return apiError(route, 400, 'INVALID_INPUT', '영상에서 온 진행은 레퍼런스로 바꿀 수 없습니다.');
          Object.assign(it, body, { updatedAt: new Date().toISOString() });
          if (body.chords || body.key !== undefined) Object.assign(it, { origin: 'manual', evidence: null });
          return json(route, { progression: it });
        }
        if (method === 'DELETE') {
          items.splice(items.indexOf(it), 1);
          return json(route, { ok: true });
        }
      }
      return json(route, {});
    },
  };
}

// 가짜 인증 (home-category.spec.js setupLoggedIn에서 옮김)
async function setupLoggedIn(page, store, { gemini = false } = {}) {
  await page.route(
    (url) => url.pathname.endsWith('.html') || url.pathname === '/',
    async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const body = text.replace(/\sintegrity="[^"]*"/g, '');
      await route.fulfill({ response, body, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) } });
    }
  );
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@.*/, async (route) => {
    const stub = `
      window.supabase = {
        createClient: function() {
          const fakeSession = { access_token: 'fake-jwt-token', user: { id: '${UID}', email: 'a@example.com', user_metadata: {} } };
          return {
            auth: {
              getSession: async function() { return { data: { session: fakeSession }, error: null }; },
              onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; },
              signInWithOAuth: async function() { return { error: null }; },
              signOut: async function() { return { error: null }; }
            }
          };
        }
      };
    `;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: stub });
  });
  await page.route((url) => url.pathname.startsWith('/api/v1/'), (route) => store.handle(route));
  await page.route((url) => url.pathname.startsWith('/api/v1/me'), (route) =>
    json(route, {
      id: UID, email: 'a@example.com', displayName: 'Tester', role: 'user', storageProvider: 'supabase', driveFolderId: null,
      takeUsedBytes: 0, takeQuotaBytes: 209715200, migratedLocalAt: '2026-10-30T00:00:00Z',
      keys: { notion: null, gemini: gemini ? { hint: 'AIza…abcd', updatedAt: '2026-11-04T00:00:00Z' } : null },
    })
  );
}

async function open(page, path = '/progressions.html') {
  await page.route(/youtube\.com|ytimg\.com|doubleclick\.net/, (route) => route.abort());
  await page.goto(path, { waitUntil: 'load' });
  if ((await page.locator('#root').count()) === 0) return false;
  await page.locator('#progScope').waitFor();
  return true;
}

const rows = (page) => page.locator('#progList > li');

test('P1 비로그인: CHORDS 메뉴 활성, 기본 시드 범위 토글, 진행 넣기는 로그인 안내', async ({ page }) => {
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  const nav = page.locator('nav a', { hasText: 'CHORDS' });
  await expect(nav).toHaveAttribute('href', 'progressions.html');
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#progSeedNote')).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'reference');
  await page.locator('#progScope [data-scope="analysis"]').click();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).first()).toHaveAttribute('data-kind', 'analysis');
  expect(page.url()).toContain('scope=analysis');
  await page.locator('#progScope [data-scope="all"]').click();
  await expect(rows(page)).toHaveCount(10);
  // 시드도 연습실 링크는 있고 수정은 없다
  await rows(page).first().locator('button[aria-expanded]').click();
  await expect(rows(page).first().locator('[data-act="play"]')).toHaveAttribute('href', /^chords\.html#prog\?c=/);
  await expect(rows(page).first().locator('[data-act="edit"]')).toHaveCount(0);
  await page.locator('#progAddBtn').click();
  await expect(page.locator('#progLoginGate')).toContainText('로그인하면 진행을 모을 수 있어요');
});

test('P2 직접 입력: 칩·키 추정·로마숫자 → 저장 → 저장 직후 연습실 안내, 빈 제목은 막음', async ({ page }) => {
  const store = fakeStore();
  await setupLoggedIn(page, store);
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await expect(page.locator('#progEmpty')).toContainText('아직 모은 진행이 없어요');
  await page.locator('#progAddBtn').click();
  await page.locator('#progTab-manual').click();
  await expect(page.getByTestId('readingGuide')).toBeVisible();

  await page.locator('#new-chords').fill('C - Am - F - G7 H7');
  const chips = page.getByTestId('new-chips').locator('li');
  await expect(chips).toHaveCount(5);
  await expect(chips.nth(4)).toHaveAttribute('data-ok', '0');
  await expect(page.locator('#new-key')).toHaveValue('C Major');
  await expect(page.locator('#new-roman')).toHaveText('I - vi - IV - V7 - ?');

  // 잘못된 입력: 제목 없음 → 요청 안 보냄
  await page.locator('#new-submit').click();
  await expect(page.locator('#new-msg')).toHaveText('곡 제목을 입력하세요.');
  expect(store.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

  await page.locator('#new-chords').fill('C - Am - F - G7');
  await page.locator('#new-title').fill('My Song');
  await page.locator('#new-artist').fill('Me');
  await page.locator('#new-key').selectOption('A min');
  await expect(page.locator('#new-roman')).toHaveText('bIII - i - bVI - bVII7');
  await page.locator('#new-submit').click();

  await expect(page.locator('#progSavedBanner')).toContainText('방금 넣은 진행, 연습실에서 바로 연주해볼까요?');
  await expect(page.locator('#progSavedBanner a')).toHaveAttribute('href', /^chords\.html#prog\?c=C%2CAm%2CF%2CG7&k=A\+min&t=My\+Song&from=/);
  await expect(rows(page)).toHaveCount(1);
  const post = store.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/progressions');
  expect(post.body).toMatchObject({ kind: 'reference', title: 'My Song', artist: 'Me', key: 'A min' });
  expect(post.body.chords).toEqual([
    { symbol: 'C', roman: 'bIII' },
    { symbol: 'Am', roman: 'i' },
    { symbol: 'F', roman: 'bVI' },
    { symbol: 'G7', roman: 'bVII7' },
  ]);
  await expect(page.locator('#new-title')).toHaveValue(''); // 폼 비움
});

test('P3 수정·삭제: 메모만 바꾸면 memo만 PATCH, 영상 행은 레퍼런스 불가, 삭제 확인', async ({ page }) => {
  const store = fakeStore([AI_ROW]);
  await setupLoggedIn(page, store);
  test.skip(!(await open(page, '/progressions.html?scope=analysis')), 'legacy 모드: React 화면 아님');
  const r = rows(page).first();
  await expect(r).toContainText('네오소울 진행');
  await expect(r).toContainText('F Major · AI · 근거 화면');
  await expect(r.locator('[data-act="loop"]')).toHaveAttribute('href', 'practice.html?v=jNQXAC9IVRw&t=42');
  await expect(r.locator('[data-act="note"]')).toHaveAttribute('href', `note.html?id=${NOTE_ID}`);
  await r.locator('button[aria-expanded]').click();
  await expect(r).toContainText('0:42');
  await r.locator('[data-act="edit"]').click();
  const pre = 'edit-00000000';
  await expect(page.getByRole('button', { name: '레퍼런스' }).last()).toBeDisabled();
  await page.locator(`#${pre}-memo`).fill('좋은 진행');
  await page.locator(`#${pre}-submit`).click();
  await expect(r).toContainText('좋은 진행');
  const patch = store.calls.find((c) => c.method === 'PATCH');
  expect(patch.body).toEqual({ memo: '좋은 진행' });

  // 코드를 바꾸면 "직접"으로 바뀐다는 확인 → 수락
  await r.locator('[data-act="edit"]').click();
  await page.locator(`#${pre}-chords`).fill('FM9 Bb7');
  page.once('dialog', (d) => d.accept());
  await page.locator(`#${pre}-submit`).click();
  await expect(r).toContainText('F Major · 직접');
  const patch2 = store.calls.filter((c) => c.method === 'PATCH')[1];
  expect(patch2.body.chords).toEqual([
    { symbol: 'FM9', roman: 'IM9', timestamp: '0:42' },
    { symbol: 'Bb7', roman: 'IV7' },
  ]);

  page.once('dialog', (d) => d.accept());
  await r.locator('[data-act="delete"]').click();
  await expect(rows(page)).toHaveCount(0);
  expect(store.items).toHaveLength(0);
});

test('P4 붙여넣기: 가사 줄은 건너뛰고 반복 묶음 후보 → 직접 입력 폼으로', async ({ page }) => {
  const store = fakeStore();
  await setupLoggedIn(page, store);
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#progAddBtn').click();
  await page.locator('#progTab-paste').click();
  await page.locator('#pasteText').fill('[Chorus]\nAm   F   C   G\n이 노래는 가사 줄 A\nAm   F   C   G\nAm   F   C   G');
  await expect(page.locator('#pasteSummary')).toContainText('코드 줄 3개');
  const first = page.locator('[data-candidate="0"]');
  await expect(first).toContainText('Chorus: 4코드 ×3');
  await first.getByRole('button', { name: '이 진행으로 입력' }).click();
  await expect(page.locator('#progTab-manual')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#new-chords')).toHaveValue('Am - F - C - G');
  await expect(page.locator('#new-part')).toHaveValue('Chorus');
});

test('P5 코드 진행 영상: 분석 요청 → 작업 줄 → 완료 시 "2개 수집 · 노트 보기"', async ({ page }) => {
  const store = fakeStore();
  await setupLoggedIn(page, store, { gemini: true });
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#progAddBtn').click();
  await page.locator('#progTab-video').click();
  await expect(page.locator('#progKeyGate')).toHaveCount(0);
  // 잘못된 입력: 유튜브 아님
  await page.locator('#progVideoUrl').fill('https://example.com/x');
  await page.locator('#progVideoSubmit').click();
  await expect(page.locator('#progVideoMsg')).toHaveText('유튜브 영상 링크가 아니에요.');

  await page.locator('#progVideoUrl').fill('https://youtu.be/jNQXAC9IVRw');
  await page.locator('#progVideoMemo').fill('후렴 위주');
  await page.locator('#progVideoSubmit').click();
  await expect(page.locator('#progVideoMsg')).toContainText('분석을 요청했어요');
  const req = store.calls.find((c) => c.path === '/api/v1/progressions/analyze');
  expect(req.body).toEqual({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', memo: '후렴 위주' });
  await expect(page.locator('#progScope [data-scope="analysis"]')).toHaveAttribute('aria-pressed', 'true');
  // 노트 작업(kind=note)은 이 화면에 안 나온다
  await expect(page.locator('#progJobs li')).toHaveCount(1);
  await expect(page.locator('#progJobs li')).toContainText('대기 중');
  await expect(page.locator('#progJobs li')).toContainText('2개 수집', { timeout: 12000 });
  await expect(page.locator('#progJobs li a')).toHaveAttribute('href', 'note.html?id=00000000-0000-4000-8000-0000000000n2');
  await expect(rows(page)).toHaveCount(2);
});

test('P6 키 없음: 영상 탭에 키 안내, 요청 버튼 잠김', async ({ page }) => {
  await setupLoggedIn(page, fakeStore());
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#progAddBtn').click();
  await page.locator('#progTab-video').click();
  await expect(page.locator('#progKeyGate')).toContainText('Gemini API 키가 필요해요');
  await expect(page.locator('#progVideoSubmit')).toBeDisabled();
});

test('P7 노트 상세 "코드 진행 수집에 넣기": 켜면 N개 + CHORDS 링크, 끄면 고친 진행 확인', async ({ page }) => {
  const store = fakeStore();
  await setupLoggedIn(page, store);
  await page.route(/youtube\.com|ytimg\.com|doubleclick\.net/, (route) => route.abort());
  await page.goto(`/note.html?id=${NOTE_ID}`, { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  const toggle = page.locator('#noteCollectToggle');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#noteCollectLink')).toHaveCount(0);
  await toggle.click(); // 제어 컴포넌트: 응답 뒤에 바뀐다
  await expect(toggle).toBeChecked();
  await expect(page.locator('#noteCollectMsg')).toHaveText('진행 2개를 모았어요.');
  await expect(page.locator('#noteCollectLink')).toHaveText('CHORDS에서 보기 (2개) →');
  await expect(page.locator('#noteCollectLink')).toHaveAttribute('href', 'progressions.html?scope=analysis');

  let msg = '';
  page.once('dialog', (d) => {
    msg = d.message();
    d.dismiss();
  });
  await toggle.click();
  await expect.poll(() => msg).toContain('고친 진행 1개도 같이 빠집니다');
  await expect(toggle).toBeChecked(); // 취소하면 그대로
  page.once('dialog', (d) => d.accept());
  await toggle.click();
  await expect(page.locator('#noteCollectMsg')).toHaveText('코드 진행 모음에서 뺐어요.');
  await expect(toggle).not.toBeChecked();
  expect(store.items).toHaveLength(0);
});

for (const width of [1280, 1150, 768, 390]) {
  test(`P8 ${width}px 배치: 가로 스크롤 없음 + 스크린샷`, async ({ page }, testInfo) => {
    const store = fakeStore([AI_ROW, row({ id: '00000000-0000-4000-8000-0000000000d1', title: 'Just the Two of Us', artist: 'Grover Washington Jr.', key: 'A min', chords: ['FM7', 'E7', 'Am7', 'Gm7', 'C7'].map((s, i) => ({ symbol: s, roman: ['bVIM7', 'V7', 'im7', 'bviim7', 'bIII7'][i] })), moods: ['nostalgia'], genres: ['RnB'] })]);
    await page.setViewportSize({ width, height: 1000 });
    await setupLoggedIn(page, store);
    test.skip(!(await open(page, '/progressions.html?scope=all')), 'legacy 모드: React 화면 아님');
    await expect(rows(page)).toHaveCount(2);
    await rows(page).nth(1).locator('button[aria-expanded]').click();
    await page.locator('#progAddBtn').click();
    await page.locator('#progTab-manual').click();
    await page.locator('#new-chords').fill('Cm7b5(#11) F7 Bbmaj7 Xq');
    const px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(px).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`progressions-${width}.png`), fullPage: true });
  });
}
