# UXR-1 구현 명세 — 연습 기록 단일화·트랜스포트 통일

> 작성: 2026-11-11 / Claude(시니어). 상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §3·§4·§8·§9(UR-01~06, UR-13), 결정 §1.1.
> 담당: **[시니어] 직접 구현 → [주니어] 4단계 전체 테스트·PR·CI.** 판정: 협업 §1.2 Q1(`#srTakes`·`sr-cols` DOM 제거), Q2(`PracticeSessionCard`/`SessionTimeline`을 TRAILS `LogPage`와 공유), Q3(A/B 오디오 지연 응답 가드) 모두 예.
> 브랜치 `step/UXR-1`, base `main`. 선행 없음(UXR-2·CMR-1과 파일 비중복, i18n 3파일만 키 단위로 겹침).

## 1. 전제 (직접 연 `file:line`, 2026-11-11 `main`=`d42e28e`)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/components/songRecord/SongRecordPanel.tsx:24` | `key={uid}:{songId}`로 재마운트 → 곡/계정 전환 시 목록·슬롯 초기화는 이미 보장 |
| P2 | 같은 파일 `:93-100` | `abPair`가 `sortAbTakes`로 녹음 시각순 재정렬 → 사용자가 고른 A/B 슬롯과 재생 순서가 어긋날 수 있음 |
| P3 | 같은 파일 `:142-213` | `.srCols` 2열 + `#srTakes` 전체 테이크 목록(세션 내부 목록과 중복) |
| P4 | 같은 파일 `:204`, `:224` | 삭제 시 `prev.filter(id≠takeId)` → **A 삭제 시 B가 A 슬롯으로 이동하는 결함** |
| P5 | 같은 파일 `:166-180` | `onSelectAbSlot` 슬롯 갱신 규칙(같은 테이크를 다른 슬롯으로 옮기면 원래 슬롯 비움). 이 규칙을 그대로 재사용 |
| P6 | `SongRecordParts.tsx:352` | `AbCompare`는 `abPair===null`이면 `hidden` |
| P7 | `SongRecordParts.tsx:417-428`, `:462-469` | `SessionTimelineProps`에 A/B 관련 prop 없음, 카드에 전달 안 함 |
| P8 | `PracticeSessionCard.tsx:15-21`, `:197-207` | 카드의 `TakeItemRow`에 `showAbCheck` 등 미전달 |
| P9 | `lib/episode.mts:216-222` | `fromSongSession`이 `take.sessionId === s.id`로만 연결 |
| P10 | `pages/LogPage.tsx:497`, `:714` | 다른 호출부. 새 prop을 넘기지 않으므로 현행 유지 대상(UR-13) |
| P11 | `PracticePage.tsx:2101-2145`, `PracticePage.module.css:482-509` | 5버튼 `#backBtn #startBtn #playBtn #fwdBtn #saveBtn`, `.ppTransport{align-items:center}`, `.ppPlayBtn` 60px·pill·반전 채움 |
| P12 | `lib/apiClient.ts:62-77` / 서버 `TakeService.kt:34-48` | `TakeDto.sessionId: string`(비null). 미연결 = 응답 `sessions` ID 집합에 없는 값 |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | 좌측 `#srTakes` 목록·`.srCols`·`record.tabTakes` 제목 제거. 본문 1열: 머리줄 → A/B 비교 영역 → 세션 타임라인 → 미연결 녹음 |
| D2 | “접기 가능”은 **선택 0개일 때 비교 영역 비노출**로 충족한다. details/토글 추가 없음 |
| D3 | 슬롯이 1개만 차 있으면 `AbCompare`는 지금처럼 숨기고(재생 잠금), 그 자리에 `#srAbHint` 안내 1줄을 표시한다. `AbCompare` props 변경 없음 |
| D4 | `abPair = [selected A, selected B]` 순서 그대로. `SongRecordPanel`에서 `sortAbTakes` import·호출 제거. `sortAbTakes` export와 정의는 유지 |
| D5 | 삭제·완료 처리는 세션 행/미연결 행 모두 부모의 같은 두 함수(`removeTake`, `replaceTake`)를 탄다. `removeTake`는 해당 ID 슬롯만 `''`로 비운다. 두 슬롯 모두 비면 `[]` |
| D6 | 슬롯 지정은 `<select class="ab-select">`(`onSelectAbSlot`) 하나만 쓴다. `onToggleAb`(체크박스식 교체 규칙)는 새 동선에서 전달하지 않는다 |
| D7 | 미연결 = `takes.filter(t => !sessionIdSet.has(t.sessionId))`, `sessionIdSet`은 **응답 전체** `sessions`로 만든다(더보기 전 숨은 세션 포함) |
| D8 | 트랜스포트: `.ppPlayBtn`에서 배경·글자색·테두리색·pill·60px 높이를 제거하고 `font-size:24px`만 남긴다. `.ppTransport`는 `align-items: stretch`. 5버튼에 `data-align-group="transport:top,bottom,height"` |

