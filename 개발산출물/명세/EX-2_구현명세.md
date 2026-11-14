# EX-2 · EX-3 구현명세 — 유튜브 재생 화면 연습 패널

> 2026-11-15 / Mac / 시니어 1단계(명세만). 기준 `main`=`105fb9b`(PR #23 머지). **구현 미승인 — §0의 U7~U9 승인 대기.** 이 단계에서 저장소의 코드·테스트는 만들지도 실행하지도 않았다. 유튜브 화면 전제만 읽기 전용으로 조사했다(§2 V4).
> 상위: [EX-1 구현 명세](EX-1_크롬확장_구현명세.md) §6·§7(초안) · [결과/EX-1](../결과/EX-1.md) §3·§7 · [진행_크롬확장](../진행_크롬확장.md). 이 문서가 상위 §6·§7의 EX-2 부분을 대신한다(달라진 점은 §2 보정 표).

## 0. 사용자 결정 (승인 필요)

| ID | 결정 항목 | 추천 | 대안 |
| --- | --- | --- | --- |
| U7 | Step 분할·담당 | 상위 명세의 EX-2 하나를 **EX-2(연습 패널, 서버 호출 없음) [주니어]** 와 **EX-3(저장 연결) [시니어 직접 구현]** 로 나눈다(§1) | 한 Step: 예상 변경 900~1,000줄·사용자 여정 2개로 상한(700줄·여정 1개) 초과. 전부 시니어: 격리된 패널·순수 함수까지 고가 모델이 쓰게 된다 |
| U8 | 연습 시간 집계 기준(U5 구체화, EX-3) | 패널이 열려 있고 영상이 **재생 중인 시간 전체**(반복을 켰는지와 무관, 광고 제외). 서버에는 [저장]을 눌렀을 때만 보낸다 — 웹 플레이어와 같은 기준(`PracticePage.tsx:1347-1348`) | [반복]을 켠 동안만 집계: 구간 없이 통으로 따라 치는 연습이 기록되지 않는다 |
| U9 | 패널을 닫았을 때(EX-3에서 재생 화면 버튼이 패널 안으로 들어간 뒤) | 닫으면 그 탭에서는 **아무것도 표시하지 않는다**. 다시 열기와 곡 추가는 우클릭 메뉴("연습 패널 열기"·"RE:DO에 추가")로 한다 | 닫으면 EX-1의 작은 버튼으로 돌아간다: 같은 상태(추가·있음)를 두 곳이 따로 관리하게 되어 계정·영상 전환 경합이 늘어난다 |

선행 조건(2026-11-15 확인): PR #23 머지 **충족**. EX-사람 ②(`ALLOWED_ORIGINS`) **미충족** — 운영 서버가 확장 출처 POST에 403(`curl -X POST -H 'Origin: chrome-extension://pamcfmpmaoehcmddfieihilojkfjfpld' …/api/health` → 403). 따라서 EX-1 수동 검수 TC-EX-04~07도 **미실시**로 본다(결과 기록 없음). EX-2는 서버를 부르지 않아 이 조건과 무관하게 구현·검수할 수 있다. **EX-3은 EX-사람·EX-1 수동 검수 뒤에 착수한다**(선택자·로그인 흐름이 실화면에서 다르면 EX-3 계약이 바뀐다).

## 1. Step 분할·담당 판정 (협업 §1.2)

| Step | 담당 | 사용자 여정 | 파일(§3·§9) | 예상 변경 | 판정 근거 |
| --- | --- | --- | --- | --- | --- |
| EX-2 | **[주니어]** 4단계(명세 → 구현·PR → 시니어 검증 → 정리) | 유튜브 재생 화면에서 구간 반복·배속·단축키로 연습한다(로그인 불필요) | 신규 2 + 수정 4 = 6 | 550~650줄 | ① 기존 DOM·클래스·테스트 선택자 변경 없음(`.redo-watch-btn`은 그대로 둔다) ② 기존 코드와 공유 없음(새 파일이 스스로 화면 전환을 듣는다) ③ 서버 호출·요청 경합 없음. 판정 로직은 전부 순수 함수 표(§4)로 고정 |
| EX-3 | **[시니어 직접 구현]** → 전체 회귀·PR·CI는 주니어 4단계 | 연습한 구간·배속·시간을 RE:DO에 저장한다 | 수정 5 + 신규 1 = 6 | 350~450줄 | ① `.redo-watch-btn`을 패널로 옮긴다 — `test/extension_ex1.test.js:458-515`(PR23-3)가 이 클래스·문구를 고정 ③ 계정·영상 전환 중 늦은 응답, `keep` 응답에 따른 누적분 차감, 저장 중복 방지 |

EX 대기능의 Step은 EX-1·EX-2·EX-3 **3개**(권장 상한 이내). 하한도 충족한다(둘 다 브라우저에서 따로 검수할 수 있고 150줄을 넘는다).

## 2. 전제 확인

**상위 초안 대비 보정**

| # | 상위 초안 | 실제 (근거) | 보정 |
| --- | --- | --- | --- |
| P7 | `requestAnimationFrame`으로만 감시(§6.2) | 탭이 뒤로 가면 rAF가 멈춘다. 악보·다른 창을 보며 연습하면 B를 지나쳐 재생된다 — **백그라운드 동작은 미확인**(TC-EX-10b로 본다) | rAF(반복 켠 동안) + `<video>`의 `timeupdate` 두 곳에서 같은 `tick`을 부른다 |
| P8 | 저장에 성공하면 보낸 누적분을 뺀다(§6.3) | 그날 첫 기록인데 `addSeconds`<60이면 서버는 시간을 **기록하지 않고** `keep:true`·`pendingSeconds`를 돌려준다(`PracticeService.kt:158-169`, 상수 `:239`). 구간·배속·위치는 저장된다(`:125-136`) | `keep === false`일 때만 뺀다(웹 플레이어 `PracticePage.tsx:385-388`과 같음). `keep:true` 문구는 §9 |
| P9 | 재생 화면 버튼을 EX-2에서 패널 안으로 옮긴다(결과/EX-1 §7) | 버튼의 클래스·문구·재조회 동작을 PR23-3 테스트가 고정한다(`test/extension_ex1.test.js:458-515`) | EX-2에서는 그대로 두고 패널을 그 아래에 둔다. 옮기는 일은 EX-3 |
| P10 | `LOOKUP_SONG`에 `songId`·`a`·`b`·`rate`를 더한다(결과/EX-1 §7) | 지금 응답은 `{ state, openUrl }`뿐이다(`background.js:146-159`). 서버 `SongDto`에는 `id: String`, `a: Double?`, `b: Double?`, `rate: Double`이 있다(`SongService.kt:31-48`, 응답 `SongEnvelope(song: SongDto?)` `:51`) | EX-3에서 `song: { id, a, b, rate }`를 **더한다**(`state`·`openUrl`은 그대로) |
| P11 | 기존 곡에 `POST /songs`를 보내면 A·B가 저장된다고 읽힐 수 있다(§6.3 미등록 분기) | 기존 곡이면 서버는 보낸 `a`·`b`·`rate`를 **버리고** 저장값 그대로 200을 준다(`SongService.kt:277-282`, `SongRoutes.kt:70-74`) | 200이면 패널 값을 유지한 채 "저장 안 됨"으로 두고 [저장]으로 보낸다(§9) |
| P12 | 단축키가 유튜브 단축키와 겹치지 않는다(TC-EX-09) | 조사 결과 겹치지 않는다(V4-5). 윈도우 실기기는 **미확인** | 수동 검수 유지 |

**확인한 기존 코드(유지 계약)**

| 근거 | 내용 |
| --- | --- |
| `extension/content.js:8-19` | 선택자 상수 `REDO_SEL`. `adShowing: '#movie_player.ad-showing'`는 값만 있고 쓰는 곳이 없다 |
| `extension/content.js:41-51` | `redoWatchVideoId(href)` — 재생 화면이면 videoId, 아니면 `null`. 최상위 함수라 뒤에 오는 콘텐츠 스크립트에서 그대로 부를 수 있다(같은 격리 영역, 결과/EX-1 §7) |
| `extension/content.js:53`, `:398-401` | 나머지(`ask`·`showToast`·`logoIcon`·`syncWatchButton`)는 `redoInit` **안의 지역 함수**라 다른 파일에서 부를 수 없다. `window.__redoContentLoaded`로 한 번만 실행 |
| `extension/content.js:377-378` | 화면 전환은 `document`의 `yt-navigate-finish`와 `window`의 `popstate`로 듣는다 |
| `extension/background.js:213-229`, `:231-239` | 우클릭 메뉴는 `onInstalled`에서 `removeAll` 뒤 2개(`redo-add-link`, `redo-add-page`)를 만들고, 눌리면 `tabs.sendMessage(tab.id, …).catch(() => {})` |
| `extension/overlay.css:12-29`, `:55-58`, `:104` | 재생 화면 버튼 `position:fixed; top:64px; right:16px; height:36px; z-index:2100`. 전체 화면에서는 숨긴다. 알림 `z-index:2300` |
| `extension/manifest.json:15-22` | `content_scripts[0].js`는 `["content.js"]`. 매니페스트 테스트는 목록의 파일이 실제로 있는지만 본다(`test/extension_ex1.test.js:267-289`) |
| `test/extension_ex1.test.js:155-156` | 콘텐츠 스크립트의 순수 함수는 `vm.createContext({ URL })`에 파일을 읽어 넣어 확인한다 |

**V4 유튜브 재생 화면 조사** (2026-11-15, 헤드리스 크로미움 134 · 비로그인 · 한국어 · 1280×800, 영상 `jNQXAC9IVRw`. 수동 검수를 대신하지 않는다)

| # | 확인한 것 | 결과 |
| --- | --- | --- |
| V4-1 | 영상 요소 | `#movie_player video`는 1개, 클래스 `video-stream html5-main-video` |
| V4-2 | 배속 직접 지정 | `video.playbackRate = 0.75` 뒤 4초·`currentTime` 이동·구간 되감기 3회 동안 0.75 유지. `ratechange`는 지정할 때 1번만 |
| V4-3 | 구간 되감기 | rAF에서 `!video.seeking && currentTime >= 5`일 때 `currentTime = 3` → 5.002~5.008초에서 되감김(한 프레임 이내) |
| V4-4 | 영상 전환 | 화면 안 링크로 다른 영상에 가면 `yt-navigate-finish`가 오고, **같은 `<video>` 요소가 다시 쓰이며 배속은 1로 돌아간다**. 이때 `#movie_player.ad-showing`이 참이었다(광고가 같은 요소로 재생, 선택자 실재 확인) |
| V4-5 | Alt 조합 | `Alt`+`1`·`4`·`L`·`R`·`[`·`]`·`-`·`=` 모두 재생 위치·일시정지·배속 변화 없음(대조: `L`만 누르면 +10초, `1`만 누르면 10% 지점) |
| V4-6 | 화면 배치 | 상단 바 높이 56px·`z-index` 2020. 기본 보기에서 플레이어는 x 16~896(오른쪽 380px은 추천 목록) |
| 미확인 | 로그인 상태, 영화관 모드·미니 플레이어, 긴 시간(10분 이상) 배속 유지, 백그라운드 탭의 `timeupdate`, 윈도우 | 수동 검수(§7)로 본다. 구조가 다르면 패널이 "영상을 찾지 못했습니다"를 보일 뿐 오류는 없다 |

## 3. EX-2 파일 목록

| 파일 | 구분 | 하는 일 |
| --- | --- | --- |
| `extension/practice-panel.js` | 신규 | 순수 함수(§4) + 패널·루프·배속·단축키(`redoPanelInit`) |
| `extension/content.js` | 수정 | `REDO_SEL`(`:8-19`)에 `video: '#movie_player video.html5-main-video'` 한 줄만 더한다. 그 밖은 건드리지 않는다 |
| `extension/background.js` | 수정 | 우클릭 메뉴 `redo-open-panel` 추가(`:213-229`)와 클릭 처리(`:231-239`) |
| `extension/overlay.css` | 수정 | `.redo-panel…` 규칙 추가(기존 규칙은 그대로) |
| `extension/manifest.json` | 수정 | `content_scripts[0].js`를 `["content.js", "practice-panel.js"]`로. 권한·버전 변경 없음 |
| `test/extension_ex2.test.js` | 신규 | §7 단위 테스트 |
| `개발산출물/결과/EX-2.md` · `진행_크롬확장.md` | 문서 | 주니어가 결과·상태 기록 |

목록 밖(`auth.js`·`options.*`·`test/extension_ex1.test.js`·서버·`frontend/`)은 고치지 않는다.

## 4. EX-2 시그니처

`practice-panel.js`는 `content.js`처럼 모듈이 아닌 일반 스크립트다(`'use strict'`, 최상위 함수, `redo` 접두어). 맨 아래 실행 가드는 `content.js:398-401`과 같은 모양으로 `window.__redoPanelLoaded`를 쓴다.

**상수**: `REDO_RATE_MIN = 0.25`, `REDO_RATE_MAX = 2`, `REDO_RATE_STEP = 0.05`, `REDO_RATE_PRESETS = [0.5, 0.75, 0.9, 1]`, `REDO_MIN_LOOP_SEC = 0.5`, `REDO_PANEL_MSG_MS = 3000`, `REDO_VIDEO_RETRY_MS = 500`(최대 10번).

| 함수 | 인자 → 반환 | 규칙 |
| --- | --- | --- |
| `redoFormatTime(sec)` | `number\|null` → `string` | `null`·유한하지 않은 값 → `'--:--.-'`. 그 밖은 `mm:ss.s`(분 두 자리 이상, 초 `ss.s`). 예: `83.44` → `'01:23.4'`, `4503.26` → `'75:03.3'`, `0` → `'00:00.0'` |
| `redoRoundTime(t)` | `number` → `number` | 소수 첫째 자리 반올림 후 0~86400으로 자른다(서버 `setScale(1)`·범위 `PracticeRoutes.kt:33-40`) |
| `redoClampRate(x)` | `number` → `number` | 소수 둘째 자리 반올림 후 0.25~2로 자른다. 유한하지 않으면 `1` |
| `redoStepRate(rate, dir)` | `(number, 1\|-1)` → `number` | `redoClampRate(rate + dir * 0.05)`. 경계에서는 같은 값 |
| `redoSetA(state, t)` | `({a,b,loopOn}, number)` → `{a,b,loopOn}` | `a = redoRoundTime(t)`. `b`가 있고 `b - a < 0.5`이면 `b = null`, `loopOn = false` |
| `redoSetB(state, t)` | 같음 → `{a,b,loopOn,error?}` | `a`가 `null`이면 `a = 0`. `redoRoundTime(t) - a < 0.5`이면 값을 바꾸지 않고 `error: 'order'` |
| `redoLoopAction(s)` | `{loopOn,a,b,t,seeking,ad}` → `'jump'\|'none'` | `loopOn && !ad && !seeking && a != null && b != null && t >= b`일 때만 `'jump'` |
| `redoShortcutAction(e)` | `{code,altKey,ctrlKey,metaKey,shiftKey,repeat}` → 행동 이름 또는 `null` | `altKey`만 참일 때(나머지 셋 거짓) 아래 표. `repeat`이면 `rateDown`·`rateUp`만 허용. `event.key`는 쓰지 않는다 |
| `redoIsEditableTarget(el)` | 요소 → `boolean` | `tagName`이 `INPUT`·`TEXTAREA`·`SELECT`이거나 `isContentEditable`이 참 |
| `redoClampPanelPos(p)` | `{x,y,w,h,vw,vh}` → `{x,y}` | `x`는 `0 ~ max(0, vw - w)`, `y`는 `56 ~ max(56, vh - 40)` |
| `redoPanelInit()` | → 없음 | DOM·이벤트 연결(§5·§6). 실행 가드 안에서만 부른다 |

| `code` | 행동 | 버튼 |
| --- | --- | --- |
| `BracketLeft` | `setA` | A 지정 |
| `BracketRight` | `setB` | B 지정 |
| `KeyL` | `loop` | 반복 |
| `KeyR` | `restart` | 처음으로 |
| `Digit1` / `Digit2` / `Digit3` / `Digit4` | `preset0` ~ `preset3` | 0.5x / 0.75x / 0.9x / 1.0x |
| `Minus` / `Equal` | `rateDown` / `rateUp` | −0.05 / +0.05 |

`background.js`: 상수 `MENU_PANEL = 'redo-open-panel'`. `onInstalled`에서 세 번째로 `contextMenus.create({ id: MENU_PANEL, title: '연습 패널 열기', contexts: ['page', 'video'], documentUrlPatterns: ['https://www.youtube.com/watch*'] })`. `onClicked`에서 `MENU_PANEL`이면 `tabs.sendMessage(tab.id, { type: 'REDO_PANEL_OPEN' }).catch(() => {})`만 하고 끝낸다(곡 추가 분기로 내려가지 않는다). export·기존 메시지 변경 없음.

## 5. EX-2 화면 — DOM·문구·상태

유튜브는 Trusted Types를 강제한다. `innerHTML`을 쓰지 않고 `createElement`·`textContent`만 쓴다(진행 §4). `document.body`에 붙인다.

```
div.redo-panel  role="region" aria-label="RE:DO 연습 패널" data-redo-collapsed="0|1"
├ div.redo-panel__head                      ← 끌어서 옮기는 손잡이
│  ├ span.redo-panel__title                 "RE:DO 연습"
│  ├ button.redo-panel__icon-btn[data-redo-act="collapse"]  aria-expanded, aria-label "접기"|"펼치기", 글자 "–"|"+"
│  └ button.redo-panel__icon-btn[data-redo-act="close"]     aria-label "닫기", 글자 "×"
└ div.redo-panel__body                      ← 접으면 hidden
   ├ div.redo-panel__row  button[data-redo-act="setA"] "A 지정" · output[data-redo-out="a"] · button[data-redo-act="setB"] "B 지정" · output[data-redo-out="b"]
   ├ div.redo-panel__row  button[data-redo-act="loop"][aria-pressed] "반복" · button[data-redo-act="restart"] "처음으로" · button[data-redo-act="clear"] "초기화" · output[data-redo-out="loops"] "0회"
   ├ div.redo-panel__row  button[data-redo-act="rateDown"] "−0.05" · output[data-redo-out="rate"] "1.00x" · button[data-redo-act="rateUp"] "+0.05"
   ├ div.redo-panel__row  button[data-redo-act="preset0"] "0.5x" · [preset1] "0.75x" · [preset2] "0.9x" · [preset3] "1.0x"   ← 지금 배속과 같은 것에 aria-pressed="true"
   └ p.redo-panel__status[data-redo-out="status"] role="status" aria-live="polite"
```

- 모든 버튼은 `type="button"`, 클래스 `redo-panel__btn`. `title`은 `단축키 Alt+[`처럼 단축키를 적는다(표 순서대로 `Alt+[`·`Alt+]`·`Alt+L`·`Alt+R`·`Alt+1`~`Alt+4`·`Alt+-`·`Alt+=`). 초기화·접기·닫기는 단축키가 없다.
- 모양(`overlay.css`): 패널은 `position:fixed; top:108px; right:16px; width:280px; z-index:2100`, 배경 `#f6f6f1`, `border:1px solid #cfcec4`, `border-top:3px solid #e64d01`, 곡률 0(직각). 버튼은 높이 32px·곡률 9999px·`border:1px solid #1d1d1f`, 눌린 상태(`aria-pressed="true"`)는 배경 `#1d1d1f`·글자 `#f6f6f1`. 초점은 `outline:2px solid #e64d01`. 글꼴은 `.redo-watch-btn`(`overlay.css:26`)과 같은 묶음. 색은 이 4개(`overlay.css:2`)만 쓴다. `.redo-panel__body[hidden]{display:none}`을 명시한다(`display:flex`가 `hidden`을 덮는다). 전체 화면에서는 `overlay.css:55-58`과 같은 선택자 모양으로 패널을 숨긴다.
- 끌기: `head`에서 `pointerdown`(버튼 위는 제외) → `pointermove`마다 `redoClampPanelPos` 결과를 `style.left`·`style.top`에 넣고 `style.right = 'auto'`. 위치는 그 탭의 메모리에만 둔다(저장소를 쓰지 않는다 — 결과/EX-1 §4-7). `window` `resize` 때 다시 자른다.

| 상황 | `status` 문구 | 그 밖 |
| --- | --- | --- |
| 평소 | 빈 문자열 | |
| 광고 재생 중 | `광고가 끝나면 이어집니다` | 광고 동안 계속 표시. `setA`·`setB`·`restart` 버튼 `disabled` |
| A·B 없이 [반복] | `A와 B를 먼저 지정하세요` | 3초 뒤 지움. 반복은 꺼진 채 |
| `redoSetB`가 `error: 'order'` | `B는 A보다 0.5초 이상 뒤여야 합니다` | 3초 뒤 지움 |
| 배속이 경계라 값이 안 바뀜 | `배속은 0.25~2.0 범위입니다` | 3초 뒤 지움 |
| `video.duration`이 유한하지 않은데 A·B 지정 | `이 영상에서는 구간을 지정할 수 없습니다` | 3초 뒤 지움(실시간 방송·불러오는 중) |
| 영상 요소를 5초 안에 못 찾음 | `영상을 찾지 못했습니다. 페이지를 새로고침해 주세요` | 계속 표시. 본문 버튼 전부 `disabled` |

## 6. EX-2 처리 순서

상태(한 탭에 하나): `videoId`, `video`, `a`, `b`, `loopOn`, `loops`, `rate`, `wasAd`, `closed`, `collapsed`, `pos`.

1. **화면 전환** — `document` `yt-navigate-finish`, `window` `popstate`(0ms 뒤), 스크립트 시작 때 한 번 `sync()`를 부른다. `content.js`를 고쳐 부르게 하지 않는다.
2. **`sync()`** — `id = redoWatchVideoId(location.href)`.
   - `id`가 `null`: 패널 제거, rAF 중단, `loopOn = false`, `videoId = null`.
   - `closed`이면 아무것도 만들지 않는다(`videoId`만 기록).
   - `id`가 바뀌었으면 `a = b = null`, `loopOn = false`, `loops = 0`으로 되돌린다(같은 `id`면 유지).
   - 패널이 없으면 만든다. `video = document.querySelector(REDO_SEL.video)`. 없으면 500ms마다 최대 10번 다시 찾고, 그 사이 `videoId`가 바뀌었으면 그 재시도는 버린다.
   - 찾은 `video`에 `timeupdate`·`ended`·`ratechange` 리스너를 **요소당 한 번만** 건다(V4-4: 같은 요소가 다시 쓰인다. 요소에 표시를 남겨 중복을 막는다). `rate = redoClampRate(video.playbackRate)`.
3. **`tick()`** — rAF(반복이 켜진 동안만 이어 간다)와 `timeupdate`가 부른다. `closed`이거나 `video`가 없으면 끝.
   - `ad = Boolean(document.querySelector(REDO_SEL.adShowing))`. `ad`가 바뀌면 상태 문구·버튼 `disabled`를 맞춘다.
   - 광고가 방금 끝났고(`wasAd && !ad`) `video.playbackRate`가 `rate`와 다르면 `video.playbackRate = rate`.
   - `redoLoopAction({ loopOn, a, b, t: video.currentTime, seeking: video.seeking, ad })`가 `'jump'`면 `video.currentTime = a`, `loops += 1`.
   - `wasAd = ad`.
4. **`ended`** — `loopOn && !ad && a != null`이면 `video.currentTime = a`, `loops += 1`, `video.play()`(반환 Promise의 거부는 무시).
5. **`ratechange`** — 광고 중이면 무시. 아니고 `video.playbackRate`가 `rate`와 0.001 넘게 다르면 `rate = redoClampRate(video.playbackRate)`로 **받아들인다**(유튜브 자체 속도 메뉴로 바꾼 경우). 되돌려 쓰지 않는다.
6. **버튼·단축키 행동**(같은 함수 하나를 부른다)
   - `setA`/`setB`: 광고 중이면 무시. `video.duration`이 유한하지 않으면 문구만. 아니면 `redoSetA`/`redoSetB` 결과를 상태에 넣는다.
   - `loop`: 끄는 것은 언제나 된다. 켜려는데 `a`·`b` 중 하나라도 `null`이면 문구만. 켜면 `video.currentTime`이 `a` 미만이거나 `b` 이상일 때 `a`로 옮기고 rAF를 시작한다.
   - `restart`: 광고 중이면 무시. `video.currentTime = a ?? 0`. `loops`는 올리지 않는다.
   - `clear`: `a = b = null`, `loopOn = false`, `loops = 0`. 배속은 그대로.
   - `preset0~3`/`rateDown`/`rateUp`: 새 값이 지금과 같으면 문구(경계)만. 아니면 `rate`를 바꾸고 광고 중이 아니면 `video.playbackRate = rate`(광고 중이면 3번에서 광고 뒤에 적용된다).
   - `collapse`: `collapsed` 뒤집기. `close`: `closed = true`, `loopOn = false`, rAF 중단, 패널 제거(배속은 건드리지 않는다).
7. **단축키** — `window`에 `keydown`을 **캡처 단계**로 한 번 건다. `videoId`가 없거나 `closed`이거나 `e.isComposing`이거나 `redoIsEditableTarget(e.composedPath()[0])`이면 끝. `redoShortcutAction(e)`가 값을 주면 `e.preventDefault()`·`e.stopPropagation()` 뒤 6번을 부른다(맥에서 `⌥`+키가 글자를 넣지 않게). 접혀 있거나 전체 화면이어도 동작한다.
8. **다시 열기** — `chrome.runtime.onMessage`에서 `{ type: 'REDO_PANEL_OPEN' }`이면 `closed = false` 뒤 `sync()`.
9. 매 변경 뒤 `render()`가 `output`·`aria-pressed`·`aria-expanded`·`hidden`·`disabled`를 상태에서 다시 쓴다(§5). `a`·`b`는 `redoFormatTime`, 배속은 `rate.toFixed(2) + 'x'`, 횟수는 `loops + '회'`.

## 7. EX-2 테스트·검수

단위(`test/extension_ex2.test.js`, `node:test`. 순수 함수는 `vm.createContext({ URL })`에 `content.js`·`practice-panel.js`를 차례로 읽어 넣어 부른다 — `extension_ex1.test.js:155-156` 방식. 테스트 본문은 주니어가 쓴다)

| 이름 | 준비·실행 | 기대 | 잡아야 할 버그 |
| --- | --- | --- | --- |
| TC-EX-10 루프 판정 | `redoLoopAction`에 `t`를 `b-0.01`·`b`·`b+3`, `seeking`·`ad`·`loopOn`·`a/b null` 조합으로 | `t >= b`이고 나머지 조건이 맞을 때만 `'jump'` | 되감는 중(`seeking`)에 또 되감아 횟수가 두 번 오름 / 광고 중 되감기 |
| TC-EX-10 100회 | 가짜 `video`(`currentTime`을 올리는 루프)로 판정→되감기 100번 | 매번 `a`로 돌아가고 `loops === 100` | 횟수 누락·중복 |
| EX2-AB | `redoSetA`·`redoSetB` 경계: B 먼저(A=0), `b - a` 0.4·0.5, A를 B 뒤로 | 표 §4 그대로. `error: 'order'`일 때 값 불변 | 0.1초짜리 구간, A>B 상태로 반복이 켜진 채 남음 |
| TC-EX-11 배속 | `redoClampRate`(0.1·2.5·`NaN`·0.333), `redoStepRate` 경계(0.25에서 −, 2에서 +), 0.9에서 +를 3번 | 0.25·2·1·0.33 / 경계 불변 / 1.05(부동소수 오차 없이) | `0.9+0.05+…`가 `1.0499999`로 표시·전송 |
| TC-EX-09 단축키 표 | `redoShortcutAction`에 표의 10개 `code`, `Ctrl+Alt`·`Shift+Alt`·`Meta+Alt`·Alt 없음, `repeat` | 표와 같고 조합 키는 `null`, `repeat`은 `rateDown`·`rateUp`만 | 윈도우 AltGr(= Ctrl+Alt) 입력이 단축키로 먹음 |
| EX2-편집 | `redoIsEditableTarget`에 `INPUT`·`TEXTAREA`·`SELECT`·`isContentEditable` 참·`DIV` | 앞 넷 참, `DIV` 거짓 | 댓글·검색 입력 중 단축키 발동 |
| EX2-시간 | `redoFormatTime(null·NaN·0·83.44·4503.26)`, `redoRoundTime(-1·12.34·90000)` | `--:--.-`·`--:--.-`·`00:00.0`·`01:23.4`·`75:03.3` / `0`·`12.3`·`86400` | 60분 넘는 영상에서 분 자리 깨짐 |
| EX2-위치 | `redoClampPanelPos` 화면 밖 좌·우·위·아래 | 범위 안으로 | 패널이 상단 바 밑·화면 밖으로 사라짐 |
| EX2-매니페스트 | `manifest.json` 읽기 | `content_scripts[0].js`가 `['content.js','practice-panel.js']` 순서, `permissions`는 그대로 3개 | 순서가 바뀌어 `REDO_SEL`이 없는 채 실행 |
| EX2-메뉴 | 가짜 `chromeApi`로 `registerWithChrome`(`extension_ex1.test.js:517` 방식) → `onInstalled`·`onClicked` | 메뉴 3개 생성, `redo-open-panel` 클릭 시 `REDO_PANEL_OPEN`만 전송하고 곡 추가 요청 없음 | "연습 패널 열기"가 곡을 추가함 |

수동 검수(압축 해제 로드, 결과 파일에 통과·실패를 적는다. 자동 테스트 통과만으로 완료로 적지 않는다)

| ID | 할 일 | 통과 기준 |
| --- | --- | --- |
| TC-EX-09 | 맥·윈도우에서 단축키 10개. 검색창·댓글 입력 중에도 눌러 본다 | 버튼과 같은 동작, 유튜브 재생 위치·자막 등에 영향 없음, 입력 중에는 글자만 들어감 |
| TC-EX-10 | A·B 지정 뒤 반복. 재생 막대로 B 뒤를 눌러 본다. 구간 끝이 영상 끝인 경우도 | 끊김 없이 A로 돌아가고 횟수가 1씩 오름 |
| TC-EX-10b | 반복을 켠 채 다른 탭으로 1분 | 돌아왔을 때 구간 안이고 횟수가 늘어 있음(P7) |
| TC-EX-11 | 배속 버튼·유튜브 자체 속도 메뉴를 번갈아. 반복 10분 | 표시와 실제 배속이 같고 중간에 1.0으로 돌아가지 않음 |
| TC-EX-12 | 광고가 붙는 영상에서 배속 0.75·반복 켠 채 다음 영상으로 | 광고 중 문구·버튼 잠김·되감기 없음, 광고 뒤 문구가 사라짐. 새 영상은 A·B 비어 있고 반복 꺼짐 |
| EX2-화면 | 홈 → 영상 → 홈 → 다른 영상, 닫기 → 우클릭 "연습 패널 열기", 끌기·접기, 전체 화면, 영화관 모드, 다크 테마 | 재생 화면에서만 보이고 `RE:DO에 추가` 버튼과 겹치지 않음, 닫으면 다른 영상에서도 안 보임 |

## 8. EX-2 체크리스트·금지

- [ ] `node --test test/extension_ex2.test.js` → 실패 0건
- [ ] `node --test test/extension_ex1.test.js` → 12 passed 그대로(이 파일은 고치지 않는다)
- [ ] `for f in practice-panel content background; do node --check extension/$f.js; done` → 출력 없음
- [ ] `npm test` → 실패 0건 / `git diff --stat main` → §3의 6개 파일 + 문서뿐
- [ ] `grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js` → 결과 없음(주석에도 쓰지 않는다)
- [ ] 수동 검수표 6건 결과를 `결과/EX-2.md`에 기록(못 한 항목은 "미실시"와 이유)
- [ ] PR(base `main`) · 최신 커밋 CI 종료 · 리뷰 확인 뒤 진행 파일 §1 갱신

금지: `content.js`의 `redoInit` 안쪽·`.redo-watch-btn` 수정, 서버 호출(`fetch`)·토큰·`chrome.storage` 사용, 매니페스트 권한 추가, 페이지 영역(`world: "MAIN"`) 스크립트 주입, 유튜브 내부 플레이어 함수 호출, 자동 적용(화면에 들어오자마자 배속·반복을 바꾸는 것), 새 라이브러리, 명세에 없는 버튼·단축키·설정 추가. 명세와 실제 화면이 다르면 그 부분만 멈추고 결과 파일에 적어 시니어에게 돌린다.

## 9. EX-3 계약 (시니어 직접 구현 — EX-2 결과·EX-1 수동 검수를 본 뒤 고칠 수 있다)

파일: `background.js`·`content.js`·`practice-panel.js`·`overlay.css`·`test/extension_ex1.test.js`(PR23-3을 패널 기준으로 옮김) 수정, `test/extension_ex3.test.js` 신규. 서버·DB·매니페스트 권한 변경 없음.

| 메시지 | 요청 | 응답 |
| --- | --- | --- |
| `LOOKUP_SONG`(확장) | `{ type, videoId }` | 기존 `{ state, openUrl }`에 `state:'exists'`일 때 `song: { id, a, b, rate }` 추가 |
| `ADD_SONG`(확장) | `{ type, videoId, rate?, a?, b? }` — `a`·`b`는 둘 다 있고 `a < b`일 때만 | 기존 결과에 `added`·`exists`일 때 `song: { id, a, b, rate }` 추가(서버 응답 `SongEnvelope`, `SongRoutes.kt:70-74`) |
| `SAVE_PRACTICE`(신규) | `{ type, songId, pos, a, b, rate, date, addSeconds, addLoops }` | `{ kind:'saved', keep }` / `{ kind:'login', action:'login' }` / `{ kind:'network' }` / `{ kind:'gone' }` / `{ kind:'error', message }` |

- `SAVE_PRACTICE` → `POST /api/v1/practice/save` 본문은 요청 필드 그대로(`type` 제외). 서버 검증: `songId` UUID·`pos` 0~86400 필수, `a`·`b` 0~86400(`a < b`), `rate` 0.25~2, `date` `YYYY-MM-DD`(UTC 오늘+1일까지), `addSeconds` 0~21600, `addLoops` 0~100000 — `PracticeRoutes.kt:32-51`, `JsonInput.kt:75-89`. 응답 `{ ok, keep, sessionId, totalSeconds, minutes, pendingSeconds, coveragePct }` — `PracticeService.kt:20-29`. 오류 본문 `{ ok, source, status, code, message }` — `ApiError.kt:17-26`.
- 보내는 값: `pos = redoRoundTime(currentTime)`. `a`·`b`는 패널에 **둘 다 있으면** 그 값, 아니면 마지막으로 받은 `song.a`·`song.b`(이 API는 보낸 값으로 덮어쓴다 — `PracticeService.kt:127-128`. 확장에서는 구간을 지울 수 없다). `date`는 브라우저 로컬 날짜. `addSeconds = min(21600, floor(누적 초))`, `addLoops = min(100000, 누적 횟수)`.
- 집계(U8): `tick`에서 재생 중·광고 아님·패널 열림일 때 `min(2, 지난 실제 시간)`을 더한다. 횟수는 되감을 때마다 1.

| 응답 | 패널 | 누적분 |
| --- | --- | --- |
| 200 `keep:false` | `저장했습니다` | 보낸 만큼 뺀다 |
| 200 `keep:true` | `구간·배속을 저장했습니다. 연습 시간은 1분부터 기록됩니다` | 그대로 둔다(P8) |
| 401·토큰 없음 | 알림 `로그인이 필요합니다` + [로그인] | 그대로 |
| 404 | `RE:DO에서 삭제된 곡입니다. 다시 추가할 수 있습니다` → 미등록 상태로 | 그대로 |
| 그 밖 4xx·5xx | 서버 `message`, 없으면 `저장하지 못했습니다` | 그대로 |
| 시간 초과·연결 실패 | `서버에 연결하지 못했습니다` | 그대로(서버에는 반영됐을 수 있어 다시 저장하면 시간이 두 번 더해질 수 있다 — 웹 플레이어와 같은 한계, 서버 변경은 범위 밖) |
| 계정 바뀜(`fail:'switched'`) | `요청 도중 계정이 바뀌어 저장하지 않았습니다` | 0으로 |

- 저장 줄: 미등록 `[RE:DO에 추가]`(패널의 A·B·배속 포함) / 등록 `RE:DO에 있음` + `[저장]` + 저장 안 한 변경·누적이 있으면 `저장 안 됨`. 조회 결과가 오면 `song.a`·`song.b`를 패널에 채우고 `저장된 구간·배속(0.75x)을 불러왔습니다. [반복]을 켜면 적용됩니다`를 보인다. 저장된 배속은 [반복]을 켤 때 적용하고, 그 전에 사용자가 배속을 바꾸면 버린다. `ADD_SONG`이 200(기존 곡)이면 패널 값을 유지하고 `저장 안 됨`(P11).
- 경합: 영상·계정이 바뀔 때마다 세대값을 올리고(`content.js:156`의 `watchGen` 방식) 그 전에 시작한 조회·추가·저장 응답은 버린다. 영상이 바뀌면 누적분을 버리고, 계정이 바뀌면(`REDO_AUTH_CHANGED`) 누적분을 0으로 하고 다시 조회한다. 저장은 한 번에 하나(버튼 `disabled`, 서비스 워커는 `songId`별 진행 중 요청을 함께 쓴다 — `background.js:134-143` 방식). 광고 중에는 [저장]을 잠근다. 자동 저장은 없다.
- 테스트: TC-EX-13(등록 곡 저장 — A·B 미지정 시 기존 구간 전송, `keep:false`에서 1회만 차감, `keep:true`에서 차감 없음), TC-EX-14(영상 전환 뒤 도착한 조회·저장 응답이 새 영상 패널에 들어가지 않음), EX3-계정(전환 시 누적 0·재조회, PR23-3의 단언을 패널 저장 줄로 유지), EX3-오류(위 표 7행), EX3-연타(같은 곡 저장 3연타 요청 1회).

## 10. 하지 않는 것

서버·DB·API 계약 변경, 자동 저장, 되감기 전 대기, 구간 프리셋 여러 개, 쇼츠·실시간 영상 연습, 패널 위치·닫힘의 탭 간 기억, 광고 건너뛰기, 웹 스토어 등록(U6).
