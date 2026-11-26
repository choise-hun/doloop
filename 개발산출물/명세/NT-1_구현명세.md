# NT-1 구현 명세 — 학습 노트 워크스페이스 서버 계약(V16 · 노트북 · 자료/블록 노트 · 파일 · 주석 · 한도 · 정리)

> 작업: NT-1 (1단계 시니어 명세) | 진행 파일: [진행_NT_학습노트.md](../진행_NT_학습노트.md) Step 표 NT-1 행
> 입력: [기능확장.md](../../기능확장.md) §1 #5·#6, §3.2, §4.1~4.2, §5 2순위, §6 D4·D5·D6·D7·D8 · [명세/TB-1](TB-1_구현명세.md)(같은 스토리지·한도 패턴) · [.team_docs/rules/backend-kotlin.md](../../.team_docs/rules/backend-kotlin.md)
> 기준 커밋: `main` `8824cc4`(PR #72 머지) | 작성 2026-11-26 Mac Claude 시니어
> 상태: **승인(2026-11-26)** — 사용자가 §3 N1~N10 추천안을 승인했다. 추가 지시: N3·N4 한도는 관리자 계정에서 항상 해제(구현은 기존 관리자 판정 `profiles.role = 'owner'` → `TierLimits.ownerLimits`). 구현 중 달라진 점은 §14.

## 1. 범위와 배정

| 항목 | 내용 |
| --- | --- |
| 포함 | V16 마이그레이션(노트북·자료/블록 노트·첨부 파일·페이지 주석 테이블, `notes.folder_id`), 노트북 CRUD·순서, 자료/블록 노트 CRUD(본문 `rev` 충돌 검사), 첨부 파일 업로드(Supabase multipart·형식 검증·보상 정리)와 Drive 참조 등록, 파일 주소(서명 주소), 페이지 주석 저장(`rev` 충돌 검사), 티어 한도(노트북 수·노트 수·파일 총량·Drive), 삭제 정리(노트·파일·계정 삭제 때 `storage_trash`), 기존 AI 영상 노트의 노트북 이동, `/me` 사용량 칸 추가, Kotlin 테스트 |
| 제외 | 프런트 전부(NT-2 노트북·뷰어·주석 화면, NT-3 블록 에디터), CSP 개정(NT-2), 기기 로컬 캐시(NT-2), 서버의 PDF 해석(쪽수 추출·썸네일 생성), 블록 본문·주석 좌표의 의미 검증(NT-2·NT-3 에디터가 정한다), AI 요약(M2-5), 노트북 중첩, 공유·커뮤니티 게시, ZIP 내보내기에 새 노트 넣기 |
| 배정 | **[시니어 직접 구현] → 주니어 4단계**(협업 §1.2 기본). 근거: 스토리지와 DB를 잇는 보상 정리, 프로필 잠금 아래 한도 재검사, 소유권 404, 업로드 파일 검증, `rev` 경합은 고위험이다(배정 판정 질문 ③) |
| Step 구성 | N10 참고. 추천은 한 Step·한 브랜치 `feat/NT-1-note-workspace`, 커밋 3개(§11). 파일 수는 골디락스 상한(7)을 넘는다(§10, 약 18개) — TB-1과 같이 커밋 경계에서 끊어 인계할 수 있다 |

## 2. 전제 표 (코드로 확인, `main` `8824cc4`)

| P# | 전제 | 근거 |
| --- | --- | --- |
| P1 | 마이그레이션은 **V15가 마지막**이다. 테스트가 목표 버전 `"15"`를 단언한다 → V16을 더하면 `"16"`으로 바꾼다 | `src/main/resources/db/migration/V15__song_media_type_and_tabs.sql`, `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt:108` |
| P2 | `notes`는 **YouTube AI 분석 전용** 스키마다: `video_id TEXT NOT NULL CHECK (11자)`, `tags TEXT[] NOT NULL`, `analysis JSONB NOT NULL`. `content`·`note_type`·`folder_id` 칸은 없다 | `V1__init.sql:110-129`, `Tables.kt:181-201` |
| P3 | `NoteSummaryDto`·`NoteDetailDto`의 `videoId: String`·`url: String`(nullable 아님), 상세는 `analysis: JsonObject`. 프런트 타입도 `videoId: string`이고 노트 목록이 `practice.html?v=${n.videoId}` 링크를 만든다. **이미 설치된 iOS·Android 앱은 옛 프런트를 번들로 들고 있다**(TB-1 P16과 같음) | `NoteService.kt:95-137`, `frontend/src/lib/apiClient.ts:251-272`, `frontend/src/pages/NotesPage.tsx:626-627` |
| P4 | `notes.video_id`·`tags`·`analysis`를 NOT NULL로 가정하고 읽는 곳: `NoteService`(목록·상세·`setCollect`의 진행 추출), `ExportImportService`(ZIP 노트 CSV·md), 폐기 기능 코드 2곳. 태그는 `GeminiSchemas.ALLOWED_NOTE_TAGS` 고정 목록·1~7개만 받는다 | `NoteService.kt:578-597`, `:680-709`, `ExportImportService.kt:216-219`, `:378-430`, `NotionSyncService.kt:512-514`, `NotionPushWorker.kt:793-800`, `NoteRoutes.kt:130-147` |
| P5 | `progressions.note_id`가 `notes(id)`를 `ON DELETE SET NULL`로 참조한다(AI 노트에서 수집한 진행) | `V3__progressions.sql:26`, `Tables.kt:375` |
| P6 | 티어 한도는 코드 상수 `TierLimits`다. TB-1에서 `tabSongs`(FREE 5)·`tabBytes`(FREE 20MB / PRO 500MB / PRO_PLUS 1GB)를 더했다. owner는 `ownerLimits`로 새 칸 기본값 `null`(무제한). 한도 검사는 **추가하는 순간에만** 하고 다운그레이드 데이터는 유지한다 | `TierService.kt:23-52`, `:55-65`, `:209` 주석 |
| P7 | TB-1 T2가 "노트 첨부와 TAB 총량을 합산할지는 NT-1에서 정한다"로 남겼다. 지금 `requireTabBytes`는 `songs.tab_file_size` 합만 센다. 초과는 413 `TAB_QUOTA_EXCEEDED`(detail `limitBytes·usedBytes·tier·nextTier·nextLimit`) | `명세/TB-1_구현명세.md` §3 T2, `TierService.kt:161-166`, `:256-274` |
| P8 | `requireDrive(ctx)`: 무료면 403 `TIER_UPGRADE_REQUIRED`(feature `drive`). Drive 녹음 등록은 **클라이언트가 Drive에 올리고 서버는 파일 ID만 받는다**(`DRIVE_FILE_ID_REGEX = ^[A-Za-z0-9_-]{5,200}$`). 서버는 Drive 파일 내용·크기를 확인하지 않고, Drive 녹음은 서버 총량에 세지 않는다(`serverTakeBytes`는 `storage = 'supabase'`만) | `TierService.kt:323-327`, `TakeService.kt:454-501`, `:654`, `TierService.kt:171-176` |
| P9 | `StorageClient`: `upload(key, bytes, contentType)`(`x-upsert: false`), `createSignedUrl(key, ttl)`, `delete(key)`(없어도 성공), `download(key)`. 구현은 단일 버킷 `takes`. 키 규칙: 녹음 `{userId}/{takeId}.{ext}`, 공유 `shared/…`, TAB `tabs/{userId}/{songId}.{ext}` → `notes/{userId}/{docId}/{fileId}.{ext}`는 어느 쪽과도 겹치지 않는다(D7) | `StorageClient.kt:5-14`, `SupabaseStorageClient.kt:20-26`, `TabSongService.kt:78` |
| P10 | 업로드 3단계·보상 정리 원형(TB-1): 트랜잭션 A 사전 검사 → 트랜잭션 밖 업로드(실패·취소해도 정리) → 트랜잭션 B `tierContext(lock = true)` 재검사 + INSERT → 실패하면 `NonCancellable`에서 키로 커밋 여부 확인, 미커밋이면 `delete`, 삭제 실패면 `storage_trash`. 커밋 여부 확인 자체가 실패하면 **지우지 않는다**. 새 경로라 outbox 호출을 넣지 않는다 | `TabSongService.kt:68-146`, backend-kotlin §3 |
| P11 | multipart 원형: 저장소 미설정 503 `STORAGE_UNAVAILABLE` → Content-Length 사전 413 → `receiveMultipart(formFieldLimit)` → 파일 `readRemaining(MAX + 1)` → 텍스트 파트 FormItem·FileItem 둘 다. 파일 이름 정리는 `TabFileValidator.sanitizeFileName`(200자) | `SongRoutes.kt:84-144`, `TabFileValidator.kt:30-35`, `:45` |
| P12 | 서명 주소 원형: TAB은 TTL 300초, 응답 `{url, expiresIn, fileName, format, sizeBytes}`, 없음·남의 것·종류 다름은 모두 404, `StorageException`이면 502 `STORAGE_ERROR`. 업로드 Content-Type은 셋 다 `application/octet-stream`(Supabase 출처에서 브라우저가 렌더하지 않게) | `TabSongService.kt:149-183` |
| P13 | 삭제 정리 원형: 같은 트랜잭션에서 지울 키를 `storage_trash`에 넣고 id 목록을 돌려주면 라우트가 커밋 뒤 `storageTrashService.purge(ids)`. 바로 지우지 못한 일반 키는 기존 1분 cron 배치(`attempts < 5`)가 다시 지운다. `runSharedRetryBatch`는 `shared/%`만 다룬다 | `SongService.kt:445-496`, `SongRoutes.kt:353-358`, `StorageTrashService.kt:24-94`, `NotionPushWorker.kt:263-286`, `NotionSyncRoutes.kt:78-86` |
| P14 | 계정 삭제 `deleteMe`: 프로필 잠금 → supabase 녹음 키 + TAB 키를 휴지통에 넣고 `users` CASCADE 삭제. **새 첨부 키를 넣지 않으면 계정 삭제 뒤 파일이 고아가 된다** | `ProfileService.kt:332-370` |
| P15 | `/me` 사용량 `TierUsageDto(songs, categories, takeBytes, takeSongs, tabSongs, tabBytes)`와 한도 `TierLimitsDto`. 칸을 더해도 JSON 설정(`encodeDefaults`, `explicitNulls`, `ignoreUnknownKeys`)상 옛 클라이언트는 모르는 칸을 무시한다 | `TierService.kt:80-107`, `ProfileService.kt:467-474`, `Main.kt:303-304` |
| P16 | `receiveJsonObject()`는 본문 크기 상한 없이 `receiveText()`로 전부 읽는다. 블록 본문·주석처럼 큰 JSON을 받을 경로에는 상한이 필요하다 | `api/JsonInput.kt:18-30` |
| P17 | 분류(`categories`)는 무료 5 / PRO 15 / PRO_PLUS 30, 순서 칸 `sort_order`, 403 `CATEGORY_LIMIT_EXCEEDED`. 노트북 한도·순서 API의 원형으로 쓴다 | `TierService.kt:46-51`, `:229-240`, `Tables.kt:321-335` |
| P18 | 테스트 DB는 `postgres:16-alpine`(Testcontainers + Flyway) | `src/test/kotlin/ulevelp/db/PostgresTestContainer.kt:14` |

## 3. 사용자 결정 (승인 필요)

| ID | 결정할 것 | 선택지 | 추천 |
| --- | --- | --- | --- |
| **N1** | 새 노트의 저장 위치(호환 계약) | A) **새 테이블 `note_docs`**에 자료·블록 노트를 두고, 기존 `notes`에는 `folder_id` 칸 하나만 더한다. 기존 `GET /notes`·상세·수정·ZIP은 손대지 않는다 · B) 기능확장 §3.2대로 `notes`를 넓힌다(`note_type`, `video_id` nullable, `body_blocks`) — P4의 읽기 지점 전부와 옛 앱 보호(`include=` 쿼리)를 TB-1 §7처럼 고쳐야 한다 | **A** — 옛 앱(P3)이 `videoId: null`·`analysis` 없는 노트를 받을 길이 처음부터 없다. AI 노트 전용 규칙(고정 태그 1~7개, `analysis` 필수, 진행 수집)을 새 노트에 억지로 맞추지 않아도 된다. 통합 목록(D4)은 프런트가 `GET /notes` + `GET /note-docs`를 합쳐 만든다 |
| **N2** | 무료 노트북 | A) 무료는 **기본 노트북 1개만**(= `folder_id` NULL인 "기본" 묶음, 행 없음). 노트북 만들기는 403 `TIER_UPGRADE_REQUIRED`(feature `note_folders`) · B) 무료도 노트북 행 1개를 만들 수 있다 | **A** — D8 "무료 단일 노트북"을 행 없이 표현해 다운그레이드 때 옮길 것이 없다 |
| **N3** | 유료 노트북 수·중첩 | A) **PRO 15 / PRO_PLUS 30**(분류와 같은 수, P17), owner 무제한, **중첩 없음**(평면) · B) 수 제한 없음 · C) `parent_id`로 중첩 허용 | **A** — 분류와 같은 감각, 중첩은 화면 시안(NT-2) 없이 정하기 이르다. 칸은 나중에 더할 수 있다 |
| **N4** | 노트 수(자료+블록) 한도 | A) **FREE 30 / PRO 1000 / PRO_PLUS 2000**, owner 무제한. AI 노트는 세지 않는다(크레딧이 이미 제한) · B) 제한 없음(본문 1MB 상한만) | **A** — 무료 블록 노트 무제한이면 DB 용량이 열린다. 곡 한도(1000/2000)와 같은 크기 |
| **N5** | 파일 총량: TAB과 합산 여부 | A) **합산** — 한 풀 `fileBytes` = TAB 파일 + 노트 첨부(Supabase만). FREE 20MB / PRO 500MB / PRO_PLUS 1GB(D8 "총 파일 저장 용량"). 무료는 노트 첨부를 못 올리므로 무료 풀은 사실상 TAB 전용 · B) 분리 — 노트 첨부 풀을 따로 PRO 500MB / PRO_PLUS 1GB(합치면 최대 2GB) | **A** — D8 문구와 맞고 사용자가 보는 숫자가 하나다. 기존 TAB 업로드의 에러 코드·HTTP 상태는 그대로 두고 `usedBytes`만 합산값이 된다(§8.3) |
| **N6** | 첨부 파일 형식·단건 크기 | A) **PDF·PNG·JPEG·WebP**, 단건 **20MB**, 노트 하나에 파일 **20개**까지. 업로드는 서버 multipart(TB-1과 같은 길) · B) 단건 10MB(TAB과 같음) · C) 더 큰 파일은 Supabase 서명 업로드 주소로 직접 올리기(`StorageClient`에 메서드 추가, 서버 검증은 업로드 뒤 내려받아 확인) | **A** — Cloud Run 요청 본문 상한(32MiB로 알려짐, §13 U2) 안에서 기존 검증 경로를 그대로 쓴다. 20MB를 넘는 교재는 Drive 참조(N7)로 보낸다. SVG·HEIC는 받지 않는다(기능확장 §4.3) |
| **N7** | Drive 참조 저장을 NT-1에 넣을지 | A) **넣는다** — `POST /note-docs/{id}/files`에 JSON `{storage:"drive", …}` 등록 경로(녹음 Drive 등록과 같은 규칙: 유료만, 파일 ID 형식만 검사, 서버 총량에 세지 않음). Drive 파일 삭제는 클라이언트 몫 · B) 칸(`storage`)만 만들고 등록 API는 NT-2에서 | **A** — 서버 쪽은 작고(P8 원형 복사), NT-2가 서버 PR을 다시 열지 않아도 된다. 단, Drive 연결 화면의 "테스트 중인 앱" 경고(계획 §4 BR-2 ②)는 NT-2 출시 전 관문으로 남는다 |
| **N8** | 다운그레이드(유료→무료) 뒤 동작 | A) **데이터 유지·읽기와 정리는 허용, 추가는 막음** — 노트북·첨부·Drive 참조 모두 남고 열람·삭제·이름 변경·주석 수정은 된다. 새 노트북·새 첨부·새 자료 노트는 403. 노트북 행이 남아 있어도 무료 한도 검사는 "만들 때만" · B) 노트북을 모두 해제(`folder_id` NULL)하고 읽기 전용 | **A** — 기존 원칙(P6 "다운그레이드 데이터는 유지", 녹음·공개 폴더와 같음). `downgradeCleanup`은 바꾸지 않는다 |
| **N9** | 본문·주석 동시 수정 | A) **`rev` 검사** — 저장 요청에 읽었던 `rev`를 보내고 다르면 409 `NOTE_REV_CONFLICT`(detail에 현재 `rev`). 성공하면 `rev + 1` · B) 마지막 저장이 이긴다 | **A** — iPad·PC를 오가는 사용자(Win↔Mac처럼)에게 주석이 조용히 사라지는 것이 가장 나쁘다. 충돌 화면은 NT-2·NT-3이 정한다 |
| **N10** | Step 나누기 | A) **한 Step·한 PR·커밋 3개**(§11) · B) NT-1a(스키마·노트북·블록 노트)·NT-1b(파일·주석·한도)를 따로 PR — 대기능 NT가 4 Step이 된다(상한) | **A** — 커밋 ①만으로는 화면 변화가 없어 따로 머지할 이득이 작다(TB-1 T7과 같은 판단). NT-2가 커질 때 쓸 4번째 Step 여유를 남긴다 |

