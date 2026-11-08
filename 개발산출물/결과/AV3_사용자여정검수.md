> **현재 판정(2026-11-09): AV-3 로컬 기능 검수 통과, 운영 인수 보류.** 아래는 AV-F3 수정 전 1차 결과다. 현재 수정·증거 한계·남은 조건은 [마감 판정](AV3_마감.md)을 따른다. 과거 ignored 원시 증거/O 인증/최초 덤프는 유실되어 아래 보존 서술은 당시 상태이며 현재 보유를 뜻하지 않는다.

# AV-3 실제 사용자 여정 검수 — 1차 결과

- 검수일: 2026-11-08 KST, mac / Codex 단독. 대상 앱 `4a6df1c`(AV-2 코드 `349e1d9` 포함), `origin/main cb4565c`와 앱 코드 동일. 작업 브랜치 `audit/av3-user-journey`.
- **판정: 인수 보류.** 실제 Google A/B/O 계정·Ktor·격리 PostgreSQL의 핵심 연속 여정과 외부 연동은 동작했지만, 계정 전환/로그아웃 후 늦은 `/me` 응답이 전역 프로필을 이전 사용자로 되돌리는 **AV-F3**가 5건 실패로 재현됐다.
- 앱 코드·API·DB 스키마·의존성 변경 없음. 검수 도구·실 Netty 경계 테스트·문서만 로컬 변경. Git 게시·운영 DB/스토리지/콘텐츠 쓰기·배포 없음. 승인·재개 기준은 [진행 파일](../완료/진행_AV3_사용자여정검수.md), 준비/판정 기준은 [준비 결과](AV3_검수준비.md).

## 1. 실제 환경과 증거 수준

| 항목 | 실제 수행·경계 |
| --- | --- |
| Git·CI | PR #139/#140 모두 `choise-hun` 머지. 최신 main `cb4565c` [run 42476331952](https://github.com/choise-hun/doloop/actions/runs/42476331952) success. 이전 #139 merge [run 42476310111](https://github.com/choise-hun/doloop/actions/runs/42476310111)은 Docker 내부 Gradle 9.4.1 다운로드 10,000ms read timeout으로 failure(Node/Kotlin/E2E 성공). 최신 main 성공과 구별. 재실행/게시 안 함 |
| 서버·DB | `npm run build`, `./gradlew installDist --no-daemon` 성공. `scripts/av3/local-server.py --youtube`로 loopback :3103 Ktor+빌드 SPA·`postgres:16-alpine` 폐기 DB 기동, Flyway V1~V9. 원격 DB URL/Storage secret/Job URI 상속 안 함. 재개 시 같은 label/loopback DB를 검증해 `--resume` 사용 |
| 실제 인증 | A/B/O 세 Google 계정의 서로 다른 UUID를 Ktor `/me`와 대조. A/B는 native Whale, O는 일반 Whale의 OAuth를 loopback bridge에서 Ktor JWT 검증 후 전달. Google 쿠키/비밀번호 복사 없음. 역할·pro/free·월 주기·검수 데이터는 격리 DB에만 설정 |
| 브라우저 여정 | 실제 Supabase 세션과 `/api/v1` 사용. 정상 여정의 API/auth 응답 fulfill mock 없음. 지연 시험만 실제 서버 응답을 받은 뒤 전달 보류 또는 500으로 교체. 이것을 서버 거절/rollback과 혼동하지 않음 |
| 경계 보강 | 새 `LiveBoundaryTest`는 실제 Netty socket+별도 폐기 DB, 테스트 서명 JWT/제어 가능한 메타데이터를 사용. Google/실외부 여정과 별도 증거 |
| 외부 | 실제 YouTube Data API·oEmbed·iframe player 사용. Secret Manager `SYSTEM_GEMINI_API_KEY`를 메모리/env로만 전달한 별도 loopback :3105 서버에서 10초 구간 Gemini 분석 1건. 원격 Cloud Run Job 미사용, 완료 후 :3105 종료 |
| 운영 | 운영 배포/로그인/콘텐츠는 이번에 확인하지 않음. 로컬 O 권한·큐레이션을 운영 인수로 승격하지 않음 |

세션·계정 UUID·DB 스냅샷·원시 JSON/로그·스크린샷은 **ignored `test-results/av3/`**(디렉터리 0700, 세션 파일 0600)의 로컬 증거다. 종료 시 최종 도메인 DB 스냅샷을 보관하고 검수 Ktor/bridge/실분석 서버는 종료했다. 재검수용 labelled 폐기 DB와 private 세션/증거는 로컬에 보존했다. 다른 PC에 git으로 전달되지 않는다. 이 문서에는 이메일·토큰·키·환경별 비밀값을 적지 않는다.

## 2. 명령·실제 결과

