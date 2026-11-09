# CH-B 구현 명세 — 코드 연습실 악기 선택

> 기준: [상용 서비스 계획 CH-B](../../계획/상용_서비스_계획.md), [확장 요구사항 REQ-2/AC-2·AC-3](../요구사항_명세_초안.md). 착수 전 실제 코드 대조: `frontend/src/pages/ChordsPage.tsx`, `frontend/src/components/chords/ChordDiagrams.tsx`, `frontend/src/lib/musicEngine.ts`, `src/main/kotlin/ulevelp/note/KeyboardSvgRenderer.kt`.

## 목표와 범위

코드 연습실 상단에 상위 악기 선택 `guitar | bass | keyboard`를 두고, 선택한 악기에 맞는 튜닝·현 수와 연습 모드만 노출한다. 기타의 기존 8개 모드와 베이스의 기존 기타 지판 기반 연습·bassPluck을 보존한다. 건반에서 scale/tone/reint/tf/prog를 제공하고 건반 다이어그램과 건반 음원을 구현한다.

이번 작업은 프런트 전용이다. API 경로·요청/응답·상태 코드, DB 스키마, 서버 DTO/함수 계약은 변경하지 않는다. 홈의 BETTER 링크와 라우트는 유지한다. CH-A 배치/기능 변경은 포함하지 않는다.

## 현행 근거와 영향 파일

| 파일 | 현재 근거 | 변경 목적 |
|---|---|---|
| `frontend/src/pages/ChordsPage.tsx` | `ChordTabId`/`CHORD_TABS`가 8개 탭을 고정 노출한다. `scInst`와 `dsInst`는 튜닝 ID를 별개 상태로 보유한다. `scTuning` 등은 `CT.TUNING_BY`에서 계산한다. 상단 UI는 `CT.TUNINGS` 칩으로 선택한다. | 상위 악기·악기별 탭/튜닝 하위 선택 및 원자적인 악기 변경/첫 렌더 정규화 적용. 모든 탭의 기존 계산에는 유효 튜닝 전달. |
| `frontend/src/components/chords/ChordDiagrams.tsx` | `FretboardSvg`, `NeckSvg`, `ChordNeckSvg`, `CircleWheelSvg`, `ScaleWheelSvg` 등 프런트 React SVG가 있다. | 키보드 React SVG 컴포넌트 추가. 사용자 음표·레이블을 React text로 렌더링하고 HTML 문자열 삽입 금지. |
| `frontend/src/lib/musicEngine.ts` | `audioEngine`은 `pluck`, `bassPluck`, `bass`, `chord`, `doubleStop`을 노출한다. keyboard 음색 함수는 없다. | 키보드 음원 함수를 추가하고 public audioEngine 내부 타입과 구현을 함께 갱신. 기존 메서드 시그니처·동작 보존. |
| `frontend/src/pages/ChordsPage.module.css` 및 i18n 리소스 | 기존 헤더/칩/탭 스타일과 악기 튜닝 라벨이 있다. | 악기 상위 선택, 하위 튜닝, 탭 그리드 스타일 및 한국어/영어 레이블 추가. 의미 없는 기존 키 제거 금지. |
| `src/main/kotlin/ulevelp/note/KeyboardSvgRenderer.kt` | NOTE_REGEX, MIDI 변환, 검은 건반 피치 클래스, 흰/검은 건반 치수·겹침 순서, split 시 LH/RH 색상/범례, 음 라벨 배치를 정의한다. | 동작 기준으로만 읽는다. 서버 renderer와 API는 바꾸지 않는다. |

## 사용자 동작과 상태

1. 악기 선택은 페이지 헤더의 명확한 버튼 그룹이며 `aria-pressed` 또는 `aria-selected`를 일관되게 제공한다. 포커스 표시와 키보드 조작을 유지한다.
2. 선택한 악기 아래에는 해당 악기의 튜닝/현 수만 하위 선택으로 노출한다. guitar: 6/7현, bass: 4/5/6현, keyboard: 건반 범위 선택이 필요하면 기존 화면 폭·음역을 고려해 작게 한정하고 기본 범위를 제공한다.
3. 지원 탭은 정확히 다음 집합이다.

