# EX-1 결과 — 크롬 확장: 로그인·곡 추가

> 작업: EX-1 (시니어 직접 구현) | 브랜치: `step/EX-1` (push, PR 없음) | 기준 명세: [EX-1_크롬확장_구현명세.md](../명세/EX-1_크롬확장_구현명세.md)
> 상태: 핵심 구현 + 표적 테스트 완료(2026-11-14, Mac). 전체 회귀·PR·CI는 주니어 4단계, 실제 로그인·곡 추가는 사람 설정(§5) 뒤 수동 검수(§6). **서비스 검수 완료가 아니다.**
> 사용자 승인: 2026-11-14 U1~U6 전부.

## 1. 바꾼 파일

| # | 구분 | 파일 | 내용 |
| --- | --- | --- | --- |
| F1 | 신규 | `extension/manifest.json` | 명세 §4 그대로. `key`로 확장 ID `pamcfmpmaoehcmddfieihilojkfjfpld` 고정 |
| F2 | 신규 | `extension/auth.js` | PKCE 로그인, 토큰 보관·갱신(동시 요청 1회), 로그아웃, 10초 제한 fetch |
| F3 | 신규 | `extension/background.js` | 서비스 워커: `POST /api/v1/songs` 중계(연타 방지), `by-video` 조회, 우클릭 메뉴 2개, 메시지 처리, 연결 확인 |
| F4 | 신규 | `extension/content.js` | 화면 전환 감지, 재생 화면 버튼, 점 3개 메뉴 항목, 알림 |
| F5 | 신규 | `extension/overlay.css` | 버튼·메뉴 항목·알림 모양(`redo-` 접두어) |
| F6 | 신규 | `extension/options.html` · `options.js` | 로그인·로그아웃, 서비스 주소, 연결 확인, 메뉴 항목 켜기/끄기 |
| F7 | 신규 | `extension/icons/icon-16·48·128.png` | `public/favicon.svg`(BR-1 로고)를 그대로 그린 것 |
| F8 | 신규 | `src/test/kotlin/ulevelp/ExtensionOriginCorsTest.kt` | V1 / TC-EX-01 (2건) |
| F9 | 신규 | `test/extension_ex1.test.js` | TC-EX-02·03·07·08 + 매니페스트 (7건) |
| F10 | 신규 | `개발산출물/진행_크롬확장.md` · 이 문서 | |
| F11 | 수정 | `개발산출물/인수인계_메모.md` · 명세 상태 줄 | |

서버 코드·API 계약·DB·`frontend/src` 변경 없음. `practice-panel.js`는 만들지 않았다(EX-2).

## 2. 착수 전 검증

| ID | 결과 | 근거 |
| --- | --- | --- |
| V1 | **통과** — 서버 코드 변경 없이 된다 | `ExtensionOriginCorsTest`: 목록에 없는 `chrome-extension://…` → GET·POST 403. `parseAllowedOrigins("웹주소, chrome-extension://…")`로 넣으면 GET 200 + `Access-Control-Allow-Origin`, 사전 요청(OPTIONS, `authorization,content-type`) 200, POST는 403이 아님(인증 단계까지 감), 다른 확장 ID는 계속 403. Ktor CORS가 `chrome-extension` scheme을 받는다 |
| V2 | **확인** | `supabase/auth` `openapi.yaml`, `auth-js` `GoTrueClient.ts`: `GET /auth/v1/authorize?provider&redirect_to&code_challenge&code_challenge_method=s256` → `redirect_to?code=…`(오류는 `error`·`error_description`), `POST /auth/v1/token?grant_type=pkce` `{auth_code, code_verifier}`, `?grant_type=refresh_token` `{refresh_token}`, 헤더 `apikey`, 응답 `access_token`·`refresh_token`·`expires_in`·`expires_at`·`user`, `POST /auth/v1/logout?scope=local` 204. Auth Code는 5분·1회용 |
| V3 | **확인** — 구조가 두 가지다 | 2026-11-14 실제 유튜브(헤드리스 크로미움 134, 비로그인, 한국어)에서 확인. 아래 §3 |

