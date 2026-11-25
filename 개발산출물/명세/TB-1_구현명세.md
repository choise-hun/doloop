# TB-1 구현 명세 — TAB 곡 서버 계약(V15 · 업로드 · 파일 주소 · 삭제 정리 · 하위 호환)

> 작업: TB-1 (1단계 시니어 명세) | 진행 파일: [진행_TB_악보플레이어.md](../진행_TB_악보플레이어.md) Step 표 TB-1 행
> 입력: [기능확장.md](../../기능확장.md) §1 #2·#3, §2.3 C, §4.1~4.2, §6 D2·D3·D7 · [결과/TB-0](../결과/TB-0_스파이크.md) §0 R2·R4, §3 · [.team_docs/rules/backend-kotlin.md](../../.team_docs/rules/backend-kotlin.md)
> 기준 커밋: `main` `b0d219d`(PR #68 머지) | 작성 2026-11-25 Mac Claude 시니어
> 상태: **승인(2026-11-25)** — 사용자가 §3 T1~T7 추천안을 승인했다. 구현 결과는 [진행_TB](../진행_TB_악보플레이어.md) TB-1 행과 결과/TB-1에 적는다.

## 1. 범위와 배정

| 항목 | 내용 |
| --- | --- |
| 포함 | V15 마이그레이션(`songs.media_type`, `video_id` nullable과 부분 유니크 인덱스, `tab_*` 칸), `POST /api/v1/songs/tab`(multipart 업로드·형식 검증·티어 한도·보상 정리), `GET /api/v1/songs/{songId}/tab-file`(서명 주소), 곡 삭제·계정 삭제 때 TAB 파일을 `storage_trash`에 넣기, `SongDto` 하위 호환, `video_id` nullable 때문에 바뀌는 기존 경로 전부(§7), 커뮤니티 공개본·연습 카드 공유·공개 연습 기록에서 TAB 곡 제외, Kotlin 테스트 |
| 1차 포맷 | `.gp`(Guitar Pro 7/8), `.xml`(MusicXML), `.mxl`(압축 MusicXML). TB-0에서 검증된 3종만 받는다(D2, 결과/TB-0 §0 R4). `.gp3`·`.gp4`·`.gp5`·`.gpx`는 출시 전 관문 R4를 통과한 뒤 허용 목록에 추가한다 |
| 제외 | 프런트 전부(TB-2: 업로드 화면, `?song=` 라우팅, `tabEngine`, CSP 개정), 악보 파일 교체·편집, 서버의 악보 내용 해석(마디·트랙 수 등), Google Drive 저장, 기기 로컬 캐시(TB-2), 학습 노트 첨부(NT-1), 텍스트 TAB |
| 배정 | **[시니어 직접 구현] → 주니어 4단계**(협업 §1.2 기본). 근거: 스토리지와 DB를 잇는 보상 정리, 프로필 잠금 아래 한도 재검사, 소유권 404, 업로드 파일 검증은 고위험이다 |
| Step 구성 | T7 참고. 추천은 한 Step·한 브랜치 `feat/TB-1-tab-songs`, 커밋 2개(① V15 + nullable 파급 + 하위 호환, ② TAB 업로드·파일 주소·삭제 정리·한도). 파일 수는 골디락스 상한(7)을 넘는다(§10, 약 20개). 커밋 ①은 혼자 검증할 수 있는 단위라서 그 경계에서 끊어 인계할 수 있다 |

## 2. 전제 표 (코드로 확인, `main` `b0d219d`)

| P# | 전제 | 근거 |
| --- | --- | --- |
| P1 | 마이그레이션은 **V14가 마지막**이고 V15는 비어 있다. 모든 브랜치 기록에도 `V15__*` 파일이 없다. 열린 PR은 0건이다 | `src/main/resources/db/migration/V14__song_sort_order.sql`, `git log --all -- 'src/main/resources/db/migration/V15*'` 결과 없음, `gh pr list` `[]` |
| P2 | `songs.video_id TEXT NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$')`와 `UNIQUE (user_id, video_id)`(이름 없는 제약이라 PostgreSQL 기본 이름은 `songs_user_id_video_id_key`)가 있다. CHECK는 NULL이면 통과한다 | `V1__init.sql:35-53` |
| P3 | Exposed `SongsTable.videoId = text("video_id")`(NOT NULL)와 `init { uniqueIndex(userId, videoId) }`. 스키마는 Flyway가 만들고, 테스트는 Testcontainers에 Flyway를 적용하며 목표 버전 "14"를 단언한다 | `Tables.kt:66-91`, `DatabaseMigrationAndIntegrityTest.kt:107-109`, `:753` |
| P4 | `SongDto.videoId: String`(nullable 아님). JSON 설정은 `encodeDefaults = true`, `explicitNulls = true`, `ignoreUnknownKeys = true`라서 기본값이 있는 새 칸도 응답에 나가고 null도 `null`로 나간다 | `SongService.kt:30-49`, `Main.kt:298-305` |
| P5 | `resumeUrl(publicAppUrl, videoId: String, …)`은 항상 `practice.html?v=<videoId>…`를 만든다. `rowToDto`, Notion 푸시, ZIP 내보내기가 이 함수를 부른다 | `SongService.kt:769-792`, `NotionPushWorker.kt:370`, `ExportImportService.kt:264` |
| P6 | 곡 등록 `create`: 트랜잭션 A에서 기존 곡을 확인하고, 밖에서 oEmbed를 부른 뒤, 트랜잭션 B에서 `tierContext(lock=true)` → `requireSongSlots(ctx, 1)` → `insertIgnore`. 한도 초과는 403 `SONG_LIMIT_EXCEEDED`(detail `limit·used·tier·nextTier·nextLimit`) | `SongService.kt:344-396`, `TierService.kt:133-138`, `:189-201` |
| P7 | 티어 한도(코드 상수): FREE 곡 100·녹음 5MB, PRO 곡 1000·녹음 100MB, PRO_PLUS 곡 2000·녹음 200MB. owner는 `ownerLimits`(곡 무제한). TAB 관련 한도는 아직 없다 | `TierService.kt:23-58` |
| P8 | `StorageClient`: `upload(key, bytes, contentType)`(`x-upsert: false`, 같은 키가 있으면 실패), `createSignedUrl(key, expiresInSec): String`(전체 URL), `delete(key)`(없는 파일도 성공), `download(key)`. 실패는 `StorageException`. 구현은 단일 버킷(기본값 `takes`) 하나다 | `StorageClient.kt`, `SupabaseStorageClient.kt:19-24` |
| P9 | 기존 키 규칙: 녹음은 `{userId}/{takeId}.{ext}`, 공유 첨부는 `shared/…`. `tabs/{userId}/{songId}.{ext}`는 어느 쪽과도 겹치지 않는다(UUID는 `tabs`가 될 수 없다) | `TakeService.kt:248`, `StorageTrashService.kt:77` |
| P10 | `storage_trash(id, storage_key, attempts, last_error, created_at, next_attempt_at)`. 버킷 칸이 없다(D7 단일 버킷이라 필요 없다). 커밋 뒤 라우트가 `storageTrashService.purge(ids)`로 바로 지우고, 실패분은 1분 cron(`NotionPushWorker.runCronBatch` 2단계, `attempts < 5`)이 다시 지운다 | `V1__init.sql:208-214`, `V12:28-29`, `StorageTrashService.kt:24-70`, `NotionPushWorker.kt:263-281` |
| P11 | 녹음 업로드의 보상 정리 원형: 트랜잭션 B가 실패하거나 취소되면 `withContext(NonCancellable)`에서 "이미 커밋됐는지"를 키로 확인하고, 커밋되지 않았으면 `delete`, 삭제도 실패하면 `storage_trash`에 넣는다 | `TakeService.kt:162-193`, `:370-376`, backend-kotlin §3 |
| P12 | multipart 원형: `isStorageConfigured`가 아니면 503 `STORAGE_UNAVAILABLE`, Content-Length로 먼저 413, `receiveMultipart(formFieldLimit=…)`, 파일은 `readRemaining(MAX+1)`로 읽어 초과면 413, 텍스트 파트는 FormItem·FileItem 둘 다 받는다 | `TakeRoutes.kt:41-110`, backend-kotlin §6 |
| P13 | 곡 삭제 `SongService.delete`: 프로필 잠금 → 404 확인 → supabase 녹음 키를 휴지통에 넣기 → 공유 카드 `FOR UPDATE` → 첨부 정리 → 행 삭제 → 공개본 재동기화. 라우트가 커밋 뒤 `purge` | `SongService.kt:433-479`, `SongRoutes.kt:248-258` |
| P14 | 계정 삭제 `ProfileService.deleteMe`: supabase 녹음 키만 휴지통에 넣고 `users`를 CASCADE로 지운다. **TAB 키를 넣지 않으면 계정 삭제 뒤 파일이 고아가 된다** | `ProfileService.kt:332-362` |
| P15 | 서명 주소 원형: 녹음은 TTL 3600초, 응답 `SignedUrlResponse(url, expiresIn)`, `StorageException`이면 502 `STORAGE_ERROR` | `TakeService.kt:386-421`, `:658` |
| P16 | `GET /songs` 목록을 쓰는 곳: 웹·앱 프런트(`apiClient.ts:698`)와 크롬 확장(`extension/background.js:161` POST, `:239` `by-video`). **이미 설치된 iOS·Android 앱은 옛 프런트를 번들로 들고 있다**(M1A-2). 프런트 타입 `videoId: string`은 null을 가정하지 않는다(`apiClient.ts:12` 등) | `frontend/src/lib/apiClient.ts`, `extension/background.js` |
| P17 | `SongsTable.videoId`를 읽는 경로(nullable이 되면 컴파일이 깨지거나 의미가 바뀌는 곳): `SongService`(rowToDto·resumeUrl·create·migrateLocal), `SharedFolderSync.copyCategory`(공개본 사본, `video_id`가 키), `EpisodeLogService.snapshot`(연습 카드 공개 스냅숏), `PracticeLogService.todayVideos`(공개 연습 기록 "오늘 곡"), `SessionService`(`SessionWithSongDto.videoId`), `ExportImportService`(ZIP 내보내기·가져오기 매칭), `CommunityService`·`PlaylistImportService`(유튜브 곡 넣기, `video_id`로 찾음), `NotionPushWorker`·`NotionSyncService`(폐기 기능, 동결) | grep `SongsTable.videoId` |
| P18 | `insertIgnore`는 PostgreSQL에서 대상 없는 `ON CONFLICT DO NOTHING`이 되므로 부분 유니크 인덱스에서도 그대로 동작한다(`create`·`CommunityService`·`PlaylistImportService`의 중복 무시) | Exposed PostgreSQL dialect |
| P19 | 연습 카드 공유는 `snapshot`이 `episodeConflict("SESSION_NOT_SHAREABLE")`로 거절하는 경로를 이미 가진다 | `EpisodeLogService.kt:52-66` |
| P20 | TB-0 fixture: `A.gp`는 ZIP(`VERSION`, `Content/score.gpif` 등), `B.mxl`은 ZIP(`META-INF/container.xml`, `score.musicxml`), `B.xml`은 `<?xml …?>` + `<!DOCTYPE score-partwise PUBLIC …>` + `<score-partwise>`, `broken.gp`는 `A.gp`의 앞 64바이트(ZIP이 잘림) | `개발산출물/자료/TB-0_재현물/fixtures/`, `unzip -l` |

## 3. 사용자 결정 (승인 필요)

| ID | 결정할 것 | 선택지 | 추천 |
| --- | --- | --- | --- |
| **T1** | 무료 TAB 업로드 허용·곡 수 | A) 무료 허용, **TAB 곡 5곡**까지. 유료·owner는 TAB 곡 수 제한 없음. 모든 TAB 곡은 기존 곡 한도(100/1000/2000)에도 포함된다 · B) 유료 전용(무료는 403 `TIER_UPGRADE_REQUIRED`) · C) 무료도 곡 한도 안에서 제한 없음 | **A** — 무료로 써 보고 유료로 넘어오게 하는 흐름이 녹음(무료 2곡)과 같다. 파일이 작아(TB-0 fixture 7~477KB) 비용 위험이 낮다 |
| **T2** | 용량 한도 | A) 단건 **10MB** + 사용자별 TAB 총량 FREE **20MB** / PRO **500MB** / PRO_PLUS **1GB**(D8 기준안), owner 무제한 · B) 단건 10MB만, 총량 없음 | **A** — 총량이 없으면 유료 곡 한도 2000 × 10MB = 20GB까지 열린다. 노트 첨부와 합산할지는 NT-1에서 정한다(TB-1은 TAB만 센다) |
| **T3** | 파일 내려받기 방식 | A) **서명 주소**(TTL 300초) — 녹음과 같은 방식, CSP `connect-src`에 Supabase가 이미 있다 · B) 서버가 바이트를 그대로 보내기(Cloud Run egress·메모리 사용) | **A**. TTL은 녹음(3600초)보다 짧게 둔다. 클라이언트가 받자마자 기기 캐시에 넣기 때문이다(기능확장 §4.1) |
| **T4** | 옛 클라이언트 보호(목록 응답) | A) 목록 응답(`GET /songs`, `PUT /songs/order`, `PATCH /songs/titles`, `GET /sessions`)은 **`include=tab` 쿼리가 있을 때만** TAB 곡·TAB 세션을 넣는다 · B) 항상 넣는다(옛 앱이 `videoId: null`을 받는다) | **A** — 이미 설치된 앱(P16)이 `videoId`를 문자열로 가정한다. TB-2 프런트만 `include=tab`을 보낸다 |
| **T5** | ZIP 내보내기 | A) 1차에서는 TAB 곡과 그 세션을 **빼고** README에 "TAB 곡은 포함되지 않음" 한 줄을 넣는다 · B) 유튜브 링크를 빈 칸으로 두고 포함한다 | **A** — 지금 ZIP 형식(유튜브 링크 열, 가져오기 매칭)이 유튜브를 전제로 하고, TAB 파일 자체는 ZIP에 들어가지 않아 되살릴 수 없다 |
| **T6** | 같은 파일 중복 업로드 | A) 막지 않는다(곡이 하나 더 생긴다. 프런트는 요청 중 버튼을 막는다) · B) `tab_sha256` 칸을 두고 같은 사용자의 같은 해시면 기존 곡을 200으로 돌려준다 | **A** — 1차는 단순하게 간다. B는 칸 하나와 인덱스 하나로 나중에 더할 수 있다 |
| **T7** | Step 나누기 | A) 한 Step·한 PR·커밋 2개(§1) · B) TB-1a(커밋 ①)·TB-1b(커밋 ②)를 따로 PR | **A** — 커밋 ①만으로는 사용자에게 보이는 변화가 없어 따로 머지할 이득이 작다(SL-2와 같은 판단) |

