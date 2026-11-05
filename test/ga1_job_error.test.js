// GA-1: 분석 작업 실패 문자열 → 화면 문구(frontend/src/lib/jobError.mts). 규칙: 개발산출물/완료/진행_분석설정.md §3-1
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let J;
before(async () => {
  J = await import('../frontend/src/lib/jobError.mts');
});

test('GA1-1 서버 코드별 제목·안내·원문', () => {
  const v = J.describeJobError('GEMINI_BILLING: Gemini 크레딧이 부족합니다 (HTTP 402). — Your prepayment credits are depleted.');
  assert.equal(v.code, 'GEMINI_BILLING');
  // M1-3b 서버 키: 사용자가 고칠 수 없는 서버 쪽 문제 + 크레딧 반환 안내(B10)
  assert.equal(v.title, '서비스 점검');
  assert.doesNotMatch(v.hint, /AI Studio|키를 확인/);
  assert.match(v.hint, /돌려드렸어요/);
  assert.equal(v.detail, 'Gemini 크레딧이 부족합니다 (HTTP 402). — Your prepayment credits are depleted.');

  assert.equal(J.describeJobError('GEMINI_RATE_LIMIT: x').title, '요청 몰림');
  assert.doesNotMatch(J.describeJobError('GEMINI_RATE_LIMIT: x').hint, /무료 등급 키/);
  assert.equal(J.describeJobError('GEMINI_OVERLOADED: x').title, 'AI 일시 장애');
  assert.equal(J.describeJobError('GEMINI_API_ERROR: x — Video is private').code, 'GEMINI_API_ERROR');
  const key = J.describeJobError('PROVIDER_KEY_INVALID: API 키가 잘못되었습니다.');
  assert.equal(key.title, '서비스 점검');
  assert.match(key.hint, /운영자/);
  const max = J.describeJobError('GEMINI_MAX_TOKENS: 응답이 출력 상한(8192)에서 잘렸습니다.');
  assert.equal(max.code, 'GEMINI_MAX_TOKENS');
  assert.match(max.hint, /구간을 줄여/);
});

test('GA1-2 코드 없는 문장은 그대로 안내로', () => {
  const v = J.describeJobError('분석 제한 시간(54분)을 초과하여 중단되었습니다.');
  assert.equal(v.code, 'UNKNOWN');
  assert.equal(v.title, '분석 실패');
  assert.equal(v.hint, '분석 제한 시간(54분)을 초과하여 중단되었습니다.');
});

test('GA1-3 잘못된 입력: 빈 값·null·숫자·모르는 코드', () => {
  for (const bad of [null, undefined, '', '   ', 42, {}]) {
    const v = J.describeJobError(bad);
    assert.equal(v.code, 'UNKNOWN');
    assert.equal(v.title, '분석 실패');
    assert.ok(v.hint.length > 0);
  }
  const unknown = J.describeJobError('SOMETHING_NEW: 처음 보는 오류');
  assert.equal(unknown.code, 'UNKNOWN');
  assert.equal(unknown.hint, 'SOMETHING_NEW: 처음 보는 오류');
});

test('GA1-4 (M1-3c) 키 오류 판별 함수는 없어졌다 — 서버 키라 화면이 키 상태를 바꾸지 않는다', () => {
  assert.equal(J.isKeyInvalidError, undefined);
});

test('M13c-1 분석 요청 오류 문구: 403 티어 · 402 크레딧 · 503 · 404 · 그 밖', () => {
  const tier = { status: 403, code: 'TIER_UPGRADE_REQUIRED', message: 's', data: { detail: { feature: 'ai', tier: 'free', nextTier: 'pro' } } };
  assert.equal(J.describeAnalyzeRequestError(tier), 'AI 영상 분석은 Pro 플랜부터 쓸 수 있어요.');
  const credits = { status: 402, code: 'INSUFFICIENT_CREDITS', message: 's', data: { detail: { required: 11, balance: 5 } } };
  assert.equal(J.describeAnalyzeRequestError(credits), '크레딧이 부족해요 (필요 11 · 남은 5). 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.');
  assert.match(J.describeAnalyzeRequestError({ status: 503, code: 'GEMINI_UNAVAILABLE', message: 's' }), /잠시 쓸 수 없어요/);
  assert.match(J.describeAnalyzeRequestError({ status: 404, code: 'VIDEO_NOT_FOUND', message: 's' }), /영상을 찾을 수 없어요/);
  // 400(라이브·시작 ≥ 길이)·409 등은 서버 문장 그대로
  assert.equal(J.describeAnalyzeRequestError({ status: 400, code: 'INVALID_INPUT', message: '라이브 영상은 분석할 수 없습니다.' }), '라이브 영상은 분석할 수 없습니다.');
});

test('M13c-2 잘못된 입력: detail 없음·숫자 아님·null·문자열 → 깨지지 않음', () => {
  assert.equal(J.describeAnalyzeRequestError({ code: 'INSUFFICIENT_CREDITS' }), '크레딧이 부족해요. 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.');
  assert.equal(
    J.describeAnalyzeRequestError({ code: 'INSUFFICIENT_CREDITS', data: { detail: { required: '11', balance: null } } }),
    '크레딧이 부족해요. 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.'
  );
  assert.equal(J.describeAnalyzeRequestError({ code: 'TIER_UPGRADE_REQUIRED', data: null }), 'AI 영상 분석은 Pro 플랜부터 쓸 수 있어요.');
  for (const bad of [null, undefined, 'x', 42, {}]) assert.equal(J.describeAnalyzeRequestError(bad), '요청 실패');
  assert.equal(J.tierLabel('pro_plus'), 'Pro+');
  assert.equal(J.tierLabel(undefined), '');
});
