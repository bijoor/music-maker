// Each stroke of a kit has a base level (per device), so loud bass strokes can sit under the treble ones and both
// hands together do not overload the output. 1 = as recorded.
import { DEFAULT_LEVELS_DB } from './kit';

const KEY = 'music-maker:strokeLevels';
type Levels = Record<string, Record<string, number>>;
function stored(): Levels {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

/** A stroke's base level: the one set on this device, else the kit's default. */
export function strokeLevel(bank: string | undefined, voice: string): number {
  const own = stored()[bank ?? 'RolandTR909']?.[voice];
  if (own !== undefined) return own;
  const db = DEFAULT_LEVELS_DB[voice];
  return db === undefined ? 1 : 10 ** (db / 20);
}

export function setStrokeLevel(bank: string, voice: string, level: number) {
  const all = stored();
  all[bank] = { ...all[bank], [voice]: level };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this session only */ }
}
