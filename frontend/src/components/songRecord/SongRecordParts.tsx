// frontend/src/components/songRecord/SongRecordParts.tsx
import React, { useEffect, useRef, useState } from 'react';
import { SafeAudio } from '../common/SafeAudio';
import { apiClient, SongSessionDto, TakeDto } from '../../lib/apiClient';
import { drive } from '../../lib/drive';
import { safeAudioUrl } from '../../lib/security';
import { t } from '../../lib/i18n.mts';
import { PracticeSessionCard } from './PracticeSessionCard';
import { fromSongSession } from '../../lib/episode.mts';
// i18n-keep: 'record.sessionSegment' 'record.sessionDurationLoops' 'record.btnDetailAccordion' 호환 키 보존
import styles from './SongRecordParts.module.css';

export function fmtDuration(sec?: number | null): string {
  const n = Number(sec) || 0;
  if (n <= 0) return t('record.durZero');
  if (n < 60) return t('record.durSec', { n });
  if (n < 3600) return t('record.durMin', { m: Math.round(n / 60) });
  const h = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  return m > 0 ? t('record.durHourMin', { h, m }) : t('record.durHour', { h });
}

export function fmtTakeMeta(take: TakeDto): string {
  const parts: string[] = [];
  if (take.partName) {
    parts.push(take.partName);
  }
  if (take.durationSec != null) {
    parts.push(t('record.takeSec', { sec: take.durationSec }));
  }
  if (take.rate != null) {
    parts.push(`${take.rate}×`);
  }
  return parts.join(' · ');
}

export function sortAbTakes(t1: TakeDto, t2: TakeDto): [TakeDto, TakeDto] {
  return t1.recordedAt > t2.recordedAt ? [t2, t1] : [t1, t2];
}

export function prefId(prefix: string | undefined, base: string): string {
  if (!prefix) return base;
  return prefix + base.charAt(0).toUpperCase() + base.slice(1);
}

// 개별 테이크 행 컴포넌트 (다른 테이크/세션의 미저장 입력 및 오디오 상태 보존)
export interface TakeItemRowProps {
  take: TakeDto;
  showAbCheck?: boolean;
  abChecked?: boolean;
  abSlot?: 'a' | 'b' | '';
  onToggleAb?: (takeId: string, checked: boolean) => void;
  onSelectAbSlot?: (takeId: string, slot: 'a' | 'b' | '') => void;
  onDeleted: (takeId: string) => void;
}

