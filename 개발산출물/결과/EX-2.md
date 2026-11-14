# EX-2 결과 — 크롬 확장: 유튜브 재생 화면 연습 패널

> 작업: EX-2 (주니어 2단계 1차 구현·검증·PR) | 브랜치: `step/EX-2` | 기준 명세: [EX-2_구현명세.md](../명세/EX-2_구현명세.md) §2~§8
> 상태: **주니어 4단계 정리 완료 — 리뷰 대기 (머지 시 완료)** (시니어 3단계 수정·회귀 6건 반영 `b1b1030`, 단위 16건·전체 470건·CI 통과, 수동 검수 6건 미실시 — §3·§7·§8)
> 사용자 승인: 2026-11-15 U7~U9 승인

## 1. 바꾼 파일

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 신규 | `extension/practice-panel.js` | 상수·순수 함수 10종(`redoFormatTime`·`redoRoundTime`·`redoClampRate`·`redoStepRate`·`redoSetA`·`redoSetB`·`redoLoopAction`·`redoShortcutAction`·`redoIsEditableTarget`·`redoClampPanelPos`) 및 `redoPanelInit` (패널 DOM, rAF+`timeupdate` 루프, 광고/배속/단축키, 끌기/접기/닫기) |
| F2 | 수정 | `extension/content.js` | `REDO_SEL`에 `video: '#movie_player video.html5-main-video'` 1줄 추가 (`redoInit`·`.redo-watch-btn` 미수정) |
| F3 | 수정 | `extension/background.js` | 상수 `MENU_PANEL = 'redo-open-panel'`, `onInstalled` 세 번째 우클릭 메뉴(`연습 패널 열기`), `onClicked`에서 `REDO_PANEL_OPEN` 전송 후 조기 반환 |
| F4 | 수정 | `extension/overlay.css` | `.redo-panel`·`.redo-panel__head`·`.redo-panel__icon-btn`·`.redo-panel__body`·`.redo-panel__row`·`.redo-panel__btn`·`.redo-panel__out`·`.redo-panel__status` 및 `:fullscreen` 숨김 규칙 추가 (토큰 4색만 사용) |
| F5 | 수정 | `extension/manifest.json` | `content_scripts[0].js`를 `["content.js", "practice-panel.js"]`로 변경 (권한·버전 유지) |
| F6 | 신규 | `test/extension_ex2.test.js` | 명세 §7 단위 테스트 10건 (`node:test`) |
| F7 | 신규/수정 | `개발산출물/결과/EX-2.md` · `개발산출물/진행_크롬확장.md` | EX-2 검증 결과·수동 검수 상태·진행 표 갱신 |

- `auth.js`, `options.*`, `test/extension_ex1.test.js`, 서버 코드, `frontend/src`는 수정하지 않았다.
- 작업 폴더에 있던 시니어 1단계 미커밋 문서 3건(`개발산출물/명세/EX-1_크롬확장_구현명세.md`, `개발산출물/인수인계_메모.md`, `개발산출물/명세/EX-2_구현명세.md`)은 수정·커밋하지 않고 그대로 보존했다.

## 2. 확인 명령 출력

### 2-1. EX-2 단위 테스트 (`node --test test/extension_ex2.test.js`)

```text
✔ TC-EX-10 루프 판정: t >= b이고 loopOn·!ad·!seeking·a/b 존재일 때만 jump (1.05775ms)
✔ TC-EX-10 100회: 가짜 video로 판정→되감기 100번 실행 시 매번 a로 돌아가고 loops === 100 (2.790583ms)
✔ EX2-AB: redoSetA·redoSetB 경계 — B 먼저(A=0), b-a 0.4·0.5, A를 B 뒤로, error: order 시 불변 (0.634292ms)
✔ TC-EX-11 배속: redoClampRate·redoStepRate 경계 및 부동소수 오차 없음 (0.36625ms)
✔ TC-EX-09 단축키 표: Alt 단독 10개 code, 조합 키 차단, repeat은 rateDown·rateUp만 (0.382084ms)
✔ EX2-편집: INPUT·TEXTAREA·SELECT·isContentEditable 참, DIV 거짓 (0.30875ms)
✔ EX2-시간: redoFormatTime·redoRoundTime 경계 및 60분 초과 포맷 (0.31125ms)
✔ EX2-위치: redoClampPanelPos 화면 밖 좌·우·위·아래 클램프 (0.342ms)
✔ EX2-매니페스트: content_scripts 순서와 permissions 3개 유지 (0.125834ms)
✔ EX2-메뉴: 메뉴 3개 생성, redo-open-panel 클릭 시 REDO_PANEL_OPEN만 전송하고 곡 추가 요청 없음 (3.648959ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
```

