// Gliding along the keys: where a sliding finger is, as a pitch, and which key it is on.
export interface LineKey { el: HTMLElement; x: number; left: number; right: number; pitch: number }

/**
 * The keys a finger can glide along from `el`, left to right by centre: every key of the piano (black and
 * white, including ones outside the scale: a glide passes through them), or the struck scale pad's row.
 */
export function keyLine(el: HTMLElement): LineKey[] {
  const row = el.closest('.kb, .padrow');
  if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>('.wk, .bk, .spad')]
    .map((k) => { const r = k.getBoundingClientRect(); return { el: k, x: r.left + r.width / 2, left: r.left, right: r.right, pitch: Number(k.dataset.pitch) }; })
    .filter((k) => Number.isFinite(k.pitch))
    .sort((a, b) => a.x - b.x);
}

/**
 * The glide's anchors: each key's pitch at its centre, except the struck key, whose pitch sits where the finger
 * struck — so the note starts exactly on its key and moves as soon as the finger does.
 */
export function anchors(line: LineKey[], struck: HTMLElement, x0: number): LineKey[] {
  return line.map((k) => (k.el === struck ? { ...k, x: x0 } : k)).sort((a, b) => a.x - b.x);
}

/** Pitch at horizontal position `x`: linear between neighbouring anchors, continuing past the ends. */
export function pitchAlong(line: LineKey[], x: number): number {
  if (line.length < 2) return line[0]?.pitch ?? 0;
  let i = line.findIndex((k) => k.x > x) - 1;
  if (i < 0) i = x < line[0].x ? 0 : line.length - 2;
  const a = line[i], b = line[i + 1];
  return a.x === b.x ? b.pitch : a.pitch + ((x - a.x) / (b.x - a.x)) * (b.pitch - a.pitch);
}

/**
 * The key the finger is on: `under` when the finger is over one of the line's keys (the element at its
 * position, which tells a black key from the white key beneath it), else the key spanning `x`, else the nearest.
 */
export function keyAt(line: LineKey[], x: number, under?: Element | null): LineKey {
  const hit = under && line.find((k) => k.el === under || k.el.contains(under));
  if (hit) return hit;
  const spans = line.filter((k) => x >= k.left && x < k.right);
  if (spans.length) return spans.reduce((a, b) => (b.right - b.left < a.right - a.left ? b : a)); // a black key over a white one
  return line.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
}

/**
 * A slide that lands on notes (Slide on, settling on): the pitch follows the finger only while it is still on the
 * key the current movement started from, bending toward the next key in the direction it moves and reaching that
 * key's note at its edge. Once the finger enters another key the pitch goes to that key's own note and stays there,
 * however far into the key the finger goes. A new movement — after reversing direction or stopping for a moment —
 * starts a new bend from where the finger is.
 */
export interface Slide {
  /** Where the current movement started, its pitch then, and the key it started on. */
  x0: number;
  pitch: number;
  key: LineKey;
  /** Last position, time and key seen, the direction of travel (−1, 0, 1), and the pitch now. */
  lastX: number;
  lastT: number;
  lastOn: LineKey;
  dir: number;
  cur: number;
}

/** A stop longer than this before moving again starts a new movement. */
const PAUSE_MS = 150;
/** Seconds the pitch takes to reach a key's note on entering it. */
export const ENTER_EASE = 0.06;

export const startSlide = (key: LineKey, x: number, t: number): Slide => ({ x0: x, pitch: key.pitch, key, lastX: x, lastT: t, lastOn: key, dir: 0, cur: key.pitch });

/** The pitch for the finger now at `x` (time `t`) over key `on`, and how quickly to get there; updates `s`. */
export function slideTo(line: LineKey[], s: Slide, x: number, t: number, on: LineKey): { pitch: number; ease?: number } {
  const dx = x - s.lastX;
  if (Math.abs(dx) < 1) return { pitch: s.cur };
  const dir = Math.sign(dx);
  if ((s.dir && dir !== s.dir) || t - s.lastT > PAUSE_MS) {
    // A new movement: bend from here, from the key under the finger.
    s.x0 = s.lastX;
    s.pitch = s.cur;
    s.key = s.lastOn;
  }
  s.dir = dir;
  s.lastX = x;
  s.lastT = t;
  s.lastOn = on;
  let pitch: number, ease: number | undefined;
  if (on.el !== s.key.el) {
    pitch = on.pitch;
    ease = ENTER_EASE;
  } else {
    const i = line.indexOf(s.key), next = line[i + dir];
    const edge = dir > 0 ? s.key.right : s.key.left;
    const span = Math.abs(edge - s.x0) || 1;
    const f = Math.max(0, Math.min(1, Math.abs(x - s.x0) / span));
    pitch = next ? s.pitch + f * (next.pitch - s.pitch) : s.pitch;
  }
  s.cur = pitch;
  return { pitch, ease };
}
