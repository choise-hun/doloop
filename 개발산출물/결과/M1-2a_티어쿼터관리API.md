# M1-2a 결과 — V5 마이그레이션 · 티어 쿼터 · owner 관리 API · tier-expire cron

- 날짜: 2026-11-05 (win)
- 입력: `결과/M1-1_스키마설계.md`(2026-11-05 승인, §0-1 변경 반영), `진행_티어크레딧.md`
- PR: **#78** `feat/m1-2a-tier-quota` → main, CI 전부 통과(run 41998539171: Kotlin test, Node 22·24, E2E spa·legacy, Docker smoke)
- 상태: **코드·테스트 완료, "내 계정 pro 지정"은 머지·배포 뒤** (운영에 V5 코드가 있어야 관리 API를 부를 수 있다 — §5)

## 1. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `db/migration/V5__tiers_credits_and_community.sql` (새) | 설계 §2-1 그대로(문서에서 뽑아 옮김): `profiles` 열 11개 + 제약, `analysis_jobs` 과금 열 7개, `credit_ledger`, `admin_audit`. 테이블 15 → **17** |
| `db/Tables.kt` | `ProfilesTable` V5 열, `CreditLedgerTable`·`AdminAuditTable`, `ALL_TABLES` 17. `analysis_jobs` 과금 열은 Exposed에 아직 안 넣음(M1-3이 쓸 때) |
| `api/ApiError.kt`, `Main.kt` | 에러 응답 선택 필드 `detail`(값이 있을 때만 나옴, `@EncodeDefault(NEVER)`) — A10 |
| `service/TierService.kt` (새) | `TierLimits`(free/pro/pro_plus 표, `nextTier`), `effectiveTier`(유일한 계산 함수), `tierContext(userId, lock)`, 한도 검사 `requireSongSlots`·`requireCategorySlot`·`requireTakeDuration`·`requireTakeSongs`·`takeQuotaExceeded`·`requireDrive`·`tierUpgradeRequired`, `downgradeCleanup`, `TierService.expireOverrides`(cron) |
| `service/AdminService.kt`·`routes/AdminRoutes.kt` (새) | `/api/v1/admin/*` 다섯 경로(§3). owner 확인은 `route("/admin")`의 `OwnerOnlyPlugin` 한 곳, `profiles.role`만 읽음 |
| `routes/NotionSyncRoutes.kt` | `POST /internal/cron/tier-expire`(기존 notion-push와 같은 OIDC 확인) |
| `service/ProfileService.kt` | `GET/PATCH /me`에 §5-1 필드 추가, `takeQuotaBytes` = 실제 티어 한도, 무료 `storageProvider:"drive"` 403 |
| `service/SongService.kt`·`routes/SongRoutes.kt` | `POST /songs` 곡 한도(프로필 잠금 후 업서트 재확인 → 새 곡만 한도 사용) + 선택 입력 `a`·`b`(A6). `migrate-local`은 새 곡이 넘치면 통째 403 |
| `service/CategoryService.kt` | 50개 고정(400) → 티어 한도(403 `CATEGORY_LIMIT_EXCEEDED`). `MAX_CATEGORIES`는 순서 바꾸기 요청 상한으로만 남음 |
| `service/TakeService.kt` | `RECENT_SONG_ONLY`·`SINGLE_SONG_TAKE_LIMIT` 삭제(A1) → 무료 2곡·120초·5MB / 유료 총량만. `replaceOldSongTakes`(옛 교체 모달)는 그대로 동작. Drive 등록·이전은 무료 403 |
| `service/ExportImportService.kt`·`notion/NotionSyncService.kt` | 은닉·동결 기능의 우회 방지(A3): 새 곡이 한도를 넘으면 통째 403, 녹음 총량은 실제 티어 한도(`take_quota_bytes` 안 읽음) |
| `scripts/deploy-cloudrun.sh` | Cloud Scheduler `ulevelp-tier-expire`(`5 0 * * *`, `Asia/Seoul`) 생성/갱신 [5/5] |
| 테스트 | 새 `tier/TierQuotaAdminApiTest.kt` 13개. 기존 테스트는 §4대로 고침 |

## 2. 한도·에러 (실제 동작)