## 4. DB — `V16__note_workspace.sql`

```sql
-- NT-1: 학습 노트 워크스페이스(기능확장 D4). 첨부는 private 버킷 'takes'의 notes/{userId}/{docId}/{fileId}.{ext}(D7)
-- 명세: 개발산출물/명세/NT-1_구현명세.md §4

-- 1) 노트북(평면, N3). 무료는 행을 만들지 않는다(N2: folder_id NULL = 기본 노트북)
CREATE TABLE note_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  color       TEXT CHECK (color IS NULL OR color ~ '^[a-z0-9-]{1,20}$'),  -- 토큰 키만(색 값 아님). 목록은 NT-2 시안에서 정한다
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_folders_user_idx ON note_folders (user_id, sort_order, created_at);
CREATE TRIGGER note_folders_updated BEFORE UPDATE ON note_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) 기존 AI 영상 노트도 노트북에 넣을 수 있게 칸 하나만 더한다(N1 A). 다른 칸·제약은 그대로
ALTER TABLE notes ADD COLUMN folder_id UUID REFERENCES note_folders(id) ON DELETE SET NULL;

-- 3) 자료 노트(document: PDF/이미지 열람·주석)와 블록 노트(block: 직접 작성)
CREATE TABLE note_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES note_folders(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('document', 'block')),
  title       TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  body        JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(body) = 'object'),  -- 블록 문서. 서버는 모양을 해석하지 않는다(NT-3)
  rev         INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_docs_user_folder_idx ON note_docs (user_id, folder_id, updated_at DESC);
CREATE TRIGGER note_docs_updated BEFORE UPDATE ON note_docs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4) 첨부 파일. 행이 CASCADE로 지워져도 스토리지 파일은 남으므로 서비스가 먼저 storage_trash에 넣는다(§7)
CREATE TABLE note_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_id       UUID NOT NULL REFERENCES note_docs(id) ON DELETE CASCADE,
  storage      TEXT NOT NULL CHECK (storage IN ('supabase', 'drive')),
  storage_key  TEXT NOT NULL CHECK (char_length(storage_key) BETWEEN 5 AND 300),
  file_name    TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime         TEXT NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes   BIGINT NOT NULL CHECK (size_bytes > 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_files_doc_idx ON note_files (doc_id, sort_order, created_at);
CREATE INDEX note_files_user_storage_idx ON note_files (user_id, storage);
CREATE UNIQUE INDEX note_files_supabase_key_uq ON note_files (storage_key) WHERE storage = 'supabase';

-- 5) 페이지 주석(D5). 이미지 파일은 page = 1. 좌표 모양은 NT-2가 정하고 서버는 크기·최상위 모양만 본다
CREATE TABLE note_annotations (
  file_id     UUID NOT NULL REFERENCES note_files(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL CHECK (page BETWEEN 1 AND 2000),
  data        JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  rev         INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, page)
);
CREATE TRIGGER note_annotations_updated BEFORE UPDATE ON note_annotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- **노트북 소유권:** FK는 `note_folders(id)` 하나만 건다(복합 FK에 `ON DELETE SET NULL`을 쓰면 `user_id`까지 비워진다). 남의 노트북을 넣는 것은 서비스가 막는다: `folderId`를 받는 모든 쓰기에서 `note_folders.user_id = 나`를 확인하고 아니면 404(§5).
- Exposed: `Tables.kt`에 `NoteFoldersTable`, `NoteDocsTable`, `NoteFilesTable`, `NoteAnnotationsTable`을 더하고 `NotesTable.folderId = uuid("folder_id").references(NoteFoldersTable.id, onDelete = SET_NULL).nullable()`을 더한다. `ALL_TABLES`에도 넣는다(`Tables.kt:419-446`).
- 저장 안 하는 것: PDF 쪽수(서버가 PDF를 해석하지 않는다), 썸네일(NT-2가 기기에서 그린다), 해시(TB-1 T6과 같이 중복 업로드를 막지 않는다).

## 5. API (모두 `/api/v1`, 인증 필요, 응답 `Cache-Control: no-store`)

공통: 없음·남의 것·종류가 다름은 모두 **404**(존재를 드러내지 않는다). 경로 UUID는 `parsePathUuid`. 시각은 `ISO_INSTANT`(backend-kotlin §6). 새 경로에는 outbox 호출을 넣지 않는다.

### 5.1 노트북

| 메서드·경로 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `GET /note-folders` | — | `{folders: [NoteFolderDto]}` (`sort_order`, `created_at` 순) | — |
| `POST /note-folders` | `{name, color?}` | 201 `{folder}` (맨 뒤 `sort_order = max + 1`) | 400 이름 1~60자·색 키 형식 · 403 `TIER_UPGRADE_REQUIRED`(무료, feature `note_folders`) · 403 `NOTE_FOLDER_LIMIT_EXCEEDED`(detail `limit·used·tier·nextTier·nextLimit`) |
| `PATCH /note-folders/{id}` | `{name?, color?}` 하나 이상 (`color: null`은 지움) | 200 `{folder}` | 400 · 404 |
| `PUT /note-folders/order` | `{ids: [uuid]}` = 내 노트북 **전부**, 중복 없음 | 200 `{folders}` | 400 개수·중복 불일치 · 404 남의 id |
| `DELETE /note-folders/{id}` | — | 200 `{ok:true}`. 안의 노트·AI 노트는 FK로 `folder_id = NULL`(기본 노트북으로) | 404 |

`NoteFolderDto = {id, name, color: String?, sortOrder, docCount, aiNoteCount, createdAt, updatedAt}`.

### 5.2 자료·블록 노트

| 메서드·경로 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `GET /note-docs?folder=<uuid\|none>` | `folder` 없으면 전부, `none`이면 기본 노트북만 | `{docs: [NoteDocSummaryDto]}` (`updated_at DESC, id DESC`) | 400 `folder` 형식 |
| `POST /note-docs` | `{kind: "document"\|"block", title, folderId?, body?}` (`body`는 `block`만) | 201 `{doc: NoteDocDetailDto}` (`rev = 1`) | 400 · 403 `TIER_UPGRADE_REQUIRED`(무료가 `document`, feature `note_files`) · 403 `NOTE_DOC_LIMIT_EXCEEDED` · 404 `folderId` |
| `GET /note-docs/{id}` | — | 200 `{doc: NoteDocDetailDto}` | 404 |
| `PATCH /note-docs/{id}` | `{title?, folderId?, body?, rev?}` 하나 이상. **`body`가 있으면 `rev` 필수** | 200 `{doc}`. `body`를 바꾸면 `rev + 1`, 제목·노트북만 바꾸면 `rev` 그대로 | 400 · 404 · 409 `NOTE_REV_CONFLICT`(detail `{rev: 현재값}`) · 413 `NOTE_BODY_TOO_LARGE` |
| `DELETE /note-docs/{id}` | — | 200 `{ok:true}` | 404 |
| `PUT /notes/{noteId}/folder` | `{folderId: uuid\|null}` | 200 `{note: NoteDetailDto}`(기존 모양 + `folderId`) | 404 노트·노트북 |

- `NoteDocSummaryDto = {id, kind, title, folderId, rev, fileCount, firstFile: {id, mime}?, createdAt, updatedAt}` — 본문 없음.
- `NoteDocDetailDto = Summary + {body: JsonObject, files: [NoteFileDto]}`.
- 본문 상한 **1MB**(`body`를 직렬화한 UTF-8 바이트). 요청 본문은 새 함수 `receiveJsonObjectLimited(maxBytes)`로 Content-Length 사전 거부 + `maxBytes + 1`까지만 읽는다(P16). 기존 `receiveJsonObject()`는 바꾸지 않는다.
- `rev` 검사는 `UPDATE … WHERE id = ? AND user_id = ? AND rev = ?`의 영향 행 수로 한다(0이면 다시 읽어 404/409 구분). 별도 잠금 없음.
- 무료 사용자도 기존 `document` 노트의 제목·노트북·삭제는 된다(N8). 무료가 `folderId`에 남은 노트북을 넣는 것도 허용한다(행이 이미 있다).
- AI 노트 응답 `NoteSummaryDto`·`NoteDetailDto`에 `folderId: String? = null`을 **덧붙이기만** 한다. 나머지 칸·`GET /notes` 동작·태그 규칙은 그대로(§9).

### 5.3 첨부 파일

| 메서드·경로 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `POST /note-docs/{id}/files` (multipart) | 파트 `file` 하나 | 201 `{file: NoteFileDto}` | 503 `STORAGE_UNAVAILABLE` · 413 `NOTE_FILE_TOO_LARGE`(20MB) · 400 형식 · 403 `TIER_UPGRADE_REQUIRED`(무료, feature `note_files`) · 403 `NOTE_FILE_COUNT_EXCEEDED`(노트당 20) · 413 `FILE_QUOTA_EXCEEDED` · 404 · 502 `STORAGE_ERROR` |
| `POST /note-docs/{id}/files` (JSON) | `{storage:"drive", storageKey, fileName, mime, sizeBytes}` | 201 `{file}` | 400 · 403 `TIER_UPGRADE_REQUIRED`(feature `drive`, `requireDrive`) · 403 `NOTE_FILE_COUNT_EXCEEDED` · 404 |
| `GET /note-files/{fileId}/url` | — | supabase: `{storage:"supabase", url, expiresIn: 300, fileName, mime, sizeBytes}` · drive: `{storage:"drive", storageKey, fileName, mime, sizeBytes}`(클라이언트가 Drive 토큰으로 받는다) | 404 · 502 `STORAGE_ERROR` |
| `DELETE /note-files/{fileId}` | — | 200 `{ok:true}`(supabase면 휴지통 → 커밋 뒤 `purge`) | 404 |

- `NoteFileDto = {id, docId, storage, fileName, mime, sizeBytes, sortOrder, createdAt}` — `storage_key`는 supabase일 때 DTO에 넣지 않는다(drive는 `url` 응답에서만 준다).
- 서비스 흐름은 TB-1 `TabSongService.create`를 그대로 따른다(P10): 트랜잭션 A(`tierContext` → 노트 소유·`kind` 확인 → `checkLimits`) → 키 `notes/{userId}/{docId}/{fileId}.{ext}` 업로드(Content-Type `application/octet-stream`, P12) → 트랜잭션 B(`tierContext(lock = true)` → 노트가 아직 있는지 → `checkLimits` 재검사 → INSERT, `sort_order = max + 1`) → 실패하면 `cleanupUploadedFile`(키로 `note_files` 커밋 여부 확인). 트랜잭션 B에서 노트가 이미 지워졌으면 404이고 보상 정리가 파일을 지운다.
- `checkLimits(ctx, size)` = `requireNoteFiles(ctx)`(무료 403) → `requireNoteFileCount(docId)` → `requireFileBytes(ctx, size)`(§8). Drive 등록은 `requireDrive` + 개수만.
- `kind = block` 노트에도 파일을 붙일 수 있다(NT-3 이미지 블록이 `fileId`로 가리킨다).

### 5.4 형식 검증 `NoteFileValidator.detect(fileName, bytes): NoteFileType` (순수 함수, I/O 없음)

| 형식 | 확장자 | 매직바이트(앞부분) | 저장 `mime`·키 확장자 |
| --- | --- | --- | --- |
| PDF | `.pdf` | `25 50 44 46 2D`(`%PDF-`) offset 0 | `application/pdf` · `pdf` |
| PNG | `.png` | `89 50 4E 47 0D 0A 1A 0A` | `image/png` · `png` |
| JPEG | `.jpg`·`.jpeg` | `FF D8 FF` | `image/jpeg` · `jpg` |
| WebP | `.webp` | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`(`RIFF….WEBP`) | `image/webp` · `webp` |

