# AV-1 — M1·M2 기존 기능 사용 가능성 검수

- 검수일: 2026-11-08, mac / GPT·Codex. 앱 코드 기준 `b0aa818`(문서 선행 `b5a7561`과 앱 코드 동일), 브랜치 `audit/av1-usability`.
- 범위: 기존 기능의 사용 경로·권한·입력→저장→조회·실패 조사와 실행. 앱 코드·API·스키마·운영 데이터 변경 없음. 결함 수정은 AV-2, 수정 후 실제 사용자 전체 여정·운영 인수는 AV-3.
- 결론: 기존 공유 폴더·84일 집계·큐레이션·재생목록·티어/크레딧 서버는 재사용 후보다. 로컬 API/DB 통합 80개와 mock 화면 39개가 통과했지만 AV-F1·AV-F2가 별도 재현돼 서비스 검수 통과로 판정하지 않는다. 독립 커뮤니티·개별 세션 게시물·프로필은 신규 요구다.
- 진행·승인 근거: [진행 기록](../진행_AV1_사용가능성검수.md). 요구사항은 [기존 명세](../../계획/앱_명세.md)와 [확장 요구사항](../요구사항_명세_초안.md) 참조.

## 1. 실행 환경과 증거 수준

| 항목 | 실제 확인 |
| --- | --- |
| 로컬 환경 | Node v24.16.0, Docker 29.5.3. 기존 Gradle JVM toolchain 21 및 기존 패키지 사용, 설치/의존성 변경 없음 |
| DB | 처음 Docker 소켓 없음 → `open -a Docker` → `docker info` 성공. 기존 `PostgresTestContainer.kt:25`가 `postgres:16-alpine`을 loopback 임의 포트에 생성하고 종료 시 삭제. 외부 DB 주소를 받지 않음 |
| 서버 통합 | 기존 Ktor `testApplication`에 실제 라우트·서비스·마이그레이션·PostgreSQL 연결. 테스트 JWT 서명/검증, Gemini·YouTube·스토리지 등 외부 연동은 fake/테스트 서버. 근거 `src/test/kotlin/ulevelp/support/ApiTestSupport.kt:297`, `src/test/kotlin/ulevelp/db/PostgresTestContainer.kt:25` |
| 브라우저 | `npm run build` 산출물을 Node SPA 서버로 서빙. 기존 Playwright는 :3000, 추가 재현은 `PORT=3001 node server.js`. Supabase 인증·API·YouTube player는 mock. 실제 Ktor+DB에 브라우저를 연결한 검증과 구별 |
| 운영 | 2026-11-08 19:50 KST경 읽기 전용 조회. `ulevelp-00014-g5p`, 이미지 `server:15aea38` 확인. health 200, 비인증 curation 401. 실제 로그인/콘텐츠/쓰기 여정 미검증 |

## 2. 기능별 네 단계 판정

아래 통합의 “통과”는 위 테스트 호스트+격리 DB 범위다. 모든 행의 운영 사용자 여정은 미검증이며, health·인증 경계만으로 승격하지 않는다. 화면 연결의 mock 통과도 별도로 표시한다.

