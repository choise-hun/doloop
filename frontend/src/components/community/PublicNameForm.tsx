// frontend/src/components/community/PublicNameForm.tsx
import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import { communityErrorKey, kstDate } from '../../lib/community.mts';
import { t } from '../../lib/i18n.mts';
import styles from './Community.module.css';

export interface PublicNameFormProps {
  me: MeProfile | null;
  inputId?: string;
  submitId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onSaved?: (publicName: string) => void;
}

export function PublicNameForm({
  me,
  inputId = 'publicNameInput',
  submitId = 'publicNameSaveBtn',
  inputRef,
  onSaved,
}: PublicNameFormProps) {
  const [name, setName] = useState(me?.publicName ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);

  useEffect(() => {
    setName(me?.publicName ?? '');
    setErr(null);
  }, [me?.id, me?.publicName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const val = name.trim();
    if (/\s/.test(val) || val.length < 2 || val.length > 20) {
      setErr({ key: 'community.err.nameFormat' });
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.community.setPublicName(val);
      await auth.fetchMe().catch(() => null);
      if (res.publicName) onSaved?.(res.publicName);
    } catch (errObj) {
      setErr(communityErrorKey(errObj));
    } finally {
      setBusy(false);
    }
  }

  const lockDate = me?.publicNameNextChangeAt ? kstDate(me.publicNameNextChangeAt) : '';

  return (
    <form className={styles.nameForm} onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className={styles.nameField}>
        <label className={styles.fieldLab} htmlFor={inputId}>
          {t('community.nameLabel')}
        </label>
        <p className={styles.fieldHint}>{t('community.nameHint')}</p>
      </div>
      <div className={styles.nameInputRow}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={`inpField ${styles.nameInput}`}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" id={submitId} className="pillBtn" disabled={busy}>
          {t('community.nameSave')}
        </button>
      </div>
      {lockDate ? (
        <p className={styles.fieldHint}>{t('community.nameLocked', { date: lockDate })}</p>
      ) : null}
      {err ? (
        <p role="alert" className={`msg err ${styles.formMsg}`}>
          {t(err.key as any, err.vars)}
        </p>
      ) : null}
    </form>
  );
}
