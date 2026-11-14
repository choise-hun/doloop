# DS-2 결과 — 홈 적용(프레임 바, 잉크 배너, 스트릭·구간 배지 주황, 카드 제목, 상단 메뉴 로고)

> 작업: DS-2 (주니어 2단계 1차 구현·검증·PR) | 브랜치: `step/DS-2` | PR: [#21](https://github.com/choise-hun/doloop/pull/21) | 기준 명세: [DS-2_구현명세.md](../명세/DS-2_구현명세.md)
> 상태: 1차 구현 및 V1~V10 검증 완료 — PR #21 업로드(시니어 3단계 독립 검증 대기)

## 1. 바꾼 파일 목록

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | `frontend/src/pages/HomePage.module.css` | `.barAccent`·`.barInk` 추가(D1), `.streakCellToday` 틴트·`.streakCellToday .dowText` `--ink`·`.streakCellDone.streakCellToday` 테두리 `--now-ring`(D3·D4 순서), `.recentPlaceholder` `color: var(--ink)`(D10), `.recentSegmentLoop` 추가(D6), `.curItem` 왼쪽 3px 안쪽 그림자·`.curItem a` `padding-left: 10px`(D7), `.communityBanner*` 잉크 배너·밑줄 링크·`min-height: 44px`·`:focus-visible` 외곽선 `--accent-ink`·`--panel-bg` 제거(D8·D9) |
| F2 | 수정 | `frontend/src/pages/HomePage.tsx` | 카드 4곳에 `styles.barAccent`/`styles.barInk` 적용, `#weeklyStreakCard` 제목 `WEEKLY`, 스트릭 칸 `data-today={d.isToday ? '1' : undefined}`, `recentHasLoop` 계산 및 `#recentSongSegment` 조건부 `.recentSegmentLoop` + `data-align-group="songText:left"`, 배너 내용/링크에 `data-align-group="bannerText:left"`, 상단 주석 문구 정리 |
| F3 | 수정 | `frontend/src/components/layout/AppShell.tsx` | `BrandLogo` import, `a.brandLink` 안 `t('nav.home')` 앞에 `<BrandLogo variant="wordmark" className={styles.navLogo} />` 삽입(D11), `a.brandLink`·SETTING 링크에 `data-align-group="navRow:center-y"` 추가 |
| F4 | 수정 | `frontend/src/components/layout/AppShell.module.css` | `.brandLink`에 `display: inline-flex; align-items: center; gap: 12px`, `.navLogo`(`display: block; height: 16px; aspect-ratio: 416 / 100; flex-shrink: 0`) 추가 |
| F5 | 수정 | `frontend/src/lib/i18n/ko.mts` · `en.mts` · `ja.mts` | `'home.titleRecentSong': "RECENT"` (3개 언어 동일) |
| F6 | 수정 | `test/e2e/layout/home.spec.js` | `UIUX-R T1` 끝 4줄을 변별 단언(`['3px', '1px', '1px', '1px']`)으로 교체(T0), `DS2-1`~`DS2-8` 테스트 9건(T7 라이트·다크 분리) 추가 |
| F7 | 수정 | `test/e2e/layout/shell.spec.js` | `DS2-N1`(1280·390px) 및 `DS2-N2`(1280px) 추가 |
| F8 | 신규 | `개발산출물/결과/DS-2.md` | 본 결과 문서 |
| F9 | 수정 | `개발산출물/진행_디자인D.md` | DS-2 진행 상태 갱신 |

> 첫 커밋 `652bbb7` (`docs(design): add DS-2 spec`)에 기존 로컬 미커밋 문서 4건(`명세/DS-2_구현명세.md`, `진행_디자인D.md`, `인수인계_메모.md`, `계획/상용_서비스_계획.md`)을 보존 반영했다. `인수인계_메모.md`·`계획/상용_서비스_계획.md`는 주니어가 편집하지 않았다.

## 2. 배치 약속 표 (구현 전 선기록 — 명세 §5)

상태: `guest`·`guestLocal`·`userData`·`curation`(+ 다크 `curation` 1280).
폭별 열 구성: 821px 이상에서 위젯 2열·프레임 2열·BETTER 안 2열·진행 카드 2열, 820px 이하 전부 1열. 배너는 601px 이상에서 글과 링크가 좌우, 600px 이하에서 위아래. 상단 메뉴는 모든 폭에서 한 줄.

| 그룹 | 선 | 구성원 | DS-2 |
| --- | --- | --- | --- |
| `top1` | top,bottom@821 | `#weeklyStreakCard`, `#recentSongCard` | 유지 |
| `strip` | bottom@821 | `#streakChallengeBar`, `#categoryRow` | 유지 |
| `songBody` | top | `#recentSongThumb`, 최근 곡 글 칸 | 유지 |
| `songText` | left | 최근 곡 글 칸, "이어서 구간 연습하기" 링크, **`#recentSongSegment`** | 구성원 추가 |
| `songEmpty` | top | `NO SONG` 칸, 빈 상태 글 칸 | 유지 |
| `frames` | top,bottom@821 | `#betterFrame`, `#vaultFrame` | 유지 |
| `chordsCol` | center-x | CHORDS 칼럼, `#betterChordsBtn` | 유지 |
| `playerCol` | center-x | PLAYER 칼럼, `#betterPlayerBtn` | 유지 |
| `player` | bottom@821 (곡이 없을 때만) | `#modes`, `#songs` | 유지 |
| `btns` | height,bottom@821 | `#betterChordsBtn`, `#betterPlayerBtn` | 유지 |
| `vaultBtm` | bottom@821 | `#betterChordsBtn`, `#progRefBox` | 유지 |
| `noteBody` | top | 노트 썸네일, 노트 글 칸 | 유지 |
| `noteText` | left | 노트 글 칸, `#recentNoteLink` | 유지 |
| `noteEmpty` | top | `NO NOTE` 칸, 빈 상태 글 칸 | 유지 |
| `noteEmptyText` | left | 빈 상태 글 칸, "노트 만들러 가기" 링크 | 유지 |
| `prog` | top,bottom@821 | `#progRefBox`, `#progArchBox` | 유지 |
| `tabs` | top,bottom,height | 하단 탭 6칸(`AppShell`) | 유지 |
| **`bannerText`** | left | 배너 글 칸, `#homeCommunityLink` | 신규(600px 이하에서 쌓였을 때 판정) |
| **`navRow`** | center-y | `a.brandLink`, SETTING 링크 | 신규(모든 화면) |

예외 목록: 없음 (`data-layout-ignore`·`known` 추가 없음).

## 3. 검증 결과 (V1~V10)

| # | 확인 | 명령 | 결과 요약 |
| --- | --- | --- | --- |
| V1 | 구현 전 Red | `npm run build && npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js -g "DS2\|UIUX-R T1"` | **13 failed** (T0·DS2-1~8·DS2-N1 1280/390·DS2-N2 전부 구현 전 실패 확인) |
| V2 | 단위·정적 | `npm test` | **440 passed, 0 failed** (`design_rules` DR-1~5, `i18n` I0-5·I0-6 포함) |
| V3 | 빌드 | `npm run build` | `tsc --noEmit && vite build` 오류 0 (`✓ 177 modules transformed.`, `✓ built in 851ms`) |
| V4 | 홈·셸 spec | `npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js` | **43 passed (25.4s)**, 실패 0. 경고는 V6 표 참고(모두 기존 G7b·G8이며 `#homeCommunityLink` G7b 해소) |
| V5 | 가드 변이 3종 | 개별 변이 → `npm run build` + 표적 spec → 원복 | ① `.barInk` `--now-ring` → `DS2-1` 실패 ② `.streakCellDone.streakCellToday` 삭제 → `DS2-4` 실패 ③ `recentHasLoop = true` 고정 → `DS2-5` 실패. 원복 후 `git status` 변이 없음 |
| V6 | 전 화면 layout | `npx playwright test test/e2e/layout/` | **477 passed (5.8m)**, 실패 0. 새 경고 내역은 아래 §3-2 참고 |
| V7 | E2E 전체 | `npm run test:e2e` | **794 passed (10.7m)**, 실패 0 |
| V8 | 스크린샷 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` | **30 passed (19.1s)**, 6개 PNG 캡처 및 Q1~Q9 검토 완료(§4) |
| V9 | 다국어 값 | `grep -n "home.titleRecentSong" frontend/src/lib/i18n/*.mts` | 3개 언어 모두 `"RECENT"` |
| V10 | 범위 | `git diff --stat main` | 명세 §4 F1~F7(9개) + 첫 커밋 문서 4건 + 결과 파일(`DS-2.md`) |

### 3-1. 실제 명령 출력 끝부분

```text
# V1 (구현 전 Red)
  13 failed
    [chromium] › test/e2e/layout/home.spec.js:64:1 › UIUX-R T1 홈 분할 대시보드 검증: splitFrames 그리드 16px 간격 및 개별 카드 스타일 적용 
    [chromium] › test/e2e/layout/home.spec.js:118:1 › DS2-1 프레임 바 4곳의 색 ────────
    ...
    [chromium] › test/e2e/layout/shell.spec.js:87:1 › DS2-N2 홈에서 위 메뉴 ──────────

# V2 (npm test)
ℹ tests 440
ℹ suites 58
ℹ pass 440
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3843.547458

# V3 (npm run build)
../dist/index.html                            1.85 kB │ gzip:   0.88 kB
../dist/assets/index-CqFSP-IC.css           131.82 kB │ gzip:  22.67 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-D9cMAzed.js            933.89 kB │ gzip: 302.56 kB
✓ built in 851ms

# V4 (home.spec.js + shell.spec.js)
  43 passed (25.4s)

# V5 (변이 3종)
- 변이 ① .barInk → var(--now-ring): DS2-1 실패 (#recentSongCard borderTopColor: Expected "rgb(29, 29, 31)", Received "rgb(230, 77, 1)")
- 변이 ② .streakCellDone.streakCellToday 삭제: DS2-4 실패 (style.topC: Expected "rgb(230, 77, 1)", Received "rgb(29, 29, 31)")
- 변이 ③ recentHasLoop = true 고정: DS2-5 실패 (noLoopStyle.topW: Expected "0px", Received "1px")

# V6 (전 화면 layout)
  477 passed (5.8m)

# V7 (npm run test:e2e)
  794 passed (10.7m)

# V9 (i18n grep)
frontend/src/lib/i18n/en.mts:1045:  'home.titleRecentSong': "RECENT",
frontend/src/lib/i18n/ja.mts:1045:  'home.titleRecentSong': "RECENT",
frontend/src/lib/i18n/ko.mts:1059:  'home.titleRecentSong': "RECENT",
```

### 3-2. V4·V6 경고 내역 (`layout-warnings.txt` 집계)

- **홈(`FT home`) 경고 건수·사유:**
  - `guest 1280px` 18건, `guest 1150px` 18건, `guest 390px` 41건 (`G7b` 27건 + `G8` 14건)
  - `curation 1280px` / `1280px 다크` 각 23건(`G8`), `curation 390px` 54건 (`G7b` 35건 + `G8` 19건)
  - `#homeCommunityLink`는 `min-height: 44px` 적용으로 390·768px `G7b` 경고가 해소되었다.
  - `data-align-group="songText:left"` 추가에 따라 `G7b` 대상 표기가 `[songText] 높이 19px (권장 44)`로 표시된다(기존 `"▶ 이어서 구간 연습하기 →"` 링크).
- **`AppShell` 변경(`navRow`·`brandLink`)에 따른 전 화면 경고 변화:**
  - `[navRow]`(`a.brandLink`, `SETTING` 링크): 390·768px 전 화면(145건)에서 `G7b [navRow] 높이 38px (권장 44)`로 보고됨. 기존에도 `a.brandLink`·`SETTING`·`#navAuth` 모두 44px 미만(`35~38px`)이었으며 `data-align-group="navRow:center-y"` 부여로 첫 멤버인 `brandLink` 라벨이 `[navRow]`로 바뀐 것이다. `A1 navRow` center-y 실패는 0건이다.
  - `nav.siteNav` `G8` 가로 간격 경고: `brandLink` 안에 로고(폭 `66.56px` + `gap: 12px`)가 들어가면서 `navMain`↔`navLinks` 사이 `justify-content: space-between` 간격 수치가 줄어든 값으로 보고됨(예: 1280px `240px`/`268px`/`262px`, 1150px `238px`/`266px`/`260px`, 768px `452px`/`481px`/`474px`, 390px `74px`/`103px`/`96px`). `a.brandLink` 내부 자체의 `G8` 경고는 0건이다.

## 4. V8 스크린샷 검토 (`LAYOUT_SHOTS=1`)

대상 PNG: `home-curation-390.png`, `home-curation-768.png`, `home-curation-1150.png`, `home-curation-1280.png`, `home-curation-1280-dark.png`, `home-guest-390.png`.

| 질문 | `390px` (`curation`·`guest`) | `768px` (`curation`) | `1150px` (`curation`) | `1280px` (`curation` 라이트·다크) |
| --- | --- | --- | --- | --- |
| Q1 첫눈 초점·주 버튼 하나(배너 제외) | ○ (`RE:DO`+입력창 초점, 배너 링크는 밑줄 글자) | ○ | ○ | ○ |
| Q2 같은 위계 여백 균형 | ○ (1열 균등) | ○ (1열 균등) | ○ (`top1`·`frames` 2열 균형) | ○ (`top1`·`frames` 2열 균형) |
| Q3 기준선 어긋남 없음 | ○ (`navRow` 중심·`songText`·`bannerText` 좌측 정렬) | ○ | ○ | ○ |
| Q4 크기·굵기·명도 위계 | ○ (`WEEKLY`·`RECENT`·`BETTER`·`VAULT` 통일) | ○ | ○ | ○ |
| Q5 빈 상태 안내 (`guest`) | ○ (`NO SONG`/`NO NOTE` `--ink` 대비 + 다음 행동 링크) | — (`curation`만 캡처) | — (`curation`만 캡처) | — (`curation`만 캡처) |
| Q6 390 쌓임·768 열 구성 | ○ (상단 메뉴 한 줄, 배지 두 줄 직각 자연 줄바꿈) | ○ (상단·하단 프레임 1열) | ○ | ○ |
| Q7 유채색 주황 하나 | ○ (바·오늘·배지·점만 주황, 파랑 0) | ○ | ○ | ○ (라이트·다크 동일) |
| Q8 곡률·1px/3px 규칙 | ○ (중간 곡률 0, 배지 직각, 배너 링크 직각) | ○ | ○ | ○ |
| Q9 다크 모드 대비·경계 | — | — | — | ○ (다크 배너 밝은 면 반전·오늘 칸 테두리 선명) |

## 5. 명세와 달라진 점 · 미실행 범위 · DS-3 입력 · 인계

- **명세와 달라진 점:** 없음.
- **미실행 범위:** 운영 배포, 실제 로그인·Drive 계정이 연결된 실데이터 홈 화면 확인(사람/운영 단계).
- **DS-3 입력 (고치지 않고 기록만):**
  1. 다른 화면 전파 후보: 카드 상단 3px 프레임 바(`.barAccent`·`.barInk`) 및 직각 주황 틴트 배지(`.recentSegmentLoop` 형태)의 타 화면 적용 검토.
  2. 남은 `G7b` 경고: 상단 메뉴(`[navRow]`, `#navAuth`), 홈 위젯 링크(`a.widgetLink`, `[songText]`, `[noteEmptyText]`, `#recentNoteLink`), `CHORDS`/`PLAYER` 목록 줄(`42px`), `progScopeBtn`(`28px`), `randBtn`(`34px`), 푸터 테마 버튼(`27px`) 등 390·768px 44px 미만 터치 대상.
  3. 없는 토큰 `--panel-bg` 사용 파일 2곳: `frontend/src/components/practice/PracticeSessionCard.module.css`, `frontend/src/components/notes/EpisodeLogCard.module.css` (`tokens.css`에 미정의 상태).
- **시니어 3단계 독립 검증에 넘길 것:**
  - `AppShell` 로고 추가 및 `navRow:center-y`가 전 화면 layout spec(`477 passed`)에서 낸 `G7b [navRow]`·`G8 nav.siteNav` 경고 변화 검토.
  - `test/e2e/layout/home.spec.js` `UIUX-R T1`(T0)의 변별 테두리 단언 교체 적정성.
  - `HomePage.module.css` 오늘+완료 칸(`.streakCellToday` → `.streakCellDone` → `.streakCellDone.streakCellToday`) CSS 선언 순서 및 `DS2-4` 단언 검증.