| 기능 | 구현 근거(file:line) | 화면 연결·진입 | 통합 검증 | 운영 확인 | 분류·다음 범위 |
| --- | --- | --- | --- | --- | --- |
| 공개 이름 | `CommunityService.kt:336`, `CommunityRoutes.kt:99` | TRAILS→커뮤니티 이름 배너 또는 설정→커뮤니티, `PublicNameForm.tsx:33`; CM-10 mock 통과 | G2·G2b 통과: 이름 필요·형식·중복·7일 제한 | 로그인 미검증 | 재사용. 공개 이름과 displayName 분리 유지 |
| 폴더 게시·조회 | `CommunityService.kt:238`, `SharedFolderSync.kt:52` | `log.html#community`→모두→내 공유 분류, `LogPage.tsx:481`, `CommunityPane.tsx:172`; CM-11 mock 통과 | G1·G2 통과: 유료 A 게시, 무료 B 목록/상세, 비공개 필드 제외, 남의 분류 404 | 공개 콘텐츠 미확인 | 재사용 + AV-F1 카드 문구 수정 필요 |
| 수동 재게시·자동 연동·철회 | `CommunityRoutes.kt:34`, `CommunityService.kt:294`, `SharedFolderSync.kt:30` | 설정 전체 허용 + 내 공유의 폴더별 스위치/다시 게시, `MySharesPanel.tsx:127`, `SettingsPage.tsx:675` | G3·G3b·G4 통과: 원본 변경/재게시 차이, 전체 끄기·철회/삭제 후 비노출. 폴더별 끄기 단독 브라우저+DB 여정 미실행 | 미검증 | 재사용. AV-3에서 전체/폴더별 끄기·다시 켜기 교차 확인 |
| 상세·구간 재생 링크 | `CommunityService.kt:98`, `FolderSheet.tsx:280` | 홈/커뮤니티 카드→시트→이 구간 연습. CM-1에서 v/a/b/r 링크 검증 | G1·G3 구간/배속 공개 DTO 통과. 실제 YouTube 소리/seek는 미검증 | 실영상 미검증 | 재사용. AV-3에서 실영상·권한별 player 연결 |
| 좋아요·팔로우 | `CommunityService.kt:717`, `CommunityService.kt:854` | 폴더 시트 스위치, `FolderSheet.tsx:60`; CM-3 500 복원·CM-4 상세 지연 폐기·CM-13 로그아웃 숨김 mock 통과 | G5·G7 무료 허용·멱등·자기 대상 400·사용자 공개 응답 통과 | 미검증 | 재사용 + AV-F2 상태 격리 결함. 독립 팔로우 목록은 미연결 |
| 유료 폴더 담기 | `CommunityService.kt:753` | 폴더 시트→통째로 담기→결과 숫자. CM-5 무료 요청 0건, 추가 mock 유료 성공 확인 | G6 통과: B 새 분류/곡 GET 확인, 중복 기존 곡 분류 연결, 무료·분류 한도 실패 | 실제 보관함 미검증 | 재사용. 담기 후 브라우저 보관함 재조회 및 반복 담기 정책은 AV-3/요구 판정 |
| 84일 학습 집계 | `PracticeLogService.kt:26`, `PracticeLogService.kt:68` | TRAILS→커뮤니티→LOG→전체/팔로잉; CM-9 mock 통과 | C4 통과: 동의·공개 이름·유료 필터, 12주/스트릭/주 합계·오늘 곡, 비공개 글자 배제 | 미검증 | 재사용. 개별 세션 게시 피드 완료로 볼 수 없음 |
| 신고·모더레이션 | `CommunityRoutes.kt:146`, `AdminRoutes.kt:163` | 사용자 시트 신고 연결, 추가 mock 201/409 표시 통과. owner 신고 처리/숨김/감사 화면 미연결 | G8 통과: 중복 409, 일반 사용자 403, 숨김 후 목록 제외/상세 404, 처리 감사 | 신고 운영 미검증 | API 재사용 + 운영 화면 보완 필요. API 절차는 §5 |
| 큐레이션·이달의 곡·쇼케이스 | `CommunityService.kt:569`, `AdminRoutes.kt:187` | owner 설정→운영→폴더/항목 저장·공개, 홈/커뮤니티 선반, `OpsPanel.tsx:214`; CM-1·ops 11개 mock 통과 | C1~C3 통과: 초안/공개·월 5곡 제한·월 중복/대체·쇼케이스 유료/자동 연동 조건 | 첫 등록 여부 미확인 | 재사용 + 운영 콘텐츠 확인 필요. 빈 홈/오류 숨김은 AV-O1 |
| 티어·쿼터·관리 권한 | `AdminRoutes.kt:90`, `AdminService.kt:177` | 설정 티어/사용량, 무료 쓰기 안내·운영 섹션 owner 제한. CM-7·12 및 ops 권한 mock 통과 | TierQuotaAdminApiTest 13개: 곡/분류/녹음/Drive 제한·override·비 owner 차단·감사 통과 | 결제/실계정 미검증 | 재사용. 티어 override·크레딧 지급·감사는 API만, 결제는 별도 신규 |
| 크레딧 예약·정산·실패 반환·30일/유예 | `CreditService.kt:171,201,232,446` | 설정 `#credits`, 노트/코드 분석 예상치·부족 안내, `SettingsPage.tsx:624`, `NotesPage.tsx:135` | CreditApiTest 16개 통과: 403/402·원장/작업 무변경·예약/정산/환급 멱등·30일 경계·유예/재가입 | 실과금/스케줄러 미검증 | 재사용. 결제·갱신 webhook은 M4-2 신규; 실제 Gemini 청구 아님 |
| 재생목록 가져오기 | `PlaylistImportService.kt:57,73` | 홈 URL→가져오기 또는 PRACTICE URL→모달→기존/새 분류. CM-6~8 mock 통과 | P1~P6·YP1~YP3 통과: 남은 칸/중복/비공개·남의 분류 404·한도 무변경·외부 오류 | 실제 API key/재생목록 미검증 | 재사용. 실 YouTube API 및 가져온 보관함 화면은 AV-3 |
| AI 노트 Beta·구간·상세/코드 분석 | `NoteService.kt:194,357,599`, `NotesPage.tsx:106` | NOTES/CHORDS 분석·추정치·설정 크레딧 링크, notes-form/range 14개 mock 통과 | NoteApiTest 21개 + ProgressionApiTest 7개 통과. fake Gemini/API 테스트 한정 | 실분석 미검증 | 재사용. 실제 Gemini·영상 분석 정확도/과금은 별도 환경 검증 |

