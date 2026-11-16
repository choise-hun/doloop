# UXN 홈 최근 카드 이동 — 로컬 구현 결과

- 날짜: 2026-11-16. 브랜치 `feat/M1A-3-app-auth`, 미커밋. 사용자 지시: 최근 곡/공부의 썸네일·제목 이동, 공부의 `확인하기 →`를 `이동`으로 변경하고 우측 정렬.
- 구현: `frontend/src/pages/HomePage.tsx:633` 곡 썸네일/제목은 기존 `buildPracticeResumeHref` 사용, `:821` 공부 썸네일/제목/이동은 기존 `note.html?id` 사용. 기존 ID/빈 상태/데이터 조회 및 접근 가드 보존. `HomePage.module.css:1007` 링크 색/말줄임/터치 영역과 footer 우측 정렬. i18n ko/en/ja의 기존 `home.btnConfirmNote` 값만 각각 이동/Open/移動 변경(기존 M1A-3 번역 추가 보존).
- 계약: API/DTO/DB/오류·상태 코드·사용자 데이터 경로 변경 없음. 읽기 링크만 추가하여 곡 v/t/a/b/r와 노트 id 전달을 유지한다. 로그인 사용자와 기기 로컬 곡을 각각 검증했다. 실제 사용자 A↔B 서버 통합 검사는 이번 링크 변경에서 재실행하지 않았다.

## 검증

| 명령/검사 | 실제 결과 |
| --- | --- |
| `npm run build` | TypeScript 및 Vite 통과 |
| `npx playwright test test/e2e/layout/home.spec.js --grep 'UXN recent note 390'` (구현 전) | Red 1건: 기존 p 제목에 href 없음 |
| `npx playwright test test/e2e/layout/home.spec.js --grep UXN` | 새 수용 테스트 7개 통과 |
| `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/home.spec.js test/e2e/i18n-lang.spec.js` | 47개 통과, 1.7분. 홈 5상태×4폭/다크, 기존 회귀, ko/en/ja 7화면×4폭 포함 |
| `npm test` | 532개 통과, 실패/skip 0 (디자인·번역 검사 포함) |
| `git diff --check` | 통과 |

- 새 단언: 노트의 썸네일/제목/이동 동일 주소 및 실제 이동/뒤로 복귀, 제목 키보드 Enter, 4폭 텍스트 열 우측선 정렬, 모바일 이동44px, 곡의 로그인/기기 로컬 데이터별 재생 쿼리 보존, 빈 카드 목적지 보존.
- 기존 RC-1 본문 링크0개 단언은 사용자 승인으로 링크2개/기존 헤더와 동일 주소 단언으로 변경했다. 구간 배지 없음·메모 말줄임 등 기존 검사는 유지했다.
- 캡처: `test-results/layout-shots/home-*.png`, `test-results/uxn-home/{note,song}-{390,768,1150,1280}-{light,dark}.png`. 4폭 공부 카드, 좁은/넓은 곡 카드, 다크를 직접 열어 우측 정렬·말줄임·오버플로를 확인했다. 모의 API 환경이며 외부 썸네일 이미지 미수신 상태에서도 기존 크기가 유지됨을 확인했다. 실영상 이미지 콘텐츠/실계정 서버 여정 검증으로 간주하지 않는다. 제목 링크는24px 최소 높이로 compact 배치를 유지하며 모바일44px 권장 경고를 없애기 위한 규칙 변경은 하지 않았다. 썸네일 및 이동으로 큰 터치 영역을 제공한다.
- 실행 로그: `/tmp/uxn-home-{red,build,target,e2e,unit}.log` (로컬 임시 파일).

## 적용 상태와 남은 범위

- 로컬 구현/가짜 API 화면 검증 완료. 실서버 통합·운영 반영 미실행. 커밋/push/PR/배포/앱 재설치는 하지 않았다. 운영 M1A-3 리비전은 보존되며 현재 로컬 홈 코드는 운영/설치 앱과 다르다.
- 버튼 HTML4안은 사용자 검토 대기, 제품 미적용. iOS 스와이프와 native Simulator/Emulator 자동 테스트 구축은 별도 남은 작업. 이미 통과한4기기 기본 인증 검수는 반복하지 않는다. 재개는 `진행_서비스개선검토.md` §5·§6에서 한다.
