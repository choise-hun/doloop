# AV-3 마감 및 게시

## 목표·입력·승인

- 2026-11-09 사용자 승인: 완료 AV-F3 수정·AV-3 검수 마감, 기존 코드/도구/문서 보존, 실제 diff와 명세·회귀 대조, 필수 증거 부족만 최소 보강. 통과한 실계정·외부 분석·로그인은 반복하지 않는다.
- Git: 검증·비밀값/인증자료 제외 후 논리 단위 커밋·push·main PR·CI 종료 확인. 머지는 사용자. 배포·운영 데이터 쓰기·추가 유료 분석·CH-A 구현 제외.
- 입력: `결과/AVF3_재검수.md`, `완료/진행_AVF3_재검수.md`, `결과/AV3_사용자여정검수.md`, 문서 운영 및 frontend-state/testing-security 규칙.
- 시작: `audit/av3-user-journey`, HEAD `4a6df1c`, 원격 main `cb4565c`. 기존 열린 PR 없음. main은 현재 HEAD의 후손이며 별도 문서 규칙 보완을 포함한다. 기존 미커밋 제품2/설정1/문서2와 미추적 AV 도구·테스트·기록 보존. 협업 없음.
- 시작 파일 해시는 ignored `test-results/av3-closeout/input-manifest.json`, 마감 전 인수인계 전문은 `완료/인수인계_메모_AV3마감전_2026-11-09.md`에 보존한다.

## 완료 기준

수정 코드와 검증 근거 연결, 로컬 실제 차단/운영 확인/신규 요구 구분, AV-3 로컬 판정 및 웹 확장 조건 확정, 인수인계 현재화, PR/CI 종료 확인. 다음 후보 CH-A는 미착수로 유지한다.

## 실행·결과

- Git 상태/브랜치/remote 확인, fetch 성공. 관련 기존 PR 없음·열린 PR 없음. `git log --left-right HEAD...origin/main`에 main의 문서 보완/머지 3건만 존재.
- 실제 auth/설정 diff와 완료 파일의 수정 명세 대조: 서버/API/DB/export/공개 함수 시그니처 변경 없음. 기존 변경을 수정하지 않았다.
- 현재 source-manifest의 제품/테스트/설정/빌드 9개 SHA-256 모두 실제 파일과 일치. 기존 실계정 JSON의 pass 단언: 프로필4/확장24/토글8/언어8/시트48/내 공유12/smoke12, 실제 logout204+지연 폐기1, preflight 통과 확인. 새로 실행한 검수로 계산하지 않는다.
- 과거 원시 증거/O 인증 유실은 복구 주장 없이 유지. AV-3 기존 여정 기록과 현재 영향 검수로 판정하고, 새 필수 결함/부족이 확인될 때만 보강한다.

## 다음 행동

1. 판정/미실행 분류와 문서 링크·인코딩·비밀값 제외 검사.
2. 검증된 변경 커밋·push·main PR, CI 결과 확인. 실패하면 원인만 보완.
3. 완료 기록으로 이동하고 인수인계와 실제 활성 파일 목록을 맞춘다. 다음 작업은 사용자 머지 후 CH-A 명세·구현 범위 선택이며 이번에는 착수하지 않는다.

- 게시 준비: 제품/도구/기존 검수·마감 문서를 `a76f0ac`으로 커밋. 원격 main 병합 중 인수인계만 충돌하여 현재 마감 상태와 main의 종료 인계 규칙 보완을 함께 보존했다. 사용자 변경 삭제/리베이스/force push 없음.
- 게시 검사: staged 37파일 UTF-8 BOM 없음/LF, 현재 링크, credential/실이메일 패턴, 인증/덤프/캡처 제외·ignore 확인, Python AST/JS syntax·diff --check 통과. 초기 보안 스캔은 ignored pycache를 읽어 디코딩 실패하여 staged 파일만 대상으로 정정했다. 제품 테스트 실패가 아니다.

## 게시 상태