서버 경로·DTO의 파일은 `src/main/kotlin/ulevelp/{service,routes}/`, 화면은 `frontend/src/{components,pages}/`, 테스트는 `src/test/kotlin/ulevelp/` 아래다. 사용자 데이터의 공개·사유 권한 경계는 아래 단언으로 확인했으며 새로운 app_id나 `guitar-practice` fallback을 도입하지 않았다.

## 3. 필수 여정별 입력→저장→조회와 실패 근거

| 여정 | 실행·판정 | 가드 ↔ 확인한 단언 |
| --- | --- | --- |
| 1. A 이름·게시→무료 B 발견·재생·반응 | G1/G2b/G5/G7 통과; 화면은 CM-1/3/10/11 및 추가 팔로우 재현. 실음원 재생 미실행 | `CommunityService.kt:247` 소유 분류·티어·이름 확인 후 공개 사본 작성 → `CommunityApiTest.kt:180` B 목록/상세·YouTube 원래 제목·이메일/사용자 메모/displayName 비포함. G5/G7 PUT/DELETE 반복 count 일치 |
| 2. 유료 B 담기→자기 보관함 | G6 API/DB 통과. 추가 mock에서 imported=2·already=1·skipped=0 표시 | `CommunityService.kt:762` 잠금·재검사, :766 분류 한도 확인 후 쓰기 → `CommunityApiTest.kt:443` GET categories/songs에서 새 분류/2곡/기존 1곡 연결 확인. 분류 한도 실패 시 songs=0 단언. **기존 테스트에는 실패 후 분류 수·공개 cloneCount 불변 단언이 없음**: AV-3 보강 필요. 곡 한도는 전면 실패가 아니라 남는 칸까지 복사/나머지 skippedLimit인 현행 계약 |
| 3. 수동/자동·철회 | G3/G3b/G4 통과; 전체 OFF 후 마지막 공개본 보존·재게시 갱신 | `SharedFolderSync.kt:30` 같은 트랜잭션·소유자/분류 양쪽 필터, `CommunityService.kt:254` 비공개 시 연동 OFF → `CommunityApiTest.kt:305` 추가/구간/삭제 반영·전체 OFF 뒤 미반영, :378 철회 후 B 목록 제외·404 |
| 4. 무료 유예·종료·재구독 | G4와 Credit C4/C5/C7 각 경계 통과. 한 연속 커뮤니티 여정으로 연결한 브라우저 검증은 남음 | G4 DB public/autoSync=false·재구독 자동 재공개 안 됨. Credit C4/C5 시간 주입으로 30일 전 유료·경계 무료·월 만료/구매 유지·재가입 주기/원장 확인. 실제 시간 경과/운영 cron 검증 아님 |
| 5. 동의 집계·비공개 보호 | C4 API/DB 및 CM-9 mock 통과 | `PracticeLogService.kt:68` 동의+이름+실제 유료만, :146 제목 외부 조회 후 렌더 → `CurationApiTest.kt:393` 비동의·무료·이름 없음 제외, 개인 글자 없음·84일 집계 단언 |
| 6. 신고→owner 처리·숨김 | G8 API/DB 통과 + 추가 mock 신고 전송/201·중복 409 안내 | `AdminRoutes.kt:95` 공통 OwnerOnly, `AdminService.kt:177` DB role → `CommunityApiTest.kt:516` 일반 403, owner 조회·PATCH 숨김→B 404/목록 제외, resolve 중복 409·감사 actions 일치 |
| 7. 지연·로그아웃·계정/시트 전환·중복 | CM-4 상세 지연 폐기, CM-13 로그아웃 즉시 숨김, CM-3 좋아요 실패 복원 통과. AV-F2는 실패(§4). A 팔로우 진행 중 재클릭 요청은 1건 | `CurationRows.tsx:42`, `CommunityPane.tsx:39` 읽기에 uid+seq 존재. `FolderSheet.tsx:71` 팔로우 저장에는 seq/uid 확인 없음. CM-13은 **로그아웃 검사로, B 재로그인 중 모든 쓰기 지연 응답의 무오염을 증명하지 않음** |
| 8. 가져오기·쿼터·크레딧·관리 | API 38개(playlist 9+tier 13+credit 16) 통과, 관련 mock 통과 | Playlist P2/P3 남의 분류 404·분류 한도 오류 후 songs 비변경. Credit A1/A2 잔액 부족 작업/원장 없음·A4/A6 실패 전액 반환·반복 1회. owner 경계 401/403/200은 Tier A1. 결제 연결·실제 외부 서비스는 미검증 |

