// M2-1c: 노트 폼 구간 검사·본문·재시도 복원(frontend/src/lib/noteForm.mts) — 결과/M2-1c_구간재시도.md
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let F;
before(async () => {
  F = await import('../frontend/src/lib/noteForm.mts');
});

const FORM_TAGS = ['화성', '사운드 디자인', 'DAW/MIDI', '리듬', '편곡', '믹싱', 'TAB'];

test('NR-1 checkNoteRange: 빈 칸 null, m:ss·초, 끝 ≤ 시작은 order, 형식·범위 밖은 format', () => {
  assert.deepEqual(F.checkNoteRange('', ''), { startSec: null, endSec: null, error: '' });
  assert.deepEqual(F.checkNoteRange('1:20', '200'), { startSec: 80, endSec: 200, error: '' });
  assert.deepEqual(F.checkNoteRange('', '0:01'), { startSec: null, endSec: 1, error: '' });
  assert.deepEqual(F.checkNoteRange('', '0'), { startSec: null, endSec: 0, error: 'order' }); // 서버: endSec > (startSec ?: 0)
  assert.deepEqual(F.checkNoteRange('3:00', '3:00'), { startSec: 180, endSec: 180, error: 'order' });
  assert.equal(F.checkNoteRange('abc', '').error, 'format');
  assert.equal(F.checkNoteRange('1:60', '').error, 'format');
  assert.equal(F.checkNoteRange('', '24:00:01').error, 'format'); // 86401초
  assert.equal(F.checkNoteRange('', '24:00:00').error, '');
});

test('NR-2 rangeBody: 값 있는 필드만 — 구간 없으면 빈 객체(S-D4)', () => {
  assert.deepEqual(F.rangeBody({ startSec: null, endSec: null, error: '' }), {});
  assert.deepEqual(F.rangeBody({ startSec: 0, endSec: null, error: '' }), { startSec: 0 });
  assert.deepEqual(F.rangeBody({ startSec: null, endSec: 90, error: '' }), { endSec: 90 });
  assert.deepEqual(F.rangeBody({ startSec: 80, endSec: 200, error: '' }), { startSec: 80, endSec: 200 });
});

test('NR-3 retryDraft: 링크·메모 그대로, 태그는 폼 순서·폼에 있는 것만, 초 → 칸 글자', () => {
  const d = F.retryDraft(
    { url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1', tags: ['리듬', '없는태그', '화성'], memo: '후렴', startSec: 60, endSec: 3725 },
    FORM_TAGS,
    ['화성']
  );
  assert.deepEqual(d, { url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1', tags: ['화성', '리듬'], memo: '후렴', startText: '1:00', endText: '1:02:05' });
  // 칸 글자를 다시 읽으면 같은 초
  assert.deepEqual(F.checkNoteRange(d.startText, d.endText), { startSec: 60, endSec: 3725, error: '' });
});

test('NR-4 retryDraft: 빠진 값·이상한 값 — 태그 없으면 기본, 구간 null·음수·NaN은 빈 칸, memo 없으면 ""', () => {
  assert.deepEqual(F.retryDraft({ url: null, tags: 'x', memo: undefined, startSec: null, endSec: -5 }, FORM_TAGS, ['화성']), {
    url: '', tags: ['화성'], memo: '', startText: '', endText: '',
  });
  assert.equal(F.retryDraft({ startSec: Number.NaN, endSec: 0 }, FORM_TAGS, ['화성']).startText, '');
  assert.equal(F.retryDraft({ startSec: 0 }, FORM_TAGS, ['화성']).startText, '0:00');
});
