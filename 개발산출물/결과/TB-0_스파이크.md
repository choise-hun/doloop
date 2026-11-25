# TB-0 AlphaTab · SoundFont · CSP 스파이크 결과

기준일 2026-11-25 · Windows PC 1차 실행 · 명세 [TB-0 스파이크 명세](../명세/TB-0_스파이크명세.md) · 진행 [진행_TB](../진행_TB_악보플레이어.md)

## 0. 종합 판정

**조건부 통과 (2026-11-25 사용자 승인).** 명세 기준으로는 보류다. 필수 환경인 iPad WKWebView 실기기와 저사양 랩탑(RAM 8GB 이하, 내장그래픽)을 확보하지 못했고, SONiVOX 재배포 근거와 GP3·GP4·GP5·GPX fixture도 없다. 사용자에게 실측할 기기가 없으므로, 확인된 데스크톱 결과로 TB-0을 닫고 남은 위험은 아래 조건으로 넘기기로 했다. TB-1은 이 조건과 무관하게 착수한다.

| ID | 받아들인 위험 | 넘기는 조건 (해소 시점) |
|---|---|---|
| R1 | iPad WKWebView·저사양 랩탑 실측 없음. 메모리 한도·오디오 끊김이 기기에서 다를 수 있다 | TB 출시 전 관문: 베타 사용자의 iPad 또는 저사양 기기로 재생·10회 전환·청감을 확인한다(`상용_서비스_계획.md` §4) |
| R2 | 곡마다 새 플레이어를 만들면 데스크톱에서도 잔류 메모리가 기준을 넘는다(§2.6) | **TB-2 설계 확정**: `PLAYER` 화면당 `AlphaTabApi` 하나, 곡 전환은 `api.load()`, 화면 이탈 때만 `destroy()`. TB-2 완료 기준에 이 방식의 데스크톱 10회 전환 재측정 통과(§5 합격선)를 넣는다 |
| R3 | SONiVOX SF2의 샘플 출처 서술이 엇갈린다(LIC-02) | 개발·내부 시험에서는 사용한다. TB 출시 전 관문: 출처 근거를 확보하거나 재배포 근거가 확인된 다른 경량 후보로 바꾼다 |
| R4 | `.gp3`·`.gp4`·`.gp5`·`.gpx`는 권리가 확인된 fixture가 없어 미검증 | 1차 지원 포맷은 검증된 `.gp`·`.xml`·`.mxl`로 한다. 나머지 4종은 권리 확인된 파일(예: 사용자 본인 소유 파일)로 PLAY-01을 통과한 뒤 추가한다 |

확보한 데스크톱 보조 결과에서는 아래 두 가지가 TB-2 설계 입력이다.

1. **CSP 첫 후보만으로는 부족하다.** alphaTab이 `<style>` 두 개를 주입하므로 `style-src`에 해시 2개를 더해야 하고, 렌더 엔진은 Canvas(`html5`)로 정한다. 이 조합이면 `'unsafe-inline'`과 `blob:` 없이 위반 0건으로 동작한다.
2. **곡마다 플레이어를 새로 만드는 전환은 데스크톱 메모리 관문에서 실패했다.** 잔류 증가량이 +36MB, 드리프트가 +23~26MB였다. 회수되지 않는 메모리는 오디오 경로(인스턴스별 AudioContext·AudioWorklet·합성기)에서 생긴다. 인스턴스 하나를 유지하고 `api.load()`로 곡만 바꾸는 진단에서는 증가가 멈췄다.

