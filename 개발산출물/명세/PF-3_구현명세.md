# PF-3 구현 명세 — 프로필 내 공유 폴더·개별 게시물 관리와 철회

- 작성: 2026-11-10 / GPT 시니어. **명세·로컬 구현 승인, 시니어 핵심 구현/표적 검증 완료. 전체 검증은 주니어 인계, Git 게시 금지.**
- 기준: `main=origin/main=efcc6516a164162708c0dbf697776ddc1c4c6ff3`. [PR #151](https://github.com/choise-hun/doloop/pull/151) merged=true, 2026-11-10 00:19:07 KST. main 안전 동기화 완료.
- 입력: [계획 #9 PF](../../계획/상용_서비스_계획.md), [진행 PF §3·§8·§9·§10](../진행_PF.md), [PF-2 결과](../결과/PF-2.md), [REQ-4 / AC-8](../요구사항_명세_초안.md).
- 테스트·Q표는 수용 기준이며 전체 통과를 뜻하지 않는다. 실제 시니어 표적 검증·미실행·주니어 인계는 [진행 PF §11](../진행_PF.md)을 따른다.

## 1. 전제·Pre-flight와 범위

| 관문 | 확인·경계 |
| --- | --- |
| ① 앱·소유권·오류 | 앱 구분 연동 데이터는 `app_id='ulevelp'` 유지, guitar-practice fallback 금지(`src/main/kotlin/ulevelp/routes/IntegrationRoutes.kt:35`). 대상 분류·세션 테이블에는 app_id가 없으므로 임의 컬럼/쿼리를 추가하지 않는다. 분류 userId 필터(`src/main/kotlin/ulevelp/service/CategoryService.kt:49`), 분류 소유권(`src/main/kotlin/ulevelp/service/CommunityService.kt:388`), 세션·곡 소유권 잠금(`src/main/kotlin/ulevelp/service/EpisodeLogService.kt:23`) 유지. `/api/v1` 표준 오류만 사용 |
| ② 비동기·트랜잭션 | uid+sessionGeneration+요청 seq+작업 identity와 AbortController 사용. 토큰 대기 중 취소까지 signal 전파. DB 변경 없음. 기존 철회 dbQuery/잠금·공개 제거(`src/main/kotlin/ulevelp/service/EpisodeLogService.kt:143`) 유지. 폴더 외부 제목 I/O는 트랜잭션 뒤(`src/main/kotlin/ulevelp/service/CommunityService.kt:289`). 서버 취소 재던지기·외부 I/O 경계·보상 트랜잭션 규칙 무변경 |
| ③ 실재성 | §2의 파일·심볼·DTO·스타일·테스트 단언을 직접 읽었다. 새 코드/단언의 행 번호는 구현 후 기록하며 기존 코드처럼 꾸미지 않는다 |
| ④ 충돌 | 시작 step/PF-2, 사용자 미커밋 인수인계/계획 2개 보존 후 main 동기화. GitHub 열린 PR 조회 0건. 루트 활성 진행 4개(PF·CM-UI·모바일스파이크·다중LLM_자동화검토) 확인. 현재 제품 diff 없음. 인수인계/계획의 PF-1 대기 문구와 CM-UI의 게시 대기는 과거 상태이며 변경하지 않음. 구현 직전 재확인 |
| ⑤ 계약·규모 | PF 3-Step 및 PF-3 **[시니어]** 배정 유지(기존 DOM 공존·요청 경합·공유 캐시: 협업 §1.2 질문 ①②③). 제안 변경은 선택 signal 인자 6곳과 신규 패널 export/경로 1개. 이유는 계정 교체 전송 차단·프로필 목록 연결이며 검증은 PF3-01~12. 서버/DB/API 경로·필드·상태 코드 변경 없음. 2026-11-10 사용자 명세·로컬 구현 승인(진행 §11), Git 게시 금지 |

완료 여정: 로그인 → 프로필 요약 아래 내 폴더·개별 게시물 상태 확인 → 폴더 비공개/개별 게시물 공유 중지 → 최신 상태 확인 → 기존 COMMUNITY/TRAILS에서 관리 계속.
제품·테스트 **7파일, 핵심 TS/TSX 5파일, 예상 총 550~700변경줄**. 문서 기록은 별도다. 7파일/700줄 상한을 넘으면 단언을 줄이지 말고 범위·규모 관문으로 돌아간다. PF를 가짜 대기능으로 분리하거나 PF-4를 자동 추가하지 않는다.
시니어는 핵심 구현+중요 표적 테스트 1~2개, 4단계 주니어는 전체 검증·Q표·결과 기록을 담당한다. 게시 승인은 별도다. 구현/검증 완료 전 AC-8 완료 판정 금지.
범위 밖: 게시물 편집·재게시·새 공유 폼 신설, 원본 세션/곡/폴더 삭제, 공개 피드 개편, 84일 집계 변경, 서버/DB 변경, 새 번역 키·의존성·토큰, 공용 인증 런타임 수정.

## 2. 실제 코드 근거와 읽기 전용 유지 대상

| 근거 | 확인한 계약·정적 위험 |
| --- | --- |
| `frontend/src/pages/ProfilePage.tsx:53`, `frontend/src/pages/ProfilePage.tsx:254` | uid+generation 이름/요약 상태, 로그인·비임베드 블록. 기존 identity와 me 일치 판정을 새 패널에도 적용 |
| `frontend/src/components/community/MySharesPanel.tsx:19`, `frontend/src/components/community/MySharesPanel.tsx:80` | me/onRequireName props, 공개·자동연동·재게시. mutation 완료·rollback·finally에 identity 검사가 없고 액션별 lock으로 같은 행 경합 가능 |
| `frontend/src/components/community/MySharesPanel.tsx:30`, `frontend/src/components/community/MySharesPanel.tsx:186` | 조회 uid+seq는 있으나 cleanup 취소/세대 가드 없음. getShare 실패를 비공개처럼 표시. DOM·선택자 유지 대상 |
| `frontend/src/components/songRecord/useEpisodeShares.ts:24`, `frontend/src/components/songRecord/useEpisodeShares.ts:46`, `frontend/src/components/songRecord/useEpisodeShares.ts:105` | 전역 캐시·자동 전체 페이지 조회·seq·removeShare 재조회. 철회 임시 상태의 canRepublish는 이전 값이며 세대 검사 없음 |
| `frontend/src/lib/apiClient.ts:705`, `frontend/src/lib/apiClient.ts:960`, `frontend/src/lib/apiClient.ts:1652`, `frontend/src/lib/apiClient.ts:1678` | 기존 래퍼·HTTP 경로·반환 정규화. malformed categories/share의 기존 fallback은 변경하지 않고 실패 응답을 성공으로 바꾸는 새 fallback 금지 |
| `frontend/src/lib/auth.ts:217`, `frontend/src/lib/auth.ts:230` | 토큰 await 뒤 fetch에 RequestInit 전달. 오류 객체 status/code/data 생성. signal을 래퍼에서 넘겨야 전송 전 abort 가능 |
| `src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:34`, `src/main/kotlin/ulevelp/routes/EpisodeRoutes.kt:23` | 폴더 GET/PUT/재게시 POST 및 세션 DELETE 인증·no-store·성공 코드 |
| `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:105`, `src/main/kotlin/ulevelp/service/EpisodeLogService.kt:153` | 내 게시물 DTO·canRepublish 계산·20개 커서 페이지, 철회 후 card=null. status만으로 공개 판정 불가 |
| `test/e2e/community.spec.js:383`, `test/e2e/cm-ui.spec.js:567`, `test/e2e/cm-ui.spec.js:594` | 스위치 payload/rollback, 철회 후 eligibility 재조회·이전 2페이지 폐기 단언. 기존 spec 파일은 읽기 전용 |
| `src/test/kotlin/ulevelp/community/EpisodeLogApiTest.kt:101`, `src/test/kotlin/ulevelp/community/EpisodeCursorApiTest.kt:72` | B 피드 비노출·공개 원문 삭제·철회 멱등성, 20+1개 경계 단언 |
| `frontend/src/pages/ProfilePage.module.css:19`, `frontend/src/components/community/Community.module.css:394`, `frontend/src/styles/tokens.css:8` | accountCard/stack, 폴더 행 480px 분기·기존 토큰. 계정/이름/요약 CSS와 공용 폴더 CSS는 유지 |

## 3. 결정(D)·구현 파일·시그니처

| D | 결정 |
| --- | --- |
| D1 | ProfilePage의 me 일치·로그인·비임베드 상태에만 두 관리 패널을 마운트. key는 uid+generation, me 미확인 시 기존 profileMeStatus/retry만 사용하여 관리 API를 호출하지 않음 |
| D2 | MySharesPanel을 이동/복제하지 않고 프로필과 COMMUNITY에서 재사용. 기존 공개·자동연동·다시 게시·제목 입력 기능 유지. 공개→비공개는 free/publicName 없음에도 허용. 비공개→공개·자동연동·다시 게시는 기존 유료 제한 유지 |
| D3 | 개별 목록은 useEpisodeShares의 전체 페이지 조회·캐시 재사용. 새 패널은 공유 상태·게시 제목/코멘트·게시일·철회 및 TRAILS 이동만 제공. POST/개인 세션 상세 조회 없음 |
| D4 | 전체 목록 loading 중 이미 수신한 행의 철회는 가능. 전수 조회 실패는 부분 목록+오류/재시도이며 빈 성공으로 표시하지 않음. 철회 후 새 GET 전에는 해당 행 재철회/재게시 가능 표시 금지 |
| D5 | 폴더 낙관적 갱신은 보존하되 같은 category의 모든 mutation을 하나의 동기 ref lock으로 직렬화. 실패 rollback은 현재 identity/작업 소유자만. 이전 finally가 새 lock 해제 금지 |
| D6 | 개별 DELETE는 확인창 수락 후 행별 ref lock, ok===true만 확정 성공. 서버 재조회로 canRepublish 확정. 철회 후 title/comment/card를 즉시 비움. 결과 불명확 시 성공 문구 대신 unknownResult·재조회 |
| D7 | 페이지 재진입은 서버 재검증. .html COMMUNITY/TRAILS 이동은 기존 href 그대로이며 목적 화면 mount 조회를 사용. 폴더/개별 캐시를 혼용하거나 localStorage 버스 추가 금지 |

| 파일(정확한 허용 목록) | 변경 |
| --- | --- |
| `frontend/src/pages/ProfilePage.tsx` | 두 패널 연결, 폴더 이름 필요 시 기존 profilePublicNameInput에 focus, 기존 폼/요약 유지 |
| `frontend/src/components/community/MySharesPanel.tsx` | 조회·mutation identity/취소·행 잠금·rollback·상태/재시도·무료 철회 정합 |
| `frontend/src/components/community/MyEpisodeSharesPanel.tsx` | 신규. 내 게시물 상태·철회·기존 TRAILS 링크, 기존 Profile CSS 재사용 |
| `frontend/src/components/songRecord/useEpisodeShares.ts` | generation/취소·전역 요청 무효화, removeShare 임시 안전 상태와 서버 재검증 |
| `frontend/src/lib/apiClient.ts` | 기존 6개 래퍼의 선택 signal 전달만 |
| `frontend/src/pages/ProfilePage.module.css` | 신규 패널의 긴 텍스트/액션 줄바꿈·1열 스타일만. 기존 클래스 의미/다른 CSS 무변경 |
| `test/e2e/layout/profile.spec.js` | PF3 기능·배치·계정 경합·기존 호출부 회귀 추가. PF1/PF2 단언 보존 |

기록 허용: 본 명세·진행 PF·구현 후 결과/PF-3.md. 다른 src/test/사전/fixture/CSS/설정/규칙 파일은 수정하지 않는다.

| 시그니처/export | 고정 |
| --- | --- |
| `ProfilePage(): React.ReactElement` | named export 유지 |
| `MySharesPanel({ me, onRequireName }: MySharesPanelProps)` | props `me: MeProfile|null`, `onRequireName?:()=>void` 유지; 반환 추론 유지. 새 필수 props 없음 |
| `MyEpisodeSharesPanel(): React.ReactElement` | 신규 named export, 내부 useAuth/useEpisodeShares 사용, 새 props 없음 |
| `listCategories(signal?: AbortSignal): Promise<CategoryDto[]>` | categories.list 키·무인자 호출 유지 |
| `getCategoryShare(id: string, signal?: AbortSignal): Promise<{ share: ShareSummaryDto|null }>` | categories.getShare 키 유지 |
| `setCategoryShare(id: string, input: { isPublic: boolean; autoSync?: boolean; title?: string }, signal?: AbortSignal): Promise<{ share: ShareSummaryDto|null }>` | categories.setShare 키·payload 유지 |
| `republishCategoryShare(id: string, title?: string, signal?: AbortSignal): Promise<{ share: ShareSummaryDto|null }>` | categories.republish 키 유지; title 생략 시 undefined 전달 |
| `communityMyEpisodeLogs(cursor?: string|null, signal?: AbortSignal): Promise<MyEpisodeLogListResponse>` | community.myEpisodeLogs 키 유지, cursor 생략 시 undefined 전달 |
| `withdrawShareEpisode(sessionId: string, signal?: AbortSignal): Promise<WithdrawEpisodeResponse>` | sessions.withdrawShare 키 유지 |
| `useEpisodeShares()` | 기존 export·반환 키 유지: shares=Map<string,MyEpisodeLogDto>, loading/complete=boolean, error=string|null, invalidate=()=>void, setShare=(post:MyEpisodeLogDto)=>void, removeShare=(sessionId:string)=>void. 추가 필수 인자 없음 |

폴더 ref 잠금과 별도로 렌더용 busy 상태를 갱신하여 같은 행 제목 입력/공개/자동연동/재게시 컨트롤을 disabled 처리한다. 새 패널도 행별 busy를 렌더하며 다른 행 조작은 막지 않는다.

선택 signal은 기존 auth.apiFetch의 RequestInit.signal로 전달한다. 공개 API·반환 shape·무인자 기존 호출 의미는 바꾸지 않는다. 새 패널의 비동기 핸들러는 비공개이며 외부 export하지 않는다.

## 4. Locked Contracts — API·데이터·권한

| 요청 | 입력 전체 | 성공/반환 |
| --- | --- | --- |
| GET `/api/v1/categories` | body 없음 | 200 `{categories:CategoryDto[]}`; client는 배열 반환 |
| GET `/api/v1/categories/{categoryId}/share` | 소유 categoryId | 200 `{share:ShareSummaryDto|null}`; null은 공개 이력 없음 |
| PUT `/api/v1/categories/{categoryId}/share` | `{isPublic:boolean,autoSync?:boolean,title?:string}`; 철회는 `{isPublic:false}`만 | 200 `{share:ShareSummaryDto}`; 원본 분류 삭제 아님 |
| POST `/api/v1/categories/{categoryId}/share/republish` | `{title?:string}` | 200 `{share:ShareSummaryDto}`; 기존 공용 폴더 패널 액션만 |
| GET `/api/v1/community/me/episode-logs` | cursor?:string; body 없음 | 200 `{posts:MyEpisodeLogDto[],next:string|null}`, publishedAt DESC/id DESC, 20개. next=null까지 자동 순회 |
| DELETE `/api/v1/sessions/{sessionId}/share` | 소유 sessionId, body 없음 | 200 `{ok:true}`, 미공유/이미 철회도 본인 원본 존재 시 멱등. postId를 sessionId 대신 쓰지 않음 |

모든 대상 API는 인증·no-store. 내 목록에 다른 userId를 받는 쿼리를 추가하지 않는다. 소유권 실패는 404, 인증 실패는 401. private memo/takes/오디오/email/displayName을 공유 DTO에 추가하지 않는다.

| DTO | 필드 전수·타입 / 화면 사용 |
| --- | --- |
| CategoryDto | id:string, name:string, sortOrder:number, onHome:boolean, songCount:number. 이름·기존 순서 사용 |
| ShareSummaryDto | folderId:string, categoryId:string, title:string, isPublic:boolean, autoSync:boolean, hidden:boolean, itemCount:number, likeCount:number, cloneCount:number, publishedAt:string|null, publicName:string|null. 공개/자동연동/숨김은 각각 독립 값 |
| MyEpisodeLogDto.postId | string / 행 key·data-profile-post; 원본 ID 아님 |
| sessionId | string / DELETE 경로·캐시 key |
| title | string / 게시 제목, 빈 값은 episode.defaultTitle. 철회 후 옛 제목 재사용 금지 |
| comment | string / text로 표시, 철회 후 빈 값 |
| publishedAt | string / 기존 kstDate로 게시일 표시 |
| status | published・tier_paused・moderation_hidden・미지 string / 아래 우선순위 적용 |
| hiddenAt | string|null / 숨김 플래그로 사용 |
| hiddenReason | string|null / 본인에게만 reasonPrefix로 표시 |
| tierPausedAt | string|null / 일시중지 플래그로 사용 |
| withdrawnAt | string|null / 철회 플래그로 사용 |
| createdAt | string / 수신 보존, 새 UI에 표시하지 않음 |
| updatedAt | string / 수신 보존, 임의 timestamp 최신 판정 금지 |
| canRepublish | boolean / 서버 재조회 값만 사용. 프로필에서 재게시 버튼을 만들지 않음 |
| reportCounts | `{open:number,resolved:number,dismissed:number}` / 수신 보존, 신고 상세 조회/새 신고 UI 없음 |
| card | PublicEpisodeLogDto|null / 수신 보존. 공개 상태나 개인 세션 존재로 간주하지 않음. 철회 직후 null |
| PublicEpisodeLogDto | postId:string, sessionId:string, owner:PublicOwnerDto, videoId:string, youtubeTitle:string|null, youtubeArtist:string|null, title:string, comment:string, publishedAt:string, date:string, seconds:number, loops:number, a:number|null, b:number|null, rate:number|null, coveragePct:number, partStats:PublicPartStatDto[] |
| PublicOwnerDto | id:string, publicName:string|null, isCreator:boolean, creatorBadge:string|null |
| PublicPartStatDto | name:string, a:number, b:number, rate:number, completed:boolean, seconds:number, loops:number |

| 상태 우선순위 / 조건 | 표시·액션 |
| --- | --- |
| 비로그인 / embedded | 두 관리 패널 없음·관리 요청 0회. 기존 계정/로그인/임베드 안내 유지 |
| me 누락·id 불일치 | 두 패널 없음·관리 요청 0회. 기존 me 재시도 후 일치할 때만 mount |
| 폴더 최초 조회 중 | mySharesStatus=home.loading, 조작 불가 |
| 폴더 categories 실패 | mySharesErr=home.catLoadFailed + 재시도. 빈 성공/이전 계정 행 표시 금지 |
| 폴더 getShare 일부 실패 | 해당 행에 community.err.generic, 공개/자동연동/재게시 조작 불가. 미확인 값을 false로 확정 표시하지 않음. 성공 행은 유지 |
| 폴더 categories=[] | mySharesStatus=home.catEmpty + HOME 링크. 오류·loading과 구별 |
| 폴더 성공 | 기존 제목·공개·자동연동·숨김 표시. hidden과 isPublic을 혼동하지 않음 |
| 개별 loading / 부분 조회 | episode.loading. 수신 행은 표시, 빈 안내 없음. 조회 완료까지 전수 성공으로 표시하지 않음 |
| 개별 error / cursor 반복 / 잘못된 페이지 | episode.share.stateError + episode.retry. 부분 목록은 유지하되 미수신 기록을 미공유로 확정하지 않음 |
| 개별 complete && shares.size===0 | episode.emptyAll + TRAILS 링크(개인 패널 문맥에서 본인 공유 이력 없음) |
| 개별 hiddenAt!=null 또는 status=moderation_hidden | episode.share.hidden 우선 표시·선택 사유; canRepublish=true여도 숨김 해제/재게시 UI 없음. 미철회이면 공유 중지 가능 |
| 개별 withdrawnAt!=null | episode.share.withdrawn, 철회 버튼 없음. title/comment/card는 비움. TRAILS 이동 가능 |
| 개별 tierPausedAt!=null 또는 status=tier_paused | episode.share.paused, 미철회이면 무료/이름 없음에도 공유 중지 가능 |
| 개별 status=published, 위 플래그 없음 | episode.share.published, 공유 중지 가능 |
| 개별 미지 status | episode.share.unknownResult, 재시도·TRAILS 이동, 추측 공개 배지/새 쓰기 금지 |

폴더 제목은 기존 maxlength=20·trim·빈 값 category.name 대체·금칙어 정책 유지. 글로벌 shareAutosync=false이면 표시 autoSync=false, 켜기 시 서버 409는 rollback. 전체 토글 끄기를 폴더 철회로 간주하지 않는다.

### 4.1 오류 계약·결과 불명확성

서버 오류 전 필드: ok=false, source:string(기본 server), status:number, code:string, message:string, retryAfter:number|null, detail?:object. `src/main/kotlin/ulevelp/api/ApiError.kt:17` 및 auth.ts:243에 맞춰 err.status/err.code/err.data를 읽는다. 레거시 error/detail 가정·서버 원문 무조건 출력 금지.

| 조건 | 서버 상태/code 또는 client 조건 | UI·데이터 처리 |
| --- | --- | --- |
| 인증 만료 | 401 UNAUTHORIZED | 현재 작업 종료·고정 일반 실패, 새 사용자에게 메시지/rollback 전달 금지 |
| 타인/없는 분류·세션 | 404 NOT_FOUND | 폴더 folder.err.gone / 개별 episode.err.gone, 목록 재조회. 다른 사용자의 데이터 읽기/변경 금지 |
| 유료 공개 쓰기 제한 | 403 TIER_UPGRADE_REQUIRED | community.err.upgrade; 폴더 철회·개별 DELETE에는 로컬 유료 가드 없음 |
| 공개 이름 없음 | 409 PUBLIC_NAME_REQUIRED | community.err.nameRequired, 폴더 onRequireName 호출. 프로필에서는 기존 이름 폼 focus |
| 전체 자동연동 꺼짐 | 409 SHARE_AUTOSYNC_OFF | community.err.autosyncOff, 해당 행 rollback |
| 제목 길이/형식 | 400 INVALID_INPUT | community.err.generic(이름 2~20자 오류로 오표시하지 않음), rollback |
| 제목 금칙어 | 400 BANNED_WORD | community.err.banned, rollback |
| DB 없음 | 503 DB_UNAVAILABLE | 고정 일반 실패·재시도. 빈 성공 금지 |
| 서버/네트워크 실패 | 500 또는 fetch reject | 폴더는 현재 작업만 rollback+일반 실패 후 재조회; 개별은 withdrawFailed+재조회로 서버 반영 여부 확인 |
| DELETE 응답 ok!==true | client 결과 불명확 | unknownResult·invalidate, 성공/철회 캐시 확정 금지 |
| DELETE 성공 후 GET 실패 | client 후속 조회 실패 | 이미 확정 철회를 복구하지 않음. 지운 텍스트 유지·재시도 제공, canRepublish 추정 금지 |
| 계정/세대 변경·unmount 취소 | AbortError / obsolete identity | 사용자 오류 노출 없음, success/catch/finally 전체 상태 갱신 폐기 |

## 5. 비동기·캐시 제어 Skeleton (구현 코드 아님)

폴더는 auth.onChange 구독에서 identity 변경 시 **동기적으로** 모든 controller abort·seq 증가·행 잠금 분리. cleanup도 같은 무효화. 같은 uid 재로그인을 generation으로 구별하고, 렌더부터 현재 identity 소유 rows/err/busy만 사용한다. 공개 이름/쓰기 권한 변경은 조회 재검증, shareAutosync 변화는 기존 표시 갱신 및 진행 중 응답의 최신 false 정규화로 처리한다.

```text
폴더 조회/수정 공통 흐름:
  현재 uid+generation 및 mount 소유 객체를 캡처한다
  현재 identity와 me.id 일치하지 않으면 종료한다
  조회는 seq를 증가시키고 이전 조회 controller를 abort한다
  mutation은 categoryId 하나로 잠금을 획득한다
  이미 잠겼으면 API 호출 없이 종료한다
  mutation 시작은 진행 중 조회 seq를 무효화하고 abort한다
  이 작업만의 controller/작업 객체를 등록한다
  이전 행과 title draft를 캡처한다
  승인 액션이면 기존 낙관적 표시를 적용한다
  래퍼에 controller.signal을 전달한다
  await 뒤 mounted/identity/행 작업 객체를 검사한다
  조회 응답은 별도로 조회 seq가 일치해야 한다
  일치하면 서버 share를 반영한다
  shareAutosync=false는 현재 me 기준으로 정규화한다
  실패 시 현재 작업만 이전 share로 rollback한다
  title draft는 다른 작업의 값으로 되돌리지 않는다
  결과 불명확/404이면 서버 목록을 재조회한다
  조회 재시도는 최신 snapshot만 반영한다
  catch의 오류·onRequireName도 동일 가드를 통과해야 한다
  finally는 소유 작업만 controller/행 잠금을 해제한다
  다른 행 변경이나 새 identity의 잠금은 만지지 않는다
  재조회는 잠긴 행을 덮지 않고 모든 mutation 종료 후 확정한다
```

개별 훅의 profileKey에 generation을 포함하고 uid/세대 변경 시 reset→abort→notify. 마지막 subscriber 해제 시 전역 요청도 취소한다. invalidate/setShare/removeShare의 클로저도 캡처 세대 검사가 필요하다. 페이지 next 반복 감지·sessionId별 중복 제거·수신 순서 유지, 재시도는 cursor=null부터다. 기존 20+1개/가드 흐름과 SR-06/07을 보존한다.

```text
개별 행 철회 흐름:
  현재 uid+generation+mounted를 캡처한다
  행 lock이 있거나 이미 철회된 행이면 종료한다
  confirm 취소면 DELETE/재조회 없이 종료한다
  confirm 수락 뒤 identity를 다시 검사한다
  sessionId별 동기 lock과 controller를 등록한다
  이전 행 메시지를 비우고 submitting을 표시한다
  await withdrawShare(sessionId, signal)
  await 뒤 현재 identity/작업 객체를 검사한다
  ok가 true가 아니면 unknownResult와 invalidate를 적용한다
  ok가 true이면 removeShare(sessionId)를 호출한다
  removeShare는 이전 전체 페이지 seq를 먼저 무효화한다
  새 전체 조회를 시작하고 해당 행 임시 철회를 반영한다
  임시 행 title/comment는 빈 문자열, card=null이다
  임시 canRepublish=false이며 과거 값을 보존하지 않는다
  새 GET만 서버 withdrawnAt/status/canRepublish를 확정한다
  철회 성공 문구는 후속 GET 실패에도 rollback하지 않는다
  catch는 현재 identity에만 실패 문구와 invalidate를 적용한다
  finally는 소유 작업의 lock만 해제한다
  unmount/로그아웃/계정 변경은 controller를 즉시 abort한다
  B 캐시·B 메시지·B busy에 이전 작업이 쓰지 못하게 한다
```

## 6. DOM·Locked Selectors·배치 약속

보존: ProfilePage의 기존 모든 id/variant/narrow/current·이름 저장/요약/로그아웃; CommunityPage의 #chipMyShares/#mySharesTabPane/#mySharesPanel 진입. MySharesPanel의 `#mySharesPanel,#mySharesTitle,#mySharesErr,[data-share-row],[data-share-public],[data-share-autosync],[data-share-republish]`, input aria-label=community.shareTitle/maxLength=20, role=switch/aria-checked 유지. 공용 클래스 sharesPanel/sharesTitle/sharesList/shareRow/shareRowMain/shareCatHead/shareCatName/hiddenBadge/shareTitleInput/shareRowSwitches/switchBtn/republishBtn 및 shareSw{idx}:center-y@481 약속 유지. 같은 문서에 MySharesPanel 중복 mount 금지.

| 새 DOM/배치 | 390 / 768 / 1150 / 1280 및 상태 약속 |
| --- | --- |
| `section#profileFolders` | profileSummary 뒤, profileCol:left; profileEdges:right. h2는 community.mySharesLink, 내부 MySharesPanel. 모든 폭 1열 |
| `#mySharesStatus`, `#mySharesRetry` | status role=status/aria-live=polite; 재시도 button=episode.retry. 오류는 기존 mySharesErr role=alert. 빈 폴더 HOME 링크 index.html |
| `section#profileEpisodes` | 폴더 다음, profileCol:left; profileEdges:right, aria-labelledby=profileEpisodesTitle. 기존 accountCard |
| `h2#profileEpisodesTitle` | episode.mineBadge, 아래 p=community.newPostsHeading으로 폴더/84일 집계와 구분 |
| `#profileEpisodesStatus`, `#profileEpisodesRetry` | loading/empty role=status, 오류 role=alert; 재시도 button. busy일 때 재시도 disabled |
| `[data-profile-post=postId]` | article, 내부 제목 h3·게시일 time·코멘트 p·상태 p·사유 p(값 있을 때)·액션 순. 본문 text만, 줄바꿈 허용 |
| `[data-profile-withdraw=sessionId]` | button type=button, episode.share.withdraw, 제출 중 disabled/aria-busy. 모든 폭 텍스트 아래 액션; 행 액션은 flex-wrap로 좁은 폭도 넘침 없음 |
| `#profileEpisodesMsg` | role=status aria-live=polite, 현재 작업의 성공/실패만. 동일 ID는 패널당 하나 |
| `#profileTrailsLink` / `#profileCommunityLink` | 각각 log.html=nav.trails / community.html#my-shares=nav.community. 키보드 탐색 가능. 빈 상태에서도 다음 행동 제공 |

폴더 기존 행은 390 세로·481 이상 가로 약속을 유지하되 실제 narrow 내부 폭에서 overflow가 생기면 Profile CSS의 profileFolders 범위 내 세로 재배치로 해결하고 해당 폭의 shareSw 약속을 함께 대조한다. 나머지 계정/이름/요약 구조는 재배치하지 않는다. 새 CSS는 --surface/--bg/--line/--ink/--muted/--radius-card/--radius-pill/--font-body/--font-mono만 사용하고 기존 간격 스케일·44px 액션 높이·min-width:0을 따른다. JSX style·dangerouslySetInnerHTML·새 토큰·일괄 pill 변경 금지.

### 6.1 문구/i18n 전수 재사용

신규 키·사전 수정 없음. 다음 키의 en/ja 기존 값도 재사용하며 한국어 하드코딩 금지.

| 키 | 한국어 값 / 사용 |
| --- | --- |
| community.mySharesLink / community.myShares | 내 공유 폴더 관리 / 내 폴더 공유 |
| community.public / community.autoSync / community.republish | 공개 / 자동 연동 / 다시 게시 |
| community.hidden / community.shareTitle | 운영자가 숨김 / 공개 제목 |
| home.loading / home.catLoadFailed / home.catEmpty | 불러오는 중… / 분류를 불러오지 못했어요 / 아직 분류가 없어요 |
| episode.mineBadge / community.newPostsHeading | 내 기록 / 새 연습 게시물 |
| episode.loading / episode.emptyAll | 게시물을 불러오는 중… / 아직 공유된 연습 기록이 없어요. 첫 번째 기록을 공유해 보세요! |
| episode.retry / episode.defaultTitle | 다시 시도 / 연습 기록 |
| episode.share.withdraw / episode.share.withdrawConfirm | 공유 중지 / 이 연습 기록의 공유를 중지하시겠습니까? (커뮤니티 피드에서 숨겨집니다) |
| episode.share.withdrawn / episode.share.withdrawFailed | 공유가 중지되었습니다. / 공유 중지에 실패했습니다. |
| episode.share.published / episode.share.paused | 공유 중 / 플랜 변경으로 공개 중지 |
| episode.share.hidden / episode.share.unknownResult | 운영자에 의해 숨김 처리됨 / 결과를 확인할 수 없습니다. 다시 조회해 주세요. |
| episode.share.stateError / episode.share.reasonPrefix | 공유 상태를 불러오지 못했습니다. / 사유: {reason} |
| episode.err.gone / community.err.generic | 삭제되었거나 존재하지 않는 게시물입니다. / 요청을 처리하지 못했어요 |
| community.err.upgrade / community.err.nameRequired | Pro로 업그레이드하면 쓸 수 있어요 / 커뮤니티 이름을 먼저 정해 주세요 |
| community.err.banned / community.err.autosyncOff / folder.err.gone | 쓸 수 없는 단어가 들어 있어요 / 설정에서 '연습 리스트 공유 자동 연동'을 먼저 켜 주세요 / 더 이상 공개되지 않은 폴더예요 |
| nav.home / nav.trails / nav.community | ⌂ HOME / TRAILS / COMMUNITY |

## 7. 검증·가드↔단언 표

새 단언은 `test/e2e/layout/profile.spec.js`에 작성한다. 기존 PF1/PF2 layout 상태에도 관리 API mock을 명시하고 기본 unknownApi={} 응답을 PF3 성공 fixture로 사용하지 않는다. **아래 가드는 예정 앵커**이며 행 번호/실제 Red·Green은 구현 결과에 기록한다. 기존 대응 단언은 §2와 SR-06/07, EpisodeLogApiTest:108을 참고할 뿐 새 검증을 대신하지 않는다. 임의 sleep/항상 참 단언/설정한 mock만 확인하는 테스트 금지.

| ID / 준비·실행 | 기대 결과·잡아야 할 버그 | 프로덕션 가드 ↔ 실패해야 할 단언 |
| --- | --- | --- |
| PF3-01 guest/embedded/me null·불일치/정상 me로 진입 | 앞 4조건 API 0·패널 없음, 정상만 두 패널/기존 이름·요약 유지 | ProfilePage mount/me 조건 ↔ 관리 GET 횟수·DOM 0/1 |
| PF3-02 폴더 0·GET 500·일부 share 500 후 retry | 빈/전체 오류/행 미확인 구분·성공 행 보존·실패 행 쓰기 0 | MySharesPanel loading/행 조회 오류 상태 ↔ 상태 문구·disabled·PUT 0 |
| PF3-03 free+publicName=null 공개 폴더 off·비공개 on | off PUT={isPublic:false} 1회·성공 false, on은 upgrade·PUT 0 | MySharesPanel 공개 방향별 유료 가드 ↔ payload·요청수·aria-checked |
| PF3-04 공개/자동연동/재게시 같은 행 동일 틱 연타·다른 행 | 같은 행 첫 mutation 1회·다른 행 독립·409 rollback | category별 ref lock+현재 rollback ↔ 실제 route 요청수·행 값·에러 |
| PF3-05 폴더 토큰 대기 A→B·동일 uid 재로그인·지연 GET/PUT resolve/reject | 전송 전 abort는 PUT 0; 이미 전송된 A 응답은 B/새 세대의 행·draft·error·busy 변경 0 | signal+identity/작업 객체+finally 소유권 ↔ B 값·새 lock 유지·전송 0 |
| PF3-06 개별 21개/중복 sessionId/반복 next/2페이지 500 | 20+1 전수·중복 1행·루프 종료/오류·retry cursor=null | 훅 page shape/visited/seq ↔ 행 수·요청 cursor 순서·오류·완료 여부 |
| PF3-07 published/paused/hidden+withdrawn/withdrawn/card=null/unknown | 우선순위·철회 가능 조건·미지 상태 안전 표시. canRepublish=true hidden도 게시 UI 없음 | 새 패널 상태 우선순위 ↔ 배지·철회 버튼 수·POST 0 |
| PF3-08 confirm 취소/수락 동일 틱 연타/free 사용자 | 취소 DELETE 0; 수락 DELETE sessionId 1회, 원본 삭제 경로 호출 0 | 행 ref lock+confirm+무티어 철회 ↔ 요청 method/path/횟수 |
| PF3-09 DELETE ok 뒤 GET deferred→성공/실패, ok=false | 즉시 옛 title/comment/card 제거·재조회 전 재게시 추정 0·실패해도 복원 0; ok=false 성공 문구 없음 | removeShare seq/임시 canRepublish=false ↔ DOM 옛 텍스트 0·오류/재시도. 같은 spec의 기존 TRAILS 카드 subcase에서 GET 보류 중 재게시 버튼 없음→서버 true 후 활성, false 후 비활성/없음 |
| PF3-10 철회 전 지연 2페이지 응답을 철회 후 release | 철회/새 eligibility를 옛 GET이 덮지 않음, SR-06/07 유지 | 훅 globalReqSeq+identity ↔ response.finished 후 옛 제목/철회 버튼 0 |
| PF3-11 개별 토큰 대기·DELETE/GET 중 A↔B/같은 uid 재로그인·unmount | B/새 세대 캐시·msg·lock 오염 0, 전송 전 취소 DELETE 0, TRAILS 재진입은 새 GET | 패널 mounted+generation+controller·훅 callback 세대 ↔ 현재 계정 행·msg·요청 수·새 작업 lock |
| PF3-12 긴 한/영/일 제목·코멘트·사유 XSS, HOME/COMMUNITY/TRAILS 왕복 | text 렌더·스크립트 0·기존 selectors/폴더 title/autosync/재게시/SR-06/07 보존·재진입 최신 상태 | JSX text/기존 href/mount 재조회 ↔ sentinel DOM·호출 payload·최종 상태 |
| PF3-L empty/loading/error/partial/published/paused/hidden/withdrawn/longText × 4폭 | G0~G8·A1 실패 0, 현재 계정·프로필 폼 회귀 없음 | DOM 배치 그룹/긴 텍스트 CSS ↔ checkLayout fails=[] |
| PF3-API 기존 격리 PostgreSQL API 회귀 | B의 A 세션 DELETE=404·DB 무변경; A 철회 뒤 B 피드 비노출·원문 삭제·멱등, 공개 폴더 비공개 뒤 B 접근 불가 | 기존 서버 소유권/공개 가드 ↔ 기존 Kotlin 단언·통합 증거. mock 화면 통과로 대체 금지 |

### 7.1 Q표 — 구현 후 PNG 직접 열람하여 결과/PF-3.md에 기록

현재 모든 칸 미실행. 4폭 각 상태와 longText 다크 1장 이상. ○/△(사유)/×로 판정, × 수정 후 재캡처. 픽셀 스냅샷 비교 금지.

| 질문 | 390 | 768 | 1150 | 1280 | dark |
| --- | --- | --- | --- | --- | --- |
| Q1 가장 중요한 한 가지·강한 버튼 밀집 없음 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q2 같은 위계 여백 균형·큰 빈 덩어리 없음 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q3 제목·본문·액션 기준선 정합 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q4 크기·굵기·명도로 위계 구분 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q5 빈 상태와 다음 HOME/TRAILS 행동 명확 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q6 390 의미 순서·768 어중간한 열 없음 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q7 파랑 작은 면적·주황 오용 없음 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q8 기존 pill/카드 곡률·1px 선 조화 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |
| Q9 다크 경계·글자 대비 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |

## 8. 실행 명령·완료 체크리스트 (실제 결과는 진행 PF §11)

- [ ] 시니어 표적 `npx playwright test test/e2e/layout/profile.spec.js --grep 'PF3-0[59]'`: 해당 가드 전 의도 Red → 구현 후 Green 1~2개. 컴파일/환경 실패는 제품 Red로 세지 않음.
- [ ] `npm run build`: tsc/Vite 성공. 신규 7파일·핵심 5파일/700줄 이내 구현, 소유권/취소/오류/배치 표 이행.
- [ ] 주니어 `npx playwright test test/e2e/layout/profile.spec.js`: PF1/PF2 보존·PF3-01~12/L 전수 Green.
- [ ] `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/profile.spec.js`: 지정 상태×4폭+다크, G/A1 실패 0·Q1~Q9 PNG 판정.
- [ ] `npx playwright test test/e2e/layout/shell.spec.js test/e2e/layout/settings.spec.js test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/i18n-lang.spec.js test/e2e/xss.spec.js`: 기존 7 spec·SR-06/07 유지. 다른 spec 변경 필요 시 파일/원인/규모 승인 관문으로 복귀.
- [ ] `node --test test/auth-races.test.js`, `npm test`: 인증/기존 공용 API 회귀 성공.
- [ ] `./gradlew test --tests 'ulevelp.community.*' --rerun-tasks`: Testcontainers 격리 로컬 DB·소유권/철회/페이지/공개 비노출 회귀. 원격 DB 금지.
- [ ] `./gradlew test --rerun-tasks`: 최종 백엔드 전체 회귀, 미연결 DB로 skip된 검증을 통과로 표시하지 않음.
- [ ] `PUBLIC_DIR=/tmp/ulp-ktor-smoke-pf3 PORT=3001 ./gradlew run`: 기존 개발 운영 안내대로 격리 정적 루트 준비 후 `curl -i http://127.0.0.1:3001/profile.html`=200·React 직접 진입/reload 확인, 서버 종료. 이 smoke는 OAuth/DB 통합 아님.
- [ ] 실제 로컬 서버+격리 DB의 A/B 인증 UI 여정: A 폴더/개별 철회→B 새 조회 비노출, B의 A ID 직접 수정 404·DB 무변경. 환경 없으면 차단/미검증을 결과에 명시하고 AC-8 통합 완료 금지.
- [ ] `git diff --check`, `git diff --stat -- frontend/ test/`, `git status --short`: 파일/규모·사용자 문서 보존·UTF-8 BOM 없음/LF 확인.
- [ ] 결과/PF-3.md에 실제 명령·대상 커밋·Red/Green·가드↔단언 file:line·Q표·차이·미실행 기록. 정적 추적을 실제 변이 검사로 보고하지 않음.
- [ ] 게시가 별도 승인되면 4단계 주니어가 commit/push/main PR·최신 head CI·CI 중/종료 후/최종 리뷰를 각각 조회·판정 기록. 현재 로컬 구현 승인은 게시 승인 아님. 머지·배포 금지.
