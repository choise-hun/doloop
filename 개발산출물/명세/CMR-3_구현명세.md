# CMR-3 구현 명세 — 단일 표지·빠른 추가(+/꾹 누르기/하단 시트)·상세 화면·부분 선택·`createSong` a/b·dev `?mock=1`

> 작성: 2026-11-11 / Claude(시니어). 상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §5.1·§5.2·§5.3·§5.8·§5.9·§8·§9(UR-08 표지, UR-13, UR-14), 결정 §1.1(RV-4·RV-5·RV-11). 선행 결과: [CMR-1 결과](../결과/CMR-1.md).
> 담당: **[시니어] 직접 구현 → [주니어] 4단계 전체 테스트·PR·CI.** 판정(협업 §1.2): Q1 공용 카드 DOM 구조 변경(버튼 안 버튼 금지로 래퍼 도입) 예, Q2 `CoverArt`·`FolderCard`·`FolderSheet`가 홈과 공유(RV-5) 예, Q3 순차 추가·계정 전환·포인터 타이머 예 → 시니어.
> 브랜치 `step/CMR-3`, base `main`. 선행: CMR-1 머지(충족, `e28421d`). CMR-2와 병렬 가능 — 겹치는 코드 파일은 `CurationRows.tsx`(CMR-2는 빈 상태 블록, CMR-3은 카드 prop·시트 호스팅·mock)와 i18n(다른 키)뿐, 나중 PR이 main을 반영한다. **서버·API·DTO·DB 변경 없음(RV-4).**

