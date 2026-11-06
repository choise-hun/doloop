# SR-1 결과 — 연습 화면에 "이 곡의 연습 기록" 붙이기 + 무료 녹음 한도 모달

- **날짜:** 2026-11-06
- **브랜치:** `feat/sr-1-practice-record` (base `main`)
- **PR:** #100 (`https://github.com/choise-hun/ULevelP/pull/100`)
- **근거 명세:** `개발산출물/명세/SR-1_구현명세.md` · `개발산출물/진행_연습기록연결.md` §3 (SR-Q1·SR-Q2 사용자 결정 반영)

---

## 1. 배치 약속 (명세 §3)

| 상태 | 화면 |
| --- | --- |
| `guest`·`guestLocal` | 영상 아래 한 줄 안내 (`로그인하면 이 곡의 연습 기록과 녹음이 여기에 모여요`) |
| `userData` + 곡 상세(세션 6·녹음 2) | 머리줄 + 녹음 2줄 + 세션 5줄 + `더 보기` |
| `userEmpty` (곡 상세 빈 것) | 머리줄 + `아직 녹음이 없어요` + `아직 연습 세션 기록이 없어요.` |

| 폭 | 열 구성 |
| --- | --- |
| 1280·1150 | 2열: 왼쪽 녹음(+A/B) · 오른쪽 연습 세션. 두 열의 **윗선**을 맞춘다. 전체 폭 = `.pp-main` 폭 |
| 768·390 | 1열: 머리줄 → 녹음 → 연습 세션. `기록에서 자세히 →`는 머리줄 아래 줄로 내려가도 됨 |

| 맞춤 그룹 (`data-align-group`) | 대상 |
| --- | --- |
| `sr-left` (left) | `#songRecord` 머리줄 · `.pp-stage` (왼쪽선이 영상과 같다) |
| `sr-cols` (top, ≥1150만) | 녹음 열 제목 · 세션 열 제목 |

---

## 2. 변경 파일 목록 (명세 §2 9개 파일)

| 파일 | 내용 |
| --- | --- |
| `frontend/src/components/songRecord/SongRecordParts.tsx` (신규) | `LogPage.tsx`에서 `TakeItemRow`, `fmtTakeMeta`, `sortAbTakes`, `fmtDuration`, `AbCompare`(`handlePlayAbSlot`·오디오 ref·비동기 레이스 방어 토큰 포함), `SessionTimeline`(`initialLimit` + `더 보기` + `loading` 로딩 상태 지원) 분리 및 `idPrefix` prop 지원 |
| `frontend/src/components/songRecord/SongRecordParts.module.css` (신규) | `LogPage.module.css`의 녹음 행·타임라인·A/B 비교 슬롯 규칙 이관 및 연습 화면 `#songRecord` 2열 그리드(`.srWrap`, `.srHeadRow`, `.srCols`) 정의 |
| `frontend/src/components/songRecord/SongRecordPanel.tsx` (신규) | 연습 화면 하단 `#songRecord` 본문 컴포넌트: 비로그인/미등록 곡 1줄 안내, 머리줄(`이 곡의 연습 기록` + 누적 시간·최근 연습일 + `기록에서 자세히 →`), 녹음(`#srTakes` + `#srAbPanel`), 연습 세션(`#srTimeline`, 처음 5개 + `더 보기`), 미수신 대기(`detailData === null`) 시 "불러오는 중…" 표시 및 빈 상태 문구 플리커링 방어, 오류 시 `기록을 불러오지 못했어요` + `다시 시도`, 곡 전환 레이스 방어(`reqSeqRef`) |
| `frontend/src/pages/LogPage.tsx` | 곡 상세의 녹음·A/B 비교·타임라인을 `SongRecordParts` 컴포넌트로 교체(`idPrefix=""`), DOM id·클래스·동작 100% 유지 |
| `frontend/src/pages/LogPage.module.css` | `SongRecordParts.module.css`로 옮긴 전용 규칙(`.takeRow`, `.takeMeta`, `.takeAudio`, `.tlRow`, `.tlMeta`, `.tlBar`, `.tlMemo`, `.abSlots`, `.abSlot`, `.checkLabel`) 제거 |
| `frontend/src/pages/PracticePage.tsx` | `.pp-main` 아래 `<section id="songRecord"><SongRecordPanel ... /></section>` 추가, 녹음 업로드·진행 저장 성공 시 `srReloadKey` +1, `403 FREE_TAKE_SONG_LIMIT_EXCEEDED` 수신 시 `#takeLimitModal` 오픈(`detail.limit` 표시, 무료 플랜 시 Drive 연결 버튼 숨김, `다른 곡 녹음 지우고 이 곡 녹음 저장` 클릭 시 확인창 후 `replaceOldSongTakes: true` 재업로드), 구 409 분기 제거 |
| `frontend/src/pages/PracticePage.module.css` | `.songRecord` 바깥 여백(`padding-top: 10px`) 추가 |
| `test/e2e/layout/practice.spec.js` | `userData` + `songDetail`(녹음 2개·세션 6개) 및 `userEmpty` 상태 추가, `#songRecord` 대기 및 배치 약속 검증 |
| `test/e2e/practice-record.spec.js` (신규) | SR1-1 ~ SR1-7 E2E 동작 및 로딩 플리커링 방어 회귀 검증 |

