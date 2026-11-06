// M4-1: 코드 재해석 탭 프리셋 — 표준 화성학 이름(특정 강의 순서·이름을 쓰지 않는다)
// frets 순서 = 6번줄(저음 E) → 1번줄, -1 = 안 침. 해석 결과는 test/m41_reint_presets.test.js가 엔진으로 확인한다
export interface ReintPreset {
  id: string;
  label: string;
  /** 칩 title(툴팁) — 이 손 모양의 기준 해석 한 줄 */
  hint: string;
  frets: number[];
}

export const REINT_PRESETS: ReadonlyArray<ReintPreset> = [
  { id: 'drop2', label: 'Drop 2 · maj7', hint: 'Gmaj7 — 1·3·5·7에서 위에서 둘째 음을 한 옥타브 내림', frets: [-1, -1, 5, 7, 7, 7] },
  { id: 'quartal', label: 'Quartal · 4도 쌓기', hint: 'A–D–G–C 완전4도 쌓기 — D7sus4·Am7(11)', frets: [-1, -1, 7, 7, 8, 8] },
  { id: 'rootless9', label: 'Rootless 9 · 3-7-9-5', hint: 'Eb7(9) 근음 없는 보이싱 — 아래부터 3·b7·9·5', frets: [-1, -1, 5, 6, 6, 6] },
  { id: 'rootless13', label: 'Rootless 13 · 7-3-13-9', hint: 'B7(9,13) 근음 없는 보이싱 — 아래부터 b7·3·13·9', frets: [-1, -1, 7, 8, 9, 9] },
  { id: 'm6', label: 'm6 = m7♭5', hint: 'Gm6과 Em7(b5)가 같은 손 모양', frets: [-1, -1, 2, 3, 3, 3] },
];

export const DEFAULT_REINT_PRESET_ID = 'drop2';