| 명령 | 결과·판정 범위 |
| --- | --- |
| `npm run build` | tsc/Vite 성공. 기존 CJS/config.js/큰 청크 경고 유지 |
| `./gradlew installDist --no-daemon` | BUILD SUCCESSFUL |
| `node scripts/av3/preflight.cjs` | SPA/assets/health·비인증 `/me`/curation/folders 401·DB 전체 불변·Flyway V9 통과 |
| `AV3_RESET_FIXTURE=1 node scripts/av3/journey.cjs` | **7/7 통과**: 계정/역할·브라우저 게시/발견·무료 반응/거절·유료 담기/보관함/소유권·수동/자동/전체 OFF/폴더 OFF·철회·신고/owner 처리/감사 |
| `node scripts/av3/extended.cjs` | **4/4 통과**: 실제 120초 연습/동의 LOG, 유예 종료/재가입 날짜 fixture·월/구매 원장, 키 미설정 Gemini 503 무변경, 분류 한도 403 전체 DB 불변 |
| `node scripts/av3/races.cjs` | **48/48 통과**: A↔B × 좋아요/팔로우/담기/신고 × 성공/커밋 뒤 응답 500 × 다른 시트/재열기/SDK 계정 전환. 이전 응답 뒤 새 시트 상태·안내 무오염. 반복 전환은 SDK setSession, 실제 backend logout은 아래 별도 검사 |
| `node scripts/av3/share-races.cjs` | **12/12 통과**: A↔B × 공개 전환/폴더 자동 연동/재게시 × 성공/커밋 뒤 응답 500. 새 계정에 이전 오류 미노출 |
| `node scripts/av3/profile-races.cjs` | **0/4 통과, 4 실패(exit 1)**: A↔B × GET/PATCH `/me`. 세션은 새 사용자 유지, `auth.getMe().id`는 이전 사용자로 변경. AV-F3 |
| `node scripts/av3/logout-check.cjs` | **실패(exit 1)**: 실제 Supabase logout 204·session/me/keys 초기화는 통과. B 세션/프로필 확인 후 보류한 A GET을 해제하면 B 세션+A 프로필이 됨. AV-F3 |
| `python3 scripts/av3/gemini-server.py` | 실제 분석 1건 202→done. **9 예약→1 정산**, 입력 856/출력 352/추론 0 토큰, 잔액 감소=확정 크레딧·원장 합계 일치. note GET·NOTES 목록/상세/본문 표시까지 확인. 공급자 청구 대시보드는 미확인 |
| `node scripts/av3/youtube-live.cjs` | 실제 playlist preview 200·13항목 중 **10 가져옴/3 unavailable/0 중복/0 한도 건너뜀**, 분류 연결 10개·보관함 화면 일치. `M7lc1UVf-VE` 실제 player의 재생 시간 진행·0.75배속·루프 복귀·unmuted 확인. 물리적 스피커 소리는 사람 미확인 |
| `node scripts/av3/ops-ownership.cjs` 및 노트 본문 보강 | **3개 묶음 통과**: 로컬 O 큐레이션/월 추천 초안→공개→홈, 월 중복409·6곡400·비 owner403 전체 DB 무변경, 실제 노트/작업/세션 소유권404·타인 원장 비노출, 실제 분석 노트 목록/상세 이동·본문 표시 |
| `./gradlew test --tests 'ulevelp.av3.LiveBoundaryTest' --no-daemon` | **4 tests, 0 failures/errors/skipped**. 외부 I/O 도중 철회 후 clone 404/전체 도메인 불변, 분류 마지막 1칸 동시 clone 200+403·한 분류/곡/수치, 동시 멱등 좋아요 1행/1count, 부모 취소 시 진행 중 DB insert rollback |
| `./gradlew test --tests 'ulevelp.credit.CreditApiTest' --no-daemon` | **16 tests, 0 failures/errors/skipped**. 시간 주입·fake 외부 기반 예약/정산/환급·30일/유예·OIDC 경계. 실 Gemini 성공과 별도 |

거절 불변 검사는 `video_titles` 외 public의 모든 도메인 테이블의 **전체 행/키/값**을 비교했다. 무료/분류한도 clone, 비 owner 관리, 월 추천 중복/초과, 타인 노트/작업/세션 요청의 403/404/409/400과 연결했다. 외부 제목 캐시 보완은 별도다. 곡 한도는 부분 복사+skippedLimit이며 분류 한도 전면 거절과 구분했다.

스크린샷은 `J1-free-B-folder.png`, `J3-B-own-library.png`, `J6b-real-practice-log.png`, `J8-real-playlist-library.png`, `J8-real-youtube-player.png`, `local-curation-monthly-home.png`, `real-Gemini-note-{list,detail}.png`, `profile-race-*.png`, `real-logout-profile-race.png`에 저장했다. 폴더/보관함/LOG·player 차단/재생·로컬 큐레이션 홈·실노트 본문 화면을 직접 열어 검토했다. 개인 계정 정보가 포함될 수 있어 버전 관리하지 않는다.

