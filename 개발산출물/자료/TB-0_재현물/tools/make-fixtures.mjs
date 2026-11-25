// TB-0 자체 제작 fixture 생성기 (외부 악곡·샘플 미사용, 이 저장소 작성자가 직접 만든 음형)
// A: 32마디 4/4 120bpm → A.gp (alphaTab Gp7Exporter)
// B: 136마디, 65~72마디 3/4, 97마디 템포 90 → B.xml, B.mxl
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as at from '../node_modules/@coderline/alphatab/dist/alphaTab.core.mjs';

const out = new URL('../fixtures/', import.meta.url);
fs.mkdirSync(out, { recursive: true });

const STEP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ALT = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
function pitch(midi) {
  const s = STEP[midi % 12];
  const a = ALT[midi % 12];
  const o = Math.floor(midi / 12) - 1;
  return `<pitch><step>${s}</step>${a ? '<alter>1</alter>' : ''}<octave>${o}</octave></pitch>`;
}
const DIV = 4; // divisions per quarter
const TYPE = { 2: 'eighth', 4: 'quarter', 8: 'half', 12: 'half', 16: 'whole' };
function note(midi, dur, opts = {}) {
  const { chord = false, unpitched = null, inst = null, tuning = null } = opts;
  let tech = '';
  if (tuning) {
    // tuning: 낮은 줄→높은 줄 MIDI. 개방현이 음보다 낮거나 같은 가장 높은 줄 선택(MusicXML 줄 번호 1 = 가장 높은 줄)
    let idx = tuning.length - 1;
    while (idx > 0 && tuning[idx] > midi) idx--;
    tech = `<notations><technical><string>${tuning.length - idx}</string><fret>${midi - tuning[idx]}</fret></technical></notations>`;
  }
  const dot = dur === 12 ? '<dot/>' : '';
  const p = unpitched
    ? `<unpitched><display-step>${unpitched}</display-step><display-octave>4</display-octave></unpitched>`
    : pitch(midi);
  return `<note>${chord ? '<chord/>' : ''}${p}<duration>${dur}</duration>${inst ? `<instrument id="${inst}"/>` : ''}<voice>1</voice><type>${TYPE[dur]}</type>${dot}${tech}</note>`;
}

