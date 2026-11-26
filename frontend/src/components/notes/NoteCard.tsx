// NT-2a: 통합 노트 그리드의 카드(AI 영상 노트 · 자료 노트). 명세/NT-2_구현명세.md §4.1·§4.6
// AI 카드는 기존 단언(.note-card · .note-card-title 링크 · .note-actions 연습/상세 링크)을 유지한다
import React, { useState } from 'react';
import { SafeLink } from '../common/SafeLink';
import type { NoteDocSummaryDto, NoteFolderDto, NoteSummaryDto } from '../../lib/apiClient';
import { thumb } from '../../lib/security';
import { t } from '../../lib/i18n.mts';
import { foldKey, NOTE_TITLE_MAX, type FolderPick } from '../../lib/noteWorkspace.mts';
import styles from './notes.module.css';

export type NoteCardItem =
  | { type: 'ai'; note: NoteSummaryDto }
  | { type: 'doc'; doc: NoteDocSummaryDto };

export interface NoteCardProps {
  item: NoteCardItem;
  folders: ReadonlyArray<NoteFolderDto>;
  /** 노트북으로 옮길 수 있는지(노트북이 하나라도 있으면) */
  canMove: boolean;
  timeText: string;
  tagLabel(tag: string): string;
  onMove(folderId: string | null): Promise<void>;
  onRename(title: string): Promise<void>;
  onDelete(): Promise<void>;
}

type MenuMode = null | 'menu' | 'move' | 'rename';

export function NoteCard({ item, folders, canMove, timeText, tagLabel, onMove, onRename, onDelete }: NoteCardProps): React.ReactElement {
  const [mode, setMode] = useState<MenuMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAi = item.type === 'ai';
  const id = isAi ? item.note.id : item.doc.id;
  const title = (isAi ? item.note.title : item.doc.title) || t('notes.noTitle');
  const folderId = (isAi ? item.note.folderId : item.doc.folderId) ?? null;
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const href = isAi ? `note.html?id=${encodeURIComponent(id)}` : `note.html?doc=${encodeURIComponent(id)}`;
  const [moveTo, setMoveTo] = useState<FolderPick>(folderId ?? 'none');
  const [rename, setRename] = useState(title);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      setMode(null);
    } catch {
      setError(t('notes.ws.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const fmt = !isAi && item.doc.firstFile ? (item.doc.firstFile.mime === 'application/pdf' ? 'PDF' : 'IMG') : '';
  const kindLabel = isAi ? t('notes.ws.kindAi') : item.doc.kind === 'block' ? t('notes.ws.kindBlock') : t('notes.ws.kindDoc');

  return (
    <article
      className={`card note-card ${styles.card}`}
      data-fold={foldKey(folder?.color)}
      data-note-kind={isAi ? 'ai' : 'doc'}
      data-note-id={id}
      data-align-group="noteCards:top,bottom"
    >
      <div className={styles.thumb} aria-hidden="true">
        {isAi && item.note.videoId ? <img src={thumb(item.note.videoId)} alt="" loading="lazy" /> : <span>{fmt || '—'}</span>}
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <h3 className={`note-card-title ${styles.title}`}>
            <SafeLink href={href}>{title}</SafeLink>
          </h3>
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={mode !== null}
            aria-label={t('notes.ws.cardMenu', { title })}
            data-card-menu={id}
            onClick={() => {
              setError('');
              setMode((m) => (m === null ? 'menu' : null));
            }}
          >
            ⋯
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.tag}>{kindLabel}</span>
          {isAi && item.note.channel && <span className={styles.meta}>{item.note.channel}</span>}
          {isAi && Array.isArray(item.note.tags) && item.note.tags.map((tag) => <span key={tag} className={styles.tag}>{tagLabel(tag)}</span>)}
          {!isAi && <span className={styles.meta}>{t('notes.ws.files', { n: item.doc.fileCount })}</span>}
        </div>
        {isAi && item.note.headline && <p className={`note-card-desc ${styles.desc}`}>{item.note.headline}</p>}
        {timeText && <span className={styles.meta}>{timeText}</span>}
        {isAi && (
          <div className={`note-actions ${styles.actions}`}>
            {item.note.videoId && (
              <SafeLink href={`practice.html?v=${encodeURIComponent(item.note.videoId)}`}>{t('notes.btnPractice')} →</SafeLink>
            )}
            <SafeLink href={href}>{t('notes.btnDetail')}</SafeLink>
          </div>
        )}
        {mode === 'menu' && (
          <div className={styles.menu} role="group" aria-label={t('notes.ws.cardMenu', { title })}>
            {canMove && (
              <button type="button" className={styles.textBtn} data-card-action="move" onClick={() => { setMoveTo(folderId ?? 'none'); setMode('move'); }}>
                {t('notes.ws.moveTo')}
              </button>
            )}
            <button type="button" className={styles.textBtn} data-card-action="rename" onClick={() => { setRename(title); setMode('rename'); }}>
              {t('notes.ws.rename')}
            </button>
            <button
              type="button"
              className={styles.textBtn}
              data-card-action="delete"
              disabled={busy}
              onClick={() => {
                const ask = isAi ? t('note.confirmDelete') : t('notes.ws.deleteDocConfirm', { title });
                if (window.confirm(ask)) void run(onDelete);
              }}
            >
              {t('notes.ws.delete')}
            </button>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
        )}
        {mode === 'move' && (
          <form
            className={styles.menu}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => onMove(moveTo === 'none' ? null : moveTo));
            }}
          >
            <label>
              {t('notes.ws.moveTo')}
              <select value={moveTo} data-card-move-select={id} onChange={(e) => setMoveTo(e.target.value)} disabled={busy}>
                <option value="none">{t('notes.ws.defaultFolder')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <div className={styles.menuActs}>
              <button type="submit" className={styles.textBtn} disabled={busy || moveTo === (folderId ?? 'none')}>{t('notes.ws.move')}</button>
              <button type="button" className={styles.textBtn} onClick={() => setMode(null)}>{t('notes.ws.cancel')}</button>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>
        )}
        {mode === 'rename' && (
          <form
            className={styles.menu}
            onSubmit={(e) => {
              e.preventDefault();
              const next = rename.trim();
              if (next && next !== title) void run(() => onRename(next));
            }}
          >
            <label>
              {t('notes.ws.docTitle')}
              <input type="text" value={rename} maxLength={NOTE_TITLE_MAX} disabled={busy} onChange={(e) => setRename(e.target.value)} />
            </label>
            <div className={styles.menuActs}>
              <button type="submit" className={styles.textBtn} disabled={busy || !rename.trim()}>{t('notes.ws.save')}</button>
              <button type="button" className={styles.textBtn} onClick={() => setMode(null)}>{t('notes.ws.cancel')}</button>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>
        )}
      </div>
    </article>
  );
}
