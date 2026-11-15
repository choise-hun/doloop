# PR-1 결과 — 재생 줄 순서·⏮ 아이콘·대기 시간 바 축소

> 2026-11-15 / 시니어(Claude) 직접 구현 / 브랜치 `feat/PR-1-play-row`(main `835b932`에서 분기). 진행 파일: [진행_재생줄PR](../진행_재생줄PR.md).
> 근거: [결과/M0-0 §4](M0-0_모바일스파이크.md) 4~6, [계획 §4](../../계획/상용_서비스_계획.md). 전체 회귀·PR 생성·CI 대기는 주니어 4단계(§6).

## 1. 배치 약속

| 폭 | 재생 줄 | 반복 줄 |
| --- | --- | --- |
| 390 | `⏮ −5 ▶ +5 저장` 5칸 같은 폭 → ▶가 줄 정가운데. 녹음은 둘째 줄 전체(WF-2 그대로) | 반복 `1fr` · 대기 묶음(선택 + 타이머) 168px 상한 · ✕ 44px |
| 768 (세로 태블릿) | `⏮ −5 ▶ +5 녹음 저장` 6칸(▶ 1.4배 폭). ⏮ 맨 왼쪽, −5·▶·+5가 ⏮과 녹음·저장 사이 | 같음 → 반복 버튼이 남는 폭을 모두 가진다 |
| 1150·1280 | 768과 같음 | 같음(오른쪽 열 360px이라 예전과 거의 같다) |

- 맞춤 그룹: 기존 `transport:top,bottom,height` 유지, 새 `looprow:top,bottom,height`(`loopBtn`·`waitSelect`·`btnWaitTimer`·`clearBtn`).
- DOM 순서도 ⏮이 먼저다(Tab 순서 = 보이는 순서).
- 6칸 폭에서 ▶는 줄의 정가운데가 아니다(오른쪽에 녹음·저장 두 칸). 정가운데가 필요하면 칸 비율을 비대칭으로 바꿔야 해서 이번에는 순서만 맞췄다 — 실기기 확인 때 판단.

## 2. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `frontend/src/pages/PracticePage.tsx` | `#startBtn`을 재생 줄 첫 칸으로 옮기고 글자 `⏮` 대신 인라인 SVG(막대 + 삼각형, `fill="currentColor"`, `aria-hidden`). `aria-label`(`practice.ariaRestartSegment`) 그대로. 반복 줄 4요소에 `data-align-group="looprow:…"` |
| `frontend/src/pages/PracticePage.module.css` | `.ppLoopRow` 열 `1fr 1.6fr 44px` → `minmax(0, 1fr) minmax(0, 168px) 44px`. `.ppStartBtn`(아이콘 가운데 정렬) 추가. 재생 줄 주석 갱신 |
| `test/e2e/layout/practice.spec.js` | PR1-O 4건(순서·⏮ 맨 왼쪽·390 ▶ 정가운데), PR1-I 1건(SVG·글자 없음·currentColor), PR1-W 4건(대기 묶음 ≤168px·태블릿 반복 ≥ 대기×2·높이/윗선 일치). WF2-C 390의 "녹음 왼쪽 = 첫 칸"을 `backBtn` → `startBtn`으로 |

- 아이콘은 공통 컴포넌트가 없어 기존 방식(`PracticeSessionCard.tsx` 공유 아이콘처럼 JSX 인라인 SVG)을 따랐다. 새 파일·라이브러리 없음. 문구 키 변경 없음.

## 3. 실측(반복 버튼 / 대기 묶음 폭, px)

| 폭 | 전 | 후 |
| --- | --- | --- |
| 390 | 103 / 165 | 100 / 168 |
| 768 | 248 / 397 | 478 / 168 |
| 820 | 268 / 429 | 530 / 168 |
| 1150·1280 | 104 / 166 | 102 / 168 |

## 4. 검증 (시니어 실행분)

| 명령 | 결과 |
| --- | --- |
| spec 먼저(구현 전): `npx playwright test test/e2e/layout/practice.spec.js -g "PR1\|WF2-C"` | `7 failed, 6 passed` — PR1-O 4·PR1-I·PR1-W 768·WF2-C 390 실패. PR1-W 390·1150·1280은 원래 상한 안이라 통과 |
| `npm run build` | `✓ built in 1.02s` |
| `npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/ui-polish.spec.js` | `68 passed (1.0m)` (공통 G0~G8 포함) |
| `npx playwright test test/e2e/practice-record.spec.js` | `14 passed` |
| `npm test` | `pass 490, fail 0` |

- 미실행: 전체 `npx playwright test`(주니어 4단계), 실기기(iOS·Android)에서 아이콘이 이모지로 안 그려지는지 사람 확인.

## 5. 스크린샷 검토 (재생 상자·반복 줄, 로그인 상태, 390·768·1150·1280 + 1280 다크)

| 질문 | 판정 |
| --- | --- |
| 재생 줄 버튼 윗선·아랫선·높이 | 4개 폭 모두 일치(UXR1-L·`transport` 그룹) |
| ⏮ 아이콘 | 단색 막대+삼각형, 글자색을 따른다(다크에서 밝게). 이모지 없음 |
| 순서·위계 | ⏮ 왼쪽 끝, ▶가 가장 크다. 390에서 ▶ 정가운데 |
| 반복 줄(768) | 반복 버튼이 넓은 주 행동, 대기 묶음은 데스크톱과 같은 168px. 바가 길어 보이던 문제 해소 |
| 유채색·주 행동 | 변화 없음(어두운 채움은 반복 중 상태 하나) |
| 남는 어색함 | 6칸 폭에서 −5·▶·+5 묶음이 정가운데보다 약간 왼쪽(§1). 390 반복 줄 캡처는 고정 하단 탭 바에 가려 수치(§3·PR1-W)로 확인 |

스크린샷 원본은 세션 임시 폴더라 남지 않는다. 다시 찍으려면 `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js -g "FT practice"`.

## 6. 주니어 4단계 체크

1. `npm run build` → `npm test` → `npx playwright test` 전체 실행
2. `feat/PR-1-play-row` → `main` PR 생성, `gh pr checks --watch` 통과, 리뷰 코멘트 확인·처리
3. 이 파일 §4 아래·진행 파일 §4에 PR 번호·CI 결과 기록, `git mv 개발산출물/진행_재생줄PR.md 개발산출물/완료/` + 완료 줄, `인수인계_메모.md` §2 목록 맞춤, 계획 §4 항목에 PR 번호
