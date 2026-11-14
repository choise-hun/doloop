# EX-3 결과 — 크롬 확장: 연습 패널 저장 연결

> 작업: EX-3 (시니어 직접 구현 — 핵심 구현 + 표적 테스트 + 커밋·push까지) | 브랜치: `step/EX-3` (base `main`=`c616df4`) | 기준 명세: [EX-2·EX-3 구현명세](../명세/EX-2_구현명세.md) §9
> 상태: **시니어 구현·표적 테스트 완료, push(PR 없음)** — 전체 회귀·PR·CI·결과 갱신은 주니어 4단계(§6). 수동 검수 미실시(§5)
> 선행 확인(2026-11-15, 사용자): 운영 POST(Origin `chrome-extension://pamcfmpmaoehcmddfieihilojkfjfpld`)가 403 아님, EX-사람 ①~③·TC-EX-04~07 수동 검수 완료. 승인: U7~U9(2026-11-15)

## 1. 바꾼 파일

| 파일 | 내용 |
| --- | --- |
| `extension/background.js` | `songSummary`(SongDto → `{ id, a, b, rate }`)·`practiceSaveBody`(SAVE_PRACTICE → 요청 본문) export 추가. `lookupSong`은 `state:'exists'`일 때 `song`, `addSong(videoId, { rate, a, b })`는 `added`·`exists`일 때 `song`을 더한다(`a`·`b`는 둘 다 숫자이고 `a < b`일 때만 전송). `savePractice` 신규(같은 본문 진행 중 요청 공유). 메시지 `SAVE_PRACTICE` 연결, `ADD_SONG`에 `rate·a·b` 전달 |
| `extension/content.js` | 재생 화면 버튼(`.redo-watch-btn`·`syncWatchButton`·`watchGen`)과 계정 변경 재조회·`popstate` 리스너 제거. 최상위 `let redoToast`에 알림 함수를 넣어 패널이 쓴다. 우클릭 결과 알림(`REDO_TOAST`)·점 3개 메뉴는 그대로 |
| `extension/practice-panel.js` | 순수 함수 `redoAccumulate`·`redoLocalDate`·`redoBuildSave` + 저장 줄(추가/있음·저장·저장 안 됨), 조회·추가·저장 흐름, 세대값(`state.gen`) 경합 처리, `REDO_AUTH_CHANGED`·`REDO_TOAST` 수신, 시간·횟수 누적 |
| `extension/overlay.css` | `.redo-watch-btn` 규칙 삭제, 패널 `top` 108px → 64px(버튼 자리), `.redo-panel__save`·`__link`·`__dirty` 추가(색 4개만, 주황은 표시선에만) |
| `test/extension_ex1.test.js` | PR23-3(콘텐츠) 회귀를 패널 저장 줄 기준으로 옮김 — 단언 4개(재조회·이전 상태 숨김·늦은 응답 폐기·클릭 시 추가) 유지 + 버튼 부재 확인 |
| `test/extension_ex3.test.js` | 신규 12건(§2) |

매니페스트·권한·서버·DB·API 계약·`frontend/` 변경 없음.

## 2. 테스트 (표적)

