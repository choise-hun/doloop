# 결과 FT-3-settings·privacy: 설정·개인정보처리방침 스크린샷 검토 (+ 정렬 수정 — 승인 대기)

- 진행 파일: `개발산출물/진행_프론트정렬규격.md`
- 입력: `결과/FT-2_전화면점검.md` §4(settings·privacy 약속)·§5(경고) · `결과/FT-3-chords_정렬수정.md` §7 · `개발산출물/프론트_정렬규격.md` v1.2
- §5-2 결정(2026-11-05): D1 = 나중에(chords 후속 A·B·C는 `인수인계_메모.md` "나중에"로 옮김), D2 = 한 세션·한 PR
- 상태: **스크린샷 검토 끝, × 5건 → 고칠 파일 목록 승인 대기**(진행 파일 §5-3). 수정·PR은 승인 뒤

## 1. 검사 결과 (수정 전, 현재 main과 같은 settings·privacy 코드)

```
npm run build && LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/settings.spec.js test/e2e/layout/privacy.spec.js
16 passed (17.5s)
```

- 판정 실패 0(FT-2와 같음). 약속 `col`·`secs`·`keyHead` A1 실패 0
- `LAYOUT_STRICT=1` 경고(G7b 제외):

| 경고 | 화면 | 판단 |
| --- | --- | --- |
| G8 `[col]` 세로 간격 `16·30px` 들쭉날쭉·30 스케일 밖 | privacy 섹션 3곳 | **원인 확인:** 섹션은 flex `gap: 16px`인데 `ul`에 브라우저 기본 `margin: 16px 0`이 남아 설명 문단→목록이 30px, 목록 아래도 16px 더 빔 → **× X2** |
| G8 `label.checkRow` 가로 11px | settings | 체크박스와 글자 사이(`gap`+기본 여백). 눈에 걸리지 않음 — 둠 |
| G8 `div.cardHead` 가로 612px 등 | settings | Gemini 카드 제목 ↔ 상태 배지 양끝 배치(약속 `keyHead:center-y` 통과) — 의도 |
| G8 `nav.siteNav`·`span.navMain` | 둘 다 | AppShell — W-1 |
| G7b 입력 38px·체크박스 16px·링크 26·27px | settings | FT-0 결정대로 경고 |

## 2. 스크린샷 검토 (규격 §6)

본 캡처: `test-results/layout-shots/`의 settings guest·user × 1280·1150·768·390 + user 1280 다크, privacy guest × 4폭 + 다크.
추가 캡처(spec에 없는 상태, scratchpad 스크립트 — Playwright + `mockApp(STATES.user)`): settings user에서 `main details` 전부 펼침(계정 삭제·고급 설정) 1280·390, 저장 공간 막대를 40%로 바꾼 `#accQuota` 1280·390.
1150은 1280과 같은 배치(좌우 여백만 줄어듦), 768은 1280과 같은 1열에 줄바꿈만 다름 — 판정은 1280·390 대표, 다른 점만 적음.
판정 `○` 문제없음 · `△` 둠(사유) · `×` 고칠 것(§3 X번호).

| 화면·상태 | Q1 강한 버튼 | Q2 여백 | Q3 기준선 | Q4 위계 | Q5 빈 상태 | Q6 390 순서·768 | Q7 유채색 | Q8 필·곡률·글자 | Q9 다크 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| settings guest | △ ① | ○ | ○ | △ ② | ○ (로그인 필 하나로 안내) | ○ | ○ (개인정보 링크 파랑 작은 면적) | × X4·X5 (390) | — |
| settings user | △ ① | ○ | ○ | △ ② | **× X1** 0MB인데 막대가 꽉 찬 회색 | ○ (연결 확인·해제 390에서 둘째 줄 — 자연스러움) | **× X1** 사용량 막대가 기본 초록 | × X4·X5 (390) | × X1 (다크도 같은 회색 막대), 그 밖 ○ |
| settings user 펼침 | △ ① (노션 키 저장·연동 켜기 추가) | ○ | ○ | ○ | ○ | ○ | ○ | × X4·X5 (390 연동 켜기 두 줄·ntn 안내 잘림), △ ③ | — |
| privacy guest | ○ (버튼 없음) | **× X2** 설명→목록 30px·섹션 아래 빔 | ○ | △ ②, **× X3** 제목에 요구사항 ID | — (정적 문서) | ○ (4번 제목 390 두 줄 — X3으로 짧아짐) | ○ | ○ | ○ |

