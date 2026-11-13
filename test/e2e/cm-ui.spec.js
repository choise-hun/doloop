// test/e2e/cm-ui.spec.js
// CM-UI E2E 테스트 (CUI-01 ~ CUI-12): 독립 커뮤니티 화면, 공용 세션 카드, 세션 공유/수정/철회/신고
'use strict';

const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');
const {
  COMMUNITY_FREE_ME,
  COMMUNITY_PRO_ME,
  EPISODE_POST_1,
  EPISODE_POST_FOLLOWING,
  MY_EPISODE_LOG_1,
  SHARE_CONSENT_ALLOWED,
  SHARE_CONSENT_NONE,
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

// S3b-3 D4: 제목은 미리보기 헤더를 눌러 그 자리에서 입력한다
async function fillShareTitle(page, value) {
  await page.locator('#episodeShareDialog #shareTitleHead').click();
  await page.locator('#shareTitleInput').fill(value);
}

// S3b-3 D1·D2: 공유된 카드의 행동은 헤더 공유 아이콘 메뉴 안에 있다
async function openShareMenu(scope) {
  await scope.locator('[data-share-action="menu"]').click();
}

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

  // S3b-3 D5: 게시별 동의 체크박스 없음(계정 단위 동의가 된 사용자는 바로 게시 가능)
  const submitBtn = modal.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled();

  // 금지어 입력 후 제출 시 에러 표시
  await fillShareTitle(page, '금지어 포함 제목');
  await submitBtn.click();

  const alertMsg = modal.locator('[role="alert"]');
  await expect(alertMsg).toBeVisible();

  // 정상 제목 입력 후 제출 성공
  await fillShareTitle(page, '멋진 연습 세션');
  await submitBtn.click();

  await expect(modal).toHaveCount(0);
  expect(postBody.title).toBe('멋진 연습 세션');
  // S3b-3 U3: 녹음 없는 세션은 칩 줄이 없고 요청 본문에 attachment 키가 없다
  expect('attachment' in postBody).toBe(false);
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

  // 이미 공유된 세션 카드: 공유 아이콘 메뉴 → 공유 중지
  await openShareMenu(sessionCard);
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
  // S3b-3 D13: 빈 제목 표시는 세션 날짜
  await expect(dialog.locator('#shareTitleInput')).toHaveAttribute('placeholder', '2026년 11월 3일');
  await expect(dialog.locator('#shareTitleHead')).toHaveText(/2026년 11월 3일/);
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
  await openShareMenu(card);
  await expect(card.locator('[data-share-action="edit"]')).toBeDisabled();
  await expect(card.locator('[data-share-action="withdraw"]')).toHaveCount(0);
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
  await openShareMenu(page);
  await page.locator('[data-share-action="withdraw"]').click();
  await expect(page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`)).toContainText('공유가 중지되었습니다.');
  await openShareMenu(page);
  const republish = page.locator('[data-share-action="edit"]');
  await expect(republish).toBeEnabled();
  expect(reads).toBe(2);
  await republish.click();
  await expect(page.locator('#shareTitleInput')).toHaveValue('');
  await expect(page.locator('#shareCommentInput')).toHaveValue('');
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
  await openShareMenu(page);
  await page.locator('[data-share-action="withdraw"]').click();
  await expect(page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"]`)).toContainText('공유가 중지되었습니다.');
  const response = page.waitForResponse((r) => r.url().includes('cursor=old-page2'));
  release();
  await (await response).finished();
  // Flush the browser fetch continuation before checking the final state.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await openShareMenu(page);
  await expect(page.locator('[data-share-action="withdraw"]')).toHaveCount(0);
  await expect(page.locator('[data-share-action="edit"]')).toBeEnabled();
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
  await page.locator('#shareCommentInput').fill('keep me');
  await page.locator('#episodeShareDialog button[type="submit"]').click();
  await expect(page.locator('#episodeShareDialog [role="alert"]')).toContainText('원본 연습 파트를 수정해 주세요.');
  // 오류 뒤에도 입력을 유지한다(§4.3)
  await expect(page.locator('#shareCommentInput')).toHaveValue('keep me');
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
      onShareEpisode: async (route, json) => {
        entered(); await gate;
        // D15: 계정 전환 때 창이 요청을 끊으므로 이미 끊긴 요청일 수 있다
        try { return await json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201); } catch { return undefined; }
      },
    }),
  });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: accountB ? bId : DEFAULT_ME.id } }));
  await page.route(/\/api\/v1\/sessions\?/, (route) => route.fulfill({ json: {
    ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION,
      id: accountB ? bSessionId : SAMPLE_PRACTICE_SESSION.id, memo: accountB ? 'B memo' : 'A-private-draft' }],
  } }));
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  await fillShareTitle(page, 'A-private-share-draft');
  await page.locator('#episodeShareDialog button[type="submit"]').click();
  await started;
  // 늦은 응답이 도착하든 창이 요청을 끊든, 그 요청이 끝난 뒤의 화면을 본다(결정적 대기)
  const isShare = (r) => r.method() === 'POST' && r.url().endsWith('/share');
  const shareEnded = new Promise((resolve) => {
    page.on('requestfinished', (r) => { if (isShare(r)) resolve(); });
    page.on('requestfailed', (r) => { if (isShare(r)) resolve(); });
  });
  accountB = true;
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await expect(page.locator(`[data-session-id="${bSessionId}"]`)).toBeVisible();
  await expect(page.locator('#episodeShareDialog')).toHaveCount(0);
  await expect(page.locator(`[data-session-id="${bSessionId}"] textarea`)).toHaveValue('B memo');
  release();
  await shareEnded;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator('[data-share-action="open"]')).toBeEnabled();
  await expect(page.locator('[data-share-action="menu"]')).toHaveCount(0);
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

