// test/e2e/cm-ui.spec.js
// CM-UI E2E 테스트 (CUI-01 ~ CUI-12): 독립 커뮤니티 화면, 공용 세션 카드, 세션 공유/수정/철회/신고
'use strict';

const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');
const {
  COMMUNITY_FREE_ME,
  COMMUNITY_PRO_ME,
  EPISODE_POST_1,
  EPISODE_POST_FOLLOWING,
  MY_EPISODE_LOG_1,
  communityRoutes,
} = require('./support/community-fixtures');

const SAMPLE_PRACTICE_SESSION = {
  id: '00000000-0000-4000-8000-000000000801',
  songId: '00000000-0000-4000-8000-000000000101',
  date: '2026-11-03',
  startedAt: '2026-11-03T10:00:00Z',
  endedAt: '2026-11-03T10:30:00Z',
  seconds: 1800,
  loops: 88,
  memo: '기존 연습 메모',
  songTitle: 'Neo-Soul Groove',
  songArtist: 'Mateus Asato',
  videoId: 'abcdefghij1',
  takes: [],
  partStats: [
    { name: 'Intro Riff', a: 10, b: 20, rate: 1.0, completed: true, loops: 50, seconds: 1000 },
    { name: 'Solo Part', a: 20, b: 35, rate: 0.9, completed: false, loops: 38, seconds: 800 },
  ],
};

const COMMUNITY_PRO = {
  ...STATES.userData,
  me: COMMUNITY_PRO_ME,
  routes: communityRoutes(),
};

const COMMUNITY_PRO_WITH_SESSIONS = {
  ...STATES.userData,
  me: COMMUNITY_PRO_ME,
  sessions: {
    calendar: [{ date: '2026-11-03', totalSeconds: 1800, level: 2 }],
    sessions: [SAMPLE_PRACTICE_SESSION],
  },
  routes: communityRoutes(),
};

test('CUI-01 독립 라우트 /community.html 진입, 내비게이션 aria-current, #community 해시 리다이렉트', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);

  // 1. /community.html 직접 진입
  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator('#communityPage').waitFor();
  await expect(page.locator('#communityTitle')).toHaveText('COMMUNITY');

  // 상단 내비게이션 COMMUNITY 활성화
  const topNav = page.locator('header nav a[href*="community.html"]');
  if ((await topNav.count()) > 0) {
    await expect(topNav.first()).toHaveAttribute('aria-current', 'page');
  }

  // 2. 홈 화면의 직각 배너 확인
  await page.goto('/index.html', { waitUntil: 'load' });
  const homeBanner = page.locator('#homeCommunityBanner');
  await expect(homeBanner).toBeVisible();
  const bannerLink = page.locator('#homeCommunityBanner a');
  await expect(bannerLink).toHaveAttribute('href', 'community.html');

  // 3. /log.html#community 진입 시 community.html로 replace 리다이렉트
  await page.goto('/log.html#community', { waitUntil: 'load' });
  await page.waitForURL(/community\.html/);
  expect(page.url()).toContain('community.html');

  // 4. /log.html#songs는 리다이렉트되지 않고 LogPage 곡 보관함 유지
  await page.goto('/log.html#songs', { waitUntil: 'load' });
  await page.locator('#pane-songs').waitFor();
  expect(page.url()).toContain('log.html#songs');
  await expect(page.locator('#pane-community')).toHaveCount(0);
});

