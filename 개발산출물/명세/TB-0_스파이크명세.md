# TB-0 AlphaTab · SoundFont · CSP 스파이크 명세

기준일 2026-11-25 · 시니어 명세 · 실행 전

## 1. 목표와 범위

[기능확장.md](../../기능확장.md) §2.3·§5·§6의 TB 요구를 격리된 재현물에서 확인한다. iPad 10세대급의 Capacitor WKWebView와 저사양 랩탑 브라우저에서 악보를 그리고 재생·트랙 제어를 한 뒤, 새 플레이어를 만드는 곡 전환 10회 동안 이전 곡의 자원이 회수되는지 판정한다. 실행 시 승인된 경우 앱과 동일한 자산 배치 방식을 쓰는 임시 Capacitor 앱과 랩탑용 HTTPS 정적 페이지를 사용한다. 권리가 확인된 테스트 악보만 넣는다.

| ID | 확인한 전제 | 근거 |
|---|---|---|
| P1 | 지원 형식은 GP 계열 5종과 MusicXML 2종이다. 100~150MB는 상위 문서에 제시된 추정치이며 이번 실측의 출발점이다. | `기능확장.md:49-54`, `:169`, `:185` |
| P2 | 웹은 루트 패키지의 Vite 5.4.11로 빌드한다. 앱 조립 시 웹 산출물을 복사하고 진입 HTML의 `frame-src`와 `connect-src`에 지정한 출처를 반영한다. Capacitor의 `webDir`는 `dist-app`이다. | `package.json:11-15`, `:35`, `vite.config.ts:6-10`, `scripts/build-app-web.mjs:56-68`, `capacitor.config.ts:8` |
| P3 | 현행 문서 CSP는 워커를 금지하며 폰트에서 같은 출처를 허용하지 않는다. 보안 테스트는 meta 원문과 배치를 확인하며 서버는 일반 HTML에 별도의 프레임 삽입 차단 헤더를 적용한다. | `frontend/index.html:5`, `test/security.test.js:15-28`, `:324-330`, `:575-582`, `src/main/kotlin/ulevelp/Main.kt:346-348`, `:454` |
| P4 | 격리 재현물은 사용자 계정·API·DB·업로드·운영 저장소를 사용하지 않는다. 소유권과 DB 트랜잭션 검증은 TB-1 계약에서 다룬다. 이 스파이크의 비동기 경계는 악보 요청, 준비 이벤트 및 오디오 종료다. | `기능확장.md:67-84`, `:169-171` |

제품 소스·제품 빌드 설정·보안 테스트 원문·DB 마이그레이션·운영 정책 편집과 main 반영은 범위 밖이다. 제품 화면 시안과 구현은 TB-2에서 진행한다.

## 2. 버전 및 배포 권리 확인

