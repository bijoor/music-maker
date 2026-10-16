// The order of an Indian (or recorded) kit's pads within each hand, so pads sit where the fingers play them. Kept per
// device; by default each hand's strokes follow the drum layout, from the rim inward.
import { kitVoices, type KitVoice } from './kit';
import { PARTS, layoutFor } from './drumLayout';

const KEY = 'music-maker:padOrder';
let version = 0;
let cache: Record<string, string[]> | null = null;
function stored(): Record<string, string[]> {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { cache = {}; } }
  return cache!;
}
function save(all: Record<string, string[]>) {
  cache = all;
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this session only */ }
}

/** Changes whenever an order is saved (for caches built from the order, such as computer-key layouts). */
export const padOrderVersion = () => version;

/** Strokes as the drum layout places them on each head: rim, middle, syahi, centre, each from the top clockwise. */
function layoutOrder(bank: string): string[] {
  const out: string[] = [];
  for (const hd of layoutFor(bank)) {
    for (const part of PARTS) for (const v of [...hd.parts[part], ...(hd.closed?.[part] ?? [])]) if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** A kit's voices in pad order: the saved order, else the drum layout's, with any others after in kit order. */
export function orderedVoices(bank: string | undefined): KitVoice[] {
  const kit = kitVoices(bank);
  if (!bank || !kit.some((k) => k.hand)) return kit;
  const order = stored()[bank] ?? layoutOrder(bank);
  const rank = (v: string) => { const i = order.indexOf(v); return i < 0 ? order.length + kit.findIndex((k) => k.voice === v) : i; };
  return [...kit].sort((a, b) => rank(a.voice) - rank(b.voice));
}

/** Swap two pads' places and keep the order on this device. */
export function swapPads(bank: string, a: string, b: string) {
  const order = orderedVoices(bank).map((k) => k.voice);
  const i = order.indexOf(a), j = order.indexOf(b);
  if (i < 0 || j < 0) return;
  [order[i], order[j]] = [order[j], order[i]];
  save({ ...stored(), [bank]: order });
}

/** Back to the order from the drum layout. */
export function resetPadOrder(bank: string) {
  const all = { ...stored() };
  delete all[bank];
  save(all);
}
