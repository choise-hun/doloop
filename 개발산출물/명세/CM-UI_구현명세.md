# CM-UI 상세 구현 명세 — 독립 커뮤니티와 세션 공유

> 2026-11-09 / Codex / 조사 기준 `main`=`002516ed264a8a8066fe57700dac09e691dadae7`.
> 입력: [계획 §1 CM-UI](../../계획/상용_서비스_계획.md), [요구사항 REQ-3 / AC-4~AC-7](../요구사항_명세_초안.md), [CM-BE 인계 §9](../완료/진행_CM-BE.md), [서버 계약](CM-BE_구현명세.md).
> **명세 작성·자체 검토 완료, 사용자 검토·구현 승인 대기.** 이번 작업은 문서만 작성한다. 실행·재개는 [진행 파일](../진행_CM-UI.md)을 따른다.

## 1. 범위와 변경 계약

- `/community.html` 독립 화면, 앱 상단/하단 COMMUNITY 진입, 홈 BETTER/VAULT 아래 WHAT YOU DO? 배너, TRAILS의 커뮤니티 분리, 모두/LOG 새 게시물 피드, 개인 공용 세션 카드, 공유/철회/재게시/신고 동선을 정의한다.
- 새 화면 경로, `ActiveNavKey`의 `community` 값, §8의 프런트 API 래퍼·타입·컴포넌트 export를 추가할 예정이다. 독립 화면과 공용 카드에 필요한 변경이며 **구현 승인 후** 반영한다. 서버 API 경로·필드·상태 코드, DB, 기존 함수의 공개 계약을 바꾸지 않는다.
- PF의 profile.html·계정 진입 이동·내 게시물 전용 관리 화면, ST 설정 개편, 결제·운영 배포는 제외한다. 현재 설정의 공개 이름 편집과 폴더 공유 관리는 계속 사용할 수 있어야 한다.
- 기존 `/community/logs`의 84일 사용자 집계와 `share_practice_log`는 유지한다. 새 LOG 피드는 개별 세션 게시물이며 기존 집계 DTO를 바꿔 사용하지 않는다. 게시물 댓글·좋아요·복제 API는 추가하지 않는다.
- 운영자 신고 조회·숨김/복구·신고 종결 API는 CM-BE 완료 범위다. 이번 화면 범위는 일반 사용자 신고와 작성자 숨김 사유 표시까지다. 운영자 관리 화면은 계획 §4의 운영 화면 후속 범위로 남으며, API 존재를 화면 연결/운영 인수 완료로 보고하지 않는다.

## 2. 실제 코드 근거

경로는 저장소 루트 기준이며 아래 행은 조사 기준 커밋의 위치다.

| file:line / 심볼 | 관찰 → 명세 반영 |
| --- | --- |
| `frontend/src/App.tsx:33` / Routes, `src/main/kotlin/ulevelp/Main.kt:126` / SPA_ENTRY_PAGES, `server.js:15` / SPA_PAGES | community 진입 없음 → 세 진입 목록에 같은 경로 등록, 직접 열기/새로고침 검증 |
| `frontend/src/components/layout/AppShell.tsx:9`, `:12`, `:138`; `AppShell.module.css:169` | 상·하단이 MAIN_NAV 공유, 하단은 5칸 → COMMUNITY 추가와 6칸 배치/본문 여백을 함께 검증 |
| `frontend/src/pages/HomePage.tsx:669` | BETTER/VAULT 이후 새 홍보 배너 삽입. 기존 큐레이션은 유지 |
| `frontend/src/pages/LogPage.tsx:61` / SessionCardItem, `:252` / LogPage | 날짜별 카드는 메모/테이크, 페이지는 community 탭 포함 → 카드 위임 및 community 탭/패널 제거 |
| `frontend/src/components/community/CommunityPane.tsx:22`, `:148` | 모두=큐레이션+내 폴더, LOG=집계 → 새 피드 연결, 기존 표면은 별도 진입으로 보존 |
| `frontend/src/components/community/CurationRows.tsx:39`, `:132` | 큐레이션·최근 폴더는 별도 요청 → 피드와 독립적인 로딩/실패/재시도 |
| `frontend/src/components/songRecord/SongRecordPanel.tsx:83`, `:217`; `SongRecordParts.tsx:398`, `:475` | 플레이어 타임라인은 별도 렌더, 반복 수 0 고정 → 동일 카드로 위임하고 실제 loops 사용. 로딩/빈 상태 구분 유지 |
| `frontend/src/lib/apiClient.ts:62`, `:79`, `:112`, `:1615` | TakeDto.sessionId 존재, 개인 세션 두 DTO와 집계 래퍼 존재 → 세션 ID로 테이크 연결, 새 게시물 타입/래퍼 분리 |
| `src/main/kotlin/ulevelp/service/SongService.kt:85`, `:219`; `SessionService.kt:35`, `:118` | 곡 상세는 sessions/takes 분리, 날짜 목록은 takes 중첩 → 어댑터로 개인 카드 모델 통일 |
| `src/main/kotlin/ulevelp/service/EpisodeContract.kt:19`, `:23`, `:29`; `routes/EpisodeRoutes.kt:13`, `:37` | 공개/내 게시물 DTO, 인증 경계·HTTP 계약 → §5 그대로 연결 |
| `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:104`, `:117`, `:143`, `:153`, `:176`, `:204` | 내 목록 20개 페이지, 명시 POST만 snapshot 교체, 철회는 내용 제거/행 보존 → §4·§6 상태 모델 |
| `frontend/src/lib/community.mts:86` / itemPracticeHref; `security.ts:103`, `:110`; `pages/PracticePage.tsx:1258`, `:319` | 안전한 영상 ID·썸네일·v/a/b/r/t 및 기존 곡 생성 → 재생/담기 동선 재사용 |
| `frontend/src/lib/auth.ts:43` / limits; `src/main/kotlin/ulevelp/api/ApiError.kt:18`; `service/BannedWords.kt:37` | 쓰기는 limits.communityWrite, 오류는 표준 봉투/field → §5.3 권한·오류 분기 |

