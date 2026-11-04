# CH-0 결과 — CHORDS(코드 진행 모음) 기획 검토·범위 확정

- 날짜: 2026-11-04 (win)
- 입력: 루트 `코드진행_기능_기획_메모.md`(= `docs/ULevelP 코드 진행 기능 기획 메모.md`와 내용 같음, 줄바꿈만 다름), 노션 템플릿 "🎼 진행 모음 (템플릿)", 기존 코드 조사, 사용자 답변 8개
- 다음 step(CH-1 설계)은 이 파일과 `진행_코드진행모음.md`만 읽고 시작한다

## 1. 확정된 용어·범위 (사용자 답변 기준, 기획 메모보다 우선)

| 항목 | 확정 |
| --- | --- |
| 범위 토글 | 앱: **레퍼런스(기본) / 분석 / 합산**. 노션 `구분` 값은 `레퍼런스` / `코드 분석`, 노션 보기 "전체" = 앱 "합산" |
| **분석** | 영상에서 AI가 뽑은 진행. ① **코드 진행 영상**(기본 경로): CHORDS 페이지 입력 → 바로 수집(검수 없음) ② **학습 영상 노트**: 노트 상세의 "코드 진행 수집에 넣기"를 켰을 때만 그 노트의 화성 진행이 들어감, 끄면 빠짐 |
| **레퍼런스** | 사용자가 좋아하는 **실제 곡의 진행**을 직접 넣는다. 사용자가 hooktheory·chordify·ultimate-guitar·songsterr 등에서 보고 옮겨 적는 방식(앱은 사이트를 크롤링하지 않음). 출처 `직접` |
| 레퍼런스 공개 | 최종 목표는 **공개 수집**(다른 사용자도 사용, 같은 곡·아티스트면 추천 입력). **1차는 개인용**, 공개는 2차. 1차 테이블은 공개 전환이 쉽게(곡·아티스트 정규화 키 등) 설계 |
| 코드 진행 영상 | CHORDS 페이지 입력란(기획 메모 §4 안내 문구) → 기존 노트 분석 작업(`analysis_jobs`)을 **진행 전용 프롬프트**로 돌린다. **노트도 남기고**, 그 노트는 "수집에 넣기"가 켜진 상태로 만든다(노트에서 다이어그램·구간 다시 보기 가능) |
| AI 값 반영 | 검수 없이 바로 반영. 행마다 `출처: AI / 직접`, AI 행은 `근거: 화면 / 말함 / 추정` |
| 수정 | **웹(앱) 중심**: CHORDS 페이지에서 수정·삭제·직접 추가. AI 행을 사람이 고치면 출처를 `직접`으로 바꿀지는 CH-1에서 정한다(제안: 바꾼다) |
| 노션 | 템플릿 기반 `코드 진행` DB에 **앱→노션 push만**. 노션에서 고친 값은 앱에 반영되지 않는다고 화면·템플릿에 표기 |
| 취향 코드 진행 | **빈도 순위 + 랜덤 꺼내보기**. 템플릿 기준 통계: 코드별 빈도, 코드 사이 이동(예: IM7 → vim7), 자주 나오는 진행, Mood·Genre 횟수, 키 분포. 매번 앱에서 계산하고 노션에 표를 두지 않는다 |
| 레퍼런스 입력 보완(1차) | ① **붙여넣기 파서**: 코드 사이트에서 복사한 악보 텍스트(가사+코드)에서 코드 심볼만 순서대로 뽑고 반복 구간을 묶어 후보로 보여 줌. 마디는 몰라도 된다 ② **로마숫자 자동 계산**: 코드 심볼 + 키(자동 추정 → 사용자 확인)로 `Chords Progression`·`1st Chord` 계산 ③ **읽는 법 안내**: 입력란 옆 접이식 도움말(사이트에서 어디를 보면 되는지, 순서만 넣으면 된다는 예시 하나) |
| 1차 제외 | 공개 수집·추천·신고(2차), 프렛→코드명 찾기(연습실 "코드 재해석"으로 대신 안내만 가능), 노션→앱 pull |

## 2. 사용자에게 묻지 않고 정한 기본값 (틀리면 CH-1 전에 정정)

