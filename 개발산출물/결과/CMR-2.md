# CMR-2 결과 — 커뮤니티 소개·“내 연습 공유하기”·빈 상태 단계 + 이름 모달·공유 가드

> 2026-11-12 / Claude(시니어 직접 구현) + Gemini(주니어 4단계 최종 테스트·문서·PR/CI 마무리).
> 명세: [CMR-2 구현 명세](../명세/CMR-2_구현명세.md) (상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §5.1·§5.2a·§5.4·§5.9·§8·§9(UR-07), 결정 §1.1(RV-10·RV-11)).
> 브랜치: `step/CMR-2` (base `main`=`e28421d`, PR #3 머지 이후).

---

## 1. 구현 요약

- **CommunityPage.tsx:**
  - 소개 영역 `section#communityIntro`를 머리줄 바로 아래 렌더하여 모든 상태에서 탭·guest 카드보다 먼저 노출(D1).
  - `#communityIntroDesc`는 항상 보이고, `#communityShareCta`(`log.html` 링크)와 `#communityShareHint`는 `readyMe`(`me.id === user.id`)일 때만 노출(D2).
  - CTA 클릭 시 이름이 없으면 `preventDefault` 후 `reason='share'` 모달을 띄우고, 저장 완료 시 `log.html`로 1회 이동(D3).
  - 인라인 배너 `#communityNameBanner` 및 관련 id/클래스 전면 삭제(D4).
  - 첫 진입 자동 모달(`reason='first'`) 상태 관리(`gate`) 및 `sessionStorage` skip 기억(`ulp:community-name-skip:<uid>`, try/catch 가드)(D6·D7).
  - `MySharesPanel`에 `requireName` (클라이언트 공개 켜기/다시 게시 사전 검사) 및 `onRequireName` (서버 409 대응) 연결(D8·D9).
  - `CurationRows`에 `emptyExtra`로 3단계 `ol#communityEmptySteps`와 `a#communityEmptyShareCta` 전달(D11).
- **PublicNameModal.tsx (신규):**
  - `PublicNameForm` 재사용(`inputId="communityNameModalInput"`, `submitId="communityNameModalSave"`)(D5).
  - `acquireSave`를 통해 저장 중 플래그 소유: 저장 중 닫기·ESC·나중에·배경 클릭 무시 및 버튼 disabled(D13).
  - 첫 요소 포커스, Tab/Shift+Tab 포커스 트랩, 닫힘 시 이전 포커스 복귀, 배경 스크롤 잠금(`overflow='hidden'`) 및 복원(D12).
- **MySharesPanel.tsx:**
  - 선택 prop `requireName?: () => boolean` 추가: Pro 검사 뒤, 낙관 갱신 앞 단계에서 호출되어 `false`면 즉시 return(D9).
  - 공개 켜기(`kind='public' && nextPublic`) 및 다시 게시(`republish`)만 가드하고, 공개 끄기·자동 연동은 가드하지 않음(D8).
- **CurationRows.tsx:**
  - 선택 prop `emptyExtra?: React.ReactNode` 추가.
  - `#communityAllEmpty`를 `<div>`로 변경하고 `<p>{t('community.allEmpty')}</p>` + `emptyExtra` 렌더(D11). **`variant === 'home'` 분기 변경 0줄.**
- **CSS:**
  - `CommunityPage.module.css`: `.intro`·`.introDesc`·`.introCta`·`.introHint`·`.emptySteps`·`.emptyShareCta` 추가, `.nameBanner/.bannerTitle` 삭제.
  - `Community.module.css`: `.nameModalBackdrop`·`.nameModalCard`·`.nameModalTitle`·`.nameModalDesc`·`.nameModalReason`·`.nameModalFoot`·`.nameModalClose` 추가, `.emptyMsg` 컨테이너 flex 보정, 미사용 `.nameBanner/.bannerTitle` 삭제.
- **i18n (`ko`, `en`, `ja`):**
  - 새 키 10개 추가: `community.introDesc`, `shareCta`, `shareCtaHint`, `emptyStepPick`, `emptyStepCheck`, `emptyStepAgree`, `nameModalTitle`, `nameModalShareReason`, `nameModalSkip`, `nameModalClose` (기존 키 값 불변).

---

## 2. 테스트 변경 및 추가

- **`test/e2e/community.spec.js`:**
  - **CM-10 id 치환:** `#communityNameBanner` → `#communityNameModal`, `#communityBannerNameInput/Save` → `#communityNameModalInput/Save` (공백 이름 요청 0, 중복 409 alert 단언 유지).
  - **CMR2-1~17 테스트 전수 추가 (17개 케이스 100% 통과):**
    - `CMR2-1`: Pro·이름 있음, 1280/390에서 소개 문구·CTA·힌트 표시, 모달 0, 탭보다 앞
    - `CMR2-2`: guest에서 설명 표시, CTA 0, 로그인 링크, 인증 API 호출 0, 모달 0
    - `CMR2-3`: me 로딩 중 loading+설명 표시, CTA 0, 모달 0, 해제 후 정상
    - `CMR2-4`: 이름 없으면 모달 자동 열림·입력 focus·배너 0·사유 0·body 스크롤 잠금
    - `CMR2-5`: 닫기·ESC·나중에·배경 클릭 모두 skip 기억, overflow 원복, 새로고침 후 모달 0
    - `CMR2-6`: 건너뛴 뒤 CTA 클릭 시 share 모달·URL 유지·이름/공유 요청 0
    - `CMR2-7`: 공유 모달에서 이름 저장 성공 시 log.html 1회 이동 및 PUT 1회
    - `CMR2-8`: PUT 409 시 모달·입력값 유지, 경고 문구 표시, 이동 0
    - `CMR2-9`: PUT 응답 보류 중 Skip·Close disabled, ESC 무시, 중복 클릭 시 PUT 1회 유지
    - `CMR2-10`: 마지막 요소에서 Tab 시 첫 요소, 첫 요소에서 Shift+Tab 시 마지막 요소 (포커스 트랩)
    - `CMR2-11`: sessionStorage 예외 시에도 모달·건너뛰기 정상 동작, console 에러 0, 새로고침 시 다시 열림
    - `CMR2-12`: 사용자 A skip 기록이 사용자 B에게 영향 없음 (계정별 skip)
    - `CMR2-13`: 이름 없음·skip 후 공개 스위치 클릭 시 share 모달 열림, PUT 0, 스위치 복귀 및 focus 복귀
    - `CMR2-14`: 이름 저장 성공 후 모달 닫힘·share PUT 0(자동 게시 없음), 다시 클릭 시 PUT 1
    - `CMR2-15`: 클라이언트 통과 후 서버 PUBLIC_NAME_REQUIRED 시 스위치 원복 + share 모달 열림
    - `CMR2-16`: 전체 빈 상태에서 3단계 li 순서·문구, CTA href, 가짜 카드 0
    - `CMR2-17`: 프로필 화면에서 이름 없어도 공유 스위치 클릭 시 기존대로 PUT 발생, 커뮤니티 모달 0
- **`test/e2e/cm-ui.spec.js`:**
  - **CMR1-3 단언 갱신:** 명세 D11에 따른 `#communityAllEmpty` div화 및 `emptyExtra` 하위 포함에 맞추어 `toHaveText` → `toContainText('아직 공유된 연습이 없어요')`로 갱신 (단언 의미 100% 유지).
- **`test/e2e/layout/profile.spec.js`:**
  - **PF2-08 id 치환:** 인라인 배너 삭제에 따른 모달 id 치환, 전환 후 단언 유지.
- **`test/e2e/layout/community.spec.js`:**
  - `community-name-modal` suite 추가 (이름 없는 계정 첫 진입 모달 4폭+다크 검사).
- **`test/e2e/support/community-fixtures.js`:**
  - `skipNameModal(page, uid)` 헬퍼 함수 추가.

---

## 3. 검증 결과

| 명령 | 결과 | 상세 |
| --- | --- | --- |
| `npm run build` | 통과 | `tsc --noEmit && vite build` 정상 빌드 완료 |
| `npm test` | 416 pass / 0 fail | Node 테스트 58개 스위트 전체 통과 (3.77s) |
| 표적 Playwright E2E | 31 pass / 0 fail | `test/e2e/community.spec.js` (CM-1~14 + CMR2-1~17) 전수 통과 (22.7s) |
| 레이아웃 스크린샷 (`LAYOUT_SHOTS=1`) | 26 pass / 0 fail | `test/e2e/layout/community.spec.js` (5 suites × 4폭 + 다크) (16.8s) |
| 전체 Playwright E2E (`npx playwright test`) | 680 pass / 0 fail | 680 passed (9.4m), 전체 회귀 결함 0건 |

### 명세 §9 체크리스트 정적 점검
- `git grep -n "communityNameBanner\|communityBannerName" -- frontend/src test`: CMR2-4 부재 단언 1줄 제외 0건.
- `git diff main -- frontend/src/pages/ProfilePage.tsx`: 0줄 (프로필 페이지 무변경).
- `git diff main -- frontend/src/components/community/CurationRows.tsx`: `variant === 'home'` 분기 변경 0줄.

---

## 4. 4폭(390·768·1150·1280) + 다크 스크린샷 Q1~Q9 판정

캡처 파일: `test-results/layout-shots/community-{guest,pro,logs,empty,name-modal}-{390,768,1150,1280,1280-dark}.png`

| # | 질문 | 판정 | 상세 근거 (소개 CTA·이름 모달·빈 상태 3단계·4폭 반응형 중점) |
|---|---|:---:|---|
| Q1 | 가장 중요한 것 하나 / 강한 버튼 필 하나 | ○ | `#communityShareCta`가 화면의 유일한 강한 필 버튼(`pillBtn`, 높이 48px)으로 시각적 위계가 명확하며, 빈 상태 CTA는 `ghostBtn`으로 보조 위계 준수 |
| Q2 | 같은 위계 칸 사이 여백 / 한쪽 빈 덩어리 없음 | ○ | `#communityIntro` 내부 문구와 CTA 묶음 사이의 간격이 균형적이며, 모달 카드 패딩과 폼 요소 상하 마진 일관 |
| Q3 | 기준선 어긋남 없음 / 약속 준수 | ○ | 소개 영역 `#communityIntroDesc`와 CTA 묶음 `introCta`가 `communityIntro:center-y@768` 약속에 맞춰 768px 이상에서 수직 중앙 정렬 일치 |
| Q4 | 크기·굵기·명도 위계 / 무분별한 색 없음 | ○ | 모달 제목(h2), 설명(p), 입력 라벨, 힌트(`var(--muted)` 13px)의 글자 크기와 무채색 명도 단계가 명확 |
| Q5 | 빈 상태가 고장 같지 않고 자연스러움 | ○ | 전체 빈 상태에서 문구 아래 3단계 가이드(`ol#communityEmptySteps`)와 `a#communityEmptyShareCta`가 자연스럽게 이어져 사용자 행동 유도 |
| Q6 | 390 1열 순서 / 768 2열 빈칸 없음 | ○ | 390px에서 모달이 하단 바텀 시트(폭 100%, 패딩 16px)로 배치되고, 768px 이상에서는 중앙 다이얼로그(최대 480px)로 자연스럽게 전환 |
| Q7 | 유채색 절제 | ○ | 강한 CTA 필 버튼과 링크 외에 불필요한 유채색 사용이 없으며 디자인 토큰 컬러 엄격 준수 |
| Q8 | 곡률 조화 / 1px 라인 준수 | ○ | 모달 카드의 `var(--radius-card)` 및 `1px solid var(--line)`, 입력창 테두리, 버튼 반경이 시스템 디자인 규격과 조화 |
| Q9 | 다크 모드 대비 | ○ | 다크 모드 1280px에서 모달 백드롭 반투명 음영, 카드 표면 색상(`var(--surface)`), 텍스트 대비가 WCAG 기준을 충분히 만족 |

---

## 5. Git 처리 및 CI 확인

- **브랜치:** `step/CMR-2`
- **PR:** (main 대상 PR 생성 예정)
- **미실행 명시 대상:** 실제 백엔드 서버의 공개 이름 7일 변경 제한·금칙어 DB 검사(가짜 API로 형식/중복 검증 완료), 실기기 물리 키보드/스크린리더 음성 출력.
