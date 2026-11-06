// L0: 다국어 엔진·한국어 사전·문구 이전 확인 — 명세 개발산출물/명세/L0_구현명세.md
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let I;
let KO;
let J;
before(async () => {
  I = await import('../frontend/src/lib/i18n.mts');
  KO = (await import('../frontend/src/lib/i18n/ko.mts')).KO;
  J = await import('../frontend/src/lib/jobError.mts');
});

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
// 주석(// …, /* … */)을 지운 소스
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('I0-1 t(): 키 → 한국어, 기본 언어 ko', () => {
  assert.equal(I.getLang(), 'ko');
  assert.equal(I.t('theme.light'), '라이트');
  assert.equal(I.t('nav.home'), '⌂ HOME');
});

test('I0-2 t(): 변수 치환·없는 변수·없는 키', () => {
  assert.equal(I.t('nav.accountAria', { who: 'a@b.c' }), '계정 설정 (a@b.c)');
  assert.equal(I.t('nav.accountAria'), '계정 설정 ({who})');
  assert.equal(I.t('nav.accountAria', { other: 1 }), '계정 설정 ({who})');
  assert.equal(I.t('no.such.key'), 'no.such.key');
});

test('I0-3 사전: 빈 값 없음·키 형식', () => {
  for (const [k, v] of Object.entries(KO)) {
    assert.match(k, /^[a-z]+(\.[a-z][A-Za-z]*)+$/, k);
    assert.ok(typeof v === 'string' && v.length > 0, k);
  }
});

test('I0-4 jobError 문구가 L0 전과 글자 하나까지 같다', () => {
  const before = {
    GEMINI_BILLING: ['서비스 점검', '서버의 AI 사용 한도에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.'],
    GEMINI_RATE_LIMIT: ['요청 몰림', '분석 요청이 몰렸어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.'],
    GEMINI_OVERLOADED: ['AI 일시 장애', 'Google 쪽 서버가 붐벼 응답하지 못했어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.'],
    PROVIDER_KEY_INVALID: ['서비스 점검', '서버의 AI 연결에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.'],
    GEMINI_API_ERROR: ['분석 실패', '영상이 비공개·삭제됐거나 AI가 요청을 거절했어요. 크레딧은 돌려드렸어요.'],
    GEMINI_MAX_TOKENS: ['분석량 초과', '영상 내용이 많아 결과가 잘렸어요. 크레딧은 돌려드렸어요. 구간을 줄여 다시 시도해 주세요.'],
  };
  for (const [c, [title, hint]] of Object.entries(before)) {
    const v = J.describeJobError(`${c}: x`);
    assert.equal(v.title, title, c);
    assert.equal(v.hint, hint, c);
  }
  assert.deepEqual(J.describeJobError(''), { code: 'UNKNOWN', title: '분석 실패', hint: '원인을 알 수 없어요. 잠시 뒤 다시 시도해 주세요.', detail: '' });
  assert.equal(J.tierLabel('free'), '무료');
  assert.equal(J.tierLabel('pro_plus'), 'Pro+');
  assert.equal(J.tierLabel('toString'), 'toString');
  assert.equal(J.tierLabel(null), '');
  assert.equal(J.describeAnalyzeRequestError({ code: 'TIER_UPGRADE_REQUIRED', data: { detail: {} } }), 'AI 영상 분석은 Pro 플랜부터 쓸 수 있어요.');
  assert.equal(J.describeAnalyzeRequestError({ code: 'TIER_UPGRADE_REQUIRED', data: { detail: { nextTier: 'pro_plus' } } }), 'AI 영상 분석은 Pro+ 플랜부터 쓸 수 있어요.');
  assert.equal(
    J.describeAnalyzeRequestError({ code: 'INSUFFICIENT_CREDITS', data: { detail: { required: 9, balance: 3 } } }),
    '크레딧이 부족해요 (필요 9 · 남은 3). 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.'
  );
  assert.equal(J.describeAnalyzeRequestError({ code: 'INSUFFICIENT_CREDITS' }), '크레딧이 부족해요. 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.');
  assert.equal(J.describeAnalyzeRequestError({ code: 'GEMINI_UNAVAILABLE' }), 'AI 분석을 잠시 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.');
  assert.equal(J.describeAnalyzeRequestError({ code: 'VIDEO_NOT_FOUND' }), '영상을 찾을 수 없어요. 공개 또는 일부 공개 영상인지 확인해 주세요.');
  assert.equal(J.describeAnalyzeRequestError({}), '요청 실패');
  assert.equal(J.describeAnalyzeRequestError({ message: '서버 문장' }), '서버 문장');
});

test('I0-5 AppShell·jobError 소스에 한글 문자열이 남지 않음(주석 제외)', () => {
  for (const p of ['frontend/src/components/layout/AppShell.tsx', 'frontend/src/lib/jobError.mts']) {
    const left = code(read(p)).split('\n').filter((l) => /[가-힣]/.test(l));
    assert.deepEqual(left, [], p);
  }
});

test('I0-6 사전의 모든 키가 소스 어딘가에서 쓰인다', () => {
  // M2-1a: L0 뒤 화면들도 t()를 쓴다 → frontend/src 전체(사전 폴더 lib/i18n 제외)를 본다
  const files = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(__dirname, '..', rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (child !== 'frontend/src/lib/i18n') walk(child);
      } else if (/\.(tsx|ts|mts)$/.test(e.name)) {
        files.push(child);
      }
    }
  };
  walk('frontend/src');
  const src = files.map(read).join('\n');
  const unused = Object.keys(KO).filter((k) => !src.includes(`'${k}'`));
  assert.deepEqual(unused, []);
});