## 1. 전제 (`main`=`e28421d`, 구현 전 재확인)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/components/community/CommunityParts.tsx:20-35` | `CoverArt({coverVideoIds})`: `coverIds` 결과 4장이면 `.coverMosaic`, 1장이면 `img.coverImg`, 0장이면 `div.coverEmpty` |
| P2 | `frontend/src/lib/community.mts:54-64` | `coverIds(ids)`: 문자열만, ≥4면 앞 4개, 1~3이면 앞 1개, 0이면 `[]`. 테스트 `test/m223_community.test.js:53-68` CM-U3 |
| P3 | `CommunityParts.tsx:42-92` | `FolderCard` = `<button class=folderCard data-folder-id data-align-group="discoverCards:top,height" onClick=onOpen(id)>` 표지·제목띠·메타 |
| P4 | `CommunityParts.tsx:98-142` | `SongCard` = `<a class=songCard href=itemPracticeHref(item) data-video-id data-align-group="discoverCards:top,height">`, 표지는 항상 `thumb(videoId)` |
| P5 | `CommunityParts.tsx:153-202` | `FolderRow`가 `cardScroller`/`cardGrid` 안에 카드 렌더, 최대 20개 |
| P6 | `Community.module.css:115-130` | `.folderCard,.songCard{flex:0 0 176px;width:176px;scroll-snap-align:start;…}`, `.cardGrid` 안에서는 `flex:initial;width:100%`(`:133-137`) |
| P7 | `Community.module.css:140-176` | `.cardCoverWrap`(1:1, `position:relative`), `.coverImg`, `.coverMosaic(+img)`, `.coverEmpty{background:var(--surface2)}` |
| P8 | `components/community/FolderSheet.tsx:16-27`, `:29-345` | props `folderId,me,onClose,onPatchFolder?`. key=[uid,folderId] 세션. 좋아요(낙관+되돌림)·팔로우·복제(`limits.communityWrite` 없으면 `community.err.upgrade`, 요청 0)·신고. 자기 폴더면 액션 줄 전체 숨김. 곡 행 = 썸네일·제목·아티스트·구간·노트 + `a.practiceLink`(`folder.practice`). **ESC·포커스 이동/복귀 없음** |
| P9 | `FolderSheet.tsx` 셀렉터(테스트 의존) | `#folderSheet`, `#folderSheetTitle`, `#folderSheetMeta`, `#folderSheetErr`, `#folderLike`(role=switch, aria-checked), `#folderClone`, `#folderFollow`, `#folderReportBtn`, `#folderReportReason`, `#folderReportDetail`, `#folderReportSubmit`, `#folderSheetAlert`, `#folderSheetOk`, `#folderClose` — `test/e2e/community.spec.js:65-163,469-478`, `test/e2e/av2-community.spec.js:13-160` |
| P10 | `components/community/CurationRows.tsx:83-128`, `:130-176` | home·community 두 변형 모두 `FolderSheet` 호스팅, `onOpenFolder=setActiveFolderId`. home 분기는 **변경 금지**(UR-13) |
| P11 | `frontend/src/lib/apiClient.ts:661-674` | `createSong({videoId,title?,artist?,rate?})` — body에서 `a`·`b` 누락. export 경로 `apiClient.songs.create`(`:1738`) |
| P12 | `src/main/kotlin/ulevelp/routes/SongRoutes.kt:46-76` | POST `/api/v1/songs`: `rate` 0.25~2.0 범위 밖이면 무시(1.00), `a`·`b` 0~86400 선택, **둘 다 있고 a≥b면 400 `INVALID_INPUT`**, 기존 곡이면 200(입력 a/b 무시), 새 곡 201, 본문 `{song}` |
| P13 | `src/main/kotlin/ulevelp/service/SongService.kt:273-300`, `TierService.kt:174-185` | 기존 곡은 한도 검사 전 반환(멱등). 새 곡은 한도 초과 시 403 `SONG_LIMIT_EXCEEDED`(detail `limitDetail`) |
| P14 | `lib/community.mts:171-215` | `communityErrorKey`에 `SONG_LIMIT_EXCEEDED` 분기 없음 → 지금은 `community.err.generic` |
| P15 | `src/main/kotlin/ulevelp/service/CommunityService.kt:96-107` | `PublicFolderItemDto`에 길이(duration) 필드 없음. `PublicFolderDto.coverVideoId`(`apiClient.ts:445`)는 있음 |
| P16 | 저장소 전체 | 폴더 딥링크 경로 없음(`git grep "#folder="` 0). `navigator.clipboard` 사용례 `pages/NoteDetailPage.tsx:85-86`, 테스트 `test/e2e/note-actions.spec.js:93-140` |
| P17 | `vite.config.ts:6-10`, `frontend/src/vite-env.d.ts:1` | Vite 5, `vite/client` 타입 → `import.meta.env.DEV` 사용 가능(현재 사용처 0). E2E는 `dist` 빌드 서버라 DEV 코드가 실행되지 않는다 |
| P18 | `test/e2e/chords_caged.spec.js:57-76` | 시간 의존 테스트는 `page.clock.install()`·`runFor()` 사용(`waitForTimeout` 금지, testing-security.md) |
| P19 | `components/community/EpisodeLogFeed.tsx:58-89` | `fetchFirstPage(scope)`가 uid+seq 가드로 `community.episodeLogs` 첫 페이지 조회 |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | **단일 표지(RV-5)**: `CoverArt({ coverVideoId?, coverVideoIds?, label? })`. 표지 ID = `coverVideoId`(trim 후 비어 있지 않을 때) → 없으면 `coverIds(coverVideoIds)[0]` → 없으면 빈 표지. 모자이크 분기·`.coverMosaic` CSS 삭제. 홈 발견 줄·`FolderSheet`에도 그대로 적용 |
| D2 | `coverIds` export·동작·테스트는 **유지**(export 이름 계약). 주석만 “표지는 첫 1개만 쓴다”로 고친다 |
| D3 | 빈 표지 = `div.coverEmpty`(배경 `var(--ink)`) 안에 `span.coverLabel`(글자 `var(--bg)`, 제목 최대 3줄 말줄임, `aria-hidden`). 제목띠(`.cardTitleBand`)와 같은 반전 토큰이라 다크에서도 대비 유지. `label` 미전달이면 글자 없음 |
| D4 | 카드 래퍼: 버튼/링크 안에 버튼을 둘 수 없으므로 `quickAdd`가 있을 때만 `div.cardShell`(position:relative)로 감싸고 형제로 `button.quickAddBtn`을 둔다. **기존 카드 요소의 태그·class·`data-folder-id`/`data-video-id`·`data-align-group`·href·onClick은 그대로.** 크기 규칙(P6: `flex:0 0 176px; width:176px; scroll-snap-align:start`)은 `.cardShell`로 옮기고 셸 안 카드는 `width:100%;flex:initial`. 펼친 격자(`.cardGrid`, P6 `:133-137`)에서는 `.cardGrid .cardShell{flex:initial;width:100%}`도 함께 둔다. `quickAdd` 미전달(홈)이면 래퍼 없이 현행 DOM |
| D5 | `FolderCardProps`·`SongCardProps`·`FolderRowProps`에 선택 prop `onQuickAdd?: (target: QuickAddTarget) => void` 추가. FolderRow는 카드에 그대로 전달. **community 변형만 전달**, home 미전달 |
| D6 | `+` 버튼: `button.quickAddBtn[data-quick-add]`, `aria-label=t('folder.quickAddAria',{title})`, 표지 우상단(카드 안쪽 8px), 44×44. 노출 = `@media (hover:hover)`에서 `.cardShell:hover`·`:focus-within`일 때 `opacity:1`(기본 0, 포커스 가능 유지) / `@media (hover:none)`에서 `display:none`. 클릭 → `onQuickAdd(target)`(카드 본체 onClick 실행 0) |
| D7 | 꾹 누르기(`useLongPress`, §3): 카드 본체에 연결. `pointerType`이 `touch`·`pen`일 때만, 500ms 유지 시 발동. 시작점에서 10px 넘게 이동·`pointerup`·`pointercancel`·`pointerleave`면 취소. 발동 직후 오는 `click` 1회는 `preventDefault`+`stopPropagation`(본체 이동/상세 열기 0). 발동 여부와 관계없이 touch/pen의 `contextmenu`는 `preventDefault`. CSS `.cardShell`에 hover:none일 때 `-webkit-touch-callout:none; user-select:none` |
| D8 | `+`와 꾹 누르기는 **같은 하단 시트**(`QuickAddSheet`)를 연다(경로 하나·테스트 한 벌). 폴더 통째 담기는 곡 수가 많아 확인 단계가 필요하다 |
| D9 | 하단 시트 내용: 폴더 → `#quickAddClone`(`folder.clone`, 주 버튼) · `#quickAddOpen`(`folder.openDetail`, 상세 열기) · `#quickAddCancel`. 곡 → `#quickAddSong`(`folder.addSong`, 주 버튼) · `a#quickAddPractice`(`folder.practice`, `itemPracticeHref`) · `#quickAddCancel`. 결과는 `#quickAddStatus`(role=status) / `#quickAddAlert`(role=alert) |
| D10 | 폴더 담기 = `FolderSheet.handleClone`과 같은 규칙(`limits.communityWrite` 없으면 요청 0 + `community.err.upgrade`, 성공 시 `folder.cloneDone` + `onPatchFolder(id,{cloneCount:+1})`, 실패는 `communityErrorKey`). 시트 안 중복 클릭 잠금 |
| D11 | **곡 추가(RV-4)** = `apiClient.songs.create(songAddInput(item))` 1회. 성공(200/201 구분 없음) → `folder.inLibrary`(“내 곡 리스트에 있어요”). 실패 → `songAddErrorKey(e)`(§3): 403 `SONG_LIMIT_EXCEEDED` → `folder.err.songLimit`, 그 외 `communityErrorKey(e)`. 임시 폴더 clone 금지. 카테고리 지정 없음 |
| D12 | `songAddInput(item)` 정규화: `videoId`, `title=item.title??undefined`, `artist=item.artist??undefined`, `rate`는 0.25~2.0 유한수일 때만, `a`·`b`는 각각 0~86400 유한수일 때만, **둘 다 있고 a≥b면 둘 다 뺀다**(서버 400 회피, P12) |
| D13 | `createSong` 입력 타입에 `a?: number; b?: number` 추가, body에 `a: input?.a, b: input?.b` 추가(undefined는 JSON에서 빠짐). 반환·export 이름·다른 호출부 동작 동일 |
| D14 | **상세 화면** = `FolderSheet`를 고쳐 만든다(홈·커뮤니티 공용, 새 화면/라우트 없음). 순서: 히어로(대형 표지·제목·공개 이름·설명·메타) → 컨트롤 바 → 곡 목록. P9 셀렉터 전부 유지 |
| D15 | 메타는 기존 `folder.meta`(곡 수·좋아요·담김) 유지. 상위 §5.3의 “총 길이”·곡 목록 “길이” 열은 **DTO에 길이가 없어 표시하지 않는다**(P15, 가짜 값 금지, 서버 변경 없음). 목록 열 = `#` / 썸네일+제목+아티스트 / 구간(`segText`) |
| D16 | 컨트롤 바 `div#folderSheetControls[role=toolbar][aria-label=t('folder.controlsAria')]` 순서: `#folderClone`(주 버튼 = “추가”, 문구 `folder.clone` 유지) · `#folderSelectMode` · `#folderShare` · `#folderLike` · `#folderFollow`(조건 현행) · `#folderReportBtn`(조건 현행). 자기 폴더면 `#folderShare`만. 재생·셔플·다운로드 없음 |
| D17 | **부분 선택**: `#folderSelectMode`(`aria-pressed`, 문구 `folder.selectMode`/`folder.selectCancel`) 켜면 각 행 앞에 `input[type=checkbox][data-select-video=<videoId>][data-select-pos=<position>]`(label = 곡 제목), 바에 `#folderAddSelected`(`folder.addSelected` `{n}`) 표시. 0개거나 실행 중이면 disabled. 끄면 선택·행 상태 초기화 |
| D18 | 선택 곡 추가: 목록 순서대로 **순차** `songs.create`(D12 입력). 행마다 `span[data-item-status]`에 성공 `folder.inLibrary` / 실패 `songAddErrorKey`. `folder.err.songLimit`이 나오면 **남은 곡은 호출하지 않고** 선택 유지, 바 아래 `#folderAddSelectedAlert`에 같은 문구. 실행 중 체크박스·모드 토글·`#folderAddSelected` disabled. 끝나면 성공한 행만 선택 해제. 시트 닫힘·계정 전환 시 남은 호출 중단(`isCurrent()` 검사, 이후 setState 0) |
| D19 | 행 본문 클릭 = 이동: 썸네일·제목·구간을 감싼 `a.detailTrackLink[href=itemPracticeHref(it)]`. 체크박스는 링크 밖 형제(클릭이 이동을 일으키지 않음). 기존 `a.practiceLink` 제거(문구 `folder.practice`는 D9 시트에서 계속 사용 → I0-6 유지) |
| D20 | **공유**: `#folderShare`(`folder.share`) → URL `new URL('community.html#folder=' + encodeURIComponent(id), location.href).href`. `navigator.share`가 있으면 `share({ title, url })`(AbortError는 무시, 메시지 없음), 없으면 `navigator.clipboard.writeText(url)` → `#folderSheetOk`에 `folder.shareCopied`, 실패 → `#folderSheetAlert`에 `folder.shareFailed`. 공개 범위 변화 없음(이미 공개 폴더 링크) |
| D21 | 딥링크 열기(community 변형만): CurationRows가 마운트·`hashchange` 때 `/^#folder=([A-Za-z0-9_-]{1,64})$/`이면 `setActiveFolderId(id)`. 해시로 연 시트를 닫으면 `history.replaceState(null, '', '#all')`. CommunityPage는 이 해시를 `all` 탭으로 파싱한다(`CommunityPage.tsx:17-24` 기존 동작, 변경 없음). 없는/숨김 폴더는 기존 `#folderSheetErr`(`folder.err.gone`) |
| D22 | 시트 접근성 보강(상위 §5.3 “닫기·포커스 복귀 유지”): `FolderSheet`·`QuickAddSheet` 모두 열릴 때 제목(`tabIndex=-1`)으로 focus, ESC = 닫기(신고/추가 실행 중에도 닫기 허용 — 요청은 `isCurrent()`로 결과 폐기), 닫힐 때 열기 직전 활성 요소로 focus 복귀, Tab 순환은 `EpisodeReportDialog.tsx:59-80` 셀렉터 그대로. ≤820px에서 `FolderSheet` 카드는 전체 높이(`height:100dvh`, 모서리 0) |
| D23 | **dev mock(§5.8)**: 새 파일 `lib/communityMock.ts`. `communityMockOn()` = `import.meta.env.DEV && new URLSearchParams(location.search).get('mock') === '1'`. 데이터 `MOCK_CURATION: CurationHomeDto`(팔로잉 2·이달의 곡 4·큐레이션 3·쇼케이스 2, 폴더 `coverVideoId:null`·`coverVideoIds:[]` → 검은 표지, ID 접두어 `mock-`), `MOCK_POSTS: PublicEpisodeLogDto[]`(5개). 문자열은 영문(LA-1), 표식 문자열 `ulp-community-mock` 포함 |
| D24 | mock 주입점 2곳: CurationRows **community 변형**의 조회 effect(켜지면 API 대신 `setData(MOCK_CURATION)`), EpisodeLogFeed `fetchFirstPage`(켜지면 API 대신 `MOCK_POSTS`, `next=null`). home 변형·더보기·다른 API는 그대로 |
| D25 | mock 안전장치: mock 폴더(`id` 접두어 `mock-`) 카드 본체 클릭은 시트를 열지 않는다(폴더 상세 곡 목록은 mock 검증 대상 아님, §5.8). 빠른 추가 시트는 열리되 `#quickAddClone`·`#quickAddSong` disabled + `#quickAddStatus`에 `folder.mockNotice`(실제 DB에 mock 곡 생성 방지) |
| D27 | 곡 카드(이달의 곡) 본체 클릭은 **현행 `itemPracticeHref` 이동을 유지**한다. 상위 §5.2 “본체 = 상세”는 폴더 카드에 적용하고, 곡 1개짜리 상세는 연습 화면과 중복이라 만들지 않는다(상세는 폴더 단위 `FolderSheet` 하나). 곡 카드는 `+`/꾹 누르기 시트로 추가·연습을 고른다 |
| D26 | 프로덕션 제외 확인: `npm run build` 후 `grep -l "ulp-community-mock" dist/assets/*.js`가 0개여야 한다. 1개 이상이면 정적 import 대신 `if (import.meta.env.DEV) import('../../lib/communityMock')` 동적 import로 바꿔 재확인한다 |

