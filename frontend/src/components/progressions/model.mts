// CH-5: CHORDS 화면용 순수 함수 — 코드 입력 나누기, 로마숫자·키, 폼 ↔ API 본문, 연습실·구간 반복 링크, 시드 변환
// 규칙: 개발산출물/결과/CH-1b_설계.md §2-1·§3·§8, 결과/CH-3_진행API.md §3

import { duplicatePitches, parseChord } from '../../lib/chords/symbol.mts';
import type { ChordFailReason } from '../../lib/chords/symbol.mts';
import { KEYS, romanize } from '../../lib/chords/roman.mts';
import { guessKeys } from '../../lib/chords/keyGuess.mts';
import type { KeyGuess } from '../../lib/chords/keyGuess.mts';
import type { ProgressionChordDto, ProgressionDto, ProgressionInput, ProgressionScope } from '../../lib/apiClient';

export { KEYS };
export type { KeyGuess };

export const MAX_CHORDS = 64;
export const MAX_SYMBOL = 24;
export const MAX_LIST = 10;
export const MAX_LIST_ITEM = 30;

// ── 코드 입력 ─────────────────────────────────────────

// 공백·| ·, ·→ 로 나누되 괄호 안(C7(b9, b13))은 나누지 않는다 (pasteParse.mts splitTokens와 같은 규칙 + →)
function splitTokens(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of line) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s|,→]/.test(ch)) {
      if (buf) out.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

const isChord = (tok: string): boolean => parseChord(tok).ok;

// "FM7 - E7 - Am7 Gm7 C7" / "FM7-E7-Am7" → ["FM7","E7","Am7","Gm7","C7"].
// 못 읽는 토큰도 남긴다(칩에 경고로 보여 주고 저장은 입력 표기 그대로 — 설계 §2-1)
export function splitChordInput(text: string): string[] {
  const out: string[] = [];
  for (const tok of splitTokens(String(text ?? ''))) {
    if (/^[-–—]+$/.test(tok)) continue;
    if (isChord(tok)) {
      out.push(tok);
      continue;
    }
    // 하이픈으로 붙여 쓴 진행 (C-7 같은 코드는 위에서 이미 통과)
    const parts = tok.split(/[-–—]/);
    if (parts.length > 1 && parts.every((p) => p === '' || isChord(p))) out.push(...parts.filter(Boolean));
    else out.push(tok);
  }
  return out;
}

export const FAIL_TEXT: Record<ChordFailReason, string> = {
  empty: '빈 코드',
  'no-chord': '코드 없음(N.C.) 표시',
  'bad-root': '근음은 A~G로 시작해야 합니다',
  'bad-bass': '슬래시 뒤 베이스음을 읽지 못했습니다',
  'bad-paren': '괄호가 맞지 않습니다',
  'unknown-suffix': '모르는 코드 표기입니다',
  conflict: '서로 맞지 않는 표기가 섞였습니다',
};

export type ChordCheck = { symbol: string; ok: boolean; warning: string };

// 칩 한 개의 상태: 못 읽음 / 너무 김 / 같은 음 도수 중복(경고만 — 결정 기록 2026-11-04)
export function checkChord(symbol: string): ChordCheck {
  if (symbol.length > MAX_SYMBOL) return { symbol, ok: false, warning: `코드는 ${MAX_SYMBOL}자까지 넣을 수 있습니다` };
  const c = parseChord(symbol);
  if (!c.ok) return { symbol, ok: false, warning: FAIL_TEXT[c.reason] };
  const dup = duplicatePitches(c);
  if (dup.length) {
    const pairs = dup.map((g) => g.join(' = ')).join(', ');
    return { symbol, ok: true, warning: `도수 표기는 중복이지만 연주 음은 겹칩니다 (${pairs})` };
  }
  return { symbol, ok: true, warning: '' };
}

export function keyCandidates(symbols: string[]): KeyGuess[] {
  return guessKeys(symbols);
}

// 키가 없으면 전부 ''. keep이 있으면 같은 자리·같은 심볼은 원래 roman을 쓴다(AI 값 유지)
export function computeRomans(symbols: string[], key: string, keep?: ProgressionChordDto[]): string[] {
  const auto = key ? romanize(symbols, key) : symbols.map(() => '');
  if (!keep) return auto;
  return symbols.map((s, i) => (keep[i] && keep[i].symbol === s ? keep[i].roman || '' : auto[i]));
}

// ── 폼 ↔ API ─────────────────────────────────────────

export type ProgressionForm = {
  kind: 'reference' | 'analysis';
  title: string;
  artist: string;
  part: string;
  album: string;
  releaseDate: string;
  key: string;
  chordsText: string;
  moods: string;
  genres: string;
  tags: string;
  url: string;
  memo: string;
};

export function emptyForm(kind: 'reference' | 'analysis' = 'reference'): ProgressionForm {
  return {
    kind,
    title: '',
    artist: '',
    part: '',
    album: '',
    releaseDate: '',
    key: '',
    chordsText: '',
    moods: '',
    genres: '',
    tags: '',
    url: '',
    memo: '',
  };
}

export function formFromDto(p: ProgressionDto): ProgressionForm {
  return {
    kind: p.kind,
    title: p.title || '',
    artist: p.artist || '',
    part: p.part || '',
    album: p.album || '',
    releaseDate: p.releaseDate || '',
    key: p.key || '',
    chordsText: (p.chords || []).map((c) => c.symbol).join(' - '),
    moods: (p.moods || []).join(', '),
    genres: (p.genres || []).join(', '),
    tags: (p.tags || []).join(', '),
    url: p.url || '',
    memo: p.memo || '',
  };
}

// "nostalgia, RnB ,  RnB" → ["nostalgia","RnB"] (앞뒤 공백 제거·중복 제거, 쉼표는 구분자 — 노션 multi_select 제약)
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? '').split(/[,，]/)) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// 코드 배열: 같은 자리·같은 심볼이면 원래 timestamp를 남긴다(source는 서버가 AI 행에서 다시 붙임 — CH-3 §3)
export function buildChords(symbols: string[], romans: string[], orig?: ProgressionChordDto[]): ProgressionChordDto[] {
  return symbols.map((symbol, i) => {
    const c: ProgressionChordDto = { symbol, roman: romans[i] || '' };
    const o = orig && orig[i];
    if (o && o.symbol === symbol && o.timestamp) c.timestamp = o.timestamp;
    return c;
  });
}

