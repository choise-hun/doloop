# Native 검증 실행

2026-11-17 Mac 검증 경로. JDK21, Xcode27.2/iOS27.2 Simulator, Android API35 arm64 AVD에서 실행했다. 저장소의 native 앱 번들과 기존 설치 앱을 덮어쓰지 않도록 임시 사본·전용 가상 기기를 사용한다. Git 게시/서비스 배포 명령은 없다.

## 구분

- `ProductSmokeTest`/`testProductLaunch`: 실제 제품 번들에서 WebView·홈 요소·앱 재실행을 검사한다.
- `NativeBoundaryTest`/나머지 `NativeUITests`: 실제 네이티브 앱/Capacitor App 플러그인에 **테스트 전용 HTML·SDK/HTTP fixture**를 넣는다. OS URL 전달·종료/복귀·앱 인증 모듈·UI 이력/보호 상태를 검사한다. Google 외부 브라우저만 stub이며 실제 Google 인증·실JWT·실마이크·실YouTube 검증을 뜻하지 않는다.
- fixture는 production `auth.ts`/`nativeAuth.ts`/`nativeNavigation.ts`를 직접 번들한다. `prepare-native-tests.mjs`가 임시 사본에만 만들며 `dist-app`·저장소 앱 public에는 fixture를 넣지 않는다.
- iOS는 실제 좌표 드래그다. App URL 복귀는 localhost 제어 서버가 `simctl openurl`을 실행한다. `XCUIApplication.open`은 앱을 새로 실행할 수 있으므로 warm 복귀의 대체 증거로 사용하지 않는다. 시스템의 RE:DO 열기 확인창을 처리한 뒤 앱 상태를 확인한다.
- 이력 복귀 후 `pageshow` 방문 번호를 기다린다. 캐시된 화면 제목만 기다린 뒤 다음 링크를 누르는 경합을 피한다. 임의 sleep은 쓰지 않는다.

## 1. 사전 점검·사본

```sh
node scripts/native-test-preflight.mjs
npm run build:app
native_product_root="$(mktemp -d /tmp/uxn-product-XXXXXX)"
native_fixture_root="$(mktemp -d /tmp/uxn-fixture-XXXXXX)"
node scripts/prepare-native-tests.mjs --out "$native_product_root"
node scripts/prepare-native-tests.mjs --fixture --out "$native_fixture_root"
```

`--out`은 비어 있어야 한다. preflight의 exit2는 준비 부족, exit0은 환경/타깃 발견이며 UI 테스트 통과가 아니다. `uiTestsExecuted`는 항상 false다.

전용 기기는 최초 한 번 만든다. 동일 이름/UDID가 있으면 기존 전용 기기를 선택한다. 개인 기기를 지우거나 기존 앱 데이터를 초기화하지 않는다.

```sh
xcrun simctl create 'UXN Native iPhone' com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro com.apple.CoreSimulator.SimRuntime.iOS-27-2
# 반환 UDID로 boot. 이 작업의 UDID: 530C92C5-0BA4-4131-9386-90B36840D13D
# Android 전용 AVD: UXN_Native_API_35, emulator-5560. 원본 Pixel_Fold_API_35는 보존했다.
```

## 2. iOS

```sh
native_simulator=530C92C5-0BA4-4131-9386-90B36840D13D
xcodebuild test -project "$native_product_root/ios/App/App.xcodeproj" -scheme UXNNative -destination "platform=iOS Simulator,id=$native_simulator" -only-testing:NativeUITests/NativeUITests/testProductLaunch -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO

node scripts/native-callback-server.mjs "$native_simulator" 48173 > "$native_fixture_root/callback.log" 2>&1 &
native_callback_pid=$!
xcodebuild test -project "$native_fixture_root/ios/App/App.xcodeproj" -scheme UXNNative -destination "platform=iOS Simulator,id=$native_simulator" -skip-testing:NativeUITests/NativeUITests/testProductLaunch -skip-testing:NativeUITests/NativeUITests/testProductLoopControls -parallel-testing-enabled NO UXN_CALLBACK_PORT=48173 CODE_SIGNING_ALLOWED=NO
kill "$native_callback_pid"
```

