// M1A-2 원격 YouTube 플레이어 어댑터(명세 §5.3).
// iOS 앱(capacitor://localhost)에서 직접 임베드는 오류 153이 나므로, 운영 https 페이지(player-embed.html) 안의
// 플레이어를 iframe으로 넣고 postMessage로 조작한다. PracticePage가 쓰는 YT.Player 메서드를 같은 이름·인자로 흉내 낸다.
import { Capacitor } from '@capacitor/core';

/** 원격 플레이어를 쓰는 플랫폼(승인 D4: iOS만). Android로 넓힐 때 이 배열만 바꾼다. */
export const REMOTE_PLAYER_PLATFORMS: readonly string[] = ['ios'];

const READY_TIMEOUT_MS = 15000;
const PLAYING = 1;

export interface RemotePlayerEvents {
  onReady?: () => void;
  onStateChange?: (e: { data: number }) => void;
  onPlaybackRateChange?: (e: { data: number }) => void;
  onError?: (e: { data: unknown }) => void;
}

export interface RemotePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { title: string; author: string };
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

function playerEmbedUrl(): URL | null {
  const raw = (window as { ULEVELP_CONFIG?: { playerEmbedUrl?: unknown } }).ULEVELP_CONFIG?.playerEmbedUrl;
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

let warnedMissingUrl = false;

export function shouldUseRemotePlayer(): boolean {
  if (!REMOTE_PLAYER_PLATFORMS.includes(Capacitor.getPlatform())) return false;
  if (playerEmbedUrl()) return true;
  if (!warnedMissingUrl) {
    warnedMissingUrl = true;
    console.warn('[ytBridge] playerEmbedUrl missing or not https; falling back to direct embed (iOS error 153 likely)');
  }
  return false;
}

const finiteOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const textOr = (v: unknown): string => (typeof v === 'string' ? v : '');
const ratesOr = (v: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(v)) return fallback;
  const valid = v.filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
  return valid.length ? valid : fallback;
};

export function createRemotePlayer(
  mountId: string,
  opts: { videoId: string; startSeconds?: number; events?: RemotePlayerEvents },
): RemotePlayer {
  const embedUrl = playerEmbedUrl();
  if (!embedUrl) throw new Error('playerEmbedUrl missing');
  const mount = document.getElementById(mountId);
  if (!mount) throw new Error(`#${mountId} not found`);
  const events = opts.events || {};
  const playerOrigin = embedUrl.origin;
  const initialVideoId = opts.videoId;

  const src = new URL(embedUrl.href);
  src.searchParams.set('v', opts.videoId);
  src.searchParams.set('start', String(Math.max(0, finiteOr(opts.startSeconds, 0))));
  src.searchParams.set('parent', window.location.origin);

  const iframe = document.createElement('iframe');
  iframe.id = mountId;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.src = src.href;

  let ready = false;
  let destroyed = false;
  let pendingCue: { videoId: string; startSeconds: number } | null = null;
  let time = 0;
  let timeAt = performance.now();
  let duration = 0;
  let state: number | null = null;
  let rate = 1;
  let rates: number[] = [1];
  let title = '';
  let author = '';

  const post = (cmd: string, value?: unknown) => {
    if (destroyed || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'cmd', cmd, value }, playerOrigin);
  };

  const setTime = (t: number) => {
    time = t;
    timeAt = performance.now();
  };

  const onMessage = (e: MessageEvent) => {
    if (destroyed || e.origin !== playerOrigin || e.source !== iframe.contentWindow) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'ready') {
      if (ready) return;
      ready = true;
      window.clearTimeout(timeoutId);
      duration = finiteOr(d.duration, 0);
      rates = ratesOr(d.rates, rates);
      title = textOr(d.title);
      author = textOr(d.author);
      events.onReady?.();
      const cue = pendingCue;
      pendingCue = null;
      if (cue && cue.videoId !== initialVideoId) {
        post('cue', cue);
        setTime(cue.startSeconds);
      }
    } else if (d.type === 'status') {
      if (!ready) return;
      setTime(finiteOr(d.time, time));
      duration = finiteOr(d.duration, duration);
      // 영상 전환(cue) 뒤 지원 배속이 바뀐다 — onStateChange(PLAYING)에서 PracticePage가 읽기 전에 반영
      rates = ratesOr(d.rates, rates);
      title = textOr(d.title);
      author = textOr(d.author);
      const nextState = finiteOr(d.state, state ?? -1);
      const nextRate = finiteOr(d.rate, rate);
      if (nextState !== state) {
        state = nextState;
        events.onStateChange?.({ data: nextState });
      }
      if (nextRate !== rate) {
        rate = nextRate;
        events.onPlaybackRateChange?.({ data: nextRate });
      }
    } else if (d.type === 'error') {
      events.onError?.({ data: d.code });
    }
  };

  window.addEventListener('message', onMessage);
  const timeoutId = window.setTimeout(() => {
    if (!ready && !destroyed) events.onError?.({ data: 'timeout' });
  }, READY_TIMEOUT_MS);
  mount.replaceWith(iframe);

  return {
    getCurrentTime() {
      if (state !== PLAYING) return time;
      const t = time + ((performance.now() - timeAt) / 1000) * rate;
      return duration > 0 ? Math.min(t, duration) : t;
    },
    getDuration: () => duration,
    getVideoData: () => ({ title, author }),
    getPlaybackRate: () => rate,
    getAvailablePlaybackRates: () => rates.slice(),
    getPlayerState: () => state ?? -1,
    setPlaybackRate(r: number) {
      if (ready && Number.isFinite(r)) post('rate', r);
    },
    seekTo(seconds: number) {
      if (!ready || !Number.isFinite(seconds)) return;
      post('seek', seconds);
      setTime(seconds);
    },
    playVideo() {
      if (ready) post('play');
    },
    pauseVideo() {
      if (ready) post('pause');
    },
    cueVideoById({ videoId, startSeconds }) {
      const cue = { videoId, startSeconds: Math.max(0, finiteOr(startSeconds, 0)) };
      if (!ready) {
        pendingCue = cue;
        return;
      }
      post('cue', cue);
      setTime(cue.startSeconds);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeoutId);
      if (iframe.isConnected) iframe.replaceWith(mount);
    },
  };
}
