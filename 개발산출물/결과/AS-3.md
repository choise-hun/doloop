# AS-3 결과 — 나머지 7곳(진행·운영·커뮤니티·기록) `AppSelect` 전환

> 작업: AS-3 (주니어 구현·검증·PR) | 브랜치: `feat/AS-3-remaining-select` (base `main` `5039cd3`)
> 기준: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §2~§5·§7, [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) §1·§3
> 상태: **구현~PR 검증 완료 — PR #56 머지 대기**

## 1. 바꾼 파일 (제품 11 + i18n 3 + 테스트 7 + 문서 2)

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | `frontend/src/components/progressions/ProgressionEditor.tsx` | `new-key`/`edit-key` `<select>` → `AppSelect` 전환, `<optgroup>` 제거 후 `키 모름` → 추정 키(`meta: t('prog.editorKeyEstimated')`) → 나머지 키 평면 목록 구성, `ariaLabelledBy={fid('key-lab')}` 연결 |
| F2 | 수정 | `frontend/src/pages/ProgressionsPage.tsx` | `#progSort` `<select>` → `AppSelect` 전환, `<span id="progSort-lab">` 및 `ariaLabelledBy="progSort-lab"` 연결 |
| F3 | 수정 | `frontend/src/pages/ProgressionsPage.module.css` | `.sortLabel select` 제거, `.sortLabel > span { white-space: nowrap; }` 및 `.sortSelect { width: auto; }` 적용 |
| F4 | 수정 | `frontend/src/components/ops/OpsFolders.tsx` | `#opsNewKind` `<select>` → `AppSelect` 전환, `<span id="opsNewKind-lab">` 및 `ariaLabelledBy="opsNewKind-lab"` 연결 |
| F5 | 수정 | `frontend/src/components/community/PlaylistImportModal.tsx` | `#playlistCatSelect` `<select>` → `AppSelect` 전환, `ariaLabel={t('playlist.toExisting')}` 연결 |
| F6 | 수정 | `frontend/src/components/community/FolderSheet.tsx` | `#folderReportReason` `<select>` → `AppSelect` 전환, `ariaLabel={t('folder.report')}` 연결 |
| F7 | 수정 | `frontend/src/components/community/Community.module.css` | `.selectPill`의 9999px 필(`--radius-pill`)·자체 테두리/배경/패딩 규칙 제거 후 `width: auto; min-width: 0;`만 유지(명세 B6) |
| F8 | 수정 | `frontend/src/pages/LogPage.tsx` | `#songStatus-${song.id}` 및 `#detailStatus` `<select>` → `AppSelect` 전환, `ariaLabel={t('log.ariaSongStatus')}` 연결 |
| F9 | 수정 | `frontend/src/pages/LogPage.module.css` | `.selectPill`의 자체 테두리/배경/높이/패딩 규칙 제거 후 `width: auto; font-size: 13px;` 유지 |
| F10 | 수정 | `frontend/src/lib/i18n/ko.mts`, `en.mts`, `ja.mts` | `<optgroup>` 평면화로 미사용된 `'prog.editorKeyAll'` 키 제거 |
| F11 | 수정 | `test/e2e/progressions.spec.js` | `#new-key` `getByRole('combobox', { name: '키' })`·`expectValue`·`pickOption` 전환 |
| F12 | 수정 | `test/e2e/progression-play.spec.js` | `#progSort` `getByRole('combobox', { name: '정렬' })`·`pickOption` 전환 |
| F13 | 수정 | `test/e2e/ops.spec.js` | `#opsNewKind` `getByRole('combobox', { name: '종류' })`·`pickOption` 전환 |
| F14 | 수정 | `test/e2e/community.spec.js` | `#playlistCatSelect` `data-value` 및 3px/44px 계산 스타일 단언 추가 |
| F15 | 수정 | `test/e2e/layout/community.spec.js` | `#folderReportReason` 3px/44px, `combobox` 접근 이름, `pickOption`/`expectValue` 검증 추가 |
| F16 | 수정 | `test/e2e/layout/log.spec.js` | `#songStatus-{id}`·`#detailStatus` 3px/44px, `combobox` 접근 이름, `pickOption`/`expectValue` 검증 추가 |
| F17 | 수정 | `test/e2e/layout/progressions.spec.js` | `#progSort`·`#new-key` 접근 이름·`pickOption` 및 `LAYOUT_SHOTS=1` 열린 상태(`#progSort-list`) 1280/390 캡처 추가 |
| F18 | 신규·수정 | `개발산출물/결과/AS-3.md`, `개발산출물/진행_AS_선택창전환.md` | 검증 결과·스크린샷 검토 표 및 AS-3 상태 기록 |

