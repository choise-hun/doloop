# UI-3 결과: 연습 플레이어 정렬 규격 적용 및 UI/UX 정밀 교정

- **작업 ID:** UI-3
- **담당:** 주니어 (구현)
- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **구현 명세:** `개발산출물/명세/UI-3_구현명세.md`
- **완료 일시:** 2026-11-08

---

## 1. 작업 개요 및 변경 파일

사용자의 6대 지적 사항 및 피드백 메모에 따라 연습 플레이어(`PracticePage`)의 정렬 규격(1120px) 일치, 필 남발 해소(0px 직각 세그먼트화 및 재생 버튼 중심 필 강조), 시작 전 대기 옵션 통합, 시작/끝 라벨 직관화, 구간 초기화 가드, 프리셋 2행 카드 개편(덮어쓰기·수정·삭제), Google Drive 상시 강조 미니멀화를 완료함.

| 파일 경로 | 작업 구분 | 주요 변경 내용 |
| :--- | :---: | :--- |
| `frontend/src/components/layout/AppShell.module.css` | 수정 | `playerShell` 및 `mainPlayer` 폭을 `var(--container-max)`(1120px)로 통일하여 상단 네비/하단 푸터와의 80px 단차 완전 해소 |
| `frontend/src/pages/PracticePage.tsx` | 수정 | `시작/끝` 라벨, 시작 전 대기 옵션(0/3/5/10초), `✕` 해제 가드, 프리셋 2행 카드(선택 100% + 저장/덮어쓰기/삭제), Drive 뱃지 미니멀화 |
| `frontend/src/pages/PracticePage.module.css` | 수정 | 속도·시작끝·트랜스포트 영역의 개별 알약 곡률 제거 및 0px 직각 세그먼트 박스화, 재생 버튼 중심 필 강조 유지, 프리셋 2행 레이아웃 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | `practice.pointStart`, `pointEnd`, `waitLeadNone`, `waitLeadSec`, `clearLoopConfirm`, `presetUpdate`, `presetUpdateConfirm`, `driveConnectedShort` 다국어 키 동기화 |
| `test/e2e/layout/practice.spec.js` | 수정 | 1120px 규격, `시작/끝` 텍스트, 2행 프리셋 구조, 재생 버튼 필/보조 버튼 직각 단언 검증 추가 |

---

## 2. 지적 사항 6종 해결 검증 및 증거 (`file:line`)

| 번호 | 지적 사항 | 해결 내용 및 코드 증거 (`file:line`) |
| :---: | :--- | :--- |
| **1 & 6** | **"연습 플레이어" 타이틀 및 상하단 줄 어긋남** | `AppShell.module.css:12,145`에서 `max-width: var(--player-max)`(1280px)를 `var(--container-max)`(1120px)로 변경하여 상단 네비 바(`.siteNav:26`) 및 하단 푸터(`.siteFoot:89`)와 단 1px의 오차 없이 세로 정렬선 1:1 일치 확립. |
| **2** | **필 남발 문제 (중요 버튼만 필, radius 0 카드)** | `PracticePage.module.css:226-365`에서 배속 4개, A/B 조절 6개, 루프/대기, 트랜스포트 보조 버튼들의 `border-radius: var(--radius-pill)`를 전면 제거하고 0px 직각 세그먼트 박스로 결합. **오직 핵심 주 CTA인 재생/일시정지 버튼(`PracticePage.module.css:500`)만 원형/필 형태를 유지**. 곡 목록 버튼(`ppLibBtn`)도 단정한 직각 사각 버튼으로 정돈. |
| **3** | **-10초 대기 설계 오류 및 시작 전 여유 개선** | 루프 행의 엉뚱한 거대 `[-10s 대기]` 버튼을 제거하고, `PracticePage.tsx:1880`에 시작 전 여유 대기 드롭다운(`#waitSelect`, 0초/3초/5초/10초) 및 카운트다운 연동 구현. `A/B` 표기를 직관적인 `시작`/`끝`(`PracticePage.tsx:1820, 1851`)으로 변경. 구간 초기화 시 실수 방지를 위한 `window.confirm` 가드(`PracticePage.tsx:729`) 적용. |
| **4** | **구간 프리셋 정렬 깨짐 및 수정·삭제 불가** | `PracticePage.tsx:1915` 및 `PracticePage.module.css:780`에서 2행 카드 UI로 전면 개편. 1행 드롭다운이 100% 폭을 확보하여 글자 잘림 해소. 2행에 `[현재 구간으로 덮어쓰기]`, `[+ 새 프리셋 저장]`, `[✕ 삭제]`를 배치하여 프리셋 생성·선택·수정·삭제를 완벽 지원. |
| **5** | **Google Drive 무제한 저장 텍스트 과도한 상시 강조** | `PracticePage.tsx:2013`에서 원색 초록색의 큰 상시 문구를 제거하고, 은은한 미니멀 인디케이터(`Drive 연동됨`, `var(--muted)`, 11px)로 정돈. 마우스 호버 시 툴팁(`title`)으로 상세 안내 제공. |

---

## 3. 검증 결과

1. **프론트엔드 빌드:** `npm run build` 통과 (`tsc --noEmit && vite build` 0건 에러)
2. **단위 테스트:** `npm test` 373개 테스트 100% 통과 (pass 373, fail 0)
3. **E2E 레이아웃 및 기능 테스트:**
   - `npx playwright test test/e2e/layout/practice.spec.js`: 27개 테스트 100% 통과 (G0~G8 반응형 레이아웃 4폭 + T1~T6 기능/정렬 검증)
   - `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/home.spec.js test/e2e/layout/log.spec.js test/e2e/layout/notes.spec.js`: 75개 테스트 100% 통과

```text
Running 27 tests using 1 worker
  27 passed (16.9s)
```
