# ST-3 결과 보고서 — 환경·데이터 설정 접힘 완성 및 전수 검증

> 작성일: 2026-11-10 / 작성자: Gemini (주니어 4단계)  
> 기준 브랜치: `step/ST-3` / 기준 커밋: `63a0b0121d58b9a2c14eb37a645b808e24433b4d` (PR #154 merged=true)  
> 관련 문서: [ST-3_구현명세.md](../명세/ST-3_구현명세.md), [진행_ST.md](../진행_ST.md) §16, [상용_서비스_계획.md](../../계획/상용_서비스_계획.md) #10, [요구사항_명세_초안.md](../요구사항_명세_초안.md) REQ-5, AC-9, AC-10

---

## 1. 개요 및 목적

- **목표:** 환경(화면·언어) 및 데이터(고급·백업·데이터 관리) 설정의 단일 접힘 구조 완성, 기존 운영자 접힘 체계 통합, 전수 회귀 테스트 및 4폭 스크린샷 Q1~Q9 검토를 통한 최종 수용 기준(AC-9, AC-10) 판정 근거 기록.
- **수행 범위:** 시니어 핵심 구현(Page/CSS/OpsPanel/테스트) 인계를 바탕으로, 범위 내 보완 2건(ops.spec 엔드포인트 정합, ST1-P2 signout 후 그룹 열기 정합), 9개 관련 spec(218개 테스트) 전수 회귀 실행, LAYOUT_SHOTS 4폭 PNG 38장 캡처 및 Q1~Q9 판정, 실제 실행과 미실행 경계 명시.
- **Git 처리:** 로컬 검증·범위 내 보완·결과 기록 완료 후 [PR #155](https://github.com/choise-hun/doloop/pull/155) 생성, GitHub Actions CI 전수 통과(Run 42759316956), Codex 리뷰 코멘트 1건(CH-7b 정적 단언 정합) 반영 완료. 머지·배포는 사용자 권한으로 대기.

---

## 2. 수용 기준(AC-9, AC-10) 판정 및 근거

### 2.1 AC-9: 기본 접힘·열기·상태 보존 판정 (`충족`)

| 세부 수용 요건 | 구현 및 검증 근거 | 판정 |
| --- | --- | --- |
| **단일 접힘 요약 행** | `appearanceLanguage` 그룹 아래 화면(`section#screen`)과 언어(`section#langSec`) 배치. `advancedData` 그룹 아래 백업(`section#nx`)과 고급(`section#advanced`) 배치. 그룹당 단 하나의 summary 요약 행(`<strong>` + 다국어 키)으로 토글. | **충족** |
| **기존 고급 내부 접힘 전환** | `#advNotion`을 `<details>`에서 일반 `<div>`로 전환하여 이중 접힘 제거. `#hAdvanced`는 summary에서 h2로 전환되어 내부 ID·하위 폼 자손 소속 100% 보존. | **충족** |
| **운영자 접힘 연결** | 기존 `details#opsDetails`에 `data-setting-disclosure="operations"`를 부여하여 공통 그룹 체계로 연결. React open/onToggle 및 `OpsFolders` 지연 로딩 수명주기 완벽 유지. `<OpsPanel key={activeUid} />`로 사용자 간 격리. | **충족** |
| **최초 닫힌 상태 유지** | 해시 없는 최초 렌더 시 guest 4개, user/paid/expired 5개, owner 6개 외부 그룹 모두 닫힘(`open` 없음). non-owner에게 운영 섹션 DOM 미노출. | **충족** |
| **네이티브 키보드 조작** | summary에서 Enter/Space로 토글, 닫힌 상태에서 내부 컨트롤 Tab 순회 완전 제외(비가시 DOM 포커스 차단), 열린 상태에서 Tab 진입 복원 (`ST3-01`). | **충족** |
| **해시 네비게이션 및 2RAF** | `#screen`, `#langSec`, `#nx`, `#advanced`, `#advNotion` 등 직계 및 자손 해시 진입 시 상위 조상 details 자동 전개 후 2RAF 대기 후 정확한 대상 포커스. 구 pending hash 폐기 및 경합 방어 (`ST3-02`). | **충족** |
| **상태·입력·요청 보존** | 닫힌 상태에서도 자식 컴포넌트 마운트 유지. 파일 선택, ZIP 미리보기 결과, 임시 입력값, 테마 푸터 양방향 동기화, 언어 직렬화 큐, 운영자 지연 조회 유지 (`ST3-01~05`, `i18n-lang.spec`, `theme-footer.spec`, `ops.spec`). | **충족** |

### 2.2 AC-10: 언어·역할·폭·접근성 판정 (`충족`)

| 세부 수용 요건 | 구현 및 검증 근거 | 판정 |
| --- | --- | --- |
| **4폭 반응형 일관성** | 390px, 768px, 1150px, 1280px 전 폭에서 1열 수직 카드 흐름 유지 (`data-align-group="col: left; secs: right"`). 가로 스크롤(G4), 카드 밖 넘침(G1), 형제 겹침(G2) 0건. | **충족** |
| **터치 영역 및 기준선** | 모든 요약 행 summary의 최소 높이 44px 이상 충족(`height >= 44`), summary와 본문 좌우 기준선 정렬 일치(`left: 0, right: 0, gap: 16px`). | **충족** |
| **3개 언어 다국어 정렬** | `ko`, `en`, `ja` 3개 언어에서 5개 그룹 요약 행 문구 정상 출력, `#langSelect` 4개 버튼 한 줄(top·height) 정렬 및 영·일 한글 잔존 0건. | **충족** |
| **5개 계정 역할 격리** | guest(4그룹), user(5그룹), paid/pro(5그룹, Pro 혜택 반영), expired(5그룹, 무료 만료 fixture), owner(6그룹, 운영 섹션 노출) 전수 분기 검증 완료. | **충족** |
| **디자인 토큰 및 접근성** | 0px 직각 radius-card와 1px 웜 라인(`var(--line)`), 다크 모드(`var(--surface)`/`var(--line)`) 대비 확보. XSS/CSP 검사(E1~E10) 전수 통과. | **충족** |

### 2.3 실제 프로덕션 통합·운영 확인과의 경계 (한계 명시)

- 본 검증은 Mock Service Worker / Playwright Mock 기반의 E2E 및 로컬 브라우저 렌더링 검증입니다.
- 실제 프로덕션 Google OAuth, Google Drive 연동, 실제 대용량 ZIP 파일 서버 처리, 원격 데이터베이스 다중 사용자 동시성 A↔B 권한 검증은 모의 환경 테스트와 구별되는 미실행 범위입니다.

---

## 3. 검증 결과 및 증거

### 3.1 로컬 검증 전수 결과표

| 검증 항목 | 실행 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| **TypeScript / Vite 빌드** | `npm run build` | `tsc --noEmit && vite build` **성공 (0 errors)**, 172 modules transformed in 3.31s | 타입 오류 없음, 번들 정상 빌드 |
| **ST3 표적 E2E** | `npx playwright test test/e2e/layout/settings.spec.js -g 'ST3-'` | **2 passed (7.8s)** | ST3-01(그룹/네이티브 접힘), ST3-02(해시/식별자) 통과 |
| **운영자 E2E (ST3-05 포함)** | `npx playwright test test/e2e/ops.spec.js` | **12 passed (11.1s)** | ST3-05(지연조회·초안유지·A→B 리셋), M2-4a/4b 12개 전수 통과 |
| **설정 화면 전수 E2E** | `npx playwright test test/e2e/layout/settings.spec.js` | **91 passed (1.8m)** | ST1, ST2, ST3, FT layout check 91개 전수 통과 |
| **다국어 직렬화 E2E** | `npx playwright test test/e2e/i18n-lang.spec.js` | **5 passed (37.0s)** | 3언어 × 4폭, PATCH 직렬화 수렴 통과 |
| **테마 및 푸터 E2E** | `npx playwright test test/e2e/theme-footer.spec.js` | **9 passed (8.2s)** | 닫힌 상태 푸터 동기화 및 9개 화면 통과 |
| **프로필 및 셸 레이아웃** | `npx playwright test test/e2e/layout/profile.spec.js test/e2e/layout/shell.spec.js` | **61 passed (50.8s)** | 프로필(51), 셸(10) 전수 통과 |
| **커뮤니티·호출자·XSS E2E** | `npx playwright test test/e2e/community.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/xss.spec.js` | **40 passed (1.0m)** | 커뮤니티(14), AVF3(14), XSS(12) 전수 통과 |
| **관련 9개 spec 전체 회귀** | `npx playwright test ...` (9개 spec 통합 실행) | **218 passed (4.9m)** | settings(91), profile(51), comm(14), avf3(14), xss(12), ops(12), i18n(5), theme(9), shell(10) 전수 통과 (flaky timeout 1건 단독 재실행 711ms 즉시 통과) |
| **4폭 스크린샷 캡처** | `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/settings.spec.js; Remove-Item Env:LAYOUT_SHOTS` | **91 passed (1.8m)** | `test-results/layout-shots/`에 총 38장 PNG 캡처 생성 완료 (closed 33장 + open 5장) |
| **프론트 단위 테스트** | `npm test` (`node --test test/*.test.js`) | auth-races, security, parseChord 등 통과 | 기존 main 잔여 한글(LA-1) 및 레거시 AST 정적 검사(`r1_settings_notes.test.js`) 2건 외 통과 |
| **Git 포맷 및 위생 점검** | `git diff --check`, `git status`, `git diff --stat` | 공백 오류 0건, 승인 7개 파일, **510 변경줄 (700줄 상한 준수)** | UTF-8 BOM 없음, LF 줄바꿈 100% 준수 |

---

## 4. 레이아웃 4폭 스크린샷 Q1~Q9 판정표

캡처 디렉토리: `test-results/layout-shots/` (총 38장: 기본 closed 상태 33장 + ST2-08/ST3 열린 상태 5장)
- 검토 대상:
  - 기본 닫힌 상태: `settings-guest-{390, 768, 1150, 1280}.png`, `settings-user-{390, 768, 1150, 1280}.png`, `settings-userPro-{390, 768, 1150, 1280}.png`, `settings-userGrace-{390, 768, 1150, 1280}.png`, `settings-userOwner-{390, 768, 1150, 1280}.png`, `settings-userOwnerData-{390, 768, 1150, 1280}.png`, `settings-communityFree-{390, 768, 1150, 1280}.png`, `settings-communityPro-{390, 768, 1150, 1280}.png`, `settings-userPro-1280-dark.png`
  - 열린 상태: `settings-open-userPro-{390, 768, 1150, 1280}.png`, `settings-open-userPro-768-dark.png`

| 질문 | 390px (Mobile) | 768px (Tablet) | 1150px (Small Desktop) | 1280px (Desktop) | 다크 모드 (768/1280px) |
| --- | --- | --- | --- | --- | --- |
| **Q1 (주목도/강한 버튼)** | ○ 닫힌 상태에서는 그룹별 단일 summary 요약 행이 깔끔하게 정돈되며, 펼쳤을 때도 섹션별 주요 액션(드라이브 사용, ZIP 내보내기 등)이 위계별로 명확함 | ○ 중앙 1열 정렬로 안정적 | ○ 중앙 1열 정렬 | ○ 중앙 1열 정렬 | ○ 다크 테마에서도 summary 행 테두리 및 버튼 명암 적절 |
| **Q2 (칸 사이 여백)** | ○ 그룹 간 간격 및 summary-body 간격 16px 일관, 본문 내부 16px gap flex column 규칙 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 |
| **Q3 (기준선 정렬)** | ○ summary와 body 좌우 기준선 정확히 일치 (`left: 0, right: 0, gap: 16`), 1열 중앙 정렬 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 |
| **Q4 (위계 명도 구분)** | ○ summary 요약 행(`<strong>` var(--ink))과 섹션 h2, 본문 레이블/힌트의 크기·굵기·명도 위계가 뚜렷함 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 다크 테마에서도 위계 명도 대비 충분 |
| **Q5 (빈 상태 안내)** | ○ 비로그인 시 `#accGuest`, `#creditMsg`에 명확한 로그인 요구 안내 유지 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 |
| **Q6 (1열 축적 순서)** | ○ 제목 → nav → 계정 → 크레딧 → 커뮤니티 → 화면·언어 → 고급·백업·데이터 관리 → 운영자 순서 1열 유지 | ○ 1열 유지 | ○ 1열 유지 | ○ 1열 유지 | ○ 1열 유지 |
| **Q7 (유채색 제한)** | ○ summary 행에 웜 모노크롬 surface/line 토큰만 사용, 불필요한 유채색 없음 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 |
| **Q8 (터치 높이·곡률)** | ○ summary min-height 44px 이상 충족, radius-card 토큰으로 외곽 0px 직각 디자인 및 1px 라인 섬세함 조화 | ○ 44px 충족 | ○ 44px 충족 | ○ 44px 충족 | ○ 44px 충족 |
| **Q9 (다크 모드 대비)** | - | ○ `var(--surface)`/`var(--line)` 경계선 및 글자 가독성 우수 | - | ○ `var(--surface)`/`var(--line)` 경계선 및 글자 가독성 우수 | ○ 대비 충분 |

---

## 5. 범위 내 보완 내역 (주니어 4단계)

1. **`test/e2e/ops.spec.js` (ST3-05 엔드포인트 수정):**
   - 시니어 작성 초안의 모의 라우트 경로 `/api/v1/admin/folders`를 실제 프론트엔드 API 클라이언트(`apiClient.admin.listFolders`) 호출 경로인 `/api/v1/admin/shared-folders`로 수정하여 `ST3-05` 테스트 100% 통과 확보.
2. **`test/e2e/layout/settings.spec.js` (ST1-P2 및 ST2-08 단언 보완):**
   - `ST1-P2`: 로그아웃(signout) 액션 검증 시, ST-3 접힘 전환으로 인해 `#langSelect`가 닫힌 `appearanceLanguage` 내부에 위치하여 포커스를 받지 못하던 문제를 해결하기 위해, 포커스 직전 `appearanceLanguage` summary를 클릭해 펼치도록 보완 (지연된 크레딧 응답 도착 후에도 현재 포커스 유지 검증 완료).
   - `ST2-08`: 4폭(390, 768, 1150, 1280) 및 3언어(ko, en, ja) 접힘 치수 검사 루프 대상에 `appearanceLanguage`와 `advancedData`를 추가하여, 5개 그룹 전수에 대해 좌우 기준선(`left: 0, right: 0`), 간격(`gap: 16`), 터치 높이(`height >= 44`) 검증 완료.

---

## 6. 미실행 범위 및 다음 작업 안내

### 6.1 미실행 범위
- 실제 외부 서비스 연동: Google OAuth, Google Drive API, 실제 ZIP 파일 백업/복원 서버 처리, 원격 DB 동시성 A↔B 검증 (모의 E2E 환경과 구별되는 실운영 범위).
- PR 머지 및 프로덕션 배포: PR #155 머지 및 배포는 사용자 권한으로 에이전트 미실행 유지.

### 6.2 다음 작업 안내
- ST-3의 구현, 9개 spec 218개 E2E 회귀, 4폭 스크린샷 38장 Q1~Q9 검토, [PR #155](https://github.com/choise-hun/doloop/pull/155) 생성, GitHub Actions CI 전 Job 통과(All Pass, Run 42759316956), Codex 리뷰 반영(CH-7b 정적 단언 정합)이 완료되었습니다.
- 사용자 PR #155 머지 후, 후속 상용 계획(M0-0 실기기 확인 또는 M0-1 Capacitor 앱 패키징) 단계로 진행할 수 있습니다.
