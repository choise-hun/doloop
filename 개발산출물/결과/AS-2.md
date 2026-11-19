# AS-2 결과 — AppSelect 확장 + 기록 카드 `.ab-select` 전환

> 입력: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §6 | 진행: [진행_AS_선택창전환.md](../진행_AS_선택창전환.md) | 기준 main `9c51dda` (PR #55·#56 머지 후)
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude). 전체 회귀·PR·CI는 주니어 4단계.

## 1. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `frontend/src/components/common/AppSelect.tsx` | `id?` 선택 — 없으면 `appsel-<useId(콜론 제거)>`, 목록은 `${id}-list`. `dataAttrs?: Record<string,string>` — 키는 `data-` 없이 받아 트리거에 `data-*`로. `value`·`align-group`은 무시(덮지 못함), 스프레드를 앞에 둬 이중 보장. id를 넘기는 기존 호출은 동작 그대로 |
| `frontend/src/components/songRecord/SongRecordParts.tsx` | `TakeItemRow`의 `<select class="ab-select">` → `<AppSelect className="ab-select …" dataAttrs={{'take-id'}} ariaLabel={t('record.abSelect')}>`. 옵션 값 `''`·`a`·`b`와 문구 키 그대로, `onSelectAbSlot`/`onToggleAb` 분기 그대로 |
| `frontend/src/components/songRecord/SongRecordParts.module.css` | `.abSelect` → `.takeRow .abSelect`(명시도 0,2,0): `flex:none; width:auto; height:28px; padding:0 8px; background:var(--surface); font-size:12px`. 테두리·곡률·글자색은 AppSelect 기본(3px `--radius-block`, 같은 hairline)이라 지움 |
| `test/e2e/support/app-select.js` | `pickOptionAt(page, box, value)`·`expectValueAt(box, value)` 추가 — id 자동 생성 박스를 로케이터로 조작(박스 id를 읽어 `[id="…-list"]`) |
| `test/e2e/practice-record.spec.js`, `layout/practice.spec.js`(T4), `xss.spec.js`(E5) | `selectOption` → `pickOptionAt`, `toHaveValue` → `expectValueAt`. 셀렉터(`.ab-select[data-take-id]`)·기대값 불변. `layout/practice.spec.js`의 지역 `pickOption`은 손대지 않음 |

`community.spec.js:2367`은 `.ab-select[data-take-id]` 로케이터만 써서 변경 없음.

## 2. 검증(실행함)

- `npx tsc --noEmit -p .` 오류 없음, `npm run build` 성공
- `npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/xss.spec.js` → **111 passed (1.5m)**
- `npx playwright test test/e2e/community.spec.js -g "녹음 삭제 영향"` → 3 passed
- `npm test` → pass 545 / fail 0 (디자인 규칙 포함)
- 임시 spec(커밋 안 함)으로 390·768·1150·1280 × 라이트/다크 측정: 박스 높이 28px·글자 12px·곡률 3px, `scrollWidth = innerWidth`(가로 넘침 없음). 열린 목록: 항목 44px, 목록 left·width = 박스 left·width(D3), `aria-label` "비교 선택". 스크린샷 육안 확인 — 박스·▾·행 버튼 정렬 정상, 다크 대비 정상. **28px 유지로 결정**

## 3. 주니어 4단계에 남긴 것(미실행)

- 전체 회귀(`npx playwright test`), `i18n-lang.spec.js` 세 언어 확인(en "No AB"/ja "AB 未選択" 길이에서 좁은 박스 말줄임 여부), `layout/practice.spec.js` 외 4폭 Q1~Q9 정식 기록
- 신규 PR(base main)·CI 대기·리뷰 처리·이 파일 §4에 PR 번호·CI 결과 기록

## 4. PR·CI

- 브랜치 `feat/AS-2-ab-select` push 완료. PR·CI: (주니어 4단계에서 기록)
