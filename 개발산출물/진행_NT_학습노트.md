# NT 학습 노트 워크스페이스 진행

## 목표와 입력

- 목표: 기존 AI 영상 노트를 그대로 두고, 노트북(폴더) 안에서 ① AI 영상 노트 ② PDF/이미지 자료 노트(GoodNotes형 뷰어·가벼운 주석) ③ 직접 쓰는 블록 노트(Notion형 에디터)를 함께 관리한다(기능확장 D4).
- 근거 문서: [기능확장.md](../기능확장.md) §1 #5·#6, §3, §4.1~4.2, §5 2순위, §6 D4~D8 · [계획/상용_서비스_계획.md](../계획/상용_서비스_계획.md) §4 · [명세/TB-1](명세/TB-1_구현명세.md)(스토리지·한도 원형) · [.team_docs/rules/backend-kotlin.md](../.team_docs/rules/backend-kotlin.md)
- 선행: TB(악보 플레이어) 완료 — PR #71 머지(`65a3657`), 마감 정리 PR #72 머지(`8824cc4`). 기능확장 D1 "TB 완료 뒤 NT".
- 제외(대기능 전체): 노트 공유·커뮤니티 게시, AI PDF 요약(M2-5), 노트북 중첩, 텍스트 OCR. 폐기 기능 연동은 새 경로에 넣지 않는다.

## 기준 브랜치와 보존

- 명세 단계 브랜치: `docs/NT-1-spec`(base `main` `8824cc4`). 2026-11-26 착수 시 `main` 깨끗함, 열린 PR 0건, 활성 진행 파일 0건.
- 명세 단계는 문서만 만든다. 커밋·push·PR은 사용자 승인 뒤에 한다(이번 세션 미실행).

## Step 표

| Step | 입력 → 결과 | 완료 기준 | 담당 | 상태 | 권장 effort |
|---|---|---|---|---|---|
| NT-1 서버 계약·구현 | 기능확장 §3.2·§4·D4~D8, 명세/TB-1 → [명세/NT-1](명세/NT-1_구현명세.md) → `결과/NT-1.md` | 명세 §3 N1~N10 승인 → V16·노트북·자료/블록 노트·첨부(업로드·Drive 참조·주소·삭제 정리)·주석(`rev`)·티어 한도·`/me` 사용량 구현, 명세 §12 Kotlin 테스트, PR CI 통과 | [시니어 직접 구현] → 주니어 4단계 | **시니어 구현·표적 테스트 완료, push(PR 없음)** 2026-11-26 `feat/NT-1-note-workspace` → 주니어 4단계 대기(전체 회귀·PR·CI·`결과/NT-1.md`) | high |
| NT-2 GoodNotes형 화면 | NT-1 계약 → HTML 시안·`명세/NT-2_구현명세.md` → `결과/NT-2.md` | 시안 확정 → 노트북 목록·자료 노트 업로드(Supabase·Drive)·PDF(`pdfjs-dist`)/이미지 뷰어·주석(형광펜·펜 3~4색·지우개·텍스트 핀, Apple Pencil/터치 분리)·기기 캐시(계정 분리)·CSP 개정·보안 테스트 | 명세 때 판정 | 대기(NT-1 머지 뒤) | high |
| NT-3 Notion형 블록 에디터 | NT-1·NT-2 → 에디터 선택(Tiptap vs BlockNote, iOS WebView 키보드 검증) → `명세/NT-3_구현명세.md` → `결과/NT-3.md` | 시안 확정 → 블록 에디터·음악 블록(타임스탬프→PLAYER, 코드 다이어그램)·이미지 블록(NT-1 첨부)·`rev` 충돌 처리 | 명세 때 판정 | 대기(NT-2 머지 뒤) | high |

- 대기능 NT는 Step 3개다(협업 §1.2 권장 상한). NT-2가 골디락스 상한을 넘으면 NT-2 명세 때 한 번만 나눌 수 있다(최대 4). NT-1은 한 Step 유지를 추천(명세 N10).

## 단계별 실행 명령과 확인 기준

### NT-1 (승인 뒤)

```bash
git switch main && git pull --ff-only
git switch -c feat/NT-1-note-workspace
# 구현은 명세 §11 커밋 3개 순서
./gradlew test --tests 'ulevelp.db.DatabaseMigrationAndIntegrityTest' --tests 'ulevelp.note.*'   # 시니어 표적(★)
./gradlew test                                                                                    # 주니어 4단계 전체 회귀
```

