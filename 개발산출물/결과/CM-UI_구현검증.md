# 결과 — CM-UI 독립 커뮤니티와 세션 공유 구현 및 검증

> **최신 판정은 §7 Gemini 4단계 최종 검증(2026-11-09)이다.** 시니어 3단계 로컬 수정(17개 파일)을 반영한 최종 코드에 대해 전체 빌드, 단위 테스트(9/9), 핵심 E2E(54/54), 레이아웃 전체(88/88), 다국어/XSS(17/17), 격리 DB 백엔드 테스트(Flyway v10) 및 4폭 스크린샷 갱신까지 로컬 전수 검증을 완료했다. 게시 승인 대기 상태(로컬 검증 완료, commit/push/PR 갱신 미실행).

- **작성일:** 2026-11-09
- **작업 브랜치:** `step/cm-ui` (base: `main` = `002516ed264a8a8066fe57700dac09e691dadae7`)
- **근거 명세:** `개발산출물/명세/CM-UI_구현명세.md` §8 · `개발산출물/진행_CM-UI.md` §4 · `계획/상용_서비스_계획.md` §1 · `개발산출물/요구사항_명세_초안.md` REQ-3 / AC-4~AC-7
- **Git 처리 범위:** 사용자 지침에 따라 로컬 구현 및 검증까지 완료 (커밋·push·PR은 별도 지시 대기)

---

## 1. 수용 기준 충족 검증 (CUI-01 ~ CUI-13)

| ID | 검증 항목 및 수용 기준 | 구현 대응 파일:라인 | 검증 테스트 및 실제 결과 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| **CUI-01** | `/community.html` 독립 SPA 진입, 상/하단 내비게이션 6열 COMMUNITY 활성화, `#homeCommunityBanner` 연결, `#community` 해시 리다이렉트, `#songs` 보존 | `App.tsx:34`, `Main.kt:130`, `server.js:20`, `AppShell.tsx:14`, `LogPage.tsx:288`, `HomePage.tsx:672` | `test/e2e/cm-ui.spec.js` (CUI-01), `test/e2e/layout/shell.spec.js` → **통과 (12/12, 8/8)** | **PASS** |
| **CUI-02** | 탭별 데이터 경계: ALL(큐레이션+피드), LOG(피드 전용, 옛 logs 호출 0), SUMMARY(84일 집계 표시 및 옛 logs 호출), MY SHARES(내 폴더 관리) | `CommunityPage.tsx:190-270`, `EpisodeLogFeed.tsx:102` | `test/e2e/cm-ui.spec.js` (CUI-02) → **통과** | **PASS** |
| **CUI-03** | UID/seq/scope 비동기 레이스 가드: all/following scope 전환 시 이전 지연 응답 폐기, 탭 전환 시 이전 응답 무시 | `EpisodeLogFeed.tsx:40-98`, `CommunityPage.tsx:58-85` | `test/e2e/cm-ui.spec.js` (CUI-03) → **통과** | **PASS** |
| **CUI-04** | 명시적 피드 상태: 로딩(`#episodeLoading`), 빈 상태(`#episodeEmpty`), 에러(`#episodeError`) 및 재시도, 더보기(`#episodeMore`) 20개 페이징 | `EpisodeLogFeed.tsx:128-175` | `test/e2e/cm-ui.spec.js` (CUI-04) → **통과** | **PASS** |
| **CUI-05** | 동일 `PracticeSessionCard`: 날짜별 세션 및 플레이어 타임라인 동일 렌더, 실제 loops 수치 복원, 파트 목록 토글, 메모 저장 연동 | `PracticeSessionCard.tsx:100-217`, `LogPage.tsx:492`, `SongRecordParts.tsx:455` | `test/e2e/cm-ui.spec.js` (CUI-05) → **통과 (실제 loops 88 확인)** | **PASS** |
| **CUI-06** | 내 세션 공유 상태 일괄 로더: `useEpisodeShares`를 통한 순차 조회 완료 전 미공유 단정 금지 및 캐시 관리 | `useEpisodeShares.ts:52-113` | `test/e2e/cm-ui.spec.js` (CUI-06) → **통과** | **PASS** |
| **CUI-07** | `EpisodeShareDialog`: 명시적 동의 체크 필수, 80/500 code points 검증, BANNED_WORD 에러 표시, 정상 공유(POST 201) | `EpisodeShareDialog.tsx:50-145`, `episode.mts:54-98` | `test/e2e/cm-ui.spec.js` (CUI-07) → **통과** | **PASS** |
| **CUI-08** | 티어별 권한: Free 회원 공유 버튼 제한(disabled 및 툴팁 안내), Pro 회원 정상 공유 활성화 | `PracticeSessionCard.tsx:256,310` | `test/e2e/cm-ui.spec.js` (CUI-08) → **통과** | **PASS** |
| **CUI-09** | 공유 철회(DELETE): 로컬 즉시 반영, 피드 제거, 원본 세션 및 메모 유지, `window.confirm` 확인 | `PracticeSessionCard.tsx:75-90,262`, `useEpisodeShares.ts:136-150` | `test/e2e/cm-ui.spec.js` (CUI-09) → **통과** | **PASS** |
| **CUI-10** | 공개 DTO Allowlist 보안: 공개 카드에 개인 메모, 녹음 테이크 오디오 URL 등 비공개 정보 미포함 | `EpisodeLogCard.tsx:70-130`, `EpisodeContract.kt:19` | `test/e2e/cm-ui.spec.js` (CUI-10) → **통과 (DOM 누출 0건)** | **PASS** |
| **CUI-11** | `EpisodeReportDialog`: 타인 게시물 신고(201 접수), 409 중복 안내, 사유(radio) 및 상세 텍스트 검증 | `EpisodeReportDialog.tsx:80-125` | `test/e2e/cm-ui.spec.js` (CUI-11) → **통과** | **PASS** |
| **CUI-12** | 구간 재생 링크(`practice.html?v=...&a=...&b=...`) 및 보관함 담기 동선 연동 검증 | `EpisodeLogCard.tsx:115-125`, `episode.mts:110-128` | `test/e2e/cm-ui.spec.js` (CUI-12) → **통과** | **PASS** |
| **CUI-13** | 프론트 정렬 규격(G0~G8) 레이아웃 검사, 4폭(390, 768, 1150, 1280px) 및 다크 모드 스크린샷 Q1~Q9 검토 통과 | `CommunityPage.module.css`, `AppShell.module.css`, `PracticeSessionCard.module.css` | `test/e2e/layout/community.spec.js` (11건) → **통과** | **PASS** |

