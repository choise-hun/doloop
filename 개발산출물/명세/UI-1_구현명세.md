# UI-1 구현명세: 공통 레이아웃 정렬 및 탭/푸터 통합

- **작업 ID:** UI-1
- **담당:** 주니어 (구현)
- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **근거:** 사용자 요구사항 (2026-11-07), `개발산출물/프론트_정렬규격.md`, `docs/rules/frontend-layout.md`
- **완료 기준:** `npm --prefix frontend run build` 통과 및 `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/home.spec.js test/e2e/layout/log.spec.js` 100% 통과

---

## 0. Pre-flight 5대 관문 점검

| 관문 | 점검 항목 | 결과 및 증거 |
| :--- | :--- | :--- |
| ① 격리·호환 | API 오류 및 앱 격리 경계 | 본 작업은 프론트엔드 UI 정렬 및 i18n 텍스트 변경으로 백엔드 API 변경 없음. 기존 `/api/v1` 에러 응답 및 `app_id = 'ulevelp'` 격리 유지. |
| ② 동시성 | 비동기 레이스 및 상태 정리 | 화면 레이아웃 및 정적 DOM/CSS 변경으로 비동기 API 레이스 상태 발생 없음. |
| ③ 전제 실재성 | 대상 소스 라인 직접 확인 | `AppShell.tsx:14`(`nav.play`), `tokens.css:59`(`--container-max: 1120px`), `HomePage.tsx:510`(`tagline`), `HomePage.tsx:988`(`homeFoot`), `HomePage.module.css:627`(`.sectionBtn`), `LogPage.tsx:435`(`<AppShell variant="narrow"`), `shell.spec.js:6`(`TAB_LABELS`). |
| ④ 작업 줄 충돌 | 활성 PR 및 파일 겹침 | 시니어 Step B-1 (PR #129) 백엔드 전용으로 프론트엔드 파일 겹침 없음. |
| ⑤ 메뉴얼 게이트 | DB/API/시그니처 변경 여부 | DB 스키마 및 백엔드 API 엔드포인트 변경 없음. 순수 프론트엔드 마크업/CSS/i18n 조정. |

---

## 1. 설계 결정 (D표)

| ID | 결정 사항 | 상세 내용 및 이유 |
| :--- | :--- | :--- |
| **D1** | **상단 탭 `PRACTICE` 통일** | `AppShell.tsx`의 2번째 네비게이션 항목 `nav.play`의 다국어 텍스트를 `PLAY`에서 `PRACTICE`로 통일 (ko/en/ja 모두 반영). |
| **D2** | **외곽 컨테이너 1120px 통일** | `LogPage.tsx`에서 `AppShell`의 `variant`를 `narrow`(840px)에서 `default`(1120px, `--container-max`)로 전환. 전 페이지 메인 컨테이너 최대 너비 1120px 일치. |
| **D3** | **글로벌 단일 사각 푸터 토글** | `HomePage.tsx` 하단의 중복 footer(`.homeFoot`) 제거. `AppShell.module.css`의 테마 토글(`.themeGroup`, `.themeBtn`)의 `border-radius`를 pill(9999px)에서 직각/사각(`0px` 또는 `var(--radius-card)`)으로 변경. |
| **D4** | **`HomePage` tagline i18n 연결** | `HomePage.tsx` 510행의 하드코딩된 `DIVE INTO SOUND`를 `t('home.tagline')` 함수로 대체 연결. |
| **D5** | **`BETTER` 버튼 폭 100% 일치** | `HomePage.module.css`의 `.sectionBtn` 너비를 상위 리스트 박스와 1:1로 일치하도록 `width: 100%`, `box-sizing: border-box`로 설정하고 `.subColAction` 여백 정렬. |
| **D6** | **`LogPage` 헤더 타이틀 TRAILS 적용** | `LogPage.tsx` 438행의 `<h1>Log</h1>`을 `<h1>TRAILS</h1>`로 변경. |

---

## 2. 변경 대상 파일 목록

| 파일 경로 | 변경 내용 |
| :--- | :--- |
| `frontend/src/lib/i18n/ko.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': 'DIVE INTO SOUND'` 추가 |
| `frontend/src/lib/i18n/en.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': 'DIVE INTO SOUND'` 추가 |
| `frontend/src/lib/i18n/ja.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': 'DIVE INTO SOUND'` 추가 |
| `frontend/src/components/layout/AppShell.module.css` | `.themeGroup` 및 `.themeBtn` 직각 사각 스타일 적용 (`border-radius: var(--radius-card)`) |
| `frontend/src/pages/HomePage.tsx` | 하드코딩 tagline에 `t('home.tagline')` 적용, 중복 `footer.homeFoot` 제거 |
| `frontend/src/pages/HomePage.module.css` | `.sectionBtn` 너비 `100%` 지정 및 불필요한 `.homeFoot` 스타일 제거 |
| `frontend/src/pages/LogPage.tsx` | `<AppShell variant="default">`로 전환, `h1.pageTitle`을 `TRAILS`로 변경 |
| `test/e2e/layout/shell.spec.js` | `TAB_LABELS`의 `'PLAY'`를 `'PRACTICE'`로 동기화 |

---

## 3. i18n 사전 키 전수 열거 표

| 키 (`I18nKey`) | ko (한국어) | en (영어) | ja (일본어) |
| :--- | :--- | :--- | :--- |
| `nav.play` | `PRACTICE` | `PRACTICE` | `PRACTICE` |
| `home.tagline` | `DIVE INTO SOUND` | `DIVE INTO SOUND` | `DIVE INTO SOUND` |

---

## 4. CSS 및 DOM 배치 약속 표

| 선택자 / 요소 | CSS 속성 변경 | DOM 변경 사항 |
| :--- | :--- | :--- |
| `AppShell.module.css` `.themeGroup` | `border-radius: var(--radius-card);` | 기존 pill 곡률에서 직각 사각 테두리로 변경 |
| `AppShell.module.css` `.themeBtn` | `border-radius: var(--radius-card);` | 기존 pill 곡률에서 직각 사각 버튼으로 변경 |
| `HomePage.tsx` `p.tagline` | 기존 클래스 유지 | 텍스트 노드를 `{t('home.tagline')}`로 교체 |
| `HomePage.tsx` `footer.homeFoot` | (스타일 제거) | DOM 요소 전체 삭제 (단일 글로벌 푸터만 유지) |
| `HomePage.module.css` `.sectionBtn` | `width: 100%; box-sizing: border-box; min-width: 0;` | 상위 리스트 박스와 100% 동일한 폭으로 확장 |
| `HomePage.module.css` `.subColAction` | `width: 100%;` | 중앙 정렬 대신 너비 100% 블록으로 동작 |
| `LogPage.tsx` `AppShell` | `variant="default"` | 840px(`mainNarrow`) 대신 1120px(`mainDefault`) 컨테이너 사용 |
| `LogPage.tsx` `h1.pageTitle` | 기존 클래스 유지 | 텍스트 노드를 `Log`에서 `TRAILS`로 교체 |

---

## 5. 검증 테스트 표

| 테스트 항목 | 대상 파일 | 검증 내용 및 잡아야 할 버그 | 가드 위치 ↔ 단언 위치 |
| :--- | :--- | :--- | :--- |
| **T1: 탭 명칭 검증** | `shell.spec.js` | 상단 탭 및 모바일 탭 바 2번째 레이블이 정확히 `PRACTICE`인지 검증 | `AppShell.tsx:14` ↔ `shell.spec.js:23` (`toHaveText`) |
| **T2: 단일 푸터 검증** | `home.spec.js` | 홈 화면에 중복 푸터가 없고 단 하나의 `footer`만 존재하는지 검증 | `HomePage.tsx:988` 제거 ↔ `home.spec.js` (`locator('footer')` 단일 존재) |
| **T3: 버튼 폭 일치 검증** | `home.spec.js` | `#betterChordsBtn`의 너비가 상위 `#chords` 리스트 박스의 너비와 일치하는지 검증 | `HomePage.module.css:627` ↔ `home.spec.js` (너비 일치 단언) |
| **T4: TRAILS 타이틀 검증** | `log.spec.js` | `LogPage`의 `h1.pageTitle` 텍스트가 `TRAILS`인지 검증 | `LogPage.tsx:438` ↔ `log.spec.js` (`h1` 텍스트 단언) |
| **T5: 1120px 레이아웃 검증** | `log.spec.js` | `LogPage`의 메인 컨테이너 최대 너비가 1120px로 확장되는지 검증 | `LogPage.tsx:435` ↔ `layoutSuite('log')` (G0~G8 정렬 검사 통과) |
