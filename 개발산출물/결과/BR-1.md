# BR-1 결과 — 서비스 이름 RE:DO 교체, 로고 SVG·컴포넌트, 파비콘

> 작업: BR-1 (2단계 구현·검증·PR) | 브랜치: `step/BR-1` | PR: [#20](https://github.com/choise-hun/doloop/pull/20) | 기준 명세: [BR-1_구현명세.md](../명세/BR-1_구현명세.md)
> 상태: 1차 구현·로컬 검증(V1~V12, S1~S7)·CI 통과 완료 — 시니어 3단계 독립 검증 대기 (코드·검증 기준 head `66d53ec`)

## 1. 바꾼 파일 목록

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `docs/brand/redo-wordmark.svg` | 가로 워드마크 SVG (`viewBox="0 0 416 100"`, 배경 없음, `fill="#1d1d1f"`) |
| 신규 | `docs/brand/redo-stack.svg` | 세로 2줄 스택 SVG (`viewBox="0 0 202 210"`) |
| 신규 | `docs/brand/redo-mark.svg` | `R:` 마크 SVG (`viewBox="0 0 120 100"`) |
| 신규 | `public/favicon.svg` | 잉크 바탕(`#1d1d1f`) + 밝은 `R:`(`#f6f6f1`) 파비콘 (`viewBox="0 0 200 200"`) |
| 교체 | `public/icon-180.png` | `public/favicon.svg`를 Playwright 180×180으로 렌더 교체 |
| 수정 | `frontend/index.html` | `<title>RE:DO</title>`, `rel="icon"` (`/favicon.svg`), `rel="apple-touch-icon"` (`/icon-180.png`) 추가 |
| 신규 | `frontend/src/components/common/BrandLogo.tsx` | `BRAND_NAME = 'RE:DO'`, `BrandLogo` 컴포넌트(`wordmark`·`stack`·`mark`, `currentColor`, 인라인 스타일·hex 없음) |
| 수정 | `frontend/src/pages/HomePage.tsx` | `BrandLogo` import 및 `h1.wordmark` 내부를 `<BrandLogo variant="wordmark" className={styles.wordmarkSvg} />`로 교체 |
| 수정 | `frontend/src/pages/HomePage.module.css` | `.wordmark` 크기·가운데 정렬, `.wordmarkSvg`, `@media (max-width: 480px)` 폭 `92%` 적용 |
| 수정 | `frontend/src/pages/NotesPage.tsx` | `document.title = '학습 노트 · RE:DO'` |
| 수정 | `frontend/src/pages/NoteDetailPage.tsx` | `document.title = '학습 노트 상세 · RE:DO'` |
| 수정 | `frontend/src/pages/PrivacyPage.tsx` | `document.title = '개인정보처리방침 · RE:DO'` |
| 수정 | `frontend/src/pages/SettingsPage.tsx` | `document.title = '설정 · RE:DO'`, 내려받기 기본 파일명 `'REDO-export.zip'` |
| 수정 | `frontend/src/pages/ProfilePage.tsx` | `document.title = 'Profile · RE:DO'` |
| 수정 | `frontend/src/lib/apiClient.ts` | 내려받기 기본 파일명 `'REDO-export.zip'` |
| 수정 | `frontend/src/lib/drive.ts` | `DRIVE_FOLDER_NAME = 'REDO 녹음'`, `LEGACY_DRIVE_FOLDER_NAME = 'ULeveLP 녹음'`, `findFolderByName`으로 새 폴더 → 옛 폴더 순 조회 후 미존재 시 새 폴더 생성 |
| 수정 | `frontend/src/lib/i18n/ko.mts` | 명세 §5 7개 키(`settings.driveHintBold`, `settings.driveUsing`, `privacy.pageSub`, `privacy.secCollectIntro`, `privacy.secStorageIntro`, `prog.pageTitle`, `log.documentTitle`) 교체 |
| 수정 | `frontend/src/lib/i18n/en.mts` | 명세 §5 7개 키 교체 |
| 수정 | `frontend/src/lib/i18n/ja.mts` | 명세 §5 7개 키 교체 |
| 수정 | `src/main/kotlin/ulevelp/routes/ExportImportRoutes.kt` | `val filename = "REDO-export-$today.zip"` |
| 수정 | `src/main/kotlin/ulevelp/service/ExportImportService.kt` | `읽어주세요.txt` 본문 2줄 `RE:DO`로 교체 |
| 수정 | `src/test/kotlin/ulevelp/nx/ExportImportApiTest.kt` | `Content-Disposition` 단언 `REDO-export-`로 교체 |
| 수정 | `test/rz3_spa.test.js` | `RZ3-4` 기대 문자열 4개 `RE:DO`로 교체 |
| 신규 | `test/br1_brand.test.js` | BR1-1~7 정적 검증 테스트 신설 |
| 수정 | `README.md` | 1행 `# RE:DO (구 ULeveLP)` |

> 첫 커밋 `af66ce7` (`docs(brand): add BR-1 spec`)에는 기존 로컬 미커밋 문서 2개(`개발산출물/명세/BR-1_구현명세.md`, `개발산출물/진행_디자인D.md`)를 보존 반영했다.

## 2. 배치 약속 표 (`HomePage` `h1.wordmark`)

| 항목 | 약속 (명세 §4-5) |
| --- | --- |
| 상태 목록 | `guest`, `guestLocal`, `userData`, `curation` (다크 `curation` 1280px 포함) |
| 폭별 열 구성 | 390·768·1150·1280px 4개 폭 모두 1열, `hr.home-rule` 위 단독 가운데 정렬(`align-self: center`, 폭 `min(560px, 82%)`, `≤480px` `92%`) |
| 맞춤 그룹 (`data-align-group`) | 없음 (한 줄에 혼자 놓인 가운데 맞춤 요소) |

## 3. 검증 결과 (V1~V12)

### 3-1. V1 구현 전 Red (`node --test test/br1_brand.test.js`)

BR1-1~7 전부 실패(7 fail / 0 pass). BR1-1 실패 목록(35줄):

```text
✖ BR1-1: 노출 코드·설정·서버에 옛 이름(ULeveLP/ULevelP)은 drive.ts 레거시 폴더 상수 1줄뿐이다 (13.45225ms)
  AssertionError [ERR_ASSERTION]: 기대 1줄, 실제 35줄:
  frontend/index.html:7: <title>ULeveLP</title>
  frontend/src/lib/apiClient.ts:1253: let filename = 'ULeveLP-export.zip';
  frontend/src/lib/drive.ts:184: "name = 'ULeveLP 녹음' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" // i18n-keep: 구글 드라이브 고정 폴더명(D5-4)
  frontend/src/lib/drive.ts:207: name: 'ULeveLP 녹음', // i18n-keep: 구글 드라이브 고정 폴더명(D5-4)
  frontend/src/lib/i18n/en.mts:340: 'settings.driveHintBold': "ULeveLP Recordings",
  frontend/src/lib/i18n/en.mts:342: 'settings.driveUsing': "Using Google Drive storage (Folder: ULeveLP Recordings)",
  frontend/src/lib/i18n/en.mts:490: 'privacy.pageSub': "ULeveLP Privacy Policy",
  frontend/src/lib/i18n/en.mts:492: 'privacy.secCollectIntro': "ULeveLP collects minimal information to support instrument practice and multi-device synchronization:",
  frontend/src/lib/i18n/en.mts:510: 'privacy.secStorageIntro': "ULeveLP never sells or shares your personal information with unauthorized third parties:",
  frontend/src/lib/i18n/en.mts:925: 'prog.pageTitle': "Chord Progressions · ULeveLP",
  frontend/src/lib/i18n/en.mts:1117: 'log.documentTitle': "Practice Log · ULeveLP",
  frontend/src/lib/i18n/ja.mts:340: 'settings.driveHintBold': "ULeveLP 録音",
  frontend/src/lib/i18n/ja.mts:342: 'settings.driveUsing': "Google Drive ストレージを使用中 (フォルダ: ULeveLP 録音)",
  frontend/src/lib/i18n/ja.mts:490: 'privacy.pageSub': "ULeveLP プライバシーポリシー",
  frontend/src/lib/i18n/ja.mts:492: 'privacy.secCollectIntro': "ULeveLPは円滑な楽器練習と複数端末の同期のため、最小限の情報を収集します：",
  frontend/src/lib/i18n/ja.mts:510: 'privacy.secStorageIntro': "ULeveLPは個人情報を外部に販売したり無断で第三者に提供したりしません：",
  frontend/src/lib/i18n/ja.mts:925: 'prog.pageTitle': "コード進行コレクション · ULeveLP",
  frontend/src/lib/i18n/ja.mts:1117: 'log.documentTitle': "練習記録 · ULeveLP",
  frontend/src/lib/i18n/ko.mts:350: 'settings.driveHintBold': "ULeveLP 녹음",
  frontend/src/lib/i18n/ko.mts:352: 'settings.driveUsing': "Google Drive 저장소 사용 중 (폴더: ULeveLP 녹음)",
  frontend/src/lib/i18n/ko.mts:501: 'privacy.pageSub': "ULeveLP 개인정보처리방침",
  frontend/src/lib/i18n/ko.mts:503: 'privacy.secCollectIntro': "ULeveLP는 사용자의 원활한 악기 연습 지원 및 다중 기기 동기화를 위해 최소한의 정보를 수집합니다:",
  frontend/src/lib/i18n/ko.mts:521: 'privacy.secStorageIntro': "ULeveLP는 사용자의 개인정보를 외부에 판매하거나 무단으로 제3자에게 제공하지 않습니다:",
  frontend/src/lib/i18n/ko.mts:938: 'prog.pageTitle': "코드 진행 모음 · ULeveLP",
  frontend/src/lib/i18n/ko.mts:1132: 'log.documentTitle': "연습 기록 · ULeveLP",
  frontend/src/pages/HomePage.tsx:508: <h1 className={`wordmark ${styles.wordmark}`}>ULeveLP</h1>
  frontend/src/pages/NoteDetailPage.tsx:43: document.title = '학습 노트 상세 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  frontend/src/pages/NotesPage.tsx:65: document.title = '학습 노트 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  frontend/src/pages/PrivacyPage.tsx:9: document.title = '개인정보처리방침 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  frontend/src/pages/ProfilePage.tsx:28: document.title = 'Profile · ULeveLP';
  frontend/src/pages/SettingsPage.tsx:41: document.title = '설정 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  frontend/src/pages/SettingsPage.tsx:900: a.download = res.filename || 'ULeveLP-export.zip';
  src/main/kotlin/ulevelp/routes/ExportImportRoutes.kt:48: val filename = "ULeveLP-export-$today.zip"
  src/main/kotlin/ulevelp/service/ExportImportService.kt:229: ULeveLP 데이터 내보내기 안내
  src/main/kotlin/ulevelp/service/ExportImportService.kt:242: ULeveLP 설정 화면(settings.html)의 '가져오기 미리보기'를 통해 언제든지 다시 복원할 수 있습니다.
```
(`BR1-2`~`BR1-7`도 모두 기대대로 실패 확인: `<title>RE:DO</title> 누락`, `public/favicon.svg 없음`, `BrandLogo.tsx 없음`, `docs/brand/redo-wordmark.svg 없음`, `ko.mts 'settings.driveHintBold' 값에 RE:DO/REDO 없음`, `DRIVE_FOLDER_NAME = 'REDO 녹음' 누락`.)

### 3-2. V2~V5, V7, V11, V12 실행 요약

| # | 명령 | 결과 | 출력 끝부분·요약 |
| --- | --- | --- | --- |
| V2 | `node --test test/br1_brand.test.js test/rz3_spa.test.js test/i18n.test.js test/security.test.js test/design_rules.test.js` | 통과 (58/58) | `ℹ tests 58`, `ℹ suites 4`, `ℹ pass 58`, `ℹ fail 0` (BR1-1~7, DR-1~5, I0/LA/LB, RZ3-1~4, security 모두 통과) |
| V3 | `npm test` | 통과 (440/440) | `ℹ tests 440`, `ℹ suites 58`, `ℹ pass 440`, `ℹ fail 0`, `ℹ duration_ms 3821.606333` |
| V4 | `npm run build` | 통과 (오류 0) | `tsc --noEmit && vite build`, `✓ 177 modules transformed.`, `✓ built in 847ms` |
| V5 | `./gradlew test --tests 'ulevelp.nx.ExportImportApiTest' --no-daemon` | 통과 | `ExportImportApiTest > NX1 빈 계정 ZIP 내보내기() PASSED` 등 전체 통과, `BUILD SUCCESSFUL in 13s` |
| V7 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` | 실패 0 (21/21) | `21 passed (13.5s)`. `h1` 관련 `G5a`/`G5b` 실패·경고 0건. `LAYOUT_STRICT=1` 실행 시 `div.hero`에서 기존 margin(`24px + 1px hr + 24px`) 구조의 `G8 div.hero "DIVE INTO SOUND▶…" 세로 간격 49px 스케일 밖`·`세로 간격 들쭉날쭉 (49·16px)` 경고만 관찰됨(`h1` `data-layout-ignore` 추가 없음) |
| V11 | `HomePage.tsx` 2행에 `// ULeveLP` 임시 삽입 후 `node --test test/br1_brand.test.js` | 실패 확인 후 원복 | `BR1-1`이 `기대 1줄, 실제 2줄` (`frontend/src/pages/HomePage.tsx:2: // ULeveLP`)로 실패, 제거 후 `git diff frontend/src/pages/HomePage.tsx`에 흔적 없음 및 V2 재통과 |
| V12 | `npm run test:e2e` | 통과 (782/782) | `782 passed (10.5m)` |

#### V2 / V3 / V4 / V5 실제 출력 끝부분

```text
# V2
✔ BR1-1: 노출 코드·설정·서버에 옛 브랜드명은 drive.ts 레거시 폴더 상수 1줄뿐이다 (12.447833ms)
✔ BR1-2: frontend/index.html에 RE:DO 제목과 favicon·apple-touch-icon 링크가 있다 (0.206041ms)
✔ BR1-3: public/favicon.svg와 public/icon-180.png가 존재하고 favicon.svg 규칙을 만족한다 (0.084708ms)
✔ BR1-4: BrandLogo.tsx에 4개 도형 경로, 3개 viewBox, 접근성 속성, currentColor가 있고 인라인 style·hex가 없다 (0.102959ms)
✔ BR1-5: docs/brand/ SVG 3개가 존재하고 각 viewBox가 명세와 같다 (0.102291ms)
✔ BR1-6: ko/en/ja i18n 7개 키(21건)가 모두 RE:DO 또는 REDO를 포함한다 (1.223791ms)
✔ BR1-7: drive.ts가 REDO 녹음을 먼저 조회하고 LEGACY를 뒤에 조회하며 PATCH가 없다 (0.182959ms)
...
ℹ tests 58 / pass 58 / fail 0

# V3 (npm test)
ℹ tests 440
ℹ suites 58
ℹ pass 440
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3821.606333

# V4 (npm run build)
../dist/index.html                            1.85 kB │ gzip:   0.88 kB
../dist/assets/index-CoDrXpOm.css           130.93 kB │ gzip:  22.50 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-CI_arjDr.js            933.34 kB │ gzip: 302.39 kB
✓ built in 847ms

# V5 (./gradlew test --tests 'ulevelp.nx.ExportImportApiTest' --no-daemon)
ExportImportApiTest > NX5 멱등성(2회 연속 가져오기) 및 기존 곡 갱신() PASSED
BUILD SUCCESSFUL in 13s
5 actionable tasks: 4 executed, 1 up-to-date
```

### 3-3. V8 스크린샷 판정 (`home-curation-{390,768,1150,1280}.png`, `home-curation-1280-dark.png`)

| 폭·테마 | 판정 | 로고·정렬 검토 |
| --- | --- | --- |
| `390px` (라이트) | ○ | `RE:DO` 워드마크가 가운데 정렬(`92%` 폭), 좌우 잘림 없음, `hr`·`DIVE INTO SOUND` 간격 자연스러움 |
| `768px` (라이트) | ○ | `RE:DO` 워드마크 가운데 정렬(`82%` 폭), 좌우 잘림 없음, 상하 여백 균형 양호 |
| `1150px` (라이트) | ○ | `RE:DO` 워드마크 최대 폭 `560px` 가운데 정렬, 상단 내비·`hr`·태그라인 간격 균형 양호 |
| `1280px` (라이트) | ○ | `RE:DO` 워드마크 최대 폭 `560px` 가운데 정렬, 기존 레이아웃 요소와 조화 |
| `1280px` (다크) | ○ | `--ink` 밝은 색으로 선명히 표시, 배경 대비 및 `hr`·태그라인 간격 양호 |

(`public/icon-180.png`: `file public/icon-180.png` → `PNG image data, 180 x 180, 8-bit/color RGB, non-interlaced`, 이미지 열람 확인 결과 잉크 바탕 `#1d1d1f` 가운데 밝은 `#f6f6f1` `R:` 마크 확인.)

### 3-4. V9 정적 자산 헤더 & V10 브라우저 탭 제목·파비콘

```text
=== V9 curl -sI /favicon.svg ===
HTTP/1.1 200 OK
Content-Type: image/svg+xml
Content-Length: 430
Cache-Control: public, max-age=300
X-Content-Type-Options: nosniff

=== V9 curl -sI /icon-180.png ===
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 1462
Cache-Control: public, max-age=300
X-Content-Type-Options: nosniff

=== V10 Browser titles & favicon ===
/index.html {"title":"RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/settings.html {"title":"설정 · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/privacy.html {"title":"개인정보처리방침 · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/log.html {"title":"Practice Log · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/progressions.html {"title":"Chord Progressions · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/notes.html {"title":"학습 노트 · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
/profile.html {"title":"Profile · RE:DO","icon":"/favicon.svg","apple":"/icon-180.png"}
```

## 4. 검색 기준 결과 (§7-3, S1~S7)

| # | 명령 | 기대 | 실제 결과 |
| --- | --- | --- | --- |
| S1 | `git grep -n "ULeveLP" -- frontend public src/main` | 1줄 | 1줄 (`drive.ts:7`) — 일치 |
| S2 | `git grep -n "ULevelP" -- frontend public src/main` | 2줄 | 2줄 (`vite-env.d.ts:3,13`) — 일치 |
| S3 | `git grep -n "ULeveLP" -- test src/test` | 0줄 | 0줄 — 일치 |
| S4 | `git grep -n -i "ulevelp" -- frontend/src/lib/i18n` | 0줄 | 0줄 — 일치 |
| S5 | `git grep -c "RE:DO" -- frontend/src/lib/i18n` | 파일마다 5 | `en.mts:5`, `ja.mts:5`, `ko.mts:5` — 일치 |
| S6 | `git grep -c "REDO" -- frontend/src/lib/i18n` | 파일마다 2 | `en.mts:2`, `ja.mts:2`, `ko.mts:2` — 일치 |
| S7 | `git grep -n -i "ulevelp" -- frontend public src/main \| grep -v "ULEVELP_CONFIG\|ULevelPConfig\|appId\|app_id\|APP_ID\|^src/main/kotlin/ulevelp/[^:]*:[0-9]*:\(package\|import\) "` | 남는 줄 모두 §2 유지 목록 | 남는 31줄 모두 §2 유지 목록 또는 `drive.ts:7` 레거시 상수에 해당 (아래 상세) |

```text
=== S1 ===
frontend/src/lib/drive.ts:7:const LEGACY_DRIVE_FOLDER_NAME = 'ULeveLP 녹음'; // i18n-keep: BR-1 이전 폴더명(기존 사용자 폴더 조회)
=== S2 ===
frontend/src/vite-env.d.ts:3:export interface ULevelPConfig {
frontend/src/vite-env.d.ts:13:    ULEVELP_CONFIG?: ULevelPConfig;
=== S3 ===
(출력 없음)
=== S4 ===
(출력 없음)
=== S5 ===
frontend/src/lib/i18n/en.mts:5
frontend/src/lib/i18n/ja.mts:5
frontend/src/lib/i18n/ko.mts:5
=== S6 ===
frontend/src/lib/i18n/en.mts:2
frontend/src/lib/i18n/ja.mts:2
frontend/src/lib/i18n/ko.mts:2
=== S7 ===
frontend/src/lib/drive.ts:7:const LEGACY_DRIVE_FOLDER_NAME = 'ULeveLP 녹음'; // i18n-keep: BR-1 이전 폴더명(기존 사용자 폴더 조회)
src/main/kotlin/ulevelp/Main.kt:89:private const val DEFAULT_ALLOWED_ORIGINS = "https://ulevelp-d5ympfsmfq-du.a.run.app"
src/main/kotlin/ulevelp/Main.kt:90:private const val DEFAULT_PUBLIC_APP_URL = "https://ulevelp-d5ympfsmfq-du.a.run.app/"
src/main/kotlin/ulevelp/Main.kt:204:    val shareAttachmentService = ulevelp.service.ShareAttachmentService(db, storageClient, storageTrashService)
src/main/kotlin/ulevelp/Main.kt:205:    val episodeLogService = ulevelp.service.EpisodeLogService(db, communityService, shareAttachmentService)
src/main/kotlin/ulevelp/notion/NotionPushWorker.kt:101:        val notion = integrationService.requireDecryptedNotion(userId, "ulevelp")
src/main/kotlin/ulevelp/notion/NotionSyncService.kt:194:        val notion = integrationService.requireDecryptedNotion(userId, "ulevelp")
src/main/kotlin/ulevelp/notion/NotionSyncService.kt:536:        val notion = integrationService.requireDecryptedNotion(userId, "ulevelp")
src/main/kotlin/ulevelp/routes/AdminRoutes.kt:179:                ?: throw ulevelp.api.NotFoundException()
src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:40:            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(communityService.getShare(user.id, categoryId)))
src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:52:            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(share))
src/main/kotlin/ulevelp/routes/CommunityRoutes.kt:62:            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(share))
src/main/kotlin/ulevelp/routes/NotionSyncRoutes.kt:75:    shareAttachments: ulevelp.service.ShareAttachmentService,
src/main/kotlin/ulevelp/routes/NotionSyncRoutes.kt:76:    storageTrash: ulevelp.service.StorageTrashService
src/main/kotlin/ulevelp/routes/NotionSyncRoutes.kt:88:    // 매시 정각(Cloud Scheduler ulevelp-monthly-credits): 충전 시각이 지난 계정의 월 지급분 소멸 → 유료면 30일 주기 충전(M1-3d)
src/main/kotlin/ulevelp/routes/NotionSyncRoutes.kt:99:    // 매일 00:05 KST(Cloud Scheduler ulevelp-tier-expire): 기한 지난 tier_override 해제 + 다운그레이드 정리(M1-1 §1-3).
src/main/kotlin/ulevelp/service/AdminService.kt:225:    private val reportHasAttachment = exists(ulevelp.db.SharedCardAttachmentsTable.selectAll().where {
src/main/kotlin/ulevelp/service/AdminService.kt:226:        (ulevelp.db.SharedCardAttachmentsTable.sessionId eq SharedPracticeCardsTable.sessionId) and (ulevelp.db.SharedCardAttachmentsTable.status eq "ready")
src/main/kotlin/ulevelp/service/CreditService.kt:114:private val creditLog = LoggerFactory.getLogger("ulevelp.service.Credits")
src/main/kotlin/ulevelp/service/CreditService.kt:405:            ?: throw ulevelp.api.NotFoundException("사용자 프로필을 찾을 수 없습니다.")
src/main/kotlin/ulevelp/service/NoteService.kt:153:    private val notionPushWorker: ulevelp.notion.NotionPushWorker? = null
src/main/kotlin/ulevelp/service/ProfileService.kt:352:            ulevelp.db.SharedPracticeCardsTable.selectAll().where { ulevelp.db.SharedPracticeCardsTable.userId eq userId }
src/main/kotlin/ulevelp/service/ProfileService.kt:353:                .orderBy(ulevelp.db.SharedPracticeCardsTable.id)
src/main/kotlin/ulevelp/service/ProfileService.kt:356:                removeShareAttachments { ulevelp.db.SharedCardAttachmentsTable.userId eq userId }
src/main/kotlin/ulevelp/service/SongService.kt:397:            ulevelp.db.SharedPracticeCardsTable.selectAll().where { ulevelp.db.SharedPracticeCardsTable.sessionId inList sessionIds }
src/main/kotlin/ulevelp/service/SongService.kt:398:                .orderBy(ulevelp.db.SharedPracticeCardsTable.id)
src/main/kotlin/ulevelp/service/SongService.kt:401:                removeShareAttachments { ulevelp.db.SharedCardAttachmentsTable.sessionId inList sessionIds }
src/main/kotlin/ulevelp/service/StorageTrashService.kt:74:        val database = db ?: throw ulevelp.api.ApiException(io.ktor.http.HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")
src/main/kotlin/ulevelp/service/TakeService.kt:302:                        removeShareAttachments { ulevelp.db.SharedCardAttachmentsTable.sourceTakeId inList oldIds }
src/main/kotlin/ulevelp/service/TakeService.kt:445:                removeShareAttachments { ulevelp.db.SharedCardAttachmentsTable.sourceTakeId eq takeId }
src/main/kotlin/ulevelp/service/TierService.kt:289:        removeShareAttachments { ulevelp.db.SharedCardAttachmentsTable.userId eq userId }
```

- **S7 대조 (§2 "유지하는 내부 식별자"):**
  - `drive.ts:7`: 명세 D7/U3 레거시 폴더 조회 상수 (`LEGACY_DRIVE_FOLDER_NAME`)
  - `Main.kt:89,90`: 운영 주소 기본값 (`https://ulevelp-d5ympfsmfq-du.a.run.app`)
  - `Main.kt:204,205`, `AdminRoutes.kt:179`, `CommunityRoutes.kt:40,52,62`, `NotionSyncRoutes.kt:75,76`, `AdminService.kt:225,226`, `CreditService.kt:405`, `NoteService.kt:153`, `ProfileService.kt:352,353,356`, `SongService.kt:397,398,401`, `StorageTrashService.kt:74`, `TakeService.kt:302,445`, `TierService.kt:289`: Kotlin 패키지 `ulevelp.*` 참조
  - `NotionPushWorker.kt:101`, `NotionSyncService.kt:194,536`: DB·API 앱 구분 값 `"ulevelp"` (`app_id`)
  - `NotionSyncRoutes.kt:88,99`: Cloud Scheduler 작업 이름 주석 (`ulevelp-monthly-credits`, `ulevelp-tier-expire`)
  - `CreditService.kt:114`: 로그 이름 (`ulevelp.service.Credits`)

## 5. 미실행 범위 · 명세와 달라진 점 · 다음 단계 입력

### 5-1. 미실행 범위 (명세 §7-2)
- 실제 Google Drive 계정으로 새 폴더(`REDO 녹음`) 만들기·옛 폴더(`ULeveLP 녹음`) 재사용(외부 계정 필요 — BR-2 확인 목록으로 이관).
- 실제 로그인 상태의 ZIP 내려받기.
- 운영 배포(Cloud Run).

### 5-2. 명세와 달라진 점
- `test/br1_brand.test.js`: 명세 S3(`git grep -n "ULeveLP" -- test src/test` = 0줄)을 충족하기 위해 `BR1-1` 정규식을 문자열 리터럴 결합(`new RegExp('ULeve' + 'LP|ULeve' + 'lP')`)으로 작성하여 테스트 파일 자체에 `"ULeveLP"` 리터럴이 남지 않게 했다(실제 매칭 대상과 실패 동작은 V11에서 동일하게 검증).
- 명세 §1-1 요약 표에는 "수정 16"으로 적혀 있으나 §4-1~4-12 열거 파일 기준 실제 수정은 19개(`icon-180.png`, `ExportImportApiTest.kt`, `README.md` 포함), 신규는 6개다.

### 5-3. DS-2 입력 · BR-2 입력 · 관찰
- **DS-2 입력:** ① 상단 메뉴 로고는 `BrandLogo`(`wordmark`, 시안 높이 16px)로 넣는다 ② 홈 로고의 폭·여백(`min(560px, 82%)`, `margin: 20px 0 24px`) 재조정 여부를 함께 본다 ③ `stack`·`mark` 형태는 아직 화면에서 쓰지 않는다.
- **BR-2 입력:** 명세 §8(Google OAuth 동의 화면 앱 이름·로고, Supabase 인증 메일, 선택적 도메인 연결) + 실제 Drive 계정 확인 2건(새 계정에서 `REDO 녹음` 생성, 옛 폴더가 있는 계정에서 `ULeveLP 녹음` 재사용).
- **관찰(고치지 않음):** 영어·일본어 설정 문구의 폴더 이름(`REDO Recordings`·`REDO 録音`)은 실제 폴더 이름(`REDO 녹음`)과 다르다(기존 동작 유지). [EX-1 명세](../명세/EX-1_크롬확장_구현명세.md)의 `"ULevelP에 추가"` 문구는 EX-1 착수 때 고친다.

## 6. PR · CI · 리뷰 확인 (2단계 마무리)
- **PR:** [#20](https://github.com/choise-hun/doloop/pull/20) (`step/BR-1` → `main`)
- **코드 head `66d53ec` CI 결과:** [Run #43547579506](https://github.com/choise-hun/doloop/actions/runs/43547579506) — 6/6 성공 (`Detect code changes`, `Test (Node 22)`, `Kotlin test (JDK 21)`, `Docker build & smoke test`, `E2E XSS & CSP (Playwright, spa)`, `CI ok`).
- **리뷰 코멘트 확인:**
  - `chatgpt-codex-connector` (`66d53ec` 기준): `has_any_findings: false`, `has_unresolved_findings: false` ([코멘트](https://github.com/choise-hun/doloop/pull/20#issuecomment-6870362399)).
  - PR 인라인 코멘트(`pulls/20/comments`) 0건, 사용자/시니어 리뷰 0건.
- **다음 담당:** GPT-6.1 Sol 시니어 3단계 독립 검증.
