// frontend/src/lib/community.mts
import { t } from './i18n.mts';
// M2-23 커뮤니티·큐레이션·재생목록 가져오기 순수 함수 (DOM·React·apiClient 의존 없음 — 명세 §2·§3-2)

export type Lang = 'ko' | 'en' | 'ja';

const YOUTUBE_HOST_RE = /^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)$/i;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]+$/;

/** URL 파싱, 호스트 youtube.com·youtu.be(하위 도메인 포함), list 값 있음 → trim한 원문, 아니면 null */
export function playlistUrlFrom(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!YOUTUBE_HOST_RE.test(parsed.hostname)) return null;
  const list = parsed.searchParams.get('list')?.trim() || '';
  if (!list || !PLAYLIST_ID_RE.test(list)) return null;
  return trimmed;
}

/** m[lang] ?? m.ko ?? fallback */
export function i18nPick(
  m: Record<string, string> | null | undefined,
  lang: Lang,
  fallback: string
): string {
  if (m && typeof m === 'object') {
    const byLang = m[lang];
    if (typeof byLang === 'string' && byLang.length > 0) return byLang;
    const byKo = m.ko;
    if (typeof byKo === 'string' && byKo.length > 0) return byKo;
  }
  return typeof fallback === 'string' ? fallback : '';
}

/** "A, B, C" + (itemCount > 개수 ? " 등" : ""), 빈 값 "" */
export function folderSubtitle(artists: unknown, itemCount: unknown): string {
  if (!Array.isArray(artists)) return '';
  const list = artists
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());
  if (list.length === 0) return '';
  const count = typeof itemCount === 'number' && Number.isFinite(itemCount) ? itemCount : 0;
  return list.join(', ') + (count > list.length ? t('community.etcSuffix') : '');
}

/** 문자열만, 최대 4. 4 미만이면 앞 1개만. 표지는 첫 1개만 쓴다(CMR-3 RV-5) */
export function coverIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const list = ids
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
  if (list.length >= 4) return list.slice(0, 4);
  if (list.length >= 1) return [list[0]];
  return [];
}

/** practice.html?v=[&a=][&b=][&r= (1 아닐 때)] */
export function itemPracticeHref(it: {
  videoId: string;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
}): string {
  const vid = String(it?.videoId || (it as any)?.v || '').trim();
  if (!vid) return 'practice.html';
  let href = 'practice.html?v=' + encodeURIComponent(vid);
  if (typeof it.a === 'number' && Number.isFinite(it.a) && it.a >= 0) {
    href += '&a=' + String(it.a);
  }
  if (typeof it.b === 'number' && Number.isFinite(it.b) && it.b > 0) {
    href += '&b=' + String(it.b);
  }
  if (typeof it.rate === 'number' && Number.isFinite(it.rate) && it.rate > 0 && it.rate !== 1) {
    href += '&r=' + String(it.rate);
  }
  return href;
}

export function fmtSec(n: number): string {
  const sec = Math.max(0, Math.floor(n));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "0:38–0:55 · 0.75x", 없는 부분 생략, 다 없으면 "" */
export function segText(
  a?: number | null,
  b?: number | null,
  rate?: number | null
): string {
  const hasA = typeof a === 'number' && Number.isFinite(a) && a >= 0;
  const hasB = typeof b === 'number' && Number.isFinite(b) && b > 0;
  let range = '';
  if (hasA && hasB) {
    range = `${fmtSec(a)}–${fmtSec(b)}`;
  } else if (hasA) {
    range = `${fmtSec(a)}–`;
  } else if (hasB) {
    range = `0:00–${fmtSec(b)}`;
  }
  const hasRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate !== 1;
  const ratePart = hasRate ? `${rate}x` : '';
  return [range, ratePart].filter(Boolean).join(' · ');
}

/** 3720 → "1시간 2분", 59 → "0분" (t() 안 씀 — 숫자 포맷은 L1-2b) */
export function durationText(sec: unknown): string {
  const n = typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const totalMin = Math.floor(n / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return t('community.minutesUnit', { m });
  return m > 0 ? t('community.hoursMinutesUnit', { h, m }) : t('community.hoursUnit', { h });
}

/** "2026-11-14", 못 읽으면 "" (KST 기준) */
export function kstDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso.trim()) return '';
  const ms = Date.parse(iso.trim());
  if (!Number.isFinite(ms)) return '';
  const kst = new Date(ms + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** D12 렌더 타임 정규화: 배열 아님 → [], monthlyPick 모양 틀림 → null */
export function normalizeCurationHome(raw: unknown): {
  curated: any[];
  monthlyPick: { folder: any; items: any[] } | null;
  showcase: any[];
  following: any[];
} {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const toArr = (v: unknown): any[] =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
  const mp = r.monthlyPick;
  const monthlyPick =
    mp &&
    typeof mp === 'object' &&
    mp.folder &&
    typeof mp.folder === 'object' &&
    typeof mp.folder.id === 'string' &&
    mp.folder.id.length > 0 &&
    Array.isArray(mp.items)
      ? {
          folder: mp.folder,
          items: mp.items.filter((x: any) => x && typeof x === 'object'),
        }
      : null;
  return {
    curated: toArr(r.curated),
    monthlyPick,
    showcase: toArr(r.showcase),
    following: toArr(r.following),
  };
}

/** §5 표 → i18n 키 */
export function communityErrorKey(err: unknown): {
  key: string;
  vars?: Record<string, string>;
} {
  const e = err && typeof err === 'object' ? (err as Record<string, any>) : {};
  const code =
    typeof e.code === 'string'
      ? e.code
      : typeof e.data?.code === 'string'
        ? e.data.code
        : '';
  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof e.data?.status === 'number'
        ? e.data.status
        : 0;
  const detail =
    e.data && typeof e.data === 'object' && e.data.detail && typeof e.data.detail === 'object'
      ? e.data.detail
      : e.detail && typeof e.detail === 'object'
        ? e.detail
        : {};

  if (code === 'TIER_UPGRADE_REQUIRED') return { key: 'community.err.upgrade' };
  if (code === 'PUBLIC_NAME_REQUIRED') return { key: 'community.err.nameRequired' };
  if (code === 'PUBLIC_NAME_TAKEN') return { key: 'community.err.nameTaken' };
  if (code === 'PUBLIC_NAME_CHANGE_TOO_SOON') {
    const nextIso = detail.nextChangeAt ?? e.data?.nextChangeAt ?? e.nextChangeAt;
    return { key: 'community.nameLocked', vars: { date: kstDate(nextIso) } };
  }
  if (code === 'BANNED_WORD') return { key: 'community.err.banned' };
  if (code === 'INVALID_INPUT') return { key: 'community.err.nameFormat' };
  if (code === 'SHARE_AUTOSYNC_OFF') return { key: 'community.err.autosyncOff' };
  if (code === 'ALREADY_REPORTED') return { key: 'community.err.reported' };
  if (code === 'CATEGORY_LIMIT_EXCEEDED') {
    return { key: detail.nextTier ? 'playlist.err.catUpgrade' : 'playlist.err.catFull' };
  }
  if (code === 'CONFLICT') return { key: 'playlist.err.nameDup' };
  if (code === 'PLAYLIST_NOT_FOUND') return { key: 'playlist.err.notFound' };
  if (code === 'YOUTUBE_UNAVAILABLE' || code === 'YOUTUBE_API_ERROR') {
    return { key: 'playlist.err.youtube' };
  }
  if (status === 404 || code === 'NOT_FOUND') return { key: 'folder.err.gone' };
  return { key: 'community.err.generic' };
}
