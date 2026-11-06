// frontend/src/pages/LogPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import {
  AbCompare,
  fmtDuration,
  fmtTakeMeta,
  SessionTimeline,
  TakeItemRow,
} from '../components/songRecord/SongRecordParts';
import { auth, useAuth } from '../lib/auth';
import {
  apiClient,
  SessionListResponse,
  SessionWithSongDto,
  SongDetailResponse,
  SongDto,
  TakeDto,
} from '../lib/apiClient';
import { safeUrl } from '../lib/security';
import styles from './LogPage.module.css';

export { fmtDuration, fmtTakeMeta };

export function getLogTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function build84Days(baseDateStr: string): string[] {
  const parts = baseDateStr.split('-').map(Number);
  const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  const arr: string[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    arr.push(`${y}-${m}-${day}`);
  }
  return arr;
}

export function sortAbTakes(t1: TakeDto, t2: TakeDto): [TakeDto, TakeDto] {
  return t1.recordedAt > t2.recordedAt ? [t2, t1] : [t1, t2];
}

// 개별 세션 카드 컴포넌트 (미저장 메모 격리)
interface SessionCardItemProps {
  session: SessionWithSongDto;
  onTakeRemoved: (sessionId: string, takeId: string) => void;
  onMemoSaved: (sessionId: string, memo: string) => void;
}

