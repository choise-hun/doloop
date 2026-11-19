# 진행 — DS2 디자인 전환 (홈 융합 4:6 기조 전 페이지 적용)

- **목표:** 확정 시안(`4:6` + 쿨 라이트 -20% + `▶ PLAYER` A안 + `12px` 계기판)을 토큰·가드·AppShell부터 모든 화면까지 4 Step으로 적용한다.
- **근거:** [계획/디자인_전환_계획](../계획/디자인_전환_계획.md) §1~§3 · [frontend-design](../docs/rules/frontend-design.md)(2026-11-18 개정) · [프론트_정렬규격](프론트_정렬규격.md) v1.8 · [명세/HOME_융합_시안.html](명세/HOME_융합_시안.html) · [자료/DESIGN_하라켄야_수정안](자료/DESIGN_하라켄야_수정안.md) · [협업 §1.2](협업_시니어주니어.md)
- **step ID:** `DS2-1`~`DS2-4`. 테스트 이름 접두어 `DS21-`·`DS22-`…(기존 `shell.spec.js`의 옛 `DS2-N1~N3`와 구별)
- **상태:** DS2-1 완료(PR #44 머지, main `1103f0d`). DS2-2 완료(PR [#45](https://github.com/choise-hun/doloop/pull/45) 머지 2026-11-18T17:14:44Z, main `44af6c3`). DS2-3 PR [#46](https://github.com/choise-hun/doloop/pull/46)(head `488154d`) **로컬 전체 회귀(`542` + `932 passed`) 및 최신 CI 통과 / 머지 대기**

## 1. 단계 표

| 단계 | 범위 | 담당 | 선행 | 입력 파일 | 결과 파일 | 완료 기준 | effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DS2-1 | 토큰 3블록(쿨 라이트·파생 hex·`--radius-block`) + 곡률 가드 일원화·다크 동기화 가드 + AppShell `PLAYER` 1순위·A안 | **[시니어]** 구현·표적 테스트·커밋 2개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 | 명세 승인 | [명세/DS2-1](명세/DS2-1_구현명세.md), 이 파일 | [결과/DS2-1](결과/DS2-1.md) | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | **완료** (PR [#44](https://github.com/choise-hun/doloop/pull/44) 머지, main `1103f0d`) |
| DS2-2 | 홈 4:6 융합(스파인·릴리프·버튼 3단계·`합산→레퍼런스→분석`·`랜덤 ↻`) | **[시니어]** 구현·표적 테스트·커밋 3개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 | DS2-1 PR 머지(완료) | [명세/DS2-2](명세/DS2-2_구현명세.md), 이 파일 | [결과/DS2-2](결과/DS2-2.md) | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | **완료** (PR [#45](https://github.com/choise-hun/doloop/pull/45) 머지, main `44af6c3`) |
| DS2-3 | Practice·Chords·Log 전환(스파인·릴리프·3px·버튼 3단계, 지판 토큰 D8 미변경 추천, `chords.spec.js:44`·`practice.spec.js:361-364` 곡률 단언 `3px` 교체) — 파일 8개(CSS 5·spec 3, TSX 0), 단일 Step·화면별 커밋 3개 추천 | **[시니어]** 구현·표적 테스트·커밋 4개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 (Log는 격리 — 분할 대안 시 주니어 가능) | DS2-2 머지(완료) + 명세 승인 | [명세/DS2-3](명세/DS2-3_구현명세.md), [시안](명세/DS2-3_시안.html), 이 파일 | [결과/DS2-3](결과/DS2-3.md) | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | **CI 통과/머지 대기** (PR [#46](https://github.com/choise-hun/doloop/pull/46), head `488154d`) |
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
| 2026-11-19 | DS2-3 명세 §9 5건 모두 추천안 승인: ① 단일 Step·[시니어]·화면별 커밋 3개(파일 8, TSX 0) ② 스파인 화면별 1색(Practice `fill2`·Chords `fill3`·Log `fill1`) ③ Practice 트랜스포트 6버튼 같은 3px(UXR-1 D8 유지, 영상 있을 때 필 0) ④ 지판 계열 토큰 미변경 ⑤ 넓은 탭 선택 = 종이 + 2px 먹색 밑줄 | 사용자(DS2-3 §9) |
| 2026-11-19 | DS2-3 추가 요구: Chords 지판의 음 원이 칸(프렛 사이·줄 위) 중앙에 있는지 테스트로 전부 검사(시안 모형에서 어긋난 원이 보였음) → `chords.spec.js` DS23-C5 | 사용자(DS2-3 승인 답변) |
| 2026-11-19 | DS23-C5에서 개방현(너트 바깥) 원만 칸 중앙에서 2~3px 어긋남 발견 → `ChordDiagrams.tsx` 2줄 수정 허용(TSX 0 → 1, 파일 8 → 9) | 사용자(구현 중 질문, 추천안) |

## 3. DS2-1 실행 (0단계 시니어 → 4단계 주니어)

1. 브랜치: `git switch -c feat/DS2-1-tokens-shell`(현재 `feat/M1A-3-app-auth` `3705a2c` + 미커밋 DS2 문서에서) → `git merge --no-edit origin/main` → 문서 커밋.
2. 시니어 표적: `node --test test/design_rules.test.js test/r0_core.test.js` · `npx playwright test test/e2e/layout/shell.spec.js`.
3. 주니어 4단계 전체: `npm test` · `npm run build` · `npx playwright test` · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{privacy,home,practice}.spec.js` → 결과 파일에 위 메뉴·탭 바 Q1·Q4·Q7·Q8·Q9 표, G5b 경고 수 main 대비 · `bash scripts/check-config-sync.sh`.
4. PR(base main) → `gh pr checks --watch` → 리뷰 확인 → 결과·이 파일 갱신.

## 4. 겪은 문제

- **DS2-1 폭 회귀(명세 §9 주의 1) → 사용자 결정으로 해결:** `DS3-N1 guest 961px` 실패 — 위 메뉴 두 줄(높이 88px). 실측(로컬 Mac Chromium): 961px 안쪽 폭 929px, 필요 931.9px → 2.9px 부족(964px부터 한 줄, user 961px 여유 25px, 821~960px은 §5-4 값으로 통과). 원인: `.navPlayer` 프레임 약 +26px. **사용자 선택(2026-11-18): 961~1000px에서 `.navPlayer`만 `padding: 2px 6px; gap: 3px`**(다른 간격 불변). DS3-N1에 `1000`·`1001`px 추가 → 통과. CI(Linux 글꼴)에서 폭이 달라 다시 실패하면 같은 기록 방식으로 묻는다.
- **접근 이름 측정:** Playwright 1.51 `getByRole({ name })`은 `content: "▶" / ""` 대체 텍스트를 지원하지 않아 이름을 `▶" / " PLAYER`로 계산한다. Chromium 실제 접근성 트리(CDP `Accessibility.getPartialAXTree`)는 `PLAYER` → DS21-N1·N2는 CDP 값으로 `PLAYER` 정확히 일치를 단언한다(기대값 동일).

## 5. 다음 세션 시작 지시

- **DS2-3 0단계 결과(2026-11-19 Mac, Claude 시니어):** 브랜치 `feat/DS2-3-practice-chords-log`(main `44af6c3`에서), 커밋 `d630ebf` docs(명세·시안·이 파일·승인 기록) · `85768d2` feat(practice) · `ff75ce8` feat(chords) · `7ab9691` feat(log) · 이후 docs(이 기록). PR 없음. 파일 9개(CSS 5·spec 3·`ChordDiagrams.tsx` 1).
  - **주의:** Playwright 서버(`node server.js`)는 `dist/`를 서빙한다 → CSS·TSX를 고친 뒤 `npm run build` 없이 돌리면 옛 화면으로 검사된다.
  - 구현 전 실패 확인(Red, main CSS 빌드): `npx playwright test test/e2e/layout/practice.spec.js -g "DS23|T5 \(UI-3\)"` → 5 failed(T5 `0px`≠`3px`, DS23-P1 왼쪽 테두리 `1px`, P2 필 10여 개, P3 입력 `9999px`, P4 다크 스파인) · `chords.spec.js -g "DS23|CH-A"` → 18 failed / 4 passed(CH-A 4폭 `0px`, DS23-C1~C4, C5 개방현 있는 10건) · `log.spec.js -g "DS23"` → 3 failed(L1 `1px`, L2 `0px`, L3 다크).
  - DS23-C5(사용자 추가 요구) 측정: 15개 경우(기타 7탭 + 진행 선택·재해석 개방현 입력·왼손·CAGED·확대 최대, 베이스 scale·tone)의 모든 `svg.fb`·`svg.cb` 원을 렌더 좌표로 비교(±0.5px). **프렛 칸 안 원·인레이·코드 박스 원은 수정 전부터 전부 중앙.** 개방현 원만 NeckSvg `-2.17px`(`L + OW/2 - 2`), FretboardSvg `-3px`(`L + 10`, 칸 중앙 `L + 13`) 어긋남 → 사용자 결정으로 두 줄을 칸 중앙으로 수정.
  - 표적 Green: `node --test test/design_rules.test.js test/r2_chords.test.js test/r3_practice_log.test.js` → pass 24 / fail 0 · `npm run build` 오류 0 · `practice.spec.js` → **71 passed**(layoutSuite G 실패 0 — 명세 §9 주의 1·2 해당 없음, padding 축소 안 함) · `chords.spec.js chords_instruments.spec.js` → **126 passed** · `log.spec.js` → **23 passed**(known 1건 그대로) · TSX 영향 확인 `chords_caged·chords_instruments·chords_scroll·progression-play.spec.js` → 12 passed · `grep oklab|oklch frontend/src` → `tokens.css:68` 주석 1줄뿐(기존).
  - 명세와 다른 점: ① TSX 1개 수정(위, 사용자 결정) ② 체크리스트 "Chords `radius-pill`은 `.playbtn` 1곳만" → 사용처 0인 `.mini`(§1 비범위)가 남아 2곳 ③ DS23-C3: 찾기 탭 재생 `#a-vplay`는 검색 결과 패널에만 있어 검색 전 0개·`#a-go` 뒤 1개, 진행 연주 빈 상태는 재생 버튼이 없어 0개·진행(`?c=C,G,Am,F`)을 받은 뒤 `#pp-play` 1개로 둘 다 단언 ④ DS23-P1 곡 기록 카드는 첫 `.panel`이 숨은 `#srAbPanel`이라 `#songRecord .panel:visible`로 찾음 ⑤ DS23-P2 필 0개 범위는 `.playerWrap` 전체(머리 막대 부모) ⑥ Practice `.ppDriveBtn`·`.ppRecPopClose`·Chords `.ccStep`도 표대로 3px.
  - **4단계 주니어 검증(2026-11-19 Mac):** 제품 코드 무수정. `npm run build` 오류 0 · `node --test test/design_rules.test.js test/r2_chords.test.js test/r3_practice_log.test.js` 24 pass · `npm test` 542 pass(58 suites) · `npx playwright test` 전체 **932 passed (14.1m)** · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{practice,chords,log}.spec.js` **163 passed (2.1m)** · `grep`/`git diff --stat` 기준 충족 · `check-config-sync.sh`는 로컬 `/Users/seokhunchoi/config` 부재로 미실행. 경고 수 `main(44af6c3)` 대비 G5b `282→282`(practice 14·chords 38·chords_instruments 8·log 0), G7b `1718→1718`(practice 66·chords 451·chords_instruments 326·log 48), A1 `233→233`, G8 `1616→1612`(-4), `known` 8건 기존 동일. 세 화면 4폭+다크 Q1~Q9 전부 `○` — [결과/DS2-3](결과/DS2-3.md).
  - **PR #46 CI·리뷰 확인:** head `f520879`, `chatgpt-codex-connector` 리뷰 `has_any_findings: false`·인라인/사람 리뷰 0건. 단, CI [Run #44367854341](https://github.com/choise-hun/doloop/actions/runs/44367854341) `E2E XSS & CSP (Playwright, spa)`에서 `chords.spec.js:191` (`DS23-C3` `'tf 검색 전'`) 1건 실패(`[]` 기대 vs `["a-vplay"]` 수신 — `#tab-tf` 클릭 시 이미 검색 결과 `#a-vplay`가 렌더됨). 단언 완화·수정 없이 시니어 판정 대기.
  - **시니어 3-P 판정(2026-11-19):** 찾기 탭은 진입 시 `runTfSearch()` 자동 실행(20ms 타이머, main CH-B부터) → "검색 전 0개"는 비결정 상태. 위 ③의 `검색 전 0개` 단언을 삭제하고 자동 검색 결과 `#a-vplay` 표시 대기 → `#a-go` 재검색 → 필 1개로 수정(제품 코드 미변경). 로컬 DS23-C3 ×5 passed, chords 레이아웃 69 passed. 상세는 [결과/DS2-3](결과/DS2-3.md).
  - **4단계 최종 재확인(2026-11-19 Mac, head `488154d`):** 시니어 3-P 수정이 `ChordsPage.tsx:945,988,992-994` 계약과 일치함을 확인하고 제품 코드·spec 무수정으로 전체 회귀 재실행 완료(`npm run build` 오류 0 · `npm test` 542 pass · `npx playwright test` **932 passed (14.3m)**, 경고 수 `G5b 282 · G7b 1718 · A1 233 · G8 1612 · known 8` 직전 동일). PR [#46](https://github.com/choise-hun/doloop/pull/46) 최신 CI([Run #44374419609](https://github.com/choise-hun/doloop/actions/runs/44374419609)) **전부 통과**(`CI ok` 포함 5 successful, `Kotlin test` skipped), `chatgpt-codex-connector` 리뷰 `has_any_findings: false` 및 인라인/사람 리뷰 0건 — [결과/DS2-3](결과/DS2-3.md).
  - 다음: PR #46 머지 후 시니어에게 **DS2-4(Notes·Progressions·Settings·Profile·Privacy 전환 + 공용 `.ghostBtn`·`.inpField` 블록 전환 + 마감)** 1단계 세부 명세 작성을 인계한다.

```text
# Gemini (주니어) — DS2-3 4단계 최종 검증·문서·PR 마무리
개발산출물/프롬프트_템플릿_4단계.md §4를 따른다. 입력: 개발산출물/명세/DS2-3_구현명세.md(§5·§6·§8·§9), 개발산출물/진행_DS2_디자인전환.md §2·§5(DS2-3 0단계 결과), 브랜치 feat/DS2-3-practice-chords-log 최신 head.
목표: 시니어 구현(Practice·Chords·Log 스파인·3px·필 수·탭 밑줄, 개방현 원 칸 중앙 TSX 2줄)의 전체 회귀와 세 화면 스크린샷 검토, 결과 파일·PR·CI를 맞춘다.
기준: 명세 §8 (4단계) 항목, §5 필 수 표, docs/rules/frontend-layout.md 9대 질문(Q1·Q7·Q8·Q9), G5b·G7b·A1·G8 경고 수 main(44af6c3) 대비(practice·chords·log G5b·G7b 증가 없음, 늘면 요소 목록).
선행 조건: git switch feat/DS2-3-practice-chords-log && git pull --ff-only, gh 계정 choise-hun 확인, 테스트 전에 npm run build(서버가 dist/ 서빙). 새 실패가 나면 원인만 기록하고 시니어 판정 전 단언 완화·skip·known 추가 금지.
범위: npm test·npm run build·npx playwright test 전체·LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{practice,chords,log}.spec.js·bash scripts/check-config-sync.sh(없으면 미실행 기록) 실행, 개발산출물/결과/DS2-3.md 작성, 진행 파일 DS2-3 상태 갱신. 제품 코드 수정 금지.
완료 기준: 명세 §8 전부 체크, 결과 파일에 경고 수 표·Q1~Q9 표, PR(base main) 최신 head CI 통과·리뷰 확인 기록.
Git 처리: docs 커밋·push, main 대상 신규 PR 생성, gh pr checks --watch, 리뷰 확인. 머지·배포는 하지 않는다.
```

- **DS2-3 1단계 명세(2026-11-19 Mac, Claude 시니어):** PR #45 머지 확인(`gh pr view 45` → `MERGED`, main `44af6c3`) 후 main pull, 브랜치 `feat/DS2-3-practice-chords-log` 생성(커밋 없음). 작성: [명세/DS2-3](명세/DS2-3_구현명세.md)(전제 P1~P18, D1~D14, 파일 8개, 테스트 DS23-P1~P4·C1~C4·L1~L3), [시안](명세/DS2-3_시안.html)(테마·D3·D6·D9 선택지 전환). 코드·테스트 수정·실행 없음.
  - 사용자 승인 요청 5건(명세 §9): ① 단일 Step·[시니어](대안: 3a/3b 분할 + DS2-4 상위 분리) ② 스파인 색 화면별 1색(Practice `fill2`·Chords `fill3`·Log `fill1`) ③ Practice ▶ 6버튼 같은 3px(UXR-1 D8 유지) ④ 지판 토큰 미변경 ⑤ 넓은 탭 선택 = 종이 + 밑줄.
  - 다음: 승인되면 같은 브랜치에서 0단계 시니어 구현(명세 §7 순서, 커밋 ①~④, push까지). 승인 내용이 추천안과 다르면 명세 D표·§4·§6을 먼저 고친다.
- **DS2-2 0단계 결과(2026-11-19 Mac, Claude 시니어):** 브랜치 `feat/DS2-2-home-fusion`(main `1103f0d`에서), 커밋 `a8a94d6` docs(명세·이 파일) · `59c60c6` feat(design) 가드 · `85cc36f` feat(home) · 이후 docs(이 기록). PR 없음. 파일은 명세 §3의 11개만(제품 6·테스트/검사기 3·규칙 문서 2).
  - 구현 전 실패 확인: `node --test test/design_rules.test.js` → DR-8 실패(`--streak-done` 없음) · `npx playwright test test/e2e/layout/home.spec.js -g "DS22|UIUX-R"` → 9 failed(UIUX-R T1, DS22-1~8).
  - 표적 검증: `node --test test/design_rules.test.js test/r0_core.test.js test/r1_home.test.js` → pass 19 / fail 0 · `npm run build` 오류 0 · `npx playwright test test/e2e/layout/home.spec.js` → 46 passed(layoutSuite G 실패 0 — `isCard` 3px 변경 뒤에도 G1·G6 실패 없음, 명세 §9 주의 1·2 해당 없음) · `npx playwright test test/e2e/progressions.spec.js -g "P1[12]"` → 2 passed · `grep oklab frontend/src` 0줄 · `grep barAccent|barInk HomePage.*` 0줄 · `grep radius-pill HomePage.module.css` 0줄.
  - `--streak-done` 값은 oklab 혼합(`fill3 34% + paper`)을 다시 계산해 `#CDD7DC`·`#3B403B` 일치 확인. DR-9 정규식은 `in oklab`·`oklch(`·`lab(` 검출, `in srgb`·`--label`·`.tablab(` 미검출 확인.
  - 명세와 다른 점: 정렬 규격의 `isCard` 안내 한 줄은 명세 "§5-4-2 2번"이 아니라 isCard 상호작용 항목이 있는 **§5-4-3 2번**에 넣었다(내용 동일). DS22-6의 "히어로 안" 범위는 `.hero`가 CSS 모듈 해시라 `#go` 폼으로 셌다.
  - **4단계 주니어 검증(2026-11-19 Mac):** 제품 코드 무수정. `node --test test/design_rules.test.js test/r0_core.test.js test/r1_home.test.js` 19 pass · `npm test` 542 pass(58 suites) · `npm run build` 오류 0 · `npx playwright test` 전체 **907 passed (11.8m)** · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` 46 passed · `progressions.spec.js -g "P1[12]"` 2 passed · `grep` 3종 각 0줄 · `check-config-sync.sh`는 로컬 `~/config` 부재로 미실행. 경고 수 `main(1103f0d)` 대비 G5b `282→282`(홈 `0` 유지), G7b `1778→1718`(-60, 홈 증가 없음), A1 `233→233`, G8 `1597→1616`(+19, `.progActs` `space-between` 등). 홈 4폭+다크 Q1~Q9 전부 `○` — [결과/DS2-2](결과/DS2-2.md). PR [#45](https://github.com/choise-hun/doloop/pull/45)(head `67c5174`) CI 통과([Run #44353106684](https://github.com/choise-hun/doloop/actions/runs/44353106684)), `chatgpt-codex-connector` 리뷰 `has_any_findings: false`, 인라인/사람 리뷰 0건.
- 다음: PR #45 머지 후 시니어에게 **DS2-3(Practice·Chords·Log 전환)** 1단계 세부 명세 작성을 인계한다. 그 아래 DS2-1 항목은 이력이다.

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