| 관문 | 데스크톱 Edge 158 (보조) | iPad WKWebView | 저사양 랩탑 | 판정 |
|---|---|---|---|---|
| LIC-01 alphaTab 1.9.0 | integrity 일치, MPL-2.0·크레딧 확인 | — | — | **통과**(고지 조건 §1) |
| LIC-02 SONiVOX SF2 | 파일·해시 확인, 출처 서술 불일치 | — | — | **보류** |
| LIC-03 GeneralUser GS | 미평가(30MB 상한 초과) | — | — | 미평가 |
| CSP-01 현행 정책 차단 | Worker 차단, style 2건 차단 | 미실행 | 미실행 | 데스크톱 확인 |
| CSP-02 첫 후보 | **실패**(글리프 누락) | 미실행 | 미실행 | 실패 → 수정안 §2.3 |
| CSP-02′ 수정안(해시+Canvas) | 위반 0, 폰트·Worker·Worklet·SF2·첫 음 | 미실행 | 미실행 | 데스크톱 통과, 실기기 보류 |
| CSP-03 비허용 출처 차단 | 통과 | 미실행 | 미실행 | 데스크톱 통과 |
| PLAY-01 포맷 | `.gp`·`.xml`·`.mxl` 통과, 나머지 4종 fixture 없음 | 미실행 | 미실행 | **보류** |
| PLAY-02 지연 렌더·탐색 | 통과 | 미실행 | 미실행 | 데스크톱 통과 |
| PLAY-03 트랙 제어 | RMS 기준 통과, 청감 미확인 | 미실행 | 미실행 | 데스크톱 조건부 |
| PLAY-04 경합·손상 입력 | 통과 | 미실행 | 미실행 | 데스크톱 통과 |
| §5 메모리(새 인스턴스 전환) | 피크 통과, 잔류·드리프트 **실패**, 카운터 0 | 미실행 | 미실행 | **데스크톱 실패**, 실기기 보류 |

## 1. 환경과 재현물

