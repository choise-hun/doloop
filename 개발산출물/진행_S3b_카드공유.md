# 진행 — S2 게시물 좋아요(CMR-4) + S3b 녹음 첨부 연습 기록 카드 공유

> 시작: 2026-11-13 / Windows / Claude(시니어). `main`=`d5c2566`(PR #11 머지 확인, `git pull --ff-only` 완료, 미커밋 변경 없음, 열린 PR 0건).
> 상태: **상세 명세 승인(2026-11-13, §5 Q1~Q6 전부 추천안), 명세 PR #12 머지 완료.** CMR-4 주니어 2단계·시니어 3단계 완료. 다음은 주니어 4단계 최종 회귀·문서·PR #13/CI 정리(§7·§9). 시니어 테스트·문서 변경은 `step/CMR-4`의 미커밋 상태, 게시 head `cfab9a5` 유지.

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
| 1 | **CMR-4** 게시물 좋아요(S2) | [주니어] 4단계 | [CMR-4 명세](명세/CMR-4_구현명세.md) → `결과/CMR-4.md` | 서버 API 테스트·프런트 e2e·layout spec 통과, PR CI 통과 | 중 | **4단계 최종 검증 완료 → PR [#13](https://github.com/choise-hun/doloop/pull/13) 머지 대기**. [결과 §8](결과/CMR-4.md): Gradle 326·Playwright 144·오류 상태 캡처 통과, npm 기존 3실패 외 신규 실패 0 |
| 2 | **S3b-1** 서버 핵심: 동의·첨부·Supabase 복사·재생 주소·첨부 제거·철회 정리 | [시니어] 구현 → [주니어] 4단계 | [S3b-1 명세](명세/S3b-1_구현명세.md) → `결과/S3b-1.md` | 표적 테스트 Red→Green(시니어), 전체 회귀·PR CI(주니어) | 높음 | 승인, CMR-4 머지 뒤 |
| 3 | **S3b-2** 서버 수명주기: 삭제 경로 전파·티어 정지·숨김 30일·Drive 사본 업로드·재시도 cron·상한 | [주니어] 4단계 | [S3b-2 명세](명세/S3b-2_구현명세.md) → `결과/S3b-2.md` | 경로별 정리 테스트·cron 테스트 통과, PR CI 통과 | 높음 | S3b-1 머지 뒤 |
| 4 | **S3b-3** 게시 화면: 최초 동의·공유 창(녹음 칩·원곡 확인)·공유 아이콘 메뉴·Drive 브라우저 업로드 | [시니어] 구현 → [주니어] 4단계 | [S3b-3 명세](명세/S3b-3_구현명세.md) → `결과/S3b-3.md` | e2e·layout spec·4개 폭 스크린샷 검토, PR CI 통과 | 높음 | S3b-2 머지 뒤 |
| 5 | **S3b-4** 청취·안내: 피드 카드 미니 썸네일+재생, 단일 플레이어, 문구 3곳·삭제 확인·동의 철회, 앱 명세 개정, 마무리 | [시니어] 구현 → [주니어] 4단계 | [S3b-4 명세](명세/S3b-4_구현명세.md) → `결과/S3b-4.md` | e2e·layout spec·4개 폭 스크린샷, 진행 파일 `완료/` 이동 PR | 높음 | S3b-3 머지 뒤 |

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
- 좋아요 계약(UIUX-R §5.6)의 “본인 게시물 좋아요 허용”은 폴더 좋아요(본인 폴더 400, [CommunityService.kt:720-722](../src/main/kotlin/ulevelp/service/CommunityService.kt#L720-L722))와 다르다. 결정대로 게시물만 허용한다.

## 7. 다음 행동

1. ~~§5 검토~~ 완료. ~~명세 PR #12 머지~~ 완료.
2. ~~CMR-4 주니어 2단계·시니어 3단계·주니어 4단계~~ 완료(PR #13, [결과 §7·§8](결과/CMR-4.md)). `개발산출물/report.md` 삭제는 범위 밖 변경이므로 보존·커밋 제외. **사용자 PR #13 머지 대기.**
3. ~~계획 §1 10-2와 UIUX-R 서술 정리~~ PR #13에 포함(D9). UIUX-R §5.7 본문 세부는 S3b-4에서 마저 정리.
4. CMR-4(PR #13) 머지 뒤 S3b-1 시니어 직접 구현(템플릿 §0).

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
# 시니어 — S3b-1 직접 구현 착수

선행 조건: PR #13(step/CMR-4) 실제 머지 여부 확인 후 main으로 안전 전환 및 git pull --ff-only 동기화.
목표: 개발산출물/명세/S3b-1_구현명세.md에 따라 S3b-1 서버 핵심(동의·첨부·Supabase 복사·재생 주소·첨부 제거·철회 정리)을 직접 구현하고 표적 테스트 확인 후 작업 브랜치(step/S3b-1)를 push한다.
입력: 개발산출물/진행_S3b_카드공유.md, 개발산출물/명세/S3b-1_구현명세.md, docs/문서_운영.md §6.
주의: 시니어 직접 구현 Step은 핵심 구현·표적 테스트 1~2개·커밋·브랜치 push까지 수행하고, 전체 회귀·PR 생성·CI 대기는 4단계 주니어에게 인계한다.
```
