import React, { useEffect, useRef, useState } from 'react';
import { apiClient, isTabFormat, MAX_TAB_BYTES, type TabSongDto } from '../../lib/apiClient';
import { auth, type ApiClientError } from '../../lib/auth';
import { t, type I18nKey } from '../../lib/i18n.mts';
import styles from './TabPlayer.module.css';

function fileError(file: File): I18nKey | '' {
  if (file.size === 0) return 'tab.empty';
  if (file.size > MAX_TAB_BYTES) return 'tab.tooLarge';
  if (!isTabFormat(file.name.toLowerCase().split('.').pop()) || !file.name.includes('.')) return 'tab.extension';
  return '';
}

const errorKeys: Record<string, I18nKey> = {
  INVALID_INPUT: 'tab.invalidInput',
  TAB_TOO_LARGE: 'tab.tooLarge',
  TAB_QUOTA_EXCEEDED: 'tab.quota',
  TAB_LIMIT_EXCEEDED: 'tab.tabLimit',
  SONG_LIMIT_EXCEEDED: 'tab.songLimit',
};

export function TabUploadDialog({ uid, trigger, onClose, onUpload, onUncertain }: {
  uid: string | null;
  trigger: HTMLElement;
  onClose(): void;
  onUpload(song: TabSongDto): void;
  onUncertain(): Promise<unknown>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      request.current?.abort();
      if (trigger.isConnected) trigger.focus();
    };
  }, [trigger]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid || !file || fileError(file) || request.current) return;
    const form = new FormData(event.currentTarget);
    const run = new AbortController();
    const session = auth.getSessionGeneration();
    const current = () => !run.signal.aborted && auth.getUser()?.id === uid && auth.getSessionGeneration() === session;
    request.current = run;
    setBusy(true);
    setError('');
    try {
      const song = await apiClient.songs.uploadTab(file, String(form.get('title') || ''), String(form.get('artist') || ''), run.signal);
      if (current()) {
        onClose();
        onUpload(song);
      }
    } catch (cause) {
      if (!current()) return;
      const err = cause as ApiClientError;
      const detail = (err.data as { detail?: { reason?: string; limit?: number } } | undefined)?.detail;
      const key = err.status === 401 ? 'tab.login' : err.code === 'TAB_FORMAT_INVALID'
        ? (detail?.reason === 'extension' ? 'tab.extension' : 'tab.parse') : errorKeys[err.code || ''] || 'tab.uploadError';
      if (!err.status) await onUncertain();
      if (current()) setError(t(key) + (Number.isFinite(detail?.limit) ? ' (' + detail?.limit + ')' : ''));
    } finally {
      if (current()) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="tab-upload-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles.dialogHead}>
        <h2 id="tab-upload-title">{t('tab.upload')}</h2>
        <button type="button" className="pillBtn" onClick={onClose}>{t('practice.ariaClose')}</button>
      </div>
      {uid ? (
        <form onSubmit={(event) => void submit(event)}>
          <label>{t('tab.file')}
            <input name="file" type="file" accept=".gp,.xml,.mxl" aria-describedby="tab-format-help" disabled={busy}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                const key = chosen && fileError(chosen);
                setError(key ? t(key) : '');
              }} />
          </label>
          <small id="tab-format-help">.gp, .xml, .mxl · {t('tab.maxSize')}</small>
          <label>{t('tab.title')}<input name="title" maxLength={300} disabled={busy} /></label>
          <label>{t('tab.artist')}<input name="artist" maxLength={200} disabled={busy} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className="pillBtn" disabled={!file || Boolean(fileError(file)) || busy}>
            {t(busy ? 'tab.uploading' : 'tab.submit')}
          </button>
        </form>
      ) : (
        <p role="status">{t('tab.login')}</p>
      )}
    </dialog>
  );
}
