# UF-3 결과 — SETTING 위쪽 목록·접이식 중복 제거

> 입력: [명세/UF_시안.html](../명세/UF_시안.html) | 진행: [진행_UF_UI수정.md](../진행_UF_UI수정.md) | 기준 main `202b4c7`
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude). 전체 회귀·4폭+다크 Q1~Q9·문서 정리·PR/CI는 주니어 4단계(2026-11-20 Mac Gemini).

## 1. 바꾼 것 (시니어 구현 `6021fe9`, `d261205`)

- **중복 목차 제거·접이식 제목줄 통합:** `frontend/src/pages/SettingsPage.tsx` · `SettingsPage.module.css` — 위쪽 `#settingsGroups` 목록을 제거하고, 목록 카드 모양(제목 + 부제 + 펼침/접힘)을 `<details>` `<summary>` 제목줄로 통합(`settingsRegistry.mts` 해시 계약 유지)
- **운영자 제목:** `frontend/src/components/ops/OpsPanel.tsx` (`#hOps` 문구 `운영자`)
- **단언 갱신:** `test/e2e/layout/settings.spec.js`, `test/e2e/layout/ui-polish.spec.js`, `test/e2e/ops.spec.js`

## 2. 검증(실행함)

### 시니어 표적 검증
- `npm test` (549 pass)
- `npx playwright test layout/settings theme-footer ops i18n-lang layout/ui-polish layout/profile` → **190 passed + ops 12 passed**

### 주니어 4단계 최종 검증 (2026-11-20, 3000번 포트 = 이 저장소 `dist/`)
- `npm run build` (`tsc --noEmit && vite build`) → 오류 0, `dist/` 빌드 성공
- `npm test` (`node --test test/*.test.js`) → **549 pass / 0 fail** (58 suites)
- `LAYOUT_SHOTS=1 npx playwright test` (전체 회귀) → **962 passed (15.6m)** (실패 0건)
- 미실행 범위: Kotlin/서버 테스트(`./gradlew test`) — 서버·DB 변경 없음.

### 4폭 + 다크 스크린샷 검토 (`settings-userPro-{1280,1150,768,390}.png`, `settings-userPro-1280-dark.png`, `settings-open-userPro-1280.png`, `settings-open-userPro-768-dark.png`)

| # | 질문 | 1280 | 1150 | 768 | 390 | 1280 다크 |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나·강한 채움 버튼 1개 | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형(5개 접이식 카드 간격) | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남(제목·부제·꺾쇠 아이콘 정렬) | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태·접힘/펼침 상태 안내 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 1열 순서·768 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조·포인트 색 제한 | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·`1px` 줄눈 일관성 | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·글자 대비 | - | - | - | - | ○ |

## 3. 남은 항목 / 미실행 범위

- 제품 코드·테스트 코드 무수정.
- PR·CI 상태는 PR 생성 후 확인.