| 이름 | 확인 |
| --- | --- |
| EX3-누적·본문 | 누적(첫 관측 기준점, 1회 최대 2초, 멈춤·광고 0), 저장 본문(패널 A·B 우선 → 곡 구간 대체 → 둘 다 없으면 생략, 상한 21600·100000), 로컬 날짜 |
| EX3-조회·추가 | `LOOKUP_SONG`·`ADD_SONG` 응답의 `song`, 추가 요청 본문의 `rate·a·b`, `a >= b` 미전송 |
| EX3-오류 | 서비스 워커 매핑: 200 `keep:false`/`keep:true`, 토큰 없음·401 → `login`, 404 → `gone`, 4xx 서버 문구, 5xx 본문 없음 → `저장하지 못했습니다`, 연결 실패·시간 초과 → `network`, 계정 바뀜 → `switched`, 잘못된 `songId` 미전송 |
| EX3-연타 | 같은 곡·같은 본문 3연타 → 요청 1회, 끝난 뒤 재전송 가능 |
| EX3-메시지 | `registerWithChrome`의 `SAVE_PRACTICE` 응답, `ADD_SONG` 패널 값 전달 |
| TC-EX-13 | 불러온 구간 표시·배속은 [반복] 때 적용, 패널 3연타 1회, 저장 중 쌓인 시간 보존, `keep:false` 1회 차감, 구간 초기화 뒤 곡 구간 전송, `keep:true` 차감 없음 |
| TC-EX-13 광고 | 광고 중 [저장] 잠금·시간 제외, 멈춘 동안 제외 |
| EX3-추가 | 미등록 [RE:DO에 추가]가 패널 구간·배속 전송, 연타 1회, 기존 곡(200)이면 패널 값 유지·`저장 안 됨`(P11), 알림 표시 |
| TC-EX-14 | 영상 전환 뒤 도착한 저장·조회·추가 응답이 새 영상 패널에 안 들어감, 전환 시 누적 버림 |
| EX3-계정 | 계정 변경 → 같은 영상 재조회, 이전 상태 숨김, 이전 저장 응답 폐기, 누적 0 |
| EX3-오류(패널) | §9 표 7행 + 확장 갱신(null): 문구·로그인 알림·삭제된 곡 → 미등록·계정 바뀜 → 누적 0·나머지 누적 유지 |
| EX3-우클릭 추가 | 같은 영상의 `REDO_TOAST`로만 등록 상태 전환 |

실행 결과(2026-11-15, Mac, `4071b26` 기준):

```text
$ node --test test/extension_ex3.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex1.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex2.test.js   → tests 16 / pass 16 / fail 0
$ for f in practice-panel content background auth options; do node --check extension/$f.js; done   → 출력 없음
$ grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js   → 0건
$ npm test   → tests 482 / pass 482 / fail 0
```

변형 검사(가드 하나씩 제거 → 실패하는 테스트, 복원 뒤 `cmp` 일치): 저장 응답 세대 → TC-EX-14·EX3-계정 / 조회 응답 세대 → PR23-3·TC-EX-14 / 추가 응답 세대 → TC-EX-14 / `keep:true` 차감 → TC-EX-13 / 패널 연타 → TC-EX-13 / 광고 중 저장 → TC-EX-13 광고 / 계정 변경 누적 0 → EX3-계정 / 영상 전환 누적 버림 → TC-EX-14 / 곡 구간 대체 → EX3-누적·본문·TC-EX-13 / 불러온 배속 저장 → TC-EX-13 / 광고 시간 제외 → TC-EX-13 광고 / `switched` 누적 0 → EX3-오류(패널). 12건 모두 1건 이상 실패.

미실행: `./gradlew test`(서버 변경 없음), `npm run build`·E2E, CI, 실브라우저 스모크, 수동 검수(§5).

## 3. 명세와 달라진 점·세부 결정 (계약 범위 안, 확장 내부 메시지만)

