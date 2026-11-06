# 결과 M2-1bd: 노트 요청 폼 경량화 · 예상 크레딧 · 상세 액션 바 · 모바일 SVG

- **진행 파일:** `개발산출물/진행_프론트기반.md`
- **입력:** `개발산출물/명세/M2-1b_구현명세.md` · `개발산출물/명세/M2-1d_구현명세.md`
- **근거:** `계획/앱_명세.md` §3.1-2, `계획/상용_서비스_계획.md` §1 #15 M2-1
- **브랜치·PR:** `step/M2-1bd` → `main`

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| --- | --- | --- |
| 수정 | `frontend/src/lib/apiClient.ts` | `CreditEstimateDto`, `estimateCredits`, `credits.estimate` 추가 |
| 신규 | `frontend/src/lib/noteForm.mts` | 경과 시간·진행 단계 순수 계산 모듈 (`formatElapsed`, `jobElapsedSec`, `jobStage`) |
| 신규 | `frontend/src/lib/noteMarkdown.mts` | 마크다운 생성 및 플레이어 링크 순수 함수 (`buildNoteMarkdown`, `notePracticeHref`) |
| 수정 | `frontend/src/lib/i18n/ko.mts` | M2-1b 키 13개(`notes.*`) + M2-1d 키 12개(`note.*`) 사전 등록 |
| 수정 | `frontend/src/pages/NotesPage.tsx` | 메모 접기 토글, 기본 화성 태그, Pro 예상 크레딧 계산 및 잔액 안내, 1초 경과 시간 배지, submittingRef 이중 방지 |
| 수정 | `frontend/src/pages/NotesPage.module.css` | `.optBlock`, `.optPanel`, `.optToggle`, `.submitRow`, `.estimate`, `.creditWarn` 스타일 추가 |
| 수정 | `frontend/src/pages/NoteDetailPage.tsx` | 헤더 내 액션 바 `#noteActionBar` 통합, 비동기 마크다운 복사, `notePracticeHref` 일원화, `#noteCollectBox` 제거 |
| 수정 | `frontend/src/pages/NoteDetailPage.module.css` | `.noteActionBar`, `.collectPill`, `.actionStatus`, `.subActions`, `.svgBox svg`, 480px 미디어 쿼리, 미사용 `.collectBox` 삭제 |
| 신규 | `test/m21b_note_form.test.js` | M2-1b 경과 시간 및 진행 단계 단위 테스트 (NF-1~4) |
| 신규 | `test/m21d_note_markdown.test.js` | M2-1d 플레이어 링크 및 마크다운 생성 단위 테스트 (MD-1~6) |
| 신규 | `test/e2e/notes-form.spec.js` | M2-1b 노트 요청 폼 e2e 테스트 (N1~N9) |
| 신규 | `test/e2e/note-actions.spec.js` | M2-1d 노트 상세 액션 바 및 복사 e2e 테스트 (NA-1~7) |
| 수정 | `test/e2e/layout/notes.spec.js` | `pro` 상태 추가 (예상 크레딧 표시 시 맞춤 검사) |
| 수정 | `test/e2e/layout/note.spec.js` | `harmony` 상태 추가 (액션 바 배치 및 390px SVG 반응형 맞춤 검사) |
| 신규 | `개발산출물/결과/M2-1bd_노트폼·상세.md` | 결과 문서 기록 |
| 수정 | `개발산출물/진행_프론트기반.md` | M2-1bd 단계 상태 칸 갱신 |

---

## 2. b절 — 노트 요청 폼 경량화 · 예상 크레딧 · 경과 시간

