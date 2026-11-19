# 진행 — AS 공용 선택창 전환(나머지 29곳)

- **목표:** 브라우저 기본 `<select>` 29곳을 SL-1의 공용 선택창 `AppSelect`로 바꾼다(SL 요청 ⑤).
- **근거:** [명세/AS_구현명세.md](명세/AS_구현명세.md), 시안 [명세/SL_시안.html](명세/SL_시안.html) D3, [진행_SL_곡목록분류.md](진행_SL_곡목록분류.md) §1 ⑤, 규칙 [frontend-design](../docs/rules/frontend-design.md)·[frontend-layout](../docs/rules/frontend-layout.md)·[frontend-state](../docs/rules/frontend-state.md)·[testing-security](../docs/rules/testing-security.md)
- **분리 이유:** SL은 Step 4개(최대)라 29곳을 화면별로 나누면 상한을 넘는다 → 2026-11-19 시니어가 대기능을 정식으로 분리(옛 SL-3). 주니어 착수 전 조사(`../doloop-sl3` 미커밋 `개발산출물/결과/SL-3.md`)의 차단 6건은 명세 §2에서 정했다.
- **step ID:** `AS-`
- **Git 승인:** 각 Step의 커밋·push·main PR·CI는 프로젝트 규칙의 승인된 단계 처리. 머지는 사용자.

## 1. 단계 표

| Step | 내용 | 담당 | 입력 → 결과 | 완료 기준 | 권장 effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| AS-1 | 코드 화면 21곳(`ChordsPage` 17 · `ProgressionPlayTab` 4) + 공용 헬퍼 `test/e2e/support/app-select.js` | 주니어(4단계 정리) | 명세 §3·§4·§5 → `결과/AS-1.md` | 코드 화면 기존 spec·`layout/chords*.spec.js`·`i18n-lang.spec.js` 통과, 4폭+다크 Q1~Q9, `npm test` | 중간 | 완료(PR #54 머지) |
| AS-2 | `AppSelect` 확장(`id` 선택·`dataAttrs`) + 기록 카드 `.ab-select` | 시니어 직접 → 주니어 4단계 | 명세 §6 → `결과/AS-2.md` | `practice-record`·`community`·`xss`·`layout/practice` spec, 4폭 | 높음 | 대기(SL-2 머지 뒤) |
| AS-3 | 진행 2·운영 1·커뮤니티 2·기록 2 | 주니어(2단계 1차 구현·PR) | AS-1 머지 → `결과/AS-3.md` | 화면별 spec·4폭, `.selectPill` 3px 전환 | 중간 | 1차 구현·검증 완료(PR·시니어 검증 대기) |

## 2. 겪은 문제

- 옛 SL-3 착수 조사: 29곳 한 Step이 약 25파일, `.ab-select`는 `AppSelect` 수정 없이는 계약 유지 불가, `<optgroup>`·`<label>` 래핑·id 없는 카드·필 곡률 차이 → 명세 §2 B1~B6. `<label>` 래핑은 포털이 DOM상 라벨 밖이라 차단이 아니었다(B4).

## 3. 다음 세션 시작 지시

- **AS-1 주니어:** `../doloop-sl3` 워크트리를 그대로 쓰되 브랜치를 `feat/AS-1-chords-select`로 새로 만든다(`git fetch && git switch -c feat/AS-1-chords-select origin/main`, 이 파일이 들어간 main 기준). 미커밋 `개발산출물/결과/SL-3.md`의 29곳 표는 `결과/AS-1.md`의 입력으로만 쓰고 SL-3 이름으로 커밋하지 않는다. 명세 §3 AS-1 파일 + §5 spec만 고친다. `AppSelect.tsx`·`PracticePage.*`·`SongRecordParts.*`·`layout/practice.spec.js`는 건드리지 않는다.
- AS-2는 SL-2 머지 뒤 시니어, AS-3은 AS-1 머지 뒤 주니어.
