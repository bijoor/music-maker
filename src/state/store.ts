// App state: the song (saved, source of truth) plus UI and transport state (not saved).
import { create } from 'zustand';
import { produce } from 'immer';
import { demoSong } from '../model/demo';
import { emptyHits, newId, track as makeTrack, defaultFx } from '../model/build';
import { DRUM_PRESETS, INSTRUMENTS } from '../model/presets';
import { MAX_SLOTS, STEPS_PER_BAR, type Bars, type Clip, type ScaleDef, type Song, type Track } from '../model/types';
import { toggleNote as toggleNoteIn, writeNote } from '../model/clipEdit';
import { findScale, scalePitch } from '../model/scales';
import { loadNumber, loadSong, saveNumber, saveSong } from './persist';

export type TransportState = 'stopped' | 'loading' | 'playing';
export type EditorView = 'grid' | 'play';
export type KeyboardLayout = 'piano' | 'pads';
export type Mode = 'perform' | 'record' | 'edit';

interface Selection {
  trackId: string;
  slot: number | null;
}

interface State {
  song: Song;
  transport: TransportState;
  /** Bar at which each track's latest launch takes effect (for the "queued" look). */
  pendingAt: Record<string, number>;
  selected: Selection;
  view: EditorView;
  /** Bar of the selected clip shown in the grid. */
  page: number;
  codeOpen: boolean;
  /** Show Sa Re Ga labels instead of letter names. */
  sargam: boolean;
  keyboard: KeyboardLayout;
  keyboardOctaves: 1 | 2;
  scaleLock: boolean;
  /** Length in steps of notes added in the grid, and of chords placed there. */
  noteLen: number;
  chordLen: number;
  /** Step (within the clip) where Edit mode places the next note, and where chords go in the grid. */
  cursor: number;
  mode: Mode;
  /** Recording snaps to this many steps (1 = 1/16, 2 = 1/8, 4 = 1/4). */
  quantize: number;
  countIn: boolean;
  metronome: boolean;
  /** This device's calibrated recording delay in ms (positive: taps register late). Saved per device. */
  recordOffsetMs: number;
  /** Undo history of the song's content (launches, mute and volume are not undone). */
  past: Song[];
  future: Song[];
  /** Consecutive edits with the same group (e.g. one recording pass) undo together. */
  historyGroup: string | null;
  /** A short message shown briefly (e.g. "Count-in…"). */
  message: string | null;

  // Song settings
  setBpm(bpm: number): void;
  setTonic(tonic: string): void;
  setScale(scaleId: string): void;
  resetSong(): void;
  addCustomScale(scale: Omit<ScaleDef, 'id' | 'group'>): void;

  // Tracks
  addTrack(instrument: number): void;
  removeTrack(trackId: string): void;
  setGain(trackId: string, gain: number): void;
  setBank(trackId: string, bank: string): void;
  toggleMute(trackId: string): void;
  toggleSolo(trackId: string): void;
  addSlot(trackId: string): void;
  setSound(trackId: string, sound: string): void;
  setOctave(trackId: string, octave: number): void;

  // Launching
  tapSlot(trackId: string, slot: number): void;
  stopTrack(trackId: string): void;
  stopAllTracks(): void;

  // Clips
  select(trackId: string, slot: number | null): void;
  createClip(trackId: string, slot: number, bars: Bars): void;
  deleteClip(trackId: string, slot: number): void;
  duplicateClip(trackId: string, slot: number): number | null;
  clearClip(trackId: string, slot: number): void;
  setClipBars(trackId: string, slot: number, bars: Bars): void;
  toggleHit(trackId: string, slot: number, voice: string, step: number): boolean;
  applyPreset(trackId: string, slot: number, preset: string, bar: number): void;
  toggleNote(trackId: string, slot: number, step: number, pitch: number): boolean;
  placeChord(trackId: string, slot: number, step: number, pitches: number[]): void;

