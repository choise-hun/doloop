# TB 악보 플레이어 진행

## 목표와 입력

- **현재 단계** TB-1 **명세 승인**(2026-11-25, [명세/TB-1](명세/TB-1_구현명세.md) §3 T1~T7 추천안 승인), **시니어 구현 완료·push**(`feat/TB-1-tab-songs`, 커밋 2개), 다음은 주니어 4단계다. TB-0은 **조건부 통과**(2026-11-25 사용자 승인)다. 결과는 [결과/TB-0](결과/TB-0_스파이크.md), 재현물은 [자료/TB-0_재현물](자료/TB-0_재현물/README.md)에 있다.
- **근거** [기능확장.md](../기능확장.md) §2.3·§5·§6 및 [TB-0 스파이크 명세](명세/TB-0_스파이크명세.md).
- **승인 범위**
  - 2026-11-25 1차: TB-0 격리 재현물 실행을 요청받았다. 제품 소스·DB 마이그레이션·main 반영은 금지였다.
  - 2026-11-25 4차(TB-1 구현): T1~T7 추천안 승인과 "진행" 지시. 명세 §10 파일만 구현하고, `./gradlew test` 뒤 push한다. 머지·운영 배포는 하지 않는다.
  - 2026-11-25 3차(TB-1 명세): 명세 문서 `명세/TB-1_구현명세.md`만 작성하고, 진행 파일·인수인계 메모를 갱신하고, base main 명세 PR을 올린다. 제품 코드와 마이그레이션은 쓰지 않는다. 명세 승인 전에는 구현하지 않는다.
  - 2026-11-25 2차: 사용자에게 실측 기기가 없어 "확인된 내용으로 충분하다고 평가하고 다음 단계로" 넘어가도록 승인받았다. 추천안 4건(R1 실기기는 출시 전 관문, R2 플레이어 인스턴스 재사용 확정, R3 SONiVOX는 출시 전 관문, R4 1차 포맷 3종)과 `evidence/`의 JSON·CSV만 커밋하는 안을 승인받았다. 문서 정리, 다음 세션 멘트, main 대상 PR 게시까지가 승인 범위다. CI 확인과 머지는 사용자가 한다.
- **담당** 시니어 Claude(TB-0 실행·정리). TB-1부터는 협업 규칙의 기본 배정(시니어 원스톱 구현, 회귀·PR·CI는 주니어 인계)을 따른다.

## 기준 브랜치와 보존

