// GA-1: 분석 작업 실패 문자열(`analysis_jobs.error`) → 화면 문구. 서버 규칙은 `개발산출물/진행_분석설정.md` §3-1
// 서버는 `<코드>: 문장 (HTTP n). — Google 문구` 형식으로 저장한다. 코드가 없으면 문장을 그대로 보여 준다.
// M1-3b부터 Gemini는 서버 키라 키·결제 오류는 사용자가 고칠 수 없다(결과/M1-3b_크레딧서버.md B10). 실패 작업의 예약 크레딧은 전액 돌아간다.

export type JobErrorCode =
  | 'GEMINI_BILLING'
  | 'GEMINI_RATE_LIMIT'
  | 'GEMINI_OVERLOADED'
  | 'PROVIDER_KEY_INVALID'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_MAX_TOKENS'
  | 'UNKNOWN';

export interface JobErrorView {
  code: JobErrorCode;
  /** 짧은 원인(배지·줄 앞) */
  title: string;
  /** 다음 행동 안내 */
  hint: string;
  /** 서버 원문(코드 접두 제외) — title 속성 등 */
  detail: string;
}

const KNOWN: Record<Exclude<JobErrorCode, 'UNKNOWN'>, { title: string; hint: string }> = {
  GEMINI_BILLING: {
    title: '서비스 점검',
    hint: '서버의 AI 사용 한도에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.',
  },
  GEMINI_RATE_LIMIT: {
    title: '요청 몰림',
    hint: '분석 요청이 몰렸어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.',
  },
  GEMINI_OVERLOADED: {
    title: 'AI 일시 장애',
    hint: 'Google 쪽 서버가 붐벼 응답하지 못했어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.',
  },
  PROVIDER_KEY_INVALID: {
    title: '서비스 점검',
    hint: '서버의 AI 연결에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.',
  },
  GEMINI_API_ERROR: {
    title: '분석 실패',
    hint: '영상이 비공개·삭제됐거나 AI가 요청을 거절했어요. 크레딧은 돌려드렸어요.',
  },
  GEMINI_MAX_TOKENS: {
    title: '분석량 초과',
    hint: '영상 내용이 많아 결과가 잘렸어요. 크레딧은 돌려드렸어요. 구간을 줄여 다시 시도해 주세요.',
  },
};

const PREFIX = /^([A-Z][A-Z_]+):\s*/;

export function describeJobError(error: unknown): JobErrorView {
  const raw = typeof error === 'string' ? error.trim() : '';
  const m = PREFIX.exec(raw);
  const code = m && m[1] in KNOWN ? (m[1] as Exclude<JobErrorCode, 'UNKNOWN'>) : null;
  if (code) {
    return { code, ...KNOWN[code], detail: raw.slice(m![0].length) };
  }
  return {
    code: 'UNKNOWN',
    title: '분석 실패',
    hint: raw || '원인을 알 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    detail: raw,
  };
}

const TIER_LABEL: Record<string, string> = { free: '무료', pro: 'Pro', pro_plus: 'Pro+' };

/** 티어 코드 → 화면 이름(free·pro·pro_plus). 모르는 값은 그대로 */
export function tierLabel(tier: unknown): string {
  const t = typeof tier === 'string' ? tier : '';
  return TIER_LABEL[t] || t;
}

/**
 * 분석 요청(POST /notes/analyze·/progressions/analyze) 오류 → 화면 문구 (M1-3b §6).
 * 403 TIER_UPGRADE_REQUIRED · 402 INSUFFICIENT_CREDITS · 503 GEMINI_UNAVAILABLE · 404 VIDEO_NOT_FOUND. 그 밖은 서버 문장
 */
export function describeAnalyzeRequestError(err: unknown): string {
  const e = (err && typeof err === 'object' ? err : {}) as { code?: unknown; message?: unknown; data?: any };
  const detail = e.data && typeof e.data === 'object' && e.data.detail && typeof e.data.detail === 'object' ? e.data.detail : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (e.code) {
    case 'TIER_UPGRADE_REQUIRED':
      return `AI 영상 분석은 ${tierLabel(detail.nextTier) || 'Pro'} 플랜부터 쓸 수 있어요.`;
    case 'INSUFFICIENT_CREDITS': {
      const required = num(detail.required);
      const balance = num(detail.balance);
      const nums = required !== null && balance !== null ? ` (필요 ${required} · 남은 ${balance})` : '';
      return `크레딧이 부족해요${nums}. 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.`;
    }
    case 'GEMINI_UNAVAILABLE':
      return 'AI 분석을 잠시 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.';
    case 'VIDEO_NOT_FOUND':
      return '영상을 찾을 수 없어요. 공개 또는 일부 공개 영상인지 확인해 주세요.';
    default:
      return typeof e.message === 'string' && e.message.trim() ? e.message : '요청 실패';
  }
}
