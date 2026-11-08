# AV-3 실제 사용자 여정 검수 — 1차 실행 완료·인수 보류

## 목표·승인·입력

- 2026-11-08 사용자: “로그인 정도는 할 수 있어. 나머지 자동화해서 수행하자”. AV-3 로컬 환경·검수 도구 구현/실행, 격리 DB의 역할/티어/fixture 준비 승인. Google 로그인은 사용자 진행.
- 운영 DB/Storage/Notion/Drive 쓰기·배포·Git 게시 제외. 기존 Supabase Google Auth 연결을 이용하되 운영 앱으로의 OAuth redirect는 브라우저에서 차단하고 로컬 callback만 사용한다. 앱 인증 가드·API·스키마 계약 변경 없음.
- 기존 준비 문서 4개 로컬 변경을 보존한 채 `fix/av2-community`에서 `audit/av3-user-journey` 생성. 앱 코드 기준 `4a6df1c`는 `origin/main cb4565c`와 동일. 협업 없음.
- 입력: [준비 결과](../결과/AV3_검수준비.md), 문서 운영, backend-kotlin/frontend-state/testing-security. 검수 기준은 준비 결과 §5~6.

## 구현 전 검수 도구 범위

- `scripts/av3/`: 로컬 PostgreSQL 16과 Ktor+SPA 기동/종료, 실제 로그인 세션의 로컬 보관·자동 검수. 기존 mock E2E와 분리. 세션·토큰·사용자 이메일·로컬 DB 스냅샷은 ignored `test-results/av3/`(0700/0600)에만 보관, 게시 금지.
- 서버는 loopback, 폐기 DB 컨테이너 신규 생성·영구 volume 없음. 운영 DATABASE_URL/Job URI/Storage secret 암묵 상속 없음. 기존 public 설정과 `.env`에서 필요한 URL/YouTube key만 선택, 키 원문 출력 금지.
- A/B/O 로그인 후 실제 `/me` sub/role/tier를 비교하고 로컬 O owner bootstrap→관리 API 티어 변경→실제 브라우저/HTTP/DB 일치 검수. 성공 경로의 API는 fulfill mock 사용 안 함.
- 최초 로컬 key 미설정503을 먼저 검증한 뒤, 기존 GCP Secret Manager 키로 10초 구간 실분석 1건을 추가 수행했다. 키 출력/파일 저장 없음. 공급자 청구 대시보드 미확인.

## 현재 단계·실행

