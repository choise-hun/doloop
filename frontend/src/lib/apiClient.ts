// frontend/src/lib/apiClient.ts
import { t } from './i18n.mts';
import { auth, ApiClientError, KeySummaryDto, MeProfile, ProfilePatchInput } from './auth';

export interface SongDto {
  id: string;
  title: string;
  artist: string;
  status: string;
  statusCode: string;
  videoId: string;
  pos: number | null;
  a: number | null;
  b: number | null;
  rate: number;
  lastDate: string | null;
  memo: string;
  categoryIds: string[];
  totalSeconds: number;
  resumeUrl: string;
  durationSec: number;
}

export interface CategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  onHome: boolean;
  songCount: number;
}

export interface SongPresetDto {
  id: string;
  songId: string;
  name: string;
  a: number;
  b: number;
  rate: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresetListResponse {
  presets: SongPresetDto[];
}

export interface PresetEnvelope {
  ok: boolean;
  preset: SongPresetDto;
}

export interface UpsertPresetInput {
  name: string;
  a: number;
  b: number;
  rate?: number;
  completed?: boolean;
  merge?: boolean;
}

export interface TakeDto {
  id: string;
  sessionId: string;
  recordedAt: string;
  a: number | null;
  b: number | null;
  rate: number | null;
  durationSec: number;
  mime: string;
  sizeBytes: number;
  storage: 'supabase' | 'drive' | string;
  storageKey: string;
  memo: string;
  partName?: string;
  completed?: boolean;
}

export interface SongSessionDto {
  id: string;
  date: string;
  seconds: number;
  minutes: number;
  loops: number;
  a: number | null;
  b: number | null;
  segment: string;
  rate: number | null;
  memo: string;
  partStats?: unknown;
  coveragePct?: number;
}

export interface SongDetailResponse {
  song: SongDto;
  sessions: SongSessionDto[];
  takes: TakeDto[];
  presets?: SongPresetDto[];
}

export interface SessionSummaryDto {
  thisWeekSeconds: number;
  thisMonthSeconds: number;
}

export interface CalendarDayDto {
  date: string;
  totalSeconds: number;
  level: number;
}

export interface SessionWithSongDto extends SongSessionDto {
  songId: string;
  songTitle: string;
  songArtist: string;
  videoId: string;
  takes: TakeDto[];
}

export interface SessionListResponse {
  summary: SessionSummaryDto;
  calendar: CalendarDayDto[];
  sessions: SessionWithSongDto[];
}

export interface SaveProgressInput {
  songId: string;
  pos?: number | null;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
  date: string;
  addSeconds?: number;
  addLoops?: number;
}

export interface SaveProgressResponse {
  ok: boolean;
  keep: boolean;
  sessionId?: string | null;
  totalSeconds?: number | null;
  minutes?: number | null;
  pendingSeconds?: number | null;
}

export interface TakeUploadMeta {
  songId: string;
  date: string;
  recordedAt: string;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
  durationSec: number;
  mime: string;
  replaceOldSongTakes?: boolean;
}

export interface DriveTakeRegisterMeta extends TakeUploadMeta {
  sizeBytes: number;
  storageKey?: string;
  driveFileId?: string;
}

export interface IntegrationDto {
  provider: 'notion' | string;
  hint: string;
  config: Record<string, any>;
  updatedAt: string;
  verified?: boolean;
  displayName?: string | null;
}

export interface SaveNotionInput {
  token?: string | null;
  songsDb: string;
  sessionsDb: string;
  notesDb?: string | null;
}

/**
 * GET /api/v1/credits (M1-3b) — nextGrantAt: 다음 월 지급 시각(ISO), 다음 지급이 없으면 null.
 * monthlyExpiresAt(M1-3e): 유료 → 무료 전환 뒤 주기가 남은 유예 계정만 — 이 시각에 무료가 되고 남은 월 지급분이 소멸
 */
export interface CreditsSummaryDto {
  monthly: number;
  purchased: number;
  total: number;
  monthlyGrant: number;
  nextGrantAt: string | null;
  monthlyExpiresAt?: string | null;
}

/** POST /credits/estimate 응답 (M1-3b `CreditEstimateResponse`, CreditService.kt:101) — 예상 소모·요청 때 잡아 두는 예약액 */
export interface CreditEstimateDto {
  estimatedCredits: number;
  reserveCredits: number;
}

export interface NotionSyncStatusDto {
  enabled: boolean;
  pending: number;
  failed: number;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export interface AnalysisJobDto {
  id: string;
  kind?: 'note' | 'progression' | string;
  url: string;
  tags: string[];
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  error?: string | null;
  noteId?: string | null;
  /** 요청 때 메모(M2-1s — 원탭 재시도에서 복원). 없으면 "" */
  memo?: string;
  /** 분석 구간(초, 노트·코드 진행 — 없으면 null)·속도(코드 진행만, 노트는 null) (GA-2, M2-1s) */
  startSec?: number | null;
  endSec?: number | null;
  pace?: 'slow' | 'normal' | 'fast' | string | null;
  /** M1-3b 크레딧: 예약량, 정산량(null = 미정산, 실패 = 0) */
  reservedCredits?: number;
  chargedCredits?: number | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface NoteSummaryDto {
  id: string;
  videoId: string;
  url: string;
  title: string;
  channel: string;
  tags: string[];
  memo: string;
  headline: string;
  points: string[];
  keywords: string[];
  difficulty?: string | null;
  model: string;
  collectProgressions?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDetailDto extends NoteSummaryDto {
  analysis: Record<string, any>;
  diagramsSvg: string[];
}

// 코드 진행 모음 (docs/03-api-spec.md 8.5, 결과/CH-1b_설계.md §3)
export interface ProgressionChordDto {
  symbol: string;
  roman: string;
  source?: '화면' | '말함' | '추정' | string; // i18n-keep: 서버 타입 유니언(D5-1)
  timestamp?: string;
}

export interface ProgressionDto {
  id: string;
  kind: 'reference' | 'analysis';
  origin: 'ai' | 'manual';
  route: 'video' | 'note' | 'manual';
  evidence: '화면' | '말함' | '추정' | null; // i18n-keep: 서버 타입 유니언(D5-1)
  title: string;
  part: string;
  artist: string;
  album: string;
  channel: string;
  releaseDate: string | null;
  key: string | null;
  instrument: '건반' | '기타' | null; // i18n-keep: 서버 타입 유니언(D5-1)
  chords: ProgressionChordDto[];
  moods: string[];
  genres: string[];
  tags: string[];
  url: string;
  videoId: string | null;
  startSec: number | null;
  endSec: number | null;
  memo: string;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProgressionScope = 'reference' | 'analysis' | 'all';

// POST 본문(kind·title·chords 필수) / PATCH 본문(보낸 필드만)
export interface ProgressionInput {
  kind?: 'reference' | 'analysis';
  title?: string;
  chords?: ProgressionChordDto[];
  part?: string;
  artist?: string;
  album?: string;
  channel?: string;
  releaseDate?: string | null;
  key?: string | null;
  moods?: string[];
  genres?: string[];
  tags?: string[];
  url?: string;
  startSec?: number | null;
  endSec?: number | null;
  memo?: string;
}

export interface NoteCollectResult {
  noteId: string;
  collect: boolean;
  progressions: ProgressionDto[];
}

export interface LocalMigrationResult {
  status: 'skipped' | 'done' | 'failed';
  created: number;
  skipped: number;
  message: string;
}

export interface LocalSongRecord {
  videoId: string;
  pos: number | null;
  a: number | null;
  b: number | null;
  rate: number | null;
  date: string | null;
}

// ---- owner 관리 (/admin — 서버 OwnerOnlyPlugin이 판정, 비 owner는 403). M2-4 운영 화면이 쓴다 ----

/** 번역 칸 — 키는 ko·en·ja만(M1-4b E9). 빈 값은 서버가 뺀다 */
export type I18nText = { ko?: string; en?: string; ja?: string };

export interface AdminUserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tier: string;
  billingTier: string;
  tierOverride: string | null;
  tierOverrideUntil: string | null;
  credits: { monthly: number; purchased: number };
  isCreator: boolean;
  creatorBadge: string | null;
  creatorBio: string;
}

/** PUT /admin/users/{id}/creator — creatorBadge: 키 없음 = 그대로, null = 지움, 문자열 1~20자. creatorBio ≤ 200 */
export interface AdminCreatorInput {
  isCreator: boolean;
  creatorBadge?: string | null;
  creatorBio?: string;
  reason: string;
}

export type AdminFolderKind = 'curated' | 'monthly_pick';

export interface AdminFolderDto {
  id: string;
  kind: string;
  ownerId: string | null;
  title: string;
  isPublic: boolean;
  autoSync: boolean;
  hidden: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  titleI18n: I18nText;
  descriptionI18n: I18nText;
  month: string | null;
  sortOrder: number;
  itemCount: number;
  likeCount: number;
  cloneCount: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminFolderItemDto {
  videoId: string;
  position: number;
  title: string | null;
  artist: string | null;
  a: number | null;
  b: number | null;
  rate: number;
  noteI18n: I18nText;
}

export interface AdminFolderDetail {
  folder: AdminFolderDto;
  items: AdminFolderItemDto[];
}

export interface AdminFolderCreateInput {
  kind: AdminFolderKind;
  titleI18n: I18nText;
  descriptionI18n?: I18nText;
  month?: string;
  sortOrder?: number;
  reason: string;
}

/** PATCH는 titleI18n·descriptionI18n을 통째로 바꾼다 — ko만 고쳐도 기존 en·ja를 같이 보낸다 */
export interface AdminFolderPatch {
  titleI18n?: I18nText;
  descriptionI18n?: I18nText;
  isPublic?: boolean;
  sortOrder?: number;
  reason: string;
}

export interface AdminFolderItemInput {
  videoId: string;
  a?: number | null;
  b?: number | null;
  rate?: number;
  noteI18n?: I18nText;
}

// ---- M2-23 커뮤니티 · 큐레이션 · 재생목록 가져오기 DTO (M1-2b §2 · M1-4a §3 · M1-4b §3-1) ----

export interface PublicOwnerDto {
  id: string;
  publicName: string | null;
  isCreator: boolean;
  creatorBadge: string | null;
}

export interface PublicFolderDto {
  id: string;
  kind: string;
  title: string;
  titleI18n: I18nText;
  descriptionI18n: I18nText;
  month: string | null;
  owner: PublicOwnerDto | null;
  itemCount: number;
  coverVideoId: string | null;
  coverVideoIds: string[];
  artists: string[];
  likeCount: number;
  likedByMe: boolean;
  cloneCount: number;
  autoSync: boolean;
  publishedAt: string | null;
}

export interface PublicFolderItemDto {
  videoId: string;
  position: number;
  title: string | null;
  artist: string | null;
  a: number | null;
  b: number | null;
  rate: number;
  noteI18n: I18nText;
}

export interface CurationHomeDto {
  curated: PublicFolderDto[];
  monthlyPick: { folder: PublicFolderDto; items: PublicFolderItemDto[] } | null;
  showcase: PublicFolderDto[];
  following: PublicFolderDto[];
}

export interface PracticeDayDto {
  date: string;
  seconds: number;
}

export interface PracticeTodaySongDto {
  videoId: string;
  title: string | null;
  artist: string | null;
  seconds: number;
  loops: number;
}

export interface PracticeLogDto {
  user: PublicOwnerDto;
  days: PracticeDayDto[];
  streakDays: number;
  thisWeekSeconds: number;
  today: PracticeTodaySongDto[];
}

export interface CommunityUserDto {
  id: string;
  publicName: string | null;
  isCreator: boolean;
  creatorBadge: string | null;
  creatorBio: string;
  followerCount: number;
  followingByMe: boolean;
  folders: PublicFolderDto[];
  practiceLog: PracticeLogDto | null;
}

export interface ShareSummaryDto {
  folderId: string;
  categoryId: string;
  title: string;
  isPublic: boolean;
  autoSync: boolean;
  hidden: boolean;
  itemCount: number;
  likeCount: number;
  cloneCount: number;
  publishedAt: string | null;
  publicName: string | null;
}

export interface PlaylistPreviewDto {
  playlistId: string;
  title: string;
  itemCount: number;
  remainingSongSlots: number | null;
  remainingCategorySlots: number | null;
}

export interface PlaylistImportResultDto {
  categoryId: string;
  categoryCreated: boolean;
  playlistTitle: string;
  imported: number;
  alreadyInLibrary: number;
  skippedLimit: number;
  skippedUnavailable: number;
}

export interface PublicPartStatDto {
  name: string;
  a: number;
  b: number;
  rate: number;
  completed: boolean;
  seconds: number;
  loops: number;
}

export interface PublicEpisodeLogDto {
  postId: string;
  sessionId: string;
  owner: PublicOwnerDto;
  videoId: string;
  youtubeTitle: string | null;
  youtubeArtist: string | null;
  title: string;
  comment: string;
  publishedAt: string;
  date: string;
  seconds: number;
  loops: number;
  a: number | null;
  b: number | null;
  rate: number | null;
  coveragePct: number;
  partStats: PublicPartStatDto[];
}

export interface EpisodeLogListResponse {
  posts: PublicEpisodeLogDto[];
  next: string | null;
}

export interface EpisodeReportCountsDto {
  open: number;
  resolved: number;
  dismissed: number;
}

export interface MyEpisodeLogDto {
  postId: string;
  sessionId: string;
  title: string;
  comment: string;
  publishedAt: string;
  status: 'published' | 'tier_paused' | 'moderation_hidden' | string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  tierPausedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  canRepublish: boolean;
  reportCounts: EpisodeReportCountsDto;
  card: PublicEpisodeLogDto | null;
}

export interface MyEpisodeLogListResponse {
  posts: MyEpisodeLogDto[];
  next: string | null;
}

export interface ShareEpisodeResponse {
  post: MyEpisodeLogDto;
}

export interface WithdrawEpisodeResponse {
  ok: boolean;
}

export interface ReportEpisodeResponse {
  reportId: string;
}

const EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
};

function getAuthRef() {
  const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
  return win.ULAuth || auth;
}

let migrating = false;

function isLoggedIn(): boolean {
  const A = getAuthRef();
  const sess = A && typeof A.getSession === 'function' ? A.getSession() : null;
  return !!(sess && sess.access_token);
}

function requireLogin(): void {
  if (!isLoggedIn()) {
    const err: ApiClientError = new Error(t('api.loginReq'));
    err.code = 'NOT_LOGGED_IN';
    err.status = 401;
    throw err;
  }
}

async function listSongs(status?: string): Promise<SongDto[]> {
  requireLogin();
  let path = '/api/v1/songs';
  if (status) path += '?status=' + encodeURIComponent(status);
  const r = await getAuthRef().apiFetch(path);
  // 응답 형태가 다르면 빈 목록으로 숨기지 않고 오류로 올린다(UXR-3: 성공 0곡과 구분)
  if (!r || !Array.isArray(r.songs)) throw new Error(t('practice.songsLoadFailed'));
  return r.songs;
}

async function byVideo(videoId: string): Promise<SongDto | null> {
  requireLogin();
  const path = '/api/v1/songs/by-video/' + encodeURIComponent(videoId);
  const r = await getAuthRef().apiFetch(path);
  return r && r.song !== undefined ? r.song : null;
}

async function createSong(input: { videoId: string; title?: string; artist?: string; rate?: number; a?: number; b?: number }): Promise<SongDto | null> {
  requireLogin();
  const body = JSON.stringify({
    videoId: input?.videoId,
    title: input?.title,
    artist: input?.artist,
    rate: input?.rate,
    a: input?.a,
    b: input?.b,
  });
  const r = await getAuthRef().apiFetch('/api/v1/songs', {
    method: 'POST',
    body,
  });
  return r ? r.song : null;
}

async function getSong(songId: string): Promise<SongDetailResponse> {
  requireLogin();
  const path = '/api/v1/songs/' + encodeURIComponent(songId);
  return await getAuthRef().apiFetch(path);
}

async function updateSong(
  songId: string,
  patch: { status?: string; memo?: string; title?: string; categoryIds?: string[] }
): Promise<SongDto | null> {
  requireLogin();
  const body: Record<string, unknown> = {};
  if (patch && typeof patch === 'object') {
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.memo !== undefined) body.memo = patch.memo;
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.categoryIds !== undefined) body.categoryIds = patch.categoryIds;
  }
  const path = '/api/v1/songs/' + encodeURIComponent(songId);
  const r = await getAuthRef().apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return r ? r.song : null;
}

// 곡 분류 (docs/03-api-spec.md 3.7). 응답 모양이 다르면 오류(올바른 []만 빈 목록)
function categoryList(r: any): CategoryDto[] {
  if (!r || !Array.isArray(r.categories)) throw new Error(t('practice.songsLoadFailed'));
  return r.categories;
}

async function listCategories(signal?: AbortSignal): Promise<CategoryDto[]> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/categories', { signal });
  return categoryList(r);
}

async function createCategory(name: string): Promise<CategoryDto | null> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return r ? r.category : null;
}