| 상황 | 응답 | `detail` |
| --- | --- | --- |
| 무료 11번째 곡 | 403 `SONG_LIMIT_EXCEEDED` | `{limit:10, used:10, tier:"free", nextTier:"pro", nextLimit:100}` |
| 같은 `videoId` 다시 등록 | 200(업서트), 한도 안 씀 | — |
| `migrate-local` 9곡 + 새 2곡 | 403 통째, 곡 9개 그대로·`migratedLocalAt` 안 바뀜 | 위와 같음 |
| 무료 3번째 분류 | 403 `CATEGORY_LIMIT_EXCEEDED` | `nextTier:"pro"`, `nextLimit:7` |
| Pro+ 11번째 분류 | 403 `CATEGORY_LIMIT_EXCEEDED` | `nextTier:null`, `nextLimit:null` (화면은 업그레이드 안내 없이 단순 안내 — A4) |
| 무료 3번째 곡 녹음 | 403 `FREE_TAKE_SONG_LIMIT_EXCEEDED` | `{limit:2, used:2, …}` |
| 무료 121초 녹음 | 403 `TAKE_DURATION_LIMIT_EXCEEDED` | `{limitSec:120, tier, nextTier}` |
| 무료 총량 5MB 초과 | 413 `TAKE_QUOTA_EXCEEDED` | `{limitBytes:5242880, usedBytes, tier, nextTier, nextLimit}` |
| 무료 Drive(`PATCH /me`·`POST /takes` JSON·`migrate-drive`) | 403 `TIER_UPGRADE_REQUIRED` | `{feature:"drive", tier:"free", nextTier:"pro"}` |

- 한도 검사는 추가하려는 순간에만(Q8). 동시 요청은 `profiles` 행 `FOR UPDATE`로 줄 세운다
- 녹음 곡 수·총량은 `storage='supabase'`만 센다

## 3. owner 관리 API (`/api/v1/admin`, Bearer + `profiles.role='owner'`)

| 경로 | 입력 → 응답 | 오류 |
| --- | --- | --- |
| `GET /admin/users?email=` | 대소문자 무시 완전 일치 → `{users:[{id,email,displayName,role,tier,billingTier,tierOverride,tierOverrideUntil,credits{monthly,purchased},isCreator,creatorBadge,creatorBio}]}` | email 없음 400 |
| `PUT /admin/users/{id}/tier-override` | `{tier:"free"\|"pro"\|"pro_plus"\|null, until?:ISO\|null, reason}` → 사용자 요약. 유료→free면 같은 트랜잭션에서 정리 | tier 틀림·reason 공백·tier null인데 until·until 과거·tier 키 없음 400, 없는 사용자 404 |
| `POST /admin/users/{id}/credits` | `{delta:±1..1000, bucket?:"purchased"(기본)\|"monthly", reason}` → `{credits, ledgerId}`. 감사 행 먼저, 원장 `admin_adjust`(`audit_id`·`memo`=사유) | `|delta|>1000` 400 `ADMIN_GRANT_LIMIT_EXCEEDED`, 결과 음수 409 `CREDIT_BALANCE_NEGATIVE`, delta 0·문자열·bucket 틀림 400 |
| `PUT /admin/users/{id}/creator` | `{isCreator, creatorBadge?(키 없음=그대로, null=지움, 1~20자), creatorBio?(≤200), reason}` | 400 |
| `GET /admin/audit?targetUserId=&limit=` | 최근 순(기본 50, 최대 200) → `{rows:[{id,actorId,action,targetUserId,targetId,before,after,reason,createdAt}]}` | limit 범위 밖 400 |

- 권한: 토큰 없음 401 `UNAUTHORIZED` / owner 아님 403 `FORBIDDEN` / owner 200
- 감사 `action` 값: `tier_override`, `credit_adjust`, `creator_update`. 실패한 쓰기는 롤백되어 감사 행도 없다
- **다운그레이드 정리**(`downgradeCleanup`) = `share_practice_log=false` + `storage_provider='supabase'` (설계 §1-3 "새 업로드는 서버 저장으로 받는다"를 서버에서 보장 — 이 step에서 정함). 공개 폴더 비공개는 M1-4가 같은 함수에 더한다(`TODO(stub)`)
- `POST /internal/cron/tier-expire` → `{expired, downgraded}`. 기한 지난 override를 NULL로, override가 유료이고 결제 티어가 free면 정리. 두 번 돌려도 `{0,0}`

