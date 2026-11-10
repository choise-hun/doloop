# ST-1 구현 명세 — 설정 그룹 탐색과 Registry 검증

> 2026-11-10 / 시니어 명세 초안 / 사용자 검토 대기. 기준 main `9d33f13e761fb30ae8d6f748d19f1a9fce5383ff`.
> 이번 단계는 문서만 작성했다. 구현·테스트 작성·빌드·테스트 실행·Git 게시 승인 없음.

## 1. 목적·단계 경계·변경 목록

- 기준: [계획 #10 ST](../../계획/상용_서비스_계획.md), [REQ-5·AC-9/10](../요구사항_명세_초안.md), [ST 진행](../진행_ST.md), [PF 진행](../진행_PF.md).
- ST-1은 설정 상단의 그룹 탐색 목록에서 기존 설정으로 이동하는 여정과, 그 목록/실제 렌더의 누락 방지를 완성한다. 빈 Registry만 만들고 끝내지 않는다.
- ST-1에서 기존 본문은 펼침 상태를 유지한다(이미 접힌 내부 패널은 유지). 기본 접힘은 ST-2/3에서 그룹별로 도입한다. ST-1 통과를 최종 AC-9 통과로 보고하지 않는다.
- 별도 그룹 컴포넌트 신설은 이번 범위에 없다. 실제 컨트롤 JSX·상태·핸들러를 Registry로 옮기지 않는다.
- 구현 담당 **[시니어]**: 기존 DOM 표식·포커스·조건부 렌더를 연결하므로 협업 §1.2 질문 ①에 해당한다. 전체 회귀·스크린샷·PR/CI 마무리는 승인 후 4단계 주니어 담당.

| 향후 제품/테스트 변경 파일(전수, 7개) | 허용 변경 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx` | 그룹 탐색 nav, Registry 연결, 실제 섹션의 render-key 표식, 해시 처리와 정리 |
| `frontend/src/pages/SettingsPage.module.css` | 그룹 목록/링크의 배치·포커스·웜 토큰. 기존 컨트롤 CSS 유지 |
| `frontend/src/lib/settingsRegistry.mts` (신규) | 순수 메타데이터·검증·해시 해석. React/DOM/API 의존 금지 |
| `frontend/src/lib/i18n/ko.mts` | 아래 신규 키 7개 |
| `frontend/src/lib/i18n/en.mts` | 동일 키 7개 |
| `frontend/src/lib/i18n/ja.mts` | 동일 키 7개 |
| `test/e2e/layout/settings.spec.js` | Registry 순수 검증 케이스 및 실제 DOM 대조·그룹 탐색·해시·배치 테스트 |

문서 기록은 본 명세·진행_ST.md·향후 결과/ST-1.md이다. 제품/테스트 규모는 7파일, 핵심 로직 2파일, 예상 450~650 변경줄(+/- 합계), 최대 700줄. 문서도 전체 diff에 따로 집계한다. 7파일·핵심 5파일·700줄 초과 예상 시 구현 전 범위를 재조정한다. 테스트/번역을 집계에서 숨기지 않는다.

## 2. 실제 코드 근거

| 근거(file:line, 기준 SHA의 행) | 확인한 계약 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx:38`, `:334` | named/default export SettingsPage, AppShell narrow/settings/showThemeToggle |
| 같은 파일 `:343`, `:574`, `:636`, `:683`, `:752`, `:780`, `:800`, `:1364` | account/nx/credits/community/screen/langSec/advanced/조건부 OpsPanel. 별도 Registry·그룹 컴포넌트 없음 |
| 같은 파일 `:154` | 기존 고급 패널은 초기 hash만 읽음. 페이지 전체의 hashchange 처리 없음 |
| 같은 파일 `:111`, `:132`, `:248`, `:270` | 공유 토글 세대·롤백, 계정별 초기화, 크레딧 조회. 그룹 탐색에서 변경 금지 |
| 같은 파일 `:170`, `:752`, `:780` | 언어 직렬화·테마/언어 버튼 계약 |
| 같은 파일 `:585`, `:606` | 오디오 관련 설정은 백업의 오디오 포함 체크·export 인자. 별도 음량/출력 설정 없음 |
| 같은 파일 `:692` | 프로필 편집 링크 `profile.html#profileNames`. 설정에 이름 편집 폼 재추가 금지 |
| `frontend/src/pages/ProfilePage.tsx:257`, `:279`, `:300` | 이름 폼·내 공유 관리의 실제 프로필 이동. PF-3 재구현 없음 |
| `frontend/src/components/ops/OpsPanel.tsx:28`, `:45`, `:110` | 자체 접힘, 403 처리, #ops/#opsDetails/#hOps. owner만 SettingsPage에서 렌더 |
| `frontend/src/pages/SettingsPage.module.css:25`, `:68`, `:96` | setSec/stack/panel과 surface/line/radius-card 토큰 재사용 |
| `frontend/src/lib/security.ts:83`, `:88`, `:90` | getTheme/setTheme, ulp:theme, ulp:themechange |
| `frontend/src/lib/i18n.mts:4`, `:8`, `:55`, `:78`, `:82` | auto/ko/en/ja, ulp:lang, 언어 이벤트, t() 폴백(누락 검증에는 사용 불가) |
| `frontend/src/lib/auth.ts:11`, `:64`; `frontend/src/lib/apiClient.ts:184` | MeProfile/ProfilePatchInput/CreditsSummaryDto 유지 |
| `test/e2e/layout/settings.spec.js:113`, `:134`, `:153`, `:251`, `:268` | 기존 ready·크레딧·필 한 줄·간격 단언. 접힘 변경은 후속 단계에서 명시적 열기로 대체 |
| `test/e2e/i18n-lang.spec.js:145`, `:219`; `test/e2e/theme-footer.spec.js:31` | 언어 저장 직렬화와 footer/theme 동기화 회귀 |

## 3. Registry 데이터·검증·오류 계약(신규 제안)

모듈에서 `SETTINGS_GROUPS`, `validateSettingsRegistry`, `resolveSettingsHash`를 named export한다. 기존 export/함수 시그니처 변경은 없다. 아래 신규 내부 인터페이스는 명세 승인 대상으로 제시한다.

- 그룹 필드: `id: string`, `titleKey: string`, `items: readonly SettingItem[]`.
- 항목 필드: `id: string`, `titleKey: string`, `renderKey: string`, `targetId: string`, `aliases: readonly string[]`, `availability: 'always' | 'signedIn' | 'owner'`, `kind: 'fixed' | 'dynamicHost'`.
- aliases는 # 없는 기존 DOM ID 문자열. targetId 자체를 정규 해시로 사용하고 aliases에는 중복 기입하지 않는다.
- metadata에 JSX/설정값/토큰/이메일/서버 데이터/저장 함수/두 번째 섹션 정의를 넣지 않는다.
- 검증 입력: groups, 실제 렌더 계약 목록(`renderKey`, `targetId`, `descendantIds: readonly string[]`, availability, kind), `{ko,en,ja}`의 원본 사전. 반환은 `{code, subject}[]`; 성공은 빈 배열. 입력 변경 금지.
- 오류 code: `DUPLICATE_ID`, `DUPLICATE_ALIAS`, `UNKNOWN_RENDER_KEY`, `MISSING_RENDER_KEY`, `DUPLICATE_RENDER_KEY`, `UNKNOWN_TARGET`, `MISSING_I18N_KEY`. 모든 오류를 수집하고 code/subject 순으로 안정 정렬한다.
- 그룹/항목 ID는 전체에서 유일. 정규 해시+별칭의 전체 이름 공간도 유일. 그룹 탐색 자체 ID는 항목 ID와 별도 접두어를 쓴다.
- metadata 항목과 렌더 계약은 양방향으로 1:1이어야 한다. 실제 JSX는 기존 섹션에 `data-setting-render-key`를 부착한다. E2E가 DOM에서 독립적으로 키/ID를 추출해 대조한다. Registry 배열을 다시 기대 배열로 복사하는 테스트는 금지한다.
- 원본 3사전에 key가 own-property로 있고 값이 비어 있지 않아야 한다. t()의 한국어 폴백으로 누락을 덮지 않는다.
- 해시 별칭은 실제 렌더 계약의 targetId 또는 그 하위 ID여야 한다. 조건부 항목은 역할별 DOM 테스트로 존재를 확인한다. 임의 CSS 선택자로 해시를 해석하지 않는다.
- dynamicHost는 고정 호스트만 검증한다. 운영자 검색 결과/폴더/서버 제공 행을 고정 Registry 항목으로 복제하지 않는다. 예외를 이유로 ops 호스트 자체의 누락을 허용하지 않는다.
- 구조 오류는 테스트/CI를 실패시킨다. 운영 화면에 원시 오류를 뿌리거나 설정 기능을 차단하는 throw는 추가하지 않는다.

### 3.1 그룹·렌더 대응표(전수)

| 그룹 ID / titleKey 접미사 | 항목 id / renderKey / targetId | 제목 키 | 권한·종류 |
| --- | --- | --- | --- |
| accountStorage / accountStorage | account / account / account | settings.secAccount | always/fixed |
| subscriptionCredits / subscriptionCredits | credits / credits / credits | settings.secCredits | always/fixed |
| publicIntegration / publicIntegration | community / community / community | community.settingsTitle | signedIn/fixed |
| appearanceLanguage / appearanceLanguage | screen / screen / screen | settings.secScreen | always/fixed |
| appearanceLanguage | language / language / langSec | settings.secLang | always/fixed |
| advancedData / advancedData | backup / backup / nx | settings.secNx | always/fixed |
| advancedData | advanced / advanced / advanced | settings.advSummary | always/fixed |
| operations / operations | opsHost / opsHost / ops | settings.groups.operations | owner/dynamicHost |

기존 섹션 내부 해시는 실제 ID 목록을 검사해 소속 항목으로 연결한다(예: accQuota/driveStoragePanel→account, commAutosync/commPracticeLog→community, langSelect→language, chkExportAudio→backup, links→advanced, opsCreator→opsHost). 고급 패널의 현존 내부 ID·별칭은 해당 JSX(`SettingsPage.tsx:800-1361`) 그대로 보존하며 이 작업에서 신규 연동 동작을 추가하지 않는다. 렌더 계약의 descendantIds에는 이 기준 소스의 해시 대상으로 지원할 하위 ID를 전수 고정하고, 별칭이 그 목록에 없으면 UNKNOWN_TARGET으로 실패시킨다. E2E는 그 ID가 실제 소속 섹션 아래 존재하는지도 확인한다. Registry 고정 항목을 모든 input 단위로 확장하지 않는다.

그룹 nav의 href는 각 그룹 첫 접근 가능한 항목의 정규 targetId이다. 공개·연동 그룹은 guest에게 목록/본문 모두 없다. 운영자 그룹은 owner만 있다. 사용자 권한은 URL이나 Registry로 부여하지 않는다.

### 3.2 새 i18n 키(접두어 settings.groups)

| 접미사 | ko | en | ja |
| --- | --- | --- | --- |
| navigation | 설정 그룹 | Settings groups | 設定グループ |
| accountStorage | 계정·저장소 | Account & storage | アカウント・ストレージ |
| subscriptionCredits | 구독·크레딧 | Subscription & credits | プラン・クレジット |
| publicIntegration | 공개·연동 | Sharing & connections | 公開・連携 |
| appearanceLanguage | 화면·언어 | Appearance & language | 表示・言語 |
| advancedData | 고급·백업·데이터 관리 | Advanced, backup & data | 詳細・バックアップ・データ管理 |
| operations | 운영자 | Administration | 管理者 |

요약은 우선 항목 제목 목록으로 구성한다. 서버 값·이메일·티어를 새로 요약하지 않으므로 로딩/실패를 성공/0으로 잘못 표시하지 않는다.

## 4. 해시·포커스·상태 전이

- `resolveSettingsHash(hash, groups)` 반환: 인식 시 `{groupId, renderKey, targetId}`(targetId는 실제 해시가 가리킨 ID), 미인식/빈 값/잘못된 percent encoding은 null. 디코딩은 1회만 하고 예외를 밖으로 던지지 않는다.
- 초기 마운트와 hashchange 때 처리한다. 같은 해시 링크를 다시 클릭해도 이동한다. 이벤트 정리는 unmount에서 한다.
- 권한 확인→조상 details 펼침→React DOM 반영 확인→scrollIntoView→focus 순서. details의 React onToggle/open 상태와 DOM이 일치해야 한다. 속성만 강제로 조작한 뒤 React가 닫는 구현 금지.
- 제목/section처럼 기본 포커스 불가인 대상은 tabIndex=-1로 프로그램 포커스만 허용한다. 원래 input/button의 tabIndex/disabled를 바꾸지 않는다. disabled 컨트롤은 소속 제목으로 포커스한다.
- 해시를 selector 문자열에 연결하지 말고 getElementById로 조회한다. history.pushState/replaceState로 URL을 임의 재작성하지 않는다. 뒤로/앞으로는 현재 해시를 재처리한다.
- auth 초기화 동안 조건부 대상이 없으면 최신 해시 1개만 보류한다. user/me 변경 후 현재 권한으로 재평가한다. A→B, owner→user, unmount 뒤 지연 포커스가 이전 DOM에 적용되지 않도록 작업 세대/정리 가드를 둔다.
- guest의 #community/#ops와 비owner의 #ops: 해당 그룹/본문 미노출, 요청 없음, 포커스 강탈 없음. 로그인 후 현재 URL이 여전히 유효할 때만 재평가한다.
- 알 수 없는 해시/빈 해시: 브라우저 URL 보존, 오류 배너/자동 저장/임의 첫 그룹 이동 없음.
- ST-1의 기본 본문 펼침을 제외하면 기존 내부 접힘과 입력 상태는 그대로다. 추후 그룹을 닫아도 자식을 unmount하지 않는 계약을 ST-2/3에 넘긴다.

## 5. Locked Contracts — 변경 금지 목록

- 경로 `settings.html`, `profile.html#profileNames`; AppShell props/named/default export 유지. 서버 SPA 경로·DB·API·인증 구현·타입 변경 없음.
- 기존 section ID `account,nx,credits,community,screen,langSec,advanced,ops`, 제목 ID `hAccount,hNx,hCredits,hCommunity,hScreen,hLang,hAdvanced,hOps`와 aria-labelledby 보존.
- 계정/저장소: `accDesc,accGuest,btnLogin,btnLoginBlank,accUser,accEmail,accName,accQuota,quotaText,quotaBar,driveStoragePanel,driveProviderText,driveStatusMsg,driveConflictNotice,btnDriveEnable,btnDriveDisable,btnDriveMigrate,btnLogout,delConfirm,btnDeleteAcc,accMsg` 유지.
- 백업: `chkExportAudio,btnExportZip,nxMsg`; 크레딧: `creditTier,creditMsg,creditTotal,creditBuckets,creditNext,creditExpire` 유지. 조건부 동일 ID가 동시에 중복 렌더되지 않아야 한다.
- 공개 설정: `settingsProfileLink,commAutosync,commPracticeLog,commProNotice,commNameRequiredNotice,commErrMsg`, role=switch/aria-checked/disabled 유지. 설정의 publicName/displayName 편집 폼은 복원하지 않는다.
- 화면/언어: `#screen [data-theme]`, `langDesc,langSelect`, `[data-lang]`, role=group, aria-label/aria-pressed, 기존 `seg-pill,seg-btn` 유지.
- 고급 내부 전체 DOM/ID/핸들러는 `SettingsPage.tsx:800-1361` 기준 그대로 유지. 운영자 하위 전체는 `OpsPanel.tsx:110` 이후와 OpsFolders의 기존 클래스/ID 그대로 유지. ST-1은 OpsPanel 소스를 바꾸지 않고 상위 호스트에만 표식을 둘 수 있다.
- 기존 CSS module setSec/panel/row/stack/segPill/segBtn와 글로벌 set-sec/tl-bar/pillBtn/ghostBtn/inpField/hint/msg 및 community switch 클래스 유지. nav 전용 클래스만 추가한다. 기존 배치 표식 col/secs/creditHead/commSw/commSw2를 삭제하지 않는다.
- auth.signIn/signOut/deleteAccount/fetchMe/updateProfile와 drive 호출, busy·세대·uid·요청 순번·낙관 갱신/실패 롤백을 옮기거나 재작성하지 않는다. nav 클릭/해시 변경은 PATCH/POST/DELETE를 발생시키지 않는다.
- 언어 `auto,ko,en,ja`, 저장 `ulp:lang`, PATCH locale=auto일 때 null, 로그인 시에만 서버 직렬화, 로그아웃 세대의 대기 작업 폐기 유지. locale 저장 실패를 성공 배너로 새로 표시하지 않는다.
- 테마 `'',light,dark`, 저장 `ulp:theme`, THEME_EVENT, 시스템 선택 시 data-theme 제거, footer와 동기화 유지.
- 백업 오디오 기본 true·boolean export 인자·다운로드·실패 문구 유지. 오디오 엔진/재생·녹음·음량 설정 추가 또는 변경 없음.
- /me·credits 필드는 기존 타입 전부 유지. 이 작업은 DTO를 새로 해석하거나 응답을 변경하지 않는다. 기존 API 오류의 status/code/message와 communityErrorKey 매핑·AbortError 취급 유지. 신규 API/HTTP 오류 코드 없음.
- 권한: signedIn과 me 로딩을 혼동하지 않는다. communityWrite/publicName/owner 가드 및 서버 최종 권한 유지. 그룹 탐색 때문에 기존 조회를 재실행하거나 다른 앱 데이터로 대체하지 않는다.

## 6. 배치 약속

- nav는 헤더 아래, 기존 account 섹션 위. 390/768/1150/1280 모두 1열 목록, 본문과 같은 좌우선. 본문 순서는 ST-1에서 유지하고 재배치는 후속 그룹 통합 때 결정한다.
- nav `id=settingsGroups`, aria-label=t(settings.groups.navigation). 행은 실제 a[href]이며 `data-setting-group=<groupId>`, 새 목록 행에 radius-card/1px var(--line)/surface 또는 surface2/ink/muted만 사용한다.
- 목록 행 좌우선을 `settingGroups:left,right`로 맞추고, 바깥 nav와 기존 본문은 `col:left; secs:right`에 연결한다. 개별 행 높이는 텍스트에 따라 늘어나며 min-height=44px. 긴 영·일 문구는 줄바꿈, 말줄임/nowrap 금지.
- 행 안 제목/설명 간 6px, 행 간 12px, nav와 본문 16px. 기존 설정 내부 6/12/16 검사 유지. 기존 pill은 일괄 사각화하지 않는다.
- 키보드 Tab→링크 Enter→목표 포커스, 명확한 focus-visible. 전환 효과는 reduced motion을 따른다. 처음 로드할 때 임의 포커스 없음(인식 해시가 있을 때만 이동).
- 후속 접힘 요약 행도 같은 토큰/정렬 원칙을 쓴다. 스크린샷은 기본/목표 이동/긴 문구/owner/다크를 포함하여 4폭 Q1~Q9로 판정한다.

## 7. 검증 수용 기준·가드와 단언

아래는 **향후 구현 승인 후 실행할 검사**이며 이번 세션 실행 결과가 아니다. settings.spec.js에 Registry 순수 검증을 함께 두어 파일 수를 지킨다. Node의 기존 .mts import 방식으로 검증 함수를 불러오고, 브라우저 DOM 검사와 별도로 원본 사전을 검사한다.

| ID | 실패 모드 / 프로덕션 경계 | 필수 단언 |
| --- | --- | --- |
| ST1-01 | Registry는 있지만 탐색에 연결 안 됨 | 역할별 nav 행 수·순서·세 언어 제목·href를 실제 DOM으로 확인, 각 링크 클릭 후 목표 포커스/스크롤 확인 |
| ST1-02 | metadata/JSX 누락 | guest/user/owner DOM render-key 집합을 독립 추출, 조건부 기대 집합과 양방향 비교. 입력에서 렌더 키 1개 제거/추가/중복 각각 정확한 오류 |
| ST1-03 | 중복/존재하지 않는 별칭·ID | 그룹/항목 ID 충돌, 정규 해시와 alias 충돌, 없는 target·render key, 누락 항목에 대해 오류 code/subject 확인 |
| ST1-04 | i18n 폴백이 누락 은폐 | 각 사전에서 제목 key 1개 제거·빈 값 입력 시 MISSING_I18N_KEY, 정상 입력 오류 0, 입력 불변 |
| ST1-05 | 초기 해시/해시 변경/뒤로 가기 실패 | account/credits/community/screen/langSec/nx/advanced/links/ops 및 실제 내부 대상, 새로고침·hashchange·같은 hash 재클릭·뒤로/앞으로에서 대상 표시/포커스 확인 |
| ST1-06 | URL로 권한 우회·지연 포커스 | guest community, user ops DOM 0, admin 요청 0. me 지연→owner로 확정 시 현재 해시만 처리. owner→user/A→B 뒤 이전 타깃 포커스 없음 |
| ST1-07 | 입력/저장/오디오 회귀 | nav 이동 전후 입력·체크/pressed 동일. nav 클릭의 mutation 요청 0. 기존 저장 성공/실패·롤백 단언 유지 |
| ST1-08 | 잘못된 해시가 크래시/선택자 실행 | 빈/알 수 없음/깨진 %/선택자 모양 해시는 오류 0·URL 유지·자동 저장 0·임의 포커스 없음 |
| ST1-09 | 배치·접근성 파손 | 4폭 G0~G8/A1, ko/en/ja, guest/user/paid/expired(grace와 실제 free 만료 구별)/owner, 다크·키보드·최하단 스크롤 |

실패 먼저: 새 nav/DOM 매칭 단언을 기준 main에서 실행해 대상 부재 Red를 기록한 다음 구현한다. 이후 Green·기존 회귀·스크린샷 검토를 구분해 기록한다. 순수 검증의 잘못된 입력 테스트는 검증 함수 자체를 호출해야 하며 테스트 안의 복제 검증기를 확인하지 않는다. 기존 skip을 확대하거나 준비 조건을 count>0 하나로 약화하지 않는다.

향후 표적 명령(시니어는 독립 판단에 필요한 1~2개만):

```powershell
npx playwright test test/e2e/layout/settings.spec.js -g 'ST1-0[1-4]'
```

향후 4단계 주니어 전체 검사:

```powershell
npm run build
npx playwright test test/e2e/layout/settings.spec.js test/e2e/layout/profile.spec.js test/e2e/i18n-lang.spec.js test/e2e/theme-footer.spec.js test/e2e/ops.spec.js test/e2e/community.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/xss.spec.js test/e2e/layout/shell.spec.js
$env:LAYOUT_SHOTS='1'
npx playwright test test/e2e/layout/settings.spec.js
Remove-Item Env:LAYOUT_SHOTS
npm test
git diff --check
```

ST1-09의 언어/만료 fixture는 같은 settings.spec.js에서 확장한다. Node 22 이상 및 기존 Playwright 브라우저/SPA 산출물이 전제다. DB/백엔드 변경이 없어 Gradle 전체 검사는 ST-1 필수에서 제외하며 미실행으로 명시한다. 운영/OAuth/실제 결제·Drive 전송은 mock E2E 통과로 대체하지 않는다.

## 8. 검토·승인 대상

- ST 3-Step/담당자 판정, ST-1 신규 Registry export/필드·오류 code·그룹 명칭·탐색 동작·7개 변경 파일·잠금 계약·배치·수용 기준을 함께 검토한다.
- ST-1의 중간 상태는 펼친 본문+그룹 탐색이다. 최종 기본 접힘/전체 AC-9·AC-10 완료는 ST-3까지 필요하다.
- 구현 및 Git 게시는 아직 미승인이다. 승인 시 시니어 핵심 구현/표적 검증 범위와 주니어 회귀·게시 범위를 구별한다. 미확정 서버/DB 정책은 없으며 제품·단계 제안 전체가 검토 대기다.
