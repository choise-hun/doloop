# 진행 — report.md 기반 UI/UX 수정 (UIUX-R · CM-R)

## 1. 목표·입력·승인 범위

- 목표: [report.md](report.md) 7항목의 화면 수정. 상위 명세 [UIUX-R 수정 명세](명세/UIUX-R_수정명세.md)(§1.1 시니어 검토 결정 RV-1~11 우선).
- 대기능 2개(RV-1): **UIUX-R**(연습 기록·트랜스포트·악기 연습실), **CM-R**(커뮤니티 재설계). Step ID 접두어 `UXR-`, `CMR-`(다른 진행 파일과 비중복).
- 승인 이력
  - 2026-11-10 Codex: 상위 명세 작성(문서만). §5 커뮤니티 사용자 결정 반영.
  - 2026-11-11 Claude(시니어): 사용자 지시 “검토하고 결정 가능한 부분은 알아서 결정, 해소 불가 문제 없으면 세부 명세 작성 시작”. 승인 범위 = 검토·결정 기록·세부 명세 작성(문서만).
  - 2026-11-11 사용자: 현재 산출물(report.md, 명세 4건, HomePage 레이아웃 스타일, 진행/계획 문서) git 커밋, 푸시, PR 게시 승인 및 지시.
- 근거 규칙: [문서 운영](../docs/문서_운영.md) §4.1·§6, [협업](협업_시니어주니어.md) §1.2·§4, `docs/rules/frontend-state.md`, `docs/rules/frontend-layout.md`, `docs/rules/testing-security.md`, [정렬 규격](프론트_정렬규격.md).

## 2. 기존 변경·충돌 경계

- 보존(커밋 금지 대상 포함): tracked 수정 `frontend/src/pages/HomePage.module.css`(사용자), `개발산출물/인수인계_메모.md`; untracked 입력 `개발산출물/report.md`.
- 이번 세션 추가/수정 문서: 상위 명세(§1.1 추가·§5.3 보정), 세부 명세 3건, 이 진행 파일, 계획 행 2개, 인수인계 활성 목록 1행.
- 다른 활성 진행 파일(모바일스파이크·다중LLM·CM-UI·PF·ST)과 코드 파일 충돌 없음. UXR-1·UXR-2·CMR-1은 서로 코드 파일이 겹치지 않고 `frontend/src/lib/i18n/{ko,en,ja}.mts`만 서로 다른 키로 겹친다 → 병렬 브랜치 가능, 나중 PR이 main을 반영.

## 3. Step 표

| Step | 내용 | 담당 | 입력 → 결과 파일 | 선행 | 완료 기준 | 권장 effort | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UXR-1 | 연습 기록 단일화(미연결 녹음·A/B 교차·삭제 슬롯 결함) + 트랜스포트 통일 | [시니어] 구현 → [주니어] 4단계 | [명세](명세/UXR-1_구현명세.md) → `결과/UXR-1.md` | 없음 | 명세 §9 체크리스트, PR CI 통과·리뷰 처리 | 시니어 high / 주니어 medium | 완료 — PR #159 CI 통과·Codex 리뷰 확인, 사용자 머지 대기([결과](결과/UXR-1.md)) |
| UXR-2 | 악기 버튼군·접이식 설정·스케일 의미별 행(hidden 결함)·재해석 2열 | [시니어] 구현 → [주니어] 4단계 | [명세](명세/UXR-2_구현명세.md) → `결과/UXR-2.md` | 없음 | 명세 §7 체크리스트 | 시니어 medium / 주니어 medium | 완료 — PR #1 CI 통과·리뷰 확인, 사용자 머지 대기([결과](결과/UXR-2.md)) |
| UXR-3 | 연습 재생·녹음 재배치 + 선택 폴더 곡 목록 | [시니어] 직접 구현 → [주니어] 4단계 | [명세](명세/UXR-3_구현명세.md) → `결과/UXR-3.md` | UXR-1 반영 경계 확인 | 명세 §8 PL-01~12·4폭 Q1~Q9 | 미지정 | 완료 — PR #2 생성, CI 전 항목 통과(run `43019870416`), 리뷰 0건, 사용자 머지 대기([결과](결과/UXR-3.md)) |
| CMR-1 | 커뮤니티 탐색 구조: LOGS 탭·선반 순서·최근 공개 제거·게시물 선반·LOGS 마소니 | [시니어] 구현 → [주니어] 4단계 | [명세](명세/CMR-1_구현명세.md) → `결과/CMR-1.md` | 없음 | 명세 §8 체크리스트 | 시니어 high / 주니어 medium | 완료 — PR #3 CI 전 항목 통과, 리뷰 0건, 사용자 머지 대기([결과](결과/CMR-1.md)) |
| CMR-2 | 소개·“내 연습 공유하기” CTA·guest·빈 상태 단계 + 이름 모달·공유 가드(RV-10) | [시니어] 구현 → [주니어] 4단계 | [명세](명세/CMR-2_구현명세.md) → `결과/CMR-2.md` | CMR-1 머지(충족 `e28421d`) | 명세 §9 체크리스트·CMR2-1~17 | 시니어 high / 주니어 medium | 시니어 핵심 구현 완료(2026-11-11, `step/CMR-2` 로컬 커밋, §11) — 주니어 4단계 대기 |
| CMR-3 | 단일 표지(RV-5)·빠른 추가(+/꾹 누르기/하단 시트)·상세 화면·부분 선택·`createSong` a/b(RV-4)·dev `?mock=1` | [시니어] 구현 → [주니어] 4단계 | [명세](명세/CMR-3_구현명세.md) → `결과/CMR-3.md` | CMR-1 머지(충족). CMR-2와 병렬 가능(`CurationRows.tsx`·i18n만 다른 줄로 겹침) | 명세 §10 체크리스트·CMR3-1~26 | 시니어 high / 주니어 medium | 명세 완료(2026-11-11) — 구현 승인 대기. 규모 상한 경계(§5) |
| CMR-4 | S3a 녹음 재생 UI(stub 주입점) + S2 게시물 좋아요(DB·API·DTO) | [시니어] 서버 줄 | 상위 §5.6·§5.7 → `명세/CMR-4_구현명세.md` | CMR-1 머지 + **S2 서버 계약 사용자 승인** | 같음 | — | 대기(승인 필요) |
| (S3b) | 공개 녹음 파일 취득 | — | 상위 §5.7 표 | 정책 결정 | — | — | Step 아님, 정책 대기 |

