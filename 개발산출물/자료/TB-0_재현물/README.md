# TB-0 격리 재현물

제품 소스(`frontend/`, `src/`)·제품 빌드 설정·DB·API와 분리된 스파이크용 재현물이다. 결과는 [TB-0 결과](../../결과/TB-0_스파이크.md)에 정리한다.

## 구성

| 경로 | 역할 |
|---|---|
| `package.json` | `@coderline/alphatab@1.9.0`만 고정 설치(`npm install`). `node_modules/`는 git 제외 |
| `server.mjs` | 같은 출처 정적 서버(:5179)와 CSP-03용 타 출처(:5180). `?policy=current|candidate|candidate-blob|candidate-style`, `&styleHash=`, `&engine=svg|html5`. 진입 HTML에 CSP meta 주입(제품과 같은 meta 방식) |
| `page/` | 격리 페이지. `app.mjs`가 곡 세대(gen)별 AlphaTab 인스턴스·요청 취소·지연 응답 폐기·자원 카운터(Worker·AudioContext·AudioWorkletNode·Blob URL·DOM·구독)·출력 RMS 탭을 제공 |
| `tools/make-fixtures.mjs` | 자체 제작 fixture 생성(A.gp 32마디, B.xml/B.mxl 136마디·3/4·템포 90 변경, broken.gp) |
| `tools/smoke.mjs` | 정책·엔진별 CSP 1회 시나리오 → `evidence/csp/` |
| `tools/scenarios.mjs` | CSP-03, PLAY-01~04 → `evidence/play/` |
| `tools/mem-run.mjs` | §5 메모리·자원 해제(워밍업→B0→A+10회 전환→R_end) → `evidence/mem/` |

## 실행 (Windows, Edge 안정판)

```bash
cd 개발산출물/자료/TB-0_재현물
npm install
node tools/make-fixtures.mjs
node server.mjs 5179 &
H="sha256-EIR5s3Qp1PxPxW4Koopu9nVN+I2chNMT0ImH3VG/s+c=,sha256-ago6aunBhfAMrD80tguQXUt95n6srkO3pzX2dUHs0gs="
node tools/smoke.mjs current --engine html5
node tools/smoke.mjs candidate --engine html5 --styleHash "$H"
node tools/scenarios.mjs --policy candidate --engine html5 --styleHash "$H"
node tools/mem-run.mjs --run 1 --styleHash "$H"
```

Playwright는 저장소 루트 `node_modules/playwright`를 쓴다. `TB_CHANNEL=chrome`으로 Chrome 안정판을 고를 수 있다. Playwright의 `waitForFunction`은 문자열 평가를 써서 강제 CSP에 막히므로 `evaluate` 폴링을 사용한다.

## iPad(WKWebView) 실행 시 메모

Mac에서 임시 Capacitor 앱의 `webDir`에 `page/`·`fixtures/`와 alphaTab `dist/`를 `/at/` 경로로 복사하고, 진입 HTML에 같은 CSP meta를 넣는다(`%CSP%` 치환). 계측은 Safari Web Inspector의 Memory 타임라인을 쓰고, `tb.counters()`·`tb.state.timeline`을 콘솔에서 읽는다. `styleHash`는 `core.fontDirectory` 값에 따라 바뀌므로 경로를 바꾸면 `tb.styleTexts()`로 다시 계산한다.
