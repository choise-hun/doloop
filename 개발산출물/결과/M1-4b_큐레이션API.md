# M1-4b 결과 — 운영자 폴더 관리 API · 이달의 곡 · 쇼케이스 · 학습 기록 공유 · `/curation/home`

- 날짜: 2026-11-06 (win)
- 입력: `결과/M1-4a_공유API.md` §5, `결과/M1-1_스키마설계.md` §5-2·§5-5, `진행_티어크레딧.md` §3-3(바꿀 파일 + E1~E9)
- 브랜치: `feat/m1-4b-curation` (main `c7fa827`에서) — **PR #87** → main, CI 전부 통과(run 42153609457)
- 상태: **코드·테스트 완료**. 화면은 M2-2. **마이그레이션 없음**(V8 그대로, 테이블 23·Flyway 8)

## 1. 사용자 승인(2026-11-06)과 반영

| # | 승인 | 반영 |
| --- | --- | --- |
| E1 | 추천 + "곡 이름·아티스트 분리는 복잡하면 영상 제목 그대로" | `PUT /admin/shared-folders/{id}/items` `{items:[{videoId, a?, b?, rate?, noteI18n?}], reason}` — 제목·아티스트는 받지 않고 YouTube 값(`video_titles`). 곡 이름·아티스트 **분리는 하지 않았다**(영상 제목 = `title`, 채널명 = `artist`) |
| E2 | 추천 + "공개 폴더는 플레이리스트처럼, 썸네일이면 최선" | 공개 폴더 요약에 `kind`·`titleI18n`·`descriptionI18n`·`month`·`owner`(운영자 폴더 null) + **카드용 `coverVideoIds`(앞 4곡)·`artists`(채널명 최대 3)**. 썸네일은 videoId만 있으면 되므로 화면의 `thumb(videoId)`(`frontend/src/lib/security.ts`)로 만든다(서버에 URL 필드 없음). 항목에 `noteI18n` |
| E3 | **넣는다** | `GET /admin/shared-folders?kind=curated\|monthly_pick` — 초안·숨김 포함 + 항목까지(따로 상세 경로를 만들지 않으려고) |
| E4 | **지난 달로 대체** | 홈 `monthlyPick` = KST 이번 달 공개본, 없으면 가장 최근 지난 달 것. 앞으로 올 달은 미리 공개해도 안 보인다 |
| E5 | **20개, 비율은 조절하기 편하게** | `CommunityService.kt` `object CurationPolicy` 한 곳: 쇼케이스 20칸, 크리에이터 몫 최대 10(남으면 인기 사용자가 채움), 인기 후보 = 팔로워 상위 10명(팔로워 ≥ 1), **한 사람 최대 3칸**(한 크리에이터가 줄을 독차지하지 않게 — 0이면 제한 없음), 줄당 20개 |
| E6 | 추천 | 학습 기록: 동의 + 커뮤니티 이름 + 실제 티어 유료만. 오늘 곡 = YouTube 값 |
| E7 | 추천 | `PATCH /me sharePracticeLog` 켜기 유료만 403·이름 없음 409 |
| E8 | 추천 | 운영자 폴더 좋아요·복제 됨, 신고 400, 삭제는 운영자 폴더만 |
| E9 | 추천 | 아래 §3 값 |

### 1-1. 이 step에서 정한 것 (다르면 고친다)

| # | 결정 | 이유 |
| --- | --- | --- |
| F1 | 쇼케이스 **한 사람 최대 3칸**(`SHOWCASE_PER_USER_MAX`) | E5 "비율 조절"과 같은 자리에 둠. 크리에이터 한 명이 폴더 10개면 줄이 그 사람 것만 된다 |
| F2 | 연속 일수 = 오늘까지(오늘 아직 안 했으면 **어제까지**) 이어진 날 수, 최대 84 | 아침에 보면 어제까지의 연속이 0으로 보이지 않게. 84일 밖은 읽지 않는다 |
| F3 | 학습 기록 `all` 정렬 = 이번 주 합계 → 연속 일수 → id. 12주 안에 연습이 없는 동의자는 목록에 없음 | 빈 카드 방지 |
| F4 | 0초(반복만 있는 날)는 "연습한 날"이 아님. 오늘 곡에는 반복만 있어도 나온다 | `sessions`에 loops만 쌓이는 경우 |
| F5 | 관리 `PATCH`의 감사 action: 숨김만 바꾸면 `folder_hide`/`folder_unhide`(M1-4a 그대로), 그 밖은 `folder_update` | 기존 감사 기록과 이어지게 |
| F6 | 운영자 폴더 `month`는 만든 뒤 못 바꾼다(지우고 다시 만든다) | 설계 PATCH 입력에 없음. 달마다 하나라 실수 비용이 작다 |