> 잔존 `<select>`/`<option>` 확인: AS-3 대상 6개 제품 파일 grep 0건(`AppSelect.tsx`·`SongRecordParts.*` 무수정).

## 2. 확인 명령 및 실제 결과

> 참고: 포트 3000을 기존 `node`(PID 92123)가 점유 중이므로 `playwright.config.js`를 수정하지 않고 스크래치 설정(`PORT=3129 node server.js`, `reuseExistingServer: false`)으로 빌드된 `dist/`를 서빙해 검증했다.

| # | 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `npm run build` | `tsc --noEmit && vite build` **0 오류** (`191 modules transformed`, `✓ built in 970ms`) | `dist/` 최신화 |
| V2 | `npm test` | **542 pass / 0 fail** (`58 suites`, `4271.36ms`) | `design_rules.test.js`, `security.test.js` 포함 |
| V3 | `LAYOUT_SHOTS=1 npx playwright test --config=.../pw-as3.config.js test/e2e/progressions.spec.js test/e2e/progression-play.spec.js test/e2e/ops.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/layout/progressions.spec.js test/e2e/layout/log.spec.js test/e2e/layout/community.spec.js test/e2e/i18n-lang.spec.js test/e2e/layout.spec.js` | **271 passed (4.9m)** / 0 failed | `ko`/`en`/`ja` `checkLayout`, `P1~P12`, `PP1~PP5`, `CUI-01~12`, `M2-4b`, `DS23`/`DS3`, `combobox` 접근 이름·3px/44px 스타일 통과 |

```text
# npm run build
✓ 191 modules transformed.
✓ built in 970ms

# npm test
ℹ tests 542
ℹ suites 58
ℹ pass 542
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 4271.360959

# npx playwright test (10개 spec 일괄)
  271 passed (4.9m)
```

- **미실행 범위:** AS-3와 무관한 타 화면 E2E spec(`practice-record.spec.js`, `chords_*.spec.js`, `layout/home.spec.js`, `layout/practice.spec.js`, `layout/profile.spec.js`, `layout/settings.spec.js` 등)은 로컬 단일 실행에서 제외(CI 전체 워크플로에서 최종 실행).

## 3. 4폭 + 다크 + 선택창 열린 상태 스크린샷 검토 (Q1~Q9)

검토 대상(`test-results/layout-shots/`):
- `progressions-userData-390.png`, `progressions-userData-768.png`, `progressions-userData-1150.png`, `progressions-userData-1280.png`, `progressions-userData-1280-dark.png`
- `log-songs-userData-390.png`, `log-songs-userData-768.png`, `log-songs-userData-1150.png`, `log-songs-userData-1280.png`, `log-songs-userData-1280-dark.png`
- 선택창 열린 상태: `as3-progressions-select-open-1280.png`, `as3-progressions-select-open-390.png` (`#progSort-list` 포털 열림)