// 입력 검사. 문제가 있으면 첫 문구, 없으면 ''
export function validateForm(form: ProgressionForm, symbols: string[]): string {
  if (!form.title.trim()) return form.kind === 'reference' ? '곡 제목을 입력하세요.' : '제목을 입력하세요.';
  if (form.title.trim().length > 300) return '제목은 300자까지 넣을 수 있습니다.';
  if (form.kind === 'reference' && !form.artist.trim()) return '아티스트를 입력하세요.';
  if (!symbols.length) return '코드를 하나 이상 입력하세요.';
  if (symbols.length > MAX_CHORDS) return `코드는 ${MAX_CHORDS}개까지 넣을 수 있습니다.`;
  const long = symbols.find((s) => s.length > MAX_SYMBOL);
  if (long) return `코드는 ${MAX_SYMBOL}자까지 넣을 수 있습니다: ${long}`;
  for (const [label, text] of [['Mood', form.moods], ['Genre', form.genres], ['Tag', form.tags]] as const) {
    const items = splitList(text);
    if (items.length > MAX_LIST) return `${label}는 ${MAX_LIST}개까지 넣을 수 있습니다.`;
    const over = items.find((x) => x.length > MAX_LIST_ITEM);
    if (over) return `${label} 항목은 ${MAX_LIST_ITEM}자까지 넣을 수 있습니다: ${over}`;
  }
  const url = form.url.trim();
  if (url && !/^https?:\/\//i.test(url)) return '링크는 http:// 또는 https://로 시작해야 합니다.';
  if (form.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.releaseDate)) return '발매일은 YYYY-MM-DD 형식이어야 합니다.';
  return '';
}

// POST 본문 (서버가 origin·route·evidence를 정한다)
export function formToCreate(form: ProgressionForm, symbols: string[], romans: string[]): ProgressionInput {
  return {
    kind: form.kind,
    title: form.title.trim(),
    chords: buildChords(symbols, romans),
    part: form.part.trim(),
    artist: form.artist.trim(),
    album: form.album.trim(),
    releaseDate: form.releaseDate || null,
    key: form.key || null,
    moods: splitList(form.moods),
    genres: splitList(form.genres),
    tags: splitList(form.tags),
    url: form.url.trim(),
    memo: form.memo.trim(),
  };
}

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const chordSig = (cs: ProgressionChordDto[]): string => JSON.stringify(cs.map((c) => [c.symbol, c.roman || '', c.timestamp || '']));

