# AS-2 결과 — AppSelect 확장 + 기록 카드 `.ab-select` 전환

> 입력: [명세/AS_구현명세.md](../명세/AS_구현명세.md) §6 | 진행: [완료/진행_AS_선택창전환.md](../완료/진행_AS_선택창전환.md) | 기준 main `9c51dda` (PR #55·#56 머지 후)
> 담당: 시니어 직접 구현(2026-11-20 Mac Claude). 전체 회귀·4폭 Q1~Q9·문서 정리·PR/CI는 주니어 4단계(2026-11-20 Mac Gemini).

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

### 시니어 표적 검증
- `npx tsc --noEmit -p .` 오류 없음, `npm run build` 성공
- `npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/xss.spec.js` → **111 passed (1.5m)**
- `npx playwright test test/e2e/community.spec.js -g "녹음 삭제 영향"` → 3 passed
- `npm test` → pass 545 / fail 0 (디자인 규칙 포함)
- 임시 spec(커밋 안 함)으로 390·768·1150·1280 × 라이트/다크 측정: 박스 높이 28px·글자 12px·곡률 3px, `scrollWidth = innerWidth`(가로 넘침 없음). 열린 목록: 항목 44px, 목록 left·width = 박스 left·width(D3), `aria-label` "비교 선택". 스크린샷 육안 확인 — 박스·▾·행 버튼 정렬 정상, 다크 대비 정상. **28px 유지로 결정**

### 주니어 4단계 최종 검증 (2026-11-20)
- `npm run build` (`tsc --noEmit && vite build`) → 오류 0, `dist/` 빌드 성공
- `npm test` (`node --test test/*.test.js`) → **545 pass / 0 fail** (58 suites, `design_rules.test.js` 포함)
- `npx playwright test test/e2e/i18n-lang.spec.js` → **5 passed (35.0s)** (ko·en·ja 3개 언어 × 7개 화면 × 4폭 `checkLayout` 0건 및 영·일 한글 잔존 0건)
- `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js` → **85 passed (1.2m)**
- `npx playwright test` (전체 회귀) → **962 passed (14.8m)** (실패 0건)
- 미실행 범위: Kotlin/서버 테스트(`./gradlew test`) — 명세 §7 기준 서버 API·백엔드 변경 없음.

### 4폭 + 다크 스크린샷 검토 (`practice-userData-{1280,1150,768,390}.png`, `practice-userData-1280-dark.png`)

| # | 질문 | 1280 | 1150 | 768 | 390 | 1280 다크 |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | 첫눈에 가장 중요한 것 하나·강한 채움 버튼 1개 | ○ | ○ | ○ | ○ | ○ |
| Q2 | 같은 위계 칸 사이 여백 균형 | ○ | ○ | ○ | ○ | ○ |
| Q3 | 기준선 어긋남(`.ab-select` 28px와 행 버튼 정렬 포함) | ○ | ○ | ○ | ○ | ○ |
| Q4 | 크기·굵기·계기판·명도 위계 | ○ | ○ | ○ | ○ | ○ |
| Q5 | 빈 상태 안내 자연스러움 | ○ | ○ | ○ | ○ | ○ |
| Q6 | 390 1열 순서·768 어중간한 2열 없음 | ○ | ○ | ○ | ○ | ○ |
| Q7 | 무채색 구조·포인트 색 제한 | ○ | ○ | ○ | ○ | ○ |
| Q8 | 곡률(`--radius-block` 3px)·`1px` 줄눈·`12px` 스파인 일관성 | ○ | ○ | ○ | ○ | ○ |
| Q9 | 다크 모드 칸 경계·글자 대비 | - | - | - | - | ○ |

## 3. 남은 항목 / 미실행 범위

- 없음(시니어 인계 항목 전체 실행·기록 완료). 제품 코드(`AppSelect.tsx`·`SongRecordParts.*`) 무수정.

## 4. PR·CI

- PR: [#57](https://github.com/choise-hun/doloop/pull/57) (base `main`, head `feat/AS-2-ab-select`)
- CI (run [44641798227](https://github.com/choise-hun/doloop/actions/runs/44641798227), head `b63c034`):
  - 통과: `CI/Detect code changes` (9s), `CI/Test (Node 22)` (27s), `CI/Docker build & smoke test` (2m8s) (`CI/Kotlin test` skipped — 서버 변경 없음)
  - 실패(차단): `CI/E2E XSS & CSP (Playwright, spa)` 10건 (`community.spec.js:47` CM-2, `xss.spec.js` E1~E6·E8~E10) — 모두 `style-src` 인라인 스타일 CSP 위반(`sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig=` 요구 vs `'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw='`). 기준 `main` `9c51dda`(run [44631595271](https://github.com/choise-hun/doloop/actions/runs/44631595271))에서도 동일하게 실패하던 기존 결함이며, AS-2 변경 범위(`AppSelect.tsx`·`SongRecordParts.*`)에는 인라인 스타일이 없어 AS-2 회귀가 아님. 범위 밖 CSP/서버 수정은 보류하고 사용자·시니어에게 보고.
- 리뷰 코멘트: `chatgpt-codex-connector`가 Codex usage limits 초과로 자동 리뷰 실패([코멘트](https://github.com/choise-hun/doloop/pull/57#issuecomment-7025655579)), 그 외 리뷰 코멘트 없음.