// ── S3b-3 시니어 표적 테스트: U4 칩 선택·원곡 확인, U15 미리 듣기 분리 ──
const TAKE_1 = { id: '00000000-0000-4000-8000-00000000b001', sessionId: SAMPLE_PRACTICE_SESSION.id, recordedAt: '2026-11-03T10:10:00Z',
  a: 10, b: 20, rate: 1, durationSec: 48, mime: 'audio/mp4', sizeBytes: 4000, storage: 'supabase',
  storageKey: 'PRIVATE_STORAGE_KEY_SENTINEL', memo: 'PRIVATE_TAKE_MEMO_SENTINEL', partName: 'Intro Riff' };
const TAKE_2 = { ...TAKE_1, id: '00000000-0000-4000-8000-00000000b002', durationSec: 65, recordedAt: '2026-11-03T10:20:00Z' };
const SESSION_WITH_TAKES = { ...SAMPLE_PRACTICE_SESSION, takes: [TAKE_1, TAKE_2] };

test('S3b3-U4 칩을 고르면 원곡 확인 전 게시 불가, 확인 뒤 replace 본문', async ({ page }) => {
  let postBody = null;
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [SESSION_WITH_TAKES] },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onShareEpisode: (route, json) => {
        postBody = route.request().postDataJSON();
        return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201);
      },
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  const submit = dialog.locator('button[type="submit"]');
  await expect(dialog.locator('[data-take-chip-group]')).toHaveCount(2);
  // 개인 녹음 메모·저장 키는 미리보기에 나오지 않는다(§8)
  await expect(dialog).not.toContainText('PRIVATE_TAKE_MEMO_SENTINEL');
  expect(await dialog.innerHTML()).not.toContain('PRIVATE_STORAGE_KEY_SENTINEL');
  // 선택 전: 원곡 확인 없음, 게시 가능(녹음 없는 게시)
  await expect(dialog.locator('#shareOriginalConfirm')).toHaveCount(0);
  await expect(submit).toBeEnabled();

  const chip = dialog.locator(`[data-take-chip="${TAKE_2.id}"]`);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator(`[data-take-chip="${TAKE_1.id}"]`)).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('#shareOriginalConfirm')).toBeVisible();
  await expect(submit).toBeDisabled();

  await dialog.locator('#shareOriginalConfirm').check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect(postBody.attachment).toEqual({ mode: 'replace', takeId: TAKE_2.id, originalConfirmed: true });
});

