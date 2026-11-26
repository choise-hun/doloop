# NT-2 구현 명세 — GoodNotes형 학습 노트 화면(노트북 목록 · 자료 업로드 · PDF/이미지 뷰어 · 주석 · 기기 캐시 · CSP)

> 작업: NT-2 (1단계 시니어 명세) | 진행 파일: [진행_NT_학습노트.md](../진행_NT_학습노트.md) Step 표 NT-2a·NT-2b 행
> 입력: [NT-1 명세](NT-1_구현명세.md) §5 API·§6 한도·§14 · [결과/NT-1](../결과/NT-1.md) · [기능확장.md](../../기능확장.md) §3.1·§3.3·§4.1·§4.3·§6 D4·D5·D8 · [시안](NT-2_시안.html) · `.team_docs/rules/frontend-design.md`·`frontend-layout.md`·`frontend-state.md`
> 기준: `feat/NT-1-note-workspace` `5779a3b`(PR #73 **미머지** — 이 명세의 서버 전제는 그 브랜치 기준. 머지 커밋이 달라지면 구현 착수 때 줄 번호만 다시 맞춘다) | 작성 2026-11-26 Mac Claude 시니어
> 상태: **시안 확정(2026-11-26)** — 사용자가 V1~V9 추천안을 모두 골랐다. 구현 착수 조건은 PR #73 머지.

## 1. 범위와 배정

| 항목 | 내용 |
| --- | --- |
| 포함 | NOTES 화면의 노트북 목록·통합 노트 그리드(AI 영상 노트 + 자료 노트), 노트북 만들기·이름·색·삭제·순서, 자료 올리기(RE:DO 저장공간·Google Drive), 한도·무료 안내, AI 노트 노트북 이동, `note.html?doc=` 자료 뷰어(PDF `pdfjs-dist`·이미지), 쪽 이동·확대, 주석(펜 4색·형광펜·지우개·텍스트 핀, 펜/손가락 분리), `rev` 충돌 합치기, 기기 캐시(계정 분리), pdfjs 자산·CSP 점검, i18n 3개 언어, 단위·E2E·레이아웃 테스트 |
| 제외 | 블록 노트 만들기·편집(NT-3 — 목록에서도 `kind = block`은 1차에 표시만 하고 만들기 진입점은 숨긴다), 서버 변경(NT-1 계약 그대로), 문서 썸네일(쪽 그림 미리보기), PDF 텍스트 선택·검색, AI PDF 요약(M2-5), 공유, 노트북 중첩, 오프라인 편집(연결 끊김 중 저장 대기열) |
| Step | **NT-2a** 워크스페이스·업로드(§4) → **NT-2b** 뷰어·주석·캐시·CSP(§5). NT 대기능은 NT-1·NT-2a·NT-2b·NT-3 = **4 Step(상한)** — 더 나누지 않는다(V9) |
| 배정 | 둘 다 **[시니어 직접 구현] → 주니어 4단계**(협업 §1.2 기본). 근거(배정 판정 ③): 2a는 계정 전환·요청 시퀀스·업로드 경합과 Drive 토큰 흐름, 2b는 pdfjs 워커·CSP·포인터 입력·`rev` 합치기·계정 분리 캐시라 고위험이다 |

## 2. 전제 표 (코드로 확인)

| P# | 전제 | 근거 |
| --- | --- | --- |
| P1 | NT-1 경로: `/note-folders`(GET·POST·`PUT /order`·PATCH·DELETE), `/note-docs`(GET `?folder=`·POST·GET/PATCH/DELETE `{id}`·`POST {id}/files` multipart·JSON Drive), `/note-files`(`{id}/url`·DELETE·`{id}/annotations` GET·PUT/DELETE `{page}`), `PUT /notes/{id}/folder` | `src/main/kotlin/ulevelp/routes/NoteWorkspaceRoutes.kt:66-269`, NT-1 명세 §5 |
| P2 | 상수: 단건 20MB·요청 21MB·노트당 파일 20·Drive 자기 신고 2GB, 제목 300자·본문 1MB·주석 쪽당 256KB·쪽 1~2000 | `NoteFileValidator.kt:26-29`, `NoteDocService.kt:347-352` |
| P3 | DTO: `NoteFolderDto{id,name,color,sortOrder,docCount,aiNoteCount,createdAt,updatedAt}`, `NoteDocSummaryDto{…fileCount, firstFile{id,mime}?}`, `NoteDocDetailDto{…body, files}`, `NoteFileDto{id,docId,storage,fileName,mime,sizeBytes,sortOrder,createdAt}`, `NoteAnnotationDto{page,data,rev,updatedAt}`. 프런트는 추측하지 않고 이 정의와 대조한다(frontend-state §5) | `NoteFolderService.kt:19-31`, `NoteDocService.kt:25-77`, `NoteFileService.kt:30-40` |
| P4 | 한도: `noteFolders` FREE 0/PRO 15/PRO_PLUS 30, `noteDocs` 30/1000/2000, `noteFiles` false/true/true, `fileBytes` 20MB/500MB/1GB, owner 모두 null(무제한). `/me` usage에 `noteFolders`·`noteDocs`·`noteFileBytes`·`fileBytes`가 붙는다 | `TierService.kt:36-79`, `:107-108` |
| P5 | 프런트 타입 `TierUsageDto`·`TierLimitsDto`에 위 칸이 **없다**(TAB 칸도 없다). NT-2a가 덧붙인다 | `frontend/src/lib/auth.ts:44-60` |
| P6 | 라우팅·진입 페이지: `notes.html`→`NotesPage`, `note.html`→`NoteDetailPage`(쿼리 `id`). 진입 목록은 App.tsx·`server.js` `SPA_PAGES`·`Main.kt` `SPA_ENTRY_PAGES`·`scripts/build-app-web.mjs` `APP_ENTRY_PAGES` 네 곳이 같아야 한다 → V3 A(`note.html?doc=`)라 **네 곳 무변경** | `frontend/src/App.tsx:54-66`, `NoteDetailPage.tsx:179`, `server.js:15`, `Main.kt:129-132`, `scripts/build-app-web.mjs:8-12` |
| P7 | 지금 NOTES 화면 구조: 분석 폼 `#form`, 작업 목록 `#jobs`, 노트 목록 `#notesList`·태그 필터 `#noteTagFilter`. 레이아웃 spec `test/e2e/layout/notes.spec.js`(119줄)가 이 구조를 본다 | `NotesPage.tsx:341`, `:497`, `:601`, `test/e2e/layout/notes.spec.js:88`, `:103` |
| P8 | 현행 CSP(meta, 모든 SPA 페이지 공통): `img-src 'self' data: https://i.ytimg.com`, `connect-src 'self' https://vefrfhafmiiivpgjhqiu.supabase.co https://www.googleapis.com`, `worker-src 'self'`, `font-src 'self' https://fonts.gstatic.com`, `script-src`에 `wasm-unsafe-eval` 없음. `test/security.test.js`가 원문을 단언한다 | `frontend/index.html:5`, `test/security.test.js:15-28` |
| P9 | 정적 자산 원형(TB-2): Vite 플러그인 `tabAssets()`가 개발 서버 미들웨어(`/at`)와 빌드 `emitFile('at/…')`로 패키지 파일을 같은 경로에 낸다(`publicDir: false`). Ktor 정적 서빙은 `mjs`→JavaScript, 그 밖 확장자는 `application/octet-stream` | `vite.config.ts:8-48`, `:50-53`, `Main.kt:441-455` |
| P10 | 기기 캐시 원형(TB-2): IndexedDB `ulp-tab-files`, 키 `[uid, songId]`, 저장 전후 `auth.getUser()?.id === uid` 확인, 계정별 최근 2개, 크기 불일치면 버림, App 최상위가 사용자 변경 때 `clearOtherTabAccounts(uid)` | `frontend/src/lib/tabFiles.ts:17-20`, `:42-57`, `:82-95`, `frontend/src/App.tsx:36-47` |
| P11 | 업로드 원형(TB-2): `FormData` + `account.apiFetch(..., { method:'POST', body, signal })`(진행률 없음), 오류 코드→문구 표 | `frontend/src/lib/apiClient.ts:751-755`, `frontend/src/components/practice/TabUploadDialog.tsx:17`, `:45` |
| P12 | Drive: `drive.ts`는 녹음 폴더 이름 `REDO 녹음` 고정(`ensureFolder`), `uploadBlob(blob, name, mime, folderId)`가 파일 ID를 돌려준다, `fetchMediaBlob(fileId)`로 내려받는다. 프로필 `storageProvider`(`supabase`/`drive`)·`driveFolderId` | `frontend/src/lib/drive.ts:6`, `:164`, `:231`, `:350`, `auth.ts:19-20` |
| P13 | 로그아웃 초기화: `signOut()`이 세대 토큰을 올리고 사용자 상태를 비운 뒤 알린다. 화면은 사용자 변경을 구독해 자기 상태·시퀀스를 비운다(frontend-state §1·§4) | `frontend/src/lib/auth.ts:352-376` |
| P14 | 디자인: 색은 토큰만(DR-4), 곡률 3종, 대표 필 버튼 화면당 1개, 글자 단계표(DR-6), 스파인 `--spine-width`. 토큰 추가는 세 블록(라이트·`[data-theme=dark]`·`prefers-color-scheme`) 모두 | `.team_docs/rules/frontend-design.md` §1~§3, `frontend/src/styles/tokens.css:11-85` |
| P15 | `pdfjs-dist`는 아직 의존성이 아니다(현재 dependencies: capacitor·alphatab·react-query·react·router) | `package.json:17-28` |

## 3. 사용자 결정 (2026-11-26 확정 — 전부 추천안)

| ID | 확정 | 내용 |
| --- | --- | --- |
| V1 | **B** | 961px 이상: 왼쪽 240px 노트북 목록(전체·노트북들·기본 노트북·파일 사용량 막대) + 오른쪽 노트 그리드. 960px 이하: 위 가로 칩 줄 |
| V2 | **B** | AI 영상 분석 폼은 위쪽 접힘 상자(`<details>`)로 유지(기존 id·e2e 유지). 대표 필 버튼은 **`＋ 자료 올리기`** 하나(메뉴 없음 — 블록 노트는 NT-3까지 숨김). 분석 중 작업은 한 줄 띠 + `작업 보기 →`(기존 `#jobs` 목록을 펼침) |
| V3 | **A** | 뷰어 주소 `note.html?doc=<id>&file=<fileId>&page=<n>`. `doc`이 있으면 `NoteDetailPage`가 자료 뷰어 컴포넌트를 그린다(`id`는 기존 AI 노트) |
| V4 | **A** | 한 쪽씩 넘기기(이전/다음·스와이프·←→·쪽 번호 입력). 현재 쪽 + 다음 쪽 1장만 미리 그린다 |
| V5 | **A** | 도구가 켜져 있으면 펜·마우스=쓰기, 손가락=이동·핀치 확대. `손가락으로 쓰기` 토글을 켜면 손가락도 쓰기 |
| V6 | **A** | 새 토큰 `--anno-ink`·`--anno-red`·`--anno-blue`·`--anno-green`·`--anno-hl`·`--page-paper`(세 블록 같은 값 — 종이는 다크에서도 밝다). 저장은 색 키(`ink`·`red`·`blue`·`green`·`yellow`) |
| V7 | **A** | 올릴 때마다 저장 위치 선택. 기본값은 프로필 `storageProvider`. Drive 미연결·무료면 Drive 칸 비활성 + 이유 문구. 20MB 초과 파일은 Drive만 허용 |
| V8 | **A** | IndexedDB `ulp-note-files`, 키 `[uid, fileId]`, 계정별 최근 **20개·합계 150MB** LRU. 계정 전환·로그아웃 때 다른 계정 항목 삭제, 파일·노트 삭제와 서버 404 때 즉시 삭제 |
| V9 | **NT-2a + NT-2b** | §1 Step 행 |

시안과 다른 점(확정 뒤 명세에서 정함): 업로드 진행 막대는 **진행률 없는 표시**(P11 `apiFetch` 재사용, XHR 추가 안 함). 시안 파일은 이에 맞춰 고쳐 두었다.

## 4. NT-2a — 워크스페이스·노트북·업로드

### 4.1 화면 구조 (`NotesPage.tsx`)

위에서 아래로: ① 제목줄(`NOTES` Light 24px + 보조 문구, 오른쪽 `＋ 노트북`(사각 `.ghostBtn`) · `＋ 자료 올리기`(`.pillBtn`, 화면의 유일한 필)) ② AI 분석 접힘 상자 — 기존 `#form` 내용 그대로를 `<details id="aiNoteBox">` 안에 넣는다. 노트가 0개면 기본 열림, 1개 이상이면 접힘 ③ 작업 띠 — 진행 중·실패 작업이 있을 때만, 누르면 기존 `#jobs` 목록 펼침 ④ 워크스페이스 — V1 B 2열(왼쪽 `nav#noteFolders`, 오른쪽 노트북 제목줄·종류 필터·`#notesList` 그리드).

- 선택한 노트북은 주소 `notes.html?folder=<uuid|none>`에 둔다(없으면 전체). 뒤로 가기로 돌아올 수 있게 `replaceState`가 아니라 `pushState`.
- 종류 필터: `전체 · AI 영상 · 자료`(블록은 NT-3에서 추가). 기존 태그 필터 `#noteTagFilter`는 `AI 영상` 필터일 때만 보인다(태그는 AI 노트 전용).
- 정렬: 최근 수정순(서버 `updated_at DESC`) 한 가지. AI 노트는 `createdAt`, 자료 노트는 `updatedAt`으로 합쳐 정렬한다.
- 노트 카드(`.ncard`): 왼쪽 스파인 = 노트북 색, 위 4:3 칸 = AI 노트는 YouTube 썸네일(기존 `thumb()`), 자료 노트는 형식 글자(`PDF`/`IMG`, `firstFile.mime` 기준, mono 24px), 아래 제목(16px)·종류 라벨(직각 태그)·`파일 n`·`Drive` 표시·상대 시각. 카드 전체가 링크(자료 → `note.html?doc=`, AI → `note.html?id=`). 카드 안 보조 행동(`⋯` → 노트북 이동·이름 바꾸기·삭제)은 글자 버튼.
- 왼쪽 목록 항목: 노트북 이름 + 개수(`docCount + aiNoteCount`), 선택 항목은 `--surface2` + 왼쪽 스파인. `전체`(모든 노트)·`기본 노트북`(`folder=none`)은 고정 항목. 아래 사용량 막대 `파일 저장 {used} / {limit}`(`/me` usage·limits `fileBytes`, owner·null이면 막대 없이 사용량만), 보조 문구 `TAB 악보 포함 · Drive는 제외`.
- 노트북 제목줄의 `이름 바꾸기 · 색 · 삭제`는 글자 버튼. 순서 바꾸기는 목록의 `↑ ↓` 글자 버튼(수정 모드 없이, `PUT /note-folders/order`로 전체 id 전송). 드래그는 1차 제외.
- 노트북 색 키(서버 `color` 칸, `^[a-z0-9-]{1,20}$`): `orange`→`--fill1`, `slate`→`--fill2`, `sage`→`--fill3`, 없음(null)→`--seam-hairline`. 새 토큰 없음.

### 4.2 데이터 흐름

- 처음 그리기: `GET /me`(기존) + `GET /note-folders` + `GET /notes`(기존) + `GET /note-docs`(folder 쿼리 없이 전부)를 병렬로 받고, 노트북 선택·종류 필터는 **클라이언트에서** 거른다(노트 수 상한 2000 + AI 노트 — 한 번에 받아도 된다. 서버 `?folder=`는 쓰지 않는다).
- 모든 목록 요청은 frontend-state §1의 `uid + seq` 캡처로 지연 응답을 버린다. 사용자 변경 구독에서 목록·선택 노트북·열린 대화상자 상태를 비우고 시퀀스를 올린다(§4).
- 쓰기 뒤에는 서버 응답으로 해당 항목만 바꾸고, 노트북 개수는 `GET /note-folders`를 다시 받는다(개수는 서버가 센다).
- `apiClient.ts`에 함수·타입 추가(이름 고정): `listNoteFolders`, `createNoteFolder`, `updateNoteFolder`, `reorderNoteFolders`, `deleteNoteFolder`, `listNoteDocs`, `createNoteDoc`, `getNoteDoc`, `updateNoteDoc`, `deleteNoteDoc`, `uploadNoteFile`, `registerDriveNoteFile`, `getNoteFileUrl`, `deleteNoteFile`, `setNoteFolder`(AI 노트), `listNoteAnnotations`, `putNoteAnnotation`, `deleteNoteAnnotation`(뒤 셋은 NT-2b가 쓴다 — 타입과 함께 2a에서 한 번에 넣는다). 타입 `NoteFolderDto`·`NoteDocSummaryDto`·`NoteDocDetailDto`·`NoteFileDto`·`NoteFileUrlDto`(supabase/drive 합집합)·`NoteAnnotationDto`. `NoteSummaryDto`에 `folderId?: string | null`.
- `auth.ts` `TierUsageDto`에 `noteFolders?`·`noteDocs?`·`noteFileBytes?`·`fileBytes?`, `TierLimitsDto`에 `noteFolders?`·`noteDocs?`·`noteFiles?`·`fileBytes?`(모두 선택 칸 — 옛 서버 응답에도 깨지지 않게).

### 4.3 자료 올리기 대화상자 (`components/notes/NoteUploadDialog.tsx`)

1. 파일 고르기(끌어 놓기 + 버튼, `accept=".pdf,.png,.jpg,.jpeg,.webp"`, 여러 개 선택 가능 — 노트 하나에 최대 20개).
2. 제목(기본값 = 첫 파일 이름에서 확장자 뺀 것, 1~300자), 노트북(기본 = 지금 선택한 노트북, `전체`면 기본 노트북).
3. 저장 위치(V7): `RE:DO 저장공간`(남은 용량 표시) / `내 Google Drive`(`REDO 학습자료` 폴더). 비활성 조건과 문구: 무료(`limits.drive = false`) `PRO부터 쓸 수 있습니다`, Drive 미연결 `설정에서 Drive를 연결하세요 →`. 20MB 초과 파일이 있으면 RE:DO 칸 비활성 + `20MB를 넘는 파일은 Drive에만 저장할 수 있습니다`.
4. 클라이언트 사전 검사(서버가 최종 판정): 확장자·`file.type`이 허용 4종, 크기 > 0, RE:DO면 20MB 이하·남은 용량 이하, 파일 수 ≤ 20. 실패하면 그 파일 줄에 오류 문구, 올리기 버튼 비활성.
5. 올리기: `POST /note-docs {kind:"document", title, folderId}` → 파일마다 순서대로 RE:DO면 `uploadNoteFile`(multipart 파트 이름 `file`), Drive면 `drive.uploadBlob(file, file.name, mime, 학습자료 폴더 id)` → `registerDriveNoteFile({storage:"drive", storageKey, fileName, mime, sizeBytes})`. 진행 표시는 `n / 전체 파일 · 이름` + 진행률 없는 막대.
6. 실패 처리: 첫 파일부터 실패하면 방금 만든 빈 노트를 `DELETE`(보상)하고 오류를 보인다. 일부 성공이면 노트를 남기고 `파일 n개 중 m개를 올렸습니다` + 실패 파일 목록. Drive에 올린 뒤 서버 등록이 실패하면 `drive.deleteFile(fileId)`로 지운다(녹음 Drive 업로드와 같은 정리 — `drive.ts:149`).
7. 닫기·사용자 변경·언마운트면 `AbortController`로 진행 중 요청을 끊고, 끝난 응답은 `uid + seq`가 다르면 버린다.
8. 성공하면 대화상자를 닫고 새 노트를 그리드 맨 앞에 넣은 뒤 `/me`를 다시 받는다(사용량 막대).

오류 코드 → 문구(i18n 키 `notes.upload.err.*`):

| 코드 | 문구(ko) |
| --- | --- |
| `TIER_UPGRADE_REQUIRED` (feature `note_files`·`drive`·`note_folders`) | PRO부터 쓸 수 있습니다 + `요금제 보기 →` |
| `NOTE_DOC_LIMIT_EXCEEDED` / `NOTE_FOLDER_LIMIT_EXCEEDED` | 노트(노트북)는 {limit}개까지 만들 수 있습니다{nextTier 있으면: · {nextTier}는 {nextLimit}개} |
| `NOTE_FILE_COUNT_EXCEEDED` | 노트 하나에 파일은 20개까지입니다 |
| `NOTE_FILE_TOO_LARGE` | RE:DO 저장공간에는 20MB 이하만 올릴 수 있습니다. 큰 파일은 Drive에 저장하세요 |
| `FILE_QUOTA_EXCEEDED` | 파일 저장 한도({limit})를 넘습니다. 지금 {used} 사용 중 · 이 파일 {size}. Drive에 저장하거나 다른 첨부·TAB 악보를 지우면 올릴 수 있습니다 + `Drive에 저장` 버튼(조건 충족 시) |
| `INVALID_NOTE_FILE` | PDF·PNG·JPEG·WebP 파일만 올릴 수 있습니다 |
| `STORAGE_UNAVAILABLE` / `STORAGE_ERROR` | 지금 파일을 저장할 수 없습니다. 잠시 뒤 다시 시도하세요 |

- TAB 업로드의 `TAB_QUOTA_EXCEEDED` 문구는 NT-1 §8.3대로 `파일 저장 한도`로 바꾸고 `usedBytes`가 합산임을 알린다(`TabUploadDialog.tsx:17` 키의 ko·en·ja 문구만 변경, 코드 무변경).

### 4.4 Drive 학습자료 폴더

- `drive.ts`의 `ensureFolder`를 폴더 이름 인자를 받도록 넓힌다: `ensureFolder(preferredId, name = DRIVE_FOLDER_NAME)`. 새 상수 `DRIVE_NOTES_FOLDER_NAME = 'REDO 학습자료'`(i18n-keep 주석). 기존 녹음 호출은 인자 없이 그대로.
- 학습자료 폴더 id는 서버에 저장하지 않고 `localStorage` `ulp:drive-notes-folder:<uid>`에 기억한다(없거나 휴지통이면 다시 찾기·만들기). `security.test.js` (g) 접두어 `ulp:` 규칙 안.

### 4.5 무료·다운그레이드·관리자

- 무료(`limits.noteFiles = false`): `＋ 자료 올리기` 필과 `＋ 노트북`에 `· PRO` 표시, 누르면 업로드 대신 안내 대화상자(요금제 링크 `settings.html#plan` — 실제 앵커는 구현 때 `SettingsPage.tsx`에서 확인). 그리드 위에 안내 띠 한 줄(시안 `노트 목록 (무료)`). 왼쪽 목록은 `전체`·`기본 노트북`만.
- 다운그레이드(N8): 남은 노트북·자료 노트는 그대로 보이고 열람·이름 바꾸기·삭제·노트북 이동이 된다. 새로 만들기만 안내 대화상자.
- owner: `limits`가 null이면 한도 문구·`· PRO` 표시 없음, 사용량 막대 대신 사용량 숫자만.

### 4.6 AI 노트 노트북 이동

- 카드 `⋯` → `노트북으로 이동` → 노트북 목록 선택 상자 → `PUT /notes/{id}/folder` 또는 `PATCH /note-docs/{id} {folderId}`. 이동 대상 목록에 `기본 노트북`(null) 포함.

## 5. NT-2b — 자료 뷰어·주석·캐시·CSP

### 5.1 화면 (`note.html?doc=` → `components/notes/DocViewer.tsx`)

- `NoteDetailPage`는 `q.get('doc')`이 있으면 `DocViewer`만 그리고 기존 AI 노트 코드를 타지 않는다(`id`가 함께 있으면 `doc` 우선).
- 위 막대: `← {노트북 이름}`(목록으로, `notes.html?folder=`) · 제목(누르면 이름 바꾸기) · `파일 추가`(NT-2a 대화상자를 이 노트 대상으로) · `⋯`(노트북 이동·노트 삭제·이 기기 사본 지우기).
- 파일 칩 줄: 파일이 2개 이상일 때만. `n · 이름 (쪽 수)`(쪽 수는 PDF를 연 뒤에만 안다 — 열기 전에는 이름만). 칩 `⋯`로 파일 삭제.
- 도구 막대(위 고정, `--panel-frosted`): `보기` · `펜` · `형광` · `지우개` · `메모` | 색 4개(펜일 때만, 형광은 노랑 고정) | `↶` `↷` | `손가락으로 쓰기`(터치 기기에서만 보임) | 저장 상태(`저장됨 · 방금` / `저장 중…` / `저장 안 됨 — 다시 시도`).
- 무대: 쪽 1장(V4 A), 아래 쪽 이동 줄 `‹ 이전 · [3] / 12 · 다음 ›` + 확대 `－ 맞춤·n% ＋` + `전체 화면`(Fullscreen API 지원 기기만).
- 390px: 도구 막대가 두 줄이 되는 것을 허용한다(시안 캡처 확인). 색 4개는 한 줄에 유지.
- 상태: 불러오는 중(기기 사본이 있으면 즉시), 오류 — `파일을 찾을 수 없습니다`(404), `Drive 연결이 끊겼습니다 · 다시 연결`(Drive 토큰 실패), `이 PDF를 열 수 없습니다`(pdfjs 파싱 실패 → 그 파일 캐시 삭제).

### 5.2 렌더링

- **PDF**: `pdfjs-dist`(정확한 버전은 §9 U1). `getDocument({ data: bytes, isEvalSupported: false, disableFontFace: <U3 결과>, cMapUrl: '/pdf/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf/standard_fonts/', wasmUrl: <U2 결과> })`. 워커는 `GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs'`(같은 출처 → 현행 `worker-src 'self'`). 텍스트 레이어·pdfjs 주석 레이어·폼 렌더는 **쓰지 않는다**(Canvas만).
- 캔버스 크기 = 쪽 CSS 크기 × `devicePixelRatio` × 확대율, 단 픽셀 수 상한 **16,000,000**(iOS 캔버스 한도) — 넘으면 해상도를 낮춘다. 그린 뒤 이전 쪽 캔버스는 `width = height = 0`으로 비우고 `page.cleanup()`. 문서를 닫을 때 `pdf.destroy()`(TB-0 메모리 교훈).
- 확대: 맞춤(쪽 폭을 무대 폭에) 기본, 50~300%. 핀치·`Ctrl+휠` 중에는 CSS `transform`으로 키우고 손을 뗀 뒤 200ms에 다시 그린다.
- **이미지**: `createImageBitmap(blob)` → 캔버스에 그린다(`<img src="blob:">`를 쓰지 않아 `img-src` 무변경). 이미지는 `page = 1` 한 쪽.
- 다음 쪽 미리 그리기 1장. 렌더 작업은 쪽 바뀜·파일 바뀜·언마운트 때 `renderTask.cancel()`.

### 5.3 주석 데이터 (`note_annotations.data`, 쪽 하나)

```json
{ "v": 1,
  "strokes": [ { "id": "s_<8자>", "t": "pen", "c": "red", "w": 0.004, "p": [0.1234, 0.2345, 0.1301, 0.2399] } ],
  "pins":    [ { "id": "n_<8자>", "x": 0.80, "y": 0.20, "text": "셋째 마디 텐션 9" } ] }
```

- 좌표는 쪽 폭·높이 대비 0..1, 소수 4자리. `w`는 쪽 폭 대비(펜 0.002~0.006, 형광 0.018 고정). `t ∈ {pen, hl}`, `c ∈ {ink, red, blue, green, yellow}`(형광은 `yellow`). 핀 메모 1~500자, 핀 번호는 배열 순서.
- 그리기 레이어는 쪽 위 SVG(`viewBox="0 0 1 {높이/폭}"`), 색은 `var(--anno-*)`, 형광은 `opacity 0.45`·`mix-blend-mode: multiply`.
- 획을 끝낼 때 Ramer–Douglas–Peucker(허용 0.0015)로 점을 줄인다. 저장 전 직렬화 크기가 **250KB**(서버 256KB에서 여유)를 넘으면 그 획을 넣지 않고 `이 쪽에는 더 그릴 수 없습니다(주석이 너무 큼)`를 띄운다.
- 지우개는 **획 단위**(닿은 획 전체 삭제). 핀은 누르면 메모 팝오버(수정·삭제). `메모` 도구로 빈 곳을 누르면 새 핀.
- 되돌리기·다시: 쪽마다 동작 기록(추가·삭제·핀 수정) 50개. 쪽을 바꾸면 기록을 비운다.

### 5.4 입력 분리 (V5 A)

- 판정: 도구가 `보기`가 아니고 (`pointerType === 'pen'` 또는 `'mouse'` 또는 (`'touch'` 이고 `손가락으로 쓰기` 켬))이면 쓰기 → `setPointerCapture` + `preventDefault`. 그 밖 손가락은 이동(무대 스크롤)·두 손가락 핀치.
- 펜이 닿아 있는 동안 들어온 `touch` 포인터는 무시한다(손바닥 오입력).
- 그리기 레이어 `touch-action`: `손가락으로 쓰기` 꺼짐 = `pan-x pan-y`(손가락 스크롤은 브라우저, 핀치는 직접 처리), 켜짐 = `none`. iPad에서 펜이 스크롤을 일으키면 `touchstart`(passive: false)에서 `touches[0].touchType === 'stylus'`일 때 `preventDefault`(§9 U5).
- `pointercancel`이면 그리던 획을 버린다. `getCoalescedEvents()`가 있으면 쓴다.

### 5.5 저장과 `rev` 충돌 합치기

- 쪽마다 `{rev, data, pending: Op[]}`를 들고 있는다. 파일을 열 때 `GET /note-files/{id}/annotations`로 모든 쪽을 받는다(없는 쪽 `rev = 0`).
- 저장 시점: 마지막 동작 뒤 **1.2초** 디바운스, 쪽·파일 바꿀 때, `visibilitychange: hidden`일 때 즉시. 한 쪽에 저장 요청은 한 번에 하나(진행 중이면 끝난 뒤 다시).
- `PUT /note-files/{fileId}/annotations/{page} {data, rev}` 성공 → `rev` 갱신, `pending` 비움. 쪽의 획·핀이 모두 지워졌으면 `DELETE …/{page}`.
- **409 `NOTE_REV_CONFLICT`**: 목록을 다시 받아 그 쪽의 서버 `data`·`rev`를 얻고, 내 `pending` 동작(`add stroke`·`remove id`·`upsert pin`·`remove pin`)을 서버 data 위에 다시 적용해 새 `rev`로 PUT. 최대 2번 재시도, 그래도 실패하면 `저장 안 됨 — 다시 시도`. 합친 경우 한 줄 알림 `다른 기기에서 이 쪽을 고쳤습니다. 그쪽 변경 위에 지금 그린 내용을 합쳐 저장했습니다.`(시안 상태 `뷰어 · 다른 기기 변경 합침`).
- 413 `NOTE_ANNOTATION_TOO_LARGE`: 마지막 동작을 되돌리고 §5.3 문구. 404: 파일이 지워진 것 → 캐시 삭제·목록으로 안내.
- 저장 요청도 `uid + seq` 검사. 사용자 변경 때 `pending`을 버리고(다른 계정으로 저장하지 않는다) 화면을 닫는다.

### 5.6 기기 캐시 (`frontend/src/lib/noteFiles.ts`, V8 A)

- `tabFiles.ts` 구조를 그대로 따른다(P10): DB `ulp-note-files` v1, 저장소 `files`, 키 `[uid, fileId]`, 항목 `{uid, fileId, bytes, sizeBytes, mime, used}`.
- `fetchNoteFileBytes(uid, file: NoteFileDto, signal)`: 캐시 적중(크기·mime 같음)이면 바로 반환하고 `used`만 갱신. 아니면 `GET /note-files/{id}/url` → supabase면 주소 출처가 Supabase 프로젝트인지 확인(`tabFiles.ts` `validateMeta`와 같은 검사) 후 `fetch`, drive면 `drive.fetchMediaBlob(storageKey)`. 받은 바이트 길이 ≠ `sizeBytes`면 저장하지 않는다(Drive는 자기 신고 크기라 다르면 **표시는 하되** 캐시만 안 한다).
- 저장: 같은 uid 항목 중 `used` 오래된 것부터 지워 **20개·150MB** 안으로. 150MB를 혼자 넘는 파일은 캐시하지 않는다.
- 지우기: `clearOtherNoteAccounts(uid)`(App.tsx `clearOtherTabAccounts` 옆에서 같이 호출), `evictNoteFile(uid, fileId)`(파일 삭제·404·파싱 실패), `evictNoteDoc(uid, fileIds)`(노트 삭제), `⋯ › 이 기기 사본 지우기`.
- 모든 읽기·쓰기 콜백에서 `auth.getUser()?.id === uid && !signal.aborted`를 다시 본다.

### 5.7 자산과 CSP

- Vite 플러그인 `pdfAssets()`(`tabAssets()`와 같은 모양, P9): `pdfjs-dist`의 `build/pdf.worker.min.mjs`·`cmaps/*`·`standard_fonts/*`·(U2에 따라) `wasm/*`·`LICENSE`를 개발 미들웨어 `/pdf`와 빌드 `emitFile('pdf/…')`로 낸다. 앱 번들(`dist-app/`)은 `dist/`를 복사하므로 따라간다.
- Ktor·`server.js`는 `.bcmap`·`.pfb`·`.wasm`을 `application/octet-stream`으로 준다(P9). `.wasm`을 `WebAssembly.instantiateStreaming`으로 읽어야 하면 `application/wasm` MIME 한 줄 추가가 필요하다(U2).
- **CSP 기본안: 변경 없음.** 이미지는 캔버스로 그리고(§5.2), 워커·자산은 같은 출처, 서명 주소·Drive는 기존 `connect-src` 안이다. 아래가 확인되면 그때만 최소로 바꾸고 `test/security.test.js` `SPA_CSP`와 함께 고친다:
  - U2에서 pdfjs가 WASM 디코더를 필수로 쓰면 → `script-src`에 `'wasm-unsafe-eval'` 추가는 **보안 정책 변경이라 사용자에게 먼저 묻는다**(대안: 해당 이미지 형식(JPX·JBIG2) PDF는 그 쪽만 빈 칸 + 안내).
  - U3에서 pdfjs 글꼴이 막히면 → `disableFontFace: true`로 우회(CSP 무변경)를 먼저 쓴다.
- 업로드 XSS 방어는 서버 형식 검사(NT-1 §5.4) + Canvas 렌더 + octet-stream 저장으로 이미 닫혀 있다. 프런트는 파일 이름을 텍스트 노드로만 넣는다(`dangerouslySetInnerHTML` 금지 — security.test (c) 규칙).

## 6. 배치 약속 (`data-align-group`, frontend-layout 순서 ①)

| 화면 | 그룹 | 폭 |
| --- | --- | --- |
| NOTES 제목줄 | `notesTitle:center-y`(기존) — 제목·`＋ 노트북`·`＋ 자료 올리기` | 전 폭 |
| 워크스페이스 2열 | `notesWs:top` — 왼쪽 목록 윗선 = 노트북 제목줄 윗선 | `@961` |
| 노트 그리드 | `noteCards:top,bottom` — 한 줄 카드의 윗선·아랫선(높이 같음) | 전 폭 |
| 뷰어 막대 | `docBar:center-y` — 뒤로·제목·`파일 추가`·`⋯` | 전 폭 |
| 도구 막대 | `docTools:center-y` — 도구·색·되돌리기·저장 상태 | `@601` |
| 쪽 이동 줄 | `docPager:center-y` | 전 폭 |

폭 4개(390·768·1150·1280) 스크린샷 + 다크 모드로 Q1~Q9를 본다(뷰어는 `종이는 밝음` 확인 포함).

## 7. 바꿀 파일

### 7.1 NT-2a (약 13개 — 골디락스 상한 7 초과, 사용자 V9 승인 범위)

| 구분 | 파일 |
| --- | --- |
| 화면 | `frontend/src/pages/NotesPage.tsx`·`NotesPage.module.css`, 새 `frontend/src/components/notes/NoteFolderNav.tsx`·`NoteUploadDialog.tsx`·`NoteCard.tsx`(+ 각 `.module.css` 하나로 묶은 `notes.module.css`) |
| 라이브러리 | `frontend/src/lib/apiClient.ts`(함수·타입), `frontend/src/lib/auth.ts`(한도 타입 칸), `frontend/src/lib/drive.ts`(`ensureFolder` 이름 인자) |
| 문구 | `frontend/src/lib/i18n/ko.mts`·`en.mts`·`ja.mts`(`notes.ws.*`·`notes.upload.*`·`tab.quota` 문구) |
| 테스트 | `test/e2e/layout/notes.spec.js`(배치 약속·상태), 새 `test/e2e/notes-workspace.spec.js`(가짜 API), 새 `test/nt2a_note_upload.test.js`(사전 검사·오류 문구 순수 함수) |

### 7.2 NT-2b (약 12개)

| 구분 | 파일 |
| --- | --- |
| 화면 | `frontend/src/pages/NoteDetailPage.tsx`(분기 몇 줄), 새 `frontend/src/components/notes/DocViewer.tsx`·`AnnotationLayer.tsx`·`DocViewer.module.css` |
| 라이브러리 | 새 `frontend/src/lib/pdfDoc.ts`(pdfjs 래퍼·렌더 취소·메모리 정리), 새 `frontend/src/lib/annotations.mts`(데이터 모양·RDP·동작 적용·합치기 순수 함수), 새 `frontend/src/lib/noteFiles.ts`(캐시), `frontend/src/App.tsx`(`clearOtherNoteAccounts` 한 줄) |
| 설정·디자인 | `package.json`·`package-lock.json`(`pdfjs-dist`), `vite.config.ts`(`pdfAssets()`), `frontend/src/styles/tokens.css`(V6 토큰 6개 × 3블록), (U2·U3 결과에 따라) `frontend/index.html`·`test/security.test.js`·`Main.kt`/`server.js` MIME 한 줄 |
| 문구 | i18n 3개 파일 `notes.viewer.*` |
| 테스트 | 새 `test/nt2b_annotations.test.js`, 새 `test/e2e/note-viewer.spec.js`, 새 `test/e2e/layout/note-viewer.spec.js`, `test/design_rules.test.js`는 무변경(새 토큰이 tokens.css에만 있으면 통과해야 한다) |

## 8. 검증과 수용 기준

### 8.1 NT-2a

| ID | 확인 |
| --- | --- |
| NT2A-L1 ★ | `layout/notes.spec.js`: 4폭 G0~G8 통과, `notesWs:top@961`, 960 이하 칩 줄, 필 버튼 1개(Q1) |
| NT2A-W1 ★ | 가짜 API: 노트북 3개·AI 노트 2·자료 노트 3 → `전체` 5개 카드, 노트북 선택 시 그 노트만, `?folder=none` 기본 노트북, 뒤로 가기 복원 |
| NT2A-W2 | 노트북 만들기·이름·색·삭제·↑↓(`PUT order`에 전체 id), 삭제 뒤 그 노트들이 기본 노트북으로 |
| NT2A-U1 ★ | 업로드: 노트 생성 → 파일 2개 multipart → 그리드 맨 앞, `/me` 다시 받음. 첫 파일 실패 → 빈 노트 DELETE(보상) |
| NT2A-U2 | 사전 검사: `.svg`·0바이트·21MB(RE:DO)·21번째 파일 거부, 21MB는 Drive면 허용 |
| NT2A-U3 | 오류 코드 7종 → §4.3 문구(i18n 3개 언어 키 존재) |
| NT2A-V1 | Drive: 학습자료 폴더에 올림 → `registerDriveNoteFile` 본문 모양, 서버 등록 실패 시 `drive.deleteFile` 호출 |
| NT2A-T1 ★ | 무료 `/me` → 필·노트북 버튼 `· PRO`, 누르면 안내(업로드 요청 0건). owner(한도 null) → 한도 문구 없음 |
| NT2A-R1 ★ | 사용자 A→B 전환: 목록 요청을 붙잡은 채 전환 → A 응답 버림, B 목록만. 열린 업로드 대화상자 닫힘 |
| NT2A-X1 | 기존 AI 노트 흐름 회귀: 분석 폼 제출·재시도·태그 필터(`notes.spec.js` 기존 단언 유지, 접힘 상자 열기만 추가) |

### 8.2 NT-2b

| ID | 확인 |
| --- | --- |
| NT2B-A1 ★ | `annotations.mts` 순수 함수: RDP가 점을 줄이고 끝점 유지, 동작 재적용 합치기(서버가 획 X 추가 + 내가 획 Y 추가 → 둘 다, 내가 지운 획은 지움, 서버가 지운 획을 내가 지우면 무시), 250KB 초과 판정 |
| NT2B-V1 ★ | 가짜 API + 작은 PDF 픽스처(2쪽): `note.html?doc=` 열림, 쪽 넘김·쪽 입력·`page` 쿼리 반영, 이미지 파일 표시 |
| NT2B-P1 ★ | 입력 분리: `pointerType: 'pen'`·`mouse` → 획 생성, `touch` → 획 없음, 토글 켬 → `touch`도 획. 펜 누른 동안 `touch` 무시 |
| NT2B-S1 ★ | 저장: 1.2초 디바운스 뒤 PUT 1번, 409 응답 → 목록 다시 받음 → 합친 data로 새 `rev` PUT, 알림 표시. 2번 연속 409 뒤 `저장 안 됨` |
| NT2B-C1 ★ | 캐시: 두 번째 열기에서 서명 주소·파일 요청 0건, A→B 전환 뒤 A 항목 없음, 파일 삭제 → 항목 없음, 21번째 파일·150MB 초과 시 오래된 것부터 삭제 |
| NT2B-C2 | 지연 응답: 파일 A 로딩 중 파일 B로 바꾸면 A 바이트가 화면·캐시에 들어가지 않는다 |
| NT2B-Z1 ★ | CSP: 빌드 산출물로 뷰어를 열 때 콘솔 CSP 위반 0건(`securitypolicyviolation` 수집), 워커가 `/pdf/pdf.worker.min.mjs`에서 뜬다 |
| NT2B-L1 | `layout/note-viewer.spec.js`: 4폭 G0~G8, `docTools:center-y@601`, 390에서 쪽이 무대 안(시안에서 잡은 잘림 회귀) + 다크 모드 종이 밝음 |
| NT2B-M1 | 메모리(사람 확인): iPad에서 30쪽 PDF를 끝까지 넘기고 파일 3개를 오간 뒤 Safari 메모리 경고 없음 — 결과 파일에 기기·버전 기록, 실기기 없으면 출시 전 관문으로 넘긴다(TB R1과 같은 처리) |

★ = 시니어 표적 테스트. 나머지와 전체 회귀(`npm run build` · `npm test` · `npx playwright test` · `LAYOUT_SHOTS=1` 4폭 스크린샷 Q1~Q9)는 주니어 4단계.

## 9. 미확인 (구현 착수 전에 공식 문서·패키지로 확인)

| ID | 확인할 것 | 방법 | 결과에 따른 처리 |
| --- | --- | --- | --- |
| U1 | `pdfjs-dist` 최신 안정 버전, 라이선스(Apache-2.0), 패키지 안 워커·cmaps·standard_fonts 경로, 지원 브라우저 하한이 iOS 15.x WKWebView(앱 최소 지원)를 포함하는가 | npm 패키지 정보 + pdf.js 공식 저장소 README·릴리스 노트 | 하한이 안 맞으면 `legacy/` 빌드 사용 |
| U2 | 그 버전이 WASM 디코더(OpenJPEG·JBIG2 등)를 쓰는가, `wasmUrl` 옵션, WASM 실패 시 JS 대체 여부 | 릴리스 노트·`getDocument` API 문서 | 필수면 `'wasm-unsafe-eval'`을 사용자에게 묻는다(§5.7) |
| U3 | `isEvalSupported: false`·FontFace 로딩이 현행 CSP(`style-src` 해시만, `font-src 'self' fonts.gstatic`)에서 위반 없이 되는가 | 구현 첫 표적 테스트 NT2B-Z1에서 실측 | 위반이면 `disableFontFace: true` |
| U4 | `tabAssets()`처럼 개발 서버에서 `.bcmap`·`.wasm` MIME이 맞는가, Ktor `Main.kt:441-455`·`server.js` MIME 표에 `wasm`이 필요한가 | 표적 테스트 | 필요하면 MIME 한 줄 |
| U5 | iPad Safari·WKWebView에서 `touch-action: pan-x pan-y` 레이어 위의 Apple Pencil 입력이 스크롤을 일으키는가 | 실기기(사용자) — 없으면 시뮬레이터 + 출시 전 관문 | `touchType === 'stylus'` 방어 적용 여부 |
| U6 | 운영 Cloud Run 512MiB에서 20MB 업로드 동시성(NT-1 §13.1 U2 관찰 항목) | NT-2a 배포 뒤 Cloud Run 메모리 지표(사람) | 부족하면 1GiB 증설 제안 |

## 10. 구현 순서와 Git (PR #73 머지 뒤)

1. **NT-2a** 브랜치 `feat/NT-2a-note-workspace-ui`(base `main`): §6 배치 약속 → `layout/notes.spec.js` 실패 확인 → 구현 → 표적 ★ 통과 → 커밋 `feat(NT-2a): 학습 노트 워크스페이스·노트북·자료 올리기` → push(PR 없음) → 주니어 4단계(전체 회귀·4폭 스크린샷·PR·CI·`결과/NT-2a.md`).
2. **NT-2b** 브랜치 `feat/NT-2b-doc-viewer`(NT-2a 머지 뒤 `main`에서): U1~U4 확인 → 의존성 추가 커밋 → 뷰어·주석·캐시 구현 → 표적 ★ → 커밋 `feat(NT-2b): 자료 뷰어·주석·rev 합치기·기기 캐시` → push → 주니어 4단계(`결과/NT-2b.md`, NT2B-M1 기록). NT-2b 마지막에 NT-3 착수 조건만 진행 파일에 적는다(NT는 NT-3이 남아 완료 이동하지 않는다).

- 금지: 서버 계약 변경(필요해 보이면 멈추고 묻는다), 블록 노트 만들기 진입점, 토큰 밖 색, 새 라이브러리(`pdfjs-dist` 외).

## 11. 구현 기록 (NT-2a, 2026-11-27 Mac Claude 시니어 · `feat/NT-2a-note-workspace-ui` `1b845d4`)

### 11.1 착수 확인

- PR #73 머지 확인(`3736831`, 2026-11-26). 서버 전제 P1(`NoteWorkspaceRoutes.kt:66-269`)·P4(`TierService.kt` 한도 표 `:52-63`·관리자 `:66-80`)·P7(`NotesPage.tsx`)이 머지된 `main`과 맞았다. DTO는 `NoteFolderService.kt:19-34`·`NoteDocService.kt:25-77`·`NoteFileService.kt:30-41`과 대조했다.
- 요금제 링크: `SettingsPage.tsx`에 `#plan` 앵커가 없다. 구독·크레딧 섹션 `#credits`를 쓴다(기존 `notes.linkSettingsCredits`와 같다). Drive 연결 안내는 `#account`(`driveStoragePanel`이 있는 섹션). Drive 연결 판정은 `me.storageProvider === 'drive'`.
- 브랜치: 문서 커밋 `docs/NT-2-spec`(`061b309`, push) 위에서 `feat/NT-2a-note-workspace-ui`를 만들었다(PR은 하나 — 주니어가 base `main`으로 연다. 문서 커밋이 함께 들어간다).

### 11.2 파일 (18개 — §7.1 15개 + 사용자 승인 3개, 2026-11-27)

| 구분 | 파일 |
| --- | --- |
| 화면 | `pages/NotesPage.tsx`·`NotesPage.module.css`, 새 `components/notes/NoteFolderNav.tsx`(목록·칩 줄 + 노트북/PRO 대화상자)·`NoteUploadDialog.tsx`·`NoteCard.tsx`·`notes.module.css` |
| 라이브러리 | `lib/apiClient.ts`(`apiClient.noteWorkspace.*` 18개 + `notes.setFolder`, 타입 6개, `NoteSummaryDto.folderId`), `lib/auth.ts`(한도·사용량 선택 칸), `lib/drive.ts`(`ensureFolder(preferredId, name)`·`DRIVE_NOTES_FOLDER_NAME`·`deleteFile` 공개), **승인 추가** 새 `lib/noteWorkspace.mts`(순수 함수 — node 단위 테스트용) |
| 문구 | `lib/i18n/ko·en·ja.mts`(`notes.ws.*` 51 · `notes.upload.*` 34, `tab.quota` 합산 문구) |
| 테스트 | `test/e2e/layout/notes.spec.js`(ws·free 상태, NT2A-L1), 새 `test/e2e/notes-workspace.spec.js`, 새 `test/nt2a_note_upload.test.js`, **승인 추가** `test/e2e/layout/ui-polish.spec.js`(DS24-N1 필 = `#noteUploadBtn`·카드 왼쪽 3px 스파인, DS24-D1 접힌 `#form`은 attached 대기)·`test/e2e/xss.spec.js`(E10 접힘 상자 열기 한 줄) |

### 11.3 명세와 다른 점·구현 결정

- **배치 약속**: 제목줄 버튼은 `notesTitle`이 아니라 새 그룹 `notesActions:center-y`. 390에서 큰 제목(36~56px)과 버튼 두 개가 한 줄에 들어가지 않아 버튼 줄이 아래로 내려간다(`notesTitle`은 제목·BETA 그대로). `notesWs:top@961`은 `nav#noteFolders` ↔ `#noteFolderHead`, `noteCards:top,bottom`은 카드.
- **작업 목록**: `#jobs`(제목 포함)를 AI 접힘 상자 안에 둔다. 상자가 접혀 있고 진행·실패 작업이 있으면 띠 `#noteJobsStrip` + `작업 보기 →`(상자를 열고 `#jobs`로 스크롤). 상자 펼침 = 사용자 선택 우선, 없으면 로그인 전·노트 0개일 때 펼침(목록 응답 전에는 접힘). 키 게이트 `#keyGateBox`도 상자 안.
- **`#submit`** 은 사각 버튼(`ghostBtn` + 먹색 테두리)으로 바꿨다 — 대표 필은 `＋ 자료 올리기` 하나(Q1). 로그인 전에는 제목줄 버튼이 없다.
- **카드**: 카드 전체 링크는 제목 링크를 카드 위로 늘리는 방식(`::after`). AI 카드는 기존 단언 때문에 `.note-card`·`.note-card-title`·`.note-actions`(연습·상세 링크)를 유지한다. 카드 `⋯` 메뉴는 AI·자료 모두 이동·이름 바꾸기·삭제(AI 삭제 문구는 `note.confirmDelete` 재사용). **`Drive` 표시는 뺐다** — 목록 DTO(`NoteDocSummaryDto.firstFile{id,mime}`)에 저장 위치가 없다(서버 계약 변경 필요 → 하지 않음).
- **노트북 색**: 지역 CSS 변수는 DR-7에 걸려 새 변수 대신 기존 `--section-spine`을 `[data-fold]`로 덮는다. 색 없음 = `--seam-hairline`(선택 항목은 먹색).
- **Drive 학습자료 폴더 id**: `drive.ts`는 localStorage 쓰기가 금지(R0-T8)라 `NoteUploadDialog.tsx`가 `ulp:drive-notes-folder:<uid>`를 읽고 쓴다. `ensureFolder`는 녹음 폴더일 때만 옛 이름(`ULeveLP 녹음`)을 조회하고, 생성 이름 분기는 BR1-7 단언을 지키는 모양으로 썼다.
- **업로드**: 한도·업그레이드·`STORAGE_UNAVAILABLE` 오류는 남은 파일을 시도하지 않고 실패로 돌린다. 부분 성공 뒤 대화상자에 남은(실패) 파일만 두고 다시 `올리기`하면 **같은 노트**에 붙인다(제목·노트북 칸 잠금). 용량·크기 초과이고 Drive를 쓸 수 있으면 `Drive에 저장` 버튼이 저장 위치를 Drive로 바꾼다. 닫기·계정 전환은 `AbortController`로 끊고, 같은 계정이면 방금 만든 빈 노트를 지운다(다른 계정이면 지우지 않는다 — 요청이 새 세션으로 나간다).
- **390 첫 화면**(notes-form N1, 0노트 사용자): 머리 버튼 줄·요약 줄 때문에 `#submit`이 탭 바 아래로 밀려 ≤600에서 요약 보조 문구 숨김·폼 안쪽 여백 16px·간격 축소로 맞췄다.
- **AI 상자 요약 줄**: `display:flex`로 기본 펼침 표시가 사라져 오른쪽 끝에 `＋/−`를 둔다.

### 11.4 시니어 표적 검증 (2026-11-27 Mac)

| 명령 | 결과 |
| --- | --- |
| `npx playwright test test/e2e/layout/notes.spec.js` (구현 전) | ws 상태·NT2A-L1 **실패 확인**(카드 2개만 — 순서 ②) |
| `npx tsc --noEmit` · `npx vite build` | 통과 |
| `npm test` (node 단위 전체) | **555/555** (새 `nt2a_note_upload` 4건 포함 · i18n I0-6·LA-1·LB·DR-7·보안 (g)·BR1-7·R0-T8 통과) |
| `npx playwright test` layout/notes · notes-workspace · notes-form · notes-range · beta-badge · xss · layout/ui-polish · practice-record | **105/105** (★ NT2A-L1 4폭·W1·U1 2건·T1 2건·R1 + W2) |
| 위 묶음 + i18n-lang · layout.spec · theme-footer · note-actions · tab-player (`tab.quota`·드라이브 변경 영향) | 129/129 (중간 실행, 이후 CSS만 바뀌어 notes 묶음 57/57 재확인) |
| `LAYOUT_SHOTS=1` ws 1280·390, free 390 | 직접 확인(V1 B 목록/칩 줄·스파인·필 1개). **4폭 Q1~Q9 표는 주니어** |

- 미실행(주니어 4단계): 전체 `npm run test:e2e`·`./gradlew test` 회귀, 4폭×상태 스크린샷 Q1~Q9 표, PR·CI. NT2A-V1(Drive 실제 업로드·등록 실패 시 `drive.deleteFile`)은 Google 토큰 흐름이 있어 가짜 API E2E를 만들지 않았다 — 코드 경로는 `NoteUploadDialog.tsx` `submit`. 실제 Drive·운영 확인은 사람(출시 전).
