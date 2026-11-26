# TB-2-2 악보 플레이어 검수

2026-11-26 · Windows · [구현명세 §7](../명세/TB-2_구현명세.md#7-구현-후-검수) · [진행 기록](../진행_TB_악보플레이어.md)

## 환경과 재현

- `feat/TB-2-tab-player`, 기준 HEAD `29a3bb41d170ac14bfc1feeb504b60e128ff2e4e`와 미커밋 변경으로 만든 제품 번들을 사용한다. 각 원시 기록에 SPA와 alphaTab core의 SHA-256을 남겼다.
- Playwright Chromium에서 설치된 Edge 안정판(`channel: 'msedge'`)을 사용했다. 각 메모리 실행은 독립 브라우저 프로필·탭·프로세스 마커를 사용했다. 브라우저 버전·OS·CPU는 각 원시 기록에 있다.
- 격리된 로컬 제품 웹 경로 `/practice.html`에서 HOME 진입, 곡 열기, 목록 클릭과 화면 이탈을 수행한다. 인증 API, 저장소 서명 파일 응답과 R3 시험용 SF2는 Playwright에서 공급했다. A는 `A.gp` 12,145 bytes, B는 `B.mxl` 7,502 bytes이며 TB-0 자체 제작 파일이다. 매 열기에서 서명 API를 요청하고, 웜업 이후 동일 계정의 IndexedDB 적중을 허용한다.
- 지표는 프로필 마커에 속한 renderer 프로세스의 Windows `PrivatePageCount` 합계다. 원시 값은 bytes이며 표는 1 MB = 1,000,000 bytes로 표시한다. 각 `R`과 `B0`은 30초 후부터 5초 간격으로 채집한 세 점의 중앙값이다. 각 곡에서 Web Audio 출력을 5초간 RMS 샘플링했다. 음향 장치 출력은 브라우저의 음소거로 차단했다. 강제 GC는 호출하지 않았다.
- 제품 번들 생성은 `npm run build`. 로컬 테스트 서버에 연결한 뒤 `node test/e2e/support/tab-memory.js <run>`을 실행한다. `TB2_ORIGIN`으로 서버 원점을 바꿀 수 있다. 데스크톱 계측 코드가 메인 모듈에 alphaTab API 호출 카운터를 붙인다. Canvas·오디오·스토리지 동작은 제품 경로를 통과한다.

## 구현 중 확인한 결함과 보완

1. 재사용 때 준비 이벤트가 MIDI 완료보다 먼저 발생할 수 있었다. MIDI 완료 시 플레이어 준비 상태를 다시 조회하고, 같은 로드에서 발행된 모든 MIDI 요청의 완료를 소비하도록 했다.
2. alphaTab 1.9.0 원본은 일시정지 뒤 재생할 때 같은 컨텍스트에 새 Worklet 노드를 생성했다. D3-A의 생성 횟수 단언이 예비 계측 6·7의 P1에서 실패했다. Vite가 생성하는 로컬 패치에서 노드 하나를 유지하고 일시정지 시 입력과 출력 연결·샘플·요청 카운터를 정리한다. 화면 이탈에 포트를 닫고 기존 라이브러리의 AudioContext 종료를 관찰한다. 패치 원문과 MPL 전문·원본 태그 링크를 `/at/`에 동봉했다.
3. 점진 렌더가 악보 스크롤 영역 밖에서 Canvas 생성을 미룬다. 계측에서는 선택 뒤 악보를 화면 안으로 스크롤하고 Canvas 표시를 확인했다. 긴 곡을 탐색할 때 화면 밖 Canvas 보관량은 악보 스크롤 영역의 크기로 제한했다.
4. `A.gp`처럼 `showStandardNotation=false`로 저장된 트랙에서 오선지(`StaveProfile.Score`) 전환 시 `ScoreBarRendererFactory.canCreate`가 false가 되어 `StaffSystem.addMasterBarRenderers`에서 `this.staves[0]` undefined 예외가 발생했다. `tabEngine.ts`의 `scoreLoaded`·`displayTrack`에서 오선지/타브 전환 시 해당 플래그를 보장하고 `supportsTab`에서 타악기 트랙을 제외하도록 보완했다.
5. `PracticePage.module.css`의 `.tabTag` `4px` 곡률, `TabPlayer.module.css`의 순백/직접 색 값, `PracticePage.tsx`의 동적 `tab.${cause.kind}` i18n 키, `#urlForm` 상시 노출로 인한 `DS23-P2/P3`·`WF2-W` 회귀, 곡 전환 저장 중 `switchingSong` 잠금(`UXR3-PL09`) 누락을 모두 수정했다.

## TB2-L / A / U / P / R / C 검증 결과

- 빌드: `npm run build` (`tsc --noEmit && vite build`) 오류 0 (`201 modules`).
- Node 단위 테스트: `node --test test/design_rules.test.js test/r3_practice_log.test.js test/security.test.js test/app_web_bundle.test.js test/recent_song_cache.test.js` **50 passed / 0 failed**, `I0-6` 통과. (`ch2c1`, `ch2c3`, `LA-1`은 Windows CRLF 체크아웃 환경 차이로 기존 파일에서 실패 — TB-2 신규 소스 6개는 한글 하드코딩 0건 확인.)
- 브라우저 E2E (Windows Edge 안정판):
  - `test/e2e/tab-player.spec.js`: **14 passed / 0 failed** (TB2-L 6폭, TB2-P/C, TB2-R 2건, TB2-U 2건, TB2-C, TB2-A, TB2-P 오선지/트랙 뮤트).
  - `test/e2e/home-category.spec.js` (6), `test/e2e/player-category.spec.js` (6), `test/e2e/remote-player.spec.js` (1): **13 passed / 0 failed**.
  - `test/e2e/layout/practice.spec.js`: 기존 72 passed + 회귀/단언 수정 후 표적 24건(`DS23-P1~4`, `WF2-W` 3폭, `UXR3-PL09`, `UXN-Z` 4폭, `SL2-01~05`) **전부 통과**.
  - 기존 테스트 단언 보정(`test/e2e/layout/practice.spec.js`): `?include=tab` 계약에 맞춰 `SL2-02~05`의 `endsWith('/api/v1/songs/order')` 7곳을 `new URL(r.url()).pathname === '/api/v1/songs/order'`로, D1-A 등록 버튼 추가에 맞춰 `UXN-Z`의 `#urlForm`/`#urlForm2` 버튼 셀렉터를 `button[type="submit"]`로 구체화했다.
- 미실행: Kotlin `./gradlew test`(TB-1 서버 계약 무변경, `Main.kt` 정적 MIME 6줄만 추가 — CI 또는 4단계에서 확인 필요), Playwright 전체 스위트, 4폭 스크린샷 수동 Q1~Q9 검토, Git 커밋·push·PR.

## TB2-M 데스크톱 10회 전환

- 원시 기록: `test-results/tb2-memory/run-12.json`, `run-13.json` (Edge 158.0.0.0, Windows 10.0.26200, Intel i7-14650HX, `bundleSha256=0fd6bf7adf86…`, `coreSha256=7b9588c90b24…`, Worklet 재사용 패치 및 detached canvas 예산 보완 적용 빌드; 직전 수정인 `tabEngine.ts` 오선지 플래그·CSS 토큰 변경은 10회 전환 경로와 무관하나 최종 재측정은 미실행).

| 실행 | B0 (MB) | R0 (MB) | 피크−B0 (≤150) | 최대 R_i−R0 (D3-A ≤10%) | 최대 R_i−B0 (D3-B) | R_end−B0 (≤10%) | 드리프트 (≤5) | 카운터·CSP·RMS | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| run-12 | 109.63 | 153.86 | **+87.20 통과** | +31.91 (R9, 한도 10.96) **초과** | +76.14 | +18.28 (한도 10.96) **초과** | +15.69 **초과** | API 2(destroy 1), Worker 2(종료), AudioContext 2(closed), Worklet 2, URL 0, Canvas 0, CSP 위반 0, 전 곡 유음 | **조건부 통과** (D3-A 수치 초과, R1 이월) |
| run-13 | 110.37 | 153.09 | **+85.14 통과** | +34.95 (R9, 한도 11.04) **초과** | +77.66 | +14.73 (한도 11.04) **초과** | +7.57 **초과** | 동일 (전부 0/정상) | **조건부 통과** (D3-A 수치 초과, R1 이월) |

- **판정 및 관찰 해석 (2026-11-26 사용자 승인 — 조건부 통과):** JS Heap(`14.2~19.2 MB`), DOM Nodes(`948~994`), Listeners(`328~330`)는 10회 전환 동안 누수 없이 고정되었고, 모든 자원 카운터(API·Worker·AudioContext·Worklet·ObjectURL·Canvas)와 CSP 위반 0건, 준비 시간(125~506ms), 피크(+85~87MB)를 통과했다. 반면 Windows `PrivatePageCount`는 강제 GC 없는 상태에서 `R9`(185.8~188.0 MB)까지 상승했다가 `R10`에서 `162.3~162.5 MB`(`R0` 대비 `+8.4~9.4 MB`, 한도 이내)로 자연 회수되는 톱니파 패턴을 보였고, 이탈 후 `R_end`도 `B0` 대비 `+14.7~18.3 MB`(한도 `~11 MB` 초과)가 남았다. 16GB+ 데스크톱 환경의 지연 회수 특성과 자원 카운터 0·JS Heap 안정을 근거로 사용자 승인을 받아 조건부 통과로 처리하며, 실기기(iPad WKWebView·저사양 랩탑) 메모리 검증은 출시 전 관문 R1로 이월한다.
