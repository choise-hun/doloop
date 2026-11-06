// test/e2e/support/community-fixtures.js
// M2-23 커뮤니티·큐레이션·재생목록 가져오기 고정 응답 및 route 생성기
'use strict';

const { LONG_TITLE } = require('./mock-app');

const COMMUNITY_FREE_ME = {
  tier: 'free',
  billingTier: 'free',
  isCreator: false,
  creatorBadge: null,
  shareAutosync: false,
  sharePracticeLog: false,
  publicName: '무료연습생',
  publicNameNextChangeAt: null,
  limits: {
    songs: 10,
    categories: 2,
    takeBytes: 5242880,
    takeSongs: 2,
    takeDurationSec: 120,
    drive: false,
    ai: false,
    communityWrite: false,
  },
  credits: { monthly: 0, purchased: 0 },
};

const COMMUNITY_PRO_ME = {
  tier: 'pro',
  billingTier: 'pro',
  isCreator: false,
  creatorBadge: null,
  shareAutosync: true,
  sharePracticeLog: true,
  publicName: '네오소울러',
  publicNameNextChangeAt: '2026-11-13T16:00:00Z',
  limits: {
    songs: 100,
    categories: 7,
    takeBytes: 104857600,
    takeSongs: null,
    takeDurationSec: null,
    drive: true,
    ai: true,
    communityWrite: true,
  },
  credits: { monthly: 152, purchased: 40 },
};

const FOLDER_CURATED_1 = {
  id: '00000000-0000-4000-8000-000000000501',
  kind: 'curated',
  title: `네오소울 입문 · ${LONG_TITLE}`,
  titleI18n: { ko: `네오소울 입문 · ${LONG_TITLE}`, en: 'Neo-Soul Starter' },
  descriptionI18n: { ko: '네오소울 더블스탑과 엄지 슬랩을 차례대로 익히는 추천 코스예요.' },
  month: null,
  owner: null,
  itemCount: 5,
  coverVideoIds: ['abcdefghij1', 'abcdefghij2', 'abcdefghij3', 'abcdefghij4'],
  artists: ['John Mayer', 'Tom Misch'],
  likeCount: 12,
  cloneCount: 4,
  likedByMe: false,
  publishedAt: '2026-11-01T00:00:00Z',
};

const FOLDER_CURATED_2 = {
  id: '00000000-0000-4000-8000-000000000502',
  kind: 'curated',
  title: '재즈 스탠더드 보이싱',
  titleI18n: { ko: '재즈 스탠더드 보이싱', en: 'Jazz Standard Voicings' },
  descriptionI18n: { ko: '투파이브원 컴핑 기본기를 다지는 폴더예요.' },
  month: null,
  owner: null,
  itemCount: 2,
  coverVideoIds: ['abcdefghij2', 'abcdefghij3'],
  artists: ['Wes Montgomery', 'Joe Pass'],
  likeCount: 7,
  cloneCount: 2,
  likedByMe: true,
  publishedAt: '2026-11-02T00:00:00Z',
};

const FOLDER_MONTHLY = {
  id: '00000000-0000-4000-8000-000000000503',
  kind: 'monthly_pick',
  title: '11월의 곡',
  titleI18n: { ko: '11월의 곡' },
  descriptionI18n: { ko: '이달에 꼭 연습해 볼 추천 구간 모음이에요.' },
  month: '2026-11',
  owner: null,
  itemCount: 2,
  coverVideoIds: ['abcdefghij1', 'abcdefghij2'],
  artists: ['John Mayer', 'Mateus Asato'],
  likeCount: 19,
  cloneCount: 6,
  likedByMe: false,
  publishedAt: '2026-11-01T00:00:00Z',
};

const MONTHLY_ITEMS = [
  {
    videoId: 'abcdefghij1',
    position: 0,
    title: `1 · ${LONG_TITLE}`,
    artist: 'John Mayer',
    a: 38,
    b: 55,
    rate: 0.75,
    noteI18n: { ko: '인트로 슬라이드 구간을 0.75배속으로 연습해요.' },
  },
  {
    videoId: 'abcdefghij2',
    position: 1,
    title: 'Slow Dancing Groove',
    artist: 'Mateus Asato',
    a: 12,
    b: 40,
    rate: 1,
    noteI18n: { ko: '정박 그루브 유지에 집중해요.' },
  },
];