- 확인 기준: 명세 §12.1 표 전부 통과, `GET /notes` 응답 호환(NT1-L1), 합산 총량(NT1-U3), 보상 정리 3갈래(NT1-U5).
- Mac 함정: Kotlin 증분 캐시가 깨지면 `./gradlew --stop`, `rm -rf build/kotlin build/classes`, `-Pkotlin.incremental=false`(인수인계 메모).

## 결정 기록

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-11-26 | **승인** NT-1 사용자 결정 N1~N10 추천안 그대로. 추가: N3·N4 한도는 관리자 계정에서 항상 해제(구현 = `role = owner` → `ownerLimits`). 내용: N1 새 테이블 `note_docs`, N2 무료 기본 노트북만, N3 15/30 평면, N4 30/1000/2000, N5 TAB과 합산 풀, N6 PDF·PNG·JPEG·WebP 20MB·노트당 20개, N7 Drive 참조 포함, N8 다운그레이드 데이터 유지, N9 `rev` 검사, N10 한 Step 커밋 3개 | [명세/NT-1 §3](명세/NT-1_구현명세.md#3-사용자-결정-승인-필요) |

## NT-1 확인·구현 기록 (2026-11-26 Mac Claude 시니어)

- U1 버킷 제한 Unset(50MB), U2 Cloud Run 512MiB·1vCPU·요청 32MB(2GiB까지 증설 가능), U3 운영 Postgres 17.11.0.003, U4 스케줄러 4개 ENABLED(일반 키 재시도 매분) — [명세 §13.1](명세/NT-1_구현명세.md#131-확인-결과-2026-11-26).
- 관리자 계정 확인 한계: 연결된 Supabase 계정에서 운영 프로젝트가 보이지 않아 사용자가 말한 관리자 이메일 계정의 `profiles.role`을 확인하지 못했다. 사용자가 SQL 편집기에서 `SELECT p.role FROM profiles p JOIN users u ON u.id = p.id WHERE u.email = '<관리자 이메일>';`로 `owner`인지 확인해야 한다(아니면 노트 한도가 적용된다).
- 구현: V16, `Tables.kt`, `TierService`(노트 한도·합산 `fileBytes`·`requireTabBytes` 합산), `ProfileService`(`/me` 사용량·계정 삭제 정리), `JsonInput.receiveJsonObjectLimited`, `NoteService.setFolder`·`folderId`, 새 `NoteFolderService`·`NoteDocService`·`NoteFileService`·`NoteFileValidator`·`NoteWorkspaceRoutes`, `NoteRoutes` 한 경로, `Main.kt` 배선. 명세와 다른 점은 [명세 §14](명세/NT-1_구현명세.md#14-구현-기록-2026-11-26-mac-claude-시니어-featnt-1-note-workspace).
- 표적 테스트: 새 27건(`NoteWorkspaceApiTest` 10·`NoteFileApiTest` 10 등) + 마이그레이션 테스트 통과, 영향 회귀 61건 통과. 전체 `./gradlew test`·PR·CI는 미실행(주니어 4단계).
- 운영 주의: 20MB 업로드는 서버 메모리에 통째로 올라간다. 512MiB에서 동시 업로드가 겹치면 부족할 수 있어 NT-2 출시 전 관찰 항목으로 둔다.

## 겪은 문제

- 기능확장.md §1·§3.2의 `Tables.kt` 줄 번호(`NotesTable` 171-191, `StorageTrashTable` 297-306)는 TB-1 뒤 밀렸다. 현재 `Tables.kt:181-201`, `:307-316`. NT 명세는 `main` `8824cc4` 기준 줄 번호를 쓴다.
- 기능확장 §3.2는 `notes` 테이블 확장(`video_id` nullable)을 적었지만, 코드 대조 결과 옛 앱·ZIP·태그 규칙 파급이 커서 새 테이블안(N1 A)을 추천으로 올렸다. 사용자 결정 전까지 둘 다 열려 있다.

## 다음 세션 시작 지시

- 주니어 4단계: `feat/NT-1-note-workspace`를 받아 전체 `./gradlew test` → main 대상 PR 생성 → `gh pr checks --watch` → 리뷰 확인 → `결과/NT-1.md` 작성 → 이 표의 NT-1 행 갱신. 제품 코드는 고치지 않고 실패는 시니어에게 인계한다.
- NT-1 머지 뒤 NT-2 시안 단계(HTML 시안·선택지 먼저, 프로젝트 규칙).
- `docs/NT-1-spec` 로컬 브랜치는 문서 초안만 있던 브랜치다(미커밋 변경은 구현 브랜치로 옮겨 커밋). 지워도 된다.
