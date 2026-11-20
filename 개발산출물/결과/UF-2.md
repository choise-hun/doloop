# UF-2 결과 — LEARN 한글 혼입 i18n · 재생 줄(D3-A)

> 입력: [명세/UF_시안.html](../명세/UF_시안.html) | 진행: [진행_UF_UI수정.md](../진행_UF_UI수정.md) | 기준 main `202b4c7`
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude). 전체 회귀·4폭+다크 Q1~Q9·문서 정리·PR/CI는 주니어 4단계(2026-11-20 Mac Gemini).

## 1. 바꾼 것 (시니어 구현 `4679b90`)

- **한글 혼입 i18n:** `frontend/src/lib/chords/reintPresets.mts`('Quartal · 4도 쌓기') 및 `frontend/src/lib/i18n/{ko,en,ja}.mts` 키 보강
- **D3-A 재생 줄 분리·확대:** `frontend/src/pages/ChordsPage.tsx` · `ChordsPage.module.css` — 6개 탭(스케일·코드톤·보이싱 매트릭스·탑노트·재해석·더블 스탑)의 재생 버튼을 설정 아래 전용 재생 줄(상태 문구 왼쪽 · 큰 재생 버튼 오른쪽)로 분리·배치 (`2-5-1 탐색`의 `진행 듣기`는 결과 패널 머리에 유지)

## 2. 검증(실행함)

### 시니어 표적 검증
- `npm test` (549 pass)
- `npx playwright test layout.spec layout/chords chords_* i18n-lang theme-footer layout/shell layout/chords_instruments` → **217 passed**, 일·영 LEARN 1~7 탭 한글 0건

### 주니어 4단계 최종 검증 (2026-11-20, 3000번 포트 = 이 저장소 `dist/`)
- `npm run build` (`tsc --noEmit && vite build`) → 오류 0, `dist/` 빌드 성공
- `npm test` (`node --test test/*.test.js`) → **549 pass / 0 fail** (58 suites)
- `LAYOUT_SHOTS=1 npx playwright test` (전체 회귀) → **962 passed (17.0m)** (실패 0건)
- 미실행 범위: Kotlin/서버 테스트(`./gradlew test`) — 서버·DB 변경 없음.

### 4폭 + 다크 스크린샷 검토 (`ch-b-keyboard-scale-guest-{1280,1150,768,390}.png`, `ch-b-keyboard-scale-guest-1280-dark.png`, `ch-b-keyboard-reint-guest-1280.png`, `ch-b-keyboard-tf-guest-1280.png`)

| # | 질문 | 1280 | 1150 | 768 | 390 | 1280 다크 |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나·강한 채움 버튼 1개(재생 버튼) | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형(설정·재생 줄 분리 간격) | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남(상태 문구 왼쪽 · 큰 재생 오른쪽 정렬) | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태 안내 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 1열 순서·768 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조·포인트 색 제한 | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·`1px` 줄눈·재생 알약 버튼 일관성 | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·글자·재생 버튼 대비 | - | - | - | - | ○ |

## 3. 남은 항목 / 미실행 범위

- 제품 코드·테스트 코드 무수정.
- PR·CI 상태는 PR 생성 후 확인.
