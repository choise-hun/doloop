# BR-1 구현 명세 — 서비스 이름 RE:DO 교체, 로고 SVG·컴포넌트, 파비콘

> 작성: 2026-11-14 / Claude(시니어). 상위: [결과/DS-0](../결과/DS-0_디자인결정.md) §1, [진행_디자인D](../진행_디자인D.md) §1·§2, [디자인 규칙](../../docs/rules/frontend-design.md), [정렬 규격](../프론트_정렬규격.md).
> 담당: **[주니어] 구현·검증·PR → [시니어] 3단계 검증(조건이 맞으면 3-P).** Step은 나누지 않는다(§1-1).
> 브랜치 `step/BR-1`, base `main`. 선행: PR #19(DS-1) 머지 뒤 최신 `main`.
> **상태: 사용자 승인 대기.** §0의 U1~U6은 DS-0에 없던 결정이다. 이 명세는 각 항목의 추천안으로 썼다.
> 범위 밖: 상단 메뉴에 로고 넣기·홈의 나머지 디자인(DS-2), 외부 화면의 이름과 도메인 연결(BR-2, 사람), 내부 식별자 이름 변경.

조사 기준: 이 명세의 줄 번호는 `step/DS-1`=`52c32a5`(PR #19 head)에서 확인했다. 작성 시점에 PR #19는 OPEN(CI 통과·머지 가능)이었다. DS-1이 건드린 파일과 BR-1이 건드릴 파일은 겹치지 않는다(`tokens.css`·화면 CSS 6개·`design_rules.test.js` 대 아래 §4). 구현 전에 선택자·문자열로 다시 찾는다.

## 0. 사용자 결정 항목

| ID | 무엇을 정하나 | 추천(이 명세가 따른 값) | 다른 선택 |
| --- | --- | --- | --- |
| U1 | **파일·폴더 이름에 쓰는 표기.** 콜론(`:`)은 Windows 파일 이름에 쓸 수 없고, 브라우저가 내려받을 때 `_`로 바꾼다. Drive 데스크톱 동기화에서도 바뀐다 | 화면에 보이는 이름은 `RE:DO`, 파일·폴더 이름만 `REDO`. 내보내기 파일 `REDO-export-YYYY-MM-DD.zip`, Drive 폴더 `REDO 녹음` | 파일·폴더에도 `RE:DO`를 쓴다(Windows 사용자는 `RE_DO-export-…zip`으로 받는다) |
| U2 | **내보내기 파일 이름은 서버 응답 헤더 값이다.** 계획 10-3은 "서버 계약 변경 없음"이라 적었는데, `Content-Disposition`의 파일 이름과 ZIP 안 안내문 2줄이 바뀐다 | 바꾼다(경로·필드·상태 코드는 그대로, 문자열 3곳과 테스트 단언 1곳) | 서버는 두고 프런트 기본 파일 이름만 바꾼다(내려받는 파일에 옛 이름이 남는다) |
| U3 | **기존 사용자의 Drive 폴더.** 폴더 이름은 코드에 고정돼 있고, 이미 만든 사용자의 폴더는 `ULeveLP 녹음`이다 | 새로 만드는 폴더만 `REDO 녹음`. 찾을 때 새 이름 → 옛 이름 순서로 찾아 옛 폴더를 그대로 쓴다. 이름은 바꾸지 않는다. 기존 사용자는 설정 화면 문구(`REDO 녹음`)와 실제 폴더 이름이 다르다 | ① 옛 폴더를 찾으면 Drive에서 이름도 바꾼다(사용자 Drive에 쓰기 1회 추가) ② 폴더 이름을 아예 바꾸지 않는다(설정 화면 2줄에 옛 이름이 남는다) |
| U4 | **홈의 큰 글자 `ULeveLP`를 무엇으로 바꾸나.** 진행 표는 "새 워드마크"를 DS-2에 적었다 | BR-1에서 홈 큰 글자를 로고 SVG로 바꾼다(컴포넌트가 화면에 붙어야 눈으로 검증된다). DS-2는 상단 메뉴 로고와 홈의 나머지를 맡는다 | BR-1은 글자만 `RE:DO`로 바꾸고 SVG 적용은 DS-2로 미룬다(로고 컴포넌트가 화면 없이 먼저 들어간다) |
| U5 | **파비콘·아이콘 모양.** 지금은 파비콘이 없고(`/favicon.ico` 404), `public/icon-180.png`는 파란 바탕의 옛 그림이며 어디에서도 참조하지 않는다 | 잉크 바탕(`#1d1d1f`) + 밝은 글자(`#f6f6f1`)의 `R:` 조합(시안 "앱 아이콘" 첫 번째). `favicon.svg`를 새로 만들고 `icon-180.png`를 같은 그림으로 교체해 `apple-touch-icon`으로 연결 | `icon-180.png`를 지우고 파비콘만 둔다 |
| U6 | **웹 매니페스트·OG 태그는 지금 코드에 없다**(P11). 새로 넣는 것은 이름 교체가 아니라 기능 추가다 | BR-1에서 만들지 않는다. 매니페스트는 M0-1(앱 통합), OG는 도메인이 정해진 뒤(절대 주소와 1200×630 그림이 필요) | BR-1에 `og:title`·`og:site_name`만 넣는다 |

승인하지 않는 항목이 있으면 그 항목의 "다른 선택"으로 §4의 해당 줄만 바꾼다.

## 1. 판정

### 1-1. Step 분할 — 나누지 않는다

| 기준(협업 설명서 §1.2) | BR-1 |
| --- | --- |
| 파일 수 7개 초과 | **넘는다**(수정 16, 신규 6, 문서 제외). 그중 14개는 문자열 1~7줄 교체이고, 로직이 바뀌는 파일은 `drive.ts`·`BrandLogo.tsx`·`HomePage` 2개다(핵심 로직 5개 이하) |
| 예상 diff 600~700줄 초과 | 아니다(약 300줄, 새 테스트 포함) |
| 사용자 여정 2개 이상 | 아니다("어디서나 이름이 RE:DO로 보인다" 하나) |
| 하한(100~150줄 미만이면 통합) | 이름 문자열(약 120줄)과 로고·파비콘(약 170줄)으로 나누면 둘 다 하한 근처다 |
| 대기능 Step 수 | DS·BR은 이미 6개(DS-0~3, BR-1~2)로 권장 수를 넘었다. 더 나누지 않는다 |

파일 수 상한은 넘지만 나누면 하한에 걸리고 PR·리뷰 왕복만 늘어난다. **한 Step으로 두는 것을 예외로 기록하고 사용자 승인을 받는다.**

### 1-2. 담당 — [주니어]

| 판정 질문 | 답 |
| --- | --- |
| ① 기존 화면의 DOM·클래스·테스트 셀렉터를 바꾸거나 옮기는가 | 홈 `h1` 안의 글자가 SVG로 바뀐다. `h1`과 클래스 `wordmark`는 그대로이고 이 요소를 가리키는 테스트는 없다(P7) |
| ② 기존 화면과 새 화면이 같은 코드를 공유하며 공존하는가 | 아니다 |
| ③ 캐시·요청 경합·에러 구조 같은 암묵 계약에 의존하는가 | 아니다. `ensureFolder`에 조회 1회가 늘 뿐이고 오류 처리는 기존 문구를 그대로 쓴다 |

## 2. 전제 (구현 전 재확인)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/index.html:7` | `<title>ULeveLP</title>`. 같은 파일에 `rel="icon"`·`apple-touch-icon`·`manifest`·`og:` 태그가 **없다** |
| P2 | `frontend/src/pages/HomePage.tsx:508` | `<h1 className={`wordmark ${styles.wordmark}`}>ULeveLP</h1>`. 화면에 서비스 이름이 글자로 나오는 곳은 여기뿐이다 |
| P3 | `frontend/src/pages/HomePage.module.css:2-17` | `.hero`는 `display:flex; flex-direction:column`. `.wordmark`는 글꼴 속성 6개 + `text-align:center; margin:20px 0 24px; color:var(--ink)`. 이 파일에 `.wordmark`의 반응형 덮어쓰기는 없다. 전역 스타일(`frontend/src/styles/`)에 `.wordmark` 규칙이 없다(전역 클래스 이름 `wordmark`는 표시용 이름일 뿐이다) |
| P4 | `frontend/src/components/layout/AppShell.tsx:101-108` | 상단 메뉴 첫 칸은 `t('nav.home')`(HOME) 글자다. 서비스 이름·로고가 없다 → 메뉴 로고는 DS-2 |
| P5 | `frontend/src/pages/` `NotesPage.tsx:65`, `NoteDetailPage.tsx:43`, `PrivacyPage.tsx:9`, `SettingsPage.tsx:41`, `ProfilePage.tsx:28` | `document.title = '… · ULeveLP'` 5곳. 앞의 4곳은 줄 끝에 `// i18n-keep: RZ3-4 소스 문자열 단언`이 있다(한글 포함 줄). `ChordsPage.tsx:161`(`'악기 연습실'`)과 `PracticePage`·`LogPage`·`ProgressionsPage`(i18n 키)는 이름이 없거나 P6에서 다룬다 |
| P6 | `frontend/src/lib/i18n/ko.mts:350,352,501,503,521,938,1132` · `en.mts:340,342,490,492,510,925,1117` · `ja.mts:340,342,490,492,510,925,1117` | 옛 이름이 든 키는 언어마다 7개, 합계 21줄(§5 표). 다른 키에는 없다 |
| P7 | `test/rz3_spa.test.js:56-59,62` | 화면 4개의 `document.title = '… · ULeveLP'` 소스 문자열을 단언한다. 옛 이름을 단언하는 JS 테스트는 이것뿐이다(`test/` 전체에서 `ULeveLP` 검색 4줄). `test/e2e/`에는 이름·`wordmark`·`h1` 단언이 없다 |
| P8 | `test/i18n.test.js:130-148` | LA-1: `frontend/src` 코드 줄에 한글이 있으면 실패한다. `// i18n-keep:` 표시가 있는 줄은 뺀다. LA-2(`:151-168`): 표시의 사유는 2자 이상 |
| P9 | `frontend/src/lib/drive.ts:161-216` | `ensureFolder(preferredId)`: ① `preferredId`가 있으면 `files/{id}?fields=id,trashed`로 확인해 살아 있으면 그 id를 돌려준다 ② 이름 `'ULeveLP 녹음'`으로 검색(`:184`) ③ 없으면 같은 이름으로 만든다(`:207`). 검색 실패는 `t('drive.searchFolderFailed', { status })`를 던진다(`:193`). 폴더 id는 프로필 `driveFolderId`에 저장된다(`:373-376`). `ensureFolder`를 직접 검증하는 테스트는 없다 |
| P10 | `frontend/src/lib/apiClient.ts:1253`, `frontend/src/pages/SettingsPage.tsx:900` | 내려받기 기본 파일 이름 `'ULeveLP-export.zip'` 2곳. 실제 이름은 응답 헤더에서 읽는다(`apiClient.ts:1252-1257`) |
| P11 | `public/`(파일 2개: `config.js`, `icon-180.png`), 저장소 전체 | 웹 매니페스트 파일이 없다. OG 태그가 없다. `extension/` 폴더(크롬 확장)가 없다 — [EX-1 명세](EX-1_크롬확장_구현명세.md)는 미착수다. `icon-180.png`를 참조하는 코드는 없다(`README.md:79` 설명 한 줄뿐) |
| P12 | `vite.config.ts:7`, `Dockerfile:34-36`, `src/main/kotlin/ulevelp/Main.kt:400-428`, `server.js:18-26,236-248` | Vite `publicDir: false`. 정적 파일은 `public/`에 두면 Ktor·Node 서버가 그대로 내보낸다(svg → `image/svg+xml`, png → `image/png`). Docker 이미지가 `public/`을 통째로 복사한다 |
| P13 | `test/security.test.js:444-461` | `public/`의 `.svg`·`.js`와 `frontend/index.html`을 검사한다. 규칙 (a): inline 스크립트·`on*`·`style` 속성 금지. 새 SVG에 `style` 속성·`<style>`·`<script>`를 쓰면 실패한다 |
| P14 | `src/main/kotlin/ulevelp/routes/ExportImportRoutes.kt:48` | `val filename = "ULeveLP-export-$today.zip"` → `Content-Disposition`(`:51-54`) |
| P15 | `src/main/kotlin/ulevelp/service/ExportImportService.kt:229,242` | ZIP 안 `읽어주세요.txt` 본문에 `ULeveLP` 2줄 |
| P16 | `src/test/kotlin/ulevelp/nx/ExportImportApiTest.kt:175` | `cd.contains("ULeveLP-export-")` 단언. 안내문 본문을 단언하는 테스트는 없다(`:181`은 파일 목록만 본다) |
| P17 | `개발산출물/명세/DS_시안.html:459-466,484-506` | 로고 도형 `G`와 배치 `row()`·`build()`. 글자 사이 간격 12, 콜론은 한 변 24 정사각형 2개(y 14·62) |
| P18 | `frontend/src/styles/tokens.css:10,11,13` | 라이트 `--bg:#F0EEEA`, `--surface:#f6f6f1`, `--ink:#1d1d1f` |
| P19 | `test/e2e/layout/home.spec.js:17-34` | 홈 layout spec은 상태 4개(`guest`·`guestLocal`·`userData`·`curation`)와 다크(`curation`)를 본다. **미확인:** 공통 검사 G0~G8이 글자 없는 `h1 > svg`에 새 실패·경고를 내는지는 실행해 봐야 안다(V7) |
| P20 | `frontend/src/components/common/BetaBadge.tsx:1-18` | 공용 컴포넌트는 이름 붙인 export(`export function`)와 `React.ReactElement` 반환형을 쓴다 |

### 유지하는 내부 식별자 (바꾸지 않는다)

| 종류 | 위치 | 값 |
| --- | --- | --- |
| Kotlin 패키지·진입 클래스 | `src/main/kotlin/ulevelp/**`(68개 파일), `build.gradle.kts:9,53`, `Dockerfile:43` | `package ulevelp…`, `group = "com.ulevelp"`, `ulevelp.MainKt` |
| Gradle 프로젝트 이름 | `settings.gradle.kts:1`, `Dockerfile:33` | `ulevelp-server` |
| DB·API의 앱 구분 값 | `src/main/resources/db/migration/V1__init.sql:151`, `security/CryptoService.kt:156`, `service/IntegrationService.kt:70,242,252`, `service/ProfileService.kt:429`, `routes/IntegrationRoutes.kt:35,44,73,85`, `notion/NotionPushWorker.kt:101`, `notion/NotionSyncService.kt:194,536`, `frontend/src/lib/apiClient.ts:1300,1308,1326,1335` | `app_id = 'ulevelp'`, `appId=ulevelp` |
| 런타임 설정 전역 | `public/config.js:4`, `frontend/src/vite-env.d.ts:3,13`, `frontend/src/lib/apiClient.ts:861,1613-1614`, `auth.ts:89`, `drive.ts:69`, `pages/SettingsPage.tsx:399`, `.github/workflows/deploy-cloudrun.yml:82` | `window.ULEVELP_CONFIG`, 타입 `ULevelPConfig` |
| Cloud Run·Artifact Registry·Scheduler·서비스 계정 | `.github/workflows/deploy-cloudrun.yml:38,68`, `scripts/deploy-cloudrun.sh:58,135,162,173,192`, `.env.example:57` | 서비스 `ulevelp`, 저장소 `ulevelp/server`, 작업 `ulevelp-notion-push`·`ulevelp-tier-expire`·`ulevelp-monthly-credits`·`ulevelp-storage-trash`, `ulevelp-cron-sa@…` |
| 운영 주소 기본값 | `.github/workflows/deploy-cloudrun.yml:43-44`, `scripts/deploy-cloudrun.sh:61-62`, `Main.kt:89-90`, `test/rz3_spa.test.js:44-45` | `https://ulevelp-d5ympfsmfq-du.a.run.app` (도메인을 바꿀 때 BR-2 뒤 별도 작업, §8) |
| 로그 이름 | `service/CreditService.kt:114` | `ulevelp.service.Credits` |
| 검수 도구 | `scripts/av3/*`(컨테이너 `ulevelp-av3-db`, 라벨 `ulevelp.audit`) | 그대로 |
| 테스트 고정 값 | `src/test/kotlin/**`의 `https://choise-hun.github.io/ULevelP/`, `test/m21d_note_markdown.test.js`의 `https://ulevelp.app` | 그대로(임의 주소) |
| 에이전트 규칙 문서 | `CLAUDE.md:1`, `AGENTS.md:1,15`, `GEMINI.md:32,73,74`, `scripts/check-config-sync.sh:12-24`(config 저장소 경로 `ULevelP/…`) | 그대로(중앙 config 저장소와 짝이라 따로 다룬다) |
| 옛 문서 | `개발산출물/`, `계획/`, `docs/` 속 이름 | 그대로 |

## 3. 결정

| ID | 결정 |
| --- | --- |
| D1 | 화면에 보이는 이름은 `RE:DO`(대문자, 콜론, 띄어쓰기 없음). 한글 표기는 만들지 않는다 |
| D2 | 파일·폴더 이름은 `REDO`(U1). 내보내기 `REDO-export-…zip`, Drive 폴더 `REDO 녹음` |
| D3 | 조사는 옛 문구에 맞춰 그대로 둔다. `RE:DO`는 "리두"로 읽으므로 `ULeveLP는` → `RE:DO는`, `ULeveLPは` → `RE:DOは` |
| D4 | 로고는 인라인 SVG 컴포넌트 하나(`BrandLogo`)로 만든다. 형태 3가지: 가로 `wordmark`, 세로 2줄 `stack`, 아이콘용 `mark`(`R:`). 색은 `fill="currentColor"`로 부모의 글자색(`--ink`)을 따른다. 좌표는 §6 |
| D5 | 홈 큰 글자 자리에 `wordmark`를 넣는다(U4). `h1`과 전역 클래스 `wordmark`는 유지한다. 폭은 시안 값: `min(560px, 82%)`, 480px 이하 `92%` |
| D6 | 파비콘은 `public/favicon.svg`(U5). `public/icon-180.png`는 같은 그림을 180×180으로 그려 교체한다. 원본 SVG 3개를 `docs/brand/`에 둔다(BR-2에서 외부 화면에 올릴 때 쓴다). 옛 `docs/brand/*.png` 4개는 지우지 않는다 |
| D7 | Drive 폴더(U3): 찾는 순서는 저장된 id → `REDO 녹음` → `ULeveLP 녹음` → 새로 만들기(`REDO 녹음`). 옛 폴더의 이름은 바꾸지 않는다 |
| D8 | 매니페스트·OG·크롬 확장은 만들지 않는다(U6, P11) |
| D9 | `README.md:1` 제목만 `# RE:DO (구 ULeveLP)`로 바꾼다. README의 나머지(운영 주소·명령)는 내부 식별자라 그대로다 |
| D10 | 새 정적 검사 `test/br1_brand.test.js`로 "노출 문구에 옛 이름 0건"을 고정한다(§7-1) |

## 4. 파일별 변경

### 4-1. `frontend/index.html`

- `:7` `<title>ULeveLP</title>` → `<title>RE:DO</title>`
- 그 아래 두 줄 추가:
  - `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
  - `<link rel="apple-touch-icon" href="/icon-180.png">`
- CSP `meta`와 스크립트 줄은 건드리지 않는다(`img-src 'self'`로 충분하다).

### 4-2. `public/favicon.svg` (신규) · `public/icon-180.png` (교체)

`favicon.svg` 전체(§6의 `R` 경로를 `d`에 그대로 넣는다. `style` 속성·`<style>`·`<script>` 금지, P13):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#1d1d1f"/>
  <g fill="#f6f6f1" fill-rule="evenodd" transform="translate(40 50)">
    <path d="(§6 R)"/>
    <rect x="96" y="14" width="24" height="24"/>
    <rect x="96" y="62" width="24" height="24"/>
  </g>
</svg>
```

`icon-180.png`: `favicon.svg`를 180×180으로 그려 덮어쓴다. 저장소에 스크립트 파일을 추가하지 않고 한 번만 실행한다.

```bash
node -e "const {chromium}=require('@playwright/test');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:180,height:180},deviceScaleFactor:1});await p.goto('file://'+process.cwd()+'/public/favicon.svg');await p.screenshot({path:'public/icon-180.png'});await b.close()})()"
```

확인: `file public/icon-180.png`가 `180 x 180`이고, 그림을 열어 잉크 바탕에 밝은 `R:`이 가운데 있는지 본다. 실행이 안 되면 멈추고 보고한다(다른 도구로 대체하지 않는다).

### 4-3. `docs/brand/` (신규 3개)

배경 없이 `fill="#1d1d1f"`, `fill-rule="evenodd"`. 좌표는 §6.

| 파일 | viewBox |
| --- | --- |
| `docs/brand/redo-wordmark.svg` | `0 0 416 100` |
| `docs/brand/redo-stack.svg` | `0 0 202 210` |
| `docs/brand/redo-mark.svg` | `0 0 120 100` |

### 4-4. `frontend/src/components/common/BrandLogo.tsx` (신규)

```ts
export const BRAND_NAME = 'RE:DO';
export type BrandLogoVariant = 'wordmark' | 'stack' | 'mark';
export interface BrandLogoProps {
  variant?: BrandLogoVariant;   // 기본 'wordmark'
  className?: string;
}
export function BrandLogo({ variant = 'wordmark', className }: BrandLogoProps): React.ReactElement
```

- 출력: `<svg viewBox="…" role="img" aria-label={BRAND_NAME} className={className} fill="currentColor" fillRule="evenodd">` 안에 §6 표의 `path`·`rect`. `xmlns`는 넣지 않아도 된다.
- 도형 경로 4개(`R`·`E`·`D`·`O`)는 파일 맨 위 상수로 한 번만 적고 형태별로 `transform`만 달리한다.
- 폭·높이 속성을 넣지 않는다(크기는 쓰는 쪽 CSS가 정한다). 인라인 `style`·hex 색·CSS 모듈을 쓰지 않는다. i18n 키를 만들지 않는다(이름은 번역하지 않는다).
- `width`·`height`를 주지 않은 SVG는 부모 폭에 맞춰 늘어나므로 쓰는 쪽이 반드시 폭을 정한다.

### 4-5. `frontend/src/pages/HomePage.tsx` · `HomePage.module.css`

- import 추가: `import { BrandLogo } from '../components/common/BrandLogo';`
- `:508` → `<h1 className={`wordmark ${styles.wordmark}`}><BrandLogo variant="wordmark" className={styles.wordmarkSvg} /></h1>`
- CSS `.wordmark`를 아래로 바꾼다(글꼴 속성 6줄과 `text-align`을 지운다):

```css
.wordmark {
  align-self: center;
  width: min(560px, 82%);
  margin: 20px 0 24px;
  color: var(--ink);
}

.wordmarkSvg {
  display: block;
  width: 100%;
  height: auto;
}

@media (max-width: 480px) {
  .wordmark {
    width: 92%;
  }
}
```

- 배치 약속: 새 `data-align-group` 없음(한 줄에 혼자 놓인 가운데 맞춤 요소). 폭별 구성은 4개 폭 모두 1열, `hr.home-rule` 위. 상태 목록은 기존 spec 그대로(P19).
- `hr`·`tagline`·`#go` 이하와 다른 선택자는 건드리지 않는다.

### 4-6. 화면 제목 5곳

| 파일:줄 | 지금 | 바꿀 값 |
| --- | --- | --- |
| `pages/NotesPage.tsx:65` | `'학습 노트 · ULeveLP'` | `'학습 노트 · RE:DO'` |
| `pages/NoteDetailPage.tsx:43` | `'학습 노트 상세 · ULeveLP'` | `'학습 노트 상세 · RE:DO'` |
| `pages/PrivacyPage.tsx:9` | `'개인정보처리방침 · ULeveLP'` | `'개인정보처리방침 · RE:DO'` |
| `pages/SettingsPage.tsx:41` | `'설정 · ULeveLP'` | `'설정 · RE:DO'` |
| `pages/ProfilePage.tsx:28` | `'Profile · ULeveLP'` | `'Profile · RE:DO'` |

줄 끝의 `// i18n-keep: …` 주석은 그대로 둔다(P8). 제목을 i18n 키로 옮기지 않는다.

### 4-7. 내려받기 기본 파일 이름 2곳

- `lib/apiClient.ts:1253` `'ULeveLP-export.zip'` → `'REDO-export.zip'`
- `pages/SettingsPage.tsx:900` `'ULeveLP-export.zip'` → `'REDO-export.zip'`

### 4-8. `frontend/src/lib/drive.ts`

- 모듈 맨 위(함수 밖)에 상수 2개:

```ts
const DRIVE_FOLDER_NAME = 'REDO 녹음'; // i18n-keep: 구글 드라이브 고정 폴더명(D5-4, BR-1)
const LEGACY_DRIVE_FOLDER_NAME = 'ULeveLP 녹음'; // i18n-keep: BR-1 이전 폴더명(기존 사용자 폴더 조회)
```

- `ensureFolder` 안에 내부 함수 `findFolderByName(token: string, name: string): Promise<string | null>`를 만든다. 지금의 검색 코드(`:183-198`)를 옮긴 것이다: 질의 `"name = '" + name + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"`, 주소·`fields=files(id,name)&spaces=drive`·헤더 동일, `!ok`면 `t('drive.searchFolderFailed', { status })`를 던지고, 결과가 있으면 `files[0].id`, 없으면 `null`.
- 순서: `preferredId` 확인(지금 그대로) → `findFolderByName(token, DRIVE_FOLDER_NAME)` → `null`이면 `findFolderByName(token, LEGACY_DRIVE_FOLDER_NAME)` → 그래도 `null`이면 만들기(`name: DRIVE_FOLDER_NAME`, 나머지 그대로).
- `:184`·`:207`의 문자열 리터럴과 그 줄의 `i18n-keep` 주석은 상수로 바뀌며 사라진다. 한글이 든 줄은 위 상수 2줄뿐이어야 한다(P8).
- `ensureFolder`의 시그니처·반환값·export, 옛 폴더의 이름·내용, `deleteFile`·`uploadBlob`은 건드리지 않는다. Drive에 이름 바꾸기 요청을 보내지 않는다.

### 4-9. i18n — §5 표의 21줄

### 4-10. 서버 3곳 + 테스트 1곳

| 파일:줄 | 지금 | 바꿀 값 |
| --- | --- | --- |
| `routes/ExportImportRoutes.kt:48` | `"ULeveLP-export-$today.zip"` | `"REDO-export-$today.zip"` |
| `service/ExportImportService.kt:229` | `ULeveLP 데이터 내보내기 안내` | `RE:DO 데이터 내보내기 안내` |
| `service/ExportImportService.kt:242` | `ULeveLP 설정 화면(settings.html)의 …` | `RE:DO 설정 화면(settings.html)의 …` (뒤는 그대로) |
| `src/test/kotlin/ulevelp/nx/ExportImportApiTest.kt:175` | `cd.contains("ULeveLP-export-")`, 실패 문구의 `ULeveLP-export-` | 둘 다 `REDO-export-` |

경로·상태 코드·헤더 이름·ZIP 안 파일 이름은 그대로다.

### 4-11. 테스트

- `test/rz3_spa.test.js:56-59`: 기대 문자열 4개의 `ULeveLP` → `RE:DO`.
- `test/br1_brand.test.js` 신규(§7-1).

### 4-12. 문서

- `README.md:1` → `# RE:DO (구 ULeveLP)`.
- `개발산출물/결과/BR-1.md` 신설(§9), `진행_디자인D.md` BR-1 상태·PR 번호, `인수인계_메모.md` 디자인D 줄.

## 5. 문구 표 (i18n 21줄)

키 이름·순서·따옴표 모양은 그대로 두고 값만 바꾼다. 줄 번호는 ko / en / ja 순서다.

| 키 | 줄(ko/en/ja) | ko | en | ja |
| --- | --- | --- | --- | --- |
| `settings.driveHintBold` | 350/340/340 | `REDO 녹음` | `REDO Recordings` | `REDO 録音` |
| `settings.driveUsing` | 352/342/342 | `Google Drive 저장소 사용 중 (폴더: REDO 녹음)` | `Using Google Drive storage (Folder: REDO Recordings)` | `Google Drive ストレージを使用中 (フォルダ: REDO 録音)` |
| `privacy.pageSub` | 501/490/490 | `RE:DO 개인정보처리방침` | `RE:DO Privacy Policy` | `RE:DO プライバシーポリシー` |
| `privacy.secCollectIntro` | 503/492/492 | `RE:DO는 사용자의 원활한 악기 연습 지원 및 다중 기기 동기화를 위해 최소한의 정보를 수집합니다:` | `RE:DO collects minimal information to support instrument practice and multi-device synchronization:` | `RE:DOは円滑な楽器練習と複数端末の同期のため、最小限の情報を収集します：` |
| `privacy.secStorageIntro` | 521/510/510 | `RE:DO는 사용자의 개인정보를 외부에 판매하거나 무단으로 제3자에게 제공하지 않습니다:` | `RE:DO never sells or shares your personal information with unauthorized third parties:` | `RE:DOは個人情報を外部に販売したり無断で第三者に提供したりしません：` |
| `prog.pageTitle` | 938/925/925 | `코드 진행 모음 · RE:DO` | `Chord Progressions · RE:DO` | `コード進行コレクション · RE:DO` |
| `log.documentTitle` | 1132/1117/1117 | `연습 기록 · RE:DO` | `Practice Log · RE:DO` | `練習記録 · RE:DO` |

옛 이름만 새 이름으로 바꾼 것이고 나머지 글자는 지금 값과 같다. 다르게 보이면 지금 값을 따른다. 새 키는 만들지 않는다.

## 6. 로고 좌표 (원본: 시안 `G`·`row()`, P17)

글자 높이 100, 글자 사이 12. 도형 경로(`fill-rule: evenodd`):

| 글자 | 폭 | `d` |
| --- | --- | --- |
| R | 84 | `M0 0H50C70 0 82 13 82 30C82 44 74 53 63 57L84 100H55L37 62H26V100H0Z M26 24H48C54 24 57 27 57 32C57 36 54 38 48 38H26Z` |
| E | 70 | `M0 0H70V24H26V38H70V62H26V76H70V100H0Z` |
| D | 90 | `M0 0H40A50 50 0 0 1 40 100H0Z M26 24H40A26 26 0 0 1 40 76H26Z` |
| O | 100 | `M50 0A50 50 0 0 1 50 100A50 50 0 0 1 50 0Z M50 24A26 26 0 0 0 50 76A26 26 0 0 0 50 24Z` |

콜론은 `width="24" height="24"` 정사각형 2개다.

| 형태 | viewBox | R | E | 콜론(위·아래) | D | O |
| --- | --- | --- | --- | --- | --- | --- |
| `wordmark` | `0 0 416 100` | `translate(0 0)` | `translate(96 0)` | `x=178 y=14` · `x=178 y=62` | `translate(214 0)` | `translate(316 0)` |
| `stack` | `0 0 202 210` | `translate(0 0)` | `translate(96 0)` | `x=178 y=14` · `x=178 y=62` | `translate(0 110)` | `translate(102 110)` |
| `mark` | `0 0 120 100` | `translate(0 0)` | — | `x=96 y=14` · `x=96 y=62` | — | — |

검산: 가로 316+100=416. 세로 2줄은 윗줄 178+24=202, 아랫줄 102+100=202. 콜론은 14~38·62~86으로 가운데(50) 기준 위아래 대칭이다.

## 7. 검증

### 7-1. `test/br1_brand.test.js` (신규, `node:test`, 파일 읽기만)

| # | 검사 | 기대 |
| --- | --- | --- |
| BR1-1 | 대상: `frontend/index.html`, `frontend/src/**`의 `.ts`·`.tsx`·`.mts`·`.css`, `public/*.svg`·`public/*.js`, `src/main/kotlin/**/*.kt`. 각 줄에서 `ULevelPConfig`를 지운 뒤 `/ULeveLP|ULevelP/`(대소문자 구분)에 걸리는 줄을 `파일:줄`로 모은다 | 걸린 줄이 정확히 1개이고, 그 줄이 `frontend/src/lib/drive.ts`의 `const LEGACY_DRIVE_FOLDER_NAME =`으로 시작한다 |
| BR1-2 | `frontend/index.html` | `<title>RE:DO</title>`, `rel="icon"`+`href="/favicon.svg"`, `rel="apple-touch-icon"`+`href="/icon-180.png"`가 있다 |
| BR1-3 | `public/favicon.svg`, `public/icon-180.png` | 두 파일이 있다. `favicon.svg`에 §6 R 경로 문자열과 `viewBox="0 0 200 200"`가 있고 `style`·`<script`가 없다 |
| BR1-4 | `frontend/src/components/common/BrandLogo.tsx` | §6의 `d` 4개 문자열, viewBox 3개(`0 0 416 100`·`0 0 202 210`·`0 0 120 100`), `aria-label`, `role="img"`, `currentColor`가 있다. `style={{`와 `#` 뒤 hex 3~8자리 색이 없다 |
| BR1-5 | `docs/brand/redo-wordmark.svg`·`redo-stack.svg`·`redo-mark.svg` | 세 파일이 있고 각 viewBox가 §4-3 표와 같다 |
| BR1-6 | `ko.mts`·`en.mts`·`ja.mts` | §5의 7개 키 값이 언어마다 `RE:DO` 또는 `REDO`를 포함한다(21건) |
| BR1-7 | `frontend/src/lib/drive.ts` | `DRIVE_FOLDER_NAME = 'REDO 녹음'`이 있고, 소스에서 `DRIVE_FOLDER_NAME`을 쓰는 조회가 `LEGACY_DRIVE_FOLDER_NAME`을 쓰는 조회보다 앞에 나온다(`indexOf` 비교). `method: 'PATCH'`가 없다 |

### 7-2. 실행 표

| # | 명령·방법 | 통과 기준 |
| --- | --- | --- |
| V1 | 구현 전에 `test/br1_brand.test.js`만 먼저 만들고 `node --test test/br1_brand.test.js` | BR1-1~7 **실패**(Red). BR1-1의 실패 목록(옛 이름이 있는 줄)을 결과 파일에 붙인다 |
| V2 | 구현 뒤 `node --test test/br1_brand.test.js test/rz3_spa.test.js test/i18n.test.js test/security.test.js test/design_rules.test.js` | 전부 통과 |
| V3 | `npm test` | 전부 통과 |
| V4 | `npm run build` | 오류 0 |
| V5 | `./gradlew test --tests 'ulevelp.nx.ExportImportApiTest' --no-daemon` | 통과. 로컬에서 못 돌리면 사유를 적고 CI `Kotlin test` 결과로 확인한다 |
| V6 | 검색(§7-3) | 표의 기대 건수와 같다 |
| V7 | `npm run build && node server.js` 뒤 `npx playwright test test/e2e/layout/home.spec.js` | 실패 0. 새 경고가 있으면 문구를 결과 파일에 적는다. `h1`에 `data-layout-ignore`를 붙여야만 통과하면 붙이지 말고 실패 문구를 보고한다(P19) |
| V8 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js` → 390·768·1150·1280 라이트 + 다크 1장 | 정렬 규격 §6 질문으로 판정: 로고가 가운데인가, 좌우가 잘리지 않는가, 다크에서 밝은색으로 보이는가, `hr`·태그라인과 간격이 어색하지 않은가. 결과 파일에 폭별 한 줄 |
| V9 | `node server.js`에서 `curl -sI localhost:3000/favicon.svg`, `curl -sI localhost:3000/icon-180.png` | 둘 다 200, `Content-Type`이 `image/svg+xml`·`image/png` |
| V10 | 브라우저에서 홈·설정·개인정보·기록·진행 모음·노트·프로필 탭 제목과 파비콘 | 모두 `… · RE:DO` 또는 `RE:DO`, 탭에 `R:` 아이콘 |
| V11 | 실패 확인: `HomePage.tsx` 아무 곳에 `// ULeveLP`를 임시로 넣고 V2 | BR1-1 실패 → 지운 뒤 `git status`에 흔적 없음 |
| V12 | `npm run test:e2e` | 통과(로컬에서 오래 걸리면 PR CI 결과로 대신하고 그렇게 적는다) |

미실행으로 남기는 것: 실제 Google Drive 계정으로 새 폴더 만들기·옛 폴더 찾기(외부 계정 필요 — BR-2 확인 목록에 넣는다), 실제 로그인 상태의 ZIP 내려받기, 운영 배포.

### 7-3. 검색 기준 (결과 파일에 명령과 출력을 붙인다)

| # | 명령 | 기대 |
| --- | --- | --- |
| S1 | `git grep -n "ULeveLP" -- frontend public src/main` | 1줄(`drive.ts`의 `LEGACY_DRIVE_FOLDER_NAME`) |
| S2 | `git grep -n "ULevelP" -- frontend public src/main` | 2줄(`vite-env.d.ts`의 `ULevelPConfig`) |
| S3 | `git grep -n "ULeveLP" -- test src/test` | 0줄 |
| S4 | `git grep -n -i "ulevelp" -- frontend/src/lib/i18n` | 0줄 |
| S5 | `git grep -c "RE:DO" -- frontend/src/lib/i18n` | 파일마다 5 |
| S6 | `git grep -c "REDO" -- frontend/src/lib/i18n` | 파일마다 2 |
| S7 | `git grep -n -i "ulevelp" -- frontend public src/main \| grep -v "ULEVELP_CONFIG\|ULevelPConfig\|appId\|app_id\|APP_ID\|^src/main/kotlin/ulevelp/[^:]*:[0-9]*:\(package\|import\) "` | 남는 줄을 모두 결과 파일에 붙이고, 줄마다 §2 "유지하는 내부 식별자" 표의 어느 행인지 적는다. 표에 없는 줄이 있으면 멈추고 보고한다 |

## 8. BR-2(사람) 입력 — 외부 화면의 이름과 도메인

### 8-1. 이름을 바꿀 외부 화면

| 곳 | 할 일 |
| --- | --- |
| Google Cloud 콘솔 → OAuth 동의 화면 | 앱 이름 `RE:DO`, 로고(`public/icon-180.png` 또는 `docs/brand/redo-mark.svg`를 PNG로). 로고·이름을 바꾸면 Google 재검토가 걸릴 수 있다 |
| Supabase → Authentication → Emails | 인증 메일 제목·본문의 서비스 이름, 보내는 사람 이름 |
| (도메인을 바꿀 때) Supabase → URL Configuration | Site URL, Redirect URLs에 새 주소 추가 |
| (도메인을 바꿀 때) Google OAuth 클라이언트 | 승인된 JavaScript 원본·리디렉션 URI에 새 주소 추가, 동의 화면의 승인된 도메인 |

### 8-2. 도메인 연결 방법 (2026-11-14 공식 문서 확인)

운영 서비스는 Cloud Run `asia-northeast3`(서울)이다.

| 방법 | 서울 리전 | 비용 | 주의 |
| --- | --- | --- | --- |
| Cloud Run 도메인 매핑 | **쓸 수 없다**(지원 리전에 `asia-northeast3` 없음, 미리보기 단계) | — | — |
| 전역 외부 애플리케이션 부하 분산기 + 서버리스 NEG (Google 권장) | 가능 | 전달 규칙 $0.025/시간(월 약 $18) + 처리량 $0.008/GiB + 고정 IP | Google 관리 인증서. DNS는 A 레코드 1개 |
| Firebase Hosting → Cloud Run 연결(rewrite) | 가능 | 무료 한도 안에서 0원(한도·초과 요금은 연결 시점에 확인) | **요청 60초 제한**(넘으면 504). 긴 요청(ZIP 내보내기, 녹음 올리기, 영상 분석)이 60초를 넘는지 먼저 확인해야 한다. Firebase 프로젝트를 GCP 프로젝트에 붙여야 한다 |

추천: 비용이 먼저면 Firebase Hosting, 요청 시간 제한 없이 가려면 부하 분산기. 도메인 값(연 단위, 등록 업체마다 다르고 **미확인 추정**): `.com` 1.5~2만 원, `.app` 2~3만 원, `.kr` 2~3만 원, `.io` 6~9만 원. `redo`는 흔한 단어라 원하는 주소가 남아 있는지는 구입할 때 확인한다. 콜론은 도메인에 쓸 수 없으므로 `redo…` 꼴이 된다.

### 8-3. 도메인을 바꾸면 함께 바꿀 코드 (별도 작업, BR-1 범위 아님)

| 위치 | 값 |
| --- | --- |
| GitHub 저장소 변수 `PUBLIC_APP_URL`·`ALLOWED_ORIGINS`(없으면 `.github/workflows/deploy-cloudrun.yml:43-44` 기본값) | 새 주소 |
| `scripts/deploy-cloudrun.sh:61-62`, `src/main/kotlin/ulevelp/Main.kt:89-90`, `test/rz3_spa.test.js:44-45` | 기본값과 그 단언 |
| `CRON_AUDIENCE`(`.env.example:54`) | **바꾸지 않는다**(Scheduler는 Cloud Run 주소로 부른다) |
| `README.md:5,106` | 서비스 주소 |

알아 둘 점: 브라우저 저장소(로그인 세션·로컬 곡)는 주소별로 따로라서, 주소가 바뀌면 사용자는 다시 로그인하고 비로그인 로컬 기록은 옮겨지지 않는다. 옛 Cloud Run 주소는 계속 열린다(옮겨 주는 처리는 별도 결정).

## 9. 결과 파일(`결과/BR-1.md`)에 적을 것

- 바꾼 파일 목록, V1 Red 출력, V2~V5 출력 끝부분, `npm test` 합계, §7-3 검색 7개의 명령과 출력, V7 실패·경고, V8 폭별 판정, V9 헤더.
- 배치 약속 표(§4-5: 상태 4개, 4개 폭 1열, 맞춤 그룹 없음).
- 미실행 범위(§7-2 끝).
- DS-2 입력: ① 상단 메뉴 로고는 `BrandLogo`(`wordmark`, 시안 높이 16px)로 넣는다 ② 홈 로고의 폭·여백을 다시 볼지 ③ `stack`·`mark` 형태는 아직 화면에서 쓰지 않는다.
- BR-2 입력: §8 그대로 + 실제 Drive 계정 확인 2건(새 계정에서 `REDO 녹음` 생성, 옛 폴더가 있는 계정에서 옛 폴더 재사용).
- 관찰(고치지 않음): 영어·일본어 설정 문구의 폴더 이름(`REDO Recordings`·`REDO 録音`)은 실제 폴더 이름(`REDO 녹음`)과 다르다 — 예전부터 그랬다. [EX-1 명세](EX-1_크롬확장_구현명세.md)의 버튼 문구 "ULevelP에 추가"는 EX-1 착수 때 고친다.

## 10. 하지 말 것

- §2 "유지하는 내부 식별자" 표의 어떤 값도 바꾸지 않는다(패키지·`app_id`·`ULEVELP_CONFIG`·Cloud Run·Scheduler·운영 주소).
- 새 i18n 키, 매니페스트, OG 태그, `extension/`, 새 npm 패키지, 새 스크립트 파일을 만들지 않는다.
- `AppShell`·상단 메뉴·홈의 다른 카드·`tokens.css`·디자인 규칙 문서를 건드리지 않는다(DS-2).
- 옛 `docs/brand/*.png`를 지우지 않는다. `CLAUDE.md`·`AGENTS.md`·`GEMINI.md`·옛 결과·명세 문서의 이름을 고치지 않는다.
- Drive 폴더 이름 바꾸기·옮기기·지우기 요청을 넣지 않는다.
- 테스트 단언을 느슨하게 하거나 skip하지 않는다. `test/rz3_spa.test.js`는 기대 문자열 4개만 고친다.
- 명세와 코드가 다르면(줄이 없거나 문구가 다르면) 그 항목만 멈추고 근거와 함께 보고한다.