## 3. 유튜브 화면 구조 (V3) — 선택자는 `content.js` `REDO_SEL`

| | 구형 | 신형 |
| --- | --- | --- |
| 나오는 곳 | 검색 결과 | 채널 동영상 탭, 재생 화면 옆 추천 |
| 카드 | `ytd-video-renderer` (그 밖 `ytd-compact-video-renderer`·`ytd-grid-video-renderer`·`ytd-rich-item-renderer`도 대상에 둠) | `yt-lockup-view-model` |
| 메뉴 버튼 | `ytd-menu-renderer button` | `.ytLockupMetadataViewModelMenuButton button` |
| 팝업 | `ytd-popup-container > tp-yt-iron-dropdown` (공통, 닫히면 `display:none`·`aria-hidden="true"`로 남아 다시 쓰인다) | 같음 |
| 메뉴 목록 | `ytd-menu-popup-renderer #items` | `yt-list-view-model[role="menu"]` |
| 항목 높이 | 36px | 40px |

- 버튼의 `aria-label`("추가 작업"·"작업 메뉴")은 언어마다 달라 선택자로 쓰지 않았다.
- 제외 판정: 카드의 첫 `a[href*="/watch?v="]`에 `list=`가 있으면 재생목록·믹스로 보고 뺀다. 쇼츠(`ytm-shorts-lockup-view-model`, `/shorts/` 링크)와 광고(광고 주소 링크)는 watch 링크가 없어 빠진다.
- 팝업은 열 때 `max-height`를 고정한다. 항목을 더한 뒤 팝업에 `iron-resize`를 보내면 다시 잰다(안 되면 `window` `resize`로 한 번 더).
- 기억한 videoId는 ① 메뉴 버튼을 누른 뒤 1.5초 안에 열린 팝업에만 ② 같은 팝업 요소에만 쓰고 ③ 닫히거나 다른 메뉴 버튼을 누르면 버린다(다른 카드의 영상이 추가되는 것을 막는다).
- **확인하지 못한 것:** 로그인 상태의 홈 화면(비로그인 홈은 카드가 없다), 구독·기록 화면, 다크 테마. 수동 검수 TC-EX-05에서 본다. 구조가 다르면 항목이 안 나올 뿐 오류는 없고 우클릭 메뉴는 남는다.

## 4. 명세와 달라진 점·판단

