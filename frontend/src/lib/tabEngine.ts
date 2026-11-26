import type * as AlphaTab from '@coderline/alphatab';
import type { PracticePlayerEngine, PracticePlayerEvents } from './playerEngine';

const ASSET_ROOT = '/at/';
const TAB_RATES = [0.25, 0.5, 0.75, 1];
const TIMEOUT = 30_000;
type Api = AlphaTab.AlphaTabApi;
type Track = AlphaTab.model.Track;
type Beat = AlphaTab.model.Beat;
type MasterBar = AlphaTab.model.MasterBar;

export class TabPlaybackError extends Error {
  constructor(readonly kind: 'parse' | 'reload' | 'audio') { super(kind); }
}

type RenderSlot = {
  score: boolean;
  rendered: boolean;
  midi: boolean;
  midiPending: number;
  player: boolean;
  pending: number;
  finish(error?: Error): void;
};

type TrackState = { name: string; mute: boolean; solo: boolean; volume: number };
export type TabViewState = { tracks: TrackState[]; selected: number; staff: boolean; metronome: boolean };

let teardown: Promise<void> = Promise.resolve();

export class TabEngine implements PracticePlayerEngine {
  static async open(host: HTMLElement, scroll: HTMLElement, signal: AbortSignal) {
    await teardown;
    const url = ASSET_ROOT + 'alphaTab.mjs';
    const alpha: typeof AlphaTab = await import(/* @vite-ignore */ url);
    await teardown;
    signal.throwIfAborted();
    return new TabEngine(alpha, host, scroll);
  }

  private api: Api;
  private busy: Promise<unknown> = Promise.resolve();
  private slot: RenderSlot | null = null;
  private disposed = false;
  private quarantined = false;
  private soundFont = false;
  private playing = false;
  private subscribes: (() => void)[];
  private events: (PracticePlayerEvents & { range(a: number, b: number): void }) | null = null;
  private mouseDown: Beat | null = null;
  private dragged = false;
  private duration = 0;
  private view: TabViewState = { tracks: [], selected: 0, staff: false, metronome: false };

  private constructor(alpha: typeof AlphaTab, host: HTMLElement, scroll: HTMLElement) {
    this.api = new alpha.AlphaTabApi(host, {
      core: { fontDirectory: ASSET_ROOT + 'font/', engine: 'html5', enableLazyLoading: true, useWorkers: true },
      display: { staveProfile: 'Tab' },
      player: {
        playerMode: 'EnabledSynthesizer', outputMode: 'WebAudioAudioWorklets',
        soundFont: ASSET_ROOT + 'soundfont/sonivox.sf2', scrollElement: scroll, scrollOffsetY: -12,
        enableSeekToClick: false, enablePlaybackRangeSelection: false,
      },
    });
    const api = this.api;
    this.subscribes = [
      api.scoreLoaded.on((score) => {
        if (!this.slot) return;
        this.slot.score = true;
        const track = score.tracks[0];
        if (!this.supportsTab(track)) {
          track?.staves.forEach((staff) => { staff.showStandardNotation = true; });
          api.settings.display.staveProfile = alpha.StaveProfile.Score;
        } else {
          track?.staves.forEach((staff) => {
            if (!staff.isPercussion && staff.stringTuning.tunings.length > 0) staff.showTablature = true;
          });
        }
      }),
      api.renderer.preRender.on(() => {
        if (this.slot && this.slot.score) this.slot.pending++;
      }),
      api.postRenderFinished.on(() => {
        if (!this.slot?.pending) return;
        this.slot.pending--;
        this.slot.rendered = true;
        this.complete();
      }),
      api.midiLoad.on(() => {
        if (this.slot?.score) this.slot.midiPending++;
      }),
      api.midiLoaded.on((position) => {
        if (!this.slot?.midiPending) return;
        this.slot.midiPending--;
        this.duration = position.endTime * api.playbackSpeed / 1000;
        this.slot.midi = true;
        // AlphaSynth can announce readiness before notifying this MIDI event
        // when the shared SoundFont is already loaded.
        this.slot.player = api.isReadyForPlayback;
        this.complete();
      }),
      api.soundFontLoaded.on(() => { this.soundFont = true; }),
      api.playerReady.on(() => {
        if (!this.slot?.midi) return;
        this.slot.player = true;
        this.complete();
      }),
      api.error.on(() => {
        if (this.slot) {
          // With no score, the synchronous byte importer has ended. Later failures can
          // still leave render or synth messages in flight, so retire that engine.
          const kind = !this.slot.score ? 'parse' : this.soundFont ? 'reload' : 'audio';
          if (this.slot.score) this.quarantined = true;
          this.slot.finish(new TabPlaybackError(kind));
        } else {
          this.quarantined = true;
          this.events?.error?.(new TabPlaybackError(this.soundFont ? 'reload' : 'audio'));
          this.deactivate();
        }
      }),
      api.playerStateChanged.on(({ state }) => {
        this.playing = state === 1;
        this.events?.playing?.(this.playing);
      }),
      api.playerPositionChanged.on(({ currentTime }) => {
        const seconds = currentTime * api.playbackSpeed / 1000;
        if (!this.playing) this.events?.position?.(seconds);
      }),
      api.playerFinished.on(() => this.events?.ended?.()),
      api.beatMouseDown.on((beat) => { this.mouseDown = beat; this.dragged = false; }),
      api.beatMouseMove.on((beat) => { if (this.mouseDown && beat !== this.mouseDown) this.dragged = true; }),
      api.beatMouseUp.on((beat) => this.selectBeat(beat)),
    ];
  }

