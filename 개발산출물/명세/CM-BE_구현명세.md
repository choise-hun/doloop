# CM-BE 상세 구현 명세 — 개별 세션 공유

> 2026-11-09 / Codex / 기준 커밋 `f20f030bc03cd3d100bffeccb5bd142e0c9e67f1`.
> 입력: [계획 §1 CM-BE](../../계획/상용_서비스_계획.md), [확장 요구사항 REQ-3 / AC-5·AC-6](../요구사항_명세_초안.md), [문서 운영 §4](../../docs/문서_운영.md).
> **2026-11-09 보완안 포함 로컬 구현·테스트 승인 후 착수.** §2~§7 및 withdrawn_at/tier_paused_at/public_session/신고 종결 PATCH를 포함한다. 커밋·push·PR·배포는 승인 범위 밖이다. 실행·재개는 [진행 파일](../진행_CM-BE.md)에서 관리한다.

## 1. 범위와 기존 계약

- 신규 개별 세션 게시·철회·재게시·전체/팔로잉 피드·내 게시물·신고·운영자 숨김/복구/신고 처리를 정의한다.
- 기존 `/api/v1/community/logs`의 84일 사용자 집계, `PracticeLogDto`, `share_practice_log`, 공유 폴더·팔로우·큐레이션 계약을 유지한다. 과거 세션을 자동 게시하거나 기존 동의를 신규 게시 동의로 해석하지 않는다.
- CM-UI의 community.html/공용 카드/운영 화면과 PF의 프로필은 후속 범위다. CM-BE는 API 기반 관리까지 검증하고 화면 연결은 미구현으로 구분한다. 댓글·좋아요·게시물 복제·레거시 `/api` 변경은 추가하지 않는다.
- 세션은 일별 누적 기록이다. 공개 메타는 승인된 **POST 시점 스냅샷**으로 저장한다. 이후 개인 연습 누적·파트 이름 변경이 기존 동의 범위에 자동 반영되지 않게 한다. 동일 세션에 POST를 다시 실행하면 작성 문구와 스냅샷을 모두 교체한다. 계정/곡/세션 삭제는 즉시 cascade한다.

## 2. 실제 코드 근거와 변경 예정 파일

아래 행은 기준 커밋에서 확인했다. 줄 번호는 구현 때 재확인한다. 경로는 저장소 루트 기준이다.

| 현행 file:line / 심볼 | 관찰 및 설계 연결 |
| --- | --- |
| `src/main/kotlin/ulevelp/db/Tables.kt:94` `SessionsTable` | userId/songId/date, seconds/loops/a/b/rate, 개인 memo, partStats/coveragePct를 가진다. 공개 플래그를 추가하지 않는다. |
| `src/main/resources/db/migration/V1__init.sql:60` | 세션은 `(user_id,song_id,date)` 유일, 곡은 복합 FK로 같은 사용자에 묶이고 곡 삭제 시 세션 삭제. 기존 V1~V9 수정 없이 V10을 추가한다. |
| `src/main/resources/db/migration/V9__presets_and_practice_parts.sql:36` | part_stats JSONB 기본 [], coverage_pct 0~100. Exposed와 SQL 양쪽을 맞춘다. |
| `src/main/kotlin/ulevelp/service/SessionService.kt:35` `SessionWithSongDto` | 개인 곡 제목·memo·takes가 포함된다. 이 DTO를 공개 DTO로 재사용하거나 직렬화 후 필드 삭제하지 않는다. |
| `src/main/kotlin/ulevelp/service/PracticeService.kt:298` | partStats에 사용자 입력 name과 구간·완료·누적량이 저장된다. JSON 원본을 통째로 공개하지 않고 허용 필드만 검증·투영한다. |
| `src/main/kotlin/ulevelp/service/CommunityService.kt:60` `PublicOwnerDto` | 공개 작성자는 id/publicName/isCreator/creatorBadge 4필드만 사용한다. |
| `src/main/kotlin/ulevelp/service/CommunityService.kt:326` / `:685` | publicName 미설정은 409 PUBLIC_NAME_REQUIRED. fillTitles는 YouTube 전용 캐시를 DB 트랜잭션 밖에서 보충한다. |
| `src/main/kotlin/ulevelp/service/PracticeLogService.kt:49` | 동의·공개 이름·실제 유료 티어를 갖춘 사용자 집계. 신규 피드는 별도 서비스/DTO로 분리한다. |
| `src/main/kotlin/ulevelp/service/TierService.kt:111` / `:119` / `:264` / `:276` | 유예 포함 effectiveTier, profiles 행 잠금, 강등 정리, 유료 communityWrite 가드를 재사용한다. |
| `src/main/kotlin/ulevelp/service/AdminService.kt:177` / `:219` / `:426` | role=owner 가드, 동일 트랜잭션 audit, 열린 신고 처리 패턴. audit 함수는 private이므로 외부에서 호출 가능하다고 가정하지 않는다. |
| `src/main/kotlin/ulevelp/service/AdminService.kt:286`, `src/main/kotlin/ulevelp/service/CreditService.kt:306`, `src/main/kotlin/ulevelp/service/TierService.kt:315` | override 변경·크레딧 주기/유예 종료·override 만료가 공통 downgradeCleanup에 진입한다. 신규 카드 정리를 이 공통 지점에 연결한다. |
| `src/main/kotlin/ulevelp/routes/SessionRoutes.kt:39`, `src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:87`, `src/main/kotlin/ulevelp/routes/AdminRoutes.kt:84` | 각 인증 경계 안에 경로를 추가한다. admin의 OwnerOnlyPlugin 밖에 새 관리 경로를 등록하지 않는다. |
| `src/main/kotlin/ulevelp/Main.kt:199` / `:343` / `:348` / `:353` | 서비스 생성 및 community/session/admin 등록 지점. 주입 인자 변경은 아래 승인 대상이다. |
| `src/main/kotlin/ulevelp/db/DatabaseFactory.kt:123`, `src/main/kotlin/ulevelp/api/ApiError.kt:20` | 부모 컨텍스트/취소 전후 검사 dbQuery와 표준 오류 응답을 사용한다. |
| `src/main/kotlin/ulevelp/service/SongService.kt:362` | 곡 삭제는 곡 행 DELETE 후 세션 cascade와 공유 폴더 재동기화를 수행한다. 신규 공유 쓰기는 곡→세션→카드 순서로 이 삭제 순서를 따른다. |
| `src/test/kotlin/ulevelp/community/CommunityApiTest.kt:41` | 격리 PostgreSQL 컨테이너 기반 기존 커뮤니티 API 회귀 방식. |

