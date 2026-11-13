# CMR-4 결과 — 게시물(연습 기록 카드) 좋아요 (S2) 1차 구현·검증

> 2026-11-13 / Windows / 주니어 역할(Claude Sonnet 임시 투입) 4단계 중 2단계. 명세 [CMR-4](../명세/CMR-4_구현명세.md). 브랜치 `step/CMR-4`(base `main`=`5fcbacf`), PR [#13](https://github.com/choise-hun/doloop/pull/13). 코드 head `20ba323`(문서 커밋은 그 뒤 — 아래 §6 최종 head).
> 다음 담당: 시니어 3단계 독립 검증(§5 결정 요청 2건 포함).

## 1. 한 일

| 영역 | 변경 |
| --- | --- |
| DB | `V11__episode_likes.sql` — `shared_practice_card_likes(card_id,user_id,created_at)` PK(card,user), 카드·사용자 CASCADE, `(user_id)` 인덱스. 카운터 열 없음 |
| 서버 | `SharedPracticeCardLikesTable`(+`ALL_TABLES`), `EpisodeLikeResponse`, `PublicEpisodeLogDto` 끝에 `likeCount`·`likedByMe`, `EpisodeLogService.setLike`(카드 행 `FOR UPDATE` → `eligible` 재확인 → `insertIgnore`/`deleteWhere` → `COUNT`), `likeStates`(id 목록 1회 `GROUP BY`), `publicDto`·`mineDto` 인자, `withdraw`에서 같은 트랜잭션 삭제, 라우트 `PUT|DELETE /episode-logs/{postId}/like`(`no-store`) |
| 프런트 | `apiClient`(타입 필드, `communitySetEpisodeLike`, `community.setEpisodeLike`), `EpisodeLogCard`(행동 줄 맨 앞 좋아요 버튼 `role=switch`·`aria-checked`·`data-episode-like`, 요청 중 `disabled`, 응답값만 반영, 오류 `p[data-episode-like-error]`, uid·요청 번호·언마운트 가드, 404는 `episode.err.gone` 후 `onPostGone`), `EpisodeLogFeed.handleLikeChange`(3곳 prop 전달), CSS `.likeBtn`·`.likeErr`(토큰 `--bad`만), i18n 3개 국어 키 2개 |
| 테스트 | `EpisodeLikeApiTest` 8건(L1~L9), `DatabaseMigrationAndIntegrityTest`(버전 11·테이블 27), e2e fixture(`likeCount:3,likedByMe:false`, `opts.onEpisodeLike`), `community.spec.js` CMR4-E1~E4, `layout/community.spec.js`(좋아요 버튼 표시 대기) |
| 문서 | 계획 §1 10-2, UIUX-R 머리말·§5·RV-1·RV-3 서술(D9) |

## 2. 실제 실행한 검증

| 명령 | 결과 |
| --- | --- |
| `./gradlew test --tests "ulevelp.community.EpisodeLikeApiTest"` | 8건 통과, 실패 0 (`BUILD SUCCESSFUL`) |
| `./gradlew test --tests "ulevelp.db.DatabaseMigrationAndIntegrityTest"` (단독 실행) | 통과(버전 `"11"`·테이블 27). 다른 클래스 앞에서 필터 실행하면 공유 컨테이너가 이미 마이그레이션돼 `targetSchemaVersion=null`로 실패할 수 있다(기존 테스트의 순서 의존, 전체 실행에서는 통과) |
| `./gradlew test` 전체 | **326건, 실패 0·오류 0·skip 0** (`BUILD SUCCESSFUL in 2m 15s`, XML 합산 확인). 기존 Episode* 회귀 없음 |
| `npx tsc --noEmit` / `npm run build` | 통과 |
| `npm test` | 420건 중 417 통과·**3 실패 — main(변경 전, `git stash`로 측정)에서도 같은 3건**: CH-2c-1-1, CH-2c-3-2(chords 변환 저장본 불일치), LA-1(한글 잔존, 목록에 변경 안 한 파일 다수). 내 변경이 늘린 실패 0. `design_rules.test.js`·waitForTimeout 가드 통과 |
| `npx playwright test test/e2e/community.spec.js test/e2e/layout/community.spec.js test/e2e/cm-ui.spec.js` | **142 통과** (CMR4-E1~E4 포함, `npm run build` 뒤 실행) |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js -g "community-pro\|community-logs"` | 10건 통과, `test-results/layout-shots/community-{pro,logs}-communityPro-{390,768,1150,1280,1280-dark}.png` 캡처 후 검토(§4) |
| `git grep -n "likeCount" src/main/kotlin/ulevelp/service/EpisodeContract.kt` | `PublicEpisodeLogDto`·`EpisodeLikeResponse` 2건(명세는 1건이라 적었으나 `EpisodeLikeResponse`도 `likeCount`를 가지므로 2건이 맞다) |

### 환경 메모 (Windows)
- 이 PC에서 Kotlin 컴파일 데몬이 기본 메모리로 OOM(`GC overhead limit exceeded`) → 불완전한 클래스가 생겨 `NoClassDefFoundError`가 났다. `-Dorg.gradle.jvmargs=-Xmx3g -Pkotlin.daemon.jvmargs=-Xmx3g`로 해결(저장소 파일은 안 바꿈). CI(ubuntu)는 이 문제를 겪지 않을 것으로 보지만 확인은 CI 결과로.
- layout spec을 `gradlew test`와 동시에 돌리면 `page.goto` 타임아웃 2건이 났다(CPU 경합). 단독 재실행 34건 통과.

## 3. 테스트 매핑

| 명세 | 구현 | 비고 |
| --- | --- | --- |
| L1 좋아요·취소 | `likeAndUnlikeReflectInFeed` | |
| L2 멱등 | `idempotent` | DB 행 수까지 확인 |
| L3 본인 허용 | `ownerMayLikeOwnPost` | |
| L4 비대상 404 | `ineligibleTargetsAre404` | 없는 id·철회·관리자 숨김·티어 정지, 행 0 |
| L5 철회 정리 / L6 정지 보존 | `withdrawClearsLikesButTierPauseKeepsThem` | |
| L7 비로그인·형식 | `unauthenticatedAndMalformedId` | **형식 오류는 404 단언(§5-1)** |
| L8 동시성 | `concurrentLikesCountEachUserOnce` | B·C 각 5회 동시, 집계 2 |
| L9 필드 | `everyResponsePathCarriesLikeFields` | 공유 응답(생성·재공유)·내 게시물·피드 |
| L10 마이그레이션 | `DatabaseMigrationAndIntegrityTest` | 버전 11·27개 |
| E1~E4 | `CMR4-E1`~`E4` | E1은 요청 중 `좋아요 · 3` 유지 단언(낙관적 +1 금지), E4는 탭 이탈 뒤 복귀 후 늦은 응답이 값을 바꾸지 않는지(응답 이벤트 대기, 타이머 대기 없음) |

- 변이 확인(테스트가 실제로 버그를 잡는지)은 하지 않았다. 시니어 3단계에서 필요하면 `likeBusyRef`·`isCurrent` 제거, 카운터 낙관 +1 삽입으로 확인할 것.

## 4. 4개 폭 스크린샷 Q1~Q9 (`community-logs-communityPro-*`, 피드 2열 masonry, 다크는 1280)

| # | 390 | 768 | 1150 | 1280 | 다크(1280) |
| --- | --- | --- | --- | --- | --- |
| Q1 강한 버튼 1개 | ○ | ○ | ○ | ○ | ○ |
| Q2 칸 사이 여백 | ○ | ○ | ○ | ○ | ○ |
| Q3 기준선 | ○ | ○ | ○ | ○ | ○ |
| Q4 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 빈 상태 | — 변경 없음 | — | — | — | — |
| Q6 순서·열 | ○ 좋아요가 행동 줄 첫 항목 | ○ | ○ | ○ | ○ |
| Q7 유채색 | ○ | ○ | ○ | ○ | ○ |
| Q8 곡률 | ○ 기존 `ghost mini`와 같음 | ○ | ○ | ○ | ○ |
| Q9 다크 대비 | — | — | — | ○ | ○ |

- **△ 한 가지(판정 표 밖 사실):** 명세 §5는 1150·1280에서 행동 줄이 "한 줄"이라 했지만, 피드가 2열 masonry라 카드가 약 365px 폭이라 좋아요·구간 재생 / 내 보관함 담기·신고가 **두 줄로 줄바꿈**된다(390·768도 같음). 겹침·넘침은 없고 G0~G8 통과, 두 줄 안에서 `center-y` 정렬도 맞다. 변경 전 화면과 비교해 보지는 않았다. 규격상 문제는 아니라 그대로 두었고 시니어 확인 요청(§5-2).
- 오류 문구 상태(`likeErr`)는 스크린샷으로 찍지 않았다(e2e E2가 텍스트만 확인).
- 규칙 순서 위반: `frontend-layout` §작업 순서 2("layout spec 먼저 쓰고 실패 확인")는 **지키지 못했다.** 구현 뒤에 spec(좋아요 버튼 표시 대기)을 추가했고, 이전 코드에서 실패하는지는 확인하지 않았다.

## 5. 시니어 결정·확인 요청

1. **L7 형식 오류 응답:** 명세 §4.2·L7은 잘못된 UUID에 `400 INVALID_INPUT`. 그러나 공용 `parsePathUuid`(`JsonInput.kt:202`)는 모든 경로에서 `404 NOT_FOUND`이고 신고·폴더 좋아요도 같다. 공용 계약 변경은 범위 밖이라 **404 유지·테스트는 404 단언**(코드 주석에 사유 기록). 400으로 가려면 이 두 라우트만 별도 파서를 쓰거나 공용 함수를 바꿔야 한다 — 결정 필요.
2. **행동 줄 줄바꿈:** §4 △. 명세 §5의 "한 줄"이 2열 카드 폭에서는 성립하지 않는다. 명세 문구를 고칠지(권장), 카드 폭·버튼 크기를 바꿀지 결정.
3. **목록 밖 수정 2건(필수 컴파일·기존 계약 반영):** `frontend/src/lib/communityMock.ts`(dev mock 타입에 두 필드 추가 — 없으면 `tsc` 실패), `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt`(공개 DTO "정확 키 목록" 단언에 `likeCount`·`likedByMe` 두 키만 추가 — 단언을 느슨하게 한 것이 아니라 D7 계약 변경 반영).
4. `EpisodeLogFeed`의 `posts` 갱신은 응답값으로만 교체한다. 같은 카드가 두 곳(피드·내 게시물 등)에 있을 때의 동기화는 하지 않았다(범위 밖).

## 6. Git·CI

- 커밋: `acd047d` 서버, `337170c` 프런트·e2e, `20ba323` 문서(D9), 이어서 결과·진행 기록 커밋.
- PR [#13](https://github.com/choise-hun/doloop/pull/13) (head `step/CMR-4` → base `main`). CI·리뷰 확인 결과는 아래에 추가한다.

### CI·리뷰
- (기록 대기)