const FOLDER_SHOWCASE_1 = {
  id: '00000000-0000-4000-8000-000000000504',
  kind: 'user',
  title: '크리에이터 김기타의 모닝 루틴',
  titleI18n: { ko: '크리에이터 김기타의 모닝 루틴' },
  descriptionI18n: { ko: '매일 아침 20분 손풀기 곡 목록이에요.' },
  month: null,
  owner: {
    id: '00000000-0000-4000-8000-000000000002',
    publicName: '김기타',
    isCreator: true,
    creatorBadge: '재즈 기타',
  },
  itemCount: 3,
  coverVideoIds: ['abcdefghij3'],
  artists: ['Cory Wong', 'Julian Lage'],
  likeCount: 25,
  cloneCount: 9,
  likedByMe: false,
  publishedAt: '2026-11-04T00:00:00Z',
};

const FOLDER_FOLLOWING_1 = {
  id: '00000000-0000-4000-8000-000000000505',
  kind: 'user',
  title: '박블루스의 펜타토닉 릭',
  titleI18n: { ko: '박블루스의 펜타토닉 릭' },
  descriptionI18n: { ko: '블루스 솔로 입문 곡 모음이에요.' },
  month: null,
  owner: {
    id: '00000000-0000-4000-8000-000000000003',
    publicName: '박블루스',
    isCreator: false,
    creatorBadge: null,
  },
  itemCount: 2,
  coverVideoIds: ['abcdefghij4'],
  artists: ['B.B. King'],
  likeCount: 5,
  cloneCount: 1,
  likedByMe: false,
  publishedAt: '2026-11-05T00:00:00Z',
};

const CURATION_HOME_FIXTURE = {
  curated: [FOLDER_CURATED_1, FOLDER_CURATED_2],
  monthlyPick: {
    folder: FOLDER_MONTHLY,
    items: MONTHLY_ITEMS,
  },
  showcase: [FOLDER_SHOWCASE_1],
  following: [FOLDER_FOLLOWING_1],
};

const FOLDER_DETAILS_FIXTURE = {
  [FOLDER_CURATED_1.id]: {
    folder: FOLDER_CURATED_1,
    items: MONTHLY_ITEMS,
  },
  [FOLDER_CURATED_2.id]: {
    folder: FOLDER_CURATED_2,
    items: [MONTHLY_ITEMS[1]],
  },
  [FOLDER_SHOWCASE_1.id]: {
    folder: FOLDER_SHOWCASE_1,
    items: MONTHLY_ITEMS,
  },
  [FOLDER_FOLLOWING_1.id]: {
    folder: FOLDER_FOLLOWING_1,
    items: [MONTHLY_ITEMS[0]],
  },
};

const PRACTICE_LOGS_FIXTURE = {
  all: [
    {
      user: {
        id: '00000000-0000-4000-8000-000000000002',
        publicName: '김기타',
        isCreator: true,
        creatorBadge: '재즈 기타',
      },
      days: [{ date: '2026-11-06', seconds: 1800 }],
      streakDays: 14,
      thisWeekSeconds: 3720,
      today: [
        {
          videoId: 'abcdefghij1',
          title: 'Gravity Live Intro',
          artist: 'John Mayer',
          seconds: 1800,
          loops: 12,
        },
      ],
    },
    {
      user: {
        id: '00000000-0000-4000-8000-000000000003',
        publicName: '박블루스',
        isCreator: false,
        creatorBadge: null,
      },
      days: [{ date: '2026-11-06', seconds: 900 }],
      streakDays: 5,
      thisWeekSeconds: 1800,
      today: [],
    },
  ],
  following: [
    {
      user: {
        id: '00000000-0000-4000-8000-000000000003',
        publicName: '박블루스',
        isCreator: false,
        creatorBadge: null,
      },
      days: [{ date: '2026-11-06', seconds: 900 }],
      streakDays: 5,
      thisWeekSeconds: 1800,
      today: [
        {
          videoId: 'abcdefghij4',
          title: 'The Thrill Is Gone',
          artist: 'B.B. King',
          seconds: 900,
          loops: 6,
        },
      ],
    },
  ],
};

const CATEGORIES_FIXTURE = [
  { id: 'cat-1', name: '재즈', sortOrder: 0, onHome: true, songCount: 3 },
  { id: 'cat-2', name: '블루스', sortOrder: 1, onHome: false, songCount: 2 },
];

