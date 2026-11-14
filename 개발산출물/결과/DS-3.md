# DS-3 결과 — 글자 크기 단계 정리, 없는 토큰 정리, 상단 메뉴 한 줄·터치 높이

> 작업: DS-3 (2단계 구현·4단계 최종 테스트·PR·CI) | 브랜치: `step/DS-3` | PR: [#22](https://github.com/choise-hun/doloop/pull/22) | 기준 명세: [DS-3_구현명세.md](../명세/DS-3_구현명세.md)
> 상태: 4단계 로컬 재검증 5건·PR #22 CI 통과·리뷰 코멘트 확인 완료(코드 기준 head `d26161e`) — 시니어 3단계 검증·사용자 머지 대기. 사용자 승인: 2026-11-14 U1~U7 모두 추천안.

## 1. 바꾼 파일

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | CSS 11개(명세 D3 표) | 11px 이하 본문 46곳 → `12px` |
| F2 | 수정 | `NotesPage`·`CommunityPage`·`ChordsPage`·`ProfilePage`·`SettingsPage`·`HomePage` `.module.css` | 단계 밖 7곳 교체(명세 D2 표 그대로) |
| F3 | 수정 | `PracticeSessionCard.module.css` · `EpisodeLogCard.module.css` | `--panel-bg` 8곳: `--surface2` 5곳(`.coverageBarWrap`·`::-webkit-progress-bar` 각 2, `.miniThumb` 1), `background` 줄 삭제 3곳(`.partsList` 2, `.mineBadge` 1). `.thumbPlaceholder` 글자 `--ink` |
| F4 | 수정 | `frontend/src/components/layout/AppShell.tsx` | 홈 링크 글자를 `<span className={styles.brandText}>`로 감쌈 |
| F5 | 수정 | `frontend/src/components/layout/AppShell.module.css` | 821~880px `.brandText { display: none }`, 820px 이하 `.brandLink, .navItem` `inline-flex`·`min-height: 44px` |
| F6 | 수정 | `test/design_rules.test.js` | `DR-6`·`DR-7` 추가 |
| F7 | 수정 | `test/e2e/layout/shell.spec.js` | `DS3-N1`(32건)·`DS3-N2`(3건)·`DS3-N3`(3건) 추가 |
| T6 | 수정 | `test/e2e/layout/community.spec.js` | `DS3-P1 진행 막대 바탕` 1건 추가(LOGS 탭의 피드 카드) |
| F8 | 수정 | `docs/rules/frontend-design.md` | §3 단계 표·2줄, §4 `DR-6`·`DR-7` 2줄. config 보관본 복사·push(`choise-hun/config` `cec74f2`) |
| F9 | 신규 | `개발산출물/결과/DS-3.md` | 이 문서 |
| F10 | 수정 | `개발산출물/진행_디자인D.md` | DS-3 상태 |

첫 커밋 `5a8e5ba`(`docs(design): add DS-3 spec`)에 로컬 미커밋 문서 3건(명세·진행_디자인D·인수인계_메모)을 보존 반영했다. 명세는 상태 줄만 "사용자 승인"으로 고쳤다. `인수인계_메모.md`는 내용을 고치지 않았다.

## 2. 명세와 달라진 점

| # | 내용 | 이유 |
| --- | --- | --- |
| 1 | `ProfilePage.module.css:69` `.episodeRow time`의 `font: 12px var(--font-mono)`를 `font-family`·`font-size: 12px`·`font-weight: 400`·`font-style: normal`·`line-height: normal`로 풀었다 | 명세 P1은 "`font:` 축약으로 크기를 주는 곳이 없다"고 했으나 1곳 있었고 `DR-6` ③이 실패했다. 축약이 초기화하던 굵기·줄 높이를 그대로 적어 보이는 것은 같다. `font-size` 선언 수는 408 → 409 |
| 2 | D6 규칙을 820px 블록의 **맨 앞**(`.navMainItem { display: none }` 앞)에 뒀다 | 뒤에 두면 `.navItem`의 `display: inline-flex`가 같은 우선순위로 `display: none`을 덮어 기능 메뉴가 다시 보인다(처음 구현에서 `W1-2`·`DS3-N1` 15건 실패로 확인) |
| 3 | `DS3-N1`의 가로 넘침 단언은 `scrollWidth - clientWidth <= 0` | 명세 T3 문구(`scrollWidth <= clientWidth`) 그대로 |

D2·D3 줄 번호와 46·23곳 개수는 명세와 같았다(스크립트가 줄마다 기존 값을 확인한 뒤 바꿨다).

## 3. 검증 (Mac 로컬, 2026-11-14)

| # | 명령 | 결과 |
| --- | --- | --- |
| V1 | 구현 전 `npm test` · 빌드 뒤 `npx playwright test shell.spec.js community.spec.js -g "DS3"` | `DR-6` 실패(단계 밖 7곳 출력)·`DR-7` 실패(`--panel-bg` 8곳 출력). e2e `7 failed, 32 passed`: `DS3-N1 guest 821·830·840`, `DS3-N2 850`, `DS3-N3 390·768`, `DS3-P1`. 구현 전 통과(회귀 가드): `DS3-N1` 나머지 29건, `DS3-N2 820·881`, `DS3-N3 1280` |
| V2 | `npm test` | `tests 442 · pass 442 · fail 0` |
| V3 | `npm run build` | `✓ built`, 오류 0 |
| V4 | `npx playwright test shell.spec.js community.spec.js -g "DS3\|DS2-N\|W1"` | `55 passed` |
| V5 | 변이 4종(하나씩 넣고 원복) | ① `BetaBadge.module.css`에 `font-size: 11px` → `DR-6`("11px 이하 글자가 늘었다 … 1개 (허용 0)") ② `ChordsPage.module.css:17` `21px` → `DR-6`("font-size: 21px") ③ `.brandText` 블록 삭제 → `DS3-N1 guest 821·830·840`·`DS3-N2 850` 실패 ④ D6 규칙 삭제 → `DS3-N3 390·768` 실패. 원복 뒤 작업 트리에 변이 없음 |
| V6 | `npx playwright test test/e2e/layout/` | `519 passed`, 실패 0 |
| V7 | `npm run test:e2e` | `836 passed (11.3m)` |
| V8 | `LAYOUT_SHOTS=1 … {home,log,community,practice,progressions,share-dialog}.spec.js` | 126장 생성. 판정은 §5 |
| V9 | `bash scripts/check-config-sync.sh` · `git diff --stat main` | `차이 0건`. 코드 22개(CSS 17, TSX 1, 테스트 3, 규칙 문서 1) + 문서 |

### 실측

- 비로그인 821px 메뉴의 남는 폭: **43.7px**(메뉴 789 − 왼쪽 597.75 − 오른쪽 135.53 − 간격 12). 880px 102.7px, 글자가 다시 보이는 881px 38.0px. 로그인 821px 72.0px, 881px 66.3px. 비로그인 320px 12.2px. `⌂ HOME` 글자 폭 57.7px(웹폰트 로드 상태).
- 글자 크기 값 종류: 24 → **17**(단계 12 + 고정 칸 표기 5). 11px 이하 선언: 69 → **23**.
- 메뉴 높이: 820px 이하 57px(링크 44px), 821px 이상 50.7px. 821~880px의 홈 링크 높이는 32px(로고만)이다.

### V6 경고 변화(구현 전 같은 브랜치 빌드 대비)

| 종류 | 전 | 후 | 내용 |
| --- | --- | --- | --- |
| G7b | 2023 | 1733 | `[navRow]` 145건·`#navAuth` 145건이 사라졌다(390·768px 전 화면). 나머지는 같은 요소의 높이 값만 바뀜(`partsToggleBtn` 23 → 25px, `ghostMini`·카드 행동 줄 25 → 27px) |
| G8 | 1491 | 1490 | 새 요소 없음. `nav.siteNav`·`headRow`·`progHead`·`frameHead`·`sessionHead`의 가로 간격 수치만 바뀜 |
| G5b · A1 | 282 · 220 | 282 · 220 | 변화 없음 |
| G3·G2(실패) | 0 | 0 | 새 글자 잘림·겹침 없음. `known`·`data-layout-ignore` 추가 없음 |

## 4. 예외 목록

없음.

## 5. 스크린샷 검토 (V8)

직접 열어 본 장: `nav-guest-850`·`nav-guest-390`(메뉴만 따로 캡처), `community-logs` 390·1280·1280 다크, `log-songs-userData` 390, `practice-userData` 390(연습 기록 카드 구간), `home-userData` 1280, `share-dialog-compose` 390. **나머지 폭·화면(약 115장)은 열어 보지 않았다** — 시니어 3단계에서 본다.

| 질문 | 390 | 1280 | 다크 1280 | 메모 |
| --- | --- | --- | --- | --- |
| Q1 주 행동 하나 | 통과 | 통과 | 통과 | 변화 없음 |
| Q3 위계(배지·상태 문구가 제목보다 커 보이지 않는가) | 통과 | 통과 | 통과 | 12px 배지·메타는 카드 제목(16px 굵게)보다 작게 읽힌다 |
| Q4 두 줄로 꺾인 배지 | 통과 | 통과 | 통과 | `PRO`·`BETA`·구간 배지 한 줄 |
| Q6 390px 배지 줄(연습 기록·공유 카드) | 통과 | — | — | 공유 상태 문구·"다시 시도" 한 줄, 진행 막대 바탕이 보인다 |
| Q7 유채색 절제 | 통과 | 통과 | 통과 | 변화 없음 |
| Q8·Q9 곡률·다크 대비 | 통과 | 통과 | 관찰 1건 | 아래 |
| 850px 메뉴 | — | — | — | 로고만 있는 홈 링크, 한 줄, 로고와 `LEARN` 간격 정상 |

768·1150px은 스크린샷으로 판정하지 않았다(자동 검사 V6만 통과).

관찰(이번 변경과 무관, 고치지 않음): 커뮤니티 카드의 `파트 보기`·`좋아요`·`신고` 버튼이 다크에서 브라우저 기본 회색 바탕으로 보인다. CSS에 버튼 바탕 지정이 없어서이며 DS-3이 지운 `background` 3줄(`.partsList`·`.mineBadge`)과는 다른 선택자다.

## 6. 미실행 범위

- 운영 배포, 실제 로그인 데이터 화면, 실제 기기.
- V8의 768·1150px과 열어 보지 않은 화면의 사람·모델 검토(시니어 3단계 검토 대기).
- Firefox·Safari(`::-moz-progress-bar` 바탕 포함)는 Playwright chromium만 돌렸다.

## 7. 남긴 것

- 화면별 남은 G7b 건수(U7, 390 / 768px, 상태 합산): chords 225/226 · ch(악기 연습실) 163/163 · home 119/123 · community 107/94 · notes 55/55 · practice 43/43 · share 38/35 · note 30/30 · log 25/23 · profile 24/24 · progressions 22/22 · settings 20/20 · privacy 2/2.
- 308px 미만 메뉴 두 줄(지원 폭 밖).
- 화면 제목 크기 차이: `ChordsPage` 24 · `LogPage` 32 · `CommunityPage` 24 · 나머지 `clamp`.
- 구현 전 기준선 실행에서 `PF2-07`이 1회 실패했고(DS-3 변경 전 코드), 구현 뒤 V6·V7 및 4단계 재실행(`npm run test:e2e` 836 passed)에서는 모두 통과했다.

## 8. 4단계 최종 재검증 · PR · CI · 리뷰 확인 (2026-11-14, head `d26161e`)

### 8-1. 로컬 재검증 (코드 무수정)

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | **tests 442 · suites 58 · pass 442 · fail 0** | `duration_ms 4000.527958` (`DR-6`·`DR-7` 포함) |
| `npm run build` | **오류 0** (`✓ 177 modules transformed.`, `✓ built in 888ms`) | `tsc --noEmit && vite build` |
| `npx playwright test test/e2e/layout/` | **519 passed (6.3m)**, 실패 0 | 전 화면 layout spec |
| `npm run test:e2e` | **836 passed (11.1m)**, 실패 0 | `PF2-07`(545번 항목) 통과 확인, 재실패 없음 |
| `bash scripts/check-config-sync.sh` | **차이 0건** | 10개 동기화 대상 모두 `같음` |

```text
# npm test
ℹ tests 442
ℹ suites 58
ℹ pass 442
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4000.527958

# npm run build
✓ 177 modules transformed.
✓ built in 888ms

# npx playwright test test/e2e/layout/
  519 passed (6.3m)

# npm run test:e2e
  836 passed (11.1m)

# bash scripts/check-config-sync.sh
차이 0건
```

### 8-2. PR · CI · 리뷰 확인

- **PR:** [#22](https://github.com/choise-hun/doloop/pull/22) (`step/DS-3` → `main`)
- **코드 head `d26161e` CI 결과:** [Run #43577994057](https://github.com/choise-hun/doloop/actions/runs/43577994057) — 5/5 실행 성공, 1건 건너뜀 (`Detect code changes` 4s, `Test (Node 22)` 40s, `Docker build & smoke test` 1m41s, `E2E XSS & CSP (Playwright, spa)` 10m5s, `CI ok` 2s; `Kotlin test (JDK 21)`은 서버·빌드 설정 무변경으로 `SKIPPED`).
- **리뷰 코멘트 확인:**
  - `chatgpt-codex-connector[bot]` (`d26161e` 기준): `has_any_findings: false`, `has_unresolved_findings: false`, `status: completed` ([코멘트](https://github.com/choise-hun/doloop/pull/22#issuecomment-6874831212)) — 지적 0건, 처리 불필요.
  - PR 인라인 코멘트(`pulls/22/comments`) 0건, GitHub PR 리뷰(`reviews`) 0건.
- **다음:** 시니어 3단계 검증(결과 §2 명세와 달라진 점 3건·§5 768/1150px 스크린샷 검토) 및 사용자 PR #22 머지.

## 9. 시니어 3단계 독립 검증 (2026-11-14, Claude — 대상 head `2688bcb`, 코드 head `d26161e`)

PR #22 head와 `origin/step/DS-3`(`2688bcb`)가 같은 것을 확인하고 별도 worktree에서 검증했다. **결함 0건 — 코드 수정 없음.** 이 절과 진행 파일 상태 줄만 고쳤다(미커밋, 주니어 4단계가 커밋·push).

### 9-1. 명세 대조

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| D2·D3 값 교체 | 일치 | `git diff origin/main...HEAD`의 `font-size` 줄이 D2 7곳·D3 올림 46곳뿐이고 "유지" 23곳·굵기·패딩 무변경. `DR-6` 통과가 개수(23)를 교차 확인 |
| D4 `--panel-bg` | 일치 | `--surface2` 5곳·삭제 3곳·`.thumbPlaceholder` `--ink` |
| D5·D6 메뉴 | 일치 | 홈 글자 `span.brandText` 감쌈, 821~880px 숨김, 820px 이하 `inline-flex`·`min-height: 44px` |
| §2-1 `font:` 축약 풀기(`ProfilePage.module.css:69`) | **승인** | 명세 P1의 조사 누락(시니어 몫)이다. D7이 축약 크기를 금지하므로 푸는 것이 맞고, 축약이 초기화하던 굵기·글꼴 모양·줄 높이를 명시해 보이는 값이 같다. `letter-spacing`·`color`는 축약과 무관 |
| §2-2 D6 규칙을 820px 블록 맨 앞에 | **승인** | `.navItem`·`.navMainItem`은 같은 우선순위(클래스 1개)라 뒤에 오는 선언이 이긴다. 기능 메뉴는 `navItem navMainItem`을 함께 가지므로 D6을 뒤에 두면 `display: none`이 덮인다. 명세 D6은 "블록 안"만 정했고 순서는 정하지 않아 명세 위반이 아니다 |
| §2-3 `scrollWidth - clientWidth <= 0` | 명세와 같음 | 차이 아님 |
| 규칙 문서·보관본 | 일치 | `bash scripts/check-config-sync.sh` → `차이 0건` |

### 9-2. 단언이 가드 누락을 잡는지 (시니어 직접 변이, 하나씩 넣고 `git checkout`으로 원복)

주니어 V5(4종)에 겹치지 않는 변이를 골랐다.

| 변이 | 결과 |
| --- | --- |
| `PracticeSessionCard.module.css:151` `--surface2` → `--panel-bg` | `DR-7` 실패: `PracticeSessionCard.module.css → --panel-bg` |
| `EpisodeLogCard.module.css:20` 유지 항목 `10px` → `12px` | `DR-6` 실패: `실제 0개, 표는 1`(허용 표 감소 방향) |
| `ProfilePage.module.css:69`를 `font: 12px var(--font-mono)`로 되돌림 | `DR-6` 실패: `font: 12px var(--font-mono)` |
| `EpisodeShareDialog.module.css:263` `8px` → `0.5rem` | `DR-6` 실패: `font-size: 0.5rem`(단계 밖) |
| `EpisodeLogCard.module.css:194` `.coverageBarWrap` `--surface2` → `--panel-bg` 후 빌드 | `DS3-P1` 실패: `Expected rgb(225, 224, 214)` / `Received rgba(0, 0, 0, 0)`. 원복·재빌드 뒤 `1 passed` |

정적 추적: `DS3-N1`의 줄바꿈은 `.navMain`(`min-width: 0`, `flex-wrap`)이 `.navLinks`보다 먼저 꺾일 수 있어 SETTING `top` 단언만으로는 놓칠 수 있으나, 같은 테스트의 메뉴 높이 < 64px 단언(두 줄이면 약 88px)이 잡는다. 주니어 V5 ③(`.brandText` 블록 삭제 → `DS3-N1 guest 821·830·840` 실패)이 실제 증거다. `DS3-N3`은 1280px에서 높이 < 44를 단언해 D6이 넓은 폭으로 번지는 것을 잡는다.

### 9-3. 실행 결과 (Mac 로컬, worktree `../doloop-ds3`, head `2688bcb`)

| 명령 | 결과 |
| --- | --- |
| `node --test test/design_rules.test.js` | `tests 7 · pass 7 · fail 0` |
| `npm test` | `tests 442 · pass 442 · fail 0` (빌드 전 첫 실행은 441 — `dist` 유무에 따른 테스트 개수 차이이며 빌드 뒤 442로 같다. main은 440 + `DR-6`·`DR-7`) |
| `npm run build` | `✓ built`, 오류 0 |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/` | `519 passed (6.5m)`, 스크린샷 319장 |

미실행: `npm run test:e2e` 전체(주니어 4단계 836 passed 기록을 따르고 코드 무수정이라 다시 돌리지 않음), Firefox·Safari, 실제 기기·운영.

### 9-4. 스크린샷 검토 (§5에서 열어 보지 않은 768·1150px)

직접 연 장: `community-logs-communityPro-768`, `home-userData-1150`, `practice-userData-768`(연습 기록 카드 구간 2장으로 잘라 봄), `share-dialog-compose-compose-768`, `settings-userPro-1150`, `progressions-userData-768`, `community-guest-guest-1150`.

| 질문 | 768 | 1150 | 메모 |
| --- | --- | --- | --- |
| Q3 위계 | 통과 | 통과 | 12px 배지·메타(`PRO`·`레퍼런스`·공유 상태 문구·`진행 5개`·`C Major`)가 카드 제목보다 작게 읽힌다 |
| Q4 두 줄 배지 | 통과 | 통과 | 배지·`파트 N개 보기`·`좋아요`·`신고` 한 줄 |
| Q6 카드 배지 줄 | 통과 | — | 연습 기록 카드의 진행 막대 바탕이 보인다(`--surface2`) |
| 메뉴 | 통과 | 통과 | 768px 홈·SETTING·계정 한 줄, 1150px 기능 메뉴 한 줄 |
| G3 잘림 | 없음 | 없음 | 자동 검사와 같다 |

관찰(DS-3 회귀 아님, 고치지 않음): ① 커뮤니티 카드 `NO VIDEO` 글자 위에 재생 배지(▶)가 겹친다. `.playBadge`는 20×20 고정 박스·절대 위치라 글자를 10→12px로 올려도 박스 위치·크기가 같고, `NO VIDEO`(10px)는 유지 항목이다 — DS-3 전부터 같은 배치. ② `progressions-userData-768`처럼 고정 하단 탭 바가 전체 페이지 캡처 중간에 찍히는 것은 `fullPage` 캡처 방식 때문이다.

### 9-5. 주니어 4단계 인계

- 미커밋 변경: `개발산출물/결과/DS-3.md`(이 절), `개발산출물/진행_디자인D.md`(DS-3 상태 줄·다음 할 일). 코드 변경 없음.
- 할 일: 두 파일 커밋(`docs(design): record DS-3 senior review`) → `step/DS-3` push → PR #22 최신 head CI 종료 확인(`gh pr checks 22 --watch`) → 새 리뷰 코멘트 확인 → 결과 §9 끝과 진행 파일에 최신 head·CI run 기록.
- 다시 돌릴 테스트: 문서 전용 변경이라 `npm test`만(CI가 전체를 다시 돈다).

### 9-6. 주니어 4단계 반영 결과 (2026-11-14)

- **로컬 테스트:** `NODE_PATH=/Users/seokhunchoi/code/doloop/node_modules npm test` → `tests 442 · suites 58 · pass 442 · fail 0` (worktree 내 `node_modules` 부재로 메인 저장소 `node_modules` 경로 지정).
- **문서 커밋·push:** `8ad40d6` (`docs(design): record DS-3 senior review`) → `step/DS-3` push 완료(코드 변경 없음, 코드 기준 head는 `d26161e` 유지).
- **PR #22 CI (`8ad40d6`):** [Run #43581739637](https://github.com/choise-hun/doloop/actions/runs/43581739637) — `success` (`Detect code changes` 5s, `CI ok` 3s 통과, 문서 전용 변경으로 코드·빌드 4건 `SKIPPED`; 코드 기준 `d26161e` [Run #43577994057](https://github.com/choise-hun/doloop/actions/runs/43577994057) 5/5 성공).
- **새 리뷰 코멘트 확인:** `pulls/22/comments` 0건, `pulls/22/reviews` 0건, `issues/22/comments`는 기존 `chatgpt-codex-connector[bot]`(`6874831212`, 지적 0건) 외 새 코멘트 없음.
- **최종 상태:** 코드·검증·CI·리뷰 반영 완료, 사용자 PR #22 머지 대기.
