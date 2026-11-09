// frontend/src/components/community/EpisodeLogCard.tsx
import React, { useState, useRef } from 'react';
import styles from './EpisodeLogCard.module.css';
import type { PublicEpisodeLogDto } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { computeEpisodeTitle, buildEpisodePracticeUrl } from '../../lib/episode.mts';
import { segText, fmtSec } from '../../lib/community.mts';
import { EpisodeReportDialog } from './EpisodeReportDialog';
import { t } from '../../lib/i18n.mts';

export interface EpisodeLogCardProps {
  post: PublicEpisodeLogDto;
  onPostGone?: (postId: string) => void;
}

export function EpisodeLogCard({ post, onPostGone }: EpisodeLogCardProps): React.ReactElement {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;
  const isMine = Boolean(currentUid && post.owner?.id === currentUid);

  const [partsOpen, setPartsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const reportBtnRef = useRef<HTMLButtonElement>(null);

  const displayTitle = computeEpisodeTitle(post);
  const playHref = buildEpisodePracticeUrl(post.videoId, post.a, post.b, post.rate);
  const saveHref = playHref; // 기존 플레이어 저장 동선으로 연결

  const thumbUrl = post.videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(post.videoId)}/mqdefault.jpg` : '';
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
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
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
              <a href={playHref} className={`ghost mini ${styles.actionBtn}`}>
                {t('episode.play')}
              </a>
              <a href={saveHref} className={`ghost mini ${styles.actionBtn}`}>
                {t('episode.saveViaPlayer')}
              </a>
              {!isMine && (
                <button
                  ref={reportBtnRef}
                  type="button"
                  className={`ghost mini ${styles.reportBtn}`}
                  disabled={reported}
                  onClick={() => setReportOpen(true)}
                >
                  {reported ? t('episode.reportedDone') : t('episode.report')}
                </button>
              )}
            </div>
          </div>
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
