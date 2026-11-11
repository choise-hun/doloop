// SR-1 연습 화면 곡별 연습 기록·녹음 동작 및 무료 한도 모달 검증 (SR1-1 ~ SR1-6)
// 명세: 개발산출물/명세/SR-1_구현명세.md §5
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, FIXTURES } = require('./support/mock-app');

const SONGS = FIXTURES.longSongs(2);
const SONG_1 = { ...SONGS[0], id: '00000000-0000-4000-8000-000000000101', videoId: 'jNQXAC9IVRw', title: '첫 번째 연습 곡' };
const SONG_2 = { ...SONGS[1], id: '00000000-0000-4000-8000-000000000102', videoId: 'dQw4w9WgXcQ', title: '두 번째 연습 곡' };

const DETAIL_1 = {
  song: SONG_1,
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
    memo: '',
  })),
};

const DETAIL_2 = {
  song: SONG_2,
  takes: [
    {
      id: '00000000-0000-4000-8000-000000000999',
      sessionId: '00000000-0000-4000-8000-000000000899',
      recordedAt: '2026-11-06T15:45:00Z',
      a: 0,
      b: 30,
      rate: 0.5,
      durationSec: 42,
      mime: 'audio/webm',
      sizeBytes: 20000,
      storage: 'supabase',
      storageKey: 'u1/tk999.weba',
      memo: '',
    },
  ],
  sessions: [
    {
      id: '00000000-0000-4000-8000-000000000899',
      date: '2026-11-06',
      seconds: 420,
      minutes: 7,
      loops: 4,
      a: 0,
      b: 30,
      segment: '0:00–0:30',
      rate: 0.5,
      memo: '',
    },
  ],
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

test('SR1-1·SR1-2: userData + 곡 상세(녹음 2·세션 6) 위치·내용·더 보기·기록 링크 검증', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1, SONG_2],
    songDetail: DETAIL_1,
  });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  const songRecord = page.locator('#songRecord');
  await expect(songRecord).toBeVisible();

  // #songRecord가 .pp-main 아래, footer보다 위
  const positions = await page.evaluate(() => {
    const main = document.querySelector('.pp-main').getBoundingClientRect();
    const sr = document.getElementById('songRecord').getBoundingClientRect();
    const foot = document.querySelector('footer').getBoundingClientRect();
    return { mainBottom: main.bottom, srTop: sr.top, srBottom: sr.bottom, footTop: foot.top };
  });
  expect(positions.srTop).toBeGreaterThanOrEqual(positions.mainBottom - 1);
  expect(positions.footTop).toBeGreaterThanOrEqual(positions.srBottom - 1);

  // SR1-2: 기록에서 자세히 → 링크
  const detailLink = songRecord.locator('a', { hasText: '기록에서 자세히 →' });
  await expect(detailLink).toHaveAttribute('href', `log.html?song=${SONG_1.id}`);

  // SR1-1: 녹음 2개, 세션 5개 + 더 보기 누르면 6개
  await expect(page.locator('#songRecord .take-row')).toHaveCount(2);
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);

  const moreBtn = songRecord.locator('button', { hasText: '더 보기' });
  await expect(moreBtn).toBeVisible();
  await moreBtn.click();
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(6);
  await expect(moreBtn).toBeHidden();
});

test('SR1-3: guest 비로그인 시 한 줄 안내만 보이고 테이크 행 없음, 빈 화면(#emptyState)에서는 #songRecord 없음', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, STATES.guest);

  // 1) 영상 없는 빈 화면(#emptyState)
  await page.goto('/practice.html', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#songRecord')).toHaveCount(0);

  // 2) 영상 있는 비로그인 화면
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  await expect(page.locator('#songRecord')).toBeVisible();
  await expect(page.locator('#songRecord')).toContainText('로그인하면 이 곡의 연습 기록과 녹음이 여기에 모여요');
  await expect(page.locator('#songRecord .take-row')).toHaveCount(0);
});