> 이 명세의 본문은 **추천안 기준**이다. 다른 선택지가 승인되면 §4~§9의 해당 줄만 바꾼다.

## 4. DB — `V15__song_media_type_and_tabs.sql`

```sql
-- TB-1: 곡 종류(유튜브 | TAB 파일). TAB 파일은 private 버킷 'takes'의 tabs/{userId}/{songId}.{ext}에 둔다(D7)
ALTER TABLE songs
  ADD COLUMN media_type     TEXT NOT NULL DEFAULT 'youtube' CHECK (media_type IN ('youtube', 'tab')),
  ADD COLUMN tab_storage_key TEXT,
  ADD COLUMN tab_file_name   TEXT CHECK (tab_file_name IS NULL OR char_length(tab_file_name) BETWEEN 1 AND 200),
  ADD COLUMN tab_file_size   BIGINT CHECK (tab_file_size IS NULL OR tab_file_size > 0),
  ADD COLUMN tab_format      TEXT CHECK (tab_format IS NULL OR tab_format IN ('gp', 'xml', 'mxl'));

ALTER TABLE songs ALTER COLUMN video_id DROP NOT NULL;   -- 형식 CHECK는 그대로(NULL이면 통과)

-- 유튜브 곡은 video_id가 있고 tab_* 칸이 비어 있다. TAB 곡은 그 반대다
ALTER TABLE songs ADD CONSTRAINT songs_media_shape_check CHECK (
  (media_type = 'youtube' AND video_id IS NOT NULL
     AND tab_storage_key IS NULL AND tab_file_name IS NULL AND tab_file_size IS NULL AND tab_format IS NULL)
  OR
  (media_type = 'tab' AND video_id IS NULL
     AND tab_storage_key IS NOT NULL AND tab_file_name IS NOT NULL AND tab_file_size IS NOT NULL AND tab_format IS NOT NULL)
);

-- (user_id, video_id) 유일성은 유튜브 곡에만. 기존 제약 이름은 V1의 자동 이름
ALTER TABLE songs DROP CONSTRAINT songs_user_id_video_id_key;
CREATE UNIQUE INDEX songs_user_video_uq ON songs (user_id, video_id) WHERE video_id IS NOT NULL;

CREATE UNIQUE INDEX songs_tab_storage_key_uq ON songs (tab_storage_key) WHERE tab_storage_key IS NOT NULL;
```