| 악기 | 지원 탭 |
|---|---|
| guitar | `scale`, `tone`, `matrix`, `circle`, `reint`, `tf`, `ds`, `prog` |
| bass | `scale`, `tone` |
| keyboard | `scale`, `tone`, `reint`, `tf`, `prog` |

4. 악기 전환 시 현재 탭이 새 악기에서 지원되지 않으면 `scale`로 즉시 전환한다. 탭 hash도 지원 탭 범위에서 일관되게 유지한다. 기존 `#prog?...` 진입과 홈 `chords.html` 진입은 계속 동작한다.
5. guitar 진입 기본값은 `g6`. bass는 합리적 기본 `b4`, keyboard는 지정된 기본 범위로 시작한다. 기타/베이스 튜닝이 바뀌면 그 악기의 모든 탭이 같은 유효 튜닝을 읽는다.
6. 악기 변경 핸들러는 kind+tuning+tab을 한 동작으로 갱신한다. 렌더 중에는 stale state를 자식·다이어그램·음원에 전달하지 않는 effective 값을 계산한다. 존재하지 않는 튜닝, 줄 쌍, 블럭, 악기 전용 모드의 첫 렌더 호출을 금지한다.
7. bass 모드에는 scale/tone만 표시한다. tone은 루트·3도·5도·7도와 2NPS 아르페지오만 제공한다. 베이스 지판/4~6현 튜닝과 `bassPluck`을 계속 사용한다.
8. keyboard는 scale/tone/reint/tf/prog를 표시한다. 제공되지 않은 matrix/circle/ds UI/계산을 렌더하지 않는다. 건반 차트의 음정/음명 표시와 해당 음을 누르는 동작은 접근 가능한 라벨을 갖는다.

## 건반 다이어그램 및 음원

- `KeyboardDiagramSvg`를 React SVG로 구현한다. 서버 `KeyboardSvgRenderer`의 MIDI 번호 계산(음이름과 임시표), 검은 건반 pitch class, 흰 건반 먼저/검은 건반 위 렌더 순서, 음역·키 간격·키 크기·레이블 위치, 분리 양손 색상과 범례를 기준으로 한다.
- SVG는 `<svg>/<rect>/<text>` React 노드로 렌더링한다. 입력 문자열을 `dangerouslySetInnerHTML`에 전달하지 않는다. 키/라벨은 React 속성 escape에 맡기고, 선택 입력의 허용 음역을 제한한다.
- 음 배치는 MIDI 기반이다. C/C#/Db 등의 표기와 octave 계산은 서버 renderer와 같은 결과여야 한다. 유효하지 않은 음명은 건반/재생에 전달하지 않고 빈 상태로 안전하게 처리한다.
- 키보드 재생은 기존 음원 생성 구조의 envelope/오디오 컨텍스트 사용 방식을 따른다. `audioEngine.keyboard(midi, when?, dur?)`는 export된 `AudioEngine` 인터페이스와 `createAudioEngine` 반환 객체의 확장이다. 기존 명세에서 이를 export 계약이 아니라고 분류한 것은 오류였으며, 사용자에게 알린 뒤 확장을 승인받았다. 음 고유의 타이밍/길이와 기존 예약 재생을 지원하고, 취소/정지 동작은 기존 재생 정리 경계를 따른다.
- 기존 `ProgressionPlayTab`은 기타 정석 폼 테이블을 읽고 프런트에서 보이싱 경로와 React SVG를 직접 만든다. 서버 SVG를 표시하는 컴포넌트가 아니다. 승인된 선택적 `instrumentKind`로 기타 흐름을 보존하고 건반에서는 코드 도수와 슬래시 베이스에서 MIDI를 직접 구성한다.

## 모드별 적용 경계

