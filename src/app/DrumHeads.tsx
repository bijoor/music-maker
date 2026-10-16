import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { kitVoices, voiceSound } from '../model/kit';
import type { Track } from '../model/types';
import { VIEW, viewFor, headCircles, hitTest, layoutFor, saveLayout, segmentPath, depthVelocity, DEFAULT_LAYOUTS, generatedLayout, type DrumLayout, type Part } from '../model/drumLayout';
import * as recorder from '../engine/recorder';
import { setSampleLevel } from '../engine/strudel';
import { setStrokeLevel, strokeLevel } from '../model/strokeLevels';
import { disableTapForce, enableTapForce, tapForceListening, tapForceSensed, tapVelocity } from './tapForce';
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
  const { drumDepth, setDrumDepth, drumForce, setDrumForce } = useStore();
  // Tap force needs the motion sensor, which iPad allows only from a tap: after a reload it waits for one.
  const [forceLive, setForceLive] = useState(tapForceListening);
  // The last tap's force, shown without re-drawing the drum on every stroke.
  const forceText = useRef<HTMLSpanElement>(null);
  const showForce = (v: number) => { if (forceText.current) forceText.current.textContent = `Last tap ${Math.round(v * 100)}%`; };
  const toggleForce = async () => {
    if (drumForce && forceLive) { disableTapForce(); setForceLive(false); setDrumForce(false); return; }
    const ok = await enableTapForce();
    setForceLive(ok);
    setDrumForce(ok);
    if (!ok) useStore.getState().setMessage('Tap force needs the motion sensor: allow Motion & Orientation access when asked (on iPad)');
  };
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<DrumLayout>(() => layoutFor(bank));
  const [layoutBank, setLayoutBank] = useState(bank);
  if (layoutBank !== bank) { setLayoutBank(bank); setLayout(layoutFor(bank)); }
  const [, setLevelTick] = useState(0);
  const [sel, setSel] = useState<{ head: 0 | 1; part: Part; seg: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const touch = useRef<HTMLDivElement>(null);
  // iPad Safari holds a touch back (deciding between a scroll, a zoom and a tap) unless it is told not to: this
  // stops that wait so a stroke sounds at once.
  useEffect(() => {
    const el = touch.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, []);
  const kit = kitVoices(bank);
  const names = HEAD_NAMES[bank] ?? ['Left hand', 'Right hand'];
  const nameOf = (v: string) => kit.find((k) => k.voice === v)?.name ?? v;
  const bends = (v: string) => !!kit.find((k) => k.voice === v)?.bends;
  // The drawing takes the shape of the space it fills, so the heads can sit apart and be as big as it allows.
  const [view, setView] = useState(VIEW);
  useLayoutEffect(() => {
    const el = touch.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) setView(viewFor(r.width, r.height));
    const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; if (width && height) setView(viewFor(width, height)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const circles = useMemo(() => headCircles(view), [view]);

  const change = (next: DrumLayout) => { setLayout(next); saveLayout(bank, next); };
  const edit = (fn: (l: DrumLayout) => void) => { const next = structuredClone(layout); fn(next); change(next); };

  const toView = (e: { clientX: number; clientY: number }) => {
    // Through the drawing's own transform: it keeps its proportions and is centred in its box, so the box's
    // corners are not the drawing's.
    const el = svg.current!, m = el.getScreenCTM();
    if (m) { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; }
    const r = el.getBoundingClientRect(), k = Math.min(r.width / view.w, r.height / view.h);
    return { x: (e.clientX - r.left - (r.width - view.w * k) / 2) / k, y: (e.clientY - r.top - (r.height - view.h * k) / 2) / k };
  };
  const flash = (h: number, part: Part, seg: number) => {
    const z = svg.current?.querySelector(`[data-zone="${h}:${part}:${seg}"]`);
    z?.classList.add('hit');
    setTimeout(() => z?.classList.remove('hit'), 140);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    getSelection()?.removeAllRanges();
    const p = toView(e), hit = hitTest(layout, p.x, p.y, view);
    if (!hit) return;
    const voice = layout[hit.head].parts[hit.part][hit.seg];
    if (editing) {
      setSel({ head: hit.head, part: hit.part, seg: hit.seg });
      if (voice) recorder.drum(track.id, voice, voiceSound(bank, voice), undefined, 1);
      return;
    }
    if (!voice) return;
    // Stops what is ringing on the head struck (a two-hand bol such as Dha: on both heads).
    const both = kit.find((k) => k.voice === voice)?.hand === 'both';
    const heads: recorder.Head[] = both ? ['left', 'right'] : [hit.head === 0 ? 'left' : 'right'];
    // Velocity: by depth across the area, by how hard the tap jolted the iPad, or both.
    const depth = drumDepth ? depthVelocity(hit, layout[hit.head].loud?.[hit.part]) : 1;
    let later: ((v: number) => void) | null = null;
    const force = drumForce && forceLive ? tapVelocity(e.timeStamp, (v) => later?.(v)) : null;
    const vel = Math.max(0.12, depth * (force ?? 1));
    const sound = recorder.drum(track.id, voice, voiceSound(bank, voice), e.timeStamp, vel, heads);
    if (force === null && drumForce && forceLive && !tapForceSensed() && forceText.current) forceText.current.textContent = 'No motion sensor here';
    if (force !== null) {
      showForce(force);
      // A bigger jolt read just after the touch: set the stroke's volume to match.
      later = (v) => { sound.level(Math.max(0.12, depth * v) / vel); showForce(v); };
    }
    flash(hit.head, hit.part, hit.seg);
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
          <>
            <button className={`btn sm${drumDepth ? ' on' : ''}`} aria-pressed={drumDepth} title="Softer at one side of each area, louder at the other (set the loud side in Edit layout)" onClick={() => setDrumDepth(!drumDepth)}>Depth</button>
            <button className={`btn sm${drumForce && forceLive ? ' on' : ''}`} aria-pressed={drumForce && forceLive} title="Harder taps play louder, read from the iPad's motion sensor" onClick={toggleForce}>
              {drumForce && !forceLive ? 'Tap force · tap to allow' : 'Tap force'}
            </button>
            {drumForce && forceLive && (
              <span ref={forceText} className="muted-text">Tap the drum</span>
            )}
          </>
        )}
        {editing && <span className="muted-text">Tap an area to mark it</span>}
      </div>
      <div className="drumwork">
        {/* Touches are taken by an HTML box: Safari ignores touch-action on SVG. */}
        <div ref={touch} className="drumtouch" onPointerDown={down}>
        <svg ref={svg} className="drumheads" viewBox={`0 0 ${view.w} ${view.h}`} aria-label={`${bank} drum heads`}>
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
                    <rect x="0" y="0" width={view.w} height={view.h} fill="#fff" />
                    <circle cx={sx} cy={sy} r={sr} fill="#000" />
                  </mask>
                </defs>
                {shapes.map(([part, x, y, rO, rI]) => {
                  if (part === 'centre' && cr <= 0) return null;
                  const list = hd.parts[part];
                  const n = Math.max(1, list.length);
                  return Array.from({ length: n }, (_, i) => {
                    const turn = hd.turn?.[part] ?? 0;
                    const t0 = i / n - 0.5 / n + turn, t1 = (i + 1) / n - 0.5 / n + turn;
                    const selected = editing && sel?.head === h && sel.part === part && sel.seg === i;
                    // Label in the middle of the segment; the middle ring's halfway between the syahi and the rim.
                    let tm = n === 1 ? turn : (t0 + t1) / 2;
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
        </div>
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
                {selList.length > 1 && (
                  <label className="shaperow">
                    <span>Rotate segments · {Math.round((selHead.turn?.[sel.part] ?? 0) * 360)}°</span>
                    <input type="range" min={-0.5} max={0.5} step={1 / 72} value={selHead.turn?.[sel.part] ?? 0}
                      onChange={(e) => edit((l) => { const hd = l[sel.head]; hd.turn = { ...hd.turn, [sel.part]: +e.target.value }; })} />
                  </label>
                )}
                <div className="segrow">
                  <span>Louder toward (Depth)</span>
                  <div className="seg" role="group" aria-label="Louder toward">
                    {(['out', 'in'] as const).map((d) => (
                      <button key={d} aria-pressed={(selHead.loud?.[sel.part] ?? 'out') === d}
                        onClick={() => edit((l) => { const hd = l[sel.head]; hd.loud = { ...hd.loud, [sel.part]: d }; })}>
                        {d === 'out' ? 'Outside' : 'Inside'}
                      </button>
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
                {selList[sel.seg] && (() => {
                  const v = selList[sel.seg], level = strokeLevel(bank, v);
                  return (
                    <label className="shaperow">
                      <span>{nameOf(v)} level · {level > 0 ? `${Math.round(20 * Math.log10(level))} dB` : 'off'} (everywhere it plays)</span>
                      <input type="range" min={-24} max={6} step={1} value={Math.round(20 * Math.log10(Math.max(level, 0.063)))}
                        onChange={(e) => { const l = 10 ** (+e.target.value / 20); setStrokeLevel(bank, v, l); setSampleLevel(voiceSound(bank, v), l); setLevelTick((n) => n + 1); }}
                        onPointerUp={() => recorder.drum(track.id, v, voiceSound(bank, v), undefined, 1)} />
                    </label>
                  );
                })()}
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

/** Sliders for a head's shape: rim width, syahi size and position, syahi centre. */
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
    </div>
  );
}

