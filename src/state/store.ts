// App state: the song (saved, source of truth) plus UI and transport state (not saved).
import { create } from 'zustand';
import { produce } from 'immer';
import { demoSong } from '../model/demo';
import { emptyHits, newId, track as makeTrack, defaultFx } from '../model/build';
import { drumPresets, INSTRUMENTS, type InstrumentPreset, type KeyboardSetup } from '../model/presets';
import { groupKeyboard, groupOf, keyboardOf, setGroupKeyboard, trackName } from '../model/groups';
import { kitHas, type MyKit } from '../model/kit';
import { loadMyKits, onMyKits } from './myKits';
import { MAX_SLOTS, STEPS_PER_BAR, type Bars, type Clip, type Fx, type ScaleDef, type Song, type Track } from '../model/types';
import { setBend as setBendIn, toggleNote as toggleNoteIn, writeNote } from '../model/clipEdit';
import { currentScene, lineOf, otherScenesUsing, pruneLine, setLine } from '../model/lines';
import { findScale, scalePitch } from '../model/scales';
import { deleteSongById, listSongs, loadCurrent, loadNumber, loadSongById, saveNumber, saveSongById } from './persist';

export type TransportState = 'stopped' | 'loading' | 'playing';
export type EditorView = 'grid' | 'play';
export type Mode = 'perform' | 'record' | 'edit';
/** What the bottom area shows instead of the clip editor (no pop-up dialogs). */
export type Panel = 'code' | 'song' | 'scale' | 'calibrate' | 'songs' | 'about' | 'recorder';

interface Selection {
  trackId: string;
  slot: number | null;
}

interface State {
  song: Song;
  /** Which saved song is open (its key in local storage). */
  songId: string;
  transport: TransportState;
  /** Bar at which each track's latest launch takes effect (for the "queued" look). */
  pendingAt: Record<string, number>;
  selected: Selection;
  view: EditorView;
  /** Bar of the selected clip shown in the grid. */
  page: number;
  /** Panel shown in the bottom area instead of the clip editor; null = clip editor. */
  panel: Panel | null;
  /** The recorded kit the sample recorder is editing (null: a new kit). */
  recorderKit: string | null;
  /** Kits recorded on this device. */
  myKits: MyKit[];
  /** Show Sa Re Ga labels instead of letter names. */
  sargam: boolean;
  /** Show the sound controls strip in the clip editor. */
  soundOpen: boolean;
  scaleLock: boolean;
  /** Sustain pedal: notes keep ringing after their key is let go, until it is turned off (keys always sound while held). */
  sustain: boolean;
  /**
   * Velocity from where a key or pad is struck (per device): 1 = louder towards the bottom edge, -1 = louder
   * towards the top, 0 = off (always full).
   */
  touchVelocity: number;
  /** Sliding: when the finger stops on a key, the pitch settles onto that key (per device; off = free bends). */
  pitchSnap: boolean;
  /** Slides: movement smaller than this many pixels counts as the finger standing still (per device). */
  slideStill: number;
  /** Indian and recorded kits: played as pads or as the drum's heads (per device). */
  drumView: 'pads' | 'drum';
  /** Drum view: velocity by depth across each area, and by tap force from the motion sensor (per device). */
  drumDepth: boolean;
  drumForce: boolean;
  /** The editor takes the whole screen below the transport (the clips are hidden). */
  expanded: boolean;
  /** Slide: moving a held finger sideways glides the pitch; off, it plays each key it reaches (per device). */
  glide: boolean;
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
  /** Chain mode: tapping a slot adds it to the track's sequence instead of playing it alone. */
  chain: boolean;
  /** Play the song arrangement instead of the clips each track has active. */
  songMode: boolean;
  /** This device's calibrated recording delay in ms (positive: taps register late). Saved per device. */
  recordOffsetMs: number;
  /** Undo history of the song's content (launches, mute and volume are not undone). */
  past: Song[];
  future: Song[];
  /** Consecutive edits with the same group (e.g. one recording pass) undo together. */
  historyGroup: string | null;
  /** A short message shown briefly (e.g. "Count-in…"). */
  message: string | null;
  /** Set when a new version of the app is ready; calling it switches to the new version. */
  updateReady: (() => void) | null;

