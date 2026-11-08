# AV-2 — AV-F1·AV-F2 수정과 회귀 검증

- 날짜/환경: 2026-11-08 / mac / Codex, Node v24.16.0, Chromium Playwright 1.51.1.
- 구현 커밋: `349e1d9`, [main PR #140](https://github.com/choise-hun/doloop/pull/140). 수정·회귀·전체 코드 CI 완료, 사용자 머지 대기. 최종 문서 head는 동일 PR checks에서 확인.
- 기준: PR #137 `ab5495f`·#138 `0d8b5bb` 실제 머지 확인 후 `origin/main` `0d8b5bb`에서 `fix/av2-community` 착수. 종료 멘트 로컬 변경은 별도 `3319d97` / [PR #139](https://github.com/choise-hun/doloop/pull/139), 문서 CI ok 성공·앱 테스트 정책 skip.
- 승인·수정 명세·재개: [진행 기록](../완료/진행_AV2_결함수정.md). 신규 API/DB/기능/배포 없음.

## 1. 원인과 방어 조건

| ID | 코드 변경 | 프로덕션 가드와 단언 연결 |
| --- | --- | --- |
| AV-F1 | `CommunityParts.tsx`의 JSX 자식으로 들어간 `// i18n-keep` 7곳을 `data-layout-ignore` 속성의 JS 표현식 안으로 이동 | DOM 자식에 개발 문자열을 만들지 않음. `layout/home.spec.js` 큐레이션 및 `layout/log.spec.js` communityPro·LOG creator에 `not.toContainText('i18n-keep')`. G3 예외 사유·번역 키·배치 약속·CSS 유지 |
| AV-F2 | `FolderSheet.tsx:23` 사용자 id+folderId key의 내부 시트 인스턴스. 닫기/계정 전환 시 언마운트, `:31` layout cleanup·`:36` 현재 auth id로 유효성 판정 | 좋아요·팔로우·담기·신고의 성공/오류/되돌림 전 isCurrent 검사, `patchFolder`도 가드해 상위 카드 callback 차단. `av2-community.spec.js` 24개 지연 응답 전환 조합의 시트 텍스트·switch·신고 입력·상위 카드 snapshot 불변 단언 |
| 읽기/중복 방어 | 상세·작성자 GET에 생명주기/auth/seq 검사와 effect cleanup. busy Set은 인스턴스별 소유 | 조회 성공/실패 지연 4개, 이전 finally와 새 요청 겹침 4개. 진행 중 재클릭은 1건, 재열기 뒤 현재 요청 가능, 이전 finally 이후에도 새 요청 중복 차단 |

- `rg 'setLike|setFollow|community.clone|community.report' frontend/src` 결과 UI 호출은 FolderSheet 한 곳. `CurationRows.tsx:52~66` 상위 patch가 홈과 커뮤니티 목록에 전파돼 callback도 보호해야 함을 확인.
- 계약 대조: `apiClient.ts:1468~1510`, `src/main/kotlin/ulevelp/service/CommunityService.kt:113~119,178`. 좋아요 `{liked,likeCount}`, 팔로우 `{following,followerCount}`, 담기 `{categoryId,imported,alreadyInLibrary,skippedLimit}`, 신고 `{reportId}` 유지. 공개 props/export·API 경로·메서드·필드·오류/상태 코드·DB 변경 없음.
- 응답 폐기는 서버 요청 취소/롤백을 의미하지 않음. 닫은 뒤 이미 저장됐을 수 있으며 재열기 때 서버 상세/작성자 GET으로 현재 상태를 조회한다. 외부 I/O·트랜잭션 경계는 서버 변경 없어 AV-1의 확인/한계를 유지.

## 2. 명령·실제 결과

| 명령 | 결과 |
| --- | --- |
| `npm run build` 뒤 `npx playwright test test/e2e/av2-community.spec.js test/e2e/layout/home.spec.js --grep 'follow success other-folder\|home curation 1280'` (수정 전) | 기대한 2개 실패. AV-F1 `i18n-keep` 노출, AV-F2 B의 `aria-checked=false→true`와 팔로잉 문구 변경. 테스트 준비 실패가 아님 |
| `npm test` | 초기 JSX block 주석안은 LA-1의 기존 한글 속성 마커 인식 실패. 검사 완화 없이 JS 속성 표현식으로 배치 수정 후 **373 pass / 0 fail / 0 skip** |
| `npm run build` | tsc·Vite 통과. 기존 CJS API·config.js module·500kB 청크 경고 유지 |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/av2-community.spec.js test/e2e/community.spec.js test/e2e/layout/home.spec.js test/e2e/layout/log.spec.js test/e2e/i18n-lang.spec.js test/e2e/ops.spec.js` | **115 passed / 0 failed / 0 skipped (1.9m)**. 신규 회귀 40 + 기존 커뮤니티 14 + 언어 5 + 홈/LOG 레이아웃 45 + 운영 화면 11 |

지연 응답은 route gate를 명시적으로 해제한다. response.finished 및 다음 paint 뒤 상태 불변을 단언하며 임의 sleep은 쓰지 않는다. 가짜 인증·API 기반 화면 검증으로 DB 영속성/운영 인증 검증과 구별한다.

## 3. 화면 배치·스크린샷

- 기존 `discoverCards:top,height` 및 scroller/grid 유지. 신규 정렬 그룹·CSS 변경 없음.
- 390/768/1150/1280 및 다크 캡처는 기존 layoutSuite에서 생성한다. 결과는 `test-results/layout-shots/`(로컬 비관리), 영구 증거용 대표 화면은 검토 후 이 문서 옆에 보존.
- 기존 G3 예외 7개(카드 제목·부제·배지·구간·LOG 배지) 유지. 새 예외·known·기준 완화 없음.
- 추가 확인: 홈 다크 대상을 큐레이션으로 바꾸고 시트 캡처를 네 폭으로 확장한 뒤 `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js test/e2e/layout/log.spec.js test/e2e/community.spec.js --grep 'FT home curation|FT log communityPro|FT log-creators|CM-3 ' --reporter=json` → **16 pass / 0 fail / 0 skip**. 이 중 자동 레이아웃 15개 실패 0, known 0. 전체 115개에는 기존 log guest G6 known 분류가 유지됨.

| 상태 | 1280 | 1150 | 768 | 390 | 1280 다크 |
| --- | --- | --- | --- | --- | --- |
| 홈 curation 경고 수 | 22 | 22 | 58 | 55 | 22 |
| 커뮤니티 폴더 경고 수 | 9 | 9 | 17 | 16 | 9 |
| LOG creator 경고 수 | 5 | 5 | 14 | 14 | 5 |

경고 합계 282건 = G7b(권장 터치 높이) 107 + G8(간격 스케일) 175. 실패 기준 통과와 경고 0을 혼동하지 않는다. navAuth·커뮤니티 탭·홈 링크 등의 기존 컨트롤 높이와 간격을 이번 결함 수정에서 일괄 변경하지 않았다.

PNG를 직접 읽어 홈/커뮤니티 폴더/LOG와 시트 네 폭, 홈/커뮤니티/LOG 다크를 검토했다. 아래는 홈·커뮤니티 폴더·LOG 공통 판정(△ 사유는 아래); 시트는 별도 비고.

| 질문 | 390 | 768 | 1150 | 1280 |
| --- | --- | --- | --- | --- |
| Q1 중요도·강한 버튼 | △ | △ | △ | △ |
| Q2 같은 위계 여백 | ○ | △ | △ | △ |
| Q3 기준선 | ○ | ○ | ○ | ○ |
| Q4 크기·명도 위계 | ○ | ○ | ○ | ○ |
| Q5 빈 상태 안내 | N/A | N/A | N/A | N/A |
| Q6 반응형 의미 순서 | ○ | ○ | ○ | ○ |
| Q7 색 용도 | ○ | ○ | ○ | ○ |
| Q8 컨트롤·카드 곡률 | ○ | ○ | ○ | ○ |
| Q9 다크 경계·대비 | 미촬영 | 미촬영 | 미촬영 | ○ |

- Q1 △: 커뮤니티/LOG는 선택된 상위·하위 탭이 각각 강한 색을 가짐. 신규 CTA나 스타일 변경 없이 유지.
- Q2 △: 768 이상에서 fixture가 1~2장인 가로 선반 오른쪽에 빈 공간이 큼. 현행 scroller 동작과 적은 fixture 수의 결과로 유지. LOG는 ○.
- Q5 N/A: 변경 대상은 데이터가 있는 카드/배지. 비로그인/빈 데이터의 현행 숨김은 CM-2로 검증하며 AV-O1 요구 결정은 이번 범위 밖.
- 시트 네 폭: Q2~4/Q6~8 ○, Q1 △(곡별 연습 버튼 반복은 현행 목록 동작), Q5 N/A, Q9 미촬영. 긴 제목은 줄바꿈되고 닫기 버튼 접근 가능. 시트 CSS·배치 변경 없음.
- 모바일 full-page PNG 중간의 탭 바는 viewport 고정 층이 합성된 위치이며 본문 카드 정렬 변경이 아님. 외부 썸네일은 mock 영상 ID/네트워크로 깨져 있어 실음원/이미지 품질 검수로 승격하지 않음.
- 영구 대표 증거: [홈 개발 문구 비노출](AV2_홈_1280.png), [LOG 배지 비노출](AV2_LOG_390.png), [시트 390](AV2_시트_390.png). 나머지는 위 명령으로 재생성.

## 4. 완료 수준·미실행 범위

| 수준 | 확인·제한 |
| --- | --- |
| 구현 | AV-F1/F2와 네 mutation/read/상위 patch 가드 구현. `349e1d9` / [PR #140](https://github.com/choise-hun/doloop/pull/140). [전체 코드 CI](https://github.com/choise-hun/doloop/actions/runs/42474768825) 성공: Node 22·24·Kotlin·Docker·전체 Playwright 408개·CI ok |
| 화면 연결 | 기존 홈/커뮤니티 카드→시트 동선, 현재 시트 성공/실패·무료 담기 차단·정상 rollback·로그아웃 숨김 유지 |
| 통합 검증 | 이번 화면은 mock 인증/API. 로컬 Kotlin/격리 DB 테스트는 서버 불변으로 재실행하지 않음. CI 전체 Kotlin 성공(코드 CI run 42474768825) |
| 운영 확인 | 배포·운영 로그인·실 OAuth/YouTube·실제 서버+격리 DB 연속 A/B 여정 미실행. AV-3 입력으로 남김 |

AV-1 §7의 서버 취소/동시성/거절 후 DB 전체 불변·실 외부 연동·운영 콘텐츠 확인은 AV-3 범위다. 이번 수정 결과로 통합·운영 인수 완료를 선언하지 않는다.
