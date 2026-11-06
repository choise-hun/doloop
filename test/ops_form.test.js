// M2-4b 운영 화면 순수 함수(frontend/src/lib/opsForm.mts) — 곡 줄 검사·i18n 병합·기본 사유·다음 달
// 근거: 개발산출물/진행_운영화면.md §2, 결과/M1-4b_큐레이션API.md §3-3
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let F;
before(async () => {
  F = await import('../frontend/src/lib/opsForm.mts');
});

const row = (over = {}) => ({ ...F.newRow('abcdefghij1'), ...over });

test('M24b-1 mergeI18n: ko만 바꾸고 en·ja는 그대로, 빈 값은 키를 뺀다, 모르는 키는 버린다', () => {
  assert.deepEqual(F.mergeI18n({ ko: '옛 제목', en: 'Old', ja: '古い' }, 'ko', ' 새 제목 '), { ko: '새 제목', en: 'Old', ja: '古い' });
  assert.deepEqual(F.mergeI18n({ ko: '설명', en: 'Desc' }, 'ko', '   '), { en: 'Desc' });
  assert.deepEqual(F.mergeI18n(undefined, 'ko', '처음'), { ko: '처음' });
  assert.deepEqual(F.mergeI18n({ ko: 'a', fr: 'x', en: '  ' }, 'ko', 'b'), { ko: 'b' });
  assert.equal(F.sameI18n({ en: 'E', ko: 'K' }, { ko: 'K', en: 'E' }), true);
  assert.equal(F.sameI18n({ ko: 'K' }, { ko: 'K', en: 'E' }), false);
});

test('M24b-2 parseTime·formatTime: 분:초·초·빈 값·틀린 형식', () => {
  assert.equal(F.parseTime(''), null);
  assert.equal(F.parseTime(' 83 '), 83);
  assert.equal(F.parseTime('83.5'), 83.5);
  assert.equal(F.parseTime('1:23'), 83);
  assert.equal(F.parseTime('0:05.5'), 5.5);
  for (const bad of ['1:75', 'abc', '-3', '1:2:3', '1,5']) assert.ok(Number.isNaN(F.parseTime(bad)), bad);
  assert.equal(F.formatTime(83), '1:23');
  assert.equal(F.formatTime(5.5), '0:05.5');
  assert.equal(F.formatTime(null), '');
  assert.equal(F.parseTime(F.formatTime(125.5)), 125.5);
});

test('M24b-3 checkItems: 통과하면 서버 PUT 본문 모양(초·배속·noteI18n en 보존)', () => {
  const r = F.checkItems('monthly_pick', [
    row({ a: '0:12', b: '48', rate: '0.75', note: ' 인트로 ', noteI18n: { ko: '옛', en: 'Intro' } }),
    row({ videoId: 'abcdefghij2' }),
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.items, [
    { videoId: 'abcdefghij1', a: 12, b: 48, rate: 0.75, noteI18n: { ko: '인트로', en: 'Intro' } },
    { videoId: 'abcdefghij2', a: null, b: null, rate: 1 },
  ]);
});

test('M24b-4 checkItems: 상한(이달의 곡 5·큐레이션 50)', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => row({ videoId: 'abcdefghi' + String(i).padStart(2, '0') }));
  assert.deepEqual(F.checkItems('monthly_pick', rows(5)).errors, []);
  const six = F.checkItems('monthly_pick', rows(6));
  assert.equal(six.items, null);
  assert.deepEqual(six.errors, ['이달의 곡은 5곡까지예요.']);
  assert.deepEqual(F.checkItems('curated', rows(50)).errors, []);
  assert.equal(F.checkItems('curated', rows(51)).items, null);
  assert.equal(F.ITEM_MAX.monthly_pick, 5);
  assert.equal(F.ITEM_MAX.curated, 50);
});

test('M24b-5 checkItems: ID·중복·a ≥ b·형식·배속·설명 길이 오류', () => {
  const r = F.checkItems('curated', [
    row({ videoId: 'short' }),
    row({ a: '1:00', b: '0:30' }),
    row({ a: 'x' }),
    row({ videoId: 'abcdefghij1' }),
    row({ videoId: 'abcdefghij3', rate: '3' }),
    row({ videoId: 'abcdefghij4', note: '가'.repeat(301) }),
  ]);
  assert.equal(r.items, null);
  assert.deepEqual(r.errors, [
    '1번 곡: 영상 ID가 올바르지 않아요.',
    '2번 곡: 끝이 시작보다 뒤여야 해요.',
    '3번 곡: 같은 영상이 이미 있어요.',
    '3번 곡: 시작은 분:초 또는 초로 적어 주세요.',
    '4번 곡: 같은 영상이 이미 있어요.',
    '5번 곡: 배속은 0.25~2 사이예요.',
    '6번 곡: 설명은 300자까지예요.',
  ]);
  // 300자는 통과
  assert.deepEqual(F.checkItems('curated', [row({ note: '가'.repeat(300) })]).errors, []);
});

test('M24b-6 rowFromItem: 서버 항목 → 입력 칸 글자', () => {
  assert.deepEqual(
    F.rowFromItem({ videoId: 'abcdefghij1', position: 0, title: 'T', artist: 'A', a: 72, b: null, rate: 1.25, noteI18n: { ko: '설명', en: 'Note' } }),
    { videoId: 'abcdefghij1', title: 'T', artist: 'A', a: '1:12', b: '', rate: '1.25', note: '설명', noteI18n: { ko: '설명', en: 'Note' } }
  );
});

test('M24b-7 nextMonthKst: KST 기준 다음 달(연말·UTC 경계)', () => {
  assert.equal(F.nextMonthKst(new Date('2026-11-06T03:00:00Z')), '2026-12');
  assert.equal(F.nextMonthKst(new Date('2026-12-15T00:00:00Z')), '2027-01');
  // UTC 11월 30일 15:00 = KST 12월 1일 0시 → 다음 달은 1월
  assert.equal(F.nextMonthKst(new Date('2026-11-30T15:00:00Z')), '2027-01');
  assert.equal(F.nextMonthKst(new Date('2026-11-30T14:59:00Z')), '2026-12');
});

test('M24b-8 defaultReason: 작업 이름 기본값, 200자 안', () => {
  const monthly = { kind: 'monthly_pick', month: '2026-12', titleI18n: { ko: '12월의 곡' } };
  assert.equal(F.defaultReason('items', monthly), '이달의 곡 2026-12 곡 교체');
  assert.equal(F.defaultReason('publish', { kind: 'curated', titleI18n: { ko: '재즈 입문' } }), "큐레이션 '재즈 입문' 공개");
  assert.equal(F.defaultReason('create', { kind: 'curated', titleI18n: { ko: '' } }), '큐레이션 만들기');
  const long = F.defaultReason('delete', { kind: 'curated', titleI18n: { ko: '가'.repeat(100) } });
  assert.ok(long.length <= F.REASON_MAX);
  assert.ok(long.includes('…'));
});
