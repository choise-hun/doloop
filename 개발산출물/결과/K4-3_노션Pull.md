# 결과: K4-3 — 노션 실시간 동기화 — 가져오기(`NotionSyncService.pull`) & 처음 연동(`enable` full 모드) + `apps-script/` 폐기

- **작업일:** 2026-11-01
- **역할:** 주니어
- **브랜치:** `step/K4-3`
- **상태:** `완료`
- **PR:** #25 (예정)

---

## 1. 만든·고친 파일

| 구분 | 경로 | 하는 일 |
| :--- | :--- | :--- |
| 신규 | `src/main/kotlin/ulevelp/notion/NotionSyncService.kt` | 노션 동기화 오케스트레이션 서비스 (`getStatus`, `enable` full 모드, `disable`, `pull` 증분 동기화, 5분 쿨다운, 2분 쿼리 보정, 최대 500페이지 캡, 중복 오디오 방지, outbox 충돌 방지 로컬 우선) |
| 신규 | `src/test/kotlin/ulevelp/notion/NotionPullAndEnableApiTest.kt` | Pull/Enable API 통합 테스트 (PL1~PL10: 401, 미연동 409, 정상 pull, outbox 무한루프 방지, 로컬 우선 보존, full enable, 429 쿨다운, 500페이지 초과, 오디오 쿼터 초과) |
| 수정 | `src/main/kotlin/ulevelp/routes/NotionSyncRoutes.kt` | `GET /status`, `POST /enable`, `POST /disable`, `POST /pull`, `POST /push` 엔드포인트 연결 |
| 수정 | `src/main/kotlin/ulevelp/Main.kt` | `Application.module`에 `notionSyncService` 인스턴스 주입 및 라우트 등록 |
| 수정 | `public/data.js` | `window.ULData.notionSync` (`status`, `enable`, `disable`, `pull`, `push`) 네임스페이스 추가 |
| 수정 | `public/site.js` | 구형 `notion` 객체(`url`, `key`, `ok`, `call`) 및 export 제거 (`gh` 유지) |
| 수정 | `public/settings.html` | 구 `#notion` 섹션 제거, `#keys` 카드 하단에 `#notionSyncPanel` 추가, CSP `connect-src` 갱신 |
| 수정 | `public/settings.js` | 구 `apiUrl`/`apiKey` 핸들러 제거, `#notionSyncPanel` 이벤트(`enable`, `disable`, `pull`, `push`, `status`) 및 순번(`syncStatusSeq`) 처리 |
| 수정 | `public/index.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `public/chords.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `public/practice.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `public/log.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `public/notes.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `public/privacy.html` | CSP `connect-src`에서 `script.google.com`·`script.googleusercontent.com` 제거 |
| 수정 | `test/security.test.js` | CSP `connect-src` 상수 갱신 및 `STORAGE_LEGACY`에서 `pp-api`·`pp-key` 제거 |
| 수정 | `test/data.test.js` | `notionSync` 네임스페이스 단위 테스트 (D24, D25, D26) 추가 |
| 삭제 | `apps-script/Code.gs` | 구형 Google Apps Script 프록시 코드 완전 폐기 |
| 삭제 | `apps-script/README.md` | 구형 Apps Script 문서 완전 폐기 |
| 신규 | `개발산출물/결과/K4-3_노션Pull.md` | 결과 보고서 |
| 수정 | `개발산출물/진행_코틀린서버.md` | 3·5·6·7절 갱신 |

---

## 2. 검증 실행 결과

### 2.1 `./gradlew test --no-daemon` 실행 결과 (끝 30줄)

```text
TakeApiTest > T11 녹음 삭제 - 파일 제거 및 쿼터 반환() PASSED