## 2. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `service/CommunityService.kt` | 공개 조건을 운영자 폴더까지 넓힘(`requireVisibleFolder` — 상세·좋아요·복제, 신고는 user만), 요약 DTO 확장(E2), `curationHome`(큐레이션·이달의 곡·쇼케이스·팔로잉), `CurationPolicy`, `fillTitlesForFolder`·`fillTitles` 공개, 항목 조회를 최상위 `publicFolderItems`로(관리 API도 씀). `/community/folders` 목록은 user 폴더만 그대로 |
| `service/PracticeLogService.kt` (새) | 동의자 `sessions` 집계(84일 날짜별 초·연속 일수·이번 주 합계·오늘 곡). `songs`는 `video_id`만 읽는다 |
| `service/AdminService.kt` | 운영자 폴더 만들기·고치기(`setFolderHidden` → `updateFolder`)·항목 교체·삭제·목록, 번역 묶음 검사, 감사 `folder_create`·`folder_update`·`folder_items_replace`·`folder_delete`. 관리 폴더 DTO에 운영자 필드 |
| `service/SharedFolderSync.kt` | `KIND_CURATED`·`KIND_MONTHLY_PICK`·`OPERATOR_KINDS` 상수 |
| `service/ProfileService.kt` | `PATCH /me sharePracticeLog`(E7) |
| `routes/AdminRoutes.kt` | `GET`·`POST /admin/shared-folders`, `PATCH` 입력 넓힘, `PUT …/items`, `DELETE …` (`registerAdminRoutes`에 `communityService` 인자 — 항목 교체 뒤 YouTube 제목 채우기) |
| `routes/CommunityRoutes.kt` | `GET /community/logs`, `GET /curation/home`(`registerCurationRoutes`), 사용자 페이지 `practiceLog` |
| `Main.kt` | 연결 |
| 테스트 `community/CurationApiTest.kt` (새) | §4 |
| 문서 | `계획/앱_명세.md` v1.7(§2.2 B 학습 기록, C 쇼케이스, D 운영자 폴더, **E 커뮤니티 화면 방향** 새 절), `결과/M1-1_…` §5-2·§5-5 두 줄에 "→ M1-4b" 표시 |

## 3. API (모두 `/api/v1`, Bearer)

### 3-1. 공개(로그인 사용자 모두, 무료 포함)

| 경로 | 응답 | 오류 |
| --- | --- | --- |
| `GET /curation/home` | `{curated:[Summary], monthlyPick:{folder:Summary, items:[Item]}\|null, showcase:[Summary], following:[Summary]}` — 줄마다 최대 20 | 401 |
| `GET /community/logs?scope=following\|all&cursor=` | `{logs:[PracticeLog], next}` (20명씩, 기본 `all`) | scope·cursor 틀림 400 |
| `GET /community/users/{userId}` | 기존 + `practiceLog: PracticeLog\|null` | |
| `GET /community/folders/{id}`·`PUT\|DELETE …/like`·`POST …/clone` | 운영자 폴더(공개·숨김 아님)도 된다 | 운영자 폴더 신고 400 |

- **Summary**(공개 폴더 카드) = `{id, kind, title, titleI18n, descriptionI18n, month, owner{id, publicName, isCreator, creatorBadge}|null, itemCount, coverVideoId, coverVideoIds, artists, likeCount, likedByMe, cloneCount, autoSync, publishedAt}`. user 폴더는 `titleI18n`·`descriptionI18n` `{}`, `month` null. 운영자 폴더는 `owner` null. 화면 제목 = `titleI18n[locale] ?? title`
- **Item** = `{videoId, position, title, artist, a, b, rate, noteI18n}` — `title`·`artist` = YouTube 영상 제목·채널명(못 받았으면 null)
- **PracticeLog** = `{user{id, publicName, isCreator, creatorBadge}, days:[{date, seconds}], streakDays, thisWeekSeconds, today:[{videoId, title, artist, seconds, loops}]}` — `days` = 최근 84일 중 연습한 날만(오름차순), 날짜 KST, 주 = 월요일 시작, `today` 초 많은 순 최대 10
- 공개 대상 학습 기록 = `share_practice_log` + `public_name` 있음 + 실제 티어 유료. 읽는 것: `sessions`(날짜·초·반복)·`songs.video_id`·`video_titles`·`profiles` 공개 열. `sessions.memo`·`songs.title`·`songs.memo`·이메일·`display_name`은 읽지 않는다