### 2.1 구현 전 실패 확인 (`notes-form.spec.js`, `layout/notes.spec.js`)
```
  12 failed
    [chromium] › test/e2e/support/layout-check.js:463:7 › FT notes pro 1280px ──
    [chromium] › test/e2e/support/layout-check.js:463:7 › FT notes pro 1150px ──
    [chromium] › test/e2e/support/layout-check.js:463:7 › FT notes pro 768px ───
    [chromium] › test/e2e/support/layout-check.js:463:7 › FT notes pro 390px ───
    [chromium] › test/e2e/notes-form.spec.js:42:1 › N1 390 첫 화면: 링크·태그(화성 선택)·요청 버튼이 스크롤 없이 보이고 메모는 접힘 
    [chromium] › test/e2e/notes-form.spec.js:53:1 › N2 메모 옵션: 펼치면 메모, 접어도 입력은 남고 "입력함" 표시 
    [chromium] › test/e2e/notes-form.spec.js:65:1 › N3 예상 크레딧: 빠르게 세 번 바꾸면 마지막 영상만 한 번 묻는다 
    [chromium] › test/e2e/notes-form.spec.js:82:1 › N4 예상 크레딧 레이스: 먼저 보낸 A 응답이 B 뒤에 와도 B가 남는다 
    [chromium] › test/e2e/notes-form.spec.js:100:1 › N5 잔액 부족 안내: 남은 크레딧 < 예약액이면 경고, 버튼은 막지 않는다 
    [chromium] › test/e2e/notes-form.spec.js:109:1 › N6 예상 실패(400): "계산하지 못했어요", 요청 버튼은 그대로 
    [chromium] › test/e2e/notes-form.spec.js:128:1 › N8 진행 중 작업: 경과 시간이 1초마다 바뀌고 단계 안내가 보인다 
    [chromium] › test/e2e/notes-form.spec.js:147:1 › N9 두 번 제출해도 요청은 한 번, 성공하면 메모 접고 /me 다시 받기 
  14 passed (2.5m)
```

### 2.2 단위 테스트 (`test/m21b_note_form.test.js`)
```
✔ NF-1 formatElapsed: m:ss, 60분 넘어도 분 그대로, 음수·NaN은 0:00 (0.472ms)
✔ NF-2 jobElapsedSec: 대기=요청부터, 분석=시작부터(없으면 요청부터), 끝난 작업·잘못된 시각=null, 시계 어긋남=0 (0.197ms)
✔ NF-3 jobStage: 대기·분석·느림 문구, 끝난 작업은 null (0.155ms)
✔ NF-4 상수: 예상 크레딧 대기 600ms, 느림 기준 180초 (0.043ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

### 2.3 E2E 검증 (`test/e2e/notes-form.spec.js`)
```
  ✓ N1 390 첫 화면: 링크·태그(화성 선택)·요청 버튼이 스크롤 없이 보이고 메모는 접힘 (536ms)
  ✓ N2 메모 옵션: 펼치면 메모, 접어도 입력은 남고 "입력함" 표시 (631ms)
  ✓ N3 예상 크레딧: 빠르게 세 번 바꾸면 마지막 영상만 한 번 묻는다 (1.4s)
  ✓ N4 예상 크레딧 레이스: 먼저 보낸 A 응답이 B 뒤에 와도 B가 남는다 (2.0s)
  ✓ N5 잔액 부족 안내: 남은 크레딧 < 예약액이면 경고, 버튼은 막지 않는다 (1.4s)
  ✓ N6 예상 실패(400): "계산하지 못했어요", 요청 버튼은 그대로 (1.4s)
  ✓ N7 무료 티어: 예상 크레딧을 묻지 않는다 (512ms)
  ✓ N8 진행 중 작업: 경과 시간이 1초마다 바뀌고 단계 안내가 보인다 (3.2s)
  ✓ N9 두 번 제출해도 요청은 한 번, 성공하면 메모 접고 /me 다시 받기 (1.5s)
  9 passed (12.9s)
```

### 2.4 배치 약속 및 스크린샷 검토 표 (M2-1b)

| 항목 | 내용 |
| --- | --- |
| 상태 | `guest`·`user`·`userData` + `pro`(Pro + 예상 크레딧 보임) |
| 폭별 | 모든 폭 1열. 요청 줄은 버튼 + 예상 글자 한 줄 (`flex-wrap`) |
| 맞춤 그룹 | `submitRow:center-y` — `#submit`과 `#noteEstimate` 세로 가운데 일치 |
| 첫 화면 | 390×844 Pro: `#submit` 아랫선 ≤ 탭 바 윗선 (N1 통과) |