- `scale`: guitar/bass는 기존 지판 계산 및 음역을 사용한다. keyboard는 선택 음계의 MIDI 목록을 만든 뒤 새 SVG에 표시하고 개별 음을 keyboard 음원으로 재생한다.
- `tone`: guitar/bass는 기존 코드톤 계산의 기타/베이스 동작을 보존한다. bass에서 요구된 루트/3/5/7과 2NPS 아르페지오만 보인다. keyboard는 코드톤 MIDI를 건반에 표시하고 화음/개별 음 재생을 제공한다.
- `reint`, `tf`: keyboard에서 기존 chord reharmonization/triad forms 모델을 쓸 수 있는지 실제 코드 의존성을 확인하고, 기타 지판에 묶인 UI는 keyboard diagram으로 렌더한다. 기능 모델/API 계약은 바꾸지 않는다.
- `prog`: 기존 progression 데이터와 이동/조옮김·비디오 구간 동작을 유지한다. keyboard에서는 기존 건반 가능 코드 데이터를 다이어그램에 반영하고 해당 코드 재생을 keyboard 음원으로 한다. 기타의 기존 연주 결과도 회귀하지 않는다.
- 미지원 모드를 CSS로 감추는 대신 탭 렌더 배열 자체에서 제외해 포커스/ARIA/비동기 이벤트 대상이 되지 않게 한다.

## 레이아웃·접근성 기준

배치 약속: 상태는 guitar/bass/keyboard × 선택된 탭 × 좁은 화면으로 나눈다. 390/768px에서는 악기 선택·튜닝·탭이 화면 안에서 줄바꿈 가능한 한 열 흐름이고 가로 넘침이 없어야 한다. 1150/1280px에서는 헤더의 악기/튜닝 선택을 왼쪽선에 맞추고 탭 셀은 균일한 grid로 둔다. 다이어그램은 카드 안에서 가로 스크롤 대신 화면 폭에 맞춰 scale 또는 컨테이너 너비를 제한한다. 실제 배치 group은 구현 전 진행 기록에 확정하고, 화면 spec은 레이아웃 변경보다 먼저 만든다.

- 선택 컨트롤은 실제 `<button>` 사용, 선택 상태를 `aria-pressed`/`aria-selected`로 노출, 클릭·Enter/Space·Tab 이동 가능.
- 다이어그램은 `<title>` 또는 동등한 accessible label을 제공. 키 자체를 조작 가능하게 만들면 최소 24px 목표 터치 영역 또는 주변의 별도 재생 버튼을 제공.
- 기존 공통 정렬 규격 G0~G8, A1 및 4개 폭 스크린샷 검토를 적용한다. 기존 CSS 전면 사각화 금지.

## 검증 및 완료 조건

1. 상태 전환 표: guitar→bass에서 `ds`/`prog` 등 비지원 탭을 선택한 뒤 전환 시 첫 렌더 오류 없이 `scale`; keyboard 전환도 같은 규칙. guitar 복귀 시 `g6` 기본/마지막 guitar tuning 동작을 명시해 일관되게 유지.
2. 탭 집합이 위 표와 완전히 일치하고 unsupported tab이 DOM/focus traversal에 없다.
3. 튜닝 전환: 6/7현 기타, 4/5/6현 베이스에서 다이어그램·현 수·선택줄·재생 현 모드가 맞고 stale 값 참조 없음.
4. 건반 단위/범위 경계의 MIDI 계산, 자연음/샤프/플랫, 검은/흰 건반 overlap 순서, split hand 색상, 키 입력·유효하지 않은 음명 처리.
5. 실제 음원 재생: keyboard note/chord, 기존 bassPluck, guitar pluck, `prog` 기존 진입을 확인.
6. 회귀: 기존 코드 진행 화면 SVG 결과와 기타/베이스 코어 모드 유지. CH-A 스케일 CAGED 위치/모양/재생 동작은 건드리지 않는다.
7. 프런트 정렬 spec 실패 확인→구현→검사 통과→390/768/1150/1280 캡처 확인. 테스트 결과와 실제 미실행 범위를 진행/결과 문서에 기록.

## 변경 금지와 결정 관문

### 2026-11-09 실제 코드 대조에서 확인한 export 확장 — 사용자 승인 완료

사용자의 구현 요청은 `DB/API/export 변경이 필요해지면 멈추고 근거와 변경 범위를 제시한다`고 명시했다. 아래 3개를 제시했고, 사용자가 `세 가지 확장 허용 후 구현·검증 계속`으로 명시 승인했다. 이 승인은 진행 기록에도 유지한다.

