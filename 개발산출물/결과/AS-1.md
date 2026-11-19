# AS-1 결과 — 코드 화면 21곳 `AppSelect` 전환 및 공용 E2E 헬퍼

> 작업: AS-1 (2단계 주니어 구현·검증·PR) | 브랜치: `feat/AS-1-chords-select` (base `origin/main` `60178ca`)
> 기준: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §2~§5, [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) §1·§3 (입력 목록: 미커밋 `SL-3.md` 29곳 중 코드 화면 21곳)
> 상태: **2단계 구현·로컬 검증 완료 — PR 업로드·CI 확인 후 시니어 3-P 검증 대기**

## 1. 바꾼 파일 (제품 3 + 테스트 6 + 문서 2)

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | `frontend/src/pages/ChordsPage.tsx` | `<select>` 17곳(`instrument-tuning`·`sc-root`·`sc-type`·`sc-bars`·`tone-root`·`mx-root`·`cc-root`·`cc-top`·`cc-str`·`ri-keyboard-note`·`ri-key`·`a-kind`·`a-proot`·`a-ptype`·`a-guide`·`ds-root`·`ds-scale`)을 `AppSelect`로 전환, 각 `<label>`에 `id`를 부여하고 `ariaLabelledBy` 연결, 공통 정적 옵션 상수(`NOTE_OPTIONS`, `SCALE_OPTIONS`, `CC_TOP_OPTIONS`, `RI_KEYBOARD_NOTE_OPTIONS`, `DS_SCALE_OPTIONS`) 추출 |
| F2 | 수정 | `frontend/src/pages/ChordsPage.module.css` | 태그 선택자 `.instrumentControls select`·`.scField select` → `.selectField` 클래스 기준으로 변경, `.selectField`를 `.numField`의 `font: inherit; padding: 7px 12px;` 공유 규칙에서 분리하여 `AppSelect` 기본 스타일(`14px`, `44px`, `--radius-block`) 유지 |
| F3 | 수정 | `frontend/src/components/chords/ProgressionPlayTab.tsx` | 건반/기타 분기 `<select>` 4곳(`pp-semis`×2, `pp-beats`×2)을 `AppSelect`로 전환 및 `ariaLabelledBy` 연결 |
| F4 | 신규 | `test/e2e/support/app-select.js` | 공용 E2E 헬퍼 `pickOption(page, id, value)` · `expectValue(page, id, value)` 구현 |
| F5 | 수정 | `test/e2e/layout/chords.spec.js` | `#sc-type` `selectOption` → `pickOption`, 21곳 `getByRole('combobox', { name })` 단언 및 `LAYOUT_SHOTS=1` 열린 상태(`#sc-type-list`) 스크린샷 테스트 추가 |
| F6 | 수정 | `test/e2e/layout/chords_instruments.spec.js` | `#instrument-tuning` `selectOption`/`toHaveValue` → `pickOption`/`expectValue` (`#sc-bpm` `<input>` 유지) |
| F7 | 수정 | `test/e2e/chords_instruments.spec.js` | `#ri-keyboard-note` `selectOption` → `pickOption` |
| F8 | 수정 | `test/e2e/chords_caged.spec.js` | `#sc-type` `selectOption` → `pickOption` |
| F9 | 수정 | `test/e2e/progression-play.spec.js` | `#pp-semis` `selectOption` → `pickOption`, `#mx-root` `toHaveValue` → `expectValue` (`#progSort`는 AS-3 대상이라 유지) |
| F10 | 신규·수정 | `개발산출물/결과/AS-1.md`, `개발산출물/진행_AS_선택창전환.md` | 검증 결과·스크린샷 검토 표 및 AS-1 상태 기록 |

> 금지 파일 무수정 확인: `AppSelect.tsx`, `PracticePage.*`, `SongRecordParts.*`, `test/e2e/layout/practice.spec.js`, i18n 사전 파일, 미커밋 `개발산출물/결과/SL-3.md`는 변경·스테이징하지 않음.

## 2. 확인 명령 및 실제 결과

> 참고: 워크스페이스 `../doloop`에서 기존 `node server.js`(PID 92123)가 포트 3000을 점유 중이었으므로, `playwright.config.js`를 수정하지 않고 스크래치 설정(`PORT=3111 node server.js`, `cwd: ../doloop-sl3`, `reuseExistingServer: false`)으로 빌드된 `../doloop-sl3/dist`를 직접 서빙해 검증했다.

