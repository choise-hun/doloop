// 홈 RECENT 카드용 "마지막으로 본 최근 곡" 캐시.
// 로그인 세션이 복원되기 전(activeUid=null)에도 같은 사용자의 곡만 먼저 보여 주기 위해,
// 세션 저장소(ulp:auth)에서 사용자 id를 동기로 읽고(peekStoredUid) 그 id의 캐시만 쓴다.
// 캐시는 한 칸(ulp:recentSong)이며 값 안에 uid를 담는다. 다른 uid의 값은 읽지 않고, 로그아웃(auth.ts signOut)이 지운다.

export const RECENT_SONG_KEY = 'ulp:recentSong';
const AUTH_KEY = 'ulp:auth';

export interface RecentSongCache {
  videoId: string;
  title: string;
  a: number | null;
  b: number | null;
  pos: number | null;
  rate: number | null;
  memo: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 저장된 세션(ulp:auth)의 사용자 id. 없거나 형식이 다르면 null (세션 복원 완료를 뜻하지 않는다) */
export function peekStoredUid(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    const parsed = JSON.parse(storage?.getItem(AUTH_KEY) || 'null');
    const id = parsed?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function readRecentSongCache(
  uid: string | null,
  storage: StorageLike | null = defaultStorage(),
): RecentSongCache | null {
  if (!uid) return null;
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_SONG_KEY) || 'null');
    if (!parsed || parsed.uid !== uid) return null;
    const s = parsed.song;
    if (!s || typeof s.videoId !== 'string' || !s.videoId || typeof s.title !== 'string') return null;
    return {
      videoId: s.videoId,
      title: s.title,
      a: numOrNull(s.a),
      b: numOrNull(s.b),
      pos: numOrNull(s.pos),
      rate: numOrNull(s.rate),
      memo: typeof s.memo === 'string' ? s.memo : '',
    };
  } catch {
    return null;
  }
}

/** song이 null이면(서버가 성공으로 0곡을 돌려줌) 캐시를 지운다 */
export function writeRecentSongCache(
  uid: string,
  song: RecentSongCache | null,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    if (!storage) return;
    if (song) storage.setItem(RECENT_SONG_KEY, JSON.stringify({ uid, song }));
    else storage.removeItem(RECENT_SONG_KEY);
  } catch {
    /* 저장 불가 무시 */
  }
}
