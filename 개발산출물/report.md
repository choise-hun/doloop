# ULeveLP UI/UX 문제 사항 종합 분석 보고서

> **안내**: 본 문서는 사용자의 요청에 따라 **소스 코드 수정 없이**, 코드베이스(`file:line`) 및 첨부된 스크린샷 증거를 기반으로 7가지 UI/UX 문제의 근본 원인을 분석하고 향후 개선 방향을 정리한 분석 문서입니다.

---

## 목차
1. [연습 세션 카드 단일화 및 좌측 녹음 섹션 중복 제거](#1-연습-세션-카드-단일화-및-좌측-녹음-섹션-중복-제거)
2. [플레이어 트랜스포트 재생 버튼 스타일 부조화(Fill) 원인](#2-플레이어-트랜스포트-재생-버튼-스타일-부조화fill-원인)
3. [커뮤니티 공간의 정체성 및 스포티파이 형태 부조화 원인 분석](#3-커뮤니티-공간의-정체성-및-스포티파이-형태-부조화-원인-분석)
4. [악기연습실 악기 선택 컨트롤 형태 왜곡 및 겹침 깨짐 원인](#4-악기연습실-악기-선택-컨트롤-형태-왜곡-및-겹침-깨짐-원인)
5. [스케일 하단 컨트롤 배치 붕괴 및 정렬 기준 부재 원인](#5-스케일-하단-컨트롤-배치-붕괴-및-정렬-기준-부재-원인)
6. [현 수 · 튜닝 컨트롤의 설정(SETTING) 이관 검토](#6-현-수--튜닝-컨트롤의-설정setting-이관-검토)
7. [코드 재해석 탭의 우측 여백 방치 및 좌측 쏠림 원인 분석](#7-코드-재해석-탭의-우측-여백-방치-및-좌측-쏠림-원인-분석)

---

## 1. 연습 세션 카드 단일화 및 좌측 녹음 섹션 중복 제거

### 1.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310648053_80a72137.png`
- **현상**:
  - 화면이 좌우 2열 컬럼으로 분할되어 있음.
  - 좌측 패널에는 **'녹음'** 헤더 아래 테이크 목록(`미선택`, `11초 · 1x`, `듣기`, `구간 완료`, `삭제`)이 나열됨.
  - 우측 패널에는 **'연습 세션'** 카드 목록이 나열되어 있는데, **각 세션 카드 내부에도 동일한 테이크 정보(`11초 · 1x`, `듣기`, `구간 완료`, `삭제`)와 재생/완료/삭제 버튼이 완전히 똑같이 포함**되어 있음.
  - 유저 입장에서는 동일한 테이크를 좌측과 우측 양쪽에서 조작할 수 있어 시각적 군더더기가 심하고 조작의 주체/기준이 모호함.

### 1.2 코드 분석 (`file:line`)
- **컴포넌트**: [SongRecordPanel.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/components/songRecord/SongRecordPanel.tsx#L142-L237)
- **스타일**: [SongRecordPanel.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/components/songRecord/SongRecordPanel.module.css#L23-L35)
```tsx
// SongRecordPanel.tsx L142~237
<div className={styles.srCols}>
  {/* 좌측 패널: 테이크 목록 + A/B 비교 슬롯 선택기 */}
  <div className={`panel ${styles.panel}`}>
    <div className={`head-row ${styles.headRow}`}>
      <h3 className={`h3 ${styles.h3}`}>{t('record.tabTakes')}</h3> {/* "녹음" */}
    </div>
    <div id="srTakes" className={styles.takesList}>
      {takes.map((t) => <TakeItemRow key={t.id} take={t} ... />)}
    </div>
    <AbCompare abPair={abPair} ... />
  </div>

  {/* 우측 패널: 세션 타임라인 (내부에 이미 테이크가 카드별로 포함됨) */}
  <div className={`panel ${styles.panel}`}>
    <div className={`head-row ${styles.headRow}`}>
      <h3 className={`h3 ${styles.h3}`}>{t('record.tabSessions')}</h3> {/* "연습 세션" */}
    </div>
    <SessionTimeline ... />
  </div>
</div>
```

### 1.3 발생 원인
- 초기에 테이크를 관리하고 A/B 비교를 수행하던 레거시 "녹음 목록" UI에, 이후 "연습 세션별 타임라인 기록" 기능이 추가되면서 두 UI가 2열(`srCols`) 형태로 단순 병렬 배치됨.
- 세션 카드(`PracticeSessionCard`)가 이미 테이크 재생, 완료 판정, 삭제, 메모 기능을 자체 포함하고 있음에도 좌측의 원본 테이크 목록을 그대로 유지하여 중복이 발생함.

### 1.4 개선 방향 (제안)
1. **좌측 "녹음" 패널 전면 제거**: `.srCols`의 2열 그리드를 해제하고, 우측의 **'연습 세션 카드' 단일 1열 타임라인 피드**로 화면을 전면 개편.
2. **A/B 비교 기능 흡수**: 좌측 패널 하단에 있던 `AbCompare` 기능이 필요하다면 세션 카드 상단 툴바나 독립된 비교 모달/서랍 형태로 간결하게 통합.

---

## 2. 플레이어 트랜스포트 재생 버튼 스타일 부조화(Fill) 원인

### 2.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310689528_b7aaf9dd.png`
- **현상**:
  - 플레이어 하단 5개 버튼(`−5`, `⏮`, `▶`, `+5`, `저장`) 중, 주변 4개 버튼은 **사각형 투명 아웃라인(Ghost)** 형태인 반면, 가운데 재생 버튼(`▶`)만 **둥근 원형에 짙은 색으로 꽉 찬 솔리드 필(Fill)** 형태로 렌더링됨.
  - 하나의 트랜스포트 조작군(Control Bar) 안에서 유독 재생 버튼만 완전히 다른 디자인 언어(크기, 외곽선, 곡률, 면 채움)를 사용하여 심각한 이질감과 시각적 단절을 유발함.

### 2.2 코드 분석 (`file:line`)
- **컴포넌트**: [PracticePage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/PracticePage.tsx#L2101-L2148)
- **스타일**: [PracticePage.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/PracticePage.module.css#L482-L509)
```css
/* PracticePage.module.css L489~509 */
.ppTbtn {
  font: inherit;
  color: var(--ink);
  background: var(--bg);              /* 투명/배경색 */
  border: 1px solid var(--line);      /* 1px 아웃라인 테두리 */
  border-radius: var(--radius-card);  /* 직각/카드 곡률 (0px) */
  min-height: 52px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.ppPlayBtn {
  background: var(--ink);             /* 짙은 솔리드 채움 (Fill) */
  color: var(--surface);              /* 글자색 반전 */
  border-color: var(--ink);
  font-size: 24px;
  border-radius: var(--radius-pill);  /* 알약/원형 곡률 (9999px) */
  min-height: 60px;
  height: 60px;                       /* 혼자만 8px 더 큼 */
}
```

### 2.3 발생 원인
- 주변 버튼들(`.ppTbtn`)은 토큰 시스템의 직각 아웃라인(`--radius-card`, 투명 배경, `border: 1px solid var(--line)`)을 따르는 반면,
- 재생 버튼(`.ppPlayBtn`)은 '메인 액션 강조'를 위해 임의로 원형 필(`--radius-pill`, `background: var(--ink)`, `height: 60px`)로 단독 오버라이드됨.
- 결과적으로 동일 선상의 버튼 그룹 내에서 형태(Rectangle vs Circle), 채움(Outline vs Solid Fill), 높이(52px vs 60px)의 3중 불일치가 발생함.

### 2.4 개선 방향 (제안)
- **방안 A (아웃라인 통일 - 추천)**: 재생 버튼도 다른 버튼과 동일하게 사각 아웃라인(`background: var(--bg)`, `border-radius: var(--radius-card)`, `min-height: 52px`)으로 일원화하고, 재생 아이콘 크기나 테두리 색상(`var(--accent)` 등)으로만 활성화 상태를 표현.
- **방안 B (그룹 전체 캡슐화)**: 모바일 오디오 플레이어처럼 둥근 형태를 원할 경우 트랜스포트 5개 버튼 전체에 `--radius-pill`을 일관되게 적용하거나, 전체를 하나의 라운드 바 컨테이너로 감싸 일체감 형성.

---

## 3. 커뮤니티 공간의 정체성 및 스포티파이 형태 부조화 원인 분석

### 3.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310712424_f5e71408.png`
- **현상**:
  - 화면 상단에 거대한 대문자 `COMMUNITY` 타이틀과 `[모두]`, `[LOG]` 칩 버튼이 배치되어 있고, 우측 구석에 `84일 연습 집계 보기`, `내 공유 폴더 관리`가 작은 링크로 놓여 있음.
  - 본문에는 `아직 공개된 플레이리스트가 없어요`, `아직 공유된 연습 기록이 없어요. 첫 번째 기록을 공유해 보세요! TRAILS`라는 텍스트만 1px 테두리 박스 안에 덩그러니 놓여 있음.
  - "스포티파이 느낌"도 전혀 나지 않고, 유저들이 소통하거나 연습을 공유하는 "커뮤니티" 느낌도 전혀 없는 삭막한 어드민/인덱스 페이지 형태임.

### 3.2 코드 분석 (`file:line`)
- **페이지**: [CommunityPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/CommunityPage.tsx#L200-L272)
- **스타일**: [CommunityPage.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/CommunityPage.module.css#L1-L100)
- **컴포넌트**: [CurationRows.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/components/community/CurationRows.tsx#L140-L155), [EpisodeLogFeed.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/components/community/EpisodeLogFeed.tsx)

### 3.3 발생 원인
1. **시각적(Visual) 결함 — 미디어와 그래픽의 부재**:
   - 스포티파이의 정체성은 어두운 배경 자체가 아니라 **화려한 앨범 아트워크, 고화질 썸네일 카드, 그라디언트 블렌딩, 타이포그래피 계층**에서 나옴.
   - 현재 화면은 비주얼 미디어가 전혀 없이 칙칙한 단색 배경에 1px 회색 테두리 사각 박스(`border: 1px solid var(--line)`)와 빈 텍스트만 노출되어 공사 중인 사이트 느낌을 줌.
2. **역할(Role) 및 개념의 혼선 — 음악 스트리밍 vs 악기 연습**:
   - 스포티파이의 "공개 플레이리스트(Playlist)" 개념을 무비판적으로 차용했으나, 본 서비스 유저들의 핵심 데이터는 음원이 아니라 **"악기 연습 로그 / 연주 테이크 / 루프 반복 횟수"**임.
   - "플레이리스트가 없다"는 문구와 "새 연습 게시물"이라는 문구가 혼재되어 이 공간이 남의 음악을 듣는 곳인지, 내 연습 일지를 공유하는 곳인지 정체성이 붕괴됨.
3. **상호작용(Social Interaction) 요소 결여**:
   - 유저 간의 교류를 유도하는 핵심 요소(프로필 아바타, 응원/좋아요 리액션, 댓글, 추천 연주자, 실시간 연습 중인 유저)가 없음.
   - 내가 연습한 것을 바로 공유할 수 있는 직관적인 Primary CTA 버튼(예: `[+ 오늘 연습 공유하기]`)이 상단에 없고, 빈 텍스트 링크(`TRAILS`)만 숨겨져 있어 유저의 참여를 이끌어내지 못함.

### 3.4 개선 방향 (제안)
- **개념 재정의**: '스포티파이형 플레이리스트' 구조를 과감히 버리고, **"악기 연습자들의 성장 피드 & 쇼케이스 (Strava 또는 GitHub 잔디 + SNS 피드 형태)"**로 리브랜딩.
- **온보딩 빈 화면 개선**: 빈 박스 대신 '추천 연주 영상', '이번 주 연습왕(TOP 집계)', '예시 연습 기록'을 카드 형태로 미리 보여주어 풍성한 느낌 제공.
- **공유 CTA 전면 배치**: 헤더 우측 또는 칩 네비게이션 옆에 눈에 띄는 `[+ 내 연습 공유하기]` 액션 버튼 배치.

---

## 4. 악기연습실 악기 선택 컨트롤 형태 왜곡 및 겹침 깨짐 원인

### 4.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310809240_30cd1c7f.png`
- **현상**:
  - '악기 선택' 라벨 아래 `[기타]`, `[베이스]`, `[건반]` 3개 버튼이 배치되어 있음.
  - 버튼이 일반적인 캡슐(Pill) 모양이 아니라 **동그란 원형(Circle)** 형태로 심하게 찌그러져 렌더링됨.
  - 더 심각한 점은 **3개의 원형 테두리가 서로 가로 방향으로 겹쳐져(Overlap)** `기타`의 우측 테두리가 `베이스` 안으로 침범하고, `베이스`의 우측 테두리가 `건반` 안으로 파고들어 오륜기처럼 겹쳐 깨지는 레이아웃 결함이 발생함.

### 4.2 코드 분석 (`file:line`)
- **컴포넌트**: [ChordsPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.tsx#L1148-L1157)
- **스타일**: [ChordsPage.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.module.css#L56-L59, #L222-L241)
```css
/* ChordsPage.module.css */
.instrumentControls { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
.instrumentControls > .field { flex: 1 1 180px; }
.instrumentControls button { min-height: 44px; } /* 높이 강제 확장 */

.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  padding: 5px 14px;
  border-radius: var(--radius-pill); /* 9999px */
  cursor: pointer;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.3;
}
```

### 4.3 발생 원인
1. **정원(Circle) 왜곡 원인**:
   - `.chip`의 글자 수는 "기타", "건반"(2글자), "베이스"(3글자)로 너비가 매우 좁음.
   - 여기에 `.instrumentControls button { min-height: 44px; }` 규칙으로 인해 높이가 44px 이상으로 강제 확장되면서 가로 너비와 세로 높이가 1:1 비율에 수렴함.
   - 여기에 `border-radius: 9999px`가 결합되면서 캡슐(Pill)이 아닌 **동그란 공 모양(Circle)**으로 기형적 렌더링이 발생함.
2. **테두리 겹침(Overlap) 깨짐 원인**:
   - 부모인 `.field`에 `flex: 1 1 180px`가 적용되어 있어, 좁은 뷰포트나 인접 요소와의 충돌 시 `.field` 너비가 180px 안팎으로 축소됨.
   - 자식 버튼 `.chip`에 `flex-shrink: 0`이나 최소 가로폭 보장이 없고, `display: inline-flex; flex-direction: column;` 구조에서 텍스트와 패딩 간격 계산 시 flex 아이템 간의 간격(`gap: 6px`)이 깨지거나 음수 마진/축소 현상이 일어나면서 버튼 테두리끼리 시각적으로 겹치게 됨.

### 4.4 개선 방향 (제안)
- `.chip`에 `flex-shrink: 0`과 `min-width: 60px` 또는 고정 가로 패딩 부여.
- 3개 악기 선택 버튼은 개별 칩으로 두지 않고, 하나의 연결된 **세그먼트 컨트롤(Segmented Control)** 탭 형태로 묶어 테두리 충돌 방지.
- 높이와 좌우 패딩 비율을 조정하여(예: `height: 36px`, `padding: 0 16px`) 단정한 알약 모양 유지.

---

## 5. 스케일 하단 요소들 배치가 엉망인 원인 (거리 들쭉날쭉, 가로세로 정렬 기준 없음)

### 5.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310829811_17868504.png`
- **현상**:
  - 1행: `연습 모드`(단순 스케일/5도권), `루트 음`(C), `스케일 종류`(Pentatonic Major), `음표 라벨`(도수/음이름/없음), `손잡이`(오른손/왼손), `재생 범위`(한 옥타브/보이는 범위 전체)
  - 2행: `BPM(8분음표)` [90], `[ ] 근음만 보기 (암기)`
  - 3행: `[재생]` 버튼 및 상태 텍스트
  - **문제점**: 요소마다 간격이 불규칙하고, 어떤 것은 1줄, 어떤 것은 2줄로 꺾여 있으며, 체크박스는 엉뚱한 위치에 어정쩡하게 떠 있고, 가로세로 기준선(Baseline)이 완전히 붕괴되어 있음.

### 5.2 코드 분석 (`file:line`)
- **컴포넌트**: [ChordsPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.tsx#L1380-L1547)
- **스타일**: [ChordsPage.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.module.css#L113-L150)
```css
/* ChordsPage.module.css L113~150 */
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); /* 일률적 150px 칸 나누기 */
  gap: 12px 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: end;          /* 하단 정렬 강제 */
  padding-bottom: 6px;      /* 임의 오프셋 (매직 넘버) */
}
```

### 5.3 발생 원인
1. **일률적인 `minmax(150px, 1fr)` 분할의 치명적 결함**:
   - `C` 글자 1개 들어가는 단순 셀렉트 박스(`루트 음`)도 150px,
   - 버튼이 2~3개씩 들어가 가로 공간이 많이 필요한 복합 칩 그룹(`연습 모드`, `음표 라벨`, `재생 범위`)도 똑같이 150px에 억지로 집어넣음.
2. **공간 부족으로 인한 강제 2단 줄바꿈 및 높이 불일치**:
   - 150px이 좁아서 `[연습 모드]`는 버튼 2개가 세로 2층으로 꺾임.
   - `[음표 라벨]`은 3개 버튼 중 `[없음]`이 2층으로 꺾여 내려감.
   - `[재생 범위]`도 2층으로 꺾임.
   - 반면 `[루트 음]`, `[스케일 종류]`, `[손잡이]`는 1층을 유지함.
   - 그 결과 같은 가로 행 안에서 **1층짜리 박스와 2층짜리 박스가 지그재그로 뒤섞여 행 전체의 높이와 정렬선이 들쭉날쭉**해짐.
3. **체크박스의 임의 매직 넘버(`padding-bottom: 6px`)**:
   - 라벨이 없는 체크박스(`.check`)를 그리드 셀에 그대로 넣고 `align-self: end; padding-bottom: 6px;`로 대충 눈대중 정렬을 시도하여, 반응형 뷰포트에 따라 옆의 인풋과 기준선이 전혀 맞지 않게 됨.

### 5.4 개선 방향 (제안)
- 일괄적인 `repeat(auto-fill, minmax(150px, 1fr))` 그리드를 폐기하고, **의미 단위의 Flex 툴바 레이아웃**으로 재구성:
  - **1열 (주요 설정)**: `[스케일 종류]` + `[루트 음]` (드롭다운 그룹)
  - **2열 (표시 옵션)**: `[라벨]` + `[손잡이]` + `[재생 범위]` (세그먼트 칩 그룹 — 각자 필요한 만큼 너비 사용)
  - **3열 (재생 및 메트로놈)**: `[BPM]` + `[근음만 보기 체크박스]` + `[재생]` 버튼을 한 줄의 컨트롤 바(Playback Bar)로 결합.
- 모든 컨트롤의 라벨 높이(`font-size: 12px; height: 16px`)와 컨트롤 높이(`height: 40px`)를 표준화하여 상하 베이스라인 일치.

---

## 6. 현 수 · 튜닝 컨트롤의 설정(SETTING) 이관 검토

### 6.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310944703_393cccbe.png`
- **현상**:
  - 화면 상단에 `현 수 · 튜닝` 라벨과 함께 거대한 가로 드롭다운 `[ 기타 (6현) ⌵ ]`이 전체 폭을 차지하고 있음.

### 6.2 코드 분석 (`file:line`)
- **컴포넌트**: [ChordsPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.tsx#L1158-L1164)
```tsx
{!isKeyboard && <div className={styles.field}>
  <label htmlFor="instrument-tuning">{t('chords.instrumentTuning')}</label>
  <select id="instrument-tuning" className={styles.selectField} value={selectedTuning}
    onChange={(event) => changeTuning(event.target.value as TuningId)}>
    {availableTunings.map((tuning) => <option key={tuning.id} value={tuning.id}>{t(TUNING_NAME_KEY[tuning.id])}</option>)}
  </select>
</div>}
```

### 6.3 UX 분석 및 타당성 평가
- **사용 빈도(Usage Frequency) 관점**:
  - 기타/베이스 연주자는 통상 6현 스탠다드, 4현 베이스 등 자신의 주 악기 튜닝을 한번 설정해 두면 매일 연습할 때마다 이를 변경하지 않음 (변경 빈도 극히 낮음, 거의 1회성 설정).
  - 반면 악기 연습실 화면에서 유저가 매일 조작하는 것은 스케일 종류, 키(Root), 연습 모드, 메트로놈 BPM 등임.
- **화면 점유(Screen Real Estate) 관점**:
  - 변경 빈도가 가장 낮은 '튜닝' 옵션이 헤더 최상단(Above the fold)의 가장 눈에 띄는 명당 자리를 차지하고 있어, 모바일/태블릿에서 화면을 크게 낭비함.
- **결론**:
  - **사용자의 의견("현수, 튜닝은 자주 변경되지 않으니 설정에 넣어도 될 것 같다")은 UX적으로 매우 정확하고 타당한 지적임.**

### 6.4 개선 방향 (제안)
- **안 A (완전 이관 - 추천)**:
  - `ChordsPage` 메인 헤더에서 드롭다운을 완전히 제거하고, [SettingsPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/SettingsPage.tsx)의 환경설정 섹션으로 이관하여 전역 기본값으로 보관.
- **안 B (2차 모달/팝오버로 축소)**:
  - 연습 도중 드롭 D 튜닝 등으로 가끔 바꾸는 소수 유저를 위해, 헤더 우측 상단에 작은 `⚙️ 악기 설정` 버튼 하나만 두고 클릭 시 팝오버/모달로 튜닝을 변경할 수 있도록 2차 심도로 숨김.

---

## 7. 코드 재해석 탭의 우측 여백 방치 및 좌측 쏠림 원인 분석

### 7.1 현상 및 스크린샷 분석
- **관련 이미지**: `media_1794310984212_1cf292ae.png`
- **현상**:
  - 상단: 보이싱 다이어그램 + 코드 버튼 3개
  - 중간: `2-5-1 진행 속에 넣기` (키, BPM, 재생, 다이어그램 카드 3개)
  - 하단: `보이싱 해석 퀴즈` (다이어그램, 질문, 4개 선택지, 다음 문제 버튼)
  - **문제점**: 이 모든 유용한 콘텐츠들이 화면 가로폭의 **왼쪽 약 35~45% 영역에만 좁게 옹기종기 몰려 있고, 오른쪽 55~65% 영역 전체가 아무것도 없는 거대한 빈 암흑 공간(회색 배경)으로 방치**되어 있음.

### 7.2 코드 분석 (`file:line`)
- **컴포넌트**: [ChordsPage.tsx](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.tsx#L2237-L2360)
- **스타일**: [ChordsPage.module.css](file:///Users/seokhunchoi/code/ULevelP/frontend/src/pages/ChordsPage.module.css#L326-L350, #L441-L454)
```css
/* ChordsPage.module.css */
.boxrow {
  display: flex;
  gap: 10px;
  flex-wrap: wrap; /* 카드가 3개뿐인데 flex: 1이 없어 왼쪽부터 3개만 나란히 붙고 끝남 */
}

.cell {
  /* 고정된 작은 패딩과 최소 너비만 가짐 */
  padding: 8px 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.quiz {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr); /* 다이어그램 auto, 우측 1fr */
  gap: 16px;
  align-items: start;
}
```

### 7.3 발생 원인
1. **요소들의 고정 너비(Shrink-to-fit) 및 `flex-grow` 부재**:
   - `2-5-1 진행` 다이어그램 카드(`.cell`) 3개가 너비를 채우지 않고 내용물 크기(각 120px 안팎)만큼만 차지함 (3개 합쳐도 약 380px에 불과).
   - 부모 컨테이너는 1000px 이상으로 넓지만 자식 요소들이 `flex: 1`이나 100% 분할을 하지 않아 왼쪽 모퉁이에 다닥다닥 붙음.
2. **와이드 뷰포트용 2단 대시보드 구조의 부재**:
   - 데스크톱이나 태블릿 가로 화면에서는 공간이 매우 넓으므로:
     - 좌측: 현재 보이싱 형태 & 2-5-1 진행 시퀀서
     - 우측: 실시간 인터랙티브 보이싱 퀴즈 & 사운드 피드백
     형태의 **2컬럼(Two-column) 대시보드 레이아웃**을 적용해야 마땅함.
   - 그러나 현재 코드는 모든 요소를 1열 세로 스택(Single Column Stack)으로만 배치하도록 작성되어, 화면이 넓어질수록 우측에 텅 빈 여백만 기하급수적으로 늘어나는 좌측 쏠림 현상이 발생함.

### 7.4 개선 방향 (제안)
- **데스크톱(1024px 이상) 2열 그리드 도입**:
  - `display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px;`
  - 좌측 영역: 보이싱 다이어그램 + 2-5-1 진행 카드(카드를 1fr씩 3분할하여 시원하게 채움)
  - 우측 영역: 보이싱 해석 퀴즈 전용 카드 패널 (질문, 퀴즈 힌트, 선택지 버튼을 넉넉한 2x2 그리드로 배치)
- **모바일/좁은 화면**: 기존대로 1열 스택으로 자연스럽게 전환되도록 미디어 쿼리 구성.

---

## 종합 요약 및 향후 구현 우선순위 제안

| 번호 | 항목 | 핵심 원인 | 권장 해결 방안 |
|---|---|---|---|
| **1** | **녹음/세션 중복 제거** | 레거시 녹음 패널과 신규 세션 타임라인의 단순 2열 병렬 배치 | 좌측 "녹음" 패널 제거, 우측 세션 카드 단일 피드로 1열 통합 |
| **2** | **플레이어 재생 버튼 Fill 이질감** | 재생 버튼 혼자만 원형 필(`--radius-pill`, `background: var(--ink)`) 적용 | 다른 버튼들과 동일하게 직각 아웃라인(`--radius-card`)으로 통일 |
| **3** | **커뮤니티 정체성 부조화** | 미디어 없는 텍스트 박스, 플레이리스트와 연습 일지의 혼선, 소셜 CTA 부재 | 스트리밍 흉내를 버리고 '악기 연습자 성장 피드'로 재정의, 공유 CTA 배치 |
| **4** | **악기 설정 왜곡/겹침** | 44px 높이 강제 + 2글자 너비로 정원 왜곡, flex shrink에 의한 테두리 충돌 | 최소 너비 보장 및 일체형 세그먼트 컨트롤 탭으로 리팩토링 |
| **5** | **스케일 컨트롤 배치 붕괴** | 일률적인 150px 그리드 분할로 인한 버튼 그룹 2단 꺾임 및 높이 불일치 | 150px 강제 그리드 폐기, 의미 단위 Flex 행 및 컨트롤 높이/베이스라인 표준화 |
| **6** | **현 수 · 튜닝 위치 이관** | 변경 빈도가 극히 낮은 옵션이 헤더 최상단 명당 자리를 과도하게 점유 | `SettingsPage` 환경설정으로 이관하거나 헤더 2차 팝오버로 숨김 |
| **7** | **코드 재해석 좌측 쏠림** | 콘텐츠 크기 고정 및 2열 대시보드 부재로 우측 60% 공간 방치 | 와이드 화면에서 좌(2-5-1 진행) / 우(퀴즈) 2열 분할 레이아웃 적용 |