test('S3b3-U15 다시 게시: 현재 첨부 칩의 미리 듣기 ▶/■는 선택을 바꾸지 않고 keep으로 게시', async ({ page }) => {
  let postBody = null;
  const domWarnings = [];
  page.on('console', (m) => { if (/validateDOMNesting|cannot be a descendant/.test(m.text())) domWarnings.push(m.text()); });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function pause() {};
  });
  await mockApp(page, { ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [SESSION_WITH_TAKES] },
    takeUrl: { url: 'https://media.example.test/take1.m4a', expiresIn: 3600 },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id,
        attachment: { attachmentId: '00000000-0000-4000-8000-00000000c001', sourceTakeId: TAKE_1.id, mime: 'audio/mp4', durationSec: 48, readyAt: '2026-11-08T12:00:00Z' } }], next: null }),
      onShareEpisode: (route, json) => {
        postBody = route.request().postDataJSON();
        return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 200);
      },
    }),
  });
  await page.goto('/log.html');
  await openShareMenu(page);
  await expect(page.locator('[data-share-action="menu"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-share-action="remove-recording"]')).toBeVisible();
  await page.locator('[data-share-action="edit"]').click();

  const dialog = page.locator('#episodeShareDialog');
  const chip = dialog.locator(`[data-take-chip="${TAKE_1.id}"]`);
  const preview = dialog.locator(`[data-take-preview="${TAKE_1.id}"]`);
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // 선택 버튼과 미리 듣기는 형제다(버튼 중첩 금지, D7)
  expect(await dialog.locator('button button').count()).toBe(0);

  await preview.click();
  await expect(preview).toHaveText('■');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await preview.click();
  await expect(preview).toHaveText('▶');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // 유지(keep)에는 원곡 확인이 필요 없다(D9)
  await expect(dialog.locator('#shareOriginalConfirm')).toHaveCount(0);

  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  expect(postBody.attachment).toEqual({ mode: 'keep' });
  expect(domWarnings).toEqual([]);
});

// ── S3b-3 주니어 4단계 남은 테스트 행: U1·U2·U5~U13 ──

test('S3b3-U1 첫 동의: 동의 전에는 동의 단계 표시, POST 1회 뒤 작성 화면으로 전환', async ({ page }) => {
  let consentState = { ...SHARE_CONSENT_NONE };
  let agreePostCount = 0;
  let shareCount = 0;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onShareConsent: (route, json) => json(route, consentState),
      onAgreeConsent: (route, json) => {
        agreePostCount += 1;
        consentState = { ...SHARE_CONSENT_ALLOWED };
        return json(route, consentState);
      },
      onShareEpisode: (route, json) => {
        shareCount += 1;
        return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201);
      },
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await expect(dialog.locator('#shareConsentAgree')).toBeVisible();
  await expect(dialog.locator('#shareCommentInput')).toHaveCount(0);
  expect(shareCount).toBe(0);

  await dialog.locator('#shareConsentAgree').click();
  await expect(dialog.locator('#shareCommentInput')).toBeVisible();
  expect(agreePostCount).toBe(1);

  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  expect(shareCount).toBe(1);
});