  // UI
  setView(view: EditorView): void;
  setPage(page: number): void;
  toggleCode(): void;
  setUi(ui: Partial<Pick<State, 'sargam' | 'keyboard' | 'keyboardOctaves' | 'scaleLock' | 'noteLen' | 'chordLen' | 'cursor' | 'quantize' | 'countIn' | 'metronome'>>): void;
  setMode(mode: Mode): void;
  /** Recording: add a drum hit or a note (held notes are written again with a longer length on release). */
  recordHit(trackId: string, slot: number, voice: string, step: number, group: string): void;
  recordNote(trackId: string, slot: number, step: number, pitches: number[], len: number, group: string): void;
  undo(): void;
  redo(): void;
  setMessage(message: string | null): void;
  setRecordOffset(ms: number): void;
  setTransport(t: TransportState): void;
  setPending(trackId: string, at: number | null): void;
}

const findTrack = (song: Song, id: string) => song.tracks.find((t) => t.id === id);

/** Apply an immer recipe to one track of the song. */
const onTrack = (id: string, recipe: (t: Track, song: Song) => void) => (s: State) => ({
  song: produce(s.song, (song) => {
    const t = findTrack(song, id);
    if (t) recipe(t, song);
  }),
});

const newClip = (t: Track, bars: Bars): Clip => {
  const n = t.slots.filter(Boolean).length + 1;
  return t.kind === 'drums'
    ? { kind: 'drums', id: newId('c'), name: `Beat ${n}`, bars, hits: emptyHits(bars) }
    : { kind: 'melodic', id: newId('c'), name: `Clip ${n}`, bars, notes: [] };
};

const initial = loadSong() ?? demoSong();

/** Keep what is playing and the mix as they are now when undoing content: undo should not launch or mute anything. */
function keepLive(target: Song, current: Song): Song {
  return produce(target, (song) => {
    for (const t of song.tracks) {
      const now = current.tracks.find((c) => c.id === t.id);
      if (!now) { t.active = []; continue; }
      t.active = now.active.filter((i) => t.slots[i]);
      t.mute = now.mute;
      t.solo = now.solo;
      t.fx.gain = now.fx.gain;
    }
  });
}

