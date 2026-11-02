# KZ-1 결과 — Google Cloud Run 배포 자동화 & 보안 응답 헤더 · 최종 공개 점검

- **수행일:** 2026-11-02
- **역할:** 주니어 (구현 명세 `개발산출물/명세/KZ-1_구현명세.md` 및 `개발산출물/주니어_체크리스트.md` 기준 구현·검증)
- **브랜치:** `step/KZ-1`
- **상태:** 진행 (자동 검증 완료, 사람 수행 실환경 배포 및 실기기 점검 M-KZ1 ~ M-KZ5 대기)

---

## 1. 만든·고친 파일 표

| 구분 | 파일 경로 | 작업 내용 |
| :--- | :--- | :--- |
| 수정 | `src/main/kotlin/ulevelp/Main.kt` | 모든 응답 공통 `X-Frame-Options: DENY` 추가 및 HTML 응답 서빙 시 `Content-Security-Policy: frame-ancestors 'none'` 보안 헤더 추가 (`NFR-SEC-1` Clickjacking 방어) |
| 수정 | `src/test/kotlin/ulevelp/ChordEngineTest.kt` | `Z1`(API 응답 `X-Frame-Options: DENY` 검증) 및 `Z2`(정적 HTML 서빙 시 `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cache-Control: no-cache` 검증) 단위 테스트 추가 |
| 신규 | `scripts/deploy-cloudrun.sh` | Cloud Run 서비스(`ulevelp`), Cloud Run Job(`analyze`), IAM 권한(`roles/run.developer`), Cloud Scheduler 1분 크론(`ulevelp-notion-push`) 멱등 배포·갱신 셸 스크립트 작성 및 실행 권한 부여 |
| 신규 | `.github/workflows/deploy-cloudrun.yml` | `main` push 및 수동 실행 워크플로 구성 (`vars.GCP_PROJECT_ID != ''` 보호, WIF 인증, Docker 빌드/푸시, 스크립트 배포, 배포 후 `/api/health` 스모크 테스트) |
| 신규 | `개발산출물/결과/KZ-1_CloudRun배포.md` | 결과 기록 및 점검표 |
| 수정 | `개발산출물/진행_코틀린서버.md` | 3·5·6·7절 상태 갱신 |

---

## 2. 자동 검증 증적

### 2.1 백엔드 전체 테스트 (`./gradlew test --no-daemon`)

```text
ChordEngineTest > Z1 API 응답 X-Frame-Options DENY 헤더 검증() PASSED
ChordEngineTest > Z2 정적 HTML 서빙 시 Clickjacking 방지 헤더 검증() PASSED
ChordEngineTest > Ktor API 엔드포인트 및 정적 파일 서빙 검증() PASSED

BUILD SUCCESSFUL in 20s
5 actionable tasks: 4 executed, 1 up-to-date
```

### 2.2 프런트엔드 단위 & XSS 정적 검사 (`npm test`)

```text
✔ auth.js: createClient에 storageKey ulp:auth 및 flowType pkce를 고정하고 비로그인 시 상단 메뉴에 LOGIN을 표시한다 (10.693167ms)
✔ D1 비로그인: isLoggedIn()은 false, 다른 함수는 401 NOT_LOGGED_IN 거부, 서버 호출 0 (8.817541ms)
...
✔ D34 ULDrive.uploadBlob 5MB 이하 multipart / 5MB 초과 resumable 분기 및 ULEVELP_CONFIG.googleClientId 참조 (1.350791ms)
✔ D35 계정 전환(A→B) 시 ULDrive 인메모리 토큰 즉시 폐기 및 이전 실패 시 고아 파일 DELETE 정리 (NFR-SEC-3, 리뷰 4번) (0.92675ms)
✔ (a) public/: CSP meta·inline 스크립트·on*·style 속성 없음 (0.362958ms)
✔ (b) public/: 외부 스크립트는 정확한 버전 + SRI (0.066375ms)
✔ (c) public/: HTML에 끼우는 값은 esc 등 (0.027292ms)
✔ (d) public/: href·src 값은 safeUrl 등 (0.026791ms)
✔ (e) public/: eval·Function·문자열 setTimeout 없음 (0.033459ms)
✔ (f) public/: 비밀 값 모양 없음 (0.036125ms)
✔ (g) public/: 저장소 키는 ulp:/sb- 또는 옛 키 허용 목록 (0.027292ms)
✔ public/*.html 5개 이상을 실제로 읽었다 (0.091917ms)
✔ 허용 목록에 안 쓰이는 항목이 없다 (지운 코드의 허용 항목은 같이 뺀다) (0.251833ms)
✔ CSP 원문: 스크립트·스타일에 unsafe-* / 와일드카드 없음, object·base는 none (0.175791ms)
ℹ tests 72
ℹ suites 0
ℹ pass 72
ℹ fail 0
```

