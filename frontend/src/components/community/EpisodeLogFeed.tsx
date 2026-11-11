// frontend/src/components/community/EpisodeLogFeed.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './EpisodeLogFeed.module.css';
import { apiClient, type PublicEpisodeLogDto } from '../../lib/apiClient';
import { auth, useAuth } from '../../lib/auth';
import { EpisodeLogCard } from './EpisodeLogCard';
import { t } from '../../lib/i18n.mts';

export interface EpisodeLogFeedProps {
  initialScope?: 'all' | 'following';
  showScopeChips?: boolean;
  /** list = 세로 목록(기본), row = 가로 한 줄(첫 페이지만), masonry = 열 배치 + 더보기 */
  layout?: 'list' | 'row' | 'masonry';
  onStatusChange?: (status: 'loading' | 'error' | 'empty' | 'ready') => void;
}

/** matchMedia로 마소니 열 수 결정: ≥1150 → 3, ≥768 → 2, 그 외 1 */
function useColumnCount(enabled: boolean): number {
  const compute = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 1;
    if (window.matchMedia('(min-width: 1150px)').matches) return 3;
    if (window.matchMedia('(min-width: 768px)').matches) return 2;
    return 1;
  };
  const [cols, setCols] = useState<number>(compute);
  useEffect(() => {
    if (!enabled || typeof window.matchMedia !== 'function') return;
    const mqls = [window.matchMedia('(min-width: 1150px)'), window.matchMedia('(min-width: 768px)')];
    const update = () => setCols(compute());
    update();
    mqls.forEach((m) => m.addEventListener('change', update));
    return () => mqls.forEach((m) => m.removeEventListener('change', update));
  }, [enabled]);
  return enabled ? cols : 1;
}

