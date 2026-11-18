# 진행 — DS2 디자인 전환 (홈 융합 4:6 기조 전 페이지 적용)

- **목표:** 확정 시안(`4:6` + 쿨 라이트 -20% + `▶ PLAYER` A안 + `12px` 계기판)을 토큰·가드·AppShell부터 모든 화면까지 4 Step으로 적용한다.
- **근거:** [계획/디자인_전환_계획](../계획/디자인_전환_계획.md) §1~§3 · [frontend-design](../docs/rules/frontend-design.md)(2026-11-18 개정) · [프론트_정렬규격](프론트_정렬규격.md) v1.8 · [명세/HOME_융합_시안.html](명세/HOME_융합_시안.html) · [자료/DESIGN_하라켄야_수정안](자료/DESIGN_하라켄야_수정안.md) · [협업 §1.2](협업_시니어주니어.md)
- **step ID:** `DS2-1`~`DS2-4`. 테스트 이름 접두어 `DS21-`·`DS22-`…(기존 `shell.spec.js`의 옛 `DS2-N1~N3`와 구별)
- **상태:** DS2-1 완료(PR #44 머지, main `1103f0d`). DS2-2 0단계 시니어 구현(`85cc36f`) + 4단계 주니어 로컬 전체 회귀·홈 스크린샷·경고 수 비교 완료 (`feat/DS2-2-home-fusion`, PR·CI 진행 중)

## 1. 단계 표

| 단계 | 범위 | 담당 | 선행 | 입력 파일 | 결과 파일 | 완료 기준 | effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DS2-1 | 토큰 3블록(쿨 라이트·파생 hex·`--radius-block`) + 곡률 가드 일원화·다크 동기화 가드 + AppShell `PLAYER` 1순위·A안 | **[시니어]** 구현·표적 테스트·커밋 2개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 | 명세 승인 | [명세/DS2-1](명세/DS2-1_구현명세.md), 이 파일 | [결과/DS2-1](결과/DS2-1.md) | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | **완료** (PR [#44](https://github.com/choise-hun/doloop/pull/44) 머지, main `1103f0d`) |
| DS2-2 | 홈 4:6 융합(스파인·릴리프·버튼 3단계·`합산→레퍼런스→분석`·`랜덤 ↻`) | **[시니어]** 구현·표적 테스트·커밋 3개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 | DS2-1 PR 머지(완료) | [명세/DS2-2](명세/DS2-2_구현명세.md), 이 파일 | [결과/DS2-2](결과/DS2-2.md) | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | 4단계 검증 완료 · PR/CI 진행 중 |
| DS2-3 | Practice·Chords·Log 전환(지판 계열 토큰 D8 판정, `chords.spec.js:44`·`practice.spec.js:361-364` 곡률 단언 갱신) | 1단계 명세에서 판정(Practice/Chords 고위험, Log 격리) | DS2-2 머지 | 계획 §2 순서 3, 결과/DS2-2 | `개발산출물/결과/DS2-3.md` | 명세에서 정함 | 높음 | 대기 |
| DS2-4 | Notes·Progressions·Settings·Profile·Privacy 전환 + 공용 `.ghostBtn`·`.inpField` 블록 전환(D2) + 위 메뉴 글꼴 확인(D11) + 전 화면 Q1~Q9 | 1단계 명세에서 판정 | DS2-3 완료 | 계획 §2 순서 4, 결과/DS2-3 | `개발산출물/결과/DS2-4.md` | 전 화면 4폭+다크 스크린샷 표, `완료/` 이동 | 높음 | 대기 |

## 2. 고정된 결정 (Step 경계를 넘는 것만)

| 날짜 | 결정 | 출처 |
| --- | --- | --- |
| 2026-11-18 | 모바일 탭 바는 순서만 교체(`▶PLAYER · LEARN · TRAILS · [COMMUNITY] · CHORDS · NOTES`), HOME 칸 추가·TRAILS 제거 없음 | 사용자(명세 D1) |
| 2026-11-18 | 공용 `.ghostBtn`·`.inpField` 블록 전환은 DS2-4. DS2-2~3은 화면 CSS 모듈 클래스로 처리 | 사용자(명세 D2) |
| 2026-11-18 | 시안과 규칙이 다르면 규칙 우선: `▶`는 `12px`·`--ink`(시안 `10px`·주황 글자 대신) | 규칙 §1·§3, DR-6 |
| 2026-11-18 | 파생 색은 oklab 산식을 미리 계산한 hex 토큰. 시안의 나머지 파생 토큰은 쓰는 Step에서 3블록에 추가 | 명세 D5·D7 |
| 2026-11-19 | DS2-2 명세 전체 승인(D1 DR-9·규칙 문서 개정, D2 정렬 규격 v1.9, D5 대표 CTA 먹색 유지, 파일 11개 분할 없음) | 사용자 |
| 2026-11-19 | 계기판 새 문구(`WEEK 46 · STREAK TRACKER` 등)는 DS2-2에 넣지 않음 — 기존 `연습실`·`학습`만 계기판 모양 | 사용자(DS2-2 §9 질문 2, 추천안) |
| 2026-11-19 | 파사드 배경(줄눈·리벳·결)은 DS2-2 제외, DS2-4 마감에서 전 화면 공통(AppShell)으로 할지 따로 결정 | 사용자(DS2-2 §9 질문 3, 추천안) |

## 3. DS2-1 실행 (0단계 시니어 → 4단계 주니어)

1. 브랜치: `git switch -c feat/DS2-1-tokens-shell`(현재 `feat/M1A-3-app-auth` `3705a2c` + 미커밋 DS2 문서에서) → `git merge --no-edit origin/main` → 문서 커밋.
2. 시니어 표적: `node --test test/design_rules.test.js test/r0_core.test.js` · `npx playwright test test/e2e/layout/shell.spec.js`.
3. 주니어 4단계 전체: `npm test` · `npm run build` · `npx playwright test` · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{privacy,home,practice}.spec.js` → 결과 파일에 위 메뉴·탭 바 Q1·Q4·Q7·Q8·Q9 표, G5b 경고 수 main 대비 · `bash scripts/check-config-sync.sh`.
4. PR(base main) → `gh pr checks --watch` → 리뷰 확인 → 결과·이 파일 갱신.

## 4. 겪은 문제

- **DS2-1 폭 회귀(명세 §9 주의 1) → 사용자 결정으로 해결:** `DS3-N1 guest 961px` 실패 — 위 메뉴 두 줄(높이 88px). 실측(로컬 Mac Chromium): 961px 안쪽 폭 929px, 필요 931.9px → 2.9px 부족(964px부터 한 줄, user 961px 여유 25px, 821~960px은 §5-4 값으로 통과). 원인: `.navPlayer` 프레임 약 +26px. **사용자 선택(2026-11-18): 961~1000px에서 `.navPlayer`만 `padding: 2px 6px; gap: 3px`**(다른 간격 불변). DS3-N1에 `1000`·`1001`px 추가 → 통과. CI(Linux 글꼴)에서 폭이 달라 다시 실패하면 같은 기록 방식으로 묻는다.
- **접근 이름 측정:** Playwright 1.51 `getByRole({ name })`은 `content: "▶" / ""` 대체 텍스트를 지원하지 않아 이름을 `▶" / " PLAYER`로 계산한다. Chromium 실제 접근성 트리(CDP `Accessibility.getPartialAXTree`)는 `PLAYER` → DS21-N1·N2는 CDP 값으로 `PLAYER` 정확히 일치를 단언한다(기대값 동일).

## 5. 다음 세션 시작 지시

- **DS2-2 0단계 결과(2026-11-19 Mac, Claude 시니어):** 브랜치 `feat/DS2-2-home-fusion`(main `1103f0d`에서), 커밋 `a8a94d6` docs(명세·이 파일) · `59c60c6` feat(design) 가드 · `85cc36f` feat(home) · 이후 docs(이 기록). PR 없음. 파일은 명세 §3의 11개만(제품 6·테스트/검사기 3·규칙 문서 2).
  - 구현 전 실패 확인: `node --test test/design_rules.test.js` → DR-8 실패(`--streak-done` 없음) · `npx playwright test test/e2e/layout/home.spec.js -g "DS22|UIUX-R"` → 9 failed(UIUX-R T1, DS22-1~8).
  - 표적 검증: `node --test test/design_rules.test.js test/r0_core.test.js test/r1_home.test.js` → pass 19 / fail 0 · `npm run build` 오류 0 · `npx playwright test test/e2e/layout/home.spec.js` → 46 passed(layoutSuite G 실패 0 — `isCard` 3px 변경 뒤에도 G1·G6 실패 없음, 명세 §9 주의 1·2 해당 없음) · `npx playwright test test/e2e/progressions.spec.js -g "P1[12]"` → 2 passed · `grep oklab frontend/src` 0줄 · `grep barAccent|barInk HomePage.*` 0줄 · `grep radius-pill HomePage.module.css` 0줄.
  - `--streak-done` 값은 oklab 혼합(`fill3 34% + paper`)을 다시 계산해 `#CDD7DC`·`#3B403B` 일치 확인. DR-9 정규식은 `in oklab`·`oklch(`·`lab(` 검출, `in srgb`·`--label`·`.tablab(` 미검출 확인.
  - 명세와 다른 점: 정렬 규격의 `isCard` 안내 한 줄은 명세 "§5-4-2 2번"이 아니라 isCard 상호작용 항목이 있는 **§5-4-3 2번**에 넣었다(내용 동일). DS22-6의 "히어로 안" 범위는 `.hero`가 CSS 모듈 해시라 `#go` 폼으로 셌다.
  - **4단계 주니어 검증(2026-11-19 Mac):** 제품 코드 무수정. `node --test test/design_rules.test.js test/r0_core.test.js test/r1_home.test.js` 19 pass · `npm test` 542 pass(58 suites) · `npm run build` 오류 0 · `npx playwright test` 전체 **907 passed (11.8m)** · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` 46 passed · `progressions.spec.js -g "P1[12]"` 2 passed · `grep` 3종 각 0줄 · `check-config-sync.sh`는 로컬 `~/config` 부재로 미실행. 경고 수 `main(1103f0d)` 대비 G5b `282→282`(홈 `0` 유지), G7b `1778→1718`(-60, 홈 증가 없음), A1 `233→233`, G8 `1597→1616`(+19, `.progActs` `space-between` 등). 홈 4폭+다크 Q1~Q9 전부 `○` — [결과/DS2-2](결과/DS2-2.md).
- 다음: 아래 멘트로 주니어 4단계(템플릿 §4)를 시작한다. 그 아래 DS2-1 항목은 이력이다.

```text
# Gemini (주니어) — DS2-2 4단계 최종 검증·문서·PR 마무리
개발산출물/프롬프트_템플릿_4단계.md §4를 따른다. 입력: 개발산출물/명세/DS2-2_구현명세.md(§6·§8·§9), 개발산출물/진행_DS2_디자인전환.md §2·§5, 브랜치 feat/DS2-2-home-fusion 최신 head.
목표: 시니어 구현(홈 스파인·릴리프·버튼 3단계·합산 기본·DR-9·isCard 3px·--streak-done)의 전체 회귀와 홈 스크린샷 검토, 결과 파일·PR·CI를 맞춘다.
기준: 명세 §8 (4단계) 항목, docs/rules/frontend-layout.md 9대 질문(Q1 필 1개·Q7 유채색 위치·Q8 3px·줄눈·스파인·Q9 다크 대비), G5b·G7b·A1·G8 경고 수 main(1103f0d) 대비(홈 G5b 0 유지·홈 G7b 증가 없음, 늘면 요소 목록).
선행 조건: git switch feat/DS2-2-home-fusion && git pull --ff-only, gh 계정 choise-hun 확인. 다른 화면 G1·G6 새 실패 등 새 실패가 나면 원인만 기록하고 시니어 판정 전 단언 완화·skip·known 추가 금지.
범위: npm test·npm run build·npx playwright test 전체·LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js·bash scripts/check-config-sync.sh(없으면 미실행 기록) 실행, 개발산출물/결과/DS2-2.md 작성, 진행 파일 DS2-2 상태 갱신. 제품 코드 수정 금지.
완료 기준: 전체 회귀 새 실패 0, 결과 파일에 명령·출력 끝·4폭+다크 Q1~Q9 표·경고 수 비교, 최신 head CI 통과·리뷰 확인 기록.
Git 처리: docs(ds2) 커밋 → push → main 대상 신규 PR 생성 → gh pr checks --watch → 리뷰 확인. 머지·배포는 하지 않는다.
```
- **DS2-1 0단계 결과(2026-11-19 Mac, Claude 시니어):** 브랜치 `feat/DS2-1-tokens-shell`(origin/main `1f3d201` merge), 커밋 `92cbaf3` docs · `4f4e7e6` feat(design) · `7068a99` feat(shell) · 이후 docs. PR 없음.
  - 표적 검증: `node --test test/design_rules.test.js test/r0_core.test.js test/r1_home.test.js test/r1_settings_notes.test.js test/r3_practice_log.test.js test/cm_ui.test.js test/ch5_progressions.test.js` → pass 64 / fail 0 · `npm run build` 오류 0 · `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/ui-polish.spec.js` → 71 passed(DS3-N1 36개 포함) · `grep radius-block tokens.css` 1줄 · `grep "var(--line)" AppShell.module.css` 0줄.
  - 구현 전 실패 확인: R0-T1(`--bg`), W1-1·W1-6·UP-2(순서), DS21-N1~N4.
  - DR-8은 수동 다크 `--fill2`를 1자리 바꾼 변형으로 실패하는 것을 확인 후 원복.
  - 미실행(4단계 몫): `npm test` 전체, `npx playwright test` 전체(G5b 경고 수 main 대비), `LAYOUT_SHOTS=1` 스크린샷 Q표, `bash scripts/check-config-sync.sh`, 결과 파일 `개발산출물/결과/DS2-1.md`, PR·CI.
- 다음: 아래 멘트로 주니어 4단계(템플릿 §4)를 시작한다.

```text
# Gemini (주니어) — DS2-1 4단계 최종 검증·문서·PR 마무리
개발산출물/프롬프트_템플릿_4단계.md §4를 따른다. 입력: 개발산출물/명세/DS2-1_구현명세.md, 개발산출물/진행_DS2_디자인전환.md §3~§5, 브랜치 feat/DS2-1-tokens-shell 최신 head.
목표: 시니어 구현(토큰 3블록·곡률 가드 일원화·DR-8·AppShell PLAYER 1순위·A안)의 전체 회귀와 스크린샷 검토, 결과 파일·PR·CI를 맞춘다.
기준: 명세 §8 체크리스트 중 (4단계) 항목, docs/rules/frontend-layout.md 스크린샷 9대 질문(위 메뉴·탭 바 Q1·Q4·Q7·Q8·Q9), G5b 경고 수 main 대비(늘면 파일·요소 목록).
선행 조건: git switch feat/DS2-1-tokens-shell && git pull --ff-only, gh 계정 choise-hun 확인. 새 실패가 나면 원인만 기록하고 시니어 판정 전 단언 완화·skip·known 추가 금지.
범위: npm test·npm run build·npx playwright test 전체·LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{privacy,home,practice}.spec.js·bash scripts/check-config-sync.sh 실행, 개발산출물/결과/DS2-1.md 작성, 진행 파일 DS2-1 상태 갱신. 제품 코드 수정 금지.
완료 기준: 전체 회귀 새 실패 0, 결과 파일에 명령·출력 끝·스크린샷 Q표·G5b 비교, 최신 head CI 통과·리뷰 확인 기록.
Git 처리: docs(ds2) 커밋 → push → main 대상 신규 PR 생성 → gh pr checks --watch → 리뷰 확인. 머지·배포는 하지 않는다.
```
