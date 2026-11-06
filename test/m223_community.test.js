// M2-23: 커뮤니티·큐레이션·재생목록 가져오기 순수 함수 단위 테스트 (CM-U1~7)
// 명세: 개발산출물/명세/M2-23_구현명세.md §8-1
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let C;
before(async () => {
  C = await import('../frontend/src/lib/community.mts');
});

test('CM-U1 playlistUrlFrom: YouTube 호스트 + list 파라미터 판별', () => {
  assert.equal(
    C.playlistUrlFrom('  https://www.youtube.com/watch?v=x&list=PL12345  '),
    'https://www.youtube.com/watch?v=x&list=PL12345'
  );
  assert.equal(
    C.playlistUrlFrom('https://youtube.com/playlist?list=PLabcdef'),
    'https://youtube.com/playlist?list=PLabcdef'
  );
  assert.equal(
    C.playlistUrlFrom('https://music.youtube.com/watch?v=abc&list=RDCLAK5uy'),
    'https://music.youtube.com/watch?v=abc&list=RDCLAK5uy'
  );
  assert.equal(
    C.playlistUrlFrom('https://youtu.be/x?list=PL_99-00'),
    'https://youtu.be/x?list=PL_99-00'
  );

  // 실패 케이스: list 없음, 다른 도메인, 호스트 끝 일치 우회, 비문자열, 빈 값
  assert.equal(C.playlistUrlFrom('https://www.youtube.com/watch?v=abcdefghij1'), null);
  assert.equal(C.playlistUrlFrom('https://www.youtube.com/playlist?list='), null);
  assert.equal(C.playlistUrlFrom('https://evil.com/?list=PL12345'), null);
  assert.equal(C.playlistUrlFrom('https://notyoutube.com/watch?list=PL12345'), null);
  assert.equal(C.playlistUrlFrom('https://evilyoutube.com/watch?list=PL12345'), null);
  assert.equal(C.playlistUrlFrom('javascript:alert(1)?list=PL123'), null);
  assert.equal(C.playlistUrlFrom(12345), null);
  assert.equal(C.playlistUrlFrom(''), null);
  assert.equal(C.playlistUrlFrom(null), null);
});

test('CM-U2 i18nPick: 로케일 우선 → ko 폴백 → 기본값', () => {
  const m = { ko: '가', en: 'A' };
  assert.equal(C.i18nPick(m, 'en', '기본'), 'A');
  assert.equal(C.i18nPick(m, 'ja', '기본'), '가');
  assert.equal(C.i18nPick(m, 'ko', '기본'), '가');
  assert.equal(C.i18nPick({}, 'ko', '기본'), '기본');
  assert.equal(C.i18nPick({ ko: '' }, 'ko', '기본'), '기본');
  assert.equal(C.i18nPick(null, 'en', '기본'), '기본');
  assert.equal(C.i18nPick(undefined, 'ja', '기본'), '기본');
});

test('CM-U3 folderSubtitle · coverIds: 아티스트 부제 및 4장 모자이크 규칙', () => {
  assert.equal(C.folderSubtitle(['A', 'B'], 5), 'A, B 등');
  assert.equal(C.folderSubtitle(['A'], 1), 'A');
  assert.equal(C.folderSubtitle(['A', 'B'], 2), 'A, B');
  assert.equal(C.folderSubtitle([], 3), '');
  assert.equal(C.folderSubtitle('not-an-array', 5), '');
  assert.equal(C.folderSubtitle(null, 5), '');

  // coverIds: 4개 이상이면 4개, 1~3개면 첫 1개만, 0개면 빈 배열, 비문자열 제거
  assert.deepEqual(C.coverIds(['v1', 'v2', 'v3', 'v4', 'v5']), ['v1', 'v2', 'v3', 'v4']);
  assert.deepEqual(C.coverIds(['v1', 'v2', 'v3']), ['v1']);
  assert.deepEqual(C.coverIds(['v1', 'v2']), ['v1']);
  assert.deepEqual(C.coverIds(['v1', 123, null, '']), ['v1']);
  assert.deepEqual(C.coverIds([]), []);
  assert.deepEqual(C.coverIds(null), []);
});

test('CM-U4 itemPracticeHref · segText: 구간·배속 링크와 표시 문자열', () => {
  assert.equal(
    C.itemPracticeHref({ videoId: 'abcdefghij1', a: 38, b: 55.2, rate: 0.75 }),
    'practice.html?v=abcdefghij1&a=38&b=55.2&r=0.75'
  );
  assert.equal(
    C.itemPracticeHref({ videoId: 'abcdefghij1', a: 38, b: 55, rate: 1 }),
    'practice.html?v=abcdefghij1&a=38&b=55'
  );
  assert.equal(
    C.itemPracticeHref({ videoId: 'abcdefghij1', a: null, b: null, rate: null }),
    'practice.html?v=abcdefghij1'
  );

  assert.equal(C.segText(38, 55.2, 0.75), '0:38–0:55 · 0.75x');
  assert.equal(C.segText(38, 55, 1), '0:38–0:55');
  assert.equal(C.segText(null, null, 0.75), '0.75x');
  assert.equal(C.segText(null, null, 1), '');
  assert.equal(C.segText(null, null, null), '');
});