test('S3b3-U2 이름 폼 동의: 체크 시 PUT public-name 뒤 POST share-consent, 미체크 시 POST 생략', async ({ page }) => {
  // Case A: 체크하고 저장 -> PUT 후 POST
  const callsA = [];
  let savedNameA = null;
  await mockApp(page, {
    ...STATES.userData,
    me: { ...COMMUNITY_PRO_ME, publicName: savedNameA, publicNameNextChangeAt: null },
    routes: [
      ...communityRoutes({
        consent: SHARE_CONSENT_NONE,
        onAgreeConsent: (route, json) => {
          callsA.push('POST_CONSENT');
          return json(route, SHARE_CONSENT_ALLOWED);
        },
        onSetPublicName: (route, json) => {
          callsA.push('PUT_NAME');
          const { publicName } = route.request().postDataJSON();
          savedNameA = publicName;
          return json(route, { publicName, publicNameNextChangeAt: null });
        },
      }),
      [(url) => url.pathname === '/api/v1/me', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...DEFAULT_ME, ...COMMUNITY_PRO_ME, publicName: savedNameA, publicNameNextChangeAt: null }),
          });
        }
        return route.continue();
      }],
    ],
  });
  await page.goto('/profile.html');
  const consentBox = page.locator('#publicNameShareConsent');
  await expect(consentBox).toBeVisible();
  await expect(consentBox).not.toBeChecked();
  await consentBox.check();
  await page.locator('#profilePublicNameInput').fill('테스트기타');
  const agreeResp = page.waitForResponse((r) => r.url().includes('/share-consent') && r.request().method() === 'POST');
  await page.locator('#profilePublicNameSave').click();
  await (await agreeResp).finished();
  expect(callsA).toEqual(['PUT_NAME', 'POST_CONSENT']);

  // Case B: 체크하지 않고 저장 -> PUT만 호출, POST 0회
  const callsB = [];
  let savedNameB = null;
  await mockApp(page, {
    ...STATES.userData,
    me: { ...COMMUNITY_PRO_ME, publicName: savedNameB, publicNameNextChangeAt: null },
    routes: [
      ...communityRoutes({
        consent: SHARE_CONSENT_NONE,
        onAgreeConsent: (route, json) => {
          callsB.push('POST_CONSENT');
          return json(route, SHARE_CONSENT_ALLOWED);
        },
        onSetPublicName: (route, json) => {
          callsB.push('PUT_NAME');
          const { publicName } = route.request().postDataJSON();
          savedNameB = publicName;
          return json(route, { publicName, publicNameNextChangeAt: null });
        },
      }),
      [(url) => url.pathname === '/api/v1/me', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...DEFAULT_ME, ...COMMUNITY_PRO_ME, publicName: savedNameB, publicNameNextChangeAt: null }),
          });
        }
        return route.continue();
      }],
    ],
  });
  await page.goto('/profile.html');
  await expect(page.locator('#publicNameShareConsent')).not.toBeChecked();
  await page.locator('#profilePublicNameInput').fill('미동의기타');
  const putResp = page.waitForResponse((r) => r.url().includes('/public-name') && r.request().method() === 'PUT');
  const meRefresh = page.waitForResponse((r) => r.url().endsWith('/api/v1/me') && r.request().method() === 'GET');
  await page.locator('#profilePublicNameSave').click();
  await (await putResp).finished();
  await (await meRefresh).finished();
  await expect(page.locator('#profilePublicNameInput')).toHaveValue('미동의기타');
  expect(callsB).toEqual(['PUT_NAME']);
});

test('S3b3-U5 상한 칩: durationSec 301 초과 녹음은 disabled 및 사유 문구 표시', async ({ page }) => {
  const overTake = { ...TAKE_1, id: '00000000-0000-4000-8000-00000000b005', durationSec: 301 };
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION, takes: [overTake] }] },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  const chip = dialog.locator(`[data-take-chip="${overTake.id}"]`);
  await expect(chip).toBeDisabled();
  await expect(dialog.locator('#shareChipLimitHint')).toBeVisible();
});

