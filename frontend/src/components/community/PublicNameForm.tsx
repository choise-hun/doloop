// frontend/src/components/community/PublicNameForm.tsx
import React, { useEffect, useRef, useState } from 'react';
import { apiClient, type ShareConsentDto } from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import { communityErrorKey, kstDate } from '../../lib/community.mts';
import { t, type I18nKey } from '../../lib/i18n.mts';
import styles from './Community.module.css';
import { ShareConsentStep } from '../songRecord/ShareConsentStep';

export interface PublicNameFormProps {
  me: MeProfile | null;
  inputId?: string;
  submitId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onSaved?: (publicName: string) => void;
  disabled?: boolean;
  acquireSave?: () => (() => void) | null;
}

export function PublicNameForm({
  me, inputId = 'publicNameInput', submitId = 'publicNameSaveBtn', inputRef, onSaved,
  disabled = false, acquireSave,
}: PublicNameFormProps) {
  const identityNow = () => `${auth.getUser()?.id ?? ''}:${auth.getSessionGeneration()}`;
  const identity = identityNow();
  const matching = Boolean(me && me.id === auth.getUser()?.id);
  const serverName = matching ? me?.publicName ?? '' : '';
  const [draft, setDraft] = useState({ identity, serverName, value: serverName });
  const name = matching && draft.identity === identity && draft.serverName === serverName ? draft.value : serverName;
  const [err, setErr] = useState<{ identity: string; key: I18nKey; vars?: Record<string, string> } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const operation = useRef<{ identity: string; controller: AbortController; release: () => void } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      const old = operation.current;
      operation.current = null;
      old?.controller.abort();
      old?.release();
    };
    const unsubscribe = auth.onChange(() => {
      if (operation.current && operation.current.identity !== identityNow()) {
        cancel();
        setPending(null);
      }
    });
    return () => { mounted.current = false; unsubscribe(); cancel(); };
  }, []);
  useEffect(() => { setDraft({ identity, serverName, value: serverName }); }, [identity, serverName, matching]);
  const busy = pending === identity;

  // S3b-3 U2: 아직 카드 공유 동의가 없으면 이름 폼에 선택 동의(기본 해제)를 함께 보인다.
  const [consent, setConsent] = useState<{ identity: string; dto: ShareConsentDto } | null>(null);
  const [consentChecked, setConsentChecked] = useState<{ identity: string; value: boolean }>({ identity, value: false });
  const agreeChecked = consentChecked.identity === identity && consentChecked.value;
  useEffect(() => {
    if (!matching) return;
    const controller = new AbortController();
    apiClient.community.shareConsent(controller.signal)
      .then((dto) => { if (mounted.current && identityNow() === identity) setConsent({ identity, dto }); })
      .catch(() => { /* 조회 실패면 선택 동의를 숨긴다(공유 창이 다시 묻는다) */ });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, matching]);
  const currentConsent = consent?.identity === identity ? consent.dto : null;
  const askConsent = Boolean(currentConsent && !currentConsent.cardShareAllowed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !matching || operation.current || identityNow() !== identity || auth.getMe()?.id !== me?.id) return;
    setErr(null);
    const val = name.trim();
    if (/\s/.test(val) || val.length < 2 || val.length > 20) {
      setErr({ identity, key: 'community.err.nameFormat' });
      return;
    }
    const release = acquireSave ? acquireSave() : () => {};
    if (!release) return;
    const action = { identity, controller: new AbortController(), release };
    operation.current = action;
    const valid = () => mounted.current && operation.current === action && identityNow() === identity;
    setPending(identity);
    try {
      const res = await apiClient.community.setPublicName(val, { signal: action.controller.signal });
      if (!valid()) return;
      const refreshed = await auth.fetchMe();
      if (!valid()) return;
      if (!res.publicName || refreshed?.id !== me?.id || refreshed?.publicName !== res.publicName ||
          auth.getMe()?.id !== refreshed.id || auth.getMe()?.publicName !== res.publicName) {
        setErr({ identity, key: 'profile.nameRefreshFailed' });
        return;
      }
      // 이름 저장이 성공한 뒤에만, 체크했을 때만 동의를 기록한다.
      if (askConsent && agreeChecked && currentConsent) {
        try {
          const dto = await apiClient.community.agreeShareConsent(currentConsent.noticeVersion, action.controller.signal);
          if (!valid()) return;
          setConsent({ identity, dto });
        } catch {
          if (!valid()) return;
          // 동의 기록 실패는 이름 저장을 되돌리지 않는다. 공유 창이 동의 단계를 다시 보인다.
        }
      }
      onSaved?.(res.publicName);
    } catch (error) {
      if (valid() && !(error instanceof Error && error.name === 'AbortError')) {
        const mapped = communityErrorKey(error); // 기존 매퍼는 사전에 존재하는 community/playlist/folder 키를 반환한다.
        setErr({ identity, key: mapped.key as I18nKey, vars: mapped.vars });
      }
    } finally {
      if (valid()) { operation.current = null; setPending(null); action.release(); }
    }
  }

  const lockDate = matching && me?.publicNameNextChangeAt ? kstDate(me.publicNameNextChangeAt) : '';
  const locked = disabled || busy || !matching;
  return (
    <form className={styles.nameForm} onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className={styles.nameField}>
        <label className={styles.fieldLab} htmlFor={inputId}>{t('community.nameLabel')}</label>
        <p className={styles.fieldHint}>{t('community.nameHint')}</p>
      </div>
      <div className={styles.nameInputRow}>
        <input ref={inputRef} id={inputId} type="text" className={`inpField ${styles.nameInput}`}
          value={name} maxLength={30} disabled={locked}
          onChange={(e) => setDraft({ identity, serverName, value: e.target.value })} />
        <button type="submit" id={submitId} className="pillBtn" disabled={locked}>{t('community.nameSave')}</button>
      </div>
      {askConsent ? (
        <ShareConsentStep
          variant="nameForm"
          busy={busy}
          onAgree={() => setConsentChecked({ identity, value: true })}
          checked={agreeChecked}
          onCheckedChange={(value) => setConsentChecked({ identity, value })}
        />
      ) : null}
      {lockDate ? <p className={styles.fieldHint}>{t('community.nameLocked', { date: lockDate })}</p> : null}
      {err?.identity === identity ? <p role="alert" className={`msg err ${styles.formMsg}`}>{t(err.key, err.vars)}</p> : null}
    </form>
  );
}
