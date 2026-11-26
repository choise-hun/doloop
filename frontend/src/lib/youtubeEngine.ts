import { createRemotePlayer, type RemotePlayer, type RemotePlayerEvents } from './ytBridge';
import type { PracticePlayerEngine } from './playerEngine';

export type YouTubePlayer = typeof window & {
  YT?: {
    Player: new (element: string, options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: RemotePlayerEvents;
    }) => RemotePlayer;
    PlayerState?: Record<'ENDED' | 'PLAYING' | 'PAUSED' | 'BUFFERING', number>;
  };
  onYouTubeIframeAPIReady?: () => void;
};

export function createYouTubeEngine(
  mountId: string,
  videoId: string,
  startSeconds: number,
  remote: boolean,
  events: RemotePlayerEvents,
): PracticePlayerEngine {
  const YT = (window as YouTubePlayer).YT;
  const options = { videoId, startSeconds, events };
  const createDirect = () => {
    if (!YT) throw new Error('YouTube API unavailable');
    return new YT.Player(mountId, {
      videoId,
      playerVars: {
        playsinline: 1, rel: 0, modestbranding: 1,
        start: Math.floor(startSeconds), origin: window.location.origin,
      },
      events,
    });
  };
  const player = remote ? createRemotePlayer(mountId, options) : createDirect();
  return {
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seekTo: (seconds, allowSeekAhead) => player.seekTo(seconds, allowSeekAhead),
    getCurrentTime: () => player.getCurrentTime(),
    getDuration: () => player.getDuration(),
    getVideoData: () => player.getVideoData(),
    getPlaybackRate: () => player.getPlaybackRate(),
    setPlaybackRate: (rate) => player.setPlaybackRate(rate),
    getAvailablePlaybackRates: () => player.getAvailablePlaybackRates(),
    cueVideoById: (cue) => player.cueVideoById(cue),
    destroy: () => player.destroy(),
  };
}
