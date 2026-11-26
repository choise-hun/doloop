// NT-2a: 자료 올리기 대화상자. 명세/NT-2_구현명세.md §4.3(흐름·오류 문구) · §4.4(Drive 학습자료 폴더) · V7 A(올릴 때 저장 위치 선택)
// 노트 생성 → 파일마다 순서대로 RE:DO(multipart) 또는 Drive(올리기 → 등록). 첫 파일부터 실패하면 빈 노트를 지운다(보상)
import React, { useEffect, useRef, useState } from 'react';
import { apiClient, type NoteDocDetailDto, type NoteFolderDto } from '../../lib/apiClient';
import { auth, type ApiClientError, type MeProfile } from '../../lib/auth';
import { drive, DRIVE_NOTES_FOLDER_NAME } from '../../lib/drive';
import { t } from '../../lib/i18n.mts';
import { SafeLink } from '../common/SafeLink';
import {
  checkUploadFiles,
  defaultNoteTitle,
  describeUploadError,
  FILE_ISSUE_KEY,
  formatBytes,
  NOTE_FILE_ACCEPT,
  NOTE_TITLE_MAX,
  noteFileMime,
  type FolderPick,
  type NoteStorage,
  type UploadErrorText,
} from '../../lib/noteWorkspace.mts';
import styles from './notes.module.css';

export interface NoteUploadDialogProps {
  uid: string;
  me: MeProfile | null;
  folders: ReadonlyArray<NoteFolderDto>;
  /** 지금 선택한 노트북(전체면 기본 노트북) */
  folder: FolderPick;
  trigger: HTMLElement | null;
  onClose(): void;
  /** 노트를 만들었고 파일이 1개 이상 올라갔다(부분 성공 포함) */
  onUploaded(doc: NoteDocDetailDto): void;
}

/**
 * Drive 학습자료 폴더 id(명세/NT-2 §4.4). 서버에 저장하지 않고 이 기기 localStorage에 계정별로 기억한다.
 * 없거나 휴지통이면 ensureFolder가 다시 찾거나 만든다(drive.ts는 localStorage를 쓰지 않는다 — R0-T8)
 */
async function notesFolder(uid: string): Promise<string> {
  let remembered = '';
  try {
    remembered = localStorage.getItem('ulp:drive-notes-folder:' + uid) || '';
  } catch {
    /* 저장소 불가 */
  }
  const id = await drive.ensureFolder(remembered || null, DRIVE_NOTES_FOLDER_NAME);
  if (auth.getUser()?.id !== uid) throw new Error(t('drive.authFailed'));
  try {
    localStorage.setItem('ulp:drive-notes-folder:' + uid, id);
  } catch {
    /* 저장소 불가 */
  }
  return id;
}

interface RunState {
  i: number;
  n: number;
  name: string;
}

