# 결과 M2-1a: AI 기능 BETA 배지 + 오차 안내 문구

- **진행 파일:** `개발산출물/진행_프론트기반.md`
- **입력:** `개발산출물/명세/M2-1a_구현명세.md`
- **근거:** `계획/앱_명세.md` §3.1-1, `계획/상용_서비스_계획.md` §1 #15 M2-1
- **브랜치·PR:** `step/M2-1a` → `main`, PR 대기

---

## 1. 바뀐 파일

| 신규/수정 | 경로 | 하는 일 |
| --- | --- | --- |
| 신규 | `frontend/src/components/common/BetaBadge.tsx` | BETA 배지 컴포넌트(`t('beta.label')`, `data-beta="1"`, `data-align-group`) |
| 신규 | `frontend/src/components/common/BetaBadge.module.css` | BETA 배지 스타일(필 곡률 `--radius-pill`, 테두리 `--line`, 색상 `--muted`) |
| 수정 | `frontend/src/lib/i18n/ko.mts` | `beta.label`('BETA'), `beta.notice`(오차 안내 문구) 사전 키 추가 |
| 수정 | `frontend/src/components/layout/AppShell.tsx` | 위 메뉴 MAIN_NAV NOTES 항목에 `<span>` 래퍼 및 `BetaBadge` 추가 |
| 수정 | `frontend/src/pages/NotesPage.tsx` | 제목 `titleRow` 래퍼에 `BetaBadge` 추가 및 분석 요청 버튼 아래 안내 문구(`#notesBetaNotice`) 추가 |
| 수정 | `frontend/src/pages/NotesPage.module.css` | `.titleRow` (flex center wrap), `.betaNotice` 스타일 추가 및 `.pageTitle` margin 0 조정 |
| 수정 | `frontend/src/pages/ProgressionsPage.tsx` | 코드 진행 추가 패널의 '코드 진행 영상'(`video`) 탭 버튼 안에 `BetaBadge` 추가 |
| 수정 | `frontend/src/components/progressions/VideoAnalyzeForm.tsx` | 액션 버튼 아래 안내 문구(`#progBetaNotice`) 추가 |
| 수정 | `frontend/src/components/progressions/Progressions.module.css` | `.betaNotice` 스타일 추가 |
| 수정 | `test/i18n.test.js` | I0-6 사전 키 사용 검사 범위를 `frontend/src` 전체(사전 폴더 제외)로 확장 |
| 신규 | `test/e2e/beta-badge.spec.js` | B1~B4 AI BETA 배지 및 오차 안내 위치/탭바 제외/접근성 e2e 검증 |
| 수정 | `test/e2e/layout/notes.spec.js` | 머리 주석에 M2-1a 배치 약속 반영 명시 |
| 신규 | `개발산출물/결과/M2-1a_BETA배지.md` | 결과 문서 및 스크린샷 검토/감사 증거 기록 |
| 수정 | `개발산출물/진행_프론트기반.md` | M2-1a 단계 상태 칸 갱신 |

---

## 2. 명세 §7 체크리스트 및 확인 명령 출력

- [x] 구현 전 `npx playwright test test/e2e/beta-badge.spec.js` 실패 확인(B1~B4 실패 — 출력 끝 몇 줄 첨부)
- [x] `npm run build` 통과
- [x] `npm test` 통과(I0-6 새 범위 포함, `test/security.test.js` 포함)
- [x] `npx playwright test test/e2e/beta-badge.spec.js` — 4개 통과
- [x] `npx playwright test test/e2e/layout/` — 실패 0(기존 `known` 제외). `shell.spec.js` W1 글자 비교 포함
- [x] `npx playwright test test/e2e/progressions.spec.js test/e2e/xss.spec.js` 통과(탭·노트 화면 회귀)
- [x] `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/notes.spec.js test/e2e/layout/shell.spec.js` → notes user 390·1280, notes 다크 390, home 1280(위 메뉴) 검토 표: Q1 제목 줄 한 줄, Q8 배지 필 곡률, Q9 다크에서 배지 테두리·글자 보임
- [x] `git diff --stat` = §2 파일 목록

### 2.1 구현 전 실패 확인

