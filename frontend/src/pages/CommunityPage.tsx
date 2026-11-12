// frontend/src/pages/CommunityPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './CommunityPage.module.css';
import { AppShell } from '../components/layout/AppShell';
import { useAuth, auth } from '../lib/auth';
import { apiClient, type PracticeLogDto } from '../lib/apiClient';
import { communityErrorKey } from '../lib/community.mts';
import { t } from '../lib/i18n.mts';
import { CurationRows } from '../components/community/CurationRows';
import { MySharesPanel } from '../components/community/MySharesPanel';
import { PublicNameModal } from '../components/community/PublicNameModal';
import { LogCard } from '../components/community/CommunityParts';
import { EpisodeLogFeed } from '../components/community/EpisodeLogFeed';

type CommunityTab = 'all' | 'logs' | 'summary' | 'my-shares';

// CMR-2 D6·D7: 이름 모달 건너뛰기 기억 (계정별, sessionStorage 예외는 "기억 안 됨")
type NameGate = { reason: 'first' | 'share'; pending: 'navigate' | null; returnFocus: HTMLElement | null } | null;
const skipKey = (uid: string) => `ulp:community-name-skip:${uid}`;
function readSkip(uid: string): boolean {
  try { return sessionStorage.getItem(skipKey(uid)) === '1'; } catch { return false; }
}
function writeSkip(uid: string): void {
  try { sessionStorage.setItem(skipKey(uid), '1'); } catch { /* 기억 안 됨: 다음 진입에 다시 연다 */ }
}
const SHARE_HREF = 'log.html';

function parseTabFromHash(): CommunityTab {
  if (typeof window === 'undefined') return 'all';
  const h = window.location.hash.toLowerCase();
  if (h === '#logs' || h === '#log') return 'logs';
  if (h === '#summary') return 'summary';
  if (h === '#my-shares') return 'my-shares';
  return 'all';
}

export function CommunityPage(): React.ReactElement {
  const state = useAuth();
  return <OwnedCommunityPage key={state.user?.id ?? 'guest'} />;
}

