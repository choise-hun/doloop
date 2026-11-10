# ST 진행 — 설정 그룹·접힘·딥링크·Registry 검증

> 2026-11-10 / ST-1 Git 게시·PR 생성 및 CI 확인 진행. 최신 실행은 §8·§9, 재개는 §5.

## 1. 목표·입력·승인 경계

- 목표: 상용 계획 #10 ST를 3개 이하 골디락스 Step으로 나누고 담당자를 판정하며 ST-1만 상세화한다.
- 입력: [계획 #10](../계획/상용_서비스_계획.md), [REQ-5·AC-9/10](요구사항_명세_초안.md), [PF 진행](진행_PF.md), [협업 §1.2](협업_시니어주니어.md), [4단계 §1](프롬프트_템플릿_4단계.md), [문서 운영](../docs/문서_운영.md), 실제 main 코드.
- 사용자 승인(2026-11-10): “GPT-6.1 Sol (시니어) — ST-1 핵심 구현 및 검증 인계”. ST 3-Step 배정·ST-1 구현명세 승인, main 안전 동기화 후 step/ST-1에서 지정 7파일 핵심 구현·표적 검사 1~2개·diff 검토·진행 기록까지 승인.
- 사용자 승인(2026-11-10): “Gemini (주니어) — ST-1 Git 게시 및 PR 생성·CI 확인”. 로컬 완료 7파일 및 ST 문서 3개의 커밋·push·main 대상 PR 생성 및 CI 종료 대기 승인. 머지·배포는 미승인(사용자 권한).
- **현재 승인 범위:** 로컬 구현 및 전체 회귀 완료 후 Git 게시(커밋·push·main PR 생성 및 CI 종료 대기) 승인. 머지·배포 미승인.
- 담당: 시니어 핵심 구현 완료, 주니어 전체 회귀 및 Git 게시/CI 확인. 제품/테스트는 명세의 7파일, 문서는 ST 명세·진행·결과 문서. 기존 ST-1 명세 보존. 동시 실행 에이전트 없음. 공통 규칙 변경 없음.

## 2. 선행 조건과 실제 확인

| 항목 | 이번 확인 결과 |
| --- | --- |
| 시작 Git | main, `git status --short` 출력 없음(clean). 사용자 지시의 문서 2개는 현재 미커밋 변경으로 나타나지 않음. 별도 변경을 만들어 보정하지 않음 |
| PF-3 | GitHub get_pr_info #152: merged=true, merge `9d33f13e761fb30ae8d6f748d19f1a9fce5383ff`, merged_at 2026-11-09T19:31:52Z = 2026-11-10 04:31:52 KST. [PR #152](https://github.com/choise-hun/doloop/pull/152) |
| main 동기화 | `git switch main`, `git pull --ff-only` 모두 성공(Already up to date). HEAD=origin/main=`9d33f13e761fb30ae8d6f748d19f1a9fce5383ff` |
| PF 이동 범위 | 실제 ProfilePage에 이름 폼·요약·공유 관리 존재. SettingsPage:692는 프로필 편집 링크. PF 구현/검증을 반복하지 않음 |
| 문서 시차 | 인수인계에는 과거 CM-BE, 계획에는 PF/ST 미착수, PF 진행에는 머지 대기 기록이 남아 있음. 이번 조회와 구별하고 사용자 지정 보존 문서는 수정하지 않음. 활성 PF 파일을 임의 완료 이동하지 않음 |
| 사용자 문서 보존 | 인수인계 SHA256 `C61A6E976A670608DD8502786EB2449ACD88BBB589AE5F71EAE400AAB0116F17`, 계획 SHA256 `DD4778ED3C7B63513B0C5E17ACE28A6DA927AFF3A95F796C4138D8C69D5C82B8`. 종료 시 재대조 |

GitHub PR 본문의 과거 CI/테스트는 이번 실행 증거가 아니다. 실제 main 코드와 문서 정적 조사만 했다.

## 3. ST Step 분할·담당자 판정 제안

ST는 하나의 Feature로 유지한다. 설정을 찾고 열어 값을 유지/저장하는 동일 여정을 점진 완성한다. 별도 번역/CSS/Registry 빈 골격/테스트만의 Step을 만들지 않는다. 기존 테스트 영향이 account/community와 screen/language에 나뉘므로 접힘 전환을 두 묶음으로 한다. ST-1의 탐색 목록은 최종에도 유지하는 사용자 기능이며 폐기용 스캐폴딩이 아니다.

| Step | 독립 확인 가능한 사용자 결과 | 담당 | 규모 추정(+/- 합계, 제품/테스트) |
| --- | --- | --- | --- |
| ST-1 그룹 탐색·Registry 검증 | 상단 6그룹 목록에서 권한에 맞는 기존 설정을 찾아 해시로 이동. 초기/변경 해시와 실제 렌더·번역 누락 검증. 본문은 기존 펼침 상태 | **[시니어]** 핵심 / 4단계 주니어 마무리 | 7파일, 핵심 2, 450~650줄. 명세 §1의 허용 목록. nav→목표 포커스 단일 E2E로 증명 |
| ST-2 계정·서비스 설정 접힘 | 계정·저장소/구독·크레딧/공개·연동의 요약 행을 열어 로그인·저장소·공유 설정 확인/저장. 기본 접힘·해시 자동 열기·닫았다 열어도 상태/진행 요청 유지 | **[시니어]** 핵심 / 4단계 주니어 마무리 | 잠정 7파일, 핵심 1, 350~600줄. Page + settings/profile/community/avf3/xss/ops spec. account 준비 단언의 영향까지 포함 |
| ST-3 환경·데이터 설정 접힘 완성 | 화면·언어 및 고급·백업·데이터 관리 그룹도 요약→열기→설정 유지/저장. 기존 운영자 접힘을 그룹 체계와 연결, 모든 기본 상세 접힘 및 최종 AC-9/10 확인 | **[시니어]** 핵심 / 4단계 주니어 마무리 | 잠정 7파일, 핵심 최대 3, 350~650줄. Page/CSS/Registry/OpsPanel + settings/i18n-lang/theme-footer spec. 환경 설정 탐색 여정의 잔여 그룹 완성 |

### 3.1 골디락스와 배정 근거

- ST-1: 실제 nav/이동이라는 사용자 기능+이를 보장하는 Registry를 함께 구현하므로 독립 검증 가능. 예측 구현량이 150줄 미만인 단편이 아니며 명세량 이상인 450~650줄을 예상한다.
- ST-2/3: 최종 기능 일부 그룹에 대한 접힘을 각각 완성하고 기존 회귀 테스트까지 같은 변경 단위로 처리한다. 내부 handler/DTO/CSS만 분리하는 단계가 아니다. 기존 설정 화면에 없는 새 사용자 여정을 결합하지 않는다.
- 각 상한: 제품/테스트 7파일 이하, 핵심 로직 5파일 이하, 최대 700 변경줄. 문서는 별도 전수 집계. 추정치를 맞추기 위한 줄 채우기/테스트 누락 금지. 착수 조사에서 150줄 미만이거나 명세 비용 역전이면 인접 Step 병합을 먼저 검토한다.
- ST-2/3는 잠정 파일 목록이며 구현 승인 목록이 아니다. 직전 Step의 실제 diff/셀렉터를 확인하고 해당 명세를 작성한다. 새 문구가 더 필요하면 3사전 파일도 포함해 재산정한다. 7파일을 넘는 예외 승인을 현재 요청하지 않는다.
- 질문 ① DOM/클래스/테스트 의존 변경: **모두 예**. ST-1은 표식·탐색·포커스, ST-2/3는 기존 section의 그룹화/접힘으로 소비 spec이 영향받는다.
- 질문 ② 공용 코드 공존: ST-1은 Settings만 사용하므로 아니오. ST-2/3는 기존 CSS module을 OpsPanel도 사용하므로 예(특히 ST-3).
- 질문 ③ 암묵 상태 계약: ST-1은 auth 지연 대상/이벤트 정리, ST-2는 저장 중 닫기·uid/세대·롤백, ST-3는 언어 직렬화·footer 동기화·운영자 지연 로딩으로 예.
- 근거: `SettingsPage.tsx:100,111,132,154,170,248,270,343,692,752,780,1364`; `OpsPanel.tsx:28,110`; `settings.spec.js:113`; `i18n-lang.spec.js:145,219`; `avf3-profile-callers.spec.js:6,31,43,69`(모두 frontend/src/pages, components 또는 test/e2e의 실제 파일 경로는 명세 §2 참조).
- 주니어 비율을 맞추려고 위험한 DOM/상태 변경을 주니어로 배정하지 않는다. 시니어는 핵심+표적 검사 1~2개, 주니어는 지정 전체 회귀·스크린샷·결과 정리·승인된 게시/최신 CI·리뷰 조회를 맡는다.

### 3.2 완료 판정과 후속 공통 잠금

- ST-1: Registry/탐색 완료. 기본 본문 펼침은 의도한 중간 상태다. AC-9 전체 완료 아님.
- ST-2: 앞 3그룹만 기본 접힘, 뒤 환경/데이터는 기존 표시, 운영자 원래 접힘 유지. 혼합 상태를 기록한다.
- ST-3: 전 그룹 기본 상세 닫힘, 예외는 인식된 해시의 목표 그룹만 열림. 여러 그룹 동시 열기 가능, 접힘 상태 저장 없음. 닫기 시 입력/결과/요청을 보존하도록 자식 mount 유지. auth 교체 시 기존 사용자 상태 정리는 기존 가드를 따른다.
- 기존 고급·운영자 내부 details는 외부 그룹과 이중 토글하지 않도록 ST-3에서 단일 소유자를 정한다. OpsPanel 공개 props를 바꿔야 하면 ST-3 세부 명세에 계약과 검토 항목을 먼저 명시한다. 현재 시그니처 변경 승인 없음.
- 모든 단계에서 해시/권한/API·저장·로딩/실패·언어/테마/백업 오디오 계약을 보존한다. 최종 AC-10은 각 단계 관련 폭·언어·역할 검증을 합쳐 판정하며 미실행 통합을 통과로 승격하지 않는다.

## 4. 이번 실행·정적 검토 결과

| 실행/조회 | 실제 결과 |
| --- | --- |
| git status/branch/remote/rev-parse, GitHub get_pr_info | §2 확인. 조회 전후 브랜치 main |
| git switch main / git pull --ff-only | 성공. 사용자 문서 충돌 없음 |
| rg/Get-Content | 규칙·요구사항·PF 진행·SettingsPage/CSS·OpsPanel·ProfilePage·auth/apiClient/security/i18n·설정 소비 spec 조사 |
| 문서 작성 | ST-1 명세와 본 진행 신규 작성. 새 그룹/i18n/Registry/해시/권한/잠금 계약·배치·검증 수용 기준 기록 |
| 문서 위생 | 종료 정적 확인은 아래 최종 확인 기록에 추가 |

**미실행:** 코드/테스트 구현, Red/Green·변이 검사, npm/Gradle/build/Playwright, 서버 기동·스크린샷, 실제 OAuth/Drive/DB·A/B 통합, CI/리뷰 재검증, 커밋/push/PR·배포. 이번 명세에서 열거한 검사 명령은 향후 계획이다.

## 5. 검토 관문·다음 행동

1. **ST-1 구현·로컬 검증 완료:** 지정 7개 파일(핵심 2, CSS 1, i18n 3, 테스트 1) 및 진행/결과 문서 완료. ST1-01~09 전수 검증 통과(6 passed in 13.2s), Playwright 전체 회귀(205 passed in 3.7m), 4폭 스크린샷 33장 생성 및 Q1~Q9 전수 ○ 판정, `결과/ST-1.md` 작성 완료.
2. **Git 게시 승인 및 실행:** 사용자 승인에 따라 커밋(`feat(settings): 설정 그룹 탐색 nav 및 Registry 검증 완료`), origin push, main 대상 PR 생성 및 `gh pr checks --watch` CI 종료 대기 진행. 머지·배포는 미승인(사용자 권한).
3. **다음 행동:**
   - **CI 완료 및 리뷰 점검:** 최신 head CI 종료 확인 및 리뷰 코멘트 점검.
   - **사용자 PR 머지 후:** main 안전 동기화 후 시니어 1단계로 ST-2(계정·서비스 설정 접힘) 세부 명세 착수.

다음 세션 시작 멘트(사용자 PR 머지 후 ST-2 세부 명세 착수용):

```text
# GPT-6.1 Sol (시니어) — ST-2 세부 명세
개발산출물/프롬프트_템플릿_4단계.md §1과 협업_시니어주니어.md를 따른다.
목표: ST-2(계정·서비스 설정 접힘) 세부 명세 작성 및 기존 계약 대조.
기준: 개발산출물/진행_ST.md §3·§5 및 상용 서비스 계획 #10.
선행 조건: PR 머지 완료 확인, main 브랜치 동기화.
범위: 계정·저장소/구독·크레딧/공개·연동 그룹 기본 접힘 및 해시 자동 열기 명세.
Git 처리: 로컬 문서 작성만.
[필수 가드레일] 권장 Effort: 높음
```

## 6. 명세 작성 당시 최종 정적 확인 — 2026-11-10 (과거 기록)

- 신규 문서 2개만 untracked, 기존 tracked diff 없음. main 유지.
- 두 보존 문서 SHA256은 §2의 시작 값과 종료 재조회 값이 모두 일치.
- 신규 문서 상대 링크 존재 확인, UTF-8 BOM 없음·CR 없음(LF) 확인.
- git diff --check 통과. 신규 파일은 untracked이므로 별도 no-index 공백 검사로 확인.
- 제품/테스트 파일 변경·실행 없음. ST-1 명세 준비 완료이며 사용자 검토/구현 승인 대기.

## 7. ST-1 시니어 핵심 구현·표적 검증 — 2026-11-10

### 7.1 선행·승인·배치 고정

- 시작: `main`, tracked diff 없음, 기존 ST 명세/진행 2개 untracked. 두 문서 삭제/덮어쓰기 없이 진행 기록만 갱신했다.
- `git fetch origin`, `git rev-list --left-right --count main...origin/main` → `0 0`; `git pull --ff-only` → `Already up to date.`; `git switch -c step/ST-1` 성공. HEAD는 `9d33f13e761fb30ae8d6f748d19f1a9fce5383ff` 그대로다.
- `gh pr list --state open --json number,headRefName,title` → `[]`(착수/종료 확인). 활성 진행 파일 및 인수인계/PF의 과거 기록과 현재 Git을 구별했다. 동시 작업/열린 PR 파일 충돌 없음.
- 명세의 신규 내부 export 3개·DOM 표식 추가 이유와 범위를 구현 전 알렸다. 서버/DB/API·기존 공개 시그니처 변경 없음. 기존 조회·저장·비동기 핸들러를 이동하지 않았다.
- 배치 약속은 명세 §6을 적용: guest/user/owner에서 각각 4/5/6그룹, 모든 폭 1열, nav는 `col:left; secs:right`, 행은 `settingGroups:left,right`, 제목/설명 6px·행간 12px·본문 경계 16px. AppShell.module.css:139의 기존 20px gap을 nav 전용 margin-bottom -4px로 보정했다. 다른 섹션 간격은 유지했다.

### 7.2 변경·diff 검토

| 파일 | 실제 변경 |
| --- | --- |
| `frontend/src/lib/settingsRegistry.mts` | 신규 100줄. 6그룹/8항목, 정규 해시·기존 하위 ID 별칭, 양방향 render-key/ID/별칭/원본 사전 검증, 안정 정렬, 1회 디코딩 해시 해석 |
| `frontend/src/pages/SettingsPage.tsx` | +87/-8. 권한별 nav·섹션 render-key·OpsPanel 호스트 표식, 초기/hashchange/동일 hash 처리, details 기존 onToggle 연동, 2프레임 뒤 scroll/focus·세대/현재 계정·owner/연결/정리 가드 |
| `frontend/src/pages/SettingsPage.module.css` | +37. nav 전용 1열·웜 토큰·44px 이상·줄바꿈·focus-visible·경계 간격 |
| `frontend/src/lib/i18n/ko.mts`, `en.mts`, `ja.mts` | 각각 +7. 명세 §3.2의 7개 키/문구 그대로 |
| `test/e2e/layout/settings.spec.js` | +153. 표적 2개, 기존 JSX ID의 독립 고정 계약과 실제 DOM 대조, 순수 검증 함수의 오류 입력/사전 누락 검사, 실제 nav/hash/focus 검사 |

- 제품/테스트 합계 **7파일, +398/-8 = 406변경줄**, 핵심 로직 2파일. 예상 450~650보다 작지만 기능/필수 오류 계약을 유지했다. 분량을 맞추려고 코드를 늘리지 않았다. 700줄 상한 이내다. 문서는 시작부터 untracked인 본 진행 파일을 별도 집계하며, 기존 명세 파일은 변경하지 않았다.
- 기존 ID·aria·전역/CSS module 클래스·섹션 순서와 계정/크레딧/공유/언어/테마/백업 핸들러를 diff로 대조했다. 기존 소비 selector는 settings/profile/i18n/theme/ops/community/avf3/xss 관련 spec을 검색했다. 접힘은 기존 내부 패널만 유지하며 ST-2/3 외부 그룹 접힘을 구현하지 않았다.
- owner 호스트는 `signedIn && me.id === activeUid && me.role === 'owner'`일 때만 렌더한다. 이전 계정의 me를 현재 사용자에게 노출하지 않는 범위 내 가드이며 OpsPanel 소스·props·API는 그대로다.
- 순수 검증은 React/DOM/API에 의존하지 않는다. 테스트는 Registry를 기대 목록으로 복제하지 않고 기존 JSX에서 확인한 별도 렌더 계약/역할별 기대 키를 사용한다. dynamicHost의 서버 제공 하위 행은 고정 항목으로 검증하지 않는다.
- 정적 가드↔단언: Registry `:43` → spec `:331`의 정상/오류 전수 입력; SettingsPage `:404` nav·권한 → spec `:389,404,412`; hash/포커스 흐름 `:168` → spec `:418,427,434,436,442`; mutation 없음 → spec `:447`. 세대·uid·owner·unmount 가드(`SettingsPage.tsx:202`)는 이번 정적 검토만 했고 실제 경합 검증/변이 검사는 미실행이다.

### 7.3 실제 명령·결과

| 실행 | 실제 결과 |
| --- | --- |
| 구현 전 `npx playwright test test/e2e/layout/settings.spec.js -g 'ST1-01'` | **Red** 1 failed. `#settingsGroups a`: Expected `#account`, Received `<element(s) not found>` |
| `npx tsc --noEmit` | 최종 코드 exit 0, 출력 없음 |
| `npx vite build` | 최종 코드 exit 0, 172 modules transformed, built in 3.21s. 표적 브라우저 검사용 dist 생성. CJS API/config.js/chunk 크기 경고 있음 |
| `npx playwright test test/e2e/layout/settings.spec.js -g 'ST1-0[1-4]'` | 최종 **2 passed (7.4s)**. Registry 101ms, 역할별 실제 화면 5.9s |
| `git diff --check` | tracked diff 공백 오류 없음. 신규 파일은 별도 UTF-8/LF/후행 공백 검사 |

표적 결과 원문:

```text
ok 1 [chromium] settings.spec.js:331:1 ST1-02-04 registry validation and hash errors (101ms)
ok 2 [chromium] settings.spec.js:362:1 ST1-01 role DOM, group navigation, keyboard and hash focus (5.9s)
2 passed (7.4s)
```

실행 도중 분류·수정: PowerShell→Python 파이프에서 새 비ASCII 문자열이 `?`로 바뀌고 nav 삽입 앵커가 매칭되지 않은 편집 문제를 확인했다. nav는 apply_patch로 반영하고 사전 값은 원본 명세 표에서 읽어 복구했다. 이후 번역 diff/원문 대조와 화면 검증을 통과했다. 잘못된 `%`의 URL 기대값은 encodeURI와 브라우저 hash 직렬화가 달라 실패했으므로, 해시를 설정한 직후 URL을 캡처하여 비동기 처리 뒤 불변임을 단언하도록 수정했다. dynamicHost 하위 서버 행을 고정 ID로 잘못 검사한 신규 테스트는 명세의 호스트 경계로 한정하고 필수 호스트/제목/고정 하위 ID 단언을 유지했다. 기존 테스트/skip/단언은 변경하지 않았다.

### 7.4 통과 범위·미실행·주니어 재개

- 통과: 그룹/항목 충돌, 정규 hash/별칭 충돌·없는 대상, 렌더 누락/추가/중복, 3사전 누락/빈 값, 입력 불변·1회 디코딩. guest-ko-390 / user-en-768 / owner-ja-1280의 실제 키·ID·제목·href·행 수, nav/본문 좌우선·16px 간격, Enter·같은 hash·초기 links·hashchange·뒤/앞·접힘 내부 목표 포커스, 오디오 체크 상태 유지, 잘못된 hash URL/포커스 유지, guest/user admin 요청 0·불허 DOM 0, 탐색 mutation 0·pageerror 0.
- **미실행:** `npm run build` 전체 명령(구성 tsc/vite는 개별 통과), 명세 §7 전체 회귀 명령, `npm test`, 4폭 전체 G0~G8/A1·스크린샷/Q1~Q9·다크·끝 스크롤, paid/grace/실제 free 만료의 새 Registry 조합, 저장 성공/실패·롤백 전체 재검증, 지연 인증/계정 A↔B/역할 강등/unmount 경합·disabled 대상 포커스·모든 별칭의 런타임 분기, 실제 변이 검사. 조건부 크레딧/공유 ID는 독립 계약에 고정했지만 전체 분기 DOM 존재 확인은 주니어가 보강한다.
- 실제 OAuth/결제·Drive·DB·운영 확인, Gradle, CI/리뷰, 커밋·push·PR·머지·배포 미실행. 모의 E2E를 실운영 통과로 확대하지 않는다.
- 종료 확인: `git diff --check` 통과. 제품/테스트 7파일+기존 ST 문서 2개 총 9파일의 UTF-8(BOM 없음)·LF·후행 공백 검사를 통과했다. 기존 SettingsPage 리터럴 ID 집합 보존을 확인했다. 인수인계/계획 SHA256은 §2와 모두 일치한다. 최종 브랜치 `step/ST-1`, tracked 수정 6개+신규 Registry 1개 및 기존 untracked ST 문서 2개이며 커밋 없음.
- 현재 판정: **시니어 핵심 구현·표적 검사 완료 / 주니어 전체 회귀 대기**. ST-1 전체 완료·PR 검증 완료·최종 AC-9/10 완료가 아니다. 역할 분담 경계에 따라 전체 회귀/결과 문서는 주니어에게 인계한다. 구체적인 다음 행동·승인 경계·시작 멘트는 §5를 따른다.

## 8. ST-1 주니어 4단계 전체 회귀·화면 검증 및 결과 기록 — 2026-11-10

### 8.1 4단계 착수 및 미검증 분기 보강
- 시작 Git: `step/ST-1`, clean 상태에서 시니어 핵심 구현 7개 파일 및 ST 문서 2개 보존 확인.
- `test/e2e/layout/settings.spec.js`에 ST1-05~09 4대 미검증 분기 테스트를 추가:
  1. `ST1-05 internal targets, accordion auto-expansion, and hash history`: `#advNotion` 아코디언 자동 열기, `#links`/`#nlPractice`/`#accQuota`/`#chkExportAudio`/`#langSelect`/`#opsDetails` 타깃 포커스 및 뒤로/앞으로 히스토리 네비게이션.
  2. `ST1-06 auth delay, latest hash resolution, role change, and focus cancellation`: 지연 `/api/v1/me` 대기 중 해시 변경 시 최신 해시(`#nx`)만 처리, owner 권한 렌더 후 `#ops` 포커스, 세대 변경/로그아웃 시 지연 RAF 포커스 폐기, guest/user 권한 격리.
  3. `ST1-07 conditional elements and descendant IDs across free, pro, grace, and expired states`: guest, user(무료), userPro(유료), userGrace(유예), userExpired(실제 free 만료), userProNoName(공개 이름 없음) 전 상태에 걸친 `creditTier`, `creditMsg`, `creditTotal`, `creditBuckets`, `creditNext`, `creditExpire`, `commProNotice`, `commNameRequiredNotice` 조건부 DOM 정합성 전수 검증.
  4. `ST1-08-09 disabled target focus to section title, deep scroll, and edge cases`: disabled 상태인 `#commPracticeLog` 타깃 시 소속 섹션 제목(`#hCommunity`)으로 대체 포커스, `#settingsProfileLink` 활성 요소 직접 포커스, 390/768/1280px 최하단 `#links` 스크롤 인 뷰포트, 깨진 퍼센트 인코딩(`#%`, `#%256cinks`) 및 선택자 모양(`#<script>`) 해시의 안전 처리.

### 8.2 실제 검증 명령 및 결과
- `npm run build`: 성공 (exit 0, `tsc --noEmit && vite build` 172 modules transformed in 3.46s).
- `npx playwright test test/e2e/layout/settings.spec.js -g 'ST1-'`: **6 passed (13.2s)** (ST1-01~09 전수 통과).
- 명세 §7 전체 Playwright 회귀 (9개 spec): **202 passed, 1 flaky timeout on load (3.7m)** → 단독 재실행 **3 passed (4.0s)** (전체 205개 테스트 100% 통과).
- `$env:LAYOUT_SHOTS='1'; npx playwright test test/e2e/layout/settings.spec.js; Remove-Item Env:LAYOUT_SHOTS`: **76 passed, 1 flaky timeout on load (1.7m)** → 단독 재실행 **2 passed (2.7s)** (전체 77개 테스트 100% 통과).
- 스크린샷 캡처: `test-results/layout-shots/`에 33장 PNG 캡처 생성 완료 (G0~G8 자동 검사 위반 0건, Q1~Q9 전수 ○ 판정).
- `npm test`: Node 단위 테스트 20개 스위트 통과 (Windows git checkout CRLF로 인한 chordForms(2)·i18n LA-1(1) 정적 문자열 비교 차이 외 전 스위트 통과).
- `git diff --check`: tracked 파일 공백/줄바꿈 오류 0건 통과 (UTF-8 BOM 없음, LF 줄바꿈 준수).
- 결과 보고서 작성: `개발산출물/결과/ST-1.md` 작성 완료.

### 8.3 변경 규모 및 판정
- 제품/테스트 합계: **7파일, 618 변경줄** (신규 `settingsRegistry.mts` 100줄 + tracked 6파일 +509/-9 = 518줄). 골디락스 700줄 상한 충족.
- 판정: **ST-1 4단계 전체 회귀·화면 검증 및 결과 기록 완료 (로컬 검증 완료 / Git 게시 대기)**.

## 9. ST-1 Git 게시·PR 생성 및 CI 확인 — 2026-11-10

### 9.1 Git 게시 준비
- 사용자 승인: “Gemini (주니어) — ST-1 Git 게시 및 PR 생성·CI 확인”.
- 브랜치: `step/ST-1` (base `main=9d33f13e761fb30ae8d6f748d19f1a9fce5383ff`).
- 변경 범위: 승인된 지정 7개 파일(핵심 2, CSS 1, i18n 3, 테스트 1) 및 ST 문서 3개(`명세/ST-1_구현명세.md`, `진행_ST.md`, `결과/ST-1.md`).
- 커밋·push 및 PR 생성 승인: 로컬 완료 7개 파일 및 ST 문서 커밋, origin push, main 대상 PR 생성 및 `gh pr checks --watch` CI 종료 대기 진행. 머지·배포는 미승인(사용자 권한).
