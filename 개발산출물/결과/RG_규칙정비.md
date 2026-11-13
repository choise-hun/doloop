# RG 규칙 정비 결과

- 작업: [진행 파일](../완료/진행_규칙정비.md) RG-1~3. 브랜치 `docs/rules-cleanup`.
- 확인 환경: 2026-11-12 Mac, 시작 `main`=`3ee3d6c`.

## 1. 점검에서 찾은 것 (작업 근거)

| # | 문제 | 근거 | 처리 |
| --- | --- | --- | --- |
| A1 | 정렬 규격이 "DESIGN.md 최우선"이라 하는데 `DESIGN.md`는 `.gitignore:17`로 제외된 개인 파일이다. 진입 문서(CLAUDE·AGENTS·GEMINI·`docs/rules/`) 어디에도 연결이 없었다 | `개발산출물/명세/UIUX-R_수정명세.md:55` "ignored 파일이며 현재 작업 트리에 없다" | RG-1 |
| A2 | 곡률·순백 검사가 파일 일부만 봤다(`test/r0_core.test.js` 2개 파일 + 화면별 테스트 몇 개). CSS 22개 중 새 파일은 자동으로 걸리지 않았다 | 같은 테스트의 `cssFiles` 목록 | RG-1 |
| A3 | 토큰 밖 색이 6개 파일에 25곳(hex 9, `rgba` 16) 있고 G5b는 경고 수준이다 | §2 표 | RG-1(늘지 않게 고정. 값 교체는 하지 않음) |
| C1 | 끝난 진행 파일 3개(CM-UI·PF·ST)가 루트에 남아 있었다 | 인수인계 메모 "완료 폴더 이동 대기" | RG-2 |
| C2 | 인수인계 메모가 PR #10 머지 전 상태였다(브랜치·main 커밋·활성 파일 수) | `git log` | RG-2 |
| B1 | 같은 규칙이 여러 문서에 복제돼 있었다(Step 개수 규칙 6개 파일, 시니어 직접 구현 예외 문장이 CLAUDE.md 안에서 2번) | `grep "최대 4개"` | RG-3 |
| B2 | config 보관본이 저장소와 달랐다(CLAUDE.md 1줄, 문서_운영 6줄, frontend-state 10줄, 4단계 템플릿 2줄) | `diff` | RG-3 |
| B3 | `docs/rules/`·주니어 체크리스트의 `PR #n` 근거가 옛 저장소 번호다(#10보다 큰 참조 78개, 이 저장소는 #1~#10) | `gh pr list` | RG-3 |
| B4 | 규칙의 코드 조각이 실제와 달랐다(`filterReqSeq`·`rec.take.song`·`rec.meta.song`은 코드에 0건, `dbQuery` 시그니처 차이) | `grep`, `DatabaseFactory.kt:123` | RG-3 |
| B5 | 시니어 직접 구현 Step이 "로컬 커밋까지"라 다른 PC로 넘길 수 없었다 | 문서_운영 §5 "미커밋 로컬 파일은 git으로 전달되지 않는다"와 같은 이유 | RG-3 |

판단 기준(사용자 결정 2026-11-12): `DESIGN.md`는 참고 프로필이다. 실제 규칙은 레이아웃 규격과 `tokens.css`에 구현된 값이다. 그래서 프로필과 구현이 다른 부분(기존 화면의 필 배지, 표면 색 값, 선택 상태의 어두운 채움)은 **구현을 기준**으로 문서화했고 화면은 바꾸지 않았다.

## 2. RG-1 디자인 규칙 자립

- 신설: [`docs/rules/frontend-design.md`](../../docs/rules/frontend-design.md) — 토큰 용도, 필/직각 구분, 글자·컨트롤 크기, 검사 위치. `tokens.css`와 정렬 규격 §5-4·§6에 이미 있던 결정을 모은 것이고 새 디자인 결정은 넣지 않았다. 새로 명시한 것은 두 가지다: 새 화면의 누를 수 없는 라벨은 필로 만들지 않는다(기존 화면은 유지), 본문 글자는 12px 이상.
- 참조 교체: 정렬 규격 v1.6(§5-1·§5-4·Q8, 판정식·기준값 변화 없음), `tokens.css` 주석 3곳, 요구사항 명세 1곳, `frontend-layout.md`, CLAUDE·AGENTS·GEMINI 진입 줄.
- 신설 검사: `test/design_rules.test.js` DR-1~4. `frontend/src`의 모든 CSS를 걸어 다니며 본다.

| 검사 | 내용 | 현재 |
| --- | --- | --- |
| DR-2 | 곡률은 `0`·`0px`·`50%`·`9999px`·`var(--radius-pill)`·`var(--radius-card)`·`var(--radius-card, 0)`만 (`border-*-radius` 포함) | 위반 0 |
| DR-3 | 순백 `#fff`·`#ffffff` 없음(주석 제외) | 위반 0 |
| DR-4 | 토큰 밖 색(hex + `rgb()`/`hsl()` 호출)이 파일별 허용 개수를 넘지 않음. 줄면 표를 내리라고 실패 | 아래 6개 파일 25곳 고정 |

| 파일 | hex | `rgba` |
| --- | --- | --- |
| `components/songRecord/PracticeSessionCard.module.css` | 4 (`#059669` `#d97706` `#dc2626`×2) | 0 |
| `components/community/EpisodeReportDialog.module.css` | 2 (`#dc2626` `#059669`) | 6 |
| `components/songRecord/EpisodeShareDialog.module.css` | 1 (`#dc2626`) | 4 |
| `components/community/EpisodeLogFeed.module.css` | 1 (`#dc2626`) | 1 |
| `components/community/Community.module.css` | 0 | 3 |
| `pages/PracticePage.module.css` | 1 (`#000000`) | 2 |

실행 결과:

```text
$ node --test test/design_rules.test.js
ℹ tests 4 / pass 4 / fail 0

# 실패 확인: HomePage.module.css 끝에
# .zzTmp { border-top-left-radius: 8px; color: #abcdef; background: #fff; } 를 임시로 넣음
DR-2 … HomePage.module.css → border-top-left-radius: 8px
DR-3 … HomePage.module.css → #fff
DR-4 … HomePage.module.css → 2개 (허용 0)
# 원복 후 git status에 해당 파일 변경 없음

$ npm test
ℹ tests 420 / pass 420 / fail 0
```

미실행: Playwright E2E(화면·마크업 변경 없음, CI에서 실행), 스크린샷 검토(화면 변경 없음).

남긴 것(디자인 결정이 필요해 손대지 않음):

- 토큰 밖 색 25곳을 `--good`·`--bad`·`color-mix`로 바꾸는 일. 색이 달라지므로 화면 작업으로 한다.
- 대비 4.5 미만 조합: `--muted`/`--surface2` 4.09, `--orange-terra`/`--bg` 4.26, 다크 `--root-ink`/`--root` 3.72.
- 글자 크기 종류가 20가지다(11px 56곳, 10px 이하 14곳). 단계 정리는 하지 않았다.

## 3. RG-2 상태 정리

- `git mv`로 `진행_CM-UI.md`·`진행_PF.md`·`진행_ST.md`를 `완료/`로 옮기고 제목 아래 완료 줄을 넣었다. 계획 문서 #8·#9·#10의 진행 파일 링크 3개를 새 위치로 고쳤다. 옛 명세·결과 파일 속 경로는 규칙대로 고치지 않았다.
- 인수인계 메모: 갱신 PC·`main`=`3ee3d6c`·열린 PR 0건으로 고치고, 활성 표를 루트 `진행_*.md`(모바일스파이크·다중LLM자동화검토 2건)와 맞췄다. S3b·CMR-4는 착수 전이라 진행 파일 없이 "착수 전 대기"로 옮겼다. Mac 체크리스트의 M-019 항목은 반영이 끝나 지웠다(교환 기록 `mac=추가 2026-11-11`, `~/config` remote `choise-hun/config`, `gh auth status` 2계정 확인).
- 계획 문서 머리에 "PR #100 이상은 옛 저장소 번호라 링크가 열리지 않는다"는 주의를 넣었다. 해당 링크는 6개다.

확인:

```text
$ ls 개발산출물/진행_*.md      # 이 작업 파일 이동 전
진행_규칙정비.md  진행_다중LLM_자동화검토.md  진행_모바일스파이크.md
$ python3 linkcheck.py (인수인계·계획·docs/rules·정렬 규격·진입 문서 14개)
깨진 링크 2 — 둘 다 완료/진행_규칙정비.md(RG-3 끝에 이동하면 해소)
```

## 4. RG-3 규칙 정비

| 항목 | 바꾼 것 |
| --- | --- |
| 중복 축소 | Step 개수·크기 규칙의 원본을 [협업 설명서 §1.2](../협업_시니어주니어.md)로 정하고, `docs/문서_운영.md` §4.1과 4단계 템플릿 §1·2는 요약과 링크로 줄였다. CLAUDE.md는 Step 줄을 원본 링크로 바꾸고, 두 번 적혀 있던 시니어 직접 구현 예외 문장을 한 번으로 줄였다 |
| 손대지 않은 중복 | AGENTS.md·GEMINI.md의 종료 보고 형식과 한 줄 요약은 그대로 뒀다. 각 모델이 자기 진입 문서만 읽고 움직이도록 조정해 온 문구라, 줄이면 다른 모델의 동작이 달라질 수 있다 |
| 옛 PR 번호 | `docs/rules/` 3개 파일과 주니어 체크리스트 머리에 "PR #n은 옛 저장소 번호" 안내를 넣었다. 본문의 출처 표기 78개는 이력이라 그대로 뒀다 |
| 코드 조각 | `backend-kotlin.md` §1을 실제 `DatabaseFactory.dbQuery`(인자 `db`, 블록 앞뒤 `ensureActive`)와 같게 고쳤다. `frontend-state.md` §1의 `filterReqSeq`를 실제 이름 `reqSeqRef`로 바꾸고 기준 구현 파일을 적었다. §4는 코드에 없는 키 목록(`rec.take.song` 등) 대신 `auth.ts` `signOut()`의 실제 순서로 다시 썼다. 줄 번호는 금방 어긋나므로 파일·함수 이름만 적었다 |
| 시니어 직접 구현 | "로컬 커밋까지" → "커밋·작업 브랜치 push까지, PR은 만들지 않는다". 고친 곳: CLAUDE.md, AGENTS.md, GEMINI.md §0 [A], 문서_운영 §6, 협업 설명서 §1.2의 표와 노동 분리 줄, 4단계 템플릿 0단계. 전체 회귀·PR 생성·CI 대기·결과 파일을 주니어가 맡는 것은 그대로다 |
| 낡은 고정 참조 | 협업 설명서 §0의 "2026-11-07 기준 … `완료/진행_프론트기반.md`" 문구를 "인수인계 메모 §2와 실제 목록으로 확인"으로 바꿨다 |
| config 동기화 | 원본은 이 저장소, config는 보관본으로 정했다. `scripts/check-config-sync.sh`(대조)와 `--copy`(복사)를 추가하고 절차를 문서_운영 §5에 적었다. `docs/rules/frontend-layout.md`는 config 쪽이 여러 프로젝트용 범용판이라 대조에서 뺐다. `frontend-design.md`는 `ULevelP/rules/frontend-design.md.template`로 새로 보관한다 |

하지 않은 것: 문서 제목 `ULeveLP`·패키지 이름 `guitar-chord-lab`·저장소 이름 `doloop`의 통일(이름 결정이 필요), 계획 문서의 옛 PR 링크 6개 교체(주의 문구만 추가).

## 5. PR·CI·리뷰

- PR: [#11](https://github.com/choise-hun/doloop/pull/11) `docs/rules-cleanup` → `main`. 커밋 RG-1 `04023c4`, RG-2 `cdb639c`, RG-3 `da1b79b`.
- CI(head `da1b79b`, run 43218894068): Detect code changes·Test (Node 22)·E2E XSS & CSP (Playwright, spa)·Docker build & smoke test·CI ok 통과. Kotlin test는 백엔드 변경이 없어 건너뜀.
- 리뷰: Codex 자동 리뷰가 `da1b79b`에서 완료, 지적 0건(`has_any_findings: false`). 사람 리뷰·라인 코멘트 0건(2026-11-12 조회).
- config: `choise-hun/config` `af02e40`에 보관본 10개 동기화. `bash scripts/check-config-sync.sh` → 차이 0건(`da1b79b` 기준). 이 절을 추가한 문서 커밋은 대조 대상 파일을 바꾸지 않는다.
- 운영 배포: 해당 없음(문서·테스트·CSS 주석 변경).
