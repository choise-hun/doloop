# UXN 버튼 정정 결과

- 2026-11-17 / Mac / feat/M1A-3-app-auth 미커밋 작업 트리.
- 승인: 사용자가 잘못된 배치를 지적하고5/10초 불필요·3초만이라고 확정. 기존 A 배치 의도를 바로잡는 범위다. [진행](../완료/진행_UXN버튼정정.md), [정정 HTML](../명세/UXN_버튼배치_시안.html).
- 판정: **로컬 완료**. 구현/브라우저/실제 iPhone 제품 검사 통과 후 사용자 “지금 배치가 맞음”으로 최종 수용. 이전 버튼 완료 판정은 철회했다. 기존 홈·입력 확대·스와이프 완료 검수는 반복하지 않았다.

## 변경

- 별도 waitSelect·보조 대기 카드·중복 구간 라벨 제거. 대기0↔3만, 실제 countdown의 옛10초 fallback도3초. 취소 시 interval 제거·카운트다운 해제 유지.
- 반복/프리셋/대기/초기화를 네 폭에서 모두 한 줄 유지. 높이44px·글자14px·초기화44px, 넓으면 반복138/대기84 상한·좁으면 폭만 조정. 프리셋은 남은 폭을 사용하고 긴 이름은 말줄임한다.
- 구간 반복 그룹 안에서 controls 바로 다음 형제에 저장 action 행을 둔다. 별도 카드 없이 기존 시안의 밑줄 동작 표시. 선택 없음=구간 프리셋 저장, 선택 있음=덮어쓰기/다른 이름 저장/삭제. 삭제는 × 구간 초기화와 구별되는 텍스트로 표시.
- 기존 핸들러/프리셋 API/소유권/취소·모달 저장 계약 보존. ko/en/ja saveAs/delete 키만 추가. DB/라우트/export/의존성 변경 없음. 기존 iOS 입력16px·핀치/스와이프·인증 코드 미변경.

## 검증과 실제 실패

| 실행 | 실제 결과 |
| --- | --- |
| 새 UXN-AC4폭 Red | 기존 waitSelect 잔존 검출,4개 실패(`/tmp/uxn-button-correction-red.log`) |
| 최신 build 후 표적8개 |4폭 한 줄/대기UI1개/저장 위치/0↔3 조작·프리셋 저장/병합/초점·덮어쓰기·초기화 통과(`/tmp/uxn-button-correction-final.log`) |
| timer/선택 상태2개 | 실제3초 뒤 재생,2초 남았을 때 취소 후4초 지나도 자동 재생 없음,다른 이름 저장/삭제 문구·덮어쓰기 통과(`/tmp/uxn-button-correction-timer.log`); YouTube 모의 API/가상 시계 |
| 연습 화면 전체 layout |67개 통과(`/tmp/uxn-button-correction-layout-full.log`,55.4초). 홈/기본4기기 검수 제외 |
| Node 디자인/i18n/앱 번들 |27개 통과(`/tmp/uxn-button-correction-node.log`) |
| build/copy |`npm run build:app`, `npx cap copy ios` 통과(`/tmp/uxn-button-correction-build.log`, `/tmp/uxn-button-correction-copy.log`) |
| 실제 제품 iPhone 제어 |`testProductLoopControls`1개 통과,14.994초(`/tmp/uxn-button-qa-final.log`, `/tmp/uxn-button-qa-final.xcresult`). 실제 PLAYER 진입/스크롤·0→3→0,선택과 대기의 같은 y·저장 아래 배치 단언 |

- build 전 첫 Green은 서버가 이전 dist를 서빙한 실패 실행이다. 최신 build 완료 후에 순차 재실행했다. 실패를 성공으로 기록하지 않는다.
- iOS 첫 제품 검사는 aria-pressed 버튼이 native 접근성에서 Switch로 노출되는 것을 Button으로 찾은 테스트 오류였다(`/tmp/uxn-button-qa.xcresult`). 실제 hierarchy의 label/type/frame를 확인하여 Switch 탐색으로 바로잡고 같은0→3→0·배치 단언을 실행했다. 제품 실패를 skip/단언 완화로 숨기지 않았다.
- 이전 UXN-A의5/10초·자동2행 기대는 사용자 최신 지시와 충돌하므로 대기UI 없음·모든 폭1행·저장 직접 인접이라는 새 단언으로 대체했다. 검사 기준/예외를 완화하지 않았다.

## 화면 검토

- `test-results/uxn-correction/controls-{390,768,1150,1280}.png`·controls-dark.png를 직접 열어 확인했다. Q1 위계, Q2 간격, Q3 기준선, Q4 명도, Q5 빈 상태의 저장 비활성, Q6 한 줄/저장 읽기 순서, Q7 기존 토큰, Q8 지정 직각, Q9 다크 대비를 범위 내 확인.
- 실제 iPhone 캡처 `/tmp/uxn-button-qa-final-attachments/56F7FD51-90EA-4C9B-8CD0-BB30C2868B7C.png`를 직접 열어 동일 배치·별도 대기창 없음 확인. 영상 없는 제품 상태이며 실제 영상/저장 서버 성공을 이 캡처로 주장하지 않는다.
- 실제 제품 QA를 다시 실행해 두고 사용자에게 버튼 화면 확인을 요청했다. 입력 확대/스와이프의 예전 사용자 정상 답변을 버튼 배치 승인으로 간주하지 않는다.

## Git·제한

기존 미커밋 변경 보존. 원래 설치 앱/로그인 데이터를 삭제/덮어쓰지 않고 QA만 갱신했다. commit/push/PR·CI 게시/운영 배포는 수행하지 않았다. 사용자 관찰에서 차이가 남으면 해당 현상만 정정한다.

- 최종 `git diff --check`·UTF-8/LF·진행/결과 링크 통과. 시작 SHA 대조에서 이번 정정 파일 이외 기존 미커밋 내용은 동일하다. 코드/테스트/시안·상태 기록의 의도된 변경만 유지했다.


## 사용자 최종 수용(2026-11-17)

사용자 **“지금 배치가 맞음”**으로 수정 제품 QA의 대기0↔3만·프리셋 같은 줄·저장 바로 아래 배치를 확인했다. 버튼 정정은 로컬 구현·검증·사용자 수용까지 완료. 기존 변경 보존, Git 게시/운영 배포 없음. 이 정정의 다음 작업 없음.
