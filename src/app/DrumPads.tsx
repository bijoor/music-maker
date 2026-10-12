import type { PointerEvent } from 'react';
import { HAND_NAMES, kitVoices, voiceSound, type Hand, type KitVoice } from '../model/kit';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { drumHint } from './keymap';
import { slideVelocity2D, strikeVelocity2D } from './strike';

/** Finger-sized pads: large main pads (kick and snare double width), smaller pads for less frequent sounds. Indian kits show their strokes. */
/** Pads whose pitch bends when the finger slides up (semitones over the pad's height): the tabla's Ge and the mridangam's Thom. */
const BENDING = new Set(['tabla_ge', 'thom']);
const MAX_BEND = 5;

export default function DrumPads({ track }: { track: Track }) {
  const kit = kitVoices(track.bank);
  // Where the pad is struck sets the velocity (soft top-left, full bottom-right); keeping the finger down and
  // sliding any way then swells or fades the hit while it rings (right and down louder). On a bending pad (the
  // tabla's Ge or the mridangam's Thom, like pressing into the bass head), sliding up raises the pitch instead and
  // only left/right changes the volume.
  const hit = (k: KitVoice, e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget, id = e.pointerId, r = el.getBoundingClientRect();
    const vel0 = strikeVelocity2D(e.clientX, e.clientY, el), x0 = e.clientX, y0 = e.clientY;
    const sound = recorder.drum(track.id, k.voice, voiceSound(track.bank, k.voice), e.timeStamp, vel0);
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 150);
    if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    const bends = BENDING.has(k.voice);
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
  const pad = (k: KitVoice) => (
    <button
      key={k.voice}
      className={`pad${k.span === 2 ? ' wide' : k.span === 4 ? ' full' : ''}${k.main ? '' : ' aux'}`}
      data-voice={k.voice}
      onPointerDown={(e) => hit(k, e)}
    >
      <strong>{k.name}</strong>
      <code>{k.voice}</code>
      <span className="kbd-hint">{drumHint(track.bank, k.voice)}</span>
    </button>
  );
  return (
    <div className="padview">
      <StepStrip />
      {kit.some((k) => k.hand) ? (
        // Indian kits: laid out as the drums sit, left hand | both hands | right hand.
        <div className="kit hands">
          {(['left', 'both', 'right'] as Hand[]).map((h) => (
            <section key={h} className={`hand ${h}`} aria-label={HAND_NAMES[track.bank ?? '']?.[h] ?? h}>
              <h3>{HAND_NAMES[track.bank ?? '']?.[h] ?? h}</h3>
              <div className="hand-pads">{kit.filter((k) => k.hand === h).map(pad)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="kit">
          <div className="kit-main">{kit.filter((k) => k.main).map(pad)}</div>
          <div className="kit-aux">{kit.filter((k) => !k.main).map(pad)}</div>
        </div>
      )}
    </div>
  );
}
