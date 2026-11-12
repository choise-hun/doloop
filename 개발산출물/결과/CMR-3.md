# CMR-3 결과 — 단일 표지·빠른 추가 시트·폴더 상세·부분 선택·createSong a/b·dev mock

> 2026-11-12 / Claude(시니어 핵심 구현) + Gemini(주니어 4단계 테스트·레이아웃·dev mock 검증·문서·PR/CI). 명세 [CMR-3](../명세/CMR-3_구현명세.md). 브랜치 `step/CMR-3`.

## 1. 작업 개요

- **목표:** 커뮤니티 폴더 카드의 단일 표지 개편, 데스크톱 `+` 버튼 및 모바일 꾹 누르기를 통한 빠른 추가 시트(`QuickAddSheet`), 폴더 상세 모달(`FolderSheet`) 재배치 및 부분 곡 선택 추가, 구간(a/b/rate) 보존 및 dev mock 모드 분리.
- **인계 및 역할 분담:**
  - **시니어 핵심 구현:** `fc35135`(핵심 구현), `8f1da01`(dev mock 분리)
    - `CommunityParts.tsx`: 카드 단일 표지 래퍼, `+` 버튼, 꾹 누르기 연결
    - `QuickAddSheet.tsx`: 빠른 추가 하단 시트, 곡 추가 a/b, 멱등 처리, `useSheetFocus`
    - `FolderSheet.tsx`: 상세 히어로, 컨트롤 바, 곡 목록, 부분 선택(`aria-label` 곡 제목, `span[data-item-status]`), 공유
    - `CurationRows.tsx`: `onQuickAdd`, `QuickAddSheet` 호스팅, 동적 import 기반 dev mock 연결
    - `Community.module.css`: 카드 셸, 퀵 추가 버튼, 상세 히어로 및 시트 레이아웃 토큰화
    - `EpisodeLogFeed.tsx`: 첫 페이지 mock 분기
    - `apiClient.ts`: `createSong` a/b/rate payload 지원
    - `i18n/{ko,en,ja}.mts`: 새 문구 14개 추가
    - 초기 테스트: CMR3-1, 3, 4, 6, 8, 9, 11, 15
  - **주니어 4단계 마무리:**
    - 남은 E2E 테스트(CMR3-2, 5, 7, 10, 12, 13, 14, 17~25) 작성 및 통과 (총 24개 전수 통과)
    - 레이아웃 테스트 suite(`community-folder-detail`, `community-quick-add`) 추가 및 G0~G8 정렬 검증 (총 34개 전수 통과)
    - `LAYOUT_SHOTS=1` 스크린샷 캡처 및 4폭+다크 Q1~Q9 판정
    - dev mock(`?mock=1`) 1280·390 캡처 및 3대 판정(선반 순서, 검은 표지, 시트 disabled) 검증
    - 전체 빌드(`npm run build`), 단위 테스트(`npm test`), Playwright 전체 회귀 검증
    - 결과 및 진행 파일 갱신, PR 생성 및 CI 확인

---

## 2. 코드 규모 초과 사유 (§12 C5 기록)

- **초과 내역:** 코드 diff +1075 / −181 (CSS +305, QuickAddSheet 280, FolderSheet +205)로 850줄 상한 초과.
- **사유:** 폴더 상세 및 하단 시트의 반응형 CSS 스타일과 시트 접근성 포커스 트랩(`useSheetFocus`) 구현이 초기 추정치보다 컸음.
- **조치:** 명세 §5 및 §12 C5에 따라 mock(D23~D26) 코드를 동일 브랜치 내 별도 커밋 `8f1da01`로 분리하고, 핵심 구현은 `fc35135`로 분리 유지하여 리뷰 부담을 완화함.

---

## 3. 검수 기준 (CMR3-1 ~ CMR3-26) 대조 결과