### 취소·외부 I/O 검토

- `DatabaseFactory.kt:123`는 부모 컨텍스트 안에서 트랜잭션 전후 ensureActive. `CommunityService.kt:697` 메타데이터 외부 호출은 DB 트랜잭션 밖이며, 담기 :762에서 티어·공개 상태를 다시 검사한다. `VideoMetaClient.kt:61`은 CancellationException을 재던진다.
- 게시 사본은 DB 커밋 후 제목 보완 I/O가 이어진다(`CommunityService.kt:286` 이후). 클라이언트가 실패로 보더라도 게시 저장 자체가 이미 끝났을 가능성이 있으므로 실패 후 GET 재확인 여정이 필요하다. 이 경계의 취소/네트워크 단절 fault injection은 이번에 실행하지 않았다.
- **테스트 공백:** 선택한 커뮤니티 테스트에는 coroutine 취소/동시 게시·철회/실제 전송 재시도 단언이 없다. 가드 존재를 취소 검증 통과로 적지 않는다. AV-3에서 지연 I/O 도중 철회·계정 전환·취소를 연결해야 한다.

## 4. 결함·관찰 및 다음 수정 범위

| ID·분류 | 재현·영향 | 원인 근거 | 다음 범위 |
| --- | --- | --- | --- |
| AV-F1 / 결함 | 빌드된 홈 `#discover.innerText`에 `// i18n-keep: G3` 포함. 스크린샷에서 카드 제목/부제 대신 개발 주석 문구가 노출됨 | `frontend/src/components/community/CommunityParts.tsx:60,65,70,102,107,111,194` JSX 자식 안 일반 `//` | AV-2: 해당 주석 표현을 정상 JSX 주석/배치로 정리하고 개발 문구가 사용자 텍스트에 없음을 단언. 기존 레이아웃/언어 검증 유지 |
| AV-F2 / 결함 | A 작성자 팔로우 PUT 보류→시트 닫기→B 작성자 폴더→B aria-checked=false→A 응답 해제→B true/팔로잉. A 요청은 중복 클릭에도 1건. 서버 B 팔로우 쓰기 발생을 뜻하지 않음 | `frontend/src/components/community/FolderSheet.tsx:71`의 성공·실패가 현재 folder/owner/uid/seq 검증 없이 setFollow/setMsg. 상세 GET :47에는 seq가 있으나 쓰기에는 없음 | AV-2: 시트/사용자/대상 변경 때 쓰기 결과 무효화. 좋아요 오류·담기 성공·신고 성공 등 :60~134의 동일 패턴까지 함께 조사하고 성공/실패/로그아웃→B 전환 회귀 단언. 이번 검수는 수정 없음 |
| AV-O1 / 현행 UX 관찰 | 홈 선반이 비로그인·빈 데이터·오류 때 전부 사라짐. CM-2 및 코드 확인. 서비스에 콘텐츠가 없는지 호출이 실패했는지 사용자가 구별하기 어려움 | `frontend/src/components/community/CurationRows.tsx:85` | 오류/빈 상태 안내 필요 여부를 화면 요구로 결정. 현행 계약 위반으로 단정하지 않음 |