### 승인된 구현 변경 목록

| 파일 | 추가/변경 내용 |
| --- | --- |
| `src/main/resources/db/migration/V10__shared_practice_cards.sql` (신규) | §3의 카드·신고 테이블, 제약, 인덱스, updated_at 트리거. V10 선점 여부 구현 직전 재확인. |
| `src/main/kotlin/ulevelp/db/Tables.kt` | SharedPracticeCardsTable, SharedPracticeCardReportsTable 및 ALL_TABLES 등록. |
| `src/main/kotlin/ulevelp/service/EpisodeLogService.kt` (신규) | DTO, 검증, 공유/철회/피드/내 목록/신고. 기존 SessionService의 개인 DTO는 유지. |
| `src/main/kotlin/ulevelp/service/AdminService.kt` | 신규 게시물 숨김/복구·신고 목록/처리 메서드. 기존 private audit 내부 재사용. |
| `src/main/kotlin/ulevelp/service/TierService.kt` | downgradeCleanup에 신규 카드 정지 및 hidden 우선 보존. 기존 폴더·동의 정리를 유지. |
| `src/main/kotlin/ulevelp/service/CreditService.kt` | 기존 processDueCycle/onTierChange와 만료 후 유료 복원 경로 대조, §7의 미반영 강등 정지가 유실되지 않도록 보완. 크레딧 금액/주기 계약 유지. |
| `src/main/kotlin/ulevelp/routes/SessionRoutes.kt`, `CommunityRoutes.kt`, `AdminRoutes.kt`, `src/main/kotlin/ulevelp/Main.kt` | §5의 신규 경로, EpisodeLogService 주입 인자 추가. 기존 경로/응답/상태 코드는 유지. |
| `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt`, `EpisodeLogModerationApiTest.kt`, `EpisodeLogConcurrencyTest.kt` (신규, 같은 디렉터리) | §8 회귀. 필요 fixture는 테스트 support로 분리. |
| 기존 `CommunityApiTest.kt`, `src/test/kotlin/ulevelp/tier/TierQuotaAdminApiTest.kt` | 기존 집계/폴더·강등 회귀 유지 및 신규 카드 연동 단언. |
| `src/main/kotlin/ulevelp/service/EpisodeContract.kt`, `src/main/kotlin/ulevelp/routes/EpisodeRoutes.kt` (신규) | 공개 DTO·신규 입력·커서와 인증 경계 내부 경로 등록 책임 분리. |
| `src/test/kotlin/ulevelp/community/EpisodeTestSupport.kt`, `EpisodeMigrationTest.kt` (신규), `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt` | 격리 fixture·V9 업그레이드/제약 검사, 기존 DB 계약의 정확한 버전/테이블 목록을 V10/26개로 갱신. |

요구사항 권장 필드 외에 `withdrawn_at`, `tier_paused_at`, `public_session`을 추가한다. 철회 후 새 행 생성으로 숨김을 우회하는 문제, 숨김 중 강등 이력 소실, 개인 메타의 자동 공개를 각각 막기 위함이다. 신고 처리에는 §5의 PATCH 1개를 보완한다. 2026-11-09 사용자 명시 승인 범위에 모두 포함된다.

## 3. DB 계약

### 3.1 shared_practice_cards

| 컬럼 | 타입 / null / 기본 / 제약 |
| --- | --- |
| id | UUID PK NOT NULL DEFAULT gen_random_uuid(); 공개 postId |
| session_id | UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE |
| user_id | UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE; 매 쓰기에서 session.user_id와 일치 검사 |
| title | TEXT NOT NULL DEFAULT ''; char_length <=80, trim 결과 저장, 빈 값은 UI 기본 제목 표시 신호 |
| comment | TEXT NOT NULL DEFAULT ''; char_length <=500, trim 결과 저장 |
| status | TEXT NOT NULL DEFAULT 'published'; published / tier_paused / moderation_hidden CHECK |
| published_at | TIMESTAMPTZ NOT NULL DEFAULT now(); 신규 게시/철회 후 게시/정지 후 재게시 시 갱신, 공개 중 수정은 유지 |
| hidden_at / hidden_reason | TIMESTAMPTZ NULL / TEXT NULL(max 200); hidden일 때 둘 다 필수, 나머지는 둘 다 NULL |
| tier_paused_at | TIMESTAMPTZ NULL; 실제 무료 강등의 지속 표식, hidden과 동시에 존재 가능 |
| withdrawn_at | TIMESTAMPTZ NULL; 작성자 철회 표식. 행을 유지해 신고·운영자 숨김을 보존 |
| public_session | JSONB NOT NULL; §4의 PublicSessionSnapshot을 명시적 DTO에서 인코딩. JSON object CHECK |
| created_at / updated_at | TIMESTAMPTZ NOT NULL DEFAULT now(); updated_at은 기존 set_updated_at() 트리거 |

