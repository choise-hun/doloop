# Gemini (Antigravity) Agent Operating Rules

코드를 작성하거나 수정하기 전에 작업 도메인에 해당하는 규칙 파일만 먼저 읽고, 그 안에 정의된 [필수 코드 템플릿]을 그대로 복제하여 사용해라.

1. Kotlin/Ktor 백엔드 및 DB 작업 시: docs/rules/backend-kotlin.md 필독
2. 프론트엔드(frontend/src/, public/) 및 UI 작업 시: docs/rules/frontend-state.md 필독
3. 단위/E2E 테스트, 보안, 배포 스크립트 작업 시: docs/rules/testing-security.md 필독

## 최상위 절대 원칙 (Global Invariants)
- 조회 격리: 모든 DB 조회는 app_id = 'ulevelp' 조건을 필수로 포함한다 (guitar-practice 데이터 폴백 금지).
- 하위 호환: 레거시 API(/api/chord 등)의 응답/에러 포맷({ error })을 절대 변경하지 않는다. { ok, source, status, code, message }는 /api/v1에만 사용한다.
- Git 위생: 작업 명세에 없는 파일, 미사용 import/DTO, 타 step의 커밋을 섞지 않는다. 완료 전 git status 및 git diff --stat을 반드시 대조한다.
- 인코딩: 모든 파일은 UTF-8(BOM 없음)과 LF 줄바꿈을 유지한다.
