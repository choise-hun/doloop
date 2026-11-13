# CMR-4 구현 명세 — 게시물(연습 기록 카드) 좋아요 (S2)

> 작성: 2026-11-13 / Claude(시니어). 상위: [UIUX-R §5.6](UIUX-R_수정명세.md#56-s2--게시물-좋아요-서버-계약-변경-별도-승인), [S3b 임시 명세 R05·R10](S3b_연습기록카드공유_임시명세.md#10-결정-기록). 진행: [진행_S3b_카드공유](../진행_S3b_카드공유.md).
> 담당: **[주니어] 4단계.** 판정(협업 §1.2): ① 기존 셀렉터·DOM 이동 없음(카드 행동 줄에 버튼 추가만) ② 공유 코드 공존 없음 ③ 폴더 좋아요(서버)·신고 창의 404 처리(화면) 패턴이 이미 있음 → 주니어.
> 브랜치 `step/CMR-4`, base `main`. **상태: 승인(2026-11-13, 진행 §5 Q1~Q6 추천안).** CMR-4의 S3a(녹음 재생 UI)는 S3b-4로 옮겼다(R10).

## 1. 전제 (`main`=`d5c2566`, 구현 전 재확인)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `src/main/resources/db/migration/V10__shared_practice_cards.sql:2-21` | 카드 테이블 `shared_practice_cards`(id UUID PK, `session_id` UNIQUE, `status` 3종, `withdrawn_at`). 마지막 마이그레이션은 V10 |
| P2 | `V8__community.sql:93-99` | 폴더 좋아요 `folder_likes(folder_id, user_id, created_at, PK(folder_id,user_id))` + `folder_likes_user_idx`. 폴더는 카운터 열 `like_count`(`:45`)를 따로 둔다 |
| P3 | `src/main/kotlin/ulevelp/service/CommunityService.kt:716-744` | 폴더 `setLike`: `insertIgnore`/`deleteWhere` 후 카운터 ±1, 응답 `FolderLikeResponse(liked, likeCount)`(`:113`). 본인 폴더 400 |
| P4 | `src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:95-141` | `/community` 전체가 `SupabaseAuthPlugin` 아래(비로그인 401). 폴더 좋아요 `PUT|DELETE /folders/{id}/like`, `Cache-Control: no-store`, 200 |
| P5 | `src/main/kotlin/ulevelp/routes/EpisodeRoutes.kt:32-55` | `registerCommunityEpisodeRoutes`: 피드·내 게시물·신고. `CommunityRoutes.kt:101`에서 인증 경계 안에 등록 |
| P6 | `src/main/kotlin/ulevelp/service/EpisodeContract.kt:20` | `PublicEpisodeLogDto` 17개 필드(좋아요 없음). `MyEpisodeLogDto.card`(`:26`)와 `ShareEpisodeResponse.post`(`:30`)가 이 DTO를 포함 |
| P7 | `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:96-103` | `publicDto(row)`가 행마다 DTO를 만든다. 호출처 = `mineDto`(`:114`), `feed`(`:194`). `mineDto` 호출처 = `share`(`:140`), `mine`(`:158`) |
| P8 | `EpisodeLogService.kt:78-82` | `eligible(row)` = 게시·미철회·미정지·미숨김·공개 이름·유료·소유 일치·스냅샷 유효. 신고는 카드 행 `FOR UPDATE` 후 `takeIf(::eligible) ?: NotFoundException`(`:204-207`) |
| P9 | `EpisodeLogService.kt:143-151` | `withdraw`는 행을 지우지 않고 `withdrawn_at`·내용 비움. 다시 게시하면 같은 카드 id 재사용(`:130`) |
| P10 | `src/main/kotlin/ulevelp/db/Tables.kt:406-432`, `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt:102-105,128` | `ALL_TABLES` 26개, 테스트가 Flyway 버전 `"10"`·테이블 26개·`EXPECTED_TABLES`를 단언 |
| P11 | `src/test/kotlin/ulevelp/community/EpisodeTestSupport.kt:20-70` | 게시물 API 테스트 기반(`user(paid,named)`, `session()`, `send()`, `checked()`, `error()`) |
| P12 | `frontend/src/lib/apiClient.ts:547-565`, `:1572-1577`, `:1763-1776` | 프런트 `PublicEpisodeLogDto`, 폴더 `communitySetLike`, `apiClient.community` export 묶음 |
| P13 | `frontend/src/components/community/EpisodeLogCard.tsx:146-167` | 하단 `div.footerRow` > `div.actions`에 재생 링크 2개 + (남의 글) 신고 버튼. `isMine`(`:20`) |
| P14 | `frontend/src/components/community/EpisodeLogFeed.tsx:47`, `:156-159`, `:224`, `:238`, `:245` | `posts` 상태, `handlePostGone`(목록에서 빼고 첫 페이지 재조회), 카드 렌더 3곳(단일·masonry·grid) |
| P15 | `frontend/src/components/community/EpisodeReportDialog.tsx:115-126` | `classifyEpisodeError(err)`의 `not_found` → `episode.err.gone` + `onPostGone()` |
| P16 | `frontend/src/components/community/FolderSheet.tsx:87-97`, `:337-347` | 폴더 좋아요는 낙관적 갱신. 버튼 `role="switch" aria-checked` 문구 `folder.like · N`. **게시물은 낙관적 갱신을 쓰지 않는다**(UIUX-R §5.6) |
| P17 | `test/e2e/support/community-fixtures.js:485-494`, `:537` | 피드 mock 라우트와 `EPISODE_POST_1` fixture |
| P18 | `test/e2e/layout/community.spec.js:30-43` | 피드 카드(`[data-post-id]`) 렌더를 기다리는 layout spec이 있다 |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | 테이블 `shared_practice_card_likes(card_id, user_id, created_at)`, PK `(card_id,user_id)`, 카드·사용자 `ON DELETE CASCADE`, 인덱스 `(user_id)`. 마이그레이션 `V11__episode_likes.sql` |
| D2 | **카운터 열을 두지 않는다.** 응답 시 `COUNT(*)`로 집계한다(페이지 21건 이하 `GROUP BY card_id` 1회). 폴더식 카운터 드리프트를 만들지 않는다 |
| D3 | 좋아요 가능 대상 = `eligible(row)`인 카드. 아니면 404 `NOT_FOUND`(숨김·철회·정지·없음 구분 노출 없음). **본인 게시물 허용.** 티어 무관(무료 포함). 공개 이름 요구 없음 |
| D4 | 공유 중지(`withdraw`) 시 그 카드의 좋아요 행을 같은 트랜잭션에서 지운다(다시 게시하면 0부터). 티어 정지·관리자 숨김 중에는 보존(복구되면 다시 보인다). 세션·계정 삭제는 CASCADE |
| D5 | 멱등: 이미 누른 상태의 PUT, 안 누른 상태의 DELETE도 200 + 현재 값 |
| D6 | 잠금: 신고와 같이 카드 행 `FOR UPDATE` → `joined` 재조회 `eligible` → insert/delete → 집계. 철회·관리자 조치와 직렬화된다 |
| D7 | DTO 확장: `PublicEpisodeLogDto` 끝에 `likeCount: Int`, `likedByMe: Boolean` 추가(기존 필드 순서·의미 불변). 피드·내 게시물(`card`)·공유 응답 모두 채운다. 내 게시물의 `likedByMe`는 본인 기준 |
| D8 | 프런트는 **낙관적 갱신 없음**: 요청 중 버튼 비활성, 응답 `{liked, likeCount}`로만 반영, 실패 시 이전 값 유지 + 카드 안 오류 문구. 404는 `episode.err.gone` 후 `onPostGone`(P15와 같은 동작) |
| D9 | 계획 §1 10-2 행과 UIUX-R §5.6·§5.7 서술을 “CMR-4 = S2만, S3a는 S3b-4 흡수”로 이 PR에서 맞춘다(R10) |

## 3. 파일 목록 (목록 밖 파일은 고치지 않는다)

| 파일 | 신규/수정 | 하는 일 |
| --- | --- | --- |
| `src/main/resources/db/migration/V11__episode_likes.sql` | 신규 | D1 테이블·인덱스 |
| `src/main/kotlin/ulevelp/db/Tables.kt` | 수정 | `SharedPracticeCardLikesTable` 추가, `ALL_TABLES`에 추가 |
| `src/main/kotlin/ulevelp/service/EpisodeContract.kt` | 수정 | D7 필드, `EpisodeLikeResponse` |
| `src/main/kotlin/ulevelp/service/EpisodeLogService.kt` | 수정 | `setLike`, `likeStates`, `publicDto` 인자, `withdraw` 좋아요 삭제 |
| `src/main/kotlin/ulevelp/routes/EpisodeRoutes.kt` | 수정 | `PUT|DELETE /episode-logs/{postId}/like` |
| `src/test/kotlin/ulevelp/community/EpisodeLikeApiTest.kt` | 신규 | §6 서버 테스트 |
| `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt` | 수정 | 버전 `"11"`, 테이블 27, `EXPECTED_TABLES`에 새 테이블(테스트 이름 문자열 포함) |
| `frontend/src/lib/apiClient.ts` | 수정 | 타입 필드, `communitySetEpisodeLike`, `community.setEpisodeLike` export |
| `frontend/src/lib/communityMock.ts` | 수정 | D7 필수 필드를 dev mock에 추가(3단계 수용) |
| `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt` | 수정 | 공개 DTO 정확 키 목록에 D7 두 필드 추가(3단계 수용, 나머지 단언 유지) |
| `frontend/src/components/community/EpisodeLogCard.tsx` | 수정 | 좋아요 버튼·오류 문구, prop `onLikeChange` |
| `frontend/src/components/community/EpisodeLogCard.module.css` | 수정 | `.likeBtn`, `.likeErr`(토큰만) |
| `frontend/src/components/community/EpisodeLogFeed.tsx` | 수정 | `handleLikeChange`, 렌더 3곳에 prop 전달 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | §4 키 2개 |
| `test/e2e/support/community-fixtures.js` | 수정 | 게시물 fixture에 D7 필드, 좋아요 PUT/DELETE 라우트(`opts.onEpisodeLike`) |
| `test/e2e/community.spec.js` | 수정 | §6 화면 테스트 |
| `test/e2e/layout/community.spec.js` | 수정 | 좋아요 버튼 포함 4개 폭 검사(아래 §5) |
| `계획/상용_서비스_계획.md`, `개발산출물/명세/UIUX-R_수정명세.md` | 수정 | D9 서술 정리(문서만) |

## 4. 계약

### 4.1 DB (`V11__episode_likes.sql`)

열: `card_id UUID NOT NULL REFERENCES shared_practice_cards(id) ON DELETE CASCADE`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `PRIMARY KEY (card_id, user_id)`. 인덱스 `shared_practice_card_likes_user_idx ON (user_id)`.

### 4.2 API

| 메서드·경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `PUT /api/v1/community/episode-logs/{postId}/like` | 본문 없음(있어도 읽지 않음) | 200 `{"liked":true,"likeCount":N}` | 401(토큰 없음/무효, 기존 플러그인), 400 `INVALID_INPUT`(UUID 형식), 404 `NOT_FOUND`(D3) |
| `DELETE …/like` | 같음 | 200 `{"liked":false,"likeCount":N}` | 같음 |

둘 다 `Cache-Control: no-store`. `likeCount`는 처리 직후 같은 트랜잭션의 집계값.

### 4.3 시그니처

```kotlin
@Serializable data class EpisodeLikeResponse(val liked: Boolean, val likeCount: Int)
// PublicEpisodeLogDto(..., val partStats: List<PublicPartStatDto>, val likeCount: Int, val likedByMe: Boolean)
suspend fun EpisodeLogService.setLike(viewerId: UUID, postId: UUID, liked: Boolean): EpisodeLikeResponse
private fun Transaction.likeStates(viewerId: UUID, cardIds: Collection<UUID>): Map<UUID, Pair<Int, Boolean>> // 없는 id는 (0,false)
private fun Transaction.publicDto(row: ResultRow, likes: Map<UUID, Pair<Int, Boolean>>): PublicEpisodeLogDto?
```

- `feed`: `final` 계산 트랜잭션(`EpisodeLogService.kt:188-195`) 안에서 정렬·`take(21)` 뒤 id 목록으로 `likeStates` 1회 → `publicDto(it, likes)`.
- `mine`: 21행 id로 1회. `share`: 단일 id로 1회. `mineDto`는 `likes` 인자를 받아 `publicDto`에 넘긴다.
- `withdraw`: 기존 update와 같은 트랜잭션에서 `SharedPracticeCardLikesTable.deleteWhere { cardId eq old[C.id] }`(이미 철회된 행이면 아무것도 안 함).

```ts
// apiClient.ts
export interface PublicEpisodeLogDto { /* 기존 */ likeCount: number; likedByMe: boolean; }
async function communitySetEpisodeLike(postId: string, on: boolean): Promise<{ liked: boolean; likeCount: number }>
// apiClient.community.setEpisodeLike
// EpisodeLogCardProps에 추가
onLikeChange?: (postId: string, liked: boolean, likeCount: number) => void;
```

### 4.4 화면 문구 (ko / en / ja)

| 키 | ko | en | ja |
| --- | --- | --- | --- |
| `episode.like` | 좋아요 | Like | いいね |
| `episode.likeFailed` | 좋아요를 반영하지 못했어요. 다시 시도해 주세요 | Couldn’t update your like. Please try again | いいねを反映できませんでした。もう一度お試しください |

404는 기존 `episode.err.gone`, 기타 상태는 `episode.likeFailed`.

### 4.5 마크업 (`EpisodeLogCard`)

- `div.actions` 안 **맨 앞**에 `<button type="button" class="ghost mini {styles.actionBtn} {styles.likeBtn}" data-episode-like role="switch" aria-checked={likedByMe} disabled={busy} onClick>` 내용 `{t('episode.like')} · {likeCount}`. 본인 글에도 보인다.
- 오류: `footerRow` 바로 아래 `<p class={styles.likeErr} role="alert" data-episode-like-error>`(오류 있을 때만).
- 상태 처리(frontend-state §1): 클릭 시 `uid`·요청 번호 캡처, 응답 때 카드가 언마운트됐거나 uid·번호가 바뀌었으면 버린다. 같은 카드 요청 중 재클릭 무시.

## 5. 배치 약속

| 상태 | 390 | 768 | 1150·1280 |
| --- | --- | --- | --- |
| 기본 | 카드 폭에 따라 행동 줄 줄바꿈 허용(`flex-wrap`, P13 CSS `:244-249`). 좋아요가 첫 항목, 겹침·넘침 없음 | 같음 | 같음(다열 카드도 줄바꿈 허용) |
| 오류 | 행동 줄 아래 오류 문구. 카드 폭에 따른 문구 줄바꿈 허용, 겹침·넘침 없음 | 같음 | 같음 |

맞춤 그룹: 행동 줄 버튼 3~4개에 `data-align-group="episodeActions-{postId}:center-y"`(좋아요·재생·저장·신고). 터치 대상은 G7 기준(기존 `ghost mini`와 같은 높이 이상). `layout/community.spec.js`에서 기존 카드 대기 뒤 좋아요 버튼 표시를 확인하고 4개 폭 스크린샷 Q1~Q9를 결과 파일에 기록한다.

## 6. 테스트 표 (본문은 주니어가 쓴다)

| 이름 | 준비 | 실행 | 기대 | 잡아야 할 버그 |
| --- | --- | --- | --- | --- |
| L1 좋아요·취소 | 유료 A 게시, 무료 B | B PUT → DELETE | 200 `{true,1}` → `{false,0}`, 피드 B 기준 `likedByMe` 반영 | 카운트 미반영 |
| L2 멱등 | L1 | B PUT 2회, DELETE 2회 | 1·1, 0·0 | 중복 행·음수 |
| L3 본인 허용 | A 게시 | A PUT | 200 `{true,1}`, `mine`의 `card.likedByMe=true` | 폴더처럼 400 |
| L4 비대상 404 | 철회·숨김·티어 정지·없는 id 각각 | B PUT | 404 `NOT_FOUND`, 행 0 | 숨긴 글에 좋아요 |
| L5 철회 정리 | B 좋아요 후 A 철회→다시 게시 | 피드 조회 | `likeCount=0` | 옛 좋아요 부활 |
| L6 정지 보존 | B 좋아요, A 무료 전환(정지) → 재구독·다시 게시 | 피드 | `likeCount=1` | 정지 때 삭제 |
| L7 비로그인·형식 | 토큰 없음 / `postId=abc` | PUT | 401 / 400 `INVALID_INPUT` | 인증 우회 |
| L8 동시성 | B·C 동시 PUT 각 5회 | 집계 | 2 | 경합 중복 |
| L9 피드 필드 | 좋아요 2건 | 피드·내 게시물·공유 응답 | 세 응답 모두 `likeCount`·`likedByMe` 존재 | 한 경로 누락 |
| L10 마이그레이션 | — | `DatabaseMigrationAndIntegrityTest` | 버전 11·테이블 27 | 테이블 미등록 |
| E1 화면 반영 | fixture `likeCount:3,likedByMe:false`, 응답 `{true,7}` | 클릭 | 요청 중 `disabled`, 응답 뒤 `좋아요 · 7`, `aria-checked=true` | 낙관적 +1(4) 표시 |
| E2 실패 유지 | 응답 500 | 클릭 | `좋아요 · 3` 유지, `[data-episode-like-error]` 문구 | 실패 후 값 변경 |
| E3 404 | 응답 404 | 클릭 | `episode.err.gone` 후 카드 제거·첫 페이지 재조회 | 사라진 글 남음 |
| E4 늦은 응답 | 응답 지연 중 탭 전환·계정 전환 | 응답 도착 | 새 화면 값 변경 없음 | 늦은 응답 덮어쓰기 |

## 7. 체크리스트

- [x] `./gradlew test --tests "ulevelp.community.EpisodeLikeApiTest"` → BUILD SUCCESSFUL
- [x] `./gradlew test --tests "ulevelp.db.DatabaseMigrationAndIntegrityTest"` → 통과
- [x] `./gradlew test` 전체 → 통과(기존 Episode* 테스트 회귀 없음)
- [x] `npm test` → 통과(`test/design_rules.test.js` 포함, 기존 3실패 외 신규 실패 0)
- [x] `npx playwright test test/e2e/community.spec.js test/e2e/layout/community.spec.js` → 통과
- [x] `LAYOUT_SHOTS=1` 4개 폭 스크린샷 Q1~Q9 표 → `결과/CMR-4.md`
- [x] `git grep -n "likeCount" src/main/kotlin/ulevelp/service/EpisodeContract.kt` → `PublicEpisodeLogDto`·`EpisodeLikeResponse` 2건

## 8. 금지

- 카운터 열 추가, 폴더 좋아요 코드·응답 변경, 낙관적 갱신, 좋아요 누른 사람 목록 노출.
- `eligible` 밖에서 별도 노출 조건을 새로 만들기(숨김 글 좋아요 허용 등).
- 기존 `PublicEpisodeLogDto` 필드 이름·순서·nullable 변경. 기존 e2e 셀렉터(`data-post-id`, 신고 버튼) 변경.
- 테스트를 통과시키려고 단언을 바꾸는 것(testing-security §1).