export const useStore = create<State>((set, get) => {
  /** Apply a content change and record the previous song for undo. */
  const edit = (recipe: (s: State) => Partial<State>, group?: string) =>
    set((s) => {
      const out = recipe(s);
      if (!out.song || out.song === s.song) return out;
      const merge = !!group && group === s.historyGroup;
      return { ...out, past: merge ? s.past : [...s.past.slice(-49), s.song], future: [], historyGroup: group ?? null };
    });

  return {
  song: initial,
  transport: 'stopped',
  pendingAt: {},
  selected: { trackId: initial.tracks[0]?.id ?? '', slot: initial.tracks[0]?.active[0] ?? null },
  view: 'grid',
  page: 0,
  codeOpen: false,
  sargam: false,
  keyboard: 'piano',
  keyboardOctaves: 2,
  scaleLock: true,
  noteLen: 2,
  chordLen: 8,
  cursor: 0,
  mode: 'perform',
  quantize: 1,
  countIn: true,
  metronome: false,
  recordOffsetMs: loadNumber('recordOffsetMs', 0),
  past: [],
  future: [],
  historyGroup: null,
  message: null,

  setBpm: (bpm) => set((s) => ({ song: { ...s.song, bpm: Math.min(200, Math.max(60, Math.round(bpm))) } })),
  setTonic: (tonic) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, tonic } } })),
  setScale: (scaleId) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, scaleId } } })),
  addCustomScale: (scale) =>
    set((s) => {
      const id = newId('scale');
      return { song: produce(s.song, (song) => { song.customScales.push({ ...scale, id, group: 'Custom' }); song.key.scaleId = id; }) };
    }),
  resetSong: () => {
    const song = demoSong();
    set({ song, selected: { trackId: song.tracks[0].id, slot: 0 }, page: 0, past: [], future: [], historyGroup: null });
  },

  addTrack: (i) => {
    const p = INSTRUMENTS[i];
    const id = newId('t');
    edit((s) => ({
      song: produce(s.song, (song) => {
        const t = makeTrack({ id, name: p.name, kind: p.kind, color: p.color, bank: p.bank, sound: p.sound, octave: p.octave, poly: p.poly, fx: defaultFx() });
        if (p.drone) {
          // A one-bar clip holding the scale's drone notes (Sa–Pa, or Sa–Ma for ragas like Malkauns).
          const scale = findScale(song);
          const pitches = (scale.drone ?? [0, 7]).map((d) => scalePitch(scale, song.key.tonic, d, p.octave));
          t.slots[0] = { kind: 'melodic', id: newId('c'), name: 'Drone', bars: 1, notes: [{ step: 0, len: STEPS_PER_BAR, pitches, vel: 1 }] };
          t.fx.gain = 0.6;
        }
        song.tracks.push(t);
      }),
      selected: { trackId: id, slot: p.drone ? 0 : null },
    }));
  },
  removeTrack: (trackId) =>
    edit((s) => {
      const song = produce(s.song, (d) => { d.tracks = d.tracks.filter((t) => t.id !== trackId); });
      const selected = s.selected.trackId === trackId ? { trackId: song.tracks[0]?.id ?? '', slot: null } : s.selected;
      return { song, selected };
    }),
  setGain: (trackId, gain) => set(onTrack(trackId, (t) => { t.fx.gain = Math.round(gain * 100) / 100; })),
  setBank: (trackId, bank) => set(onTrack(trackId, (t) => { t.bank = bank; })),
  toggleMute: (trackId) => set(onTrack(trackId, (t) => { t.mute = !t.mute; })),
  toggleSolo: (trackId) => set(onTrack(trackId, (t) => { t.solo = !t.solo; })),
  addSlot: (trackId) => set(onTrack(trackId, (t) => { if (t.slots.length < MAX_SLOTS) t.slots.push(null); })),
  setSound: (trackId, sound) => set(onTrack(trackId, (t) => { t.sound = sound; })),
  setOctave: (trackId, octave) => set(onTrack(trackId, (t) => { t.octave = Math.min(6, Math.max(1, octave)); })),

  tapSlot: (trackId, slot) => {
    set(onTrack(trackId, (t) => {
      if (!t.slots[slot]) return;
      const alone = t.active.length === 1 && t.active[0] === slot;
      t.active = alone ? [] : [slot];
    }));
    get().select(trackId, slot);
  },
  stopTrack: (trackId) => set(onTrack(trackId, (t) => { t.active = []; })),
  stopAllTracks: () => set((s) => ({ song: produce(s.song, (song) => { song.tracks.forEach((t) => (t.active = [])); }) })),

  select: (trackId, slot) => set((s) => (s.selected.trackId === trackId && s.selected.slot === slot ? {} : { selected: { trackId, slot }, page: 0 })),
  createClip: (trackId, slot, bars) => {
    edit(onTrack(trackId, (t) => { t.slots[slot] = newClip(t, bars); }));
    get().select(trackId, slot);
  },
  deleteClip: (trackId, slot) =>
    edit(onTrack(trackId, (t) => {
      t.slots[slot] = null;
      t.active = t.active.filter((i) => i !== slot);
    })),
  duplicateClip: (trackId, slot) => {
    const t = findTrack(get().song, trackId);
    const free = t ? t.slots.findIndex((c) => !c) : -1;
    const target = free >= 0 ? free : t && t.slots.length < MAX_SLOTS ? t.slots.length : -1;
    if (!t || target < 0 || !t.slots[slot]) return null;
    edit(onTrack(trackId, (d) => {
      const src = d.slots[slot]!;
      const copy = JSON.parse(JSON.stringify(src)) as Clip;
      copy.id = newId('c');
      copy.name = `${src.name} 2`;
      d.slots[target] = copy;
    }));
    get().select(trackId, target);
    return target;
  },
  clearClip: (trackId, slot) =>
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind === 'drums') c.hits = emptyHits(c.bars);
      else if (c) c.notes = [];
    })),
  setClipBars: (trackId, slot, bars) =>
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (!c || c.bars === bars) return;
      const n = bars * STEPS_PER_BAR, old = c.bars * STEPS_PER_BAR;
      // Growing repeats the existing bars; shrinking keeps the first bars.
      if (c.kind === 'drums') {
        for (const v in c.hits) c.hits[v] = Array.from({ length: n }, (_, i) => c.hits[v][i % old] ?? 0);
      } else {
        const keep = c.notes.filter((x) => x.step < Math.min(n, old));
        const extra = [];
        for (let off = old; off < n; off += old) extra.push(...keep.filter((x) => x.step + off < n).map((x) => ({ ...x, step: x.step + off })));
        c.notes = [...keep, ...extra];
      }
      c.bars = bars;
    })),
  toggleHit: (trackId, slot, voice, step) => {
    let on = false;
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind !== 'drums') return;
      if (!c.hits[voice]) c.hits[voice] = Array(c.bars * STEPS_PER_BAR).fill(0);
      on = !(c.hits[voice][step] > 0);
      c.hits[voice][step] = on ? 1 : 0;
    }));
    return on;
  },
  applyPreset: (trackId, slot, preset, bar) =>
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      const p = DRUM_PRESETS[preset];
      if (c?.kind !== 'drums' || !p) return;
      const off = bar * STEPS_PER_BAR;
      for (const v in c.hits) for (let i = 0; i < STEPS_PER_BAR; i++) c.hits[v][off + i] = 0;
      for (const v in p) {
        if (!c.hits[v]) c.hits[v] = Array(c.bars * STEPS_PER_BAR).fill(0);
        p[v].forEach((i) => (c.hits[v][off + i] = 1));
      }
    })),

  toggleNote: (trackId, slot, step, pitch) => {
    let on = false;
    const len = get().noteLen;
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind === 'melodic') on = toggleNoteIn(c, step, pitch, len, t.poly);
    }));
    return on;
  },
  placeChord: (trackId, slot, step, pitches) => {
    const len = get().chordLen;
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind === 'melodic') writeNote(c, step, pitches, len);
    }));
  },

  setUi: (ui) => set(ui),
  setView: (view) => set({ view }),
  setPage: (page) => set({ page }),
  toggleCode: () => set((s) => ({ codeOpen: !s.codeOpen })),
  setTransport: (transport) => set({ transport }),
  setPending: (trackId, at) =>
    set((s) => {
      const pendingAt = { ...s.pendingAt };
      if (at === null) delete pendingAt[trackId];
      else pendingAt[trackId] = at;
      return { pendingAt };
    }),

  setMode: (mode) => set({ mode }),
  setMessage: (message) => set({ message }),
  setRecordOffset: (ms) => {
    const v = Math.round(Math.max(-200, Math.min(300, ms)));
    saveNumber('recordOffsetMs', v);
    set({ recordOffsetMs: v });
  },
  recordHit: (trackId, slot, voice, step, group) =>
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind !== 'drums') return;
      if (!c.hits[voice]) c.hits[voice] = Array(c.bars * STEPS_PER_BAR).fill(0);
      c.hits[voice][step] = 1;
    }), group),
  recordNote: (trackId, slot, step, pitches, len, group) =>
    edit(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind === 'melodic') writeNote(c, step, pitches, len, t.poly);
    }), group),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return { song: keepLive(prev, s.song), past: s.past.slice(0, -1), future: [s.song, ...s.future].slice(0, 50), historyGroup: null };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      return { song: keepLive(next, s.song), past: [...s.past, s.song].slice(-50), future: s.future.slice(1), historyGroup: null };
    }),
  };
});

// Autosave the song (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.song === prev.song) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSong(s.song), 400);
});

export const selectedTrack = (s: State) => findTrack(s.song, s.selected.trackId);
export const selectedClip = (s: State) => {
  const t = selectedTrack(s);
  return t && s.selected.slot !== null ? t.slots[s.selected.slot] ?? null : null;
};