- 작업 트리 `C:\seokhunchoi_Ax_Fullstack\doloop`, 브랜치 `chore/team-docs-untrack`, HEAD `e42f666`. 시작 시 tracked diff/스테이징은 비어 있었으며 기존 미추적 `기능확장.md`를 입력 그대로 보존했다.
- 로컬 `main`, `origin/main` 및 원격 `refs/heads/main`은 `c8b5bec`로 일치했다. [PR #67](https://github.com/choise-hun/doloop/pull/67)은 해당 커밋에 머지됐고, 현재 HEAD는 그 main의 조상이다. 작업 브랜치에서 문서를 작성했다.
- 2026-11-25 정리 PR: `origin/main` `c8b5bec`에서 `docs/TB-0-spike-result`를 새로 만들어 문서·결과·재현물 코드를 커밋했다. 재현물의 `node_modules/`와 `evidence/**/*.png`는 제외했다.
- 인수인계 메모와 실제 진행 파일을 대조했다. 착수 전 루트 진행 파일과 열린 main 대상 PR은 0건이었다. 이 파일이 현재 TB의 실행·재개 기준이다.

## 실행 기록

| 범위 | 확인 명령·자료 | 결과 |
|---|---|---|
| 작업 상태 | `git status --short --branch`, `git diff --stat`, `git diff --cached --stat`, `git worktree list` | 현재 브랜치와 기존 미추적 기획 원문 확인. |
| 선행 상태 | `git ls-remote origin refs/heads/main`, `git merge-base --is-ancestor HEAD origin/main`, `gh pr view 67`, `gh pr list --base main --state open` | main 일치, 조상 검사 종료 코드 0, PR #67 MERGED, 열린 PR 0건. |
| 기준 자료 확인 | 로컬 CSP·보안 단언·Vite·Capacitor 조립 경로 열람, `npm view @coderline/alphatab-vite@1.9.0 version peerDependencies --json`, 태그 소스와 SoundFont 원문 열람 | Vite 5.4.11과 플러그인 peer 범위 차이, SONiVOX 우선 후보와 배포 고지, `destroy()` 하위의 `close()` 호출을 확인해 명세에 반영. |
| 문서 검증 | UTF-8/LF, 상대 링크, Git 상태/diff 및 `Get-FileHash -Algorithm SHA256 기능확장.md` 확인 | 두 산출물 검증. 기존 기획 원문의 SHA-256 `02B0C67B16A9DB6020B6D177F5DF049D468087739CD6F3933D50A06F8773C1B8`. |
| 실측·제품 검증 (2026-11-25 1차) | 재현물 `자료/TB-0_재현물/`(alphaTab 1.9.0 고정 설치, 자체 제작 fixture, CSP meta 주입 서버). Edge 158 headless에서 `tools/smoke.mjs`·`scenarios.mjs`·`mem-run.mjs`(2회)·`mem-diag.mjs`(4변형) 실행. 명령 전체는 결과 §5 | 아래 단계 표와 [결과/TB-0](결과/TB-0_스파이크.md). 제품 소스·DB·main은 변경하지 않음. 제품 구현·화면 연결·서버 통합·운영 확인은 해당 없음 |

## Step 표

| Step | 입력 → 결과 | 완료 기준 | 상태 | 권장 effort |
|---|---|---|---|---|
| TB-0 스파이크 | 명세/TB-0 → 결과/TB-0 | 사용자 승인 조건부 통과(R1~R4 이월) | **완료** 2026-11-25 · PR [#68](https://github.com/choise-hun/doloop/pull/68) | — |
| TB-1 백엔드 계약·구현 | 기능확장.md §2.3 C, 결과/TB-0 §0·§3 → [명세/TB-1](명세/TB-1_구현명세.md) → 결과/TB-1 | 명세 승인(T1~T7) 뒤 V15·`POST /songs/tab`·`GET /songs/{id}/tab-file`·삭제 정리·공유 제외·옛 클라이언트 보호(`include=tab`) 구현, 명세 §11 Kotlin 테스트, PR CI 통과 | **시니어 구현 완료** 2026-11-25 · 명세 PR [#69](https://github.com/choise-hun/doloop/pull/69) · 브랜치 `feat/TB-1-tab-songs`(PR 없음, 주니어 4단계 대기) | high |
| TB-2 프론트 시안·구현 | 결과/TB-0 §2.3·§3, TB-1 계약 → 시안 → 결과/TB-2 | HTML 시안 확정, `tabEngine`(인스턴스 재사용), CSP diff + 보안 테스트, 재사용 방식 데스크톱 10회 전환 §5 합격선 통과 | 대기 | high |
| TB 출시 전 관문 | 결과/TB-0 §0 R1·R3·R4 | 실기기 확인, SF2 근거·교체, 포맷 4종 검증 | 대기(`상용_서비스_계획.md` §4) | — |

## TB-0 관문 표

| 관문 | 입력 → 결과 | 상태 | 핵심 수치·판정 |
|---|---|---|---|
| 착수 확인 | git status/log, `origin/main`, 열린 PR | 완료 | HEAD `e42f666` ⊂ `origin/main` `c8b5bec`, 열린 PR 0, tracked diff 0, 미추적 3건 보존 |
| LIC-01 | 타르볼 → 결과 §2.1 | 통과(고지 조건) | sha512가 레지스트리와 일치, gitHead `9f1aa10`, MPL 전문 미동봉 → 고지·소스 위치 필요, 크레딧 유지 |
| LIC-02 | `sonivox.sf2` → §2.1 | 보류 → 이월 R3 | 1,351,896 bytes, sha256 `4978cf37…`. LICENSE(Apache-2.0)와 README 출처 서술(Samsung·Creative 뱅크) 불일치 |
| CSP-01~04 | 정책 4종 × 엔진 2종 → §2.2~2.4 | 데스크톱: 첫 후보 실패 → 수정안 통과 | `<style>` 2개가 `style-src-elem`에서 막혀 글리프 누락. 해시 2개 + `html5` 엔진이면 위반 0. SVG는 `style-src-attr` 406건 |
| PLAY-01 | 7형식 → §2.5 | 3형식 통과, 4형식 이월 R4 | `.gp`·`.xml`·`.mxl` 렌더·5초 재생·커서·RMS. `.gp3/4/5/.gpx` fixture 없음 |
| PLAY-02~04 | → §2.5 | 데스크톱 통과 | 마디 100 클릭 탐색, 지연 렌더 끝 구간, 트랙 제어 RMS, 경합 3건 폐기·카운터 0, 손상 입력 오류 후 복구. 청감 미확인 |
| §5 메모리(데스크톱 보조) | → §2.6 | 새 인스턴스 방식 **실패** → R2 재사용 방식으로 TB-2 재측정 | 피크 +111.6/+109.5MB 통과, R_end +35.6/+37.0MB, 드리프트 +22.7/+25.7MB, 카운터 0. 진단: 오디오 경로가 원인, 인스턴스 재사용 시 증가가 멈춤 |
| iPad WKWebView | Mac·Xcode·실기기 → 결과 갱신 | 이월 R1(장비 없음, 사용자 승인) | 결과 §4 조건 |
| 저사양 랩탑 | RAM ≤8GB·내장그래픽 → 결과 갱신 | 이월 R1(이 PC는 16.8GB·RTX 5060) | `tools/mem-run.mjs` 그대로 사용 가능 |

## 겪은 문제

- Playwright `waitForFunction`이 강제 CSP의 `unsafe-eval` 금지에 막혀 `evaluate` 폴링으로 바꿨다.
- 저장소 Playwright 브라우저 경로(`D:\ms-playwright`, 1161)가 없어서 설치된 Edge 안정판(`channel: 'msedge'`)을 썼다.
- alphaTab이 컨테이너에 `position: relative`를 넣어 `.tb-player`가 스크롤되지 않았다. `#host`를 `scrollElement`로 바꿨다.
- alphaTex 1.9 드럼 표기가 이 빌드에서 막혀 fixture를 MusicXML로 만들었다. `.gp`는 MusicXML을 가져온 뒤 GP7로 내보냈다.

## TB-1 명세 단계 기록 (2026-11-25 Mac)

- `main` `b0d219d`에서 `docs/TB-1-spec`을 만들었다. 시작할 때 미커밋 변경은 없었다.
- 코드로 확인한 것: Flyway 마지막 버전 V14(V15 비어 있음), `songs` 유일성 `UNIQUE(user_id, video_id)`, `SongsTable.videoId` 읽는 경로 전수(명세 §2 P17·§7), `StorageClient` 4개 메서드와 `takes` 단일 버킷, `storage_trash` 칸·cron, `TierLimits` 상수, 계정 삭제가 녹음 키만 휴지통에 넣는 점(P14).
- 확인하지 못한 것: 운영 `takes` 버킷의 MIME·크기 제한(이 세션의 Supabase 연결 계정에 doloop 프로젝트가 없음). 구현 전에 확인한다(명세 §13 U1).

## TB-1 시니어 구현 기록 (2026-11-25 Mac)

- 브랜치 `feat/TB-1-tab-songs`는 `docs/TB-1-spec` 위에 쌓았다(PR #69 미머지). #69가 머지되면 main 기준으로 다시 맞춘다(아래 멘트).
- 커밋 ① `c40f496`: V15 + `video_id` nullable 파급 + 목록 `include=tab` + 공개본·연습 카드·공개 오늘 곡·ZIP 내보내기 TAB 제외.
- 커밋 ②: `TabFileValidator`·`TabSongService`, `POST /songs/tab`, `GET /songs/{id}/tab-file`, 곡·계정 삭제 시 TAB 키 휴지통, 티어 `tabSongs`·`tabBytes`(`GET /me` 한도·사용량에도 노출).
- 검증: `./gradlew clean test -Pkotlin.incremental=false` **430 tests, 실패 0**(기존 409 + 새 21: TabSongApiTest 15, TabFileValidatorTest 6. 커밋 ①의 M1~M3·C1~C6은 기존 수에 포함). 변이 3건을 확인했다: tx B 재검사 제거 → U6 실패, `media_type` 조건 제거 → F1 실패, `includeTab` 조건 제거 → C2 실패. 셋 다 되돌린 뒤 통과.
- 명세와 달라진 점(명세에 반영함): ① `GET /sessions`의 합계·달력은 TAB 세션까지 센다(목록만 거른다). ② `CommunityService`·`PlaylistImportService`는 nullable 타입 때문에 한 줄씩 고쳤다(동작 변화 없음). ③ 응답 키 집합을 단언하는 기존 테스트 3건(SongApiTest S1·S13, SessionApiTest L3)을 새 칸에 맞췄다. ④ `FakeStorageClient`에 Content-Type 기록을 더했다.
- 미확인 해소: U3 한국어 파일 이름은 `filename="연습곡.gp"` 그대로 디코딩됨(TB1-U2). **U1(운영 `takes` 버킷 MIME·크기 제한)과 U2(운영 제약 이름)는 아직 확인하지 못했다.** U1은 배포 전에 반드시 확인한다. U2는 Testcontainers에서 V1 자동 이름으로 마이그레이션이 통과했다.
- 미실행: `npm test`(프런트 무변경), PR·CI, 운영 배포.

## 다음 행동

1. 주니어 4단계: PR #69 머지 뒤 `feat/TB-1-tab-songs`를 main 기준으로 맞추고, 전체 회귀·PR·CI·`결과/TB-1.md`를 만든다(아래 멘트).
2. 배포 전 사람 확인: 운영 `takes` 버킷 `allowed_mime_types`·`file_size_limit`(명세 §13 U1). 오디오 MIME만 허용이면 `application/octet-stream`을 더해야 한다.
3. TB-2 착수 때 결과/TB-0 §2.3의 CSP diff와 §0 R2의 인스턴스 재사용을 완료 기준에 넣는다. 목록 API는 `include=tab`을 보낸다.
4. 출시 전 관문 R1·R3·R4는 `계획/상용_서비스_계획.md` §4 TB 항목에서 관리한다.

## 다음 세션 시작 멘트

```text
TB-1 4단계 검증·PR을 시작해. 나는 주니어야.
먼저 읽어: 개발산출물/인수인계_메모.md §2, 개발산출물/진행_TB_악보플레이어.md("TB-1 시니어 구현 기록"·Step 표), 개발산출물/명세/TB-1_구현명세.md §10·§11·§13, .team_docs/주니어_체크리스트.md.
git: PR #69(docs/TB-1-spec)가 머지된 뒤 main을 pull하고, feat/TB-1-tab-songs를 git rebase main으로 맞춘다(충돌이 나면 멈추고 묻는다). 머지 전이면 base를 docs/TB-1-spec으로 둔 PR을 만들지 말고 기다린다. gh 계정은 choise-hun 그대로다.
시작하기 전에 확인: 명세 §13 U1(운영 takes 버킷 MIME·크기 제한)을 사람이 확인했는지 묻는다. 확인 전이면 PR 본문에 "배포 전 확인 필요"로 적는다.
범위: 제품 코드는 고치지 않는다. ./gradlew clean test -Pkotlin.incremental=false, npm test, npm run build를 실행하고 결과를 적는다. 실패하면 고치지 말고 원문과 함께 시니어에게 넘긴다.
끝나면 base main PR을 올리고 CI를 확인한 뒤 결과/TB-1.md, 진행 파일 Step 표, 인수인계 메모를 맞춘다. 머지와 운영 배포는 하지 않는다.
```
