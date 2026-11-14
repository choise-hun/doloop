# DS-1 결과 — 토큰·규칙 개정(주황 값, 프레임 바·배너 예외), 토큰 밖 색 교체, 대비 처리

> 작업: DS-1 (2단계 주니어 구현·검증·PR) | 브랜치: `step/DS-1` | PR: [#19](https://github.com/choise-hun/doloop/pull/19) | 기준 명세: [DS-1_구현명세.md](../명세/DS-1_구현명세.md)
> 상태: PR #19 검증 중 (시니어 3-P 핀포인트 검토 대기)

## 1. 변경 요약

### 1-1. 토큰 값 변경 및 신규 토큰 (`frontend/src/styles/tokens.css`)
- **주황 값 변경 (D1):**
  - 라이트 `:root`: `--orange-terra: #e64d01`, `--now-ring: #e64d01`, `--moved: #e64d01`
  - 다크 두 블록(`@media (prefers-color-scheme: dark)` 및 `:root[data-theme="dark"]`): `--orange-terra: #ff6b2b`, `--now-ring: #ff6b2b`, `--moved: #ff6b2b`
- **다크 `--root-ink` 대비 개선 (D8):**
  - 다크 두 블록: `--root-ink: #141413` (`--root` `#5c74f0` 위 대비 3.72 → 4.57)
- **신규 토큰 2개 (D6, 5번 섹션 끝):**
  - `--scrim`: 라이트 `rgb(0 0 0 / 0.45)`, 다크 두 블록 `rgb(0 0 0 / 0.6)`
  - `--media-bg`: 라이트·다크 `#000000`
- **주석 개정:** 머리 주석 2~3번, 3·4번 섹션 주석을 새 규칙에 맞게 갱신. 파랑 값·`--muted` 값·토큰 이름 삭제 없음.

### 1-2. 규칙 문서 및 정적 검사 개정
- [docs/rules/frontend-design.md](../../docs/rules/frontend-design.md):
  - §1 용도 표 파랑(기존 화면 전용)·주황(유일한 포인트) 교체, `--scrim`·`--media-bg` 추가
  - §1 `--surface2` 위 `--ink` 강제, 홈 커뮤니티 배너 예외, 새 화면 유채색 주황 하나 문구 반영
  - §1 "알려진 예외" 표 삭제(토큰 밖 색 0)
  - §2 프레임 상단 바·'이어서' 선(3px) 예외 명시, §4 "토큰 밖 색" 수정
- [개발산출물/프론트_정렬규격.md](../프론트_정렬규격.md) (v1.7): §5-4 3px 예외, Q1·Q7 문구, §10 변경 이력 추가.
- [test/design_rules.test.js](../../test/design_rules.test.js): `KNOWN_RAW_COLORS = {}`, DR-4 제목 변경, DR-5(`주황 토큰을 글자색으로 쓰지 않는다`) 추가.

### 1-3. 화면 CSS 교체 (22곳 + 대비/경고 3곳)
- §3 표 22곳(6개 파일: `Community.module.css` 3, `EpisodeLogFeed.module.css` 2, `EpisodeReportDialog.module.css` 8, `EpisodeShareDialog.module.css` 2, `PracticeSessionCard.module.css` 4, `PracticePage.module.css` 3)을 `var(--scrim)`, `var(--media-bg)`, `var(--bad)`, `var(--good)`, `var(--ink)`, `color-mix()`로 교체.
- `Progressions.module.css` `.chipWarn`·`.warnLine`: `color: var(--ink)` (D3).
- `ProgressionsPage.module.css` `.jobs li`: `background: var(--surface)` (D9).

## 2. 검증 결과 (V1~V8)

| # | 검증 항목 | 결과 | 근거 출력 요약 |
| --- | --- | --- | --- |
| V1 | 구현 전 Red 확인 (`node --test test/design_rules.test.js`) | 통과(의도한 실패) | DR-4 6개 파일(22건) 실패, DR-5 `Progressions.module.css` 2건(`color: var(--orange-terra)`) 실패 |
| V2 | 구현 후 `node --test test/design_rules.test.js` | 통과 (5/5) | `pass 5`, `fail 0`, `duration_ms 43.645833` |
| V3 | 전체 단위 테스트 (`npm test`) | 통과 (433/433) | `ℹ tests 433`, `ℹ suites 58`, `ℹ pass 433`, `ℹ fail 0` |
| V4 | 타입 체크·빌드 (`npm run build`) | 통과 (오류 0) | `tsc --noEmit && vite build`, `✓ built in 936ms` |
| V5 | 변이 실패 확인 (`ProgressionsPage.module.css` 끝에 `.zz { color: var(--moved); background: rgba(0,0,0,.1); }` 임시 추가) | 통과(의도한 실패) → 원복 | DR-4 `ProgressionsPage.module.css → 1개 (허용 0)`, DR-5 `color: var(--moved)` 실패 확인 후 원복 |
| V6 | `grep -rnE "#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsla?\(" frontend/src --include='*.css' \| grep -v "tokens.css"` | 통과 (0줄) | 출력 0줄 |
| V7 | Playwright layout spec (`chords`, `log`, `practice`, `progressions`, `community`) | 통과 (170/170) | `170 passed (1.9m)`, 새 G5a 실패 0건, G5b 경고 0건 |
| V8 | 스크린샷 검토 (라이트·다크, 390·1280) | 통과 | 아래 §2-2 참조 |

### 2-1. DR-1~5 및 `npm test` 출력 끝부분
```text
✔ DR-1: 검사 대상 CSS가 실제로 수집된다 (0.316959ms)
✔ DR-2: 모든 CSS에서 곡률은 필(9999px)·직각(0)·원(50%)만 쓴다 (0.848375ms)
✔ DR-3: 모든 CSS에서 순백(#fff/#ffffff)을 쓰지 않는다 (0.121791ms)
✔ DR-4: tokens.css 밖에서 hex·rgb()·hsl()을 쓰지 않는다 (0.239042ms)
✔ DR-5: 주황 토큰을 글자색으로 쓰지 않는다 (0.216458ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
```
```text
ℹ tests 433
ℹ suites 58
ℹ pass 433
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4277.94525
```

### 2-2. V8 스크린샷 판정 (Q7 유채색 / Q9 다크 대비)
- ① **chords 지판 (`chords-scale-guest-1280`, `1280-dark`, `390`):** ○ — 근음(파랑), 지금 칠 음·고리(주황 `#e64d01` / 다크 `#ff6b2b`), 중립음 구분 명확. 다크 근음 점 글자(`--root-ink: #141413`) 가독성 양호.
- ② **practice (`practice-userData-1280`, `1280-dark`):** ○ — 영상 영역(`--media-bg: #000000`) 및 다크 오류 문구(`--bad`) 대비 양호.
- ③ **커뮤니티 모달 덮는 면 (`community-name-modal-communityNoName-1280-dark`):** ○ — `--scrim` (`rgb(0 0 0 / 0.6)`)으로 다크 모드에서도 배경과 모달이 명확히 분리됨. (신고 창 오류/성공 알림 및 공유 배지 3종은 CSS 토큰 치환 후 V6·V7 통과로 확인, 개별 모달 전용 상태 캡처는 미실행)
- ④ **log 달력 선택 칸 (`log-userData-1280`, `1280-dark`, `390`):** ○ — 오늘 선택 칸 테두리가 새 주황(`#e64d01` / 다크 `#ff6b2b`)으로 선명함.
- ⑤ **progressions (`progressions-userData-1280`, `1280-dark`, `390`):** ○ — Q7·Q9 대비 양호.

### 2-3. 미실행 범위
- 홈 화면 변화(주황 값 변경에 따른 스트릭·오늘 칸 색 변화는 의도된 사항이며 홈 정리는 DS-2), 운영 배포, 신고 다이얼로그·공유 배지 3종 전용 상태 스크린샷 단독 캡처.

## 3. DS-2 입력 및 관찰 (범위 밖)
- **DS-2 입력 3건:**
  1. 홈 주황 틴트는 `color-mix(in srgb, var(--now-ring) 12%, transparent)`를 사용한다.
  2. `.recentPlaceholder`의 `--muted` → `--ink`로 변경한다.
  3. 프레임 바·배너는 `docs/rules/frontend-design.md` §4-2(§1·§2) 예외 문구를 따른다.
- **관찰(범위 밖, 고치지 않음):** 라이트 건반 `.keyNow` 라벨(8px, `--root-ink`/`#e64d01` 3.57)은 예전부터 4.5 미만이며 `--now-ink`로 바꿔도 4.35이므로 글자 크기·굵기와 함께 봐야 한다(DS-3 후보).