## 3. 진입·탐색·화면 구성

### 3.1 라우트와 보존 경로

1. React Router/Ktor/Node 모두 `/community.html`을 같은 SPA로 제공한다. `AppShell activeNav="community"`, 내비게이션의 COMMUNITY와 홈 `#homeCommunityBanner`의 href는 `community.html`이다. 로그인한 `#navAuth`와 SETTING의 현재 경로는 PF까지 유지한다.
2. 상단/하단 순서는 LEARN → PLAY → TRAILS → COMMUNITY → CHORDS → NOTES. 데스크톱은 자연 줄바꿈을 허용한다. 820px 이하 하단은 **6열 한 줄**, 기존 56px 최소 높이와 safe-area 여백 유지, 라벨이 긴 언어는 글자 축소 대신 셀 내부 줄바꿈을 허용한다. 실제 높이가 늘어날 수 있으므로 본문 하단 여백은 측정한 탭 높이+16px로 맞춘다(기존 56px 상수만 유지하지 않음).
3. 홈 BETTER/VAULT 바로 아래 `WHAT YOU DO?` 제목·커뮤니티 안내·텍스트 링크를 담은 직각 배너를 추가한다. 로그인 여부와 무관하게 보이고 새 화면으로 연결한다. 기존 큐레이션·연습/보관함 경로는 보존한다.
4. LogPage는 기록/곡 보관함/곡 상세만 담당한다. `#tab-community`, `#pane-community` 및 관련 상태·import를 제거한다. 옛 `/log.html#community`는 `replace`로 `/community.html`에 연결하며 다른 `#songs`·`?song=` 동작은 유지한다. hashchange·뒤로/앞으로도 이 규칙을 적용한다.
5. 커뮤니티 기본은 `#all`, LOG는 `#log`, 기존 집계 보존 표면은 `#summary`, 내 폴더 관리는 `#my-shares`로 둔다. 해시 없음/알 수 없는 해시는 모두로 정규화한다. 모두/LOG가 기본 두 탭이며, 집계/폴더는 별도 텍스트 링크다. summary는 기존 LogCard와 `/community/logs` 전체/팔로잉/더보기를 유지하고 “84일 연습 집계”로 명확히 표시한다. my-shares는 기존 MySharesPanel 기능을 유지한다. PF 완료 전 기존 관리 경로를 없애지 않는다.
6. 비로그인은 제목·설명·로그인 안내(`settings.html#account`)만 표시하며 인증 필수 커뮤니티 API를 호출하지 않는다. user가 있으나 /me 로딩·실패인 경우 준비/오류 상태를 표시하고 guest·빈 피드로 오인하지 않는다. 임베드 로그인은 기존 auth 동작을 따른다.

### 3.2 피드와 게시물 카드

- 모두: 공개 이름 안내(필요 시) → 모두/LOG 탭 → CurationRows의 현행 큐레이션/월 추천/크리에이터/팔로잉/최근 폴더 → “새 연습 게시물” 피드(scope=all) → 보조 링크. 서로 다른 데이터 목록을 하나의 시간순으로 섞지 않는다.
- LOG: 두 탭 → 전체/팔로잉 scope → 개별 게시물 피드만 표시한다. 초기 전체이며 모두로 전환하면 scope=all로 초기화한다. 집계·큐레이션·내 폴더 관리가 LOG 피드에 섞이지 않는다.
- 모두와 LOG는 동일 EpisodeLogFeed/EpisodeLogCard를 사용한다. scope 전환/탭 재진입은 첫 페이지부터 재조회하며 옛 cursor·오류·선택 신고를 무효화한다. 페이지는 서버 순서를 보존하고 postId로 중복만 제거한다. next는 불투명 문자열 그대로 URL 인코딩하며 파싱·재구성하지 않는다.
- 카드 순서: 왼쪽 YouTube 썸네일 → 오른쪽 게시 제목, 공개 작성자/배지, YouTube 제목/아티스트, 코멘트, 세션 날짜·시간·반복 수, 구간·배속, coverage, 파트 상세, 게시 시각, 행동. 모바일도 본문 읽기 순서는 같으며 세부 메타/행동은 다음 줄로 흐른다.
- 제목은 trim된 post.title 우선, 비어 있으면 `youtubeTitle + “연습 기록”`, YouTube 메타도 없으면 “연습 기록”. youtubeArtist=null이면 줄을 생략한다. 개인 곡 제목·displayName·메모를 기본값에 사용하지 않는다. 코멘트는 텍스트/개행으로 표시하며 HTML 해석·자동 링크 변환을 하지 않는다.
- 썸네일은 videoIdFrom/ thumb로 생성하고 임의 URL을 받지 않는다. 이미지 실패는 대체 영역, alt는 인접 제목과 중복되지 않게 빈 값. 전체 카드를 버튼으로 감싸 내부 링크/신고와 중첩하지 않는다.
- “구간 재생”은 itemPracticeHref 기반 `practice.html?v=…&a=…&b=…&r=…`로 이동한다. null 구간/배속은 생략하고 시작점이 있으면 동일 a를 t로 지정할 수 있다. 기존 플레이어의 URL 우선 복원과 영상 ID 검증을 유지한다.
- “내 보관함 담기”는 같은 구간을 가진 practice.html 링크로 이동해 기존 저장/곡 추가 동선을 안내한다. 클릭만으로 공유 세션/문구·파트·테이크를 복제하거나 커뮤니티 폴더 clone API를 호출하지 않는다. 저장 완료 후 본인 보관함에 곡이 존재해야 완료다. 무료도 기존 곡 한도 내 저장 가능하며 한도 오류는 기존 안내/무변경을 유지한다.
- 다른 사용자의 카드에는 “신고”를 제공한다. 본인에게는 신고를 숨기고 “내 연습 기록”으로 안내한다. 공개 카드에는 테이크 개수·오디오·개인 메모·운영 숨김 사유를 넣지 않는다.

