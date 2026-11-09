# 진행 — CM-BE 개별 세션 공유

- 갱신: 2026-11-09 / Windows / Codex 단독. 별도 협업 역할·구현 담당 배정 없음.
- 목표: 계획 §1 CM-BE의 승인된 DB/API·권한·모더레이션 로컬 구현과 AC-5·AC-6 검증.
- 입력: [상용 계획](../계획/상용_서비스_계획.md) CM-BE, [요구사항](요구사항_명세_초안.md) REQ-3 / AC-5·AC-6, [문서 운영](../docs/문서_운영.md), backend-kotlin/testing-security 규칙, 기준 커밋의 서버 코드.
- 승인: 로컬 구현/테스트 승인(§5) 및 P2 수정 승인(§7)에 이어, 사용자 “CM-BE 로컬 구현과 P2 수정을 Git으로 게시한다. 커밋·push·PR을 승인한다. 머지는 사용자 담당이며 배포는 제외한다” 확인(§8).
- 담당/변경 파일: [상세 명세](명세/CM-BE_구현명세.md) §2/§10의 제품 11, 테스트 7, CM-BE 문서 3 (총 21파일). 사용자 문서 이동·다른 작업 변경(LLM 작업, 계획/인수인계 메모)은 안전하게 보존.
- 완료 기준: 변경 선별, 관련 검증 확인, main 대상 PR 생성, 최신 CI 종료와 리뷰 판단 기록.
- 현재: PR #145의 신고 목록 삭제 경합 P2 수정과 로컬 관련 31개 검증 통과. 아래 §9의 게시/최신 CI 확인을 진행하며 §4/§8의 게시 대기·후속 보완 판단은 당시 기록이다.

## 1. Git·선행 확인 결과

