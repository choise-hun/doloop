// 연습 화면 정렬 검사 (FT-2 · SR-1): 공통 검사 G0~G8 + #songRecord 배치 약속(sr-left, sr-cols)
// 규격: 개발산출물/프론트_정렬규격.md · 명세: 개발산출물/명세/SR-1_구현명세.md §3
'use strict';
const { expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { STATES, FIXTURES } = require('../support/mock-app');

const SONG_0 = FIXTURES.longSongs(1)[0];

const SR_SONG_DETAIL = {
  song: SONG_0,
  takes: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      sessionId: '00000000-0000-4000-8000-000000000801',
      recordedAt: '2026-11-05T10:00:00Z',
      a: 12,
      b: 48,
      rate: 0.75,
      durationSec: 25,
      mime: 'audio/webm',
      sizeBytes: 12000,
      storage: 'supabase',
      storageKey: 'u1/tk1.weba',
      memo: '',
    },
    {
      id: '00000000-0000-4000-8000-000000000902',
      sessionId: '00000000-0000-4000-8000-000000000802',
      recordedAt: '2026-11-06T11:30:00Z',
      a: 12,
      b: 48,
      rate: 1,
      durationSec: 36,
      mime: 'audio/webm',
      sizeBytes: 18000,
      storage: 'supabase',
      storageKey: 'u1/tk2.weba',
      memo: '',
    },
  ],
  sessions: Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000080${i + 1}`,
    date: `2026-11-0${6 - i}`,
    seconds: (6 - i) * 180,
    minutes: (6 - i) * 3,
    loops: (6 - i) * 2,
    a: 12,
    b: 48,
    segment: '0:12–0:48',
    rate: 0.75,
    memo: i === 0 ? '인트로 구간 박자 맞춰 반복 연습' : '',
  })),
};

const USER_DATA_SR = {
  ...STATES.userData,
  songDetail: SR_SONG_DETAIL,
};

const USER_EMPTY_SR = {
  ...STATES.userData,
  songDetail: { song: SONG_0, takes: [], sessions: [] },
};

// 영상 없이 연 빈 화면
layoutSuite({
  name: 'practice-empty',
  path: '/practice.html',
  states: ['guest'],
  ready: async (page) => {
    await page.locator('#emptyState').waitFor();
  },
});

// 영상을 연 화면(기기 저장 진행 있음 · 로그인 곡 있음 + 곡 상세 녹음 2·세션 6 · 빈 곡 상세)
layoutSuite({
  name: 'practice',
  path: '/practice.html?v=jNQXAC9IVRw',
  states: [
    'guest',
    'guestLocal',
    { name: 'userData', mock: USER_DATA_SR },
    { name: 'userEmpty', mock: USER_EMPTY_SR },
  ],
  ready: async (page, state) => {
    await page.locator('#seekRow').waitFor();
    await page.locator('#songRecord').waitFor();
    if (state === 'userData') {
      await expect(page.locator('#srTakes .take-row')).toHaveCount(2);
      await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);
    } else if (state === 'userEmpty') {
      await expect(page.locator('#srTakes')).toContainText('아직 녹음이 없어요');
      await expect(page.locator('#srTimeline')).toContainText('아직 연습 세션 기록이 없어요');
    }
  },
  dark: 'userData',
  // 알려진 실패(FT-2 기록, M2에서 다시 만들 때 data-layout-ignore로 표기). 결과/FT-2_전화면점검.md §3
  known: [{ match: /^G3 #songTitle /, why: '곡 제목은 의도한 한 줄 말줄임(nowrap+ellipsis). 예외 표기만 없음' }],
});

