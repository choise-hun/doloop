# DS-1 구현 명세 — 토큰·규칙 개정(주황 값, 프레임 바·배너 예외), 토큰 밖 색 교체, 대비 처리

> 작성: 2026-11-14 / Claude(시니어). 상위: [결과/DS-0](../결과/DS-0_디자인결정.md) §1·§2, [RG 결과 §2](../결과/RG_규칙정비.md), [디자인 규칙](../../docs/rules/frontend-design.md). 진행: [진행_디자인D](../진행_디자인D.md). 선행: PR #18 머지(`main`=`84fd68a`).
> 담당: **[주니어] 구현·검증·PR → [시니어] 핀포인트 검토.** 판정: CSS 값 교체와 문서·정적 검사 수정뿐이고 DOM·상태·API 변경이 없다.
> 브랜치 `step/DS-1`, base `main`. **상태: 사용자 승인 대기(§2의 D3·D5·D6·D8·D9는 DS-0에 없던 새 디자인 결정).**
> 범위 밖: 홈 화면 CSS(`HomePage.module.css`)와 홈 마크업(DS-2), 이름·로고 교체(BR-1), 글자 크기 정리(DS-3).

## 0. 사용자 확인 결과 (2026-11-14)

| 질문(결과/DS-0 §3) | 답 | 반영 |
| --- | --- | --- |
| 기존 파랑 토큰 범위 | **유지.** `--link`·`--root`·`--guide`와 지판 색 구분은 그대로 둔다 | 파랑 토큰 값·사용처를 바꾸지 않는다. 규칙 문구만 "새 화면·새 요소에는 쓰지 않는다"로 고친다(D2) |
| 한글 표기 | 필요 없음 | BR-1 입력 |
| 도메인 | 바꿀 수 있으면 바꾼다 | BR-1 명세에서 방법·비용을 정리하고 실제 연결은 BR-2(사람) |

PR #18 Codex 리뷰: 지적 없음(`has_any_findings:false`, 커밋 `b8f4b36`).

## 1. 전제 (`main`=`84fd68a`, 구현 전 재확인)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/styles/tokens.css:35-40` | 라이트 `--orange-vivid:#e64d01`, `--orange-terra:#c34811`, `--now:#f3d3bf`, `--now-ink:#1d1d1f`, `--now-ring:#c34811`, `--moved:#c34811` |
| P2 | `tokens.css:86-91`, `:121-126` | 다크(두 블록 같은 값) `--orange-vivid:#ff6b2b`, `--orange-terra:#e07b4a`, `--now:#f3d3bf`, `--now-ring:#e07b4a`, `--moved:#e07b4a` |
| P3 | `tokens.css:28`, `:81`, `:116` | `--root-ink`는 라이트·다크 모두 `#f6f6f1` |
| P4 | `test/design_rules.test.js:39-46` | `KNOWN_RAW_COLORS` 6개 파일 합계 **22**(3·2·8·2·4·3). DS-0·계획·RG 결과의 "25곳"은 RG-1 때 수치이고, 그 뒤 `EpisodeShareDialog`가 5 → 2로 줄었다. 표와 실제가 다르면 DR-4가 실패하므로 실제 개수는 22다 |
| P5 | `test/design_rules.test.js:83` | `tokens.css`는 DR-4 대상에서 빠진다(토큰 정의 파일) |
| P6 | `test/r0_core.test.js:24-33` | `REQUIRED_TOKENS`가 토큰 이름의 존재만 본다. 값은 단언하지 않는다. 토큰 이름을 지우면 실패한다 |
| P7 | `test/e2e/support/layout-check.js:117-145` | G5b 팔레트는 스타일시트의 모든 `--*` 변수를 색으로 풀어 자동으로 만든다. 새 색 토큰은 따로 등록하지 않아도 팔레트에 들어간다 |
| P8 | `components/progressions/Progressions.module.css:176-190` | `.chipWarn`(11px)·`.warnLine`(13px)이 `color: var(--orange-terra)`. 주황을 글자색으로 쓰는 곳은 이 두 곳뿐이다. 문구 앞에 `⚠`/`✕` 기호가 있다(`ProgressionEditor.tsx:147`, `ProgressionRow.tsx:122`) |
| P9 | `pages/PracticePage.module.css:502-506` | 녹음 중 버튼이 `background: var(--bad)` 위에 `color: var(--root-ink)` |
| P10 | `pages/ChordsPage.module.css:66-69` | 건반 `.keyNow`는 `fill: var(--orange-vivid)`, 그 위 라벨(8px)은 `--root-ink` |
| P11 | `pages/ProgressionsPage.module.css:175-185` | `.jobs li`는 `--surface2` 배경 + 1px 점선, `.jobActive`는 `border-color: var(--now-ring)` |
| P12 | `pages/HomePage.module.css:213` | `.recentPlaceholder`가 `--surface2` 배경에 `--muted` 글자(같은 블록에서 두 값을 함께 쓰는 유일한 곳) |
| P13 | `개발산출물/프론트_정렬규격.md:179`, `:211` | §5-4 "두꺼운 테두리(2~3px)를 절대 쓰지 않고", Q7 "파랑은 작은 면적, 주황은 지정 용도(지금 칠 음·스트릭)뿐인가". 현재 버전 v1.6 |
| P14 | `package.json:13` | `npm test` = `node --test test/*.test.js` |

