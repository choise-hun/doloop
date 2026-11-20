# 진행 — UF UI 수정 묶음 (홈·LEARN·CHORDS·SETTING·PROFILE)

> 시작 2026-11-20 / Mac / Claude 시니어. step ID 접두어 `UF-`.

## 1. 목표와 근거

- 사용자 요청(2026-11-20 대화): 박스 형태 미니멀 복귀 검토, 홈 띠 색 통일·굵기 축소·다크 화이트, '이어서' 여백, 4K 최대 폭, 취향 칸 순서, LEARN 한글 혼입·정렬·재생 버튼, CHORDS 범위 순서, SETTING 중복 제거, PROFILE 와이어프레임형·편집 기능 SETTING 이전.
- 시안: [명세/UF_시안.html](명세/UF_시안.html) — 결정 D1~D6 대기.
- 규칙: `docs/rules/frontend-design.md`(토큰 값 변경 = 디자인 결정, 시안으로 승인), `frontend-layout.md`, `개발산출물/프론트_정렬규격.md`.

## 2. 조사 결과 (코드 위치)

| 항목 | 위치 | 메모 |
| --- | --- | --- |
| 카드 띠·두께 | `HomePage.module.css` `.widgetCard`·`.frame`·`.toneFill1~3`, 그 외 10개 CSS가 `--section-spine`/`--relief-bottom-mid` 사용 | 다크 `--fill2` `#D4B26A` → `#ECECE4` |
| 이어서 | `HomePage.module.css` `.curItem` | 오른쪽 padding 추가 |
| 취향 칸 | `HomePage.tsx` `#progRefBox`·`#progArchBox` | 좌우 교환 |
| 최대 폭 | `tokens.css` `--container-max` 1120, `AppShell.module.css` | 홈만 확대 |
| LEARN 한글 | `lib/engine/theory.mjs`(strName·SLOT_NAME·INV_NAME·FAMILY label·ROLE 등), `lib/chords/reintPresets.mts` 'Quartal · 4도 쌓기' | 표시 문구만 i18n |
| LEARN 재생 | `ChordsPage.tsx` `.playbtn` 7곳(sc/tone/mx/cc/ri/tf/ds), `.scStatus` | |
| CHORDS 순서 | `ProgressionsPage.tsx` `SCOPES`(reference·analysis·all), 기본 reference | |
| SETTING 중복 | `SettingsPage.tsx` `#settingsGroups` nav + `<details>` 섹션 | `settingsRegistry.mts` 해시 계약 유지 |
| PROFILE | `ProfilePage.tsx` `#profileAccount`·`#profileNames` | 서버에 country 없음(D5) |

## 3. 단계 표

| Step | 내용 | 입력 → 결과 | 완료 기준 | 상태 |
| --- | --- | --- | --- | --- |
| UF-0 | 시안·결정 | 시안 → 이 파일 §4 결정 기록 | D1~D6 확정 | 사용자 결정 대기 |
| UF-1 | 공통 박스 형태 + 홈(띠 색·이어서·폭·취향 칸) + CHORDS 순서 | §4 → `결과/UF-1.md` | 표적 layout spec·`npm test` | 대기 |
| UF-2 | LEARN i18n·정렬·재생 버튼 | §4 → `결과/UF-2.md` | i18n-lang spec 3개 언어·practice/chords layout | 대기 |
| UF-3 | SETTING 통합 + PROFILE 재설계(+D5-A면 V15 country) | §4 → `결과/UF-3.md` | settings/profile spec·Kotlin 테스트(D5-A) | 대기 |

기본 배정: 시니어 원스톱 구현(표적 테스트·커밋·push), 전체 회귀·PR·CI는 주니어 4단계.

## 4. 결정 기록

2026-11-20 사용자 확정:

| ID | 결정 | 구현 메모 |
| --- | --- | --- |
| D1 | C 얇은 띠(3px) + 그림자만, 두께(릴리프) 제거 | 전 페이지 카드·패널 공통 |
| D2 | B 홈 최대 폭 1760px | 홈만 |
| D3 | A 설정 아래 재생 줄(상태 문구 왼쪽 · 큰 재생 오른쪽) | LEARN 1~7 공통 |
| D4 | A CHORDS 기본 탭 합산 | |
| D5 | B 나라 저장 안 함(폐기) | 서버·DB 무변경. 프로필에 나라 줄 없음 |
| D6 | 폐기 → 커뮤니티 개선 때 | `creator_bio`는 관리자 전용·`/me`에 없음 → 사용자 편집은 API 계약 변경이 필요해 이번 범위에서 뺌 |

확정 항목(시안 "확정")은 모두 그대로 구현한다. 커뮤니티 개선 때 할 일: 프로필 나라·자기소개 입력, 숨겨 둔 탭 선택창 켜기.

## 5. 다음 세션 시작 지시

이 파일과 [명세/UF_시안.html](명세/UF_시안.html)을 읽고, §4 결정이 채워졌으면 UF-1부터 이어 간다.