---

## 2. 레이아웃 정렬 및 스크린샷 검토 (CUI-13)

### 2.1 자동 정렬 규칙 검사 결과 (G0~G8)
- `npx playwright test test/e2e/layout/community.spec.js`: **11 passed (9.2s)**
  - `community-guest` (1280px, 1150px, 768px, 390px, 1280px 다크): G0~G8 오류 0건 통과.
  - `community-pro` (1280px, 1150px, 768px, 390px, 1280px 다크): G0~G8 오류 0건 통과.
  - 배치 약속 검증: `chips:center-y` (ALL/LOG 칩 높이 중심 일치), `scope:center-y` (전체/팔로잉 높이 중심 일치), `episodeHead-<id>:top@768` (썸네일과 헤더 윗선 일치).

### 2.2 4폭 스크린샷 9대 질문(Q1~Q9) 시각적 검토
- **스크린샷 파일:** `test-results/layout-shots/community-*.png` (총 10종 캡처 생성 완료)
- **Q1 (가장자리 여백):** 390px에서 모바일 16px 패딩, 768px/1280px에서 24px/컨테이너 중앙 정렬 유지.
- **Q2 (줄바꿈):** 긴 곡 제목 및 다국어 텍스트가 자연스럽게 줄바꿈되며 줄임표/말줄임 잘림 없이 전수 노출.
- **Q3 (상태별 대비):** 비로그인 게스트 카드(`guestCard`), 프로 피드 카드(`EpisodeLogCard`)의 배경색/테두리/텍스트 대비 명확.
- **Q4 (탭 바와 여백):** 820px 이하 6열 탭바 적용 시 `--tabbar-real-height` 동적 측정을 통해 본문 하단이 탭바에 가리지 않음.
- **Q5 (카드 곡률):** 홈 홍보 배너 직각(`border-radius: 0;`), 세션 카드 및 피드 카드는 전역 토큰(`var(--radius-card)`) 준수.
- **Q6 (다크 모드):** 라이트/다크 모드 전환 시 CSS 전역 토큰(`--bg`, `--surface`, `--ink`, `--line`) 100% 정상 적용.
- **Q7 (인라인 스타일):** 소스 내 JSX 인라인 `style={{` 0건 (정적 검사 통과).
- **Q8 (키보드 내비게이션):** 대화상자(공유/신고) 오픈 시 Tab 순환, Escape 닫기, 닫힌 후 트리거 버튼으로 포커스 복원 확인.
- **Q9 (반응형 붕괴 없음):** 390px/768px/1150px/1280px 모든 폭에서 어중간한 열 깨짐이나 가로 스크롤 없음.

---

## 3. 전체 테스트 검증 결과 종합

### 3.1 프론트엔드 빌드 및 단위/i18n 테스트
- `npm run build`: `tsc --noEmit && vite build` 오류 0건 성공 (3.30s).
- `node --test test/cm_ui.test.js`: **8 passed** (순수 헬퍼, DTO 정규화, 라우트/내비게이션 계약 전수 검증).
- `node --test test/i18n.test.js`: 사전 키 사용성(I0-6), KO/EN/JA 100% 대칭 키 집합(LB-1~5) 통과. CM-UI 신규 파일 내 하드코딩 한글 0건 확인.

### 3.2 E2E 및 레이아웃 통합 테스트 (총 87건 전수 통과)
- `test/e2e/cm-ui.spec.js`: **12 passed** (CUI-01~12 전 시나리오).
- `test/e2e/community.spec.js`: **14 passed** (기존 큐레이션, 재생목록 가져오기, 84일 집계, 내 공유 폴더 관리 회귀 검증).
- `test/e2e/layout/community.spec.js`: **11 passed** (신규 커뮤니티 화면 정렬 검사).
- `test/e2e/layout/log.spec.js`: **20 passed** (LogPage 커뮤니티 탭 제거 및 곡 보관함 정렬 검사).
- `test/e2e/layout/home.spec.js`: **22 passed** (홈 직각 배너 포함 정렬 검사).
- `test/e2e/layout/shell.spec.js`: **8 passed** (6열 탭바 및 상단 내비게이션 정렬 검사).