- 기존 행은 모두 `media_type = 'youtube'`가 되고 `video_id`가 있으므로 새 CHECK를 통과한다. 테이블 재작성은 `ADD COLUMN … DEFAULT` 상수라 일어나지 않는다(PostgreSQL 11+).
- `tab_mime` 대신 `tab_format`을 둔다(기능확장 §2.3 C와의 차이). 브라우저가 `.gp`에 보내는 MIME은 믿을 수 없고(`application/octet-stream` 등), 서버가 내용으로 판정한 형식이 더 정확하다. 저장소 Content-Type은 셋 다 `application/octet-stream`이다(§5.4).
- 제약 이름이 다른 환경이 있으면 마이그레이션이 실패한다. 구현 때 운영 DB에서 `\d songs`로 이름을 확인한다(§13 U2). 실패하는 편이 조용히 두 개의 유일성을 남기는 것보다 안전하므로 `IF EXISTS`는 쓰지 않는다.
- `Tables.kt`: `videoId = text("video_id").nullable()`, 새 칸 5개 추가, `init`의 `uniqueIndex(userId, videoId)`는 지운다(부분 인덱스는 Exposed DSL로 표현하지 않고 Flyway가 소유한다. 주석으로 남긴다).
- `DatabaseMigrationAndIntegrityTest`의 목표 버전 단언을 "15"로 바꾼다(기존 단언 수정 1건, 승인 범위).

