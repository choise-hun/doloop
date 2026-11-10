# EX-1 크롬 확장 프로그램 (YouTube 오버레이 연습 & ULevelP 등록) 구현 명세

- **목표:** 유튜브 영상(`youtube.com/watch*`) 위에 경량 오버레이 패널을 띄워 구간 반복(A-B)·배속 조절·단축키 연습을 직접 수행하고, [ULevelP에 추가] 버튼 클릭 시 ULevelP 백엔드(`POST /api/v1/songs`)에 원클릭으로 곡을 등록한다.
- **선행 조건:** 현재 진행 중인 설정 화면(ST 작업) 완료 및 main 머지 후 착수.
- **아키텍처:** Chrome Extension Manifest V3 (독립 패키지 디렉터리: `extension/`).
- **참조 근거:**
  - 백엔드 곡 등록 API: `src/main/kotlin/ulevelp/routes/SongRoutes.kt:46-75` (`POST /api/v1/songs`)
  - 백엔드 기존 곡 조회 API: `src/main/kotlin/ulevelp/routes/SongRoutes.kt:77-87` (`GET /api/v1/songs/by-video/{videoId}`)
  - 연습 플레이어 단축키/루프 엔진: `public/practice.js:30-180`
  - 복원된 기존 README 명세: `개발산출물/인수인계_메모.md` 및 세션 로그 `README.md` (단축키 Alt 조합)

---

## 1. Pre-flight 5대 관문

| 관문 | 점검 항목 | 결과 및 증거 (`file:line`) |
|---|---|---|
| ① 앱 격리·호환 | `app_id = 'ulevelp'`, `/api/v1` 규격 준수 | 확장에서 호출하는 API는 `/api/v1/songs`와 `/api/v1/songs/by-video/{videoId}`로 고정. 레거시(`/api/*`)를 호출하지 않음. 에러 응답은 `ApiError.kt:17-25` (`{ ok, source, status, code, message }`)를 파싱. |
| ② 동시성·트랜잭션 | 중복 클릭 방지, 네트워크 타임아웃 | "ULevelP에 추가" 버튼 연타 시 `isSubmitting` 플래그로 1회만 전송. `AbortController` 10초 타임아웃 가드. |
| ③ 전제 실재성 | 백엔드 엔드포인트 실재성 확인 | `SongRoutes.kt:50-70`: `videoId`(정규식), `title`(최대 300자), `artist`(최대 200자), `rate`(0.25~2.0), `a`(0.0~86400.0), `b`(0.0~86400.0, a < b) 입력 필드 실재 확인. |
| ④ 작업 줄 충돌 | 현재 ST 작업 및 기존 파일과 겹침 여부 | 본 확장은 완전히 격리된 `extension/` 디렉터리에 신규 작성되므로 기존 `frontend/src/` 및 `src/main/kotlin/`과 파일 충돌 없음. |
| ⑤ 메뉴얼 게이트 | API 계약·DB 스키마 변경 여부 | 기존 백엔드 API 계약(경로/필드/상태코드)을 100% 그대로 소비하며 백엔드 변경 없음. 신규 파일만 추가. |

---

## 2. 결정 사항 (Decision Matrix)

| ID | 항목 | 결정 내용 | 근거 |
|---|---|---|---|
| D-EX-01 | 확장 버전 규격 | Chrome Extension Manifest V3 | Chrome Web Store 필수 표준 및 V2 지원 중단 대응. |
| D-EX-02 | 유튜브 DOM 제어 | HTML5 `<video>` 직접 바인딩 | iframe 임베드 우회, 광고 건너뛰기/시간 동기화 완벽 보장. |
| D-EX-03 | 인증 연동 방식 | 쿠키 자동 감지 + 1회성 토큰 Fallback | ULevelP 웹에 로그인되어 있으면 `chrome.cookies`로 Supabase JWT 토큰 자동 추출, 실패 시 옵션 페이지에서 개인 토큰/API Key 수동 입력. |
| D-EX-04 | 중복 곡 처리 | `GET /by-video/{videoId}` 사전 조회 | 이미 등록된 곡이면 패널에 "저장됨 (구간 A-B 불러옴)" 표시 및 [수정/덮어쓰기] 모드로 전환. |
| D-EX-05 | 단축키 충돌 방지 | `Alt` (맥은 `⌥ Option`) 조합 고정 | 유튜브 자체 단축키(`J`, `K`, `L`, `Space`, `0~9`)와의 충돌 원천 방지. |

---

## 3. 디렉터리 및 파일 구성

```
extension/
├── manifest.json        # Manifest V3 메타데이터, 권한(activeTab, storage, cookies), 호스트 권한
├── background.js        # Service Worker: API 통신 중계(CORS 방지), 인증 토큰 관리, 쿠키 조회
├── content.js           # Content Script: YouTube DOM 감지, 비디오 제어, A/B 루프 타이머, 단축키 이벤트
├── overlay.css          # 유튜브 우측 상단 플로팅 패널 스타일 (다크/모던 룩, 드래그 지원)
├── options.html         # 설정 화면 (ULevelP 서비스 URL 설정, 수동 토큰 입력, 연결 테스트)
├── options.js           # 설정 저장 및 chrome.storage.sync 연동
└── icons/               # 16x16, 48x48, 128x128 아이콘 파일
```

---

