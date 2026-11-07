// L0: 다국어 엔진·한국어 사전·문구 이전 확인 — 명세 개발산출물/명세/L0_구현명세.md
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let I;
let KO;
let EN;
let JA;
let J;
before(async () => {
  I = await import('../frontend/src/lib/i18n.mts');
  KO = (await import('../frontend/src/lib/i18n/ko.mts')).KO;
  EN = (await import('../frontend/src/lib/i18n/en.mts')).EN;
  JA = (await import('../frontend/src/lib/i18n/ja.mts')).JA;
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

// LA-1~3: 정적 검증 — 한글 잔존 0 · 마커 사유 2자 이상 · 동적 템플릿 키 금지
const D6_DIRS = new Set([
  'frontend/src/lib/i18n',
  'frontend/src/lib/engine',
  'frontend/src/components/ops',
]);
const D6_FILES = new Set([
  'frontend/src/lib/opsForm.mts',
  'frontend/src/lib/noteMarkdown.mts',
]);

const getTargetFiles = () => {
  const files = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(__dirname, '..', rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!D6_DIRS.has(child)) walk(child);
      } else if (/\.(tsx|ts|mts|mjs)$/.test(e.name)) {
        if (!D6_FILES.has(child)) files.push(child);
      }
    }
  };
  walk('frontend/src');
  return files;
};

test('LA-1 한글 잔존 0 (D6 제외, i18n-keep 줄 제외)', () => {
  const files = getTargetFiles();
  const remains = [];
  const hangulRegex = /[가-힣]/;

  for (const rel of files) {
    const raw = read(rel);
    // 블록 주석 줄 번호 유지 치환
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
    const lines = stripped.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('// i18n-keep:')) return;
      const codeOnly = line.replace(/\/\/.*$/, '');
      if (hangulRegex.test(codeOnly)) {
        remains.push(`${rel}:${idx + 1}`);
      }
    });
  }

  assert.deepEqual(remains, []);
});

test('LA-2 마커 사유가 2자 이상인지 검증', () => {
  const files = getTargetFiles();
  const invalidMarkers = [];

  for (const rel of files) {
    const raw = read(rel);
    const lines = raw.split('\n');
    lines.forEach((line, idx) => {
      const match = line.match(/\/\/\s*i18n-keep:(.*)$/);
      if (match) {
        const reason = match[1].trim();
        if (reason.length < 2) {
          invalidMarkers.push(`${rel}:${idx + 1}: reason too short ("${reason}")`);
        }
      }
    });
  }

  assert.deepEqual(invalidMarkers, []);
});

