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
