# UI-3 구현명세: 연습 플레이어 정렬 규격 적용 및 UI/UX 정밀 교정

- **작업 ID:** UI-3
- **담당:** 주니어 (구현)
- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **근거:** 사용자 요구사항 (2026-11-08), `개발산출물/프론트_정렬규격.md`, `docs/rules/frontend-layout.md`, `docs/rules/frontend-state.md`
- **완료 기준:** `npm --prefix frontend run build` 통과 및 `npx playwright test test/e2e/layout/practice.spec.js` 100% 통과

---

## 0. Pre-flight 5대 관문 점검

| 관문 | 점검 항목 | 결과 및 증거 (`file:line`) |
| :--- | :--- | :--- |
| ① 격리·호환 | API 오류 및 앱 격리 경계 | 백엔드 V9 B-1의 `/api/v1/songs/{id}/presets` 및 기존 엔드포인트 연동 유지. 모든 조회는 `app_id = 'ulevelp'` 및 Bearer 인증 격리 유지. |
| ② 동시성 | 비동기 레이스 및 클린업 | 프리셋 수정·삭제 시 `presetReqSeqRef`를 통한 최신 토큰 검증, 카운트다운 타이머 언마운트 클린업 유지. |
| ③ 전제 실재성 | 대상 소스 라인 직접 확인 | `AppShell.module.css:26,89`(`siteNav`, `siteFoot` 1120px), `AppShell.module.css:12,145`(`playerShell` 1280px), `PracticePage.tsx:1549`(`<AppShell variant="player">`), `PracticePage.tsx:1848`(`#btnWaitTimer`), `PracticePage.tsx:1874`(`#presetSection`), `PracticePage.tsx:1917`(`#recDriveBadge`), `PracticePage.module.css:233-470`(개별 버튼들의 pill 속성). |
| ④ 작업 줄 충돌 | 활성 PR 및 파일 겹침 | 현재 `main`에 UI-1, UI-2 머지 완료(`working tree clean`). 타 활성 PR 충돌 없음. |
| ⑤ 메뉴얼 게이트 | DB/API/시그니처 변경 여부 | DB 스키마 및 백엔드 API 시그니처 변경 없음. 사전 승인표 사용자 승인("진행") 완료 후 작업 착수. |

---

## 1. 설계 결정 (D표)

| ID | 결정 사항 | 상세 내용 및 이유 |
| :--- | :--- | :--- |
| **D1** | **`PracticePage` 컨테이너 1120px 정렬 통일** | `AppShell.module.css`에서 `playerShell`과 `mainPlayer`의 최대 너비를 `var(--container-max)`(`1120px`)로 통일. 상단 `siteNav`, 플레이어 헤더, 하단 `siteFoot`의 좌우 경계 및 수직 정렬선(80px 단차) 완전 해소. |
| **D2** | **필(pill) 남발 해소 및 `radius-card` (0px 직각) 세그먼트 박스화** | 속도(`.ppSeg`), 시작·끝 구간 조절(`.ppAb`), 트랜스포트(`.ppTransport`)의 개별 9999px pill 곡률을 제거하고 직각 테두리 일체형 세그먼트 박스로 개편. 오직 가장 중요한 주 액션인 **재생/일시정지 버튼(`id="playBtn"`)만 원형/필 형태를 유지**. 곡 목록 버튼(`id="libBtn"`)도 단정한 직각 사각 버튼(`radius-card`)으로 변경. |
| **D3** | **`A/B` → `시작/끝` 명칭 변경 및 구간 시작 전 여유 대기 통합** | 영문 약어 `A`, `B`를 직관적인 `시작`, `끝`으로 변경. 루프 행에 거대하게 박혀 있던 엉뚱한 독립 `[-10s 대기]` 버튼을 제거하고, 루프 설정 영역에 컴팩트한 `대기 [ 없음 ▾ \| 3초 \| 5초 \| 10초 ]` 옵션으로 자연스럽게 통합. |
| **D4** | **`✕` 구간 초기화(해제) 실수 방지 가드** | `✕` 버튼 누를 시 즉시 삭제로 인한 피로 방지를 위해 `window.confirm(t('practice.clearLoopConfirm'))` 확인 가드 적용. |
| **D5** | **프리셋 영역 2행 카드 개편 (가로 100% 드롭다운 + 덮어쓰기·수정·삭제)** | 드롭다운과 저장 버튼이 한 줄에서 찌그러지던 현상 해소: 1행은 폭 100% 드롭다운(`<select id="presetSelect">`), 2행은 `[+ 새 프리셋 저장]`, 선택된 프리셋이 있을 때는 `[구간 덮어쓰기]` 및 `[✕ 삭제]`(확인 가드 포함) 액션 버튼으로 분리 구성. |
| **D6** | **Google Drive 상시 강조 뱃지 축소 및 미니멀화** | 녹음 라벨 옆의 크고 굵은 초록색 문구 상시 표시를 제거하고, 은은한 미니멀 인디케이터(`var(--muted)`, 11px)로 정돈. |