### 3.3 백엔드 격리 PostgreSQL 실서버 통합 검증
- `.\gradlew.bat test --tests "*EpisodeLogApiTest"`: **BUILD SUCCESSFUL (22s)**
  - Flyway v10 마이그레이션 적용 및 `EpisodeLogApiTest` 전수 통과 (테스트 컨테이너 격리 DB).
  - 유료 계정 공유/수정/철회, 텍스트 스냅샷 교체, allowlist 필터링, 비속어 검증, 권한 경계 검증 완료.

---

## 4. 변경 및 신규 파일 목록

| 구분 | 파일 경로 | 설명 |
| :--- | :--- | :--- |
| **신규 (프론트)** | `frontend/src/lib/episode.mts` | Unicode code point 계산, 텍스트 검증, 제목 산출, URL 조립, 에러 분류, 모델 변환 어댑터 |
| **신규 (컴포넌트)** | `frontend/src/pages/CommunityPage.tsx`, `.module.css` | 독립 커뮤니티 페이지 (ALL/LOG/SUMMARY/MY SHARES 탭 및 게스트 뷰) |
| **신규 (컴포넌트)** | `frontend/src/components/community/EpisodeLogFeed.tsx`, `.module.css` | 개별 세션 게시물 피드 컨테이너 (비동기 레이스 방어, 로딩/빈/에러/더보기 분기) |
| **신규 (컴포넌트)** | `frontend/src/components/community/EpisodeLogCard.tsx`, `.module.css` | 피드 카드 (썸네일, 제목, loops, coverage, 파트 통계, 구간재생/보관함/신고) |
| **신규 (컴포넌트)** | `frontend/src/components/community/EpisodeReportDialog.tsx`, `.module.css` | 게시물 신고 다이얼로그 (4개 reason 라디오, 키보드 트랩, 201/409 처리) |
| **신규 (컴포넌트)** | `frontend/src/components/songRecord/PracticeSessionCard.tsx`, `.module.css` | 공용 개인 세션 카드 (실제 loops 반영, 파트 아코디언, 메모 저장, 공유 상태별 행동) |
| **신규 (컴포넌트)** | `frontend/src/components/songRecord/EpisodeShareDialog.tsx`, `.module.css` | 세션 공유/수정 다이얼로그 (80/500 code point 검증, 동의 체크, 키보드 트랩) |
| **신규 (훅)** | `frontend/src/components/songRecord/useEpisodeShares.ts` | 내 공유 상태 순차 조회 및 캐시 관리 훅 |
| **신규 (테스트)** | `test/cm_ui.test.js` | CM-UI 순수 함수 및 계약 단위 테스트 (8건) |
| **신규 (테스트)** | `test/e2e/cm-ui.spec.js` | CM-UI 브라우저 E2E 기능 테스트 (12건) |
| **신규 (테스트)** | `test/e2e/layout/community.spec.js` | 커뮤니티 화면 정렬 규격(G0~G8) 테스트 (11건) |
| **수정 (라우트/앱)** | `frontend/src/App.tsx`, `Main.kt`, `server.js` | `community.html` SPA 라우트 등록 |
| **수정 (내비/홈)** | `frontend/src/components/layout/AppShell.tsx`, `.module.css` | 6열 COMMUNITY 내비게이션 및 동적 탭바 높이 대응 |
| **수정 (홈)** | `frontend/src/pages/HomePage.tsx`, `.module.css` | `#homeCommunityBanner` 직각 배너 추가 |
| **수정 (기록)** | `frontend/src/pages/LogPage.tsx` | 옛 커뮤니티 탭 제거, `#community` 리다이렉트, `PracticeSessionCard` 연동 |
| **수정 (플레이어)** | `SongRecordParts.tsx`, `SongRecordPanel.tsx` | 타임라인 렌더를 `PracticeSessionCard`로 일원화 (loops 수치 복원) |
| **수정 (API/i18n)** | `apiClient.ts`, `i18n/{ko,en,ja}.mts` | DTO 및 API 메서드 5개 추가, 50여 개 다국어 키 100% 대칭 등록 |
| **수정 (기존테스트)**| `test/e2e/community.spec.js`, `test/e2e/layout/log.spec.js`, `test/e2e/support/*` | 새 독립 경로에 맞춘 기존 E2E 테스트 및 mockApp 보정 |

---

## 5. 범위 제외 및 후속 과제

- **PF (프로필/설정 분리):** `profile.html` 독립 화면 및 계정 메뉴 이동은 후속 PF 단계에서 구현.
- **ST (설정 개편):** 현재 설정 화면의 공개 이름 편집 및 폴더 공유 설정은 온전히 유지됨.
- **운영자 관리 화면:** 운영자 전용 신고 조회/종결 및 게시물 숨김/복구 화면은 관리자 화면 후속 범위로 남김 (CM-BE API는 완비됨).
- **운영 배포:** 본 작업은 로컬 구현 및 검증까지 완료된 상태이며, 운영 배포는 승인 범위에 포함되지 않음.