| 화면/상태 | 폭 | Q1 첫 화면 버튼 | Q3 버튼·예상 세로 가운데 | Q5 토글 필/메모 접힘 | Q9 다크 모드 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| notes pro | 390 | ○ (탭 바 위) | ○ (줄바꿈 허용) | ○ (접힘 상태 유지) | — | 통과 |
| notes pro | 768 | ○ | ○ (중심차 0px) | ○ | — | 통과 |
| notes pro | 1150 | ○ | ○ (중심차 0px) | ○ | — | 통과 |
| notes pro | 1280 | ○ | ○ (중심차 0px) | ○ | — | 통과 |
| notes userData | 1280 다크 | ○ | — | ○ | ○ (G4 금지색 0건) | 통과 |

---

## 3. d절 — 노트 상세 액션 바 · 타임스탬프 링크 · 모바일 SVG

### 3.1 단위 테스트 (`test/m21d_note_markdown.test.js`)
```
✔ MD-1 href: notePracticeHref 상대/절대 URL, 0/null/음수는 t 없음, 인코딩 보장 (0.345ms)
✔ MD-2 전체: 화성·구간·과제·메모 다 있는 노트 절 순서 1~8 및 끝 줄바꿈 1개 (0.318ms)
✔ MD-3 빈 절: headline·points·moments·practice·memo 없음, tags [] → ## 줄이 하나도 없다 (0.048ms)
✔ MD-4 시간 링크: 코드 timestamp 01:24·1:02:03·빈 문자열·abc 처리 (0.070ms)
✔ MD-5 표 이스케이프: 기능 칸 T|S, 줄바꿈 (0.052ms)
✔ MD-6 화성 조건: analysis.harmony 있음 + tags에 화성 없음 → 화성 절 없음 (0.041ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

### 3.2 E2E 검증 (`test/e2e/note-actions.spec.js`, `test/e2e/progressions.spec.js`)
```
  ✓ NA-1 순서: 액션 바 자식 순서 = 플레이어 → 복사 → 토글, #noteCollectBox 0개 (606ms)
  ✓ NA-2 플레이어: 링크 href practice.html?v=<id>, 글자 오픈 문구 (517ms)
  ✓ NA-3 타임스탬프: 표 01:24 링크와 구간 링크 모두 href …&t=84 (504ms)
  ✓ NA-4 복사 성공: 마크다운 복사 및 성공 문구 표시 후 사라짐 (3.4s)
  ✓ NA-5 복사 실패: writeText 거부 시 실패 문구 세우고 유지 (1.5s)
  ✓ NA-6 늦은 결과: 복사 도중 로그아웃되면 복사 완료 문구를 세우지 않는다 (559ms)
  ✓ NA-7 videoId 없음: 플레이어 숨김, 복사 버튼은 보임 (514ms)
  ✓ P7 노트 상세 "코드 진행 수집에 넣기": 켜면 N개 + CHORDS 링크, 끄면 고친 진행 확인 (822ms)
  28 passed (47.2s)