---

## 2. 변경 대상 파일 목록

| 파일 경로 | 작업 구분 | 변경 내용 한 줄 요약 |
| :--- | :---: | :--- |
| `frontend/src/components/layout/AppShell.module.css` | 수정 | `playerShell`, `mainPlayer`를 1120px(`var(--container-max)`)로 통일하여 상단 네비/하단 푸터 정렬 일치 |
| `frontend/src/pages/PracticePage.tsx` | 수정 | `시작/끝` 라벨, 시작 전 대기 옵션, `✕` 확인 가드, 프리셋 2행 카드(선택 100% + 저장/덮어쓰기/삭제), Drive 뱃지 미니멀화 |
| `frontend/src/pages/PracticePage.module.css` | 수정 | 속도·시작끝·트랜스포트의 개별 pill 제거 및 0px 직각 세그먼트 박스화, 재생 버튼 중심 필 강조 유지, 프리셋 2행 레이아웃 |
| `frontend/src/lib/i18n/ko.mts` | 수정 | 시작/끝 라벨, 대기 시간 옵션, 구간 초기화 확인, 프리셋 덮어쓰기 관련 신규 다국어 키 추가 |
| `frontend/src/lib/i18n/en.mts` | 수정 | 신규 다국어 영문 키 동기화 |
| `frontend/src/lib/i18n/ja.mts` | 수정 | 신규 다국어 일문 키 동기화 |
| `test/e2e/layout/practice.spec.js` | 수정 | 1120px 레이아웃, `시작/끝` 텍스트, 2행 프리셋 구조, 재생 버튼 필 단언 동기화 |

---

## 3. i18n 사전 신규 키 전수 열거 표

| 키 (`I18nKey`) | ko (한국어) | en (영어) | ja (일본어) |
| :--- | :--- | :--- | :--- |
| `practice.pointStart` | `시작` | `Start` | `開始` |
| `practice.pointEnd` | `끝` | `End` | `終了` |
| `practice.waitLeadNone` | `대기 없음` | `No Wait` | `待機なし` |
| `practice.waitLeadSec` | `{sec}초 대기` | `{sec}s Wait` | `{sec}秒待機` |
| `practice.clearLoopConfirm` | `설정된 반복 구간(시작·끝)을 해제하시겠습니까?` | `Clear the set loop points (start/end)?` | `設定された繰り返し区間(開始・終了)を解除しますか？` |
| `practice.presetUpdate` | `현재 구간으로 덮어쓰기` | `Overwrite with Current` | `現在の区間で上書き` |
| `practice.presetUpdateConfirm` | `선택한 프리셋을 현재 구간({range})으로 덮어쓰시겠습니까?` | `Overwrite selected preset with current range ({range})?` | `選択したプリセットを現在の区間({range})で上書きしますか？` |
| `practice.driveConnectedShort` | `Drive 연동됨` | `Drive Linked` | `Drive 連携中` |

---

## 4. CSS 및 DOM 배치 약속 표

