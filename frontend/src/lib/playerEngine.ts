export interface PracticePlayerEngine {
  play(): void;
  pause(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  setLoopRange?(range: { a: number; b: number } | null): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  getVideoData?(): { title: string; author: string };
  cueVideoById?(options: { videoId: string; startSeconds?: number }): void;
  destroy(): void | Promise<void>;
}

export interface PracticePlayerEvents {
  ready?(duration: number): void;
  playing?(playing: boolean): void;
  position?(seconds: number): void;
  ended?(): void;
  error?(error: Error): void;
}
