# DS-3 구현 명세 — 글자 크기 단계 정리, 없는 토큰 정리, 상단 메뉴 한 줄·터치 높이

> 작성: 2026-11-14 / Claude(시니어). 상위: [결과/DS-2](../결과/DS-2.md) §5(입력 ①~③)·§6-6(입력 ④·⑤), [결과/DS-0](../결과/DS-0_디자인결정.md) §2 ③, [계획 §4 디자인 규칙 후속 ③](../../계획/상용_서비스_계획.md), [디자인 규칙](../../docs/rules/frontend-design.md), [정렬 규격](../프론트_정렬규격.md). 진행: [진행_디자인D](../진행_디자인D.md).
> 담당: **[주니어] 구현·검증·PR → [시니어] 3단계 검증.** Step은 나누지 않는다(§1-1).
> 브랜치 `step/DS-3`, base `main`. 선행: PR #21(DS-2) 머지 확인됨(`main`=`29624e3`, 2026-11-14).
> **상태: 사용자 승인(2026-11-14) — U1~U7 모두 추천안대로.** §0의 U1~U7은 DS-0에 없던 결정이다. 이 명세는 각 항목의 추천안으로 썼다.
> 범위 밖: 프레임 바·배지의 다른 화면 전파(U4), 홈·다른 화면 본문의 터치 높이(U7), 화면 제목 크기 통일, 토큰 값 변경, 글자 크기 토큰 신설.

줄 번호는 `main`=`29624e3`에서 직접 열어 확인했다. 구현 전에 선택자로 다시 찾는다. 빌드·테스트는 이 명세를 쓰면서 실행하지 않았다(§2 "미확인"은 실행해야 알 수 있는 값이다).

## 0. 사용자 결정 항목

| ID | 무엇을 정하나 | 추천(이 명세가 따른 값) | 다른 선택 |
| --- | --- | --- | --- |
| U1 | **DS-3에 넣을 것.** 입력은 ① 다른 화면 전파 ② 터치 높이 경고 ③ 없는 토큰 `--panel-bg` ④ 비로그인 821~840px 상단 메뉴 두 줄 ⑤ 쌓이면 건너뛰는 `center-y` 판정, 그리고 글자 크기 단계 정리다 | **넣는다:** 글자 크기 단계(A), 없는 토큰(B, 입력 ③), 상단 메뉴 한 줄·전용 단언·메뉴 터치 높이(C, 입력 ④·⑤와 ②의 메뉴 부분). **넣지 않는다:** ①(U4), ②의 나머지(U7) | 항목별로 빼거나 더한다 |
| U2 | **글자 크기 단계.** 지금 값은 24가지다(P1) | 본문·제목 9단계 `12·13·14·15·16·17·18·24·32px` + 큰 제목 `clamp()` 3가지(현행 그대로). 단계 밖 값 7곳을 가까운 단계로 옮긴다(§3 D2 표). 토큰(`--fs-*`)은 만들지 않고 정적 검사로 지킨다 | ① 15·17을 없애 7단계로(선언 32곳이 더 바뀐다) ② 토큰을 만들어 408곳을 모두 바꾼다(보이는 변화 없이 diff만 커진다) |
| U3 | **11px 이하 글자.** 69곳 중 46곳이 배지·상태 문구·오류 문구·작은 버튼 같은 본문이다(P2). 규칙 §3은 "본문 12px 이상, 11px 이하는 공간이 정해진 표기에만"이다 | 본문 46곳을 `12px`로 올린다. 지판·건반·다이어그램·썸네일·요일 칸 안 표기 23곳은 그대로 둔다(§3 D3 표) | ① 오류·상태 문구만 올린다(약 10곳) ② 올리지 않고 현재 개수만 상한으로 묶는다 |
| U4 | **프레임 상단 바·주황 틴트 배지를 다른 화면에 옮기나**(입력 ①) | **옮기지 않는다.** 다른 화면에는 홈의 BETTER/VAULT 같은 "지금 하는 연습 / 보관" 구분이 없고, 구간 배지에 대응하는 요소도 없다(P6). 규칙 §2는 기존 화면을 일괄로 바꾸지 않고 지정한 요소만 바꾸게 한다 | 옮길 화면·카드를 지정한다(그 화면의 배치 약속·spec이 추가된다) |
| U5 | **비로그인 821~840px에서 메뉴를 한 줄로 만드는 방법**(입력 ④). 간격은 이미 다 줄였다(P8) | 821~880px에서만 홈 링크의 글자 `⌂ HOME`을 숨기고 로고만 둔다. 로고가 홈 링크이고 읽기 이름은 `RE:DO`로 남는다. 분기점 820px·글자 크기·메뉴 개수는 그대로다 | ① 같은 구간에서 로고를 숨긴다(로고가 좁은 구간에서만 사라진다) ② 탭 바 분기점을 820 → 880px로 올린다(`@821` 약속을 쓰는 모든 화면 spec을 고쳐야 한다) |
| U6 | **규칙 문서와 정적 검사 추가.** `docs/rules/frontend-design.md` §3·§4에 단계 표와 검사 2줄을 더하고, `test/design_rules.test.js`에 `DR-6`(글자 크기)·`DR-7`(정의 안 된 변수)을 더한다 | 더한다. 규칙 문서는 config 보관본 대조 대상이라 `bash scripts/check-config-sync.sh --copy`로 함께 맞춘다(P11) | 검사만 더하고 규칙 문서는 그대로 둔다 |
| U7 | **홈·푸터의 터치 높이 경고**(입력 ②의 나머지: 홈 위젯 링크 19px, 목록 줄 42px, `progScopeBtn` 28px, `randBtn` 34px, 푸터 테마 버튼 27px) | 이번에는 고치지 않는다. 카드 높이와 `top1`·`btns` 약속이 함께 움직이고 DS-2 D13에서 현행 유지로 둔 항목이다. 결과 파일에 화면별 남은 건수만 적는다 | 홈 링크 4곳·푸터 버튼을 이번에 44px로 올린다 |

