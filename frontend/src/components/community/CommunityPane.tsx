// frontend/src/components/community/CommunityPane.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  apiClient,
  type PracticeLogDto,
  type PublicFolderDto,
} from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import { communityErrorKey } from '../../lib/community.mts';
import { t } from '../../lib/i18n.mts';
import { LogCard } from './CommunityParts';
import { CurationRows } from './CurationRows';
import { MySharesPanel } from './MySharesPanel';
import { PublicNameForm } from './PublicNameForm';
import styles from './Community.module.css';

export interface CommunityPaneProps {
  me: MeProfile | null;
}

export function CommunityPane({ me }: CommunityPaneProps) {
  const [chip, setChip] = useState<'all' | 'log'>('all');
  const [logScope, setLogScope] = useState<'all' | 'following'>('all');

  const [recentFolders, setRecentFolders] = useState<PublicFolderDto[]>([]);
  const [recentNext, setRecentNext] = useState<string | null>(null);
  const [recentErr, setRecentErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);

  const [logs, setLogs] = useState<PracticeLogDto[] | null>(null);
  const [logsNext, setLogsNext] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const recentSeq = useRef(0);
  const logSeq = useRef(0);

  // S1 recent folders — uid + seq (D16)
  useEffect(() => {
    const my = ++recentSeq.current;
    const uid = me?.id ?? null;
    setRecentFolders([]);
    setRecentNext(null);
    setRecentErr(null);
    if (!uid) return;
    apiClient.community
      .folders('recent')
      .then((res) => {
        if (my !== recentSeq.current || uid !== (auth.getMe()?.id ?? null)) return;
        setRecentFolders(Array.isArray(res?.folders) ? res.folders : []);
        setRecentNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (my !== recentSeq.current) return;
        setRecentFolders([]);
        setRecentNext(null);
        setRecentErr(communityErrorKey(e));
      });
  }, [me?.id]);

  // S1 practice logs — uid + seq (D16)
  useEffect(() => {
    const my = ++logSeq.current;
    const uid = me?.id ?? null;
    setLogs(null);
    setLogsNext(null);
    setLogErr(null);
    if (!uid || chip !== 'log') return;
    apiClient.community
      .logs(logScope)
      .then((res) => {
        if (my !== logSeq.current || uid !== (auth.getMe()?.id ?? null)) return;
        setLogs(Array.isArray(res?.logs) ? res.logs : []);
        setLogsNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (my === logSeq.current) setLogErr(communityErrorKey(e));
      });
  }, [me?.id, chip, logScope]);

  function loadMoreRecent() {
    if (!recentNext || !me?.id) return;
    const my = ++recentSeq.current;
    const uid = me.id;
    apiClient.community
      .folders('recent', recentNext)
      .then((res) => {
        if (my !== recentSeq.current || uid !== (auth.getMe()?.id ?? null)) return;
        const more = Array.isArray(res?.folders) ? res.folders : [];
        setRecentFolders((prev) => [...prev, ...more]);
        setRecentNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (my === recentSeq.current) setRecentErr(communityErrorKey(e));
      });
  }

  function loadMoreLogs() {
    if (!logsNext || !me?.id) return;
    const my = ++logSeq.current;
    const uid = me.id;
    apiClient.community
      .logs(logScope, logsNext)
      .then((res) => {
        if (my !== logSeq.current || uid !== (auth.getMe()?.id ?? null)) return;
        const more = Array.isArray(res?.logs) ? res.logs : [];
        setLogs((prev) => [...(prev ?? []), ...more]);
        setLogsNext(typeof res?.next === 'string' ? res.next : null);
      })
      .catch((e) => {
        if (my === logSeq.current) setLogErr(communityErrorKey(e));
      });
  }

  function handlePatchRecent(id: string, patch: Partial<PublicFolderDto>) {
    setRecentFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  if (!me?.id) return null;

  return (
    <div className={styles.communityPane}>
      {!me.publicName ? (
        <div id="communityNameBanner" className={styles.nameBanner}>
          <p className={styles.bannerTitle}>{t('community.nameBanner')}</p>
          <PublicNameForm
            me={me}
            inputId="communityBannerNameInput"
            submitId="communityBannerNameSave"
            inputRef={nameInputRef}
          />
        </div>
      ) : null}

      <div className={styles.chipRow}>
        <button
          type="button"
          id="chipAll"
          className={styles.chipBtn}
          data-align-group="chips:center-y"
          aria-pressed={chip === 'all'}
          onClick={() => setChip('all')}
        >
          {t('community.chipAll')}
        </button>
        <button
          type="button"
          id="chipLog"
          className={styles.chipBtn}
          data-align-group="chips:center-y"
          aria-pressed={chip === 'log'}
          onClick={() => setChip('log')}
        >
          {t('community.chipLog')}
        </button>
      </div>

      {chip === 'all' ? (
        <>
          {recentErr ? (
            <p id="recentErrMsg" role="alert" className="msg err">
              {t(recentErr.key as any, recentErr.vars)}
            </p>
          ) : null}
          <CurationRows
            variant="community"
            me={me}
            recentFolders={recentFolders}
            recentNext={recentNext}
            onLoadMoreRecent={loadMoreRecent}
            onPatchRecent={handlePatchRecent}
          />
          <MySharesPanel
            me={me}
            onRequireName={() => nameInputRef.current?.focus()}
          />
        </>
      ) : (
        <>
          <div className={styles.scopeRow}>
            <button
              type="button"
              id="logScopeAll"
              className={styles.chipBtn}
              aria-pressed={logScope === 'all'}
              onClick={() => setLogScope('all')}
            >
              {t('community.scopeAll')}
            </button>
            <button
              type="button"
              id="logScopeFollowing"
              className={styles.chipBtn}
              aria-pressed={logScope === 'following'}
              onClick={() => setLogScope('following')}
            >
              {t('community.scopeFollowing')}
            </button>
          </div>

          {logErr ? (
            <p role="alert" className="msg err">
              {t(logErr.key as any, logErr.vars)}
            </p>
          ) : null}

          {logs && logs.length === 0 ? (
            <p id="communityLogEmpty" className={styles.emptyMsg}>
              {t('community.logEmpty')}
            </p>
          ) : null}

          {logs && logs.length > 0 ? (
            <div className={styles.logFeed}>
              {logs.map((l) => (
                <LogCard key={l.user.id} log={l} />
              ))}
              {logsNext ? (
                <div className={styles.rowFooter}>
                  <button
                    type="button"
                    id="logMoreBtn"
                    className={styles.rowToggle}
                    onClick={loadMoreLogs}
                  >
                    {t('discover.more')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