async function updateCategory(
  categoryId: string,
  patch: { name?: string; onHome?: boolean }
): Promise<CategoryDto | null> {
  requireLogin();
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.onHome !== undefined) body.onHome = patch.onHome;
  const r = await getAuthRef().apiFetch('/api/v1/categories/' + encodeURIComponent(categoryId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return r ? r.category : null;
}

async function reorderCategories(ids: string[]): Promise<CategoryDto[]> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/categories/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
  return categoryList(r);
}

async function removeCategory(categoryId: string): Promise<{ ok: boolean }> {
  requireLogin();
  await getAuthRef().apiFetch('/api/v1/categories/' + encodeURIComponent(categoryId), {
    method: 'DELETE',
  });
  return { ok: true };
}

async function removeSong(songId: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path = '/api/v1/songs/' + encodeURIComponent(songId);
  await getAuthRef().apiFetch(path, {
    method: 'DELETE',
  });
  return { ok: true };
}

async function listPresets(songId: string): Promise<PresetListResponse> {
  requireLogin();
  const path = '/api/v1/songs/' + encodeURIComponent(songId) + '/presets';
  return await getAuthRef().apiFetch(path);
}

async function putPreset(
  songId: string,
  input: UpsertPresetInput
): Promise<PresetEnvelope> {
  requireLogin();
  const path = '/api/v1/songs/' + encodeURIComponent(songId) + '/presets';
  return await getAuthRef().apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

async function deletePreset(songId: string, presetId: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path =
    '/api/v1/songs/' +
    encodeURIComponent(songId) +
    '/presets/' +
    encodeURIComponent(presetId);
  return await getAuthRef().apiFetch(path, {
    method: 'DELETE',
  });
}

function saveProgress(
  body: SaveProgressInput,
  opts?: { keepalive?: boolean }
): Promise<SaveProgressResponse> {
  try {
    requireLogin();
  } catch (e) {
    return Promise.reject(e);
  }
  const input = body || ({} as SaveProgressInput);
  const options = opts || {};
  const payload = {
    songId: input.songId,
    pos: input.pos,
    a: input.a,
    b: input.b,
    rate: input.rate,
    date: input.date,
    addSeconds: input.addSeconds,
    addLoops: input.addLoops,
  };
  const jsonBody = JSON.stringify(payload);
  const A = getAuthRef();

  if (options.keepalive === true) {
    const sess = A.getSession();
    const token = sess ? sess.access_token : '';
    const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
    const apiBaseUrl = (win.ULEVELP_CONFIG && win.ULEVELP_CONFIG.apiBaseUrl) || '';
    const url = (apiBaseUrl ? String(apiBaseUrl).replace(/\/+$/, '') : '') + '/api/v1/practice/save';
    return fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: jsonBody,
    }).then(async (res) => {
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || t('api.reqFailedStatus', { status: res.status });
        const err: ApiClientError = new Error(msg);
        err.status = res.status;
        err.code = data && data.code ? data.code : '';
        err.data = data;
        throw err;
      }
      return data as SaveProgressResponse;
    });
  }

  return A.apiFetch('/api/v1/practice/save', {
    method: 'POST',
    body: jsonBody,
  });
}