승인하지 않는 항목이 있으면 그 항목의 "다른 선택"으로 §3·§4의 해당 줄만 바꾼다.

## 1. 판정

### 1-1. Step 분할 — 나누지 않는다

| 기준(협업 설명서 §1.2) | DS-3 |
| --- | --- |
| 사용자 여정 | 하나다. "모든 화면의 작은 글자가 읽히고, 메뉴가 한 줄이다" — 화면 기능은 바뀌지 않는다 |
| 검증 | 한 묶음이다. 정적 검사(`npm test`의 `DR-6`·`DR-7`) + 전 화면 layout spec + 스크린샷. A·B·C를 따로 PR로 내도 같은 전 화면 회귀를 세 번 돌린다 |
| 파일 수 7개 초과 | **넘는다**(코드 21개: CSS 17, TSX 1, 테스트 2, 규칙 문서 1. T6을 화면 spec에 넣으면 22개). CSS 16개는 값 1~15줄 교체다 |
| 예상 diff 600~700줄 초과 | 아니다(약 280줄: CSS 값 60줄, 메뉴 CSS·TSX 25줄, 테스트 170줄, 규칙 문서 25줄) |
| 하한 | B(8줄)·C(약 70줄)는 단독 Step이 될 수 없다 |
| 대기능 Step 수 | DS·BR은 이미 6개다. 더 나누지 않는다 |

파일 수 상한만 넘고, 사용자 지시(2026-11-14: 코드 길이가 아니라 "대기능 → 테스트" 기준으로만 나눈다)에 따라 **한 Step으로 둔다**(BR-1·DS-2와 같은 예외 기록).

### 1-2. 담당 — [주니어]

| 판정 질문 | 답 |
| --- | --- |
| ① 기존 화면의 DOM·클래스·테스트 셀렉터를 바꾸거나 옮기는가 | 지우거나 옮기지 않는다. `a.brandLink` 안 글자를 `span` 하나로 **감싼다**(클래스 1개 추가). 글자 크기를 단언하는 기존 테스트는 `cm-ui.spec.js:854`(탭 글자 ≥ 12) 한 곳이고 영향이 없다(P10) |
| ② 기존 화면과 새 화면이 같은 코드를 공유하며 공존하는가 | 아니다 |
| ③ 캐시·요청 경합·에러 구조 같은 암묵 계약에 의존하는가 | 아니다. state·effect·API를 건드리지 않는다 |

시니어 3단계에서 먼저 볼 곳: 12px로 올린 뒤 생긴 글자 잘림(G3)·줄바꿈, 메뉴 한 줄 판정의 폭 여유(웹폰트 유무), `DR-6` 허용 개수 표가 실제와 맞는지.