### 2.3 Playwright XSS E2E 테스트 (`npm run test:e2e`)

```text
Running 12 tests using 1 worker

  ✓  1 E1 첫 화면(index.html) 곡 목록 및 노션 바로가기 (578ms)
  ✓  2 E2 플레이어(practice.html) 곡 제목 및 곡 목록 서랍 (581ms)
  ✓  3 E3 기록 화면(log.html) 기록 탭·세션 목록·녹음 URL (593ms)
  ✓  4 E4 기록 화면(log.html#songs) 곡 보관함 탭 (511ms)
  ✓  5 E5 곡 상세 화면(log.html?song=...) 타임라인 및 A/B 비교 (589ms)
  ✓  6 E6 설정 화면(settings.html) 계정 프로필 표시 (536ms)
  ✓  7 E7 대조군(검출기 작동 확인) (682ms)
  ✓  8 E8 설정 화면(settings.html) 노션 백업 ZIP 미리보기 XSS 검사 (581ms)
  ✓  9 E9 설정 화면(settings.html) 외부 연동 키 상태·점검 결과 XSS 검사 (631ms)
  ✓  10 E10 학습 노트(notes.html) 및 노트 상세(note.html) XSS 페이로드 검사 (889ms)
  ✓  11 회귀 검증: note.html 조회 지연 중 계정 전환/로그아웃 시 이전 응답 무시 (K5-2 리뷰 1번) (744ms)
  ✓  12 회귀 검증: note.html 조회 지연 중 A -> B 계정 전환 시 이전 계정(A) 응답 무시 (K5-2 2차 리뷰) (501ms)

  12 passed (7.8s)
```

### 2.4 배포 스크립트 문법 검사 (`bash -n scripts/deploy-cloudrun.sh`)

```text
bash -n scripts/deploy-cloudrun.sh
(종료 코드 0, 문법 오류 없음)
```

### 2.5 Docker 빌드 & 컨테이너 스모크 테스트 & 13개 화면 CSP 검사

```text
$ docker build -t ulevelp-server:local .
[+] Building 72.4s (18/18) FINISHED

$ docker run -d --name ulevelp-test -p 3000:3000 ulevelp-server:local
47d4ef5fb09a67df253fafb1d489479e71ae7efe09617f70e01a3501ab3648b2

=== 1. Health check ===
$ curl -fsS http://127.0.0.1:3000/api/health
{"ok":true}

=== 2. Static root headers ===
$ curl -fsSI http://127.0.0.1:3000/
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Vary: Origin
Cache-Control: no-cache
Content-Security-Policy: frame-ancestors 'none'
Content-Length: 4052

=== 3. CSP check across 13 screens ===
$ node 개발산출물/자료/csp_check.js
브라우저: Chrome/134.0.6998.35 | 대상: http://localhost:3000/

[OK] 옛 키 복사(theme.js) (index.html)
[OK] 첫 화면 링크 붙여넣기 (index.html)
[OK] 첫 화면 비로그인 곡 안내 (index.html)
[OK] 코드 연습실 전체 탭 (chords.html)
[OK] 플레이어 + 유튜브 (practice.html?v=jNQXAC9IVRw)
  값: {"iframe":true,"title":"Me at the zoo","hasGis":true,"hasDrive":true}
[OK] 플레이어 비로그인 기기 저장 (practice.html?v=jNQXAC9IVRw)
[OK] 학습 노트 비로그인 (notes.html)
[OK] 학습 노트 상세 비로그인 안내 (note.html)
[OK] 기록 화면 비로그인 (log.html)
  값: {"guestVisible":true,"title":"Log","hasGis":true,"hasDrive":true}
[OK] 곡 상세 화면 비로그인 (log.html?song=...)
[OK] 개인정보처리방침 (privacy.html)
[OK] 설정 + 테마 버튼 (settings.html)
  값: {"theme":"light","saved":"light","old":null,"templateHref":"https://app.notion.com/p/4097a337e26f8167aa10eb435edb676e?source=copy_link","hasKeysSec":true,"hasDrivePanel":true,"hasGis":true,"hasDrive":true}
[OK] 대조군(막혀야 함) (index.html)
  CSP 위반: [ 'connect-src https://example.com/', 'style-src-attr inline' ]

화면 13개 중 실패 0개

=== 4. Cleanup ===
ulevelp-test
```