스크린샷: [B 폴더에 A 팔로우 결과 반영](AV1_팔로우상태오염.png). mock 인증·콘텐츠이며 깨진 외부 썸네일은 이번 기능 결함 판정에 포함하지 않았다. 스크린샷을 직접 열어 주석 노출과 B 시트 팔로잉 표시를 검토했다. 재현 도구/결정적 응답 해제 코드는 [재현 절차](AV1_재현절차.md)에 보존한다.

## 5. 화면 미연결·재사용·신규 요구의 경계

- **재사용:** 원본 분류→공개 사본, 유료 공개·담기/무료 열람·좋아요·팔로우, 수동 재게시·제한 자동 연동, 84일 동의 집계, owner 큐레이션·월 추천, 쿼터·크레딧 원장. 공개 DTO의 의미와 소유권을 보존한다.
- **화면 미연결:** `GET /api/v1/community/follows`와 사용자 공개 페이지 데이터는 서버에 있으나 독립 목록/프로필 페이지가 없다(`CommunityRoutes.kt:159,179`, `App.tsx:32`). 폴더 시트는 사용자 조회를 팔로우 상태에만 쓴다. `apiClient.ts`에는 follows 목록 호출도 연결되지 않음.
- **운영 화면 일부 미연결:** 현 OpsPanel은 크리에이터 지정 + OpsFolders다(`OpsPanel.tsx:27,214`). 신고 조회/처리·사용자 폴더 숨김·공개 이름 초기화·티어 override·크레딧 지급·감사 조회는 관리 API로 수행해야 한다. 기존 관리 API 재사용과 새 화면 작업을 구분해 후속 명세를 작성한다.
- **현재 API 운영 절차:** owner Bearer로 `GET /api/v1/admin/reports?status=open` → 대상 검토 → `PATCH /api/v1/admin/shared-folders/{folderId}` `{hidden:true,hiddenReason,reason}` → `PATCH /api/v1/admin/reports/{reportId}` `{status:"resolved"|"dismissed",reason}` → `GET /api/v1/admin/audit` 및 B 공개 목록/상세 재조회. 실제 운영에는 승인된 계정/콘텐츠가 필요하며 이번에는 로컬 G8에서만 실행했다.
- **신규 요구:** REQ-3 개별 세션 공유/철회·새 게시물 피드·독립 `/community.html`, REQ-4 프로필 `/profile.html`·내 게시물 관리, REQ-5 설정 재구성은 기존 API 존재만으로 완료 처리하지 않는다. 현재 `App.tsx:32`에 해당 새 라우트 없음. 집계 `PracticeLogDto`를 개별 세션 게시물 DTO로 바꾸지 않는다. CH-A/B와 결제 M4-2 역시 별도 구현 범위다.

## 6. 명령·실제 결과

