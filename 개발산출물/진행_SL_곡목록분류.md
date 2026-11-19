# 진행 — SL 플레이어 곡 목록·분류 개선

- **목표:** 플레이어 화면의 분류 추가·지정, 곡 목록(폴더 선택·순서·수정), 제목 수정, 연습 세션 삭제 흐름을 사용자 요청 10건(2026-11-19)대로 고친다. 앱 안의 브라우저 기본 선택창(`<select>`)은 공용 선택창으로 바꾼다.
- **근거:** 사용자 요청 2026-11-19(아래 §1 원문 요약), 시안 [명세/SL_시안.html](명세/SL_시안.html), 규칙 [frontend-design](../docs/rules/frontend-design.md)·[frontend-layout](../docs/rules/frontend-layout.md)·[frontend-state](../docs/rules/frontend-state.md)·[backend-kotlin](../docs/rules/backend-kotlin.md), 계획 §4의 "연습 카드(세션) 개별 삭제"(S3b R03)
- **상태:** SL-0 완료(PR #50 머지). **SL-1 4단계 주니어 검증·PR 완료(2026-11-19, `feat/SL-1-player-list-ui`)** — `npm test` 542 pass, `practice.spec.js` 73 passed, 전체 Playwright 944 passed / 1 failed(`i18n-lang.spec.js` `[ja]` 1280px `#presetSelect` `G3` 넘침 `91>87`, 제품 코드 결함으로 시니어 인계). D1 수정 중 `--fill1` 색은 사용자 확인 필요. [결과/SL-1](결과/SL-1.md).
- **step ID:** `SL-` (다른 진행 파일과 겹치지 않음. `PL-`은 이미 사용)
- **배정:** 기본 시니어 원스톱(협업 §1.2). 전체 회귀·PR 정리는 주니어 4단계.

## 1. 요청 10건과 현재 코드 사실

| # | 요청 | 현재 코드 | 계약 변경 |
| --- | --- | --- | --- |
| ① | [곡 목록] 버튼을 [분류]와 같은 크기로 | `#songCatBtn`은 공용 `.ghostBtn`(48px/17px), `#libBtn`만 `.ppLibBtn`이 40px/14px로 줄임(`PracticePage.module.css` `.ppLibBtn`) | 없음 |
| ② | 패널 라벨(속도·구간 반복 등) 조금 키우고 폴더 이름도 거기에 맞추기 | `.ppLab` 12px muted, `.folderName` 700 | 없음 |
| ③ | 분류 창 우측 끝 `EDIT` → 추가·이름 변경·삭제 | `#songCatPop`은 체크 목록만. API `POST/PATCH/DELETE /api/v1/categories`, `PUT /categories/order` 이미 있음 | 없음 |
| ④ | 폴더 박스 ▾ 안쪽 여백 = 글자 여백, 가로는 곡 카드 기준, `폴더 변경`→`폴더 선택` | 기본 `<select id="folderSelect">` | 없음(문구 키) |
| ⑤ | 모든 선택창을 앱 모달로 | `<select>` 31곳(플레이어 2·기록 카드 1·코드 21·진행 2·기록 2·운영 1·커뮤니티 2) | 없음 |
| ⑥ | 곡 드래그 순서 이동, 목록 패널 아래 끝 = 왼쪽 플레이어 아래 끝 | 곡 순서 저장 칸·API 없음, `.folderBody` max-height 320px | **DB·API 추가** |
| ⑦ | 폴더 제목 줄 삭제, 박스 안에 `이름 · N곡`, 목록을 박스에 붙임 | `.folderHead`(이름·N곡·펼치기) | 없음 |
| ⑧ | 목록 `EDIT` → 수정 중 표시, 카드 클릭 시 수정 창(제목·분류·삭제) | 카드 클릭 = 곡 전환. `PATCH /songs/{id}`(title·categoryIds), `DELETE /songs/{id}` 있음 | 없음 |
| ⑨ | 제목 아래 저장 시간 빼고 밑줄 `제목 수정` | `#syncState`에 "저장됨 HH:MM"·오류 | 없음 |
| ⑩ | 이 곡의 연습 기록 세션 카드 우측 하단 ✕ → 확인 → 삭제 | 세션 삭제 API 없음. takes·공유 카드·첨부는 `ON DELETE CASCADE`, 곡 삭제(`SongService.delete`)가 저장소 휴지통·공유 첨부 정리를 함(Notion은 폐기 기능이라 새 경로에 넣지 않음) | **API 추가** |

## 2. 결정 (SL-0)

| ID | 질문 | 추천 | 사용자 결정 |
| --- | --- | --- | --- |
| D1 | ⑧ 수정 중 표시 | A 스파인을 `--fill2`로 바꾸고 라벨 옆 `· 수정 중`, 카드 왼쪽 3px 표시 | 추천안 확정 |
| D2 | ② 라벨 크기 | 13px(글자만, 상자 크기 불변) | 추천안 확정 |
| D3 | ⑤ 선택창 위치 | A 박스 바로 아래, 박스와 같은 가로의 작은 창(모든 폭) | 추천안 확정 |
| D4 | ⑥ 드래그 방식 | A EDIT 중에만 왼쪽 핸들로 끌기(일반 모드 탭=곡 전환·터치 스크롤과 충돌 방지) | 추천안 확정 |
| D5 | ⑥ 순서 저장 단위 | 곡마다 순서 1개(`songs` 순서 칸 + 순서 저장 API) | 추천안 확정 |
| D6 | ⑩ 세션 삭제 범위 | 곡 삭제와 같은 정리 규칙(녹음 기록·공유 카드/첨부). Notion은 폐기 기능이라 제외 | 추천안 확정 |
| D7 | 단계 분할 | 아래 §3 | 추천안 확정 |
| D8 | ⑨ "저장됨" 시각 | 표시 삭제, 오류 문구만 같은 줄에 유지 | 추천안 확정 |
| D9 | ⑦ 펼치기/접기 버튼 | 삭제(목록이 패널 높이를 채우고 안에서 스크롤) | 추천안 확정 |

## 3. 단계 표

| Step | 내용 | 담당 | 입력 → 결과 | 완료 기준 | 권장 effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| SL-0 | 시안·결정 | 시니어 | 요청·코드 조사 → [SL_시안.html](명세/SL_시안.html), 이 파일 §2 | 사용자 D1~D9 확정 | 중간 | 완료(PR #50) |
| SL-1 | 화면만: ①②③④⑦⑧(수정 창, 드래그 제외)⑨ + 공용 선택창 컴포넌트와 플레이어 2곳 적용 | 시니어 구현 → 주니어 4단계 | §2 확정 → `결과/SL-1.md` | 표적 e2e(`test/e2e/layout/practice*.spec.js`)·4폭 스크린샷 Q표, `npm test` | 높음 | 4단계 검증·PR 완료 (`i18n-lang` `[ja]` 1건 시니어 인계) |
| SL-2 | 서버 계약: 곡 순서(V14 + API)·세션 삭제 API, ⑥ 드래그·패널 높이, ⑩ ✕ | 시니어 구현 → 주니어 4단계 | SL-1 머지 → `명세/SL-2_구현명세.md`, `결과/SL-2.md` | Kotlin 통합(소유권 A↔B 404·정리 규칙), e2e | 높음 | 대기 |
| SL-3 | 공용 선택창을 나머지 29곳에 적용 | 주니어 가능 | SL-1 컴포넌트 → `결과/SL-3.md` | 화면별 기존 spec·4폭 스크린샷 | 중간 | 대기 |

### SL-1 시니어 구현 결과 (2026-11-19, 주니어 4단계 입력)

- **바꾼 파일(8):** `frontend/src/components/common/AppSelect.tsx`·`.module.css`(새 공용 선택창), `frontend/src/pages/PracticePage.tsx`·`.module.css`, `frontend/src/lib/i18n/ko.mts`·`en.mts`·`ja.mts`, `test/e2e/layout/practice.spec.js`.
- **공용 선택창 `AppSelect`:** 박스 `<button id role="combobox" data-value>`, 목록 `#<id>-list`(`role="listbox"`, body 포털, `position: fixed`, 박스 바로 아래 4px·같은 가로·최대 320px). 박스가 화면 아래쪽이면 열 때 페이지를 목록이 들어갈 만큼 올린다. 바깥 누름·Esc(박스로 초점)·Tab·페이지 스크롤·창 크기 변경이면 닫힌다. ↑↓·Home·End·Enter·Space, 키 입력은 플레이어 단축키로 새지 않는다. 위치는 `style={{` 금지 규칙(R0-T4 등) 때문에 CSSOM으로 넣는다. e2e에서 고르기: 박스 클릭 → `#<id>-list [data-value="…"]` 클릭(`practice.spec.js` `pickOption`). 값 확인은 `toHaveAttribute('data-value', …)`.
- **화면:** ① `#libBtn`의 `.ppLibBtn` 축소 삭제. ② `.ppLab` 13px. ③ `#songCatPop` 제목 줄 오른쪽 `#songCatEdit`(EDIT/완료) → 이름 밑줄 버튼(`#catEditDialog`: 이름 변경·삭제 — 삭제는 `window.confirm`) + `#songCatAdd` 입력 줄(20자). ④⑦ `#folderSelect` 안 `이름 · N곡`(`#folderCount` 유지), `.folderSelectWrap`에 `scrollbar-gutter: stable`로 박스 가로 = 카드 가로, 목록 간격 8px. 라벨 `#folderSelectLabel` "폴더 선택". ⑧ `#folderEditBtn`(곡 1개 이상일 때) → 패널 `data-editing`, 라벨 "· 수정 중", 카드 왼쪽 3px, 카드 클릭 = `#songEditDialog`(제목 300자·분류 체크·`#songEditDelete` 곡 삭제 — 기록 화면과 같은 `deleteConfirmText` 확인). 현재 곡을 지우면 영상은 두고 계정 곡만 떼며 "곡을 삭제했어요." 표시. ⑨ `#titleEditBtn` → `#titleDialog`. `#syncState`는 저장 중·저장됨 시각·계정 연결됨을 더 이상 쓰지 않고(D8) 오류·안내(계정에 없는 곡 등)만 같은 줄에 둔다. D9 `#folderToggle`·접힘 삭제, 목록 최대 높이 320px(≤960px 360px) 안 스크롤.
- **D1 적용 주의(사용자 확인 필요):** 플레이어 화면 스파인이 이미 `--fill2`(DS2-3 D3)라 "수정 중 → `--fill2`"는 눈에 띄는 차이가 없다. 그래서 수정 중 스파인·카드 3px 표시를 **`--fill1`**로 했다. 4폭 스크린샷 검토 때 사용자에게 이 색을 확인받는다(바꾸려면 `PracticePage.module.css` `.ppFolderPanel[data-editing]` 한 줄).
- **API 확인(코드 기준):** `DELETE /api/v1/categories/{id}` = 200 `{ok:true}`, `song_categories`는 FK CASCADE로 해제(곡 유지), 공개 폴더(`community` user 폴더)도 CASCADE 삭제. 없는 분류 404. `PUT /categories/order` = `{ids:[내 분류 전부, 중복 없이]}`(아니면 400) — SL-1은 쓰지 않음. 분류 이름 빈 값 400 `INVALID_INPUT`·20자 초과 400·중복 409 `CONFLICT`·개수 한도 403 `CATEGORY_LIMIT_EXCEEDED`. `PATCH /songs/{id}` title 빈 값·300자 초과 400, `categoryIds` 10개 초과·UUID 형식 오류 400(`INVALID_INPUT`). 화면은 서버 `message`를 그대로 보여 준다.
- **표적 검증:** `npx tsc --noEmit` 오류 0, `npm test` 542 pass, `npm run build` 후 `npx playwright test test/e2e/layout/practice.spec.js` **73 passed**(새 `SL1-01`·`SL1-02` 포함, `UXR3-PL02/05/04/08/11`·프리셋·DS23 단언을 새 선택창에 맞춤).
- **주니어 4단계 인계(파일 상한 때문에 남김):** `test/e2e/player-category.spec.js` P4b-1·P4b-4, `test/e2e/home-category.spec.js` C4a-5가 **실패한다(확인함, 3 failed)**. 원인은 `#folderSelect`가 버튼이 된 것과 D9뿐이다 — `toHaveValue(X)` → `toHaveAttribute('data-value', X)`, `#folderToggle` `aria-expanded` 단언 삭제(목록은 항상 보임). 제품 코드는 고치지 않는다. 그 밖의 전체 회귀(`npx playwright test` 전체)·`LAYOUT_SHOTS=1` 4폭+다크 Q1~Q9 표·PR·CI·`결과/SL-1.md`는 실행하지 않았다.

## 4. 겪은 문제

- SL-1: 390에서 폴더 박스가 화면 아래쪽이면 목록이 화면 밖으로 나가고, 항목을 누르려 페이지가 스크롤되면 "스크롤하면 닫힘" 규칙으로 목록이 닫혔다 → 열 때 목록이 들어갈 만큼 페이지를 먼저 올리고, 그 위치에서 온 scroll 이벤트는 무시한다.
- SL-1: 현재 곡이 고른 폴더에 없으면 기존 안내 문구가 박스와 목록 사이에 들어가 간격 8px이 깨져 보인다(기존 동작 유지, 검사는 현재 곡이 목록에 있는 상태로 함).
- 시안 1차: 구간 반복에 간격 표시용 점선을 넣었다가 무슨 뜻인지 알 수 없다는 지적을 받아 제거했다. 패널 높이 기준(플레이어 버튼 섹션)을 시안에 빼먹었다. D3 토글이 눈에 띄는 차이를 만들지 못했다 → 시안에서는 비교 대상을 실제로 그리고, 설명용 표시는 넣지 않는다.

## 5. 다음 세션 시작 지시

- **SL-1 주니어 4단계:** 브랜치 `feat/SL-1-player-list-ui`를 pull → §3 "SL-1 시니어 구현 결과"의 인계 항목대로 spec 2개 단언 수정 → `npm run build` → 전체 `npx playwright test` → `LAYOUT_SHOTS=1` 4폭(390·768·1150·1280)+다크 Q1~Q9 표(분류 창 EDIT·곡 수정 창·선택창 열린 상태 포함) → `결과/SL-1.md` → PR(base main)·CI·리뷰 처리. D1 `--fill1` 색은 결과 파일에 사용자 확인 항목으로 적는다.
- SL-2는 SL-1 머지 뒤 시니어가 `명세/SL-2_구현명세.md`부터.
