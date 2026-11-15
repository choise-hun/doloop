# WF-1 결과 — 문구·재생목록 모달·시안·문서

> 2026-11-15 / 시니어(Claude) / 브랜치 `fix/WF-1-playlist-mic`. 진행 파일: [진행_웹수정WF](../진행_웹수정WF.md)

## 1. 바꾼 것

| 파일 | 내용 |
| --- | --- |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | `practice.micPermissionNeeded`에서 노션 언급 제거 → "마이크 권한이 필요해요. 브라우저 주소창에서 마이크를 허용해 주세요" (en/ja 같은 뜻) |
| `frontend/src/components/community/PlaylistImportModal.tsx` | ① `touched` 상태 추가(분류 라디오·선택·이름을 사용자가 바꾸면 true) ② 바깥 클릭은 `touched`·처리 중이 아닐 때만 닫음 ③ "이 곡만 열기"가 `touched`면 곡을 계정에 넣고(`songs.byVideo` → 없으면 `songs.create`) 고른 분류에 담은 뒤(`categories.create`/`songs.update`) 연다 |
| `frontend/src/pages/PracticePage.tsx` | `onOnlyThis`에서 곡·분류 목록도 다시 읽음(`loadSongList({ silent: true })`) |
| `test/e2e/community.spec.js` | WF-1 테스트 2건 추가 |

API·DB 계약 변경 없음(기존 `POST /api/v1/songs`, `POST /api/v1/categories`, `PATCH /api/v1/songs/{id}`만 사용).

## 2. 동작 결정 (명세가 모호했던 부분)

- **"이 곡만 열기"가 분류를 따르는 조건 = 사용자가 분류 칸을 직접 건드렸을 때만.** 모달은 처음에 "새 분류 만들기 + 재생목록 제목"이 미리 골라져 있어서, 무조건 따르면 곡 하나만 열려던 사람에게 원치 않는 분류가 생긴다. 건드리지 않았으면 예전처럼 열기만 한다(곡은 연습 화면에서 저장할 때 미분류로 들어감).
- **닫기 수단은 기존 `취소` 버튼.** 입력을 바꾼 뒤에는 바깥 클릭이 무시되고 `취소`로만 닫힌다. 별도 X 버튼은 넣지 않았다(모달 배치 변경 → 필요하면 WF-2에서).
- 순서는 곡 → 분류 → 담기. 분류 만들기가 실패(이름 중복·칸 없음)하면 오류를 모달에 보여 주고 닫지 않는다. 새 분류를 만든 뒤 담기가 실패하면 선택을 "기존 분류"로 바꿔 두어 다시 눌러도 분류가 두 번 생기지 않는다.
- 제목 없이 곡을 만들면 서버가 oEmbed로 채운다(`SongService.kt` 284~292행).

## 3. 데스크탑 화면이 작게 고정돼 보이는 원인 (분석만)

1. `AppShell.module.css` `.playerShell`이 `max-width: var(--container-max)` = 1120px. 플레이어용 `--player-max: 1280px`(`tokens.css:63`)는 정의만 있고 쓰는 곳이 없다.
2. `PracticePage.module.css` `.ppMain`이 `minmax(0, 1fr) 360px` → 영상 폭 최대 1120 − 360 − 16 = 744px(높이 약 418px). 창이 커도 같다.
3. 글자·버튼이 전부 px 고정이라 창·해상도에 따라 커지지 않는다. 브라우저 확대는 961px 미만 한 열 배치로 넘어가 버린다.

방안(가 폭 상한 올리기 — 추천 / 나 크게 보기 전환 / 다 글자·버튼 비례)은 [WF_시안.html](../명세/WF_시안.html) §4. 선택은 진행 파일 §4.

## 4. 검증

| 명령 | 결과 |
| --- | --- |
| `npm run build` | `tsc --noEmit` 통과, `✓ built` |
| `npx playwright test test/e2e/community.spec.js -g "WF-1\|CM-8"` | `3 passed (2.9s)` — CM-8(이 곡만 열기, 가져오기 POST 0), WF-1 2건 |

- 미실행: 전체 e2e·`npm test`는 로컬에서 돌리지 않았다(PR CI에서 확인 — 결과는 진행 파일 §5).
- 사람 확인 필요: 실제 로그인 계정으로 홈·연습 화면에서 "이 곡만 열기" + 새 분류/기존 분류, 분류 칸이 꽉 찬 Free 계정의 오류 문구.

## 5. 다음 step에 넘길 것

- WF-2는 `#ppRecCard`·`#recMsg`·`#recDriveBanner`·`#recDriveBadge`·`#btnRecDriveConnect`·`#recRetry`·`#recSave`·`#recPlay`를 옮기거나 없앤다. 착수 전에 `test/`에서 이 id 참조를 검색해 유지 목록을 만든다.
- `recMsg`로 나가는 문구는 14곳(`PracticePage.tsx` `setRecMsg(` 검색) — 팝오버로 옮길 때 진행 문구("녹음 중", "녹음 올리는 중…")와 오류 문구를 구분한다.