| ID | 검증 대상 | 채택 또는 보류 기준 |
|---|---|---|
| LIC-01 | `@coderline/alphatab@1.9.0`과 태그 `v1.9.0` (`9f1aa10`). 배포 파일은 MPL-2.0이다. | 설치 타르볼의 integrity, 실제 라이선스와 고지 파일, 배포본에서 도달 가능한 해당 버전의 소스 위치를 기록한다. MPL 적용 파일을 수정하면 수정 소스를 제공한다. alphaTab 렌더링 크레딧은 유지한다. Bravura의 SIL OFL과 배포되는 추가 폰트의 고지도 자산 목록에서 확인한다. [릴리스](https://github.com/CoderLine/alphaTab/releases/tag/v1.9.0) · [태그 라이선스](https://github.com/CoderLine/alphaTab/blob/v1.9.0/LICENSE) · [Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) · [alphaTab 크레딧](https://alphatab.net/docs/attribution) · [Bravura OFL](https://github.com/CoderLine/alphaTab/blob/v1.9.0/packages/alphatab/font/bravura/Bravura-OFL.txt) |
| LIC-02 | **1순위 SONiVOX `sonivox.sf2`**. AlphaTab 태그 소스 기준 1,351,896 bytes, Apache-2.0. | 실제 배포 파일의 이름·크기·SHA-256을 기록하고 동봉된 저작권·라이선스와 해당 시 NOTICE를 확인한다. §4의 악기·재생 및 §5의 메모리 관문을 통과하면 채택한다. [동봉 라이선스](https://github.com/CoderLine/alphaTab/blob/v1.9.0/packages/alphatab/font/sonivox/LICENSE) · [Apache-2.0 원문](https://www.apache.org/licenses/LICENSE-2.0) |
| LIC-03 | **비교 후보 GeneralUser GS 2.0.3 `.sf2`**. 제작자 저장소 파일 기준 32,319,396 bytes. 자체 라이선스는 소프트웨어 사용·수정을 허용하며 일부 샘플의 출처 불확실성을 명시한다. | 원본은 경량 상한 30,000,000 bytes를 초과한다. 청감 비교가 필요할 때만 후보로 기록하고, 크기가 기준 이내인 파생본이나 다른 후보는 실제 파일의 출처·샘플 재배포 근거와 고지 파일을 확보한 뒤 같은 관문으로 평가한다. 제작자 파일의 정확한 리비전과 라이선스를 함께 고정한다. [제작자 배포](https://www.schristiancollins.com/generaluser.php) · [SF2 파일](https://github.com/mrbumpy409/GeneralUser-GS/blob/main/GeneralUser-GS.sf2) · [동봉 라이선스](https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt) |

경량 상한은 **원본 SF2 파일 30,000,000 bytes**로 정한다. 압축 전송 크기, 디스크 파일 크기, 메모리에 올라간 크기를 각기 기록한다. 재생 중에는 한 후보만 올린다. 재생할 때마다 재합성에 필요한 로드는 허용하며 자산은 동일 출처 또는 앱에 동봉한다. 곡 간 재사용은 HTTP/번들 캐시로 먼저 검증한다. 페이지가 SF2 원본 바이트를 캐싱하는 실험을 추가하면 캐시 유무를 별도 실행으로 구분하고 동일 조건의 기준선에 포함한다.

`@coderline/alphatab-vite@1.9.0`의 peer 범위는 `^6 || ^7 || ^8`이다. 첫 실험은 패키지의 정적 ESM 엔트리·워커·워크릿·공유 코어의 상대 경로를 보존한 동일 출처 배치를 사용한다. 실제 타르볼 엔트리와 배포 파일 목록을 근거로 경로를 고정한다. [공식 웹 설치 문서](https://www.alphatab.net/docs/getting-started/installation-web-projects) · [플러그인 패키지 메타데이터](https://registry.npmjs.org/@coderline%2Falphatab-vite/1.9.0)

## 3. CSP 검증

현행 `frontend/index.html:5`를 격리 페이지의 기준 정책으로 복제한다. 제품 반영 후보는 아래 표의 토큰 변경이며, 시나리오별 응답 헤더와 meta 원문을 함께 기록한다.

| 지시어 | 현재 → 첫 후보 | 판정 |
|---|---|---|
| `worker-src` | `'none'` → `'self'` | 같은 출처의 렌더·합성 워커를 확인한다. 실제 Worker URL이 `blob:`이며 해당 경로를 같은 출처 파일로 바꿀 수 없는 경우에만, 재현물에서 `'self' blob:`을 별도 비교한다. 차단 로그·URL 생성 주체·두 기기 결과를 근거로 필요성을 판정한다. |
| `font-src` | `https://fonts.gstatic.com` → `'self' https://fonts.gstatic.com` | Bravura 실제 응답과 폰트 로드 완료, 악보 글리프를 확인한다. |
| `script-src` | 현행 목록 적용 | 기존 `'self'`로 모듈·AudioWorklet 및 의존 청크를 검증한다. Worklet은 `addModule()` 성공 및 실제 노드/출력으로 확인하고 차단 시 브라우저의 `effectiveDirective`를 남긴다. 워커 성공을 Worklet 성공 증거로 쓰지 않는다. |
| `connect-src` | 현행 목록 적용 | 악보와 SF2의 같은 출처 요청을 확인한다. 현행 Supabase 호스트가 이미 목록에 있음을 대조한다. 서명 URL 발급·리다이렉트·권한·CORS는 후속 계약 검증이다. |
| 나머지 | 현행 목록 적용 | 이미지 Blob·추가 스토리지 출처는 TB-0 재현물에서 요구하지 않는다. `'unsafe-inline'`, `'unsafe-eval'`, `'wasm-unsafe-eval'`, 와일드카드·광역 스킴, 새로운 외부 스크립트 출처 없이 강제 모드로 판정한다. |

- **CSP-01** 기존 정책 적용 시 같은 출처 Worker와 Bravura를 각각 독립 요청해 예상 차단을 검증한다. 한 차단이 다른 요청을 생략하게 만들면 개별 재현으로 지시어를 확인한다.
- **CSP-02** 첫 후보로 동일한 빌드를 구동하고 Worker 생성, Worklet 모듈 및 공유 청크 로드, Bravura, 악보, SF2 요청과 첫 음을 확인한다. 허용된 요청의 URL·상태·실제 출처, `securitypolicyviolation`의 `effectiveDirective`·`blockedURI`·`disposition` 및 콘솔 오류를 수집한다. 산출물과 런타임 요청에서 WASM/동적 평가 경로 사용 여부를 확인한다.
- **CSP-03** 통과한 정책에서 의도적으로 허용되지 않은 출처의 테스트 Worker와 폰트 요청이 차단되는지 확인한다. 동일 출처 Worker를 실제 경로로 사용한다면 샘플 Blob Worker도 차단되어야 한다. 로컬에서 관리하는 테스트 출처와 CSP 차단 이벤트로 입증한다.
- **CSP-04** 운영 반영 후보의 지시어별 diff와 향후 보안 테스트 변경 지점을 기록한다. 제품 반영 단계에서 `frontend/index.html:5`, `test/security.test.js:15-28`의 원문을 함께 갱신하고 `node --test test/security.test.js test/app_web_bundle.test.js`로 웹·앱 조립을 확인한다. 현재 스파이크 합격 증거는 격리 빌드의 실기기 강제 CSP 결과다. [W3C CSP](https://www.w3.org/TR/CSP3/) · [AlphaTab Worker·Worklet 구조](https://www.alphatab.net/docs/getting-started/installation-web-projects)

## 4. 렌더링·재생·전환 시나리오

시험 입력은 자체 제작 또는 이용·공유 권리가 확인된 fixture로 고정한다. 파일별 확장자·SHA-256·바이트·마디/트랙 수·기대 트랙명과 사용 권리 근거를 남긴다. A는 32마디 GP 계열, B는 128마디 이상 MXL로 고르고 두 곡 모두 기타·베이스·드럼과 서로 구별 가능한 음형을 둔다. B는 박자·템포 변경을 최소 한 번 포함한다. 정확한 파일과 버전은 실행 시작 때 결과 문서에 봉인한다.

| ID | 실행 | 통과 기준 |
|---|---|---|
| PLAY-01 | `.gp`, `.gpx`, `.gp5`, `.gp4`, `.gp3`, `.xml`, `.mxl`을 각 기기에서 모두 연다. | 각 파일에서 기대 트랙과 마디를 확인하고 5초 이상 재생한다. 렌더 완료·실제 음 출력·재생 커서 이동을 기록한다. [포맷](https://www.alphatab.net/docs/features/import-load/) · [MXL 지원](https://www.alphatab.net/docs/formats/musicxml) |
| PLAY-02 | 초기 사용자 탭으로 재생을 시작한다. B에서 `core.enableLazyLoading: true`로 중간·마지막 악보까지 스크롤하고 마디를 선택한 뒤 재생·일시정지·재개한다. | 타브/오선 글리프, 마디 선택 후 탐색, 재생 커서·자동 스크롤, 마지막 구간 렌더링이 확인된다. 실제 사용한 SVG/Canvas와 Worklet 출력 경로를 기록한다. [지연 렌더링 설정](https://alphatab.net/docs/reference/settings/core/enablelazyloading) · [Web Audio 출력](https://alphatab.net/docs/features/play-sync/web-audio-and-audioworklet) |
| PLAY-03 | A와 B에서 기타 솔로 → 솔로 해제 → 베이스 뮤트 → 뮤트 해제 → 드럼 볼륨 0과 복원 → 트랙 표시 전환을 차례로 실행한다. | 기타·베이스·드럼의 구별 가능한 구간에서 기대 음이 들리고, 뮤트/볼륨 0인 대상 소리만 사라지며 원상 복구된다. 표시 전환과 재생 믹서 변경을 개별 기록한다. 후보 교체 시 같은 절차로 기타·베이스·드럼과 메트로놈 음, 무음·클리핑·끊김을 비교한다. |
| PLAY-04 | 악보 로딩을 지연시킨 상태에서 A→B→A 전환 및 닫기를 하고, 별도로 손상된 로컬 fixture를 로드한다. | 폐기된 요청/인스턴스의 뒤늦은 응답이 현재 곡·DOM·오디오를 바꾸지 않는다. 손상 입력은 오류가 관찰되고 소리가 시작되지 않으며 새 정상 곡을 다시 열 수 있다. 전환 경합과 오류 시험의 메모리는 §5 정규 시계열 바깥에 기록한다. |

## 5. 실제 기기 메모리 및 자원 해제

### 환경과 도구

- iPad는 10세대 4GB 또는 RAM 4GB 이하 동급 실기기에서 Capacitor **WKWebView**로 실행한다. 연결한 Mac에서 Safari Web Inspector의 Memory 타임라인과 JS Allocations를 사용한다. 검사 가능 설정은 계측용 앱에서만 사용한다. 랩탑은 물리 RAM 8GB 이하, 내장그래픽의 실기기에서 Chrome 또는 Edge 안정판을 사용한다. 브라우저 작업 관리자의 전용 탭/관련 프로세스 메모리와 DevTools의 JS heap·DOM·retainer를 수집한다. OS·브라우저/웹뷰·기기·RAM·빌드 해시·자산 크기·렌더러·오디오 모드·뷰포트·계측 도구를 함께 기록한다. [Apple 앱 검사](https://developer.apple.com/documentation/safari-developer-tools/inspect-apps-and-devices) · [WebKit 메모리 계측](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/)
- 전용 앱·탭만 연 상태로 화면을 계속 띄운다. iPad는 Web Inspector의 페이지 총량, 랩탑은 격리 탭의 메모리 footprint를 1차 지표로 고정한다. 같은 기기의 기준선·피크·종료값은 같은 도구·범위로 구한다. Worker/오디오 비용의 포함 여부와 관찰 한계를 기록한다. 별도 귀속이 가능하면 관련 프로세스/스레드 비용을 보조 수치로 제시하고 중복 합산을 피한다. JS heap은 객체 보존 근거로 사용한다. 측정 도구가 1차 수치를 제공하지 못하면 해당 기기의 수치 판정은 **보류**다.
- 자동 GC 상태로 1차 시계열을 수집한다. snapshot 또는 강제 GC는 별도 진단 반복에서만 사용한다. 워커·노드·컨텍스트를 검사 목적으로 참조하면 진단이 누수를 만들 수 있으므로 기록에는 ID·수치·상태만 남긴다.

### 측정 순서

1. 실행마다 새 탭/앱 실행으로 시작하고, 같은 A로 사용자 탭 → 5초 재생 → 정리 워밍업 1회를 진행한다. 무부하 상태로 30초 뒤부터 5초 간격으로 세 점을 읽고 중앙값을 기준선 `B0`으로 둔다. 워밍업 정리의 자원 카운터가 초기값인지 확인한다.
2. A를 다시 열어 재생한다. 이후 **A→B→A→B→A→B→A→B→A→B→A**로 최초 로드 이후 전환을 정확히 10회 수행한다. 각 곡에서 준비 완료, 5초 재생, 같은 스크롤 동작을 수행하고 로드 시작부터 재생 종료까지의 관측 피크 `P_i`를 저장한다. 대기 상한은 로드 30초로 두며 타임아웃을 기록한다.
3. 전환마다 이전 인스턴스를 먼저 정리하고 30초 뒤부터 5초 간격 세 점의 중앙값 `R_i`를 기록한 뒤 다음 곡을 연다. 전환 10회 후 마지막 A도 닫고 같은 방식으로 `R_end`를 기록한다. 별도 PLAY-04에서 대기 없이 전환해 경합을 확인한다.
4. 두 기기에서 독립 실행을 각각 2회 실시한다. 실행별 전체 타임라인, 10개 `R_i`, `R_end`, 피크, 이벤트 및 기기별 정리 로그를 보존한다. 재시험 시 변경 조건과 이유를 남긴다.

### 종료 조건과 합격선

- 각 전환·닫기마다 이전 곡 요청을 취소하거나 그 세대의 응답을 폐기한다. 이벤트 구독과 작업을 해제하고 `destroy()`를 인스턴스당 한 번 호출한다. 워커 종료, 오디오 그래프 연결 해제, `AudioContext.close()`의 Promise 이행과 `state === 'closed'`, 플레이어 DOM 제거, 자체 생성 Blob URL 회수를 관찰한다. `v1.9.0`의 Web Audio 출력 기반 클래스는 `destroy()`에서 컨텍스트의 `close()`를 호출하고 참조를 비운다. 라이브러리 소유 컨텍스트는 해당 호출의 완료를 계측하며 재차 닫지 않는다. 재현물이 직접 생성한 컨텍스트는 재현물이 닫고 완료를 기다린다. [태그의 종료 경로](https://github.com/CoderLine/alphaTab/blob/v1.9.0/packages/alphatab/src/platform/javascript/AlphaSynthWebAudioOutputBase.ts#L229-L242)
- 이전 세대 Worker·Worklet 노드·미종료 AudioContext·활성 구독·대기 요청·악보 DOM의 잔존 카운트가 매 정리 후 **0**이어야 한다. DOM/heap 진단에서 폐기된 곡의 Score·렌더러·오디오 그래프가 이전 세대 식별자로 계속 보존되면 실패다. 이전 곡 음 재생, 페이지 재시작/종료, 재생 중 인식 가능한 끊김도 실패다.
- 실행마다 최초 A부터 마지막 A까지의 피크에 `max(P_0…P_10) − B0 ≤ 150 MB`를 적용한다. 각 `R_1…R_10`과 `R_end`에서 `B0`을 뺀 잔류 증가량은 모두 `max(10 MB, B0 × 10%)` 이하여야 한다. 마지막 3회 `R_8…R_10` 중앙값에서 최초 3회 `R_1…R_3` 중앙값을 뺀 값은 **5 MB 이하**여야 한다. 1 MB는 1,000,000 bytes로 환산한다. 이 값들은 실측 전 설정한 스파이크 판정값이다.

## 6. 결론 및 인계 산출물

`개발산출물/결과/TB-0_스파이크.md`에 적용 대상과 명령, LIC/CSP/PLAY 및 양 기기별 메모리 판정을 남긴다. 자산 manifest(출처·버전·integrity/SHA-256·바이트·라이선스·고지), 적용 정책 diff, 환경별 CSP 콘솔·네트워크 로그, 실행별 원시 메모리/종료 로그와 증거 경로를 붙인다.

- **통과**는 재배포 근거가 확인된 경량 SF2 한 종과 고정한 AlphaTab으로 두 환경의 강제 CSP, 전 포맷, 트랙 제어, 전환·종료 판정에 모두 합격한 상태다. 첫 후보가 통과하면 그 지시어 차이를 TB-2 입력으로 넘긴다.
- **실패**는 기준 초과, 미해제 자원, 재생·포맷 실패 또는 과도한 CSP 권한에 의존하는 경우다. 확보한 증거와 재현 조건을 기록하고 영향 범위의 후속 착수 판단에 반영한다.
- **보류**는 필수 실기기·계측·자산 권리·재현 로그를 확보하지 못한 상태다. 어느 관문에 어떤 증거가 필요한지 기록한다. iPad Safari와 데스크톱 모바일 에뮬레이션은 보조 결과로만 기록한다.