### 3.3 표시 상태

| 대상·상태 | 화면/행동 |
| --- | --- |
| 첫 페이지 loading | aria-busy + “게시물을 불러오는 중”; 빈 안내/더보기 없음 |
| 성공 posts=[] | 전체 “아직 공유된 연습 기록이 없어요” + TRAILS 링크, 팔로잉 “팔로잉의 공유 기록이 없어요” + 전체 보기 |
| 성공 posts 있음 | 카드와 next가 있을 때만 더보기 |
| 첫 페이지 실패 | 오류+재시도, 빈 안내 없음. 큐레이션 성공 결과는 유지 |
| 더보기 loading | 기존 카드 유지, 버튼 잠금/진행 안내, 같은 cursor 중복 요청 차단 |
| 더보기 실패 | 기존 카드·next 보존, 더보기 자리 재시도. 첫 페이지 오류로 목록 제거하지 않음 |
| 큐레이션/최근 폴더 실패 | 해당 영역 오류/재시도, 새 게시물은 독립적으로 표시. 빈 큐레이션과 실패 구별 |
| 신고 201/409 | 각각 접수/이미 접수 안내. 신고만으로 카드를 숨김 처리하지 않음 |
| 삭제·철회·숨김·강등 | 새 조회에서는 서버가 제외. 이미 열린 카드가 신고404를 받으면 제거 후 피드 새로 조회 |

피드 자동 실시간 갱신 API는 없다. 화면 진입·scope 전환·명시 재시도 및 공유/철회 후 재조회에서 반영한다. 이미 전달된 타 사용자 화면을 즉시 원격 삭제한다고 주장하지 않는다.

## 4. 개인 공용 PracticeSessionCard와 공유 흐름

### 4.1 카드 모델과 보존 기능

- TRAILS 날짜별 SessionCardItem과 플레이어/곡 상세 SessionTimeline의 세션 렌더를 `PracticeSessionCard`로 통일한다. SessionTimeline은 목록·초기5개·더보기 책임을 유지한다. 공개 EpisodeLogCard에는 개인 모델을 전달하지 않고, 필요하면 안전한 메타 표시만 공통으로 추출한다.
- 내부 모델: sessionId, videoId, 개인 songTitle/songArtist, date, seconds, loops, a/b/rate, coveragePct, 정규화 partStats, memo, takes. 날짜 목록은 SessionWithSongDto, 곡 상세는 SongSessionDto + 상위 song + takes.filter(take.sessionId===session.id)에서 만든다. 날짜/영상 유사성으로 테이크를 연결하지 않는다. 서버 DTO 확장은 없다.
- 공통 순서: 곡 제목/연습 링크 → 날짜·시간·실제 loops → 구간·배속 → coverage → 파트 요약/펼치기 → 테이크 개수/목록 → 개인 메모/저장 → 공유 상태/행동. 0초/0회/coverage0도 값으로 표시하며 `||`로 다른 수치로 대체하지 않는다. 파트는 name/a/b/rate/completed/seconds/loops를 모두 표시한다. 날짜는 세션 date 그대로, 시간은 seconds 기반 동일 formatter를 쓴다.
- partStats의 배열/JSON 문자열 입력은 어댑터에서 한 번 정규화한다. 파싱 실패는 개인 카드에 “파트 정보를 읽을 수 없어요”로 구분하고 공유 가능하다고 추정하지 않는다. 배열 없음/null은 파트 없음. 서버의 SESSION_NOT_SHAREABLE/BANNED_WORD 판정이 최종이다.
- TakeItemRow의 재생/완료/삭제, 개인 memo 저장, 플레이어 곡 전체 테이크 및 A/B 비교, TRAILS 날짜 탐색·곡 상세/A/B 비교를 유지한다. 같은 테이크가 두 표면에 있으면 완료/삭제 후 양쪽 상태를 갱신한다. 기존 녹음 URL 발급·uid/token/slot 방어를 유지한다.
- 세션 목록 loading/실패/빈 상태를 명시적으로 구별한다. DOM id는 표면+sessionId로 고유하게 만들고 textarea label, 상세 aria-expanded/aria-controls, progress 이름을 제공한다.

### 4.2 공유 상태 조회와 행동

세션 응답에는 공유 필드가 없고 내 게시물 API에는 sessionId 필터가 없다. 사용자 단위 공유 상태 저장소가 `/community/me/episode-logs`를 next=null까지 순차 조회해 sessionId→MyEpisodeLogDto 맵을 만든다. 카드별 동일 목록 호출을 만들지 않는다. 첫 페이지에서 ID가 없다고 “미공유”로 단정하지 않는다.