대비 계산값(WCAG 2.x 상대 휘도, 이 명세 작성 때 계산):

| 조합 | 현재 | 변경 뒤 |
| --- | --- | --- |
| 주황 / `--bg` · `--surface` · `--surface2` · `--wood` (라이트) | `#C34811` 4.26 · 4.55 · 3.72 · 3.90 | `#E64D01` 3.34 · 3.57 · 2.92 · 3.06 |
| 주황 / `--bg` · `--surface` · `--surface2` (다크) | `#E07B4A` 6.07 · 5.52 · 4.85 | `#FF6B2B` 6.31 · 5.74 · 5.05 |
| `--ink` / `--now` `#f3d3bf` | 11.93 | 변경 없음 |
| `--muted` / `--bg` · `--surface` · `--surface2` (라이트) | 4.69 · 5.01 · **4.09** | 값 유지(D7) |
| `--muted` / `--surface2` (다크) | 5.09 | — |
| 다크 `--root-ink` / `--root` `#5c74f0` | **3.72** | `#141413` 4.57 |
| `--bad` / `--bg` · `--surface` · 10% 틴트 (라이트) | 5.64 · 6.03 · 4.82 | — |
| `--good` / `--bg` · `--surface` · 10% 틴트 (라이트) | 5.52 · 5.90 · 4.82 | — |
| 옛 `#dc2626` / `--bg`, `#059669` / `--bg`, `#d97706` / `--surface` | 4.17 · 3.25 · 2.94 | 토큰으로 교체(D5) |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | **주황 값.** `--orange-terra`·`--now-ring`·`--moved`를 라이트 `#e64d01`, 다크 `#ff6b2b`로 바꾼다(다크 두 블록 모두). `--orange-vivid`는 이미 같은 값이라 그대로다. 토큰 이름은 하나도 지우지 않는다(P6). 표기는 파일 관례대로 소문자 |
| D2 | **`--now` 틴트는 `#f3d3bf` 유지**(라이트·다크). 그 위 글자 `--now-ink` 11.93으로 충분하고, 지판에서 "지금 칠 음"은 채움과 3px 고리를 함께 써서 구분한다. 홈의 "주황 틴트"(오늘 칸·구간 배지)는 다크에서 `--now`가 너무 밝으므로 DS-2에서 `color-mix(in srgb, var(--now-ring) 12%, transparent)`를 쓴다 → DS-2 입력 |
| D3 | **주황은 글자색으로 쓰지 않는다**(라이트 3.34~3.57). P8 두 곳을 `color: var(--ink)`로 바꾼다. 경고 표시는 이미 있는 `⚠`/`✕` 기호가 맡고, `.chipBad .chipWarn`의 `--bad`는 그대로다. 대안: `--muted`(경고가 약해 보임) |
| D4 | **규칙 예외 2건**(§4-2 문구). ① 프레임 상단 바 3px ② 홈 커뮤니티 배너 면 채움. 둘 다 "여기에만" 허용하고 다른 곳으로 넓히지 않는다. 실제 CSS 적용은 DS-2 |
| D5 | **토큰 밖 색 22곳 → 0곳**(§3 표). 상태 색은 `--bad`·`--good`, 반투명은 `color-mix`, 일시중지 배지 `#d97706`은 `--ink`(굵기 700 유지)로 바꾼다. `KNOWN_RAW_COLORS`는 빈 객체가 된다 |
| D6 | **새 토큰 2개.** `--scrim`(모달·서랍 뒤 어둡게 덮는 면)과 `--media-bg`(영상 레터박스 검정). 이유: 덮는 면은 다크 모드에서도 어두워야 해서 `--ink` 기반 `color-mix`를 쓸 수 없다(다크의 `--ink`는 밝다). 값은 §4-1. 덮는 면 농도 0.35·0.45·0.5 세 가지를 한 값으로 합친다. 대안: 토큰 없이 6곳을 영구 예외로 남김(허용 개수 8) |
| D7 | **`--muted`/`--surface2` 4.09 → 값은 바꾸지 않고 규칙으로 막는다.** DS-0에서 `--muted` 현행 유지를 정했다. 규칙에 "`--surface2` 면 위 글자는 `--ink`"를 추가한다. 지금 걸리는 곳은 P12 한 곳이고 홈 CSS라 DS-2에서 고친다 → DS-2 입력. 대안: `--muted`를 `#63625b`로(4.62, 모든 화면의 보조 글자가 조금 진해짐) |
| D8 | **다크 `--root-ink`를 `#141413`으로**(다크 두 블록, 라이트는 `#f6f6f1` 유지). `--root` 위 3.72 → 4.57. 같은 토큰을 쓰는 P9(다크 `--bad` 위 2.29 → 7.44)·P10(다크 주황 건반 위 2.62 → 6.49)도 함께 좋아진다. 파랑 값 자체는 건드리지 않는다(§0). 대안: 다크 `--root`를 `#4a63e6`으로 어둡게(4.59, 지판 근음 점 색이 바뀜) |
| D9 | **`--orange-terra`/`--bg` 4.26**은 D3으로 글자 사용이 없어져 해소된다. 표시·테두리 용도는 3.0 기준으로 본다: `--bg` 3.34, `--surface` 3.57, `--wood` 3.06 통과. `--surface2` 위는 2.92라 P11 `.jobs li` 배경을 `--surface`로 바꾼다(3.57, 점선 테두리는 유지) |
| D10 | 정렬 규격 v1.7: §5-4와 Q1·Q7 문구를 D4에 맞춘다(§4-4). 판정식·기준값 변화 없음 |

