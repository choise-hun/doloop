# UXN — 버튼·iOS 스와이프·native 자동 검증

- 일자: 2026-11-16~17 / Mac / `feat/M1A-3-app-auth`, 미커밋 작업 트리.
- 승인: A 수정 HTML의 가로 비중 확정 후 사용자 “남은 작업 전부 진행”, “이어서”. 로컬 구현·관련 검증 범위이며 Git 게시·운영 배포는 포함하지 않는다.
- 정정 완료: 이전 버튼 완료 판정 철회 후 정정 구현·실제 QA 배치 사용자 수용까지 로컬 완료. 최신0/3초·프리셋 같은 줄·저장 바로 아래 수용은 [정정 진행](../완료/진행_UXN버튼정정.md)에서 관리한다. 아래5/10초 보존·450px 줄 전환은 과거 구현 이력이며 최신 계약이 아니다.
- 이전 판정: **제품 코드 로컬 구현·가상 기기 및 실제 iPhone 자동 검증 완료. 스와이프 사용자 정상 확인, 영상 URL 입력 후 확대 고착 결함 발견·A안 적용·입력/핀치 실기기 검증 및 수정 제품 QA 사용자 확인까지 로컬 완료(§5.5).** 기존 홈 카드·기본 인증4기기 검수는 반복하지 않았다.
- 실행/재개 원본: [진행 §8](../완료/진행_서비스개선검토.md). 재현 명령: [native README](../../test/native/README.md).

## 1. 변경과 유지 계약

| 대상 | 실제 변경·근거 | 보존 |
| --- | --- | --- |
| A 버튼 배치 | `PracticePage.module.css:388-404`: 반복138px·대기84px·초기화44px, 높이44px. 남는 폭은 presetSelect, 컨트롤 영역450px 이하에서는 프리셋만 둘째 줄 | HTML 확정값 기준 글자14px. 기존 0/3/5/10 선택창은 보조 행에 유지. 프리셋 선택/저장/수정/삭제·구간 초기화 ID/핸들러·카운트다운 취소 유지 |
| iOS 이력 이동 | `NavigationViewController.swift:24-35,62-88`: UIKit pan을 좌/우24pt 시작 영역으로 한정, 한 손가락·가로 우세·올바른 방향·해당 WK 이력이 있을 때 종료 이동량32pt 초과로 goBack/goForward | WK 실제 이력 사용. SPA/hash/replaceState·forward 갈래 폐기 동작. WebKit 병렬 제스처는 꺼 중복 이동 방지. JS 드래그/새 URL/route 없음. 완료 시 페이지 이동이며 WebKit의 인터랙티브 미리보기 애니메이션은 구현하지 않음 |
| 보호 브리지 | `nativeNavigation.ts:15-47`, `NavigationViewController.swift:40-112`: 현재 문서 스냅샷·소유자별 잠금, main-frame `capacitor://localhost`만 수신. 메시지는 알림으로만 쓰고 현재 문서를 재조회. 문서 로딩 세대/요청 순번이 지난 평가 결과는 폐기. 미확인 상태는 잠금 | Capacitor navigationDelegate·App URL 전달·API/DB/앱 origin 유지. 오래된 해제/다른 소유자의 cleanup으로 잠금을 풀지 않음. 타이머 DOM 변경은 blocked가 같으면 재전송하지 않고 pageshow는 재공지 |
| 녹음/편집 보호 | `PracticePage.tsx:188` 녹음·업로드·미완료 take·서랍/모달, 마이크 획득 전 동기 잠금 및 늦은 스트림 정지. `NoteDetailPage.tsx:54` 미저장 메모/태그, `PracticeSessionCard.tsx:51-53` 미저장 세션 메모/저장 중 잠금 | 사용자·영상·언마운트 변경 후 늦게 열린 스트림은 정지. 메모 저장 기준값은 현재 소유자의 성공 응답으로만 갱신하고 저장 중 새 편집은 계속 보호 |
| Android callback | `nativeAuth.ts:96-110`: custom-scheme host가 비는 WebView에서 HTTPS surrogate로 파싱하되 원래 authority가 정확히 auth인지도 검사 | callback은 여전히 `ulevelp://auth/callback`. 자격증명/포트/추가 slash·중복/미허용 쿼리·fragment·code/error 혼합을 허용하지 않음. SDK 호출·세션 발행의 generation 방어 유지 |
| native 자동화 | XCUITest 타깃/공유 `UXNNative` scheme, Android 앱 전용 instrumentation, 임시 사본 준비/환경 점검/OS callback 제어/cold 검사 스크립트 | fixture는 임시 앱 public에만 넣음. 제품 dist-app/기존 설치 앱에 테스트 로그인·토큰·경로를 넣지 않음. 새 npm/Gradle/SPM 의존성 없음 |

