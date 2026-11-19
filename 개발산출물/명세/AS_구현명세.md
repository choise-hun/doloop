# AS 구현 명세 — 공용 선택창(`AppSelect`)을 나머지 29곳에 적용

> 진행 파일: [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) | 출처: SL ⑤(시안 [SL_시안.html](SL_시안.html) D3 확정), 옛 SL-3 행 | 기준 `main` `e996121`
> 작성 2026-11-19 Mac Claude 시니어. 주니어 SL-3 착수 전 조사(`../doloop-sl3` 미커밋 `개발산출물/결과/SL-3.md`, 29곳 목록)에서 나온 차단 6건을 여기서 정한다.

## 1. 왜 SL에서 떼어 냈나

- SL은 Step 4개(SL-0~3)로 이미 최대치다. 29곳을 한 Step에 넣으면 약 25파일로 골디락스 상한(7)을 크게 넘고, 화면을 나누면 SL Step이 6개가 된다 → 협업 §1.2에 따라 **대기능을 정식으로 나눈다**. "모든 선택창을 앱 창으로"는 화면 전체에 걸친 별도 사용자 여정이라 가짜 분할이 아니다.
- SL은 SL-2로 끝낸다. SL-3 행은 "AS로 이관"으로 표시한다.

## 2. 차단 항목별 결정

| # | 주니어 보고 | 사실 확인 | 결정 |
| --- | --- | --- | --- |
| B1 | 파일 상한 초과(약 25개) | 맞음 | Step 3개로 나눈다(§3). 각 Step의 e2e spec 교체는 한 줄짜리 기계적 변경이라 파일 수 상한에서 **테스트 파일은 따로 센다**(제품 파일 7개 이하 유지) |
| B2 | `.ab-select`는 `data-take-id`·`id` 필수·28px 높이 때문에 `AppSelect`를 안 고치면 못 바꿈 | 맞음(`AppSelect.tsx:15-30` id 필수, data-* 전달 없음) | `AppSelect` 확장은 **시니어 AS-2**: `id` 선택(없으면 `useId` 기반), `dataAttrs?: Record<string,string>`(트리거에 `data-*`로). 높이·폭은 화면 CSS `className`으로 덮는다(`.takeRow .abSelect` 명시도 0,2,0). `SongRecordParts.tsx`는 SL-2도 고치므로 **AS-2는 SL-2 머지 뒤** |
| B3 | `<optgroup>`(추정 키·전체 키) 미지원 | 두 그룹은 겹치지 않음(`ProgressionEditor.tsx:170-185`, 전체 키에서 추정 키를 뺌) | 그룹 기능을 만들지 않고 **평면 목록**: `키 모름` → 추정 키들(`meta` = `t('prog.editorKeyEstimated')`, 첫 항목 라벨의 `추천` 접미는 그대로) → 나머지 키. 기존 `meta` 칸 사용, `AppSelect` 무수정 |
| B4 | `<label>` 래핑 3곳은 포털 클릭이 라벨로 버블링되어 풀어야 함 | **차단 아님.** 목록은 `document.body` 포털이라 DOM상 `<label>` 밖 → 브라우저 라벨 전달 없음. React 합성 이벤트는 위로 전달되지만 세 `<label>`에 `onClick`이 없다(`OpsFolders.tsx:336`, `ProgressionEditor.tsx:159`, `ProgressionsPage.tsx:376`) | 래핑은 그대로 둔다. 다만 접근 이름은 래핑에 기대지 않고 **모든 `AppSelect`에 `ariaLabelledBy`(라벨 글자 `<span id>`)** 또는 `ariaLabel`을 준다(SL-1 `folderSelectLabel` 방식). 바뀐 곳 모두 e2e에서 `getByRole('combobox', { name })`로 1개씩 확인 |
| B5 | `LogPage.tsx:108` 카드 상태 선택에 id 없음 | 맞음 | `id={`songStatus-${song.id}`}`(AS-3. AS-2의 id 선택 기능을 기다리지 않는다) |
| B6 | `.selectPill`은 9999px, `AppSelect`는 3px | 확인: `Community.module.css:1122-1128` `--radius-pill`. `LogPage.module.css:306` `.selectPill`은 이미 `--radius-block` | **3px가 맞다.** 규칙상 선택창은 사각형 컨트롤이고 필은 화면당 대표 행동 1개만([frontend-design](../../docs/rules/frontend-design.md) §2 "버튼·컨트롤 3단계 위계"). SL 시안 D3로 선택창 모양이 확정돼 있어 새 시안은 필요 없다. 해당 `.selectPill` 규칙은 지우거나 `AppSelect` `className`용 크기만 남긴다 |

추가로 확인한 것:
- 모달 안 선택창(`PlaylistImportModal`·`FolderSheet`): 모달 배경 z-index 50(`Community.module.css:786-790`) < 목록 60(`AppSelect.module.css:50`)이라 목록이 위에 뜬다. 배경 `onClick`은 `e.target === e.currentTarget`일 때만 닫아서(`PlaylistImportModal.tsx:226-229`) 포털 클릭으로 닫히지 않는다. z-index 100 창(`EpisodeShareDialog` 등) 안에는 선택창이 없다 — 앞으로 넣으면 목록 z-index를 다시 본다.
- 태그 선택자 `select`: `ChordsPage.module.css:66`(`.instrumentControls select`), `:709`(`.scField select`), `ProgressionsPage.module.css:304`(`.sortLabel select`) → 각 `AppSelect`에 준 클래스 기준으로 바꾼다. `AppSelect` 기본이 44px라 `min-height: 44px` 규칙은 대부분 지워도 된다(계산 스타일로 확인).

## 3. Step