추가 CHECK: status=published이면 tier_paused_at IS NULL; status=tier_paused이면 tier_paused_at IS NOT NULL. hidden은 정지 여부와 독립이다. 철회 여부는 status와 독립이다. user_id의 정합성은 서비스에서 `(session.id, session.user_id)`와 곡 소유자를 확인하며 직접 SQL로도 자동 보장된다고 주장하지 않는다. 기존 sessions에 유일 키를 추가하는 범위 확장은 하지 않는다.

인덱스: `(user_id,published_at DESC,id DESC)` 내 목록, `(published_at DESC,id DESC) WHERE status='published' AND withdrawn_at IS NULL` 공개 피드. UNIQUE(session_id)가 동시 생성 중복을 막는다. 공개 쿼리는 인덱스 조건 외에 §6의 자격 조건을 반드시 적용한다.

### 3.2 shared_practice_card_reports

| 컬럼 | 타입 / null / 기본 / 제약 |
| --- | --- |
| id | UUID PK NOT NULL DEFAULT gen_random_uuid() |
| card_id | UUID NOT NULL REFERENCES shared_practice_cards(id) ON DELETE CASCADE |
| reporter_id | UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE |
| reason | TEXT NOT NULL; spam / inappropriate / copyright / other CHECK |
| detail | TEXT NOT NULL DEFAULT ''; char_length <=500 |
| status | TEXT NOT NULL DEFAULT 'open'; open / resolved / dismissed CHECK |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| resolved_at | TIMESTAMPTZ NULL; open일 때 NULL, 종결이면 NOT NULL CHECK |

부분 UNIQUE `(card_id,reporter_id) WHERE status='open'`; 목록 인덱스 `(status,created_at DESC,id DESC)`. 신고 상세는 운영자만 조회한다. 작성자에게는 상태별 건수만 반환한다. 처리자·처리 사유는 admin_audit에 같은 트랜잭션으로 기록한다. 비밀값·이메일·개인 메모를 audit에 복사하지 않는다.

### 3.3 삭제·마이그레이션·복구

- 기존 사용자/세션은 0건 자동 공개. V10 이전 개인 데이터와 V1~V9 체크섬 불변.
- DELETE share는 **철회**다. withdrawn_at을 기록하고 title/comment를 '', public_session을 빈 객체로 지워 공개 사본 내용을 제거한다. id/session_id/user_id와 숨김·정지·신고 기록은 유지한다. 철회한 카드도 내 관리 목록에 남는다. UI는 '공유 철회'로 안내하며 물리 삭제와 혼동하지 않는다.
- 재POST는 같은 postId를 재사용하고 새 명시 동의 내용만 저장한다. moderation_hidden이면 철회 이후에도 409로 차단한다. hidden 카드 복구는 철회 표식을 해제하지 않는다.
- 원본 곡 → 세션 → 카드 → 신고, 사용자 → 관련 행은 FK cascade. 계정 삭제 후에도 기존 admin_audit 정책대로 actor/대상 UUID·조치 메타만 남을 수 있다.
- Flyway 자동 down은 추가하지 않는다. 격리 DB에서 V9→V10 및 새 DB V1→V10을 검증한다. 운영 적용 전 백업/복구 절차가 선행이다. 이전 바이너리는 신규 테이블을 사용하지 않지만 API 호출은 중단된다. 스키마 제거가 필요하면 별도 승인·데이터 백업 후 reports→cards 순서로 제거한다. 공개 데이터를 보존하는 재시도는 새 forward migration으로 처리하고 V10 적용본을 수정하지 않는다.

## 4. 요청·응답 DTO 전 필드

신규 DTO는 `@Serializable`, 시각은 `ISO_INSTANT` UTC Z, 날짜는 `YYYY-MM-DD`, UUID는 문자열. nullable 필드는 null로 직렬화하고 배열은 빈 배열을 허용한다. 아래에 없는 키는 공개 응답에 포함하지 않는다.