| # | 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `npm run build` | `tsc --noEmit && vite build` **0 오류** (`191 modules transformed`, `✓ built in 901ms`) | `dist/` 최신화 |
| V2 | `npm test` | **542 pass / 0 fail** (`58 suites`, `3907.02ms`) | `design_rules.test.js`, `r2_chords.test.js`, `ch5b_progression_play.test.js`, `security.test.js` 포함 |
| V3 | `LAYOUT_SHOTS=1 npx playwright test --config=.../pw-sl3.config.js test/e2e/layout/chords.spec.js test/e2e/layout/chords_instruments.spec.js test/e2e/chords_instruments.spec.js test/e2e/chords_caged.spec.js test/e2e/chords_scroll.spec.js test/e2e/progression-play.spec.js test/e2e/i18n-lang.spec.js test/e2e/layout.spec.js test/e2e/theme-footer.spec.js` | **156 passed (3.3m)** / 0 failed | 21곳 `combobox` 접근 이름, `ko`/`en`/`ja` 4폭 `checkLayout`, `DS23-C1~C5`, `CH-A/B`, `PP1~PP5`, `L1` 가로 스크롤, 다크 전환 통과 |

```text
# npm run build
✓ 191 modules transformed.
✓ built in 901ms

# npm test
ℹ tests 542
ℹ suites 58
ℹ pass 542
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3907.023708

# npx playwright test (9개 spec 일괄)
  156 passed (3.3m)
```

- **미실행 범위:** 코드 화면과 무관한 타 화면 E2E spec(`practice-record.spec.js`, `community.spec.js`, `ops.spec.js`, `progressions.spec.js`, `layout/practice.spec.js`, `layout/profile.spec.js`, `layout/settings.spec.js` 등)은 로컬 단일 실행에서 제외(CI 전체 워크플로에서 최종 실행).

## 3. 4폭 + 다크 + 선택창 열린 상태 스크린샷 검토 (Q1~Q9)

검토 대상(`test-results/layout-shots/`):
- `chords-scale-guest-390.png`, `chords-scale-guest-768.png`, `chords-scale-guest-1150.png`, `chords-scale-guest-1280.png`, `chords-scale-guest-1280-dark.png`
- `chords-tf-guest-1280.png`, `ch-b-keyboard-progression-guest-1280.png`
- 선택창 열린 상태: `as1-chords-select-open-1280.png`, `as1-chords-select-open-390.png` (`#sc-type-list` 포털 열림)

| # | 질문 | 390 | 768 | 1150 | 1280 | 1280 다크 | 선택창 열림(1280·390) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 주 행동 1개 강조 | ○ | ○ | ○ | ○ | ○ | ○ (`#sc-play` 필 1개, 선택창은 사각 컨트롤) |
| Q2 | 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ | ○ (`--controls` 12px/14px 격자, `.scRow` 12px/16px 균일) |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ | ○ (`#sc-type-list` 박스 아래 4px·동일 가로 정렬, `scRow1` 아랫선 일치) |
| Q4 | 위계(크기·굵기·명도) | ○ | ○ | ○ | ○ | ○ | ○ (`12px` `--muted` 라벨 + `14px` `--ink` 선택창, 선택 항목 `--surface2` + 3px 좌측선) |
| Q5 | 빈 상태 안내 | ○ | ○ | ○ | ○ | ○ | ○ (해당 없음 / `prog` 빈 상태 별도 통과) |
| Q6 | 390 순서 / 768 2열 | ○ | ○ | ○ | ○ | ○ | ○ (`390`에서 선택창 `100%` 폭·자동 스크롤로 목록 전체 노출) |
| Q7 | 무채색 구조 + `--fill` 포인트 | ○ | ○ | ○ | ○ | ○ | ○ (`--fill3` 스파인 유지, 선택창·목록 무채색) |
| Q8 | 곡률 3px·줄눈 1px·스파인 12px | ○ | ○ | ○ | ○ | ○ | ○ (모든 선택창·포털 목록 `--radius-block` `3px` + `1px solid var(--seam-hairline)`) |
| Q9 | 다크 모드 대비 | — | — | — | — | ○ | ○ (`--bg`·`--ink`·꺾쇠 대비 선명) |

## 4. 명세와 달라진 점

- 없음. 다만 `test/e2e/layout/chords.spec.js`의 열린 선택창 캡처(`as1-chords-select-open-*.png`)는 `AppSelect`가 `resize`/`scroll` 이벤트에서 목록을 닫으므로 `fullPage: true` 대신 `fullPage: false`로 현재 뷰포트를 촬영해 열린 목록(`#sc-type-list`)이 닫히지 않도록 했다.
- AS-1 범위 21곳 중 빈 옵션 목록이 되거나 `disabled` 상태가 되는 선택창은 없었다.

## 5. 다음 단계(시니어 3-P 검증 · AS-3)에 넘길 것

- **공용 헬퍼 경로:** `test/e2e/support/app-select.js` (`pickOption`, `expectValue`)가 준비되었으므로 AS-3에서 그대로 import해 사용할 수 있다.
- **미전환 남아 있는 곳:** `test/e2e/progression-play.spec.js:189,191,197`의 `#progSort`는 `ProgressionsPage.tsx` 소속이라 AS-1 범위에서 제외(AS-3 대상).
- **시니어 검증 입력:** 아래 PR 번호·head SHA·CI 결과를 확인한 뒤 시니어 3-P 검증으로 인계한다.
