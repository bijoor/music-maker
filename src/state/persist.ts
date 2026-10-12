// The song is kept in this browser's local storage so work survives a reload. Saving files comes in Phase 7.
import type { Song } from '../model/types';

const KEY = 'music-maker:song';

export function loadSong(): Song | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const song = JSON.parse(raw) as Song;
    return song?.version === 1 && Array.isArray(song.tracks) ? song : null;
  } catch {
    return null;
  }
}

export function saveSong(song: Song) {
  try {
    localStorage.setItem(KEY, JSON.stringify(song));
  } catch {
    // Storage full or blocked (private browsing): keep working without saving.
  }
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
