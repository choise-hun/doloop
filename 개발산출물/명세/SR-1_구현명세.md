# SR-1 구현 명세 — 연습 화면에 "이 곡의 연습 기록" 붙이기

- **작성:** 2026-11-06 (win, 시니어) · 진행 파일 `개발산출물/진행_연습기록연결.md`
- **계기:** 사용자 요청(FX-2 실측 뒤) — "녹음은 그 곡에 붙어서 보여야 한다. 연습 화면 플레이어 아래(푸터를 밀어내고)에서 그 곡의 연습 기록을 볼 수 있어야 한다. 지금은 연습과 연습 기록이 완전히 분리돼 쓰기 불편"
- **스크린샷 기준:** 플레이어(영상 + 오른쪽 조작판)와 진행 막대 아래, 테마 푸터(라이트/다크) 위의 빈 칸 = 새 영역
- **함께 고칠 것:** 무료 녹음 한도 모달(`결과/RZ-M_실환경점검.md` 발견 2) — 같은 화면·같은 녹음 흐름이라 한 PR

## 0. 지금 코드 (전제 — 직접 연 곳, 2026-11-06 main `37e42b0`)

| 사실 | 위치 |
| --- | --- |
| 곡 상세 API가 이미 그 곡의 세션·녹음을 같이 준다 → **백엔드 변경 없음** | `apiClient.ts` `getSong` → `GET /api/v1/songs/{id}` → `SongDetailResponse { song, sessions, takes }` |
| 연습 화면 구조: `AppShell variant="player"` 안 `.pp-wrap` → `header.pp-head` + `div.pp-main`(그리드 `1fr 360px`, ≤1150 한 열) = `section.pp-stage` + `section.pp-ctl` | `PracticePage.tsx` `return (` 아래, `PracticePage.module.css` `.playerWrap`·`.ppMain` |
| 연습 화면의 계정 곡: `song` state(`SongDto \| null`). 로그인 + 계정 곡일 때만 id가 있다 | `PracticePage.tsx` `const [song, setSong]` |
| 녹음 업로드 성공 지점 | `PracticePage.tsx` `uploadTakeNow` 의 `setRecMsg({ text: … '계정에 저장됨' …})` 직전 |
| 진행 저장 성공 지점 | `PracticePage.tsx` `saveProgressNow` 의 `setSong(updatedSong)` |
| 기록 화면 곡 상세: 녹음 한 줄 `TakeItemRow`(듣기·삭제·비교 선택, Drive는 `drive.fetchMediaObjectUrl`), 세션 타임라인(`#detailTimeline`), A/B 비교(`#abPanel`, `handlePlayAbSlot`, 레이스 토큰) | `LogPage.tsx` `function TakeItemRow`, `#pane-song-detail` 섹션, `handlePlayAbSlot` |
| 기록 화면 곡 상세 URL | `log.html?song=<id>` (`LogPage.tsx` `pushState`) |
| 테스트가 기록 화면 id에 묶여 있다 | `test/r3_practice_log.test.js:308,567-568`(`detailTimeline`·`detailTakes`·`abPanel`·`abSlotA`·`abLabelA`·`abPlayA`·`abAudioA`…), `test/e2e/xss.spec.js:333-340`(`.ab-check`·`#abPanel`) |
| 무료 녹음 곡 초과는 `403 FREE_TAKE_SONG_LIMIT_EXCEEDED`, Drive는 유료만(`403 TIER_UPGRADE_REQUIRED`). 연습 화면은 옛 `409 SINGLE_SONG_TAKE_LIMIT`·`RECENT_SONG_ONLY`만 처리 | `TierService.kt` `requireTakeSongs`·`requireDrive`, `PracticePage.tsx` `uploadTakeNow` catch, `#takeLimitModal` |
| 서버 `replaceOldSongTakes: true` = 다른 곡의 서버(`supabase`) 녹음을 지운 뒤 한도 계산 — 지금도 동작 | `TakeService.kt` `checkUploadLimits` |
| e2e 가짜 API가 곡 상세를 지원 | `test/e2e/support/mock-app.js:172` `opts.songDetail` |

## 1. 결정 (시니어 — 바꾸려면 먼저 물을 것)

