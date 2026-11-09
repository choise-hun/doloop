# PF-2 결과 보고서 — 내 이름 편집 이동 및 공개 요약

> 본 문서는 PF-2 시니어 핵심 구현(0단계), 주니어 최종 로컬 검증(4단계), 그리고 Git 게시 및 PR 검증의 실제 실행 증거와 한계를 기록한다. PR 머지 및 운영 배포는 사용자 권한으로 미실행을 유지한다.

- 작성: 2026-11-09 / 주니어(Gemini). 기준 `step/PF-2` (베이스 main=`5ed638835959c035b216a7237782902a96e48a96`).
- 명세: [PF-2 구현 명세](../명세/PF-2_구현명세.md).
- 진행: [PF 진행](../진행_PF.md) §7·§8.
- 승인 근거:
  - 2026-11-09 사용자 승인: “PF-2 명세와 PF-2 한정 9파일 예외를 승인한다. 핵심 5파일·총 700변경줄 이내에서 구현하고 표적 테스트 1~2개의 Red/Green 및 4단계 주니어 인계 기록까지 로컬로 진행한다.”
  - 2026-11-09 사용자 승인: “Gemini(주니어) — PF-2 4단계 로컬 최종 검증. 미검증 테스트 보강·전체 회귀·4폭 시각 검토·인계 기록 완성. 로컬 작업만. 커밋·push·PR·CI·머지·배포 금지.”
  - 2026-11-10 사용자 승인: “Gemini(주니어) — PF-2 Git 게시 및 PR 검증. 커밋: feat(profile): 이름 편집 이동·공개 요약 및 전수 검증, 원격 push (step/PF-2) 및 main 대상 신규 PR 생성, gh pr checks --watch로 CI 통과 확인, Codex 리뷰 코멘트 확인 및 진행/결과 갱신.”

---

## 1. 구현 요약

승인 명세의 9개 파일(핵심 5파일 + i18n 사전 3파일 + 단일 profile spec 1파일)을 통해, 설정에 있던 공개 이름 폼을 프로필 화면으로 이동하고, 나에게만 보이는 표시 이름(displayName) 단독 편집과 공개 프로필 요약(티어·크리에이터·소개·팔로워 수) 표시 여정을 완성했다.

| 파일 | 구분 | 변경 내용 | 줄 수 |
| --- | --- | --- | --- |
| `frontend/src/pages/SettingsPage.tsx` | 수정 (핵심) | `#settingsPublicNameInput, #settingsPublicNameSave` 제거 및 `#settingsProfileLink` (`profile.html#profileNames`) 이동 연결 | +3/-6 |
| `frontend/src/pages/ProfilePage.tsx` | 수정 (핵심) | `#profileNames` (표시 이름 폼 + 공용 `PublicNameForm`) 및 `#profileSummary` (티어·팔로워·소개 요약 및 500 retry) 구현, uid+generation 단위 draft/저장 잠금/요약 controller 소유권 격리 | +156/-2 |
| `frontend/src/components/community/PublicNameForm.tsx` | 수정 (핵심) | `auth.onChange` 동기 abort, PUT 후 `/me` 1회 재조회 일치 검증, `acquireSave` 상호 잠금 지원, 기존 community/home 배너 호출부 계약 보존 | +61/-53 |
| `frontend/src/lib/apiClient.ts` | 수정 (핵심) | `setPublicName` 및 `user` 요약 호출에 선택적 `signal` 전달 매개변수 지원 | +5/-2 |
| `frontend/src/lib/auth.ts` | 수정 (핵심) | `MeProfile`에 서버 DTO 필드 (`tier`, `billingTier`, `tierOverrideUntil`, `usage`, `creatorBio`) 정합 추가, `TierUsageDto` 타입 추가 | +26/-6 |
| `frontend/src/lib/i18n/ko.mts` | 수정 (사전) | `profile.namesTitle` 등 신규 프로필 키 17개 추가 | +17 |
| `frontend/src/lib/i18n/en.mts` | 수정 (사전) | 영문 프로필 키 17개 추가 | +17 |
| `frontend/src/lib/i18n/ja.mts` | 수정 (사전) | 일본어 프로필 키 17개 추가 | +17 |
| `test/e2e/layout/profile.spec.js` | 수정 (테스트) | PF2-01~11 전수 검증 보강 (표적 2개 + 정책/가드/요약/경합/XSS/다국어 5개 추가) | +290/-2 |
| **합계** | | **승인 9개 파일 (핵심 5 + 사전 3 + 테스트 1)** | **총 663 변경줄 (+592/-71, 700줄 상한 충족)** |

---

## 2. Locked Contracts 보존 확인

