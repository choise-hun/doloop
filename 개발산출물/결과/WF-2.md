# WF-2 결과 — 플레이어 녹음 섹션(C안)·화면 폭(가)

> 2026-11-15 / 시니어(Claude) 직접 구현 / 브랜치 `feat/WF-2-rec-section`. 진행 파일: [완료/진행_웹수정WF](../완료/진행_웹수정WF.md). 시안: [WF_시안.html](../명세/WF_시안.html) C안
> 전체 회귀·PR 생성·CI 대기는 주니어 4단계에서 완료했다(§4·§6).

## 1. 사용자 결정

- 녹음 섹션 = **C안**(한 줄 `−5 · ⏮ · ▶ · +5 · ● 녹음 · 저장`, 저장이 맨 오른쪽)
- 화면 폭 = **가**(폭 상한 올리기)만 구현. **나**("크게 보기" 전환 버튼)는 아이디어로만 남기고 마지막으로 미룬다 → [계획 §4](../../계획/상용_서비스_계획.md)
- 개발 방식 = 시니어 원스톱 구현 + 반복 테스트·PR·CI는 주니어(절충) → `협업_시니어주니어.md` §1.2, `CLAUDE.md`

## 2. 배치 약속

상태: 비로그인 / 로그인·Drive 미연결 / 로그인·Drive 연동 / 녹음 중 / 방금 녹음 있음 / 오류 메시지.

| 폭 | 열 구성 | 재생 줄 |
| --- | --- | --- |
| 390 | 1열 | 5칸(−5 ⏮ ▶ +5 저장) + 녹음은 둘째 줄 전체 폭(48px). 키보드 안내 숨김 |
| 768 | 1열 | 6칸 한 줄 |
| 1150·1280 | 2열(영상 열 + 360px) | 6칸 한 줄, 재생 상자 하나가 영상 열 전체 |
| 1440 이상 | 2열, 틀 폭이 창에 맞춰 커짐(상한 1760px) | 같음 |

맞춤 그룹: `transport:top,bottom,height` — `backBtn·startBtn·playBtn·fwdBtn·saveBtn`, `recBtn`은 `@601`(전화 폭에서는 둘째 줄이라 제외). 녹음 상자가 없어져 `practice-actions:top@961` 그룹은 지웠다.

## 3. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `frontend/src/pages/PracticePage.tsx` | `#ppRecCard` 삭제. `#recBtn`을 재생 줄(+5와 저장 사이)로 이동. 재생 줄 아래 `.ppFoot`(키보드 안내 + 상태 글자). 팝오버 `#recPop` 추가(상태 `recPopOpen`·`recInfoOpen`). 녹음 중에는 메시지를 비우고 팝오버를 닫음(표시는 버튼의 `■ 시간`) |
| `frontend/src/pages/PracticePage.module.css` | 재생 줄 6칸, ≤600px 5칸 + 녹음 둘째 줄, 팝오버·상태 글자 스타일. 녹음 상자·Drive 배너 스타일 삭제 |
| `frontend/src/components/layout/AppShell.module.css` | `.playerShell` 폭 상한 = `max(1120px, min(--player-max, (창 높이 − 392px) × 16/9 + 376px))`. `.mainPlayer`·플레이어의 머리 메뉴는 틀 폭을 따름 |
| `frontend/src/styles/tokens.css` | `--player-max` 1280px → 1760px (쓰이지 않던 토큰을 이번에 연결) |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 추가 `practice.driveStatusOn`·`driveStatusOff`·`recTakeReady`·`recPopClose`, 삭제 `practice.driveConnectedShort`·`recRecording`(쓰는 곳 없음 — I0-6) |
| `test/e2e/layout/practice.spec.js` | WF2-W 3건, WF2-C 4건, WF2-P1·P2 추가. T5·PL01·PL02를 새 배치에 맞춤 |
| `test/e2e/layout/ui-polish.spec.js` | UP-4(재생:녹음 10:2 비율)를 "녹음 버튼이 재생 상자 안"으로 교체 |

### 유지한 id (테스트·다른 코드가 참조)

| id | 지금 위치·역할 |
| --- | --- |
| `recBtn` | 재생 줄의 녹음 버튼 (`practice-record.spec.js`, PL10) |
| `recDriveBanner` | Drive 미연결 상태 글자(주황 점 + "Drive 미연결", 누르면 팝오버) — PL10의 보임/숨김 조건 그대로 (`r3_practice_log.test.js`) |
| `recDriveBadge` | Drive 연동 상태 글자(초록 점 + "Drive 연동") (`r3_practice_log.test.js`) |
| `btnRecDriveConnect` | 팝오버 안 "Drive 연결" 버튼 (`r3_practice_log.test.js`) |
| `recMsg`·`recPlay`·`recSave`·`recRetry` | 팝오버 안으로 이동 |
| `ppPlayCard`·`kbdHint`·`saveBtn` 등 | 그대로 |

없앤 id: `ppRecCard`(테스트 2곳 수정), `recDriveBannerText`(참조 없음). 새 id: `recPop`, `recPopClose`, `recTakeBtn`.

### 팝오버 동작