| 항목 | 기본값 | 이유 |
| --- | --- | --- |
| 메뉴·페이지 | 상단 메뉴는 그대로(2026-11-04 결정). `CHORDS` = 코드 진행 모음 **한 페이지**(입력 + 목록 + 취향 코드 진행). 기획 메모의 "공부/연습 묶음"으로 메뉴를 다시 짜지 않는다 | 메뉴 재구성이 이미 끝남(`진행_홈메뉴장르.md` R4). 미결 체크박스 "메뉴 구성과 페이지 분리"는 이것으로 닫는다 |
| 홈 "취향 코드 진행 꺼내보기" | 새 진행 데이터 + 범위 토글로 바꾼다. 지금 쓰는 `편곡` 태그 → REFERENCE 규칙은 없앤다 | 기획과 맞지 않음 |
| 비로그인 | 기본 시드 진행(지금 `progressions.ts` 10개)만 보여 준다. 입력·수집은 로그인 필요 | 분석은 사용자 Gemini 키가 필요하고, 저장은 서버 |
| `localStorage ulp:progressions` | 읽기는 CH-1에서 정리(제안: 더 읽지 않음 — 어디서도 쓰지 않는 키) | 쓰는 코드가 없음 |
| 연결 ① 구간 반복 | 영상 행은 `practice.html?v=&t=<시작(초)>`로 연다(지금 플레이어가 지원) | 비용 거의 없음 |
| 연결 ② 연습실 보이싱 | 1차 포함 여부는 CH-1에서 연습실 딥링크 비용을 보고 정한다. 지금 `chords.html`은 `#탭`만 받고 코드 지정은 못 함 | 연습실 수정이 커질 수 있음 |
| 레거시 화면 | `public/*`는 손대지 않는다(롤백용) | 기존 결정 |
| 계정 삭제·내보내기 | 진행 행은 계정 삭제 때 같이 지운다(FK CASCADE). 내보내기/가져오기 포함 여부는 CH-1에서 정한다 | FR-AUTH-4 |
| 배포 | 지금처럼 CHORDS 1차가 main에 들어간 뒤 한꺼번에 배포 | 인수인계 메모 결정 |

## 3. 기존 코드에서 확인한 사실 (설계 입력)

- 진행 전용 서버 테이블은 **없다**. 진행은 `notes.analysis` JSONB의 `harmony.progressions[]`에만 있다. 모양은 `GeminiSchemas.kt`의 `HarmonyProgressionDto { name, key, instrument, chords[] }`, `HarmonyChordDto { symbol, roman, function, split, lh, rh, frets, voicing_note, nuance, source(말함|화면|추정), timestamp }`
- 노트 분석 흐름: `POST /api/v1/notes/analyze`(tags ⊂ `GeminiSchemas.TAGS` 6개, memo) → `analysis_jobs` → `NoteService.executeJob` → `GeminiSchemas.buildPrompt(tags, memo)` → `notes` 행 + `diagrams_svg`
- 지금 화성 프롬프트에 "화면의 피아노롤·건반·악보를 우선 근거, 음 철자는 영상 표기"는 있지만 **코드 심볼을 화면 표기 그대로 쓰라는 규칙은 없다**. 진행 전용 프롬프트에 추가해야 한다(기획 메모 §4의 "화면 표기 우선")
- 홈 진행 카드: `frontend/src/lib/progressions.ts` — `ProgressionItem { id, category: REFERENCE|ARCHIVE, chordsText, title, keyLabel, sourceType: AI|직접|기본, href }`, `extractProgressionsFromNotes`(노트 화성 진행 + `ulp:progressions` + 시드), `pickNextIndex`. 홈 `HomePage.tsx:788` 제목 "취향 코드 진행 꺼내보기"
- 메뉴: `AppShell.tsx:15` `{ key: 'chords', label: 'CHORDS', href: null }`(비활성). 라우트 `App.tsx`에 `/chords.html`(코드 연습실, 메뉴 LEARN)
- 노션: 설정의 DB는 `songsDb`·`sessionsDb`·`notesDb`(선택) 세 개(`IntegrationService.kt`, `SettingsPage.tsx`). push는 `sync_outbox` + `NotionPushWorker`
- **스키마 제약**: `notion_links.entity`·`sync_outbox.entity` CHECK가 `('song','session','take','note')` → 진행 push를 하려면 V3 마이그레이션에서 제약을 바꿔야 한다
- 코드 심볼 파서·로마숫자 계산·키 추정 함수는 **없다**(`ChordTheory.kt`는 프렛·보이싱·`interpret(notes)`·스케일). 새로 만들어야 한다(어디에 둘지는 CH-1: 서버 Kotlin / 프론트 TS / 둘 다)
- 연습실 "코드 재해석" API `GET /api/interpret?frets=x,x,4,2,2,4`가 있다(1차 제외한 프렛→코드명에 나중에 쓸 수 있음)
- 마이그레이션은 V1·V2까지. 다음은 **V3**. 첫 배포 때 V2·V3가 운영 DB에 같이 적용된다