- **설정 화면 회귀 방지:** `#account`, `#hAccount`, `#accUser`, `#accEmail`, `#accName`, `#accQuota`, `#quotaText`, `#quotaBar`, `#driveStoragePanel`, `#btnLogout`, `#accMsg`, `#community`, `#hCommunity`, `#commAutosync`, `#commPracticeLog` 셀렉터 및 동작 100% 보존. 옛 이름 폼 2개 ID는 완전히 제거되고 `#settingsProfileLink`가 대신 위치.
- **공용 폼 호환성:** `PublicNameForm`의 기존 ID(`publicNameInput`, `publicNameSaveBtn`), CSS 클래스, `inputRef` 전달, Home/CommunityPage 배너 호출 계약 완벽 보존.
- **공개 요약 Allowlist 경계:** 공개 API에는 `tier`, `followingCount`, `email`, `displayName`이 포함되지 않음. 내 티어는 `/me.tier`를 사용하며, 공개 응답의 `followerCount`, `isCreator`, `creatorBadge`, `creatorBio`만 요약에 렌더링.
- **인증 및 동시성 가드:** 동일 틱 연타 방지 ref 잠금, 두 이름 폼 동시 제출 시 `acquireSave` 상호 잠금, 계정 전환(A→B) 또는 로그아웃 시 이전 요청 취소(AbortController signal 전송) 및 늦은 응답 폐기, 세대 불일치 시 상태 오염 차단.

---

## 3. 검증 결과 및 증거

### 3.1 의도한 실패(Red) 증거 (시니어 단계 확인)
- `PF2-07`: `settings` 화면에서 옛 이름 폼 ID 2개 제거 전 기대 실패 (기대 0 / 실제 2 확인).
- `PF2-08`: 토큰 조회 중 계정 전환 시 이전 PUT 차단 가드 전 전송 실패 (기대 0 / 실제 1 확인).

### 3.2 4단계 최종 검증 결과 (Green)

| 검증 항목 | 실행 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| TypeScript 및 Vite 빌드 | `npm run build` | `tsc --noEmit && vite build` 성공 (0 errors, 170 modules transformed) | 번들 및 타입 정합 완료 |
| 프로필 전용 E2E & 레이아웃 | `npx playwright test test/e2e/layout/profile.spec.js` | **45 passed (31.6s)** | 레이아웃 25개 + PF1/PF2 기능 20개 전수 통과 |
| 레이아웃 4폭 스크린샷 캡처 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js` | **45 passed (33.1s)** | 25장 PNG 캡처 생성 및 G0~G8 0건 통과 |
| 기존 유지 계약 회귀 (7개 spec) | `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/settings.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js` | **160 passed (2.1m)** | 기존 셀렉터·동작·i18n·XSS 회귀 0건 |
| 인증 레이스 단위 테스트 | `node --test test/auth-races.test.js` | **30 passed, 0 fail (270ms)** | auth 타입 확장 후 인증 큐·레이스 가드 100% 통과 |
| 프론트/Node 전체 단위 테스트 | `npm test` | **416 passed, 0 failed (3.78s)** | 전체 Node 단위 테스트 회귀 0건 |
| 백엔드 전체 테스트 | `./gradlew test --rerun-tasks` | **BUILD SUCCESSFUL in 45s** (5 executed) | Testcontainers PostgreSQL 및 Ktor 테스트 전체 통과 |
| Ktor 정적 서빙 smoke | `PUBLIC_DIR=/tmp/... PORT=3001 ./gradlew run` & `curl -i http://127.0.0.1:3001/profile.html` | **HTTP 200 OK**, `text/html; charset=UTF-8`, `<div id="root"></div>` 확인 | Ktor spa.html 서빙 패리티 확인 |
| Ktor 브라우저 진입 smoke | Playwright Chromium으로 `http://127.0.0.1:3001/profile.html` 직접 진입 및 새로고침 | `Status: 200`, `Title: Profile · ULeveLP`, `#profileTitle: Profile` (새로고침 후 유지) | 실제 렌더링 확인 후 프로세스 안전 종료 |
| Git 위생 및 변경줄 점검 | `git diff --check`, `git status --short`, `git diff --stat origin/main -- frontend/ test/` | 공백 오류 0, 승인 9개 파일, **663 변경줄 (+592/-71)** (700줄 상한 충족) | UTF-8/LF 준수 |

---

## 4. 레이아웃 4폭 스크린샷 Q1~Q9 판정표

캡처 디렉토리: `test-results/layout-shots/` (25장: guest/user/userWithNames/userLongText/userEmptyNames/logoutSuccess × 4폭 + userWithNames 다크 모드)

