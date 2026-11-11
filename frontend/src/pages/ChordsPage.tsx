// frontend/src/pages/ChordsPage.tsx
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t, type I18nKey } from '../lib/i18n.mts';
import { AppShell } from '../components/layout/AppShell';
import {
  audioEngine,
  BoardNote,
  CT,
  DoubleStopIntervalId,
  GE,
  TuningId,
} from '../lib/musicEngine';
import {
  buildCtxNotes,
  ChordBoxSvg,
  ChordNeckSvg,
  CircleWheelSvg,
  DiagramNote,
  dotClassOf,
  FretboardSvg,
  fretText,
  geNotesToDiagram,
  geTones,
  getDoubleStopPairs,
  getSafeDoubleStopPair,
  NeckSvg,
  KeyboardDiagramSvg,
  pitchesOf,
  q4Tones,
  ScaleWheelSvg,
} from '../components/chords/ChordDiagrams';
import { ProgressionPlayTab } from '../components/chords/ProgressionPlayTab';
import { isProgHash } from '../components/progressions/model.mts';
import { REINT_PRESETS, DEFAULT_REINT_PRESET_ID } from '../lib/chords/reintPresets.mts';
import styles from './ChordsPage.module.css';

export type ChordTabId = 'scale' | 'tone' | 'matrix' | 'circle' | 'reint' | 'tf' | 'ds' | 'prog';

export const CHORD_TABS: ReadonlyArray<{ id: ChordTabId; labelKey: I18nKey }> = [
  { id: 'scale', labelKey: 'chords.tabScale' },
  { id: 'tone', labelKey: 'chords.tabTone' },
  { id: 'matrix', labelKey: 'chords.tabMatrix' },
  { id: 'circle', labelKey: 'chords.tabCircle' },
  { id: 'reint', labelKey: 'chords.tabReint' },
  { id: 'tf', labelKey: 'chords.tabTf' },
  { id: 'ds', labelKey: 'chords.tabDs' },
  { id: 'prog', labelKey: 'chords.tabProg' },
];

const TUNING_NAME_KEY: Record<TuningId, I18nKey> = {
  g6: 'chords.tuningGuitarSix',
  g7: 'chords.tuningGuitarSeven',
  b4: 'chords.tuningBassFour',
  b5: 'chords.tuningBassFive',
  b6: 'chords.tuningBassSix',
};
const INSTRUMENT_NAME_KEY = {
  guitar: 'chords.instrumentGuitar', bass: 'chords.instrumentBass', keyboard: 'chords.instrumentKeyboard',
} as const;

const INV_NAME_KEYS: readonly I18nKey[] = [
  'chords.invRoot',
  'chords.invFirst',
  'chords.invSecond',
  'chords.invThird',
];

const SLOT_NAME_KEYS: readonly I18nKey[] = [
  'chords.slotRoot',
  'chords.slotThird',
  'chords.slotFifth',
  'chords.slotSeventh',
];

const FAM_LABEL_KEY: Record<string, I18nKey> = {
  maj: 'chords.famMaj',
  min: 'chords.famMin',
  dom: 'chords.famDom',
  sus: 'chords.famSus',
  hd: 'chords.famHd',
  dim: 'chords.famDim',
};

const ROLE_KEY: Record<string, I18nKey> = {
  '경과': 'chords.rolePassing', // i18n-keep: 엔진 role 매핑 키(D8)
  'IV (리디안)': 'chords.roleLydianFourth', // i18n-keep: 엔진 role 매핑 키(D8)
};

const DS_NAME_KEY: Record<DoubleStopIntervalId, I18nKey> = {
  '3rd': 'chords.dsNameThird',
  '6th': 'chords.dsNameSixth',
  '4th': 'chords.dsNameFourth',
};

const DS_DESC_KEY: Record<DoubleStopIntervalId, I18nKey> = {
  '3rd': 'chords.dsDescThird',
  '6th': 'chords.dsDescSixth',
  '4th': 'chords.dsDescFourth',
};

// "#matrix" → 'matrix', "#prog?c=…" → 'prog' (CH-5b), 그 밖은 null
function tabFromHash(hash: string): ChordTabId | null {
  if (isProgHash(hash)) return 'prog';
  const h = hash.replace(/^#/, '');
  return CHORD_TABS.some((t) => t.id === h) ? (h as ChordTabId) : null;
}

export const CAGED_BLOCK_CHIPS: ReadonlyArray<{ v: number; labelKey: I18nKey }> = [
  { v: 1, labelKey: 'chords.cagedShapeOne' },
  { v: 2, labelKey: 'chords.cagedShapeTwo' },
  { v: 3, labelKey: 'chords.cagedShapeThree' },
  { v: 4, labelKey: 'chords.cagedShapeFour' },
  { v: 5, labelKey: 'chords.cagedShapeFive' },
  { v: 0, labelKey: 'chords.cagedShapeFull' },
];

export const DOUBLE_STOP_SCALES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'major', name: 'Major (Ionian)' },
  { id: 'minor', name: 'Natural Minor (Aeolian)' },
  { id: 'dorian', name: 'Dorian' },
  { id: 'mixolydian', name: 'Mixolydian' },
  { id: 'pentMaj', name: 'Pentatonic Major' },
  { id: 'pentMin', name: 'Pentatonic Minor' },
];

export function isCagedUnsupportedScale(scaleId: string): boolean {
  return scaleId === 'harmMinor' || scaleId === 'melMinor';
}

const START_PAT: ReadonlyArray<{ v: number; labelKey: I18nKey }> = [
  { v: 0, labelKey: 'chords.scaleStartRoot' },
  { v: 1, labelKey: 'chords.scaleStartThird' },
  { v: 2, labelKey: 'chords.scaleStartFifth' },
  { v: 3, labelKey: 'chords.scaleStartSeventh' },
];

const RULE: Record<string, I18nKey> = {
  maj7: 'chords.mxFamilyMajSeven',
  '7': 'chords.mxFamilySeven',
  m7: 'chords.mxFamilyMseven',
  m7b5: 'chords.mxFamilyMsevenBfive',
  dim7: 'chords.mxFamilyDimSeven',
};

