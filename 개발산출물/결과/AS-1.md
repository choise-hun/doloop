# AS-1 결과 — 코드 화면 21곳 `AppSelect` 전환 및 공용 E2E 헬퍼

> 작업: AS-1 (2단계 주니어 구현·검증·PR → 3단계 시니어 검증 → 4단계 주니어 최종 정리) | 브랜치: `feat/AS-1-chords-select` (base `origin/main` `60178ca`) | PR: [#54](https://github.com/choise-hun/doloop/pull/54)
> 기준: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §2~§5, [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) §1·§3 (입력 목록: 미커밋 `SL-3.md` 29곳 중 코드 화면 21곳)
> 상태: **4단계 최종 검증·CI 완료 — PR #54 머지 대기**

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

## 6. 시니어 3단계 독립 검증 (2026-11-20, head `7fea16b` = PR #54 head 일치)

**판정: 제품 코드 결함 없음. 검증 구멍 1건을 표적 spec으로 메움.**

| 항목(명세 §4·§5·§7) | 결과 |
| --- | --- |
| 21곳 전환·`<select>`/`<option>` 잔존 | `ChordsPage.tsx`·`ProgressionPlayTab.tsx` grep 0건. `pp-semis`·`pp-beats` 4곳은 키보드/기타 early-return 분기라 id 중복 없음 |
| 기존 `id`·`data-align-group` | 모두 유지(`sc-root`·`sc-type`의 `scRow1:bottom@1150` 포함) |
| `ariaLabelledBy` | 21곳 모두 `<label id="…-lab">` 연결, e2e `getByRole('combobox', {name})` 1개씩 확인 |
| 숫자 상태 변환 | `Number`/`+v` 위치 불변, `setScCi(0)`·`stop()` 부수 동작 보존. **구멍:** 기존 spec은 숫자 값이 상태·화면에 반영되는지 단언하지 않음 → 아래 표적 spec 추가 |
| 스타일 3px/44px | `.selectField`를 `.numField` 공유 규칙에서 분리, `AppSelect` 기본(44px·`--radius-block`) 유지. 계산 스타일 44px·3px 단언 추가 |
| 키 입력/단축키 | 코드 화면에 전역 keydown 단축키 없음. 박스에서 Space·방향키·Enter가 목록 조작만 하고 값 선택으로 끝남을 단언 |
| 미수정 파일 | `AppSelect.tsx`·`SongRecordParts.*`·`layout/practice.spec.js`·i18n 사전 무변경, `SL-3.md` 미커밋 보존 |
| 옛 셀렉터 잔존 | 21개 id에 대한 `selectOption`/`toHaveValue` 잔존 0건 |

**추가한 표적 회귀:** `test/e2e/layout/chords.spec.js` 끝 `AS-1 숫자 상태 변환·스타일·키 입력 계약` — 루트 6→제목 `Gb` 반영, 44px·3px, Space/↓/Enter로 스케일 종류 변경, `pp-beats=8`·`pp-semis=2`(제목 `D`)·`ri-keyboard-note=60`(`C4`).
- 첫 실행 실패는 내 단언 오류(표기가 `F#`이 아니라 `Gb`) → 단언 수정, 제품 코드 무변경.
- 명령: `npm run build`(0 오류) 후 `npx playwright test --config=<scratch pw.config.js, PORT 3111> test/e2e/layout/chords.spec.js -g "AS-1"` → **2 passed**.
- 미실행: 전체 회귀·타 화면 spec·CI(주니어 4단계). 이 변경은 **미커밋**(`chords.spec.js`, 이 파일).

**주니어 4단계 인계:** 위 변경 커밋·push(PR #54), 전체 회귀·`npm test`, CI 대기·리뷰 코멘트 확인, 진행 파일 AS-1 상태 갱신. 참고: 포털 목록 때문에 `<label htmlFor>` 클릭은 박스를 다시 연다(원래 select와 같은 동작이라 수정 불필요).

## 7. 주니어 4단계 최종 검증·PR 정리 (2026-11-20)

- **시니어 수정 대조:** `test/e2e/layout/chords.spec.js`에 추가된 `AS-1 숫자 상태 변환·스타일·키 입력 계약` 테스트(루트 `6` → 제목 `Gb`, `#sc-type` 높이 `44px`·곡률 `3px`, `Space`/`ArrowDown`/`Enter` 목록 조작, `#pp-beats=8`, `#pp-semis=2` → `#pp-title` `D`, `#ri-keyboard-note=60` → `C4`)를 확인. 제품 코드 변경 없음.
- **최종 로컬 검증 (미커밋 `SL-3.md` 무변경 보존):**
  - `npm test`: **542 pass / 0 fail** (`58 suites`, `3969.453792ms`)
  - `npx playwright test --config=.../pw-sl3.config.js test/e2e/layout/chords.spec.js test/e2e/layout/chords_instruments.spec.js test/e2e/chords_instruments.spec.js test/e2e/chords_caged.spec.js test/e2e/chords_scroll.spec.js test/e2e/progression-play.spec.js test/e2e/i18n-lang.spec.js test/e2e/layout.spec.js test/e2e/theme-footer.spec.js` (포트 3000은 `../doloop` PID 92123 점유 중이라 스크래치 config `PORT=3111`, `cwd: ../doloop-sl3`로 실행): **157 passed (2.8m)** / 0 failed (기존 156건 + 시니어 추가 `AS-1 숫자 상태 변환·스타일·키 입력 계약` 1건)
  - 미실행 범위: 타 화면 E2E spec(`practice-record.spec.js`, `community.spec.js`, `ops.spec.js`, `progressions.spec.js`, `layout/practice.spec.js`, `layout/profile.spec.js`, `layout/settings.spec.js` 등)은 CI 워크플로에서 전체 실행.
- **PR #54 리뷰 코멘트 확인 (`7fea16b` 기준):**
  - `chatgpt-codex-connector` 자동 리뷰는 Codex 사용 한도 초과로 실패(`https://github.com/choise-hun/doloop/pull/54#issuecomment-7012565612`, `#issuecomment-7012566745`). 그 외 사람/시니어 리뷰 코멘트 0건.
  - 이전 `7fea16b` CI: `CI ok` SUCCESS (`https://github.com/choise-hun/doloop/actions/runs/44547866044/job/135650497174`).
- **최신 커밋 CI 결과 (`b2b80db`):** **CI ok SUCCESS** (`https://github.com/choise-hun/doloop/actions/runs/44551589218/job/135663527712`, `Test (Node 22)` 41s SUCCESS · `E2E XSS & CSP (Playwright, spa)` 10m29s SUCCESS · `Docker build & smoke test` 2m13s SUCCESS · `Kotlin test (JDK 21)` SKIPPED). 이후 문서만 갱신한 후속 커밋도 `CI ok` 통과 확인.
