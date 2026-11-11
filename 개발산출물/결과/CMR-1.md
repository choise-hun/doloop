# CMR-1 결과 — 커뮤니티 탐색 구조(LOGS 탭·선반 순서·게시물 선반·LOGS 마소니)

> 2026-11-11 / Claude(시니어 직접 구현, 로컬 커밋까지). 명세 [CMR-1](../명세/CMR-1_구현명세.md). 브랜치 `step/CMR-1`(base `main`=`9925b8b`, PR #2 머지 확인). **push·PR·CI·스크린샷 Q1~Q9는 주니어 4단계 인계.**

## 1. 구현 요약

- **CommunityPage.tsx:** 탭 값 `'log'`→`'logs'`(`#log`·`#logs` 모두 LOGS 파싱, 전환 시 `#logs`), 최근 공개 state·effect·`loadRecent`·오류 블록 삭제, 모두 탭에 `section#communityPostsRow`(머리줄 제목 + `#communityPostsAll`→LOGS) 소유. 피드 상태는 `onStatusChange`로 받아 `empty`면 `hidden`.
- **CurationRows.tsx:** community 변형 순서 following → monthly → `postsSlot` → curated → showcase, recent 줄·prop 삭제, `postsSlot/postsEmpty` 추가, 전체 빈 상태 `#communityAllEmpty`(큐레이션 성공·네 줄 0건·`postsEmpty`일 때만). 큐레이션 실패 alert+재시도는 상단 유지(피드와 독립). **home 분기 무변경.**
- **EpisodeLogFeed.tsx:** `layout: 'list'|'row'|'masonry'`, `onStatusChange`. row = 첫 페이지 가로 한 줄(칩·더보기·빈 상태 없음), masonry = `matchMedia` JS 라운드로빈 열(≥1150 3, ≥768 2, 그 외 1) + 더보기 유지. 초기 `loading`을 `true`로 바꿔 첫 렌더의 가짜 `empty` 상태를 막음(상태 알림·빈 선반 깜빡임 방지).
- **CommunityPane.tsx 삭제**(importer 0 확인). 새 문구 `community.showAllLogs`·`community.allEmpty`, `community.chipLog` 값 `LOGS`(ko/en/ja).
- **CSS:** `CommunityPage.module.css`(`.postsRow`·`.postsHead`·`.postsTitle`·`.postsAllBtn`, 미사용 `.feedSection` 제거), `EpisodeLogFeed.module.css`(`.postsRow`·`.postsRowItem`·`.postsMasonry`·`.masonryCol`).

## 2. 테스트 변경

- `cm-ui.spec.js`: SR-11(최근 공개 더보기)을 **CMR1-2(최근 공개 요청 0건·`#recentMoreBtn` 0개)로 의미 변경** — 사유: 승인된 요구 변경(UIUX-R §5.2 최근 공개 제거). CMR1-1~CMR1-12 추가(CMR1-8은 `#log`/`#logs`, CMR1-10은 성공/실패 2개로 분리).
- `layout/community.spec.js`: `community-logs`(#logs 4폭) 레이아웃 suite 추가.

## 3. 검증 (이 PC, mac)

| 명령 | 결과 |
| --- | --- |
| `npm run build` | 통과(tsc --noEmit + vite build) |
| `npm test` | 416 pass / 0 fail |
| `npx playwright test test/e2e/cm-ui.spec.js test/e2e/community.spec.js test/e2e/layout/community.spec.js test/e2e/layout/home.spec.js` | 97 passed (CMR1-10·11 분리/수정 전 실행분, 이후 CMR1-10·11 단독 재실행 통과) |
| `rg CommunityPane frontend/src test` / `rg recentFolders\|loadRecent\|recentMoreBtn frontend/src` | 0줄 |

## 4. 결정·주의

- **`discover.recent`·`discover.empty` 키 삭제(재검토 결정 2026-11-11):** 명세 §4의 "홈/호환 유지" 전제가 틀렸다 — 홈 `#discover`는 빈 상태에 줄을 숨겨 `discover.empty`를 쓰지 않고, recent 줄 제거 후 `frontend/src`·`public` 어디에도 사용처가 없다. 처음에 주석 인용으로 I0-6을 통과시켰으나 미사용 키 검사를 무력화하는 우회라 되돌리고 ko/en/ja 사전에서 두 키를 지웠다. 명세 §4도 같이 고쳤다. 문구 키는 CLAUDE.md의 계약 항목이 아니다.
- **SR-11 → CMR1-2 대체 유지:** 원래 SR-11이 지키던 동작(최근 공개 줄 더보기)이 승인된 요구 변경으로 없어졌으므로 의미를 바꾸는 게 맞다. CMR1-2는 요청 0건과 `[data-row="recent"]`·`#recentMoreBtn` 0개를 함께 봐서 제거가 되돌아오면 잡아낸다.
- **`EpisodeLogFeed` 초기 `loading=true` 유지:** 사용처는 CommunityPage 두 곳뿐(row·masonry)이고, 마운트 직후 첫 페이지 조회가 항상 돌아 바로 true→결과로 이어진다. false로 두면 첫 렌더에서 status가 `empty`로 보고돼 선반이 숨었다가 나오고, D4 빈 상태가 잘못 뜰 수 있다. `fetchMore`의 `loading` 가드도 첫 페이지 전 더보기를 막아 오히려 안전하다.
- 명세 §1의 `main=d42e28e` 기준과 달리 실제 main은 PR #2 머지 후(`9925b8b`)다. 충돌 없음.
- `waitForTimeout` 금지 규칙(testing-security.md)에 따라 CMR1-11은 응답 완료 + rAF로 결정적으로 기다린다.

## 5. 주니어 4단계로 넘길 일

1. 전체 회귀(`npm test`, 전체 Playwright) 실행, 필요 시 회귀 수정.
2. `LAYOUT_SHOTS=1` 4폭(390·768·1150·1280)+다크 캡처, Q1~Q9 판정 → 이 파일에 추가(특히 게시물 선반 가로 카드, LOGS 1/2/3열, 빈 상태).
3. push → PR(base main) → `gh pr checks --watch`, 리뷰 코멘트 확인·처리. 머지는 사용자.
