// frontend/src/components/community/CommunityParts.tsx
import React, { useState } from 'react';
import type { PublicFolderDto, PublicFolderItemDto, PracticeLogDto } from '../../lib/apiClient';
import {
  coverIds,
  durationText,
  folderSubtitle,
  i18nPick,
  itemPracticeHref,
  segText,
} from '../../lib/community.mts';
import { getLang, t } from '../../lib/i18n.mts';
import { thumb } from '../../lib/security';
import { useLongPress } from './QuickAddSheet';
import styles from './Community.module.css';

/** CMR-3 D5: 빠른 추가(+ 버튼·꾹 누르기)가 여는 하단 시트 대상 */
export type QuickAddTarget =
  | { kind: 'folder'; folder: PublicFolderDto }
  | { kind: 'song'; item: PublicFolderItemDto };

export function folderTitle(folder: Pick<PublicFolderDto, 'title' | 'titleI18n'>): string {
  return i18nPick(folder.titleI18n, getLang(), folder.title);
}

/** CMR-3 D1·D3(RV-5): 표지는 1장. coverVideoId → coverVideoIds 첫 ID → 검은 빈 표지(+제목) */
export function CoverArt({
  coverVideoId,
  coverVideoIds,
  label,
}: {
  coverVideoId?: string | null;
  coverVideoIds?: string[];
  label?: string;
}) {
  const own = typeof coverVideoId === 'string' ? coverVideoId.trim() : '';
  const id = own || coverIds(coverVideoIds)[0] || '';
  if (id) {
    return <img className={styles.coverImg} src={thumb(id)} alt="" loading="lazy" />;
  }
  return (
    <div className={styles.coverEmpty} aria-hidden="true">
      {label ? (
        <span
          className={styles.coverLabel}
          data-layout-ignore="G3: 표지 제목 말줄임" // i18n-keep: G3 레이아웃 무시 속성(CMR-3 §8)
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** CMR-3 D4·D6: quickAdd가 있을 때만 셸로 감싸고 형제로 + 버튼을 둔다(버튼 안 버튼 금지) */
function QuickAddShell({
  title,
  onQuickAdd,
  children,
}: {
  title: string;
  onQuickAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.cardShell}>
      {children}
      <button
        type="button"
        className={styles.quickAddBtn}
        data-quick-add=""
        aria-label={t('folder.quickAddAria', { title })}
        onClick={(e) => {
          e.stopPropagation();
          onQuickAdd();
        }}
      >
        +
      </button>
    </div>
  );
}

export interface FolderCardProps {
  folder: PublicFolderDto;
  onOpen: (folderId: string) => void;
  onQuickAdd?: (target: QuickAddTarget) => void;
}

export function FolderCard({ folder, onOpen, onQuickAdd }: FolderCardProps) {
  const title = folderTitle(folder);
  const sub = folderSubtitle(folder.artists, folder.itemCount);
  const isCreator = Boolean(folder.owner?.isCreator);
  const badgeText = folder.owner?.creatorBadge || t('folder.creator');
  const fire = () => onQuickAdd?.({ kind: 'folder', folder });
  const press = useLongPress(fire);

  const card = (
    <button
      type="button"
      className={styles.folderCard}
      data-folder-id={folder.id}
      data-align-group="discoverCards:top,height"
      onClick={() => onOpen(folder.id)}
      {...(onQuickAdd ? press : null)}
    >
      <div className={styles.cardCoverWrap}>
        <CoverArt coverVideoId={folder.coverVideoId} coverVideoIds={folder.coverVideoIds} label={title} />
      </div>
      <div className={styles.cardTitleBand}>
        <span className={styles.cardTitleText}
          data-layout-ignore={
            'G3: 카드 제목 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
          }
        >
          {title}
        </span>
      </div>
      <div className={styles.cardMetaArea}>
        <p className={styles.cardSubtitle}
          data-layout-ignore={
            'G3: 카드 부제 두 줄 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
          }
        >
          {sub || '\u00A0'}
        </p>
        <div className={styles.cardFooter}>
          {isCreator ? (
            <span className={styles.creatorBadge}
              data-layout-ignore={
                'G3: 배지 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
              }
            >
              {badgeText}
            </span>
          ) : (
            <span className={styles.segBadge}>{folder.owner?.publicName || ''}</span>
          )}
        </div>
      </div>
    </button>
  );
  if (!onQuickAdd) return card;
  return <QuickAddShell title={title} onQuickAdd={fire}>{card}</QuickAddShell>;
}

export interface SongCardProps {
  item: PublicFolderItemDto;
  onQuickAdd?: (target: QuickAddTarget) => void;
}

export function SongCard({ item, onQuickAdd }: SongCardProps) {
  const title = item.title || item.videoId;
  const sub = item.artist || '';
  const seg = segText(item.a, item.b, item.rate);
  const fire = () => onQuickAdd?.({ kind: 'song', item });
  const press = useLongPress(fire);

  const card = (
    <a
      className={styles.songCard}
      href={itemPracticeHref(item)}
      data-video-id={item.videoId}
      data-align-group="discoverCards:top,height"
      {...(onQuickAdd ? press : null)}
    >
      <div className={styles.cardCoverWrap}>
        <img className={styles.coverImg} src={thumb(item.videoId)} alt="" loading="lazy" />
      </div>
      <div className={styles.cardTitleBand}>
        <span className={styles.cardTitleText}
          data-layout-ignore={
            'G3: 카드 제목 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
          }
        >
          {title}
        </span>
      </div>
      <div className={styles.cardMetaArea}>
        <p className={styles.cardSubtitle}
          data-layout-ignore={
            'G3: 카드 부제 두 줄 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
          }
        >
          {sub || '\u00A0'}
        </p>
        <div className={styles.cardFooter}>
          <span className={styles.segBadge}
            data-layout-ignore={
              'G3: 구간 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
            }
          >
            {seg}
          </span>
        </div>
      </div>
    </a>
  );
  if (!onQuickAdd) return card;
  return <QuickAddShell title={title} onQuickAdd={fire}>{card}</QuickAddShell>;
}

export interface FolderRowProps {
  rowKey: string;
  title: string;
  folders?: PublicFolderDto[];
  songItems?: PublicFolderItemDto[];
  onOpenFolder: (folderId: string) => void;
  footerAction?: React.ReactNode;
  /** CMR-3 D5: community 변형만 전달. 없으면 카드 DOM은 현행 그대로 */
  onQuickAdd?: (target: QuickAddTarget) => void;
}

export function FolderRow({
  rowKey,
  title,
  folders,
  songItems,
  onOpenFolder,
  footerAction,
  onQuickAdd,
}: FolderRowProps) {
  const [expanded, setExpanded] = useState(false);

  const hasSongs = Array.isArray(songItems) && songItems.length > 0;
  const hasFolders = Array.isArray(folders) && folders.length > 0;
  if (!hasSongs && !hasFolders) return null;

  const visibleSongs = hasSongs ? songItems.slice(0, 20) : [];
  const visibleFolders = hasFolders ? folders.slice(0, 20) : [];

  return (
    <section className={styles.rowSection} data-row={rowKey}>
      <div className={styles.rowHead}>
        <h3
          className={styles.rowTitle}
          data-align-group="rowHead:center-y"
          data-layout-ignore="G3: 줄 제목 말줄임" // i18n-keep: G3 레이아웃 무시 속성(D5-3)
        >
          {title}
        </h3>
        <button
          type="button"
          className={styles.rowToggle}
          data-align-group="rowHead:center-y"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? t('discover.collapse') : t('discover.showAll')}
        </button>
      </div>
      <div className={expanded ? styles.cardGrid : styles.cardScroller}>
        {hasSongs
          ? visibleSongs.map((item, idx) => (
              <SongCard key={`${item.videoId}-${idx}`} item={item} onQuickAdd={onQuickAdd} />
            ))
          : visibleFolders.map((f) => (
              <FolderCard key={f.id} folder={f} onOpen={onOpenFolder} onQuickAdd={onQuickAdd} />
            ))}
      </div>
      {footerAction ? <div className={styles.rowFooter}>{footerAction}</div> : null}
    </section>
  );
}

export interface LogCardProps {
  log: PracticeLogDto;
}

export function LogCard({ log }: LogCardProps) {
  const isCreator = Boolean(log.user?.isCreator);
  const badgeText = log.user?.creatorBadge || t('folder.creator');

  return (
    <article className={styles.logCard} data-user-id={log.user.id}>
      <div className={styles.logCardHead}>
        <div className={styles.logUserGroup}>
          <strong className={styles.logUserName}>{log.user.publicName}</strong>
          {isCreator ? (
            <span className={styles.creatorBadge}
              data-layout-ignore={
                'G3: 배지 말줄임' // i18n-keep: G3 레이아웃 무시 속성(D5-3)
              }
            >
              {badgeText}
            </span>
          ) : null}
        </div>
        <span className={styles.logStats}>
          {t('community.streak', { n: log.streakDays })} ·{' '}
          {t('community.week', { time: durationText(log.thisWeekSeconds) })}
        </span>
      </div>
      {Array.isArray(log.today) && log.today.length > 0 ? (
        <div className={styles.logTodayBlock}>
          <span className={styles.logTodayLabel}>{t('community.today')}</span>
          <ul className={styles.logSongList}>
            {log.today.map((s, idx) => (
              <li key={`${s.videoId}-${idx}`} className={styles.logSongItem}>
                <a className={styles.logSongLink} href={itemPracticeHref({ videoId: s.videoId })}>
                  {s.title || s.videoId}
                </a>
                {s.artist ? <span className={styles.logSongMeta}>· {s.artist}</span> : null}
                <span className={styles.logSongMeta}>({durationText(s.seconds)})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
