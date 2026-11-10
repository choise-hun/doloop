# ST-2 결과 보고서 — 계정·서비스 설정 접힘

> 본 문서는 ST-2 시니어 핵심 구현(0단계) 및 주니어 로컬 전체 검증·화면 검토(4단계)의 실제 실행 증거, 레이아웃 Q1~Q9 검토, 미실행·차단 사항을 기록한다. 사용자 지침에 따라 커밋·push·PR·머지·배포는 수행하지 않고 로컬 검증·기록만 완료했다.

- 작성: 2026-11-10 / 주니어(Gemini). 기준 `step/ST-2` (베이스 `main=origin/main=b8849a793eeaeeb66b1b68f97cbaf893bcbba92a`).
- 명세: [ST-2 구현명세](../명세/ST-2_구현명세.md).
- 진행: [ST 진행](../진행_ST.md) §11·§12.
- 승인 근거:
  - 2026-11-10 사용자 승인: “GPT-6.1 Sol (시니어) — ST-2 핵심 구현 및 검증 인계. 개발산출물/협업_시니어주니어.md §1.2에 따라 고위험 핵심 로직을 시니어가 직접 구현한다. 목표: ST-2 계정·서비스 설정 접힘 핵심 구현 및 표적 검증. 기준: ST-2 구현명세·진행_ST.md. 범위: 지정 7개 파일. Git 처리: 로컬 구현 및 표적 테스트 확인까지만(전체 회귀 테스트·PR/CI는 주니어에게 인계).”
  - 2026-11-10 사용자 승인: “Gemini (주니어) — ST-2 전체 검증·화면 검토. 프롬프트_템플릿_4단계.md §4를 따른다. 선행: step/ST-2의 미커밋 구현과 사용자 문서를 보존한다. 목표·범위: 진행_ST.md §12.4의 잔여 분기·관련 회귀·4폭 화면 검토. 완료 기준: 실제 검증 결과·PNG Q1~Q9 검토·결과/ST-2.md·진행 기록 완료. 완료한 핵심 구현과 ST-1 검증은 반복하지 않는다. Git 처리: 로컬만. 커밋·push·PR·CI·머지·배포 제외.”

---

## 1. 구현 및 검증 요약

승인 명세의 7개 파일(핵심 제품 2파일 + E2E spec 5파일)을 통해 계정·저장소(`account`), 구독·크레딧(`credits`), 공개·연동(`community`) 3개 섹션 내부에 네이티브 `<details>`/`<summary>` 접힘 구조를 구축하고, 초기 해시·네비게이션 클릭·뒤앞 이동 시 직계 marker 대상 자동 펼침과 포커스 보존, 비동기 저장 중 닫힘/재열기 후 상태 수렴 및 롤백, 동일 uid 갱신 시 open 보존과 identity 교체 시 닫힘 초기화를 완성했다.

| 파일 | 구분 | 변경 내용 | 줄 수 |
| --- | --- | --- | --- |
| `frontend/src/pages/SettingsPage.tsx` | 수정 (핵심) | 3개 섹션 내부 네이티브 `details`/`summary` 구조 추가, `activeUid` 변경 시 외부 3개 details.open만 0 초기화, canonical 해시 진입 시 ST-2 직계 marker details만 자동 열기, disabled 대상은 h2 우선 포커스 | +35/-1 |
| `frontend/src/pages/SettingsPage.module.css` | 수정 (스타일) | ST-2 전용 클래스 4종(`.serviceDisclosure`, `.serviceSummary`, `.serviceBody`, `.detailsBody`) 추가, summary min-height 44px·줄바꿈·focus-visible, summary/body 좌우 일치선(0/0) 및 16px 본문 간격 | +35 |
| `test/e2e/layout/settings.spec.js` | 수정 (테스트) | `settingsReady` attached/poll 준비 분리, `openServiceGroups` 추가, ST2-01~08 전수 검증 추가 (01-03 네이티브 접힘/포커스/delConfirm 입력 보존, 02 canonical 초기/히스토리/h2/활성별칭, 04 403/409/직렬화/재시도, 05 Drive enable/disable 지연 및 이관 confirm 취소/승인, 06-07 creditExpire 지연/언어·토큰 갱신 open 보존/로그아웃 초기화/역할별 ID 전수, 08 4폭·3언어·다크 열린 상태 및 스크린샷 캡처) | +521/-8 |
| `test/e2e/layout/profile.spec.js` | 수정 (테스트) | PF1-04 도착 직후 기본 본문 hidden 확인 후 summary 열어 기존 visible 전수 검사, 설정→프로필 링크 전 공유 그룹 열기 | +6 |
| `test/e2e/community.spec.js` | 수정 (테스트) | CM-12 공유 스위치 조작 전 community 그룹 열기 | +2 |
| `test/e2e/avf3-profile-callers.spec.js` | 수정 (테스트) | Drive 및 공유 조작 전 해당 disclosure 열기, 기존 A↔B 및 중복 방어 단언 유지 | +4 |
| `test/e2e/xss.spec.js` | 수정 (테스트) | E6 계정 그룹 열기 후 기존 안전 출력 검사 | +2 |
| **합계** | | **지정 7개 파일** | **총 605 변경줄 (700줄 이하 상한 충족)** |

