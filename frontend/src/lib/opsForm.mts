// M2-4b 운영 화면(큐레이션·이달의 곡) 순수 함수 — test/ops_form.test.js가 node로 직접 부른다(DOM·apiClient import 없음)
// 근거: 개발산출물/결과/M1-4b_큐레이션API.md §3-3(서버 검사와 같은 값), 진행_운영화면.md §2 O3(ko만 고치고 다른 언어 보존)
// 유튜브 주소 → ID 변환은 security.ts videoIdFrom을 컴포넌트에서 부르고, 여기는 ID를 받은 뒤만 검사한다

export type OpsLocale = 'ko' | 'en' | 'ja';
export type OpsI18n = { ko?: string; en?: string; ja?: string };
export type OpsKind = 'curated' | 'monthly_pick';

/** 서버 상한(M1-4b §3-3) — 화면에서도 먼저 막는다 */
export const ITEM_MAX: Record<OpsKind, number> = { monthly_pick: 5, curated: 50 };
export const TITLE_MAX = 100;
export const DESC_MAX = 1000;
export const NOTE_MAX = 300;
export const REASON_MAX = 200;
export const RATE_MIN = 0.25;
export const RATE_MAX = 2;

const VIDEO_ID_RE = /^[\w-]{11}$/;

export function kindLabel(kind: string): string {
  return kind === 'monthly_pick' ? '이달의 곡' : '큐레이션';
}

/**
 * 번역 묶음에서 한 언어만 바꾼다. 다른 언어 키는 그대로 둔다(PATCH가 묶음을 통째로 바꾸기 때문).
 * 빈 값(공백만 포함)은 그 언어 키를 뺀다. 모르는 키는 버린다(서버 E9: ko·en·ja만)
 */
export function mergeI18n(base: OpsI18n | null | undefined, locale: OpsLocale, text: string): OpsI18n {
  const out: OpsI18n = {};
  for (const k of ['ko', 'en', 'ja'] as const) {
    const v = base && typeof base[k] === 'string' ? base[k]!.trim() : '';
    if (v) out[k] = v;
  }
  const t = String(text ?? '').trim();
  if (t) out[locale] = t;
  else delete out[locale];
  return out;
}

/** 두 번역 묶음이 같은지(키 순서 무관) — 바뀐 칸만 PATCH에 넣는다 */
export function sameI18n(a: OpsI18n | null | undefined, b: OpsI18n | null | undefined): boolean {
  const ka = mergeI18n(a, 'ko', (a && a.ko) || '');
  const kb = mergeI18n(b, 'ko', (b && b.ko) || '');
  return (['ko', 'en', 'ja'] as const).every((k) => (ka[k] || '') === (kb[k] || ''));
}

/** 구간 입력: '' = 없음(null), '83' 또는 '83.5' = 초, '1:23' = 1분 23초. 형식이 틀리면 NaN */
export function parseTime(text: string): number | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return NaN;
}

/** 초 → '1:23'(소수는 한 자리). null이면 '' */
export function formatTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const whole = Math.floor(sec);
  const frac = Math.round((sec - whole) * 10) / 10;
  const m = Math.floor(whole / 60);
  const r = whole % 60;
  const tail = frac > 0 ? String(frac).slice(1) : '';
  return m + ':' + String(r).padStart(2, '0') + tail;
}

/** 편집 중인 곡 한 줄(입력 칸 글자 그대로) */
export interface OpsItemRow {
  videoId: string;
  /** 서버가 준 YouTube 제목·채널(저장 전 새 줄은 null) */
  title: string | null;
  artist: string | null;
  a: string;
  b: string;
  rate: string;
  /** ko 곡 설명 칸 */
  note: string;
  /** 서버가 준 원래 설명 묶음 — en·ja 보존용 */
  noteI18n: OpsI18n;
}

export interface OpsItemInput {
  videoId: string;
  a: number | null;
  b: number | null;
  rate: number;
  noteI18n?: OpsI18n;
}

export function rowFromItem(item: {
  videoId: string;
  title?: string | null;
  artist?: string | null;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
  noteI18n?: OpsI18n | null;
}): OpsItemRow {
  return {
    videoId: item.videoId,
    title: item.title ?? null,
    artist: item.artist ?? null,
    a: formatTime(item.a ?? null),
    b: formatTime(item.b ?? null),
    rate: String(item.rate ?? 1),
    note: (item.noteI18n && item.noteI18n.ko) || '',
    noteI18n: { ...(item.noteI18n || {}) },
  };
}