- 착수: git status/branch 확인·기존 변경 보존, 새 브랜치 생성.
- 선행 CI 재조회: #140 merge `cb4565c` run 42476331952 completed/success. #139 merge `653c2c2` run 42476310111 completed/failure(Docker Build image), Node/Kotlin/E2E 성공. 원인은 Docker 내부 Gradle 배포 ZIP 다운로드 10,000ms read timeout. 새 코드 수정/CI 재실행 안 함. 최신 main 성공과 이전 merge 실패를 구별한다.
- 실제 환경: `python3 scripts/av3/local-server.py --youtube`, :3103 Ktor + PostgreSQL16 폐기 컨테이너 `ulevelp-av3-db`(label/loopback 확인). `test-results/av3/runtime.json`에 PID/포트, 로그/비밀 세션은 ignored 0700/0600.
- A/B는 실제 Google OAuth/native Whale, O는 자동 제어 Chromium의 Google 거절·native CDP 창 정지로 `login-bridge.py` 일반 Whale/loopback callback에서 실제 JWT를 Ktor로 검증해 확보. 사용자 비밀번호/Google 쿠키를 복사하지 않음. 임시 SPA는 bridge 종료 후 원본 복원.
- 빌드 `npm run build`, `./gradlew installDist --no-daemon` 성공. preflight: SPA/assets/health/비인증401×3/DB불변/FlywayV9 통과.
- `AV3_RESET_FIXTURE=1 node scripts/av3/journey.cjs`: J0~J6 7개 통과. 앞선 도구 시행의 같은 hash 재이동 시 시트 유지·following/recent 중복 locator 오류는 도구에서 full reload/첫 카드 선택으로 수정, 원시 실패 결과 attempt 파일 보존. 앱 코드 미변경.
- `node scripts/av3/extended.cjs`: LOG 동의/120초 집계·유예 종료/재가입/원장·키 미설정503 무변경·분류한도403 전체 DB불변 4개 통과. 시간 fixture를 실제 cron/30일 경과로 승격하지 않음.
- `./gradlew test --tests 'ulevelp.av3.LiveBoundaryTest' --no-daemon`: 실 Netty socket+별도 폐기 DB+테스트 JWT/메타데이터로 철회 재검사·분류한도 동시 clone·동시 좋아요·부모 취소 rollback 4/4 통과(0 skip). `CreditApiTest`도 16/16 통과, fake 외부/시간주입 한계 유지.
- 실제 FolderSheet 지연 매트릭스 48/48, 내 공유 계정 전환 12/12 통과. 반복 전환은 SDK setSession, 실제 logout 204는 별도 검증했다.
- 전역 `/me` GET/PATCH 양방향 전환 4건, 실제 logout→B→늦은 A GET 1건 **실패**. 세션은 새 계정인데 auth.getMe는 이전 계정이 됨. AV-F3로 기록, 실패 단언/exit1 유지. 제품 코드를 수정하지 않음.
- 실 Gemini :3105는 Secret Manager 키를 메모리/env로만 전달, 10초 작업 1건 done·9예약/1정산·원장/잔액/실노트 표시 통과 후 종료. 실제 YouTube 목록13→10저장/3unavailable, 임베드 가능한 샘플의 재생/0.75/loop/unmuted 통과. 최초 제한 영상 차단도 별도 기록.
- 로컬 큐레이션/월 추천 홈·중복/초과/비 owner 거절 DB불변, 실제 노트/작업/세션/원장 소유권, 노트 목록/상세/본문 통과.
- 대기 후 :3103 프로세스 종료를 확인했다. 기존 label/loopback/Postgres 기본 익명 volume DB를 검사하고 `--resume --youtube`로 동일 DB를 복구, A/B native 세션을 추가 사용자 로그인 없이 다시 읽고 남은 검증만 수행했다. DB 데이터/앞선 실패·성공 증거 보존.
- 종료: ignored `final-db-snapshot.json` 보관 후 이 작업의 resumed Ktor supervisor만 종료. --resume DB는 보존, :3104/:3105 bridge/실분석 서버는 이미 종료. 재개 시 PID/포트를 다시 확인한다.
- 1차 자동 검수 실행은 완료, 서비스 인수는 AV-F3와 미실행 조건 때문에 보류. 상세 명령/실제 결과/미실행/근거는 [결과](../결과/AV3_사용자여정검수.md)에 유지한다. 이 기록은 완료/에 보관하고 계획의 AV-3 관문은 통과시키지 않는다.

## 완료 기준

- 준비 결과 J1~J9의 실행/차단·증거를 기능별 구현/화면/통합/운영 표와 연결. 계정 A↔B 분리·거절 DB 불변·지연 결과 무오염·철회/복사/재게시를 실제 서버로 확인한다.
- Git status/diff·도구 구문/관련 검증 확인. 운영 쓰기·배포·게시 미실행 명시. 사람 대기 시 이 파일에 현재 프로세스/로그인 방법·다음 명령을 유지한다.


## 다음 행동·재개

1. AV-F3를 수정 범위로 확정하고 [결과 §3](../결과/AV3_사용자여정검수.md#3-새-결함-av-f3--전역-프로필-지연-응답의-계정-격리-실패)의 원인·uid/세대/순서 가드를 짧은 수정 명세와 실패 회귀로 고정한다. 현재 승인만으로 제품 수정/게시 범위를 확대하지 않는다.
2. 기존 로컬 변경·`audit/av3-user-journey`를 보존한다. 이번 준비/실행 기록은 미게시 상태이므로 다른 PC가 git으로 수신했다고 가정하지 않는다. Git 처리 범위는 사용자가 정한다.
3. 재검수 때 `test-results/av3/runtime.json`과 실제 docker/프로세스를 확인하고 동일 폐기 DB면 `python3 scripts/av3/local-server.py --resume --youtube`를 사용한다. 계정은 `node scripts/av3/login.cjs A`/B로 native 현재 세션을 읽으며 필요할 때만 `AV3_REAUTH=1` 실제 OAuth를 한다. O는 `login-bridge.py` 일반 브라우저 경로, Google 자동화 거절 우회 금지. 세션이 없는 PC에서는 로그인만 사용자 참여한다.
4. 5개 실패→통과, 성공/실패/동일 계정 GET↔PATCH 순서, 주요 실여정 및 결과 §5의 남은 전송/취소 조건을 검증한다. 운영 쓰기/배포/외부 청구/실기기/실결제는 별도 범위로 유지한다.