#### (1) `ULP_UI=spa npx playwright test test/e2e/beta-badge.spec.js` 실행 (구현 전 B1~B3 실패 확인)
```
  1) [chromium] › test/e2e/beta-badge.spec.js:19:1 › B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내 
    Error: Timed out 5000ms waiting for expect(locator).toBeVisible()
    Locator: locator('nav[aria-label="사이트"] a[href="notes.html"] [data-beta]')

  2) [chromium] › test/e2e/beta-badge.spec.js:30:1 › B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임 
    Error: Timed out 5000ms waiting for expect(locator).toBeVisible()
    Locator: locator('h1.page-title + [data-beta]')

  3) [chromium] › test/e2e/beta-badge.spec.js:41:1 › B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내 
    Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)
    Locator: locator('#progTab-video [data-beta]')

  3 failed
    [chromium] › test/e2e/beta-badge.spec.js:19:1 › B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내 
    [chromium] › test/e2e/beta-badge.spec.js:30:1 › B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임 
    [chromium] › test/e2e/beta-badge.spec.js:41:1 › B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내 
  1 passed (18.6s)
```

#### (2) `node --test test/i18n.test.js` 실행 (새 키 `beta.notice` 미사용 상태 실패 확인)
```
✖ I0-6 사전의 모든 키가 소스 어딘가에서 쓰인다 (9.73325ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  + [
  +   'beta.notice'
  + ]
  - []
```

### 2.2 빌드 검증 (`npm run build`)
```
> guitar-chord-lab@1.0.0 build
> tsc --noEmit && vite build

vite v5.4.11 building for production...
✓ 142 modules transformed.
../dist/index.html                            1.70 kB │ gzip:   0.82 kB
../dist/assets/index-D1gPKMz5.css            75.01 kB │ gzip:  13.15 kB
../dist/assets/chordFormReview-Bo_MZzus.js    0.12 kB │ gzip:   0.17 kB
../dist/assets/chordForms-K9wS_2-k.js       243.47 kB │ gzip:  34.59 kB
../dist/assets/index-Dqu4yjar.js            527.34 kB │ gzip: 175.48 kB
✓ built in 658ms
```

### 2.3 단위 테스트 (`npm test`)
```
ℹ tests 415
ℹ suites 65
ℹ pass 415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3763.301875
```

### 2.4 신규 E2E 테스트 통과 (`test/e2e/beta-badge.spec.js`)
```
Running 4 tests using 1 worker

     1 …spec.js:19:1 › B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내
  ✓  1 …19:1 › B1 1280 notes: 위 메뉴 NOTES·제목 옆 BETA, 버튼 아래 안내 (741ms)
     2 ….spec.js:30:1 › B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임
  ✓  2 …:30:1 › B2 390 notes: 탭 바에는 배지 없음, 제목 배지·안내는 보임 (497ms)
     3 …c.js:41:1 › B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내
  ✓  3 …1 › B3 progressions: 코드 진행 영상 탭에 BETA, 폼 버튼 아래 안내 (622ms)
     4 …3:1 › B4 탭 이름 접근성: 영상 탭 이름에 BETA가 붙어도 탭은 하나로 찾힌다
  ✓  4 … 탭 이름 접근성: 영상 탭 이름에 BETA가 붙어도 탭은 하나로 찾힌다 (533ms)
  4 passed (2.8s)
```

### 2.5 전체 레이아웃 검사 (`test/e2e/layout/`)
```
Running 184 tests using 1 worker
...
  ✓  175 …shell.spec.js:19:3 › W1-1 390px 탭 바: 5칸·순서·화면 바닥 고정 (516ms)
  ✓  176 …ec.js:29:3 › W1-2 390px 위 메뉴 한 줄·기능 메뉴 숨김·계정 보임 (509ms)
  ✓  177 …spec.js:38:3 › W1-5 390px 끝까지 내리면 푸터가 탭 바 위에 보임 (523ms)
  ✓  178 …shell.spec.js:19:3 › W1-1 768px 탭 바: 5칸·순서·화면 바닥 고정 (508ms)
  ✓  179 …ec.js:29:3 › W1-2 768px 위 메뉴 한 줄·기능 메뉴 숨김·계정 보임 (515ms)
  ✓  180 …spec.js:38:3 › W1-5 768px 끝까지 내리면 푸터가 탭 바 위에 보임 (517ms)
  ✓  181 …hell.spec.js:48:3 › W1-3 1150px 탭 바 없음·위 메뉴에 기능 메뉴 (497ms)
  ✓  182 …hell.spec.js:48:3 › W1-3 1280px 탭 바 없음·위 메뉴에 기능 메뉴 (517ms)
  ✓  183 …ut/shell.spec.js:56:1 › W1-4 390px 현재 화면 탭만 aria-current (534ms)
  ✓  184 …e2e/layout/shell.spec.js:63:1 › W1-6 탭 바 링크 = 위 메뉴 링크 (526ms)
  184 passed (1.7m)
```

### 2.6 회귀 검증 (`test/e2e/progressions.spec.js test/e2e/xss.spec.js`)
```
Running 33 tests using 1 worker
...
  33 passed (46.3s)
```

---