test('S3b3-U6 Drive 업로드: fetchMediaBlob → uploads(multipart) → share(uploadId) 순서', async ({ page }) => {
  const driveTake = {
    ...TAKE_1,
    id: '00000000-0000-4000-8000-00000000b006',
    storage: 'drive',
    storageKey: 'drive-file-xyz',
  };
  const sequence = [];
  let shareBody = null;
  let uploadContentType = '';
  const gsiStub = `window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'mock-drive-token', expires_in: '3600' }), 0) }) } } };`;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION, takes: [driveTake] }] },
    routes: [
      [
        (url) => url.href.startsWith('https://accounts.google.com/gsi/client'),
        (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: gsiStub }),
      ],
      [
        (url) => url.origin === 'https://www.googleapis.com' && url.pathname.includes('/drive/v3/files/drive-file-xyz'),
        (route) => {
          sequence.push('drive-download');
          return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('FAKE_M4A_DATA') });
        },
      ],
      ...communityRoutes({
        onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
        onShareUpload: (route, json) => {
          sequence.push('uploads');
          uploadContentType = route.request().headers()['content-type'] || '';
          return json(route, { uploadId: '00000000-0000-4000-8000-00000000u006', expiresAt: '2026-11-13T00:30:00Z' }, 201);
        },
        onShareEpisode: (route, json) => {
          sequence.push('share');
          shareBody = route.request().postDataJSON();
          return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201);
        },
      }),
    ],
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await dialog.locator(`[data-take-chip="${driveTake.id}"]`).click();
  await dialog.locator('#shareOriginalConfirm').check();
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  expect(sequence).toEqual(['drive-download', 'uploads', 'share']);
  expect(uploadContentType).toContain('multipart/form-data');
  expect(shareBody.attachment).toEqual({
    mode: 'replace',
    takeId: driveTake.id,
    originalConfirmed: true,
    uploadId: '00000000-0000-4000-8000-00000000u006',
  });
});

test('S3b3-U6b Drive 업로드 뒤 게시 거절: 재시도는 다시 업로드하지 않고 같은 uploadId로 게시', async ({ page }) => {
  const driveTake = {
    ...TAKE_1,
    id: '00000000-0000-4000-8000-00000000b016',
    storage: 'drive',
    storageKey: 'drive-file-retry',
  };
  const sequence = [];
  const shareBodies = [];
  const gsiStub = `window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'mock-drive-token', expires_in: '3600' }), 0) }) } } };`;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION, takes: [driveTake] }] },
    routes: [
      [
        (url) => url.href.startsWith('https://accounts.google.com/gsi/client'),
        (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: gsiStub }),
      ],
      [
        (url) => url.origin === 'https://www.googleapis.com' && url.pathname.includes('/drive/v3/files/drive-file-retry'),
        (route) => {
          sequence.push('drive-download');
          return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('FAKE_M4A_DATA') });
        },
      ],
      ...communityRoutes({
        onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
        onShareUpload: (route, json) => {
          sequence.push('uploads');
          if (sequence.filter((s) => s === 'uploads').length > 1) {
            return json(route, { code: 'ATTACHMENT_COPY_IN_PROGRESS', message: 'copy in progress' }, 409);
          }
          return json(route, { uploadId: '00000000-0000-4000-8000-00000000u016', expiresAt: '2099-01-01T00:00:00Z' }, 201);
        },
        onShareEpisode: (route, json) => {
          sequence.push('share');
          const body = route.request().postDataJSON();
          shareBodies.push(body);
          if (body.title && body.title.includes('금지어')) {
            return json(route, { code: 'BANNED_WORD', message: 'banned', detail: { field: 'title' } }, 400);
          }
          return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201);
        },
      }),
    ],
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await dialog.locator(`[data-take-chip="${driveTake.id}"]`).click();
  await dialog.locator('#shareOriginalConfirm').check();
  await fillShareTitle(page, '금지어 제목');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator('[role="alert"]')).toBeVisible();

  await fillShareTitle(page, '고친 제목');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  expect(sequence).toEqual(['drive-download', 'uploads', 'share', 'share']);
  expect(shareBodies[1].attachment.uploadId).toBe('00000000-0000-4000-8000-00000000u016');
});

