// Edited code → song. Each track block is parsed with acorn; every clip expression is compiled with Strudel and
// the events it actually plays are read back into grid notes. Anything the grid can show becomes a normal clip
// again (even code written differently, such as `.fast(2)`); anything else is kept verbatim as custom code.
import * as acorn from 'acorn';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { kitHas, voiceBank } from '../model/kit';
import { emptyHits, newId } from '../model/build';
import { MAX_SLOTS, STEPS_PER_BAR, type Bars, type Clip, type Fx, type Note, type Song, type Track } from '../model/types';
import { DEFAULT_BEND_TIME, clipCode, trackLabels } from './generate';

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

/** An event's velocity as the grid stores it (1 = full), or null when it is not one the grid can show. */
function velocityOf(v: Record<string, unknown>): number | null {
  if (v.velocity === undefined) return 1;
  const x = Number(v.velocity);
  return Number.isFinite(x) && x > 0 && x <= 1 ? Math.round(x * 100) / 100 : null;
}

function toDrums(evs: Ev[], bars: Bars, track: Track): Record<string, number[]> | null {
  const bank = track.bank ?? 'RolandTR909';
  const hits = emptyHits(bars);
  for (const e of evs.filter((x) => x.b < bars)) {
    if (!onGrid(e.b) || Object.keys(e.v).some((k) => !['s', 'n', 'bank', 'velocity'].includes(k)) || typeof e.v.s !== 'string') return null;
    const vel = velocityOf(e.v);
    if (vel === null) return null;
    const voice = e.v.n ? `${e.v.s}:${e.v.n}` : e.v.s;
    // The grid always writes the track's machine (or the machine it borrows from, or none for an Indian kit);
    // anything else would change the sound.
    if (!kitHas(bank, voice) || (e.v.bank ?? '') !== voiceBank(bank, voice)) return null;
    hits[voice] ??= Array(bars * STEPS_PER_BAR).fill(0);
    hits[voice][Math.round(e.b * STEPS_PER_BAR)] = vel;
  }
  return hits;
}

