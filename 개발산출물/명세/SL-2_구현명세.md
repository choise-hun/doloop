# SL-2 구현 명세 — 곡 순서·세션 삭제 서버 계약, ⑥ 드래그·패널 높이, ⑩ 세션 ✕

> 작업: SL-2 (1단계 시니어 명세) | 진행 파일: [진행_SL_곡목록분류.md](../진행_SL_곡목록분류.md) §2 D4·D5·D6, §3 SL-2 행 | 시안: [SL_시안.html](SL_시안.html) §3(⑥)·§4(⑩)
> 기준 커밋: `main` `e996121`(PR #51 SL-1 머지) | 작성 2026-11-19 Mac Claude 시니어
> 상태: **승인(2026-11-19)** — 사용자가 §3 E1~E5 추천안 승인, E6 해소. 구현 결과는 [진행_SL](../진행_SL_곡목록분류.md) §3 "SL-2 시니어 구현 결과".

## 1. 범위와 배정

| 항목 | 내용 |
| --- | --- |
| 포함 | ⑥ 곡 순서 저장(V14 `songs.sort_order` + `PUT /api/v1/songs/order`), 수정 중일 때 왼쪽 핸들 드래그(D4), 곡 목록 패널 아래 끝 = 플레이어 버튼 섹션 아래 끝(961px 이상). ⑩ `DELETE /api/v1/sessions/{sessionId}`(D6 정리 규칙), 플레이어 "이 곡의 연습 기록" 세션 카드 아래 줄 오른쪽 ✕ → 확인 → 삭제 |
| 제외 | SL-3(나머지 29곳 선택창), D1 `--fill1` 색 확정(SL-1 사용자 확인 항목, 이 Step은 그 색을 새로 쓰지 않는다), Notion 동기화(폐기 기능 — 새 경로에 outbox를 넣지 않는다), 기록 화면(`log.html`) 세션 카드 ✕(E4), 폴더별 순서(D5에서 제외) |
| 배정 | **[시니어 직접 구현] → 주니어 4단계**(협업 §1.2 기본). 근거: 서버는 잠금·보상 정리(저장소 휴지통·공유 첨부)·소유권, 화면은 요청 세대(`songsListReqSeqRef`) 경합과 낙관적 갱신 되돌리기가 있어 고위험 |
| Step 구성 | E5 추천: **한 Step·한 브랜치(`feat/SL-2-order-delete`)·커밋 2개**(① 서버+Kotlin 테스트 ② 화면+e2e). (SL-3이 AS로 빠져 SL은 Step 3개라 SL-2a/2b로 나눌 여유는 있다. 그래도 나눈 두 Step 모두 상한 7을 넘고 화면이 서버에 의존해 따로 머지할 이득이 작다.) 파일 수는 골디락스 상한(7)을 넘는다(§10, 약 17개) — 서버 커밋이 독립 검증 단위이므로 커밋 경계에서 끊어 인계할 수 있다 |

## 2. 전제 표 (코드로 확인, `main` `e996121`)

| P# | 전제 | 근거 |
| --- | --- | --- |
| P1 | 마이그레이션은 V13까지, **V14 비어 있음**. 원격 브랜치 전체에도 V14 파일 없음 | `src/main/resources/db/migration/V13__share_copy_log.sql`, `git ls-tree` 전 원격 브랜치 검사 |
| P2 | `songs`에 순서 칸 없음. `BEFORE UPDATE` 트리거 `songs_updated`가 모든 UPDATE에서 `updated_at = now()` | `V1__init.sql:35-55`, `Tables.kt:66-89` |
| P3 | 곡 목록 순서 = `SongService.LIST_ORDER`(상태 → `last_date` 최근 → `updated_at` 최근). `GET /songs`와 **공개 폴더 사본 순서**가 같이 쓴다 | `SongService.kt:186-210`, `:656-661`; `SharedFolderSync.kt:15`, `:52-61` |
| P4 | 프런트는 서버 순서를 그대로 쓴다. 플레이어 폴더 목록 = 전체 목록을 분류로 거른 부분집합(전체·분류·미분류) | `PracticePage.tsx:1288`, `:1816-1824`; 기록 화면 `LogPage.tsx:296`도 `songs.list` 사용 |
| P5 | 분류 순서 API 패턴: `PUT /categories/order` `{ids}` → `requireArray` 개수 상한 → 각 원소 문자열·소문자 UUID 검사(아니면 400) → 서비스가 "내 분류 전부·중복 없음" 아니면 400 → `forEachIndexed` UPDATE → 200 전체 목록 | `CategoryRoutes.kt:54-69`, `CategoryService.kt:102-119`, `JsonInput.kt:188-200` |
| P6 | P5를 곡에 **그대로는 못 쓴다**: 곡은 폴더(부분집합)에서 끌고, "전부 담기" 규칙이면 폴더 화면에서 저장 불가. → §5에서 "부분집합 자리 유지" 규칙으로 바꾼다. 형식 검사·응답 모양은 재사용 | P4 |
| P7 | 곡 삽입 경로 6곳: `SongService.kt:304`(create), `:466`(migrateLocal), `PlaylistImportService.kt:130`, `ExportImportService.kt:847`, `CommunityService.kt:795`(공개 폴더 담기), `NotionSyncService.kt:220`·`:640`(폐기 기능) | grep `SongsTable.insert` |
| P8 | **세션 삭제 API 없음.** `/sessions`는 `GET`·`PATCH /{id}`(메모)와 공유 하위 경로(`POST/DELETE /{id}/share`, `DELETE /{id}/share/attachment`)뿐. `DELETE /{sessionId}`와 경로 충돌 없음 | `SessionRoutes.kt:40-85`, `EpisodeRoutes.kt:22-45` |
| P9 | 소유권: 경로 UUID 형식 오류 = `NotFoundException`(404). 서비스는 `id`+`user_id` 조건으로 찾고 없으면 404 → 다른 사용자 것도 404(A↔B 404) | `JsonInput.kt:202-210`, `SessionService.kt:187-200`, `SongService.kt:362-371` |
| P10 | 세션 하위 데이터: `takes` FK `(user_id, session_id, song_id)` CASCADE, `shared_practice_cards.session_id` UNIQUE CASCADE(신고도 CASCADE), `shared_card_attachments.session_id` CASCADE. 저장소 파일은 CASCADE로 안 지워지므로 휴지통(`storage_trash`)에 넣어야 한다 | `V1__init.sql:84-101`, `V10__shared_practice_cards.sql:4,27-29`, `V12__share_attachments.sql:11` |
| P11 | 곡 삭제 정리 규칙(D6 기준): `tierContext(lock=true)` → 존재 확인 404 → supabase 녹음 키를 휴지통에 넣기 → 공유 카드 `FOR UPDATE` → `removeShareAttachments { sessionId inList … }` → 행 삭제 → 라우트가 커밋 뒤 `storageTrashService.purge(ids)`. drive 녹음은 사용자 드라이브 파일이라 지우지 않는다. outbox(`enqueueIfSyncEnabled`)는 Notion이라 새 경로에서 뺀다 | `SongService.kt:362-408`, `SongRoutes.kt:216-227`, `TakeService.kt:423-452`, `ShareAttachmentService.kt:80-96` |
| P12 | `songs.last_date`는 저장 때 `max(기존, 입력 날짜)`로만 올라간다. 세션을 지워도 지금은 내려가지 않는다 | `PracticeService.kt:118-133` |
| P13 | 누적 시간(`totalSeconds`)·기록 화면 집계는 `sessions.seconds` 합으로 매번 계산 → 세션 삭제로 자동으로 준다 | `SongService.kt:194-207`, `:230` |
| P14 | 세션 카드: `SongRecordPanel`(상태 `detailData`) → `SessionTimeline`(`SongRecordParts.tsx:420-480`) → `PracticeSessionCard`(`surface="player"`일 때 플레이어). 기록 화면도 `PracticeSessionCard`를 직접 쓴다(`LogPage.tsx:524`) | 각 파일 |
| P15 | 공유 상태 캐시는 모듈 전역(`useEpisodeShares.ts:6-14`). `removeShare`는 "철회됨"으로 표시하므로 삭제에는 맞지 않고 `invalidate()`(전체 다시 읽기)를 쓴다 | `useEpisodeShares.ts:111-122` |
| P16 | 배치: `.ppMain` 2열 grid(`minmax(0,1fr) 360px`, 행 `auto 1fr`, `align-items: start`), `.ppSide`가 2행을 걸친다. 플레이어 버튼 섹션 = `.ppActions`(2행). `.folderBody` `max-height: 320px`(≤960 360px) | `PracticePage.module.css:85-125`, `:1248-1265` |
| P17 | 곡 카드는 `<li><button class=ppSongBtn>` 하나. 수정 중이면 클릭 = 곡 수정 창. 서랍(`libOpen`)도 같은 `renderSongItem`을 `inline=false`로 쓴다 | `PracticePage.tsx:1879-1912` |
| P18 | 부모 재렌더: 플레이어는 재생 중 250ms·녹음 중 50ms마다 다시 그려진다 → 드래그 중 순서는 `useState`로 들고, effect 의존성에 렌더마다 새 배열을 넣지 않는다 | `frontend-state.md` §6 |
| P19 | Exposed 0.56.0. `databaseGenerated()` 사용 가능 여부는 **미확인**(구현 첫 단계에서 컴파일로 확인) | `build.gradle.kts:18` |
| P20 | (E6에서 해소) 옛 SL-3 겹침: `SongRecordParts.tsx:184`에 `<select class="ab-select">`(SL-3 대상 "기록 카드 1곳"). SL-2는 같은 파일의 `SessionTimeline`(`:420-480`)에 prop 1개를 통과시켜야 한다 → **같은 파일 동시 수정**(E6) | grep `<select` |

## 3. 사용자 결정 (승인 필요)

| ID | 질문 | 추천 | 대안 |
| --- | --- | --- | --- |
| E1 | 곡 순서를 어디까지 쓰나 | **모든 곡 목록에 한 순서**: `GET /songs`(플레이어·기록 화면), 공개 폴더 사본 순서 모두 `sort_order`. 상태·마지막 연습일 자동 정렬은 없어진다. 기존 곡은 V14에서 지금 순서 그대로 번호를 매기므로 첫 화면은 바뀌지 않는다 | 플레이어만 `sort_order`, 기록 화면·공개본은 옛 자동 정렬(응답에 순서 필드 추가, 정렬 2개 유지) |
| E2 | 새로 넣은 곡의 자리 | **맨 위**(방금 넣은 곡을 바로 연습) | 맨 아래 |
| E3 | 세션을 지운 뒤 곡의 "마지막 연습일" | **남은 세션의 가장 늦은 날짜로 다시 계산**(없으면 비움) | 그대로 둠(지운 날짜가 계속 보일 수 있음) |
| E4 | ✕를 어느 화면에 두나 | **플레이어 "이 곡의 연습 기록"만**(요청 ⑩ 범위) | 기록 화면 카드에도 |
| E5 | Step 구성 | **한 Step·한 PR, 커밋 2개(서버 → 화면)** | SL-2a 서버 / SL-2b 화면으로 분리(SL Step 4개, 상한 안. PR 2개·머지 2번) |
| E6 | SL-3과 `SongRecordParts.tsx`(·i18n 3파일) 겹침 | **해소(2026-11-19 갱신):** 옛 SL-3을 [AS](../진행_AS_선택창전환.md)로 이관하고 `SongRecordParts.tsx`를 고치는 AS-2를 SL-2 머지 뒤로 미뤘다. 병렬 AS-1(코드 화면)은 겹치는 파일이 없고 새 i18n 키도 만들지 않는다 → **SL-2는 기다리지 않고 바로 시작** | — |

확인 창 방식은 결정하지 않고 SL-1 곡 삭제와 같은 `window.confirm`으로 맞춘다(자유 범위, 시안 문구 사용).

## 4. DB — `V14__song_sort_order.sql`

```sql
-- SL-2 ⑥: 곡마다 순서 1개(D5). 작은 값이 위.
ALTER TABLE songs ADD COLUMN sort_order INTEGER;

-- 기존 곡: 지금 목록 순서(LIST_ORDER) 그대로 0,1,2…  updated_at을 건드리지 않게 트리거를 잠시 끈다
ALTER TABLE songs DISABLE TRIGGER songs_updated;
UPDATE songs s SET sort_order = r.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY CASE status WHEN 'practicing' THEN 0 WHEN 'paused' THEN 1 WHEN 'done' THEN 2 ELSE 99 END,
             last_date DESC NULLS LAST, updated_at DESC, id
  ) - 1)::int AS rn
  FROM songs
) r
WHERE s.id = r.id;
ALTER TABLE songs ENABLE TRIGGER songs_updated;

ALTER TABLE songs ALTER COLUMN sort_order SET NOT NULL;
CREATE INDEX songs_user_sort_idx ON songs (user_id, sort_order);

-- 새 곡(E2 맨 위): 값을 안 주면 그 사용자 최솟값 - 1. 삽입 경로 6곳(P7)을 고치지 않고 한 곳에서 처리
CREATE OR REPLACE FUNCTION songs_default_sort_order() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MIN(sort_order), 0) - 1 INTO NEW.sort_order FROM songs WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER songs_sort_order_default BEFORE INSERT ON songs
  FOR EACH ROW EXECUTE FUNCTION songs_default_sort_order();
```

- E2가 "맨 아래"면 `COALESCE(MAX(sort_order), -1) + 1`로 바꾼다.
- 동시 삽입으로 같은 값이 생길 수 있다 → 읽기 순서에 동점 규칙을 둔다(§5.3). 순서 저장 때 전체를 0..n-1로 다시 매겨 동점을 없앤다.
- Exposed: `val sortOrder = integer("sort_order").databaseGenerated()`. 0.56에서 못 쓰면(P19) `integer("sort_order").nullable()`로 선언(DB는 NOT NULL, 삽입 때 값을 안 보내 트리거가 채움)하고 결과 파일에 적는다. `.default(0)`은 금지(0을 보내 트리거가 못 채움).
- 마이그레이션 검사: `DatabaseMigrationAndIntegrityTest`에 V14 적용 뒤 (a) 기존 곡 번호가 옛 순서와 같고 `updated_at` 불변 (b) 값 없이 넣은 곡이 그 사용자 최솟값-1 (c) 다른 사용자 곡 값에 영향 없음.

## 5. API ① `PUT /api/v1/songs/order`

### 5.1 요청·응답

| 항목 | 계약 |
| --- | --- |
| 인증 | `SupabaseAuthPlugin`(기존 `/songs` 라우트 안). 없으면 401 |
| 본문 | `{"ids": ["<uuid>", …]}` — 화면에 보이는 폴더의 곡 id를 **새 순서대로**. 1개 이상 `SongService.MAX_ORDER_IDS = 1000`개 이하(티어 상한 150보다 넉넉하게, 다운그레이드·가져오기 대비) |
| 200 | `SongListResponse { songs: [SongDto…] }` — `GET /songs`(상태 필터 없음)와 같은 전체 목록·같은 순서. `Cache-Control: no-store` |
| 400 `INVALID_INPUT` | `ids` 없음·배열 아님·0개·1000개 초과, 원소가 문자열 아님·소문자 UUID 형식 아님(P5와 같은 검사·같은 문구 `ids 형식이 올바르지 않습니다.`), 중복 id(`ids에 같은 곡이 두 번 있습니다.`) |
| 404 `NOT_FOUND` | id 중 하나라도 내 곡이 아님(없음·지워짐·**다른 사용자 곡**) — `곡을 찾을 수 없습니다.` 이때 DB 무변경 |
| SongDto | 필드 추가 없음(`sortOrder`를 응답에 넣지 않는다 — 순서는 배열 순서로만 전달). 프런트 타입 변경 없음 |

라우트는 `put("/order")`를 `route("/songs")` 안에 둔다. 리터럴 경로라 `/{songId}` 계열과 충돌하지 않는다(`/songs`에는 `PUT /{songId}`가 없다, `SongRoutes.kt:151-227`).

### 5.2 서비스 `SongService.reorder(userId, ids): List<SongDto>` (한 `dbQuery`)

1. `tierContext(userId, lock = true)` — 프로필 행 잠금으로 곡 생성·삭제·다른 순서 저장과 직렬화(새 곡 트리거의 MIN 계산과 경합 방지).
2. 내 곡 전부를 `sort_order ASC, created_at DESC, id ASC`로 읽는다(`FOR UPDATE`).
3. `ids` 중 내 곡에 없는 것이 있으면 `NotFoundException("곡을 찾을 수 없습니다.")`.
4. **부분집합 자리 유지**: 전체 순서에서 `ids` 곡들이 차지한 자리(인덱스)를 오름차순으로 모으고, 그 자리에 `ids` 순서대로 다시 넣는다. 나머지 곡은 제자리.
5. 결과 전체를 0..n-1로 매기고, **값이 바뀐 행만** UPDATE(`updated_at` 트리거가 불필요하게 돌지 않게).
6. `SharedFolderSync.resyncCategories(this, userId, null)` — 공개 폴더 사본 순서 반영(E1 추천일 때).
7. 같은 트랜잭션에서 목록을 읽어 반환(`list`의 본문을 `Transaction` 확장 함수로 빼서 `list`·`reorder`가 함께 쓴다).

예: 전체 `[A,B,C,D,E]`, 폴더(분류 X) = `[B,D,E]`, 화면에서 `[E,B,D]`로 끌기 → 자리 `{1,3,4}`에 E,B,D → `[A,E,C,B,D]`.

### 5.3 정렬 변경

- `LIST_ORDER` = `sort_order ASC` → `created_at DESC` → `id ASC`(E1 추천). `status` 필터(`?status=`)는 그대로 거르기만 한다.
- `SharedFolderSync.kt:55`의 select 칼럼에 `sortOrder`·`createdAt`·`id`를 넣고, `:15` 주석을 새 규칙으로 고친다.
- `SongApiTest` S4(`SongApiTest.kt:219-310`)는 옛 순서를 단언한다 → 승인된 요구 변경이므로 "V14 번호(넣은 순서 반대)·`sort_order`" 기준으로 고치고 결과 파일에 이유를 적는다.

## 6. API ② `DELETE /api/v1/sessions/{sessionId}`

### 6.1 요청·응답

| 항목 | 계약 |
| --- | --- |
| 인증 | `/sessions` 라우트의 `SupabaseAuthPlugin`. 없으면 401 |
| 경로 | `sessionId` UUID. 형식 오류는 `parsePathUuid` → 404(기존 동작) |
| 200 | `{"ok": true}`, `Cache-Control: no-store` (곡 삭제와 같은 모양) |
| 404 `NOT_FOUND` | 없음·이미 지움·**다른 사용자 세션** — `연습 기록을 찾을 수 없습니다.`(메모 수정과 같은 문구). DB·저장소 무변경 |
| 본문 | 없음(읽지 않는다) |

`registerSessionRoutes`에 `storageTrashService` 인자를 추가하고 `Main.kt:368` 호출을 맞춘다(`Main.kt:210`에 이미 있음). 라우트는 `val ids = sessionService.delete(user.id, sessionId)` → `storageTrashService.purge(ids)` → 응답(곡 삭제 `SongRoutes.kt:216-227`과 같은 순서).

### 6.2 서비스 `SessionService.delete(userId, sessionId): List<Long>` (한 `dbQuery`, P11 순서 그대로)

1. `tierContext(userId, lock = true)`.
2. `SessionsTable` `id = sessionId AND user_id = userId` `FOR UPDATE` 한 행 → 없으면 404. `songId`를 기억한다.
3. 이 세션의 `storage = 'supabase'` 녹음 `storage_key`마다 `StorageTrashTable.insert` → id 모음.
4. `SharedPracticeCardsTable` `session_id = sessionId` `FOR UPDATE`(곡 삭제와 같은 잠금 순서: 카드 → 첨부).
5. `removeShareAttachments { SharedCardAttachmentsTable.sessionId eq sessionId }` 결과 id를 합친다.
6. `SessionsTable.deleteWhere { id eq sessionId and userId eq userId }` — 녹음·공유 카드·신고는 CASCADE.
7. (E3 추천) 같은 곡의 남은 `max(date)`로 `songs.last_date`를 갱신(없으면 NULL). 값이 같으면 UPDATE하지 않는다.
8. outbox 없음(Notion 폐기). `SharedFolderSync` 호출 없음 — 공개본은 `video_id·a·b·rate·순서`만 복사하고(E1 추천이면 순서에 `last_date`를 안 씀) 세션을 담지 않는다.
9. id 목록 반환. 취소·실패 시 트랜잭션 롤백으로 휴지통 행도 함께 사라지고, 커밋 뒤에만 라우트가 `purge`한다(기존 보상 패턴, `backend-kotlin.md` §3·§4).

진행 중 연습과의 관계: 오늘 세션을 지운 뒤 플레이어가 저장하면 `(user, song, date)` 세션이 새로 생기고 그 뒤 쌓인 시간만 들어간다(기존 upsert 동작, 바꾸지 않는다).

## 7. 화면 ⑥ — 드래그 순서 이동·패널 높이 (`PracticePage.tsx`·`.module.css`)

### 7.1 상태

- `orderDraft: string[] | null`(드래그 중 화면 순서, 곡 id), `orderSaving: boolean`, `orderErr: string`. 모두 `useState`. 렌더할 목록 = `orderDraft`가 있으면 그 순서로 `visibleSongs`를 다시 배열(렌더 시점 계산, effect 없음).
- 수정 중이 풀리면(`editingList` false — 폴더 변경·곡 0개·로그아웃 포함) `orderDraft`를 버린다(렌더 시점 정규화: `editingList`가 false면 `orderDraft`를 무시).
- 폴더를 바꾸면 `orderDraft = null`.

### 7.2 드래그(D4: 수정 중에만 왼쪽 핸들)

| 항목 | 계약 |
| --- | --- |
| 핸들 | 수정 중이고 `visibleSongs.length >= 2`일 때만 각 `<li>` 안 카드 버튼 **왼쪽 형제**로 `<button type="button" class={styles.dragHandle} data-song-id aria-label="{t('practice.dragHandle', {title})}">`(⠿ 모양, 44×44 터치 영역, 색 `--muted`). 카드 버튼은 그대로(클릭 = 곡 수정 창). 서랍(`inline=false`)에는 없다 |
| 포인터 | `pointerdown`(주 버튼) → `setPointerCapture` → `pointermove`에서 포인터 Y와 각 `li` 가운데를 비교해 `orderDraft` 갱신 → `pointerup` 저장, `pointercancel`·`Esc` = 취소(원래 순서). 핸들 `touch-action: none`(터치 스크롤과 충돌 방지, D4 근거). 움직임이 4px 미만이면 저장하지 않는다 |
| 자동 스크롤 | `pointermove`에서 포인터가 `#folderList` 위·아래 32px 안이면 그 방향으로 `scrollTop` 8px(타이머 없음) |
| 키보드 | 핸들 포커스에서 `ArrowUp`/`ArrowDown` = 한 칸 이동 후 바로 저장, 이동 뒤 같은 곡 핸들에 포커스 유지. 맨 끝에서는 무시 |
| 보이는 표시 | 끌고 있는 행 `data-dragging`(배경 `--bg2` 계열 기존 토큰, 새 색 금지 — `frontend-design.md`) |
| 저장 중 | `orderSaving` 동안 핸들 `disabled`(두 번째 드래그·키 무시) |

### 7.3 저장 흐름 (`frontend-state.md` §1)

1. 직전 목록 `prev = songsList`를 잡고, `ids = orderDraft`(보이는 폴더 곡 id 순서).
2. 낙관적 반영: §5.2-4와 같은 "자리 유지" 함수로 `songsList`를 바로 재배열(순수 함수 `applySubsetOrder(list, ids)` — 프런트 단위 테스트 대상). `orderDraft = null`.
3. `mySeq = ++songsListReqSeqRef.current`(진행 중 목록 읽기 응답을 버린다), `myUid` 캡처, `orderSaving = true`.
4. `apiClient.songs.reorder(ids)` → `mySeq`·`myUid`가 그대로면 `setSongsList(응답)`, `orderErr = ''`.
5. 실패: 세대·uid가 그대로면 `setSongsList(prev)`로 되돌리고 `orderErr = 서버 message || t('practice.orderSaveFailed')`. 404(다른 기기에서 곡 삭제 등)면 되돌린 뒤 `loadSongList({ silent: true })`.
6. `finally`: 같은 세대일 때만 `orderSaving = false`.
7. `orderErr`는 `.folderStatus` 안 `<p id="folderOrderErr" class="note">`(오류 색 `.folderErr`), 다음 드래그 시작·폴더 변경 때 지운다.

`apiClient.songs.reorder(ids: string[]): Promise<SongDto[]>`는 `reorderCategories`(`apiClient.ts:791-798`)와 같은 모양으로 `PUT /api/v1/songs/order`, 응답 `r.songs`. `songs` 묶음(`apiClient.ts:1935` 근처)에 `reorder` 추가.

### 7.4 패널 높이(961px 이상)

- 목표: `#ppFolderPanel` 아래 끝 = `.ppActions`(플레이어 버튼 섹션) 아래 끝(±1px). 목록은 패널 안에서 스크롤.
- 방법(구현 때 계산 스타일로 증명): `.ppSide { align-self: stretch }`, `#ppFolderPanel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column }`, `.folderBody { flex: 1 1 0; min-height: 160px; max-height: none; contain: size }` — `contain: size`로 목록 길이가 grid 행 높이를 키우지 않게 한다. 오른쪽 내용(구간 섹션+패널 머리+최소 160px)이 왼쪽보다 길면 맞춤을 포기하고 160px을 지킨다(그때 G 검사는 `known`이 아니라 실패로 보고 결과에 적는다).
- 960px 이하: 지금처럼 `max-height: 360px`(시안 §3 ⑥).
- 전역 규칙 확인: `frontend/src/styles/*.css`에 `.ppSide`·`contain` 덮어쓰기 없는지 구현 전 grep(`docs/문서_운영.md` §4-1).

## 8. 화면 ⑩ — 세션 카드 ✕

| 파일 | 변경 |
| --- | --- |
| `PracticeSessionCard.tsx` | prop `onSessionDeleted?: (sessionId: string) => void` 추가. `surface === 'player' && onSessionDeleted`일 때만 공유 상태 줄(`.shareStatusRow`) 오른쪽 끝에 `<button type="button" class={styles.sessionDeleteBtn} id={`sessionDelete-${surface}-${sessionId}`} aria-label={t('episode.deleteSession')}>✕</button>`(44×44, 프리셋 줄 ✕와 같은 모양 — 시안 §4) |
| 클릭 | `window.confirm(t('episode.deleteSessionConfirm', { date, duration: fmtSec(seconds) }))` — 문구 "{date} · {duration} 세션과 녹음 기록·공유 카드가 함께 지워지고 되돌릴 수 없습니다." 취소면 아무것도 안 함 |
| 삭제 중 | 버튼 `disabled`, `apiClient.sessions.remove(sessionId)`. 응답 뒤 `isCurrent()`(이미 있는 언마운트·uid 검사)가 거짓이면 무시 |
| 성공 | `invalidate()`(공유 캐시 다시 읽기, P15) → `onSessionDeleted(sessionId)` |
| 실패 | `actionMsg = 서버 message || t('episode.deleteSessionFailed')`, 버튼 다시 활성. 404면 이미 없는 세션이므로 성공과 같이 `onSessionDeleted` 호출 |
| `SongRecordParts.tsx` `SessionTimeline` | prop `onSessionDeleted` 통과만(E6 겹침) |
| `SongRecordPanel.tsx` | `removeSession(sessionId)`: `detailData.sessions`에서 빼고 그 세션 `takes`도 빼며, A/B 슬롯에서 지워진 녹음을 비운다(기존 `removeTake`와 같은 방식). 이어서 `loadSongRecord(songId, activeUid)`로 요약(누적 시간·마지막 연습일)을 다시 읽는다(기존 `reqSeqRef` 경합 방어). 새 prop `onSessionDeleted?: () => void`를 부모에 알린다 |
| `PracticePage.tsx` | `SongRecordPanel`에 `onSessionDeleted={() => void loadSongList({ silent: true })}` — 곡 카드의 마지막 연습일 메타를 새로 읽는다 |
| `apiClient.ts` | `deleteSession(sessionId)` = `DELETE /api/v1/sessions/{encodeURIComponent(id)}`, `sessions` 묶음(`apiClient.ts:1976`)에 `remove` 추가 |
| i18n `ko/en/ja.mts` | `episode.deleteSession`(이 연습 세션 삭제)·`episode.deleteSessionConfirm`·`episode.deleteSessionFailed`, `practice.dragHandle`(순서 이동: {title})·`practice.orderSaveFailed` |

## 9. 유지 계약 (바꾸지 않는다)

- 셀렉터: `#ppFolderPanel`·`data-editing`·`#folderSelect`(AppSelect `data-value`)·`#folderSelectLabel`·`#folderCount`·`#folderEditBtn`·`#folderList`·`.ppSongBtn`·`aria-current`·`#songEditDialog`·`#syncState`, 세션 카드 `memoInp-{surface}-{id}`·`sessionParts-…`·`sessionShareMenu-…`·`.tlCoverageBar`·`.take-row`·`.ab-select`(SL-3이 바꾸면 그쪽 계약을 따른다).
- `data-align-group="practice-side:left,right@961"`, `sr-left:left`.
- API: 기존 `/songs`·`/sessions`·`/categories` 응답 필드·상태 코드 불변. `PATCH /sessions/{id}` 메모 동작 불변. 오류 응답은 기존 `ApiErrorResponse { ok:false, source, status, code, message, retryAfter?, detail? }`(`ApiError.kt:17-26`)를 예외(`InvalidInputException`·`NotFoundException`)로만 만든다.
- 곡 수정 창(SL-1 ⑧)·분류 창(③)·선택창(⑤) 동작 불변.

## 10. 바꿀 파일 (승인 범위)

| 커밋 | 파일 | 이유 |
| --- | --- | --- |
| ① 서버 | `src/main/resources/db/migration/V14__song_sort_order.sql`(신규) | §4 |
| ① | `src/main/kotlin/ulevelp/db/Tables.kt` | `SongsTable.sortOrder` |
| ① | `src/main/kotlin/ulevelp/service/SongService.kt` | `LIST_ORDER`, `reorder`, 목록 읽기 공용화 |
| ① | `src/main/kotlin/ulevelp/routes/SongRoutes.kt` | `PUT /songs/order` |
| ① | `src/main/kotlin/ulevelp/service/SharedFolderSync.kt` | 정렬 칼럼·주석 |
| ① | `src/main/kotlin/ulevelp/service/SessionService.kt` | `delete` |
| ① | `src/main/kotlin/ulevelp/routes/SessionRoutes.kt`, `src/main/kotlin/ulevelp/Main.kt` | `DELETE /sessions/{id}`, 인자 |
| ① 테스트 | `src/test/kotlin/ulevelp/song/SongApiTest.kt`, `src/test/kotlin/ulevelp/session/SessionApiTest.kt`, `src/test/kotlin/ulevelp/community/ShareAttachmentLifecycleTest.kt`, `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt` | §11.1 |
| ② 화면 | `frontend/src/pages/PracticePage.tsx`·`.module.css` | ⑥·높이·⑩ 연결 |
| ② | `frontend/src/components/songRecord/PracticeSessionCard.tsx`·`.module.css`, `SongRecordPanel.tsx`, `SongRecordParts.tsx`(**E6**) | ⑩ |
| ② | `frontend/src/lib/apiClient.ts`, `frontend/src/lib/i18n/ko.mts`·`en.mts`·`ja.mts`(**E6 겹침 가능**) | API·문구 |
| ② | `frontend/src/lib/songOrder.mts`(신규, `applySubsetOrder`) + `test/sl2_song_order.test.js`(신규, `npm test` = `node --test test/*.test.js`) | 순수 함수 |
| ② 테스트 | `test/e2e/layout/practice.spec.js`(+필요하면 `test/e2e/support/mock-app.js`) | §11.2 |

겹침: 옛 SL-3은 AS로 이관(E6). `SongRecordParts.tsx`·`layout/practice.spec.js`를 고치는 AS-2는 SL-2 머지 뒤라 SL-2가 먼저 고친다. AS-1은 이 표의 파일을 건드리지 않는다.

## 11. 검증과 수용 기준

### 11.1 Kotlin 통합(Testcontainers, `./gradlew test`)

| ID | 내용 | 단언 |
| --- | --- | --- |
| SL2-K1 | 순서 저장 정상(전체) | 200, 응답 순서 = 요청 순서, 다시 `GET /songs`도 같음 |
| SL2-K2 | 부분집합 자리 유지(§5.2 예시 A~E) | `[A,E,C,B,D]` |
| SL2-K3 | A↔B: A가 B 곡 id를 섞어 보냄 | 404, A·B 곡 `sort_order` 전부 무변경 |
| SL2-K4 | 400 묶음: 빈 배열, 1001개, 중복, 대문자 UUID, 숫자 원소, `ids` 없음 | 각 400 `INVALID_INPUT`, DB 무변경 |
| SL2-K5 | 새 곡은 맨 위(E2), 동점 뒤 순서 저장이 0..n-1로 정리 | 삽입 직후 첫 번째, 저장 뒤 값 중복 0 |
| SL2-K6 | 공개 폴더 사본 순서가 새 순서를 따름(E1) | `shared_folder_items.position`(`V8__community.sql:63-75`) 순서 |
| SL2-K7 | 세션 삭제 정상: 녹음 2개(supabase 1·drive 1) | 200, 세션·녹음 행 0, supabase 키만 `storage.deleted`, drive 키 없음, 같은 곡의 다른 세션 유지, `totalSeconds` 감소, `last_date` = 남은 최신(E3) |
| SL2-K8 | 세션 삭제 A↔B | B 토큰으로 A 세션 → 404, A 세션·녹음·카드·저장소 무변경 |
| SL2-K9 | 없는·형식 오류 id, 두 번 삭제 | 404, 404 |
| SL2-K10 | 공유 카드+첨부가 있는 세션 삭제(`ShareAttachmentLifecycleTest` L3 옆) | 카드 0, 첨부 0, 복사본 키 `storage.deleted` |
| SL2-K11 | 마이그레이션(§4 끝) | 기존 순서 보존·`updated_at` 불변·트리거 기본값 |

중요 가드 Red/Green: K3·K8은 소유권 조건(`userId eq`)을 빼면 실패하는지 한 번 확인하고 결과 파일에 적는다(`testing-security.md` §1.1).

### 11.2 프런트

| ID | 내용 | 단언 |
| --- | --- | --- |
| SL2-U1 | `applySubsetOrder` 단위(`npm test`) | 예시 A~E, 빈 부분집합, 모르는 id 무시 |
| SL2-01 | 수정 중이 아니면 핸들 없음, 수정 중·곡 2개 이상이면 있음, 서랍에는 없음 | `.dragHandle` 개수 |
| SL2-02 | 키보드 ↓로 한 칸 이동 → `PUT /songs/order` 본문 = 새 순서, 응답 반영 | `page.waitForRequest`(sleep 금지) |
| SL2-03 | 포인터 드래그(mouse) 이동 → 저장 | 같음 |
| SL2-04 | 저장 실패 500 → 원래 순서로 되돌림·`#folderOrderErr` 표시 | 순서·문구 |
| SL2-05 | 저장 응답을 붙잡은 채 폴더 변경·계정 전환 → 늦은 응답이 화면을 덮지 않음 | 순서 |
| SL2-06 | 1150·1280: `#ppFolderPanel` 아래 = `.ppActions` 아래(±1), 390·768: `#folderList` 최대 360px | 기하 |
| SL2-07 | 세션 ✕ → confirm 취소 = 요청 없음, 확인 = `DELETE` 후 카드 사라짐·요약 다시 읽기·곡 목록 다시 읽기 | 요청·DOM |
| SL2-08 | 세션 삭제 실패 500 → 카드 유지·`actionMsg` | 문구 |

- `npm run build` → `npx playwright test test/e2e/layout/practice.spec.js`(시니어 표적), 전체 회귀·`LAYOUT_SHOTS=1` 4폭+다크 Q1~Q9(수정 중 핸들·세션 ✕ 열린 상태 포함)·PR·CI는 주니어 4단계.
- `test/e2e/i18n-lang.spec.js` 세 언어 `checkLayout`(핸들 aria 문구 길이) 포함.

## 12. 구현 순서와 Git (승인 뒤)

1. `cd ../doloop-sl2 && git fetch && git switch -c feat/SL-2-order-delete origin/main`(PR #52 머지 뒤 main).
2. 커밋 ①: V14 → Tables → SongService/Routes → SessionService/Routes/Main → Kotlin 테스트 K1~K11 중 표적(K2·K3·K7·K8) 실행.
3. 커밋 ②: apiClient·songOrder → PracticePage ⑥ → 세션 ✕ → i18n → e2e SL2-01~08 표적 실행.
4. 진행 파일 §3에 시니어 구현 결과·주니어 실행 목록 기록 → push. PR은 주니어 4단계(협업 §1.2 시니어 직접 구현 예외).

## 13. 미확인

- P19 Exposed `databaseGenerated()`(§4 대안 있음).
- §7.4 `contain: size` + `align-self: stretch`로 960px 초과 4폭에서 맞춤이 되는지 — 구현 때 계산 스타일·SL2-06으로 증명.
- (해소) SL-3 i18n 겹침 — AS-1·AS-3은 새 i18n 키를 만들지 않는다(AS 명세 §4-6).
