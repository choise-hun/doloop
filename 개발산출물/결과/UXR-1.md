# UXR-1 결과 — 연습 기록 단일화·트랜스포트 통일 (시니어 구현)

> 2026-11-11 / Claude(시니어). 명세 [UXR-1](../명세/UXR-1_구현명세.md). 브랜치 `step/UXR-1`(base `main`=`f995657`). 주니어 4단계(전체 회귀·PR·CI) 인계 전 상태.

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
| rg 0줄 | `grep -nE "srTakes\|srCols\|sr-cols\|sortAbTakes" SongRecordPanel.tsx`, `grep abSelection LogPage.tsx` | 둘 다 0줄 |
| 빌드 | `npm run build` | 통과 |
| 표적 E2E | `npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/log.spec.js` | **64 passed** (UXR1-1~8·L 포함) |
| UXR1-3 Red→Green | `removeTake`를 옛 `prev.filter` 로 임시 복원 후 `-g UXR1-3` | Red: `.ab-select` 기대 `b`, 실제 `a`(B→A 이동). 복원 후 Green 1 passed |
| 단위 | `npm test` | 414 pass / 2 fail. 실패 2건(CH-2c-3-2, LA-1)은 **변경 전 main(stash)에서도 동일 실패** — 이번 변경 무관 |
| 스크린샷 | `LAYOUT_SHOTS=1` practice userData 4폭+다크 | `test-results/layout-shots/practice-userData-*.png` 검토 |

### Q1~Q9 요약(4폭+다크)
1열 유지·가로 넘침 없음, 트랜스포트 5버튼 높이·모양 동일, 비교 영역은 2슬롯일 때만 노출, 테이크 행 줄바꿈 정상. 관찰(범위 밖): 390px에서 세션 카드 헤더 “연습” 링크가 세로로 줄바꿈됨(기존 현상, 별도 제안).

## 4. 주니어 인계 목록 (미실행)

1. `git pull` 후 `step/UXR-1` 확인, 전체 `npm test`(기존 실패 2건은 main과 동일함을 확인)·`npx playwright test` 전체 회귀.
2. push → PR(base main) → `gh pr checks --watch` → 리뷰 코멘트 확인·처리.
3. 진행 파일 §3 UXR-1 상태 갱신, PR 번호·CI 결과 기록.