---

## 2. Locked Contracts 보존 확인

- **기존 계약 및 ID 100% 보존:**
  - 섹션 ID: `account, credits, community` 및 h2 ID `hAccount, hCredits, hCommunity`, 번역 키 `settings.secAccount, settings.secCredits, community.settingsTitle` 불변.
  - account 하위 ID: `hAccount, accDesc, accGuest, btnLogin, btnLoginBlank, accUser, accEmail, accName, accQuota, quotaText, quotaBar, driveStoragePanel, driveProviderText, driveStatusMsg, driveConflictNotice, btnDriveEnable, btnDriveDisable, btnDriveMigrate, btnLogout, delConfirm, btnDeleteAcc, accMsg` 전수 유지.
  - credits 하위 ID: `hCredits, creditTier, creditMsg, creditTotal, creditBuckets, creditNext, creditExpire` 조건부 렌더 계약 유지.
  - community 하위 ID: `hCommunity, settingsProfileLink, commAutosync, commPracticeLog, commProNotice, commNameRequiredNotice, commErrMsg` 유지.
- **네이티브 uncontrolled 접힘 원칙:**
  - details의 첫 자식은 네이티브 `<summary>`, 두 번째 자식은 본문 `<div>`.
  - React state로 open을 강제 제어하거나 details name을 통한 아코디언 상호 배타성 강제 금지 (복수 열기 가능).
  - summary에는 단순 텍스트 span만 배치하여 버튼/링크 중첩 0건.
- **해시 해석 및 포커스 복원력:**
  - canonical `#account/#credits/#community`는 대상이 section이므로 직계 `data-setting-disclosure` marker를 확인하여 정확히 해당 그룹만 열기.
  - disabled 컨트롤 별칭 접근 시 소속 section의 h2로 안전하게 대체 포커스.
  - 조건부 `#creditNext/#creditExpire`가 아직 없을 때 pending을 유지하고, 데이터 지연 중 hash 변경이나 로그아웃이 발생하면 이전 포커스/열기 0건.
- **상태·요청·실패 보존:**
  - 닫기→재열기 시 DOM 노드 재사용으로 delConfirm 입력값, 내부 삭제 details open, 공유 스위치 checked, 메시지/오류 보존.
  - Drive enable/disable 및 공유 PATCH in-flight 중 닫아도 작업이 취소되지 않고, 완료/실패 후 재열었을 때 결과 메시지 정상 반영.
  - 403(`TIER_UPGRADE_REQUIRED`), 409(`PUBLIC_NAME_REQUIRED`) 시 닫힌 상태에서도 롤백 및 에러 문구(`Pro로 업그레이드하면 쓸 수 있어요`, `커뮤니티 이름을 먼저 정해 주세요`) 정상 출력.

---

## 3. 검증 결과 및 증거

### 3.1 의도한 실패(Red) 증거 (시니어 단계 확인)
- `npx playwright test test/e2e/layout/settings.spec.js -g 'ST2-01-03'` (구현 전): **1 failed** (`marker count Expected 2 / Received 0` — 기준 코드에 새 접힘이 없음을 의도한 실패로 입증).

### 3.2 4단계 최종 로컬 검증 결과 (Green)

| 검증 항목 | 실행 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| TypeScript 및 Vite 빌드 | `npm run build` | `tsc --noEmit && vite build` 성공 (0 errors, 172 modules transformed in 3.41s) | 타입 오류 0, 번들 정상 생성 |
| ST2 표적 및 전수 E2E (7개) | `npx playwright test test/e2e/layout/settings.spec.js -g 'ST2-'` | **7 passed (20.1s)** | ST2-01~08 전수 통과 |
| 명세 §6 9개 관련 spec 전체 회귀 | `npx playwright test test/e2e/layout/settings.spec.js test/e2e/layout/profile.spec.js test/e2e/community.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/xss.spec.js test/e2e/ops.spec.js test/e2e/i18n-lang.spec.js test/e2e/theme-footer.spec.js test/e2e/layout/shell.spec.js` | **214 passed, 1 flaky timeout on load (4.7m)** → `CM-10` 단독 재실행 **1 passed (837ms)** | settings(89), profile(25), community(26), avf3(14), xss(12), ops(20), i18n(13), theme(9), shell(7) 회귀 100% 통과 |
| 4폭 스크린샷 캡처 및 간격 검사 | `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/settings.spec.js; Remove-Item Env:LAYOUT_SHOTS` | **89 passed (1.7m)** | 33장 PNG 캡처 생성 완료, G0~G8 오류 0건, FT spacing/wrapped pills 전수 통과 |
| 프론트/Node 단위 테스트 | `npm test` (`node --test test/*.test.js`) | auth-races(30), security(26), ch2b(8) 등 통과 | main 브랜치의 기존 타 컴포넌트 잔여 한글로 인한 LA-1 외 제품/보안 단위 테스트 통과 (SettingsPage는 LA-1 검출 0건) |
| Git 위생 및 포맷 점검 | `git diff --check`, `git status --short`, `git diff --stat` | 공백 오류 0건, 승인 7개 파일, **605 변경줄 (700줄 이하 상한 충족)** | UTF-8 BOM 없음, LF 줄바꿈 100% 준수 |

