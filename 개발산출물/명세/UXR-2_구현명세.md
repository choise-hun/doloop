# UXR-2 구현 명세 — 악기 선택·접이식 설정·스케일 행·재해석 2열

> 작성: 2026-11-11 / Claude(시니어). 상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §6·§7·§8·§9(UR-09~12), 결정 §1.1.
> 담당: **[시니어] 직접 구현 → [주니어] 4단계 전체 테스트·PR·CI.** 판정: 협업 §1.2 Q1 예(`#instrument-tuning`을 details 안으로 이동, `.controls` 하위 DOM 재배치, 공용 `.field` 규칙 수정).
> 브랜치 `step/UXR-2`, base `main`. 선행 없음. 수정은 `ChordsPage.tsx`·`ChordsPage.module.css`·i18n·chords 테스트로 한정.

## 1. 전제 (`main`=`d42e28e`)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/pages/ChordsPage.tsx:183-185` | 튜닝은 페이지 state(`guitarTuning` g6, `bassTuning` b4). 악기 전환 시 각자 값 유지 — 저장·동기화 없음 |
| P2 | 같은 파일 `:188-220` | `changeInstrument`/`changeTuning`이 재생 중지·탭 보정·DS 페어 정규화를 원자적으로 수행. **수정 금지** |
| P3 | 같은 파일 `:1148-1164` | `#instrument-kind`(`.chips`) 3버튼 `.chip`, 튜닝 `.field`는 `!isKeyboard`일 때만 렌더 |
| P4 | `ChordsPage.module.css:222-235`, `:56-59` | `.chips{flex-wrap:wrap}`, `.chip` pill, `.instrumentControls > .field{flex:1 1 180px}` → 버튼군 폭이 부족하면 버튼 줄바꿈·찌그러짐 |
| P5 | `ChordsPage.module.css:113-117`, `:119-124` | `.controls` 150px auto-fill 그리드, **`.field{display:flex}`가 `hidden` 속성을 덮어씀** → `sc-hand`(건반)·`sc-circle-opts`·`sc-bars`(simple)가 숨김 조건에서도 보이는 실제 결함 |
| P6 | `ChordsPage.module.css:144-150` | `.check{align-self:end; padding-bottom:6px}` 임의 오프셋 |
| P7 | `ChordsPage.tsx:1353-1563` | 스케일 패널: `.controls` 안 필드 10개 + `.row`(`#sc-play`, `#sc-status`) |
| P8 | `ChordsPage.tsx:2237-2380` | 재해석 패널 1개 안에 `.riGrid`(`#ri-shape`,`#ri-list`) → 2-5-1(`h3`,`.controls`,`#ri-play`,`#ri-swap.boxrow`) → 퀴즈(`h3`,`.quiz`,`#qz-*`) 세로 나열 |
| P9 | `ChordsPage.module.css:326-330`, `:441-453` | `.boxrow` flex-wrap, `.riGrid`·`.quiz` 그리드(공용 아님: ri 전용이지만 클래스명 유지) |
| P10 | `test/e2e/layout/chords_instruments.spec.js:14-40` | `#instrument-tuning` 값 확인·`selectOption` — details 접힘 시 selectOption 실패하므로 펼침 단계 추가 필요 |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | `#instrument-kind`에 전용 클래스 추가: `flex-wrap: nowrap; gap: 8px`. 버튼에 `min-width:72px; flex:0 0 auto; white-space:nowrap; min-height:44px`. 악기 `.field`는 `flex:0 0 auto`(그룹 통째로 다음 줄). pill 유지 |
| D2 | 튜닝 `.field`를 `<details id="instrument-settings">` 안으로 이동(기본 접힘, `!isKeyboard`일 때만 렌더 — 현행 조건 그대로). `<summary id="instrument-settings-summary">` = `chords.instrumentSettings` + ` · ` + 현재 튜닝 이름. 내부 label/`#instrument-tuning`·onChange 그대로 |
| D3 | `.field[hidden], .check[hidden] { display: none; }`를 공용으로 추가한다. 속성 의미 복구(버그 수정)이므로 모든 탭에 적용 |
| D4 | 스케일 패널의 `.controls` 1개를 전용 `div.scRows`로 교체하고 아래 4행으로 재배치. 각 행 `div.scRow`: `display:flex; flex-wrap:wrap; gap:12px 16px; align-items:flex-end` |
| D5 | 스케일 필드는 `.scField`(기존 `.field`와 함께) `flex:0 1 auto; min-width:0`. select/input/button `min-height:44px`. `.chips` 그룹 안 버튼 `white-space:nowrap`. 390px(`max-width:767px`)에서 `.scRow`는 `flex-direction:column; align-items:stretch` |
| D6 | `#sc-rootonly` label은 `.check`+`.scCheck`: `min-height:44px; align-self:flex-end; align-items:center; padding-bottom:0`. 공용 `.check`의 padding은 그대로 두고 scCheck에서만 덮는다 |
| D7 | 재해석 패널 내부를 `div.riLayout` > (`div.riMain`: `.riGrid` + 2-5-1 블록) + (`section.riQuiz`: 퀴즈 h3 + `.quiz`)로 감싼다. `≥1024px`: `grid-template-columns: minmax(0,1.2fr) minmax(0,1fr); gap:24px; align-items:start`, 미만 1열 |
| D8 | `#ri-swap`에 `.riSwap` 추가: `display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px`, `<768px` 1열. 안의 `figure.cell` svg는 `width:100%; height:auto; max-width:100%` |
| D9 | `#qz-opts`에 `.riOpts` 추가: `display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px`, `<768px` 1열. 버튼 텍스트 줄바꿈 허용(`white-space:normal; text-align:left`) |
| D10 | 공용 `.controls/.chips/.chip/.boxrow/.cell/.quiz` 정의는 바꾸지 않는다(D3 hidden 규칙만 예외). 다른 탭 DOM 변경 없음 |