`SceneDelegate`는 기존 scene window를 재사용하고 앱 소유 컨트롤러를 생성한다. cold URL proxy 관찰을 등록한 뒤 창을 표시하며 warm/universal URL 전달은 유지했다. AppDelegate/Main.storyboard 조사용 변경은 되돌렸고 제품 변경으로 남기지 않았다.

## 2. Red와 실패 판정

| 증거 | 원인/조치 |
| --- | --- |
| `/tmp/uxn-a-red.log`: UXN-A 4폭 실패, “프리셋은 반복 컨트롤 grid의 구성원” false | 기존 별도 프리셋 행을 확정 grid로 이동. 옛 PR1-W의 ‘반복이 남는 폭’ 기대는 사용자 확정안의 고정 너비/프리셋 가변 폭으로 교체. 기존 동작 단언은 유지 |
| `/tmp/uxn-custom-url-red.log`: N-URL exchange 호출1회 기대가0 | native Android에서도 protocol=ulevelp, hostname="", pathname="//auth/callback" 실측. URL 해석 차이를 수정하고 원래 authority 검증으로 HTTPS 정규화의 port/credential 허용을 방지 |
| `/tmp/uxn-native-red.xcresult`: 원본 CAPBridgeViewController의 실제 back drag 실패 | 기본 제스처 미활성의 Red. WebKit 속성 활성화 대조군도 이 환경의 이동 검사에서 통과하지 못해, 최종 UIKit 영역 제한 pan으로 전환. WebKit 일반 버그라고 단정하지 않음 |
| iOS warm 경합/URL 초기 실패 | 시스템 “RE:DO에서 열기” 확인창이 OS 전달을 막음. `XCUIApplication.open`의 재실행 영향과 구분해 simctl OS 전달·확인창 처리 후 검사. 앱 인증 단언을 완화하지 않음 |
| 복귀 직후 다음 링크 클릭 실패 | 캐시된 제목만으로 복귀 완료를 추정한 테스트 경합. 실제 pageshow 방문 번호를 기다리도록 보강. Reset fixture는 replace로 이력 경계를 고정 |
| Android cold 초반 실패 | localStorage 동기 읽기 성공을 디스크 반영으로 오판. 고유 flow pending/verifier가 실제 WebView journal에 기록된 조건 후 배경 전환·종료·OS 복귀를 검사. 임의 sleep/고정 지연으로 통과시키지 않음 |
| Android root Gradle task 실패 | 생성된 Cordova 모듈 샘플의 Kotlin 중복 클래스. 제품 의존성을 바꾸지 않고 `:app:connectedDebugAndroidTest`로 검사 타깃을 명시 |
| JBR25 class major69 | 테스트 명령에 JDK21 주입. 전역 Java/SDK 설정은 유지 |

실험 코드·NSLog·임시 스크립트 삽입은 `/tmp` 사본에서만 사용했고 최종 제품 소스에는 남기지 않았다. 실패를 skip/빈 catch/단언 완화/임의 fallback으로 숨기지 않았다.

## 3. 실제 실행