  private complete() {
    const slot = this.slot;
    if (slot?.score && slot.rendered && !slot.pending && slot.midi && !slot.midiPending && slot.player) slot.finish();
  }

  private serialize<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const task = this.busy.then(() => {
      signal.throwIfAborted();
      if (this.disposed || this.quarantined) throw new TabPlaybackError('reload');
      return work();
    });
    this.busy = task.catch(() => undefined);
    return task;
  }

  private waitForRender(start: () => boolean, rerender = false) {
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.quarantined = true;
        this.slot?.finish(new TabPlaybackError('reload'));
      }, TIMEOUT);
      this.slot = {
        score: rerender, midi: rerender, player: rerender, rendered: false, pending: 0, midiPending: 0,
        finish: (error) => {
          clearTimeout(timer);
          this.slot = null;
          if (error) reject(error);
          else resolve();
        },
      };
      try {
        if (!start()) this.slot?.finish(new TabPlaybackError('parse'));
      } catch {
        this.quarantined = true;
        this.slot?.finish(new TabPlaybackError('reload'));
      }
    });
  }

  private supportsTab(track?: Track): boolean {
    return Boolean(track?.staves.some((staff) => !staff.isPercussion && staff.stringTuning.tunings.length > 0));
  }

  load(bytes: ArrayBuffer, signal: AbortSignal): Promise<TabViewState> {
    this.deactivate();
    return this.serialize(signal, async () => {
      const api = this.api;
      api.stop();
      api.playbackSpeed = 1;
      api.metronomeVolume = 0;
      api.isLooping = false;
      api.playbackRange = null;
      api.settings.display.staveProfile = 3;
      api.updateSettings();
      await this.waitForRender(() => api.load(bytes));
      signal.throwIfAborted();
      const tracks = (api.score?.tracks ?? []).map((track) => ({
        name: track.name, mute: false, solo: false, volume: 100,
      }));
      this.view = { tracks, staff: !this.supportsTab(api.score?.tracks[0]), selected: 0, metronome: false };
      this.mixTracks();
      return this.view;
    });
  }

  activate(events: NonNullable<TabEngine['events']>) { this.events = events; }
  deactivate() {
    this.events = null;
    this.mouseDown = null;
    if (!this.disposed) this.api.pause();
    this.playing = false;
  }

  async displayTrack(index: number, staff: boolean, signal: AbortSignal): Promise<TabViewState> {
    return this.serialize(signal, async () => {
      const track = this.api.score?.tracks[index];
      if (!track) return this.view;
      const showStaff = staff || !this.supportsTab(track);
      if (showStaff) {
        track.staves.forEach((s) => { s.showStandardNotation = true; });
      } else {
        track.staves.forEach((s) => {
          if (!s.isPercussion && s.stringTuning.tunings.length > 0) s.showTablature = true;
        });
      }
      await this.waitForRender(() => {
        this.api.settings.display.staveProfile = showStaff ? 2 : 3;
        this.api.updateSettings();
        this.api.renderTracks([track]);
        return true;
      }, true);
      signal.throwIfAborted();
      this.view = { ...this.view, selected: index, staff: showStaff };
      return this.view;
    });
  }

  updateTrack(index: number, update: Partial<Omit<TrackState, 'name'>>): TabViewState {
    this.view = { ...this.view, tracks: this.view.tracks.map((entry, i) => i === index ? { ...entry, ...update } : entry) };
    this.mixTracks();
    return this.view;
  }

  private mixTracks() {
    const soloed = this.view.tracks.some((track) => track.solo);
    this.api.score?.tracks.forEach((track, index) => {
      const state = this.view.tracks[index];
      this.api.changeTrackSolo([track], false);
      this.api.changeTrackMute([track], state.mute || (soloed && !state.solo));
      this.api.changeTrackVolume([track], state.volume / 100);
    });
  }

  toggleMetronome(): TabViewState {
    this.view = { ...this.view, metronome: !this.view.metronome };
    this.api.metronomeVolume = this.view.metronome ? 1 : 0;
    return this.view;
  }

  private barAt(bar: MasterBar, after: number) {
    const bars = this.api.tickCache?.masterBars;
    if (!bars) return undefined;
    return bars.find((entry) => entry.masterBar === bar && entry.end > after)
      ?? bars.find((entry) => entry.masterBar === bar);
  }

  private tickSeconds(tick: number): number {
    let ms = 0;
    let previous = 0;
    let tempo = 120;
    for (const bar of this.api.tickCache?.masterBars ?? []) {
      for (const change of bar.tempoChanges) {
        if (change.tick > tick) return (ms + (tick - previous) * 60_000 / (tempo * 960)) / 1000;
        ms += (change.tick - previous) * 60_000 / (tempo * 960);
        previous = change.tick;
        tempo = change.tempo;
      }
    }
    return (ms + (tick - previous) * 60_000 / (tempo * 960)) / 1000;
  }

  private selectBeat(end: Beat | null) {
    const start = this.mouseDown;
    this.mouseDown = null;
    if (!this.events || this.slot || !start || !end) return;
    const first = start.voice.bar.masterBar;
    const last = end.voice.bar.masterBar;
    const current = this.api.tickPosition;
    if (!this.dragged && start === end) {
      const bar = this.barAt(first, current);
      const span = this.api.tickCache?.getRelativeBeatPlaybackRange(start);
      if (bar) this.seekTo(this.tickSeconds(bar.start + (span?.startTick ?? start.playbackStart)));
      return;
    }
    const low = first.index <= last.index ? first : last;
    const high = first.index <= last.index ? last : first;
    const from = this.barAt(low, current);
    const to = this.barAt(high, from?.start ?? current);
    if (from && to && to.end > from.start) {
      this.events.range(this.tickSeconds(from.start), Math.min(this.duration, this.tickSeconds(to.end)));
    }
  }

  setLoopRange(range: { a: number; b: number } | null) {
    const cache = this.api.tickCache;
    if (!this.events || !cache || !range || range.a < 0 || range.b <= range.a || range.b > this.duration) {
      this.api.clearPlaybackRangeHighlight();
      return;
    }
    const endTick = cache.masterBars.at(-1)?.end ?? 0;
    const tickAt = (seconds: number) => {
      let low = 0, high = endTick;
      while (low < high) {
        const middle = Math.floor((low + high + 1) / 2);
        if (this.tickSeconds(middle) <= seconds) low = middle;
        else high = middle - 1;
      }
      return low;
    };
    const tracks = new Set([this.view.selected]);
    const start = cache.findBeat(tracks, tickAt(range.a))?.beat;
    const end = cache.findBeat(tracks, Math.max(0, tickAt(range.b) - 1))?.beat;
    if (start && end) this.api.highlightPlaybackRange(start, end);
    else this.api.clearPlaybackRangeHighlight();
  }

  play() { if (this.events && !this.slot) this.api.play(); }
  pause() { if (!this.disposed) this.api.pause(); }
  seekTo(seconds: number) {
    if (this.events) this.api.timePosition = Math.max(0, Math.min(this.duration, seconds)) * 1000 / this.api.playbackSpeed;
  }
  getCurrentTime() { return this.api.timePosition * this.api.playbackSpeed / 1000; }
  getDuration() { return this.duration; }
  getPlaybackRate() { return this.api.playbackSpeed; }
  setPlaybackRate(rate: number) { this.api.playbackSpeed = rate; }
  getAvailablePlaybackRates() { return TAB_RATES; }

  destroy(): Promise<void> {
    if (this.disposed) return teardown;
    this.deactivate();
    this.disposed = true;
    this.slot?.finish(new DOMException('Disposed TAB engine', 'AbortError'));
    this.subscribes.splice(0).forEach((off) => off());
    let context: AudioContext | undefined;
    try {
      // The proxy exposes the output as soon as the player exists, before MIDI readiness.
      context = (this.api.player?.output as { context?: AudioContext } | undefined)?.context;
    } catch {
      // At this point alphaTab has not assigned a synth output.
    }
    this.api.destroy();
    teardown = !context || context.state === 'closed' ? Promise.resolve() : new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        context.removeEventListener('statechange', onState);
        reject(new TabPlaybackError('reload'));
      }, TIMEOUT);
      function onState() {
        if (context?.state !== 'closed') return;
        clearTimeout(timer);
        context.removeEventListener('statechange', onState);
        resolve();
      }
      context.addEventListener('statechange', onState);
      onState();
    });
    return teardown;
  }
}