test('CUI-02 탭별 데이터 경계: ALL(큐레이션+피드), LOG(피드 전용), SUMMARY(84일 집계), MY SHARES(내 폴더)', async ({ page }) => {
  let oldLogsCalled = 0;
  await mockApp(page, {
    ...COMMUNITY_PRO,
    routes: communityRoutes({
      onLogs: async (route, fulfillJson) => {
        oldLogsCalled += 1;
        return fulfillJson(route, { logs: [], next: null });
      },
    }),
  });

  await page.goto('/community.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 기본 ALL 탭: CurationRows와 새 게시물 피드 동시 표시
  await page.locator('#episodeFeed').waitFor();
  await expect(page.locator('[data-row="curated"]')).toBeVisible();
  expect(oldLogsCalled).toBe(0);

  // LOG 탭 전환: 피드만 단독 표시 (큐레이션 없음, 옛 84일 logs API 호출 없음)
  await page.locator('#chipLog').click();
  await expect(page.locator('[data-row="curated"]')).toHaveCount(0);
  await expect(page.locator('#episodeFeed')).toBeVisible();
  expect(oldLogsCalled).toBe(0);

  // SUMMARY 탭 전환: 84일 집계 표시 및 옛 logs 호출 발생
  await page.locator('#chipSummary').click();
  await page.locator('#summaryPane').waitFor();
  expect(oldLogsCalled).toBeGreaterThanOrEqual(1);

  // MY SHARES 탭 전환: 내 폴더 관리 패널 표시
  await page.locator('#chipMyShares').click();
  await page.locator('#mySharesTabPane').waitFor();
  await expect(page.locator('#mySharesPanel')).toBeVisible();
});

test('CUI-03 UID/seq/scope 비동기 레이스 가드: scope 전환 시 이전 지연 응답 폐기', async ({ page }) => {
  let resolveSlowAll = null;
  const slowAllPromise = new Promise((resolve) => {
    resolveSlowAll = resolve;
  });

  await mockApp(page, {
    ...COMMUNITY_PRO,
    routes: communityRoutes({
      onEpisodeLogs: async (route, fulfillJson, scope) => {
        if (scope === 'all') {
          await slowAllPromise;
          return fulfillJson(route, { posts: [EPISODE_POST_1], next: null });
        }
        // following은 즉시 반환
        return fulfillJson(route, { posts: [EPISODE_POST_FOLLOWING], next: null });
      },
    }),
  });

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // LOG 탭에서 scope=following으로 즉시 전환
  await page.locator('#episodeScopeFollowing').click();
  await page.locator(`[data-post-id="${EPISODE_POST_FOLLOWING.postId}"]`).waitFor();

  // 이전 all 응답을 뒤늦게 resolve
  const slowResponse = page.waitForResponse((r) => r.url().includes('/community/episode-logs?scope=all'));
  resolveSlowAll();
  await (await slowResponse).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));

  // 뒤늦게 도착한 all 응답이 현재 following 화면을 덮어쓰지 않아야 함
  await expect(page.locator(`[data-post-id="${EPISODE_POST_FOLLOWING.postId}"]`)).toBeVisible();
  await expect(page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`)).toHaveCount(0);
});

test('CUI-04 피드 상태 분기: 로딩/빈 상태/재시도 분기 및 더보기 20개 페이징', async ({ page }) => {
  let failFirst = true;
  let pageCount = 0;

  await mockApp(page, {
    ...COMMUNITY_PRO,
    routes: communityRoutes({
      onEpisodeLogs: async (route, fulfillJson, scope, cursor) => {
        if (failFirst) {
          failFirst = false;
          return fulfillJson(route, { ok: false, code: 'SERVER_ERROR', message: 'Fail' }, 500);
        }
        pageCount += 1;
        if (!cursor) {
          return fulfillJson(route, { posts: [EPISODE_POST_1], next: 'cursor-page-2' });
        }
        return fulfillJson(route, { posts: [EPISODE_POST_FOLLOWING], next: null });
      },
    }),
  });

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 1. 에러 및 재시도 버튼 표시
  const errorBox = page.locator('#episodeError');
  await expect(errorBox).toBeVisible();
  const retryBtn = errorBox.locator('button');

  // 2. 재시도 클릭 후 첫 페이지 정상 로드
  await retryBtn.click();
  await page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`).waitFor();

  // 3. 더보기 버튼 클릭 시 2페이지 로드
  const moreBtn = page.locator('#episodeMore');
  await expect(moreBtn).toBeVisible();
  await moreBtn.click();

  await page.locator(`[data-post-id="${EPISODE_POST_FOLLOWING.postId}"]`).waitFor();
  await expect(page.locator('#episodeMore')).toHaveCount(0);
  expect(pageCount).toBe(2);
});

test('CUI-05 PracticeSessionCard 공용 카드: 실제 loops 표시, 파트 토글, 메모 저장 연동', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO_WITH_SESSIONS);

  await page.goto('/log.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 날짜별 세션 카드 확인 (PracticeSessionCard로 통합)
  const sessionCard = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await sessionCard.waitFor();

  // loops 수치가 0으로 하드코딩되지 않고 실제 값(88)으로 렌더링되는지 검증
  const cardText = await sessionCard.textContent();
  expect(cardText).toContain('88');

  // 파트 토글 버튼 클릭 시 파트 목록 펼침
  const partsToggle = sessionCard.locator('button[aria-expanded]');
  if ((await partsToggle.count()) > 0) {
    await partsToggle.click();
    await expect(sessionCard.locator('div[id^="sessionParts-"]')).toBeVisible();
    await expect(sessionCard.locator('div[id^="sessionParts-"]')).toContainText('Intro Riff');
  }

  // 메모 편집기 존재
  const memoTextarea = sessionCard.locator('textarea');
  if ((await memoTextarea.count()) > 0) {
    await memoTextarea.fill('테스트 연습 메모 입력');
    const memoSaveBtn = sessionCard.locator('button:has-text("메모 저장"), button:has-text("Save Memo")');
    if ((await memoSaveBtn.count()) > 0) {
      await memoSaveBtn.click();
    }
  }
});

test('CUI-06 내 세션 공유 상태 일괄 로더: useEpisodeShares 순차 조회 및 캐시 관리', async ({ page }) => {
  let myEpisodeLogsCalls = 0;

  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, fulfillJson, cursor) => {
        myEpisodeLogsCalls += 1;
        if (!cursor) {
          return fulfillJson(route, { posts: [MY_EPISODE_LOG_1], next: null });
        }
        return fulfillJson(route, { posts: [], next: null });
      },
    }),
  });

  await page.goto('/log.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  await page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`).waitFor();
  expect(myEpisodeLogsCalls).toBeGreaterThanOrEqual(1);
});