async function uploadTake(meta: TakeUploadMeta, blob: Blob): Promise<TakeDto | null> {
  const A = getAuthRef();
  const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
  const me = A && typeof A.getMe === 'function' ? A.getMe() : null;
  if (me && me.storageProvider === 'drive' && win.ULDrive && typeof win.ULDrive.uploadTake === 'function') {
    requireLogin();
    return await win.ULDrive.uploadTake(meta, blob);
  }
  requireLogin();
  const m = meta || ({} as TakeUploadMeta);
  const metaPayload: Record<string, unknown> = {
    songId: m.songId,
    date: m.date,
    recordedAt: m.recordedAt,
    a: m.a,
    b: m.b,
    rate: m.rate,
    durationSec: m.durationSec,
    mime: m.mime,
  };
  if (m.replaceOldSongTakes === true) {
    metaPayload.replaceOldSongTakes = true;
  }
  const ext = EXT[m.mime] || 'webm';
  const filename = 'take.' + ext;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metaPayload)], { type: 'application/json' }));
  form.append('file', blob, filename);
  const r = await A.apiFetch('/api/v1/takes', {
    method: 'POST',
    body: form,
  });
  return r ? r.take : null;
}

function readLocal(prefix: string): LocalSongRecord[] {
  const out: LocalSongRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const vid = k.slice(prefix.length);
      if (!/^[\w-]{11}$/.test(vid)) continue;
      let parsed: any = null;
      try {
        const raw = localStorage.getItem(k);
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const pos = typeof parsed.pos === 'number' && isFinite(parsed.pos) ? parsed.pos : null;
      const a = typeof parsed.a === 'number' && isFinite(parsed.a) ? parsed.a : null;
      const b = typeof parsed.b === 'number' && isFinite(parsed.b) ? parsed.b : null;
      const rate = typeof parsed.rate === 'number' && isFinite(parsed.rate) ? parsed.rate : null;
      const date = typeof parsed.date === 'string' ? parsed.date : null;
      out.push({ videoId: vid, pos, a, b, rate, date });
    }
  } catch {
    return [];
  }
  return out;
}