| DTO | 전 필드 및 의미 |
| --- | --- |
| ShareEpisodeRequest | title:String? 선택(미전달/null→''), comment:String? 선택(미전달/null→''). POST는 부분 수정이 아니라 문구 전체 교체. 공개 확인 UI에서만 호출하는 계약, 별도 동의 플래그는 없음. |
| ReportEpisodeRequest | reason:String 필수 enum, detail:String? 선택(null/미전달→'') |
| ModerateEpisodeRequest | status:String 필수 moderation_hidden 또는 published, reason:String 필수 trim 후 1~200 |
| ResolveEpisodeReportRequest | status:String 필수 resolved 또는 dismissed, reason:String 필수 trim 후 1~200 |
| PublicPartStatDto | name:String(1~50), a:Double, b:Double, rate:Double, completed:Boolean, seconds:Int>=0, loops:Int>=0 |
| PublicSessionSnapshot | videoId:String(YouTube 11자), date:String, seconds:Int>=0, loops:Int>=0, a:Double?, b:Double?, rate:Double?, coveragePct:Int(0~100), partStats:List<PublicPartStatDto> |
| PublicEpisodeLogDto | postId:String, sessionId:String, owner:PublicOwnerDto, videoId:String, youtubeTitle:String?, youtubeArtist:String?, title:String, comment:String, publishedAt:String, date:String, seconds:Int, loops:Int, a:Double?, b:Double?, rate:Double?, coveragePct:Int, partStats:List<PublicPartStatDto> |
| PublicOwnerDto (기존) | id:String, publicName:String?, isCreator:Boolean, creatorBadge:String?; 공개 행에서는 publicName이 비어 있지 않은지 검사. |
| EpisodeLogListResponse | posts:List<PublicEpisodeLogDto>, next:String? |
| MyEpisodeLogDto | postId:String, sessionId:String, title:String, comment:String, publishedAt:String, status:String(3개 상태), hiddenAt:String?, hiddenReason:String?, tierPausedAt:String?, withdrawnAt:String?, createdAt:String, updatedAt:String, canRepublish:Boolean, reportCounts:EpisodeReportCountsDto, card:PublicEpisodeLogDto? (철회 시 null, 비공개 상태의 card는 본인만 조회) |
| EpisodeReportCountsDto | open:Int, resolved:Int, dismissed:Int; 모두 >=0. 상세/신고자는 포함하지 않음. |
| MyEpisodeLogListResponse | posts:List<MyEpisodeLogDto>, next:String? |
| ShareEpisodeResponse | post:MyEpisodeLogDto |
| WithdrawEpisodeResponse | ok:Boolean=true |
| ReportEpisodeResponse | reportId:String |
| AdminEpisodeReportDto | reportId:String, postId:String, ownerId:String, ownerPublicName:String?, reporterId:String, reason:String, detail:String, status:String, createdAt:String, resolvedAt:String?, postStatus:String, withdrawnAt:String?, hiddenAt:String? |
| AdminEpisodeReportListResponse | reports:List<AdminEpisodeReportDto>, next:String? |
| AdminEpisodeModerationDto | postId:String, status:String, hiddenAt:String?, hiddenReason:String?, tierPausedAt:String?, withdrawnAt:String?, updatedAt:String |

공개 DTO의 thumbnail 식별자는 videoId 하나다. 임의 URL/저장소 URL 필드는 없고 CM-UI에서 기존 안전한 YouTube 썸네일 함수를 사용한다. youtubeArtist는 video_titles.author(채널명)이며 아티스트 파싱을 추가하지 않는다. title=''이면 CM-UI에서 YouTube 제목+번역된 '연습 기록', 메타 없으면 '연습 기록'을 표시한다. 서버가 언어별 기본 제목을 저장하지 않는다.

### 입력·공개 메타 검증

- JSON object만 받는다. 신규 요청에 미정의 키/잘못된 타입이 있으면 400 INVALID_INPUT. title/comment/detail은 trim 후 PostgreSQL char_length와 일치하는 Unicode code point 길이로 계산하고 NUL/허용하지 않은 제어 문자를 거절한다. 코멘트/상세의 LF·탭은 허용, 제목·파트명은 한 줄이다. 빈 제목/코멘트는 유효하다. 80/500 경계와 supplementary Unicode를 검사한다.
- `BannedWords.require`를 title/comment 및 공개할 partStats.name에 적용한다. BANNED_WORD detail.field는 title / comment / partStats.name. 개인 메모와 파트 이름을 게시 제목/코멘트의 기본값으로 복사하지 않는다. part 이름 공개는 게시 직전 공개 메타 안내에 포함한다.
- public_session은 요청에서 받지 않고 잠근 소유 세션과 같은 소유 곡에서 만든다. 임의 JSON key는 제거하고 허용 필드의 잘못된 타입/범위는 조용히 기본값으로 대체하지 않고 409 SESSION_NOT_SHAREABLE로 실패한다. 금칙어는 위 400을 유지한다.
- a/b는 둘 다 null 또는 유한 수이며 -10<=a<b<=86400, rate는 null 또는 0.25~2.0. partStats 구간은 유한 수 -10<=a<=b<=86400(기존 0/0 파트 표기를 보존), rate 0.25~2.0. seconds/loops는 Int 범위의 비음수. 기존 private 세션 저장 규칙은 이 작업에서 변경하지 않는다.
- videoId 검증 실패, 잘못된 part 구조/빈 이름/50자 초과/정수 overflow는 409 SESSION_NOT_SHAREABLE로 공유만 차단하고 원본은 수정하지 않는다. 공유 문구가 HTML처럼 보여도 HTML로 해석하지 않는다. UI 텍스트 출력·XSS 검증은 CM-UI에서 추가한다.
- 금칙어 목록이 향후 변경되면 공개 응답 직전 title/comment/part name을 재검사해 해당 카드 전체를 제외한다(원문/금칙어를 오류에 되돌려주지 않음). 기존 private DTO/집계 DTO에 이 신규 검사를 확장하지 않는다.

## 5. HTTP 계약

모든 경로 prefix는 `/api/v1`. 모든 성공/오류는 `Cache-Control: no-store`. 알려진 경로 인증→형식 검증→리소스/소유권→자격/상태→쓰기 순서로 검사한다. 없는 경로 404 우선 규칙은 유지한다.