### 3-2. 쇼케이스·홈 규칙 (`CurationPolicy`)

| 줄 | 규칙 |
| --- | --- |
| curated | 공개·숨김 아님 `curated`, `sort_order` → 만든 순, 20 |
| monthlyPick | 공개·숨김 아님 `monthly_pick` 중 `month ≤ 이번 달(KST)`의 가장 최근 하나(E4) + 항목 |
| showcase | 후보 = 크리에이터(공개 이름 있음) + 팔로워 상위 10명(팔로워 ≥ 1, 크리에이터 아님). 소유자 실제 티어 유료, 폴더는 공개·**자동 연동**·숨김 아님. 사람 순서 = 팔로워 수, 사람 안에서는 최근 게시 순, 한 사람 최대 3칸. 크리에이터 몫 ≤ 10 → 나머지 인기 사용자 → 모자라면 서로 채워 최대 20 |
| following | 내가 팔로우한 사람(유료)의 공개 user 폴더, 최근 게시 순 20(자동 연동 무관) |

### 3-3. owner 관리 (`/admin`, owner만 — 아니면 403 `FORBIDDEN`)

| 경로 | 입력 → 응답 | 오류 |
| --- | --- | --- |
| `GET /admin/shared-folders?kind=curated\|monthly_pick` | → `{folders:[{folder: AdminFolder, items:[Item]}]}` (초안·숨김 포함, kind 없으면 둘 다) | kind 틀림(`user` 포함) 400 |
| `POST /admin/shared-folders` | `{kind, titleI18n, descriptionI18n?, month?, sortOrder?, reason}` → 201 AdminFolder(`isPublic:false`) | `titleI18n.ko` 없음·101자·모르는 키 400, monthly_pick에 month 없음·형식 틀림·curated에 month 400, 같은 달 409 `CONFLICT` |
| `PATCH /admin/shared-folders/{id}` | `{titleI18n?, descriptionI18n?, isPublic?, sortOrder?, hidden?, hiddenReason?, reason}` (하나 이상) → AdminFolder. 비공개 → 공개면 `publishedAt` = 지금 | 바꿀 값 없음 400, user 폴더에 운영자 필드 400 |
| `PUT /admin/shared-folders/{id}/items` | `{items:[{videoId, a?, b?, rate?(0.25~2, 기본 1), noteI18n?}], reason}` → `{folder, items}`(YouTube 제목 채운 뒤) | monthly_pick 6개 400 `INVALID_INPUT{max:5}`, curated 51개 400 `{max:50}`, videoId 형식·중복·a ≥ b·설명 301자 400, user 폴더 400 |
| `DELETE /admin/shared-folders/{id}` | `{reason}` → `{id, deleted:true}` | user 폴더 400(숨김을 쓴다) |

- AdminFolder = `{id, kind, ownerId, title, isPublic, autoSync, hidden, hiddenAt, hiddenReason, titleI18n, descriptionI18n, month, sortOrder, itemCount, likeCount, cloneCount, publishedAt, createdAt}`
- 값(E9): 번역 키 `ko`·`en`·`ja`만, 빈 값은 빠짐. 제목 1~100자(`ko` = `title` 열), 설명 ≤ 1000자, 곡 설명 ≤ 300자. 쓰기마다 같은 트랜잭션에 `admin_audit` 한 행
- `PATCH /me` `sharePracticeLog`: 켜기 = 무료 403 `TIER_UPGRADE_REQUIRED{feature:"community"}`, 커뮤니티 이름 없음 409 `PUBLIC_NAME_REQUIRED`, 불리언 아님 400. 끄기는 누구나. 다운그레이드 정리(`downgradeCleanup`)가 이미 끈다
- 새 에러 코드 없음

## 4. 테스트

### 실행 결과 (로컬 win, Testcontainers `postgres:16-alpine`)