| # | 명세 §9 | 구현 | 이유 |
| --- | --- | --- | --- |
| D1 | `SAVE_PRACTICE` 응답 kind 5개 | `switched` 추가(`{ kind:'switched', message }`) | 계정 바뀜은 누적을 0으로 해야 해서 일반 `error`와 구별해야 한다 |
| D2 | 서비스 워커는 `songId`별 진행 중 요청 공유 | **같은 `songId`+같은 본문**일 때 공유 | 두 탭이 같은 곡을 다른 누적분으로 저장하면 한쪽 결과를 공유받은 탭이 보내지 않은 시간을 빼서 잃는다. 다른 본문은 각각 보낸다(서버는 행 잠금 뒤 합산) |
| D3 | 보내는 `rate` = 패널 배속 | 불러온 배속을 아직 적용하지 않았으면(`pendingRate`) 그 값을 보낸다 | [반복]을 켜지 않고 저장하면 저장된 0.75가 재생 배속 1로 덮인다 |
| D4 | 저장 배속 적용 전 "사용자가 배속을 바꾸면 버린다" | 패널 버튼·단축키로 바꿀 때만 버린다. `ratechange`(유튜브 메뉴)로는 버리지 않는다 | 유튜브가 영상을 불러오며 배속을 1로 되돌리는 것(V4-4)과 사용자 변경을 구별할 수 없다 |
| D5 | "RE:DO에 있음" | 연습 화면을 새 탭으로 여는 링크(`a[data-redo-out="exists"]`) | EX-1 버튼의 "있음 → 열기" 동작을 잃지 않는다 |
| D6 | 저장 안 됨 | 등록 곡이고 (1초 이상·1회 이상 누적 또는 패널 구간·저장할 배속이 마지막 저장값과 다름)일 때 | 불러온 직후·저장 직후에는 표시하지 않는다 |
| D7 | 패널 위치 `top:108px` | `top:64px` | 버튼이 빠져 그 자리를 쓴다(U9: 닫으면 아무것도 표시하지 않음) |
| D8 | 불러온 구간 안내 문구 | 불러온 안내는 상태 줄의 지속 문구(`notice`)로, 다음 패널 행동·영상 전환에 지운다. 저장 결과는 3초 문구 | 안내를 3초에 놓치지 않게 |

DOM(저장 줄, 상태 줄 위): `div.redo-panel__row.redo-panel__save[data-redo-save-state]` → `button[data-redo-act="add"]` "RE:DO에 추가"(추가 중 "추가하는 중…") · `a[data-redo-out="exists"]` "RE:DO에 있음" · `button[data-redo-act="save"]` "저장"(저장 중 "저장하는 중…") · `span[data-redo-out="dirty"]` "저장 안 됨". 보이지 않는 것은 `hidden`.

## 4. 남은 제한

- 연결 실패·시간 초과 뒤 다시 저장하면 서버에 이미 반영된 시간이 두 번 더해질 수 있다(명세 §9 표, 웹 플레이어와 같은 한계 — 서버 변경은 범위 밖).
- 패널을 닫거나 다른 영상으로 가면 저장하지 않은 누적분은 사라진다(자동 저장 없음, 명세 §10).
- 우클릭 "RE:DO에 추가"(EX-1)는 지금도 `videoId`만 보낸다. 패널 구간·배속은 패널의 [RE:DO에 추가]로만 간다.
- 진행 §4 "향후 개선사항" 2건(점 3개 메뉴 위치, 패널 다시 열기 토글)은 EX-3 범위 밖이다. 재생 화면 버튼이 사라져 ② 중 "버튼 숨기기"는 해소됐고, 닫은 패널 다시 열기는 여전히 우클릭 "연습 패널 열기"뿐이다.

## 5. 수동 검수 (사람 — 압축 해제 로드, 운영 서버·로그인 계정)

| ID | 할 일 | 통과 기준 | 결과 |
| --- | --- | --- | --- |
| EX3-M1 | 미등록 영상에서 A·B·0.75x 지정 → 패널 [RE:DO에 추가] | 알림 "RE:DO에 추가했습니다", 저장 줄 "RE:DO에 있음"·[저장], 웹앱 연습 화면에 구간·0.75x | 미실시 |
| EX3-M2 | 등록 곡을 새로 열기 | 저장된 구간이 채워지고 안내 문구, [반복]을 켜면 저장 배속 적용 | 미실시 |
| EX3-M3 | 그날 처음 연습하는 곡에서 30초 재생 → [저장], 이어서 1분 더 → [저장] | 첫 저장 "…1분부터 기록됩니다", 둘째 "저장했습니다", 웹앱 기록에 약 1분 30초·반복 횟수 | 미실시 |
| EX3-M4 | 웹앱에서 곡 삭제 뒤 패널 [저장] | "RE:DO에서 삭제된 곡입니다…", [RE:DO에 추가]로 돌아감 | 미실시 |
| EX3-M5 | 옵션 화면에서 로그아웃 → [저장] / 다른 계정으로 로그인 | 로그인 알림+[로그인] / 저장 줄이 새 계정 기준으로 다시 조회 | 미실시 |
| EX3-M6 | 광고가 붙는 영상, 영상 전환, 전체 화면, 다크 테마 | 광고 중 [저장] 잠김, 저장 줄이 패널 폭(280px) 안에 한 줄, 상단 바(56px)와 겹치지 않음 | 미실시 |