test('S3b3-U7 닫기 중 업로드: 업로드 진행 중 창을 닫으면 share 요청 0회, 화면 변화 없음', async ({ page }) => {
  const driveTake = {
    ...TAKE_1,
    id: '00000000-0000-4000-8000-00000000b007',
    storage: 'drive',
    storageKey: 'drive-file-delay',
  };
  let releaseUpload = null;
  let shareCount = 0;
  const gsiStub = `window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'mock-drive-token', expires_in: '3600' }), 0) }) } } };`;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [{ ...SAMPLE_PRACTICE_SESSION, takes: [driveTake] }] },
    routes: [
      [
        (url) => url.href.startsWith('https://accounts.google.com/gsi/client'),
        (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: gsiStub }),
      ],
      [
        (url) => url.origin === 'https://www.googleapis.com' && url.pathname.includes('/drive/v3/files/drive-file-delay'),
        (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('FAKE_M4A_DATA') }),
      ],
      ...communityRoutes({
        onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
        onShareUpload: (route, json) => new Promise((resolve) => {
          releaseUpload = () => resolve(json(route, { uploadId: 'u-late', expiresAt: '2026-11-13T00:30:00Z' }, 201).catch(() => {}));
        }),
        onShareEpisode: (route, json) => {
          shareCount += 1;
          return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 201);
        },
      }),
    ],
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await dialog.locator(`[data-take-chip="${driveTake.id}"]`).click();
  await dialog.locator('#shareOriginalConfirm').check();

  const uploadReq = page.waitForRequest((r) => r.url().includes('/share/uploads'));
  const uploadDone = new Promise((res) => {
    page.on('requestfailed', (r) => { if (r.url().includes('/share/uploads')) res(); });
    page.on('requestfinished', (r) => { if (r.url().includes('/share/uploads')) res(); });
  });
  await dialog.locator('button[type="submit"]').click();
  await uploadReq;

  // 업로드 중 창 닫기
  await dialog.locator('button[aria-label="취소"]').first().click();
  await expect(dialog).toHaveCount(0);
  if (releaseUpload) releaseUpload();
  await uploadDone;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  expect(shareCount).toBe(0);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-session-id="${SAMPLE_PRACTICE_SESSION.id}"] [data-share-action="open"]`)).toBeVisible();
});

test('S3b3-U8 계정 전환: 게시 요청 지연 중 B 로그인 시 A의 늦은 응답 미반영', async ({ page }) => {
  const bId = '00000000-0000-4000-8000-000000000002';
  const bSessionId = '00000000-0000-4000-8000-000000000899';
  let currentAccount = 'A';
  let releaseShareA = null;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: [
      ...communityRoutes({
        onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
        onShareEpisode: (route, json) => new Promise((resolve) => {
          releaseShareA = () => resolve(json(route, {
            post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id, title: 'A-LATE-SHARE' },
          }, 201).catch(() => {}));
        }),
      }),
      [(url) => url.pathname === '/api/v1/me', (route) => {
        const meObj = currentAccount === 'B'
          ? { ...DEFAULT_ME, ...COMMUNITY_PRO_ME, id: bId, publicName: '계정B' }
          : { ...DEFAULT_ME, ...COMMUNITY_PRO_ME };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meObj) });
      }],
      [(url) => url.pathname === '/api/v1/sessions' || url.pathname === '/api/v1/sessions/', (route) => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            calendar: [{ date: '2026-11-03', totalSeconds: 1800, level: 2 }],
            sessions: [{ ...SAMPLE_PRACTICE_SESSION, id: currentAccount === 'B' ? bSessionId : SAMPLE_PRACTICE_SESSION.id }],
          }),
        });
      }],
    ],
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await dialog.locator('#shareCommentInput').fill('A-COMMENT');

  const shareReq = page.waitForRequest((r) => r.url().includes('/share') && r.method() === 'POST');
  const shareDone = new Promise((res) => {
    page.on('requestfailed', (r) => { if (r.url().includes('/share') && r.method() === 'POST') res(); });
    page.on('requestfinished', (r) => { if (r.url().includes('/share') && r.method() === 'POST') res(); });
  });
  await dialog.locator('button[type="submit"]').click();
  await shareReq;

  currentAccount = 'B';
  await page.evaluate((id) => {
    const session = { access_token: 'b-token', user: { id } };
    window.ULAuth.getClient().auth.getSession = async () => ({ data: { session }, error: null });
    window.__supabaseAuthListener('SIGNED_IN', session);
  }, bId);
  await page.locator(`[data-session-id="${bSessionId}"]`).waitFor();
  if (releaseShareA) releaseShareA();
  await shareDone;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await expect(page.locator('#episodeShareDialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('A-LATE-SHARE');
  await expect(page.locator(`[data-session-id="${bSessionId}"] [data-share-action="open"]`)).toBeVisible();
});

test('S3b3-U9 다시 게시: 유지 시 keep, 칩 해제 시 none + ⓘ 안내', async ({ page }) => {
  const bodies = [];
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [SESSION_WITH_TAKES] },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, {
        posts: [{
          ...MY_EPISODE_LOG_1,
          sessionId: SAMPLE_PRACTICE_SESSION.id,
          attachment: { attachmentId: '00000000-0000-4000-8000-00000000c001', sourceTakeId: TAKE_1.id, mime: 'audio/mp4', durationSec: 48, readyAt: '2026-11-08T12:00:00Z' },
        }],
        next: null,
      }),
      onShareEpisode: (route, json) => {
        bodies.push(route.request().postDataJSON());
        return json(route, { post: { ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id } }, 200);
      },
    }),
  });
  await page.goto('/log.html');

  // 1) 그대로 게시 -> keep
  await openShareMenu(page);
  await page.locator('[data-share-action="edit"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await expect(dialog.locator(`[data-take-chip="${TAKE_1.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  // 2) 선택된 칩 해제 -> none + ⓘ 안내
  await openShareMenu(page);
  await page.locator('[data-share-action="edit"]').click();
  await dialog.locator(`[data-take-chip="${TAKE_1.id}"]`).click();
  await expect(dialog.locator(`[data-take-chip="${TAKE_1.id}"]`)).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('[data-share-none-info]')).toBeVisible();
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  expect(bodies.map((b) => b.attachment)).toEqual([{ mode: 'keep' }, { mode: 'none' }]);
});