| 메서드·경로 | 성공 / 요청·응답 / 권한 |
| --- | --- |
| POST `/sessions/{sessionId}/share` | 201 신규 생성, 200 기존 행 수정/재게시. ShareEpisodeRequest → ShareEpisodeResponse. 소유자+communityWrite+publicName, hidden 차단. |
| DELETE `/sessions/{sessionId}/share` | 200 WithdrawEpisodeResponse. 소유자면 무료/공개 이름 없음/숨김도 철회 가능. 소유 세션에 카드가 없거나 이미 철회면 동일 200, 변경 시각은 최초 철회만 갱신. |
| GET `/community/episode-logs` | 200 EpisodeLogListResponse. 인증된 무료 포함. scope=all(기본) 또는 following, cursor 선택. 페이지 20개 고정. |
| GET `/community/me/episode-logs` | 200 MyEpisodeLogListResponse. 자기 카드만 모든 상태/철회 포함, cursor 선택, 페이지 20개. |
| POST `/community/episode-logs/{postId}/reports` | 201 ReportEpisodeResponse. 인증된 무료 포함, 현재 공개 가능한 카드만, 자기 카드 신고는 400 SELF_REPORT_NOT_ALLOWED. |
| GET `/admin/community/episode-logs/reports` | 200 AdminEpisodeReportListResponse. owner만, status=open(기본)/resolved/dismissed, cursor 선택, limit 기본50/1~200. |
| PATCH `/admin/community/episode-logs/{postId}` | 200 AdminEpisodeModerationDto. owner만, ModerateEpisodeRequest. 철회된 카드도 숨김/숨김 해제 가능하되 철회는 유지. |
| PATCH `/admin/community/episode-logs/reports/{reportId}` (보완안) | 200 AdminEpisodeReportDto. owner만, ResolveEpisodeReportRequest. 기존 `/admin/reports/{reportId}`의 폴더 신고 의미는 유지. |

### 오류 표

표준 ApiErrorResponse 전 필드: ok=false, source='server', status:Int, code:String, message:String(공개 가능한 설명), retryAfter:Int?=null, detail:JsonObject? (없으면 미출력). 신규 경로도 기존 표준 assertStandardError와 대조한다.

| HTTP / code | 조건 / detail |
| --- | --- |
| 400 INVALID_INPUT | 잘못된 JSON·타입·길이·scope/status/limit/cursor·미정의 키. detail 없음 |
| 400 BANNED_WORD | 공개 문구/파트 이름 금칙어. detail={field:String} |
| 400 SELF_REPORT_NOT_ALLOWED | 자기 카드 신고. detail 없음 |
| 401 UNAUTHORIZED | 인증 없음/유효하지 않은 토큰. 기존 인증 플러그인 세부 오류는 유지 |
| 403 TIER_UPGRADE_REQUIRED | POST 공유에 communityWrite 없음. 기존 tierUpgradeRequired의 detail(feature/tier 등) 재사용 |
| 403 FORBIDDEN | 비 owner 관리 API 접근 |
| 404 NOT_FOUND | 없는 리소스, 타인 sessionId, 공개 자격 없는 postId 신고. UUID 경로 파싱 실패도 기존 parsePathUuid 규칙 유지. 소유권 불일치는 존재 은닉을 위해 404로 통일하고 403 티어 오류와 구별 |
| 409 PUBLIC_NAME_REQUIRED | 소유자 공유 POST에 공개 이름 없음 |
| 409 POST_MODERATION_HIDDEN | 숨김 게시물에 작성자 POST; 삭제/철회 여부와 무관 |
| 409 SESSION_NOT_SHAREABLE | 공개 메타의 데이터 형식/범위 무효 |
| 409 ALREADY_REPORTED | 같은 카드에 같은 사용자 열린 신고 있음(동시 INSERT 충돌도 같은 코드) |
| 409 REPORT_ALREADY_RESOLVED | 이미 종결된 신고 재처리 |
| 409 POST_REPUBLISH_REQUIRED | 운영자 published 요청이 tier_paused만 해제하려는 경우 |
| 503 DB_UNAVAILABLE | DB 미연결. 기존 표준 |

숨김+무료가 동시에 적용되면 소유권 이후 hidden 409를 자격 오류보다 우선해 재게시 차단을 명확히 한다. 그 외 POST는 유료→공개 이름→메타 검증 순서. 신고 duplicate는 본인 여부/공개 자격 확인 이후 검사한다. 모든 실패는 카드/신고/audit 변경 0건을 단언한다. DB 예외를 일괄 409로 숨기지 않고 해당 unique constraint 충돌만 매핑한다.

### 커서와 정렬

- 공개/내 목록: `(published_at DESC,id DESC)`, 신고 목록: `(created_at DESC,id DESC)`. 엄격한 `<` 복합 keyset 조건과 UUID DB 정렬을 사용한다. offset으로 바꾸지 않는다.
- cursor는 URL-safe base64(패딩 없음) UTF-8 JSON `{v:1,kind:String,scope:String,at:String,id:String}`. kind는 feed/mine/reports, scope는 all/following/self 또는 신고 status. 인증 사용자/선택 scope와 쿼리 필터는 cursor 내용으로 대체하지 않는다.
- 입력 최대 1024 ASCII 문자, decode/type/version/종류/scope/UTC Instant/UUID 검증 실패는 400. 서명 없는 정렬 위치일 뿐 권한 토큰이 아니므로 조작해도 타인 비공개 데이터 접근 불가.
- 공개 자격 필터 후 21번째(신고는 limit+1) 유효 행으로 next 유무를 판단한다. next 위치는 마지막 **반환** 행. 금칙어/유료 계산을 JVM에서 검사하면 스캔 배치를 이어 채우며 필터 이전 20개만 읽어 빈 페이지/잘못된 next를 만들지 않는다.
- 커서 뒤 철회/숨김/삭제는 누락시키고 같은 published_at의 id tie-break를 검증한다. 재게시로 게시 시각이 바뀐 행은 새 피드 첫 페이지에 등장할 수 있다. 피드 전체의 고정 스냅샷 일관성을 보장하지 않는다.