EX-2 수동 6건(TC-EX-09·10·10b·11·12·EX2-화면)도 아직 미실시다([결과/EX-2](EX-2.md) §3). EX2-화면의 "`RE:DO에 추가` 버튼과 겹치지 않음"은 버튼이 없어졌으므로 "저장 줄이 패널 안에 보임"으로 본다.

## 6. 주니어 4단계에 넘기는 것

1. `git switch step/EX-3 && git pull --ff-only` 후 §2 명령 재실행 + `npm run build`·`npm run test:e2e`(확장 변경이라 영향 없음을 확인)
2. `gh pr create --base main --head step/EX-3`(Draft 아님 — 기능 완료, 수동 검수는 머지 전 사람 확인 항목으로 본문에 표기) → `gh pr checks <N> --watch` → 리뷰 코멘트 확인·처리(코드 결함이면 시니어 핀포인트 3-P로 돌린다)
3. 이 파일 §7(새 절)에 PR 번호·CI 실행 번호·리뷰 처리, [진행_크롬확장](../진행_크롬확장.md) EX-3 행 상태 갱신. 수동 검수 §5는 사람이 한다 — 결과를 받기 전에는 "미실시"로 둔다
4. 마지막 Step이므로 머지 준비 PR에서 진행 파일을 `완료/`로 옮길지는 수동 검수 결과를 보고 시니어·사용자가 정한다(지금 옮기지 않는다)

## 7. 주니어 4단계 전체 회귀·PR·CI·리뷰 기록 (2026-11-15)

