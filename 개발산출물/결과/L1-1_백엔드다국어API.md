# L1-1 결과 — 백엔드 언어 (첫 가입 언어 · `PATCH /me` `locale` · Gemini 프롬프트 언어 지시)

- **날짜:** 2026-11-07 (mac, 시니어 직접 구현) · **진행 파일:** `개발산출물/진행_다국어.md` · **브랜치:** `step/L1-1` → PR base main
- **입력:** `결과/LS-0_l1초안검토.md` §1·§4(재사용 결정 D1·D2·D5~D8), `계획/상용_서비스_계획.md` §3-4, `docs/rules/backend-kotlin.md`
- **마이그레이션 없음:** `profiles.locale`은 V5(`V5__tiers_credits_and_community.sql:14`, CHECK `ko|en|ja`, NULL = 자동)·`Tables.kt:47`·`MeResponseDto.locale`(이미 응답에 있음)에 그대로

## 1. 만든·고친 파일

| 파일 | 한 일 |
| --- | --- |
| `src/main/kotlin/ulevelp/service/Locales.kt` (새) | `Locales.SUPPORTED = {ko,en,ja}`, `DEFAULT = "ko"`, `parseAcceptLanguage(header)` — q 내림차순(같은 q는 앞 순서), q 없으면 1, 숫자 아님·0 이하·1 초과는 버림, `ko-KR` → `ko`(첫 부분, 대소문자 무관), 앞 32개 항목만. 지원 언어 없으면 null |
| `src/main/kotlin/ulevelp/auth/AuthPlugin.kt` | `ensureUserAndProfile(user, initialLocale = Locales.parseAcceptLanguage(Accept-Language))` |
| `src/main/kotlin/ulevelp/service/ProfileService.kt` | `ensureUserAndProfile(user, initialLocale: String? = null)` — 프로필 **새로 만들 때만** `locale` 기록(기존 사용자는 지금처럼 SELECT 하나, 쓰기 없음). `patchMe`에 `locale` 필드: `"ko"|"en"|"ja"|null`, 그 밖은 400 `INVALID_INPUT` `locale은 'ko', 'en', 'ja' 또는 null이어야 합니다.` — 검사는 트랜잭션 전이라 다른 필드와 같이 와도 부분 반영 없음 |
| `src/main/kotlin/ulevelp/note/GeminiSchemas.kt` | `LANGUAGE_DIRECTIVES`(en·ja), `buildPrompt(tags, memo, locale = "ko")`·`buildProgressionPrompt(memo, locale = "ko")` — 기존 프롬프트 **끝에** 지시문만 덧붙임. ko·모르는 값은 `""`(1글자도 안 바뀜). 스키마(JSON)는 언어와 무관 |
| `src/main/kotlin/ulevelp/service/NoteService.kt` | `executeJob` 트랜잭션 1에서 작업 주인의 `profiles.locale`을 같이 읽음(`?: "ko"`) → 두 프롬프트 함수에 전달 |
| `src/test/kotlin/ulevelp/i18n/LocaleApiTest.kt` (새) | lc1~lc8 (§3) |
| `docs/03-api-spec.md` §2.1·§2.3 | 첫 언어 규칙, `PATCH /me` `locale` 규칙 |
| `계획/l1_1.md`·`계획/l1_2.md` | 맨 위 정정 문단(이 결과 파일·§3-4가 기준, `GET /locale`·GeoIP·`X-Client-Locale`·서버 상태 라벨 없음) + 깨진 링크(`google.com/search?q=…`) → `../개발산출물/주니어_체크리스트.md` (`상용_서비스_계획.md` 머리 "L1-1 직전에 고친다") |

- **하지 않은 것(§3-4 D-2):** `GET /api/v1/locale`, GeoIP 헤더, `X-Client-Locale`, `SongService` 상태 라벨 번역, CORS 헤더 추가, 새 마이그레이션. API 응답 문구·코드값은 언어와 무관(화면 사전이 번역)
- **`ensureUserAndProfile` 시그니처:** 기본값 인자 추가라 다른 호출부 변경 없음(호출부는 `AuthPlugin.kt` 하나)

