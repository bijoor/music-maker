// App state: the song (saved, source of truth) plus UI and transport state (not saved).
import { create } from 'zustand';
import { produce } from 'immer';
import { demoSong } from '../model/demo';
import { emptyHits, newId, track as makeTrack, defaultFx } from '../model/build';
import { DRUM_PRESETS, INSTRUMENTS } from '../model/presets';
import { MAX_SLOTS, STEPS_PER_BAR, type Bars, type Clip, type Song, type Track } from '../model/types';
import { loadSong, saveSong } from './persist';

export type TransportState = 'stopped' | 'loading' | 'playing';
export type EditorView = 'grid' | 'play';

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

  // Song settings
  setBpm(bpm: number): void;
  setTonic(tonic: string): void;
  setScale(scaleId: string): void;
  resetSong(): void;

  // Tracks
  addTrack(instrument: number): void;
  removeTrack(trackId: string): void;
  setGain(trackId: string, gain: number): void;
  setBank(trackId: string, bank: string): void;
  toggleMute(trackId: string): void;
  toggleSolo(trackId: string): void;
  addSlot(trackId: string): void;

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

  // UI
  setView(view: EditorView): void;
  setPage(page: number): void;
  toggleCode(): void;
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

export const useStore = create<State>((set, get) => ({
  song: initial,
  transport: 'stopped',
  pendingAt: {},
  selected: { trackId: initial.tracks[0]?.id ?? '', slot: initial.tracks[0]?.active[0] ?? null },
  view: 'grid',
  page: 0,
  codeOpen: false,

  setBpm: (bpm) => set((s) => ({ song: { ...s.song, bpm: Math.min(200, Math.max(60, Math.round(bpm))) } })),
  setTonic: (tonic) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, tonic } } })),
  setScale: (scaleId) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, scaleId } } })),
  resetSong: () => {
    const song = demoSong();
    set({ song, selected: { trackId: song.tracks[0].id, slot: 0 }, page: 0 });
  },

  addTrack: (i) => {
    const p = INSTRUMENTS[i];
    const id = newId('t');
    set((s) => ({
      song: produce(s.song, (song) => {
        song.tracks.push(makeTrack({ id, name: p.name, kind: p.kind, color: p.color, bank: p.bank, sound: p.sound, octave: p.octave, poly: p.poly, fx: defaultFx() }));
      }),
      selected: { trackId: id, slot: null },
    }));
  },
  removeTrack: (trackId) =>
    set((s) => {
      const song = produce(s.song, (d) => { d.tracks = d.tracks.filter((t) => t.id !== trackId); });
      const selected = s.selected.trackId === trackId ? { trackId: song.tracks[0]?.id ?? '', slot: null } : s.selected;
      return { song, selected };
    }),
  setGain: (trackId, gain) => set(onTrack(trackId, (t) => { t.fx.gain = Math.round(gain * 100) / 100; })),
  setBank: (trackId, bank) => set(onTrack(trackId, (t) => { t.bank = bank; })),
  toggleMute: (trackId) => set(onTrack(trackId, (t) => { t.mute = !t.mute; })),
  toggleSolo: (trackId) => set(onTrack(trackId, (t) => { t.solo = !t.solo; })),
  addSlot: (trackId) => set(onTrack(trackId, (t) => { if (t.slots.length < MAX_SLOTS) t.slots.push(null); })),

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
    set(onTrack(trackId, (t) => { t.slots[slot] = newClip(t, bars); }));
    get().select(trackId, slot);
  },
  deleteClip: (trackId, slot) =>
    set(onTrack(trackId, (t) => {
      t.slots[slot] = null;
      t.active = t.active.filter((i) => i !== slot);
    })),
  duplicateClip: (trackId, slot) => {
    const t = findTrack(get().song, trackId);
    const free = t ? t.slots.findIndex((c) => !c) : -1;
    const target = free >= 0 ? free : t && t.slots.length < MAX_SLOTS ? t.slots.length : -1;
    if (!t || target < 0 || !t.slots[slot]) return null;
    set(onTrack(trackId, (d) => {
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
    set(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind === 'drums') c.hits = emptyHits(c.bars);
      else if (c) c.notes = [];
    })),
  setClipBars: (trackId, slot, bars) =>
    set(onTrack(trackId, (t) => {
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
    set(onTrack(trackId, (t) => {
      const c = t.slots[slot];
      if (c?.kind !== 'drums') return;
      if (!c.hits[voice]) c.hits[voice] = Array(c.bars * STEPS_PER_BAR).fill(0);
      on = !(c.hits[voice][step] > 0);
      c.hits[voice][step] = on ? 1 : 0;
    }));
    return on;
  },
  applyPreset: (trackId, slot, preset, bar) =>
    set(onTrack(trackId, (t) => {
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
}));

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