사유·관찰:
- ① 설정은 독립 섹션의 나열이라 섹션마다 주 행동 필이 하나씩 있다(Drive 저장소 사용·Gemini 키 저장·테마 선택 칸, 펼치면 노션 키 저장·연동 켜기). 한 섹션 안에서는 하나 — 둠
- ② 제목 글꼴(`--font-display`)이 라틴·숫자에만 적용돼 `BYOK`·`1.`·`제3자`의 `3`이 한글과 다른 굵은 글꼴로 섞임. 전역 제목 글꼴 결정(DESIGN.md)이라 이 step 범위 밖
- ③ 고급 설정 "노션 백업 ZIP 파일" 파일 입력이 브라우저 기본 `Choose File` 네모 버튼. 옛 화면도 같았고(옛 CSS에도 스타일 없음) 접힌 고급 설정 안이라 둠. 원하면 `::file-selector-button`을 필로 — 후보
- 390 한글 줄바꿈이 낱말 중간(`연\n습`, `영\n구`)에서 끊김 — 전역 `word-break` 결정이라 둠(전 화면 공통, 바꾸면 L1-2 다국어와 같이 보는 게 맞음)
- 상단 오른쪽 계정 표시가 `TE`(표시 이름 앞 글자)·390 메뉴 세 줄 — AppShell, W-1

## 3. × 목록 (고칠 것 — 승인 대기)

| # | 증상 | 원인 | 처방(안) | 파일 |
| --- | --- | --- | --- | --- |
| X1 | 녹음 저장 공간 막대가 0MB에서 꽉 찬 회색, 사용량이 있으면 기본 초록으로 참(다크도 같음) | `appearance: none`만 옮기고 옛 `public/site.css:221-223`의 `::-webkit-progress-bar`·`::-webkit-progress-value`·`::-moz-progress-bar`가 SPA로 안 옮겨짐 → Chromium 기본 회색 트랙·초록 값. **chords와 같은 "옛 CSS 이식 누락" 패턴** | `.quotaBar::-webkit-progress-bar { background: var(--surface2) }`, `::-webkit-progress-value`·`::-moz-progress-bar { background: var(--ink) }` 3줄 이식 | `SettingsPage.module.css` |
| X2 | privacy 섹션 설명 문단→목록 30px(제목→문단 16px), 목록 아래 16px 더 빔. G8 `[col] 16·30px` 경고의 원인 | `ul` 브라우저 기본 `margin: 16px 0`. 옛 CSS는 `.set-sec ol`만 정리하고 `ul`은 없었음 | `.setSec > ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px }` (옛 `.set-sec ol` 규칙과 같은 값, 직계 `ul`만 — 설정의 `previewList` 등 안쪽 목록은 영향 없음) | `SettingsPage.module.css` |
| X3 | privacy 4번 제목 끝 `(FR-AUTH-4)` — 내부 요구사항 ID가 사용자에게 보임. 390에서 제목이 두 줄로 늘어나는 원인 | 문구 | 제목에서 ` (FR-AUTH-4)` 삭제 | `PrivacyPage.tsx` |
| X4 | 390에서 필 버튼 글자가 두 줄 — `🔑 1분 만에 무료 API 키 발급받기 (가이드 열기)`, `연동 켜기 (기존 노션 데이터 이관)`(어두운 필). 두 줄 필은 둥근 덩어리처럼 보임 | 문구 길이(16px 굵은 글자, 390 안쪽 폭 약 270px) | 문구 줄이기: `🔑 무료 API 키 발급 가이드 (1분)`, `연동 켜기 (노션 데이터 이관)`. 고친 뒤 390에서 한 줄인지 스크린샷으로 확인 | `SettingsPage.tsx` |
| X5 | 390에서 키 입력 안내 글이 잘림 — `AIza... (수정 시 비워두면 기존 키`(끝 "유지)"가 안 보여 뜻이 바뀜), 노션 토큰도 같음 | placeholder 길이 | `AIza… (비워두면 기존 키 유지)`, `ntn_… (비워두면 기존 키 유지)` | `SettingsPage.tsx` |

- 테스트 영향: 위 문구·`quotaBar`를 찾는 테스트 없음(`grep` 확인 — `test/e2e`·`frontend/src`). 선택자·id는 안 바뀜
- 바뀌는 파일 3개: `frontend/src/pages/SettingsPage.module.css`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/PrivacyPage.tsx` (+ 이 결과 파일·진행 파일)

## 4. 다음에 할 것 (승인 뒤)

1. PR #73(FT-3-chords) 머지 확인 → `main`에서 `fix/ft-3-settings-privacy`
2. X1~X5 수정 → `npm run build` → settings·privacy layout spec(+ `LAYOUT_STRICT=1`로 privacy `[col]` 경고 사라짐 확인) → `LAYOUT_SHOTS=1` 다시 찍어 × 칸을 `×→○`로 갱신, X1은 40% 막대 캡처로 색 확인
3. 전체 `npx playwright test`·`npm test` → 커밋·PR(base main)·CI → 이 파일 §5·§6(검증·PR)과 진행 파일 갱신, FT-3 완료 표시
