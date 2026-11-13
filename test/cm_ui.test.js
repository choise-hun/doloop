// test/cm_ui.test.js
// CM-UI 단위 테스트: episode.mts 순수 헬퍼, 어댑터, 에러 분류, 라우트/계약 검증
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
}

test('CM-UI 계약 1: 라우트 등록 전수 검증 (Main.kt, server.js, App.tsx)', () => {
  const mainKt = readText('src/main/kotlin/ulevelp/Main.kt');
  const serverJs = readText('server.js');
  const appTsx = readText('frontend/src/App.tsx');

  assert.ok(mainKt.includes('"community.html"'), 'Main.kt SPA_ENTRY_PAGES에 community.html 등록 필수');
  assert.ok(serverJs.includes("'/community.html'"), 'server.js SPA_PAGES에 /community.html 등록 필수');
  assert.ok(
    appTsx.includes('<Route path="/community.html" element={<CommunityPage />} />'),
    'App.tsx에 CommunityPage 라우트 등록 필수'
  );
});

test('CM-UI 계약 2: AppShell에 COMMUNITY 내비게이션 6열 포함 검증', () => {
  const shellTsx = readText('frontend/src/components/layout/AppShell.tsx');
  const shellCss = readText('frontend/src/components/layout/AppShell.module.css');

  assert.ok(shellTsx.includes("key: 'community'"), 'AppShell MAIN_NAV에 community 항목 등록 필수');
  assert.ok(shellTsx.includes("labelKey: 'nav.community'"), 'nav.community 라벨 키 필수');
  assert.ok(shellCss.includes('repeat(6,'), 'AppShell.module.css tabBar에 6열 그리드 필수');
});

test('CM-UI 순수 함수 1: countCodePoints (이모지 및 Unicode code point 계산)', async () => {
  const { countCodePoints } = await import('../frontend/src/lib/episode.mts');

  assert.equal(countCodePoints('hello'), 5);
  assert.equal(countCodePoints('안녕'), 2);
  // 이모지는 UTF-16 length가 2이지만 code point는 1개
  assert.equal(countCodePoints('🎸'), 1);
  assert.equal(countCodePoints('기타🎸연습'), 5);
  assert.equal(countCodePoints(''), 0);
});

test('CM-UI 순수 함수 2: validateEpisodeText (제어문자 거절, 줄바꿈 제어, code points 초과)', async () => {
  const { validateEpisodeText } = await import('../frontend/src/lib/episode.mts');

  // 정상 입력
  assert.equal(validateEpisodeText('정상 제목', 80, false), '정상 제목');
  assert.equal(validateEpisodeText('  양쪽 공백 trim  ', 80, false), '양쪽 공백 trim');

  // NUL 및 제어 문자 거절
  assert.throws(() => validateEpisodeText('제어\0문자', 80, false), /제어 문자/);
  assert.throws(() => validateEpisodeText('제어\x07문자', 80, false), /제어 문자/);

  // multiline=false일 때 줄바꿈 거절
  assert.throws(() => validateEpisodeText('제목에\n줄바꿈', 80, false), /제어 문자/);

  // multiline=true일 때 줄바꿈 및 탭 허용, CRLF -> LF 정규화
  const multilineText = validateEpisodeText('첫째 줄\r\n둘째 줄\t탭', 500, true);
  assert.equal(multilineText, '첫째 줄\n둘째 줄\t탭');

  // 글자 수 (code point) 초과 거절
  const long81 = 'a'.repeat(81);
  assert.throws(() => validateEpisodeText(long81, 80, false), /길이/);

  // 이모지 포함 80 code point 검증
  const emoji80 = '🎸'.repeat(80);
  assert.equal(validateEpisodeText(emoji80, 80, false), emoji80);
  const emoji81 = '🎸'.repeat(81);
  assert.throws(() => validateEpisodeText(emoji81, 80, false), /길이/);
});

