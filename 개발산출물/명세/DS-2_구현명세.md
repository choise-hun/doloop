# DS-2 구현 명세 — 홈 적용(프레임 바, 잉크 배너, 스트릭·구간 배지 주황, 카드 제목, 상단 메뉴 로고)

> 작성: 2026-11-14 / Claude(시니어). 상위: [결과/DS-0](../결과/DS-0_디자인결정.md) §1, [결과/DS-1](../결과/DS-1.md) §3, [결과/BR-1](../결과/BR-1.md) §5-3, [디자인 규칙](../../docs/rules/frontend-design.md), [정렬 규격](../프론트_정렬규격.md), [시안](DS_시안.html). 진행: [진행_디자인D](../진행_디자인D.md).
> 담당: **[주니어] 구현·검증·PR → [시니어] 3단계 검증(조건이 맞으면 3-P).** Step은 나누지 않는다(§1-1).
> 브랜치 `step/DS-2`, base `main`. 선행: PR #19(DS-1)·PR #20(BR-1) 머지 확인됨(`main`=`fa339c0`).
> **상태: 사용자 승인 대기.** §0의 U1~U4는 DS-0에 없던 결정이다. 이 명세는 각 항목의 추천안으로 썼다.
> 범위 밖: 다른 화면의 색·형태 전파와 글자 크기 정리(DS-3), 토큰 값·규칙 문서 변경, `BrandLogo` 수정, 시안의 나머지 차이(§3 D13).

줄 번호는 `main`=`fa339c0`에서 직접 열어 확인했다. 구현 전에 선택자·id로 다시 찾는다. 빌드·테스트는 이 명세를 쓰면서 실행하지 않았다(대비 값만 계산했다).

## 0. 사용자 결정 항목

| ID | 무엇을 정하나 | 추천(이 명세가 따른 값) | 다른 선택 |
| --- | --- | --- | --- |
| U1 | **상단 메뉴 로고를 어디에 넣나.** 시안은 누를 수 없는 로고 + `HOME` 링크를 따로 뒀다. 지금 첫 칸은 `⌂ HOME` 링크 하나다(P13) | 기존 HOME 링크(`a.brandLink`) **안에** 로고를 넣는다: `[RE:DO 로고] ⌂ HOME`이 링크 하나. 로고를 눌러도 홈으로 가고, 홈 링크가 둘로 늘지 않는다. 링크의 읽기 이름은 `RE:DO ⌂ HOME`이 된다 | ① 시안대로 누를 수 없는 로고를 링크 앞에 따로 둔다 ② `⌂ HOME` 글자를 지우고 로고만 둔다(`nav.home` 키와 `test/i18n.test.js` 단언 4곳을 함께 바꿔야 한다) |
| U2 | **구간 배지의 범위.** 지금은 한 줄 글이다: `00:12 ~ 00:48 구간 연습 중 · 0.75×` 또는 `마지막 위치 00:30 · 0.75× 연습 중`(P10). 시안은 시간·속도만 배지에 넣고 `구간 연습 중`은 밖에 뒀다 | A–B 구간이 있을 때만 **줄 전체**를 배지로 만든다. 구간이 없으면(마지막 위치 문구) 지금처럼 회색 글자다. 문구·함수는 바꾸지 않는다 | ① 구간이 없어도 항상 배지 ② 시안처럼 시간·속도만 배지(다국어 틀 2개 × 3개 언어와 `formatRecentSongSegment`·단위 테스트를 바꿔야 한다) |
| U3 | **오늘 연습을 마친 칸**(오늘이면서 완료). 지금은 완료 모양이 오늘 표시를 전부 덮는다(P6) | 잉크 채움(완료) + 주황 1px 테두리(오늘). 틴트는 채움에 덮인다 | 지금처럼 완료 모양만(오늘 표시 없음) |
| U4 | **기존 테스트 단언 1곳 변경과 Step 판정.** `home.spec.js`의 `UIUX-R T1`이 프레임 테두리를 `borderWidth === '1px'`로 단언한다(P16). 상단 바 3px을 넣으면 `'3px 1px 1px'`이 된다 | 그 단언을 변별(위 3px, 나머지 세 변 1px)로 바꾼다(§6 T0). Step은 나누지 않고 담당은 주니어다(§1) | 없음(3px 바는 DS-0 확정 사항) |

승인하지 않는 항목이 있으면 그 항목의 "다른 선택"으로 §3·§4의 해당 줄만 바꾼다.

## 1. 판정

### 1-1. Step 분할 — 나누지 않는다