---

## 3. 구현 전 spec 실패 확인 (절차 2단계)

구현 코드 반영 전 `test/e2e/practice-record.spec.js` 및 `test/e2e/layout/practice.spec.js` 실행 결과:

```text
Running 5 tests using 1 worker
  x  1 [chromium] › test\e2e\practice-record.spec.js:95:1 › SR1-1·SR1-2: userData + 곡 상세(녹음 2·세션 6) 위치·내용·더 보기·기록 링크 검증 (3.8s)
  x  2 [chromium] › test\e2e\practice-record.spec.js:133:1 › SR1-3: guest 비로그인 시 한 줄 안내만 보이고 #srTakes 없음, 빈 화면(#emptyState)에서는 #songRecord 없음 (3.8s)
  x  3 [chromium] › test\e2e\practice-record.spec.js:150:1 › SR1-4: 곡 전환 비동기 레이스 — 첫 곡 응답이 늦게 도착해도 둘째 곡 기록만 보임 (3.7s)
  x  4 [chromium] › test\e2e\practice-record.spec.js:203:1 › SR1-5: 무료 녹음 한도 초과(403 FREE_TAKE_SONG_LIMIT_EXCEEDED) 모달·Drive 버튼 숨김·확인창 후 replaceOldSongTakes 재업로드 (3.8s)
  x  5 [chromium] › test\e2e\practice-record.spec.js:347:1 › SR1-6: 곡 상세 500 오류 시 영역 안 오류 문구 + 다시 시도, 플레이어는 그대로 (3.8s)
  5 failed — Error: locator('#songRecord') not found / #takeLimitModal hidden

Running 2 tests using 1 worker (test/e2e/layout/practice.spec.js --grep "userData 1280px")
  x  1 [chromium] › test\e2e\support\layout-check.js:463:7 › FT practice userData 1280px (3.7s)
  x  2 [chromium] › test\e2e\support\layout-check.js:472:5 › FT practice userData 1280px 다크 (3.7s)
  2 failed — page.waitForSelector: Timeout waiting for locator('#songRecord') to be visible
```

---

## 4. 구현 후 테스트 실행 결과

### 4-1. 타입스크립트 및 단위 테스트

```text
$ npx tsc --noEmit
(exit 0)

$ node --test test/r3_practice_log.test.js test/security.test.js
ℹ tests 31 / pass 31 / fail 0

$ npm test
ℹ tests 409 / pass 407 / fail 2 (Windows CRLF 줄바꿈 차이로 인한 기존 ch2c1·ch2c3 2건 — 인수인계 메모 §5와 동일)
```

### 4-2. Playwright E2E (SR1-1~7 + layout/practice + layout/log + xss)

`test/r3_practice_log.test.js`, `test/e2e/xss.spec.js`, `test/e2e/layout/log.spec.js` 모두 **수정 없이** 통과 확인:

```text
$ ULP_UI=spa npx playwright test test/e2e/practice-record.spec.js
  ok 1 › SR1-1·SR1-2: userData + 곡 상세(녹음 2·세션 6) 위치·내용·더 보기·기록 링크 검증 (824ms)
  ok 2 › SR1-3: guest 비로그인 시 한 줄 안내만 보이고 #srTakes 없음, 빈 화면(#emptyState)에서는 #songRecord 없음 (1.0s)
  ok 3 › SR1-4: 곡 전환 비동기 레이스 — 첫 곡 응답이 늦게 도착해도 둘째 곡 기록만 보임 (852ms)
  ok 4 › SR1-5: 무료 녹음 한도 초과(403 FREE_TAKE_SONG_LIMIT_EXCEEDED) 모달·Drive 버튼 숨김·확인창 후 replaceOldSongTakes 재업로드 (893ms)
  ok 5 › SR1-6: 곡 상세 500 오류 시 영역 안 오류 문구 + 다시 시도, 플레이어는 그대로 (746ms)
  ok 6 › SR1-7 (회귀): 곡 상세 응답 대기 중에는 "불러오는 중…" 표시 및 빈 상태 문구 미노출, 응답 완료 후 빈 상태 표시 (734ms)
  6 passed (6.6s)

$ ULP_UI=spa LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js
  21 passed (16.6s) — practice-empty(4) + guest(4) + guestLocal(4) + userData(4+다크1) + userEmpty(4)

$ ULP_UI=spa npx playwright test test/e2e/layout/log.spec.js
  13 passed

$ ULP_UI=spa npx playwright test test/e2e/xss.spec.js
  12 passed (19.5s)
```

---

## 5. 코드 리뷰 피드백 반영 (PR #100)