## 3. 스케일 행 구성 (D4, DOM 순서 = 읽기 순서)

| 행 | 클래스·id | 들어가는 기존 요소(id 유지) | 조건 |
| --- | --- | --- | --- |
| 1 기본 | `div.scRow#sc-row-basic` | 연습 모드(`#sc-mode`) → 루트(`#sc-root`) → 스케일 종류(`#sc-type`) | 항상 |
| 1b 순환 | `div.scRow#sc-row-circle` `hidden={scMode !== 'circle'}` | `#sc-circle-opts`(진행 방향) → 키별 마디(`#sc-bars`의 field) | circle만. 내부 기존 hidden 속성은 제거(행에서 한 번만) |
| 2 표시 | `div.scRow#sc-row-display` | 음표 라벨(`#sc-label`) → 손잡이(`#sc-hand`의 field, `hidden={isKeyboard}` 유지) → 재생 범위(`#sc-range`) | 항상 |
| 3 재생 | `div.scRow#sc-row-play` | BPM(`#sc-bpm`) → 근음만(`#sc-rootonly`) → `#sc-play` → `#sc-status` | 항상. 기존 `.row` 래퍼 삭제, `#sc-status`는 `flex:1 1 200px`로 공간 부족 시 다음 줄 |

`.scRow[hidden]{display:none}`도 D3와 함께 둔다. 값·핸들러(BPM 30~220, simple/circle, 라벨/hand/range) 변경 없음.

## 4. 문구 (새 키 1개)

| 키 | ko | en | ja |
| --- | --- | --- | --- |
| `chords.instrumentSettings` | 악기 설정 | Instrument settings | 楽器設定 |

summary 표시: `{t('chords.instrumentSettings')} · {t(TUNING_NAME_KEY[selectedTuning])}`. 튜닝 이름 키는 기존 `TUNING_NAME_KEY` 재사용.

## 5. 배치 약속 (마크업에 `data-align-group`)

| 대상 | 390 | 768 | 1150/1280 | 약속 |
| --- | --- | --- | --- | --- |
| 악기 3버튼 | 1줄(그룹 한 줄 유지) | 1줄 | 1줄 | 기존 `instrumentButtons:height` + 신규 `instrumentButtons:top` → `instrumentButtons:top,height` |
| 악기 행·탭 | 세로 흐름 | 가로 | 가로 | 기존 `instrumentFlow:left` 유지 |
| 스케일 행1·2·3 입력 | 필드 적층 | 그룹 흐름 | 한 줄 | 각 행 컨트롤에 `scRow1:bottom@1150`, `scRow2:bottom@1150`, `scRow3:bottom@1150`(768은 그룹 줄바꿈 허용이라 `@` 강제 안 함 — 정렬 규격 §3-1). `#sc-rootonly` label과 `#sc-bpm`에는 `; scRow3c:center-y` 추가 |
| 재해석 두 패널 | 1열 | 1열 | 2열 | `.riMain`·`.riQuiz`에 `reintPanels:top@1024` |
| `#ri-swap` 3카드 | 1열 | 3열 | 3열 | 각 `figure`에 `reintSequence:top,height@768` |