1. **위치:** `.pp-wrap` 안, `.pp-main` 바로 아래 `section#songRecord`. 푸터는 그 아래로 밀린다(별도 처리 없음 — 문서 흐름)
2. **보이는 조건:** 로그인 + `song`(계정 곡)이 있을 때 본문. 비로그인·계정 곡 없음은 한 줄 안내만(`로그인하면 이 곡의 연습 기록과 녹음이 여기에 모여요`). 영상이 없으면(`#emptyState`) 영역 자체를 그리지 않는다
3. **내용(순서):** 머리줄(제목 `이 곡의 연습 기록` + 누적 시간·최근 연습 날짜 + 오른쪽 `기록에서 자세히 →` 링크 `log.html?song=<id>`) → **녹음**(목록 + A/B 비교) → **연습 세션**(최근 순, 처음 5개 + `더 보기`로 전부). 곡 메모·상태·곡 삭제는 넣지 않는다(기록 화면에 남김)
4. **코드 재사용:** 기록 화면의 녹음 줄·A/B 비교·세션 타임라인을 **새 공통 컴포넌트로 옮기고**(복사 후 불필요한 부분만 삭제 — 이름·로직 다시 쓰지 않음) 기록 화면도 그것을 쓴다. 기록 화면의 id·클래스·문구는 **그대로**(테스트가 묶여 있음). id는 prop `idPrefix`로 받는다: 기록 화면 `''`(지금 id 그대로), 연습 화면 `'sr'`(예 `srTakes`·`srTimeline`·`srAbPanel`)
5. **새로고침 시점:** 진입(곡 확정) 때 1회 `apiClient.songs.get`, 녹음 업로드 성공·진행 저장 성공·녹음 삭제 뒤 다시 읽는다. 곡이 바뀌면 이전 응답은 버린다(요청 토큰 — `docs/rules/frontend-state.md` 비동기 레이스 방어)
6. **녹음 한도 모달(발견 2):** `403 FREE_TAKE_SONG_LIMIT_EXCEEDED`이면 `#takeLimitModal`을 연다. 문구는 "무료 플랜은 2곡까지 녹음을 저장할 수 있어요"(숫자는 응답 `detail.limit`). 버튼 = `다른 곡 녹음 지우고 이 곡 녹음 저장`(`replaceOldSongTakes: true`, **진행 파일 SR-Q1 답에 따름**) · `취소 (파일로 직접 저장 가능)`. "Google Drive 연결" 버튼은 **무료일 때 숨긴다**(Drive는 유료 전용). 옛 409 코드 분기는 지운다
7. **문구:** L0(`t()`) 머지 전이면 한국어 그대로, 머지 뒤면 새 문구는 `t('practice.record.*')`로(`명세/L0_구현명세.md` §1)

## 2. 파일 목록 (이 밖은 고치지 않는다)

| 파일 | 할 일 |
| --- | --- |
| `frontend/src/components/songRecord/SongRecordParts.tsx` (신규) | `LogPage.tsx`에서 옮김: `TakeItemRow`, `fmtTakeMeta`·`sortAbTakes`·`fmtDuration` 사용, A/B 비교 블록(`AbCompare` — `handlePlayAbSlot`·오디오 ref·레이스 토큰 포함), 세션 타임라인(`SessionTimeline`). `idPrefix` prop |
| `frontend/src/components/songRecord/SongRecordParts.module.css` (신규) | 위 컴포넌트가 쓰던 `LogPage.module.css` 규칙을 옮김(값 그대로) |
| `frontend/src/components/songRecord/SongRecordPanel.tsx` (신규) | 연습 화면용 묶음: 머리줄 + 녹음 + 세션(처음 5개 + 더 보기) + 비로그인 안내. props `{ songId: string \| null; loggedIn: boolean; reloadKey: number }` |
| `frontend/src/pages/LogPage.tsx` | 곡 상세의 녹음·A/B·타임라인을 공통 컴포넌트로 교체(`idPrefix=''`). 렌더 결과 동일 |
| `frontend/src/pages/LogPage.module.css` | 옮긴 규칙 삭제(다른 곳에서 안 쓰는 것만) |
| `frontend/src/pages/PracticePage.tsx` | `.pp-main` 아래 `<SongRecordPanel>`, `reloadKey`를 업로드·진행 저장 성공 때 +1, 한도 모달 §1-6 |
| `frontend/src/pages/PracticePage.module.css` | `#songRecord` 바깥 여백만(안쪽은 컴포넌트 CSS) |
| `test/e2e/layout/practice.spec.js` | 상태 `userData` + `songDetail`(세션 6개·녹음 2개) 추가, 배치 약속 확인 |
| `test/e2e/practice-record.spec.js` (신규) | 동작 테스트 §5 |

파일 9개·API 변경 없음. `frontend/src/lib/*`·백엔드·DB는 고치지 않는다.

## 3. 배치 약속 (정렬규격 §1-1 — 결과 파일에 그대로 옮긴다)