TakeApiTest > T3 쿼터 사전 거부() STANDARD_OUT
    2026-11-01 22:50:51.210 [DefaultDispatcher-worker-7 @call-context#5698] INFO  io.ktor.test - No ktor.deployment.watch patterns specified, automatic reload is not active.
    2026-11-01 22:50:51.210 [DefaultDispatcher-worker-7 @coroutine#5699] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-111 - Starting...
    2026-11-01 22:50:51.215 [DefaultDispatcher-worker-7 @coroutine#5699] INFO  com.zaxxer.hikari.pool.HikariPool - HikariPool-111 - Added connection org.postgresql.jdbc.PgConnection@64b82c9a
    2026-11-01 22:50:51.215 [DefaultDispatcher-worker-7 @coroutine#5699] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-111 - Start completed.
    2026-11-01 22:50:51.215 [DefaultDispatcher-worker-7 @call-context#5698] INFO  io.ktor.test - Application started in 0.006 seconds.
    2026-11-01 22:50:51.215 [DefaultDispatcher-worker-8 @coroutine#5700] INFO  io.ktor.test - Responding at http://localhost:80
    2026-11-01 22:50:51.215 [DefaultDispatcher-worker-8 @coroutine#5700] INFO  io.ktor.test - Responding at https://localhost:443
    2026-11-01 22:50:51.248 [DefaultDispatcher-worker-8] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-111 - Shutdown initiated...
    2026-11-01 22:50:51.248 [DefaultDispatcher-worker-8] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-111 - Shutdown completed.

TakeApiTest > T3 쿼터 사전 거부() PASSED

TakeApiTest > T7 크기 경계() STANDARD_OUT
    2026-11-01 22:50:51.252 [DefaultDispatcher-worker-8 @call-context#5750] INFO  io.ktor.test - No ktor.deployment.watch patterns specified, automatic reload is not active.
    2026-11-01 22:50:51.253 [DefaultDispatcher-worker-8 @coroutine#5751] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-112 - Starting...
    2026-11-01 22:50:51.257 [DefaultDispatcher-worker-8 @coroutine#5751] INFO  com.zaxxer.hikari.pool.HikariPool - HikariPool-112 - Added connection org.postgresql.jdbc.PgConnection@5edf3e8c
    2026-11-01 22:50:51.257 [DefaultDispatcher-worker-8 @coroutine#5751] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-112 - Start completed.
    2026-11-01 22:50:51.258 [DefaultDispatcher-worker-8 @call-context#5750] INFO  io.ktor.test - Application started in 0.006 seconds.
    2026-11-01 22:50:51.258 [DefaultDispatcher-worker-17 @coroutine#5752] INFO  io.ktor.test - Responding at http://localhost:80
    2026-11-01 22:50:51.258 [DefaultDispatcher-worker-17 @coroutine#5752] INFO  io.ktor.test - Responding at https://localhost:443
    2026-11-01 22:50:51.348 [DefaultDispatcher-worker-18] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-112 - Shutdown initiated...
    2026-11-01 22:50:51.348 [DefaultDispatcher-worker-18] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-112 - Shutdown completed.

TakeApiTest > T7 크기 경계() PASSED

TakeApiTest > T9 mime 파라미터 제거() STANDARD_OUT
    2026-11-01 22:50:51.352 [DefaultDispatcher-worker-18 @call-context#5806] INFO  io.ktor.test - No ktor.deployment.watch patterns specified, automatic reload is not active.
    2026-11-01 22:50:51.352 [DefaultDispatcher-worker-18 @coroutine#5807] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-113 - Starting...
    2026-11-01 22:50:51.356 [DefaultDispatcher-worker-18 @coroutine#5807] INFO  com.zaxxer.hikari.pool.HikariPool - HikariPool-113 - Added connection org.postgresql.jdbc.PgConnection@748f317d
    2026-11-01 22:50:51.356 [DefaultDispatcher-worker-18 @coroutine#5807] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-113 - Start completed.
    2026-11-01 22:50:51.357 [DefaultDispatcher-worker-18 @call-context#5806] INFO  io.ktor.test - Application started in 0.005 seconds.
    2026-11-01 22:50:51.357 [DefaultDispatcher-worker-11 @coroutine#5808] INFO  io.ktor.test - Responding at http://localhost:80
    2026-11-01 22:50:51.357 [DefaultDispatcher-worker-11 @coroutine#5808] INFO  io.ktor.test - Responding at https://localhost:443
    2026-11-01 22:50:51.379 [DefaultDispatcher-worker-18] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-113 - Shutdown initiated...
    2026-11-01 22:50:51.379 [DefaultDispatcher-worker-18] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-113 - Shutdown completed.

TakeApiTest > T9 mime 파라미터 제거() PASSED

TakeApiTest STANDARD_OUT
    2026-11-01 22:50:51.398 [Test worker] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-94 - Shutdown initiated...
    2026-11-01 22:50:51.398 [Test worker] INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-94 - Shutdown completed.

BUILD SUCCESSFUL in 15s
5 actionable tasks: 1 executed, 4 up-to-date
```

### 2.2 `npm test` 실행 결과 (끝 10줄)

```text
✔ 틀린 예 bad-e.js → (e) 검사가 실패한다 (0.055542ms)
✔ 틀린 예 bad-f.js → (f) 검사가 실패한다 (0.065167ms)
✔ 틀린 예 bad-g.js → (g) 검사가 실패한다 (0.065333ms)
✔ 틀린 예 폴더의 파일이 모두 표에 있다 (0.075625ms)
ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 174.397166
```

### 2.3 `npm run test:e2e` 실행 결과

```text
> guitar-chord-lab@1.0.0 test:e2e
> playwright test


Running 9 tests using 1 worker

     1 …/e2e/xss.spec.js:382:1 › E1 첫 화면(index.html) 곡 목록 및 노션 바로가기
  ✓  1 ….spec.js:382:1 › E1 첫 화면(index.html) 곡 목록 및 노션 바로가기 (537ms)
     2 …e/xss.spec.js:401:1 › E2 플레이어(practice.html) 곡 제목 및 곡 목록 서랍
  ✓  2 …ec.js:401:1 › E2 플레이어(practice.html) 곡 제목 및 곡 목록 서랍 (528ms)
     3 …2e/xss.spec.js:417:1 › E3 기록 화면(log.html) 기록 탭·세션 목록·녹음 URL
  ✓  3 …pec.js:417:1 › E3 기록 화면(log.html) 기록 탭·세션 목록·녹음 URL (528ms)
     4 …› test/e2e/xss.spec.js:438:1 › E4 기록 화면(log.html#songs) 곡 보관함 탭
  ✓  4 …2e/xss.spec.js:438:1 › E4 기록 화면(log.html#songs) 곡 보관함 탭 (515ms)
     5 ….spec.js:455:1 › E5 곡 상세 화면(log.html?song=...) 타임라인 및 A/B 비교
  ✓  5 …:455:1 › E5 곡 상세 화면(log.html?song=...) 타임라인 및 A/B 비교 (585ms)
     6 …est/e2e/xss.spec.js:476:1 › E6 설정 화면(settings.html) 계정 프로필 표시
  ✓  6 …xss.spec.js:476:1 › E6 설정 화면(settings.html) 계정 프로필 표시 (534ms)
     7 [chromium] › test/e2e/xss.spec.js:493:1 › E7 대조군(검출기 작동 확인)
  ✓  7 …mium] › test/e2e/xss.spec.js:493:1 › E7 대조군(검출기 작동 확인) (683ms)
     8 …c.js:512:1 › E8 설정 화면(settings.html) 노션 백업 ZIP 미리보기 XSS 검사
  ✓  8 …:1 › E8 설정 화면(settings.html) 노션 백업 ZIP 미리보기 XSS 검사 (563ms)
     9 …568:1 › E9 설정 화면(settings.html) 외부 연동 키 상태·점검 결과 XSS 검사
  ✓  9 …E9 설정 화면(settings.html) 외부 연동 키 상태·점검 결과 XSS 검사 (546ms)
  9 passed (5.5s)
```

---

## 3. 명세와 달라진 점

1. **Exposed 컬럼 섀도잉 방지 명시:**
   - `NotionSyncTable.update` 내부에서 `it[lastPullAt] = nowUtc` 작성 시, 메서드 내부의 로컬 변수 `lastPullAt: OffsetDateTime?`으로 바인딩되어 Exposed 컬럼 setter 타입 오류가 발생하였습니다. `it[NotionSyncTable.lastPullAt] = nowUtc`로 컬럼 테이블을 명시적으로 한정하여 해결하였습니다.
2. **PL8 429 쿨다운 테스트 단언 방식:**
   - `ApiTestSupport.kt`의 `assertStandardError` 헬퍼 함수는 `retryAfter is JsonNull`을 강제 단언하므로, 429 응답에서 남은 초(정수)를 반환하는 PL8 검증에서는 헬퍼 대신 JSON을 직접 파싱하여 `status == 429`, `code == "RATE_LIMITED"`, `retryAfter in 1..300`을 검증하였습니다.
3. **`test/data.test.js` D25 테스트 mock opts 검증:**
   - GET 요청인 `window.ULData.notionSync.status()`는 `apiFetch(path)` 호출 시 `opts`를 생략하므로 mock 환경에서 `env.apiCalls[0].opts`는 `undefined`로 평가되어 이를 일치하도록 단언하였습니다.
4. **PL6 DB 타임스탬프 정밀도 손실 방지 (SECONDS 단위 절삭):**
   - JVM의 `OffsetDateTime.now(ZoneOffset.UTC)`는 나노초 정밀도(9자리)를 가지지만 PostgreSQL의 `TIMESTAMP WITH TIME ZONE`은 마이크로초(6자리) 정밀도이므로, DB 저장 후 읽어온 `lastPullAt`의 ISO 직렬화 문자열이 테스트의 원본 나노초 문자열과 불일치하여 CI에서 500 오류가 발생했습니다. 테스트 셋업 시 `truncatedTo(ChronoUnit.SECONDS)`로 정규화하고 `Instant.parse()`로 시간값을 비교하도록 보완하였습니다.

---

## 4. D0가 쓸 값

- `NotionSyncService` 인터페이스/클래스:
  - `getStatus(userId: String): NotionSyncStatusDto`
  - `enable(userId: String): NotionSyncStatusDto` (full 모드 최초 연동, songs/sessions/takes 순차 가져오기)
  - `disable(userId: String): NotionSyncStatusDto` (연동 해제 및 lease 정리)
  - `pull(userId: String, force: Boolean = false): NotionSyncPullResultDto` (증분 동기화, 5분 쿨다운, 2분 lookback)
- 엔드포인트:
  - `GET /api/v1/notion/sync/status`
  - `POST /api/v1/notion/sync/enable`
  - `POST /api/v1/notion/sync/disable`
  - `POST /api/v1/notion/sync/pull`
  - `POST /api/v1/notion/sync/push`
- 프런트엔드 네임스페이스:
  - `window.ULData.notionSync`: `status()`, `enable()`, `disable()`, `pull(force)`, `push()`
- 폐기 완료 사항:
  - `apps-script/` 디렉토리 완전 삭제 (`apps-script/Code.gs`, `apps-script/README.md`)
  - 7개 HTML 및 `test/security.test.js` CSP에서 `script.google.com`·`script.googleusercontent.com` 완전 제거
  - `public/site.js`에서 `window.ULSite.notion` 객체 및 export 완전 제거

---

## 5. 주니어 셀프 체크리스트 점검 표

| 번호 | 체크 항목 | 준수 여부 | 확인 증적 |
| :---: | :--- | :---: | :--- |
| 1 | Outbox 무한 루프 방지: Pull/Enable 시 `enqueueIfSyncEnabled` 미호출 | 준수 | `NotionSyncService.kt` 전체에서 `enqueueIfSyncEnabled` 호출 없음, PL5 테스트 통과 |
| 2 | 로컬 우선 보존: `sync_outbox` 미처리 항목(`done_at IS NULL AND attempts < 5`) 덮어쓰기 방지 | 준수 | `NotionSyncService.kt:625` 충돌 검사 로직 및 PL6 테스트 통과 |
| 3 | CSP 도메인 일치: 7개 HTML 및 `security.test.js`에서 apps-script 도메인 제거 | 준수 | 7개 HTML 및 `test/security.test.js` 일치, `npm test` 63개 통과 |
| 4 | 레거시 스토리지 키 정리: `STORAGE_LEGACY`에서 `pp-api`·`pp-key` 제거, `sn-token`·`sn-repo` 보존 | 준수 | `test/security.test.js:33` 허용 목록 수정 및 통과 |
| 5 | 비동기 호출 실패 처리 및 사용자 안내 (빈 catch 없음) | 준수 | `settings.js` 내 에러 시 안내 문구 표출 |
| 6 | 동일 화면 다중 요청 시 지연 응답 버리기 (`syncStatusSeq`) | 준수 | `settings.js`에 `syncStatusSeq` 증가 및 일치 검증 적용 |
| 7 | apps-script 디렉토리 완전 삭제 | 준수 | `apps-script/` 파일 삭제 확인 |
| 8 | 테스트 단언 완화 금지 및 거짓 완료 금지 | 준수 | 10개 신규 테스트(PL1~PL10) 및 기존 전수 테스트 실제 실행 및 통과 |
