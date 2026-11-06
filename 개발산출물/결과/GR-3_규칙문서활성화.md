# GR-3: 가드레일 규칙 문서 활성화 및 GEMINI.md·CLAUDE.md 병합 완료

- **일시:** 2026-11-06
- **입력:** `개발산출물/결과/GR-0_위반정리.md`, `개발산출물/가드레일_초안/*`, 선행 PR #92 머지
- **완료 기준:** `docs/rules/` 규칙 문서 3종 활성화, `GEMINI.md` 및 `CLAUDE.md` 병합 및 참조 연결, `ArchitectureGuardrailTest` 및 `guardrail_checklist.test.js` 검증 통과, `진행_가드레일.md` 완료 처리

---

## 1. 바꾼 파일 목록

| 파일 경로 | 구분 | 변경 내용 |
| --- | --- | --- |
| `docs/rules/backend-kotlin.md` | 신규 | Kotlin/Ktor/Exposed 백엔드 필수 설계 패턴(트랜잭션, 코루틴 취소 전파, 비동기 HttpClient 등) 공식 문서화 |
| `docs/rules/frontend-state.md` | 신규 | 프론트엔드 상태/UI 필수 패턴(비동기 레이스 방어, 렌더 타임 정규화, 미디어 요소 초기화 등) 공식 문서화 |
| `docs/rules/testing-security.md` | 신규 | 테스트/보안/인프라 가드레일(단언 왜곡 금지, SSRF/CSP, 결정적 이벤트 대기 등) 공식 문서화 |
| `GEMINI.md` | 수정 | 도메인별 필수 규칙(`docs/rules/*.md`) 필독 안내 및 최상위 절대 원칙(Global Invariants 4항목)을 기존 주니어 역할·실수방지 가드레일과 비파괴 병합 |
| `CLAUDE.md` | 수정 | `도메인별 필수 규칙 (docs/rules/)` 절을 신설하여 백엔드/프론트엔드/테스트 도메인별 필수 템플릿 참조 연결 |
| `개발산출물/인수인계_메모.md` | 수정 | 진행 중 파일 목록에서 `진행_가드레일.md`를 완료 목록(`완료/진행_가드레일.md`, 마지막 PR #93)으로 이동 반영 |
| `개발산출물/진행_가드레일.md` → `개발산출물/완료/진행_가드레일.md` | 이동 | 제목 아래 완료 표기(`> **완료 2026-11-06** — 마지막 PR #93`), 단계 표 GR-2·GR-3 상태 갱신 후 `완료/`로 이동 |
| `개발산출물/가드레일_초안/` | 삭제 | `ArchitectureGuardrailTest`, `guardrail_checklist.test.js`, `docs/rules/*`, `GEMINI.new.md` 정식 반영 완료에 따른 임시 초안 디렉터리 정리 |

---

## 2. 확인 명령 및 실행 결과

### 2.1 JS 가드레일 검사 (`test/guardrail_checklist.test.js`)
```
$ node --test test/guardrail_checklist.test.js
✔ 미디어 요소의 src에 빈 문자열("")을 할당하여 초기화하지 않는다 (PR #19) (52.7599ms)
✔ Playwright E2E spec 파일에서 module.exports 사용 및 waitForTimeout 추측 대기를 금지한다 (PR #20, #28) (13.6193ms)
✔ 단위 테스트에서 assert.rejects 내부에 async () => 래퍼를 씌워 동기 예외를 가리지 않는다 (PR #13) (27.3844ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 163.0526
```

### 2.2 Kotlin 아키텍처 가드레일 검사 (`ArchitectureGuardrailTest.kt`)
```
$ ./gradlew test --tests *ArchitectureGuardrailTest*
> Task :test

ArchitectureGuardrailTest > 코루틴 내에서 HttpClient의 블로킹 send 호출을 금지한다 (PR 27)() PASSED

ArchitectureGuardrailTest > 타 앱 데이터(guitar-practice) 폴백 참조를 금지한다 (PR 8)() PASSED

ArchitectureGuardrailTest > Exposed newSuspendedTransaction에 디스패처를 직접 인자로 전달하지 않는다 (PR 12)() PASSED

BUILD SUCCESSFUL in 8s
5 actionable tasks: 1 executed, 4 up-to-date
```

### 2.3 `docs/rules/` 문서 생성 및 링크 검증
```
$ Get-Item docs/rules/*.md | Select-Object Name, Length, FullName
Name                Length FullName
----                ------ --------
backend-kotlin.md     3553 C:\seokhunchoi_Ax_Fullstack\ULevelP\docs\rules\backend-kotlin.md
frontend-state.md     2925 C:\seokhunchoi_Ax_Fullstack\ULevelP\docs\rules\frontend-state.md
testing-security.md   1689 C:\seokhunchoi_Ax_Fullstack\ULevelP\docs\rules\testing-security.md
```

---

## 3. 명세와 달라진 점

- 없음. 사전 확정된 계획(`GR-0_위반정리.md` §4 및 `진행_가드레일.md`)대로 `docs/rules/` 활성화, `GEMINI.md`와 `CLAUDE.md` 병합/연결, 임시 초안 폴더 정리, 진행 파일의 `완료/` 이동이 100% 일치하게 수행됨.

---

## 4. 다음 단계 및 인수인계 사항

- 가드레일 도입 작업(GR-0 ~ GR-3)이 모두 완료되었습니다.
- 본 PR(#93) 머지 후:
  - 이후 진행되는 모든 백엔드·프론트엔드 작업은 `docs/rules/*.md` 내 검증된 템플릿(Positive Pattern)을 기본 준수해야 합니다.
  - CI 파이프라인에서 JS 가드레일(`node --test test/guardrail_checklist.test.js`) 및 Kotlin 가드레일(`ArchitectureGuardrailTest`)이 자동 실행되어 회귀를 원천 방지합니다.
  - 다음 작업: `진행_프론트기반.md` (주니어 줄: M4-1 코드 재해석 프리셋 구현) 또는 `진행_운영화면.md` (시니어 줄: M2-4b 큐레이션 편집 화면)
