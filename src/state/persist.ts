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