## 6. 테스트 표 (본문은 구현자)

| 이름 | 준비 | 기대 | 잡을 버그 |
| --- | --- | --- | --- |
| UXR2-1 버튼군 | 390/768/1150 × ko/en/ja | `#instrument-kind button` 3개 rect 비겹침, 각 높이 ≥44·폭 ≥72, `scrollHeight` 1줄, 선택 버튼만 `aria-pressed=true` | 축소·줄바꿈·테두리 겹침 |
| UXR2-2 설정 접힘 | 기타 진입 | `#instrument-settings` open=false, summary에 “6현”류 튜닝명, `#instrument-tuning` 비가시·Tab 순회에서 제외 | 접힘 중 포커스 진입 |
| UXR2-3 튜닝 순환 | 펼침 → g6→g7 → 베이스 → 기타 → 건반 | 기타 복귀 시 g7 유지, 베이스 b4, 건반에서 `#instrument-settings` 0개, 지원 탭 자동 이동, pageerror 0 | 원자적 정규화 파손(P2) |
| UXR2-4 hidden 실효 | simple/circle 전환, 건반 | simple: `#sc-row-circle` 비가시, circle: `#sc-dir`·`#sc-bars` 가시, 건반: `#sc-hand` 비가시 | `.field{display:flex}`가 hidden 덮음(P5) — **수정 전 Red 확인** |
| UXR2-5 스케일 정렬 | 1150, 각 행 | 같은 행 select/input/button 높이 ≥44·bottom 일치, `#sc-rootonly` center-y가 BPM 입력 center-y와 ±2px | checkbox 오프셋 |
| UXR2-6 재생 유지 | BPM 변경·재생/중지 | `#sc-play` aria-pressed 토글, `#sc-status` 갱신 | 재배치 중 핸들러 누락 |
| UXR2-7 재해석 열 | 1023/1024/768/767 | 1024↑ `.riMain`·`.riQuiz` top 일치·좌→우, 1023 1열, `#ri-swap` 768↑ 3열 등폭·767 1열, `#qz-opts` 768↑ 2열 | 고정폭 SVG 침범, 경계 오류 |
| UXR2-8 퀴즈 | 정답·오답·다음 | 1회만 채점(점수 1 증가), `#qz-fb` 표시, 다음 문제 후 버튼 활성 | 재배치로 채점 잠금 파손 |
| UXR2-9 다른 탭 | tone/drop/tf/prog 탭 layout | 기존 layout 단언 전부 통과(D10) | 공용 클래스 변경 전파 |

기존 `chords_instruments.spec.js:14-40`은 `#instrument-settings summary` 클릭 후 동일 단언을 유지한다(삭제·완화 금지).

## 7. 체크리스트

- [ ] `rg -n "instrument-settings|scRows|riLayout|riSwap|riOpts" frontend/src/pages/ChordsPage.tsx` → 각 1회 이상
- [ ] `git diff --stat` 대상이 머리말 범위(ChordsPage 2파일·i18n 3·chords 테스트)뿐
- [ ] `npm run build`, `npm test` 통과
- [ ] `npx playwright test test/e2e/chords_instruments.spec.js test/e2e/layout/chords.spec.js test/e2e/layout/chords_instruments.spec.js` 통과
- [ ] UXR2-4 수정 전 Red/수정 후 Green 기록
- [ ] `LAYOUT_SHOTS=1` 4폭+다크 + 1023/1024 캡처, Q1~Q9 → `개발산출물/결과/UXR-2.md`

## 8. 금지

- 튜닝을 SettingsPage·localStorage·서버로 저장, 저장 버튼 추가, 모달/라우트 신설.
- `changeInstrument`/`changeTuning`/DS 페어 로직 수정, 스케일·퀴즈 값 범위 변경.
- 공용 클래스 정의 변경(D3 제외), 새 색·간격 토큰, 인라인 style, 새 의존성.
- 악기 버튼 사각화(pill 유지 — 정렬 규격 §5-4).