function toNotes(evs: Ev[], bars: Bars, track: Track): Note[] | null {
  const byStep = new Map<number, Note>();
  for (const e of evs.filter((x) => x.b < bars)) {
    if (!onGrid(e.b) || !onGrid(e.d) || Object.keys(e.v).some((k) => !['note', 's', 'penv', 'pattack', 'velocity'].includes(k))) return null;
    const vel = velocityOf(e.v);
    if (vel === null) return null;
    if (e.v.s !== track.sound) return null;
    const pitch = typeof e.v.note === 'number' ? e.v.note : typeof e.v.note === 'string' ? core.noteToMidi(e.v.note) : NaN;
    if (!Number.isFinite(pitch)) return null;
    const step = Math.round(e.b * STEPS_PER_BAR), len = Math.round(e.d * STEPS_PER_BAR);
    if (len < 1 || (step % STEPS_PER_BAR) + len > STEPS_PER_BAR) return null; // notes never cross a bar line
    // A bend is the pitch envelope: penv semitones below the note (the grid's bend is its negative).
    const penv = e.v.penv === undefined ? 0 : Number(e.v.penv), pattack = e.v.pattack === undefined ? undefined : Number(e.v.pattack);
    if (!Number.isFinite(penv) || (pattack !== undefined && !(pattack >= 0))) return null;
    const bend = penv ? -penv : undefined;
    const n = byStep.get(step);
    if (n && (n.len !== len || n.vel !== vel || n.bend !== bend || (bend && n.bendTime !== pattack))) return null; // a chord's notes share one length, velocity and bend
    if (n) n.pitches.push(pitch);
    else byStep.set(step, { step, len, pitches: [pitch], vel, ...(bend ? { bend, bendTime: pattack ?? DEFAULT_BEND_TIME } : {}) });
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

/**
 * A track's chain as the launcher writes it: 'silence', 'drums_A', or 'arrange([3, drums_A], [1, drums_C])'.
 * Returns the slots in turn, or null if the text is something else.
 */
function readChain(text: string, track: Track): number[] | null {
  const t = text.trim();
  if (t === 'silence') return [];
  const ref = /^[A-Za-z0-9_$]+_([A-H])$/.exec(t);
  if (ref) return track.slots[LETTERS.indexOf(ref[1])] ? [LETTERS.indexOf(ref[1])] : null;
  const arr = /^arrange\(([\s\S]*)\)$/.exec(t);
  if (!arr) return null;
  const entry = /\[\s*(\d+)\s*,\s*[A-Za-z0-9_$]+_([A-H])\s*\]/g;
  if (arr[1].replace(entry, '').replace(/[\s,]/g, '') !== '') return null;
  const seq: number[] = [];
  for (const m of arr[1].matchAll(entry)) {
    const slot = LETTERS.indexOf(m[2]), clip = track.slots[slot];
    if (!clip || +m[1] % clip.bars) return null;
    for (let i = 0; i < +m[1] / clip.bars; i++) seq.push(slot);
  }
  return seq;
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
  const active = readChain(core_, track);
  if (active) {
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
  readScenes(code, out, notes, errors);
  return { song: out, notes, errors };
}

/**
 * The scenes block and song order. Scenes match the existing ones by position, so renaming one keeps it (and
 * its place in the song); extra scenes are added and missing ones deleted. A missing block leaves scenes as they are.
 */
function readScenes(code: string, song: Song, notes: string[], errors: string[]) {
  const labels = trackLabels(song);
  const byLabel = new Map([...labels].map(([id, label]) => [label, song.tracks.find((t) => t.id === id)!]));
  const block = /^\/\/ @scenes\n([\s\S]*?)^\/\/ @end scenes/m.exec(code);
  // Old names still find their scene in the song line, so renaming a scene only in the scenes block keeps it in the song.
  const oldNames = new Map(song.scenes.map((x) => [x.name, x.id]));
  if (block) {
    let ast: acorn.Program;
    try {
      ast = acorn.parse(block[1], { ecmaVersion: 2022, sourceType: 'script' });
    } catch (err) {
      errors.push(`Scenes: ${(err as Error).message}`);
      return;
    }
    const decl = ast.body.find((n): n is acorn.VariableDeclaration => n.type === 'VariableDeclaration');
    const obj = decl?.declarations[0]?.init;
    if (!obj || obj.type !== 'ObjectExpression') { errors.push('Scenes: expected const scenes = { … }'); return; }
    const scenes: Song['scenes'] = [];
    for (const prop of obj.properties) {
      if (prop.type !== 'Property') continue;
      const name = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'Literal' ? String(prop.key.value) : '';
      if (!name || prop.value.type !== 'ObjectExpression') { errors.push(`Scenes: ${name || 'an entry'} is not { track: clips }`); continue; }
      const active: Record<string, number[]> = {};
      for (const tp of prop.value.properties) {
        if (tp.type !== 'Property') continue;
        const label = tp.key.type === 'Identifier' ? tp.key.name : tp.key.type === 'Literal' ? String(tp.key.value) : '';
        const track = byLabel.get(label);
        const chain = track && readChain(block[1].slice(tp.value.start, tp.value.end), track);
        if (!track) errors.push(`Scene ${name}: no track called ${label}`);
        else if (!chain) errors.push(`Scene ${name}: ${label} must be silence, a clip (${label}_A) or arrange([...])`);
        else active[track.id] = chain;
      }
      const old = song.scenes[scenes.length];
      scenes.push({ id: old?.id ?? newId('s'), name, active });
      if (!old) notes.push(`Scene ${name}: added`);
      else if (old.name !== name) notes.push(`Scene ${old.name}: renamed to ${name}`);
      else if (JSON.stringify(old.active) !== JSON.stringify(active)) notes.push(`Scene ${name}: updated`);
    }
    for (const gone of song.scenes.slice(scenes.length)) notes.push(`Scene ${gone.name}: deleted`);
    const kept = new Set(scenes.map((x) => x.id));
    song.arrangement = song.arrangement.filter((st) => kept.has(st.sceneId));
    song.scenes = scenes;
  }
  const arr = /^\/\/ @arrangement\n([\s\S]*?)^\/\/ @end arrangement/m.exec(code);
  if (arr) {
    const line = arr[1].split('\n').map((l) => l.replace(/^\/\/\s?/, '').trim()).filter(Boolean).join(' · ');
    const steps: Song['arrangement'] = [];
    for (const part of line.split('·').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(.*?)\s+(\d+)$/.exec(part);
      const name = m?.[1].trim();
      const scene = m && (song.scenes.find((x) => x.name === name) ?? song.scenes.find((x) => x.id === oldNames.get(name!)));
      if (!m) errors.push(`Song: "${part}" should be a scene name and a bar count`);
      else if (!scene) errors.push(`Song: there is no scene called ${m[1].trim()}`);
      else steps.push({ sceneId: scene.id, bars: Math.max(1, Math.min(64, +m[2])) });
    }
    if (JSON.stringify(steps) !== JSON.stringify(song.arrangement)) notes.push('Song order updated');
    song.arrangement = steps;
  } else if (block && song.arrangement.length) {
    notes.push('Song order cleared');
    song.arrangement = [];
  }
}