## 3. 시그니처

```ts
// CommunityParts.tsx (기존 export 유지 + 선택 prop)
export type QuickAddTarget = { kind: 'folder'; folder: PublicFolderDto } | { kind: 'song'; item: PublicFolderItemDto };
export function CoverArt(p: { coverVideoId?: string | null; coverVideoIds?: string[]; label?: string }): React.ReactElement;
export interface FolderCardProps { folder: PublicFolderDto; onOpen: (folderId: string) => void; onQuickAdd?: (t: QuickAddTarget) => void; }
export interface SongCardProps { item: PublicFolderItemDto; onQuickAdd?: (t: QuickAddTarget) => void; }
export interface FolderRowProps { /* 기존 */ onQuickAdd?: (t: QuickAddTarget) => void; }

// QuickAddSheet.tsx (신규)
export function useLongPress(onFire: () => void, ms?: number /* 500 */): {
  onPointerDown: React.PointerEventHandler; onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler; onPointerCancel: React.PointerEventHandler;
  onPointerLeave: React.PointerEventHandler; onContextMenu: React.MouseEventHandler;
  onClickCapture: React.MouseEventHandler;           // 발동 직후 click 1회 차단
};
export function songAddInput(it: PublicFolderItemDto): { videoId: string; title?: string; artist?: string; rate?: number; a?: number; b?: number };
export function songAddErrorKey(e: unknown): { key: string; vars?: Record<string, string> };
export interface QuickAddSheetProps {
  target: QuickAddTarget | null; me: MeProfile | null; mock: boolean;
  onClose: () => void; onOpenDetail: (folderId: string) => void;
  onPatchFolder?: (id: string, patch: Partial<PublicFolderDto>) => void;
}
export function QuickAddSheet(p: QuickAddSheetProps): React.ReactElement | null;   // target·me.id 없으면 null, key=[uid, target id]로 세션 분리

// apiClient.ts
async function createSong(input: { videoId: string; title?: string; artist?: string; rate?: number; a?: number; b?: number }): Promise<SongDto | null>;

// lib/communityMock.ts (신규)
export function communityMockOn(): boolean;
export const MOCK_CURATION: CurationHomeDto;
export const MOCK_POSTS: PublicEpisodeLogDto[];
```