| Step | 대상(곳) | 담당 | 선행 | 파일(제품) |
| --- | --- | --- | --- | --- |
| AS-1 | 코드 화면 21: `ChordsPage.tsx` 17(`instrument-tuning`·`sc-root`·`sc-type`·`sc-bars`·`tone-root`·`mx-root`·`cc-root`·`cc-top`·`cc-str`·`ri-keyboard-note`·`ri-key`·`a-kind`·`a-proot`·`a-ptype`·`a-guide`·`ds-root`·`ds-scale`), `ProgressionPlayTab.tsx` 4(건반·기타 분기의 `pp-semis`·`pp-beats`) | 주니어(4단계: 구현·PR → 시니어 핀포인트 → 정리) | 없음(SL-2와 병렬 가능, 파일 겹침 없음) | `ChordsPage.tsx`·`.module.css`, `ProgressionPlayTab.tsx`(·css 있으면) + 새 `test/e2e/support/app-select.js` |
| AS-2 | `AppSelect` 확장(B2) + 기록 카드 `.ab-select` 1 | 시니어 직접 → 주니어 4단계 | **SL-2 머지** | `AppSelect.tsx`, `SongRecordParts.tsx`·`.module.css` |
| AS-3 | 진행 2(`new-key`/`edit-key` 평면화, `progSort`) · 운영 1(`opsNewKind`) · 커뮤니티 2(`playlistCatSelect`, `folderReportReason`) · 기록 2(`songStatus-{id}`, `detailStatus`) = 7 | 주니어 | AS-1 머지(공용 헬퍼) | `ProgressionEditor.tsx`, `ProgressionsPage.tsx`·`.module.css`, `OpsFolders.tsx`, `PlaylistImportModal.tsx`, `FolderSheet.tsx`, `Community.module.css`, `LogPage.tsx`·`.module.css` (9 — 같은 패턴 반복이라 상한 초과를 이 명세로 승인 요청) |

## 4. 공통 교체 규칙 (모든 Step)

1. `<select id=X className=C value onChange>` + `<option>` → `<AppSelect id=X className={C'} value options={[{value,label,meta?}]} onChange={(v) => …} ariaLabelledBy=… />`. `onChange`는 문자열을 받는다 — 숫자 상태는 기존처럼 변환(`Number(v)`)하고 변환 위치를 바꾸지 않는다.
2. `id`·`data-align-group`은 그대로 옮긴다(`AppSelect`가 `data-align-group` 지원). 값 확인 셀렉터는 `data-value`.
3. `disabled`·빈 목록 동작을 옮긴다(빈 목록이면 `AppSelect`는 열리지 않는다 — 원래 빈 `<select>`였던 곳이 있으면 결과 파일에 적는다).
4. 옵션 목록 배열은 렌더마다 새로 만들어도 된다(`AppSelect`는 options를 effect 의존성에 넣지 않는다, `AppSelect.tsx:96-135`). 단 화면 쪽 `useEffect` 의존성에 넣지 않는다.
5. 키 입력은 `AppSelect`가 막는다(코드 화면 단축키와 충돌 없음) — 기존 단축키 spec이 있으면 그대로 통과해야 한다.
6. 문구 키는 기존 것을 쓴다. 새 i18n 키를 만들지 않는다(필요하면 멈추고 묻는다).

## 5. 테스트

- 공용 헬퍼 `test/e2e/support/app-select.js`(AS-1 신규): `pickOption(page, id, value)`(박스 클릭 → `#${id}-list [data-value="…"]` 클릭 → 목록 닫힘 확인)와 `expectValue(page, id, value)`(`toHaveAttribute('data-value', …)`). `layout/practice.spec.js`의 같은 이름 지역 함수는 SL-2가 고치는 파일이라 **건드리지 않는다**(나중에 정리).
- `selectOption(…)` → `pickOption`, `toHaveValue(…)` → `expectValue`. 단언의 기대값은 바꾸지 않는다(`testing-security.md` §1.1).
- 화면별 기존 spec 전부 + `test/e2e/layout/<화면>.spec.js` + `i18n-lang.spec.js`(세 언어 `checkLayout`, SL-1에서 G3 넘침이 났던 유형 — 좁은 칸은 박스 안 글자 말줄임이 G3에 걸린다) + 4폭(390·768·1150·1280)+다크 Q1~Q9, 선택창 열린 상태 1장 이상.
- 단위 테스트: `npm test`(디자인 규칙 `test/design_rules.test.js` 포함).

## 6. AS-2 세부(시니어)

- `AppSelectProps.id?: string` — 없으면 `useId()`에서 `:` 제거한 값(`listId`도 그 값 기준). 있으면 지금과 같다(PracticePage 2곳 무변화).
- `dataAttrs?: Record<string, string>` — 키는 `data-` 없이(`{ 'take-id': id }`) 받아 트리거에 `data-take-id`로 붙인다. `data-value`·`data-align-group`은 덮지 못한다.
- `.ab-select`: `<AppSelect className={`ab-select ${styles.abSelect}`} dataAttrs={{ 'take-id': take.id }} ariaLabel={t('record.abSelect')} …>`. 높이 28px 유지 여부는 4폭 스크린샷에서 확인(목록 항목은 44px 그대로).
- 테스트: `practice-record.spec.js:467`, `community.spec.js:2361`, `xss.spec.js`의 `.ab-select` 셀렉터는 유지, `selectOption` → 헬퍼. 표적: `practice-record.spec.js`, `layout/practice.spec.js`.

## 7. 유지 계약

- 모든 기존 `id`, `data-align-group`, `.ab-select`·`[data-take-id]`, 라벨 글자, 옵션 값(문자열) 불변.
- 서버 API 변경 없음.
- `AppSelect`는 AS-2 말고는 고치지 않는다. 필요해 보이면 멈추고 시니어에게 넘긴다.
