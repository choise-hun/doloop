# 결과 — `LG-1` (서버·배포·CI 전환 및 B3 E2E 보강)

- **작성일:** 2026-11-07
- **담당:** 시니어 (`# 시니어 (Gemini 임시 운용)`)
- **브랜치:** `step/LG-1` (base `main`)
- **진행 파일:** `개발산출물/진행_레거시정리.md` (`LG-1`)

## 1. Pre-flight 5대 관문 점검 결과

| 관문 | 점검 결과 | 근거 `file:line` |
| --- | --- | --- |
| ① 격리·호환 (`app_id = 'ulevelp'` 및 `/api/v1` vs 레거시 `/api/*` 에러 포맷) | **통과** — DB 조회 격리(`app_id = 'ulevelp'`) 및 레거시 화성 API(`/api/*`) `{ error }` 응답 포맷 불변 | `src/main/kotlin/ulevelp/Main.kt:303-326,338,368-379`, `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt:60-71` |
| ② 동시성·트랜잭션 (`docs/rules/backend-kotlin.md` 및 E2E 레이스) | **통과** — 백엔드 DB 트랜잭션/코루틴 취소 코드 무변경. `test/e2e/beta-badge.spec.js:48`에 `await page.evaluate(() => document.fonts.ready)` 추가로 B3 웹폰트 리플로우 레이스 제거 | `test/e2e/beta-badge.spec.js:46-51` |
| ③ 전제 실재성 (`file:line` 직접 열람 및 연쇄 함정 방어) | **통과** — `ci.yml` `deploy-pages` 9개 HTML 명시 고정, `ChordEngineTest.kt` `spaPublicDir()` 전환, `server.js` ES 모듈 엔진(`frontend/src/lib/engine/*.mjs`) 전환 | `.github/workflows/ci.yml:184`, `src/test/kotlin/ulevelp/ChordEngineTest.kt:178,292,306,316-346`, `server.js:7-8` |
| ④ 작업 줄 충돌 (`진행_프론트기반.md` 및 열린 PR) | **통과** — 주니어 줄 `완료/진행_프론트기반.md` 전체 완료, 열린 PR 0건 | `gh pr list --state open` |
| ⑤ 메뉴얼 게이트 (사전 승인표 일치) | **통과** — `진행_레거시정리.md` §2-2 `[Step 1] LG-1`의 10개 파일과 `git diff --stat` 100% 일치 | 아래 §2 표 참조 |

## 2. 바꾼 파일 표 (총 10개 수정 + 결과·진행 문서)

| # | 파일 경로 | 구분 | 변경 요약 |
| --- | --- | --- | --- |
| 1 | `src/main/kotlin/ulevelp/Main.kt` | 수정 | `DEFAULT_ALLOWED_ORIGINS`를 `"https://ulevelp-d5ympfsmfq-du.a.run.app"`, `DEFAULT_PUBLIC_APP_URL`을 `"https://ulevelp-d5ympfsmfq-du.a.run.app/"`로 변경. `Application.module`에서 `uiMode` 파라미터 및 `spaEnabled` legacy 분기 제거, `SPA_ENTRY_PAGES` 요청 시 항상 `spa.html` 서빙, 시작 로그에 `UI mode: spa` 출력 |
| 2 | `src/test/kotlin/ulevelp/ChordEngineTest.kt` | 수정 | 정적 서빙 테스트(`:178,292,306`)에 `publicDir = spaPublicDir()` 주입, `Z5`(`ULP_UI=legacy`) 제거, `Z6`를 `spa.html` 부재 시 진입 경로 `404 NotFound` 검증으로 갱신 |
| 3 | `server.js` | 수정 | `./frontend/src/lib/engine/voicing.mjs`·`theory.mjs` 로드로 전환, `SPA_MODE`(`ULP_UI === 'spa'`) 분기 제거하여 항상 `dist/` SPA 서빙 |
| 4 | `scripts/deploy-cloudrun.sh` | 수정 | 기본 `ALLOWED_ORIGINS`를 `https://ulevelp-d5ympfsmfq-du.a.run.app`으로 변경, `ULP_UI` 환경변수 제거, 완료 안내에 `id="root"` 확인 명령 추가 |
| 5 | `.github/workflows/deploy-cloudrun.yml` | 수정 | 기본 `ALLOWED_ORIGINS`를 `https://ulevelp-d5ympfsmfq-du.a.run.app`으로 변경, `ULP_UI` 제거, 배포 스모크에 `curl -fsSL "${SERVICE_URL}/" \| grep -q 'id="root"'` 추가 |
| 6 | `.github/workflows/ci.yml` | 수정 | `e2e-security` 잡에서 `matrix.ui: [legacy, spa]` 제거(단일 SPA E2E 실행), `docker` 잡에서 `Rollback switch (ULP_UI=legacy)` 단계 제거, `deploy-pages` 잡의 `for f in public/*.html 404.html`을 9개 진입 HTML(`progressions.html` 포함) + `404.html` 명시 목록으로 고정 |
| 7 | `playwright.config.js` | 수정 | 상단 주석을 React SPA E2E 및 레이아웃 테스트 기준으로 정리 (`webServer.command: 'node server.js'` 유지) |
| 8 | `test/rz3_spa.test.js` | 수정 | `RZ3-1`~`RZ3-4`를 `ULP_UI` 분기 부재, `server.js` `public/lib` 미참조, 단일 SPA CI·Cloud Run 단일 `ALLOWED_ORIGINS`·`id="root"` 스모크 검증으로 갱신 |
| 9 | `test/pages_redirect.test.js` | 수정 | `fs.readdirSync('public')` 대신 고정 8개 레거시 목록 및 `ci.yml` 9개(`progressions.html` 포함) + `404.html` 루프 검증으로 갱신 |
| 10 | `test/e2e/beta-badge.spec.js` | 수정 | `B3 progressions`에서 `#progTab-video` 전환 후 `await page.evaluate(() => document.fonts.ready)` 대기 추가 |
| 11 | `개발산출물/결과/LG-1_서버배포CI전환.md` | 신규 | `LG-1` 실행 결과 및 다음 step 인계 사항 기록 |
| 12 | `개발산출물/진행_레거시정리.md` | 수정 | `LG-1` 상태 칸 및 다음 세션(`LG-2`) 시작 지시 갱신 |