test('CM-U5 normalizeCurationHome: 비정상 응답 정규화', () => {
  const empty = { curated: [], monthlyPick: null, showcase: [], following: [] };
  assert.deepEqual(C.normalizeCurationHome({}), empty);
  assert.deepEqual(C.normalizeCurationHome(null), empty);
  assert.deepEqual(C.normalizeCurationHome({ curated: 'x', monthlyPick: {} }), empty);

  const valid = C.normalizeCurationHome({
    curated: [{ id: 'f1' }],
    monthlyPick: { folder: { id: 'm1' }, items: [{ videoId: 'v1' }] },
    showcase: [{ id: 's1' }],
    following: null,
  });
  assert.equal(valid.curated.length, 1);
  assert.equal(valid.monthlyPick?.folder.id, 'm1');
  assert.equal(valid.monthlyPick?.items.length, 1);
  assert.equal(valid.showcase.length, 1);
  assert.deepEqual(valid.following, []);
});

test('CM-U6 communityErrorKey: §5 에러 표 매핑', () => {
  assert.deepEqual(C.communityErrorKey({ status: 403, code: 'TIER_UPGRADE_REQUIRED' }), {
    key: 'community.err.upgrade',
  });
  assert.deepEqual(C.communityErrorKey({ status: 409, code: 'PUBLIC_NAME_REQUIRED' }), {
    key: 'community.err.nameRequired',
  });
  assert.deepEqual(C.communityErrorKey({ status: 409, code: 'PUBLIC_NAME_TAKEN' }), {
    key: 'community.err.nameTaken',
  });
  assert.deepEqual(
    C.communityErrorKey({
      status: 409,
      code: 'PUBLIC_NAME_CHANGE_TOO_SOON',
      data: { detail: { nextChangeAt: '2026-11-13T16:00:00Z' } },
    }),
    { key: 'community.nameLocked', vars: { date: '2026-11-14' } }
  );
  assert.deepEqual(C.communityErrorKey({ status: 400, code: 'BANNED_WORD' }), {
    key: 'community.err.banned',
  });
  assert.deepEqual(C.communityErrorKey({ status: 400, code: 'INVALID_INPUT' }), {
    key: 'community.err.nameFormat',
  });
  assert.deepEqual(C.communityErrorKey({ status: 409, code: 'SHARE_AUTOSYNC_OFF' }), {
    key: 'community.err.autosyncOff',
  });
  assert.deepEqual(C.communityErrorKey({ status: 409, code: 'ALREADY_REPORTED' }), {
    key: 'community.err.reported',
  });
  assert.deepEqual(
    C.communityErrorKey({
      status: 403,
      code: 'CATEGORY_LIMIT_EXCEEDED',
      data: { detail: { nextTier: 'pro' } },
    }),
    { key: 'playlist.err.catUpgrade' }
  );
  assert.deepEqual(
    C.communityErrorKey({
      status: 403,
      code: 'CATEGORY_LIMIT_EXCEEDED',
      data: { detail: { nextTier: null } },
    }),
    { key: 'playlist.err.catFull' }
  );
  assert.deepEqual(C.communityErrorKey({ status: 409, code: 'CONFLICT' }), {
    key: 'playlist.err.nameDup',
  });
  assert.deepEqual(C.communityErrorKey({ status: 404, code: 'PLAYLIST_NOT_FOUND' }), {
    key: 'playlist.err.notFound',
  });
  assert.deepEqual(C.communityErrorKey({ status: 503, code: 'YOUTUBE_UNAVAILABLE' }), {
    key: 'playlist.err.youtube',
  });
  assert.deepEqual(C.communityErrorKey({ status: 502, code: 'YOUTUBE_API_ERROR' }), {
    key: 'playlist.err.youtube',
  });
  assert.deepEqual(C.communityErrorKey({ status: 404, code: 'NOT_FOUND' }), {
    key: 'folder.err.gone',
  });
  assert.deepEqual(C.communityErrorKey({ status: 500, message: '서버 내부 문장' }), {
    key: 'community.err.generic',
  });
});

test('CM-U7 durationText · kstDate: 연습 시간 및 KST 날짜 변환', () => {
  assert.equal(C.durationText(3720), '1시간 2분');
  assert.equal(C.durationText(3600), '1시간');
  assert.equal(C.durationText(120), '2분');
  assert.equal(C.durationText(59), '0분');
  assert.equal(C.durationText(0), '0분');
  assert.equal(C.durationText(null), '0분');

  assert.equal(C.kstDate('2026-11-13T16:00:00Z'), '2026-11-14');
  assert.equal(C.kstDate('2026-11-13T14:59:59Z'), '2026-11-13');
  assert.equal(C.kstDate('not-a-date'), '');
  assert.equal(C.kstDate(''), '');
  assert.equal(C.kstDate(null), '');
});
