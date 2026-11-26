# TB-2 프론트 명세 및 계약

2026-11-26 · TB-2-2 승인본 · 기준 main `29a3bb4` ([PR #70](https://github.com/choise-hun/doloop/pull/70))  
[HTML 시안 및 선택지](TB-2_시안.html) · [TB-1 서버 계약](TB-1_구현명세.md) · [TB-0 결과](../결과/TB-0_스파이크.md)

## 1. 범위와 결정

- PLAYER에서 개인 악보를 등록하고 같은 곡 목록·분류·정렬에 표시한다. 악보 표시·탐색·반복·배속·카운트인·트랙 제어와 기존 프리셋·연습 기록·마이크 녹음을 연결한다. HOME 최근 곡·곡 목록, 기록의 곡·세션에서도 다시 연다.
- TB-0 R2의 인스턴스 재사용과 Canvas 정책, TB-1의 API·DB·한도·공개 제외 계약을 적용한다. GP3/4/5/GPX 추가, 악보 편집·공개, 점진 가속은 범위 밖이다.
- 구현 담당 추천은 시니어다. 미디어 전환, 사용자 전환, 녹음/세션 확정, Worker/오디오 수명이 서로 맞물린다. 구현 담당과 Git 처리는 구현 착수 시 승인 범위를 따른다.

| 결정 | A안 (추천) | B안 | 판단 기준 |
| --- | --- | --- | --- |
| D1 등록 진입 | 기존 YouTube URL 줄 옆에 **악보 올리기**. 600px 이하에서는 다음 줄 같은 왼쪽 축. 기존 보관함에서도 동일 대화상자를 열 수 있다 | 보관함 안에만 **악보 올리기** 배치 | 첫 방문에서 등록을 발견하기 쉬운 쪽과 PLAYER 상단을 단순하게 유지하는 쪽의 선택 |
| D2 트랙 믹서 | 961px 이상에서 악보 옆 240px 패널, 960px 이하에서 악보 아래 접기 | 모든 폭에서 악보 아래 접기 | 961px 이상에서 악보 가로 240px를 사용해 트랙을 계속 볼지, 악보 폭을 우선할지 선택 |
| D3 전환 중 메모리 기준선 | **열린 A 기준선**으로 `R1…R10` 비교. 이탈 후 `R_end`와 피크는 TB-0대로 무부하 `B0` 기준 | `R1…R10`도 무부하 `B0` 기준 | 재사용 엔진의 상시 비용은 피크로 제한하고 전환 누적 비용과 이탈 후 잔류를 따로 검출. B안은 열린 정상 점유까지 잔류 한도에 포함 |

- 사용자가 2026-11-26 **D1-A + D2-A + D3-A**와 TB-2-2 구현을 승인했다. 구현·담당 검수 범위에서 진행한다. Git 게시는 별도 사용자 지시가 필요하다.
- 크기 제안. 가로는 PLAYER 기존 바깥 폭과 안쪽 좌우 축을 재사용한다. TAB의 악보/믹서는 기존 2열의 전체 폭을 사용하고, 아래 공통 조작과 구간/곡 목록은 기존 열을 사용한다. D2-A는 악보 전체 폭에서 믹서 240px와 간격 12px를 나눈다. 세로는 악보 스크롤 창 `clamp(280px, 50dvh, 520px)`, 새 버튼 터치 영역 44px 이상. 대화상자 최대 가로 480px. 글자는 제목 18px, 일반 입력·조작 14~16px, 계기판 12px. 악보 음표·타브 글자는 alphaTab 렌더 기본 크기를 사용한다.
- 새 화면 약속. 등록 줄 `data-align-group="tab-add:top,bottom,height@601"`, 악보/믹서 `tab-stage:top@961`(D2-A), 공통 트랜스포트 기존 정렬 축. 좁은 폭은 한 열로 쌓고 스크롤은 악보 창 안에서만 일어난다. 배치 기준은 `PracticePage.tsx:2265,2390-2447,2602-2670`, `PracticePage.module.css:94-183,681-745`, `tokens.css:54-77`과 정렬 규격 §3·§5.

## 2. 목록, 식별자와 링크

| 요청 | TB 지원 호출 | 적용 지점 |
| --- | --- | --- |
| `GET /api/v1/songs` | `?include=tab`, 상태 필터가 있으면 `?status=…&include=tab` | PLAYER 첫 진입·새로고침/재조회, HOME 최근 곡·목록, 기록 곡 탭 |
| `PUT /api/v1/songs/order` | `?include=tab`, 기존 `{ids}` | PLAYER 정렬 응답으로 혼합 목록을 교체할 때 |
| `PATCH /api/v1/songs/titles` | `?include=tab`, 기존 `{items}` | PLAYER 제목 일괄 편집 응답으로 혼합 목록을 교체할 때 |
| `GET /api/v1/sessions` | 기존 `today`/`from`/`to`와 `include=tab` 병합 | 기록 일자/기간 목록. 주간·월간·달력 집계는 TB-1 응답을 그대로 사용 |
| `GET /api/v1/songs/{songId}` | 기존 상세 응답 | `?song=` 최초 진입, 곡 기록/프리셋 |

- API 클라이언트의 목록 옵션은 명시적 opt-in으로 둔다. `URLSearchParams`로 조립해 동일 이름 중복을 피한다. 기존 설치 앱·확장·YouTube 전용 호출은 생략한다. 서버는 생략 시 YouTube만, 정확히 `tab`이면 혼합, 다른 값은 400이다. 근거 `apiClient.ts:696-735,809-830,1008-1016`, `SongRoutes.kt:433`, TB-1 §7–8.
- 응답의 `SongDto` 및 날짜별 `SessionWithSongDto`는 `mediaType`으로 분기한다. YouTube는 유효한 `videoId` 필수, TAB은 `videoId:null`, 곡 DTO에는 `tabFileName`, `tabFormat`, `tabFileSize`가 있다. 구형 응답의 `mediaType` 생략은 유효한 YouTube ID가 있는 경우만 호환한다. 모르는 타입과 잘못된 응답은 응답 오류로 처리한다. YouTube 전용 DTO와 캐시 경로에 nullable 값을 흘리지 않는다.
- 저장 곡의 현재 표시·행 키·수정·삭제·분류·기록은 `song.id` 기준이다. 아직 등록하지 않은 YouTube만 기존 `videoId` 경로를 쓴다. 제목·파일명을 일반 텍스트로 출력한다. TAB 표시는 텍스트 배지/아이콘을 사용하고 YouTube 썸네일이나 iframe을 만들지 않는다. 순서와 필터는 기존 동작을 따른다. 업로드 후 현재 폴더에서 곡이 보이지 않으면 해당 목록과 선택은 유지하고 기존 폴더 외 곡 안내를 표시한다.
- `practice.html?song=<UUID>`가 있으면 상세를 조회해 유형을 선택한다. `song`과 `v`가 함께 있으면 `song`이 우선이며 UUID 오류·404도 그 곡의 오류로 표시한다. `t,a,b,r`는 기존 초/배속 의미를 유지한다. TAB 선택은 `song`, YouTube 선택은 기존 `v`를 사용하고 곡 교체 때 이전 곡의 쿼리·복원 상태를 섞지 않는다. 새로고침·뒤로/앞으로·네이티브 진입을 같은 유형 판별로 처리한다. 로그인 전 TAB 딥링크는 로그인 안내와 해당 위치를 유지한다.
- HOME 최근 캐시는 사용자 소유 키와 기존 YouTube 항목 읽기 호환을 유지하며 TAB은 `songId + mediaType`을 보관한다. 기록은 날짜별 DTO의 `songId/mediaType`, 곡 상세의 부모 곡을 세션 카드에 전달해 기존 링크 대신 `?song=`과 해당 구간·배속을 사용한다. 개인 TAB 세션은 공유 버튼/대화상자 진입 대상에서 제외한다. 근거 `PracticePage.tsx:688-770,1609-1625,1977-2142`, `HomePage.tsx:393-410,490-507,650-695`, `LogPage.tsx:83,271-313,385-387`, `episode.mts:210-257`, `PracticeSessionCard.tsx:113,334`.

## 3. 등록과 파일 읽기

### 3.1 업로드

- 로그인한 사용자만 파일 선택을 연다. 게스트는 로그인 안내를 표시한다. 단일 파일 선택 `accept=".gp,.xml,.mxl"`, 제목·아티스트 선택 입력. 비어 있거나 10,485,760 bytes 초과, 지원하지 않는 확장자(대소문자 무관)는 제출 전 안내한다. 제목 300자, 아티스트 200자. 내용·한도 검사는 서버 응답을 따른다.
- `POST /api/v1/songs/tab`에 `FormData`의 `file`과 입력된 `title`, `artist`를 전달한다. 브라우저에 multipart boundary 생성을 맡긴다. 201 `{song}`의 id로 혼합 목록에 한 번만 반영하고 응답 곡을 연다. URL을 바꾸기 전에 기존 곡의 녹음/저장 전환 조건을 적용한다.
- 상태는 파일 미선택 → 제출 가능 → 업로드 중 → 성공/오류다. 이전 제출이 완료될 때까지 중복 제출 방지. 오류면 입력을 유지한다. 업로드 도중 화면/계정 이탈 시 요청과 결과 처리를 무효화한다. 서버가 201을 확정했는지 불분명한 전송 실패는 목록을 먼저 다시 읽고, 자동 재업로드하지 않는다.

| 응답 | 화면 행동 |
| --- | --- |
| 400 `INVALID_INPUT`, `TAB_FORMAT_INVALID(extension/content)` | 해당 입력에 안내. 빈 파일, 확장자, 읽을 수 없는 파일 내용의 문구 구분 |
| 413 `TAB_TOO_LARGE` / `TAB_QUOTA_EXCEEDED` | 각각 파일 10MB 상한 / 계정 저장량 한도 표시 |
| 403 `TAB_LIMIT_EXCEEDED` / `SONG_LIMIT_EXCEEDED` | 각각 악보 곡 수 / 전체 곡 수 한도, 서버 detail에 있는 값과 기존 플랜 안내 사용 |
| 401 / 502 `STORAGE_ERROR` / 503 `STORAGE_UNAVAILABLE` / 네트워크 오류 | 각각 인증 복구 / 등록 오류와 사용자 재시도. 전송 결과가 불명확하면 위 목록 재조회 규칙 적용 |

### 3.2 파일 읽기와 기기 내 캐시

- `GET /api/v1/songs/{id}/tab-file` 인증 호출. 200 `{url, expiresIn:300, fileName, format, sizeBytes}` (`no-store`). `url`은 파싱 후 HTTPS와 현재 CSP/환경의 정확한 저장소 origin을 확인한다. 별도 CORS fetch에 API Authorization·쿠키를 전달하지 않는다(`credentials:'omit'`, `redirect:'error'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'`). 최대 10MiB, 응답 바이트 수가 메타데이터와 일치해야 한다. `ArrayBuffer`로 넘긴다.
- API 404는 “악보를 찾을 수 없습니다”, 401은 인증 안내, 502/503·네트워크는 다시 시도, 파싱 실패는 “악보 파일을 읽을 수 없습니다”. 저장소 바이트 요청이 401/403이면 같은 곡의 서명 주소를 한 번 새로 발급받아 재요청한다. 두 번째 실패는 오류로 표시한다. 재시도는 현재 선택에서만 유효하다.
- 기기 로컬 캐시는 웹·Capacitor 공통 **IndexedDB**를 사용한다(기능확장 §4.1, TB-1 §6). `uid:songId`별 검증된 원본 바이트·형식·크기·마지막 사용 시각만 보관하고, 사용자당 최신 두 곡·20MiB 이내로 제한한다. 입력 버퍼는 현재 로드에 필요한 범위만 메모리에 둔다. 캐시 적중 시에도 새 서명 API로 소유권과 메타데이터를 확인한다. 404·파일 메타데이터 불일치·곡 삭제 시 항목 폐기. 계정 전환·로그아웃 시 이전 uid를 즉시 읽기 금지하고 해당 항목을 삭제한다. 시작 시 현재 uid 외의 남은 기록도 제거한다. 진행 중 캐시 작업은 취소하거나 직렬화하여 계정 정리 이후 늦은 쓰기가 되살아나지 않게 한다. IndexedDB 사용 불가·쓰기 실패 시 인증 다운로드로 재생을 계속하고, 인증 실패/오프라인에서는 캐시 재생을 열지 않는다. 서명 URL은 저장소·화면·로그에 남기지 않는다.

## 4. 플레이어와 경합 계약

- `playerEngine.ts`의 `PracticePlayerEngine`은 `play/pause/seekTo/getCurrentTime/getDuration/setPlaybackRate/setLoopRange/destroy`와 준비·재생 상태·위치·종료·오류 이벤트를 제공한다. UI 시간은 속도와 무관한 원곡 초, 엔진 경계에서 ms/tick을 환산한다. `youtubeEngine.ts`는 웹/Android IFrame API, iOS 기존 `ytBridge`를 래핑해 ready/cue·seek·속도 목록·종료·링크 규칙을 보존한다. `tabEngine.ts`는 alphaTab 호출과 트랙·악보 좌표를 관리하고 `TabPlayerView`는 고정 호스트와 조작 UI를 맡는다.
- PLAYER에 처음 TAB을 열 때 `AlphaTabApi` 하나를 지연 생성한다. 고정 호스트/스크롤 요소와 SoundFont·Worker·Worklet을 화면 수명으로 유지한다. TAB→TAB은 현재 곡을 정지하고 `api.load(ArrayBuffer)`로 교체한다. TAB→YouTube는 TAB 엔진을 정지·숨김 상태로 두고 이벤트·탐색·재생을 차단한다. 다시 TAB으로 오면 동일 인스턴스를 쓴다. 두 엔진은 동시에 소리를 내지 않는다. 초기 로드·전환은 일시정지 상태로 완료하고 사용자 제스처로 재생한다.
- 전환 시작 시 `uid + songId + generation`과 화면 수명 `opSeq`를 캡처한다. 최신 선택만 UI·캐시·URL·세션·녹음을 갱신한다. 바이트 I/O는 `AbortController`로 취소한다. alphaTab 내부 이벤트는 여러 로드에서 공유되므로 `api.load`는 동시에 한 건만 진행한다. 진행 중 요청이 밀리면 최신 선택 하나를 대기시키고, 이전 로드의 score→MIDI/렌더 완료 또는 식별 가능한 종단 오류까지 기존 슬롯의 이벤트를 소비한 후 시작한다. 구독 콜백의 최신 순번만 바꿔 과거 이벤트를 새 로드 성공으로 처리하지 않는다. `api.load` true는 시작, false는 즉시 오류다. 준비 상태는 해당 score·렌더·MIDI와 재생 가능 상태를 확인한 뒤 열린다. 트랙 재렌더도 직렬화하며 `scoreLoaded` 이벤트 하나로 곡 교체를 확정하지 않는다. [alphaTab load](https://alphatab.net/docs/reference/api/load/) · [alphaTab scoreLoaded](https://alphatab.net/docs/reference/api/scoreloaded/)
- 준비 30초 초과처럼 이전 로드의 종단을 확인할 수 없으면 해당 엔진을 격리하고 “플레이어를 다시 열어 주세요”를 표시한다. 격리 상태에서는 새 로드를 시작하지 않는다. 명확히 종단된 로드 실패·파일 요청 실패는 동일 화면에서 다시 시도한다. 화면 이탈 또는 계정 경계에서 기존 수명을 끝낸 뒤 새 수명 생성이 가능하다.
- 정리 시 순번을 먼저 무효화하고 타이머/구독을 해제 → `destroy()` 1회 → 호스트 제거 → 잔여 요청 취소 및 참조 비우기. 신규 open은 이전 close의 계측 가능한 종료를 기다리고 현재 순번을 다시 확인한다. 라이브러리 소유 컨텍스트는 alphaTab의 close 완료와 `closed` 상태를 관찰한다. 녹음용 컨텍스트의 종료 책임은 기존 녹음 경로에 있다. 근거 [TB-0 §3](../결과/TB-0_스파이크.md#3-tb-1--tb-2로-넘길-제약), 재현물 `page/app.mjs:83-140`, `PracticePage.tsx:590-685,1177-1250,1650-1736`.

## 5. 조작과 저장

| 조작 | 계약 |
| --- | --- |
| 악보 | 기본 타브(지원하지 않는 트랙은 표시 가능한 오선지), 선택으로 타브/오선지 전환. 커서 자동 스크롤은 악보 호스트에만 적용. 클릭/탭은 해당 비트 위치로 탐색. 키보드는 기존 트랜스포트·타임라인·A/B 버튼으로 같은 동작 가능 |
| A-B | 드래그는 시작 마디 시작→끝 마디 종료, 역방향은 정렬, 같은 마디는 한 마디. 재생 타임라인의 실제 tick/템포(반복 마디는 현재 재생 위치 또는 그 다음 등장, 없으면 첫 등장)로 환산해 초를 저장. 드래그·A/B 버튼·프리셋은 하나의 모델. `0 ≤ A < B ≤ duration`, 유효하지 않은 범위는 반복 비활성. 실제 반복 주체는 엔진별 하나로 제한하고 반복 횟수/세션 기록의 중복을 방지 |
| 속도·카운트인 | TAB 25%·50%·75%·100%, 복원값이 유효하지 않으면 100%. 기존 대기 초/카운트다운을 공통 로직으로 쓰며 alphaTab 카운트인을 중복 실행하지 않는다. 일시정지·전환·이탈 시 대기 취소 |
| 트랙·메트로놈 | 첫 표시 가능한 트랙을 선택하고, 타 트랙 선택은 악보만 바꾼다. 트랙별 솔로·뮤트·볼륨(0–100%), 곡별 상태 초기화. 솔로가 하나 이상이면 해당 트랙만 출력하고 명시적 뮤트가 우선한다. 메트로놈 기본 꺼짐이며 곡 전환 시 꺼진다. 변경 결과를 레이블/pressed 상태로 확인 가능 |
| 프리셋·세션·녹음 | 저장된 TAB 곡의 `songId`로 기존 프리셋, 연습 기록, 마이크 녹음 API를 호출한다. 녹음 시작/확정 때 uid와 곡 id를 묶어 곡 전환·삭제·계정 변경 후 다른 곡에 연결되지 않게 한다. 전환 전 기존 정지/보관 확인 흐름을 재사용하고, 자동 저장이 같은 세션에 중복 반영되지 않게 한다. YouTube를 소스로 요구하는 동작은 YouTube 분기 안에 둔다 |

## 6. 자산과 CSP

- `@coderline/alphatab` 1.9.0 고정. 같은 출처 `/at/` 정적 파일로 core/worker/worklet과 Bravura 폰트 제공. `fontDirectory: '/at/font/'`, `core.engine: 'html5'`, `enableLazyLoading:true`, Worker 및 AudioWorklet 사용. Vite 5 빌드에서 패키지 버전 고정 복사/정적 배치 경로를 사용한다. 웹·Capacitor 번들에서 동일한 절대 경로, worker/worklet MIME, Bravura·SF2 로드 확인. MPL-2.0 전문과 태그 소스 위치, Bravura OFL·TinySoundFont/SFZero MIT를 동봉하고 크레딧을 유지한다. 실측용 SF2는 로컬에서만 사용하고 공개 번들은 R3 출처 확인 또는 승인된 대체 자산을 사용한다.
- 배치 제안은 Vite 개발과 출력에 같은 `/at/` 자산을 공급하고 Docker에서 `dist/at`을 `public/at`으로 복사하는 방식이다. 앱은 기존 `dist` 복사에 포함한다. `vite.config.ts:6-10`은 `publicDir:false`, `Dockerfile:34-36`은 `dist/assets`와 SPA HTML만 복사한다. `Main.kt:347,436-446`은 `nosniff`를 설정하고 `.mjs`를 현재 octet-stream으로 반환한다. 구현 범위에 `.mjs` JavaScript MIME과 고정된 폰트 확장자 MIME 추가를 포함한다. 정적 경로 가드와 `nosniff`를 유지한다.
- `frontend/index.html:5`의 SPA 정책 diff. `test/security.test.js:15-28,324-330`은 SPA용 정확한 원문을 따로 단언하고 `public/player-embed.html:5`의 기존 정책도 단언한다. 앱용 SPA 정책은 `scripts/build-app-web.mjs:33-71`의 앱 원점 보정과 함께 확인한다. 기존 `media-src blob:` 허용은 녹음용으로 유지하며 TAB의 worker/script/style에는 추가하지 않는다. 저장소 origin은 기존 `connect-src` 허용 항목을 사용한다.

```diff
- style-src 'self' https://fonts.googleapis.com 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig='
+ style-src 'self' https://fonts.googleapis.com 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig=' 'sha256-EIR5s3Qp1PxPxW4Koopu9nVN+I2chNMT0ImH3VG/s+c=' 'sha256-ago6aunBhfAMrD80tguQXUt95n6srkO3pzX2dUHs0gs='
- font-src https://fonts.gstatic.com
+ font-src 'self' https://fonts.gstatic.com
- worker-src 'none'
+ worker-src 'self'
```

- 두 해시는 TB-0의 `/at/font/` 경로 원문 기준이다. 제품 번들에서 실제 주입 CSS 원문을 채집·재해시해 일치 확인한다. `unsafe-inline`, `unsafe-eval`, `wasm-unsafe-eval`, `style-src-attr` 예외를 추가하지 않는다.

## 7. 구현 후 검수

| ID | 합격 조건 |
| --- | --- |
| TB2-L | 390/768/960/961/1150/1280px, 등록 대화상자·YouTube·TAB·로딩/오류·혼합 목록을 검사. 승인 시안과 같은 배치 축, overflow 없음, 포커스 진입/복귀, 좁은 폭 터치/키보드 동작. 제품 구현 단계에서 정렬 spec 실패를 먼저 확인한 뒤 통과와 스크린샷을 기록 |
| TB2-A | GET/PUT/PATCH/세션 요청의 `include=tab`/기존 쿼리 보존, 혼합 목록 정렬·제목 갱신·삭제·분류, 구형 요청은 기존 규약, `?v=`·`?song=` 재진입/뒤로·게스트·타 계정 404. HOME/기록 링크와 YouTube 썸네일 분기 확인 |
| TB2-U | 세 포맷 201 → 목록/선택 한 번, 잘못된 확장자·내용·한도·업로드 오류, 연속 제출/전환 후 늦은 201, 서명 만료 재발급 1회·서명 오류·잘린 바이트, A 계정 캐시를 B 계정에서 재사용하지 않음 |
| TB2-P | Canvas 글리프와 커서, 5초 유음 재생, 긴 곡 끝으로 스크롤·탐색, 트랙 상태·RMS, 템포 변경/반복/마지막 마디 A-B와 역방향 드래그·프리셋 복원, 대기 취소, 녹음 및 세션이 정확한 곡에 붙음. YouTube의 기존 cue/구간/속도/녹음, iOS 원격 iframe 경로 보존 |
| TB2-R | 지연된 A→B→C, 로드 도중 TAB→YouTube, 화면 close→재진입, 로그아웃·A→B 계정 전환. 이전 응답·렌더·오디오·녹음이 새 UI/계정에 나타나지 않음. 직렬화/세대 가드를 제거하면 해당 단언 실패 |
| TB2-C | `node --test test/security.test.js test/app_web_bundle.test.js`와 제품 CSP 브라우저 검증. 웹과 앱 번들 CSP 조립 결과, Bravura 글리프·Worker·Worklet·SF2·저장소 읽기, 정상 흐름 위반 0. 외부 Worker/폰트, Blob Worker, inline 평가·스타일은 차단 |
| TB2-M | 아래 10회 전환을 독립적으로 두 번 완주하고 두 번 모두 합격 |

### TB2-M 데스크톱 10회 전환

1. 격리된 데스크톱 Edge/Chrome 안정판에서 제품 웹 경로와 승인된 테스트 악보 A/B를 사용한다. 순서·파일 크기·환경·브라우저·빌드 SHA·캐시 상태·측정 지표를 기록한다. 자동은 TB-0 [실행 명령 §5](../결과/TB-0_스파이크.md#5-실행-명령)와 `tools/mem-run.mjs`를 계측 참고로 쓴다. 합격 데이터는 제품 경로에서 채집한다.
2. 실행마다 새 탭에서 A 사용자 탭→5초 유음 재생→PLAYER 이탈로 워밍업한다. 정리 카운터 0 확인 후 30초 뒤부터 5초 간격 세 점의 중앙값을 `B0`으로 기록한다(같은 렌더러 footprint 지표, 1 MB = 1,000,000 bytes).
3. PLAYER에 새로 진입해 A를 열고 **A→B→A→B→A→B→A→B→A→B→A**. 모든 곡에서 30초 이내 준비, 5초 유음 재생 후 같은 스크롤·일시정지. 로드/재생 피크 `P0…P10`과, 첫 A 및 각 전환 곡에서 일시정지 30초 후부터 5초 간격 세 점의 중앙값 `R0…R10`을 기록한다. 이 시점에는 공용 엔진과 현재 곡이 남아 있다. 전환 중 강제 GC·임의 정리 없이 정상 경로를 쓴다. 마지막 A에서 화면 이탈하고 같은 방식으로 `R_end`를 기록한다.
4. 매 실행에서 `max(P0…P10) − B0 ≤ 150 MB`, `R_end − B0 ≤ max(10 MB, B0 × 10%)`, `median(R8…R10) − median(R1…R3) ≤ 5 MB`. D3-A에서는 `R1…R10` 각각에 `R_i − R0 ≤ max(10 MB, B0 × 10%)`를 적용한다. D3-B에서는 `R0` 대신 `B0`를 뺀다. 두 기준으로 원시값 및 판정 모두를 남긴다. TB-0의 새 인스턴스 방식은 매번 닫은 뒤 측정했다. 재사용 진단은 열린 채 125–145MB, 닫은 뒤 95.6MB였으므로 제품에서도 종료 잔류를 별도로 확인해야 한다.
5. 워밍업 제외, 측정 화면에서 API 생성 1회, 전환 중 destroy 0회, 이탈 시 destroy 1회. 전환 완료마다 **이전 곡 전용** Score/렌더 DOM·구독·타이머·요청·오디오의 잔존은 0. 공유 Worker/Worklet/AudioContext 수는 최초 준비 상태와 같고 추가 생성이 없다. 화면 이탈 뒤 Worker/Worklet·열린 AudioContext·플레이어 DOM·구독·타이머·대기 요청·자체 Object URL 잔존은 모두 0. 원본 바이트 캐시는 §3 상한으로 제한한다. 이전 곡 소리, 재생 끊김, 재시작, 타임아웃이 한 건이라도 있으면 실패다.
6. 원시 타임라인/피크·잔류·드리프트·카운터·CSP/오디오·환경을 `결과/TB-2.md`에 남긴다. TB-0 §2.6 재사용 진단은 설계 근거다. iPad WKWebView/저사양 실기기(R1), SF2 채택(R3), 추가 포맷(R4)은 출시 전 별도 증거가 필요하다.

## 8. 구현 파일과 순서 제안

1. API 어댑터·링크·DTO 분기 및 혼합 목록 (`frontend/src/lib/apiClient.ts`, HOME/PLAYER/기록, `recentSongCache.mts`, `episode.mts`, 기록 컴포넌트). 신규 DB/서버 API는 없다.
2. `playerEngine.ts`, `youtubeEngine.ts`, `tabEngine.ts`, `components/practice/TabPlayerView.tsx`와 CSS, 등록 대화상자, 한국어/영어/일본어 i18n. `PracticePage`의 전환·루프·녹음 분기를 연결한다.
3. alphaTab 패키지/lock·자산 복사(Vite/Docker)·정적 MIME(`Main.kt`), SPA CSP와 관련 보안/웹 번들 단언, PLAYER 레이아웃 및 TB2 수용 spec을 연결한다. TB2-M 결과와 운영 전 관문을 기록한다.

TB-2-1에서 제시한 시안과 계약에 D1–D3 결정을 반영했다. TB-2-2의 실행과 검수 상태는 [진행 기록](../진행_TB_악보플레이어.md)을 따른다.