- 확장자와 매직바이트가 **둘 다** 맞아야 한다. 아니면 400 `INVALID_NOTE_FILE`. 빈 파일 400. 파일 이름은 `TabFileValidator.sanitizeFileName` 재사용(P11).
- Drive 등록은 바이트가 없으므로 `mime` 허용 목록 + `fileName` 확장자 일치 + `sizeBytes` 1..2GB 범위 + `storageKey`가 `TakeService.DRIVE_FILE_ID_REGEX`(P8)인지만 본다.

### 5.5 페이지 주석

| 메서드·경로 | 요청 | 응답 | 오류 |
| --- | --- | --- | --- |
| `GET /note-files/{fileId}/annotations` | — | `{pages: [{page, data, rev, updatedAt}]}` (`page` 순) | 404 |
| `PUT /note-files/{fileId}/annotations/{page}` | `{data: object, rev: int}` — 새 쪽은 `rev: 0` | 200 `{page, data, rev, updatedAt}` | 400 `page` 1~2000·`data` 객체 아님 · 404 · 409 `NOTE_REV_CONFLICT`(detail `{rev}`; 새 쪽인데 이미 있으면 그 `rev`) · 413 `NOTE_ANNOTATION_TOO_LARGE`(256KB) |
| `DELETE /note-files/{fileId}/annotations/{page}` | — | 200 `{ok:true}`(없어도 성공) | 404 파일 |

