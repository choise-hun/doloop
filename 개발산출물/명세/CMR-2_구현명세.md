# CMR-2 구현 명세 — 커뮤니티 소개·“내 연습 공유하기”·빈 상태 단계 + 이름 모달·공유 가드

> 작성: 2026-11-11 / Claude(시니어). 상위: [UIUX-R 수정 명세](UIUX-R_수정명세.md) §5.1·§5.2a·§5.4·§5.9·§8·§9(UR-07), 결정 §1.1(RV-10·RV-11). 선행 결과: [CMR-1 결과](../결과/CMR-1.md).
> 담당: **[시니어] 직접 구현 → [주니어] 4단계 전체 테스트·PR·CI.** 판정(협업 §1.2): Q1 기존 배너 제거·모든 커뮤니티 진입에 모달 개입(전 E2E 영향) 예, Q2 `MySharesPanel`은 프로필과 공유 예, Q3 계정 전환·저장 중 잠금·포커스 트랩 예 → 시니어.
> 브랜치 `step/CMR-2`, base `main`(CMR-1 PR #3 머지 `e28421d` 이후). CMR-3과 코드 파일이 `CurationRows.tsx`·i18n만 겹친다(서로 다른 줄·키). **서버·API·DTO 변경 없음.**

## 1. 전제 (`main`=`e28421d`, 구현 전 재확인)

| # | 위치 | 사실 |
| --- | --- | --- |
| P1 | `frontend/src/pages/CommunityPage.tsx:134-138` | 머리줄 `header#communityHeader` > `h1#communityTitle`(`episode.heading`=COMMUNITY). 소개 문구 없음 |
| P2 | 같은 파일 `:141-150` | guest: `div#communityGuest.card` 제목·`community.guestDesc`·로그인 `a[href="settings.html#account"]` |
| P3 | 같은 파일 `:151-155` | 로그인 + `me` 없음: `#communityLoading`(status) 또는 `#communityError`(alert)+재시도 |
| P4 | 같은 파일 `:211-221` | 이름 없음이면 탭 아래 인라인 배너 `#communityNameBanner` > `PublicNameForm(inputId=communityBannerNameInput, submitId=communityBannerNameSave)` |
| P5 | 같은 파일 `:331-335` | `MySharesPanel me` 만 전달(`onRequireName` 미전달) |
| P6 | `components/community/PublicNameForm.tsx:9-17`, `:52-86` | props `me,inputId,submitId,inputRef,onSaved,disabled,acquireSave`. 형식 검사 2~20자·공백 금지 → 요청 0, 성공 시 `auth.fetchMe()` 재확인 후 `onSaved(publicName)`. 계정 전환 시 abort. 저장 중 `pending`로 입력·버튼 disabled |
| P7 | `components/community/MySharesPanel.tsx:20-23`, `:91-135` | prop `onRequireName?`. `mutate(row,'public'|'auto'|'republish')`는 Pro 검사 뒤 낙관 갱신 → PUT/POST, 서버 `PUBLIC_NAME_REQUIRED`면 `onRequireName?.()`. 이름 사전 검사 없음 |
| P8 | `components/community/CurationRows.tsx:139-141` | `#communityAllEmpty`는 `<p>` 한 줄(`community.allEmpty`). 조건 = 큐레이션 성공·네 줄 0·`postsEmpty===true` |
| P9 | `components/community/EpisodeReportDialog.tsx:46-84` | 다이얼로그 키 처리 기준 패턴: 첫 요소 focus, Escape(제출 중 무시)→닫기+trigger focus, Tab/Shift+Tab 순환 |
| P10 | `pages/ProfilePage.tsx:279`, `:303` | `PublicNameForm`·`MySharesPanel(onRequireName=프로필 입력 focus)` 사용 — **변경 금지** |
| P11 | `lib/categories.ts:14-31` | `sessionStorage` 접근을 try/catch로 감싸는 기존 패턴 |
| P12 | `App.tsx:39` | TRAILS 경로 `/log.html`. 화면 내부 링크는 상대 `log.html`(`EpisodeLogFeed.tsx:212`) |
| P13 | 테스트 의존 | `test/e2e/community.spec.js:313-343` CM-10(배너 id), `test/e2e/layout/profile.spec.js:566-599` PF2-08(배너 id). `test/e2e/support/mock-app.js:5-` `DEFAULT_ME`에 `publicName` 없음 → 기본 me로 `community.html`에 들어가는 테스트는 모달이 열린다 |
| P14 | `test/i18n.test.js:84`(I0-6 미사용 키 금지), `:130`(LA-1 한글 잔존 금지), `:191`(LB-1 ko/en/ja 대칭) | 새 키 3개 언어 동시 추가, 배너 제거 뒤에도 `community.nameBanner`는 모달에서 계속 쓴다 |

## 2. 결정

| ID | 결정 |
| --- | --- |
| D1 | 소개 영역 `section#communityIntro`를 머리줄 바로 아래, **탭·guest 카드·로딩/오류보다 먼저** 모든 상태에서 렌더한다. 설명 `p#communityIntroDesc`(`community.introDesc`)는 항상 보인다 |
| D2 | CTA `a#communityShareCta[href="log.html"]`(`community.shareCta`) + 보조 `p#communityShareHint`(`community.shareCtaHint`)는 **로그인 && `me` 준비 && `me.id===user.id`**일 때만 렌더. guest는 기존 `#communityGuest` 로그인 CTA가 대신한다(D1 아래 그대로). `me` 로딩·실패 중에는 CTA 없음(guest/빈 피드로 대체하지 않음) |
| D3 | CTA 클릭: `me.publicName` 있으면 기본 링크 이동(가로채지 않음). 없으면 `preventDefault` → 모달 `reason='share'`, 대기 동작 `navigate`. 이름 저장 성공 시 `window.location.assign('log.html')` 1회. 클릭만으로 게시·동의·결제 요청 0건 |
| D4 | 인라인 배너 `#communityNameBanner`·`communityBannerName*` id·`.nameBanner/.bannerTitle`(`CommunityPage.module.css:213-229`) **삭제**. `Community.module.css:269-285`의 `.nameBanner/.bannerTitle`는 다른 사용처가 없으면 함께 삭제(구현 전 `git grep` 0 확인) |
| D5 | 새 컴포넌트 `components/community/PublicNameModal.tsx`(§3). 내용은 `PublicNameForm` 재사용(`inputId="communityNameModalInput"`, `submitId="communityNameModalSave"`). 서버 가드(2~20자·7일·금칙어·중복) 문구는 폼의 기존 alert 그대로 |
| D6 | 첫 진입 자동 열기 조건: `user && me && me.id===user.id && !me.publicName && !skipRead(uid)`. 계정마다 1회 판정(`OwnedCommunityPage`가 uid key로 재마운트, `CommunityPage.tsx:26-29`). 탭과 무관(모든 해시에서 열림) |
| D7 | 건너뛰기 기억: 키 `ulp:community-name-skip:<uid>`, 값 `'1'`, `sessionStorage`. 닫기 버튼·ESC·“나중에” 셋 다 **같은 의미(skip 기록)**. 읽기/쓰기 예외는 삼키고 “기억 안 됨”으로 취급(다음 진입에 다시 열림). 다른 uid의 기록은 영향 없음 |
| D8 | 공유 가드 대상(RV-10): ① D3 CTA ② `#communityAllEmpty` 안의 CTA(D11) ③ 커뮤니티 화면의 `MySharesPanel` **공개 켜기(`kind='public' && nextPublic`)·다시 게시(`republish`)**. 공개 끄기·자동 연동은 가드하지 않는다(이미 공개 = 이름 있음). TRAILS `EpisodeShareDialog`·프로필 `MySharesPanel`은 현행 |
| D9 | `MySharesPanelProps`에 선택 prop `requireName?: () => boolean` 추가. 있으면 D8③ 경우 Pro 검사 **뒤**, 낙관 갱신·요청 **앞**에서 호출하고 `false`면 즉시 return(상태·요청 변화 0). CommunityPage는 `() => { if (me.publicName) return true; openModal('share', null, trigger); return false; }`. 기존 `onRequireName`(서버 409 대응)도 CommunityPage에서 `() => openModal('share', null, null)`로 연결. 프로필 호출부는 둘 다 미전달 → 현행 |
| D10 | 모달 종료 후 동작: `navigate` 대기면 D3대로 이동. MySharesPanel 대기(`null`)면 **자동 재실행 없음**(상위 §5.4 “자동 게시·자동 재시도 없음”) — 모달을 닫고 트리거 스위치로 focus 복귀, 사용자가 다시 누른다 |
| D11 | 빈 상태 확장: CurationRowsProps에 `emptyExtra?: React.ReactNode`(community 변형만). `#communityAllEmpty`를 `<div>`로 바꾸고 안에 기존 `p`(`community.allEmpty`) → `emptyExtra`. CommunityPage가 넘기는 내용 = `ol#communityEmptySteps`(3단계 li) + `a#communityEmptyShareCta[href="log.html"]`(D3과 같은 핸들러) |
| D12 | 모달 접근성: `role="dialog" aria-modal="true" aria-labelledby="communityNameModalTitle" aria-describedby="communityNameModalDesc"`. 열릴 때 입력 focus, Tab 순환(P9 셀렉터 그대로), 닫힐 때 열기 직전 `document.activeElement`(HTMLElement일 때)로 focus 복귀. 배경 스크롤 잠금 = 열림 동안 `document.body.style.overflow='hidden'`, 닫힘/언마운트 시 이전 값 복원 |
| D13 | 저장 중 잠금: 모달이 `acquireSave`를 넘겨 저장 중 플래그를 소유한다. 저장 중에는 ESC·닫기·“나중에”·배경 클릭 모두 무시(버튼 disabled). 실패 시 모달 유지·입력값 유지(폼 기존 동작). 배경 클릭은 닫기와 같다(D7) |
| D14 | 계정 전환: 모달 상태는 `OwnedCommunityPage` 안에 있어 uid 변경 시 재마운트로 사라진다. 저장 중 전환은 `PublicNameForm`이 abort(P6) → `onSaved` 미호출 → 이동 0 |
| D15 | 문구: 상위 §5.2a의 “아직 공유된 연습 기록이 없어요”는 CMR-1에서 `community.allEmpty`(“아직 공유된 연습이 없어요”)로 확정됐으므로 **값을 바꾸지 않는다**. 새 키만 추가(RV-11) |

## 3. 시그니처

```ts
// components/community/PublicNameModal.tsx (신규, export 1개)
export interface PublicNameModalProps {
  me: MeProfile;                       // 호출부가 me.id===user.id 보장
  reason: 'first' | 'share';           // share면 #communityNameModalReason 표시
  onDismiss: () => void;               // 닫기·ESC·나중에·배경 (저장 중엔 호출 안 됨)
  onSaved: (publicName: string) => void;
}
export function PublicNameModal(props: PublicNameModalProps): React.ReactElement;

// MySharesPanel.tsx — 선택 prop 1개 추가(기존 export·prop 유지)
export interface MySharesPanelProps { me: MeProfile | null; onRequireName?: () => void; requireName?: () => boolean; }

// CurationRows.tsx — 선택 prop 1개 추가
export interface CurationRowsProps { /* 기존 */ emptyExtra?: React.ReactNode; }
```

CommunityPage 내부 상태(파일 내부, export 없음):

```ts
type NameGate = { reason: 'first' | 'share'; pending: 'navigate' | null; returnFocus: HTMLElement | null } | null;
const [gate, setGate] = useState<NameGate>(null);
const skipKey = (uid: string) => `ulp:community-name-skip:${uid}`;
function readSkip(uid: string): boolean { try { return sessionStorage.getItem(skipKey(uid)) === '1'; } catch { return false; } }
function writeSkip(uid: string): void { try { sessionStorage.setItem(skipKey(uid), '1'); } catch { /* 기억 안 됨 */ } }
// 첫 진입: useEffect([currentUid, me?.id, me?.publicName]) — 조건 D6이면 setGate({reason:'first',pending:null,returnFocus:document.activeElement as HTMLElement|null}) (이미 열려 있으면 그대로)
// onShareClick(e): if (!me.publicName) { e.preventDefault(); setGate({reason:'share', pending:'navigate', returnFocus:e.currentTarget}); }
// onDismiss: writeSkip(uid); const f = gate.returnFocus; setGate(null); f?.focus();
// onSaved: const p = gate.pending; setGate(null); if (p === 'navigate') window.location.assign('log.html'); else gate.returnFocus?.focus();
```

모달 DOM(이 순서·id 고정):

```
div#communityNameModal.nameModalBackdrop (role=dialog, aria-modal, labelledby, describedby)
  div.nameModalCard
    h2#communityNameModalTitle        t('community.nameModalTitle')
    p#communityNameModalDesc          t('community.nameBanner')
    p#communityNameModalReason        t('community.nameModalShareReason')   // reason==='share'일 때만
    PublicNameForm (inputId=communityNameModalInput, submitId=communityNameModalSave, acquireSave, onSaved)
    div.nameModalFoot
      button#communityNameModalSkip.ghostBtn   t('community.nameModalSkip')   // disabled = saving
  button#communityNameModalClose (aria-label=t('community.nameModalClose'), ×)   // 카드 우상단, disabled = saving
```

`acquireSave` 구현: `() => { if (savingRef.current) return null; savingRef.current = true; setSaving(true); return () => { savingRef.current = false; setSaving(false); }; }`.

## 4. 파일 목록

| 파일 | 구분 | 할 일 |
| --- | --- | --- |
| `frontend/src/pages/CommunityPage.tsx` | 수정 | D1~D4·D6~D11·D14, 모달 호스팅, MySharesPanel에 `requireName`·`onRequireName` 전달 |
| `frontend/src/pages/CommunityPage.module.css` | 수정 | `.intro*`·`.emptySteps` 추가, `.nameBanner/.bannerTitle` 삭제 |
| `frontend/src/components/community/PublicNameModal.tsx` | 신규 | §3 |
| `frontend/src/components/community/Community.module.css` | 수정 | `.nameModal*`(모달 전용), `.emptyMsg` 컨테이너화에 맞춘 보정, 미사용 `.nameBanner/.bannerTitle` 삭제 |
| `frontend/src/components/community/MySharesPanel.tsx` | 수정 | D9 (3~6줄) |
| `frontend/src/components/community/CurationRows.tsx` | 수정 | D11 (`#communityAllEmpty` div화 + `emptyExtra`). home 분기 diff 0줄 |
| `frontend/src/lib/i18n/{ko,en,ja}.mts` | 수정 | §5 |
| `test/e2e/community.spec.js`, `test/e2e/cm-ui.spec.js`, `test/e2e/layout/community.spec.js`, `test/e2e/layout/profile.spec.js` | 수정 | §8 |

규모 예상: 코드 6파일(테스트·i18n 제외) 약 +330/−60줄, 테스트 약 +260줄. 상한(파일 7·diff 700) 이내.

## 5. 문구 (새 키 10개 — 기존 키 값 변경 없음)

| 키 | ko | en | ja |
| --- | --- | --- | --- |
| `community.introDesc` | 서로의 연습 기록을 보고, 나의 성장을 공유하세요 | See each other's practice logs and share your progress | お互いの練習記録を見て、自分の成長を共有しましょう |
| `community.shareCta` | 내 연습 공유하기 | Share my practice | 自分の練習を共有する |
| `community.shareCtaHint` | 연습 세션을 선택한 뒤 공유할 수 있어요 | Choose a practice session, then share it | 練習セッションを選んでから共有できます |
| `community.emptyStepPick` | TRAILS에서 공유할 연습 세션을 골라요 | Pick a practice session in TRAILS | TRAILSで共有する練習セッションを選びます |
| `community.emptyStepCheck` | 공개되는 내용을 확인해요 | Check what will be public | 公開される内容を確認します |
| `community.emptyStepAgree` | 동의한 뒤 공유해요 | Agree and share | 同意してから共有します |
| `community.nameModalTitle` | 커뮤니티 이름 정하기 | Set your community name | コミュニティ名を設定 |
| `community.nameModalShareReason` | 공유하려면 커뮤니티 이름이 필요해요 | You need a community name to share | 共有するにはコミュニティ名が必要です |
| `community.nameModalSkip` | 나중에 하기 | Later | あとで |
| `community.nameModalClose` | 닫기 | Close | 閉じる |

재사용: `community.nameBanner`(모달 설명 — I0-6 유지), `community.allEmpty`, `community.guestDesc`, `nav.login`, `community.nameLabel/nameHint/nameSave/nameLocked`(폼 내부). 소스에 한글 리터럴 금지(LA-1).

## 6. 상태 흐름

| 상태 | 소개 설명 | CTA | 모달 | 그 외 |
| --- | --- | --- | --- | --- |
| guest | 보임 | 없음 | 없음 | `#communityGuest` 로그인 CTA, 인증 API 호출 0 |
| 로그인·`me` 로딩/실패 | 보임 | 없음 | 없음 | P3 그대로 |
| `me` 준비·이름 있음 | 보임 | `#communityShareCta`·힌트 | 없음 | CTA는 일반 링크 |
| `me` 준비·이름 없음·skip 없음 | 보임 | 보임 | **자동 `first`** | 배경 탭·선반 로딩은 계속(모달은 덮기만) |
| 이름 없음·skip 있음 | 보임 | 보임 | 공유 시도 때만 `share` | — |
| 모달 저장 중 | — | — | 닫기류 disabled·ESC 무시 | 폼 입력·저장 disabled(폼 기존) |
| 저장 실패 | — | — | 유지, 입력 유지 | 폼 alert |
| 저장 성공 | — | 이름 있음 상태로 | 닫힘 | `navigate`면 `log.html` 이동, 아니면 focus 복귀 |
| 전체 빈 상태 | 보임 | 보임 | — | `#communityAllEmpty` = 문구 + `#communityEmptySteps`(3) + `#communityEmptyShareCta` |

## 7. 배치 약속

| 대상 | 390 | 768 | 1150/1280 | 약속 |
| --- | --- | --- | --- | --- |
| `#communityIntro` | 설명 → CTA 묶음 세로(CTA 폭 100%) | 설명 좌·CTA 묶음 우 한 줄 | 같음 | `#communityIntroDesc`·`#communityShareCta`에 `communityIntro:center-y@768` |
| CTA 묶음 | — | CTA 위·힌트 아래, 오른쪽 정렬 | 같음 | `.introCta` 열 flex, 힌트 `var(--muted)` 13px |
| 모달 | 하단 정렬 시트, 폭 100%, 좌우 패딩 16 | 중앙, 폭 `min(480px, 100% - 32px)` | 같음 | 카드 `var(--surface)`·`1px solid var(--line)`·`var(--radius-card)` |
| 빈 상태 | 단계 세로 목록 → CTA 폭 100% | 단계 세로 → CTA 자기 폭 | 같음 | 번호는 `ol` 기본 숫자, 가짜 카드 0 |

CTA는 화면의 **유일한 강한 필 버튼**(Q1): `cta` 전역 클래스(`CommunityPage.tsx:146` guest 로그인과 같은 클래스) 사용, 높이 ≥44px. 빈 상태 CTA는 같은 화면에 소개 CTA가 이미 있으므로 `ghostBtn`(보조 위계). 토큰만 사용, 인라인 style 금지(모달 스크롤 잠금의 `document.body.style`은 JSX style이 아님).

## 8. 테스트 표

준비는 기존 `communityRoutes`·`COMMUNITY_PRO_ME`(`test/e2e/support/community-fixtures.js:29`) 방식. 이름 없음 = `{ ...COMMUNITY_PRO_ME, publicName: null, publicNameNextChangeAt: null }`.

| 이름 | 준비 | 기대 | 잡을 버그 |
| --- | --- | --- | --- |
| CMR2-1 소개·CTA | Pro·이름 있음, 1280/390 | `#communityIntroDesc` 문구, `#communityShareCta[href$="log.html"]`, 힌트 표시, 모달 0개, `#communityIntro`가 `[role=tablist]`보다 문서 앞 | 순서·누락 |
| CMR2-2 guest | guest | 설명 표시, `#communityShareCta` 0개, `#communityGuest` 로그인 링크, `/api/v1/community/*`·`/api/v1/curation/*` 요청 0, 모달 0 | guest에 인증 API |
| CMR2-3 me 로딩 | `/api/v1/me` 응답 보류 | `#communityLoading` + 설명, CTA 0, 모달 0. 해제 후 정상 | 로딩을 guest로 대체 |
| CMR2-4 첫 진입 모달 | 이름 없음 | `#communityNameModal` 1개, `#communityNameModalInput` focus, `#communityNameModalReason` 0, `#communityNameBanner` 0, body `overflow=hidden` | 배너 잔존·자동 열기 누락 |
| CMR2-5 건너뛰기 기억 | CMR2-4 → `#communityNameModalSkip` | 닫힘, focus 복귀, body overflow 원복, 새로고침 후 모달 0 / ESC·`#communityNameModalClose`·배경 클릭 각각도 같은 결과(3개 하위 케이스) | skip 미기록 |
| CMR2-6 공유 가드 | skip 후 `#communityShareCta` 클릭 | 모달 `share`(`#communityNameModalReason` 보임), URL 그대로(`community.html`), `public-name` PUT 0·share 요청 0 | 이름 없이 이동 |
| CMR2-7 저장 후 이동 | CMR2-6 → 이름 입력·저장 200 + `/me` 갱신 응답에 이름 | `log.html`로 1회 이동(`page.waitForURL(/log\.html/)`), PUT 1 | 성공 후 미이동 |
| CMR2-8 저장 실패 | PUT 409 `PUBLIC_NAME_TAKEN` | 모달 유지, 입력값 유지, alert `이미 쓰는 이름이에요`, 이동 0 | 실패 시 닫힘·입력 손실 |
| CMR2-9 저장 중 잠금 | PUT 응답 보류 | Skip·Close disabled, ESC 후에도 모달 유지, 저장 버튼 재클릭 PUT 1회 유지 | 중복 제출·중간 닫힘 |
| CMR2-10 포커스 트랩 | 모달 열림 | 마지막 요소에서 Tab → 첫 요소, 첫 요소에서 Shift+Tab → 마지막, focus가 모달 밖으로 나가지 않음 | 트랩 누락 |
| CMR2-11 storage 실패 | `addInitScript`로 `Storage.prototype.setItem/getItem` throw | 모달 열림, 건너뛰기 동작·pageerror 0, 새로고침 후 다시 열림 | 예외로 화면 깨짐 |
| CMR2-12 계정별 skip | A skip → B 로그인(이름 없음) | B에게 모달 열림 | uid 무관 skip |
| CMR2-13 내 공유 가드 | 이름 없음·skip·`#my-shares`·Pro, 공개 스위치 클릭 | 모달 `share`, `PUT /categories/*/share` 0, 스위치 `aria-checked` 원래 값, 모달 닫으면 스위치로 focus | 낙관 갱신 후 가드 |
| CMR2-14 저장 후 재실행 없음 | CMR2-13 → 이름 저장 성공 | 모달 닫힘, share PUT 0(자동 게시 없음), 스위치 다시 클릭 시 PUT 1 | 자동 게시 |
| CMR2-15 서버 409 대응 | 이름 있음(클라이언트 판정 통과)인데 PUT 409 `PUBLIC_NAME_REQUIRED` | 스위치 원복 + 모달 `share` 열림 | `onRequireName` 미연결 |
| CMR2-16 빈 상태 단계 | CMR-1 `COMMUNITY_EMPTY` 준비 | `#communityAllEmpty` 안 `#communityEmptySteps li` 3개·문구 순서, `#communityEmptyShareCta[href$="log.html"]`, 가짜 카드 0(`[data-folder-id]`·`[data-post-id]` 0) | 가짜 활동 |
| CMR2-17 프로필 보존 | 프로필 이름 없음·`#mySharesPanel` 공개 클릭 | 기존대로 PUT 발생(가드 없음), 커뮤니티 모달 0 | 공용 패널 전파 |

기존 테스트 갱신(승인된 요구 변경 §5.4 “인라인 배너 제거” — 결과 파일에 사유 기록, 단언 의미는 유지):
- `community.spec.js` CM-10: `#communityNameBanner`→`#communityNameModal`, `#communityBannerNameInput/Save`→`#communityNameModalInput/Save`. 공백 이름 요청 0·409 문구 단언 유지.
- `layout/profile.spec.js` PF2-08: 같은 id 치환. 전환 후 입력 `''`·PUT 0 단언 유지(전환 후 B에게도 모달이 다시 열려 입력이 보여야 함).
- 기본 `DEFAULT_ME`(이름 없음)로 `community.html`에 들어가 다른 요소를 클릭하는 테스트(예: `cm-ui.spec.js`)는 모달이 클릭을 가로챈다 → `community-fixtures.js`에 `skipNameModal(page, uid = DEFAULT_ME.id)`(`addInitScript`로 skip 키 기록) 헬퍼를 추가해 **해당 테스트에만** 부른다. 모달 자체가 검증 대상이 아닌 테스트에만 쓰고, 단언은 바꾸지 않는다. 해당 목록은 전체 회귀 실패로 확정해 결과 파일에 적는다.
- `layout/community.spec.js`: `community-name-modal` suite 추가(이름 없음, 4폭+다크, ready = `#communityNameModalInput` 보임). 기존 4 suite는 이름 있는 me라 영향 없음을 확인.

## 9. 검증·체크리스트

- [ ] `git grep -n "communityNameBanner\|communityBannerName" -- frontend/src test` → 0줄
- [ ] `git diff main -- frontend/src/pages/ProfilePage.tsx` 0줄, `CurationRows.tsx`의 `variant === 'home'` 분기 diff 0줄
- [ ] `npm run build`, `npm test`(I0-6·LA-1·LB-1 포함) 통과
- [ ] `npx playwright test test/e2e/community.spec.js test/e2e/cm-ui.spec.js test/e2e/layout/community.spec.js test/e2e/layout/profile.spec.js` 통과 후 전체 `npx playwright test`
- [ ] `LAYOUT_SHOTS=1 npx playwright test test/e2e/layout/community.spec.js` 4폭+다크(guest·pro·empty·name-modal) Q1~Q9 → `개발산출물/결과/CMR-2.md`
- 미실행 명시 대상: 실제 서버의 공개 이름 7일 제한·금칙어(가짜 API만), 실기기 키보드/스크린리더

## 10. 금지

- 서버·API·DTO·`EpisodeShareDialog`·`ProfilePage` 수정, 자동 게시/자동 재시도, 클릭만으로 동의·결제 요청.
- `CoverArt`·`FolderCard`·`FolderSheet`·빠른 추가(CMR-3), 좋아요·녹음 재생(CMR-4).
- 새 의존성, JSX 인라인 style, `HomePage.*` 수정, 기존 번역 키 값 변경·삭제(`.nameBanner` CSS 삭제는 허용).

## 11. 구현 중 보정 (2026-11-11, 시니어 구현)

- §5 키 이름: `test/i18n.test.js` 키 형식 규칙(`/^[a-z]+(\.[a-z][A-Za-z]*)+$/`, 숫자 금지) 때문에 `community.emptyStep1~3` → **`community.emptyStepPick`·`emptyStepCheck`·`emptyStepAgree`**(값 동일). 위 표는 치환 반영.
- §7 CTA 클래스: 전역 `cta` 클래스는 CSS에 정의가 없다(`git grep "^\.cta"` 0줄) → 강한 필 버튼은 전역 `pillBtn`(`styles/tokens.css`, 높이 48px) 사용. 빈 상태 CTA는 명세대로 `ghostBtn`.
- §7 배치 약속: `communityIntro:center-y@768`은 `#communityIntroDesc`와 CTA 묶음 `div.introCta`(CTA+힌트)에 둔다. 행 정렬이 묶음 기준이라 `#communityShareCta` 단독에 두면 힌트 높이만큼 어긋난다.
- §3 모달 DOM: `#communityNameModalClose`는 카드 우상단 절대 배치를 위해 `div.nameModalCard`의 마지막 자식(순서·id 동일). 배경 `#communityNameModal` 자체가 `role=dialog`이며 배경 클릭 = 닫기.
- §9 `git grep communityNameBanner` 0줄 항목: CMR2-4 테스트의 부재 단언(`toHaveCount(0)`) 1줄은 예외로 본다.
