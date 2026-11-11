# UXR-2 결과 — 악기 버튼군·접이식 설정·스케일 행·재해석 2열

> 2026-11-11 / Claude(시니어 0단계 구현) + Gemini(주니어 4단계 검증·PR). 명세 [UXR-2](../명세/UXR-2_구현명세.md). 브랜치 `step/UXR-2`(main `75887bb` 기준). [PR #160](https://github.com/choise-hun/doloop/pull/160).

## 1. 변경 요약

- `ChordsPage.tsx`: 악기 3버튼에 `instrumentField`·`instrumentKind` 클래스, 튜닝 `.field`를 `<details id="instrument-settings">`(기본 접힘, summary `#instrument-settings-summary` = 악기 설정 · 튜닝명)로 이동. 스케일 `.controls`를 `div.scRows` 4행(`#sc-row-basic`/`-circle`/`-display`/`-play`)으로 재배치(id·핸들러 유지). 재해석 패널을 `riLayout`(`riMain` | `section.riQuiz`)로 감싸고 `#ri-swap`에 `riSwap`, `#qz-opts`에 `riOpts`. `data-align-group`은 명세 §5대로.
- `ChordsPage.module.css`: UXR-2 블록 추가(공용 `.controls/.chips/.chip/.boxrow/.cell/.quiz` 정의 미변경). `.riMain/.riQuiz`를 flex column gap 12px로 보정(2-5-1 제목이 위 카드에 붙던 문제).
- i18n 3언어: `chords.instrumentSettings` (악기 설정 / Instrument settings / 楽器設定).
- 테스트: `chords_instruments.spec.js` 기존 2곳에 summary 펼침 단계 추가(단언 유지), `UXR-2` describe 신설(UXR2-1~8, 총 +21건), UXR2-7에 `LAYOUT_SHOTS=1` 시 1023/1024 캡처 로직 추가.

## 2. 명세와 다른 점 (중요)

| 항목 | 내용 |
| --- | --- |
| **P5 전제 오류** | 명세는 "`.field{display:flex}`가 hidden을 덮어 sc-hand·circle·bars가 보이는 결함"이라 했으나, `frontend/src/styles/tokens.css:175`에 전역 `[hidden]{display:none!important}`가 이미 있어 **현재 코드에 hidden 결함이 없다**. D3 규칙(`.field[hidden]…`)은 효과 없는 중복이라 **추가하지 않았다**. 따라서 **UXR2-4는 "수정 전 Red"가 존재하지 않는다**(D3 규칙을 빼도 Green 확인). UXR2-4는 hidden 회귀 방어 테스트로만 유지 |
| UXR2-9 | 별도 신규 테스트 없이 기존 `layout/chords.spec.js` 전체(탭별 layout 단언)가 통과로 대신함 |
| 테스트 파일 | 명세 표의 `chords-layout.spec.js`는 실제로 `test/e2e/layout/chords.spec.js`. 신규 UXR2 테스트는 `chords_instruments.spec.js`에 둠(명세 §7 명령에 포함되는 파일) |

## 3. 검증 (실제 실행 결과)

| 항목 | 명령 | 결과 |
| --- | --- | --- |
| 빌드 | `cd frontend && npm run build` | 통과 |
| 표적 e2e | `npx playwright test test/e2e/chords_instruments.spec.js test/e2e/layout/chords.spec.js test/e2e/layout/chords_instruments.spec.js` | **109 passed** (1.9m) |
| 레이아웃 e2e (`LAYOUT_SHOTS=1`) | `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/chords.spec.js test/e2e/layout/chords_instruments.spec.js; Remove-Item Env:LAYOUT_SHOTS` | **108 passed** (1.5m), `test-results/layout-shots/`에 4폭·다크 캡처 생성 |
| 1023/1024 캡처 | `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/chords_instruments.spec.js --grep 'UXR2-7'; Remove-Item Env:LAYOUT_SHOTS` | **4 passed** (5.2s), `chords-reint-guest-{1023,1024}.png` 생성 |
| 전체 `test:e2e` 회귀 | `npm run test:e2e` | **617 passed**, 대규모 1 worker 16분 실행 중 타임아웃 발생한 7건 단독 재실행 시 **전수 통과** (816ms, 785ms, 1.1s, 1.0s, 647ms, 662ms, 711ms, 888ms). NA-4는 Windows 클립보드 개행 차이(Linux CI 통과 대상) |
| 단위 테스트 `npm test` | `npm test` | 416 중 414 통과, **2 실패(기존 main과 동일)**: `i18n.test.js` LA-1(전역 한글 잔존), `ch2c3_form_review.test.js` CH-2c-3-2(Windows CRLF 차이). ChordsPage에 신규 한글 0건, i18n 3언어 대칭 100%(LB-1/LB-2 통과) |
| 체크리스트 §7 rg | `ChordsPage.tsx`에서 instrument-settings·scRows·riLayout·riSwap·riOpts | 각 1회 이상 확인 |
| diff 범위 | `git diff --stat -- frontend test` | ChordsPage tsx·css, i18n 3, chords_instruments.spec.js 6파일뿐 |

## 4. 스크린샷 Q1~Q9 검토 (`LAYOUT_SHOTS=1`, 4폭·다크·1023/1024)

검토 대상 이미지: `chords-scale-guest-{1280,1150,768,390}.png`, `chords-scale-guest-1280-dark.png`, `chords-reint-guest-{1280,1150,768,390}.png`, `chords-reint-guest-{1023,1024}.png`, `chords-scale-circle-guest-{1280,1150,768,390}.png` 등.

| # | 질문 | 1280px / 1150px | 1024px / 1023px (경계) | 768px | 390px | 다크(1280) |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 가장 중요한 것 하나가 보이고 강한 버튼이 하나인가 | ○ 악기 연습실 및 현재 선택 탭 명확 | ○ 위계 유지 | ○ 위계 유지 | ○ 수직 스택 최상단 악기·탭 강조 유지 | ○ 대비 선명 |
| Q2 | 같은 위계 칸 사이 여백이 균등한가 | ○ 16px/12px 일관 | ○ 2열(1024) 및 1열(1023) 여백 균등 | ○ 균등 | ○ 단일 칼럼 여백 균등 | ○ 일관 |
| Q3 | 눈에 걸리는 기준선 어긋남이 없는가 | ○ 스케일 3행 바텀 정렬·BPM/근음 센터 일치 | ○ 1024 재해석 상단 정렬 일치 | ○ 약속대로 래핑 | ○ 세로 스택 정렬 일관 | ○ 일치 |
| Q4 | 위계가 크기·굵기·명도로 구분되는가 | ○ 검정·회색 명도 위계 준수 | ○ 준수 | ○ 준수 | ○ 준수 | ○ 준수 |
| Q5 | 빈 상태가 고장처럼 보이지 않고 다음 행동을 안내하는가 | ○ 프리셋 선택 및 지판 비우기/소리듣기 안내 | ○ 안내 유지 | ○ 유지 | ○ 유지 | ○ 유지 |
| Q6 | 390에서 순서가 의미 순서와 같은가, 768에서 어중간한 열이 없는가 | ○ 3열 카드 및 2열 옵션 균형 | ○ 1024 2열 / 1023 1열 전환 자연스러움 | ○ 3열 카드·2열 옵션 안정적 | ○ 의미 순서(기본→표시→재생) 적층, 1열 안정 | ○ 동일 |
| Q7 | 유채색 1가지 및 지정 용도만 쓰였는가 | ○ 파랑(선택/근음)·주황(울리는 음)만 지정 사용 | ○ 지정 용도 외 없음 | ○ 동일 | ○ 동일 | ○ 동일 |
| Q8 | 컨트롤 곡률과 직각 카드 1px 선 디자인이 조화로운가 | ○ 악기 pill 유지, 다이어그램 직각 1px 선 조화 | ○ 조화로움 | ○ 조화로움 | ○ 악기 3버튼 1줄 pill 유지 | ○ 조화로움 |
| Q9 | 다크 모드에서 칸 경계와 글자 대비가 충분한가 | ○ 경계선 1px 및 글자 명도 충분 | — | — | — | ○ G5a/G5b 통과, 대비 우수 |

- **악기 버튼군 (UXR2-1):** 390/768/1150/1280 4폭 전역에서 3버튼(`기타`/`베이스`/`건반`)이 축소·찌그러짐 없이 1줄 pill 형태로 유지됨.
- **악기 설정 접이식 (UXR2-2·3):** `<details id="instrument-settings">`가 기본 접힘 상태로 summary(`악기 설정 · 기타 (6현)`)만 노출되며, 390px에서는 다음 줄로 안전하게 내려감. 펼침 시 튜닝 선택 가능.
- **스케일 4행 재배치 (UXR2-4·5·6):** 1150px에서 의미별 4행(기본 모드, 순환 옵션, 표시 옵션, 재생 컨트롤)으로 깔끔하게 정렬되며, `#sc-rootonly`와 `#sc-bpm`의 center-y가 완벽히 일치. 390px에서는 가로 넘침 없이 자연스러운 1열 적층.
- **재해석 2열 레이아웃 (UXR2-7·8):** 1024px 이상에서는 좌측 `riMain`(2-5-1 진행 및 3열 카드)과 우측 `riQuiz`(보이싱 퀴즈 및 2열 옵션)가 상단 정렬 2열로 분할. 1023px 이하에서는 매끄럽게 1열로 수직 전환.

## 5. Git 및 PR 처리

1. **구현 커밋:** `feat(chords): UXR-2 악기 버튼군·접이식 설정·스케일 행·재해석 2열` (`2599701`, 6개 파일).
2. **문서 커밋:** `docs(chords): UXR-2 4단계 전체 회귀 및 스크린샷 Q1~Q9 검토 결과 반영`.
3. **PR 게시:** [PR #160](https://github.com/choise-hun/doloop/pull/160) (base `main`) 생성 및 CI 감시 완료.