증거를 남길 때 `-resultBundlePath <새 xcresult 경로>`와 `-derivedDataPath <임시 빌드 경로>`를 추가한다. 기존 xcresult를 덮어쓰지 않는다. 기본 scheme 전체를 제품 사본에서 실행하면 fixture를 요구하는 테스트는 통과할 수 없으므로 위 선택 범위를 지킨다.

## 3. Android

```sh
native_java_home=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
JAVA_HOME="$native_java_home" ANDROID_SERIAL=emulator-5560 "$native_product_root/android/gradlew" -p "$native_product_root/android" :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.ulevelp.redo.ProductSmokeTest
JAVA_HOME="$native_java_home" ANDROID_SERIAL=emulator-5560 "$native_fixture_root/android/gradlew" -p "$native_fixture_root/android" :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.ulevelp.redo.NativeBoundaryTest
node scripts/check-native-cold-android.mjs emulator-5560 "$native_fixture_root/android"
```

- `:app:`을 생략하면 생성된 Cordova/Capacitor 플러그인 모듈의 샘플 테스트까지 실행된다. 이번 root task 실패는 생성 모듈의 Kotlin 중복 클래스였으며 제품 의존성을 바꾸지 않고 앱 타깃으로 한정했다.
- Android Studio의 JBR25는 현재 Gradle8.14.3에서 class major69 오류였다. 실제 실행은 JDK21을 명령별로 주입했다. 전역 Java 설정을 바꾸지 않는다.
- cold 스크립트는 `UXN_` AVD만 허용하고 fixture APK/테스트 APK를 재설치한다(Gradle connected test 종료 시 앱이 제거될 수 있음). 일반 사용자 기기에는 실행하지 않는다.
- cold는 DevTools로 실제 DOM의 로그인 동작을 시작하고, **고유 pending/verifier가 WebView LevelDB journal에 기록된 조건**을 기다린다. localStorage 동기 읽기만으로 디스크 반영을 추정하지 않는다. native Activity 배경 전환→force-stop→OS VIEW 복귀→실제 렌더된 A profile/교환1회를 단언한다. SDK는 fixture이므로 실제 PKCE 서버 검증은 아니다.
- WebView 디버그 연결은 테스트용 임시 adb forward만 만들고 종료 시 제거한다. SDK/권한/시스템 보안 설정을 완화하지 않는다.

## 4. 실기기 QA

```sh
native_qa_root="$(mktemp -d /tmp/uxn-qa-XXXXXX)"
node scripts/prepare-native-tests.mjs --fixture --qa --out "$native_qa_root"
```

QA 사본은 `com.ulevelp.redo.uxn`/`RE:DO QA`이고 URL scheme 등록을 제거한다. 기존 RE:DO 앱과 로그인 데이터·OAuth URL 소유를 보존한다. 이 사본에서는 이력/제스처 테스트만 선택한다.

Xcode 계정 로그인·해당 QA bundle의 개발 프로비저닝·잠금 해제한 USB iPhone 연결이 선행 조건이다. 이번 환경에서는 `No Accounts`/QA profile 부재와 CoreDevice tunnel timeout으로 실기기 설치·실행을 하지 못했다. 서명 없는 arm64 QA 컴파일은 성공했지만 설치 가능한 서명본이 아니다.

11-17 후속 재시도에서 연결/자동 서명은 성공했으나 무료 개발 프로필 앱3개 한도로 테스트 runner 설치가 차단됐다. 현재는 QA 앱과 runner 설치를 위한 여유 또는 유료 팀이 필요하다. 기존 앱 삭제는 별도 사용자 선택 없이 하지 않는다.

준비 후 실행 형태:

