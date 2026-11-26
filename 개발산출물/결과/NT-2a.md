# NT-2a 결과 — 학습 노트 워크스페이스 · 노트북 · 자료 올리기

> 입력: [명세/NT-2 §4·§6·§7.1·§8.1·§11](../명세/NT-2_구현명세.md) · [시안](../명세/NT-2_시안.html) · [진행_NT_학습노트.md](../진행_NT_학습노트.md)
> 기준: `main` `3736831`(PR #73 머지) | 작업 브랜치: `feat/NT-2a-note-workspace-ui` (`1b845d4` 구현, `fa53ee9` 시니어 기록)
> 담당: 시니어 직접 구현(2026-11-27 Mac Claude) → 주니어 4단계 검증·문서·PR/CI(2026-11-27 Mac Gemini)

## 1. 구현 요약 (시니어 `1b845d4`, 주니어 제품 코드 무수정)

- **화면·컴포넌트:** `frontend/src/pages/NotesPage.tsx` · `NotesPage.module.css`, 신규 `frontend/src/components/notes/NoteFolderNav.tsx` · `NoteUploadDialog.tsx` · `NoteCard.tsx` · `notes.module.css` — V1 B 노트북 목록(961+ 왼쪽 240px / 960 이하 가로 칩 줄), AI 영상 노트 접힘 상자(`#aiNoteBox`)·작업 띠(`#noteJobsStrip`), 통합 그리드·종류 필터·노트북 CRUD·순서(`↑ ↓`), 자료 올리기(RE:DO·Google Drive, 보상 삭제·부분 성공 재시도), 무료(`· PRO` + 안내 띠)·owner(`limits = null`) 분기, AI 노트 노트북 이동.
- **라이브러리·문구:** `frontend/src/lib/apiClient.ts` (`noteWorkspace.*` 18개·`notes.setFolder`·타입 6개), `auth.ts`, `drive.ts` (`ensureFolder(preferredId, name)`·`DRIVE_NOTES_FOLDER_NAME`·`deleteFile`), `noteWorkspace.mts`, `ko.mts`·`en.mts`·`ja.mts` (`notes.ws.*`·`notes.upload.*`·`tab.quota`).
- **테스트:** `test/e2e/layout/notes.spec.js`, `test/e2e/notes-workspace.spec.js`, `test/nt2a_note_upload.test.js`, `test/e2e/layout/ui-polish.spec.js`, `test/e2e/xss.spec.js` (총 18개 파일).

## 2. 검증 결과

### 시니어 표적 검증 (2026-11-27 Mac, `1b845d4`)
- `npx tsc --noEmit` · `npx vite build` 통과
- `npm test`: **555/555** (신규 `nt2a_note_upload` 4건 포함)
- 노트 관련 E2E 묶음: **105/105** (★ `NT2A-L1` 4폭·`W1`·`U1` 2건·`T1` 2건·`R1` + `W2`)

### 주니어 4단계 전체 회귀 검증 (2026-11-27 Mac, `fa53ee9`, 제품 코드 무수정)

| 명령 | 결과 |
| --- | --- |
| `npm ci` | 통과 (176 packages) |
| `npm run build` (`tsc --noEmit && vite build`) | 통과 (오류 0, 206 modules transformed, `dist/` 생성) |
| `npm test` (`node --test test/*.test.js`) | **555 pass / 0 fail** (58 suites) |
| `npm run test:e2e` (`playwright test`) | **991 passed** (15.9m, 실패 0건) |
| `./gradlew test` | **BUILD SUCCESSFUL** (`UP-TO-DATE`, 기존 서버 테스트 450건 유지·서버/DB 무변경) |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/notes.spec.js` | **37 passed** (39.3s) |

### 4폭 + 다크 스크린샷 검토 (Q1~Q9)

- 대상: `notes-ws-{1280,1150,768,390}.png`, `notes-ws-1280-dark.png`, `notes-free-{1280,1150,768,390}.png`, `notes-userData-{1280,1150,768,390}.png` (13장)

| # | 질문 | 1280 | 1150 | 768 | 390 | 다크(1280) |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나 · 강한 채움 버튼 1개 (`＋ 자료 올리기`) | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형 (목록·칩·그리드·카드 간격) | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남 (`notesActions:center-y`, `notesWs:top@961`, `noteCards:top,bottom`) | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계 (`NOTES` > 노트북 제목 > 카드 제목 > 메타·사용량 막대) | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태·무료 안내 띠(`요금제 보기 →`)·긴 노트북 이름 처리 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 961+ 2열(240px+그리드), 960 이하 칩 줄 전환 · 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조 · 포인트 색은 노트북 왼쪽 스파인에만 제한 | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·`1px` 줄눈 일관성(필은 대표 버튼 1개만) | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·스파인·글자·사용량 막대 대비 | - | - | - | - | ○ |

## 3. 미실행 범위 · 남은 확인

- **`NT2A-V1` (실제 Google Drive 업로드 · 등록 실패 시 `drive.deleteFile` 보상 삭제):** Google OAuth 토큰 흐름이 있어 E2E 자동화 미실행 (`NoteUploadDialog.tsx` `submit` 경로 구현 확인, 실제 Drive·운영 확인은 출시 전 사람 확인).
- **운영 Cloud Run 512MiB 20MB 동시 업로드 메모리 관찰([명세/NT-2 §9 U6](../명세/NT-2_구현명세.md#9-미확인-구현-착수-전에-공식-문서패키지로-확인)):** 배포 후 사람 확인.

## 4. PR 및 CI · 리뷰 상태

- PR 생성 후 갱신 예정 (`feat/NT-2a-note-workspace-ui` → `main`).