## 4. 테스트

### 실행 결과 (로컬 win, Testcontainers `postgres:16-alpine`)

```
./gradlew clean test --rerun-tasks        BUILD SUCCESSFUL in 1m 12s
  전체 241 tests, 실패 0, 건너뜀 0
  ulevelp.tier.TierQuotaAdminApiTest          tests="13" failures="0" errors="0"
  ulevelp.db.DatabaseMigrationAndIntegrityTest tests="6"  failures="0"  (Flyway 버전 5, 테이블 17)
  ulevelp.take.TakeApiTest                    tests="33" failures="0"
npm test                                   394 중 392 통과, 실패 2 = CH-2c-1-1·CH-2c-3-2
  (win core.autocrlf CRLF 비교 — 인수인계 §5에 적힌 PC 함정, 이번 변경과 무관·CI에서는 통과)
```

- 새 테스트(잘못된 입력 포함): Q1 `/me` 필드, Q2 곡 11번째 403·업서트 200·pro 통과, Q3 `a≥b` 400, Q4 `migrate-local` 통째 403, Q5 분류 403·Pro+ `nextTier=null`, Q6 무료 녹음 3번째 곡·121초·5MB+ 거부(막힌 업로드는 저장소에 안 남음), Q7 Drive 403/pro 200, A1 권한 401/403/200, A2 override 지정·해제·잘못된 입력 6종 400·404·감사 2행, A3 다운그레이드 정리, A4 크레딧 지급·상한 400·음수 409·**원장 합계 = 잔액**, A5 크리에이터, C1 cron 만료·재실행 0·OIDC 없음 401
- 처음 실행에서 옛 규칙에 기댄 기존 테스트 18개가 실패 → 아래 표대로 새 규칙에 맞춤. 겪은 문제: 증분 컴파일이 테스트 클래스를 잃어 `test NO-SOURCE`로 "성공"처럼 보임 → `clean test --rerun-tasks`로 다시 확인

### 기존 테스트 고친 것 (옛 규칙에 기댄 18개)

| 테스트 | 왜 | 어떻게 |
| --- | --- | --- |
| `DatabaseMigrationAndIntegrityTest` | 버전 4·테이블 15 | 버전 5·17 |
| `AuthAndProfileApiTest` 2개 | `takeQuotaBytes` 200MB, Drive 변경 | 무료 5MB / Drive 시험은 pro 지정 후, 변조 무시 = pro 100MB |
| `CategoryApiTest` C2·C4 | 50개 400 | 무료 3번째 403 → pro_plus 10개·11번째 403 / C4는 pro |
| `TakeApiTest` T3·T4·T5 | `take_quota_bytes`를 작게 써서 시험 | 무료 5MB로: 5,000,000 + 300,000 → 413 / 3MB 동시 2건 → 201·413 |
| `TakeApiTest` T7 | 50MB 파일 경계 | pro(100MB)에서 |
| `TakeApiTest` T22·T23·T24·T26·T28·T32 | Drive | pro 지정 |
| `TakeApiTest` T30 | `SINGLE_SONG_TAKE_LIMIT` 409 | 2곡 허용·3번째 곡 403 `FREE_TAKE_SONG_LIMIT_EXCEEDED` |
| `TakeApiTest` T33 | `RECENT_SONG_ONLY` 409 | 과거 곡 녹음 201 |
| `ExportImportApiTest` NX7, `NotionPullAndEnableApiTest` PL4 | 쿼터 500B | 무료 5MB + 1바이트 녹음 → 건너뜀 |
| `ApiTestSupport` | 에러 키 정확히 6개 | `detail`은 선택(있으면 객체) + `TestTier.set/setRole` 헬퍼 |

## 5. 내 계정 pro 지정 — 머지·배포 뒤 할 일

운영 DB에 V5가 올라가고 관리 API가 있어야 한다(지금 운영 = main `737f385`, Flyway v4). 순서:

