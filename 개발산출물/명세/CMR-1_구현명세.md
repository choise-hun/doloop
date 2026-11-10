# CMR-1 구현 명세 — 커뮤니티 탐색 구조(모두 탭 선반·LOGS 마소니)

> 작성: 2026-11-11 / Claude(시니어). 상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §5.1·§5.2·§5.5·§5.9·§8·§9(UR-08, UR-15), 결정 §1.1.
> 담당: **[시니어] 직접 구현 → [주니어] 4단계 전체 테스트·PR·CI.** 판정: 협업 §1.2 Q1(`#recentMoreBtn`·최근 공개 줄 제거, 탭 해시 변경), Q2(`CurationRows`를 홈과 공유), Q3(피드·선반 독립 요청 상태) 모두 예.
> 브랜치 `step/CMR-1`, base `main`. 선행 없음. **CMR-2(공유 진입·이름 모달)·CMR-3(표지·빠른 추가·상세)·CMR-4(좋아요·녹음 재생)는 이 Step 머지 후 세부 명세.** 이 Step은 이름 배너·표지·카드 내부를 바꾸지 않는다.

## 1. 전제 (`main`=`d42e28e`)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/pages/CommunityPage.tsx:15-24` | 탭 `'all'|'log'|'summary'|'my-shares'`, `#log` 파싱 |
| P2 | 같은 파일 `:54-89`, `:262-266` | 최근 공개 폴더 `community.folders('recent')` 상태·effect·오류/재시도 |
| P3 | 같은 파일 `:259-279` | 모두 탭 = CurationRows(community) + “새 연습 게시물” 세로 피드, LOG 탭 = 범위 칩 피드 |
| P4 | `components/community/CurationRows.tsx:18-25`, `:134-198` | community 변형 순서 curated→monthly→showcase→following→recent, 빈 문구 `discover.empty`(홈 문구) |
| P5 | 같은 파일 `:87-131` | home 변형(홈 `#discover`) — **변경 금지** |
| P6 | `components/community/CommunityPane.tsx` | 어디서도 import하지 않는 미사용 파일. recent 4개 prop을 CurationRows에 넘김 |
| P7 | `components/community/EpisodeLogFeed.tsx:9-12`, `:34-103`, `:176-201` | props `initialScope`, `showScopeChips`. uid+seq 가드, 더보기 실패 시 기존 posts·cursor 보존 |
| P8 | `EpisodeLogFeed.module.css:36-40` | `.postsList` 세로 flex |
| P9 | `Community.module.css:41-58`, `:91-108` | `.rowSection`·`.rowHead`·`.cardScroller` 선반 스타일 |
| P10 | 테스트 의존 | `test/e2e/cm-ui.spec.js`(`#chipLog`, `#recentMoreBtn`, `community.html#log`), `test/e2e/layout/community.spec.js`(`#chipAll`, `#chipLog`) |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | 탭 내부 값 `'log'` → `'logs'`. `#logs`·`#log` 모두 `'logs'`로 파싱, 전환 시 `#logs` 기록. 버튼 id `chipLog`는 유지(셀렉터 호환). `community.chipLog` 값만 ko/en/ja 모두 `LOGS`로 변경 |
| D2 | 최근 공개 제거: P2의 state·effect·`loadRecent`·오류 블록 삭제, CurationRows의 `recentFolders/recentNext/onLoadMoreRecent/onPatchRecent` prop과 recent 줄 삭제. 미사용 `CommunityPane.tsx`는 **삭제**(P6, importer 0 확인 후) |
| D3 | CurationRowsProps에 `postsSlot?: React.ReactNode`, `postsEmpty?: boolean` 추가(community 변형만 사용). 렌더 순서: following → monthly → `postsSlot` → curated → showcase |
| D4 | 전체 빈 상태: 큐레이션 응답 성공 && 네 줄 모두 0 && `postsEmpty===true`일 때만 `#communityAllEmpty`에 `community.allEmpty`. 공유 CTA·단계 안내는 CMR-2에서 이 요소 안에 추가 |
| D5 | 큐레이션 실패는 현행 alert+재시도를 CurationRows 상단에 둔다. 피드는 독립(한쪽 실패가 다른 쪽을 지우지 않음) |
| D6 | EpisodeLogFeedProps에 `layout?: 'list' | 'row' | 'masonry'`(기본 `'list'` = 현행), `onStatusChange?: (s: 'loading'|'error'|'empty'|'ready') => void` 추가 |
| D7 | `row`: 첫 페이지만, 범위 칩·더보기 없음, 가로 스크롤 한 줄(카드 폭 고정). 빈 결과면 아무것도 렌더하지 않음 |
| D8 | `masonry`: CSS columns 대신 **JS 라운드로빈 열**로 구현한다(더보기 시 카드가 다른 열로 튀지 않고 첫 카드 윗선 검사가 가능). 열 수는 `matchMedia`: `≥1150px` 3, `≥768px` 2, 그 외 1. `posts[i]` → 열 `i % n`. 의존성 추가 없음 |
| D9 | 모두 탭 게시물 선반은 CommunityPage가 소유: `section#communityPostsRow.rowSection`(머리줄: 제목 `community.newPostsHeading` + 버튼 `#communityPostsAll` `community.showAllLogs` → LOGS 탭). 상태 `empty`면 `hidden` |
| D10 | 범위 칩·집계·내 공유 폴더 링크·guest·`me` 로딩/실패 분기는 현행 유지 |