| 대상·근거 | 현재 계약 | 제안·이유 |
|---|---|---|
| `frontend/src/lib/musicEngine.ts:92` AudioEngine, `:335` createAudioEngine, `:487` audioEngine | pluck/bassPluck/bass/chord/doubleStop/click. keyboard 없음 | `keyboard(midi: number, when?: number, dur?: number): void` 추가. 같은 오디오 컨텍스트와 예약 시간 기준으로 건반 음색을 재생. 기존 메서드 시그니처 유지. |
| `frontend/src/components/chords/ProgressionPlayTab.tsx:26`, `:69` | Props에 active/hash/onNavigate/onOpenMatrix/onOpenTone만 있음 | `instrumentKind?: 'guitar' | 'keyboard'` 추가, 기본 guitar. 선택한 악기에 맞춰 진행 다이어그램·음원을 선택하고 악기 변경 시 재생 정리. 기존 props·호출 유지. |
| `frontend/src/components/chords/ChordDiagrams.tsx:234` 이후 다이어그램 exports | 기타 지판/코드표 컴포넌트만 제공 | `KeyboardDiagramSvg` 신규 named export 추가. MIDI/음 라벨·LH/RH·현재음 입력으로 안전한 React SVG 렌더. 기존 exports 유지. |

승인된 확장에는 DB·서버 API·기존 함수의 필수 인자 변경이 없다. 신규 컴포넌트 props는 notes(pitch 숫자/음명, 선택 text/hand/now), label, 선택 split으로 확정했다. 기존 export를 우회하기 위한 전역 DOM 상태나 중복 오디오 컨텍스트는 도입하지 않았다.

### 구현에서 확정한 동작

- 기타 기본 g6/베이스 기본 b4, 악기 복귀 시 마지막 하위 튜닝 유지. 지원 모드와 hash는 렌더 중 동기 정규화한다. 상태 변경은 React 이벤트에서 함께 갱신한다(`frontend/src/pages/ChordsPage.tsx:165`, `:188`).
- 기존 기타 보이싱 모델/정석 폼은 보존한다. 가변 튜닝을 소비하는 스케일·코드톤·더블스탑은 선택한 6/7현 기타 또는 4/5/6현 베이스 튜닝을 사용한다. 베이스에서는 스케일·코드톤만 노출한다.
- 건반 스케일 기본은 근음의 3옥타브부터 한 옥타브, 전체 범위 선택은 두 옥타브다. 재해석 직접 입력은 C2~B5(36~83) 선택기와 실제 버튼으로 제공한다. 다이어그램은 서버와 같이 최소 두 옥타브를 표시하고 유효 음 범위에 맞춰 확장한다.
- keyboard 2-5-1은 코드 도수로 구성음을 만들고 가이드/펜타토닉/텐션 변형 조건을 적용한다. 기타 프렛 범위 입력은 노출하지 않는다. keyboard 진행 연주의 LH는 C2~B2, RH는 코드 구성음으로 분리한다.
- 2-5-1 결과에는 악기 태그를 함께 저장한다. 전환 직후 태그가 다르면 자식 렌더에 이전 결과를 전달하지 않는다(`ChordsPage.tsx:935`). 미래 코드 재생은 취소 가능한 timeout으로 실행한다.
- LH/RH는 프런트 root/guide 색상과 범례로 구분하고, 현재음은 now 색상으로 표시한다. 서버의 고정 색 코드를 복사하지 않는다.
- 실행·검증 결과: [CH-B 결과](../결과/CH-B.md). 원본 트리와 LF 검증 사본의 결과, 운영/실기기 미실행을 구별한다.

- DB, API 경로/필드/오류 코드, server DTO/응답 의미, export 경로·함수 signature는 이 명세 범위에 없다. 필요한 것으로 드러나면 구현을 멈추고 정확한 기존 계약·근거와 변경 요청을 보고한다.
- 실제 다이어그램/모드가 기타 전용 상태로 심하게 결합되어 요구사항 충족에 server/API 모델 변경이 필요할 때 임의 fallback·가짜 데이터로 처리하지 않는다.
- PR·커밋·push·머지·배포는 이번 `CH-B 착수` 요청만으로 승인되지 않았으므로 별도 지시 전 로컬 범위에 둔다.
