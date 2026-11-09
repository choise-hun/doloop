# CM-BE 로컬 구현·diff 검토

- 확인: 2026-11-09 / Windows / Codex, `step/cm-be`, HEAD `f20f030bc03cd3d100bffeccb5bd142e0c9e67f1`의 미커밋 작업 트리.
- 범위: [진행 §4~§6](../진행_CM-BE.md), [승인 명세](../명세/CM-BE_구현명세.md)의 제품·테스트 17파일과 CM-BE 문서 2파일. staged 문서 이동 5개 및 LLM/계획/인수인계의 기존 사용자 변경은 제외·보존했다.
- 최초 검토 판정: **P2 1건 발견 및 해소 완료**. §1~§4는 제품 미수정 당시 기록, 로컬 수정·정식 회귀는 §5, Git 게시 내역은 §6을 따른다. 기존 314개 통과 기록과 추가 경계 실패/수정 후 결과를 구별한다.

## 1. 발견 사항

### P2 — 커서 시각 검증과 쿼리 변환을 같은 파서로 처리

- 위치: `src/main/kotlin/ulevelp/service/EpisodeContract.kt:84`의 `Instant.parse(c.at)`와 `:94`의 `OffsetDateTime.parse(cursor.at)`.
- 원인: 입력 검증에서 받아들인 Instant 문자열을 쿼리 생성 시 다른 타입으로 다시 파싱한다. 두 파서의 지원 범위·윤초 처리 차이로 두 번째 파싱이 실패하며, 이 예외는 `EpisodeCursor.parse`의 400 변환 범위 밖이다.
- 재현: 정상 v/kind/scope/UUID를 가진 URL-safe base64 커서의 at에 `2016-12-31T23:59:60Z` 또는 `+1000000000-12-31T23:59:59.999999999Z`를 넣는다. 인증 사용자로 공개 피드·내 목록, owner로 관리자 신고 목록을 요청하면 **6개 요청 모두 500**이다. 비공개 데이터 노출은 관찰하지 않았다.
- 명세 연결: §5의 cursor 검증 실패는 400 INVALID_INPUT이어야 한다. 유효한 UTC Instant로 취급할 입력은 쿼리용 값으로 안전하게 정규화하고, 지원 범위 밖 입력은 검증 경계에서 거절해야 한다. 정상 입력을 받아들인 뒤 내부 파싱 오류로 500을 반환하면 안 된다.
- 권장 수정: 커서 경계에서 쿼리에 사용할 타입·DB 지원 범위까지 검증하고 동일한 파싱 결과를 사용한다. 피드/mine/reports와 정상 커서의 페이지 경계를 함께 회귀 검증한다. 이번 요청은 검토이므로 수정하지 않았다.

## 2. AC-5·AC-6 근거 대조

| 대상 | 실제 코드·단언 및 검토 결과 |
| --- | --- |
| AC-5 소유권·게시 자격 | EpisodeLogService.lockSource/share/withdraw의 userId 조건, profiles→곡→세션→카드 잠금과 EpisodeLogApiTest.ownerOnlyShareAndWithdraw/requiresPaidPublicNameAndExplicitPost를 대조했다. A/B/C 404, 무료403, 이름없음409, 명시 POST·동일 ID 재게시 단언이 있다. |
| AC-5 문구·철회·신고·숨김·강등 | EpisodeContract.episodeText, EpisodeLogService.snapshot/eligible/report, AdminService.lockEpisode/moderateEpisode/resolveEpisodeReport, TierService.pauseEpisodeCards/pauseExpiredEpisodeCards를 API·모더레이션·경합 테스트와 대조했다. 숨김의 철회 우회 차단, 강등/재구독 자동공개 차단, 실제 override·만료·주기 경로, audit 롤백, 메타 지연 후 재조회·쓰기 취소 단언이 있다. |
| AC-6 공개 필드·스냅샷 | PublicEpisodeLogDto/PublicPartStatDto/PublicOwnerDto의 키 집합 일치, 개인 sentinel·이메일 불포함, YouTube 메타 null일 때 개인 곡 제목 fallback 없음, 명시 POST만 공개 스냅샷 갱신을 확인했다. 공개 DTO는 개인 Session DTO를 재사용하지 않는다. |
| AC-6 기존 집계 | 기존 `/community/logs` 라우트·PracticeLogService는 변경하지 않았다. EpisodeLogApiTest에서 신규 게시가 sharePracticeLog를 켜지 않음을 단언하고, 기존 CurationApiTest의 84일 범위·동의·팔로잉 단언과 통과 XML을 확인했다. |
| V10·범위 | V1~V9 수정 없음. V9 개인 세션을 둔 상태의 V10 전환 후 게시0, 새 DB V1→V10, 직접 SQL CHECK/UNIQUE 거절 단언을 확인했다. UI·레거시 경로·의존성 변경은 없다. |