const ROMAN: Record<'major' | 'minor', string[]> = {
  major: ['ii', 'V', 'I'],
  minor: ['iiø', 'V', 'i'],
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function ChordsPage(): React.ReactElement {
  useEffect(() => {
    document.title = '악기 연습실'; // i18n-keep: RZ3-4 소스 문자열 단언
  }, []);

  // 초기 탭 결정
  const [instrumentKind, setInstrumentKind] = useState<'guitar' | 'bass' | 'keyboard'>('guitar');
  const [storedTab, setActiveTab] = useState<ChordTabId>(() => {
    if (typeof window !== 'undefined') {
      const fromHash = tabFromHash(window.location.hash);
      if (fromHash) return fromHash;
      try {
        const s = localStorage.getItem('ulp:tab');
        if (s && CHORD_TABS.some((t) => t.id === s)) return s as ChordTabId;
      } catch {
        /* ignore */
      }
    }
    return 'scale';
  });
  const supportedTabs: readonly ChordTabId[] = instrumentKind === 'bass' ? ['scale', 'tone']
    : instrumentKind === 'keyboard' ? ['scale', 'tone', 'reint', 'tf', 'prog'] : CHORD_TABS.map((tab) => tab.id);
  const activeTab = supportedTabs.includes(storedTab) ? storedTab : 'scale';
  const isKeyboard = instrumentKind === 'keyboard';
  const [guitarTuning, setGuitarTuning] = useState<TuningId>('g6');
  const [bassTuning, setBassTuning] = useState<TuningId>('b4');
  const selectedTuning = instrumentKind === 'bass' ? bassTuning : guitarTuning;
  const availableTunings = CT.TUNINGS.filter((tuning) => tuning.kind === instrumentKind);

  function changeInstrument(next: typeof instrumentKind) {
    stopAllTransports();
    const tabs: readonly ChordTabId[] = next === 'bass' ? ['scale', 'tone']
      : next === 'keyboard' ? ['scale', 'tone', 'reint', 'tf', 'prog'] : CHORD_TABS.map((tab) => tab.id);
    const tab = tabs.includes(activeTab) ? activeTab : 'scale';
    setInstrumentKind(next);
    setDsInst(guitarTuning);
    setDsPair(getSafeDoubleStopPair(CT.TUNING_BY[guitarTuning].open.length, dsInterval, dsPair));
    setActiveTab(tab);
    setScPos(0);
    setScCi(0);
    setScMode('simple');
    setScZoom(CT.TUNING_BY[next === 'bass' ? bassTuning : guitarTuning].frets - 12);
    window.location.hash = tab === 'prog' && progHash ? progHash : `#${tab}`;
  }

  function changeTuning(id: TuningId) {
    const tuning = CT.TUNING_BY[id];
    if (!tuning) return;
    if (tuning.kind !== instrumentKind) { changeInstrument(tuning.kind); }
    stopAllTransports();
    if (tuning.kind === 'bass') setBassTuning(id); else setGuitarTuning(id);
    setDsInst(id);
    setDsPair(getSafeDoubleStopPair(tuning.open.length, dsInterval, dsPair));
    setScZoom(tuning.frets - 12);
    setScPos(0);
  }

  function playInstrumentChord(midis: number[], when?: number, dur = 1.4) {
    if (isKeyboard) midis.forEach((midi) => audioEngine.keyboard(midi, when, dur));
    else audioEngine.chord(midis, when, dur);
  }

  function playInstrumentBass(midi: number, when?: number, dur = 1.2) {
    if (isKeyboard) audioEngine.keyboard(36 + CT.pc(midi), when, dur);
    else audioEngine.bass(midi, when, dur);
  }

  // 진행 연주 탭이 받은 해시("#prog?c=…") — 다른 탭에 갔다 돌아와도 같은 진행을 연다
  const [progHash, setProgHash] = useState<string>(() =>
    typeof window !== 'undefined' && isProgHash(window.location.hash) ? window.location.hash : ''
  );

  // 전역 타이머 관리 레프
  const timersRef = useRef<number[]>([]);
  const intervalsRef = useRef<number[]>([]);

  function stopAllTransports() {
    intervalsRef.current.forEach((id) => window.clearInterval(id));
    intervalsRef.current = [];
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setScPlaying(false);
    setScNow(null);
    setTonePlaying(false);
    setToneIdx(-1);
    setMxPlaying(false);
    setCcPlaying(false);
    setRiPlaying(false);
    setTfPlaying(false);
    setDsPlaying(false);
  }

  function handleTabChange(tabId: ChordTabId) {
    if (!supportedTabs.includes(tabId)) tabId = 'scale';
    stopAllTransports();
    setActiveTab(tabId);
    try {
      localStorage.setItem('ulp:tab', tabId);
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      window.location.hash = tabId === 'prog' && progHash ? progHash : `#${tabId}`;
    }
  }

  useEffect(() => {
    function handleHashChange() {
      const requested = tabFromHash(window.location.hash);
      const h = requested && supportedTabs.includes(requested) ? requested : requested ? 'scale' : null;
      if (requested && requested !== h) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${h}`);
      if (h === 'prog') setProgHash(window.location.hash === '#prog' ? '' : window.location.hash);
      if (h && h !== activeTab) {
        stopAllTransports();
        setActiveTab(h);
        try {
          localStorage.setItem('ulp:tab', h);
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      stopAllTransports();
    };
  }, [activeTab, instrumentKind]);

  // ================= 1. 스케일 연습 상태 =================
  const [scMode, setScMode] = useState<'simple' | 'circle'>('simple');
  const [scRoot, setScRoot] = useState<number>(0);
  const [scType, setScType] = useState<string>('pentMaj');
  const [scBlock, setScBlock] = useState<number>(1);
  const [scLabel, setScLabel] = useState<'deg' | 'name' | 'none'>('deg');
  const [scHand, setScHand] = useState<'right' | 'left'>('right');
  const [scDir, setScDir] = useState<1 | -1>(1);
  const [scBars, setScBars] = useState<number>(0);
  const [scRange, setScRange] = useState<'oct' | 'pos'>('oct');
  const [scBpm, setScBpm] = useState<number>(90);
  const [scRootOnly, setScRootOnly] = useState<boolean>(false);
  const [scCi, setScCi] = useState<number>(0);
  const [scZoom, setScZoom] = useState<number>(10);
  const [scPos, setScPos] = useState<number>(0);
  const [scNow, setScNow] = useState<{ s: number; f: number } | null>(null);
  const [scPlaying, setScPlaying] = useState<boolean>(false);

  const scTuning = CT.TUNING_BY[selectedTuning];
  const scIsCagedUnsupported = isCagedUnsupportedScale(scType);
  const scEffBlock = isKeyboard || scIsCagedUnsupported ? 0 : scBlock;
  const scCircleList = useMemo(() => CT.scaleCircle(scRoot, scType, scDir), [scRoot, scType, scDir]);
  const scCurrentKey = scMode === 'circle' ? scCircleList[scCi] : CT.scaleInfo(scRoot, scType);

  // 블럭 자동 맞춤
  const scActiveBlockObj = useMemo(() => {
    if (scEffBlock <= 0) return null;
    const blocks = CT.scaleBlocks(scCurrentKey.root, scType, scTuning.open, scTuning.frets);
    return blocks.find((b) => b.blockId === scEffBlock) || blocks[0] || null;
  }, [scEffBlock, scCurrentKey.root, scType, scTuning.open, scTuning.frets]);

  useEffect(() => {
    if (scActiveBlockObj) {
      const maxF = scTuning.frets;
      const count = maxF + 1 - scZoom;
      const targetLo = Math.max(0, scActiveBlockObj.lo - 1);
      const targetHi = Math.min(maxF, scActiveBlockObj.hi + 1);
      if (targetLo < scPos || targetHi > scPos + count - 1) {
        setScPos(Math.max(0, Math.min(maxF + 1 - count, targetLo)));
      }
    }
  }, [scActiveBlockObj, scTuning.frets, scZoom]);

  const scWindowCount = scTuning.frets + 1 - scZoom;
  const scWinLo = Math.max(0, Math.min(scPos, scTuning.frets + 1 - scWindowCount));
  const scWinHi = scWinLo + scWindowCount - 1;

  const scSeqNotes = useMemo<BoardNote[]>(() => {
    if (isKeyboard) {
      const notes = scCurrentKey.notes;
      const up: BoardNote[] = [];
      for (let pitch = 48 + scCurrentKey.root; pitch <= 48 + scCurrentKey.root + (scRange === 'oct' ? 12 : 24); pitch++) {
        const meta = notes.find((n: any) => n.pc === CT.pc(pitch));
        if (meta) up.push({ s: 0, f: pitch, pitch, deg: meta.deg, name: meta.name, isRoot: meta.iv === 0 });
      }
      return up.concat(up.slice(1, -1).reverse());
    }
    if (scActiveBlockObj) {
      return CT.scaleBlockSeq(scActiveBlockObj.notes);
    }
    const all = CT.scaleOnBoard(scCurrentKey.root, scType, scTuning.open, scWinLo, scWinHi);
    if (!all.length) return [];
    let pitches = [...new Set(all.map((n) => n.pitch))].sort((a, b) => a - b);
    if (scRange === 'oct') {
      const r = pitches.find((p) => CT.pc(p) === scCurrentKey.root);
      if (r != null && pitches.includes(r + 12)) {
        pitches = pitches.filter((p) => p >= r && p <= r + 12);
      }
    }
    let prev: BoardNote | null = null;
    const up = pitches.map((p) => {
      const cands = all.filter((n) => n.pitch === p);
      const pick = prev
        ? cands.reduce((a, b) =>
            Math.abs(b.f - prev!.f) + 0.6 * Math.abs(b.s - prev!.s) <
            Math.abs(a.f - prev!.f) + 0.6 * Math.abs(a.s - prev!.s)
              ? b
              : a
          )
        : cands.reduce((a, b) => (b.s < a.s ? b : a));
      prev = pick;
      return pick;
    });
    return up.concat(up.slice(1, -1).reverse());
  }, [isKeyboard, scActiveBlockObj, scCurrentKey.root, scType, scTuning.open, scWinLo, scWinHi, scRange]);
  const scSequenceRef = useRef(scSeqNotes);
  scSequenceRef.current = scSeqNotes;

  const scBoardNotes = useMemo<DiagramNote[]>(() => {
    const raw = CT.scaleOnBoard(scCurrentKey.root, scType, scTuning.open, scWinLo, scWinHi);
    const blkKeySet = scActiveBlockObj
      ? new Set(scActiveBlockObj.notes.map((n) => `${n.s}:${n.f}`))
      : null;
    const lrKey = scActiveBlockObj
      ? scActiveBlockObj.notes.find((n) => n.isLowestRoot)
      : null;
    const lrKeyStr = lrKey ? `${lrKey.s}:${lrKey.f}` : '';

    return raw
      .map((n) => {
        const isNow = !!scNow && scNow.s === n.s && scNow.f === n.f;
        const keyStr = `${n.s}:${n.f}`;
        const isPress = blkKeySet ? blkKeySet.has(keyStr) : true;
        const isLowest = scActiveBlockObj ? keyStr === lrKeyStr : false;
        return {
          s: n.s,
          f: n.f,
          pitch: n.pitch,
          deg: n.deg,
          name: n.name,
          cls: n.isRoot ? 'root' : 'guide',
          now: isNow,
          ctx: blkKeySet ? !isPress : false,
          press: blkKeySet ? isPress : false,
          lowestRoot: isLowest,
          isLowestRoot: isLowest,
          moved: scMode === 'circle' && scCurrentKey.added?.includes(n.name),
          text: scLabel === 'name' ? n.name : scLabel === 'deg' ? n.deg : '',
        };
      })
      .filter((n) => !scRootOnly || n.cls === 'root' || n.now);
  }, [
    scCurrentKey,
    scType,
    scTuning.open,
    scWinLo,
    scWinHi,
    scActiveBlockObj,
    scNow,
    scMode,
    scLabel,
    scRootOnly,
  ]);

  function scPlayNote(midi: number, t?: number, dur = 0.55) {
    if (isKeyboard) audioEngine.keyboard(midi, t, dur);
    else if (scTuning.kind === 'bass') {
      audioEngine.bassPluck(midi, t, dur);
    } else {
      audioEngine.pluck(midi, t, dur);
    }
  }

  function toggleScPlay() {
    if (scPlaying) {
      stopAllTransports();
      setScNow(null);
      return;
    }
    audioEngine.resume();
    setScPlaying(true);
    let stepIdx = 0;
    let localCi = scCi;
    let seq = scSeqNotes;
    const intervalMs = (60 / scBpm) * 500; // 8분음표 단위

    const timerId = window.setInterval(() => {
      seq = scSequenceRef.current;
      if (seq.length === 0) return;
      const note = seq[stepIdx % seq.length];
      const nowTime = audioEngine.now();
      scPlayNote(note.pitch, nowTime, 0.5);
      if (stepIdx % 2 === 0) {
        audioEngine.click(nowTime, stepIdx % 8 === 0);
      }
      setScNow({ s: note.s, f: note.f });

      stepIdx++;
      if (scMode === 'circle' && scBars > 0 && stepIdx >= scBars * 8) {
        stepIdx = 0;
        localCi = (localCi + 1) % 12;
        setScCi(localCi);
        playInstrumentBass(36 + scCircleList[localCi].root, audioEngine.now(), 1.0);
      } else if (stepIdx >= seq.length && scMode === 'circle' && scBars === 0) {
        stepIdx = 0;
        localCi = (localCi + 1) % 12;
        setScCi(localCi);
        playInstrumentBass(36 + scCircleList[localCi].root, audioEngine.now(), 1.0);
      }
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  // ================= 2. 코드톤 지도 상태 =================
  const [toneRoot, setToneRoot] = useState<number>(0);
  const [toneStart, setToneStart] = useState<number>(0);
  const [toneNear, setToneNear] = useState<number>(3);
  const [toneQ, setToneQ] = useState<string>('maj7');
  const [toneDir, setToneDir] = useState<'up' | 'down' | 'round'>('up');
  const [toneAuto, setToneAuto] = useState<boolean>(false);
  const [toneBpm, setToneBpm] = useState<number>(80);
  const [toneIdx, setToneIdx] = useState<number>(-1);
  const [tonePlaying, setTonePlaying] = useState<boolean>(false);

  const toneNotes = useMemo(() => {
    if (isKeyboard) {
      const quality = CT.QBY[toneQ];
      return [...Array(8)].map((_, index) => {
        const slot = (toneStart + index) % 4;
        const pitch = 48 + toneRoot + quality.iv[slot] + Math.floor((toneStart + index) / 4) * 12;
        return { s: 0, f: pitch, pitch, slot, deg: quality.deg[slot], cls: slot === 0 ? 'root' : 'guide' };
      });
    }
    if (selectedTuning !== 'g6') {
      const tuning = CT.TUNING_BY[selectedTuning];
      const quality = CT.QBY[toneQ];
      const candidates: any[][] = [];
      for (let fret = 0; fret <= tuning.frets; fret++) {
        if (CT.pc(tuning.open[0] + fret) !== CT.pc(toneRoot + quality.iv[toneStart])) continue;
        let previous = tuning.open[0] + fret - 1;
        const notes = tuning.open.flatMap((open, s) => [0, 1].map((offset) => {
          const slot = (toneStart + s * 2 + offset) % 4;
          let pitch = previous + 1;
          while (CT.pc(pitch) !== CT.pc(toneRoot + quality.iv[slot])) pitch++;
          previous = pitch;
          return { s, f: pitch - open, pitch, slot, deg: quality.deg[slot], cls: slot === 0 ? 'root' : 'guide' };
        }));
        if (notes.every((n) => n.f >= 0 && n.f <= tuning.frets)) candidates.push(notes);
      }
      candidates.sort((a, b) => Math.abs(a[0].f - toneNear) - Math.abs(b[0].f - toneNear));
      return candidates[0] || [];
    }
    const base = CT.arpeggio2nps(toneRoot, toneStart, toneNear);
    return CT.arpeggioAs(base, toneQ);
  }, [isKeyboard, selectedTuning, toneRoot, toneStart, toneNear, toneQ]);

  const toneOrderList = useMemo(() => {
    const up = [...Array(toneNotes.length).keys()];
    if (toneDir === 'up') return up;
    if (toneDir === 'down') return [...up].reverse();
    return up.concat([...up].slice(1, -1).reverse());
  }, [toneNotes.length, toneDir]);

  const toneBoardNotes = useMemo<DiagramNote[]>(() => {
    const cur = toneIdx >= 0 ? toneOrderList[toneIdx % toneOrderList.length] : -1;
    return toneNotes.map((n: any, i: number) => ({
      ...n,
      now: i === cur,
    }));
  }, [toneNotes, toneIdx, toneOrderList]);
  const tonePlaybackRef = useRef({ notes: toneNotes, order: toneOrderList, quality: toneQ });
  tonePlaybackRef.current = { notes: toneNotes, order: toneOrderList, quality: toneQ };

  // tone 탭 지판 가로 스크롤 상자 ref
  const toneScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeTab !== 'tone') return;

    function adjustToneScroll() {
      const el = toneScrollRef.current;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth) return;
      const frets = toneNotes.map((n: any) => n.f).filter((f: any) => typeof f === 'number');
      const minFret = frets.length > 0 ? Math.min(...frets) : 0;
      const targetFret = Math.max(0, minFret - 1);
      // FretboardSvg 기하: L = 30, showOpen = true, xL = 56, fretW = 44
      const targetX = targetFret === 0 ? 0 : 56 + (targetFret - 1) * 44;
      el.scrollLeft = Math.min(targetX, Math.max(0, el.scrollWidth - el.clientWidth));
    }

    adjustToneScroll();
    const rafId = requestAnimationFrame(adjustToneScroll);
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, toneNotes]);

  function toggleTonePlay() {
    if (tonePlaying) {
      stopAllTransports();
      setToneIdx(-1);
      return;
    }
    audioEngine.resume();
    setTonePlaying(true);
    let step = 0;
    const intervalMs = (60 / toneBpm) * 500;

    const timerId = window.setInterval(() => {
      const latest = tonePlaybackRef.current;
      if (!latest.order.length) return;
      const k = step % latest.order.length;
      const noteIdx = latest.order[k];
      const n = latest.notes[noteIdx];
      const nowTime = audioEngine.now();
      scPlayNote(n.pitch, nowTime, 0.5);
      if (step % 2 === 0) {
        audioEngine.click(nowTime, k === 0);
      }
      setToneIdx(k);
      step++;
      if (k === latest.order.length - 1 && toneAuto) {
        const qi = CT.ARP_Q.indexOf(latest.quality);
        setToneQ(CT.ARP_Q[(qi + 1) % CT.ARP_Q.length]);
      }
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  // ================= 3. 보이싱 매트릭스 상태 =================
  const [mxRoot, setMxRoot] = useState<number>(0);
  const [mxDrop, setMxDrop] = useState<string>('d2');
  const [mxInv, setMxInv] = useState<number>(0);
  const [mxSetKey, setMxSetKey] = useState<string | null>(null);
  const [mxQ, setMxQ] = useState<string>('maj7');
  const [mxSpan, setMxSpan] = useState<number>(4);
  const [mxPlace, setMxPlace] = useState<number>(0);
  const [mxBeats, setMxBeats] = useState<number>(4);
  const [mxBpm, setMxBpm] = useState<number>(70);
  const [mxCur, setMxCur] = useState<number>(-1);
  const [mxPlaying, setMxPlaying] = useState<boolean>(false);

  const mxDropStructure = useMemo(
    () => CT.dropStructure(mxDrop)[mxInv] || [],
    [mxDrop, mxInv]
  );
  const mxPlayableSets = useMemo(
    () => CT.playableSets(mxDrop, mxInv, mxRoot, mxSpan),
    [mxDrop, mxInv, mxRoot, mxSpan]
  );

  // setKey 동기화
  const activeMxSetObj = useMemo(() => {
    if (!mxPlayableSets.length) return null;
    const found = mxPlayableSets.find((s: any) => s.set.join(',') === mxSetKey);
    return found || mxPlayableSets[0];
  }, [mxPlayableSets, mxSetKey]);

  useEffect(() => {
    if (activeMxSetObj && activeMxSetObj.set.join(',') !== mxSetKey) {
      setMxSetKey(activeMxSetObj.set.join(','));
      setMxPlace(0);
    }
  }, [activeMxSetObj, mxSetKey]);

  const mxPlacements = activeMxSetObj ? activeMxSetObj.placements : [];
  const safeMxPlace = Math.min(mxPlace, Math.max(0, mxPlacements.length - 1));
  const mxR0 = mxPlacements.length ? mxPlacements[safeMxPlace].R0 : 0;

  const mxCounts = useMemo(
    () => CT.countPlayable(mxRoot, mxSpan),
    [mxRoot, mxSpan]
  );

  function toggleMxPlay() {
    if (mxPlaying) {
      stopAllTransports();
      setMxCur(-1);
      return;
    }
    if (!activeMxSetObj) return;
    audioEngine.resume();
    setMxPlaying(true);
    let beat = 0;
    const intervalMs = (60 / mxBpm) * 1000;

    const timerId = window.setInterval(() => {
      const qIdx = Math.floor(beat / mxBeats) % CT.Q4.length;
      const k = beat % mxBeats;
      const nowTime = audioEngine.now();
      audioEngine.click(nowTime, k === 0);
      if (k === 0) {
        const qId = CT.Q4[qIdx].id;
        const a = CT.atR0(mxDropStructure, activeMxSetObj.set, mxR0, qId);
        if (a.valid) {
          playInstrumentChord(pitchesOf(a.notes), nowTime, (60 / mxBpm) * mxBeats * 0.9);
        }
        setMxCur(qIdx);
        setMxQ(qId);
      }
      beat++;
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  // ================= 4. 탑노트 5도권 상태 =================
  const [ccRoot, setCcRoot] = useState<number>(5);
  const [ccIv, setCcIv] = useState<number>(2);
  const [ccStr, setCcStr] = useState<number>(5);
  const [ccNear, setCcNear] = useState<number>(8);
  const [ccIdx, setCcIdx] = useState<number>(0);
  const [ccHsel, setCcHsel] = useState<number>(0);
  const [ccHint, setCcHint] = useState<boolean>(true);
  const [ccTopSnd, setCcTopSnd] = useState<boolean>(true);
  const [ccSkip, setCcSkip] = useState<boolean>(true);
  const [ccBeats, setCcBeats] = useState<number>(4);
  const [ccBpm, setCcBpm] = useState<number>(60);
  const [ccAllOpen, setCcAllOpen] = useState<boolean>(false);
  const [ccPlaying, setCcPlaying] = useState<boolean>(false);

  const ccStepsList = useMemo(() => CT.circleSteps(ccRoot, ccIv), [ccRoot, ccIv]);
  const ccTopFret = useMemo(
    () => CT.topFret(ccStr, ccStepsList[0]?.topPc ?? 0, ccNear),
    [ccStr, ccStepsList, ccNear]
  );
  const ccCurrentStep = ccStepsList[ccIdx % 12];
  const ccNextStep = ccStepsList[(ccIdx + 1) % 12];

  const ccHintsList = useMemo(() => {
    if (!ccCurrentStep || !ccCurrentStep.q) return [];
    const vs = GE.genVoicings(ccCurrentStep.root, ccCurrentStep.q, {
      lo: Math.max(1, ccTopFret - 4),
      hi: ccTopFret + 3,
      maxSpan: 4,
      minNotes: 3,
      maxNotes: 4,
      needGuide: 2,
      top: { s: ccStr, f: ccTopFret },
    });
    vs.sort((a: any, b: any) => b.score - a.score);
    const picked: any[] = [];
    const seen = new Set<string>();
    for (const v of vs) {
      const kind =
        v.notes.length === 3
          ? t('chords.toneThreeNotes')
          : v.notes.some((n: any) => n.cls === 'root')
          ? t('chords.toneIncludeRoot')
          : t('chords.toneOmitRoot');
      const key = kind + v.notes[0].s;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ v, kind });
      if (picked.length >= 3) break;
    }
    return picked;
  }, [ccCurrentStep, ccTopFret, ccStr]);

  function ccStepSound(stepIdx: number) {
    const st = ccStepsList[stepIdx % 12];
    const nowTime = audioEngine.now() + 0.02;
    playInstrumentBass(36 + CT.pc(st.root) + (CT.pc(st.root) < 4 ? 12 : 0), nowTime, 1.2);
    if (ccTopSnd) {
      audioEngine.pluck(CT.OPEN[ccStr] + ccTopFret, nowTime + 0.01, 1.2);
    }
  }

  function ccMove(delta: number) {
    let nextIdx = (ccIdx + delta + 12) % 12;
    if (ccSkip && ccPlaying && !ccStepsList[nextIdx].q) {
      nextIdx = (nextIdx + delta + 12) % 12;
    }
    setCcIdx(nextIdx);
    setCcHsel(0);
    ccStepSound(nextIdx);
  }

  function toggleCcPlay() {
    if (ccPlaying) {
      stopAllTransports();
      return;
    }
    audioEngine.resume();
    setCcPlaying(true);
    let beat = 0;
    let localIdx = ccIdx;
    const intervalMs = (60 / ccBpm) * 1000;

    const timerId = window.setInterval(() => {
      const k = beat % ccBeats;
      const nowTime = audioEngine.now();
      audioEngine.click(nowTime, k === 0);
      if (k === 0) {
        if (beat > 0) {
          localIdx = (localIdx + 1) % 12;
          if (ccSkip && !ccStepsList[localIdx].q) {
            localIdx = (localIdx + 1) % 12;
          }
          setCcIdx(localIdx);
        }
        const st = ccStepsList[localIdx];
        const dur = (60 / ccBpm) * ccBeats * 0.95;
        playInstrumentBass(36 + CT.pc(st.root) + (CT.pc(st.root) < 4 ? 12 : 0), nowTime, dur);
        if (ccTopSnd) {
          audioEngine.pluck(CT.OPEN[ccStr] + ccTopFret, nowTime + 0.01, dur);
        }
      }
      beat++;
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  // ================= 5. 코드 재해석 상태 =================
  const [riFrets, setRiFrets] = useState<number[]>(() => [...REINT_PRESETS[0].frets]);
  const [riKeyboardPitches, setRiKeyboardPitches] = useState<number[]>([48, 52, 55, 59]);
  const [riInputPitch, setRiInputPitch] = useState(60);
  const [riPreset, setRiPreset] = useState<string>(DEFAULT_REINT_PRESET_ID);
  const [riPick, setRiPick] = useState<number | null>(0);
  const [riKey, setRiKey] = useState<number>(0);
  const [riBpm, setRiBpm] = useState<number>(90);
  const [riPlaying, setRiPlaying] = useState<boolean>(false);

  // 퀴즈 상태
  const [quizScore, setQuizScore] = useState<{ score: number; n: number }>({ score: 0, n: 0 });
  const [quizQuestion, setQuizQuestion] = useState<{
    notes: Array<{ s: number; f: number; pitch: number }>;
    text: string;
    opts: Array<{ label: string; ok: boolean }>;
    explain: string;
  } | null>(null);
  const [quizDone, setQuizDone] = useState<boolean>(false);
  const [quizFeedback, setQuizFeedback] = useState<{ text: string; good: boolean } | null>(null);

  const riNotes = useMemo(
    () => isKeyboard ? riKeyboardPitches.map((pitch, index) => ({ s: index, f: pitch, pitch })) :
      riFrets
        .map((f, s) => (f < 0 ? null : { s, f, pitch: CT.OPEN[s] + f }))
        .filter(Boolean) as Array<{ s: number; f: number; pitch: number }>,
    [riFrets, isKeyboard, riKeyboardPitches]
  );

  const riInterpretList = useMemo(() => CT.interpret(riNotes), [riNotes]);
  const riSelectedInterp = riPick != null ? riInterpretList[riPick] : null;

  const riDegNotes = useMemo<DiagramNote[]>(() => {
    return riNotes.map((n, i) => {
      const d = riSelectedInterp ? riSelectedInterp.degs[i] : CT.NAMES[CT.pc(n.pitch)];
      const cls = !riSelectedInterp
        ? ''
        : d === 'R'
        ? 'root'
        : ['3', 'b3', '7', 'b7', 'bb7', '4'].includes(d)
        ? 'guide'
        : '';
      return { s: n.s, f: n.f, deg: d, cls };
    });
  }, [riNotes, riSelectedInterp]);

  const riSwapPlan = useMemo(() => {
    if (riNotes.length < 3) return [];
    const roles = [
      { r: t('chords.reintMinorTwo'), root: CT.pc(riKey + 2), fams: ['min'] },
      { r: 'V', root: CT.pc(riKey + 7), fams: ['dom', 'sus'] },
      { r: 'I', root: riKey, fams: ['maj'] },
    ];
    return roles.map((ro) => {
      const it = riInterpretList.find((x: any) => ro.fams.includes(x.fam));
      if (!it) return { ro, none: true };
      const shift = CT.pc(ro.root - it.root);
      const delta = shift > 6 ? shift - 12 : shift;
      const tn = isKeyboard ? riNotes.map((note) => ({ ...note, f: note.f + delta, pitch: note.pitch + delta })) : CT.transposeShape(riNotes, it.root, ro.root);
      if (!tn) return { ro, none: true };
      const d = tn[0].f - riNotes[0].f;
      const name = CT.NAMES[ro.root] + it.name.slice(CT.NAMES[it.root].length);
      return { ro, it, notes: tn, name, d };
    });
  }, [riNotes, riKey, riInterpretList, isKeyboard]);

  function startNewQuiz() {
    const p = REINT_PRESETS[Math.floor(Math.random() * REINT_PRESETS.length)];
    const shift = Math.floor(Math.random() * 7) - 3;
    let notes = p.frets
      .map((f, s) => (f < 0 ? null : { s, f, pitch: CT.OPEN[s] + f }))
      .filter(Boolean) as Array<{ s: number; f: number; pitch: number }>;
    if (notes.every((n) => n.f + shift >= 1)) {
      notes = notes.map((n) => ({ s: n.s, f: n.f + shift, pitch: n.pitch + shift }));
    }
    const list = CT.interpret(notes);
    if (!list.length) return;
    const it = list[Math.floor(Math.random() * list.length)];
    let qObj: any;
    if (Math.random() < 0.5) {
      const valid = new Set(list.filter((x: any) => x.fam === it.fam).map((x: any) => x.root));
      const wrong = shuffle([...Array(12).keys()].filter((r) => !valid.has(r))).slice(0, 3);
      qObj = {
        notes,
        text: t('chords.quizQuestionOne', { family: FAM_LABEL_KEY[it.fam] ? t(FAM_LABEL_KEY[it.fam]) : it.famLabel }),
        opts: shuffle([it.root, ...wrong]).map((r) => ({
          label: CT.NAMES[r],
          ok: r === it.root,
        })),
        explain: `${it.name} · ${notes
          .map((n, k) => isKeyboard ? `${CT.NAMES[CT.pc(n.pitch)]}${Math.floor(n.pitch / 12) - 1}: ${it.degs[k]}` : t('chords.quizStringDegree', { str: 6 - n.s, deg: it.degs[k] }))
          .reverse()
          .join(', ')}`,
      };
    } else {
      const k = Math.floor(Math.random() * notes.length);
      qObj = {
        notes,
        text: t('chords.quizQuestionTwo', { name: it.name, deg: it.degs[k] }),
        opts: shuffle(
          notes.map((n, j) => ({
            label: isKeyboard ? `${CT.NAMES[CT.pc(n.pitch)]}${Math.floor(n.pitch / 12) - 1}` : t('chords.quizStringOnly', { str: 6 - n.s }),
            ok: j === k || it.degs[j] === it.degs[k],
          }))
        ),
        explain: notes
          .map((n, j) => isKeyboard ? `${CT.NAMES[CT.pc(n.pitch)]}${Math.floor(n.pitch / 12) - 1}: ${it.degs[j]}` : t('chords.quizStringDegree', { str: 6 - n.s, deg: it.degs[j] }))
          .reverse()
          .join(', '),
      };
    }
    setQuizQuestion(qObj);
    setQuizDone(false);
    setQuizFeedback(null);
  }

  useEffect(() => {
    startNewQuiz();
  }, [isKeyboard]);

  function toggleRiPlay() {
    if (riPlaying) {
      stopAllTransports();
      return;
    }
    audioEngine.resume();
    setRiPlaying(true);
    let beat = 0;
    const intervalMs = (60 / riBpm) * 1000;

    const timerId = window.setInterval(() => {
      const bar = Math.floor(beat / 4) % 4;
      const k = beat % 4;
      const nowTime = audioEngine.now();
      audioEngine.click(nowTime, k === 0);
      const p = riSwapPlan[Math.min(bar, 2)];
      const spb = 60 / riBpm;
      if (p) {
        if (k === 0) {
          playInstrumentBass(36 + p.ro.root + (p.ro.root < 4 ? 12 : 0), nowTime, spb * 3.8);
        }
        if ((k === 0 || k === 2) && !p.none) {
          playInstrumentChord(pitchesOf(p.notes), nowTime + 0.01, spb * 1.8);
        }
      }
      beat++;
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  // ================= 6. 2-5-1 탐색 상태 =================
  const [tfKind, setTfKind] = useState<'major' | 'minor'>('major');
  const [tfLo, setTfLo] = useState<number>(5);
  const [tfHi, setTfHi] = useState<number>(8);
  const [tfProot, setTfProot] = useState<number>(9);
  const [tfPtype, setTfPtype] = useState<'min' | 'maj'>('min');
  const [tfOutsideMax, setTfOutsideMax] = useState<number>(2);
  const [tfNeedGuide, setTfNeedGuide] = useState<number>(2);
  const [tfUsePent, setTfUsePent] = useState<boolean>(true);
  const [tfVariants, setTfVariants] = useState<boolean>(false);
  const [tfStatus, setTfStatus] = useState<string>('');
  const [tfResults, setTfResults] = useState<{ keyboard: boolean; results: any[] }>({ keyboard: false, results: [] });
  const tfOkList = tfResults.keyboard === isKeyboard ? tfResults.results : [];
  const [tfKey, setTfKey] = useState<number | null>(null);
  const [tfP, setTfP] = useState<number>(0);
  const [tfC, setTfC] = useState<number>(0);
  const [tfPlaying, setTfPlaying] = useState<boolean>(false);

  function runTfSearch() {
    stopAllTransports();
    setTfStatus(t('chords.tfSearching'));
    const timerId = window.setTimeout(() => {
      const lo = tfLo;
      const hi = Math.max(lo, tfHi);
      let res: any[];
      if (isKeyboard) {
        const pent = GE.pentPcs(tfProot, tfPtype);
        const qualities = tfKind === 'major' ? [['m7', 'm9', 'm11'], ['7', '9', '13'], ['maj7', 'maj9', '6']]
          : [['m7b5'], ['7', '9', '13'], ['m7', 'm6', 'm9']];
        res = Array.from({ length: 12 }, (_, key) => {
          const paths = Array.from({ length: tfVariants ? 3 : 1 }, (_, variant) => {
            const chords = [2, 7, 0].map((interval, index) => {
              const root = CT.pc(key + interval);
              const q = qualities[index][variant % qualities[index].length];
              const notes = GE.CH[q].map((degree, slot) => {
                const pitch = 48 + root + GE.DEG[degree][0];
                return { s: slot, f: 0, pitch, deg: degree, cls: degree === 'R' ? 'root' : ['3', 'b3', '7', 'b7', 'bb7'].includes(degree) ? 'guide' : '' };
              });
              return { root, q, name: GE.chordName(root, q), notes,
                outside: notes.filter((note) => !pent.includes(CT.pc(note.pitch))).length,
                guide: notes.filter((note) => note.cls === 'guide').length };
            });
            return { chords };
          }).filter((path) => path.chords.every((chord) => chord.guide >= tfNeedGuide && (!tfUsePent || chord.outside <= tfOutsideMax)));
          return { key, paths };
        });
      } else res = GE.search251({
        kind: tfKind,
        lo,
        hi,
        variants: tfVariants,
        perKey: 3,
        needGuide: tfNeedGuide,
        outsideMax: tfUsePent ? tfOutsideMax : 99,
        pent: tfUsePent ? { root: tfProot, type: tfPtype } : null,
      });
      const ok = res.filter((k: any) => k.paths.length);
      setTfStatus(isKeyboard ? t('chords.keyboardTfResults', { count: ok.length }) : t('chords.tfResultStatus', { lo, hi, count: ok.length }));
      setTfResults({ keyboard: isKeyboard, results: ok });
      if (!ok.some((k: any) => k.key === tfKey)) {
        setTfKey(ok.length ? ok[0].key : null);
        setTfP(0);
        setTfC(0);
      }
    }, 20);
    timersRef.current.push(timerId);
  }

  useEffect(() => {
    if (activeTab === 'tf') runTfSearch();
  }, [activeTab, isKeyboard]);

  const tfCurrentPath = useMemo(() => {
    if (tfKey == null) return null;
    const found = tfOkList.find((k: any) => k.key === tfKey);
    return found ? found.paths[Math.min(tfP, found.paths.length - 1)] : null;
  }, [tfKey, tfOkList, tfP]);

  function playTfSequence() {
    if (tfPlaying) { stopAllTransports(); return; }
    if (!tfCurrentPath) return;
    stopAllTransports();
    audioEngine.resume();
    setTfPlaying(true);
    const path = tfCurrentPath;
    path.chords.forEach((c: any, i: number) => {
      const tid = window.setTimeout(() => {
        const now = audioEngine.now();
        playInstrumentBass(36 + CT.pc(c.root) + (CT.pc(c.root) < 4 ? 12 : 0), now, 1.5);
        playInstrumentChord(pitchesOf(c.notes), now, 1.5);
        setTfC(i);
      }, i * 1600);
      timersRef.current.push(tid);
    });
    timersRef.current.push(window.setTimeout(() => setTfPlaying(false), path.chords.length * 1600));
  }

  // ================= 7. 더블 스탑 연습 상태 =================
  const [dsRoot, setDsRoot] = useState<number>(0);
  const [dsScale, setDsScale] = useState<string>('major');
  const [dsInst, setDsInst] = useState<TuningId>('g6');
  const [dsInterval, setDsInterval] = useState<DoubleStopIntervalId>('3rd');
  const [dsPair, setDsPair] = useState<[number, number]>([4, 5]);
  const [dsDir, setDsDir] = useState<'up' | 'down' | 'round'>('round');
  const [dsBpm, setDsBpm] = useState<number>(75);
  const [dsSel, setDsSel] = useState<number>(0);
  const [dsPlaying, setDsPlaying] = useState<boolean>(false);

  const dsTuning = CT.TUNING_BY[dsInst] || CT.TUNING_BY.g6;
  const dsPairOptions = useMemo(
    () => getDoubleStopPairs(dsTuning.open.length, dsInterval),
    [dsTuning.open.length, dsInterval]
  );

  // PR #41 리뷰 반영: 렌더 타임에 현재 악기 현 수와 음정에 맞는 유효한 줄 쌍을 동기 계산
  // 이전 악기(6현 [4,5])에서 줄 수가 적은 악기(4현)로 전환될 때 useEffect 대기 중 크래시 방지
  const effectiveDsPair = useMemo(
    () => getSafeDoubleStopPair(dsTuning.open.length, dsInterval, dsPair),
    [dsTuning.open.length, dsInterval, dsPair]
  );

  // 악기 또는 음정 변경 시 상태 동기화 (렌더 타임 정규화 후 비동기 상태 일치)
  useEffect(() => {
    if (dsPair[0] !== effectiveDsPair[0] || dsPair[1] !== effectiveDsPair[1]) {
      setDsPair(effectiveDsPair);
      setDsSel(0);
    }
  }, [effectiveDsPair, dsPair]);

  const dsStepsList = useMemo(() => {
    return CT.doubleStops({
      rootPc: dsRoot,
      scaleId: dsScale,
      interval: dsInterval,
      pair: effectiveDsPair,
      open: dsTuning.open,
      lo: 0,
      hi: dsTuning.frets,
    });
  }, [dsRoot, dsScale, dsInterval, effectiveDsPair, dsTuning.open, dsTuning.frets]);

  const safeDsSel = Math.min(dsSel, Math.max(0, dsStepsList.length - 1));
  const activeDsPair = dsStepsList[safeDsSel];

  const dsBoardNotes = useMemo<DiagramNote[]>(() => {
    const ctxAll = CT.scaleOnBoard(dsRoot, dsScale, dsTuning.open, 0, dsTuning.frets);
    const activeMidis = activeDsPair ? [activeDsPair.notes[0].pitch, activeDsPair.notes[1].pitch] : [];

    return ctxAll.map((n) => {
      const isNow = activeMidis.includes(n.pitch);
      return {
        s: n.s,
        f: n.f,
        pitch: n.pitch,
        deg: n.deg,
        cls: n.isRoot ? 'root' : '',
        ctx: !isNow,
        press: isNow,
        now: isNow,
      };
    });
  }, [dsRoot, dsScale, dsTuning.open, dsTuning.frets, activeDsPair]);

  function playDsStep(stepIdx: number) {
    const pair = dsStepsList[stepIdx];
    if (!pair) return;
    audioEngine.resume();
    audioEngine.doubleStop(
      [pair.notes[0].pitch, pair.notes[1].pitch],
      audioEngine.now() + 0.02,
      1.1,
      dsTuning.kind === 'bass'
    );
    setDsSel(stepIdx);
  }

  function toggleDsPlay() {
    if (dsPlaying) {
      stopAllTransports();
      return;
    }
    if (!dsStepsList.length) return;
    audioEngine.resume();
    setDsPlaying(true);
    let step = 0;
    const intervalMs = (60 / dsBpm) * 1000;

    const ord: number[] = [];
    const up = [...Array(dsStepsList.length).keys()];
    if (dsDir === 'up') ord.push(...up);
    else if (dsDir === 'down') ord.push(...[...up].reverse());
    else ord.push(...up, ...[...up].slice(1, -1).reverse());

    const timerId = window.setInterval(() => {
      const idx = ord[step % ord.length];
      const p = dsStepsList[idx];
      const nowTime = audioEngine.now();
      audioEngine.doubleStop(
        [p.notes[0].pitch, p.notes[1].pitch],
        nowTime,
        1.0,
        dsTuning.kind === 'bass'
      );
      audioEngine.click(nowTime, step % 4 === 0);
      setDsSel(idx);
      step++;
    }, intervalMs);

    intervalsRef.current.push(timerId);
  }

  return (
    <AppShell variant="default" activeNav="learn" showThemeToggle>
      <div className={styles.pane}>
      <header className={styles.pageHeader}>
        <div className={styles.headRow}>
          <h1 className={styles.pageTitle} data-align-group="head: center-y">{t('chords.pageTitle')}</h1>
          <a href="/practice.html" className={styles.practiceLink} data-align-group="head: center-y">
            {t('chords.backToPlayer')}
          </a>
        </div>
        <p className={styles.subText}>
          {t('chords.pageSub')}
        </p>
        <div className={styles.instrumentControls} data-align-group="instrumentFlow:left">
          <div className={`${styles.field} ${styles.instrumentField}`}>
            <span id="instrument-label" className={styles.lab}>{t('chords.instrumentSelectLab')}</span>
            <div id="instrument-kind" className={`${styles.chips} ${styles.instrumentKind}`} role="group" aria-labelledby="instrument-label">
              {(['guitar', 'bass', 'keyboard'] as const).map((kind) => <button
                key={kind} id={`instrument-${kind}`} type="button" className={styles.chip}
                data-align-group="instrumentButtons:top,height" aria-pressed={instrumentKind === kind}
                onClick={() => changeInstrument(kind)}>{t(INSTRUMENT_NAME_KEY[kind])}</button>)}
            </div>
          </div>
          {!isKeyboard && <details id="instrument-settings" className={styles.instrumentSettings}>
            <summary id="instrument-settings-summary">{t('chords.instrumentSettings')} · {t(TUNING_NAME_KEY[selectedTuning])}</summary>
            <div className={styles.field}>
              <label htmlFor="instrument-tuning">{t('chords.instrumentTuning')}</label>
              <select id="instrument-tuning" className={styles.selectField} value={selectedTuning}
                onChange={(event) => changeTuning(event.target.value as TuningId)}>
                {availableTunings.map((tuning) => <option key={tuning.id} value={tuning.id}>{t(TUNING_NAME_KEY[tuning.id])}</option>)}
              </select>
            </div>
          </details>}
        </div>
      </header>

      {/* 상단 탭 내비게이션 */}
      <nav className={styles.tabs} role="tablist" aria-label={t('chords.tabListAria')} data-align-group="instrumentFlow:left">
        {CHORD_TABS.filter((tab) => supportedTabs.includes(tab.id)).map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            className={styles.tab}
            data-align-group="tabs: top,height"
            aria-selected={activeTab === tab.id}
            aria-controls={`pane-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onKeyDown={(event) => {
              const index = supportedTabs.indexOf(tab.id);
              const next = event.key === 'ArrowRight' ? supportedTabs[(index + 1) % supportedTabs.length]
                : event.key === 'ArrowLeft' ? supportedTabs[(index + supportedTabs.length - 1) % supportedTabs.length]
                : event.key === 'Home' ? supportedTabs[0] : event.key === 'End' ? supportedTabs[supportedTabs.length - 1] : null;
              if (next) { event.preventDefault(); handleTabChange(next); document.getElementById(`tab-${next}`)?.focus(); }
            }}
            onClick={() => handleTabChange(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {/* 1. 스케일 연습 패널 */}
      <section id="pane-scale" role="tabpanel" className={styles.pane} hidden={activeTab !== 'scale'}>
        <div className={styles.panel}>
          <div className={styles.scHead}>
            <h2 id="sc-title" className={styles.scTitle}>
              {scCurrentKey.name}
            </h2>
            <div id="sc-notes" className={styles.scNotes}>
              {scCurrentKey.notes.map((n: any) => (
                <span
                  key={n.name}
                  className={`scn ${n.iv === 0 ? 'root' : ''} ${
                    scMode === 'circle' && scCurrentKey.added?.includes(n.name) ? 'moved' : ''
                  }`}
                >
                  <b>{n.name}</b>
                  <small>{n.deg}</small>
                </span>
              ))}
            </div>
          </div>

          {/* 5도권 바퀴 */}
          <div id="sc-circle" className={styles.scCircle} hidden={scMode !== 'circle'}>
            <div id="sc-wheel">
              <ScaleWheelSvg
                keys={scCircleList}
                idx={scCi}
                dir={scDir}
                onSelectKey={(i) => {
                  setScCi(i);
                  playInstrumentBass(36 + scCircleList[i].root, audioEngine.now() + 0.02, 1.2);
                }}
              />
            </div>
            <div className={styles.field}>
              <div id="sc-change" className={styles.note}>
                {scCi === 0 ? (
                  <span>
                    <b>{scCurrentKey.rootName}</b>{t('chords.scCircleIntroPost')}
                  </span>
                ) : (
                  <span>
                    {scCircleList[(scCi + 11) % 12]?.rootName} → <b>{scCurrentKey.rootName}</b> {t('chords.scChangedNotes')}:{' '}
                    {scCurrentKey.added?.length ? scCurrentKey.added.join(', ') : t('chords.none')}
                  </span>
                )}
              </div>
              <div id="sc-next" className={styles.status}>
                {t('chords.nextPrefix')}: {scCircleList[(scCi + 1) % 12]?.name}
              </div>
              <div className={styles.row}>
                <button
                  id="sc-prev"
                  type="button"
                  className={styles.ghost}
                  onClick={() => setScCi((scCi + 11) % 12)}
                >
                  {t('chords.btnPrevKey')}
                </button>
                <button
                  id="sc-nextb"
                  type="button"
                  className={styles.ghost}
                  onClick={() => setScCi((scCi + 1) % 12)}
                >
                  {t('chords.btnNextKey')}
                </button>
              </div>
            </div>
          </div>

          {/* 지판 */}
          <div className={styles.scroll} data-align-group="scBoardFlow:left,right">
            <div id="sc-board">
              {isKeyboard ? <KeyboardDiagramSvg label={scCurrentKey.name} notes={scSeqNotes.slice(0, Math.ceil(scSeqNotes.length / 2) + 1).filter((note) => !scRootOnly || note.isRoot || scNow?.f === note.f).map((n) => ({
                pitch: n.pitch, text: scLabel === 'name' ? n.name : scLabel === 'deg' ? n.deg : '', now: scNow?.f === n.f,
              }))} /> : <NeckSvg
                open={scTuning.open}
                isBass={scTuning.kind === 'bass'}
                lo={scWinLo}
                hi={scWinHi}
                flip={scHand === 'left'}
                block={scActiveBlockObj ? { lo: scActiveBlockObj.lo, hi: scActiveBlockObj.hi } : null}
                label={t('chords.fretboardKeyLabel', { name: scCurrentKey.name })}
                notes={scBoardNotes}
                onNoteClick={(pitch) => scPlayNote(pitch, audioEngine.now() + 0.02)}
              />}
            </div>
          </div>

          {/* CAGED 5블럭 선택기 */}
          <div className={styles.field} data-align-group="scBoardFlow:left,right" hidden={isKeyboard}>
            <span id="sc-block-label" className={styles.lab}>{t('chords.cagedBlockSelectLab')}</span>
            <div id="sc-block" className={styles.chips} role="group" aria-labelledby="sc-block-label">
              {CAGED_BLOCK_CHIPS.map((b) => (
                <button
                  key={b.v}
                  type="button"
                  className={styles.blockButton}
                  data-align-group="scBlocks:height"
                  disabled={scIsCagedUnsupported && b.v > 0}
                  aria-pressed={scEffBlock === b.v}
                  onClick={() => setScBlock(b.v)}
                >
                  {t(b.labelKey)}
                </button>
              ))}
            </div>
            <span id="sc-block-msg" className={styles.note} hidden={!scIsCagedUnsupported}>
              {t('chords.cagedMinorNotice')}
            </span>
          </div>

          {/* 범례 */}
          {isKeyboard && <div className={styles.legend} data-align-group="scBoardFlow:left,right">
            <span><i className="g" />{t('chords.legendScaleNotes')}</span>
            <span><i className="n" />{t('chords.legendCurrentPlaying')}</span>
          </div>}
          <div className={styles.legend} data-align-group="scBoardFlow:left,right" hidden={isKeyboard}>
            <span><i className="r" />{t('chords.legendRoot')}</span>
            <span><i className="g" />{t('chords.legendScaleNotes')}</span>
            <span><i className="ctxk" />{t('chords.legendOutNotes')}</span>
            <span><i className="blkk" />{t('chords.legendBlockForm')}</span>
            <span><i className="lowest-k" />{t('chords.legendLowestRoot')}</span>
            <span id="sc-leg-moved" hidden={scMode !== 'circle'}><i className="m" />{t('chords.legendPrevChanged')}</span>
            <span><i className="n" />{t('chords.legendCurrentPlaying')}</span>
          </div>

          {/* 슬라이더 컨트롤 */}
          <div className={styles.scSliders} hidden={isKeyboard}>
            <label className={styles.scSl}>
              {t('chords.sliderZoom')}
              <input
                id="sc-zoom"
                type="range"
                min="0"
                max={Math.max(0, scTuning.frets + 1 - 4)}
                value={scZoom}
                onChange={(e) => setScZoom(+e.target.value)}
              />
            </label>
            <label className={styles.scSl}>
              {t('chords.sliderPos')}
              <input
                id="sc-pos"
                type="range"
                min="0"
                max={Math.max(0, scTuning.frets + 1 - scWindowCount)}
                value={scPos}
                disabled={scTuning.frets + 1 - scWindowCount <= 0}
                onChange={(e) => setScPos(+e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* 프렛보드 및 스케일 설정 패널 */}
        <div className={styles.panel}>
          <div className={styles.scRows}>
            <div id="sc-row-basic" className={styles.scRow}>
              <div className={`${styles.field} ${styles.scField}`}>
                <span className={styles.lab}>{t('chords.practiceModeLab')}</span>
                <div id="sc-mode" className={styles.chips} data-align-group="scRow1:bottom@1150">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scMode === 'simple'}
                    onClick={() => {
                      setScMode('simple');
                      setScCi(0);
                    }}
                  >
                    {t('chords.modeSimpleScale')}
                  </button>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scMode === 'circle'}
                    onClick={() => {
                      setScMode('circle');
                      setScCi(0);
                    }}
                  >
                    {t('chords.modeCircleCycle')}
                  </button>
                </div>
              </div>
              <div className={`${styles.field} ${styles.scField}`}>
                <label id="sc-root-lab" htmlFor="sc-root">
                  {scMode === 'circle' ? t('chords.startRootLabel') : t('chords.rootNoteLabel')}
                </label>
                <select
                  id="sc-root"
                  className={styles.selectField}
                  data-align-group="scRow1:bottom@1150"
                  value={scRoot}
                  onChange={(e) => {
                    setScRoot(+e.target.value);
                    setScCi(0);
                  }}
                >
                  {CT.NAMES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.scField}`}>
                <label htmlFor="sc-type">{t('chords.scaleTypeLabel')}</label>
                <select
                  id="sc-type"
                  className={styles.selectField}
                  data-align-group="scRow1:bottom@1150"
                  value={scType}
                  onChange={(e) => setScType(e.target.value)}
                >
                  {CT.SCALES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div id="sc-row-circle" className={styles.scRow} hidden={scMode !== 'circle'}>
              <div id="sc-circle-opts" className={`${styles.field} ${styles.scField}`}>
                <span className={styles.lab}>{t('chords.cycleDirectionLab')}</span>
                <div id="sc-dir" className={styles.chips}>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scDir === 1}
                    onClick={() => {
                      setScDir(1);
                      setScCi(0);
                    }}
                  >
                    {t('chords.fifthUp')}
                  </button>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scDir === -1}
                    onClick={() => {
                      setScDir(-1);
                      setScCi(0);
                    }}
                  >
                    {t('chords.fourthUp')}
                  </button>
                </div>
              </div>
              <div className={`${styles.field} ${styles.scField}`}>
                <label htmlFor="sc-bars">{t('chords.barsPerKeyLabel')}</label>
                <select
                  id="sc-bars"
                  className={styles.selectField}
                  value={scBars}
                  onChange={(e) => setScBars(+e.target.value)}
                >
                  <option value={0}>{t('chords.scaleOneCycle')}</option>
                  <option value={1}>{t('chords.barsOne')}</option>
                  <option value={2}>{t('chords.barsTwo')}</option>
                  <option value={4}>{t('chords.barsFour')}</option>
                </select>
              </div>
            </div>
            <div id="sc-row-display" className={styles.scRow}>
              <div className={`${styles.field} ${styles.scField}`}>
                <span className={styles.lab}>{t('chords.noteLabelLab')}</span>
                <div id="sc-label" className={styles.chips} data-align-group="scRow2:bottom@1150">
                  {(['deg', 'name', 'none'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={styles.chip}
                      aria-pressed={scLabel === l}
                      onClick={() => setScLabel(l)}
                    >
                      {l === 'deg' ? t('chords.labelDegree') : l === 'name' ? t('chords.labelNoteName') : t('chords.none')}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`${styles.field} ${styles.scField}`} hidden={isKeyboard}>
                <span className={styles.lab}>{t('chords.handednessLab')}</span>
                <div id="sc-hand" className={styles.chips} data-align-group="scRow2:bottom@1150">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scHand === 'right'}
                    onClick={() => setScHand('right')}
                  >
                    {t('chords.rightHand')}
                  </button>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scHand === 'left'}
                    onClick={() => setScHand('left')}
                  >
                    {t('chords.leftHand')}
                  </button>
                </div>
              </div>
              <div className={`${styles.field} ${styles.scField}`}>
                <span className={styles.lab}>{t('chords.playRangeLab')}</span>
                <div id="sc-range" className={styles.chips} data-align-group="scRow2:bottom@1150">
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scRange === 'oct'}
                    onClick={() => setScRange('oct')}
                  >
                    {t('chords.rangeOneOctave')}
                  </button>
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={scRange === 'pos'}
                    onClick={() => setScRange('pos')}
                  >
                    {t('chords.rangeVisibleAll')}
                  </button>
                </div>
              </div>
            </div>
            <div id="sc-row-play" className={styles.scRow}>
              <div className={`${styles.field} ${styles.scField}`}>
                <label htmlFor="sc-bpm">{t('chords.bpmLabel')}</label>
                <input
                  id="sc-bpm"
                  className={styles.numField}
                  data-align-group="scRow3:bottom@1150; scRow3c:center-y"
                  type="number"
                  min="30"
                  max="220"
                  value={scBpm}
                  onChange={(e) => setScBpm(+e.target.value)}
                />
              </div>
              <label className={`${styles.check} ${styles.scCheck}`} data-align-group="scRow3:bottom@1150; scRow3c:center-y">
                <input
                  id="sc-rootonly"
                  type="checkbox"
                  checked={scRootOnly}
                  onChange={(e) => setScRootOnly(e.target.checked)}
                />
                {t('chords.rootOnlyMem')}
              </label>
              <button
                id="sc-play"
                type="button"
                className={styles.playbtn}
                aria-pressed={scPlaying}
                onClick={toggleScPlay}
              >
                {scPlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
              </button>
              <span id="sc-status" className={`${styles.status} ${styles.scStatus}`}>
                {isKeyboard ? t('chords.keyboardScaleCount', { from: `${CT.NAMES[scCurrentKey.root]}3`, to: `${CT.NAMES[scCurrentKey.root]}${scRange === 'oct' ? 4 : 5}`, count: new Set(scSeqNotes.map((note) => note.pitch)).size })
                  : t('chords.scaleVisibleCount', { lo: scWinLo, hi: scWinHi, count: scBoardNotes.length })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 코드톤 지도 패널 */}
      <section id="pane-tone" role="tabpanel" className={styles.pane} hidden={activeTab !== 'tone'}>
        <div className={styles.panel}>
          <p className={styles.lead}>
            {isKeyboard ? t('chords.keyboardToneIntro') : <><b>{t('chords.toneIntroBold')}</b> {t('chords.toneIntroText')}</>}
          </p>
          <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="tone-root">{t('chords.rootNoteLabel')}</label>
              <select
                id="tone-root"
                className={styles.selectField}
                value={toneRoot}
                onChange={(e) => setToneRoot(+e.target.value)}
              >
                {CT.NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field} hidden={isKeyboard}>
              <label htmlFor="tone-near">{t('chords.startFretNearLabel')}</label>
              <input
                id="tone-near"
                className={styles.numField}
                type="number"
                min="1"
                max="12"
                value={toneNear}
                onChange={(e) => setToneNear(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="tone-bpm">BPM</label>
              <input
                id="tone-bpm"
                className={styles.numField}
                type="number"
                min="40"
                max="200"
                value={toneBpm}
                onChange={(e) => setToneBpm(+e.target.value)}
              />
            </div>
            <label className={styles.check}>
              <input
                id="tone-auto"
                type="checkbox"
                checked={toneAuto}
                onChange={(e) => setToneAuto(e.target.checked)}
              />
              {t('chords.toneAutoCycle')}
            </label>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.toneStartPatternLab')}</span>
            <div id="tone-start" className={styles.chips}>
              {START_PAT.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  className={styles.chip}
                  aria-pressed={toneStart === p.v}
                  onClick={() => setToneStart(p.v)}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.toneChordQualityLab')}</span>
            <div id="tone-q" className={styles.chips}>
              {CT.ARP_Q.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={styles.chip}
                  aria-pressed={toneQ === q}
                  onClick={() => setToneQ(q)}
                >
                  {CT.QBY[q]?.name}
                  <small>{t(RULE[q])}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <div id="tone-dir" className={styles.chips}>
              {(['up', 'down', 'round'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={styles.chip}
                  aria-pressed={toneDir === d}
                  onClick={() => setToneDir(d)}
                >
                  {d === 'up' ? t('chords.dsAscending') : d === 'down' ? t('chords.dsDescending') : t('chords.dsRoundtrip')}
                </button>
              ))}
            </div>
            <button
              id="tone-play"
              type="button"
              className={styles.playbtn}
              aria-pressed={tonePlaying}
              onClick={toggleTonePlay}
            >
              {tonePlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <h3 id="tone-title" className={styles.h3}>
            {CT.NAMES[toneRoot]}
            {CT.QBY[toneQ]?.name} · {t(START_PAT[toneStart]?.labelKey)}
          </h3>
          <div ref={toneScrollRef} className={styles.scroll}>
            <div id="tone-board">
              {isKeyboard ? <KeyboardDiagramSvg notes={toneBoardNotes.map((n) => ({ pitch: n.pitch!, text: n.deg, now: n.now }))} label={`${CT.NAMES[toneRoot]}${CT.QBY[toneQ]?.name}`} />
              : selectedTuning !== 'g6' ? <NeckSvg open={scTuning.open} isBass={scTuning.kind === 'bass'} lo={0} hi={Math.max(15, ...toneNotes.map((n: any) => n.f))} notes={toneBoardNotes} label={`${CT.NAMES[toneRoot]} 2NPS`} /> : <FretboardSvg
                from={0}
                to={Math.max(15, Math.min(22, Math.max(...toneNotes.map((n: any) => n.f)) + 1))}
                label={`${CT.NAMES[toneRoot]}${CT.QBY[toneQ]?.name} 2-note-per-string`}
                notes={toneBoardNotes}
              />}
            </div>
          </div>
          <div id="tone-seq" className={styles.seq}>
            {(toneDir === 'down' ? [...toneNotes].reverse() : toneNotes).map((n: any, i: number) => (
              <span key={i} className={`seqn ${n.cls || ''} ${n.moved ? 'moved' : ''}`}>
                {isKeyboard ? `${CT.NAMES[CT.pc(n.pitch)]}${Math.floor(n.pitch / 12) - 1}` : `${scTuning.open.length - n.s}·${n.f}`}
                <b>{n.deg}</b>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 보이싱 매트릭스 패널 */}
      {supportedTabs.includes('matrix') && (<section id="pane-matrix" role="tabpanel" className={styles.pane} hidden={activeTab !== 'matrix'}>
        <div className={styles.panel}>
          <p className={styles.lead}>
            <b>{t('chords.matrixIntroBold')}</b> {t('chords.matrixIntroText')}
          </p>
          <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="mx-root">{t('chords.rootNoteLabel')}</label>
              <select
                id="mx-root"
                className={styles.selectField}
                value={mxRoot}
                onChange={(e) => setMxRoot(+e.target.value)}
              >
                {CT.NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="mx-span">{t('chords.handSpanFretLabel')}</label>
              <input
                id="mx-span"
                className={styles.numField}
                type="number"
                min="3"
                max="6"
                value={mxSpan}
                onChange={(e) => setMxSpan(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="mx-bpm">BPM</label>
              <input
                id="mx-bpm"
                className={styles.numField}
                type="number"
                min="40"
                max="160"
                value={mxBpm}
                onChange={(e) => setMxBpm(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="mx-beats">{t('chords.beatsPerChordLabel')}</label>
              <input
                id="mx-beats"
                className={styles.numField}
                type="number"
                min="1"
                max="8"
                value={mxBeats}
                onChange={(e) => setMxBeats(+e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.dropTypeLab')}</span>
            <div id="mx-drop" className={styles.chips}>
              {CT.DROPS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={mxDrop === d.id}
                  onClick={() => setMxDrop(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.inversionBassLab')}</span>
            <div id="mx-inv" className={styles.chips}>
              {CT.INV_NAME.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  className={styles.chip}
                  aria-pressed={mxInv === i}
                  onClick={() => setMxInv(i)}
                >
                  {INV_NAME_KEYS[i] ? t(INV_NAME_KEYS[i]) : n}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.stringComboLab')}</span>
            <div id="mx-set" className={styles.chips}>
              {mxPlayableSets.map((s: any) => {
                const sk = s.set.join(',');
                return (
                  <button
                    key={sk}
                    type="button"
                    className={styles.chip}
                    aria-pressed={mxSetKey === sk}
                    onClick={() => setMxSetKey(sk)}
                  >
                    {t('chords.stringNum', { n: s.label })}
                    <small>{s.full ? t('chords.allNineQualities') : t('chords.partialQualities')}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.positionSelectLab')}</span>
            <div id="mx-place" className={styles.chips}>
              {mxPlacements.map((p: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  className={styles.chip}
                  aria-pressed={safeMxPlace === i}
                  onClick={() => setMxPlace(i)}
                >
                  {t('chords.fretNearCount', { n: Math.min(...p.frets) })}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <button
              id="mx-play"
              type="button"
              className={styles.playbtn}
              aria-pressed={mxPlaying}
              onClick={toggleMxPlay}
            >
              {mxPlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
            </button>
            <span id="mx-count" className={styles.status}>
              {t('chords.matrixCombinations', { name: CT.NAMES[mxRoot], span: mxSpan + 1, count: mxCounts.ok })}
            </span>
          </div>
        </div>

        <div className={styles.panel}>
          <div id="mx-struct" className={styles.meta}>
            {t('chords.matrixFromBottom')}: {mxDropStructure.map((n: any) => (SLOT_NAME_KEYS[n.slot] ? t(SLOT_NAME_KEYS[n.slot]) : CT.SLOT_NAME[n.slot])).join(' → ')}
          </div>
          <h3 id="mx-btitle" className={styles.h3}>
            {CT.NAMES[mxRoot]}
            {CT.QBY[mxQ]?.name}
          </h3>
          <div className={styles.scroll}>
            <div id="mx-board">
              {activeMxSetObj && (
                <ChordNeckSvg
                  press={
                    CT.atR0(mxDropStructure, activeMxSetObj.set, mxR0, mxQ)?.notes || []
                  }
                  ctx={buildCtxNotes(mxRoot, q4Tones(mxQ))}
                  label={t('chords.matrixFretboardLabel', { chord: `${CT.NAMES[mxRoot]}${CT.QBY[mxQ]?.name}` })}
                />
              )}
            </div>
          </div>
          <div id="mx-strip" className={styles.strip}>
            {CT.Q4.map((q) => {
              if (!activeMxSetObj) return null;
              const a = CT.atR0(mxDropStructure, activeMxSetObj.set, mxR0, q.id);
              return (
                <figure
                  key={q.id}
                  className={`${styles.cell} ${q.id === mxQ ? styles.dsStepCardSel : ''}`}
                  onClick={() => {
                    setMxQ(q.id);
                    if (a.valid) {
                      playInstrumentChord(pitchesOf(a.notes), audioEngine.now() + 0.02);
                    }
                  }}
                >
                  {a.valid ? (
                    <ChordBoxSvg notes={a.notes} label={`${CT.NAMES[mxRoot]}${q.name}`} />
                  ) : (
                    <div>{t('chords.matrixImpossible')}</div>
                  )}
                  <figcaption>
                    <b>
                      {CT.NAMES[mxRoot]}
                      {q.name}
                    </b>
                    <span>{a.valid ? fretText(a.notes) : ''}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <div id="mx-alt" />
        </div>
      </section>)}

      {/* 4. 탑노트 5도권 패널 */}
      {supportedTabs.includes('circle') && (<section id="pane-circle" role="tabpanel" className={styles.pane} hidden={activeTab !== 'circle'}>
        <div className={styles.panel}>
          <div className={styles.ccTop}>
            <div id="cc-wheel">
              <CircleWheelSvg
                steps={ccStepsList}
                idx={ccIdx}
                onSelectStep={(i) => {
                  setCcIdx(i);
                  ccStepSound(i);
                }}
              />
            </div>
            <div className={styles.field}>
              <h2 id="cc-name" className={styles.h3}>
                {ccCurrentStep?.name}
              </h2>
              <div id="cc-deg" className={styles.meta}>
                Top: {ccCurrentStep?.deg} ({CT.NAMES[ccCurrentStep?.topPc]})
              </div>
              <div id="cc-where" className={styles.status}>
                {t('chords.circleTopFretFixed', { str: CT.strName(ccStr), fret: ccTopFret })}
              </div>
              <div id="cc-next" className={styles.note}>
                {t('chords.nextPrefix')}: {ccNextStep?.name} · Top {ccNextStep?.deg}
              </div>
            </div>
            <div className={styles.row}>
              <button id="cc-prev" type="button" className={styles.ghost} onClick={() => ccMove(-1)}>
                {t('chords.btnPrev')}
              </button>
              <button
                id="cc-play"
                type="button"
                className={styles.playbtn}
                aria-pressed={ccPlaying}
                onClick={toggleCcPlay}
              >
                {ccPlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
              </button>
              <button id="cc-nextb" type="button" className={styles.ghost} onClick={() => ccMove(1)}>
                {t('chords.btnNext')}
              </button>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="cc-root">{t('chords.startRootLabel')}</label>
              <select
                id="cc-root"
                className={styles.selectField}
                value={ccRoot}
                onChange={(e) => setCcRoot(+e.target.value)}
              >
                {CT.NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="cc-top">{t('chords.topNoteIntervalLabel')}</label>
              <select
                id="cc-top"
                className={styles.selectField}
                value={ccIv}
                onChange={(e) => setCcIv(+e.target.value)}
              >
                {[2, 9, 4, 6, 1, 8, 3, 10, 5, 0, 7].map((iv) => (
                  <option key={iv} value={iv}>
                    {CT.TOP_DEG[iv]}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="cc-str">{t('chords.topNoteStringLabel')}</label>
              <select
                id="cc-str"
                className={styles.selectField}
                value={ccStr}
                onChange={(e) => setCcStr(+e.target.value)}
              >
                {[5, 4, 3, 2, 1, 0].map((s) => (
                  <option key={s} value={s}>
                    {t('chords.stringNum', { n: 6 - s })}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="cc-near">{t('chords.nearFretLabel')}</label>
              <input
                id="cc-near"
                className={styles.numField}
                type="number"
                min="1"
                max="17"
                value={ccNear}
                onChange={(e) => setCcNear(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="cc-bpm">BPM</label>
              <input
                id="cc-bpm"
                className={styles.numField}
                type="number"
                min="30"
                max="140"
                value={ccBpm}
                onChange={(e) => setCcBpm(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="cc-beats">{t('chords.beatsPerChordLabel')}</label>
              <input
                id="cc-beats"
                className={styles.numField}
                type="number"
                min="1"
                max="8"
                value={ccBeats}
                onChange={(e) => setCcBeats(+e.target.value)}
              />
            </div>
            <label className={styles.check}>
              <input
                id="cc-hint"
                type="checkbox"
                checked={ccHint}
                onChange={(e) => setCcHint(e.target.checked)}
              />
              {t('chords.showRecomHint')}
            </label>
            <label className={styles.check}>
              <input
                id="cc-topsnd"
                type="checkbox"
                checked={ccTopSnd}
                onChange={(e) => setCcTopSnd(e.target.checked)}
              />
              {t('chords.soundTopNote')}
            </label>
            <label className={styles.check}>
              <input
                id="cc-skip"
                type="checkbox"
                checked={ccSkip}
                onChange={(e) => setCcSkip(e.target.checked)}
              />
              {t('chords.skipDissonant')}
            </label>
          </div>
        </div>

        <div className={styles.panel}>
          <div id="cc-hints" className={styles.boxrow}>
            {ccHintsList.map((h, i) => (
              <figure
                key={i}
                className={`${styles.cell} ${i === ccHsel ? styles.dsStepCardSel : ''}`}
                onClick={() => {
                  setCcHsel(i);
                  playInstrumentChord(
                    h.v.notes.map((n: any) => n.pitch),
                    audioEngine.now() + 0.02
                  );
                }}
              >
                <ChordBoxSvg notes={geNotesToDiagram(h.v)} label={h.v.name} />
                <figcaption>
                  <b>{h.kind}</b>
                  <span>{GE.fretStr(h.v)}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className={styles.scroll}>
            <div id="cc-board">
              <ChordNeckSvg
                press={
                  ccHintsList.length
                    ? geNotesToDiagram(ccHintsList[ccHsel]?.v || ccHintsList[0].v)
                    : [{ s: ccStr, f: ccTopFret, deg: ccCurrentStep?.deg.replace(/ .*/, ''), cls: 'guide' }]
                }
                ctx={ccCurrentStep?.q ? buildCtxNotes(ccCurrentStep.root, geTones(ccCurrentStep.q)) : []}
                label={t('chords.circleFretboardLabel', { name: ccCurrentStep?.name })}
              />
            </div>
          </div>

          <div id="cc-strip" className={styles.stepstrip}>
            {ccStepsList.map((s: any, i: number) => (
              <button
                key={i}
                type="button"
                className={`${styles.ccStep} ${i === ccIdx ? styles.ccStepCur : ''} ${!s.q ? styles.ccStepBad : ''}`}
                onClick={() => {
                  setCcIdx(i);
                  ccStepSound(i);
                }}
              >
                <b>{s.q ? s.name : `${CT.NAMES[s.root]}7`}</b>
                <span>{s.deg}</span>
              </button>
            ))}
          </div>

          <details id="cc-all" open={ccAllOpen} onToggle={() => setCcAllOpen(!ccAllOpen)}>
            <summary>{t('chords.allDominantsSummary')}</summary>
            <div id="cc-alllist" />
          </details>
        </div>
      </section>)}

      {/* 5. 코드 재해석 패널 */}
      {supportedTabs.includes('reint') && (<section id="pane-reint" role="tabpanel" className={styles.pane} hidden={activeTab !== 'reint'}>
        <div className={styles.panel}>
          <p className={styles.lead}>
            {isKeyboard ? t('chords.keyboardReintIntro') : <><b>{t('chords.reintIntroBold')}</b> {t('chords.reintIntroText')}</>}
          </p>
          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.presetFormLab')}</span>
            <div id="ri-presets" className={styles.chips}>
              {REINT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.chip}
                  title={isKeyboard ? undefined : t(p.hintKey)}
                  aria-pressed={riPreset === p.id}
                  onClick={() => {
                    stopAllTransports();
                    setRiPreset(p.id);
                    setRiFrets([...p.frets]);
                    setRiKeyboardPitches(p.frets.flatMap((f, index) => f < 0 ? [] : [CT.OPEN[index] + f]));
                    setRiPick(0);
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={styles.chip}
                aria-pressed={riPreset === 'custom'}
                onClick={() => setRiPreset('custom')}
              >
                {t('chords.btnManualPick')}
              </button>
            </div>
          </div>

          <div className={styles.scroll}>
            <div id="ri-board">
              {isKeyboard ? <KeyboardDiagramSvg notes={riNotes.map((note, index) => ({ pitch: note.pitch, text: riSelectedInterp?.degs[index], hand: index === 0 ? 'lh' : 'rh' }))} split label={t('chords.reintInputLabel')} /> : <FretboardSvg
                from={0}
                to={15}
                clickable
                notes={riDegNotes}
                label={t('chords.reintInputLabel')}
                onCellClick={(s, f) => {
                  const copy = [...riFrets];
                  copy[s] = copy[s] === f ? -1 : f;
                  setRiFrets(copy);
                  setRiPreset('custom');
                  setRiPick(0);
                  if (copy[s] >= 0) {
                    audioEngine.pluck(CT.OPEN[s] + f, audioEngine.now() + 0.02, 0.8);
                  }
                }}
              />}
            </div>
          </div>
          {isKeyboard && <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="ri-keyboard-note">{t('chords.keyboardNote')}</label>
              <select id="ri-keyboard-note" className={styles.selectField} value={riInputPitch} onChange={(event) => setRiInputPitch(+event.target.value)}>
                {Array.from({ length: 48 }, (_, index) => 36 + index).map((pitch) => <option value={pitch} key={pitch}>{CT.NAMES[CT.pc(pitch)]}{Math.floor(pitch / 12) - 1}</option>)}
              </select>
            </div>
            <button id="ri-keyboard-toggle" type="button" className={styles.btn} aria-pressed={riKeyboardPitches.includes(riInputPitch)} onClick={() => {
              stopAllTransports();
              setRiKeyboardPitches((pitches) => pitches.includes(riInputPitch) ? pitches.filter((pitch) => pitch !== riInputPitch) : [...pitches, riInputPitch].sort((a, b) => a - b));
              setRiPreset('custom'); setRiPick(0);
              audioEngine.keyboard(riInputPitch, audioEngine.now(), 0.8);
            }}>{t('chords.keyboardToggleNote')}</button>
          </div>}

          <div className={styles.row}>
            <button
              id="ri-hear"
              type="button"
              className={styles.btn}
              onClick={() => {
                if (riNotes.length) playInstrumentChord(pitchesOf(riNotes), audioEngine.now() + 0.02);
              }}
            >
              {t('chords.btnListenSound')}
            </button>
            <button
              id="ri-clear"
              type="button"
              className={styles.ghost}
              onClick={() => {
                stopAllTransports();
                setRiFrets([-1, -1, -1, -1, -1, -1]);
                setRiKeyboardPitches([]);
                setRiPreset('custom');
                setRiPick(0);
              }}
            >
              {isKeyboard ? t('chords.keyboardClear') : t('chords.btnClearFretboard')}
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.riLayout}>
            <div className={styles.riMain} data-align-group="reintPanels:top@1024">
              <div className={styles.riGrid}>
                <div id="ri-shape">
                  {riNotes.length ? (
                    <figure className={styles.cell}>
                      <>{isKeyboard ? <KeyboardDiagramSvg notes={riNotes} label={t('chords.currentShapeLabel')} /> : <ChordBoxSvg notes={riDegNotes} label={t('chords.currentShapeLabel')} />}</>
                      <figcaption>
                        <b>{isKeyboard ? riNotes.map((note) => `${CT.NAMES[CT.pc(note.pitch)]}${Math.floor(note.pitch / 12) - 1}`).join(' · ') : fretText(riNotes)}</b>
                      </figcaption>
                    </figure>
                  ) : (
                    <div className={styles.empty}>{t('chords.reintEmptyPrompt')}</div>
                  )}
                </div>

                <div id="ri-list" className={styles.chips}>
                  {riInterpretList.map((interp: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.chip} ${riPick === i ? styles.dsStepCardSel : ''}`}
                      onClick={() => {
                        setRiPick(riPick === i ? null : i);
                        const nowTime = audioEngine.now() + 0.02;
                        playInstrumentBass(36 + interp.root + (interp.root < 4 ? 12 : 0), nowTime, 2);
                        playInstrumentChord(pitchesOf(riNotes), nowTime + 0.05, 2);
                      }}
                    >
                      <b>{interp.name}</b>
                      <small>{ROLE_KEY[interp.role] ? t(ROLE_KEY[interp.role]) : interp.role}</small>
                    </button>
                  ))}
                </div>
              </div>
              <h3 className={styles.h3}>{t('chords.reintTwoFiveOneTitle')}</h3>
              <div className={styles.controls}>
                <div className={styles.field}>
                  <label htmlFor="ri-key">{t('chords.selectKeyLabel')}</label>
                  <select
                    id="ri-key"
                    className={styles.selectField}
                    value={riKey}
                    onChange={(e) => setRiKey(+e.target.value)}
                  >
                    {CT.NAMES.map((name, i) => (
                      <option key={name} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="ri-bpm">BPM</label>
                  <input
                    id="ri-bpm"
                    className={styles.numField}
                    type="number"
                    min="40"
                    max="180"
                    value={riBpm}
                    onChange={(e) => setRiBpm(+e.target.value)}
                  />
                </div>
                <button
                  id="ri-play"
                  type="button"
                  className={styles.playbtn}
                  aria-pressed={riPlaying}
                  onClick={toggleRiPlay}
                >
                  {riPlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
                </button>
              </div>
              <div id="ri-swap" className={`${styles.boxrow} ${styles.riSwap}`}>
                {riSwapPlan.map((p, i) => (
                  <figure key={i} className={styles.cell} data-align-group="reintSequence:top,height@768">
                    {!p.none ? (
                      <>{isKeyboard ? <KeyboardDiagramSvg notes={p.notes} label={p.name!} /> : <ChordBoxSvg notes={p.notes} label={p.name} />}</>
                    ) : (
                      <div className={styles.empty}>{t('chords.shapeImpossible')}</div>
                    )}
                    <figcaption>
                      <b>{p.ro.r} {p.name}</b>
                      <span>{p.notes ? isKeyboard ? p.notes.map((note: any) => `${CT.NAMES[CT.pc(note.pitch)]}${Math.floor(note.pitch / 12) - 1}`).join(' · ') : fretText(p.notes) : ''}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
            <section className={styles.riQuiz} data-align-group="reintPanels:top@1024">
              <h3 className={styles.h3}>{t('chords.quizTitle')}</h3>
              <div className={styles.quiz}>
                <div id="qz-box">
                  {quizQuestion && (
                    <>{isKeyboard ? <KeyboardDiagramSvg notes={quizQuestion.notes} label={t('chords.quizShapeLabel')} /> : <ChordBoxSvg notes={quizQuestion.notes} label={t('chords.quizShapeLabel')} />}</>
                  )}
                </div>
                <div className={styles.field}>
                  <div id="qz-score" className={styles.meta}>
                    {quizScore.n ? `${quizScore.score} / ${quizScore.n}` : t('chords.noSolvedQuiz')}
                  </div>
                  <div id="qz-text" className={styles.lead}>
                    {quizQuestion?.text}
                  </div>
                  <div id="qz-opts" className={`${styles.chips} ${styles.riOpts}`}>
                    {quizQuestion?.opts.map((o, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.chip}
                        disabled={quizDone}
                        onClick={() => {
                          if (quizDone) return;
                          setQuizDone(true);
                          setQuizScore((prev) => ({
                            score: o.ok ? prev.score + 1 : prev.score,
                            n: prev.n + 1,
                          }));
                          setQuizFeedback({
                            text: (o.ok ? t('chords.quizCorrect') : t('chords.quizIncorrect')) + quizQuestion.explain,
                            good: o.ok,
                          });
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {quizFeedback && (
                    <div id="qz-fb" className={styles.note}>
                      {quizFeedback.text}
                    </div>
                  )}
                  <div className={styles.row}>
                    <button
                      id="qz-hear"
                      type="button"
                      className={styles.ghost}
                      onClick={() => {
                        if (quizQuestion) playInstrumentChord(pitchesOf(quizQuestion.notes), audioEngine.now() + 0.02);
                      }}
                    >
                      {t('chords.btnListenSound')}
                    </button>
                    <button id="qz-next" type="button" className={styles.btn} onClick={startNewQuiz}>
                      {t('chords.btnNextQuiz')}
                    </button>
                  </div>
                </div>
              </div>
        
            </section>
          </div>
        </div>
      </section>)}

      {/* 6. 2-5-1 탐색 패널 */}
      {supportedTabs.includes('tf') && (<section id="pane-tf" role="tabpanel" className={styles.pane} hidden={activeTab !== 'tf'}>
        <div className={styles.panel}>
          <p className={styles.lead}>
            {isKeyboard ? t('chords.keyboardTfIntro') : <><b>{t('chords.tfIntroBold')}</b> {t('chords.tfIntroText')}</>}
          </p>
          <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="a-kind">{t('chords.tfProgKindLabel')}</label>
              <select
                id="a-kind"
                className={styles.selectField}
                value={tfKind}
                onChange={(e) => setTfKind(e.target.value as 'major' | 'minor')}
              >
                <option value="major">{t('chords.tfMajorTwoFiveOne')}</option>
                <option value="minor">{t('chords.tfMinorTwoFiveOne')}</option>
              </select>
            </div>
            <div className={styles.field} hidden={isKeyboard}>
              <label htmlFor="a-lo">{t('chords.fretStartLabel')}</label>
              <input
                id="a-lo"
                className={styles.numField}
                type="number"
                min="0"
                max="15"
                value={tfLo}
                onChange={(e) => setTfLo(+e.target.value)}
              />
            </div>
            <div className={styles.field} hidden={isKeyboard}>
              <label htmlFor="a-hi">{t('chords.fretEndLabel')}</label>
              <input
                id="a-hi"
                className={styles.numField}
                type="number"
                min="3"
                max="20"
                value={tfHi}
                onChange={(e) => setTfHi(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="a-proot">{t('chords.tfPentaRootLabel')}</label>
              <select
                id="a-proot"
                className={styles.selectField}
                value={tfProot}
                onChange={(e) => setTfProot(+e.target.value)}
              >
                {CT.NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="a-ptype">{t('chords.tfPentaTypeLabel')}</label>
              <select
                id="a-ptype"
                className={styles.selectField}
                value={tfPtype}
                onChange={(e) => setTfPtype(e.target.value as 'min' | 'maj')}
              >
                <option value="min">{t('chords.tfMinorPenta')}</option>
                <option value="maj">{t('chords.tfMajorPenta')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="a-out">{t('chords.tfMaxNotesOutPenta')}</label>
              <input
                id="a-out"
                className={styles.numField}
                type="number"
                min="0"
                max="6"
                value={tfOutsideMax}
                onChange={(e) => setTfOutsideMax(+e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="a-guide">{t('chords.tfGuideToneReq')}</label>
              <select
                id="a-guide"
                className={styles.selectField}
                value={tfNeedGuide}
                onChange={(e) => setTfNeedGuide(+e.target.value)}
              >
                <option value={2}>{t('chords.tfBothThreeSevenReq')}</option>
                <option value={1}>{t('chords.tfOnlyOneReq')}</option>
                <option value={0}>{t('chords.tfNoLimit')}</option>
              </select>
            </div>
            <label className={styles.check}>
              <input
                id="a-pent"
                type="checkbox"
                checked={tfUsePent}
                onChange={(e) => setTfUsePent(e.target.checked)}
              />
              {t('chords.tfFilterPenta')}
            </label>
            <label className={styles.check}>
              <input
                id="a-var"
                type="checkbox"
                checked={tfVariants}
                onChange={(e) => setTfVariants(e.target.checked)}
              />
              {t('chords.tfIncludeTension')}
            </label>
          </div>

          <div className={styles.row}>
            <button id="a-go" type="button" className={styles.btn} onClick={runTfSearch}>
              {t('chords.tfRunSearch')}
            </button>
            <span id="a-status" className={styles.status}>
              {tfStatus}
            </span>
          </div>
        </div>

        {/* 선택된 경로 지판 뷰 */}
        <div id="a-view" className={styles.panel} hidden={!tfCurrentPath}>
          <div className={styles.headRow}>
            <h3 id="a-vtitle" className={styles.h3}>
              {tfKey != null && CT.NAMES[tfKey]} {t('chords.tfProgTitle')}
            </h3>
            <span id="a-vmeta" className={styles.meta} />
            <button
              id="a-vplay"
              type="button"
              className={styles.playbtn}
              aria-pressed={tfPlaying}
              onClick={playTfSequence}
            >
              {tfPlaying ? t('chords.tfPlaying') : t('chords.tfListen')}
            </button>
          </div>

          <div id="a-vchips" className={styles.chips}>
            {tfCurrentPath?.chords.map((c: any, i: number) => (
              <button
                key={i}
                type="button"
                className={styles.chip}
                aria-pressed={tfC === i}
                onClick={() => {
                  setTfC(i);
                  playInstrumentChord(pitchesOf(c.notes), audioEngine.now() + 0.02, 1.5);
                }}
              >
                {ROMAN[tfKind][i]} · {c.name}
              </button>
            ))}
          </div>

          <div className={styles.scroll}>
            <div id="a-board">
              {tfCurrentPath && (isKeyboard ? <KeyboardDiagramSvg notes={tfCurrentPath.chords[tfC].notes} label={t('chords.tfFretboardLabel')} /> :
                <ChordNeckSvg
                  press={geNotesToDiagram(tfCurrentPath.chords[tfC])}
                  ctx={buildCtxNotes(
                    tfCurrentPath.chords[tfC].root,
                    geTones(tfCurrentPath.chords[tfC].q)
                  )}
                  block={{ lo: tfLo, hi: tfHi }}
                  label={t('chords.tfFretboardLabel')}
                />
              )}
            </div>
          </div>
          <div id="a-vctxl" className={styles.note}>
            {isKeyboard ? t('chords.keyboardToneContext') : t('chords.tfSameChordToneFull')}
          </div>

          <div id="a-out-list" className={styles.results}>
            {tfOkList.map((k: any) => (
              <article key={k.key} className={styles.panel}>
                <h4 className={styles.h3}>
                  {CT.NAMES[k.key]} {tfKind === 'minor' ? t('chords.minor') : t('chords.major')} {t('chords.tfProgTitle')}
                </h4>
                <div className={isKeyboard ? styles.keyboardSequence : styles.boxrowTight}>
                  {k.paths[0].chords.map((c: any, ci: number) => (
                    <figure
                      key={ci}
                      data-align-group={`tf-${k.key}:top,height`}
                      className={`${styles.cell} ${tfKey === k.key && tfC === ci ? styles.dsStepCardSel : ''}`}
                      onClick={() => {
                        setTfKey(k.key);
                        setTfP(0);
                        setTfC(ci);
                        playInstrumentChord(pitchesOf(c.notes), audioEngine.now() + 0.02, 1.5);
                      }}
                    >
                      <>{isKeyboard ? <KeyboardDiagramSvg notes={c.notes} label={c.name} /> : <ChordBoxSvg notes={geNotesToDiagram(c)} label={c.name} />}</>
                      <figcaption>
                        <b>{c.name}</b>
                        <span>{isKeyboard ? c.notes.map((note: any) => CT.NAMES[CT.pc(note.pitch)]).join(' · ') : GE.fretStr(c)}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>)}

      {/* 7. 더블 스탑 연습 패널 */}
      {supportedTabs.includes('ds') && (<section id="pane-ds" role="tabpanel" className={styles.pane} hidden={activeTab !== 'ds'}>
        <div className={styles.panel}>
          <p className={styles.lead}>
            <b>{t('chords.dsIntroBold')}</b> {t('chords.dsIntroText')}
          </p>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.dsInstrumentLab')}</span>
            <div id="ds-inst" className={styles.chips}>
              {CT.TUNINGS.filter((tuning) => tuning.kind === 'guitar').map((tun) => (
                <button
                  key={tun.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={dsInst === tun.id}
                  onClick={() => {
                    const nextTun = CT.TUNING_BY[tun.id] || CT.TUNING_BY.g6;
                    const nextPair = getSafeDoubleStopPair(nextTun.open.length, dsInterval, dsPair);
                    changeTuning(tun.id);
                    setDsPair(nextPair);
                    setDsSel(0);
                  }}
                >
                  {TUNING_NAME_KEY[tun.id] ? t(TUNING_NAME_KEY[tun.id]) : tun.name}
                  <small>{t('chords.tuningSummary', { strings: tun.open.length, frets: tun.frets })}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.field}>
              <label htmlFor="ds-root">{t('chords.rootNoteLabel')}</label>
              <select
                id="ds-root"
                className={styles.selectField}
                value={dsRoot}
                onChange={(e) => setDsRoot(+e.target.value)}
              >
                {CT.NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="ds-scale">{t('chords.scaleTypeLabel')}</label>
              <select
                id="ds-scale"
                className={styles.selectField}
                value={dsScale}
                onChange={(e) => setDsScale(e.target.value)}
              >
                {DOUBLE_STOP_SCALES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="ds-bpm">BPM</label>
              <input
                id="ds-bpm"
                className={styles.numField}
                type="number"
                min="30"
                max="200"
                value={dsBpm}
                onChange={(e) => setDsBpm(+e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.dsIntervalLab')}</span>
            <div id="ds-interval" className={styles.chips}>
              {CT.DOUBLE_STOP_INTERVALS.map((iv) => (
                <button
                  key={iv.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={dsInterval === iv.id}
                  onClick={() => {
                    const nextPair = getSafeDoubleStopPair(dsTuning.open.length, iv.id, dsPair);
                    setDsInterval(iv.id);
                    setDsPair(nextPair);
                    setDsSel(0);
                  }}
                >
                  {DS_NAME_KEY[iv.id] ? t(DS_NAME_KEY[iv.id]) : iv.name}
                  <small>{DS_DESC_KEY[iv.id] ? t(DS_DESC_KEY[iv.id]) : iv.desc}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.lab}>{t('chords.dsStringPairLab')}</span>
            <div id="ds-pair" className={styles.chips}>
              {dsPairOptions.map((opt) => {
                const isSel = effectiveDsPair[0] === opt.pair[0] && effectiveDsPair[1] === opt.pair[1];
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={styles.chip}
                    aria-pressed={isSel}
                    onClick={() => {
                      setDsPair(opt.pair);
                      setDsSel(0);
                    }}
                  >
                    {opt.label}
                    {opt.sub && <small>{opt.sub}</small>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.row}>
            <div id="ds-dir" className={styles.chips}>
              {(['up', 'down', 'round'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={styles.chip}
                  aria-pressed={dsDir === d}
                  onClick={() => setDsDir(d)}
                >
                  {d === 'up' ? t('chords.dsAscending') : d === 'down' ? t('chords.dsDescending') : t('chords.dsRoundtrip')}
                </button>
              ))}
            </div>
            <button
              id="ds-play"
              type="button"
              className={styles.playbtn}
              aria-pressed={dsPlaying}
              onClick={toggleDsPlay}
            >
              {dsPlaying ? t('chords.scalePlayStop') : t('chords.scalePlayStart')}
            </button>
            <span id="ds-status" className={styles.status}>
              {t('chords.dsDiatonicSteps', { count: dsStepsList.length })}
            </span>
          </div>
        </div>

        <div className={styles.panel}>
          <h3 id="ds-title" className={styles.h3}>
            {CT.NAMES[dsRoot]} {dsScale} · {DS_NAME_KEY[dsInterval] ? t(DS_NAME_KEY[dsInterval]) : CT.DOUBLE_STOP_INTERVALS.find((i) => i.id === dsInterval)?.name} (
            {t('chords.stringPairLabel', { high: dsTuning.open.length - effectiveDsPair[1], low: dsTuning.open.length - effectiveDsPair[0] })})
          </h3>
          <div className={styles.scroll}>
            <div id="ds-board">
              <NeckSvg
                open={dsTuning.open}
                isBass={dsTuning.kind === 'bass'}
                lo={0}
                hi={dsTuning.frets}
                label={t('chords.dsFretboardLabel')}
                notes={dsBoardNotes}
                onNoteClick={(pitch) => {
                  const foundIdx = dsStepsList.findIndex(
                    (st) => st.notes[0].pitch === pitch || st.notes[1].pitch === pitch
                  );
                  if (foundIdx >= 0) playDsStep(foundIdx);
                }}
              />
            </div>
          </div>

          <div className={styles.legend}>
            <span><i className="r" />{t('chords.legendRoot')}</span>
            <span><i className="g" />{t('chords.dsLegendIntervalNotes')}</span>
            <span><i className="ctxk" />{t('chords.dsLegendFullScaleNotes')}</span>
            <span><i className="blkk" />{t('chords.dsLegendCurrentRange')}</span>
            <span><i className="n" />{t('chords.dsLegendCurrentlyPlaying')}</span>
          </div>

          <h3 className={styles.h3}>
            {t('chords.dsCardHint')}
          </h3>
          <div id="ds-steps" className={styles.strip}>
            {dsStepsList.map((step, idx) => {
              const isSel = idx === safeDsSel;
              const n0 = step.notes[0];
              const n1 = step.notes[1];
              return (
                <button
                  key={step.step}
                  type="button"
                  className={`${styles.dsStepCard} ${isSel ? styles.dsStepCardSel : ''}`}
                  onClick={() => playDsStep(idx)}
                >
                  <b>{step.label}</b>
                  <span>
                    {n0.name}+{n1.name} ({n0.deg}+{n1.deg})
                  </span>
                  <small>
                    {dsTuning.open.length - n0.s}·{n0.f}f + {dsTuning.open.length - n1.s}·{n1.f}f
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      </section>)}

      {/* 8. 진행 연주 패널 (CH-5b) */}
      {supportedTabs.includes('prog') && (<section id="pane-prog" role="tabpanel" className={styles.pane} hidden={activeTab !== 'prog'}>
        <ProgressionPlayTab
          instrumentKind={isKeyboard ? 'keyboard' : 'guitar'}
          active={activeTab === 'prog'}
          hash={progHash}
          onNavigate={(h) => {
            window.location.hash = h;
          }}
          onOpenMatrix={(root, q) => {
            setMxRoot(root);
            setMxQ(q);
            handleTabChange('matrix');
          }}
          onOpenTone={(root, q) => {
            setToneRoot(root);
            setToneQ(q);
            handleTabChange('tone');
          }}
        />
      </section>)}
    </div>
    </AppShell>
  );
}