```
./gradlew test --tests 'ulevelp.community.*'
  ulevelp.community.CommunityApiTest  tests="10" failures="0" errors="0"   (M1-4a 그대로 — 요약 DTO가 넓어져도 통과)
  ulevelp.community.CurationApiTest   tests="4"  failures="0" errors="0"
./gradlew clean test --rerun-tasks      BUILD SUCCESSFUL in 1m 7s
  전체 282 tests, 실패 0, 오류 0            (M1-4a 뒤 main 278 + 새 4)
```

- 새 `community/CurationApiTest.kt` 4개:
  - **C1** 운영자 큐레이션: owner 아님 403·토큰 없음 401, 만들기 입력 400 6가지, 초안은 홈·상세에 안 보임(404), 항목 교체(YouTube 제목·`noteI18n`·rate) + 항목 입력 400 4가지, 관리 목록(초안·항목 포함, `kind=user` 400), 바꿀 값 없음 400, 공개 → 홈 카드(`owner` null·`coverVideoIds`·`artists`·`descriptionI18n`), `/community/folders` 목록엔 없음, 좋아요(무료)·복제(유료)·신고 400, 제목·순서 고치기, 숨김 → 홈에서 빠짐 → 해제, user 폴더에 운영자 필드·삭제·항목 교체 400, 삭제 → 404, **감사 행 7개가 쓰기 순서대로**(실패한 요청은 없음)
  - **C2** 이달의 곡: month 없음·`2026-13` 400, 같은 달 409, **6곡 400 `detail.max = 5`**·5곡 200, 비공개면 null, 이번 달 없으면 지난 달(E4)·곡 5개·YouTube 제목, 다음 달 것은 공개해도 안 보임, 이번 달 공개하면 그것, 관리 목록 최근 달 먼저
  - **C3** 쇼케이스: 크리에이터(팔로워 0) 폴더 4개 중 최근 3개(한 사람 최대 칸) → 인기 사용자 폴더, 자동 연동 아닌 공개 폴더·팔로워 없는 사람 제외, 팔로잉 줄, 인기 사용자가 무료가 되면 쇼케이스·팔로잉에서 빠짐, 공개 응답에 사용자 글자 없음, 401
  - **C4** 학습 기록: `sharePracticeLog` 무료 403·이름 없음 409·불리언 아님 400·끄기 200, 동의한 유료만(비동의 유료·DB로 동의만 켠 무료 제외), 84일 경계·0초 날 제외·연속 3일·이번 주 합계·오늘 곡(초 순·YouTube 제목·반복 수), **응답에 사용자 곡 제목·메모(세션 메모 포함)·이메일·닉네임 없음**, following(비동의자 팔로우해도 제외), 사용자 페이지 `practiceLog`(동의자만), 끄면 바로 사라짐, scope·cursor 400, 401

## 5. 화면(M2-2)·운영이 알아야 할 것

- **화면 방향(사용자 2026-11-06)**: 스포티파이·애플뮤직 홈 + SNS(학습 기록) 조금. 공개 폴더 = 플레이리스트 카드. 자세한 것은 `계획/앱_명세.md` §2.2 E. 홈 한 화면 = `GET /curation/home` 한 번 + `LOG` 칩일 때 `GET /community/logs`
- "모두 표시"는 지금 서버가 줄마다 최대 20개를 주므로 그 20개를 격자로 보인다. 더 많이 필요해지면 줄별 목록 경로를 따로 만든다(설계 결정 필요)
- 쇼케이스 칸 나눔·한 사람 최대 칸은 `CurationPolicy` 상수만 고치면 된다(화면을 보며 조절)
- 학습 기록은 지금 사용자 수가 적다는 전제로 요청마다 동의자 전체 84일 집계를 한다. 동의자가 수백 명을 넘으면 요약 테이블이나 캐시를 검토
- 운영 첫 큐레이션: owner 계정으로 `POST /admin/shared-folders` → `PUT …/items` → `PATCH {isPublic:true}` 순서. 이달의 곡은 다음 달 것을 미리 만들어 공개해 둬도 그 달이 되어야 보인다

## 6. PR·CI

- **PR #87** `feat/m1-4b-curation` → main. 처음 push 때 main(#85 두 줄 병행)과 인수인계 메모가 충돌해 CI가 아예 돌지 않음 → origin/main 병합(`1b41da6`, 메모는 두 줄 병행 내용 + M1 완료로 합침)
- CI run **42153609457** 전부 통과: Kotlin test (JDK 21), Node 22·24, E2E spa·legacy, Docker build & smoke, CI ok
- 머지 뒤 배포: 마이그레이션 없음(Flyway v8 그대로)
