# UXN — iOS 스와이프·native 자동 테스트 준비

- 작성: 2026-11-16 / Mac. 입력: 진행_서비스개선검토 §4~§6, 진행_M0-1_앱도입 §4.10.
- 현재(2026-11-17): 후속 사용자 실행 승인으로 스와이프 제품 로컬 적용·native 타깃 구축·가상 기기 자동화 실행 완료. **실제 iPhone 자동3개 통과, 사용자 입력/복원/스와이프 정상 확인까지 로컬 완료**. §§1~4는 초기 조사/준비 이력이며 최종 구현 계약은 §5, [결과](../결과/UXN_버튼스와이프_native검증.md), 재개는 [진행 §8](../완료/진행_서비스개선검토.md).
- 승인: 사용자 “iOS 스와이프와 native 자동 테스트를 준비한다.” Git 게시·배포는 포함하지 않는다. 기존 홈 카드/4기기 기본 인증 검증은 재실행하지 않는다.

## 1. 확인한 전제

| 전제 | 현재 사실·근거 | 구현에 미치는 영향 |
| --- | --- | --- |
| iOS WebView 생성 | `ios/App/App/SceneDelegate.swift:11`은 CAPBridgeViewController 직접 생성. 설치된 `node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift:154-165`는 기본 WKWebView와 capacitorDidLoad 확장점 제공 | 앱 소유 하위 클래스에서 설정하는 안. node_modules 및 기존 URL proxy 전달은 유지 |
| 기본 제스처 | Apple [allowsBackForwardNavigationGestures](https://developer.apple.com/documentation/webkit/wkwebview/allowsbackforwardnavigationgestures)는 수평 back/forward, 기본 false | 원인 후보의 정적 근거이며 실제 앱 제스처 재현은 미실행 |
| 이력 종류 | `frontend/src/App.tsx:34-48` BrowserRouter, `frontend/src/components/layout/AppShell.tsx:15-21,120-122` 문서 anchor, `frontend/src/pages/PracticePage.tsx:319` replaceState | 문서 이력·SPA/hash·replaceState를 구분. 매 재생 위치 저장마다 이력을 추가하지 않음 |
| 녹음/업로드 보호 | `PracticePage.tsx:1440-1444`는 mrRef/uploadingRef/미완료 take로 beforeunload 방어. `:1482-1493` cleanup은 녹음 정지·blob URL 해제 | beforeunload가 native swipe/SPA에도 보호를 제공하는지는 미확인. 전역 true만으로 안전하다고 판정하지 않음 |
| Capacitor navigation 소유 | `WebViewDelegationHandler.swift:67-120`가 플러그인/내부·외부 URL 정책을 처리 | navigationDelegate 교체로 인증·외부 URL·브리지 정책을 덮어쓰지 않음 |
| 인증 callback | `frontend/src/lib/nativeAuth.ts:92-128`는 pending/waiting/URL 검증 및 generation 검사 후 교환 | OS URL 전달만 성공한 것을 세션 복원 성공으로 보고하지 않음. cold 복귀는 유효 pending/PKCE fixture 필요 |
| 자동화 현황 | `ios/App/App.xcodeproj/project.pbxproj`에 ui-testing 타깃 없음. shared test scheme 없음. `android/app/build.gradle:12` runner 있음. `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:26` 기대 package는 com.getcapacitor.app | 실제 appId com.ulevelp.redo와 다른 Android 샘플은 native UI 수용 검사로 사용할 수 없음 |

## 2. 스와이프 동작·안전 기준

1. 왼쪽 가장자리→오른쪽은 기존 back 이력 1개, 오른쪽 가장자리→왼쪽은 forward 이력 1개를 이동한다. 이력이 없는 방향에서는 현재 화면/URL/데이터를 유지한다. 뒤로 간 후 새 화면 방문 시 이전 forward 갈래를 복원하지 않는다.
2. 최초 홈→설정→기록처럼 외부 API 없이 가능한 문서 이동으로 재현한다. 이후 PLAYER의 v/t/a/b/r, 설정 #account, BrowserRouter의 동일 문서 pushState/popstate, replaceState를 분리해 검사한다. 실제 앱에 없는 이력은 테스트 fixture 안에서만 만든다. 새 제품 경로·쿼리는 만들지 않는다.
3. 추천 보호안: 녹음 중·업로드 중·미완료 take 보유 시 양쪽 native 제스처를 비활성화한다. 작업 종료/저장 완료 후에만 복원한다. 늦게 도착한 해제 신호나 이전 페이지 메시지로 잠금이 풀리면 실패다. beforeunload만으로 대체하지 않는다. **보호안의 브리지 구현 방식은 파일럿에서 확정하고 제품 적용 전 명세를 갱신한다.**
4. 모달이 열린 동안에는 배경 페이지로 이탈하지 않도록 제스처를 잠그는 안을 우선한다. 키보드만 열린 경우에는 포커스·편집 값이 유실되지 않는지 검사한다. 노트 등 다른 미저장 편집 화면은 관련 이탈 가드를 실제 조사한 뒤 적용 대상을 정한다. 근거 없이 모든 페이지를 안전하다고 표시하지 않는다.
5. 중앙의 영상/seek 막대/가로 스크롤 조작은 페이지 이력을 바꾸지 않는다. iOS 플레이어 iframe의 가장자리 터치 전달은 Simulator와 대표 실기기에서 확인한다. UIKit/WebKit 기본 제스처의 이동 거리·민감도를 임의 JS 구현으로 흉내 내지 않는다.
6. 인증/세션/소유권 계약은 변경하지 않는다. 새 DB/API/공개 함수 export는 필요하지 않다. 예상 제품 변경은 앱 소유 CAPBridgeViewController 하위 클래스 추가·SceneDelegate 생성 대상 변경이며, 보호 브리지 추가 시 입력·허용 출처·페이지 세대·해제 조건을 먼저 명세화한다.

## 3. 자동화 파일럿 설계

### 3.1 실행 경로와 격리

- iOS: XCUITest 타깃·shared scheme(TestAction 포함)을 추가해 `XCUIApplication`로 실행·종료 및 실제 좌표 드래그를 수행한다. Apple [XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication)은 앱 실행/상태 대기를 지원한다. 시작 후보는 iPhone 18 Pro, 추가 iPad는 태블릿/iframe 충돌을 검증할 때 선택한다.
- Android: 기존 AndroidJUnitRunner와 instrumentation을 사용한다. [공식 안내](https://developer.android.com/training/testing/instrumented-tests)에 따라 `androidTest`에서 기기/에뮬레이터 실행을 구분한다. package 문자열 확인만으로 끝내지 않고 Activity/WebView 로드·URL 전달·복귀 UI를 단언한다. 현재 Pixel_Fold_API_35 AVD를 사용할 수 있다.
- 제품 번들에 테스트 계정·토큰·우회 로그인·fixture 경로를 넣지 않는다. 별도 임시 작업 사본과 전용 Simulator/AVD 데이터를 사용한다. 기존 설치 앱/로그인 데이터를 지우지 않는다. SDK/의존성 추가가 필요하면 기존 버전과 범위를 먼저 확인한다.
- 외부 Google 로그인 UI는 mock 성공으로 표시하지 않는다. 로컬 인증 fixture로 OS→앱→SDK 교환/취소·복원을 검사하고, 실제 Google 복귀는 대표 플랫폼 각1대 스모크와 구분한다. fixture origin은 테스트 전용 설정에만 주입하며 운영 CORS/CSP/인증 경로를 넓히지 않는다.
- 조건 대기는 화면 요소·URL·상태 predicate와 제한시간으로 수행한다. 임의 sleep으로 통과시키지 않는다. 한 테스트 실패 후 후속 테스트가 이전 이력/로그인 상태를 물려받지 않도록 초기화한다.

### 3.2 수용 사례와 증거

| ID | 실행·단언 | 실패를 잡는 근거 |
| --- | --- | --- |
| N0 | 앱 launch→WebView와 홈 고유 요소가 나타남. 종료→재실행도 동일 | 빌드/설치만 성공한 상태 배제. UI hierarchy·캡처·runner 결과 보관 |
| S1 | 홈→설정→기록 이동 후 좌측 edge back·우측 edge forward. 각 화면과 경로가 1회 이동 | 제스처 비활성 원본에서 의도한 Red, 적용본 Green. JS history.back 호출은 대체 증거가 아님 |
| S2 | 첫 이력 back·마지막 이력 forward 무변경, back 후 새 방문 시 옛 forward 없음 | 이력 경계별 URL/화면·데이터 유지 및 crash 없음 |
| S3 | PLAYER resume 쿼리, #account, SPA push/pop, replaceState 왕복 | 화면과 URL을 함께 단언. 재생 위치 저장은 이력 수 증가 없음. iframe/실영상 확인은 별도 |
| S4 | 녹음·업로드·미완료 take·모달 각각 edge 시도→현재 화면/진행 유지. 보호 해제 후 S1 재통과 | 보호 상태와 native 설정/이력 이동의 연결. 빠른 잠금/해제·늦은 해제·페이지 교체도 검사 |
| S5 | 중앙 seek·영상/가로 영역 드래그→이력 불변, 키보드 편집 보존 | 가장자리 좌표와 중앙 좌표를 분리. 실영상·마이크 native 경계는 대표 실기기 별도 |
| A1 | 앱에서 OAuth pending 생성→terminate→OS callback으로 cold launch→교환1회/정상 화면 | pending 없이 URL만 던지는 것은 성공 복원 사례가 아님. 실제 code/token은 로그에 남기지 않음 |
| A2 | warm callback·중복 URL·취소 후 늦은 URL·허용하지 않는 callback | 기존 nativeAuth URL/generation 방어와 OS 전달을 함께 검사. 늦은 교환이 사용자 상태 변경 금지 |
| A3 | 격리 A→B 전환 중 A 지연 응답·저장 완료를 나중에 전달 | B 화면/저장에 A 자료가 남지 않음. fixture 사용자 구분과 서버 소유권 검증은 별도 증거 |
| A4 | 같은 uid token 갱신·만료/실패→기존 데이터/오류 상태 확인 | 가짜 시각/짧은 만료 fixture의 자동 검증과 실제 장시간 관찰을 구분 |

### 3.3 구축 순서와 완료 기준

1. **파일럿:** 격리 사본에서 iOS XCUITest 타깃/shared scheme과 N0·S1 원본 Red를 구축한다. Android는 낡은 샘플을 대체하고 N0를 실행한다. 플랫폼별 runner 실제 성공/실패와 xcresult/instrumentation 결과가 있어야 구축 완료다.
2. **스와이프:** 실제 backForwardList/SPA 동작 및 보호 신호 방식을 확정한 뒤 앱 소유 코드에 적용하고 S1~S5를 실행한다. 보호가 증명되지 않으면 전역 제스처 활성화 제품 적용을 보류한다. 대표 iPhone 실기기1대 최종 스모크가 출시 관문이다.
3. **인증 경계:** A1~A4 fixture를 OS 테스트 경로와 연결한다. 이는 파일럿 N0 성공과 별개의 후속 수용 범위다. 이미 끝난 기본 인증4기기를 재검수하지 않는다.

후속 명령 형태(타깃/스킴 구축 후에만 실행 가능):

```sh
node scripts/native-test-preflight.mjs
# 아래는 준비 당시 명령 형태. 현재 실행 절차/격리는 test/native/README.md 참조.
xcodebuild test -project ios/App/App.xcodeproj -scheme UXNNative -destination 'platform=iOS Simulator,id=<전용 Simulator UDID>' -resultBundlePath '<새 xcresult 경로>'
# 전용 AVD만 연결한 상태에서 Android runner 실행
cd android
./gradlew :app:connectedDebugAndroidTest
```

## 4. 이번 준비 실행 결과

- `node --check scripts/native-test-preflight.mjs`: exit 0.
- `node scripts/native-test-preflight.mjs`: exit 2(미준비 항목 발견을 뜻하는 명시적 실패). Xcode 27.2/27B52, 사용 가능한 Simulator12개(모두 Shutdown), Java 사용 가능, Pixel_Fold_API_35 AVD 확인. `uiTestsExecuted:false`, `readyForPilot:false`.
- 미준비3항목: iOS ui-testing 타깃 없음, shared test scheme 없음, Android에 현재 앱 전용 native UI 수용 테스트 없음(낡은 package 샘플).
- 사전 점검 스크립트는 build/boot/install/로그인/UI 테스트를 하지 않으며 adb 서버도 기동하지 않는다. 사전 점검 통과 역시 수용 테스트 통과를 뜻하지 않는다. 초기 조사에서 `adb devices -l`은 연결0대였다.
- 이번에는 스와이프 적용, XCUITest/instrumentation 구축·실행, 실제 backForwardList 조사, OAuth/마이크/플레이어 OS 테스트, 실기기 스모크 모두 미실행이다. 준비 결과를 자동화 구축 완료로 올리지 않는다.


## 5. 최종 구현 계약(2026-11-17)

- 앱 소유 `NavigationViewController`/`SwipeNavigationSafety`가 UIKit pan을 설치한다. 왼쪽24pt에서 오른쪽으로 back, 오른쪽24pt에서 왼쪽으로 forward. 한 손가락·가로 우세·해당 WK 이력 존재·종료 이동32pt 초과를 모두 만족해야 이동한다. 중앙/세로 drag는 이동하지 않는다. 기본 WebKit 제스처는 중복 방지를 위해 false다. WebKit true 대조군이 이 환경에서 이동을 입증하지 못한 이유/Red는 결과에 기록했다. 완료 시 이동하며 WebKit 인터랙티브 미리보기 애니메이션은 제공하지 않는다.
- `redoNavigation` 입력은 main-frame `capacitor://localhost`, `{document:string, sequence:int, blocked:bool}`만 받는다. 메시지 값으로 해제하지 않고 현재 `window.__redoSwipeState`를 평가한다. 로딩 중/평가 실패/상태 부재는 잠그고 로딩 세대·평가 요청 순번이 지난 결과는 폐기한다. iframe/오래된 unlock 알림으로 현재 잠금을 풀 수 없다. Capacitor delegate·OAuth proxy는 교체하지 않는다.
- JS 잠금은 소유자별 Symbol로 중첩되고 해제는 멱등/microtask 병합된다. 동일 blocked 알림은 억제하고 pageshow는 재공지한다. 녹음 권한 요청 전 동기 잠금·늦은 stream 정지, 녹음/업로드/미완료 take, 열린 모달/서랍, 노트 메모/태그·세션 메모 미저장/저장 중을 보호한다.
- XCUITest `UXNNative`와 Android 앱 전용 instrumentation을 실제 구축/실행했다. 제품 N0와 테스트 fixture를 분리하고 fixture는 `/tmp` 임시 사본에만 넣는다. 실제 App plugin/OS URL 전달·native history를 쓰되 HTTP/인증 SDK 응답은 모의다. S1~S5/A1~A4의 자동 증거와 실제 Google/미디어 미실행을 결과에서 구분한다.
- 실제 SDK 스케줄러는 별도 `scripts/check-sdk-refresh.mjs`로 제품 CDN 코드의 SRI를 확인 후 가상 시간/HTTP로 검사한다. native fixture의 모의 TOKEN_REFRESHED와 구분하며 실계정 장시간 유지 성공으로 확대하지 않는다.
- QA 앱은 `com.ulevelp.redo.uxn`/`RE:DO QA`, URL 등록을 제거한다. 실제 iPhone 서명/연결 차단 해결 후 이력/보호·중앙 drag 테스트와 실제 미디어1대 스모크를 수행한다. 재현 명령/환경 제한은 [README](../../test/native/README.md)로 관리한다.


## 6. 사용자 발견 입력 확대 수정 계약(2026-11-17)

- [입력 확대 HTML](UXN_iOS입력확대_시안.html) A안을 사용자 선택. 빈 플레이어/곡 목록 서랍의 URL 입력을 공용 ppUrlInput16px로 보정한다. 최소44px·기존 버튼/배치·영상 추가 동작은 유지한다.
- iOS 설정 `zoomEnabled:true`로 수동 pinch 확대·축소를 허용한다. viewport maximum-scale 고정·입력 blur 강제 viewport 초기화·앱 delegate 교체를 추가하지 않는다. native edge는 한 손가락만 받아 두 손가락 pinch와 구분한다. Android 정책은 유지한다.
- 실제 키보드 focus/타이핑/해제 후 배율1, pinch 확대 후 원배율 복원과 이력 무변경을 검증한다. 실제 제품 CSS를 사용하는 격리 native probe와 실제 사용자 제품 흐름을 구분한다. Red/Green 및 실제 환경/미실행은 [결과 §5.4](../결과/UXN_버튼스와이프_native검증.md), 현재 실행은 [진행 §8.6](../완료/진행_서비스개선검토.md).
