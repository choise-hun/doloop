// frontend/src/lib/musicEngine.ts
// @ts-ignore
import rawCT from './engine/theory.mjs';
// @ts-ignore
import rawGE from './engine/voicing.mjs';

export type TuningId = 'g6' | 'g7' | 'b4' | 'b5' | 'b6';

export interface TuningDef {
  id: TuningId;
  name: string;
  kind: 'guitar' | 'bass';
  open: number[];
  frets: number;
}

export interface ScaleNoteMeta {
  pc: number;
  iv: number;
  deg: string;
  name: string;
}

export interface ScaleDef {
  id: string;
  name: string;
  iv: number[];
  deg: string[];
  rel: number;
}

export interface ScaleInfoResult {
  root: number;
  scale: ScaleDef;
  rootName: string;
  name: string;
  notes: ScaleNoteMeta[];
}

export interface BoardNote {
  s: number;
  f: number;
  pitch: number;
  deg: string;
  name: string;
  isRoot: boolean;
  isLowestRoot?: boolean;
}

export interface CagedBlock {
  blockId: number;
  shape: 'A' | 'G' | 'E' | 'D' | 'C';
  label: string;
  lo: number;
  hi: number;
  notes: BoardNote[];
}

export type DoubleStopIntervalId = '3rd' | '6th' | '4th';

export interface DoubleStopIntervalDef {
  id: DoubleStopIntervalId;
  name: string;
  degreeStep: number;
  minSemi: number;
  maxSemi: number;
  desc: string;
}

export interface DoubleStopPair {
  step: number;
  notes: [BoardNote, BoardNote];
  span: number;
  label: string;
  isRootPair: boolean;
}

export interface DoubleStopOptions {
  rootPc: number;
  scaleId: string;
  interval: DoubleStopIntervalId;
  pair?: [number, number] | null;
  open?: number[];
  lo?: number;
  hi?: number;
}

export interface AudioEngine {
  resume(): Promise<void>;
  now(): number;
  pluck(midi: number, when?: number, dur?: number): void;
  bassPluck(midi: number, when?: number, dur?: number): void;
  bass(midi: number, when?: number, dur?: number): void;
  chord(midis: number[], when?: number, dur?: number): void;
  doubleStop(midis: [number, number], when?: number, dur?: number, isBass?: boolean): void;
  click(when?: number, accent?: boolean): void;
}

const CT_MOD: any = rawCT;
const GE_MOD: any = rawGE;

export const CT = {
  OPEN: CT_MOD.OPEN as number[],
  NAMES: CT_MOD.NAMES as string[],
  pc: CT_MOD.pc as (n: number) => number,
  strName: CT_MOD.strName as (s: number) => string,
  Q4: CT_MOD.Q4 as Array<{ id: string; name: string; iv: number[]; deg: string[] }>,
  QBY: CT_MOD.QBY as Record<string, { id: string; name: string; iv: number[]; deg: string[] }>,
  SLOT_NAME: CT_MOD.SLOT_NAME as string[],
  SLOT_CLS: CT_MOD.SLOT_CLS as string[],
  DROPS: CT_MOD.DROPS as Array<{ id: string; name: string; drop: number[] }>,
  INV_NAME: CT_MOD.INV_NAME as string[],
  STRING_SETS: CT_MOD.STRING_SETS as number[][],
  setLabelHi: CT_MOD.setLabelHi as (set: number[]) => string,
  isAdjacent: CT_MOD.isAdjacent as (set: number[]) => boolean,
  dropStructure: CT_MOD.dropStructure,
  placeOn: CT_MOD.placeOn,
  atR0: CT_MOD.atR0,
  countPlayable: CT_MOD.countPlayable,
  playableSets: CT_MOD.playableSets,
  mutation: CT_MOD.mutation,
  ARP_Q: CT_MOD.ARP_Q as string[],
  arpeggio2nps: CT_MOD.arpeggio2nps,
  arpeggioAs: CT_MOD.arpeggioAs,
  FAM: CT_MOD.FAM,
  interpret: CT_MOD.interpret,
  transposeShape: CT_MOD.transposeShape,
  TOP_DEG: CT_MOD.TOP_DEG as Record<number, string>,
  TOP_Q: CT_MOD.TOP_Q as Record<number, string | null>,
  circleSteps: CT_MOD.circleSteps,
  topFret: CT_MOD.topFret,
  spanOf: CT_MOD.spanOf as (frets: number[]) => number,
  SCALES: CT_MOD.SCALES as ScaleDef[],
  SCALE_BY: CT_MOD.SCALE_BY as Record<string, ScaleDef>,
  TUNINGS: CT_MOD.TUNINGS as TuningDef[],
  TUNING_BY: CT_MOD.TUNING_BY as Record<TuningId, TuningDef>,
  CIRCLE5: CT_MOD.CIRCLE5 as number[],
  scaleInfo: CT_MOD.scaleInfo as (rootPc: number, scaleId: string) => ScaleInfoResult,
  scaleOnBoard: CT_MOD.scaleOnBoard as (
    rootPc: number,
    scaleId: string,
    open: number[],
    lo: number,
    hi: number
  ) => BoardNote[],
  scaleCircle: CT_MOD.scaleCircle,
  CAGED_FORMS: CT_MOD.CAGED_FORMS as Array<{
    blockId: number;
    shape: 'A' | 'G' | 'E' | 'D' | 'C';
    label: string;
    loOff: number;
    hiOff: number;
  }>,
  scaleBlocks: CT_MOD.scaleBlocks as (
    rootPc: number,
    scaleId: string,
    open?: number[],
    maxFret?: number
  ) => CagedBlock[],
  scaleBlockSeq: CT_MOD.scaleBlockSeq as (blockNotes: BoardNote[]) => BoardNote[],
  DOUBLE_STOP_INTERVALS: CT_MOD.DOUBLE_STOP_INTERVALS as DoubleStopIntervalDef[],
  doubleStops: CT_MOD.doubleStops as (opts: DoubleStopOptions) => DoubleStopPair[],
};

