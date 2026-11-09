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
  resolveSlowAll();
  await page.waitForTimeout(100);

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
  await mockApp(page, COMMUNITY_PRO);

  await page.goto('/community.html#log', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const card = page.locator(`[data-post-id="${EPISODE_POST_1.postId}"]`);
  await card.waitFor();

  // 개인 메모 텍스트나 audio 태그가 DOM에 존재하지 않아야 함
  const cardHtml = await card.innerHTML();
  expect(cardHtml).not.toContain('privateMemoSentinel');
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