코드와 기존 단언을 대조한 범위에서 위 AC의 추가 제품 결함은 발견하지 못했다. 기존 테스트가 명세의 모든 입력 조합을 실제 실행했다는 뜻은 아니다. 예를 들어 비유한 수 전 조합, 팔로우 해제의 메타 지연 교차, 자동 연동 공개 폴더를 둔 곡 삭제 경합은 기존 신규 테스트에서 각각 독립 실행·단언한 근거가 없다. 실제 변이 검사는 하지 않았다.

## 3. 실행·원시 근거

- 기존 원시 XML 36개를 다시 집계: `build/cm-be-verified/test-results/test/TEST-*.xml` → **314 tests / failures 0 / errors 0 / skipped 0**. 신규 14개(API6·모더레이션3·경합3·마이그레이션2) 포함. UTF-16 로그 `build/cm-be-verified.log`에도 BUILD SUCCESSFUL in 3m 1s가 있다. 이는 이전 실행 근거 확인이며 이번에 전체 테스트를 다시 실행한 결과가 아니다.
- 이번 재현은 기존 원시 결과를 덮지 않도록 ignored `build/cm-be-review-src/EpisodeReviewBoundaryTest.kt`를 별도 test source로 추가하고 출력·프로젝트 캐시를 분리했다. 실제 PostgreSQL 공급자는 외부 설정을 받지 않는 PostgresTestContainer의 로컬 격리 컨테이너다.
- 최초 Kotlin init script는 플러그인 타입을 해석하지 못해 설정 컴파일에서 실패했다. 테스트는 실행되지 않았다. 동적 설정을 사용하는 Groovy init script로 바꾼 뒤 아래 명령을 실행했다.

```powershell
./gradlew.bat --project-cache-dir build/cm-be-review-project-cache -I build/cm-be-review.init.gradle '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.jvmargs=-Xmx2g' test --tests ulevelp.community.EpisodeReviewBoundaryTest
```

- 실제 결과: **1 test / failures 1 / errors 0 / skipped 0**, expected `[400,400,400,400,400,400]`, actual `[500,500,500,500,500,500]`. HTTP 응답을 관찰한 실패 재현이다. 제품 수정 및 Green 확인은 미실행이다.
- 원시 근거: `build/cm-be-review.log`, `build/cm-be-review/test-results/test/TEST-ulevelp.community.EpisodeReviewBoundaryTest.xml`, `build/cm-be-review/reports/tests/test/index.html`. 테스트·init·로그·XML은 ignored여서 git으로 전달되지 않는다.
- init 내용:

```groovy
allprojects {
    layout.buildDirectory.set(file("build/cm-be-review"))
    afterEvaluate {
        kotlin.sourceSets.test.kotlin.srcDir(file("build/cm-be-review-src"))
    }
}
```

재현 테스트는 위 두 at 값과 각 경로에 맞는 `(kind,scope)`=`(feed,all)`/`(mine,self)`/`(reports,open)`, v=1, id=`00000000-0000-0000-0000-000000000001`을 JSON으로 인코딩한다. EpisodeTestSupport에서 owner를 생성하고 세 목록에 순차 GET한 HTTP 상태를 단언한다. 다른 PC에서는 이 설명으로 정식 회귀 테스트를 재작성할 수 있다.

## 4. 한계·다음 행동

- 기존 제품·테스트 17파일과 index는 검토 중 추가 수정/스테이징하지 않았다. 검토 중 SHA-256 및 index tree를 `build/cm-be-review-source-hashes.json`에 저장해 종료 시 동일함을 확인했다. 최초 사용자 변경을 새 커밋으로 게시하지 않았다.
- `git diff --check` 통과. CM-BE 문서의 UTF-8(BOM 없음)·LF·코드 블록 짝과 결과/명세의 상대 링크를 확인했다. 최종 브랜치는 step/cm-be이며 기존 staged 문서 이동 5개를 유지했다.
- 전체 서버 테스트 재실행·UI 연결·실외부 YouTube·운영·CI는 미실행이다. 이 결과는 로컬 검토이며 배포 승인이나 운영 통과가 아니다.
- 검토 당시 다음 작업은 P2 로컬 수정·정식 회귀 검증이었다. 후속 실행은 아래 §5, 현재 재개 범위와 Git 제한은 [진행 §4](../진행_CM-BE.md)를 따른다. Git 게시 여부는 별도 사용자 지시를 받는다.

## 5. P2 후속 로컬 수정·정식 회귀 (2026-11-09)