`songAddErrorKey`: `e.status===403 && e.code==='SONG_LIMIT_EXCEEDED'`(또는 `e.data.code`) → `{key:'folder.err.songLimit'}`, 그 외 `communityErrorKey(e)`. `community.mts`는 수정하지 않는다.

`useLongPress` 골격(타이머는 ref, 언마운트 시 clearTimeout):

```ts
const st = useRef<{ id: number | null; x: number; y: number; fired: boolean; touch: boolean }>({ id: null, x: 0, y: 0, fired: false, touch: false });
down: if (e.pointerType !== 'touch' && e.pointerType !== 'pen') { st.touch = false; return; }
      st = { touch: true, fired: false, x: e.clientX, y: e.clientY, id: window.setTimeout(() => { st.fired = true; st.id = null; onFire(); }, ms) };
move: if (st.id !== null && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) cancel();
up/cancel/leave: cancel();                  // fired는 유지(뒤따르는 click 차단용)
clickCapture: if (st.fired) { e.preventDefault(); e.stopPropagation(); st.fired = false; }
contextMenu: if (st.touch) e.preventDefault();
```

CurationRows(community 변형) 추가 상태: `const [quick, setQuick] = useState<QuickAddTarget | null>(null)`, `const mock = communityMockOn()`. 카드에 `onQuickAdd={setQuick}`, `onOpenFolder={(id) => { if (!id.startsWith('mock-')) setActiveFolderId(id); }}`. `QuickAddSheet onOpenDetail={(id) => { setQuick(null); setActiveFolderId(id); }}`. 계정 전환 시 effect 초기화에 `setQuick(null)` 추가.

