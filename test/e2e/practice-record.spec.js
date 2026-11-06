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
    memo: i === 0 ? '첫 곡 세션 메모' : '',
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
      memo: '둘째 곡 세션 메모',
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
  await expect(page.locator('#srTakes .take-row')).toHaveCount(2);
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(5);

  const moreBtn = songRecord.locator('button', { hasText: '더 보기' });
  await expect(moreBtn).toBeVisible();
  await moreBtn.click();
  await expect(page.locator('#srTimeline .tl-row')).toHaveCount(6);
  await expect(moreBtn).toBeHidden();
});

test('SR1-3: guest 비로그인 시 한 줄 안내만 보이고 #srTakes 없음, 빈 화면(#emptyState)에서는 #songRecord 없음', async ({ page }) => {
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
  await expect(page.locator('#srTakes')).toHaveCount(0);
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

  // 둘째 곡 녹음(42초)과 메모가 보임
  await expect(page.locator('#srTakes .take-row')).toHaveCount(1);
  await expect(page.locator('#srTakes')).toContainText('42초');
  await expect(page.locator('#srTimeline')).toContainText('둘째 곡 세션 메모');

  // 이제 첫 곡의 지연된 응답을 풀어줌
  const song1DetailResp = page.waitForResponse((res) => res.url().includes(`/api/v1/songs/${SONG_1.id}`));
  resolveFirstSong();
  await song1DetailResp;

  // 여전히 둘째 곡 기록만 보여야 함
  await expect(page.locator('#srTakes .take-row')).toHaveCount(1);
  await expect(page.locator('#srTakes')).toContainText('42초');
  await expect(page.locator('#srTimeline')).toContainText('둘째 곡 세션 메모');
  await expect(page.locator('#srTimeline')).not.toContainText('첫 곡 세션 메모');
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
  await expect(page.locator('#srTakes .take-row')).toHaveCount(2);
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
  await expect(page.locator('#srTakes .take-row')).toHaveCount(3);
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
  await expect(page.locator('#srTakes .take-row')).toHaveCount(2);
});
