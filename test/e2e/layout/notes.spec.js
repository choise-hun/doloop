// 학습 노트 목록 화면 정렬 검사 (FT-2): 공통 검사 G0~G8
// 배치 약속: 명세/M2-1a_구현명세.md §5(제목 줄), 명세/M2-1b_구현명세.md §5(요청 줄 — pro 상태),
//           결과/M2-1c_구간재시도.md §1(구간 줄·재시도 버튼 — retry 상태)
//           NT-2a 워크스페이스(명세/NT-2_구현명세.md §6): notesActions:center-y(제목줄 버튼) · notesWs:top@961(왼쪽 노트북 목록 ↔ 노트북 제목줄)
//           · noteCards:top,bottom(한 줄 카드) — ws·free 상태
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES, DEFAULT_ME, FIXTURES } = require('../support/mock-app');

const PRO_ME = { tier: 'pro', billingTier: 'pro', limits: { ...DEFAULT_ME.limits, ai: true }, credits: { monthly: 30, purchased: 0 } };
const estimateRoute = [
  (url) => url.pathname === '/api/v1/credits/estimate',
  (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ estimatedCredits: 4, reserveCredits: 12 }),
    }),
];

// M2-1b: Pro + 예상 크레딧이 보이는 상태(요청 줄 submitRow 맞춤 확인)
const PRO = { name: 'pro', mock: { ...STATES.user, me: PRO_ME, routes: [estimateRoute] } };

// M2-1c: 실패한 노트 작업 → 재시도로 폼 복원(옵션 패널 열림·구간·메모 채움)
const FAILED_JOB = {
  id: '00000000-0000-4000-8000-0000000000f1', kind: 'note', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  tags: ['화성', '리듬'], memo: '후렴 보이싱 위주로', startSec: 60, endSec: 610, pace: null,
  status: 'failed', error: 'GEMINI_MAX_TOKENS: 출력 한도 초과', noteId: null, reservedCredits: 12, chargedCredits: 0,
  createdAt: '2026-11-07T03:00:00Z', startedAt: '2026-11-07T03:00:05Z', finishedAt: '2026-11-07T03:02:00Z',
};
const RETRY = {
  name: 'retry',
  mock: {
    ...STATES.user,
    me: PRO_ME,
    routes: [
      estimateRoute,
      [
        (url) => url.pathname === '/api/v1/notes/jobs',
        (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ jobs: [FAILED_JOB] }) }),
      ],
    ],
  },
};

// NT-2a: 노트북 3개 · AI 노트 2 · 자료 노트 3(명세 §8.1 NT2A-W1과 같은 모양)
const WS_PRO_ME = {
  ...PRO_ME,
  limits: { ...PRO_ME.limits, drive: true, noteFolders: 15, noteDocs: 1000, noteFiles: true, fileBytes: 524288000 },
  usage: { songs: 0, categories: 0, takeBytes: 0, takeSongs: 0, noteFolders: 3, noteDocs: 3, noteFileBytes: 312000000, fileBytes: 327155712 },
};
const FID = (n) => `00000000-0000-4000-8000-0000000003f${n}`;
const WS_FOLDERS = [
  { id: FID(1), name: '재즈 화성', color: 'orange', sortOrder: 0, docCount: 2, aiNoteCount: 1, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
  { id: FID(2), name: '클래식 기타 교재 · 아주 긴 노트북 이름이 들어와도 줄이 깨지지 않는다', color: 'slate', sortOrder: 1, docCount: 1, aiNoteCount: 0, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
  { id: FID(3), name: '레슨 숙제', color: null, sortOrder: 2, docCount: 0, aiNoteCount: 0, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
];
const doc = (n, over) => ({
  id: `00000000-0000-4000-8000-0000000004d${n}`, kind: 'document', title: `자료 ${n} · ${'긴 제목 '.repeat(6)}`, folderId: null, rev: 1,
  fileCount: 1, firstFile: { id: `00000000-0000-4000-8000-0000000005e${n}`, mime: 'application/pdf' },
  createdAt: '2026-11-21T00:00:00Z', updatedAt: `2026-11-2${n}T00:00:00Z`, ...over,
});
const WS_DOCS = [
  doc(1, { folderId: FID(1) }),
  doc(2, { folderId: FID(1), fileCount: 3, firstFile: { id: '00000000-0000-4000-8000-0000000005e9', mime: 'image/jpeg' } }),
  doc(3, { folderId: FID(2) }),
];
const WS_NOTES = [
  { ...FIXTURES.note, folderId: FID(1) },
  { ...FIXTURES.note, id: '00000000-0000-4000-8000-000000000202', title: '두 번째 AI 노트', folderId: null, createdAt: '2026-11-02T00:00:00Z' },
];
const wsRoutes = (folders, docs) => [
  [(url) => url.pathname === '/api/v1/note-folders', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ folders }) })],
  [(url) => url.pathname === '/api/v1/note-docs', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ docs }) })],
];
const WS = { name: 'ws', mock: { ...STATES.user, notes: WS_NOTES, me: WS_PRO_ME, routes: wsRoutes(WS_FOLDERS, WS_DOCS) } };
const FREE_ME = { limits: { ...DEFAULT_ME.limits, noteFolders: 0, noteDocs: 30, noteFiles: false, fileBytes: 20971520 }, usage: { songs: 0, categories: 0, takeBytes: 0, takeSongs: 0, fileBytes: 0 } };
const FREE = { name: 'free', mock: { ...STATES.userData, me: FREE_ME, routes: wsRoutes([], []) } };

