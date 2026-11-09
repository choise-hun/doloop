// frontend/src/lib/episode.mts
// CM-UI 세션 공유·피드 순수 어댑터, 유효성 검증, 에러 분류 및 URL 생성
import type { PublicEpisodeLogDto, PublicPartStatDto, SessionWithSongDto, SongSessionDto, TakeDto } from './apiClient';
import { t } from './i18n.mts';

export interface PracticeSessionCardModel {
  sessionId: string;
  videoId: string;
  songTitle?: string | null;
  songArtist?: string | null;
  date: string;
  seconds: number;
  loops: number;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
  coveragePct: number;
  partStats: PublicPartStatDto[] | null;
  memo?: string | null;
  takes?: TakeDto[];
}

export type EpisodeErrorType =
  | 'unauthorized'
  | 'tier_upgrade'
  | 'public_name_required'
  | 'banned'
  | 'not_shareable'
  | 'moderation_hidden'
  | 'not_found'
  | 'self_report'
  | 'already_reported'
  | 'generic';

export interface ClassifiedEpisodeError {
  type: EpisodeErrorType;
  field?: string;
  message: string;
}

/** 이모지 등 Unicode code point 개수 계산 (UTF-16 code unit이 아님) */
export function countCodePoints(str: string): number {
  if (!str) return 0;
  return Array.from(str).length;
}

/**
 * 게시물 제목·코멘트 유효성 검증
 * - 제어 문자(NUL, 벨 등) 거절. multiline=true 시 \n, \t 허용
 * - 고아 surrogate pair 거절
 * - CRLF -> LF 정규화 및 trim
 * - code point 기준 글자 수 초과 거절
 */
export function validateEpisodeText(raw: string, maxCodePoints: number, multiline = false): string {
  if (typeof raw !== 'string') {
    throw new Error('문자열 입력이 필요합니다.'); // i18n-keep: 내부 유효성 검증 예외
  }

  // multiline일 때 CRLF/CR -> LF 사전 정규화
  const preNormalized = multiline ? raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : raw;

  // 1. 제어 문자 검사 (trim 전 검사하여 가장자리의 NUL/제어 문자도 거절)
  for (let i = 0; i < preNormalized.length; i++) {
    const code = preNormalized.charCodeAt(i);
    const isAllowedCtrl = multiline && (code === 10 || code === 9); // \n (10), \t (9)
    if ((code < 32 && !isAllowedCtrl) || code === 127) {
      throw new Error('허용되지 않은 제어 문자입니다.'); // i18n-keep: 제어 문자 예외 검증
    }
  }

  // 2. 고아 surrogate pair 검사
  for (let i = 0; i < preNormalized.length; i++) {
    const code = preNormalized.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate -> 다음 문자가 Low surrogate여야 함
      i++;
      if (i >= preNormalized.length) throw new Error('잘못된 Unicode입니다.'); // i18n-keep: 서러게이트 유니코드 예외
      const nextCode = preNormalized.charCodeAt(i);
      if (nextCode < 0xdc00 || nextCode > 0xdfff) {
        throw new Error('잘못된 Unicode입니다.'); // i18n-keep: 서러게이트 유니코드 예외
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // 짝 없는 Low surrogate
      throw new Error('잘못된 Unicode입니다.'); // i18n-keep: 서러게이트 유니코드 예외
    }
  }

  // 3. 정규화 및 trim
  const trimmed = preNormalized.trim();

  // 4. code point 길이 검사
  const cpCount = countCodePoints(trimmed);
  if (cpCount > maxCodePoints) {
    throw new Error(`길이가 너무 깁니다 (최대 ${maxCodePoints}자)`); // i18n-keep: 글자 수 초과 예외
  }

  return trimmed;
}

/** 공개 제목 결정 규칙: post.title -> youtubeTitle + ' 연습 기록' -> '연습 기록' */
export function computeEpisodeTitle(post: { title?: string | null; youtubeTitle?: string | null }): string {
  const custom = post.title?.trim();
  if (custom) return custom;
  const yt = post.youtubeTitle?.trim();
  if (yt) return t('episode.titleWithVideo', { title: yt });
  return t('episode.defaultTitle');
}

/** 구간 재생 URL 생성 */
export function buildEpisodePracticeUrl(
  videoId: string,
  a?: number | null,
  b?: number | null,
  rate?: number | null
): string {
  const vid = encodeURIComponent(String(videoId || '').trim());
  let href = `practice.html?v=${vid}`;
  if (typeof a === 'number' && Number.isFinite(a) && a >= 0) {
    href += `&a=${a}`;
  }
  if (typeof b === 'number' && Number.isFinite(b) && b > 0) {
    href += `&b=${b}`;
  }
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate !== 1) {
    href += `&r=${rate}`;
  }
  return href;
}