test('CM-UI 순수 함수 3: computeEpisodeTitle (공개 제목 결정 규칙, S3b-3 D13)', async () => {
  const { computeEpisodeTitle, formatEpisodeDate } = await import('../frontend/src/lib/episode.mts');

  // 1. trim된 post.title 우선
  assert.equal(
    computeEpisodeTitle({ title: '  사용자 지정 제목  ', date: '2026-11-12' }),
    '사용자 지정 제목'
  );

  // 2. 빈 제목은 세션 날짜로 표기한다(영상 제목 기반 대체 문구는 쓰지 않는다)
  assert.equal(computeEpisodeTitle({ title: '', date: '2026-11-12' }), '2026년 11월 12일');
  assert.equal(computeEpisodeTitle({ title: '   ', date: '2026-01-05' }), '2026년 1월 5일');

  // 3. 날짜도 없으면 기본 문구
  assert.equal(computeEpisodeTitle({ title: null, date: null }), '연습 기록');

  // 4. 언어별 날짜 형식과 잘못된 값
  assert.equal(formatEpisodeDate('2026-11-12', 'ko'), '2026년 11월 12일');
  assert.equal(formatEpisodeDate('2026-11-12', 'en'), 'Nov 12, 2026');
  assert.equal(formatEpisodeDate('2026-11-12', 'ja'), '2026年11月12日');
  assert.equal(formatEpisodeDate('2026-13-01', 'ko'), '2026-13-01');
  assert.equal(formatEpisodeDate('not-a-date', 'en'), 'not-a-date');
});

test('CM-UI 순수 함수 4: buildEpisodePracticeUrl (구간 재생 URL 조립)', async () => {
  const { buildEpisodePracticeUrl } = await import('../frontend/src/lib/episode.mts');

  assert.equal(
    buildEpisodePracticeUrl('dQw4w9WgXcQ', 12.5, 34.0, 1.0),
    'practice.html?v=dQw4w9WgXcQ&a=12.5&b=34'
  );
  assert.equal(
    buildEpisodePracticeUrl('dQw4w9WgXcQ', 10, 20, 0.75),
    'practice.html?v=dQw4w9WgXcQ&a=10&b=20&r=0.75'
  );
  // a, b 없을 때
  assert.equal(
    buildEpisodePracticeUrl('dQw4w9WgXcQ', null, null, null),
    'practice.html?v=dQw4w9WgXcQ'
  );
});

test('CM-UI 순수 함수 5: normalizePartStats (파트 통계 안전 파싱 및 보정)', async () => {
  const { normalizePartStats } = await import('../frontend/src/lib/episode.mts');

  // 정상 배열
  const parts = [
    { name: 'Intro', a: 0, b: 10, rate: 1, completed: true, seconds: 60, loops: 10 },
  ];
  const res1 = normalizePartStats(parts);
  assert.equal(res1.length, 1);
  assert.equal(res1[0].name, 'Intro');
  assert.equal(res1[0].loops, 10);

  // JSON 문자열 파싱
  const jsonStr = JSON.stringify(parts);
  const res2 = normalizePartStats(jsonStr);
  assert.equal(res2.length, 1);
  assert.equal(res2[0].name, 'Intro');

  // null 또는 유효하지 않은 JSON
  assert.deepEqual(normalizePartStats(null), []);
  assert.equal(normalizePartStats('invalid-json'), null);
  assert.equal(normalizePartStats({}), null);
});

test('CM-UI 순수 함수 6: classifyEpisodeError (오류 분류 및 매핑)', async () => {
  const { classifyEpisodeError } = await import('../frontend/src/lib/episode.mts');

  assert.equal(classifyEpisodeError({ status: 401 }).type, 'unauthorized');
  assert.equal(classifyEpisodeError({ status: 403, code: 'TIER_UPGRADE_REQUIRED' }).type, 'tier_upgrade');
  assert.equal(classifyEpisodeError({ status: 409, code: 'PUBLIC_NAME_REQUIRED' }).type, 'public_name_required');
  assert.equal(classifyEpisodeError({ status: 409, code: 'POST_MODERATION_HIDDEN' }).type, 'moderation_hidden');
  assert.equal(classifyEpisodeError({ status: 409, code: 'SESSION_NOT_SHAREABLE' }).type, 'not_shareable');
  assert.equal(classifyEpisodeError({ status: 409, code: 'ALREADY_REPORTED' }).type, 'already_reported');
  assert.equal(classifyEpisodeError({ status: 404, code: 'NOT_FOUND' }).type, 'not_found');
  assert.equal(classifyEpisodeError({ status: 400, code: 'SELF_REPORT_NOT_ALLOWED' }).type, 'self_report');

  const bannedErr = classifyEpisodeError({
    status: 400,
    code: 'BANNED_WORD',
    detail: { field: 'comment' },
  });
  assert.equal(bannedErr.type, 'banned');
  assert.equal(bannedErr.field, 'comment');

  assert.equal(classifyEpisodeError({ status: 500 }).type, 'generic');
  assert.equal(classifyEpisodeError(new Error('Network error')).type, 'generic');
});


