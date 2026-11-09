# PF 진행 — 프로필 진입 분리 및 내 게시물 관리

## 1. 목표·입력·승인 경계

- 목표: 계획 #9 PF를 3개 이하의 독립 검증 가능한 Step으로 나누고 담당자를 판정한다. 첫 PF-1 상세 명세를 작성하여 사용자 검토를 받는다.
- 입력: [계획 #9](../계획/상용_서비스_계획.md), [REQ-4·AC-8 / REQ-3](요구사항_명세_초안.md), [CM-BE 계약](명세/CM-BE_구현명세.md), [협업 §1.2](협업_시니어주니어.md), [4단계 1단계 템플릿](프롬프트_템플릿_4단계.md), [PF-1 상세 명세](명세/PF-1_구현명세.md).
- 승인 근거: 2026-11-09 사용자 “시니어 — PF 세부 명세 및 Step 분할”. 이어서 2026-11-09 사용자 “Gemini(주니어) — PF-1 1차 구현·검증” 승인.
  - PF 3개 Step 분할 및 담당자 배정(PF-1 주니어, PF-2 시니어, PF-3 시니어) 확정·승인.
  - PF-1 상세 명세 승인.
  - PF-1 1차 구현·검증·기록(로컬 작업) 승인. 커밋·push·PR 생성은 별도 게시 승인 후 수행하며 머지·배포는 하지 않음.
- 작업자: 1차 주니어(Gemini), 3단계 시니어 독립 검증 완료(2026-11-09). 작업 브랜치: `step/PF-1` (기준 main=`4c0eb84`). docs/pf-spec의 미커밋 문서 보존.
- 담당 파일: 본 파일, 명세/PF-1_구현명세.md, 계획/상용_서비스_계획.md의 PF 순서·선행, 인수인계_메모.md의 현재 작업 링크. 공통 협업 규칙은 변경하지 않으므로 중앙 config 규칙 동기화 대상 없음.

## 2. 선행 확인과 실제 상태 — 2026-11-09 / macOS

| 항목 | 실제 확인 |
| --- | --- |
| 시작 Git | `docs/step-granularity-rules`, clean. 사용자 미커밋 변경 없음 |
| PR #147 | GitHub get_pr_info: merged=true, merge `2016a32539c08a34115ab8216707ca7f236f6751`, 2026-11-09 17:21:06 KST. [PR](https://github.com/choise-hun/doloop/pull/147) |
| PR #149 | merged=true, merge `4c0eb84ea4c4304985608f3714e7fa23416931e4`, 2026-11-09 20:19:03 KST. [PR](https://github.com/choise-hun/doloop/pull/149) |
| main 동기화 | `git fetch origin` 후 `git switch main`, `git pull --ff-only` 성공. main=origin/main=`4c0eb84` |
| 명세 브랜치 | 동기화 후 `git switch -c docs/pf-spec`. 커밋/게시하지 않음 |
| 기존 활성 파일 | 모바일스파이크, 다중LLM_자동화검토, CM-UI를 실제 파일에서 확인. CM-UI 진행 파일은 머지 전 Git 게시 대기를 아직 포함함. 이 기록을 삭제/완료 이동하거나 통합 미검증을 통과로 승격하지 않음 |
| 증거 한계 | 선행 PR의 머지는 이번 조회로 확인. PR 본문의 CI/테스트는 과거 작성자 기록이며 이번 실행·최신 CI 재검증이 아님. UI↔Ktor↔DB 풀스택 미실행 한계는 CM-UI 기록대로 유지 |

## 3. PF Step 배정 제안

PF는 하나의 Feature로 유지한다. 각 Step은 사용자가 직접 확인할 여정이며 DTO·번역·CSS·CI만 따로 떼는 가짜 Step은 없다. 순서는 계획의 PF 표가 기준이다.

| Step | 독립 완료 여정·범위 | 구현 담당 | 예상 제품/테스트 변경량·독립 검증 |
| --- | --- | --- | --- |
| PF-1 | 로그인 계정 메뉴 → 프로필 계정 확인 → 설정과 구분 → 로그아웃. 3개 런타임 진입점 연결 | **[주니어]** | 7파일, 350~550줄. 독립 CSS module과 동작/배치 단일 profile spec 포함. Node/Ktor 직접 진입·새로고침·인증·4폭 검증 |
| PF-2 | 내 이름 편집·공개 요약 확인. publicName 폼은 설정에서 프로필로 옮기고 displayName 편집을 제공. /me 타입 누락 정합·자기 공개 요약·실제 티어·크리에이터·팔로워 표시 | **[시니어]** | 잠정 6~7파일, 400~650줄. 기존 사전 키/래퍼 우선 재사용, PF-1 test 파일 확장. 이름 저장→요약 반영·쿨다운·A/B 경합·설정 회귀로 검증 |
| PF-3 | 프로필에서 내 폴더·개별 게시물 상태 확인과 공유 철회. 기존 폴더 관리/커뮤니티 동선 보존 | **[시니어]** | 잠정 5~7파일, 450~650줄. 기존 폴더 패널·세션 공유 훅/클라이언트·기존 문구 재사용. 페이지 목록→철회→후속 조회·캐시·A/B 검증 |

PF-2/3의 파일·분량은 미착수 계획 추정이며 구현 허용 목록이 아니다. 앞 Step 최종 diff를 본 뒤 바로 다음 Step만 상세화한다. 기존 키로 제품 의미를 정확히 표현할 수 없으면 번역 3파일까지 포함하여 다시 산정한다. **7파일/핵심 로직 5파일/600~700줄 초과 또는 별개 여정 결합이 보이면 상한 위반 상태로 착수하지 않는다.** 인접 범위를 먼저 재조정하며, 부득이한 4번째 Step은 독립 여정과 하한 충족 근거·사용자 검토가 필요하다. 지금은 3개 제안만 승인 요청한다.

### 3.1 협업 §1.2 판정 질문 적용

| Step | ① 기존 DOM·클래스·셀렉터 이동/변경 | ② 기존·신규 화면 공용 코드 공존 | ③ 요청 경합·캐시·오류 암묵 계약 | 결론·근거 |
| --- | --- | --- | --- | --- |
| PF-1 | 아니오. Shell의 href/current 속성만 승인 확장, 노드·클래스 이동 없음 | 아니오. 기존 Shell 소비 외 공용 화면 리팩터링 없음. 새 CSS module로 격리 | 아니오. 새 API 요청 없음. auth 유지, 로컬 로그아웃 완료 가드는 명세에 고정 | 격리된 라우팅/화면 골격이므로 주니어. `AppShell.tsx:69`, `:147`; `PrivacyPage.tsx:5`; `auth.ts:302` |
| PF-2 | **예.** settingsPublicNameInput/Save 이동 및 기존 설정 검증 계약 영향 | **예.** PublicNameForm은 CommunityPage에서도 사용 | **예.** 폼 저장→fetchMe→요약 갱신 중 A/B/동일 uid 재로그인·언어/공유 토글 경합 | 시니어. `SettingsPage.tsx:693`, `components/community/PublicNameForm.tsx:32`, `CommunityPage.tsx:251`, `auth.ts:332` |
| PF-3 | **예.** 기존 패널 셀렉터/DOM을 새 화면에서도 보존 | **예.** MySharesPanel이 community my-shares와 공존 | **예.** 폴더 낙관적 갱신·세션 철회 후 canRepublish 재조회·요청 무효화 | 시니어. `MySharesPanel.tsx:33`, `:85`; `CommunityPage.tsx:340`; `components/songRecord/useEpisodeShares.ts:24`, `:105`; `apiClient.ts:1651` |

**시니어 직접 구현 PF-2/3의 노동 분리:** 시니어는 핵심 코드와 표적 단위 테스트 1~2개까지만 확인한다. 전체 회귀·4폭 스크린샷·결과 정리·commit/push·신규 main PR 생성·최신 CI 대기·리뷰 재조회는 게시 승인 범위에서 **4단계 주니어**가 맡는다. PF-1은 1단계 명세 → 2단계 주니어 구현/PR → 3단계 시니어 독립 검증(조건 충족 시 3-P) → 4단계 주니어 마무리다.

## 4. 완료 기준과 실제 실행 결과

- [x] PR #147/#149 머지 및 main fast-forward 확인.
- [x] PF를 3개 독립 여정으로 분할하고 질문별 배정 근거 작성.
- [x] PF-1 변경 파일·시그니처·Locked Contracts·상태·문구·배치·가드↔테스트·검증 명령 고정.
- [x] 사용자 명세·배정 및 PF-1 로컬 구현·검증 승인 (2026-11-09).
- [x] layout spec 의도한 실패(Red: navAuth href 불일치 및 404 Not Found) 확인.
- [x] PF-1 승인 7개 파일 구현 완료 (총 diff 544줄).
- [x] PF-1 E2E 및 layoutSuite 통과 (Green: 26 passed, G0~G8 0건, 4폭 스크린샷 17장 Q1~Q9 전수 ○ 판정).
- [x] 기존 유지 계약 7개 spec 회귀 검증 통과 (160 passed).
- [x] 프론트엔드 및 백엔드 전체 테스트 통과 (`npm test` 416 passed, `./gradlew test` BUILD SUCCESSFUL).
- [x] Ktor 정적 서빙 및 브라우저 진입 smoke 통과 (포트 3001 격리 루트, HTTP 200 OK + React `#profileTitle` 렌더링).
- [x] 결과 보고서 `개발산출물/결과/PF-1.md` 작성 및 diff 점검 완료.
- [x] 시니어 3단계 독립 검증·최소 수정. [결과 §7](결과/PF-1.md#7-시니어-3단계-독립-검증최소-수정--2026-11-09).
- [x] 4단계 주니어 수정 후 최종 회귀·문서 정리. [결과 §8](결과/PF-1.md#8-4단계-주니어-최종-검증-및-문서-일치--2026-11-09).
- [ ] Git 커밋·push·PR 생성. (사용자 게시 승인 후 수행 예정).

실제 읽기 조사 결과:

1. 요구서의 auth.logout은 export에 없고 실제 local signOut은 `auth.ts:302`, `:448`에 있다. alias 신설 없이 호출한다.
2. 공개 요약 래퍼 `apiClient.community.user`는 이미 존재한다(`apiClient.ts:1597`, `:1762`). 중복 추가하지 않는다. 공개 응답에는 tier/followingCount가 없으며 내 티어는 /me.tier를 쓴다(`CommunityService.kt:135`, `ProfileService.kt:47`).
3. /me의 billingTier/tierOverrideUntil/usage/creatorBio가 프런트 MeProfile에서 누락돼 있다. PF-2에서 서버 DTO와 맞춘다. PF-1은 이 필드를 읽지 않는다.
4. 기존 PublicNameForm은 저장 완료·에러에 uid/세대 검사가 없고, MySharesPanel mutation도 조회와 같은 수준의 무효화가 보이지 않는다. 이번에는 **정적 위험 식별만** 했으며 실행 재현/결함 수정은 하지 않는다. PF-2/3 명세에서 해당 화면 공존·계정 경합 가드와 회귀를 고정한다.
5. PF-1은 편집/관리 기능을 삭제하지 않는다. 기존 설정·커뮤니티 기능이 계속 동작하는 상태에서 다음 Step이 완성한다. ST 그룹/접힘/Registry는 범위 밖이다.

### 4.1 실제 명령·결과 / 미실행 구분

| 명령·도구 | 실제 결과 |
| --- | --- |
| `git switch -c step/PF-1` | `step/PF-1` 브랜치 생성 및 docs/pf-spec 미커밋 문서 보존 전달 |
| `npm run build` | `tsc --noEmit && vite build` 성공 (0 errors) |
| `npx playwright test test/e2e/layout/profile.spec.js` | 초기 Red 2건 확인 후 구현 후 **26 passed (19.1s)** |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js` | 26 passed, 17장 스크린샷 캡처 완료 |
| `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/settings.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js` | **160 passed (2.2m)** (기존 회귀 0건) |
| `npm test` | **416 passed, 0 failed** (4.2s) |
| `./gradlew test` | **BUILD SUCCESSFUL in 46s** (5 executed) |
| `PUBLIC_DIR=/tmp/ulp-ktor-smoke-pf1 PORT=3001 ./gradlew run` & `curl -i http://127.0.0.1:3001/profile.html` | HTTP 200 OK, `text/html; charset=UTF-8`, `<div id="root"></div>` 확인 |
| Node Playwright Chromium smoke (`http://127.0.0.1:3001/profile.html`) | Status: 200, Title: Profile · ULeveLP, #profileTitle: Profile, 새로고침 후 유지 확인 |
| `git diff --check`, `git status --short`, `git diff --stat` | 공백 오류 0, 지정 파일 범위 100% 일치 |

**미실행:** Git 커밋·push·PR 생성 (게시 승인 별도 요청), PF-2/3 기능 구현, Cloud Run 배포.

### 4.2 시니어 독립 검증 — 2026-11-09

- 승인 근거: 현재 사용자 “GPT-6.1 Sol (시니어) — PF-1 PR 독립 검증·수정”. 로컬 검증·필요 최소 수정·결과/진행 기록만 수행. 커밋·push·PR 생성 미승인 유지.
- 시작/종료 `step/PF-1`, HEAD/main=`4c0eb84`. 기존 제품/테스트 7파일과 문서 변경 보존. 기존 인수인계/계획/명세 내용은 수정하지 않았다.
- 원시 로그아웃 오류 노출·동일 틱 연타 SDK 2회·같은 uid 재로그인 busy 잔존 Red 재현 후 수정. mounted/작업 identity/uid/세대 가드와 catch/finally 격리, 고정 실패 문구 적용. 공용 auth.ts/API/DB/fixture는 유지.
- 실제 `npm run build` 성공, 표적 4 passed, 프로필/배치 38 passed(25장 캡처), 이후 단언 보강한 3개 테스트 3 passed. Ktor 격리 루트에서 HTTP 200/React 직접 진입/reload 성공 후 이번 서버 종료. 전체 회귀·npm test·Gradle 전체 테스트는 이번 재실행하지 않았다.
- 제품/테스트 7파일, 현재 +683/-4(687 변경줄). 초기 550줄 추정 초과는 동일 여정 회귀 보강이며 700줄 상한 내. 원본 단계 기록(26건/544줄/17장)은 1차 당시 증거로 보존한다.
- 상세 결함·가드↔단언·실행 명령·Q표·미실행은 결과 §7 기준. Git 게시/CI/리뷰 완료를 주장하지 않는다.

### 4.3 4단계 주니어 최종 회귀 및 문서 정리 — 2026-11-09

- 승인 근거: 2026-11-09 사용자 “Gemini(주니어) — PF-1 4단계 최종 검증”.
- 시작/현재 `step/PF-1`, HEAD/main=`4c0eb84ea4c4304985608f3714e7fa23416931e4`. 시니어 3단계 수정 및 기존 변경 보존.
- 실제 검증 결과:
  - `npm run build`: 성공 (0 errors, Vite 170 modules transformed).
  - `npx playwright test test/e2e/layout/profile.spec.js`: **38 passed (26.7s)** (layout 25개 + 기능 13개).
  - `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js`: **38 passed (27.1s)**, 25장 스크린샷 캡처 생성 완료 (G0~G8 0건).
  - 7개 유지 회귀 spec (`shell`, `settings`, `avf3-profile-callers`, `community`, `cm-ui`, `i18n-lang`, `xss`): **160 passed (2.5m)** (회귀 0건).
  - `npm test`: **416 passed, 0 failed** (4.18s).
  - `./gradlew test --rerun-tasks`: **BUILD SUCCESSFUL in 46s** (5 executed).
  - `git diff --check`: 공백 오류 0건.
- 최종 코드 상태: 승인 7개 파일, **687 변경줄 (+683/-4)** (700줄 상한 충족).
- **미실행 유지:** Git 커밋·push·PR 생성(게시 승인 별도 요청), PF-2/3 기능, Cloud Run 운영 배포, 실제 네트워크 OAuth.

## 5. 다음 행동과 사용자 게시 승인 안내

로컬 최종 회귀 검증과 문서 정리가 완료되었다.
현재 상태는 **Git 게시(커밋·push·main PR 생성) 승인 대기** 상태이다.

게시 승인이 주어지면 아래 작업이 수행된다:
1. `step/PF-1` 브랜치에 승인 7파일 및 관련 문서 커밋·push.
2. main 대상 PR 생성 (기존 열린 PR 없음 확인).
3. `gh pr checks --watch`로 최신 CI 완료 대기.
4. 리뷰 코멘트(본문/라인/일반) 확인 및 처리 근거 기록.
5. 사용자에게 PR 링크 및 최종 머지 안내 보고.