| 상태 | 화면 |
| --- | --- |
| `guest`·`guestLocal` | 영상 아래 한 줄 안내 |
| `userData` + 곡 상세(세션 6·녹음 2) | 머리줄 + 녹음 2줄 + 세션 5줄 + `더 보기` |
| `userData` + 곡 상세 빈 것 | 머리줄 + `아직 녹음이 없어요` + `아직 연습 세션 기록이 없어요` |

| 폭 | 열 구성 |
| --- | --- |
| 1280·1150 | 2열: 왼쪽 녹음(+A/B) · 오른쪽 연습 세션. 두 열의 **윗선**을 맞춘다. 전체 폭 = `.pp-main` 폭 |
| 768·390 | 1열: 머리줄 → 녹음 → 연습 세션. `기록에서 자세히 →`는 머리줄 아래 줄로 내려가도 됨 |

| 맞춤 그룹 (`data-align-group`) | 대상 |
| --- | --- |
| `sr-left` (left) | `#songRecord` 머리줄 · `.pp-stage` (왼쪽선이 영상과 같다) |
| `sr-cols` (top, ≥1150만) | 녹음 열 제목 · 세션 열 제목 |

## 4. 동작

1. 곡 확정(`song.id` 생김) → `apiClient.songs.get(id)` → 녹음·세션 그리기. 실패하면 영역 안에 `기록을 불러오지 못했어요` + `다시 시도` 버튼(화면 전체 오류 아님)
2. 녹음 업로드 성공 → `reloadKey+1` → 새 녹음이 목록 맨 위에 보인다
3. 녹음 줄 `삭제` → 확인창 → 목록에서 빠짐(기록 화면과 같은 동작)
4. A/B: 녹음 2개 선택 시 비교 칸이 열리고, 한쪽 재생 시 다른 쪽 멈춤(기록 화면과 같음)
5. 다른 곡으로 바꾸면(곡 목록 서랍) 이전 곡 응답이 늦게 와도 새 곡 기록만 보인다
6. 무료 한도 초과(403 `FREE_TAKE_SONG_LIMIT_EXCEEDED`) → 모달 §1-6. 교체를 누르면 `replaceOldSongTakes: true`로 다시 올리고, 성공하면 모달 닫힘 + 목록 갱신

## 5. 테스트

`test/e2e/practice-record.spec.js` (가짜 API `mock-app.js`, spa 모드):

| ID | 확인 |
| --- | --- |
| SR1-1 | `userData` + 곡 상세(녹음 2·세션 6): `#songRecord`가 `.pp-main` 아래, 푸터(`footer`)보다 위. `#srTakes .take-row` 2개, 세션 줄 5개 + `더 보기` 누르면 6개 |
| SR1-2 | `기록에서 자세히 →` href = `log.html?song=<id>` |
| SR1-3 | `guest`: 안내 문구 1줄, `#srTakes` 없음 |
| SR1-4 | 곡 상세 응답을 첫 곡은 1초 늦게, 둘째 곡은 바로 → 서랍에서 둘째 곡으로 바꾼 뒤 둘째 곡 녹음만 보임(레이스) |
| SR1-5 | 녹음 업로드 가짜 응답 403 `FREE_TAKE_SONG_LIMIT_EXCEEDED`(`detail.limit` 2, tier `free`) → `#takeLimitModal` 보임, Drive 버튼 숨김, 교체 버튼 → 요청 meta에 `replaceOldSongTakes: true` |
| SR1-6 | 잘못된 입력: 곡 상세 500 → 영역 안 오류 문구 + `다시 시도`, 플레이어는 그대로 |

기존 테스트: `test/r3_practice_log.test.js`·`xss.spec.js`·`layout/log.spec.js`가 **수정 없이** 통과해야 한다(기록 화면 id·동작 불변의 증거).

## 6. 완료 기준

```bash
npx tsc --noEmit -p frontend          # 0
npm test                              # 전부 통과 (win CRLF 2건은 인수인계 메모 §5)
npm run build && ULP_UI=spa node server.js &   # Git Bash
npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/log.spec.js test/e2e/xss.spec.js
LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/practice.spec.js   # 4개 폭 스크린샷 → 결과 파일 §6 질문표
```

결과 파일 `결과/SR-1_연습기록연결.md`: 배치 약속 표, spec 수정 전 실패 출력, 테스트 출력, 스크린샷 판정, PR 번호·CI.

## 7. 금지

- 백엔드·API·DB 변경, 새 라이브러리
- 기록 화면의 id·클래스·문구·동작 변경(옮기기만)
- 곡 메모·상태·곡 삭제를 연습 화면에 추가(범위 밖 — 필요하면 끝에 제안 한 줄)
- `public/*` 레거시 수정
