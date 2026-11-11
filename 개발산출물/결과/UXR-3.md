# UXR-3 결과 — 연습 화면 배치·선택 폴더 곡 목록

> 2026-11-11 / Claude(시니어 0단계 직접 구현) + Gemini(주니어 4단계 검증·회귀 수정·PR). 명세 [UXR-3](../명세/UXR-3_구현명세.md). 브랜치 `step/UXR-3`.

## 1. 작업 개요

- **목표:** 영상 아래에 재생·녹음 조작을 모으고 오른쪽에는 구간 설정과 선택 폴더 곡 목록을 배치. 서랍 반복 개방과 하단 불필요한 공백을 줄이고 기존 연습 기록은 상단 연습 영역 다음에 전체 폭으로 유지.
- **인계 및 역할:**
  - 시니어 0단계: `PracticePage.tsx`, `PracticePage.module.css`, `apiClient.ts`, `i18n/{ko,en,ja}.mts`, `practice.spec.js`(기본 배치·필터) 구현 및 로컬 커밋(`c6cf939`, `a0ee812`).
  - 주니어 4단계: 알려진 회귀 4건(C4a-5, P4b-1, P4b-4, SR1-4) 수정, `mock-app.js` categories/세션 스텁 보강, 부족한 PL 테스트(PL-03, PL-04, PL-07, PL-09, PL-10) 작성, 전체 빌드/단위/E2E 검증(635 passed), `LAYOUT_SHOTS=1` 4폭 및 다크 캡처 Q1~Q9 판정, PR/CI 마무리.

## 2. 변경 요약

### 시니어 0단계 구현
- **DOM 재배치:** `ppMain` 내부를 `ppStage`(영상·타임라인) → `ppActions`(`#ppPlayCard` 재생 5버튼+단축키 안내, `#ppRecCard` 녹음/Drive) → `ppSide`(`#ppCtl` 속도·A/B·대기·프리셋, `#ppFolderPanel` 선택 폴더 곡 목록) 구조로 재편.
- **CSS Grid/반응형:** 데스크톱(≥961px) 2열 배치, 태블릿/모바일(≤960px) 단일 열 적층. 읽기/Tab 순서 일치.
- **배치 약속:** `practice-top:top@961`(`#videoBox`·`#ppCtl`), `practice-actions:top@961`(`#ppPlayCard`·`#ppRecCard`), `practice-side:left,right@961`(`#ppCtl`·`#ppFolderPanel`).
- **선택 폴더 곡 목록:** `loadSongList`에서 곡과 분류를 단일 요청 세대로 조회, 인라인 폴더 선택 native select(`#folderSelect`), 곡 수(`#folderCount`), 모바일 토글(`#folderToggle`, 기본 접힘, 본문 최대 높이 320px `overflow-y: auto`), 현재 곡 강조(`aria-current`), 곡 전환 잠금(`aria-disabled`).
- **엄격한 Envelope 검증:** `apiClient.listSongs` 및 `categoryList`에서 envelope 부재/오형태 시 예외를 던지도록 하여 성공 0건과 에러를 엄격히 분리.

### 주니어 4단계 회귀 수정 및 테스트 보강
- **`mock-app.js` 보강 (사용자 보고 사항):**
  - `/api/v1/categories`의 GET 요청 기본 응답(`{ categories: [] }`) 등록. (mock에서 빈 응답 `{}` 반환으로 인한 `apiClient.categoryList` 오형태 예외 회귀 방어)
  - `supabaseStub` 내 `fakeSession`을 가변으로 전환하고 `onAuthStateChange` 호출 시 전달된 세션으로 동적 갱신하도록 보강. (계정 전환 시 `getSession()`이 이전 세션을 반환하여 발생하는 계정 경합 오작동 방지)
- **회귀 테스트 4건 수정:**
  - `home-category.spec.js` C4a-5: 홈 분류 클릭 시 플레이어 자동 서랍 개방 대신 인라인 `#folderSelect` 선택 및 모바일 펼침(`#folderToggle aria-expanded="true"`) 기대로 갱신.
  - `player-category.spec.js` P4b-1: 홈 분류 진입 시 서랍 닫힘 유지 + 인라인 선택/펼침 기대로 갱신.
  - `player-category.spec.js` P4b-4: 삭제된 분류 ID로 진입 시 전체 곡(`__all`) 복구 및 `선택한 폴더를 찾을 수 없어 전체 곡을 표시합니다` 안내 문구 노출 검증으로 갱신.
  - `practice-record.spec.js` SR1-4: `mock-app.js`의 categories 기본 응답 등록으로 통과 확인.
