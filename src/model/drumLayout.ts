// Drum view layouts: an Indian kit drawn as its two heads (bass on the left), each split into areas — rim, middle
// ring, syahi (or centre patch) and syahi centre — and each area into segments that play a stroke. Layouts can be
// edited and are kept per device; these are the defaults.
import { INDIAN_KITS, getMyKits, kitVoices } from './kit';

export type Part = 'rim' | 'middle' | 'syahi' | 'centre';
export const PARTS: Part[] = ['rim', 'middle', 'syahi', 'centre'];

/** One drum head. Sizes are fractions of the head's radius; the syahi may sit off centre (dx, dy). */
export interface Head {
  /** Radius relative to the larger head (1); no longer used for drawing: both heads are drawn the same size. */
  size: number;
  /** Inner edge of the rim. */
  rim: number;
  syahi: { dx: number; dy: number; r: number };
  /** Radius of the syahi centre (0: none). */
  centre: number;
  /** Strokes (kit voices) of each area's segments; segment 1 is centred on the top, the rest follow clockwise. '' = nothing. */
  parts: Record<Part, string[]>;
}
export type DrumLayout = [Head, Head];

const head = (size: number, rim: number, syahi: Head['syahi'], centre: number, parts: Record<Part, string[]>): Head => ({ size, rim, syahi, centre, parts });

/** Default layouts for the Indian kits. */
export const DEFAULT_LAYOUTS: Record<string, DrumLayout> = {
  Tabla: [
    head(1, 0.79, { dx: 0, dy: -0.32, r: 0.28 }, 0, { rim: ['tabla_ge', 'tabla_gha'], middle: ['tabla_ghe', 'tabla_gha'], syahi: ['tabla_ke', 'tabla_kat'], centre: [] }),
    head(0.78, 0.72, { dx: 0, dy: 0, r: 0.55 }, 0.18, { rim: ['tabla_tak', 'tabla_ta', 'tabla_dha'], middle: ['tabla_tak', 'tabla_te', 'tabla_te2'], syahi: ['tabla_tun', 'tabla_tin', 'tabla_te', 'tabla_dhin'], centre: ['tabla_te2'] }),
  ],
  Mridangam: [
    head(1, 0.84, { dx: 0, dy: 0, r: 0.4 }, 0, { rim: ['thom'], middle: ['gumki'], syahi: ['tha', 'ki'], centre: [] }),
    head(0.9, 0.82, { dx: 0, dy: 0, r: 0.46 }, 0.16, { rim: ['nam', 'chaapu', 'ardha'], middle: ['dhin', 'na'], syahi: ['ta', 'dhi', 'ka'], centre: ['dhum'] }),
  ],
};

/**
 * A starting layout for a recorded kit: left-hand strokes on the left head, right-hand ones on the right, spread
 * over the rim, middle and syahi in order (both-hands strokes go to the right head's centre area).
 */
export function generatedLayout(bank: string): DrumLayout {
  const voices = kitVoices(bank);
  const spread = (list: string[], centre: string[]): Record<Part, string[]> => {
    const parts: Record<Part, string[]> = { rim: [], middle: [], syahi: [], centre };
    list.forEach((v, i) => parts[(['rim', 'middle', 'syahi'] as Part[])[i % 3]].push(v));
    for (const p of ['rim', 'middle', 'syahi'] as Part[]) if (!parts[p].length) parts[p] = [''];
    return parts;
  };
  const left = voices.filter((k) => k.hand === 'left').map((k) => k.voice);
  const right = voices.filter((k) => k.hand !== 'left' && k.hand !== 'both').map((k) => k.voice);
  const both = voices.filter((k) => k.hand === 'both').map((k) => k.voice);
  return [
    head(1, 0.85, { dx: 0, dy: -0.35, r: 0.36 }, 0, spread(left, [])),
    head(0.8, 0.8, { dx: 0, dy: 0, r: 0.48 }, both.length ? 0.17 : 0, spread(right, both.slice(0, 1))),
  ];
}

/** Whether a kit can be shown as a drum (an Indian kit, or a recorded kit on this device). */
export const hasDrumView = (bank?: string) => !!bank && (bank in INDIAN_KITS || (bank.startsWith('my:') && getMyKits().some((k) => `my:${k.id}` === bank)));

const KEY = 'music-maker:drumLayouts';
function stored(): Record<string, DrumLayout> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

/** The layout for a kit: the one edited on this device, else the default (or one made from a recorded kit's hands). */
export function layoutFor(bank: string): DrumLayout {
  const own = stored()[bank];
  if (own) return own;
  return structuredClone(DEFAULT_LAYOUTS[bank] ?? generatedLayout(bank));
}

/** Keep an edited layout on this device (null: back to the default). */
export function saveLayout(bank: string, layout: DrumLayout | null) {
  const all = stored();
  if (layout) all[bank] = layout;
  else delete all[bank];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* this session only */ }
}