test('SR1-4: 곡 전환 비동기 레이스 — 첫 곡 응답이 늦게 도착해도 둘째 곡 기록만 보임', async ({ page }) => {
  let resolveFirstSong;
  const firstSongDelayed = new Promise((r) => {
    resolveFirstSong = r;
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1, SONG_2],
    routes: [
      [
        (url) => url.pathname === `/api/v1/songs/${SONG_1.id}`,
        async (route) => {
          await firstSongDelayed;
          return json(route, DETAIL_1);
        },
      ],
      [
        (url) => url.pathname === `/api/v1/songs/${SONG_2.id}`,
        (route) => json(route, DETAIL_2),
      ],
    ],
  });

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 서랍을 열어 둘째 곡으로 전환
  await page.locator('#libBtn').click();
  const song2Btn = page.locator('#songs button', { hasText: SONG_2.title });
  await expect(song2Btn).toBeVisible();
  const song2DetailResp = page.waitForResponse((res) => res.url().includes(`/api/v1/songs/${SONG_2.id}`));
  await song2Btn.click();
  await song2DetailResp;

  // 둘째 곡 녹음(42초)과 세션 구간이 보임
  await expect(page.locator('#songRecord .take-row')).toHaveCount(1);
  await expect(page.locator('#songRecord')).toContainText('42초');
  await expect(page.locator('#srTimeline')).toContainText('0:00–0:30');

  // 이제 첫 곡의 지연된 응답을 풀어줌
  const song1DetailResp = page.waitForResponse((res) => res.url().includes(`/api/v1/songs/${SONG_1.id}`));
  resolveFirstSong();
  await song1DetailResp;

  // 여전히 둘째 곡 기록만 보여야 함
  await expect(page.locator('#songRecord .take-row')).toHaveCount(1);
  await expect(page.locator('#songRecord')).toContainText('42초');
  await expect(page.locator('#srTimeline')).toContainText('0:00–0:30');
  await expect(page.locator('#srTimeline')).not.toContainText('0:12–0:48');
});

test('SR1-5: 무료 녹음 한도 초과(403 FREE_TAKE_SONG_LIMIT_EXCEEDED) 모달·Drive 버튼 숨김·확인창 후 replaceOldSongTakes 재업로드', async ({ page }) => {
  // 가짜 MediaRecorder + getUserMedia 주입
  await page.addInitScript(() => {
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [{ stop: () => {} }],
    });
    window.MediaRecorder = class FakeMediaRecorder {
      constructor(stream, opts) {
        this.state = 'inactive';
        this.mimeType = (opts && opts.mimeType) || 'audio/webm';
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() {
        this.state = 'recording';
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['fake-audio-bytes'], { type: this.mimeType }) });
        }
      }
      stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
      }
      static isTypeSupported() {
        return true;
      }
    };
  });

  const uploadMetas = [];
  let detailCalls = 0;

  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1],
    routes: [
      [
        (url) => url.pathname === `/api/v1/songs/${SONG_1.id}`,
        (route) => {
          detailCalls++;
          const extraTake =
            uploadMetas.length >= 2
              ? [
                  {
                    id: '00000000-0000-4000-8000-000000000950',
                    sessionId: '00000000-0000-4000-8000-000000000801',
                    recordedAt: '2026-11-06T12:00:00Z',
                    a: null,
                    b: null,
                    rate: 1,
                    durationSec: 5,
                    mime: 'audio/webm',
                    sizeBytes: 4000,
                    storage: 'supabase',
                    storageKey: 'u1/tk950.weba',
                    memo: '',
                  },
                ]
              : [];
          return json(route, {
            ...DETAIL_1,
            takes: [...extraTake, ...DETAIL_1.takes],
          });
        },
      ],
      [
        (url) => url.pathname === '/api/v1/takes' && true,
        async (route) => {
          if (route.request().method() !== 'POST') return json(route, { ok: true });
          const buf = route.request().postDataBuffer() || Buffer.from('');
          const raw = buf.toString('utf8');
          const m = raw.match(/\{[^\r\n]*"songId"[^\r\n]*\}/);
          const meta = m ? JSON.parse(m[0]) : {};
          uploadMetas.push(meta);
          if (uploadMetas.length === 1) {
            return json(
              route,
              {
                ok: false,
                status: 403,
                code: 'FREE_TAKE_SONG_LIMIT_EXCEEDED',
                message: '무료 플랜은 2곡까지 녹음을 저장할 수 있습니다.',
                detail: { limit: 2, used: 2, tier: 'free', nextTier: 'pro', nextLimit: null },
              },
              403
            );
          }
          return json(
            route,
            {
              ok: true,
              take: {
                id: '00000000-0000-4000-8000-000000000950',
                sessionId: '00000000-0000-4000-8000-000000000801',
                recordedAt: meta.recordedAt || '2026-11-06T12:00:00Z',
                a: null,
                b: null,
                rate: 1,
                durationSec: 5,
                mime: 'audio/webm',
                sizeBytes: 4000,
                storage: 'supabase',
                storageKey: 'u1/tk950.weba',
                memo: '',
              },
            },
            201
          );
        },
      ],
    ],
  });

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#songRecord .take-row')).toHaveCount(2);
  expect(detailCalls).toBe(1);

  // 녹음 시작 → 정지 (자동 업로드 → 403 FREE_TAKE_SONG_LIMIT_EXCEEDED)
  await page.locator('#recBtn').click();
  await page.locator('#recBtn').click();

  const modal = page.locator('#takeLimitModal');
  await expect(modal).toBeVisible();
  await expect(page.locator('#takeLimitDesc')).toContainText('무료 플랜은 2곡까지 녹음을 저장할 수 있어요');
  // 무료일 때 Google Drive 연결 버튼 숨김
  await expect(page.locator('#btnTakeLimitConnectDrive')).toBeHidden();

  const replaceBtn = page.locator('#btnTakeLimitReplaceOld');
  await expect(replaceBtn).toHaveText('다른 곡 녹음 지우고 이 곡 녹음 저장');

  // 확인창(SR-Q1) 수락 후 재업로드
  page.once('dialog', (d) => d.accept());
  await replaceBtn.click();

  await expect(modal).toBeHidden();
  expect(uploadMetas).toHaveLength(2);
  expect(uploadMetas[1].replaceOldSongTakes).toBe(true);
  // 업로드 성공 후 목록 갱신으로 녹음 3개
  await expect(page.locator('#songRecord .take-row')).toHaveCount(3);
});