## 4. DOM 계약

카드(community, 빠른 추가 있음):

```
div.cardShell                                   // 크기·snap 담당
  button.folderCard[data-folder-id][data-align-group="discoverCards:top,height"]   (또는 a.songCard[data-video-id])
    div.cardCoverWrap > CoverArt(label=제목)
    … (현행)
  button.quickAddBtn[data-quick-add][aria-label]
```

상세(`#folderSheet`, 기존 id 유지):

```
div#folderSheet.modalBackdrop[role=dialog][aria-modal][aria-labelledby=folderSheetTitle]
  div.sheetCard
    p#folderSheetErr (오류 시)
    div.detailHero
      div.detailCover > CoverArt(coverVideoId, coverVideoIds, label=제목)
      div.detailInfo > h3#folderSheetTitle[tabIndex=-1] · 소유자 줄 · 설명 · p#folderSheetMeta
    div#folderSheetControls[role=toolbar]  (D16)
    div.detailSelectBar (선택 모드일 때) > button#folderAddSelected · p#folderAddSelectedAlert
    form.reportBox (신고 열림, 현행)
    p#folderSheetAlert / p#folderSheetOk (현행)
    ol#folderSheetItems.detailTracks
      li.detailTrack[data-item-video][data-item-pos]
        input[type=checkbox][data-select-video][data-select-pos]   (선택 모드)
        a.detailTrackLink[href] > span.detailTrackNo(#) · img.detailTrackThumb · span.detailTrackBody(제목·아티스트·노트) · span.detailTrackSeg
        span[data-item-status] (결과 있을 때)
    div.modalFoot > button#folderClose (현행)
```

하단 시트: `div#quickAddSheet.quickBackdrop[role=dialog][aria-modal][aria-labelledby=quickAddTitle] > div.quickCard > h3#quickAddTitle[tabIndex=-1] · 행동 버튼(D9) · p#quickAddStatus / p#quickAddAlert`. 배경 클릭 = 닫기.

## 5. 파일 목록