| 기준(협업 설명서 §1.2) | DS-2 |
| --- | --- |
| 파일 수 7개 초과 | **넘는다**(코드 9개: 화면 4, 다국어 3, 테스트 2). 다국어 3개는 값 1줄씩이고, 모양이 바뀌는 파일은 `HomePage` 2개와 `AppShell` 2개다(핵심 4개) |
| 예상 diff 600~700줄 초과 | 아니다(약 200줄: CSS 55, TSX 15, 다국어 3, 테스트 130) |
| 사용자 여정 2개 이상 | 아니다("홈을 열면 새 모양으로 보인다" 하나. 메뉴 로고는 같은 화면 맨 위다) |
| 하한(100~150줄 미만이면 통합) | 메뉴 로고만 떼면 약 40줄이라 단독 Step이 될 수 없다 |
| 대기능 Step 수 | DS·BR은 이미 6개다. 더 나누지 않는다 |

파일 수 상한은 넘지만 나누면 하한에 걸린다. **한 Step으로 두는 것을 예외로 기록한다**(BR-1과 같은 처리).

### 1-2. 담당 — [주니어]

| 판정 질문 | 답 |
| --- | --- |
| ① 기존 화면의 DOM·클래스·테스트 셀렉터를 바꾸거나 옮기는가 | id·클래스·`data-*`는 하나도 지우거나 옮기지 않는다. 클래스 3개·속성 1개·약속 3줄을 **더하고**, `a.brandLink` 안에 자식(svg) 하나를 **넣는다**. 깨지는 기존 단언은 P16 한 곳이고 바꿀 값을 §6 T0에 적었다. 셸은 모든 화면이 쓰므로 layout spec 전체를 돌린다(§7 V6) |
| ② 기존 화면과 새 화면이 같은 코드를 공유하며 공존하는가 | 아니다 |
| ③ 캐시·요청 경합·에러 구조 같은 암묵 계약에 의존하는가 | 아니다. 상태·effect·API 호출을 더하지 않는다(P18) |

시니어 3단계에서 먼저 볼 곳: `AppShell` 변경이 다른 화면 layout spec에 낸 실패·경고, T0의 단언 교체, 오늘+완료 칸의 선언 순서.

