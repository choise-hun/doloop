// NT-2a: 노트북 목록(961 이상 왼쪽 240px · 960 이하 위 칩 줄)과 노트북 만들기/고치기 · PRO 안내 대화상자.
// 명세/NT-2_구현명세.md §4.1·§4.5 · V1 B
import React, { useEffect, useRef, useState } from 'react';
import type { NoteFolderDto } from '../../lib/apiClient';
import { t } from '../../lib/i18n.mts';
import { SafeLink } from '../common/SafeLink';
import {
  foldKey,
  formatBytes,
  NOTE_FOLDER_COLORS,
  NOTE_FOLDER_NAME_MAX,
  type FolderPick,
  type NoteFolderColor,
} from '../../lib/noteWorkspace.mts';
import styles from './notes.module.css';

export interface NoteFolderNavProps {
  folders: ReadonlyArray<NoteFolderDto>;
  pick: FolderPick;
  allCount: number;
  noneCount: number;
  /** 노트북 한도(null = 없음 · 0 = 무료) */
  folderLimit: number | null | undefined;
  /** 파일 저장 사용량·한도(한도 null = 관리자 — 막대 없이 숫자만). 사용량을 모르면 null */
  quota: { used: number; limit: number | null } | null;
  busy: boolean;
  onPick(pick: FolderPick): void;
  onMove(id: string, delta: -1 | 1): void;
}

const folderCount = (f: NoteFolderDto): number => (Number(f.docCount) || 0) + (Number(f.aiNoteCount) || 0);

export function NoteFolderNav({ folders, pick, allCount, noneCount, folderLimit, quota, busy, onPick, onMove }: NoteFolderNavProps): React.ReactElement {
  const pct = quota && quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  const item = (key: FolderPick, label: string, count: number, fold: string, extra?: React.ReactNode) => (
    <div className={styles.sideRow} key={key}>
      <button
        type="button"
        className={styles.sideItem}
        data-fold={fold}
        data-folder-pick={key}
        aria-pressed={pick === key}
        onClick={() => onPick(key)}
      >
        <span>{label}</span>
        <span className={styles.meta}>{count}</span>
      </button>
      {extra}
    </div>
  );
  return (
    <>
      <nav className={styles.side} id="noteFolders" aria-label={t('notes.ws.folders')} data-align-group="notesWs:top@961">
        <div className={styles.sideTitle}>
          <span>{t('notes.ws.folders')}</span>
          {typeof folderLimit === 'number' && folderLimit > 0 && (
            <span className={styles.meta}>{folders.length} / {folderLimit}</span>
          )}
        </div>
        {item('all', t('notes.ws.all'), allCount, 'none')}
        {folders.map((f, i) =>
          item(f.id, f.name, folderCount(f), foldKey(f.color), (
            <>
              <button
                type="button"
                className={styles.orderBtn}
                aria-label={t('notes.ws.ariaMoveUp', { name: f.name })}
                data-folder-up={f.id}
                disabled={busy || i === 0}
                onClick={() => onMove(f.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.orderBtn}
                aria-label={t('notes.ws.ariaMoveDown', { name: f.name })}
                data-folder-down={f.id}
                disabled={busy || i === folders.length - 1}
                onClick={() => onMove(f.id, 1)}
              >
                ↓
              </button>
            </>
          )),
        )}
        {item('none', t('notes.ws.defaultFolder'), noneCount, 'none')}
        {quota && (
          <div className={styles.quota} id="noteQuota">
            <span className={styles.meta}>
              {quota.limit ? t('notes.ws.quota', { used: formatBytes(quota.used), limit: formatBytes(quota.limit) }) : t('notes.ws.quotaUsed', { used: formatBytes(quota.used) })}
            </span>
            {quota.limit ? (
              <div className={styles.bar} role="img" aria-label={`${pct}%`}>
                <span data-pct={pct} ref={(el) => { if (el) el.style.width = `${pct}%`; }} />
              </div>
            ) : null}
            <span className={styles.meta}>{t('notes.ws.quotaHint')}</span>
          </div>
        )}
      </nav>
      <div className={styles.chips} id="noteFolderChips" role="group" aria-label={t('notes.ws.folders')}>
        {[
          { key: 'all' as FolderPick, label: t('notes.ws.all'), count: allCount, fold: 'none' },
          ...folders.map((f) => ({ key: f.id as FolderPick, label: f.name, count: folderCount(f), fold: foldKey(f.color) })),
          { key: 'none' as FolderPick, label: t('notes.ws.defaultFolder'), count: noneCount, fold: 'none' },
        ].map((c) => (
          <button key={c.key} type="button" className={styles.chip} data-fold={c.fold} data-folder-chip={c.key} aria-pressed={pick === c.key} onClick={() => onPick(c.key)}>
            {c.label} {c.count}
          </button>
        ))}
      </div>
    </>
  );
}

/** 모달 열기/닫기 공통: 열릴 때 showModal, 닫힐 때 여는 버튼으로 포커스를 돌려준다 */
function useModal(trigger: HTMLElement | null) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open && typeof el.showModal === 'function') el.showModal();
    return () => {
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [trigger]);
  return ref;
}

