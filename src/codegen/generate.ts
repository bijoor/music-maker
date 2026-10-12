// Song model → Strudel code. Deterministic: the same song always produces the same text.
//
// Each track becomes a fenced block: one `const` per clip and a labelled line that plays the active clips.
// Every note or hit token is recorded with its character range, so played events (which carry the range of
// the token that produced them) can be mapped back to a clip and step for highlighting.
import { voiceBank, voiceOrder } from '../model/kit';
import { pitchToCode } from '../model/notes';
import { findScale } from '../model/scales';
import { STEPS_PER_BAR, type Clip, type DrumClip, type MelodicClip, type Song, type Track } from '../model/types';

export interface CodeToken {
  start: number;
  end: number;
  clipId: string;
  /** Steps (within the clip) this token plays; several when a pattern repeats, e.g. `hh*4`. */
  steps: number[];
}

export interface TrackCode {
  trackId: string;
  label: string;
  /** Range of the block in the full code. */
  start: number;
  end: number;
  /** The block as compilable code: same length as the block, with the label blanked out. */
  runnable: string;
  /** False when nothing plays: muted, silenced by solo, or no active clip. */
  audible: boolean;
  /** Bars before the active sequence repeats. */
  period: number;
}

export interface GeneratedSong {
  code: string;
  tracks: TrackCode[];
  tokens: CodeToken[];
}

const SLOT_LETTERS = 'ABCDEFGH';

class Writer {
  text = '';
  tokens: CodeToken[] = [];
  add(s: string) {
    this.text += s;
    return this;
  }
  token(s: string, clipId: string, steps: number[]) {
    const start = this.text.length;
    this.text += s;
    this.tokens.push({ start, end: this.text.length, clipId, steps });
    return this;
  }
}

/** Numbers as they read in code: .2 rather than 0.2, at most two decimals. */
export const num = (n: number) => String(Math.round(n * 100) / 100).replace(/^(-?)0\./, '$1.');

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 't$1') || 'track';

/** Unique code labels for tracks: 'drums', 'bass', and 'drums2' for a second track named Drums. */
export function trackLabels(song: Song): Map<string, string> {
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const t of song.tracks) {
    const base = slug(t.name);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.set(t.id, n === 1 ? base : `${base}${n}`);
  }
  return out;
}

export const clipVar = (label: string, slot: number) => `${label}_${SLOT_LETTERS[slot] ?? slot}`;

// ---------- Drums ----------

/** One voice's hits in one bar as compact mini-notation tokens, e.g. `bd*4`, `[~ hh]*4`, `bd ~ ~ bd ...`. */
function writeVoiceBar(w: Writer, clip: DrumClip, voice: string, bar: number) {
  const row = clip.hits[voice].slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR).map((v) => v > 0);
  // Coarsest grid that holds every hit: 1, 2, 4, 8 or 16 slots per bar.
  let res = STEPS_PER_BAR;
  for (const r of [1, 2, 4, 8]) {
    const g = STEPS_PER_BAR / r;
    if (row.every((h, i) => !h || i % g === 0)) { res = r; break; }
  }
  const g = STEPS_PER_BAR / res;
  const coarse = Array.from({ length: res }, (_, i) => row[i * g]);
  // Shortest repeating period of that grid.
  let period = res;
  for (const p of [1, 2, 4, 8, 16]) {
    if (p <= res && res % p === 0 && coarse.every((h, i) => h === coarse[i % p])) { period = p; break; }
  }
  const reps = res / period;
  const stepsOf = (i: number) => Array.from({ length: reps }, (_, r) => bar * STEPS_PER_BAR + (i + r * period) * g);
  if (reps > 1 && coarse[0] && coarse.slice(1, period).every((h) => !h)) {
    w.token(voice, clip.id, stepsOf(0)).add(`*${reps}`);
    return;
  }
  if (reps > 1) w.add('[');
  for (let i = 0; i < period; i++) {
    if (i) w.add(' ');
    if (coarse[i]) w.token(voice, clip.id, stepsOf(i));
    else w.add('~');
  }
  if (reps > 1) w.add(`]*${reps}`);
}