## 2. 전제 (Pre-flight, `main`=`fa339c0`)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/styles/`(파일은 `tokens.css` 하나) `tokens.css:152-290` | 전역 규칙은 `*`·`html`·`body`·`a{color:var(--link)}`(`:172`)·`:focus-visible{outline:2px solid var(--accent); outline-offset:2px}`(`:176-179`)·`[hidden]`·`.pillBtn`·`.ghostBtn`·`.cardBox`·`.panelBox`·`.inpField`·`.msg`·`.srOnly`뿐이다. 홈 마크업의 전역 이름(`card`·`frame`·`frame-head`·`frame-list`·`cur`·`t`·`m`·`note`·`wordmark`·`site-nav`·`links`)에 걸리는 전역 규칙은 없다. 다른 모듈의 `:global()`은 `.pillBtn`·`.ghostBtn`·`.hint`·`.g`·`.r`뿐이다(`Progressions.module.css:79,80,379,455,511`, `SettingsPage.module.css:197-198`, `ChordsPage.module.css:491-492`) |
| P2 | `tokens.css:19-20,36,39` · 다크 `:76-77,89,92` · `:113-114,126,129` | `--accent:#1d1d1f`/`--accent-ink:#f6f6f1`(다크 `#ecece4`/`#171716`), `--orange-terra`=`--now-ring`=`#e64d01`(다크 `#ff6b2b`). **`--panel-bg`는 `tokens.css`에 없다**(전체 291줄 확인) |
| P3 | `HomePage.tsx:574,614` · `HomePage.module.css:81-91` | `#weeklyStreakCard`·`#recentSongCard`는 `styles.widgetCard`(`border:1px solid var(--line)`, 패딩 20px). 둘 다 `data-align-group="top1:top,bottom@821"` |
| P4 | `HomePage.tsx:674-679,785-790` · `HomePage.module.css:478-488` | `#betterFrame`·`#vaultFrame`은 `frame ${styles.frame}`(`border:1px solid var(--line)`, 패딩 24px, `min-height:400px`). 둘 다 `frames:top,bottom@821` |
| P5 | `HomePage.tsx:576,616` · `ko.mts:1059` · `en.mts:1045` · `ja.mts:1045` | 스트릭 카드 제목은 소스에 적힌 글자 `WEEKLY STREAK`, 최근 곡 카드 제목은 `t('home.titleRecentSong')` = `가장 최근 연습했던 곡` / `Most Recently Practiced Song` / `最近練習した曲`. 이 키를 쓰는 곳은 `HomePage.tsx:616` 한 곳이다. `test/`에 이 문구들을 단언하는 곳은 없다 |
| P6 | `HomePage.tsx:582-594` · `HomePage.module.css:128-157` | 칸 클래스는 `streakCell` + `streakCellDone`(연습함) + `streakCellToday`(오늘). 속성은 `data-date`·`data-practiced`뿐이고 오늘을 가리키는 속성은 없다. CSS 순서가 `.streakCellToday`(`:139`, `border-color`만) → `.streakCellDone`(`:143`, 배경·테두리·글자색)이라 둘 다 붙으면 완료가 이긴다. `.dowText`는 `--muted`(`:152`), `.streakCellDone .dowText`는 `--surface2`(`:155-157`) |
| P7 | `HomePage.module.css:190-201` | 작심삼일 점 `.streakDotOn`은 이미 `--orange-terra`다(DS-1에서 값이 `#e64d01`이 됨). 바꿀 것이 없다 |
| P8 | `HomePage.tsx:695-707` · `HomePage.module.css:555-594` · `lib/progressions.ts:308-311` | CHORDS 목록의 번호는 제목 글자 안(`{idx + 1} · 이름`, `--ink`)이라 이미 잉크다. "이어서" 줄은 `li.cur.{curItem}`이고 지금은 `.curItem .itemMeta`의 색·굵기만 다르다(`:591-594`). 마지막 탭은 저장소 키 `ulp:tab`에서 읽고, 값이 7개 모드 id(`scale`·`tone`·`matrix`·`circle`·`reint`·`tf`·`ds`)가 아니면 "이어서" 줄이 없다 |
| P9 | `HomePage.tsx:957-971` · `HomePage.module.css:907-967` | 배너는 `section.card.{communityBanner}#homeCommunityBanner` 안에 제목 `h2#homeCommunityTitle`, 설명 `p`, 링크 `a#homeCommunityLink`. 지금 배경 `--bg`, 테두리 `--line`, 제목 `--ink`, 설명 `--muted`, 링크 `--ink` 밑줄 + 패딩 `8px 12px` + 필 곡률, hover는 `background: var(--panel-bg)`(P2: 없는 토큰이라 지금도 아무 효과가 없다). 600px 이하에서 세로로 쌓인다 |
| P10 | `HomePage.tsx:644-646` · `HomePage.module.css:251-256` · `lib/progressions.ts:256-275` · `ko.mts:1024-1025` | `p#recentSongSegment.{recentSegment}`(모노 12px, `--muted`)에 `formatRecentSongSegment()` 결과가 들어간다. `a`·`b`가 유한한 수이고 `b > a`이면 구간 문구, 아니면 마지막 위치 문구다. `recentSong.a`·`b`의 타입은 `number \| null`(`HomePage.tsx:452-458`) |
| P11 | `HomePage.tsx:658-660,840-842` · `HomePage.module.css:220-232` | `.recentPlaceholder`(`NO SONG`·`NO NOTE`)는 `--surface2` 배경에 `--muted` 글자다(대비 4.09, 디자인 규칙 §1 위반 — DS-1 입력 ②) |
| P12 | `HomePage.tsx:509-511` · `HomePage.module.css:7-24` | 홈 큰 로고는 `h1.wordmark` 안 `BrandLogo`(폭 `min(560px, 82%)`, 480px 이하 `92%`, 여백 `20px 0 24px`). 20·24는 G8 간격 스케일 안의 값이다(시안의 22·26은 스케일 밖) |
| P13 | `AppShell.tsx:101-109` · `AppShell.module.css:19-55,80-85,158-161` | 상단 메뉴는 `nav.site-nav`(`align-items:center`, `min-height:48px`, `flex-wrap:wrap`). 첫 칸은 `a.{brandLink}[href="./"]`이고 내용은 글자 `t('nav.home')`(`⌂ HOME`, `ko.mts:58`)뿐이다. `aria-current="page"`이면 밑줄 2px. 820px 이하에서는 `.navMainItem`만 숨고 `brandLink`·SETTING·계정은 남는다. `AppShell`은 `BrandLogo`를 import하지 않는다 |
| P14 | `components/common/BrandLogo.tsx:3-9,54-66` | `BrandLogo({ variant = 'wordmark', className })`. svg에 `role="img"`, `aria-label="RE:DO"`, `fill="currentColor"`. `wordmark`의 `viewBox`는 `0 0 416 100`. 고칠 필요가 없다 |
| P15 | `test/e2e/support/layout-check.js:155-169,253-282,298-334` | 카드 인식은 네 변 테두리 폭 ≥ 1px(3px 통과). G5는 `color`·`background`·변별 테두리 색·밑줄 색·svg `fill`/`stroke`를 보고 **알파는 무시**한다(`color-mix(… var(--now-ring) 12%, transparent)`는 팔레트 안). `box-shadow`·`outline`은 보지 않는다. G7b는 390·768폭에서 높이 44px 미만인 링크를 경고한다 |
| P16 | `test/e2e/layout/home.spec.js:17-34,83-86` · `test/e2e/layout/shell.spec.js:28-36` · `test/i18n.test.js:28,77,84` · `test/r1_home.test.js:173-195` · `test/e2e/cm-ui.spec.js:82-85` | 홈 layout 상태는 `guest`·`guestLocal`·`userData`·`curation`, 다크는 `curation`, 금지 색 `--link`. `UIUX-R T1`이 두 프레임의 `borderWidth`를 `'1px'`로 단언한다(**DS-2로 깨진다**). `W1-2`는 390·768에서 상단 메뉴 높이 < 64px. `I0-1`은 `nav.home === '⌂ HOME'`, `I0-5`는 `AppShell.tsx`에 한글 없음, `I0-6`은 사전의 모든 키가 소스에서 쓰여야 함. `R1-H6`은 홈 id 15개 존재, `cm-ui`는 `#homeCommunityBanner a`의 `href` |
| P17 | `test/e2e/support/mock-app.js:39,60,74-75,181-183,213` | 고정 데이터의 연습 날짜는 `2026-11-03`이라 "오늘+완료" 칸은 표준 상태에 없다. `mockApp`의 `sessions`·`songs`·`local` 옵션으로 만들 수 있다. `FIXTURES`·`STATES`를 export한다 |
| P18 | `HomePage.tsx:358-443` · `AppShell.tsx:39-60` | 홈의 요청 4개는 `reqSeqRef`·`activeUid` 가드가 있다. 셸의 effect는 테마 동기화와 탭 바 높이 측정 2개다. DS-2는 state·effect·의존성 배열을 건드리지 않고, 더하는 값(`recentHasLoop`, `d.isToday`)은 렌더 때 계산하는 불리언이다 |
| P19 | `gh pr list --state open`(0건) · `개발산출물/진행_*.md` 3개 | 열린 PR이 없다. `진행_모바일스파이크.md`·`진행_다중LLM_자동화검토.md`에는 `HomePage`·`AppShell`·`home.spec`·`shell.spec`이 나오지 않는다(검색 0건) |
| P20 | 메뉴얼 항목 | DB·API·함수 시그니처·export 이름·파일 경로 변경 없음. `AppShellProps`·`BrandLogoProps`·i18n 키 이름 그대로(값 3줄만). 계약 성격의 변경은 U4의 기존 단언 1곳뿐이다 |
| 미확인 | — | ① flex 안 svg의 실제 폭(계산상 66.56px) ② `a.brandLink`와 SETTING 링크의 세로 중심 차이 ③ 390폭에서 메뉴가 한 줄에 들어가는지(영어·일본어 포함) ④ 다른 화면 layout spec의 새 경고 수. 모두 실행해야 알 수 있어 §7 V3·V6에서 처음 확인한다 |