- `rev: 0`이면 `INSERT … ON CONFLICT DO NOTHING` 후 영향 행 0이면 409. 그 밖은 `UPDATE … WHERE rev = ?` 영향 행으로 판단(N9).
- 주석은 스토리지를 쓰지 않으므로 무료·다운그레이드 사용자도 기존 파일에 저장할 수 있다(N8). 본문 상한은 `receiveJsonObjectLimited(256KB + 여유 1KB)`.

## 6. 한도 상수 (`TierService.kt`에 추가)

| 칸 | FREE | PRO | PRO_PLUS | owner |
| --- | --- | --- | --- | --- |
| `noteFolders: Int?` | **0**(만들기 403 `TIER_UPGRADE_REQUIRED`) | 15 | 30 | null |
| `noteDocs: Int?` | 30 | 1000 | 2000 | null |
| `noteFiles: Boolean` | false | true | true | true |
| `fileBytes: Long?` (TAB + 노트 첨부 Supabase 합) | 20MB | 500MB | 1GB | null |

- 기존 `tabBytes`는 **`fileBytes`와 같은 값으로 남긴다**(옛 클라이언트가 `/me` `limits.tabBytes`를 읽는다). 새 한도 검사는 `fileBytes`만 본다.
- 노트당 파일 수 20, 단건 20MB, 본문 1MB, 주석 쪽당 256KB는 티어와 상관없는 코드 상수(`NoteFileValidator`·`NoteDocService` companion).