| 상태 | 표시/가능 행동 |
| --- | --- |
| 내 목록 확인 중/중간 페이지 실패 | “공유 상태 확인 중”/오류·재시도. 미확인 세션 공유 버튼 잠금. 이미 찾은 세션 상태만 사용 가능 |
| 끝까지 조회했으나 해당 sessionId 없음 | 미공유. 쓰기 가능+공개 이름이면 “공유”, 무료면 유료 안내, 이름 없으면 이름 설정 안내 |
| status=published, withdrawnAt=null | “공유 중”, “공유 내용 수정”/“공유 중지”. 실제 쓰기 자격 상실 시 수정 잠금, 철회는 허용 |
| status=tier_paused, withdrawnAt=null | “플랜 변경으로 공개 중지”. canRepublish=true일 때만 재게시. false면 티어/이름 안내 |
| withdrawnAt!=null | “공유 중지됨”, 이전 문구/card 재사용하지 않음. canRepublish=true면 새 동의로 재게시 |
| moderation_hidden | “운영자에 의해 숨김”과 본인 hiddenReason. 철회 이력과 동시 표시, 수정/재게시 금지. 철회는 가능 |
| card=null | 공개 미리보기 사용 불가(철회/스냅샷 문제 가능). 개인 원본을 공개됐다고 대체 표시하지 않음 |

표시는 숨김 여부와 철회 여부를 별개로 계산한다. canRepublish는 재게시 자격이며 공개 중 문구 수정 권한으로 오용하지 않는다. /me limits.communityWrite와 publicName으로 사전 안내하고 서버 응답이 최종 권한이다. 오래된 상태로 경합하면 §5.3 오류를 표시/재조회한다.

전역 내 목록은 부분 결과와 complete를 분리하고 로그아웃·A↔B 시 즉시 비운다. 명시 새로고침·공유 성공·철회 성공·티어/공개 이름 변경·페이지 재진입 시 무효화 후 첫 페이지부터 재구축한다. 페이지 사이 재게시로 순서가 바뀔 수 있으므로 완료 시점의 snapshot임을 전제하고 쓰기 결과를 우선 적용한다. cursor 중복 반복/잘못된 응답은 오류 처리하며 무한 루프·조용한 미공유 판정을 금지한다.

### 4.3 공유/재게시 대화상자

1. 본인 서버 세션에만 진입한다. guest의 기기 기록은 게시 대상이 아니며 로그인/기존 동기화부터 안내한다. 새 세션을 임의 생성해 게시하지 않는다.
2. 제목(선택, 80 code points), 코멘트(선택, 500 code points), 공개 확인 체크박스(기본 꺼짐), 미리보기/공개 범위 안내, 취소/게시를 둔다. 공개 중 수정은 저장된 title/comment를 채우고, 최초/철회 후는 빈 입력이다. 정지 후는 본인 저장 문구를 채울 수 있으나 동의는 다시 받는다. 개인 메모는 입력에 복사하지 않는다.
3. 제목 입력은 기본 제목을 placeholder로만 보여준다. 빈 값은 빈 문자열로 전송한다. 미리보기의 공개 제목 메타는 기존 post.card의 YouTube 메타만 사용하며 없으면 “연습 기록”. 개인 곡 제목을 YouTube 메타로 간주하지 않는다.
4. 안내: “공개 이름, 제목·코멘트, 영상 정보, 세션 날짜·시간·반복 수·구간·배속·커버리지와 파트 이름·통계가 로그인 사용자에게 공개됩니다. 개인 메모와 녹음은 공개되지 않습니다. 다시 게시하면 현재 세션 통계로 교체됩니다.” 파트 이름도 공개 문구임을 명시한다. 최종 서버 snapshot은 POST 시점이며 플레이어는 누적이 바뀔 수 있음을 알린다.
5. trim 후 code point 수/제어 문자/Unicode를 사전 검사한다. JS `.length`나 HTML maxlength만으로 이모지 경계를 제한하지 않는다. 제목은 한 줄, 코멘트는 LF/탭 허용(붙여넣기 CRLF는 LF로 정규화). 서버 금칙어를 클라이언트 성공으로 대체하지 않는다.
6. 동의+유효 입력 때만 게시 가능. 요청 중 중복 제출·다른 세션 전환을 잠근다. POST 201/200 모두 성공, 응답 post로 본인 상태를 갱신하고 피드는 다시 조회한다. 공개 중 수정은 publishedAt 유지, 철회/정지 후는 갱신된다는 서버 정책을 따른다.
7. 실패는 입력/동의를 유지하고 오류/다음 행동 표시. 통신 단절은 성공 여부 불명으로 표시하고 자동 POST 재시도하지 않는다. 내 목록을 재조회한 뒤 사용자가 재시도한다. 계정 전환/로그아웃/모달 폐기 후 늦은 성공·실패는 새 화면에 적용하지 않는다(이미 서버 커밋된 쓰기를 취소했다고 표시하지 않음).
8. 공유 중지는 확인 후 DELETE한다. 무료/숨김 상태에도 본인 철회는 허용. 200 ok=true 확인 후 목록 재조회·로컬 공개 카드 제거; 실패 시 공유 중지 성공으로 바꾸지 않는다. 같은 세션의 철회/게시를 동시에 실행하지 않는다. 철회는 원본 개인 세션/테이크를 삭제하지 않는다.

### 4.4 신고 대화상자

reason 필수 enum(spam=스팸, inappropriate=부적절한 내용, copyright=저작권, other=기타), detail 선택 최대500 code points. 제출 중 중복 잠금, 201 reportId 확인 후 접수 표시. detail은 운영자에게 전달됨을 안내한다. 닫기/실패/계정 전환은 공유 대화상자와 같은 uid·요청 무효화 규칙을 따른다. 다른 사용자의 카드만 신고하며 자기신고400도 방어한다.