## 4. 사용자 결정 대기 (답을 채워 다음 세션 시작 문구에 넣는다)

UXR-3 후속 요청의 승인·재개 상태는 §8에서 별도로 관리한다. 아래의 이전 Step 승인 질문을 UXR-3 승인으로 간주하지 않는다.

| # | 질문 | 시니어 추천 | 답 |
| --- | --- | --- | --- |
| Q1 | UXR-1·UXR-2·CMR-1 구현 승인? | 승인 — 세 Step 모두 서버 계약 변경 없음 | |
| Q2 | 승인 Step의 단계별 Git 게시(브랜치·커밋·push·main PR·CI 대기) 승인? | 승인 — Step마다 `step/<ID>` 브랜치·PR 1개 | |
| Q3 | RV-3(S3a를 CMR-4로 이동) 수용? | 수용 — DTO에 녹음 필드가 없어 S3b 전에는 버튼이 항상 숨겨짐 | |
| Q4 | CMR-4의 S2 서버 계약 변경(좋아요 테이블·PUT/DELETE API·`PublicEpisodeLogDto.likeCount/likedByMe`) 승인 시점 | CMR-4 세부 명세 검토 때 결정(지금은 불필요) | |

## 5. 실행 기록

| 일시 | 작업 | 결과 |
| --- | --- | --- |
| 2026-11-10 | Codex 상위 명세 작성·문서 검증 | 7항목·UR-01~13 기록, 링크·인코딩 검사 통과(당시 기록) |
| 2026-11-11 | Claude 코드 재대조 | 해소 불가 문제 없음. 결함 실증 2건(RV-6 hidden, RV-7 A/B 슬롯), 명세 보정 1건(RV-4 `created` 필드 없음), 공용 영향 2건(RV-5 CoverArt, RV-9 미사용 CommunityPane) |
| 2026-11-11 | Claude 세부 명세 3건 작성, 상위 명세 §1.1 추가 | 문서 검증은 §6 |
| 2026-11-11 | Gemini Git 게시 | 사용자 지시에 따라 `docs/uiux-r-specs` 브랜치 생성, 커밋, push 및 PR 생성 |
| 2026-11-11 | Claude UXR-1 구현 | `step/UXR-1` 로컬 커밋. 표적 E2E 64 passed, UXR1-3 Red→Green 확인. 전체 회귀·PR·CI는 주니어 → [결과](결과/UXR-1.md) |
| 2026-11-11 | Gemini UXR-1 4단계 | 전체 회귀·LAYOUT_SHOTS 4폭·다크 Q1~Q9 검토(31 passed), PR #159 생성, CI 전 항목 통과, Codex 리뷰 확인 완료 |
| 2026-11-11 | Gemini 리뷰 대응 | Codex P1 리뷰 반영: HomePage splitFrames 회귀 단언 추가 및 홈 레이아웃 Playwright 검증(21 passed) 완료 |
| 2026-11-11 | Claude UXR-2 구현 | `step/UXR-2` 구현. 악기 버튼군·접이식 설정·스케일 4행·재해석 2열. 표적 109 통과, P5 hidden 전제 오류 기록 → [결과](결과/UXR-2.md) |
| 2026-11-11 | Gemini UXR-2 4단계 | 전체 회귀·LAYOUT_SHOTS 4폭·다크·1023/1024 Q1~Q9 검토(108 passed), feat/docs 분리 커밋, PR #1 생성 및 CI 전 항목 통과 |
| 2026-11-11 | Gemini 리뷰 대응 | Codex P2 리뷰 반영: chords_instruments.spec.js UXR2-1의 lang을 ulp:lang 및 html[lang] 단언으로 교체(9 passed) |
| 2026-11-11 | Claude CI 수정 | 레포 이전(choise-hun/doloop public)으로 PR 번호 #160→#1 정정. `62da217` E2E ubuntu-24.04 고정·PR Node 22만·Kotlin 백엔드 변경 시만. push 후 pull_request 이벤트 CI가 시작되지 않아(원인 미확인) `workflow_dispatch`(run 42986479700, head `0dbd5a1`)로 대체 검증: 전 job 성공(playwright install 포함 E2E 통과). PR 리뷰·코멘트 0건 → 처리할 지적 없음. `CI_셀프호스티드_러너_설정_프롬프트.md`는 public 레포라 적용 보류(미커밋) |
| 2026-11-11 | Claude CMR-1 구현 | `step/CMR-1` 시니어 핵심 구현 및 로컬 커밋(`c2d667c`, `eb36c02`). 표적 97 passed 확인 후 주니어 4단계 인계 → [결과](결과/CMR-1.md) |
| 2026-11-11 | Gemini CMR-1 4단계 | 전체 회귀(`npm test` 416 통과, 전체 Playwright 658 통과)·`LAYOUT_SHOTS=1` 4폭 및 다크 Q1~Q9 검토(21 passed), empty 레이아웃 스위트 보강, PR 생성 및 CI 대기 |
| 2026-11-11 | Claude CMR-2·CMR-3 세부 명세 | PR #3 머지(`e28421d`) 확인 후 main 최신화, 사용자 변경(`AGENTS.md`·`CLAUDE.md`) 보존. 실제 코드 대조로 명세 2건 작성(소스·테스트 무변경, 빌드·테스트 미실행). 상위 보정 결정: 곡 항목 길이 필드 없음 → 길이·총 길이 미표시(CMR-3 D15), `SONG_LIMIT_EXCEEDED` 프런트 미매핑 → 화면 전용 매핑(D11), 폴더 딥링크 신설 `community.html#folder=<id>`(D20·D21, 프런트 해시만), 곡 카드 본체는 연습 이동 유지(D27), 이름 저장 후 공유 스위치 자동 재실행 없음(CMR-2 D10), `DEFAULT_ME` 이름 없음 → 기존 E2E에 `skipNameModal` 헬퍼(CMR-2 §8) |
| 2026-11-11 | Claude 기존 명세 재검토·결정 기록 | 사용자 결정 Q5~Q7 = 추천대로. UXR-1·2·3·CMR-1 명세를 main `e28421d` 코드와 대조 → 실제 결함 1(F1), 정정 문서 3곳, 검증 기록 과대 1(F7) — [결과](결과/UIUX-R_명세재검토.md) |

