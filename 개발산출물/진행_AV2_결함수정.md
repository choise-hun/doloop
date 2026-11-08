# AV-2 — 개발 문구·지연 응답 격리 수정

## 목표·입력·승인

- 2026-11-08 사용자 요청: AV-F1/F2 수정·좋아요/담기/신고 같은 패턴 조사·회귀 검증. 검증된 논리 단위별 커밋·push·main PR·CI 종료 확인 승인. 머지는 사용자, 배포·신규 API/DB/기능 제외.
- 입력: [AV-1 §4](결과/AV1_사용가능성검수.md#4-결함관찰-및-다음-수정-범위), docs/rules/frontend-state.md·frontend-layout.md·testing-security.md, [정렬 규격](프론트_정렬규격.md), [문서 운영](../docs/문서_운영.md) §4~6.
- Git 착수: `audit/av1-usability`에 종료 멘트 규칙 문서 7개 변경. 보존 후 `docs/completion-handoff` / `3319d97` / PR #139로 별도 게시. PR #137/#138은 GitHub merged=true 및 fetch한 main의 merge 커밋 `ab5495f`/`0d8b5bb`로 확인. AV-2는 `origin/main`(`0d8b5bb`)에서 `fix/av2-community` 생성. 선행 코드 변경 없음. 담당 Codex 단독, 협업 없음.

## 짧은 수정 명세 — 구현 전 확정

| 결함 | 원인·영향·변경 파일 | 방어·회귀 조건 |
| --- | --- | --- |
| AV-F1 | `frontend/src/components/community/CommunityParts.tsx:60,65,70,102,107,111,194`의 JSX 자식 `// i18n-keep`가 화면 텍스트로 렌더됨 | 정상 JSX 주석으로 변환. 기존 G3 예외·CSS·번역 키 유지. 홈 폴더/곡 카드·커뮤니티 LOG 배지의 개발 문자열 부재 단언 |
| AV-F2 | `FolderSheet.tsx:60~134`의 네 mutation 성공/실패가 전환 뒤 상태·상위 카드 callback을 갱신. `:47` 상세 읽기도 계정 변경/언마운트 cleanup 부족 | 공개 props/export 유지, 내부 시트 인스턴스를 사용자 id+folderId로 분리. 닫기/전환/언마운트 시 layout cleanup으로 생명주기 무효화, 응답 후 auth 현재 id도 확인. 읽기·성공·실패·rollback·상위 patch 모두 유효 인스턴스에서만 반영. busy는 인스턴스별로 유지해 이전 finally가 새 요청 잠금을 해제하지 않음 |

- API 경로/필드/상태 코드·DB·export/함수 공개 시그니처 변경 없음. 클라이언트 응답 폐기는 서버 mutation 취소/미저장을 뜻하지 않으며 재오픈 시 GET으로 재조회.
- 기존 오류 번역/무료 담기 가드/현재 시트 낙관 반영·실패 복원·성공 안내 및 중복 클릭 차단 유지.
- 회귀: 네 작업 × 성공/500 × 다른 폴더/동일 폴더 재열기/로그아웃→다른 계정. 이전 응답 폐기 뒤 현재 요청 가능·상태/안내/신고 폼/상위 카드 불오염 확인. 상세/작성자 GET 지연도 전환 후 무시.
- 배치 약속: 기존 scroller/grid·카드 썸네일→제목→부제·시트 구성 유지, 신규 열/정렬 그룹 없음. 상태는 홈 큐레이션 및 LOG creator. 390/768/1150/1280 기존 반응형 규칙·G0~G8/A1 유지. layout spec에 개발 문자열 부재를 먼저 추가해 실패 확인 후 구현, 네 폭 스크린샷 Q1~Q9 검토.

## 실행·결과

- 완료: 수정 전 AV-F1/F2 2개 실패 재현 → 구현 → 단위 373·빌드·mock 화면/레이아웃/언어/운영 115·추가 다크/네 폭 캡처 16 통과. [실제 결과·미실행·Q1~Q9](결과/AV2_결함수정.md) 참조.
- 현재: 로컬 검증 완료, 커밋·push·main PR·CI 확인 예정. 원시 로그 `/tmp/av2-{red,unit,build,final}.log`, 경고 집계 `/tmp/av2-layout.json`(로컬 비관리).

## 다음 행동·재개

`git status`·PR #139 및 AV-2 PR 상태를 확인하고 이 파일의 미완료 검증·CI를 이어간다. 완료 뒤 진행 파일을 완료/로 이동하고 계획·인수인계 링크를 갱신한다. AV-3 전체 여정/운영 쓰기는 이번 승인 범위에 포함하지 않는다.
