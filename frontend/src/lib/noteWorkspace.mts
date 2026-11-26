// NT-2a: 학습 노트 워크스페이스의 순수 계산(업로드 사전 검사·오류 문구·그리드 합치기·노트북 주소).
// React·apiClient를 import하지 않는다 — node 테스트 test/nt2a_note_upload.test.js. 명세 개발산출물/명세/NT-2_구현명세.md §4
import { t, type I18nKey } from './i18n.mts';

/** 서버 상수와 같다(NoteFileValidator.kt·NoteDocService.kt·NoteFolderService.kt). 최종 판정은 서버 */
export const NOTE_FILE_MAX_BYTES = 20_971_520; // RE:DO 저장공간 한 파일 20MB
export const NOTE_DRIVE_MAX_BYTES = 2_147_483_648; // Drive 참조 자기 신고 상한 2GB
export const NOTE_FILES_PER_DOC = 20;
export const NOTE_TITLE_MAX = 300;
export const NOTE_FOLDER_NAME_MAX = 60;
export const NOTE_FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/** 노트북 색 키(서버 color 칸) → CSS `data-fold` 값. 새 토큰 없음(§4.1) */
export const NOTE_FOLDER_COLORS = ['orange', 'slate', 'sage'] as const;
export type NoteFolderColor = (typeof NOTE_FOLDER_COLORS)[number];
export function foldKey(color: string | null | undefined): NoteFolderColor | 'none' {
  return (NOTE_FOLDER_COLORS as ReadonlyArray<string>).includes(color || '') ? (color as NoteFolderColor) : 'none';
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** 파일 이름 확장자 → 허용 mime. 허용 밖이면 null */
export function noteFileMime(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 1) return null;
  return MIME_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** 확장자 뺀 이름(제목 기본값). 300자로 자른다 */
export function defaultNoteTitle(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim().slice(0, NOTE_TITLE_MAX);
}

export type NoteStorage = 'supabase' | 'drive';
export type NoteFileIssue = '' | 'type' | 'empty' | 'big' | 'driveBig' | 'quota';
export interface PickedFile {
  name: string;
  size: number;
  type: string;
}

export interface UploadCheck {
  issues: NoteFileIssue[];
  tooMany: boolean;
  /** 20MB 넘는 파일이 있어 RE:DO 저장공간을 고를 수 없다 */
  needsDrive: boolean;
  ok: boolean;
}

/**
 * 클라이언트 사전 검사(§4.3-4). remainingBytes: RE:DO 남은 용량, null = 제한 없음.
 * file.type이 비어 있는 기기(일부 WebView)는 확장자로만 본다
 */
export function checkUploadFiles(files: ReadonlyArray<PickedFile>, storage: NoteStorage, remainingBytes: number | null): UploadCheck {
  let left = remainingBytes;
  const issues = files.map((f): NoteFileIssue => {
    const mime = noteFileMime(f.name);
    if (!mime || (f.type && f.type !== mime)) return 'type';
    if (!(f.size > 0)) return 'empty';
    if (storage === 'drive') return f.size > NOTE_DRIVE_MAX_BYTES ? 'driveBig' : '';
    if (f.size > NOTE_FILE_MAX_BYTES) return 'big';
    if (left !== null) {
      if (f.size > left) return 'quota';
      left -= f.size;
    }
    return '';
  });
  const tooMany = files.length > NOTE_FILES_PER_DOC;
  const needsDrive = files.some((f) => f.size > NOTE_FILE_MAX_BYTES);
  return { issues, tooMany, needsDrive, ok: files.length > 0 && !tooMany && issues.every((i) => i === '') };
}

export const FILE_ISSUE_KEY: Record<Exclude<NoteFileIssue, ''>, I18nKey> = {
  type: 'notes.upload.fileErr.type',
  empty: 'notes.upload.fileErr.empty',
  big: 'notes.upload.fileErr.big',
  driveBig: 'notes.upload.fileErr.driveBig',
  quota: 'notes.upload.fileErr.quota',
};

/** 바이트 → 사람이 읽는 크기(MB 한 자리, 1GB 이상은 GB) */
export function formatBytes(n: number | null | undefined): string {
  const v = Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0;
  if (v >= 1_073_741_824) return `${trim1(v / 1_073_741_824)}GB`;
  if (v >= 1_048_576 || v === 0) return `${trim1(v / 1_048_576)}MB`;
  return `${Math.max(1, Math.round(v / 1024))}KB`;
}
function trim1(x: number): string {
  const s = x.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function tierName(tier: string | null | undefined): string {
  return tier === 'pro_plus' ? 'PRO+' : tier === 'pro' ? 'PRO' : tier === 'free' ? 'FREE' : String(tier || '');
}

export interface UploadErrorLike {
  code?: string;
  status?: number;
  data?: unknown;
}
export interface UploadErrorText {
  text: string;
  /** `요금제 보기 →` 링크를 붙인다 */
  upgrade: boolean;
  /** `Drive에 저장` 버튼 후보(용량·크기 초과) */
  suggestDrive: boolean;
}

/** 서버 오류 코드 → 문구(§4.3 표). fileSize = 실패한 파일 크기(용량 초과 문구용) */
export function describeUploadError(err: UploadErrorLike | null | undefined, fileSize?: number): UploadErrorText {
  const code = err?.code || '';
  const detail = ((err?.data as { detail?: Record<string, unknown> } | null | undefined)?.detail || {}) as Record<string, unknown>;
  const num = (k: string): number | null => (typeof detail[k] === 'number' && Number.isFinite(detail[k]) ? (detail[k] as number) : null);
  const plain = (key: I18nKey, vars?: Record<string, string | number>): UploadErrorText => ({ text: t(key, vars), upgrade: false, suggestDrive: false });
  const next = (): string => {
    const nextTier = typeof detail.nextTier === 'string' ? detail.nextTier : '';
    const nextLimit = num('nextLimit');
    return nextTier && nextLimit !== null ? t('notes.upload.err.nextTier', { tier: tierName(nextTier), next: nextLimit }) : '';
  };
  switch (code) {
    case 'TIER_UPGRADE_REQUIRED':
      return { text: t('notes.upload.err.upgrade'), upgrade: true, suggestDrive: false };
    case 'NOTE_DOC_LIMIT_EXCEEDED':
      return plain('notes.upload.err.docLimit', { limit: num('limit') ?? '', next: next() });
    case 'NOTE_FOLDER_LIMIT_EXCEEDED':
      return plain('notes.upload.err.folderLimit', { limit: num('limit') ?? '', next: next() });
    case 'NOTE_FILE_COUNT_EXCEEDED':
      return plain('notes.upload.err.count');
    case 'NOTE_FILE_TOO_LARGE':
      return { text: t('notes.upload.err.tooLarge'), upgrade: false, suggestDrive: true };
    case 'FILE_QUOTA_EXCEEDED':
      return {
        text: t('notes.upload.err.quota', {
          limit: formatBytes(num('limitBytes')),
          used: formatBytes(num('usedBytes')),
          size: formatBytes(fileSize ?? 0),
        }),
        upgrade: false,
        suggestDrive: true,
      };
    case 'INVALID_NOTE_FILE':
      return plain('notes.upload.err.invalid');
    case 'NOT_LOGGED_IN':
      return plain('notes.errLoginRequired');
    default:
      if (err?.status === 401) return plain('notes.errLoginRequired');
      return plain('notes.upload.err.storage'); // STORAGE_UNAVAILABLE·STORAGE_ERROR·네트워크
  }
}

/** 선택한 노트북: 전체 · 기본 노트북(folder=none) · 노트북 id */
export type FolderPick = 'all' | 'none' | string;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function folderFromSearch(search: string): FolderPick {
  const v = new URLSearchParams(search).get('folder');
  if (v === 'none') return 'none';
  return v && UUID_RE.test(v) ? v.toLowerCase() : 'all';
}

/** 주소 쿼리 값(전체면 null) */
export function folderToQuery(pick: FolderPick): string | null {
  return pick === 'all' ? null : pick;
}

export type NoteKindFilter = 'all' | 'ai' | 'doc';

interface AiLike {
  id: string;
  folderId?: string | null;
  createdAt: string;
}
interface DocLike {
  id: string;
  kind: string;
  folderId: string | null;
  updatedAt: string;
}
export type WorkspaceItem<A extends AiLike, D extends DocLike> =
  | { type: 'ai'; key: string; time: number; note: A }
  | { type: 'doc'; key: string; time: number; doc: D };

const timeOf = (iso: string): number => {
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : 0;
};

/**
 * 통합 그리드(§4.1): AI 노트(createdAt) + 자료 노트(updatedAt)를 최근순으로 합친다.
 * 노트북·종류는 클라이언트에서 거른다(§4.2). 'doc' 필터는 자료(document)만 — 블록(NT-3)은 '전체'에만 보인다
 */
export function workspaceItems<A extends AiLike, D extends DocLike>(
  notes: ReadonlyArray<A>,
  docs: ReadonlyArray<D>,
  folder: FolderPick,
  kind: NoteKindFilter,
): WorkspaceItem<A, D>[] {
  const inFolder = (id: string | null | undefined): boolean =>
    folder === 'all' ? true : folder === 'none' ? !id : id === folder;
  const out: WorkspaceItem<A, D>[] = [];
  if (kind !== 'doc') {
    for (const n of notes) if (inFolder(n.folderId)) out.push({ type: 'ai', key: 'ai:' + n.id, time: timeOf(n.createdAt), note: n });
  }
  if (kind !== 'ai') {
    for (const d of docs) {
      if (kind === 'doc' && d.kind !== 'document') continue;
      if (inFolder(d.folderId)) out.push({ type: 'doc', key: 'doc:' + d.id, time: timeOf(d.updatedAt), doc: d });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

/** 순서 바꾸기(↑↓): 전체 id 목록에서 index를 delta만큼 옮긴다. 범위 밖이면 null */
export function moveId(ids: ReadonlyArray<string>, id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