## 3. 토큰 밖 색 교체 목록 (22곳)

줄 번호는 `main`=`84fd68a` 기준이다. 선택자로 다시 찾는다.

| # | 파일(`frontend/src/`) : 줄 | 선택자 · 속성 | 지금 | 바꿀 값 |
| --- | --- | --- | --- | --- |
| 1 | `components/community/Community.module.css:390` | `.nameModalBackdrop` background | `rgba(0, 0, 0, 0.5)` | `var(--scrim)` |
| 2 | 같은 파일 `:789` | `.modalBackdrop` background | `rgba(0, 0, 0, 0.45)` | `var(--scrim)` |
| 3 | 같은 파일 `:994` | `.quickBackdrop` background | `rgba(0, 0, 0, 0.45)` | `var(--scrim)` |
| 4 | `components/community/EpisodeLogFeed.module.css:65` | `.errorBox` color | `#dc2626` | `var(--bad)` |
| 5 | 같은 파일 `:66` | `.errorBox` border-color | `rgba(220, 38, 38, 0.3)` | `color-mix(in srgb, var(--bad) 30%, transparent)` |
| 6 | `components/community/EpisodeReportDialog.module.css:5` | `.overlay` background | `rgba(0, 0, 0, 0.5)` | `var(--scrim)` |
| 7 | 같은 파일 `:23` | `.dialog` box-shadow 색 | `rgba(0, 0, 0, 0.15)` | `color-mix(in srgb, var(--ink) 15%, transparent)` (`0 8px 24px` 유지) |
| 8 | 같은 파일 `:117` | `.errorAlert` background | `rgba(220, 38, 38, 0.1)` | `color-mix(in srgb, var(--bad) 10%, transparent)` |
| 9 | 같은 파일 `:118` | `.errorAlert` border 색 | `rgba(220, 38, 38, 0.3)` | `color-mix(in srgb, var(--bad) 30%, transparent)` |
| 10 | 같은 파일 `:120` | `.errorAlert` color | `#dc2626` | `var(--bad)` |
| 11 | 같은 파일 `:126` | `.successAlert` background | `rgba(16, 185, 129, 0.1)` | `color-mix(in srgb, var(--good) 10%, transparent)` |
| 12 | 같은 파일 `:127` | `.successAlert` border 색 | `rgba(16, 185, 129, 0.3)` | `color-mix(in srgb, var(--good) 30%, transparent)` |
| 13 | 같은 파일 `:129` | `.successAlert` color | `#059669` | `var(--good)` |
| 14 | `components/songRecord/EpisodeShareDialog.module.css:6` | `.overlay` background | `rgba(0, 0, 0, 0.5)` | `var(--scrim)` |
| 15 | 같은 파일 `:24` | `.dialog` box-shadow 색 | `rgba(0, 0, 0, 0.15)` | `color-mix(in srgb, var(--ink) 15%, transparent)` |
| 16 | `components/songRecord/PracticeSessionCard.module.css:280` | `.shareBadgePublished` color | `#059669` | `var(--good)` |
| 17 | 같은 파일 `:286` | `.shareBadgePaused` color | `#d97706` | `var(--ink)` |
| 18 | 같은 파일 `:308` | `.shareBadgeHidden` color | `#dc2626` | `var(--bad)` |
| 19 | 같은 파일 `:325` | `.shareErrorText` color | `#dc2626` | `var(--bad)` |
| 20 | `pages/PracticePage.module.css:107` | `.ppVideo` background | `#000000` | `var(--media-bg)` |
| 21 | 같은 파일 `:573` | `.ppScrim` background | `rgba(0, 0, 0, 0.35)` | `var(--scrim)` |
| 22 | 같은 파일 `:783` | `.modalBackdrop` background | `rgba(0, 0, 0, 0.45)` | `var(--scrim)` |

