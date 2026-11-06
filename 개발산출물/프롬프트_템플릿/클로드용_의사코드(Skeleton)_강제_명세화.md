위 초안을 바탕으로 VS Code 안티그래비티 에이전트(Gemini)가 구현할 세부 작업 명세서를 작성해줘.
제미나이가 설계 실수를 하지 않도록 **핵심 제어 흐름은 줄글 설명 대신 반드시 의사코드(Skeleton Code)로 직접 작성**해줘.

[반드시 코드로 못 박아야 할 부분]
1. **백엔드 동시성/트랜잭션**: 코루틴 `withContext(NonCancellable)` + DB 커밋 선확인 보상 흐름, `FOR UPDATE` 잠금 후 `inList` 삭제, `CancellationException` 재던지기 구조
2. **프론트엔드 비동기/상태**: `uid` 및 `reqSeq`/`reqToken` 캡처 후 `await` 복귀 검증 블록, 상위 상태 변경 시 렌더 타임 `effective*` 동기 정규화 식
3. **단위/E2E 테스트 명세**: 단언문 왜곡(`async () =>` 중첩 등)을 막기 위한 정확한 테스트 단언 코드 골격