// Edited code → song. Each track block is parsed with acorn; every clip expression is compiled with Strudel and
// the events it actually plays are read back into grid notes. Anything the grid can show becomes a normal clip
// again (even code written differently, such as `.fast(2)`); anything else is kept verbatim as custom code.
import * as acorn from 'acorn';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { voiceBank } from '../model/kit';
import { emptyHits, newId } from '../model/build';
import { MAX_SLOTS, STEPS_PER_BAR, type Bars, type Clip, type Fx, type Note, type Song, type Track } from '../model/types';
import { clipCode } from './generate';

export interface ParseResult {
  song: Song;
  /** What changed, in plain words (e.g. "Drums B: now custom code"). */
  notes: string[];
  /** Problems that left a track unchanged (syntax errors, code that does not run). */
  errors: string[];
}

const LETTERS = 'ABCDEFGH';
let scope: Promise<unknown> | null = null;
const ensureScope = () => (scope ??= core.evalScope(core, mini));

interface Ev { b: number; d: number; v: Record<string, unknown> }

async function compile(text: string): Promise<any> {
  await ensureScope();
  const { pattern } = await core.evaluate(text, transpiler, {});
  if (!pattern || typeof pattern.queryArc !== 'function') throw new Error('does not make a pattern');
  return pattern;
}

function events(pattern: any, cycles: number): Ev[] {
  return pattern
    .queryArc(0, cycles)
    .filter((h: any) => h.hasOnset())
    .map((h: any) => ({ b: h.whole.begin.valueOf(), d: h.duration.valueOf(), v: typeof h.value === 'object' ? h.value : { value: h.value } }));
}

/** Smallest of 1, 2 or 4 bars after which the events repeat exactly (checked over 8 bars), or null. */
function detectBars(evs: Ev[]): Bars | null {
  const sig = (c: number) =>
    evs.filter((e) => e.b >= c && e.b < c + 1).map((e) => `${(e.b - c).toFixed(5)}|${e.d.toFixed(5)}|${JSON.stringify(e.v)}`).sort().join(';');
  const sigs = Array.from({ length: 8 }, (_, c) => sig(c));
  for (const p of [1, 2, 4] as Bars[]) if (sigs.every((s, c) => s === sigs[c % p])) return p;
  return null;
}

const onGrid = (x: number) => Math.abs(x * STEPS_PER_BAR - Math.round(x * STEPS_PER_BAR)) < 1e-6;

function toDrums(evs: Ev[], bars: Bars, track: Track): Record<string, number[]> | null {
  const bank = track.bank ?? 'RolandTR909';
  const hits = emptyHits(bars);
  for (const e of evs.filter((x) => x.b < bars)) {
    if (!onGrid(e.b) || Object.keys(e.v).some((k) => !['s', 'n', 'bank'].includes(k)) || typeof e.v.s !== 'string') return null;
    const voice = e.v.n ? `${e.v.s}:${e.v.n}` : e.v.s;
    // The grid always writes the track's machine (or the machine it borrows from); anything else would change the sound.
    if (e.v.bank !== voiceBank(bank, voice)) return null;
    hits[voice] ??= Array(bars * STEPS_PER_BAR).fill(0);
    hits[voice][Math.round(e.b * STEPS_PER_BAR)] = 1;
  }
  return hits;
}

function toNotes(evs: Ev[], bars: Bars, track: Track): Note[] | null {
  const byStep = new Map<number, Note>();
  for (const e of evs.filter((x) => x.b < bars)) {
    if (!onGrid(e.b) || !onGrid(e.d) || Object.keys(e.v).some((k) => !['note', 's'].includes(k))) return null;
    if (e.v.s !== track.sound) return null;
    const pitch = typeof e.v.note === 'number' ? e.v.note : typeof e.v.note === 'string' ? core.noteToMidi(e.v.note) : NaN;
    if (!Number.isFinite(pitch)) return null;
    const step = Math.round(e.b * STEPS_PER_BAR), len = Math.round(e.d * STEPS_PER_BAR);
    if (len < 1 || (step % STEPS_PER_BAR) + len > STEPS_PER_BAR) return null; // notes never cross a bar line
    const n = byStep.get(step);
    if (n && n.len !== len) return null; // a chord's notes share one length
    if (n) n.pitches.push(pitch);
    else byStep.set(step, { step, len, pitches: [pitch], vel: 1 });
  }
  const notes = [...byStep.values()].sort((a, b) => a.step - b.step);
  for (let i = 1; i < notes.length; i++) if (notes[i - 1].step + notes[i - 1].len > notes[i].step) return null;
  notes.forEach((n) => n.pitches.sort((a, b) => a - b));
  return notes;
}

