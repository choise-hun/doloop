# GR-2: Kotlin 블로킹 `httpClient.send` 전환 및 `ArchitectureGuardrailTest` 활성화

- **일시:** 2026-11-06
- **PR:** #92 (`step/GR-2` → `main`)
- **입력:** `개발산출물/진행_가드레일.md`, `개발산출물/결과/GR-0_위반정리.md`
- **목적:** `GR-0`에서 확정한 Kotlin 코루틴 내 블로킹 `httpClient.send(` 7개 파일 11곳을 전수 `httpClient.sendAsync(...).await()` (`kotlinx.coroutines.future.await`)로 전환하고, `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt`를 활성화하여 검증한다.

---

## 1. 바꾼 파일 표

| 파일 경로 | 구분 | 변경 내용 |
| --- | --- | --- |
| `src/main/kotlin/ulevelp/auth/SupabaseJwtVerifier.kt` | 수정 | `HttpJwksProvider.resolveKey`의 `httpClient.send`를 `sendAsync(...).await()`로 전환하고 `CancellationException` 재전파 보장 |
| `src/main/kotlin/ulevelp/notion/NotionClient.kt` | 수정 | `downloadExternalFile`, `executeJsonRequest`, `executeMultipartUpload` 3곳의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt` | 수정 | 로컬 함수 `fetchDatabase`를 `suspend fun`으로 선언하고 `fetchDatabase` 및 `users/me` 조회 2곳의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/main/kotlin/ulevelp/service/VideoDurationClient.kt` | 수정 | `YoutubeDataVideoClient.durationSec`의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/main/kotlin/ulevelp/service/VideoMetaClient.kt` | 수정 | `YoutubeOEmbedClient.fetch`의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/main/kotlin/ulevelp/service/YoutubePlaylistClient.kt` | 수정 | `YoutubeDataPlaylistClient.get`의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/main/kotlin/ulevelp/storage/SupabaseStorageClient.kt` | 수정 | `download` 및 `executeRequest` 2곳의 `httpClient.send`를 `sendAsync(...).await()`로 전환 |
| `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt` | 신규 | `개발산출물/가드레일_초안/ArchitectureGuardrailTest.kt.txt`를 `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt`로 활성화 |

---

## 2. 확인 명령 출력

### 2.1 수정 전 `ArchitectureGuardrailTest` 실행 (실패 확인)
```text
ArchitectureGuardrailTest > 코루틴 내에서 HttpClient의 블로킹 send 호출을 금지한다 (PR 27)() FAILED
    org.opentest4j.AssertionFailedError: HttpClient 블로킹 send() 호출 감지:
    src/main/kotlin/ulevelp/auth/SupabaseJwtVerifier.kt:131 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/notion/NotionClient.kt:137 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/notion/NotionClient.kt:181 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/notion/NotionClient.kt:244 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt:95 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt:174 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/service/VideoDurationClient.kt:49 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/service/VideoMetaClient.kt:43 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/service/YoutubePlaylistClient.kt:93 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/storage/SupabaseStorageClient.kt:102 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.
    src/main/kotlin/ulevelp/storage/SupabaseStorageClient.kt:127 -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.

ArchitectureGuardrailTest > 타 앱 데이터(guitar-practice) 폴백 참조를 금지한다 (PR 8)() PASSED
ArchitectureGuardrailTest > Exposed newSuspendedTransaction에 디스패처를 직접 인자로 전달하지 않는다 (PR 12)() PASSED
3 tests completed, 1 failed
```

### 2.2 수정 후 `./gradlew test` 전체 실행 (통과 확인)
```text
> Task :test

ArchitectureGuardrailTest > 코루틴 내에서 HttpClient의 블로킹 send 호출을 금지한다 (PR 27)() PASSED
ArchitectureGuardrailTest > 타 앱 데이터(guitar-practice) 폴백 참조를 금지한다 (PR 8)() PASSED
ArchitectureGuardrailTest > Exposed newSuspendedTransaction에 디스패처를 직접 인자로 전달하지 않는다 (PR 12)() PASSED
...
TierQuotaAdminApiTest > A1 관리 API 권한 - 토큰 없음 401, 일반 403, owner 200() PASSED
TierQuotaAdminApiTest > Q5 분류 한도 - 무료 2개 403·업그레이드 안내, pro_plus 맨 위는 nextTier null() PASSED
TierQuotaAdminApiTest > Q1 me 응답 - 무료 기본 티어·한도·사용량·크레딧() PASSED

BUILD SUCCESSFUL in 1m 7s
5 actionable tasks: 1 executed, 4 up-to-date
```

---

## 3. 명세와 달라진 점

- 없음 (`GR-0_위반정리.md` §3의 수정 방안 및 8개 파일 목록과 1:1 일치).

---

## 4. 다음 step에 넘길 것 (GR-3)

- `개발산출물/가드레일_초안/{backend-kotlin.md, frontend-state.md, testing-security.md}`를 `docs/rules/`로 활성화하고, `GEMINI.new.md` 내용을 기존 `GEMINI.md`에 비파괴 병합한 뒤 `CLAUDE.md` 연결 및 `개발산출물/가드레일_초안/`·`개발산출물/진행_가드레일.md`를 정리한다.