## 7. 삭제 정리 (같은 트랜잭션에서 휴지통 → 커밋 뒤 `purge`, P13)

| 경로 | 처리 |
| --- | --- |
| `DELETE /note-files/{fileId}` | 프로필 잠금 → 소유 확인 → supabase면 키를 `storage_trash`에 넣고 id 반환 → 행 삭제(주석은 CASCADE) → 라우트가 `purge` |
| `DELETE /note-docs/{id}` | 프로필 잠금 → 소유 확인 → 그 노트의 supabase 파일 키를 `FOR UPDATE`로 잠가 모아 휴지통 → 노트 삭제(파일·주석 CASCADE) → `purge` (backend-kotlin §4: 잠금 → id 목록 → 삭제) |
| `DELETE /note-folders/{id}` | 파일 정리 없음(노트는 남고 `folder_id`만 NULL) |
| `ProfileService.deleteMe` | 녹음 키·TAB 키에 더해 `note_files.storage = 'supabase'` 키를 모두 휴지통에 넣는다(P14) |
| Drive 참조 파일 | 서버는 행만 지운다. Drive 파일 삭제는 클라이언트가 한다(녹음 Drive와 같음, P8) |
| 업로드 도중 노트 삭제 경합 | 업로드 트랜잭션 B가 노트를 못 찾으면 404 → 보상 정리가 키를 지운다. 노트 삭제가 먼저 커밋되고 파일 행이 뒤에 들어갈 수는 없다(FK + B의 존재 확인이 같은 트랜잭션) |