// PATCH 본문: 바뀐 필드만. 아무것도 안 바뀌면 빈 객체(서버는 빈 본문을 400으로 받으므로 화면이 보내지 않는다)
export function formToPatch(form: ProgressionForm, symbols: string[], romans: string[], orig: ProgressionDto): ProgressionInput {
  const next = formToCreate(form, symbols, romans);
  next.chords = buildChords(symbols, romans, orig.chords);
  const patch: ProgressionInput = {};
  if (next.kind !== orig.kind) patch.kind = next.kind;
  for (const f of ['title', 'part', 'artist', 'album', 'url', 'memo'] as const) {
    if (next[f] !== (orig[f] || '')) patch[f] = next[f];
  }
  if ((next.releaseDate || null) !== (orig.releaseDate || null)) patch.releaseDate = next.releaseDate || null;
  if ((next.key || null) !== (orig.key || null)) patch.key = next.key || null;
  for (const f of ['moods', 'genres', 'tags'] as const) {
    if (!sameList(next[f]!, orig[f] || [])) patch[f] = next[f];
  }
  if (chordSig(next.chords) !== chordSig(orig.chords || [])) patch.chords = next.chords;
  return patch;
}

// AI 행에서 코드·키를 바꾸면 출처가 직접으로 바뀐다(설계 Q5) → 저장 전에 알려 줄지
export function patchTurnsManual(patch: ProgressionInput, orig: ProgressionDto): boolean {
  return orig.origin === 'ai' && (patch.chords !== undefined || patch.key !== undefined);
}

// ── 목록 ─────────────────────────────────────────────

export function filterScope<T extends { kind: string }>(list: T[], scope: ProgressionScope): T[] {
  return scope === 'all' ? list.slice() : list.filter((p) => p.kind === scope);
}

export const ORIGIN_LABEL: Record<string, string> = { ai: 'AI', manual: '직접' };
export const ROUTE_LABEL: Record<string, string> = { video: '코드 진행 영상', note: '학습 영상 노트', manual: '직접 입력' };
export const KIND_LABEL: Record<string, string> = { reference: '레퍼런스', analysis: '분석' };

export function chordLine(p: { chords: ProgressionChordDto[] }): string {
  return (p.chords || []).map((c) => c.symbol).join(' - ');
}

export function romanLine(p: { chords: ProgressionChordDto[] }): string {
  const rs = (p.chords || []).map((c) => c.roman || '');
  return rs.some(Boolean) ? rs.map((r) => r || '?').join(' - ') : '';
}

// 연습실 "진행 연주" 탭 링크 (CH-1a §3-1 확정): chords.html#prog?c=<심볼,>&k=<키>&t=<제목>&from=<id>
export function playHref(p: { id?: string; title?: string; key?: string | null; chords: ProgressionChordDto[] }): string {
  const qs = new URLSearchParams();
  qs.set('c', (p.chords || []).map((c) => c.symbol).join(','));
  if (p.key) qs.set('k', p.key);
  if (p.title) qs.set('t', p.title);
  if (p.id) qs.set('from', p.id);
  return 'chords.html#prog?' + qs.toString();
}

// 영상 구간 반복 (CH-1a §1): practice.html?v=<영상>&t=<시작 초>
export function loopHref(p: { videoId: string | null; startSec: number | null }): string {
  if (!p.videoId || !/^[A-Za-z0-9_-]{11}$/.test(p.videoId)) return '';
  let href = 'practice.html?v=' + encodeURIComponent(p.videoId);
  if (p.startSec !== null && p.startSec !== undefined && p.startSec >= 0) href += '&t=' + p.startSec;
  return href;
}

export function formatSec(sec: number | null): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ── 비로그인 시드 (설계 §8: DEFAULT_REFERENCE/ARCHIVE_PROGRESSIONS) ─────

export type SeedItem = { id: string; category: 'REFERENCE' | 'ARCHIVE'; chordsText: string; title: string; keyLabel: string };

// 시드 키 표기("A Minor")를 노션 Scale 표기("A min")로. 모르는 표기("F Dominant")는 null
export function seedKey(label: string): string | null {
  const m = /^([A-G][#b]?) (Major|Minor|min)$/.exec(String(label ?? '').trim());
  if (!m) return null;
  const want = `${m[1]} ${m[2] === 'Major' ? 'Major' : 'min'}`;
  return KEYS.includes(want) ? want : null;
}

export function seedToDto(s: SeedItem): ProgressionDto {
  const symbols = splitChordInput(s.chordsText);
  const key = seedKey(s.keyLabel);
  const romans = computeRomans(symbols, key || '');
  return {
    id: s.id,
    kind: s.category === 'REFERENCE' ? 'reference' : 'analysis',
    origin: 'manual',
    route: 'manual',
    evidence: null,
    title: s.title,
    part: '',
    artist: '',
    album: '',
    channel: '',
    releaseDate: null,
    key,
    instrument: null,
    chords: buildChords(symbols, romans),
    moods: [],
    genres: [],
    tags: [],
    url: '',
    videoId: null,
    startSec: null,
    endSec: null,
    memo: '',
    noteId: null,
    createdAt: '',
    updatedAt: '',
  };
}