1. 시작 브랜치 `feat/ch-b-instruments`. tracked 변경 GEMINI.md, docs/rules/testing-security.md, 개발산출물/주니어_체크리스트.md 및 untracked 완료/진행_탐색근거규칙.md 확인. 제품 소스 변경 없음.
2. GitHub get_pr_info 조회: [PR #143](https://github.com/choise-hun/doloop/pull/143) merged=true, main 대상, merge commit `2efbd9eb953560f63753b6f358b9f542721284f8`, merged_at `2026-11-09T01:48:47Z`(한국 10:48:47). 사용자 머지 선행 충족. CI 재실행/운영 배포는 하지 않음.
3. `git switch main` 성공. 최초 `git pull --ff-only origin main`은 위 4파일 덮어쓰기 방지로 중단(실패를 성공으로 기록하지 않음). origin/main에는 후속 PR #144도 포함된 `f20f030`이 확인됨.
4. tracked 3개는 `git diff origin/main -- <3개 경로>`가 비어 최신 원격 내용과 일치. untracked 완료 기록도 원격 동일 경로와 개행 정규화 후 내용 일치 확인.
5. `git stash push -u -m "cm-be-pre-sync-preserve-20261109" -- <위 4개 경로>`로 안전 사본 보존. stash SHA `c77e814a16c10361880a3ccb32d721a9e931b15c`. 그 후 `git pull --ff-only origin main` 성공, `30bcfc7`→`f20f030bc03cd3d100bffeccb5bd142e0c9e67f1`. 기존 변경은 main에 동일 내용으로 존재하므로 중복 apply하지 않음. stash는 삭제하지 않음.
6. `git switch -c step/cm-be` 성공. main/origin/main/현재 HEAD 기준은 위 f20f030. `git merge-base --is-ancestor 2efbd9eb953560f63753b6f358b9f542721284f8 main` exit 0으로 PR #143 포함도 확인했다.

## 2. 명세 결과와 제한

- [CM-BE 상세 구현 명세](명세/CM-BE_구현명세.md)에 V10 스키마, 신규 경로·DTO 전 필드, HTTP 오류, A/B 소유권, 공개 데이터 allowlist, 상태 전이·철회·원본 cascade, keyset cursor, 취소 전파/외부 I/O, 격리 DB 테스트를 작성했다.
- 실제 확인한 참조를 file:line으로 기록하고 V1~V9/현재 DTO·가드와 대조했다. 최초 추정 경로(ApiV1Routes.kt/JsonValidation.kt/TestDatabase.kt)는 존재하지 않아 실제 Session/Community/AdminRoutes, JsonInput.kt, PostgresTestContainer.kt로 재탐색했다. 추정 파일을 재사용 근거로 쓰지 않는다.
- 구현 전 검토할 제안: withdrawn_at으로 숨김 우회 방지, tier_paused_at으로 숨김 중 강등 보존, public_session 스냅샷으로 개인 메타 자동 공개 방지, 신고 종결 PATCH 보완. 이 제안이 구현 승인됐다고 기록하지 않는다.
- 구현 N/A가 아니라 **미착수**, 화면 연결 미구현(CM-UI/PF 후속), 서버/격리 DB 통합 검증 미실행, 운영 확인 미실행. 문서 검증만 수행한다.

## 3. 문서 검증

- 인라인 Python 문서 검사: 4개 문서의 UTF-8(BOM 없음)·LF·후행 공백·코드 블록 짝·상대 링크 존재, 명세 file:line 근거 21개 경로/행 범위 확인. 최초 검사에서 기존 계획/인수인계 CRLF를 발견해 이번 수정 대상 4문서만 LF로 정리하고 재검사했다.
- stash와 현재 트리 비교: 기존 tracked 3파일과 untracked 완료 기록 1파일의 내용이 모두 보존됐음을 개행 정규화 비교로 확인했다. stash 유지.
- `git diff --check` 통과. 최종 diff는 이 작업의 문서 4개만이며 제품 코드·테스트 변경 없음. 새 문서 2개는 untracked, 기존 문서 2개는 modified. 커밋·push·PR 없음.
- 제품 빌드·단위/API/E2E·마이그레이션·변이 검사·CI는 명세 전용 요청이므로 미실행. 구현 명세 §8은 검증 계획이며 실제 통과 결과가 아니다.

## 4. 다음 행동·재개 지시

> 2026-11-09 갱신: 아래 1~4 및 코드 블록은 Git 게시 전 기록이다. 게시와 커서 수정은 반복하지 않는다. 현재 리뷰 반영은 §9를 따른다. PR 검증 후에는 실제 PR #145 머지 확인과 사용자 변경을 보존한 main 안전 동기화를 선행하고, 계획의 CM-UI 상세 명세 검토부터 시작한다. CM-UI 구현·Git 게시는 별도 사용자 범위 지시를 따른다.

1. git status/브랜치와 이 파일 §5~§6, 상세 명세를 확인한다. 로컬 미커밋 변경은 다른 PC에 전달되지 않았다. 기존 staged 문서 이동·LLM 작업·계획/인수인계 변경은 CM-BE 제품 변경과 구분해 보존한다.
2. [검토 결과 §5](결과/CM-BE_로컬검토.md)의 P2 로컬 수정·정식 회귀를 완료했다. §7의 17개 통과와 과거 전체 314개 통과를 구별한다. P2 수정은 반복하지 않는다. 현재 승인 범위의 다음 로컬 작업은 없다. CM-BE 전체 Git 게시는 별도 지시 대기이며, 승인될 경우 아래 3~4 순서로 이어간다.
3. 커밋·push·main PR·최신 CI·리뷰 확인은 별도 사용자 지시가 있어야 수행한다. 승인되면 명세 §2/§10 및 이번 소스·테스트·CM-BE 문서만 선별한다. 기존 staged 변경을 함께 커밋하지 않는다.
4. PR 게시 후에는 문서 운영 §5에 따라 최신 CI와 리뷰를 각각 확인한다. 머지는 사용자 담당이며 운영 배포·CM-UI/PF는 별도 범위다.

```text
목표: CM-BE 로컬 구현·P2 검증 결과를 확인하고 후속 범위를 정한다.
범위: 진행_CM-BE.md §4·§7 및 결과/CM-BE_로컬검토.md §5. 완료한 P2 수정을 반복하지 않는다.
선행 조건: step/cm-be의 기존 사용자 변경·staged 문서 이동 보존.
완료 기준: 기존 전체 314개와 이번 CM-BE 17개 검증 근거·미실행 범위를 구별하고 사용자 지시 범위를 확인한다.
Git 처리: 커밋·push·PR은 별도 명시 지시 전 실행하지 않는다. 승인되면 §4의 선별·게시·CI/리뷰 확인 순서를 따른다. 머지는 사용자.
```

## 5. 2026-11-09 구현 착수

- 사용자 명시 답변: “보완안 포함 로컬 구현·테스트 승인”. 명세 §2~§7의 V10·신규 API·서비스 주입 및 withdrawn_at/tier_paused_at/public_session/신고 종결 PATCH를 승인했다. 커밋·push·PR·배포는 제외한다. 앞 절의 미승인은 준비 단계 당시 기록이다.
- 시작 브랜치 step/cm-be, HEAD f20f030. 기존 문서 이동(staged), 계획/인수인계 수정, LLM 스크립트·문서와 CM-BE 문서(untracked)를 확인하고 보존한다.
- 명세 실제 경로는 개발산출물/명세/CM-BE_구현명세.md. V1~V9만 존재해 V10 미선점 확인.
- PostgresTestContainer는 외부 DB 설정을 받지 않고 postgres:16-alpine을 127.0.0.1 동적 포트로 띄운다. Docker 29.7.2 응답 및 실제 PostgreSQL 16.15/V1→V9 마이그레이션 성공을 확인했다.
- 기준 검증: `./gradlew.bat test --tests "ulevelp.community.CommunityApiTest" --tests "ulevelp.tier.TierQuotaAdminApiTest"` → BUILD SUCCESSFUL. 신규 기능 검증은 아직 아니다.
- 검토: 기존 JSON 문자열 helper는 UTF-16 길이를 사용하므로 신규 입력 전용 code point/제어 문자 검증을 둔다. 기존 입력 계약은 변경하지 않는다. override 갱신 전 무료 구간 이력을 보존하고, 신규 관리 쓰기는 트랜잭션에서도 owner를 재검사한다.
- 구현: V10, Exposed 테이블, EpisodeContract/EpisodeLogService/EpisodeRoutes, 기존 서비스·경로 주입. 신규 helper 파일은 명세 책임을 분리한 것이며 새 제품 범위는 아니다.
- 최초 compileTestKotlin은 Windows 기존 build/classes 및 Kotlin 캐시 삭제 실패로 중단됐다. 다른 작업 출력과 충돌하지 않게 ignored `build/cm-be.init.gradle.kts`에서 빌드 출력을 build/cm-be로 분리한다. 실패를 통과로 기록하지 않는다.
- 최초 제품 컴파일은 Main의 신규 서비스 import 누락을 수정했고, 테스트 컴파일은 DatabaseConfig 이름 충돌·eq import·coroutineScope 누락을 수정했다. 이후 기본 Kotlin daemon 힙 부족도 발생해 이번 명령에만 in-process/2GB 힙을 적용했다(프로젝트 의존성/전역 설정 변경 없음).
- 첫 관련 실행은 37개 중 35개 통과/2개 실패. 사용자 삭제 후에도 보존되는 admin_audit를 fixture가 지우지 않아 예상 건수와 달랐다. 단언을 유지하고 격리 fixture에서 audit도 초기화했다. audit 실패 시 카드 상태 롤백 단언은 처음부터 통과했다.
- 다음 전체 시도는 main 클래스 출력 유실로 JUnit 검색 단계에서 실패했다. Gradle immutable transform 경고도 관찰했다. 출력 경로와 프로젝트 캐시를 둘 다 새로 분리한 후 아래 최종 명령으로 통과했다. 캐시 간섭은 추정 원인이며 특정 외부 프로세스를 원인으로 확정하지 않는다.
- 최종 명령: `./gradlew.bat --project-cache-dir build/cm-be-project-cache -I build/cm-be-verified.init.gradle.kts '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.jvmargs=-Xmx2g' test` → **BUILD SUCCESSFUL in 3m 1s**, tasks 5/5 executed.
- XML 실제 집계: **314 tests / failures 0 / errors 0 / skipped 0**. CM-BE 신규 14개(API 6·경합 3·모더레이션 3·마이그레이션 2)를 포함한다. 기존 CommunityApiTest/CurationApiTest/TierQuotaAdminApiTest/DB 무결성 등도 같은 실행에서 통과했다.
- 로컬 원시 근거(ignored, git 전달 안 됨): `build/cm-be-verified.log`, `build/cm-be-verified/test-results/test/TEST-*.xml`, `build/cm-be-verified/reports/tests/test/index.html`. init 파일 내용은 `allprojects { layout.buildDirectory.set(file("build/cm-be-verified")) }` 한 블록이다. 다른 PC에서 필요하면 같은 파일을 재생성한다.
- 이번 변경 19파일: 기존 제품 7·기존 DB 테스트 1, 신규 제품/마이그레이션 4·신규 테스트/fixture 5, CM-BE 문서 2. 기존 사용자 변경은 추가 수정/스테이징하지 않았다. 커밋·push·PR·CI·배포 없음.
- UTF-8(BOM 없음)·LF, CM-BE 문서 상대 링크·코드 블록 짝, git diff --check 통과. Git autocrlf 경고와 실제 파일 LF를 구별했다.
- 다음 행동은 §4. 통과 범위와 미실행은 §6을 따른다.

## 6. 실제 검증 근거와 한계

아래 경로는 저장소 루트 기준이며 이번 로컬 소스의 행이다.

| 관문 | 프로덕션 가드 → 실제 회귀 근거 |
| --- | --- |
| AC-5 소유권·자격·입력·철회 | `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:117` / `:143` → EpisodeLogApiTest의 ownerOnlyShareAndWithdraw, requiresPaidPublicNameAndExplicitPost, validatesTextAndSnapshot, cascadeAndWithdraw 통과. A/B/C 404, 무료403·이름없음409, Unicode/금칙어/잘못된 메타 거절·스냅샷 무변경, 동일 ID 재게시·곡/세션/계정 cascade 확인. |
| AC-6 정보 비노출·기존 집계 | `src/main/kotlin/ulevelp/service/EpisodeContract.kt:20`, `EpisodeLogService.kt:95` → publicDtoHasExactAllowlistAndSnapshotChangesOnlyOnExplicitPost 통과. 공개/owner/part 키 집합 일치·개인 sentinel 부재·메타 null·개인 누적 변경 비반영·동의 불변, 기존 CurationApiTest의 84일 집계 회귀 통과. |
| 숨김·신고·owner·audit | `src/main/kotlin/ulevelp/service/AdminService.kt:198` / `:245` → reportsAndOwnerAudit, hiddenCannotBeBypassed, auditFailureRollsBackModeration 통과. 숨김→철회→POST 차단, 숨김+강등 표식 보존, 철회/정지 유지 복구, owner 역할 재검사, 신고 중복/종결/재신고, audit 원자성 확인. |
| 강등·유예·cron 지연 | `src/main/kotlin/ulevelp/service/TierService.kt:277`, `AdminService.kt:362` → downgradeNeverAutoRepublishes 통과. 실제 override/override 만료/processDueCycle 처리, 유예 전후·cron 미실행 무료 비노출, cron 지연 뒤 재구독 자동공개 차단 확인. 기존 폴더/동의 정리도 TierQuotaAdminApiTest에서 통과. |
| 경합·지연·취소 | `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:176` / `:204` → serializedWritesAndUniqueReports, lateMetadataAndCancellation 통과. 동시 POST/신고 유일성, POST↔철회/숨김/강등/곡 삭제 불변식, 메타 latch 중 변경 후 공개0, 실제 INSERT를 advisory lock으로 막은 상태에서 취소 후 카드 추가0·트랜잭션 롤백 확인. |
| 페이지·마이그레이션 | feedKeysetAndFollowing, EpisodeMigrationTest 2개, DatabaseMigrationAndIntegrityTest 통과. 동시각 UUID 정렬·20/21 경계·팔로우/해제·변조 커서·100개 넘는 무효 후보 뒤 정상 페이지, 신규 DB V1→V10·기존 개인 세션을 둔 V9→V10 자동게시0·직접 SQL 제약 거절 확인. |

- 로컬 구현/API+격리 DB 검증 통과이며 게시 커밋/PR·CI 근거는 아직 없다. Git 게시 승인 대기로 진행 파일을 유지한다.
- 화면 연결은 CM-UI/PF 후속. 이번 서버 변경에 DOM·i18n·스크린샷 검증은 N/A다. 실제 UI 연결/운영 배포·운영 확인은 미실행이다.
- 기존 유튜브 메타 클라이언트 실패 계약(null)과 취소 전파를 사용한다. 실제 외부 YouTube 통신의 운영 상태를 이번 fake 클라이언트 테스트로 보증하지 않는다.
- 후속 로컬 diff 검토: 기존 XML의 314/0/0/0을 재집계했고, 커서 시각 경계 추가 테스트에서 1개 실패(6개 요청 모두500)를 재현했다. 따라서 위 기존 통과는 추가 경계까지 통과했다는 의미가 아니다. 코드·단언 대조, P2 위치/원인/재현 명령·검증 한계는 [검토 결과](결과/CM-BE_로컬검토.md)에 기록했다. 제품 코드 수정·Git 게시 없음.

## 7. 2026-11-09 커서 경계 P2 로컬 수정

- 승인: 사용자 재개 요청에 따라 P2 커서 코드·정식 회귀 테스트·진행/결과 기록만 로컬 수정·검증한다. 커밋·push·PR은 실행하지 않는다. `step/cm-be`의 기존 사용자 변경과 staged 문서 이동 5개를 보존한다.
- 수정 명세: `EpisodeContract.kt:84`의 검증과 `:94`의 쿼리 재파싱 불일치를 제거한다. 커서 생성/역직렬화 시 쿼리용 `OffsetDateTime`을 한 번 파싱해 재사용하며, 윤초·Java/DB 범위 초과·DB 상한을 넘기는 소수초를 400 INVALID_INPUT으로 거절한다. 외부 JSON 필드·API 경로·정상 UTC 커서 형식은 유지한다.
- 범위 근거: PostgreSQL 16 `src/include/datatype/timestamp.h`의 Julian day 0 이상/294277-01-01 미만 및 마이크로초 정밀도를 따른다. 쿼리 파라미터가 반올림으로 상한을 넘지 않도록 마지막 유한 마이크로초까지 허용한다. [공식 소스](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/include/datatype/timestamp.h#L195).
- 회귀: 정식 `EpisodeCursorApiTest`에서 목록 3종의 잘못된 커서 400/오류 본문/DB 무변경, 유효 시각 경계 조회, 동시각 21개 데이터의 20+1 페이지/UUID 순서/중복·누락/next 종료를 검증한다. 기존 feed/following/장기 필터 스캔 및 CM-BE 테스트도 함께 실행한다.
- Red: 제품 수정 전 정식 회귀 1개 실패(24요청 중18개500/6개200). 원래 P2 입력 두 종류는 세 목록 모두500을 재현했다. `build/cm-be-p2-red.log`·`build/cm-be-p2-red.xml`에 보존.
- Green 명령: `./gradlew.bat --project-cache-dir build/cm-be-p2-project-cache -I build/cm-be-p2.init.gradle.kts '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' '-Dorg.gradle.jvmargs=-Xmx2g' test --tests 'ulevelp.community.Episode*'` → **BUILD SUCCESSFUL in 2m 18s**. init은 `allprojects { layout.buildDirectory.set(file("build/cm-be-p2")) }`이며 프로젝트 의존성/전역 설정 변경 없음.
- XML 실제 집계: **17 tests / failures 0 / errors 0 / skipped 0**. 신규 커서3·기존 API6·경합3·모더레이션3·마이그레이션2. 잘못된 커서24요청 전부400 INVALID_INPUT, 유효 시각12요청200, 세 목록 동시각 20+1 경계 통과. 격리 PostgresTestContainer 사용.
- 원시 근거: `build/cm-be-p2-green.log`, `build/cm-be-p2/test-results/test/TEST-*.xml`, `build/cm-be-p2/reports/tests/test/index.html`(ignored). 세부 명령·단언은 [결과 §5](결과/CM-BE_로컬검토.md).
- 이번 변경은 `EpisodeContract.kt`, 신규 `EpisodeCursorApiTest.kt`, 이 진행 파일, 검토 결과 파일의 4개다. 기존 다른 변경의 SHA-256과 index tree(`e46c227c99c72b089c43996f288b5b4582a7569c`)가 유지됐다. 기존 staged 문서 이동5개 보존, 추가 staging·커밋·push·PR 없음.
- UTF-8(BOM 없음)·LF·문서 링크/코드 블록·diff 검증 완료. 전체 서버 테스트 재실행·실외부·UI·운영·CI·변이 검사는 미실행이다. 이번 승인 범위의 다음 작업 없음. 전체 CM-BE Git 게시 대기이므로 이 진행 파일은 활성 상태로 유지하며 후속은 §4를 따른다.

## 8. 2026-11-09 Git 게시 — 커밋·push·main PR 및 CI/리뷰 확인

- 승인: 사용자 명시 지시 “CM-BE 로컬 구현과 P2 수정을 Git으로 게시한다. 커밋·push·PR을 승인한다. 머지는 사용자 담당이며 배포는 제외한다.”
- 선행 조건 보존: 기존 사용자 변경(`개발산출물/인수인계_메모.md`, `계획/상용_서비스_계획.md`), staged 문서 이동(과거계획 5개 파일 rename), LLM 작업(`docs/다중_LLM_자동화_검토.md`, `scripts/*`, `개발산출물/진행_다중LLM_자동화검토.md`)을 보존하고 커밋 대상에서 완전히 제외했다.
- 선별 대상 (총 21파일):
  - 제품 코드 (10파일): `src/main/kotlin/ulevelp/Main.kt`, `src/main/kotlin/ulevelp/db/Tables.kt`, `src/main/kotlin/ulevelp/routes/AdminRoutes.kt`, `src/main/kotlin/ulevelp/routes/CommunityRoutes.kt`, `src/main/kotlin/ulevelp/routes/SessionRoutes.kt`, `src/main/kotlin/ulevelp/routes/EpisodeRoutes.kt`, `src/main/kotlin/ulevelp/service/AdminService.kt`, `src/main/kotlin/ulevelp/service/EpisodeContract.kt`, `src/main/kotlin/ulevelp/service/EpisodeLogService.kt`, `src/main/kotlin/ulevelp/service/TierService.kt`
  - 마이그레이션 DDL (1파일): `src/main/resources/db/migration/V10__shared_practice_cards.sql`
  - 테스트/지원 코드 (7파일): `src/test/kotlin/ulevelp/db/DatabaseMigrationAndIntegrityTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeCursorApiTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeLogConcurrencyTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeLogModerationApiTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeMigrationTest.kt`, `src/test/kotlin/ulevelp/community/EpisodeTestSupport.kt`
  - CM-BE 문서 (3파일): `개발산출물/명세/CM-BE_구현명세.md`, `개발산출물/결과/CM-BE_로컬검토.md`, `개발산출물/진행_CM-BE.md`
- 사전 검증: P2 커서 정식 회귀 및 CM-BE 테스트 17개(`TEST-ulevelp.community.Episode*.xml` 5개 파일, failures 0 / errors 0 / skipped 0) 및 격리 PostgresTestContainer V10/26개 테이블 마이그레이션 무결성 통과 확인.
- 브랜치: `step/cm-be`
- 커밋: `fe68f7b` (`feat(community): CM-BE 개별 세션 공유 구현 및 P2 커서 수정`)
- PR: [PR #145](https://github.com/choise-hun/doloop/pull/145) (main 대상)
- CI 상태: **전체 통과 (Pass)**
  - GitHub Actions run `42559989948`
  - Detect code changes: pass (7s)
  - Docker build & smoke test: pass (3m 9s)
  - E2E XSS & CSP (Playwright, spa): pass (6m 21s)
  - Kotlin test (JDK 21): pass (2m 44s)
  - Test (Node 22): pass (36s)
  - Test (Node 24): pass (51s)
  - CI ok: pass (4s)
- 리뷰 코멘트 및 판단 기록:
  - 자동 리뷰: `chatgpt-codex-connector[bot]` P2 1건 등록 ([PR #145 코멘트](https://github.com/choise-hun/doloop/pull/145#discussion_r4509375772))
  - 지적 내용: `AdminService.kt:228-229`의 `episodeReportDto`가 `listEpisodeReports`에서 신고 목록을 읽은 뒤 카드 정보를 단건 `.single()`로 조회하므로, `READ COMMITTED` 격리 수준에서 조회 도중 신고된 곡/사용자가 cascade 삭제될 경우 500 예외가 발생할 수 있어 신고·카드·프로필을 JOIN 쿼리로 한 번에 조회하거나 안전 처리 권장.
  - 판단: **타당함**. 운영자 신고 목록 조회와 곡/사용자 삭제 경합 시의 잠재 결함이자 N+1 쿼리 개선 포인트임. 당시 후속 보완으로 남겼으나 사용자 추가 요청에 따라 같은 PR에서 수정한다(§9).

## 9. 2026-11-09 PR #145 신고 목록 삭제 경합 리뷰 반영

- 승인: 사용자 “pr 145의 리뷰 코멘트를 검토하여 필요하다면 수정 후 해당 pr에 커밋 푸시”. 해당 결함의 코드·회귀·기록·기존 PR 커밋/push/최신 CI 확인 범위다. 머지·배포·리뷰 답글/resolve는 실행하지 않는다.
- 시작: `step/cm-be`, HEAD/원격 PR head `08191bce54974721854a75af60fbe26bdd82807c`, main 대상 열린 PR 확인. 기존 규칙/문서 수정, 계획 삭제·이동, LLM 스크립트는 보존하고 선별 커밋에서 제외한다.
- 지적: [discussion_r4509375772](https://github.com/choise-hun/doloop/pull/145#discussion_r4509375772), `chatgpt-codex-connector[bot]`, P2. 수정 전 `AdminService.kt:225-241`의 신고→카드→프로필 별도 조회와 `DatabaseFactory.kt:94`의 READ COMMITTED, V10의 CASCADE를 대조해 **타당/반영**으로 판단했다.
- 수정 명세: 신고·카드·작성자 프로필을 한 SELECT snapshot으로 읽고 필요한 열만 DTO에 매핑한다. 상태 필터·created_at/id 내림차순·limit+1·next 커서·owner 권한·nullable 공개명·기존 응답 필드/상태 코드를 유지한다. 신고 종결 응답도 같은 JOIN mapper를 사용하며 기존 잠금·audit 트랜잭션은 유지한다. 공개 함수 시그니처·DB 스키마·API 계약 변경 없음.
- 회귀: `EpisodeReportReadConcurrencyTest`는 실제 PostgreSQL JDBC SELECT 결과 반환 직후 별도 연결로 세션/곡/사용자 삭제를 각각 커밋한다. 현재 응답은 조회 시점 snapshot, 다음 조회는 빈 목록이며 DB 카드/신고0을 단언한다. JDBC 관찰 장치는 테스트에만 둔다.
- Red: 수정 전 정식 회귀 **1 test / failures 1 / errors 0 / skipped 0**, 첫 세션 삭제 조건에서 `AdminService.kt:228`의 `NoSuchElementException: Collection is empty` 재현. 원시 `build/pr145-red.log`, `build/pr145-red.xml`(ignored). 세 조건 모두 수정 전 실행됐다는 의미는 아니다.
- 검증/최신 CI 결과는 아래 후속 기록 및 [결과 §7](결과/CM-BE_로컬검토.md)을 따른다. 구체적인 다음 행동: 관련 검증 → 자체 diff 검토 → 4파일 선별 커밋·push → 최신 head CI와 리뷰를 대기 중/종료 후/최종 직전에 각각 확인한다.
- Green: 결과 §7의 명령 → **BUILD SUCCESSFUL in 1m 39s**, XML 7개 **31 tests / failures 0 / errors 0 / skipped 0**. CM-BE18개(신규 경합1 포함)·TierQuotaAdminApiTest13개. `build/pr145-green.log`, `build/pr145-review/test-results/test/TEST-*.xml`(ignored). 실제 로컬 격리 PostgreSQL에서 세 삭제 조건 snapshot/다음 조회 빈 결과와 기존 커서·권한·종결/audit 검증 통과.
- 자체 검토: JOIN은 PK/작성자 FK의 1:1 매칭이라 신고 중복/페이지 수를 늘리지 않는다. mapper의 추가 SELECT를 제거했고 resolve 경로의 잠금은 유지했다. 기존 사용자 변경 SHA-256 동일, 초기 index 빈 상태 확인. 로컬 전체 서버 재실행·UI/실외부/운영은 미실행.