function writeDrumBar(w: Writer, clip: DrumClip, voices: string[], bar: number) {
  const playing = voices.filter((v) => clip.hits[v].slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR).some((x) => x > 0));
  if (!playing.length) { w.add('~'); return; }
  playing.forEach((v, i) => {
    if (i) w.add(', ');
    writeVoiceBar(w, clip, v, bar);
  });
}

function writeBars(w: Writer, bars: number, writeBar: (bar: number) => void) {
  if (bars === 1) { writeBar(0); return; }
  w.add('<');
  for (let b = 0; b < bars; b++) {
    if (b) w.add(' ');
    w.add('[');
    writeBar(b);
    w.add(']');
  }
  w.add('>');
}

function writeDrumClip(w: Writer, track: Track, clip: DrumClip) {
  const bank = track.bank ?? 'RolandTR909';
  const used = Object.keys(clip.hits).filter((v) => clip.hits[v].some((x) => x > 0)).sort((a, b) => voiceOrder(a) - voiceOrder(b));
  if (!used.length) { w.add('silence'); return; }
  // Voices the machine lacks are borrowed from another machine, as a separate layer.
  const groups = new Map<string, string[]>();
  for (const v of used) {
    const b = voiceBank(bank, v);
    groups.set(b, [...(groups.get(b) ?? []), v]);
  }
  const many = groups.size > 1;
  if (many) w.add('stack(');
  [...groups].forEach(([b, voices], i) => {
    if (i) w.add(', ');
    w.add('s("');
    writeBars(w, clip.bars, (bar) => writeDrumBar(w, clip, voices, bar));
    w.add(`").bank("${b}")`);
  });
  if (many) w.add(')');
}

// ---------- Melodic ----------

function writeMelodicBar(w: Writer, clip: MelodicClip, bar: number) {
  const start = bar * STEPS_PER_BAR, end = start + STEPS_PER_BAR;
  const byStep = new Map(clip.notes.filter((n) => n.step >= start && n.step < end && n.pitches.length).map((n) => [n.step, n]));
  let s = start, first = true;
  while (s < end) {
    if (!first) w.add(' ');
    first = false;
    const n = byStep.get(s);
    if (n) {
      const len = Math.max(1, Math.min(n.len, end - s));
      const body = n.pitches.length > 1 ? `[${n.pitches.map(pitchToCode).join(',')}]` : pitchToCode(n.pitches[0]);
      w.token(body + (len > 1 ? `@${len}` : ''), clip.id, [s]);
      s += len;
    } else {
      w.add('~');
      s++;
    }
  }
}

function writeMelodicClip(w: Writer, track: Track, clip: MelodicClip) {
  if (!clip.notes.some((n) => n.pitches.length)) { w.add('silence'); return; }
  w.add('note("');
  writeBars(w, clip.bars, (bar) => writeMelodicBar(w, clip, bar));
  w.add(`").s("${track.sound ?? 'piano'}")`);
}

function writeClip(w: Writer, track: Track, clip: Clip) {
  if (clip.kind === 'drums') writeDrumClip(w, track, clip);
  else writeMelodicClip(w, track, clip);
}

// ---------- Tracks and song ----------

/** Consecutive repeats of the same slot merge: [A, A, A, C] → [[3 bars, A], [1 bar, C]]. */
export function sections(track: Track): { slot: number; bars: number }[] {
  const out: { slot: number; bars: number }[] = [];
  for (const slot of track.active) {
    const clip = track.slots[slot];
    if (!clip) continue;
    const last = out[out.length - 1];
    if (last && last.slot === slot) last.bars += clip.bars;
    else out.push({ slot, bars: clip.bars });
  }
  return out;
}