## 6. 권한·상태·수명주기

공개 조건은 모두 AND: status=published, withdrawn_at IS NULL, tier_paused_at IS NULL, hidden_at IS NULL, 작성자 publicName 비어 있지 않음, 작성자 effectiveTier(now)의 communityWrite=true, 원본 세션/곡 존재 및 소유자 일치, 공개 메타·문구 유효. 팔로잉은 추가로 follows.follower_id=viewerId AND followee_id=작성자. 자기 자신을 임의 포함하지 않는다. 무료 열람은 작성자 무료 공개를 허용한다는 뜻이 아니다.

| 사건 | 상태 변화 / 보존 |
| --- | --- |
| 첫 POST | published, withdrawn/paused/hidden null, 스냅샷·문구·published_at 생성. 한 세션 한 행. |
| published에 재POST | 같은 postId·published_at 유지, 스냅샷/문구 전체 교체·updated_at 갱신. |
| DELETE | withdrawn_at 설정 및 공개 사본 제거. moderation_hidden/hidden 사유/paused 표식·신고 유지. 무료도 가능. |
| 철회 또는 tier_paused 후 작성자 POST | hidden 아님+유료+이름+메타 유효일 때만 published, withdrawn/paused 해제, published_at 갱신. |
| 무료 강등/유예 종료 | tier_paused_at 설정. hidden이면 status=moderation_hidden 보존, 그 외 status=tier_paused. 철회도 유지. |
| 재구독 | 자동 상태 복원 없음. 작성자 POST만 paused 해제. |
| owner 숨김 | moderation_hidden, hidden_at/reason 기록. 철회·paused 표식 유지. 신고는 자동 종결하지 않음. |
| owner 숨김 해제(status=published 요청) | hidden만 해제. paused 표식 또는 현재 무료이면 결과 tier_paused, 나머지 published. 철회 표식은 항상 유지. hidden이 아닌 tier_paused를 owner가 직접 해제하려면 409. 이미 published에 동일 요청은 200 무변경/audit 추가 없음. |
| 신고 resolved/dismissed | 해당 신고 상태/처리 시각과 audit만 갱신. 카드 숨김/복구와 분리. 종결 후 같은 사용자가 다시 신고 가능. |
| 공개 이름 owner 초기화 | 공개 쿼리에서 즉시 제외. 이름 재설정 시 기존 비철회/비정지 카드는 다시 자격을 얻는다(기존 공개 이름 정책 계승). 자동 POST는 없음. |
| 원본 세션/곡 또는 사용자 삭제 | 카드/관련 신고 cascade. 다른 사용자 데이터 무변경. |

canRepublish는 !hidden && 실제유료 && 공개이름있음 && (철회 또는 paused)이다. 서버는 값에 관계없이 POST에서 다시 검사한다. published 수정은 별도 재동의 POST로 가능하다. 내 목록 status는 저장 상태를 반환하되 scheduler 지연 중 현재 무료라면 표시 상태 tier_paused로 투영하고 canRepublish=false. 공개 조회는 scheduler 실행 여부와 관계없이 실제 자격을 적용한다.

## 7. 트랜잭션·경합·외부 I/O

