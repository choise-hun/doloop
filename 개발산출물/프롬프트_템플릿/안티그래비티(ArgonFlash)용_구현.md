첨부된 명세서와 아래의 도메인 규칙 파일만 준수하여 코드를 구현해라.
[백엔드 작업 시: @docs/rules/backend-kotlin.md 참조]
[프론트 작업 시: @docs/rules/frontend-state.md 참조]
[테스트 작업 시: @docs/rules/testing-security.md 참조]

**절대 규칙**:
1. 명세서에 제공된 골격 코드(트랜잭션, `reqSeq`/`reqToken`, 에러 핸들링)의 구조를 임의로 변경하거나 축약하지 마라.
2. 기존 테스트가 실패할 경우 테스트 단언문(Assertion)을 완화하거나 바꾸지 말고 구현 코드를 수정해라.
3. 구현 완료 후 테스트를 실행하고, 통과 여부만 간략히 보고해라. (아직 완료 처리하지 마라)