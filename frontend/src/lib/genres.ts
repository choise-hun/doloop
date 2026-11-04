// frontend/src/lib/genres.ts
import { json } from './security';

export interface Genre {
  id: string;
  label: string;
}

export const GENRES: ReadonlyArray<Genre> = [
  { id: 'pop', label: 'POP' },
  { id: 'jazz', label: 'JAZZ' },
  { id: 'rnb', label: 'R&B' },
  { id: 'rock', label: 'ROCK' },
  { id: 'jpop', label: 'J-POP' },
  { id: 'ani', label: 'ANI' },
  { id: 'etc', label: 'ETC' },
];

// 홈 장르 버튼 설정: 전체 장르의 순서 + 표시 여부 (기기 저장)
export interface HomeGenreSlot {
  id: string;
  on: boolean;
}

const OPEN_GENRE_KEY = 'ulp:open-genre';

// 저장값이 깨졌거나 장르 목록이 바뀌어도 알려진 장르만, 빠짐없이 한 번씩 돌려준다
export function normalizeHomeGenres(value: unknown): HomeGenreSlot[] {
  const known = new Set(GENRES.map((g) => g.id));
  const out: HomeGenreSlot[] = [];
  if (Array.isArray(value)) {
    for (const it of value) {
      if (!it || typeof it !== 'object') continue;
      const id = (it as { id?: unknown }).id;
      if (typeof id !== 'string' || !known.has(id) || out.some((s) => s.id === id)) continue;
      out.push({ id, on: (it as { on?: unknown }).on !== false });
    }
  }
  for (const g of GENRES) {
    if (!out.some((s) => s.id === g.id)) out.push({ id: g.id, on: true });
  }
  return out;
}

export function loadHomeGenres(): HomeGenreSlot[] {
  return normalizeHomeGenres(json.get<unknown>('ulp:home-genres', null));
}

export function saveHomeGenres(slots: HomeGenreSlot[]): void {
  json.set('ulp:home-genres', slots);
}

export function genreLabel(id: string): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

// 홈 장르 버튼 → 플레이어: URL을 바꾸지 않고 탭 단위로 한 번 넘긴다
export function setOpenGenre(id: string): void {
  try {
    sessionStorage.setItem(OPEN_GENRE_KEY, id);
  } catch {
    /* 저장 불가 무시 */
  }
}

// TODO(stub): G-4에서 PracticePage가 읽고 지운 뒤 해당 장르 폴더만 펼친다
export function takeOpenGenre(): string {
  try {
    const v = sessionStorage.getItem(OPEN_GENRE_KEY) || '';
    sessionStorage.removeItem(OPEN_GENRE_KEY);
    return v;
  } catch {
    return '';
  }
}