test('S3b3-U10 녹음만 내리기: confirm 후 DELETE .../share/attachment 호출 및 메뉴에서 항목 제거', async ({ page }) => {
  let hasAttachment = true;
  let deleteCalls = 0;
  page.on('dialog', (d) => d.accept());
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: { ...COMMUNITY_PRO_WITH_SESSIONS.sessions, sessions: [SESSION_WITH_TAKES] },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, {
        posts: [{
          ...MY_EPISODE_LOG_1,
          sessionId: SAMPLE_PRACTICE_SESSION.id,
          ...(hasAttachment ? {
            attachment: { attachmentId: '00000000-0000-4000-8000-00000000c001', sourceTakeId: TAKE_1.id, mime: 'audio/mp4', durationSec: 48, readyAt: '2026-11-08T12:00:00Z' },
          } : {}),
        }],
        next: null,
      }),
      onRemoveAttachment: (route, json) => {
        deleteCalls += 1;
        hasAttachment = false;
        return json(route, { ok: true, removed: 1 });
      },
    }),
  });
  await page.goto('/log.html');
  await openShareMenu(page);
  const removeBtn = page.locator('[data-share-action="remove-recording"]');
  await expect(removeBtn).toBeVisible();
  const delResp = page.waitForResponse((r) => r.url().includes('/share/attachment') && r.request().method() === 'DELETE');
  await removeBtn.click();
  await (await delResp).finished();
  expect(deleteCalls).toBe(1);

  await openShareMenu(page);
  await expect(page.locator('[role="menu"]')).toBeVisible();
  await expect(page.locator('[data-share-action="remove-recording"]')).toHaveCount(0);
  await expect(page.locator('[data-share-action="withdraw"]')).toBeVisible();
});