test('SR1-6: 곡 상세 500 오류 시 영역 안 오류 문구 + 다시 시도, 플레이어는 그대로', async ({ page }) => {
  let shouldFail = true;
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1],
    routes: [
      [
        (url) => url.pathname === `/api/v1/songs/${SONG_1.id}`,
        (route) => {
          if (shouldFail) {
            return json(route, { error: 'INTERNAL_ERROR', message: '서버 오류' }, 500);
          }
          return json(route, DETAIL_1);
        },
      ],
    ],
  });

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 플레이어는 정상 표시
  await expect(page.locator('#videoBox')).toBeVisible();
  await expect(page.locator('#songTitle')).toHaveText(SONG_1.title);

  // 영역 안 오류 문구 + 다시 시도 버튼
  const songRecord = page.locator('#songRecord');
  await expect(songRecord).toContainText('기록을 불러오지 못했어요');
  const retryBtn = songRecord.locator('button', { hasText: '다시 시도' });
  await expect(retryBtn).toBeVisible();

  // 다시 시도 클릭 시 정상 로드
  shouldFail = false;
  await retryBtn.click();
  await expect(page.locator('#songRecord .take-row')).toHaveCount(2);
});

test('SR1-7 (회귀): 곡 상세 응답 대기 중에는 "불러오는 중…" 표시 및 빈 상태 문구 미노출, 응답 완료 후 빈 상태 표시', async ({ page }) => {
  let resolveDetail;
  const detailPromise = new Promise((resolve) => {
    resolveDetail = resolve;
  });

  const EMPTY_DETAIL = {
    song: { id: SONG_1.id, videoId: 'jNQXAC9IVRw', title: '현재 곡', totalSeconds: 0, lastDate: null },
    takes: [],
    sessions: [],
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1],
    routes: [
      [
        (url) => url.pathname === `/api/v1/songs/${SONG_1.id}`,
        async (route) => {
          await detailPromise;
          return json(route, EMPTY_DETAIL);
        },
      ],
    ],
  });

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

  // 응답 도착 전: #songRecord는 표시되고, #srTimeline에는 "불러오는 중…"이 표시되며 빈 상태 문구·A/B 안내·미연결 목록은 없어야 함
  const songRecord = page.locator('#songRecord');
  await expect(songRecord).toBeVisible();

  const srTimeline = page.locator('#srTimeline');
  await expect(srTimeline).toContainText('불러오는 중…');
  await expect(srTimeline).not.toContainText('아직 연습 세션 기록이 없어요.');
  await expect(page.locator('#srAbHint')).toHaveCount(0);
  await expect(page.locator('#srUnlinked')).toHaveCount(0);

  // 응답 지연 해제
  resolveDetail();

  // 응답 도착 후: "불러오는 중…"은 사라지고 빈 상태 문구가 정상 표시됨
  await expect(srTimeline).toContainText('아직 연습 세션 기록이 없어요.');
  await expect(srTimeline).not.toContainText('불러오는 중…');
  await expect(page.locator('#songRecord .take-row')).toHaveCount(0);
  await expect(page.locator('#srUnlinked')).toHaveCount(0);
});

