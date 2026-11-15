# 진행 — 플레이어 재생 줄·대기 시간 바 (PR)

> 2026-11-15 착수 / 시니어(Claude). 접두어 `PR-`. [문서 운영](../docs/문서_운영.md)·[협업 §1.2](협업_시니어주니어.md)를 따른다.

## 1. 목표와 근거

- 목표: M0-0 실기기에서 발견한 연습 화면 재생 줄 UI 3건을 웹에서 고친다.
  ① 세로 태블릿 폭에서 반복 옆 대기 시간 바가 지나치게 길다 → 바를 줄이고 반복 버튼을 키운다
  ② 처음으로 `⏮`(U+23EE, `#startBtn`)이 iOS·Android에서 컬러 이모지로 깨진다 → SVG 아이콘으로 바꾼다
  ③ 재생 줄 순서 `−5 · ⏮ · ▶ · +5` → `⏮` 맨 왼쪽 + `−5 · ▶ · +5` 가운데
- 근거: [계획 §4](../계획/상용_서비스_계획.md) "플레이어 재생 줄·대기 시간 바", [결과/M0-0 §4](결과/M0-0_모바일스파이크.md) 4~6, 직전 재생 줄 변경 [결과/WF-2](결과/WF-2.md)
- 승인 범위(2026-11-15 사용자): Step 1개, 시니어 원스톱 구현 → 표적 테스트·커밋·push. 전체 회귀·PR·CI는 주니어 4단계.
- 하지 않는 것: 플레이어 iframe 방식(M1A-2), "크게 보기", 서버·API, 대기 타이머 동작·문구.

## 2. 단계 표

| Step | 담당 | 입력 | 결과 파일 | 완료 기준 | 상태 | effort |
| --- | --- | --- | --- | --- | --- | --- |
| PR-1 재생 줄 순서·⏮ 아이콘·대기 바 축소 | 시니어 직접 구현 → 주니어 4단계(전체 회귀·PR·CI·정리) | 이 파일 §1, [프론트 정렬규격](프론트_정렬규격.md), `PracticePage.tsx`·`PracticePage.module.css` | [결과/PR-1](결과/PR-1.md) | 정렬규격 순서(배치 약속 → spec 실패 → 구현 → spec 통과 → 4개 폭 스크린샷) + 전체 회귀·PR CI 통과 | **시니어 구현·표적 검증 완료, push — 주니어 4단계 대기** | 중(시니어) / 낮음(주니어) |

- PR-1이 마지막 step이다. 주니어 4단계 PR에서 이 파일을 `완료/`로 옮긴다.

## 3. 실행 명령

- 표적: `npm run build && npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/ui-polish.spec.js`
- 스크린샷: `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js -g "FT practice"` (결과는 `test-results/layout-shots/`)
- 전체 회귀(주니어): `npm run build` → `npm test` → `npx playwright test`

## 4. 실행 기록

- PR-1 (2026-11-15): 브랜치 `feat/PR-1-play-row`(main `835b932`에서 분기). spec 먼저 `7 failed` 확인 → 구현 → `practice.spec.js`+`ui-polish.spec.js` 68 passed, `practice-record.spec.js` 14 passed, `npm test` 490 passed. 4개 폭+다크 스크린샷 검토. 상세 [결과/PR-1](결과/PR-1.md) §4·§5. 남은 것: 주니어 4단계(전체 회귀·PR·CI·`완료/` 이동).

## 5. 겪은 문제

- `sips --cropOffset`으로 전체 페이지 캡처를 자르면 위치가 어긋난다 → 요소 스크린샷(`locator.screenshot`)을 임시 spec으로 찍고 지웠다.

## 6. 다음 세션 시작 지시

이 파일과 [결과/PR-1](결과/PR-1.md)을 읽고, 결과 §6의 주니어 4단계 체크를 이어 간다.
