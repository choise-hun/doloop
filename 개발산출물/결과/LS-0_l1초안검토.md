# LS-0 결과 — `명세/l1_*.md` 초안 3개 검토 (명세로 쓸 수 있나)

- **날짜:** 2026-11-06 (win, 시니어) · **진행 파일:** `개발산출물/진행_다국어.md`
- **대상:** 작성자 미상 초안 `개발산출물/명세/초안/l1_1.md`·`l1_2a.md`·`l1_2b.md`(원래 `명세/` 바로 아래 추적 안 된 파일, "작성: 시니어(Claude)"라고 적혀 있으나 이 저장소 기록에 없음). 이 검토 뒤 `명세/초안/`으로 옮겨 커밋 — **주니어 입력으로 쓰지 않는다**
- **결론:** 셋 다 그대로는 명세로 못 쓴다. l1_2a 한국어 값 대부분과 l1_2b 영·일 번역은 다음 명세 작성 때 **참고 자료**로만 쓴다

## 1. 판정

| 초안 | 판정 | 근거(직접 확인) | 다음 처리 |
| --- | --- | --- | --- |
| `l1_1.md` (L1-1 백엔드) | **폐기** | 경로가 전부 `backend/src/main/kotlin/com/ulevelp/api/...` — 없음. 실제 `src/main/kotlin/ulevelp/{auth,service,note,db}/`. "수정 전" 코드도 실제와 다름: 실제 `suspend fun ensureUserAndProfile(user: AuthenticatedUser)`(`service/ProfileService.kt:103`), `suspend fun patchMe(userId: UUID, body: JsonObject)`(`:158`), `GeminiSchemas.buildPrompt(tags, memo)`(`note/GeminiSchemas.kt:413`)·`buildProgressionPrompt(memo)` 인자 1개(`:477`), 반환 `Pair<JsonObject, String>`. 구현자를 주니어로 적었으나 백엔드 step은 시니어 몫(`협업_시니어주니어.md` §2) | L1-1은 시니어가 직접 구현(명세 없이 진행 파일 step). 초안의 결정 D1~D9 중 **D1(마이그레이션 없음)·D2(GeoIP·`GET /locale`·SongService 라벨 없음)·D5(첫 가입 때만 locale 기록)·D6(`ko|en|ja|null`만, 그 밖 400)·D7(`ko`일 때 프롬프트 1글자도 안 바뀜)·D8(enum 값 번역 금지)** 은 `상용_서비스_계획.md` §3-4와 맞아 재사용 가능 |
| `l1_2a.md` (화면 문구 이전) | **다시 씀** | 전제 줄 번호는 대부분 맞음(`OpsPanel.tsx:4`, `pasteParse.mts:11`, `auth.ts:136`, `ChordsPage.tsx:47`, `r1_home.test.js` 트랜스파일러). 사전 1088개 중 L0 키 제외 **40개가 원문에 없음**(아래 §2). §4 치환표가 Progressions 쪽만 줄 단위이고 ChordsPage(2658줄)·PracticePage·LogPage·HomePage·NotesPage는 "1:1 치환" 한 줄 — 주니어가 그대로 칠 수 없음. D5 "`CONFIRM_DELETE_TEXT` 상수 보존" — 그런 상수 없음(`SettingsPage.tsx:426,439`에 `'삭제합니다'` 직접) | LS-1에서 화면 묶음별 명세 여러 개로 다시 씀. 결정 D2(키 정규식)·D3(동적 키 금지, 정적 매핑)·D4(모듈 상수는 getter/`labelKey`)·D6(`ch5b:145`·`r1_home` 호환)는 재사용 |
| `l1_2b.md` (영·일 + 언어 선택) | **보류** | 영·일 사전이 l1_2a 한국어 키 위에 있어 §2 오류를 물려받음. 전제 틀림: CSP `frontend/index.html:5`(초안 7), 폰트 링크 `:9`(초안 21, Archivo·JetBrains Mono·Noto Sans KR 함께), `tokens.css`에 `--font-sans` 없음(실제 `--font-body` `:50`, `--font-display` `:52`) | L1-2a 전부 머지 뒤 LS-2에서 다시 씀. 번역문은 키가 맞는 것만 참고 |

## 2. l1_2a 사전 값 중 원문에 없는 것 (화면 변화 0 위반)

검사: 초안 §3(75~1176행)의 `'키': '값'` 줄마다 값(변수 `{x}` 앞뒤 조각)이 `frontend/src` 소스(사전 폴더 제외)에 있는지 문자열 비교. 1088개, 중복 키 0, 키 정규식 위반 0. L0 키(`nav|job|analyze|tier|theme`)는 작업 트리에서 이미 이전돼 제외.