대비 계산값(WCAG 2.x, 틴트는 `--now-ring` 12%를 `--surface` 위에 섞은 색):

| 조합 | 라이트 | 다크 |
| --- | --- | --- |
| 프레임 바·'이어서' 선 주황 / `--surface` | 3.57 | 5.74 |
| 틴트 위 `--ink` · `--muted` · 주황 테두리 | 13.34 · **4.31** · 3.07 | 11.62 · 4.90 · 4.86 |
| 배너: `--accent-ink` / `--accent` · 설명(82%) / `--accent` | 15.52 · 10.77 | 15.11 · 9.12 |
| 오늘+완료: 주황 테두리 / 완료 채움 · / 카드 면 | 4.35 · 3.57 | 2.39 · 5.74 |
| `.recentPlaceholder`: `--ink` / `--surface2` | 12.69 | 12.09 |

## 3. 결정

| ID | 결정 |
| --- | --- |
| D1 | **프레임 바.** 카드 4곳의 윗변을 `border-top: 3px solid`로 한다. `#weeklyStreakCard`·`#betterFrame` = `var(--now-ring)`, `#recentSongCard`·`#vaultFrame` = `var(--ink)`. 새 클래스 `.barAccent`·`.barInk`로 만들고 id 선택자·인라인 style을 쓰지 않는다. 나머지 세 변(1px `--line`)과 패딩은 그대로다(내용이 2px 내려간다. 나란한 카드 둘 다 같아서 `top1`·`frames` 약속은 유지된다). 머리 틴트는 넣지 않는다 |
| D2 | **카드 제목.** `WEEKLY STREAK` → `WEEKLY`(소스 글자). `home.titleRecentSong` 값을 3개 언어 모두 `RECENT`로(키 이름 유지 — P16 `I0-6`). `BETTER`·`VAULT`처럼 모든 언어에서 영문이다 |
| D3 | **오늘 칸.** `border-color: var(--now-ring)`(현행) + `background: color-mix(in srgb, var(--now-ring) 12%, transparent)`. 요일 글자는 `--ink`로 바꾼다(`--muted`는 틴트 위 4.31). 시안의 안쪽 1px 그림자는 넣지 않는다(2px 테두리로 보여 규칙 §2에 어긋난다). 칸에 `data-today="1"`을 더한다(오늘 아닌 칸에는 속성 없음) |
| D4 | **오늘+완료 칸(U3).** 배경·글자색은 완료 그대로(`--ink` 채움), 테두리만 `--now-ring`. 요일 글자는 완료 값(`--surface2`). CSS 순서를 `.streakCellToday` → `.streakCellToday .dowText` → `.streakCellDone` → `.streakCellDone .dowText` → `.streakCellDone.streakCellToday`로 둔다(뒤 선언이 이긴다) |
| D5 | **작심삼일 점·완료 칸·스트릭 막대.** 바꾸지 않는다(P7) |
| D6 | **구간 배지(U2).** `recentHasLoop = recentSong.a != null && recentSong.b != null && recentSong.b > recentSong.a`일 때만 `#recentSongSegment`에 `.recentSegmentLoop`를 더한다: 직각, `border: 1px solid var(--now-ring)`, 배경은 D3과 같은 틴트, 글자 `--ink` 굵기 700, 패딩 `1px 6px`, `align-self: flex-start`. 글자 크기 12px·모노는 그대로다(본문 12px 이상 규칙). 좁은 폭에서 두 줄이 되는 것은 허용한다(지금도 줄바꿈된다) |
| D7 | **'이어서' 줄.** `.curItem`에 `box-shadow: inset 3px 0 0 var(--now-ring)`, 그 안 링크의 왼쪽 패딩을 `10px`로. 테두리가 아니라 안쪽 그림자라 줄 폭·높이가 변하지 않는다. 번호 색·글꼴은 그대로다(P8) |
| D8 | **배너.** 배경·테두리 `var(--accent)`, 제목·링크 `var(--accent-ink)`, 설명 `color-mix(in srgb, var(--accent-ink) 82%, transparent)`. 링크는 밑줄 글자(`text-underline-offset: 4px` 유지), 패딩 `0`, `min-height: 44px`, 필 곡률 삭제, hover는 `text-decoration-thickness: 2px`(없는 토큰 `--panel-bg` 줄 삭제). 구조·id·문구·여백·600px 규칙은 그대로다 |
| D9 | **배너 링크 포커스.** 전역 포커스 외곽선은 `--accent`라 같은 색 면 위에서 보이지 않는다. `.communityBannerLink:focus-visible { outline-color: var(--accent-ink); }`만 더한다(두께·간격은 전역 그대로, 지우지 않는다) |
| D10 | **빈 썸네일 글자.** `.recentPlaceholder`의 `color`를 `var(--ink)`로(2곳에 같이 적용된다) |
| D11 | **상단 메뉴 로고(U1).** `a.brandLink` 안, 글자 앞에 `<BrandLogo variant="wordmark" className={styles.navLogo} />`. `.brandLink`는 `display: inline-flex; align-items: center; gap: 12px`, `.navLogo`는 `display: block; height: 16px; aspect-ratio: 416 / 100; flex-shrink: 0`(폭 66.56px). 글자 `t('nav.home')`·`href`·`aria-current`·밑줄 규칙은 그대로다. 색은 링크의 `--ink`를 물려받는다. 모든 화면·모든 폭에 나온다 |
| D12 | **홈 큰 로고.** 폭·여백을 바꾸지 않는다(P12 — BR-1 입력 ②의 답). `stack`·`mark` 형태는 쓰지 않는다 |
| D13 | **시안과 다르게 두는 것(현행 유지, DS-2에서 손대지 않는다).** 스트릭 칸 안 간격(4px), 최근 곡 썸네일 폭 120px, 분류 칸 최소 폭 56px, 목록 줄 패딩, 섹션 버튼의 그림자 테두리, 진행 카드의 배지·버튼 줄(필 `randBtn`), 범위 토글 높이 28px, 노트 썸네일 136px, 480px 이하 카드 패딩, 헤더 구분선·BETA 배지 |