---

## 3. 실환경 배포 가이드 및 실기기 점검표 (사람 수행)

배포 자동화 스크립트(`scripts/deploy-cloudrun.sh`) 및 워크플로(`.github/workflows/deploy-cloudrun.yml`) 구현이 완료되었습니다. 실제 Google Cloud 환경 배포 및 기기 점검을 위해 아래 순서로 진행합니다.

### 3.1 배포 전 1회 준비 사항 (GCP 콘솔/CLI)

1. **GCP Secret Manager 시크릿 등록:**
   - `DATABASE_URL`: Cloud SQL 또는 Supabase PostgreSQL 연결 문자열 (`postgresql://user:pass@host:5432/db`)
   - `SUPABASE_SECRET_KEY`: Supabase 스토리지 및 관리용 서비스 롤 시크릿 키
   - `APP_MASTER_KEY`: 32바이트 Base64 암호화 마스터 키
2. **서비스 계정 및 권한 부여:**
   - 런타임 서비스 계정(`RUNTIME_SA_EMAIL`):
     - `roles/secretmanager.secretAccessor` (시크릿 접근)
     - `roles/run.developer` (`scripts/deploy-cloudrun.sh`가 Job에 자동 부여하지만 사전 확인 권장)
   - 크론 호출 계정(`CRON_SA_EMAIL`):
     - `roles/run.invoker` (Cloud Run 서비스 호출 권한)

### 3.2 로컬 또는 GitHub Actions에서 배포 실행

```bash
export GCP_PROJECT_ID="<your-gcp-project-id>"
export GCP_REGION="asia-northeast3"
export RUNTIME_SA_EMAIL="ulevelp-runtime@<project>.iam.gserviceaccount.com"
export CRON_SA_EMAIL="ulevelp-cron@<project>.iam.gserviceaccount.com"
export IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/ulevelp/server:latest"

# 1. 이미지 빌드 및 푸시
docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

# 2. 스크립트 실행 (Job, IAM, 서비스, Scheduler 자동 구성)
bash scripts/deploy-cloudrun.sh "$IMAGE_URI"
```

### 3.3 사람 점검 체크리스트 (M-KZ1 ~ M-KZ5)

- [ ] **M-KZ1:** Secret Manager 시크릿 등록 및 `scripts/deploy-cloudrun.sh` 실행으로 Cloud Run 서비스(`ulevelp`)와 Job(`analyze`) 배포 확인 (`CLOUD_RUN_ANALYZE_JOB_URI=https://run.googleapis.com/v2/projects/<project>/locations/<region>/jobs/analyze:run`).
- [ ] **M-KZ2:** Cloud Scheduler `ulevelp-notion-push`(1분 주기, OIDC 인증) 생성 및 콘솔에서 수동 1회 실행 시 `200 OK` 확인.
- [ ] **M-KZ3:** 배포된 Cloud Run 서비스 URL에서 `GET /api/health` → `200 {"ok":true}` 및 정적 루트(`/`)의 `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY` 헤더 확인.
- [ ] **M-KZ4:** Cloud Run 서비스(또는 GitHub Pages)에서 Google 로그인 → 곡 저장 → 녹음 업로드/재생 → 노션 동기화 → Gemini 학습 노트 생성 정상 동작 확인.
- [ ] **M-KZ5:** 아이패드 Safari(또는 모바일 실기기)에서 플레이어 구간 반복, 녹음, 기록 달력, 코드 연습실, 학습 노트 뷰어 UI 깨짐 없이 정상 동작 확인.

---

## 4. 명세와 달라진 점 및 겪은 문제

- **명세와 달라진 점:** 없음. 명세의 모든 시그니처, 보안 헤더, 워크플로 조건, 스크립트 단계가 일치함.
- **겪은 문제 및 해결:** 없음. 로컬 도커 컨테이너 빌드 후 `curl` 및 `csp_check.js`를 통해 `frame-ancestors 'none'` 및 `X-Frame-Options: DENY` 헤더와 13개 화면 무오류를 성공적으로 검증함.
