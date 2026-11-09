# CH-B 결과 — 악기 선택·건반 연습

- 확인일: 2026-11-09 / Windows / Codex 단독.
- 대상: `feat/ch-a-caged-layout`, 기반 HEAD `3f57dbc`. CH-B는 미커밋 로컬 변경이며 원격 main은 `b6b034f`.
- 승인: 로컬 구현·검증. 사용자에게 export 확장 3개를 제시했고 `세 가지 확장 허용 후 구현·검증 계속` 답변을 받았다. 커밋·push·PR·머지·배포·운영 쓰기 없음.
- 범위: REQ-2 / AC-2·AC-3. CH-A 제품 구현·AV 검수 반복 없음. 공통 화면 변경에 필요한 기존 화면 회귀만 실행했다.

## 1. 구현 결과

| 항목 | 실제 결과·코드 근거 |
| --- | --- |
| 상위 악기/하위 튜닝 | 헤더에서 guitar/bass/keyboard 선택. 기타 g6/g7, 베이스 b4/b5/b6만 해당 하위 선택에 표시. 기타 기본 g6, 베이스 기본 b4, 악기 복귀 시 마지막 튜닝 유지. `frontend/src/pages/ChordsPage.tsx:165`, `:188` |
| 지원 모드 | 기타 8개, 베이스 scale/tone 2개, 건반 scale/tone/reint/tf/prog 5개. 비지원 탭·패널을 DOM에서 제외하고 비지원 hash도 scale로 정규화. `ChordsPage.tsx:179`, `:258` |
| 첫 렌더 안전 | effective activeTab, 악기별 튜닝, 줄 쌍 정규화. 추가로 2-5-1 검색 결과에 keyboard 태그를 저장하고 현재 악기 결과만 렌더. 건반→기타 전환 시 기타 엔진에 건반 결과를 전달하던 실제 결함 수정. `ChordsPage.tsx:935` |
| 코드톤 | 기존 g6 2NPS 유지, g7 및 베이스 4/5/6현은 실제 open MIDI와 프렛 범위로 줄당 2음을 계산. 건반은 코드 도수 기반 MIDI 아르페지오 사용. `ChordsPage.tsx:483` |
| 건반 SVG | 안전한 React SVG. 서버 renderer 기준의 음명/임시표→MIDI, 흰 건반 뒤 검은 건반 순서, 최소 두 옥타브 자동 범위, 음명/도수·현재음·양손 표시. invalid MIDI/음명 폐기. 프런트 root/guide/now 토큰으로 색상 적용. `frontend/src/components/chords/ChordDiagrams.tsx:8` |
| 건반 모드 | scale: 1/2옥타브·현재음·표시 라벨·근음만 표시. tone: 도수/시작음/퀄리티별 아르페지오. reint: 음 선택·추가/제거·초기화·해석/진행/퀴즈. tf: 기타 프렛 검색에 의존하지 않는 코드 도수·가이드/펜타토닉 필터 보이싱. prog: 코드 도수·슬래시 베이스·조옮김·박/반복·키보드 음원. |
| 음원 | 같은 AudioContext에서 sine partial 3개와 감쇠 envelope로 keyboard 음색 제공. MIDI 0~127·유효 예약 시각/길이 가드. 기존 pluck/bassPluck/chord 계약 유지. `frontend/src/lib/musicEngine.ts:440` |
| 진행 탭 | 선택적 instrumentKind 기본 guitar. keyboard는 기타 폼 테이블 로드 없이 구성음을 계산한다. LH C2~B2, RH 코드음으로 손 영역을 분리하고 악기 변경 시 재생 정리. 기타 진행·슬래시·원본 노트 링크 유지. `frontend/src/components/chords/ProgressionPlayTab.tsx:27`, `:70` |
| 재생 정리 | 악기/튜닝/탭 이탈, 재해석 음 변경/초기화 시 타이머 정리. TF 미래 코드를 미리 AudioContext에 예약하지 않고 취소 가능한 timeout에서 재생. tf 검색도 노출 탭에서 시작하고 검색 전 이전 transport 정리. |
| 접근성·배치 | 헤더 악기 버튼/튜닝 컨트롤 44px, 탭 grid와 roving Tab/좌우/Home/End 이동, ARIA 선택/패널 연결. 건반 직접 입력은 실제 select/button으로 제공. 신규 인라인 style/위험한 HTML 삽입 없음. |

DB·서버 API·기존 필수 인자/호출은 변경하지 않았다. 신규 export 범위는 승인받은 `AudioEngine.keyboard`, 선택적 `ProgressionPlayTabProps.instrumentKind`, `KeyboardDiagramSvg`다.

## 2. 검증 명령과 실제 결과