async function notesReady(page, state) {
  await page.locator('#notesList').waitFor({ state: 'attached' });
  if (state === 'userData') await expect(page.locator('#notesList a').first()).toBeVisible();
  if (state === 'pro') {
    await page.locator('#url').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
    await expect(page.locator('#noteEstimate')).toHaveText('예상 4크레딧 · 남은 30');
  }
  if (state === 'ws') await expect(page.locator('#notesList .note-card')).toHaveCount(5);
  if (state === 'free') await expect(page.locator('#noteFreeNotice')).toBeVisible();
  if (state === 'retry') {
    await page.locator('[data-job-retry]').click();
    await expect(page.locator('#noteStart')).toHaveValue('1:00');
    await expect(page.locator('#noteEstimate')).toHaveText('예상 4크레딧 · 남은 30');
    await page.locator('#noteStart').blur(); // 포커스 고리는 판정·캡처에서 뺀다
  }
}

layoutSuite({
  name: 'notes',
  path: '/notes.html',
  states: ['guest', 'user', 'userData', PRO, RETRY, WS, FREE],
  ready: notesReady,
  dark: 'ws',
});

// NT2A-L1: 대표 필은 `＋ 자료 올리기` 하나(Q1), 961 이상 왼쪽 노트북 목록 · 960 이하 위 칩 줄
for (const width of [390, 768, 1150, 1280]) {
  test(`NT2A-L1 notes ws ${width}px 필 1개 · 노트북 목록/칩 줄 전환`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, WS.mock);
    await page.goto('/notes.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await notesReady(page, 'ws');
    const pills = await page.locator('main .pillBtn').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.id));
    expect(pills).toEqual(['noteUploadBtn']);
    await expect(page.locator('#aiNoteBox')).not.toHaveAttribute('open', ''); // 노트가 있으면 AI 상자는 접힘(V2 B)
    if (width >= 961) {
      await expect(page.locator('#noteFolders')).toBeVisible();
      await expect(page.locator('#noteFolderChips')).toBeHidden();
    } else {
      await expect(page.locator('#noteFolders')).toBeHidden();
      await expect(page.locator('#noteFolderChips')).toBeVisible();
    }
  });
}

// 버튼·필 글자가 한 줄인지(FT-4 settings.spec.js collectWrappedPills 복사 — 규격 §8).
// M2-1c: 옵션 토글 "(입력함)" 문구·재시도 버튼이 390에서 두 줄 필이 되지 않는다
function collectWrappedPills() {
  const out = [];
  for (const el of document.querySelectorAll('main button, main a.pillBtn, main a.ghostBtn')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !(el.textContent || '').trim()) continue;
    const before = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    const oneLine = el.getBoundingClientRect().height;
    el.style.whiteSpace = before;
    if (r.height > oneLine + 1) {
      out.push(`${el.id ? '#' + el.id : el.tagName.toLowerCase()} "${el.textContent.trim()}" 두 줄(높이 ${Math.round(r.height)}px > 한 줄 ${Math.round(oneLine)}px, 폭 ${Math.round(r.width)}px)`);
    }
  }
  return out;
}

for (const width of [390, 768, 1280]) {
  test(`FT notes retry ${width}px 버튼·필 글자 한 줄(옵션 접힘 "입력함" 포함)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApp(page, RETRY.mock);
    await page.goto('/notes.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await notesReady(page, 'retry');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(collectWrappedPills)).toEqual([]);
    await page.locator('#noteOptToggle').click(); // 접으면 "(입력함)" 문구 — 가장 긴 토글 글자
    await expect(page.locator('#noteOptToggle')).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(collectWrappedPills)).toEqual([]);
  });
}

// UI-2 검증 테스트 (T5)
test('T5: NotesPage .noteCard 시안 구조 및 액션 텍스트 링크 검증', async ({ page }) => {
  await mockApp(page, STATES.userData);
  await page.goto('/notes.html', { waitUntil: 'load' });
  await page.locator('#notesList').waitFor();

  const firstCard = page.locator('#notesList .note-card').first();
  await expect(firstCard).toBeVisible();

  // .note-actions 및 액션 링크 검증
  const actions = firstCard.locator('.note-actions');
  await expect(actions).toBeVisible();
  const links = actions.locator('a');
  await expect(links.first()).toContainText('연습');
  // ▶는 사전 문구(notes.btnPractice)에 이미 있다 — 마크업에서 한 번 더 붙이면 깨진다
  expect(((await links.first().textContent()) || '').split('▶').length - 1).toBe(1);
  await expect(links.last()).toContainText('상세');
});