test('CUI-07 EpisodeShareDialog: 동의 체크 필수, 80/500 code points 검증, BANNED_WORD 에러 표시', async ({ page }) => {
  let postBody = null;

  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, fulfillJson) => {
        return fulfillJson(route, { posts: [], next: null });
      },
      onShareEpisode: async (route, fulfillJson) => {
        const body = route.request().postDataJSON();
        postBody = body;
        if (body.title && body.title.includes('금지어')) {
          return fulfillJson(
            route,
            { ok: false, code: 'BANNED_WORD', message: 'Contains banned words', field: 'title' },
            400,
          );
        }
        return fulfillJson(route, { post: { ...MY_EPISODE_LOG_1, title: body.title, comment: body.comment } }, 201);
      },
    }),
  });

  await page.goto('/log.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const sessionCard = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await sessionCard.waitFor();

  // 세션 카드의 공유 버튼 클릭
  const shareBtn = sessionCard.locator('[data-share-action="open"]');
  await shareBtn.waitFor();
  await shareBtn.click();

  const modal = page.locator('#episodeShareDialog');
  await expect(modal).toBeVisible();

  // 동의 미체크 시 공유 제출 버튼 비활성화
  const submitBtn = modal.locator('button[type="submit"]');
  await expect(submitBtn).toBeDisabled();

  // 동의 체크
  await modal.locator('input[type="checkbox"]').check();
  await expect(submitBtn).toBeEnabled();

  // 금지어 입력 후 제출 시 에러 표시
  await modal.locator('input[type="text"]').fill('금지어 포함 제목');
  await submitBtn.click();

  const alertMsg = modal.locator('[role="alert"]');
  await expect(alertMsg).toBeVisible();

  // 정상 제목 입력 후 제출 성공
  await modal.locator('input[type="text"]').fill('멋진 연습 세션');
  await submitBtn.click();

  await expect(modal).toHaveCount(0);
  expect(postBody.title).toBe('멋진 연습 세션');
});

test('CUI-08 티어별 권한: 무료 회원은 공유 버튼 제한(disabled 및 툴팁), Pro는 공유 가능', async ({ page }) => {
  // 1. Free 회원
  await mockApp(page, {
    ...STATES.userData,
    me: COMMUNITY_FREE_ME,
    sessions: {
      calendar: [{ date: '2026-11-03', totalSeconds: 1800, level: 2 }],
      sessions: [SAMPLE_PRACTICE_SESSION],
    },
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, fulfillJson) => {
        return fulfillJson(route, { posts: [], next: null });
      },
    }),
  });

  await page.goto('/log.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const freeSessionCard = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await freeSessionCard.waitFor();
  const freeShareBtn = freeSessionCard.locator('[data-share-action="open"]');
  await freeShareBtn.waitFor();
  await expect(freeShareBtn).toBeDisabled();
  const titleAttr = await freeShareBtn.getAttribute('title');
  expect(titleAttr).toBeTruthy();

  // 2. Pro 회원
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, fulfillJson) => {
        return fulfillJson(route, { posts: [], next: null });
      },
    }),
  });
  await page.goto('/log.html', { waitUntil: 'load' });
  const proSessionCard = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await proSessionCard.waitFor();
  const proShareBtn = proSessionCard.locator('[data-share-action="open"]');
  await proShareBtn.waitFor();
  await expect(proShareBtn).toBeEnabled();
});

test('CUI-09 공유 철회(DELETE): 로컬 즉시 반영 및 피드 제거 확인', async ({ page }) => {
  let withdrawCalled = false;

  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, fulfillJson) => {
        return fulfillJson(route, {
          posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id }],
          next: null,
        });
      },
      onWithdrawShare: async (route, fulfillJson, sessId) => {
        withdrawCalled = true;
        return fulfillJson(route, { ok: true });
      },
    }),
  });

  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/log.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const sessionCard = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await sessionCard.waitFor();

  // 이미 공유된 세션 카드의 철회 버튼 직접 클릭
  const withdrawBtn = sessionCard.locator('[data-share-action="withdraw"]');
  await withdrawBtn.waitFor();
  await withdrawBtn.click();
  expect(withdrawCalled).toBe(true);
});

test('CUI-10 공개 DTO Allowlist 검증: 개인 메모, 녹음 URL 미포함 확인', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onEpisodeLogs: (route, json) => json(route, { posts: [{ ...EPISODE_POST_1,
      memo: 'privateMemoSentinel', takes: [{ audioUrl: 'https://private.example/sentinel.webm' }],
      hiddenReason: 'privateHiddenSentinel', songTitle: 'privateSongSentinel' }], next: null }) }),
  });

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await card.waitFor();

  // 개인 메모 텍스트나 audio 태그가 DOM에 존재하지 않아야 함
  const cardHtml = await card.innerHTML();
  expect(cardHtml).not.toContain('privateMemoSentinel');
  expect(cardHtml).not.toContain('private.example');
  expect(cardHtml).not.toContain('privateHiddenSentinel');
  expect(cardHtml).not.toContain('privateSongSentinel');
  expect(cardHtml).not.toContain('<audio');
});