## 3. 파일 목록

| 파일 | 구분 | 할 일 |
| --- | --- | --- |
| `frontend/src/pages/CommunityPage.tsx` | 수정 | D1·D2·D4·D9 |
| `frontend/src/pages/CommunityPage.module.css` | 수정 | 게시물 선반 머리줄·빈 상태(토큰만) |
| `frontend/src/components/community/CurationRows.tsx` | 수정 | D2·D3·D4·D5 (home 분기 무변경) |
| `frontend/src/components/community/CommunityPane.tsx` | 삭제 | D2 |
| `frontend/src/components/community/EpisodeLogFeed.tsx` | 수정 | D6~D8 |
| `frontend/src/components/community/EpisodeLogFeed.module.css` | 수정 | `.postsRow`, `.postsMasonry`, `.masonryCol` |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | §4 |
| `test/e2e/cm-ui.spec.js`, `test/e2e/layout/community.spec.js` | 수정 | §7 |

## 4. 문구

| 키 | ko | en | ja | 비고 |
| --- | --- | --- | --- | --- |
| `community.chipLog` | LOGS | LOGS | LOGS | 값 변경 |
| `community.showAllLogs` | 모두 표시 | Show all | すべて表示 | 신규 |
| `community.allEmpty` | 아직 공유된 연습이 없어요 | No practice has been shared yet | まだ共有された練習はありません | 신규 |

`discover.empty`·`discover.recent`는 값·키를 그대로 둔다(홈/호환). 다른 기존 키 삭제 금지.

## 5. 상태 흐름

| 영역 | 로딩 | 실패 | 성공 0건 | 성공 ≥1 |
| --- | --- | --- | --- | --- |
| 팔로잉/이달의 곡/큐레이션/쇼케이스 | 줄 없음 | 상단 alert+재시도(해당 영역만) | 해당 줄 숨김 | FolderRow |
| 게시물 선반(row) | 선반+기존 `#episodeLoading` | 선반+기존 `#episodeError` 재시도 | 선반 hidden | 가로 카드 |
| LOGS(masonry) | `#episodeLoading` | `#episodeError` | 기존 `#episodeEmpty` | 열 배치 + 더보기 |
| 전체 | — | — | D4일 때만 `#communityAllEmpty` | — |

```ts
// EpisodeLogFeed 내부 골격 — 기존 fetchFirstPage/fetchMore 가드는 그대로
const status = loading ? 'loading' : errorMsg ? 'error' : posts.length ? 'ready' : 'empty';
useEffect(() => { onStatusChange?.(status); }, [status]);   // 부모 콜백은 useCallback 아님 → ref로 최신 콜백 보관
const cols = useColumnCount(layout === 'masonry');          // 파일 내부 훅, matchMedia change 구독·해제
const columns = Array.from({ length: cols }, (_, c) => posts.filter((_, i) => i % cols === c));
// row: posts 그대로 .postsRow, nextCursor·scope 칩 무시
```

`initialScope`가 같고 key가 `${uid}:all`/`${uid}:logs`로 분리돼 있어 탭 전환 시 각 피드는 새로 마운트된다(현행 패턴 유지). 첫 페이지 로딩 중 탭을 떠나면 seq 무효화가 늦은 응답을 버린다.

## 6. 배치 약속

| 대상 | 390 | 768 | 1150/1280 | 약속 |
| --- | --- | --- | --- | --- |
| 모두 탭 선반 | 세로 흐름, 줄 내부 가로 스크롤 | 같음 | 같음 | FolderRow 기존 `discoverCards:top,height`, `rowHead:center-y` 유지. 게시물 선반 머리줄 `postsHead:center-y` |
| 게시물 선반 카드 | 가로 스크롤 | 같음 | 같음 | 카드 `postsRow:top` |
| LOGS 열 | 1열 | 2열 | 3열 | 열 래퍼 `.masonryCol`에 `logsColumns:top@768` |
| 탭 칩 | — | — | — | 기존 `chips:center-y` |