`Community.module.css:5`의 `#fff/#ffffff`는 주석이라 세지 않는다(그대로 둔다).

## 4. 파일별 변경

### 4-1. `frontend/src/styles/tokens.css`

- 머리 주석 2~3번 줄을 새 규칙에 맞춘다: 2번 "파란색은 기존 링크·지판 근음 점에만 남기고 새 화면에는 쓰지 않는다", 3번 "주황색(#E64D01, 다크 #FF6B2B)은 유일한 포인트 색이다. 지금 칠 음·스트릭·프레임 바 같은 표시와 테두리에만 쓰고 글자색으로 쓰지 않는다".
- 섹션 주석 `/* 3. 메인 컬러 파랑 … */` → `/* 3. 파랑 (기존 링크·지판 전용, 새 화면에는 쓰지 않는다) */`, `/* 4. 두 번째 포인트 주황 … */` → `/* 4. 포인트 주황 (표시·테두리 전용, 글자색 금지) */`.
- 값:

| 토큰 | `:root` | 다크 두 블록 |
| --- | --- | --- |
| `--orange-terra` | `#e64d01` | `#ff6b2b` |
| `--now-ring` | `#e64d01` | `#ff6b2b` |
| `--moved` | `#e64d01` | `#ff6b2b` |
| `--root-ink` | `#f6f6f1`(유지) | `#141413` |
| `--scrim` (신규, 5번 섹션 끝) | `rgb(0 0 0 / 0.45)` | `rgb(0 0 0 / 0.6)` |
| `--media-bg` (신규, 5번 섹션 끝) | `#000000` | `#000000` |

- 그 밖의 토큰과 `:root` 아래 공통 클래스는 건드리지 않는다.

### 4-2. `docs/rules/frontend-design.md`