/** The effect controls a track's line applies, in code order (also used so previews sound identical). */
export function fxControls(track: Track): [string, number][] {
  const f = track.fx;
  const out: [string, number][] = [];
  if (f.lpf !== undefined && f.lpf < 20000) out.push(['lpf', Math.round(f.lpf)]);
  if (f.room) out.push(['room', f.room]);
  if (f.delay) out.push(['delay', f.delay]);
  if (Math.abs(f.pan - 0.5) > 0.001) out.push(['pan', f.pan]);
  if (Math.abs(f.gain - 1) > 0.001) out.push(['gain', f.gain]);
  return out;
}

function writeFx(w: Writer, track: Track) {
  for (const [name, value] of fxControls(track)) w.add(`.${name}(${num(value)})`);
}

export function isAudible(song: Song, track: Track) {
  const anySolo = song.tracks.some((t) => t.solo);
  return !track.mute && (!anySolo || track.solo);
}

function writeTrack(w: Writer, song: Song, track: Track, label: string): TrackCode {
  const start = w.text.length;
  w.add(`// @track id=${track.id} name="${track.name.replace(/"/g, "'")}"\n`);
  track.slots.forEach((clip, i) => {
    if (!clip) return;
    w.add(`const ${clipVar(label, i)} = `);
    writeClip(w, track, clip);
    w.add(`  // ${clip.name} · ${clip.bars} bar${clip.bars > 1 ? 's' : ''}\n`);
  });
  const secs = sections(track);
  const audible = isAudible(song, track) && secs.length > 0;
  const shownLabel = `${isAudible(song, track) ? '' : '_'}${label}: `;
  const labelStart = w.text.length;
  w.add(shownLabel);
  if (!secs.length) w.add('silence');
  else if (secs.length === 1) w.add(clipVar(label, secs[0].slot));
  else w.add(`arrange(${secs.map((s) => `[${s.bars}, ${clipVar(label, s.slot)}]`).join(', ')})`);
  if (secs.length) writeFx(w, track);
  w.add(`\n// @end ${track.id}`);
  const end = w.text.length;
  const block = w.text.slice(start, end);
  const rel = labelStart - start;
  const runnable = block.slice(0, rel) + ' '.repeat(shownLabel.length) + block.slice(rel + shownLabel.length);
  return { trackId: track.id, label, start, end, runnable, audible, period: secs.reduce((a, s) => a + s.bars, 0) || 1 };
}

export function generate(song: Song): GeneratedSong {
  const w = new Writer();
  const scale = findScale(song);
  w.add(`// @song name="${song.name.replace(/"/g, "'")}"\n`);
  w.add(`setcpm(${num(song.bpm)}/4)\n`);
  w.add(`// key: ${song.key.tonic} ${scale.name}\n`);
  w.add('// @end song\n');
  const labels = trackLabels(song);
  const tracks: TrackCode[] = [];
  for (const t of song.tracks) {
    w.add('\n');
    tracks.push(writeTrack(w, song, t, labels.get(t.id)!));
    w.add('\n');
  }
  return { code: w.text, tracks, tokens: w.tokens };
}

/** The code for a single clip expression (used by tests and previews). */
export function clipCode(track: Track, clip: Clip): { code: string; tokens: CodeToken[] } {
  const w = new Writer();
  writeClip(w, track, clip);
  return { code: w.text, tokens: w.tokens };
}

/**
 * The token an event came from. Events carry the ranges of every string involved (the note, the .bank() name,
 * factors like *4); the note's range lies inside one token (a chord token holds several notes, `c2@2` holds c2).
 */
export function findToken(tokens: CodeToken[], locations: { start: number; end: number }[], offset = 0): CodeToken | undefined {
  for (const loc of locations) {
    const a = loc.start + offset, b = loc.end + offset;
    const tok = tokens.find((k) => a >= k.start && b <= k.end);
    if (tok) return tok;
  }
  return undefined;
}
