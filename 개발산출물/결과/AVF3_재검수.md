> **후속 마감(2026-11-09):** [AV-3 마감 판정](AV3_마감.md)으로 로컬 기능 검수 통과를 확정한다. 아래 Git 게시 제외·웹 확장 보류는 당시 승인/상태 기록이다. 이번 게시 승인과 실제 PR/CI는 [마감 실행 기록](../진행_AV3_마감게시.md)을 따른다.

# AV-F3 제품 수정 및 실제 계정 재검수 결과

- 확인: 2026-11-08~09(KST), `audit/av3-user-journey`, HEAD `4a6df1c` + 로컬 미커밋 수정. 게시/배포 없음.
- 판정: **AV-F3 로컬 제품 수정 및 실제 A/B·Ktor·동일 격리 DB 재검수 완료**. 실제 로그아웃 뒤 A 재인증 및 기존 fixture 소유자 일치 확인을 마쳤고, 최종 빌드의 계정 전환4·smoke12도 통과했다. 운영 인수·웹 확장 관문은 별도 보류다.
- 승인/수정 명세/실행: [완료 실행 기록](../완료/진행_AVF3_재검수.md). API·DB 스키마·export·공개 함수 반환 타입을 유지했다.

## 구현과 검증 연결

| 실패 모드 | 제품 가드·근거 | 단언 |
| --- | --- | --- |
| A↔B 및 로그아웃/동일 uid 복귀 후 이전 GET/PATCH 성공·실패 | `frontend/src/lib/auth.ts:179` uid 전환 세대, `:197` 공통 요청 순서, `:262` GET, `:332` PATCH | me·캐시·locale·notify 무변경, GET null/PATCH AbortError |
| 토큰 획득 중 전환, 로그아웃 중 SDK 이전 토큰, 로그아웃 완료 뒤 새 계정 저장값 삭제 | `auth.ts:205`, `:218`, `:300` | 이전 세션 복원/다른 계정 PATCH 전송 없음, 새 ulp:auth와 notify 보존 |
| 초기 GET 중 인증 전환 누락 | `auth.ts:376` 첫 await 전 구독 | B 변경 후 늦은 최초 A GET 폐기 |
| 설정 토글/언어 큐·Drive 설정 완료가 새 계정 화면 변경 | `frontend/src/pages/SettingsPage.tsx:112`, `:133`, `:172`, `:416`, `:447` | 토글·오류·언어 큐 계정 격리; Drive 완료/일반 오류/AbortError 후 현재 상태 유지 |

무효 GET은 null, 무효 PATCH는 name=AbortError 거부다. 현재 GET HTTP 오류는 기존 null/초기화, 현재 PATCH HTTP 오류는 기존 status/code/data를 유지한다. 응답 id 불일치는 반영하지 않는다. 토큰 갱신만으로 프로필 세대를 무효화하지 않는다. 서버 DTO는 `src/main/kotlin/ulevelp/service/ProfileService.kt:35`와 대조했다. 저장소/Drive API 계약은 바꾸지 않았다.

## 실행 결과

