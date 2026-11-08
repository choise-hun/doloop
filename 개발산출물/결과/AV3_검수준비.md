# AV-3 검수 준비 조사

- 조사일: 2026-11-08 KST, Codex 단독. 준비 조사 완료, 실제 AV-3 실행·구현·게시·배포·운영 쓰기 미실행.
- 입력: [AV-2 완료](../완료/진행_AV2_결함수정.md), [AV-1 §7](AV1_사용가능성검수.md#7-미실행-검증다음-행동), [상용 계획 AV-3](../../계획/상용_서비스_계획.md), [문서 운영](../../docs/문서_운영.md), backend-kotlin·frontend-state·testing-security 규칙과 현재 코드.
- 현재 체크아웃: `fix/av2-community` / `4a6df1c`, 착수 git status clean. `git fetch origin` 후 `origin/main=cb4565c`. 두 머지 커밋 ancestry 확인, `HEAD`와 main의 `src/frontend/public/test/package.json/build.gradle.kts` 차이 없음. 브랜치 전환·구현 반복 없음.

## 1. 실제 PR·CI 조회

GitHub 연결 도구로 PR REST·Actions run/jobs를 조회했다. 머지 주체는 두 건 모두 `choise-hun`다. 시각은 KST.

| 대상 | 머지/커밋 | 실제 CI와 증거 범위 |
| --- | --- | --- |
| [PR #139](https://github.com/choise-hun/doloop/pull/139) | 2026-11-08 20:33:55, `653c2c2`; head `3319d97` | [run 42474186643](https://github.com/choise-hun/doloop/actions/runs/42474186643) completed/success. Detect code changes·CI ok 성공, Node·Kotlin·E2E·Docker skipped(문서 정책) |
| [PR #140](https://github.com/choise-hun/doloop/pull/140) | 2026-11-08 20:34:12, `cb4565c`; head `4a6df1c` | [최신 head run 42475459383](https://github.com/choise-hun/doloop/actions/runs/42475459383) completed/success. 문서 추가 push로 앱 테스트 skipped. [코드 head `349e1d9` run 42474768825](https://github.com/choise-hun/doloop/actions/runs/42474768825)는 Node 22/24·Kotlin·E2E·Docker·CI ok 전부 completed/success |

머지 후 main CI는 PR head CI와 별개다. 2026-11-08 20:39:51 KST 조회에서 [#139 merge run 42476310111](https://github.com/choise-hun/doloop/actions/runs/42476310111)은 `in_progress`, [#140 merge run 42476331952](https://github.com/choise-hun/doloop/actions/runs/42476331952)은 `pending`, 둘 다 conclusion=null이었다. **main CI 종료 성공은 아직 미확인**이다. CI 성공·머지는 운영 배포 증거가 아니다. 운영은 [AV-1](AV1_사용가능성검수.md)의 `server:15aea38` 기록만 있으며 이번에 리비전·운영 로그인·콘텐츠를 재조회하지 않았다.

## 2. 실행 구조와 인증 선택

| 조사 결과 | 코드 근거 | AV-3에 필요한 조치 |
| --- | --- | --- |
| Node 서버는 GET/HEAD 전용이며 `/api/v1` 저장 서버가 아니다. 현재 Playwright는 이 서버와 :3000을 사용 | `server.js:253`, `playwright.config.js:11,23` | 실제 여정은 Ktor :3103 같은 별도 포트에서 SPA와 API를 같은 출처로 제공. 기존 mock E2E를 그대로 실행한 결과를 통합 결과로 사용하지 않음 |
| Ktor는 `PUBLIC_DIR`의 `spa.html`과 assets를 서빙, `dist/index.html` 직접 참조 안 함 | `Main.kt:146,401`, `Dockerfile:39` | React 빌드 후 임시 public 디렉터리를 구성. 저장소 public·운영 설정은 건드리지 않음 |
| 실행 main은 환경변수로 DB·Supabase 설정을 읽고 Flyway 실행 | `Main.kt:139,147,163`, `DatabaseFactory.kt:26,114` | 빈 로컬 PostgreSQL 16을 별도 생성. 기존 `.env` 전체 source 금지: DB 목적지/Job URI까지 따라갈 수 있음 |
| 실제 로그인은 Supabase Google OAuth/PKCE, `ulp:auth` 세션에서 Bearer 사용 | `auth.ts:79,88,176,242`, `AuthPlugin.kt:36` | 권장: 승인된 테스트 Supabase 프로젝트의 Google A/B 및 owner 계정. Google provider·redirect allowlist·실제 세션 갱신·JWKS 발급 확인 |
| 서버는 `SUPABASE_URL/auth/v1` issuer, authenticated audience와 ES256/RS256 검증 | `SupabaseJwtVerifier.kt:233,239,259,321` | 같은 프로젝트 URL/공개 브라우저 키를 임시 config에 사용. HS256 토큰·다른 프로젝트 토큰을 허용하는 가드 변경 금지 |
| TestJwt는 JVM 내 임의 키+StaticJwksProvider, 2026-10-30 고정 시계. `configureApiTestApp`은 testApplication용 | `ApiTestSupport.kt:45,51,59,106,297` | 토큰만 실제 main에 넣어도 작동하지 않음. 대안은 별도 로컬 Netty 테스트 runner+테스트 서명기/시계·브라우저 세션 주입 구현. 현재 준비 범위에서 만들지 않았으며 OAuth 검증을 대체하지 않음 |
| 첫 인증 API 호출은 users/profiles를 생성할 수 있음 | `AuthPlugin.kt:40`, `ProfileService.kt:104` | `/me`라도 DB 관점에서 최초 쓰기 가능. 이 조사에서는 로그인/API 호출을 실행하지 않음 |
| CSP가 현재 Supabase 호스트를 고정 | `frontend/index.html:5`, `public/config.js:4` | 다른 테스트 프로젝트를 쓰면 임시 spa.html의 connect-src/media-src와 임시 config.js의 supabaseUrl/공개 키를 함께 일치시킨 뒤 브라우저 검사. 기존 프로젝트 재사용은 테스트 용도 확인 전 미확정 |

## 3. 계정·환경 확보표

필요 항목은 확보 사실과 다르다. 계정 비밀번호·토큰·키 원문은 문서/로그/스크린샷에 기록하지 않는다.

| 항목 | 필요한 상태 | 이번에 확인한 상태/차단 |
| --- | --- | --- |
| 로컬 도구 | Node, JDK 21, Docker, Chromium, 빈 포트 | Node `v24.16.0`, Docker server `29.5.3`, JDK 21 경로 확인. Chromium 실행·:3103/DB 포트 가용성·신규 DB 기동 미확인 |
| A | 유료 pro, 일반 사용자, 고유 공개 이름, 소유 분류/곡 3개, 비공개 메모 표식 | 실제 테스트 계정·UUID·로그인 수단 미확보 |
| B | 최초 free 일반 사용자 → 동일 UUID를 pro로 변경; 기존 중복 영상 1개 보유 | 실제 테스트 계정 미확보. A/B 교환 검증 시 서로의 개인 데이터 ID를 보관 |
| O | A/B와 다른 owner, 로컬 DB에서만 역할 bootstrap | Google owner 계정 미확보. 첫 `/me` 후 **격리 DB에서만** profiles.role을 owner로 시드할 절차 필요. owner 검증은 JWT metadata가 아닌 DB role(`AdminRoutes.kt:36`) |
| 분류 한도 사용자 | 별도 fixture 또는 B의 독립 DB 스냅샷 분기, pro 제한만큼 분류 채움 | 한도는 `/me limits/usage`로 읽기. A/B 기본 여정 데이터를 파괴하지 않고 분기 |
| Supabase | 전용 테스트 프로젝트/Google provider/redirect URI, ES256 또는 RS256 JWKS, 공개 키 | 저장소 공개 설정은 존재하지만 테스트 전용 여부·OAuth allowlist·로그인 권한 미확인 |
| 프로세스 설정 | 격리 DB URL, PUBLIC_DIR, HOST/PORT, ALLOWED_ORIGINS, PUBLIC_APP_URL, SUPABASE_URL | 조사 셸에서 관련 설정 모두 unset. `.env`에는 Supabase/DB/APP_MASTER_KEY/YouTube 키가 nonempty임만 확인. 목적지·유효성·테스트 사용 승인을 확인한 것은 아님 |
| YouTube | 임베드 허용 공개 영상(구간/배속), 승인된 소규모 재생목록, 서버 Data API key·쿼터 | `.env` 키 존재만 확인. 실제 사용/제한/쿼터·영상·목록 ID 미확인. oEmbed는 키 없이도 외부 호출(`Main.kt:150`) |
| Gemini | `SYSTEM_GEMINI_API_KEY`, 테스트 프로젝트의 billing·quota, 영상/구간·모델 입력·호출 횟수/예산 상한 | 프로세스·`.env`에 해당 키 없음. `.env.example`에도 이 키 항목 없음. 런타임은 `Main.kt:107,223` 기준. 실분석 차단 |
| 원장 | 로컬 O의 기존 관리 API로 지급, 전후 balances/ledger·job ID 확보 | `AdminRoutes.kt:108,128`, `AdminService.kt:257,298`. pro 설정은 월 주기/크레딧도 바꾸므로 그 뒤를 기준 스냅샷으로 사용 |
| Storage/Notion/Drive | 녹음·외부 쓰기를 포함할 때만 테스트 bucket·workspace·OAuth·APP_MASTER_KEY | 이번 핵심 폴더 여정에는 필수 아님. 확장 시 별도 테스트 자원/쓰기 범위 확정. 기존 운영 storage secret을 기본 주입하지 않음 |
| Cron/Cloud Run Job | 시간 경계·OIDC의 별도 검수 환경 | 현재 셸과 `.env`의 cron/Job URI 없음. 로컬 분석은 URI 미설정 시 LocalAsyncJobDispatcher(`Main.kt:234`). 원격 Job·운영 cron 실행 금지 |

## 4. 승인 후 실행할 기동 절차(이번에는 미실행)

실행 승인 후 머지된 main을 별도 worktree로 확보한다. 아래는 **전용 테스트 Supabase 설정과 A/B/O 계정이 확보된 경우의 수동 기동안**이다. 계정 없는 상태에서 JWT 우회로 진행하지 않는다. 명령은 bash 기준, 비밀값은 승인된 비밀 저장소에서 셸 변수로 전달한다.

1. `git status --short`, `git fetch origin`, 검수 커밋 기록, main CI 확인. `git worktree add --detach ../ULevelP-av3 cb4565c` 후 해당 디렉터리에서 작업. 현재 작업/프로세스·포트를 보존한다.
2. `npm ci && npm run build`. `AV3_PUBLIC=$(mktemp -d /tmp/ulevelp-av3-public.XXXXXX)` → `cp -R public/. "$AV3_PUBLIC/"` → `cp dist/index.html "$AV3_PUBLIC/spa.html"` → `cp -R dist/assets "$AV3_PUBLIC/assets"`. 임시 config의 URL/공개 키 및 spa.html CSP를 §2에 맞춘다. 빌드 재실행 시 임시 spa도 다시 복사한다.
3. 아래 예시의 `ulp_av3`/`local_av3_only`는 폐기용 로컬 값이다. 이름이 이미 있으면 중단하고 새 실행 ID를 정한다. 운영 volume을 마운트하지 않는다.

```bash
docker run -d --rm --name ulevelp-av3-db \
  -p 127.0.0.1:0:5432 \
  -e POSTGRES_DB=ulp_av3 -e POSTGRES_USER=ulp_av3 \
  -e POSTGRES_PASSWORD=local_av3_only postgres:16-alpine
docker exec ulevelp-av3-db pg_isready -U ulp_av3 -d ulp_av3
# ready 이벤트까지 제한 시간 내 재조회, 실패하면 서버 실행 중단
AV3_DB_PORT=$(docker port ulevelp-av3-db 5432/tcp | awk -F: '{print $NF}')
```

4. `AV3_SUPABASE_URL`은 앞서 확인한 테스트 프로젝트 URL, `AV3_JAVA_HOME`은 JDK 21 경로다. `env -i`로 기존 DB/secret/원격 Job/ANALYZE_JOB_ID의 암묵 상속을 차단한다. 아래 최소 기동에는 실분석/재생목록 키를 넣지 않는다. 실외부 분기는 승인된 키만 추가하여 재기동한다. API 키 없이도 제목 oEmbed와 브라우저 YouTube/Auth는 외부 접속한다.

```bash
env -i PATH="$PATH" HOME="$HOME" JAVA_HOME="$AV3_JAVA_HOME" \
  DATABASE_URL="postgresql://ulp_av3:local_av3_only@127.0.0.1:$AV3_DB_PORT/ulp_av3" \
  HOST=127.0.0.1 PORT=3103 PUBLIC_DIR="$AV3_PUBLIC" \
  PUBLIC_APP_URL=http://127.0.0.1:3103/ \
  ALLOWED_ORIGINS=http://127.0.0.1:3103 \
  SUPABASE_URL="$AV3_SUPABASE_URL" \
  ./gradlew --no-daemon run
```

5. 서버 로그의 DB 목적지·Flyway V1~V9, `/api/health` 200, `/`와 `/practice.html`의 React root·assets 200, 비인증 `/api/v1/curation/home` 401을 확인한다. health만으로 DB/인증 준비 완료 처리하지 않는다. 브라우저에서 실제 A/B/O 로그인 → `/api/v1/me` UUID를 비교하고 DB 컨테이너의 users/profiles만 생성됐는지 확인한다.
6. A/B는 독립 브라우저 프로필로 기본 여정을 수행하고, 계정 전환 시험은 **같은 브라우저 프로필에서** A 로그아웃→B 로그인 및 역방향을 수행한다. O를 로컬 owner로 시드한 뒤 기존 관리 API로 A pro, B free를 설정하고 `/me limits/usage`와 감사/원장을 기준 스냅샷으로 남긴다.
7. 자동화는 별도 AV-3 Playwright config에서 baseURL :3103·실행 Ktor를 health뿐 아니라 인증/DB로 확인한다. 기존 Node webServer·API/auth mock을 재사용하지 않는다. 정상 여정에서 `/api/v1/**` fulfill 금지. fault 시험의 응답 지연/실패 주입만 명시적으로 구분한다. 현재 이 runner/config/spec는 없음: 구현 승인 후 준비할 항목이다.
8. 증거를 저장한 뒤 이 작업에서 만든 서버 PID·DB 컨테이너·임시 public만 종료/정리한다. `docker stop ulevelp-av3-db`는 해당 폐기 DB 전체 삭제이므로 종료 전 필요한 스냅샷을 보관한다. 테스트 Supabase 계정/외부 자원 정리는 승인 범위를 확인한다.

## 5. 연속 여정과 통과 기준

각 단계마다 사용자 UUID·분류/공개 폴더/곡/job ID·입력·HTTP 상태/code·DB 전후·스크린샷/시각을 같은 실행 ID에 연결한다. 원래 개인 데이터에는 A_PRIVATE/B_PRIVATE 표식을 넣어 공개 DTO·다른 계정의 응답/DOM에 없음을 확인한다. 실패하거나 차단되면 이후 단계를 통과로 추정하지 않는다.

| 순서 | 실제 행동 | 필수 판정·검증 |
| --- | --- | --- |
| J1 게시/발견 | A 공개 이름→곡 3개 분류와 구간/배속→TRAILS 내 공유에서 수동 게시. free B 로그인→커뮤니티/홈→시트 | share PUT 200(`CommunityRoutes.kt:42`), B 목록/상세 200. 공개 원제·구간·배속·순서 일치, 메모/이메일/녹음 비노출. 카드 개발 주석 없음 |
| J2 반응/무료 거절 | B 좋아요·팔로우 ON/OFF 반복·중복 클릭. UI의 무료 담기 차단 후 직접 API 요청도 확인 | like/follow 200·멱등, UI 클릭 중복 요청 1회. clone API 403 `TIER_UPGRADE_REQUIRED`; B의 songs/categories/song_categories·원장/job·clone_count 무변경. 인증된 프로필을 미리 생성한 뒤 비교 |
| J3 담기/소유권 | O가 동일 B를 pro로 전환→B에 기존 영상 1개→A 폴더 담기→보관함 새로고침/재로그인 | clone 200; imported/alreadyInLibrary/skippedLimit 및 categoryId 응답과 자기 songs/categories GET·화면·DB 일치. A 원본 불변. 기존 곡은 중복 생성 없이 새 분류 연결. A↔B의 개인 곡/분류/노트/세션/녹음 접근 차단을 해당 API 계약으로 검증 |
| J4 재게시/연동 | A 원본 수정→수동 상태 B 공개본 유지→다시 게시 갱신→전체 허용+폴더 ON→추가/삭제/구간 수정→폴더 OFF·전체 OFF 각각 검증 | GET과 shared_folder_items 일치. OFF는 마지막 공개본 보존; ON 전환과 재게시 시 복사 조건 확인(`CommunityService.kt:279,294`, `SharedFolderSync.kt:30,52`). 전체 OFF 뒤 폴더별 표시/재활성화를 독립 확인 |
| J5 철회 | A 철회→B 목록/기존 시트 재조회→B 보관함 확인→A 재공개→원본 분류 삭제 분기 | 철회 즉시 공개 목록 제외·상세 404, is_public/auto_sync false. 담아온 B의 사본은 유지. 원본 분류 삭제 시 공개본 FK cascade 확인. 지연 clone 도중 철회 분기는 J9 |
| J6 집계/모더레이션 | 동의·공개 이름·실효 유료 조합으로 LOG 전체/팔로잉 확인. B 신고→중복→O 조회/숨김/처리/감사 | 집계는 84일이며 개별 세션 게시물이 아님. 비공개 표식 없음. 신고 201·중복 409·비 owner 관리 403, O 숨김 뒤 B 목록 제외/상세 404. 운영 처리 UI 없는 단계는 기존 API로 수행하고 화면 미연결로 기록 |
| J7 유예/재가입 | pro→기준 free→주기 만료 전→만료 후 정리→pro 재가입 | `/me`의 실효 tier와 communityWrite/ai, 공개/auto_sync 및 월/구매 잔액·원장 검증. **override free만으로 즉시 무료가 되지 않음**(`TierService.kt:99`, `AdminService.kt:277`). 재가입 자동 재공개 금지. 시간 분기는 §6의 준비 필요 |
| J8 외부 연동 | 실제 영상 구간 재생·배속/반복→소규모 실재생목록 preview/import→보관함→짧은 Gemini 분석→결과/원장 | 실제 소리·seek 및 API 오류를 링크 값 테스트와 분리. playlist는 200·중복/비공개/한도 건너뜀 수와 저장 일치. Gemini job 예약/성공 정산/실패 반환과 사용자 잔액=원장 합계, 중복 정산 없음. 키 없음 YouTube/Gemini 503·원장/job 불변은 별도 분기 |
| J9 실패/취소/경합 | 아래 §6의 조합 | HTTP 실패·UI 무오염·DB 무변경 또는 이미 커밋된 결과를 함께 기록. 프론트 응답 폐기를 서버 취소로 해석하지 않음 |

`CommunityService.kt:749`의 폴더 담기는 재시도마다 새 분류가 생길 수 있는 계약이다. 중복 영상 연결을 유지하되 clone POST를 멱등이라고 단언하지 않는다. 곡 한도는 부분 복사+skippedLimit, **분류 한도**는 403 `CATEGORY_LIMIT_EXCEEDED` 전면 거절(`:766`). 두 경우를 혼동하지 않는다.

## 6. 실패 매트릭스·미확인 조건

- 좋아요/팔로우/담기/신고 × 성공/실제 서버 거절/전송 후 응답 실패 × 다른 시트/같은 시트 재열기/같은 브라우저 A→B 및 B→A/로그아웃/화면 이탈. 지연 응답은 실서버 응답을 받아 보류한 뒤 이벤트로 해제하고, 새 계정의 상태·안내·신고 폼·상위 카드·busy 잠금이 오염되지 않는지 본다. 임의 sleep 대신 요청 도착·commit 확인·전환 완료·응답 해제 이벤트를 사용한다. 상세/작성자 GET도 같은 방식으로 확인한다(`FolderSheet.tsx:75,87`).
- 응답만 500으로 바꾸면 실제 서버에는 저장됐을 수 있다. **거절 시 무변경** 시험과 **커밋 후 응답 소실** 시험을 나눈다. 게시에는 DB 커밋 후 제목 외부 I/O가 있다(`CommunityService.kt:246,289`). 클라이언트 오류 후 GET 재조회·재시도 중복 여부를 반드시 확인한다.
- DB 비교는 최소 users/profiles(티어/잔액 포함), songs/categories/song_categories, shared_folders(수치/공개 상태), shared_folder_items, folder_likes, follows, folder_reports, analysis_jobs, credit_ledger, admin_audit, sync_outbox 및 관련 외부 객체를 포함한다. 정상 부수효과를 사전 명시하고 거절 요청의 영향 테이블은 행 전체/키/값까지 비교한다. 외부 메타데이터 캐시 video_titles 보완은 도메인 쓰기 거절과 별도 기록한다. `guitar-practice` 자격정보 fallback·다른 app_id 혼입 금지.
- DB 취소는 `DatabaseFactory.kt:123` ensureActive와 연결해 트랜잭션 전/중/커밋 뒤를 구분한다. 브라우저 abort만으로 서버 coroutine 취소·rollback을 증명하지 않는다. clone 메타 I/O 대기 중 철회/티어 변경, 동시 담기·한도 경합, 동시 게시/철회에 결정적 latch·실제 서버 테스트 hook가 필요하다. 현재 외부 endpoint/DI 제어용 실행 harness는 미구현이며 별도 구현 승인 없이는 차단으로 기록한다. `CommunityService.kt:762` 재검사와 실제 단언을 연결한다.
- 시간 경계는 OS 시계를 바꾸지 않는다. `CreditService.kt:360` Clock은 DI지만 현재 main의 env에서 시계를 바꿀 수 없고 TierService/AdminService는 now 인자/실시각을 쓴다. 별도 테스트 runner 또는 격리 DB의 날짜 fixture로 경계 직전/직후를 구성해야 한다. 날짜 fixture·수동 서비스 호출은 운영 cron/OIDC 및 실제 30일 경과 검증과 구분한다. 짧은 override expiry만으로 30일 유예 종료를 대체할 수 없다.
- Gemini 성공은 내부 크레딧 정산과 공급자 실제 청구가 다르다. 키/프로젝트·짧은 영상 입력·호출/비용 상한·공급자 사용량 조회 수단이 확정돼야 실검증 가능. 현재 미확인. 결제·webhook·모바일 실기기는 해당 M4-2/M0-0 관문이며 이번 준비/로컬 통합 결과로 완료 처리하지 않는다.
- 운영 첫 큐레이션/이달의 곡/로그인 분류 추가(#61)는 기존 사용자에게 등록 여부를 읽기 확인할 계정·리비전·콘텐츠 범위부터 필요하다. 최초 인증 GET도 프로필 생성 가능하므로 운영 계정 사용 범위 확인 후 수행. 등록되지 않았다고 추정하지 않으며 쓰기·배포는 별도 승인 대상이다.

## 7. 완료 판정과 실제 조사 검증

AV-3 실행 결과에는 AV-1 §2의 모든 기능을 `구현 / 화면 연결 / 통합 / 운영` 네 열로 옮겨 각각 근거를 붙인다. J1~J9의 핵심 실패/차단은 웹 확장 관문 통과로 처리하지 않는다. 운영 미확인 항목은 통합 통과와 별개로 남긴다. 기능별 재사용/결함/화면 미연결/신규 요구 판정도 유지한다.

이번 실제 수행은 git status/branch·fetch/log/ancestry/코드 diff, GitHub PR·run/jobs 조회, 관련 문서·코드 읽기, Node/JDK/Docker 버전, 환경변수의 **존재 여부만** 조사 및 준비 문서 검증이다. 테스트·빌드·서버·DB·브라우저/OAuth·외부 API·운영 쓰기는 실행하지 않았다. 이후 실행에는 §3의 계정/테스트 프로젝트·외부 호출 범위, §4 기동, §6 시험 harness/시간 fixture를 확정해야 한다.