function OwnedCommunityPage(): React.ReactElement {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;

  const [activeTab, setActiveTab] = useState<CommunityTab>(() => parseTabFromHash());

  // 84일 집계 (summary) 상태
  const [summaryScope, setSummaryScope] = useState<'all' | 'following'>('all');
  const [summaryLogs, setSummaryLogs] = useState<PracticeLogDto[] | null>(null);
  const [summaryNext, setSummaryNext] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const summarySeq = useRef(0);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [profilePending, setProfilePending] = useState(!authState.me);
  useEffect(() => {
    if (!currentUid || authState.me) return;
    let alive = true;
    setProfilePending(true);
    void auth.fetchMe().finally(() => { if (alive) setProfilePending(false); });
    return () => { alive = false; };
  }, [currentUid, authState.me?.id, profileAttempt]);

  const [postsStatus, setPostsStatus] = useState<'loading' | 'error' | 'empty' | 'ready'>('loading');

  // CMR-2: 이름 모달·공유 가드 (명세 D2·D3·D6~D10)
  const readyMe = currentUid && authState.me && authState.me.id === currentUid ? authState.me : null;
  const hasName = Boolean(readyMe?.publicName);
  const [gate, setGate] = useState<NameGate>(null);
  useEffect(() => {
    if (!currentUid || !readyMe || readyMe.publicName || readSkip(currentUid)) return;
    setGate((g) => g ?? {
      reason: 'first', pending: null,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  }, [currentUid, readyMe?.id, readyMe?.publicName]);

  // 모달이 떠 있거나, 프로필 준비 전이거나, 같은 커밋에서 첫 모달이 열릴 조건이면 true(자식 effect가 부모보다 먼저 돈다)
  const nameGatePending = Boolean(gate) || !readyMe
    || (!readyMe.publicName && !(currentUid && readSkip(currentUid)));

  const openShareGate = (pending: 'navigate' | null, returnFocus: HTMLElement | null) =>
    setGate({ reason: 'share', pending, returnFocus });
  const onShareClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasName) return;
    e.preventDefault();
    openShareGate('navigate', e.currentTarget);
  };
  const requireName = () => {
    if (auth.getMe()?.publicName) return true;
    openShareGate(null, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return false;
  };
  const dismissGate = () => {
    if (currentUid) writeSkip(currentUid);
    const focus = gate?.returnFocus ?? null;
    setGate(null);
    focus?.focus();
  };
  const onNameSaved = () => {
    const pending = gate?.pending ?? null;
    const focus = gate?.returnFocus ?? null;
    setGate(null);
    if (pending === 'navigate') window.location.assign(SHARE_HREF);
    else focus?.focus();
  };

  // hashchange 이벤트 감지
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(parseTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const switchTab = (tab: CommunityTab) => {
    setActiveTab(tab);
    if (tab === 'all') {
      window.location.hash = '#all';
    } else {
      window.location.hash = `#${tab}`;
    }
  };

  // 84일 연습 집계 조회 (summary 탭일 때만)
  useEffect(() => {
    if (activeTab !== 'summary' || !currentUid) return;
    setSummaryLogs(null);
    setSummaryNext(null);

    const mySeq = ++summarySeq.current;
    const uid = currentUid;
    setSummaryLoading(true);
    setSummaryErr(null);

    apiClient.community
      .logs(summaryScope, null)
      .then((res) => {
        if (mySeq !== summarySeq.current || uid !== auth.getUser()?.id) return;
        setSummaryLogs(Array.isArray(res?.logs) ? res.logs : []);
        setSummaryNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (mySeq !== summarySeq.current || uid !== auth.getUser()?.id) return;
        setSummaryLogs([]);
        setSummaryNext(null);
        setSummaryErr(communityErrorKey(e));
      })
      .finally(() => {
        if (mySeq === summarySeq.current && uid === auth.getUser()?.id) {
          setSummaryLoading(false);
        }
      });
    return () => { summarySeq.current++; };
  }, [activeTab, summaryScope, currentUid]);

  const loadMoreSummary = () => {
    if (!summaryNext || summaryLoading || !currentUid) return;
    const mySeq = ++summarySeq.current;
    const uid = currentUid;
    setSummaryLoading(true);

    apiClient.community
      .logs(summaryScope, summaryNext)
      .then((res) => {
        if (mySeq !== summarySeq.current || uid !== auth.getUser()?.id) return;
        const incoming = Array.isArray(res?.logs) ? res.logs : [];
        setSummaryLogs((prev) => (prev ? [...prev, ...incoming] : incoming));
        setSummaryNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (mySeq !== summarySeq.current || uid !== auth.getUser()?.id) return;
        setSummaryErr(communityErrorKey(e));
      })
      .finally(() => {
        if (mySeq === summarySeq.current && uid === auth.getUser()?.id) {
          setSummaryLoading(false);
        }
      });
  };

  return (
    <AppShell activeNav="community">
      <div className={styles.container} id="communityPage">
        <header className={styles.header} id="communityHeader">
          <h1 className={styles.title} id="communityTitle">
            {t('episode.heading')}
          </h1>
        </header>

        {/* CMR-2 D1·D2: 소개 + 내 연습 공유하기 (모든 상태에서 탭보다 먼저) */}
        <section className={styles.intro} id="communityIntro">
          <p className={styles.introDesc} id="communityIntroDesc" data-align-group="communityIntro:center-y@768">
            {t('community.introDesc')}
          </p>
          {readyMe ? (
            <div className={styles.introCta} data-align-group="communityIntro:center-y@768">
              <a href={SHARE_HREF} id="communityShareCta" className={`pillBtn ${styles.shareCta}`} onClick={onShareClick}>
                {t('community.shareCta')}
              </a>
              <p className={styles.introHint} id="communityShareHint">{t('community.shareCtaHint')}</p>
            </div>
          ) : null}
        </section>

        {/* 비로그인 화면 */}
        {!authState.user ? (
          <div className={`card ${styles.guestCard}`} id="communityGuest">
            <h2 className={styles.guestTitle}>{t('nav.community')}</h2>
            <p className={styles.guestDesc}>{t('community.guestDesc')}</p>
            <div className={styles.guestActions}>
              <a href="settings.html#account" className={`cta ${styles.guestLoginBtn}`}>
                {t('nav.login')}
              </a>
            </div>
          </div>
        ) : !authState.me ? (
          <div id={profilePending ? 'communityLoading' : 'communityError'} role={profilePending ? 'status' : 'alert'}>
            <p>{t(profilePending ? 'episode.loading' : 'episode.err.generic')}</p>
            {!profilePending && <button type="button" className="ghost mini" onClick={() => setProfileAttempt((n) => n + 1)}>{t('episode.retry')}</button>}
          </div>
        ) : (
          <>
            {/* 탭 네비게이션 */}
            <div className={styles.chipRow} role="tablist" aria-label={t('community.tabAria')}>
              <button
                type="button"
                id="chipAll"
                className={`${styles.chipBtn} ${activeTab === 'all' ? styles.chipBtnOn : ''}`}
                role="tab"
                aria-selected={activeTab === 'all'}
                aria-pressed={activeTab === 'all'}
                data-align-group="chips:center-y"
                onClick={() => switchTab('all')}
              >
                {t('community.chipAll')}
              </button>
              <button
                type="button"
                id="chipLog"
                className={`${styles.chipBtn} ${activeTab === 'logs' ? styles.chipBtnOn : ''}`}
                role="tab"
                aria-selected={activeTab === 'logs'}
                aria-pressed={activeTab === 'logs'}
                data-align-group="chips:center-y"
                onClick={() => switchTab('logs')}
              >
                {t('community.chipLog')}
              </button>

              <div className={styles.auxLinks}>
                <a
                  href="#summary"
                  id="chipSummary"
                  className={`${styles.auxLink} ${activeTab === 'summary' ? styles.auxLinkOn : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    switchTab('summary');
                  }}
                >
                  {t('community.summaryLink')}
                </a>
                <a
                  href="#my-shares"
                  id="chipMyShares"
                  className={`${styles.auxLink} ${activeTab === 'my-shares' ? styles.auxLinkOn : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    switchTab('my-shares');
                  }}
                >
                  {t('community.mySharesLink')}
                </a>
              </div>
            </div>

            {/* [모두 탭] 선반: 팔로잉 → 이달의 곡 → 새 연습 게시물 → 큐레이션 → 쇼케이스 */}
            {activeTab === 'all' && (
              <div className={styles.tabContent}>
                <CurationRows
                  variant="community"
                  me={authState.me}
                  deferDeepLink={nameGatePending}
                  postsEmpty={postsStatus === 'empty'}
                  emptyExtra={
                    <>
                      <ol id="communityEmptySteps" className={styles.emptySteps}>
                        <li>{t('community.emptyStepPick')}</li>
                        <li>{t('community.emptyStepCheck')}</li>
                        <li>{t('community.emptyStepAgree')}</li>
                      </ol>
                      <a href={SHARE_HREF} id="communityEmptyShareCta" className={`ghostBtn ${styles.emptyShareCta}`} onClick={onShareClick}>
                        {t('community.shareCta')}
                      </a>
                    </>
                  }
                  postsSlot={
                    <section
                      id="communityPostsRow"
                      className={styles.postsRow}
                      hidden={postsStatus === 'empty'}
                      aria-label={t('community.newPostsHeading')}
                    >
                      <div className={styles.postsHead}>
                        <h3 className={styles.postsTitle} data-align-group="postsHead:center-y">
                          {t('community.newPostsHeading')}
                        </h3>
                        <button
                          type="button"
                          id="communityPostsAll"
                          className={styles.postsAllBtn}
                          data-align-group="postsHead:center-y"
                          onClick={() => switchTab('logs')}
                        >
                          {t('community.showAllLogs')}
                        </button>
                      </div>
                      <EpisodeLogFeed
                        key={`${currentUid}:all`}
                        initialScope="all"
                        showScopeChips={false}
                        layout="row"
                        onStatusChange={setPostsStatus}
                      />
                    </section>
                  }
                />
              </div>
            )}

            {/* [LOGS 탭] 개별 세션 피드 (범위 칩 + 마소니) */}
            {activeTab === 'logs' && (
              <div className={styles.tabContent}>
                <EpisodeLogFeed key={`${currentUid}:logs`} initialScope="all" showScopeChips={true} layout="masonry" />
              </div>
            )}

            {/* [84일 집계 탭] */}
            {activeTab === 'summary' && (
              <div className={styles.tabContent} id="summaryPane">
                <h2 className={styles.sectionTitle}>{t('community.summaryTitle')}</h2>
                <div className={styles.summaryScopeRow} role="group" aria-label={t('community.summaryScopeAria')}>
                  <button
                    type="button"
                    id="logScopeAll"
                    className={`${styles.chipBtn} ${summaryScope === 'all' ? styles.chipBtnOn : ''}`}
                    aria-pressed={summaryScope === 'all'}
                    onClick={() => setSummaryScope('all')}
                  >
                    {t('community.scopeAll')}
                  </button>
                  <button
                    type="button"
                    id="logScopeFollowing"
                    className={`${styles.chipBtn} ${summaryScope === 'following' ? styles.chipBtnOn : ''}`}
                    aria-pressed={summaryScope === 'following'}
                    onClick={() => setSummaryScope('following')}
                  >
                    {t('community.scopeFollowing')}
                  </button>
                </div>

                {summaryErr && (
                  <p role="alert" className="msg err">
                    {t(summaryErr.key as any, summaryErr.vars)}
                  </p>
                )}

                {summaryLogs && summaryLogs.length === 0 && !summaryLoading && !summaryErr && (
                  <div className={styles.emptyBox}>
                    <p>{t('community.logEmpty')}</p>
                  </div>
                )}

                {summaryLogs && summaryLogs.length > 0 && (
                  <div className={styles.summaryList}>
                    {summaryLogs.map((l) => (
                      <LogCard key={l.user.id} log={l} />
                    ))}
                    {summaryNext && (
                      <div className={styles.moreRow}>
                        <button
                          type="button"
                          className="ghost mini"
                          disabled={summaryLoading}
                          onClick={loadMoreSummary}
                        >
                          {summaryLoading ? t('episode.loading') : t('discover.more')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* [내 공유 폴더 관리 탭] */}
            {activeTab === 'my-shares' && (
              <div className={styles.tabContent} id="mySharesTabPane">
                <MySharesPanel
                  me={authState.me}
                  requireName={requireName}
                  onRequireName={() => openShareGate(null, null)}
                />
              </div>
            )}
          </>
        )}

        {gate && readyMe ? (
          <PublicNameModal me={readyMe} reason={gate.reason} onDismiss={dismissGate} onSaved={onNameSaved} />
        ) : null}
      </div>
    </AppShell>
  );
}
export default CommunityPage;