## 8. 기존 코드 변경 (전수)

### 8.1 바꾸는 곳

| 경로 | 변경 |
| --- | --- |
| `Tables.kt` | 새 테이블 4개, `NotesTable.folderId`, `ALL_TABLES` |
| `NoteService` DTO·`rowToNoteSummaryDto`·`rowToNoteDetailDto` | `folderId: String? = null` 덧붙이기. 새 메서드 `setFolder(userId, noteId, folderId?)`(노트북 소유 확인, 기존 outbox 호출은 **넣지 않는다**) |
| `NoteRoutes` | `PUT /notes/{noteId}/folder` 한 경로 추가. 기존 경로는 그대로 |
| `TierService` | §6 한도 칸·DTO 칸(`noteFolders`, `noteDocs`, `noteFiles`, `fileBytes`), 사용량 함수 `noteFolderCount`·`noteDocCount`·`noteFileBytesUsed`(supabase만)·`fileBytesUsed = tabBytesUsed + noteFileBytesUsed`, 검사 함수 `requireNoteFolderSlot`·`requireNoteDocSlot`·`requireNoteFiles`·`requireFileBytes`(413 `FILE_QUOTA_EXCEEDED`, detail은 `TAB_QUOTA_EXCEEDED`와 같은 모양) |
| `TabSongService.checkLimits` | `requireTabBytes(ctx, size)`의 **사용량을 `fileBytesUsed`로** 바꾼다(N5 A). 에러 코드 `TAB_QUOTA_EXCEEDED`·413·detail 모양·메시지 문구는 그대로, `usedBytes`·`limitBytes`만 합산 풀 기준 |
| `ProfileService` `/me` | `TierUsageDto`에 `noteFolders`, `noteDocs`, `noteFileBytes`, `fileBytes` 덧붙이기(기존 `tabBytes`는 TAB만 그대로). `deleteMe`에 §7 한 줄 |
| `api/JsonInput.kt` | `receiveJsonObjectLimited(maxBytes)` 추가(P16). 기존 함수 무변경 |
| `Main.kt` | 새 서비스·라우트 배선(`registerNoteWorkspaceRoutes(…, storageTrashService)`) |

### 8.2 새 파일

`service/NoteFolderService.kt`, `service/NoteDocService.kt`(노트·주석), `service/NoteFileService.kt`(업로드·Drive 등록·주소·삭제·보상), `service/NoteFileValidator.kt`, `routes/NoteWorkspaceRoutes.kt`, `db/migration/V16__note_workspace.sql`, 테스트 `note/NoteWorkspaceApiTest.kt`·`note/NoteFileApiTest.kt`·`note/NoteFileValidatorTest.kt`.

### 8.3 N5 A(합산)의 파급 확인

- 무료는 노트 첨부를 못 올리므로 무료 사용자의 `fileBytesUsed = tabBytesUsed`다. **무료 TAB 동작은 바뀌지 않는다.**
- 유료 사용자는 노트 첨부가 많으면 TAB 업로드가 413이 될 수 있다. 문구 "TAB 악보 저장 한도(…MB)를 넘습니다"는 NT-2에서 "파일 저장 한도"로 바꿀지 i18n과 함께 정한다(NT-1은 문구 무변경).
- 다운그레이드 뒤 유료 시절 첨부가 무료 20MB를 넘으면 무료 TAB 업로드도 막힌다. 데이터 유지 원칙(N8)의 당연한 결과로 보고, 프런트 안내(NT-2)에서 "첨부를 지우면 다시 올릴 수 있음"을 보여 준다.

## 9. 유지 계약 (바꾸지 않는다)

- `GET /notes`·`GET /notes/{id}`·`PATCH /notes/{id}`·`DELETE /notes/{id}`·`PUT /notes/{id}/collect`·`POST /notes/analyze`의 요청·응답·상태 코드(`folderId` 칸 하나 추가만). 고정 태그 규칙, 진행 수집, `progressions.note_id` FK.
- `notes` 테이블의 기존 칸·제약(`video_id NOT NULL` 등). ZIP 내보내기(`학습 영상 노트.csv`·md)는 AI 노트만 그대로 담는다. 새 노트는 1차에서 ZIP에 넣지 않는다(파일 자체를 되살릴 수 없다 — TB-1 T5와 같은 판단, README 한 줄 추가는 하지 않는다: ZIP 모양 변경을 최소화).
- `StorageClient` 인터페이스(새 메서드 없음), 단일 버킷 `takes`, `storage_trash` 스키마와 기존 cron 경로.
- TAB 한도 `tabSongs`, TAB 업로드 에러 코드·상태, 녹음 한도·녹음 Drive 규칙, `downgradeCleanup`.
- 폐기 기능 코드는 건드리지 않는다. 새 테이블은 그 코드가 읽지 않으므로 컴파일·동작 영향이 없다(N1 A의 이점).