/** 파트 통계 배열 파싱 및 안전 정규화 */
export function normalizePartStats(raw: unknown): PublicPartStatDto[] | null {
  if (raw == null) return [];
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;

  return list.map((it: any) => ({
    name: String(it?.name || ''),
    a: typeof it?.a === 'number' && Number.isFinite(it.a) ? it.a : 0,
    b: typeof it?.b === 'number' && Number.isFinite(it.b) ? it.b : 0,
    rate: typeof it?.rate === 'number' && Number.isFinite(it.rate) ? it.rate : 1,
    completed: Boolean(it?.completed),
    seconds: typeof it?.seconds === 'number' && Number.isFinite(it.seconds) ? Math.floor(it.seconds) : 0,
    loops: typeof it?.loops === 'number' && Number.isFinite(it.loops) ? Math.floor(it.loops) : 0,
  }));
}

/** CM-BE 에러 응답 분류 */
export function classifyEpisodeError(err: any): ClassifiedEpisodeError {
  const status = Number(err?.status) || 0;
  const code = String(err?.code || '');
  const message = String(err?.message || t('episode.err.generic'));

  if (code === 'INVALID_CURSOR') {
    return { type: 'generic', message: t('episode.err.cursor') };
  }
  if (status === 401 || code === 'UNAUTHORIZED') {
    return { type: 'unauthorized', message };
  }
  if (status === 403 && code === 'TIER_UPGRADE_REQUIRED') {
    return { type: 'tier_upgrade', message };
  }
  if (status === 409 && code === 'PUBLIC_NAME_REQUIRED') {
    return { type: 'public_name_required', message };
  }
  if (status === 409 && code === 'POST_MODERATION_HIDDEN') {
    return { type: 'moderation_hidden', message };
  }
  if (status === 409 && code === 'SESSION_NOT_SHAREABLE') {
    return { type: 'not_shareable', message };
  }
  if (status === 409 && code === 'ALREADY_REPORTED') {
    return { type: 'already_reported', message };
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return { type: 'not_found', message };
  }
  if (status === 400 && code === 'SELF_REPORT_NOT_ALLOWED') {
    return { type: 'self_report', message };
  }
  if (status === 400 && code === 'BANNED_WORD') {
    const field = (err?.data?.detail?.field ?? err?.detail?.field) ? String(err?.data?.detail?.field ?? err.detail.field) : undefined;
    return { type: 'banned', field, message };
  }

  return { type: 'generic', message };
}

/** SessionWithSongDto(날짜별 세션) -> PracticeSessionCardModel 어댑터 */
export function fromSessionWithSong(s: SessionWithSongDto): PracticeSessionCardModel {
  return {
    sessionId: s.id,
    videoId: s.videoId || '',
    songTitle: s.songTitle,
    songArtist: s.songArtist,
    date: s.date,
    seconds: typeof s.seconds === 'number' ? s.seconds : Math.floor((s.minutes || 0) * 60),
    loops: typeof s.loops === 'number' ? s.loops : 0,
    a: s.a ?? null,
    b: s.b ?? null,
    rate: s.rate ?? null,
    coveragePct: typeof s.coveragePct === 'number' ? s.coveragePct : 0,
    partStats: normalizePartStats(s.partStats),
    memo: s.memo ?? null,
    takes: Array.isArray(s.takes) ? s.takes : [],
  };
}

/** SongSessionDto(곡 상세/플레이어 세션) -> PracticeSessionCardModel 어댑터 */
export function fromSongSession(
  s: SongSessionDto,
  song?: { videoId?: string; title?: string; artist?: string } | null,
  takes?: TakeDto[]
): PracticeSessionCardModel {
  const filteredTakes = Array.isArray(takes) ? takes.filter((t) => t.sessionId === s.id) : [];
  return {
    sessionId: s.id,
    videoId: song?.videoId || '',
    songTitle: song?.title,
    songArtist: song?.artist,
    date: s.date,
    seconds: typeof s.seconds === 'number' ? s.seconds : Math.floor((s.minutes || 0) * 60),
    loops: typeof s.loops === 'number' ? s.loops : 0,
    a: s.a ?? null,
    b: s.b ?? null,
    rate: s.rate ?? null,
    coveragePct: typeof s.coveragePct === 'number' ? s.coveragePct : 0,
    partStats: normalizePartStats(s.partStats),
    memo: s.memo ?? null,
    takes: filteredTakes,
  };
}