## 4. 노션 템플릿 `코드 진행` DB (push 매핑 기준)

- 템플릿 페이지: https://app.notion.com/p/40e7a337e26f81d3b091e0aadfad948c ("복제 → ULevelP 통합 연결 → 코드 진행 표 ID를 앱 설정에 입력")
- 템플릿 안의 DB: https://app.notion.com/p/94213bd1360e4f2884dae2cb3ad58b70 (data source `collection://5ddc578a-7e27-493d-ae26-a6e4b862b5e4`)

| 속성 | 타입 | 값·설명 |
| --- | --- | --- |
| 이름 | title | |
| 구분 | select | `레퍼런스` / `코드 분석` |
| 출처 | select | `직접` / `AI` |
| 수집 경로 | select | `코드 진행 영상` / `학습 영상 노트` / `직접 입력` (코드 분석 행만이라고 적혀 있으나 `직접 입력` 옵션도 있음) |
| 근거 | select | `화면` / `말함` / `추정` (AI 추출 근거) |
| 코드 심볼 | text | 실제 코드명 `FM9 - Dm9 - Gm7 - C7` |
| Chords Progression | text | 로마숫자 `IM7 - vim7 - iim7 - V7` |
| 1st Chord | select | 옵션 13개(I, IM7, iim7, iiim7, IV, IVM7, V, V7, vm7, vim7, II7, III7, bVIM7). 새 값은 노션이 옵션을 추가 |
| Scale | multi_select | `C Major`, `C min` … 24개 (형식 `<음> Major` / `<음> min`, 이명은 Db Major·C# min·F# Major·G# min·Ab Major·Eb min 등 템플릿 철자를 따름) |
| Mood | multi_select | sad, wet, nostalgia … |
| Genre | multi_select | RnB … |
| Tag | multi_select | guitar, complicated … |
| Artist / Album / 채널 / 메모 | text | |
| Release | date | |
| URL | url | 레퍼런스: 코드 사이트·악보 링크 / 분석: 영상 링크 |
| 시작(초) / 끝(초) | number | 구간 연습 링크용 |
| 수집일 | created_time | 노션 자동 |

- 템플릿 입력 규칙: 로마숫자는 `-`로 구분, 대문자 메이저·소문자 마이너, 메이저7 `M7`·도미넌트7 `7`, 변화음은 도수 앞 `b`/`#`(`bVIIM7`), 텐션은 뒤(`Iadd9`, `V7(b9)`)
- **템플릿 문구 정정 필요(사용자 노션 페이지)**: "AI 추출값은 … 틀린 값은 여기서 고칩니다" → 1차 결정(웹에서 수정, 노션 수정은 앱에 반영 안 됨)과 다르다. CH-7(노션) 때 바꿀 문구를 제안하고, 노션 페이지 수정은 사용자 확인 뒤에 한다
- 앱 범위 토글 이름 "분석"과 노션 `구분` 값 "코드 분석"이 다르다 → push할 때 `분석` → `코드 분석`으로 매핑

## 5. CH-1(설계)에서 정할 것

1. **DB(V3)**: 진행 테이블 모양 — 한 행 = 진행 하나(코드 배열 JSONB vs 코드 행 분리), 노트 연결(`note_id` + 노트 안 진행 인덱스), 노트 "수집에 넣기" 플래그 위치(`notes` 칼럼 vs 진행 행 존재 여부), 곡·아티스트 정규화 키(2차 공개 대비), Mood·Genre·Tag 저장, `entity` CHECK에 `progression` 추가
2. **API**(메뉴얼 — 사용자 승인 필요): 진행 목록(범위 필터)·추가·수정·삭제, 코드 진행 영상 분석 요청(기존 `/notes/analyze` 확장 vs 새 경로), 노트 수집 토글, 통계(서버 계산 vs 프론트 계산)
3. **진행 전용 프롬프트·스키마**: 화면 표기 우선(코드 심볼 그대로), 근거, 구간(시작/끝 초), 기존 `harmony` 스키마 재사용 범위
4. **코드 파서·로마숫자·키 추정** 위치와 지원 범위(텐션·슬래시·`b`/`#`·이명), 붙여넣기 파서의 반복 구간 묶기 규칙
5. **화면 구성**: CHORDS 페이지 배치(입력 3종: 영상 / 직접 / 붙여넣기, 목록·범위 토글, 취향 통계), 홈 위젯 교체, 읽는 법 안내 문구
6. 연습실 보이싱 연결 1차 포함 여부, 내보내기/가져오기 포함 여부, AI 행 수정 시 출처 변경 규칙