| 질문 | 390px (Mobile) | 768px (Tablet) | 1150px (Small Desktop) | 1280px (Desktop) | 다크 모드 (1280px) |
| --- | --- | --- | --- | --- | --- |
| **Q1 (주목도/강한 버튼)** | ○ 공개 이름 저장 pillBtn 1개만 강조, 나머지는 ghostBtn으로 정돈 | ○ 중앙 1열 카드 배치로 주목도 분산 없음 | ○ 중앙 1열 카드 배치 | ○ 중앙 1열 카드 배치 | ○ 다크 테마에서도 ghostBtn 테두리 및 pillBtn 대비 명확 |
| **Q2 (칸 사이 여백)** | ○ 세로 16~24px 일관, 빈 덩어리 없음 | ○ 세로 16~24px 일관 | ○ 세로 16~24px 일관 | ○ 세로 16~24px 일관 | ○ 세로 16~24px 일관 |
| **Q3 (기준선 정렬)** | ○ `#profileAccount`, `#profileNames`, `#profileSummary` 좌우 기준선 일치 (`profileCol:left; profileEdges:right`) | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 |
| **Q4 (위계 명도 구분)** | ○ h1 > h2 > 레이블 > 본문 텍스트 명도(var(--ink), var(--ink-dim))로 명확히 구분 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 다크 테마에서도 위계 명도 대비 충분 |
| **Q5 (빈 상태 안내)** | ○ 공개 이름 미설정 시 "커뮤니티 이름을 정하면 공개 프로필을 확인할 수 있어요." 안내, 요약 실패 시 재시도 버튼 노출 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 |
| **Q6 (1열 축적 순서)** | ○ 프로필 계정 → 내 이름(표시 이름 폼 → 공개 이름 폼) → 공개 프로필 요약 논리적 1열 순서 | ○ 2열 어색한 분할 없이 1열 카드 레이아웃 | ○ 1열 유지 (최대폭 narrow shell) | ○ 1열 유지 | ○ 1열 유지 |
| **Q7 (유채색 제한)** | ○ 파란색 저장 pillBtn 1개와 상태 메시지 외 유채색 없음 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 |
| **Q8 (곡률 조화)** | ○ 카드는 직각(`border-radius: 0`, 1px line border), 인풋/버튼은 필(`border-radius: 9999px`)로 DESIGN.md 규격 준수 | ○ 동일 | ○ 동일 | ○ 동일 | ○ 동일 |
| **Q9 (다크 모드 대비)** | - | - | - | - | ○ var(--surface)/var(--line) 카드 경계 및 글자 가독성 우수 |

판정: 25개 스크린샷 전 항목 `○` (결함 `×` 및 유보 `△` 0건).

---

## 5. 미실행 및 한계

1. **실제 외부 네트워크/DB 통합 미실행:** 실제 Supabase OAuth 인증 서버 및 프로덕션 원격 DB 연결 환경이 갖춰지지 않은 로컬 개발 환경이므로, 실제 사용자 A/B 간 DB 저장 격리 검증은 미실행으로 남기며 mock E2E 및 로컬 격리 테스트의 통과 결과와 엄격히 구분한다.
2. **PF-3 기능 미실행:** 내 폴더·개별 게시물 상태 확인 및 공유 철회는 계획된 후속 Step(PF-3)의 범위이다.
3. **PR 머지 및 운영 배포 미실행:** PR 머지 및 프로덕션 배포는 사용자 권한이며 본 작업 범위에서 수행하지 않는다.

---

## 6. Git 게시 및 CI/리뷰 확인 — 2026-11-10

- **승인 근거:** 2026-11-10 사용자 “Gemini(주니어) — PF-2 Git 게시 및 PR 검증”.
- **Git 처리:**
  - 커밋: `00d6440` `feat(profile): 이름 편집 이동·공개 요약 및 전수 검증` (승인 9개 파일 및 관련 명세/결과/진행 문서 포함).
  - 원격 push: `origin/step/PF-2` 브랜치 push 성공.
  - PR 생성: [PR #151](https://github.com/choise-hun/doloop/pull/151) (`main` <- `step/PF-2`).
  - CI 감시 (`gh pr checks 151 --watch`): 7개 체크 전수 통과 (0 failed, 7 successful, 0 cancelled).
    - `CI/CI ok (pull_request)`: 4s (성공)
    - `CI/Detect code changes`: 7s (성공)
    - `CI/Docker build & smoke test`: 2m 13s (성공)
    - `CI/E2E XSS & CSP (Playwright, spa)`: 8m 25s (성공)
    - `CI/Kotlin test (JDK 21)`: 3m 32s (성공)
    - `CI/Test (Node 22)`: 52s (성공)
    - `CI/Test (Node 24)`: 50s (성공)
  - 리뷰 코멘트 확인:
    - `gh api repos/choise-hun/doloop/pulls/151/reviews`: `[]` (리뷰 없음)
    - `gh api repos/choise-hun/doloop/pulls/151/comments`: `[]` (인라인 코멘트 없음)
    - `gh api repos/choise-hun/doloop/issues/151/comments`: Codex Review Summary `has_any_findings: false`, `status: completed` (지적 0건)
- **미실행 유지:** PR 머지 및 운영 배포(사용자 권한), PF-3 기능 구현, 실제 네트워크 OAuth.
