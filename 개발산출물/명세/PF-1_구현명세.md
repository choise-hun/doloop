# PF-1 구현 명세 — 프로필 진입과 인증 동선 분리

- 작성: 2026-11-09 / 시니어. 사용자 승인(2026-11-09) 및 구현·검증 완료. 기준 `main=4c0eb84ea4c4304985608f3714e7fa23416931e4`.
- 입력: [계획 #9 PF](../../계획/상용_서비스_계획.md), [REQ-4·AC-8](../요구사항_명세_초안.md), [협업 §1.2](../협업_시니어주니어.md).
- 진행/결과: [진행 PF](../진행_PF.md), [PF-1 결과](../결과/PF-1.md). 로컬 구현 및 4단계 최종 검증 완료 (Git 게시 승인 대기).

## 1. 범위와 승인할 계약

PF 전체는 PF-1 → PF-2 → PF-3의 3개 Step이다. 순서·선행은 계획, 배정·재개는 [진행 PF](../진행_PF.md)가 기준이다.

PF-1의 단일 사용자 여정은 **로그인한 사용자가 계정 메뉴에서 자기 프로필을 열고 설정과 구분하여 로그아웃하는 것**이다. 빈 페이지 라우팅만 만들지 않고, 계정 확인·설정 이동·로그아웃까지 브라우저로 독립 검증한다. 이름 편집·공개 요약은 PF-2, 내 폴더·연습 게시물·철회는 PF-3에서 완성한다. PF-1 통과만으로 REQ-4/AC-8 전체를 완료 처리하지 않는다.

승인 제안(아직 구현하지 않음):

| 변경 계약 | 이유·한계 |
| --- | --- |
| React `/profile.html`, Node `/profile.html`, Ktor `profile.html` 진입 추가 | 직접 진입·새로고침을 동일 SPA로 연결. 기존 HTML 경로와 API 경로는 유지 |
| `ActiveNavKey`에 `'profile'` 추가 | 프로필에서 계정 링크만 `aria-current="page"`. 기존 export 이름·props·기본값 유지 |
| 로그인 상태 `#navAuth[href]`를 `profile.html`로 변경 | SETTING은 `settings.html`, 비로그인·임베드 인증은 현행 유지 |
| 신규 named export `ProfilePage(): React.ReactElement` | App.tsx의 명시적 route로 등록. 새로운 공개 API/DB/인증 함수는 없음 |

구현 담당 **[주니어]**. Shell은 기존 요소의 href/current 속성만 확장하며 이동·래핑·클래스 변경이 없다. auth는 호출만 하고 공용 화면·폼·캐시를 리팩터링하지 않는다. 판정 질문 ① DOM/셀렉터 이동 없음 ② 기존/신규 화면 공존을 위한 공용 화면 코드 수정 없음(기존 Shell 소비만) ③ 새로운 요청 경합·캐시 무효화 없음. 프로필 편집·공용 폼 작업을 포함시키면 이 판정은 무효이며 PF-2 범위로 돌린다.

## 2. 실제 코드 근거

| 근거(file:line) | 확인 사실·설계 영향 |
| --- | --- |
| `frontend/src/App.tsx:34` | HTML별 명시적 route. 현재 profile route 없음 |
| `frontend/src/components/layout/AppShell.tsx:9`, `:69`, `:139` | ActiveNavKey, 비로그인 OAuth 처리, SETTING/계정 링크. 로그인 href만 변경 |
| `frontend/src/lib/auth.ts:64`, `:180`, `:247`, `:284`, `:302`, `:435` | user/me 분리, 세대 증가·me 초기화, fetchMe, 임베드 로그인, local signOut, 실제 export |
| `frontend/src/pages/SettingsPage.tsx:344`, `:377`, `:494`, `:683` | 계정·이메일·로그아웃·공개이름 폼을 현재 위치에서 보존 |
| `frontend/src/pages/PrivacyPage.tsx:5`, `:12` | narrow Shell의 기존 배치 패턴. PF-1은 별도 CSS module로 격리 |
| `frontend/src/pages/SettingsPage.module.css:2`, `:25`, `:68` | headerBlock/pageTitle/setSec/stack의 기존 배치 |
| `frontend/src/styles/tokens.css:9`, `:55`, `:180`, `:204` | 웜 토큰, 직각 카드·pill 컨트롤, pillBtn/ghostBtn |
| `server.js:15`, `:234`; `src/main/kotlin/ulevelp/Main.kt:126`, `:402` | Node는 dist/index.html, Ktor는 publicDir/spa.html을 서빙. 파일명 규약을 섞지 않음 |
| `test/e2e/support/mock-app.js:64`, `:85`; `test/e2e/support/layout-check.js:445` | guest/user, Supabase stub, layoutSuite 인터페이스 |
| `test/e2e/layout/shell.spec.js:6`, `:18`; `test/e2e/layout/settings.spec.js:113` | 6개 하단 탭, 모바일 인증 링크, 기존 settings 준비 셀렉터 |

요구서의 `auth.logout`은 실제 export에 없다. 새 alias를 만들지 않고 현행 `auth.signOut(): Promise<void>`를 호출한다. /me 조회·구독·캐시 초기화는 auth의 기존 책임이다.

## 3. 구현 파일 허용 목록

제품·테스트 **7파일**, 예상 diff 350~550줄(추정). 문서 기록은 별도다. 7파일 또는 600~700줄 상한 초과 예상 시 구현 전에 범위를 재검토하며, 단편 PR로 임의 분할하지 않는다.

| 파일 | 구분 | 변경 |
| --- | --- | --- |
| `frontend/src/pages/ProfilePage.tsx` | 신규 | narrow 프로필, 본인 계정 확인·설정 링크·로그아웃 |
| `frontend/src/pages/ProfilePage.module.css` | 신규 | 독립된 계정 카드·1열 배치·긴 이메일/이름 줄바꿈 |
| `frontend/src/App.tsx` | 수정 | named import와 `/profile.html` route 추가 |
| `frontend/src/components/layout/AppShell.tsx` | 수정 | profile union, 로그인 href 및 aria-current 조건 |
| `server.js` | 수정 | SPA_PAGES에 한 경로 추가 |
| `src/main/kotlin/ulevelp/Main.kt` | 수정 | SPA_ENTRY_PAGES에 한 항목 추가 |
| `test/e2e/layout/profile.spec.js` | 신규 | 프로필 단일 spec에 PF1-01~09 동작·계정 전환 및 상태×4폭·다크·문구·배치 검사 |

`SettingsPage.tsx`, `SettingsPage.module.css`, `auth.ts`, i18n 사전, PublicNameForm, MySharesPanel, API 클라이언트, DB, public HTML, 공통 검사기/fixture는 **읽기만**. 스타일은 PrivacyPage의 narrow 배치를 참고하되 신규 ProfilePage.module.css에 격리한다. 공용 컴포넌트 추출·dependency 추가 없음. 구현 결과 기록은 `개발산출물/결과/PF-1.md`, 진행 기록은 `개발산출물/진행_PF.md`에 둔다.

## 4. Locked Contracts — 전수 유지 목록

아래는 PF-1이 수정·재사용하는 경계다. PF-2/3의 폼·카드는 이 Step에서 렌더하거나 수정하지 않는다.

| 대상 | 유지할 DOM·셀렉터·동작 |
| --- | --- |
| Shell 외곽 | `div[data-shell-variant]` → `nav.site-nav` → 기존 main → `nav[data-tabbar="1"]` → footer의 형제 순서, CSS module 클래스·ref 유지 |
| 상단 기능 메뉴 | 기존 브랜드·MAIN_NAV 항목과 순서·href·label·활성 판정 전부 유지 |
| SETTING | `span.links` 안의 기존 `a[href="settings.html"]`, styles.navItem, `activeNav==='settings'`의 current 유지 |
| 계정 | 같은 형제 위치의 `a#navAuth[data-nav-auth="1"]`, `data-auth-state="signed-in|signed-out"`, styles.navItem, computeInitial 텍스트와 navAriaLabel 유지. 로그인 href/current만 승인 변경 |
| 비로그인 인증 | `settings.html#account`, onClick의 embedded/configured 분기·preventDefault·signIn·실패 fallback 유지. iframe에서만 `_blank`/`noopener` 유지 |
| 하단·푸터 | 6개 링크 순서와 `data-align-group="tabs:top,bottom,height"`, 기존 activeNav 조건, `#theme-light`, `#theme-dark`, aria-pressed와 테마 동작 유지. 프로필을 7번째 탭으로 추가 금지 |
| 기존 설정 | `#account`, `#hAccount`, `#accDesc`, `#accGuest`, `#btnLogin`, `#btnLoginBlank`, `#accUser`, `#accEmail`, `#accName`, `#accQuota`, `#quotaText`, `#quotaBar`, `#driveStoragePanel`, `#btnLogout`, `#accMsg`, `#community`, `#hCommunity`, `#settingsPublicNameInput`, `#settingsPublicNameSave`, `#commAutosync`, `#commPracticeLog` 유지. DOM 이동·복사·해시 변경 없음 |
| 인증 export | useAuth/AuthState, auth.signIn(redirectTo?), auth.signOut(), auth.getSessionGeneration(), auth.computeInitial 유지. window.ULAuth와 local signOut 유지 |
| 스타일 | SettingsPage CSS module의 export·규칙, tokens.css의 모든 값 유지. 신규 화면은 ProfilePage.module.css를 사용. className을 문자열 CSS 해시로 하드코딩 금지 |

`nav.accountAria`의 현재 문구는 “계정 설정 ({who})”(`frontend/src/lib/i18n/ko.mts:28`)이다. PF-1은 사전을 바꾸지 않고 보존하며 PF-2에서 프로필 문구와 함께 검토한다. href와 aria-current는 PF-1부터 정확해야 한다.

## 5. 신규 화면 구조·상태·문구

| 순서·태그 | ID·속성·클래스 | 내용 |
| --- | --- | --- |
| Shell | variant=narrow, activeNav=profile, showThemeToggle 기본값 | 제목은 `Profile · ULeveLP` |
| header div / h1 | styles.headerBlock / `#profileTitle`, page-title + styles.pageTitle | `Profile` 고정 영문 제목(기존 Setting/Privacy 패턴) |
| section / h2 | `#profileAccount`, styles.accountCard, aria-labelledby=profileAccountTitle / `#profileAccountTitle` | `t('settings.secAccount')` |
| guest div / a | `#profileGuest`, styles.stack / `#profileLoginLink`, pillBtn | `t('settings.loginGoogle')`, href=settings.html#account. embedded면 `t('settings.loginBlank')`, target=_blank, rel=noopener |
| signed-in div / p | `#profileUser`, styles.stack / `#profileEmail` | `settings.accEmailLabel`와 본인 이메일(텍스트 노드) |
| signed-in p | `#profileDisplayName` | 같은 uid의 me.displayName이 비어 있지 않을 때만 텍스트 출력 |
| signed-in p | `#profilePublicName` | 같은 uid의 me.publicName이 있을 때 community.nameLabel + publicName 텍스트 출력 |
| signed-in button | `#profileLogout`, type=button, ghostBtn, disabled=busy | `settings.logoutBtn` |
| section의 a | `#profileSettingsLink`, ghostBtn, href=settings.html | `nav.settings` |
| section의 p | `#profileAuthMsg`, role=status, aria-live=polite | 빈 메시지는 빈 텍스트. 결과 settings.logoutSuccess/logoutFail. 실패 시 msg err, 성공 시 msg ok |

guest/user 영역은 조건부 렌더링하며 한쪽만 존재한다. 이메일은 동일 uid의 me.email을 먼저 쓰고 없으면 현재 user.email을 쓴다. 둘 다 없으면 이메일 행을 생략한다. 다른 계정 me는 모든 필드에서 무시한다. 이름을 이메일로 추정하거나 displayName을 publicName으로 대체하지 않는다. 이름 미설정은 행 생략이며 가짜 이름이나 공개 동의를 만들지 않는다.

| 상태·조건 | 화면·처리 |
| --- | --- |
| 인증 초기화 중(user 없음)·비로그인 | auth의 현재 snapshot대로 guest 동선 표시. 저장/게시/개인 데이터 요청 없음. AuthState에 loading/error가 없으므로 새 상태를 추정하지 않음 |
| 로그인, me 조회 중 또는 /me 실패(me=null) | 현재 user의 이메일·로그아웃·설정 동선은 사용 가능. 이름 행 생략. 별도 fetchMe 루프·무한 spinner·가짜 프로필 성공 없음 |
| 로그인 + 일치하는 me | 이메일·설정된 두 이름 표시. free/pro/pro_plus/owner 모두 동일 진입 |
| 로그아웃 클릭 | 중복 클릭 차단 후 auth.signOut() 1회. auth의 즉시 user/me 초기화를 따라 개인 영역 제거 |
| 로그아웃 성공 | settings.logoutSuccess. profile.html에 남아 guest 동선 표시. navAuth는 기존 비로그인 계약으로 복귀 |
| 로그아웃 예외 | 현재 계정/세대에서만 settings.logoutFail. 원시 서버 메시지/HTML 삽입 금지. busy 해제 |
| A→B/로그아웃 중 계정 교체·unmount | 이전 작업 메시지·busy continuation 폐기. uid·sessionGeneration·mounted 조건을 await 뒤 검사하고 새 계정에 A 이름·메시지 표시 금지 |

로그아웃은 함수 내부에서 세대를 증가시키므로 클릭 직전 세대와 성공 후 세대를 단순 비교해 정상 완료를 버리면 안 된다. signOut 호출 직후의 세대를 캡처하고 완료 시 그 세대 및 user=null 여부를 확인한다. B로 바뀌면 완료 메시지를 쓰지 않는다. 계정 identity 변경 시 메시지·busy를 초기화한다. 이 로컬 가드 이외의 auth 재작성은 금지한다.

## 6. 데이터·API 경계

PF-1은 네트워크 API를 새로 호출하지 않는다. 기존 auth 초기화의 GET `/api/v1/me`(성공 200 → MeProfile, 실패 → auth가 me=null 정리)와 Supabase local signOut을 그대로 사용한다. API 상태 코드·오류 포맷을 바꾸지 않으며 legacy `/api` 호출 없음. /me 전체 DTO는 `ProfileService.kt:35`가 원문이고 PF-1은 기존 타입의 id/email/displayName/publicName만 읽는다. 서버와 프런트 누락 필드 정합은 PF-2 범위다.

PF-2 입력 확인: `/me`의 billingTier:string, tierOverrideUntil:string|null, usage:TierUsageDto, creatorBio:string이 현행 MeProfile에서 빠져 있다(`auth.ts:11`, `ProfileService.kt:47`). 공개 요약은 기존 `apiClient.community.user(userId)`가 존재한다(`apiClient.ts:1597`, `:1762`). 중복 래퍼 금지. PublicUserPageResponse는 id/publicName/isCreator/creatorBadge/creatorBio/followerCount/followingByMe/folders/practiceLog이며 **tier/followingCount는 없다**(`CommunityService.kt:135`). 실제 티어는 /me.tier를 쓴다. 팔로잉 수를 추정하거나 새 공개 DTO 필드를 만들지 않는다.

PF-3 입력 확인: `apiClient.community.myEpisodeLogs(cursor?)`와 `apiClient.sessions.withdrawShare(sessionId)`가 이미 있다(`apiClient.ts:1651`, `:960`, `:1774`). 내 게시물 DTO/status/card nullable은 `apiClient.ts:578`, 기존 CM-BE 명세가 원문이다. 폴더/84일 집계와 개별 게시물을 혼합하지 않는다. PF-1에는 폴더·게시물 임시 버튼이나 빈 관리 패널을 추가하지 않는다.

## 7. 배치·접근성 약속

| 상태 | 390 / 768 / 1150 / 1280px | 맞춤 약속 |
| --- | --- | --- |
| guest, user(me 있음/없음), 로그아웃 메시지 | 모두 1열. header → 계정 카드. 기존 narrow 최대폭 840px. 카드 안 이메일·두 이름·버튼·메시지·설정 링크 순서 | 아래 공통 그룹 적용 |
| 공통 | header와 section에 `data-align-group="profileCol:left; profileEdges:right"` | 왼쪽·오른쪽 경계 일치. 버튼은 stack 1열. 억지로 2열/height 그룹을 만들지 않음 |

신규 CSS module export는 headerBlock/pageTitle/accountCard/stack이다. headerBlock은 세로 gap 8px, accountCard는 세로 gap 16px·padding 24px·border 1px var(--line)·background var(--surface)·radius var(--radius-card), stack은 세로 gap 16px이다. pageTitle은 기존 SettingsPage 제목의 타이포그래피를 기준으로 한다. 카드와 이름·이메일의 최소폭은 0이고 긴 텍스트에 overflow-wrap:anywhere를 적용한다. 개별 버튼에 새 곡률·색을 덧씌우지 않는다. 임의 레이아웃 예외·인라인 style 금지. 카드 직각, 버튼 기존 pill, 웜 토큰 유지. 제목 h1은 하나, section은 h2 연결, 동작은 button, 이동은 a. DOM 순서대로 키보드 이동 가능하며 Shell footer/하단 탭이 내용을 가리지 않아야 한다. 4폭 라이트·1280 다크, ko/en/ja, 긴 이메일/이름 및 guest를 확인한다.

## 8. 검증 계획·중요 실패 모드

**아래 전부 이번 명세 단계에서는 미실행.** 구현자는 layout spec → 의도한 Red(profile 부재) → 구현 → Green → 4폭 캡처·Q1~Q9 순서를 지킨다. 기존 fixture 파일을 바꾸지 않고 새 spec 안에서 옵션/route/init script를 조합한다.

| 테스트 | 준비·행동 | 기대·잡아야 할 버그 / 프로덕션 가드 |
| --- | --- | --- |
| PF1-01 signed-in entry | user mock, 홈 #navAuth 클릭 | href=profile.html, Profile h1, navAuth만 current, SETTING=settings.html. 같은 계정에서 분기 누락 탐지 |
| PF1-02 route/reload | guest/user 각각 /profile.html 직접 로드·새로고침·뒤로/앞으로 | Node 200 + #root + Profile h1. route 미등록/빈 SPA 탐지 |
| PF1-03 guest/embedded | guest, 미설정 Supabase, iframe 각각 navAuth·profileLoginLink | 기존 href/OAuth 분기 유지, iframe만 _blank/noopener. 승인 없는 창 열기·OAuth 호출 금지 |
| PF1-04 settings lock | user, SETTING 클릭 및 settings.html#account 직접 진입 | 기존 accEmail/accName/공개이름/로그아웃 셀렉터·저장소 표시 유지 |
| PF1-05 logout | user, SDK signOut 지연·연타 후 resolve | scope=local 1회, ulp:keys 제거, user/me와 이름 DOM 제거, guest 링크와 성공 메시지. SDK 내부 네트워크 예외는 기존 signOut가 흡수함을 구분 |
| PF1-06 A→B continuation | A로 signOut 지연 또는 /me 지연, B auth 이벤트 후 A 응답 완료 | B 계정/이름 유지, A 메시지·이름 복원 없음. 세대·uid·mounted 가드 단언 |
| PF1-07 null/error/empty | me 지연·500·publicName=null·displayName='' | 로그아웃/설정 가능, 이름 추정·별도 조회 폭주·이전 이름 없음 |
| PF1-08 XSS/keyboard | 이름·이메일 HTML payload, Tab/Enter | 텍스트 출력만, 실행 플래그 미설정. 실제 DOM·키보드 동작 확인 |
| PF1-09 Ktor parity | 아래 격리 정적 루트 smoke 후 직접 profile 진입/새로고침 | Ktor 200 text/html·SPA 내용, React Profile h1. Node 결과로 Ktor 통과 대체 금지 |
| PF1-L layout | 위 화면 상태×4폭, ko/en/ja, 다크 | G0~G8/A1 실패 0, 경고 사유 및 Q1~Q9 폭별 표. 완화/skip 금지 |

구현 후 실행 체크리스트:

- [ ] `npm run build` — 타입 검사·빌드 성공.
- [ ] `npx playwright test test/e2e/layout/profile.spec.js` — 먼저 의도한 실패를 기록하고 구현 후 모두 통과.
- [ ] `npx playwright test test/e2e/layout/profile.spec.js -g "PF1-"` — PF1-01~09 중 Node/인증 자동 검증 통과, Ktor 별도 증거 연결.
- [ ] `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js` — 4폭 이미지 실제 열어 Q1~Q9 판정.
- [ ] `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/settings.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js` — 유지 계약 회귀. 이 중 i18n-lang의 기존 화면 목록은 새 profile 자동 포함 증거가 아니며 새 profile spec에서 3언어 검증.
- [ ] `npm test`와 `./gradlew test` — 전체 결과/기존 실패/환경 차단 구분. 관련 실패를 무시하거나 단언 완화하지 않음.
- [ ] Ktor smoke: 운영과 분리한 임시 public root에 빌드 `dist/index.html`을 `spa.html`로 복사하고 assets를 복사한다. 환경별 DB/인증/비밀값은 사용하지 않는다. `PUBLIC_DIR=<임시 루트> PORT=3001 ./gradlew run`으로 로컬 Ktor를 기동한다. 서버가 격리 환경인지 먼저 확인한다. `curl -i http://127.0.0.1:3001/profile.html`의 200/text/html/#root 및 브라우저 직접 진입·새로고침을 기록한다. 기존 3000 서버를 종료/대체하지 않는다. Node dist와 Ktor spa.html 준비를 혼동하지 않는다. 환경 불가면 미검증으로 남기고 전체 통과를 주장하지 않는다.
- [ ] `git diff --check`, `git status --short`, `git diff --stat` — 지정 파일·UTF-8(BOM 없음)/LF, scope 확인.

이번 작업의 승인 범위는 **로컬 문서 작성까지**다. 위 구현·테스트·Git 게시는 아직 승인되지 않았다. 사용자 명세 승인과 함께 구현/Git 범위를 확인한 후 2단계 주니어가 시작한다. PR 머지는 사용자 담당, 배포는 범위 밖이다.
