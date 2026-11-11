# CMR-1 결과 — 커뮤니티 탐색 구조(LOGS 탭·선반 순서·게시물 선반·LOGS 마소니)

> 2026-11-11 / Claude(시니어 직접 구현) + Gemini(주니어 4단계 전체 검증·스크린샷 Q1~Q9 판정·PR/CI 확인). 명세 [CMR-1](../명세/CMR-1_구현명세.md). 브랜치 `step/CMR-1`(base `main`=`9925b8b`, PR #2 머지 확인). PR 생성 및 CI 확인 완료. 머지는 사용자 대기.

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

## 5. 주니어 4단계 검증 및 화면 검토 (2026-11-11, Gemini)

### 5.1 검증 결과

| 명령 | 결과 | 상세 |
| --- | --- | --- |
| `npm run build` | 통과 | `tsc --noEmit && vite build` 정상 빌드 완료 |
| `npm test` | 416 pass / 0 fail | Node 테스트 스위트 58개 전체 통과 |
| 커뮤니티 핵심 E2E | 97 pass / 0 fail | `cm-ui.spec.js`, `community.spec.js`, `layout/community.spec.js`, `layout/home.spec.js` |
| `LAYOUT_SHOTS=1` 레이아웃 | 21 pass / 0 fail | `layout/community.spec.js` (guest, pro, logs, empty × 4폭 + 다크) |
| 전체 E2E (`npx playwright test`) | 658 pass / 0 fail | 658 passed (12.3m), 회귀 결함 0건 |

- **체크리스트 정적 점검:**
  - `git grep -n "CommunityPane" -- frontend/src test`: 0건 (삭제 확인)
  - `git grep -E -n "recentFolders|loadRecent|recentMoreBtn" -- frontend/src`: 0건 (제거 확인)
  - `git diff origin/main -- frontend/src/components/community/CurationRows.tsx`: `variant === 'home'` 분기 변경 0줄 확인

### 5.2 4폭(390·768·1150·1280) + 다크 스크린샷 Q1~Q9 판정

캡처 파일: `test-results/layout-shots/community-{guest,pro,logs,empty}-{390,768,1150,1280,1280-dark}.png`

| # | 질문 | 판정 | 상세 근거 (게시물 선반 가로 카드·LOGS 1/2/3열·빈 상태·탭 칩 중점) |
|---|---|:---:|---|
| Q1 | 가장 중요한 것 하나 / 강한 버튼 필 하나 | ○ | 활성 탭 칩(`모두` 또는 `LOGS`) 하나만 강조되어 현재 위치가 명확하며, 선반별 '모두 표시' 버튼은 절제된 보조 텍스트 버튼으로 위계 유지 |
| Q2 | 같은 위계 칸 사이 여백 / 한쪽 빈 덩어리 없음 | ○ | 큐레이션 및 게시물 선반 스택 간 수직 여백이 균일하고, 게시물 선반 내 카드 간격(16px gap) 및 패딩 일관 |
| Q3 | 기준선 어긋남 없음 / 약속 준수 | ○ | 게시물 선반 머리줄 `postsHead:center-y`, 카드 `postsRow:top`, LOGS 열 `logsColumns:top@768` 약속이 모두 준수되어 기준선 어긋남 0px |
| Q4 | 크기·굵기·명도 위계 / 무분별한 색 없음 | ○ | 제목(14px/700), 부제목, 본문, 메타 정보가 글자 크기·굵기·무채색 명도로 단계적으로 구분됨 |
| Q5 | 빈 상태가 고장 같지 않고 자연스러움 | ○ | 큐레이션 4종 및 피드가 모두 비어있을 때 `#communityAllEmpty`("아직 공유된 연습이 없어요")가 단정하게 노출되어 고장으로 보이지 않고 명확한 상태 안내 |
| Q6 | 390 1열 순서 / 768 2열 빈칸 없음 | ○ | 390px에서 following→monthly→posts→curated→showcase 순서로 1열 수직 스택, 게시물 카드는 가로 스크롤(85% 폭), 768px에서 LOGS 2열 마소니 및 1150/1280px에서 3열 마소니로 안정적 배치 |
| Q7 | 유채색 절제 | ○ | 파란색 링크는 필요한 액션("구간 재생", "내 보관함 담기")에만 국한되어 작은 면적으로 사용됨 |
| Q8 | 곡률 조화 / 1px 라인 준수 | ○ | 카드 테두리(`1px solid var(--line)`), 탭 칩의 라운드 필과 카드의 절제된 곡률이 DESIGN.md 규격에 맞게 조화로움 |
| Q9 | 다크 모드 대비 | ○ | 다크 모드 1280px 캡처에서 카드 경계선, 글자 명도, 배지(PRO 등) 대비가 충분하고 시인성 우수 |

### 5.3 Git 처리 및 CI 확인

- **브랜치:** `step/CMR-1`
- **PR:** [PR #3](https://github.com/choise-hun/doloop/pull/3) (base `main`)
- **GitHub Actions CI:** 전 항목 통과 (success)
  - `CI/Detect code changes`: 통과 (6s)
  - `CI/Test (Node 22)`: 통과 (34s)
  - `CI/Docker build & smoke`: 통과 (1m 29s)
  - `CI/E2E XSS & CSP (Playwright)`: 통과 (10m 42s)
  - `CI/CI ok (pull_request)`: 통과 (2s)
- **PR 리뷰 / 코멘트:** 0건 (지적사항 없음)
- **상태:** 구현부터 PR 검증까지 완료. 사용자 머지 대기.
