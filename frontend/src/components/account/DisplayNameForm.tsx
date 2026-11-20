// frontend/src/components/account/DisplayNameForm.tsx
// UF-4: 표시 이름 수정 폼. PROFILE(보기 전용)에서 SETTING 계정 칸으로 옮겼다.
// 계정·세션 세대(identity) 경합 방어와 한 번에 하나만 저장하는 잠금(saveRef)을 그대로 유지한다.
import React, { useEffect, useRef, useState } from 'react';
import { auth, useAuth } from '../../lib/auth';
import { t, type I18nKey } from '../../lib/i18n.mts';
import formStyles from '../community/Community.module.css';

export function DisplayNameForm(): React.ReactElement | null {
  const authState = useAuth();
  const currentUser = authState.user;
  const currentUid = currentUser?.id ?? null;
  const generation = auth.getSessionGeneration();
  const identity = `${currentUid ?? ''}:${generation}`;
  const identityNow = () => `${auth.getUser()?.id ?? ''}:${auth.getSessionGeneration()}`;
  const mountedRef = useRef(true);
  const me = authState.me && currentUser && authState.me.id === currentUser.id ? authState.me : null;
  const serverDisplay = me?.displayName ?? '';

  const [draft, setDraft] = useState({ identity, serverDisplay, value: serverDisplay });
  const displayDraft = me && draft.identity === identity && draft.serverDisplay === serverDisplay ? draft.value : serverDisplay;
  const [nameMsg, setNameMsg] = useState<{ identity: string; key: I18nKey } | null>(null);
  const saveRef = useRef<{ identity: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [retryingMe, setRetryingMe] = useState<string | null>(null);
  const retryRef = useRef<object | null>(null);
  const saveBusy = saving === identity;
  const disabled = !me || saveBusy;
  const visibleMsg = nameMsg?.identity === identity ? nameMsg : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { setDraft({ identity, serverDisplay, value: serverDisplay }); }, [identity, serverDisplay, !!me]);

  useEffect(() => auth.onChange(() => {
    if (identityNow() !== identity) {
      saveRef.current = null;
      retryRef.current = null;
      setSaving(null);
      setRetryingMe(null);
    }
  }), [identity]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (saveRef.current || identityNow() !== identity || auth.getMe()?.id !== currentUid) return;
    const action = { identity };
    saveRef.current = action;
    setSaving(identity);
    const valid = () => mountedRef.current && saveRef.current === action && identityNow() === identity;
    const value = displayDraft.trim();
    setNameMsg(null);
    try {
      if (value.length > 100) { setNameMsg({ identity, key: 'profile.displayNameFormat' }); return; }
      const updated = await auth.updateProfile({ displayName: value });
      if (valid()) {
        setDraft({ identity, serverDisplay: updated.displayName, value: updated.displayName });
        setNameMsg({ identity, key: 'profile.saved' });
      }
    } catch (error) {
      if (valid() && !(error instanceof Error && error.name === 'AbortError')) {
        const formatError = error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_INPUT';
        setNameMsg({ identity, key: formatError ? 'profile.displayNameFormat' : 'profile.saveFailed' });
      }
    } finally {
      if (mountedRef.current && saveRef.current === action && identityNow() === identity) {
        saveRef.current = null;
        setSaving(null);
      }
    }
  }

  async function retryMe() {
    if (retryRef.current) return;
    const action = {};
    retryRef.current = action;
    setRetryingMe(identity);
    try { await auth.fetchMe(); }
    finally {
      if (mountedRef.current && retryRef.current === action && identityNow() === identity) {
        retryRef.current = null;
        setRetryingMe(null);
      }
    }
  }

  if (!currentUser || auth.isEmbedded()) return null;
  return (
    <div id="accDisplayName">
      {!me ? <>
        <p id="accMeStatus" role="status" aria-live="polite">{t('profile.meUnavailable')}</p>
        <button id="accMeRetry" type="button" className="ghostBtn" disabled={retryingMe === identity}
          onClick={() => void retryMe()}>{t('record.retry')}</button>
      </> : null}
      <form id="accDisplayNameForm" className={formStyles.nameForm} noValidate onSubmit={e => void save(e)}>
        <div className={formStyles.nameField}>
          <label className={formStyles.fieldLab} htmlFor="accDisplayNameInput">{t('profile.displayNameLabel')}</label>
          <p className={formStyles.fieldHint}>{t('profile.displayNameHint')}</p>
        </div>
        <div>
          <input id="accDisplayNameInput" className="inpField" type="text" maxLength={100}
            value={displayDraft} disabled={disabled}
            onChange={e => setDraft({ identity, serverDisplay, value: e.target.value })} />
          <button id="accDisplayNameSave" className="ghostBtn" type="submit" disabled={disabled}>{t('community.nameSave')}</button>
        </div>
        <p id="accDisplayNameMsg" className={`msg ${visibleMsg?.key === 'profile.saved' ? 'ok' : 'err'}`}
          role="status" aria-live="polite">{visibleMsg ? t(visibleMsg.key) : ''}</p>
      </form>
    </div>
  );
}