| # | 내용 | 이유 |
| --- | --- | --- |
| 1 | `storage.local.setAccessLevel('TRUSTED_CONTEXTS')`는 **있을 때만** 호출한다 | 크롬 134에는 `local` 영역에 이 함수가 없다(`session`에만 있다). 그대로 부르면 서비스 워커 등록이 멈춘다. 없는 버전에서는 이 확장의 콘텐츠 스크립트가 저장소를 읽을 수 **있는** 상태다. 유튜브 페이지 자체의 스크립트는 어느 쪽이든 닿지 못하고, `content.js`는 저장소를 읽지 않으며 토큰을 메시지로 받지도 않는다. 더 강하게 막으려면 액세스 토큰을 `storage.session`에 두는 안이 있다(갱신 토큰은 `local`에 남아야 해서 완전하지 않다) — 사용자 결정 사항으로 남긴다 |
| 2 | [연결 확인]에 `POST /api/health` 1회 추가 | 크롬은 확장의 GET에 `Origin`을 붙이지 않는다. 운영 서버로 확인: GET은 200, 확장 출처 POST는 403. POST로 봐야 `ALLOWED_ORIGINS` 누락을 알 수 있다. 없는 경로라 허용되면 404가 온다(서버에 영향 없음) |
| 3 | 갱신 실패 때 토큰 삭제는 **서버가 거부(4xx)한 경우만**. 연결 실패·시간 초과·5xx는 세션을 남기고 "서버에 연결하지 못했습니다" | 명세 §5.1-3은 "갱신 실패면 삭제". 잠깐의 네트워크 장애로 로그아웃되는 것을 피했다. API 401은 명세대로 삭제 |
| 4 | 로그인 창(`launchWebAuthFlow`)은 옵션 화면에서 연다. `auth.js`를 서비스 워커와 옵션 화면이 함께 import한다 | 로그인 창이 떠 있는 동안 서비스 워커가 잠들 수 있다. 갱신은 서비스 워커만 한다. 갱신 중 로그아웃·재로그인은 저장된 갱신 토큰을 다시 읽어 대조해 결과를 버린다 |
| 5 | 우클릭 메뉴는 2개를 등록한다: 링크용(`targetUrlPatterns` 명세 그대로) + 재생 화면용(`documentUrlPatterns` watch·shorts) | `targetUrlPatterns`는 링크·이미지에만 걸려 "재생 화면"(명세 §5.2 ①)을 덮지 못한다 |
| 6 | 서비스 주소는 운영·개발 두 값 중 선택만 된다(직접 입력 없음) | `host_permissions`에 있는 주소만 호출할 수 있다 |
| 7 | 콘텐츠 스크립트는 설정을 서비스 워커에 물어 받는다(`menuItem`만). 바꾼 설정은 다음 화면 전환 때 적용된다 | 저장소 접근을 막는 것(1번)과 맞춘 것 |
| 8 | 우클릭 메뉴 결과 알림은 콘텐츠 스크립트가 있는 탭에만 뜬다 | 확장 설치 전에 열려 있던 유튜브 탭은 새로고침해야 한다. `notifications`·`scripting` 권한은 승인된 매니페스트에 없다 |

## 5. 사람이 할 일 (EX-사람)

1. Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs에 `https://pamcfmpmaoehcmddfieihilojkfjfpld.chromiumapp.org/` 추가.
2. Cloud Run 환경 변수 `ALLOWED_ORIGINS`에 `chrome-extension://pamcfmpmaoehcmddfieihilojkfjfpld`를 쉼표로 덧붙이고 재배포. (2026-11-14 운영 확인: 지금은 이 출처의 POST가 403)
3. `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" → `extension/`. 옵션 화면 "연결 정보"에 위 두 값이 그대로 보인다.
4. 옵션 화면 → [Google로 로그인] → [연결 확인]이 "서버 연결됨 · 로그인 확인됨".

- 확장 ID용 개인 키는 이 Mac의 `~/.config/redo-extension/key.pem`에만 있다(git에 없다). 압축 해제 로드에는 필요 없다. 크롬 웹 스토어에 올리면 스토어가 ID를 새로 정하므로(U6) 그때 1·2번 값을 새 ID로 다시 등록해야 한다.
- 개발 서버(`http://127.0.0.1:3000`)로 볼 때는 그 서버의 `ALLOWED_ORIGINS`에도 같은 값을 넣는다.

## 6. 검증

**자동 (2026-11-14 로컬 실행)**

| TC | 방법 | 결과 |
| --- | --- | --- |
| TC-EX-01 | `./gradlew test --tests 'ulevelp.ExtensionOriginCorsTest'` | 2 passed (`ForwardedHeadersTest` 2건도 함께 통과) |
| TC-EX-02 | `test/extension_ex1.test.js` — PKCE 값, 만료 60초 이내 동시 3건에 갱신 1회, 거부 시 삭제, 장애 시 유지, 갱신 중 로그아웃 | 통과 |
| TC-EX-03 | 같은 파일 — watch·youtu.be·shorts·잘못된 주소 11종, 카드 링크(재생목록·쇼츠·광고 제외) | 통과 |
| TC-EX-07 | 같은 파일 — 201·200·토큰 없음·401·403·본문 없는 500·연결 실패·잘못된 videoId | 통과 |
| TC-EX-08 | 같은 파일 — 같은 영상 3연타 요청 1회 | 통과 |
| 전체 | `npm test` | 449 passed, 0 failed |

