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
import { FolderRow, type QuickAddTarget } from './CommunityParts';
import { FolderSheet } from './FolderSheet';
import { QuickAddSheet } from './QuickAddSheet';
import styles from './Community.module.css';

// CMR-3 D21: 공유 딥링크 community.html#folder=<id>
const FOLDER_HASH = /^#folder=([A-Za-z0-9_-]{1,64})$/;
function folderIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const m = FOLDER_HASH.exec(window.location.hash);
  return m ? m[1] : null;
}

export interface CurationRowsProps {
  variant: 'home' | 'community';
  me: MeProfile | null;
  /** community 변형 전용: 이달의 곡 줄 다음에 끼우는 게시물 선반 */
  postsSlot?: React.ReactNode;
  /** community 변형 전용: 게시물 피드가 성공했고 0건일 때 true */
  postsEmpty?: boolean;
  /** community 변형 전용(CMR-2 D11): 전체 빈 상태 문구 아래에 붙이는 안내·CTA */
  emptyExtra?: React.ReactNode;
  /** community 변형 전용(CMR-3): 이름 모달이 열려 있거나 곧 열릴 때 true — #folder 딥링크 개방을 미룬다 */
  deferDeepLink?: boolean;
}

export function CurationRows({
  variant,
  me,
  postsSlot,
  postsEmpty,
  emptyExtra,
  deferDeepLink = false,
}: CurationRowsProps) {
  const [data, setData] = useState<CurationHomeDto | null>(null);
  const [error, setError] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // CMR-3: community 변형 전용 상태(빠른 추가 대상, 해시로 연 상세, dev mock)
  const [quick, setQuick] = useState<QuickAddTarget | null>(null);
  const openedByHash = useRef(false);
  // D26: 프로덕션 빌드에서는 import.meta.env.DEV=false로 아래 mock 경로와 동적 import가 통째로 빠진다
  const mock = import.meta.env.DEV && variant === 'community'
    && new URLSearchParams(window.location.search).get('mock') === '1';

  // S1 CurationRows 읽기 — uid + seq (frontend-state.md §1)
  const seq = useRef(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const my = ++seq.current; const uid = me?.id ?? null;
    setData(null);                                   // D16: 계정 바뀌면 이전 줄 즉시 비움
    setError(null);
    setActiveFolderId(null);
    setQuick(null);
    if (!uid) return;
    if (import.meta.env.DEV && mock) {               // CMR-3 D24: DEV ?mock=1만
      void import('../../lib/communityMock').then((m) => {
        if (my === seq.current && m.communityMockOn()) setData(m.MOCK_CURATION);
      });
      return;
    }
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
  }, [me?.id, variant, retry, mock]);

  // CMR-3 D21: 마운트·hashchange 때 #folder=<id>면 상세를 연다(community 변형만).
  // 이름 모달(CMR-2)이 열려 있거나 열릴 예정이면(deferDeepLink) 모달이 닫힌 뒤에 연다 — 두 모달 동시 개방 방지
  const [hashFolderId, setHashFolderId] = useState<string | null>(null);
  useEffect(() => {
    setHashFolderId(null);
    if (variant !== 'community' || !me?.id) return;
    const sync = () => {
      const id = folderIdFromHash();
      if (id) setHashFolderId(id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [variant, me?.id]);
  useEffect(() => {
    if (!hashFolderId || deferDeepLink) return;
    openedByHash.current = true;
    setQuick(null);
    setActiveFolderId(hashFolderId);
    setHashFolderId(null);
  }, [hashFolderId, deferDeepLink]);

  function closeCommunityFolder() {
    setActiveFolderId(null);
    if (openedByHash.current) {
      openedByHash.current = false;
      if (folderIdFromHash()) history.replaceState(null, '', '#all');
    }
  }

  // D25: mock 폴더는 상세를 열지 않는다
  function openCommunityFolder(id: string) {
    if (!id.startsWith('mock-')) setActiveFolderId(id);
  }

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
  }

  const curated = data?.curated ?? [];
  const monthlyItems = data?.monthlyPick?.items ?? [];
  const showcase = data?.showcase ?? [];
  const following = data?.following ?? [];

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

  return (
    <div className={styles.rowsStack}>
      {error ? (
        <p role="alert" className="msg err">
          {t('community.err.generic')}
          <button type="button" className="ghost mini" onClick={() => setRetry((n) => n + 1)}>{t('episode.retry')}</button>
        </p>
      ) : null}

      {data && !error && !hasHomeRows && postsEmpty === true ? (
        <div id="communityAllEmpty" className={styles.emptyMsg}>
          <p>{t('community.allEmpty')}</p>
          {emptyExtra}
        </div>
      ) : null}

      <FolderRow
        rowKey="following"
        title={t('discover.following')}
        folders={following}
        onOpenFolder={openCommunityFolder}
        onQuickAdd={setQuick}
      />
      <FolderRow
        rowKey="monthly"
        title={t('discover.monthly')}
        songItems={monthlyItems}
        onOpenFolder={openCommunityFolder}
        onQuickAdd={setQuick}
      />
      {postsSlot}
      <FolderRow
        rowKey="curated"
        title={t('discover.curated')}
        folders={curated}
        onOpenFolder={openCommunityFolder}
        onQuickAdd={setQuick}
      />
      <FolderRow
        rowKey="showcase"
        title={t('discover.showcase')}
        folders={showcase}
        onOpenFolder={openCommunityFolder}
        onQuickAdd={setQuick}
      />

      <FolderSheet
        folderId={activeFolderId}
        me={me}
        onClose={closeCommunityFolder}
        onPatchFolder={handlePatchFolder}
      />
      <QuickAddSheet
        target={quick}
        me={me}
        mock={mock}
        onClose={() => setQuick(null)}
        onOpenDetail={(id) => { setQuick(null); openCommunityFolder(id); }}
        onPatchFolder={handlePatchFolder}
      />
    </div>
  );
}
