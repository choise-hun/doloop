# 진행 — DS2 디자인 전환 (홈 융합 4:6 기조 전 페이지 적용)

- **목표:** 확정 시안(`4:6` + 쿨 라이트 -20% + `▶ PLAYER` A안 + `12px` 계기판)을 토큰·가드·AppShell부터 모든 화면까지 4 Step으로 적용한다.
- **근거:** [계획/디자인_전환_계획](../계획/디자인_전환_계획.md) §1~§3 · [frontend-design](../docs/rules/frontend-design.md)(2026-11-18 개정) · [프론트_정렬규격](프론트_정렬규격.md) v1.8 · [명세/HOME_융합_시안.html](명세/HOME_융합_시안.html) · [자료/DESIGN_하라켄야_수정안](자료/DESIGN_하라켄야_수정안.md) · [협업 §1.2](협업_시니어주니어.md)
- **step ID:** `DS2-1`~`DS2-4`. 테스트 이름 접두어 `DS21-`·`DS22-`…(기존 `shell.spec.js`의 옛 `DS2-N1~N3`와 구별)
- **상태:** DS2-1 명세 승인(2026-11-18) · 0단계 시니어 구현 중

## 1. 단계 표

| 단계 | 범위 | 담당 | 선행 | 입력 파일 | 결과 파일 | 완료 기준 | effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DS2-1 | 토큰 3블록(쿨 라이트·파생 hex·`--radius-block`) + 곡률 가드 일원화·다크 동기화 가드 + AppShell `PLAYER` 1순위·A안 | **[시니어]** 구현·표적 테스트·커밋 2개·push / [주니어] 4단계 전체 회귀·PR·CI·스크린샷·결과 | 명세 승인 | [명세/DS2-1](명세/DS2-1_구현명세.md), 이 파일 | `개발산출물/결과/DS2-1.md` | 명세 §8 체크리스트 전부, 최신 head CI 통과·리뷰 처리 | 높음 | 시니어 구현 중 |
| DS2-2 | 홈 4:6 융합(스파인·릴리프·버튼 3단계·`합산→레퍼런스→분석`·`랜덤 ↻`) | 1단계 명세에서 판정 | DS2-1 PR 머지 | 계획 §2 순서 2, 결과/DS2-1 | `개발산출물/결과/DS2-2.md` | 명세에서 정함 | 높음 | 대기 |
| DS2-3 | Practice·Chords·Log 전환(지판 계열 토큰 D8 판정, `chords.spec.js:44`·`practice.spec.js:361-364` 곡률 단언 갱신) | 1단계 명세에서 판정(Practice/Chords 고위험, Log 격리) | DS2-2 머지 | 계획 §2 순서 3, 결과/DS2-2 | `개발산출물/결과/DS2-3.md` | 명세에서 정함 | 높음 | 대기 |
| DS2-4 | Notes·Progressions·Settings·Profile·Privacy 전환 + 공용 `.ghostBtn`·`.inpField` 블록 전환(D2) + 위 메뉴 글꼴 확인(D11) + 전 화면 Q1~Q9 | 1단계 명세에서 판정 | DS2-3 완료 | 계획 §2 순서 4, 결과/DS2-3 | `개발산출물/결과/DS2-4.md` | 전 화면 4폭+다크 스크린샷 표, `완료/` 이동 | 높음 | 대기 |

## 2. 고정된 결정 (Step 경계를 넘는 것만)

| 날짜 | 결정 | 출처 |
| --- | --- | --- |
| 2026-11-18 | 모바일 탭 바는 순서만 교체(`▶PLAYER · LEARN · TRAILS · [COMMUNITY] · CHORDS · NOTES`), HOME 칸 추가·TRAILS 제거 없음 | 사용자(명세 D1) |
| 2026-11-18 | 공용 `.ghostBtn`·`.inpField` 블록 전환은 DS2-4. DS2-2~3은 화면 CSS 모듈 클래스로 처리 | 사용자(명세 D2) |
| 2026-11-18 | 시안과 규칙이 다르면 규칙 우선: `▶`는 `12px`·`--ink`(시안 `10px`·주황 글자 대신) | 규칙 §1·§3, DR-6 |
| 2026-11-18 | 파생 색은 oklab 산식을 미리 계산한 hex 토큰. 시안의 나머지 파생 토큰은 쓰는 Step에서 3블록에 추가 | 명세 D5·D7 |

## 3. DS2-1 실행 (0단계 시니어 → 4단계 주니어)

1. 브랜치: `git switch -c feat/DS2-1-tokens-shell`(현재 `feat/M1A-3-app-auth` `3705a2c` + 미커밋 DS2 문서에서) → `git merge --no-edit origin/main` → 문서 커밋.
2. 시니어 표적: `node --test test/design_rules.test.js test/r0_core.test.js` · `npx playwright test test/e2e/layout/shell.spec.js`.
3. 주니어 4단계 전체: `npm test` · `npm run build` · `npx playwright test` · `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{privacy,home,practice}.spec.js` → 결과 파일에 위 메뉴·탭 바 Q1·Q4·Q7·Q8·Q9 표, G5b 경고 수 main 대비 · `bash scripts/check-config-sync.sh`.
4. PR(base main) → `gh pr checks --watch` → 리뷰 확인 → 결과·이 파일 갱신.

## 4. 겪은 문제

- (없음)

## 5. 다음 세션 시작 지시

- 사용자가 [명세/DS2-1](명세/DS2-1_구현명세.md)을 승인하면 템플릿 §0(시니어 직접 구현)으로 DS2-1을 시작한다. 이 파일 §3 순서를 따른다.
- 승인 전 수정 요청이 있으면 명세만 고치고 이 표의 상태 칸을 맞춘다.