export function newRow(videoId: string): OpsItemRow {
  return { videoId, title: null, artist: null, a: '', b: '', rate: '1', note: '', noteI18n: {} };
}

/**
 * 곡 줄 검사 → 서버 PUT 본문 items. 오류가 하나라도 있으면 items는 null.
 * 오류 문구는 "n번 곡: …" 형식(n = 1부터)
 */
export function checkItems(kind: OpsKind, rows: OpsItemRow[]): { items: OpsItemInput[] | null; errors: string[] } {
  const errors: string[] = [];
  const max = ITEM_MAX[kind];
  if (rows.length > max) errors.push(`${kindLabel(kind)}은 ${max}곡까지예요.`);
  const seen = new Set<string>();
  const items: OpsItemInput[] = [];
  rows.forEach((r, i) => {
    const n = `${i + 1}번 곡`;
    const id = String(r.videoId || '').trim();
    if (!VIDEO_ID_RE.test(id)) errors.push(`${n}: 영상 ID가 올바르지 않아요.`);
    else if (seen.has(id)) errors.push(`${n}: 같은 영상이 이미 있어요.`);
    seen.add(id);
    const a = parseTime(r.a);
    const b = parseTime(r.b);
    if (Number.isNaN(a)) errors.push(`${n}: 시작은 분:초 또는 초로 적어 주세요.`);
    if (Number.isNaN(b)) errors.push(`${n}: 끝은 분:초 또는 초로 적어 주세요.`);
    if (a !== null && b !== null && !Number.isNaN(a) && !Number.isNaN(b) && a >= b) errors.push(`${n}: 끝이 시작보다 뒤여야 해요.`);
    const rateText = String(r.rate ?? '').trim();
    const rate = rateText ? Number(rateText) : 1;
    if (!Number.isFinite(rate) || rate < RATE_MIN || rate > RATE_MAX) errors.push(`${n}: 배속은 ${RATE_MIN}~${RATE_MAX} 사이예요.`);
    const note = String(r.note ?? '').trim();
    if (note.length > NOTE_MAX) errors.push(`${n}: 설명은 ${NOTE_MAX}자까지예요.`);
    const noteI18n = mergeI18n(r.noteI18n, 'ko', note);
    const item: OpsItemInput = { videoId: id, a, b, rate };
    if (Object.keys(noteI18n).length) item.noteI18n = noteI18n;
    items.push(item);
  });
  return errors.length ? { items: null, errors } : { items, errors };
}

/** KST 기준 다음 달 'YYYY-MM' — 이달의 곡 기본값(미리 만들어 공개해 둬도 그 달에만 보인다, M1-4b E4) */
export function nextMonthKst(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  let y = kst.getUTCFullYear();
  let m = kst.getUTCMonth() + 2; // 0-based + 1(다음 달) + 1(1부터)
  if (m > 12) {
    m -= 12;
    y += 1;
  }
  return y + '-' + String(m).padStart(2, '0');
}

/** 폴더 이름표: 이달의 곡은 달, 큐레이션은 ko 제목 */
export function folderTag(folder: { kind: string; month?: string | null; title?: string; titleI18n?: OpsI18n }): string {
  if (folder.kind === 'monthly_pick' && folder.month) return `${kindLabel(folder.kind)} ${folder.month}`;
  const t = ((folder.titleI18n && folder.titleI18n.ko) || folder.title || '').trim();
  if (!t) return kindLabel(folder.kind);
  return `${kindLabel(folder.kind)} '${t.length > 30 ? t.slice(0, 30) + '…' : t}'`;
}

export type OpsAction = 'create' | 'edit' | 'items' | 'publish' | 'unpublish' | 'delete';

const ACTION_TEXT: Record<OpsAction, string> = {
  create: '만들기',
  edit: '정보 수정',
  items: '곡 교체',
  publish: '공개',
  unpublish: '비공개',
  delete: '삭제',
};

/** 기본 사유(고칠 수 있음). 예: "이달의 곡 2026-12 곡 교체" */
export function defaultReason(action: OpsAction, folder: { kind: string; month?: string | null; title?: string; titleI18n?: OpsI18n }): string {
  return `${folderTag(folder)} ${ACTION_TEXT[action]}`.slice(0, REASON_MAX);
}