## 2. 전제 (Pre-flight, `main`=`29624e3`)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src` CSS 22개 파일, `font-size` 선언 408곳 | 값이 24가지다: `13px` 90 · `12px` 83 · `14px` 62 · `11px` 53 · `15px` 25 · `16px` 15 · `18px` 9 · `10px` 9 · `24px` 7 · `17px` 7 · `8px` 5 · `clamp(36px, 7vw, 56px)` 4 · `22px` 2 · `6px`·`9px`·`14.5px`·`20px`·`21px`·`28px`·`30px`·`32px`·`clamp(48px, 10vw, 96px)`·`clamp(24px, 5vw, 38px)`·`14px !important` 각 1. `font:` 축약으로 크기를 주는 곳은 없다(`font: inherit`뿐). TSX 인라인 `fontSize`는 0건이다. RG-1 때 수치는 20가지였다 |
| P2 | §3 D3 표의 줄 번호 | 11px 이하 69곳(11px 53, 10px 9, 9px 1, 8px 5, 6px 1). 다이어그램·고정 칸 표기 23곳(`ChordsPage.module.css` 19, `HomePage.module.css:156,239`, `EpisodeLogCard.module.css:20`, `EpisodeShareDialog.module.css:263`), 본문 46곳 |
| P3 | `tokens.css:165,189,213,249,268` · `docs/rules/frontend-design.md:47-53` | 전역 기본은 `body` 14px, `.pillBtn`·`.ghostBtn` 17px, `.inpField` 16px, `.msg` 13px. 규칙 §3은 대표 버튼 17px, 작은 버튼 14px 안팎, 본문 12px 이상만 정하고 단계 표가 없다. 글자 크기 토큰은 없다 |
| P4 | `test/design_rules.test.js:14-29,70-96` | `walkCss`가 `frontend/src`의 모든 CSS를 모으고 주석을 지운다. 검사는 `DR-1`~`DR-5`다. `DR-4`는 파일별 허용 개수 표(`KNOWN_RAW_COLORS`)와 실제 개수를 양쪽(초과·감소)으로 비교한다 — `DR-6`의 본보기 |
| P5 | `PracticeSessionCard.module.css:151,165,208` · `EpisodeLogCard.module.css:85,143,195,209,252` | `var(--panel-bg)` 8곳. `tokens.css`에 정의가 없어 배경이 투명하다. 진행 막대의 바탕(`.coverageBarWrap`·`::-webkit-progress-bar`) 4곳, 미니 썸네일 바탕(`.miniThumb`) 1곳, 글자가 들어가는 면 3곳(`.partsList` 2, `.mineBadge` 1 — 글자 `--muted`). `frontend/src` 전체에서 정의 없이 쓰는 변수는 이것과 `--tabbar-real-height`(`AppShell.tsx:50`이 실행 중에 넣는다)뿐이다 |
| P6 | `var(--now*\|--orange-*\|--moved)` 검색 23줄 · `CommunityParts.tsx:137,188` | 홈 밖의 주황은 지판·건반 표시(`ChordsPage.module.css` 12줄), 달력에서 고른 날의 외곽선(`LogPage.module.css:138`), 분석 중인 작업 테두리(`ProgressionsPage.module.css:184`)뿐이다. `Community.module.css:312`의 `.segBadge`는 구간이 아니라 공개 이름·메타 표기다. 홈의 "오늘 칸·구간 배지·이어서 줄"에 대응하는 요소가 다른 화면에 없다 |
| P7 | `AppShell.tsx:104-112,143-164` · `AppShell.module.css:19-58,67-95` | 홈 링크 `a.brandLink` 안은 `<BrandLogo …/>` + 글자 `t('nav.home')`(`⌂ HOME`, 감싼 요소 없음). `.brandLink`·`.navItem`은 `padding: 8px 2px`, 글자 14px이라 높이 약 38px이다(DS-2 실측 37.7px). `.navItem`은 `display`를 정하지 않는다(inline). `.siteNav`는 `min-height: 48px`, `padding-bottom: 12px`, `flex-wrap: wrap` |
| P8 | `AppShell.module.css:168-200` · [결과/DS-2](../결과/DS-2.md) §6-2 | DS-2에서 821~960px(간격 합 88px 축소)·360px 이하(24px 축소) 블록을 넣었다. 그 뒤 두 줄이 되는 폭은 비로그인 300~307·821~840px, 로그인 없음이다(1px 간격 실측). 즉 비로그인 821px에서 약 20px이 모자란다. `main`의 DS-2 이전 값은 비로그인 821~849px이었다 |
| P9 | `test/e2e/layout/shell.spec.js:18-36,69-103` · `test/e2e/support/layout-check.js:377-381` · `프론트_정렬규격.md:67` | `W1-2`는 390·768px에서 메뉴 높이 < 64px, `DS2-N1`은 1280·390px에서 링크 글자에 `HOME`, `DS2-N3`은 비로그인 880·320px와 로그인 834px 세 폭만 본다. 검사기는 `center-y` 구성원이 위아래로 쌓이면 판정을 건너뛴다(규격에 적힌 동작). `center-y` 그룹은 17개이고 그중 "어느 폭에서도 쌓이면 안 되는 줄"은 `navRow` 하나다(나머지는 좁은 폭에서 쌓이는 반응형 줄) |
| P10 | `test/` 전체 `fontSize` 검색 | 글자 크기 단언은 `test/e2e/cm-ui.spec.js:854`(커뮤니티 탭 글자 ≥ 12) 1건이다. DS-3은 값을 올리기만 하므로 영향이 없다 |
| P11 | `scripts/check-config-sync.sh:23` | `docs/rules/frontend-design.md`는 config 보관본(`ULevelP/rules/frontend-design.md.template`)과 대조하는 파일이다. 고치면 `--copy`로 복사하고 차이 0건을 확인한다 |
| P12 | `gh pr list --state open`(0건) · `개발산출물/진행_*.md` 3개 | 열린 PR이 없다. `진행_모바일스파이크.md`·`진행_다중LLM_자동화검토.md`에 `AppShell`·`design_rules`·`frontend-design`·`PracticeSessionCard`·`EpisodeLogCard`가 나오지 않는다 |
| P13 | 메뉴얼 항목 | DB·API·함수 시그니처·export 이름·파일 경로·i18n 키 변경 없음. 계약 성격의 변경은 규칙 문서 §3·§4(U6)와 새 정적 검사 2개다 |
| 미확인 | — | ① `⌂ HOME` 글자의 실제 폭(추정 60px + 간격 8px)과 821px에서의 여유 ② 12px로 올린 46곳의 줄바꿈·잘림(G3)·카드 높이 변화 ③ `BetaBadge` 12px이 메뉴 폭에 주는 영향(추정 +2px) ④ `.coverageBarWrap`이 보이는 layout spec 상태(§6 T5) ⑤ 다른 화면의 남은 G7b 건수. 모두 실행해야 알 수 있어 §7 V4·V6에서 처음 확인한다 |