1. 이 PR 머지 → `scripts/deploy-cloudrun.sh`로 배포(인수인계 §6 명령). 로그 `now at version v5`, `ulevelp-tier-expire` 생성 확인
2. 내 계정이 owner인지: 아니면 Supabase SQL 편집기에서 한 번 `UPDATE profiles SET role='owner' WHERE id=(SELECT id FROM users WHERE email='<내 이메일>');` (role을 바꾸는 API는 없음 — 설계 §5-2)
3. 브라우저 로그인 상태의 access token(개발자 도구 → `localStorage`의 Supabase 세션 `access_token`)으로:

```bash
APP=https://ulevelp-d5ympfsmfq-du.a.run.app; T='<access_token>'
ME=$(curl -fsS -H "Authorization: Bearer $T" "$APP/api/v1/me" | jq -r .id)
curl -fsS -X PUT -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"tier":"pro","until":null,"reason":"운영자 본인 계정 pro 지정(M1-2a)"}' \
  "$APP/api/v1/admin/users/$ME/tier-override"
curl -fsS -H "Authorization: Bearer $T" "$APP/api/v1/me" | jq '{tier,billingTier,limits}'   # tier = "pro"
curl -s -o /dev/null -w '%{http_code}\n' "$APP/api/v1/admin/users?email=x"                    # 401
```

- 결과(응답 `tier`)를 이 절과 진행 파일에 적는다

### 5-1. 실행 결과 (2026-11-05)

- 배포: `server:cb64405`(main) → Cloud Run `ulevelp`(`https://ulevelp-d5ympfsmfq-du.a.run.app`). 로그 `now at version v5`, `ulevelp-tier-expire` 크론 ENABLED(매일 00:05 KST). 토큰 없는 `GET /api/v1/admin/users` = 401(배포 전 404), `/api/health` 200
- owner 지정: `.env`의 `DATABASE_URL`로 `UPDATE public.profiles SET role='owner' WHERE id=…`(1행). Supabase MCP 계정에는 이 프로젝트가 없어 쓰지 못함
- pro 지정(사용자가 직접 curl): `/me` 응답 `tier:"pro"`, `billingTier:"free"`(override라 정상), `limits` = 곡 100·분류 7·녹음 100MB·`takeSongs`/`takeDurationSec` null·drive/ai/communityWrite true — Q2 확정값과 일치
- `admin_audit`에 `tier_override` 행 1건(reason `운영자 본인 계정 pro 지정(M1-2a)`)
- 겪은 것: 첫 시도는 `T='<access_token>'`을 안 바꿔서 401·404 → 실제 토큰(브라우저 `localStorage` `sb-…-auth-token`의 `access_token`, 약 1시간 유효)으로 성공

## 6. 다음 step이 알아야 할 것

- 한도 검사 함수는 `ulevelp.service` 최상위 `Transaction` 확장(`TierService.kt`). M1-2b 재생목록 가져오기는 `remainingSongSlots(ctx)`로 "남은 칸까지", 새 분류는 `requireCategorySlot(ctx)`
- 화면 영향(M2에서 고칠 것): 옛 교체 모달은 `SINGLE_SONG_TAKE_LIMIT`(409)일 때만 열린다 → 이제 그 응답이 없다. 무료 사용자가 3번째 곡에 녹음하면 403이 일반 오류로 보인다. `migrate-local`이 403이면 `migratedLocalAt`이 안 바뀌어 화면이 다음 로그인 때 다시 시도할 수 있다(로컬 곡이 11곡 이상인 무료 사용자)
- **A12 Secret Manager**: `deploy-cloudrun.sh`의 `--set-secrets`가 `DATABASE_URL`·`SUPABASE_SECRET_KEY`·`APP_MASTER_KEY`만 연결한다 → YouTube·Gemini 키를 Secret Manager에 넣어도 Cloud Run에 안 보이는 것이 "못 읽음"의 유력 원인. M1-2b·M1-3에서 `YOUTUBE_API_KEY=…:latest` 등을 추가하고 런타임 SA 권한을 확인
- `analysis_jobs` 과금 열은 DB에만 있다(Exposed 정의는 M1-3)
