// frontend/src/components/songRecord/EpisodeShareDialog.tsx
// S3b-3: 카드 미리보기 + 말풍선 코멘트 + 녹음 칩(D4~D11), 계정 단위 동의(D6), 경합 방어(D15).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './EpisodeShareDialog.module.css';
import { auth, useAuth } from '../../lib/auth';
import {
  apiClient,
  type MyEpisodeLogDto,
  type ShareAttachmentInput,
  type ShareConsentDto,
  type TakeDto,
} from '../../lib/apiClient';
import { drive } from '../../lib/drive';
import { safeAudioUrl, thumb } from '../../lib/security';
import { communityErrorKey, fmtSec, segText } from '../../lib/community.mts';
import {
  type PracticeSessionCardModel,
  validateEpisodeText,
  countCodePoints,
  formatEpisodeDate,
  classifyEpisodeError,
} from '../../lib/episode.mts';
import { t, type I18nKey } from '../../lib/i18n.mts';
import { ShareConsentStep } from './ShareConsentStep';

export interface EpisodeShareDialogProps {
  session: PracticeSessionCardModel;
  existingShare?: MyEpisodeLogDto | null;
  triggerEl?: HTMLElement | null;
  onClose: () => void;
  onSuccess: (post: MyEpisodeLogDto) => void;
  onRefresh?: () => void;
}

/** S3b-1 서버 상한과 같은 값(D7). 넘는 녹음은 칩을 비활성화한다. */
const MAX_ATTACH_SEC = 300;
const MAX_ATTACH_BYTES = 10485760;