| 범위·명령 | 결과·증거 |
| --- | --- |
| `npm run build:app` | tsc/Vite/app 번들 조립 통과. `/tmp/uxn-build-deduped.log`. 기존 큰 chunk 경고는 남음 |
| 관련 Playwright 5파일 묶음 | 91개 통과(`/tmp/uxn-web-final.log`). 연습 layout/프리셋/녹음/노트 액션/native-auth mock. 홈 테스트 제외 |
| 최종 media guard + practice-record | 18개 통과(`/tmp/uxn-media-guards-final.log`). 권한 대기 잠금/거부 해제·미완료 take·모달·SPA 이탈 후 늦은 스트림 정지와 녹음 기존 계약 |
| 최종 UXN-A 4폭/다크 | 4개 통과(`/tmp/uxn-ui-dark-final.log`). 치수·줄 전환·기존5/10 선택·보조 select44px. 캡처 `test-results/uxn-controls/` |
| Node 관련5파일(신규 guard 포함) | 66개 통과(`/tmp/uxn-node-final-66.log`). design/auth-races/native_auth/app bundle 및 중첩 소유자·중복 release·늦은 cleanup·동일 상태 알림 억제/pageshow 재공지 |
| iOS 제품 실행/재실행 | N0 1개 통과(`/tmp/uxn-native-product-final.xcresult`, `/tmp/uxn-ios-product-final.log`) |
| iOS native fixture | 4개 통과(`/tmp/uxn-native-ios-pageshow.xcresult`): 계정 A 지연 응답→B/갱신·만료, cold/warm/중복/취소 후 callback, back/forward/각 보호 상태/새 갈래, SPA/query/hash/replaceState/중앙 drag |
| 최종 native 알림 최적화 후 iOS 영향 검사 | 이력/보호·SPA2개 재통과(`/tmp/uxn-native-ios-final-guards.xcresult`, `/tmp/uxn-ios-final-guards.log`) |
| 최종 공격/토큰 사용 단언 보강 | iOS 이력/보호·계정경합2개 통과(`/tmp/uxn-native-ios-hardened.xcresult`, `/tmp/uxn-ios-hardened.log`). 오래된 main-frame/iframe unlock 알림에도 보호 유지, refresh 후 실제 반환 토큰 확인. cold/warm은 확인창 수정 후1개 재통과(`/tmp/uxn-native-ios-cold-final.xcresult`) |
| 실제 고정 SDK 가상 시간 probe | `node scripts/check-sdk-refresh.mjs` 통과(`/tmp/uxn-sdk-refresh.log`). 제품 CDN 코드의 SHA384 SRI 일치, 가상240초 동안 refresh 요청1회/TOKEN_REFRESHED1회·동일 uid·새 토큰 저장. 외부 SDK 다운로드만 실제 네트워크이며 인증 HTTP/시계는 격리 fixture |
| Android 제품 N0 | 1개 통과(`/tmp/uxn-native-product-final/android/app/build/reports/androidTests/connected/debug/`, `/tmp/uxn-android-product-final.log`) |
| 최종 Android fixture | 3개 통과(`/tmp/uxn-native-fixture-final/android/app/build/reports/androidTests/connected/debug/`, `/tmp/uxn-android-fixture-hardened.log`) |
| 최종 Android cold host probe | 통과(`/tmp/uxn-android-cold-hardened.log`): 고유 pending/verifier 디스크 기록→force-stop→실제 OS VIEW→실제 DOM A profile·교환1회 |
| preflight/스크립트 구문 | 최종 exit0, `readyForPilot:true`(`/tmp/uxn-preflight-final.json`). 검사 구축/실행 결과는 위 행이며 preflight만으로 UI 통과를 주장하지 않음 |

- iOS 전용 Simulator `UXN Native iPhone` (iPhone18 Pro/iOS27.2), Android 전용 `UXN_Native_API_35` (API35 arm64/emulator-5560). 개인 Simulator/원본 AVD를 초기화하지 않았다.
- 모의 SDK/HTTP로 계정 A/B·token event를 만들었다. 실제 native App URL 브리지·앱 생명주기·WebView·이력 제스처는 OS에서 실행했다. SDK 스케줄러는 별도 실제 고정 SDK/가상 시계 probe로 검사했다. Google 외부 UI/실JWT/실서버 장시간 관찰은 위 결과로 대체하지 않는다.
- 이번 native 변경으로 서버/API/소유권 계약을 바꾸지 않아 Kotlin/DB 전체 회귀는 재실행하지 않았다. 기존4기기 기본 인증·홈 카드 완료 검증도 반복하지 않았다.

## 4. 화면 검토

4폭 컨트롤 영역과 1280 다크를 직접 열어 확인했다. `a-390.png`/`a-768.png`는 fixed 탭 바와 겹치지 않도록 컨트롤을 중앙으로 스크롤해 캡처했다. 전체 연습 화면/빈 상태는 위 91개 layout 묶음의 `test-results/layout-shots/practice-*`를 함께 대조했다.