| 파일 | 구분 | 할 일 |
| --- | --- | --- |
| `frontend/src/components/community/CommunityParts.tsx` | 수정 | D1·D3~D7(카드 래퍼·`+`·꾹 누르기 연결), `QuickAddTarget` 타입 |
| `frontend/src/components/community/QuickAddSheet.tsx` | 신규 | D8~D12·D22, `useLongPress`·`songAddInput`·`songAddErrorKey` |
| `frontend/src/components/community/FolderSheet.tsx` | 수정 | D14~D22 |
| `frontend/src/components/community/CurationRows.tsx` | 수정 | community 변형만: `onQuickAdd`·`QuickAddSheet` 호스팅·D21·D24·D25. home 분기 diff 0줄 |
| `frontend/src/components/community/Community.module.css` | 수정 | `.cardShell`·`.quickAddBtn`·`.coverLabel`·`.coverEmpty` 토큰 변경·`.coverMosaic*` 삭제·`.detail*`·`.quick*`, `.practiceLink`가 다른 곳에서 안 쓰이면 삭제 |
| `frontend/src/components/community/EpisodeLogFeed.tsx` | 수정 | D24(첫 페이지 mock 분기 ~6줄) |
| `frontend/src/lib/apiClient.ts` | 수정 | D13(~3줄) |
| `frontend/src/lib/communityMock.ts` | 신규 | D23(데이터 전용) |
| `frontend/src/lib/community.mts` | 수정 | D2 주석 1줄만 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | §6 |
| `test/e2e/community.spec.js`, `test/e2e/layout/community.spec.js`, `test/e2e/layout/home.spec.js`(표지 단언 필요 시) | 수정 | §9 |

규모 예상: 로직 파일 5(CommunityParts·QuickAddSheet·FolderSheet·CurationRows·EpisodeLogFeed), 그 외 코드 4(CSS·apiClient·mock 데이터·주석), 코드 약 +720/−110줄, 테스트 약 +320줄. **상한 경계에 있다.** 사용자 지정 범위(CMR-3 = 표지·빠른 추가·상세·부분 선택·a/b·mock)와 CM-R Step 상한 4개(RV-1)를 지키기 위해 분할하지 않고, apiClient(3줄)·주석(1줄)·mock(데이터)은 로직 파일로 세지 않는다. 구현 diff가 코드 기준 850줄을 넘으면 시니어가 구현 전 결과 파일에 사유를 기록하고 D23~D26(mock)을 같은 PR의 별도 커밋으로 분리한다(UXR-3 선례).

## 6. 문구 (새 키 14개 — 기존 키 값 변경 없음)

| 키 | ko | en | ja |
| --- | --- | --- | --- |
| `folder.quickAddAria` | {title} 내 곡 리스트에 추가 | Add {title} to my songs | {title}を自分の曲リストに追加 |
| `folder.openDetail` | 상세 보기 | View details | 詳細を見る |
| `folder.addSong` | 내 곡 리스트에 추가 | Add to my songs | 自分の曲リストに追加 |
| `folder.inLibrary` | 내 곡 리스트에 있어요 | In my songs | 自分の曲リストにあります |
| `folder.err.songLimit` | 곡 한도에 도달했어요. 플랜을 확인해 주세요 | You've reached your song limit. Check your plan | 曲の上限に達しました。プランをご確認ください |
| `folder.selectMode` | 부분 선택 | Select songs | 曲を選択 |
| `folder.selectCancel` | 선택 취소 | Cancel selection | 選択を解除 |
| `folder.addSelected` | 선택한 곡 추가 ({n}) | Add selected ({n}) | 選択した曲を追加 ({n}) |
| `folder.share` | 공유 | Share | 共有 |
| `folder.shareCopied` | 링크를 복사했어요 | Link copied | リンクをコピーしました |
| `folder.shareFailed` | 링크를 복사하지 못했어요 | Couldn't copy the link | リンクをコピーできませんでした |
| `folder.controlsAria` | 폴더 동작 | Folder actions | フォルダの操作 |
| `folder.quickCancel` | 취소 | Cancel | キャンセル |
| `folder.mockNotice` | 개발용 mock 데이터라 추가할 수 없어요 | Mock data (dev only) can't be added | 開発用のモックデータは追加できません |

재사용: `folder.clone`(`#folderClone`·`#quickAddClone`), `folder.practice`(`#quickAddPractice`), `folder.meta`, `folder.cloneDone`, `community.err.upgrade`, `folder.err.gone`. `folder.mockNotice`는 DEV 경로에서만 렌더되지만 소스에 `t('folder.mockNotice')`가 있으므로 I0-6을 만족한다.

## 7. 상태·오류·권한

| 상황 | 동작 |
| --- | --- |
| guest | 커뮤니티는 선반 자체가 없음(현행). 홈은 `quickAdd` 미전달 |
| 무료 사용자 폴더 담기 | 요청 0 + `community.err.upgrade`(시트·상세 동일) |
| 무료 사용자 곡 추가 | 허용(서버 티어 곡 한도만 적용). 한도 초과 403 → `folder.err.songLimit` |
| 이미 있는 곡 | 200 → `folder.inLibrary`(새로 만든 것과 같은 표시, RV-4) |
| a≥b 데이터 | a·b 없이 전송(D12) → 서버 400 0건 |
| 일반 서버 오류 | 행/시트에 `communityErrorKey` 문구, 선택·데이터를 성공으로 바꾸지 않음 |
| 순차 추가 중 시트 닫힘·계정 전환 | 남은 호출 0, 늦은 응답 setState 0 |
| 자기 폴더 | 컨트롤 바 = `#folderShare`만, 선택 모드 없음 |
| 숨김/삭제 폴더 딥링크 | `#folderSheetErr` `folder.err.gone` |
| clipboard 없음·거부 | `folder.shareFailed` |
| mock 켜짐(DEV만) | D24·D25 |

