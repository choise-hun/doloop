# 진행 — 플레이어 재생 줄·대기 시간 바 (PR)

> **완료 2026-11-15** — 마지막 PR #37

> 2026-11-15 착수 / 시니어(Claude). 접두어 `PR-`. [문서 운영](../../docs/문서_운영.md)·[협업 §1.2](../협업_시니어주니어.md)를 따른다.

## 1. 목표와 근거

- 목표: M0-0 실기기에서 발견한 연습 화면 재생 줄 UI 3건을 웹에서 고친다.
  ① 세로 태블릿 폭에서 반복 옆 대기 시간 바가 지나치게 길다 → 바를 줄이고 반복 버튼을 키운다
  ② 처음으로 `⏮`(U+23EE, `#startBtn`)이 iOS·Android에서 컬러 이모지로 깨진다 → SVG 아이콘으로 바꾼다
  ③ 재생 줄 순서 `−5 · ⏮ · ▶ · +5` → `⏮` 맨 왼쪽 + `−5 · ▶ · +5` 가운데
- 근거: [계획 §4](../../계획/상용_서비스_계획.md) "플레이어 재생 줄·대기 시간 바", [결과/M0-0 §4](../결과/M0-0_모바일스파이크.md) 4~6, 직전 재생 줄 변경 [결과/WF-2](../결과/WF-2.md)
- 승인 범위(2026-11-15 사용자): Step 1개, 시니어 원스톱 구현 → 표적 테스트·커밋·push. 전체 회귀·PR·CI는 주니어 4단계.
- 하지 않는 것: 플레이어 iframe 방식(M1A-2), "크게 보기", 서버·API, 대기 타이머 동작·문구.

## 2. 단계 표

| Step | 담당 | 입력 | 결과 파일 | 완료 기준 | 상태 | effort |
| --- | --- | --- | --- | --- | --- | --- |
| PR-1 재생 줄 순서·⏮ 아이콘·대기 바 축소 | 시니어 직접 구현 → 주니어 4단계(전체 회귀·PR·CI·정리) | 이 파일 §1, [프론트 정렬규격](../프론트_정렬규격.md), `PracticePage.tsx`·`PracticePage.module.css` | [결과/PR-1](../결과/PR-1.md) | 정렬규격 순서(배치 약속 → spec 실패 → 구현 → spec 통과 → 4개 폭 스크린샷) + 전체 회귀·PR CI 통과 | **완료 — PR #37 CI 통과(`f25d902`), 사용자 머지 대기** | 중(시니어) / 낮음(주니어) |

- PR-1이 마지막 step이다. 주니어 4단계 PR에서 이 파일을 `완료/`로 옮긴다.

## 3. 실행 명령

- 표적: `npm run build && npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/ui-polish.spec.js`
- 스크린샷: `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js -g "FT practice"` (결과는 `test-results/layout-shots/`)
- 전체 회귀(주니어): `npm run build` → `npm test` → `npx playwright test`

## 4. 실행 기록

- PR-1 (2026-11-15): 브랜치 `feat/PR-1-play-row`(main `835b932`에서 분기). spec 먼저 `7 failed` 확인 → 구현 → `practice.spec.js`+`ui-polish.spec.js` 68 passed, `practice-record.spec.js` 14 passed, `npm test` 490 passed. 4개 폭+다크 스크린샷 검토. 상세 [결과/PR-1](../결과/PR-1.md) §4·§5. 남은 것: 주니어 4단계(전체 회귀·PR·CI·`완료/` 이동).
- PR-1 주니어 4단계 (2026-11-15): 로컬 `npm run build` (`858ms`) → `npm test` (`490 passed`) → `npx playwright test` (`870 passed`) 전체 통과. PR [#37](https://github.com/choise-hun/doloop/pull/37) 생성(`13e194f`), Codex 리뷰 코멘트 확인(findings 없음). 단, CI `E2E XSS & CSP (Playwright, spa)`에서 `test/e2e/cm-ui.spec.js:433` `CUI-11` 1건 실패(869 passed). PR-1 코드 변경 없이 원인만 [결과/PR-1](../결과/PR-1.md) §4에 기록하고 시니어에게 인계.

- PR-1 시니어 CI 수정 (2026-11-15): CUI-11에 신고 POST `waitForResponse`(클릭 전 등록) 추가 → `cm-ui.spec.js` 61 passed, CUI-11 20회 반복 통과. `f25d902` push → PR #37 CI 전체 통과(Kotlin skip). 리뷰 지적 없음. 상세 [결과/PR-1](../결과/PR-1.md) §4.

## 5. 겪은 문제

- `sips --cropOffset`으로 전체 페이지 캡처를 자르면 위치가 어긋난다 → 요소 스크린샷(`locator.screenshot`)을 임시 spec으로 찍고 지웠다.
- PR #37 CI에서 `test/e2e/cm-ui.spec.js:433` `CUI-11` 실패(`reportBody`가 `null`): `470`행 submit 클릭 직후 응답/요청 대기 없이 `472`행에서 즉시 `expect(reportBody)`를 검사하는 기존 테스트 레이스. 주니어 4단계 범위(코드 무수정)에 따라 원인만 기록 → 시니어가 클릭 전 `waitForResponse` 등록으로 수정(`f25d902`).

## 6. 다음 세션 시작 지시

작업 완료. 남은 것은 사용자의 PR #37 머지뿐이다.