## 10. 바꿀 파일 (승인 범위, 약 18개)

| 구분 | 파일 |
| --- | --- |
| DB | `src/main/resources/db/migration/V16__note_workspace.sql`(신규), `src/main/kotlin/ulevelp/db/Tables.kt` |
| 서비스 | `NoteFolderService.kt`·`NoteDocService.kt`·`NoteFileService.kt`·`NoteFileValidator.kt`(신규), `TierService.kt`, `TabSongService.kt`(한 줄), `NoteService.kt`, `ProfileService.kt` |
| 라우트·공통 | `routes/NoteWorkspaceRoutes.kt`(신규), `routes/NoteRoutes.kt`, `api/JsonInput.kt`, `Main.kt` |
| 테스트 | `note/NoteWorkspaceApiTest.kt`·`note/NoteFileApiTest.kt`·`note/NoteFileValidatorTest.kt`(신규), `db/DatabaseMigrationAndIntegrityTest.kt`(목표 버전 16·새 테이블), `song/TabSongApiTest.kt`(합산 한도 1건), 계정 삭제 테스트 파일(첨부 키 휴지통 1건 — 기존 `deleteMe` 테스트 위치를 구현 때 찾아 거기에 더한다) |

프런트(`frontend/**`)·확장(`extension/**`)·CSP는 이 Step에서 건드리지 않는다.

## 11. 구현 순서와 Git (승인 뒤)

브랜치 `feat/NT-1-note-workspace`(base `main`). 커밋 3개:

1. `feat(NT-1): V16 노트 워크스페이스 스키마·노트북·블록 노트` — V16, `Tables.kt`, `NoteFolderService`, `NoteDocService`(노트 CRUD·`rev`), `NoteService.setFolder`·`folderId`, `JsonInput`, 라우트 일부, 노트북·노트 한도(`noteFolders`·`noteDocs`), 마이그레이션 테스트. **혼자 검증 가능한 경계**(인계 시 여기서 끊는다)
2. `feat(NT-1): 노트 첨부 업로드·Drive 참조·파일 주소·삭제 정리·합산 총량` — `NoteFileValidator`, `NoteFileService`, `fileBytes` 합산·`TabSongService` 한 줄, `deleteMe`, `/me` 사용량
3. `feat(NT-1): 페이지 주석 저장(rev 충돌)` — 주석 경로·테스트

[시니어 직접 구현] 규칙대로 시니어는 핵심 구현 + 표적 테스트(§12의 ★) + 커밋·작업 브랜치 push까지, 전체 `./gradlew test`·PR 생성·CI 대기·결과 파일 `결과/NT-1.md`는 주니어 4단계.

## 12. 검증과 수용 기준

### 12.1 Kotlin 통합 (Testcontainers, `./gradlew test`)

| ID | 확인 |
| --- | --- |
| NT1-M1 ★ | Flyway 목표 버전 16, 새 테이블 4개·`notes.folder_id` 존재, 기존 노트 행이 그대로 읽힌다 |
| NT1-F1 | 무료 `POST /note-folders` → 403 `TIER_UPGRADE_REQUIRED`(feature `note_folders`). PRO 15개째 성공·16개째 403 `NOTE_FOLDER_LIMIT_EXCEEDED`(detail `nextTier = pro_plus`, `nextLimit = 30`). owner 무제한 |
| NT1-F2 | `PUT /note-folders/order` 부분집합·중복 400, 남의 id 404. `DELETE` 뒤 안의 노트·AI 노트 `folderId = null` |
| NT1-D1 ★ | A의 노트를 B가 `GET/PATCH/DELETE` → 404. A가 B의 노트북 id를 `folderId`로 넣기 → 404(노트·AI 노트 둘 다) |
| NT1-D2 | 무료 `POST /note-docs kind=document` → 403, `kind=block` 30개째 성공·31개째 403 `NOTE_DOC_LIMIT_EXCEEDED`. AI 노트는 세지 않는다 |
| NT1-D3 ★ | `PATCH body` 옛 `rev` → 409 `NOTE_REV_CONFLICT`(detail 현재 `rev`), 맞는 `rev` → `rev + 1`. 제목만 바꾸면 `rev` 그대로. `body` 1MB 초과 → 413 |
| NT1-L1 | `GET /notes` 응답이 V16 전과 같은 칸 + `folderId`만 더해짐(유튜브 노트 바이트 비교) |
| NT1-U1 ★ | PDF 업로드 성공 → 키 `notes/{A}/{doc}/{file}.pdf`, Content-Type octet-stream, `GET /note-files/{id}/url` TTL 300. B가 주소 요청 → 404 |
| NT1-U2 | 확장자·매직바이트 불일치(`.pdf`인데 PNG 바이트, `.png`인데 SVG 텍스트) → 400 `INVALID_NOTE_FILE`. 20MB+1 → 413. 빈 파일 400. 노트당 21번째 → 403 |
| NT1-U3 ★ | 합산 총량: PRO에서 TAB 400MB + 첨부 101MB → 413 `FILE_QUOTA_EXCEEDED`. 반대로 첨부 450MB 뒤 TAB 60MB → 413 `TAB_QUOTA_EXCEEDED`(`usedBytes` = 합산). 무료 TAB 동작은 V16 전과 같다 |
| NT1-U4 | 동시 업로드 2건이 한도 경계를 함께 넘으려 하면 하나만 성공(프로필 잠금 재검사), 실패 쪽 파일은 스토리지에서 지워진다(가짜 `StorageClient`로 키 확인) |
| NT1-U5 | 트랜잭션 B 실패 주입 → 업로드한 키 `delete` 호출. `delete`도 실패 → `storage_trash`에 그 키. 커밋 여부 확인 실패 → 지우지도 넣지도 않음(TB-1 테스트와 같은 3갈래) |
| NT1-U6 | 업로드 중 노트 삭제(트랜잭션 B 전에 노트 삭제) → 404, 키 정리 |
| NT1-V1 | 무료 Drive 등록 → 403(feature `drive`). PRO Drive 등록 성공, 총량에 세지 않음, `url` 응답이 `storage:"drive"`+`storageKey` |
| NT1-X1 ★ | 노트 삭제 → 그 노트의 supabase 키가 `storage_trash`에 들어가고 `purge` 호출, Drive 행은 휴지통에 안 들어감. 파일 삭제도 같다 |
| NT1-X2 | 계정 삭제 → 녹음·TAB·노트 첨부 키가 모두 `storage_trash`에 있다 |
| NT1-A1 | 주석 `rev:0` 새 쪽 성공, 같은 쪽 다시 `rev:0` → 409. 옛 `rev` → 409. 256KB 초과 → 413. B가 A 파일 주석 → 404 |
| NT1-A2 | 다운그레이드(유료→무료) 뒤: 기존 노트·파일 열람·주소·주석 저장·삭제 성공, 새 첨부·새 노트북 403 |