| ID | 검수 항목 및 기대 결과 | 실제 검증 결과 | 판정 |
| --- | --- | --- | --- |
| **CMR3-1** | 단일 표지: `.coverMosaic` 0, 카드 표지 `img` 1개, `coverVideoId` 표시 | `community.spec.js` CMR3-1 통과 | **통과 (Green)** |
| **CMR3-2** | 빈 표지: `coverVideoId:null` 시 `.coverEmpty` 배경 `--ink` 계산값, 제목 텍스트, `aria-hidden="true"` | `community.spec.js` CMR3-2 통과 | **통과 (Green)** |
| **CMR3-3** | 홈 보존: `index.html` `#discover` 카드에 `.cardShell`·`[data-quick-add]` 0, 줄 순서·문구 현행 | `community.spec.js` CMR3-3 통과 | **통과 (Green)** |
| **CMR3-4** | `+` 노출: 1280 폭 호버/Tab 포커스 시 `[data-quick-add]` opacity 1, 클릭 시 `#quickAddSheet` 개방 | `community.spec.js` CMR3-4 통과 | **통과 (Green)** |
| **CMR3-5** | `+` 숨김: 터치 디바이스(390폭)에서 `[data-quick-add]` `display:none` 확인 | `community.spec.js` CMR3-5 통과 | **통과 (Green)** |
| **CMR3-6** | 꾹 누르기: 390 touch 500ms 누름 후 `#quickAddSheet` 개방, 뒤따른 click 오작동 없음 | `community.spec.js` CMR3-6 통과 | **통과 (Green)** |
| **CMR3-7** | 꾹 누르기 취소: 20px 이상 드래그 이동 시 타이머 취소 및 시트 미개방, 본체 click 정상 동작 | `community.spec.js` CMR3-7 통과 | **통과 (Green)** |
| **CMR3-8** | 짧은 탭: 200ms 짧은 탭 시 빠른 추가 시트 미개방, 폴더 상세(`#folderSheet`) 정상 개방 | `community.spec.js` CMR3-8 통과 | **통과 (Green)** |
| **CMR3-9** | 곡 추가 a/b: 구간 정보 포함 곡 빠른 추가 시 POST 본문에 `rate, a, b` 전송, 성공 문구 노출 | `community.spec.js` CMR3-9 통과 | **통과 (Green)** |
| **CMR3-10** | 멱등: 이미 존재하는 곡 추가 시 POST 200 반환되어도 동일한 성공 안내 문구 표시 | `community.spec.js` CMR3-10 통과 | **통과 (Green)** |
| **CMR3-11** | a≥b 범위 밖: 비정상 구간(`a:60,b:30`, `rate:3`) 데이터는 본문에서 `a,b,rate` 제외 후 전송 | `community.spec.js` CMR3-11 통과 | **통과 (Green)** |
| **CMR3-12** | 곡 한도: 403 `SONG_LIMIT_EXCEEDED` 반환 시 `#quickAddAlert`에 한도 안내 문구 노출 | `community.spec.js` CMR3-12 통과 | **통과 (Green)** |
| **CMR3-13** | 폴더 담기: Pro 계정 `#quickAddClone` 성공 및 완료 문구 / 무료 계정 서버 요청 0 및 업그레이드 안내 | `community.spec.js` CMR3-13 통과 | **통과 (Green)** |
| **CMR3-14** | 상세 열기: 시트 내 `#quickAddOpen` 클릭 시 빠른 추가 시트 닫히고 해당 폴더 상세(`#folderSheet`) 개방 | `community.spec.js` CMR3-14 통과 | **통과 (Green)** |
| **CMR3-15** | 상세 구조: `.detailHero` → `#folderSheetControls` → `#folderSheetItems`, 바 버튼 순서 D16 일치, 불필요 버튼 없음, 제목 focus | `community.spec.js` CMR3-15 통과 | **통과 (Green)** |
| **CMR3-16** | 기존 계약: 기존 CM-3, CM-5, AV2 시나리오 및 셀렉터 전수 호환 | 전체 회귀 테스트 통과 | **통과 (Green)** |
| **CMR3-17** | 행 이동: 상세 곡 행 `a.detailTrackLink` 클릭 시 `practice.html?v=…&a=…&b=…` 정상 이동 | `community.spec.js` CMR3-17 통과 | **통과 (Green)** |
| **CMR3-18** | 부분 선택: 1·3번 체크 후 `#folderAddSelected` 클릭 시 순차 POST 2회, 성공 문구 노출, 2번 미선택 유지 | `community.spec.js` CMR3-18 통과 | **통과 (Green)** |
| **CMR3-19** | 선택 중 한도: 1·2·3 선택 후 2번에서 403 한도 발생 시 3번 호출 중단, 한도 경고 노출, 남은 선택 유지 | `community.spec.js` CMR3-19 통과 | **통과 (Green)** |
| **CMR3-20** | 잠금 및 닫힘: 곡 추가 순차 진행 중 `#folderClose` 닫기 시 남은 요청 중단 및 `pageerror` 0 | `community.spec.js` CMR3-20 통과 | **통과 (Green)** |
| **CMR3-21** | 계정 전환: 순차 추가 중 B 로그인 시 A 시트/상태 닫힘 및 B 화면 데이터 오염 없음 | `community.spec.js` CMR3-21 통과 | **통과 (Green)** |
| **CMR3-22** | 공유: 클립보드 복사 시 `community.html#folder=<id>` 복사 및 피드백 문구 노출 | `community.spec.js` CMR3-22 통과 | **통과 (Green)** |
| **CMR3-23** | 딥링크: URL `#folder=<id>` 진입 시 상세 시트 자동 개방, 닫힌 뒤 `#all` 해시 복구, 숨김 폴더 에러 처리 | `community.spec.js` CMR3-23 통과 | **통과 (Green)** |
| **CMR3-24** | 자기 폴더: `owner.id = me.id`인 경우 컨트롤 바에 `#folderShare`만 노출, `#folderSelectMode` 숨김 | `community.spec.js` CMR3-24 통과 | **통과 (Green)** |
| **CMR3-25** | ESC 및 포커스: 상세 및 빠른 추가 시트에서 ESC 입력 시 닫힘 및 트리거 요소로 포커스 복귀, Tab 순환 트랩 | `community.spec.js` CMR3-25 통과 | **통과 (Green)** |
| **CMR3-26** | mock 번들 제외: `npm run build` 후 `dist/assets/*.js`에 `ulp-community-mock` 0건 검증 | 동적 import 대안 적용으로 0건 확인 | **통과 (Green)** |