## 5. API 연결 계약

아래는 **현행 CM-BE 계약**이며 신규 서버 변경 제안이 아니다. 일반 인증 요청은 기존 auth.api를 사용하고 인증 헤더·오류 봉투·no-store를 유지한다. cursor는 선택이며 누락 시 첫 페이지다.

### 5.1 경로와 입력/성공

| 프런트 래퍼(예정) | HTTP / 요청 | 성공 |
| --- | --- | --- |
| sessions.share(sessionId, input) | POST `/api/v1/sessions/{sessionId}/share`; `{title:string, comment:string}`. 생략/null도 서버는 빈 값 처리하나 UI는 두 문자열 전송 | 최초201, 기존/재게시200 `{post:MyEpisodeLogDto}` |
| sessions.withdrawShare(sessionId) | DELETE 같은 경로, 본문 없음 | 200 `{ok:boolean}`(true). 본인 미공유/철회 반복도 성공 |
| community.episodeLogs(scope,cursor?) | GET `/api/v1/community/episode-logs?scope=all\|following&cursor=…` | 200 `{posts:PublicEpisodeLogDto[],next:string\|null}` |
| community.myEpisodeLogs(cursor?) | GET `/api/v1/community/me/episode-logs?cursor=…` | 200 `{posts:MyEpisodeLogDto[],next:string\|null}` |
| community.reportEpisode(postId,input) | POST `/api/v1/community/episode-logs/{postId}/reports`; `{reason,detail:string}` | 201 `{reportId:string}` |

두 목록 모두 페이지당 최대20개, publishedAt/id 내림차순이다.

### 5.2 읽는 DTO 전 필드

TypeScript의 숫자는 number, Kotlin Int/Double에 대응한다. ID/일시/date는 string, nullable은 아래 `null` 명시대로 유지한다. 오류/필드 누락을 빈 성공 목록으로 덮지 않는다.

| DTO | 필드 전체 |
| --- | --- |
| PublicOwnerDto(기존) | id:string, publicName:string\|null, isCreator:boolean, creatorBadge:string\|null |
| PublicPartStatDto | name:string, a:number, b:number, rate:number, completed:boolean, seconds:number, loops:number |
| PublicEpisodeLogDto | postId:string, sessionId:string, owner:PublicOwnerDto, videoId:string, youtubeTitle:string\|null, youtubeArtist:string\|null, title:string, comment:string, publishedAt:string, date:string, seconds:number, loops:number, a:number\|null, b:number\|null, rate:number\|null, coveragePct:number, partStats:PublicPartStatDto[] |
| EpisodeReportCountsDto | open:number, resolved:number, dismissed:number |
| MyEpisodeLogDto | postId:string, sessionId:string, title:string, comment:string, publishedAt:string, status:published\|tier_paused\|moderation_hidden, hiddenAt:string\|null, hiddenReason:string\|null, tierPausedAt:string\|null, withdrawnAt:string\|null, createdAt:string, updatedAt:string, canRepublish:boolean, reportCounts:EpisodeReportCountsDto, card:PublicEpisodeLogDto\|null |
| 목록·쓰기 봉투 | EpisodeLogListResponse={posts:PublicEpisodeLogDto[],next:string\|null}; MyEpisodeLogListResponse={posts:MyEpisodeLogDto[],next:string\|null}; ShareEpisodeResponse={post:MyEpisodeLogDto}; WithdrawEpisodeResponse={ok:boolean}; ReportEpisodeResponse={reportId:string} |
| ApiErrorResponse | ok:false, source:string, status:number, code:string, message:string, retryAfter:number\|null, detail?:object\|null. detail은 없을 수 있음 |

thumbnail URL 필드는 없고 videoId에서 계산한다. public payload에는 takes/storageKey/audio URL/email/displayName/개인 memo/songTitle가 없다. 내 목록의 hiddenReason/reportCounts는 본인 관리 데이터이며 공개 feed 모델로 spread하지 않는다. PublicSessionSnapshot은 서버 저장용이고 UI에서 쓰기 전송하지 않는다. 신고 상세·신고자·처리 사유는 일반 사용자 API 필드가 아니다.

### 5.3 권한·실패 분기

| 상태/코드 | 조건 및 UI 처리 |
| --- | --- |
| 401 UNAUTHORIZED | 모든 신규 경로 인증 필수. 현재 uid 요청일 때만 로그인 안내·사용자 목록/모달 초기화. 이전 계정 오류는 폐기 |
| 403 TIER_UPGRADE_REQUIRED | 공유/수정/재게시 유료 필요. limits.communityWrite 기반 사전 안내, 서버 거절 시 재게시 성공 표시 없음. 기존 설정 플랜 안내 연결 |
| 409 PUBLIC_NAME_REQUIRED | 읽기/철회/신고는 이름 없이 가능. 게시 시 PublicNameForm 또는 community 이름 안내로 연결, 입력 초안 유지 |
| 400 INVALID_INPUT | 길이·타입·제어문자·알 수 없는 필드·UUID·scope·cursor 오류. 입력 오류는 관련 폼, cursor 오류는 첫 페이지 재조회 안내. 기존 communityErrorKey의 “이름 형식”으로 모든 오류를 표시하지 않음 |
| 400 BANNED_WORD | detail.field=title/comment/partStats.name. 해당 문구 수정 안내. 파트 이름은 원본 연습 파트 편집으로 안내하고 임의 삭제/치환 후 재전송하지 않음 |
| 409 SESSION_NOT_SHAREABLE | 원본 구간/수치/파트 통계가 공개 형식에 맞지 않음. 원본 확인 안내, 자동 수치 보정/빈 snapshot 게시 금지 |
| 409 POST_MODERATION_HIDDEN | 운영자 숨김 우회 금지. 재게시 잠금·내 상태 재조회, 철회는 유지 |
| 404 NOT_FOUND | 타인/삭제된 세션 또는 비공개/철회/숨김 게시물. 존재 여부 상세 추정 없이 접근 불가 안내. 신고 대상은 피드 제거·재조회, 개인 목록도 재조회 |
| 400 SELF_REPORT_NOT_ALLOWED | 자기신고 차단 안내·상태 확인 |
| 409 ALREADY_REPORTED | 이미 접수됨 안내, 성공 카운터/신고 중복 생성 추정 없음 |
| 503 DB_UNAVAILABLE / 네트워크 / 5xx | 재시도 가능한 오류. 조회는 사용자 재시도, 쓰기는 결과 불명과 조회 확인 구분. 데이터 없음으로 변환하지 않음 |