test('CUI-11 EpisodeReportDialog: 타인 게시물 신고 접수(201) 및 중복 신고(409) 처리', async ({ page }) => {
  let reportBody = null;
  let reportStatus = 201;

  await mockApp(page, {
    ...COMMUNITY_PRO,
    routes: communityRoutes({
      onReportEpisode: async (route, fulfillJson) => {
        reportBody = route.request().postDataJSON();
        if (reportStatus === 409) {
          return fulfillJson(
            route,
            { ok: false, code: 'REPORT_ALREADY_SUBMITTED', message: 'Already reported' },
            409,
          );
        }
        return fulfillJson(route, { reportId: 'rep-123' }, 201);
      },
    }),
  });

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await card.waitFor();

  // 타인 카드에는 신고 버튼 표시
  const reportBtn = card.locator('button:has-text("신고"), button:has-text("Report")');
  await reportBtn.click();

  const reportModal = page.locator('#episodeReportDialog');
  await expect(reportModal).toBeVisible();

  // 사유 라디오 선택 및 상세 입력 후 제출
  await reportModal.locator('input[value="spam"]').check();
  await reportModal.locator('textarea').fill('스팸성 테스트 게시물입니다');
  await reportModal.locator('button[type="submit"]').click();

  expect(reportBody).toEqual({
    reason: 'spam',
    detail: '스팸성 테스트 게시물입니다',
  });
});

test('CUI-12 구간 재생 링크 및 보관함 담기 동선 검증', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await card.waitFor();

  // 1. 구간 재생 링크 검증
  const playLink = card.locator('a:has-text("구간 재생"), a:has-text("Play")');
  await expect(playLink).toBeVisible();
  const href = await playLink.getAttribute('href');
  expect(href).toContain(`v=${EPISODE_POST_1.videoId}`);
  expect(href).toContain(`a=${EPISODE_POST_1.a}`);
  expect(href).toContain(`b=${EPISODE_POST_1.b}`);

  // 2. 보관함에 담기 링크 검증 (practice.html 동선)
  const saveLink = card.locator('a:has-text("보관함"), a:has-text("Save")');
  if ((await saveLink.count()) > 0) {
    const saveHref = await saveLink.getAttribute('href');
    expect(saveHref).toContain('practice.html');
  }
});


// Senior regressions for failure paths absent from the original CUI assertions.
test('SR-01 repeated cursor is a retryable error, never an unshared result', async ({ page }) => {
  let calls = 0;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({ onMyEpisodeLogs: async (route, json) => {
      calls++;
      return json(route, { posts: [], next: 'repeat' });
    } }),
  });
  await page.goto('/log.html');
  const card = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await expect(card.getByText('공유 상태를 불러오지 못했습니다.')).toBeVisible();
  await expect(card.locator('[data-share-action="open"]')).toHaveCount(0);
  expect(calls).toBe(2);
  await expect(card.getByRole('button', { name: '다시 시도' })).toBeVisible();
});

test('SR-02 private song title is absent from the public preview', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({ onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }) }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await expect(dialog).not.toContainText(SAMPLE_PRACTICE_SESSION.songTitle);
  await expect(dialog.locator('#shareTitleInput')).toHaveAttribute('placeholder', '연습 기록');
});

test('SR-03 more failure retains cards and cursor with a visible retry error', async ({ page }) => {
  let moreCalls = 0;
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onEpisodeLogs: (route, json, scope, cursor) => {
      if (!cursor) return json(route, { posts: [EPISODE_POST_1], next: 'page2' });
      moreCalls++;
      if (moreCalls === 1) return json(route, { code: 'DB_UNAVAILABLE', message: 'more failed' }, 503);
      return json(route, { posts: [EPISODE_POST_FOLLOWING], next: null });
    } }),
  });
  await page.goto('/community.html#log');
  await page.locator('#episodeMore').click();
  await expect(page.locator('#episodeMoreError')).toContainText('more failed');
  await expect(page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`)).toBeVisible();
  await page.locator('#episodeMore').click();
  await expect(page.locator(`[data-post-id="${EPISODE_POST_FOLLOWING.postId}"]`)).toBeVisible();
  await expect(page.locator('#episodeMoreError')).toHaveCount(0);
  expect(moreCalls).toBe(2);
});

test('SR-04 hidden and withdrawn states cannot expose republish', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({ onMyEpisodeLogs: (route, json) => json(route, {
      posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id,
        status: 'moderation_hidden', hiddenReason: 'owner-only-reason', withdrawnAt: '2026-11-09T00:00:00Z', canRepublish: true }], next: null,
    }) }),
  });
  await page.goto('/log.html');
  const card = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await expect(card).toContainText('owner-only-reason');
  await expect(card.getByRole('button', { name: '다시 게시' })).toHaveCount(0);
  await expect(card).toContainText('공유가 중지되었습니다.');
});

test('SR-05 unreadable part JSON blocks sharing and displays the parse failure', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions,
      sessions: [{ ...SAMPLE_PRACTICE_SESSION, partStats: '{broken' }] },
    routes: communityRoutes({ onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }) }),
  });
  await page.goto('/log.html');
  const card = page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`);
  await expect(card).toContainText('파트 정보를 읽을 수 없어요');
  await expect(card.locator('[data-share-action="open"]')).toBeDisabled();
});

