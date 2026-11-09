# PF-2 구현 명세 — 내 이름 편집 이동·공개 요약 확인

- 작성: 2026-11-09 / GPT 시니어. **2026-11-09 명세·PF-2 한정 9파일 예외 승인. 로컬 핵심 구현·표적 검증 완료, 전체 회귀·Git 게시 미실행.**
- 기준: `main=origin/main=5ed638835959c035b216a7237782902a96e48a96`. [PR #150](https://github.com/choise-hun/doloop/pull/150) `merged=true`, 2026-11-09 22:18:04 KST. `git switch main` → `git pull --ff-only` 성공.
- 입력: [계획 #9 PF](../../계획/상용_서비스_계획.md#11-pf-step-순서--분할-제안--사용자-검토-대기), [REQ-4 / AC-8](../요구사항_명세_초안.md#req-4--프로필-진입-분리), [진행 PF §3](../진행_PF.md#3-pf-step-배정-제안), [PF-1 결과 §7·§8](../결과/PF-1.md).
- 실행·재개·승인 기록: [진행 PF §6](../진행_PF.md#6-pf-2-시니어-명세--2026-11-09). 본 문서의 검증은 계획이며 실행 결과가 아니다.

## 1. 완료 여정·범위와 승인 경계

로그인 사용자가 `profile.html`에서 비공개 표시 이름(displayName)과 커뮤니티 이름(publicName)을 각각 저장하고, 자신의 공개 이름·크리에이터 정보·소개·팔로워 수와 계정의 실제 티어를 확인한다. 설정의 공개 이름 폼은 프로필로 이동한다. 설정의 로그인·이메일·사용량·저장소·공유 설정과 커뮤니티의 최초 이름 설정 배너는 유지한다.

PF는 기존 PF-1 → PF-2 → PF-3의 3-Step을 유지한다. 내 폴더·개별 게시물 목록·철회는 PF-3이며 이번에 임시 관리 UI를 넣지 않는다. ST의 그룹/접힘/Registry, 소개 편집, 크리에이터 신청, 티어 변경, 팔로우 버튼/팔로잉 수, 새 서버 API·DB·HTML 경로는 범위 밖이다. PF-2로 AC-8 전체 완료를 선언하지 않는다.

구현 담당은 기존 승인대로 **[시니어]**다. 협업 §1.2 질문 ① 설정 DOM/테스트 셀렉터 이동 ② 공용 PublicNameForm의 프로필·커뮤니티·홈 공존 ③ 저장→/me→공개 요약 및 uid/세대/취소 경합이 모두 해당한다. 승인 후 시니어는 핵심 구현과 표적 테스트 1~2개만 확인하고, 전체 회귀·4폭 캡처·결과 정리·게시/CI는 별도 승인 범위에서 4단계 주니어에게 인계한다. 명세 작성 당시 Tool Lock은 후속 사용자 승인으로 해제됐다. 현재 승인은 핵심 구현·표적 1~2개 Red/Green·인계 기록까지이며 Git 게시는 제외된다.

### 1.1 변경 제안과 반드시 검토할 결정

| 변경 항목 | 이유·경계 |
| --- | --- |
| 설정의 `#settingsPublicNameInput`, `#settingsPublicNameSave`를 프로필의 `#profilePublicNameInput`, `#profilePublicNameSave`로 교체 | 이름 편집의 소유 화면을 분리. 기존 `#community` 해시와 공유 토글은 보존. PF-1 명세의 두 설정 폼 ID 유지 의무만 명시적으로 대체 |
| PublicNameFormProps에 선택적 `disabled`, `acquireSave` 추가 | 동일 페이지의 두 이름 저장을 직렬화. 기존 호출부와 기본 동작/ID/반환 구조 유지 |
| `community.user`, `community.setPublicName`에 선택적 `options?: { signal?: AbortSignal }` 추가 | 토큰 조회 중 계정 전환 시에도 이전 작업이 B 토큰으로 전송되지 않도록 기존 auth.apiFetch의 RequestInit.signal로 취소 전달. 서버 계약·기존 1인자 호출 보존 |
| MeProfile 누락 필드와 서버 필수/nullable 정합 | 서버에 이미 존재하는 응답의 프런트 타입 정정. 서버 필드 신설 아님 |
| 3개 언어에 `profile.*` 키 추가 | 표시 이름/공개 요약/부분 성공에 맞는 기존 문구가 없음. 다른 기능의 오류·레이블을 오용하지 않음 |

**규모 관문(2026-11-09 승인):** §3의 최소 제품/테스트 범위는 **9파일(핵심 5 + 테스트 1 + 사전 3), 예상 500~700 변경줄**이다. 기존 진행 §3의 잠정 6~7파일과 문서 운영 §4.1의 7파일 상한을 초과한다. CSS는 기존 module을 재사용하며, 번역·DTO만 별도 Step으로 떼거나 PF를 가짜 대기능으로 나누지 않는다. 추천은 **동일 여정·핵심 5파일·700줄 이내를 유지하는 PF-2 한정 9파일 예외**를 사용자 결정으로 승인받는 것이다. 대안은 PF-2/3 범위 재조정이며 이번에 임의 변경하지 않는다. 사용자가 본 명세와 PF-2 한정 9파일 예외·핵심 5파일·총 700변경줄 이내 로컬 구현을 명시 승인했다. 승인 근거와 실제 결과는 진행 PF §7을 따른다. 공통 규칙 자체는 수정하지 않는다.

## 2. 실제 코드 근거

행 번호는 위 기준 커밋의 원본이며 구현 후 이동할 수 있다.

| file:line | 확인 사실·설계 근거 |
| --- | --- |
| `frontend/src/pages/ProfilePage.tsx:8`, `:37`, `:43`, `:80` | 기존 계정·로그아웃 가드, 일치하는 me만 이름 표시, narrow Shell. 로그아웃 처리 보존 |
| `frontend/src/pages/ProfilePage.module.css:24`, `:41`, `:53` | accountCard padding 24/gap 16, 긴 p 줄바꿈, stack gap 16 재사용. CSS 변경 없이 1열 구성 |
| `frontend/src/pages/SettingsPage.tsx:101`, `:112`, `:133`, `:377`, `:683` | 공유 토글은 updateProfile과 세대 가드 사용. accName은 읽기 전용이며 기존 displayName 편집 폼은 없음. 이동 대상은 PublicNameForm |
| `frontend/src/components/community/PublicNameForm.tsx:9`, `:24`, `:33`, `:44`, `:57` | props/DOM·로컬 검증. 저장 후 fetchMe 반환 null을 검사하지 않고 onSaved 가능. busy는 state만 사용, uid/세대 가드 없음(정적 위험, 실행 재현 아님) |
| `frontend/src/pages/CommunityPage.tsx:247`; `frontend/src/components/community/CommunityPane.tsx:118` | 같은 폼을 독립 커뮤니티 및 홈 패널 최초 이름 배너에서 재사용. 둘 다 변경 없이 호환 필요 |
| `frontend/src/components/community/Community.module.css:330`, `:337`, `:357` | nameForm/nameField/nameInputRow/nameInput/fieldLab/fieldHint/formMsg의 기존 flex·wrap·gap 재사용 |
| `frontend/src/lib/auth.ts:11`, `:54`, `:180`, `:199`, `:220`, `:247`, `:332`, `:371` | MeProfile 누락, PATCH 타입, 세대/seq, 토큰 대기 후 요청 가드, fetchMe 실패=null, PATCH 큐, 동기 onChange 구독 |
| `frontend/src/lib/apiClient.ts:493`, `:1597`, `:1625`, `:1762` | CommunityUserDto와 user/setPublicName 래퍼가 이미 존재. 중복 래퍼 신설 불필요 |
| `frontend/src/lib/community.mts:127`, `:171` | kstDate 및 communityErrorKey. 오류의 code/status/data.detail 파싱과 쿨다운 문구 재사용 |
| `src/main/kotlin/ulevelp/service/ProfileService.kt:35`, `:161`, `:262`, `:404` | /me 전체 DTO, displayName 문자열/trim/100자/빈 문자열 허용, 사용자별 트랜잭션 업데이트·반환 |
| `src/main/kotlin/ulevelp/service/TierService.kt:61`, `:73` | limits와 usage의 전체 필드·nullable. 실제 tier와 billingTier의 의미 분리 |
| `src/main/kotlin/ulevelp/service/CommunityService.kt:135`, `:182`, `:336`, `:845`, `:869`, `:894` | 공개 사용자 DTO, 이름 정책/잠금, publicName 미설정 시 404, follows는 목록 응답이며 팔로잉 수 필드 없음 |
| `src/main/kotlin/ulevelp/routes/MeRoutes.kt:21`; `src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:95`, `:103`, `:163`, `:183` | 인증 사용자 기준 이름 저장·조회, 200/no-store, /users 공개 DTO, /follows 계약 |
| `src/main/kotlin/ulevelp/api/ApiError.kt:17`; `frontend/src/lib/auth.ts:232`; `src/main/kotlin/ulevelp/Main.kt:286`; `src/main/kotlin/ulevelp/api/JsonInput.kt:202` | 표준 오류 DTO와 클라이언트 Error.status/code/data 구조. JSON은 encodeDefaults=true/explicitNulls=true, UUID 오류는 404 |
| `test/e2e/layout/profile.spec.js:39`, `:169`, `:195`; `test/e2e/avf3-profile-callers.spec.js:36` | PF-1 이름 미설정 행 생략·설정 폼 ID 단언은 승인 변경 필요. 기존 공유 토글·독립 PATCH 회귀는 보존 |
| `frontend/src/lib/i18n.mts:4`; `frontend/src/lib/i18n/ko.mts:50`, `:236`; `frontend/src/styles/tokens.css:180` | 키는 KO로 타입 고정, tier/community 키 재사용. 기존 pillBtn/ghostBtn·토큰 유지 |

## 3. 구현 파일 제안 목록·시그니처

§1.1 규모 예외와 본 명세의 사용자 승인을 받아 아래 범위로 구현했다. 신규 제품 파일·의존성 없음.

| 파일 | 변경 내용 |
| --- | --- |
| `frontend/src/pages/ProfilePage.tsx` | 표시 이름 폼, 공용 공개 이름 폼, 공개 요약 상태/조회, 두 폼 저장 잠금, 기존 로그아웃 보존 |
| `frontend/src/pages/SettingsPage.tsx` | PublicNameForm import/렌더 제거, 같은 panel 위치에 프로필 링크 추가. 설정 토글 로직 유지 |
| `frontend/src/components/community/PublicNameForm.tsx` | 선택 props, 동기 중복 방지, uid/세대/작업/mounted·취소, /me 재확인 실패 분리 |
| `frontend/src/lib/auth.ts` | MeProfile 응답 타입 정합과 TierUsageDto named type 추가만. 인증·큐·fetchMe/API 함수 런타임 무변경 |
| `frontend/src/lib/apiClient.ts` | user/setPublicName 기존 래퍼에 선택 options.signal 전달만. 반환 타입/기본 동작 유지 |
| `frontend/src/lib/i18n/ko.mts` | §7 신규 키 |
| `frontend/src/lib/i18n/en.mts` | 동일 키 영어 |
| `frontend/src/lib/i18n/ja.mts` | 동일 키 일본어 |
| `test/e2e/layout/profile.spec.js` | PF2 동작/배치/경합 회귀와 PF1 유지·이동 단언 수정. 설정·커뮤니티·홈의 폼 회귀도 이 파일에서 검증 |

읽기 전용: ProfilePage.module.css, SettingsPage.module.css, Community.module.css, CommunityPage/CommunityPane, App/AppShell, server.js, Kotlin 전체, DB/migration, 기존 공통 fixture·검사기 및 다른 spec. 기존 스타일로 §6을 충족하지 못하면 CSS 파일을 몰래 추가하지 않고 규모 관문으로 복귀한다. 문서 기록은 본 명세/진행 PF, 구현 이후 결과/PF-2.md에 둔다.

시그니처 고정:

- `ProfilePage(): React.ReactElement` named export 유지. 로컬 핸들러·상태는 외부 export하지 않는다.
- 기존 `PublicNameFormProps`의 me/inputId/submitId/inputRef/onSaved와 기본 ID 유지. `disabled?: boolean`, `acquireSave?: () => (() => void) | null`만 추가한다. 반환된 함수는 해당 잠금 소유자의 해제 함수이며 null이면 제출하지 않는다. 생략 시 기존 사용처는 자체 잠금만 사용한다. `onSaved?: (publicName: string) => void`는 현재 세대의 /me 재확인까지 완료된 후 1회 호출한다.
- `communityUser(userId: string, options?: { signal?: AbortSignal }): Promise<CommunityUserDto>` 및 `communitySetPublicName(name: string, options?: { signal?: AbortSignal }): Promise<{ publicName: string | null; changedAt: string | null; nextChangeAt: string | null }>`로 확장한다. 공개 export 객체의 user/setPublicName 키 유지. options.signal을 기존 `auth.apiFetch(path, RequestInit)`에 전달한다.
- `auth.updateProfile(patch: ProfilePatchInput): Promise<MeProfile>`, `auth.fetchMe(): Promise<MeProfile | null>`, `auth.apiFetch`, `auth.onChange`, `auth.getSessionGeneration`의 시그니처/동작 유지. 새 logout alias 없음.

## 4. Locked Contracts — 유지와 승인 변경의 경계

| 경계 | 고정 계약 |
| --- | --- |
| Shell/라우트 | variant=narrow/activeNav=profile, h1=Profile, title=Profile · ULeveLP. PF-1 React/Node/Ktor 경로, navAuth/current·SETTING, 상하단 6개 메뉴·테마·푸터 구조 보존 |
| 프로필 계정 | `#profileAccount`, `#profileAccountTitle`, `#profileGuest`, `#profileLoginLink`, `#profileUser`, `#profileEmail`, `#profileDisplayName`, `#profilePublicName`, `#profileLogout`, `#profileAuthMsg`, `#profileSettingsLink` 유지. 기존 두 이름 p는 값이 있을 때만 텍스트 표시, 새 편집 input과 ID 중복 없음. guest/embedded·로그아웃 성공/실패·동기 연타/동일 uid 재로그인 가드 유지 |
| 설정 유지 | `#account`, `#hAccount`, `#accDesc`, `#accGuest`, `#btnLogin`, `#btnLoginBlank`, `#accUser`, `#accEmail`, `#accName`, `#accQuota`, `#quotaText`, `#quotaBar`, `#driveStoragePanel`, `#btnLogout`, `#accMsg`, `#community`, `#hCommunity`, `#commAutosync`, `#commPracticeLog`, `#commProNotice`, `#commNameRequiredNotice`, `#commErrMsg`와 기존 조건/저장/되돌림/해시 유지. accName 읽기 표시는 이동 대상 아님 |
| 설정 승인 변경 | 기존 nameForm panel의 폼만 프로필 링크 `a#settingsProfileLink.ghostBtn[href="profile.html#profileNames"]`로 대체. 제거되는 ID 2개를 숨긴 입력으로 복제하지 않음. #community 직접 진입은 계속 공유 토글로 연결 |
| 공용 폼 DOM/CSS | `form.nameForm[noValidate]` → `div.nameField`(label.fieldLab[htmlFor=inputId], p.fieldHint) → `div.nameInputRow`(input.inpField.nameInput[type=text][maxLength=30][ref=inputRef], button.pillBtn[type=submit][id=submitId]) → 조건부 p.fieldHint 쿨다운 → 조건부 p.msg.err.formMsg[role=alert]. module 클래스/형제 순서/기본 ID 유지. disabled는 busy 또는 외부 disabled 또는 me/uid 불일치에 적용, 저장 중 input도 잠금 |
| 기존 폼 사용처 | CommunityPage/CommunityPane의 `#communityNameBanner`, `#communityBannerNameInput`, `#communityBannerNameSave`, inputRef 포커스 동작 및 이름 설정 후 배너 제거 유지. 기본 `publicNameInput`/`publicNameSaveBtn`도 유지 |
| 에러 객체 | 서버 `{ok:false, source, status, code, message, retryAfter?, detail?}`. 클라이언트는 Error.status/code/data, detail은 data.detail 또는 detail. 원시 message·HTML을 그대로 표시하지 않고 키/변수로 렌더. AbortError는 현행 작업의 일반 실패로 번역하지 않음 |
| 데이터·설정 | displayName과 email은 공개 이름/공개 소개의 fallback으로 쓰지 않는다. /me PATCH에는 표시 이름 하나만 전송. locale/공유 토글/저장소 값을 오래된 me에서 복사 전송하지 않음. 앱 격리/소유권·local signOut/키 정리 보존. guitar-practice fallback·legacy /api 호출 없음 |

## 5. 데이터·API·오류 계약

### 5.1 /me 타입 정합

`ProfileService.kt:35`의 전체 응답을 다음처럼 정합한다. TS의 number는 서버 Int/Long의 기존 JSON 대응이다. Main.kt:286의 encodeDefaults=true/explicitNulls=true에 따라 아래 응답 필드는 모두 필수이며 nullable만 구분한다. 기존 optional을 그대로 둬서 서버 필수성을 숨기지 않는다. null을 허위 값으로 대체하지 않는다.

| MeProfile 필드 | 타입·필수성 |
| --- | --- |
| id, email, displayName, role, storageProvider | 필수 string. storageProvider 기존 `'supabase' \| 'drive' \| string` 유지 |
| takeUsedBytes, takeQuotaBytes | 필수 number |
| driveFolderId, migratedLocalAt | 필수 string \| null |
| keys | 필수 `{ notion: KeySummaryDto \| null }`; KeySummaryDto는 hint:string/updatedAt:string |
| tier, billingTier | 필수 string. tier는 override 반영 실제 티어, billingTier는 결제 기준이며 화면 티어 계산에 사용하지 않음 |
| tierOverrideUntil | 필수 string \| null, ISO instant |
| limits | 필수 TierLimitsDto: songs:number\|null, categories:number\|null, takeBytes:number, takeSongs:number\|null, takeDurationSec:number\|null, drive:boolean, ai:boolean, communityWrite:boolean |
| usage | 필수 신규 named `TierUsageDto`: songs:number, categories:number, takeBytes:number, takeSongs:number |
| credits | 필수 `{ monthly:number; purchased:number }` |
| locale | 필수 LocaleCode \| null |
| isCreator, shareAutosync, sharePracticeLog | 필수 boolean |
| creatorBadge | 필수 string \| null |
| creatorBio | 필수 string, 빈 문자열 허용 |
| publicName, publicNameNextChangeAt | 필수 string \| null, 후자는 ISO instant |

서버 반환과 타입을 맞추되, me 자체가 null/다른 uid이면 화면은 편집을 비활성화한다. 런타임 응답에 tier가 누락되거나 미지원 값이면 무료로 단정하지 않고 tierUnknown 문구를 표시한다. 한도/권한은 기존 limits 계약을 따른다.

### 5.2 요청·응답과 상태

| 요청 | 본문/대상·성공 | 오류·화면 처리 |
| --- | --- | --- |
| GET `/api/v1/me` | 본문 없음. 200 → §5.1 전체 DTO. 기존 auth 초기 조회 사용; 현재 me=null에서 사용자가 retry 시 1회 fetchMe | 미인증 401 UNAUTHORIZED, 없는 프로필 404 NOT_FOUND, DB 미연결 503 DB_UNAVAILABLE, 기타 네트워크/5xx. fetchMe는 실패를 throw하지 않고 null로 정리하므로 반환 null 검사 필수. 계정 이메일/로그아웃은 계속 사용 가능 |
| PATCH `/api/v1/me` | `auth.updateProfile({displayName: trimmed})`. 200 → 전체 MeResponseDto. 성공 응답으로 auth.me 갱신, 공개 요약 재조회는 불필요(displayName 비공개) | 문자열 아님/100자 초과 400 INVALID_INPUT, 401/404/503 및 기타 실패. format는 전용 표시 이름 오류, 나머지는 고정 saveFailed. 실패 시 입력 보존, 성공 표시 없음 |
| PUT `/api/v1/community/me/public-name` | `{publicName: trimmed}`. 200 → `{publicName:string\|null, changedAt:string\|null, nextChangeAt:string\|null}`. 저장 후 현재 세대에만 fetchMe→동일 id/publicName 확인→onSaved→요약 재조회 | 형식 400 INVALID_INPUT, 금칙어 400 BANNED_WORD, 정규화 중복 409 PUBLIC_NAME_TAKEN, 쿨다운 409 PUBLIC_NAME_CHANGE_TOO_SOON + detail.nextChangeAt, 미인증 401, DB 미연결 503, 기타 실패. communityErrorKey 유지 |
| GET `/api/v1/community/users/{현재 auth.user.id}` | 본문 없음. 200 → id:string, publicName:string\|null, isCreator:boolean, creatorBadge:string\|null, creatorBio:string, followerCount:number, followingByMe:boolean, folders:PublicFolderSummaryDto[], practiceLog:PracticeLogDto\|null | id가 요청 uid와 다르면 폐기 후 현재 요청의 요약 오류. 미인증 401, UUID 오류 404 NOT_FOUND(유효 uid만 호출), publicName 미설정/없는 사용자 404 NOT_FOUND, DB 미연결 503 및 기타 실패. 요약 실패는 편집/로그아웃을 차단하지 않음 |

공개 응답의 folders/practiceLog는 기존 래퍼 타입 그대로 수신하되 이번 화면에서 렌더·캐시·관리하지 않는다. 기존 프런트 CommunityUserDto.folders는 PublicFolderDto[]로 더 넓게 선언돼 있으나 PF-2는 해당 필드를 읽지 않으며 교정 범위를 확대하지 않는다.

`GET /api/v1/community/follows`는 `{users: [{id,publicName,isCreator,creatorBadge,folderCount}]}`이며 본인 팔로우 목록이다. 팔로워 수 API가 아니고 followingCount 필드도 없다. PF-2에서 호출·개수 추정하지 않는다. PUT/DELETE follows는 자기 자신 400이므로 버튼 자체를 제공하지 않는다. 공개 요약에는 tier/email/displayName이 없다. 티어는 계정 전용 별도 행이며 공개 응답에 추가하지 않는다.

표시 이름 검증은 trim 후 **0~100 UTF-16 code unit**, 빈 문자열 저장 허용(서버와 동일), 공백 포함 허용. input maxLength=100이며 별도 제출 검증도 수행. 공개 이름은 trim 후 **2~20**, 내부 공백 금지, input maxLength=30 유지. 서버가 정규화 키 최소 2자·금칙어·중복·7일 쿨다운을 최종 판단한다. 같은 publicName은 변경 시각도 바꾸지 않는 200 no-op이다. 쿨다운 날짜는 me.publicNameNextChangeAt 또는 오류 detail.nextChangeAt를 kstDate로 표시하며 서버 시각이 권위다. 날짜가 있다는 이유만으로 저장 버튼을 영구 잠그지 않는다.

DB·서버 변경 없음: displayName은 ProfilesTable.id=인증 uid의 한 트랜잭션 update+loadMe, publicName은 같은 사용자 행 FOR UPDATE→쿨다운/중복 검사→update이며 unique 위반 23505도 409로 매핑한다. 외부 I/O 없음, DB 트랜잭션·취소 전파 수정 없음. 브라우저 취소가 서버 커밋을 롤백한다고 주장하지 않는다. 전송된 A 요청은 A로 완료될 수 있으나 B 자격으로 재전송·자동 재시도하지 않는다.

## 6. 화면·배치·상태 전이

기존 계정 section 뒤에 로그인 시 `section#profileNames`와 `section#profileSummary`를 순서대로 추가한다. 둘 다 styles.accountCard, `data-align-group="profileCol:left; profileEdges:right"`, 각 h2의 aria-labelledby를 쓴다. 기존 계정 카드/이메일/로그아웃 순서는 유지한다. ProfilePage.module.css와 Community.module.css의 기존 export를 import하여 사용하고 스타일 파일은 수정하지 않는다.

| DOM/ID | 내용·접근성·클래스 |
| --- | --- |
| `section#profileNames`, `h2#profileNamesTitle` | profile.namesTitle. guest에는 두 새 section 모두 없음 |
| `p#profileMeStatus`, `button#profileMeRetry` | 일치하는 me 없을 때 meUnavailable 및 retry, role=status/aria-live=polite. retry 중 disabled. 인증 snapshot에 loading 플래그를 새로 추정하지 않음 |
| `form#profileDisplayNameForm` | community styles.nameForm/noValidate; nameField 안 label.fieldLab[for=profileDisplayNameInput], p.fieldHint=displayNameHint; 세로 styles.stack 안 input.inpField#profileDisplayNameInput[type=text][maxLength=100] 및 button.ghostBtn#profileDisplayNameSave[type=submit]. 동일 me에서만 활성화 |
| `p#profileDisplayNameMsg` | msg ok/err, role=status/aria-live=polite. 키/변수 상태를 저장하여 언어 변경 시 재번역. 비어 있으면 빈 텍스트 |
| `PublicNameForm` | inputId=profilePublicNameInput, submitId=profilePublicNameSave, 일치 me만 전달. 기존 폼의 저장 pillBtn 유지. acquireSave와 disabled로 페이지 저장 잠금 연결 |
| `section#profileSummary`, `h2#profileSummaryTitle` | profile.summaryTitle. 안내 p=summaryHint: 티어가 계정 정보이며 나머지는 공개 요약임을 명시 |
| `p#profileTier` | tierLabel + free→tier.free/pro→tier.pro/pro_plus→tier.proPlus, 그 외 tierUnknown. me 불일치면 표시하지 않음 |
| `div#profilePublicSummary` | 성공 시만 styles.stack. p#profileSummaryName=publicName, p#profileCreator=creatorBadge 또는 folder.creator(isCreator=true일 때만), p#profileBio=creatorBio(빈 값이면 생략), p#profileFollowers=followers({count}). 이름/소개/배지는 텍스트만 렌더 |
| `p#profileSummaryStatus`, `button#profileSummaryRetry` | role=status/aria-live=polite로 loading/summaryEmpty/summaryFailed 표시. 404·일반 실패에 retry(ghostBtn), loading에는 재시도 비활성. publicName 미설정이면 summaryEmpty와 위 이름 폼이 다음 행동이며 불필요한 GET/retry 버튼은 생략 |

| 상태 | 화면·전이 |
| --- | --- |
| guest·embedded | PF-1 계정/로그인 안내만. 프로필 이름/요약 요청 0회 |
| user + me=null/다른 uid | 입력 2개와 저장 비활성, 이전 값/티어/요약 제거, meUnavailable+retry. user.email/로그아웃/설정은 유지. 자동 재시도 루프 없음 |
| 일치 me + publicName=null | 표시 이름/공개 이름 편집 가능, tier 표시, summaryEmpty. 공개 API는 아직 호출하지 않음 |
| 일치 me + publicName 있음 | 공개 GET 1회. loading 동안 이전 요약을 성공처럼 유지하지 않음. 성공하면 followerCount=0도 정확히 0 표시 |
| 두 이름 중 저장 중 | 같은 페이지 두 폼 저장 및 입력 비활성. 페이지 공용 ref 잠금으로 같은 틱 중복 차단. 로그아웃은 유지하며 클릭 시 작업 무효화 |
| 표시 이름 성공/실패 | 성공 시 서버 trim 값과 표시 이름 p 갱신, saved; 실패 시 현재 draft 유지, saveFailed/format. publicName·공유 설정·언어를 덮지 않음 |
| 공개 이름 PUT 성공 + me 확인 성공 | me.publicName 및 기존 p/배너 갱신. 이전 공개 GET 무효화하고 새 GET 한 번(의존 변경+onSaved로 2번 호출 금지). GET만 실패하면 summaryFailed이며 PUT 성공을 되돌리지 않음 |
| PUT 성공 + fetchMe=null/값 불일치 | nameRefreshFailed(저장 완료·새로고침 실패)를 표시. onSaved/성공 단언 금지. 현재 me 없으면 편집 비활성 및 meRetry 제공. PUT 자동 재시도 없음. 일치 me가 남아 있으면 폼은 재시도 가능하며 서버 no-op 정책을 따름 |
| 공개 GET 404/500/네트워크 | 404도 가짜 0명 성공으로 처리하지 않음. publicName 있는 계정은 summaryFailed+retry. 계정/저장 영역은 사용 가능 |
| A→B, A→logout→A, unmount | 첫 렌더부터 identity가 다른 draft/msg/summary 숨김. 취소·시퀀스 무효화·새 세대 busy 초기화. A catch/finally/onSaved가 B의 잠금·오류·요약을 건드리지 못함 |

배치 약속: 390/768/1150/1280 모두 **header→계정→이름 편집→요약의 1열**이며 narrow 최대폭은 기존 토큰을 따른다. header와 모든 section의 profileCol:left/profileEdges:right 유지. 새 카드 안은 기존 stack gap16, nameForm gap12, nameField gap6. 표시 이름 컨트롤은 세로 배치로 좁은 폭의 과도한 가로 폭을 피하고, 공개 이름은 기존 nameInputRow wrap을 유지한다. 강제 2열·height 약속은 추가하지 않는다. 긴 소개/이름은 기존 accountCard p의 overflow-wrap:anywhere로 줄바꿈한다. 기존 pill/ghost·입력 스타일, 카드 직각·웜 토큰을 유지한다. label 연결, h1 하나/h2 section 제목, Enter 제출, Tab 순서=DOM 순서, 오류 읽기·disabled·포커스 이동을 확인한다. hash `#profileNames` 직접 진입은 해당 section으로 이동한다(새 route 아님).

### 6.1 비동기·편집 상태의 필수 처리 순서

1. **identity**는 `(auth.user.id, auth.getSessionGeneration())`로 잡는다. me.id 일치도 별도로 검사한다. 동일 uid의 TOKEN_REFRESHED는 기존 세대 유지이므로 유효 작업을 버리지 않는다. 로그아웃→동일 uid 재로그인은 이전 세대와 구분한다.
2. 폼 및 요약은 mounted/identity/요청 seq/작업 객체가 모두 현재일 때만 성공·오류·busy·콜백을 쓴다. 렌더에서도 소유 identity가 다른 상태는 숨긴다. effect 초기화만으로 이전 계정이 한 프레임 보이지 않도록 한다.
3. 공개 PUT/GET 시작 시 AbortController 생성. auth.onChange 동기 구독에서 uid/세대가 달라지면 즉시 abort, unmount 및 요약 재조회도 이전 controller abort. RequestInit.signal을 래퍼→apiFetch→fetch에 전달하여 getAccessToken 대기 중 취소도 네트워크 전송을 막는다. await 뒤 가드도 유지(취소만으로 응답 반영 안전을 대체하지 않음). 구독 정리는 필수다.
4. 두 폼 저장은 ProfilePage의 공용 작업 ref를 동기 획득한다. `acquireSave()`는 잠금 불가면 null, 성공이면 **그 작업 identity에만 유효한 해제 함수**를 반환한다. PublicNameForm 자체도 ref로 연타를 차단한다. finally는 소유 작업일 때만 해제하며 이전 A finally가 B 저장 잠금을 풀지 못한다. CommunityPage/Pane은 선택 props 생략으로 자체 잠금만 사용한다.
5. 표시 이름은 기존 auth.updateProfile 큐를 사용한다. 추가 fetchMe를 붙이지 않는다. 공개 이름은 유효 PUT 뒤 fetchMe 1회, 반환 id/publicName 및 현재 auth.me를 대조한 후 onSaved. 표시 이름 PATCH 중 공개 이름 fetchMe가 profileSeq를 올리지 않도록 두 폼 잠금은 **재조회 완료까지** 유지한다.
6. draft는 계정/세대가 바뀌면 폐기한다. 같은 identity의 locale/공유 설정/티어 등 무관한 /me 갱신은 편집 중 이름 draft를 덮지 않는다. 이름의 서버 값이 실제 변경됐을 때만 반영하며, 저장 실패 시 draft 유지. 입력은 저장 중 disabled다.
7. 공개 GET 키는 `(uid, generation, me.publicName)`와 명시적 retry seq다. displayName·locale·share 설정 변경만으로 재조회하지 않는다. publicName 변경 시 옛 응답 폐기, 현재 uid/id 검사, 성공 상태는 해당 키에만 연결. PUT 후 명시 갱신과 effect 중 하나의 경로로만 요청한다. 404/5xx에도 무한 retry/polling하지 않는다.

## 7. 문구 고정

기존 키: community.nameLabel/nameHint/nameSave/nameLocked 및 communityErrorKey 결과, settings.logout*, settings.accEmailLabel, nav.settings, tier.free/pro/proPlus, folder.creator를 유지한다. 버튼 저장은 community.nameSave, 재시도는 record.retry를 재사용한다. 제목 Profile은 기존 고정 영문이다. 신규 키의 값은 아래와 같으며 ko/en/ja 사전에 같은 키를 추가한다.

| profile. 접두 키 | ko | en | ja |
| --- | --- | --- | --- |
| namesTitle | 내 이름 | My names | 自分の名前 |
| displayNameLabel | 표시 이름 | Display name | 表示名 |
| displayNameHint | 나에게만 보이는 이름이에요. 100자까지 입력할 수 있어요. | Only you can see this name. Up to 100 characters. | 自分だけに表示される名前です。100文字まで入力できます。 |
| displayNameFormat | 표시 이름은 100자 이내로 입력해 주세요. | Use up to 100 characters for your display name. | 表示名は100文字以内で入力してください。 |
| saved | 저장했어요. | Saved. | 保存しました。 |
| saveFailed | 이름을 저장하지 못했어요. 다시 시도해 주세요. | Could not save your name. Please try again. | 名前を保存できませんでした。もう一度お試しください。 |
| nameRefreshFailed | 이름은 저장했지만 최신 정보를 확인하지 못했어요. 다시 불러와 주세요. | Your name was saved, but the latest profile could not be loaded. Please reload it. | 名前は保存されましたが、最新情報を確認できませんでした。再読み込みしてください。 |
| meUnavailable | 내 정보를 불러오지 못했어요. 다시 불러와 주세요. | Could not load your profile. Please try again. | 自分の情報を読み込めませんでした。再読み込みしてください。 |
| editLink | 내 이름 편집 | Edit my names | 自分の名前を編集 |
| summaryTitle | 공개 프로필 요약 | Public profile summary | 公開プロフィール概要 |
| summaryHint | 티어는 내 계정 정보예요. 커뮤니티 이름·크리에이터 정보·소개·팔로워 수는 공개 프로필 정보예요. | Your tier is account information. Your community name, creator details, bio and follower count are public profile information. | ティアはアカウント情報です。コミュニティ名・クリエイター情報・自己紹介・フォロワー数は公開プロフィール情報です。 |
| tierLabel | 내 티어 | My tier | 自分のティア |
| tierUnknown | 티어 확인 불가 | Tier unavailable | ティアを確認できません |
| followers | 팔로워 {count}명 | Followers: {count} | フォロワー {count}人 |
| summaryLoading | 공개 프로필을 불러오는 중… | Loading public profile… | 公開プロフィールを読み込み中… |
| summaryEmpty | 커뮤니티 이름을 정하면 공개 프로필을 확인할 수 있어요. | Set a community name to view your public profile. | コミュニティ名を設定すると公開プロフィールを確認できます。 |
| summaryFailed | 공개 프로필을 불러오지 못했어요. | Could not load your public profile. | 公開プロフィールを読み込めませんでした。 |

nav.accountAria는 기존 문구를 유지한다. 프로필 문구와 무관한 공용 내비게이션 변경을 추가하지 않는다. 새 타입의 I18nKey를 사용하며 키 정합을 `as any`로 우회하지 않는다.

## 8. 가드 ↔ 테스트 단언 표

모든 신규/수정 테스트는 `test/e2e/layout/profile.spec.js`에 둔다. 표의 프로덕션 가드는 **구현 의무**이며 현재 구현 완료 증거가 아니다. HTTP route/stub 응답만 확인하지 말고 DOM·전송 payload·호출 수·현재 auth 상태를 함께 단언한다. 결정적 request/response 및 deferred release를 사용하며 임의 sleep을 쓰지 않는다.

| 테스트 ID | 실패 모드·프로덕션 가드 | 준비/행동 → 필수 단언 |
| --- | --- | --- |
| PF2-01 이동·설정 회귀 | 이름 편집 위치 분리, 설정 토글 유지 | 설정 두 옛 ID 0개, settingsProfileLink→profile.html#profileNames로 실제 이동/스크롤 확인. 프로필 새 ID 각1개. account/accName/이메일/저장소/두 공유 토글·#community 해시 유지. PF1-04의 두 ID 기대만 교체하고 나머지 단언 유지 |
| PF2-02 표시 이름 | trim/100자/빈 값 허용·한 필드 PATCH | '  내 이름  '→본문 정확히 {displayName:'내 이름'}, 200 뒤 입력/기존 p/auth.me 일치. 빈 값→'' 저장 및 p 생략. 100자 허용/101자 제출 검증은 maxLength 우회 이벤트로 확인, 요청0/전용 오류. 500에서 draft 보존/성공 없음 |
| PF2-03 공개 이름 정책 | 로컬 형식·서버 매핑·쿨다운 | 1/21자·내부 공백 요청0; 2/20자 PUT payload 정확. `BANNED_WORD`/`PUBLIC_NAME_TAKEN`/`PUBLIC_NAME_CHANGE_TOO_SOON` 각각의 고정 문구, detail.nextChangeAt KST 표시. no-op 같은 이름의 changedAt 유지 응답 처리. 400/409에서 이름/요약 성공 변경 없음 |
| PF2-04 요약 경계 | 실제 티어·공개 응답만 사용 | me.tier=pro/billingTier=free, 공개 응답 followerCount=0/isCreator=true/badge/bio 지정→Pro·0명·공개 텍스트 표시. free/pro_plus/unknown, creator=false/빈 소개도 검증. 공개 DOM에 me.email/displayName 불포함, follows/자기 follow 요청0 |
| PF2-05 null·실패·재시도 | identity 일치, 가짜 0명 금지 | guest/다른 uid/null me는 편집 잠금·이전 정보 없음·요약 GET0. publicName=null은 빈 안내/GET0. GET 지연/404/500→정확한 상태·retry, retry 성공→실제 수 표시. 로그아웃/설정 사용 가능, 요청 횟수 상한 확인 |
| PF2-06 부분 성공 | PUT 뒤 me 재확인·반환 null 검사 | PUT200 뒤 GET/me500 또는 다른 값→nameRefreshFailed, onSaved에 따른 요약 갱신0/가짜 성공 없음, PUT 총1. meRetry 성공 후 화면 정상 복구. PUT+me 성공/공개GET500이면 저장 유지·요약만 실패 |
| PF2-07 계정/세대 경합 | uid+generation+seq+mounted·취소 | 공개 PUT/GET 및 표시 PATCH를 각각 보류, A→B·A→logout→A 후 성공/실패 release. B의 draft/요약/msg/auth.me/키·언어 불변, A onSaved/오류 없음. unmount 후 callback0. 이전 finally 완료 뒤 B 저장 잠금이 풀리지 않음 |
| PF2-08 전송 전 취소 | auth.onChange에서 동기 abort·signal 전달 | setPublicName의 getSession/token 조회 보류→B 전환→token release. A 입력을 담은 PUT이 **B Authorization으로 0회**, 취소된 작업 전체 PUT0. summary도 이전 키 요청 전송0. 단순 늦은 DOM 폐기만으로 통과시키지 않음 |
| PF2-09 중복·다른 설정 경합 | ref 잠금·기존 PATCH 큐 보존 | 동일 틱 공개/표시 이름 연타→저장1회. 이름 둘 동시에 제출→첫 요청1/상대0, 완료 후 다음 저장 성공. locale 또는 공유 토글 PATCH가 큐에 있을 때 표시 이름 저장→두 본문 독립·둘 다 서버 도달·최종 필드 모두 보존. 같은 uid TOKEN_REFRESHED 후 정상 성공/실패가 표시되고 무관한 me 변경에 draft 유지 |
| PF2-10 공유 폼 호환 | 선택 props 기본값·inputRef·현재 me 반영 | 커뮤니티 및 홈 배너에서 최초 이름 PUT→/me 갱신→배너 제거. 기존 input/save ID·폼 CSS/에러/포커스 유지. 실제 auth 이벤트로 A/B 지연 PUT도 실행. 단순 기존 profile 테스트 통과로 대체하지 않음 |
| PF2-11 XSS·언어·키보드 | 텍스트 렌더·label·키 상태 | displayName/publicName/bio/badge HTML payload는 텍스트, 실행 플래그 미설정. ko/en/ja의 레이블/오류/요약·언어 변경 후 결과 재번역. Tab/Enter 저장과 disabled/focus 확인 |
| PF2-L 배치 | §6 배치 그룹·기존 스타일 재사용 | guest/me없음/이름미설정/요약성공/긴소개/로딩/실패/쿨다운 상태×4폭, 최대 정보1280 dark. G0~G8/A1 실패0, 경고·Q1~Q9 표와 실제 이미지 검토 |

PF2-03의 금칙어·중복·쿨다운은 mock E2E에서 **클라이언트 매핑**을 검증한다. 서버 정책/DB 무변경과 A/B 실제 소유권은 기존 서버 테스트와 격리 DB 통합 검증에서 별도로 증명한다. mock 저장 기록만으로 실제 DB 보호 통과를 주장하지 않는다.

## 9. 구현 이후 검증·완료 기준 (실제 결과는 진행 PF §7)

시니어 구현에서는 PF2-07/08의 중요 가드가 빠졌을 때 실패하도록 **표적 1~2개**를 먼저 작성하고 Red→Green을 기록한다. 화면 spec도 배치 약속→변경 항목의 의도한 Red→구현→Green 순서를 지킨다. 나머지 아래 반복 검증은 4단계 주니어가 실행한다. 기존 PF-1 성공 수치는 이번 작업의 실행 결과로 재사용하지 않는다.

- [x] `npm run build` — 타입/3사전 키 정합/번들 성공.
- [ ] `npx playwright test test/e2e/layout/profile.spec.js` — PF1 유지와 PF2 전수 통과. 이름 미설정은 기존 p 생략 단언을 유지하고 신규 편집 필드 존재를 별도 단언.
- [ ] `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js` — 4폭 이미지 실제 열기·Q1~Q9 표 작성, dark·긴 텍스트·에러·3언어 확인. 픽셀 비교/새 skip/검사 완화 금지.
- [ ] `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/settings.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js` — 유지 계약 회귀. 다른 spec에 실제 이동 계약 의존이 추가 발견되면 무단 삭제/수정하지 않고 파일·원인·규모 재검토.
- [ ] `node --test test/auth-races.test.js` — auth 타입 수정 뒤 기존 인증/큐 회귀 유지.
- [ ] `npm test`, `./gradlew test` — 전체 회귀는 주니어 담당. 실제 결과·기존 실패·환경 차단 구분.
- [ ] 격리 로컬 Ktor/DB의 실제 사용자 A/B로 표시 이름·공개 이름 각각 저장 후 본인 재조회/상대 계정 무변경 확인. 400/409에서 DB 이름/변경 시각 무변경 확인. 키·이메일·토큰·개인 payload는 증거 파일에서 비식별화. 실제 인증/DB 준비가 없으면 통합 검증 미실행으로 남기고 mock E2E와 구별.
- [ ] 3런타임 경로는 기존 PF-1 등록을 유지. 이번 Ktor 화면 확인은 격리 public root의 dist/index.html→spa.html 및 assets 준비 후 `PUBLIC_DIR=<임시 루트> PORT=3001 ./gradlew run`, 직접 profile 진입/reload와 변경 UI 렌더를 기록. 기존 서버/운영 환경 대체·배포 금지.
- [ ] `git diff --check`, `git status --short`, `git diff --stat` — 실제 파일/변경줄과 승인 범위 대조, UTF-8 BOM 없음/LF, 사용자 미커밋 문서 보존.

구현 완료는 코드·표적 검증, 화면 연결은 설정→프로필→저장→요약, 통합은 실제 서버/격리 DB/A↔B, 운영은 배포 확인으로 구별한다. 핵심 구현과 mock 표적 화면 연결은 완료했다. 전체 명세 회귀·배치·실제 서버/DB 통합은 미실행이며 운영 배포는 승인 범위 밖이다. 문서 완료는 근거/계약/배치/가드↔단언/재개 입력이 준비됐다는 뜻이다.

## 10. 사용자 검토와 다음 단계

검토 대상은 §1.1의 변경 계약, §3 최소 9파일 범위 예외, §4의 설정 폼 ID 이동, §5의 타입/검증, §6·§8의 상태/배치/가드다. 제품/API/DB 정책의 추가 미확정 항목은 없다. **2026-11-09 사용자 명시 승인으로 명세·9파일 예외를 확정하고 로컬 핵심 구현·표적 검증을 완료했다.** 다음 4단계 주니어의 검증/게시 권한은 진행 PF §7을 따른다.

시니어 0단계 핵심 구현+표적 검증을 마쳤으며 다음 담당은 **4단계 주니어**다. `step/PF-2`에서 사용자 변경을 보존해 이어간다. 이번 종료 시 열린 main PR은 0건이다. Git 게시는 이번 요청으로 승인되지 않았으며, 전체 테스트·신규 PR/CI는 다음 4단계 주니어에 대한 명시적 승인 범위를 기록한 뒤 수행한다. 구체 재개 문구는 진행 PF §7에 둔다.