```

### 3.3 타임스탬프 링크 일원화 검증
```bash
grep -n "practice.html?v=" frontend/src/pages/NoteDetailPage.tsx
# 출력: 0줄 (모두 notePracticeHref로 일원화됨)
```

### 3.4 배치 약속 및 스크린샷 검토 표 (M2-1d)

| 항목 | 내용 |
| --- | --- |
| 상태 | `guest`·`userData` + `harmony`(화성 진행·SVG·구간·과제 포함) |
| 폭별 | 768·1150·1280: 바 한 줄(세 개 나란히). 390: 세로 쌓임(`@media (max-width: 480px)`), 폭 100% |
| 맞춤 그룹 | `noteActions:center-y@481` — 481px 이상에서 세 항목 세로 가운데 일치 |
| SVG | 390 `harmony`: `.svgBox svg` 오른쪽선 ≤ `.svgBox` 안쪽 오른쪽선, 높이/폭 비율 유지 |

| 화면/상태 | 폭 | 액션 바 배치 (한 줄 / 세로 쌓임) | SVG 넘침 여부 | 맞춤 그룹 center-y | 다크 모드 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| note harmony | 390 | ○ (세로 쌓임, 100% 폭) | ○ (오른쪽선 안쪽 정렬, 종횡비 일치) | — (480px 이하 미적용) | — | 통과 |
| note harmony | 768 | ○ (한 줄 나란히) | ○ (자연 비율) | ○ (중심차 0px) | — | 통과 |
| note harmony | 1150 | ○ (한 줄 나란히) | ○ | ○ (중심차 0px) | — | 통과 |
| note harmony | 1280 | ○ (한 줄 나란히) | ○ | ○ (중심차 0px) | — | 통과 |
| note userData | 1280 다크 | ○ | — | ○ (중심차 0px) | ○ (정상 렌더링) | 통과 |

---

## 4. 전체 검증 요약

### 4.1 빌드 (`npm run build`)
```
> tsc --noEmit && vite build
✓ 144 modules transformed.
✓ built in 664ms
```

### 4.2 단위 테스트 (`npm test`)
```
ℹ tests 425
ℹ suites 65
ℹ pass 425
ℹ fail 0
ℹ duration_ms 3755.824167
```
- 새 테스트 `m21b_note_form.test.js`(NF-1~4), `m21d_note_markdown.test.js`(MD-1~6) 모두 통과.
- `i18n.test.js` I0-3(키 형식) 및 I0-6(미사용 키 0건) 모두 통과.
- `test/security.test.js` 보안 및 CSP 규칙 통과.

### 4.3 전체 정렬 검사 (`test/e2e/layout/`)
```
Running 192 tests using 1 worker
192 passed (2.0m)
```
- `notes.spec.js` (17개 케이스: pro 4폭 포함) 전체 통과.
- `note.spec.js` (13개 케이스: harmony 4폭 + 390px SVG 단언 포함) 전체 통과.

### 4.4 회귀 e2e 검사 (`xss.spec.js`, `beta-badge.spec.js`, `progressions.spec.js`)
```
Running 37 tests using 1 worker
37 passed (48.3s)
```

---

## 5. 명세와 달라진 점

1. **i18n 키 접두사 (`noteDetail.*` → `note.*`):**
   - M2-1d 명세 표에 적힌 `noteDetail.*` 접두사는 첫 도메인 토큰에 대문자 `D`가 포함되어 `test/i18n.test.js`의 I0-3 키 형식 정규식(`/^[a-z]+(\.[a-z][A-Za-z]*)+$/`)과 충돌했습니다.
   - 사용자 확인(명세 PR #114 반영)에 따라 `frontend/src/lib/i18n/ko.mts`, `frontend/src/pages/NoteDetailPage.tsx`, `frontend/src/lib/noteMarkdown.mts`에서 키 접두사를 소문자 `note.*`로 12개 키를 일원화하여 기존 테스트 규칙을 보존하며 통과시켰습니다.
2. **`data-align-group` 위치 보정:**
   - 부모 요소인 `#noteActionBar` 컨테이너에 `data-align-group`이 지정되면 자식 버튼들과의 중심 좌표가 비교되어 왜곡이 발생하므로, 컨테이너에서는 제거하고 실제 정렬 대상인 자식 요소 3개(`#notePracticeLink`, `#btnCopyMarkdown`, `label.collectPill`)에만 `data-align-group="noteActions:center-y@481"`을 적용했습니다.

---

## 6. 다음 step에 넘길 것

- **M2-1 프론트 기반 묶음(M2-1a · M2-1bd) 완료:** 주니어 줄 M2-1 묶음은 M2-1bd로 완료되었습니다 (`M2-1c`는 시니어 줄 `진행_노트구간서버.md`에서 서버 M2-1s와 함께 시니어가 직접 구현).
- **서버 SVG 배경색:** 서버 SVG 렌더러의 `rect fill="#fff"` 다크 모드 처리는 추후 서버 렌더러 개편 시 함께 반영.
- **주니어 체크리스트 점검 완료:** 명세 외 파일 변경 없음, API 하위 호환 보존, 비동기 레이스 방어(seq/uid 캡처), 테스트 단언 왜곡 없음 확인.
