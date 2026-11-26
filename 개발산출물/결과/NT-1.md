# NT-1 결과 — 학습 노트 워크스페이스 서버 (V16 · 노트북 · 자료/블록 노트 · 첨부 · 주석 · 합산 파일 한도)

> 작업: NT-1 (시니어 직접 구현 → 주니어 4단계 전체 회귀·PR·CI·결과 정리) | 브랜치: `feat/NT-1-note-workspace` | PR: [#73](https://github.com/choise-hun/doloop/pull/73)
> 기준 명세: [NT-1_구현명세.md](../명세/NT-1_구현명세.md) (§12·§13.1·§14) | 진행 파일: [진행_NT_학습노트.md](../진행_NT_학습노트.md)
> 상태: **전체 Kotlin 회귀 450/450 통과 · PR #73 CI 6/6 통과 · Codex 리뷰 이상 없음 (머지 대기)**

## 1. 구현 요약 및 커밋

| 커밋 | 내용 | 담당 |
| --- | --- | --- |
| `343129f` | 학습 노트 진행 파일·NT-1 구현 명세(N1~N10 승인)·확인 결과(U1~U4) 기록 | 시니어 |
| `c5b4dc1` | V16 마이그레이션(`note_folders`, `note_docs`, `note_files`, `note_annotations`, `notes.folder_id`), 노트북 CRUD·순서, 자료/블록 노트 CRUD(`rev` 충돌 409·본문 1MB 상한), 첨부 업로드(PDF·PNG·JPEG·WebP 20MB·노트당 20개·보상 정리)·Drive 참조·서명 주소(300초), 페이지 주석 `rev` 저장, 삭제·계정 삭제 시 `storage_trash` 정리, TAB과 합산한 파일 총량 `fileBytes` 및 `/me` 사용량, `owner` 한도 해제, 표적·회귀 테스트 | 시니어 |

- 시니어 구현 커밋(`c5b4dc1`) 변경 파일(16개, +2257 / -24):
  - `src/main/resources/db/migration/V16__note_workspace.sql`, `src/main/kotlin/ulevelp/db/Tables.kt`
  - `src/main/kotlin/ulevelp/api/JsonInput.kt`, `src/main/kotlin/ulevelp/Main.kt`
  - `src/main/kotlin/ulevelp/service/TierService.kt`, `ProfileService.kt`, `NoteService.kt`, `NoteFolderService.kt`, `NoteDocService.kt`, `NoteFileService.kt`, `NoteFileValidator.kt`
  - `src/main/kotlin/ulevelp/routes/NoteRoutes.kt`, `NoteWorkspaceRoutes.kt`
  - `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt`, `src/test/kotlin/ulevelp/note/NoteWorkspaceApiTest.kt`, `src/test/kotlin/ulevelp/note/NoteFileApiTest.kt`

## 2. 명세와 달라진 점 (시니어 구현 기록 기준, 명세 §14)

1. TAB 합산(§8.1 `TabSongService` 한 줄) → `TierService.requireTabBytes` 안에서 `fileBytes`·`fileBytesUsed`를 쓰도록 변경해 `TabSongService`는 무변경.
2. 경로 UUID 형식 오류는 기존 `parsePathUuid` 규칙대로 404(§12.2의 400 정정). 쿼리 `folder` 형식 오류는 400.
3. 커밋은 §11의 3개 대신 기능 커밋 1개(`c5b4dc1`)로 묶음(라우트 파일 1개에 세 묶음이 함께 있고 테스트가 서로를 참조).
4. `NoteFileValidatorTest.kt`를 별도 생성하지 않고 `NoteFileApiTest` NT1-U2(API 경유)로 확인했으며, 합산 한도 TAB 방향도 NT1-U3에 포함.
5. NT1-U5 세 번째 갈래(커밋 여부 확인 실패 시 보존)는 주입 수단이 없어 테스트 미작성(코드는 TB-1과 동일 구조). 대신 업로드 응답 유실(502 + 삭제)을 확인.

## 3. 전체 검증 결과 (주니어 4단계, 제품 코드·테스트 무수정, 2026-11-26 Mac)

| # | 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `./gradlew test --rerun-tasks` | **450 passed / 0 failed / 0 skipped** (`BUILD SUCCESSFUL in 50s`) | Testcontainers 포함 전체 Kotlin 단위·통합 테스트 통과 |

```text
# ./gradlew test --rerun-tasks (JUnit XML 집계)
TOTAL: tests=450, failures=0, errors=0, skipped=0
  ulevelp.db.DatabaseMigrationAndIntegrityTest: tests=10, failures=0, errors=0, skipped=0
  ulevelp.note.NoteApiTest: tests=21, failures=0, errors=0, skipped=0
  ulevelp.note.NoteFileApiTest: tests=9, failures=0, errors=0, skipped=0
  ulevelp.note.NoteSvgAndSchemaTest: tests=9, failures=0, errors=0, skipped=0
  ulevelp.note.NoteWorkspaceApiTest: tests=8, failures=0, errors=0, skipped=0
  ulevelp.song.TabSongApiTest: tests=17, failures=0, errors=0, skipped=0
BUILD SUCCESSFUL in 50s
```

- 참고: 시니어 표적 27건(`DatabaseMigrationAndIntegrityTest` 10 + `NoteWorkspaceApiTest` 8 + `NoteFileApiTest` 9) 및 영향 회귀 61건 모두 전체 실행 450건에 포함되어 통과를 재확인함.

## 4. 미실행 범위 및 운영 확인 항목

1. **운영 관리자 계정의 `profiles.role = owner` DB 확인 (사용자 몫):** 연결된 Supabase 계정에서 운영 프로젝트가 조회되지 않아 미확인. 사용자가 Supabase SQL 편집기에서 아래 쿼리로 확인 필요(미설정 시 일반 티어 한도 적용):
   ```sql
   SELECT p.role FROM profiles p JOIN users u ON u.id = p.id WHERE u.email = '<관리자 이메일>';
   ```
2. **Cloud Run 512MiB 메모리 관찰 (NT-2 출시 전):** 20MB 첨부 업로드는 서버 메모리(`ByteArray`)에 통째로 적재되므로 동시 업로드 시 메모리 압박이 발생할 수 있음. NT-2 실사용 전 관찰 후 필요 시 1GiB 이상으로 증설 권장.
3. **프런트엔드 검증(`npm test`, `npm run build`, Playwright E2E) 및 운영 배포:** NT-1은 서버 계약·구현 Step으로 프런트엔드 변경 없음(미실행). 머지·운영 배포는 사용자 확인 후 진행.
4. **NT1-U5 3번째 갈래 테스트:** 주입 수단 부재로 미실행(명세 §14 기록과 동일).

## 5. PR 및 CI · 리뷰 상태

- PR: [#73](https://github.com/choise-hun/doloop/pull/73) (`feat/NT-1-note-workspace` → `main`)
- CI (`afd4987`, `gh pr checks 73 --watch`): **6/6 성공** (`CI/Detect code changes` 5s, `CI/Test (Node 22)` 37s, `CI/Kotlin test (JDK 21)` 2m51s, `CI/Docker build & smoke test` 1m53s, `CI/E2E XSS & CSP (Playwright, spa)` 11m59s, `CI/CI ok` 4s).
- 리뷰 코멘트: `chatgpt-codex-connector[bot]` 코드 리뷰 완료(`afd4987`, `has_any_findings: false`, `has_unresolved_findings: false`), PR 리뷰·라인 코멘트 0건.
- 머지·운영 배포: 사용자 몫(미실행).