---

## 4. 스크린샷 4폭 및 다크 모드 Q1~Q9 판정

`LAYOUT_SHOTS=1` 실행으로 생성된 `community-folder-detail-{1280,1150,768,390}.png`, `community-folder-detail-1280-dark.png`, `community-quick-add-{1280,390}.png`, `community-quick-add-1280-dark.png` 검토 결과:

| # | 질문 | 1280px / 1150px (데스크톱) | 768px (태블릿) | 390px (모바일) | 다크(1280) |
| --- | --- | --- | --- | --- | --- |
| **Q1** | 가장 중요한 것 하나가 보이고 강한 버튼이 하나인가 | ○ 상세 히어로 표지 및 주 버튼(`#folderClone`/`#folderAddSelected`) 명확 | ○ 상단 히어로 및 주 액션 강조 유지 | ○ 1열 세로 스택 히어로 및 주 버튼 명확 | ○ 대비 선명 |
| **Q2** | 같은 위계 칸 사이 여백이 균등한가 | ○ 컨트롤 바 8px, 트랙 목록 12px 간격 균등 | ○ 섹션 간 16px 일관 | ○ 모바일 패딩 및 카드 간격 균등 | ○ 일관 |
| **Q3** | 눈에 걸리는 기준선 어긋남이 없는가 | ○ `detailHero:top@768`(표지·정보 윗선), 컨트롤 버튼 `center-y` 정확 일치 | ○ 윗선 정렬 유지 | ○ 1열 중앙/좌측 정렬 일관 | ○ 일치 |
| **Q4** | 위계가 크기·굵기·명도로 구분되는가 | ○ 폴더 제목(18px 볼드), 설명/메타(14px/12px muted) 구분 명확 | ○ 준수 | ○ 준수 | ○ 준수 |
| **Q5** | 빈 상태가 고장처럼 보이지 않고 다음 행동을 안내하는가 | ○ 빈 표지 검은 타일(--ink)에 제목 말줄임 정상 표기, 빈 폴더 안내 명확 | ○ 안내 유지 | ○ 안내 유지 | ○ 유지 |
| **Q6** | 390에서 순서가 의미 순서와 같은가, 768에서 어중간한 열이 없는가 | ○ 데스크톱 2열 히어로(표지 좌, 정보 우) 균형 우수 | ○ 768px 좌우 정렬 안정 | ○ 모바일 히어로 세로 적층 및 바 줄바꿈 안정 | ○ 동일 |
| **Q7** | 유채색 1가지 및 지정 용도만 쓰였는가 | ○ 브랜드 블루 및 시스템 토큰만 지정 용도 사용 | ○ 동일 | ○ 동일 | ○ 동일 |
| **Q8** | 컨트롤 곡률과 직각 카드 1px 선 디자인이 조화로운가 | ○ 버튼 `--radius-pill`, 시트/카드 `--radius-card` 조화로움 | ○ 조화로움 | ○ 조화로움 | ○ 조화로움 |
| **Q9** | 다크 모드에서 칸 경계와 글자 대비가 충분한가 | ○ 1px `--line` 테두리 및 텍스트 명도 충분 (G5a/G5b 준수) | — | — | ○ 대비 우수 |

---

## 5. dev mock (`?mock=1`) 화면 검증

`capture-mock.js` 및 Vite 개발 서버를 통한 `community-mock-1280.png`, `community-mock-390.png` 캡처 및 판정 결과:

1. **선반 순서 보존:**
   - `[ 'following', 'monthly', 'curated', 'showcase' ]` 순서로 렌더링되어 CMR-1 선반 순서와 완벽히 일치함.
