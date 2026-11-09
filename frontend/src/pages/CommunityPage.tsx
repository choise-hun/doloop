// frontend/src/pages/CommunityPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './CommunityPage.module.css';
import { AppShell } from '../components/layout/AppShell';
import { useAuth, auth } from '../lib/auth';
import { apiClient, type PublicFolderDto, type PracticeLogDto } from '../lib/apiClient';
import { communityErrorKey } from '../lib/community.mts';
import { t } from '../lib/i18n.mts';
import { CurationRows } from '../components/community/CurationRows';
import { MySharesPanel } from '../components/community/MySharesPanel';
import { PublicNameForm } from '../components/community/PublicNameForm';
import { LogCard } from '../components/community/CommunityParts';
import { EpisodeLogFeed } from '../components/community/EpisodeLogFeed';

type CommunityTab = 'all' | 'log' | 'summary' | 'my-shares';

function parseTabFromHash(): CommunityTab {
  if (typeof window === 'undefined') return 'all';
  const h = window.location.hash.toLowerCase();
  if (h === '#log') return 'log';
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

  const [recentFolders, setRecentFolders] = useState<PublicFolderDto[]>([]);
  const [recentNext, setRecentNext] = useState<string | null>(null);
  const [recentError, setRecentError] = useState(false);
  const [recentPending, setRecentPending] = useState(false);
  const [recentAttempt, setRecentAttempt] = useState(0);
  const recentSeq = useRef(0);
  const recentBusy = useRef(false);
  async function loadRecent(cursor: string | null = null) {
    if (!currentUid || !authState.me || recentBusy.current) return;
    const seq = ++recentSeq.current;
    const uid = currentUid;
    recentBusy.current = true;
    setRecentPending(true);
    setRecentError(false);
    try {
      const res = await apiClient.community.folders('recent', cursor);
      if (seq !== recentSeq.current || uid !== auth.getUser()?.id) return;
      setRecentFolders((prev) => cursor ? [...prev, ...res.folders.filter((f) => !prev.some((p) => p.id === f.id))] : res.folders);
      setRecentNext(res.next);
    } catch {
      if (seq === recentSeq.current && uid === auth.getUser()?.id) setRecentError(true);
    } finally {
      if (seq === recentSeq.current && uid === auth.getUser()?.id) {
        recentBusy.current = false;
        setRecentPending(false);
      }
    }
  }
  useEffect(() => {
    if (activeTab !== 'all' || !authState.me) return;
    recentBusy.current = false;
    setRecentFolders([]);
    setRecentNext(null);
    void loadRecent();
    return () => { recentSeq.current++; recentBusy.current = false; };
  }, [activeTab, currentUid, authState.me?.id, recentAttempt]);


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
                className={`${styles.chipBtn} ${activeTab === 'log' ? styles.chipBtnOn : ''}`}
                role="tab"
                aria-selected={activeTab === 'log'}
                aria-pressed={activeTab === 'log'}
                data-align-group="chips:center-y"
                onClick={() => switchTab('log')}
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

            {/* 공개 이름 폼 (이름이 아직 없을 때 배너 표시) */}
            {!authState.me?.publicName && (
              <div id="communityNameBanner" className={styles.nameBanner}>
                <p className={styles.bannerTitle}>{t('community.nameBanner')}</p>
                <PublicNameForm
                  me={authState.me}
                  inputId="communityBannerNameInput"
                  submitId="communityBannerNameSave"
                />
              </div>
            )}

            {/* [모두 탭] 큐레이션 + 새 게시물 피드 */}
            {activeTab === 'all' && (
              <div className={styles.tabContent}>
                <CurationRows variant="community" me={authState.me} recentFolders={recentFolders} recentNext={recentPending ? null : recentNext}
                  onLoadMoreRecent={() => void loadRecent(recentNext)}
                  onPatchRecent={(id, patch) => setRecentFolders((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f))} />
                {recentPending && <p role="status">{t('episode.loading')}</p>}
                {recentError && <div id="recentErrMsg" role="alert"><p>{t('episode.err.generic')}</p><button type="button" className="ghost mini" onClick={() => recentNext ? void loadRecent(recentNext) : setRecentAttempt((n) => n + 1)}>{t('episode.retry')}</button></div>}
                <section className={styles.feedSection} aria-label={t('community.newPostsHeading')}>
                  <h2 className={styles.sectionTitle}>{t('community.newPostsHeading')}</h2>
                  <EpisodeLogFeed key={`${currentUid}:all`} initialScope="all" showScopeChips={false} />
                </section>
              </div>
            )}

            {/* [LOG 탭] 개별 세션 피드 전용 (all/following 범위 선택) */}
            {activeTab === 'log' && (
              <div className={styles.tabContent}>
                <EpisodeLogFeed key={`${currentUid}:log`} initialScope="all" showScopeChips={true} />
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
                <MySharesPanel me={authState.me} />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
export default CommunityPage;