## 8. 배치 약속

| 대상 | 390 | 768 | 1150/1280 | 약속 |
| --- | --- | --- | --- | --- |
| 카드 셸 | 가로 스크롤 176px | 같음 | 같음 | 셸 안 카드가 기존 `discoverCards:top,height` 유지(셸이 크기, 카드 100%) |
| `+` 버튼 | 숨김(hover:none) | — | 호버·포커스 시 표지 우상단 | 카드 테두리 밖으로 나가지 않음(G2) |
| 상세 히어로 | 표지 120px 위, 정보 아래(세로) | 표지 180px 좌·정보 우 | 같음 | `detailHero:top@768`(표지·정보 윗선) |
| 컨트롤 바 | 줄바꿈 허용, 버튼 44px | 한 줄 | 한 줄 | 버튼들 `detailControls:center-y` |
| 곡 행 | `#`·썸네일 56·본문(구간은 본문 아래 줄) | `#`·썸네일 64·본문·구간 열 | 같음 | 행 안 `detailTrack<i>:center-y`는 첫 행만 약속(`detailTrack0:center-y`) |
| 하단 시트 | 화면 하단 폭 100% | 하단 중앙 `min(480px,100%-32px)` | 같음 | 행동 버튼 44px, 주 버튼 1개만 필(Q1) |
| 빈 표지 | 검은 타일 + 제목 3줄 | 같음 | 같음 | 라벨 G3는 `data-layout-ignore="G3: 표지 제목 말줄임"`(i18n-keep 사유) |

토큰만 사용(`--ink`,`--bg`,`--line`,`--surface`,`--surface2`,`--muted`,`--radius-card`,`--radius-pill`). 인라인 style 금지.

## 9. 테스트 표

준비: `communityRoutes`(`test/e2e/support/community-fixtures.js:309`), 곡 POST는 테스트마다 `page.route('**/api/v1/songs', …)`로 직접 받는다(본문 기록·상태 코드 지정). 터치: `test.use({ hasTouch: true })` + `locator.dispatchEvent('pointerdown', { pointerType: 'touch', clientX, clientY, isPrimary: true })` + `page.clock.install()`/`runFor(500)`.

