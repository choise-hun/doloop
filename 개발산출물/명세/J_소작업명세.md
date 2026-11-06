# J 소작업 명세 — chords 스크린샷 후속 (주니어, 묶음 밖)

- **작성:** 2026-11-06 시니어(Claude) · **권장 effort:** 낮음
- **근거:** `결과/FT-3-chords_정렬수정.md` §3 사유 ②(J-1)·③(J-2). 후보 C(reint 진행 다이어그램 빈 점)는 의도 확인이 먼저라 넣지 않는다
- 둘 다 `CLAUDE.md` "자유" 항목(UI 배치·동작)이라 **방법은 주니어 재량, 완료 기준은 아래 그대로**. 파일 목록 밖은 고치지 않는다
- 한 세션 = 카드 하나, 브랜치 `step/J-1`·`step/J-2`

## 1. J-1 — scale 순서 요약 줄을 칩 흐름에서 분리

| 항목 | 내용 |
| --- | --- |
| 증상 | scale 탭 `#sc-seq`(flex wrap) 안에 긴 요약 상자 `.seqSummary`와 짧은 칩(`5·3 C`)이 같은 줄에 있어, 1280에서 첫 줄 칩이 요약 상자 높이로 늘어난다 |
| 위치 | `frontend/src/pages/ChordsPage.tsx:1080-1099`(`#sc-seq`, 요약은 1082~1086), CSS `ChordsPage.module.css:313-327`(`.seq`·`.seqSummary`) |
| 고칠 방향(추천) | 요약 `div`를 `#sc-seq` **바로 위 형제**로 옮긴다(조건 `scActiveBlockObj &&` 그대로). `#sc-seq` 안에는 칩만. CSS는 필요하면 `.seqSummary`에 `margin-bottom`만 |
| 파일 | `ChordsPage.tsx`, `ChordsPage.module.css`, 결과 `결과/J-1_chords요약줄.md`, 진행 파일 상태 칸 |
| 완료 기준 | ① `npx playwright test test/e2e/layout/chords.spec.js` 실패 0 ② `npm test`(`r2_chords` 포함) 통과 ③ `LAYOUT_SHOTS=1` scale 1280·390: 칩 높이가 모두 같다(Q3 ○), 요약이 칩 위 한 줄 ④ `git diff --stat` = 파일 목록 |
| 금지 | 요약 문구(`scMilestoneSummary`) 계산·내용 변경, 다른 탭 수정 |

## 2. J-2 — 390에서 tone 탭 지판을 표시 음 위치로 처음 스크롤

| 항목 | 내용 |
| --- | --- |
| 증상 | 390에서 tone 탭 지판 상자(`.scroll`, `overflow-x: auto`)가 0~7프렛만 보이고 표시 음(8~19프렛 부근)은 첫 화면 밖 → 빈 지판처럼 보인다 |
| 위치 | `ChordsPage.tsx:1534-1543`(`#tone-board`, `FretboardSvg from={0} to=…`), `FretboardSvg` 기하: `frontend/src/components/chords/ChordDiagrams.tsx:233-245`(왼쪽 여백 `L = 30`, 프렛 폭 `fretW = 44`) |
| 고칠 방향(추천) | `.scroll` 상자에 `ref`, `toneNotes`가 바뀔 때 `useEffect`에서 `scrollWidth > clientWidth`이면 표시 음 중 가장 낮은 프렛의 한 칸 앞이 왼쪽 끝에 오도록 `scrollLeft`를 맞춘다. 사용자가 직접 스크롤한 뒤에는 같은 `toneNotes`에서 다시 움직이지 않는다 |
| 파일 | `ChordsPage.tsx`, 새 e2e `test/e2e/chords_scroll.spec.js`, 결과 `결과/J-2_chords지판스크롤.md`, 진행 파일 상태 칸 |
| 테스트 J2-1 (새 e2e) | 390×800, `STATES.guest`(`test/e2e/support/mock-app.js`)로 `/chords.html#tone` 열기 → `#tone-board`의 부모 `.scroll`의 `scrollLeft > 0`, 그리고 `#tone-board` 안 표시 음 하나 이상이 상자의 보이는 범위 안. legacy 모드면 skip(`#root` 없음 — `test/e2e/layout/settings.spec.js:159`처럼) |
| 테스트 J2-2 | 1280폭에서는 `scrollLeft === 0`(넘치지 않으면 움직이지 않음) |
| 완료 기준 | J2-1·J2-2 통과, `chords.spec.js` 실패 0, `npm test` 통과, tone 390 스크린샷 Q5 ○ |
| 금지 | `FretboardSvg`·`ChordDiagrams.tsx` 수정, matrix·scale 탭 수정(같은 문제가 보이면 결과 파일 "다음에 넘길 것"에 적기만), `scrollIntoView`로 페이지 전체가 움직이게 하는 것 |

- 표시 음 DOM 선택자는 주니어가 `ChordDiagrams.tsx`를 읽고 정한다. 지판 장식(인레이 점)과 구분이 안 되면 멈추고 묻는다