// ---------- Geometry (in the drawing's own units) ----------

/** The drawing's size: 520 high, as wide as the space it fills (at least 700). */
export interface View { w: number; h: number }
export const VIEW: View = { w: 1000, h: 520 };
export const viewFor = (width: number, height: number): View => ({ w: Math.max(700, Math.round((VIEW.h * width) / Math.max(1, height))), h: VIEW.h });
export interface Circle { cx: number; cy: number; R: number }

/** Room under each head for its name. */
const NAME_ROOM = 36;
/** Where the two heads sit: the same size, as big as the space allows, centred in each half (bass on the left). */
export function headCircles(view: View = VIEW): [Circle, Circle] {
  const R = Math.min((view.h - NAME_ROOM) / 2 - 6, view.w / 4 - 14);
  const cy = (view.h - NAME_ROOM) / 2 + 2;
  return [{ cx: view.w / 4, cy, R }, { cx: (view.w * 3) / 4, cy, R }];
}

const TAU = Math.PI * 2;
/** Angle clockwise from the top, as a fraction of a turn. */
const turnOf = (dx: number, dy: number) => (Math.atan2(dx, -dy) / TAU + 1) % 1;

export interface Hit {
  head: 0 | 1;
  part: Part;
  seg: number;
  /** Position across the area's band (for a sweet spot), and the band's inner and outer edge. */
  frac: number;
  band: [number, number];
}

/** Which head, area and segment a point is on, or null. */
export function hitTest(layout: DrumLayout, x: number, y: number, view: View = VIEW): Hit | null {
  const cs = headCircles(view);
  for (const h of [0, 1] as const) {
    const hd = layout[h], c = cs[h];
    const dx = x - c.cx, dy = y - c.cy, d = Math.hypot(dx, dy);
    if (d > c.R) continue;
    const sx = c.cx + hd.syahi.dx * c.R, sy = c.cy + hd.syahi.dy * c.R, sr = hd.syahi.r * c.R;
    const sdx = x - sx, sdy = y - sy, sd = Math.hypot(sdx, sdy);
    let part: Part, frac: number, band: [number, number];
    if (hd.centre > 0 && sd <= hd.centre * c.R) { part = 'centre'; frac = sd / (hd.centre * c.R); band = [0, 1]; }
    else if (sd <= sr) { part = 'syahi'; frac = sd / sr; band = [hd.centre > 0 ? hd.centre / hd.syahi.r : 0, 1]; }
    else if (d >= hd.rim * c.R) { part = 'rim'; frac = d / c.R; band = [hd.rim, 1]; }
    else { part = 'middle'; frac = d / c.R; band = [0, hd.rim]; }
    const n = Math.max(1, hd.parts[part].length);
    const around = part === 'syahi' || part === 'centre' ? turnOf(sdx, sdy) : turnOf(dx, dy);
    const seg = Math.min(n - 1, Math.floor(((around + 0.5 / n) % 1) * n));
    return { head: h, part, seg, frac, band };
  }
  return null;
}

/** An SVG path for a segment: a ring (or disc) between radii, from turn t0 to t1. */
export function segmentPath(cx: number, cy: number, rOut: number, rIn: number, t0: number, t1: number): string {
  const p = (r: number, t: number) => `${cx + r * Math.sin(t * TAU)} ${cy - r * Math.cos(t * TAU)}`;
  if (t1 - t0 >= 0.999) {
    const ring = (r: number) => `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    return rIn > 0 ? `${ring(rOut)} ${ring(rIn)}` : ring(rOut);
  }
  const big = t1 - t0 > 0.5 ? 1 : 0;
  if (rIn <= 0) return `M ${cx} ${cy} L ${p(rOut, t0)} A ${rOut} ${rOut} 0 ${big} 1 ${p(rOut, t1)} Z`;
  return `M ${p(rOut, t0)} A ${rOut} ${rOut} 0 ${big} 1 ${p(rOut, t1)} L ${p(rIn, t1)} A ${rIn} ${rIn} 0 ${big} 0 ${p(rIn, t0)} Z`;
}

/** Velocity for a hit with a sweet spot: full at the middle of the area's band, softer toward its edges. */
export function sweetVelocity(hit: Hit): number {
  const [a, b] = hit.band, mid = (a + b) / 2, half = Math.max(0.01, (b - a) / 2);
  return Math.max(0.3, 1 - 0.7 * Math.min(1, Math.abs(hit.frac - mid) / half));
}

/** Two strokes on the two heads that together make a recorded bol (tabla: Na or Ta + Ge = Dha, Tin + Ge = Dhin). */
export const COMBOS: [string, string, string][] = [['tabla_na', 'tabla_ge', 'tabla_dha'], ['tabla_ta', 'tabla_ge', 'tabla_dha'], ['tabla_tin', 'tabla_ge', 'tabla_dhin']];
