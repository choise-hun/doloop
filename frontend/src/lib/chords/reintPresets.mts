// M4-1: 코드 재해석 탭 프리셋 — 표준 화성학 이름(특정 강의 순서·이름을 쓰지 않는다)
// frets 순서 = 6번줄(저음 E) → 1번줄, -1 = 안 침. 해석 결과는 test/m41_reint_presets.test.js가 엔진으로 확인한다
import { type I18nKey } from '../i18n.mts';

export interface ReintPreset {
  id: string;
  label: string;
  /** 칩 title(툴팁) — 이 손 모양의 기준 해석 한 줄 */
  hintKey: I18nKey;
  frets: number[];
}

export const REINT_PRESETS: ReadonlyArray<ReintPreset> = [
  { id: 'drop2', label: 'Drop 2 · maj7', hintKey: 'chords.reintDropTwoHint', frets: [-1, -1, 5, 7, 7, 7] },
  { id: 'quartal', label: 'Quartal · 4도 쌓기', hintKey: 'chords.reintQuartalHint', frets: [-1, -1, 7, 7, 8, 8] }, // i18n-keep: M4-1 프리셋 고유 라벨(D2)
  { id: 'rootless9', label: 'Rootless 9 · 3-7-9-5', hintKey: 'chords.reintRootlessNineHint', frets: [-1, -1, 5, 6, 6, 6] },
  { id: 'rootless13', label: 'Rootless 13 · 7-3-13-9', hintKey: 'chords.reintRootlessThirteenHint', frets: [-1, -1, 7, 8, 9, 9] },
  { id: 'm6', label: 'm6 = m7♭5', hintKey: 'chords.reintMsixHint', frets: [-1, -1, 2, 3, 3, 3] },
];

export const DEFAULT_REINT_PRESET_ID = 'drop2';