const SHARES_FIXTURE = {
  'cat-1': {
    folderId: '00000000-0000-4000-8000-000000000601',
    categoryId: 'cat-1',
    title: '재즈 공개본',
    isPublic: true,
    autoSync: true,
    hidden: false,
    itemCount: 3,
    likeCount: 4,
    cloneCount: 1,
    publishedAt: '2026-11-05T00:00:00Z',
    publicName: '네오소울러',
  },
  'cat-2': null,
};

const PLAYLIST_PREVIEW_FIXTURE = {
  playlistId: 'PL1',
  title: '네오소울 입문 플레이리스트 모음집 2026',
  itemCount: 5,
  remainingSongSlots: 8,
  remainingCategorySlots: 1,
};

const PLAYLIST_IMPORT_RESULT_FIXTURE = {
  categoryId: 'cat-new',
  categoryCreated: true,
  playlistTitle: '네오소울 입문 플레이리스트 모음집 2026',
  imported: 4,
  alreadyInLibrary: 1,
  skippedLimit: 0,
  skippedUnavailable: 0,
};

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

/**
 * mockApp opts.routes에 넣을 커뮤니티·큐레이션·가져오기 route 배열을 돌려준다.
 * @param {object} [opts]
 */
function communityRoutes(opts = {}) {
  const curationHome = opts.curationHome !== undefined ? opts.curationHome : CURATION_HOME_FIXTURE;
  const recentFolders = opts.recentFolders !== undefined ? opts.recentFolders : [FOLDER_SHOWCASE_1, FOLDER_FOLLOWING_1];
  const folderDetails = { ...FOLDER_DETAILS_FIXTURE, ...(opts.folderDetails || {}) };
  const categories = opts.categories !== undefined ? opts.categories : CATEGORIES_FIXTURE;
  const shares = { ...SHARES_FIXTURE, ...(opts.shares || {}) };
  const preview = opts.preview !== undefined ? opts.preview : PLAYLIST_PREVIEW_FIXTURE;
  const importResult = opts.importResult !== undefined ? opts.importResult : PLAYLIST_IMPORT_RESULT_FIXTURE;

  return [
    [
      (url) => url.pathname === '/api/v1/curation/home',
      async (route) => {
        if (opts.onCurationHome) return opts.onCurationHome(route, fulfillJson);
        return fulfillJson(route, curationHome);
      },
    ],
    [
      (url) => url.pathname === '/api/v1/community/folders',
      async (route) => {
        if (opts.onFolders) return opts.onFolders(route, fulfillJson);
        return fulfillJson(route, { folders: recentFolders, next: null });
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/folders\/[^/]+\/like$/.test(url.pathname),
      async (route) => {
        if (opts.onLike) return opts.onLike(route, fulfillJson);
        const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[5]);
        const base = folderDetails[id]?.folder || FOLDER_CURATED_1;
        const on = route.request().method() === 'PUT';
        return fulfillJson(route, {
          liked: on,
          likeCount: base.likeCount + (on ? 1 : 0),
        });
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/folders\/[^/]+\/clone$/.test(url.pathname),
      async (route) => {
        if (opts.onClone) return opts.onClone(route, fulfillJson);
        return fulfillJson(route, {
          categoryId: 'cat-cloned',
          imported: 3,
          alreadyInLibrary: 1,
          skippedLimit: 0,
        });
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/folders\/[^/]+\/reports$/.test(url.pathname),
      async (route) => {
        if (opts.onReport) return opts.onReport(route, fulfillJson);
        return fulfillJson(route, { reportId: 1 }, 201);
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/folders\/[^/]+$/.test(url.pathname),
      async (route) => {
        if (opts.onFolderDetail) return opts.onFolderDetail(route, fulfillJson);
        const p = new URL(route.request().url()).pathname;
        const id = decodeURIComponent(p.split('/')[5]);
        const detail = folderDetails[id];
        if (!detail) {
          return fulfillJson(route, { ok: false, code: 'NOT_FOUND', message: 'Not found' }, 404);
        }
        return fulfillJson(route, detail);
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/users\/[^/]+$/.test(url.pathname),
      async (route) => {
        if (opts.onUser) return opts.onUser(route, fulfillJson);
        const p = new URL(route.request().url()).pathname;
        const id = decodeURIComponent(p.split('/')[5]);
        return fulfillJson(route, {
          id,
          publicName: '김기타',
          isCreator: true,
          creatorBadge: '재즈 기타',
          creatorBio: '',
          followerCount: 10,
          followingByMe: false,
          folders: [],
          practiceLog: null,
        });
      },
    ],
    [
      (url) => /^\/api\/v1\/community\/follows\/[^/]+$/.test(url.pathname),
      async (route) => {
        if (opts.onFollow) return opts.onFollow(route, fulfillJson);
        const on = route.request().method() === 'PUT';
        return fulfillJson(route, { following: on, followerCount: on ? 11 : 10 });
      },
    ],
    [
      (url) => url.pathname === '/api/v1/community/logs',
      async (route) => {
        if (opts.onLogs) return opts.onLogs(route, fulfillJson);
        const u = new URL(route.request().url());
        const scope = u.searchParams.get('scope') === 'following' ? 'following' : 'all';
        return fulfillJson(route, { logs: PRACTICE_LOGS_FIXTURE[scope], next: null });
      },
    ],
    [
      (url) => url.pathname === '/api/v1/community/me/public-name',
      async (route) => {
        if (opts.onSetPublicName) return opts.onSetPublicName(route, fulfillJson);
        const body = route.request().postDataJSON() || {};
        return fulfillJson(route, {
          publicName: body.publicName || '새이름',
          changedAt: '2026-11-06T16:00:00Z',
          nextChangeAt: '2026-11-13T16:00:00Z',
        });
      },
    ],
    [
      (url) => url.pathname === '/api/v1/categories',
      async (route) => {
        if (opts.onCategories) return opts.onCategories(route, fulfillJson);
        return fulfillJson(route, { categories });
      },
    ],
    [
      (url) => /^\/api\/v1\/categories\/[^/]+\/share$/.test(url.pathname),
      async (route) => {
        const p = new URL(route.request().url()).pathname;
        const catId = decodeURIComponent(p.split('/')[4]);
        if (route.request().method() === 'PUT') {
          if (opts.onSetShare) return opts.onSetShare(route, fulfillJson, catId);
          const body = route.request().postDataJSON() || {};
          const updated = {
            id: `share-${catId}`,
            title: body.title || '공개 폴더',
            titleI18n: { ko: body.title || '공개 폴더' },
            descriptionI18n: {},
            isPublic: Boolean(body.isPublic),
            autoSync: Boolean(body.autoSync),
            hidden: false,
            itemCount: 3,
            likeCount: 0,
            cloneCount: 0,
            publishedAt: '2026-11-06T00:00:00Z',
          };
          shares[catId] = updated;
          return fulfillJson(route, { share: updated });
        }
        if (opts.onGetShare) return opts.onGetShare(route, fulfillJson, catId);
        return fulfillJson(route, { share: shares[catId] ?? null });
      },
    ],
    [
      (url) => /^\/api\/v1\/categories\/[^/]+\/share\/republish$/.test(url.pathname),
      async (route) => {
        const p = new URL(route.request().url()).pathname;
        const catId = decodeURIComponent(p.split('/')[4]);
        if (opts.onRepublish) return opts.onRepublish(route, fulfillJson, catId);
        return fulfillJson(route, { share: shares[catId] ?? null });
      },
    ],
    [
      (url) => url.pathname === '/api/v1/songs/import-playlist/preview',
      async (route) => {
        if (opts.onPreview) return opts.onPreview(route, fulfillJson);
        return fulfillJson(route, preview);
      },
    ],
    [
      (url) => url.pathname === '/api/v1/songs/import-playlist',
      async (route) => {
        if (opts.onImport) return opts.onImport(route, fulfillJson);
        return fulfillJson(route, importResult);
      },
    ],
  ];
}

module.exports = {
  COMMUNITY_FREE_ME,
  COMMUNITY_PRO_ME,
  FOLDER_CURATED_1,
  FOLDER_CURATED_2,
  FOLDER_MONTHLY,
  MONTHLY_ITEMS,
  FOLDER_SHOWCASE_1,
  FOLDER_FOLLOWING_1,
  CURATION_HOME_FIXTURE,
  FOLDER_DETAILS_FIXTURE,
  PRACTICE_LOGS_FIXTURE,
  CATEGORIES_FIXTURE,
  SHARES_FIXTURE,
  PLAYLIST_PREVIEW_FIXTURE,
  PLAYLIST_IMPORT_RESULT_FIXTURE,
  communityRoutes,
};