| 이름 | 준비 | 기대 | 잡을 버그 |
| --- | --- | --- | --- |
| CMR3-1 단일 표지 | `coverVideoIds` 4개 폴더 | `.coverMosaic` 0, 카드 표지 `img` 1개, src에 `coverVideoId`(없으면 첫 ID) | 모자이크 잔존 |
| CMR3-2 빈 표지 | `coverVideoId:null`, `coverVideoIds:[]` | `.coverEmpty` 배경 = `--ink` 계산값, `.coverLabel` 텍스트 = 제목, `aria-hidden=true` | 빈 회색 타일 |
| CMR3-3 홈 보존 | `index.html` `#discover` | 카드에 `.cardShell`·`[data-quick-add]` 0, 줄 순서·문구 현행, 표지 단일 | 공용 전파(UR-13) |
| CMR3-4 `+` 노출 | 1280, 폴더 카드 hover / Tab 포커스 | `[data-quick-add]` opacity 1, 클릭 시 `#quickAddSheet` 열림·`#folderSheet` 0 | 본체 동시 실행 |
| CMR3-5 `+` 숨김 | `hasTouch`+`isMobile` 390 | `[data-quick-add]` `display:none` | 터치에 `+` |
| CMR3-6 꾹 누르기 | 390 touch, pointerdown → clock 500 → pointerup | `#quickAddSheet` 열림, 뒤따른 click으로 `#folderSheet`/곡 이동 0 | 길게 누름 후 본체 실행 |
| CMR3-7 꾹 누르기 취소 | pointerdown → pointermove 20px → clock 600 | 시트 0, 이후 탭(click)은 본체 실행 | 스크롤 중 오작동 |
| CMR3-8 짧은 탭 | pointerdown → clock 200 → up → click | 시트 0, 폴더면 `#folderSheet` 열림 | 짧은 탭 차단 |
| CMR3-9 곡 추가 a/b | 이달의 곡 `a:38,b:55,rate:0.75` → `#quickAddSong`, POST 201 | 본문 `{videoId,title,artist,rate:0.75,a:38,b:55}`, `#quickAddStatus` `내 곡 리스트에 있어요` | a/b 누락(RV-4) |
| CMR3-10 멱등 | POST 200(기존 곡) | 같은 성공 문구 | 200을 실패로 처리 |
| CMR3-11 a≥b·범위 밖 | `a:60,b:30`, `rate:3` | 본문에 `a`·`b`·`rate` 키 없음 | 서버 400 유발 |
| CMR3-12 곡 한도 | POST 403 `SONG_LIMIT_EXCEEDED` | `#quickAddAlert` `곡 한도에 도달했어요…`, 성공 문구 0 | generic 문구 |
| CMR3-13 폴더 담기 | Pro `#quickAddClone` 성공 / 무료 | Pro: clone POST 1·`folder.cloneDone`. 무료: 요청 0·업그레이드 문구 | 티어 우회 |
| CMR3-14 상세 열기 | 시트 `#quickAddOpen` | `#quickAddSheet` 0, `#folderSheet` 해당 폴더 | 경로 단절 |
| CMR3-15 상세 구조 | 폴더 열기 | 순서 `.detailHero` → `#folderSheetControls` → `#folderSheetItems`, 바 버튼 순서 D16, 재생/셔플/다운로드 버튼 0, `#folderSheetTitle` focus | 구조·위계 |
| CMR3-16 기존 계약 | 기존 CM-3·CM-5·AV2 시나리오 | 전부 통과(셀렉터 P9 유지) | 회귀 |
| CMR3-17 행 이동 | `a.detailTrackLink` 클릭 | `practice.html?v=…&a=…&b=…` | 이동 손실 |
| CMR3-18 부분 선택 | 3곡 중 1·3 체크 → `#folderAddSelected`(2) → 1번 201, 3번 200 | POST 2회(순서 1→3), 두 행 `data-item-status` 성공 문구, 2번 행 상태 없음, 성공 행 선택 해제 | 순서·전체 추가 |
| CMR3-19 선택 중 한도 | 1·2·3 선택, 2번 403 한도 | POST 2회(3번 호출 0), 2·3 선택 유지, `#folderAddSelectedAlert` 한도 문구 | 한도 뒤 계속 호출 |
| CMR3-20 실행 중 잠금·닫힘 | 1번 응답 보류 중 `#folderClose` | 닫힌 뒤 남은 POST 0, pageerror 0 | 닫힌 시트 갱신 |
| CMR3-21 계정 전환 | 순차 추가 중 B 로그인 | B 화면에 A 시트·상태 0, 남은 POST 0 | 늦은 응답 오염 |
| CMR3-22 공유 | clipboard 권한 허용 / `navigator.clipboard` 제거 | 복사 URL `…/community.html#folder=<id>`, `#folderSheetOk` / `#folderSheetAlert` 실패 문구 | 공유 실패 무시 |
| CMR3-23 딥링크 | `community.html#folder=<id>` 직접 진입 → 닫기 | 시트 자동 열림, 닫힌 뒤 해시 `#all`, 숨김 폴더면 `#folderSheetErr` | 딥링크 단절 |
| CMR3-24 자기 폴더 | owner=me | 바에 `#folderShare`만, `#folderSelectMode` 0 | 권한 표시 |
| CMR3-25 ESC·포커스 | 상세·하단 시트 각각 ESC | 닫힘, 연 요소(카드/`+`)로 focus 복귀, Tab 순환이 시트 안 | 포커스 유실 |
| CMR3-26 mock 제외 | `npm run build` 후 `grep -l ulp-community-mock dist/assets/*.js` | 0개(명령 출력 기록) | 프로덕션 mock 포함 |

`layout/community.spec.js`: `community-folder-detail`(상세 시트 열린 상태, 4폭+다크), `community-quick-add`(1280 `+` 시트, 390 터치 시트) suite 추가. `community-pro` 기존 suite는 셸 도입 후 G0~G8 재통과 확인.

dev mock 화면 확인(E2E 불가, P17): 주니어 4단계에서 `npm run dev:client` + `/community.html?mock=1`로 1280·390 캡처 2장을 결과 파일에 남기고, 검은 표지·선반 순서·`+` 시트 disabled를 판정한다. 실행 못 하면 미실행으로 적는다.

## 10. 체크리스트

- [ ] `git grep -n "coverMosaic" -- frontend/src` → 0줄
- [ ] `git diff main -- frontend/src/components/community/CurationRows.tsx`에서 `variant === 'home'` 블록 변경 0줄
- [ ] `test/m223_community.test.js` CM-U3 무변경 통과(D2)
- [ ] `npm run build`, `npm test`, CMR3-26 grep 0
- [ ] `npx playwright test test/e2e/community.spec.js test/e2e/av2-community.spec.js test/e2e/cm-ui.spec.js test/e2e/layout/community.spec.js test/e2e/layout/home.spec.js` 후 전체 `npx playwright test`
- [ ] `LAYOUT_SHOTS=1` 커뮤니티·홈 4폭+다크 Q1~Q9 → `개발산출물/결과/CMR-3.md`
- 미실행 명시 대상: 실서버 `POST /songs` 한도·멱등(가짜 API), 실기기 길게 누르기·`navigator.share`, 운영 데이터(§5.8 관리자 절차)

## 11. 금지

- 서버·API·DTO·DB 변경, 임시 폴더 clone, 카테고리 지정, 재생·셔플·다운로드 버튼.
- 프로덕션 번들 mock·가짜 카드, 길이/총 길이 추정 표시.
- 홈 `CurationRows` home 분기·`HomePage.*` 수정, `coverIds` export 변경, 기존 번역 키 값 변경·삭제, 새 의존성, JSX 인라인 style.
- 이름 모달·소개·CTA(CMR-2), 게시물 좋아요·녹음 재생(CMR-4).
