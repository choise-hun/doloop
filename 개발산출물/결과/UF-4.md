# UF-4 결과 — PROFILE 보기 전용 · 표시 이름 폼 SETTING 계정 칸 이전

> 입력: [명세/UF_시안.html](../명세/UF_시안.html) §6 | 진행: [완료/진행_UF_UI수정.md](../완료/진행_UF_UI수정.md) | 기준 main `6a47ace`
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude, `dbb2502`). 전체 회귀·4폭+다크 Q1~Q9·DR-6 수정·문서 정리·PR/CI는 주니어 4단계(2026-11-20 Mac Gemini).

## 1. 바꾼 것

### 시니어 구현 (`dbb2502`)
- **표시 이름 폼 분리·이전:** `frontend/src/components/account/DisplayNameForm.tsx` 신규 작성 — `ProfilePage.tsx`에서 표시 이름 수정 폼을 분리해 `SettingsPage.tsx` 계정 칸(`#accUser` 안, `#accQuota` 위)으로 이전(`#accDisplayName*`, `identity` 경합 방어·`saveRef` 잠금 유지).
- **PROFILE 보기 전용화:** `frontend/src/pages/ProfilePage.tsx` · `ProfilePage.module.css` — 아바타 첫 글자 원(`#profileAvatar`), 표시 이름(`#profileDisplayName`), 이메일(`#profileEmail`), 설정 이동 링크(`#profileSettingsLink` → `settings.html#account`, `profile.editInSettings` ko/en/ja 추가)만 표시. `#profileLogout`·`#profileAuthMsg` 삭제(로그아웃은 SETTING `#btnLogout`). `#profileNames`는 `communityEnabled()`일 때만 렌더.
- **테스트 갱신:** `test/e2e/layout/profile.spec.js`, `test/e2e/layout/settings.spec.js`, `test/e2e/layout/ui-polish.spec.js`

### 주니어 4단계 보정
- **DR-6 글자 크기 단계 준수:** 시니어가 미실행한 `npm test`에서 `test/design_rules.test.js` `DR-6` 실패(`frontend/src/pages/ProfilePage.module.css → font-size: 20px`)가 발생해, `docs/rules/frontend-design.md` §3 단계 값(`18px`·`24px`)에 맞춰 `.accountCard .viewName`을 `20px` → `18px`로 수정(`h2` `24px` 아래 위계 유지).

## 2. 검증(실행함)

### 시니어 표적 검증
- 미기록(`진행_UF_UI수정.md` §3.1에 UF-4 미기재).

### 주니어 4단계 최종 검증 (2026-11-20, 3000번 포트 = 이 저장소 `dist/`)
- `npm run build` (`tsc --noEmit && vite build`) → 오류 0, `dist/` 빌드 성공
- `npm test` (`node --test test/*.test.js`) → **549 pass / 0 fail** (58 suites)
- `LAYOUT_SHOTS=1 npx playwright test` (전체 회귀) → **957 passed (15.9m)** (실패 0건)
- 미실행 범위: Kotlin/서버 테스트(`./gradlew test`) — 서버·DB 변경 없음.

### 4폭 + 다크 스크린샷 검토
- 대상: `profile-userWithNames-{1280,1150,768,390}.png`, `profile-userWithNames-1280-dark.png`, `settings-open-userPro-{1280,1150,768,390}.png`, `settings-open-userPro-768-dark.png`

| # | 질문 | 1280 | 1150 | 768 | 390 | 다크(1280/768) |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나·강한 채움 버튼 1개 | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남(아바타·이름·링크, SETTING 이름 폼) | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계(`h2` 24px > `.viewName` 18px > 본문 14px) | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태·보기 전용 안내(`설정에서 편집 →`) 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 1열 순서·768 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조·포인트 색 제한 | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·원형 아바타(`50%`)·`1px` 줄눈 일관성 | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·글자 대비 | - | - | - | - | ○ |

## 3. 남은 항목 / 시안 대조 메모

- `UF_시안.html` §6의 나라(D5-B)·자기소개(D6-B)는 폐기되어 미표시, 숨겨 둔 탭 선택창(`hidden`)은 커뮤니티 재설계 때 추가하기로 하고 이번 범위에서 제외(`진행_UF_UI수정.md` §5).
- PR·CI 상태: [PR #65](https://github.com/choise-hun/doloop/pull/65) 생성, CI 확인 진행 중.
