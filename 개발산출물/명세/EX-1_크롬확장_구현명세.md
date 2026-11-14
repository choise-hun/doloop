# EX 크롬 확장 프로그램 (유튜브에서 곡 추가 · 오버레이 연습) 구현 명세

> **개정 2026-11-14 (시니어 1단계) — 사용자 승인 2026-11-14(U1~U6 전부).** 초판(PR #157)을 실제 코드와 대조해 전제 6개를 바로잡고(§1), 유튜브 목록 화면에서 곡을 바로 추가하는 기능을 더했다(§5). EX-1 구현 결과와 명세에서 달라진 점은 [결과/EX-1](../결과/EX-1.md) §4, 진행은 [진행_크롬확장](../진행_크롬확장.md).

- **목표:** 크롬 확장을 설치하면 ① 유튜브 어느 화면에서든 영상을 RE:DO 연습곡으로 바로 추가하고(EX-1), ② 영상 재생 화면 위 패널에서 구간 반복·배속·단축키로 연습하고 구간을 저장한다(EX-2).
- **선행 조건:** ST 완료(충족 — PR #153~#155 머지). 활성 작업 DS-3(`step/DS-3`)과 겹치는 파일 없음.
- **형태:** Chrome Extension Manifest V3, 빌드 단계 없는 순수 JS. 독립 디렉터리 `extension/`.
- **이름:** 사용자에게 보이는 이름은 `RE:DO`(BR-1). 내부 식별자·API 경로는 그대로.

---

## 0. 사용자 결정 (승인 필요)

| ID | 결정 항목 | 추천 | 대안 · 탈락 사유 |
|---|---|---|---|
| U1 | 인증 방식 | **확장 자체 Google 로그인** — `chrome.identity.launchWebAuthFlow` + Supabase PKCE. 확장이 자기 세션(갱신 토큰)을 따로 갖는다 | 웹앱 탭의 `localStorage`에서 토큰 읽기: 액세스 토큰이 약 1시간 뒤 만료되고, 확장이 웹앱의 갱신 토큰을 쓰면 웹앱 세션이 끊길 수 있다. 초판의 쿠키 방식은 불가(P1) |
| U2 | 서버 허용 출처 | 운영 환경 변수 `ALLOWED_ORIGINS`에 `chrome-extension://<확장 ID>` 추가(사람). 서버 코드 변경 없음(P2, 착수 전 검증 V1) | 요청의 `Origin` 헤더를 확장에서 지우기(`declarativeNetRequest`): 권한이 늘고 우회 성격이라 탈락 |
| U3 | 목록 화면 곡 추가 진입점 | **우클릭 메뉴(기본) + 점 3개 메뉴 끼워넣기(보조)** (§5.2) | 썸네일 위 버튼: 유튜브 자체 버튼 2개(나중에 보기·대기열)와 자리가 겹치고 모든 썸네일에 표시가 늘어 탈락 |
| U4 | Step 분할 | **EX-1** 로그인·곡 추가 → **EX-2** 오버레이 연습 (§2) | 한 Step: 사용자 여정 2개·파일 9개로 상한 초과 |
| U5 | 확장 연습의 시간 기록 | EX-2 [저장] 때 구간·배속과 함께 누적 재생 시간·반복 횟수(`addSeconds`·`addLoops`)를 보낸다 — 웹 플레이어와 같은 필드(`PracticePage.tsx:364-381`) | 구간·배속만 저장: 확장에서 한 연습이 기록에 남지 않아 서비스 쪽 효용이 줄어든다 |
| U6 | 배포 | 1차는 압축 해제 로드(개발자 모드)로 검수. 크롬 웹 스토어 등록은 사람이 따로(등록비·개인정보 처리방침·심사) | — |

사람이 할 일(U1·U2 승인 시): Supabase Auth Redirect URLs에 `https://<확장 ID>.chromiumapp.org/` 등록, Cloud Run `ALLOWED_ORIGINS` 값 추가·재배포. 확장 ID는 `manifest.json`의 `key`로 고정한다(§4).

---

## 1. 전제 확인 (초판 대비 보정)

| # | 초판 전제 | 실제 (근거) | 보정 |
|---|---|---|---|
| P1 | 웹앱 로그인 쿠키에서 Supabase JWT를 꺼낸다 | 세션은 쿠키가 아니라 `localStorage` 키 `ulp:auth`에 있다(`frontend/src/lib/auth.ts:96-102`). 서버는 `Authorization: Bearer`만 본다(`auth/AuthPlugin.kt:36-37`) | `cookies` 권한 삭제. 인증은 U1 |
| P2 | 서비스 워커가 중계하면 CORS 문제가 없다 | 서버 CORS는 허용 목록 방식이다(`Main.kt:254-276`, 목록은 env `ALLOWED_ORIGINS` — `Main.kt:92-97,151`). 확장의 POST에는 `Origin: chrome-extension://<ID>`가 붙으므로 목록에 없으면 403이 예상된다 — **미확인, V1로 검증** | U2 |
| P3 | 연습 엔진 참조 `public/practice.js:30-180` | 파일 없음. 웹 플레이어는 `frontend/src/pages/PracticePage.tsx` | 참조 삭제. 확장 루프 엔진은 독립 구현(§6.2) |
| P4 | 콘텐츠 스크립트 대상 `youtube.com/watch*` | 유튜브는 화면 전환 때 문서를 새로 받지 않는다. 홈에서 영상으로 들어가면 스크립트가 주입되지 않는다 | 대상을 `https://www.youtube.com/*`로 넓히고 `yt-navigate-finish`에서 화면 종류를 판별 |
| P5 | `<video>` 직접 제어로 광고 건너뛰기까지 보장 | 광고도 같은 `<video>`로 재생된다. 광고를 건너뛰는 기능은 넣지 않는다 | 광고 재생 중(`#movie_player.ad-showing`)에는 루프·배속 적용을 멈춘다 |
| P6 | 곡 추가에 제목·채널을 화면에서 추출해 보낸다 | `title`이 비면 서버가 oEmbed로 제목·채널을 채운다(`SongService.kt:284-294`) | 목록 화면 추가는 `videoId`만 보낸다. 화면 추출 불필요 |

확인된 서버 계약(변경 없음):

- `POST /api/v1/songs` — `videoId` 필수(정규식), `title`≤300, `artist`≤200, `rate` 0.25~2.0, `a`·`b` 0~86400(a<b). 새 곡 201, 기존 곡 200(기존 값 그대로 반환) — `SongRoutes.kt:46-75`, `SongService.kt:273-282`. 곡 한도 초과 시 403(`SongService.kt:296-303`).
- `GET /api/v1/songs/by-video/{videoId}` — 200 `{ song }`, 없으면 `song: null` — `SongRoutes.kt:77-87`.
- `POST /api/v1/practice/save` — `songId`·`pos`·`date` 필수, `a`·`b`·`rate`·`addSeconds`(0~21600)·`addLoops`(0~100000) 선택 — `PracticeRoutes.kt:28-71`.
- 오류 본문 `{ ok, source, status, code, message }` — `ApiError.kt:17-25`.

**착수 전 검증(구현 첫 작업):**

- V1: 서버 테스트로 `Origin: chrome-extension://abc…` POST가 목록에 없을 때 403, `ALLOWED_ORIGINS`에 넣으면 통과하는지 확인(Ktor 3.5.2 CORS가 이 scheme을 받는지 포함). 통과하지 않으면 멈추고 보고한다(서버 코드 변경은 승인 범위 밖).
- V2: Supabase PKCE 엔드포인트(`/auth/v1/authorize`, `/auth/v1/token?grant_type=pkce|refresh_token`)의 매개변수를 공식 문서로 확인.
- V3: 유튜브 목록 카드·점 3개 메뉴의 현재 DOM 구조를 실제 페이지에서 확인해 선택자를 정한다(§5.2).

---

## 2. Step 분할

| Step | 담당 | 내용 | 파일 | 완료 기준 |
|---|---|---|---|---|
| EX-1 | 시니어 직접 구현(인증·토큰 보관·외부 DOM 판단) → 전체 회귀·PR·CI는 주니어 4단계 | 확장 뼈대, 로그인(U1), API 중계, 곡 추가 3개 진입점(§5), 옵션 화면 | `manifest.json`, `background.js`, `auth.js`, `content.js`, `overlay.css`, `options.html`, `options.js`, `icons/` + 서버 CORS 테스트 1개 | TC-EX-01~08 |
| EX-2 | 시니어 명세 → 주니어 | 재생 화면 오버레이 패널: A-B 루프, 배속, 단축키, 구간·시간 저장 | `practice-panel.js`(신규), `content.js`, `overlay.css`, `manifest.json` | TC-EX-09~14 |

구현 승인 시 `개발산출물/진행_크롬확장.md`를 만들고 인수인계 메모 §2에 올린다. 단위 테스트는 DOM과 무관한 순수 함수(videoId 추출, PKCE 값 생성, 시간 표시, 루프 판정)를 `test/extension_*.test.js`로 둔다. 유튜브 실화면 동작은 수동 검수표(§7)로 확인하며 CI 통과만으로 완료로 적지 않는다.

---

## 3. 디렉터리

```
extension/
├── manifest.json
├── background.js        # 서비스 워커: API 중계, 우클릭 메뉴, 메시지 처리
├── auth.js              # 로그인(PKCE)·토큰 보관·갱신 (background에서 import)
├── content.js           # 유튜브 화면 판별, 곡 추가 버튼·메뉴 끼워넣기, 알림 표시
├── practice-panel.js    # (EX-2) 오버레이 패널·루프 엔진·단축키
├── overlay.css
├── options.html / options.js   # 로그인·로그아웃, 서비스 주소, 연결 확인
└── icons/               # 16·48·128 (BR-1 로고 사용)
```

---

## 4. Manifest

```json
{
  "manifest_version": 3,
  "name": "RE:DO 유튜브 연습 도우미",
  "version": "1.0.0",
  "description": "유튜브에서 영상을 RE:DO 연습곡으로 바로 추가하고, 영상 위에서 구간 반복과 배속 연습을 합니다.",
  "key": "<고정 공개 키 — 확장 ID 고정용>",
  "permissions": ["storage", "identity", "contextMenus"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://ulevelp-d5ympfsmfq-du.a.run.app/*",
    "https://vefrfhafmiiivpgjhqiu.supabase.co/*",
    "http://127.0.0.1:3000/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "css": ["overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

- 초판 대비: `cookies` 삭제, `identity`·`contextMenus` 추가, 유튜브 대상을 `www.youtube.com` 전체로, Supabase 주소 추가.
- Supabase 주소와 공개 키는 `public/config.js`의 공개 값과 같다(비밀 값 아님).

---

## 5. EX-1 — 로그인과 곡 추가

### 5.1 인증 (`auth.js`)

1. 옵션 화면 [Google로 로그인] → `launchWebAuthFlow`로 Supabase `authorize`(provider=google, PKCE S256, `redirect_to=https://<ID>.chromiumapp.org/`) → 받은 코드를 `token?grant_type=pkce`로 교환.
2. 액세스·갱신 토큰과 만료 시각을 `chrome.storage.local`에 둔다. `setAccessLevel('TRUSTED_CONTEXTS')`로 콘텐츠 스크립트(유튜브 페이지 쪽)에서는 읽지 못하게 한다. 토큰을 콘텐츠 스크립트로 보내지 않는다 — 콘텐츠 스크립트는 "이 videoId 추가"만 요청하고 호출은 서비스 워커가 한다.
3. API 호출 전 만료 60초 이내면 갱신한다. 동시 요청이 겹쳐도 갱신은 한 번만(진행 중인 Promise 공유). 갱신 실패나 API 401이면 토큰을 지우고 "로그인 필요"를 돌려준다.
4. 모든 fetch는 `AbortController` 10초 제한.

### 5.2 곡 추가 진입점

| 진입점 | 위치 | 방식 | 안정성 |
|---|---|---|---|
| ① 우클릭 메뉴 "RE:DO에 추가" | 유튜브의 모든 영상 링크·썸네일, 재생 화면 | `chrome.contextMenus` (`targetUrlPatterns`: `*://www.youtube.com/watch*`, `*://youtu.be/*`, `*://www.youtube.com/shorts/*`) — 크롬 공식 기능이라 유튜브 화면 구조와 무관 | 높음 |
| ② 점 3개 메뉴 항목 "RE:DO에 추가" | 홈·검색·채널·추천 목록의 카드 | 메뉴 버튼 클릭을 캡처 단계에서 잡아 그 카드의 `a[href*="/watch?v="]`에서 videoId를 기억 → 메뉴 팝업이 열리면(MutationObserver) 맨 아래에 항목 1개 추가, 닫히면 제거 | 중간 — 유튜브 화면 개편 때 깨질 수 있다 |
| ③ 재생 화면 버튼 [RE:DO에 추가] | 영상 재생 화면(EX-2에서 패널 안으로 이동) | 화면 우측 상단 작은 고정 버튼. 이미 등록된 곡이면 "RE:DO에 있음"으로 표시(`by-video` 조회) | 높음 |

②의 규칙:

- 선택자는 `content.js` 맨 위 상수 한 곳에 모은다(V3에서 확정). 카드·메뉴를 찾지 못하면 **아무것도 하지 않는다**(오류 표시 없음, ①이 남는다).
- 유튜브가 메뉴 DOM을 재사용하므로 열릴 때마다 중복 삽입을 검사한다(`data-redo-item`).
- 항목 모양은 유튜브 메뉴 항목의 계산 스타일을 따르되 유튜브 내부 컴포넌트를 복제하지 않는다. 아이콘은 RE:DO 로고.
- 쇼츠·재생목록·믹스 카드는 대상에서 뺀다(videoId 한 개로 정해지는 카드만).

### 5.3 추가 동작 (세 진입점 공통)

1. 콘텐츠 스크립트(또는 우클릭 핸들러) → 서비스 워커 `{ type: 'ADD_SONG', videoId }`. videoId는 `^[a-zA-Z0-9_-]{11}$`로 먼저 검사.
2. 서비스 워커: `POST /api/v1/songs` `{ "videoId": "<id>" }`. 같은 videoId 요청이 진행 중이면 그 결과를 함께 쓴다(연타 방지).
3. 결과를 화면 우측 하단 알림(3초)으로 보여 준다:

| 응답 | 알림 |
|---|---|
| 201 | "RE:DO에 추가했습니다" + [열기](웹앱 연습 화면) |
| 200 | "이미 RE:DO에 있는 곡입니다" + [열기] |
| 401 / 토큰 없음 | "로그인이 필요합니다" + [로그인](옵션 화면) |
| 403 | 서버 `message`(곡 한도 등) |
| 400 · 그 외 | 서버 `message`, 없으면 "추가하지 못했습니다" |
| 시간 초과·네트워크 | "서버에 연결하지 못했습니다" |

[열기] 주소는 웹앱의 기존 연습 화면 경로를 구현 때 `frontend/src` 라우트에서 확인해 쓴다(새 라우트를 만들지 않는다).

### 5.4 옵션 화면

로그인 상태(이메일)·[로그인]/[로그아웃], 서비스 주소(기본 운영 주소, 개발용 `http://127.0.0.1:3000` 선택), [연결 확인](`GET /api/health` + 로그인 시 `by-video` 호출 1회), 점 3개 메뉴 항목 켜기/끄기(기본 켬).

---

## 6. EX-2 — 오버레이 연습

### 6.1 패널

- 위치: 재생 화면 플레이어 우측 상단. 헤더 드래그로 이동, 접기, 닫기(닫으면 그 탭에서 다시 열 때까지 숨김 — 우클릭 메뉴 "연습 패널 열기").
- 구간: [A 지정] `Alt+[`, [B 지정] `Alt+]`, A/B 표시(`mm:ss.s`), [초기화], [반복] 토글 `Alt+L`, [처음으로] `Alt+R`.
- 배속: `0.5x`·`0.75x`·`0.9x`·`1.0x`(`Alt+1~4`), `-0.05` `Alt+-`, `+0.05` `Alt+=`. 범위 0.25~2.0(서버 계약과 같게).
- 저장 줄: 미등록 곡 [RE:DO에 추가](현재 A·B·배속 포함 `POST /songs`), 등록 곡 "RE:DO에 있음" + [저장].
- 단축키는 `event.code`로 판정한다(맥에서 `⌥`+키가 다른 글자를 입력하므로 `event.key` 사용 금지). 입력란·댓글 창에 초점이 있으면 무시한다.

### 6.2 루프 엔진

- `requestAnimationFrame`으로 `currentTime` 감시. `currentTime >= B`면 `currentTime = A`. 사용자가 B 뒤로 직접 이동하면 루프를 유지한 채 A로 되돌린다.
- 광고 중에는 멈춘다(P5). 영상이 바뀌면(`yt-navigate-finish`, videoId 변경) A·B·누적 시간을 초기화하고 `by-video`를 다시 조회한다. 응답이 늦게 와도 그 사이 영상이 바뀌었으면 버린다(요청 시점 videoId 대조).
- 등록 곡이면 저장된 `a`·`b`·`rate`를 패널에 채운다. 영상에 자동 적용은 하지 않고 [반복]을 켤 때 적용한다(유튜브를 그냥 보러 온 경우 방해하지 않기 위해).
- 초판의 되감기 전 대기(0.5초) 옵션은 넣지 않는다.

### 6.3 저장

- 미등록: `POST /api/v1/songs` `{ videoId, rate, a?, b? }`(A·B가 모두 있고 a<b일 때만 포함) → 201 뒤 등록 곡 상태로 전환.
- 등록: `POST /api/v1/practice/save` `{ songId, pos, a?, b?, rate, date: 로컬 날짜 YYYY-MM-DD, addSeconds, addLoops }`. `addSeconds`·`addLoops`는 마지막 저장 뒤 누적분(U5), 성공하면 보낸 만큼만 뺀다(웹 플레이어 방식 `PracticePage.tsx:387`). U5가 반려되면 둘 다 0.
- 주의: 이 API는 `a`·`b`를 보낸 값으로 덮어쓴다(`PracticeService.kt:127-128`). 구간을 지정하지 않은 채 저장하면 기존 구간이 지워지므로, A·B가 비어 있으면 조회해 둔 기존 값을 그대로 보낸다.
- 자동 저장은 하지 않는다(버튼만). 저장 안 한 누적분이 있을 때 탭을 닫으면 버려진다 — 패널에 "저장 안 됨" 표시.

---

## 7. 검증 표

| ID | Step | 시나리오 | 통과 기준 | 방법 |
|---|---|---|---|---|
| TC-EX-01 | 1 | 허용 목록에 없는 확장 출처의 POST | 403 / 목록에 넣으면 201 | 서버 테스트(V1) |
| TC-EX-02 | 1 | 로그인 → 토큰 보관 → 만료 임박 시 갱신 | 갱신 1회만, 실패 시 토큰 삭제 | 단위(가짜 fetch) |
| TC-EX-03 | 1 | videoId 추출(watch·youtu.be·shorts·잘못된 주소) | 올바른 id 또는 null | 단위 |
| TC-EX-04 | 1 | 우클릭 메뉴로 추가 | 201 알림, 웹앱 목록에 곡 표시 | 수동 |
| TC-EX-05 | 1 | 점 3개 메뉴 항목 표시·추가, 메뉴 재열기 | 항목 1개만, 누른 카드의 영상이 추가됨 | 수동 |
| TC-EX-06 | 1 | 홈 → 영상 → 홈 화면 전환 | 재생 화면 버튼이 전환에 맞춰 생기고 사라짐 | 수동 |
| TC-EX-07 | 1 | 비로그인·한도 초과·서버 꺼짐 | §5.3 표의 알림 | 단위 + 수동 |
| TC-EX-08 | 1 | 같은 영상 연타 | 요청 1회 | 단위 |
| TC-EX-09 | 2 | 단축키 `Alt` 조합(윈도우·맥) | 유튜브 단축키와 겹치지 않고 동작, 입력란에서는 무시 | 수동 |
| TC-EX-10 | 2 | A-B 반복 | B 도달 후 다음 프레임 안에 A로 이동, 100회 반복 유지 | 단위(판정 함수) + 수동 |
| TC-EX-11 | 2 | 배속 변경 | `playbackRate` 즉시 반영, 범위 밖 값 거부 | 수동 |
| TC-EX-12 | 2 | 광고 재생 중 | 루프·배속 미적용, 광고 뒤 재개 | 수동 |
| TC-EX-13 | 2 | 등록 곡 저장(A·B 미지정 포함) | 기존 구간 보존, 시간·횟수 누적분 1회만 반영 | 단위 + 수동 |
| TC-EX-14 | 2 | 영상 전환 중 늦은 조회 응답 | 이전 영상 값이 새 영상 패널에 들어가지 않음 | 단위 |

---

## 8. 하지 않는 것

- 서버 코드·API 계약·DB 변경(허용 출처는 환경 변수만).
- 썸네일 위 버튼, 재생목록 통째 가져오기, 쇼츠 연습, 광고 건너뛰기, 자동 저장.
- 크롬 웹 스토어 등록(U6), 파이어폭스·사파리.
- 모바일(모바일 공유는 MS-1).