## 3. 결정

| ID | 결정 |
| --- | --- |
| D1 | **단계.** 본문·제목은 `12·13·14·15·16·17·18·24·32px` 9단계, 큰 제목은 지금 쓰는 `clamp()` 3가지(`clamp(24px, 5vw, 38px)`·`clamp(36px, 7vw, 56px)`·`clamp(48px, 10vw, 96px)`)만 쓴다. 토큰은 만들지 않는다. 화면 제목(`pageTitle`)의 크기를 화면끼리 통일하지 않는다 |
| D2 | **단계 밖 값 7곳을 옮긴다**(아래 표). `Progressions.module.css:352`의 `14px !important`는 값이 단계 안이라 그대로 둔다 |
| D3 | **11px 이하.** 아래 표의 "올림" 46곳을 `12px`로 바꾼다. "유지" 23곳은 손대지 않는다. 굵기·글꼴·색·패딩은 바꾸지 않는다 |
| D4 | **없는 토큰.** 글자가 없는 면 5곳은 `var(--surface2)`로 바꾼다: `PracticeSessionCard.module.css:151,165`, `EpisodeLogCard.module.css:85,195,209`. 글자가 들어가는 면 3곳은 `background` 줄을 지운다(지금과 같게 보인다. `--surface2` 위 `--muted`는 대비 4.09라 쓰지 않는다): `PracticeSessionCard.module.css:208`, `EpisodeLogCard.module.css:143,252`. `.miniThumb` 안 빈 썸네일 글자 `.thumbPlaceholder`(`EpisodeLogCard.module.css:22`)의 `color`를 `var(--ink)`로 바꾼다(DS-2 D10과 같은 처리) |
| D5 | **메뉴 한 줄(U5).** `a.brandLink` 안 글자를 `<span className={styles.brandText}>`로 감싼다. `@media (min-width: 821px) and (max-width: 880px) { .brandText { display: none; } }`를 DS-2의 821~960px 블록 뒤에 둔다. 다른 폭에서는 지금과 같다. 지원하는 가장 좁은 폭은 320px이다(308px 미만의 두 줄은 고치지 않는다) |
| D6 | **메뉴 터치 높이.** `@media (max-width: 820px)` 블록 안에 `.brandLink, .navItem { display: inline-flex; align-items: center; min-height: 44px; }`를 넣는다. 메뉴 높이는 44 + 아래 패딩 12 = 56px로 `W1-2`(< 64px) 안이다. 821px 이상은 바꾸지 않는다 |
| D7 | **규칙 문서(U6).** §3에 D1의 단계 표와 "단계 밖 값·`font:` 축약으로 크기 지정 금지" 한 줄, "11px 이하는 `DR-6` 허용 표에 있는 파일에서만" 한 줄을 넣는다. §4 표에 `DR-6`·`DR-7` 두 줄을 넣는다. §1·§2는 바꾸지 않는다 |
| D8 | **전파 없음(U4)·홈 터치 높이 제외(U7).** 다른 화면 CSS에 `.barAccent`·`.barInk`·틴트 배지를 만들지 않는다. 푸터 테마 버튼과 홈 링크·목록 줄 높이는 그대로 둔다 |

