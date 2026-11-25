# TB-1 결과 — TAB 악보 곡 서버 계약(V15 · 업로드 · 파일 주소 · 삭제 정리 · 하위 호환)

> 작업: TB-1 (시니어 직접 구현·보완 → 주니어 4단계 전체 회귀·PR·CI) | 브랜치: `feat/TB-1-tab-songs` | PR: [#70](https://github.com/choise-hun/doloop/pull/70)
> 기준 명세: [TB-1_구현명세.md](../명세/TB-1_구현명세.md) (PR [#69](https://github.com/choise-hun/doloop/pull/69) 머지 `5942b5a`) | 진행 파일: [진행_TB_악보플레이어.md](../진행_TB_악보플레이어.md)
> 상태: **전체 회귀·빌드·PR #70 CI 통과 / Codex Review P2 1건 시니어 처리 대기 (배포 전 U1 `file_size_limit` 확인 필요)**

## 1. 구현 요약 및 커밋

| 커밋 | 내용 | 담당 |
| --- | --- | --- |
| `b57287a` | V15 마이그레이션(`songs.media_type`, `video_id` nullable·부분 유니크 인덱스, `tab_*` 칼럼) + `video_id` nullable 파급 정리 + 목록 `include=tab` 하위 호환 + 공개본·연습 카드·공개 기록·ZIP 내보내기 TAB 제외 | 시니어 |
| `b248ba7` | `TabFileValidator`·`TabSongService`, `POST /api/v1/songs/tab`, `GET /api/v1/songs/{songId}/tab-file`, 곡·계정 삭제 시 TAB 키 `storage_trash` 등록, 티어 TAB 곡 수·용량 한도(`GET /me` 노출) | 시니어 |
| `5ffed9c` | PR #69 Codex Review P2 반영: `TabSongService` 업로드(2단계) 실패·취소 시 `NonCancellable` 보상 정리 추가 및 `TB1-U7` 테스트 보강 | 시니어 |

## 2. 명세와 달라진 점 및 기존 테스트 조정 (시니어 구현 기록 기준)

1. `GET /sessions`의 합계·달력은 TAB 세션까지 센다(목록만 `include=tab`으로 거른다).
2. `CommunityService`·`PlaylistImportService`는 `videoId` nullable 타입 때문에 한 줄씩 보정했다(동작 변화 없음).
3. 응답 키 집합·개수를 단언하는 기존 테스트 3건(`SongApiTest` S1·S13, `SessionApiTest` L3)과 `DatabaseMigrationAndIntegrityTest` Flyway 대상 버전(`14` → `15`)을 새 계약에 맞췄다.
4. `FakeStorageClient`에 업로드 Content-Type 기록을 추가했다.

## 3. 시니어 변이 확인 (Red/Green, 시니어 보고 기준)

- **1차 구현(3건):**
  - `TabSongService` 트랜잭션 B 한도 재검사 제거 → `TB1-U6` 실패
  - `TabSongService.fileUrl`의 `media_type` 조건 제거 → `TB1-F1` 실패
  - 목록 조회 `includeTab` 조건 제거 → `TB1-C2` 실패
- **보완 구현(1건):**
  - `b248ba7` 격리 워크트리에서 `TB1-U7` 업로드 단계 예외·취소 단언만 먼저 추가해 `./gradlew test -Pkotlin.incremental=false --tests '*TabSongApiTest.*TB1-U7*'` 실행 시 삭제·휴지통 단언 3건 예상대로 실패 → `5ffed9c` 반영 후 `./gradlew test --tests '*Tab*'` 23건 통과.

## 4. 전체 검증 결과 (주니어 4단계, 제품 코드 무수정, 2026-11-25 Mac)

| # | 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `./gradlew clean test -Pkotlin.incremental=false` | **432 passed / 0 failed / 0 skipped** (`BUILD SUCCESSFUL in 46s`) | `TabFileValidatorTest` 6건, `TabSongApiTest` 17건 포함 전체 Kotlin 단위·통합(Testcontainers) 통과 |
| V2 | `npm test` | **551 pass / 0 fail** (`58 suites`, `4074.05ms`) | 프런트·보안·유틸 단위 회귀 통과 |
| V3 | `npm run build` | **오류 0** (`tsc --noEmit && vite build`, `195 modules`, `✓ built in 954ms`) | 타입 검사 및 번들 빌드 통과 |
| V4 | Playwright E2E / 운영 배포 | 미실행 | 프런트 코드 무변경, 머지·운영 배포는 사용자 확인 후 진행 |

```text
# ./gradlew clean test -Pkotlin.incremental=false (JUnit XML 집계)
TOTAL: tests=432, failures=0, errors=0, skipped=0
  ulevelp.song.TabFileValidatorTest: tests=6, failures=0, errors=0, skipped=0
  ulevelp.song.TabSongApiTest: tests=17, failures=0, errors=0, skipped=0
BUILD SUCCESSFUL in 46s

# npm test
ℹ tests 551
ℹ suites 58
ℹ pass 551
ℹ fail 0
ℹ duration_ms 4074.051667

# npm run build
✓ 195 modules transformed.
✓ built in 954ms
```

## 5. 배포 전 확인 및 V15 역마이그레이션 SQL

- **배포 전 확인 필요 (§13 U1):** 운영 `takes` 버킷의 `allowed_mime_types`는 `ANY`(제한 없음)로 확인되었으나, **`file_size_limit` ≥ 10MB 여부는 미확인**이므로 배포 전 확인이 필요합니다.
- **V15 역마이그레이션 참고 SQL (명세 §11.2):** TAB 곡이 **0건**일 때만 수동으로 되돌릴 수 있습니다.

```sql
DROP INDEX IF EXISTS songs_tab_storage_key_uq;
DROP INDEX IF EXISTS songs_user_video_uq;
ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_media_shape_check;
ALTER TABLE songs ALTER COLUMN video_id SET NOT NULL;
ALTER TABLE songs ADD CONSTRAINT songs_user_id_video_id_key UNIQUE (user_id, video_id);
ALTER TABLE songs
  DROP COLUMN IF EXISTS tab_format,
  DROP COLUMN IF EXISTS tab_file_size,
  DROP COLUMN IF EXISTS tab_file_name,
  DROP COLUMN IF EXISTS tab_storage_key,
  DROP COLUMN IF EXISTS media_type;
```

## 6. PR 및 CI · 리뷰 상태

- PR: [#70](https://github.com/choise-hun/doloop/pull/70) (`feat/TB-1-tab-songs` → `main`)
- CI (`5ffed9c`): **6/6 통과** (`Detect code changes` 7s, `Test (Node 22)` 28s, `Kotlin test (JDK 21)` 2m21s, `Docker build & smoke` 2m1s, `E2E XSS & CSP (Playwright)` 11m5s, `CI ok` 2s)
- 리뷰 (`5ffed9c`, `chatgpt-codex-connector[bot]` P2 1건):
  - **반영** [Count ZIP entries independently of unique entry names](https://github.com/choise-hun/doloop/pull/70#discussion_r4694772548). 기존 `names.size`는 고유 이름만 세므로 명세 §5.2의 200개 제한을 적용하지 못했다. `src/main/kotlin/ulevelp/service/TabFileValidator.kt:112-117`에서 `nextEntry`가 반환할 때마다 별도 카운터를 올려 201번째 항목의 본문을 읽기 전에 거부한다. 이름 집합은 GP·MXL 필수 항목 조회에 사용한다.
  - **Red** `df5291b` 격리 워크트리에 테스트만 추가한 뒤 `./gradlew test -Pkotlin.incremental=false --tests '*TabFileValidatorTest.*이름이 중복돼도*'` 실행. 200개는 통과했고 201개는 `ApiException` 기대 단언에서 실패했다.
  - **Green** JDK 21로 `./gradlew test --tests '*Tab*'` 실행. 중복 이름을 포함한 200개는 통과, 201개는 400 `TAB_FORMAT_INVALID`(`reason=content`)로 거부됐다. 검증기 7건과 업로드 API 17건 총 **24건 통과, 실패·건너뜀 0건**(`TabFileValidatorTest.kt:89-102`).
  - **3-P 검증 범위** 로컬 전체 회귀·프런트 빌드·Playwright 재실행과 운영 확인은 미실행. 3-P 변경 커밋의 CI 결과는 [PR #70 Checks](https://github.com/choise-hun/doloop/pull/70/checks)에 있다. 머지 전 해당 커밋의 `CI ok` 성공을 확인한다.