1. 쓰기는 DatabaseFactory.dbQuery 한 트랜잭션으로 수행한다. 공유 시 profiles(티어 잠금)→소유 곡→소유 세션→카드 순서로 잠근다. SongService.delete의 곡→세션 cascade 순서를 따른다. sessionId로 소유 곡 ID를 예비 조회하더라도 userId 조건을 포함하고, 곡/세션 잠금 후 존재·소유권을 다시 검사한다. 기존 삭제의 공유 폴더 재동기화와의 경합도 §8에서 확인한다.
2. POST 생성은 부모 세션 행 잠금으로 직렬화하고 UNIQUE(session_id)를 최종 방어로 둔다. 격리 DB의 동시 2POST는 201+200, 카드 1개. DELETE/POST·숨김/POST·강등/POST 경합은 먼저 커밋한 결과를 후속 트랜잭션이 재검사한다. hidden 또는 paused 표식을 최신 값으로 확인해 오래된 조회로 덮어쓰지 않는다.
3. owner 쓰기도 동일 사용자 profiles→곡→세션→카드→신고 순서(필요한 행만)로 잠그고, 같은 트랜잭션에서 owner 역할을 재검사한다. 기존 OwnerOnlyPlugin의 사전 검사만 신뢰하지 않는다. actor와 작성자 profiles 여러 개를 잠글 때 UUID 순서로 잠근다. 신고 처리는 카드→신고 순서, 신고 생성도 카드 직렬화와 부분 UNIQUE를 함께 쓴다.
4. 강등은 기존 profiles 잠금 아래 downgradeCleanup에서 해당 카드들을 id 순으로 정지시킨다. override 만료·수동 override·monthly credits/유예 종료 모두 같은 helper를 통한다. **만료 cron이 지연된 채 재구독한 경우**에도 다시 공개되지 않게, 유료 자격을 복원하는 경로에서 변경 전 만료/유예 종료를 확인하고 미반영 정지를 먼저 수행한다. 구체적으로 변경 전 effectiveTier가 무료이고, 저장된 유료 override의 until<=now 또는 저장된 유료 credit_cycle의 next_at<=now이면 신규 카드 정지를 먼저 적용한다(기존 processDueCycle이 이미 정리했다면 멱등). 유예로 effectiveTier가 여전히 유료인 경우에는 조기 정지하지 않는다. 현재 유료 여부의 before/after 비교만으로 무료 구간 이력을 지우지 않는다. 관련 변경은 AdminService/TierService/CreditService 대상 호출부까지 대조·검증한다.
5. 공개 피드는 DB에서 공개 자격을 검사하고 DTO를 새로 조립한다. YouTube 조회가 필요하면 후보 videoId만 수집→트랜잭션 종료→fillTitles→새 트랜잭션에서 **공개 자격/팔로우/철회/숨김을 재검사**하고 최종 DTO를 만든다. 그 사이 철회한 카드를 첫 조회의 사본으로 응답하지 않는다. 응답이 이미 전송된 데이터까지 회수할 수 있다는 보장은 하지 않는다.
6. POST도 메타 보충 I/O를 잠금/쓰기 트랜잭션에 넣지 않는다. 메타 없음/일반 조회 실패는 youtubeTitle/Artist=null로 제공하고 개인 곡 제목 fallback 금지. CancellationException은 반드시 전파해 쓰기 전 취소는 무변경으로 끝낸다. 공개 GET의 부수 효과는 기존 YouTube 캐시 보충까지만 허용한다.
7. DB 커밋 전 취소는 롤백, 커밋 후 응답 유실은 가능하므로 같은 세션 재POST/DELETE로 안전하게 재시도한다. 모더레이션 상태 변경·신고 종결과 audit INSERT는 원자적이다. audit 실패를 잡아 성공 응답하지 않는다. audit 전후 값은 상태·시각·대상 ID만 포함하고 개인 원본/스냅샷/신고 상세 복사는 피한다.
8. 핵심 데이터는 사용자 소유 세션이다. 무관한 app_id 필드를 새로 만들지 않는다. 기존 통합 데이터 경계는 변경하지 않고 다른 앱/레거시 데이터 fallback을 추가하지 않는다.

## 8. 검증 설계 — 실행 결과 아님

격리 PostgreSQL+Ktor testApplication으로 A(유료 작성자), B(무료 열람자), C(유료 비소유자), O(owner)를 만든다. 실제 개인/공개 DB 상태와 HTTP 응답을 함께 검증한다. TestTier.set은 fixture일 뿐 강등 검증을 대체하지 않는다. 강등 시나리오는 실제 override/만료/주기 처리 경로를 호출한다.

| 테스트 파일 / 설계 시나리오 이름 (실제 테스트 매핑은 진행 파일 §6) | 프로덕션 가드 → 필수 단언 |
| --- | --- |
| EpisodeLogApiTest / `ownerOnlyShareAndWithdraw` | userId+sessionId → B/C POST·DELETE 404, 임의 ID 404, A 카드/세션/신고 변화 없음. A 소유 세션 카드 없어도 DELETE 200. |
| EpisodeLogApiTest / `requiresPaidPublicNameAndExplicitPost` | communityWrite/publicName → 무료403·이름없음409·동의만 켠 과거 세션0게시; 유료 유예 중 성공, 신규201/수정200/동일postId. |
| EpisodeLogApiTest / `validatesTextAndSnapshot` | 타입/길이/금칙어/명시 투영 → 80·500 허용, 81·501 거절, 빈 값/이모지/code point 경계, 기호 우회 금칙어, part name 금칙어 및 잘못된 JSON/비유한 수/overflow 차단; 모든 실패 DB/audit 무변경. |
| EpisodeLogApiTest / `publicDtoHasExactAllowlist` | 별도 DTO → 공개 key set 및 중첩 owner/part key set 완전 일치, 개인 memo/displayName/email/곡제목/테이크키 sentinel을 전체 응답에서 불포함. 메타 없을 때 null, private title fallback0. |
| EpisodeLogApiTest / `snapshotChangesOnlyOnExplicitPost` | 저장 스냅샷 → 공유 후 개인 누적/파트 변경은 기존 공개 값 유지, 명시 재POST만 갱신. 알 수 없는 JSON 키 비공개. |
| EpisodeLogApiTest / `feedKeysetAndFollowing` | 공개 자격+복합 cursor → 20/21/동시각 경계·following A팔로우/해제·scope 조작·cursor 오류400·필터 앞20개 모두 비공개여도 다음 유효 행 제공, 중복/next 검증. |
| EpisodeLogApiTest / `mineIsolatedAndLegacyLogsUnchanged` | 내 목록 userId → A/B 교환 후 상대 비공개/사유 없음. share_practice_log false에도 세션 공유 가능, 신규 게시만으로 기존 동의 변경 없음. 기존 logs/PracticeLogDto 정확한 key·84일 의미 유지. |
| EpisodeLogApiTest / `cascadeAndWithdraw` | FK/withdrawn → 철회 즉시 피드0, 사본 문구·snapshot 제거/행·신고 유지, 같은 ID 재게시; 곡/세션/탈퇴 cascade 후 행0 및 B 원본 무변경. |
| EpisodeLogModerationApiTest / `reportsAndOwnerAudit` | owner/부분 UNIQUE/처리 상태 → 무료 B 신고201, 중복409, 자기신고400, 숨김/철회 신고404; 비owner GET/PATCH403, 상세는 owner만; resolve/dismiss 및 재처리409, 종결 후 재신고201, 각 실제 관리 변경 audit1행. |
| EpisodeLogModerationApiTest / `hiddenCannotBeBypassed` | hidden 영속 → 숨김→DELETE→재POST409, hidden→강등→재구독→작성자POST409; owner 복구는 철회/paused 유지. 신고 처리만으로 공개 복구 없음. |
| TierQuotaAdminApiTest + EpisodeLogModerationApiTest / `downgradeNeverAutoRepublishes` | 공통 cleanup+조회 자격 → 수동 강등/override 만료/유예 종료 각각 비공개, 유예 전에는 공개, 재구독 자동공개0, 작성자POST만 복원. cron 미실행 무료 상태도 비노출, cron 지연→재구독 정지 표식 유지. 기존 폴더 비공개·동의OFF 회귀 유지. |
| EpisodeLogConcurrencyTest / `serializedWritesAndUniqueReports` | 잠금+제약 → 두POST 카드1개, 두신고 열린행1개/201+409, POST↔DELETE/숨김/강등/곡삭제 교차 실행 최종 불변식; unique 외 DB 오류를409로 둔갑시키지 않음. |
| EpisodeLogConcurrencyTest / `lateMetadataAndCancellation` | I/O 밖+최종 재조회/취소 → 메타 조회를 latch로 지연, B조회 중 A철회/owner숨김/강등 후 release하면 공개결과0. 쓰기커밋 전 취소 행/audit0, audit 실패 시 상태도 롤백. 임의 sleep 금지. |