## 4. 파일별 변경

목록에 없는 파일은 고치지 않는다. CSS 본문은 주니어가 쓴다(아래는 선택자와 값).

| # | 파일 | 구분 | 바꿀 것 |
| --- | --- | --- | --- |
| F1 | `frontend/src/pages/HomePage.module.css` | 수정 | ① `.frame` 블록(`:478-488`) **뒤**에 `.barAccent { border-top: 3px solid var(--now-ring); }`, `.barInk { border-top: 3px solid var(--ink); }` — `.widgetCard`·`.frame`의 `border` 축약보다 뒤여야 한다 ② `.streakCellToday`(`:139`)에 틴트 배경, 바로 뒤에 `.streakCellToday .dowText { color: var(--ink); }`, `.streakCellDone .dowText`(`:155`) 뒤에 `.streakCellDone.streakCellToday { border-color: var(--now-ring); }`(D4 순서) ③ `.recentPlaceholder`(`:231`) `color: var(--ink)` ④ `.recentSegment`(`:251`) 뒤에 `.recentSegmentLoop`(D6 값 7개 + `border-radius: var(--radius-card)`) ⑤ `.curItem .itemMeta`(`:591`) 근처에 `.curItem { box-shadow: inset 3px 0 0 var(--now-ring); }`, `.curItem a { padding-left: 10px; }` — `.frameList a`(`:559`)보다 뒤 ⑥ 배너 6개 선택자(`:907-958`)를 D8·D9 값으로. `.communityBannerLink`에서 `padding`·`border-radius` 줄을 지우고 `min-height: 44px`를 넣는다 |
| F2 | `frontend/src/pages/HomePage.tsx` | 수정 | ① `:574` 클래스에 `styles.barAccent`, `:614`에 `styles.barInk`, `:675`에 `styles.barAccent`, `:786`에 `styles.barInk` 추가(기존 클래스·id·`data-align-group` 유지) ② `:576` 글자 `WEEKLY` ③ `:583-590` 칸에 `data-today={d.isToday ? '1' : undefined}` ④ `recentSong` 계산 뒤(`:479` 다음)에 `recentHasLoop`(D6 식), `:644-646`의 `p`에 조건부 클래스와 `data-align-group="songText:left"` ⑤ 배너의 내용 `div`(`:962`)와 링크(`:968`)에 `data-align-group="bannerText:left"` ⑥ `:572` 주석의 옛 제목 문구 정리 |
| F3 | `frontend/src/components/layout/AppShell.tsx` | 수정 | `BrandLogo` import(`'../common/BrandLogo'`), `a.brandLink`(`:103-109`) 안 글자 앞에 로고(D11), 같은 `a`와 SETTING 링크(`:140-146`)에 `data-align-group="navRow:center-y"` |
| F4 | `frontend/src/components/layout/AppShell.module.css` | 수정 | `.brandLink`(`:37-42`)에 `display: inline-flex; align-items: center; gap: 12px` 추가, 새 `.navLogo`(D11 값 4개). 다른 규칙은 그대로 |
| F5 | `frontend/src/lib/i18n/ko.mts:1059` · `en.mts:1045` · `ja.mts:1045` | 수정 | `'home.titleRecentSong': "RECENT"` (3줄) |
| F6 | `test/e2e/layout/home.spec.js` | 수정 | §6 T0(기존 단언 교체) + T1~T8 추가 |
| F7 | `test/e2e/layout/shell.spec.js` | 수정 | §6 N1·N2 추가 |
| F8 | `개발산출물/결과/DS-2.md` | 신규 | §8 형식 |
| F9 | `개발산출물/진행_디자인D.md` | 수정 | DS-2 상태·PR 번호·CI 결과 |

