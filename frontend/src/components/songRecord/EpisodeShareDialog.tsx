// frontend/src/components/songRecord/EpisodeShareDialog.tsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './EpisodeShareDialog.module.css';
import { apiClient, type MyEpisodeLogDto } from '../../lib/apiClient';
import {
  type PracticeSessionCardModel,
  validateEpisodeText,
  countCodePoints,
  computeEpisodeTitle,
  classifyEpisodeError,
} from '../../lib/episode.mts';
import { t } from '../../lib/i18n.mts';

export interface EpisodeShareDialogProps {
  session: PracticeSessionCardModel;
  existingShare?: MyEpisodeLogDto | null;
  triggerEl?: HTMLElement | null;
  onClose: () => void;
  onSuccess: (post: MyEpisodeLogDto) => void;
}

export function EpisodeShareDialog({
  session,
  existingShare,
  triggerEl,
  onClose,
  onSuccess,
}: EpisodeShareDialogProps): React.ReactElement {
  const [title, setTitle] = useState(existingShare?.title || '');
  const [comment, setComment] = useState(existingShare?.comment || '');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 초기 포커스
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // Escape 키 및 Tab 순환
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!submitting) {
          e.preventDefault();
          onClose();
          triggerEl?.focus();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onClose, triggerEl]);

  const previewTitle = computeEpisodeTitle({
    title,
    youtubeTitle: session.songTitle || undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!consent) {
      setErrorMsg(t('episode.share.consent'));
      return;
    }

    let cleanTitle = '';
    let cleanComment = '';
    try {
      if (title.trim()) {
        cleanTitle = validateEpisodeText(title, 80, false);
      }
      if (comment.trim()) {
        cleanComment = validateEpisodeText(comment, 500, true);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('episode.err.invalid'));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.sessions.share(session.sessionId, {
        title: cleanTitle,
        comment: cleanComment,
      });
      if (res?.post) {
        onSuccess(res.post);
        onClose();
        triggerEl?.focus();
      } else {
        setErrorMsg(t('episode.share.unknownResult'));
      }
    } catch (err: any) {
      const classified = classifyEpisodeError(err);
      if (classified.type === 'banned') {
        if (classified.field === 'title') setErrorMsg(t('episode.err.bannedTitle'));
        else if (classified.field === 'comment') setErrorMsg(t('episode.err.bannedComment'));
        else if (classified.field?.includes('part')) setErrorMsg(t('episode.err.bannedPart'));
        else setErrorMsg(classified.message);
      } else if (classified.type === 'tier_upgrade') {
        setErrorMsg(classified.message);
      } else if (classified.type === 'public_name_required') {
        setErrorMsg(classified.message);
      } else if (classified.type === 'moderation_hidden') {
        setErrorMsg(t('episode.err.hidden'));
      } else if (classified.type === 'not_shareable') {
        setErrorMsg(t('episode.err.session'));
      } else {
        setErrorMsg(classified.message || t('episode.err.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titleCp = countCodePoints(title);
  const commentCp = countCodePoints(comment);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
          triggerEl?.focus();
        }
      }}
    >
      <div
        ref={dialogRef}
        id="episodeShareDialog"
        className={`card ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episodeShareDialogTitle"
      >
        <div className={styles.head}>
          <h2 id="episodeShareDialogTitle" className={styles.title}>
            {existingShare ? t('episode.share.edit') : t('episode.share.title')}
          </h2>
          <button
            type="button"
            className={`ghost mini ${styles.closeBtn}`}
            disabled={submitting}
            onClick={() => {
              onClose();
              triggerEl?.focus();
            }}
            aria-label={t('episode.share.cancel')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="shareTitleInput">{t('episode.share.titleLabel')}</label>
              <span className={styles.charCount}>{titleCp}/80</span>
            </div>
            <input
              ref={titleInputRef}
              id="shareTitleInput"
              type="text"
              className="inpField"
              value={title}
              placeholder={session.songTitle ? t('episode.titleWithVideo', { title: session.songTitle }) : t('episode.defaultTitle')}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="shareCommentInput">{t('episode.share.commentLabel')}</label>
              <span className={styles.charCount}>{commentCp}/500</span>
            </div>
            <textarea
              id="shareCommentInput"
              className="inpField"
              rows={3}
              value={comment}
              placeholder={t('episode.commentPlaceholder')}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.previewBox}>
            <div className={styles.previewLabel}>{t('episode.previewTitleLabel')}</div>
            <div className={styles.previewValue}>
              {previewTitle || t('episode.share.unavailablePreview')}
            </div>
            <div className={styles.noticeText}>
              <p>{t('episode.share.publicScope')}</p>
              <p className={styles.snapshotNotice}>{t('episode.share.snapshotNotice')}</p>
            </div>
          </div>

          <div className={styles.consentRow}>
            <label className={styles.consentLabel}>
              <input
                id="shareConsentCheckbox"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={submitting}
              />
              <span>{t('episode.share.consent')}</span>
            </label>
          </div>

          {errorMsg && (
            <div className={styles.errorAlert} role="alert" aria-live="assertive">
              {errorMsg}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={`ghost ${styles.cancelBtn}`}
              disabled={submitting}
              onClick={() => {
                onClose();
                triggerEl?.focus();
              }}
            >
              {t('episode.share.cancel')}
            </button>
            <button
              type="submit"
              className={`cta ${styles.submitBtn}`}
              disabled={submitting || !consent}
            >
              {submitting
                ? t('episode.saving')
                : existingShare
                  ? t('episode.share.republish')
                  : t('episode.share.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
