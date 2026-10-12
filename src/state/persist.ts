// Songs are kept in this browser's local storage: an index of names plus one entry per song, and which song is
// open. Files (export/import) move songs between devices.
import type { Song } from '../model/types';

const INDEX = 'music-maker:songs';
const CURRENT = 'music-maker:current';
const songKey = (id: string) => `music-maker:song:${id}`;
const LEGACY = 'music-maker:song';

export interface SongInfo { id: string; name: string; updated: number }

const read = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private browsing): keep working without saving.
  }
};

/** A song from storage or a file, if it looks like one. */
export function validSong(x: unknown): Song | null {
  const s = x as Song;
  return s && s.version === 1 && Array.isArray(s.tracks) && Array.isArray(s.scenes) && typeof s.bpm === 'number' ? s : null;
}

export function listSongs(): SongInfo[] {
  return Object.values(read<Record<string, SongInfo>>(INDEX) ?? {}).sort((a, b) => b.updated - a.updated);
}

export function loadSongById(id: string): Song | null {
  return validSong(read(songKey(id)));
}

export function saveSongById(id: string, song: Song) {
  write(songKey(id), song);
  const index = read<Record<string, SongInfo>>(INDEX) ?? {};
  index[id] = { id, name: song.name, updated: Date.now() };
  write(INDEX, index);
  write(CURRENT, id);
}

export function deleteSongById(id: string) {
  try { localStorage.removeItem(songKey(id)); } catch { /* ignore */ }
  const index = read<Record<string, SongInfo>>(INDEX) ?? {};
  delete index[id];
  write(INDEX, index);
}

/** The song that was open last (moving a song saved by an earlier version into the library). */
export function loadCurrent(newId: () => string): { id: string; song: Song } | null {
  const id = read<string>(CURRENT);
  const song = id ? loadSongById(id) : null;
  if (id && song) return { id, song };
  const legacy = validSong(read(LEGACY));
  if (legacy) {
    const nid = newId();
    saveSongById(nid, legacy);
    try { localStorage.removeItem(LEGACY); } catch { /* ignore */ }
    return { id: nid, song: legacy };
  }
  const first = listSongs()[0];
  const s = first && loadSongById(first.id);
  return first && s ? { id: first.id, song: s } : null;
}

/** Per-device settings (not part of the song). */
export function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(`music-maker:${key}`);
    return v === null || isNaN(+v) ? fallback : +v;
  } catch {
    return fallback;
  }
}

export function saveNumber(key: string, value: number) {
  try {
    localStorage.setItem(`music-maker:${key}`, String(value));
  } catch {
    // Not saved; the value still applies for this session.
  }
}