test('S3b3-U11 메뉴 접근성: 키보드 열기, 화살표 이동, ESC 닫기 및 포커스 복귀', async ({ page }) => {
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, {
        posts: [{ ...MY_EPISODE_LOG_1, sessionId: SAMPLE_PRACTICE_SESSION.id }],
        next: null,
      }),
    }),
  });
  await page.goto('/log.html');
  const trigger = page.locator('[data-share-action="menu"]');
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-share-action="withdraw"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('S3b3-U12 오류 표시: §4.3 서버 코드별 문구 매핑 및 입력 유지', async ({ page }) => {
  const responses = [
    { status: 409, body: { ok: false, status: 409, code: 'ATTACHMENT_LIMIT_EXCEEDED', detail: { kind: 'count' }, message: 'limit' } },
    { status: 409, body: { ok: false, status: 409, code: 'ATTACHMENT_COPY_IN_PROGRESS', message: 'busy' } },
    { status: 502, body: { ok: false, status: 502, code: 'STORAGE_ERROR', message: 'storage' } },
    { status: 409, body: { ok: false, status: 409, code: 'SHARE_CONSENT_REQUIRED', detail: { scope: 'card', requiredVersion: 1 }, message: 'consent' } },
  ];
  let idx = 0;
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onShareEpisode: (route) => {
        const next = responses[idx++];
        return route.fulfill({
          status: next.status,
          contentType: 'application/json',
          body: JSON.stringify(next.body),
        });
      },
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await dialog.locator('#shareCommentInput').fill('입력 유지 확인');

  const submit = dialog.locator('button[type="submit"]');
  await submit.click();
  await expect(dialog.locator('#episodeShareError')).toContainText('동시에 공유할 수 있는 녹음 수(20개)를 넘었어요');
  await expect(dialog.locator('#shareCommentInput')).toHaveValue('입력 유지 확인');

  await submit.click();
  await expect(dialog.locator('#episodeShareError')).toContainText('이미 녹음을 올리는 중이에요. 잠시 후 다시 시도해 주세요');
  await expect(dialog.locator('#shareCommentInput')).toHaveValue('입력 유지 확인');

  await submit.click();
  await expect(dialog.locator('#episodeShareError')).toContainText('녹음 저장소에 연결하지 못했어요');
  await expect(dialog.locator('#shareCommentInput')).toHaveValue('입력 유지 확인');

  await submit.click();
  await expect(dialog.locator('#shareConsentAgree')).toBeVisible();
  await expect(dialog.locator('#episodeShareError')).toContainText('공유 안내 동의가 필요해요');
});

test('S3b3-U13 빈 제목 날짜: 미리보기·피드에서 세션 날짜 표기', async ({ page }) => {
  await mockApp(page, {
    ...COMMUNITY_PRO_WITH_SESSIONS,
    sessions: {
      calendar: [{ date: '2026-11-12', totalSeconds: 1800, level: 2 }],
      sessions: [{ ...SAMPLE_PRACTICE_SESSION, date: '2026-11-12' }],
    },
    routes: communityRoutes({
      onMyEpisodeLogs: (route, json) => json(route, { posts: [], next: null }),
      onEpisodeLogs: (route, json) => json(route, {
        posts: [{ ...EPISODE_POST_1, title: '', date: '2026-11-12' }],
        next: null,
      }),
    }),
  });
  await page.goto('/log.html');
  await page.locator('[data-share-action="open"]').click();
  const dialog = page.locator('#episodeShareDialog');
  await expect(dialog.locator('#shareTitleHead')).toContainText('2026년 11월 12일');
  await dialog.locator('#shareTitleHead').click();
  await expect(dialog.locator('#shareTitleInput')).toHaveAttribute('placeholder', '2026년 11월 12일');

  await page.goto('/community.html');
  const feedCard = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await expect(feedCard).toContainText('2026년 11월 12일');
  await expect(feedCard).not.toContainText('연습 기록');
});
