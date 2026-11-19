# 진행 — SL 플레이어 곡 목록·분류 개선

- **목표:** 플레이어 화면의 분류 추가·지정, 곡 목록(폴더 선택·순서·수정), 제목 수정, 연습 세션 삭제 흐름을 사용자 요청 10건(2026-11-19)대로 고친다. 앱 안의 브라우저 기본 선택창(`<select>`)은 공용 선택창으로 바꾼다.
- **근거:** 사용자 요청 2026-11-19(아래 §1 원문 요약), 시안 [명세/SL_시안.html](명세/SL_시안.html), 규칙 [frontend-design](../docs/rules/frontend-design.md)·[frontend-layout](../docs/rules/frontend-layout.md)·[frontend-state](../docs/rules/frontend-state.md)·[backend-kotlin](../docs/rules/backend-kotlin.md), 계획 §4의 "연습 카드(세션) 개별 삭제"(S3b R03)
- **상태:** SL-0 완료(PR #50 머지). **SL-1 4단계 주니어 검증·PR 완료(2026-11-19, `feat/SL-1-player-list-ui`)** — `npm test` 542 pass, `practice.spec.js` 73 passed, 전체 Playwright 944 passed / 1 failed(`i18n-lang.spec.js` `[ja]` 1280px `#presetSelect` `G3` 넘침 `91>87`, 제품 코드 결함으로 시니어 인계). D1 수정 중 `--fill1` 색은 사용자 확인 필요. [결과/SL-1](결과/SL-1.md). SL-1 PR #51 머지(main `e996121`). SL-2 명세 PR #52 머지, 사용자 결정 E1~E5 추천안 승인(E6 해소). **SL-2 0단계 시니어 구현 완료·push(2026-11-19, `feat/SL-2-order-delete`, PR 없음) — 주니어 4단계 대기**(아래 §3 "SL-2 시니어 구현 결과").
- **step ID:** `SL-` (다른 진행 파일과 겹치지 않음. `PL-`은 이미 사용)
- **배정:** 기본 시니어 원스톱(협업 §1.2). 전체 회귀·PR 정리는 주니어 4단계.

## 1. 요청 10건과 현재 코드 사실

| # | 요청 | 현재 코드 | 계약 변경 |
| --- | --- | --- | --- |
| ① | [곡 목록] 버튼을 [분류]와 같은 크기로 | `#songCatBtn`은 공용 `.ghostBtn`(48px/17px), `#libBtn`만 `.ppLibBtn`이 40px/14px로 줄임(`PracticePage.module.css` `.ppLibBtn`) | 없음 |
| ② | 패널 라벨(속도·구간 반복 등) 조금 키우고 폴더 이름도 거기에 맞추기 | `.ppLab` 12px muted, `.folderName` 700 | 없음 |
| ③ | 분류 창 우측 끝 `EDIT` → 추가·이름 변경·삭제 | `#songCatPop`은 체크 목록만. API `POST/PATCH/DELETE /api/v1/categories`, `PUT /categories/order` 이미 있음 | 없음 |
| ④ | 폴더 박스 ▾ 안쪽 여백 = 글자 여백, 가로는 곡 카드 기준, `폴더 변경`→`폴더 선택` | 기본 `<select id="folderSelect">` | 없음(문구 키) |
| ⑤ | 모든 선택창을 앱 모달로 | `<select>` 31곳(플레이어 2·기록 카드 1·코드 21·진행 2·기록 2·운영 1·커뮤니티 2) | 없음 |
| ⑥ | 곡 드래그 순서 이동, 목록 패널 아래 끝 = 왼쪽 플레이어 아래 끝 | 곡 순서 저장 칸·API 없음, `.folderBody` max-height 320px | **DB·API 추가** |
| ⑦ | 폴더 제목 줄 삭제, 박스 안에 `이름 · N곡`, 목록을 박스에 붙임 | `.folderHead`(이름·N곡·펼치기) | 없음 |
| ⑧ | 목록 `EDIT` → 수정 중 표시, 카드 클릭 시 수정 창(제목·분류·삭제) | 카드 클릭 = 곡 전환. `PATCH /songs/{id}`(title·categoryIds), `DELETE /songs/{id}` 있음 | 없음 |
| ⑨ | 제목 아래 저장 시간 빼고 밑줄 `제목 수정` | `#syncState`에 "저장됨 HH:MM"·오류 | 없음 |
| ⑩ | 이 곡의 연습 기록 세션 카드 우측 하단 ✕ → 확인 → 삭제 | 세션 삭제 API 없음. takes·공유 카드·첨부는 `ON DELETE CASCADE`, 곡 삭제(`SongService.delete`)가 저장소 휴지통·공유 첨부 정리를 함(Notion은 폐기 기능이라 새 경로에 넣지 않음) | **API 추가** |

## 2. 결정 (SL-0)

| ID | 질문 | 추천 | 사용자 결정 |
| --- | --- | --- | --- |
| D1 | ⑧ 수정 중 표시 | A 스파인을 `--fill2`로 바꾸고 라벨 옆 `· 수정 중`, 카드 왼쪽 3px 표시 | 추천안 확정 |
| D2 | ② 라벨 크기 | 13px(글자만, 상자 크기 불변) | 추천안 확정 |
| D3 | ⑤ 선택창 위치 | A 박스 바로 아래, 박스와 같은 가로의 작은 창(모든 폭) | 추천안 확정 |
| D4 | ⑥ 드래그 방식 | A EDIT 중에만 왼쪽 핸들로 끌기(일반 모드 탭=곡 전환·터치 스크롤과 충돌 방지) | 추천안 확정 |
| D5 | ⑥ 순서 저장 단위 | 곡마다 순서 1개(`songs` 순서 칸 + 순서 저장 API) | 추천안 확정 |
| D6 | ⑩ 세션 삭제 범위 | 곡 삭제와 같은 정리 규칙(녹음 기록·공유 카드/첨부). Notion은 폐기 기능이라 제외 | 추천안 확정 |
| D7 | 단계 분할 | 아래 §3 | 추천안 확정 |
| D8 | ⑨ "저장됨" 시각 | 표시 삭제, 오류 문구만 같은 줄에 유지 | 추천안 확정 |
| D9 | ⑦ 펼치기/접기 버튼 | 삭제(목록이 패널 높이를 채우고 안에서 스크롤) | 추천안 확정 |

## 3. 단계 표

| Step | 내용 | 담당 | 입력 → 결과 | 완료 기준 | 권장 effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| SL-0 | 시안·결정 | 시니어 | 요청·코드 조사 → [SL_시안.html](명세/SL_시안.html), 이 파일 §2 | 사용자 D1~D9 확정 | 중간 | 완료(PR #50) |
| SL-1 | 화면만: ①②③④⑦⑧(수정 창, 드래그 제외)⑨ + 공용 선택창 컴포넌트와 플레이어 2곳 적용 | 시니어 구현 → 주니어 4단계 | §2 확정 → `결과/SL-1.md` | 표적 e2e(`test/e2e/layout/practice*.spec.js`)·4폭 스크린샷 Q표, `npm test` | 높음 | 4단계 검증·PR 완료 (`i18n-lang` `[ja]` 1건 시니어 인계) |
| SL-2 | 서버 계약: 곡 순서(V14 + API)·세션 삭제 API, ⑥ 드래그·패널 높이, ⑩ ✕ | [시니어 직접 구현] → 주니어 4단계 | SL-1 머지 → [명세/SL-2_구현명세.md](명세/SL-2_구현명세.md), `결과/SL-2.md` | Kotlin 통합(소유권 A↔B 404·정리 규칙), e2e | 높음 | **0단계 시니어 구현·push 완료(2026-11-19, `feat/SL-2-order-delete` `b7c31c1`·`c8a18e9`) — 주니어 4단계 대기** |
| SL-3 | 공용 선택창을 나머지 29곳에 적용 | — | — | — | — | **AS로 이관(2026-11-19)** — Step 상한 때문에 대기능 분리: [진행_AS_선택창전환.md](진행_AS_선택창전환.md). SL은 SL-2로 끝난다 |

### SL-1 시니어 구현 결과 (2026-11-19, 주니어 4단계 입력)

- **바꾼 파일(8):** `frontend/src/components/common/AppSelect.tsx`·`.module.css`(새 공용 선택창), `frontend/src/pages/PracticePage.tsx`·`.module.css`, `frontend/src/lib/i18n/ko.mts`·`en.mts`·`ja.mts`, `test/e2e/layout/practice.spec.js`.
- **공용 선택창 `AppSelect`:** 박스 `<button id role="combobox" data-value>`, 목록 `#<id>-list`(`role="listbox"`, body 포털, `position: fixed`, 박스 바로 아래 4px·같은 가로·최대 320px). 박스가 화면 아래쪽이면 열 때 페이지를 목록이 들어갈 만큼 올린다. 바깥 누름·Esc(박스로 초점)·Tab·페이지 스크롤·창 크기 변경이면 닫힌다. ↑↓·Home·End·Enter·Space, 키 입력은 플레이어 단축키로 새지 않는다. 위치는 `style={{` 금지 규칙(R0-T4 등) 때문에 CSSOM으로 넣는다. e2e에서 고르기: 박스 클릭 → `#<id>-list [data-value="…"]` 클릭(`practice.spec.js` `pickOption`). 값 확인은 `toHaveAttribute('data-value', …)`.
- **화면:** ① `#libBtn`의 `.ppLibBtn` 축소 삭제. ② `.ppLab` 13px. ③ `#songCatPop` 제목 줄 오른쪽 `#songCatEdit`(EDIT/완료) → 이름 밑줄 버튼(`#catEditDialog`: 이름 변경·삭제 — 삭제는 `window.confirm`) + `#songCatAdd` 입력 줄(20자). ④⑦ `#folderSelect` 안 `이름 · N곡`(`#folderCount` 유지), `.folderSelectWrap`에 `scrollbar-gutter: stable`로 박스 가로 = 카드 가로, 목록 간격 8px. 라벨 `#folderSelectLabel` "폴더 선택". ⑧ `#folderEditBtn`(곡 1개 이상일 때) → 패널 `data-editing`, 라벨 "· 수정 중", 카드 왼쪽 3px, 카드 클릭 = `#songEditDialog`(제목 300자·분류 체크·`#songEditDelete` 곡 삭제 — 기록 화면과 같은 `deleteConfirmText` 확인). 현재 곡을 지우면 영상은 두고 계정 곡만 떼며 "곡을 삭제했어요." 표시. ⑨ `#titleEditBtn` → `#titleDialog`. `#syncState`는 저장 중·저장됨 시각·계정 연결됨을 더 이상 쓰지 않고(D8) 오류·안내(계정에 없는 곡 등)만 같은 줄에 둔다. D9 `#folderToggle`·접힘 삭제, 목록 최대 높이 320px(≤960px 360px) 안 스크롤.
- **D1 적용 주의(사용자 확인 필요):** 플레이어 화면 스파인이 이미 `--fill2`(DS2-3 D3)라 "수정 중 → `--fill2`"는 눈에 띄는 차이가 없다. 그래서 수정 중 스파인·카드 3px 표시를 **`--fill1`**로 했다. 4폭 스크린샷 검토 때 사용자에게 이 색을 확인받는다(바꾸려면 `PracticePage.module.css` `.ppFolderPanel[data-editing]` 한 줄).
- **API 확인(코드 기준):** `DELETE /api/v1/categories/{id}` = 200 `{ok:true}`, `song_categories`는 FK CASCADE로 해제(곡 유지), 공개 폴더(`community` user 폴더)도 CASCADE 삭제. 없는 분류 404. `PUT /categories/order` = `{ids:[내 분류 전부, 중복 없이]}`(아니면 400) — SL-1은 쓰지 않음. 분류 이름 빈 값 400 `INVALID_INPUT`·20자 초과 400·중복 409 `CONFLICT`·개수 한도 403 `CATEGORY_LIMIT_EXCEEDED`. `PATCH /songs/{id}` title 빈 값·300자 초과 400, `categoryIds` 10개 초과·UUID 형식 오류 400(`INVALID_INPUT`). 화면은 서버 `message`를 그대로 보여 준다.
- **표적 검증:** `npx tsc --noEmit` 오류 0, `npm test` 542 pass, `npm run build` 후 `npx playwright test test/e2e/layout/practice.spec.js` **73 passed**(새 `SL1-01`·`SL1-02` 포함, `UXR3-PL02/05/04/08/11`·프리셋·DS23 단언을 새 선택창에 맞춤).
- **주니어 4단계 인계(파일 상한 때문에 남김):** `test/e2e/player-category.spec.js` P4b-1·P4b-4, `test/e2e/home-category.spec.js` C4a-5가 **실패한다(확인함, 3 failed)**. 원인은 `#folderSelect`가 버튼이 된 것과 D9뿐이다 — `toHaveValue(X)` → `toHaveAttribute('data-value', X)`, `#folderToggle` `aria-expanded` 단언 삭제(목록은 항상 보임). 제품 코드는 고치지 않는다. 그 밖의 전체 회귀(`npx playwright test` 전체)·`LAYOUT_SHOTS=1` 4폭+다크 Q1~Q9 표·PR·CI·`결과/SL-1.md`는 실행하지 않았다.

### SL-2 시니어 구현 결과 (2026-11-19, 주니어 4단계 입력)

- **사용자 결정:** 명세 §3 E1~E5 추천안 승인(E1 모든 목록 한 순서·E2 새 곡 맨 위·E3 마지막 연습일 다시 계산·E4 플레이어만 ✕·E5 한 Step 커밋 2개), E6 해소.
- **시작 전 확인:** Exposed 0.56 `Column.databaseGenerated()` 있음(`exposed-core-0.56.0-sources` `Table.kt:1050`, UPDATE로 값 쓰기도 막지 않음) → 명세 §4 대안 불필요. `frontend/src/styles/*.css`에 `.ppSide`·`contain` 덮어쓰기 없음. AS-1은 push된 브랜치 없음, `../doloop-sl3`(`feat/SL-3-select-rollout`)는 문서 차이뿐 → 명세 §10 파일 겹침 없음.
- **커밋 ① 서버 `b7c31c1`(10파일):** `V14__song_sort_order.sql`(기존 곡 옛 순서 그대로 0..n-1·`updated_at` 트리거 잠시 끔, 새 곡 BEFORE INSERT 트리거 = 그 사용자 최솟값-1), `Tables.kt` `SongsTable.sortOrder`(`databaseGenerated`), `SongService`(`LIST_ORDER` = `sort_order` → `created_at` 최근 → id, `loadList` 공용화, `reorder` = 프로필 잠금 → 내 곡 `FOR UPDATE` → 남의 곡 404 → 부분집합 자리 유지 `applySubsetOrder` → 바뀐 행만 UPDATE → 공개본 재동기화 → 전체 목록, `MAX_ORDER_IDS=1000`), `SongRoutes` `PUT /songs/order`(빈 배열·1000 초과·문자열 아님·**소문자 표준 표기와 원문이 다르면**(대문자 포함) 400 `ids 형식이 올바르지 않습니다.`, 중복 400 `ids에 같은 곡이 두 번 있습니다.` — 분류 순서 API는 대문자를 통과시키지만 명세 K4가 대문자 400이라 원문 비교로 했다), `SharedFolderSync`(정렬 칼럼 `id·sortOrder·createdAt`·주석), `SessionService.delete`(프로필 잠금 → 세션 행 `FOR UPDATE`(그 사이 녹음 추가 차단) → supabase 녹음 키 휴지통 → 공유 카드 `FOR UPDATE` → `removeShareAttachments` → 세션 삭제(녹음·카드 CASCADE) → E3 `last_date` = 남은 `max(date)`(같으면 UPDATE 안 함), outbox·공개본 재동기화 없음), `SessionRoutes` `DELETE /sessions/{id}`(커밋 뒤 `purge`, `{"ok":true}`, `no-store`), `Main.kt` 인자.
- **커밋 ① 테스트:** 새 `SL2-K2`·`K3`(SongApiTest), `SL2-K7`·`K8`(SessionApiTest; K8에 형식 오류·없는 id 404 포함). 기존 단언 수정 2건(승인된 요구 변경): `SongApiTest` S4 목록 순서 `[s2,s1,s6,s3,s4,s5]` → `[s5,s4,s6,s3,s2,s1]`(값 없이 넣은 곡은 트리거가 맨 위 → 넣은 순서의 반대), `DatabaseMigrationAndIntegrityTest` 대상 버전 13 → 14.
- **변이 검사(Red/Green):** `SongService.reorder`의 내 곡 조회 조건을 `Op.TRUE`로, `SessionService.delete`의 조회·삭제 조건에서 `userId eq`를 뺀 사본으로 `./gradlew test --tests '*SongApiTest.SL2-K3*' --tests '*SessionApiTest.SL2-K8*'` → **2 tests completed, 2 failed**(의도한 실패). 원본 복원 뒤 같은 명령 통과.
- **Kotlin 표적 실행:** `SongApiTest` 19/19·`SessionApiTest` 12/12, 순서 영향 확인용 `CommunityApiTest` 10·`CurationApiTest` 4·`CategoryApiTest` 6·`ExportImportApiTest` 11·`ShareAttachmentLifecycleTest` 22 전부 통과, `DatabaseMigrationAndIntegrityTest` 8/8(단독 실행 `targetSchemaVersion=14`). 전체 `./gradlew test`는 실행하지 않았다.
- **커밋 ② 화면 `c8a18e9`(13파일):** `apiClient` `songs.reorder`·`sessions.remove`, 새 `lib/songOrder.mts`(`applySubsetOrder`·`moveId`)+`test/sl2_song_order.test.js`(SL2-U1 3건), `PracticePage.tsx`·`.module.css`(⑥), `PracticeSessionCard.tsx`·`.module.css`·`SongRecordParts.tsx`(prop 통과만)·`SongRecordPanel.tsx`(⑩), i18n 3언어 5키(`episode.deleteSession`·`deleteSessionConfirm`·`deleteSessionFailed`, `practice.dragHandle`·`orderSaveFailed`), `test/e2e/layout/practice.spec.js`.
  - ⑥ 수정 중·보이는 곡 2개 이상일 때만 인라인 `<li data-song-id>` 안 카드 왼쪽에 `button[data-drag-id]`(⠿ 44×44, `--cream`·`--muted`, `touch-action: none`). 서랍에는 없음. 끄는 중 행 `data-dragging`(배경 `--surface2`). 4px 미만 움직임은 저장 안 함, Esc·`pointercancel` 취소, 목록 위·아래 32px 안이면 8px 자동 스크롤. ↑↓ = 한 칸 이동 후 바로 저장·같은 곡 핸들 포커스 유지. 저장 = 낙관적 반영 → `songsListReqSeqRef` 세대·uid 검사 → 응답 반영 / 실패 되돌림 + `#folderOrderErr`(서버 `message`), 404면 `loadSongList({silent})`. 폴더 변경·계정 전환 때 끄는 상태·오류를 비운다.
  - **명세와 다르게 한 점(자유 범위, 계약 무변경):** (a) 저장 중 핸들은 `disabled` 대신 `aria-disabled`+입력 무시 — `disabled`면 키보드 이동 뒤 포커스가 빠져 "같은 핸들 포커스 유지"를 못 지킨다. (b) 포인터는 `setPointerCapture` 대신 누를 때 붙이는 window `pointermove/up/cancel` 리스너 — React가 행 DOM을 옮기면 캡처가 풀릴 수 있어서. 저장 세대(`orderSeqRef`)는 목록 세대와 따로 두어 늦은 응답이 버려져도 저장 중 표시가 남지 않게 했다.
  - ⑥ 패널 높이: 961px 이상 `.ppSide { align-self: stretch }`, `#ppFolderPanel { flex: 1 1 auto; min-height: 0 }`, `.folderBody { flex: 1 1 0; min-height: 160px; max-height: none; contain: size }`. 960px 이하 360px 그대로. **현재 곡이 고른 폴더에 없으면** "이 폴더에 없음" 안내 줄만큼 오른쪽이 길어져 맞춤이 깨진다(1150px에서 패널이 22.6px 더 내려감 — 명세 §7.4 대체 규칙(최소 160px)대로 동작). SL2-06은 현재 곡이 목록에 있는 보통 상태로 검사한다. 4폭 스크린샷 때 이 상태도 보고 사용자 확인을 받는다.
  - ⑩ `surface="player"`이고 `onSessionDeleted`가 있을 때만 `.shareStatusRow` 오른쪽 끝 `#sessionDelete-player-{id}`(✕ 44×44, 시안 `.xBtn`). `window.confirm`("{date} · {duration} 세션과 녹음 기록·공유 카드가 함께 지워지고 되돌릴 수 없습니다.") → `DELETE` → `invalidate()` → 패널이 세션·녹음·A/B 슬롯을 빼고 상세를 다시 읽고 → `PracticePage`가 곡 목록을 조용히 다시 읽는다. 404는 성공과 같이 처리, 그 밖의 실패는 카드 `actionMsg`. 기록 화면 카드에는 없음(E4).
  - 기존 테스트 수정 1건: `SL1-02` 수정 중 `#folderList li button` → `li button:not([data-drag-id])`(핸들이 생겨 카드만 센다).
- **화면 표적 실행:** `npx tsc --noEmit` 오류 0, `npm test` **544 pass**, `npm run build` 성공, `npx playwright test test/e2e/layout/practice.spec.js` **85 passed**(새 SL2-01·02·03·03b·04·05·06×4·07·08 포함), `practice-record.spec.js`·`i18n-lang.spec.js`·`player-category.spec.js` **25 passed**.
- **주의(이 Mac):** `../doloop`에서 띄운 `node server.js`(11-16부터)가 3000번을 잡고 있으면 Playwright가 그 서버(옛 `dist/`)를 재사용해 새 요소가 없다고 실패한다. 시니어는 그 서버를 끄지 않고 스크래치 임시 설정(포트 3100, `PORT=3100 node server.js`, 이 워크트리 cwd)으로 돌렸다. 주니어는 3000번을 쓰는 프로세스(`lsof -nP -iTCP:3000 -sTCP:LISTEN`)의 cwd를 먼저 확인한다.
- **주니어 4단계 실행 목록:**
  1. Kotlin 남은 명세 테스트 작성·실행(명세 §11.1, 단언 그대로): K1(전체 순서 저장 → 다시 `GET`도 같음), K4(400 묶음 6종 + DB 무변경), K5(새 곡 맨 위·동점 뒤 저장으로 값 중복 0), K6(공개 폴더 `shared_folder_items.position`이 새 순서), K9(두 번 삭제 404), K10(공유 카드+첨부 세션 삭제 → 카드·첨부 0, 복사본 키 `storage.deleted`, `ShareAttachmentLifecycleTest` L3 옆), K11(V13까지 적용한 DB에 곡을 넣고 V14 적용 → 옛 순서 번호·`updated_at` 불변·트리거 기본값·다른 사용자 무영향). 제품 코드가 단언과 다르면 고치지 말고 시니어에게 인계.
  2. `./gradlew test` 전체.
  3. `npm test`·`npm run build`·`npx playwright test` 전체.
  4. `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` 4폭(390·768·1150·1280)+다크 Q1~Q9 — 수정 중 핸들 표시·끄는 중 행·세션 ✕·현재 곡이 폴더에 없을 때 패널 높이 상태 포함. D1 `--fill1` 수정 중 색도 같은 표에서 사용자 확인 항목으로 둔다.
  5. `개발산출물/결과/SL-2.md`(바꾼 파일·명령·결과·수정한 기존 테스트 3건과 이유·변이 검사·미실행), PR(base main) 생성·`gh pr checks --watch`·리뷰 확인.
  6. SL 마지막 Step이므로 남은 범위(D1 색 확인·기록 화면 ✕ 여부 등)를 `계획/상용_서비스_계획.md` 대기 목록에 연결하고 `git mv 개발산출물/진행_SL_곡목록분류.md 개발산출물/완료/` + 완료 줄, 인수인계 메모 진행 파일 줄을 맞춘다.

## 4. 겪은 문제

- SL-1: 390에서 폴더 박스가 화면 아래쪽이면 목록이 화면 밖으로 나가고, 항목을 누르려 페이지가 스크롤되면 "스크롤하면 닫힘" 규칙으로 목록이 닫혔다 → 열 때 목록이 들어갈 만큼 페이지를 먼저 올리고, 그 위치에서 온 scroll 이벤트는 무시한다.
- SL-1: 현재 곡이 고른 폴더에 없으면 기존 안내 문구가 박스와 목록 사이에 들어가 간격 8px이 깨져 보인다(기존 동작 유지, 검사는 현재 곡이 목록에 있는 상태로 함).
- SL-2: Playwright가 다른 워크트리(`../doloop`)의 3000번 서버를 재사용해 옛 `dist/`로 새 테스트 11건이 "요소 없음"으로 실패했다 → 포트 3100 임시 설정으로 이 워크트리 서버를 띄워 확인(§3 주의).
- SL-2: 첫 SL2-03은 세 번째 곡 핸들이 목록 스크롤 영역 밖(잘린 부분)이라 누름이 패널에 떨어졌다 → 보이는 행으로 끌고, 누르기 전 `elementFromPoint`로 핸들인지 단언한다. 또 SL2-06 첫 시도는 현재 곡이 목록에 없어 안내 줄만큼 오른쪽이 길었다(§3 패널 높이 참고).
- 시안 1차: 구간 반복에 간격 표시용 점선을 넣었다가 무슨 뜻인지 알 수 없다는 지적을 받아 제거했다. 패널 높이 기준(플레이어 버튼 섹션)을 시안에 빼먹었다. D3 토글이 눈에 띄는 차이를 만들지 못했다 → 시안에서는 비교 대상을 실제로 그리고, 설명용 표시는 넣지 않는다.

## 5. 다음 세션 시작 지시

- **SL-2 주니어 4단계(현재):** 브랜치 `feat/SL-2-order-delete`(`../doloop-sl2`, PR 없음)에서 위 §3 "SL-2 시니어 구현 결과"의 주니어 실행 목록 1~6을 한다. 인계 멘트:

```text
# Gemini (주니어) — SL-2 4단계 남은 Kotlin 테스트·전체 회귀·스크린샷·PR·완료 이동
개발산출물/프롬프트_템플릿_4단계.md §4를 따른다. 입력: 개발산출물/명세/SL-2_구현명세.md(§5·§6·§7·§8·§11), 개발산출물/진행_SL_곡목록분류.md §3 "SL-2 시니어 구현 결과", 브랜치 feat/SL-2-order-delete 최신 head.
목표: 시니어 구현(V14 곡 순서·PUT /songs/order·DELETE /sessions/{id}, ⑥ 핸들 드래그·패널 높이, ⑩ 세션 ✕)에 남은 명세 테스트를 채우고 전체 회귀·4폭 스크린샷 검토·결과 파일·PR·CI·SL 완료 이동을 맞춘다.
기준: 명세 §11.1 K1·K4·K5·K6·K9·K10·K11 단언, §11.2 SL2-06 기하, docs/rules/frontend-layout.md 9대 질문(practice 4폭+다크, 수정 중 핸들·세션 ✕·현재 곡이 폴더에 없을 때 포함).
선행 조건: cd ../doloop-sl2 && git switch feat/SL-2-order-delete && git pull --ff-only, gh 계정 choise-hun, 테스트 전에 npm run build, 3000번을 다른 워크트리 서버가 잡고 있는지 lsof로 확인. 새 실패는 원인만 기록하고 시니어 판정 전 제품 코드 수정·단언 완화·skip·known 추가 금지.
범위: src/test/kotlin 테스트 추가, ./gradlew test·npm test·npm run build·npx playwright test 전체·LAYOUT_SHOTS=1 practice.spec 실행, 개발산출물/결과/SL-2.md, 계획/상용_서비스_계획.md 대기 연결, 진행 파일 완료/ 이동·인수인계 메모. 제품 코드 수정 금지.
완료 기준: K 테스트 통과 기록, 전체 회귀 결과·Q1~Q9 표, PR(base main) 최신 head CI 통과·리뷰 확인, 진행 파일 git mv 완료/ + 완료 줄.
Git 처리: test·docs 커밋, push, main 대상 신규 PR 생성, gh pr checks --watch, 리뷰 확인. 머지·배포는 하지 않는다.
```

- **겹침 정리(E6 갱신 2026-11-19):** 옛 SL-3은 AS로 이관. `SongRecordParts.tsx`를 고치는 AS-2는 SL-2 머지 뒤로 미뤘고, 병렬인 AS-1(코드 화면)은 SL-2와 파일이 겹치지 않는다 → SL-2는 기다리지 않고 바로 시작한다. SL-2 마지막 PR에서 이 파일을 `완료/`로 옮긴다.
- D1 `--fill1` 색은 SL-1에서 이어진 사용자 확인 항목(SL-2는 이 색을 새로 쓰지 않는다).