const toBars = (n: number | undefined): Bars | undefined => (n === 1 || n === 2 || n === 4 ? n : undefined);

async function readClip(text: string, track: Track, existing: Clip | null, name?: string, barsHint?: Bars): Promise<{ clip: Clip; custom: boolean } | { error: string }> {
  // Unchanged code keeps the clip exactly as it was.
  if (existing && (existing.code ? existing.code === text : clipCode(track, existing).code === text) && (!name || name === existing.name)) return { clip: existing, custom: !!existing.code };
  let evs: Ev[];
  try {
    evs = events(await compile(text), 8);
  } catch (err) {
    return { error: (err as Error).message };
  }
  const bars = detectBars(evs);
  const id = existing?.id ?? newId('c');
  const clipName = name ?? existing?.name ?? (track.kind === 'drums' ? 'Beat' : 'Clip');
  if (bars) {
    if (track.kind === 'drums') {
      const hits = toDrums(evs, bars, track);
      if (hits) return { clip: { kind: 'drums', id, name: clipName, bars, hits }, custom: false };
    } else {
      const notes = toNotes(evs, bars, track);
      if (notes) return { clip: { kind: 'melodic', id, name: clipName, bars, notes }, custom: false };
    }
  }
  // Keep the last grid content (for "Reset to grid") and play the code as written.
  const keepBars = bars ?? barsHint ?? existing?.bars ?? 1;
  const base: Clip = existing && existing.kind === track.kind
    ? existing
    : track.kind === 'drums' ? { kind: 'drums', id, name: clipName, bars: keepBars, hits: emptyHits(keepBars) } : { kind: 'melodic', id, name: clipName, bars: keepBars, notes: [] };
  return { clip: { ...base, id, name: clipName, bars: keepBars, code: text }, custom: true };
}

/** The play line: which slots play (as the launcher would write them) and the effects; otherwise custom. */
function readPlay(text: string, label: string | undefined, track: Track, song: Song, notes: string[]) {
  const anySolo = song.tracks.some((t) => t.solo);
  if (!(anySolo && !track.solo)) track.mute = !!label?.startsWith('_');
  let core_ = text.trim();
  const fx: Fx = { gain: 1, pan: 0.5 };
  let fxFound = false;
  const fxRe = /\.(lpf|cutoff|room|delay|pan|gain)\(\s*(-?\d*\.?\d+)\s*\)\s*$/;
  for (let m = fxRe.exec(core_); m; m = fxRe.exec(core_)) {
    fxFound = true;
    const k = m[1] === 'cutoff' ? 'lpf' : (m[1] as keyof Fx);
    fx[k] = +m[2];
    core_ = core_.slice(0, m.index).trimEnd();
  }
  const ref = /^[A-Za-z0-9_$]+_([A-H])$/;
  let active: number[] | null = null;
  if (core_ === 'silence') active = [];
  else if (ref.test(core_)) active = [LETTERS.indexOf(ref.exec(core_)![1])];
  else {
    const arr = /^arrange\(([\s\S]*)\)$/.exec(core_);
    if (arr) {
      const entry = /\[\s*(\d+)\s*,\s*[A-Za-z0-9_$]+_([A-H])\s*\]/g;
      const seq: number[] = [];
      let ok = arr[1].replace(entry, '').replace(/[\s,]/g, '') === '';
      for (const m of arr[1].matchAll(entry)) {
        const slot = LETTERS.indexOf(m[2]), clip = track.slots[slot];
        if (!clip || +m[1] % clip.bars) { ok = false; break; }
        for (let i = 0; i < +m[1] / clip.bars; i++) seq.push(slot);
      }
      if (ok) active = seq;
    }
  }
  if (active && active.every((i) => track.slots[i])) {
    if (track.playCode) notes.push(`${track.name}: play line back to normal`);
    track.playCode = undefined;
    track.active = active;
    // A silent line is written without effects; keep the track's effects unless the line sets some.
    if (fxFound || active.length) track.fx = fx;
  } else {
    if (track.playCode !== text.trim()) notes.push(`${track.name}: play line kept as custom code`);
    track.playCode = text.trim();
  }
}