## 3. 확인 명령 출력

### 3-1. `npm run build && npm test`
```text
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build
✓ 155 modules transformed.
✓ built in 857ms

> guitar-chord-lab@1.0.0 test
> node --test test/*.test.js
ℹ tests 444
ℹ suites 65
ℹ pass 444
ℹ fail 0
ℹ duration_ms 4120.769125
```

### 3-2. `./gradlew test --no-daemon`
```text
ArchitectureGuardrailTest > 코루틴 내에서 HttpClient의 블로킹 send 호출을 금지한다 (PR 27)() PASSED
ArchitectureGuardrailTest > 타 앱 데이터(guitar-practice) 폴백 참조를 금지한다 (PR 8)() PASSED
ArchitectureGuardrailTest > Exposed newSuspendedTransaction에 디스패처를 직접 인자로 전달하지 않는다 (PR 12)() PASSED
ChordEngineTest > Z4 spa_html이 있으면 HTML 진입 경로에 spa_html을 서빙한다() PASSED
ChordEngineTest > Z6 spa_html이 없으면 진입 경로 요청에 404 NotFound를 반환한다() PASSED
...
BUILD SUCCESSFUL in 40s
5 actionable tasks: 4 executed, 1 up-to-date
```

### 3-3. `npx playwright test`
```text
Running 352 tests using 1 worker
  ✓  1 … B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내 (638ms)
  ✓  2 … B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임 (567ms)
  ✓  3 … B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내 (703ms)
  ✓  4 … B4 탭 이름 접근성: 영상 탭 이름에 BETA가 붙어도 탭은 하나로 찾힌다 (630ms)
...
  352 passed (5.1m)
```

## 4. 명세와 달라진 점

- 없음 (`개발산출물/진행_레거시정리.md` §2-1 `LG-D1`~`LG-D6` 및 §2-2 `[Step 1] LG-1` 표와 100% 일치).

## 5. 다음 step(`LG-2`)에 넘길 것

- 서버(`Main.kt`, `server.js`), 배포 스크립트(`deploy-cloudrun.sh`, `deploy-cloudrun.yml`), CI(`ci.yml`), Gradle 테스트(`ChordEngineTest.kt`), Pages 리다이렉트 테스트(`test/pages_redirect.test.js`)가 모두 더 이상 `public/*.html`·`public/lib/*.js`에 의존하지 않도록 전환되었다.
- `LG-2`에서는 `진행_레거시정리.md` §2-2 `[Step 2] LG-2` 표의 37개 파일(`public/` 레거시 파일 25개 삭제 + 구 화면 전용 단위 테스트 3개 삭제 + 혼합 테스트 9개에서 `public/` 참조 제거)을 수행하고, 마지막으로 `git mv 개발산출물/진행_레거시정리.md 개발산출물/완료/` 및 `개발산출물/인수인계_메모.md` 갱신을 같은 PR에서 함께 마무리한다.