```sh
xcodebuild test -project "$native_qa_root/ios/App/App.xcodeproj" -scheme UXNNative -destination 'platform=iOS,id=<연결된 iPhone UDID>' -only-testing:NativeUITests/NativeUITests/testHistoryAndProtection -only-testing:NativeUITests/NativeUITests/testSameDocumentHistoryAndCentralDrag DEVELOPMENT_TEAM=<개발 팀 ID> CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates
```

기본 인증4기기·홈 카드 검증은 재실행하지 않는다. 실영상/마이크 동시 조작·가장자리 감각·iOS 원격 플레이어 충돌은 대표 iPhone 한 대의 제품 스모크로 별도 판정한다. fixture 성공을 실제 서비스 검증으로 올리지 않는다.


### 실제 고정 SDK의 가상 시간 갱신 검사

```sh
node scripts/check-sdk-refresh.mjs
```

제품 `frontend/index.html`의 CDN URL과 SHA384 SRI를 읽어 동일 SDK 코드를 다운로드·검증한 후 격리 VM의 가상 시계/HTTP/저장소로 실행한다. 240초 경과 중 refresh 요청1회·TOKEN_REFRESHED1회·동일 uid·새 토큰 저장을 단언한다. 실제 사용자/토큰/서버를 사용하지 않으며 native fixture의 모의 SDK 이벤트 검사와 별개다. 실제 서비스 장시간 유지나 OS 백그라운드 정책은 이 검사로 대체하지 않는다. 네트워크 다운로드가 필요한 선택 실행 스크립트다.

QA 테스트 대상 bundle ID는 `prepare-native-tests.mjs --qa`가 shared scheme에 실제 값으로 설정한다.


실제 제품 번들의 별도 QA 실행은 `node scripts/prepare-native-tests.mjs --qa --out <빈 디렉터리>`로 만든다(`--fixture` 생략). 동일 QA bundle ID를 사용하므로 제스처 fixture 테스트가 끝난 뒤 설치한다. `testProductLaunch`만 선택해 실행/재실행을 확인하고 미디어 스모크는 제품 화면에서 별도 판정한다. 원래 RE:DO 앱/URL 등록은 보존한다.

shared scheme의 TestAction은 자체 환경값을 사용한다. QA 준비 시 `UXN_APP_ID`를 실제 QA bundle ID로 기록하며, xcodebuild 사용자 정의 build setting의 `$(...)`가 runtime 환경에 치환될 것으로 가정하지 않는다.


### iOS 입력 자동 확대·핀치 회귀

fixture 사본에서 `-only-testing:NativeUITests/NativeUITests/testInputFocusAndPinch`를 선택한다. 별도 `input-probe.html`은 실제 제품 `PracticePage.module.css`/`tokens.css`를 번들해 URL 입력 두 곳을 만든다. 실제 키보드 포커스/입력/해제 후 scale1.000·16px, pinch 확대>1.2→큰 축소 제스처로 scale1.000 복원 및 이력 불변을 단언한다. 확대 배율은 실제 visualViewport 값이며 가짜 주입하지 않는다. probe와 CSS/상태 표시는 임시 fixture public에만 들어간다. 사용자 영상 추가의 실제 제품 DOM 흐름 검증과는 구분한다.

A 승인에 따라 제품 `capacitor.config.ts`의 `ios.zoomEnabled:true`가 설정 원본이다. 앱 제품 빌드 후 `npx cap copy ios`로 생성 설정을 갱신한 다음 사본을 준비한다. repo ios/public에 fixture를 복사하지 않는다.


실제 제품 버튼 배치·0/3초 조작은 제품 QA 사본에서 `-only-testing:NativeUITests/NativeUITests/testProductLoopControls`로 실행한다. 이 검사는 fixture에서 실행하지 않는다. iOS는 aria-pressed를 Switch로 노출하므로 실제 접근성 role/label로 조작하고 프리셋/대기의 같은 y 및 저장 행의 아래 위치를 단언한다. 제품 캡처/사용자 화면 확인과 모의 YouTube/가상 시계 countdown 검증은 구분한다.
