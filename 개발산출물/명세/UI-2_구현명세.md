# UI-2 구현명세: 플레이어 프리셋 UI + 세션/테이크 레슨카드 연동

- **작업 ID:** UI-2
- **담당:** 주니어 (구현)
- **진행 파일:** `개발산출물/진행_프론트개선.md`
- **근거:** 사용자 요구사항 (2026-11-07), `개발산출물/프론트_정렬규격.md`, `docs/rules/frontend-layout.md`, `docs/rules/frontend-state.md`
- **완료 기준:** `npm --prefix frontend run build` 통과 및 `npx playwright test test/e2e/layout/practice.spec.js test/e2e/layout/notes.spec.js` 100% 통과

---

## 0. Pre-flight 5대 관문 점검

| 관문 | 점검 항목 | 결과 및 증거 (`file:line`) |
| :--- | :--- | :--- |
| ① 격리·호환 | API 오류 및 앱 격리 경계 | 백엔드 V9 B-1에서 구현된 `/api/v1/songs/{id}/presets` 및 `/api/v1/takes/{id}/complete` 연동. 모든 조회는 `app_id = 'ulevelp'` 및 Bearer 인증 격리 유지. |
| ② 동시성 | 비동기 레이스 및 클린업 | `reqSeqRef`, `abReqSeqRef`를 통한 최신 토큰 검증, 낙관적 업데이트 실패 시 롤백(`docs/rules/frontend-state.md` §1), 컴포넌트 언마운트 시 오디오 및 타이머 정리. |
| ③ 전제 실재성 | 대상 소스 라인 직접 확인 | `PracticePage.tsx:18`(`LEADS`), `PracticePage.tsx:1456`(`div#bar`), `PracticePage.tsx:1626`(`div#leads`), `SongRecordParts.tsx:132`(`TakeItemRow`), `SongRecordParts.tsx:363`(`SessionTimeline`), `NotesPage.tsx:608`(`.noteCard`), `apiClient.ts:59`(`SongDetailResponse`), `tokens.css:8`(`--bg: #F0EEEA`, `--line: #cfcec4`). |
| ④ 작업 줄 충돌 | 활성 PR 및 파일 겹침 | 시니어 Step B-1 (PR #129) 백엔드 완료. 주니어 진행 파일 `진행_프론트개선.md` 외 타 줄과 파일 충돌 없음. |
| ⑤ 메뉴얼 게이트 | DB/API/시그니처 변경 여부 | 신규 DB 마이그레이션 없음(Flyway V9 스키마 사용). 백엔드 API 시그니처 변경 없이 B-1 확정 엔드포인트에 1:1 클라이언트 연동. |

---

## 1. 설계 결정 (D표)

| ID | 결정 사항 | 상세 내용 및 이유 |
| :--- | :--- | :--- |
| **D1** | **`#leads` 제거 및 음수 대기 타이머(`-10s`)** | 기존 `LEADS`(`[0, 1, 2]`) 및 `#leads` 컨테이너 완전 제거. 루프 행에 `-10s` 대기 타이머 토글 버튼(`id="btnWaitTimer"`) 추가. 활성화 시 루프/시작 전 10초 대기 카운트다운 후 재생. |
| **D2** | **사용자 정의 프리셋 UI 및 병합 확인 팝업** | 플레이어 제어 영역에 프리셋 칩/드롭다운 및 `[+ 프리셋 저장]`(`id="btnSavePreset"`) 추가. 프리셋 이름 입력 시 기존 명칭이 존재하면 `window.confirm`으로 누적 병합(`merge: true`) 확인 후 `PUT /api/v1/songs/{id}/presets` 호출. |
| **D3** | **`#bar` 마우스 드래그 핸들러 지원** | `#bar` 내부 진행 바에 A/B 루프 핸들(`data-handle="a"`, `data-handle="b"`)을 마우스로 드래그하여 A/B 타임스탬프를 실시간 조정 가능하도록 구현. |
| **D4** | **세션 카드 커버리지 빗금/단색 및 아코디언** | `SessionTimeline`에서 `s.memo` 및 루프 수(`s.loops`) 제거. 영상 길이(`durationSec`) 대비 `coveragePct`를 빗금(진행 중)/단색(완료) 게이지로 렌더링. `[상세 보기 ▾]` 버튼으로 `part_stats` 파트 목록 아코디언 토글. |
| **D5** | **테이크 카드 AB 드롭다운 및 [구간 완료] 토글** | `TakeItemRow`에서 불필요한 초 표기(0:32) 제거. 단순 체크박스를 `<select class="ab-select">`(미선택/A/B)로 대체. 삭제 버튼을 `[✕ 삭제]`로 통일. `[구간 완료]` 버튼 추가 및 `PATCH /api/v1/takes/{id}/complete` 연동. |
| **D6** | **`NotesPage` 레슨 카드 시안 이식** | `.noteCard` 마크업 및 스타일을 `lesson-cards.html` 시안 구조(제목, 채널·난이도·태그 메타, 설명문, `▶ 연습하기 →` 및 `상세 보기` 텍스트 링크)로 개편. `tokens.css` 시맨틱 토큰 100% 준수. |

---

## 2. 변경 대상 파일 목록

| 파일 경로 | 작업 구분 | 변경 내용 한 줄 요약 |
| :--- | :---: | :--- |
| `frontend/src/lib/apiClient.ts` | 수정 | `SongPresetDto` 타입 추가, `SongDto`/`TakeDto`/`SongSessionDto` V9 확장, 프리셋 CRUD 및 `takes.complete` 메서드 추가 |
| `frontend/src/lib/i18n/ko.mts` | 수정 | 프리셋 저장/병합, 음수 대기 타이머, 테이크 완료 토글, 아코디언 관련 신규 다국어 키 추가 |
| `frontend/src/lib/i18n/en.mts` | 수정 | UI-2 신규 다국어 영문 키 동기화 |
| `frontend/src/lib/i18n/ja.mts` | 수정 | UI-2 신규 다국어 일문 키 동기화 |
| `frontend/src/pages/PracticePage.tsx` | 수정 | `#leads` 제거, `-10s` 대기 타이머, 프리셋 저장/병합 팝업, `#bar` 마우스 드래그 핸들 연결 |
| `frontend/src/pages/PracticePage.module.css` | 수정 | 프리셋 바, 대기 타이머 토글 버튼, 드래그 핸들 스타일 추가 |
| `frontend/src/components/songRecord/SongRecordParts.tsx` | 수정 | `SessionTimeline` 빗금/단색 커버리지 및 아코디언, `TakeItemRow` AB 드롭다운, 삭제 버튼, `[구간 완료]` 토글 구현 |
| `frontend/src/components/songRecord/SongRecordParts.module.css` | 수정 | 세션 빗금/단색 커버리지 바, 파트 상세 아코디언, 테이크 AB 셀렉트 및 완료 토글 버튼 스타일 추가 |
| `frontend/src/pages/NotesPage.tsx` | 수정 | `.noteCard` 마크업을 `lesson-cards.html` 시안 구조(액션 텍스트 링크 포함)로 개편 |
| `frontend/src/pages/NotesPage.module.css` | 수정 | `lesson-cards.html` 스타일 변수를 `tokens.css` 시맨틱 토큰으로 매핑하여 스타일 이식 |
| `test/e2e/layout/practice.spec.js` | 수정 | `#leads` 제거 검증, 프리셋 UI, AB 드롭다운, 구간 완료 버튼, 아코디언 단언 동기화 |
| `test/e2e/layout/notes.spec.js` | 수정 | 개편된 `.noteCard` 텍스트 링크 및 레이아웃 검증 단언 동기화 |

---

## 3. i18n 사전 신규 키 전수 열거 표

| 키 (`I18nKey`) | ko (한국어) | en (영어) | ja (일본어) |
| :--- | :--- | :--- | :--- |
| `practice.waitTimer` | `-10s 대기` | `-10s Wait` | `-10s 待機` |
| `practice.presetSave` | `구간 프리셋 저장` | `Save Preset` | `プリセット保存` |
| `practice.presetSelect` | `프리셋 선택` | `Select Preset` | `プリセット選択` |
| `practice.presetPrompt` | `프리셋 이름을 입력하세요` | `Enter preset name` | `プリセット名を入力してください` |
| `practice.presetMergeConfirm` | `이미 존재하는 프리셋입니다. 기존 구간과 병합(누적)하시겠습니까?` | `Preset already exists. Merge with existing range?` | `既存のプリセットが存在します。既存の区間と統合(累積)しますか？` |
| `practice.presetDeleteConfirm` | `이 프리셋을 삭제하시겠습니까?` | `Delete this preset?` | `このプリセットを削除しますか？` |
| `record.btnComplete` | `구간 완료` | `Complete Part` | `区間完了` |
| `record.btnCompleted` | `✓ 구간 완료` | `✓ Part Completed` | `✓ 区間完了` |
| `record.btnDetailAccordion` | `상세 보기` | `Details` | `詳細を見る` |
| `record.btnDeleteShort` | `✕ 삭제` | `✕ Delete` | `✕ 削除` |
| `record.abSelectNone` | `미선택` | `No AB` | `AB 未選択` |
| `record.abSelectA` | `A 슬롯` | `Slot A` | `スロット A` |
| `record.abSelectB` | `B 슬롯` | `Slot B` | `スロット B` |

---

## 4. 핵심 동시성 및 비동기 제어 흐름 의사코드

### 4-1. 프리셋 저장 및 중복 병합 확인 흐름 (`PracticePage.tsx`)
```typescript
const handleSavePreset = async () => {
  if (!song || pointA == null || pointB == null) return;
  const name = window.prompt(t('practice.presetPrompt'))?.trim();
  if (!name) return;
  const existing = presets.find((p) => p.name === name);
  let merge = true;
  if (existing) {
    const ok = window.confirm(t('practice.presetMergeConfirm'));
    if (!ok) return;
    merge = true;
  }
  const token = ++presetReqSeqRef.current;
  try {
    const res = await apiClient.songs.putPreset(song.id, {
      name, a: pointA, b: pointB, rate, merge,
    });
    if (token !== presetReqSeqRef.current) return;
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.name === name);
      return idx >= 0 ? [...prev.slice(0, idx), res.preset, ...prev.slice(idx + 1)] : [...prev, res.preset];
    });
  } catch (err: any) {
    if (token === presetReqSeqRef.current) window.alert(err.message || 'Error');
  }
};
```

### 4-2. 테이크 구간 완료 토글 흐름 (`SongRecordParts.tsx`)
```typescript
const handleToggleComplete = async (take: TakeDto) => {
  const nextVal = !take.completed;
  const token = ++takeReqSeqRef.current;
  // 1. 낙관적 UI 갱신 (docs/rules/frontend-state.md §1)
  setTakes((prev) => prev.map((t) => (t.id === take.id ? { ...t, completed: nextVal } : t)));
  try {
    const res = await apiClient.takes.toggleComplete(take.id, nextVal);
    if (token !== takeReqSeqRef.current) return;
    setTakes((prev) => prev.map((t) => (t.id === take.id ? res.take : t)));
  } catch (err: any) {
    if (token !== takeReqSeqRef.current) return;
    // 실패 시 원래 상태로 롤백
    setTakes((prev) => prev.map((t) => (t.id === take.id ? { ...t, completed: !nextVal } : t)));
    window.alert(err.message || 'Error');
  }
};
```

---

## 5. CSS 및 DOM 배치 약속 표

| 선택자 / 요소 | 부모 컨테이너 | CSS 클래스 / 속성 | DOM 구조 및 상태 명세 |
| :--- | :--- | :--- | :--- |
| `#btnWaitTimer` | `div.ppLoopRow` | `pp-toggle`, `border-radius: var(--radius-pill)` | 음수 대기 타이머 토글 버튼 (`-10s 대기`, 활성 시 `aria-pressed="true"`) |
| `#presetSection` | `section.ppCtl` | `display: flex; gap: 8px; align-items: center;` | 구간 프리셋 선택 드롭다운, `[+ 구간 프리셋 저장]` 버튼 컨테이너 |
| `#barHandleA`, `#barHandleB` | `div#bar` | `position: absolute; width: 12px; height: 24px; cursor: ew-resize;` | A/B 지점 드래그 마우스 조절 핸들 |
| `.tlCoverageBar` | `div.tlRow` | `height: 8px; border-radius: var(--radius-card);` | `song.durationSec` 대비 `coveragePct` 빗금/단색 게이지 바 |
| `.btnAccordion` | `div.tlRow` | `ghost mini`, `border-radius: var(--radius-pill)` | `[상세 보기 ▾]` 버튼, 클릭 시 `div.tlPartStats` 아코디언 토글 |
| `.ab-select` | `div.takeRow` | `height: 28px; border-radius: var(--radius-card);` | `<select>` 엘리먼트 (옵션: 미선택, A 슬롯, B 슬롯) |
| `.btnComplete` | `div.takeRow` | `ghost mini`, 완료 시 `background: var(--accent); color: var(--accent-ink);` | `[구간 완료]` / `[✓ 구간 완료]` 토글 버튼 |
| `.btnDelete` | `div.takeRow` | `ghost mini`, `color: var(--bad);` | `[✕ 삭제]` 텍스트 및 아이콘 단일화 |
| `.noteCard` | `div#notesList` | `display: grid; grid-template-columns: 1fr auto; gap: 10px 24px;` | `lesson-cards.html` 시안 구조 (단색 테두리, 직각 사각) |
| `.noteActions` | `div.noteCard` | `display: flex; gap: 28px; align-items: center; margin-top: 8px;` | `▶ 연습하기 →` 주 링크 및 `상세 보기` 보조 링크 |

---

## 6. 검증 테스트 표

| 테스트 항목 | 대상 파일 | 검증 내용 및 잡아야 할 버그 | 가드 위치 ↔ 단언 위치 |
| :--- | :--- | :--- | :--- |
| **T1: #leads 제거 및 대기 타이머 검증** | `practice.spec.js` | `#leads` DOM이 완전히 제거되고 `#btnWaitTimer`가 정상 렌더링되는지 검증 | `PracticePage.tsx:1626` 제거 ↔ `practice.spec.js` (`expect(page.locator('#leads')).toHaveCount(0)`) |
| **T2: 프리셋 저장 및 병합 팝업 검증** | `practice.spec.js` | 기존 프리셋 명칭 입력 시 `confirm` 다이얼로그 호출 및 `PUT` 요청 payload `merge: true` 검증 | `PracticePage.tsx` handleSavePreset ↔ `practice.spec.js` (dialog 이벤트 감지) |
| **T3: 세션 진행바 빗금/단색 및 아코디언 검증** | `practice.spec.js` | 세션 행에 메모/루프가 없고 `coveragePct` 바 및 `[상세 보기 ▾]` 클릭 시 파트 목록 노출 검증 | `SongRecordParts.tsx` SessionTimeline ↔ `practice.spec.js` (`.tlMemo` 부재 및 파트 목록 단언) |
| **T4: 테이크 AB 드롭다운 및 구간 완료 검증** | `practice.spec.js` | `.ab-select`로 슬롯 매핑 검증 및 `[구간 완료]` 클릭 시 `PATCH` 호출 및 `[✓ 구간 완료]` 상태 변경 검증 | `SongRecordParts.tsx` TakeItemRow ↔ `practice.spec.js` (`.btnComplete` 텍스트 단언) |
| **T5: NotesPage 레슨 카드 시안 이식 검증** | `notes.spec.js` | `.noteCard`가 `lesson-cards.html` 구조로 렌더링되고 액션 링크(`연습하기 →`, `상세 보기`)가 정상 동작하는지 검증 | `NotesPage.tsx:608` ↔ `notes.spec.js` (`.noteActions a` 텍스트 단언) |

---

## 7. 구현 체크리스트

- [ ] `frontend/src/lib/apiClient.ts`에 `SongPresetDto` 타입 추가 및 `apiClient.songs`, `apiClient.takes` 메서드 구현
- [ ] `frontend/src/lib/i18n/{ko,en,ja}.mts` 사전 신규 키 전수 동기화
- [ ] `PracticePage.tsx`: `#leads` 제거, 음수 대기 타이머(`-10s`), 프리셋 저장/병합 팝업, `#bar` 드래그 핸들 연결
- [ ] `PracticePage.module.css`: 프리셋 바, 대기 타이머, 드래그 핸들 스타일 적용
- [ ] `SongRecordParts.tsx`: `SessionTimeline` 빗금/단색 커버리지 바 및 아코디언, `TakeItemRow` AB 드롭다운, 삭제 버튼, `[구간 완료]` 토글 구현
- [ ] `SongRecordParts.module.css`: 세션 커버리지 게이지, 아코디언 상세 목록, 테이크 AB 셀렉트 및 완료 토글 버튼 스타일 적용
- [ ] `NotesPage.tsx`: `.noteCard` 마크업을 `lesson-cards.html` 시안 구조로 개편
- [ ] `NotesPage.module.css`: `lesson-cards.html` 스타일 변수를 `tokens.css` 시맨틱 토큰으로 매핑하여 적용
- [ ] `test/e2e/layout/practice.spec.js`, `test/e2e/layout/notes.spec.js` 단언 동기화 및 100% 통과 확인

---

## 8. 금지 사항

1. 소스 코드 및 테스트 파일 임의 조작 금지 (명세 및 체크리스트 기준 엄격 준수)
2. 표의 항목을 `...`나 `위와 동일`로 압축·생략 금지 (100% 전수 열거)
3. `tokens.css`에 정의되지 않은 임의의 색상 값(순백 `#FFFFFF` 포함) 및 인라인 스타일(`style=`) 사용 금지
4. 컨트롤에 3~16px의 중간 곡률 사용 금지 (컨트롤 9999px 필, 카드 0px 직각 준수)
