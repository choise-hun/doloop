// frontend/src/lib/communityMock.ts
// CMR-3 D23: 개발 서버 전용 커뮤니티 mock 데이터(`/community.html?mock=1`).
// 프로덕션 번들에서 빠져야 한다(D26 확인 표식: ulp-community-mock). 문자열은 영문(LA-1).
import type { CurationHomeDto, PublicEpisodeLogDto, PublicFolderDto, PublicFolderItemDto } from './apiClient';

export const COMMUNITY_MOCK_MARK = 'ulp-community-mock';

export function communityMockOn(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mock') === '1';
}

function folder(n: number, kind: string, title: string, owner: string | null, artists: string[]): PublicFolderDto {
  return {
    id: `mock-${kind}-${n}`,
    kind,
    title,
    titleI18n: { en: title },
    descriptionI18n: { en: `${COMMUNITY_MOCK_MARK}: sample folder` },
    month: null,
    owner: owner
      ? { id: `mock-user-${n}`, publicName: owner, isCreator: kind === 'user' && n === 1, creatorBadge: null }
      : null,
    itemCount: 3 + n,
    coverVideoId: null,
    coverVideoIds: [],
    artists,
    likeCount: 10 * n,
    likedByMe: false,
    cloneCount: n,
    autoSync: false,
    publishedAt: '2026-11-01T00:00:00Z',
  };
}

function item(n: number, title: string, artist: string, a: number, b: number): PublicFolderItemDto {
  return { videoId: `mockvid000${n}`, position: n, title, artist, a, b, rate: 0.75, noteI18n: { en: COMMUNITY_MOCK_MARK } };
}

export const MOCK_CURATION: CurationHomeDto = {
  following: [
    folder(1, 'user', 'Morning Groove Routine', 'Mock Player A', ['Cory Wong']),
    folder(2, 'user', 'Pentatonic Licks', 'Mock Player B', ['B.B. King']),
  ],
  monthlyPick: {
    folder: folder(1, 'monthly_pick', 'Songs of the Month', null, ['John Mayer']),
    items: [
      item(1, 'Intro Slide', 'John Mayer', 38, 55),
      item(2, 'Slow Groove', 'Mateus Asato', 12, 40),
      item(3, 'Double Stops', 'Tom Misch', 20, 44),
      item(4, 'Thumb Slap', 'Cory Wong', 5, 30),
    ],
  },
  curated: [
    folder(1, 'curated', 'Neo-Soul Starter', null, ['John Mayer', 'Tom Misch']),
    folder(2, 'curated', 'Jazz Standard Voicings', null, ['Wes Montgomery']),
    folder(3, 'curated', 'Funk Rhythm Basics', null, ['Nile Rodgers']),
  ],
  showcase: [
    folder(1, 'user', 'Creator Warmups', 'Mock Creator', ['Julian Lage']),
    folder(2, 'user', 'Blues Turnarounds', 'Mock Player C', ['Albert King']),
  ],
};

export const MOCK_POSTS: PublicEpisodeLogDto[] = [1, 2, 3, 4, 5].map((n) => ({
  postId: `mock-post-${n}`,
  sessionId: `mock-session-${n}`,
  owner: { id: `mock-user-${n}`, publicName: `Mock Player ${n}`, isCreator: false, creatorBadge: null },
  videoId: `mockvid000${n}`,
  youtubeTitle: `Mock Song ${n}`,
  youtubeArtist: 'Mock Artist',
  title: `Practice session ${n}`,
  comment: `${COMMUNITY_MOCK_MARK}: sample post ${n}`,
  publishedAt: `2026-11-0${n}T09:00:00Z`,
  date: `2026-11-0${n}`,
  seconds: 600 * n,
  loops: 3 * n,
  a: 10,
  b: 40,
  rate: 0.75,
  coveragePct: 20 * n,
  partStats: [],
}));
