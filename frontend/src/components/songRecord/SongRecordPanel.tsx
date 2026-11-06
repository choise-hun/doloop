// frontend/src/components/songRecord/SongRecordPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { SafeLink } from '../common/SafeLink';
import { auth, useAuth } from '../../lib/auth';
import { apiClient, SongDetailResponse, TakeDto } from '../../lib/apiClient';
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
          로그인하면 이 곡의 연습 기록과 녹음이 여기에 모여요
        </p>
      </div>
    );
  }

  const notLoaded = detailData === null;
  const detailSong = detailData?.song || null;
  const takes = detailData?.takes || [];
  const sessions = detailData?.sessions || [];

  const abPair: [TakeDto, TakeDto] | null =
    abSelected.length === 2
      ? (() => {
          const t1 = takes.find((t) => t.id === abSelected[0]);
          const t2 = takes.find((t) => t.id === abSelected[1]);
          return t1 && t2 ? sortAbTakes(t1, t2) : null;
        })()
      : null;

  const summaryMeta = detailSong
    ? `누적 ${fmtDuration(detailSong.totalSeconds)}${
        detailSong.lastDate ? ` · 최근 연습 ${detailSong.lastDate}` : ' · 연습 기록 없음'
      }`
    : notLoaded
      ? '불러오는 중…'
      : '';

  return (
    <div className={styles.srWrap}>
      <div className={`head-row ${styles.srHeadRow}`} data-align-group="sr-left:left">
        <div className={styles.srHeadLeft}>
          <h2 className={`h3 ${styles.h3}`}>이 곡의 연습 기록</h2>
          {summaryMeta && <span className={`meta ${styles.meta}`}>{summaryMeta}</span>}
        </div>
        <SafeLink
          className={`ghost mini ${styles.ghostMini}`}
          href={`log.html?song=${encodeURIComponent(songId)}`}
        >
          기록에서 자세히 →
        </SafeLink>
      </div>

      {loadErr ? (
        <div className={styles.row}>
          <span className={`meta ${styles.meta}`}>기록을 불러오지 못했어요</span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            onClick={() => void loadSongRecord(songId, activeUid)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className={styles.srCols}>
          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`} data-align-group="sr-cols:top@1150">
                녹음
              </h3>
            </div>
            <div id="srTakes" className={styles.takesList}>
              {notLoaded ? (
                <p className={`empty ${styles.empty}`}>불러오는 중…</p>
              ) : takes.length === 0 ? (
                <p className={`empty ${styles.empty}`}>아직 녹음이 없어요</p>
              ) : (
                takes.map((t) => (
                  <TakeItemRow
                    key={t.id}
                    take={t}
                    showAbCheck
                    abChecked={abSelected.includes(t.id)}
                    onToggleAb={(takeId, checked) => {
                      setAbSelected((prev) => {
                        if (checked) {
                          return prev.length >= 2 ? [...prev.slice(1), takeId] : [...prev, takeId];
                        }
                        return prev.filter((id) => id !== takeId);
                      });
                    }}
                    onDeleted={(takeId) => {
                      setAbSelected((prev) => prev.filter((id) => id !== takeId));
                      setDetailData((prev) =>
                        prev ? { ...prev, takes: prev.takes.filter((it) => it.id !== takeId) } : prev
                      );
                    }}
                  />
                ))
              )}
            </div>
            <AbCompare abPair={abPair} activeUid={activeUid} idPrefix="sr" />
          </div>

          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`} data-align-group="sr-cols:top@1150">
                연습 세션
              </h3>
            </div>
            <SessionTimeline sessions={sessions} loading={notLoaded} idPrefix="sr" initialLimit={5} />
          </div>
        </div>
      )}
    </div>
  );
}
