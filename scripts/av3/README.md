# AV-3 로컬 실제 서버 검수

운영 DB/스토리지/배포와 분리한다. 세션·계정·스냅샷은 ignored `test-results/av3/` 안에서만 보관한다.

1. `npm run build && ./gradlew installDist --no-daemon`
2. `python3 scripts/av3/local-server.py --youtube` (YouTube key만 `.env`에서 선택 주입, 원격 DB/Storage/Gemini/Job 설정 미상속)
3. `node scripts/av3/preflight.cjs`
4. `node scripts/av3/login.cjs A` → A 실제 Google 로그인. B/O도 차례로 실행. 기본 macOS Chrome/Whale/Playwright Chromium 중 존재하는 브라우저 사용. 별도 프로필·loopback CDP. `AV3_BROWSER_EXECUTABLE`과 `AV3_CDP_PORT`로 격리 창을 바꿀 수 있다.
5. `node scripts/av3/journey.cjs` → `node scripts/av3/extended.cjs` → `node scripts/av3/races.cjs` → `node scripts/av3/profile-races.cjs` → `node scripts/av3/share-races.cjs`. 세 계정이 다르지 않으면 중단. 앱/API 성공 경로 mock 없음. 기본 여정은 빈 fixture DB에서 한 번 실행하며 재실행 전 결과와 데이터 상태를 확인한다.
6. `node scripts/av3/logout-check.cjs`는 실제 Supabase 로그아웃 204·로컬 초기화 뒤 지연 GET을 검사한다. 원본 A refresh 세션이 폐기되므로 필요하면 실제 OAuth로 다시 갱신한다.
7. `node scripts/av3/ops-ownership.cjs`는 격리 DB에만 큐레이션/월 추천 fixture를 만들고 노트·작업·세션 소유권을 검사한다.
8. `./gradlew test --tests 'ulevelp.av3.LiveBoundaryTest' --no-daemon`는 **별도 폐기 DB+실 Netty socket+테스트 JWT/메타데이터**로 취소/경합을 검증한다. Google/실외부 검증과 구별한다.

API/스키마/운영 인증 계약은 바꾸지 않는다. O owner bootstrap·날짜 fixture SQL은 컨테이너 이름/label/loopback 바인딩 확인 후에만 실행한다. noWrite 검증은 video_titles 외 모든 도메인 테이블의 전체 행을 비교한다. 외부 제목 캐시와 도메인 변경을 구분한다. 라이브 Gemini는 키가 없으므로 503 무변경만 검증한다.

CDP default context의 `storageState()`가 빈 origins를 반환할 수 있어, 실제 페이지의 `ulp:auth` 항목만 가져와 로컬 세션 파일로 저장한다. Google 쿠키/비밀번호는 복사하지 않는다. 로그인 자동 감지는 CSP를 바꾸지 않고 `expect.poll`로 앱 상태를 확인한다.

원시 JSON·스크린샷에 개인정보가 포함될 수 있으므로 커밋하지 않는다. 검수 종료 후 해당 작업의 브라우저 프로필/세션 파일을 정리하고 서버를 Ctrl-C로 끝내면 소유한 폐기 DB만 삭제된다. 기존 사용자 브라우저/다른 DB는 종료하지 않는다.

O의 native CDP 창이 정지하거나 Google이 자동 제어 Chromium을 거절하면 `python3 scripts/av3/login-bridge.py`를 사용한다. 이 도구는 임시 public의 SPA 진입만 로그인 전용 페이지로 잠시 바꾸고, **자동 제어 없는 일반 Whale**의 OAuth 결과를 Origin+실행 nonce로 보호한 loopback :3104에서 받아 :3103 Ktor로 JWT를 확인한 뒤 복원한다. A/B와 다른 O만 저장한다. 운영 앱/인증 설정은 변경하지 않는다. 사용 중 다른 검수는 동시에 실행하지 않는다.

반복 계정 전환 매트릭스는 실제 Google 로그인 세션의 `auth.setSession`으로 SDK의 계정 변경 이벤트를 검증한다. 매번 서버 signOut을 실행하면 원본 refresh 세션이 폐기되어 다음 케이스를 방해하므로 실제 로그아웃은 반복 매트릭스와 별도로 마지막에 검증한다. 로그인 세션을 다시 받을 때는 `AV3_REAUTH=1 node scripts/av3/login.cjs A`(B도 동일)를 사용한다. 이미 Google에 로그인된 일반 브라우저의 OAuth가 자동 복귀할 수 있다.

기존 폐기 DB를 비우고 여정을 다시 시작하려면 먼저 증거를 보관하고 `AV3_RESET_FIXTURE=1 node scripts/av3/journey.cjs`를 쓴다. 명시된 labelled loopback DB의 users/하위 테이블만 초기화하며 Google Auth 계정은 삭제하지 않는다. 전체 실패 기록은 ignored attempt 파일로 보존한다.

외부 검사: `node scripts/av3/youtube-live.cjs`, `python3 scripts/av3/gemini-server.py`. Gemini는 기존 프로젝트 Secret Manager 키를 메모리/env에만 주입한 별도 loopback :3105 서버에서 10초 구간 작업 **1건**을 요청한다. 기존 클라이언트의 재시도는 가능하다. 공급자 청구 대시보드 검증과 내부 크레딧 정산은 구분한다.

대기 중 서버가 종료되고 DB만 남은 경우 `python3 scripts/av3/local-server.py --resume --youtube`로 labelled/loopback/명시적 외부 마운트 없음·Postgres 기본 익명 volume만 있는지 확인한 뒤 같은 DB를 재사용한다. --resume 종료 시 기존 DB는 보존된다. 기존 fixture를 재사용하는 ops 검사는 생성 전 이전 시도의 완료 지점과 IDs를 확인한다.

AV-F3 안전 주의: Playwright의 outputDir은 `test-results/playwright`로 격리한다. `test-results/` 전체를 출력 경로로 지정하면 AV-3 인증·증거가 삭제되므로 사용하지 않는다. 단독 CLI 실행도 `--output=test-results/playwright`를 명시한다.
