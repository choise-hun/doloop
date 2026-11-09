// frontend/src/components/community/CurationRows.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  apiClient,
  type CurationHomeDto,
  type PublicFolderDto,
} from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import {
  communityErrorKey,
  normalizeCurationHome,
} from '../../lib/community.mts';
import { t } from '../../lib/i18n.mts';
import { FolderRow } from './CommunityParts';
import { FolderSheet } from './FolderSheet';
import styles from './Community.module.css';

export interface CurationRowsProps {
  variant: 'home' | 'community';
  me: MeProfile | null;
  recentFolders?: PublicFolderDto[];
  recentNext?: string | null;
  onLoadMoreRecent?: () => void;
  onPatchRecent?: (id: string, patch: Partial<PublicFolderDto>) => void;
}

export function CurationRows({
  variant,
  me,
  recentFolders,
  recentNext,
  onLoadMoreRecent,
  onPatchRecent,
}: CurationRowsProps) {
  const [data, setData] = useState<CurationHomeDto | null>(null);
  const [error, setError] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // S1 CurationRows / CommunityPane 읽기 — uid + seq (frontend-state.md §1)
  const seq = useRef(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const my = ++seq.current; const uid = me?.id ?? null;
    setData(null);                                   // D16: 계정 바뀌면 이전 줄 즉시 비움
    setError(null);
    setActiveFolderId(null);
    if (!uid) return;
    apiClient.curation.home().then((raw) => {
      if (my !== seq.current || uid !== (auth.getMe()?.id ?? null)) return;
      setData(normalizeCurationHome(raw) as CurationHomeDto);            // D12
    }).catch((e) => {
      if (my === seq.current) {
        if (variant === 'home') console.warn('curation home fetch failed', e);
        setError(communityErrorKey(e));
      }
    });
    return () => { seq.current++; };
  }, [me?.id, variant, retry]);

  function handlePatchFolder(id: string, patch: Partial<PublicFolderDto>) {
    setData((prev) => {
      if (!prev) return prev;
      const patchList = (list: PublicFolderDto[]) =>
        list.map((f) => (f.id === id ? { ...f, ...patch } : f));
      return {
        ...prev,
        curated: patchList(prev.curated),
        showcase: patchList(prev.showcase),
        following: patchList(prev.following),
      };
    });
    onPatchRecent?.(id, patch);
  }

  const curated = data?.curated ?? [];
  const monthlyItems = data?.monthlyPick?.items ?? [];
  const showcase = data?.showcase ?? [];
  const following = data?.following ?? [];
  const recent = recentFolders ?? [];

  const hasHomeRows =
    curated.length > 0 ||
    monthlyItems.length > 0 ||
    showcase.length > 0 ||
    following.length > 0;

  if (variant === 'home') {
    if (!me?.id || error || !data || !hasHomeRows) return null;
    return (
      <section
        id="discover"
        className={styles.discoverSection}
        aria-labelledby="discoverHeading"
      >
        <h2 id="discoverHeading" className={styles.discoverTitle}>
          {t('discover.title')}
        </h2>
        <div className={styles.rowsStack}>
          <FolderRow
            rowKey="curated"
            title={t('discover.curated')}
            folders={curated}
            onOpenFolder={setActiveFolderId}
          />
          <FolderRow
            rowKey="monthly"
            title={t('discover.monthly')}
            songItems={monthlyItems}
            onOpenFolder={setActiveFolderId}
          />
          <FolderRow
            rowKey="showcase"
            title={t('discover.showcase')}
            folders={showcase}
            onOpenFolder={setActiveFolderId}
          />
          <FolderRow
            rowKey="following"
            title={t('discover.following')}
            folders={following}
            onOpenFolder={setActiveFolderId}
          />
        </div>
        <FolderSheet
          folderId={activeFolderId}
          me={me}
          onClose={() => setActiveFolderId(null)}
          onPatchFolder={handlePatchFolder}
        />
      </section>
    );
  }

  const hasCommunityRows = hasHomeRows || recent.length > 0;

  return (
    <div className={styles.rowsStack}>
      {error ? (
        <p role="alert" className="msg err">
          {t('community.err.generic')}
          <button type="button" className="ghost mini" onClick={() => setRetry((n) => n + 1)}>{t('episode.retry')}</button>
        </p>
      ) : null}

      {data && !error && !hasCommunityRows ? (
        <p className={styles.emptyMsg}>{t('discover.empty')}</p>
      ) : null}

      <FolderRow
        rowKey="curated"
        title={t('discover.curated')}
        folders={curated}
        onOpenFolder={setActiveFolderId}
      />
      <FolderRow
        rowKey="monthly"
        title={t('discover.monthly')}
        songItems={monthlyItems}
        onOpenFolder={setActiveFolderId}
      />
      <FolderRow
        rowKey="showcase"
        title={t('discover.showcase')}
        folders={showcase}
        onOpenFolder={setActiveFolderId}
      />
      <FolderRow
        rowKey="following"
        title={t('discover.following')}
        folders={following}
        onOpenFolder={setActiveFolderId}
      />
      <FolderRow
        rowKey="recent"
        title={t('discover.recent')}
        folders={recent}
        onOpenFolder={setActiveFolderId}
        footerAction={
          recentNext && onLoadMoreRecent ? (
            <button
              type="button"
              id="recentMoreBtn"
              className={styles.rowToggle}
              onClick={onLoadMoreRecent}
            >
              {t('discover.more')}
            </button>
          ) : null
        }
      />

      <FolderSheet
        folderId={activeFolderId}
        me={me}
        onClose={() => setActiveFolderId(null)}
        onPatchFolder={handlePatchFolder}
      />
    </div>
  );
}