## 6. 검증·미실행

- 문서 검증(2026-11-11): Python 검사로 세부 명세 3건·상위 명세·이 파일·계획·인수인계의 로컬 링크 존재, 명세 속 `file:line` 경로 존재·행 범위, UTF-8·BOM 없음·LF·마지막 개행 확인 → issues 0. `git diff --check` 통과.
- 프론트엔드 검증(2026-11-11):
  - `npm test` 통과 (416 passed), `npm run build` 통과.
  - `npx playwright test test/e2e/layout/home.spec.js` 통과 (21 passed):
    - 4개 폭(1280px, 1150px, 768px, 390px) 반응형 검사 및 다크 모드 스크린샷·정렬 규격(G0~G8) 이상 없음.
    - 신규 회귀 단언(UIUX-R T1): splitFrames 16px horizontal gap 및 `#betterFrame`·`#vaultFrame` 개별 카드 테두리(1px) 스타일 검증 통과.
- 구현·빌드·Node/Playwright·스크린샷·CI·운영 확인: 명세 대상 기능(UXR-1·UXR-2·CMR-1)은 구현 전 상태.
- Git 게시: 사용자 승인에 따라 `docs/uiux-r-specs` 브랜치로 커밋, push, PR 생성 진행.

## 7. 다음 행동·재개

