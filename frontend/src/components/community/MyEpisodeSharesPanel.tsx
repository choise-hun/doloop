import React, { useEffect, useRef, useState } from 'react';
import { apiClient, type MyEpisodeLogDto } from '../../lib/apiClient';
import { auth, useAuth } from '../../lib/auth';
import { kstDate } from '../../lib/community.mts';
import { t, type I18nKey } from '../../lib/i18n.mts';
import { useEpisodeShares } from '../songRecord/useEpisodeShares';
import styles from '../../pages/ProfilePage.module.css';

export function MyEpisodeSharesPanel(): React.ReactElement {
  const state = useAuth();
  const identityNow = () => `${auth.getUser()?.id ?? ''}:${auth.getSessionGeneration()}`;
  const identity = `${state.user?.id ?? ''}:${auth.getSessionGeneration()}`;
  const { shares, loading, complete, error, invalidate, removeShare } = useEpisodeShares();
  const locks = useRef(new Map<string, AbortController>());
  const mounted = useRef(false);
  const [, renderBusy] = useState(0);
  const [message, setMessage] = useState<{ identity: string; key: I18nKey } | null>(null);
  const valid = () => mounted.current && identityNow() === identity;
  useEffect(() => {
    mounted.current = true;
    const cancel = () => { locks.current.forEach(controller => controller.abort()); locks.current.clear(); };
    const off = auth.onChange(() => { if (identityNow() !== identity) cancel(); });
    return () => { mounted.current = false; off(); cancel(); };
  }, [identity]);

  async function withdraw(post: MyEpisodeLogDto) {
    if (!valid() || locks.current.has(post.sessionId) || post.withdrawnAt) return;
    if (!window.confirm(t('episode.share.withdrawConfirm')) || !valid()) return;
    const controller = new AbortController();
    locks.current.set(post.sessionId, controller);
    renderBusy(n => n + 1);
    setMessage(null);
    const current = () => valid() && !controller.signal.aborted && locks.current.get(post.sessionId) === controller;
    try {
      const res = await apiClient.sessions.withdrawShare(post.sessionId, controller.signal);
      if (!current()) return;
      if (res?.ok !== true) {
        setMessage({ identity, key: 'episode.share.unknownResult' });
        invalidate();
      } else {
        removeShare(post.sessionId);
        setMessage({ identity, key: 'episode.share.withdrawn' });
      }
    } catch (e) {
      if (!current()) return;
      const gone = e && typeof e === 'object' && 'status' in e && e.status === 404;
      setMessage({ identity, key: gone ? 'episode.err.gone' : 'episode.share.withdrawFailed' });
      invalidate();
    } finally {
      if (current()) { locks.current.delete(post.sessionId); renderBusy(n => n + 1); }
    }
  }

  return <section id="profileEpisodes" className={styles.accountCard}
    data-align-group="profileCol:left; profileEdges:right" aria-labelledby="profileEpisodesTitle">
    <h2 id="profileEpisodesTitle">{t('episode.mineBadge')}</h2>
    <p>{t('community.newPostsHeading')}</p>
    {error || loading || (complete && !shares.size) ? <p id="profileEpisodesStatus" role={error ? 'alert' : 'status'}
      aria-live="polite">{error || t(loading ? 'episode.loading' : 'episode.emptyAll')}</p> : null}
    {error || [...shares.values()].some(post => !['published', 'tier_paused', 'moderation_hidden'].includes(post.status)) ?
      <button id="profileEpisodesRetry" type="button" className="ghostBtn" disabled={loading || locks.current.size > 0}
        onClick={invalidate}>{t('episode.retry')}</button> : null}
    {[...shares.values()].map(post => {
      const hidden = Boolean(post.hiddenAt || post.status === 'moderation_hidden');
      const paused = Boolean(post.tierPausedAt || post.status === 'tier_paused');
      const known = hidden || paused || post.status === 'published';
      const key = hidden ? 'episode.share.hidden' : post.withdrawnAt ? 'episode.share.withdrawn' :
        paused ? 'episode.share.paused' : known ? 'episode.share.published' : 'episode.share.unknownResult';
      const busy = locks.current.has(post.sessionId);
      return <article key={post.postId} data-profile-post={post.postId} className={styles.episodeRow}>
        <h3>{!post.withdrawnAt && post.title ? post.title : t('episode.defaultTitle')}</h3>
        <time dateTime={post.publishedAt}>{kstDate(post.publishedAt)}</time>
        {!post.withdrawnAt && post.comment ? <p>{post.comment}</p> : null}
        <p>{t(key)}</p>
        {hidden && post.hiddenReason ? <p>{t('episode.share.reasonPrefix', { reason: post.hiddenReason })}</p> : null}
        <div className={styles.episodeActions}>
          {!post.withdrawnAt && known ? <button type="button" className="ghostBtn" data-profile-withdraw={post.sessionId}
            disabled={busy} aria-busy={busy} onClick={() => void withdraw(post)}>{t('episode.share.withdraw')}</button> : null}
        </div>
      </article>;
    })}
    <p id="profileEpisodesMsg" role="status" aria-live="polite">{message?.identity === identity ? t(message.key) : ''}</p>
    <div className={styles.episodeActions}>
      <a id="profileTrailsLink" className="ghostBtn" href="log.html">{t('nav.trails')}</a>
      <a id="profileCommunityLink" className="ghostBtn" href="community.html#my-shares">{t('nav.community')}</a>
    </div>
  </section>;
}
