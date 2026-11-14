# EX-2 결과 — 크롬 확장: 유튜브 재생 화면 연습 패널

> 작업: EX-2 (주니어 2단계 1차 구현·검증·PR) | 브랜치: `step/EX-2` | 기준 명세: [EX-2_구현명세.md](../명세/EX-2_구현명세.md) §2~§8
> 상태: **리뷰 대기** (단위 10건·체크리스트 자동 항목 통과, 수동 검수 6건은 미실시 — 시니어 3단계 독립 검증 대기)
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

## 4. 체크리스트 (§8)

- [x] `node --test test/extension_ex2.test.js` → 실패 0건 (10 passed)
- [x] `node --test test/extension_ex1.test.js` → 12 passed 그대로 (`extension_ex1.test.js` 미수정)
- [x] `for f in practice-panel content background; do node --check extension/$f.js; done` → 출력 없음
- [x] `npm test` → 실패 0건 (464 passed) / 커밋 범위: §3의 6개 파일 + 문서(`결과/EX-2.md`, `진행_크롬확장.md`)뿐
- [x] `grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js` → 결과 없음
- [x] 수동 검수표 6건 결과를 `결과/EX-2.md`에 기록(전부 미실시와 사유 기록)
- [ ] PR(base `main`) · 최신 커밋 CI 종료 · 리뷰 확인 뒤 진행 파일 §1 갱신 (커밋·PR 후 채움)

## 5. 명세와 달라진 점

- 없음 (명세 §3~§8 그대로 구현).

## 6. 시니어 3단계 검증에 넘길 것

- `step/EX-2` PR 링크·CI 결과·리뷰 확인은 PR 생성 직후 아래 절에 채운다.
- 주니어 1차 구현에서 확인하지 못한 수동 검수 6건(`TC-EX-09`, `TC-EX-10`, `TC-EX-10b`, `TC-EX-11`, `TC-EX-12`, `EX2-화면`)은 사람/실브라우저 검수로 남아 있다.

## 7. PR·CI·리뷰 확인

- (PR 생성·CI 대기 후 채움)