- **부족한 PL 테스트 추가 (`test/e2e/layout/practice.spec.js`):**
  - `UXR3-PL03`: 30곡 긴 제목 스크롤(높이 ≤320px, scrollHeight > clientHeight), 목록 내부 스크롤로 마지막 곡 도달 및 선택, 페이지 전체 스크롤 점프 없음 검증.
  - `UXR3-PL04`: 홈에서 미존재 분류 ID 전달 시 `__all` 복구, 안내 문구 표시, 다중 분류 곡 진입 시 임의 폴더 변경 없음 검증.
  - `UXR3-PL07`: A 조회 지연 중 B 로그인 계정 경합 시, A 응답 해제 후 B 화면에 A 곡/데이터 미노출 및 B 데이터 정상 표시 검증.
  - `UXR3-PL09`: 현재 곡 재클릭 시 no-op (불필요한 저장/전환 발생 안 함), 다른 곡 전환 진행 저장 중 곡 버튼 잠금(`aria-disabled="true"`) 및 완료 후 해제 검증.
  - `UXR3-PL10`: guest 및 Drive 미연결 상태 배너 가드, 영상 없음 시 녹음 버튼 비활성화 및 곡 목록 사용 가능 검증.

## 3. 검수 기준 (PL-01 ~ PL-12) 대조 결과

| ID | 검수 항목 및 조건 | 실제 검증 결과 | 판정 |
| --- | --- | --- | --- |
| **PL-01** | 1280·1150 데스크톱 2열: 영상/설정 윗선, 재생/녹음 윗선, 2열 정렬, 트랜스포트 왼쪽, 기록 하단 | `practice.spec.js` UXR3-PL01 (1280px, 1150px) 통과 | **통과 (Green)** |
| **PL-02** | 768·390 및 960↔961 모바일 단일 열: DOM 순서 일치, 기본 접힘, 리사이즈 시 플레이어 노드 및 선택 유지 | `practice.spec.js` UXR3-PL02 통과 | **통과 (Green)** |
| **PL-03** | 긴 폴더/곡 제목·30곡: 높이 ≤320px, scrollHeight > clientHeight, 마지막 곡 도달/선택, 페이지 강제 스크롤 없음 | `practice.spec.js` UXR3-PL03 통과 (높이 320px, scrollHeight 1210px, pageY ≤ 10) | **통과 (Green)** |
| **PL-04** | 직접 진입·홈 분류·삭제된 분류: 기본 전체/전달 분류 선택/삭제 시 전체 복구 및 안내 문구 | `practice.spec.js` UXR3-PL04, `player-category.spec.js` P4b-4 통과 | **통과 (Green)** |
| **PL-05** | 전체/폴더/미분류 필터·곡 수·중복 소속·빈 폴더: 필터 및 곡 수 정확, 현재 곡 강조, 빈 폴더 안내 | `practice.spec.js` UXR3-PL05 통과 | **통과 (Green)** |
| **PL-06** | 곡 GET 실패→재시도, 분류 envelope 오형태는 오류(빈 목록과 구분): envelope 오형태 시 오류 및 재시도 성공 | `practice.spec.js` UXR3-PL06 통과 | **통과 (Green)** |
| **PL-07** | A 조회 중 B 로그인 계정 경합: uid+seq 가드로 A 지연 응답 해제 후 B 화면에 A 데이터 오염 없음 | `practice.spec.js` UXR3-PL07 통과 | **통과 (Green)** |
| **PL-08** | 인라인·서랍 연동: 서랍에서 고른 곡의 폴더를 인라인 선택에 반영, 기존 URL/재생목록 서랍 동선 유지 | 기존 서랍 기능 유지 및 `renderSongItem` itemFolderId 반영 확인 | **통과 (Green)** |
| **PL-09** | 현재 곡 재클릭 no-op, 다른 곡 전환 중 잠금(`aria-disabled`): 전환 중 버튼 비활성화 및 완료 후 해제 | `practice.spec.js` UXR3-PL09 통과 | **통과 (Green)** |
| **PL-10** | guest / Drive 미연결 / 영상 없음 상태 가드: 배너 가드 및 영상 없을 때 녹음 비활성, 목록 사용 가능 | `practice.spec.js` UXR3-PL10 통과 | **통과 (Green)** |
| **PL-11** | 키보드·모바일 접기·다크 접근성: label/aria-current/aria-expanded/controls, 5버튼 크기/모양 유지 | `practice.spec.js` UXR3-PL01·02, 다크 레이아웃 통과 | **통과 (Green)** |
| **PL-12** | 기존 기록·홈 폴더 소비자 회귀: UXR-1 기록 단일화/AB 비교, 홈 분류 회귀 통과 | `home-category.spec.js`, `player-category.spec.js`, `practice-record.spec.js` 전수 통과 | **통과 (Green)** |

## 4. 스크린샷 4폭 및 다크 모드 Q1~Q9 판정

`LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` 실행 결과 생성된 캡처 검토:
`test-results/layout-shots/practice-{userData,userEmpty,guest,guestLocal,empty-guest}-{1280,1150,768,390}.png`, `practice-userData-1280-dark.png`.