| 질문 | 390 | 768 | 1150 | 1280 |
| --- | --- | --- | --- | --- |
| Q1 주 행동/선택 위계 | ✓ | ✓ | ✓ | ✓ |
| Q2 여백 | ✓ | ✓ | ✓ | ✓ |
| Q3 기준선 | ✓ | ✓ | ✓ | ✓ |
| Q4 글자/명도 위계 | ✓ | ✓ | ✓ | ✓ |
| Q5 빈 상태/다음 행동 | ✓ | ✓ | ✓ | ✓ |
| Q6 열·읽기 순서 | ✓ 프리셋2행 | ✓ 1행 | ✓ 프리셋2행 | ✓ 프리셋2행 |
| Q7 기존 토큰 색 | ✓ | ✓ | ✓ | ✓ |
| Q8 지정 컨트롤 직각/1px | ✓ | ✓ | ✓ | ✓ |
| Q9 다크 경계·대비 | 공통 CSS,1280 대표 캡처 | 공통 CSS | 공통 CSS | ✓ |

기존 프리셋 보조 버튼/데이터 목록 형태를 일괄 변경하지 않았다. layout fixture는 community를 켜므로 캡처의 메뉴를 제품 기본 노출 변경으로 해석하지 않는다. 검사 임계값·known·예외는 추가/완화하지 않았다.

## 5. 실기기 차단과 미실행

- iPhone은 paired/available로 보였으나 `ddiServicesAvailable:false`, 개발자 모드 상태 unknown. `devicectl device info lockState`는 **CoreDevice tunnel interrupted / NWError60 timeout**으로 실패했다.
- 별도 QA 사본 `com.ulevelp.redo.uxn`/`RE:DO QA`를 만들고 URI 등록을 제거해 기존 앱·OAuth 소유를 보존했다. 서명 시 **No Accounts / No profiles for com.ulevelp.redo.uxn** 실패(`/tmp/uxn-qa-device-build.log`). 우회해 기존 앱을 덮어쓰지 않았다.
- **서명 없는 실기기 arm64 QA 컴파일은 성공**(`/tmp/uxn-qa-device-unsigned.log`). `/tmp/uxn-native-qa-device/Build/Products/Debug-iphoneos/App.app`은 서명 미완료이므로 설치/실행 성공이 아니다.
- 남은 필수 관문: Xcode 개발 계정 로그인·QA 개발 프로필·잠금 해제/USB 연결 후 대표 iPhone에서 이력/보호2개 테스트. 그 뒤 실제 제품의 영상/seek/iframe·마이크 동시 조작·가장자리 감각을 1대 스모크로 판정한다. Android/웹 전체 실기기 재검수는 요구하지 않는다.
- Git commit/push/PR/CI 게시·운영 배포는 미실행. 운영/기존 설치 앱에 이번 변경이 반영되었다고 보고하지 않는다. 기존 M1A-3 배포본과 현재 main/로컬 차이는 보존했다.


### 5.1 실기기 준비 후 재시도(2026-11-17 07:16 KST)

- 사용자 기기 연결/계정 준비 지시에 따라 최신 소스의 새 격리 QA 사본을 만들었다. iPhone 연결 성공·Developer Mode Enabled 확인. 이전 No Accounts/연결 timeout은 이번 실행에서 해소됐다.
- `test/native/README.md` §4의 QA 이력/보호2개만 선택해 자동 서명/테스트를 시도했다. 제품/테스트 빌드·서명 단계를 통과했으나 `NativeUITests-Runner` 설치가 **This device has reached the maximum number of installed apps using a free developer profile**로 실패(exit65). `/tmp/uxn-qa-resume.log`, `/tmp/uxn-qa-resume.xcresult`.
- 설치 한도 목록은 기존 `com.ulevelp.spike`, `com.ulevelp.redo`, 별도 YouTube 앱이다. QA와 테스트 runner 설치를 위한 개발 프로필 여유 또는 유료 팀이 필요하다. 기존 앱/데이터를 지우거나 덮어쓰지 않았다. 실기기 테스트 본문은 실행되지 않았으며 통과로 표시하지 않는다.
- 현재 차단은 무료 개발 앱 설치 한도다. 사용자 선택(개발 팀 변경 또는 불필요 앱 직접 정리) 후 최신 소스/현재 기기 상태에서 재시도한다. 기존 가상 기기 통과를 반복할 필요는 없다.

- 07:17 추가 재시도: 사용자 직접 정리 선택 후 설치 한도가 해소되어 runner 설치를 통과했다. 실행은 **Developer App Certificate is not trusted**로 실패(exit65). `/tmp/uxn-qa-retry-2fxkzycn.log`, `/tmp/uxn-qa-retry-2fxkzycn.xcresult`. 현재는 기기 설정→일반→VPN 및 기기 관리에서 개발자 앱 인증서 신뢰 확인이 필요하며 테스트 본문은 아직 미실행이다. 기존 앱 삭제는 에이전트가 수행하지 않았다.