### 2-2. EX-1 회귀 테스트 (`node --test test/extension_ex1.test.js`)

```text
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
```

### 2-3. 문법·금지 패턴·전체 Node 테스트

- `for f in practice-panel content background; do node --check extension/$f.js; done` → 종료 코드 0, 출력 없음 (`CHECK_OK`)
- `grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js` → 일치 0건 (`GREP_EXIT:1`)
- `npm test` (`node --test test/*.test.js`):
  ```text
  ℹ tests 464
  ℹ suites 58
  ℹ pass 464
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ```

### 2-4. 실제 브라우저 스모크 확인 (Playwright Chromium, 비로그인 유튜브 `jNQXAC9IVRw` — 수동 검수를 대신하지 않는다)

- `.redo-panel` 위치·크기: `left: 984, top: 108, right: 1264, bottom: 351, width: 280, height: 243`
- `.redo-watch-btn` 위치: `top: 64, bottom: 100, left: 1134, right: 1264` → **겹침 없음(`overlap: false`, 8px 간격)**
- `#movie_player video.html5-main-video` 탐색 성공 (`videoFound: true`), 패널 본문 가로 넘침 없음 (`bodyOverflow: false`), 버튼 13개 모두 비활성 없음
- `Alt+2` 입력 → 배속 출력 `0.75x`, `video.playbackRate === 0.75`, `preset1` `aria-pressed="true"`
- 접기 클릭 → `data-redo-collapsed="1"`, `.redo-panel__body` `hidden === true`, computed `display: none`
- 닫기 클릭 → `.redo-panel` DOM 제거 (`closedExists: false`), `pageerror` 0건

## 3. 수동 검수표 (명세 §7)

| ID | 할 일 | 결과 | 비고·사유 |
| --- | --- | --- | --- |
| TC-EX-09 | 맥·윈도우에서 단축키 10개. 검색창·댓글 입력 중에도 눌러 본다 | **미실시** | 자동화 세션으로 윈도우 실기기 및 실사용자 인터랙티브 입력 검증 불가 (비로그인 헤드리스 `Alt+2` 배속 변경만 확인) |
| TC-EX-10 | A·B 지정 뒤 반복. 재생 막대로 B 뒤를 눌러 본다. 구간 끝이 영상 끝인 경우도 | **미실시** | 실브라우저 재생 중 시킹·영상 끝 `ended` 수동 확인 필요 (단위 테스트에서 100회·가짜 DOM으로 검증) |
| TC-EX-10b | 반복을 켠 채 다른 탭으로 1분 | **미실시** | 백그라운드 탭 스로틀링 하에서의 실제 1분 `timeupdate` 동작은 사람 브라우저에서 확인 필요 |
| TC-EX-11 | 배속 버튼·유튜브 자체 속도 메뉴를 번갈아. 반복 10분 | **미실시** | 10분 장기 재생 및 유튜브 플레이어 속도 메뉴 연동 수동 확인 필요 |
| TC-EX-12 | 광고가 붙는 영상에서 배속 0.75·반복 켠 채 다음 영상으로 | **미실시** | 실제 유튜브 광고 재생 영상에서 확인 필요 (단위 테스트에서 `#movie_player.ad-showing` 모킹으로 검증) |
| EX2-화면 | 홈 → 영상 → 홈 → 다른 영상, 닫기 → 우클릭 "연습 패널 열기", 끌기·접기, 전체 화면, 영화관 모드, 다크 테마 | **미실시** | 우클릭 메뉴·드래그·전체 화면·영화관 모드·다크 테마는 실브라우저 수동 확인 필요 (초기 배치·접기·닫기는 스모크 확인) |