기본 검증 명령(실제 실행한 환경 우회 flags·명령·결과는 진행 파일 §5~§6):

```powershell
./gradlew.bat test --tests "ulevelp.community.EpisodeLogApiTest" --tests "ulevelp.community.EpisodeLogModerationApiTest" --tests "ulevelp.community.EpisodeLogConcurrencyTest" --tests "ulevelp.community.CommunityApiTest" --tests "ulevelp.tier.TierQuotaAdminApiTest"
./gradlew.bat test
git diff --check
```

마이그레이션 제약은 서비스 테스트와 별도로 직접 잘못된 INSERT/동시 INSERT하여 거절 및 무변경을 확인한다. Docker/로컬 격리 DB 확보 전 공유 환경에서 실행하지 않는다. UI·i18n 키·DOM·스크린샷 변경은 CM-BE에 N/A(서버 작업). CM-UI/PF에서 401/403/409 분기와 사용자 A↔B 지연 응답 폐기, 텍스트 렌더링을 실제 연결해야 한다.

## 9. 완료 기준과 후속 관문

- 이 명세의 완료는 필드·오류·권한·상태·삭제·경합·검증과 실제 근거를 문서화하고 링크/인코딩/diff를 확인한 상태다. 제품 기능 통과를 뜻하지 않는다.
- 구현 착수 전 §2의 신규 스키마/API/주입 시그니처, §3의 철회 보존·스냅샷, §5 신고처리 PATCH 보완안을 사용자 구현 범위와 대조했다. 로컬 구현·테스트 승인 완료, Git 게시 승인은 없다.
- 구현 완료는 V10/서비스/경로 및 §8 격리 DB 회귀 통과와 실제 코드↔단언 대조가 필요하다. 커밋/PR·CI·사용자 머지·운영 배포는 각각 증거를 분리한다.
- CM-UI/PF는 이 계약을 입력으로 화면 명세를 작성한다. 운영자 신고 화면을 API 존재만으로 완료 처리하지 않는다. 운영 확인·배포는 별도 승인/환경 확인 후 수행한다.

## 10. 구현 검토 보충 (2026-11-09)

- §2 범위의 DTO/검증/커서와 경로 등록을 각각 EpisodeContract.kt/EpisodeRoutes.kt로 분리한다. API 경계와 기능 범위는 §4~§5 그대로다.
- `src/main/kotlin/ulevelp/api/JsonInput.kt:36`의 requireString/optString은 String.length(UTF-16) 기반이다. 신규 API 전용 검증은 code point 길이와 잘못된 surrogate/제어 문자를 trim 전에 검사한다. 기존 공용 helper 계약을 확대하지 않는다.
- `src/main/kotlin/ulevelp/service/AdminService.kt:279`(기준 커밋)의 setTierOverride는 processDueCycle보다 먼저 기존 만료 override를 검사해 신규 카드 정지를 기록한다. 주기 만료 정리는 기존 processDueCycle→downgradeCleanup을 따른다. 현재 제품에 billing tier 쓰기 경로는 없으며 미래 결제 경로에는 같은 선행 처리가 필요하다.
- POST 응답은 기존 YouTube 캐시만 읽고 메타가 없으면 null을 반환한다. 피드는 외부 메타 보충 후 최종 공개 자격을 다시 조회한다. 개인 곡 제목 fallback은 없다.
- 신규 공유의 profile 잠금→INSERT FK 잠금 순서에 맞춰 AdminService.loadUserRow의 잠금을 `FOR UPDATE OF profiles`로 한정한다. users까지 함께 잠그면 기존 관리자 티어 변경과 최초 카드 INSERT 사이에 반대 순서가 생길 수 있다. override 만료의 다중 profile 잠금도 UUID 오름차순으로 맞춘다.
- CreditService의 processDueCycle은 기존 profiles 잠금→downgradeCleanup 경로에서 신규 카드 정지까지 수행한다. 현재 호출부 대조 결과 크레딧 금액/주기 또는 함수 시그니처의 추가 변경은 필요하지 않다.