---

## 4. 레이아웃 4폭 스크린샷 Q1~Q9 판정표

캡처 디렉토리: `test-results/layout-shots/` (총 38장: 기본 closed 상태 33장 + ST2-08 열린 상태 5장)
- 검토 대상:
  - 기본 닫힌 상태: `settings-userPro-{390, 768, 1150, 1280}.png`, `settings-userPro-1280-dark.png`
  - 열린 상태: `settings-open-userPro-{390, 768, 1150, 1280}.png`, `settings-open-userPro-768-dark.png`

| 질문 | 390px (Mobile) | 768px (Tablet) | 1150px (Small Desktop) | 1280px (Desktop) | 다크 모드 (768/1280px) |
| --- | --- | --- | --- | --- | --- |
| **Q1 (주목도/강한 버튼)** | ○ 닫힌 상태에서는 3개 접힘 행이 단정하게 정돈되며, 열린 상태에서도 주요 액션(Drive 저장소 사용, 내 이름 편집 등)이 위계별 1개씩 명확히 보임 | ○ 중앙 1열 정렬로 안정적 | ○ 중앙 1열 정렬 | ○ 중앙 1열 정렬 | ○ 다크 테마에서도 summary 행 테두리 및 버튼 명암 적절 |
| **Q2 (칸 사이 여백)** | ○ 섹션 간격 및 summary-body 간격 16px 일관, 본문 내부 6·12·16px 간격 규칙 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 | ○ 간격 규칙 동일 유지 |
| **Q3 (기준선 정렬)** | ○ summary와 body 좌우 기준선 정확히 일치 (`left: 0, right: 0, gap: 16`), 1열 중앙 정렬 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 | ○ 좌우 기준선 일치 |
| **Q4 (위계 명도 구분)** | ○ summary 요약 행(`<strong>` var(--ink))과 섹션 h2, 본문 레이블/힌트의 크기·굵기·명도 위계가 뚜렷함 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 위계 크기·명도 일관 | ○ 다크 테마에서도 위계 명도 대비 충분 |
| **Q5 (빈 상태 안내)** | ○ 비로그인 시 `#accGuest`, `#creditMsg`에 명확한 로그인 요구 안내 유지 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 | ○ 동일 안내 |
| **Q6 (1열 축적 순서)** | ○ 제목 → nav → 계정(접힘) → 백업 → 크레딧(접힘) → 커뮤니티(접힘) → 화면 → 언어 → 고급 → 운영자 순서 1열 유지 | ○ 1열 유지 | ○ 1열 유지 | ○ 1열 유지 | ○ 1열 유지 |
| **Q7 (유채색 제한)** | ○ summary 행에 웜 모노크롬 surface/line 토큰만 사용, 불필요한 유채색 없음 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 | ○ 웜 모노크롬 유지 |
| **Q8 (터치 높이·곡률)** | ○ summary min-height 44px 이상 충족, radius-card 토큰으로 외곽 0px 직각 디자인 및 1px 라인 섬세함 조화 | ○ 44px 충족 | ○ 44px 충족 | ○ 44px 충족 | ○ 44px 충족 |
| **Q9 (다크 모드 대비)** | - | ○ `var(--surface)`/`var(--line)` 경계선 및 글자 가독성 우수 | - | ○ `var(--surface)`/`var(--line)` 경계선 및 글자 가독성 우수 | ○ 대비 충분 |

판정: 4개 폭 및 다크 모드 전 항목 `○` (결함 `×` 및 유보 `△` 0건).

---

## 5. 미실행 및 차단 사항

- **Git 원격 게시 및 배포 제외:** 사용자 승인 범위에 따라 커밋·push·PR 생성·CI 확인·머지·배포는 수행하지 않고, 로컬 검증 및 결과/진행 기록으로 완료했다.
- **향후 작업 연계:** ST-3(언어/고급/백업/데이터/운영자 접힘 통합 및 최종 AC-9/10 수용 기준 점검)은 사용자 승인 후 진행한다.