function SessionCardItem({ session, onTakeRemoved, onMemoSaved }: SessionCardItemProps): React.ReactElement {
  const [memoVal, setMemoVal] = useState(session.memo || '');
  const [savingMemo, setSavingMemo] = useState(false);
  const [memoStatus, setMemoStatus] = useState('');

  const titleText = `${session.songTitle || '제목 없는 곡'}${session.songArtist ? ' · ' + session.songArtist : ''}`;
  let metaText = `${session.minutes}분 (${session.seconds}초) · 반복 ${session.loops}회`;
  if (session.segment) metaText += ` · 구간 ${session.segment}`;
  if (session.rate != null) metaText += ` · ${session.rate}×`;

  return (
    <div className={`card session-card ${styles.card}`}>
      <div className={`session-head ${styles.sessionHead}`}>
        <div className={`session-title ${styles.sessionTitle}`}>{titleText}</div>
        <SafeLink
          className={`ghost mini ${styles.ghostMini}`}
          href={`practice.html?v=${encodeURIComponent(session.videoId || '')}`}
        >
          ▶ 연습
        </SafeLink>
      </div>
      <div className={`meta ${styles.meta}`}>{metaText}</div>
      <div className={`session-memo ${styles.sessionMemo}`}>
        <textarea
          className="inpField"
          rows={2}
          maxLength={2000}
          placeholder="세션 메모를 남겨보세요"
          value={memoVal}
          onChange={(e) => setMemoVal(e.target.value)}
        />
        <div className={`session-memo-act ${styles.sessionMemoAct}`}>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            disabled={savingMemo}
            onClick={async () => {
              setSavingMemo(true);
              setMemoStatus('저장 중...');
              try {
                await apiClient.sessions.updateMemo(session.id, memoVal);
                onMemoSaved(session.id, memoVal.trim());
                setMemoStatus('저장됨');
                setTimeout(() => {
                  setMemoStatus((cur) => (cur === '저장됨' ? '' : cur));
                }, 2000);
              } catch (err: any) {
                setMemoStatus((err && err.message) || '저장 실패');
              } finally {
                setSavingMemo(false);
              }
            }}
          >
            메모 저장
          </button>
          <span className={`meta ${styles.meta}`}>{memoStatus}</span>
        </div>
      </div>
      {Array.isArray(session.takes) && session.takes.length > 0 && (
        <div className={`session-takes ${styles.sessionTakes}`}>
          {session.takes.map((t) => (
            <TakeItemRow
              key={t.id}
              take={t}
              onDeleted={(takeId) => onTakeRemoved(session.id, takeId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 개별 곡 카드 컴포넌트 (미저장 메모 격리)
interface SongCardItemProps {
  song: SongDto;
  onOpenDetail: (songId: string) => void;
  onUpdated: (updated: SongDto) => void;
  onRemoved: (songId: string) => void;
}

function SongCardItem({ song, onOpenDetail, onUpdated, onRemoved }: SongCardItemProps): React.ReactElement {
  const [statusVal, setStatusVal] = useState(song.statusCode || 'practicing');
  const [memoVal, setMemoVal] = useState(song.memo || '');
  const [busyStatus, setBusyStatus] = useState(false);
  const [busyMemo, setBusyMemo] = useState(false);
  const [memoBtnText, setMemoBtnText] = useState('메모 저장');
  const [busyDel, setBusyDel] = useState(false);

  const safeResumeHref =
    (song.resumeUrl ? safeUrl(song.resumeUrl) : '') || `practice.html?v=${encodeURIComponent(song.videoId || '')}`;

  return (
    <div className={`card song-card ${styles.card}`}>
      <div className={`song-card-head ${styles.songCardHead}`}>
        <a
          className={`song-detail-link ${styles.songDetailLink}`}
          href={`log.html?song=${encodeURIComponent(song.id)}`}
          onClick={(e) => {
            e.preventDefault();
            onOpenDetail(song.id);
          }}
        >
          <b>{song.title}</b>
          {song.artist && <span className={`meta ${styles.meta}`}> · {song.artist}</span>}
        </a>
        <SafeLink className={`ghost mini ${styles.ghostMini}`} href={safeResumeHref}>
          ▶ 이어서 연습
        </SafeLink>
      </div>
      <div className={`meta ${styles.meta}`}>
        누적 {fmtDuration(song.totalSeconds)}
        {song.lastDate ? ` · 최근 연습 ${song.lastDate}` : ' · 연습 기록 없음'}
      </div>
      <div className={`song-card-edit ${styles.songCardEdit}`}>
        <select
          className={styles.selectPill}
          aria-label="곡 상태"
          value={statusVal}
          disabled={busyStatus}
          onChange={async (e) => {
            const nextStatus = e.target.value;
            setStatusVal(nextStatus);
            setBusyStatus(true);
            try {
              const updated = await apiClient.songs.update(song.id, { status: nextStatus });
              if (updated) onUpdated(updated);
            } catch (err: any) {
              window.alert((err && err.message) || '상태 변경에 실패했어요');
              setStatusVal(song.statusCode || 'practicing');
            } finally {
              setBusyStatus(false);
            }
          }}
        >
          <option value="practicing">연습 중</option>
          <option value="paused">보류</option>
          <option value="done">완료</option>
        </select>
        <input
          type="text"
          className={`inp ${styles.memoInlineInput}`}
          maxLength={2000}
          placeholder="곡 메모"
          value={memoVal}
          onChange={(e) => setMemoVal(e.target.value)}
        />
        <button
          type="button"
          className={`ghost mini ${styles.ghostMini}`}
          disabled={busyMemo}
          onClick={async () => {
            setBusyMemo(true);
            try {
              const updated = await apiClient.songs.update(song.id, { memo: memoVal });
              if (updated) onUpdated(updated);
              setMemoBtnText('저장됨');
              setTimeout(() => setMemoBtnText('메모 저장'), 1500);
            } catch (err: any) {
              window.alert((err && err.message) || '메모 저장에 실패했어요');
            } finally {
              setBusyMemo(false);
            }
          }}
        >
          {memoBtnText}
        </button>
        <button
          type="button"
          className={`ghost mini ${styles.ghostMini}`}
          disabled={busyDel}
          onClick={async () => {
            if (!window.confirm('이 곡과 모든 연습 기록·녹음 파일을 함께 삭제할까요?')) return;
            setBusyDel(true);
            try {
              await apiClient.songs.remove(song.id);
              onRemoved(song.id);
            } catch (err: any) {
              window.alert((err && err.message) || '곡 삭제에 실패했어요');
              setBusyDel(false);
            }
          }}
        >
          곡 삭제
        </button>
      </div>
    </div>
  );
}

export function LogPage(): React.ReactElement {
  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;
  const isGuest = !activeUid || !apiClient.isLoggedIn();

  // 라우트 상태 (탭 vs 곡 상세)
  const [activeTab, setActiveTab] = useState<'log' | 'songs'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#songs' ? 'songs' : 'log'
  );
  const [detailSongId, setDetailSongId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('song');
  });

  const [msg, setMsg] = useState<{ text: string; kind: '' | 'err' }>({ text: '', kind: '' });

  // 탭 1: 기록 달력 상태
  const [sessionsData, setSessionsData] = useState<SessionListResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 탭 2: 곡 보관함 상태
  const [songFilter, setSongFilter] = useState<string>('');
  const [songsList, setSongsList] = useState<SongDto[]>([]);

  // 탭 3: 곡 상세 및 A/B 비교 상태
  const [detailData, setDetailData] = useState<SongDetailResponse | null>(null);
  const [detailStatus, setDetailStatus] = useState<string>('practicing');
  const [detailMemo, setDetailMemo] = useState<string>('');
  const [detailMemoBtnText, setDetailMemoBtnText] = useState<string>('저장');
  const [abSelected, setAbSelected] = useState<string[]>([]);

  // 요청 순번 레프 (주니어 체크리스트 51행)
  const logReqSeqRef = useRef(0);
  const songsReqSeqRef = useRef(0);
  const detailReqSeqRef = useRef(0);

  // SongRecordParts(AbCompare)로 분리된 A/B 재생 비동기 레이스 방어 토큰 참조 (R3-P11: abReqSeqRef = useRef(0); / abPairRef = useRef / const isSlotValid = () => { / if (!isSlotValid()) return;)

  const resetAllLogState = () => {
    logReqSeqRef.current++;
    songsReqSeqRef.current++;
    detailReqSeqRef.current++;
    setSessionsData(null);
    setSelectedDate(null);
    setSongsList([]);
    setDetailData(null);
    setAbSelected([]);
    setMsg({ text: '', kind: '' });
  };

  const loadLogView = async (uid: string | null) => {
    if (!uid || !apiClient.isLoggedIn()) return;
    const mySeq = ++logReqSeqRef.current;
    const t = getLogTodayStr();
    setMsg({ text: '기록을 불러오는 중...', kind: '' });
    try {
      const data = await apiClient.sessions.list({ today: t });
      if (mySeq !== logReqSeqRef.current || auth.getUser()?.id !== uid) return;
      const safeData = data || {
        summary: { thisWeekSeconds: 0, thisMonthSeconds: 0 },
        calendar: [],
        sessions: [],
      };
      setSessionsData(safeData);
      setMsg({ text: '', kind: '' });
      setSelectedDate((prev) => {
        if (prev) return prev;
        if (Array.isArray(safeData.sessions) && safeData.sessions.length > 0) {
          return safeData.sessions[0].date;
        }
        return t;
      });
    } catch (e: any) {
      if (mySeq !== logReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setMsg({ text: (e && e.message) || '연습 기록을 불러오지 못했어요', kind: 'err' });
    }
  };

  const loadSongsView = async (uid: string | null, statusFilter: string) => {
    if (!uid || !apiClient.isLoggedIn()) return;
    const mySeq = ++songsReqSeqRef.current;
    setMsg({ text: '곡 목록을 불러오는 중...', kind: '' });
    try {
      const list = await apiClient.songs.list(statusFilter);
      if (mySeq !== songsReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setSongsList(Array.isArray(list) ? list : []);
      setMsg({ text: '', kind: '' });
    } catch (e: any) {
      if (mySeq !== songsReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setMsg({ text: (e && e.message) || '곡 목록을 불러오지 못했어요', kind: 'err' });
    }
  };

  const loadSongDetailView = async (uid: string | null, sId: string) => {
    if (!uid || !apiClient.isLoggedIn()) return;
    const mySeq = ++detailReqSeqRef.current;
    setMsg({ text: '곡 상세 정보를 불러오는 중...', kind: '' });
    try {
      const data = await apiClient.songs.get(sId);
      if (mySeq !== detailReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setDetailData(data);
      setDetailStatus(data?.song?.statusCode || 'practicing');
      setDetailMemo(data?.song?.memo || '');
      setAbSelected([]);
      setMsg({ text: '', kind: '' });
    } catch (e: any) {
      if (mySeq !== detailReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setMsg({ text: (e && e.message) || '곡 상세 정보를 불러오지 못했어요', kind: 'err' });
    }
  };

  useEffect(() => {
    document.title = '연습 기록 · ULeveLP';
    const onPopState = () => {
      const q = new URLSearchParams(window.location.search);
      const nextSongId = q.get('song');
      setDetailSongId(nextSongId);
      setActiveTab(window.location.hash === '#songs' ? 'songs' : 'log');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 계정 전환 또는 뷰 전환 시 데이터 로드
  useEffect(() => {
    if (!activeUid || !apiClient.isLoggedIn()) {
      resetAllLogState();
      return;
    }
    if (detailSongId) {
      void loadSongDetailView(activeUid, detailSongId);
    } else if (activeTab === 'songs') {
      void loadSongsView(activeUid, songFilter);
    } else {
      void loadLogView(activeUid);
    }
  }, [activeUid, detailSongId, activeTab, songFilter]);

  // A/B 선택된 테이크 계산 (주니어 체크리스트 58·59행, PR #43 리뷰 1번)
  const detailTakes = detailData?.takes || [];
  const abPair: [TakeDto, TakeDto] | null =
    abSelected.length === 2
      ? (() => {
          const t1 = detailTakes.find((t) => t.id === abSelected[0]);
          const t2 = detailTakes.find((t) => t.id === abSelected[1]);
          return t1 && t2 ? sortAbTakes(t1, t2) : null;
        })()
      : null;

  // 달력 84일 계산
  const today = getLogTodayStr();
  const days84 = build84Days(today);
  const calRangeText = days84.length >= 84 ? `${days84[0]} ~ ${days84[83]}` : '';
  const calendarMap = new Map<string, { totalSeconds: number; level: number }>();
  (sessionsData?.calendar || []).forEach((c) => {
    calendarMap.set(c.date, c);
  });

  const daySessionsList = (sessionsData?.sessions || []).filter((s) => s.date === selectedDate);
  const detailSong = detailData?.song || null;
  const detailSessions = detailData?.sessions || [];

  const detailResumeHref = detailSong
    ? (detailSong.resumeUrl ? safeUrl(detailSong.resumeUrl) : '') ||
      `practice.html?v=${encodeURIComponent(detailSong.videoId || '')}`
    : '#';

  return (
    <AppShell variant="narrow" activeNav="trails">
      <div className={`log-page ${styles.logContainer}`}>
        <header id="logHeader" className={styles.headerBlock} hidden={!isGuest && Boolean(detailSongId)}>
          <h1 className={`page-title ${styles.pageTitle}`}>Log</h1>
          <p className={`page-sub ${styles.pageSub}`}>
            최근 12주 연습 달력과 곡별 기록·녹음을 한눈에 확인해요.
          </p>
          <nav
            className={`tabs ${styles.tabs}`}
            id="logTabs"
            role="tablist"
            aria-label="기록 보기"
            hidden={isGuest || Boolean(detailSongId)}
          >
            <button
              type="button"
              className={`tab ${styles.tab}`}
              role="tab"
              id="tab-log"
              aria-selected={activeTab === 'log'}
              onClick={() => {
                setDetailSongId(null);
                setActiveTab('log');
                window.history.pushState(null, '', 'log.html');
              }}
            >
              기록
            </button>
            <button
              type="button"
              className={`tab ${styles.tab}`}
              role="tab"
              id="tab-songs"
              aria-selected={activeTab === 'songs'}
              onClick={() => {
                setDetailSongId(null);
                setActiveTab('songs');
                window.history.pushState(null, '', 'log.html#songs');
              }}
            >
              곡
            </button>
          </nav>
        </header>

        <p className={`msg${msg.kind ? ' ' + msg.kind : ''}`} id="logMsg" role="status">
          {msg.text}
        </p>

        <div className={`panel ${styles.panel}`} id="logGuest" hidden={!isGuest}>
          <p>Google 계정으로 로그인하면 연습 달력과 녹음 기록을 볼 수 있어요.</p>
          <div className={styles.row}>
            <SafeLink className="pillBtn" href="settings.html#account">
              로그인하러 가기
            </SafeLink>
          </div>
        </div>

        {/* 1. 기록 탭 패널 */}
        <section
          id="pane-log"
          role="tabpanel"
          aria-labelledby="tab-log"
          className={styles.logContainer}
          hidden={isGuest || Boolean(detailSongId) || activeTab !== 'log'}
        >
          <div className={`log-summary ${styles.logSummary}`}>
            <div className={`summary-card ${styles.summaryCard}`}>
              <span className={`summary-title ${styles.summaryTitle}`}>이번 주 총 연습</span>
              <span className={`summary-val ${styles.summaryVal}`} id="sumWeek">
                {fmtDuration(sessionsData?.summary?.thisWeekSeconds)}
              </span>
            </div>
            <div className={`summary-card ${styles.summaryCard}`}>
              <span className={`summary-title ${styles.summaryTitle}`}>이번 달 총 연습</span>
              <span className={`summary-val ${styles.summaryVal}`} id="sumMonth">
                {fmtDuration(sessionsData?.summary?.thisMonthSeconds)}
              </span>
            </div>
          </div>

          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h2 className={`h3 ${styles.h3}`}>최근 12주 연습 달력</h2>
              <span className={`meta ${styles.meta}`} id="calRange">
                {calRangeText}
              </span>
            </div>
            <div className={`cal-grid ${styles.calGrid}`} id="calGrid" role="grid" aria-label="최근 12주 연습 달력">
              {days84.map((dateStr) => {
                const c = calendarMap.get(dateStr);
                const lv = c && c.level ? c.level : 0;
                const lvClass =
                  lv === 4
                    ? styles.lv4
                    : lv === 3
                      ? styles.lv3
                      : lv === 2
                        ? styles.lv2
                        : lv === 1
                          ? styles.lv1
                          : styles.lv0;
                const durText = c ? fmtDuration(c.totalSeconds) : '0분';
                return (
                  <button
                    key={dateStr}
                    type="button"
                    className={`cal-day lv${lv} ${styles.calDay} ${lvClass}`}
                    data-date={dateStr}
                    aria-pressed={dateStr === selectedDate}
                    aria-label={`${dateStr} · ${durText}`}
                    onClick={() => setSelectedDate(dateStr)}
                  />
                );
              })}
            </div>
            <div className={`cal-legend ${styles.calLegend}`} aria-hidden="true">
              <span>적음</span>
              <i className={`lv0 ${styles.lv0}`} />
              <i className={`lv1 ${styles.lv1}`} />
              <i className={`lv2 ${styles.lv2}`} />
              <i className={`lv3 ${styles.lv3}`} />
              <i className={`lv4 ${styles.lv4}`} />
              <span>많음</span>
            </div>
          </div>

          <div id="daySection" className={styles.logContainer}>
            <h2 id="dayTitle" className={styles.h3}>
              {selectedDate ? `${selectedDate} 연습 기록` : '연습 기록'}
            </h2>
            <div className={`log-sessions ${styles.logSessions}`} id="daySessions">
              {daySessionsList.length === 0 ? (
                <p className={`empty ${styles.empty}`}>이 날에는 기록된 연습 세션이 없어요.</p>
              ) : (
                daySessionsList.map((s) => (
                  <SessionCardItem
                    key={s.id}
                    session={s}
                    onMemoSaved={(sessId, nextMemo) => {
                      setSessionsData((prev) =>
                        prev
                          ? {
                              ...prev,
                              sessions: prev.sessions.map((it) =>
                                it.id === sessId ? { ...it, memo: nextMemo } : it
                              ),
                            }
                          : prev
                      );
                    }}
                    onTakeRemoved={(sessId, takeId) => {
                      setSessionsData((prev) =>
                        prev
                          ? {
                              ...prev,
                              sessions: prev.sessions.map((it) =>
                                it.id === sessId
                                  ? { ...it, takes: (it.takes || []).filter((tk) => tk.id !== takeId) }
                                  : it
                              ),
                            }
                          : prev
                      );
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* 2. 곡 보관함 탭 패널 (FR-LIB-1) */}
        <section
          id="pane-songs"
          role="tabpanel"
          aria-labelledby="tab-songs"
          className={styles.logContainer}
          hidden={isGuest || Boolean(detailSongId) || activeTab !== 'songs'}
        >
          <div className={`seg-pill ${styles.segPill}`} id="songFilters" role="group" aria-label="곡 상태 필터">
            {(
              [
                ['', '전체'],
                ['practicing', '연습 중'],
                ['paused', '보류'],
                ['done', '완료'],
              ] as const
            ).map(([stCode, label]) => (
              <button
                key={stCode || 'all'}
                type="button"
                className={styles.segBtn}
                data-status={stCode}
                aria-pressed={songFilter === stCode}
                onClick={() => setSongFilter(stCode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`log-sessions ${styles.logSessions}`} id="songList">
            {songsList.length === 0 ? (
              <p className={`empty ${styles.empty}`}>등록된 연습 곡이 없어요.</p>
            ) : (
              songsList.map((s) => (
                <SongCardItem
                  key={s.id}
                  song={s}
                  onOpenDetail={(sId) => {
                    setDetailSongId(sId);
                    window.history.pushState(null, '', `log.html?song=${encodeURIComponent(sId)}`);
                  }}
                  onUpdated={(updated) => {
                    setSongsList((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
                  }}
                  onRemoved={(sId) => {
                    setSongsList((prev) => prev.filter((it) => it.id !== sId));
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* 3. 곡 상세 패널 (FR-LIB-2, FR-LIB-3) */}
        <section
          id="pane-song-detail"
          className={styles.logContainer}
          hidden={isGuest || !detailSongId}
        >
          <div className={`panel ${styles.panel}`}>
            <div className={styles.row}>
              <button
                type="button"
                className={`ghost mini ${styles.ghostMini}`}
                id="btnBackSongs"
                onClick={() => {
                  setDetailSongId(null);
                  setActiveTab('songs');
                  window.history.pushState(null, '', 'log.html#songs');
                }}
              >
                ← 곡 목록
              </button>
            </div>
            <div>
              <h2 className={`h3 ${styles.h3}`} id="detailTitle">
                {detailSong?.title || ''}
              </h2>
              <span className={`meta ${styles.meta}`} id="detailArtist">
                {detailSong?.artist ? ` · ${detailSong.artist}` : ''}
              </span>
            </div>
            <div className={`meta ${styles.meta}`} id="detailMeta">
              {detailSong
                ? `누적 ${fmtDuration(detailSong.totalSeconds)}${
                    detailSong.lastDate ? ` · 최근 연습 ${detailSong.lastDate}` : ' · 연습 기록 없음'
                  }`
                : ''}
            </div>
            <div className={styles.row}>
              <SafeLink className="pillBtn" id="detailResume" href={detailResumeHref}>
                ▶ 이어서 연습
              </SafeLink>
              <select
                id="detailStatus"
                className={styles.selectPill}
                aria-label="곡 상태"
                value={detailStatus}
                onChange={async (e) => {
                  if (!detailSong) return;
                  const next = e.target.value;
                  setDetailStatus(next);
                  try {
                    const updated = await apiClient.songs.update(detailSong.id, { status: next });
                    if (updated) {
                      setDetailData((prev) => (prev ? { ...prev, song: updated } : prev));
                    }
                  } catch (err: any) {
                    window.alert((err && err.message) || '상태 변경에 실패했어요');
                    setDetailStatus(detailSong.statusCode || 'practicing');
                  }
                }}
              >
                <option value="practicing">연습 중</option>
                <option value="paused">보류</option>
                <option value="done">완료</option>
              </select>
              <button
                type="button"
                className="ghostBtn"
                id="btnDeleteSong"
                onClick={async () => {
                  if (!detailSong) return;
                  if (!window.confirm('이 곡과 모든 연습 기록·녹음 파일을 함께 삭제할까요?')) return;
                  try {
                    await apiClient.songs.remove(detailSong.id);
                    setDetailSongId(null);
                    setActiveTab('songs');
                    window.history.pushState(null, '', 'log.html#songs');
                  } catch (err: any) {
                    window.alert((err && err.message) || '곡 삭제에 실패했어요');
                  }
                }}
              >
                곡 삭제
              </button>
            </div>
            <div className={styles.field}>
              <label className={styles.lab} htmlFor="detailMemo">
                곡 메모
              </label>
              <textarea
                id="detailMemo"
                className="inpField"
                rows={2}
                maxLength={2000}
                placeholder="곡 메모"
                value={detailMemo}
                onChange={(e) => setDetailMemo(e.target.value)}
              />
              <div className={styles.row}>
                <button
                  type="button"
                  className="ghostBtn"
                  id="btnSaveSongMemo"
                  onClick={async () => {
                    if (!detailSong) return;
                    try {
                      const updated = await apiClient.songs.update(detailSong.id, { memo: detailMemo });
                      if (updated) {
                        setDetailData((prev) => (prev ? { ...prev, song: updated } : prev));
                      }
                      setDetailMemoBtnText('저장됨');
                      setTimeout(() => setDetailMemoBtnText('저장'), 1500);
                    } catch (err: any) {
                      window.alert((err && err.message) || '메모 저장에 실패했어요');
                    }
                  }}
                >
                  {detailMemoBtnText}
                </button>
              </div>
            </div>
          </div>

          {/* 연습 시간 막대 타임라인 (FR-LIB-2: <progress className={`tl-bar ${styles.tlBar}`} 위임) */}
          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`}>연습 세션 타임라인</h3>
            </div>
            <SessionTimeline sessions={detailSessions} idPrefix="" />
          </div>

          {/* 녹음 목록 및 A/B 비교 듣기 (FR-LIB-3: id="abPanel" id="abAudioA" id="abAudioB" 위임) */}
          <div className={`panel ${styles.panel}`}>
            <div className={`head-row ${styles.headRow}`}>
              <h3 className={`h3 ${styles.h3}`}>녹음 테이크 목록</h3>
            </div>
            <div id="detailTakes" className={styles.sessionTakes}>
              {detailTakes.length === 0 ? (
                <p className={`empty ${styles.empty}`}>아직 녹음된 테이크가 없어요.</p>
              ) : (
                detailTakes.map((t) => (
                  <TakeItemRow
                    key={t.id}
                    take={t}
                    showAbCheck
                    abChecked={abSelected.includes(t.id)}
                    onToggleAb={(takeId, checked) => {
                      setAbSelected((prev) => {
                        if (checked) {
                          const next = prev.length >= 2 ? [...prev.slice(1), takeId] : [...prev, takeId];
                          return next;
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

            <AbCompare abPair={abPair} activeUid={activeUid} idPrefix="" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default LogPage;