- **PR**: [#25](https://github.com/choise-hun/doloop/pull/25) (`step/EX-3` → `main`, Draft 아님)
- **CI (구현 최종 커밋 `186d881`)**: 실행 번호 `43635893626` ([Actions](https://github.com/choise-hun/doloop/actions/runs/43635893626)) — 5건 성공(`CI/Detect code changes`, `CI/Test (Node 22)`, `CI/Docker build & smoke`, `CI/E2E XSS & CSP (Playwright)`, `CI/CI ok`), 1건 스킵(`CI/Kotlin test (JDK 21)`, 서버 변경 없음)

### 전체 회귀 실행 결과 (`186d881` 기준)

```text
$ node --test test/extension_ex3.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex1.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex2.test.js   → tests 16 / pass 16 / fail 0
$ for f in practice-panel content background auth options; do node --check extension/$f.js; done   → 출력 없음
$ grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js   → 0건
$ npm test   → tests 482 / pass 482 / fail 0
$ npm run build   → tsc --noEmit && vite build 통과
$ npm run test:e2e   → 836 passed (10.9m)
```

- 미실행: `./gradlew test`(서버 변경 없음), §5 수동 검수 `EX3-M1`~`EX3-M6`(미실시 — 사람 확인 대기)

### PR #25 리뷰 코멘트 (Codex Review — 시니어 3-P 인계 대상)

`chatgpt-codex-connector[bot]`가 `186d881`에 대해 4종(중복 코멘트 포함 총 5건)의 코드 결함 지적을 남겼으며, 주니어 4단계 범위 규칙에 따라 `extension/`·`test/`는 수정하지 않고 시니어 3-P로 넘긴다.

| 등급 | 위치 | 요약 | 링크 |
| --- | --- | --- | --- |
| P1 | `extension/practice-panel.js:1013` | `REDO_AUTH_CHANGED` 시 누적분·등록 상태만 지우고 `state.a`·`state.b`·`state.rate`·`state.loopOn`을 유지하여 `loadSaved()`가 조기 반환하고 B 계정에 A 계정 구간·배속이 저장될 수 있음 | [r4575473474](https://github.com/choise-hun/doloop/pull/25#discussion_r4575473474) |
| P2 | `extension/practice-panel.js:810` | `loadSaved()`가 유효한 A–B 구간이 없으면 조기 반환해 `{ a: null, b: null, rate: 0.75 }` 곡의 `pendingRate`가 설정되지 않고 저장 시 `1`로 덮일 수 있음 | [r4575473477](https://github.com/choise-hun/doloop/pull/25#discussion_r4575473477) |
| P2 | `extension/background.js:224` | `saving` 맵이 모든 탭에 공유되어 두 탭이 같은 곡·같은 본문(예: 각각 60초)을 동시에 저장하면 요청이 합쳐져 한쪽 60초가 유실될 수 있음 | [r4575473479](https://github.com/choise-hun/doloop/pull/25#discussion_r4575473479) |
| P2 | `extension/practice-panel.js:571` | 버퍼링(`paused === false`, `readyState = 2`, `waiting`) 중에도 `tick()`이 시간을 누적해 실제 재생 없이 연습 시간이 기록될 수 있음 (동일 위치 중복 코멘트 `r4575473481`·`r4575473484`) | [r4575473484](https://github.com/choise-hun/doloop/pull/25#discussion_r4575473484) |

## 8. 시니어 3-P 핀포인트 검증 — PR #25 Codex 리뷰 4종 (2026-11-15)

- 입력: PR #25 head `946595c`(로컬 일치, `git status` 깨끗), 리뷰 r4575473474·r4575473477·r4575473479·r4575473481/r4575473484(중복)
- 읽기 범위: `extension/practice-panel.js`의 `tick`·`attachVideo`·`loadSaved`·`lookup`·`addSong`·`saveProgress`·`sync`·`REDO_AUTH_CHANGED` 처리, `extension/background.js`의 `savePractice`·`onMessage`, `test/extension_ex3.test.js` 하네스. **이 밖은 읽지 않았다 = 미검증**

| # | 리뷰 | 판정 | 원인 | 수정 | 회귀 테스트 |
| --- | --- | --- | --- | --- | --- |
| 1 | P1 계정 전환 시 이전 계정 구간·배속 유지 | **반영** | `REDO_AUTH_CHANGED`가 누적·등록 상태만 지우고 `a`·`b`·`loopOn`을 남겨 `loadSaved()`가 조기 반환 → B 곡에 A 구간·A `pendingRate` 없이 지금 배속 저장 | 계정 전환 시 `a`·`b`·`loopOn`·`loops`를 비우고 rAF·임시 문구 정리(영상 전환 `sync()` fresh 분기와 같은 범위). `state.rate`는 영상의 실제 재생 배속이라 유지하고, B의 저장 배속은 `loadSaved`가 `pendingRate`로 넣는다 | `PR25-1(P1)` — B 저장값 30–40초·1.25x 전송 확인 |
| 2 | P2 구간 없는 곡의 저장 배속 덮어쓰기 | **반영** | `loadSaved()`가 유효 구간이 없으면 배속까지 건너뜀 → `rateToSave()`=지금 배속(1x)이 서버 0.75x를 덮음 | 구간 복원과 배속 보존을 분리: 숫자 배속이면 구간 유무와 무관하게 `pendingRate` 설정, 구간이 없으면 "저장된 배속(…)… 구간을 정하고 [반복]을 켜면 적용됩니다" 안내 | `PR25-2(P2)` — 불러온 직후 "저장 안 됨" 없음, 저장 `rate:0.75`, 구간 지정 후 [반복] 시 0.75x 적용 |
| 3 | P2 서로 다른 탭 저장이 한 요청으로 합쳐짐 | **반영** | 서비스 워커 `saving` 키가 본문만이라 두 탭의 독립된 같은 본문(60초씩)을 1회 POST로 합치고, 두 패널 모두 `keep:false`로 60초씩 차감 → 60초 유실 | 키를 `[보낸 탭 id, 본문]`으로. `savePractice(msg, tabId = null)` 둘째 인자(선택) 추가, `onMessage`가 `sender.tab.id`를 넘김. 같은 탭 연타 합치기(EX3-연타)는 유지 | `PR25-3(P2)` — 탭 1·2 동시 60초는 2회, 같은 탭 연타는 1회 |
| 4 | P2 버퍼링 중 시간 누적 | **반영** | `counting`이 `paused`·`ended`·광고만 봐서, 반복 rAF가 버퍼링 중에도 `tick()`을 불러 대기 시간 전체 누적 | `counting`에 `video.readyState >= 3`(HAVE_FUTURE_DATA) 추가, `waiting` 이벤트에서 `lastCountAt = null`(반복이 꺼져 rAF가 없을 때 재개 첫 `timeupdate`가 대기 시간을 최대 2초 더하는 경로도 막음) | `PR25-4(P2)` — 반복 rAF 경로 60초·rAF 없는 경로 30초 모두 제외 |

- 계약: 서버 API·메시지 타입·응답 모양 변경 없음. `createApi().savePractice`에 선택 인자 `tabId`만 추가(기존 호출은 그대로 동작 — EX3-연타·EX3-오류가 인자 없이 통과). 테스트 하네스의 가짜 `video`에 실제 브라우저 기본값과 같은 `readyState: 4`를 추가(기존 단언 변경·완화 없음)
- 테스트 작성 중 수정: `PR25-2`의 "저장 안 됨 없음" 확인을 `play(5)` 앞으로 옮겼다(쌓인 5초 때문에 당연히 dirty). 수정 전 코드에서도 그 시점에 `rateToSave()=1≠0.75`로 실패함을 Red에서 확인

### Red → Green

```text
# 수정 전(extension/ stash) — 새 테스트 4건만 실패
$ node --test test/extension_ex3.test.js   → pass 12 / fail 4 (PR25-1·2·3·4)
  PR25-1: actual '00:10.0' expected '--:--.-' / PR25-3: actual 1 expected 2 / PR25-4: actual 68 expected 8
# 수정 후
$ node --test test/extension_ex3.test.js   → tests 16 / pass 16 / fail 0
$ node --test test/extension_ex1.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex2.test.js   → tests 16 / pass 16 / fail 0
$ for f in practice-panel content background auth options; do node --check extension/$f.js; done   → 출력 없음
$ grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js   → 0건
```

### 주니어 4단계 인계

- 미커밋 변경: `extension/background.js`, `extension/practice-panel.js`, `test/extension_ex3.test.js`, 이 결과 파일 §8, `개발산출물/진행_크롬확장.md` EX-3 줄
- 할 일: 위 표적 회귀 재실행 + `npm test`·`npm run build`·`npm run test:e2e` → 커밋 2개(`fix(extension): PR #25 리뷰 4종 …` 코드·테스트 / `docs(extension): EX-3 3-P 기록`) → `step/EX-3` push(기존 PR #25 갱신) → `gh pr checks 25 --watch` → 새 리뷰 확인 → 이 §8 아래에 CI run·새 리뷰 처리 기록
- 미실행: `npm test`·`build`·E2E(주니어), 수동 검수 EX3-M1~M6(사람 — 특히 실제 유튜브 버퍼링 시 `readyState` 변화와 두 탭 동시 저장은 수동으로만 확인 가능)

### 4단계 전체 회귀 (`4bc86b6` 기준)

```text
$ node --test test/extension_ex1.test.js   → tests 12 / pass 12 / fail 0
$ node --test test/extension_ex2.test.js   → tests 16 / pass 16 / fail 0
$ node --test test/extension_ex3.test.js   → tests 16 / pass 16 / fail 0
$ for f in practice-panel content background auth options; do node --check extension/$f.js; done   → 출력 없음
$ grep -n "innerHTML\|chrome\.storage\|\.key\b" extension/practice-panel.js   → 0건
$ npm test   → tests 486 / pass 486 / fail 0
$ npm run build   → tsc --noEmit && vite build 통과
$ npm run test:e2e   → 836 passed (11.0m)
```

- 미실행: `./gradlew test`(서버 변경 없음), §5 수동 검수 `EX3-M1`~`EX3-M6`(미실시 — 사람 확인 대기)
