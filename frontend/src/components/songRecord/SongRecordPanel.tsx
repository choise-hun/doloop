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
  TakeItemRow,
} from './SongRecordParts';
import styles from './SongRecordParts.module.css';

export interface SongRecordPanelProps {
  songId: string | null;
  loggedIn: boolean;
  reloadKey: number;
}

export function SongRecordPanel(props: SongRecordPanelProps): React.ReactElement {
  const state = useAuth();
  return <OwnedSongRecordPanel key={`${state.user?.id}:${props.songId}`} {...props} />;
}

function OwnedSongRecordPanel({
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

  const sessionIdSet = new Set(sessions.map((x) => x.id));
  const unlinkedTakes = takes.filter((x) => !sessionIdSet.has(x.sessionId));

  const abSelection = { a: abSelected[0] || '', b: abSelected[1] || '' };
  const tA = takes.find((x) => x.id === abSelection.a);
  const tB = takes.find((x) => x.id === abSelection.b);
  const abPair: [TakeDto, TakeDto] | null = tA && tB ? [tA, tB] : null;
  const filled = (tA ? 1 : 0) + (tB ? 1 : 0);

  const selectAbSlot = (takeId: string, next: 'a' | 'b' | '') => {
    setAbSelected((prev) => {
      let slotA = prev[0] || '';
      let slotB = prev[1] || '';
      if (!next) {
        if (slotA === takeId) slotA = '';
        if (slotB === takeId) slotB = '';
      } else if (next === 'a') {
        if (slotB === takeId) slotB = '';
        slotA = takeId;
      } else if (next === 'b') {
        if (slotA === takeId) slotA = '';
        slotB = takeId;
      }
      return slotA || slotB ? [slotA, slotB] : [];
    });
  };
  // 삭제한 테이크의 슬롯만 비운다. 남은 슬롯은 제자리에 둔다.
  const removeTake = (takeId: string) => {
    setAbSelected((prev) => {
      const slotA = prev[0] === takeId ? '' : prev[0] || '';
      const slotB = prev[1] === takeId ? '' : prev[1] || '';
      return slotA || slotB ? [slotA, slotB] : [];
    });
    setDetailData((prev) =>
      prev ? { ...prev, takes: prev.takes.filter((it) => it.id !== takeId) } : prev
    );
  };
  const replaceTake = (take: TakeDto) =>
    setDetailData((prev) =>
      prev ? { ...prev, takes: prev.takes.map((it) => (it.id === take.id ? take : it)) } : prev
    );

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
        <>
          {!notLoaded && filled === 1 && (
            <p id="srAbHint" className={`meta ${styles.meta} ${styles.srAbHint}`} role="status">
              {t('record.abNeedTwo')}
            </p>
          )}
          <AbCompare abPair={abPair} activeUid={activeUid} idPrefix="sr" />

          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`}>{t('record.tabSessions')}</h3>
            </div>
            <SessionTimeline
              onTakeRemoved={(_sessionId, takeId) => removeTake(takeId)}
              onTakeCompleted={replaceTake}
              onMemoSaved={(sessionId, memo) => setDetailData((prev) => prev ? { ...prev, sessions: prev.sessions.map((it) => it.id === sessionId ? { ...it, memo } : it) } : prev)}
              sessions={sessions}
              song={detailSong}
              takes={takes}
              loading={notLoaded}
              idPrefix="sr"
              initialLimit={5}
              abSelection={abSelection}
              onSelectAbSlot={selectAbSlot}
            />
          </div>

          {!notLoaded && unlinkedTakes.length > 0 && (
            <section
              id="srUnlinked"
              className={`panel ${styles.panel} ${styles.srUnlinked}`}
              aria-labelledby="srUnlinkedTitle"
            >
              <div className={`head-row ${styles.headRow}`}>
                <h3 id="srUnlinkedTitle" className={`h3 ${styles.h3}`}>
                  {t('record.unlinkedTitle')}
                </h3>
              </div>
              <div className={styles.takesList}>
                {unlinkedTakes.map((tk) => {
                  const slot: 'a' | 'b' | '' =
                    abSelection.a === tk.id ? 'a' : abSelection.b === tk.id ? 'b' : '';
                  return (
                    <TakeItemRow
                      key={tk.id}
                      take={tk}
                      showAbCheck
                      abChecked={slot !== ''}
                      abSlot={slot}
                      onSelectAbSlot={selectAbSlot}
                      onCompleted={replaceTake}
                      onDeleted={removeTake}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