export function listLocalSongs(): LocalSongRecord[] {
  const items = readLocal('ulp:v:');
  items.sort((x, y) => {
    if (x.date && y.date) return y.date.localeCompare(x.date);
    if (x.date) return -1;
    if (y.date) return 1;
    return 0;
  });
  return items;
}

async function listSessions(params?: { from?: string; to?: string; today?: string }): Promise<SessionListResponse> {
  requireLogin();
  const p = params || {};
  const qs = new URLSearchParams();
  if (p.from) qs.set('from', p.from);
  if (p.to) qs.set('to', p.to);
  if (p.today) qs.set('today', p.today);
  const queryString = qs.toString();
  const path = '/api/v1/sessions' + (queryString ? '?' + queryString : '');
  return await getAuthRef().apiFetch(path);
}

async function updateMemo(sessionId: string, memo: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path = '/api/v1/sessions/' + encodeURIComponent(sessionId);
  return await getAuthRef().apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify({ memo: String(memo ?? '') }),
  });
}

async function shareEpisode(
  sessionId: string,
  input: { title?: string; comment?: string }
): Promise<ShareEpisodeResponse> {
  requireLogin();
  const path = '/api/v1/sessions/' + encodeURIComponent(sessionId) + '/share';
  return await getAuthRef().apiFetch(path, {
    method: 'POST',
    body: JSON.stringify({
      title: String(input?.title ?? ''),
      comment: String(input?.comment ?? ''),
    }),
  });
}

async function withdrawShareEpisode(sessionId: string, signal?: AbortSignal): Promise<WithdrawEpisodeResponse> {
  requireLogin();
  const path = '/api/v1/sessions/' + encodeURIComponent(sessionId) + '/share';
  return await getAuthRef().apiFetch(path, {
    method: 'DELETE', signal,
  });
}

async function getTakeUrl(takeId: string): Promise<{ url: string; expiresIn: number }> {
  requireLogin();
  const path = '/api/v1/takes/' + encodeURIComponent(takeId) + '/url';
  return await getAuthRef().apiFetch(path);
}

async function removeTake(takeId: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path = '/api/v1/takes/' + encodeURIComponent(takeId);
  return await getAuthRef().apiFetch(path, {
    method: 'DELETE',
  });
}

async function toggleTakeComplete(
  takeId: string,
  completed: boolean
): Promise<{ ok: boolean; take: TakeDto }> {
  requireLogin();
  const path = '/api/v1/takes/' + encodeURIComponent(takeId) + '/complete';
  return await getAuthRef().apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify({ completed }),
  });
}

