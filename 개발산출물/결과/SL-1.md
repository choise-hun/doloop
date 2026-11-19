# SL-1 결과 — 플레이어 곡 목록·분류 화면 개선 및 공용 선택창

> 작업: SL-1 (0단계 시니어 구현 → 4단계 주니어 전체 회귀·4폭 스크린샷·PR 정리) | 브랜치: `feat/SL-1-player-list-ui` | 기준: [진행_SL_곡목록분류.md](../진행_SL_곡목록분류.md) §2 D1~D9 · §3, [SL_시안.html](../명세/SL_시안.html)
> 상태: **전체 회귀 중 1건 실패(제품 코드 결함 — 시니어 인계) / PR 생성 및 CI 확인**

## 1. 바꾼 파일 (시니어 구현 + 주니어 4단계)

| # | 구분 | 파일 | 내용 | 단계 |
| --- | --- | --- | --- | --- |
| F1 | 신규 | `frontend/src/components/common/AppSelect.tsx` | 공용 선택창 (`<button role="combobox" data-value>`, body 포털 `#<id>-list`, 자동 스크롤/키보드 내비) | 시니어(`0f8e8e4`) |
| F2 | 신규 | `frontend/src/components/common/AppSelect.module.css` | 공용 선택창 박스·목록 스타일 (`--radius-block`, `--seam-hairline`, D3) | 시니어(`0f8e8e4`) |
| F3 | 수정 | `frontend/src/pages/PracticePage.tsx` | ①②③④⑦⑧(곡 수정 창)⑨·D9 적용, `#folderSelect`·`#presetSelect`에 `AppSelect` 연결 | 시니어(`0f8e8e4`) |
| F4 | 수정 | `frontend/src/pages/PracticePage.module.css` | `.ppLibBtn` 삭제, `.ppLab` 13px, `.folderSelectWrap`·`[data-editing]`(`--fill1`), `#folderToggle`·접힘 제거 | 시니어(`0f8e8e4`) |
| F5 | 수정 | `frontend/src/lib/i18n/ko.mts`·`en.mts`·`ja.mts` | SL-1 UI 문구(`폴더 선택`, `수정 중`, `제목 수정`, `곡 삭제` 등) 반영 | 시니어(`0f8e8e4`) |
| F6 | 수정 | `test/e2e/layout/practice.spec.js` | `SL1-01`·`SL1-02` 추가, `pickOption`·단언을 `AppSelect`에 맞춤 | 시니어(`0f8e8e4`) |
| F7 | 수정 | `test/e2e/player-category.spec.js` | `P4b-1`·`P4b-4`: `#folderSelect` `toHaveValue` → `toHaveAttribute('data-value', …)`, `#folderToggle` 단언 삭제, `#folderCount` `' · 1곡'` 맞춤 | 주니어(4단계) |
| F8 | 수정 | `test/e2e/home-category.spec.js` | `C4a-5`: `#folderSelect` `toHaveValue` → `toHaveAttribute('data-value', jazzId)`, `#folderToggle` 단언 삭제 | 주니어(4단계) |
| F9 | 신규 | `개발산출물/결과/SL-1.md` | 이 문서 (전체 회귀 결과·결함 보고·4폭+다크+열린 상태 Q1~Q9 표) | 주니어(4단계) |
| F10 | 수정 | `개발산출물/진행_SL_곡목록분류.md` · `개발산출물/인수인계_메모.md` | SL-1 4단계 검증 결과 및 시니어 인계 항목 기록 | 주니어(4단계) |

## 2. 로컬 전체 검증 결과 (제품 코드 무수정, 2026-11-19 Mac)

| # | 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `npm run build` | **오류 0** (`191 modules transformed`, `✓ built in 909ms`) | `dist/` 최신화 |
| V2 | `npm test` | **542 pass / 0 fail** (`58 suites`, `4049.54ms`) | 단위 테스트 전체 통과 |
| V3 | `npx playwright test test/e2e/player-category.spec.js test/e2e/home-category.spec.js` | **12 passed (11.5s)** | 단언 수정 대상 3건 포함 전체 통과 |
| V4 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` | **73 passed (1.0m)** | `SL1-01`·`SL1-02` 포함 전 폭·다크 통과 |
| V5 | `npx playwright test` (전체) | **944 passed, 1 failed (14.9m)** | `i18n-lang.spec.js` `[ja]` 1280px 1건 실패(아래 §3) |

```text
# npm test
ℹ tests 542
ℹ suites 58
ℹ pass 542
ℹ fail 0

# npx playwright test (전체)
  1) [chromium] › test/e2e/i18n-lang.spec.js:293:3 › E2E-L1-3 [ja] 7개 화면 × 4폭(1280·1150·768·390) checkLayout 0건 및 영·일 한글 잔존 0건 
    Error: practice [ja] 1280px checkLayout
    + Array [
    +   "G3 span.value \"プリセット選択\" 말줄임·넘침 (91>87)",
    + ]
  1 failed
  944 passed (14.9m)
