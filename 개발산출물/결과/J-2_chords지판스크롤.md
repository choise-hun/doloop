# 결과 J-2: 390에서 chords tone 탭 지판 첫 스크롤

- **진행 파일:** `개발산출물/진행_프론트기반.md`
- **입력:** `개발산출물/명세/J_소작업명세.md` §2
- **근거:** `결과/FT-3-chords_정렬수정.md` §3 사유 ③(Q5 빈 상태)
- **브랜치·PR:** `step/J-2` → `main`, PR #107

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| --- | --- | --- |
| 수정 | `frontend/src/pages/ChordsPage.tsx` | tone 탭 지판 `.scroll` 상자에 `toneScrollRef`를 연결하고, `activeTab === 'tone'` 및 `toneNotes` 변경 시 `scrollWidth > clientWidth`이면 표시 음 최저 프렛 한 칸 앞 위치로 자동 스크롤(리뷰 1번 반영: 불필요한 추적 플래그·핸들러 삭제하고 의존성 배열로 단순화) |
| 신규 | `test/e2e/chords_scroll.spec.js` | J2-1(390폭 자동 스크롤 및 표시 음 가시성 검증), J2-2(1280폭 스크롤 0 검증), J2-3(탭 전환 후 복귀 시 표시 음 가시성 검증 — 리뷰 2번 반영) |
| 수정 | `개발산출물/주니어_체크리스트.md` | 리뷰 1번(불필요한 effect 보호 플래그 남발 금지) 및 2번(구현 제거 시 실패할 수 있는 유효 단언 검증) 일반화 규칙 추가 |
| 신규 | `개발산출물/결과/J-2_chords지판스크롤.md` | 작업 결과 및 테스트·스크린샷 검토 기록 |
| 수정 | `개발산출물/진행_프론트기반.md` | 단계 표 J-2 상태 칸 갱신 |

---

## 2. 확인 명령 출력

### 2.1 사전 검증: 새 J2-3 테스트 (1번 수정 전 코드)
```
Running 1 test using 1 worker
  ✓ 1 chords_scroll.spec.js:55:1 › J2-3: 탭을 떠났다 돌아와도 표시 음이 보인다 (655ms)
  1 passed (1.1s)
```
- 사전 확인 결과: Chromium에서는 패널이 `hidden`(`display: none`) 상태가 되어도 내부적으로 `scrollLeft` 값을 브라우저가 유지하고 있음을 확인했습니다. 다만 타 브라우저나 리셋 발생 시 플래그가 남아있으면 빈 지판이 노출될 수 있으므로, 1번 수정대로 플래그를 제거하고 의존성 배열에 의존하도록 리팩터링했습니다.

### 2.2 신규 E2E 테스트 (`test/e2e/chords_scroll.spec.js`)
```
Running 3 tests using 1 worker

  ✓ 1 J2-1: 390폭에서 tone 탭 지판이 표시 음 위치로 처음 스크롤되고 표시 음이 보인다 (610ms)
  ✓ 2 J2-2: 1280폭에서는 지판이 넘치지 않아 scrollLeft === 0 (533ms)
  ✓ 3 J2-3: 탭을 떠났다 돌아와도 표시 음이 보인다 (646ms)

  3 passed (2.2s)
```

### 2.3 코드 연습실 레이아웃 검사 (`test/e2e/layout/chords.spec.js`)
```
Running 33 tests using 1 worker

  ✓   1 FT chords-scale guest 1280px (558ms)
  ✓   2 FT chords-scale guest 1150px (547ms)
  ✓   3 FT chords-scale guest 768px (564ms)
  ✓   4 FT chords-scale guest 390px (583ms)
  ✓   5 FT chords-scale guest 1280px 다크 (582ms)
  ✓   6 FT chords-tone guest 1280px (532ms)
  ✓   7 FT chords-tone guest 1150px (580ms)
  ✓   8 FT chords-tone guest 768px (565ms)
  ✓   9 FT chords-tone guest 390px (583ms)
  ✓ 10~33 matrix, circle, reint, tf, ds, prog 전체 폭 통과
  33 passed (20.7s)
```

