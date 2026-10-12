// App state: the song (saved, source of truth) plus transport state (not saved).
import { create } from 'zustand';
import { demoSong } from '../model/demo';
import type { Song, Track } from '../model/types';

export type TransportState = 'stopped' | 'loading' | 'playing';

interface State {
  song: Song;
  transport: TransportState;
  /** Bar at which each track's latest launch takes effect (for the "queued" look). */
  pendingAt: Record<string, number>;
  codeOpen: boolean;

  setBpm(bpm: number): void;
  setTonic(tonic: string): void;
  setScale(scaleId: string): void;
  /** Tap on a slot: play that clip alone from the next bar, or stop it if it is the only one playing. */
  tapSlot(trackId: string, slot: number): void;
  stopTrack(trackId: string): void;
  stopAllTracks(): void;
  toggleMute(trackId: string): void;
  toggleSolo(trackId: string): void;
  setTransport(t: TransportState): void;
  setPending(trackId: string, at: number | null): void;
  toggleCode(): void;
}

const updateTrack = (song: Song, id: string, f: (t: Track) => Track): Song => ({
  ...song,
  tracks: song.tracks.map((t) => (t.id === id ? f(t) : t)),
});

export const useStore = create<State>((set) => ({
  song: demoSong(),
  transport: 'stopped',
  pendingAt: {},
  codeOpen: false,

  setBpm: (bpm) => set((s) => ({ song: { ...s.song, bpm: Math.min(200, Math.max(60, Math.round(bpm))) } })),
  setTonic: (tonic) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, tonic } } })),
  setScale: (scaleId) => set((s) => ({ song: { ...s.song, key: { ...s.song.key, scaleId } } })),
  tapSlot: (trackId, slot) =>
    set((s) => ({
      song: updateTrack(s.song, trackId, (t) => {
        if (!t.slots[slot]) return t;
        const alone = t.active.length === 1 && t.active[0] === slot;
        return { ...t, active: alone ? [] : [slot] };
      }),
    })),
  stopTrack: (trackId) => set((s) => ({ song: updateTrack(s.song, trackId, (t) => ({ ...t, active: [] })) })),
  stopAllTracks: () => set((s) => ({ song: { ...s.song, tracks: s.song.tracks.map((t) => ({ ...t, active: [] })) } })),
  toggleMute: (trackId) => set((s) => ({ song: updateTrack(s.song, trackId, (t) => ({ ...t, mute: !t.mute })) })),
  toggleSolo: (trackId) => set((s) => ({ song: updateTrack(s.song, trackId, (t) => ({ ...t, solo: !t.solo })) })),
  setTransport: (transport) => set({ transport }),
  setPending: (trackId, at) =>
    set((s) => {
      const pendingAt = { ...s.pendingAt };
      if (at === null) delete pendingAt[trackId];
      else pendingAt[trackId] = at;
      return { pendingAt };
    }),
  toggleCode: () => set((s) => ({ codeOpen: !s.codeOpen })),
}));