기존 큐레이션·폴더·PublicNameForm·집계 API는 기존 DTO/권한/오류를 유지하며 새 오류 매퍼를 episode 전용으로 분리한다. 공개 이름 등록의 중복/변경 주기 오류도 기존 폼 계약을 유지한다.

## 6. 비동기·보안·수명주기

- 요청 진입에서 auth uid + 요청 순번 + 탭/scope + 대상 sessionId/postId를 캡처한다. 성공/catch/finally 모두 현재 값 일치 시에만 갱신한다. unmount·탭/scope·대상·계정 전환에서 sequence를 올리고 가능한 조회는 abort한다. 조회와 쓰기, 개인 메모와 공유, 각 데이터 원천은 순번을 분리한다.
- A→B 전환 렌더부터 A의 게시물·숨김 사유·입력 초안·테이크 오디오·공유 상태를 숨긴다. 단순 effect 이후 초기화만으로 이전 값이 한 프레임 보이게 하지 않는다. auth uid로 keyed subtree 또는 렌더 시 ownerUid 검사를 사용한다. /me 실패 시 기존 상태 초기화 정책을 따른다.
- 공유/철회 성공 시 진행 중 내 목록/피드 조회도 무효화한다. 늦은 이전 GET이 공유 상태를 되돌리지 않게 한다. 카드별 busy는 uid/sessionId 기준, 더보기는 cursor별 중복 잠금이다. 타이머 콜백도 동일 uid/대상 확인 또는 cleanup을 적용한다.
- 무료 강등은 비노출, 재구독만으로 자동 공개 없음. moderation_hidden+withdrawnAt+ tierPausedAt 조합은 서버 기준을 보존하고 작성자에게 운영자 복구 기능을 주지 않는다. 원본 곡/세션/탈퇴 cascade 결과는 다음 조회에서 제거한다. 철회 후 재게시에도 같은 postId가 유지된다.
- 개인 데이터는 개인 API에만, 공개 피드는 allowlist DTO에만 의존한다. raw JSON spread·dangerouslySetInnerHTML 금지. 인증/입력·신고 상세·오디오 URL을 새 localStorage/로그/분석 이벤트에 보관하지 않는다. 앱 통합 데이터나 다른 앱 데이터를 기본값으로 가져오지 않는다.

## 7. 배치·접근성·문구 계약

| 표면 | 배치 약속 / DOM 계약 |
| --- | --- |
| CommunityPage | main 내 #communityPage, h1 #communityTitle, #communityGuest / #communityLoading / #communityError 구분. #chipAll/#chipLog는 aria-pressed 및 group 이름. chips:center-y |
| 피드 | #episodeFeed, #episodeScopeAll/#episodeScopeFollowing, #episodeLoading/#episodeEmpty/#episodeError/#episodeMore. 카드 data-post-id, scope:center-y. 피드는 한 열, 768의 어중간한 두 열 없음 |
| 게시물 | 썸네일 96px(390), 128px(768 이상) + minmax(0,1fr), meta/actions는 자연 줄바꿈. episodeHead-<postId>:top@768은 같은 카드의 썸네일과 제목 본문만 비교. 카드 간 서로 다른 높이 강제 없음 |
| 개인 카드 | data-session-id + data-surface=day\|player\|detail. sessionHead-<surface>-<id>:top@768, 메타/테이크/메모/공유는 한 열. 펼치기 버튼은 aria-expanded/controls |
| 대화상자 | #episodeShareDialog / #episodeReportDialog, role=dialog, aria-modal, 제목 label. 입력 title/comment/consent 및 reason/detail의 label·오류 aria-describedby. 초기 포커스·Tab 순환·Escape·닫기 후 호출 버튼 포커스 복원. busy 중 외부 클릭 닫기 금지, 계정 전환은 강제 폐기 |
| 홈·셸 | homeCommunityBanner 전체와 링크 중첩 금지. nav aria-current=page. 하단 6셀 tabs:top,bottom,height(같은 행), 본문 마지막 공유/신고·더보기까지 스크롤 후 고정 탭에 가리지 않음 |

390/768/1150/1280px, ko/en/ja, 라이트/다크, 긴 제목80·코멘트500·파트 이름50·긴 공개 이름·0값·다수 파트/테이크에서 G0~G8과 Q1~Q9를 적용한다. 카드/사진 radius-card(0), 주 CTA/탭만 pill, 카드 행동은 텍스트형 button/link. CSS 모듈·기존 토큰 사용, 인라인 style/중간 곡률/무차별 사각화 없음. 긴 코멘트/제목은 줄바꿈하고 의도 없는 잘림·가로 스크롤 금지. live status는 진행/성공, alert는 오류에만 사용한다.