| 명령·환경 | 실제 결과 |
| --- | --- |
| 신규 레이아웃/전환 spec 선실패 | `#instrument-bass` 부재로 1건 실패 확인 후 구현 |
| `npm run build` | TypeScript/Vite 성공. 기존 Vite CJS/config.js 및 큰 번들 경고 유지 |
| `node --test test/ch_b_audio.test.js test/ch_b_keyboard.test.js test/r0_core.test.js test/r2_chords.test.js test/ch5b_progression_play.test.js test/rz3_spa.test.js` | 관련 검사 41/41, skip 0 |
| 원 트리 `npm test` | 404/407, skip 0. 기존 CRLF 관련 재현/저장본/i18n 주석 파싱 3건 실패. 단언/skip 변경 없음 |
| LF 검증 사본 `npm test` | 406/406, skip 0. 원 트리와 실행된 테스트 이름 집합 차이 없음. 원본 파일의 내용은 유지하고 사본의 CRLF만 LF로 정규화 |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/chords_instruments.spec.js test/e2e/layout/chords_instruments.spec.js --reporter=json` | 39/39, skip 0. 기능 전환 2건 + 9상태×4폭 36건 + 다크 1건 |
| 기존 화면 회귀: `test/e2e/chords_caged.spec.js`, `test/e2e/layout/chords.spec.js`, `test/e2e/progressions.spec.js` | 75건 통과. 같은 실행에서 신규 전환 결함 1건을 발견했고 production guard를 추가한 뒤 신규 전환 spec 재통과 |
| LH 저음 분리 후 추가 확인 | 건반 5모드 E2E 1/1 및 실제 진행 카드 4폭 레이아웃 4/4 통과. Dm7의 LH D2(MIDI 38)/RH D3(MIDI 50) 분리 단언 포함 |
| 문서/변경 검사 | git diff --check, UTF-8(BOM 없음)/LF 및 최종 변경 범위 확인 |

단위 검사는 음원 MIDI/주파수/예약 시간/길이·잘못된 입력 거부·기존 음색 유지와 SVG의 임시표/옥타브/건반 순서·MIDI 경계·빈 상태·escape·손/현재음 상태를 검증했다. 브라우저 검사는 실제 Web Audio oscillator 생성·예약 주파수를 관찰했다. 물리 스피커/실기기 청취, 운영 배포, 서버/DB 사용자 A/B 여정은 이번 범위에서 실행하지 않았다. 사용자 소유 데이터 경로 변경 없음.

원 트리의 기존 3건 실패는 [CH-A 결과](CH-A.md)의 CRLF 한계와 같은 종류다. LF 사본은 `test-results/ch-b-lf-pvqvfsc9/`, 로그는 `test-results/ch-b-node-*.log`에 있다. 사본/로그/캡처는 ignored 로컬 증거이며 다른 PC나 git으로 전달됐다고 간주하지 않는다.

## 3. 화면 검토

- 배치 약속: 악기 선택과 탭 왼쪽선 `instrumentFlow:left`, 버튼 높이 `instrumentButtons:height`, 탭 행 `tabs:top,height`. 390/768/1150/1280에서 130px 최소 탭 grid로 줄바꿈.
- 상태: bass-scale/tone, keyboard-scale/tone/reint/tf/prog, 실제 progression, 빈 reint. 36개 캡처의 4폭 개요와 주요 원본·1280 다크를 직접 확인했다.
- 발견/수정: 390px TF 미리보기 글자가 작아 모바일에서 코드별 세로 배치로 변경. 건반 화면의 기타 전용 CAGED 범례·프렛 상태·손잡이 선택을 정리. 수동 음 추가 버튼의 불필요한 세로 늘어남 수정. 고정 주황 RH를 guide 토큰으로 변경.

| 검토 질문 | 390 | 768 | 1150 | 1280 |
| --- | --- | --- | --- | --- |
| Q1 주요 동작/선택 위계 | ○ | ○ | ○ | ○ |
| Q2 같은 위계의 여백 | ○ | ○ | ○ | ○ |
| Q3 기준선 | ○ | ○ | ○ | ○ |
| Q4 크기·굵기·명도 위계 | ○ | ○ | ○ | ○ |
| Q5 빈 상태의 다음 행동 | ○ | ○ | ○ | ○ |
| Q6 반응형 의미 순서 | ○ | ○ | ○ | ○ |
| Q7 색상 용도 | ○ | ○ | ○ | ○ |
| Q8 곡률·1px 사각 탭 | ○ | ○ | ○ | ○ |
| Q9 다크 대비 | 공통 토큰/1280 표본 | 공통 토큰/1280 표본 | 공통 토큰/1280 표본 | ○ |

자동 레이아웃 실패 0. 최종 39건의 경고는 G5b 8회(베이스 기존 range의 UA 순백 배경), G7b 432회(기존 작은 칩/폼의 44px 권장 미달), G8 127회(기존 간격·줄바꿈), 합계 567회다. 반복 화면별 발생 횟수이며 단일 결함 수가 아니다. 필수 최소/넘침/겹침/금지색/배치 단언을 완화하지 않았고 신규 헤더/직접 음 입력에는 44px 목표를 적용했다. 기존 컨트롤의 일괄 변경은 제외했다. 신규 layout-ignore/known 추가 없음.

캡처: `test-results/layout-shots/ch-b-*.png`, 개요: `test-results/ch-b-visual/`, JSON 보고: `test-results/ch-b-final-report.json`.

## 4. 완료 판정

| 구분 | 판정 |
| --- | --- |
| 구현 | 로컬 완료. 미커밋이므로 PR/원격 CI 근거 없음 |
| 화면 연결 | 기존 chords.html 진입에서 악기 선택→지원 탭→다이어그램/재생 확인 |
| 통합 | Chromium + 로컬 Node 서버의 빌드 화면 + 실제 Web Audio 확인. 인증/API fixture 사용. 서버/격리 DB 여정은 변경 경로가 없어 이번 검증 범위 밖 |
| 운영 확인 | 미실행. 로컬 통과를 배포/운영 인수로 승격하지 않음 |

현재 요청의 로컬 구현·검증 범위 완료. 후속 작업이나 Git 게시를 자동 착수하지 않는다.
