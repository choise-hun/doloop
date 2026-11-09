# CH-A — CAGED 선택기 화면 명세

- 작성: 2026-11-09 / 기준 main `30bcfc7`.
- 입력: [계획 CH-A](../../계획/상용_서비스_계획.md), [REQ-1/AC-1](../요구사항_명세_초안.md), [정렬 규격](../프론트_정렬규격.md) §1·§3·§5-4·§6.
- 선행: PR #141은 choise-hun가 2026-11-09 07:38 KST 머지. 최신 head `2e38a05` CI 42531003771 성공(문서 변경으로 제품 jobs skipped). 제품 변경 CI 42530210412 Node 22/24·E2E·Kotlin·Docker·CI ok 성공도 별도 확인했다.

## 1. 현행 코드와 변경 경계

| 근거(main 기준) | 판단·변경 |
| --- | --- |
| `frontend/src/pages/ChordsPage.tsx:282` scSeqNotes, `:378` toggleScPlay, `:338` scNow → DiagramNote.now | 오디오 순서·현재음 표시에 필요하므로 그대로 보존 |
| `ChordsPage.tsx:312` scMilestoneSummary, `:1145` 요약/격자 JSX | 화면 전용 memo와 import, 요약·#sc-seq JSX 제거 |
| `ChordsPage.tsx:1243` CAGED 선택기 | 이벤트·disabled·aria-pressed를 보존하여 지판 직후/범례 직전에 이동 |
| `ChordsPage.tsx:1609` #tone-seq, `ChordsPage.module.css:313` .seq, `:474` .seqn | 코드톤이 사용하므로 보존. 화면 전용 .seqSummary만 제거 |
| `frontend/src/components/chords/ChordDiagrams.tsx:186` formatBlockSeqSummary export | 기존 export 계약을 유지. 페이지 import만 제거 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` chords.cagedSeqAria | 전체 참조 조회 후 세 언어의 죽은 키만 제거 |
| `test/r2_chords.test.js:56` R2-C3 | 이전 #sc-seq 존재 단언은 새 요구의 부재 단언으로 교체. 31스텝 계산·음정 단언 유지 |

API 경로·DTO·필드·오류 상태 코드·DB·함수 시그니처·export·파일 경로는 변경하지 않는다. 서버의 harmMinor/melMinor block 400 계약과 프런트의 전체 지판 선택은 별개이며 그대로 유지한다. 사용자 데이터·인증·외부 I/O 경로 변경 없음. A/B 격리 재검수 및 AV 재실행은 N/A.

## 2. 진입·상태·접근성

- `/chords.html#scale` 및 기존 탭/저장 탭 진입 유지. 게스트·로그인·유료 여부에 따른 차이 없음.
- 로딩: 기존 동기 로컬 계산, 별도 요청/스켈레톤 추가 없음. 성공: 전체 지판+5블럭, 기본 블럭 1 선택 유지.
- 미지원 harmMinor/melMinor: scEffBlock=0을 렌더 때 적용, 1~5 비활성·전체 선택·기존 안내 노출. 지원 스케일 복귀 시 기존 scBlock 선택 보존.
- 빈 노트: 기존 빈 지판/재생 no-op 동작 유지. 서버/네트워크 실패 상태 추가 없음.
- 선택기는 native button, type=button, aria-pressed 및 disabled 유지. 번역된 선택기 제목으로 role=group의 접근 가능한 이름을 제공한다. Tab/Enter로 선택 가능하고 기존 포커스 표시 유지.
- 재생/정지, 기타 pluck·베이스 bassPluck, 5도권 모드·현재음 하이라이트·탭 전환 시 transport 정리 보존. 본 변경은 기존 transport 알고리즘을 확장하지 않는다.

## 3. 배치 약속

| 상태 | 390 / 768 / 1150 / 1280 |
| --- | --- |
| 기본·전체 지판·1~5블럭·미지원 | 패널은 기존 단일 세로 흐름. 지판 스크롤 상자 → CAGED 제목/선택기/필요시 안내 → 범례 → 슬라이더. 선택기 버튼은 가로 flex-wrap, 기존 DOM 순서 1→2→3→4→5→전체 |
| circle | 기존 바퀴를 지판 위에 유지. 이후 선택기·범례 순서 동일 |

- 지판 스크롤 상자, 선택기 field, 범례에 `scBoardFlow:left,right`를 지정하여 같은 콘텐츠 양끝선을 맞춘다.
- 버튼에 `scBlocks:height`를 지정하여 같은 행 높이를 맞춘다. 모두 최소 높이 44px, gap 6px. 강제 열 수나 nowrap 없음.
- `#sc-block` 전용 CSS 모듈: radius-card(0), 1px solid var(--line), var(--bg), var(--ink), 12~14px/700. 선택 상태는 글자 굵기·밑줄로 표시하고 선/배경 토큰은 유지. hover는 var(--ink) 선, disabled는 기존 사용 불가 표현.
- 기존 다른 chip/pill과 재생 버튼의 형태는 유지. 인라인 style·공통 검사 완화·추가 예외 없음.

검증 중 추가 확인: `ChordsPage.tsx:196` stopAllTransports가 타이머/재생 상태만 정리해 탭 복귀 때 scNow가 남는 현상을 새 동작 spec에서 재현했다. AC-1 현재음 표시의 일관성을 위해 동일 정리 함수에서 setScNow(null)을 함께 호출한다. 재생 순서·음원·주기는 변경하지 않는다.

## 4. 검증 기준

1. 배치 spec을 먼저 작성해 현재 화면에서 실패 확인: #sc-seq/요약 부재, DOM·시각 순서, 같은 패널, 0px/1px/높이·wrap·선택 접근성.
2. 전체 지판과 1~5 선택 시 press/ctx/lowestRoot·블럭 창 변화, harmMinor/melMinor의 전체 폴백/안내/복귀 확인.
3. 실제 Web Audio oscillator 시작을 관찰하고 재생 중 `#sc-board g.nd.now` 확인. 정지·탭 이탈 후 현재음 제거 및 oscillator 추가 시작 중단 확인. 순수 scaleBlockSeq 31스텝 계산 검증 유지. 가청 품질은 headless 검증 범위 밖.
4. 기존 8탭 G0~G8 + A1 검사. 한국어 4폭·다크, 영어/일본어 390/768/1280 선택기 검사. 코드톤 #tone-seq 유지 확인.
5. LAYOUT_SHOTS=1로 4폭+다크 캡처 후 Q1~Q9를 결과 문서에 판정. 이미 완료한 AV 통합 검수 재실행 없음.
