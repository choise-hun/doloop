# GR-1: JS 가드레일 위반 수정 및 `test/guardrail_checklist.test.js` 활성화

- **일시:** 2026-11-06
- **PR:** #91 (`step/GR-1` → `main`, CI 통과: run `42161649489`)
- **입력:** `개발산출물/진행_가드레일.md`, `개발산출물/결과/GR-0_위반정리.md`
- **목적:** `GR-0`에서 확정한 JS 단위 테스트(`assert.rejects` 내부 `async` 래퍼) 및 Playwright E2E(`waitForTimeout`) 위반을 수정하고, `test/guardrail_checklist.test.js`를 활성화하여 검증한다.

---

## 1. 바꾼 파일 표

| 파일 경로 | 구분 | 변경 내용 |
| --- | --- | --- |
| `test/data.test.js` | 수정 | 248행 `D3 keepalive 오류` 테스트의 `assert.rejects(async () => ...)`를 `() => ...`로 변경 |
| `test/e2e/layout.spec.js` | 수정 | 24행 `waitForTimeout(300)`을 `document.fonts.ready` + `requestAnimationFrame` 2회 페인트 대기로 교체 |
| `test/e2e/layout/settings.spec.js` | 수정 | 164행, 178행 `waitForTimeout(200)`을 `requestAnimationFrame` 2회 페인트 대기로 교체 |
| `test/e2e/xss.spec.js` | 수정 | 376행 `E7 대조군` 테스트의 `waitForTimeout(200)`을 `expect.poll(() => page.evaluate(() => window.__cspViolations.length)).toBeGreaterThanOrEqual(2)`로 교체 |
| `test/e2e/support/layout-check.js` | 수정 | 410행 `openState` 내 `waitForTimeout(200)`을 `requestAnimationFrame` 2회 페인트 대기로 교체 |
| `test/guardrail_checklist.test.js` | 신규 | `개발산출물/가드레일_초안/guardrail_checklist.test.js.txt`를 `test/guardrail_checklist.test.js`로 활성화 |

---

## 2. 확인 명령 출력

### 2.1 `node --test test/guardrail_checklist.test.js`
```text
✔ 미디어 요소의 src에 빈 문자열("")을 할당하여 초기화하지 않는다 (PR #19) (51.0472ms)
✔ Playwright E2E spec 파일에서 module.exports 사용 및 waitForTimeout 추측 대기를 금지한다 (PR #20, #28) (6.109ms)
✔ 단위 테스트에서 assert.rejects 내부에 async () => 래퍼를 씌워 동기 예외를 가리지 않는다 (PR #13) (11.7111ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 152.9304
```

### 2.2 `node --test test/data.test.js`
```text
✔ D3 keepalive 오류: fetch 실패 시 404 NOT_FOUND 에러 객체 reject (0.6622ms)
...
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 116.2009
```

### 2.3 Playwright E2E (`layout.spec.js`, `xss.spec.js`, `layout/settings.spec.js`)
```text
# Legacy 모드 (layout.spec.js + xss.spec.js)
  ok 36 [chromium] › test\e2e\layout.spec.js:18:3 › L1 390px 전 화면 가로 스크롤 0건 (3.3s)
  ok 37 [chromium] › test\e2e\layout.spec.js:18:3 › L1 768px 전 화면 가로 스크롤 0건 (3.0s)
  ok 38 [chromium] › test\e2e\layout.spec.js:18:3 › L1 1280px 전 화면 가로 스크롤 0건 (3.1s)
  ...
  ok 45 [chromium] › test\e2e\xss.spec.js:362:1 › E7 대조군(검출기 작동 확인) (633ms)
  ...
  15 passed (43.8s)

# SPA 모드 (ULP_UI=spa, test/e2e/layout/settings.spec.js)
Running 35 tests using 1 worker
···································
  35 passed (25.1s)
```

---

## 3. 명세와 달라진 점

- 없음 (`GR-0_위반정리.md` §2의 수정 방안 및 6개 파일 목록과 1:1 일치).

---

## 4. 다음 step에 넘길 것 (GR-2)

- PR #89(`fix/GR-appid`) 머지 후 `main`에서 분기하여 `GR-0_위반정리.md` §3에 정리된 Kotlin 블로킹 `httpClient.send(` 7개 파일 11곳을 `httpClient.sendAsync(...).await()`로 전환하고 `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt`를 활성화한다.