D2 — 단계 밖 값:

| 위치 | 선택자 | 지금 → 바꿀 값 |
| --- | --- | --- |
| `pages/NotesPage.module.css:296` | `.noteCardDesc` | `14.5px` → `14px` |
| `pages/CommunityPage.module.css:92` | `.guestTitle` | `20px` → `18px` |
| `pages/ChordsPage.module.css:17` | `.pageTitle` | `21px` → `24px` |
| `pages/ProfilePage.module.css:33` | `.accountCard h2` | `22px` → `24px` |
| `pages/SettingsPage.module.css:80` | `.setSec h2` | `22px` → `24px` |
| `pages/SettingsPage.module.css:326` | `.creditTotal` | `28px` → `32px` |
| `pages/HomePage.module.css:530` | `.frameHead h2` | `30px` → `32px` |

D3 — 11px 이하(경로는 `frontend/src/` 아래):

| 파일 | 올림(→ `12px`) | 유지 |
| --- | --- | --- |
| `components/common/BetaBadge.module.css` | `:12 .badge` (1) | — |
| `components/community/Community.module.css` | `:298 .creatorBadge`, `:313 .segBadge` (2) | — |
| `components/community/EpisodeLogCard.module.css` | `:122 .playBadge`, `:131 .creatorBadge`, `:140 .mineBadge`(이상 10px), `:180 .metaRow`, `:229 .coveragePct`, `:243 .partsToggleBtn`, `:262 .partItem`, `:287 .publishDate`, `:318 .reportBtn` (9) | `:20 .thumbPlaceholder` 10px — 80×45 썸네일 안 (1) |
| `components/community/EpisodeReportDialog.module.css` | `:102 .charCount`, `:109 .privacyNotice` (2) | — |
| `components/progressions/Progressions.module.css` | `:50 .kindBadge`, `:172 .chipNote`, `:177 .chipWarn` (3) | — |
| `components/songRecord/EpisodeShareDialog.module.css` | `:334 .chipPlay` (1) | `:263 .miniBadge` 8px — 16px 원 안 (1) |
| `components/songRecord/PracticeSessionCard.module.css` | `:126 .ghostMini`, `:185 .coveragePct`, `:199 .partsToggleBtn`, `:218 .partItem`, `:251 .memoStatus`, `:273 .shareBadgeNone`, `:278 .shareBadgePublished`, `:284 .shareBadgePaused`, `:290 .shareBadgeWithdrawn`, `:295 .shareBadgeChecking`, `:306 .shareBadgeHidden`, `:312 .hiddenReason`, `:324 .shareErrorText`, `:329 .actionMsg` (14) | — |
| `components/songRecord/SongRecordParts.module.css` | `:227 .btnAccordion`, `:267 .partRange`, `:272 .partDuration`, `:276 .partBadge`, `:302 .btnComplete`, `:316 .btnDelete` (6) | — |
| `pages/HomePage.module.css` | `:383 .genreMove`(10px), `:612 .itemMeta`, `:787 .progBadge`, `:795 .progKey` (4) | `:156 .dowText`(요일 칸), `:239 .recentPlaceholder`(썸네일 안) (2) |
| `pages/LogPage.module.css` | `:165 .calLegend` (1) | — |
| `pages/PracticePage.module.css` | `:370 .ppSetPt small`, `:485 .ppDriveBadge`, `:844 .presetBadge` (3) | — |
| `pages/ChordsPage.module.css` | — | `:67,71,72,218,244,437,512,519,539,549,551,556,572,579,594,595,600,601,606` — 건반·지판·코드 다이어그램·순서 표기 (19) |
| 합 | 46 | 23 |