### 2.4 전체 단위 테스트 (`npm test`)
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
ℹ duration_ms 3757.527583
```

### 2.5 프로덕션 빌드 (`npm run build`)
```
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

vite v5.4.11 building for production...
✓ 140 modules transformed.
✓ built in 641ms
```

---

## 3. 스크린샷 검토 (규격 §6, `LAYOUT_SHOTS=1`)

확인 캡처: `chords-tone-guest-390.png`, `chords-tone-guest-768.png`, `chords-tone-guest-1150.png`, `chords-tone-guest-1280.png`

| 탭 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tone | ○ | ○ | ○ | ○ | ○ (이전 △ ③ 해결) | ○ | ○ | ○ | ○ (scale 다크 확인) |

- **Q5 빈 상태 (핵심 검증):** 390px 폭에서 지판 상자가 0~7프렛만 보이고 표시 음(기본 Cmaj7 기준 8~19프렛)이 첫 화면 바깥에 위치하여 사용자가 지판을 수동으로 스크롤하기 전까지 텅 빈 지판처럼 보이던 문제 해결. 표시 음 중 가장 낮은 프렛(8)의 한 칸 앞인 7번 프렛 시작점(320px)으로 `scrollLeft`가 자동 설정되어, 진입 즉시 8프렛(R)부터 표시 음들이 화면에 온전히 노출됨 (Q5 ○ 달성).
- **의존성 배열을 통한 위치 보존:** 재생 토글이나 박자 이동(`toneIdx`) 등 빈번한 리렌더링 시에도 effect의 의존성인 `[activeTab, toneNotes]`가 불변이므로 불필요한 재스크롤이 발생하지 않으며, 음 옵션(루트, 퀄리티 등)이 변경되어 `toneNotes`가 바뀌거나 탭을 복귀할 때만 안전하게 재계산됨.
- **1280폭 검증:** 1280폭에서는 지판 전체 너비(946px)가 패널 clientWidth 안에 수용되므로 `scrollWidth > clientWidth` 조건이 거짓이 되어 `scrollLeft === 0`으로 유지됨 (J2-2 통과).

---

## 4. 명세와 달라진 점

- **사용자 스크롤 추적 플래그 및 핸들러 삭제 (리뷰 1번 반영):** 명세의 "사용자가 직접 스크롤한 뒤에는 같은 toneNotes에서 다시 움직이지 않는다"를 위해 1차 구현 시 추적 ref 3개와 이벤트 핸들러 5개를 두었으나, `useEffect`의 의존성 배열(`[activeTab, toneNotes]`)만으로도 리렌더 시 effect 재실행이 방지되어 동일 음 상태에서의 위치가 자연스럽게 보존됨을 확인했습니다. 반면 플래그를 둘 경우 탭 전환 후 복귀 시 브라우저/DOM 상태에 따라 발생할 수 있는 빈 지판 재발 위험이 있어, 추적 플래그들을 완전히 삭제하고 의존성 배열 기반으로 단순화했습니다.
- **J2-3 테스트 교체 (리뷰 2번 반영):** 기존의 vacuous pass 위험이 있던 재생 버튼 클릭 검증을 삭제하고, 탭을 떠났다가 복귀했을 때도 표시 음이 정상적으로 보이는지 검증하는 테스트로 교체했습니다.

---

## 5. 다음 step에 넘길 것

- **회전·리사이즈 (리뷰 3번):** 현재 effect는 뷰포트 크기 변화(resize/orientationchange)에는 반응하지 않아, 390px 세로에서 가로 모드로 전환되거나 창 크기가 실시간 변경될 때의 재조정은 포함되어 있지 않음. 소작업 범위 밖이므로 후속 정렬 또는 화면 개편 작업 시 필요에 따라 검토.
- **matrix 및 scale 등 타 지판 탭 점검:** matrix 탭이나 scale 탭의 특정 포지션에서도 390 폭 진입 시 표시 음이 높은 프렛에만 분포하는 경우 유사한 빈 지판 현상이 있을 수 있음.