## 5. API ① `POST /api/v1/songs/tab`

### 5.1 요청·응답

- 인증 필요(기존 `/songs` 플러그인). `multipart/form-data`:

| 파트 | 필수 | 규칙 |
| --- | --- | --- |
| `file` | ○ | FileItem, `originalFileName` 필수. **`MAX_TAB_FILE_BYTES` = 10,485,760**(T2) + 1바이트까지만 읽는다 |
| `title` | × | ≤ 300자. 비었거나 없으면 파일 이름에서 확장자를 뺀 값(그것도 비면 `SongService.UNTITLED`) |
| `artist` | × | ≤ 200자, 기본 `""` |

- 텍스트 파트는 FormItem과 FileItem을 모두 받는다. 한도 + 1바이트까지만 읽고, 넘으면 400 `INVALID_INPUT`(backend-kotlin §6).
- 성공: **201** `SongEnvelope{ song: SongDto }`(§8 모양, `mediaType: "tab"`, `videoId: null`), `Cache-Control: no-store`.

| 상황 | 응답 |
| --- | --- |
| 저장소 미설정 | 503 `STORAGE_UNAVAILABLE` |
| Content-Length > `MAX_TAB_REQUEST_BYTES`(11,534,336 = 11MB), 또는 파일이 10MB 초과 | 413 `TAB_TOO_LARGE` |
| multipart를 못 읽음, `file` 없음, 빈 파일, 텍스트 파트 한도 초과 | 400 `INVALID_INPUT` |
| 확장자가 허용 목록 밖이거나, 내용이 확장자와 맞지 않음(§5.2) | 400 `TAB_FORMAT_INVALID`(`detail.reason`: `extension` \| `content`) |
| 곡 한도 초과(P6) | 403 `SONG_LIMIT_EXCEEDED`(기존 그대로) |
| TAB 곡 수 초과(T1) | 403 `TAB_LIMIT_EXCEEDED`(detail은 `limitDetail` 모양: `limit·used·tier·nextTier·nextLimit`) |
| TAB 총량 초과(T2) | 413 `TAB_QUOTA_EXCEEDED`(detail `limitBytes·usedBytes·tier·nextTier·nextLimit`, `takeQuotaExceeded`와 같은 모양) |
| 스토리지 업로드 실패 | 502 `STORAGE_ERROR` |

- 경로는 리터럴 `/tab`이라 `/{songId}` 계열과 겹치지 않는다. 기존 `POST /songs`(유튜브)는 바꾸지 않는다.

### 5.2 형식 검증 `TabFileValidator.detect(fileName, bytes): TabFormat` (순수 함수, I/O 없음)

