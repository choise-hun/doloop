# 결과 — LG-2: `public/` 레거시 파일 삭제 및 테스트 정리

- **작성일:** 2026-11-07
- **작성자:** 시니어 (Gemini 임시 운용)
- **브랜치 / PR:** `step/LG-2` → `main` (PR #127)
- **근거 진행 파일:** `개발산출물/완료/진행_레거시정리.md` §2-2 (`[Step 2] LG-2`)

---

## 1. Pre-flight 5대 관문 점검 결과

| 관문 | 점검 항목 | 확인 결과 (`file:line` 증거) |
| --- | --- | --- |
| ① 격리·호환 | `app_id = 'ulevelp'` 격리 및 `/api/v1` vs 레거시 API 에러 포맷 경계 | 백엔드 API·DB 쿼리 변경 없음. `src/test/kotlin/ulevelp/ArchitectureGuardrailTest.kt`의 `app_id = 'ulevelp'` 및 에러 포맷 가드레일 테스트 무수정 통과 |
| ② 동시성·트랜잭션 | 백엔드 `suspendTx`/코루틴 취소/보상 트랜잭션 및 프론트 레이스 방어 | 백엔드 코루틴·트랜잭션 및 프론트엔드 런타임 컴포넌트 수정 없음. `test/e2e/xss.spec.js:409-457`의 K5-2 계정 전환·로그아웃 레이스 방어 E2E 테스트 그대로 유지 및 통과 |
| ③ 전제 실재성 | 삭제 대상 28개 파일 및 수정 대상 9개 혼합 테스트의 `file:line` 직접 열람 | `git ls-files public/`(총 27개 중 25개 삭제, `public/config.js`·`public/icon-180.png` 2개 유지) 및 `test/` 하위 12개 파일의 `public/` 참조 전수 확인 완료 |
| ④ 작업 줄 충돌 | 열린 주니어 PR(`step/*`) 및 진행 파일 충돌 여부 | `gh pr list --state open` 결과 열린 PR 0건, 열린 주니어 진행 파일 없음(충돌 0건) |
| ⑤ 메뉴얼 게이트 | 3개 이상 파일 변경·파일 경로 삭제 사전 승인 여부 | `개발산출물/완료/진행_레거시정리.md` §2-2에 삭제 대상 28개·수정 대상 9개 파일 표가 사전 승인되어 등재됨 |

---

## 2. 변경 파일 내역

### 2-1. 삭제한 파일 (총 28개)

| 구분 | 삭제 파일 목록 | 비고 |
| --- | --- | --- |
| `public/*.html` (8개) | `public/index.html`, `public/practice.html`, `public/chords.html`, `public/log.html`, `public/notes.html`, `public/note.html`, `public/settings.html`, `public/privacy.html` | Ktor `Main.kt` 및 `server.js`가 `frontend/dist/index.html`(`spa_html`)을 직접 서빙함(`LG-1` 완료) |
| `public/*.js` (12개) | `public/app.js`, `public/auth.js`, `public/data.js`, `public/drive.js`, `public/home.js`, `public/log.js`, `public/note.js`, `public/notes.js`, `public/practice.js`, `public/settings.js`, `public/site.js`, `public/theme.js` | 구 바닐라 JS 화면 스크립트 제거 (`public/config.js`는 런타임 설정 주입용으로 유지) |
| `public/*.css` (3개) | `public/styles.css`, `public/site.css`, `public/practice.css` | `frontend/src/styles/tokens.css` 및 CSS Modules로 이전 완료 |
| `public/lib/*.js` (2개) | `public/lib/theory.js`, `public/lib/voicing.js` | `frontend/src/lib/engine/theory.mjs`·`voicing.mjs`로 이전 완료(`CH-E`, `LG-1`) |
| 구 화면 전용 단위 테스트 (3개) | `test/auth.test.js`, `test/data.test.js`, `test/che_engine_port.test.js` | 구 `public/auth.js`·`public/data.js` VM 샌드박스 테스트 및 `public/lib/*` 동등성 비교 테스트 삭제 |

### 2-2. 수정한 혼합 테스트 파일 (총 9개)

| 파일 | 변경 내용 요약 |
| --- | --- |
| `test/engine.test.js` | `require('../public/lib/theory.js')`·`voicing.js`를 `require('../frontend/src/lib/engine/theory.mjs').default`·`voicing.mjs`로 교체 |
| `test/security.test.js` | 스캔 대상에서 삭제된 구 `public/*.html`·`public/*.js`를 제거하고 현행 `frontend/index.html` 및 `public/config.js`를 스캔하도록 정리, 구 파일 전용 `STORAGE_KEY_ALLOWLIST` 항목 제거 |
| `test/r0_core.test.js` | `R0-T1`에서 삭제된 `public/*.css` 파일 대조 대신 `frontend/src/styles/tokens.css`의 핵심 디자인 토큰(`:root`, `[data-theme="light"]`, `:root:lang(ja)`) 존재 및 CSS 변수 선언을 검증하도록 전환 |
| `test/r1_home.test.js` | `R1-H2`·`R1-H4`의 `public/home.js`·`public/data.js` 파일 읽기 단언을 `HomePage.tsx`·`apiClient.ts`·`useAuth.ts` 기준으로 정리 |
| `test/r1_settings_notes.test.js` | `R1-D2`·`R1-N1`·`R1-N3`의 `public/drive.js`·`public/notes.js`·`public/note.js` 참조를 제거하고 `driveClient.ts`·`NotesPage.tsx`·`NoteDetailPage.tsx` 검증만 유지 (`R1-C1`의 `public/config.js` 검증은 그대로 유지) |
| `test/r2_chords.test.js` | `public/lib/*` 및 `public/app.js`·`public/chords.html` 참조를 `frontend/src/lib/engine/*.mjs` 및 `ChordsPage.tsx`·`ChordDiagrams.tsx`·`ChordModals.tsx` 검증으로 전환 |
| `test/r3_practice_log.test.js` | `public/practice.js`·`public/log.js` 참조를 `PracticePage.tsx`·`LogPage.tsx`·`takeRepo.ts` 검증으로 전환 |
| `test/guardrail_checklist.test.js` | 미디어 요소 `src` 빈 문자열 할당 금지 검사에서 삭제된 `public/*.js` 디렉터리 스캔(`walkFiles(path.join(__dirname, '..', 'public'), ...)`)을 제거하고 `frontend/src` 스캔만 유지 |
| `test/e2e/xss.spec.js` | `E9` 설정 화면 XSS 검사에서 레거시 모드 분기(`if ((await page.locator('#root').count()) === 0)`)를 제거하고 React 설정 기준(`await expect(page.locator('#gemModel')).toHaveCount(0)`)으로 단일화 |

---

## 3. 검증 결과

1. **`git ls-files public/` 확인 (유지 파일 2개만 남음):**
   ```text
   public/config.js
   public/icon-180.png
   ```
2. **프론트엔드 단위 테스트 (`npm test`) 및 프로덕션 빌드 (`npm run build`):**
   ```text
   ℹ tests 374
   ℹ suites 60
   ℹ pass 374
   ℹ fail 0
   ...
   ../dist/index.html                            1.74 kB │ gzip:   0.83 kB
   ../dist/assets/index-C9FXLagg.css            89.94 kB │ gzip:  15.45 kB
   ../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
   ../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
   ../dist/assets/index-Cljc3SMS.js            761.46 kB │ gzip: 249.65 kB
   ✓ built in 761ms
   ```
3. **Kotlin/Ktor 백엔드 전체 테스트 (`./gradlew test --rerun-tasks`):**
   ```text
   BUILD SUCCESSFUL in 48s
   5 actionable tasks: 5 executed
   ```
4. **Playwright E2E 전체 테스트 (`npx playwright test`):**
   ```text
   Running 352 tests using 1 worker
   ...
   352 passed (5.1m)
   ```

---

## 4. 명세와 달라진 점

- 없음 (`개발산출물/완료/진행_레거시정리.md` §2-2의 삭제 대상 28개 및 수정 대상 9개 파일 목록과 100% 일치).