| 명령 | 실제 결과·증거 |
| --- | --- |
| `node --test test/auth-races.test.js` 및 `npm test` | 신규 auth 회귀 26건 포함 전체 **399 통과**, skip/cancel 0. HEAD auth.ts로 동일 주요 회귀 재실행 시 **17 실패/0 통과**. 초기 GET 구독 경계는 중간 구현에서도 실패 확인 후 수정 |
| `npm run build` | TypeScript + Vite 성공. 기존 크기 경고만 존재. 최종 dist와 Ktor public SPA/assets 바이트 일치 확인 |
| `./gradlew installDist --no-daemon` | BUILD SUCCESSFUL. Kotlin 제품 변경 없음 |
| `npx playwright test test/e2e/avf3-profile-callers.spec.js test/e2e/community.spec.js test/e2e/i18n-lang.spec.js --output=test-results/playwright` | **25 통과**, mock 화면 검수. Drive 호출자 6건은 수정 전 6 실패 확인. 3언어×7화면×4폭 레이아웃/잔존 문구 검사 포함. 실제 Drive OAuth/저장소 쓰기 없음 |
| `node scripts/av3/preflight.cjs` | Ktor SPA/assets/health, 비인증 401 3건, Flyway V9, 전체 도메인 DB 스냅샷 무변경 통과 |
| `node scripts/av3/profile-races.cjs` | 실제 A↔B GET/PATCH **최종 4 통과**. 실로그아웃 직후 중간 재시도는 A→B 2 통과/B→A 2건 `Auth session missing!`였으며 attempt 보존. 실제 OAuth A 재인증과 기존 fixture 소유자 일치 확인 후 동일 단언 4건 재통과 |
| `node scripts/av3/profile-matrix.cjs` | **24 통과**. A/B×GET/PATCH×성공/주입500×계정 전환/다른 계정을 거쳐 동일 uid 복귀/GET↔PATCH 역전. 반환·me·키·locale 저장값/DOM·notify 비교 |
| `node scripts/av3/profile-callers.cjs` | **8 통과**. A/B×설정 토글2×성공/주입500 후 새 계정 토글/오류 불변. 스크린샷 8개, 대표 설정 화면 육안 확인 |
| `node scripts/av3/profile-locale.cjs` | **8 통과**. 이전 계정 언어 큐 폐기와 새 계정 명시 선택 보존, 성공/주입500 양쪽. JWT sub와 요청 locale 비교(토큰 문서화 없음) |
| `node scripts/av3/races.cjs` → `node scripts/av3/share-races.cjs` | **시트48·내 공유12 통과**. 실제 서버 커밋 뒤 전달 지연/주입500. 서버 롤백 검증으로 해석하지 않는다. 동시 실행 실패 후 최종 순차 실행 증거 보존 |
| `node scripts/av3/profile-smoke.cjs` | **12 통과**. A/B 설정·노트·연습·커뮤니티 화면, 프로필/곡/노트/커뮤니티 API, 양방향 타인 곡 GET/PATCH 404 및 전체 DB 무변경. 기존 전체 핵심7/보강4 재생성이 아닌 기존 데이터 영향 smoke |
| `node scripts/av3/logout-check.cjs` | **1 통과**. 실제 Supabase 로그아웃 **204**, session/me/키 초기화, B 전환 후 지연 A GET 폐기. A refresh 세션이 실제 폐기됨 |

실제 성공 경로는 로컬 Ktor/기존 DB/실제 Google JWT를 사용했다. 500 응답·전달 지연은 브라우저가 주입했다. 실제 로그아웃과 이후 동일 A 계정 OAuth 재인증은 각각 확인했다. 하나의 지연 응답을 로그아웃→동일 uid OAuth 재인증 완료까지 보류하는 조합은 단위 회귀로만 검증했다. 실제 동일 uid 복귀 24건의 일부는 A→B→A이며 실로그아웃 후 재로그인과 구분한다.

## 환경·보존·증거 한계

- 기존 `ulevelp-av3-db`, `ulevelp.audit=av3`, `postgres:16-alpine`, 실제 loopback 바인딩과 runtime 동일성, 기본 익명 volume/명시적 외부 mount 없음 확인. 컨테이너 재생성/DB 초기화/TRUNCATE 없음. 허용된 로컬 fixture 변경만 실행했다. 기존 노트 재사용, 추가 유료 분석/운영 DB·스토리지 쓰기 없음.
- **작업자 실수로 기존 ignored `test-results/` 원시 증거/인증 파일이 Playwright 기본 outputDir 정리에서 유실됐다.** 최초 보존 덤프도 같은 경로였으므로 유실됐다. DB·기존 미커밋 소스/문서는 보존됐다. AV-3 외 이전 test-results 산출물도 남았다고 보장할 수 없다.
- A/B는 열려 있던 해당 전용 loopback CDP 브라우저의 앱 origin 세션에서 0600으로 복구했다. Google 쿠키/비밀번호는 추출하지 않았다. O 인증 파일/과거 원시 증거는 복구하지 못했다. O 재검수는 미실행이다.
- 기존 fixture ID는 같은 DB 읽기+유일성 단언으로 재구성했다. 복구 후 전체 덤프 `test-results/av3/db-after-recovery.sql` 보존. 이는 작업 전 상태의 백업이 아니다.
- 재발 방지로 `playwright.config.js` outputDir을 `test-results/playwright`로 분리하고 CLI에도 명시했다. 재실행한 현재 검수 JSON/스크린샷/로그·소스 해시는 ignored `test-results/av3/`에 있다. 기존 원시 증거를 복원했다고 주장하지 않는다.
- 마지막 Drive 호출자 가드 이전 통합 검사도 최종 auth.ts와 같은 소스다. 마지막 변경은 설정의 Drive 완료 처리뿐이며 mock 6건으로 검증했다. 마지막 빌드의 계정 전환4·smoke12는 A 재인증 후 재통과했다. 마지막 dist와 Ktor public 파일 일치를 확인했다.