- 작업 트리 `C:\seokhunchoi_Ax_Fullstack\doloop`, 브랜치 `chore/team-docs-untrack`, HEAD `e42f666`. `origin/main`은 `c8b5bec`(PR #67 머지)이고 HEAD는 그 조상이다. 열린 main 대상 PR은 0건이다. tracked diff는 없었다. 기존 미추적 `기능확장.md`, TB 명세, 진행 파일은 그대로 보존했다.
- 장비: Windows 11 Pro 10.0.26200, Intel i7-14650HX, RAM 16,868,626,432 bytes, NVIDIA RTX 5060 Laptop + Intel UHD. 명세의 저사양 조건(RAM 8GB 이하, 내장그래픽)을 **충족하지 않는다.** 그래서 이 PC의 수치는 모두 보조 결과다.
- 브라우저: Microsoft Edge 안정판 158.0.4370.33(Playwright `channel: 'msedge'`, headless, `--mute-audio`). UA는 `HeadlessChrome/158.0.0.0 … Edg/158.0.0.0`이다.
- 재현물은 [자료/TB-0_재현물](../자료/TB-0_재현물/README.md)에 있다(제품 소스·빌드 설정·DB·API 미사용). 같은 출처 정적 서버 `127.0.0.1:5179`에서 진입 HTML에 CSP meta를 주입하는데, 이는 제품의 meta 방식과 같다. 타 출처는 `:5180`을 쓴다. ESM 엔트리 `/at/alphaTab.mjs`를 직접 로드하며 번들러는 쓰지 않는다. alphaTab의 `BrowserModule` 경로에서는 Worker가 `new URL('./alphaTab.worker.mjs', import.meta.url)`, Worklet이 `addModule(new URL('./alphaTab.worklet.mjs', …))`로 같은 출처에서 뜬다. 이 동작은 `alphaTab.mjs:47-89`에서 확인했다.
- 재현물 설정: `core.fontDirectory '/at/font/'`, `core.enableLazyLoading true`, `core.engine 'html5'`(비교용 `svg`), `player.playerMode EnabledSynthesizer`, `player.outputMode WebAudioAudioWorklets`, `player.soundFont '/at/soundfont/sonivox.sf2'`. 응답에는 COOP/COEP를 적용했다(`crossOriginIsolated: true`).
- 미실행: Mac·Xcode·iPad 실기기, 저사양 랩탑, Chrome 안정판 교차 실행(158.0.8127.37 설치 확인만), 사람 청감 확인.

## 2. 결과 상세

### 2.1 자산 manifest (LIC)

| 자산 | 출처·버전 | 무결성 | 바이트 | 라이선스·고지 |
|---|---|---|---|---|
| `@coderline/alphatab` 타르볼 | npm 1.9.0, gitHead `9f1aa10460df1b326123d28a2222f7b20d081e61` | sha512 `pG/Um03DdiTW7i9KR+rPTRRnzIW5oJBWs67altBXtCkxGvUG1RuvkgRTZO3GIaOD2vATjcw+5OevMZl9I2/T+Q==`(레지스트리 `dist.integrity`와 일치), sha256 `e9e9b795…af35` | 4,891,117 | MPL-2.0. 패키지 `LICENSE`는 3줄 요약뿐이고 MPL 전문은 동봉되지 않았다. `LICENSE.header`에 TinySoundFont·SFZero(MIT), Bravura(OFL 1.1) 고지가 있다 |
| `dist/alphaTab.core.mjs` | 1.9.0 build 37 | sha256 `7d5e9412…588e` | 2,606,053 | MPL-2.0 |
| `dist/alphaTab.mjs` / `.worker.mjs` / `.worklet.mjs` | 〃 | `0f4bf9f0…ff8a` / `fc0bcc60…5d5f` / `b69937dc…959c` | 6,238 / 1,510 / 1,517 | MPL-2.0 |
| `dist/font/Bravura.woff2` (`.woff`·`.otf` 대체 경로) | Steinberg Bravura | `181e0e7c…2b19` | 313,348 | SIL OFL 1.1, 동봉 `Bravura-OFL.txt`(`c24929be…19ee`)·`OFL-FAQ`·`FONTLOG` |
| `dist/soundfont/sonivox.sf2` | alphaTab 동봉 | `4978cf37e7164206f2d22dc4fdf4020ffe040787210bf781e31bdc79961f59ef` | 1,351,896 | `LICENSE`: "Copyright (c) 2004-2006 Sonic Network Inc. / Apache License 2.0" 고지(NOTICE 없음) |
| fixture `A.gp` | 자체 제작([생성기](../자료/TB-0_재현물/tools/make-fixtures.mjs), alphaTab Gp7Exporter) | `ea89d7dd0c21f135e7d44e28a03034c2539ff8d639d4c523e2609b4e9152da7f` | 12,145 | 자체 제작, 외부 악곡 없음. 32마디·4/4·120bpm·Guitar(6현 TAB)·Bass(4현 TAB)·Drums |
| fixture `B.xml` / `B.mxl` | 자체 제작 MusicXML 4.0 / 그 ZIP | `a57d0c0a…e434` / `44e89c5a…c343` | 477,343 / 7,502 | 자체 제작. 136마디, 65~72마디 3/4, 97마디 템포 90 |
| fixture `broken.gp` | `A.gp` 앞 64바이트 | `d36e9ffc…eed` | 64 | 손상 입력 |

- **LIC-01 통과(조건부 고지).** 수정하지 않은 npm 배포본을 쓰므로 수정 소스 제공 의무는 없다. 다만 제품 배포 시 MPL-2.0 고지와 해당 버전 소스 위치(GitHub 태그 `v1.9.0`)를 오픈소스 고지에 넣어야 하고, Bravura OFL 고지도 함께 넣는다. `LICENSE.header`에 따라 렌더 결과의 `♪ alphaTab.net` 크레딧은 숨기거나 잘라내지 않는다. 이번 스크린샷에서도 크레딧이 보였다.
- **LIC-02 보류.** `LICENSE`는 Apache-2.0(Sonic Network 2004-2006)이다. 그러나 동봉 `README.md`는 "Samsung GT-E1272… Spreadtrum… Android Soundfont of SONiVOX EAS"에서 포팅했고 "Creative Sound Blaster GM bank"를 사용했으며 "wt210k_G.sf2"를 복사했다고 적는다. 저작권 연도(1993 vs 2004-2006)도 서로 다르다. README가 인용한 musical-artifacts 1517 페이지는 403으로 읽지 못했다. 샘플 전부가 AOSP Sonivox(Apache-2.0)에서 왔다는 근거가 있어야 채택할 수 있다. 기술 관문(용량 1.35MB, 재생·메모리)은 문제없었다.
- **LIC-03 미평가.** 원본 32,319,396 bytes로 경량 상한 30,000,000 bytes를 넘는다.

### 2.2 CSP-01 · CSP-02 (현행·첫 후보)

증거: `자료/TB-0_재현물/evidence/csp/*.json`. 스크린샷 `*.png`는 git에서 제외했고 작성 PC(Windows)에만 있다. `tools/smoke.mjs`로 다시 만들 수 있다. A.gp를 연 뒤 3초 재생한 결과다.

| 정책 × 엔진 | 위반(`effectiveDirective` · 원천) | 결과 |
|---|---|---|
| 현행 × svg | `worker-src` `/at/alphaTab.worker.mjs` 2건, `style-src-elem` inline 2건(`alphaTab.core.mjs:45695` 폰트 `@font-face`, `:45755` 공용 CSS) | 렌더 미완료, 플레이어 미준비, RMS 0 |
| 현행 × html5 | `worker-src` 1, `style-src-elem` 2 | 렌더는 됨, 플레이어 미준비, RMS 0, 폰트 미등록 |
| 첫 후보 × svg | `style-src-elem` 2, **`style-src-attr` inline 406건**(`:45816` SVG 문자열 `innerHTML`의 `style=` 속성) | Worker·Worklet·SF2 성공, RMS 0.287, **Bravura 미등록 → 음표 머리·음자리표·박자표 누락**(스크린샷 `candidate-svg-A.gp.png`) |
| 첫 후보 × html5 | `style-src-elem` 2 | 재생 성공, RMS 0.267, 글리프 누락 |
| 첫 후보 + 해시 × svg | `style-src-attr` 406 | 폰트 로드, 재생 정상. SVG `style` 속성 위반은 남음 |
| **첫 후보 + 해시 × html5** | **0건** | 폰트 `alphaTab:loaded`, Worker 1·AudioWorklet 1, SF2 200, RMS 0.290, 커서 이동(`candidate-html5-hash-A.gp.png`) |

- 런타임에서 WASM과 동적 평가는 쓰이지 않았다. `alphaTab.core.mjs`에서 `eval(`·`new Function`·`WebAssembly`는 각 0건이고, `createObjectURL` 2건은 오디오 내보내기·다운로드 경로다. 수정안 정책에서 `unsafe-eval` 위반은 0건이었다.
- 첫 후보에서 Worker URL은 같은 출처 파일이었다. `blob:` 대체 경로는 `new Worker(new URL(...))` 생성이 실패할 때만 쓰이므로 `'self' blob:` 비교는 필요하지 않았다.
- 해시 대상 문자열은 `tb.styleTexts()`로 수집했다. 폰트 CSS는 `core.fontDirectory`를 URL에 그대로 넣기 때문에 **경로가 바뀌면 해시도 바뀐다.** TB-2에서는 `fontDirectory`를 고정하고, 보안 테스트가 이 해시를 단언하도록 한다.

### 2.3 TB-2로 넘길 CSP 지시어 diff (CSP-04)

```diff
- style-src 'self' https://fonts.googleapis.com 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig='
+ style-src 'self' https://fonts.googleapis.com 'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=' 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig=' 'sha256-EIR5s3Qp1PxPxW4Koopu9nVN+I2chNMT0ImH3VG/s+c=' 'sha256-ago6aunBhfAMrD80tguQXUt95n6srkO3pzX2dUHs0gs='
- font-src https://fonts.gstatic.com
+ font-src 'self' https://fonts.gstatic.com
- worker-src 'none'
+ worker-src 'self'
```

- 해시 2개는 `fontDirectory '/at/font/'` 기준으로 `alphaTabStyleShared`와 `alphaTabStyle`(Bravura `@font-face`)의 원문이다. 제품에 반영할 때는 실제 자산 경로로 다시 계산한다.
- 엔진은 `core.engine: 'html5'`(Canvas)로 고정한다. SVG를 쓰려면 `style-src-attr 'unsafe-inline'`이 필요한데 이것은 명세 금지 범위다.
- 변경 지점은 `frontend/index.html:5`와 `test/security.test.js:15-28`의 원문 단언이다. 검증 명령은 `node --test test/security.test.js test/app_web_bundle.test.js`이며 제품 반영 단계에서 실행한다(이번에는 미실행).
- 나머지 지시어(`script-src`, `connect-src`, `img-src`, `media-src` 등)는 현행 그대로 동작했다. Worklet `addModule`은 `script-src 'self'`로 성공했고 AudioWorkletNode 생성과 RMS 0.29 출력으로 확인했다.

### 2.4 CSP-03 (비허용 출처 차단)

증거 `evidence/play/candidate-html5-hash-msedge.json`의 `csp03`.

| 시도 | 결과 |
|---|---|
| 타 출처 Worker `http://127.0.0.1:5180/x-worker.js` | `SecurityError`로 생성 거부. 브라우저의 동일 출처 Worker 제한으로 CSP 이전 단계에서 막힘 |
| Blob Worker | `worker-src blob enforce` 위반 이벤트, 메시지 없음 |
| 타 출처 폰트 `FontFace(:5180/x-font.woff2)` | `font-src http://127.0.0.1:5180/x-font.woff2 enforce` 위반, `NetworkError` |

### 2.5 PLAY-01~04 (수정안 정책, html5)

증거 `evidence/play/candidate-html5-hash-msedge.json`과 `*-play01-*.png`·`*-play02-*.png`.

- **PLAY-01**: `A.gp`는 32마디·3트랙(Guitar, Bass, Drums), 준비 264ms, 5.2초 재생, 커서 0→5,120ms(화면 x 117→688), RMS 0.292. `B.xml`은 136마디·3트랙, 준비 170ms, 커서 →5,141ms, RMS 0.292. `B.mxl`은 136마디, 준비 199ms, 커서 →5,131ms, RMS 0.287. **`.gp3`·`.gp4`·`.gp5`·`.gpx`는 보류**다. 권리가 확인된 fixture가 없고, 자체 제작하려면 Guitar Pro 같은 저작 도구가 필요하다.
- **PLAY-02**: B.mxl의 placeholder는 30개이고 화면 근처 7~8개만 채워진다. 지연 렌더링은 화면 밖 결과를 비우는 방식으로 동작했다. 끝까지 스크롤하면 마지막 placeholder가 채워진다. 마디 100(인덱스 99)의 bounds를 클릭하면 tick 373,440이 되며, 이는 마디 100 범위(372,480~376,320) 안이다. 클릭 위치에서 재생하면 196.7→199.6초로 진행하고, 일시정지 2초 동안 위치가 유지되며, 재개하면 199.3→201.9초로 진행한다. 출력 경로는 Canvas + AudioWorklet이다. TAB 글리프는 `play02-bar100.png`, 오선 글리프는 `csp/candidate-html5-hash-A.gp.png`(튜닝 추가 전 fixture)에서 확인했다.
- **PLAY-03** (출력 RMS 최대값, 1.5초 창):

| 단계 | A.gp | B.mxl |
|---|---|---|
| 전체 | 0.290 | 0.267 |
| Guitar 솔로 | 0.082 | 0.080 |
| 솔로 해제 | 0.261 | 0.257 |
| Bass 뮤트 / 해제 | 0.239 / 0.287 | 0.239 / 0.278 |
| Drums 볼륨 0 / 1 | 0.193 / 0.283 | 0.193 / 0.265 |
| Bass 단독 / Drums 단독 | 0.179 / 0.231 | 0.179 / 0.225 |
| 전부 뮤트 | **0** | **0** |
| 전부 뮤트 + 메트로놈 1 | 0.050 | 0.050 |
| 복구 | 0.291 | 0.275 |
| 표시 전환(`renderTracks([Bass])` → 전체) 뒤 | 0.297 (표시 `[Bass]` → 3트랙) | 0.286 |

  각 트랙이 단독으로 소리를 내고, 뮤트나 볼륨 0이면 해당 성분만 줄며, 원상 복구된다. 표시 전환은 믹서에 영향을 주지 않았다. **사람의 청감 확인(구별·클리핑·끊김)은 미실행**이므로 실기기 시험에서 확인한다.
- **PLAY-04**: A(3초 지연)→B(2초 지연)→A(1초 지연)→닫기 경합에서 늦게 온 응답 3건을 폐기했다. 그 뒤 현재 곡은 없고 플레이어 DOM은 0이며 모든 자원 카운터가 0이다. A(2.5초 지연)를 연 직후 B를 즉시 열면 최종 곡은 B(136마디)다. `broken.gp`는 `error: "Unexpected end of data within reader"`를 내고, `play()`를 호출해도 RMS가 0이다. 그 뒤 A를 다시 열면 RMS 0.276으로 재생된다.

### 2.6 §5 메모리 · 자원 해제 (데스크톱 보조, 새 인스턴스 전환)

- 1차 지표는 탭 렌더러 프로세스의 `PrivatePageCount` 합(bytes)이다. Worker와 AudioWorklet 스레드가 같은 렌더러 프로세스에 포함된다. 0.4초 간격 샘플러로 수집했다. 보조 지표는 같은 브라우저 인스턴스 전체 합, CDP `JSHeapUsedSize`·`Nodes`다. 오디오 서비스(utility)·GPU 프로세스 비용은 1차 지표에서 빠진다(관찰 한계).
- 절차는 명세 그대로다. 워밍업 A → 정리 → 30초 대기 후 5초 간격 3점 중앙값으로 `B0`를 구하고, A + 10회 전환 `A→B→…→A`, 각 곡은 준비 → 5초 재생 → 같은 스크롤(½ → 끝 → 처음)을 거친다. 전환마다 정리한 뒤 `R_i`를 재고, 마지막에 `R_end`를 잰다. 자동 GC 상태로 측정했다. 원시 기록은 `evidence/mem/run{1,2}-msedge-html5.json`과 `-samples.csv`에 있다.

| 실행 | B0 | 피크 P0…P10 (MB) | R1…R10 (MB) | R_end | 최대 피크−B0 (≤150) | 잔류 최대 (≤10MB) | 드리프트 (≤5MB) | 잔존 카운터 |
|---|---|---|---|---|---|---|---|---|
| run1 | 74.7MB | 142 162 148 167 156 171 164 180 171 186 178 | 74 98 82 88 90 92 99 102 105 107 | 110 | **+111.6 통과** | +35.6 (R_end) **실패** | +22.7 **실패** | 0 통과 |
| run2 | 77.0MB | 145 166 151 166 159 172 165 186 174 186 179 | 76 102 84 90 92 97 101 125 107 110 | 114 | **+109.5 통과** | +47.7 (R8) **실패** | +25.7 **실패** | 0 통과 |

- 준비 시간은 140~298ms였고 타임아웃은 0이다. 모든 곡에서 RMS가 0.01보다 컸다(무음 곡 0).
- 매 정리 후 다음 카운터는 모두 0이었다: 이전 세대 Worker(`terminate` 호출), 미종료 AudioContext(`close()` Promise 이행, `state === 'closed'`), 열린 컨텍스트 위 Worklet 노드, Blob URL, 플레이어 DOM·`.at-surface`, 구독, 대기 요청. 라이브러리 소유 컨텍스트는 `destroy()`에서 닫혔고 재현물은 다시 닫지 않았다.
- 보조 지표: JS heap 6.25→7.4MB(+1.1MB), CDP `Nodes` 36→56(전환마다 정확히 +2), 브라우저 전체 합은 253~342MB에서 변동했다.

**진단 반복**(강제 GC, 2초 재생, 정규 시계열과 분리, `evidence/mem/diag-forced-gc-*.json`):

| 변형 | 렌더러 시작 → 10회 후 (MB) | JS heap | Nodes·리스너 | 해석 |
|---|---|---|---|---|
| 새 인스턴스(기본) | 57.2 → 188.1 | 3.6→7.4 | 34→54, 17→27 | 회당 약 13MB씩 회수되지 않음 |
| Worker 끔(`useWorkers:false`) | 54.5 → 185.7 | 동일 | 동일 | 렌더 Worker는 원인이 아님 |
| 플레이어 끔(`playerMode:Disabled`) | 54.6 → 79.7 (75~80에서 멈춤) | 3.6→7.2 | 34→54, 리스너 17 고정 | **증가의 대부분은 오디오 경로** |
| 인스턴스 재사용(`api.load()` 교체, 마지막에만 destroy) | 54 → 열린 동안 125~145 안정 → 닫은 뒤 95.6 | 7~12.8 왕복 | 닫은 뒤 36·18 | 증가가 멈춤 |

- **라이브러리 결함 후보**: 인스턴스마다 `<style id="alphaTabStyleShared">`가 head에 하나씩 쌓이고 제거되지 않는다(10회 뒤 10개). `createSharedStyleElement`가 `#alphaTabStyle` 존재 여부로 중복을 판단하는데, 폰트 style은 사용 횟수가 0이 되면 제거되기 때문에 중복 판단이 실패한다(`alphaTab.core.mjs:45740-45757`). 크기는 작지만 DOM 노드 +2/회의 원인이다. 리스너 +1/회는 플레이어를 켰을 때만 생긴다. 재현물 계측(AudioContext `statechange` 구독)일 가능성이 있어 원인을 확정하지 않았다.
- 판정: 명세가 정의한 "새 플레이어를 만드는 곡 전환"은 **데스크톱에서 잔류·드리프트 관문 실패**다. 닫힌 AudioContext·Worklet의 네이티브 메모리가 즉시 회수되지 않는 Chromium 동작으로 추정한다. 이 PC는 RAM이 넉넉해 회수 압력도 약하다. iPad·저사양 랩탑의 수치는 따로 실측해야 한다.

## 3. TB-1 · TB-2로 넘길 제약

1. CSP: §2.3 diff를 적용하고 엔진은 `html5`로 고정한다. `fontDirectory`를 고정하고 해시는 보안 테스트로 단언한다. `'unsafe-inline'`(속성 포함), `blob:`, `unsafe-eval`, `wasm-unsafe-eval`은 쓰지 않는다.
2. 플레이어 수명: `PLAYER` 화면 한 번에 `AlphaTabApi` 하나를 두고 곡 전환은 `api.load()`로 처리한다. 화면을 떠날 때만 `destroy()`한다(§0 R2로 확정). TB-2에서 이 방식으로 §5 절차(재사용 변형)를 데스크톱에서 다시 측정해 통과해야 하고, 실기기 확인은 출시 전 관문 R1이다. 곡 세대 번호로 늦은 응답을 버리는 로직과 `AbortController`는 재현물의 `open/close` 패턴을 그대로 쓴다.
3. 정리 순서: 구독 해제 → `destroy()`(컨텍스트 `close()`는 라이브러리가 담당) → 컨테이너 제거 → 요청 취소. iPad UA에서는 `_patchIosSampleRate`가 임시 AudioContext를 하나 더 만들고 닫는다(`alphaTab.core.mjs:26600-26612`). 실기기 카운터에서 이 컨텍스트를 구분해야 한다.
4. 라이선스 고지: MPL-2.0 + 소스 위치(태그 `v1.9.0`), Bravura OFL, TinySoundFont·SFZero MIT를 넣고 `♪ alphaTab.net` 크레딧은 유지한다. SF2 채택은 LIC-02 해소 뒤에 한다.
5. 포맷: 1차 지원은 `.gp`·`.xml`·`.mxl`이다(§0 R4). GP3·GP4·GP5·GPX는 권리가 확인된 파일로 PLAY-01을 통과한 뒤 업로드 허용 목록에 추가한다.

## 4. 남은 관문과 필요한 증거 (출시 전 관문 R1·R3·R4 해소 조건)

| 관문 | 필요한 것 |
|---|---|
| iPad WKWebView | Mac·Xcode, iPad 10세대급(RAM 4GB 이하), 임시 Capacitor 앱(재현물 `page/`·`fixtures/`·alphaTab `dist/`를 `/at/`에 배치, 같은 CSP meta). Safari Web Inspector Memory 타임라인 페이지 총량과 `tb.counters()`, 2회 실행, 청감 확인 |
| 저사양 랩탑 | RAM 8GB 이하, 내장그래픽, Chrome·Edge 안정판, 브라우저 작업 관리자의 탭 footprint. `tools/mem-run.mjs`는 Windows에서 그대로 실행된다 |
| LIC-02 | SONiVOX 샘플 출처가 AOSP Sonivox(Apache-2.0)임을 보여 주는 근거(alphaTab 관리자 확인 또는 원본 비교). 확보하지 못하면 다른 경량 후보를 같은 관문으로 평가 |
| PLAY-01 나머지 4종 | 권리가 확인된 `.gp3`·`.gp4`·`.gp5`·`.gpx` fixture |
| 메모리 재측정 | 인스턴스 재사용안으로 §5 절차를 데스크톱·실기기에서 다시 측정 |

## 5. 실행 명령

```bash
cd 개발산출물/자료/TB-0_재현물
npm install                                  # @coderline/alphatab@1.9.0
node tools/make-fixtures.mjs                 # A.gp, B.xml, B.mxl, broken.gp
node server.mjs 5179 &
H="sha256-EIR5s3Qp1PxPxW4Koopu9nVN+I2chNMT0ImH3VG/s+c=,sha256-ago6aunBhfAMrD80tguQXUt95n6srkO3pzX2dUHs0gs="
for p in current candidate; do for e in svg html5; do node tools/smoke.mjs $p --engine $e; done; done
node tools/smoke.mjs candidate --engine html5 --styleHash "$H"
node tools/smoke.mjs candidate --engine svg --styleHash "$H"
node tools/scenarios.mjs --policy candidate --engine html5 --styleHash "$H"
node tools/mem-run.mjs --run 1 --styleHash "$H"; node tools/mem-run.mjs --run 2 --styleHash "$H"
for m in recreate reuse noworkers noplayer; do node tools/mem-diag.mjs --mode $m --styleHash "$H"; done
```

시험 장치 결함은 고친 뒤 다시 실행했고, 이력은 이렇다.
- PLAY-02 첫 실행: alphaTab이 컨테이너에 `position: relative`를 넣어 스크롤 요소가 동작하지 않았다(클릭 y=2581). 고정 `#host`를 `scrollElement`로 바꿨다.
- CSP-03의 Blob Worker를 오류 경로에서 종료하지 않아 카운터에 1이 남았다. 고쳐서 다시 실행했다.
- Playwright `waitForFunction`이 문자열 평가 때문에 강제 CSP에 막혔다. `evaluate` 폴링으로 바꿨다.
- 위 표의 수치는 모두 수정 후 실행 결과다.
