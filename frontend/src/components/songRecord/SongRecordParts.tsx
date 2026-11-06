// frontend/src/components/songRecord/SongRecordParts.tsx
import React, { useEffect, useRef, useState } from 'react';
import { SafeAudio } from '../common/SafeAudio';
import { apiClient, SongSessionDto, TakeDto } from '../../lib/apiClient';
import { drive } from '../../lib/drive';
import { safeAudioUrl } from '../../lib/security';
import styles from './SongRecordParts.module.css';

export function fmtDuration(sec?: number | null): string {
  const n = Number(sec) || 0;
  if (n <= 0) return '0분';
  if (n < 60) return `${n}초`;
  if (n < 3600) return `${Math.round(n / 60)}분`;
  const h = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

export function fmtTakeMeta(take: TakeDto): string {
  let timeStr = '';
  if (take.recordedAt) {
    try {
      const d = new Date(take.recordedAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      timeStr = `${hh}:${mm}`;
    } catch {
      timeStr = '';
    }
  }
  let res = timeStr ? `${timeStr} · ` : '';
  res += `${take.durationSec || 0}초`;
  if (take.rate != null) {
    res += ` · ${take.rate}×`;
  }
  return res;
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
  onToggleAb?: (takeId: string, checked: boolean) => void;
  onDeleted: (takeId: string) => void;
}

export function TakeItemRow({
  take,
  showAbCheck = false,
  abChecked = false,
  onToggleAb,
  onDeleted,
}: TakeItemRowProps): React.ReactElement {
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioVisible, setAudioVisible] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowMsg, setRowMsg] = useState('');

  const handlePlay = async () => {
    if (audioUrl) {
      setAudioVisible(true);
      return;
    }
    setLoadingPlay(true);
    if (take.storage === 'drive') {
      setRowMsg('드라이브에서 음원 로드 중...');
      try {
        const blobUrl = await drive.fetchMediaObjectUrl(take.storageKey);
        const valid = safeAudioUrl(blobUrl);
        if (valid) {
          setAudioUrl(valid);
          setAudioVisible(true);
          setRowMsg('');
        } else {
          setRowMsg('주소 발급 실패');
        }
      } catch (err: any) {
        setRowMsg((err && err.message) || '재생 실패');
      } finally {
        setLoadingPlay(false);
      }
      return;
    }

    setRowMsg('주소 요청 중...');
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
        setRowMsg('주소 발급 실패');
      }
    } catch (err: any) {
      setRowMsg((err && err.message) || '재생 실패');
    } finally {
      setLoadingPlay(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('이 녹음을 삭제할까요?')) return;
    setDeleting(true);
    try {
      await apiClient.takes.remove(take.id);
      setAudioUrl('');
      setAudioVisible(false);
      onDeleted(take.id);
    } catch (err: any) {
      window.alert((err && err.message) || '녹음 삭제에 실패했어요');
      setDeleting(false);
    }
  };

  return (
    <div className={`take-row ${styles.takeRow}`}>
      {showAbCheck && (
        <label className={`check ${styles.checkLabel}`}>
          <input
            type="checkbox"
            className="ab-check"
            data-take-id={take.id}
            checked={abChecked}
            onChange={(e) => onToggleAb && onToggleAb(take.id, e.target.checked)}
          />
          <span>비교 선택</span>
        </label>
      )}
      <span className={`take-meta ${styles.takeMeta}`}>🎙 {fmtTakeMeta(take)}</span>
      <button
        type="button"
        className={`ghost mini ${styles.ghostMini}`}
        disabled={loadingPlay}
        onClick={() => void handlePlay()}
      >
        ▶ 듣기
      </button>
      <button
        type="button"
        className={`ghost mini ${styles.ghostMini}`}
        disabled={deleting}
        onClick={() => void handleDelete()}
      >
        삭제
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
          if (!valid) throw new Error('유효하지 않은 오디오 주소예요');
          if (!isSlotValid()) return;
          audioEl['src'] = valid;
          audioEl.dataset.takeId = take.id;
          await audioEl.play().catch(() => {});
        } else {
          const r = await apiClient.takes.getUrl(take.id);
          if (!isSlotValid()) return;
          const valid = r && r.url ? safeAudioUrl(r.url) : '';
          if (!valid) {
            window.alert('녹음 재생 주소를 받지 못했어요');
            return;
          }
          if (!isSlotValid()) return;
          audioEl['src'] = valid;
          audioEl.dataset.takeId = take.id;
          await audioEl.play().catch(() => {});
        }
      } catch (err: any) {
        if (isSlotValid()) {
          window.alert((err && err.message) || '녹음 재생 주소를 받지 못했어요');
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
        <h4 className={`h3 ${styles.h3}`}>녹음 A/B 비교 듣기</h4>
        <span className={`meta ${styles.meta}`}>과거 녹음과 최근 녹음 교차 비교</span>
      </div>
      <div className={`ab-slots ${styles.abSlots}`}>
        <div className={`ab-slot ${styles.abSlot}`} id={prefId(idPrefix, 'abSlotA')}>
          <span className={`meta ${styles.meta}`} id={prefId(idPrefix, 'abLabelA')}>
            {abPair
              ? `A (과거 녹음) · ${abPair[0].recordedAt.slice(0, 16).replace('T', ' ')} · ${
                  abPair[0].durationSec || 0
                }초`
              : 'A (과거 녹음)'}
          </span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            id={prefId(idPrefix, 'abPlayA')}
            disabled={abBusySlot === 'A'}
            onClick={() => abPair && void handlePlayAbSlot('A', abPair[0])}
          >
            ▶ 재생
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
              ? `B (최근 녹음) · ${abPair[1].recordedAt.slice(0, 16).replace('T', ' ')} · ${
                  abPair[1].durationSec || 0
                }초`
              : 'B (최근 녹음)'}
          </span>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            id={prefId(idPrefix, 'abPlayB')}
            disabled={abBusySlot === 'B'}
            onClick={() => abPair && void handlePlayAbSlot('B', abPair[1])}
          >
            ▶ 재생
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
  idPrefix?: string;
  initialLimit?: number;
  loading?: boolean;
}