2. **검은 표지 렌더링:**
   - mock 데이터의 표지 7개 모두 `--ink` 계산값 배경과 `.coverLabel` 텍스트로 정상 렌더링됨.
3. **빠른 추가 시트 비활성화:**
   - mock 카드에서 `+` 또는 꾹 누르기로 연 `QuickAddSheet`에서 `#quickAddClone` 및 `#quickAddOpen` 버튼이 `disabled` 상태이며, `#quickAddStatus`에 `folder.mockNotice`("개발용 mock 데이터라 추가할 수 없어요") 문구가 정확히 노출됨.

---

## 6. 검증 실행 요약

| 검증 항목 | 실행 명령 | 결과 | 비고 |
| --- | --- | --- | --- |
| TypeScript 및 프론트엔드 빌드 | `npm run build` | **통과 (0 errors)** | `tsc --noEmit && vite build` |
| 단위 테스트 및 i18n | `node --test test/m223_community.test.js`, `npm test` | **통과 (7 pass)** | CM-U3 포함 무변경 통과. LA-1 줄바꿈 실패는 Windows CRLF main 동일 실패 |
| CMR-3 타겟 E2E 테스트 | `npx playwright test test/e2e/community.spec.js -g "CMR3-"` | **24 passed (100%)** | CMR3-1~25 전수 녹색 (CMR3-16은 회귀로 검증) |
| 레이아웃 G0~G8 정렬 검사 | `npx playwright test test/e2e/layout/community.spec.js` | **34 passed (100%)** | `community-folder-detail`, `community-quick-add` 신규 suite 포함 |
| 레이아웃 캡처 스위트 | `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js test/e2e/layout/home.spec.js` | **55 passed** | 4폭 및 다크 캡처 정상 생성 |
| dev mock 캡처 및 검증 | Vite 서버 기반 스크립트 실행 | **통과** | 1280·390 캡처 2장 및 3대 판정 항목(선반·검은표지·disabled) 전수 합격 |
| 프로덕션 mock 누출 방지 | `grep -l ulp-community-mock dist/assets/*.js` | **0건 (클린)** | 동적 import 대안으로 프로덕션 번들 누출 0 확인 |
| 전체 Playwright 회귀 | `npx playwright test` | **710 passed** (715 tests, 14.8m) | 일괄 실행 중 타임아웃 4건(CM-14, community-name-modal, T4, log.html) 및 불안정 후보(AV2 reopen 3회) 단독 재실행 시 전수 pass (NA-4는 Windows 로컬 클립보드 권한 이슈로 main 동일) |

---

## 7. 체크리스트 (§10) 확인 결과

- [x] `git grep -n "coverMosaic" -- frontend/src` → 0건 (완전 제거)
- [x] `git diff main -- frontend/src/components/community/CurationRows.tsx`에서 `variant === 'home'` 블록 변경 0건
- [x] `node --test test/m223_community.test.js` CM-U3 포함 7 pass 무변경 통과
- [x] `npm run build` 성공 및 `dist/assets/*.js`에서 `ulp-community-mock` grep 0건 확인
- [x] 타겟 E2E 테스트 통과:
  - `test/e2e/community.spec.js -g "CMR3-"` (24 passed)
  - `test/e2e/layout/community.spec.js` (34 passed)
  - `LAYOUT_SHOTS=1` 커뮤니티·홈 (55 passed)
- [x] 전체 E2E 회귀 테스트 (`npx playwright test`)
- [x] `LAYOUT_SHOTS=1` 커뮤니티·홈 4폭+다크 Q1~Q9 판정 완료

---

## 8. 미실행·환경 의존 항목 (명세 §10 준수)

- **실서버 `POST /songs` 한도·멱등:** 프로덕션 환경 DB 및 결제/티어 서버 호출이 필요하므로, 테스트 환경에서는 Playwright `page.route` 모킹을 통해 200, 201, 403 `SONG_LIMIT_EXCEEDED` 응답을 정밀 모킹하여 검증했습니다.
- **실기기 길게 누르기 및 Web Share API:** 실제 터치스크린 디바이스 하드웨어 및 OS 네이티브 공유 다이얼로그(`navigator.share`)는 자동화 환경에서 직접 조작이 불가능하므로, Playwright의 pointer 터치 이벤트 에뮬레이션과 클립보드 폴백(`navigator.clipboard.writeText`)으로 검증했습니다.
- **운영 데이터 적용:** §5.8 관리자 수동 절차(운영자 큐레이션 폴더 등록 등)는 배포 후 운영 단계에서 수행됩니다.
