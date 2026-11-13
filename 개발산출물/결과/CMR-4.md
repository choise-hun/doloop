# CMR-4 결과 — 게시물(연습 기록 카드) 좋아요 (S2) 1차 구현·검증

> 2026-11-13 / Windows / 주니어 역할(Claude Sonnet 임시 투입) 4단계 중 2단계. 명세 [CMR-4](../명세/CMR-4_구현명세.md). 브랜치 `step/CMR-4`(base `main`=`5fcbacf`), PR [#13](https://github.com/choise-hun/doloop/pull/13). 코드 head `20ba323`(문서 커밋은 그 뒤 — 아래 §6 최종 head).
> 현재: 시니어 3단계 독립 검증 완료(§7, 2026-11-13). 다음 담당: 주니어 4단계 최종 회귀·문서·기존 PR/CI 정리. 시니어 변경은 미커밋이며 PR head는 `cfab9a5` 유지.

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
| L7 비로그인·형식 | `unauthenticatedAndMalformedId` | 형식 오류 PUT·DELETE 400 `INVALID_INPUT`(§5-1, Codex 리뷰 반영) |
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

1. **L7 형식 오류 응답 — 해결(Codex P1 반영):** 명세 §4.2·L7은 잘못된 UUID에 `400 INVALID_INPUT`인데 공용 `parsePathUuid`(`JsonInput.kt:202`)는 모든 경로에서 404다. 처음에는 404로 두고 보고하려 했으나 Codex 리뷰(P1)가 승인 계약 위반으로 지적해, 공용 함수는 그대로 두고 **좋아요 두 라우트에서만** `parseLikePostId`(404 → `InvalidInputException`)로 400을 돌려 명세에 맞췄다. 신고·폴더 좋아요의 404는 변경 없음(시니어 확인: 다른 경로와 응답이 달라지는 점).
2. **행동 줄 줄바꿈:** §4 △. 명세 §5의 "한 줄"이 2열 카드 폭에서는 성립하지 않는다. 명세 문구를 고칠지(권장), 카드 폭·버튼 크기를 바꿀지 결정.
3. **목록 밖 수정 2건(필수 컴파일·기존 계약 반영):** `frontend/src/lib/communityMock.ts`(dev mock 타입에 두 필드 추가 — 없으면 `tsc` 실패), `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt`(공개 DTO "정확 키 목록" 단언에 `likeCount`·`likedByMe` 두 키만 추가 — 단언을 느슨하게 한 것이 아니라 D7 계약 변경 반영).
4. `EpisodeLogFeed`의 `posts` 갱신은 응답값으로만 교체한다. 같은 카드가 두 곳(피드·내 게시물 등)에 있을 때의 동기화는 하지 않았다(범위 밖).

## 6. Git·CI

- 커밋: `acd047d` 서버, `337170c` 프런트·e2e, `20ba323` 문서(D9), 이어서 결과·진행 기록 커밋.
- PR [#13](https://github.com/choise-hun/doloop/pull/13) (head `step/CMR-4` → base `main`). CI·리뷰 확인 결과는 아래에 추가한다.

### CI·리뷰
- head `758e1f6` CI: Detect·Test(Node 22)·Kotlin(JDK 21)·Docker·E2E XSS & CSP·CI ok 전부 pass(run 43359226684).
- Codex 리뷰(commit `20ba323`) P1 1건: 좋아요 경로 잘못된 UUID 400 → **타당**(승인 명세 §4.2·L7). 수정: `parseLikePostId`, 테스트 400 단언(PUT·DELETE). 로컬 `./gradlew clean test --tests EpisodeLikeApiTest` 8건 통과. 수정 커밋 `26962d2` CI: Detect·Test(Node 22)·Kotlin(JDK 21)·Docker·E2E XSS & CSP·CI ok 전부 pass(run 43360717764).
- 이후 Codex가 `26962d2`를 다시 리뷰했는지는 확인하지 못했다(2026-11-13 기준 코멘트는 `20ba323` 대상 P1 1건뿐, 위에서 처리). 이 기록 커밋은 문서 전용이다.

## 7. 시니어 3단계 독립 검증 (2026-11-13 / Windows / Codex)

### 7.1 대상·판정

- `gh` 활성 계정 `choise-hun`, 브랜치 `step/CMR-4`, 로컬·PR #13 head `cfab9a5348690476e808f699f1093a07d9492ba7`, base `main`, OPEN. 시작 시 작업 트리 깨끗함. 이미 대상 브랜치라 전환 불필요.
- 템플릿 §3 적용. §3-P는 특정 리뷰 결함만 남은 경우인데 이번 요청은 신규 독립 검증·변이 검사·명세 판단을 포함하므로 축소판 조건에 해당하지 않는다.
- PR의 프로덕션·테스트 diff와 관련 호출부를 직접 대조했다. 현재 프로덕션 결함은 발견하지 않았고, **E1/E4의 검증 구멍 2건을 보강**했다. 일반 전체 회귀는 4단계에 맡긴다.

| 확인 요청 | 시니어 판단·근거 |
| --- | --- |
| 좋아요만 형식 오류 400 | **수용·유지.** 승인 명세 §4.2·L7이 400 `INVALID_INPUT`이다. `EpisodeRoutes.kt:33,50,56`의 전용 파서가 공용 `JsonInput.kt:202`의 404를 좋아요 두 경로에 한해 변환한다. 기존 신고·폴더 계약을 일괄 변경하지 않는다. PUT·DELETE 400/401 및 DB 무변경을 L7에서 실제 확인 |
| 명세 §5 “한 줄” | **정정.** 모든 폭에서 카드 폭에 따른 flex-wrap을 허용하고 좋아요 첫 항목·겹침/넘침 없음을 명시. 오류 문구도 카드 폭에 따른 줄바꿈 허용. 버튼 크기·카드 폭·제품 코드는 변경하지 않음. 4개 폭+다크 캡처에서 행동 줄 2줄을 직접 확인 |
| 목록 밖 두 파일 | **수용, 명세 §3 목록에 추가.** `communityMock.ts:83-84`는 D7 필수 타입 필드 추가, `EpisodeLogApiTest.kt:88`은 정확 키 집합에 두 키 추가. 기존 키 삭제나 느슨한 포함 단언으로 바꾸지 않았음 |
| 피드 간 동기화 | 현재 승인 D8은 요청한 카드에 서버 확정 응답을 반영하는 계약이다. 다른 피드·내 게시물까지 전역 동기화하는 기능은 추가하지 않음 |

서버 정적 근거: `EpisodeLogService.kt:98` 일괄 GROUP BY, `:151,172,210` 공유/내 목록/피드 DTO 반영, `:161` 철회 트랜잭션 내 삭제, `:222-228` 카드 잠금→eligible 재조회→본인 좋아요 행만 수정→집계. 공개 DTO에 비공개 데이터 추가 없음. 프런트 근거: `EpisodeLogCard.tsx:32-73` ref/uid/seq/언마운트 가드, `EpisodeLogFeed.tsx:162,229,243,250` 서버 응답 반영 및 렌더 3경로 연결.

### 7.2 변이 검사와 테스트 보강

각 변이는 `EpisodeLogCard.tsx` 원본을 임시 경로에 바이트 단위 보관하고 **각각 원본에서 시작**했다. 매 변이마다 `npm run build` 후 아래 명령을 실행했다. 최종 원본 바이트 복원 및 `git diff -- frontend/src/components/community/EpisodeLogCard.tsx` 출력 없음 확인. 프로덕션 변경은 남지 않는다.

| 변이 | 실행 | 실제 결과 |
| --- | --- | --- |
| `if (likeBusyRef.current) return` 제거 | `npx playwright test test/e2e/community.spec.js -g 'CMR4-E1'` | 기존 E1 통과 → 같은 JS 작업에서 `el.click()` 2회로 보강 후 **실패**, 요청 수 기대 1 / 실제 2 (`community.spec.js:1760`) |
| try/catch `if (!isCurrent()) return` 제거 + finally 조건 제거 | `npx playwright test test/e2e/community.spec.js -g 'CMR4-E4'`(기존 E4), 이후 `-g 'CMR4-E4b'` | 기존 탭 이탈 E4 통과 → E4b 추가 후 **실패**, 기대 `좋아요 · 3` / 실제 `좋아요 · 7` (`:1872`) |
| 요청 직후 `onLikeChange?.(post.postId, target, likeCount + 1)` 삽입 | `npx playwright test test/e2e/community.spec.js -g 'CMR4-E1'` | **실패**, 요청 중 기대 3 / 실제 4 (`:1755`) |

- E4a: 기존 탭 이탈/복귀 시나리오 유지. 응답 본문 처리까지 `response.finished()`로 기다리도록 보강.
- E4b: 같은 피드를 유지하면서 두 번째 카드를 1280→390 폭 변경으로 다른 masonry 열로 이동시킨다. 이전 DOM의 `isConnected=false`와 새 버튼 활성화를 확인하고 늦은 응답을 풀어, 살아 있는 피드의 posts가 오염되는지 관찰한다. 초기 실험에서 첫 번째 카드는 같은 열에 남아 재마운트되지 않았으므로 두 번째 카드 fixture로 바로잡았다(프로덕션 결함 아님).
- E4c: 인증 listener로 A→B 전환, B의 별도 값 `11/true`가 표시된 뒤 A의 지연 응답 `7/false`를 풀고 B 값·버튼 활성 유지 확인. uid/seq 개별 조건만 제거하는 변이, 지연 오류 응답은 별도로 실행하지 않았다.

### 7.3 실제 최종 검증·제한

| 명령·대상 | 결과 |
| --- | --- |
| `./gradlew.bat '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.daemon.jvmargs=-Xmx3g' cleanTest test --tests ulevelp.community.EpisodeLikeApiTest` | 격리 Testcontainers PostgreSQL에서 **8 tests, failures/errors/skipped 모두 0**, BUILD SUCCESSFUL. 최초 `test`만 실행한 것은 UP-TO-DATE라 실행 증거로 세지 않고 `cleanTest`로 실제 재실행 |
| 원본 복원 후 `npm run build` | TypeScript·Vite 통과(기존 CJS/script/chunk 경고) |
| `npx playwright test test/e2e/community.spec.js -g 'CMR4-E'` | **6 passed**(E1·E2·E3·E4a/b/c), skip 없음 |
| `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/community.spec.js -g 'community-pro\|community-logs'` | **10 passed**, 종료 후 환경변수 제거 |
| `test-results/layout-shots/community-logs-communityPro-{390,768,1150,1280,1280-dark}.png` | 5장 직접 검토. 좋아요 첫 항목·행동 줄 줄바꿈·카드 내부 겹침/넘침 없음. 기존 Q1~Q9 판단 유지. 오류 상태 캡처는 이번에도 미실행 |
| `git diff --check` | 통과(최종 문서 갱신 후 재확인) |

전체 Gradle·마이그레이션 단독·`npm test`·community/cm-ui 전체 회귀는 이번 3단계에서 미실행. §2의 주니어 결과를 이번 실행 결과로 승격하지 않는다. 기존 npm 실패 3건의 main 재현도 이번에는 재실행하지 않았다. 레이아웃 spec 선작성 Red 순서 누락은 과거 절차 위반으로 유지하며 소급 충족을 주장하지 않는다.

### 7.4 Git·CI·리뷰·4단계 입력

- 최신 게시 head `cfab9a5`: [run 43361814639](https://github.com/choise-hun/doloop/actions/runs/43361814639) SUCCESS. Detect/CI ok만 실행, Node/Kotlin/E2E/Docker는 SKIPPED. 코드 테스트 통과로 표현하지 않는다.
- 직전 코드 head `26962d2`: [run 43360717764](https://github.com/choise-hun/doloop/actions/runs/43360717764)에서 6 job 모두 SUCCESS를 API로 재확인. 로컬 미커밋 테스트 보강까지 검증한 CI는 아직 없다.
- 현재 리뷰 1건은 `20ba323` 대상 [P1](https://github.com/choise-hun/doloop/pull/13#discussion_r4559334200). 타당하며 현재 전용 파서+L7로 이미 해소. `26962d2` 이후 새 리뷰는 조회 시 없음. 댓글·리뷰 게시·스레드 resolve는 수행하지 않음.
- 시니어 변경: `test/e2e/community.spec.js`, CMR-4 명세, 이 결과 파일, S3b 진행 파일만. 모두 unstaged/미커밋. commit/push/merge/deploy 없음.
- 실행 도중 범위 밖 `개발산출물/report.md` 삭제가 관찰됐다(시작 상태에는 없었음). 원인을 단정하지 않고 복구·수정하지 않는다. **사용자/동시 작업 변경으로 보존하고 4단계 커밋에서 제외**한다.
- 다음은 템플릿 §4. 최종 전체 회귀·명세 체크리스트와 오류 상태 캡처 확인, 기존 npm 3실패의 최종 영향 판단, 결과/진행 문서 갱신, CMR-4 파일만 커밋·push·기존 PR #13 갱신, 최신 head CI와 리뷰 확인. S3b-1 이후 착수·머지·배포 금지. 구체 인계문은 진행 §9.

## 8. 주니어 4단계 최종 검증·마무리 (2026-11-13 / Windows / Gemini)

- 시니어 3단계 diff(`test/e2e/community.spec.js`, 명세, 결과, 진행) 및 판단(좋아요만 400 유지, §5 카드 폭별 줄바꿈 허용, 목록 밖 2건 수용) 대조 완료. E1 연속 클릭·E4a/b/c 단언 변경 없음.
- 범위 밖 `개발산출물/report.md` 삭제는 보존하고 이번 커밋에서 제외한다.

| 명령·대상 | 실제 결과 |
| --- | --- |
| `./gradlew.bat '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.daemon.jvmargs=-Xmx3g' cleanTest test --tests "ulevelp.community.EpisodeLikeApiTest"` | 통과 (`BUILD SUCCESSFUL in 16s`) |
| `./gradlew.bat '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.daemon.jvmargs=-Xmx3g' cleanTest test --tests "ulevelp.db.DatabaseMigrationAndIntegrityTest"` | 단독 통과 (7건, Flyway v11·테이블 27개, `BUILD SUCCESSFUL in 6s`) |
| `./gradlew.bat '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.daemon.jvmargs=-Xmx3g' cleanTest test` | **326건 통과** (skipped 0·failures 0·errors 0, `BUILD SUCCESSFUL in 1m 11s`) |
| `npx tsc --noEmit; npm run build` | 통과 (`3.49s`) |
| `npm test` | 420건 중 417 통과·3 실패 (`ch2c1_chord_forms.test.js`, `ch2c3_form_review.test.js`, `i18n.test.js` LA-1 — 모두 §2에서 main 재현 확인된 기존 실패이며 신규 실패 0. `design_rules.test.js` 통과) |
| `npx playwright test test/e2e/community.spec.js test/e2e/layout/community.spec.js test/e2e/cm-ui.spec.js` | **144건 통과** (`CMR4-E1`~`E4c` 포함, `2.3m`) |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js -g "community-logs"` | 5건 통과 (`8.9s`) |
| 오류 상태(`likeErr`) 390px·1280px 캡처 확인 | 500 응답 시 `좋아요 · 3` 유지, 카드 폭 내 오류 문구 줄바꿈·겹침/넘침 없음 확인 |
| `git grep -n "likeCount" src/main/kotlin/ulevelp/service/EpisodeContract.kt` | `PublicEpisodeLogDto`(:20)·`EpisodeLikeResponse`(:22) 2건 확인(명세 §7 체크리스트 정정) |