## 완료 구분과 남은 범위

- 구현: 로컬 미커밋 제품 수정. 커밋/PR/CI 게시/배포는 승인 범위 밖이라 실행하지 않음.
- 화면 연결: 기존 설정 경로 연결 및 위 호출자 회귀/스크린샷 확인. 마크업/CSS/배치 변경 없음.
- 통합: 위 실제 계정/Ktor/동일 DB 검수 완료. 중간 인증 선행 실패는 A 재인증 후 해소. 운영 인수·웹 확장 관문은 승격하지 않음.
- 운영: 미검증. O 계정·기존 전체 핵심 여정 재생성, 외부 Drive 쓰기, 추가 유료 분석은 이번 실행에 포함하지 않음.

---

아래는 제품 수정 승인 이전의 조사 이력이다. 현재 실행 결과를 대체하지 않는다.

# 수정 승인 전 조사 기록 (2026-11-08)

- 확인일: 2026-11-08. 브랜치 `audit/av3-user-journey`, HEAD `4a6df1c`.
- 판정: **선행 수정 부재로 수정 후 통합 재검수 미실행**. 기존 5건 실패를 통과로 변경하지 않는다. 로컬 통합·운영 인수·웹 확장 관문 모두 이번 조사로 통과하지 않았다.
- 승인/재개 기준: [완료 실행 기록](../완료/진행_AVF3_재검수.md).

## 수정 근거 조사

| 명령/확인 | 실제 결과 |
| --- | --- |
| `git status --short`, `git branch --show-current`, `git log -10 --oneline` | 기존 미커밋 변경 확인·보존. HEAD는 AV-2 기록 커밋이며 AV-F3 수정 이력 없음 |
| `git log --all --oneline --regexp-ignore-case --grep='AV-F3\|profile.*race\|auth.*race\|프로필.*지연'` | 최초 로컬 refs 검색 0건. 후속 `git fetch origin` 후에도 수정 근거 없음. 원격 fetch 범위는 `+refs/heads/*:refs/remotes/origin/*` |
| 명세·프론트 auth 관련 `rg` 및 `git diff -- frontend/src/lib/auth.ts` | AV-F3 전용 명세/회귀 결과 발견 못함. auth 로컬 diff 없음 |
| `git log -1 --format='%h %s' -- frontend/src/lib/auth.ts` | 마지막 auth 변경 `0dd2de2`(기존 locale 초기화 수정) |
| `nl -ba frontend/src/lib/auth.ts` | `:218` uid 캡처 이후 `:225~238` GET 성공/실패에서 현재 uid/세대/순서 확인 없이 locale·프로필·캐시·알림 변경. `:281~290` PATCH도 무가드 갱신·반환. `:260~278` 로그아웃에 요청 세대 무효화 없음 |

기존 실패 원인의 코드가 그대로이므로 수정 완료로 판단할 수 없다. 대상 수정 커밋·수정 명세·회귀 통과 결과 모두 확보하지 못했다. 제품 코드는 변경하지 않았다.

## 환경 확인

- ignored `test-results/av3/runtime.json` 존재. Docker inspect/ps와 대조해 기존 컨테이너 이름·`postgres:16-alpine`·`ulevelp.audit=av3`·실제 loopback 포트 일치, 실행 중 확인.
- 명시적 외부 bind/mount 없음. PostgreSQL 기본 경로의 64자리 익명 volume 조건 일치.
- 최초 `HostConfig.PortBindings` 대조는 false였으나 이는 요청 포트 `0`(동적 할당)이기 때문. 실제 `NetworkSettings.Ports`와 runtime 비교는 true. 포트 불일치 차단으로 오기하지 않는다.
- runtime의 serverPid/supervisorPid를 `ps`로 확인: 둘 다 없음. socket connect 검사에서 :3103 미청취. 서버를 시작하지 않았고 DB를 변경/종료하지 않았다.
- A/B/O auth 파일 존재·0600, 디렉터리 0700, `git check-ignore -q test-results/av3/runtime.json` 성공. 내용/계정/토큰 미출력. 세션 유효성·로그인 상태는 확인하지 않았다.

