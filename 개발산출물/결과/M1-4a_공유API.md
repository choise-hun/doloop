# M1-4a 결과 — 커뮤니티 마이그레이션 V8 · 내 폴더 게시·자동 연동·복제·좋아요·팔로우·신고

- 날짜: 2026-11-06 (win)
- 입력: `결과/M1-1_스키마설계.md` §2-2·§4·§5-5·§6, `결과/M1-2a_티어쿼터관리API.md`, `진행_티어크레딧.md` §2(N1~N3 답)·§3-2(바꿀 파일, 승인)
- 브랜치: `feat/m1-4a-community` (main `2a8fba4`에서) — PR·CI는 §6
- 상태: **코드·테스트 완료**. 화면은 M2-2

## 1. N1~N3 답 → 설계에 반영한 것

| # | 답 | 반영 |
| --- | --- | --- |
| N1 공개 폴더 이름 | 자유 입력 + 금칙어 + 신고·owner 숨김 | `PUT /categories/{id}/share` `title?`(없으면 지금 공개 제목 → 분류 이름). 1~20자(복제하면 분류 이름이 되므로 분류 이름 한도와 같게). 금칙어면 400 `BANNED_WORD` `detail{field:"title"}`. **분류 이름을 바꿔도 공개 제목은 안 바뀐다** — 그래서 개인 분류 이름 변경은 금칙어 검사를 받지 않는다 |
| N2 공개 이름 | 본인 닉네임은 자유, 커뮤니티 이름은 고정 = 처음 게시 때 `display_name` 복사 | `profiles.public_name`(V8). 첫 게시 때 닉네임을 금칙어 검사 뒤 복사, 그 뒤로 본인은 못 바꾼다. owner가 `DELETE /admin/users/{id}/public-name`으로 NULL로 만들면 다음 게시 때 그때 닉네임을 다시 복사. 공개 응답에는 `display_name`·이메일이 나오지 않고 `publicName`만 나간다 |
| N3 공개본 곡 제목 | YouTube 원래 제목 | `shared_folder_items`에 `title`·`artist` 열이 **없다**. 전역 캐시 `video_titles(video_id, title, author, fetched_at)`를 조인한다. **아티스트도 사용자가 고칠 수 있는 글자라 YouTube 채널명(`author`)을 쓴다** |

### 1-1. 이 step에서 정한 것 (사용자 확인 필요 표시 ★)