export async function parseCode(code: string, song: Song): Promise<ParseResult> {
  const out: Song = structuredClone(song);
  const notes: string[] = [], errors: string[] = [];

  const bpm = /setcpm\(\s*(\d+(?:\.\d+)?)\s*\/\s*4\s*\)/.exec(code);
  if (bpm) out.bpm = Math.min(200, Math.max(60, Math.round(+bpm[1])));
  const songMode = /^\/\/ song:/m.test(code);

  for (const m of code.matchAll(/^\/\/ @track id=(\S+)([^\n]*)\n([\s\S]*?)^\/\/ @end \1[ \t]*$/gm)) {
    const track = out.tracks.find((t) => t.id === m[1]);
    if (!track) { notes.push(`Block for unknown track ${m[1]} ignored`); continue; }
    const name = /name="([^"]*)"/.exec(m[2])?.[1]?.trim();
    if (name && name !== track.name) { track.name = name; notes.push(`Renamed track to ${name}`); }
    const body = m[3];
    const comments: acorn.Comment[] = [];
    let ast: acorn.Program;
    try {
      ast = acorn.parse(body, { ecmaVersion: 2022, sourceType: 'script', locations: true, onComment: comments });
    } catch (err) {
      errors.push(`${track.name}: ${(err as Error).message}`);
      continue;
    }
    const seen = new Set<number>();
    const before = structuredClone(track);
    let failed = false;
    for (const node of ast.body) {
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          const id = decl.id.type === 'Identifier' ? decl.id.name : '';
          const letter = /_([A-H])$/.exec(id)?.[1];
          if (!letter || !decl.init) { notes.push(`${track.name}: ${id || 'declaration'} ignored (clips are named like ${track.name.toLowerCase()}_A)`); continue; }
          const slot = LETTERS.indexOf(letter);
          if (slot >= MAX_SLOTS) continue;
          const comment = comments.find((c) => c.loc!.start.line === decl.loc!.end.line && c.start >= decl.end);
          const cm = comment && /^\s*(.*?)\s*·\s*(\d+)\s*bars?/.exec(comment.value);
          const text = body.slice(decl.init.start, decl.init.end);
          while (track.slots.length <= slot) track.slots.push(null);
          const res = await readClip(text, track, track.slots[slot], cm?.[1] || undefined, toBars(cm ? +cm[2] : undefined));
          if ('error' in res) { errors.push(`${track.name} ${letter}: ${res.error}`); failed = true; break; }
          const was = track.slots[slot];
          if (res.clip !== was) {
            notes.push(`${track.name} ${letter}: ${res.custom ? 'kept as custom code' : was?.code ? 'back on the grid' : was ? 'updated' : 'new clip'}`);
            track.slots[slot] = res.clip;
          }
          seen.add(slot);
        }
      } else if (node.type === 'LabeledStatement' && node.body.type === 'ExpressionStatement') {
        if (!songMode) readPlay(body.slice(node.body.start, node.body.end), node.label.name, track, out, notes);
      } else if (node.type === 'ExpressionStatement') {
        if (!songMode) readPlay(body.slice(node.start, node.end), undefined, track, out, notes);
      }
      if (failed) break;
    }
    if (failed) { Object.assign(track, before); continue; }
    track.slots.forEach((c, i) => {
      if (c && !seen.has(i)) {
        track.slots[i] = null;
        track.active = track.active.filter((x) => x !== i);
        notes.push(`${track.name} ${LETTERS[i]}: removed`);
      }
    });
  }
  return { song: out, notes, errors };
}
