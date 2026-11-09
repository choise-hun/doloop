# 진행 — CM-UI 독립 커뮤니티와 세션 공유

- 갱신: 2026-11-09 / Windows / Codex.
- 목표: CM-UI 상세 명세에 따른 독립 커뮤니티 화면, 공용 세션 카드, 세션 공유/수정/철회/신고 동선 구현 및 검증.
- 입력: [계획](../계획/상용_서비스_계획.md) CM-UI, [요구사항](요구사항_명세_초안.md) REQ-3/AC-4~7, [CM-BE §9 인계](완료/진행_CM-BE.md), [CM-UI 상세 명세](명세/CM-UI_구현명세.md), [문서 운영](../docs/문서_운영.md), frontend-state/layout 및 testing-security 규칙·정렬 규격·현행 코드.
- 결과: [CM-UI 구현 및 검증 결과](결과/CM-UI_구현검증.md)
- 상태: **구현 및 로컬 검증 완료. Git 처리(커밋·push·PR 생성 및 CI 검증) 진행.**

---

## 1. 선행·Git 확인

1. 시작 `git status --short`: `개발산출물/결과/CM-BE_로컬검토.md` 등 사용자 작업 보존. 브랜치 `step/cm-ui` 생성 후 작업 진행.
2. PR #145 머지 및 origin/main 최신 확인 (`002516ed264a8a8066fe57700dac09e691dadae7`).
3. 기존 변경 및 이전 작업 파일 전수 보존.

---

## 2. 구현 및 검증 결과 요약

| 단계 / 항목 | 실행 내용 및 결과 | 판정 |
| :--- | :--- | :--- |
| **순수 함수 / DTO** | `episode.mts` 순수 헬퍼 7종, `apiClient.ts` 신규 DTO 9종 및 메서드 5종, `i18n/{ko,en,ja}.mts` 대칭 키 추가 | 통과 (`test/cm_ui.test.js` 8/8) |
| **독립 라우트 / 셸** | `/community.html` SPA 라우트 3곳 등록, 상/하단 6열 내비게이션, 홈 BETTER/VAULT 직각 홍보 배너 | 통과 (CUI-01, W1-1~6) |
| **화면 컴포넌트** | `CommunityPage` (ALL/LOG/SUMMARY/MY SHARES), `EpisodeLogFeed`, `EpisodeLogCard`, `EpisodeReportDialog` | 통과 (CUI-02~04, CUI-10~12) |
| **공용 세션 카드** | `PracticeSessionCard`, `EpisodeShareDialog`, `useEpisodeShares` (실제 loops 복원, 파트 아코디언, 메모 저장, 공유/철회) | 통과 (CUI-05~09) |
| **기존 화면 정돈** | `LogPage` 옛 커뮤니티 제거 및 `#community` 리다이렉트, `SongRecordParts` 타임라인 일원화 | 통과 (CUI-01, FT log) |
| **레이아웃 정렬 검사** | G0~G8 정렬 규칙 자동 검사 및 4폭(390/768/1150/1280px)·다크 모드 스크린샷 Q1~Q9 검토 통과 | 통과 (`layout/community.spec.js` 11/11) |
| **전체 E2E 회귀 검증** | `cm-ui.spec.js`(12) + `community.spec.js`(14) + `layout/log`(20) + `layout/home`(22) + `layout/shell`(8) = 총 87건 | **87 passed (0 failed)** |
| **실서버+격리DB 검증** | `EpisodeLogApiTest` Flyway v10 마이그레이션 및 권한/스냅샷/철회/allowlist 격리 DB 테스트 | **BUILD SUCCESSFUL (22s)** |

---

## 3. Git 처리 및 PR 생성 내역

1. **커밋 내역:**
   - `feat(community): CM-UI 독립 커뮤니티 화면, 공용 세션 카드 및 공유 동선 구현`
   - `test(community): CM-UI 검증 및 레이아웃/E2E 테스트 추가 및 기존 테스트 갱신`
   - `docs(community): CM-UI 구현 명세, 검증 결과 및 진행 문서 추가`
2. **원격 Push 및 PR:**
   - 브랜치: `step/cm-ui` -> `origin/step/cm-ui`
   - PR Base: `main`
3. **CI 모니터링:** `gh pr checks --watch` 통과 대기.

---

## 4. 인계 및 다음 작업 지침

- 머지는 사용자 담당이다.
- PR 머지 확인 후 다음 계획인 **PF (프로필/설정 분리)** 단계로 진행한다.

다음 세션 시작 지시:

```text
목표: PF (프로필/설정 분리) 상세 명세 작성 및 구현 준비.
선행: PR 머지 확인, git checkout main && git pull --ff-only, 기존 변경 보존.
범위: 계획/상용_서비스_계획.md §8 PF 항목 및 요구사항 REQ-4 / AC-8.
```
- **권장 Effort:** `중간`