```

## 3. 발견된 결함 및 사용자 확인 필요 항목 (제품 코드 무수정)

### 3-1. [제품 코드 결함 — 시니어 인계] `practice [ja] 1280px` `#presetSelect` G3 넘침 (`91>87`)
- **실패 테스트:** `test/e2e/i18n-lang.spec.js:293:3` (`E2E-L1-3 [ja]`) → `:316` `checkLayout`
- **실패 문구:** `G3 span.value "プリセット選択" 말줄임·넘침 (91>87)`
- **원인:** 기존 네이티브 `<select id="presetSelect">`는 `layout-check.js` G3 대상에서 제외(`select` 태그)되었으나, SL-1 ⑤에서 공용 `AppSelect`(`<button><span class="value">…</span></button>`)로 바뀌면서 `span.value`가 G3 검사 대상에 포함됨. `PracticePage.module.css:441` `.ppLoopRow`의 `preset` 열(`minmax(0, 1fr)`)이 1280px 2열 우측 패널에서 좁아지고(`.presetSelect` 좌우 패딩 `10px×2` + `AppSelect.module.css:7` `gap: 8px` + `.chev` `10px` + 테두리 `2px`), 남은 `87px` 안에 일본어 `"プリセット選択"`(`13px`, `91px`)이 4px 넘침.
- **처리:** 주니어 4단계 범위("제품 코드 결함이 보이면 고치지 말고 결과에 적고 시니어에게 넘긴다")에 따라 제품 코드·번역·`i18n-lang.spec.js`는 수정하지 않고 시니어에게 인계함.

### 3-2. [사용자 확인 필요] D1 수정 중 색 `--fill1`
- **적용 위치:** `frontend/src/pages/PracticePage.module.css` `.ppFolderPanel[data-editing]` (스파인·카드 왼쪽 3px 표시)
- **사유:** 플레이어 화면 스파인이 이미 `--fill2`(DS2-3 D3)라 `--fill2`로는 수정 중 구분이 되지 않아 `--fill1`(주황)을 적용함.
- **확인 방법:** `sl1-song-edit-1280.png` 및 `sl1-select-open-390.png`에서 좌측 스파인·카드 왼쪽 3px 주황색 확인 후 사용자 확정 필요.

## 4. 4폭 + 다크 + 열린 상태 스크린샷 Q1~Q9 검토 (`test-results/layout-shots/`)

대상: `practice-userData-{390,768,1150,1280,1280-dark}.png` 및 열린 상태 4장(`sl1-cat-edit-1280.png`, `sl1-song-edit-1280.png`, `sl1-select-open-1280.png`, `sl1-select-open-390.png`).

| # | 질문 | 390 | 768 | 1150 | 1280 | 1280 다크 | 열린 상태(분류 EDIT·곡 수정·선택창) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 주 행동 1개 강조 | ○ | ○ | ○ | ○ | ○ | ○ (곡 수정 창 `Save` 필 1개) |
| Q2 | 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ | ○ (`#folderSelect-list` 박스 아래 4px·같은 가로) |
| Q4 | 위계(크기·굵기·명도) | ○ | ○ | ○ | ○ | ○ | ○ (`--ppLab` 13px·`EDIT`/`Done` 밑줄 구분) |
| Q5 | 빈 상태 안내 | ○ | ○ | ○ | ○ | ○ | ○ (해당 없음) |
| Q6 | 390 순서 / 768 2열 | ○ | ○ | ○ | ○ | ○ | ○ (`390` 선택창 열 때 자동 스크롤로 목록 전체 노출) |
| Q7 | 무채색 구조 + `--fill` 포인트 | ○ | ○ | ○ | ○ | ○ | △ (목록 수정 중 `--fill1` 주황 적용 — 사용자 확인 필요) |
| Q8 | 곡률 3px·줄눈 1px·스파인 12px | ○ | ○ | ○ | ○ | ○ | ○ (선택창·분류 팝오버·곡 수정 모달 모두 `3px` + `1px` 줄눈) |
| Q9 | 다크 모드 대비 | — | — | — | — | ○ | ○ |

## 5. 시니어 후속 수정
- 3-1 해결: `PracticePage.module.css` `.presetSelect` 좌우 패딩 10px→6px(ja `プリセット選択` 91px가 `span.value`에 들어가도록 +8px). `npm run build` 0 오류, `npm test` 542 통과, `i18n-lang.spec.js`+`layout/practice.spec.js` 78 통과.
- 3-2 `--fill1` 확인은 사용자 대기(미확정).
