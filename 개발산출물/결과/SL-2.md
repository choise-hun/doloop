# SL-2 결과 — 곡 순서(V14·PUT /songs/order·⑥ 드래그·패널 높이) 및 세션 삭제(DELETE /sessions/{id}·⑩ ✕)

> 작업: SL-2 (0단계 시니어 직접 구현 → 4단계 주니어 남은 테스트·전체 회귀·4폭 스크린샷·PR·완료 이동) | 브랜치: `feat/SL-2-order-delete` | 기준: [SL-2_구현명세.md](../명세/SL-2_구현명세.md), [진행_SL_곡목록분류.md](../완료/진행_SL_곡목록분류.md) §3
> 상태: **구현·테스트·전체 회귀·4폭 스크린샷 검토 완료 / PR·CI 검증 진행**

## 1. 바꾼 파일

| # | 구분 | 파일 | 내용 | 단계 |
| --- | --- | --- | --- | --- |
| F1 | 신규 | `src/main/resources/db/migration/V14__song_sort_order.sql` | `songs.sort_order` 추가(기존 순서 0..n-1, `updated_at` 트리거 일시 중지), 새 곡 맨 위(`MIN-1`) BEFORE INSERT 트리거 | 시니어(`b7c31c1`) |
| F2 | 수정 | `src/main/kotlin/ulevelp/db/Tables.kt` | `SongsTable.sortOrder` (`databaseGenerated()`) | 시니어(`b7c31c1`) |
| F3 | 수정 | `src/main/kotlin/ulevelp/service/SongService.kt` | `LIST_ORDER`(`sort_order`→`created_at`→`id`), `loadList` 공용화, `reorder`(잠금·404·부분집합 자리 유지·바뀐 행만 UPDATE·공개본 재동기화) | 시니어(`b7c31c1`) |
| F4 | 수정 | `src/main/kotlin/ulevelp/routes/SongRoutes.kt` | `PUT /api/v1/songs/order` (빈 배열·1000 초과·문자열 아님·대문자 UUID 400 `INVALID_INPUT`, 중복 400, `no-store`) | 시니어(`b7c31c1`) |
| F5 | 수정 | `src/main/kotlin/ulevelp/service/SharedFolderSync.kt` | 정렬 칼럼 `id·sortOrder·createdAt` 반영 및 주석 갱신 | 시니어(`b7c31c1`) |
| F6 | 수정 | `src/main/kotlin/ulevelp/service/SessionService.kt` | `delete`(잠금→세션·녹음·공유 카드/첨부 정리→세션 CASCADE 삭제→`last_date` 재계산) | 시니어(`b7c31c1`) |
| F7 | 수정 | `src/main/kotlin/ulevelp/routes/SessionRoutes.kt`, `src/main/kotlin/ulevelp/Main.kt` | `DELETE /api/v1/sessions/{sessionId}` (`purge`, `{"ok":true}`, `no-store`), `storageTrashService` 연결 | 시니어(`b7c31c1`) |
| F8 | 수정 | `frontend/src/lib/apiClient.ts` | `songs.reorder`, `sessions.remove` 추가 | 시니어(`c8a18e9`) |
| F9 | 신규 | `frontend/src/lib/songOrder.mts`, `test/sl2_song_order.test.js` | `applySubsetOrder`, `moveId` 순수 함수 및 `SL2-U1` 단위 테스트(3건) | 시니어(`c8a18e9`) |
| F10 | 수정 | `frontend/src/pages/PracticePage.tsx`, `.module.css` | ⑥ 수정 중 핸들 드래그·↑↓ 키보드·낙관적 반영/되돌림, 961px+ 패널 높이(`align-self: stretch`, `contain: size`), ⑩ `onSessionDeleted` 연결 | 시니어(`c8a18e9`) |
| F11 | 수정 | `frontend/src/components/songRecord/PracticeSessionCard.tsx`, `.module.css`, `SongRecordParts.tsx`, `SongRecordPanel.tsx` | ⑩ `surface="player"` 세션 카드 ✕ 버튼·confirm·삭제·목록/요약 재조회 | 시니어(`c8a18e9`) |
| F12 | 수정 | `frontend/src/lib/i18n/ko.mts`, `en.mts`, `ja.mts` | `episode.deleteSession*`(3키), `practice.dragHandle`, `practice.orderSaveFailed` 3언어 추가 | 시니어(`c8a18e9`) |
| F13 | 수정 | `test/e2e/layout/practice.spec.js` | `SL2-01`~`SL2-08` E2E 추가 및 `SL1-02` 선택자 수정 | 시니어(`c8a18e9`) |
| F14 | 수정 | `src/test/kotlin/ulevelp/song/SongApiTest.kt` | 시니어 `SL2-K2`·`K3` + 주니어 `SL2-K1`·`K4`·`K5`·`K6` 추가 | 시니어+주니어(4단계) |
| F15 | 수정 | `src/test/kotlin/ulevelp/session/SessionApiTest.kt` | 시니어 `SL2-K7`·`K8` + 주니어 `SL2-K9` 추가 | 시니어+주니어(4단계) |
| F16 | 수정 | `src/test/kotlin/ulevelp/community/ShareAttachmentLifecycleTest.kt` | 주니어 `L3b_SL2_K10_sessionDeletionPurgesCopyAndCard` 추가 | 주니어(4단계) |
| F17 | 수정 | `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt` | 주니어 `SL2-K11` (V13→V14 스키마 격리 마이그레이션 검증) 추가 | 주니어(4단계) |
| F18 | 신규/이동 | `개발산출물/결과/SL-2.md`, `계획/상용_서비스_계획.md`, `개발산출물/완료/진행_SL_곡목록분류.md`, `개발산출물/인수인계_메모.md` | 결과 정리, 대기 목록 연결, 진행 파일 `완료/` 이동 및 인수인계 갱신 | 주니어(4단계) |

