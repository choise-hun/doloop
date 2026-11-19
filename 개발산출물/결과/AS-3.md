# AS-3 결과 — 나머지 7곳(진행·운영·커뮤니티·기록) `AppSelect` 전환

> 작업: AS-3 (주니어 구현·검증·PR) | 브랜치: `feat/AS-3-remaining-select` (base `main` `5039cd3`)
> 기준: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §2~§5·§7, [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) §1·§3
> 상태: **1차 구현·검증 완료 — main 대상 PR 및 시니어 리뷰 대기**

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
