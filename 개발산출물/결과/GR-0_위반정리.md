# GR-0: 가드레일 위반 전수 점검 및 수정 방안 확정

- **일시:** 2026-11-06
- **입력:** `개발산출물/진행_가드레일.md`, `개발산출물/가드레일_초안/*`
- **목적:** 가드레일 테스트(`test/guardrail_checklist.test.js`, `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt`) 활성화 시 실패하는 위반 항목을 전수 실측하고, GR-1·GR-2·GR-3의 구체적 수정 방안과 대상 파일 목록을 확정한다.

---

## 1. 위반 전수 실측 및 항목별 수정 방안 요약

| 구분 | 검사 항목 | 상태 | 위반 건수 | 확정 방안 | 처리 단계 |
| --- | --- | --- | --- | --- | --- |
| JS | 미디어 요소 빈 `src` 할당 (`.src = ""`) | 통과 | 0건 | 변경 없음 | — |
| JS | E2E `.spec.js` 내 `module.exports` 사용 | 통과 | 0건 (`support/`에만 존재) | 변경 없음 | — |
| JS | 단위 테스트 `assert.rejects(async () => ...)` | **위반** | 1곳 (`test/data.test.js:248`) | `async () =>` 래퍼를 `() =>`로 변경 | GR-1 |
| JS | E2E `.spec.js` 내 `waitForTimeout` 사용 | **위반** | 3개 파일 4곳 (+ `support/layout-check.js` 1곳) | `requestAnimationFrame` 2회 페인트 대기 또는 `expect.poll`로 교체 | GR-1 |
| Kotlin | `newSuspendedTransaction(Dispatchers.*)` | 통과 | 0건 | 변경 없음 | — |
| Kotlin | `guitar-practice` 참조 금지 | **해결됨** | 0건 (PR #89 `fix/GR-appid`) | PR #89에서 `VALID_APP_IDS = {"ulevelp"}` 및 K10 테스트 교체 완료 | PR #89 |
| Kotlin | 코루틴 내 블로킹 `httpClient.send(` 금지 | **위반** | 7개 파일 10곳 | 전수 `httpClient.sendAsync(...).await()` (`kotlinx.coroutines.future.await`)로 전환 | GR-2 |
| 문서 | `docs/rules/*` 활성화 및 `GEMINI.md` 병합 | 대기 | — | `docs/rules/` 생성 후 `GEMINI.new.md` 내용을 기존 `GEMINI.md`에 비파괴 병합 | GR-3 |

---

## 2. GR-1 상세: JS 위반 수정 및 `test/guardrail_checklist.test.js` 활성화

### 2.1 `test/data.test.js` (`assert.rejects` 내부 `async` 래퍼 제거)
- **위치:** `test/data.test.js:247-249` (`D3 keepalive 오류` 테스트)
- **원인:** `await assert.rejects(async () => env.ULData.saveProgress(...), ...)` 형태로 작성되어 있어, `saveProgress`가 동기 예외를 던져도 Promise rejection으로 감싸져 버그를 가릴 수 있음 (`guardrail_checklist.test.js:65` 정규식 `/assert\.rejects\s*\(\s*async\s*\(\s*\)\s*=>/g`에 검출됨).
- **수정 방안:** `async () =>`를 `() =>`로 변경.
  ```js
  await assert.rejects(
    () => env.ULData.saveProgress({ songId: 's', date: '2026-10-30' }, { keepalive: true }),
    (err) => { ... }
  );
  ```

### 2.2 Playwright E2E `waitForTimeout` 제거 (3개 `.spec.js` 파일 4곳 + `support/layout-check.js` 1곳)
- **위반 위치 및 상세 수정 방안:**
  1. `test/e2e/layout.spec.js:24`
     - **현재:** `await page.goto(p, { waitUntil: 'load' }); await page.waitForTimeout(300);`
     - **수정:** 폰트 로드 및 레이아웃/페인트 안정화 대기로 교체:
       ```js
       await page.evaluate(() => document.fonts.ready);
       await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
       ```
  2. `test/e2e/layout/settings.spec.js:164, 178` (2곳)
     - **현재:**
       - 164행: `details.open = true` 펼침 직후 `await page.waitForTimeout(200);`
       - 178행: `document.fonts.ready` 직후 `await page.waitForTimeout(200);`
     - **수정:** `await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));`로 브라우저 리플로우·리페인트 완료를 결정적으로 대기.
  3. `test/e2e/xss.spec.js:376` (`E7 대조군(검출기 작동 확인)` 테스트)
     - **현재:** `insertAdjacentHTML`로 인라인 이벤트·스타일 삽입 후 `securitypolicyviolation` 이벤트 수신을 위해 `await page.waitForTimeout(200);` 호출 후 `window.__cspViolations.length >= 2` 단언.
     - **수정:** Playwright의 `expect.poll`을 사용해 이벤트가 수집될 때까지 결정적으로 폴링 대기:
       ```js
       await expect
         .poll(() => page.evaluate(() => window.__cspViolations.length))
         .toBeGreaterThanOrEqual(2);
       ```
  4. (함께 정리) `test/e2e/support/layout-check.js:410`
     - 가드레일 정규식 대상(`*.spec.js`)은 아니지만 동일한 `waitForTimeout(200)` 패턴이므로 `requestAnimationFrame` 2회 대기로 함께 정리하여 E2E 전체에서 `waitForTimeout`을 완전 제거.

### 2.3 GR-1 변경 파일 목록 (6개)
| 파일 경로 | 구분 | 변경 내용 |
| --- | --- | --- |
| `test/data.test.js` | 수정 | 248행 `assert.rejects(async () => ...)` → `() => ...` |
| `test/e2e/layout.spec.js` | 수정 | 24행 `waitForTimeout(300)` → `fonts.ready` + `requestAnimationFrame` 2회 |
| `test/e2e/layout/settings.spec.js` | 수정 | 164행, 178행 `waitForTimeout(200)` → `requestAnimationFrame` 2회 |
| `test/e2e/xss.spec.js` | 수정 | 376행 `waitForTimeout(200)` → `expect.poll(...)` |
| `test/e2e/support/layout-check.js` | 수정 | 410행 `waitForTimeout(200)` → `requestAnimationFrame` 2회 |
| `test/guardrail_checklist.test.js` | 신규 | `개발산출물/가드레일_초안/guardrail_checklist.test.js.txt` 이동/활성화 |

---

## 3. GR-2 상세: Kotlin 블로킹 `httpClient.send` 수정 방안 확정 및 가드레일 활성화

### 3.1 설계 결정: `withContext(Dispatchers.IO)` 감싸기 vs `sendAsync(...).await()`
- **결정: 10곳 전수 `httpClient.sendAsync(req, handler).await()` (`kotlinx.coroutines.future.await`)로 전환한다.**
- **근거:**
  1. **가드레일 테스트 기준 일치:** `ArchitectureGuardrailTest.kt` 42~57행은 AST/컨텍스트와 무관하게 `\bhttpClient\s*\.\s*send\s*\(` 정규식으로 `httpClient.send(` 호출 자체를 금지하며, 안내 메시지에서도 `"블로킹 send() 대신 sendAsync(...).await()를 사용하세요."`를 요구한다. 또한 현재 10곳 중 9곳은 이미 `withContext(Dispatchers.IO)` 내부에 있음에도 위반으로 검출된다.
  2. **코루틴 취소 즉시 반응 및 I/O 스레드 점유 해소:** `java.net.http.HttpClient.send`는 응답이 올 때까지 OS 스레드를 블로킹하지만, `sendAsync(...).await()` (`kotlinx-coroutines-jdk8`, Kotlin 2.2.21 기본 코루틴 라이브러리에 이미 포함되어 있으며 `GeminiClient.kt:120`·`AnalyzeJobDispatcher.kt:65,90`에서 사용 중)는 `CompletableFuture` 기반으로 동작하여 스레드를 점유하지 않고 코루틴 취소 시 즉시 `CancellationException`으로 풀린다.
  3. **예외 언래핑 주의사항 (`kotlinx.coroutines.future.await()` 동작):**
     - `CompletableFuture.await()`는 내부에서 `ExecutionException` / `CompletionException`의 `cause`를 자동으로 벗겨서(unwrap) 원래 예외(`IOException`, `HttpTimeoutException` 등)를 그대로 던진다.
     - 따라서 기존 `catch (e: IOException)`, `catch (e: HttpTimeoutException)`, `catch (e: CancellationException)` 블록의 예외 타입 매칭이 `send()` 때와 1:1로 동일하게 유지된다.

### 3.2 파일별 10곳 상세 수정 내역

| # | 파일 경로 | 줄 번호 | 메서드 / 컨텍스트 | 수정 내용 |
| --- | --- | --- | --- | --- |
| 1 | `src/main/kotlin/ulevelp/auth/SupabaseJwtVerifier.kt` | 131 | `HttpJwksProvider.resolveKey` | `import kotlinx.coroutines.future.await` 추가, `httpClient.send(req, ...)` → `httpClient.sendAsync(req, ...).await()` (`runCatching` 내부에서 취소 예외가 삼켜지지 않도록 `catch (e: CancellationException) { throw e }` 보강) |
| 2 | `src/main/kotlin/ulevelp/notion/NotionClient.kt` | 137 | `HttpNotionClient.downloadExternalFile` | `import kotlinx.coroutines.future.await` 추가, `httpClient.send(req, BodyHandlers.ofByteArray())` → `httpClient.sendAsync(req, BodyHandlers.ofByteArray()).await()` |
| 3 | `src/main/kotlin/ulevelp/notion/NotionClient.kt` | 181 | `HttpNotionClient.executeJsonRequest` | `httpClient.send(reqBuilder.build(), BodyHandlers.ofString())` → `httpClient.sendAsync(reqBuilder.build(), BodyHandlers.ofString()).await()` |
| 4 | `src/main/kotlin/ulevelp/notion/NotionClient.kt` | 244 | `HttpNotionClient.executeMultipartUpload` | `httpClient.send(req, BodyHandlers.ofString())` → `httpClient.sendAsync(req, BodyHandlers.ofString()).await()` |
| 5 | `src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt` | 95 | `HttpIntegrationCheckClient.checkNotion` (`fetchDatabase`) | `import kotlinx.coroutines.future.await` 추가, 로컬 함수 `suspend fun fetchDatabase`로 선언 후 `httpClient.sendAsync(req, BodyHandlers.ofString(StandardCharsets.UTF_8)).await()` |
| 6 | `src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt` | 174 | `HttpIntegrationCheckClient.checkNotion` (`users/me`) | `httpClient.sendAsync(userReq, BodyHandlers.ofString(StandardCharsets.UTF_8)).await()` |
| 7 | `src/main/kotlin/ulevelp/service/VideoDurationClient.kt` | 49 | `YoutubeDataVideoClient.durationSec` | `import kotlinx.coroutines.future.await` 추가, `httpClient.sendAsync(request, BodyHandlers.ofString(StandardCharsets.UTF_8)).await()` |
| 8 | `src/main/kotlin/ulevelp/service/VideoMetaClient.kt` | 43 | `YoutubeOEmbedClient.fetch` | `import kotlinx.coroutines.future.await` 추가, `httpClient.sendAsync(request, BodyHandlers.ofString(StandardCharsets.UTF_8)).await()` |
| 9 | `src/main/kotlin/ulevelp/service/YoutubePlaylistClient.kt` | 93 | `YoutubeDataPlaylistClient.get` | `import kotlinx.coroutines.future.await` 추가, `httpClient.sendAsync(request, BodyHandlers.ofString(StandardCharsets.UTF_8)).await()` |
| 10 | `src/main/kotlin/ulevelp/storage/SupabaseStorageClient.kt` | 102, 127 | `SupabaseStorageClient.download`, `executeRequest` | `import kotlinx.coroutines.future.await` 추가, 102행(`download`) 및 127행(`executeRequest`) 2곳 모두 `httpClient.sendAsync(request, ...).await()`로 전환 |

> **참고:** `SupabaseStorageClient.kt`는 `download`(102행)와 `executeRequest`(127행) 2곳에 `httpClient.send(`가 있으므로 실제 코드 내 호출 지점은 총 **7개 파일 11곳**이다. GR-2에서 11곳 모두 `sendAsync(...).await()`로 전환한다.
> 또한 GR-2 브랜치는 `guitar-practice` 제거가 반영된 PR #89가 `main`에 머지된 뒤 분기하여 `ArchitectureGuardrailTest`의 3개 테스트가 모두 통과하도록 한다.

### 3.3 GR-2 변경 파일 목록 (8개)
| 파일 경로 | 구분 | 변경 내용 |
| --- | --- | --- |
| `src/main/kotlin/ulevelp/auth/SupabaseJwtVerifier.kt` | 수정 | 131행 `sendAsync(...).await()` 전환 + `CancellationException` 전파 보장 |
| `src/main/kotlin/ulevelp/notion/NotionClient.kt` | 수정 | 137, 181, 244행 `sendAsync(...).await()` 전환 |
| `src/main/kotlin/ulevelp/service/IntegrationCheckClient.kt` | 수정 | `fetchDatabase`를 `suspend fun`으로 변경 및 95, 174행 `sendAsync(...).await()` 전환 |
| `src/main/kotlin/ulevelp/service/VideoDurationClient.kt` | 수정 | 49행 `sendAsync(...).await()` 전환 |
| `src/main/kotlin/ulevelp/service/VideoMetaClient.kt` | 수정 | 43행 `sendAsync(...).await()` 전환 |
| `src/main/kotlin/ulevelp/service/YoutubePlaylistClient.kt` | 수정 | 93행 `sendAsync(...).await()` 전환 |
| `src/main/kotlin/ulevelp/storage/SupabaseStorageClient.kt` | 수정 | 102, 127행 `sendAsync(...).await()` 전환 |
| `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt` | 신규 | `개발산출물/가드레일_초안/ArchitectureGuardrailTest.kt.txt` 이동/활성화 |

---

## 4. GR-3 상세: 규칙 문서 활성화 및 `GEMINI.md`·`CLAUDE.md` 병합 계획

1. `개발산출물/가드레일_초안/{backend-kotlin.md, frontend-state.md, testing-security.md}` 3개 파일을 `docs/rules/` 아래로 이동하여 활성화한다.
2. `docs/rules/`가 생성된 뒤 `개발산출물/가드레일_초안/GEMINI.new.md`의 도메인별 필독 안내(`docs/rules/*.md`)와 최상위 절대 원칙(Global Invariants 4항목)을 기존 `GEMINI.md`(주니어 역할·세션 규칙)를 유지한 채 섹션으로 합친다.
3. `CLAUDE.md`에도 `docs/rules/*.md` 참조 연결을 추가하고, 임시 폴더 `개발산출물/가드레일_초안/`을 정리한 뒤 `개발산출물/진행_가드레일.md`를 `개발산출물/완료/`로 이동한다.
