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
| NT-1 서버 계약·구현 | 기능확장 §3.2·§4·D4~D8, 명세/TB-1 → [명세/NT-1](명세/NT-1_구현명세.md) → [결과/NT-1](결과/NT-1.md) | 명세 §3 N1~N10 승인 → V16·노트북·자료/블록 노트·첨부(업로드·Drive 참조·주소·삭제 정리)·주석(`rev`)·티어 한도·`/me` 사용량 구현, 명세 §12 Kotlin 테스트, PR CI 통과 | [시니어 직접 구현] → 주니어 4단계 | **구현·전체 회귀(450/450)·PR #73 CI 통과·리뷰 완료(머지 대기)** 2026-11-26 `feat/NT-1-note-workspace` | high |
| NT-2a 워크스페이스·업로드 | [명세/NT-2](명세/NT-2_구현명세.md) §4·§6·§7.1·§8.1 + [시안](명세/NT-2_시안.html) → `결과/NT-2a.md` | 노트북 목록(V1 B)·통합 그리드·AI 폼 접힘(V2 B)·노트북 CRUD·순서·자료 올리기(RE:DO·Drive, V7 A)·한도/무료 안내·AI 노트 이동, NT2A ★ 통과 → 전체 회귀·4폭 스크린샷·PR CI 통과 | [시니어 직접 구현] → 주니어 4단계 | **명세·시안 확정(2026-11-26), 구현 대기(PR #73 머지 뒤)** | high |
| NT-2b 뷰어·주석·캐시·CSP | 명세/NT-2 §5·§7.2·§8.2·§9 U1~U5 + NT-2a 결과 → `결과/NT-2b.md` | `note.html?doc=` 뷰어(V3 A)·pdfjs/이미지 캔버스·한 쪽씩(V4 A)·주석(V5 A·V6 A 토큰)·`rev` 합치기·기기 캐시(V8 A)·CSP 위반 0, NT2B ★ 통과 → 전체 회귀·PR CI 통과 | [시니어 직접 구현] → 주니어 4단계 | 대기(NT-2a 머지 뒤) | high |
| NT-3 Notion형 블록 에디터 | NT-1·NT-2 → 에디터 선택(Tiptap vs BlockNote, iOS WebView 키보드 검증) → `명세/NT-3_구현명세.md` → `결과/NT-3.md` | 시안 확정 → 블록 에디터·음악 블록(타임스탬프→PLAYER, 코드 다이어그램)·이미지 블록(NT-1 첨부)·`rev` 충돌 처리 | 명세 때 판정 | 대기(NT-2b 머지 뒤) | high |

- 대기능 NT는 **Step 4개(상한)**다: NT-1·NT-2a·NT-2b·NT-3. NT-2를 골디락스 상한(7 파일) 초과로 2a·2b로 나눴다(사용자 V9 승인, 2026-11-26). 더 나누지 않는다 — NT-3이 커지면 범위를 줄이거나 새 대기능으로 뺀다.

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
| 2026-11-26 | **확정** NT-2 시안 V1~V9 추천안 그대로: V1 B 왼쪽 노트북 목록, V2 B AI 폼 접힘 상자 유지(대표 필 `＋ 자료 올리기`), V3 A `note.html?doc=`(진입 페이지 무변경), V4 A 한 쪽씩, V5 A 펜·마우스=쓰기·손가락=이동(+`손가락으로 쓰기` 토글), V6 A 새 토큰 `--anno-*`·`--page-paper`, V7 A 올릴 때 저장 위치 선택, V8 A 캐시 계정별 20개·150MB, V9 NT-2a/2b 분할 | [명세/NT-2 §3](명세/NT-2_구현명세.md#3-사용자-결정-2026-11-26-확정--전부-추천안) · [시안](명세/NT-2_시안.html) |
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
- NT-2 시안·명세는 확정됐다(2026-11-26, 문서만 로컬 작성 — 커밋·push는 사용자 승인 뒤). 작성 시점에 PR #73은 **OPEN(미머지)**이었다.
- NT-2a 시니어 구현: PR #73 머지 확인 → `git switch main && git pull --ff-only` → `git switch -c feat/NT-2a-note-workspace-ui` → [명세/NT-2](명세/NT-2_구현명세.md) §4·§6·§7.1·§8.1(★ 표적) → 커밋·push(PR 없음) → 주니어 4단계. 명세의 서버 줄 번호는 `feat/NT-1-note-workspace` `5779a3b` 기준이라 머지 뒤 달라졌으면 맞춘다.
- NT-2b는 NT-2a 머지 뒤. 착수 전에 명세 §9 U1~U4(`pdfjs-dist` 버전·WASM·CSP·MIME)를 공식 문서로 확인한다. `'wasm-unsafe-eval'`이 필요하면 사용자에게 먼저 묻는다.
- `docs/NT-1-spec` 로컬 브랜치는 문서 초안만 있던 브랜치다(미커밋 변경은 구현 브랜치로 옮겨 커밋). 지워도 된다.