export function TakeItemRow({
  take,
  showAbCheck = false,
  abChecked = false,
  abSlot,
  onToggleAb,
  onSelectAbSlot,
  onDeleted,
}: TakeItemRowProps): React.ReactElement {
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioVisible, setAudioVisible] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [prevTakeId, setPrevTakeId] = useState(take.id);
  const [prevTakeCompleted, setPrevTakeCompleted] = useState(take.completed);
  const [completed, setCompleted] = useState<boolean>(Boolean(take.completed));
  const [rowMsg, setRowMsg] = useState('');
  const takeReqSeqRef = useRef(0);

  // 렌더 타임 동기 정규화 (docs/rules/frontend-state.md §2, PR #132 리뷰 3번)
  if (take.id !== prevTakeId || take.completed !== prevTakeCompleted) {
    setPrevTakeId(take.id);
    setPrevTakeCompleted(take.completed);
    setCompleted(Boolean(take.completed));
  }

  const handlePlay = async () => {
    if (audioUrl) {
      setAudioVisible(true);
      return;
    }
    setLoadingPlay(true);
    if (take.storage === 'drive') {
      setRowMsg(t('record.loadingDriveAudio'));
      try {
        const blobUrl = await drive.fetchMediaObjectUrl(take.storageKey);
        const valid = safeAudioUrl(blobUrl);
        if (valid) {
          setAudioUrl(valid);
          setAudioVisible(true);
          setRowMsg('');
        } else {
          setRowMsg(t('record.urlIssueFailed'));
        }
      } catch (err: any) {
        setRowMsg((err && err.message) || t('record.playFailed'));
      } finally {
        setLoadingPlay(false);
      }
      return;
    }

    setRowMsg(t('record.requestingUrl'));
    try {
      const r = await apiClient.takes.getUrl(take.id);
      const valid = r && r.url ? safeAudioUrl(r.url) : '';
      if (valid) {
        setAudioUrl(valid);
        setAudioVisible(true);
        setRowMsg('');
      } else {
        setAudioUrl('');
        setAudioVisible(true);
        setRowMsg(t('record.urlIssueFailed'));
      }
    } catch (err: any) {
      setRowMsg((err && err.message) || t('record.playFailed'));
    } finally {
      setLoadingPlay(false);
    }
  };

  const handleCompleteToggle = async () => {
    const nextVal = !completed;
    const token = ++takeReqSeqRef.current;
    // 1. 낙관적 UI 갱신 (docs/rules/frontend-state.md §1)
    setCompleted(nextVal);
    try {
      const res = await apiClient.takes.toggleComplete(take.id, nextVal);
      if (token !== takeReqSeqRef.current) return;
      setCompleted(Boolean(res.take.completed));
    } catch (err: any) {
      if (token !== takeReqSeqRef.current) return;
      setCompleted(!nextVal);
      window.alert(err.message || 'Error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('record.confirmDeleteTake'))) return;
    setDeleting(true);
    try {
      await apiClient.takes.remove(take.id);
      setAudioUrl('');
      setAudioVisible(false);
      onDeleted(take.id);
    } catch (err: any) {
      window.alert((err && err.message) || t('record.deleteTakeFailed'));
      setDeleting(false);
    }
  };

  const currentSlotVal = abSlot !== undefined ? abSlot : abChecked ? 'a' : '';

  return (
    <div className={`take-row ${styles.takeRow}`}>
      {showAbCheck && (
        <select
          className={`ab-select ${styles.abSelect}`}
          data-take-id={take.id}
          value={currentSlotVal}
          onChange={(e) => {
            const val = e.target.value as 'a' | 'b' | '';
            if (onSelectAbSlot) {
              onSelectAbSlot(take.id, val);
            } else if (onToggleAb) {
              onToggleAb(take.id, Boolean(val));
            }
          }}
          aria-label={t('record.abSelect')}
        >
          <option value="">{t('record.abSelectNone')}</option>
          <option value="a">{t('record.abSelectA')}</option>
          <option value="b">{t('record.abSelectB')}</option>
        </select>
      )}
      <span className={`take-meta ${styles.takeMeta}`}>🎙 {fmtTakeMeta(take)}</span>
      <button
        type="button"
        className={`ghost mini ${styles.ghostMini}`}
        disabled={loadingPlay}
        onClick={() => void handlePlay()}
      >
        {t('record.btnListen')}
      </button>
      <button
        type="button"
        className={`ghost mini btnComplete ${styles.ghostMini} ${styles.btnComplete} ${completed ? styles.btnCompleted : ''}`}
        onClick={() => void handleCompleteToggle()}
      >
        {completed ? t('record.btnCompleted') : t('record.btnComplete')}
      </button>
      <button
        type="button"
        className={`ghost mini btnDelete ${styles.ghostMini} ${styles.btnDelete}`}
        disabled={deleting}
        onClick={() => void handleDelete()}
      >
        {t('record.btnDeleteShort')}
      </button>
      <span className={`meta ${styles.meta}`}>{rowMsg}</span>
      <SafeAudio
        className={styles.takeAudio}
        srcUrl={audioUrl}
        takeId={take.id}
        preload="none"
        hidden={!audioVisible}
      />
    </div>
  );
}

export interface AbCompareProps {
  abPair: [TakeDto, TakeDto] | null;
  activeUid: string | null;
  idPrefix?: string;
}

export function AbCompare({ abPair, activeUid, idPrefix = '' }: AbCompareProps): React.ReactElement {
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [abBusySlot, setAbBusySlot] = useState<'A' | 'B' | null>(null);

  // A/B 재생 비동기 레이스 방어 토큰 및 최신 페어 레프 (PR #43 리뷰 1번)
  const abReqSeqRef = useRef(0);
  const abPairRef = useRef<[TakeDto, TakeDto] | null>(null);

  const clearAudioEl = (el: HTMLAudioElement | null) => {
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
      delete el.dataset.takeId;
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    abPairRef.current = abPair;
    abReqSeqRef.current++;
    setAbBusySlot(null);
    if (!abPair) {
      clearAudioEl(audioARef.current);
      clearAudioEl(audioBRef.current);
      return;
    }
    const [takeA, takeB] = abPair;
    if (audioARef.current && audioARef.current.dataset.takeId !== takeA.id) {
      clearAudioEl(audioARef.current);
    }
    if (audioBRef.current && audioBRef.current.dataset.takeId !== takeB.id) {
      clearAudioEl(audioBRef.current);
    }
  }, [abPair]);

  useEffect(() => {
    abReqSeqRef.current++;
    setAbBusySlot(null);
    clearAudioEl(audioARef.current);
    clearAudioEl(audioBRef.current);
  }, [activeUid]);

  const handlePlayAbSlot = async (slot: 'A' | 'B', take: TakeDto) => {
    const audioEl = slot === 'A' ? audioARef.current : audioBRef.current;
    const otherEl = slot === 'A' ? audioBRef.current : audioARef.current;
    if (!audioEl) return;
    if (otherEl) {
      try {
        otherEl.pause();
      } catch {
        /* ignore */
      }
    }
    if (audioEl.dataset.takeId !== take.id) {
      const myToken = ++abReqSeqRef.current;
      const myUid = activeUid;
      setAbBusySlot(slot);

      // 비동기 복귀 후 슬롯·인증·페어 유효성 검증 (PR #43 리뷰 1번)
      const isSlotValid = () => {
        if (myToken !== abReqSeqRef.current) return false;
        if (!activeUid || activeUid !== myUid || !apiClient.isLoggedIn()) return false;
        const currentSlotTake = slot === 'A' ? abPairRef.current?.[0] : abPairRef.current?.[1];
        if (!currentSlotTake || currentSlotTake.id !== take.id) return false;
        return true;
      };

      try {
        if (take.storage === 'drive') {
          const blobUrl = await drive.fetchMediaObjectUrl(take.storageKey);
          if (!isSlotValid()) return;
          const valid = safeAudioUrl(blobUrl);
          if (!valid) throw new Error(t('record.invalidAudioUrl'));
          if (!isSlotValid()) return;
          audioEl['src'] = valid;
          audioEl.dataset.takeId = take.id;
          await audioEl.play().catch(() => {});
        } else {
          const r = await apiClient.takes.getUrl(take.id);
          if (!isSlotValid()) return;
          const valid = r && r.url ? safeAudioUrl(r.url) : '';
          if (!valid) {
            window.alert(t('record.cannotGetPlayUrl'));
            return;
          }
          if (!isSlotValid()) return;
          audioEl['src'] = valid;
          audioEl.dataset.takeId = take.id;
          await audioEl.play().catch(() => {});
        }
      } catch (err: any) {
        if (isSlotValid()) {
          window.alert((err && err.message) || t('record.cannotGetPlayUrl'));
        }
      } finally {
        if (myToken === abReqSeqRef.current) {
          setAbBusySlot(null);
        }
      }
    } else if (audioEl.paused) {
      await audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  };

  return (
    <div className={`panel ${styles.panel}`} id={prefId(idPrefix, 'abPanel')} hidden={!abPair}>
      <div className={`head-row ${styles.headRow}`}>
        <h4 className={`h3 ${styles.h3}`}>{t('record.abHeaderTitle')}</h4>
        <span className={`meta ${styles.meta}`}>{t('record.abHeaderDesc')}</span>
      </div>
      <div className={`ab-slots ${styles.abSlots}`}>
        <div className={`ab-slot ${styles.abSlot}`} id={prefId(idPrefix, 'abSlotA')}>
          <span className={`meta ${styles.meta}`} id={prefId(idPrefix, 'abLabelA')}>
            {abPair
              ? t('record.abLabelA', {
                  date: abPair[0].recordedAt.slice(0, 16).replace('T', ' '),
                  sec: abPair[0].durationSec || 0,
                })
              : t('record.abLabelAFallback')}
          </span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            id={prefId(idPrefix, 'abPlayA')}
            disabled={abBusySlot === 'A'}
            onClick={() => abPair && void handlePlayAbSlot('A', abPair[0])}
          >
            {t('record.btnPlay')}
          </button>
          <audio
            ref={audioARef}
            id={prefId(idPrefix, 'abAudioA')}
            className={styles.takeAudio}
            controls
            preload="none"
            onPlay={() => audioBRef.current?.pause()}
          />
        </div>
        <div className={`ab-slot ${styles.abSlot}`} id={prefId(idPrefix, 'abSlotB')}>
          <span className={`meta ${styles.meta}`} id={prefId(idPrefix, 'abLabelB')}>
            {abPair
              ? t('record.abLabelB', {
                  date: abPair[1].recordedAt.slice(0, 16).replace('T', ' '),
                  sec: abPair[1].durationSec || 0,
                })
              : t('record.abLabelBFallback')}
          </span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            id={prefId(idPrefix, 'abPlayB')}
            disabled={abBusySlot === 'B'}
            onClick={() => abPair && void handlePlayAbSlot('B', abPair[1])}
          >
            {t('record.btnPlay')}
          </button>
          <audio
            ref={audioBRef}
            id={prefId(idPrefix, 'abAudioB')}
            className={styles.takeAudio}
            controls
            preload="none"
            onPlay={() => audioARef.current?.pause()}
          />
        </div>
      </div>
    </div>
  );
}

export interface SessionTimelineProps {
  sessions: SongSessionDto[];
  song?: { videoId?: string; title?: string; artist?: string } | null;
  takes?: TakeDto[];
  idPrefix?: string;
  initialLimit?: number;
  loading?: boolean;
}

export function SessionTimeline({
  sessions,
  song,
  takes,
  idPrefix = '',
  initialLimit,
  loading = false,
}: SessionTimelineProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [sessions]);

  const hasLimit = typeof initialLimit === 'number' && initialLimit > 0;
  const visibleSessions = hasLimit && !expanded ? sessions.slice(0, initialLimit) : sessions;
  const hasMore = hasLimit && !expanded && sessions.length > initialLimit;

  const tlId = idPrefix ? `${idPrefix}Timeline` : 'detailTimeline';

  return (
    <div id={tlId} className={styles.timelineWrap}>
      {loading ? (
        <p className={`empty ${styles.empty}`}>{t('record.loading')}</p>
      ) : sessions.length === 0 ? (
        <p className={`empty ${styles.empty}`}>{t('record.emptySessions')}</p>
      ) : (
        <>
          <div className={styles.timelineList}>
            {visibleSessions.map((s) => (
              <PracticeSessionCard
                key={s.id}
                session={fromSongSession(s, song, takes)}
                surface={idPrefix === 'sr' ? 'player' : 'detail'}
              />
            ))}
          </div>
          {hasMore && (
            <div className={styles.tlMoreRow}>
              <button
                type="button"
                className={`ghost mini ${styles.ghostMini}`}
                onClick={() => setExpanded(true)}
              >
                {t('record.btnMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