## 3. 파일 목록 (목록 밖 수정 금지)

| 파일 | 구분 | 할 일 |
| --- | --- | --- |
| `frontend/src/components/songRecord/SongRecordPanel.tsx` | 수정 | D1~D7 |
| `frontend/src/components/songRecord/SongRecordParts.tsx` | 수정 | `SessionTimelineProps` 2개 prop 추가·카드로 전달 |
| `frontend/src/components/songRecord/PracticeSessionCard.tsx` | 수정 | 2개 prop을 `TakeItemRow`에 연결 |
| `frontend/src/components/songRecord/SongRecordParts.module.css` | 수정 | `.srCols` 규칙 삭제, `.srUnlinked`·`.srAbHint` 추가(토큰만) |
| `frontend/src/pages/PracticePage.tsx` | 수정 | 5버튼에 `data-align-group`만 추가 |
| `frontend/src/pages/PracticePage.module.css` | 수정 | D8 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | §5 키 2개 추가(기존 키 삭제 금지) |
| `test/e2e/practice-record.spec.js`, `test/e2e/layout/practice.spec.js` | 수정 | §7 |

## 4. 인터페이스 (추가만, 전부 선택 prop)

```ts
// SongRecordParts.tsx — SessionTimelineProps, PracticeSessionCard.tsx — PracticeSessionCardProps 양쪽에 동일 추가
abSelection?: { a: string; b: string };                        // 빈 슬롯은 ''
onSelectAbSlot?: (takeId: string, slot: 'a' | 'b' | '') => void;
```

- 두 prop이 **모두** 있을 때만 카드의 `TakeItemRow`에 `showAbCheck`, `abSlot`(a/b/''), `abChecked`(slot≠''), `onSelectAbSlot`을 넘긴다. 하나라도 없으면 현행 그대로(LogPage 경로).
- 새 export·필수 prop·TakeDto 필드 없음.

## 5. DOM·문구

`#songRecord` 안(로그인·곡 선택 상태, `loadErr` 분기는 현행 유지):

| 순서 | 요소 | 조건 |
| --- | --- | --- |
| 1 | 기존 머리줄 `.head-row[data-align-group="sr-left:left"]` | 유지 |
| 2 | `<p id="srAbHint" class="meta" role="status">` `record.abNeedTwo` | 슬롯 정확히 1개 |
| 3 | `<AbCompare idPrefix="sr">` (`#srAbPanel`) | 기존 `hidden={!abPair}` 유지 |
| 4 | `<div class="panel">` + `h3` `record.tabSessions` + `SessionTimeline`(`idPrefix="sr"`, `initialLimit={5}`, D5 콜백, `abSelection`, `onSelectAbSlot`) | 유지 |
| 5 | `<section id="srUnlinked" class="panel" aria-labelledby="srUnlinkedTitle">` + `h3#srUnlinkedTitle` `record.unlinkedTitle` + `.takesList` 안 `TakeItemRow`(showAbCheck·abSlot·abChecked·onSelectAbSlot·onCompleted=replaceTake·onDeleted=removeTake) | 로드 완료 && 미연결 ≥1 |

