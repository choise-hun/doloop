// frontend/src/pages/PracticePage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeAudio } from '../components/common/SafeAudio';
import { SafeLink } from '../components/common/SafeLink';
import { SongRecordPanel } from '../components/songRecord/SongRecordPanel';
import { auth, useAuth } from '../lib/auth';
import { apiClient, CategoryDto, SongDto, SongPresetDto, TakeDto } from '../lib/apiClient';
import { takeOpenCategory } from '../lib/categories';
import { playlistUrlFrom } from '../lib/community.mts';
import { drive } from '../lib/drive';
import { json, videoIdFrom } from '../lib/security';
import { PlaylistImportModal } from '../components/community/PlaylistImportModal';
import { t } from '../lib/i18n.mts';
import styles from './PracticePage.module.css';

export const RATES: ReadonlyArray<number> = [0.25, 0.5, 0.75, 1];
export const AUTOSAVE_MS = 30000;
export const REC_MAX_SEC = 30 * 60;
export const REC_TYPES: ReadonlyArray<string> = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];
export const REC_EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
};

export function pad2(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(2, '0');
}

export function formatPlayerTime(s: number | null | undefined, tenths = false): string {
  if (s == null || Number.isNaN(s) || !Number.isFinite(s)) return '--:--';
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const r = safe - m * 60;
  return tenths ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${m}:${pad2(Math.floor(r))}`;
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function getNowHhMm(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseFiniteNum(v: string | null): number | null {
  if (v == null || v.trim() === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function buildPlayerResumeSearch(s: {
  videoId: string;
  pos?: number | null;
  a?: number | null;
  b?: number | null;
  rate?: number | null;
}): string {
  const q = new URLSearchParams({ v: s.videoId });
  const t = s.pos != null ? s.pos : s.a;
  if (t) q.set('t', String(Math.floor(t)));
  if (s.a != null) q.set('a', String(s.a));
  if (s.b != null) q.set('b', String(s.b));
  if (s.rate && s.rate !== 1) q.set('r', String(s.rate));
  return `?${q.toString()}`;
}

export function sanitizeDownloadName(date: string, time: string, title: string, mime: string): string {
  const base = `${date} ${time.replace(':', '')} ${title || t('practice.recFileDefaultTitle')}`.replace(/[\\/:*?"<>|]+/g, ' ');
  const ext = REC_EXT[mime] || 'webm';
  return `${base}.${ext}`;
}

export interface PendingTakeState {
  blob: Blob;
  url: string;
  mime: string;
  seconds: number;
  done: boolean;
  videoId: string;
  song: SongDto | null;
  date: string;
  time: string;
  a: number | null;
  b: number | null;
  rate: number;
  recordedAt: string;
  serverTake?: TakeDto | null;
}

// 서랍에서 어떤 분류에도 속하지 않은 곡을 모으는 폴더 id
const UNCATEGORIZED_FOLDER = '__uncategorized';

export function PracticePage(): React.ReactElement {
  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;
  const isDrive = Boolean(authState.me && authState.me.storageProvider === 'drive');

  // 플레이어 상태
  const [videoId, setVideoId] = useState<string | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [waitLeadSec, setWaitLeadSec] = useState<number>(0);
  const [waitTimerOn, setWaitTimerOn] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const [presets, setPresets] = useState<SongPresetDto[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const presetReqSeqRef = useRef<number>(0);

  const barRef = useRef<HTMLDivElement | null>(null);
  const handleARef = useRef<HTMLDivElement | null>(null);
  const handleBRef = useRef<HTMLDivElement | null>(null);

  const [rate, setRateState] = useState<number>(1);
  const [availRates, setAvailRates] = useState<number[]>([0.25, 0.5, 0.75, 1]);
  const [loops, setLoops] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; err: boolean }>({ text: '', err: false });

  // 입력 폼 및 곡 목록 서랍 상태
  const [urlInput1, setUrlInput1] = useState('');
  const [urlInput2, setUrlInput2] = useState('');
  const [libOpen, setLibOpen] = useState(false);
  const [songsList, setSongsList] = useState<SongDto[] | null>(null);
  const [songsErr, setSongsErr] = useState('');

  // 곡 분류: 서랍 폴더(null = 전부 펼침)와 현재 곡 분류 팝업
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string> | null>(null);
  const [catPopOpen, setCatPopOpen] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const catWrapRef = useRef<HTMLDivElement | null>(null);
  // 홈 분류 버튼에서 넘어온 분류 id (null = 아직 안 읽음)
  const pendingCategoryRef = useRef<string | null>(null);

  // 녹음 및 무료 녹음 곡 수 한도 모달 상태
  const [recording, setRecording] = useState(false);
  const [recElapsedSec, setRecElapsedSec] = useState(0);
  const [take, setTakeState] = useState<PendingTakeState | null>(null);
  const [uploadingTake, setUploadingTake] = useState(false);
  const [recMsg, setRecMsg] = useState<{ text: string; err: boolean }>({ text: '', err: false });
  const [takeLimitModalOpen, setTakeLimitModalOpen] = useState(false);
  const [takeLimitCount, setTakeLimitCount] = useState<number>(2);
  const [busyDriveConnect, setBusyDriveConnect] = useState(false);
  const [srReloadKey, setSrReloadKey] = useState(0);

  // 내부 가변 참조 (인터벌·콜백 최신 상태 유지)
  const playerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  const pendingLoadRef = useRef<{ id: string; start: number } | null>(null);
  const seekingRef = useRef(false);
  const seekGuardUntilRef = useRef(0);
  const unsavedSecRef = useRef(0);
  const unsavedLoopsRef = useRef(0);
  const savingRef = useRef(false);
  const savePendingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAtRef = useRef(0);
  const songReqSeqRef = useRef(0);
  const songsListReqSeqRef = useRef(0);
  const migrationAttemptedRef = useRef<Record<string, boolean>>({});
  const lastUidRef = useRef<string | null>(null);

  const stRef = useRef({
    videoId: null as string | null,
    song: null as SongDto | null,
    ready: false,
    playing: false,
    duration: 0,
    a: null as number | null,
    b: null as number | null,
    loopOn: false,
    waitLeadSec: 0,
    waitTimerOn: false,
    rate: 1,
    loops: 0,
    dirty: false,
  });
  stRef.current = {
    videoId,
    song,
    ready,
    playing,
    duration,
    a: pointA,
    b: pointB,
    loopOn,
    waitLeadSec,
    waitTimerOn,
    rate,
    loops,
    dirty,
  };

  // 녹음 레프
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartedAtRef = useRef(0);
  const recMetaRef = useRef<{
    videoId: string;
    song: SongDto | null;
    date: string;
    time: string;
    a: number | null;
    b: number | null;
    rate: number;
    recordedAt: string;
  } | null>(null);
  const takeRef = useRef<PendingTakeState | null>(null);
  takeRef.current = take;
  const uploadingRef = useRef(false);
  uploadingRef.current = uploadingTake;

  const safePlayerTime = (): number => {
    try {
      return (playerRef.current && typeof playerRef.current.getCurrentTime === 'function'
        ? playerRef.current.getCurrentTime()
        : 0) || 0;
    } catch {
      return 0;
    }
  };

  const getVideoTitle = (): string => {
    try {
      return (
        (playerRef.current &&
          typeof playerRef.current.getVideoData === 'function' &&
          playerRef.current.getVideoData()?.title) ||
        ''
      );
    } catch {
      return '';
    }
  };

  const getVideoAuthor = (): string => {
    try {
      return (
        (playerRef.current &&
          typeof playerRef.current.getVideoData === 'function' &&
          playerRef.current.getVideoData()?.author) ||
        ''
      );
    } catch {
      return '';
    }
  };

  const computeCurrentPos = (): number => {
    const cur = stRef.current;
    if (cur.a != null) return cur.a;
    return Math.max(0, Math.floor(safePlayerTime()) - 2);
  };

  const persistLocalSnapshot = (override?: Partial<{
    videoId: string | null;
    pos: number;
    a: number | null;
    b: number | null;
    rate: number;
  }>) => {
    const cur = stRef.current;
    const vid = override?.videoId !== undefined ? override.videoId : cur.videoId;
    if (!vid) return;
    const snap = {
      videoId: vid,
      pos: override?.pos !== undefined ? override.pos : cur.ready ? computeCurrentPos() : startAtRef.current,
      a: override?.a !== undefined ? override.a : cur.a,
      b: override?.b !== undefined ? override.b : cur.b,
      rate: override?.rate !== undefined ? override.rate : cur.rate,
    };
    json.set(`ulp:v:${vid}`, { ...snap, date: getTodayStr() });
    try {
      const search = buildPlayerResumeSearch(snap);
      window.history.replaceState(null, '', `${window.location.pathname}${search}`);
    } catch {
      /* ignore */
    }
  };

  const scheduleAutoSave = (ms: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveProgressNow('auto');
    }, ms);
  };

  const markDirty = (nextSnap?: Partial<{ a: number | null; b: number | null; rate: number }>) => {
    setDirty(true);
    stRef.current.dirty = true;
    persistLocalSnapshot(nextSnap);
    scheduleAutoSave(4000);
  };

  const ensureAccountSong = async (): Promise<SongDto> => {
    if (stRef.current.song) return stRef.current.song;
    const vid = stRef.current.videoId;
    if (!vid) throw new Error(t('practice.errNoPlayingVideo'));
    const created = await apiClient.songs.create({
      videoId: vid,
      title: getVideoTitle(),
      artist: getVideoAuthor(),
      rate: stRef.current.rate,
    });
    if (!created) throw new Error(t('practice.errCreateSongFailed'));
    stRef.current.song = created;
    setSong(created);
    setSongsList(null);
    return created;
  };

  const saveProgressNow = async (reason: 'auto' | 'manual', opts?: { keepalive?: boolean }) => {
    const cur = stRef.current;
    if (!cur.videoId) return;
    persistLocalSnapshot();
    if (!apiClient.isLoggedIn()) {
      if (reason === 'manual') {
        setSyncMsg({ text: t('practice.syncLocalSaved'), err: false });
      }
      return;
    }
    if (!cur.song && reason !== 'manual') return;
    if (savingRef.current) {
      savePendingRef.current = true;
      return;
    }
    const addSec = Math.floor(unsavedSecRef.current);
    const addLoops = unsavedLoopsRef.current;
    if (reason === 'auto' && !cur.dirty && addSec < 15) return;

    savingRef.current = true;
    setSyncMsg({ text: t('practice.syncSaving'), err: false });
    try {
      const targetSong = cur.song || (await ensureAccountSong());
      const pos = cur.ready ? computeCurrentPos() : startAtRef.current;
      const r = await apiClient.saveProgress(
        {
          songId: targetSong.id,
          pos,
          a: cur.a,
          b: cur.b,
          rate: cur.rate,
          date: getTodayStr(),
          addSeconds: addSec,
          addLoops,
        },
        opts
      );
      if (!r.keep) {
        unsavedSecRef.current = Math.max(0, unsavedSecRef.current - addSec);
        unsavedLoopsRef.current = Math.max(0, unsavedLoopsRef.current - addLoops);
      }
      stRef.current.dirty = false;
      setDirty(false);
      const updatedSong: SongDto = {
        ...targetSong,
        a: cur.a,
        b: cur.b,
        rate: cur.rate,
        pos,
        lastDate: getTodayStr(),
      };
      stRef.current.song = updatedSong;
      setSong(updatedSong);
      setSrReloadKey((k) => k + 1);
      setSyncMsg({ text: t('practice.syncSaved', { time: getNowHhMm() }), err: false });
    } catch (e: any) {
      if (e && e.status === 404) {
        stRef.current.song = null;
        setSong(null);
        setSyncMsg({ text: t('practice.syncDeletedFromAccount'), err: true });
      } else {
        setSyncMsg({ text: (e && e.message) || t('practice.syncSaveFailed'), err: true });
      }
    } finally {
      savingRef.current = false;
      if (savePendingRef.current) {
        savePendingRef.current = false;
        void saveProgressNow('auto');
      }
    }
  };

  const applyPlayerRate = (targetRate: number) => {
    if (!playerRef.current || !stRef.current.ready) return;
    try {
      if (
        typeof playerRef.current.getPlaybackRate === 'function' &&
        Math.abs(playerRef.current.getPlaybackRate() - targetRate) > 0.001
      ) {
        playerRef.current.setPlaybackRate(targetRate);
      }
    } catch {
      /* ignore */
    }
  };

  const updateRateAvailability = () => {
    try {
      const avail =
        playerRef.current && typeof playerRef.current.getAvailablePlaybackRates === 'function'
          ? playerRef.current.getAvailablePlaybackRates()
          : null;
      if (Array.isArray(avail) && avail.length > 0) {
        setAvailRates(avail);
      }
    } catch {
      /* ignore */
    }
  };

  const startCountdownAndPlay = (targetTime: number) => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // 50ms 감시 타이머·단축키는 마운트 시점 클로저라 상태 대신 stRef로 읽는다
    const curWait = stRef.current.waitLeadSec || (stRef.current.waitTimerOn ? 10 : 0);
    if (!curWait || curWait <= 0) {
      seekGuardUntilRef.current = Date.now() + 400;
      try {
        playerRef.current?.seekTo?.(targetTime, true);
        playerRef.current?.playVideo?.();
        setCurrentTime(targetTime);
      } catch {
        /* ignore */
      }
      return;
    }
    let remain = curWait;
    setCountdownSec(remain);
    try {
      playerRef.current?.pauseVideo?.();
      playerRef.current?.seekTo?.(targetTime, true);
      setCurrentTime(targetTime);
    } catch {
      /* ignore */
    }
    countdownTimerRef.current = window.setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownSec(null);
        seekGuardUntilRef.current = Date.now() + 400;
        try {
          playerRef.current?.playVideo?.();
        } catch {
          /* ignore */
        }
      } else {
        setCountdownSec(remain);
      }
    }, 1000);
  };

  const jumpToLoopStart = () => {
    if (!playerRef.current || !stRef.current.ready) return;
    const cur = stRef.current;
    const to = cur.a != null ? cur.a : 0;
    if (cur.waitTimerOn && cur.playing) {
      startCountdownAndPlay(to);
    } else {
      seekGuardUntilRef.current = Date.now() + 400;
      try {
        playerRef.current.seekTo(to, true);
        setCurrentTime(to);
      } catch {
        /* ignore */
      }
    }
  };

  const createOrCuePlayer = (id: string, startSec: number) => {
    const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
    if (!ytReadyRef.current || !win.YT || typeof win.YT.Player !== 'function') {
      pendingLoadRef.current = { id, start: startSec };
      return;
    }
    if (playerRef.current && typeof playerRef.current.cueVideoById === 'function') {
      try {
        playerRef.current.cueVideoById({ videoId: id, startSeconds: startSec });
        return;
      } catch {
        /* fallback to new player */
      }
    }
    try {
      playerRef.current = new win.YT.Player('player', {
        videoId: id,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          start: Math.floor(startSec || 0),
          origin: window.location.origin,
        },
        events: {
          onReady() {
            stRef.current.ready = true;
            setReady(true);
            applyPlayerRate(stRef.current.rate);
            updateRateAvailability();
            if (startSec > 0 && playerRef.current?.seekTo) {
              playerRef.current.seekTo(startSec, true);
            }
            const dur = (playerRef.current?.getDuration && playerRef.current.getDuration()) || 0;
            stRef.current.duration = dur;
            setDuration(dur);
          },
          onStateChange(e: any) {
            const S = win.YT?.PlayerState || { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
            const wasPlaying = stRef.current.playing;
            const nowPlaying = e.data === S.PLAYING || e.data === S.BUFFERING;
            stRef.current.playing = nowPlaying;
            setPlaying(nowPlaying);
            if (e.data === S.PLAYING) {
              applyPlayerRate(stRef.current.rate);
              const dur = (playerRef.current?.getDuration && playerRef.current.getDuration()) || stRef.current.duration;
              stRef.current.duration = dur;
              setDuration(dur);
              updateRateAvailability();
            }
            if (e.data === S.ENDED && stRef.current.loopOn && stRef.current.a != null) {
              jumpToLoopStart();
              stRef.current.loops += 1;
              unsavedLoopsRef.current += 1;
              setLoops(stRef.current.loops);
              playerRef.current?.playVideo?.();
            }
            if (wasPlaying && e.data === S.PAUSED) {
              scheduleAutoSave(1500);
            }
          },
          onPlaybackRateChange(e: any) {
            const nextR = Number(e.data);
            if (Number.isFinite(nextR) && Math.abs(nextR - stRef.current.rate) > 0.001) {
              stRef.current.rate = nextR;
              setRateState(nextR);
              markDirty({ rate: nextR });
            }
          },
          onError() {
            setSyncMsg({
              text: t('practice.embedBlocked'),
              err: true,
            });
          },
        },
      });
    } catch {
      setSyncMsg({ text: t('practice.ytInitFailed'), err: true });
    }
  };

  const openSongById = async (
    id: string,
    opts?: {
      params?: { a: number | null; b: number | null; rate: number; t: number | null } | null;
      song?: SongDto | null;
    }
  ) => {
    stopRecordingNow();
    if (stRef.current.videoId && stRef.current.videoId !== id) {
      await saveProgressNow('auto');
    }
    const mySeq = ++songReqSeqRef.current;
    const myUid = auth.getUser()?.id ?? null;

    setVideoId(id);
    setSong(null);
    setPointA(null);
    setPointB(null);
    setLoopOn(false);
    setLoops(0);
    setDirty(false);
    setDuration(0);
    setCurrentTime(0);
    unsavedSecRef.current = 0;
    unsavedLoopsRef.current = 0;
    setSyncMsg({ text: '', err: false });

    const local = json.get<{
      videoId?: string;
      pos?: number | null;
      a?: number | null;
      b?: number | null;
      rate?: number | null;
    } | null>(`ulp:v:${id}`, null);
    const src = opts?.params || null;
    let resolvedSong = opts?.song || null;

    if (!resolvedSong && apiClient.isLoggedIn()) {
      setSyncMsg({ text: t('practice.checkingAccountRecord'), err: false });
      try {
        const fetched = await apiClient.songs.byVideo(id);
        if (mySeq !== songReqSeqRef.current || (auth.getUser()?.id ?? null) !== myUid) return;
        resolvedSong = fetched;
        setSyncMsg({ text: fetched ? t('practice.accountRecordLoaded') : t('practice.notInAccount'), err: false });
      } catch (e: any) {
        if (mySeq !== songReqSeqRef.current || (auth.getUser()?.id ?? null) !== myUid) return;
        setSyncMsg({ text: (e && e.message) || t('practice.checkAccountRecordFailed'), err: true });
      }
    }

    const base: any = src || resolvedSong || local || {};
    const nextA = typeof base.a === 'number' && Number.isFinite(base.a) ? base.a : null;
    const nextB = typeof base.b === 'number' && Number.isFinite(base.b) ? base.b : null;
    const nextRate = RATES.includes(Number(base.rate)) ? Number(base.rate) : 1;
    const nextLoopOn = nextA != null && nextB != null && nextB > nextA;
    let startSec =
      typeof base.t === 'number' && Number.isFinite(base.t)
        ? base.t
        : typeof base.pos === 'number' && Number.isFinite(base.pos)
          ? base.pos
          : 0;
    if (nextLoopOn && nextA != null && nextB != null && (startSec < nextA - 3 || startSec >= nextB)) {
      startSec = Math.max(0, nextA);
    }

    startAtRef.current = startSec;
    stRef.current.videoId = id;
    stRef.current.song = resolvedSong;
    stRef.current.a = nextA;
    stRef.current.b = nextB;
    stRef.current.rate = nextRate;
    stRef.current.loopOn = nextLoopOn;

    setSong(resolvedSong);
    setPointA(nextA);
    setPointB(nextB);
    setRateState(nextRate);
    setLoopOn(nextLoopOn);
    setCurrentTime(startSec);

    createOrCuePlayer(id, startSec);
    applyPlayerRate(nextRate);
    persistLocalSnapshot({ videoId: id, pos: startSec, a: nextA, b: nextB, rate: nextRate });
  };

  // ---------- 배속 및 구간 조작 ----------
  const handleSetRate = (r: number) => {
    stRef.current.rate = r;
    setRateState(r);
    applyPlayerRate(r);
    markDirty({ rate: r });
  };

  const handleSetPoint = (which: 'a' | 'b', explicitTime?: number) => {
    if (!stRef.current.ready && explicitTime == null) return;
    const d = stRef.current.duration || Infinity;
    const rawT = explicitTime == null ? safePlayerTime() : explicitTime;
    const t = round1(Math.max(0, Math.min(rawT, d)));
    let nextA = stRef.current.a;
    let nextB = stRef.current.b;
    let nextLoopOn = stRef.current.loopOn;

    if (which === 'a') {
      nextA = t;
      if (nextB != null && nextB <= nextA) nextB = null;
    } else {
      nextB = t;
      if (nextA != null && nextA >= nextB) nextA = null;
      if (nextA != null && nextB != null && explicitTime == null) {
        nextLoopOn = true;
        setLoops(0);
        stRef.current.loops = 0;
      }
    }
    if (nextA == null || nextB == null) nextLoopOn = false;

    stRef.current.a = nextA;
    stRef.current.b = nextB;
    stRef.current.loopOn = nextLoopOn;
    setPointA(nextA);
    setPointB(nextB);
    setLoopOn(nextLoopOn);
    markDirty({ a: nextA, b: nextB });
  };

  const handleNudge = (which: 'a' | 'b', delta: number) => {
    const curVal = which === 'a' ? stRef.current.a : stRef.current.b;
    if (curVal != null) {
      handleSetPoint(which, curVal + delta);
    }
  };

  const handleToggleLoop = () => {
    const cur = stRef.current;
    if (cur.a == null || cur.b == null) return;
    const next = !cur.loopOn;
    stRef.current.loopOn = next;
    stRef.current.loops = 0;
    setLoopOn(next);
    setLoops(0);
    if (next) {
      const t = safePlayerTime();
      if (t < cur.a - 0.5 || t >= cur.b) {
        jumpToLoopStart();
      }
    }
  };

  const handleClearLoop = () => {
    if (stRef.current.a != null || stRef.current.b != null) {
      const ok = window.confirm(t('practice.clearLoopConfirm'));
      if (!ok) return;
    }
    stRef.current.a = null;
    stRef.current.b = null;
    stRef.current.loopOn = false;
    stRef.current.loops = 0;
    setPointA(null);
    setPointB(null);
    setLoopOn(false);
    setLoops(0);
    setSelectedPresetId('');
    markDirty({ a: null, b: null });
  };

  // ---------- 프리셋 및 드래그 핸들 (UI-2) ----------
  useEffect(() => {
    if (!song || !apiClient.isLoggedIn()) {
      setPresets([]);
      setSelectedPresetId('');
      return;
    }
    const token = ++presetReqSeqRef.current;
    apiClient.songs
      .listPresets(song.id)
      .then((res) => {
        if (token !== presetReqSeqRef.current) return;
        setPresets(res.presets || []);
      })
      .catch(() => {
        if (token !== presetReqSeqRef.current) return;
        setPresets([]);
      });
  }, [song?.id]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  const handleSavePreset = async () => {
    if (!song || pointA == null || pointB == null) return;
    const name = window.prompt(t('practice.presetPrompt'))?.trim();
    if (!name) return;
    const existing = presets.find((p) => p.name === name);
    let merge = true;
    if (existing) {
      const ok = window.confirm(t('practice.presetMergeConfirm'));
      if (!ok) return;
      merge = true;
    }
    const token = ++presetReqSeqRef.current;
    try {
      const res = await apiClient.songs.putPreset(song.id, {
        name,
        a: pointA,
        b: pointB,
        rate,
        merge,
      });
      if (token !== presetReqSeqRef.current) return;
      setPresets((prev) => {
        const idx = prev.findIndex((p) => p.name === name);
        return idx >= 0 ? [...prev.slice(0, idx), res.preset, ...prev.slice(idx + 1)] : [...prev, res.preset];
      });
      setSelectedPresetId(res.preset.id);
    } catch (err: any) {
      if (token === presetReqSeqRef.current) window.alert(err.message || 'Error');
    }
  };

  const handleUpdatePreset = async () => {
    if (!song || pointA == null || pointB == null || !selectedPresetId) return;
    const curPreset = presets.find((p) => p.id === selectedPresetId);
    if (!curPreset) return;
    const rangeStr = `${formatPlayerTime(pointA)}–${formatPlayerTime(pointB)}`;
    const ok = window.confirm(t('practice.presetUpdateConfirm', { range: rangeStr }));
    if (!ok) return;
    const token = ++presetReqSeqRef.current;
    try {
      const res = await apiClient.songs.putPreset(song.id, {
        name: curPreset.name,
        a: pointA,
        b: pointB,
        rate,
        merge: false,
      });
      if (token !== presetReqSeqRef.current) return;
      setPresets((prev) => prev.map((p) => (p.id === selectedPresetId ? res.preset : p)));
    } catch (err: any) {
      if (token === presetReqSeqRef.current) window.alert(err.message || 'Error');
    }
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const p = presets.find((it) => it.id === presetId);
    if (!p) return;
    setPointA(p.a);
    setPointB(p.b);
    stRef.current.a = p.a;
    stRef.current.b = p.b;
    if (p.rate) {
      handleSetRate(p.rate);
    }
    stRef.current.dirty = true;
    setDirty(true);
  };

  const handleDeletePreset = async () => {
    if (!song || !selectedPresetId) return;
    const ok = window.confirm(t('practice.presetDeleteConfirm'));
    if (!ok) return;
    const token = ++presetReqSeqRef.current;
    try {
      await apiClient.songs.deletePreset(song.id, selectedPresetId);
      if (token !== presetReqSeqRef.current) return;
      setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
      setSelectedPresetId('');
    } catch (err: any) {
      if (token === presetReqSeqRef.current) window.alert(err.message || 'Error');
    }
  };

  useEffect(() => {
    if (duration <= 0) return;
    if (handleARef.current && pointA != null) {
      const pctA = Math.max(0, Math.min(100, (pointA / duration) * 100));
      handleARef.current.style.left = `calc(${pctA}% - 6px)`;
    }
    if (handleBRef.current && pointB != null) {
      const pctB = Math.max(0, Math.min(100, (pointB / duration) * 100));
      handleBRef.current.style.left = `calc(${pctB}% - 6px)`;
    }
  }, [pointA, pointB, duration]);

  const handleDragStart = (handle: 'a' | 'b', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const barEl = barRef.current;
    if (!barEl || duration <= 0) return;

    const onMouseMove = (moveEv: MouseEvent) => {
      const rect = barEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (moveEv.clientX - rect.left) / rect.width));
      const nextTime = Math.round(ratio * duration * 10) / 10;
      if (handle === 'a') {
        const curB = stRef.current.b;
        const validA = curB != null ? Math.min(nextTime, curB - 0.1) : nextTime;
        const clampedA = Math.max(0, Math.round(validA * 10) / 10);
        setPointA(clampedA);
        stRef.current.a = clampedA;
      } else {
        const curA = stRef.current.a;
        const validB = curA != null ? Math.max(nextTime, curA + 0.1) : nextTime;
        const clampedB = Math.min(duration, Math.round(validB * 10) / 10);
        setPointB(clampedB);
        stRef.current.b = clampedB;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      stRef.current.dirty = true;
      setDirty(true);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleTogglePlay = () => {
    if (!playerRef.current || !stRef.current.ready) return;
    if (stRef.current.playing) {
      playerRef.current.pauseVideo?.();
    } else {
      playerRef.current.playVideo?.();
    }
  };

  const handleSkip = (deltaSec: number) => {
    if (!playerRef.current || !stRef.current.ready) return;
    seekGuardUntilRef.current = Date.now() + 300;
    const target = Math.max(0, safePlayerTime() + deltaSec);
    playerRef.current.seekTo?.(target, true);
    setCurrentTime(target);
  };

  // ---------- 녹음 및 Google Drive 기본 연결 / 1곡 제한 교체 모달 ----------
  const stopRecordingNow = () => {
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      try {
        mrRef.current.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const uploadTakeNow = async (opts?: { replaceOldSongTakes?: boolean; targetTake?: PendingTakeState }) => {
    const tk = opts?.targetTake || takeRef.current;
    if (!tk || tk.done || uploadingRef.current) return;
    if (!apiClient.isLoggedIn()) {
      setRecMsg({ text: t('practice.recLoginPrompt'), err: true });
      return;
    }

    uploadingRef.current = true;
    setUploadingTake(true);
    setRecMsg({ text: t('practice.recUploading'), err: false });

    try {
      let targetSong = tk.song;
      if (!targetSong && stRef.current.videoId === tk.videoId) {
        targetSong = await ensureAccountSong();
        tk.song = targetSong;
      }
      if (!targetSong) {
        throw new Error(t('practice.errNoSongInfo'));
      }

      const uploaded = await apiClient.takes.upload(
        {
          songId: targetSong.id,
          date: tk.date,
          recordedAt: tk.recordedAt,
          a: tk.a,
          b: tk.b,
          rate: tk.rate,
          durationSec: tk.seconds,
          mime: tk.mime,
          replaceOldSongTakes: opts?.replaceOldSongTakes === true ? true : undefined,
        },
        tk.blob
      );

      const nextTake: PendingTakeState = {
        ...tk,
        song: targetSong,
        done: true,
        serverTake: uploaded,
      };
      takeRef.current = nextTake;
      setTakeState(nextTake);
      setTakeLimitModalOpen(false);
      setSrReloadKey((k) => k + 1);
      setRecMsg({
        text: opts?.replaceOldSongTakes
          ? t('practice.recReplaceSaved', { time: tk.time, sec: formatPlayerTime(tk.seconds) })
          : t('practice.recSaved', { time: tk.time, sec: formatPlayerTime(tk.seconds) }),
        err: false,
      });
    } catch (e: any) {
      if (e && e.status === 403 && e.code === 'FREE_TAKE_SONG_LIMIT_EXCEEDED') {
        const limitNum = Number((e.data as any)?.detail?.limit) || 2;
        setTakeLimitCount(limitNum);
        setTakeLimitModalOpen(true);
        setRecMsg({
          text:
            e.message ||
            t('practice.recFreePlanLimit', { limit: limitNum }),
          err: true,
        });
      } else if (e && e.status === 404) {
        const clearedTake: PendingTakeState = { ...tk, song: null };
        takeRef.current = clearedTake;
        setTakeState(clearedTake);
        if (stRef.current.videoId === tk.videoId) {
          stRef.current.song = null;
          setSong(null);
        }
        setRecMsg({ text: t('practice.recDeletedFromAccount'), err: true });
      } else {
        setRecMsg({ text: (e && e.message) || t('practice.recUploadFailed'), err: true });
      }
    } finally {
      uploadingRef.current = false;
      setUploadingTake(false);
    }
  };

  const handleConnectDriveFromPlayer = async () => {
    if (!apiClient.isLoggedIn()) {
      setRecMsg({ text: t('practice.loginGoogleFirst'), err: true });
      return;
    }
    setBusyDriveConnect(true);
    setRecMsg({ text: t('practice.connectingDrive'), err: false });
    try {
      await drive.enableDriveStorage();
      await auth.fetchMe();
      setTakeLimitModalOpen(false);
      setRecMsg({
        text: t('practice.driveConnected'),
        err: false,
      });
      if (takeRef.current && !takeRef.current.done) {
        await uploadTakeNow({ targetTake: takeRef.current });
      }
    } catch (err: any) {
      setRecMsg({
        text: (err && err.message) || t('practice.driveConnectFailed'),
        err: true,
      });
    } finally {
      setBusyDriveConnect(false);
    }
  };

  const startRecordingNow = async () => {
    if (mrRef.current || !stRef.current.videoId) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof window.MediaRecorder === 'undefined'
    ) {
      setRecMsg({ text: t('practice.recNotSupported'), err: true });
      return;
    }
    if (
      takeRef.current &&
      !takeRef.current.done &&
      !window.confirm(t('practice.confirmDiscardUnsavedRec'))
    ) {
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e: any) {
      setRecMsg({
        text:
          e && e.name === 'NotAllowedError'
            ? t('practice.micPermissionNeeded')
            : t('practice.micOpenFailed'),
        err: true,
      });
      return;
    }

    const supportedMime =
      REC_TYPES.find((t) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) ||
      '';
    const mr = new MediaRecorder(stream, {
      audioBitsPerSecond: 128000,
      ...(supportedMime ? { mimeType: supportedMime } : {}),
    });

    chunksRef.current = [];
    streamRef.current = stream;
    recMetaRef.current = {
      videoId: stRef.current.videoId,
      song: stRef.current.song,
      date: getTodayStr(),
      time: getNowHhMm(),
      a: stRef.current.a,
      b: stRef.current.b,
      rate: stRef.current.rate,
      recordedAt: new Date().toISOString(),
    };

    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    mr.onstop = () => {
      const mime = (mr.mimeType || supportedMime || 'audio/webm').split(';')[0];
      const seconds = Math.round((Date.now() - recStartedAtRef.current) / 1000);
      const blob = new Blob(chunksRef.current, { type: mime });
      stream.getTracks().forEach((tr) => tr.stop());
      mrRef.current = null;
      streamRef.current = null;
      chunksRef.current = [];
      setRecording(false);
      setRecElapsedSec(0);

      const meta = recMetaRef.current;
      recMetaRef.current = null;
      if (!meta) return;

      if (takeRef.current?.url) {
        try {
          URL.revokeObjectURL(takeRef.current.url);
        } catch {
          /* ignore */
        }
      }
      const nextUrl = URL.createObjectURL(blob);
      const createdTake: PendingTakeState = {
        blob,
        url: nextUrl,
        mime,
        seconds,
        done: false,
        ...meta,
      };
      takeRef.current = createdTake;
      setTakeState(createdTake);
      void uploadTakeNow({ targetTake: createdTake });
    };

    mrRef.current = mr;
    recStartedAtRef.current = Date.now();
    setRecording(true);
    setRecElapsedSec(0);
    mr.start(1000);
    setRecMsg({ text: t('practice.recRecording'), err: false });
  };

  const handleToggleRec = () => {
    if (mrRef.current) stopRecordingNow();
    else void startRecordingNow();
  };

  // ---------- 곡 목록 서랍 ----------
  const loadSongsDrawerList = async () => {
    if (!apiClient.isLoggedIn()) {
      setSongsList(null);
      setSongsErr('');
      return;
    }
    const mySeq = ++songsListReqSeqRef.current;
    const myUid = auth.getUser()?.id ?? null;
    setSongsList(null);
    setSongsErr('');
    try {
      const [list, cats] = await Promise.all([
        apiClient.songs.list(),
        apiClient.categories.list().catch(() => [] as CategoryDto[]),
      ]);
      if (mySeq !== songsListReqSeqRef.current || (auth.getUser()?.id ?? null) !== myUid) return;
      setCategories(cats);
      setSongsList(Array.isArray(list) ? list : []);
    } catch (e: any) {
      if (mySeq !== songsListReqSeqRef.current || (auth.getUser()?.id ?? null) !== myUid) return;
      setSongsList([]);
      setSongsErr((e && e.message) || t('practice.songsLoadFailed'));
    }
  };

  const openDrawer = () => {
    setLibOpen(true);
    void loadSongsDrawerList();
  };

  const closeDrawer = () => {
    setLibOpen(false);
  };

  const toggleFolder = (folderId: string, allIds: string[]) => {
    setOpenFolders((prev) => {
      const next = new Set(prev ?? allIds);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // 현재 곡 분류 켜고 끄기. 응답에서 categoryIds만 반영한다(재생 위치 등은 화면 상태가 최신)
  const toggleSongCategory = async (categoryId: string) => {
    const cur = stRef.current.song;
    if (!cur) return;
    const ids = cur.categoryIds || [];
    const nextIds = ids.includes(categoryId) ? ids.filter((x) => x !== categoryId) : [...ids, categoryId];
    // 먼저 화면에 반영하고, 실패하면 되돌린다
    const apply = (next: string[]) => {
      if (stRef.current.song && stRef.current.song.id === cur.id) {
        const merged = { ...stRef.current.song, categoryIds: next };
        stRef.current.song = merged;
        setSong(merged);
      }
      setSongsList((prev) => (prev ? prev.map((x) => (x.id === cur.id ? { ...x, categoryIds: next } : x)) : prev));
    };
    apply(nextIds);
    setCatSaving(true);
    try {
      const updated = await apiClient.songs.update(cur.id, { categoryIds: nextIds });
      if (updated && Array.isArray(updated.categoryIds)) apply(updated.categoryIds);
    } catch (e: any) {
      apply(ids);
      setSyncMsg({ text: (e && e.message) || t('practice.categorySaveFailed'), err: true });
    } finally {
      setCatSaving(false);
    }
  };

  // ---------- 초기화, YouTube API 로드, 인터벌, 키보드 단축키 ----------
  useEffect(() => {
    document.title = t('practice.documentTitle');
    const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};

    const prevReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      ytReadyRef.current = true;
      if (typeof prevReady === 'function') prevReady();
      if (pendingLoadRef.current) {
        const p = pendingLoadRef.current;
        pendingLoadRef.current = null;
        createOrCuePlayer(p.id, p.start);
      }
    };

    if (win.YT && typeof win.YT.Player === 'function') {
      ytReadyRef.current = true;
    } else if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onload = () => {
        if (!ytReadyRef.current && win.YT && typeof win.YT.Player === 'function') {
          win.onYouTubeIframeAPIReady();
        }
      };
      s.onerror = () => {
        setSyncMsg({ text: t('practice.ytLoadFailed'), err: true });
      };
      document.head.appendChild(s);
    }

    const q = new URLSearchParams(window.location.search);
    const startId = videoIdFrom(q.get('v') || '');
    const initialParams =
      q.has('a') || q.has('b') || q.has('r') || q.has('t')
        ? {
            a: parseFiniteNum(q.get('a')),
            b: parseFiniteNum(q.get('b')),
            rate: parseFiniteNum(q.get('r')) || 1,
            t: parseFiniteNum(q.get('t')),
          }
        : null;

    void (async () => {
      await auth.getAccessToken();
      const u = auth.getUser();
      lastUidRef.current = u ? u.id : null;
      if (startId) {
        await openSongById(startId, { params: initialParams });
      }
      const me = auth.getMe();
      if (me && !me.migratedLocalAt && lastUidRef.current && !migrationAttemptedRef.current[lastUidRef.current]) {
        migrationAttemptedRef.current[lastUidRef.current] = true;
        apiClient
          .runLocalMigration()
          .then((r) => {
            if (!r) return;
            if (r.status === 'done') {
              setSyncMsg({ text: t('practice.migratedCount', { count: r.created }), err: false });
              setSongsList(null);
            } else if (r.status === 'failed') {
              setSyncMsg({ text: r.message, err: true });
            }
          })
          .catch((err: any) => {
            setSyncMsg({ text: (err && err.message) || t('practice.migrateFailed'), err: true });
          });
      }
    })();

    // 50ms 재생·구간 반복 감시 타이머
    let lastBarUpdate = 0;
    let lastTick = Date.now();
    const loopInterval = window.setInterval(() => {
      const now = Date.now();
      const cur = stRef.current;
      if (playerRef.current && cur.ready && cur.playing) {
        unsavedSecRef.current += Math.min(2, (now - lastTick) / 1000);
        const t = safePlayerTime();
        if (cur.loopOn && cur.a != null && cur.b != null && now > seekGuardUntilRef.current && t >= cur.b) {
          jumpToLoopStart();
          cur.loops += 1;
          unsavedLoopsRef.current += 1;
          setLoops(cur.loops);
        }
        if (now - lastBarUpdate > 250 && !seekingRef.current) {
          lastBarUpdate = now;
          setCurrentTime(t);
        }
      }
      if (mrRef.current) {
        const sec = (now - recStartedAtRef.current) / 1000;
        if (sec >= REC_MAX_SEC) {
          stopRecordingNow();
        } else {
          setRecElapsedSec(sec);
        }
      }
      lastTick = now;
    }, 50);

    // 30초 자동 저장 타이머
    const autoSaveInterval = window.setInterval(() => {
      if (stRef.current.playing) {
        void saveProgressNow('auto');
      }
    }, AUTOSAVE_MS);

    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        void saveProgressNow('auto', { keepalive: true });
      }
    };
    const onPageHide = () => {
      void saveProgressNow('auto', { keepalive: true });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (mrRef.current || uploadingRef.current || (takeRef.current && !takeRef.current.done)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === 'Escape') {
        setLibOpen(false);
        setTakeLimitModalOpen(false);
        return;
      }
      const keyMap: Record<string, () => void> = {
        Space: handleTogglePlay,
        Digit1: () => handleSetRate(0.25),
        Digit2: () => handleSetRate(0.5),
        Digit3: () => handleSetRate(0.75),
        Digit4: () => handleSetRate(1),
        BracketLeft: () => handleSetPoint('a'),
        BracketRight: () => handleSetPoint('b'),
        KeyL: handleToggleLoop,
        KeyR: jumpToLoopStart,
        ArrowLeft: () => handleSkip(-5),
        ArrowRight: () => handleSkip(5),
        KeyS: () => void saveProgressNow('manual'),
        KeyM: handleToggleRec,
      };
      const fn = keyMap[e.code];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearInterval(loopInterval);
      window.clearInterval(autoSaveInterval);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('keydown', onKeyDown);
      stopRecordingNow();
      if (takeRef.current?.url) {
        try {
          URL.revokeObjectURL(takeRef.current.url);
        } catch {
          /* ignore */
        }
      }
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // 계정 전환 / 로그아웃 감지 (주니어 체크리스트 28·51행)
  useEffect(() => {
    if (activeUid === lastUidRef.current) return;
    lastUidRef.current = activeUid;
    songReqSeqRef.current++;
    songsListReqSeqRef.current++;
    stRef.current.song = null;
    setSong(null);
    setSongsList(null);
    setSongsErr('');
    if (takeRef.current && !takeRef.current.done) {
      const updated = { ...takeRef.current, song: null };
      takeRef.current = updated;
      setTakeState(updated);
    }
    if (recMetaRef.current) {
      recMetaRef.current.song = null;
    }
    if (activeUid && stRef.current.videoId) {
      const vid = stRef.current.videoId;
      const mySeq = ++songReqSeqRef.current;
      apiClient.songs
        .byVideo(vid)
        .then((fetched) => {
          if (mySeq !== songReqSeqRef.current || auth.getUser()?.id !== activeUid || stRef.current.videoId !== vid) {
            return;
          }
          stRef.current.song = fetched;
          setSong(fetched);
          setSyncMsg({ text: fetched ? t('practice.accountRecordLoaded') : t('practice.notInAccount'), err: false });
        })
        .catch((e: any) => {
          if (mySeq !== songReqSeqRef.current || auth.getUser()?.id !== activeUid || stRef.current.videoId !== vid) {
            return;
          }
          setSyncMsg({ text: (e && e.message) || t('practice.checkAccountRecordFailed'), err: true });
        });
    }
  }, [activeUid]);

  useEffect(() => {
    setCategories([]);
    setCatPopOpen(false);
    if (activeUid && apiClient.isLoggedIn()) {
      apiClient.categories
        .list()
        .then((cats) => {
          if (auth.getUser()?.id === activeUid) setCategories(cats);
        })
        .catch(() => {
          /* 분류 없이도 플레이어는 쓸 수 있다 */
        });
    }
    if (pendingCategoryRef.current === null) pendingCategoryRef.current = takeOpenCategory();
    const wanted = pendingCategoryRef.current;
    if (!wanted || !activeUid) return;
    pendingCategoryRef.current = '';
    setOpenFolders(new Set([wanted]));
    openDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUid]);

  // 곡이 바뀌면 분류 팝업은 닫는다
  useEffect(() => {
    setCatPopOpen(false);
  }, [song?.id]);

  useEffect(() => {
    if (!catPopOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (catWrapRef.current && !catWrapRef.current.contains(e.target as Node)) setCatPopOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatPopOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [catPopOpen]);

  // 진행 바 SVG 좌표 계산 (0 ~ 1000 천분율)
  const fillPermille = duration > 0 ? Math.max(0, Math.min(1000, Math.round((currentTime / duration) * 1000))) : 0;
  const hasLoopRange = duration > 0 && pointA != null && pointB != null && pointB > pointA;
  const loopXPermille = hasLoopRange ? Math.max(0, Math.min(1000, Math.round((pointA! / duration) * 1000))) : 0;
  const loopWPermille = hasLoopRange
    ? Math.max(0, Math.min(1000 - loopXPermille, Math.round(((pointB! - pointA!) / duration) * 1000)))
    : 0;

  const displayTitle = song
    ? song.title
    : videoId
      ? getVideoTitle() || t('practice.defaultTitle')
      : t('practice.defaultTitle');
  const displaySync = syncMsg.text || (song ? t('practice.accountConnected') : '');
  const hasBothPoints = pointA != null && pointB != null;
  const loopDurationText = hasBothPoints
    ? (loopOn && loops
        ? t('practice.loopSecWithLoops', { sec: (pointB! - pointA!).toFixed(1), loops })
        : t('practice.loopSec', { sec: (pointB! - pointA!).toFixed(1) }))
    : '';
  const saveBtnLabel = apiClient.isLoggedIn() && videoId && !song ? t('practice.btnAddSong') : t('practice.btnSave');

  // 분류가 하나라도 있으면 서랍을 분류 폴더로 묶는다. 한 곡이 여러 폴더에 나올 수 있고, 남는 곡은 "미분류"
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const songCategoryIds = song?.categoryIds || [];
  const folders =
    songsList && sortedCategories.length > 0
      ? (() => {
          const known = new Set(sortedCategories.map((c) => c.id));
          const out = sortedCategories.map((c) => ({
            id: c.id,
            name: c.name,
            songs: songsList.filter((x) => (x.categoryIds || []).includes(c.id)),
          }));
          const rest = songsList.filter((x) => !(x.categoryIds || []).some((id) => known.has(id)));
          if (rest.length > 0) out.push({ id: UNCATEGORIZED_FOLDER, name: t('practice.uncategorized'), songs: rest });
          return out;
        })()
      : null;
  const folderIds = folders ? folders.map((f) => f.id) : [];
  // 홈에서 고른 분류가 지워졌으면 전부 펼친다
  const effectiveOpen = openFolders && folderIds.some((id) => openFolders.has(id)) ? openFolders : null;

  const renderSongItem = (s: SongDto) => {
    const parts: string[] = [];
    if (s.status) parts.push(s.status);
    if (s.a != null && s.b != null) parts.push(`${formatPlayerTime(s.a)}–${formatPlayerTime(s.b)}`);
    if (s.rate) parts.push(`${s.rate}×`);
    if (s.lastDate) parts.push(s.lastDate.slice(5).replace('-', '/'));
    return (
      <li key={s.id}>
        <button
          type="button"
          className={styles.ppSongBtn}
          aria-current={s.videoId === videoId ? 'true' : undefined}
          onClick={() => {
            closeDrawer();
            void openSongById(s.videoId, { song: s });
          }}
        >
          <span className={`t ${styles.ppSongTitle}`}>{s.title}</span>
          <span className={`m ${styles.ppSongMeta}`}>{parts.join(' · ')}</span>
        </button>
      </li>
    );
  };

  const [importModalUrl, setImportModalUrl] = useState<string | null>(null);

  const handleUrlSubmit = (rawVal: string, clearFn: () => void) => (e: React.FormEvent) => {
    e.preventDefault();
    const plUrl = playlistUrlFrom(rawVal);
    if (plUrl) {
      clearFn();
      closeDrawer();
      setImportModalUrl(plUrl);
      return;
    }
    const id = videoIdFrom(rawVal);
    if (!id) {
      setSyncMsg({ text: t('practice.ytUrlReadFailed'), err: true });
      return;
    }
    clearFn();
    closeDrawer();
    void openSongById(id);
  };

  return (
    <AppShell variant="player" activeNav="play">
      <div className={`pp-wrap ${styles.playerWrap}`}>
        <header className={`pp-head ${styles.ppHead}`}>
          <div className={`pp-title ${styles.ppTitle}`}>
            <b id="songTitle">{displayTitle}</b>
            <span
              id="syncState"
              className={`pp-sync ${styles.ppSync} ${syncMsg.err ? `err ${styles.ppSyncErr}` : ''}`}
              aria-live="polite"
            >
              {displaySync}
            </span>
          </div>
          <div className={styles.ppHeadActions}>
            {song && (
              <div className={styles.ppCatWrap} ref={catWrapRef}>
                <button
                  type="button"
                  className="ghostBtn"
                  id="songCatBtn"
                  aria-expanded={catPopOpen}
                  aria-controls="songCatPop"
                  onClick={() => setCatPopOpen((v) => !v)}
                >
                  {songCategoryIds.length > 0 ? t('practice.categoryCount', { count: songCategoryIds.length }) : t('practice.categoryLabel')}
                </button>
                {catPopOpen && (
                  <div className={styles.ppCatPop} id="songCatPop" role="dialog" aria-label={t('practice.songCatPopTitle')}>
                    <p className={styles.ppCatPopTitle}>{t('practice.songCatPopTitle')}</p>
                    {sortedCategories.length === 0 ? (
                      <p className={`note ${styles.ppSongNote}`}>{t('practice.songCatEmpty')}</p>
                    ) : (
                      <ul className={styles.ppCatList}>
                        {sortedCategories.map((c) => (
                          <li key={c.id} data-category={c.id}>
                            <label className={styles.ppCatLabel} title={c.name}>
                              <input
                                type="checkbox"
                                checked={songCategoryIds.includes(c.id)}
                                disabled={catSaving}
                                onChange={() => void toggleSongCategory(c.id)}
                              />
                              <span className={styles.ppCatName}>{c.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className={`ghostBtn pp-lib-btn ${styles.ppLibBtn}`}
              id="libBtn"
              aria-expanded={libOpen}
              aria-controls="lib"
              onClick={() => (libOpen ? closeDrawer() : openDrawer())}
            >
              {t('practice.tabSongsList')}
            </button>
          </div>
        </header>

        <div className={`pp-main ${styles.ppMain}`}>
          <section className={`pp-stage ${styles.ppStage}`} data-align-group="sr-left:left">
            <div className={`pp-video ${styles.ppVideo}`} id="videoBox">
              <div className={styles.playerMount}>
                <div id="player" />
              </div>
              <div className={`pp-empty ${styles.ppEmpty}`} id="emptyState" hidden={Boolean(videoId)}>
                <p>
                  <b>{t('practice.pickVideoPrompt')}</b>
                </p>
                <p className="note">{t('practice.pickVideoSub')}</p>
                <form
                  className={`pp-url ${styles.ppUrlForm}`}
                  id="urlForm"
                  onSubmit={handleUrlSubmit(urlInput1, () => setUrlInput1(''))}
                >
                  <input
                    type="url"
                    id="urlInput"
                    className={styles.ppUrlInput}
                    placeholder="https://youtu.be/…"
                    inputMode="url"
                    autoComplete="off"
                    aria-label={t('practice.ariaYoutubeUrl')}
                    value={urlInput1}
                    onChange={(e) => setUrlInput1(e.target.value)}
                  />
                  <button className="pillBtn" type="submit">
                    {t('practice.btnOpen')}
                  </button>
                </form>
              </div>
            </div>

            <div className={`pp-seek ${styles.ppSeek}`} id="seekRow">
              <span className={`pp-time ${styles.ppTime}`} id="tNow">
                {formatPlayerTime(currentTime)}
              </span>
              <div className={`pp-bar ${styles.ppBar}`} id="bar" ref={barRef}>
                <svg
                  className={`pp-bar-svg ${styles.ppBarSvg}`}
                  viewBox="0 0 1000 44"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect className={`pp-bar-track ${styles.ppBarTrack}`} x={0} y={19} width={1000} height={6} rx={0} />
                  <rect
                    className={`pp-bar-loop ${styles.ppBarLoop}`}
                    id="barLoop"
                    x={loopXPermille}
                    y={14}
                    width={loopWPermille}
                    height={16}
                    rx={0}
                    {...(!hasLoopRange ? ({ hidden: true } as any) : {})}
                  />
                  <rect
                    className={`pp-bar-fill ${styles.ppBarFill}`}
                    id="barFill"
                    x={0}
                    y={19}
                    width={fillPermille}
                    height={6}
                    rx={0}
                  />
                </svg>
                {pointA != null && (
                  <div
                    id="barHandleA"
                    data-handle="a"
                    className={styles.barHandle}
                    ref={handleARef}
                    onMouseDown={(e) => handleDragStart('a', e)}
                    role="slider"
                    aria-label="A Handle"
                    aria-valuenow={pointA}
                  />
                )}
                {pointB != null && (
                  <div
                    id="barHandleB"
                    data-handle="b"
                    className={styles.barHandle}
                    ref={handleBRef}
                    onMouseDown={(e) => handleDragStart('b', e)}
                    role="slider"
                    aria-label="B Handle"
                    aria-valuenow={pointB}
                  />
                )}
                <input
                  type="range"
                  id="seek"
                  className={styles.ppBarRange}
                  min={0}
                  max={1000}
                  step={1}
                  value={fillPermille}
                  aria-label={t('practice.ariaSeekPosition')}
                  onChange={(e) => {
                    seekingRef.current = true;
                    const perm = Number(e.target.value);
                    const nextT = (perm / 1000) * (stRef.current.duration || 0);
                    setCurrentTime(nextT);
                  }}
                  onMouseUp={(e) => {
                    const perm = Number((e.target as HTMLInputElement).value);
                    const nextT = (perm / 1000) * (stRef.current.duration || 0);
                    if (playerRef.current && stRef.current.ready) {
                      seekGuardUntilRef.current = Date.now() + 400;
                      playerRef.current.seekTo?.(nextT, true);
                    }
                    seekingRef.current = false;
                  }}
                  onTouchEnd={(e) => {
                    const perm = Number((e.target as HTMLInputElement).value);
                    const nextT = (perm / 1000) * (stRef.current.duration || 0);
                    if (playerRef.current && stRef.current.ready) {
                      seekGuardUntilRef.current = Date.now() + 400;
                      playerRef.current.seekTo?.(nextT, true);
                    }
                    seekingRef.current = false;
                  }}
                />
              </div>
              <span className={`pp-time ${styles.ppTime}`} id="tDur">
                {formatPlayerTime(duration)}
              </span>
            </div>
          </section>

          <section className={`pp-ctl ${styles.ppCtl}`} aria-label={t('practice.ariaPracticeControls')}>
            <div className={`pp-group ${styles.ppGroup}`}>
              <div className={`pp-lab ${styles.ppLab}`}>{t('practice.labSpeed')}</div>
              <div className={`pp-seg ${styles.ppSeg}`} id="rates" role="group" aria-label={t('practice.ariaPlaySpeed')}>
                {RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={styles.ppSegBtn}
                    aria-pressed={Math.abs(r - rate) < 0.001}
                    disabled={!availRates.some((ar) => Math.abs(ar - r) < 0.001)}
                    onClick={() => handleSetRate(r)}
                  >
                    {r === 1 ? '1.0' : String(r)}
                  </button>
                ))}
              </div>
            </div>

            <div className={`pp-group ${styles.ppGroup}`}>
              <div className={`pp-lab ${styles.ppLab}`}>
                <span>{t('practice.secLoopLead')}</span>
                <span id="loopInfo" className={`pp-loopinfo ${styles.ppLoopInfo}`}>
                  {loopDurationText}
                </span>
              </div>
              <div className={`pp-ab ${styles.ppAb}`}>
                <div className={`pp-pt ${styles.ppPt}`}>
                  <button
                    type="button"
                    className={`pp-nudge ${styles.ppNudge}`}
                    data-pt="a"
                    data-d="-0.2"
                    aria-label={t('practice.ariaStepForwardA')}
                    onClick={() => handleNudge('a', -0.2)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={`pp-setpt ${styles.ppSetPt} ${pointA != null ? `set ${styles.ppSetPtActive}` : ''}`}
                    id="setA"
                    onClick={() => handleSetPoint('a')}
                  >
                    <small>{t('practice.pointStart')}</small>
                    <span id="aTime">{formatPlayerTime(pointA, true)}</span>
                  </button>
                  <button
                    type="button"
                    className={`pp-nudge ${styles.ppNudge}`}
                    data-pt="a"
                    data-d="0.2"
                    aria-label={t('practice.ariaStepBackA')}
                    onClick={() => handleNudge('a', 0.2)}
                  >
                    +
                  </button>
                </div>
                <div className={`pp-pt ${styles.ppPt}`}>
                  <button
                    type="button"
                    className={`pp-nudge ${styles.ppNudge}`}
                    data-pt="b"
                    data-d="-0.2"
                    aria-label={t('practice.ariaStepForwardB')}
                    onClick={() => handleNudge('b', -0.2)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={`pp-setpt ${styles.ppSetPt} ${pointB != null ? `set ${styles.ppSetPtActive}` : ''}`}
                    id="setB"
                    onClick={() => handleSetPoint('b')}
                  >
                    <small>{t('practice.pointEnd')}</small>
                    <span id="bTime">{formatPlayerTime(pointB, true)}</span>
                  </button>
                  <button
                    type="button"
                    className={`pp-nudge ${styles.ppNudge}`}
                    data-pt="b"
                    data-d="0.2"
                    aria-label={t('practice.ariaStepBackB')}
                    onClick={() => handleNudge('b', 0.2)}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className={`pp-looprow ${styles.ppLoopRow}`}>
                <button
                  type="button"
                  className={`pp-toggle ${styles.ppToggle}`}
                  id="loopBtn"
                  disabled={!hasBothPoints}
                  aria-pressed={loopOn}
                  onClick={handleToggleLoop}
                >
                  {loopOn ? t('practice.btnLooping') : t('practice.btnLoop')}
                </button>
                <div className={styles.waitWrap}>
                  <select
                    id="waitSelect"
                    className={styles.waitSelect}
                    value={waitLeadSec}
                    onChange={(e) => {
                      const sec = Number(e.target.value);
                      setWaitLeadSec(sec);
                      setWaitTimerOn(sec > 0);
                      stRef.current.waitLeadSec = sec;
                      stRef.current.waitTimerOn = sec > 0;
                      if (countdownTimerRef.current) {
                        window.clearInterval(countdownTimerRef.current);
                        countdownTimerRef.current = null;
                        setCountdownSec(null);
                      }
                    }}
                    aria-label={t('practice.secLoopLead')}
                  >
                    <option value={0}>{t('practice.waitLeadNone')}</option>
                    <option value={3}>{t('practice.waitLeadSec', { sec: 3 })}</option>
                    <option value={5}>{t('practice.waitLeadSec', { sec: 5 })}</option>
                    <option value={10}>{t('practice.waitLeadSec', { sec: 10 })}</option>
                  </select>
                  <button
                    type="button"
                    className={`pp-toggle ${styles.ppToggle} ${styles.btnWaitTimer}`}
                    id="btnWaitTimer"
                    aria-pressed={waitLeadSec > 0 || waitTimerOn}
                    aria-label={
                      countdownSec != null
                        ? `-${countdownSec}s`
                        : waitLeadSec > 0
                          ? t('practice.waitLeadSec', { sec: waitLeadSec })
                          : t('practice.waitLeadNone')
                    }
                    onClick={() => {
                      const next = waitLeadSec > 0 ? 0 : 3;
                      setWaitLeadSec(next);
                      setWaitTimerOn(next > 0);
                      stRef.current.waitLeadSec = next;
                      stRef.current.waitTimerOn = next > 0;
                      if (countdownTimerRef.current) {
                        window.clearInterval(countdownTimerRef.current);
                        countdownTimerRef.current = null;
                        setCountdownSec(null);
                      }
                    }}
                  >
                    {countdownSec != null
                      ? `-${countdownSec}s`
                      : waitLeadSec > 0
                        ? `${waitLeadSec}s`
                        : t('practice.waitTimer')}
                  </button>
                </div>
                <button
                  type="button"
                  className={`pp-icon ${styles.ppIcon}`}
                  id="clearBtn"
                  aria-label={t('practice.ariaClearLoop')}
                  onClick={handleClearLoop}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={`pp-group ${styles.ppGroup} ${styles.presetSection}`} id="presetSection">
              <div className={`pp-lab ${styles.ppLab}`}>
                <span>{t('practice.presetSelect')}</span>
                {selectedPresetId && (
                  <span className={styles.presetBadge}>
                    {presets.find((p) => p.id === selectedPresetId)?.completed ? '✓ ' : ''}
                    {formatPlayerTime(pointA)}–{formatPlayerTime(pointB)}
                  </span>
                )}
              </div>
              <div className={styles.presetCard}>
                <select
                  id="presetSelect"
                  className={styles.presetSelect}
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  aria-label={t('practice.presetSelect')}
                >
                  <option value="">{t('practice.presetSelect')}</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatPlayerTime(p.a)}–{formatPlayerTime(p.b)}){p.completed ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <div className={styles.presetActionRow}>
                  {selectedPresetId ? (
                    <>
                      <button
                        type="button"
                        id="btnUpdatePreset"
                        className={`ghostBtn ${styles.presetBtn}`}
                        disabled={pointA == null || pointB == null}
                        onClick={handleUpdatePreset}
                      >
                        {t('practice.presetUpdate')}
                      </button>
                      <button
                        type="button"
                        id="btnSavePreset"
                        className={`ghostBtn ${styles.presetBtn}`}
                        disabled={pointA == null || pointB == null}
                        onClick={handleSavePreset}
                      >
                        {t('practice.presetSave')}
                      </button>
                      <button
                        type="button"
                        id="btnDeletePreset"
                        className={`ghostBtn ${styles.presetDeleteBtn}`}
                        onClick={handleDeletePreset}
                        aria-label={t('practice.presetDeleteConfirm')}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      id="btnSavePreset"
                      className={`ghostBtn ${styles.presetBtn}`}
                      disabled={pointA == null || pointB == null}
                      onClick={handleSavePreset}
                    >
                      {t('practice.presetSave')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`pp-group ${styles.ppGroup}`}>
              <div className={`pp-lab ${styles.ppLab}`}>
                <span>{t('practice.secRecToday')}</span>
                <span
                  className={styles.ppDriveBadge}
                  id="recDriveBadge"
                  hidden={!activeUid || !isDrive}
                  title={t('practice.driveUnlimitedActive')}
                >
                  {t('practice.driveConnectedShort')}
                </span>
              </div>

              {/* RN-D3: Google Drive 미연결 시 기본 연결 유도 배너 */}
              <div
                className={`pp-drive-banner ${styles.ppDriveBanner}`}
                id="recDriveBanner"
                hidden={!activeUid || isDrive}
              >
                <span id="recDriveBannerText">
                  {t('practice.driveNotConnectedNotice')}
                </span>
                <button
                  type="button"
                  className={styles.ppDriveBtn}
                  id="btnRecDriveConnect"
                  disabled={busyDriveConnect}
                  onClick={handleConnectDriveFromPlayer}
                >
                  {t('practice.btnConnectDrive')}
                </button>
              </div>

              <div className={`pp-recrow ${styles.ppRecRow}`}>
                <button
                  type="button"
                  className={`pp-toggle pp-rec ${styles.ppToggle} ${styles.ppRecBtn}`}
                  id="recBtn"
                  aria-pressed={recording}
                  aria-label={recording ? t('practice.ariaStopRecUpload') : t('practice.ariaStartRec')}
                  disabled={!recording && (!videoId || uploadingTake)}
                  onClick={handleToggleRec}
                >
                  {recording ? `■ ${formatPlayerTime(recElapsedSec)}` : t('practice.btnStartRec')}
                </button>
                <button
                  type="button"
                  className={`pp-icon pp-recact ${styles.ppIcon} ${styles.ppRecAct}`}
                  id="recRetry"
                  hidden={!(take && !take.done && !uploadingTake && !recording)}
                  onClick={() => void uploadTakeNow()}
                >
                  {t('practice.btnReupload')}
                </button>
                <a
                  className={`pp-icon pp-recact ${styles.ppIcon} ${styles.ppRecAct}`}
                  id="recSave"
                  href={take && take.url.startsWith('blob:') ? take.url : undefined}
                  download={
                    take
                      ? sanitizeDownloadName(take.date, take.time, take.song?.title || displayTitle, take.mime)
                      : undefined
                  }
                  hidden={!take || recording}
                >
                  {t('practice.btnSaveFile')}
                </a>
              </div>
              <SafeAudio
                id="recPlay"
                className={styles.ppRecAudio}
                srcUrl={take ? take.url : null}
                preload="metadata"
                hidden={!take || recording}
              />
              <p
                className={`note pp-recmsg ${styles.ppRecMsg} ${recMsg.err ? `err ${styles.ppRecMsgErr}` : ''}`}
                id="recMsg"
                aria-live="polite"
              >
                {recMsg.text}
              </p>
            </div>

            <div className={`pp-transport ${styles.ppTransport}`}>
              <button
                type="button"
                className={`pp-tbtn ${styles.ppTbtn}`}
                id="backBtn"
                aria-label={t('practice.ariaRewind')}
                onClick={() => handleSkip(-5)}
              >
                −5
              </button>
              <button
                type="button"
                className={`pp-tbtn ${styles.ppTbtn}`}
                id="startBtn"
                aria-label={t('practice.ariaRestartSegment')}
                onClick={jumpToLoopStart}
              >
                ⏮
              </button>
              <button
                type="button"
                className={`pp-tbtn pp-play ${styles.ppTbtn} ${styles.ppPlayBtn}`}
                id="playBtn"
                aria-label={playing ? t('practice.ariaPause') : t('practice.ariaPlay')}
                onClick={handleTogglePlay}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className={`pp-tbtn ${styles.ppTbtn}`}
                id="fwdBtn"
                aria-label={t('practice.ariaForward')}
                onClick={() => handleSkip(5)}
              >
                +5
              </button>
              <button
                type="button"
                className={`pp-tbtn ${styles.ppTbtn} ${styles.ppSaveBtn} ${dirty ? `dirty ${styles.ppSaveDirty}` : ''}`}
                id="saveBtn"
                aria-label={t('practice.btnSave')}
                disabled={!videoId}
                onClick={() => void saveProgressNow('manual')}
              >
                {saveBtnLabel}
              </button>
            </div>
            <p className={`note pp-hint ${styles.ppHint}`} id="kbdHint">
              {t('practice.shortcutsHint')}
            </p>
          </section>
        </div>

        {Boolean(videoId) && (
          <section id="songRecord" className={styles.songRecord} aria-label={t('practice.ariaSongRecord')}>
            <SongRecordPanel
              songId={song?.id ?? null}
              loggedIn={Boolean(activeUid) && apiClient.isLoggedIn()}
              reloadKey={srReloadKey}
            />
          </section>
        )}
      </div>

      {/* 우측 곡 목록 서랍 */}
      <aside className={`pp-lib ${styles.ppLib}`} id="lib" hidden={!libOpen}>
        <div className={`pp-lib-head ${styles.ppLibHead}`}>
          <b>{t('practice.titleSongDrawer')}</b>
          <button
            type="button"
            className={`pp-icon ${styles.ppIcon}`}
            id="libClose"
            aria-label={t('practice.ariaClose')}
            onClick={closeDrawer}
          >
            ✕
          </button>
        </div>
        <form
          className={`pp-url ${styles.ppUrlForm}`}
          id="urlForm2"
          onSubmit={handleUrlSubmit(urlInput2, () => setUrlInput2(''))}
        >
          <input
            type="url"
            id="urlInput2"
            className={styles.ppUrlInput}
            placeholder={t('practice.phYoutubeUrlDrawer')}
            inputMode="url"
            autoComplete="off"
            aria-label={t('practice.ariaYoutubeUrl')}
            value={urlInput2}
            onChange={(e) => setUrlInput2(e.target.value)}
          />
          <button className="pillBtn" type="submit">
            {t('practice.btnOpen')}
          </button>
        </form>
        <ul className={`pp-songs ${styles.ppSongs}`} id="songs">
          {!apiClient.isLoggedIn() ? (
            <li className={`note ${styles.ppSongNote}`}>{t('practice.drawerLoginPrompt')}</li>
          ) : songsList === null ? (
            <li className={`note ${styles.ppSongNote}`}>{t('practice.loading')}</li>
          ) : songsErr ? (
            <li className={`note ${styles.ppSongNote}`}>{songsErr}</li>
          ) : songsList.length === 0 ? (
            <li className={`note ${styles.ppSongNote}`}>
              {t('practice.drawerEmptySongs')}
            </li>
          ) : folders ? (
            folders.map((f) => {
              const isOpen = !effectiveOpen || effectiveOpen.has(f.id);
              return (
                <li key={f.id} className={styles.ppFolder} data-folder={f.id}>
                  <button
                    type="button"
                    className={styles.ppFolderBtn}
                    aria-expanded={isOpen}
                    onClick={() => toggleFolder(f.id, folderIds)}
                  >
                    <span className={styles.ppFolderArrow} aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className={styles.ppFolderName}>{f.name}</span>
                    <span className={styles.ppFolderCount}>{f.songs.length}</span>
                  </button>
                  {isOpen && (
                    <ul className={`${styles.ppSongs} ${styles.ppFolderSongs}`}>
                      {f.songs.length === 0 ? (
                        <li className={`note ${styles.ppSongNote}`}>{t('practice.drawerEmptyCategory')}</li>
                      ) : (
                        f.songs.map(renderSongItem)
                      )}
                    </ul>
                  )}
                </li>
              );
            })
          ) : (
            songsList.map(renderSongItem)
          )}
        </ul>
      </aside>
      <div className={`pp-scrim ${styles.ppScrim}`} id="scrim" hidden={!libOpen} onClick={closeDrawer} />

      {/* 무료 녹음 곡 수 한도 초과 모달 (#takeLimitModal) */}
      <div
        className={`pp-modal-backdrop ${styles.modalBackdrop}`}
        id="takeLimitModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="takeLimitTitle"
        hidden={!takeLimitModalOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setTakeLimitModalOpen(false);
        }}
      >
        <div className={`pp-modal-card ${styles.modalCard}`}>
          <h2 className={styles.modalTitle} id="takeLimitTitle">
            {t('practice.limitModalTitle')}
          </h2>
          <p className={styles.modalDesc} id="takeLimitDesc">
            {t('practice.limitModalDesc', { takeLimitCount })}
          </p>
          <div className={`pp-modal-actions ${styles.modalActions}`}>
            <button
              type="button"
              className="pillBtn"
              id="btnTakeLimitConnectDrive"
              hidden={!authState.me?.limits?.drive}
              disabled={busyDriveConnect || uploadingTake}
              onClick={handleConnectDriveFromPlayer}
            >
              {t('practice.limitModalConnectDrive')}
            </button>
            <button
              type="button"
              className="ghostBtn"
              id="btnTakeLimitReplaceOld"
              disabled={busyDriveConnect || uploadingTake}
              onClick={() => {
                if (!window.confirm(t('practice.confirmReplaceServerTakes'))) return;
                void uploadTakeNow({ replaceOldSongTakes: true });
              }}
            >
              {t('practice.btnReplaceServerTakes')}
            </button>
            <button
              type="button"
              className="ghostBtn"
              id="btnTakeLimitClose"
              onClick={() => {
                setTakeLimitModalOpen(false);
                setRecMsg({
                  text: t('practice.uploadPendingFileSaveNotice'),
                  err: false,
                });
              }}
            >
              {t('practice.btnCancelSaveFile')}
            </button>
          </div>
        </div>
      </div>

      <PlaylistImportModal
        url={importModalUrl}
        me={authState.me}
        onClose={() => setImportModalUrl(null)}
        onImported={() => setSongsList(null)}
        onOnlyThis={(vid) => {
          void openSongById(vid);
        }}
      />
    </AppShell>
  );
}

export default PracticePage;
