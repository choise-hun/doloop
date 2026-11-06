// M2-1d: 노트 상세 액션 바 · 타임스탬프 링크 · 마크다운 복사 e2e 테스트
// 명세 개발산출물/명세/M2-1d_구현명세.md §8-2
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

const TEST_NOTE_ID = '00000000-0000-4000-8000-0000000000aa';
const NOTE_WITH_DATA = {
  id: TEST_NOTE_ID,
  videoId: 'jNQXAC9IVRw',
  url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  title: '테스트 화성 노트',
  channel: '채널A',
  tags: ['화성'],
  memo: '테스트 메모',
  headline: '테스트 헤드라인',
  points: ['포인트 1'],
  keywords: ['재즈'],
  difficulty: '중급',
  model: 'gemini',
  collectProgressions: false,
  createdAt: '2026-11-07T00:00:00Z',
  updatedAt: '2026-11-07T00:00:00Z',
  analysis: {
    harmony: {
      progressions: [
        {
          name: '진행 1',
          key: 'C Major',
          instrument: '기타',
          chords: [
            { symbol: 'Cmaj7', roman: 'IM7', function: 'T', timestamp: '01:24' },
          ],
        },
      ],
    },
    moments: [{ timestamp: '01:24', point: '주요 구간 설명' }],
    practice: ['과제 1'],
  },
  diagramsSvg: [],
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

async function open(page, note = NOTE_WITH_DATA, opts = {}) {
  const routes = [
    [
      (url) => url.pathname === `/api/v1/notes/${note.id || TEST_NOTE_ID}`,
      (route) => json(route, { note }),
    ],
    ...(opts.routes || []),
  ];
  await mockApp(page, { ...STATES.user, routes, ...opts });
  await page.goto(`/note.html?id=${note.id || TEST_NOTE_ID}`, { waitUntil: 'load' });
  return (await page.locator('#root').count()) > 0;
}

test('NA-1 순서: 액션 바 자식 순서 = 플레이어 → 복사 → 토글, #noteCollectBox 0개', async ({ page }) => {
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  const bar = page.locator('#noteActionBar');
  await expect(bar).toBeVisible();

  // 자식 요소들: 플레이어, 복사, 토글
  const children = bar.locator('> *');
  await expect(children).toHaveCount(3);
  await expect(children.nth(0)).toHaveId('notePracticeLink');
  await expect(children.nth(1)).toHaveId('btnCopyMarkdown');
  await expect(children.nth(2).locator('#noteCollectToggle')).toHaveCount(1);

  // 별도 #noteCollectBox 카드는 완전히 없어야 함
  await expect(page.locator('#noteCollectBox')).toHaveCount(0);
});

test('NA-2 플레이어: 링크 href practice.html?v=<id>, 글자 오픈 문구', async ({ page }) => {
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  const link = page.locator('#notePracticeLink');
  await expect(link).toHaveAttribute('href', 'practice.html?v=jNQXAC9IVRw');
  await expect(link).toHaveText('▶ 이 영상 플레이어로 열기');
});

test('NA-3 타임스탬프: 표 01:24 링크와 구간 링크 모두 href …&t=84', async ({ page }) => {
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  const tableLink = page.locator('#noteSections table a', { hasText: '01:24' });
  await expect(tableLink).toHaveAttribute('href', 'practice.html?v=jNQXAC9IVRw&t=84');

  const momentLink = page.locator('#noteMoments a', { hasText: '01:24' });
  await expect(momentLink).toHaveAttribute('href', 'practice.html?v=jNQXAC9IVRw&t=84');
});

test('NA-4 복사 성공: 마크다운 복사 및 성공 문구 표시 후 사라짐', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  const copyBtn = page.locator('#btnCopyMarkdown');
  await copyBtn.click();

  const copyMsg = page.locator('#noteCopyMsg');
  await expect(copyMsg).toHaveText('마크다운을 복사했어요.');
  await expect(copyMsg).toHaveClass(/ok/);

  // 2.5초 타이머 만료 후 빈 글자
  await expect(copyMsg).toHaveText('', { timeout: 4000 });
});

test('NA-5 복사 실패: writeText 거부 시 실패 문구 세우고 유지', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.reject(new Error('Permission denied')),
      },
      configurable: true,
    });
  });
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#btnCopyMarkdown').click();

  const copyMsg = page.locator('#noteCopyMsg');
  await expect(copyMsg).toHaveText('복사하지 못했어요. 브라우저가 클립보드 사용을 막았어요.');
  await expect(copyMsg).toHaveClass(/err/);

  // 3초 뒤에도 문구가 유지됨
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
  await expect(copyMsg).toHaveText('복사하지 못했어요. 브라우저가 클립보드 사용을 막았어요.');
});

test('NA-6 늦은 결과: 복사 도중 로그아웃되면 복사 완료 문구를 세우지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    let resolver;
    window.__resolveCopy = () => resolver && resolver();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => new Promise((resolve) => { resolver = resolve; }),
      },
      configurable: true,
    });
  });
  test.skip(!(await open(page)), 'legacy 모드: React 화면 아님');
  await page.locator('#btnCopyMarkdown').click();

  // 로그아웃 수행
  await page.evaluate(() => {
    if (window.ULAuth && typeof window.ULAuth.signOut === 'function') {
      window.ULAuth.signOut({ scope: 'local' });
    }
  });
  await expect(page.locator('#noteLoadingMsg')).toHaveText('로그인이 필요해요.');

  // 지연된 복사 resolve
  await page.evaluate(() => window.__resolveCopy());

  // stale 응답이므로 복사 성공 문구가 세워지지 않아야 함
  await expect(page.locator('#noteCopyMsg')).toHaveText('');
});

test('NA-7 videoId 없음: 플레이어 숨김, 복사 버튼은 보임', async ({ page }) => {
  const noteNoVideo = { ...NOTE_WITH_DATA, videoId: null };
  test.skip(!(await open(page, noteNoVideo)), 'legacy 모드: React 화면 아님');
  await expect(page.locator('#notePracticeLink')).toBeHidden();
  await expect(page.locator('#btnCopyMarkdown')).toBeVisible();
});