- §1 용도 표 두 줄 교체:
  - `| 파랑(기존 화면 전용) | --link, --root, --guide, --blue-vivid | 본문 링크, 지판의 근음·가이드 음. 이미 쓰는 곳만 유지하고 새 화면·새 요소에는 쓰지 않는다 |`
  - `| 주황(유일한 포인트) | --now*, --moved, --orange-* | 지금 칠 음, 바뀐 음, 스트릭·오늘 표시, 프레임 상단 바, "이어서" 표시. 표시·테두리·틴트에만 쓰고 글자색으로 쓰지 않는다(라이트 대비 3.3~3.6) |`
- §1 표에 두 줄 추가: `| 덮는 면 | --scrim | 모달·서랍 뒤 배경. 다크에서도 어둡다 |`, `| 영상 바탕 | --media-bg | 영상 레터박스 |`
- §1 목록에 추가:
  - "`--surface2` 면 위의 글자는 `--ink`를 쓴다. `--muted`는 대비 4.09라 쓰지 않는다."
  - "가장 어두운 채움" 줄 끝에: "예외: 홈 커뮤니티 배너 한 곳은 `--accent` 면 채움 + `--accent-ink` 글자로 만든다(DS-0). 배너 안의 이동은 버튼이 아니라 밑줄 텍스트 링크다. 다른 화면·다른 카드로 넓히지 않는다."
  - "화면 하나에 유채색은 한 가지" 줄을 "새 화면의 유채색은 주황 하나다. 파랑은 위 표의 기존 용도에만 남는다."로.
- §1 "알려진 예외" 절: 표를 지우고 "토큰 밖 색은 없다(DS-1에서 0으로 정리). `test/design_rules.test.js` DR-4가 `tokens.css` 밖의 hex·`rgb()`·`hsl()`을 모두 실패로 본다." 한 문단으로 바꾼다.
- §2 "직각 요소는 …" 줄 끝에: "예외: 카드의 프레임 상단 바는 `border-top: 3px solid`로 만든다(주황 `--now-ring` 또는 `--ink`, DS-0). 목록 항목의 '이어서' 표시는 왼쪽 3px 주황 선이다. 이 두 가지 말고는 2px 이상 테두리를 쓰지 않는다."
- §4 표 첫 줄 "토큰 밖 색 증가" → "토큰 밖 색".

### 4-3. `test/design_rules.test.js`

- `KNOWN_RAW_COLORS = {}`로 바꾸고 위 주석을 "토큰 밖 색은 0이다(DS-1). 새 예외를 이 표에 추가하지 않는다."로 고친다. `stale` 단언과 끝의 파일 존재 확인 반복문은 그대로 둔다(빈 객체에서 그대로 통과).
- DR-4 테스트 이름 → `'DR-4: tokens.css 밖에서 hex·rgb()·hsl()을 쓰지 않는다'`.
- 새 검사 `DR-5: 주황 토큰을 글자색으로 쓰지 않는다`: 모든 CSS(`tokens.css` 제외)에서 `/(?:^|[\s;{])color\s*:\s*var\(--(?:orange-[a-z]+|now-ring|moved)\)/`에 걸리는 선언을 모아 빈 배열과 비교한다. `border-color`·`background-color`·`outline-color`는 앞 글자 조건으로 걸리지 않는다. `--now-ink`는 대상이 아니다.

### 4-4. `개발산출물/프론트_정렬규격.md` (v1.7)

- 버전 줄 맨 앞에 `v1.7 (2026-11-14, DS-1 — 프레임 바·배너 예외와 유채색 문구 §10)`.
- `:179` 문장 뒤에 "예외는 `docs/rules/frontend-design.md` §2의 프레임 상단 바·'이어서' 선(3px)뿐이다." 추가.
- Q1 끝에 "(홈 커뮤니티 배너의 면 채움은 버튼으로 세지 않는다)", Q7을 "유채색은 주황 하나인가. 주황은 표시·테두리·틴트에만 쓰였는가. 파랑은 기존 링크·지판에만 남았는가"로.
- §10 표에 한 줄: `| v1.7 (DS-1) | §5-4 3px 예외, Q1·Q7 문구 | DS-0 결정(주황 하나, 프레임 바, 잉크 배너) | 판정식·기준값 변화 없음 |`.

