// M2-1b: 노트 화면의 순수 계산(경과 시간·진행 단계 문구). React 없음 — node 테스트 test/m21b_note_form.test.js
// 명세 개발산출물/명세/M2-1b_구현명세.md §4-2 · M2-1c 구간·재시도(결과/M2-1c_구간재시도.md)
import { t } from './i18n.mts';
import { formatSec, parseTimeInput } from '../components/progressions/model.mts';

/** URL 입력이 멈춘 뒤 예상 크레딧을 묻기까지 기다리는 시간 */
export const ESTIMATE_DEBOUNCE_MS = 600;
/** 분석 중 이 초가 넘으면 "평소보다 오래" 안내 */
export const SLOW_JOB_SEC = 180;

/** 작업의 상태·시각만 쓴다(apiClient.ts를 import하지 않는다 — node 테스트용) */
export interface JobTimes {
  status: string;
  createdAt?: string | null;
  startedAt?: string | null;
}

/** 초 → m:ss (분은 60을 넘어도 그대로). 음수·NaN은 0 */
export function formatElapsed(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** 대기 중은 요청 시각부터, 분석 중은 시작 시각(없으면 요청 시각)부터의 초. 끝난 작업·시각 없음은 null */
export function jobElapsedSec(job: JobTimes, nowMs: number): number | null {
  const from = job.status === 'queued' ? job.createdAt : job.status === 'running' ? job.startedAt || job.createdAt : null;
  if (!from) return null;
  const startMs = Date.parse(from);
  if (!Number.isFinite(startMs)) return null;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export interface JobStageView {
  stage: 'queued' | 'running' | 'slow';
  /** 배지 글자: "대기 중 · 0:12" */
  label: string;
  /** 배지 아래 안내 */
  hint: string;
}

/** 진행 중 작업의 배지·안내. 끝난 작업이면 null */
export function jobStage(job: JobTimes, nowMs: number): JobStageView | null {
  const sec = jobElapsedSec(job, nowMs);
  if (sec === null) return null;
  const elapsed = formatElapsed(sec);
  if (job.status === 'queued') {
    return { stage: 'queued', label: t('notes.job.queued', { elapsed }), hint: t('notes.job.queuedHint') };
  }
  if (sec >= SLOW_JOB_SEC) {
    return { stage: 'slow', label: t('notes.job.running', { elapsed }), hint: t('notes.job.slowHint') };
  }
  return { stage: 'running', label: t('notes.job.running', { elapsed }), hint: t('notes.job.runningHint') };
}

// ── M2-1c: 분석 구간 · 실패 작업 재시도 ─────────────────────────

export type NoteRangeError = '' | 'format' | 'order';

export interface NoteRange {
  startSec: number | null;
  endSec: number | null;
  error: NoteRangeError;
}

/** 시작·끝 칸 → 초. 규칙은 코드 진행 분석 checkRange(GA-2)·서버 parseAnalyzeOptions와 같다(0~86400, 끝 > 시작). 빈 칸 = null */
export function checkNoteRange(startText: string, endText: string): NoteRange {
  const s = parseTimeInput(startText);
  const e = parseTimeInput(endText);
  if (s === undefined || e === undefined) return { startSec: null, endSec: null, error: 'format' };
  if (e !== null && e <= (s ?? 0)) return { startSec: s, endSec: e, error: 'order' };
  return { startSec: s, endSec: e, error: '' };
}

/** 요청·예상 본문에 붙일 구간 — 값이 있는 필드만(구간 없는 요청은 M2-1s 전과 바이트 단위로 같다, S-D4) */
export function rangeBody(r: NoteRange): { startSec?: number; endSec?: number } {
  const out: { startSec?: number; endSec?: number } = {};
  if (typeof r.startSec === 'number') out.startSec = r.startSec;
  if (typeof r.endSec === 'number') out.endSec = r.endSec;
  return out;
}

/** 재시도로 폼에 다시 채울 작업 필드(apiClient AnalysisJobDto의 일부) */
export interface RetryJob {
  url?: string | null;
  tags?: unknown;
  memo?: string | null;
  startSec?: number | null;
  endSec?: number | null;
}

export interface RetryDraft {
  url: string;
  tags: string[];
  memo: string;
  startText: string;
  endText: string;
}

const secText = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? formatSec(Math.floor(v)) : '');

/** 실패 작업 → 폼 값. 태그는 폼에 있는 것만 폼 순서로(하나도 없으면 기본 태그), 초는 m:ss 칸 글자로 */
export function retryDraft(job: RetryJob, formTags: ReadonlyArray<string>, defaultTags: ReadonlyArray<string>): RetryDraft {
  const jobTags = Array.isArray(job.tags) ? job.tags.filter((x): x is string => typeof x === 'string') : [];
  const tags = formTags.filter((x) => jobTags.includes(x));
  return {
    url: typeof job.url === 'string' ? job.url : '',
    tags: tags.length > 0 ? tags : [...defaultTags],
    memo: typeof job.memo === 'string' ? job.memo : '',
    startText: secText(job.startSec),
    endText: secText(job.endSec),
  };
}