### 5.2 실제 iPhone 자동 검증 통과(2026-11-17)

- 사용자 인증서 신뢰 완료 후 실제 runner가 실행됐다. QA app ID runtime 전달의 테스트 설정 결함을 발견했다: `shouldUseLaunchSchemeArgsEnv=YES`는 TestAction 값을 무시하고, `$(UXN_APP_ID)` 사용자 build setting도 runtime에서 치환되지 않았다. 각각 기본 앱/문자열 그대로 실행을 시도한 Red(`/tmp/uxn-qa-trusted-bb6b4648.log`, `/tmp/uxn-qa-scheme-55cd2d59.log`). 제품 동작 실패와 구분한다.
- shared scheme이 TestAction 자체 환경을 쓰고 base 앱 ID/포트를 실제 값으로 갖도록 수정했다. `prepare-native-tests.mjs --qa`는 임시 scheme의 대상 ID도 QA로 치환한다. `--qa` 단독은 실제 제품 QA 사본, `--fixture --qa`는 이력/보호 fixture 사본이다. 둘 다 기존 RE:DO bundle/URL 등록을 유지한다.
- **iPhone 17 / iOS27.2.1에서 이력/보호·동일 문서/중앙 drag2개 모두 통과**: `/tmp/uxn-qa-qa-id-c5e55f33.log`, `/tmp/uxn-qa-qa-id-c5e55f33.xcresult`, 108.344초·실패0. UIKit 실제 touch로 native back/forward/경계/forward 갈래, 녹음/업로드/take/note/모달 잠금, 오래된 해제 메시지 차단, SPA/hash/replaceState·중앙 drag를 검사했다. fixture는 모의 상태이며 실마이크 검증으로 확대하지 않는다.
- xcresult의 실제 QA practice 복귀 스크린샷을 `/tmp/uxn-qa-device-attachments/`로 추출해 직접 확인했다.
- **실제 제품 번들의 별도 QA 앱 실행/재실행1개 통과**: `/tmp/uxn-qa-product-device.log`, `/tmp/uxn-qa-product-device.xcresult`, 12.471초·실패0. 테스트 종료 후 제품 `RE:DO QA`를 다시 실행해 두었으며 사용자에게 실제 영상/seek·마이크/미저장 보호·중앙 drag·가장자리 감각 스모크를 요청했다.
- 기존 자동/가상 검수 반복 없이 실제 iPhone 수용 범위와 새 테스트 실행 설정 결함만 검증했다. 기존 앱 삭제/원격 Git 게시/운영 배포는 수행하지 않았다. 현재 남은 관문은 실제 미디어/감각 사용자 확인이다.


### 5.3 사용자 미디어 스모크 — 입력 확대 고착 발견

- 사용자: 스와이프는 정상 작동. 새 영상 URL 입력 시 화면 확대가 남고 두 손가락 pinch로 복원 불가. 첨부 이미지에서 확대/우측 잘림 확인. 녹음/미디어 전체 정상 통과로 올리지 않는다.
- 코드 조사: URL 입력은 본문14px 상속, Capacitor 기본 zoomEnabled=false로 수동 zoom delegate 제한. viewport meta에는 user-scalable/maximum-scale 제한 없음. 사용자 증상과 코드의 원인 조합이며 실제 focus 배율은 후속 native 회귀에서 확인한다.
- [비교 시안](../명세/UXN_iOS입력확대_시안.html) A=URL16px+핀치 허용, B=URL16px만. 390/768/1150/1280에서 overflow 없음·입력44px 이상·14/16/16px 계산 글자 검증 통과, 390 라이트/1280 다크 캡처 직접 검토(`/tmp/uxn-input-preview/`). 제품 코드 미변경, 사용자 선택 대기. 실행/재개는 진행 §8.5.


### 5.4 입력 확대 A안 수정·표적 검증(2026-11-17)

