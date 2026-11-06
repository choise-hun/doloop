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
import styles from './Community.module.css';

export function folderTitle(folder: Pick<PublicFolderDto, 'title' | 'titleI18n'>): string {
  return i18nPick(folder.titleI18n, getLang(), folder.title);
}

export function CoverArt({ coverVideoIds }: { coverVideoIds?: string[] }) {
  const ids = coverIds(coverVideoIds);
  if (ids.length === 4) {
    return (
      <div className={styles.coverMosaic}>
        {ids.map((vid, idx) => (
          <img key={`${vid}-${idx}`} src={thumb(vid)} alt="" loading="lazy" />
        ))}
      </div>
    );
  }
  if (ids.length === 1) {
    return <img className={styles.coverImg} src={thumb(ids[0])} alt="" loading="lazy" />;
  }
  return <div className={styles.coverEmpty} aria-hidden="true" />;
}

export interface FolderCardProps {
  folder: PublicFolderDto;
  onOpen: (folderId: string) => void;
}

export function FolderCard({ folder, onOpen }: FolderCardProps) {
  const title = folderTitle(folder);
  const sub = folderSubtitle(folder.artists, folder.itemCount);
  const isCreator = Boolean(folder.owner?.isCreator);
  const badgeText = folder.owner?.creatorBadge || t('folder.creator');

  return (
    <button
      type="button"
      className={styles.folderCard}
      data-folder-id={folder.id}
      data-align-group="discoverCards:top,height"
      onClick={() => onOpen(folder.id)}
    >
      <div className={styles.cardCoverWrap}>
        <CoverArt coverVideoIds={folder.coverVideoIds} />
      </div>
      <div className={styles.cardTitleBand}>
        <span className={styles.cardTitleText} data-layout-ignore="G3: 카드 제목 말줄임">
          {title}
        </span>
      </div>
      <div className={styles.cardMetaArea}>
        <p className={styles.cardSubtitle} data-layout-ignore="G3: 카드 부제 두 줄 말줄임">
          {sub || '\u00A0'}
        </p>
        <div className={styles.cardFooter}>
          {isCreator ? (
            <span className={styles.creatorBadge} data-layout-ignore="G3: 배지 말줄임">
              {badgeText}
            </span>
          ) : (
            <span className={styles.segBadge}>{folder.owner?.publicName || ''}</span>
          )}
        </div>
      </div>
    </button>
  );
}

export interface SongCardProps {
  item: PublicFolderItemDto;
}

export function SongCard({ item }: SongCardProps) {
  const title = item.title || item.videoId;
  const sub = item.artist || '';
  const seg = segText(item.a, item.b, item.rate);

  return (
    <a
      className={styles.songCard}
      href={itemPracticeHref(item)}
      data-video-id={item.videoId}
      data-align-group="discoverCards:top,height"
    >
      <div className={styles.cardCoverWrap}>
        <img className={styles.coverImg} src={thumb(item.videoId)} alt="" loading="lazy" />
      </div>
      <div className={styles.cardTitleBand}>
        <span className={styles.cardTitleText} data-layout-ignore="G3: 카드 제목 말줄임">
          {title}
        </span>
      </div>
      <div className={styles.cardMetaArea}>
        <p className={styles.cardSubtitle} data-layout-ignore="G3: 카드 부제 두 줄 말줄임">
          {sub || '\u00A0'}
        </p>
        <div className={styles.cardFooter}>
          <span className={styles.segBadge} data-layout-ignore="G3: 구간 말줄임">
            {seg}
          </span>
        </div>
      </div>
    </a>
  );
}

export interface FolderRowProps {
  rowKey: string;
  title: string;
  folders?: PublicFolderDto[];
  songItems?: PublicFolderItemDto[];
  onOpenFolder: (folderId: string) => void;
  footerAction?: React.ReactNode;
}

export function FolderRow({
  rowKey,
  title,
  folders,
  songItems,
  onOpenFolder,
  footerAction,
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
          data-layout-ignore="G3: 줄 제목 말줄임"
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
              <SongCard key={`${item.videoId}-${idx}`} item={item} />
            ))
          : visibleFolders.map((f) => (
              <FolderCard key={f.id} folder={f} onOpen={onOpenFolder} />
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
            <span className={styles.creatorBadge} data-layout-ignore="G3: 배지 말줄임">
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