| 묶음 | 초안 값 | 실제 원문 |
| --- | --- | --- |
| `chords.scale.*` 8개 | `"메이저 (이오니안)"`, `"자연단음계 (에올리안)"` … | 영어: `'Major (Ionian)'`, `'Natural Minor (Aeolian)'` … (`engine/theory.mjs:254-267`). id도 다름 — 초안 `majPent`·`minPent`, 실제 `pentMaj`·`pentMin`. 실제에만 `majBlues`·`wholeTone` 있음 |
| `chords.tuning.*` 5개 | `"6현 기타 (표준)"` … | `'기타 (6현)'`, `'기타 (7현)'`, `'베이스 (4현)'` … (`theory.mjs:271-275`) |
| `chords.quality.*` 10개 | `"메이저 7"`, `"도미넌트 7"` … | 엔진 이름은 기호 그대로 `'maj7'`, `'7'`, `'m7(b5)'` … (`theory.mjs:10-18`). 초안 id `mMaj7`·`maj7s5`·`7s5`는 엔진에 없음 |
| `chords.inv.*` 4개 | `"기본위치 (근음 베이스)"`, `"1전위 (3음 베이스)"` … | `'기본형 (베이스 근음)'`, `'1전위 (베이스 3도)'` … (`theory.mjs:32`) |
| `chords.slot.fifth` | `"5음"` | `'5도'` (`theory.mjs:21` `SLOT_NAME`) |
| `note.sec.*` 5개 | `"사운드 디자인 (Sound Design)"`, `"핵심 개념"` … | 원문에 그런 제목 없음(`NoteDetailPage.tsx:257` `핵심 요약`) |
| `prog.page.tasteFilterMove/Pattern` | `"이동이 들어 있는 진행만 보는 중"` | JSX 조각 조립: `<b>{tasteFilter}</b>{… ' 이동' : ' 묶음'}이 들어 있는 진행만 보는 중` (`ProgressionsPage.tsx:393`) — `<b>` 안팎을 어떻게 나눌지 정해야 함 |
| `settings.nxImport.*` 2개 | `Markdown & CSV` | 원문 `Markdown &amp; CSV`(JSX 엔티티 — 화면은 같음, 값으로 옮길 때 `&`로 바꾸는 게 맞음. 오류 아님) |
| `privacy.secTwoItemThree`, `prog.video.desc`, `prog.paste.placeholder`, `settings.notion.guideStepTwoEnd` | — | 원문이 여러 줄 JSX·`\n` 포함이라 단순 비교에 안 걸림. LS-1에서 눈으로 확인 |

- **설계 문제:** 초안 D5는 `theory.mjs` 표시 이름을 화면에서 한국어 사전으로 바꾸려 했다 → 지금 영어로 보이는 스케일 이름이 한국어로 바뀜(화면 변화). LS-1 결정: 엔진 이름은 **지금 화면 글자 그대로** 키 값으로 둔다(번역은 L1-2b 사전에서)

## 3. L0 충돌 (같은 날 처리)

- 주니어가 L0 구현 중 `test/ch5_progressions.test.js:202`(CH-5-6, AppShell 원문 정규식 `label: 'CHORDS'`)이 깨진다고 보고 — 명세 §2 파일 목록 누락이 원인
- `명세/L0_구현명세.md` §2에 그 파일(202행 1줄)을 넣고 §6에 새 정규식 `/key: 'chords', labelKey: 'nav\.chords', href: 'progressions\.html'/`을 적음. 두 표기 허용 대안은 옛 표기로 되돌아가도 통과해 버려 쓰지 않음
- 확인: 주니어 작업 트리(L0 구현 상태)에서 `npm test` 실패 3건 = CH-5-6 1건 + 기존 CRLF 2건(`CH-2c-1-1`, `CH-2c-3-2`). 새 정규식을 현재 `AppShell.tsx`에 대면 `true`, `nav.chordz`로 바꾸면 `false`

## 4. 다음 step에 넘길 것

- L1-1(시니어 구현): 위 §1 l1_1 행의 재사용 결정 6개 + 실제 위치. `ensureUserAndProfile`은 `suspend`, 호출은 `auth/AuthPlugin.kt:38` `profileService?.ensureUserAndProfile(user)`. `profiles.locale`은 `db/Tables.kt:47`, V5 `:14`(CHECK `ko|en|ja`, NULL = 자동). `MeResponseDto.locale`·`getMe()` 매핑은 이미 있음(`ProfileService.kt:53,436`). Gemini 호출부 `service/NoteService.kt:396,398`(`executeJob` `:351`)
- LS-1(L1-2a 명세): §2 표의 값은 원문으로 바로잡을 것. 사전을 화면 묶음별 명세로 나눠 각 명세에 줄 단위 치환표
- 초안 원본: `개발산출물/명세/초안/`(참고용, 주니어 입력 금지)
