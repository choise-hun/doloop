# 결과 UI-1: 공통 레이아웃 정렬 및 탭/푸터 통합

- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **입력:** `개발산출물/명세/UI-1_구현명세.md`
- **근거:** 사용자 요구사항 (2026-11-07), `개발산출물/프론트_정렬규격.md`, `docs/rules/frontend-layout.md`
- **브랜치·PR:** `step/UI-1` → `main`
- **상태:** 완료(머지 시)

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| :--- | :--- | :--- |
| 수정 | `frontend/src/lib/i18n/ko.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': 'DIVE INTO SOUND'` 추가 |
| 수정 | `frontend/src/lib/i18n/en.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': "DIVE INTO SOUND"` 추가 |
| 수정 | `frontend/src/lib/i18n/ja.mts` | `nav.play`를 `'PRACTICE'`로 변경, `'home.tagline': "DIVE INTO SOUND"` 추가 |
| 수정 | `frontend/src/components/layout/AppShell.module.css` | `.themeGroup` 및 `.themeBtn` 사각 스타일 적용 (`border-radius: var(--radius-card)`) |
| 수정 | `frontend/src/pages/HomePage.tsx` | 하드코딩 tagline에 `t('home.tagline')` 적용, 중복 `footer.homeFoot` DOM 제거 |
| 수정 | `frontend/src/pages/HomePage.module.css` | `.sectionBtn` 너비 `100%` 지정, `.subColAction` `width: 100%`, 불필요한 `.homeFoot` 스타일 제거 |
| 수정 | `frontend/src/pages/LogPage.tsx` | `<AppShell variant="default">`로 전환(1120px 확장), `h1.pageTitle`을 `TRAILS`로 변경 |
| 수정 | `test/e2e/layout/shell.spec.js` | `TAB_LABELS`의 `'PLAY'`를 `'PRACTICE'`로 동기화 (T1) |
| 수정 | `test/e2e/layout/home.spec.js` | 단일 푸터(T2) 및 BETTER 버튼 폭 100% 일치(T3) E2E 단언 추가 |
| 수정 | `test/e2e/layout/log.spec.js` | TRAILS 타이틀(T4) 및 1120px 너비(T5) E2E 단언 추가 |
| 수정 | `개발산출물/진행_프론트개선.md` | 단계 표 UI-1 상태 칸 `완료(머지 시)` 갱신 |
| 신규 | `개발산출물/결과/UI-1_공통정렬.md` | 결과 문서 작성 및 체크리스트 대조 감사 |

---

## 2. 확인 명령 출력

### 2.1 프로덕션 빌드 (`npm run build`)
```text
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
vite v5.4.11 building for production...
<script src="/config.js"> in "/index.html" can't be bundled without type="module" attribute
transforming (1) index.htmltransforming (54) ../node_modules/@tanstack/react-query/build/modern/useSuspenstransforming (114) src/components/progressions/PastePanel.tsx✓ 155 modules transformed.
rendering chunks (1)...rendering chunks (2)...rendering chunks (3)...computing gzip size (0)...computing gzip size (1)...computing gzip size (2)...computing gzip size (3)...computing gzip size (4)...computing gzip size (5)...../dist/index.html                            1.74 kB │ gzip:   0.83 kB
../dist/assets/index-Csrof-26.css            89.78 kB │ gzip:  15.36 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-CYTr4HLp.js            761.32 kB │ gzip: 249.62 kB
✓ built in 716ms
```

### 2.2 레이아웃 E2E 검증 (`npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/home.spec.js test/e2e/layout/log.spec.js`)
```text
Running 50 tests using 1 worker

  ✓  18 FT home HomePage.module.css에 링크 파란색 토큰 없음 (0ms)
  ✓  19 UI-1 T2 단일 푸터 검증: 홈 화면에 중복 푸터 없이 단 하나의 footer만 존재 (525ms)
  ✓  20 UI-1 T3 버튼 폭 일치 검증: #betterChordsBtn의 너비가 상위 #modes 리스트 박스의 너비와 일치 (537ms)
  ✓  39 UI-1 T4 TRAILS 타이틀 검증: LogPage의 h1 텍스트가 TRAILS인지 검증 (549ms)
  ✓  40 UI-1 T5 1120px 레이아웃 검증: LogPage 메인 컨테이너 최대 너비가 1120px (1.0s)
  ✓  41 W1-1 390px 탭 바: 5칸·순서·화면 바닥 고정 (595ms)
  ✓  42 W1-2 390px 위 메뉴 한 줄·기능 메뉴 숨김·계정 보임 (561ms)
  ✓  43 W1-5 390px 끝까지 내리면 푸터가 탭 바 위에 보임 (575ms)
  ✓  44 W1-1 768px 탭 바: 5칸·순서·화면 바닥 고정 (585ms)
  ✓  45 W1-2 768px 위 메뉴 한 줄·기능 메뉴 숨김·계정 보임 (557ms)
  ✓  46 W1-5 768px 끝까지 내리면 푸터가 탭 바 위에 보임 (560ms)
  ✓  47 W1-3 1150px 탭 바 없음·위 메뉴에 기능 메뉴 (561ms)
  ✓  48 W1-3 1280px 탭 바 없음·위 메뉴에 기능 메뉴 (545ms)
  ✓  49 W1-4 390px 현재 화면 탭만 aria-current (554ms)
  ✓  50 W1-6 탭 바 링크 = 위 메뉴 링크 (571ms)
  50 passed (30.9s)
```