## 실행과 미실행·남은 위험

- 실행: 문서·Git 이력·실제 소스·Docker·PID·port·private 경로 권한/ignore 조사. 파일 상태/명령 결과를 확인했다.
- 미실행: 빌드, Ktor 재개, 인증/세션 갱신, profile-races 4건, logout-check 1건, 성공/실패·동일 계정 재로그인/GET↔PATCH 역전, 핵심 여정·시트48·내 공유12 및 기타 회귀. 이유는 수정 후 검증할 대상 수정이 없음. 새 테스트 성공/실패 수치는 없다.
- 기존 AV-3의 5개 실패·계정 상태 오염 위험은 해소 근거가 없다. 이전 핵심/지연 여정 성공을 이번 실행 결과로 재사용하지 않는다.
- fetch한 origin과 GitHub 조회 범위에도 수정 근거 없음. 다른 PC에만 있는 미게시 파일은 미확인. 수정 소스 반영 후 dist/installDist도 새로 맞춰야 한다. private 파일 존재만으로 세션 유효성을 보증하지 않는다.
- 커밋·push·PR·배포·운영 데이터 쓰기·추가 유료 분석 없음. 기존 미커밋 변경 보존, 이번 변경은 진행/결과 문서 및 인수인계 링크뿐.


## 후속 원격·실제 코드 대조와 다음 작업

- `git fetch origin` 성공. 현재 HEAD `4a6df1c`, `origin/main cb4565c`. HEAD/main/현재 작업본의 auth.ts blob이 모두 `ec7f7a6a4bc751faec5d07c1a5912696613cc462`로 같아 실제 코드도 미수정이다.
- GitHub `choise-hun/doloop`의 전체 상태 PR 검색 `AV-F3` 0건, 브랜치 `avf3` 0건. 최근 갱신 PR은 #140/#139/#138/#137/#136이며 AV-F3 수정 PR은 확인되지 않았다. 다른 로컬 worktree 두 곳에서도 auth.ts 미커밋 diff 없음.
- Docker 이름/label/이미지·실제 loopback 포트·기본 익명 volume 조건을 다시 읽기 확인: 일치/실행 중. 기록 PID 없음·:3103 미청취. private 디렉터리0700·A/B/O 파일0600·Git ignore 확인. 서버 재개·인증·DB 쓰기·새 테스트 실행 없음.
- 기존 두 재현 도구는 성공 응답의 양방향 GET/PATCH와 실제 로그아웃 후 GET을 다룬다. 실패 응답·동일 계정 재로그인/응답 역전·locale/cache/notify/호출자 결과의 추가 회귀가 필요하다. 기존 5건만 통과해도 이 확장 기준 완료로 판단하지 않는다.
- 이전 안내의 “수정 후 재검수”는 제품 수정이 선행되어야 한다는 뜻이었으나 이를 충분히 명시하지 못했다. **다음 작업은 수정 명세→실패 회귀→AV-F3 제품 수정→로컬/실계정 재검수**다. 현재 제품 수정 제외 지시를 확대해 구현하지 않았다. 구체적 순서와 범위는 [완료 실행 기록](../완료/진행_AVF3_재검수.md)의 선행 작업 안내를 따른다.
- 로컬 통합 재검수 미실행, 운영 인수 미검증, 웹 확장 관문 보류를 유지한다. 현재 수정이 없다는 사실을 사용자에게 설명하고 필요한 다음 작업 범위를 제시했다.


## 종료 확인

- 2026-11-09: 단위399/mock25/실계정 결과 JSON의 통과 단언과 `git diff --check` 확인. 소스·dist 해시를 ignored manifest에 보존했다. Git 브랜치/HEAD 유지, Git 게시 없음.
- 로컬 재개 서버를 종료하고 기존 labelled DB 컨테이너/volume은 보존했다. A는 기존 fixture 소유자와 같은 계정으로 OAuth 재인증 완료, B 자료도 보존. O와 과거 원시 증거는 복구되지 않았다.
- 이후 운영 인수나 O 권한 검수 착수 시 새 승인 범위와 인증 자료를 확인한다. 이번 로컬 통과를 배포/운영 완료로 간주하지 않는다.
