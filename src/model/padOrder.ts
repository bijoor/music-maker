// The pads of an Indian (or recorded) kit: one grid of rows × columns, each cell playing a stroke ('' = empty), so
// pads can sit where the fingers play them and a stroke can have more than one pad. Kept per device. By default the
// grid is five columns — left hand (two), both hands, right hand (two) — with each hand's strokes in the drum
// layout's order, from the rim inward.
import { kitVoices, type Hand, type KitVoice } from './kit';
import { PARTS, layoutFor } from './drumLayout';

export interface PadGrid { rows: number; cols: number; cells: string[] }
export const MAX_ROWS = 6;
export const MAX_COLS = 8;

const KEY = 'music-maker:padGrid';
let version = 0;
let cache: Record<string, PadGrid> | null = null;
function stored(): Record<string, PadGrid> {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { cache = {}; } }
  return cache!;
}
function save(all: Record<string, PadGrid>) {
  cache = all;
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this session only */ }
}

/** Changes whenever a grid is saved (for caches built from it, such as computer-key layouts). */
export const padOrderVersion = () => version;

/** Strokes as the drum layout places them on each head: rim, middle, syahi, centre, each from the top clockwise. */
function layoutOrder(bank: string): string[] {
  const out: string[] = [];
  for (const hd of layoutFor(bank)) for (const part of PARTS) for (const v of hd.parts[part]) if (v && !out.includes(v)) out.push(v);
  return out;
}

/** A kit's voices in the drum layout's order (others after, in kit order). */
export function orderedVoices(bank: string | undefined): KitVoice[] {
  const kit = kitVoices(bank);
  if (!bank || !kit.some((k) => k.hand)) return kit;
  const order = layoutOrder(bank);
  const rank = (v: string) => { const i = order.indexOf(v); return i < 0 ? order.length + kit.findIndex((k) => k.voice === v) : i; };
  return [...kit].sort((a, b) => rank(a.voice) - rank(b.voice));
}

/** Columns of the default grid, by hand. */
const HAND_COLS: [Hand, number][] = [['left', 2], ['both', 1], ['right', 2]];

/** Each hand's strokes as an earlier version arranged them (spots per hand), else in drum layout order. */
function handLists(bank: string): Record<Hand, string[]> {
  try {
    const earlier = JSON.parse(localStorage.getItem('music-maker:padSpots') ?? '{}')[bank];
    if (earlier) return earlier;
  } catch { /* none */ }
  const voices = orderedVoices(bank);
  return { left: [], both: [], right: [], ...Object.fromEntries((['left', 'both', 'right'] as Hand[]).map((h) => [h, voices.filter((k) => k.hand === h).map((k) => k.voice)])) };
}

function defaultGrid(bank: string): PadGrid {
  const lists = handLists(bank);
  const rows = Math.max(1, ...HAND_COLS.map(([h, n]) => Math.ceil((lists[h]?.length ?? 0) / n)));
  const cols = HAND_COLS.reduce((a, [, n]) => a + n, 0);
  const cells: string[] = Array(rows * cols).fill('');
  let c0 = 0;
  for (const [h, n] of HAND_COLS) {
    (lists[h] ?? []).forEach((v, i) => { const r = Math.floor(i / n); if (r < rows) cells[r * cols + c0 + (i % n)] = v; });
    c0 += n;
  }
  return { rows, cols, cells };
}

/** A kit's pad grid: as set on this device (strokes no longer in the kit left empty), else the default. */
export function padGrid(bank: string): PadGrid {
  const own = stored()[bank];
  if (!own) return defaultGrid(bank);
  const kit = new Set(kitVoices(bank).map((k) => k.voice));
  return { ...own, cells: Array.from({ length: own.rows * own.cols }, (_, i) => (own.cells[i] && kit.has(own.cells[i]) ? own.cells[i] : '')) };
}

/** Give a pad a stroke ('' empties it). */
export function setCell(bank: string, i: number, voice: string) {
  const g = padGrid(bank);
  g.cells[i] = voice;
  save({ ...stored(), [bank]: g });
}

/** Change the grid's size, keeping each pad at its row and column. */
export function resizeGrid(bank: string, rows: number, cols: number) {
  const g = padGrid(bank);
  rows = Math.max(1, Math.min(MAX_ROWS, rows));
  cols = Math.max(1, Math.min(MAX_COLS, cols));
  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return r < g.rows && c < g.cols ? g.cells[r * g.cols + c] : '';
  });
  save({ ...stored(), [bank]: { rows, cols, cells } });
}

/** Back to the default. */
export function resetPadOrder(bank: string) {
  const all = { ...stored() };
  delete all[bank];
  save(all);
}