### 2.3 단위 테스트 (`npm test`)
```text
> guitar-chord-lab@1.0.0 test
> node --test test/*.test.js

ℹ tests 380
ℹ suites 60
ℹ pass 380
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3774.234083
```

---

## 3. 스크린샷 검토 (규격 §6, `LAYOUT_SHOTS=1`)

확인 캡처:
- `home-guest-{390, 768, 1150, 1280}.png`, `home-userData-1280-dark.png`
- `log-guest-{390, 768, 1150, 1280}.png`, `log-userData-1280-dark.png`

| 화면 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **home** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **log** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

- **Q2 여백 & Q3 기준선 (D5 버튼 폭):** `HomePage`의 `#betterChordsBtn`과 `#betterPlayerBtn`이 상위 목록 박스(`100%`)와 정확히 동일한 가로폭으로 확장되어 하단 정렬 기준선이 견고하게 일치함.
- **Q8 필·곡률 (D3 테마 토글 사각화):** `AppShell` 푸터의 테마 토글 버튼(`.themeGroup`, `.themeBtn`)이 `var(--radius-card)`로 변경되어 둥근 필(pill)이 아닌 정돈된 직각 사각 형태로 통일됨.
- **Q3 기준선 & 레이아웃 확장 (D2 LogPage 1120px):** `LogPage`가 기존 840px(`narrow`)에서 1120px(`default`, `--container-max`)로 확장되어 홈 및 기타 페이지와 동일한 외곽 컨테이너 그리드를 형성함.

---

## 4. 체크리스트 대조 감사 (Evidence)

| 체크리스트 항목 | 검증 기준 및 결과 | 증거 (`파일명:라인번호`) |
| :--- | :--- | :--- |
| **D1: nav.play PRACTICE 통일** | ko, en, ja 사전에서 `nav.play` 텍스트를 'PRACTICE'로 일괄 변경 | `ko.mts:8`, `en.mts:9`, `ja.mts:9` |
| **D2: LogPage 1120px 통일** | `AppShell variant="narrow"`를 `variant="default"`로 전환하여 1120px 정렬 | `LogPage.tsx:435` |
| **D3: 단일 사각 푸터 토글** | `HomePage.tsx` 중복 footer 제거 및 AppShell 테마 토글 `border-radius: var(--radius-card)` 적용 | `HomePage.tsx:983`, `AppShell.module.css:103`, `113` |
| **D4: home.tagline i18n 연결** | 하드코딩 텍스트 제거 및 `{t('home.tagline')}` 호출 | `HomePage.tsx:510`, `ko.mts:941`, `en.mts:927`, `ja.mts:927` |
| **D5: BETTER 버튼 폭 100%** | `.sectionBtn`의 `width: 100%; box-sizing: border-box; min-width: 0;` 적용 및 `.subColAction` `width: 100%` | `HomePage.module.css:624`, `632-634` |
| **D6: LogPage TRAILS 헤더** | `h1.pageTitle` 텍스트를 `Log`에서 `TRAILS`로 변경 | `LogPage.tsx:438` |
| **T1: 탭 명칭 검증** | shell.spec.js `TAB_LABELS` 2번째 레이블 `PRACTICE` 단언 동기화 | `shell.spec.js:6` |
| **T2: 단일 푸터 검증** | home.spec.js `footer` 요소 단일 개수(`toHaveCount(1)`) 검증 | `home.spec.js:41-47` |
| **T3: 버튼 폭 일치 검증** | home.spec.js `#betterChordsBtn` 너비와 `#modes` 너비 일치(`<= 1px`) 검증 | `home.spec.js:49-59` |
| **T4: TRAILS 타이틀 검증** | log.spec.js `h1` 텍스트 `TRAILS` 일치 검증 | `log.spec.js:39-45` |
| **T5: 1120px 너비 검증** | log.spec.js `main` 컨테이너 너비 1120px 일치(`<= 1px`) 검증 | `log.spec.js:47-55` |

---

## 5. 명세와 달라진 점

- 없음. 명세의 D1~D6 및 T1~T5 검증 요구사항을 100% 충실히 구현하고 골격 코드를 축약 없이 보존함.

---

## 6. 다음 step에 넘길 것

- **UI-2**: 플레이어 프리셋 UI + 세션/테이크 레슨카드 연동 (`PracticePage.tsx`, `SongRecordParts.tsx`, `NotesPage.tsx`).