| 명령 | 실제 결과·한계 |
| --- | --- |
| `docker info --format '{{.ServerVersion}}'` | 최초 소켓 없음 → `open -a Docker` 후 29.5.3. 로컬 환경 차단 해소 |
| `npm test` | 373 pass / 0 fail / 0 skip |
| `npm run build` | tsc·Vite 통과. CJS API/config.js 번들/500kB 청크 경고. 수정하지 않음 |
| `./gradlew test --tests 'ulevelp.community.*' --tests 'ulevelp.tier.TierQuotaAdminApiTest' --tests 'ulevelp.credit.CreditApiTest' --tests 'ulevelp.song.PlaylistImportApiTest' --tests 'ulevelp.song.YoutubeDataPlaylistClientTest'` | BUILD SUCCESSFUL. XML 합계 52 tests / failures·errors·skipped 각 0: Community 10, Curation 4, Tier 13, Credit 16, Playlist 6, Youtube client 3 |
| `./gradlew test --tests 'ulevelp.note.NoteApiTest' --tests 'ulevelp.progression.ProgressionApiTest'` | BUILD SUCCESSFUL. XML 28 tests / failures·errors·skipped 각 0: Note 21, Progression 7 |
| `CI=1 npx playwright test test/e2e/community.spec.js test/e2e/ops.spec.js test/e2e/notes-form.spec.js test/e2e/notes-range.spec.js` | 39 passed (37.0s), skip 없음. mock 인증/API·player. 영속 DB와의 화면 통합 아님 |
| `node /tmp/av1-browser.cjs` | AV-F1 visibleComment=true. AV-F2 B false→true / A requests=1. 결함 존재를 단언하는 임시 조사 도구, 기능 통과 테스트 아님 |
| `node /tmp/av1-actions.cjs` | 유료 담기 1회/결과 표시, 신고 `{reason:"spam",detail:"광고 같아요"}`→201 접수 문구→중복 409 안내 확인. mock 결과 |
| `gcloud run services describe ulevelp --region asia-northeast3 --project ulevelp --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'` | `ulevelp-00014-g5p`, `asia-northeast3-docker.pkg.dev/ulevelp/ulevelp/server:15aea38` |
| 운영 `/api/health`, `/api/v1/curation/home` curl GET | 각각 200 `{"ok":true}`, 401 `UNAUTHORIZED`(Authorization 헤더 없음). 비인증에서 공개 목록을 읽을 수 없는 현행 계약 확인 |

실행 시 :3000에는 진행 중인 Playwright 서버가 있어 별도 `node server.js` 시작이 EADDRINUSE로 실패했다. 기존 프로세스를 종료하지 않고 추가 검수 서버를 :3001로 띄워 재현했다. 테스트/빌드 산출물·원시 로그는 로컬 임시 경로이며, 재현 명령·요약·스크린샷만 버전 관리한다.

## 7. 미실행 검증·다음 행동

| 미검증/제한 | 원인 | 다음 행동·담당 단계 |
| --- | --- | --- |
| 실제 브라우저→Ktor→격리 DB의 A/B 연속 전체 여정 | 이번 API 통합은 testApplication, 화면은 mock 인증/API. 실 OAuth/전용 로그인 테스트 계정 연결 안 함 | AV-3: 격리 DB+테스트 인증 가능한 실행 서버를 준비하고 A 게시→B 담기→보관함 화면→철회까지 같은 여정으로 확인 |
| 운영 첫 큐레이션/이달의 곡 등록·로그인 분류 추가(#61) | 인증된 운영 세션/승인 콘텐츠 없음. health·인증 경계 외 조회 불가 | owner 계정으로 현재 등록 여부를 먼저 읽기 확인. 작성은 계정/콘텐츠 범위를 확정한 별도 운영 작업. 계획의 미확인 항목 유지 |
| 실제 YouTube 구간 재생·재생목록 및 Gemini 사용/정산 | 외부 client/player가 fake 또는 mock | AV-3의 승인된 테스트 계정·API key·비용 범위에서 확인. 링크 값·DB 정산 테스트와 구별 |
| 모든 쓰기의 A→로그아웃→B 전환, 폴더별 OFF·재구독의 연속 여정 | 기존 테스트는 상세 GET/로그아웃과 각 서버 경계를 나눠 검증, AV-F2 외 전체 mutation 지연 조합 없음 | AV-2에서 uid+seq/대상 가드 및 회귀 명세, AV-3에서 성공/실패·중복·취소·계정전환 매트릭스 검증 |
| 거절 요청의 DB 전체 불변·취소·동시성 | G6는 songs=0만 단언; 취소/경합 fault injection 없음 | AV-3에서 categories/shared_folders.clone_count/likes/follows/ledger 등 영향 테이블 전후 비교. 오류 단언을 약화하지 않음 |
| 모바일 실기기·배포·결제·월 cron 실운영 | AV-1 범위 밖 | M0-0/AV-3/M4-2 해당 관문 유지. 이번 결과로 완료 처리하지 않음 |

AV-1 조사·검수 결과 기록은 완료다. 알려진 결함과 미연결·미검증을 해소한 서비스 인수 완료는 아니며, AV-2→AV-3 관문을 유지한다.
