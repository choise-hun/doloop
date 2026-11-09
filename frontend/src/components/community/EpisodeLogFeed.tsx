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
}

export function EpisodeLogFeed({
  initialScope = 'all',
  showScopeChips = true,
}: EpisodeLogFeedProps): React.ReactElement {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;

  const [scope, setScope] = useState<'all' | 'following'>(initialScope);
  const [posts, setPosts] = useState<PublicEpisodeLogDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const handlePostGone = (gonePostId: string) => {
    setPosts((prev) => prev.filter((p) => p.postId !== gonePostId));
    void fetchFirstPage(scope);
  };

  return (
    <div className={styles.feedContainer} id="episodeFeed">
      {showScopeChips && (
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

      {!loading && !errorMsg && posts.length === 0 && (
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

      {!loading && !errorMsg && posts.length > 0 && (
        <div className={styles.postsList}>
          {posts.map((post) => (
            <EpisodeLogCard
              key={post.postId}
              post={post}
              onPostGone={handlePostGone}
            />
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
