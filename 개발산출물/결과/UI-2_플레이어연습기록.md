# 결과 UI-2: 플레이어 프리셋 UI + 세션/테이크 레슨카드 연동

- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **입력:** `개발산출물/명세/UI-2_구현명세.md`
- **근거:** 사용자 요구사항 (2026-11-07), `개발산출물/프론트_정렬규격.md`, `docs/rules/frontend-layout.md`, `docs/rules/frontend-state.md`
- **브랜치·PR:** `step/UI-2` → `main`, PR #132
- **상태:** 완료(머지 시)

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| :--- | :--- | :--- |
| 수정 | `frontend/src/lib/apiClient.ts` | `SongPresetDto` 타입 정의, DTO V9 확장(`durationSec`, `partStats`, `coveragePct`, `partName`, `completed`), 프리셋 CRUD 및 `takes.complete` API 구현 |
| 수정 | `frontend/src/lib/i18n/ko.mts` | 프리셋 저장/병합 팝업, 음수 대기 타이머, 테이크 완료 토글, 아코디언 관련 신규 다국어 키 추가 및 미사용 키 정리 |
| 수정 | `frontend/src/lib/i18n/en.mts` | UI-2 신규 다국어 영문 키 13개 동기화 및 미사용 키 정리 |
| 수정 | `frontend/src/lib/i18n/ja.mts` | UI-2 신규 다국어 일문 키 13개 동기화 및 미사용 키 정리 |
| 수정 | `frontend/src/pages/PracticePage.tsx` | `#leads` 컨테이너 완전 제거, `-10s` 대기 타이머(`id="btnWaitTimer"`), 프리셋 저장/병합 다이얼로그 연동, `#bar` 마우스 드래그 핸들(`#barHandleA`, `#barHandleB`) 구현 |
| 수정 | `frontend/src/pages/PracticePage.module.css` | 프리셋 바, 대기 타이머 토글 버튼, 드래그 핸들러 스타일 추가 |
| 수정 | `frontend/src/components/songRecord/SongRecordParts.tsx` | `SessionTimeline`에서 `memo`/`loops` 완전 제거, `coveragePct` 빗금/단색 게이지 및 `[상세 보기 ▾]` 아코디언 토글, `TakeItemRow` AB 드롭다운, 미사용 `onToggleComplete` 및 `.ab-check` 제거, `completed` 렌더 타임 동기 정규화 |
| 수정 | `frontend/src/components/songRecord/SongRecordParts.module.css` | 세션 빗금/단색 커버리지 바, 아코디언 상세 목록, 테이크 AB 셀렉트 및 완료 토글 버튼 스타일 추가, 미사용 `.tlMemo` 및 `.abCheckHidden` 제거 |
| 수정 | `frontend/src/components/songRecord/SongRecordPanel.tsx` | `TakeItemRow`에 `abSlot` 및 `onSelectAbSlot` 연동, 슬롯 A/B 독립 선택 및 보존 지원 |
| 수정 | `frontend/src/pages/LogPage.tsx` | `TakeItemRow`에 `abSlot` 및 `onSelectAbSlot` 연동, 슬롯 A/B 독립 선택 지원 |
| 수정 | `frontend/src/pages/NotesPage.tsx` | `.noteCard` 마크업을 `lesson-cards.html` 시안 구조(제목, 채널·난이도·태그 메타, 설명문, `▶ 연습하기 →` 및 `상세 보기` 텍스트 링크)로 개편 |
| 수정 | `frontend/src/pages/NotesPage.module.css` | `lesson-cards.html` 시안 스타일을 `tokens.css` 시맨틱 토큰(단색 테두리, 직각 사각)으로 매핑하여 스타일 이식 |
| 수정 | `test/e2e/layout/practice.spec.js` | T1(#leads 제거 및 대기 타이머), T2(프리셋 저장 및 병합 다이얼로그), T3(세션 커버리지 및 `.tl-memo` 0개 단언), T4(테이크 A/B 슬롯 매핑 유지 및 구간 완료) 단언 동기화 |
| 수정 | `test/e2e/layout/notes.spec.js` | T5(.noteCard 시안 구조 및 액션 텍스트 링크) 단언 추가 |
| 수정 | `test/e2e/practice-record.spec.js` | SR1-4 비동기 곡 전환 식별 표지를 메모 대신 `segment`(`0:00–0:30` vs `0:12–0:48`)로 전환 |
| 수정 | `test/e2e/xss.spec.js` | E5 곡 상세 A/B 비교 선택을 `.ab-check`에서 `.ab-select`의 `selectOption`으로 전환 |
| 신규 | `개발산출물/명세/UI-2_구현명세.md` | 시니어 Step UI-2 구현 명세서 |
| 수정 | `개발산출물/진행_프론트개선.md` | 단계 표 UI-2 상태 칸 `완료(머지 시)` 갱신 |
| 신규 | `개발산출물/결과/UI-2_플레이어연습기록.md` | 결과 문서 작성 및 체크리스트 대조 감사 |

---

## 2. 확인 명령 출력

### 2.1 프로덕션 빌드 (`npm run build`)
```text
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
vite v5.4.11 building for production...
<script src="/config.js"> in "/index.html" can't be bundled without type="module" attribute
transforming (1) index.htmltransforming (54) ../node_modules/react-router/dist/index.jstransforming (79) src/lib/i18n/en.mts✓ 155 modules transformed.
rendering chunks (1)...rendering chunks (2)...rendering chunks (3)...computing gzip size (0)...computing gzip size (1)...computing gzip size (2)...computing gzip size (3)...computing gzip size (4)...computing gzip size (5)...../dist/index.html                            1.74 kB │ gzip:   0.83 kB
../dist/assets/index-DtjP2S9I.css            93.03 kB │ gzip:  16.02 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-CVewZYUc.js            769.97 kB │ gzip: 252.22 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 719ms
```

### 2.2 레이아웃 E2E 검증 (`npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/notes.spec.js`)
```text
Running 50 tests using 1 worker

     1 …romium] › test/e2e/support/layout-check.js:463:7 › FT notes guest 1280px
  ✓  1 …› test/e2e/support/layout-check.js:463:7 › FT notes guest 1280px (615ms)
  ✓  25 …:1 › T5: NotesPage .noteCard 시안 구조 및 액션 텍스트 링크 검증 (584ms)
  ✓  47 …3:1 › T1: #leads 제거 및 음수 대기 타이머(#btnWaitTimer) 렌더링 (632ms)
  ✓  48 …ractice.spec.js:115:1 › T2: 프리셋 저장 및 병합 다이얼로그 호출 (680ms)
  ✓  49 …ec.js:194:1 › T3: 세션 커버리지 게이지 바 및 아코디언 상세 목록 (617ms)
  ✓  50 …ce.spec.js:239:1 › T4: 테이크 .ab-select 매핑 및 구간 완료 토글 (613ms)
  50 passed (39.9s)
```

### 2.3 단위 테스트 (`npm test`)
```text
> guitar-chord-lab@1.0.0 test
> node --test test/*.test.js

ℹ tests 373
ℹ suites 58
ℹ pass 373
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3761.677333
```

---

## 3. 스크린샷 검토 (규격 §6, `LAYOUT_SHOTS=1`)

확인 캡처:
- `practice-empty-guest-{390, 768, 1150, 1280}.png`
- `practice-guest-{390, 768, 1150, 1280}.png`
- `practice-guestLocal-{390, 768, 1150, 1280}.png`
- `practice-userData-{390, 768, 1150, 1280}.png`
- `practice-userEmpty-{390, 768, 1150, 1280}.png`
- `practice-userData-1280-dark.png`
- `notes-guest-{390, 768, 1150, 1280}.png`
- `notes-user-{390, 768, 1150, 1280}.png`
- `notes-userData-{390, 768, 1150, 1280}.png`
- `notes-pro-{390, 768, 1150, 1280}.png`
- `notes-retry-{390, 768, 1150, 1280}.png`
- `notes-userData-1280-dark.png`

| 화면 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **practice** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **notes** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

- **Q1 강한 버튼 & Q8 곡률/글자:** 플레이어 `#btnWaitTimer` 및 `[+ 구간 프리셋 저장]`은 `9999px` 필(pill) 버튼을 유지하고, NotesPage의 `.noteCard`는 `0px` 직각 카드와 텍스트 링크(`▶ 연습하기 →`, `상세 보기`)로 구성되어 과도한 면 채움 버튼 없이 명확한 정보 위계를 구현함.
- **Q2 여백 & Q3 기준선:** `NotesPage` 레슨 카드가 `display: grid; grid-template-columns: 1fr auto; gap: 10px 24px;` 레이아웃으로 개편되어 390px 모바일에서도 가로 스크롤 없이 유연하게 줄바꿈됨.
- **Q4 위계 & Q5 빈 상태:** 세션 카드에서 지저분한 인라인 메모와 루프 숫자가 제거되고, 단정된 빗금/단색 커버리지 바와 `[상세 보기 ▾]` 아코디언으로 분리되어 연습 통계가 시각적으로 정돈됨.
- **Q9 다크 모드:** `tokens.css`의 시맨틱 토큰(`--bg`, `--line`, `--accent`, `--accent-ink`, `--sub`, `--dim`)을 100% 사용하여 다크 모드에서도 완벽한 가독성과 대비를 유지함.

---

## 4. 체크리스트 대조 감사 (Evidence)

| 체크리스트 항목 | 검증 기준 및 결과 | 증거 (`파일명:라인번호`) |
| :--- | :--- | :--- |
| **D1: #leads 제거 및 음수 대기 타이머** | `#leads` 및 `LEADS` 완전 제거, `btnWaitTimer` 토글 및 카운트다운 타이머 구현 | `PracticePage.tsx:17`, `121-123`, `430-471`, `1843-1850` |
| **D2: 프리셋 저장 및 병합 팝업** | `btnSavePreset`, `prompt`, `confirm(merge: true)`, `PUT /presets` 연동 | `PracticePage.tsx:733-772`, `1880-1888`, `apiClient.ts:691-701` |
| **D3: #bar 마우스 드래그 핸들러** | `#barHandleA`, `#barHandleB` 요소 및 마우스 드래그 포인터 좌표 동기화 | `PracticePage.tsx:801-865`, `1677-1698`, `PracticePage.module.css:32-52` |
| **D4: 세션 커버리지 게이지 및 아코디언** | `s.memo`/`s.loops` 제거, `coveragePct` 빗금/단색 바 및 `part_stats` 아코디언 토글 | `SongRecordParts.tsx:437-456`, `481-512`, `SongRecordParts.module.css:176-224` |
| **D5: 테이크 AB 드롭다운 및 [구간 완료]** | 0:32 제거, `.ab-select` 드롭다운, `[✕ 삭제]` 통일, `[구간 완료]` PATCH 연동 | `SongRecordParts.tsx:127-143`, `163-181`, `194-205`, `apiClient.ts:883-893` |
| **D6: NotesPage 레슨 카드 시안 이식** | `lesson-cards.html` 시안 구조 및 텍스트 액션 링크(`▶ 연습하기 →`, `상세 보기`) | `NotesPage.tsx:608-634`, `NotesPage.module.css:83-145` |
| **T1: #leads 제거 및 대기 타이머 검증** | `#leads` 카운트 0 및 `#btnWaitTimer` 렌더링 단언 검증 통과 | `practice.spec.js:103-113` |
| **T2: 프리셋 저장 및 병합 검증** | 중복 프리셋 입력 시 confirm 발생 및 payload `merge: true` 검증 통과 | `practice.spec.js:115-192` |
| **T3: 세션 커버리지 및 아코디언 검증** | 메모 미표시, `tlCoverageBar` 존재, `btnAccordion` 클릭 시 파트 목록 노출 검증 통과 | `practice.spec.js:194-237` |
| **T4: 테이크 AB 드롭다운 및 구간 완료 검증** | `.ab-select` 선택 및 `[구간 완료]` 클릭 시 `[✓ 구간 완료]` 상태 갱신 검증 통과 | `practice.spec.js:239-291` |
| **T5: NotesPage 시안 구조 검증** | `.noteCard` 내 제목, 메타, 설명, 텍스트 액션 링크 검증 통과 | `notes.spec.js:103-119` |

---

## 5. 명세와 달라진 점 및 시니어 리뷰 반영

- **CSP 인라인 스타일 가드레일 준수:** 명세에는 핸들 위치 및 커버리지 바를 예시 수준으로 언급하였으나, 프로젝트 CSP 규격(`RZ2-4`, `test/security.test.js`)에 따라 React 컴포넌트 내 인라인 스타일(`style={{ ... }}`)을 0건으로 유지해야 한다. 이에 따라 `#bar`의 A/B 핸들 위치 이동은 DOM ref(`handleARef.current.style.left`)로 제어하고, 세션 커버리지 바는 100% 완료 여부에 따라 CSS 클래스(`.tlCoverageComplete`, `.tlCoverageInProgress`)로 제어하도록 구현했다.
- **테이크 길이(sec) 다국어 유지:** 테이크 메타데이터에서 `0:32` 같은 시각 표기(`hh:mm`)는 명세 D5대로 제거하되, 녹음 길이인 `t('record.takeSec')`(`{sec}초`)는 유지하여 곡 전환 비동기 레이스 검증(`practice-record.spec.js` SR1-4)의 `42초` 단언을 만족하도록 유지했다.
- **TypeScript 타입 안전성 보강:** `SongRecordParts.tsx`의 `handleToggleComplete`에서 API 응답의 `res.take.completed`가 선택적 필드(`boolean | undefined`)로 선언되어 있어 TypeScript TS2345 타입 오류가 발생할 수 있었다. 이를 `Boolean(res.take.completed)`로 명시적 불리언 형변환 처리하여 컴파일 안전성을 확보했다.
- **PR #132 시니어 리뷰 머지 전 수정 3건 반영 (2026-11-08):**
  1. **AB 슬롯 매핑 정상화 및 중복 체크박스 제거:**
     - 부모(`SongRecordPanel.tsx`, `LogPage.tsx`)에서 선택 순서/슬롯에 맞게 `abSlot`을 넘기고 `onSelectAbSlot`으로 A/B 슬롯을 각각 독립적으로 유지할 수 있도록 정규화했다.
     - 숨김 체크박스(`.ab-check`, `.abCheckHidden`)를 제거하고, `xss.spec.js:333`을 `.ab-select`의 `selectOption`으로 전환했다.
     - 명세에 없던 미사용 `onToggleComplete` prop을 제거했다.
     - T4에 두 개 테이크에서 각각 A, B를 선택하고 그 값이 유지되는지 단언을 추가했다.
  2. **명세 D4 준수 및 세션 인라인 메모 완전 제거:**
     - `SongRecordParts.tsx`에서 `s.memo` DOM(`tl-memo`)을 완전히 제거하고, `SongRecordParts.module.css`의 `.tlMemo` 스타일을 제거했다.
     - `practice-record.spec.js` 비동기 곡 전환 식별 표지를 메모 대신 `segment`(`0:00–0:30` vs `0:12–0:48`)로 전환했다.
     - T3에 `memo: '메모'` 픽스처를 주입하고 `.tl-memo`가 0개인지 단언하여 반증 대조(가드 제거 시 실패)를 확립했다.
  3. **`completed` 로컬 상태 렌더 타임 동기 정규화:**
     - `SongRecordParts.tsx`에서 `take.id` 또는 `take.completed` prop이 변경될 경우 렌더 도중 이전 prop(`prevTakeId`, `prevTakeCompleted`)과 비교하여 동기적으로 `completed` 상태를 갱신하도록 정규화했다(`docs/rules/frontend-state.md` §2 준수).

---

## 6. 다음 step에 넘길 것

- **프론트엔드 개선 묶음(UI-1, UI-2) 전체 완료:**
  - UI-1 (공통 레이아웃 정렬 및 탭/푸터 통합, PR #131) 완료 및 main 머지됨.
  - UI-2 (플레이어 프리셋 UI + 세션/테이크 레슨카드 연동) 완료.
  - 본 PR 머지 후 사용자 검토 및 다음 작업 묶음 진행 필요.