export function NoteUploadDialog({ uid, me, folders, folder, trigger, onClose, onUploaded }: NoteUploadDialogProps): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [folderId, setFolderId] = useState<string>(folder === 'all' ? 'none' : folder);
  const limits = me?.limits;
  const driveAllowed = Boolean(limits?.drive);
  const driveConnected = me?.storageProvider === 'drive';
  const driveUsable = driveAllowed && driveConnected;
  const [storage, setStorage] = useState<NoteStorage>(driveUsable ? 'drive' : 'supabase');
  const [over, setOver] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<UploadErrorText | null>(null);
  const [partial, setPartial] = useState<{ n: number; m: number; failed: string[] } | null>(null);
  // 부분 성공 뒤 남은 파일을 다시 올리면 같은 노트에 붙인다
  const docRef = useRef<NoteDocDetailDto | null>(null);

  const fileLimit = typeof limits?.fileBytes === 'number' ? limits.fileBytes : null;
  const usedBytes = typeof me?.usage?.fileBytes === 'number' ? me.usage.fileBytes : 0;
  const remaining = fileLimit === null ? null : Math.max(0, fileLimit - usedBytes);
  const check = checkUploadFiles(files, storage, remaining);
  const redoBlocked = check.needsDrive;
  const effectiveStorage: NoteStorage = redoBlocked && driveUsable ? 'drive' : storage;
  const effectiveCheck = effectiveStorage === storage ? check : checkUploadFiles(files, effectiveStorage, remaining);
  const busy = run !== null;
  const canSubmit = effectiveCheck.ok && !busy && Boolean(title.trim()) && !(redoBlocked && effectiveStorage === 'supabase');

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open && typeof el.showModal === 'function') el.showModal();
    return () => {
      request.current?.abort();
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [trigger]);

  const addFiles = (list: FileList | null) => {
    if (!list || busy) return;
    const next = [...files, ...Array.from(list)];
    setFiles(next);
    setError(null);
    setPartial(null);
    if (!titleTouched && !docRef.current && next[0]) setTitle(defaultNoteTitle(next[0].name));
  };

  const current = (ctl: AbortController, generation: number) => () =>
    !ctl.signal.aborted && auth.getUser()?.id === uid && auth.getSessionGeneration() === generation;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || request.current) return;
    const ctl = new AbortController();
    const live = current(ctl, auth.getSessionGeneration());
    const sameAccount = () => auth.getUser()?.id === uid;
    request.current = ctl;
    setError(null);
    setPartial(null);
    const queue = [...files];
    const into = effectiveStorage;
    let doc = docRef.current;
    let createdNow = false;
    let okCount = 0;
    const failed: File[] = [];
    let firstError: UploadErrorText | null = null;
    try {
      setRun({ i: 0, n: queue.length, name: queue[0]?.name ?? '' });
      if (!doc) {
        doc = await apiClient.noteWorkspace.createNoteDoc(
          { kind: 'document', title: title.trim().slice(0, NOTE_TITLE_MAX), folderId: folderId === 'none' ? null : folderId },
          ctl.signal,
        );
        if (!live()) {
          if (sameAccount()) void apiClient.noteWorkspace.deleteNoteDoc(doc.id).catch(() => {});
          return;
        }
        createdNow = true;
      }
      const driveFolder = into === 'drive' ? await notesFolder(uid) : null;
      if (!live()) return;
      for (let i = 0; i < queue.length; i++) {
        const file = queue[i];
        if (!live()) break;
        setRun({ i: i + 1, n: queue.length, name: file.name });
        const mime = noteFileMime(file.name) || file.type;
        try {
          if (into === 'supabase') {
            await apiClient.noteWorkspace.uploadNoteFile(doc.id, file, ctl.signal);
          } else {
            const driveId = await drive.uploadBlob(file, file.name, mime, driveFolder);
            if (!live()) {
              void drive.deleteFile(driveId);
              break;
            }
            try {
              await apiClient.noteWorkspace.registerDriveNoteFile(
                doc.id,
                { storageKey: driveId, fileName: file.name, mime, sizeBytes: file.size },
                ctl.signal,
              );
            } catch (err) {
              void drive.deleteFile(driveId); // 서버 등록 실패 → Drive에 남은 파일 정리(녹음 Drive 업로드와 같은 정리)
              throw err;
            }
          }
          okCount += 1;
        } catch (err) {
          if (!live()) break;
          failed.push(file);
          const e = err as ApiClientError;
          firstError ??= e && e.status ? describeUploadError(e, file.size) : into === 'drive' && !e?.code
            ? { text: t('notes.upload.err.drive'), upgrade: false, suggestDrive: false }
            : describeUploadError(e, file.size);
          // 한도·형식·업그레이드 오류는 다음 파일도 같은 이유로 실패한다 — 남은 파일은 시도하지 않고 실패로 둔다
          const code = e?.code || '';
          if (['TIER_UPGRADE_REQUIRED', 'NOTE_FILE_COUNT_EXCEEDED', 'FILE_QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE'].includes(code)) {
            failed.push(...queue.slice(i + 1));
            break;
          }
        }
      }
      if (!live()) {
        if (createdNow && okCount === 0 && sameAccount()) void apiClient.noteWorkspace.deleteNoteDoc(doc.id).catch(() => {});
        return;
      }
      if (okCount === 0) {
        if (createdNow) {
          await apiClient.noteWorkspace.deleteNoteDoc(doc.id).catch(() => {}); // 보상: 파일 없는 빈 노트를 남기지 않는다
          docRef.current = null;
        }
        if (live()) setError(firstError ?? { text: t('notes.upload.err.storage'), upgrade: false, suggestDrive: false });
        return;
      }
      const fresh = (await apiClient.noteWorkspace.getNoteDoc(doc.id).catch(() => null)) ?? doc;
      if (!live()) return;
      onUploaded({ ...fresh, fileCount: fresh.files?.length ?? fresh.fileCount + okCount });
      if (failed.length === 0) {
        onClose();
        return;
      }
      docRef.current = fresh;
      setFiles(failed);
      setPartial({ n: queue.length, m: okCount, failed: failed.map((f) => f.name) });
      setError(firstError);
    } catch (err) {
      if (!live()) return;
      if (createdNow && doc && okCount === 0) {
        await apiClient.noteWorkspace.deleteNoteDoc(doc.id).catch(() => {});
        docRef.current = null;
      }
      const e = err as ApiClientError;
      setError(e && (e.status || e.code) ? describeUploadError(e) : into === 'drive'
        ? { text: t('notes.upload.err.drive'), upgrade: false, suggestDrive: false }
        : describeUploadError(e));
    } finally {
      if (request.current === ctl) request.current = null;
      if (!ctl.signal.aborted) setRun(null);
    }
  };

  const removeAt = (i: number) => setFiles((list) => list.filter((_, j) => j !== i));
  const redoHint = fileLimit !== null
    ? t('notes.upload.storageRedoLeft', { left: formatBytes(remaining), limit: formatBytes(fileLimit) })
    : t('notes.upload.storageRedoHint');

  return (
    <dialog ref={dialog} className={styles.dialog} id="noteUploadDialog" aria-labelledby="noteUploadTitle" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form className={styles.dialogForm} onSubmit={(e) => void submit(e)}>
        <div className={styles.dialogHead}>
          <h2 id="noteUploadTitle">{t('notes.upload.title')}</h2>
        </div>
        <div
          className={styles.drop}
          data-over={over}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        >
          <b>{t('notes.upload.drop')}</b>
          <span className={styles.meta}>{t('notes.upload.formats')}</span>
          <input ref={inputRef} id="noteUploadInput" type="file" accept={NOTE_FILE_ACCEPT} multiple hidden disabled={busy}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="ghostBtn" id="noteUploadPick" disabled={busy} onClick={() => inputRef.current?.click()}>
            {t('notes.upload.pick')}
          </button>
        </div>
        {files.length > 0 && (
          <ul className={styles.fileList} id="noteUploadFiles">
            {files.map((f, i) => {
              const issue = effectiveCheck.issues[i];
              return (
                <li key={`${f.name}-${i}`} data-file-issue={issue || undefined}>
                  <span>{f.name} · {formatBytes(f.size)}</span>
                  {issue && <span className={styles.error}>{t(FILE_ISSUE_KEY[issue])}</span>}
                  <button type="button" className={styles.textBtn} disabled={busy} onClick={() => removeAt(i)}>{t('notes.upload.remove')}</button>
                </li>
              );
            })}
          </ul>
        )}
        {effectiveCheck.tooMany && <p className={styles.error} id="noteUploadTooMany">{t('notes.upload.err.count')}</p>}
        <label>
          {t('notes.upload.labTitle')}
          <input type="text" id="noteUploadDocTitle" value={title} maxLength={NOTE_TITLE_MAX} disabled={busy || Boolean(docRef.current)}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
        </label>
        <label>
          {t('notes.upload.labFolder')}
          <select id="noteUploadFolder" value={folderId} disabled={busy || Boolean(docRef.current)} onChange={(e) => setFolderId(e.target.value)}>
            <option value="none">{t('notes.ws.defaultFolder')}</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <fieldset id="noteUploadStorage">
          <legend>{t('notes.upload.storage')}</legend>
          <label className={styles.radio}>
            <input type="radio" name="noteStorage" value="supabase" checked={effectiveStorage === 'supabase'} disabled={busy || redoBlocked}
              onChange={() => setStorage('supabase')} />
            <span>
              <b>{t('notes.upload.storageRedo')}</b>
              <br />
              <span className={styles.meta}>{redoBlocked ? t('notes.upload.bigOnlyDrive') : redoHint}</span>
            </span>
          </label>
          <label className={styles.radio}>
            <input type="radio" name="noteStorage" value="drive" checked={effectiveStorage === 'drive'} disabled={busy || !driveUsable}
              onChange={() => setStorage('drive')} />
            <span>
              <b>{t('notes.upload.storageDrive')}</b>
              <br />
              {!driveAllowed ? (
                <span className={styles.meta} id="noteUploadDriveWhy">{t('notes.upload.driveFree')}</span>
              ) : !driveConnected ? (
                <SafeLink href="settings.html#account" id="noteUploadDriveWhy">{t('notes.upload.driveOff')}</SafeLink>
              ) : (
                <span className={styles.meta}>{t('notes.upload.storageDriveHint')}</span>
              )}
            </span>
          </label>
        </fieldset>
        {run && (
          <div className={styles.progress} id="noteUploadProgress" aria-live="polite">
            <span>{t('notes.upload.progress', { i: run.i, n: run.n, name: run.name })}</span>
            <div className={styles.busyBar}><span /></div>
            <span className={styles.meta}>{t('notes.upload.uploading')}</span>
          </div>
        )}
        {partial && (
          <p id="noteUploadPartial" role="status">
            {t('notes.upload.partial', { n: partial.n, m: partial.m })} {t('notes.upload.failedFiles', { names: partial.failed.join(', ') })}
          </p>
        )}
        {error && (
          <p className={styles.error} id="noteUploadError" role="alert">
            {error.text}{' '}
            {error.upgrade && <SafeLink href="settings.html#credits">{t('notes.ws.planLink')}</SafeLink>}
          </p>
        )}
        <div className={styles.dialogActs}>
          {error?.suggestDrive && driveUsable && effectiveStorage !== 'drive' && (
            <button type="button" className="ghostBtn" id="noteUploadToDrive" onClick={() => { setStorage('drive'); setError(null); }}>
              {t('notes.upload.saveToDrive')}
            </button>
          )}
          <button type="button" className="ghostBtn" id="noteUploadCancel" onClick={onClose}>
            {busy ? t('notes.ws.cancel') : t('notes.ws.close')}
          </button>
          <button type="submit" className="ghostBtn" id="noteUploadSubmit" disabled={!canSubmit}>
            {t('notes.upload.submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