★ = 시니어 표적 테스트(커밋 단위로 먼저 통과시킬 것). 나머지는 시니어가 쓰고 주니어 4단계가 전체 실행으로 확인한다.

### 12.2 그 밖

- 잘못된 입력: 경로 UUID 형식 오류 404(기존 `parsePathUuid` 규칙, §14), `folder` 쿼리 `none`/UUID 외 400, JSON 아닌 본문 400, multipart 아닌 업로드 400(backend-kotlin §6 순서).
- `CancellationException`을 삼키지 않는다(backend-kotlin §2) — 보상 정리는 `NonCancellable` 안에서만.

## 13. 미확인 (구현 착수 전에 확인)

| ID | 확인할 것 | 방법 |
| --- | --- | --- |
| U1 | 운영 Supabase 버킷 `takes`의 `file_size_limit`이 **20MB 이상**인가(TB 출시 전 관문 ④는 10MB 기준) | Supabase 대시보드 Storage → `takes` 설정 또는 `storage.buckets` 조회(사람 확인, 쓰기 없음) |
| U2 | Cloud Run 요청 본문 상한(HTTP/1, 32MiB로 알려짐)과 운영 서비스 메모리에서 20MB `ByteArray` 업로드가 안전한가 | Cloud Run 공식 문서 "Request limits" 확인 + `gcloud run services describe`로 메모리 확인(읽기만) |
| U3 | PostgreSQL 16 테스트 DB와 운영 Supabase Postgres 버전 차이가 V16 문법(부분 유니크 인덱스, `jsonb_typeof` CHECK)에 영향이 없는가 | Supabase 프로젝트 설정의 Postgres 버전 확인 |
| U4 | 일반 키(`tabs/`·`notes/`)의 휴지통 재시도를 맡는 1분 cron 스케줄러가 운영에서 켜져 있는가(P13) | `gcloud scheduler jobs list`(읽기만). 꺼져 있으면 `purge` 실패분이 남으므로 사용자에게 알린다 |

### 13.1 확인 결과 (2026-11-26)

| ID | 결과 | 영향 |
| --- | --- | --- |
| U1 | 사용자 확인: 버킷 `takes` 파일 크기 제한 **Unset(프로젝트 기본 50MB)** | 단건 20MB 업로드 가능. TB 출시 전 관문 ④(10MB 이상)도 충족 |
| U2 | 사용자 확인: Cloud Run 메모리 **512MiB**, vCPU 1, 요청 크기 상한 **32MB**(필요하면 2GiB까지 증설 가능) | 20MB 단건 + multipart 여유 21MB 사전 거부는 상한 안. 업로드는 파일 전체를 `ByteArray`로 읽으므로 20MB 동시 업로드가 여러 건이면 512MiB에서 메모리 압박이 생길 수 있다 → NT-2 실사용 전 관찰, 부족하면 1GiB로 증설 권장 |
| U3 | 사용자 확인: 운영 Postgres **17.11.0.003**. 테스트는 `postgres:16-alpine` | V16은 부분 유니크 인덱스·`jsonb_typeof` CHECK·`ON DELETE SET NULL` 단일 FK만 쓴다(16·17 공통 문법) |
| U4 | `gcloud scheduler jobs list --location asia-northeast3`(읽기만): `ulevelp-notion-push`(`* * * * *`, ENABLED)와 `ulevelp-storage-trash`(`* * * * *`, ENABLED) 등 4개 | 일반 키(`tabs/`·`notes/`)의 휴지통 재시도는 매분 돈다. 변경 없음 |

## 14. 구현 기록 (2026-11-26 Mac Claude 시니어, `feat/NT-1-note-workspace`)

- 명세와 다르게 한 점:
  - TAB 합산(§8.1 `TabSongService` 한 줄) → `TierService.requireTabBytes` 안에서 `fileBytes`·`fileBytesUsed`를 쓰게 바꿨다. `TabSongService`는 무변경(같은 효과, 호출부 1곳).
  - 경로 UUID 형식 오류는 기존 `parsePathUuid`대로 404(§12.2의 400 정정). 쿼리 `folder` 형식 오류는 400.
  - 커밋은 §11의 3개 대신 **기능 커밋 1개**로 묶었다. 라우트 파일 하나가 세 묶음을 모두 담고, 테스트가 묶음을 가로질러 서로를 쓰기 때문이다(문서 커밋은 따로).
  - 테스트 파일: `NoteFileValidatorTest.kt`는 만들지 않고 형식 검사를 `NoteFileApiTest` NT1-U2(API 경유)로 확인했다. 합산 한도의 TAB 방향도 `TabSongApiTest` 대신 NT1-U3에 넣었다.
  - NT1-U5의 세 번째 갈래 "커밋 여부 확인 자체가 실패하면 보존"은 주입 수단이 없어 테스트하지 않았다(코드는 TB-1과 같은 구조). 대신 "업로드 응답 유실 → 502 + 삭제"를 확인했다.
- 관리자 무제한: `ownerLimits`에 `noteFolders = null`, `noteDocs = null`, `noteFiles = true`, `fileBytes = null`. NT1-F1(무료 티어 owner가 노트북 31개·노트 2001개), NT1-U3(owner 5GB 시드 뒤 업로드)로 확인. 특정 이메일이 owner인지는 운영 DB에서 확인하지 못했다(§진행 파일).
- 표적 테스트: `./gradlew test --tests 'ulevelp.db.DatabaseMigrationAndIntegrityTest' --tests 'ulevelp.note.NoteWorkspaceApiTest' --tests 'ulevelp.note.NoteFileApiTest'` → 새 27건 + 마이그레이션 전부 PASSED. 영향 회귀 `TabSongApiTest`·`NoteApiTest`·`tier.*`·`auth.*`·`ArchitectureGuardrailTest` `--rerun` → 61 PASSED, 실패 0. 전체 `./gradlew test`는 주니어 4단계.