// ───────────────────────── UXR-1: 연습 기록 단일화 · A/B 교차 비교 ─────────────────────────
// 명세: 개발산출물/명세/UXR-1_구현명세.md §8
const UX_IDS = {
  t1: '00000000-0000-4000-8000-000000000901', // 세션 801(표시 5개 안)
  t2: '00000000-0000-4000-8000-000000000902', // 세션 802
  t3: '00000000-0000-4000-8000-000000000903', // 미연결(세션 ID가 응답 sessions에 없음)
  t4: '00000000-0000-4000-8000-000000000904', // 세션 806(더 보기 전 숨은 세션)
};
function uxTake(id, sessionId, recordedAt, durationSec) {
  return {
    id, sessionId, recordedAt, a: 12, b: 48, rate: 1, durationSec,
    mime: 'audio/webm', sizeBytes: 9000, storage: 'supabase', storageKey: `u1/${id}.weba`, memo: '',
  };
}
const UX_DETAIL = {
  song: SONG_1,
  takes: [
    uxTake(UX_IDS.t1, '00000000-0000-4000-8000-000000000801', '2026-11-05T10:00:00Z', 25),
    uxTake(UX_IDS.t2, '00000000-0000-4000-8000-000000000802', '2026-11-06T11:30:00Z', 36),
    uxTake(UX_IDS.t3, '00000000-0000-4000-8000-0000000008ff', '2026-11-07T09:00:00Z', 41),
    uxTake(UX_IDS.t4, '00000000-0000-4000-8000-000000000806', '2026-11-04T08:00:00Z', 19),
  ],
  sessions: DETAIL_1.sessions,
};

async function openUx(page, extra = {}) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.userData, songs: [SONG_1], songDetail: UX_DETAIL, ...extra });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);
}
const sel = (page, id) => page.locator(`#songRecord .ab-select[data-take-id="${id}"]`);
const rowOf = (page, id) => sel(page, id).locator('xpath=ancestor::div[contains(@class,"take-row")]');

test('UXR1-1: 테이크는 한 번만 — 미연결 판정은 숨은 세션 포함 응답 전체 기준', async ({ page }) => {
  await openUx(page);
  // 더 보기 전: 6번째 세션(숨김)의 테이크 t4는 미연결 목록에 없어야 한다
  await expect(page.locator('#srUnlinked .take-row')).toHaveCount(1);
  await expect(page.locator(`#srUnlinked .ab-select[data-take-id="${UX_IDS.t3}"]`)).toHaveCount(1);
  await expect(sel(page, UX_IDS.t4)).toHaveCount(0);
  await page.locator('#songRecord').getByRole('button', { name: '더 보기' }).click();
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(6);
  for (const id of Object.values(UX_IDS)) await expect(sel(page, id)).toHaveCount(1);
  await expect(page.locator('#srUnlinked .take-row')).toHaveCount(1);
  await expect(page.locator('#srTakes')).toHaveCount(0);
});