  // Song settings
  setBpm(bpm: number): void;
  setTonic(tonic: string): void;
  setScale(scaleId: string): void;
  resetSong(): void;
  // Song library (local storage) and files
  /** Start a new song: blank (no tracks), or with an empty drum kit, bass and piano. */
  newSong(blank?: boolean): void;
  openSong(id: string): void;
  duplicateSong(): void;
  deleteSong(id: string): void;
  renameSong(name: string): void;
  importSong(song: Song): void;
  addCustomScale(scale: Omit<ScaleDef, 'id' | 'group'>): void;

  // Tracks
  /**
   * Add a track from a group (by index into GROUPS, or the group itself): named after the group, in its colour,
   * with its instrument (or `bank`, e.g. a recorded kit) and keyboard.
   */
  addTrack(group: number | InstrumentPreset, bank?: string): void;
  /** Change a melodic track's keyboard; it also becomes its group's default for new tracks. */
  setTrackKeyboard(trackId: string, keyboard: Partial<KeyboardSetup>): void;
  removeTrack(trackId: string): void;
  setGain(trackId: string, gain: number): void;
  /** Change a track's effects (cutoff, reverb, delay, pan, volume); not undoable, like a mixer. */
  setFx(trackId: string, fx: Partial<Fx>): void;
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
  /** Bend into the note starting at `step` from `bend` semitones away (0 / null clears), sliding over `time` seconds. */
  setBend(trackId: string, slot: number, step: number, bend: number | null, time?: number): void;
  placeChord(trackId: string, slot: number, step: number, pitches: number[]): void;

  // UI
  setView(view: EditorView): void;
  setPage(page: number): void;
  setPanel(panel: Panel | null): void;
  /** Open the sample recorder on a recorded kit, or on a new one (null). */
  openRecorder(kitId: string | null): void;
  /** Replace the song with one read back from edited code (one undo step). */
  applySong(song: Song): void;
  /** Drop a clip's hand-written code and play its grid notes again. */
  resetClipCode(trackId: string, slot: number): void;
  resetPlayCode(trackId: string): void;
  toggleCode(): void;
  setUi(ui: Partial<Pick<State, 'soundOpen' | 'sargam' | 'scaleLock' | 'sustain' | 'noteLen' | 'chordLen' | 'cursor' | 'quantize' | 'countIn' | 'metronome'>>): void;
  setMode(mode: Mode): void;
  /** Recording: add a drum hit or a note (held notes are written again with a longer length on release). */
  recordHit(trackId: string, slot: number, voice: string, step: number, group: string, vel?: number): void;
  recordNote(trackId: string, slot: number, step: number, pitches: number[], len: number, group: string, bend?: { bend: number; time: number }, vel?: number): void;
  undo(): void;
  redo(): void;
  setMessage(message: string | null): void;
  setRecordOffset(ms: number): void;
  setTouchVelocity(v: number): void;
  setPitchSnap(on: boolean): void;
  setSlideStill(px: number): void;
  setDrumView(v: 'pads' | 'drum'): void;
  setDrumDepth(on: boolean): void;
  setDrumForce(on: boolean): void;
  setExpanded(on: boolean): void;
  setGlide(on: boolean): void;
  /** Set the velocity (0–1) of the note starting at `step`. */
  setNoteVelocity(trackId: string, slot: number, step: number, vel: number): void;