| # | 질문 | 390 | 768 | 1150 | 1280 | 1280 다크 | 선택창 열림(1280·390) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 주 행동 1개 강조 | ○ | ○ | ○ | ○ | ○ | ○ (`+ 진행 넣기` 필 1개, 선택창은 3px 사각 컨트롤) |
| Q2 | 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ | ○ (검색·정렬 행 및 곡 카드 편집 줄 간격 균일) |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ | ○ (`#progSort-list` 박스 아래 4px·우측 정렬, 메모 입력과 높이 일치) |
| Q4 | 위계(크기·굵기·명도) | ○ | ○ | ○ | ○ | ○ | ○ (`정렬` 보조 라벨 `--muted` + 선택창 `--ink`, 선택 항목 `--surface2` + 좌측선) |
| Q5 | 빈 상태 안내 | ○ | ○ | ○ | ○ | ○ | ○ (`guest`·`communityEmpty` 별도 통과) |
| Q6 | 390 순서 / 768 2열 | ○ | ○ | ○ | ○ | ○ | ○ (`390`에서 곡 카드 편집 줄 2단 자연 줄바꿈, 포털 목록 가림 없음) |
| Q7 | 무채색 구조 + `--fill` 포인트 | ○ | ○ | ○ | ○ | ○ | ○ (스파인·대표 CTA 외 선택창·목록 무채색) |
| Q8 | 곡률 3px·줄눈 1px·스파인 12px | ○ | ○ | ○ | ○ | ○ | ○ (`.selectPill` 포함 모든 선택창·포털 `--radius-block` `3px` + `1px` 테두리) |
| Q9 | 다크 모드 대비 | — | — | — | — | ○ | ○ (`--bg`·`--ink`·꺾쇠 대비 선명) |

## 4. 명세와 달라진 점

- `<optgroup>` 평면화로 더 이상 참조되지 않는 `'prog.editorKeyAll'` 키를 `ko.mts`·`en.mts`·`ja.mts`에서 함께 제거했다(미사용 i18n 키 정합성 유지).

## 5. 시니어 3-P 독립 검증 (2026-11-20, head `7b1a36f`)

> 입력: 명세 §2·§3 AS-3·§4·§5·§7 ↔ PR #56 전체 diff. 최신 head CI 통과(Test·E2E XSS&CSP·Docker·CI ok). Codex 리뷰는 사용 한도로 실패(지적 0), 라인 리뷰 없음.

### 5.1 확인 초점별 판정

| # | 초점 | 판정 | 근거 |
| --- | --- | --- | --- |
| C1 | 7곳 전환 완전성 | 적합 | `new-key`/`edit-key`(`fid('key')`), `#progSort`, `#opsNewKind`, `#playlistCatSelect`, `#folderReportReason`, `#songStatus-{id}`, `#detailStatus` 모두 `AppSelect`. `id`·옵션 값·라벨 문구 불변(§7) |
| C2 | AS-2 파일 무수정 | 적합 | `git diff origin/main...HEAD -- frontend/src/components/common frontend/src/components/songRecord` 0줄 |
| C3 | ProgressionEditor 평면 목록(B3) | 적합 | `키 모름` → 추정 키(`meta`=`prog.editorKeyEstimated`, 첫 항목 `추천` 접미) → 나머지 키, 겹침 없음. `as AppSelectOption[]`은 단언이 아닌 배열 합침 타입 맞춤 |
| C4 | `prog.editorKeyAll` 제거(I0-6) | 적합 | 사용처 0건(grep), 3언어 동시 제거로 `Record<I18nKey,…>` 정합·`tsc` 통과. §4-6 "새 키 금지"에 반하지 않는 미사용 키 정리 |
| C5 | `.selectPill` 3px(B6) | 적합 | 필 곡률·자체 테두리 제거, `AppSelect` `.trigger`의 `--radius-block` 사용(3px 단언 통과) |
| C6 | 크기 덮기 클래스 적용 | **결함 → 수정** | 아래 D1 |
| C7 | 접근 이름(B4) | 적합 | 라벨 있는 3곳은 `ariaLabelledBy`(`*-lab` span), 나머지 4곳 `ariaLabel`. 각 spec `getByRole('combobox', { name })` 개수 단언 |
| C8 | 공용 헬퍼 재사용·단언 | 적합(보강) | `pickOption`/`expectValue`만 사용, 기대값 불변(§1.1). 기록 화면 변경 단언에 PATCH 본문 확인이 없어 보강(D2) |
| C9 | 모달 안 목록 | 적합 | 포털 `onKeyDown`의 `stopPropagation`으로 Esc가 `useSheetFocus`(window bubble)에 닿지 않음 → 목록만 닫힘. `#playlistCatSelect`는 `categories.length > 0`일 때만 렌더(빈 목록 없음) |

### 5.2 결함·수정

