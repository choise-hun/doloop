# 진행 — S2 게시물 좋아요(CMR-4) + S3b 녹음 첨부 연습 기록 카드 공유

> **완료 2026-11-14** — 마지막 PR [#17](https://github.com/choise-hun/doloop/pull/17)
> 시작: 2026-11-13 / Windows / Claude(시니어). `main`=`d5c2566`(PR #11 머지 확인, `git pull --ff-only` 완료, 미커밋 변경 없음, 열린 PR 0건).
> 상태: **S3b-4 주니어 4단계 최종 검증·D10 마무리 완료 → PR [#17](https://github.com/choise-hun/doloop/pull/17) main 머지 대기.** ([§16](#16-s3b-4-주니어-4단계-최종-검증--2026-11-14--mac--gemini주니어))

## 1. 목표와 근거

- 목표: 연습 기록 카드에 본인 녹음 1개의 **사본**을 첨부해 공유하고, 로그인 사용자가 카드에서 재생한다. 그 전에 게시물 좋아요(S2)를 넣는다.
- 방향 결정(R01~R10): [S3b 임시 명세 §10·§12](명세/S3b_연습기록카드공유_임시명세.md#12-항목별-결정-요약-2026-11-12), 화면 방향 §11, 시안 [S3b_시안.html](명세/S3b_시안.html).
- 검토 기록: [완료 UIUX 진행 §13](완료/진행_UIUX수정명세.md#13-s3b-임시-명세와-항목별-검토-2026-11-12). S2 원래 범위: [UIUX-R §5.6](명세/UIUX-R_수정명세.md#56-s2--게시물-좋아요-서버-계약-변경-별도-승인).
- 순서·대기 목록: [계획](../계획/상용_서비스_계획.md) §1 10-2, §4.
- 규칙: [backend-kotlin](../docs/rules/backend-kotlin.md) §1~4·6, [frontend-state](../docs/rules/frontend-state.md) §1·3·4, [frontend-design](../docs/rules/frontend-design.md), [frontend-layout](../docs/rules/frontend-layout.md), [testing-security](../docs/rules/testing-security.md).

## 2. 승인 범위

| 구분 | 내용 |
| --- | --- |
| 2026-11-13 1차 세션 승인 | 상세 명세 작성(이 파일 + `개발산출물/명세/` 5개). 인수인계 메모 §2 진행 파일 줄은 CLAUDE.md 규칙(진행 파일 목록 일치)에 따라 한 줄 맞춤 |
| 2026-11-13 2차 세션 승인 | 사용자 “전부 추천대로” — §5 Q1~Q6 추천안 확정, CMR-4·S3b-1~4 명세의 DB/API 계약 승인. 명세 문서 `docs/s3b-detail-spec` 브랜치 커밋·push·main PR·CI 확인 |
| 각 Step 승인 | §3 Step을 이 순서로 구현한다. Step별 Git 처리(주니어 4단계 PR, 시니어 직접 구현은 브랜치 push까지)는 CLAUDE.md·`docs/문서_운영.md` §6을 따른다 |
| 미승인 | Scheduler 등록·운영 배포(S3b-4 머지 뒤 별도 승인), 명세 밖 계약 변경 |

## 3. Step 표

| 순서 | Step | 담당(판정) | 입력 → 결과 | 완료 기준 | 권장 effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **CMR-4** 게시물 좋아요(S2) | [주니어] 4단계 | [CMR-4 명세](명세/CMR-4_구현명세.md) → `결과/CMR-4.md` | 서버 API 테스트·프런트 e2e·layout spec 통과, PR CI 통과 | 중 | **4단계 최종 검증 완료 → PR [#13](https://github.com/choise-hun/doloop/pull/13) main 머지 완료(`ee68ad9`)**. [결과 §8](결과/CMR-4.md): Gradle 326·Playwright 144·오류 상태 캡처 통과, npm 기존 3실패 외 신규 실패 0 |
| 2 | **S3b-1** 서버 핵심: 동의·첨부·Supabase 복사·재생 주소·첨부 제거·철회 정리 | [시니어] 구현 → [주니어] 4단계 | [S3b-1 명세](명세/S3b-1_구현명세.md) → [결과/S3b-1](결과/S3b-1.md) | 표적 테스트 Red→Green(시니어), 전체 회귀·PR CI(주니어) | 높음 | **4단계 최종 검증 완료 → PR [#14](https://github.com/choise-hun/doloop/pull/14) main 머지 완료(`46574e0`)** Gradle 351·tsc 통과, Codex P2 + 시니어 취소 결함 보강 반영 |
| 3 | **S3b-2** 서버 수명주기: 삭제 경로 전파·티어 정지·숨김 30일·Drive 사본 업로드·재시도 cron·상한 | [주니어] 4단계 | [S3b-2 명세](명세/S3b-2_구현명세.md) → `결과/S3b-2.md` | 경로별 정리 테스트·cron 테스트 통과, PR CI 통과 | 높음 | **PR [#15](https://github.com/choise-hun/doloop/pull/15) main 머지 완료(`f9cc06d`)** Gradle 380, P2 2건 해결 |
| 4 | **S3b-3** 게시 화면: 최초 동의·공유 창(녹음 칩·원곡 확인)·공유 아이콘 메뉴·Drive 브라우저 업로드 | [시니어] 구현 → [주니어] 4단계 | [S3b-3 명세](명세/S3b-3_구현명세.md) → [결과/S3b-3](결과/S3b-3.md) | e2e·layout spec·4개 폭 스크린샷 검토, PR CI 통과 | 높음 | **PR [#16](https://github.com/choise-hun/doloop/pull/16) main 머지 완료(`f7f4439`)**. [결과 §5](결과/S3b-3.md) |
| 5 | **S3b-4** 청취·안내: 피드 카드 미니 썸네일+재생, 단일 플레이어, 문구 3곳·삭제 확인·동의 철회, 앱 명세 개정, 마무리 | [시니어] 구현 → [주니어] 4단계 | [S3b-4 명세](명세/S3b-4_구현명세.md) → [결과/S3b-4](결과/S3b-4.md) | e2e·layout spec·4개 폭 스크린샷, 진행 파일 `완료/` 이동 PR | 높음 | **4단계 최종 검증 완료 → PR [#17](https://github.com/choise-hun/doloop/pull/17) 생성·머지 대기** ([§16](#16-s3b-4-주니어-4단계-최종-검증--2026-11-14--mac--gemini주니어)) |

- 운영 배포: **S3b-4 머지 뒤 한 번에**(중간 main은 녹음 첨부 UI가 없어 첨부 생성 경로가 열리지 않는다). CMR-4는 단독 배포 가능.
- 각 Step 브랜치: `step/CMR-4`, `step/S3b-1` … base `main`. 앞 Step 머지 뒤 main을 `git pull --ff-only`로 맞추고 만든다.

## 4. Step 분할·배정 근거 (협업 §1.2)

| Step | 크기 추정(프로덕션 코드 / 테스트) | 판정 질문 ①②③ | 판정 |
| --- | --- | --- | --- |
| CMR-4 | 약 230줄 / 약 220줄, 파일 15개(핵심 로직 4: `EpisodeLogService`·`apiClient`·`EpisodeLogCard`·`EpisodeLogFeed`, 나머지는 마이그레이션·i18n 3·테스트·fixture) | ① 기존 셀렉터 변경 없음(버튼 추가만) ② 공유 코드 공존 없음 ③ 폴더 좋아요·신고 404 패턴 재사용 → 아니오 | 주니어 |
| S3b-1 | 약 520줄 / 약 380줄, 파일 11개(핵심 3) | ③ 외부 저장소+DB 2단계·보상·잠금 순서·취소 경계 → 예 | 시니어 |
| S3b-2 | 약 430줄 / 약 400줄, 파일 13개(핵심 5) | S3b-1이 만든 공통 정리 함수·보류 행 패턴을 호출만 한다. 경로별 테스트 표로 다 적을 수 있음 → 아니오 | 주니어(시니어 핀포인트 리뷰) |
| S3b-3 | 약 600줄 / 약 250줄 | ① `EpisodeShareDialog` DOM·CUI e2e 셀렉터 변경 ② `PracticeSessionCard` 공용 ③ Drive 업로드 경합·계정 전환 → 예 | 시니어 |
| S3b-4 | 약 450줄 / 약 250줄 | ① `EpisodeLogCard` 썸네일 구조 변경 ③ 오디오 초기화·지연 응답 → 예 | 시니어 |

- R10에서 정한 **3단계(서버·화면·재생/문구)를 4단계로 바꾼 이유:** 서버 범위가 프로덕션 약 950줄 + 테스트 약 780줄이라 한 Step이면 상한(600~700줄)을 크게 넘는다. 서버를 “게시 핵심”과 “수명주기·Drive”로 나눴다. 대기능 Step 최대 4개 안이다(Q1).
- CMR-4는 파일 수가 7개를 넘지만 핵심 로직 파일은 4개이고 서버·화면을 나누면 각각 독립 검증 단위가 약해지고 CM-R Step이 5개가 된다(Q2).

## 5. 사용자 검토 질문 — 답: 2026-11-13 “전부 추천대로”

모든 항목이 추천안대로 확정됐다. 명세의 계약(D1·D4·D11 등)은 이 답과 이미 같아 명세 본문은 바꾸지 않았다.

| ID | 질문 | 추천(= 확정) |
| --- | --- | --- |
| Q1 | S3b를 3단계 대신 4단계(서버 2 + 화면 2)로 나눈다 | 4단계 — §4 크기 근거 |
| Q2 | CMR-4를 한 Step으로 둔다(파일 15개, 핵심 4개) | 한 Step |
| Q3 | 게시물 좋아요 수는 카운터 열 없이 매번 집계한다. 공유 중지 시 좋아요는 지우고, 티어 정지·숨김 동안은 보존한다 | 그대로 |
| Q4 | 계정 단위 동의 기록은 계정 삭제 때 함께 지운다(CASCADE) | 그대로. 보관이 필요하면 외부 확인 (b)와 함께 재검토 |
| Q5 | 녹음 길이 상한(5분)은 `takes.duration_sec`(녹음 때 브라우저가 적은 값)로 판정한다. 크기는 서버가 실제 바이트로 잰다 | 그대로. 길이 실측은 오디오 해석이 필요해 범위 밖 |
| Q6 | 기존 공유 사용자도 다음 게시 때 계정 단위 동의를 받는다. 서버 강제는 화면이 함께 바뀌는 S3b-3에서 켠다(S3b-1은 녹음 첨부에만 강제) | 그대로 — 중간 main에서 기존 공유가 깨지지 않게 |

## 6. 임시 명세 보정 (상세 명세 작성 중 발견)

- 임시 명세 §2·R07의 “재시도 없음”은 반만 맞다. 배포 스크립트가 1분 cron `ulevelp-notion-push`를 등록하고([deploy-cloudrun.sh:133-159](../scripts/deploy-cloudrun.sh#L133-L159)), 그 배치가 `storage_trash`를 `attempts < 5`·50건씩 지운다([NotionPushWorker.kt:263-273](../src/main/kotlin/ulevelp/notion/NotionPushWorker.kt#L263-L273)). 운영에서 이 Job이 지금 도는지는 미확인. S3b-1은 이 배치가 복사 중인 파일을 지우지 않도록 `next_attempt_at` 조건을 추가하고, S3b-2가 전용 cron을 만든다.
  - 2026-11-13 재확인 시도(Windows): 로컬에 ULeveLP `GCP_PROJECT_ID` 값이 없고 gcloud 활성 프로젝트가 다른 프로젝트라 `gcloud scheduler jobs describe ulevelp-notion-push`를 실행하지 않았다 → **여전히 미확인.** S3b-2 착수 전 사용자가 운영 콘솔에서 확인하거나 프로젝트 ID를 알려 준다.
  - 2026-11-13 S3b-2 재개: 사용자가 운영 프로젝트 ID `ulevelp`(번호 `175439281655`)를 제공했다. `gcloud scheduler jobs describe ulevelp-notion-push --project=ulevelp --location=asia-northeast3 --format='json(name,state,schedule,httpTarget.uri)'` 성공: `state=ENABLED`, `schedule=* * * * *`, URI=`https://ulevelp-d5ympfsmfq-du.a.run.app/internal/cron/notion-push`. 등록·활성 상태를 확인했으며 실제 실행 성공/최근 실행 이력은 이 조회로 검증하지 않았다. 설정 변경·배포는 하지 않았다.
- 좋아요 계약(UIUX-R §5.6)의 “본인 게시물 좋아요 허용”은 폴더 좋아요(본인 폴더 400, [CommunityService.kt:720-722](../src/main/kotlin/ulevelp/service/CommunityService.kt#L720-L722))와 다르다. 결정대로 게시물만 허용한다.

## 7. 다음 행동

1. ~~§5 검토~~ 완료. ~~명세 PR #12 머지~~ 완료.
2. ~~CMR-4 주니어 2단계·시니어 3단계·주니어 4단계~~ 완료(PR #13, [결과 §7·§8](결과/CMR-4.md)). `개발산출물/report.md` 삭제는 범위 밖 변경이므로 보존·커밋 제외. **PR #13은 2026-11-13 main 머지 확인(`ee68ad9`).**
3. ~~계획 §1 10-2와 UIUX-R 서술 정리~~ PR #13에 포함(D9). UIUX-R §5.7 본문 세부는 S3b-4에서 마저 정리.
4. ~~S3b-2~~ PR #15 머지 완료(`f9cc06d`).
5. ~~S3b-3~~ PR #16 머지 완료(`f7f4439`).
6. S3b-4 시니어 직접 구현·표적 검증·커밋·`step/S3b-4` push 완료(§15). **다음은 §9의 주니어 4단계**다(이 Step이 S3b 마지막 PR — D10 `완료/` 이동 포함). 운영 배포·Scheduler 등록은 머지 뒤 사람 작업.

## 8. 겪은 문제

- **CMR-4 구현 중(2026-11-13):** ① 명세 L7 400 vs 공용 `parsePathUuid` 404 불일치 → Codex P1 반영으로 좋아요 라우트만 `parseLikePostId`로 400(공용 함수 불변) ② Windows Kotlin 데몬 OOM — `-Dorg.gradle.jvmargs=-Xmx3g -Pkotlin.daemon.jvmargs=-Xmx3g` 필요 ③ `npm test` 3건(CH-2c-1-1·CH-2c-3-2·LA-1)은 main에서도 실패(기존) ④ 목록 밖 수정 2건(communityMock.ts, EpisodeLogApiTest 키 목록). 자세히 [결과 §2·§5](결과/CMR-4.md).
- 3단계(2026-11-13): 기존 E1은 busy ref 가드 제거, E4는 isCurrent 검사 제거에도 통과했다. E1 연속 이벤트·E4b 같은 피드 내 카드 재마운트·E4c A→B 전환을 보강. 3개 변이 실패 확인 후 원본 복원, API 8·화면 6·layout 10 통과. 자세한 명령/실제 실패·미실행은 [결과 §7](결과/CMR-4.md). 제품 코드 변경 없음.
- 최초 명세 작성 시 앱 테스트·빌드·실제 외부 저장소는 실행하지 않았음. 이후 CMR-4 검증과 구별한다.
- **PR #12 Codex 리뷰(head `a7d6fd5`) 3건 — 모두 타당, 명세에 반영.** API 경로·응답 필드 변경 없음. DB 컬럼도 그대로이고, 값의 쓰임과 CHECK만 바뀌었다.
  | 지적 | 판정 근거 | 반영 |
  | --- | --- | --- |
  | P1 사본 키 CHECK가 `webm`만 허용 | `TakeService.MIME_EXT`는 `audio/webm → weba`([TakeService.kt:652-658](../src/main/kotlin/ulevelp/service/TakeService.kt#L652-L658)), 녹음 화면은 WebM 후보 사용([PracticePage.tsx:20-25](../frontend/src/pages/PracticePage.tsx#L20-L25)) | S3b-1 §4.1 CHECK `(m4a\|weba\|ogg\|mp3\|wav\|aac)`, 테스트 A19 보강·A20 추가 |
  | P2 보류 행 시각 해제가 확정과 경합 | `purge`는 키 조회와 외부 삭제가 다른 트랜잭션([StorageTrashService.kt:28-45](../src/main/kotlin/ulevelp/service/StorageTrashService.kt#L28-L45)) | S3b-1 D8 보류 행 = `GUARD_HOLD`(시각으로 안 풀림), D10 잠금, D18 회수 절차(첨부 행 `FOR UPDATE`로 확정과 직렬화), §5 보상이 회수 뒤 늦은 upload도 정리, 테스트 A17·A18 보강·A21 추가. S3b-2 D6·D8 ①을 D18에 맞추고 C2 보강·C6 추가 |
  | P2 선택 버튼 안에 미리 듣기 버튼 중첩 | 명세 S3b-3 D7 문구가 칩 “안”에 button | D7 = `span[data-take-chip-group]` 안 형제 버튼 2개, 미리 듣기는 선택 불변. 테스트 U15 추가 |

## 9. 다음 세션 시작 지시

```text
# Gemini (주니어) — S3b-4 4단계 최종 회귀·남은 테스트·스크린샷·D10 마무리·PR/CI
개발산출물/협업_시니어주니어.md와 개발산출물/프롬프트_템플릿_4단계.md §4(4단계)를 따른다. 입력: 명세/S3b-4_구현명세.md §5~§7·D10, 이 파일 §15, 브랜치 step/S3b-4(head는 git log로 확인).
목표: 시니어 직접 구현(미니 썸네일 첨부 줄·단일 플레이어·삭제 확인 영향·동의 철회·문구·앱 명세 개정)을 §6·§7로 마무리하고 결과/S3b-4.md를 쓴 뒤 S3b 진행 파일을 완료/로 옮긴다.
기준: §15 “남은 테스트”만 추가(P10t 녹음 삭제 쪽·P12t·layout 재생 중/오류 상태), 시니어가 끝낸 P1t~P8t·P10t(곡)·P11t·P13t는 다시 만들지 않는다. testing-security(단언 왜곡 금지·결정적 대기), frontend-layout Q1~Q9.
선행 조건: git switch step/S3b-4 && git pull --ff-only, gh 활성 계정 choise-hun 확인, 루트 npm run build 뒤 Playwright 실행(dist 사용).
범위: test/e2e·test/*.test.js 테스트 추가, 결과/진행/인수인계/계획 문서(D10). 제품 코드 결함을 찾으면 고치지 말고 재현 명령과 함께 시니어 3-P로 넘긴다.
완료 기준: npm test·npx playwright test 전체·./gradlew test 전체 통과, LAYOUT_SHOTS=1 4개 폭×(카드 첨부 없음·있음·재생 중·오류, 프로필 동의) Q1~Q9 표, §7 grep 0건, 운영 배포 전 사람 작업 목록을 결과/S3b-4.md에 기록, D10(git mv 진행 파일 → 완료/ + 완료 줄, 계획 §1 10-2, 인수인계 §2 진행 파일 줄) 반영.
Git 처리: 논리 단위 커밋·step/S3b-4 push·main 대상 신규 PR 생성·gh pr checks --watch·리뷰 확인까지. 머지·운영 배포·Scheduler 등록은 하지 않는다.
```

## 10. S3b-1 시니어 직접 구현 — 2026-11-13 / Windows / Codex

### 승인·선행·보존

- 사용자 이번 세션 지시로 승인된 명세의 서버 핵심 구현·표적 테스트 1~2개·`step/S3b-1` 커밋·push를 수행한다. 신규 PR·전체 회귀·CI 대기·결과 파일은 주니어 4단계 범위다.
- GitHub PR #13 metadata: `merged=true`, base `main`, merge commit `ee68ad90091a2f7cb95a7114f773af69e5bcc2c5`, `merged_at=2026-11-13T05:56:17Z`.
- 시작 `step/CMR-4`, `git status --short` 빈 출력. `git switch main` → `git pull --ff-only` → merge commit 조상 확인 → `git switch -c step/S3b-1` 완료. 사용자/동시 미커밋 변경 없음. 이전 §7의 report.md 삭제는 이번 작업 트리에 없었으며 이 파일을 변경하지 않았다.

### 변경·자체 검토 근거

- V12: 동의 이력·첨부 테이블 2개, ready/진행 중 부분 UNIQUE, 키·MIME·크기·길이·ready 시각 CHECK, 정리 보류 시각. 테이블 정의·`ALL_TABLES`·마이그레이션 기대 버전 12/29개를 맞췄다.
- `ShareAttachmentService.kt:40` 동의 상태 계산·멱등 동의·철회 이력. 카드 동의는 마지막 agree, 녹음 동의는 마지막 행 agree로 판단한다. 프로필 잠금으로 동의 변경과 복사 시작/확정을 직렬화한다.
- `EpisodeLogService.kt:146` 기존 공유 사전 검사(P10)를 추출, 단일 트랜잭션 공유와 복사 tx1/tx2에서 재사용. 기존 publishedAt 규칙 유지. 누락/null/keep은 유지, none은 첨부 제거 후 재스냅샷. 녹음 없는 공유의 동의 강제는 S3b-3까지 보류한다.
- `ShareAttachmentService.kt:102` Supabase 복사: tx1(소유·동의·상한·진행 중 검사/30분 회수·copying+GUARD_HOLD) → 외부 download/실제 크기 확인/upload → tx2(재검사·원본 존재·copying 행 잠금·교체·ready·guard 삭제). 저장소 I/O는 DB 트랜잭션 밖이다. 같은 take는 복사 없이 유지한다. Drive는 S3b-2 업로드 경로 구현 전까지 `ATTACHMENT_UPLOAD_REQUIRED`다.
- `ShareAttachmentService.kt:76` 공통 `removeShareAttachments`: 대상 행 `FOR UPDATE`, ready 키 즉시 대기열 적재 / 진행 행 guard 해제 후 ID 목록 삭제. 철회·첨부 제거·none·교체·동의 철회·오래된 진행 행 회수에서 공통 호출한다.
- `ShareAttachmentService.kt:156` 보상은 NonCancellable 안에서 행 잠금 및 ready 확인 후 정리한다. ready면 건드리지 않으며, 회수 purge 후 늦게 끝난 upload도 대기열을 재생성해 삭제한다. 정리 오류는 로그/원래 예외의 suppressed에 남긴다. 기존 정리 배치에 `nextAttemptAt <= now(clock)` 조건만 추가했다.
- `EpisodeLogService.kt:216` eligible 카드·그 세션의 ready 첨부만 조회한 뒤 DB 밖에서 300초 서명 URL을 만든다. 개인 재생 주소 계약은 변경하지 않았다. 공개 DTO는 첨부 필드 4개, 본인 DTO에만 sourceTakeId를 둔다.
- `Main.kt:202` 저장소/정리/첨부 서비스 생성 순서 및 주입, `EpisodeRoutes.kt:14` 공유 입력과 동의·제거·재생 URL 경로를 기존 인증 경계 안에 연결했다. 기존 4인자 share 호출은 keep으로 위임해 보존했다.
- 명세 파일 목록 밖 최소 조정: `EpisodeLogApiTest.kt:88` 공개 응답 정확 키 목록에 승인 필드 `attachments`를 추가했다(기존 비노출 단언 유지). 이 테스트 자체는 이번 표적 실행 대상이 아니며 주니어 전체 회귀에서 확인한다.

### 실제 실행 결과와 한계

- 명령: `./gradlew.bat test --tests ulevelp.community.ShareAttachmentApiTest '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.compiler.execution.strategy=in-process'`.
- Red: 구현 전 main 기반에서 A1·A2 2개 모두 동의 API의 404 `NOT_FOUND`로 실패(`expected: 200 OK`, `actual: 404 Not Found`). 이후 A1에 A/B 권한 경계 단언을 보강했다.
- Green: `tests=2, failures=0, errors=0, skipped=0`, `BUILD SUCCESSFUL in 56s`. 격리 Docker PostgreSQL 16.15에서 Flyway V12 적용 확인. 컴파일 중 detail 인자/import 오류를 수정한 뒤 최종 통과했다.
- A1 `firstAttachmentCopiesBytesAndExposesOnlyPublicMetadata`: 201, 사본 실제 바이트 동일, 공개 첨부 정확 4개 키, 본인 sourceTakeId, guard 행 0, 카드 1, 무료 B의 expiresIn=300. B→A 세션 게시와 A→B 녹음 첨부는 각각 404이며 그 시점 첨부 행/사본 생성 없음.
- A2 `uploadFailureCompensatesWithoutPublishingCard`: 업로드 실패 502 STORAGE_ERROR, 카드·첨부·정리 행 0, shared 키 삭제 호출 1, 원본 보존.
- 로컬 증거: `build/test-results/test/TEST-ulevelp.community.ShareAttachmentApiTest.xml`, `build/reports/tests/test/index.html`, `%TEMP%/s3b1-green.log`(ignored/로컬 파일, Git으로 전달되지 않는다). 원격에서는 위 명령으로 재현한다.
- `git diff --check` 통과. 신규·수정 텍스트는 UTF-8 BOM 없음/LF로 저장했다.
- **미실행:** A3~A21 전용 테스트·경합/취소 실험·전체 서버 회귀·마이그레이션 무결성 테스트 클래스·프런트 회귀·실제 Supabase/Drive·운영 cron·신규 PR/CI. 표적 통과를 전체 계약 검증 완료로 승격하지 않는다. 결과/S3b-1.md는 생성하지 않았다.
- 다음 행동은 §9. S3b-2 수명주기/Drive/cron/개수·일일 상한, S3b-3 화면 및 카드 동의 강제, S3b-4 청취 UI는 이번 구현 범위에 포함하지 않았다.

## 11. PR #14 시니어 문제 해결·취소 회귀 — 2026-11-13

- 사용자 최신 지시: 앞으로 주니어 결정·구현 검토는 시니어가 문제 해결과 필요한 복잡한 테스트까지 수행한다. 단순 반복 회귀·커밋·push·PR·CI 대기는 주니어 4단계 담당. 이번 세션도 **로컬 수정·표적 검증·인계만** 하며 커밋/push/PR 갱신/CI 대기는 수행하지 않는다.
- 시작 `step/S3b-1`, `HEAD=b633cd69464bade843fc8e95a58de927f42ccbe6`, 작업 트리 깨끗함. 직전 독립 검토에서 GitHub PR #14 head와 일치 및 해당 head CI 성공(run `43379701692`)을 확인했다. **이 CI는 아래 미커밋 수정을 검증한 결과가 아니다.**
- 결함: tx1 커밋 → 결과 반환 전 원본 삭제(CASCADE) → 취소이면 `committedPlan == null && att == null`. 기존 보상이 키를 찾지 못해 `GUARD_HOLD` 행 1개가 영구 잔존했다. 기존 A12와 같은 직접 원본 삭제에 실제 commit interceptor를 조합해 재현했다.
- 해결: `ShareAttachmentService.kt`에서 tx1 내부 키 생성 즉시 외부 `preparedKey`에 보존한다. 보상은 committedPlan/첨부 행으로 키를 얻지 못했을 때 이 예정 키의 실제 guard 존재를 조회해 커밋된 준비만 정리한다. 롤백된 tx1은 정리 행/삭제 호출을 만들지 않으며, ready 보존과 회수 후 늦은 업로드 정리 경로는 유지했다. DB/API/외부 계약 변경 없음.
- 신규 `ShareAttachmentCancellationTest.kt`: 실제 Exposed `StatementInterceptor.beforeCommit/afterCommit`에서 요청 Job을 취소한다. ① tx1 커밋 직후 정리 ② tx1 커밋+다른 스레드의 원본 삭제 직후 취소 정리 ③ tx1 커밋 전 취소/롤백은 삭제·대기열 생성 없음 ④ tx2 커밋 직후 취소는 ready 행/사본 보존. 취소 전파와 커밋 경계 도달 여부도 단언한다.
- **Red:** `./gradlew.bat test --tests ulevelp.community.ShareAttachmentCancellationTest -Dorg.gradle.jvmargs=-Xmx3g -Pkotlin.compiler.execution.strategy=in-process` → 수정 전 4건 중 조합 경계 1건 실패(`guard/trash must be cleaned: expected 0, actual 1`), 나머지 3건 통과. 로그 `%TEMP%/s3b14-cancel-red.log`.
- **Green:** 아래 명령 → 신규 4건 + 기존 A11/A12/A21 3건 = **7건, failures/errors/skipped 모두 0**, `BUILD SUCCESSFUL in 15s`. 로그 `%TEMP%/s3b14-cancel-green.log`, `build/test-results/test/TEST-ulevelp.community.ShareAttachmentCancellationTest.xml`(4건)·`TEST-ulevelp.community.ShareAttachmentApiTest.xml`(선택한 3건). 로컬 증거는 Git으로 전달되지 않는다.

```powershell
./gradlew.bat test --tests ulevelp.community.ShareAttachmentCancellationTest --tests 'ulevelp.community.ShareAttachmentApiTest.withdrawDuringUploadCancelsPublishAndCleansUp' --tests 'ulevelp.community.ShareAttachmentApiTest.deletingSourceTakeDuringUploadReturnsSourceGoneAndCleansUp' --tests 'ulevelp.community.ShareAttachmentApiTest.reclaimAndConfirmSerializationPreventsOrphanAndDeletedReadyFile' '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.compiler.execution.strategy=in-process'
```

- 향후 분담 고정: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/문서_운영.md` §6, `협업_시니어주니어.md` §1.1, `프롬프트_템플릿_4단계.md` §3/3-P에 승인 범위의 문제 해결 의무와 주니어 Git/반복 검증 담당을 반영했다. 신규 시니어 직접 구현 Step의 별도 push 예외는 유지한다.
- 중앙 보관본: `C:/Users/kjca010/config`(브랜치 main, 시작 clean)에 위 6개 파일을 로컬 동기화했다. 변경 대상 6개는 원본과 **바이트 동일**. 전체 스크립트는 시작 시 기존 10개 모두 줄바꿈만 달랐음(내용은 전부 동일), `--copy` 후 차이 0건도 확인했으나 무관한 4개 파일의 일괄 줄바꿈 변경은 원래 바이트로 복원했다. 최종 전체 스크립트의 차이 4건은 이 기존 줄바꿈 차이이며, 변경 대상 차이와 구별한다. config에도 미커밋 6개가 있으며 게시하지 않았다.
- **주니어 4단계 최종 검증(2026-11-13):**
  - 전체 Gradle 회귀 `./gradlew.bat test '-Dorg.gradle.jvmargs=-Xmx3g' '-Pkotlin.compiler.execution.strategy=in-process'` → **351건, 실패 0·오류 0·skip 0** (`BUILD SUCCESSFUL in 1m 55s`, `ShareAttachmentApiTest` 20건 + `ShareAttachmentCancellationTest` 4건 + `DatabaseMigrationAndIntegrityTest` 8건 포함).
  - `npx --prefix frontend tsc --noEmit` 통과, `git diff --check` 통과, `scripts/check-config-sync.sh` 변경 대상 6개 모두 `같음` 확인.
  - 논리 단위별 커밋(`fix(community)`, `docs(rules)`) 후 `step/S3b-1` push로 PR #14 갱신, 중앙 `config` 보관본 6개 별도 커밋·push 및 PR #14 최신 head CI·리뷰 확인 진행.

## 12. S3b-2 선행 확인 — 2026-11-13 / Windows / Codex

- 사용자 지시: 시니어가 2단계의 1차 구현·명세 테스트·전체 Gradle 회귀·결과 기록·커밋·push·main PR·최신 head CI 확인까지 수행한다. 머지·배포·명세 밖 계약 변경은 제외한다.
- 시작 `step/S3b-1`, `HEAD=57c308d`, 작업 트리 깨끗함. GitHub 연결 도구 오류 후 `gh pr view 14 --repo choise-hun/doloop --json state,mergedAt,mergeCommit,baseRefName,url`로 `MERGED`, base `main`, merge commit `46574e0f0d2d04321aa828c91b600a5806b905a8`, `mergedAt=2026-11-13T08:35:11Z`를 확인했다.
- `git switch main` → `git pull --ff-only` → 위 merge commit의 HEAD 조상 여부 확인 → `git switch -c step/S3b-2` 완료. 브랜치 기준은 `46574e0`, 기존 사용자 변경 없음.
- 최초에는 §6 확인 답변을 기다렸다. 이후 사용자가 운영 프로젝트 ID를 제공해 조회 성공(§6), 선행 조건을 충족한 뒤 아래 구현·검증·Git 게시까지 수행했다.
- 다음 재개는 §9의 시니어 3단계 독립 검증이다. 현재 브랜치·사용자 변경을 보존하고 PR 최신 head와 로컬 HEAD 및 CI를 확인한 뒤 진행한다. 완료한 1차 구현·전체 회귀를 이유 없이 반복하지 않는다.

- 구현·1차 검증: [결과/S3b-2](결과/S3b-2.md). 명세 표 전 행을 26개 표적 테스트로 검증했고 전체 377건 통과(실패/오류/skip 0), Git Bash 구문 검사·diff 검사 통과. L1/M1 실제 격리 변이 2건 모두 실패 확인 후 원본 가드의 전체 Green을 확인했다. Git 게시 및 최신 CI 확인은 아래 후속 기록으로 확정한다.

- Git 게시: 구현 커밋 `517314257582c548bbe02c15db83ee1e89628f23`, `step/S3b-2` push 및 [PR #15](https://github.com/choise-hun/doloop/pull/15)(base main) 생성. 첫 push는 활성 계정 Hunseokc 권한 403으로 실패해 `gh auth switch --user choise-hun` 후 성공했다. 후속 수정과 CI/review 결과는 아래와 결과 §6·§7에 기록했다.

- PR #15 P2 2건을 현재 코드와 대조해 모두 타당 판정·수정했다. 곡/계정 CASCADE의 카드→첨부 잠금 순서 Red 2건, 같은 Drive 원본의 새 미사용 업로드 정리 Red 1건을 확인했다. 수정 후 최종 전체 380건(신규/관련 29건 포함) 실패/오류/skip 0, BUILD SUCCESSFUL in 1m 47s. 상세 재현·증거는 결과 §7. 보강 커밋 `322c584b7adb5e7733d9e0046f58c55de898ce8b` push 후 [CI 43398953828](https://github.com/choise-hun/doloop/actions/runs/43398953828) completed/success(Node·Kotlin·Playwright·Docker·CI ok 전부 성공)를 확인했다. 종료 후 리뷰 재확인: 라인 지적 2건 모두 resolved, 추가 지적 없음. 이후 진행/결과 문서만 게시하며 최신 문서 체크와 코드 CI를 구별한다. 머지·배포·신규 Scheduler 등록은 하지 않았다.

## 13. S3b-3 시니어 직접 구현 — 2026-11-13 / Mac / Claude(시니어)

- 선행: PR #15 머지(`f9cc06d`) 확인, `main` `git pull --ff-only`(최신) → `step/S3b-3` 생성. 작업 트리 깨끗, gh 활성 choise-hun.
- 명세 §1 대조: 행 번호는 `d5c2566` 기준과 거의 같았다(`EpisodeShareDialog` 15-36·182-287, `PracticeSessionCard` 45·94-112·250-375, `drive.ts` 80-100·297-313). 서버 계약은 S3b-2 머지본과 일치(`GET/POST share-consent`, `POST share/uploads` multipart `takeId`+`file`, `DELETE share/attachment`, 오류 코드 §4.5). 운영 Scheduler·배포는 범위 밖으로 두고 손대지 않았다.
- 커밋: `a18e5dd` 서버 D12, `d49a2db` 화면·테스트. 다음 주니어 4단계가 PR을 만든다(시니어 직접 구현 예외).

### 구현 요약 (명세 D 번호)

| 영역 | 파일 | 내용 |
| --- | --- | --- |
| D12 서버 | `EpisodeLogService.kt`, `ShareAttachmentService.kt` | `prepareShare`에서 공개 이름 검사 직후 `requireCardConsent` → 409 `SHARE_CONSENT_REQUIRED {scope:"card",requiredVersion}` |
| D12 테스트 | `EpisodeTestSupport.kt`, `ShareAttachmentApiTest.kt` | `user(consent=true)` 기본(동의 행 삽입). S1 `shareWithoutCardConsentIsRejected` 추가 |
| D1~D3 | `PracticeSessionCard.tsx/.module.css` | 헤더 공유 아이콘 하나(`open`/`menu`), 메뉴 `edit`·`remove-recording`·`withdraw`(role=menuitem, ESC·바깥 클릭·화살표, 포커스 복귀), 녹음만 내리기 confirm → DELETE → invalidate |
| D4~D11, D15 | `EpisodeShareDialog.tsx/.module.css` | 동의 조회→동의 단계/작성 단계, 미리보기 카드(제목 헤더→`#shareTitleInput`, 메타, 미니 썸네일 줄), 말풍선 `#shareCommentInput`, 칩 묶음(선택+형제 미리 듣기), 상한 칩 비활성+`#shareChipLimitHint`, `#shareOriginalConfirm`, keep/none/replace 본문, Drive `fetchMediaBlob`→uploads→`uploadId`, ⓘ `#shareScopeInfo`, 세대+AbortController |
| D6 공용 | `ShareConsentStep.tsx`(신규), `PublicNameForm.tsx` | 창 첫 화면 `#shareConsentAgree`, 이름 폼 선택 체크박스 `#publicNameShareConsent`(이름 저장 성공 뒤 체크 시에만 POST) |
| D10·타입 | `apiClient.ts` | 동의·업로드·첨부 제거 함수, `ShareAttachmentInput`, 첨부 DTO. 동의 응답은 형식 검증(모르는 `{}`를 동의로 추측하지 않음) |
| D13 | `episode.mts` | `formatEpisodeDate`(ko/en/ja), 빈 제목 = 세션 날짜 |
| D14 | `drive.ts` | 진행 중 토큰 요청 합치기, 토큰 클라이언트 1회 생성, 계정 전환 시 대기 요청 거절, `fetchMediaBlob` |
| §4.2·§4.3 | `community.mts`, `i18n/{ko,en,ja}.mts` | S3b 오류 코드 → `episode.err.*`, 문구 키 추가 |

### 명세와 다른 점·판단 (주니어 결과 파일에 옮겨 적는다)

1. **A3 단언 변경(서버):** 동의가 전혀 없는 사용자의 녹음 첨부 게시가 이제 `scope:"card"`로 거절된다(D12의 필연적 결과 — 카드 동의가 먼저 없고, 동의 1회가 카드·녹음을 함께 허용). A3는 `user(consent=false)`로 바꾸고 `card`를 단언하며, 녹음 동의 철회 뒤 `scope:"recording"` 단언을 추가해 녹음 분기 검증을 유지했다. 명세 D12의 “단언 변경 없음”은 나머지 기존 테스트에 대해 지켰다.
2. `ShareConsentStep`에 nameForm 전용 선택 props `checked`·`onCheckedChange`를 더했다(§4.1 시그니처는 그대로, 체크박스 상태 전달용).
3. 세션 카드 맞춤 그룹 이름은 표면 구분을 유지해 `sessionHead-{surface}-{id}:center-y`(제목·공유 아이콘). 공유 상태 배지 줄(숨김 사유 등)은 남기고 행동 버튼만 아이콘 메뉴로 옮겼다.
4. D15에 따라 업로드·게시 중에도 닫기를 허용한다. 게시 요청이 이미 나갔으면 닫을 때 `invalidate`로 서버 상태를 다시 읽는다.
5. 미사용이 된 문구 키 삭제: `episode.share.consent`(명세), `episode.titleWithVideo`·`episode.share.unavailablePreview`·`episode.previewTitleLabel`(I0-6 미사용 키 검사). 공유 창 버튼은 공통 `.pillBtn`/`.ghostBtn`(frontend-design §3). 오류 상자는 `--bad` color-mix로 바꿔 `design_rules` 허용 개수 5→2, `frontend-design.md` 표 갱신.
6. 기존 테스트 변경 근거: CUI-07(체크박스 제거·제목은 헤더 클릭 입력), CUI-09·SR-04·SR-06·SR-07·`profile.spec.js` PF3(행동이 아이콘 메뉴 안), SR-02(빈 제목 placeholder = 날짜), SR-09(체크박스 대신 입력 유지 단언), SR-16(D15 abort로 응답 대기 대신 `requestfinished`/`requestfailed` 결정적 대기). `cm_ui.test.js` 제목 규칙 테스트는 D13 규칙으로 교체.
7. **순서 편차:** 표적 e2e(U4·U15)와 layout spec은 구현 뒤에 작성했다. 대신 변이 검사로 Red를 확인했다(아래).

### 실제 실행 결과 (Mac, 로컬)

| 명령 | 결과 |
| --- | --- |
| `./gradlew test --tests 'ulevelp.community.ShareAttachmentApiTest.shareWithoutCardConsentIsRejected'` (D12 전) | **Red**: 409 대신 201 게시 |
| `./gradlew test --tests 'ulevelp.community.*'` (D12 후) | **94건, 실패/오류/skip 0** |
| `npx tsc --noEmit` (루트) | 오류 0 |
| `node --test test/cm_ui.test.js test/i18n.test.js test/design_rules.test.js test/r0_core.test.js` | 31건 통과 |
| 변이 2개(원곡 확인 조건 제거, 미리 듣기가 선택 토글) 적용 후 `-g "S3b3-"` | **2건 모두 실패**(게시 버튼 enabled, aria-pressed false) → 원본 복원 |
| `npm run build` 후 `npx playwright test test/e2e/cm-ui.spec.js test/e2e/layout/share-dialog.spec.js test/e2e/layout/log.spec.js test/e2e/layout/profile.spec.js test/e2e/layout/community.spec.js` | **170건 통과**(1.9m) |
| `LAYOUT_SHOTS=1 … share-dialog.spec.js` | 16건 통과, layout-warn 0건. 15장(3상태×4폭+다크) 캡처를 시니어가 훑어봄(정식 Q1~Q9 표는 주니어) |
| `git grep -n shareConsentCheckbox frontend/src test/e2e` | 0건 |

- 미실행: 전체 `npm test`, 전체 Playwright, 전체 Gradle, 실제 Drive·Supabase 업로드, CI. 테스트 표 U1·U2·U5~U14 미작성(주니어). 운영 배포·Scheduler 등록 없음.

## 14. S3b-3 주니어 4단계 최종 검증 — 2026-11-13 / Mac / Gemini(주니어)

- 선행: `step/S3b-3` (`249a510`) 확인, `gh auth status` 활성 `choise-hun` 확인.
- 남은 테스트 행 추가:
  - `test/cm_ui.test.js`: `S3b3-U14` Drive 토큰 합치기(동시 2회 `requestToken` → 클라이언트·요청 각 1회, 계정 전환 시 거절).
  - `test/e2e/cm-ui.spec.js`: `S3b3-U1`, `S3b3-U2`, `S3b3-U5`~`S3b3-U13` 추가.
- 최종 회귀 검증([결과/S3b-3](결과/S3b-3.md)):
  - `npm run build` 통과(`dist/` 생성)
  - `npm test`: **421건 / 58 suite 전부 통과**(실패 0·skip 0, `design_rules.test.js`·`S3b3-U14` 포함)
  - `npx playwright test`: **752건 전부 통과**(10.8m, `S3b3-` 13건 + `share-dialog.spec.js` 16건 포함)
  - `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/share-dialog.spec.js`: **16건 통과**(12.9s), 15장(동의·작성·메뉴 × 4개 폭 + 다크) Q1~Q9 모두 `○`
  - `./gradlew test`: **381건 전부 통과**(실패 0·오류 0·skip 0, `BUILD SUCCESSFUL in 59s`)
  - `git grep -n "shareConsentCheckbox" frontend/src test/e2e`: **0건**
- PR #16([#16](https://github.com/choise-hun/doloop/pull/16), head `2fc7549`) CI 6개 체크 전부 통과. Codex 리뷰 P1(`frontend/src/lib/drive.ts:100`), P2(`frontend/src/components/songRecord/EpisodeShareDialog.tsx:380`) 2건 확인 → 제품 코드 수정은 시니어 3-P로 인계.
- 시니어 3-P 수정 반영(주니어 4단계, 커밋 `4b0abf6`): `npm run build` 통과, `npm test` **422건 / 58 suite 전부 통과**, `npx playwright test` **753건 전부 통과**(12.2m). PR #16(`4b0abf6`) CI 6개 체크 전부 통과, Codex P1·P2 스레드 답글 완료, 새 리뷰 지적 없음.

## 15. S3b-4 시니어 직접 구현 — 2026-11-14 / Mac / Claude(시니어)

- 선행: PR #16 머지(`f7f4439`, 2026-11-13T21:57Z) 확인, `main` `git pull --ff-only` → `step/S3b-4` 생성. 작업 트리 깨끗, gh 활성 choise-hun. 서버 변경 없음(명세대로).
- 명세 §1 대조: 행 번호는 S3b-3 머지로 조금 밀렸지만 사실은 같다(`EpisodeLogCard` 썸네일 열·`ytInfo`, `SongRecordParts` 녹음 삭제 confirm, `LogPage` 곡 삭제 2곳, `ProfilePage` `#profileNames`). 서버 경로 `GET …/attachments/{id}/url`·`GET /community/me/share-impact`·`POST …/share-consent/withdraw-recording` 존재 확인.

### 구현 요약 (명세 D 번호)

| 영역 | 파일 | 내용 |
| --- | --- | --- |
| D3·D4 | `frontend/src/lib/cardAudio.ts`(신규) | `createCardAudio(deps)` + 기본 인스턴스 `cardAudio`. 요소 1개 지연 생성, 세대 번호 + `AbortController`, `toggle`·`stop`·`stopPost`·`reset`·`subscribe`·`getSnapshot`. 정리 = pause → `removeAttribute('src')` → `load()` → `dataset.attachmentId` 제거. `auth.onChange`로 uid 변경 시 `reset()`(auth.ts 무수정) |
| D1·D2·D5 | `EpisodeLogCard.tsx/.module.css` | 큰 썸네일 열(`thumbWrap`)·`.body` 제거, 본문 전폭. `div.attachRow` = `.miniThumb` 80×45 + `ytInfo`. 첨부 있으면 썸네일을 덮는 `button[data-episode-play]`(`aria-pressed`, `data-play-state`, ▶/…/■/⟲ 배지 `--ink` 위 `--bg`). 404 → `episode.err.gone` + `onPostGone`, 그 밖 → `p[data-episode-play-error]` |
| D4 | `EpisodeLogFeed.tsx` | 범위 전환·언마운트 때 `cardAudio.stop()` |
| API | `apiClient.ts` | `community.attachmentUrl`·`shareImpact`·`shareImpactOrNull`(3초, 실패·초과 = null)·`withdrawRecordingConsent` |
| D7 | `episode.mts` `deleteConfirmText`, `SongRecordParts.tsx`, `LogPage.tsx` | 녹음·곡 삭제 confirm 직전 영향 조회, 영향 > 0일 때만 문장 추가. 조회 중 중복 클릭 잠금 |
| D8 | `ProfilePage.tsx/.module.css` | `#profileShareConsent`(계정·세션 세대 key) 상태 줄, `#shareConsentWithdraw` → `#withdrawRemoveAll`·`#withdrawKeep`·`#withdrawCancel`(열면 첫 버튼 포커스, 취소·ESC 시 철회 버튼 복귀), `#shareConsentReagree` |
| D6 | `i18n/{ko,en,ja}.mts` | §4 개정 4키 + 신규 키 |
| D9 | `계획/앱_명세.md`, `계획/상용_서비스_계획.md`, `UIUX-R_수정명세.md` §5.7, 임시 명세 상단 | 녹음 사본 예외·허용 범위 ③, §2 5번 예외, §5.7 옛 제안 표 → S3b-1~4 링크, “상세 명세로 대체” 한 줄 |

### 명세와 다른 점·판단 (주니어 결과 파일에 옮겨 적는다)

1. **맞춤 그룹:** `episodeHead-{postId}:top`은 `h3`·작성자 줄 두 구성원에 둔다(제목 줄은 줄바꿈 없이 작성자 칸 최대 55%·말줄임, 작성자 줄 높이 = 제목 첫 줄). `episodeAttach-{postId}:center-y`는 영상 제목이 있을 때만 붙인다(없으면 구성원 1개 경고 A1이 나므로). 동의 철회 3버튼은 390에서 줄바꿈되므로 맞춤 그룹을 두지 않았다.
2. **문구 키 추가(§4 밖):** `profile.shareConsent.removedCount`(“ · 녹음 첨부 {count}개 삭제”, `done`의 `{removed}` 채움), `profile.shareConsent.loadFailed`·`saveFailed`(조회·반영 실패). `episode.stopRecording`은 재생 중 버튼 `title`로 쓴다(토글 버튼 이름은 `aria-pressed` 패턴에 따라 `playRecording` 고정).
3. **`play()` 결과값:** `toggle`이 `playing|stopped|stale|gone|failed`를 돌려 누른 카드만 `onPostGone`을 부른다. uid만 바뀌고 세대가 같은 늦은 응답은 `stale`로 버리면서 상태도 `idle`로 비운다(단위 테스트 작성 중 발견한 결함 — 처음 구현은 `loading`이 남았다).
4. **`episode.share.publicScope` 개정:** 명세 문구대로 “다시 게시하면 현재 세션 통계로 교체” 문장은 빠졌다.
5. D10(진행 파일 `완료/` 이동·계획 §1 10-2·인수인계 §2)은 PR 번호가 필요해 주니어 4단계로 넘긴다.

### 실제 실행 결과 (Mac, 로컬)

| 명령 | 결과 |
| --- | --- |
| `node --test test/card_audio.test.js` (빈 stub) | **Red**: 10건 모두 실패(P3t·P4t 포함) |
| 같은 명령 (구현 후) | 첫 실행 3건 실패 → 2건은 vm realm `deepEqual`(테스트 수정), 1건은 uid 변경 시 `loading` 잔류(제품 결함, 판단 3) → **10건 통과** |
| `npx tsc --noEmit -p .` | 오류 0 |
| 변이: `ensureElement`가 매번 새 요소 + auth 구독 제거 → `-g "S3b4-P(2\|5)t"` | P2t **실패**(요소 2개), P5t는 통과 — 로그아웃 시 피드 카드 언마운트(`stopPost`)가 먼저 정리하므로 auth 구독은 이중 방어. 원본 복원 |
| `npx playwright test community.spec.js layout/profile.spec.js layout/community.spec.js -g "S3b4-\|profile\|community-"` | 1건 실패(취소 뒤 포커스 — 철회 버튼 재마운트) → effect로 수정 → 통과 |
| `LAYOUT_SHOTS=1 … -g "community-pro\|community-logs\|consentWithdrawAsk"` | 14건 통과. 390·1280 다크 카드, 390 프로필 철회 확인을 시니어가 훑어봄(큰 썸네일 없음, ▶ 배지, 3버튼 줄바꿈) |
| `git grep -n "어떤 경우에도 공개되지 않습니다" frontend/src` | 0건 |
| `npm run build` 후 `npm test` | **432건 전부 통과**(`card_audio.test.js` 10건·i18n LB-1/I0-6·design_rules 포함) |
| `npx playwright test community.spec.js cm-ui.spec.js av2-community.spec.js practice-record.spec.js layout/{community,profile,log,share-dialog}.spec.js` | **314건 전부 통과**(3.6m) |

- 남은 테스트(주니어): P10t 녹음 삭제 쪽(`SongRecordParts`), P12t는 `npm test` LB-1로 확인, layout 재생 중·오류 상태 캡처(Q1~Q9 표), 전체 `npm test`·Playwright·Gradle.
- 미실행: 전체 Playwright, 전체 Gradle, 실제 Supabase 서명 주소 재생, CI. 운영 배포·Scheduler 등록 없음.

## 16. S3b-4 주니어 4단계 최종 검증 — 2026-11-14 / Mac / Gemini(주니어)

- 선행: `step/S3b-4`(`75d9e2d`) 확인, `gh auth status` 활성 `choise-hun` 확인.
- 남은 테스트 행 추가(`6a8f407`):
  - `test/e2e/community.spec.js`: `S3b4-P10t 녹음 삭제 영향` 3건(영향 있음 `{1,1}`, 영향 `{0,0}`, 조회 실패 `500`).
  - `test/e2e/layout/community.spec.js`: `community-card-audio` `layoutSuite` 추가(재생 중 `playing` 4개 폭 + 다크, 오류 `error` 4개 폭).
- 최종 회귀 검증([결과/S3b-4](결과/S3b-4.md)):
  - `npm run build`: 통과(`tsc --noEmit && vite build`, `dist/` 생성)
  - `git grep -n "어떤 경우에도 공개되지 않습니다" frontend/src`: **0건**
  - `npm test`: **432건 / 58 suite 전부 통과**(실패 0·skip 0, `card_audio.test.js` 10건·`i18n.test.js` LB-1 포함)
  - `npx playwright test`: **780건 전부 통과**(10.6m)
  - `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js test/e2e/layout/profile.spec.js -g "community-pro|community-logs|community-card-audio|userWithNames|consentWithdrawAsk"`: **28건 통과**(19.9s), 4개 폭 × (첨부 없음·있음·재생 중·오류, 프로필 동의) + 다크 Q1~Q9 모두 `○`
  - `./gradlew test --rerun-tasks`: **381건 전부 통과**(실패 0·오류 0·skip 0, `BUILD SUCCESSFUL in 1m 4s`)
- D10 마무리: 이 파일 `완료/` 이동 + 완료 줄 추가, `계획/상용_서비스_계획.md` §1 10-2 갱신, `개발산출물/인수인계_메모.md` §2 목록 일치(2건).
- PR [#17](https://github.com/choise-hun/doloop/pull/17)(base `main`, `0c1eb92`) CI 5개 성공 + Kotlin skipped 확인. Codex 리뷰 P2 1건(`LogPage.tsx:658` 및 `:155-166` `shareImpactOrNull` 지연 중 곡 전환/언마운트/계정 변경 가드 누락, 코멘트 `4569506462`) 확인 → 제품 코드 결함이므로 **시니어 3-P 핀포인트 수정**으로 인계. 머지·운영 배포·Scheduler 등록은 하지 않음.