## 4. 파일별 변경

목록에 없는 파일은 고치지 않는다.

| # | 파일 | 구분 | 바꿀 것 |
| --- | --- | --- | --- |
| F1 | D3 표의 CSS 11개(올림이 있는 파일) | 수정 | `font-size` 값 46줄 |
| F2 | D2 표의 CSS 6개(`HomePage.module.css`는 F1과 겹친다) | 수정 | `font-size` 값 7줄 |
| F3 | `PracticeSessionCard.module.css` · `EpisodeLogCard.module.css`(F1과 같은 파일) | 수정 | D4: `--surface2` 5줄, `background` 줄 삭제 3줄, `.thumbPlaceholder` `color` 1줄 |
| F4 | `frontend/src/components/layout/AppShell.tsx` | 수정 | `:111`의 `{t('nav.home')}`를 `<span className={styles.brandText}>{t('nav.home')}</span>`로(D5). 다른 줄은 그대로 |
| F5 | `frontend/src/components/layout/AppShell.module.css` | 수정 | D5 미디어 블록 1개(`:186` 뒤), D6 규칙 1개(`:202`의 820px 블록 안) |
| F6 | `test/design_rules.test.js` | 수정 | §6 T1·T2(`DR-6`·`DR-7`) 추가. `DR-1`~`DR-5`는 그대로 |
| F7 | `test/e2e/layout/shell.spec.js` | 수정 | §6 T3·T4·T5 추가. 기존 테스트는 그대로 |
| F8 | `docs/rules/frontend-design.md` | 수정 | D7. 고친 뒤 `bash scripts/check-config-sync.sh --copy` → `bash scripts/check-config-sync.sh` 차이 0건(config 저장소 커밋·push 포함) |
| F9 | `개발산출물/결과/DS-3.md` | 신규 | §8 형식 |
| F10 | `개발산출물/진행_디자인D.md` | 수정 | DS-3 상태·PR 번호·CI 결과 |

코드 파일 수: CSS 17개(F1 11개 + F2에서 새로 5개 + F5. F3은 F1과 같은 파일), TSX 1, 테스트 2(T6을 화면 spec에 넣으면 3), 규칙 문서 1.

## 5. 배치 약속

새 그룹·새 구성원이 없다. 폭별 열 구성도 모든 화면에서 지금과 같다. 달라지는 것은 상단 메뉴 한 줄뿐이다.

| 그룹 | 선 | 구성원 | DS-3 |
| --- | --- | --- | --- |
| `navRow` | center-y | `a.brandLink`, SETTING 링크 | 유지. **320px 이상 모든 폭에서 한 줄**(검사기는 쌓이면 건너뛰므로 §6 T3의 전용 단언으로 지킨다) |
| `tabs` | top,bottom,height | 하단 탭 6칸 | 유지 |
| 그 밖의 화면별 그룹 | — | — | 유지(글자 12px로 줄 높이가 달라져도 약속은 그대로 통과해야 한다) |

`data-layout-ignore`는 새로 쓰지 않는다. `known`도 추가하지 않는다. 12px로 올려 G3(글자 잘림)가 새로 나면 예외를 붙이지 않고 멈추고 보고한다(§7).

## 6. 테스트 표

