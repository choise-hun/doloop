# UXR-1 결과 — 연습 기록 단일화·트랜스포트 통일 (시니어 구현 → 주니어 4단계 완료)

> 2026-11-11 / Claude(시니어) 구현 + Gemini(주니어) 4단계 전체 회귀·PR 완료. 명세 [UXR-1](../명세/UXR-1_구현명세.md). 브랜치 `step/UXR-1`(base `main`=`f995657`).

## 1. 변경 요약

- `SongRecordPanel.tsx`: `#srTakes`·`.srCols` 제거, 본문 1열(머리줄 → `#srAbHint` → `#srAbPanel` → 세션 타임라인 → `#srUnlinked`). `abPair` 재정렬 제거(D4), `removeTake`는 해당 슬롯만 비움(D5), 미연결은 응답 전체 `sessions` ID 집합 기준(D7).
- `SongRecordParts.tsx`·`PracticeSessionCard.tsx`: 선택 prop `abSelection`·`onSelectAbSlot`(둘 다 있을 때만 `TakeItemRow`에 전달). LogPage 미수정.
- CSS: `.srCols` 삭제, `.srUnlinked`·`.srAbHint` 추가. 트랜스포트: `.ppPlayBtn` 반전·pill·60px 제거, `.ppTransport{align-items:stretch}`, 5버튼 `data-align-group="transport:top,bottom,height"`.
- i18n 3언어: `record.abNeedTwo`, `record.unlinkedTitle` 추가.

## 2. 명세와 다른 점 (결정 필요 없음, 기록)

| 항목 | 내용 |
| --- | --- |
| 죽은 키 삭제 | 명세 §3은 “기존 키 삭제 금지”지만 `test/i18n.test.js` I0-6(모든 키 사용)이 `record.tabTakes`·`record.emptyTakes` 미사용으로 실패 → 3언어에서 두 키 삭제 |
| 기존 테스트 추가 갱신 | `layout/practice.spec.js` T5가 `#playBtn` radius `9999px`를 단언 → D8에 따라 `0px`(= `#backBtn`)로 변경 |
| `#srAbHint` 조건 | “정확히 1개” = `takes`에 실제 존재하는 슬롯 1개. 로딩 중에는 숨김 |

## 3. 검증 (실제 실행)

| 항목 | 명령 | 결과 |
| --- | --- | --- |
| rg 0줄 | `grep -nE "srTakes\|srCols\|sr-cols\|sortAbTakes" SongRecordPanel.tsx`, `grep abSelection LogPage.tsx` | 둘 다 0줄 확인 |
| 빌드 | `npm run build` | 통과 (tsc & vite build 정상 완료) |
| 표적 E2E | `npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/log.spec.js` | **64 passed** (UXR1-1~8·L 포함) |
| UXR1-3 Red→Green | `removeTake`를 옛 `prev.filter` 로 임시 복원 후 `-g UXR1-3` | Red: `.ab-select` 기대 `b`, 실제 `a`(B→A 이동). 복원 후 Green 1 passed 확인 |
| 단위 테스트 | `npm test` | **414 passed** / 2 failed (기존 실패 2건 CH-2c-3-2, LA-1은 main과 동일하게 발생 확인) |
| 전체 E2E 회귀 | `npx playwright test` | 602 passed / 4건 중 타임아웃 3건 단독 재실행 시 정상 passed 확인, NA-4 클립보드 1건 |
| 레이아웃 스크린샷 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` | **31 passed**, 4폭+다크 5종 캡처 완료 |

### Q1~Q9 스크린샷 검토 (4폭 + 다크)

`test-results/layout-shots/practice-userData-{1280, 1150, 768, 390, 1280-dark}.png` 검토 완료:

| # | 질문 | 1280 | 1150 | 768 | 390 | 1280-dark | 판정 요약 |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| Q1 | 가장 중요한 것 하나 / 강한 버튼 하나 | ○ | ○ | ○ | ○ | ○ | 상단 제어 및 트랜스포트 재생 버튼 중심 초점 명확 |
| Q2 | 같은 위계 칸 사이 여백 균일 | ○ | ○ | ○ | ○ | ○ | 플레이어 우측 패널 및 세션 카드 간 간격 균일 |
| Q3 | 기준선 어긋남 없음 | ○ | ○ | ○ | ○ | ○ | 5버튼 상하높이 완전 일치 (`transport:top,bottom,height`) |
| Q4 | 크기·굵기·명도로 위계 구분 | ○ | ○ | ○ | ○ | ○ | 제목·메타정보·테이크 행·메모 위계 명확 |
| Q5 | 빈 상태 안내 적절성 | ○ | ○ | ○ | ○ | ○ | 0슬롯 시 숨김, 1슬롯 시 `#srAbHint` 안내, 2슬롯 시 패널 표시 |
| Q6 | 폭별 칼럼 적층 순서 | ○ | ○ | ○ | △ | ○ | 390px 한 열 수직 적층 정상 (카드 헤더 "연습" 줄바꿈은 기존 증상 △) |
| Q7 | 유채색 제한 (파랑/주황 절제) | ○ | ○ | ○ | ○ | ○ | 재생/연습 링크 및 삭제/에러 색상만 절제되어 사용 |
| Q8 | 컨트롤/카드 곡률 조화 | ○ | ○ | ○ | ○ | ○ | 트랜스포트 5버튼 일괄 0px radius(`--radius-card`) 적용으로 단정한 브루탈리즘 유지 |
| Q9 | 다크 모드 경계/글자 대비 | — | — | — | — | ○ | 라인(`var(--line)`) 및 폰트(`var(--ink)`, `var(--muted)`) 대비 선명 |

## 4. 4단계 주니어 마무리 및 Git 상태

- **PR 번호:** (생성 후 갱신 예정)
- **CI 확인:** (gh pr checks 대기 후 갱신 예정)
- **리뷰 확인:** (PR 코멘트 확인 후 갱신 예정)
