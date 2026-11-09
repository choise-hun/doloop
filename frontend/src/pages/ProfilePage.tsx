// frontend/src/pages/ProfilePage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth, auth } from '../lib/auth';
import { t, type I18nKey } from '../lib/i18n.mts';
import { apiClient, type CommunityUserDto } from '../lib/apiClient';
import { PublicNameForm } from '../components/community/PublicNameForm';
import { MySharesPanel } from '../components/community/MySharesPanel';
import { MyEpisodeSharesPanel } from '../components/community/MyEpisodeSharesPanel';
import formStyles from '../components/community/Community.module.css';
import styles from './ProfilePage.module.css';

export function ProfilePage(): React.ReactElement {
  const authState = useAuth();
  const [busyLogout, setBusyLogout] = useState(false);
  const generation = auth.getSessionGeneration();
  const [msg, setMsg] = useState<{
    text: string; kind: 'ok' | 'err' | ''; uid: string | null; generation: number;
  } | null>(null);
  const logoutRef = useRef<{ generation: number } | null>(null);

  const currentUser = authState.user;
  const currentUid = currentUser?.id ?? null;
  const mountedRef = useRef(true);

  useEffect(() => {
    document.title = 'Profile · ULeveLP';
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setMsg(previous => previous?.uid === currentUid && previous.generation === generation ? previous : null);
    setBusyLogout(false);
  }, [currentUid, generation]);

  const visibleMsg = msg?.uid === currentUid && msg.generation === generation ? msg : null;

  const isMeMatching = Boolean(
    authState.me && currentUser && authState.me.id === currentUser.id
  );
  const email = (isMeMatching && authState.me?.email) || currentUser?.email || null;
  const rawDisplayName = isMeMatching ? authState.me?.displayName?.trim() : null;
  const displayName = rawDisplayName ? rawDisplayName : null;
  const rawPublicName = isMeMatching ? authState.me?.publicName?.trim() : null;
  const publicName = rawPublicName ? rawPublicName : null;

  const embedded = auth.isEmbedded();

  const identity = `${currentUid ?? ''}:${generation}`;
  const identityNow = () => `${auth.getUser()?.id ?? ''}:${auth.getSessionGeneration()}`;
  const me = isMeMatching ? authState.me : null;
  const serverDisplay = me?.displayName ?? '';
  const [draft, setDraft] = useState({ identity, serverDisplay, value: serverDisplay });
  const displayDraft = me && draft.identity === identity && draft.serverDisplay === serverDisplay ? draft.value : serverDisplay;
  const [nameMsg, setNameMsg] = useState<{ identity: string; key: I18nKey } | null>(null);
  const saveRef = useRef<{ identity: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [retryingMe, setRetryingMe] = useState<string | null>(null);
  const retryRef = useRef<object | null>(null);
  const [retry, setRetry] = useState(0);
  const summaryKey = me && publicName && !embedded ? `${identity}:${publicName}:${retry}` : '';
  const [summary, setSummary] = useState<{ key: string; controller: AbortController; data?: CommunityUserDto; failed?: boolean } | null>(null);
  const summaryRef = useRef<AbortController | null>(null);
  const currentSummary = summaryKey && summary?.key === summaryKey && summary.controller === summaryRef.current &&
    !summary.controller.signal.aborted ? summary : null;
  const summaryData = currentSummary?.data;
  const summaryFailed = Boolean(currentSummary?.failed);
  const summaryLoading = Boolean(summaryKey && !summaryData && !summaryFailed);
  const saveBusy = saving === identity;
  const namesDisabled = !me || saveBusy;
  const visibleNameMsg = nameMsg?.identity === identity ? nameMsg : null;

  useEffect(() => { setDraft({ identity, serverDisplay, value: serverDisplay }); }, [identity, serverDisplay, isMeMatching]);

  useEffect(() => auth.onChange(() => {
    if (identityNow() !== identity) {
      saveRef.current = null;
      retryRef.current = null;
      summaryRef.current?.abort();
      setSaving(null);
      setRetryingMe(null);
    }
  }), [identity]);

  useEffect(() => {
    if (currentUid && !embedded && location.hash === '#profileNames') {
      document.getElementById('profileNames')?.scrollIntoView();
    }
  }, [currentUid, embedded]);

  useEffect(() => {
    if (!summaryKey || !currentUid || identityNow() !== identity || auth.getMe()?.id !== currentUid) return;
    const controller = new AbortController();
    summaryRef.current = controller;
    const valid = () => mountedRef.current && !controller.signal.aborted &&
      summaryRef.current === controller && identityNow() === identity;
    setSummary({ controller, key: summaryKey });
    void apiClient.community.user(currentUid, { signal: controller.signal }).then(data => {
      if (!valid()) return;
      if (data.id !== currentUid) { setSummary({ controller, key: summaryKey, failed: true }); return; }
      setSummary({ controller, key: summaryKey, data });
    }, () => { if (valid()) setSummary({ controller, key: summaryKey, failed: true }); });
    return () => { controller.abort(); if (summaryRef.current === controller) summaryRef.current = null; };
  }, [summaryKey, currentUid]);

  function acquireSave(): (() => void) | null {
    if (saveRef.current || identityNow() !== identity || auth.getMe()?.id !== currentUid) return null;
    const action = { identity };
    saveRef.current = action;
    setSaving(identity);
    return () => {
      if (mountedRef.current && saveRef.current === action && identityNow() === identity) {
        saveRef.current = null;
        setSaving(null);
      }
    };
  }

  async function saveDisplay(e: React.FormEvent) {
    e.preventDefault();
    if (namesDisabled) return;
    const release = acquireSave();
    if (!release) return;
    const action = saveRef.current;
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
    } finally { release(); }
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

  const handleLogout = async () => {
    // React state commits after the event: a ref also blocks same-tick clicks.
    if (logoutRef.current?.generation === auth.getSessionGeneration()) return;
    const action = { generation: auth.getSessionGeneration() };
    logoutRef.current = action;
    setBusyLogout(true);
    setMsg(null);
    const actionUid = currentUser?.id ?? null;
    const isCurrent = () => mountedRef.current && logoutRef.current === action &&
      auth.getSessionGeneration() === action.generation;
    try {
      const promise = auth.signOut();
      action.generation = auth.getSessionGeneration();
      await promise;
      if (isCurrent() && auth.getUser() === null) {
        setMsg({ text: t('settings.logoutSuccess'), kind: 'ok', uid: null, generation: action.generation });
      }
    } catch {
      if (isCurrent() && (auth.getUser()?.id ?? null) === actionUid) {
        setMsg({ text: t('settings.logoutFail'), kind: 'err', uid: actionUid, generation: action.generation });
      }
    } finally {
      if (isCurrent()) {
        logoutRef.current = null;
        setBusyLogout(false);
      }
    }
  };

  return (
    <AppShell variant="narrow" activeNav="profile">
      <div className={styles.headerBlock} data-align-group="profileCol:left; profileEdges:right">
        <h1 id="profileTitle" className={`page-title ${styles.pageTitle}`}>Profile</h1>
      </div>

      <section
        id="profileAccount"
        className={styles.accountCard}
        data-align-group="profileCol:left; profileEdges:right"
        aria-labelledby="profileAccountTitle"
      >
        <h2 id="profileAccountTitle">{t('settings.secAccount')}</h2>

        {!currentUser ? (
          <div id="profileGuest" className={styles.stack}>
            <a
              id="profileLoginLink"
              className="pillBtn"
              href="settings.html#account"
              target={embedded ? '_blank' : undefined}
              rel={embedded ? 'noopener' : undefined}
            >
              {embedded ? t('settings.loginBlank') : t('settings.loginGoogle')}
            </a>
          </div>
        ) : (
          <div id="profileUser" className={styles.stack}>
            {email ? (
              <p id="profileEmail">
                {t('settings.accEmailLabel')} {email}
              </p>
            ) : null}
            {displayName ? <p id="profileDisplayName">{displayName}</p> : null}
            {publicName ? (
              <p id="profilePublicName">
                {t('community.nameLabel')}: {publicName}
              </p>
            ) : null}
            <button
              id="profileLogout"
              type="button"
              className="ghostBtn"
              disabled={busyLogout}
              onClick={handleLogout}
            >
              {t('settings.logoutBtn')}
            </button>
          </div>
        )}

        <p
          id="profileAuthMsg"
          className={`msg${visibleMsg?.kind ? ' ' + visibleMsg.kind : ''}`}
          role="status"
          aria-live="polite"
        >
          {visibleMsg?.text}
        </p>

        <a id="profileSettingsLink" className="ghostBtn" href="settings.html">
          {t('nav.settings')}
        </a>
      </section>
      {currentUser && !embedded ? <>
        <section id="profileNames" className={styles.accountCard}
          data-align-group="profileCol:left; profileEdges:right" aria-labelledby="profileNamesTitle">
          <h2 id="profileNamesTitle">{t('profile.namesTitle')}</h2>
          {!me ? <>
            <p id="profileMeStatus" role="status" aria-live="polite">{t('profile.meUnavailable')}</p>
            <button id="profileMeRetry" className="ghostBtn" disabled={retryingMe === identity}
              onClick={() => void retryMe()}>{t('record.retry')}</button>
          </> : null}
          <form id="profileDisplayNameForm" className={formStyles.nameForm} noValidate onSubmit={e => void saveDisplay(e)}>
            <div className={formStyles.nameField}>
              <label className={formStyles.fieldLab} htmlFor="profileDisplayNameInput">{t('profile.displayNameLabel')}</label>
              <p className={formStyles.fieldHint}>{t('profile.displayNameHint')}</p>
            </div>
            <div className={styles.stack}>
              <input id="profileDisplayNameInput" className="inpField" type="text" maxLength={100}
                value={displayDraft} disabled={namesDisabled}
                onChange={e => setDraft({ identity, serverDisplay, value: e.target.value })} />
              <button id="profileDisplayNameSave" className="ghostBtn" type="submit" disabled={namesDisabled}>{t('community.nameSave')}</button>
            </div>
            <p id="profileDisplayNameMsg" className={`msg ${visibleNameMsg?.key === 'profile.saved' ? 'ok' : 'err'}`}
              role="status" aria-live="polite">{visibleNameMsg ? t(visibleNameMsg.key) : ''}</p>
          </form>
          <PublicNameForm key={identity} me={me} inputId="profilePublicNameInput" submitId="profilePublicNameSave"
            disabled={namesDisabled} acquireSave={acquireSave}
            onSaved={name => { if (name === publicName) setRetry(n => n + 1); }} />
        </section>
        <section id="profileSummary" className={styles.accountCard}
          data-align-group="profileCol:left; profileEdges:right" aria-labelledby="profileSummaryTitle">
          <h2 id="profileSummaryTitle">{t('profile.summaryTitle')}</h2>
          <p>{t('profile.summaryHint')}</p>
          {me ? <p id="profileTier">{t('profile.tierLabel')}: {t(me.tier === 'free' ? 'tier.free' :
            me.tier === 'pro' ? 'tier.pro' : me.tier === 'pro_plus' ? 'tier.proPlus' : 'profile.tierUnknown')}</p> : null}
          {summaryData ? <div id="profilePublicSummary" className={styles.stack}>
            <p id="profileSummaryName">{summaryData.publicName}</p>
            {summaryData.isCreator ? <p id="profileCreator">{summaryData.creatorBadge || t('folder.creator')}</p> : null}
            {summaryData.creatorBio ? <p id="profileBio">{summaryData.creatorBio}</p> : null}
            <p id="profileFollowers">{t('profile.followers', { count: summaryData.followerCount })}</p>
          </div> : <p id="profileSummaryStatus" role="status" aria-live="polite">{t(!me ? 'profile.meUnavailable' :
            !publicName ? 'profile.summaryEmpty' : summaryFailed ? 'profile.summaryFailed' : 'profile.summaryLoading')}</p>}
          {summaryKey && !summaryData ? <button id="profileSummaryRetry" className="ghostBtn" disabled={summaryLoading}
            onClick={() => setRetry(n => n + 1)}>{t('record.retry')}</button> : null}
        </section>
        {me ? <React.Fragment key={identity}>
          <section id="profileFolders" className={`${styles.accountCard} ${styles.profileFolders}`}
            data-align-group="profileCol:left; profileEdges:right" aria-labelledby="profileFoldersTitle">
            <h2 id="profileFoldersTitle">{t('community.mySharesLink')}</h2>
            <MySharesPanel me={me} onRequireName={() => document.getElementById('profilePublicNameInput')?.focus()} />
          </section>
          <MyEpisodeSharesPanel />
        </React.Fragment> : null}
      </> : null}

    </AppShell>
  );
}