export interface FolderDialogProps {
  mode: 'create' | 'rename' | 'color';
  folder?: NoteFolderDto;
  trigger: HTMLElement | null;
  onClose(): void;
  /** 실패하면 문구를 던진다(Error.message) */
  onSubmit(input: { name?: string; color?: string | null }): Promise<void>;
}

export function FolderDialog({ mode, folder, trigger, onClose, onSubmit }: FolderDialogProps): React.ReactElement {
  const ref = useModal(trigger);
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState<NoteFolderColor | null>(() => {
    const k = foldKey(folder?.color);
    return k === 'none' ? null : k;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = mode === 'create' ? t('notes.ws.newFolder') : mode === 'rename' ? t('notes.ws.rename') : t('notes.ws.color');
  const colorLabel = { orange: t('notes.ws.colorOrange'), slate: t('notes.ws.colorSlate'), sage: t('notes.ws.colorSage') };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (mode !== 'color' && !trimmed) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'create') await onSubmit({ name: trimmed, color });
      else if (mode === 'rename') await onSubmit({ name: trimmed });
      else await onSubmit({ color });
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('notes.ws.actionError'));
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className={styles.dialog} id="noteFolderDialog" aria-labelledby="noteFolderDialogTitle" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form className={styles.dialogForm} onSubmit={(e) => void submit(e)}>
        <div className={styles.dialogHead}>
          <h2 id="noteFolderDialogTitle">{title}</h2>
        </div>
        {mode !== 'color' && (
          <label>
            {t('notes.ws.folderName')}
            <input type="text" id="noteFolderName" value={name} maxLength={NOTE_FOLDER_NAME_MAX} disabled={busy} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {mode !== 'rename' && (
          <fieldset>
            <legend>{t('notes.ws.color')}</legend>
            <div className={styles.colors}>
              <button type="button" className={styles.colorOpt} data-fold="none" aria-pressed={color === null} onClick={() => setColor(null)}>
                {t('notes.ws.colorNone')}
              </button>
              {NOTE_FOLDER_COLORS.map((c) => (
                <button key={c} type="button" className={styles.colorOpt} data-fold={c} data-color-opt={c} aria-pressed={color === c} onClick={() => setColor(c)}>
                  {colorLabel[c]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.dialogActs}>
          <button type="button" className="ghostBtn" onClick={onClose}>{t('notes.ws.cancel')}</button>
          <button type="submit" className="ghostBtn" id="noteFolderSubmit" disabled={busy || (mode !== 'color' && !name.trim())}>
            {mode === 'create' ? t('notes.ws.create') : t('notes.ws.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function ProDialog({ kind, trigger, onClose }: { kind: 'folders' | 'upload'; trigger: HTMLElement | null; onClose(): void }): React.ReactElement {
  const ref = useModal(trigger);
  return (
    <dialog ref={ref} className={styles.dialog} id="noteProDialog" aria-labelledby="noteProDialogTitle" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className={styles.dialogForm}>
        <div className={styles.dialogHead}>
          <h2 id="noteProDialogTitle">{t('notes.ws.proTitle')}</h2>
        </div>
        <p>{kind === 'folders' ? t('notes.ws.proFolders') : t('notes.ws.proUpload')}</p>
        <p>
          <SafeLink href="settings.html#credits">{t('notes.ws.planLink')}</SafeLink>
        </p>
        <div className={styles.dialogActs}>
          <button type="button" className="ghostBtn" onClick={onClose}>{t('notes.ws.close')}</button>
        </div>
      </div>
    </dialog>
  );
}
