# Frontend (React frontend/src) 필수 패턴

> 제목 옆 `PR #n`·`RECFIX-1` 같은 출처는 규칙이 생긴 리뷰를 가리킨다. `PR #n`은 **옛 저장소 번호**이며 이 저장소(`choise-hun/doloop`)의 PR 번호와 다르다.
> 코드 조각은 패턴을 보여 주는 예시다. 식별자와 시그니처는 적힌 기준 구현 파일에서 확인해 맞춘다.

## 1. 비동기 요청 레이스 컨디션 방어 (uid + seq 캡처) (PR #19, #23, #28, #39)
목록·단건 조회·미디어 URL 발급 시 이전 사용자 응답이나 늦게 도착한 응답이 화면을 덮어쓰지 않도록 한다. 백그라운드 폴링과 필터 조회의 시퀀스는 분리한다:

    // [필수 패턴] 요청 진입 시 uid 및 seq 캡처, 상태 변경(저장/로그아웃/계정전환)·언마운트 시 seq++
    // 기준 구현: frontend/src/components/community/EpisodeLogFeed.tsx 의 reqSeqRef
    const mySeq = ++reqSeqRef.current;
    const myUid = auth.getUser()?.id || null;

    const data = await fetchNotes(latestFilterRef.current);
    if (mySeq !== reqSeqRef.current || myUid !== (auth.getUser()?.id || null)) {
        return; // 무효화된 지연 응답 폐기
    }

## 2. 상위-하위 종속 상태의 렌더 타임 동기 정규화 (PR #41)
악기/현 수 등 상위 상태 변경 시 useEffect에만 의존하면 첫 렌더에서 하위 엔진이 IndexOutOfBounds로 크래시된다:

    // [필수 패턴] 렌더 타임 동기 정규화(effective*) + 이벤트 핸들러 원자적 갱신
    const effectivePair = isValidPairForInstrument(instrument, pair)
        ? pair
        : getDefaultPair(instrument);

    // 엔진 호출 시 raw state(pair)가 아닌 effectivePair 전달
    const diagram = renderEngine(instrument, effectivePair);

    function handleInstrumentChange(nextInst: Instrument) {
        setInstrument(nextInst);
        setPair(getDefaultPair(nextInst)); // 동기적 함께 갱신
    }

## 3. 오디오/미디어 요소 초기화 및 비동기 재생 방어 (PR #19, #43)
- 초기화: audioEl.src = '' 절대 금지 (문서 URL 재요청 버그 유발). 반드시 아래 패턴 사용:

    // [필수 패턴] removeAttribute + load + dataset 기록
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
    delete audioEl.dataset.takeId;

- 비동기 재생(play()): 매 await 복귀 직후 및 src 할당·play() 직전에 (1) reqToken 일치, (2) uid 일치, (3) 슬롯의 take.id 일치 3가지를 모두 검증한다.

## 4. 로그아웃 / 계정 전환 / /me 실패 시 전역 상태 완전 초기화 (PR #9, #13, #18, #22, #28, #29)
- 기준 구현은 `frontend/src/lib/auth.ts`의 `signOut()`이다. `signOut({ scope: 'local' })` 호출 **전에** 세대·시퀀스 토큰(`authGeneration`, `profileSeq`)을 올리고, 사용자별 메모리 상태(`currentMe`, `currentSession`, `lastFetchedUid`, 키 캐시 `clearKeysCache()`, 대기 중인 프로필 저장 큐)를 비운 뒤 구독자에게 알린다. 저장된 세션(`ulp:auth`)은 SDK 로그아웃이 끝난 뒤, 그 사이 다시 로그인하지 않았을 때만 지운다.
- 화면·훅이 사용자별 상태(선택한 곡·테이크·노트, 숨겨진 입력값, 인메모리 OAuth 토큰 등)를 새로 가지면, 사용자 변경을 구독해 그 상태를 비우고 자기 요청 시퀀스를 올린다. 초기화 대상을 빠뜨리지 않았는지는 사용자 A→B 전환 테스트로 확인한다.

## 5. 서버 DTO 대조 및 레이아웃 규격 (PR #29, #38, FT-3)
- 프론트에서 읽는 API 필드는 추측하지 않고 src/main/kotlin/ulevelp/ 내 DTO 정의를 grep으로 반드시 대조한다.
- 화면/배치 수정 시 data-align-group 지정 -> test/e2e/layout/<화면>.spec.js 실패 확인 -> 구현 -> LAYOUT_SHOTS=1 4개 폭(390·768·1150·1280px) 스크린샷 표 검증 순서를 지킨다.

## 6. effect 의존성에 들어가는 파생 배열·객체는 참조를 고정한다 (RECFIX-1)
- 렌더 중 만든 배열·객체 리터럴(`[a, b]`, `{...}`)을 자식 effect의 의존성이나 요청 토큰 기준으로 넘기면 부모가 다시 그려질 때마다 effect가 돌아 진행 중 요청이 버려진다. 연습 화면은 영상 재생 중 250ms·녹음 중 50ms마다 다시 그려진다.

    // [필수 패턴] 원소 참조가 바뀔 때만 새 쌍을 만든다 (hook은 조기 return 앞에 둔다)
    const pairA = takes.find((x) => x.id === slotA);
    const pairB = takes.find((x) => x.id === slotB);
    const abPair = useMemo(() => (pairA && pairB ? [pairA, pairB] : null), [pairA, pairB]);

- 회귀 테스트는 요청을 붙잡은 상태에서 부모 상태만 바꿔 재렌더한 뒤 응답을 풀고 결과가 반영되는지 단언한다(`test/e2e/practice-record.spec.js` RECFIX1-1).
