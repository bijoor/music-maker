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
 * A slide that lands on notes (Slide on, settling on): while the finger keeps moving one way the pitch glides
 * continuously with it, through every key it passes (reaching each key's note at its centre, starting from the
 * note the movement began on, where it began). When the finger reverses, the pitch settles on the note of the key
 * it was on and a new glide starts from there; stopping settles too (the caller times that, see SETTLE_AFTER_MS).
 */
export interface Slide {
  /** Where the current movement started, and the key whose note it started from. */
  x0: number;
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
/** Seconds the pitch takes to settle on a key's note when the finger reverses. */
export const SETTLE_EASE = 0.06;

export const startSlide = (key: LineKey, x: number, t: number): Slide => ({ x0: x, key, lastX: x, lastT: t, lastOn: key, dir: 0, cur: key.pitch });

/**
 * The pitch for the finger now at `x` (time `t`) over key `on`, and how quickly to get there; updates `s`.
 * Movement smaller than `still` pixels since the last real movement counts as standing still (a resting finger
 * wobbles), so it neither bends the pitch nor counts as a change of direction; `moved` says whether it moved.
 */
export function slideTo(line: LineKey[], s: Slide, x: number, t: number, on: LineKey, still = 1): { pitch: number; ease?: number; moved: boolean } {
  const dx = x - s.lastX;
  if (Math.abs(dx) < Math.max(1, still)) return { pitch: s.cur, moved: false };
  const dir = Math.sign(dx);
  let ease: number | undefined;
  if ((s.dir && dir !== s.dir) || t - s.lastT > PAUSE_MS) {
    // A new movement: settle on the note of the key the finger was on, and glide on from there.
    s.x0 = s.lastX;
    s.key = s.lastOn;
    ease = SETTLE_EASE;
  }
  s.dir = dir;
  s.lastX = x;
  s.lastT = t;
  s.lastOn = on;
  s.cur = pitchAlong(anchors(line, s.key.el, s.x0), x);
  return { pitch: s.cur, ease, moved: true };
}

/**
 * The key a finger counts as being on, with some give at the edges: it stays on `current` until it is more than
 * `margin` pixels past current's edge, so a finger resting on a boundary does not flick between two keys. (Only
 * between keys of the same kind: on the piano, moving up onto a black key takes effect at once.)
 */
export function stickyKey(current: LineKey, next: LineKey, x: number, margin: number): LineKey {
  if (next === current || next.el.className !== current.el.className) return next;
  return x >= current.left - margin && x <= current.right + margin ? current : next;
}