test('CM-UI real auth error envelope retains BANNED_WORD detail.field', async () => {
  const { classifyEpisodeError } = await import('../frontend/src/lib/episode.mts');
  for (const field of ['title', 'comment', 'partStats.name']) {
    assert.equal(classifyEpisodeError({ status: 400, code: 'BANNED_WORD', data: { detail: { field } } }).field, field);
  }
});

test('S3b3-U14 Drive 토큰 합치기: 동시 2회 requestToken 시 토큰 클라이언트 생성 및 요청 1회', async () => {
  const vm = require('node:vm');
  const ts = require('typescript');
  let initCount = 0;
  let requestCount = 0;
  let currentUid = 'user-A';
  let capturedCallback = null;

  const ctx = {
    exports: {},
    require: (id) => {
      if (id === './auth') return { auth: { getUser: () => (currentUid ? { id: currentUid } : null), onChange: () => () => {} } };
      if (id === './apiClient') return { apiClient: {} };
      if (id === './i18n.mts') return { t: (k) => k };
      throw new Error(`unexpected import: ${id}`);
    },
    window: {
      ULEVELP_CONFIG: { googleClientId: 'client-123' },
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (cfg) => {
              initCount += 1;
              capturedCallback = cfg.callback;
              return {
                requestAccessToken: () => {
                  requestCount += 1;
                  setImmediate(() => capturedCallback({ access_token: 'tok-1', expires_in: '3600' }));
                },
              };
            },
          },
        },
      },
    },
    Promise,
    Date,
    Error,
    parseInt,
    String,
  };
  const transpiled = ts.transpileModule(readText('frontend/src/lib/drive.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(transpiled, ctx);
  const drive = ctx.exports.drive;

  const [t1, t2] = await Promise.all([drive.requestToken(), drive.requestToken()]);
  assert.equal(t1, 'tok-1');
  assert.equal(t2, 'tok-1');
  assert.equal(initCount, 1);
  assert.equal(requestCount, 1);

  // 캐시 무효화(force: true) 후 대기 중 계정 전환 시 거절된다
  let pendingResolve = null;
  capturedCallback = null;
  ctx.window.google.accounts.oauth2.initTokenClient = (cfg) => {
    initCount += 1;
    capturedCallback = cfg.callback;
    return {
      requestAccessToken: () => {
        requestCount += 1;
        pendingResolve = () => cfg.callback({ access_token: 'tok-stale', expires_in: '3600' });
      },
    };
  };
  const pForce = drive.requestToken({ force: true, clientId: 'client-456' });
  currentUid = 'user-B';
  pendingResolve();
  await assert.rejects(() => pForce, /drive\.authFailed/);
});

test('S3b3-U14b Drive 토큰 경합: A 팝업 대기 중 B 전환·요청 시 A의 늦은 콜백이 B 토큰이 되지 않는다', async () => {
  const vm = require('node:vm');
  const ts = require('typescript');
  let currentUid = 'user-A';
  const callbacks = [];

  const ctx = {
    exports: {},
    require: (id) => {
      if (id === './auth') return { auth: { getUser: () => (currentUid ? { id: currentUid } : null), onChange: () => () => {} } };
      if (id === './apiClient') return { apiClient: {} };
      if (id === './i18n.mts') return { t: (k) => k };
      throw new Error(`unexpected import: ${id}`);
    },
    window: {
      ULEVELP_CONFIG: { googleClientId: 'client-123' },
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (cfg) => ({ requestAccessToken: () => callbacks.push(cfg.callback) }),
          },
        },
      },
    },
    Promise,
    Date,
    Error,
    parseInt,
    String,
  };
  const transpiled = ts.transpileModule(readText('frontend/src/lib/drive.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(transpiled, ctx);
  const drive = ctx.exports.drive;

  const pA = drive.requestToken();
  const aRejected = assert.rejects(() => pA, /drive\.authFailed/);
  currentUid = 'user-B';
  const pB = drive.requestToken();
  await aRejected;
  assert.equal(callbacks.length, 2);

  let bResult = null;
  pB.then((tok) => { bResult = tok; }, () => { bResult = 'rejected'; });
  // A 팝업의 늦은 결과
  callbacks[0]({ access_token: 'tok-A', expires_in: '3600' });
  await new Promise((r) => setImmediate(r));
  assert.equal(bResult, null, 'A의 늦은 콜백이 B 요청을 끝내면 안 된다');

  callbacks[1]({ access_token: 'tok-B', expires_in: '3600' });
  assert.equal(await pB, 'tok-B');
  assert.equal(await drive.requestToken(), 'tok-B', 'B 캐시에 A 토큰이 남으면 안 된다');
});