### 4-5. 화면 CSS

- §3 표 22곳(5개 폴더 6개 파일).
- `components/progressions/Progressions.module.css` `.chipWarn`·`.warnLine`: `color: var(--ink)` (D3).
- `pages/ProgressionsPage.module.css` `.jobs li`: `background: var(--surface)` (D9).
- 그 밖의 선택자·크기·간격·마크업은 건드리지 않는다. TSX 변경 없음.

### 4-6. 문서 상태

- `결과/DS-1.md` 신설(§6 형식), `진행_디자인D.md` DS-1 상태·PR 번호, `계획/상용_서비스_계획.md:84` ①·②에 "DS-1 완료(PR #n)" 표시.

## 5. 검증

| # | 명령·방법 | 통과 기준 |
| --- | --- | --- |
| V1 | 구현 전 `node --test test/design_rules.test.js` | DR-5를 먼저 추가하면 `Progressions.module.css` 2건으로 **실패**(Red). `KNOWN_RAW_COLORS = {}`만 먼저 바꾸면 DR-4가 6개 파일로 실패 |
| V2 | 구현 뒤 `node --test test/design_rules.test.js` | 5 tests pass |
| V3 | `npm test` | 전부 통과(`r0_core` 포함) |
| V4 | `npm run build` (`tsc --noEmit && vite build`) | 오류 0 |
| V5 | 실패 확인: 아무 CSS 끝에 `.zz { color: var(--moved); background: rgba(0,0,0,.1); }`를 임시로 넣는다 | DR-4·DR-5 실패 → 원복 뒤 `git status`에 그 파일 없음 |
| V6 | `grep -rnE "#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsla?\(" frontend/src --include='*.css'`에서 `tokens.css`와 주석을 뺀 결과 | 0줄 |
| V7 | Playwright layout spec 중 `chords`·`log`·`practice`·`progressions`·`community` | 새 G5a 실패 0. G5b 경고가 늘면 결과 파일에 목록을 적는다(`color-mix` 결과는 팔레트 밖 경고가 날 수 있다 — 기존과 같은 수준) |
| V8 | 스크린샷(라이트·다크, 390·1280): ① chords 지판(근음·지금 칠 음·바뀐 음 구분, 다크 근음 점 글자) ② practice 녹음 중 버튼(다크)·서랍 덮는 면·영상 영역 ③ 신고 창 오류·성공 알림 ④ 공유 배지 3종(게시·일시중지·숨김) ⑤ progressions 경고 문구·진행 중 작업 줄 ⑥ log 달력 선택 칸 | 질문 Q7·Q9(다크 대비)로 검토, 결과 파일에 판정 한 줄씩 |

미실행으로 남기는 것: 홈 화면 변화(주황 값이 바뀌어 스트릭 점·오늘 칸 테두리 색이 달라진다 — 의도된 변화, 홈 정리는 DS-2), 운영 배포.

## 6. 결과 파일(`결과/DS-1.md`)에 적을 것

- 바꾼 토큰 값 표, 새 토큰 2개, 교체한 22곳 확인(V6 출력), DR-1~5 출력 끝부분, `npm test` 합계, V7 경고 목록, V8 스크린샷 판정.
- DS-2 입력: ① 홈 주황 틴트는 `color-mix(in srgb, var(--now-ring) 12%, transparent)` ② `.recentPlaceholder`의 `--muted` → `--ink` ③ 프레임 바·배너는 §4-2 예외 문구를 따른다.
- 관찰(범위 밖, 고치지 않음): 라이트 건반 `.keyNow` 라벨(8px, `--root-ink`/`#e64d01` 3.57)은 예전부터 4.5 미만이다. `--now-ink`로 바꿔도 4.35라 글자 크기·굵기까지 함께 봐야 한다 — DS-3 후보.

## 7. 하지 말 것

- 파랑 토큰 값·사용처 변경, `--muted` 값 변경, 토큰 이름 삭제.
- `HomePage.module.css`·홈 TSX·`AppShell` 수정, 이름·로고 관련 수정.
- §3 표에 없는 색 교체, 곡률·간격·글자 크기 변경.
