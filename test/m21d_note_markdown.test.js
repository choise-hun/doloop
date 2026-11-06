// M2-1d: 노트 상세 화면 마크다운 및 플레이어 링크 단위 테스트
// 명세 개발산출물/명세/M2-1d_구현명세.md §8-1
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let M;
before(async () => {
  M = await import('../frontend/src/lib/noteMarkdown.mts');
});

test('MD-1 href: notePracticeHref 상대/절대 URL, 0/null/음수는 t 없음, 인코딩 보장', () => {
  assert.equal(M.notePracticeHref('abc', 84), 'practice.html?v=abc&t=84');
  assert.equal(M.notePracticeHref('abc', 0), 'practice.html?v=abc');
  assert.equal(M.notePracticeHref('abc', null), 'practice.html?v=abc');
  assert.equal(M.notePracticeHref('abc', -5), 'practice.html?v=abc');
  assert.equal(M.notePracticeHref('a b', 5, 'https://x'), 'https://x/practice.html?v=a%20b&t=5');
  assert.equal(M.notePracticeHref('a b', 5, 'https://x/'), 'https://x/practice.html?v=a%20b&t=5');
});

test('MD-2 전체: 화성·구간·과제·메모 다 있는 노트 절 순서 1~8 및 끝 줄바꿈 1개', () => {
  const note = {
    title: '테스트 노트',
    url: 'https://www.youtube.com/watch?v=vid123',
    videoId: 'vid123',
    channel: '기타채널',
    createdAt: '2026-11-07T12:00:00Z',
    tags: ['화성', '편곡'],
    headline: '곡의 핵심을 요약합니다.',
    points: ['포인트 1', '포인트 2'],
    keywords: ['재즈', '보이싱'],
    analysis: {
      harmony: {
        progressions: [
          {
            name: 'A Part',
            key: 'C Major',
            instrument: 'Guitar',
            chords: [
              { symbol: 'Cmaj7', roman: 'IM7', function: 'T', timestamp: '01:24' },
              { symbol: 'G7', roman: 'V7', function: 'D', timestamp: '01:30' },
            ],
          },
        ],
      },
      moments: [{ timestamp: '00:45', point: '인트로 솔로' }],
      practice: ['투파이브원 연습'],
    },
    memo: '내 개인 메모입니다.',
  };

  const md = M.buildNoteMarkdown(note, 'https://ulevelp.app');
  assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'), '끝 줄바꿈 1개');

  const lines = md.split('\n');
  assert.equal(lines[0], '# 테스트 노트');
  assert.ok(lines.some((l) => l.includes('기타채널') && l.includes('2026-11-07') && l.includes('#화성 #편곡')));
  assert.ok(lines.some((l) => l === 'https://www.youtube.com/watch?v=vid123'));
  assert.ok(lines.some((l) => l === '## 핵심 요약'));
  assert.ok(lines.some((l) => l === '## 화성'));
  assert.ok(lines.some((l) => l === '## 주요 구간'));
  assert.ok(lines.some((l) => l === '## 연습 과제'));
  assert.ok(lines.some((l) => l === '## 메모'));

  // 절 순서 확인
  const idxSummary = md.indexOf('## 핵심 요약');
  const idxHarmony = md.indexOf('## 화성');
  const idxMoments = md.indexOf('## 주요 구간');
  const idxPractice = md.indexOf('## 연습 과제');
  const idxMemo = md.indexOf('## 메모');

  assert.ok(idxSummary > 0 && idxSummary < idxHarmony);
  assert.ok(idxHarmony < idxMoments);
  assert.ok(idxMoments < idxPractice);
  assert.ok(idxPractice < idxMemo);
});

test('MD-3 빈 절: headline·points·moments·practice·memo 없음, tags [] → ## 줄이 하나도 없다', () => {
  const note = {
    title: '빈 절 노트',
    url: 'https://youtube.com/watch?v=abc',
    tags: [],
  };
  const md = M.buildNoteMarkdown(note, 'https://ulevelp.app');
  assert.ok(!md.includes('## '), '## 줄이 하나도 없다');
  assert.ok(md.startsWith('# 빈 절 노트\n\nhttps://youtube.com/watch?v=abc\n'));
});

test('MD-4 시간 링크: 코드 timestamp 01:24·1:02:03·빈 문자열·abc 처리', () => {
  const note = {
    title: '시간 링크 테스트',
    videoId: 'v123',
    tags: ['화성'],
    analysis: {
      harmony: {
        progressions: [
          {
            name: 'P1',
            chords: [
              { symbol: 'C', timestamp: '01:24' },
              { symbol: 'D', timestamp: '1:02:03' },
              { symbol: 'E', timestamp: '' },
              { symbol: 'F', timestamp: 'abc' },
            ],
          },
        ],
      },
    },
  };
  const md = M.buildNoteMarkdown(note, 'https://ulevelp.app');
  assert.ok(md.includes('[01:24](https://ulevelp.app/practice.html?v=v123&t=84)'));
  assert.ok(md.includes('[1:02:03](https://ulevelp.app/practice.html?v=v123&t=3723)'));
  assert.ok(!md.includes('t=NaN'));
  assert.ok(md.includes('| F |  |  | abc |'));
});

test('MD-5 표 이스케이프: 기능 칸 T|S, 줄바꿈', () => {
  const note = {
    title: '표 이스케이프 테스트',
    videoId: 'v123',
    tags: ['화성'],
    analysis: {
      harmony: {
        progressions: [
          {
            name: 'P1',
            chords: [
              { symbol: 'C', roman: 'I', function: 'T|S\nsub' },
            ],
          },
        ],
      },
    },
  };
  const md = M.buildNoteMarkdown(note, 'https://ulevelp.app');
  assert.ok(md.includes('T\\|S sub'));
  assert.ok(!md.includes('T|S'));
});

test('MD-6 화성 조건: analysis.harmony 있음 + tags에 화성 없음 → 화성 절 없음', () => {
  const note = {
    title: '화성 태그 누락',
    tags: ['사운드 디자인'],
    analysis: {
      harmony: {
        progressions: [{ name: '진행', chords: [{ symbol: 'C' }] }],
      },
    },
  };
  const md = M.buildNoteMarkdown(note, 'https://ulevelp.app');
  assert.ok(!md.includes('## 화성'));
});
