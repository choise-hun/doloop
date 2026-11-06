# Testing, Security & Ops 필수 규칙

## 1. 테스트 단언문(Assertion) 왜곡 절대 금지 (PR #8, #11, #13, #33)
- 비동기 인터페이스(Promise 반환 함수)가 동기로 throw하는 버그를 잡기 위해 assert.rejects에 async () =>를 씌우지 않는다:

    // 금지: 동기 예외를 Promise reject로 둔갑시킴
    await assert.rejects(async () => apiCall());

    // [필수 패턴]: 함수 호출 래퍼만 전달하여 동기 throw 발생 시 테스트가 실패하게 함
    await assert.rejects(() => apiCall());

- A || B 형태로 항상 참이 되는 단언 금지.
- 사전 차단(400/409) 테스트는 HTTP 상태 코드뿐 아니라 스토리지(fake.objects) 및 DB 행이 0건(무변경)임을 함께 단언한다.
- E2E 테스트에서 waitForTimeout 같은 임의 sleep 금지 -> page.waitForResponse 등 결정적 이벤트 대기만 사용한다.
- test/e2e/*.spec.js 파일 내부에서 헬퍼 함수를 module.exports로 내보내지 않는다 (별도 support/ 파일로 분리).

## 2. 보안 및 인프라 가드레일 (PR #9, #25, #27, #31)
- SSRF 방어: 외부 연동 다운로드 시 신뢰된 호스트 및 https:// 스킴만 허용하고 임의의 external.url은 즉시 건너뛴다.
- CSP & CORS: 운영 설정에 localhost, 127.0.0.1 포함 금지. API 출처 변경 시 config.js와 HTML meta connect-src를 동시 갱신한다.
- Cloud Run Jobs: containerOverrides 호출 시 이미지 기본 ENTRYPOINT를 덮어쓰는 args 대신 env만 전달한다.
- 상호 인증(OIDC): 서버 검증용 환경변수와 스케줄러 호출용 audience URL은 배포 스크립트 내 단일 변수로 일원화한다.