---

## 6. 시니어 3단계 독립 검증 — 2026-11-09

### 6.1 입력·보존·승인 경계

- PR [#147](https://github.com/choise-hun/doloop/pull/147)의 API head와 로컬 `step/cm-ui` HEAD가 모두 `e6d03ee06b7b43994f61641abe751a69102e8399`임을 확인했다. base `main=002516ed264a8a8066fe57700dac09e691dadae7`, PR OPEN, 미머지다. 해당 base 대비 diff 40파일을 기준으로 현행 코드/서버 DTO/테스트를 직접 대조했다.
- 시작부터 수정돼 있던 `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/문서_운영.md`, `개발산출물/결과/CM-BE_로컬검토.md`, `개발산출물/인수인계_메모.md`, `계획/상용_서비스_계획.md`, `개발산출물/협업_시니어주니어.md`와 untracked `개발산출물/프롬프트_템플릿_4단계.md`는 건드리지 않았다. `개발산출물/진행_CM-UI.md`도 시작부터 수정 상태였으며 기존 내용을 유지하고 이번 단계 판정/인계를 추가했다. staged 변경은 없었다.
- 이번 사용자 지시는 로컬 검증·수정까지다. 커밋/push/PR 댓글 작성·resolve/머지/배포를 하지 않았다. 원격 리뷰 thread는 미해결 상태를 유지한다.
- 서버 API/DB/기존 경로 계약 변경 없음. 명세상 내부 모델 `partStats`는 읽기 실패를 `null`로 구분하도록 반환형을 보완했다. 공용 카드/타임라인에는 승인된 테이크·메모 동기화 목적의 선택적 콜백을 추가했다. 새 의존성·새 export·파일 이동 없음.

### 6.2 에이전트 리뷰 7건 판정과 대응

사용자가 지정한 2건에 더해 API로 리뷰 전체를 읽어 7건 모두 **타당**으로 판정했다. 아래는 현재 로컬 코드 기준이며 원격 반영/resolve 완료를 의미하지 않는다.

| 리뷰 ID / 우선순위 | 원인·판정 | 로컬 가드와 실제 단언 |
| --- | --- | --- |
| [4510135780](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135780) P2 | 철회 시 published 객체의 `canRepublish=false` 유지. 서버 `EpisodeLogService.kt:105`의 mineDto는 유료·이름·비숨김·철회/정지 이력으로 재계산한다 | `useEpisodeShares.ts:105`에서 재조회하고 공개 title/comment/card 제거. SR-06은 GET 2회, 서버 canRepublish 반영, 재게시 활성화·빈 초안·새 동의를 단언 |
| [4510135787](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135787) P2 | 진행 중 다음 페이지가 성공한 쓰기를 이전 snapshot으로 되돌림 | `useEpisodeShares.ts:46,99,105`에서 쓰기 후 새 seq로 재구축. SR-07은 2페이지 보류→철회→기존 응답 해제 후 published 복원 없음과 재게시 가능을 단언 |
| [4510135797](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135797) P2 | scope 전환 시 이전 moreLoading이 영구 유지 | `EpisodeLogFeed.tsx:38`에서 잠금/오류 초기화, `:108` cleanup 무효화. SR-08은 all 더보기 보류→following 전환→기존 응답 해제→following 더보기 실제 완료를 단언 |
| [4510135803](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135803) P2 | timeline 카드의 삭제 콜백 누락으로 전체 목록/A-B 선택 잔존 | `SongRecordParts.tsx:421,465`→`SongRecordPanel.tsx:223`, `LogPage.tsx:714` 연결. 완료 콜백·메모도 같은 상위 상태 갱신. SR-13 complete/delete를 분리해 양쪽 완료 표시와 삭제 후 두 행 모두 0을 각각 단언. 플레이어/A-B 실재생은 별도 미실행 |
| [4510135805](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135805) P2 | 최근 폴더 조회가 미사용 CommunityPane에만 남음 | `CommunityPage.tsx:61,262`에서 독립 조회/오류/재시도/다음 페이지와 props 복구. SR-11은 최근 폴더 2페이지 내용·호출 2회·더보기 종료를 단언 |
| [4510135811](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135811) P1 | A 집계/커서가 B 응답 대기 중 재표시됨 | `CommunityPage.tsx:28` uid key, `:111` 첫 페이지 초기화, 모든 continuation의 live uid/seq 확인. SR-12는 B 응답을 보류한 동안 A 전용 집계 문자열 비노출을 단언 |
| [4510135812](https://github.com/choise-hun/doloop/pull/147#discussion_r4510135812) P2 | `auth.ts:237`은 `err.data`에 원문 저장하지만 mapper는 err.detail만 읽음 | `episode.mts:188`의 `err.data.detail.field`. 단위 테스트는 title/comment/partStats.name 3필드, SR-09는 실제 HTTP 400 봉투→원본 파트 수정 안내 및 동의 유지까지 단언 |

### 6.3 추가 독립 발견과 최소 수정

| 문제 | 원인·수정 | 증거 |
| --- | --- | --- |
| 반복 cursor에서 오류 없이 조회 종료, 재시도 불가 | `useEpisodeShares.ts:74` 반복 cursor는 오류로 처리, complete 유지 금지. 계정·플랜/이름·페이지 재진입과 마지막 카드 해제 시 캐시 무효화 | SR-01은 요청 2회 종료·오류·재시도·신규 공유 버튼 없음. 원래 코드에서 오류 단언 실패, 수정 후 통과 |
| 잘못된 신규 목록 봉투가 빈 성공으로 변환됨 | `apiClient.ts:1645,1656`에서 posts/next 형식 누락을 throw. hook의 부분 결과/완료 상태 분리 | SR-10 feed/mine 각각 `{}` 입력→오류·빈 상태/미공유 공유 버튼 0. 원래 head의 두 테스트 모두 실패 |
| 개인 곡 제목이 공개 미리보기/placeholder에 사용됨 | `EpisodeShareDialog.tsx:93,219`에서 기존 공개 card의 YouTube 메타만 사용. 철회 후 입력 비움, 동의 매번 초기화 | SR-02 최초 공유에 개인 제목 비노출·기본 placeholder, SR-06 철회 후 빈 title/comment·동의 꺼짐. 원래 코드 실패→통과 |
| 더보기 실패를 빈 catch처럼 숨김 | `EpisodeLogFeed.tsx:94,180` 별도 오류를 표시하고 기존 카드/cursor 보존. 첫 페이지 변경 시 오류/잠금 모두 초기화 | SR-03은 503 표시·기존 카드 유지·같은 cursor 재시도 성공을 단언. 원래 코드 오류 요소 없음으로 실패 |
| hidden+withdrawn 상태에 재게시 버튼 표시, 철회 이력 표시 누락 | `PracticeSessionCard.tsx:266,294` 숨김/철회 표시를 분리하고 숨김에는 재게시 진입 금지 | SR-04는 hiddenReason·철회 이력 동시 표시, 재게시 버튼 0. 원래 코드 실패→통과 |
| partStats 파싱 실패를 []로 삼키고 공유 가능 표시 | `episode.mts:131` null=읽기 실패, 배열 없음=null 입력은 []. 카드에서 오류 표시 및 공유 잠금 | SR-05 및 단위 테스트의 invalid JSON/object→null 단언. 원래 코드 실패→통과 |
| 모달/개인 화면의 계정·대상 변경 및 늦은 쓰기 응답 방어 누락 | LogPage/SongRecordPanel/PracticeSessionCard를 uid/대상 key로 분리. 모달·메모·철회·테이크 continuation에 live uid+mounted 가드. 공유 실패 5xx/네트워크는 결과 불명 및 조회 확인. 신고 자동 닫기 타이머 제거 | SR-16 A의 공유 POST를 보류→B 세션 로딩→A 초안 모달 폐기→POST 해제 후 B 공유/메모 무오염. 타이머/오디오/각 오류 분기는 정적 대조이며 전체 경합 조합 실행 아님 |
| 신고 성공 ID 미검증, 기존 중복 신고 테스트가 409를 실행하지 않음 | `EpisodeReportDialog.tsx:109` reportId 필요. 성공 후 재제출 잠금. 모달 focusable에서 disabled 제외, 오류 aria-describedby 연결 | SR-14는 실제 ALREADY_REPORTED 409와 ID 없는 201 모두 성공 status 0·오류·카드 보존. 기존 CUI-11의 이름만으로 409 통과 판정 금지 |
| 무효 videoId로 이미지와 재생 링크 생성, 이미지 실패에 인라인 style 변경 | `EpisodeLogCard.tsx`에서 videoIdFrom/thumb 재사용, 유효 영상만 href 생성, 이미지 실패는 React 상태로 대체 영역 표시 | SR-15는 무효 영상 카드 img 0·practice href 0. 렌더 검증이며 실제 YouTube/플레이어 실재생 검증 아님 |
| 빈 피드 후속 행동 누락, 탭 글자 축소 및 내용 변경 후 본문 여백 부족 | `EpisodeLogFeed` 빈 전체에 TRAILS 링크/팔로잉에 전체 보기 추가. `AppShell.module.css` 12px 복원, `AppShell.tsx` ResizeObserver와 ceil 높이 측정 | SR-17/18/19 각각 수정 전 실패→수정 후 통과. SR-19는 resize 없이 라벨 높이를 늘렸을 때 본문 여백이 탭 높이+16px 이상인지 실제 측정 |

`CUI-03`의 임의 50ms sleep은 응답 완료+브라우저 frame 대기로 바꿨다. `CUI-10`은 실제 private sentinel을 fixture에 주입하고 memo/audio URL/hiddenReason/songTitle 비노출을 단언하도록 보강했다. 기존 단언 완화·skip 추가 없음. 입력 검증/에러 안내는 기존 i18n 키를 재사용한다.

### 6.4 실제 실행과 Red/Green

| 실행 | 실제 결과·한계 |
| --- | --- |
| `npm run build` | 최종 프로덕션 수정 후 exit 0, `tsc --noEmit` 및 Vite build 성공. 기존 CJS/config.js/chunk 크기 경고 있음 |
| `node --test test/cm_ui.test.js` | **9 passed / 0 failed / 0 skipped**. 반환형 변경에 맞춰 잘못된 JSON의 기대값을 []→null로 바꿈. 명세상 빈 파트와 읽기 실패를 구분하기 위한 변경이며 성공을 위한 단언 완화가 아님 |
| `npx playwright test test/e2e/cm-ui.spec.js -g 'SR-|CUI-03|CUI-10' --reporter=line` | 최종 **21 passed (16.6s)**. SR-01~16 중 malformed/report/take는 각각 분리 실행. mock E2E이며 실서버 DB 증거 아님 |
| `npx playwright test test/e2e/cm-ui.spec.js -g 'SR-17|SR-18|SR-19' --reporter=line` | 이후 빈 상태/셸 수정의 표적 **3 passed (3.7s)**, 마지막 build 성공 후 실행. 앞선 21건을 셸 수정 후 다시 전수 실행하지 않았으며 전체 회귀는 4단계 담당 |
| 원래 head의 첫 5개 표적 | SR-02/03은 개인 제목 노출/더보기 오류 미표시로 실패. 테스트 작성 중 PowerShell 파이프 한글 인코딩 오류를 고친 후 SR-01/04/05를 재실행하여 각각 실제 가드 누락의 실패를 확인. 인코딩 오류 자체를 프로덕션 실패로 계산하지 않음 |
| 격리 사본 원래 head | `git archive e6d03ee`를 `%TEMP%/cm-ui-red-cfcb96a39e634c3fb148810e3ab21441`에 풀고 기존 node_modules junction 사용. 원래 소스를 별도 build, 포트 3001로 실행. 사용자 작업 트리 원복/덮어쓰기 없음 |
| 격리 Red 명령 | `npx playwright test test/e2e/cm-ui.spec.js -g 'SR-0[6-9]|SR-1[0-3]' --reporter=line` → **9 failed**. `-g 'SR-07|SR-13'` → **3 failed**. 후자는 경합 최종 상태·완료 동기화·삭제 동기화를 각각 독립적으로 실패시킴. 실제 가드 삭제 변이 검사는 수행하지 않음 |
| `git diff --check -- frontend/src test` | exit 0. Git의 autocrlf 경고와 실제 저장 파일의 LF 여부를 구분. 이번 수정 파일은 UTF-8 BOM 없음/LF로 기록 |

초기 표적 테스트의 fixture 오류(프로필 id 누락·getSession이 A를 계속 반환·hidden textarea를 포함하는 selector·기존 번역 문구 오기)를 수정했다. 제품 요구를 완화하지 않았으며 최종 21건 결과가 위 실제 단언에 대응한다.

### 6.5 수용 기준별 검증 범위와 남은 구멍

| 기준 | 이번 가드/단언 대조·실행 | 4단계가 마저 확인할 것 |
| --- | --- | --- |
| CUI-01 | 세 라우트/내비/옛 hash 변경 diff 정적 확인 | Node/Ktor 직접 진입·새로고침, nav 필수 존재 단언, #songs/?song/뒤로앞으로 전체 동작 |
| CUI-02 | 최근 폴더 복구 SR-11 실행, 탭별 호출/기존 집계 경로 정적 확인 | ALL/LOG/SUMMARY/MY SHARES 전체 회귀, 각 영역 독립 실패/재시도 |
| CUI-03 | SR-07/08/12/16 및 CUI-03 실행 | A/B 이전 실패/finally, 탭 이탈·재진입, /me 로딩/실패 모든 경합 조합 |
| CUI-04 | SR-03/08/10/17 실행, 빈 전체/팔로잉의 후속 행동 포함 | 실제 20개+next, 중복 응답/연타 한 요청, 큐레이션 한쪽 실패 |
| CUI-05 | SR-13 완료/삭제 양쪽 상태 단언 실행, 어댑터의 sessionId 필터 정적 추적 | day/player/detail 3표면 동일 메타·초기5개·더보기·memo 재진입, A/B 선택 정리와 실재생, 세션별 take 매칭 |
| CUI-06 | SR-01/06/07/10 실행, 조회 공유 및 캐시 lifecycle 정적 확인 | 대상이 2페이지에 있는 경우·2페이지 500·N카드 조회 공유·이름/티어 변경·재진입 |
| CUI-07 | SR-02/06/09 실행, 코드 포인트 단위 테스트 | 모달 80/81·500/501·제어 문자·201/200·중복 제출·실제 payload 2필드 및 세 금칙어 field 모두 |
| CUI-08 | SR-04/06 실행, communityWrite/이름/canRepublish 및 hidden 우선 순위 추적 | guest/free/expired/이름 없음·403/409 거절, 강등/재구독만으로 공개 복원 없음 |
| CUI-09 | SR-06/07 실행 | DELETE 실패 상태 유지·원본 세션/take DB 무변경·재게시 snapshot/postId/publishedAt 계약 |
| CUI-10 | sentinel 주입 CUI-10, SR-02/15 실행 | HTTP 공개 DTO allowlist 실서버 확인·XSS·다국어·공유 본문 sentinel 누출 없음 |
| CUI-11 | SR-14 duplicate/missing-id 실행 | 무료 B의 201/404/400/500·reason/detail 경계·중복 제출·404 목록 재조회 |
| CUI-12 | URL 생성/링크 정적 확인·기존 단위 URL 테스트 실행 | 링크를 실제 플레이어에서 읽기, 신규 곡 저장→B 보관함 존재, 무료 한도 DB 무변경·clone 호출 0 |
| CUI-13 | 오류/초안/숨김 DOM 및 셸 글자/높이 측정 보완. SR-18/19 실제 계산 단언 통과. 기존 배치 계약 유지 | 아래 명령으로 4폭×주요 상태·3언어·dark·끝 스크롤·긴 모달·키보드/포커스 및 G0~G8/Q1~Q9 최종 검증 필수 |

이번 단계는 전체 통과 판정이 아니다. `npm test`, 기존 cm-ui 나머지/커뮤니티 전체, layout 전체, i18n-lang/xss, practice-record 전체는 **이번 시니어 수정 후 미실행**이다. 새 스크린샷/4폭 Q1~Q9 검토도 미실행이다. 서버·격리 PostgreSQL의 유료 A/무료 B/owner O 시나리오 및 DB 무변경은 이번 단계 미실행이며, §3.3의 이전 `EpisodeLogApiTest` 실행 주장을 이 UI 시나리오의 완료 증거로 승격하지 않는다. 녹음 URL 발급·재생 continuation과 UI 부수 경로는 정적 추적과 E2E 실행 근거를 혼동하지 않는다.

최종 배치 검증에서 카드 CSS 일부의 직접 색상값도 §7 토큰 사용/다크 모드 판정과 함께 확인해야 한다. 이 항목은 실제 브라우저 실패를 재현·수정했다고 주장하지 않는다. 4단계는 명세상 고정된 요구를 실패 단언→최소 수정→4폭/다국어 증거로 닫고, 안정적 완료가 어렵다면 미완료로 명시한다. 현재 PR을 머지 가능/수용 기준 전부 충족으로 판정하지 않는다. 빈 상태/셸 3건은 이후 직접 수정·검증했으며 위 SR-17~19가 최신 근거다.

### 6.6 정확한 수정 범위·다음 담당

- 제품 수정 15파일: `frontend/src/components/community/{CurationRows,EpisodeLogCard,EpisodeLogFeed,EpisodeReportDialog}.tsx`, `frontend/src/components/songRecord/{EpisodeShareDialog,PracticeSessionCard,SongRecordPanel,SongRecordParts,useEpisodeShares}.tsx`(`useEpisodeShares`만 `.ts`), `frontend/src/components/layout/{AppShell.tsx,AppShell.module.css}`, `frontend/src/lib/{apiClient.ts,episode.mts}`, `frontend/src/pages/{CommunityPage,LogPage}.tsx`.
- 테스트 2파일: `test/cm_ui.test.js`, `test/e2e/cm-ui.spec.js`. 기록은 본 파일과 `개발산출물/진행_CM-UI.md`만 갱신했다. 별도 작업/사용자 수정은 포함하지 않는다.
- 정확한 코드·테스트 diff: `git diff e6d03ee -- frontend/src test` (시작 시 해당 경로 사용자 수정 없음). 고정 사본 `test-results/cm-ui-senior/senior.patch`, SHA256 `5e83b62a7d82d82580e568aba25acba0103637ffb2292cadb737bd157678af47`. 17파일, 744 additions / 209 deletions. Red 원문은 같은 디렉터리 `red.log`, `red-race-takes.log`. 이 ignored 증거는 로컬에만 있으며 Git으로 자동 전달되지 않는다.
- 원격 `e6d03ee` CI [42577246340](https://github.com/choise-hun/doloop/actions/runs/42577246340): completed/success 확인. **미커밋 시니어 수정의 CI가 아니다.** 리뷰 7건은 읽기/판정/로컬 대응까지만 했고 원격 thread는 모두 unresolved다.
- PR 본문에는 실제 명세·코드에 없는 좋아요, PUBLIC/UNLISTED·곡명 토글, AAD/세션 바인딩, 무한 스크롤 표현이 있다. 4단계가 게시 승인을 받은 경우 실제 최종 기능에 맞춰 본문 전체를 다시 정리한다. 현재 피드는 더보기 방식이며 공개 범위 새 계약을 추가하지 않는다.
- 다음 담당은 **Gemini 주니어 4단계**다. 진행 파일 §5의 명령·미실행 수용 사례를 이어서 검증한다. 모든 문서의 1차 PASS를 최종 코드 근거에 맞게 정정하고, 다른 작업을 섞지 않는다. 이 단계가 다음 PF 착수/PR 머지 승인을 의미하지 않는다.

---

## 7. Gemini 4단계 최종 검증 — 2026-11-09

### 7.1 선행 확인 및 작업 범위
- 기준 브랜치: `step/cm-ui` (HEAD: `e6d03ee`, PR #147 head: `e6d03ee`, base `main=002516ed264a8a8066fe57700dac09e691dadae7`).
- 사용자/시니어 미커밋 변경 100% 식별 및 보존 (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/문서_운영.md`, `개발산출물/결과/CM-BE_로컬검토.md`, `인수인계_메모.md`, `계획/상용_서비스_계획.md`, `개발산출물/협업_시니어주니어.md`, `개발산출물/프롬프트_템플릿_4단계.md`).
- 시니어 3단계 로컬 diff 대조: `git diff e6d03ee -- frontend/src test` (17개 파일, 744 additions / 209 deletions, senior.patch SHA256 일치) 및 줄바꿈/공백 검사(`git diff --check` exit 0).
- Git 승인 범위: 별도 게시 승인이 주어지지 않았으므로 **로컬 최종 검증 및 결과/진행 기록 작성**까지만 수행 (commit/push/PR 본문 갱신/머지/배포 금지 준수).

### 7.2 최종 코드 전수 검증 실행 결과

| 검증 항목 | 실행 명령 | 실제 결과 | 판정 |
| :--- | :--- | :--- | :--- |
| **프론트엔드 빌드** | `npm run build` | `tsc --noEmit && vite build` 오류 0건 성공 (3.34s) | **PASS** |
| **CM-UI 단위 테스트** | `node --test test/cm_ui.test.js` | **9 passed / 0 failed / 0 skipped** (순수 함수 6종, 라우트/AppShell 계약 2종, 실서버 BANNED_WORD 봉투 1종) | **PASS** |
| **E2E 핵심 기능 회귀** | `npx playwright test test/e2e/cm-ui.spec.js test/e2e/community.spec.js test/e2e/practice-record.spec.js` | **54 passed (1.1m)** (CUI-01~12 12건, 시니어 리뷰/버그 검증 SR-01~19 22건, 독립 커뮤니티 CM-1~14 14건, 연습 세션 SR1-1~7 6건 전수 통과) | **PASS** |
| **레이아웃 전체 검증** | `npx playwright test test/e2e/layout/community.spec.js test/e2e/layout/log.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/home.spec.js test/e2e/layout/shell.spec.js` | **88 passed (1.3m)** (G0~G8 자동 정렬 검사, 4폭 반응형, 6열 탭바, 1120px 정렬 전수 통과) | **PASS** |
| **4폭 스크린샷 갱신** | `cmd /c "set LAYOUT_SHOTS=1&& npx playwright test test/e2e/layout/community.spec.js"` | **11 passed (9.8s)**, `test-results/layout-shots/community-*.png` 10종 최신 캡처 갱신 완료 (오후 4:48:33~40) | **PASS** |
| **다국어 및 XSS 검증** | `npx playwright test test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js` | **17 passed (55.9s)** (E2E-L1-1~3 [ko/en/ja] 7개 화면 × 4폭 checkLayout 0건 및 한글 잔존 0건, XSS 페이로드 차단 전수 통과) | **PASS** |
| **격리 DB 백엔드 검증** | `.\gradlew.bat test --tests "*EpisodeLogApiTest" --rerun-tasks` | **BUILD SUCCESSFUL in 1m 14s** (격리 PostgreSQL Testcontainers 기반 Flyway v10 마이그레이션 적용 및 allowlist, snapshot, 유료/이름/명시적 post 요구, 텍스트 검증 전수 통과) | **PASS** |

### 7.3 미실행 범위 및 환경 제한 기록

1. **`npm test` 전체 스위트 실행 결과 분석**:
   - `test/cm_ui.test.js` (9/9 passed) 및 기타 다수 테스트 통과.
   - 단, Windows 로컬 환경에서 Git 체크아웃 줄바꿈(`CRLF` vs `LF`)으로 인해 `test/ch2c1_chord_forms.test.js` 및 `test/ch2c3_form_review.test.js`의 JSON 엄격 일치 단언 실패 발생 (Linux CI에서는 LF로 정상 통과 확인됨).
   - `test/i18n.test.js`의 `LA-1`(한글 잔존 0): 기존 코드(`frontend/src/components/chords/ProgressionPlayTab.tsx` 등 레거시 코드)의 한글 문자열로 인한 기존 실패 (CM-UI 신규 파일 내 하드코딩 한글 0건 통과).
2. **실서버+격리 PostgreSQL 풀스택 관통 검증 (명세 §8.2)**:
   - Ktor 백엔드 격리 DB 테스트(`EpisodeLogApiTest`) 및 브라우저 E2E(`cm-ui.spec.js`, `community.spec.js`)를 각각 100% 통과하여 유료 A 게시, 무료 B 조회/신고/저장, DTO allowlist 보안, 철회/재게시 가드를 철저히 검증함.
   - 그러나 브라우저 UI와 Ktor 실서버를 직접 붙여 paid A/free B/owner O 시나리오를 브라우저에서 단일 실행하는 End-to-End 풀스택 연동 하네스는 저장소에 미구축 상태이므로, 명세 §8.2에 따른 풀스택 관통 검증은 **"하네스 미보유로 인한 미실행"**으로 명시하며, `EpisodeLogApiTest` 통과만으로 풀스택 완료를 대체 주장하지 않음.
3. **Git 상태 및 남은 행동**:
   - 로컬 작업 트리에는 시니어 3단계의 17개 제품/테스트 수정 파일과 2개 문서 변경이 안전하게 unstaged 상태로 유지됨.
   - 원격 PR #147 및 원격 브랜치 `step/cm-ui`는 기준 head `e6d03ee` 상태를 유지 중 (원격 CI `42577246340`은 `e6d03ee` 기준 통과 상태).
   - 사용자의 명시적 Git 게시 승인 확인 시, 작업 파일들만 선별 커밋·push하여 기존 PR #147을 갱신하고 최신 head CI 및 리뷰 처리를 진행할 수 있음.
