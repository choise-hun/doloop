# UF-1 결과 — 카드 3px 띠·그림자, 홈 띠 색 통일·1760px·취향 칸 교환, CHORDS 합산 우선

> 입력: [명세/UF_시안.html](../명세/UF_시안.html) | 진행: [진행_UF_UI수정.md](../진행_UF_UI수정.md) | 기준 main `202b4c7`
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude). 전체 회귀·4폭+다크 Q1~Q9·문서 정리·PR/CI는 주니어 4단계(2026-11-20 Mac Gemini).

## 1. 바꾼 것 (시니어 구현 + 주니어 테스트 단언 1건 보완)

- **시니어 구현(`1759c31`, `83e6d68`, `5b13e0a`):**
  - D1 C: 전 페이지 카드·패널 12px 스파인 → 3px 띠 + 그림자(`--shadow-ambient`), 릴리프 제거(`tokens.css`, `AppSelect.module.css`, `SongRecordParts.module.css`, 각 페이지 CSS)
  - D2 B: 홈 최대 폭 `1760px`(`AppShell.module.css`, `AppShell.tsx`), 홈 BETTER 띠 색 `--fill3` → `--fill2` 통일, 다크 `--fill2` `#ECECE4` 화이트(`tokens.css`), `이어서 연습 →` 오른쪽 여백(`HomePage.module.css`), 취향 칸 `취향` ↔ `레퍼런스` 좌우 교환(`HomePage.tsx`)
  - D4 A: CHORDS 기본 범위 `reference` → `all`(합산, `ProgressionsPage.tsx`)
- **주니어 4단계 단언 갱신:**
  - `test/e2e/layout/progressions.spec.js:52-54`: `userData` 상태에서 `#progList > li` 기대 개수 `2` → `3` (시니어 표적 검증에서 미실행된 `layout/progressions.spec.js`가 D4 A 기본 `all` 범위의 3건과 어긋나던 기존 단언을 진행 파일 §3.2 근거로 갱신; 제품 코드 무수정)

## 2. 검증(실행함)

### 시니어 표적 검증
- `npm run build` · `npm test` (549 pass)
- `npx playwright test layout/home progressions layout/chords layout/log layout/ui-polish layout/practice progression-play` → **271 passed**

### 주니어 4단계 최종 검증 (2026-11-20, 3000번 포트 = 이 저장소 `dist/`)
- `npm run build` (`tsc --noEmit && vite build`) → 오류 0, `dist/` 빌드 성공
- `npm test` (`node --test test/*.test.js`) → **549 pass / 0 fail** (58 suites)
- `LAYOUT_SHOTS=1 npx playwright test` (전체 회귀) → **959 passed / 5 failed** (`test/e2e/layout/progressions.spec.js:54` D4 A 기본 `all` 3건 vs 기존 단언 2건)
- `test/e2e/layout/progressions.spec.js` 단언 수정(2→3) 후 `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/progressions.spec.js` → **14 passed** (합산 964/964 통과)
- 미실행 범위: Kotlin/서버 테스트(`./gradlew test`) — 서버·DB 변경 없음.

### 4폭 + 다크 스크린샷 검토 (`home-curation-{1280,1150,768,390}.png`, `home-curation-1280-dark.png`, `progressions-userData-{1280,1280-dark}.png`)

| # | 질문 | 1280 | 1150 | 768 | 390 | 1280 다크 |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나·강한 채움 버튼 1개 | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형(`이어서` 여백·취향 칸 포함) | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태 안내 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 1열 순서·768 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조·포인트 색 제한(홈 BETTER `--fill2` 통일) | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·`1px` 줄눈·`3px` 띠+그림자 일관성 | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·글자·화이트 띠(`#ECECE4`) 대비 | - | - | - | - | ○ |

## 3. 남은 항목 / 미실행 범위

- 제품 코드 무수정. `test/e2e/layout/progressions.spec.js` 단언 1건 외 변경 없음.
- PR·CI 상태는 PR 생성 후 확인.