## 3. 새 결함 AV-F3 — 전역 프로필 지연 응답의 계정 격리 실패

| 항목 | 재현·근거 |
| --- | --- |
| 재현 1 | 실제 A 인증으로 GET `/me` 또는 PATCH `/me`를 서버에서 완료 → 브라우저 응답만 보류 → SDK에서 실제 B 세션으로 전환 → `/me` B 확인 → A 응답 해제. A→B/B→A의 GET/PATCH **4건 모두 실패** |
| 재현 2 | A GET 보류 → 실제 Supabase logout 204 → session/me/keys 모두 null 확인 → 실제 B 세션·프로필 확인 → A GET 응답 해제 → `getUser().id=B`, `getMe().id=A`. **추가 1건 실패** |
| 원인 | `frontend/src/lib/auth.ts:218`은 await 전 uid만 캡처하고, `:225~237`의 성공/실패는 현재 세션 uid/요청 세대 확인 없이 locale/currentMe/lastFetchedUid/cache/notify를 변경. `:281~290` PATCH도 같은 가드 없음 |
| 실제 영향 | 현재 세션과 전역 프로필이 다른 사용자로 갈라짐. 다른 사용자의 프로필/티어/UI 상태가 현재 화면에 반영될 수 있다. 실제 서버의 타인 곡·분류·노트·작업·세션 권한 거절은 별도로 통과했다. 전역 client 상태 실패와 서버 소유권 결과를 구분 |
| 판정 | 기존 계정 격리 계약 위반. AV-2의 FolderSheet 수명 가드가 이 전역 auth 경로까지 보호하는 것은 아님. **AV-3 관문 불통과** |
| 추천 수정 범위 | auth의 GET/PATCH 진입 uid·인증 세대·프로필 요청 순서를 캡처하고 await 후/성공/실패/캐시/locale/notify 전 모두 현재 요청인지 확인. 로그아웃·계정 전환 때 세대를 무효화. GET↔PATCH 순서와 stale 호출자 결과 처리도 함께 명세화. 기존 API/함수 반환 계약을 확인한 별도 짧은 수정 명세→회귀 실패 확인→구현→이 5개 실여정 재검증 |

이번 요청은 AV-3 자동 검수 실행이다. 이 결함을 숨기거나 제품 코드를 임의 수정하지 않았다. 실패 단언·exit 1을 유지했으며, 수정 후 성공/실패 응답·로그아웃·양방향 전환·동일 계정 최신 프로필 순서를 검증해야 한다.

## 4. 기능별 네 단계 판정