- 다음 행동: 사용자가 §4 Q1~Q3에 답한다. 승인되면 UXR-1부터(또는 세 Step 병렬로) 템플릿 §0 시니어 직접 구현 → 주니어 4단계.
- 구현 시작 시: `git status`·브랜치·사용자 변경(HomePage.module.css·report.md) 보존 확인, main 최신화 후 `step/<ID>` 생성. 세부 명세 §1 전제 `file:line`을 다시 확인(어긋나면 명세를 고친 뒤 진행).
- CMR-1 머지 후: CMR-2·CMR-3 세부 명세 작성(실제 마크업 기준) → **완료(2026-11-11)**, 재개는 [§10](#10-cmr-2cmr-3-세부-명세-2026-11-11).

```text
# Claude(시니어) — UXR-1 핵심 구현 및 검증 인계
개발산출물/프롬프트_템플릿_4단계.md의 "0단계 — 시니어 직접 구현" 템플릿을 사용한다.
선행 결정: 진행_UIUX수정명세.md §4 Q1=<승인/보류>, Q2=<승인/보류>, Q3=<수용/거부>
이번 목표: UXR-1 연습 기록 단일화·트랜스포트 통일 (명세 개발산출물/명세/UXR-1_구현명세.md)
작업 범위: 명세 §3 파일 목록만. 서버·DTO·LogPage 수정 금지. HomePage.module.css·report.md 보존.
Git 처리: 로컬 구현·표적 테스트까지(전체 회귀·PR/CI는 주니어 4단계). Q2 승인 시 step/UXR-1 브랜치 커밋까지.
완료 기준: 명세 §9의 표적 항목(UXR1-3 Red→Green 포함) 통과 근거를 진행 파일에 기록하고 주니어 실행 목록 인계.
인수인계_메모.md에서 현재 상태와 작업 충돌을 확인하고, 개발산출물/진행_UIUX수정명세.md §7을 따른다.
```

## 8. UXR-3 연습 화면 배치 후속 명세

- 요청/승인(2026-11-11): 사용자 첨부 배치안 및 `practice-userData-1280.png`에 대한 의견 교환 후 “변경을 위한 명세 작성해줘”. 이번 범위는 문서 작성만이며 기존 작업의 Git 게시 승인을 UXR-3으로 확대하지 않는다.
- 산출물: [UXR-3 구현 명세](명세/UXR-3_구현명세.md). UIUX-R의 세 번째 Step으로 연결. 상세 동작·배치·검수 계약은 명세에만 기록한다.
- 확인 입력: `step/UXR-1`, HEAD `e643bab`, 시작 시 사용자 변경 `CLAUDE.md` 1건. 해당 변경 보존. 로컬 스크린샷·화면·API client·서버 DTO/라우트·기존 테스트 직접 대조. UXR-1 최신 PR/머지/CI는 이번 문서 작업에서 조회하지 않았으므로 반영 완료로 단정하지 않는다.
- 충돌: `PracticePage.tsx`, 스타일, 테스트, i18n이 UXR-1과 겹친다. 구현 전 최신 실제 반영 경계를 확인한다. UXR-2와 i18n 키 충돌을 확인한다.
- 현재 단계: 상세 명세 작성 완료. 구현·빌드·테스트·새 캡처·외부 Drive/마이크·Git 게시 미실행.
- 문서 검증(2026-11-11): 변경 문서 5건의 로컬 링크·명세 코드 근거 21건의 경로/행 범위·UTF-8(BOM 없음)/LF·마지막 개행 검사 issues 0. `git diff --check` 통과. 기존 CRLF 문서는 이번 변경 대상만 LF로 정규화했으며 사용자 `CLAUDE.md`는 건드리지 않았다. 최초 검사 스크립트는 PowerShell→Python 파이프의 한글 경로 인코딩으로 실패하여 git UTF-8 경로 목록을 읽는 방식으로 재검증했다. 코드·기능 테스트는 실행하지 않았다.
- 다음 행동: 사용자가 UXR-3 명세를 검토한다. 구현 요청을 받으면 먼저 git 상태·main/UXR-1 반영 상태·충돌을 확인하고 명세 §7의 범위와 담당을 확정한다. Git 게시 요청이 없으면 로컬 구현·검증까지만 수행한다. 과거 §7의 UXR-1 시작 멘트로 UXR-3을 실행하지 않는다.

```text
# Claude (시니어) — UXR-3 핵심 구현 및 주니어 인계 (템플릿 §0)
목표: 개발산출물/명세/UXR-3_구현명세.md 기준으로 연습 화면 재배치·선택 폴더 곡 목록을 구현한다. 담당 [시니어] 직접 구현(명세 §7, 협업 §1.2).
선행 조건: git status·브랜치 확인, 사용자 변경 보존, 최신 main에서 step/UXR-3 생성. UXR-1(PR #159) 머지 여부 확인, 미반영이면 충돌 경계를 기록한다.
범위: 명세 §7의 7파일만. 서버/API/DB 계약·공용 기록 컴포넌트 변경 없음. 7파일·600줄 초과 전망이면 구현 전에 분할 필요성을 기록한다.
방식: 규칙 확인 → 배치 약속·Red 확인 → 구현 → practice.spec.js 표적 1~2개 Green까지만.
중단 지점: step/UXR-3 로컬 커밋까지. 전체 회귀·push·PR·CI 대기·4폭 스크린샷 전수 검토·결과 파일은 주니어 4단계(문서_운영 §6 우선).
완료 기준: diff 요약·표적 Red→Green 근거·주니어 실행 목록을 이 파일 §8에 기록하고 주니어 4단계 시작 멘트를 제공한다.
Git 처리: 로컬 커밋만. push·PR·배포는 이 멘트로 승인되지 않는다. 머지는 사용자가 한다.
```

### 8.1 UXR-3 시니어 구현 결과 (2026-11-11, 로컬 커밋까지)

- 선행 확인: UXR-1(PR #159)·UXR-2(#160 계열)는 main에 머지됨(`60d097e`, `05143ad`). `main`에서 `step/UXR-3` 생성. 사용자 변경(`AGENTS.md`·`CLAUDE.md`·이 진행 파일의 기존 수정)은 커밋에서 제외하고 보존했다. 이 PC는 `node_modules`가 없어 `npm ci` + `playwright install chromium`을 새로 했다(커밋 대상 아님).
- 변경 7파일: `PracticePage.tsx`·`PracticePage.module.css`·`apiClient.ts`·`i18n/{ko,en,ja}.mts`·`test/e2e/layout/practice.spec.js`. 서버/API/DB 계약·공용 기록 컴포넌트 변경 없음.
- 규모: 7파일, 공백 무시 +700/−182줄. 600줄 경고선을 넘었다. 이유는 재생·녹음·구간 JSX 블록 이동(주로 위치 이동)과 신규 테스트 139줄이며, 기능 경계는 한 화면이라 분할하지 않았다(DOM만 떼면 단독 검증 불가).
- 구현 요약
  - DOM: `ppMain` 안에 `ppStage`(영상·타임라인) → `ppActions`(`#ppPlayCard` 재생 5버튼+단축키 안내, `#ppRecCard` 녹음) → `ppSide`(`#ppCtl` 속도·A/B·대기·프리셋, `#ppFolderPanel` 선택 폴더 곡 목록). 단일 DOM을 CSS grid로 재배치(≥961 2열, ≤960 1열, 읽기 순서 = 명세 §3.2). 녹음 묶음의 ID는 그대로 하나씩 유지, 오류 메시지를 Drive 안내보다 앞에 둠.
  - 배치 약속: `practice-top:top@961`(`#videoBox`·`#ppCtl`), `practice-actions:top@961`(재생·녹음 카드), `practice-side:left,right@961`(`#ppCtl`·`#ppFolderPanel`). 기존 `transport`·`sr-left` 유지.
  - 목록: `loadSongList()`가 곡·분류를 한 요청 세대(`songsListReqSeqRef`)로 읽고 서랍과 공유(uid+seq 검사, 소유 uid가 다르면 렌더에서 loading 처리). 선택 폴더(`__all`/분류 ID/`__uncategorized`)·네이티브 select(`#folderSelect`)·곡 수(`#folderCount`)·모바일 접기(`#folderToggle`, `aria-expanded/controls`, 접힌 본문 `display:none`)·오류+`#folderRetry`·guest 안내·현재 곡 `aria-current`/폴더 밖 안내. 곡 이동은 `openSongById` 재사용, 전환 중 `aria-disabled`로 중복 클릭 차단(초점 유지), 현재 곡 재클릭 no-op. 서랍은 유지하고 서랍에서 고른 곡의 폴더를 인라인 선택에 반영.
  - 홈 분류 전달값은 목록 조회 성공 뒤에만 소비한다(실패는 삭제로 보지 않음). 없는 분류면 전체 + 안내. 자동 서랍 개방은 인라인 선택+모바일 펼침으로 대체했다.
  - `apiClient`: `listSongs`·`categoryList`가 잘못된 envelope를 예외로 올린다(올바른 `[]`는 성공). 시그니처·export 유지.
  - Drive 연결 버튼은 녹음 중·업로드 중 비활성화. 배너는 compact 스타일(문구 축약 키는 추가하지 않음 — 기존 문구 유지).
- 표적 Red→Green(`npx playwright test test/e2e/layout/practice.spec.js -g UXR3`): 구현 전 5건 모두 실패(`#ppPlayCard` 등 부재), 구현 후 PL-01(1280·1150)·PL-02·PL-05·PL-06 통과. `practice.spec.js` 전체 36 passed(기존 G0~G8 레이아웃 스위트·T1~T6·UXR1-L 포함), `tsc --noEmit` 통과, `node --test test/*.test.js` 416 pass.
- 알려진 회귀(의도된 계약 변경의 결과 — 주니어 4단계에서 수정, 승인 7파일 밖): `home-category.spec.js` C4a-5, `player-category.spec.js` P4b-1·P4b-4(자동 서랍 개방 기대 → 인라인 선택 `#folderSelect` 값·모바일 펼침 기대로 변경), `practice-record.spec.js` SR1-4(mock이 `/api/v1/categories`에 `{}`를 주어 엄격 envelope에서 오류 → 이 mock에 `{categories: []}` 추가). 같은 원인이 다른 spec에 더 있을 수 있어 `test/e2e/support/mock-app.js`에 `categories` 기본 응답(`{categories: []}`)을 두는 방안을 권장한다(이 경우 사용자에게 파일 추가를 한 줄 보고).
- 미구현·미실행(주니어/후속): PL-04 일부(삭제된 분류 → 전체+안내의 E2E), PL-07(A→B→A 계정 경합 E2E: 현 mock은 지연 응답 해제 후 DOM 단언이 필요하고 계정 전환 스텁이 없어 미작성), PL-08~PL-11 전용 테스트, 30곡 스크롤(PL-03) 테스트, 녹음 카드 상태 캡처, 실제 마이크·Drive. 구현은 해당 경로를 처리하지만 테스트로 증명되지 않았다 — 주니어는 통과로 적지 말고 미실행/미작성으로 기록한다.

### 8.2 주니어 4단계가 실행할 목록

1. `git status`로 `step/UXR-3` 로컬 커밋과 사용자 변경(`AGENTS.md`·`CLAUDE.md`·이 파일 외 미커밋분)을 확인·보존. `npm ci`가 필요하면 실행.
2. 알려진 회귀 4건 수정(위 8.1), 필요 시 `mock-app.js` 기본 categories 응답 추가.
3. 부족한 PL 테스트 작성: PL-04 삭제 분류, PL-07 계정 경합(지연 응답), PL-03 30곡 스크롤(높이 ≤320, 마지막 곡 도달), PL-09 현재 곡 재클릭 no-op·전환 중 잠금, PL-10 Drive/녹음 상태. 단언 완화·skip 금지.
4. 검증: `npm run build`, `npm test`, `npx playwright test test/e2e/layout/practice.spec.js test/e2e/player-category.spec.js test/e2e/home-category.spec.js test/e2e/practice-record.spec.js`, 그리고 홈·커뮤니티 레이아웃 spec(`test/e2e/layout/home.spec.js` 등)과 전체 `npx playwright test`(categories 엄격 envelope의 공용 소비자 회귀 확인).
5. `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js`로 4폭(390·768·1150·1280)의 guest/영상 없음/userData/userEmpty + 다크 userData 캡처, 목록 실패·30곡·녹음 실패는 390·1280. Q1~Q9 폭별 판정을 `개발산출물/결과/UXR-3.md`에 표로 기록(특히 961~1150 구간에서 재생 카드 5버튼 폭, 녹음 카드 wrap).
6. push → main 대상 PR 생성 → `gh pr checks --watch` → PR 리뷰 확인 → 결과 파일·이 파일 갱신. 머지는 사용자가 한다.

### 8.3 UXR-3 주니어 4단계 검증 및 마무리 결과 (2026-11-11)

- **선행 및 보존:** `AGENTS.md`, `CLAUDE.md` 사용자 변경 보존.
- **회귀 4건 해결:**
  - `mock-app.js`: `/api/v1/categories` GET 기본 응답(`{ categories: [] }`) 등록 및 `supabaseStub` 내 `fakeSession` 세션 갱신 반영 (사용자 보고 완료).
  - `home-category.spec.js` C4a-5: 인라인 폴더 선택 및 모바일 펼침 기대 단언으로 갱신 통과.
  - `player-category.spec.js` P4b-1, P4b-4: 인라인 선택 및 삭제 분류 시 전체 복구·안내 문구 검증 통과.
  - `practice-record.spec.js` SR1-4: mock categories 기본 응답 등록으로 통과.
- **부족한 PL 테스트 작성 (`practice.spec.js`):**
  - PL-03: 30곡 긴 제목 스크롤(높이 ≤320px, scrollHeight > clientHeight, 목록 내부 스크롤로 마지막 곡 도달 및 선택, 페이지 스크롤 점프 없음).
  - PL-04: 홈에서 삭제된 분류 전달 시 `__all` 복구 및 안내 문구 표시.
  - PL-07: A 조회 중 B 로그인 계정 경합 시 A 지연 응답 해제 후 B 화면에 A 데이터 오염 없음 검증.
  - PL-09: 현재 곡 재클릭 no-op, 다른 곡 전환 중 버튼 잠금(`aria-disabled="true"`) 및 저장 완료 후 해제.
  - PL-10: guest / Drive 미연결 / 영상 없음 가드 검증.
- **검증 결과:**
  - `npm run build`: 성공 (`tsc --noEmit && vite build`).
  - `npm test`: 416 passed / 0 failed.
  - 핵심 4개 E2E: 66 passed.
  - `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js`: 41 passed, 4폭 및 다크 캡처 정상 생성, Q1~Q9 판정 완료.
  - 홈·커뮤니티 레이아웃: 각각 21 passed, 11 passed.
  - 전체 E2E: **635 passed / 0 failed** (10.6m).
- **결과 문서:** [결과/UXR-3.md](결과/UXR-3.md) 작성 완료.
- **Git 처리:** `step/UXR-3` 푸시 및 [PR #2](https://github.com/choise-hun/doloop/pull/2) 생성. GitHub Actions CI(run `43019870416`) 전 항목 통과(success), PR 리뷰/코멘트 0건 확인 완료. 사용자 머지 대기.

## 9. CMR-1 커뮤니티 탐색 구조 4단계 결과

### 9.1 CMR-1 주니어 4단계 검증 및 마무리 결과 (2026-11-11)

- **선행 및 보존:** `AGENTS.md`, `CLAUDE.md` 사용자 변경 보존.
- **체크리스트 점검:**
  - `CommunityPane` 삭제 및 참조 0건 확인.
  - `recentFolders|loadRecent|recentMoreBtn` 프론트엔드 코드 참조 0건 확인.
  - `CurationRows.tsx` 내 `variant === 'home'` 분기 diff 0줄 확인.
- **검증 결과:**
  - `npm run build`: 성공 (`tsc --noEmit && vite build`).
  - `npm test`: 416 passed / 0 failed.
  - 커뮤니티 핵심 E2E (`cm-ui.spec.js`, `community.spec.js`, `layout/community.spec.js`, `layout/home.spec.js`): 97 passed / 0 failed.
  - `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js`: 21 passed (guest, pro, logs, empty 4폭 + 다크 캡처 정상 생성, Q1~Q9 전 항목 ○ 판정).
  - 전체 E2E (`npx playwright test`): **658 passed / 0 failed** (12.3m).
- **결과 문서:** [결과/CMR-1.md](결과/CMR-1.md) 작성 완료.
- **Git 처리:** `step/CMR-1` 푸시 및 [PR #3](https://github.com/choise-hun/doloop/pull/3) 생성, GitHub Actions CI 전 항목 통과(success), PR 리뷰/코멘트 0건 확인 완료. 사용자 머지 대기.

## 10. CMR-2·CMR-3 세부 명세 (2026-11-11)

- 요청/승인: 사용자 지시 “CMR-2·CMR-3 세부 명세 작성(템플릿 §1)”, Tool Lock(소스·테스트 수정, 빌드·테스트 실행 금지). 승인 범위 = 명세 작성·이 파일 갱신(문서만). 구현·Git 게시는 미승인.
- 선행 확인: PR #3 MERGED(2026-11-11T13:57:50Z, merge `e28421d`). `step/CMR-1` → `main` 전환 후 `git pull --ff-only`, 사용자 변경 `AGENTS.md`·`CLAUDE.md` 보존.
- 산출물: [CMR-2 구현 명세](명세/CMR-2_구현명세.md)(D1~D15, 테스트 CMR2-1~17), [CMR-3 구현 명세](명세/CMR-3_구현명세.md)(D1~D27, 테스트 CMR3-1~26).
- 서버·API·DTO·DB 계약 변경 없음. 새 프런트 계약(선택 prop·새 export·해시): `MySharesPanelProps.requireName?`, `CurationRowsProps.emptyExtra?`, `PublicNameModal`(신규 파일), `FolderCardProps/SongCardProps/FolderRowProps.onQuickAdd?`, `QuickAddTarget`·`QuickAddSheet`·`useLongPress`·`songAddInput`·`songAddErrorKey`(신규 파일), `createSong` 입력 `a?`·`b?`(상위 §5.3 승인 범위), `lib/communityMock.ts`(DEV 전용), 해시 `community.html#folder=<id>`(CMR-3 D20·D21).
- 규모: CMR-2 코드 6파일 약 +330/−60, CMR-3 코드 9파일(로직 5) 약 +720/−110 — CMR-3은 상한 경계이며 850줄 초과 시 mock을 별도 커밋으로 분리(명세 §5).
- 검증(문서만): 링크·경로 존재, UTF-8/LF/마지막 개행, `git diff --check`. 코드·빌드·테스트는 Tool Lock으로 미실행.

### 10.1 사용자 결정 대기

| # | 질문 | 시니어 추천 | 답 |
| --- | --- | --- | --- |
| Q5 | CMR-2·CMR-3 구현 + 단계별 Git 게시(`step/CMR-2`·`step/CMR-3` 브랜치·커밋·push·main PR·CI) 승인? | 승인 — 서버 계약 변경 없음, 두 Step 병렬 가능 || 2026-11-11 사용자: 추천대로 진행 |
| Q6 | 폴더 공유 딥링크 `community.html#folder=<id>` 신설(CMR-3 D20·D21) 수용? | 수용 — 상위 §5.3 “공유” 버튼에 공유할 주소가 없어 필요. 프런트 해시만, 공개 범위 변화 없음 || 2026-11-11 사용자: 추천대로 진행 |
| Q7 | 상위 §5.3의 곡 “길이”·“총 길이” 미표시(DTO에 길이 없음, CMR-3 D15) 수용? | 수용 — 표시하려면 서버 DTO 변경(별도 승인)이 필요 || 2026-11-11 사용자: 추천대로 진행 |

### 10.1a 기존 명세 재검토 (2026-11-11)

- 사용자 요청: “명세대로 코드가 나왔다는 전제로 UXR-1·2·3·CMR-1 명세 검토”. 결과: [결과/UIUX-R_명세재검토.md](결과/UIUX-R_명세재검토.md).
- 실제 결함 1건(F1): UXR-1 §6 전제 오류로 A/B 비교 재생이 영상 재생·녹음 중 무반응(`abPair` 매 렌더 새 참조). 추천 소작업 `fix(record)` — `useMemo` 고정 + 부모 재렌더 재현 테스트. **승인 대기(Q8).**
- 문서 정정: 상위 RV-6(판정 오류), RV-8(§5.5·UR-15 대체), CMR-3 D4 격자 규칙 보강. UXR-3 결과 PL-08·PL-11은 전용 테스트 근거 부족(F7).

| # | 질문 | 시니어 추천 | 답 |
| --- | --- | --- | --- |
| Q8 | F1 수정(`step/RECFIX-1`, `SongRecordPanel.tsx`·`LogPage.tsx` abPair 고정 + 테스트 1~2개 + PL-08·PL-11 테스트 보강)을 CMR-2 앞에 끼울까요? | 예 — 서버 계약 변경 없음, 2~3파일, CMR-2와 파일 비중복 | |

### 10.2 다음 세션 시작 멘트

```text
# Claude (시니어) — CMR-2 핵심 구현 및 주니어 인계 (템플릿 §0)
목표: 개발산출물/명세/CMR-2_구현명세.md 기준으로 커뮤니티 소개·“내 연습 공유하기” CTA·빈 상태 단계·이름 모달·공유 가드를 구현한다.
선행 조건: 진행_UIUX수정명세.md §10.1 Q5 승인. git status·브랜치 확인, 사용자 변경 보존, 최신 main에서 step/CMR-2 생성. 명세 §1 전제 file:line 재확인(어긋나면 명세부터 고친다).
범위: 명세 §4 파일만. 서버/API/DTO·ProfilePage·EpisodeShareDialog·CurationRows home 분기 변경 금지.
방식: 규칙 확인 → layout spec(name-modal) Red 확인 → 구현 → CMR2-4·CMR2-6 표적 Green까지만.
중단 지점: step/CMR-2 로컬 커밋까지. 전체 회귀·skipNameModal 적용 목록 확정·push·PR·CI·4폭 Q1~Q9·결과 파일은 주니어 4단계(문서_운영 §6 우선).
완료 기준: diff 요약·표적 Red→Green 근거·주니어 실행 목록을 이 파일에 기록하고 주니어 4단계 멘트를 제공한다. 권장 effort high.
Git 처리: 로컬 커밋만. 머지는 사용자가 한다. CMR-3은 같은 형식으로 별도 세션(명세 CMR-3, 선행 Q5·Q6·Q7).
```

## 11. CMR-2 시니어 핵심 구현 (2026-11-11)

- 요청/승인: 사용자 세션 멘트 “CMR-2 핵심 구현 및 주니어 인계(템플릿 §0)”, Q5 승인. 범위 = 명세 §4 파일, 로컬 커밋까지. push·PR·CI·전체 회귀·결과 파일은 주니어 4단계. (Q8 RECFIX-1은 미답 — 사용자가 CMR-2를 먼저 지시)
- 브랜치: `step/CMR-2` (base `main`=`e28421d`). 사용자 변경 `AGENTS.md`·`CLAUDE.md` 미커밋 보존, `명세/CMR-3_구현명세.md`는 CMR-3 세션용으로 미추적 유지.
- 전제 P1~P14 재확인: 모두 일치. 명세 보정 3건(키 이름 숫자 금지, 전역 `cta` 미정의 → `pillBtn`, 배치 약속 대상) → [명세 §11](명세/CMR-2_구현명세.md).

### 11.1 diff 요약

| 파일 | 변경 |
| --- | --- |
| `frontend/src/components/community/PublicNameModal.tsx` | 신규(113줄). `PublicNameForm` 재사용, `acquireSave`로 저장 중 잠금, ESC/닫기/나중에/배경 = `onDismiss`(저장 중 무시), 입력 focus, Tab 순환, body overflow 잠금·복원 |
| `frontend/src/pages/CommunityPage.tsx` | `#communityIntro`(설명 항상, CTA·힌트는 `me.id===user.id`일 때만), 인라인 배너 삭제, `NameGate` 상태·sessionStorage skip(`ulp:community-name-skip:<uid>`, try/catch), 첫 진입 자동 열기, CTA 가드(이름 없으면 preventDefault→`share` 모달, 저장 후 `log.html` 이동), `emptyExtra`(3단계 `ol` + `#communityEmptyShareCta`), `MySharesPanel`에 `requireName`·`onRequireName` |
| `frontend/src/components/community/MySharesPanel.tsx` | `requireName?: () => boolean` — Pro 검사 뒤·낙관 갱신 앞, 공개 켜기·다시 게시만 |
| `frontend/src/components/community/CurationRows.tsx` | `emptyExtra?`, `#communityAllEmpty` `p`→`div`(home 분기 무변경) |
| `Community.module.css` / `CommunityPage.module.css` | `.nameModal*`(390 하단 시트·768↑ 중앙 480), `.emptyMsg` 열 flex, `.intro*`·`.emptySteps`·`.emptyShareCta`, 두 파일의 `.nameBanner/.bannerTitle` 삭제 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 새 키 10개(명세 §5, 보정 키 이름) |
| `test/e2e/community.spec.js` | CMR2-4·CMR2-6 추가, CM-10 id 치환(단언 의미 유지) |
| `test/e2e/layout/community.spec.js` | `community-name-modal` suite(4폭+다크) |
| `test/e2e/layout/profile.spec.js` | PF2-08 id 치환(단언 유지) |
| `test/e2e/support/community-fixtures.js` | `skipNameModal(page, uid)` 헬퍼(아직 어느 테스트에도 미적용) |

### 11.2 표적 Red → Green

- Red(구현 전, 테스트만 추가): `npx playwright test test/e2e/layout/community.spec.js test/e2e/community.spec.js -g "name-modal|CMR2-"` → **7 failed**(CMR2-4·CMR2-6·name-modal 4폭+다크, 모달 미존재).
- Green(구현 후): `npm run build` 성공 → 같은 명령에 `CM-10|community-empty` 추가 → **13 passed**.
- 보조: `npx tsc --noEmit` exit 0, `node --test test/i18n.test.js` 14 pass(처음 `emptyStep1` 키 형식 실패 → 키 이름 보정 후 통과).
- 미실행: `npm test` 전체, 전체 Playwright, `LAYOUT_SHOTS=1` 스크린샷, CMR2-1~3·5·7~17 테스트 작성.

### 11.3 주니어 4단계 실행 목록

1. 명세 §8의 CMR2-1~3·5·7~17을 `test/e2e/community.spec.js`(필요 시 `layout/profile.spec.js` CMR2-17)에 추가하고 통과시킨다. 구현 결함이 보이면 고치지 말고 결과 파일에 재현·근거를 적어 시니어 핀포인트로 넘긴다.
2. `npm test` 전체, 전체 `npx playwright test`. 기본 `DEFAULT_ME`(이름 없음)로 `community.html`을 여는 기존 테스트의 실패(모달이 클릭 가로챔)는 해당 테스트에만 `skipNameModal(page)`를 `page.goto` 전에 넣는다. 단언은 바꾸지 않고, 적용 목록·사유를 결과 파일에 적는다.
3. 명세 §9 체크리스트(`git grep` 0줄 — CMR2-4 부재 단언 1줄 예외, `ProfilePage.tsx` diff 0, home 분기 diff 0).
4. `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js` 4폭+다크(guest·pro·logs·empty·name-modal) Q1~Q9 → `개발산출물/결과/CMR-2.md`.
5. 이 파일 단계 표·§11 갱신, 커밋·push, main 대상 PR 생성, `gh pr checks --watch`, 리뷰 확인. 머지는 사용자.

### 11.4 주니어 4단계 멘트

```text
# Gemini (주니어) — CMR-2 4단계 최종 테스트·문서·PR/CI 마무리
개발산출물/협업_시니어주니어.md와 개발산출물/프롬프트_템플릿_4단계.md의 4단계를 따른다.
목표: step/CMR-2 시니어 핵심 구현(이름 모달·공유 가드·소개 CTA·빈 상태 단계)을 최종 테스트·문서·PR/CI까지 마무리한다.
기준: 개발산출물/명세/CMR-2_구현명세.md(§8 테스트 표·§9 체크리스트·§11 보정), 진행_UIUX수정명세.md §11.3 실행 목록.
선행 조건: git status·브랜치 step/CMR-2 확인, 사용자 변경(AGENTS.md·CLAUDE.md)·미추적 명세/CMR-3_구현명세.md는 커밋에서 제외하고 보존.
범위: CMR2-1~3·5·7~17 테스트 추가, 전체 회귀와 skipNameModal 적용(단언 불변), 4폭+다크 Q1~Q9, 결과/CMR-2.md·진행 파일 갱신. 구현 결함은 고치지 말고 근거와 함께 시니어 핀포인트로 넘긴다.
완료 기준: npm test·전체 Playwright·LAYOUT_SHOTS 결과가 최신 head 기준으로 결과 파일에 기록되고, main 대상 PR의 최신 CI 통과·리뷰 확인이 끝난다.
Git 처리: step/CMR-2 커밋·push·main 대상 신규 PR 생성·gh pr checks --watch까지. 머지는 사용자가 한다. 권장 effort medium.
```