- 사용자 승인 범위: 커서 코드·정식 회귀 테스트·진행/결과 기록. 커밋·push·PR·CI·배포는 실행하지 않는다.
- 제품 변경: `EpisodeContract.kt`의 `EpisodeCursor.queryAt`에 `@Transient`로 SQL용 `OffsetDateTime`을 한 번 파싱·검증해 저장하고, `episodeBefore`가 같은 값을 사용한다. wire JSON의 v/kind/scope/at/id는 유지한다. 파싱·범위 실패는 기존 parse의 INVALID_INPUT 경계에서 처리한다.
- 지원 경계: PostgreSQL 16의 Julian day 0 (`-4713-11-24T00:00:00Z`)부터 마지막 유한 마이크로초 (`+294276-12-31T23:59:59.999999Z`)까지. 상한에서 JDBC 마이크로초 반올림으로 범위를 넘는 입력도 거절한다. [PostgreSQL 공식 소스](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/include/datatype/timestamp.h#L195), [정밀도 문서](https://www.postgresql.org/docs/16/datatype-datetime.html). 윤초는 쿼리용 파서에서 거절하며 임의 시각으로 보정하지 않는다.
- 정식 테스트: `src/test/kotlin/ulevelp/community/EpisodeCursorApiTest.kt` 3개. 잘못된 시각 8종×목록 3종의 24개 요청은 400/INVALID_INPUT/DB 무변경, 정상 시각 4종×3종의 12개 요청은 200, 동시각 21개는 각 목록에서 20+1/UUID 내림차순/중복·누락 없음/next=null을 단언한다. 기존 feed/following/100개 넘는 필터 스캔 테스트도 유지한다.
- Red: 제품 수정 전 정식 `invalidCursorTimesReturn400AcrossAllLists` 실행 → **1 test / failures 1 / errors 0 / skipped 0**. 24요청 중 18개500·6개200으로 기대400과 불일치. §1의 원래 두 입력은 6개 모두500을 재현했다. 정식 실패 원시는 `build/cm-be-p2-red.log`, `build/cm-be-p2-red.xml`에 보존했다.

```powershell
# ignored init: allprojects { layout.buildDirectory.set(file("build/cm-be-p2")) }
./gradlew.bat --project-cache-dir build/cm-be-p2-project-cache -I build/cm-be-p2.init.gradle.kts '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.jvmargs=-Xmx2g' test --tests ulevelp.community.EpisodeCursorApiTest.invalidCursorTimesReturn400AcrossAllLists
# 수정 후 관련 CM-BE 회귀
./gradlew.bat --project-cache-dir build/cm-be-p2-project-cache -I build/cm-be-p2.init.gradle.kts '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.jvmargs=-Xmx2g' test --tests 'ulevelp.community.Episode*'
```

- Green: **BUILD SUCCESSFUL in 2m 18s**, XML 5개 실제 합계 **17 tests / failures 0 / errors 0 / skipped 0**. 신규 커서3·기존 API6·경합3·모더레이션3·마이그레이션2. 잘못된 커서24요청 모두400 INVALID_INPUT, 유효 시각12요청200, 목록3종 20+1 경계 통과. 로컬 격리 PostgresTestContainer에서 실행했다. `build/cm-be-p2-green.log`, `build/cm-be-p2/test-results/test/TEST-*.xml`, `build/cm-be-p2/reports/tests/test/index.html`이 원시 근거다.
- 판정: **P2 해소, 요청한 로컬 수정·검증 완료**. 프로덕션 입력 가드→400/오류 본문/DB 무변경 및 정상 keyset 단언을 연결했다. 기존 사용자 변경은 보존했고 index tree `e46c227c99c72b089c43996f288b5b4582a7569c`도 유지됐다. 이번 추가 변경은 커서 코드·신규 테스트·진행/결과 문서 4파일이며 추가 staging은 없다. UTF-8(BOM 없음)·LF·문서 상대 링크/코드 블록·git diff --check를 확인했다.
- 이번 범위는 커서 P2다. 전체 314개 재실행·실외부 YouTube·화면 연결·운영·CI·변이 검사는 미실행이며 이전 전체 통과 기록을 이번 실행으로 바꾸지 않는다. 원시 출력/캐시는 ignored 로컬 자료로 다른 PC에 전달되지 않는다.

## 6. Git 게시 및 CI/리뷰 확인 (2026-11-09)

- 사용자 승인(“CM-BE 로컬 구현과 P2 수정을 Git으로 게시한다”)에 따라 제품·테스트 18파일과 CM-BE 문서 3파일(총 21파일)을 선별하여 커밋·push하고 main 대상 PR을 생성했다.
  - 커밋: `fe68f7b` (`feat(community): CM-BE 개별 세션 공유 구현 및 P2 커서 수정`)
  - PR: [PR #145](https://github.com/choise-hun/doloop/pull/145) (main 대상)
- 선행 조건대로 기존 사용자 변경·staged 문서 이동·LLM 작업은 온전히 보존하고 커밋 대상에서 제외했다.
- 최신 CI 모니터링: GitHub Actions run `42559989948` (Kotlin, Node 22/24, Docker smoke, E2E 등) **전체 통과 (Pass)**.
- 리뷰 코멘트 조회 및 판단:
  - `chatgpt-codex-connector[bot]`의 P2 리뷰 ([PR 코멘트](https://github.com/choise-hun/doloop/pull/145#discussion_r4509375772)): `AdminService.kt`의 신고 목록 조회 시 동시 cascade 삭제 경합 방어를 위한 JOIN 쿼리 단일화 권장.
  - 판단: 타당한 개선점이며, PR 게시 및 CI 검증 완료 후 후속 리뷰 반영 또는 다음 단계에서 단일 JOIN으로 개선 처리하기로 기록함.
- 세부 게시 내역은 [진행 파일 §8](../진행_CM-BE.md)에 기록했다. 머지는 사용자 담당이다.