test('UXR1-2·4: 세션 테이크↔미연결 테이크 교차 A/B, 순서 유지, 같은 테이크 슬롯 이동', async ({ page }) => {
  await openUx(page);
  await sel(page, UX_IDS.t1).selectOption('a');
  await expect(page.locator('#srAbHint')).toBeVisible();
  await expect(page.locator('#srAbPanel')).toBeHidden();
  await sel(page, UX_IDS.t3).selectOption('b');
  await expect(page.locator('#srAbPanel')).toBeVisible();
  await expect(page.locator('#srAbHint')).toHaveCount(0);
  await expect(page.locator('#srAbLabelA')).toContainText('2026-11-05 10:00');
  await expect(page.locator('#srAbLabelB')).toContainText('2026-11-07 09:00');
  // 사용자가 고른 순서 그대로(시각순 재정렬 없음): 늦은 녹음 t3를 A로, t1을 B로
  await sel(page, UX_IDS.t3).selectOption('a');
  await expect(sel(page, UX_IDS.t1)).toHaveValue('');
  await expect(page.locator('#srAbHint')).toBeVisible();
  await sel(page, UX_IDS.t1).selectOption('b');
  await expect(page.locator('#srAbLabelA')).toContainText('2026-11-07 09:00');
  await expect(page.locator('#srAbLabelB')).toContainText('2026-11-05 10:00');
  // 같은 테이크를 다른 슬롯으로 옮기면 원래 슬롯은 빈칸
  await sel(page, UX_IDS.t3).selectOption('b');
  await expect(sel(page, UX_IDS.t3)).toHaveValue('b');
  await expect(sel(page, UX_IDS.t1)).toHaveValue('');
});

test('UXR1-3: A 삭제 시 B는 B 자리에 남고 비교 영역이 닫힌다', async ({ page }) => {
  await openUx(page);
  await sel(page, UX_IDS.t1).selectOption('a');
  await sel(page, UX_IDS.t3).selectOption('b');
  await expect(page.locator('#srAbPanel')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await rowOf(page, UX_IDS.t1).locator('.btnDelete').click();
  await expect(sel(page, UX_IDS.t1)).toHaveCount(0);
  await expect(sel(page, UX_IDS.t3)).toHaveValue('b');
  await expect(page.locator('#srAbHint')).toBeVisible();
  await expect(page.locator('#srAbPanel')).toBeHidden();
});

test('UXR1-5: 삭제·완료 실패(500) 시 행과 슬롯을 유지한다', async ({ page }) => {
  await openUx(page, {
    routes: [[
      (url) => url.pathname.startsWith('/api/v1/takes/'),
      (route) => json(route, { error: 'INTERNAL_ERROR', message: '서버 오류' }, 500),
    ]],
  });
  await sel(page, UX_IDS.t1).selectOption('a');
  await sel(page, UX_IDS.t3).selectOption('b');
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); void d.accept(); });
  await rowOf(page, UX_IDS.t3).locator('.btnDelete').click();
  await expect.poll(() => dialogs.filter((x) => x === 'alert').length).toBe(1);
  await rowOf(page, UX_IDS.t3).locator('.btnComplete').click();
  await expect.poll(() => dialogs.filter((x) => x === 'alert').length).toBe(2);
  await expect(sel(page, UX_IDS.t3)).toHaveValue('b');
  await expect(sel(page, UX_IDS.t1)).toHaveValue('a');
  await expect(page.locator('#srAbPanel')).toBeVisible();
});

test('UXR1-6: 세션 0·미연결만 있어도 목록과 재생이 동작, 빈 세션 문구와 공존', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, {
    ...STATES.userData,
    songs: [SONG_1],
    songDetail: { song: SONG_1, sessions: [], takes: [UX_DETAIL.takes[2]] },
    takeUrl: { url: 'https://example.com/take.webm', expiresIn: 3600 },
  });
  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });
  test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
  await expect(page.locator('#srTimeline')).toContainText('아직 연습 세션 기록이 없어요.');
  await expect(page.locator('#srUnlinked .take-row')).toHaveCount(1);
  await page.locator('#srUnlinked .take-row button', { hasText: '듣기' }).click();
  await expect(page.locator('#srUnlinked audio')).toHaveAttribute('src', 'https://example.com/take.webm');
});

