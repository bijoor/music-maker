import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { kitVoices, voiceSound } from '../model/kit';
import type { Track } from '../model/types';
import { VIEW, headCircles, hitTest, layoutFor, saveLayout, segmentPath, sweetVelocity, DEFAULT_LAYOUTS, generatedLayout, type DrumLayout, type Part } from '../model/drumLayout';
import * as recorder from '../engine/recorder';
import { useStore } from '../state/store';

const HEAD_NAMES: Record<string, [string, string]> = {
  Tabla: ['Bayan · left hand', 'Dayan · right hand'],
  Mridangam: ['Thoppi · left hand', 'Valanthalai · right hand'],
};
const PART_NAMES: Record<Part, string> = { rim: 'Rim', middle: 'Middle ring', syahi: 'Syahi', centre: 'Syahi centre' };
/** Semitones a bass stroke rises over the head's radius as the finger slides toward the centre (capped at 5). */
const BEND_PER_RADIUS = 7;

/**
 * An Indian kit drawn as its two heads, bass on the left. Playing: strike an area to play its stroke (several
 * fingers at once); bass strokes that bend rise in pitch as the finger slides toward the centre. Editing (Edit
 * layout): tap an area to select it, split it into segments, give each segment a stroke, and reshape the heads.
 */
export default function DrumHeads({ track, switcher }: { track: Track; switcher?: ReactNode }) {
  const bank = track.bank!;
  const { drumSweet, setDrumSweet } = useStore();
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<DrumLayout>(() => layoutFor(bank));
  const [layoutBank, setLayoutBank] = useState(bank);
  if (layoutBank !== bank) { setLayoutBank(bank); setLayout(layoutFor(bank)); }
  const [sel, setSel] = useState<{ head: 0 | 1; part: Part; seg: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const kit = kitVoices(bank);
  const names = HEAD_NAMES[bank] ?? ['Left hand', 'Right hand'];
  const nameOf = (v: string) => kit.find((k) => k.voice === v)?.name ?? v;
  const bends = (v: string) => !!kit.find((k) => k.voice === v)?.bends;
  const circles = useMemo(() => headCircles(layout), [layout]);

  const change = (next: DrumLayout) => { setLayout(next); saveLayout(bank, next); };
  const edit = (fn: (l: DrumLayout) => void) => { const next = structuredClone(layout); fn(next); change(next); };

  const toView = (e: { clientX: number; clientY: number }) => {
    // Through the drawing's own transform: it keeps its proportions and is centred in its box, so the box's
    // corners are not the drawing's.
    const el = svg.current!, m = el.getScreenCTM();
    if (m) { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; }
    const r = el.getBoundingClientRect(), k = Math.min(r.width / VIEW.w, r.height / VIEW.h);
    return { x: (e.clientX - r.left - (r.width - VIEW.w * k) / 2) / k, y: (e.clientY - r.top - (r.height - VIEW.h * k) / 2) / k };
  };
  const flash = (h: number, part: Part, seg: number) => {
    const z = svg.current?.querySelector(`[data-zone="${h}:${part}:${seg}"]`);
    z?.classList.add('hit');
    setTimeout(() => z?.classList.remove('hit'), 140);
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    getSelection()?.removeAllRanges();
    const p = toView(e), hit = hitTest(layout, p.x, p.y);
    if (!hit) return;
    const voice = layout[hit.head].parts[hit.part][hit.seg];
    if (editing) {
      setSel({ head: hit.head, part: hit.part, seg: hit.seg });
      if (voice) recorder.drum(track.id, voice, voiceSound(bank, voice), undefined, 1);
      return;
    }
    if (!voice) return;
    flash(hit.head, hit.part, hit.seg);
    const sound = recorder.drum(track.id, voice, voiceSound(bank, voice), e.timeStamp, drumSweet ? sweetVelocity(hit) : 1);
    if (!bends(voice)) return;
    // Bends: sliding toward the centre of the head raises the pitch, like pressing it with the heel of the hand.
    const id = e.pointerId, c = circles[hit.head];
    const d0 = Math.hypot(p.x - c.cx, p.y - c.cy);
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return;
      const q = toView(ev);
      sound.glide(Math.max(0, Math.min(5, ((d0 - Math.hypot(q.x - c.cx, q.y - c.cy)) / c.R) * BEND_PER_RADIUS)));
    };
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };

  const selHead = sel ? layout[sel.head] : null;
  const selList = sel && selHead ? selHead.parts[sel.part] : [];

  return (
    <div className={`drumview${editing ? ' editing' : ''}`}>
      <div className="drumtools">
        {switcher}
        <button className={`btn sm${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => { setEditing(!editing); setSel(null); }}>
          {editing ? 'Done editing' : 'Edit layout'}
        </button>
        {!editing && (
          <button className={`btn sm${drumSweet ? ' on' : ''}`} aria-pressed={drumSweet} title="Full volume in the middle of each area, softer toward its edges" onClick={() => setDrumSweet(!drumSweet)}>Sweet spot</button>
        )}
        {editing && <span className="muted-text">Tap an area to mark it</span>}
      </div>
      <div className="drumwork">
        <svg ref={svg} className="drumheads" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} onPointerDown={down} aria-label={`${bank} drum heads`}>
          {layout.map((hd, h) => {
            const c = circles[h];
            const sx = c.cx + hd.syahi.dx * c.R, sy = c.cy + hd.syahi.dy * c.R, sr = hd.syahi.r * c.R, cr = hd.centre * c.R;
            const shapes: [Part, number, number, number, number][] = [
              ['rim', c.cx, c.cy, c.R, hd.rim * c.R],
              ['middle', c.cx, c.cy, hd.rim * c.R, 0],
              ['syahi', sx, sy, sr, cr > 0 ? cr : 0],
              ['centre', sx, sy, cr, 0],
            ];
            return (
              <g key={h}>
                {/* The middle ring is the skin between the rim and the syahi: the syahi is cut out of it. */}
                <defs>
                  <mask id={`skin-${track.id}-${h}`}>
                    <rect x="0" y="0" width={VIEW.w} height={VIEW.h} fill="#fff" />
                    <circle cx={sx} cy={sy} r={sr} fill="#000" />
                  </mask>
                </defs>
                {shapes.map(([part, x, y, rO, rI]) => {
                  if (part === 'centre' && cr <= 0) return null;
                  const list = hd.parts[part];
                  const n = Math.max(1, list.length);
                  return Array.from({ length: n }, (_, i) => {
                    const t0 = i / n - 0.5 / n, t1 = (i + 1) / n - 0.5 / n;
                    const selected = editing && sel?.head === h && sel.part === part && sel.seg === i;
                    // Label in the middle of the segment; the middle ring's halfway between the syahi and the rim.
                    let tm = n === 1 ? 0 : (t0 + t1) / 2;
                    if (part === 'middle' && n === 1 && hd.syahi.dy < 0) tm = 0.5;
                    let rl = (rO + rI) / 2;
                    if (part === 'middle') {
                      const ux = Math.sin(tm * Math.PI * 2), uy = -Math.cos(tm * Math.PI * 2);
                      const ox = c.cx - sx, oy = c.cy - sy, b = ox * ux + oy * uy, k = b * b - (ox * ox + oy * oy - sr * sr);
                      rl = ((k >= 0 ? Math.max(0, -b + Math.sqrt(k)) : 0) + hd.rim * c.R) / 2;
                    }
                    if (part === 'centre' || (n === 1 && rI === 0 && part !== 'middle')) rl = 0;
                    const lx = x + rl * Math.sin(tm * Math.PI * 2), ly = y - rl * Math.cos(tm * Math.PI * 2);
                    const v = list[i];
                    return (
                      <g key={`${part}${i}`}>
                        <path
                          d={segmentPath(x, y, rO, rI, t0, t1)}
                          className={`zone ${part}${i % 2 ? ' alt' : ''}${v ? '' : ' empty'}${selected ? ' selected' : ''}`}
                          data-zone={`${h}:${part}:${i}`}
                          mask={part === 'middle' ? `url(#skin-${track.id}-${h})` : undefined}
                        />
                        <text x={lx} y={ly} className={`zlabel ${part}`}>{v ? nameOf(v) + (bends(v) ? ' ↗' : '') : editing ? '＋' : ''}</text>
                      </g>
                    );
                  });
                })}
                <text x={c.cx} y={c.cy + c.R + 28} className="headname">{names[h]}</text>
              </g>
            );
          })}
        </svg>
        {editing && (
          <div className="markpanel">
            {sel && selHead ? (
              <>
                <strong>{names[sel.head].split(' · ')[0]} · {PART_NAMES[sel.part]}{selList.length > 1 ? ` · segment ${sel.seg + 1} of ${selList.length}` : ''}</strong>
                <div className="segrow">
                  <span>{selList.length > 1 ? 'Segments in this area' : 'One area. Split it into'}</span>
                  <div className="seg" role="group" aria-label="Segments">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} aria-pressed={Math.max(1, selList.length) === n} onClick={() => {
                        edit((l) => { const list = l[sel.head].parts[sel.part]; l[sel.head].parts[sel.part] = Array.from({ length: n }, (_, i) => (i < list.length ? list[i] : '')); });
                        setSel({ ...sel, seg: Math.min(sel.seg, n - 1) });
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="strokepick">
                  <button aria-pressed={!selList[sel.seg]} onClick={() => edit((l) => { l[sel.head].parts[sel.part][sel.seg] = ''; })}>Nothing</button>
                  {kit.map((k) => (
                    <button key={k.voice} aria-pressed={selList[sel.seg] === k.voice} onClick={() => {
                      edit((l) => { l[sel.head].parts[sel.part][sel.seg] = k.voice; });
                      recorder.drum(track.id, k.voice, voiceSound(bank, k.voice), undefined, 1);
                    }}>{k.name}{k.bends ? ' ↗' : ''}</button>
                  ))}
                </div>
                <Shape head={selHead} onChange={(fn) => edit((l) => fn(l[sel.head]))} />
              </>
            ) : (
              <p className="muted-text">Tap an area on either drum, then choose the stroke it plays. Split an area into segments to give each part its own stroke.</p>
            )}
            <button className="btn sm" onClick={() => { saveLayout(bank, null); setLayout(structuredClone(DEFAULT_LAYOUTS[bank] ?? generatedLayout(bank))); setSel(null); }}>Reset to the default layout</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sliders for a head's shape: rim width, syahi size and position, syahi centre, head size. */
function Shape({ head, onChange }: { head: DrumLayout[number]; onChange(fn: (h: DrumLayout[number]) => void): void }) {
  const row = (label: string, value: number, min: number, max: number, set: (h: DrumLayout[number], v: number) => void) => (
    <label className="shaperow">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange((h) => set(h, +e.target.value))} />
    </label>
  );
  return (
    <div className="shape">
      {row('Rim width', 1 - head.rim, 0.06, 0.4, (h, v) => { h.rim = 1 - v; })}
      {row('Syahi size', head.syahi.r, 0.15, 0.7, (h, v) => { h.syahi.r = v; h.centre = Math.min(h.centre, v - 0.05); })}
      {row('Syahi up / down', -head.syahi.dy, -0.45, 0.45, (h, v) => { h.syahi.dy = -v; })}
      {row('Syahi centre', head.centre, 0, 0.3, (h, v) => { h.centre = Math.min(v, h.syahi.r - 0.05); if (!h.parts.centre.length && h.centre > 0) h.parts.centre = ['']; })}
      {row('Drum size', head.size, 0.6, 1, (h, v) => { h.size = v; })}
    </div>
  );
}

