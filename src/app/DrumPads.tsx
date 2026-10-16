import { useState, type PointerEvent } from 'react';
import { handName, kitVoices, voiceSound, type Hand, type KitVoice } from '../model/kit';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { drumHint, spotHint } from './keymap';
import { slideVelocity2D, strikeVelocity2D } from './strike';
import { useStore } from '../state/store';
import { hasDrumView } from '../model/drumLayout';
import DrumHeads from './DrumHeads';
import StrokeLevel from './StrokeLevel';
import { HANDS, padSpots, resetPadOrder, setSpot, type Spot } from '../model/padOrder';
import { dampOnHold } from './damp';

/** Finger-sized pads: large main pads (kick and snare double width), smaller pads for less frequent sounds. Indian kits show their strokes. */
/** Semitones a bending pad (KitVoice.bends) rises over the pad's height when the finger slides up. */
const MAX_BEND = 5;

export default function DrumPads({ track }: { track: Track }) {
  const kit = kitVoices(track.bank);
  const { drumView, setDrumView, drumDamp, setDrumDamp } = useStore();
  // Levels: the last pad played gets a level slider under the pads.
  const [levels, setLevels] = useState(false);
  const [levelVoice, setLevelVoice] = useState<string | null>(null);
  // Arrange (Indian kits): tap a pad (or an empty spot), then choose the stroke it plays — a stroke can have several
  // pads, and Nothing empties a pad.
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [, setOrderTick] = useState(0);
  const same = (a: Spot | null, b: Spot) => !!a && a.hand === b.hand && a.i === b.i;
  const arrange = (at: Spot) => setPicked(same(picked, at) ? null : at);
  const assign = (voice: string) => {
    if (!picked) return;
    setSpot(track.bank!, picked, voice);
    setOrderTick((n) => n + 1);
    if (voice) recorder.drum(track.id, voice, voiceSound(track.bank, voice), undefined, 1, [], false);
  };
  const pickedVoice = picked ? padSpots(track.bank!)[picked.hand][picked.i] : '';
  const drumable = hasDrumView(track.bank);
  // Where the pad is struck sets the velocity (soft top-left, full bottom-right); keeping the finger down and
  // sliding any way then swells or fades the hit while it rings (right and down louder). On a bending pad (the
  // tabla's Ge or the mridangam's Thom, like pressing into the bass head), sliding up raises the pitch instead and
  // only left/right changes the volume.
  const hit = (k: KitVoice, e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget, id = e.pointerId, r = el.getBoundingClientRect();
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
  const pad = (k: KitVoice, at?: Spot) => (
    <button
      key={at ? `${at.hand}${at.i}` : k.voice}
      className={`pad${k.span === 2 ? ' wide' : k.span === 4 ? ' full' : ''}${k.main ? '' : ' aux'}${at && same(picked, at) ? ' picked' : ''}`}
      data-voice={k.voice}
      onPointerDown={(e) => (arranging && at ? arrange(at) : hit(k, e))}
    >
      <strong>{k.name}</strong>
      <code>{k.voice}</code>
      <span className="kbd-hint">{at ? spotHint(track.bank, at.hand, at.i) : drumHint(track.bank, k.voice)}</span>
    </button>
  );
  /** An Indian kit's spot: its stroke's pad, or an empty pad (filled from Arrange → Copy). */
  const spot = (voice: string, at: Spot) => {
    const k = voice ? kit.find((x) => x.voice === voice) : undefined;
    if (k) return pad(k, at);
    return (
      <button key={`${at.hand}${at.i}`} className={`pad empty${same(picked, at) ? ' picked' : ''}`} aria-label="Empty pad" onPointerDown={() => arranging && arrange(at)}>
        <span className="muted-text">{arranging ? '＋' : ''}</span>
      </button>
    );
  };
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
          <button className={`btn sm${arranging ? ' on' : ''}`} aria-pressed={arranging} title="Move pads, give a stroke more pads, or empty a pad" onClick={() => { setArranging(!arranging); setPicked(null); }}>{arranging ? 'Done arranging' : 'Arrange'}</button>
        )}
        {arranging && <button className="btn sm" onClick={() => { resetPadOrder(track.bank!); setPicked(null); setOrderTick((n) => n + 1); }}>Reset order</button>}
        <button className={`btn sm${levels ? ' on' : ''}`} aria-pressed={levels} title="Set each sound's base level: tap a pad, then use the slider" onClick={() => setLevels(!levels)}>Levels</button>
        {levels && (levelVoice && kit.some((k) => k.voice === levelVoice)
          ? <div className="padlevel"><StrokeLevel trackId={track.id} bank={track.bank} voice={levelVoice} name={kit.find((k) => k.voice === levelVoice)!.name} /></div>
          : <span className="muted-text">Tap a pad to set its level</span>)}
      </div>
      {kit.some((k) => k.hand) ? (
        // Indian kits: laid out as the drums sit, left hand | both hands | right hand.
        // Arranging: the strokes to choose from sit beside the pads (as Edit layout does on the drum).
        <div className="drumwork padwork">
          <div className="kit hands">
            {HANDS.map((h: Hand) => (
              <section key={h} className={`hand ${h}`} aria-label={handName(track.bank, h)}>
                <h3>{handName(track.bank, h)}</h3>
                <div className="hand-pads">{padSpots(track.bank!)[h].map((v, i) => spot(v, { hand: h, i }))}</div>
              </section>
            ))}
          </div>
          {arranging && (
            <aside className="markpanel">
              {picked ? (
                <>
                  <strong>{handName(track.bank, picked.hand)} · pad {picked.i + 1}</strong>
                  <div className="strokepick" role="group" aria-label="Stroke for this pad">
                    <button aria-pressed={!pickedVoice} onClick={() => assign('')}>Nothing</button>
                    {kit.map((k) => (
                      <button key={k.voice} aria-pressed={pickedVoice === k.voice} onClick={() => assign(k.voice)}>{k.name}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted-text">Tap a pad (or an empty spot), then choose the stroke it plays. A stroke can have more than one pad; Nothing empties a pad.</p>
              )}
            </aside>
          )}
        </div>
      ) : (
        <div className="kit">
          <div className="kit-main">{kit.filter((k) => k.main).map((k) => pad(k))}</div>
          <div className="kit-aux">{kit.filter((k) => !k.main).map((k) => pad(k))}</div>
        </div>
      )}
    </div>
  );
}