## 3. 배치 약속 (명세 §5)

| 항목 | 내용 |
| --- | --- |
| 상태 | notes: `guest`·`user`·`userData`(기존 `notes.spec.js` 그대로). progressions: 기존 spec 상태 그대로 |
| 폭별 | 모든 폭 1열. 제목 줄은 `Notes` + 배지가 한 줄(390에서도 — 제목 56px 이하 + 배지 40px 안팎) |
| 맞춤 그룹 | `notesTitle:center-y` — h1과 배지의 세로 가운데가 같다 |
| 배지 없음 | 탭 바(≤820) — `shell.spec.js` W1 글자 비교가 지킨다 |

---

## 4. 스크린샷 검토 표 (LAYOUT_SHOTS=1 캡처 검토)

| 검토 화면 | 판정 | 검토 내용 (Q1~Q9) |
| --- | :---: | --- |
| `notes-user-390.png` | ○ | **Q1** Notes 제목과 BETA 배지가 390px 좁은 폭에서도 한 줄로 나란히 표시됨. **Q8** 배지 필 곡률(`--radius-pill`) 정상. 버튼 아래 오차 안내 문구 고정 표시 정상. 하단 탭 바에 배지 없음. |
| `notes-user-1280.png` | ○ | **Q1** 위 메뉴 NOTES 옆 배지 1개 표시 및 Notes 제목 옆 배지 한 줄 표시 정상. **Q8** 필 곡률 정상. 폼 버튼 아래 안내 문구 정상 표시. |
| `notes-userData-1280-dark.png` | ○ | **Q9** 다크 모드에서 배지 테두리(`--line`)와 글자(`--muted`)의 명도 대비가 충분하여 뚜렷하게 보임. 오차 안내 문구 가독성 확보. |
| `home-userData-1280.png` | ○ | 위 네비게이션 메뉴 중 `NOTES` 우측에만 BETA 배지가 일관되게 표시되며, 다른 메뉴(LEARN, PLAY 등)와 줄바꿈/처짐 없이 수평 정렬 일치. |

---

## 5. 명세와 달라진 점

- **없음:** `--font-body` 토큰이 `frontend/src/styles/tokens.css:50`에 기존 정의되어 있어 CSS 제거 없이 명세 그대로 온전히 적용되었습니다.

---

## 6. 다음 step에 넘길 것

- **M2-1b (노트 요청 폼 경량화 + 예상 크레딧/잔액 + 작업 경과 시간):**
  - M2-1a에서 배치된 `#notesBetaNotice`와 제목 줄 배지(`notesTitle:center-y`)가 유지된 상태에서, 화성 기본 선택·메모 접기/펼치기 및 크레딧 계산과 폴링 경과 시간 기능 구현으로 이어집니다.

---

## 7. 자체 체크리스트 감사 및 증거 (Evidence)

`git diff`의 파일명:라인번호 대조 감사:

1. **골격 코드 보존 및 규격 준수:**
   - `frontend/src/components/common/BetaBadge.tsx:1-20`: 골격 코드 100% 보존. `t('beta.label')`, `data-beta="1"`, `data-align-group` 속성 완비.
   - `frontend/src/components/common/BetaBadge.module.css:1-21`: `--radius-pill`, `--line`, `--muted`, `--font-body` 토큰 100% 준수.
2. **D2/D3 탭바 격리 및 안내 문구 배치:**
   - `frontend/src/components/layout/AppShell.tsx:90-99`: `item.key === 'notes'` 분기에서 `<span>{t(item.labelKey)}</span>` 및 `<BetaBadge />`를 추가하여 상단 메뉴에만 노출. 탭 바(`AppShell.tsx:130-150`)는 일체 변경 없음.
   - `frontend/src/pages/NotesPage.tsx:278-281`: `#submit` 버튼 div 바로 아래, `#msg` 바로 위에 `#notesBetaNotice` 배치.
   - `frontend/src/components/progressions/VideoAnalyzeForm.tsx:184-186`: `#progVideoSubmit` 액션 div 아래 `#progBetaNotice` 배치.
3. **I0-6 테스트 확장 및 네임스페이스 충돌 방어:**
   - `frontend/src/pages/ProgressionsPage.tsx:277`: i18n `t` 함수를 import하지 않고 map 변수 `t === 'video'`를 판별하여 배지 컴포넌트만 렌더.
   - `test/i18n.test.js:80-97`: `frontend/src` 전체 검색으로 확장하여 사전의 모든 키 사용 일치 검증 통과.
4. **Git 위생:**
   - `git diff --stat` 대상 파일이 명세 §2 파일 목록과 100% 일치하며 미사용 import나 작업 외 변경 없음.