카드가 `.postsRow` 안에서 `flex: 0 0 300px`(390에서는 `0 0 85%`)로 줄어들지 않게 한다. G4 가로 스크롤은 스크롤러 내부만 허용(기존 `.cardScroller`와 같은 방식).

## 7. 테스트 표

| 이름 | 준비(기존 spec의 가짜 API 방식) | 기대 | 잡을 버그 |
| --- | --- | --- | --- |
| CMR1-1 선반 순서 | 4종 큐레이션 + 게시물 3 | `[data-row]`·`#communityPostsRow` 문서 순서 following→monthly→posts→curated→showcase | 순서 회귀 |
| CMR1-2 최근 공개 제거 | 모두 탭 진입 | `community/folders?sort=recent` 요청 0건, `#recentMoreBtn` 0개 | 제거 누락 |
| CMR1-3 빈 상태 | 큐레이션 전부 빈 배열 + 피드 0 | `#communityAllEmpty` 1개, `#communityPostsRow` hidden, `discover.empty` 문구 없음 | 홈 문구 사용/가짜 카드 |
| CMR1-4 부분 빈 | 큐레이션 빈 + 피드 2 | `#communityAllEmpty` 없음, 게시물 선반만 | 피드 상태 무시 |
| CMR1-5 독립 실패 | 큐레이션 500 + 피드 정상 | 큐레이션 alert만, 게시물 선반 카드 유지, 재시도 시 큐레이션만 재요청 | 한쪽 실패가 전체를 지움 |
| CMR1-6 피드 실패 | 큐레이션 정상 + 피드 500 | 선반 FolderRow 유지, `#episodeError` 재시도 | 같음(반대) |
| CMR1-7 모두 표시 | `#communityPostsAll` 클릭 | 해시 `#logs`, `#chipLog[aria-selected=true]`, 범위 칩 표시 | 탭 이동 실패 |
| CMR1-8 해시 호환 | `community.html#log`, `#logs` 직접 진입 | 둘 다 LOGS 탭 | 구 링크 파손 |
| CMR1-9 마소니 | 게시물 7, 폭 390/768/1150 | `.masonryCol` 1/2/3개, 1150에서 열1 = 게시물 0·3·6 | 열 수·배분 오류 |
| CMR1-10 더보기 | 2페이지 성공 / 2페이지 500 | 성공: 기존 카드 열 위치 불변 + 추가, 실패: 기존 카드·`#episodeMore` 유지 + `#episodeMoreError` | 실패 시 목록 초기화 |
| CMR1-11 계정 전환 | A 피드 응답 지연 중 B 로그인 | B 화면에 A 게시물 0 | 지연 응답 덮어쓰기 |
| CMR1-12 홈 보존 | `index.html` 발견 줄 | 홈 `#discover` 줄 순서·문구 현행 | 공용 컴포넌트 변경 전파 |

기존 `cm-ui.spec.js`의 `#recentMoreBtn`·최근 공개 단언은 CMR1-2(“요청 0건”)로 **의미를 바꿔** 갱신하고 결과 파일에 사유(승인된 요구 변경 §5.2)를 적는다. `#log` 해시 단언은 유지한다.

## 8. 체크리스트

- [ ] `rg -n "CommunityPane" frontend/src test` → 0줄(삭제 전 importer 0 재확인)
- [ ] `rg -n "recentFolders|loadRecent|recentMoreBtn" frontend/src` → 0줄
- [ ] `rg -n "variant === 'home'" -A 45 frontend/src/components/community/CurationRows.tsx`의 home 분기 diff 0줄
- [ ] `npm run build`, `npm test` 통과
- [ ] `npx playwright test test/e2e/cm-ui.spec.js test/e2e/community.spec.js test/e2e/layout/community.spec.js test/e2e/layout/home.spec.js` 통과
- [ ] `LAYOUT_SHOTS=1` 4폭+다크, Q1~Q9 → `개발산출물/결과/CMR-1.md`

## 9. 금지

- 이름 배너(`#communityNameBanner`)·`CoverArt`·`FolderCard`·`FolderSheet`·`EpisodeLogCard` 수정(CMR-2·3·4 범위).
- 추천·“님을 위한” 문구·가짜 카드/활동, 프로덕션 mock(§5.8은 CMR-3 개발 전용).
- 서버 API·DTO 변경, 새 의존성, 인라인 style, `HomePage.*` 수정.