| # | 파일 | 이름 | 준비 | 기대 결과 | 잡아야 할 버그 |
| --- | --- | --- | --- | --- | --- |
| T1 | F6 | `DR-6: 글자 크기는 단계 값만 쓰고 11px 이하는 허용 표의 파일에만 있다` | `cssFiles` 전체(`tokens.css` 포함). 값에서 `!important`를 떼고 비교 | ① `font-size` 값이 D1의 12개 문자열 또는 `6px·8px·9px·10px·11px` 중 하나 ② 11px 이하 선언 수가 파일별 표 `KNOWN_SMALL_TEXT`와 **같다**(초과·감소 모두 실패 — `DR-4`와 같은 양쪽 비교): `pages/ChordsPage.module.css` 19, `pages/HomePage.module.css` 2, `components/community/EpisodeLogCard.module.css` 1, `components/songRecord/EpisodeShareDialog.module.css` 1 ③ `font:` 축약에 `px`가 들어간 선언 0건 ④ 표의 파일이 실제로 있다 | 새 화면이 11px 본문·단계 밖 값을 다시 씀, 표의 숫자가 실제와 어긋난 채 방치됨 |
| T2 | F6 | `DR-7: 정의하지 않은 CSS 변수를 쓰지 않는다` | `tokens.css`에서 `--이름:` 정의를 모으고, 모든 CSS의 `var(--이름`을 대조. 실행 중에 넣는 변수 표 `RUNTIME_VARS = ['--tabbar-real-height']` | 정의도 없고 표에도 없는 변수 0건. `RUNTIME_VARS`의 각 이름은 `frontend/src`의 `.tsx`에서 `setProperty('<이름>'`로 실제 쓰인다 | 없는 토큰을 써서 배경·색이 조용히 빠짐(`--panel-bg`) |
| T3 | F7 | `DS3-N1 <상태> <폭>px 위 메뉴 한 줄` — 상태 `guest`·`user` × 폭 `320, 360, 390, 768, 820, 821, 830, 840, 860, 880, 881, 900, 960, 961, 1150, 1280`, `/privacy.html` | `DS2-N3`과 같은 `open()` | SETTING 링크와 `#navAuth`의 `top`이 홈 링크의 `bottom`보다 위(같은 줄), 메뉴 높이 < 64px, `scrollWidth <= clientWidth` | 구간 경계(821·880·881·960·961)에서 두 줄, 글자를 올린 `BetaBadge` 때문에 넘침 |
| T4 | F7 | `DS3-N2 홈 글자는 821~880px에서만 숨는다` — 폭 `820, 850, 881` | 비로그인 | 850px: `a[href="./"]` 안 `HOME` 글자 요소가 숨김(`toBeHidden`), 로고 `svg[aria-label="RE:DO"]` 보임·폭 66.56 ± 1, 링크가 `getByRole('link', { name: /RE:DO/ })`로 찾아진다. 820·881px: 글자 보임 | 글자가 모든 폭에서 사라짐, 로고까지 숨음, 링크 이름이 비어 버림 |
| T5 | F7 | `DS3-N3 <폭>px 위 메뉴 터치 높이` — 폭 `390, 768`, 그리고 `1280` | 비로그인 | 390·768px: 홈·SETTING·`#navAuth` 링크 높이 ≥ 44, `navRow` 세로 중심 차이 ≤ 1px. 1280px: 링크 높이 < 44(넓은 폭은 그대로) | 높이 규칙이 넓은 폭까지 번짐, 세로 중심이 틀어짐 |
| T6 | 해당 화면 spec 1곳(`log.spec.js` 또는 `community.spec.js`) | `DS3-P1 진행 막대 바탕` | `[class*="coverageBarWrap"]`가 보이는 기존 상태(미확인 ④ — 없으면 결과 파일에 적고 이 줄은 `DR-7`으로 대신한다) | 그 요소의 `backgroundColor`가 `--surface2` 계산값과 같다(DS-2 §6의 임시 요소 방식) | 막대 바탕이 투명 |

기존 테스트가 그대로 지키는 것: `layoutSuite` 전 화면(G0~G8·A1), `W1-1~6`, `DS2-1~8`, `DS2-N1~N3`, `DR-1~5`, `I0-1·5·6`, `BR1-1~7`, `cm-ui.spec.js:854`.

## 7. 처리 순서와 체크리스트

순서: ① 브랜치 `step/DS-3` → ② T1~T6을 먼저 쓰고 실패 확인(V1) → ③ F1~F5 구현 → ④ F8 규칙 문서·보관본 → ⑤ V2~V9 → ⑥ 결과·진행 파일 → ⑦ 커밋·push·PR·CI·리뷰 확인.

