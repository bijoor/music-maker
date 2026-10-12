// Gliding along the keys: where a sliding finger is, as a pitch.
export interface LineKey { el: HTMLElement; x: number; pitch: number }

/**
 * The keys a finger can glide along from `el`, left to right by centre: every key of the piano (black and
 * white, including ones outside the scale: a glide passes through them), or the struck scale pad's row.
 */
export function keyLine(el: HTMLElement): LineKey[] {
  const row = el.closest('.kb, .padrow');
  if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>('.wk, .bk, .spad')]
    .map((k) => { const r = k.getBoundingClientRect(); return { el: k, x: r.left + r.width / 2, pitch: Number(k.dataset.pitch) }; })
    .filter((k) => Number.isFinite(k.pitch))
    .sort((a, b) => a.x - b.x);
}

/** Pitch at horizontal position `x`: linear between neighbouring key centres, continuing past the ends. */
export function pitchAlong(line: LineKey[], x: number): { pitch: number; nearest: LineKey } {
  const nearest = line.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  if (line.length < 2) return { pitch: nearest.pitch, nearest };
  let i = line.findIndex((k) => k.x > x) - 1;
  if (i < 0) i = x < line[0].x ? 0 : line.length - 2;
  const a = line[i], b = line[i + 1];
  return { pitch: a.pitch + ((x - a.x) / (b.x - a.x)) * (b.pitch - a.pitch), nearest };
}