1. 파일 이름: 경로 구분자(`/`, `\`) 뒤의 마지막 조각만 쓴다. 제어 문자를 지우고 NFC로 정규화한 뒤 앞뒤 공백을 자른다. 비면 400. 200자를 넘으면 확장자를 지키고 앞부분을 자른다. 이 값이 `tab_file_name`이다(표시용. 저장소 키에는 쓰지 않는다).
2. 확장자(소문자)는 `gp`·`xml`·`mxl`만 받는다. 그 밖은 `TAB_FORMAT_INVALID(extension)`.
3. 내용 검사(확장자와 일치해야 한다):
   - **`gp`**: ZIP 로컬 헤더 `50 4B 03 04`로 시작하고, `Content/score.gpif` 항목이 있어야 한다.
   - **`mxl`**: ZIP 시그니처가 있고 `META-INF/container.xml` 항목이 있어야 한다. container의 `rootfile full-path`가 가리키는 항목도 있어야 한다. container는 `<!DOCTYPE`·`<!ENTITY`가 없을 때만 문자열로 찾는다(XML 파서를 쓰지 않는다).
   - **`xml`**: UTF-8이어야 한다(BOM 허용, 앞 64KB를 엄격 디코딩). 앞 64KB 안에서 처음 나오는 요소가 `<score-partwise` 또는 `<score-timewise`여야 한다. 그 앞의 프롤로그에는 XML 선언, 주석, 처리 명령, 내부 부분집합 없는 `<!DOCTYPE …>`만 허용한다. `<!ENTITY` 또는 `[`(내부 부분집합)가 있으면 거부한다.
4. ZIP 안전 장치(`gp`·`mxl`): `java.util.zip.ZipInputStream`으로 끝까지 읽되 항목 수 ≤ 200, 압축 해제 합계 ≤ 50MB를 넘으면 바로 거부한다. 항목 이름에 `..`이 있거나 `/`로 시작해도 거부한다. 잘린 ZIP(`broken.gp`, P20)은 여기서 `TAB_FORMAT_INVALID(content)`가 된다. 서버는 파일을 풀어서 저장하지 않고, 원본 바이트를 그대로 올린다.
5. 서버는 XML을 DOM/SAX로 파싱하지 않는다. XXE와 엔티티 폭탄을 서버 쪽에서 원천적으로 막기 위해서다. 악보 내용이 맞는지(렌더 가능 여부)는 클라이언트 alphaTab이 판정한다(TB-0 PLAY-04 손상 입력 경로).

### 5.3 서비스 `TabSongService.create(userId, input): SongDto`

기존 `TakeService.upload`(P11)와 같은 3단계다. 새 파일 `service/TabSongService.kt`에 둔다(`SongService`가 이미 841줄이고 스토리지 의존이 없기 때문이다).

1. **트랜잭션 A(읽기)**: `tierContext(userId)` → `requireSongSlots(ctx, 1)` → `requireTabSlots(ctx)` → `requireTabBytes(ctx, size)`. 빨리 실패하게 하는 사전 검사다.
2. **트랜잭션 밖**: `songId = UUID.randomUUID()`, `key = "tabs/$userId/$songId.$ext"`, `storageClient.upload(key, bytes, "application/octet-stream")`. `StorageException`이면 502.
3. **트랜잭션 B**: `tierContext(userId, lock = true)`로 프로필을 잠근 뒤 1의 검사 3개를 **다시** 한다(동시 업로드 대비). 그다음 `SongsTable.insert`(`id = songId`, `media_type = 'tab'`, `video_id = NULL`, `tab_*`, `title`, `artist`, `rate = 1.00`, `duration_sec = 0`, `sort_order`는 트리거가 채운다). 그 행으로 `rowToDto`를 만든다. **outbox 호출은 넣지 않는다.**
4. **보상 정리**(backend-kotlin §3): 3이 `Throwable`로 끝나면 `withContext(NonCancellable)`에서 `SongsTable.tabStorageKey eq key`인 행이 있는지 확인한다. 커밋되지 않았으면 `delete(key)`를 하고, 삭제도 실패하면 `storage_trash`에 넣는다. 그 뒤 원래 예외를 다시 던진다. 확인 쿼리 자체가 실패하면 "커밋 안 됨"으로 보지 **않고** 파일을 지우지 않은 채 `storage_trash`에도 넣지 않는다. 커밋된 파일을 잘못 지우는 것보다 고아 파일 하나가 낫기 때문이다. 이 경우에는 로그를 남긴다(P11 원형은 `getOrDefault(false)`라 반대로 동작한다. TAB에서는 커밋 직후 취소를 더 안전하게 막으려고 이렇게 바꾼다).
5. `CancellationException`은 어느 catch에서도 삼키지 않는다(backend-kotlin §2).

### 5.4 한도 함수 (`TierService.kt`에 추가)

- `TierLimits`에 `tabSongs: Int?`, `tabBytes: Long?`를 더한다. FREE `5`·`20_971_520`, PRO `null`·`524_288_000`, PRO_PLUS `null`·`1_073_741_824`, `ownerLimits`는 `null`·`null`(T1·T2 추천안).
- `Transaction.tabSongCount(userId)`, `Transaction.tabBytesUsed(userId)`(`sum(tab_file_size) WHERE media_type='tab'`), `Transaction.requireTabSlots(ctx)`, `Transaction.requireTabBytes(ctx, adding)`.
- **다운그레이드해도 기존 TAB 곡은 그대로 둔다.** 검사는 새로 넣을 때만 한다(기존 Q8 원칙, `TierService.kt:186` 주석).
- `TierLimitsDto`·`TierUsageDto`에 `tabSongs`·`tabBytes`를 기본값과 함께 더한다(`GET /me` 하위 호환, 새 칸만 늘어난다).

## 6. API ② `GET /api/v1/songs/{songId}/tab-file`

- 소유권: `id`·`user_id`·`media_type = 'tab'`로 찾는다. 없거나, 남의 곡이거나, 유튜브 곡이면 모두 **404** `NOT_FOUND`(존재를 드러내지 않는다). 경로 UUID 형식 오류도 기존처럼 404.
- 저장소 미설정 503 `STORAGE_UNAVAILABLE`, 서명 실패 502 `STORAGE_ERROR`.
- 200 `TabFileResponse{ url, expiresIn: 300, fileName, format, sizeBytes }`, `Cache-Control: no-store`. `url`은 `createSignedUrl(key, 300)`의 결과다.
- 키(`tab_storage_key`)는 응답 어디에도 넣지 않는다. 클라이언트 캐시 키는 TB-2에서 `${userId}:${songId}`로 정한다(곡마다 파일이 하나라 같은 뜻이다).

## 7. 기존 경로 변경 (`video_id` nullable 파급, 전수)

| 경로 | 변경 |
| --- | --- |
| `SongService.rowToDto` | §8 모양으로 채운다. `resumeUrl`은 아래 새 시그니처를 쓴다 |
| `SongService.resumeUrl` | `resumeUrl(publicAppUrl, videoId: String?, songId: UUID, pos, a, b, rate)`. `videoId`가 있으면 지금과 **글자 하나 다르지 않게** `?v=…`, 없으면 `?song=<songId>`에 같은 `t·a·b·r`. (TB-2가 `?song=`을 처리하기 전까지 이 링크는 곡 없는 플레이어를 연다. TAB 곡은 TB-2 화면에서만 만들 수 있으므로 실제로는 생기지 않는다) |
| `SongService.list`·`reorder`·`batchUpdateTitles`의 응답 목록 | `includeTab: Boolean`을 받는다. false면 `media_type = 'youtube'`만 돌려준다(T4). `reorder`는 `ids`에 TAB 곡이 있어도 받는다(새 클라이언트만 보낸다). "부분집합 자리 유지"는 전체(TAB 포함) 순서 위에서 계산한다 |
| `SongRoutes` `GET /songs`, `PUT /order`, `PATCH /titles` | 쿼리 `include`를 읽는다. 값이 정확히 `tab`일 때만 true, 그 밖의 값은 400 |
| `SongService.findByVideo`·`create`·`migrateLocal` | 변경 없음. 모두 `video_id` 값으로 찾으므로 TAB 곡은 걸리지 않는다 |
| `SongService.delete` | 같은 트랜잭션에서 그 곡의 `tab_storage_key`(있으면)를 `storage_trash`에 넣고 id를 반환 목록에 더한다. 라우트의 `purge`는 그대로 |
| `ProfileService.deleteMe` | 녹음 키와 함께 `songs.tab_storage_key IS NOT NULL`인 키를 모두 `storage_trash`에 넣는다(P14) |
| `SharedFolderSync.copyCategory` | 조회 조건에 `SongsTable.mediaType eq "youtube"`를 더한다. 분류에 TAB 곡이 있어도 공개본에는 들어가지 않는다(D3) |
| `EpisodeLogService.snapshot` | `video_id`가 null이면 `episodeConflict("SESSION_NOT_SHAREABLE")`(P19). TAB 연습 기록은 연습 카드로 공유되지 않는다 |
| `PracticeLogService.todayVideos` | `SongsTable.videoId.isNotNull()` 조건을 더한다. 공개 연습 기록 "오늘 곡"에 TAB 곡은 나오지 않는다(합계 초·연속일 집계는 기존대로 모든 세션을 센다) |
| `SessionService`(`GET /sessions`) | `SessionWithSongDto.videoId: String?`와 `mediaType: String = "youtube"`를 둔다. `include=tab`이 없으면 TAB 곡 세션을 빼고, 날짜별 합계도 응답에 실린 세션 기준으로 계산한다(T4) |
| `ExportImportService` 내보내기 | `media_type = 'youtube'`인 곡과 그 세션·녹음만 내보낸다. README에 한 줄을 넣는다(T5). 가져오기는 변경 없음(유튜브 링크가 있는 행만 곡이 된다) |
| `CommunityService`·`PlaylistImportService` | 변경 없음(유튜브 곡만 넣는다, P18) |
| `NotionPushWorker.pushSongUpsert`·ZIP 외 폐기 기능 코드 | 기능 변경 없이 **컴파일만 맞춘다**: `video_id`가 null인 행은 지금의 "행 없음"과 같은 경로(`return null`)로 처리한다. 새 TAB 경로에는 outbox 호출을 넣지 않는다 |

## 8. `SongDto` 하위 호환

```kotlin
data class SongDto(
    …기존 칸 그대로…,
    val videoId: String?,                 // 유튜브 곡은 지금과 같은 값, TAB 곡은 null
    …,
    val mediaType: String = "youtube",    // "youtube" | "tab"
    val tabFileName: String? = null,
    val tabFormat: String? = null,        // "gp" | "xml" | "mxl"
    val tabFileSize: Long? = null
)
```

- 유튜브 곡 응답은 **새 칸 4개가 늘어나는 것 말고는 바이트 단위로 같다**(`mediaType: "youtube"`, 나머지 3개는 `null`). 옛 프런트·크롬 확장은 `ignoreUnknownKeys` 같은 처리 없이도 모르는 칸을 무시한다(JS 객체).
- T4 덕분에 옛 클라이언트는 목록에서 `videoId: null`을 보지 않는다. 단건 응답(`GET /songs/{id}`, `POST /songs/tab`, `PATCH /songs/{id}`)은 그 곡을 아는 새 클라이언트만 부르므로 걸러내지 않는다.
- `tab_storage_key`는 DTO에 넣지 않는다.

## 9. 유지 계약 (바꾸지 않는다)

- `POST /songs`(유튜브 등록)의 요청·응답·멱등(같은 `videoId`면 200), `GET /songs/by-video/{videoId}`, `?v=` 링크 형식, 크롬 확장 경로.
- 녹음(`/takes`)·세션·프리셋은 곡 종류와 상관없이 `song_id`로 동작한다. TAB 곡에도 녹음·세션·프리셋을 만들 수 있다(D3). 무료 녹음 규칙(2곡·2분·5MB)도 그대로 적용된다.
- `storage_trash` 스키마와 cron, `StorageClient` 인터페이스(새 메서드 없음), 버킷 `takes` 단일 사용(D7).
- 곡 순서 트리거(V14)는 TAB 곡에도 그대로 동작한다(맨 위에 들어간다).

## 10. 바꿀 파일 (승인 범위)

| 구분 | 파일 | 커밋 |
| --- | --- | --- |
| 신규 | `src/main/resources/db/migration/V15__song_media_type_and_tabs.sql` | ① |
| 수정 | `db/Tables.kt`(SongsTable) | ① |
| 수정 | `service/SongService.kt`(DTO·rowToDto·resumeUrl·list/reorder/titles `includeTab`·delete 휴지통) | ①(delete는 ②) |
| 수정 | `routes/SongRoutes.kt`(`include` 쿼리, `POST /tab`, `GET /{songId}/tab-file`) | ①·② |
| 수정 | `service/SharedFolderSync.kt`, `service/EpisodeLogService.kt`, `service/PracticeLogService.kt`, `service/SessionService.kt`, `routes/SessionRoutes.kt`, `service/ExportImportService.kt`, `notion/NotionPushWorker.kt`(컴파일만) | ① |
| 신규 | `service/TabSongService.kt`, `service/TabFileValidator.kt` | ② |
| 수정 | `service/TierService.kt`(한도·사용량·DTO), `service/ProfileService.kt`(deleteMe), `Main.kt`(서비스 생성·라우트 인자) | ② |
| 테스트 | `db/DatabaseMigrationAndIntegrityTest.kt`(버전 15 + V15 검사), `song/SongApiTest.kt`(하위 호환·`include`), 신규 `song/TabSongApiTest.kt`, 신규 `song/TabFileValidatorTest.kt`, `support/ApiTestSupport.kt`(필요할 때만 인자 추가), `src/test/resources/tab/`(TB-0 fixture 4개 복사, 자체 제작이라 권리 문제 없음) | ①·② |

합계 약 20개. 이 표 밖의 파일을 고쳐야 하면 먼저 묻는다.

## 11. 검증과 수용 기준

### 11.1 Kotlin 통합 (Testcontainers, `./gradlew test`)

| ID | 검사 | 커밋 |
| --- | --- | --- |
| TB1-M1 | Flyway V1→V15 적용, 목표 버전 "15". 기존 유튜브 행이 `media_type='youtube'`로 남고 `updated_at`이 바뀌지 않는다 | ① |
| TB1-M2 | 제약: 유튜브 행에 `video_id` NULL → 거부, TAB 행에 `tab_storage_key` NULL → 거부, TAB 행에 `video_id` 값 → 거부, 형식 밖 `tab_format` → 거부 | ① |
| TB1-M3 | 같은 사용자 같은 `video_id` 두 번 → 거부(부분 인덱스). 같은 사용자 TAB 곡 둘(`video_id` NULL 둘) → 허용 | ① |
| TB1-C1 | 하위 호환: 유튜브 곡 `GET /songs` 응답의 기존 칸 값이 V14 때와 같고 `mediaType:"youtube"`·`tabFileName:null`·`tabFormat:null`·`tabFileSize:null`가 붙는다. `resumeUrl`은 `?v=`로 같은 문자열 | ① |
| TB1-C2 | TAB 곡(DB에 직접 넣음)은 `GET /songs`·`PUT /songs/order` 응답·`PATCH /songs/titles` 응답·`GET /sessions`에 없고, `include=tab`이면 있다. `include=foo`는 400 | ① |
| TB1-C3 | `include` 없이 유튜브 곡만 담은 `PUT /songs/order`가 TAB 곡의 자리를 바꾸지 않는다 | ① |
| TB1-C4 | TAB 곡이 든 분류를 게시하면 공개본 항목에 TAB 곡이 없다. 자동 연동 뒤에도 없다 | ① |
| TB1-C5 | TAB 곡 세션을 연습 카드로 공유하면 409 `SESSION_NOT_SHAREABLE`(기존 코드·상태). 공개 연습 기록 "오늘 곡"에 TAB 곡이 없다 | ① |
| TB1-C6 | ZIP 내보내기에 TAB 곡·세션이 없고 README에 안내 줄이 있다 | ① |
| TB1-U1 | `A.gp`·`B.xml`·`B.mxl` 업로드 → 201, `mediaType:"tab"`·`videoId:null`·`tabFormat`·`tabFileSize`(바이트 수와 같음)·`tabFileName`, 저장소 키 `tabs/{uid}/{songId}.{ext}`에 같은 바이트, Content-Type `application/octet-stream` | ② |
| TB1-U2 | 제목: `title` 파트가 있으면 그 값, 없으면 파일 이름에서 확장자를 뺀 값. 경로가 들어간 파일 이름(`../../x.gp`, `C:\a\b.gp`)은 마지막 조각만 남는다 | ② |
| TB1-U3 | 거부: `.gp5`·`.txt`·확장자 없음 → 400 `TAB_FORMAT_INVALID(extension)`. `broken.gp`, ZIP이지만 `score.gpif` 없음, `.gp` 이름의 MusicXML, `.xml` 이름의 ZIP, `<!ENTITY`가 든 xml, `<html>` xml, UTF-16 xml → 400 `(content)`. 어느 경우에도 저장소 업로드와 DB 행이 0이다 | ② |
| TB1-U4 | 크기: 10MB + 1바이트 → 413 `TAB_TOO_LARGE`, Content-Length 11MB 초과 → 413(본문을 읽기 전에), 빈 파일 → 400. ZIP 폭탄(압축 해제 50MB 초과)·항목 201개 → 400 | ② |
| TB1-U5 | 한도: 무료 TAB 5곡 뒤 6번째 → 403 `TAB_LIMIT_EXCEEDED`(detail `limit:5, used:5, tier:"free", nextTier:"pro", nextLimit:null`). 곡 한도가 다 찼으면 403 `SONG_LIMIT_EXCEEDED`. 총량 초과 → 413 `TAB_QUOTA_EXCEEDED`. owner는 한도 없음. 다운그레이드한 사용자의 기존 TAB 곡은 남고 새 업로드만 막힌다 | ② |
| TB1-U6 | 동시성: 무료 사용자가 4곡 상태에서 동시 업로드 2건 → 정확히 1건 201, 1건 403. 실패한 쪽의 저장소 파일은 지워진다(`FakeStorageClient.deleted`) | ② |
| TB1-U7 | 보상 정리: 트랜잭션 B 실패 주입 → 파일 삭제, 원래 오류 응답. 삭제도 실패(`failDelete`) → `storage_trash`에 그 키 1행. 업로드 실패(`failUpload`) → 502, DB 행 0 | ② |
| TB1-U8 | 취소: 트랜잭션 B 커밋 직후 취소(업로드 지연·요청 취소 주입) → 행이 있으면 파일을 지우지 않는다. 커밋 전 취소 → 파일 삭제 | ② |
| TB1-F1 | `GET /{id}/tab-file`: 본인 TAB 곡 → 200, `expiresIn:300`, `url`은 Fake 서명 형식, 응답에 저장소 키가 없음, `no-store`. 남의 TAB 곡·유튜브 곡·없는 id·잘못된 UUID → 404. `failSign` → 502. 저장소 미설정 → 503 | ② |
| TB1-D1 | TAB 곡 삭제 → `storage_trash` 삽입 후 `purge`로 Fake에서 삭제, 행 없음. 삭제 실패 → `storage_trash` 행이 남고 `attempts=1` | ② |
| TB1-D2 | 계정 삭제 → 그 사용자의 TAB 키 전부와 녹음 키가 `storage_trash`에 있다 | ② |
| TB1-S1 | TAB 곡에도 `PUT /songs/{id}/presets`·`PATCH /songs/{id}`·녹음 업로드가 유튜브 곡과 똑같이 동작한다 | ② |
| TB1-S2 | `POST /songs/tab`으로 만든 곡은 outbox(`sync_outbox`)에 행을 만들지 않는다 | ② |

- `TabFileValidatorTest`(단위): U3·U4의 판정을 바이트 배열로 직접 검사한다. 정상 3종, 경계(정확히 10MB, 항목 200개)를 포함한다.
- 변이 확인(Red/Green): TB1-U6(재검사 줄 제거 시 둘 다 201), TB1-F1(`media_type` 조건 제거 시 유튜브 곡 200), TB1-C2(`includeTab` 조건 제거 시 TAB 곡 노출) — 세 개는 조건을 지운 상태에서 실패하는 것을 한 번 보고 되돌린다.

### 11.2 그 밖

- `./gradlew test` 전체 통과(기존 수 + 새 테스트). 기존 단언 수정은 버전 "14"→"15" 1건만 예상한다. 그 밖의 기존 단언이 깨지면 고치기 전에 이유를 결과 문서에 적는다.
- 프런트 코드는 바꾸지 않으므로 `npm test`는 회귀 확인으로만 돌린다(주니어 4단계).
- 운영 반영: 머지 뒤 일반 배포. V15는 앞으로만 적용되는 변경이다. 되돌릴 때는 TAB 곡이 0건일 때만 역마이그레이션을 수동으로 적용할 수 있다(결과 문서에 SQL을 남긴다).

## 12. 구현 순서와 Git (승인 뒤)

1. `main`을 pull한 뒤 `feat/TB-1-tab-songs` 브랜치를 만든다.
2. 커밋 ①: V15 + Tables + §7 파급 + T4 `include` + 테스트 M·C → `./gradlew test` 통과.
3. 커밋 ②: Validator·TabSongService·라우트·한도·삭제 정리 + 테스트 U·F·D·S → `./gradlew test` 통과, 변이 3건 확인.
4. push 뒤 주니어 4단계(전체 회귀·PR·CI·결과 문서 `결과/TB-1.md`)로 넘긴다. 머지는 사용자가 한다.

## 13. 미확인 (구현 착수 전에 확인)

| U# | 항목 | 확인 방법 | 영향 |
| --- | --- | --- | --- |
| U1 | 운영 `takes` 버킷의 `allowed_mime_types`·`file_size_limit`. 오디오 MIME만 허용한다면 `application/octet-stream` 업로드가 거부된다. 이 세션의 Supabase 연결 계정에는 doloop 프로젝트(`vefrfhafmiiivpgjhqiu`)가 없어서 확인하지 못했다 | Supabase 대시보드 Storage › `takes` 설정, 또는 `select allowed_mime_types, file_size_limit from storage.buckets where id = 'takes'` | 허용 목록이 있으면 `application/octet-stream`을 추가해야 한다(사람 작업). 크기 제한이 10MB보다 작으면 T2 단건 한도를 낮춘다 |
| U2 | 운영 DB의 유일성 제약 실제 이름이 `songs_user_id_video_id_key`인지 | `\d songs` 또는 `pg_constraint` 조회 | 다르면 V15의 `DROP CONSTRAINT` 이름을 바꾼다 |
| U3 | Ktor `PartData.FileItem.originalFileName`의 비ASCII(한국어) 파일 이름 디코딩(RFC 5987 `filename*`) | 테스트 TB1-U2에 한국어 이름을 넣어 확인한다 | 깨지면 `filename*`을 우선 읽는 처리를 추가한다 |