async function runLocalMigration(): Promise<LocalMigrationResult> {
  if (!isLoggedIn()) {
    return { status: 'skipped', created: 0, skipped: 0, message: '' };
  }
  const A = getAuthRef();
  const me = A && typeof A.getMe === 'function' ? A.getMe() : null;
  if (!me || me.migratedLocalAt != null || migrating) {
    return { status: 'skipped', created: 0, skipped: 0, message: '' };
  }

  const own = readLocal('ulp:v:');
  const sister = readLocal('pp:v:');
  const ownVids = new Set(own.map((it) => it.videoId));
  const filteredSister = sister.filter((it) => !ownVids.has(it.videoId));

  if (own.length === 0 && filteredSister.length === 0) {
    return { status: 'skipped', created: 0, skipped: 0, message: '' };
  }

  migrating = true;
  try {
    const items: typeof own = [];
    const confirmFn = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm : () => true;
    if (own.length > 0) {
      const ok = confirmFn(t('api.confirmMigrateOwn', { count: own.length }));
      if (ok) items.push(...own);
    }
    if (filteredSister.length > 0) {
      const ok = confirmFn(
        t('api.confirmMigrateSister', { count: filteredSister.length })
      );
      if (ok) items.push(...filteredSister);
    }

    items.sort((x, y) => {
      if (x.date && y.date) return y.date.localeCompare(x.date);
      if (x.date) return -1;
      if (y.date) return 1;
      return 0;
    });
    const topItems = items.slice(0, 100);

    const r = await A.apiFetch('/api/v1/songs/migrate-local', {
      method: 'POST',
      body: JSON.stringify({ items: topItems, markMigrated: true }),
    });

    if (A && typeof A.fetchMe === 'function') {
      await A.fetchMe();
    }
    return {
      status: 'done',
      created: r && typeof r.created === 'number' ? r.created : 0,
      skipped: r && typeof r.skipped === 'number' ? r.skipped : 0,
      message: '',
    };
  } catch (e: any) {
    return {
      status: 'failed',
      created: 0,
      skipped: 0,
      message: (e && e.message) || t('api.migrateFailed'),
    };
  } finally {
    migrating = false;
  }
}

async function exportZip(includeAudio?: boolean): Promise<{ blob: Blob; filename: string }> {
  requireLogin();
  const A = getAuthRef();
  const sess = A && typeof A.getSession === 'function' ? A.getSession() : null;
  const token = sess && sess.access_token ? sess.access_token : '';
  const qs = '?includeAudio=' + (includeAudio !== false);
  const res = await fetch('/api/v1/export/zip' + qs, {
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });
  if (!res.ok) {
    let errData: any = {};
    try {
      errData = await res.json();
    } catch {
      /* ignore */
    }
    const msg = (errData && (errData.message || errData.error)) || t('api.exportFailedStatus', { status: res.status });
    const err: ApiClientError = new Error(msg);
    err.status = res.status;
    err.code = (errData && errData.code) || 'EXPORT_ERROR';
    err.data = errData;
    throw err;
  }
  const cd = res.headers.get('content-disposition') || '';
  let filename = 'ULeveLP-export.zip';
  const match = cd.match(/filename="?([^"]+)"?/);
  if (match && match[1]) {
    filename = match[1];
  }
  const blob = await res.blob();
  return { blob, filename };
}

async function previewNotionZip(file: Blob & { name?: string }) {
  requireLogin();
  const form = new FormData();
  form.append('file', file, (file && file.name) || 'backup.zip');
  return await getAuthRef().apiFetch('/api/v1/import/notion/preview', {
    method: 'POST',
    body: form,
  });
}

async function confirmNotionZip(previewToken: string) {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/import/notion/confirm', {
    method: 'POST',
    body: JSON.stringify({ previewToken: String(previewToken || '') }),
  });
}

function getCachedKeys(): { notion: KeySummaryDto | null } {
  try {
    const raw = localStorage.getItem('ulp:keys');
    if (!raw) return { notion: null };
    const parsed = JSON.parse(raw);
    const A = getAuthRef();
    const user = A && typeof A.getUser === 'function' ? A.getUser() : null;
    if (user && user.id && parsed && parsed.uid === user.id) {
      return {
        notion: parsed.notion || null,
      };
    }
  } catch {
    /* ignore */
  }
  return { notion: null };
}

async function listIntegrations(): Promise<IntegrationDto[]> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/integrations?appId=ulevelp');
  return r && Array.isArray(r.integrations) ? r.integrations : [];
}

async function saveNotionIntegration(input: SaveNotionInput): Promise<IntegrationDto> {
  requireLogin();
  const A = getAuthRef();
  const body = JSON.stringify({
    appId: 'ulevelp',
    token: input?.token,
    songsDb: input?.songsDb,
    sessionsDb: input?.sessionsDb,
    notesDb: input?.notesDb,
  });
  const r = await A.apiFetch('/api/v1/integrations/notion', {
    method: 'PUT',
    body,
  });
  if (A && typeof A.fetchMe === 'function') {
    await A.fetchMe();
  }
  return r;
}

async function checkIntegration(provider: 'notion' | string) {
  requireLogin();
  const path = '/api/v1/integrations/' + encodeURIComponent(provider) + '/check?appId=ulevelp';
  return await getAuthRef().apiFetch(path, {
    method: 'POST',
  });
}

async function removeIntegration(provider: 'notion' | string): Promise<{ ok: boolean }> {
  requireLogin();
  const A = getAuthRef();
  const path = '/api/v1/integrations/' + encodeURIComponent(provider) + '?appId=ulevelp';
  const r = await A.apiFetch(path, {
    method: 'DELETE',
  });
  if (A && typeof A.fetchMe === 'function') {
    await A.fetchMe();
  }
  return r && r.ok ? r : { ok: true };
}

async function syncStatus(): Promise<NotionSyncStatusDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/notion/sync/status');
}

async function syncEnable() {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/notion/sync/enable', {
    method: 'POST',
  });
}

async function syncDisable() {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/notion/sync/disable', {
    method: 'POST',
  });
}

async function syncPull() {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/notion/sync/pull', {
    method: 'POST',
  });
}

async function syncPush() {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/notion/sync/push', {
    method: 'POST',
  });
}

/** M1-3b: 티어 부족(403)·크레딧 부족(402)이면 /me(limits·credits)를 다시 받아 화면의 분석 버튼 판단을 맞춘다 */
async function refreshMeAfterAnalyzeError(err: any): Promise<void> {
  if (!err || !(err.status === 402 || err.code === 'TIER_UPGRADE_REQUIRED')) return;
  const A = getAuthRef();
  try {
    if (A && typeof A.fetchMe === 'function') await A.fetchMe();
  } catch {
    /* 원래 오류를 그대로 보여 준다 */
  }
}

/** M2-1c: startSec·endSec는 숫자일 때만 보낸다(구간 없는 요청 본문은 전과 같음 — 결과/M2-1s_노트구간서버.md §2) */
async function noteAnalyze(input: {
  url: string;
  tags: string[];
  memo?: string;
  startSec?: number | null;
  endSec?: number | null;
}): Promise<{ jobId: string; status: string; reservedCredits?: number }> {
  requireLogin();
  try {
    const body: Record<string, unknown> = { url: input?.url, tags: input?.tags, memo: input?.memo };
    if (typeof input?.startSec === 'number') body.startSec = input.startSec;
    if (typeof input?.endSec === 'number') body.endSec = input.endSec;
    const r = await getAuthRef().apiFetch('/api/v1/notes/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { jobId: r.jobId, status: r.status, reservedCredits: r.reservedCredits };
  } catch (err: any) {
    await refreshMeAfterAnalyzeError(err);
    throw err;
  }
}

async function creditsSummary(): Promise<CreditsSummaryDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/credits');
}