## 5. 배치 약속

상태: `guest`·`guestLocal`·`userData`·`curation`(+ 다크 `curation` 1280). 폭별 열 구성은 지금과 같다: 821px 이상에서 위젯 2열·프레임 2열·BETTER 안 2열·진행 카드 2열, 820px 이하 전부 1열. 배너는 601px 이상에서 글과 링크가 좌우, 600px 이하에서 위아래다. 상단 메뉴는 모든 폭에서 한 줄이다.

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

`data-layout-ignore`는 새로 쓰지 않는다. `known`도 추가하지 않는다.

## 6. 테스트 표

토큰의 계산 색은 페이지 안에서 임시 요소를 만들어 `el.style.color = 'var(--토큰)'`(틴트는 `el.style.backgroundColor = 'color-mix(in srgb, var(--now-ring) 12%, transparent)'`)을 준 뒤 `getComputedStyle`로 읽어 비교한다. hex를 테스트에 적지 않는다. 표에 없으면 상태 `guest`, 폭 1280이다.

| # | 파일 | 이름 | 준비 | 기대 결과 | 잡아야 할 버그 |
| --- | --- | --- | --- | --- | --- |
| T0 | F6 | 기존 `UIUX-R T1`의 끝 4줄(`:83-86`) 교체 | 그대로 | 두 프레임 각각 `borderLeftWidth`·`borderRightWidth`·`borderBottomWidth` = `1px`, `borderTopWidth` = `3px`. 간격 16px 단언은 그대로 | 카드 테두리가 사라지거나 네 변이 다 굵어짐 |
| T1 | F6 | `DS2-1 프레임 바 4곳의 색` | — | 4곳 `borderTopWidth` = `3px`. `#weeklyStreakCard`·`#betterFrame`의 `borderTopColor` = `--now-ring`, `#recentSongCard`·`#vaultFrame` = `--ink`. 4곳 `borderLeftColor` = `--line` | 색이 서로 바뀜, `border` 축약이 바를 덮음, 네 변이 주황 |
| T2 | F6 | `DS2-2 카드 제목` | — | `#weeklyStreakCard h2` 글자 = `WEEKLY`, `#recentSongCard h2` 글자 = `RECENT` | 옛 문구가 남음 |
| T3 | F6 | `DS2-3 오늘 칸` | — | `#streakDays [data-today="1"]` 1개. 그 칸의 `borderTopColor` = `--now-ring`, `backgroundColor` = 틴트 계산값이고 `data-today`가 없는 칸의 배경과 다르다. 안의 요일 글자 `color` = `--ink` | 틴트가 빠짐, 요일 글자가 회색(4.31)으로 남음 |
| T4 | F6 | `DS2-4 오늘 연습을 마친 칸` | `{ ...STATES.user, sessions: { calendar: [{ date: <오늘 로컬 YYYY-MM-DD>, totalSeconds: 600 }], sessions: [] } }` | `[data-today="1"][data-practiced="1"]` 1개. `backgroundColor` = `--ink`, `borderTopColor` = `--now-ring`, 요일 글자 `color` = `--surface2` | 선언 순서가 틀려 틴트가 채움을 덮거나 요일 글자가 잉크 위 잉크가 됨 |
| T5 | F6 | `DS2-5 구간 배지` | ① `STATES.userData`(a=12, b=48) ② 같은 상태에서 곡마다 `a: null, b: null` | ① `#recentSongSegment`의 네 변 폭 `1px`·색 `--now-ring`, `backgroundColor` = 틴트 계산값, `color` = `--ink`, `borderTopLeftRadius` = `0px` ② `borderTopWidth` = `0px`, `color` = `--muted` | 구간이 없어도 배지가 붙음, 주황이 글자색으로 쓰임, 필 곡률 |
| T6 | F6 | `DS2-6 '이어서' 줄` | `{ ...STATES.guest, local: { 'ulp:tab': 'reint' } }` | `#modes li.cur` 1개이고 `boxShadow`에 `inset`과 `--now-ring` 계산색이 들어 있다. `cur`가 아닌 줄의 `boxShadow` = `none`. `#modes li.cur a`의 `paddingLeft` = `10px` | 선이 모든 줄에 붙음, 색이 잉크 |
| T7 | F6 | `DS2-7 배너 색` 라이트·다크 2개(다크는 `page.emulateMedia({ colorScheme: 'dark' })`) | — | `#homeCommunityBanner`의 `backgroundColor` = `--accent`, `#homeCommunityTitle`의 `color` = `--accent-ink`, `#homeCommunityLink`의 `color` = `--accent-ink`·`textDecorationLine`에 `underline`·`href` = `community.html`. 390폭에서 링크 높이 ≥ 44 | 글자가 `--ink`로 남아 면과 같은 색, 다크에서 반전 안 됨 |
| T8 | F6 | `DS2-8 배너 링크 포커스와 빈 썸네일` | 링크에 `focus()` 후 `matches(':focus-visible')`가 참인지 먼저 단언 | 링크의 `outlineColor` = `--accent-ink`, `outlineStyle` ≠ `none`. `#recentSongEmpty`·`#recentNoteEmpty` 안 빈 썸네일 칸의 `color` = `--ink` | 포커스 외곽선이 면과 같은 색이라 안 보임, 빈 썸네일 글자가 회색 |
| N1 | F7 | `DS2-N1 위 메뉴 로고` 폭 1280·390, `/privacy.html` | 기존 `open()` | `nav.site-nav a[href="./"]` 1개. 그 안 `svg[role="img"][aria-label="RE:DO"]` 1개가 보이고 높이 16 ± 0.5, 폭 66.56 ± 1. 링크 글자에 `HOME`이 들어 있다. `aria-current` 없음 | 로고가 0×0 또는 300px로 나옴, 홈 링크가 둘이 됨, 글자가 사라짐 |
| N2 | F7 | `DS2-N2 홈에서 위 메뉴` 폭 1280 | `/index.html` | `nav.site-nav a[href="./"]`의 `aria-current` = `page`, `nav.site-nav svg[aria-label="RE:DO"]` 1개(본문의 큰 로고는 `nav` 밖) | 로고를 넣으며 현재 화면 표시가 빠짐 |