신규 i18n은 ko/en/ja에 동시에 추가한다. 이름·고정 문구·빈 상태·상태/오류·접근성 라벨 모두 t()를 사용한다. 제안 키 계약:

- `nav.community`, `home.communityTitle`, `home.communityDescription`, `home.communityLink`.
- `episode.heading`, `episode.loading`, `episode.emptyAll`, `episode.emptyFollowing`, `episode.retry`, `episode.more`, `episode.play`, `episode.saveViaPlayer`, `episode.report`, `episode.defaultTitle`, `episode.titleWithVideo`, `episode.partEmpty`, `episode.partsUnreadable`.
- `episode.share.title`, `.titleLabel`, `.commentLabel`, `.consent`, `.publicScope`, `.snapshotNotice`, `.submit`, `.cancel`, `.withdraw`, `.withdrawConfirm`, `.republish`, `.edit`, `.success`, `.withdrawn`, `.checking`, `.stateError`, `.published`, `.paused`, `.hidden`, `.unavailablePreview`, `.unknownResult`.
- `episode.report.title`, `.reason`, `.detail`, `.privacy`, `.submit`, `.success`, `.already`, `.spam`, `.inappropriate`, `.copyright`, `.other`.
- `episode.err.invalid`, `.bannedTitle`, `.bannedComment`, `.bannedPart`, `.session`, `.hidden`, `.gone`, `.self`, `.generic`, `.cursor`; `episode.aria.coverage`, `.details`, `.meta`, `.actions`; `community.summaryLink`, `community.summaryTitle`, `community.mySharesLink`.

기존 키는 표시 의미가 같은 경우에만 재사용하고, 구현 시 실제 추가 키를 세 언어에 빠짐없이 반영한다.

## 8. 구현 파일과 검증 관문

| 파일(예정, 루트 상대) | 변경 책임 |
| --- | --- |
| `frontend/src/pages/CommunityPage.tsx`, `CommunityPage.module.css` 신규 | 인증·독립 페이지와 제목/상태 |
| `frontend/src/App.tsx`, `src/main/kotlin/ulevelp/Main.kt`, `server.js` | community SPA 경로만 추가 |
| `frontend/src/components/layout/AppShell.tsx`, `AppShell.module.css` | COMMUNITY export union/상·하단 내비게이션, 6셀 높이와 본문 여백 |
| `frontend/src/pages/HomePage.tsx`, `HomePage.module.css` | 배너 추가 |
| `frontend/src/pages/LogPage.tsx`, `LogPage.module.css` | 옛 경로 호환, 커뮤니티 제거, 공용 카드 연결 |
| `frontend/src/components/community/CommunityPane.tsx`, `Community.module.css`, `CurationRows.tsx` | 표면 분리, 독립적인 로딩/실패/재시도 |
| `frontend/src/components/community/EpisodeLogFeed.tsx`, `EpisodeLogCard.tsx`, `EpisodeReportDialog.tsx` 신규 | 피드/공개 카드/신고 |
| `frontend/src/components/songRecord/PracticeSessionCard.tsx`, `EpisodeShareDialog.tsx`, `useEpisodeShares.ts` 신규 | 개인 카드, 게시, 사용자 단위 상태 조회 |
| `frontend/src/components/songRecord/SongRecordPanel.tsx`, `SongRecordParts.tsx`, `SongRecordParts.module.css` | 타임라인 위임, take/memo 상태 연동 |
| `frontend/src/lib/apiClient.ts`, `community.mts`, `episode.mts` 신규, `i18n/{ko,en,ja}.mts` | DTO/래퍼5개, 순수 어댑터/전용 오류 분류, 문구. 기존 logs/public DTO export 유지 |
| 아래 테스트와 `test/e2e/support/community-fixtures.js` | 신규 DTO fixture, 알 수 없는 API의 빈200에 의존하지 않는 응답/호출 검증 |

### 8.1 수용 사례와 프로덕션 가드