/** M2-1b: 분석 전 예상 크레딧. 노트(kind 'note')도 구간을 반영한다(M2-1s), 속도는 코드 진행만 */
async function estimateCredits(input: {
  kind: 'note' | 'progression';
  url: string;
  startSec?: number | null;
  endSec?: number | null;
  pace?: 'slow' | 'normal' | 'fast';
}): Promise<CreditEstimateDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/credits/estimate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function listNoteJobs(): Promise<AnalysisJobDto[]> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/notes/jobs');
  return r && Array.isArray(r.jobs) ? r.jobs : [];
}

async function getNoteJob(jobId: string): Promise<AnalysisJobDto> {
  requireLogin();
  const path = '/api/v1/notes/jobs/' + encodeURIComponent(jobId);
  return await getAuthRef().apiFetch(path);
}

async function listNotes(tag?: string): Promise<NoteSummaryDto[]> {
  requireLogin();
  let path = '/api/v1/notes';
  if (tag) path += '?tag=' + encodeURIComponent(tag);
  const r = await getAuthRef().apiFetch(path);
  return r && Array.isArray(r.notes) ? r.notes : [];
}

async function getNote(noteId: string): Promise<NoteDetailDto | null> {
  requireLogin();
  const path = '/api/v1/notes/' + encodeURIComponent(noteId);
  const r = await getAuthRef().apiFetch(path);
  return r && r.note ? r.note : null;
}

async function updateNote(
  noteId: string,
  patch: { memo?: string; tags?: string[]; title?: string }
): Promise<NoteDetailDto | null> {
  requireLogin();
  const body: Record<string, unknown> = {};
  if (patch) {
    if (patch.memo !== undefined) body.memo = patch.memo;
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.title !== undefined) body.title = patch.title;
  }
  const path = '/api/v1/notes/' + encodeURIComponent(noteId);
  const r = await getAuthRef().apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return r && r.note ? r.note : null;
}

async function removeNote(noteId: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path = '/api/v1/notes/' + encodeURIComponent(noteId);
  await getAuthRef().apiFetch(path, {
    method: 'DELETE',
  });
  return { ok: true };
}

async function setNoteCollect(noteId: string, collect: boolean): Promise<NoteCollectResult> {
  requireLogin();
  const path = '/api/v1/notes/' + encodeURIComponent(noteId) + '/collect';
  const r = await getAuthRef().apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify({ collect }),
  });
  return {
    noteId: r && r.noteId ? r.noteId : noteId,
    collect: Boolean(r && r.collect),
    progressions: r && Array.isArray(r.progressions) ? r.progressions : [],
  };
}

async function listProgressions(scope?: ProgressionScope): Promise<ProgressionDto[]> {
  requireLogin();
  let path = '/api/v1/progressions';
  if (scope) path += '?scope=' + encodeURIComponent(scope);
  const r = await getAuthRef().apiFetch(path);
  return r && Array.isArray(r.progressions) ? r.progressions : [];
}

async function createProgression(input: ProgressionInput): Promise<ProgressionDto | null> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/progressions', {
    method: 'POST',
    body: JSON.stringify(input || {}),
  });
  return r && r.progression ? r.progression : null;
}

async function updateProgression(progressionId: string, patch: ProgressionInput): Promise<ProgressionDto | null> {
  requireLogin();
  const path = '/api/v1/progressions/' + encodeURIComponent(progressionId);
  const r = await getAuthRef().apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(patch || {}),
  });
  return r && r.progression ? r.progression : null;
}

async function removeProgression(progressionId: string): Promise<{ ok: boolean }> {
  requireLogin();
  const path = '/api/v1/progressions/' + encodeURIComponent(progressionId);
  await getAuthRef().apiFetch(path, {
    method: 'DELETE',
  });
  return { ok: true };
}

async function analyzeProgression(input: {
  url: string;
  memo?: string;
  startSec?: number | null;
  endSec?: number | null;
  pace?: 'slow' | 'normal' | 'fast';
  /** GA-4: 24시간 안 같은 분석(409 DUPLICATE_ANALYSIS)을 일부러 다시 할 때 */
  force?: boolean;
}): Promise<{ jobId: string; status: string; reservedCredits?: number }> {
  requireLogin();
  try {
    const body: Record<string, unknown> = { url: input?.url, memo: input?.memo };
    if (typeof input?.startSec === 'number') body.startSec = input.startSec;
    if (typeof input?.endSec === 'number') body.endSec = input.endSec;
    if (input?.pace) body.pace = input.pace;
    if (input?.force === true) body.force = true;
    const r = await getAuthRef().apiFetch('/api/v1/progressions/analyze', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { jobId: r.jobId, status: r.status, reservedCredits: r.reservedCredits };
  } catch (err: any) {
    await refreshMeAfterAnalyzeError(err);
    throw err;
  }
}

async function updateMe(patch: ProfilePatchInput): Promise<MeProfile> {
  requireLogin();
  const A = getAuthRef();
  if (A && typeof A.updateProfile === 'function') {
    return await A.updateProfile(patch);
  }
  const updated = await A.apiFetch('/api/v1/me', {
    method: 'PATCH',
    body: JSON.stringify(patch || {}),
  });
  if (A && typeof A.fetchMe === 'function') {
    await A.fetchMe();
  }
  return updated;
}

async function registerDriveTake(meta: DriveTakeRegisterMeta): Promise<TakeDto> {
  requireLogin();
  const payload = {
    songId: meta?.songId,
    date: meta?.date,
    recordedAt: meta?.recordedAt,
    a: meta?.a,
    b: meta?.b,
    rate: meta?.rate,
    durationSec: meta?.durationSec,
    mime: meta?.mime,
    sizeBytes: meta?.sizeBytes,
    storage: 'drive',
    storageKey: meta?.storageKey || meta?.driveFileId,
  };
  const r = await getAuthRef().apiFetch('/api/v1/takes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r && r.take ? r.take : r;
}

async function downloadTakeBlob(takeId: string): Promise<Blob> {
  requireLogin();
  const A = getAuthRef();
  const token =
    A && typeof A.getAccessToken === 'function'
      ? await A.getAccessToken()
      : (A && typeof A.getSession === 'function' && A.getSession()?.access_token) || '';
  const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
  const apiBase =
    win.ULEVELP_CONFIG && win.ULEVELP_CONFIG.apiBaseUrl
      ? String(win.ULEVELP_CONFIG.apiBaseUrl).replace(/\/$/, '')
      : '';
  const res = await fetch(apiBase + '/api/v1/takes/' + encodeURIComponent(takeId) + '/download', {
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });
  if (!res.ok) {
    let errData: any = {};
    try {
      errData = await res.json();
    } catch {
      /* ignore */
    }
    const msg = (errData && (errData.message || errData.error)) || t('api.downloadFailedStatus', { status: res.status });
    const err: ApiClientError = new Error(msg);
    err.status = res.status;
    err.code = (errData && errData.code) || 'DOWNLOAD_ERROR';
    throw err;
  }
  return await res.blob();
}

async function migrateTakeToDrive(takeId: string, driveFileId: string): Promise<TakeDto> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/takes/' + encodeURIComponent(takeId) + '/migrate-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driveFileId }),
  });
  return r && r.take ? r.take : r;
}