  // Chains, scenes, song
  setChain(on: boolean): void;
  saveScene(name: string, includeSilent: boolean): void;
  /** Start a new scene: a copy of what plays now (without off steps), which becomes the current scene. */
  newScene(): void;
  /** Make a scene current: its tracks' lines play from the next bar (tracks it does not name are silent). */
  launchScene(sceneId: string): void;
  /** Shorter tracks in a scene: repeat and cut at the top ('cut') or keep cycling ('cycle'). */
  setSceneFit(sceneId: string, fit: 'cut' | 'cycle'): void;
  /** A track's line in the current scene: repeat count, on/off, order, remove, add a clip at the end. */
  setStepTimes(trackId: string, index: number, times: number): void;
  toggleStep(trackId: string, index: number): void;
  moveStep(trackId: string, index: number, by: number): void;
  removeStep(trackId: string, index: number): void;
  addStep(trackId: string, slot: number): void;
  /** Play another of the track's clips in a step of its line. */
  setStepClip(trackId: string, index: number, slot: number): void;
  /** A new empty clip at the end of a track's line (in the next free slot), selected for recording or editing. */
  appendClip(trackId: string, bars: Bars): void;
  /** Make sure a clip plays in its track's line: turn its step on, or add it at the end. */
  playInLine(trackId: string, slot: number): void;
  /**
   * Bar the current scene started on: every track's line lines up with it (runtime, not saved). null: the scene
   * was just chosen and starts on the next bar the player launches on (the player fills this in).
   */
  sceneOrigin: number | null;
  setSceneOrigin(bar: number): void;
  updateScene(sceneId: string, includeSilent: boolean): void;
  renameScene(sceneId: string, name: string): void;
  renameTrack(trackId: string, name: string): void;
  renameClip(trackId: string, slot: number, name: string): void;
  deleteScene(sceneId: string): void;
  setSongMode(on: boolean): void;
  addSongStep(sceneId: string, bars?: number): void;
  setSongStep(index: number, change: { sceneId?: string; bars?: number }): void;
  moveSongStep(index: number, by: number): void;
  removeSongStep(index: number): void;
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

/**
 * The slot to edit for a clip: the clip itself, or — when the current scene plays it and an earlier scene does
 * too — a copy in a free slot that takes its place in the current scene, so the earlier scene keeps sounding as it
 * was. (When the track has no free slot the clip is edited where it is.)
 */
function ownSlot(song: Song, t: Track, slot: number): number {
  if (!t.active.includes(slot) && !t.line?.some((x) => x.slot === slot)) return slot;
  if (!otherScenesUsing(song, t.id, slot).length) return slot;
  let free = t.slots.findIndex((c) => !c);
  if (free < 0) {
    if (t.slots.length >= MAX_SLOTS) return slot;
    t.slots.push(null);
    free = t.slots.length - 1;
  }
  t.slots[free] = { ...JSON.parse(JSON.stringify(t.slots[slot])), id: newId('c') }; // (a draft: copy plainly)
  setLine(t, lineOf(t).map((x) => (x.slot === slot ? { ...x, slot: free } : x)));
  const scene = currentScene(song);
  if (scene) scene.active[t.id] = [...t.active];
  return free;
}

/** Apply an immer recipe to one clip, copying it first if an earlier scene also plays it (see ownSlot). */
const onClip = (id: string, slot: number, recipe: (c: Clip, t: Track, song: Song) => void) => (s: State) => {
  let used = slot;
  const song = produce(s.song, (song) => {
    const t = findTrack(song, id);
    if (!t?.slots[slot]) return;
    used = ownSlot(song, t, slot);
    recipe(t.slots[used]!, t, song);
  });
  const follow = used !== slot && s.selected.trackId === id && s.selected.slot === slot;
  return follow ? { song, selected: { trackId: id, slot: used } } : { song };
};

const newClip = (t: Track, bars: Bars): Clip => {
  const n = t.slots.filter(Boolean).length + 1;
  return t.kind === 'drums'
    ? { kind: 'drums', id: newId('c'), name: `Beat ${n}`, bars, hits: emptyHits(bars) }
    : { kind: 'melodic', id: newId('c'), name: `Clip ${n}`, bars, notes: [] };
};

const stored = loadCurrent(() => newId('song'));
const initialId = stored?.id ?? newId('song');
/**
 * Every song has a scene being built: a song without scenes gets Scene 1 (what plays now); a song whose scenes
 * include one matching what plays now continues in it. (Otherwise there is none until a scene is chosen.)
 */
export function withCurrentScene(song: Song): Song {
  if (song.current && song.scenes.some((s) => s.id === song.current)) return song;
  return produce(song, (d) => {
    const now = captureScene(d, true);
    const match = d.scenes.find((sc) => d.tracks.every((t) => (sc.active[t.id] ?? []).join() === now[t.id].join()));
    if (match) { d.current = match.id; return; }
    if (!d.scenes.length) {
      const id = newId('s');
      d.scenes.push({ id, name: 'Scene 1', active: now });
      d.current = id;
    }
  });
}

const initial = withCurrentScene(stored?.song ?? demoSong());

/** A new song: blank (no tracks at all), or a drum kit, a bass and a piano, all empty. */
function emptySong(blank = false): Song {
  const n = listSongs().length + 1;
  return {
    version: 1, name: `Song ${n}`, bpm: 100, key: { tonic: 'C', scaleId: 'minor' }, customScales: [], scenes: [], arrangement: [],
    tracks: blank ? [] : [
      makeTrack({ id: newId('t'), name: 'Drums', kind: 'drums', color: '#e8590c', bank: 'RolandTR909' }),
      makeTrack({ id: newId('t'), name: 'Bass', kind: 'melodic', color: '#2f9e44', sound: 'gm_synth_bass_1', octave: 2 }),
      makeTrack({ id: newId('t'), name: 'Keys', kind: 'melodic', color: '#1c7ed6', sound: 'piano', octave: 3, poly: true }),
    ],
  };
}

/** Open a song: save it under its id, clear undo and selection, leave song mode. */
function switchTo(set: (p: Partial<State>) => void, id: string, song: Song) {
  song = withCurrentScene(song);
  saveSongById(id, song);
  const first = song.tracks[0]?.slots.findIndex(Boolean) ?? -1;
  set({ song, songId: id, songMode: false, sceneOrigin: 0, selected: { trackId: song.tracks[0]?.id ?? '', slot: first >= 0 ? first : null }, page: 0, past: [], future: [], historyGroup: null, panel: null });
}

/** What every track is playing now; silent tracks are included as [] (the scene then stops them) if asked. */
function captureScene(song: Song, includeSilent: boolean): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const t of song.tracks) if (t.active.length || includeSilent) out[t.id] = [...t.active];
  return out;
}

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
  songId: initialId,
  transport: 'stopped',
  pendingAt: {},
  selected: { trackId: initial.tracks[0]?.id ?? '', slot: initial.tracks[0]?.active[0] ?? null },
  view: 'grid',
  page: 0,
  panel: null,
  recorderKit: null,
  sceneOrigin: 0,
  myKits: loadMyKits(),
  sargam: false,
  soundOpen: false,
  scaleLock: true,
  sustain: false,
  noteLen: 2,
  chordLen: 8,
  cursor: 0,
  mode: 'perform',
  quantize: 1,
  countIn: true,
  metronome: false,
  recordOffsetMs: loadNumber('recordOffsetMs', 0),
  touchVelocity: loadNumber('touchVelocity', 1),
  pitchSnap: loadNumber('pitchSnap', 1) === 1,
  slideStill: loadNumber('slideStill', 8),
  drumView: loadNumber('drumView', 1) === 1 ? 'drum' : 'pads',
  drumDepth: loadNumber('drumDepth', 0) === 1,
  drumForce: loadNumber('drumForce', 0) === 1,
  expanded: loadNumber('expanded', 0) === 1,
  glide: loadNumber('glide', 0) === 1,
  chain: false,
  songMode: false,
  past: [],
  future: [],
  historyGroup: null,
  message: null,
  updateReady: null,

  setBpm: (bpm) => set((s) => ({ song: { ...s.song, bpm: Math.min(200, Math.max(60, Math.round(bpm))) } })),
  setTonic: (tonic) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, tonic } } })),
  setScale: (scaleId) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, scaleId } } })),
  addCustomScale: (scale) =>
    set((s) => {
      const id = newId('scale');
      return { song: produce(s.song, (song) => { song.customScales.push({ ...scale, id, group: 'Custom' }); song.key.scaleId = id; }) };
    }),
  newSong: (blank = false) => switchTo(set, newId('song'), emptySong(blank)),
  openSong: (id) => { const song = loadSongById(id); if (song) switchTo(set, id, song); },
  duplicateSong: () => { const s = get(); switchTo(set, newId('song'), { ...structuredClone(s.song), name: `${s.song.name} copy` }); },
  deleteSong: (id) => {
    deleteSongById(id);
    if (get().songId !== id) { set({}); return; }
    const next = listSongs()[0];
    const song = next && loadSongById(next.id);
    if (next && song) switchTo(set, next.id, song); else switchTo(set, newId('song'), demoSong());
  },
  renameSong: (name) => set((s) => ({ song: { ...s.song, name: name.trim() || s.song.name } })),
  importSong: (song) => switchTo(set, newId('song'), song),
  resetSong: () => {
    const song = withCurrentScene(demoSong());
    set({ song, songMode: false, selected: { trackId: song.tracks[0].id, slot: 0 }, page: 0, past: [], future: [], historyGroup: null });
  },

  addTrack: (i, bank) => {
    const p = typeof i === 'number' ? INSTRUMENTS[i] : i;
    const id = newId('t');
    edit((s) => ({
      song: produce(s.song, (song) => {
        const t = makeTrack({
          id, name: trackName(p, song.tracks), group: p.id, kind: p.kind, color: p.color, bank: bank ?? p.bank, sound: p.sound, octave: p.octave, poly: p.poly, fx: defaultFx(),
          ...(p.kind === 'melodic' ? { keyboard: groupKeyboard(p) } : {}),
        });
        if (p.drone) {
          // A one-bar clip holding the scale's drone notes (Sa–Pa, or Sa–Ma for ragas like Malkauns).
          const scale = findScale(song);
          const pitches = (scale.drone ?? [0, 7]).map((d) => scalePitch(scale, song.key.tonic, d, p.octave));
          t.slots[0] = { kind: 'melodic', id: newId('c'), name: 'Clip 1', bars: 1, notes: [{ step: 0, len: STEPS_PER_BAR, pitches, vel: 1 }] };
          // Each bar's notes fade in as the last bar's ring out, so the drone never stops at the bar line.
          t.fx = { ...t.fx, gain: 0.6, attack: 0.4, release: 2 };
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
  setTrackKeyboard: (trackId, keyboard) =>
    set(onTrack(trackId, (t) => {
      t.keyboard = { ...keyboardOf(t), ...keyboard };
      setGroupKeyboard(groupOf(t).id, t.keyboard);
    })),
  setGain: (trackId, gain) => set(onTrack(trackId, (t) => { t.fx.gain = Math.round(gain * 100) / 100; })),
  setFx: (trackId, fx) =>
    set(onTrack(trackId, (t) => {
      for (const [k, v] of Object.entries(fx) as [keyof Fx, number | undefined][]) {
        if (v === undefined) delete t.fx[k];
        else t.fx[k] = Math.round(v * 100) / 100;
      }
    })),
  setBank: (trackId, bank) => set(onTrack(trackId, (t) => { t.bank = bank; })),
  toggleMute: (trackId) => set(onTrack(trackId, (t) => { t.mute = !t.mute; })),
  toggleSolo: (trackId) => set(onTrack(trackId, (t) => { t.solo = !t.solo; })),
  addSlot: (trackId) => set(onTrack(trackId, (t) => { if (t.slots.length < MAX_SLOTS) t.slots.push(null); })),
  setSound: (trackId, sound) => set(onTrack(trackId, (t) => { t.sound = sound; })),
  setOctave: (trackId, octave) => set(onTrack(trackId, (t) => { t.octave = Math.min(6, Math.max(1, octave)); })),

  tapSlot: (trackId, slot) => {
    const chain = get().chain;
    if (get().songMode) set({ songMode: false });
    set(onTrack(trackId, (t) => {
      if (!t.slots[slot]) return;
      // Chain: add the slot to the track's sequence (A, A, A, C…). Otherwise play it alone, or stop it.
      if (chain) { t.active = [...t.active, slot]; return; }
      const alone = t.active.length === 1 && t.active[0] === slot;
      t.active = alone ? [] : [slot];
    }));
    get().select(trackId, slot);
  },
  // Stopping turns a track's steps off: the line stays visible (until another scene is chosen) to turn back on.
  stopTrack: (trackId) => set(onTrack(trackId, (t) => setLine(t, lineOf(t).map((x) => ({ ...x, off: true }))))),
  stopAllTracks: () => set((s) => ({ song: produce(s.song, (song) => { song.tracks.forEach((t) => setLine(t, lineOf(t).map((x) => ({ ...x, off: true })))); }) })),

  select: (trackId, slot) => set((s) => (s.selected.trackId === trackId && s.selected.slot === slot ? {} : { selected: { trackId, slot }, page: 0 })),
  createClip: (trackId, slot, bars) => {
    edit(onTrack(trackId, (t) => { t.slots[slot] = newClip(t, bars); }));
    get().select(trackId, slot);
  },
  deleteClip: (trackId, slot) =>
    edit(onTrack(trackId, (t) => {
      const line = lineOf(t).filter((x) => x.slot !== slot);
      t.slots[slot] = null;
      setLine(t, line);
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
    edit(onClip(trackId, slot, (c) => {
      if (c.kind === 'drums') c.hits = emptyHits(c.bars);
      else c.notes = [];
    })),
  setClipBars: (trackId, slot, bars) =>
    edit(onClip(trackId, slot, (c) => {
      if (c.bars === bars) return;
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
    edit(onClip(trackId, slot, (c) => {
      if (c.kind !== 'drums') return;
      if (!c.hits[voice]) c.hits[voice] = Array(c.bars * STEPS_PER_BAR).fill(0);
      on = !(c.hits[voice][step] > 0);
      c.hits[voice][step] = on ? 1 : 0;
    }));
    return on;
  },
  applyPreset: (trackId, slot, preset, bar) =>
    edit(onClip(trackId, slot, (c, t) => {
      const p = drumPresets(t.bank)[preset];
      if (c.kind !== 'drums' || !p) return;
      const off = bar * STEPS_PER_BAR;
      for (const v in c.hits) if (kitHas(t.bank, v)) for (let i = 0; i < STEPS_PER_BAR; i++) c.hits[v][off + i] = 0;
      for (const v in p) {
        if (!c.hits[v]) c.hits[v] = Array(c.bars * STEPS_PER_BAR).fill(0);
        p[v].forEach((i) => (c.hits[v][off + i] = 1));
      }
    })),

  toggleNote: (trackId, slot, step, pitch) => {
    let on = false;
    const len = get().noteLen;
    edit(onClip(trackId, slot, (c, t) => {
      if (c.kind === 'melodic') on = toggleNoteIn(c, step, pitch, len, t.poly);
    }));
    return on;
  },
  setBend: (trackId, slot, step, bend, time) =>
    edit(onClip(trackId, slot, (c) => {
      if (c.kind === 'melodic') setBendIn(c, step, bend, time);
    })),
  placeChord: (trackId, slot, step, pitches) => {
    const len = get().chordLen;
    edit(onClip(trackId, slot, (c) => {
      if (c.kind === 'melodic') writeNote(c, step, pitches, len);
    }));
  },

  setUi: (ui) => set(ui),
  setView: (view) => set({ view }),
  setPage: (page) => set({ page }),
  setPanel: (panel) => set({ panel }),
  openRecorder: (kitId) => set({ panel: 'recorder', recorderKit: kitId }),
  applySong: (song) =>
    edit((s) => {
      const t = song.tracks.find((x) => x.id === s.selected.trackId) ?? song.tracks[0];
      const slot = t && s.selected.slot !== null && t.slots[s.selected.slot] ? s.selected.slot : null;
      return { song, selected: { trackId: t?.id ?? '', slot } };
    }),
  resetClipCode: (trackId, slot) => edit(onClip(trackId, slot, (c) => { delete c.code; })),
  resetPlayCode: (trackId) => edit(onTrack(trackId, (t) => { delete t.playCode; })),
  toggleCode: () => set((s) => ({ panel: s.panel === 'code' ? null : 'code' })),
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
  setChain: (chain) => set({ chain }),
  saveScene: (name, includeSilent) =>
    edit((s) => ({
      song: produce(s.song, (song) => {
        song.scenes.push({ id: newId('s'), name: name.trim() || `Scene ${song.scenes.length + 1}`, active: captureScene(song, includeSilent) });
      }),
    })),
  newScene: () =>
    edit((s) => ({
      songMode: false,
      song: produce(s.song, (song) => {
        // Off steps belong to the scene being left; the new scene starts from what is heard.
        song.tracks.forEach(pruneLine);
        const id = newId('s');
        const names = song.scenes.map((x) => x.name);
        let n = song.scenes.length + 1;
        while (names.includes(`Scene ${n}`)) n++;
        song.scenes.push({ id, name: `Scene ${n}`, active: captureScene(song, true), ...(currentScene(song)?.fit ? { fit: currentScene(song)!.fit } : {}) });
        song.current = id;
      }),
    })),
  launchScene: (sceneId) =>
    set((s) => {
      const scene = s.song.scenes.find((x) => x.id === sceneId);
      if (!scene) return {};
      return {
        songMode: false,
        // The scene's tracks line up with the bar it starts on (filled in by the player when it launches them).
        sceneOrigin: null,
        song: produce(s.song, (song) => {
          song.current = sceneId;
          for (const t of song.tracks) {
            pruneLine(t);
            t.active = (scene.active[t.id] ?? []).filter((i) => t.slots[i]);
          }
        }),
      };
    }),
  setSceneOrigin: (bar) => set({ sceneOrigin: bar }),
  setSceneFit: (sceneId, fit) =>
    edit((s) => ({ song: produce(s.song, (song) => { const sc = song.scenes.find((x) => x.id === sceneId); if (sc) { if (fit === 'cycle') sc.fit = fit; else delete sc.fit; } }) })),
  setStepTimes: (trackId, index, times) =>
    set(onTrack(trackId, (t) => { const line = lineOf(t); if (line[index]) { line[index] = { ...line[index], times: Math.min(64, Math.max(1, times)) }; setLine(t, line); } })),
  toggleStep: (trackId, index) =>
    set(onTrack(trackId, (t) => { const line = lineOf(t); if (line[index]) { line[index] = { ...line[index], off: !line[index].off }; setLine(t, line); } })),
  moveStep: (trackId, index, by) =>
    set(onTrack(trackId, (t) => {
      const line = [...lineOf(t)], to = index + by;
      if (!line[index] || to < 0 || to >= line.length) return;
      [line[index], line[to]] = [line[to], line[index]];
      setLine(t, line);
    })),
  removeStep: (trackId, index) =>
    set(onTrack(trackId, (t) => setLine(t, lineOf(t).filter((_, i) => i !== index)))),
  appendClip: (trackId, bars) => {
    let slot = -1;
    edit(onTrack(trackId, (t) => {
      slot = t.slots.findIndex((c) => !c);
      if (slot < 0) {
        if (t.slots.length >= MAX_SLOTS) return;
        t.slots.push(null);
        slot = t.slots.length - 1;
      }
      t.slots[slot] = newClip(t, bars);
      setLine(t, [...lineOf(t), { slot, times: 1 }]);
    }));
    if (slot >= 0) get().select(trackId, slot);
    else get().setMessage(`A track holds up to ${MAX_SLOTS} clips; remove one first`);
  },
  playInLine: (trackId, slot) =>
    set(onTrack(trackId, (t) => {
      if (!t.slots[slot] || t.active.includes(slot)) return;
      const line = lineOf(t);
      const i = line.findIndex((x) => x.slot === slot);
      setLine(t, i >= 0 ? line.map((x, k) => (k === i ? { ...x, off: false } : x)) : [...line, { slot, times: 1 }]);
    })),
  setStepClip: (trackId, index, slot) =>
    set(onTrack(trackId, (t) => { const line = lineOf(t); if (line[index] && t.slots[slot]) { line[index] = { ...line[index], slot }; setLine(t, line); } })),
  addStep: (trackId, slot) =>
    set(onTrack(trackId, (t) => { if (t.slots[slot]) setLine(t, [...lineOf(t), { slot, times: 1 }]); })),
  updateScene: (sceneId, includeSilent) =>
    edit((s) => ({
      song: produce(s.song, (song) => {
        const scene = song.scenes.find((x) => x.id === sceneId);
        if (scene) scene.active = captureScene(song, includeSilent);
      }),
    })),
  renameTrack: (trackId, name) =>
    edit(onTrack(trackId, (t) => { if (name.trim()) t.name = name.trim(); })),
  renameClip: (trackId, slot, name) =>
    edit(onTrack(trackId, (t) => { const c = t.slots[slot]; if (c && name.trim()) c.name = name.trim(); })),
  renameScene: (sceneId, name) =>
    edit((s) => ({ song: produce(s.song, (song) => { const sc = song.scenes.find((x) => x.id === sceneId); if (sc && name.trim()) sc.name = name.trim(); }) })),
  deleteScene: (sceneId) =>
    edit((s) => ({
      song: produce(s.song, (song) => {
        song.scenes = song.scenes.filter((x) => x.id !== sceneId);
        song.arrangement = song.arrangement.filter((st) => st.sceneId !== sceneId);
      }),
    })),
  setSongMode: (songMode) => set((s) => ({ songMode: songMode && s.song.arrangement.length > 0 })),
  addSongStep: (sceneId, bars = 8) => edit((s) => ({ song: produce(s.song, (song) => { song.arrangement.push({ sceneId, bars }); }) })),
  setSongStep: (index, change) =>
    edit((s) => ({
      song: produce(s.song, (song) => {
        const st = song.arrangement[index];
        if (!st) return;
        if (change.sceneId) st.sceneId = change.sceneId;
        if (change.bars !== undefined) st.bars = Math.max(1, Math.min(64, Math.round(change.bars)));
      }),
    })),
  moveSongStep: (index, by) =>
    edit((s) => ({
      song: produce(s.song, (song) => {
        const to = index + by;
        if (to < 0 || to >= song.arrangement.length) return;
        const [st] = song.arrangement.splice(index, 1);
        song.arrangement.splice(to, 0, st);
      }),
    })),
  removeSongStep: (index) =>
    set((s) => {
      const song = produce(s.song, (d) => { d.arrangement.splice(index, 1); });
      return { song, songMode: s.songMode && song.arrangement.length > 0, past: [...s.past.slice(-49), s.song], future: [], historyGroup: null };
    }),
  setGlide: (on) => {
    saveNumber('glide', on ? 1 : 0);
    set({ glide: on });
  },
  setDrumView: (v) => { saveNumber('drumView', v === 'drum' ? 1 : 0); set({ drumView: v }); },
  setDrumDepth: (on) => { saveNumber('drumDepth', on ? 1 : 0); set({ drumDepth: on }); },
  setDrumForce: (on) => { saveNumber('drumForce', on ? 1 : 0); set({ drumForce: on }); },
  setExpanded: (on) => { saveNumber('expanded', on ? 1 : 0); set({ expanded: on }); },
  setSlideStill: (px) => {
    saveNumber('slideStill', px);
    set({ slideStill: px });
  },
  setPitchSnap: (on) => {
    saveNumber('pitchSnap', on ? 1 : 0);
    set({ pitchSnap: on });
  },
  setTouchVelocity: (v) => {
    saveNumber('touchVelocity', v);
    set({ touchVelocity: v });
  },
  setNoteVelocity: (trackId, slot, step, vel) =>
    edit(onClip(trackId, slot, (c) => {
      const n = c.kind === 'melodic' ? c.notes.find((x) => x.step === step) : undefined;
      if (n) n.vel = Math.round(Math.max(0.05, Math.min(1, vel)) * 100) / 100;
    })),
  setRecordOffset: (ms) => {
    const v = Math.round(Math.max(-200, Math.min(300, ms)));
    saveNumber('recordOffsetMs', v);
    set({ recordOffsetMs: v });
  },
  recordHit: (trackId, slot, voice, step, group, vel = 1) =>
    edit(onClip(trackId, slot, (c) => {
      if (c.kind !== 'drums') return;
      if (!c.hits[voice]) c.hits[voice] = Array(c.bars * STEPS_PER_BAR).fill(0);
      c.hits[voice][step] = Math.round(vel * 100) / 100;
    }), group),
  recordNote: (trackId, slot, step, pitches, len, group, bend, vel = 1) =>
    edit(onClip(trackId, slot, (c, t) => {
      if (c.kind !== 'melodic') return;
      writeNote(c, step, pitches, len, t.poly, vel);
      if (bend) setBendIn(c, step, bend.bend, bend.time);
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
  saveTimer = setTimeout(() => saveSongById(useStore.getState().songId, useStore.getState().song), 400);
});

export const selectedTrack = (s: State) => findTrack(s.song, s.selected.trackId);
export const selectedClip = (s: State) => {
  const t = selectedTrack(s);
  return t && s.selected.slot !== null ? t.slots[s.selected.slot] ?? null : null;
};

// The store keeps a copy of the recorded kits so menus and pads update when one is saved or deleted.
onMyKits((myKits) => useStore.setState({ myKits }));

/**
 * The current scene follows what tracks play: every change to a track's line is saved into it as it happens (not
 * as a separate undo step). Not in song mode, where the song order is playing.
 */
useStore.subscribe((s, prev) => {
  if (s.song === prev.song || s.songMode) return;
  const scene = currentScene(s.song);
  if (!scene) return;
  const now = captureScene(s.song, true);
  if (s.song.tracks.every((t) => (scene.active[t.id] ?? []).join() === now[t.id].join()) && Object.keys(scene.active).length === s.song.tracks.length) return;
  useStore.setState({ song: produce(s.song, (song) => { const sc = currentScene(song); if (sc) sc.active = now; }) });
});