구현 근거와 기존 화면 경로는 [AV-1 §2](AV1_사용가능성검수.md#2-기능별-네-단계-판정)를 유지한다. 아래 통합은 이번에 실제 연결한 범위만 적었다. 모든 운영 사용자 여정은 미검증이다.

| 기능 | 구현 | 실제 화면 연결 | 이번 통합 검증 | 운영 확인 |
| --- | --- | --- | --- | --- |
| 인증/공개 이름/프로필 | 기존 재사용 | A/B/O 실제 로그인·이름 표시 | 최초 생성·역할/티어 확인, **전역 /me 계정 전환 실패 AV-F3** | 미검증 |
| 폴더 게시/발견/담기/보관함 | 기존 재사용+AV-2 | 게시·시트·담기·자기 보관함 통과 | 공개 필드·중복 1곡/신규 2곡·무료/분류한도 거절·A/B 권한·지연 통과 | 미검증 |
| 수동/자동 연동·철회 | 기존 재사용 | 게시/공유 스위치·공개 목록 연결 | 재게시/전체 OFF/폴더 OFF/명시 ON·철회404·B 사본 보존 통과 | 미검증 |
| 좋아요/팔로우/신고 | 기존 재사용+AV-2 | 실제 시트·반응·LOG | 멱등·신고201/중복409·지연48조합·owner 숨김/감사 통과 | 미검증 |
| LOG 집계·동의 | 기존 재사용 | LOG에 실제120초 카드·원제 표시 | 동의 ON/OFF·비공개 문자열 비노출 통과. 84일 경계 전체 조합은 기존 C4 API 증거와 구분 | 미검증 |
| owner 큐레이션·월 추천 | 기존 재사용 | 로컬 홈 curated/monthly 표시 | 초안/공개·월 중복·5곡 한도·일반 사용자403/DB불변 통과. 작성은 로컬 API fixture | 운영 첫 등록 여부 미확인 |
| 티어/월 주기·크레딧 | 기존 재사용 | `/me`·보관함 권한·실노트 연결 | 날짜 fixture 유예/만료/재가입·실 Gemini 정산 통과. fake/시간주입16개 별도 | 실결제/청구/cron 미검증 |
| 재생목록/실영상 | 기존 재사용 | 실제 가져온 보관함·player 통과 | live Data API 저장·13개 처리, embed 가능 샘플 시간/배속/loop 통과 | 운영/물리 소리 미확인 |
| AI 노트 | 기존 재사용 | 실제 생성 노트 목록/상세/본문 통과 | 실 Gemini 단일10초 분석·예약/정산·타인404 통과. 정확도/다양한 영상/실실패 환급은 미검증 | 공급자 청구·운영 미검증 |
| 코드 진행 AI·녹음·Notion/Drive | 기존 구현 이력 유지 | 이번 실연결 대상 외 | 실계정/실외부 통합 미실행. 기존 fake 테스트를 승격하지 않음 | 미검증 |

## 5. 시행 중 구분한 제약·미실행

- 초기 도구의 같은 hash 이동 시 열린 시트 유지·following/recent의 같은 폴더 중복 locator는 명시적 reload/첫 카드 선택으로 수정했다. assertion을 줄이지 않고 도구의 대상 지정 오류를 바로잡았으며 이전 실패 JSON을 attempt 파일로 보존했다.
- native CDP default context의 `storageState()`가 origins=[]를 반환해 실제 페이지의 `ulp:auth`만 로컬로 저장하도록 수정했다. Google이 자동 제어 Chromium 로그인을 거절한 경우 우회하지 않고 일반 Whale+loopback bridge를 사용했다. 실제 앱/API 인증 가드는 바꾸지 않았다.
- 반복 signOut은 Supabase refresh 세션을 실제 폐기하므로 반복 매트릭스는 계정 전환, 실제 logout은 별도 검사로 나눴다. A/B 세션은 기존 Google 로그인으로 OAuth 재복귀·갱신했다. refresh가 필요한 재개는 native 세션을 다시 읽고, 없으면 로그인만 요청한다.
- `dQw4w9WgXcQ` iframe은 이번 환경에서 “임베드 재생이 막혀 있어요/이 동영상을 볼 수 없습니다”가 실제 표시됐다. 이를 숨기지 않고 차단 화면을 보관했다. 별도 `M7lc1UVf-VE`로 실제 재생·0.75/loop를 확인했다. 특정 영상의 외부 권리/지역 제약과 앱 전체 재생 성공을 구분한다.
- 최초 playlist fixture는 13개로 도구의 임의 10개 제한에 걸려 preview만 확인했다. 소규모 검수 상한을 20개로 정해 같은 실목록을 가져왔고 10 저장/3 unavailable을 확인했다. 외부 원본을 고치거나 빈 mock으로 바꾸지 않았다.
- 취소 보강은 부모 coroutine의 진행 중 DB write rollback, clone 외부 I/O 도중 철회, 동시 quota/like까지다. **브라우저 abort가 서버 취소를 발생시키는지·커밋 직후 TCP 절단·동시 게시/철회 전체 조합**은 미실행. 전송 후 응답 500은 실제 커밋 취소가 아니다.
- 화면 관찰 AV-O2: 로그인한 A가 계정에 등록하지 않은 재생 샘플을 열었을 때 상단은 ‘계정에 없는 곡’, 하단은 ‘로그인하면 이 곡의 연습 기록과 녹음이 여기에 모여요’로 표시된다. `SongRecordPanel.tsx:73~77`의 사용자/곡 조건이 같은 로그인 안내를 사용한다. 계정 상태와 곡 등록 상태를 구별할 문구 필요 여부를 후속 화면 요구로 판단한다. 재생/저장 권한 결함으로 단정하지 않음.
- 실제 30일 대기·운영 Cron/OIDC·결제/webhook·모바일 실기기·운영 첫 큐레이션/월 추천/로그인 분류 추가(#61)는 미확인/별도 범위 유지. 신규 개별 세션 게시/프로필/화면 요구를 완료 처리하지 않음.

## 6. 다음 관문

1. AV-F3를 기존 계약 결함 수정 범위로 확정하고 짧은 수정 명세·회귀를 만든다. 현재 5개 실패를 통과로 바꾸고 GET/PATCH 성공/실패·로그아웃·양방향 전환·동일 사용자 응답 순서를 추가 확인한다.
2. 수정 후 같은 실제 계정·격리 DB로 핵심 여정을 재검증한다. 위 미실행 취소/전송/운영 조건은 분리해서 완료 또는 차단 근거를 붙인다.
3. 운영 조회/쓰기·배포·Git 게시 승인은 이번 자동 검수 승인에 포함되지 않는다. 로컬 통합 성공을 운영 인수나 CH-A 이후 웹 확장 관문 통과로 바꾸지 않는다.