test('UXR1-7: 늦게 도착한 A 재생 URL은 슬롯이 바뀐 뒤 audio에 할당되지 않는다', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await openUx(page, {
    routes: [[
      (url) => /\/api\/v1\/takes\/[^/]+\/url$/.test(url.pathname),
      async (route) => {
        if (route.request().url().includes(UX_IDS.t1)) await gate;
        return json(route, { url: 'https://example.com/take.webm', expiresIn: 3600 });
      },
    ]],
  });
  await sel(page, UX_IDS.t1).selectOption('a');
  await sel(page, UX_IDS.t3).selectOption('b');
  // 기준선: B는 즉시 응답 → src 할당됨(URL이 유효함을 증명)
  await page.locator('#srAbPlayB').click();
  await expect(page.locator('#srAbAudioB')).toHaveAttribute('src', 'https://example.com/take.webm');
  // A 요청을 붙잡고 슬롯 A를 t2로 교체
  const pending = page.waitForRequest((r) => r.url().includes(`${UX_IDS.t1}/url`));
  await page.locator('#srAbPlayA').click();
  await pending;
  await sel(page, UX_IDS.t2).selectOption('a');
  const answered = page.waitForResponse((r) => r.url().includes(`${UX_IDS.t1}/url`));
  release();
  await answered;
  // 응답 처리 후 렌더가 끝나도록 두 프레임 대기(이벤트 기반)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#srAbAudioA')).not.toHaveAttribute('src', /./);
});

// RECFIX-1(F1): 슬롯이 그대로면 연습 화면이 다시 그려져도(영상 재생 중 250ms 갱신 등) 진행 중 A 재생 요청이 버려지면 안 된다
test('RECFIX1-1: A 재생 URL 대기 중 부모 재렌더가 일어나도 응답 후 A audio에 src가 할당된다', async ({ page }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await openUx(page, {
    routes: [[
      (url) => /\/api\/v1\/takes\/[^/]+\/url$/.test(url.pathname),
      async (route) => {
        if (route.request().url().includes(UX_IDS.t1)) await gate;
        return json(route, { url: 'https://example.com/take.webm', expiresIn: 3600 });
      },
    ]],
  });
  await sel(page, UX_IDS.t1).selectOption('a');
  await sel(page, UX_IDS.t3).selectOption('b');
  await expect(page.locator('#srAbPanel')).toBeVisible();
  const pending = page.waitForRequest((r) => r.url().includes(`${UX_IDS.t1}/url`));
  await page.locator('#srAbPlayA').click();
  await pending;
  // 슬롯은 그대로 두고 연습 화면(부모) 상태만 바꿔 다시 그린다
  const label = (await page.locator('#rates button:not([disabled])[aria-pressed="false"]').first().textContent()).trim();
  const rateBtn = page.locator('#rates').getByRole('button', { name: label, exact: true });
  await rateBtn.click();
  await expect(rateBtn).toHaveAttribute('aria-pressed', 'true');
  const answered = page.waitForResponse((r) => r.url().includes(`${UX_IDS.t1}/url`));
  release();
  await answered;
  await expect(page.locator('#srAbAudioA')).toHaveAttribute('src', 'https://example.com/take.webm');
});

test('UXR1-8: TRAILS(log.html) 상세 타임라인 카드에는 A/B 선택이 새어 나가지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApp(page, { ...STATES.userData, songs: [SONG_1], songDetail: UX_DETAIL });
  await page.goto(`/log.html?song=${SONG_1.id}`, { waitUntil: 'load' });
  await expect(page.locator('#detailTakes .ab-select').first()).toBeVisible();
  await expect(page.locator('#detailTimeline .tl-row').first()).toBeVisible();
  await expect(page.locator('#detailTimeline .ab-select')).toHaveCount(0);
  await expect(page.locator('#detailTimeline .take-row').first()).toBeVisible();
});