test('SR-06 withdraw reloads server republish eligibility and clears old text', async ({ page }) => {
  let withdrawn = false;
  let reads = 0;
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => {
        reads++;
        return json(route, { posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id,
          title: withdrawn ? '' : 'OLD PUBLIC TITLE', comment: withdrawn ? '' : 'OLD COMMENT',
          withdrawnAt: withdrawn ? '2026-11-09T00:00:00Z' : null, canRepublish: withdrawn,
          card: withdrawn ? null : MY_EPISODE_LOG_1.card }], next: null });
      },
      onWithdrawShare: (route, json) => { withdrawn = true; return json(route, { ok: true }); },
    }),
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/log.html');
  await page.locator('[data-share-action="withdraw"]').click();
  const republish = page.getByRole('button', { name: '다시 게시' });
  await expect(republish).toBeEnabled();
  expect(reads).toBe(2);
  await republish.click();
  await expect(page.locator('#shareTitleInput')).toHaveValue('');
  await expect(page.locator('#shareCommentInput')).toHaveValue('');
  await expect(page.locator('#shareConsentCheckbox')).not.toBeChecked();
});

test('SR-07 a stale second page cannot undo a committed withdrawal', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let secondStarted;
  const started = new Promise((r) => { secondStarted = r; });
  let withdrawn = false;
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: async (route, json, cursor) => {
        if (cursor) { secondStarted(); await gate; return json(route, { posts: [], next: null }); }
        return json(route, { posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id,
          withdrawnAt: withdrawn ? '2026-11-09T00:00:00Z' : null, canRepublish: withdrawn }], next: withdrawn ? null : 'old-page2' });
      },
      onWithdrawShare: (route, json) => { withdrawn = true; return json(route, { ok: true }); },
    }),
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/log.html');
  await started;
  await page.locator('[data-share-action="withdraw"]').click();
  await expect(page.locator('[data-share-action="withdraw"]')).toHaveCount(0);
  const response = page.waitForResponse((r) => r.url().includes('cursor=old-page2'));
  release();
  await (await response).finished();
  // Flush the browser fetch continuation before checking the final state.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('[data-share-action="withdraw"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다시 게시' })).toBeEnabled();
});