// owner 관리 API (계획/상용_서비스_계획.md §3-1: role은 DB에서만, 모든 쓰기에 reason 1~200자 → admin_audit)
async function adminFindUsers(email: string): Promise<AdminUserDto[]> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/admin/users?email=' + encodeURIComponent(email.trim()));
  return r && Array.isArray(r.users) ? r.users : [];
}

async function adminSetCreator(userId: string, input: AdminCreatorInput): Promise<AdminUserDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/admin/users/' + encodeURIComponent(userId) + '/creator', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

async function adminListFolders(kind?: AdminFolderKind): Promise<AdminFolderDetail[]> {
  requireLogin();
  const q = kind ? '?kind=' + encodeURIComponent(kind) : '';
  const r = await getAuthRef().apiFetch('/api/v1/admin/shared-folders' + q);
  return r && Array.isArray(r.folders) ? r.folders : [];
}

async function adminCreateFolder(input: AdminFolderCreateInput): Promise<AdminFolderDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/admin/shared-folders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function adminUpdateFolder(folderId: string, patch: AdminFolderPatch): Promise<AdminFolderDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/admin/shared-folders/' + encodeURIComponent(folderId), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function adminReplaceItems(folderId: string, items: AdminFolderItemInput[], reason: string): Promise<AdminFolderDetail> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/admin/shared-folders/' + encodeURIComponent(folderId) + '/items', {
    method: 'PUT',
    body: JSON.stringify({ items, reason }),
  });
}

async function adminDeleteFolder(folderId: string, reason: string): Promise<{ id: string; deleted: boolean }> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/admin/shared-folders/' + encodeURIComponent(folderId), {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

// M2-23: 큐레이션 · 커뮤니티 · 내 분류 공유 · 재생목록 가져오기 (§3-1)
async function curationHome(): Promise<CurationHomeDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/curation/home');
}

async function communityFolders(
  sort: 'recent' | 'clones' | 'likes' = 'recent',
  cursor?: string | number | null
): Promise<{ folders: PublicFolderDto[]; next: string | null }> {
  requireLogin();
  const q =
    '?sort=' +
    encodeURIComponent(sort) +
    (cursor !== undefined && cursor !== null && cursor !== '' ? '&cursor=' + encodeURIComponent(String(cursor)) : '');
  const r = await getAuthRef().apiFetch('/api/v1/community/folders' + q);
  return {
    folders: r && Array.isArray(r.folders) ? r.folders : [],
    next: r && typeof r.next === 'string' ? r.next : null,
  };
}

async function communityFolder(id: string): Promise<{ folder: PublicFolderDto; items: PublicFolderItemDto[] }> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/community/folders/' + encodeURIComponent(id));
  return {
    folder: r?.folder,
    items: r && Array.isArray(r.items) ? r.items : [],
  };
}

async function communitySetLike(id: string, on: boolean): Promise<{ liked: boolean; likeCount: number }> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/community/folders/' + encodeURIComponent(id) + '/like', {
    method: on ? 'PUT' : 'DELETE',
  });
}

async function communityClone(
  id: string
): Promise<{ categoryId: string; imported: number; alreadyInLibrary: number; skippedLimit: number }> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/community/folders/' + encodeURIComponent(id) + '/clone', {
    method: 'POST',
  });
}

async function communityReport(
  id: string,
  reason: 'spam' | 'inappropriate' | 'copyright' | 'other',
  detail?: string
): Promise<{ reportId: number }> {
  requireLogin();
  const body: { reason: string; detail?: string } = { reason };
  if (detail !== undefined && detail !== '') body.detail = detail;
  return await getAuthRef().apiFetch('/api/v1/community/folders/' + encodeURIComponent(id) + '/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function communityUser(userId: string, options?: { signal?: AbortSignal }): Promise<CommunityUserDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/community/users/' + encodeURIComponent(userId), { signal: options?.signal });
}

async function communitySetFollow(userId: string, on: boolean): Promise<{ following: boolean; followerCount: number }> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/community/follows/' + encodeURIComponent(userId), {
    method: on ? 'PUT' : 'DELETE',
  });
}

async function communityLogs(
  scope: 'all' | 'following' = 'all',
  cursor?: string | number | null
): Promise<{ logs: PracticeLogDto[]; next: string | null }> {
  requireLogin();
  const q =
    '?scope=' +
    encodeURIComponent(scope) +
    (cursor !== undefined && cursor !== null && cursor !== '' ? '&cursor=' + encodeURIComponent(String(cursor)) : '');
  const r = await getAuthRef().apiFetch('/api/v1/community/logs' + q);
  return {
    logs: r && Array.isArray(r.logs) ? r.logs : [],
    next: r && typeof r.next === 'string' ? r.next : null,
  };
}

async function communitySetPublicName(
  name: string, options?: { signal?: AbortSignal }
): Promise<{ publicName: string | null; changedAt: string | null; nextChangeAt: string | null }> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/community/me/public-name', {
    method: 'PUT',
    body: JSON.stringify({ publicName: name }),
    signal: options?.signal,
  });
}

