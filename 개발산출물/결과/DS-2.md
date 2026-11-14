# DS-2 결과 — 홈 적용(프레임 바, 잉크 배너, 스트릭·구간 배지 주황, 카드 제목, 상단 메뉴 로고)

> 작업: DS-2 (2단계 구현·3단계 시니어 검증·4단계 최종 마무리) | 브랜치: `step/DS-2` | PR: [#21](https://github.com/choise-hun/doloop/pull/21) | 기준 명세: [DS-2_구현명세.md](../명세/DS-2_구현명세.md)
> 상태: 시니어 3단계 수정 반영 및 4단계 전체 회귀 통과(§3·§6-5) — 커밋·push·최신 head CI 확인 진행

## 1. 바꾼 파일 목록

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 수정 | `frontend/src/pages/HomePage.module.css` | `.barAccent`·`.barInk` 추가(D1), `.streakCellToday` 틴트·`.streakCellToday .dowText` `--ink`·`.streakCellDone.streakCellToday` 테두리 `--now-ring`(D3·D4 순서), `.recentPlaceholder` `color: var(--ink)`(D10), `.recentSegmentLoop` 추가(D6), `.curItem` 왼쪽 3px 안쪽 그림자·`.curItem a` `padding-left: 10px`(D7), `.communityBanner*` 잉크 배너·밑줄 링크·`min-height: 44px`·`:focus-visible` 외곽선 `--accent-ink`·`--panel-bg` 제거(D8·D9) |
| F2 | 수정 | `frontend/src/pages/HomePage.tsx` | 카드 4곳에 `styles.barAccent`/`styles.barInk` 적용, `#weeklyStreakCard` 제목 `WEEKLY`, 스트릭 칸 `data-today={d.isToday ? '1' : undefined}`, `recentHasLoop` 계산 및 `#recentSongSegment` 조건부 `.recentSegmentLoop` + `data-align-group="songText:left"`, 배너 내용/링크에 `data-align-group="bannerText:left"`, 상단 주석 문구 정리 |
| F3 | 수정 | `frontend/src/components/layout/AppShell.tsx` | `BrandLogo` import, `a.brandLink` 안 `t('nav.home')` 앞에 `<BrandLogo variant="wordmark" className={styles.navLogo} />` 삽입(D11), `a.brandLink`·SETTING 링크에 `data-align-group="navRow:center-y"` 추가 |
| F4 | 수정 | `frontend/src/components/layout/AppShell.module.css` | `.brandLink`에 `display: inline-flex; align-items: center; gap: 12px`, `.navLogo`(`display: block; height: 16px; aspect-ratio: 416 / 100; flex-shrink: 0`) 추가 + 시니어 3단계 `@media (min-width: 821px) and (max-width: 960px)`·`@media (max-width: 360px)` 간격 축소 추가 |
| F5 | 수정 | `frontend/src/lib/i18n/ko.mts` · `en.mts` · `ja.mts` | `'home.titleRecentSong': "RECENT"` (3개 언어 동일) |
| F6 | 수정 | `test/e2e/layout/home.spec.js` | `UIUX-R T1` 끝 4줄을 변별 단언(`['3px', '1px', '1px', '1px']`)으로 교체(T0), `DS2-1`~`DS2-8` 테스트 9건(T7 라이트·다크 분리) 추가 |
| F7 | 수정 | `test/e2e/layout/shell.spec.js` | `DS2-N1`(1280·390px), `DS2-N2`(1280px), 시니어 3단계 `DS2-N3`(guest 880px·user 834px·guest 320px) 추가 |
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
| V2 | 단위·정적 | `npm test` | **440 passed, 0 failed** (`design_rules` DR-1~5, `i18n` I0-5·I0-6 포함, 4단계 최종 코드 기준 재실행) |
| V3 | 빌드 | `npm run build` | `tsc --noEmit && vite build` 오류 0 (`✓ 177 modules transformed.`, `✓ built in 831ms`, 4단계 재실행) |
| V4 | 홈·셸 spec | `npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js` | **46 passed (27.7s)**, 실패 0 (`DS2-N3` 3건 포함). 경고는 V6 표 참고(모두 기존 G7b·G8이며 `#homeCommunityLink` G7b 해소) |
| V5 | 가드 변이 3종 | 개별 변이 → `npm run build` + 표적 spec → 원복 | ① `.barInk` `--now-ring` → `DS2-1` 실패 ② `.streakCellDone.streakCellToday` 삭제 → `DS2-4` 실패 ③ `recentHasLoop = true` 고정 → `DS2-5` 실패. 원복 후 `git status` 변이 없음 |
| V6 | 전 화면 layout | `npx playwright test test/e2e/layout/` | **480 passed (5.7m)**, 실패 0 (`DS2-N3` 3건 포함, 4단계 재실행). 새 경고 내역은 §3-2·§6-3 참고 |
| V7 | E2E 전체 | `npm run test:e2e` | **797 passed (10.7m)**, 실패 0 (`DS2-N3` 3건 포함, 4단계 재실행) |
| V8 | 스크린샷 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` | **30 passed (19.1s)**, 6개 PNG 캡처 및 Q1~Q9 검토 완료(§4) |
| V9 | 다국어 값 | `grep -n "home.titleRecentSong" frontend/src/lib/i18n/*.mts` | 3개 언어 모두 `"RECENT"` |
| V10 | 범위 | `git diff --stat main` | 명세 §4 F1~F7(9개, 3단계 `AppShell.module.css`·`shell.spec.js` 포함) + 문서 5건(`명세/DS-2_구현명세.md`, `결과/DS-2.md`, `진행_디자인D.md`, `인수인계_메모.md`, `계획/상용_서비스_계획.md`) |

### 3-1. 실제 명령 출력 끝부분

```text
# V1 (구현 전 Red)
  13 failed
    [chromium] › test/e2e/layout/home.spec.js:64:1 › UIUX-R T1 홈 분할 대시보드 검증: splitFrames 그리드 16px 간격 및 개별 카드 스타일 적용 
    [chromium] › test/e2e/layout/home.spec.js:118:1 › DS2-1 프레임 바 4곳의 색 ────────
    ...
    [chromium] › test/e2e/layout/shell.spec.js:87:1 › DS2-N2 홈에서 위 메뉴 ──────────

# V2 (npm test — 4단계 최종 코드 기준)
ℹ tests 440
ℹ suites 58
ℹ pass 440
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3845.982041

# V3 (npm run build — 4단계 최종 코드 기준)
../dist/index.html                            1.85 kB │ gzip:   0.88 kB
../dist/assets/index-CrjP03XA.css           132.09 kB │ gzip:  22.72 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-CrCezxYj.js            933.89 kB │ gzip: 302.56 kB
✓ built in 831ms

# V4 (home.spec.js + shell.spec.js — 4단계 최종 코드 기준)
  46 passed (27.7s)

# V5 (변이 3종)
- 변이 ① .barInk → var(--now-ring): DS2-1 실패 (#recentSongCard borderTopColor: Expected "rgb(29, 29, 31)", Received "rgb(230, 77, 1)")
- 변이 ② .streakCellDone.streakCellToday 삭제: DS2-4 실패 (style.topC: Expected "rgb(230, 77, 1)", Received "rgb(29, 29, 31)")
- 변이 ③ recentHasLoop = true 고정: DS2-5 실패 (noLoopStyle.topW: Expected "0px", Received "1px")

# V6 (전 화면 layout — 4단계 최종 코드 기준)
  480 passed (5.7m)

# V7 (npm run test:e2e — 4단계 최종 코드 기준)
  797 passed (10.7m)

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

## 6. 시니어 3단계 독립 검증 (2026-11-14, 대상 head `49d9592`)

PR head = 로컬 `step/DS-2` = `49d9592` 일치, 시작 시 `git status` 깨끗함. PR diff 전체와 `layout-check.js`·`mock-app.js`를 직접 읽고 판단했다. 아래 "실행"은 이 단계에서 실제로 돌린 것이고 "정적"은 코드만 읽은 것이다.

### 6-1. 판정 요약

| # | 항목 | 판정 | 근거 |
| --- | --- | --- | --- |
| S1 | 상단 메뉴 로고가 낸 줄바꿈(회귀) | **결함 — 수정함** | 6-2 |
| S2 | `G7b [navRow]`·`G8 nav.siteNav` 경고 변화 | 문제 없음(새 종류 0) | 6-3 |
| S3 | `UIUX-R T1`(T0) 단언 교체 | 적정 | 네 변을 따로 읽어 `['3px','1px','1px','1px']`와 비교한다. 테두리 삭제·네 변 굵어짐을 모두 잡는다. 색은 `DS2-1`이 본다(정적) |
| S4 | 오늘+완료 칸 선언 순서와 `DS2-4` | 적정 | 6-4 (순서 변이 2종 실행) |
| S5 | 그 밖의 F1~F7 | 명세와 일치 | D1~D11 값·선택자·`data-*` 대조(정적). `.barAccent`·`.barInk`는 `.widgetCard`(`:81`)·`.frame`(`:497`) 뒤이고 820px·600px 미디어 블록에 `border` 재선언이 없다. `bannerText:left`는 601px 이상에서 나란하면 검사기가 건너뛰고(§A1 `sideBy`) 600px 이하에서만 판정한다. `DS2-4`의 날짜는 `Asia/Seoul`로 만들고 `playwright.config.js`의 `timezoneId`도 `Asia/Seoul`이라 CI(UTC)에서도 맞는다. 다국어 3개의 `nav.home`·`nav.settings`·`nav.login` 값이 같아 메뉴 폭은 언어와 무관하다(명세 미확인 ③ 해소) |

### 6-2. S1 — 로고를 넣은 뒤 상단 메뉴가 두 줄이 되는 폭이 넓어짐

- **문제:** 로고(66.56px + 간격 12px = 78.56px)만큼 첫 묶음이 길어져, `main`에서는 한 줄이던 폭에서 SETTING·계정 링크가 다음 줄로 내려간다(메뉴 높이 50.7 → 88.4px). 명세 §5 "상단 메뉴는 모든 폭에서 한 줄"에 어긋난다.
- **왜 못 잡았나:** layout 검사 폭이 1280·1150·768·390뿐이다. 821px(기능 메뉴가 다 보이는 가장 좁은 폭) 근처와 390px 미만은 보지 않는다. `navRow:center-y`는 두 구성원이 위아래로 쌓이면 판정을 건너뛴다(`@폭`이 없는 그룹).
- **실측(`/privacy.html`, 1px 간격으로 300~440·815~1280px 훑음, 두 줄이 되는 폭):**

| 빌드 | 비로그인(`LOGIN`) | 로그인(이니셜) |
| --- | --- | --- |
| `main`(`fa339c0`의 `AppShell` 2개 파일로 빌드) | 821~849 | 821 |
| PR head `49d9592` | **300~331, 821~928** | **300~303, 821~899** |
| 수정 뒤 | 300~307, 821~840 | 없음 |

  834px(아이패드 세로)·864px(반쪽 창)·320px(작은 전화) 같은 실제 폭이 PR head에서 새로 두 줄이 됐다.
- **수정(F4 `AppShell.module.css`, 간격만 — 로고·글자·분기점 820px은 그대로):**
  - `@media (min-width: 821px) and (max-width: 960px)`: `.siteNav` 간격 `0 12px`, `.navMain` `0 8px`, `.navLinks` `12px`, `.brandLink` `8px` (합 88px 절약)
  - `@media (max-width: 360px)`: `.siteNav` `0 8px`, `.navLinks` `8px`, `.brandLink` `8px` (합 24px 절약)
  - 값은 모두 G8 간격 스케일 안이다. layout 검사 4개 폭(1280·1150·768·390)에는 이 규칙이 걸리지 않아 기존 477건의 판정 조건은 그대로다.
- **회귀 테스트(F7 `shell.spec.js`):** `DS2-N3 guest 880px`·`user 834px`·`guest 320px` — SETTING·계정 링크가 홈 링크와 같은 줄, 메뉴 높이 < 64px, 가로 스크롤 0.
  - 수정 전(Red): `3 failed` — 세 건 모두 `SETTING이 다음 줄로 내려감 (Expected: < 57.1875, Received: 57.6875)`
  - 수정 후(Green): `npx playwright test test/e2e/layout/shell.spec.js` → `16 passed (9.6s)`
  - 웹폰트(Archivo)를 막고 훑으면 두 줄 범위는 비로그인 300~301·821~822, 로그인 없음이다(대체 글꼴이 더 좁다). 세 테스트 폭의 여유는 39px·22px·12px다.
- **남은 것(고치지 않음):** 비로그인 821~840px은 수정 뒤에도 두 줄이다. `main`도 821~849px에서 두 줄이었고(DS-2 이전부터) 지금이 더 좁다. 간격만으로는 108px을 줄일 수 없어 글자 크기·분기점·메뉴 개수 중 하나를 바꿔야 한다 → DS-3 입력. 308px 미만도 남는다.

### 6-3. S2 — 경고 변화 (실행: 7개 화면 × 8개 폭 × 비로그인·로그인, `main` 셸과 비교)

- 대상: `index`·`privacy`·`settings`·`log`·`community`·`chords`·`notes` × 1280·1150·821·820·768·390·360·320px.
- 상단 메뉴 관련 **실패 0건**(양쪽 빌드). `navRow` 세로 중심 차이는 한 줄인 모든 경우 0px(SETTING·계정 링크 모두), 로고는 66.55×16px, 가로 스크롤 0.
- 경고 종류는 `main`과 같다. 바뀐 것은 표기와 수치뿐이다.
  - `G7b`: `main`의 `a.brandLink "⌂ HOME"`·`a.navItem "SETTING"` 두 줄이 `[navRow]` 한 줄로 합쳐졌다(같은 그룹 이름 + 같은 높이 37.7px이라 중복 제거됨). 높이는 그대로다(`main`도 37.7px). `#navAuth`는 그대로.
  - `G8 nav.siteNav 가로 간격 스케일 밖`: `justify-content: space-between`의 남는 폭이라 `main`에서도 나온다(예: 1280px 비로그인 915 → 836px). 간격 규칙 위반이 아니다.
- 주니어 결과 §3-2의 설명과 일치한다.

### 6-4. S4 — 오늘+완료 칸 (실행)

- 선언 순서는 `.streakCellToday`(`:139`) → `.streakCellToday .dowText`(`:144`) → `.streakCellDone`(`:148`) → `.streakCellDone .dowText`(`:160`) → `.streakCellDone.streakCellToday`(`:164`)로 명세 D4와 같다.
- 주니어 변이 ②(마지막 줄 삭제)에 더해 **순서 변이 2종**을 넣어 봤다(각각 빌드 → `-g "DS2-3|DS2-4"` → 원복).
  - A. `.streakCellToday` 블록을 `.streakCellDone` 뒤로 → `DS2-4` 실패(`backgroundColor` Expected `rgb(29, 29, 31)`, Received `color(srgb 0.901961 0.301961 0.00392157 / 0.12)` — 틴트가 채움을 덮음)
  - B. `.streakCellToday .dowText`를 `.streakCellDone .dowText` 뒤로 → `DS2-4` 실패(요일 글자 Expected `rgb(225, 224, 214)`, Received `rgb(29, 29, 31)` — 잉크 위 잉크)
  - 두 경우 모두 `DS2-3`은 통과(오늘만인 칸은 순서와 무관). 원복 뒤 `git status`에 `HomePage.module.css` 없음.
- 화면 확인(오늘 연습한 상태, 1280 라이트·다크, 390 라이트): 잉크 채움 + 주황 1px 테두리, 요일·날짜 글자 읽힘. 구간 배지는 390px에서 두 줄 직각으로 나온다.

### 6-5. 이 단계에서 실행한 것 / 4단계 최종 회귀 결과

| 실행 | 시니어 3단계 결과 | 주니어 4단계 최종 결과 |
| --- | --- | --- |
| `npx playwright test test/e2e/layout/shell.spec.js -g "DS2-N3"` (수정 전) | 3 failed | — (3단계 Red 확인) |
| `npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js` (수정 후) | **46 passed (27.0s)** | **46 passed (27.7s)** |
| `npm test` (수정 후) | tests 440 / pass 440 / fail 0 | **tests 440 / pass 440 / fail 0** (`duration_ms 3845.982041`) |
| `npm run build` (수정 후) | 오류 0 | **오류 0** (`✓ 177 modules transformed.`, `✓ built in 831ms`) |
| `npx playwright test test/e2e/layout/` (전 화면 layout) | 미실행 | **480 passed (5.7m)** (실패 0) |
| `npm run test:e2e` (E2E 전체) | 미실행 | **797 passed (10.7m)** (실패 0) |

**미실행(남은 확인):** 최신 head CI(`push` 후 `gh pr checks 21 --watch` 및 리뷰 코멘트 확인 예정). 운영 배포·실계정 확인은 그대로 미실행이다.

### 6-6. 미커밋 변경 (주니어 4단계 인계)

| 파일 | 변경 |
| --- | --- |
| `frontend/src/components/layout/AppShell.module.css` | `.tabBar { display: none; }` 뒤에 미디어 블록 2개 추가(+34줄) |
| `test/e2e/layout/shell.spec.js` | `DS2-N3` 3건 추가(+28줄) |
| `개발산출물/결과/DS-2.md` · `진행_디자인D.md` · `인수인계_메모.md` | 3단계 기록 |

충돌 파일 없음. 명세와 달라진 점: §4 F4에 미디어 블록 2개, §6에 `DS2-N3`이 더해졌다(명세 §7 "390폭 두 줄이면 멈추고 보고"의 같은 문제를 다른 폭에서 고친 것이다). §5의 "모든 폭에서 한 줄"은 비로그인 821~840px·308px 미만에서 아직 참이 아니다.

DS-3 입력 추가: ④ 비로그인 821~840px 상단 메뉴 두 줄(DS-2 이전부터 있던 문제, 간격으로는 해결 불가) ⑤ `navRow`처럼 `@폭`이 없는 `center-y` 그룹은 쌓이면 검사기가 조용히 건너뛴다 — 한 줄이어야 하는 줄은 전용 단언이 필요하다.