**실제 브라우저에서 본 것 (헤드리스 크로미움 134, 비로그인 유튜브, 스크립트로 확인 — 수동 검수를 대신하지 않는다)**

- 확장 로드: 서비스 워커 등록, ID `pamcfmpmaoehcmddfieihilojkfjfpld`, 옵션 화면 오류 0건.
- 메시지: `GET_SETTINGS`·`LOOKUP_SONG`·`ADD_SONG` 응답, 비로그인 `ADD_SONG` → "로그인이 필요합니다" 알림 + [로그인].
- [연결 확인] → 운영 서버에서 "서버가 이 확장 프로그램의 출처를 허용하지 않습니다"(§5-2 전이라 맞는 결과).
- 점 3개 메뉴: 구형(검색)·신형(채널·재생 화면 옆) 모두 항목 1개가 맨 아래에 보임, 다시 열어도 1개, 누른 카드의 videoId로 요청, 누르면 메뉴 닫힘, 쇼츠·믹스 카드에는 없음, 설정을 끄면 다음 화면부터 없음.
- 화면 전환: 채널 → 영상 → 뒤로에서 재생 화면 버튼이 생기고 사라짐.

**실행하지 않은 것**

- 실제 Google 로그인·토큰 교환·실제 곡 추가(201/200): §5 설정 전이라 불가. → 수동 TC-EX-04·05·07.
- `./gradlew test` 전체, `npm run build`, `npm run test:e2e`: 주니어 4단계.
- 로그인한 유튜브 홈·구독 화면, 다크 테마, 윈도우.

**수동 검수표 (§5 뒤)**

| TC | 할 일 | 통과 기준 |
| --- | --- | --- |
| TC-EX-04 | 유튜브 홈·검색에서 영상 썸네일 우클릭 → "RE:DO에 추가". 재생 화면 빈 곳 우클릭도 | "RE:DO에 추가했습니다" 알림, [열기]로 연습 화면, 웹앱 목록에 곡 |
| TC-EX-05 | 홈·검색·채널·재생 화면 옆 목록에서 점 3개 메뉴 → "RE:DO에 추가". 닫고 다른 카드에서 다시 | 항목 1개, 누른 카드의 영상이 추가됨. 쇼츠·재생목록·믹스 카드에는 없음 |
| TC-EX-06 | 홈 → 영상 → 홈 → 다른 영상 | 재생 화면에서만 우측 상단 버튼, 등록된 곡이면 "RE:DO에 있음" |
| TC-EX-07 | 로그아웃 상태로 추가 / 곡 한도 계정으로 추가 / 서비스 주소를 꺼진 개발 서버로 | "로그인이 필요합니다"+[로그인] / 서버 문구 / "서버에 연결하지 못했습니다" |

## 7. EX-2에 넘기는 것

- `content.js`의 함수는 `redo` 접두어 전역이다(콘텐츠 스크립트끼리는 같은 격리 영역을 쓴다). `practice-panel.js`를 `manifest.json` `content_scripts[0].js`에 `content.js` 뒤로 넣는다.
- 재생 화면 버튼(`.redo-watch-btn`, `syncWatchButton`)은 EX-2에서 패널 안으로 옮긴다(명세 §5.2 ③).
- 서비스 워커에 `SAVE_PRACTICE` 메시지와 `createApi`의 저장 함수를 더한다. `authedFetch`·연타 방지 방식을 그대로 쓴다. `LOOKUP_SONG`은 지금 `state`·`openUrl`만 돌려주므로 `songId`·`a`·`b`·`rate`를 더해야 한다.
- 영상 전환 판정은 `redoWatchVideoId(location.href)` + 요청 시점 videoId 대조(`syncWatchButton` 방식).
- 광고 선택자 `REDO_SEL.adShowing`은 상수만 넣어 두었다(EX-1에서는 쓰지 않는다).