- 사용자가 A(입력16px+핀치 허용)를 선택했다. `PracticePage.module.css:155-160` 공용 URL 입력에16px, `capacitor.config.ts`에 iOS zoomEnabled:true. 기존 최소44px·버튼 배치·API/DB·영상 URL 동작 유지. `npx cap copy ios`로 생성 설정/제품 public만 반영했고 테스트 fixture를 제품에 넣지 않았다. Android native 확대 정책은 변경하지 않았다.
- 새 UXN-Z Red4개: 기존14px로 기대16px 실패(`/tmp/uxn-zoom-web-red.log`). 최종 빈 화면/실제 열린 서랍의 입력16px·44px·열기 버튼과 비겹침/폭 경계4개 모두 통과(`/tmp/uxn-zoom-web-final.log`). 제품의 입력 form 캡처8개/다크1개를 직접 열어 검토(`test-results/uxn-input/form-{390,768,1150,1280}.png`, `drawer-*`, `drawer-dark.png`). 기존 크기/윗선·간격/토큰/직각·필 유지, 잘림/넘침 없음. Q1~Q9는 기존 화면과 대조했고 이번 글자 변경으로 새 위계/색/배치 변화 없음.
- 기존 A 버튼3폭은 최초 통과,1280만 build/dist 교체와 동시 테스트 중 준비 timeout. 빌드 종료 후1280만 같은 단언으로 재실행 통과(`/tmp/uxn-zoom-layout-1280.log`). 제품/테스트 단언 완화 없음. 새 URL spec 최종4개는 build 완료 후 단독 실행했다.
- `npm run build:app` 통과(`/tmp/uxn-zoom-build.log`), 디자인/앱 번들 Node13개 통과(`/tmp/uxn-zoom-node.log`), `npx cap copy ios` 통과(`/tmp/uxn-zoom-cap-copy.log`).
- 테스트 전용 input probe는 실제 제품 CSS module/tokens를 번들하고 실제 visualViewport.scale을 표시한다. 원본14px Simulator에서 키보드 포커스 후 **scale1.142**로 의도한 Red(`/tmp/uxn-zoom-native-red.log`, `/tmp/uxn-zoom-red.xcresult`). 배율 주입/SDK 가짜 성공을 사용하지 않았다.
- 수정본 iPhone17/iOS27.2.1에서 두 URL 입력의 실제 키보드 표시→타이핑→해제에 **16px/scale1.000 유지**, 실제 pinch 확대>1.2→축소 후 **scale1.000 복원**, 페이지 이력 불변 검사 통과(`/tmp/uxn-zoom-device-pinch.log`, `/tmp/uxn-zoom-device-pinch.xcresult`, 31.284초·실패0). 처음 합성 축소0.5는1.007에서 끝나 정확한1.000 단언 실패했으며 더 큰 실제 축소0.25로 재실행해 통과했다. 기대 배율 단언은 유지했다.
- zoomEnabled 변경 후 SPA/hash/replaceState·중앙 drag도 통과(`/tmp/uxn-zoom-device-green.xcresult`의 두 번째 테스트,25.823초). 첫 번째 테스트의 위1.007 실패가 있는 실행 전체를 성공이라고 표시하지 않는다.
- 최종 native 확대/복원 스크린샷을 `/tmp/uxn-zoom-device-attachments/`로 추출해16px/Scale1.000을 직접 확인했다. 외부 YouTube iframe의 자체 확대는 검사 범위와 구분한다. 실제 사용자의 기존 입력→영상추가 흐름은 수정 제품 QA 재확인으로 마무리한다.

- 수정된 실제 제품 QA 실행/재실행도 통과(`/tmp/uxn-zoom-product-device.log`, `/tmp/uxn-zoom-product-device.xcresult`,11.709초). 사용자가 직접 영상 URL을 입력하던 흐름의 재확인용으로 앱을 실행해 두었다. 현재 사용자 결과 대기, Git 게시/운영 배포 없음.


### 5.5 사용자 최종 확인·판정

- 사용자 답변 **“입력·확대 복원·스와이프 모두 정상”**. 수정 제품 QA에서 URL 입력 후 크기 유지·두 손가락 확대/축소 복원·기존 스와이프의 실제 사용 확인 통과.
- 이번 버튼·스와이프/native 자동화 및 추가 입력 확대 결함은 로컬 구현/수용 완료. 기존 미커밋 변경 보존·홈/기본4기기 검수 반복 없음. Git commit/push/PR/CI 게시·운영 배포는 수행하지 않았다. 서비스개선 다음 작업 없음.
- 사용자 최종 확인 범위는 입력/확대 복원/스와이프이며 실제 Google 장시간 유지·실마이크/YouTube 모든 조합의 포괄 검수로 확대하지 않는다. fixture/실제 SDK 가상 시계/실제 사용자 확인의 증거 차이는 앞 절대로 유지한다.
