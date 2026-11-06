# 결과 J-2: 390에서 chords tone 탭 지판 첫 스크롤

- **진행 파일:** `개발산출물/진행_프론트기반.md`
- **입력:** `개발산출물/명세/J_소작업명세.md` §2
- **근거:** `결과/FT-3-chords_정렬수정.md` §3 사유 ③(Q5 빈 상태)
- **브랜치·PR:** `step/J-2` → `main`, PR #107

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| --- | --- | --- |
| 수정 | `frontend/src/pages/ChordsPage.tsx` | tone 탭 지판 `.scroll` 상자에 ref 및 사용자 인터랙션 추적을 추가하고, `toneNotes`/`activeTab` 변경 시 `scrollWidth > clientWidth`이면 표시 음 최저 프렛의 한 칸 앞 위치로 자동 스크롤(사용자 직접 스크롤 시 위치 보존) |
| 신규 | `test/e2e/chords_scroll.spec.js` | J2-1(390폭 자동 스크롤 및 표시 음 가시성 검증), J2-2(1280폭 스크롤 0 검증), J2-3(사용자 직접 조작 후 위치 보존 검증) |
| 신규 | `개발산출물/결과/J-2_chords지판스크롤.md` | 작업 결과 및 테스트·스크린샷 검토 기록 |
| 수정 | `개발산출물/진행_프론트기반.md` | 단계 표 J-2 상태 칸 갱신 |

---

## 2. 확인 명령 출력

### 2.1 신규 E2E 테스트 (`test/e2e/chords_scroll.spec.js`)
```
Running 3 tests using 1 worker

  ✓ 1 J2-1: 390폭에서 tone 탭 지판이 표시 음 위치로 처음 스크롤되고 표시 음이 보인다 (585ms)
  ✓ 2 J2-2: 1280폭에서는 지판이 넘치지 않아 scrollLeft === 0 (574ms)
  ✓ 3 J2-3: 사용자가 직접 스크롤한 뒤에는 같은 toneNotes에서 다시 움직이지 않는다 (894ms)

  3 passed (2.5s)
```

### 2.2 코드 연습실 레이아웃 검사 (`test/e2e/layout/chords.spec.js`)
```
Running 33 tests using 1 worker

  ✓   1 FT chords-scale guest 1280px (644ms)
  ✓   2 FT chords-scale guest 1150px (628ms)
  ✓   3 FT chords-scale guest 768px (608ms)
  ✓   4 FT chords-scale guest 390px (711ms)
  ✓   5 FT chords-scale guest 1280px 다크 (611ms)
  ✓   6 FT chords-tone guest 1280px (592ms)
  ✓   7 FT chords-tone guest 1150px (581ms)
  ✓   8 FT chords-tone guest 768px (1.5s)
  ✓   9 FT chords-tone guest 390px (579ms)
  ✓ 10~33 matrix, circle, reint, tf, ds, prog 전체 폭 통과
  33 passed (21.7s)
```

### 2.3 전체 단위 테스트 (`npm test`)
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
ℹ duration_ms 3765.618709
```

### 2.4 프로덕션 빌드 (`npm run build`)
```
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

vite v5.4.11 building for production...
✓ 140 modules transformed.
✓ built in 647ms
```

---

## 3. 스크린샷 검토 (규격 §6, `LAYOUT_SHOTS=1`)

확인 캡처: `chords-tone-guest-390.png`, `chords-tone-guest-768.png`, `chords-tone-guest-1150.png`, `chords-tone-guest-1280.png`

| 탭 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tone | ○ | ○ | ○ | ○ | ○ (이전 △ ③ 해결) | ○ | ○ | ○ | ○ (scale 다크 확인) |

- **Q5 빈 상태 (핵심 검증):** 이전에는 390px 폭에서 지판 상자가 0~7프렛만 보이고 표시 음(기본 Cmaj7 기준 8~19프렛)이 첫 화면 바깥에 위치하여 사용자가 지판을 수동으로 스크롤하기 전까지 텅 빈 지판처럼 보였음. 이번 작업으로 표시 음 중 가장 낮은 프렛(8)의 한 칸 앞인 7번 프렛 시작점(320px)으로 `scrollLeft`가 자동 설정되어, 진입 즉시 8프렛(R)부터 표시 음들이 화면에 온전히 노출됨 (Q5 ○ 달성).
- **사용자 조작 보존:** 사용자가 터치, 마우스 휠 등으로 직접 지판을 스크롤한 경우에는 플래그를 통해 같은 `toneNotes`에서 다시 강제로 스크롤을 덮어쓰지 않고 사용자의 탐색 위치를 유지함. 음 옵션(루트, 퀄리티 등)이 변경되어 `toneNotes`가 바뀌면 다시 새 위치에 맞춰 1회 자동 정렬됨.
- **1280폭 검증:** 1280폭에서는 지판 전체 너비(946px)가 패널 clientWidth 안에 수용되므로 `scrollWidth > clientWidth` 조건이 거짓이 되어 `scrollLeft === 0`으로 유지됨 (J2-2 통과).

---

## 4. 명세와 달라진 점

- 없음. 명세의 권장 방향(기하 수치 `L = 30`, `xL = 56`, `fretW = 44` 기반 계산, 사용자 직접 스크롤 감지 및 보존) 및 금지 사항(`FretboardSvg` 수정 금지, `scrollIntoView` 금지)을 100% 준수함.

---

## 5. 다음 step에 넘길 것

- **matrix 및 scale 등 타 지판 탭 점검:** matrix 탭이나 scale 탭의 특정 포지션에서도 390 폭 진입 시 표시 음이 높은 프렛에만 분포하는 경우 유사한 빈 지판 현상이 있을 수 있음. 이번 J-2는 명세 금지 사항에 따라 tone 탭만 수정하였으므로, 향후 필요 시 동일 패턴(`.scroll` 상자 초기 스크롤) 확장을 검토할 수 있음.
- 소작업 J-1(PR #106 리뷰 대기) 및 J-2 완료. 주니어 프론트 기반 묶음 작업 완료.