## 2. 수정한 기존 테스트 3건과 이유 (시니어 구현)

| # | 파일 | 수정 내용 | 이유 |
| --- | --- | --- | --- |
| 1 | `src/test/kotlin/ulevelp/song/SongApiTest.kt:308` | S4 목록 기대 순서 `[s2,s1,s6,s3,s4,s5]` → `[s5,s4,s6,s3,s2,s1]` | 승인된 요구 변경(E1·E2): 목록 정렬 기준이 `sort_order ASC`이고 V14 트리거가 새 곡을 맨 위(`MIN-1`)로 넣어 삽입 역순이 됨 |
| 2 | `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt:106-108` | Flyway 대상 버전 `13` → `14` | V14 마이그레이션(`V14__song_sort_order.sql`) 추가 반영 |
| 3 | `test/e2e/layout/practice.spec.js` | `SL1-02` 수정 중 `#folderList li button` → `li button:not([data-drag-id])` | 수정 중 모드에서 각 행에 드래그 핸들 버튼(`[data-drag-id]`)이 추가되어 곡 카드 버튼만 세도록 선택자 정정 |

## 3. 시니어 변이 검사(Red/Green) 기록

- **대상 가드:** `SongService.reorder`의 내 곡 조회 `userId eq`, `SessionService.delete`의 세션 조회·삭제 `userId eq`.
- **결과 (시니어 보고 기준):** 격리된 사본에서 해당 `userId eq` 조건 제거 시 `./gradlew test --tests '*SongApiTest.SL2-K3*' --tests '*SessionApiTest.SL2-K8*'` → **2 tests completed, 2 failed** (의도한 실패). 원본 복원 뒤 같은 명령 통과.

## 4. 전체 검증 결과 (주니어 4단계, 제품 코드 무수정, 2026-11-20 Mac)

> 참고: 포트 3000을 메인 워크트리(`../doloop`)의 `node server.js`가 점유 중이므로 Playwright는 스크래치 임시 설정(`PORT=3100`, cwd `../doloop-sl2`)으로 실행함.