| 키 | ko | en | ja |
| --- | --- | --- | --- |
| `record.abNeedTwo` | 비교하려면 녹음을 하나 더 A 또는 B로 지정하세요 | Pick one more take as A or B to compare | 比較するにはもう1つの録音をAまたはBに指定してください |
| `record.unlinkedTitle` | 세션에 연결되지 않은 녹음 | Takes not linked to a session | セッションに紐付いていない録音 |

## 6. 상태·처리 순서

| 상태 | 표시 |
| --- | --- |
| 비로그인/곡 없음 | 현행 `record.loginPrompt` 1줄(`#srTakes` 없음 → 테스트 SR1-3 기대 유지) |
| 초기 로딩(`detailData===null`) | 타임라인 `record.loading`만. `#srAbHint`·`#srUnlinked` 없음 |
| 조회 실패 | 현행 `record.loadErr`+재시도. 빈 문구 없음 |
| 세션 0·테이크 0 | 타임라인 `record.emptySessions`, 비교·미연결 없음 |
| 세션 0·미연결 ≥1 | `record.emptySessions` + `#srUnlinked` 목록(A/B 지정·재생 가능) |
| 슬롯 1개 | `#srAbHint` 표시, `#srAbPanel` hidden |
| 슬롯 2개(둘 다 현재 takes에 존재) | `#srAbPanel` 표시, 라벨 A=슬롯 A 테이크 |
| 행별 요청 중·실패 | `TakeItemRow` 현행 잠금·`rowMsg` 그대로 |

```ts
// SongRecordPanel 내부 골격 (기존 :166-180 규칙 이동)
const selectAbSlot = (takeId, next) => setAbSelected(prev => { /* :167-179 그대로 */ });
const removeTake = (takeId: string) => {
  setAbSelected(prev => {
    const a = prev[0] === takeId ? '' : (prev[0] || '');
    const b = prev[1] === takeId ? '' : (prev[1] || '');
    return a || b ? [a, b] : [];          // B는 B 자리에 남는다 (P4 결함 수정)
  });
  setDetailData(prev => prev ? { ...prev, takes: prev.takes.filter(it => it.id !== takeId) } : prev);
};
const replaceTake = (take: TakeDto) => setDetailData(prev => prev ? { ...prev, takes: prev.takes.map(it => it.id === take.id ? take : it) } : prev);
const abSelection = { a: abSelected[0] || '', b: abSelected[1] || '' };
const tA = takes.find(x => x.id === abSelection.a), tB = takes.find(x => x.id === abSelection.b);
const abPair = tA && tB ? [tA, tB] as [TakeDto, TakeDto] : null;   // D4: 재정렬 없음
const filled = (abSelection.a ? 1 : 0) + (abSelection.b ? 1 : 0);
// SessionTimeline: onTakeRemoved={(_s, id) => removeTake(id)} onTakeCompleted={replaceTake}
```

오디오 가드는 `AbCompare`의 기존 token/uid/슬롯 ID 검증(`SongRecordParts.tsx` `isSlotValid`)과 `abPair` 변경 시 `clearAudioEl`을 그대로 쓴다. 슬롯 순서를 바꾸면 `abPair` 참조가 바뀌어 기존 effect가 무효화한다 — 추가 코드 없음.

## 7. 배치 약속

| 대상 | 390/768 | 1150/1280 | 약속 |
| --- | --- | --- | --- |
| `#songRecord` | 1열 | 1열 | `sr-left:left` 유지. `sr-cols:top@1150` **삭제**(spec 헤더 주석도 갱신) |
| 트랜스포트 5버튼 | 5열 | 5열 | `transport:top,bottom,height` |
| 테이크 행 | 줄바꿈 허용 | 1줄 | 기존 `.take-row` 검사 유지 |

## 8. 테스트 표 (본문은 구현자가 작성)