export function isOverAttachLimit(take: Pick<TakeDto, 'durationSec' | 'sizeBytes'>): boolean {
  return Number(take.durationSec) > MAX_ATTACH_SEC || Number(take.sizeBytes) > MAX_ATTACH_BYTES;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'loading' | 'consent' | 'compose' | 'error';
type AttachMode = 'omit' | 'keep' | 'none' | 'replace';
type Op = { gen: number; signal: AbortSignal };

export function EpisodeShareDialog({
  session,
  existingShare,
  triggerEl,
  onClose,
  onSuccess,
  onRefresh,
}: EpisodeShareDialogProps): React.ReactElement {
  // 철회된 카드는 옛 글·첨부를 되살리지 않는다.
  const reuse = existingShare && !existingShare.withdrawnAt ? existingShare : null;
  const initialTakeId = reuse?.attachment?.sourceTakeId ?? null;

  const [title, setTitle] = useState(reuse?.title || '');
  const [comment, setComment] = useState(reuse?.comment || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(initialTakeId);
  const [originalConfirmed, setOriginalConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [consent, setConsent] = useState<ShareConsentDto | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const authState = useAuth();
  const ownerUid = authState.user?.id;
  const publicName = authState.me?.publicName || '';

  // D15: 창 하나의 수명 = 세대 번호 + AbortController. 닫기·계정 전환·언마운트에서 끊는다.
  const alive = useRef(false);
  const gen = useRef(0);
  const controller = useRef<AbortController>(new AbortController());
  const busy = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewSeq = useRef(0);
  const urlCache = useRef(new Map<string, string>());
  const objectUrls = useRef<string[]>([]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const agreeFocusRef = useRef<HTMLDivElement>(null);

  const stopAudio = () => {
    previewSeq.current++;
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    delete el.dataset.takeId;
  };

  const cancelAll = () => {
    gen.current++;
    controller.current.abort();
    controller.current = new AbortController();
  };

  useEffect(() => {
    alive.current = true;
    controller.current = new AbortController();
    const unsubscribe = auth.onChange((state) => {
      if ((state.user?.id ?? null) !== (ownerUid ?? null)) cancelAll();
    });
    return () => {
      alive.current = false;
      unsubscribe();
      cancelAll();
      stopAudio();
      for (const u of objectUrls.current) URL.revokeObjectURL(u);
      objectUrls.current = [];
      urlCache.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const op = (): Op => ({ gen: gen.current, signal: controller.current.signal });
  const live = (o: Op) => alive.current && o.gen === gen.current && !o.signal.aborted && ownerUid === auth.getUser()?.id;

  const close = () => {
    const inFlight = busy.current;
    cancelAll();
    stopAudio();
    setPreviewing(null);
    // 게시 요청이 이미 나갔다면 서버에서 확정됐을 수 있으니 상태를 다시 읽는다.
    if (inFlight) onRefresh?.();
    onClose();
    triggerEl?.focus();
  };

  const loadConsent = useCallback(async () => {
    const o = op();
    setPhase('loading');
    setErrorMsg(null);
    try {
      const c = await apiClient.community.shareConsent(o.signal);
      if (!live(o)) return;
      setConsent(c);
      setPhase(c.cardShareAllowed ? 'compose' : 'consent');
    } catch (err: any) {
      if (!live(o) || err?.name === 'AbortError') return;
      setErrorMsg(errorText(err) || t('episode.err.generic'));
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUid]);

  useEffect(() => { void loadConsent(); }, [loadConsent]);

  // 단계가 바뀌면 그 단계의 첫 입력으로 포커스를 옮긴다.
  useEffect(() => {
    if (phase === 'compose') commentRef.current?.focus();
    else if (phase === 'consent') agreeFocusRef.current?.querySelector<HTMLElement>('#shareConsentAgree')?.focus();
  }, [phase]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  // 말풍선 자동 높이
  useEffect(() => {
    const el = commentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [comment, phase]);

  // Escape 및 Tab 순환
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (scopeOpen) { setScopeOpen(false); return; }
        close();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled):not([hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleAgree = async () => {
    if (consentBusy || !consent) return;
    const o = op();
    setConsentBusy(true);
    setErrorMsg(null);
    try {
      const c = await apiClient.community.agreeShareConsent(consent.noticeVersion, o.signal);
      if (!live(o)) return;
      setConsent(c);
      if (c.cardShareAllowed) setPhase('compose');
    } catch (err: any) {
      if (!live(o) || err?.name === 'AbortError') return;
      if (err?.code === 'SHARE_NOTICE_OUTDATED') { void loadConsent(); return; }
      setErrorMsg(errorText(err) || t('episode.err.generic'));
    } finally {
      if (live(o)) setConsentBusy(false);
    }
  };

  const takes = session.takes || [];
  const selectedTake = takes.find((x) => x.id === selectedTakeId) || null;
  const mode: AttachMode =
    selectedTakeId === initialTakeId ? (initialTakeId ? 'keep' : 'omit') : selectedTakeId ? 'replace' : 'none';
  const anyOverLimit = takes.some(isOverAttachLimit);
  const recordingAllowed = Boolean(consent?.recordingAllowed);

  const selectChip = (takeId: string) => {
    setSelectedTakeId((cur) => (cur === takeId ? null : takeId));
    setOriginalConfirmed(false);
    setErrorMsg(null);
  };

  const togglePreview = async (take: TakeDto) => {
    if (previewing === take.id) {
      stopAudio();
      setPreviewing(null);
      return;
    }
    stopAudio();
    const seq = previewSeq.current;
    const o = op();
    const current = () => live(o) && seq === previewSeq.current;
    setPreviewing(take.id);
    try {
      let url = urlCache.current.get(take.id) || '';
      if (!url) {
        if (take.storage === 'drive') {
          const blobUrl = await drive.fetchMediaObjectUrl(take.storageKey);
          objectUrls.current.push(blobUrl);
          if (!current()) return;
          url = safeAudioUrl(blobUrl);
        } else {
          const r = await apiClient.takes.getUrl(take.id);
          if (!current()) return;
          url = r && r.url ? safeAudioUrl(r.url) : '';
        }
        if (!url) throw new Error(t('record.urlIssueFailed'));
        urlCache.current.set(take.id, url);
      }
      const el = audioRef.current;
      if (!current() || !el) return;
      el['src'] = url;
      el.dataset.takeId = take.id;
      await el.play();
    } catch (err: any) {
      if (!current()) return;
      setPreviewing(null);
      setErrorMsg((err && err.message) || t('record.playFailed'));
    }
  };

  const applyShareError = (err: any) => {
    const code = String(err?.code || '');
    const detail = err?.data?.detail || err?.detail || {};
    if (code === 'SHARE_CONSENT_REQUIRED') {
      if (detail.scope === 'recording') {
        setConsent((c) => (c ? { ...c, recordingAllowed: false } : c));
      } else {
        setConsent((c) => (c ? { ...c, cardShareAllowed: false } : c));
        setPhase('consent');
      }
      setErrorMsg(t('episode.err.consentRequired'));
      return;
    }
    if (code === 'SHARE_NOTICE_OUTDATED') {
      void loadConsent();
      return;
    }
    const mapped = errorText(err);
    if (mapped) {
      if (code === 'ATTACHMENT_SOURCE_GONE' || code === 'ATTACHMENT_COPY_EXPIRED') onRefresh?.();
      setErrorMsg(mapped);
      return;
    }
    if (!err?.status || err.status >= 500) {
      setErrorMsg(t('episode.share.unknownResult'));
      onRefresh?.();
      return;
    }
    const classified = classifyEpisodeError(err);
    if (['moderation_hidden', 'not_found', 'unauthorized'].includes(classified.type)) onRefresh?.();
    if (classified.type === 'banned') {
      if (classified.field === 'title') setErrorMsg(t('episode.err.bannedTitle'));
      else if (classified.field === 'comment') setErrorMsg(t('episode.err.bannedComment'));
      else if (classified.field?.includes('part')) setErrorMsg(t('episode.err.bannedPart'));
      else setErrorMsg(classified.message);
    } else if (classified.type === 'moderation_hidden') {
      setErrorMsg(t('episode.err.hidden'));
    } else if (classified.type === 'not_shareable') {
      setErrorMsg(t('episode.err.session'));
    } else {
      setErrorMsg(classified.message || t('episode.err.generic'));
    }
  };

  let validInput = true;
  try {
    validateEpisodeText(title, 80, false);
    validateEpisodeText(comment, 500, true);
  } catch { validInput = false; }

  const canSubmit =
    phase === 'compose' &&
    !submitting &&
    validInput &&
    (mode !== 'replace' || (Boolean(selectedTake) && originalConfirmed && recordingAllowed));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || !canSubmit) return;

    let cleanTitle = '';
    let cleanComment = '';
    try {
      cleanTitle = validateEpisodeText(title, 80, false);
      cleanComment = validateEpisodeText(comment, 500, true);
    } catch {
      setErrorMsg(t('episode.err.invalid'));
      return;
    }

    let attachment: ShareAttachmentInput | undefined;
    if (mode === 'keep') attachment = { mode: 'keep' };
    else if (mode === 'none') attachment = { mode: 'none' };
    else if (mode === 'replace' && selectedTake) attachment = { mode: 'replace', takeId: selectedTake.id, originalConfirmed: true };

    const o = op();
    busy.current = true;
    setSubmitting(true);
    setErrorMsg(null);
    stopAudio();
    setPreviewing(null);

    try {
      // D10: Drive 녹음은 브라우저가 읽어 서버 사본 업로드 → uploadId로 확정한다.
      if (attachment?.mode === 'replace' && selectedTake && selectedTake.storage === 'drive') {
        setUploading(true);
        let raw: Blob;
        try {
          raw = await drive.fetchMediaBlob(selectedTake.storageKey);
        } catch (err: any) {
          if (live(o)) setErrorMsg((err && err.message) || t('drive.authFailed'));
          return;
        }
        if (!live(o)) return;
        const file = raw.type === selectedTake.mime ? raw : new Blob([raw], { type: selectedTake.mime });
        const up = await apiClient.sessions.uploadShareAttachment(session.sessionId, selectedTake.id, file, o.signal);
        if (!live(o)) return;
        attachment = { ...attachment, uploadId: up.uploadId };
        setUploading(false);
      }

      const res = await apiClient.sessions.share(
        session.sessionId,
        { title: cleanTitle, comment: cleanComment, attachment },
        o.signal
      );
      if (!live(o)) return;
      if (res?.post) {
        onSuccess(res.post);
        busy.current = false;
        close();
      } else {
        setErrorMsg(t('episode.share.unknownResult'));
      }
    } catch (err: any) {
      if (!live(o) || err?.name === 'AbortError') return;
      applyShareError(err);
    } finally {
      if (live(o)) {
        busy.current = false;
        setSubmitting(false);
        setUploading(false);
      }
    }
  };

  const titleCp = countCodePoints(title);
  const commentCp = countCodePoints(comment);
  const dateLabel = formatEpisodeDate(session.date);
  const shownTitle = title.trim() || dateLabel;
  const segInfo = segText(session.a, session.b, session.rate);
  const youtubeTitle = reuse?.card?.youtubeTitle || '';
  const thumbUrl = session.videoId && !thumbFailed ? thumb(session.videoId) : '';
  const heading =
    phase === 'consent' ? t('episode.consent.title') : existingShare ? t('episode.share.edit') : t('episode.share.title');
  const submitLabel = uploading
    ? t('episode.share.uploading')
    : submitting
      ? t('episode.saving')
      : existingShare
        ? t('episode.share.republish')
        : t('episode.share.submit');
  const composing = phase === 'compose';

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        id="episodeShareDialog"
        className={`card ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episodeShareDialogTitle"
        data-share-phase={phase}
      >
        <div className={styles.head}>
          <h2 id="episodeShareDialogTitle" className={styles.title} data-align-group="shareHead:center-y">
            {heading}
          </h2>
          {composing && (
            <div className={styles.scopeWrap} onMouseEnter={() => setScopeOpen(true)} onMouseLeave={() => setScopeOpen(false)}>
              <button
                id="shareScopeInfo"
                type="button"
                className={styles.iconBtn}
                aria-expanded={scopeOpen}
                aria-controls="shareScopeTip"
                aria-label={t('episode.share.publicScope')}
                data-align-group="shareHead:center-y"
                onClick={() => setScopeOpen((v) => !v)}
              >
                i
              </button>
              <div id="shareScopeTip" role="note" className={styles.scopeTip} hidden={!scopeOpen}>
                <p>{t('episode.share.publicScope')}</p>
                <p className={styles.snapshotNotice}>{t('episode.share.snapshotNotice')}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={close}
            aria-label={t('episode.share.cancel')}
            data-align-group="shareHead:center-y"
          >
            ✕
          </button>
        </div>

        {phase === 'loading' && <p className={styles.statusText} role="status">{t('episode.share.checking')}</p>}

        {phase === 'consent' && (
          <div ref={agreeFocusRef}>
            <ShareConsentStep variant="dialog" busy={consentBusy} onAgree={() => void handleAgree()} />
          </div>
        )}

        {composing && (
          <form id="episodeShareForm" onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.previewCard} data-share-preview>
              <div className={styles.previewHead}>
                <button
                  id="shareTitleHead"
                  type="button"
                  className={`${styles.titleHead} ${title.trim() ? '' : styles.titleHeadEmpty}`}
                  hidden={editingTitle}
                  onClick={() => setEditingTitle(true)}
                  aria-label={t('episode.share.titleLabel')}
                >
                  <span className={styles.titleText}>{shownTitle}</span>
                  <span className={styles.titlePen} aria-hidden="true">✎</span>
                </button>
                <input
                  ref={titleInputRef}
                  id="shareTitleInput"
                  type="text"
                  className={`inpField ${styles.titleInput}`}
                  hidden={!editingTitle}
                  value={title}
                  placeholder={dateLabel}
                  aria-label={t('episode.share.titleLabel')}
                  aria-describedby={errorMsg ? 'episodeShareError' : undefined}
                  disabled={submitting}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); setEditingTitle(false); }
                    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setEditingTitle(false); }
                  }}
                />
                {editingTitle && <span className={styles.charCount}>{titleCp}/80</span>}
              </div>
              <div className={styles.previewMeta}>
                {[publicName, fmtSec(session.seconds), t('episode.loopsCount', { count: session.loops }), `${session.coveragePct || 0}%`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className={styles.attachRow}>
                <div className={styles.mini}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className={styles.miniImg} loading="lazy" onError={() => setThumbFailed(true)} />
                  ) : null}
                  {selectedTake && <span className={styles.miniBadge} aria-hidden="true">▶</span>}
                </div>
                <div className={styles.attachText}>
                  {youtubeTitle && <span className={styles.attachTitle}>{youtubeTitle}</span>}
                  {segInfo && <span className={styles.attachSeg}>{segInfo}</span>}
                </div>
              </div>

              {takes.length > 0 && (recordingAllowed ? (
                <div className={styles.chipRow}>
                  {takes.map((take) => {
                    const sel = selectedTakeId === take.id;
                    const playing = previewing === take.id;
                    return (
                      <span
                        key={take.id}
                        data-take-chip-group={take.id}
                        className={`${styles.chipGroup} ${sel ? styles.chipGroupSelected : ''}`}
                        data-align-group="shareChips:top"
                      >
                        <button
                          type="button"
                          className={styles.chipSelect}
                          data-take-chip={take.id}
                          aria-pressed={sel}
                          disabled={submitting || isOverAttachLimit(take)}
                          aria-describedby={isOverAttachLimit(take) ? 'shareChipLimitHint' : undefined}
                          onClick={() => selectChip(take.id)}
                        >
                          {fmtDuration(take.durationSec)}
                        </button>
                        <button
                          type="button"
                          className={styles.chipPlay}
                          data-take-preview={take.id}
                          aria-label={playing ? t('episode.share.chipStop') : t('episode.share.chipPreview')}
                          disabled={submitting}
                          onClick={() => void togglePreview(take)}
                        >
                          {playing ? '■' : '▶'}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.reagreeRow}>
                  <span className={styles.hint}>{t('episode.share.recordingReagreeHint')}</span>
                  <button
                    id="shareRecordingReagree"
                    type="button"
                    className={`ghost mini ${styles.reagreeBtn}`}
                    disabled={consentBusy || submitting}
                    onClick={() => void handleAgree()}
                  >
                    {t('episode.share.recordingReagree')}
                  </button>
                </div>
              ))}
              {takes.length > 0 && recordingAllowed && anyOverLimit && (
                <p id="shareChipLimitHint" className={styles.hint}>{t('episode.share.chipLimitHint')}</p>
              )}
            </div>

            <div className={styles.bubble}>
              <textarea
                ref={commentRef}
                id="shareCommentInput"
                className={styles.bubbleInput}
                rows={2}
                value={comment}
                placeholder={t('episode.commentPlaceholder')}
                aria-label={t('episode.share.commentLabel')}
                aria-describedby={errorMsg ? 'episodeShareError' : undefined}
                disabled={submitting}
                onChange={(e) => setComment(e.target.value)}
              />
              <span className={styles.charCount}>{commentCp}/500</span>
            </div>

            {mode === 'replace' && (
              <div className={styles.originalBox}>
                <p className={styles.hint}>{t('episode.share.originalHint')}</p>
                <label className={styles.checkLabel}>
                  <input
                    id="shareOriginalConfirm"
                    type="checkbox"
                    checked={originalConfirmed}
                    disabled={submitting}
                    onChange={(e) => setOriginalConfirmed(e.target.checked)}
                  />
                  <span>{t('episode.share.originalConfirm')}</span>
                </label>
              </div>
            )}
            {mode === 'none' && (
              <p className={styles.hint} data-share-none-info>ⓘ {t('episode.share.noneResnapshotInfo')}</p>
            )}
          </form>
        )}

        {errorMsg && (
          <div id="episodeShareError" className={styles.errorAlert} role="alert" aria-live="assertive">
            {errorMsg}
          </div>
        )}

        {phase === 'error' && (
          <button type="button" className={`ghost mini ${styles.retryBtn}`} onClick={() => void loadConsent()}>
            {t('episode.retry')}
          </button>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={`ghostBtn ${styles.cancelBtn}`}
            onClick={close}
            data-align-group={composing ? 'shareActions:center-y' : undefined}
          >
            {t('episode.share.cancel')}
          </button>
          {composing && (
            <button
              type="submit"
              form="episodeShareForm"
              className={`pillBtn ${styles.submitBtn}`}
              disabled={!canSubmit}
              data-align-group="shareActions:center-y"
            >
              {submitLabel}
            </button>
          )}
        </div>
        <audio ref={audioRef} hidden preload="none" onEnded={() => setPreviewing(null)} />
      </div>
    </div>
  );
}

/** §4.3 서버 코드 → episode.* 문구. 해당 없으면 null(기존 분기로 넘긴다). */
function errorText(err: unknown): string | null {
  const mapped = communityErrorKey(err);
  return mapped.key.startsWith('episode.') ? t(mapped.key as I18nKey, mapped.vars) : null;
}