기존 테스트가 그대로 지키는 것: `layoutSuite` 홈 17개(G0~G8·A1·금지 색 `--link`), `H6`(모듈에 `--link` 없음), `UI-1 T2·T3`, `W1-1~6`, `R1-H6`, `I0-1·5·6`, `LB-1·2`, `DR-1~5`, `BR1-1~7`, `cm-ui` 배너 링크.

## 7. 처리 순서와 체크리스트

순서: ① 브랜치 `step/DS-2` → ② §5 표를 결과 파일에 옮김 → ③ T0~T8·N1·N2를 먼저 쓰고 실패 확인(V1) → ④ F1~F5 구현 → ⑤ V2~V8 → ⑥ 결과·진행 파일 → ⑦ 커밋·push·PR·CI.

| # | 확인 | 명령 | 기대 |
| --- | --- | --- | --- |
| [ ] V1 | 구현 전 Red | `npm run build && node server.js`(별도 터미널) 뒤 `npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js -g "DS2\|UIUX-R T1"` | T0~T8·N1·N2가 실패한다(통과하는 것이 있으면 그 단언이 약한 것이므로 결과 파일에 적고 고친다) |
| [ ] V2 | 단위·정적 | `npm test` | 전부 통과(`fail 0`). DR-4·DR-5·I0-5·I0-6 포함 |
| [ ] V3 | 빌드 | `npm run build` | 오류 0 |
| [ ] V4 | 홈·셸 spec | `npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js` | 실패 0. 경고는 결과 파일에 "경고 n건 — 사유" |
| [ ] V5 | 가드 확인(변이 3개, 하나씩 넣고 원복) | ① `.barInk`를 `--now-ring`으로 ② `.streakCellDone.streakCellToday` 줄 삭제 ③ `recentHasLoop`를 `true`로 고정 | ① T1 ② T4 ③ T5가 각각 실패. 원복 뒤 `git status`에 변이 없음 |
| [ ] V6 | 전 화면 layout | `npx playwright test test/e2e/layout/` | 실패 0. `main`과 비교해 새 경고(`navRow`·G7b·G8의 `brandLink`)가 있으면 화면·폭·문구를 결과 파일에 적는다 |
| [ ] V7 | E2E 전체 | `npm run test:e2e` | 실패 0 |
| [ ] V8 | 스크린샷 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` → `home-curation-{390,768,1150,1280}.png`, `home-curation-1280-dark.png`, `home-guest-390.png` | Q1~Q9를 폭별 표로 판정. 꼭 볼 것: Q1(배너가 버튼처럼 보이지 않는가), Q7(유채색이 주황 하나, 바·오늘·배지·'이어서'에만), Q9(다크에서 배너가 밝은 면으로 뒤집힌 모습, 오늘+완료 칸의 테두리), 390에서 상단 메뉴 한 줄과 배지 두 줄 모양 |
| [ ] V9 | 다국어 값 | `grep -n "home.titleRecentSong" frontend/src/lib/i18n/*.mts` | 3줄 모두 `"RECENT"` |
| [ ] V10 | 범위 | `git diff --stat main` | §4의 파일 9개 + 문서 2개뿐 |

막히면 멈추고 보고할 것(값을 바꿔 통과시키지 않는다): `navRow` 중심 차이가 1px을 넘음, 390폭에서 상단 메뉴가 두 줄(W1-2 실패), 다른 화면 spec의 새 실패, 로고 폭이 66.56 ± 1 밖.

## 8. 결과 파일(`결과/DS-2.md`)에 적을 것

- 바꾼 파일 표, §5 배치 약속 표, V1~V10의 명령과 출력 끝부분, V5 변이 결과, V6 새 경고 목록, V8 질문 × 폭 판정 표, 예외 목록("없음").
- 명세와 달라진 점, 미실행 범위(운영 배포, 실제 로그인 데이터로 본 홈).
- DS-3 입력: 홈에서 본 것 중 다른 화면에 옮길 후보(프레임 바·배지 모양), 남은 G7b 경고, `--panel-bg`를 쓰는 다른 파일 2개(`PracticeSessionCard.module.css`·`EpisodeLogCard.module.css`, 없는 토큰 — 고치지 않고 기록만).

## 9. 하지 말 것

- `tokens.css`·`docs/rules/*`·`프론트_정렬규격.md`·`BrandLogo.tsx`·`lib/progressions.ts` 수정, 새 토큰·새 i18n 키 추가, 키 이름 변경.
- id·기존 클래스·기존 `data-align-group` 삭제나 이동, 인라인 `style`, 화면 CSS에 hex·`rgb()`, 주황을 `color`로 쓰기(DR-5), 2px 이상 테두리를 D1·D7 밖에 쓰기.
- §3 D13의 항목과 다른 화면 CSS 수정, `data-layout-ignore`·`known` 추가, 단언 완화·skip(T0 한 곳만 §6대로 교체).
- `인수인계_메모.md`·`계획/*` 수정(시니어 몫), 머지·배포.
