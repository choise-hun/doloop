# 진행 — UF UI 수정 묶음 (홈·LEARN·CHORDS·SETTING·PROFILE)

> **완료 2026-11-20** — 마지막 PR #예정
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

브랜치는 모두 base main, 서로 쌓지 않는다. 시니어 원스톱 구현(표적 테스트·커밋·push까지, PR 없음) → 전체 회귀·PR·CI·결과 파일은 주니어 4단계.

| Step | 내용 | 브랜치 | 결과 파일 | 상태 |
| --- | --- | --- | --- | --- |
| UF-0 | 시안·결정 | (UF-1에 포함) | §4 | 완료 2026-11-20 |
| UF-1 | 카드 3px 띠+그림자(전 페이지), 홈 띠 색 통일·다크 화이트·이어서 여백·1760px·취향 칸 교환, CHORDS 합산 우선 | `feat/UF-1-box-home` | [결과/UF-1.md](결과/UF-1.md) | 4단계 검증 완료(PR 머지 대기) |
| UF-2 | LEARN 4·5번 한글 혼입 i18n, 재생 줄(D3-A) 6개 탭 | `feat/UF-2-learn` | `결과/UF-2.md`(주니어) | 시니어 구현·push 완료, 주니어 4단계 대기 |
| UF-3 | SETTING 위쪽 목록·접이식 중복 제거 | `feat/UF-3-setting-profile` | `결과/UF-3.md`(주니어) | 시니어 구현·push 완료, 주니어 4단계 대기 |
| UF-4 | PROFILE 보기 전용(와이어프레임형)·표시 이름 수정 폼 SETTING 계정 칸 이전 | `feat/UF-4-profile` | [결과/UF-4.md](../결과/UF-4.md) | 4단계 검증 완료(PR 머지 대기) |

### 3.1 시니어 표적 검증 (2026-11-20, Mac, 3000번 = 이 저장소 `dist/`)

| Step | 명령 | 결과 |
| --- | --- | --- |
| UF-1 | `npm run build`·`npm test` / `npx playwright test layout/home progressions layout/chords layout/log layout/ui-polish layout/practice progression-play` | 549 pass / **271 passed** |
| UF-2 | `npm test` / `layout.spec layout/chords chords_* i18n-lang theme-footer layout/shell layout/chords_instruments` + 일·영 화면 한글 스캔 | 549 pass / **217 passed**, LEARN 1~7 탭 한글 0(시드 진행 제목 `prog`만 남음 — 범위 밖) |
| UF-3 | `npm test` / `layout/settings theme-footer ops i18n-lang layout/ui-polish layout/profile` | 549 pass / **190 passed + ops 12 passed** |

미실행: 전체 Playwright 회귀, `LAYOUT_SHOTS=1` 4폭+다크 Q1~Q9, PR·CI.

### 3.2 바뀐 단언(명세 변경에 따른 것)

- UF-1: 스파인 `12px`→`3px`, 릴리프 포함→그림자(`--shadow-ambient`) 포함·릴리프 없음, 다크 `--fill2` `rgb(212,178,106)`→`rgb(236,236,228)`, 홈 BETTER `fill3`→`fill2`, 연습 재생 카드 그라데이션→`none`, CHORDS 기본 `reference`→`all`(P1·P5, P9·P10은 `?scope=reference`로 진입). 추가: `UF1-1` 홈 폭, `UF1-2` 취향 칸 순서, '이어서' `padding-right 14px`.
- UF-3: `#settingsGroups` 링크 클릭 → 해시 이동, ST1-01은 summary `strong` 제목 검사, DS24-S1·D1 `#account`는 1px 카드, ops `#hOps` 문구 `운영자`.

### 3.3 주의

- UF-1과 UF-3은 `SettingsPage.module.css`·`ui-polish.spec.js`의 다른 부분을 고친다. 뒤에 머지하는 PR은 main 반영 후 충돌·단언(특히 `DS24-D1`)을 다시 확인한다.
- UF-1 머지 뒤 UF-3 화면: `.setSec`는 3px 띠가 되지만 `.serviceSection`이 1px로 덮으므로 SETTING은 띠 없는 카드가 맞다.
- UF-2는 2-5-1 탐색(`a-vplay`, 결과 패널 머리)의 재생 버튼은 설정과 섞이지 않아 그대로 뒀다. 스케일 390폭의 '근음만 보기' 체크가 오른쪽 정렬되는 것은 이번 변경 전부터다.

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

UF-1(#62)·UF-2(#63)·UF-3(#64)은 main에 머지됨. 남은 것은 UF-4 4단계뿐.

- UF-4 시니어 구현 내용(2026-11-20, `feat/UF-4-profile`): 표시 이름 폼을 `frontend/src/components/account/DisplayNameForm.tsx`로 분리해 SETTING 계정 칸(`#accUser` 안, `#accQuota` 위)에 넣음(id `accDisplayName*`, 경합 방어·identity 잠금 유지). PROFILE은 보기 전용: 아바타 첫 글자 `#profileAvatar`·`#profileDisplayName`·`#profileEmail`·`#profileSettingsLink`('설정에서 편집 →', href `settings.html#account`). `#profileLogout`·`#profileAuthMsg` 삭제(로그아웃은 SETTING `#btnLogout`). `#profileNames`(공개 이름 폼)는 `communityEnabled()`일 때만 그려짐. i18n `profile.editInSettings` 추가(ko/en/ja). 나라·자기소개 없음(D5·D6), 탭 선택창 hidden은 커뮤니티 재설계 때 넣기로 하고 이번엔 코드 미추가.
- 테스트 변경: `profile.spec.js`에서 PF1-10/11/12(PROFILE 로그아웃 경합 가드)·`logoutSuccess` 상태 삭제, PF1-05는 SETTING 로그아웃으로 이전, PF2-02/03·PF2-07 표시 이름 단언은 `/settings.html#account`로 이전, PF2-09/11의 두 폼 상호 잠금 삭제(페이지 분리). `ui-polish.spec.js` UP-1·DS24-C1·DS24-P1 갱신.
- 주니어 4단계: `feat/UF-4-profile`에서 전체 회귀(`npm test`, `npx playwright test`)·4폭+다크 스크린샷(PROFILE 보기 전용, SETTING 계정 칸 이름 폼)·PR base main·CI·`결과/UF-4.md`. 마지막 Step이므로 같은 PR에서 이 파일을 `git mv`로 `개발산출물/완료/`에 옮기고 제목 아래 `> **완료 YYYY-MM-DD** — 마지막 PR #n` 한 줄을 넣고, 인수인계 메모 "진행 파일" 줄을 맞춘다.