| ID / AC | 방어와 검증할 실제 관찰 |
| --- | --- |
| CUI-01 / AC-4 | 세 라우트 등록→Node/Ktor 직접200·React 렌더·새로고침. 상·하단/홈 동일href, aria-current. 옛hash 이동, TRAILS의 옛tab/pane 없음, #songs/?song 유지 |
| CUI-02 / AC-4 | 탭별 데이터 경계→all은 curation+episode, LOG는 episode만. LOG에서 옛logs 호출0, summary에서 옛logs 호출/집계 표시. 내 폴더 편집도 가능 |
| CUI-03 / AC-4 | UID/seq/scope 가드→A/B, all/following, 탭 이탈을 응답 보류로 교차. 이전 성공·catch·finally 모두 무반영, 이전 로딩 해제도 없음 |
| CUI-04 / AC-4 | 명시적 상태→지연 중 empty0, 첫500 재시도, curation 한쪽 실패, 20개+next/종료, 연타1요청, 추가 실패 시 기존 건수 유지, scope 변경 시 cursor 재사용0 |
| CUI-05 / AC-7 | 동일 PracticeSessionCard→같은 세션의 day/player/detail 메타 순서/실제loops/coverage/파트7필드 일치. take는 sessionId 일치만, memo 저장/완료/삭제/A-B 재생, 초기5개/더보기 유지 |
| CUI-06 / AC-5 | 전체 페이지 확인 가드→대상이 내 목록2페이지, 없는 종료, 2페이지500, 반복cursor에서 잘못된 미공유 표시0. 카드N개도 목록 조회 공유, uid 변경 시 이전map 즉시 비노출 |
| CUI-07 / AC-5 | 명시 동의+POST→80/81·500/501 code points/이모지, 제어문자, 빈 값, BANNED_WORD 세field, 201/200. title/comment 외 전송0, 동의 없는 요청0, 저장 중 연타1회, memo 복사0 |
| CUI-08 / AC-5 | 상태 우선/서버 권한→guest/free/paid/expired/이름 없음, paid=false에도 철회 가능, hidden+withdrawn+paused 조합, canRepublish=false 제한. hidden409·무료403·이름409에 성공 표시0 |
| CUI-09 / AC-5 | 철회/재게시→DELETE 실패 시 공개 상태 유지, 성공 후feed 제거, 원본 세션/take 유지, 재POST 동의/snapshot 교체. 같은postId, 공개 중 수정publishedAt 유지, 재구독만으로feed 복원0 |
| CUI-10 / AC-6 | allowlist/안전 표시→공개 응답/DOM/공유 본문에 개인sentinel 없음, YouTube null 시 개인 제목 미사용, HTML/XSS는 텍스트, 무효videoId 재생/이미지 차단. 본인hiddenReason이 타인/공개 카드에 없음 |
| CUI-11 / AC-5 | 신고→무료B의201, 409중복, 404소멸, 400자기신고, 500재시도, reason/detail 경계·중복 제출. 신고만으로 비공개 처리하지 않음 |
| CUI-12 / AC-7 | 플레이어URL/저장→v/a/b/r/t 실제 플레이어 읽기, null/전체 구간, 미등록곡 저장→본인 보관함. 무료 한도 실패DB 무변경, 작성자 원본 무변경, clone API 호출0 |
| CUI-13 / AC-7 | 배치/키보드→4폭×주요 상태·3언어·dark, 끝 스크롤/긴 모달 펼침/탭 높이, Tab/Escape/포커스 복원, G0~G8·Q1~Q9 |

### 8.2 예정 테스트·실행 순서와 증거 구분

- `test/cm_ui.test.js` 신규: episode.mts의 개인 어댑터/공개 제목/code point/상태·오류 분류/URL 순수 테스트.
- `test/e2e/cm-ui.spec.js` 신규: CUI-01~12 브라우저 동작. mock 응답을 보류/해제해 경합을 결정적으로 실행하며 임의 sleep을 쓰지 않는다.
- `test/e2e/layout/community.spec.js` 신규, 기존 `layout/log.spec.js`, `practice.spec.js`, `home.spec.js`, `shell.spec.js`: 먼저 data-align-group과 실패 고정→구현→통과→4폭 PNG/dark Q1~Q9 검토. 탭 높이는 다른 전체 페이지도 검증한다.
- 기존 `test/e2e/community.spec.js` CM-9의 옛LOG 집계 단언은 summary로 옮기고 새LOG에는 episode 단언을 추가한다. CM-10/11 등의 옛hash/폴더 관리 경로를 갱신하되 기능 단언을 유지한다. `test/r3_practice_log.test.js`, `test/i18n.test.js`, `test/r0_core.test.js`, `test/e2e/i18n-lang.spec.js`, `test/e2e/xss.spec.js` 변경 영향도 확인한다.
- 구현 시 기본 명령: `npm run build`, `npm test`, `npx playwright test test/e2e/cm-ui.spec.js test/e2e/community.spec.js`, `npx playwright test test/e2e/layout/community.spec.js test/e2e/layout/log.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js`, `npx playwright test test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js`. Windows 캡처는 `$env:LAYOUT_SHOTS='1'` 지정 후 layout 대상을 실행하고 종료 후 `Remove-Item Env:LAYOUT_SHOTS`.
- 실제 서버+격리PostgreSQL에서 paid A/free B/owner O를 준비해 A게시→B조회/재생/저장/신고→O 기존 관리API 숨김→A 재게시 거절→A철회, 강등/재구독/재게시, A↔B 전환을 검증한다. O의 API 조작은 로컬fixture 범위이며 운영 쓰기는 없다. DTO 누출·실패 시DB 무변경도 확인한다. 완료된 CM-BE 구현 수정을 반복하는 목적은 아니다.
- mock E2E, 실제 서버 통합, 운영 확인은 각각 기록한다. Ktor 경로의 기존 테스트를 확장하면 관련 대상만 고른다. 운영 배포는 이번/후속 구현의 자동 승인에 포함되지 않는다.

## 9. 자체 검토 결과와 승인 관문

- REQ-3/AC-4~7과 현행DTO를 대조해 독립 화면·기존 집계 보존·공유 snapshot·목록 페이지 경계·null/오류·권한·담기 동선·지연 응답·배치를 고정했다.
- 서버에 없는 “세션 단건 공유 상태”“공개 제목 사전 조회”“게시물clone”“실시간 전파”를 가정하지 않는다. 기존API로 가능한 UI를 정의했다. 내 목록 전체 조회 부하는 게시물 수에 비례하므로 상태를 표시하고 서버API 확장은 별도 결정으로 둔다.
- 운영자 관리 화면/PF/ST는 범위 밖이며 완료로 주장하지 않는다. CM-BE 커서/P2 삭제 경합은 완료 입력으로 보존하고 재구현하지 않는다.
- 이번 실행은 문서 검증만이다. 제품 구현·레이아웃Red/Green·스크린샷·통합/운영 확인은 미실행이다. 실제 문서 검증 결과는 진행 파일에 기록한다.
- 다음 관문은 사용자 명세 검토와 구현/Git 처리 범위 지시다. 구현 승인 후 본문의 파일/경로/export 변경을 재확인하고 승인 범위에서 구현·검증·기록으로 이어간다.
