# AS-3 결과 — 진행·운영·커뮤니티·기록 7곳 `AppSelect` 전환

> 작업: AS-3 (2단계 주니어 1차 구현·검증·PR) | 브랜치: `feat/AS-3-remaining-select` (base `origin/main` `5039cd3`)
> 기준: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §2·§3 AS-3·§4·§5·§7, [진행_AS_선택창전환.md](../진행_AS_선택창전환.md)
> 상태: **2단계 1차 구현·검증 완료 — PR 생성·CI 확인 및 시니어 3단계 검증 대기**

## 1. 바꾼 파일 (제품 9 + i18n 3 + 테스트 7 + 문서 2)

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | `frontend/src/components/progressions/ProgressionEditor.tsx` | `new-key`/`edit-key` `<select>` → `AppSelect` 전환(§2 B3 평면 목록: `키 모름` → 추정 키 `meta: t('prog.editorKeyEstimated')` → 나머지 키), `<span id={fid('key-lab')}>` + `ariaLabelledBy` 연결 |
| F2 | 수정 | `frontend/src/pages/ProgressionsPage.tsx` | `#progSort` `<select>` → `AppSelect` 전환, `<span id="progSort-lab">` + `ariaLabelledBy` 연결 |
| F3 | 수정 | `frontend/src/pages/ProgressionsPage.module.css` | 태그 선택자 `.sortLabel select` 제거, `.sortLabel > span { white-space: nowrap; }` 및 `.sortSelect { width: auto; }` 추가(`AppSelect` 기본 `44px`, `3px` 유지) |
| F4 | 수정 | `frontend/src/components/ops/OpsFolders.tsx` | `#opsNewKind` `<select>` → `AppSelect` 전환, `<span id="opsNewKind-lab">` + `ariaLabelledBy` 연결 |
| F5 | 수정 | `frontend/src/components/community/PlaylistImportModal.tsx` | `#playlistCatSelect` `<select>` → `AppSelect` 전환, `ariaLabel={t('playlist.toExisting')}` 연결 |
| F6 | 수정 | `frontend/src/components/community/FolderSheet.tsx` | `#folderReportReason` `<select>` → `AppSelect` 전환, `ariaLabel={t('folder.report')}` 연결 |
| F7 | 수정 | `frontend/src/components/community/Community.module.css` | `.selectPill`의 `border-radius: var(--radius-pill)`(9999px) 등 제거하고 `width: auto; min-width: 0;`만 남겨 `AppSelect` 기본(`3px`, `44px`) 적용(§2 B6) |
| F8 | 수정 | `frontend/src/pages/LogPage.tsx` | 곡 카드 `#songStatus-${song.id}`(§2 B5) 및 곡 상세 `#detailStatus` `<select>` → `AppSelect` 전환, `ariaLabel={t('log.ariaSongStatus')}` 및 `disabled={busyStatus}` 유지 |
| F9 | 수정 | `frontend/src/pages/LogPage.module.css` | `.selectPill`에서 `min-height: 38px` 등 중복 규칙을 정리하고 `width: auto; font-size: 13px;` 유지(`AppSelect` 기본 `44px`, `3px` 적용) |
| F10 | 수정 | `frontend/src/lib/i18n/ko.mts`, `en.mts`, `ja.mts` | `<optgroup>` 제거(§2 B3 평면화)로 미사용이 된 `'prog.editorKeyAll'` 키 제거(`test/i18n.test.js` `I0-6` 통과) |
| F11 | 수정 | `test/e2e/ops.spec.js`, `progressions.spec.js`, `progression-play.spec.js` | `#opsNewKind`, `#new-key`, `#progSort`의 `selectOption`/`toHaveValue` → 공용 헬퍼 `pickOption`/`expectValue`(`test/e2e/support/app-select.js`) + `getByRole('combobox', { name })` 단언 추가 |
| F12 | 수정 | `test/e2e/community.spec.js`, `layout/community.spec.js`, `layout/log.spec.js`, `layout/progressions.spec.js` | `#playlistCatSelect`, `#folderReportReason`, `#songStatus-{id}`, `#detailStatus`, `#progSort`의 `3px` 곡률·`44px` 높이·`combobox` 접근 이름·`pickOption`/`expectValue` 검증 및 `LAYOUT_SHOTS=1` 열린 목록 스크린샷 추가 |
| F13 | 신규·수정 | `개발산출물/결과/AS-3.md`, `개발산출물/진행_AS_선택창전환.md` | 검증 결과·스크린샷 검토 표 및 AS-3 상태 기록 |

> 금지 파일 무수정 확인: `frontend/src/components/common/AppSelect.tsx`, `frontend/src/components/songRecord/SongRecordParts.*`, `test/e2e/layout/practice.spec.js`, `test/e2e/practice-record.spec.js`는 변경하지 않음.

## 2. 확인 명령 및 실제 결과

> 참고: 포트 3000은 기존 `node server.js`(PID 92123)가 점유 중이므로, `playwright.config.js`를 수정하지 않고 스크래치 설정(`PORT=3112 node server.js`, `reuseExistingServer: false`)으로 빌드된 `dist/`를 직접 서빙해 검증했다.