export function SessionTimeline({
  sessions,
  idPrefix = '',
  initialLimit,
  loading = false,
}: SessionTimelineProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [sessions]);

  const maxTimelineSec = Math.max(60, ...sessions.map((s) => s.seconds || 0));
  const hasLimit = typeof initialLimit === 'number' && initialLimit > 0;
  const visibleSessions = hasLimit && !expanded ? sessions.slice(0, initialLimit) : sessions;
  const hasMore = hasLimit && !expanded && sessions.length > initialLimit;

  const tlId = idPrefix ? `${idPrefix}Timeline` : 'detailTimeline';

  return (
    <div id={tlId}>
      {loading ? (
        <p className={`empty ${styles.empty}`}>불러오는 중…</p>
      ) : sessions.length === 0 ? (
        <p className={`empty ${styles.empty}`}>아직 연습 세션 기록이 없어요.</p>
      ) : (
        <>
          {visibleSessions.map((s) => {
            let leftText = s.date;
            if (s.segment) leftText += ` · 구간 ${s.segment}`;
            if (s.rate != null) leftText += ` · ${s.rate}×`;
            return (
              <div key={s.id} className={`tl-row ${styles.tlRow}`}>
                <div className={`tl-meta ${styles.tlMeta}`}>
                  <span>{leftText}</span>
                  <span className={`meta ${styles.meta}`}>
                    {s.minutes}분 ({s.loops || 0}회)
                  </span>
                </div>
                <progress className={`tl-bar ${styles.tlBar}`} max={maxTimelineSec} value={s.seconds || 0} />
                {s.memo && <div className={`tl-memo ${styles.tlMemo}`}>{s.memo}</div>}
              </div>
            );
          })}
          {hasMore && (
            <div className={styles.tlMoreRow}>
              <button
                type="button"
                className={`ghost mini ${styles.ghostMini}`}
                onClick={() => setExpanded(true)}
              >
                더 보기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
