// frontend/src/pages/ProfilePage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth, auth } from '../lib/auth';
import { t } from '../lib/i18n.mts';
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
    </AppShell>
  );
}