export const GE = {
  OPEN: GE_MOD.OPEN as number[],
  STR_LABEL: GE_MOD.STR_LABEL as string[],
  NAMES: GE_MOD.NAMES as string[],
  DEG: GE_MOD.DEG as Record<string, [number, string]>,
  CH: GE_MOD.CH as Record<string, string[]>,
  DOMS: GE_MOD.DOMS as string[],
  pc: GE_MOD.pc as (n: number) => number,
  chordTones: GE_MOD.chordTones,
  chordName: GE_MOD.chordName as (root: number, q: string) => string,
  pentPcs: GE_MOD.pentPcs as (root: number, type: 'min' | 'maj') => number[],
  genVoicings: GE_MOD.genVoicings,
  trans: GE_MOD.trans,
  search251: GE_MOD.search251,
  topNoteDominants: GE_MOD.topNoteDominants,
  fretStr: GE_MOD.fretStr as (v: { frets: number[] }) => string,
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudioEngine(ctxProvider?: () => any): AudioEngine {
  let ctx: any = null;

  function ensureContext(): any {
    if (ctx) return ctx;
    if (typeof ctxProvider === 'function') {
      ctx = ctxProvider();
      return ctx;
    }
    if (typeof window !== 'undefined') {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) ctx = new AC();
    }
    return ctx;
  }

  async function resume(): Promise<void> {
    const c = ensureContext();
    if (c && c.state === 'suspended' && typeof c.resume === 'function') {
      await c.resume();
    }
  }

  function now(): number {
    const c = ensureContext();
    return c && typeof c.currentTime === 'number' ? c.currentTime : 0;
  }

  function pluck(midi: number, when?: number, dur = 0.85): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    const f = midiToFreq(midi);
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(f, t0);
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2, t0);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.18, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(c.destination);
    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + dur + 0.02);
    o2.stop(t0 + dur + 0.02);
  }

  function bassPluck(midi: number, when?: number, dur = 1.05): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    const f = midiToFreq(midi);
    const oFund = c.createOscillator();
    const oHarm = c.createOscillator();
    const gHarm = c.createGain();
    const gMain = c.createGain();

    oFund.type = 'triangle';
    oFund.frequency.setValueAtTime(f, t0);
    oHarm.type = 'sine';
    oHarm.frequency.setValueAtTime(f * 2, t0);
    gHarm.gain.setValueAtTime(0.28, t0);

    gMain.gain.setValueAtTime(0.0001, t0);
    gMain.gain.exponentialRampToValueAtTime(0.32, t0 + 0.012);
    gMain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    oFund.connect(gMain);
    oHarm.connect(gHarm);
    gHarm.connect(gMain);
    gMain.connect(c.destination);

    oFund.start(t0);
    oHarm.start(t0);
    oFund.stop(t0 + dur + 0.02);
    oHarm.stop(t0 + dur + 0.02);
  }

  function bass(midi: number, when?: number, dur = 0.9): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    const f = midiToFreq(midi);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.42, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function chord(midis: number[], when?: number, dur = 1.4): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    midis
      .slice()
      .sort((a, b) => a - b)
      .forEach((m, i) => pluck(m, t0 + i * 0.035, dur));
  }

  function doubleStop(midis: [number, number], when?: number, dur = 1.1, isBass = false): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    const fn = isBass ? bassPluck : pluck;
    fn(midis[0], t0, dur);
    fn(midis[1], t0, dur);
  }

  function click(when?: number, accent = false): void {
    const c = ensureContext();
    if (!c) return;
    const t0 = typeof when === 'number' ? when : c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(accent ? 1760 : 1180, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(accent ? 0.12 : 0.06, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + 0.07);
  }

  return {
    resume,
    now,
    pluck,
    bassPluck,
    bass,
    chord,
    doubleStop,
    click,
  };
}

export const audioEngine = createAudioEngine();
