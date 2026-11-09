# CH-B 진행·재개

- 목표: 코드 연습실에서 기타·베이스·건반 악기를 선택하고, 악기별 지원 모드·다이어그램·음원을 제공한다.
- 승인: 2026-11-09 사용자가 CH-B 구현과 검증을 명시 승인. 로컬 변경과 검증까지이며 커밋·push·PR·머지·배포는 별도 승인 전 금지. DB/API/export 변경이 필요하면 멈추고 근거·변경 범위를 제시한다.
- 담당: Codex 단독. 준비 세션 시작 시 clean, 구현 세션 시작 시 앞선 로컬 문서 5개 변경 보존. 브랜치 `feat/ch-a-caged-layout`, HEAD `3f57dbc`, 원격 `main`=`b6b034f`.
- 선행: AV-3 로컬 기능 검수 통과/운영 인수 보류, CH-A 사용자 머지 완료. CH-A 반복 구현/AV 검수는 범위에서 제외한다.
- 입력: [상용 서비스 계획](../../계획/상용_서비스_계획.md) CH-B, [확장 요구사항](../요구사항_명세_초안.md) REQ-2/AC-2·AC-3, [상세 구현 명세](../명세/CH-B_구현명세.md).

## 단계와 결과

1. 착수 선행·Git·문서 확인 완료. PR #142는 2026-11-09 09:43 KST 사용자 머지, merge commit `b6b034f`; 최신 문서 head CI는 변경 감지/CI ok 성공, 제품 job skipped. 제품 head `8889549` CI 성공은 기존 완료 기록과 대조.
2. 코드 조사 완료: `ChordsPage.tsx`는 `TuningId` 기반 기타/베이스 선택을 스케일·더블스탑 등 각 탭이 따로 소비한다. 악기 종류 상위 상태는 없고 탭 전체가 노출된다. `KeyboardSvgRenderer.kt`는 진행 화면용 서버 SVG로 음 이름→MIDI 변환·건반 배치·LH/RH 색 구분을 갖는다. 프런트 오디오에는 pluck/bassPluck/bass/chord가 있고 keyboard 음색은 없다.
3. 다음: 구현 명세에서 변경 경계와 렌더·오디오 동작을 고정한 뒤 CH-B 구현/검증을 진행한다. 구현은 `ChordsPage.tsx`, `ChordDiagrams.tsx`, 관련 CSS/i18n 및 musicEngine에 한정한다. API·DB·export 계약 변경은 새로 발견되면 중단하고 결정 근거를 제시한다.
4. 구현 세션 선행 확인: 현재 `feat/ch-a-caged-layout`, 원격 main `b6b034f`, 로컬 문서 5개 변경 보존. 실제 export 대조 결과 `AudioEngine`에 keyboard 메서드 추가와 `ProgressionPlayTabProps`에 악기 입력 추가, `KeyboardDiagramSvg` 신규 export가 필요하다. 요청의 중단 조건에 따라 소스 수정·테스트 추가/실행 전 멈췄다. 이전 명세의 `audioEngine.keyboard는 export 계약이 아님`, `ProgressionPlayTab은 서버 SVG 표시` 설명을 실제 코드 근거와 함께 바로잡고 명세 마지막 절에 변경 제안을 기록했다. 사용자 결정 대기.
5. 사용자가 export 확장 3개를 명시 승인해 구현·검증 재개. `npx playwright test test/e2e/layout/chords_instruments.spec.js --grep 'CH-B 악기 전환'`: 신규 `#instrument-bass` 부재로 예상 실패 1건 확인. 배치 약속: 헤더의 악기/튜닝은 좌측선 공유, 탭은 130px 최소 grid 자동 줄바꿈(390/768/1150/1280), 각 행 셀 top/height 공유. 건반은 카드 폭 내 비율 축소, 수동 음 선택은 별도 44px 버튼/입력 제공.
6. 악기/튜닝/모드 상태·건반 5모드/도수 기반 TF/진행 연주·KeyboardDiagramSvg·keyboard 음원 구현. 관련 export는 승인된 3개만 확장. DB/서버 API 변경 없음. 기존 기타 보이싱 모델을 보존하고 가변 튜닝을 소비하는 스케일/코드톤/DS의 튜닝을 연결했다.
7. 회귀에서 건반 TF 결과가 기타 첫 렌더로 전달되어 화면이 깨지는 결함 재현. 결과의 악기 태그와 effective 결과 가드 추가 후 전환 spec 재통과. TF 미래 재생은 timeout으로 취소하고, 음 초기화/프리셋 변경 시 transport를 정리했다.
8. 빌드 성공, 관련 Node 41/41, 원 트리 전체 Node 404/407(기존 CRLF 3실패), LF 사본 전체 406/406. 신규 브라우저/레이아웃 39/39·skip 0, 기존 화면 회귀 75건 통과. LH 음역 분리 후 기능 E2E 1/1+진행 카드 4폭 4/4 재통과. 명령·환경·경고·실패 한계는 [결과](../결과/CH-B.md)에 기록.
9. 4폭·다크 캡처 직접 검토. 390 TF 카드 읽기 크기, 입력 버튼 높이, 건반 전용 문구/범례, 프런트 팔레트 적용을 반영했다. 로컬 구현·검증 범위 완료.
10. 사용자 승인에 따른 적대적 리뷰(Adversarial Review) 수행 완료: 프로덕션 가드 ↔ 테스트 단언 대조 검증, 리소스 정리(AudioContext/타이머), 악기 전환 시 렌더 안전성 및 접근성/XSS 방어 확인. 빌드 및 테스트(단위 41/41, 악기 E2E 39/39, 기존 회귀 75건) 재검증 통과 확인 후 커밋·push·PR 생성.

## 완료·다음 행동

CH-B 구현·검증·적대적 리뷰 완료 및 PR 생성. 사용자 머지 대기.