| # | 확인 | 명령 | 기대 |
| --- | --- | --- | --- |
| [ ] V1 | 구현 전 Red | `npm test 2>&1 \| tail -40` · `npm run build` 뒤 `npx playwright test test/e2e/layout/shell.spec.js -g "DS3"` | `DR-6`·`DR-7` 실패(`DR-6`은 단계 밖 7곳·파일별 개수 차이, `DR-7`은 `--panel-bg` 8곳을 메시지에 낸다). `DS3-N1 guest 821·830·840`, `DS3-N2`, `DS3-N3 390·768` 실패. 통과하는 줄은 결과 파일에 "구현 전 통과 — 회귀 가드"로 적는다 |
| [ ] V2 | 단위·정적 | `npm test` | `fail 0` |
| [ ] V3 | 빌드 | `npm run build` | 오류 0 |
| [ ] V4 | 셸 spec | `npx playwright test test/e2e/layout/shell.spec.js` | 실패 0. 821px 비로그인의 남는 폭(메뉴 폭 − 내용 폭)을 결과 파일에 적는다(미확인 ①) |
| [ ] V5 | 가드 확인(변이 4개, 하나씩 넣고 원복) | ① 아무 CSS에 `font-size: 11px` 한 줄 추가 ② `ChordsPage.module.css:17`을 `21px`로 ③ `.brandText` 미디어 블록 삭제 ④ D6 규칙 삭제 | ① ② `DR-6` ③ `DS3-N1 guest 821` ④ `DS3-N3 390`이 각각 실패. 원복 뒤 `git status`에 변이 없음 |
| [ ] V6 | 전 화면 layout | `npx playwright test test/e2e/layout/` | 실패 0. `main` 대비 새 G3·G8 경고와 `[navRow]` G7b가 사라졌는지(390·768px)를 결과 파일에 적는다 |
| [ ] V7 | E2E 전체 | `npm run test:e2e` | 실패 0 |
| [ ] V8 | 스크린샷 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/{home,log,community,practice,progressions,share-dialog}.spec.js` | 화면별 4개 폭 + 다크 1장에서 Q1~Q9 판정. 꼭 볼 것: Q3·Q4(12px로 올린 배지·상태 문구가 카드 제목보다 커 보이지 않는가, 두 줄로 꺾인 배지), Q6(390px에서 연습 기록 카드·공유 카드의 배지 줄), 850px 메뉴 캡처 1장(로고만 있는 홈 링크) |
| [ ] V9 | 보관본·범위 | `bash scripts/check-config-sync.sh` · `git diff --stat main` | 차이 0건. §4의 코드 21개(T6 spec 포함 시 22개) + 문서 2개뿐 |

막히면 멈추고 보고할 것(값을 바꿔 통과시키지 않는다): 12px로 올린 뒤 새 G3 실패나 `known` 없이 못 넘는 겹침(G2), 821px 비로그인이 글자를 숨겨도 두 줄, `DR-6` 개수가 이 명세의 46·23과 다름, `check-config-sync` 차이가 `frontend-design.md` 밖에서 나옴.

## 8. 결과 파일(`결과/DS-3.md`)에 적을 것

- 바꾼 파일 표, V1~V9의 명령과 출력 끝부분, V5 변이 결과, V6 경고 변화(화면·폭·건수), V8 질문 × 폭 판정 표, 예외 목록("없음").
- 실측: 821px 비로그인 메뉴의 남는 폭, 글자 크기 값 종류 수(전 24 → 후), 11px 이하 선언 수(전 69 → 후 23).
- 명세와 달라진 점, 미실행 범위(운영 배포, 실제 로그인 데이터 화면).
- 남긴 것: 화면별 남은 G7b 건수(U7), 308px 미만 메뉴 두 줄, 화면 제목 크기 차이(`ChordsPage` 24 · `LogPage` 32 · `CommunityPage` 24 · 나머지 `clamp`).

## 9. 하지 말 것

- `tokens.css` 수정(새 토큰 포함), `프론트_정렬규격.md`·`layout-check.js` 수정, 새 i18n 키, `BrandLogo.tsx` 수정.
- D2·D3 표 밖의 `font-size` 변경, 굵기·줄 높이·패딩을 함께 조정해 잘림을 피하기(먼저 보고), "유지" 23곳 변경.
- 다른 화면에 프레임 바·틴트 배지 추가(U4), 홈 링크·목록 줄·푸터 버튼 높이 변경(U7), 화면 제목 통일.
- id·기존 클래스·기존 `data-align-group` 삭제나 이동, 인라인 `style`, `data-layout-ignore`·`known` 추가, 단언 완화·skip.
- `인수인계_메모.md`·`계획/*` 수정(시니어 몫), 머지·배포.