## 2. 언어 지시문 (번역 금지 값)

- 위치: `PROMPT_TEMPLATE` 채운 결과 + (메모) 뒤, 맨 끝 `\n\n…`. 템플릿 규칙 "모든 설명은 한국어로"를 덮어쓴다고 명시
- 번역 금지로 못박은 값: `difficulty`(입문/중급/고급 — `NoteService.VALID_DIFFICULTIES`·DB CHECK), `instrument`(건반/기타 — SVG 렌더러 분기), `source`(말함/화면/추정 — `progressions.evidence` CHECK), key 형식(`"F Major"`, `"A min"`), 코드 심볼·로마 숫자·음이름·프렛·timestamp. 곡 제목·아티스트·플러그인 이름은 영상 표기 그대로
- 스키마 `enum`이 그대로라 Gemini 구조화 출력에서도 enum은 바뀔 수 없다(lc7이 스키마 동일을 확인)

## 3. 테스트

| 테스트 | 확인 |
| --- | --- |
| lc1 | `Accept-Language` 파싱: q 순서, `ko-KR`·`JA-jp`, 같은 q 앞 우선, q=0·`q=abc`·`q=2` 버림, `fr`/`*`/빈 값/`kor` → null |
| lc2 | 첫 `GET /me`(`ja-JP…`) → `locale "ja"`. 다음 요청 `en-US`여도 `ja` 유지. `PATCH {locale:null}` 뒤 `ko-KR`로 와도 NULL 유지 |
| lc3 | 첫 가입 `fr-FR,de` / 헤더 없음 → 응답·DB 둘 다 null |
| lc4 | `PATCH` en·ja·ko 각각 200 + DB 반영, `locale` 키 없는 PATCH는 그대로, `null` → 자동(NULL) |
| lc5 | **잘못된 입력 400** 9종: `"fr"` `""` `"KO"` `"ko-KR"` `123` `true` `["ko"]` `{…}`, `displayName`+`"de"` — 모두 `assertStandardError(400, INVALID_INPUT)`, DB `en` 유지, displayName 안 바뀜 |
| lc6 | A가 `ja`로 바꿔도 B(`en-US`로 가입)는 `en` |
| lc7 | `buildPrompt`·`buildProgressionPrompt`: `ko`·`"fr"`·`""` = 기본 호출과 같음, `en`·`ja` = 기본 프롬프트 + 지시문(정확히 이어 붙임), 스키마 동일, 지시문에 번역 금지 값 포함 |
| lc8 | `executeJob`: A(`en`) → Gemini가 받은 프롬프트 = ko 프롬프트 + en 지시문, B(NULL) → ko 프롬프트와 같음. 노트 `difficulty` "중급" 그대로 |

- 기존 `NoteSvgAndSchemaTest`(sv5·sv5b 포함) **수정 없이** 통과
- `./gradlew test --no-daemon` (mac, 2026-11-07): 테스트 클래스 30개 / **294개, failures 0, errors 0, skipped 0**

```
LocaleApiTest > lc1_parseAcceptLanguage_qOrderAndPrimaryTag() PASSED
LocaleApiTest > lc5_patchMe_invalidLocale_returns400_andKeepsValue() PASSED
LocaleApiTest > lc4_patchMe_locale_validValuesAndNull() PASSED
LocaleApiTest > lc3_firstSignup_unsupportedOrMissingHeader_isNull() PASSED
LocaleApiTest > lc6_patchMe_locale_isolatedPerUser() PASSED
LocaleApiTest > lc7_prompt_koUnchanged_enJaAppendDirective_schemaSame() PASSED
LocaleApiTest > lc8_executeJob_usesOwnerLocale_nullIsKo() PASSED
LocaleApiTest > lc2_firstSignup_storesAcceptLanguage_andNeverOverwrites() PASSED
NoteSvgAndSchemaTest > sv5_geminiSchemas_buildPrompt_dynamicComposition() PASSED
NoteSvgAndSchemaTest > sv5b_geminiSchemas_buildProgressionPrompt_extendsHarmonyOnly() PASSED
BUILD SUCCESSFUL
```

