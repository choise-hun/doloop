// frontend/src/components/songRecord/SongRecordPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { SafeLink } from '../common/SafeLink';
import { auth, useAuth } from '../../lib/auth';
import { apiClient, SongDetailResponse, TakeDto } from '../../lib/apiClient';
import { t } from '../../lib/i18n.mts';
import {
  AbCompare,
  fmtDuration,
  SessionTimeline,
  sortAbTakes,
  TakeItemRow,
} from './SongRecordParts';
import styles from './SongRecordParts.module.css';

export interface SongRecordPanelProps {
  songId: string | null;
  loggedIn: boolean;
  reloadKey: number;
}

export function SongRecordPanel({
  songId,
  loggedIn,
  reloadKey,
}: SongRecordPanelProps): React.ReactElement {
  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;

  const [detailData, setDetailData] = useState<SongDetailResponse | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [abSelected, setAbSelected] = useState<string[]>([]);

  // 비동기 요청 레이스 컨디션 방어 (docs/rules/frontend-state.md §1)
  const reqSeqRef = useRef(0);
  const prevSongIdRef = useRef<string | null>(null);

  const loadSongRecord = async (targetSongId: string, uid: string | null) => {
    if (!uid || !apiClient.isLoggedIn()) return;
    const mySeq = ++reqSeqRef.current;
    setLoadErr(false);
    try {
      const data = await apiClient.songs.get(targetSongId);
      if (mySeq !== reqSeqRef.current || auth.getUser()?.id !== uid) return;
      setDetailData(data);
      setLoadErr(false);
    } catch {
      if (mySeq !== reqSeqRef.current || auth.getUser()?.id !== uid) return;
      setLoadErr(true);
    }
  };

  useEffect(() => {
    const songChanged = prevSongIdRef.current !== songId;
    prevSongIdRef.current = songId;

    if (!loggedIn || !songId || !activeUid) {
      reqSeqRef.current++;
      setDetailData(null);
      setLoadErr(false);
      setAbSelected([]);
      return;
    }

    if (songChanged) {
      setDetailData(null);
      setAbSelected([]);
    }

    void loadSongRecord(songId, activeUid);
  }, [songId, loggedIn, reloadKey, activeUid]);

  if (!loggedIn || !songId) {
    return (
      <div className={`panel ${styles.panel}`} data-align-group="sr-left:left">
        <p className={`empty ${styles.empty}`}>
          {t('record.loginPrompt')}
        </p>
      </div>
    );
  }

  const notLoaded = detailData === null;
  const detailSong = detailData?.song || null;
  const takes = detailData?.takes || [];
  const sessions = detailData?.sessions || [];

  const abPair: [TakeDto, TakeDto] | null =
    Boolean(abSelected[0] && abSelected[1])
      ? (() => {
          const t1 = takes.find((t) => t.id === abSelected[0]);
          const t2 = takes.find((t) => t.id === abSelected[1]);
          return t1 && t2 ? sortAbTakes(t1, t2) : null;
        })()
      : null;

  const summaryMeta = detailSong
    ? detailSong.lastDate
      ? t('record.summaryRecent', {
          duration: fmtDuration(detailSong.totalSeconds),
          date: detailSong.lastDate,
        })
      : t('record.summaryNoRecent', {
          duration: fmtDuration(detailSong.totalSeconds),
        })
    : notLoaded
      ? t('record.loading')
      : '';

  return (
    <div className={styles.srWrap}>
      <div className={`head-row ${styles.srHeadRow}`} data-align-group="sr-left:left">
        <div className={styles.srHeadLeft}>
          <h2 className={`h3 ${styles.h3}`}>{t('record.panelTitle')}</h2>
          {summaryMeta && <span className={`meta ${styles.meta}`}>{summaryMeta}</span>}
        </div>
        <SafeLink
          className={`ghost mini ${styles.ghostMini}`}
          href={`log.html?song=${encodeURIComponent(songId)}`}
        >
          {t('record.linkLog')}
        </SafeLink>
      </div>

      {loadErr ? (
        <div className={styles.row}>
          <span className={`meta ${styles.meta}`}>{t('record.loadErr')}</span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            onClick={() => void loadSongRecord(songId, activeUid)}
          >
            {t('record.retry')}
          </button>
        </div>
      ) : (
        <div className={styles.srCols}>
          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`} data-align-group="sr-cols:top@1150">
                {t('record.tabTakes')}
              </h3>
            </div>
            <div id="srTakes" className={styles.takesList}>
              {notLoaded ? (
                <p className={`empty ${styles.empty}`}>{t('record.loading')}</p>
              ) : takes.length === 0 ? (
                <p className={`empty ${styles.empty}`}>{t('record.emptyTakes')}</p>
              ) : (
                takes.map((t) => {
                  const slot: 'a' | 'b' | '' =
                    abSelected[0] === t.id ? 'a' : abSelected[1] === t.id ? 'b' : '';
                  return (
                    <TakeItemRow
                      key={t.id}
                      take={t}
                      showAbCheck
                      abChecked={abSelected.includes(t.id)}
                      abSlot={slot}
                      onSelectAbSlot={(takeId, nextSlot) => {
                        setAbSelected((prev) => {
                          let slotA = prev[0] || '';
                          let slotB = prev[1] || '';
                          if (!nextSlot) {
                            if (slotA === takeId) slotA = '';
                            if (slotB === takeId) slotB = '';
                          } else if (nextSlot === 'a') {
                            if (slotB === takeId) slotB = '';
                            slotA = takeId;
                          } else if (nextSlot === 'b') {
                            if (slotA === takeId) slotA = '';
                            slotB = takeId;
                          }
                          return (slotA || slotB) ? [slotA, slotB] : [];
                        });
                      }}
                      onToggleAb={(takeId, checked) => {
                        setAbSelected((prev) => {
                          let slotA = prev[0] || '';
                          let slotB = prev[1] || '';
                          if (checked) {
                            if (!slotA) {
                              slotA = takeId;
                            } else if (!slotB) {
                              slotB = takeId;
                            } else {
                              slotA = slotB;
                              slotB = takeId;
                            }
                          } else {
                            if (slotA === takeId) slotA = '';
                            if (slotB === takeId) slotB = '';
                          }
                          return (slotA || slotB) ? [slotA, slotB] : [];
                        });
                      }}
                      onDeleted={(takeId) => {
                        setAbSelected((prev) => prev.filter((id) => id !== takeId));
                        setDetailData((prev) =>
                          prev ? { ...prev, takes: prev.takes.filter((it) => it.id !== takeId) } : prev
                        );
                      }}
                    />
                  );
                })
              )}
            </div>
            <AbCompare abPair={abPair} activeUid={activeUid} idPrefix="sr" />
          </div>

          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`} data-align-group="sr-cols:top@1150">
                {t('record.tabSessions')}
              </h3>
            </div>
            <SessionTimeline sessions={sessions} loading={notLoaded} idPrefix="sr" initialLimit={5} />
          </div>
        </div>
      )}
    </div>
  );
}