| 이름 | 준비(기존 spec의 가짜 API 방식) | 기대 | 잡을 버그 |
| --- | --- | --- | --- |
| UXR1-1 단일 행 | 세션 6개(5개 표시), 연결 테이크 2·6번째 세션 테이크 1·미연결 1 | 더보기 전 `#srUnlinked .take-row` 1개(6번째 세션 테이크 없음), 더보기 후 모든 take ID가 `[data-take-id]` select 기준 정확히 1회 | 미연결 판정을 표시된 5개 세션 기준으로 함 / 중복 목록 잔존 |
| UXR1-2 교차 A/B | 세션1 테이크를 A, 미연결 테이크를 B | `#srAbPanel` 표시, `#srAbLabelA`가 세션1 테이크 날짜 | 세션 간 비교 불가 / 시각순 재정렬(D4) |
| UXR1-3 A 삭제 | 위 상태에서 A 행 삭제(DELETE 200) | B select 값 `b` 유지, `#srAbHint` 표시, `#srAbPanel` hidden | B→A 이동(P4) |
| UXR1-4 같은 테이크 이동 | A인 테이크 select를 `b`로 | A 빈칸, B=그 테이크 | 한 테이크 양 슬롯 |
| UXR1-5 실패 보존 | DELETE 500 / PATCH complete 500 | 행·슬롯 유지, 행 메시지 표시 | 실패를 성공으로 반영 |
| UXR1-6 상태 분기 | 초기 지연 응답·500·재시도·세션0+미연결만 | 로딩 중 빈 문구 없음, 500에서 재시도, 미연결만이어도 재생 버튼 동작 | 로딩/오류를 빈 성공으로 표시 |
| UXR1-7 지연 URL | A 재생 URL 응답을 붙잡고 슬롯 A 교체 | 늦은 응답 후 `#srAbAudioA`에 src 없음 | 옛 슬롯 소스 할당 |
| UXR1-8 TRAILS 보존 | `log.html` 상세 타임라인 | 카드 내 `.ab-select` 0개, 녹음/메모 동작 현행 | 선택 prop이 다른 호출부에 새어 나감 |
| UXR1-L 트랜스포트 | layout/practice 4폭, 재생 중/정지·dirty | 5버튼 top/bottom/height 일치, `#playBtn` 계산 border-radius = `--radius-card`, 배경 = `--bg` | 단독 pill/반전 잔존 |

기존 단언 갱신: `practice-record.spec.js:123,133,147,187`, `layout/practice.spec.js:90,93,271-280`의 `#srTakes` 기대를 세션 카드/`#srUnlinked` 기준으로 옮긴다. SR1-3의 “`#srTakes` 없음”은 “`#songRecord .take-row` 0개”로 의미를 유지해 바꾼다. 단언 삭제·skip 금지.

## 9. 체크리스트

- [ ] `rg -n "srTakes|srCols|sr-cols|sortAbTakes" frontend/src/components/songRecord/SongRecordPanel.tsx` → 0줄
- [ ] `rg -n "abSelection" frontend/src/pages/LogPage.tsx` → 0줄 (P10)
- [ ] `npm run build` 통과, `npm test` 통과(i18n 키 3언어 일치 포함)
- [ ] `npx playwright test test/e2e/practice-record.spec.js test/e2e/layout/practice.spec.js test/e2e/layout/log.spec.js` 통과
- [ ] UXR1-3은 수정 전 코드에서 실패(Red) → 수정 후 통과(Green) 기록
- [ ] `LAYOUT_SHOTS=1` 4폭+다크 캡처 Q1~Q9 표 → `개발산출물/결과/UXR-1.md`

## 10. 금지

- `AbCompare`·`TakeItemRow`·`sortAbTakes`의 시그니처/정의 변경, LogPage 수정.
- 날짜·영상·배속으로 미연결 테이크를 세션에 추정 연결, 가짜 세션 생성.
- `audio.src = ''`(규칙 frontend-state §3), 트랜스포트 외 pill 일괄 사각화(정렬 규격 §5-4).
- 기존 사용자 변경 `HomePage.module.css`·`report.md` 수정·커밋.