async function communityEpisodeLogs(
  scope: 'all' | 'following' = 'all',
  cursor?: string | null
): Promise<EpisodeLogListResponse> {
  requireLogin();
  const q =
    '?scope=' +
    encodeURIComponent(scope) +
    (cursor !== undefined && cursor !== null && cursor !== '' ? '&cursor=' + encodeURIComponent(String(cursor)) : '');
  const r = await getAuthRef().apiFetch('/api/v1/community/episode-logs' + q);
  if (!r || !Array.isArray(r.posts) || !(r.next === null || (typeof r.next === 'string' && r.next.length > 0))) {
    throw new Error(t('episode.err.generic'));
  }
  return { posts: r.posts, next: r.next };
}

async function communityMyEpisodeLogs(cursor?: string | null, signal?: AbortSignal): Promise<MyEpisodeLogListResponse> {
  requireLogin();
  const q =
    cursor !== undefined && cursor !== null && cursor !== '' ? '?cursor=' + encodeURIComponent(String(cursor)) : '';
  const r = await getAuthRef().apiFetch('/api/v1/community/me/episode-logs' + q, { signal });
  if (!r || !Array.isArray(r.posts) || !(r.next === null || (typeof r.next === 'string' && r.next.length > 0))) {
    throw new Error(t('episode.err.generic'));
  }
  return { posts: r.posts, next: r.next };
}

async function communityReportEpisode(
  postId: string,
  input: { reason: string; detail?: string }
): Promise<ReportEpisodeResponse> {
  requireLogin();
  const body: { reason: string; detail?: string } = {
    reason: input.reason,
    detail: input.detail !== undefined ? String(input.detail) : '',
  };
  return await getAuthRef().apiFetch('/api/v1/community/episode-logs/' + encodeURIComponent(postId) + '/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function getCategoryShare(id: string, signal?: AbortSignal): Promise<{ share: ShareSummaryDto | null }> {
  requireLogin();
  const r = await getAuthRef().apiFetch('/api/v1/categories/' + encodeURIComponent(id) + '/share', { signal });
  return { share: r && r.share ? r.share : null };
}

async function setCategoryShare(
  id: string,
  input: { isPublic: boolean; autoSync?: boolean; title?: string },
  signal?: AbortSignal
): Promise<{ share: ShareSummaryDto | null }> {
  requireLogin();
  const body: Record<string, unknown> = { isPublic: Boolean(input.isPublic) };
  if (input.autoSync !== undefined) body.autoSync = Boolean(input.autoSync);
  if (input.title !== undefined && input.title !== '') body.title = input.title;
  const r = await getAuthRef().apiFetch('/api/v1/categories/' + encodeURIComponent(id) + '/share', {
    method: 'PUT',
    body: JSON.stringify(body), signal,
  });
  return { share: r && r.share ? r.share : null };
}

async function republishCategoryShare(id: string, title?: string, signal?: AbortSignal): Promise<{ share: ShareSummaryDto | null }> {
  requireLogin();
  const body: Record<string, unknown> = {};
  if (title !== undefined && title !== '') body.title = title;
  const r = await getAuthRef().apiFetch('/api/v1/categories/' + encodeURIComponent(id) + '/share/republish', {
    method: 'POST',
    body: JSON.stringify(body), signal,
  });
  return { share: r && r.share ? r.share : null };
}

async function importPlaylistPreview(url: string): Promise<PlaylistPreviewDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/songs/import-playlist/preview?url=' + encodeURIComponent(url.trim()));
}

async function importPlaylist(
  body: { url: string; categoryId: string } | { url: string; newCategory: true; categoryName?: string }
): Promise<PlaylistImportResultDto> {
  requireLogin();
  return await getAuthRef().apiFetch('/api/v1/songs/import-playlist', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const apiClient = {
  isLoggedIn,
  getCachedKeys,
  me: {
    update: updateMe,
  },
  songs: {
    list: listSongs,
    byVideo,
    create: createSong,
    get: getSong,
    update: updateSong,
    remove: removeSong,
    importPreview: importPlaylistPreview,
    importPlaylist,
    listPresets,
    putPreset,
    deletePreset,
  },
  categories: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    reorder: reorderCategories,
    remove: removeCategory,
    getShare: getCategoryShare,
    setShare: setCategoryShare,
    republish: republishCategoryShare,
  },
  curation: {
    home: curationHome,
  },
  community: {
    folders: communityFolders,
    folder: communityFolder,
    setLike: communitySetLike,
    clone: communityClone,
    report: communityReport,
    user: communityUser,
    setFollow: communitySetFollow,
    logs: communityLogs,
    setPublicName: communitySetPublicName,
    episodeLogs: communityEpisodeLogs,
    myEpisodeLogs: communityMyEpisodeLogs,
    reportEpisode: communityReportEpisode,
  },
  sessions: {
    list: listSessions,
    updateMemo,
    share: shareEpisode,
    withdrawShare: withdrawShareEpisode,
  },
  saveProgress,
  takes: {
    upload: uploadTake,
    getUrl: getTakeUrl,
    remove: removeTake,
    complete: toggleTakeComplete,
    toggleComplete: toggleTakeComplete,
    registerDrive: registerDriveTake,
    downloadBlob: downloadTakeBlob,
    migrateToDrive: migrateTakeToDrive,
  },
  nx: {
    exportZip,
    previewNotionZip,
    confirmNotionZip,
  },
  integrations: {
    list: listIntegrations,
    saveNotion: saveNotionIntegration,
    check: checkIntegration,
    remove: removeIntegration,
  },
  notionSync: {
    status: syncStatus,
    enable: syncEnable,
    disable: syncDisable,
    pull: syncPull,
    push: syncPush,
  },
  credits: {
    summary: creditsSummary,
    estimate: estimateCredits,
  },
  notes: {
    analyze: noteAnalyze,
    listJobs: listNoteJobs,
    getJob: getNoteJob,
    list: listNotes,
    get: getNote,
    update: updateNote,
    remove: removeNote,
    setCollect: setNoteCollect,
  },
  progressions: {
    list: listProgressions,
    create: createProgression,
    update: updateProgression,
    remove: removeProgression,
    analyze: analyzeProgression,
  },
  admin: {
    findUsers: adminFindUsers,
    setCreator: adminSetCreator,
    listFolders: adminListFolders,
    createFolder: adminCreateFolder,
    updateFolder: adminUpdateFolder,
    replaceItems: adminReplaceItems,
    deleteFolder: adminDeleteFolder,
  },
  runLocalMigration,
  listLocalSongs,
  local: { listSongs: listLocalSongs },
};

if (typeof window !== 'undefined' && !window.ULData) {
  window.ULData = apiClient;
}