- **리뷰 지적:** 응답 전 `detailData === null`일 때 빈 배열(`[]`)로 평가되어 "아직 녹음이 없어요" 및 "아직 연습 세션 기록이 없어요."가 깜빡이며 노출되는 문제.
- **반영 내용:**
  - `SongRecordPanel.tsx`: `notLoaded = detailData === null` 조건을 도입하여, 응답 수신 전에는 `srTakes`에 `<p className="empty">불러오는 중…</p>`를 표시하고 `summaryMeta`도 "불러오는 중…"으로 표시.
  - `SongRecordParts.tsx`: `SessionTimeline`에 `loading?: boolean` prop을 추가하여, `loading`일 때 `#srTimeline` 안에 `<p className="empty">불러오는 중…</p>`를 표시.
  - `test/e2e/practice-record.spec.js`: 회귀 테스트 `SR1-7` 추가 (곡 상세 지연 중 "불러오는 중…" 확인 및 빈 상태 문구 미노출, 응답 완료 후 빈 상태 문구 확인).

---

## 5. 4개 폭 스크린샷 자문표 (`프론트_정렬규격.md` §6 Q1~Q9)

검토 파일:
- `test-results/layout-shots/practice-userData-1280.png`
- `test-results/layout-shots/practice-userData-1150.png`
- `test-results/layout-shots/practice-userData-768.png`
- `test-results/layout-shots/practice-userData-390.png`
- `test-results/layout-shots/practice-userData-1280-dark.png`
- `test-results/layout-shots/practice-userEmpty-1280.png`
- `test-results/layout-shots/practice-guest-1280.png`

| # | 질문 | 1280px | 1150px | 768px | 390px |
| --- | --- | --- | --- | --- | --- |
| Q1 | 같은 줄에 있어야 할 요소가 같은 가로선 위에 있는가? | 예 — `#songRecord` 머리줄 좌우(`이 곡의 연습 기록` ↔ `기록에서 자세히 →`) 및 2열(`녹음` ↔ `연습 세션`) 제목 윗선이 일치 | 예 — 1280px와 동일하게 2열 상단 및 머리줄 정렬 일치 | 예 — 1열 전환 상태에서 머리줄 좌우 같은 줄 유지 | 예 — 좁은 폭에서 `기록에서 자세히 →`가 머리줄 아래 줄로 자연스럽게 줄바꿈됨(명세 §3 허용) |
| Q2 | 같은 열에 있어야 할 요소의 왼쪽선이 맞춰져 있는가? | 예 — `.pp-stage`와 `#songRecord` 머리줄·좌측 카드 왼쪽선이 일치(`sr-left`) | 예 — `.pp-stage`와 `#songRecord` 왼쪽선 일치 | 예 — `.pp-stage`, `.pp-ctl`, `#songRecord` 전체 왼쪽선 일치 | 예 — 모든 섹션·카드 왼쪽선 일치 |
| Q3 | 카드 안 첫 요소 아래에 빈 공간이 덩그러니 남지 않았는가? | 예 — `녹음`·`연습 세션` 카드 모두 제목 바로 아래 14px 간격으로 내용 시작 | 예 | 예 | 예 |
| Q4 | 글자가 어색한 곳에서 두 줄로 꺾이지 않았는가? | 예 — 버튼·메타 줄바꿈 없음 | 예 — 버튼·메타 줄바꿈 없음 | 예 — 1열 폭에서 한 줄 유지 | 예 — 테이크 행 안 버튼이 단어/버튼 단위로만 줄바꿈되고 글자 쪼개짐 없음 |
| Q5 | 빈 상태에서도 카드 크기가 자연스러운가? | 예 — `userEmpty`에서 좌우 카드가 내용 높이에 맞게 아담하게 렌더됨 | 예 | 예 | 예 |
| Q6 | 두 열일 때 왼쪽·오른쪽 무게가 크게 기울지 않았는가? | 예 — 좌측 녹음(+A/B)과 우측 세션(5개 제한 + 더 보기)으로 균형 유지 | 예 | 해당 없음(1열) | 해당 없음(1열) |
| Q7 | 가장 중요한 버튼이 한눈에 보이는가? | 예 — 플레이어 재생 버튼(`#playBtn`)과 기록 영역 `기록에서 자세히 →`·`▶ 듣기` 명확 | 예 | 예 | 예 |
| Q8 | 간격이 들쭉날쭉하지 않은가? | 예 — 카드 내부 gap 14px, 타임라인 행 간격 0px(padding 8px), 열 간격 16px 균일 | 예 | 예 | 예 |
| Q9 | 다크 모드에서 글자·테두리·배경이 다 읽히는가? | 예 — `practice-userData-1280-dark.png`에서 표면·테두리·초록 진행바·텍스트 대비 정상 | - | - | - |

---

## 6. 명세와 달라진 점

- 없음 (명세 §1~§7 및 `진행_연습기록연결.md` §3 결정 사항과 100% 일치).
