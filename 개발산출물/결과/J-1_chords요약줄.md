# 결과 J-1: chords scale 순서 요약 줄 분리

- **진행 파일:** `개발산출물/진행_프론트기반.md`
- **입력:** `개발산출물/명세/J_소작업명세.md` §1
- **근거:** `결과/FT-3-chords_정렬수정.md` §3 사유 ②(Q3 기준선)
- **브랜치·PR:** `step/J-1` → `main`

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| --- | --- | --- |
| 수정 | `frontend/src/pages/ChordsPage.tsx` | scale 탭 `#sc-seq` 안의 `.seqSummary`를 `#sc-seq` 바로 위 형제로 이동하여 요약 상자와 칩 시퀀스를 분리 |
| 신규 | `개발산출물/결과/J-1_chords요약줄.md` | 작업 결과 및 테스트·스크린샷 검증 기록 |
| 수정 | `개발산출물/진행_프론트기반.md` | 단계 표 J-1 상태 칸 갱신 |

---

## 2. 확인 명령 출력

### 2.1 코드 연습실 레이아웃 검사 (`test/e2e/layout/chords.spec.js`)
```
Running 33 tests using 1 worker
  ✓   1 FT chords-scale guest 1280px (589ms)
  ✓   2 FT chords-scale guest 1150px (562ms)
  ✓   3 FT chords-scale guest 768px (582ms)
  ✓   4 FT chords-scale guest 390px (566ms)
  ✓   5 FT chords-scale guest 1280px 다크 (581ms)
  ✓  6~33 tone, matrix, circle, reint, tf, ds, prog 전체 폭 통과
  33 passed (19.0s)
```

### 2.2 전체 단위 테스트 (`npm test`)
```
> guitar-chord-lab@1.0.0 test
> node --test test/*.test.js

ℹ tests 415
ℹ suites 65
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3737.344292
```

### 2.3 프로덕션 빌드 (`npm run build`)
```
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

vite v5.4.11 building for production...
✓ 140 modules transformed.
✓ built in 635ms
```

### 2.4 요약 상자 및 칩 높이 정밀 계측 (Playwright)
```
Width 1280:
  Summary box: { x: 97, y: 602.90625, width: 1086, height: 36.59375 }
  Seq box: { x: 97, y: 653.5, width: 1086, height: 50.09375 }
  Seq y - (Summary y + height): 14
  Unique chip heights: [ 23 ]

Width 390:
  Summary box: { x: 33, y: 663.796875, width: 324, height: 73.78125 }
  Seq box: { x: 33, y: 751.578125, width: 324, height: 104.1875 }
  Seq y - (Summary y + height): 14
  Unique chip heights: [ 23 ]
```
- 1280폭 및 390폭 모두 칩 높이가 23px 단일 값으로 전수 일치(Q3 ○ 달성).
- 요약 상자와 칩 바 사이 간격은 `.pane`의 flex gap인 정확히 14px로 유지되어 G8 간격 스케일 준수.

---

## 3. 스크린샷 검토 (규격 §6, `LAYOUT_SHOTS=1`)

확인 캡처: `chords-scale-guest-1280.png`, `chords-scale-guest-390.png`, `chords-scale-guest-768.png`, `chords-scale-guest-1150.png`, `chords-scale-guest-1280-dark.png`

| 탭 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scale | △ ① | ○ | ○ (이전 △ ② 해결) | ○ | ○ | ○ | ○ | ○ | ○ (1280 다크) |

- **Q3 기준선 (핵심 검증):** 이전에는 flex-wrap 컨테이너인 `#sc-seq` 안에 `.seqSummary`와 칩들이 공존하여 첫째 줄 칩들이 요약 상자 높이(약 36px)로 세로 stretch되어 둘째 줄 칩들과 높이가 불일치했음. 요약 상자를 `#sc-seq` 위 독립 형제로 분리함으로써 첫째 줄을 포함한 모든 칩의 높이가 23px로 완벽히 정렬됨 (Q3 ○).
- **Q4 위계:** 요약 상자가 지판 바로 아래에서 4대 이정표 및 총 스텝 요약을 한 줄로 안내하고, 그 아래에 세부 스텝 칩들이 순서대로 흘러 위계가 한층 더 자연스러워짐.
- **Q6 390 순서:** 좁은 폭에서도 요약 상자가 카드 상단에 독립 박스로 자리잡고, 아래에 칩들이 균일한 크기로 자연스럽게 줄바꿈됨.

---

## 4. 명세와 달라진 점

- `ChordsPage.module.css`: 명세에서 "필요하면 `.seqSummary`에 `margin-bottom`만"으로 제안되었으나, 부모 컨테이너 `.pane`의 flex gap이 14px로 설정되어 있어 요약 상자와 `#sc-seq` 사이의 간격이 정확히 14px(G8 간격 스케일)로 유지되며 시각적 균형도 자연스러워 별도의 CSS 추가/수정 없이 마크업 분리만으로 완결함.

---

## 5. 다음 step에 넘길 것

- 후속 소작업 J-2 (`ChordsPage.tsx:1534-1543` 390 폭에서 tone 탭 지판을 표시 음 위치로 처음 스크롤) 대기.
