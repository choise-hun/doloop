# 결과 — CM-UI 독립 커뮤니티와 세션 공유 구현 및 검증

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
