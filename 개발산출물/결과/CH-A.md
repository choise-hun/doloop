# CH-A 검증 결과

- 날짜/환경: 2026-11-09, Windows PowerShell, Node v26.8.1, Chromium/Playwright 1.51.1, 로컬 Node 정적 SPA 서버.
- 기준: main `30bcfc7`, 작업 `feat/ch-a-caged-layout`. [화면 명세](../명세/CH-A_구현명세.md), [실행 기록](../진행_CH-A.md).
- 선행: [PR #141](https://github.com/choise-hun/doloop/pull/141)은 choise-hun가 2026-11-09 07:38 KST 머지. 제품 CI [42530210412](https://github.com/choise-hun/doloop/actions/runs/42530210412) Node 22/24·E2E·Kotlin·Docker·CI ok success. 최신 문서 head `2e38a05` CI [42531003771](https://github.com/choise-hun/doloop/actions/runs/42531003771) success, 제품 jobs skipped를 구분 확인.

## 1. 구현·실패 재현

- 지판 스크롤 상자 → CAGED 선택기 → 범례 순서로 같은 패널에 배치. 선택기만 0px/1px 선·웜 토큰·44px 높이. 그룹 이름/aria-pressed/disabled/native keyboard 조작 보존.
- 화면 전용 요약 memo·import·CSS와 #sc-seq JSX, 참조가 사라진 3개 언어 cagedSeqAria 키 제거. scSeqNotes·scNow 재생 계산과 코드톤 .seq/.seqn 유지. 외부 export·API·DB 변경 없음.
- 구현 전 `npx playwright test test/e2e/layout/chords.spec.js -g 'CH-A' --reporter=line`: 4폭 모두 실패. 부재 기대 0에 #sc-seq/seqSummary 2개 검출.
- 새 동작 spec에서 탭 복귀 후 `g.nd.now` 기대 0/실제 1 재현(기타/베이스). stopAllTransports에서 scNow도 정리한 후 통과. 버튼 배열이 1~5→전체인 것을 확인해 테스트 인덱스 및 명세를 바로잡았다. 프로덕션 배열 순서는 변경하지 않음.

## 2. 명령과 실제 결과

| 명령 | 결과 |
| --- | --- |
| `npm run build` | TypeScript/Vite 성공. 기존 CJS API·config.js script·500KB chunk 경고 유지 |
| `node --test test/r2_chords.test.js test/engine.test.js` | 25/25 통과. 순수 31스텝 길이·시작/최고/최저/종료 음정 단언 유지 |
| `npm test` (원 작업 트리) | 400/403. 2건 생성 JSON 원본 비교는 CRLF/LF, LA-1은 CRLF와 주석 정규식의 상호작용으로 실패. 실패 숨김/단언 수정 없음 |
| `node --test test-results/ch-a-lf-check/test/*.test.js` | 동일 현재 소스·dist를 ignored 검증 사본으로 복사하고 텍스트 개행만 LF로 바꿔 403/403 통과. 원 트리의 무관 파일/설정은 변경하지 않음 |
| `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/chords.spec.js test/e2e/chords_caged.spec.js test/e2e/chords_scroll.spec.js --reporter=json` | 57/57 통과, skip/flaky 0. 기존 8탭 33 + CH-A 배치 4 + 언어 6 + 미지원/circle 8 + 동작 3 + 기존 스크롤 3 |

추가 확인: CH-A 4폭에서 버튼 6개 클릭/선택 도달 4/4 통과. 언어 fixture에 guest를 명시한 뒤 영어/일본어 6/6 재통과. 최초 57개 실행의 언어 상태는 mockApp 기본 로그인 상태였으며 최종 언어 spec은 guest다.

증거: ignored `test-results/ch-a-node.log`, `ch-a-node-lf.log`, `ch-a-target-node.log`, `ch-a-e2e.json`, `layout-shots/chords-scale-*.png`. 이 기록은 로컬 경로로 다른 PC에 git 전달되지 않는다. 저장소에는 명령과 판정만 남긴다.

공통 검사 실패·known·새 예외 0. 57개 테스트의 경고 발생 합계 G5b 38 / G7b 907 / G8 110(중복 상태·폭 포함). 기본 scale 5캡처 분량은 G5b 10 / G7b 76 / G8 10. 기존 range 기본 배경색, 기존 chip·탭·테마의 44px 미만 높이, 헤더 양끝 배치/기존 간격 경고다. 새 CAGED 버튼은 44px·1px·0px 단언 통과. 공통 기준·known·예외를 추가하거나 완화하지 않았다.

## 3. 화면 검토 Q1~Q9

모델이 기본 4폭·다크 PNG를 직접 읽었다. 추가로 영어/일본어 390, 미지원 390, circle 768을 읽었다. 언어 나머지 폭과 미지원/circle 4폭은 자동 배치 검사 통과이며 전부 시각 검토했다고 주장하지 않는다.

| 질문 | 390 | 768 | 1150 | 1280 | 다크 1280 |
| --- | --- | --- | --- | --- | --- |
| Q1 중요 행동·위계 | △ | △ | △ | △ | △ |
| Q2 여백 균형 | ○ | ○ | ○ | ○ | ○ |
| Q3 기준선 | ○ | ○ | ○ | ○ | ○ |
| Q4 명도·굵기 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 빈/미지원 안내 | ○ | N/A | N/A | N/A | N/A |
| Q6 순서·열 구성 | ○ | ○ | ○ | ○ | ○ |
| Q7 색상 역할 | ○ | ○ | ○ | ○ | ○ |
| Q8 형태·1px 사각 셀 | ○ | ○ | ○ | ○ | ○ |
| Q9 다크 대비 | N/A | N/A | N/A | N/A | ○ |

- Q1 △: 기존 선택 탭·악기·모드·재생 등 여러 강한 pill이 남는다. 이번 지정 범위는 #sc-block이며 다른 컨트롤을 일괄 변경하지 않는다. CAGED 선택은 얇은 선·밑줄로 구별되어 검정 채움을 추가하지 않음.
- Q5: 동기 로컬 화면에 별도 빈/로딩 상태 없음. 미지원 390에서 전체 지판 선택·비활성 5블럭·기존 안내 확인. 서버 실패 UI는 변경 없음.
- 390 지판은 기존 가로 스크롤 상자 안에서 표시되고 선택기 버튼은 2열 3행, 768 이상은 한 행. 지판과 선택기의 좌우 기준선 일치. 고정 하단 내비게이션이 full-page 캡처 중간에 보이는 기존 동작은 스크롤/클릭 도달 검증과 구분한다.

## 4. 검증 경계·Git

- 구현/화면 연결: 완료. 게스트 진입, 전체/5블럭·미지원 복귀·키보드·기타/베이스 oscillator 시작·현재음·정지·탭 이탈·코드톤 시퀀스 유지 확인.
- 통합: 서버/DB/API 계약 미변경이므로 CH-A 통합 데이터 검수 N/A. E2E는 mockApp 인증/주변 API 장치이며 실제 서버+격리 DB의 AV 검수를 재실행하지 않았다.
- 운영: 배포·운영 쓰기·추가 유료 분석 미실행. headless oscillator 시작은 가청 음질·실기기 청취 검증을 뜻하지 않는다.
- 커밋·PR·CI·리뷰: 게시 후 이 절에 확인 결과를 추가한다. 머지는 사용자 담당.