## 8. PR·CI (주니어 4단계가 채운다)

- PR: [PR #23](https://github.com/choise-hun/doloop/pull/23) (`step/EX-1` → `main`)
- CI: `417bd54` 기준 6/6 통과 (`CI/Detect code changes` 6s, `CI/Test (Node 22)` 29s, `CI/Kotlin test (JDK 21)` 2m33s, `CI/Docker build & smoke` 1m26s, `CI/E2E XSS & CSP (Playwright)` 9m47s, `CI/CI ok` 3s). 문서 갱신 커밋 push 후 최신 head CI 재확인.
- 전체 회귀 (2026-11-14 로컬, `417bd54`):
  - `npm test`: 449 passed, 0 failed (58 suites)
  - `npm run build`: `tsc --noEmit && vite build` 성공 (177 modules transformed)
  - `./gradlew test`: 383 passed, 0 failed, 0 skipped (44 suites, BUILD SUCCESSFUL)
  - `npm run test:e2e`: 836 passed
  - 미실행: 실제 로그인·곡 추가 수동 검수(TC-EX-04~07)는 §5 사람 설정 뒤 진행
- 리뷰 코멘트 (`chatgpt-codex-connector`, `417bd54` 기준 4건 — 4단계 범위상 `extension/` 미수정, 시니어 3-P/후속 조치 인계):
  1. **[P1] `extension/auth.js:162`** ([코멘트](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855731)): 갱신 중 로그아웃 후 B 계정으로 재로그인 시 `current.accessToken`을 반환해 A의 요청이 B 인증으로 실행될 수 있음. **판단: 타당** (`extension/auth.js:162`에서 `current.refreshToken !== used.refreshToken`일 때 `null` 반환/취소 필요).
  2. **[P2] `extension/background.js:98`** ([코멘트](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855738)): 지연된 401 응답이 현재 저장된 새 세션까지 `auth.clearSession()`으로 무조건 삭제함. **판단: 타당** (`extension/background.js:96-98`에서 요청 시점 토큰/세션 대조 후 삭제 필요).
  3. **[P2] `extension/content.js:206`** ([코멘트](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855743)): 같은 영상에서 계정 전환 시 `if (videoId === watchVideoId && watchBtn) return;` 조기 반환과 인증 변경 알림 부재로 버튼 상태(`RE:DO에 있음`)가 갱신되지 않음. **판단: 타당** (`extension/content.js:204-206`).
  4. **[P2] `extension/auth.js:34`** ([코멘트](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855747)): `fetchWithTimeout`이 `fetchImpl()` 반환 시 `finally`에서 타이머를 해제해 응답 본문(`res.json()`) 지연 시 10초 제한이 적용되지 않음. **판단: 타당** (`extension/auth.js:28-36`).

## 9. PR #23 리뷰 결함 핀포인트 수정 (시니어 3-P, 2026-11-14)

기준: `step/EX-1` head `ded017d`(CI 통과). 읽은 범위는 `extension/auth.js`·`extension/background.js`·`extension/content.js`의 해당 함수와 직접 호출부, `test/extension_ex1.test.js`뿐이다. **그 밖(`options.js`·`overlay.css`·서버)은 이번에 다시 보지 않았다 = 미검증.**

| # | 코멘트 | 판정 | 수정 | 회귀 테스트 |
|---|---|---|---|---|
| 1 | [P1 auth.js:162](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855731) 갱신 중 계정 전환 시 B 토큰 반환 | 타당 | `runRefresh`: 갱신이 끝났을 때 세션이 바뀌었으면(갱신 토큰 불일치) `AuthError('cancelled')`를 던진다(거부 응답 분기도 같음). `getAccessToken`: 진행 중 갱신은 **같은 갱신 토큰의 세션일 때만** 함께 쓴다 — 전에는 B가 새로 시작한 요청도 A의 갱신에 묶였다. `background.authedFetch`는 `cancelled` → `fail: 'switched'` → 곡 추가 알림 "요청 도중 계정이 바뀌어 추가하지 않았습니다"(조회는 `unknown`, 연결 확인은 연결 실패 문구) | `PR23-1` |
| 2 | [P2 background.js:98](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855738) 늦은 401이 새 세션 삭제 | 타당 | `auth.clearSessionIfToken(usedAccessToken)` 추가: 요청에 쓴 액세스 토큰이 지금 세션 것일 때만 지운다. `authedFetch`의 401 분기가 이것을 부른다 | `PR23-2` |
| 3 | [P2 content.js:206](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855743) 같은 영상에서 계정 전환 시 버튼 상태 미갱신 | 타당 | ① 저장 세션에 `sid`(로그인 1회 식별값, `signIn`에서 생성·갱신 때 유지) ② 서비스 워커 `chrome.storage.onChanged`에서 `isAccountChange`(있음↔없음 또는 `sid` 변경, 토큰 갱신은 제외)이면 `tabs.query({url:'https://www.youtube.com/*'})` 탭에 `REDO_AUTH_CHANGED` 전송(권한 추가 없음 — 유튜브 host_permissions로 url 필터 가능) ③ 콘텐츠 스크립트는 이 메시지에 `syncWatchButton(true)`로 같은 영상도 다시 조회하고, `watchGen` 세대값으로 이전 계정의 늦은 조회·추가 응답을 버린다 | `PR23-3`(콘텐츠 스크립트 가짜 DOM), `PR23-3`(서비스 워커 알림) |
| 4 | [P2 auth.js:34](https://github.com/choise-hun/doloop/pull/23#discussion_r4573855747) 본문 소비 전 타이머 해제 | 타당 | `fetchWithTimeout(…, timeoutMs, readBody)`: `readBody`를 주면 본문 읽기까지 같은 제한 시간 안에서 `Promise.race`로 끝내고 `{ res, body }`를 돌려준다(5번째 인자 없으면 기존과 같이 `res`). 토큰 요청(`requestToken`)과 API 호출(`authedFetch`)이 `readJsonOrNull`로 본문을 함께 읽는다. 테스트용으로 `createAuth`·`createApi`에 `timeoutMs`(기본 10초) 주입 | `PR23-4` |

계약 영향: 서버 API·DB·manifest 권한 변화 없음. 확장 내부 export만 늘었다(`readJsonOrNull`, `isAccountChange`, `registerWithChrome` export, `auth.clearSessionIfToken`). 저장 세션 모양에 `sid` 추가 — 이전 버전으로 저장된 세션은 `sid`가 없고 `''`로 취급한다(갱신해도 계정 변경으로 보지 않는다).

검증(로컬, 2026-11-14, `node --test --test-timeout=3000 test/extension_ex1.test.js`):
- **Red**(수정 전, 테스트만 추가): tests 12 · pass 7 · fail 4 · cancelled 1 — `PR23-1` 3000ms 시간 초과(B의 요청이 A의 갱신에 묶여 멈춤), `PR23-2` 새 세션 삭제(`Cannot read properties of undefined (reading 'accessToken')`), `PR23-4` `Missing expected rejection`, `PR23-3` 콘텐츠 재조회 없음(`1 !== 2`), `PR23-3` 워커 `isAccountChange is not a function`
- **Green**(수정 후): tests 12 · pass 12 · fail 0. 기존 `TC-EX-07` 하니스의 가짜 auth는 `clearSession` → `clearSessionIfToken`으로 이름만 맞췄다(단언 그대로)
- `node --check` 3개 파일 통과
- 미실행(주니어 4단계): `npm test` 전체, `npm run build`, `./gradlew test`, `npm run test:e2e`, 커밋·push·PR #23 갱신·CI. 실제 크롬에서 계정 전환 수동 확인은 EX-1 검수(TC-EX-04~07)에 함께 본다