| # | 질문 | 1280px / 1150px (데스크톱) | 768px (태블릿) | 390px (모바일) | 다크(1280) |
| --- | --- | --- | --- | --- | --- |
| **Q1** | 가장 중요한 것 하나가 보이고 강한 버튼이 하나인가 | ○ 영상 및 재생 조작 카드가 최우선 시각적 초점 | ○ 영상 및 상단 컨트롤 강조 유지 | ○ 1열 최상단 영상 및 재생 버튼 명확 | ○ 대비 선명 |
| **Q2** | 같은 위계 칸 사이 여백이 균등한가 | ○ 조작 행 12px, 섹션 간 16px 일관 | ○ 16px 수직 카드 간격 균등 | ○ 단일 칼럼 카드 여백 균등 | ○ 일관 |
| **Q3** | 눈에 걸리는 기준선 어긋남이 없는가 | ○ 영상/설정 윗선, 재생/녹음 윗선 정확 일치 | ○ 1열 세로 적층 기준선 일관 | ○ 세로 스택 정렬 일관 | ○ 일치 |
| **Q4** | 위계가 크기·굵기·명도로 구분되는가 | ○ 카드 라벨, 버튼 텍스트, 안내 노트 명도 위계 준수 | ○ 준수 | ○ 준수 | ○ 준수 |
| **Q5** | 빈 상태가 고장처럼 보이지 않고 다음 행동을 안내하는가 | ○ 폴더 비었을 때 "이 폴더에는 곡이 없습니다" 안내 명확 | ○ 안내 유지 | ○ 안내 유지 | ○ 유지 |
| **Q6** | 390에서 순서가 의미 순서와 같은가, 768에서 어중간한 열이 없는가 | ○ 2열 좌(영상·조작)/우(설정·목록) 균형 완벽 | ○ 단일 열, 의미 순서(영상→재생→녹음→구간→목록→기록) 일치 | ○ 모바일 접힘 목록으로 높이 안정화, 1열 완벽 | ○ 동일 |
| **Q7** | 유채색 1가지 및 지정 용도만 쓰였는가 | ○ 활성/선택 파랑 및 녹음 빨강만 지정 용도로 사용 | ○ 동일 | ○ 동일 | ○ 동일 |
| **Q8** | 컨트롤 곡률과 직각 카드 1px 선 디자인이 조화로운가 | ○ 재생 5버튼 직각/곡률 유지, 1px 카드 테두리 조화 | ○ 조화로움 | ○ 조화로움 | ○ 조화로움 |
| **Q9** | 다크 모드에서 칸 경계와 글자 대비가 충분한가 | ○ 1px 테두리 및 텍스트 명도 충분 (G5a/G5b 통과) | — | — | ○ 대비 우수 |

- **961~1150px 구간 관찰:** 재생 카드(`#ppPlayCard`)의 5버튼 너비가 한 줄로 유지되며 깨짐 없음. 녹음 카드(`#ppRecCard`)의 보조 액션(재업로드/파일저장) 및 드라이브 배너가 유연하게 래핑되어 가로 오버플로 없음.
- **모바일(390/768px) 관찰:** `#ppFolderPanel`의 본문이 기본 접힘(`#folderToggle aria-expanded="false"`, `display: none`) 상태로 렌더링되어 긴 곡 목록이 모바일 화면 전체를 차지하지 않음.

## 5. 검증 실행 요약

| 검증 항목 | 실행 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| TypeScript 및 프론트엔드 빌드 | `npm run build` | **통과 (0 errors)** | `tsc --noEmit && vite build` |
| 전체 단위 테스트 | `npm test` | **416 passed / 0 failed** | `test/*.test.js` 58개 스위트 전수 통과 |
| 핵심 관련 E2E 스위트 | `npx playwright test test/e2e/layout/practice.spec.js test/e2e/player-category.spec.js test/e2e/home-category.spec.js test/e2e/practice-record.spec.js` | **66 passed** | 회귀 4건 및 신규 PL 테스트 5건 포함 |
| 레이아웃 캡처 및 회귀 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` | **41 passed** | 4폭 및 다크 스크린샷 정상 생성 |
| 홈 레이아웃 E2E | `npx playwright test test/e2e/layout/home.spec.js` | **21 passed** | 홈 화면 레이아웃 회귀 없음 |
| 커뮤니티 레이아웃 E2E | `npx playwright test test/e2e/layout/community.spec.js` | **11 passed** | 커뮤니티 화면 회귀 없음 |
| 전체 E2E 회귀 테스트 | `npx playwright test` | **635 passed / 0 failed** (10.6m) | categories 엄격 envelope 관련 공용 소비자 회귀 전무 |

## 6. 미실행·기기/인증 의존 항목 (명세 §9 준수)

- **실제 마이크 하드웨어 녹음:** 브라우저 환경 및 실제 오디오 장치 권한 취득이 필요하므로 mock 및 Web Audio/MediaRecorder 스텁으로 검증하였으며, 실제 하드웨어 마이크 입력은 미실행으로 기록합니다.
- **실제 Google Drive OAuth 연동 및 업로드:** 외부 구글 계정 인증 및 토큰 발급 환경에 의존하므로, 드라이브 상태 분기 및 mockApp 배너 노출로 검증하였으며 실제 구글 드라이브 API 업로드는 미실행으로 기록합니다.
