# Backend (Kotlin / Ktor / Exposed) 필수 설계 패턴

부정형 지시 대신 아래의 검증된 코드 템플릿(Positive Pattern)을 사용할 것.

> 제목 옆 `PR #n`·`RECFIX-1` 같은 출처는 규칙이 생긴 리뷰를 가리킨다. `PR #n`은 **옛 저장소 번호**이며 이 저장소(`choise-hun/doloop`)의 PR 번호와 다르다.
> 코드 조각은 패턴을 보여 주는 예시다. 식별자와 시그니처는 적힌 기준 구현 파일에서 확인해 맞춘다.

## 1. Exposed 트랜잭션 & 코루틴 취소 전파 (PR #12)
newSuspendedTransaction(Dispatchers.IO)처럼 디스패처를 단독 인자로 넘기면 부모 Job 계층이 끊긴다. 반드시 아래와 같이 작성한다:

    // [필수 패턴] 부모 컨텍스트 유지 및 취소 시 롤백 보장
    // 기준 구현: src/main/kotlin/ulevelp/db/DatabaseFactory.kt 의 dbQuery — 새로 만들지 말고 이것을 호출한다
    suspend fun <T> dbQuery(db: Database? = null, block: suspend Transaction.() -> T): T =
        withContext(Dispatchers.IO) {
            newSuspendedTransaction(db = db) {
                currentCoroutineContext().ensureActive()
                val result = block()
                currentCoroutineContext().ensureActive()   // 블록 뒤 취소도 커밋 전에 잡는다
                result
            }
        }

## 2. 코루틴 취소 예외(CancellationException) 전파 보장 (PR #24)
suspend 함수 내에서 runCatching이나 catch (e: Exception) 사용 시 취소 예외를 삼키면 안 된다:

    // [필수 패턴] CancellationException 반드시 재던지기
    try {
        optionalSideEffect()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        logger.warn("보조 작업 실패 격리", e)
    }

## 3. 외부 스토리지/원격 자원 + DB 2단계 보상 트랜잭션 (PR #12, #22)
코루틴 취소 시 고아 파일 방지 및 커밋 직후 취소 시 오삭제를 동시에 방어한다:

    // [필수 패턴] NonCancellable + DB 커밋 여부 선확인 후 정리
    val storageKey = storageClient.upload(...)
    try {
        dbQuery { /* DB INSERT 및 커밋 */ }
    } catch (t: Throwable) {
        withContext(NonCancellable) {
            val alreadyCommitted = runCatching { dbQuery { checkRowExists(storageKey) } }.getOrDefault(false)
            if (!alreadyCommitted) {
                runCatching { storageClient.delete(storageKey) }
            }
        }
        throw t
    }

## 4. 잠금(FOR UPDATE) 기반 검사 및 삭제 (PR #33)
동시성 경합 시 고아 리소스 및 Outbox 누락을 막기 위해 잠금 획득 후 조회하고 inList로만 삭제한다:

    // [필수 패턴] 잠금 -> ID 목록 추출 -> inList 삭제
    val targetIds = Table.selectAll().where { condition }.forUpdate().map { it[Table.id] }
    if (targetIds.isNotEmpty()) {
        OutboxTable.insertBatch(targetIds)
        Table.deleteWhere { Table.id inList targetIds }
    }

## 5. HttpClient 비동기 호출 & I/O 디스패처 (PR #8, #27)
- 코루틴 내 java.net.http.HttpClient는 블로킹 send() 금지 -> sendAsync(req, handler).await() 사용.
- 불가피한 블로킹 파일/네트워크 I/O는 반드시 withContext(Dispatchers.IO)로 감싼다.

## 6. 직렬화·파싱·라우팅 불변 조건
- 시각 직렬화: 항상 DateTimeFormatter.ISO_INSTANT.format(t.toInstant()) (...Z) 사용 (+09:00 로컬 오프셋 노출 금지).
- 숫자 파싱: toInt() 대신 toIntOrNull() 사용 (오버플로 500 에러 방지).
- Nullable 덮어쓰기: Upsert/UPDATE 시 입력이 null이어도 기존 값을 유지하지 않고 명세대로 null로 덮어쓴다.
- Multipart 텍스트 파트: FormItem과 FileItem(filename이 붙은 브라우저 Blob)을 모두 허용하되, 한도 + 1 바이트까지만 읽어 초과 시 즉시 400 INVALID_INPUT 반환.
- 404 우선순위: 없는 경로의 404 처리는 인증(401) 미들웨어보다 앞에 둔다.
- 암호화 키 복호화: requireDecrypted* 공통 함수를 재사용하고, 실제 키를 사용하는 분기(verify=true 등)에서만 복호화를 수행한다.