> 2026-11-15 재확인: 사용자 답변으로 6건 모두 아직 미실시다. EX-3 수동 검수 EX3-M1~M6은 통과했다([결과/EX-3](EX-3.md) §5) — 그중 M6(광고·영상 전환·전체 화면·다크 테마)은 패널 저장 줄 기준이라 위 6건을 대신하지 않는다. 이 6건이 끝나면 진행 파일을 `완료/`로 옮긴다.

## 4. 체크리스트 (§8)

- [x] `node --test test/extension_ex2.test.js` → 실패 0건 (10 passed)
- [x] `node --test test/extension_ex1.test.js` → 12 passed 그대로 (`extension_ex1.test.js` 미수정)
- [x] `for f in practice-panel content background; do node --check extension/$f.js; done` → 출력 없음
- [x] `npm test` → 실패 0건 (464 passed) / 커밋 범위: §3의 6개 파일 + 문서(`결과/EX-2.md`, `진행_크롬확장.md`)뿐
- [x] `grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js` → 결과 없음
- [x] 수동 검수표 6건 결과를 `결과/EX-2.md`에 기록(전부 미실시와 사유 기록)
- [x] PR(base `main`) · 최신 커밋 CI 종료 · 리뷰 확인 뒤 진행 파일 §1 갱신 (`PR #24` / `b48867a` CI 통과)

## 5. 명세와 달라진 점

- 없음 (명세 §3~§8 그대로 구현).

## 6. 시니어 3단계 검증에 넘길 것

- `step/EX-2` PR 링크·CI 결과·리뷰 확인은 PR 생성 직후 아래 절에 채운다.
- 주니어 1차 구현에서 확인하지 못한 수동 검수 6건(`TC-EX-09`, `TC-EX-10`, `TC-EX-10b`, `TC-EX-11`, `TC-EX-12`, `EX2-화면`)은 사람/실브라우저 검수로 남아 있다.

## 7. PR·CI·리뷰 확인