export function EpisodeLogFeed({
  initialScope = 'all',
  showScopeChips = true,
  layout = 'list',
  onStatusChange,
}: EpisodeLogFeedProps): React.ReactElement {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;

  const [scope, setScope] = useState<'all' | 'following'>(initialScope);
  const [posts, setPosts] = useState<PublicEpisodeLogDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [moreError, setMoreError] = useState<string | null>(null);
  const moreBusy = useRef(false);
  const reqSeqRef = useRef(0);
  const cursorRef = useRef<string | null>(null);

  const fetchFirstPage = useCallback(
    async (targetScope: 'all' | 'following') => {
      const mySeq = ++reqSeqRef.current;
      const myUid = currentUid;

      moreBusy.current = false;
      setMoreLoading(false);
      setMoreError(null);
      setLoading(true);
      setErrorMsg(null);
      setPosts([]);
      setNextCursor(null);
      cursorRef.current = null;

      try {
        const res = await apiClient.community.episodeLogs(targetScope, null);
        if (mySeq !== reqSeqRef.current || myUid !== (auth.getUser()?.id || null)) return;

        setPosts(Array.isArray(res.posts) ? res.posts : []);
        setNextCursor(res.next);
        cursorRef.current = res.next;
      } catch (err: any) {
        if (mySeq !== reqSeqRef.current || myUid !== (auth.getUser()?.id || null)) return;
        setErrorMsg(err?.message || t('episode.err.generic'));
      } finally {
        if (mySeq === reqSeqRef.current && myUid === (auth.getUser()?.id || null)) {
          setLoading(false);
        }
      }
    },
    [currentUid, authState.user?.id]
  );

  const fetchMore = useCallback(async () => {
    const currentCursor = cursorRef.current;
    if (!currentCursor || moreBusy.current || loading) return;

    const mySeq = ++reqSeqRef.current;
    const myUid = currentUid;

    moreBusy.current = true;
    setMoreError(null);
    setMoreLoading(true);

    try {
      const res = await apiClient.community.episodeLogs(scope, currentCursor);
      if (mySeq !== reqSeqRef.current || myUid !== (auth.getUser()?.id || null)) return;

      const newPosts = Array.isArray(res.posts) ? res.posts : [];
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.postId));
        const filtered = newPosts.filter((p) => {
          if (existingIds.has(p.postId)) return false;
          existingIds.add(p.postId);
          return true;
        });
        return [...prev, ...filtered];
      });
      setNextCursor(res.next);
      cursorRef.current = res.next;
    } catch (err: any) {
      if (mySeq !== reqSeqRef.current || myUid !== (auth.getUser()?.id || null)) return;
      setMoreError(err?.message || t('episode.err.generic'));
      // 더보기 실패 시 기존 목록 유지
    } finally {
      if (mySeq === reqSeqRef.current && myUid === (auth.getUser()?.id || null)) {
        moreBusy.current = false;
        setMoreLoading(false);
      }
    }
  }, [moreLoading, loading, scope, currentUid, authState.user?.id]);

  // scope 또는 사용자 변경 시 첫 페이지 조회
  useEffect(() => {
    fetchFirstPage(scope);
    return () => { reqSeqRef.current++; };
  }, [scope, fetchFirstPage]);

  const status: 'loading' | 'error' | 'empty' | 'ready' = loading
    ? 'loading'
    : errorMsg
      ? 'error'
      : posts.length > 0
        ? 'ready'
        : 'empty';
  // 부모 콜백은 안정적이지 않을 수 있어 ref로 최신 값을 보관한다
  const statusCbRef = useRef(onStatusChange);
  statusCbRef.current = onStatusChange;
  useEffect(() => { statusCbRef.current?.(status); }, [status]);

  const cols = useColumnCount(layout === 'masonry');
  const columns = layout === 'masonry'
    ? Array.from({ length: cols }, (_, c) => posts.filter((_, i) => i % cols === c))
    : [];

  const handlePostGone = (gonePostId: string) => {
    setPosts((prev) => prev.filter((p) => p.postId !== gonePostId));
    void fetchFirstPage(scope);
  };

  return (
    <div className={styles.feedContainer} id="episodeFeed">
      {showScopeChips && layout !== 'row' && (
        <div className={styles.scopeRow} role="group" aria-label={t('episode.feedScopeLabel')}>
          <button
            type="button"
            id="episodeScopeAll"
            className={`${styles.scopeBtn} ${scope === 'all' ? styles.scopeBtnOn : ''}`}
            aria-pressed={scope === 'all'}
            data-align-group="scope:center-y"
            onClick={() => setScope('all')}
          >
            {t('episode.scopeAllFeed')}
          </button>
          <button
            type="button"
            id="episodeScopeFollowing"
            className={`${styles.scopeBtn} ${scope === 'following' ? styles.scopeBtnOn : ''}`}
            aria-pressed={scope === 'following'}
            data-align-group="scope:center-y"
            onClick={() => setScope('following')}
          >
            {t('episode.scopeFollowingFeed')}
          </button>
        </div>
      )}

      {loading && (
        <div id="episodeLoading" className={styles.loadingBox} aria-busy="true">
          <p>{t('episode.loading')}</p>
        </div>
      )}

      {!loading && errorMsg && (
        <div id="episodeError" className={styles.errorBox} role="alert">
          <p>{errorMsg}</p>
          <button
            type="button"
            className="ghost mini"
            onClick={() => fetchFirstPage(scope)}
          >
            {t('episode.retry')}
          </button>
        </div>
      )}

      {!loading && !errorMsg && posts.length === 0 && layout !== 'row' && (
        <div id="episodeEmpty" className={styles.emptyBox}>
          <p>{scope === 'following' ? t('episode.emptyFollowing') : t('episode.emptyAll')}</p>
          {scope === 'following' ? (
            <button type="button" className="ghost mini" onClick={() => setScope('all')}>
              {t('episode.scopeAllFeed')}
            </button>
          ) : (
            <a href="log.html">{t('nav.trails')}</a>
          )}
        </div>
      )}

      {!loading && !errorMsg && posts.length > 0 && layout === 'row' && (
        <div className={styles.postsRow}>
          {posts.map((post) => (
            <div key={post.postId} className={styles.postsRowItem} data-align-group="postsRow:top">
              <EpisodeLogCard post={post} onPostGone={handlePostGone} />
            </div>
          ))}
        </div>
      )}

      {!loading && !errorMsg && posts.length > 0 && layout !== 'row' && (
        <div className={styles.postsList}>
          {layout === 'masonry'
            ? (
              <div className={styles.postsMasonry}>
                {columns.map((col, c) => (
                  <div key={c} className={styles.masonryCol} data-align-group="logsColumns:top@768">
                    {col.map((post) => (
                      <EpisodeLogCard key={post.postId} post={post} onPostGone={handlePostGone} />
                    ))}
                  </div>
                ))}
              </div>
            )
            : posts.map((post) => (
                <EpisodeLogCard key={post.postId} post={post} onPostGone={handlePostGone} />
              ))}

          {nextCursor && (
            <div className={styles.moreRow}>
              {moreError && <p id="episodeMoreError" role="alert">{moreError}</p>}
              <button
                type="button"
                id="episodeMore"
                className={`ghost ${styles.moreBtn}`}
                disabled={moreLoading}
                onClick={fetchMore}
              >
                {moreLoading ? t('episode.loading') : t('episode.more')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
