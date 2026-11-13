// frontend/src/components/community/EpisodeLogCard.tsx
import React, { useState, useRef, useEffect } from 'react';
import styles from './EpisodeLogCard.module.css';
import type { PublicEpisodeLogDto } from '../../lib/apiClient';
import { thumb, videoIdFrom } from '../../lib/security';
import { auth, useAuth } from '../../lib/auth';
import { apiClient } from '../../lib/apiClient';
import { computeEpisodeTitle, buildEpisodePracticeUrl, classifyEpisodeError } from '../../lib/episode.mts';
import { segText, fmtSec } from '../../lib/community.mts';
import { EpisodeReportDialog } from './EpisodeReportDialog';
import { t } from '../../lib/i18n.mts';

export interface EpisodeLogCardProps {
  post: PublicEpisodeLogDto;
  onPostGone?: (postId: string) => void;
  onLikeChange?: (postId: string, liked: boolean, likeCount: number) => void;
}

export function EpisodeLogCard({ post, onPostGone, onLikeChange }: EpisodeLogCardProps): React.ReactElement {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;
  const isMine = Boolean(currentUid && post.owner?.id === currentUid);

  const [partsOpen, setPartsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const reportBtnRef = useRef<HTMLButtonElement>(null);

  // 좋아요: 낙관적 갱신 없이 응답 값으로만 반영한다. 언마운트·계정 전환·요청 번호 변경 시 늦은 응답은 버린다.
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const likeBusyRef = useRef(false);
  const likeSeqRef = useRef(0);
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; likeSeqRef.current++; };
  }, []);
  useEffect(() => {
    // 계정이 바뀌면 진행 중 요청을 무효화하고 상태를 비운다.
    likeSeqRef.current++;
    likeBusyRef.current = false;
    setLikeBusy(false);
    setLikeError(null);
  }, [currentUid]);

  const likedByMe = post.likedByMe === true;
  const likeCount = typeof post.likeCount === 'number' ? post.likeCount : 0;

  const handleLike = async () => {
    if (likeBusyRef.current) return;
    const mySeq = ++likeSeqRef.current;
    const myUid = auth.getUser()?.id || null;
    const target = !likedByMe;
    likeBusyRef.current = true;
    setLikeBusy(true);
    setLikeError(null);
    const isCurrent = () => aliveRef.current && mySeq === likeSeqRef.current && myUid === (auth.getUser()?.id || null);
    try {
      const res = await apiClient.community.setEpisodeLike(post.postId, target);
      if (!isCurrent()) return;
      if (typeof res?.liked !== 'boolean' || typeof res?.likeCount !== 'number') throw new Error('invalid like response');
      onLikeChange?.(post.postId, res.liked, res.likeCount);
    } catch (err: any) {
      if (!isCurrent()) return;
      if (classifyEpisodeError(err).type === 'not_found') {
        setLikeError(t('episode.err.gone'));
        onPostGone?.(post.postId);
      } else {
        setLikeError(t('episode.likeFailed'));
      }
    } finally {
      if (isCurrent()) { likeBusyRef.current = false; setLikeBusy(false); }
    }
  };

  const displayTitle = computeEpisodeTitle(post);
  const playHref = buildEpisodePracticeUrl(post.videoId, post.a, post.b, post.rate);
  const saveHref = playHref; // 기존 플레이어 저장 동선으로 연결

  const [thumbFailed, setThumbFailed] = useState(false);
  const validVideo = videoIdFrom(post.videoId);
  const thumbUrl = validVideo && !thumbFailed ? thumb(validVideo) : '';
  const segInfo = segText(post.a, post.b, post.rate);
  const coverage = typeof post.coveragePct === 'number' ? post.coveragePct : 0;
  const parts = Array.isArray(post.partStats) ? post.partStats : [];

  const timeFormatted = fmtSec(post.seconds);
  const publishDateStr = post.publishedAt ? post.publishedAt.split('T')[0] : post.date;

  return (
    <article
      className={`card ${styles.card}`}
      data-post-id={post.postId}
      aria-labelledby={`epTitle-${post.postId}`}
    >
      <div className={styles.body}>
        {/* 썸네일 */}
        <div
          className={styles.thumbWrap}
          data-align-group={`episodeHead-${post.postId}:top@768`}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className={styles.thumbImg}
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <div className={styles.thumbPlaceholder}>NO VIDEO</div>
          )}
        </div>

        {/* 본문 메타 */}
        <div className={styles.content}>
          <div
            className={styles.headRow}
            data-align-group={`episodeHead-${post.postId}:top@768`}
          >
            <h3 id={`epTitle-${post.postId}`} className={styles.title}>
              {displayTitle}
            </h3>
            <div className={styles.authorBadgeRow} aria-label={t('episode.aria.meta')}>
              <span className={styles.authorName}>{post.owner?.publicName || t('episode.authorDefault')}</span>
              {post.owner?.creatorBadge && (
                <span className={styles.creatorBadge}>{post.owner.creatorBadge}</span>
              )}
              {isMine && <span className={styles.mineBadge}>{t('episode.mineBadge')}</span>}
            </div>
          </div>

          {post.youtubeTitle && (
            <div className={styles.ytInfo}>
              <span className={styles.ytTitle}>{post.youtubeTitle}</span>
              {post.youtubeArtist && <span className={styles.ytArtist}> · {post.youtubeArtist}</span>}
            </div>
          )}

          {post.comment && <p className={styles.comment}>{post.comment}</p>}

          <div className={styles.metaRow}>
            <span>{post.date}</span>
            <span>·</span>
            <span>{timeFormatted}</span>
            <span>·</span>
            <span>{t('episode.loopsCount', { count: post.loops })}</span>
            {segInfo && (
              <>
                <span>·</span>
                <span>{segInfo}</span>
              </>
            )}
          </div>

          <div className={styles.coverageRow}>
            <div className={styles.coverageBarWrap}>
              <progress
                className={`${styles.coverageBar} ${coverage >= 100 ? styles.coverageComplete : ''}`}
                value={coverage}
                max={100}
                aria-label={t('episode.aria.coverage', { pct: coverage })}
              />
            </div>
            <span className={styles.coveragePct}>{coverage}%</span>
          </div>

          {parts.length > 0 && (
            <div className={styles.partsSection} aria-label={t('episode.aria.details')}>
              <button
                type="button"
                className={`ghost mini ${styles.partsToggleBtn}`}
                aria-expanded={partsOpen}
                aria-controls={`epParts-${post.postId}`}
                onClick={() => setPartsOpen((prev) => !prev)}
              >
                {partsOpen ? t('episode.partsFold') : t('episode.partsUnfold', { count: parts.length })}
              </button>
              {partsOpen && (
                <div id={`epParts-${post.postId}`} className={styles.partsList}>
                  {parts.map((p, idx) => (
                    <div key={idx} className={styles.partItem}>
                      <span className={styles.partName}>{p.name || t('episode.partEmpty')}</span>
                      <span className={styles.partStats}>
                        {segText(p.a, p.b, p.rate)} · {fmtSec(p.seconds)} · {t('episode.loopsUnit', { loops: p.loops })}
                        {p.completed ? ' ✓' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.footerRow}>
            <span className={styles.publishDate}>{publishDateStr}</span>
            <div className={styles.actions} aria-label={t('episode.aria.actions')}>
              <button
                type="button"
                className={`ghost mini ${styles.actionBtn} ${styles.likeBtn}`}
                data-episode-like
                data-align-group={`episodeActions-${post.postId}:center-y`}
                role="switch"
                aria-checked={likedByMe}
                disabled={likeBusy}
                onClick={handleLike}
              >
                {t('episode.like')} · {likeCount}
              </button>
              <a aria-disabled={!validVideo} href={validVideo ? playHref : undefined} className={`ghost mini ${styles.actionBtn}`} data-align-group={`episodeActions-${post.postId}:center-y`}>
                {t('episode.play')}
              </a>
              <a aria-disabled={!validVideo} href={validVideo ? saveHref : undefined} className={`ghost mini ${styles.actionBtn}`} data-align-group={`episodeActions-${post.postId}:center-y`}>
                {t('episode.saveViaPlayer')}
              </a>
              {!isMine && (
                <button
                  ref={reportBtnRef}
                  type="button"
                  className={`ghost mini ${styles.reportBtn}`}
                  data-align-group={`episodeActions-${post.postId}:center-y`}
                  disabled={reported}
                  onClick={() => setReportOpen(true)}
                >
                  {reported ? t('episode.reportedDone') : t('episode.report')}
                </button>
              )}
            </div>
          </div>
          {likeError && (
            <p className={styles.likeErr} role="alert" data-episode-like-error>{likeError}</p>
          )}
        </div>
      </div>

      {reportOpen && (
        <EpisodeReportDialog
          postId={post.postId}
          triggerEl={reportBtnRef.current}
          onClose={() => setReportOpen(false)}
          onReported={() => setReported(true)}
          onPostGone={() => onPostGone?.(post.postId)}
        />
      )}
    </article>
  );
}
