# ST-3 구현명세 — 환경·데이터 설정 접힘 완성

> 2026-11-10 / 사용자 로컬 구현 승인, 시니어 핵심 구현·표적 ST3-01/02 완료. 기준 main=`63a0b0121d58b9a2c14eb37a645b808e24433b4d` (PR #154 merged=true). 실제 실행·미검증·주니어 인계는 진행 §16. 아래 전수 테스트·화면 검토 계획 전체의 통과 기록은 아니다.

## 1. 목표·범위·담당

- 기준: [계획 #10 ST](../../계획/상용_서비스_계획.md), [REQ-5·AC-9/10](../요구사항_명세_초안.md), [ST 진행](../진행_ST.md), [ST-2 결과](../결과/ST-2.md), [문서 운영 §4·§6](../../docs/문서_운영.md), [협업 §1.2](../협업_시니어주니어.md), [템플릿 §0·§1·§4](../프롬프트_템플릿_4단계.md).
- 사용자 결과: 화면·언어 및 고급·백업·데이터 관리도 **그룹당 하나의 요약 행**에서 열고 설정한다. 운영자는 기존 접힘을 동일 그룹 체계에 연결한다. 상세를 닫아도 입력·선택·저장 요청·결과를 보존하며 최종 AC-9/10을 판정한다.
- ST는 기존 3-Step 유지. ST-3 **[시니어] 핵심 구현 / [주니어] §4 전체 회귀·PNG 검토·결과 정리** 배정 제안. DOM 재배치·공유 CSS·언어 직렬화·운영자 지연 로딩을 함께 다루므로 협업 §1.2의 질문 ①②③ 모두 예다. 시니어는 실패 우선 표적 1~2개와 핵심 구현까지만 맡는다.
- 이번 승인: 사용자 “ST-3 핵심 구현 및 검증 인계”에 따라 §1.1의 7파일 로컬 핵심 구현·표적 검사1~2개·diff 검토·인계 기록. 전체 회귀·화면 검토는 주니어 담당. 커밋·push·PR·CI·머지·배포 제외. 과거 ST-2 게시 승인을 ST-3에 승계하지 않는다.
- DB/API 경로·필드·상태 코드·함수 시그니처·export·파일 경로 변경 없음. `SettingsPage(): React.ReactElement`, `OpsPanel(): React.ReactElement`, default export, `OpsFolders({ open, onForbidden })` 유지. 새 props·공용 컴포넌트 추출 없음.

### 1.1 구현 승인 시 제안할 파일

| 파일 | 수정 내용 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx` | 두 그룹의 단일 접힘, 백업 위치 이동, 기존 고급 내부 접힘 전환, 해시·uid 초기화, OpsPanel identity key |
| `frontend/src/pages/SettingsPage.module.css` | 기존 service 계열 재사용, 그룹 내부 section의 무테두리·무패딩 수직 배치 클래스 |
| `frontend/src/components/ops/OpsPanel.tsx` | 기존 opsDetails에 공통 marker·요약 행·본문 스타일 연결. open/onToggle와 조회 생명주기 유지 |
| `test/e2e/layout/settings.spec.js` | ST3 표적/전수, ST1·ST2의 바뀐 배치·전체 marker 수 정합, closed/열린/오류 화면 검증 |
| `test/e2e/i18n-lang.spec.js` | 언어 조작 전 그룹 열기, 재방문 초기 closed 확인, 실제 펼친 버튼 정렬과 언어 직렬화 회귀 |
| `test/e2e/theme-footer.spec.js` | 닫힌 상태 footer 동기화 후 그룹 열기·화면 버튼 역방향 동기화 |
| `test/e2e/ops.spec.js` | 기본 접힘·지연 조회·재열기·권한·identity 전환 회귀 |

제품/테스트 **7파일, 핵심 로직 2파일**, 예상 총 450~650 변경줄(추가+삭제), 상한 700. Page의 백업 블록 이동은 삭제+추가 모두 집계한다. 문서는 본 명세·진행, 향후 결과/ST-3.md를 별도 집계한다. Registry·3개 사전·OpsFolders·mock/support·서버·기존 XSS spec은 읽기/실행 대상이며 수정 목록에 없다. 파일/줄 상한 초과 또는 목록 밖 수정 필요 시 근거를 기록하고 범위를 재검토한다. 검사를 빼거나 코드 줄을 압축해 맞추지 않는다.

## 2. 직접 확인한 전제와 근거

행 번호는 기준 커밋. 아래의 경로는 저장소 루트 기준이다.

| 실제 근거 | 관찰 및 설계 연결 |
| --- | --- |
| `frontend/src/pages/SettingsPage.tsx:155` | advOpen이 일부 초기 해시만 검사하며 기존 내부 details를 제어. 이 상태 소유자를 제거하고 공통 그룹 접힘 하나로 통합 |
| `frontend/src/pages/SettingsPage.tsx:160,172,178,246` | 테마 이벤트 구독, uid별 앞 3그룹 닫힘, 등록 해시/조상 details·2RAF 가드, 조건부 크레딧 재시도. 확장하되 경합 방어 유지 |
| `frontend/src/pages/SettingsPage.tsx:250,266` | 언어 로컬 즉시 반영 + pendingLocaleRef 마지막 값/세대 검사 + 직렬 PATCH. 접힘이 큐를 재생성하거나 취소하면 안 됨 |
| `frontend/src/pages/SettingsPage.tsx:276,332,354` | 사용자 필드 초기화·초기 조회는 페이지/인증 소유. 접힘에 따른 조건부 mount·effect 이전 금지 |
| `frontend/src/pages/SettingsPage.tsx:680,701,868,896,916,1278,1480` | 백업이 계정과 크레딧 사이, 화면/언어가 별도 section, 고급은 기존 details, 운영자는 uid/owner 일치 시만 mount |
| `frontend/src/pages/SettingsPage.module.css:25,35,39,44,62,326,331` | 카드 토큰·service summary 44px·본문 16px, 기존 advanced/advBody는 OpsPanel도 사용. 기존 클래스 전역 재정의 금지 |
| `frontend/src/lib/settingsRegistry.mts:17,29,33,38,43,90` | 6그룹·8렌더 키, 별칭·가용성·dynamicHost, 순수 검증/해시 해석. 구조는 이미 최종 그룹을 지원하며 메타데이터 수정 불필요 |
| `frontend/src/components/ops/OpsPanel.tsx:26,110,111,214` | 기존 open/onToggle가 유일한 운영자 접힘 소유자, OpsFolders에 open 전달. 새 외부 details를 덧씌우지 않음 |
| `frontend/src/components/ops/OpsFolders.tsx:49,54,77` | open 전 요청 0, 첫 열기 loaded=true, 실패 시 다음 열기 재시도. 닫기 중 응답을 받는 기존 동작 유지 |
| `frontend/src/lib/apiClient.ts:1062,1097,1107,1400` | 백업 blob/filename, ZIP preview/confirm, 프로필 PATCH 경계. 데이터 계약 변경 없이 기존 handler 이동 |
| `test/e2e/layout/settings.spec.js:114,134,141,276,514,782,805,868` | 준비/열기 분리, ST2 전체 marker 수와 screen 이동 후 0개 열림 가정, 고급 내부 summary, ST1 독립 ID·DOM 순서 단언이 영향받음 |
| `test/e2e/i18n-lang.spec.js:110,219,312`; `test/e2e/theme-footer.spec.js:31` | 언어 버튼 직접 클릭·4버튼 실측, 화면 테마 직접 클릭이 있어 사전 열기가 필수 |
| `test/e2e/ops.spec.js:48,61`; `test/e2e/xss.spec.js:412,494` | 운영자 기본 closed/403, 기존 advanced 해시를 통한 업로드·안전 렌더 소비. 그대로 회귀 실행 |

ST-2 결과는 이전 실행 증거다. `d9cad50` 기준 CI 기록을 PR 최종 head=`c96b7d8`의 검증으로 확대하지 않는다. 이번에는 PR 머지/현재 코드를 확인했으며 최신 CI·리뷰 재검증은 범위 밖이다. 기존 인수인계와 계획의 상태 시차는 진행 §15에서 현재 사실과 구별한다.

## 3. DOM·접힘·배치 결정

| 결정 | 확정할 동작 |
| --- | --- |
| D1 그룹 순서 | 제목/nav → account → credits → 로그인 시 community → appearanceLanguage → advancedData → owner 시 operations. `nx`를 고급·백업 그룹의 첫 항목으로 이동한다 |
| D2 화면·언어 | 카드용 div 안에 details `data-setting-disclosure="appearanceLanguage"`, 첫 자식 summary, 둘째 자식 div 본문. 본문에 기존 `section#screen` 다음 `section#langSec` 유지 |
| D3 고급·백업 | 카드용 div 안에 details `data-setting-disclosure="advancedData"`, 첫 자식 summary, 둘째 자식 div 본문. 본문에 기존 `section#nx` 다음 `section#advanced` 유지 |
| D4 기존 고급 접힘 | `#advNotion`은 `section#advanced` 내부의 **일반 div**로 전환하여 ID·자손 소속을 유지. `#hAdvanced`는 summary에서 h2로 전환하고 기존 `settings.advSummary` 문구 유지. advOpen/setAdvOpen 및 고급 전용 자동열기 분기 제거. 이중 접힘 없음 |
| D5 기존 운영자 | `section#ops > details#opsDetails`를 그대로 유일한 접힘으로 사용하고 marker 값 `operations` 추가. `summary#hOps`의 기존 문구·제어 open/onToggle 유지. 신규 운영자 바깥 details 없음 |
| D6 기본 상태 | hash 없는 최초 렌더는 guest 4 / user·paid·expired 5 / owner 6개 외부 그룹 모두 닫힘. community/ops 비허용 시 DOM 자체 없음. 여러 그룹 동시 열기, local/sessionStorage에 open 저장 없음 |
| D7 mount 보존 | 외부 details의 자식은 닫혀도 mount. conditional render·key=open·접힘에 따른 요청 effect 금지. 기존 계정 삭제 내부 details만 별도 토글로 보존 |
| D8 identity | uid 변경 시 기존 앞 3그룹과 새 두 그룹을 hash 처리 전에 닫음. 동일 uid의 언어/테마/토큰·me 갱신은 수동 open 보존. `<OpsPanel key={activeUid} />`로 owner A→owner B에서도 기존 운영자 폼·권한 오류·loaded 상태를 새 사용자에게 재사용하지 않음 |
| D9 표식 | 기존 marker `account/credits/community` 유지, 새 marker는 `appearanceLanguage/advancedData/operations`. 그룹 wrapper에는 `data-setting-render-key`나 새 ID를 추가하지 않음. Registry 렌더 키는 기존 8개만 유지 |

### 3.1 유지할 DOM·Registry·문구

- 모든 기존 ID·하위 ID·titleKey·aliases·availability·kind는 `settingsRegistry.mts:17~41` 원문 전수와 `settings.spec.js:805`의 독립 `ST1_RENDERED` 전수를 유지한다. 본 명세에서는 코드 원문을 기준표로 지정하며 구현 전후 리터럴 ID 집합/조건부 ID를 대조한다. Registry에서 복사한 기대 목록으로 검증을 대체하지 않는다.
- 영향 항목 전수: screen=`screen,hScreen`; language=`langSec,hLang,langDesc,langSelect`; backup=`nx,hNx,chkExportAudio,btnExportZip,nxMsg`; ops host=`ops,opsDetails,hOps,opsCreator,opsEmail,opsSearch,opsMsg`. 동적 운영자 하위 폼 ID는 기존 OpsPanel/OpsFolders 소속을 유지한다.
- advanced target=`advanced`, 별칭 전수: `advNotion,hAdvanced,btnNotionTemplate,notion,notionKeyStatus,ntnGuide,ntnToken,ntnSongsDb,ntnSessionsDb,ntnNotesDb,btnSaveNotionKey,btnCheckNotionKey,btnDelNotionKey,ntnKeyMsg,notionSyncPanel,syncStatusText,syncErrorText,btnSyncEnable,btnSyncDisable,btnSyncPull,btnSyncPush,syncMsg,inpImportZip,btnPreviewZip,nxPreviewBox,nxPreviewSummary,nxPreviewList,btnConfirmZip,btnCancelZip,links,hLinks,nlPractice,nlNotes,nlSave,nlMsg`. 기존 기능 동결을 유지하며 서비스 연결·운영 요청은 이번 명세 작업에서 수행하지 않는다.
- 기존 `aria-labelledby`, 입력 label/for, role=status/alert/group, aria-pressed, disabled/hidden 조건, 버튼 type, `data-theme`, `data-lang`, file accept, CSS 전역 클래스 `set-sec/seg-pill/seg-btn/ghostBtn/pillBtn/hint/msg` 유지. summary 내 링크·버튼 중첩 없음. 네이티브 summary 클릭/Enter/Space 사용, 임의 aria-expanded 이중 제어 없음.
- 내부 section은 `.set-sec`와 ID/aria/render-key를 유지하되 `.setSec` 카드 클래스 대신 새 `.groupItem`(flex column, gap 16px, min-width 0)을 적용한다. 새 wrapper에 `.setSec .serviceSection`, details/summary/body에 기존 service 계열 적용. 내부 section의 전체 카드 `col/ secs` 정렬 표식은 제거하고 outer wrapper에만 둔다. 기존 필/체크박스/행/패널 클래스 유지.
- 운영자는 section에 serviceSection, 기존 details/summary/body에 service 계열을 연결한다. `.advanced > summary`의 17px와 기존 폼 간격은 유지하며 다른 소비자 CSS를 바꾸지 않는다.

| 요약 행 기존 키 | ko | en | ja |
| --- | --- | --- | --- |
| `settings.groups.appearanceLanguage` | 화면·언어 | Appearance & language | 表示・言語 |
| `settings.groups.advancedData` | 고급·백업·데이터 관리 | Advanced, backup & data | 詳細・バックアップ・データ管理 |

사전 근거: `frontend/src/lib/i18n/ko.mts:7~9`, `en.mts:9~11`, `ja.mts:9~11`. 새 키 없음. 운영자 nav는 기존 번역키, `#hOps`는 기존 한국어 고정 문구 `운영 (owner 전용)` 유지(기존 ops 번역 예외). 일반 사용자 영어·일본어 화면에 한국어 잔존을 허용하는 예외로 확대하지 않는다.

### 3.2 배치 약속

| 상태·폭 | 열/정렬/간격·확인 대상 |
| --- | --- |
| 기본 closed, guest/user/paid/expired/owner × 390·768·1150·1280 | 모든 폭 1열, 그룹 순서 D1. outer 카드 `data-align-group="col: left; secs: right"`, 기존 nav→account 16px 유지. 상세 본문 비가시·Tab 제외 |
| 두 새 그룹 열린 상태, 4폭 | summary와 본문에 각각 `appearanceDisclosure:left,right`, `advancedDisclosure:left,right`. 좌우 차이 허용 오차 1px, summary→본문 16px. outer 12px/16px padding, 내부 section 추가 테두리·패딩 없음 |
| 운영자 열린/빈/데이터/403, 4폭 | summary/body `operationsDisclosure:left,right`, min-height 44px, 간격16px, 기존 opsForm·패널 정렬 유지 |
| ko/en/ja 및 light/dark | 긴 요약 줄바꿈, 가로 스크롤·잘림 없음. 기존 언어 4버튼 한 줄 top/height 계약 및 테마 pill 유지. radius-card·1px var(--line)·웜 토큰, focus-visible 유지 |

G0~G8 기준·경고·예외는 [정렬 규격](../프론트_정렬규격.md) 원문 적용. 기본 closed 화면만 검사해 숨긴 컨트롤 검사를 통과시키지 않는다. 열린 상태의 대상 수가 양수임을 먼저 확인한 뒤 치수·레이아웃을 잰다.

## 4. 탐색·상태·실패 계약

### 4.1 해시 처리

1. 기존 resolveSettingsHash만 사용한다. selector 문자열을 hash에서 만들거나 알려지지 않은 해시를 fallback으로 열지 않는다.
2. `#screen/#langSec` 및 그 별칭은 조상 appearanceLanguage, `#nx/#advanced`와 그 별칭은 조상 advancedData를 연다. `#advNotion`은 이제 div 대상이지만 조상 외부 그룹을 열고 해당 div로 포커스한다. canonical도 조상 안으로 이동하므로 처리 가능하다.
3. 앞 3그룹 canonical은 기존 직계 marker 열기 유지. `#ops`는 기존 opsDetails를 summary.click()으로 열어 React open과 OpsFolders의 open 전달을 동기화한다. `#opsDetails/#hOps`도 같은 소유자를 연다.
4. 대상 조상 details를 바깥→안쪽 순서로 열고 2RAF 후 최신 hash·sequence·generation·uid·owner·isConnected·open·가시성을 다시 검사한다. disabled면 가장 가까운 section h2, 없으면 summary로 포커스한다. hAdvanced 태그 변경 후에도 동일 fallback 원칙이다.
5. 같은 hash nav 재클릭, 초기 hash, hashchange, 뒤/앞 history 모두 지원. 다른 그룹 수동 open은 닫지 않는다. unknown/깨진 인코딩/비허용 owner는 포커스·열기·관리 API 0건. 지연 owner me/크레딧은 최신 hash만 재시도한다.
6. 일반 summary 클릭은 hash·history·저장 API를 바꾸지 않는다(운영자는 기존 첫 조회 예외). uid 초기화 뒤 인식된 현재 hash가 있으면 해당 **현재 권한**의 그룹만 다시 연다.

### 4.2 필드·요청·오류 유지표

| 상태/행동 | 유지할 결과·요청 경계 |
| --- | --- |
| 테마 system/light/dark | 기존 `setTheme(''|'light'|'dark')`·THEME_EVENT·로컬 저장. 닫힌 중 footer 변경도 themeVal/aria-pressed 동기화, 재열어도 같은 상태. API 추가 없음 |
| 언어 auto/ko/en/ja | setLang 즉시 html[lang]·로컬 ulp:lang·문구 반영. 로그인 시 PATCH `/api/v1/me` locale=`null|'ko'|'en'|'ja'`; guest PATCH 0. in-flight 동시1·마지막 선택 수렴·세대 변경 queued 값 폐기. 실패 시 기존 console.warn, 로컬 선택 유지·자동 rollback/새 성공 문구 없음 |
| 백업 export | exportAudio boolean·busyNx·nxMsg 보존. GET `/api/v1/export/zip?includeAudio=true|false`, blob와 filename 다운로드. 성공/실패 후 닫힌 채 완료 가능, 재열기 시 메시지/선택 유지, 새 다운로드 중복 유발 없음 |
| ZIP preview | importFile·fileInputRef 동일 node/File 유지. POST 기존 preview endpoint multipart `file`, 응답 소비 `previewToken,newSongs,updatedSongs,sessions,takes,errors[{file,row,reason}],songsSample[{isNew,title,artist}]` 그대로. previewSummary/Items와 오류 텍스트는 안전한 React 텍스트 렌더 |
| ZIP confirm/취소 | POST 기존 confirm endpoint `{previewToken}`; 응답 `createdSongs,updatedSongs,upsertedSessions,importedTakes`. 성공 시 token/items/importFile/파일 input 비우기, 실패 시 기존 메시지, 취소 시 token/items 제거와 취소 문구. 접힘은 취소 동작이 아님 |
| guest 백업/preview·입력 없음 | 기존 로그인 요구·파일 선택 요구 메시지. 요청 0건. 토큰 없음 confirm은 기존 방어 유지. busyNx 중 기존 disabled 유지 |
| 고급 입력·저장·조회 | 기존 Page의 state/ref와 handler·요청·오류·status를 그대로 이동. 닫기/재열기로 입력값·체크·오류·성공·진행 메시지·요청을 재초기화하지 않음 |
| 운영자 첫 열기/재열기 | open 전 `/api/v1/admin/*` 0. 첫 열기 폴더 조회1, 성공 후 재열기 추가조회0. 지연 응답이 닫힌 중 도착해도 재열면 결과 유지. 실패 후 다음 열기는 기존 loaded=false 재시도 |
| 운영자 403 | 기존 forbidden 문구와 폼 제거. 닫고 다시 열어도 권한 오류를 성공/빈 목록으로 숨기지 않음. 검색·creator 저장·폴더 CRUD 계약 불변 |
| 인증 A→B/로그아웃/owner 강등 | 기존 필드 초기화·uid/세대 가드 유지, 이전 사용자의 결과·관리 폼이 새 identity에 나타나면 실패. ops는 identity key로 remount. 실제 권한은 서버 판단, 클라이언트 숨김을 접근권한 검증으로 간주하지 않음 |

ZIP endpoint 원문·에러 구조는 `apiClient.ts:1062~1113` 및 `SettingsPage.tsx:701~733,1296~1422` 그대로다. API 상태/코드 추가·정규화 없음. 기존 오류는 `(e && e.message) || t(기존키)`를 유지한다. 반환값을 빈 성공으로 바꾸지 않는다.

주의: 기존 async handler의 finally 및 OpsFolders의 uid/unmount 가드가 모든 경합을 완전히 방어한다고 정적 조사만으로 단정하지 않는다. 기존 한계가 재현되면 원인·영향·선행 여부를 기록한다. 이번 배치 변경 때문에 생긴 회귀는 범위 내 수정하고, 기존 서비스 로직 확대 수정은 별도 결정으로 남긴다. 필수 AC 실패가 남으면 완료를 보류한다.

## 5. 실패 우선 검증과 최종 수용 판정

아래 이름을 신규 테스트 prefix `ST3-`로 고정한다. 시니어 표적은 ST3-01과 ST3-02 묶음 1~2개만 실행하고, 잔여 분기·전체 회귀는 주니어 §4가 맡는다. request release·응답/DOM poll로 기다리며 임의 sleep·가시성 force click·빈 배열 치수 단언 금지.

| 테스트 | 준비·행동·기대 결과 | 잡아야 할 실패/가드 |
| --- | --- | --- |
| ST3-01 groups and native disclosure | hash 없는 guest/user/paid/expired/owner에서 D1 순서·4/5/6 marker·모두 closed·단일 summary 검사. 새 두 그룹 Enter/Space/클릭·복수 open·Tab 제외/복원. 전체 기존 render-key·ID·권한 목록을 독립 기대와 비교 | 그룹당 다중 접힘, nx 위치 누락, 숨긴 DOM 미마운트, non-owner ops 노출. 구현 전 새 marker/순서 실패를 Red로 확보 |
| ST3-02 hashes and identities | canonical/각 등록 별칭 전수 initial·hashchange·same hash·뒤앞 확인. #advNotion div·hAdvanced h2·disabled fallback·#ops 지연 me 포함. hash/uid/role 교체와 unmount 직전 RAF 중 예전 열기·focus0. 동일 uid /me·언어 갱신은 수동 closed 유지 | 새 wrapper 때문에 canonical 가시성 실패, 제거한 내부 details에만 의존, stale hash·owner 요청. 가드↔열기/포커스/요청수 단언 연결 |
| ST3-03 mounted data and pending work | 파일 선택·preview 결과·입력 draft·exportAudio 보존 node 비교, 닫힌 중 export/preview/confirm 성공·오류 처리 후 재열기. 취소·빈 파일·guest·busy 분기도 확인 | key/conditional mount로 File·입력 소실, 접힘으로 중복 변이·다운로드, 오류가 사라짐. 기존 uid 가드와 A→B 결과 폐기 연결 |
| ST3-04 locale and theme | 닫힌 중 footer dark→그룹 열기→light 역동기화. 언어 en→ja→auto 지연 PATCH 중 닫기·재열기·실패·A→B queued 폐기·guest 0 요청 | mount로 언어 큐 재시작·동시 PATCH, locale 실패를 성공으로 승격, footer sync 유실 |
| ST3-05 operations | 기본 조회0·첫 열기1·지연 중 닫기·성공후 재열기0·실패 재열기 재시도·403 폼 제거. owner A→owner B, owner→user 및 지연응답 후 이전 target/오류/폼0 | loaded/open 이중 소유, uid 간 관리 폼 재사용. key·role gate·OpsFolders open 조건과 실제 DOM/요청 단언 연결 |
| ST3-06 acceptance and screenshots | 3언어 × guest/user/paid/expired/owner × 4폭의 closed/두 그룹 열린 상태 G0~G8 및 focus·끝스크롤, dark·오류·owner 데이터 화면 PNG Q1~Q9 | closed 화면만 확인해 내부 잘림/작은 클릭 영역/빈 치수 검사가 숨는 실패 |

### 5.1 기존 검사 변경 원칙

- ST2의 앞 3그룹 단언은 해당 marker로 scope한다. 전체 marker/open 수는 ST3가 역할별로 검증한다. ST2의 `#screen` 이동 후 전체 open=0은 **credits 닫힘 + appearanceLanguage 열림/포커스**로 변경하며 stale 응답 폐기 단언을 보존한다.
- ST1의 실제 DOM render-key 순서는 guest `account,credits,screen,language,backup,advanced`; user는 credits 뒤 community; owner는 끝 opsHost다. 독립 `ST1_RENDERED` 항목/자손 검증은 유지한다. nav 링크 순서·href는 그대로다.
- 기존 `#advNotion > summary` 조작·내부 open 단언은 `advancedData > summary`의 닫힘/열림과 **기존 하위 컨트롤 비가시/가시** 단언으로 치환한다. 일반 div인 #advNotion 포커스 검사는 유지한다.
- 준비는 attached/텍스트 확인으로 끝낸다. 기본 layout suite ready에서 열지 않는다. 기존 필/간격 검사는 검사 전에 해당 그룹을 열고 원래 컨트롤 수·수치 단언을 유지한다. i18n 4버튼 치수 측정 전 appearanceLanguage를 반드시 연다. 새 방문 시 open은 다시 초기화한다.

### 5.2 실행 계획·체크리스트 (이번 단계 미실행)

- [x] 시니어: ST3-01/02 실패 우선 → 핵심 구현 → 표적 통과, 자체 diff·7파일/700줄·ID/계약 보존 검토. [진행 §16](../진행_ST.md)에 실행과 표적 부분집합/잔여 분기를 기록하고 주니어 §4로 인계.
- [ ] 주니어: `npm run build`, `npx playwright test test/e2e/layout/settings.spec.js -g 'ST3-'` → exit0, ST3 전수 pass, skip/flaky 별도 기록.
- [ ] 주니어: `npx playwright test test/e2e/layout/settings.spec.js test/e2e/layout/profile.spec.js test/e2e/community.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/xss.spec.js test/e2e/ops.spec.js test/e2e/i18n-lang.spec.js test/e2e/theme-footer.spec.js test/e2e/layout/shell.spec.js` → 기존 보안/상태/탐색 단언 유지, 실패 원인 분리.
- [ ] 주니어: `$env:LAYOUT_SHOTS='1'` 설정 후 `npx playwright test test/e2e/layout/settings.spec.js`, 종료 후 `Remove-Item Env:LAYOUT_SHOTS`. PNG 직접 열어 closed/열린/오류·4폭·다크 Q1~Q9표 기록. ×0, △는 근거. 파일/상태/언어/폭별 증거를 결과에 연결.
- [ ] 주니어: `npm test` → exit·suite/pass/fail/skip·기존 실패를 실제대로 기록. 기존 ST-2 문서의 LA-1 한계와 통과 요약이 섞여 있으므로 새 실행 결과로 판정한다.
- [ ] 문서/마무리: `git diff --check`, status/diff·UTF-8 BOM없음/LF·링크, 코드/테스트와 문서 변경 별도 집계. 결과/ST-3.md·진행_ST.md·계획 #10·인수인계 링크 갱신. Git 게시는 별도 승인 시에만 수행.

| 최종 기준 | 요구 증거 및 판정 한계 |
| --- | --- |
| AC-9 기본 접힘·열기·저장 | ST3-01~05 + ST1 Registry 오류 주입(중복ID/별칭·렌더누락·UNKNOWN_TARGET·3사전 누락) + ST2 저장/롤백 회귀. 전부 통과해야 설정 UI 완료. owner 비노출·요청0 포함 |
| AC-9 해시·상태 | 등록 canonical/aliases 전수, keyboard·2RAF 취소·동일 uid 수동 상태·identity reset·busy/오류 보존. 미검증 분기 목록이 남으면 수용 완료로 쓰지 않음 |
| AC-10 언어·역할·폭·접근성 | ST3-06 행렬·G0~G8·열린 컨트롤 측정·Q1~Q9, 기존 XSS/CSP 유지. paid는 pro, expired는 실제 free 만료를 별도 fixture로 검증하고 grace와 구별 |
| 실제 통합·운영 | 모의 E2E는 실제 OAuth/Drive/ZIP 서버/DB A↔B 권한 통합 증거가 아님. 미실행은 명시. UI/모의 수용 결과·실제 통합·운영 배포 판정을 분리 |

## 6. 이번 단계 완료 경계

세부 명세·시니어 핵심 구현·표적 ST3-01/02 완료. 실행 결과와 잔여 분기는 [진행 §16](../진행_ST.md)에 기록한다. 최종 AC-9/10은 전수 회귀·화면 검토 전이므로 미완료다. 다음은 템플릿 §4의 **주니어 전체 검증·화면 검토**이며 구체 재개 조건과 Git 제한은 진행 §5에 유지한다. 새 API/props 결정은 없다.
