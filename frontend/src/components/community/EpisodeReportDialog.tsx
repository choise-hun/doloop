// frontend/src/components/community/EpisodeReportDialog.tsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './EpisodeReportDialog.module.css';
import { auth, useAuth } from '../../lib/auth';
import { apiClient } from '../../lib/apiClient';
import { validateEpisodeText, countCodePoints, classifyEpisodeError } from '../../lib/episode.mts';
import { t } from '../../lib/i18n.mts';

export interface EpisodeReportDialogProps {
  postId: string;
  triggerEl?: HTMLElement | null;
  onClose: () => void;
  onReported?: (reportId: string) => void;
  onPostGone?: () => void;
}

const REASONS: Array<{ value: 'spam' | 'inappropriate' | 'copyright' | 'other'; labelKey: any }> = [
  { value: 'spam', labelKey: 'episode.report.spam' },
  { value: 'inappropriate', labelKey: 'episode.report.inappropriate' },
  { value: 'copyright', labelKey: 'episode.report.copyright' },
  { value: 'other', labelKey: 'episode.report.other' },
];

export function EpisodeReportDialog({
  postId,
  triggerEl,
  onClose,
  onReported,
  onPostGone,
}: EpisodeReportDialogProps): React.ReactElement {
  const [reason, setReason] = useState<'spam' | 'inappropriate' | 'copyright' | 'other'>('spam');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authState = useAuth();
  const ownerUid = authState.user?.id;
  const alive = useRef(false);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const isCurrent = () => alive.current && ownerUid === auth.getUser()?.id;

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRadioRef.current?.focus();
  }, []);

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
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || !isCurrent() || statusMsg?.type === 'success') return;

    let cleanDetail = '';
    try {
      cleanDetail = validateEpisodeText(detail, 500, true);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: t('episode.err.invalid') });
      return;
    }

    busy.current = true;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await apiClient.community.reportEpisode(postId, {
        reason,
        detail: cleanDetail,
      });
      if (!isCurrent()) return;
      if (!res?.reportId) throw new Error(t('episode.share.unknownResult'));
      setStatusMsg({ type: 'success', text: t('episode.report.success') });
      if (res?.reportId && onReported) {
        onReported(res.reportId);
      }

    } catch (err: any) {
      if (!isCurrent()) return;
      const classified = classifyEpisodeError(err);
      if (classified.type === 'already_reported') {
        setStatusMsg({ type: 'error', text: t('episode.report.already') });
      } else if (classified.type === 'not_found') {
        setStatusMsg({ type: 'error', text: t('episode.err.gone') });
        onPostGone?.();
      } else if (classified.type === 'self_report') {
        setStatusMsg({ type: 'error', text: t('episode.err.self') });
      } else {
        setStatusMsg({ type: 'error', text: classified.message || t('episode.err.generic') });
      }
    } finally {
      if (isCurrent()) { busy.current = false; setSubmitting(false); }
    }
  };

  const detailCp = countCodePoints(detail);

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
        id="episodeReportDialog"
        className={`card ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episodeReportDialogTitle"
      >
        <div className={styles.head}>
          <h2 id="episodeReportDialogTitle" className={styles.title}>
            {t('episode.report.title')}
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
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t('episode.report.reason')}</legend>
            <div className={styles.radioGroup}>
              {REASONS.map((r, idx) => (
                <label key={r.value} className={styles.radioLabel}>
                  <input
                    ref={idx === 0 ? firstRadioRef : undefined}
                    type="radio"
                    name="reportReason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    disabled={submitting}
                  />
                  <span>{t(r.labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="reportDetailInput">{t('episode.report.detail')}</label>
              <span className={styles.charCount}>{detailCp}/500</span>
            </div>
            <textarea
              id="reportDetailInput"
              aria-describedby={statusMsg?.type === 'error' ? "episodeReportError" : undefined}
              className="inpField"
              rows={3}
              value={detail}
              placeholder={t('episode.reportDetailPlaceholder')}
              onChange={(e) => setDetail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <p className={styles.privacyNotice}>{t('episode.report.privacy')}</p>

          {statusMsg && (
            <div
              id={statusMsg.type === 'error' ? 'episodeReportError' : undefined}
              className={statusMsg.type === 'error' ? styles.errorAlert : styles.successAlert}
              role={statusMsg.type === 'error' ? 'alert' : 'status'}
              aria-live="assertive"
            >
              {statusMsg.text}
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
            <button type="submit" className={`cta ${styles.submitBtn}`} disabled={submitting || statusMsg?.type === 'success'}>
              {submitting ? t('episode.submitting') : t('episode.report.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