| # | 결정 | 이유 |
| --- | --- | --- |
| ★D1 | **첫 게시 때 공개 이름 확인**: `PUT …/share` 입력 `publicName`이 지금 닉네임과 같아야 한다. 없거나 다르면 409 `PUBLIC_NAME_CONFIRM_REQUIRED` `detail{displayName}` | 가입 때 `display_name`이 **Google 실명(`full_name`) 또는 이메일 앞부분**으로 자동 채워진다(`SupabaseJwtVerifier` `displayNameHint`). 확인 없이 복사하면 모르는 사이 실명·이메일 아이디가 바꿀 수 없게 공개된다. 화면(M2-2)은 409의 `detail.displayName`을 "이 이름으로 공개되고 바꿀 수 없습니다"로 보여 준 뒤 같은 값을 보내면 된다. **새 에러 코드라 이 결정이 맞는지 확인 부탁** |
| D2 | 자동 연동은 "그 사용자의 자동 연동 공개본 전부"를 같은 트랜잭션에서 다시 맞춘다(`SharedFolderSync.resyncCategories(tx, userId, null)`) | 복사하는 것이 `video_id`·구간·배속·순서뿐이라 바뀐 분류를 계산하는 것보다 놓칠 위험이 적다. 분류는 많아야 10개. 자동 연동 공개본이 없으면 쿼리 1번으로 끝난다 |
| D3 | 자동 연동의 `published_at`은 곡이 들고 나거나 구간·배속이 바뀐 때만 갱신(순서만 바뀐 때는 아님). 게시·다시 게시는 늘 갱신 | 연습할 때마다 마지막 연습일로 순서가 바뀌어 "최근" 정렬이 흔들리지 않게 |
| D4 | `CategoryService`는 고치지 않았다 | 이름 변경은 공개 제목에 안 들어가고(N1), 삭제는 FK CASCADE가 공개본을 지운다(A9) |
| D5 | `GET /categories/{id}/share` 추가(설계 표에 없던 읽기 경로) → `{share: … \| null}` | 화면이 분류마다 공개 상태·숨김 여부를 알아야 한다 |
| D6 | 좋아요·공개 폴더 목록·상세를 4a에 넣었다 | 복제·신고가 상세를 전제로 한다 |
| D7 | 신고 `detail`(≤500자)은 owner만 본다(`GET /admin/reports`) | 공개 글자 아님 |
| D8 | 공개 목록·상세는 소유자 실제 티어가 무료면 숨긴다(정리 전이라도) + 다운그레이드 정리가 비공개로 바꾼다 | 이중 보장. 정리는 `downgradeCleanup` 한 곳(관리 API·`tier-expire` cron, PR #82 머지 뒤 유예 끝 cron도 같은 함수) |
| D9 | 자기 폴더 좋아요·복제·신고는 400, 게시한 적 없는 사람(공개 이름 없음) 팔로우·페이지는 404 | |
| D10 | 금칙어는 "포함" 검사(NFKC → 소문자 → 글자·숫자만). 짧거나 일상어와 겹치는 단어는 뺐다(ass·dick ↔ bass·class, "섹스폰", "자지 않고", "죽어라 연습", fuk ↔ Fukuoka) | 우회 방지와 오탐 사이. 목록은 `resources/moderation/banned_words.txt` 한 파일 |

## 2. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `db/migration/V8__community.sql` (새) | `profiles.public_name`, `video_titles`, M1-1 §2-2의 `shared_folders`·`shared_folder_items`(title·artist 열 뺌)·`follows`·`folder_likes`·`folder_reports`. 테이블 17 → **23** |
| `db/Tables.kt` | 위 6개 + `ProfilesTable.publicName`, `ALL_TABLES` 23 |
| `service/BannedWords.kt` (새) + `resources/moderation/banned_words.txt` (새) | `contains`·`require(field, text)` → 400 `BANNED_WORD` |
| `service/SharedFolderSync.kt` (새) | `resyncCategories(tx, userId, categoryIds?)`(자동 연동, 소유자 유료만), `copyCategory`(업서트·빠진 것 삭제·순서) |
| `service/CommunityService.kt` (새) | 게시·다시 게시·비공개·공개 상태 조회, 목록·상세(YouTube 제목 없으면 트랜잭션 밖에서 oEmbed로 받아 캐시), 좋아요, 복제, 팔로우·팔로우 목록·사용자 페이지, 신고 |
| `routes/CommunityRoutes.kt` (새) | `registerCategoryShareRoutes`(`/categories` 인증 아래), `registerCommunityRoutes`(`/community`) |
| `routes/CategoryRoutes.kt`, `Main.kt` | 연결(`registerCategoryRoutes`에 `communityService` 인자) |
| `service/TierService.kt` | `downgradeCleanup`에 user 폴더 비공개·`auto_sync=false`(stub 채움), `requireCommunityWrite`(feature `"community"`) |
| `service/ProfileService.kt` | `PATCH /me` `shareAutosync`(켜기 유료만 403, 끄면 모든 폴더 `auto_sync=false`), `/me` `publicName` |
| `service/SongService.kt` | 목록 정렬을 `LIST_ORDER`로 꺼냄(공개본 순서도 이것), `update`·`delete`에 자동 연동 |
| `PracticeService`·`TakeService`·`ExportImportService`·`notion/NotionSyncService`(2곳)·`PlaylistImportService` | 자동 연동 호출(설계 §4 표 + 연습 저장·녹음의 구간·순서). 재생목록 가져오기는 YouTube 제목·채널을 `video_titles`에도 저장(stub 채움) |
| `service/AdminService.kt`·`routes/AdminRoutes.kt` | 신고 목록·처리, 폴더 숨김(`hidden`만 — 운영자 폴더 필드는 4b `TODO(stub)`), 공개 이름 초기화. 감사 action `report_resolve`·`folder_hide`·`folder_unhide`·`public_name_reset` |

## 3. API (모두 `/api/v1`, Bearer)

| 경로 | 누가 | 입력 → 응답 | 오류 |
| --- | --- | --- | --- |
| `GET /categories/{id}/share` | 소유자 | → `{share: ShareSummary \| null}` | 남의 분류 404 |
| `PUT /categories/{id}/share` | 공개 = 유료, 비공개 = 모두 | `{isPublic, autoSync?, title?, publicName?(첫 게시 확인)}` → `{share}`. ShareSummary = `{folderId, categoryId, title, isPublic, autoSync, hidden, itemCount, likeCount, cloneCount, publishedAt, publicName}` | 무료 공개 403 `TIER_UPGRADE_REQUIRED{feature:"community"}`, 금칙어 400 `BANNED_WORD{field:"title"\|"displayName"}`, 닉네임 없음 409 `DISPLAY_NAME_REQUIRED`, 확인 없음·다름 409 `PUBLIC_NAME_CONFIRM_REQUIRED{displayName}`, 설정 꺼짐 409 `SHARE_AUTOSYNC_OFF`, 공개한 적 없는데 비공개 404, `isPublic` 없음·제목 21자 400 |
| `POST /categories/{id}/share/republish` | 유료 | `{title?}` → `{share}` | 공개본 없음 404 |
| `GET /community/folders?sort=recent\|clones\|likes&cursor=` | 모두 | → `{folders:[PublicFolderSummary], next}` (20개씩, `next` = 다음 `cursor`). Summary = `{id, title, owner{id, publicName, isCreator, creatorBadge}, itemCount, coverVideoId, likeCount, likedByMe, cloneCount, autoSync, publishedAt}` | sort 틀림 400 |
| `GET /community/folders/{id}` | 모두 | → `{folder, items:[{videoId, position, title, artist, a, b, rate}]}` (title·artist = YouTube, 못 받았으면 null) | 비공개·숨김·무료 소유자 404 |
| `PUT·DELETE /community/folders/{id}/like` | 모두 | → `{liked, likeCount}` (멱등) | 자기 폴더 400 |
| `POST /community/folders/{id}/clone` | 유료 | → `{categoryId, imported, alreadyInLibrary, skippedLimit}` | 무료 403, 분류 칸 없음 403 `CATEGORY_LIMIT_EXCEEDED`(아무것도 안 만듦), 자기 폴더 400 |
| `POST /community/folders/{id}/reports` | 모두 | `{reason: spam\|inappropriate\|copyright\|other, detail?≤500}` → 201 `{reportId}` | 열린 신고 중복 409 `ALREADY_REPORTED`, reason 틀림·자기 폴더 400 |
| `GET /community/users/{userId}` | 모두 | → `{id, publicName, isCreator, creatorBadge, creatorBio, followerCount, followingByMe, folders}` (학습 기록은 4b) | 공개 이름 없음 404 |
| `PUT·DELETE /community/follows/{userId}` | 모두 | → `{following, followerCount}` (멱등) | 자기 400, 공개 이름 없음 404(PUT) |
| `GET /community/follows` | 모두 | → `{users:[{id, publicName, isCreator, creatorBadge, folderCount}]}` | |
| `PATCH /me` `shareAutosync` | 켜기 유료 | 불리언 | 무료 켜기 403, 불리언 아님 400 |
| `GET /admin/reports?status=open\|resolved\|dismissed&limit=` | owner | → `{rows:[{id, folderId, folderTitle, folderHidden, ownerId, ownerPublicName, reporterId, reason, detail, status, createdAt, resolvedAt}]}` | owner 아님 403 |
| `PATCH /admin/reports/{id}` | owner | `{status: resolved\|dismissed, reason}` | 처리된 신고 409 `CONFLICT`, status 틀림 400 |
| `PATCH /admin/shared-folders/{id}` | owner | `{hidden, hiddenReason?, reason}` → 폴더 요약 | `hidden` 없음 400 |
| `DELETE /admin/users/{userId}/public-name` | owner | `{reason}` → `{userId, publicName:null}` | |

- 공개 경로가 읽는 것: `shared_folders`·`shared_folder_items`·`video_titles`·`profiles`의 `public_name`·크리에이터 열·`follows`·`folder_likes`. `songs`(사용자 제목·메모)·`notes`·`progressions`·`takes`·`display_name`·이메일은 공개 경로에서 읽지 않는다(복제는 내 `songs`에 쓰기만)
- 새 에러 코드: `BANNED_WORD`(400), `PUBLIC_NAME_CONFIRM_REQUIRED`(409). 나머지는 M1-1 §6 그대로

## 4. 테스트

### 실행 결과 (로컬 win, Testcontainers `postgres:16-alpine`)

```
./gradlew clean test --rerun-tasks        BUILD SUCCESSFUL in 1m 18s
  전체 276 tests, 실패 0, 오류 0, 건너뜀 0   (M1-3d 267 + 새 9)
  ulevelp.community.CommunityApiTest           tests="9" failures="0"
  ulevelp.db.DatabaseMigrationAndIntegrityTest tests="7" failures="0"  (Flyway 버전 8, 테이블 23)
```
- `npm test`는 로컬에서 돌리지 않음(화면 변경 없음, win CRLF 함정 — CI에서 확인)

- 새 `community/CommunityApiTest.kt` 9개:
  - G1 공개본에 YouTube 제목·채널, 사용자 제목·메모·이메일·`displayName` 키 없음(상세·목록), 닉네임을 바꿔도 공개 이름 고정, 토큰 없음 401
  - G2 무료 403, 금칙어 400(`씨 발.연습`·`F.u.C.k`, 닉네임 `병 신`), `Bass class 색소폰` 통과, 닉네임 없음 409, 첫 게시 확인 없음·다름 409(가입 힌트 = 이메일 앞부분 확인), 남의 분류 404, 입력 400
  - G3 설정 꺼짐 409·무료 켜기 403, 자동 연동: 곡 추가·연습 저장(a·b·rate)·곡 삭제가 바로 반영, 설정 끄면 중단(공개본 남음), 다시 게시로 반영
  - G3b 재생목록 가져오기 → 자동 연동 + YouTube 제목 캐시
  - G4 비공개 404, 소유자 무료면 정리 전에도 숨김, 관리 API 다운그레이드 → 비공개·자동 연동 정지, 분류 삭제 → 공개본 삭제
  - G5 좋아요 멱등·무료 가능·자기 400·정렬 `likes`
  - G6 복제(YouTube 제목·메모 없음, 이미 있는 곡은 분류에만, 이름 겹침 `네오소울 (2)`, `cloneCount`), 무료 403, 분류 칸 없음 403·아무것도 안 만듦
  - G7 팔로우 멱등·자기 400·공개 이름 없음 404, 팔로우 목록·사용자 페이지에 이메일·닉네임 없음
  - G8 신고 201·중복 409·잘못된 사유 400, owner 아님 403, 숨김 → 404·소유자는 `hidden:true`, 처리 → 재처리 409, 공개 이름 초기화 → 페이지 404 → 다음 게시 때 새 닉네임, 감사 3행
- 기존 `DatabaseMigrationAndIntegrityTest`: 버전 8·테이블 23으로 고침
- 겪은 것: KDoc 안 `/community/*`가 중첩 주석으로 읽혀 컴파일 실패 → 문구 고침. 첫 테스트에서 "닉네임 없음" 계정이 가입 힌트로 이미 닉네임이 있어 실패 → D1 발견

## 5. 다음 step(M1-4b)·화면(M2-2)이 알아야 할 것

- 4b: 운영자 폴더(`kind` curated·monthly_pick)는 `shared_folders` 그대로, 항목 제목은 `video_titles`(운영자 설명은 `note_i18n`). `PATCH /admin/shared-folders/{id}`의 `titleI18n`·`descriptionI18n`·`isPublic`·`sortOrder`는 `AdminService.setFolderHidden` 옆에 `TODO(stub)`. 공개 목록·상세는 지금 `kind='user'`만 본다(`CommunityService.visibleUserFolders`) — 4b가 운영자 폴더 상세를 열 때 넓힌다. 학습 기록 공개 이름도 `public_name`(앱 명세 §2.2 고침)
- 4b `/curation/home` `following` = `follows` + 위 공개 조건 재사용
- 화면: 첫 공개 버튼 → 409 `PUBLIC_NAME_CONFIRM_REQUIRED`면 확인 모달("커뮤니티 이름: {detail.displayName} — 바꿀 수 없음") → 같은 값을 `publicName`으로 다시 보냄. `BANNED_WORD`의 `detail.field`로 제목/닉네임 칸 표시. 항목 `title`이 null이면 "제목 불러오는 중" 대신 영상 ID 기반 썸네일만
- PR #82(M1-3e)가 머지되면 `effectiveTier`가 유예를 반영하므로 공개 목록의 "유료 소유자"도 유예 끝까지 유지된다(코드 변경 없음)

## 6. PR·CI

(커밋·PR 뒤 채움)