## 4. Manifest V3 명세 (`extension/manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "ULevelP YouTube 연습 도우미",
  "version": "1.0.0",
  "description": "유튜브 영상 위에서 직접 A-B 구간 반복과 속도 조절을 연습하고 ULevelP 연습곡 리스트에 원클릭 저장합니다.",
  "permissions": [
    "storage",
    "cookies"
  ],
  "host_permissions": [
    "*://*.youtube.com/*",
    "https://ulevelp-d5ympfsmfq-du.a.run.app/*",
    "http://127.0.0.1:3000/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/watch*"],
      "js": ["content.js"],
      "css": ["overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": false
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## 5. 핵심 동작 및 제어 명세

### 5.1 오버레이 패널 UI 구성 (`content.js` + `overlay.css`)
- **표시 위치:** YouTube 비디오 플레이어 우측 상단 오버레이 (헤더 드래그로 위치 이동 가능, 접기 `▾` 버튼 지원).
- **구성 요소:**
  1. **헤더:** `ULevelP Practice` 로고, 접기/펼치기 버튼, 닫기 버튼.
  2. **구간 제어 (Loop):**
     * [A 지정] 버튼 (`Alt + [`): 현재 재생 위치를 시작점으로 기록.
     * [B 지정] 버튼 (`Alt + ]`): 현재 재생 위치를 종료점으로 기록.
     * A/B 시간 표시 (`mm:ss.s`), [초기화] 버튼.
     * [반복 켜기/끄기] 토글 버튼 (`Alt + L`).
     * [처음으로] 버튼 (`Alt + R`): A 지점으로 즉시 점프.
  3. **속도 제어 (Speed):**
     * 프리셋 버튼: `0.5x`, `0.75x`, `0.9x`, `1.0x` (`Alt + 1~4`).
     * 미세 조정: `-0.05` (`Alt + -`), `+0.05` (`Alt + =`).
  4. **저장/상태 바 (Sync):**
     * 미등록 곡: **[ULevelP에 추가]** 강조 버튼 (주황색/포인트 컬러).
     * 기등록 곡: **[ULevelP에 저장됨]** 배지 + **[구간 업데이트]** 버튼.
     * 상태 메시지: `저장 중...`, `저장 완료!`, `로그인 필요`.

### 5.2 A-B 루프 엔진 (`content.js`)
- `requestAnimationFrame` 또는 50ms 주기 `setInterval`로 `<video>.currentTime` 감시.
- `currentTime >= LoopB` 도달 시:
  - `<video>.currentTime = LoopA;` 로 되감기.
  - 여유 시간(Pre-roll delay) 0.5초 설정 옵션(기본값 0초).

### 5.3 API 통신 및 데이터 매핑 (`background.js`)

#### 1) 기존 등록 여부 확인
- **호출:** `GET /api/v1/songs/by-video/{videoId}`
- **응답 200 OK:**
  - `song != null`: 이미 저장된 곡이므로 저장된 `a`, `b`, `rate`를 가져와 오버레이 패널에 자동 적용.
  - `song == null`: 신규 곡 모드로 표시.

#### 2) ULevelP 곡 추가/업데이트 호출
- **호출:** `POST /api/v1/songs`
- **Request Body 전수:**
  ```json
  {
    "videoId": "11자리 YouTube Video ID (정규식 검증: ^[a-zA-Z0-9_-]{11}$)",
    "title": "유튜브 영상 제목 (document.title 또는 yt-formatted-string에서 추출, 최대 300자)",
    "artist": "채널명 (ytd-channel-name에서 추출, 최대 200자)",
    "rate": 1.00,
    "a": 12.5,
    "b": 35.8
  }
  ```
- **Response 처리:**
  - `201 Created` / `200 OK`: 패널에 3초간 "저장 완료!" 토스트 표시 후 [저장됨] 배지로 전환.
  - `401 Unauthorized`: "ULevelP 로그인이 필요합니다. 옵션 페이지를 확인하세요." 안내 팝업.
  - `400 Bad Request`: 서버 반환 `message` 표시.

---

## 6. 테스트 및 검증 표 (Test Matrix)

| ID | 검증 시나리오 | 잡아야 할 버그 | 통과 기준 |
|---|---|---|---|
| TC-EX-01 | 유튜브 페이지 진입 시 비디오 감지 | SPA 페이지 이동(`yt-navigate-finish`) 시 패널 미생성 | 새 영상 로드 시 자동으로 videoId를 읽고 패널이 렌더링됨. |
| TC-EX-02 | 단축키 제어 (`Alt` 조합) | 유튜브 자체 단축키와 경합 발생 | `Alt + [`, `Alt + ]`, `Alt + L`, `Alt + R`, `Alt + 1~4` 정상 동작. |
| TC-EX-03 | A/B 루프 무한 반복 정밀도 | B 지점을 지나쳐 루프가 풀리는 현상 | B 지점 도달 시 50ms 오차 이내로 A 지점으로 즉시 점프 반복. |
| TC-EX-04 | 배속 변경 실시간 반영 | 비디오 playbackRate 미반영 | 배속 버튼 클릭 시 `<video>.playbackRate`가 즉시 0.5~1.5로 반영됨. |
| TC-EX-05 | `POST /api/v1/songs` 전송 | videoId 정규식 불일치 또는 title 공백 실패 | 추출된 데이터가 유효성 검증을 통과하고 201 Created로 ULevelP DB에 등록됨. |
| TC-EX-06 | 비로그인 상태 저장 시도 | 에러가 삼켜지거나 무반응 | 401 수신 시 옵션 안내 문구가 패널에 정확히 출력됨. |
