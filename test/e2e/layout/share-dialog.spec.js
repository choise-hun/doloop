// 공유 창·공유 아이콘 메뉴 정렬 검사 (S3b-3): 공통 검사 G0~G8 및 배치 약속
// 규격: 개발산출물/프론트_정렬규격.md · 상세 명세: 개발산출물/명세/S3b-3_구현명세.md §5
// 맞춤 그룹: shareHead:center-y(제목·ⓘ·닫기), shareChips:top(칩), shareActions:center-y(취소·게시),
//            sessionHead-{surface}-{id}:center-y(세션 카드 제목·공유 아이콘)
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { STATES } = require('../support/mock-app');
const {
  COMMUNITY_PRO_ME,
  MY_EPISODE_LOG_1,
  SHARE_CONSENT_NONE,
  communityRoutes,
} = require('../support/community-fixtures');

const SESSION_ID = '00000000-0000-4000-8000-000000000811';
const take = (n, durationSec) => ({
  id: `00000000-0000-4000-8000-00000000d00${n}`, sessionId: SESSION_ID, recordedAt: `2026-11-12T10:0${n}:00Z`,
  a: 10, b: 20, rate: 1, durationSec, mime: 'audio/mp4', sizeBytes: 4000, storage: 'supabase',
  storageKey: `k${n}`, memo: '', partName: 'Intro',
});
const SESSION = {
  id: SESSION_ID, songId: '00000000-0000-4000-8000-000000000111', date: '2026-11-12',
  startedAt: '2026-11-12T10:00:00Z', endedAt: '2026-11-12T10:32:00Z', seconds: 1920, loops: 14,
  memo: '', songTitle: 'Neo-Soul Groove', songArtist: 'Mateus Asato', videoId: 'abcdefghij1',
  // 상한 초과 칩(301초) 하나를 포함해 사유 문구까지 배치에 넣는다
  takes: [take(1, 48), take(2, 65), take(3, 301)],
  partStats: [{ name: 'Intro Riff', a: 10, b: 20, rate: 1.0, completed: true, loops: 14, seconds: 1920 }],
};
const SESSIONS = { calendar: [{ date: SESSION.date, totalSeconds: 1920, level: 2 }], sessions: [SESSION] };
const base = { ...STATES.userData, me: COMMUNITY_PRO_ME, sessions: SESSIONS };
const unshared = (extra = {}) => communityRoutes({ onMyEpisodeLogs: (r, json) => json(r, { posts: [], next: null }), ...extra });

const openDialog = async (page) => {
  await page.locator(`[data-session-id="${SESSION_ID}"] [data-share-action="open"]`).click();
  await page.locator('#episodeShareDialog').waitFor();
};

layoutSuite({
  name: 'share-dialog-consent',
  path: '/log.html',
  states: [{ name: 'consent', mock: { ...base, routes: unshared({ consent: SHARE_CONSENT_NONE }) } }],
  ready: async (page) => {
    await openDialog(page);
    await page.locator('#shareConsentAgree').waitFor();
  },
  dark: 'consent',
});

layoutSuite({
  name: 'share-dialog-compose',
  path: '/log.html',
  states: [{ name: 'compose', mock: { ...base, routes: unshared() } }],
  ready: async (page) => {
    await openDialog(page);
    // 칩을 골라 원곡 확인 줄까지 펼친 작성 화면
    await page.locator(`[data-take-chip="${take(2).id}"]`).click();
    await page.locator('#shareOriginalConfirm').waitFor();
    await page.locator('#shareChipLimitHint').waitFor();
  },
  dark: 'compose',
});

layoutSuite({
  name: 'share-menu',
  path: '/log.html',
  states: [{ name: 'menu', mock: { ...base, routes: communityRoutes({
    onMyEpisodeLogs: (r, json) => json(r, { posts: [{ ...MY_EPISODE_LOG_1, sessionId: SESSION_ID,
      attachment: { attachmentId: '00000000-0000-4000-8000-00000000e001', sourceTakeId: take(1).id, mime: 'audio/mp4', durationSec: 48, readyAt: '2026-11-12T11:00:00Z' } }], next: null }),
  }) } }],
  ready: async (page) => {
    await page.locator(`[data-session-id="${SESSION_ID}"] [data-share-action="menu"]`).click();
    await page.locator('[role="menu"] [data-share-action="remove-recording"]').waitFor();
  },
  dark: 'menu',
});

// §5 메뉴: 아이콘 아래로 펼치고 화면 밖으로 넘지 않는다(390에서 오른쪽 정렬)
test('S3b3-LAY 메뉴는 390폭에서도 화면 안에 있고 아이콘 아래에 펼쳐진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { mockApp } = require('../support/mock-app');
  await mockApp(page, { ...base, routes: communityRoutes({
    onMyEpisodeLogs: (r, json) => json(r, { posts: [{ ...MY_EPISODE_LOG_1, sessionId: SESSION_ID }], next: null }),
  }) });
  await page.goto('/log.html');
  const icon = page.locator(`[data-session-id="${SESSION_ID}"] [data-share-action="menu"]`);
  await icon.click();
  const menu = page.locator('[role="menu"]');
  const [iconBox, menuBox] = [await icon.boundingBox(), await menu.boundingBox()];
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
  expect(menuBox.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(icon).toBeFocused();
  await expect(icon).toHaveAttribute('aria-expanded', 'false');
});