function plan(bars, withChanges) {
  return Array.from({ length: bars }, (_, i) => {
    const n = i + 1;
    const beats = withChanges && n >= 65 && n <= 72 ? 3 : 4;
    const tempo = n === 1 ? 120 : withChanges && n === 97 ? 90 : null;
    return { n, beats, tempo, timeChanged: n === 1 || (withChanges && (n === 65 || n === 73)) };
  });
}
// 파트별로 구별되는 음형
const GUITAR_RIFF = [64, 67, 69, 71, 72, 71, 69, 67]; // 8분음 상행·하행
const BASS_ROOTS = [40, 43, 45, 38]; // E2 G2 A2 D2
const GTR_TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
const BASS_TUNING = [28, 33, 38, 43]; // E1 A1 D2 G2
const staffDetails = (t) => `<staff-details><staff-lines>${t.length}</staff-lines>${t.map((m, i) => `<staff-tuning line="${i + 1}"><tuning-step>${STEP[m % 12]}</tuning-step><tuning-octave>${Math.floor(m / 12) - 1}</tuning-octave></staff-tuning>`).join('')}</staff-details>`;
function guitarBar(b) {
  return Array.from({ length: b.beats * 2 }, (_, k) => note(GUITAR_RIFF[(k + b.n) % 8], 2, { tuning: GTR_TUNING })).join('');
}
function bassBar(b) {
  const r = BASS_ROOTS[(b.n - 1) % 4];
  const o = { tuning: BASS_TUNING };
  return b.beats === 3 ? note(r, 12, o) : note(r, 8, o) + note(r + 7, 8, o);
}
function drumBar(b) {
  let s = '';
  for (let q = 0; q < b.beats; q++) {
    s += q % 2 === 0 ? note(0, 4, { unpitched: 'F', inst: 'P3-I37' }) : note(0, 4, { unpitched: 'C', inst: 'P3-I39' });
    s += note(0, 4, { chord: true, unpitched: 'G', inst: 'P3-I43' });
  }
  return s;
}
function attributes(b, clef) {
  if (!b.timeChanged) return '';
  const head = b.n === 1 ? `<divisions>${DIV}</divisions>` : '';
  return `<attributes>${head}<time><beats>${b.beats}</beats><beat-type>4</beat-type></time>${b.n === 1 ? clef : ''}</attributes>`;
}
function tempoDir(b) {
  if (!b.tempo) return '';
  return `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${b.tempo}</per-minute></metronome></direction-type><sound tempo="${b.tempo}"/></direction>`;
}
function musicXml(title, bars, withChanges) {
  const p = plan(bars, withChanges);
  const part = (id, clef, fn, withTempo) =>
    `<part id="${id}">` +
    p.map((b) => `<measure number="${b.n}">${attributes(b, clef)}${withTempo ? tempoDir(b) : ''}${fn(b)}</measure>`).join('') +
    '</part>';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${title}</work-title></work>
<identification><creator type="composer">TB-0 fixture (self-made)</creator><rights>Self-made test fixture for TB-0 spike. No third-party music.</rights></identification>
<part-list>
<score-part id="P1"><part-name>Guitar</part-name><score-instrument id="P1-I1"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>26</midi-program></midi-instrument></score-part>
<score-part id="P2"><part-name>Bass</part-name><score-instrument id="P2-I1"><instrument-name>Bass</instrument-name></score-instrument><midi-instrument id="P2-I1"><midi-channel>2</midi-channel><midi-program>34</midi-program></midi-instrument></score-part>
<score-part id="P3"><part-name>Drums</part-name>
<score-instrument id="P3-I37"><instrument-name>Kick</instrument-name></score-instrument>
<score-instrument id="P3-I39"><instrument-name>Snare</instrument-name></score-instrument>
<score-instrument id="P3-I43"><instrument-name>Hi-Hat Closed</instrument-name></score-instrument>
<midi-instrument id="P3-I37"><midi-channel>10</midi-channel><midi-unpitched>37</midi-unpitched></midi-instrument>
<midi-instrument id="P3-I39"><midi-channel>10</midi-channel><midi-unpitched>39</midi-unpitched></midi-instrument>
<midi-instrument id="P3-I43"><midi-channel>10</midi-channel><midi-unpitched>43</midi-unpitched></midi-instrument>
</score-part>
</part-list>
${part('P1', '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>' + staffDetails(GTR_TUNING), guitarBar, true)}
${part('P2', '<clef><sign>F</sign><line>4</line></clef>' + staffDetails(BASS_TUNING), bassBar, false)}
${part('P3', '<clef><sign>percussion</sign></clef>', drumBar, false)}
</score-partwise>`;
}

// 최소 ZIP writer (MXL 컨테이너용, deflate)
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nb = Buffer.from(name);
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nb, comp);
    centrals.push(ch, nb);
    offset += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const settings = new at.Settings();
const write = (name, bytes) => fs.writeFileSync(new URL(name, out), bytes);

const xmlA = musicXml('TB0 Fixture A', 32, false);
const xmlB = musicXml('TB0 Fixture B', 136, true);
write('B.xml', xmlB);
write('B.mxl', zip([
  ['META-INF/container.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')],
  ['score.musicxml', Buffer.from(xmlB)],
]));
const scoreA = at.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xmlA), settings);
write('A.gp', new at.exporter.Gp7Exporter().export(scoreA, settings));
write('broken.gp', fs.readFileSync(new URL('A.gp', out)).subarray(0, 64)); // 손상 입력

for (const f of ['A.gp', 'B.xml', 'B.mxl']) {
  const s = at.importer.ScoreLoader.loadScoreFromBytes(fs.readFileSync(new URL(f, out)), settings);
  const tempos = s.masterBars.filter((m) => m.tempoAutomations?.length).map((m) => `${m.index + 1}:${m.tempoAutomations.map((t) => t.value).join('/')}`);
  const ts = [...new Set(s.masterBars.map((m) => `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`))];
  const tracks = s.tracks.map((t) => `${t.name}(tab ${t.staves[0].showTablature}/${t.staves[0].tuning.length}str, prog ${t.playbackInfo.program}, ch ${t.playbackInfo.primaryChannel}, perc ${t.isPercussion})`);
  console.log(f, '| bars', s.masterBars.length, '| tracks', tracks.join(', '), '| tempo', tempos.join(' '), '| ts', ts.join(','));
}