| # | 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `./gradlew test` (전체) | **401 passed / 0 failed** (`BUILD SUCCESSFUL in 37s`) | `SL2-K1`~`K11` 포함 전체 Kotlin 통합·단위 테스트 통과 |
| V2 | `npm test` | **545 pass / 0 fail** (`58 suites`, `4385.08ms`) | `SL2-U1` 3건 포함 |
| V3 | `npm run build` | **오류 0** (`tsc --noEmit` + `vite build`, `192 modules`, `✓ built in 1.09s`) | `dist/` 최신화 |
| V4 | `npx playwright test -c .../pw-3100.config.js` (전체) | **957 passed / 0 failed** (`15.3m`) | 전체 E2E 회귀 통과 |
| V5 | `LAYOUT_SHOTS=1 npx playwright test -c .../pw-3100.config.js test/e2e/layout/practice.spec.js` | **85 passed / 0 failed** (`1.2m`) | `SL2-01`~`SL2-08` 포함 |

```text
# ./gradlew test
401 tests completed, 0 failed — BUILD SUCCESSFUL in 37s

# npm test
ℹ tests 545
ℹ suites 58
ℹ pass 545
ℹ fail 0

# npx playwright test (전체, PORT=3100)
  957 passed (15.3m)
```

## 5. 4폭 + 다크 + SL-2 상태 스크린샷 Q1~Q9 검토 (`test-results/layout-shots/` 및 스크래치)

대상: `practice-userData-{390,768,1150,1280,1280-dark}.png` 및 SL-2 상태 캡처(`sl2-edit-handles-1280.png`, `sl2-dragging-1280.png`).

| # | 질문 | 390 | 768 | 1150 | 1280 | 1280 다크 | SL-2 상태(수정 중 핸들·끄는 중·세션 ✕·현재 곡 없음) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 주 행동 1개 강조 | ○ | ○ | ○ | ○ | ○ | ○ |
| Q2 | 칸 사이 여백 균형 | ○ | ○ | △ | ○ | ○ | △ (현재 곡이 폴더에 없을 때 1150px에서 안내 줄+`min-height: 160px`로 오른쪽 패널이 `.ppActions`보다 22.6px 더 내려감 — 명세 §7.4 대체 규칙대로 동작, 1280px는 일치) |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ | ○ (수정 중 핸들 44×44 좌측 형제 정렬, 세션 ✕ `.shareStatusRow` 우측 끝 정렬) |
| Q4 | 위계(크기·굵기·명도) | ○ | ○ | ○ | ○ | ○ | ○ (`폴더 선택 · 수정 중` + `완료` 밑줄) |
| Q5 | 빈 상태 안내 | ○ | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 순서 / 768 2열 | ○ | ○ | ○ | ○ | ○ | ○ (390·768 목록 max-height 360px 안 스크롤) |
| Q7 | 무채색 구조 + `--fill` 포인트 | ○ | ○ | ○ | ○ | ○ | △ (D1 수정 중 스파인·카드 3px `--fill1` 주황 적용 — SL-1에서 이어진 사용자 확인 필요 항목) |
| Q8 | 곡률 3px·줄눈 1px·스파인 12px | ○ | ○ | ○ | ○ | ○ | ○ (핸들 3px·`1px` 줄눈, 끄는 중 행 `--surface2` 배경 구분) |
| Q9 | 다크 모드 대비 | — | — | — | — | ○ | ○ (다크 모드 세션 ✕·핸들·경계 대비 충분) |

## 6. 미실행·남은 확인 범위

- **미실행:** 실제 Supabase/Google Drive 외부 스토리지 연동 및 운영 Cloud Run 배포(로컬 테스트는 Testcontainers PostgreSQL 및 `FakeStorageClient`·`mockApp` 기반).
- **남은 항목(`계획/상용_서비스_계획.md` §4 연결):**
  1. D1 수정 중 스파인·카드 3px 색 `--fill1` 사용자 확인(SL-1·SL-2).
  2. 기록 화면(`LogPage`) 세션 카드 ✕ 삭제 버튼 도입 여부(SL-2 E4에서 플레이어만 적용).