- curl 대신 테스트로 400 확인(로컬 서버는 Supabase 토큰이 있어야 `/me`에 닿는다 — 진행 파일 완료 기준 "curl/테스트 1개")
- CI: PR 본문·진행 파일에 기록

## 4. LS-2(L1-2b 명세)가 쓸 값

- `GET /me` → `locale: "ko"|"en"|"ja"|null`. null = 사용자가 아직 안 고름(화면 자동: 저장된 선택 → `navigator.languages` → 타임존 → `ko`, §3-4)
- 언어 선택 저장: `PATCH /api/v1/me {"locale":"en"}`, 자동으로 되돌리기 `{"locale":null}`. 응답은 갱신된 `MeResponseDto`
- 첫 가입은 브라우저가 보내는 `Accept-Language`(fetch 기본 헤더)로 서버가 채움 — 화면이 따로 보낼 헤더 없음
- **결정 필요(LS-2):** `locale`이 NULL인 사용자는 화면이 영어로 자동 표시돼도 AI 노트는 한국어로 나온다(서버는 NULL → ko). 화면 자동 감지 결과를 처음 한 번 `PATCH`로 저장할지, 설정에서 고를 때만 저장할지 LS-2에서 정한다. 첫 가입 때 `Accept-Language`가 지원 언어면 이미 채워져 있어 대부분은 해당 없음
- 기존 NULL 사용자(L1-1 전 가입)는 그대로 NULL — 백필하지 않음

## 5. 겪은 문제

- 테스트에서 `DatabaseConfig`가 `ulevelp.db.*`·Exposed 양쪽에 있어 모호 → `import ulevelp.db.DatabaseConfig` 명시(NoteApiTest와 같은 방식)
- PR #119(LS-1)도 `진행_다국어.md`의 상태 줄·LS-1 행·§5를 고침 → PR #119 머지 뒤 `step/L1-1`에 `origin/main`을 merge해 합침(rebase 금지)
- PR #120 CI에서 `E2E XSS & CSP (Playwright, spa)` `test/e2e/beta-badge.spec.js:50`(`B3 progressions`)이 2회 연속 같은 값(`Expected: >= 859.6875`, `Received: 854`)으로 실패:
  - **원인 분석(추정):** 백엔드 변경(L1-1)과 무관하며, 폰트 서브셋 로드에 따른 리플로우 레이스로 추정되며 관측된 좌표 차이와 일치한다. `#progTab-video` 탭 전환 직후 마운트되는 `VideoAnalyzeForm.tsx` 상단 `<p className={styles.intro}>`(14px 글꼴, 1줄 높이 약 21.7px)가 폰트(Noto Sans KR 서브셋) 로드 전에는 fallback 폰트로 2줄로 줄바꿈되어 첫 `boundingBox()`(`#progVideoSubmit`) 측정 시 `submit.bottom`이 약 859.7px로 잡히고, 직후 둘째 `boundingBox()`(`#progBetaNotice`) 호출 사이에 폰트가 적용되면서 1줄로 줄어들어 `notice.y`가 854px로 측정되었을 가능성이 높음(단, 실패 당시의 font loading 상태 trace 등 직접 증거는 없으므로 확정이 아닌 정황 추정).
  - **조치 및 후속 결정:** `docs/LS-1` 대조군 CI(`42316507634`, 347 passed)로 백엔드 코드 무관 확인 후 PR #120은 실패 잡 재실행(`gh run rerun 42314547356 --failed`)으로 통과시킴(PR 진행을 위한 조치이며 테스트 자체의 근본 해결은 아님). B3 테스트의 근본적 불안정성을 해소하기 위해 이후 프론트/테스트 작업에서 `layout-check.js`처럼 `await page.evaluate(() => document.fonts.ready)` 대기 후 측정하도록 보강하기로 결정(단일 `evaluate` 동시 측정은 시점 자체가 폰트 적용 전일 수 있으므로 폰트 대기 후 측정을 기본으로 함, 2026-11-07).