| 선택자 / 요소 | 부모 컨테이너 | CSS 클래스 / 속성 | DOM 구조 및 상태 명세 |
| :--- | :--- | :--- | :--- |
| `.playerShell`, `.mainPlayer` | `AppShell` | `max-width: var(--container-max);` | 1120px 공통 너비로 중앙 정렬되어 `siteNav`, `siteFoot`과 1:1 수직 정렬 일치 |
| `#rates` | `div.ppGroup` | `display: grid; border: 1px solid var(--line); border-radius: var(--radius-card);` | 배속 4개가 직각으로 맞닿은 일체형 세그먼트 박스 |
| `.ppPt` | `div.ppAb` | `border: 1px solid var(--line); border-radius: var(--radius-card);` | `−`, `[ 시작 0:12 ]`, `+`가 하나의 직각 박스로 묶인 일체형 세그먼트 |
| `#waitSelect` | `div.ppLoopRow` | `height: 36px; border-radius: var(--radius-card); border: 1px solid var(--line);` | 시작 전 여유 대기 시간 드롭다운 (없음 / 3초 / 5초 / 10초) |
| `#presetSection` | `section.ppCtl` | `border: 1px solid var(--line); border-radius: var(--radius-card); padding: 12px;` | 프리셋 전용 0px 직각 카드 패널 |
| `#presetSelect` | `#presetSection` | `width: 100%; height: 36px; border-radius: var(--radius-card);` | 1행 전체 폭을 차지하는 프리셋 선택 드롭다운 |
| `#btnSavePreset`, `#btnUpdatePreset`, `#btnDeletePreset` | `#presetSection` | `height: 32px; border-radius: var(--radius-card); font-size: 13px;` | 2행에 배치된 프리셋 액션 버튼들 (직각 사각 버튼) |
| `#playBtn` | `div.ppTransport` | `width: 60px; height: 60px; border-radius: var(--radius-pill);` | 트랜스포트 중 유일하게 원형/필 형태로 강조된 주 재생 CTA |
| `#recDriveBadge` | `div.ppLab` | `font-size: 11px; color: var(--muted); font-weight: normal;` | 작고 은은한 Google Drive 연동 표시 인디케이터 |

---

## 5. 검증 테스트 표

| 테스트 항목 | 대상 파일 | 검증 내용 및 잡아야 할 버그 | 가드 위치 ↔ 단언 위치 |
| :--- | :--- | :--- | :--- |
| **T1: 1120px 폭 일치 검증** | `practice.spec.js` | `playerShell` 및 본문 너비가 `1120px` 컨테이너 규격과 일치하고 가로 스크롤이 없는지 검증 | `AppShell.module.css:12` ↔ `practice.spec.js` (G4 및 폭 단언) |
| **T2: 시작/끝 라벨 및 대기 옵션 검증** | `practice.spec.js` | A/B 텍스트가 `시작`/`끝`으로 표시되고, `#waitSelect` 대기 옵션이 정상 동작하는지 검증 | `PracticePage.tsx:1789` ↔ `practice.spec.js` (`#setA`, `#setB` 텍스트 단언) |
| **T3: ✕ 구간 해제 확인 가드 검증** | `practice.spec.js` | 루프 해제 클릭 시 확인 다이얼로그가 호출되는지 검증 | `PracticePage.tsx:handleClearLoop` ↔ `practice.spec.js` (dialog 이벤트 감지) |
| **T4: 프리셋 2행 카드 및 덮어쓰기·삭제 검증** | `practice.spec.js` | `#presetSelect`가 폭 100%를 갖고, 프리셋 선택 시 `#btnUpdatePreset` 및 `#btnDeletePreset`이 노출되는지 검증 | `PracticePage.tsx:#presetSection` ↔ `practice.spec.js` |
| **T5: 재생 버튼 중심 필 검증** | `practice.spec.js` | 패널 내 다른 버튼들의 직각 세그먼트화 및 `#playBtn`의 필 스타일 유지 검증 | `PracticePage.module.css` ↔ `practice.spec.js` |
