import { useState, type PointerEvent } from 'react';
import { handName, kitVoices, voiceSound, type KitVoice } from '../model/kit';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { cellHint, drumHint } from './keymap';
import { slideVelocity2D, strikeVelocity2D } from './strike';
import { useStore } from '../state/store';
import { hasDrumView } from '../model/drumLayout';
import DrumHeads from './DrumHeads';
import StrokeLevel from './StrokeLevel';
import { MAX_COLS, MAX_ROWS, padGrid, resetPadOrder, resizeGrid, setCell } from '../model/padOrder';
import { dampOnHold } from './damp';
import { noteBetween } from '../engine/strudel';

/** Finger-sized pads: large main pads (kick and snare double width), smaller pads for less frequent sounds. Indian kits show their strokes. */
/** Semitones a bending pad (KitVoice.bends) rises over the pad's height when the finger slides up. */
const MAX_BEND = 5;

export default function DrumPads({ track }: { track: Track }) {
  const kit = kitVoices(track.bank);
  const { drumView, setDrumView, drumDamp, setDrumDamp } = useStore();
  // Levels: the last pad played gets a level slider under the pads.
  const [levels, setLevels] = useState(false);
  const [levelVoice, setLevelVoice] = useState<string | null>(null);
  // Arrange (Indian kits): set the grid's rows and columns, then tap a pad and choose the stroke it plays — a stroke
  // can have several pads, and Nothing empties a pad.
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [, setOrderTick] = useState(0);
  const changed = () => setOrderTick((n) => n + 1);
  const grid = kit.some((k) => k.hand) ? padGrid(track.bank!) : null;
  const assign = (voice: string) => {
    if (picked === null) return;
    setCell(track.bank!, picked, voice);
    changed();
    if (voice) recorder.drum(track.id, voice, voiceSound(track.bank, voice), undefined, 1, [], false);
  };
  const resize = (rows: number, cols: number) => { resizeGrid(track.bank!, rows, cols); setPicked(null); changed(); };
  const pickedVoice = grid && picked !== null ? grid.cells[picked] ?? '' : '';
  const drumable = hasDrumView(track.bank);
  // Where the pad is struck sets the velocity (soft top-left, full bottom-right); keeping the finger down and
  // sliding any way then swells or fades the hit while it rings (right and down louder). On a bending pad (the
  // tabla's Ge or the mridangam's Thom, like pressing into the bass head), sliding up raises the pitch instead and
  // only left/right changes the volume.
  const hit = (k: KitVoice, e: PointerEvent<HTMLElement>, el: HTMLElement = e.currentTarget) => {
    const id = e.pointerId, r = el.getBoundingClientRect();
    getSelection()?.removeAllRanges(); // no text stays selected while playing
    const vel0 = strikeVelocity2D(e.clientX, e.clientY, el), x0 = e.clientX, y0 = e.clientY;
    const sound = recorder.drum(track.id, k.voice, voiceSound(track.bank, k.voice), e.timeStamp, vel0, recorder.headsOf(k.hand));
    if (levels) setLevelVoice(k.voice);
    if (drumable && drumDamp && !k.bends) dampOnHold(sound, id, e.clientX, e.clientY);
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 150);
    if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    const bends = !!k.bends;
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      sound.level(slideVelocity2D(vel0, dx, bends ? 0 : dy, r.width, r.height) / vel0);
      if (bends) sound.glide(Math.max(0, Math.min(MAX_BEND, (-dy / r.height) * MAX_BEND)));
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
  const pad = (k: KitVoice, cell?: number) => (
    <button
      key={cell ?? k.voice}
      className={`pad${k.span === 2 ? ' wide' : k.span === 4 ? ' full' : ''}${k.main ? '' : ' aux'}${cell !== undefined && picked === cell ? ' picked' : ''}`}
      data-voice={k.voice}
      onPointerDown={(e) => (arranging && cell !== undefined ? setPicked(picked === cell ? null : cell) : hit(k, e))}
    >
      <strong>{k.name}</strong>
      <code>{k.voice}</code>
      <span className="kbd-hint">{cell !== undefined ? cellHint(track.bank, cell) : drumHint(track.bank, k.voice)}</span>
    </button>
  );
  // A finger landing between pads (fast playing lands on gaps and edges) plays the nearest pad instead of nothing.
  const between = (e: PointerEvent<HTMLElement>) => {
    if (arranging || (e.target as Element).closest('.pad')) return;
    let best: HTMLElement | null = null, bestD = Infinity;
    e.currentTarget.querySelectorAll<HTMLElement>('.pad:not(.empty)').forEach((p) => {
      const r = p.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      if (d < bestD) { bestD = d; best = p; }
    });
    const k = best && kit.find((x) => x.voice === (best as HTMLElement).dataset.voice);
    if (!best || !k || bestD > 40) return;
    noteBetween();
    hit(k, e, best);
  };
  /** A cell of an Indian kit's pad grid: its stroke's pad, or an empty pad (filled from Arrange). */
  const cell = (voice: string, i: number) => {
    const k = voice ? kit.find((x) => x.voice === voice) : undefined;
    if (k) return pad(k, i);
    return (
      <button key={i} className={`pad empty${picked === i ? ' picked' : ''}`} aria-label="Empty pad" onPointerDown={() => arranging && setPicked(picked === i ? null : i)}>
        <span className="muted-text">{arranging ? '＋' : ''}</span>
      </button>
    );
  };
  const stepper = (label: string, value: number, max: number, set: (n: number) => void) => (
    <span className="stepper">
      <span>{label}</span>
      <button className="btn sm" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= 1} onClick={() => set(value - 1)}>−</button>
      <strong>{value}</strong>
      <button className="btn sm" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + 1)}>+</button>
    </span>
  );
  if (!kit.length) return <div className="padview"><p className="muted-text empty-kit">This recorded kit is not on this device. Its hits are kept; record or choose a kit to play.</p></div>;
  // Indian and recorded kits can be played as pads or as the drum's heads.
  const switcher = drumable && (
    <div className="seg" role="group" aria-label="Layout">
      <button aria-pressed={drumView === 'pads'} onClick={() => setDrumView('pads')}>Pads</button>
      <button aria-pressed={drumView === 'drum'} onClick={() => setDrumView('drum')}>Drum</button>
    </div>
  );
  if (drumable && drumView === 'drum') {
    return (
      <div className="padview">
        <StepStrip />
        <DrumHeads track={track} switcher={switcher} />
      </div>
    );
  }
  return (
    <div className="padview">
      <StepStrip />
      <div className="drumtools">
        {switcher}
        {drumable && <button className={`btn sm${drumDamp ? ' on' : ''}`} aria-pressed={drumDamp} title="Lift at once and a stroke rings; leave the finger resting and it is damped" onClick={() => setDrumDamp(!drumDamp)}>Hold damps</button>}
        {kit.some((k) => k.hand) && (
          <button className={`btn sm${arranging ? ' on' : ''}`} aria-pressed={arranging} title="Set the number of pads, and the stroke each pad plays" onClick={() => { setArranging(!arranging); setPicked(null); }}>{arranging ? 'Done arranging' : 'Arrange'}</button>
        )}
        {arranging && grid && stepper('Rows', grid.rows, MAX_ROWS, (n) => resize(n, grid.cols))}
        {arranging && grid && stepper('Columns', grid.cols, MAX_COLS, (n) => resize(grid.rows, n))}
        {arranging && <button className="btn sm" onClick={() => { resetPadOrder(track.bank!); setPicked(null); changed(); }}>Reset pads</button>}
        <button className={`btn sm${levels ? ' on' : ''}`} aria-pressed={levels} title="Set each sound's base level: tap a pad, then use the slider" onClick={() => setLevels(!levels)}>Levels</button>
        {levels && (levelVoice && kit.some((k) => k.voice === levelVoice)
          ? <div className="padlevel"><StrokeLevel trackId={track.id} bank={track.bank} voice={levelVoice} name={kit.find((k) => k.voice === levelVoice)!.name} /></div>
          : <span className="muted-text">Tap a pad to set its level</span>)}
      </div>
      {grid ? (
        // Indian kits: a grid of pads, each playing the stroke chosen for it (by default left hand | both | right).
        // Arranging: the strokes to choose from sit beside the pads (as Edit layout does on the drum).
        <div className="drumwork padwork">
          <div className="padgrid" onPointerDown={between} style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}>
            {grid.cells.map(cell)}
          </div>
          {arranging && (
            <aside className="markpanel">
              {picked !== null && grid ? (
                <>
                  <strong>Row {Math.floor(picked / grid.cols) + 1}, column {(picked % grid.cols) + 1}{pickedVoice ? ` · ${handName(track.bank, kit.find((k) => k.voice === pickedVoice)?.hand ?? 'both')}` : ''}</strong>
                  <div className="strokepick" role="group" aria-label="Stroke for this pad">
                    <button aria-pressed={!pickedVoice} onClick={() => assign('')}>Nothing</button>
                    {kit.map((k) => (
                      <button key={k.voice} aria-pressed={pickedVoice === k.voice} onClick={() => assign(k.voice)}>{k.name}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted-text">Set the rows and columns above, then tap a pad and choose the stroke it plays. A stroke can have more than one pad; Nothing empties a pad.</p>
              )}
            </aside>
          )}
        </div>
      ) : (
        <div className="kit" onPointerDown={between}>
          <div className="kit-main">{kit.filter((k) => k.main).map((k) => pad(k))}</div>
          <div className="kit-aux">{kit.filter((k) => !k.main).map((k) => pad(k))}</div>
        </div>
      )}
    </div>
  );
}