- 제품/검수/문서 커밋 `a76f0ac`, main 보존 병합 `6565948`. `git push -u origin audit/av3-user-journey` 성공.
- [PR #141](https://github.com/choise-hun/doloop/pull/141), base main, OPEN/MERGEABLE 확인. [제품 CI run 42528629190](https://github.com/choise-hun/doloop/actions/runs/42528629190) 진행 중.
- 시작 입력 manifest 대조: 제품2/설정/도구/테스트/준비·완료 기록은 원본과 동일. 변경은 현재 판정 주석 3문서·인수인계·계획뿐. 기존 main AI 규칙·문서 운영은 PR diff 0으로 보존.

## 다음 세션 시작 지시

```text
목표: 계획 CH-A(CAGED 블럭 UI 이동·모양, 시퀀스 격자 제거·재생 보존)를 상세 명세부터 구현·검증한다.
선행: PR #141의 CI 성공·사용자 머지를 실제 확인한다. 미머지면 CH-A 구현은 시작하지 않고 머지 대기로 보고한다. git 상태·현재 브랜치·원격 main을 확인하고 사용자 변경을 보존한다.
범위: 인수인계와 계획 CH-A, 요구사항 REQ-1/AC-1, 화면 규칙·정렬 규격을 실제 코드와 대조한다. 신규 진행 파일과 상세 화면 명세를 만든 뒤 승인 범위에서 구현한다. 완료 AV-3/AV-F3 검수는 반복하지 않는다.
완료 기준: CAGED 배치·모양과 시퀀스 격자 제거의 수용 기준, 기존 재생 보존, 배치 spec 실패→구현→통과→스크린샷 확인 및 결과 기록. 운영 미검증은 별도로 유지한다.
Git 처리: 관련 검증·비밀값 제외 확인 후 논리 단위 커밋·push·main PR·CI 종료 확인까지 허용한다. 머지·배포·운영 데이터 쓰기·추가 유료 분석은 하지 않는다.
```

이 시작 지시는 다음 작업 제안이며 이번 마감 세션의 CH-A 실행 승인이 아니다.

## CI에서 발견한 검수 도구 불일치 보강

- 최초 run 42528629190: Node22/24 각399, Kotlin(새 LiveBoundary4 포함), Docker 성공. E2E 406 pass/8 fail, CI ok failure.
- 실패 8건은 `test/e2e/av2-community.spec.js:53~60`의 account 전환만 발생. mock은 SIGNED_IN B 이벤트를 내보내지만 `support/mock-app.js:90~95`의 SDK getSession은 고정 A를 반환했다. 실제 auth의 전송 전 SDK 조회가 A를 반환하자 B 프로필 요청이 무효화된다. 실제 SDK/실계정 회귀와 다른 fixture 상태다.
- 변경 범위/명세: AV-2 account 분기에서 SDK getSession도 SIGNED_OUT 때 null, SIGNED_IN 때 B로 맞춘다. 현재 프로필·SDK uid=B 추가 단언, 기존 시트/지연/카드/중복 잠금 단언 모두 유지. 제품/API/DB/공유 mock 헬퍼 변경 없음.
- 새 CI 실패가 있어 해당 8건만 로컬 보강 검증 후 커밋·push·PR CI 재확인한다. 성공했던 실계정/외부 분석/로그인은 반복하지 않는다.

- 보강 결과: `npx playwright test test/e2e/av2-community.spec.js --grep account --output=test-results/playwright` **8 통과**(기존 8 실패 분기). 로그 `test-results/av3-closeout/av2-account.txt`, diff 검사 통과.

## 사용자 추가 지시 — PR 리뷰와 규칙 (2026-11-09)

- CI 중 도착한 PR 리뷰도 참고하고 처리 방법을 규칙에 반영하도록 사용자 승인. 리뷰/라인/일반 코멘트를 조회했으며 댓글 전송/리액션/resolve/추가 리뷰 호출은 하지 않는다.
- [P1 세션 참조](https://github.com/choise-hun/doloop/pull/141#discussion_r4508006407), [P2 독립 PATCH](https://github.com/choise-hun/doloop/pull/141#discussion_r4508006409), 리뷰 커밋 `6565948`: 현재 소스에도 유효. 인증 SDK의 동일 uid 새 객체는 정상이며 참조 비교가 현재 오류/완료 처리를 버린다. 공통 seq의 전송 전 검사도 다른 필드 PATCH를 취소한다.
- 새 로컬 차단 2건을 회귀로 검증할 때까지 최종 통과 확정을 보류한다. 명세 보강: 기존 공개 함수 시그니처 유지, 읽기 전용 `auth.getSessionGeneration(): number` 추가해 설정 토글/언어 큐/Drive 완료는 세대로 판별. 프로필 PATCH는 호출 시 계정 세대를 보관하고 순차 실행 직전 세대 확인→요청 순번 할당→토큰 조회/전송/응답 가드. 같은 계정의 독립 PATCH는 순차 저장/각 현재 실패 반환, 계정 변경 후 대기 요청은 전송하지 않음. GET↔실행 중 PATCH의 최신 순서 규칙 유지.
- docs/문서_운영 §5에 리뷰 확인 시점·대상 커밋 대조·반영/미반영/이미 해소/범위 밖 기록·실패 회귀·최신 CI·댓글 권한 경계를 추가. AGENTS/CLAUDE/GEMINI는 공통 규칙을 참조한다.

- P1/P2 실패 회귀: `review-unit-before.txt` 기존26 pass/추가3 fail, `review-callers-before.txt` 새 화면6 fail. 세대 조회가 없던 회귀1과 겹친 PATCH 순차성2를 포함한다.
- PATCH 계정 경계 보강 회귀도 새 계정이 이전 응답 대기열에 막히는 1 fail을 확인했다(`review-queue-session-before.txt`). uid 전환/로그아웃 때 큐를 분리하고, 이전 queued 작업은 세대 검사로 전송하지 않도록 수정했다.
- 현재 `node --test test/auth-races.test.js` 30 pass, `npm test` 403 pass/0 fail/skip/cancel, build 성공. 관련 화면71 pass(세대/직렬화 보강), 최종 큐 분리 뒤 AV2/AVF3 영향 범위만 추가 검사 중. 기존 실계정 통합은 보강 전 근거로 구별하고 재로그인/분석을 반복하지 않는다.

- 최종 영향 검사: build 성공, AV2 40+AVF3 14 = **54 통과**. 두 독립 설정의 성공/첫 실패 연속 저장을 실제 auth 모듈+mock 서버 값/화면으로 단언했다. 리뷰 P1/P2 모두 반영·관련 로컬 회귀 통과하여 로컬 판정을 통과로 복원한다. 최신 게시 CI는 별도 확인한다.
