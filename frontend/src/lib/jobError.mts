// GA-1: 분석 작업 실패 문자열(`analysis_jobs.error`) → 화면 문구. 서버 규칙은 `개발산출물/진행_분석설정.md` §3-1
// 서버는 `<코드>: 문장 (HTTP n). — Google 문구` 형식으로 저장한다. 코드가 없으면 문장을 그대로 보여 준다.
// M1-3b부터 Gemini는 서버 키라 키·결제 오류는 사용자가 고칠 수 없다(결과/M1-3b_크레딧서버.md B10). 실패 작업의 예약 크레딧은 전액 돌아간다.

import { t, type I18nKey } from './i18n.mts';

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

// 문구는 i18n/ko.mts. 여기는 키만(호출 시점 언어로 t() — L0 §1 D5)
const KNOWN: Record<Exclude<JobErrorCode, 'UNKNOWN'>, { title: I18nKey; hint: I18nKey }> = {
  GEMINI_BILLING: { title: 'job.billing.title', hint: 'job.billing.hint' },
  GEMINI_RATE_LIMIT: { title: 'job.rateLimit.title', hint: 'job.rateLimit.hint' },
  GEMINI_OVERLOADED: { title: 'job.overloaded.title', hint: 'job.overloaded.hint' },
  PROVIDER_KEY_INVALID: { title: 'job.keyInvalid.title', hint: 'job.keyInvalid.hint' },
  GEMINI_API_ERROR: { title: 'job.apiError.title', hint: 'job.apiError.hint' },
  GEMINI_MAX_TOKENS: { title: 'job.maxTokens.title', hint: 'job.maxTokens.hint' },
};

const PREFIX = /^([A-Z][A-Z_]+):\s*/;

export function describeJobError(error: unknown): JobErrorView {
  const raw = typeof error === 'string' ? error.trim() : '';
  const m = PREFIX.exec(raw);
  const code = m && m[1] in KNOWN ? (m[1] as Exclude<JobErrorCode, 'UNKNOWN'>) : null;
  if (code) {
    const k = KNOWN[code];
    return { code, title: t(k.title), hint: t(k.hint), detail: raw.slice(m![0].length) };
  }
  return {
    code: 'UNKNOWN',
    title: t('job.unknown.title'),
    hint: raw || t('job.unknown.hint'),
    detail: raw,
  };
}

const TIER_KEY: Record<string, I18nKey> = { free: 'tier.free', pro: 'tier.pro', pro_plus: 'tier.proPlus' };

/** 티어 코드 → 화면 이름(free·pro·pro_plus). 모르는 값은 그대로 */
export function tierLabel(tier: unknown): string {
  const v = typeof tier === 'string' ? tier : '';
  const key = Object.prototype.hasOwnProperty.call(TIER_KEY, v) ? TIER_KEY[v] : null;
  return key ? t(key) : v;
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
      return t('analyze.tierRequired', { tier: tierLabel(detail.nextTier) || t('tier.pro') });
    case 'INSUFFICIENT_CREDITS': {
      const required = num(detail.required);
      const balance = num(detail.balance);
      const nums = required !== null && balance !== null ? t('analyze.creditNums', { required, balance }) : '';
      return t('analyze.insufficientCredits', { nums });
    }
    case 'GEMINI_UNAVAILABLE':
      return t('analyze.unavailable');
    case 'VIDEO_NOT_FOUND':
      return t('analyze.videoNotFound');
    default:
      return typeof e.message === 'string' && e.message.trim() ? e.message : t('analyze.requestFailed');
  }
}