| # | 결함 | 원인 | 수정 | Red → Green |
| --- | --- | --- | --- | --- |
| D1 | 신고 사유 `#folderReportReason`이 `width:auto` 대신 신고 줄 전체 폭(1280에서 560px)을 차지 | `.selectPill`(0,1,0)과 `AppSelect` `.trigger{width:100%}`(0,1,0)의 명시도가 같아 빌드 CSS 순서로 결정 — Community 규칙이 `.trigger`보다 **앞**에 묶여 짐. LogPage·Progressions는 우연히 뒤라 적용됐지만 같은 위험 | 명세 B2의 `.takeRow .abSelect` 방식으로 부모 문맥 0,2,0: `.reportControls .selectPill`, `.songCardEdit .selectPill, .row .selectPill`, `.sortLabel .sortSelect` | `layout/community.spec.js` AS-3에 폭 단언(`box < row`) 추가 → 수정 전 **실패**(`Expected < 560, Received 560`) → 수정 후 통과 |
| D2 | 기록 상태 변경 테스트가 `data-value`만 봐서 저장 요청이 안 나가도 통과 가능 | 변이 단언 누락 | `layout/log.spec.js` AS-3: 카드·상세 모두 `PATCH /api/v1/songs/{id}` 본문 `{ status }` 단언, 카드는 저장 뒤 `toBeEnabled`(busy 해제) | 보강 단언(제품 결함 아님) — 통과 |

미커밋 변경(주니어 4단계가 커밋): `frontend/src/components/community/Community.module.css`, `frontend/src/pages/LogPage.module.css`, `frontend/src/pages/ProgressionsPage.module.css`, `test/e2e/layout/community.spec.js`, `test/e2e/layout/log.spec.js`, 이 파일, 진행 파일.

### 5.3 시니어 실행 결과

- `npm run build` 통과. 빌드 CSS: `._reportControls_… ._selectPill_…{width:auto;min-width:0}`, `._songCardEdit_… ._selectPill_…,._row_… ._selectPill_…{width:auto;font-size:13px}`, `._sortLabel_… ._sortSelect_…{width:auto}`
- `npx tsc --noEmit`(frontend) 통과, `npm test` **542 pass / 0 fail**
- Playwright(포트 3000 점유로 스크래치 설정 `PORT=3129`): `layout/community`·`layout/log`·`layout/progressions`·`progression-play`·`progressions`·`ops`·`i18n-lang` **126 passed (2.6m)**

### 5.4 주니어 4단계 최종 정리 (2026-11-20)

- **최종 검증 결과:**
  - `npm run build`: `tsc --noEmit && vite build` 0 오류 (`191 modules transformed`, `✓ built in 916ms`)
  - `npm test`: **542 pass / 0 fail** (`58 suites`, `4030.84ms`)
  - Playwright 10개 spec 일괄 재실행(`PORT=3129` 스크래치 설정 `pw-as3.config.js`, `LAYOUT_SHOTS=1`): **271 passed (4.9m)** / 0 failed
- **신고 줄(`#folderReportReason`) 390·1280 스크린샷 검토 (Q2·Q3·Q6):**
  - 1280px(`boxW=70, boxH=44, rowW=560, rowH=48`): Q2 ○(선택창·사유 입력창·신고 보내기 버튼 한 줄 간격 균일), Q3 ○(3개 컨트롤 상하 기준선 일치), Q6 ○(한 줄 순서 유지)
  - 390px(`boxW=70, boxH=44, rowW=318, rowH=104`): Q2 ○(첫 줄 선택창+입력창, 둘째 줄 보내기 버튼 여백 균일), Q3 ○(첫 줄 기준선 일치, 둘째 줄 좌측 정렬), Q6 ○(좁은 폭에서 자연스러운 2단 줄바꿈, 겹침/넘침 없음)
- **Git·PR·CI 상태:**
  - 시니어 3-P 미커밋 변경을 `fix(as-3)`, `test(as-3)`, `docs(as-3)`로 분리 커밋 후 `feat/AS-3-remaining-select`에 push하여 PR #56 갱신 예정 (최종 push·CI·리뷰 확인 결과는 아래 추가).
