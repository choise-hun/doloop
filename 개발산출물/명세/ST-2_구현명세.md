# ST-2 구현명세 — 계정·서비스 설정 접힘

> 2026-11-10 / 명세 작성·정적 검토 완료, 사용자 검토·구현 승인 대기. 기준 main `b8849a793eeaeeb66b1b68f97cbaf893bcbba92a`([PR #153](https://github.com/choise-hun/doloop/pull/153) 실제 merged=true). 아래 검증은 향후 계획이며 실행 결과가 아니다.

## 1. 목표·범위·담당

- 기준: [REQ-5·AC-9/10](../요구사항_명세_초안.md), [ST 진행 §3·§5](../진행_ST.md), [ST-1 명세](ST-1_구현명세.md), [문서 운영 §4·§6](../../docs/문서_운영.md), [협업 §1.2](../협업_시니어주니어.md).
- 사용자 결과: 계정·저장소 / 구독·크레딧 / 공개·연동 요약 행을 열어 기존 설정을 확인·저장한다. 기본 접힘, 기존 해시 자동 열기, 닫기·재열기 중 입력·요청·결과 보존을 완성한다.
- ST는 기존 3-Step을 유지한다. ST-2는 **[시니어] 핵심 구현**, 템플릿 §0 적용을 제안한다. 공용 DOM/셀렉터, 비동기 저장·낙관적 롤백, 지연 해시 재시도에 함께 영향이 있어 주니어 기계적 구현으로 배정하지 않는다. 시니어는 핵심+표적 검사 1~2개, 주니어 §4는 전체 회귀·화면 검토·결과 정리 및 별도 승인된 Git 게시를 맡는다.
- ST-3의 화면·언어/고급·백업·데이터/운영자 접힘 통합, 본문 순서 재배치, 서버·DB·공개 시그니처·Registry 변경은 제외한다. 기존 nav와 본문 순서는 유지한다(account → nx → credits → community → screen → langSec → advanced → ops).
- 이번 승인: **로컬 명세·진행 문서만**. 구현·테스트 실행·커밋·push·PR·머지·배포는 승인되지 않았다. ST-1의 게시 승인을 ST-2로 승계하지 않는다.

### 1.1 향후 구현 허용 파일 제안

| 파일 | 변경 목적 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx` | 3개 section 내부 접힘과 canonical 해시 열기. 기존 상태·API 핸들러 유지 |
| `frontend/src/pages/SettingsPage.module.css` | ST-2에 한정된 요약 행·본문 간격·포커스 스타일 |
| `test/e2e/layout/settings.spec.js` | ST2 실패 우선 검사, 준비와 열기 분리, 기존 ST1/간격/펼친 상태 검사 보존 |
| `test/e2e/layout/profile.spec.js` | 설정 도착 후 기본 접힘 확인·명시적으로 열기·기존 PF 계약 검증 |
| `test/e2e/community.spec.js` | 기존 공유 스위치 검사 전에 해당 그룹 열기 |
| `test/e2e/avf3-profile-callers.spec.js` | Drive/공유 조작 전에 열기. 기존 경합 단언 유지 |
| `test/e2e/xss.spec.js` | E6 계정 그룹 열기 후 기존 안전 출력 검사 |

제품/테스트 **7파일, 핵심 로직 1파일**, 예상 350~650 변경줄(추가+삭제), 상한 700. CSS 35~60, Page 50~100, settings 검사·준비 변경 220~340, 나머지 4 spec 45~95줄을 예상하며 실제 diff를 집계한다. 줄 수를 채우거나 필수 검사를 빼지 않는다. 문서는 본 명세·진행, 향후 `개발산출물/결과/ST-2.md`를 별도 집계한다. 7파일/700줄을 넘으면 구현 전에 범위 재검토한다. 새 사전 키·support 파일·공용 컴포넌트 추출은 현재 목록에 없다.

## 2. 직접 확인한 코드와 영향

아래 경로의 `frontend/src/` 및 `test/e2e/` 접두사는 그대로 적용한다. 행 번호는 위 기준 커밋이다.

| 근거 | 관찰·설계 연결 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx:39,50,95,112,133` | 단일 Page가 계정/Drive/공유 상태·요청 소유. 접힘을 요청 생명주기에 연결하지 않는다 |
| `frontend/src/pages/SettingsPage.tsx:170,186,191,205,221,232,234` | 등록된 해시만 해석, 조상 details 열기, 2 RAF 뒤 세대·uid·owner·연결·열림/가시성 검사. 완료한 hash의 재탐색 방지와 미해결 credit 재시도 보존 |
| `frontend/src/pages/SettingsPage.tsx:264,320,340` | uid 변경 사용자 필드 정리와 크레딧 조회는 접힘과 독립 |
| `frontend/src/pages/SettingsPage.tsx:432,604,654,725,773` | 고정 section/제목/내부 계정 삭제 details/메시지/공유 조건부 렌더를 보존할 경계 |
| `frontend/src/pages/SettingsPage.module.css:25,35,64,68,96,304` | 기존 section padding 24/gap 16, 제목, 빈 메시지 숨김, stack/panel/nav. OpsPanel도 이 모듈을 쓰므로 ST-2 전용 클래스만 추가 |
| `frontend/src/lib/settingsRegistry.mts:17,21,25,43,88` | account/credits/community의 targetId와 aliases, 독립 렌더 계약 검증. 새 ID를 추가하지 않아 변경 불필요 |
| `frontend/src/lib/auth.ts:312,342,351,355,367` | signOut 세대 증가, PATCH 직렬화, 응답 uid·세대 검사. 접힘 때문에 큐를 초기화하지 않는다 |
| `frontend/src/lib/drive.ts:325,336,344` | 기존 Drive 활성/해제/이관 진입점을 그대로 호출 |
| `test/e2e/layout/settings.spec.js:113,134,204,253,269,305,362,588,617,704` | guest 준비 waitFor는 가시성을 요구. 기본 화면·펼친 검사·ST1 잠금·지연 credit/disabled target의 서로 다른 목적을 구분 |
| `test/e2e/layout/profile.spec.js:178,192,510` | PF1-04의 기본 본문 가시성 가정과 설정→프로필 링크 클릭에 명시적인 열기 필요 |
| `test/e2e/community.spec.js:410,447`; `test/e2e/avf3-profile-callers.spec.js:6,14,31,43,52,69,78` | 공유/Drive 클릭은 접힌 본문에서 실행 불가. 기존 실패·A→B·동시 저장 검사의 준비만 조정 |
| `test/e2e/xss.spec.js:345`; `test/e2e/ops.spec.js:29`; `test/e2e/i18n-lang.spec.js:145,219` | XSS E6은 계정 가시성 검사. ops/i18n 준비는 숨겨져도 가능한 toHaveText이므로 파일 변경 불필요, 회귀로 확인 |
| `test/e2e/support/layout-check.js:408,415,458` | ready 뒤 곧바로 기본 레이아웃 캡처. ready에서 일괄 열면 기본 접힘 검사가 사라짐 |

### 2.1 기존 계약 전수 잠금(이번 3개 section)

- section은 `section.set-sec` + `styles.setSec`, `data-align-group="col: left; secs: right"`, 기존 `data-setting-render-key` 및 `aria-labelledby`를 유지한다. 각 section ID `account`/`credits`/`community`, 제목 h2 ID `hAccount`/`hCredits`/`hCommunity`, 제목 번역 키 `settings.secAccount`/`settings.secCredits`/`community.settingsTitle`을 바꾸지 않는다.
- account 하위 ID: `hAccount, accDesc, accGuest, btnLogin, btnLoginBlank, accUser, accEmail, accName, accQuota, quotaText, quotaBar, driveStoragePanel, driveProviderText, driveStatusMsg, driveConflictNotice, btnDriveEnable, btnDriveDisable, btnDriveMigrate, btnLogout, delConfirm, btnDeleteAcc, accMsg`. 별도 이름 없는 기존 계정 삭제 details/summary와 privacy 링크도 유지한다.
- credits 하위 ID: `hCredits, creditTier, creditMsg, creditTotal, creditBuckets, creditNext, creditExpire`. guest/free/paid/grace의 조건부 생성 규칙을 바꾸지 않는다.
- community 하위 ID: `hCommunity, settingsProfileLink, commAutosync, commPracticeLog, commProNotice, commNameRequiredNotice, commErrMsg`. guest에는 section 자체가 없다.
- `styles.row/stack/field/lab/quotaBar/panel/cardHead/badge/badgeOk/creditTotalLine/creditTotal/stackTight/detailsBody`, `commStyles.commSwitchRow/commRowInfo/switchBtn`, 전역 `pillBtn/ghostBtn/inpField/tl-bar/hint/msg/ok/err`와 `creditHead/commSw/commSw2` 배치 표식을 보존한다. 클래스 정의/핸들러를 일괄 정리하지 않는다.
- switch의 `role="switch"`, `aria-checked`, disabled 조건, `driveStatusMsg/driveConflictNotice/accMsg`의 `role="status"`, 조건부 `commErrMsg`의 `role="alert"`, progress max/value, input value/onChange, hidden 조건을 그대로 둔다. `settingsProfileLink`는 `profile.html#profileNames`, 새 창 로그인 링크는 `settings.html#account`, privacy 링크는 `privacy.html`을 유지한다.
- `SettingsPage(): React.ReactElement`, auth/drive/apiClient/Registry의 기존 export·함수 시그니처, API 경로·필드·상태 코드·권한·앱 격리는 변경하지 않는다. 공개 범위/저장 위치/프로필 편집 위치 변경 없음.

## 3. DOM·문구·접힘 계약

1. 기존 3개 section 안에 **직계 자식 details 1개**를 추가한다. `data-setting-disclosure="account|credits|community"`로 해당 details를 식별한다. details의 첫 자식은 네이티브 summary, 두 번째 자식은 기존 본문 전체를 담은 div다. 모든 기존 h2·컨트롤·메시지·privacy 링크는 이 본문 안에서 순서·ID·props를 유지한다. summary에는 span 한 개의 그룹 제목만 넣고 버튼/링크를 중첩하지 않는다. 새 id/해시/별칭/렌더 키는 만들지 않는다.
2. 해시 없는 최초 마운트의 3개 details는 닫힘. native uncontrolled open을 사용하고 같은 계정의 rerender에서 open을 강제로 재설정하지 않는다. React 조건부 mount, open에 따른 key 교체, details name을 이용한 상호 배타 접힘, local/sessionStorage 저장은 금지한다. 여러 그룹 동시 열기 가능.
3. summary 클릭·Enter·Space는 해당 그룹만 토글한다. 일반 열기/닫기는 URL·history·저장값·요청 수를 바꾸지 않는다. 네이티브 expanded 의미와 포커스 표시를 사용하고 수동 role/button/tabIndex/aria-expanded 복제는 하지 않는다. 닫힌 본문은 Tab 순서에서 제외되지만 DOM에는 남는다.
4. 계정 identity 변경(guest↔uid A↔uid B)은 **details.open만** 닫힘으로 초기화한다. Page/본문 key를 바꾸지 않는다. 같은 uid의 토큰 갱신·일반 `/me` 갱신·언어 변경은 닫힘 초기화 사유가 아니다. identity 초기화는 해당 전환의 기존 hash 탐색보다 먼저 수행하여 현재 허용 해시가 목표 그룹을 다시 열 수 있게 한다. 원래 사용자 필드 정리·요청 세대 관리는 그대로 따른다.
5. 내부 계정 삭제 details는 외부 그룹과 독립이다. 외부 그룹을 닫았다 열면 내부 open/입력을 그대로 유지한다. 해시가 내부 컨트롤이면 닫힌 조상을 바깥→안쪽 순서로 연다.

| 그룹/marker | summary 키 | ko / en / ja |
| --- | --- | --- |
| account | `settings.groups.accountStorage` | 계정·저장소 / Account & storage / アカウント・ストレージ |
| credits | `settings.groups.subscriptionCredits` | 구독·크레딧 / Subscription & credits / プラン・クレジット |
| community | `settings.groups.publicIntegration` | 공개·연동 / Sharing & connections / 公開・連携 |

원본 사전 `ko.mts:4` / `en.mts:6` / `ja.mts:6`의 기존 3키를 재사용한다. summary에 이메일·quota·tier·요청 성공/실패 요약을 복제하지 않는다. 본문 상태는 기존 문구/오류 표시를 유지한다.

### 3.1 해시 처리 순서와 포커스

- 초기 해시/hashchange/nav Enter·클릭/동일 해시 재클릭/뒤·앞 이동은 ST-1 resolve와 navigate 단일 경로를 재사용한다. querySelector에 URL을 넣지 않고 기존 getElementById와 Registry 허용 목록을 유지한다.
- canonical `#account/#credits/#community`는 대상이 section이라 기존 조상 검색만으로 새 직계 details를 찾을 수 없다. 해당 section의 **ST-2 marker가 있는 직계 details**를 먼저 열기 목록에 포함한다. 모든 section의 첫 details를 여는 일반화는 금지한다(계정 삭제나 기존 다른 패널 오작동 방지).
- 하위 별칭은 기존 target→조상 details 경로로 연다. 순서는 바깥→안쪽, 이미 열린 details는 다시 토글하지 않는다. 기존 고급/운영자 처리와 sequence/RAF 취소/세대·uid·owner·isConnected·최종 details.open·가시성 검사를 유지한다. native summary click을 사용한 기존 경로와 일관되게 처리한다.
- canonical 포커스는 기존 **section 자체** 유지. `#hAccount/#hCredits/#hCommunity`는 본문 h2, 활성 컨트롤은 해당 컨트롤, disabled 컨트롤은 기존 소속 section의 h2로 이동한다. 새 summary로 임의 대체하지 않는다. 스크롤은 기존 instant/start, focus preventScroll 계약 유지.
- 인식되지 않음/깨진 %/빈 해시는 자동 열기·임의 포커스·mutation을 유발하지 않는다. 이미 수동으로 연 그룹을 닫지도 않는다. guest의 `#community`는 그룹·공유 DOM·관련 mutation 0, user의 운영자 해시는 불허 상태 유지.
- 조건부 `#creditNext/#creditExpire`가 아직 없으면 pending을 유지해 기존 creditSummary 완료 시 최신 hash만 재시도한다. 그 전에 다른 hash/계정/경로로 이동했으면 이전 포커스·열기 금지. 이미 성공한 해시에서 사용자가 그룹을 닫은 뒤 일반 `/me`·credit 재렌더가 와도 다시 열지 않는다. 존재하지 않는 대상에 대한 새로운 대체 포커스/자동 refetch는 추가하지 않는다.

## 4. 상태·요청·실패 보존

| 상황 | 보존할 결과와 금지 동작 |
| --- | --- |
| 닫기→재열기 | 같은 DOM 노드 유지. delConfirm 입력, 내부 삭제 details.open, 공유 aria-checked, 메시지·오류·Drive 진행 내용 유지. 조회 재실행/저장/요청 취소 0 |
| 최초 데이터 대기 | 원래 effect가 닫힘과 독립적으로 실행. me/creditSummary 도착이 사용자의 open 선택을 덮지 않음. 전역 로딩/에러 UI를 새로 만들지 않음 |
| Drive 활성/해제 대기 | busyDrive와 disabled 보존. 닫힌 동안 성공/실패가 처리되고 재열면 기존 상태·메시지 표시. 재열기 때문에 중복 실행하지 않음 |
| Drive 이관 | 기존 confirm 취소 시 이관 시작 0. 시작 후 닫아도 기존 진행/완료/실패 처리 계속. 새 취소/재시도·계정 전환 보장을 추가하지 않음 |
| 공유 PATCH 대기 | 낙관적 checked·commBusyRef 보존. 동일 스위치 중복 요청 방지, 서로 다른 두 스위치 저장 직렬화 보존. 닫힘 상태의 성공은 서버 응답값으로 수렴, 실패는 prev 복구+기존 오류 |
| AbortError/이전 사용자 응답 | 기존 세대·uid 가드를 유지. 무효 응답으로 새 사용자 checked/메시지/포커스 변경 금지. 접힘 이벤트에서 authGeneration/요청 seq/queue를 변경하지 않음 |
| 계정 전환/로그아웃 | 기존 auth 상태 정리와 렌더 권한을 따름. A의 open 선택은 B에게 승계하지 않으며 현재 허용 hash만 다시 적용. 개인정보 초기화 전체를 이번 UI 변경이 검증했다고 주장하지 않음 |
| paid/grace/free 만료 | 기존 me tier·limits·credits 조건대로 표시. 닫힘은 권한 검사가 아니며 guest/community·owner 가드를 우회하지 않음 |
| 저장 실패 후 다시 열기 | 실패 문구/복구 상태가 보존됨. 자동 재전송/성공으로 변환/임의 fallback 없음. 재열기는 메시지를 지우지 않음 |

기존 API 잠금: `GET/PATCH/DELETE /api/v1/me`, `GET /api/v1/credits`와 기존 Drive 호출만 사용한다. 공유 PATCH 필드는 각각 `{shareAutosync:boolean}` / `{sharePracticeLog:boolean}`, Drive 활성은 `{storageProvider:'drive',driveFolderId:string}`, 해제는 `{storageProvider:'supabase'}`, 탈퇴는 기존 `{confirmText:string}`이다. 응답 Me 필드 `id,email,displayName,role,storageProvider,driveFolderId,takeUsedBytes,takeQuotaBytes,tier,billingTier,limits,credits,shareAutosync,sharePracticeLog,publicName` 및 Credits `monthly,purchased,total,monthlyGrant,nextGrantAt,monthlyExpiresAt`의 의미를 바꾸지 않는다. 참조: `auth.ts:351,372`, `drive.ts:325,336`, `apiClient.ts:184`, `src/main/kotlin/ulevelp/service/ProfileService.kt:35,223,235,264`, `CreditService.kt:70`.

오류는 `communityErrorKey`(`frontend/src/lib/community.mts:170`)의 `err.code → err.data.code`, `err.status → err.data.status`, `err.data.detail → err.detail` 우선순위를 그대로 사용한다. `TIER_UPGRADE_REQUIRED`→`community.err.upgrade`, `PUBLIC_NAME_REQUIRED`→`community.err.nameRequired`, 기타 500/네트워크→`community.err.generic`, AbortError/무효 세대는 기존 폐기 규칙이다. 서버의 무료 켜기 403·이름 없는 기록공유 켜기 409 계약을 바꾸지 않는다. Drive/계정 오류는 기존 message와 기존 번역 fallback을 그대로 쓰며 새 오류 code/status를 정의하지 않는다.

**기존 코드 한계:** `SettingsPage.tsx:557` 이관 및 `:588,629` 계정 동작은 Drive 활성/해제·공유 핸들러와 동일한 형태의 세대 가드가 아니다. 이번 정적 조사만으로 전체 A↔B 안전성을 확정하지 않는다. 새 접힘 가드와 기존 업무 핸들러 개선을 섞지 않는다. 향후 검증에서 개인정보 유출/기존 결함을 재현하면 기준 커밋 재현과 영향·별도 수정 승인 범위를 기록하고 미해결을 완료로 숨기지 않는다.

## 5. 배치 약속

| 상태·폭 | 열·맞춤·간격 |
| --- | --- |
| guest/user/paid/grace/실제 free 만료/owner × 390·768·1150·1280 | nav 및 본문 모두 1열. 기존 section 외곽 `col:left; secs:right` 유지. guest에는 account/credits 요약만, 로그인에는 community 추가. owner ops는 기존 상태 |
| ST-2 닫힌 행 | 기존 section 테두리(surface/line/radius-card)를 사용, ST-2 전용 클래스에서 padding 12px 16px. summary min-height 44px, width 100%, box-sizing border-box, 긴 제목 줄바꿈·높이 자동 확장. 추가 이중 카드 테두리 없음 |
| ST-2 열린 행 | 요약 아래 본문까지 16px, 본문 flex column/gap 16px. 기존 panel 12px/라벨 6px 및 creditHead/commSw/commSw2 유지. summary·본문 좌우선을 그룹별 `accountDisclosure:left,right` / `creditsDisclosure:left,right` / `communityDisclosure:left,right`로 연결 |
| 키보드·다크·최하단 | summary focus-visible 2px ink/offset 2px, 네이티브 marker 유지. radius-card·surface/surface2/ink/muted/line 토큰 사용. 기존 pill·nav 16px 경계와 AppShell 끝 스크롤 여백 유지 |

details 자체에 display:flex/grid를 지정해 닫힌 본문을 드러내지 않는다. 전용 클래스는 ST-2 section/disclosure/summary/body에만 적용하고 공용 `.setSec/.panel/.stack` 정의를 바꾸지 않는다. ST-2 summary 열림 여부는 네이티브 details가 소유하며 전환 애니메이션은 추가하지 않는다. [정렬 규격 §1·§3·§5·§6](../프론트_정렬규격.md)의 G0~G8/A1·4폭 Q1~Q9를 적용한다.

## 6. 테스트 설계·수용 기준

기존 `settingsReady`는 **attached/인증 데이터 준비만** 기다리도록 바꾼다. guest의 accGuest waitFor는 attached로 분리하고 `/me`·조건부 크레딧 데이터는 기존 text/poll 검사로 준비를 확인한다. 기본 layoutSuite ready에서는 새 3그룹을 열지 않는다. 기존 owner fixture의 운영자 준비는 유지한다. 별도 펼친 본문 검사에서는 닫힌 그룹의 summary만 클릭해 open을 확인한다. 새 제품 동작 검사는 `.open=true` 주입으로 대체하지 않는다. 기존 필·간격 검사는 가시성 대상이 사라져 빈 배열 통과하지 않도록 기존 컨트롤/패널의 실제 표시·검사 개수도 확인한다.

| ID | 준비·행동 | 필수 관측 / 잡을 실패 |
| --- | --- | --- |
| ST2-01 | 해시 없는 guest/user/owner, summary Enter·Space·클릭 | 렌더 가능한 3그룹 closed, 본문 attached+hidden, guest community 0. 토글 후 visible, 복수 open 가능, 닫힌 본문 Tab 제외, URL 동일·mutation 0. 기본 펼침/아코디언/가짜 토글 탐지 |
| ST2-02 | 각 canonical 초기 진입/nav/hashchange/같은 hash/뒤·앞; 내부 h2·활성·disabled·delConfirm 별칭 | 정확한 외부/내부 details open과 section/컨트롤/기존 h2 포커스, 실제 뷰포트 표시. 다른 수동 open 보존. canonical을 열지 못함/disabled 포커스 변경 탐지 |
| ST2-03 | delConfirm에 임의 문구 입력, 내부 삭제 details 열기, 외부 닫기→재열기 | 동일 DOM 노드·입력·내부 open 유지. DELETE/저장/추가 조회 0. 제출은 하지 않음. 조건부 mount/재초기화 탐지 |
| ST2-04 | 공유 PATCH를 제어 가능한 Promise/route로 지연, 닫기·재열기 전후 success/500/403/409·재시도 | 요청 payload/총수 1, 낙관적 값→성공 응답/실패 prev+기존 오류. 같은 hash 성공 후에는 닫힘/포커스를 /me가 되돌리지 않음. 중복 저장·롤백 손실·ST1 P1 회귀 탐지 |
| ST2-05 | Drive enable/disable 지연 success/failure, 닫은 중 완료 후 열기; 이관 진행 mock | busy/disabled·완료/실패/진행 텍스트·호출수 유지. 취소 confirm 호출 0. 접힘에 따른 작업 취소/중복/결과 초기화 탐지. 실제 Drive/탈퇴 요청 금지 |
| ST2-06 | #creditNext/#creditExpire 지연 중 hash 변경·로그아웃·A→B·경로 이탈; 같은 uid 갱신 | 최신 허용 해시만 열기/포커스. 이전 DOM/응답 포커스 0, 이전 사용자 메시지 없음(기존 AVF3 표적). identity 새 open 초기화, 같은 uid 저장/언어 갱신은 수동 open 보존. RAF·pending/identity 경합 탐지 |
| ST2-07 | guest/free/pro/grace/실제 free 만료/paid 이름 없음에서 열기 | Registry 렌더 키/고정·조건부 ID와 원래 본문 문구·disabled·profile href 유지. 불허 owner DOM/admin 요청 0. 숨겨진 본문을 삭제로 취급하거나 guest에 공유 노출하는 오류 탐지 |
| ST2-08 | 기본 closed/3그룹 open/오류 상태를 4폭·3언어·다크에서 캡처 | G0~G8/A1 실패 0, 경고 사유 기록, Q1~Q9 × 0, 줄바꿈/요약 44px/열린 본문 검사 대상 양수. 최하단 링크가 고정 탭 아래로 가려지지 않음 |

- ST2-01~03에서 **구현 전 기준 코드의 의도한 Red**를 먼저 기록한다. 이후 Green/기존 회귀/스크린샷은 구별한다. 핵심 시니어 표적은 ST2-01~03을 하나의 사용자 여정 검사로 묶은 1개와 ST2-04/06의 저장·지연 해시 경합 검사 1개를 권장한다. 주니어가 위 표의 나머지 분기를 완성·실행한다.
- ST1 테스트는 삭제/skip하지 않는다. 접힘 변경과 직접 충돌하는 본문 준비·열기 절차만 명시하고 기존 nav·ID·제목·hash·포커스·mutation/권한·P1/P2 단언을 유지한다. ST1 Registry 오류표를 새 기대값으로 축소하지 않는다.
- PF1-04는 도착 직후 account/community body hidden을 먼저 확인한 다음 두 summary를 열어 기존 전수 visible 단언을 실행한다. `profile.spec.js:510`의 프로필 링크도 공유 그룹을 연 뒤 클릭한다. community/AVF3/XSS E6도 사용자 조작 전 해당 summary를 연다. 숨김 본문의 toBeEnabled/toHaveText가 가능해도 click 준비를 생략하지 않는다.
- `ops.spec.js:34`·`i18n-lang.spec.js:147,222`의 toHaveText는 가시성 요구가 없고 `screen/langSec`는 펼침 유지라 현재 변경 불필요. 회귀 실패 시 원인을 먼저 분류하며 8번째 파일을 몰래 추가하지 않는다.
- 가드↔단언: DOM mount 유지→03, 네이티브 토글·직계 대상 열기→01/02, 기존 generation/uid/sequence/RAF/pending→04/06, auth 직렬 큐/commBusyRef/롤백→04+AVF3, 조건부 렌더/권한→07, CSS 범위·가시성→08. 실제 변이 검사는 이번 명세에서 수행하지 않는다.

### 6.1 향후 실행 명령·완료 체크

아래 명령은 저장소 루트 PowerShell 기준이며 구현 승인 후 담당자가 실행한다.

```powershell
npm run build
npx playwright test test/e2e/layout/settings.spec.js -g 'ST2-'
npx playwright test test/e2e/layout/settings.spec.js test/e2e/layout/profile.spec.js test/e2e/community.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/xss.spec.js test/e2e/ops.spec.js test/e2e/i18n-lang.spec.js test/e2e/theme-footer.spec.js test/e2e/layout/shell.spec.js
$env:LAYOUT_SHOTS='1'
npx playwright test test/e2e/layout/settings.spec.js
Remove-Item Env:LAYOUT_SHOTS
npm test
git diff --check
git status --short
```

- [ ] 7파일 이하·700변경줄 이하, 허용 파일 밖 변경 0(실제 diff 합계 기록, 문서는 별도 집계).
- [ ] 위 build/표적/관련 회귀/Node 검사 실제 exit·pass/fail/skip/flaky를 결과 ST-2에 기록. 환경 실패·미실행을 통과로 승격하지 않음.
- [ ] LAYOUT_SHOTS 기본 캡처와 ST2-08의 열린/오류 캡처를 구별하고 모델이 PNG를 열어 4폭 Q1~Q9 판정. 닫힌 화면 캡처만으로 본문 품질을 판정하지 않음.
- [ ] UTF-8 BOM 없음·LF·상대 링크·git diff --check·최종 status 확인. 테스트 skip/단언 완화/임의 sleep/공용 규격 완화 없음.
- [ ] 실 OAuth/결제/Drive 전송·DB·실 A↔B 접근 통합·운영·Gradle은 별도 실행 범위/미실행으로 명시. mock을 실통합 검증으로 표현하지 않음.

## 7. 검토 관문·승인 경계

- 정적 검토: canonical section은 조상 탐색 밖이라는 차이, 기본 캡처와 펼친 캡처 분리, 본문 조건부 mount 금지, 같은 uid 갱신과 identity 교체 차이, 성공 hash와 pending hash의 차이를 명세·수용 기준에 각각 연결했다. 미확정 API/DB 정책 없음.
- 사용자 검토 대상은 3그룹 DOM·요약 문구 재사용·상태 보존·7파일·가드/검사와 **시니어 핵심 / 주니어 전체 회귀 배정**이다. 구현 승인 전 문서만 유지한다. 승인 밖 서버/인증/Drive 핸들러 수정, 새 공개 시그니처/경로·export 변경은 별도 결정 관문이다.
- ST-2 완료는 앞 3그룹에 한정된다. `screen/langSec/nx/advanced/ops` 그룹 통합은 ST-3에 남으므로 최종 AC-9/AC-10 전체 완료로 보고하지 않는다. 완료한 ST-1 검증을 이번 명세 세션에서 반복하지 않았다.
- 다음 실행·재개·승인 범위는 [ST 진행 §5·§11](../진행_ST.md)에 둔다. 이번 결과는 명세 준비 완료이며 구현/PR 완료가 아니다.