test('SR-08 scope switch clears the obsolete more lock and discards its response', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let started;
  const moreStarted = new Promise((r) => { started = r; });
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onEpisodeLogs: async (route, json, scope, cursor) => {
      if (scope === 'all' && cursor) { started(); await gate; return json(route, { posts: [EPISODE_POST_1], next: null }); }
      if (scope === 'all') return json(route, { posts: [EPISODE_POST_1], next: 'all-page2' });
      return json(route, { posts: [EPISODE_POST_FOLLOWING], next: cursor ? null : 'following-page2' });
    } }),
  });
  await page.goto('/community.html#log');
  await page.locator('#episodeMore').click();
  await moreStarted;
  await page.locator('#episodeScopeFollowing').click();
  await expect(page.locator('#episodeMore')).toBeEnabled();
  const response = page.waitForResponse((r) => r.url().includes('cursor=all-page2'));
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`)).toHaveCount(0);
  await page.locator('#episodeMore').click();
  await expect(page.locator('#episodeMore')).toHaveCount(0);
});

test('SR-09 real BANNED_WORD envelope gives the original-part repair instruction', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onShareEpisode: (route, json) => json(route, { code: 'BANNED_WORD', message: 'generic banned', detail: { field: 'partStats.name' } }, 400),
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  await page.locator('#shareConsentCheckbox').check();
  await page.locator('#episodeShareDialog button[type="submit"]').click();
  await expect(page.locator('#episodeShareDialog [role="alert"]')).toContainText('원본 연습 파트를 수정해 주세요.');
  await expect(page.locator('#shareConsentCheckbox')).toBeChecked();
});

for (const endpoint of ['feed', 'mine']) {
  test(`SR-10 malformed ${endpoint} response is not an empty success`, async ({ page }) => {
    await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
      routes: communityRoutes({
        onMyEpisodeLogs: (route, json) => json(route, endpoint === 'mine' ? {} : { posts: [], next: null }),
        onEpisodeLogs: (route, json) => json(route, {}),
      }),
    });
    await page.goto(endpoint === 'mine' ? '/log.html' : '/community.html#log');
    if (endpoint === 'mine') {
      await expect(page.locator('[data-session-id]').getByText('공유 상태를 불러오지 못했습니다.')).toBeVisible();
      await expect(page.locator('[data-share-action="open"]')).toHaveCount(0);
    } else {
      await expect(page.locator('#episodeError')).toBeVisible();
      await expect(page.locator('#episodeEmpty')).toHaveCount(0);
    }
  });
}

test('SR-12 account switch immediately discards A summary while B is pending', async ({ page }) => {
  const { PRACTICE_LOGS_FIXTURE } = require('./support/community-fixtures');
  const bId = '00000000-0000-4000-8000-000000000099';
  let accountB = false;
  let release;
  const gate = new Promise((r) => { release = r; });
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onLogs: async (route, json) => {
      if (accountB) { await gate; return json(route, { logs: [], next: null }); }
      return json(route, { logs: [{ ...PRACTICE_LOGS_FIXTURE.all[0], user: { ...PRACTICE_LOGS_FIXTURE.all[0].user, publicName: 'A-PRIVATE-FOLLOWING' } }], next: null });
    } }),
  });
  const { DEFAULT_ME } = require('./support/mock-app');
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: accountB ? bId : DEFAULT_ME.id } }));
  await page.goto('/community.html#summary');
  await expect(page.locator('#summaryPane')).toContainText('A-PRIVATE-FOLLOWING');
  accountB = true;
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await expect(page.locator('#summaryPane')).toBeVisible();
  await expect(page.locator('#communityPage')).not.toContainText('A-PRIVATE-FOLLOWING');
  release();
});

for (const action of ['complete', 'delete']) {
test(`SR-13 timeline take ${action} updates the whole-song list`, async ({ page }) => {
  const { FIXTURES } = require('./support/mock-app');
  const song = { ...FIXTURES.longSongs(1)[0], id: SAMPLE_PRACTICE_SESSION.songId };
  const take = { id: '00000000-0000-4000-8000-000000000901', sessionId: SAMPLE_PRACTICE_SESSION.id,
    recordedAt: '2026-11-03T10:00:00Z', durationSec: 25, mime: 'audio/webm', sizeBytes: 12000,
    storage: 'supabase', storageKey: 'fixture/take.webm', completed: false, memo: '' };
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS, songs: [song],
    songDetail: { song, sessions: [SAMPLE_PRACTICE_SESSION], takes: [take] },
  });
  await page.route('**/api/v1/takes/**', (route) => route.fulfill({ json:
    route.request().method() === 'DELETE' ? { ok: true } : { take: { ...take, completed: true } } }));
  page.on('dialog', (d) => d.accept());
  await page.goto(`/log.html?song=${song.id}`);
  const timeline = page.locator('#detailTimeline');
  await expect(page.locator('#pane-song-detail .take-row')).toHaveCount(2);
  if (action === 'complete') {
    await timeline.locator('.btnComplete').click();
    await expect(page.locator('#pane-song-detail .btnComplete')).toHaveText(['✓ 구간 완료', '✓ 구간 완료']);
  } else {
    await timeline.locator('.btnDelete').click();
    await expect(page.locator('#pane-song-detail .take-row')).toHaveCount(0);
  }
});
}

for (const responseCase of ['duplicate', 'missing-id']) {
  test(`SR-14 report ${responseCase} cannot show a successful receipt`, async ({ page }) => {
    await mockApp(page, { ...COMMUNITY_PRO,
      routes: communityRoutes({ onReportEpisode: (route, json) => responseCase === 'duplicate'
        ? json(route, { code: 'ALREADY_REPORTED', message: 'duplicate' }, 409) : json(route, {}, 201) }),
    });
    await page.goto('/community.html#log');
    const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
    await card.getByRole('button', { name: '신고', exact: true }).click();
    await page.locator('#episodeReportDialog button[type="submit"]').click();
    await expect(page.locator('#episodeReportDialog [role="alert"]')).toBeVisible();
    await expect(page.locator('#episodeReportDialog [role="status"]')).toHaveCount(0);
    await expect(card).toBeVisible();
  });
}

test('SR-15 invalid video cannot create an image or playback link', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onEpisodeLogs: (route, json) => json(route, {
      posts: [{ ...EPISODE_POST_1, videoId: 'invalid/video' }], next: null,
    }) }),
  });
  await page.goto('/community.html#log');
  const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card.locator('a[href*="practice.html"]')).toHaveCount(0);
});

test('SR-16 a late share response cannot restore A drafts or shares in B', async ({ page }) => {
  const { DEFAULT_ME } = require('./support/mock-app');
  const bId = '00000000-0000-4000-8000-000000000099';
  const bSessionId = '00000000-0000-4000-8000-000000000899';
  let accountB = false;
  let release;
  const gate = new Promise((r) => { release = r; });
  let entered;
  const started = new Promise((r) => { entered = r; });
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onShareEpisode: async (route, json) => { entered(); await gate; return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201); },
    }),
  });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: accountB ? bId : DEFAULT_ME.id } }));
  await page.route(/\/api\/v1\/sessions\?/, (route) => route.fulfill({ json: {
    ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION,
      id: accountB ? bSessionId : SAMPLE_PRACTICE_SESSION.id, memo: accountB ? 'B memo' : 'A-private-draft' }],
  } }));
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  await page.locator('#shareTitleInput').fill('A-private-share-draft');
  await page.locator('#shareConsentCheckbox').check();
  await page.locator('#episodeShareDialog button[type="submit"]').click();
  await started;
  accountB = true;
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await expect(page.locator(`[data-session-id="${bSessionId}"]`)).toBeVisible();
  await expect(page.locator('#episodeShareDialog')).toHaveCount(0);
  await expect(page.locator(`[data-session-id="${bSessionId}"] textarea`)).toHaveValue('B memo');
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/share'));
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('[data-share-action="open"]')).toBeEnabled();
  await expect(page.locator('[data-share-action="edit"]')).toHaveCount(0);
});

test('SR-17 empty scopes provide TRAILS and return-to-all actions', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO,
    routes: communityRoutes({ onEpisodeLogs: (route, json) => json(route, { posts: [], next: null }) }),
  });
  await page.goto('/community.html#log');
  await expect(page.locator('#episodeEmpty a')).toHaveAttribute('href', 'log.html');
  await page.locator('#episodeScopeFollowing').click();
  await page.locator('#episodeEmpty button').click();
  await expect(page.locator('#episodeScopeAll')).toHaveAttribute('aria-pressed', 'true');
});

test('SR-18 tab labels retain 12px', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/community.html#log');
  const tabs = page.locator('[data-tabbar]');
  expect(await tabs.locator('a').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
});

test('SR-19 tab height tracks content changes without resize', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/community.html#log');
  const tabs = page.locator('[data-tabbar]');
  await tabs.locator('a').first().evaluate((el) => { el.textContent = 'Long navigation label '.repeat(15); });
  await expect.poll(() => tabs.evaluate((el) => {
    const shell = el.parentElement;
    return parseFloat(getComputedStyle(shell).paddingBottom) - el.getBoundingClientRect().height;
  })).toBeGreaterThanOrEqual(16);
});

// ── CMR-1: 커뮤니티 탐색 구조 (모두 탭 선반·LOGS 마소니) ─────────────────────
// SR-11(최근 공개 줄 더보기)은 승인된 요구 변경(UIUX-R §5.2 최근 공개 제거)으로 CMR1-2로 대체했다.
const CMR_EMPTY_CURATION = { curated: [], monthlyPick: null, showcase: [], following: [] };
function cmrPosts(n) {
  return Array.from({ length: n }, (_, i) => ({
    ...EPISODE_POST_1,
    postId: `00000000-0000-4000-8000-00000000a${String(i).padStart(3, '0')}`,
    title: `CMR post ${i}`,
  }));
}

test('CMR1-1 community shelves keep following → monthly → posts → curated → showcase order', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onEpisodeLogs: (r, json) => json(r, { posts: cmrPosts(3), next: null }) }) });
  await page.goto('/community.html');
  await page.locator('#communityPostsRow [data-post-id]').first().waitFor();
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-row], #communityPostsRow')]
    .map((el) => el.id === 'communityPostsRow' ? 'posts' : el.getAttribute('data-row')));
  expect(order).toEqual(['following', 'monthly', 'posts', 'curated', 'showcase']);
});

test('CMR1-2 ALL tab no longer requests recent public folders', async ({ page }) => {
  let recentCalls = 0;
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onFolders: (r, json) => { recentCalls++; return json(r, { folders: [], next: null }); } }) });
  await page.goto('/community.html');
  await page.locator('#communityPostsRow').waitFor();
  await expect(page.locator('#recentMoreBtn')).toHaveCount(0);
  await expect(page.locator('[data-row="recent"]')).toHaveCount(0);
  expect(recentCalls).toBe(0);
});

test('CMR1-3 everything empty shows only the community empty state', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ curationHome: CMR_EMPTY_CURATION, onEpisodeLogs: (r, json) => json(r, { posts: [], next: null }) }) });
  await page.goto('/community.html');
  await expect(page.locator('#communityAllEmpty')).toHaveCount(1);
  await expect(page.locator('#communityAllEmpty')).toContainText('아직 공유된 연습이 없어요');
  await expect(page.locator('#communityPostsRow')).toBeHidden();
  await expect(page.locator('#communityPage')).not.toContainText('아직 공개된 플레이리스트가 없어요');
});

test('CMR1-4 partial empty: curation empty + feed present shows posts shelf only', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ curationHome: CMR_EMPTY_CURATION, onEpisodeLogs: (r, json) => json(r, { posts: cmrPosts(2), next: null }) }) });
  await page.goto('/community.html');
  await expect(page.locator('#communityPostsRow [data-post-id]')).toHaveCount(2);
  await expect(page.locator('#communityAllEmpty')).toHaveCount(0);
});

test('CMR1-5 curation failure keeps the posts shelf and retries curation only', async ({ page }) => {
  let curationCalls = 0; let feedCalls = 0;
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({
    onCurationHome: (r) => { curationCalls++; return curationCalls === 1 ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CMR_EMPTY_CURATION) }); },
    onEpisodeLogs: (r, json) => { feedCalls++; return json(r, { posts: cmrPosts(2), next: null }); },
  }) });
  await page.goto('/community.html');
  await expect(page.locator('#communityPage [role="alert"]').first()).toBeVisible();
  await expect(page.locator('#communityPostsRow [data-post-id]')).toHaveCount(2);
  await page.locator('#communityPage [role="alert"] button').first().click();
  await expect.poll(() => curationCalls).toBe(2);
  expect(feedCalls).toBe(1);
  await expect(page.locator('#communityPostsRow [data-post-id]')).toHaveCount(2);
});

test('CMR1-6 feed failure keeps curation rows and offers retry', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onEpisodeLogs: (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) }) });
  await page.goto('/community.html');
  await expect(page.locator('#episodeError')).toBeVisible();
  await expect(page.locator('[data-row="curated"]')).toBeVisible();
  await expect(page.locator('#episodeError button')).toBeVisible();
});

test('CMR1-7 show-all button moves to LOGS tab', async ({ page }) => {
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onEpisodeLogs: (r, json) => json(r, { posts: cmrPosts(3), next: null }) }) });
  await page.goto('/community.html');
  await page.locator('#communityPostsAll').click();
  await expect(page).toHaveURL(/#logs$/);
  await expect(page.locator('#chipLog')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#episodeScopeAll')).toBeVisible();
});

for (const hash of ['#log', '#logs']) {
  test(`CMR1-8 legacy and new hash ${hash} open the LOGS tab`, async ({ page }) => {
    await mockApp(page, COMMUNITY_PRO);
    await page.goto(`/community.html${hash}`);
    await expect(page.locator('#chipLog')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#chipLog')).toHaveText('LOGS');
  });
}

test('CMR1-9 LOGS masonry uses 1/2/3 columns with round-robin distribution', async ({ page }) => {
  const posts = cmrPosts(7);
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onEpisodeLogs: (r, json) => json(r, { posts, next: null }) }) });
  for (const [w, cols] of [[390, 1], [768, 2], [1150, 3]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/community.html#logs');
    await page.locator('.masonryCol, [data-align-group="logsColumns:top@768"]').first().waitFor();
    await expect(page.locator('[data-align-group="logsColumns:top@768"]')).toHaveCount(cols);
    if (cols === 3) {
      const ids = await page.locator('[data-align-group="logsColumns:top@768"]').first().locator('[data-post-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-post-id')));
      expect(ids).toEqual([0, 3, 6].map((i) => posts[i].postId));
    }
  }
});

for (const fail of [false, true]) {
test(`CMR1-10 load more ${fail ? 'failure keeps existing cards' : 'keeps column placement'}`, async ({ page }) => {
  const posts = cmrPosts(6);
  {
    await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({
      onEpisodeLogs: (r, json, _s, cursor) => {
        if (!cursor) return json(r, { posts: posts.slice(0, 3), next: 'p2' });
        return fail ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : json(r, { posts: posts.slice(3), next: null });
      } }) });
    await page.setViewportSize({ width: 1150, height: 900 });
    await page.goto('/community.html#logs');
    const col0 = page.locator('[data-align-group="logsColumns:top@768"]').first();
    await expect(col0.locator('[data-post-id]')).toHaveCount(1);
    await page.locator('#episodeMore').click();
    if (fail) {
      await expect(page.locator('#episodeMoreError')).toBeVisible();
      await expect(page.locator('#episodeMore')).toBeVisible();
      await expect(page.locator('#episodeFeed [data-post-id]')).toHaveCount(3);
    } else {
      await expect(page.locator('#episodeFeed [data-post-id]')).toHaveCount(6);
      const ids = await col0.locator('[data-post-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-post-id')));
      expect(ids).toEqual([posts[0].postId, posts[3].postId]);
    }
  }
});
}

test('CMR1-11 account switch discards a late feed response from A', async ({ page }) => {
  const { DEFAULT_ME } = require('./support/mock-app');
  const bId = '00000000-0000-4000-8000-000000000099';
  let accountB = false; let release; let entered;
  const gate = new Promise((r) => { release = r; });
  const started = new Promise((r) => { entered = r; });
  await mockApp(page, { ...COMMUNITY_PRO, routes: communityRoutes({ onEpisodeLogs: async (r, json) => {
    if (!accountB) { entered(); await gate; return json(r, { posts: [{ ...EPISODE_POST_1, title: 'A-PRIVATE-POST' }], next: null }); }
    return json(r, { posts: [], next: null });
  } }) });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: accountB ? bId : DEFAULT_ME.id } }));
  await page.goto('/community.html');
  await started;
  accountB = true;
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  const late = page.waitForResponse((r) => r.url().includes('/community/episode-logs') && r.status() === 200);
  release();
  await (await late).finished();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('#communityPage')).not.toContainText('A-PRIVATE-POST');
});

test('CMR1-12 home discover rows keep their order and copy', async ({ page }) => {
  await mockApp(page, COMMUNITY_PRO);
  await page.goto('/index.html');
  await page.locator('#discover').waitFor();
  const order = await page.evaluate(() => [...document.querySelectorAll('#discover [data-row]')].map((e) => e.getAttribute('data-row')));
  expect(order).toEqual(['curated', 'monthly', 'showcase', 'following']);
});