| # | 명령 | 실제 결과 | 비고 |
| --- | --- | --- | --- |
| V1 | `npm run build` | `tsc --noEmit && vite build` **0 오류** (`191 modules transformed`, `✓ built in 895ms`) | `dist/` 최신화 |
| V2 | `npm test` | **542 pass / 0 fail** (`58 suites`, `4009.41ms`) | `i18n.test.js`, `design_rules.test.js`, `security.test.js` 포함 |
| V3 | `npx playwright test --config=.../pw-as3.config.js test/e2e/progressions.spec.js test/e2e/progression-play.spec.js test/e2e/ops.spec.js test/e2e/community.spec.js test/e2e/practice-record.spec.js test/e2e/layout/progressions.spec.js test/e2e/layout/log.spec.js test/e2e/layout/community.spec.js test/e2e/i18n-lang.spec.js` | **221 passed (3.9m)** / 0 failed | 7곳 전환 화면 기능·레이아웃(4폭+다크)·`ko`/`en`/`ja` `checkLayout`·`.selectPill` 3px 전환·`combobox` 접근 이름·공용 헬퍼 재사용 통과 |

```text
# npm run build
✓ 191 modules transformed.
✓ built in 895ms

# npm test
ℹ tests 542
ℹ suites 58
ℹ pass 542
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4009.408583

# npx playwright test (9개 spec 일괄)
  221 passed (3.9m)
```

- **미실행 범위:** AS-3 대상 화면과 무관한 타 화면 E2E spec(`chords*.spec.js`, `layout/chords*.spec.js`, `layout/practice.spec.js`, `layout/home.spec.js`, `layout/profile.spec.js`, `layout/settings.spec.js`, `xss.spec.js` 등)은 로컬 단일 실행에서 제외(CI 전체 워크플로에서 최종 실행).

## 3. 4폭 + 다크 + 선택창 열린 상태 스크린샷 검토 (Q1~Q9)

검토 대상(`test-results/layout-shots/`):
- `progressions-userData-390.png`, `768.png`, `1150.png`, `1280.png`, `1280-dark.png`
- `as3-progressions-select-open-1280.png`, `as3-progressions-select-open-390.png` (`#progSort-list` 포털 열림)
- `log-songs-userData-390.png`, `768.png`, `1150.png`, `1280.png`, `1280-dark.png`
- `community-folder-detail-communityPro-390.png`, `768.png`, `1150.png`, `1280.png`, `1280-dark.png`

| # | 질문 | 390 | 768 | 1150 | 1280 | 1280 다크 | 선택창 열림(1280·390) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 주 행동 1개 강조 | ○ | ○ | ○ | ○ | ○ | ○ (`+ 진행 넣기` 필 1개, 선택창은 사각 컨트롤) |
| Q2 | 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ | ○ (`.listTools`·`.songCardEdit` 내 선택창과 입력칸 간격 균일) |
| Q3 | 기준선 어긋남 | ○ | ○ | ○ | ○ | ○ | ○ (`#progSort-list` 박스 아래 4px·동일 가로 정렬, `정렬` 라벨 한 줄 유지) |
| Q4 | 위계(크기·굵기·명도) | ○ | ○ | ○ | ○ | ○ | ○ (선택 항목 `--surface2` + 3px 좌측선, `--muted` 라벨 + `--ink` 선택창) |
| Q5 | 빈 상태 안내 | ○ | ○ | ○ | ○ | ○ | ○ (`progressions-user`, `community-empty` 통과) |
| Q6 | 390 순서 / 768 2열 | ○ | ○ | ○ | ○ | ○ | ○ (`390`에서 목록 넘침·가로 스크롤 0) |
| Q7 | 무채색 구조 + `--fill` 포인트 | ○ | ○ | ○ | ○ | ○ | ○ (선택창·목록 무채색, 스파인 유지) |
| Q8 | 곡률 3px·줄눈 1px·스파인 12px | ○ | ○ | ○ | ○ | ○ | ○ (`.selectPill` 9999px→3px 전환 포함 모든 선택창 `--radius-block` `3px`) |
| Q9 | 다크 모드 대비 | — | — | — | — | ○ | ○ (`--bg`·`--ink`·꺾쇠 대비 선명) |

## 4. 명세와 달라진 점

- `ProgressionEditor.tsx`에서 `<optgroup label={t('prog.editorKeyAll')}>`를 평면 목록(§2 B3)으로 바꾸면서 `'prog.editorKeyAll'` 키가 소스에서 미사용이 되어 `test/i18n.test.js` `I0-6`이 실패했다. 새 키를 추가하지 않고 기존 미사용 키 `'prog.editorKeyAll'`을 `ko.mts`/`en.mts`/`ja.mts`에서 제거해 해결했다.
- `AS-3` 범위 7곳 중 빈 옵션 목록이 되는 경우는 없었다. `#songStatus-${song.id}`는 `disabled={busyStatus}` 동작을 그대로 유지했다.