- PR: [PR #24](https://github.com/choise-hun/doloop/pull/24) (`step/EX-2` → `main`)
- 리뷰 코멘트 (`chatgpt-codex-connector`, `65f6c33` 기준 1건):
  1. **[P2] `extension/practice-panel.js:568`** ([코멘트](https://github.com/choise-hun/doloop/pull/24#discussion_r4574298283)): 광고 재생 중 [반복]/`Alt+L`로 반복을 켤 때 `ad` 여부를 확인하지 않아 `video.currentTime`이 본영상 `a`로 이동함.
     - **판단: 타당 → 수정 반영(`b48867a`)** · [답글](https://github.com/choise-hun/doloop/pull/24#discussion_r4574366424): `handleAction`에서 실시간 `ad = Boolean(document.querySelector(REDO_SEL.adShowing))`을 확인해 `!ad`일 때만 `currentTime = state.a`로 이동하도록 가드 추가(`setA`/`setB`/`restart`/배속 반영도 동일 `ad` 기준으로 일원화). `test/extension_ex2.test.js` `TC-EX-10 100회`에 광고 중 반복 재활성화 회귀 단언 추가.
- `65f6c33` CI: 5 passed, 1 skipped(`Kotlin test (JDK 21)`) — [실행 43609936025](https://github.com/choise-hun/doloop/actions/runs/43609936025)
- `b48867a` CI: 5 passed, 1 skipped(`Kotlin test (JDK 21)`) — [실행 43611261464](https://github.com/choise-hun/doloop/actions/runs/43611261464) (`Detect code changes` 7s, `Test (Node 22)` 36s, `Docker build & smoke test` 1m35s, `E2E XSS & CSP (Playwright, spa)` 11m38s, `CI ok` 4s). 추가 리뷰 코멘트 없음.
- `b1b1030` 시니어 3단계 수정 반영 커밋 CI(주니어 4단계 확인): 5 passed, 1 skipped(`Kotlin test (JDK 21)`) — [실행 43618345750](https://github.com/choise-hun/doloop/actions/runs/43618345750) (`Detect code changes` 5s, `Test (Node 22)` 40s, `Docker build & smoke test` 2m4s, `E2E XSS & CSP (Playwright, spa)` 10m44s, `CI ok` 3s). 추가 리뷰 코멘트 없음.
- 주니어 4단계 최종 로컬 재검증(`b1b1030` 기준): `node --test test/extension_ex2.test.js` 16 passed / 0 failed, `node --test test/extension_ex1.test.js` 12 passed / 0 failed, `npm test` 470 passed / 0 failed, `node --check` 3파일 통과, 금지 패턴 `grep` 0건. 수동 검수 6건은 미실시 유지.

## 8. 시니어 3단계 독립 검증 (2026-11-15, Mac)

> 대상 head `a263df4` (PR #24 head와 로컬 `step/EX-2` 일치 확인). 시니어 수정은 **로컬·미커밋**이다 — 커밋·push·CI는 주니어 4단계(§8-5).
> 작업 폴더의 시니어 1단계 미커밋 문서 3건(`명세/EX-1_크롬확장_구현명세.md`·`인수인계_메모.md` 수정, `명세/EX-2_구현명세.md` 미추적)은 손대지 않았다.

### 8-1. 대조 결과 (명세 §4~§6·§8 ↔ 프로덕션 가드 ↔ 테스트)

| 항목 | 프로덕션 가드 | 판정 | 기존 테스트가 누락을 잡는가 |
| --- | --- | --- | --- |
| rAF+`timeupdate` 루프 | `startRaf`(반복 중만)·`timeupdate`→`tick` | 맞음 | 부분(100회 통합). seeking 전달은 못 잡음 → EX2-tick 가드 추가 |
| seeking·광고 되감기 가드 | `redoLoopAction` + `tick`의 `seeking: video.seeking`·`ad` | 맞음 | 순수 함수만 → EX2-tick 가드 추가 |
| `ended` 되감기 | `loopOn && !ad && a != null` | 맞음 | 없음 → EX2-ended 추가 |
| `ratechange` 동기화·광고 뒤 배속 복원 | `ad`면 무시 / `tick`의 `wasAd && !ad` 복원 | **결함 S1·S2** | 없음 → PR24-S1·S2 추가 |
| 영상 전환 초기화·리스너 요소당 1회 | `sync()` `id` 변경 분기 / `dataset.redoPanelBound` | 맞음 | 없음 → EX2-전환·EX2-tick 가드 추가 |
| Alt 단독 단축키·입력창·조합 예외 | `redoShortcutAction`·`redoIsEditableTarget(composedPath()[0])`·`isComposing`·캡처 단계 | 맞음 | 순수 함수만 → EX2-단축키 연결 추가 |
| Trusted Types·저장소·`.key` 금지 | `createElement`/`textContent`만 | 맞음 | `grep` 0건(§8-4) |
| 우클릭 메뉴·매니페스트·CSS | `MENU_PANEL` 조기 반환, 스크립트 순서, 4색 + 기존과 같은 그림자 | 맞음 | 기존 EX2-메뉴·EX2-매니페스트로 충분 |

### 8-2. 발견 결함

| ID | 문제 | 원인 | 재현(수정 전) | 수정 |
| --- | --- | --- | --- | --- |
| S1 | 광고 전·중에 고른 배속(예: 0.75)이 광고가 끝나면 1.0으로 바뀐 채 남는다 | 광고 종료 뒤 첫 `tick`보다 `ratechange`(본영상 로드 때 유튜브가 1로 둠)가 먼저 오면 `ad`만 보는 가드를 통과해 1.0을 "사용자 변경"으로 받아들인다. 그 뒤 `tick`의 복원 조건(`playbackRate ≠ rate`)이 거짓이 된다 | PR24-S1: 기대 `0.75`, 실제 `1` | `ratechange`에서 `ad \|\| state.wasAd`면 무시(복원은 `tick`이 하고 `wasAd`를 내린다) |
| S2 | 같은 영상에서 광고 중 `sync()`가 다시 불리면(패널이 열린 채 우클릭 "연습 패널 열기" 등) 광고 중 예약한 배속이 광고 값 1로 덮인다 | `findAndBindVideo`가 영상이 바뀌었는지와 무관하게 `rate = video.playbackRate`·`wasAd = ad`로 다시 읽는다 | PR24-S2: 기대 `0.75`, 실제 `1` | `sync()`가 `fresh`(=`id` 변경)를 넘기고, `bindFound(video, fresh)`가 같은 영상이고 광고 중(또는 복원 전)이면 `rate`를 유지·`wasAd = true`. 다른 영상이면 명세대로 그 영상 배속을 읽는다(자동 적용 없음). 중복이던 찾기·재시도 바인딩 블록을 `bindFound` 하나로 합쳤다 |

두 건 모두 실제 이벤트 순서는 **실화면 미확인**이다(명세 §2 V4는 광고 종료 순서를 조사하지 않았다). 수정은 어느 순서에서도 안전하며 TC-EX-12에서 확인한다.

### 8-3. 바꾼 파일 (명세 §3 범위 안)

- `extension/practice-panel.js` (+22 −18): `ratechange` 가드(`:423`), `bindFound` 신설(`:460-471`), `findAndBindVideo(expectedId, fresh)`, `sync()`의 `fresh`(`:636`)
- `test/extension_ex2.test.js` (+186): `fakePanelEnv`에 `fireDoc`·`setHref`, 도우미 `altKey`·`loopingEnv`, 테스트 6건 — PR24-S1, PR24-S2, EX2-ended, EX2-tick 가드, EX2-전환, EX2-단축키 연결

### 8-4. 실행한 검증 (시니어, 로컬)

- `node --test test/extension_ex2.test.js` → `tests 16 / pass 16 / fail 0`
- 수정 전 코드(`git show HEAD:extension/practice-panel.js`)로 같은 테스트 → `fail 2`(PR24-S1·S2)
- 변형 검사(가드 하나씩 제거 → 실패하는 테스트): tick seeking → EX2-tick 가드 / ended 광고 → EX2-ended / ratechange 광고 → PR24-S1 / 입력창 예외 → EX2-단축키 연결 / `isComposing` → EX2-단축키 연결 / 리스너 중복 방지 → EX2-tick 가드 / 영상 전환 초기화 → EX2-전환. 7건 모두 `fail 1`. 복원 뒤 16/16, 파일 `cmp` 일치
- `node --test test/extension_ex1.test.js` → `pass 12 / fail 0` (파일 미수정)
- `for f in practice-panel content background; do node --check extension/$f.js; done` → 출력 없음
- `grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js` → 0건
- `npm test` → `tests 470 / pass 470 / fail 0`
- 미실행: CI, 실브라우저 스모크 재실행(수정은 이벤트 가드뿐이라 DOM·배치 변화 없음), 수동 검수 6건

### 8-5. 주니어 4단계 다음 행동

1. 위 2개 파일 변경을 확인하고 커밋 1개: `fix(extension): PR #24 시니어 검증 — 광고 뒤 배속 복원·같은 영상 재동기화 배속 유지` (+ 이 절·진행 파일 갱신은 `docs(extension)` 커밋). 미커밋 1단계 문서 3건은 커밋에 넣지 않는다
2. `node --test test/extension_ex2.test.js`(16건)·`node --test test/extension_ex1.test.js`(12건)·`npm test`(470건)·§8 `node --check`·`grep` 재실행
3. `step/EX-2` push → PR #24 갱신 → `gh pr checks 24 --watch` 최신 커밋 CI 종료 → 새 리뷰 확인·처리 → §7에 커밋·CI 실행 번호 기록
4. 진행 파일 EX-2 행을 "리뷰 대기(PR #24, 최신 CI)"로. 머지는 사용자가 한다

### 8-6. 남은 제한

- 수동 검수 6건(TC-EX-09·10·10b·11·12·EX2-화면) **미실시** — 자동 테스트 통과만으로 EX-2 완료로 적지 않는다. TC-EX-12에서 S1·S2(광고 끝 배속 유지, 광고 중 우클릭 "연습 패널 열기")를 함께 본다
- 관찰(수정 안 함, 실화면 확인 필요): 유튜브가 광고 뒤 `tick` 복원 **이후에** 다시 배속을 1로 바꾸면 명세 §6.5대로 사용자 변경으로 받아들인다. 또 `yt-navigate-finish` 전에 새 영상이 옛 구간 B 이후 위치에서 재생되면 한 번 되감길 수 있다(광고는 가드됨). 둘 다 TC-EX-11·12에서 보고, 재현되면 시니어에게 돌린다