- 뜨는 때: 녹음 관련 메시지가 새로 올 때(오류·올리는 중·저장 완료·Drive 연결 결과), 상태 글자(Drive 연동/미연결 · 방금 녹음)를 누를 때.
- 닫는 때: ×, Esc, 녹음 시작. 닫으면 메시지를 비운다. 방금 녹음이 있으면 "방금 녹음" 글자로 다시 열어 듣기·파일 저장·다시 올리기를 쓴다.
- 위치: 재생 상자 위쪽 바깥, 오른쪽 정렬, 폭 `min(320px, 100%)`. 타임라인(넓은 창에서는 영상 아래 가장자리)을 잠깐 가린다.
- 색: 초록 점 `--good`, 주황 점 `--orange-vivid`(점에만), 오류 테두리·글자 `--bad`.

## 4. 검증 (시니어 실행분)

| 명령 | 결과 |
| --- | --- |
| spec 먼저: `npx playwright test test/e2e/layout/practice.spec.js -g "WF2\|PL01\|T5"` (구현 전) | `11 failed, 1 passed` — WF2-W 3·WF2-C 4·WF2-P 2·PL01 2 |
| `npm run build` | `✓ built` |
| `npx playwright test test/e2e/layout/ test/e2e/practice-record.spec.js` | `554 passed (6.6m)` |
| `npm test` | `pass 490, fail 0` (처음에 LA-1 한글 잔존·I0-6 안 쓰는 키 2건 실패 → 예외 사유 영문화, 키 삭제 뒤 통과) |

- 위 e2e 554건은 문구 키 삭제·예외 사유 영문화 **전**에 돌린 것이다. 그 뒤 `npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/ui-polish.spec.js test/e2e/practice-record.spec.js` → `73 passed (47.4s)`로 다시 확인했다.
- 코드·테스트 파일은 9개(다국어 사전 3개 포함), diff 약 450줄이다.

### 주니어 4단계 전체 회귀·PR·CI 검증 (2026-11-15, `c505514`)

| 명령·항목 | 결과 |
| --- | --- |
| `npm run build` | `✓ built in 848ms` (`tsc --noEmit && vite build`) |
| `npm test` | `pass 490, fail 0` (`suites 58, skipped 0`) |
| `npx playwright test` | `861 passed (11.5m)` |
| PR [#34](https://github.com/choise-hun/doloop/pull/34) | `feat/WF-2-rec-section` → `main` (`c505514`) |
| CI [Run #43704313760](https://github.com/choise-hun/doloop/actions/runs/43704313760) | `5 successful, 1 skipped` (`Detect code changes` 6s, `Test (Node 22)` 28s, `E2E XSS & CSP (Playwright, spa)` 12m13s, `Docker build & smoke test` 1m38s, `CI ok` 3s 통과; `Kotlin test (JDK 21)` 백엔드 변경 없음으로 skipped) |
| PR 리뷰 코멘트 | `chatgpt-codex-connector` Code Review 완료 (`has_any_findings: false`, `has_unresolved_findings: false`, 라인 코멘트 0건) |

- 미실행 범위: 실제 마이크·실제 Drive 연결·실제 녹음 업로드(사람 확인), PR 머지 및 운영 Cloud Run 재배포(사용자).

## 5. 스크린샷 검토 (390×844 · 768×900 · 1150×800 · 1280×800 · 1920×1080, 로그인·Drive 미연결)

| 질문 | 판정 |
| --- | --- |
| 재생 줄 여섯 버튼의 위·아래 선 | 768 이상 일치. 390은 5칸 + 녹음 둘째 줄 전체 폭 |
| 상자 높이가 상태에 따라 변하는가 | 변하지 않음(WF2-P1이 높이 동일 단언) |
| 팝오버가 화면 밖으로 나가는가 | 5개 폭 모두 안쪽. 390에서 상자 폭 안 |
| 유채색 | 주황은 점 하나, 오류만 `--bad` |
| 주 행동 | 어두운 채움 버튼은 팝오버를 열었을 때 "Drive 연결" 하나 |
| 넓은 창 | 1920×1080에서 영상 1223px, 재생 줄까지 한 화면. 머리 메뉴·본문 좌우선 일치 |
| 남는 어색함 | 팝오버가 타임라인을 가린다(닫으면 해소). 1280×800처럼 낮은 창은 기존 1120px 그대로라 재생 줄 아래가 조금 잘린다(기존과 같음) |

스크린샷 원본은 세션 임시 폴더에 있어 남지 않는다. 다시 찍으려면 `LAYOUT_SHOTS=1`.

## 6. 주니어 4단계 완료 체크

1. **완료** — `npm run build` → `npm test` → `npx playwright test` 전체 실행 통과(§4)
2. **완료** — `feat/WF-2-rec-section` → `main` [PR #34](https://github.com/choise-hun/doloop/pull/34) 생성, `gh pr checks --watch` 통과, 리뷰 코멘트 0건 확인
3. **완료** — 이 파일 §4·진행 파일 §5 기록, `git mv 개발산출물/진행_웹수정WF.md 개발산출물/완료/` + 완료 줄, `인수인계_메모.md` §2 목록 맞춤