test('LA-3 동적 템플릿 리터럴 t() 호출 금지', () => {
  const files = getTargetFiles();
  let dynamicCount = 0;
  const dynamicRegex = /\bt\(\s*`/g;

  for (const rel of files) {
    const raw = read(rel);
    const codeOnly = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
      .replace(/\/\/.*$/gm, '');
    const matches = codeOnly.match(dynamicRegex);
    if (matches) dynamicCount += matches.length;
  }

  assert.equal(dynamicCount, 0);
});

// L1-2b: LB-1~5 한·영·일 사전 대칭 · 자리표시자 · 언어 전환 · 우선순위 · 계정 삭제 확인어 불변 검증
test('LB-1 KO·EN·JA 키 집합 100% 대칭 및 빈 번역 문자열 0건', () => {
  const koKeys = new Set(Object.keys(KO));
  const enKeys = new Set(Object.keys(EN));
  const jaKeys = new Set(Object.keys(JA));

  const missingInEn = [...koKeys].filter((k) => !enKeys.has(k));
  const extraInEn = [...enKeys].filter((k) => !koKeys.has(k));
  const missingInJa = [...koKeys].filter((k) => !jaKeys.has(k));
  const extraInJa = [...jaKeys].filter((k) => !koKeys.has(k));

  assert.deepEqual(missingInEn, []);
  assert.deepEqual(extraInEn, []);
  assert.deepEqual(missingInJa, []);
  assert.deepEqual(extraInJa, []);

  for (const [k, v] of Object.entries(EN)) {
    assert.ok(typeof v === 'string' && v.trim().length > 0, `EN[${k}]`);
  }
  for (const [k, v] of Object.entries(JA)) {
    assert.ok(typeof v === 'string' && v.trim().length > 0, `JA[${k}]`);
  }
});

test('LB-2 KO·EN·JA 모든 키의 {변수} 자리표시자 집합 100% 일치', () => {
  const varsOf = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const k of Object.keys(KO)) {
    assert.deepEqual(varsOf(EN[k]), varsOf(KO[k]), `EN vars mismatch: ${k}`);
    assert.deepEqual(varsOf(JA[k]), varsOf(KO[k]), `JA vars mismatch: ${k}`);
  }
});

test('LB-3 setLang(en|ja|ko) 전환 시 t()·getLang()·getLangChoice() 반환값 검증', () => {
  try {
    assert.equal(I.setLang('en'), 'en');
    assert.equal(I.getLang(), 'en');
    assert.equal(I.getLangChoice(), 'en');
    assert.equal(I.t('nav.home'), '⌂ HOME');
    assert.equal(I.t('theme.light'), 'Light');

    assert.equal(I.setLang('ja'), 'ja');
    assert.equal(I.getLang(), 'ja');
    assert.equal(I.getLangChoice(), 'ja');
    assert.equal(I.t('nav.home'), '⌂ HOME');
    assert.equal(I.t('theme.light'), 'ライト');

    assert.equal(I.setLang('ko'), 'ko');
    assert.equal(I.getLang(), 'ko');
    assert.equal(I.getLangChoice(), 'ko');
    assert.equal(I.t('nav.home'), '⌂ HOME');
    assert.equal(I.t('theme.light'), '라이트');
  } finally {
    I.setLang('auto');
    I.syncLangFromProfile(null);
  }
});

test('LB-4 resolveActiveLang() 5단계 우선순위 및 setLang(auto) 시 profileLocaleCache 해제 검증', () => {
  const origWindow = globalThis.window;
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const origIntl = globalThis.Intl;

  const store = new Map();
  const mockLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  let mockLanguages = ['en-US'];
  let mockTz = 'America/New_York';

  try {
    // D4: Node 기본 격리 (window === undefined → 'ko')
    I.setLang('auto');
    I.syncLangFromProfile(null);
    assert.equal(I.resolveActiveLang(), 'ko');

    globalThis.window = { localStorage: mockLocalStorage };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        get languages() {
          return mockLanguages;
        },
        get language() {
          return mockLanguages[0] || '';
        },
      },
    });
    globalThis.Intl = {
      ...origIntl,
      DateTimeFormat: () => ({
        resolvedOptions: () => ({ timeZone: mockTz }),
      }),
    };

    // ⑤ 최종 폴백 'ko'
    mockLanguages = ['fr-FR'];
    mockTz = 'Europe/Paris';
    assert.equal(I.resolveActiveLang(), 'ko');

    // ④ timeZone ('Asia/Tokyo' → 'ja')
    mockTz = 'Asia/Tokyo';
    assert.equal(I.resolveActiveLang(), 'ja');

    // ③ navigator.languages ('en-US' > timeZone 'Asia/Tokyo')
    mockLanguages = ['en-US', 'ja-JP'];
    assert.equal(I.resolveActiveLang(), 'en');

    // ② syncLangFromProfile ('ja' > navigator 'en-US')
    I.syncLangFromProfile('ja');
    assert.equal(I.resolveActiveLang(), 'ja');

    // ① localStorage ('ko' > profile 'ja')
    mockLocalStorage.setItem('ulp:lang', 'ko');
    assert.equal(I.resolveActiveLang(), 'ko');

    // syncLangFromProfile('en') 후 setLang('auto') 호출 시 profileLocaleCache가 비워져 브라우저 언어로 즉시 전환
    mockLocalStorage.removeItem('ulp:lang');
    mockLanguages = ['ja-JP'];
    I.syncLangFromProfile('en');
    assert.equal(I.getLang(), 'en');
    const resolvedAfterAuto = I.setLang('auto');
    assert.equal(resolvedAfterAuto, 'ja');
    assert.equal(I.getLang(), 'ja');
    assert.equal(I.getLangChoice(), 'auto');
  } finally {
    if (origWindow === undefined) delete globalThis.window;
    else globalThis.window = origWindow;
    if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator);
    globalThis.Intl = origIntl;
    I.setLang('auto');
    I.syncLangFromProfile(null);
  }
});

test('LB-5 KO·EN·JA 모두 settings.deleteConfirmWord === "삭제합니다" 유지', () => {
  assert.equal(KO['settings.deleteConfirmWord'], '삭제합니다');
  assert.equal(EN['settings.deleteConfirmWord'], '삭제합니다');
  assert.equal(JA['settings.deleteConfirmWord'], '삭제합니다');
});

