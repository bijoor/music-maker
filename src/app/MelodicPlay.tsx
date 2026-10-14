import type { PointerEvent, ReactNode } from 'react';
import { useStore } from '../state/store';
import { findScale, inScale, padChords, pitchLabel, scalePitch, tonicPc } from '../model/scales';
import { pitchToCode } from '../model/notes';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { CHORD_KEYS, PIANO_HINT, padRowKeys } from './keymap';
import { slideVelocity, strikeVelocity } from './strike';
import { keyboardOf } from '../model/groups';
import { anchors, keyAt, keyLine, pitchAlong, slideTo, startSlide, stickyKey } from './glide';

/**
 * A sliding finger that stops for this long settles onto the key under it, easing over SETTLE_EASE seconds; a
 * finger that lifts mid-slide lands on its key at once (LIFT_EASE), so a note never ends between keys.
 */
const SETTLE_AFTER_MS = 60;
const SETTLE_EASE = 0.05;
const LIFT_EASE = 0.02;

const BLACK = [1, 3, 6, 8, 10];

/** Fingers holding keys or chord pads, by pointer id: each lets its key go (stops listening, ends the note). */
const fingers = new Map<number, () => void>();

/** Let go of every key a finger is still holding (when iOS loses a finger-up, or the app goes to the background). */
export function releaseFingers() {
  [...fingers.values()].forEach((end) => end());
}

/** Chord pads above a piano keyboard or large scale pads; everything plays immediately. */
export default function MelodicPlay({ track }: { track: Track }) {
  const { song, sargam, scaleLock, sustain, glide, setGlide, setUi, setOctave, setTrackKeyboard } = useStore();
  // Each track keeps its own keyboard (new tracks start with their group's).
  const { layout: keyboard, octaves: keyboardOctaves, perRow: perRowSetting } = keyboardOf(track);
  // Scale pads: rows of one octave, or two for wide rows.
  const perRow = keyboard === 'pads' ? perRowSetting ?? 1 : 1;
  const pianoOctaves = Math.min(2, keyboardOctaves); // the piano shows at most two octaves
  const scale = findScale(song);
  const tonic = song.key.tonic;
  // On scale pads the chords line up with the pads: one per scale note, then the upper Sa (with wide rows, the
  // chords of both octaves).
  const chords = padChords(scale, tonic, track.octave, sargam, keyboard === 'pads', perRow);
  const play = (pitches: number[], e: PointerEvent<HTMLElement>, chord = false) => {
    const el = e.currentTarget;
    const id = e.pointerId;
    getSelection()?.removeAllRanges(); // no text stays selected while playing
    // A finger whose lift never arrived (the same pointer id pressing again) is let go first.
    fingers.get(id)?.();
    const vel0 = strikeVelocity(e.clientY, el);
    recorder.press(track.id, pitches, id, chord, e.timeStamp, vel0);
    el.classList.add('down');
    if (chord) {
      const up = (ev?: Event) => {
        fingers.delete(id);
        recorder.release(id, ev?.timeStamp);
        el.classList.remove('down');
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.removeEventListener('pointerleave', up);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      fingers.set(id, () => up());
      return;
    }
    // Keys: with Slide off, moving the held finger onto another key plays that key. With Slide on, sliding sideways
    // glides the pitch, landing on notes: it glides continuously while the finger keeps moving one way, and settles
    // on the note of the key under the finger when it stops or reverses (glide.ts slideTo). With settling off in More,
    // bends are free: the pitch follows the finger, reaching each key's note at its centre. Sliding up or down
    // changes the volume from the velocity it was struck at, on the same scale as striking.
    if (el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    const line = keyLine(el);
    const path = anchors(line, el, e.clientX);
    const struck = line.find((k) => k.el === el);
    const slide = struck ? startSlide(struck, e.clientX, e.timeStamp) : null;
    const y0 = e.clientY, height = el.getBoundingClientRect().height;
    let lit = el, settle: ReturnType<typeof setTimeout> | undefined;
    let current = struck;
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id || !line.length || !current) return;
      const { glide, pitchSnap, slideStill } = useStore.getState();
      // The key the finger is on, with some give at its edges so a resting finger does not flick between keys.
      const on = (current = stickyKey(current, keyAt(line, ev.clientX, document.elementFromPoint(ev.clientX, ev.clientY)), ev.clientX, slideStill / 2));
      recorder.swell(id, slideVelocity(vel0, ev.clientY - y0, height));
      // Slide off: each key reached plays its own note. The new note starts at the volume the finger is at now.
      if (!glide) recorder.step(id, on.pitch, ev.timeStamp);
      let moved = true;
      if (glide && pitchSnap && slide) {
        // Wobbles smaller than the steadiness setting count as standing still: no bend, and the settle timer runs on.
        const r = slideTo(line, slide, ev.clientX, ev.timeStamp, on, slideStill);
        moved = r.moved;
        if (moved) recorder.glide(id, r.pitch, on.pitch, ev.timeStamp, r.ease);
      } else if (glide) recorder.glide(id, pitchAlong(path, ev.clientX), on.pitch, ev.timeStamp);
      if (on.el !== lit) { lit.classList.remove('down'); lit = on.el; lit.classList.add('down'); }
      if (!moved) return;
      clearTimeout(settle);
      if (glide && pitchSnap) settle = setTimeout(() => { if (slide) slide.cur = on.pitch; recorder.glide(id, on.pitch, on.pitch, undefined, SETTLE_EASE); }, SETTLE_AFTER_MS);
    };
    const end = (timeStamp?: number) => {
      fingers.delete(id);
      clearTimeout(settle);
      // Lifting mid-slide: land on the key's note before letting go (it may ring on under the sustain pedal).
      const { glide, pitchSnap } = useStore.getState();
      if (glide && pitchSnap && current) recorder.glide(id, current.pitch, current.pitch, timeStamp, LIFT_EASE);
      recorder.release(id, timeStamp);
      lit.classList.remove('down');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    const up = (ev: globalThis.PointerEvent) => { if (ev.pointerId === id) end(ev.timeStamp); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    fingers.set(id, () => end());
  };

  return (
    <div className="mplay">
      <div className="mtools">
        <div className="seg" role="group" aria-label="Keyboard layout">
          <button aria-pressed={keyboard === 'piano'} onClick={() => setTrackKeyboard(track.id, { layout: 'piano' })}>Piano</button>
          <button aria-pressed={keyboard === 'pads'} onClick={() => setTrackKeyboard(track.id, { layout: 'pads' })}>Scale pads</button>
        </div>
        <div className="seg" role="group" aria-label="Keyboard size">
          {(keyboard === 'piano' ? [1, 2] as const : perRow === 2 ? [1, 2, 3] as const : [1, 2, 3, 4] as const).map((n) => (
            <button key={n} aria-pressed={(keyboard === 'pads' ? keyboardOctaves : pianoOctaves) === n} onClick={() => setTrackKeyboard(track.id, { octaves: n })}>{n * perRow} oct</button>
          ))}
        </div>
        {keyboard === 'pads' && (
          <button className={`btn sm${perRow === 2 ? ' on' : ''}`} aria-pressed={perRow === 2} title="Two octaves in each row of pads"
            onClick={() => setTrackKeyboard(track.id, perRow === 2 ? { perRow: 1 } : { perRow: 2, octaves: Math.min(3, keyboardOctaves) as 1 | 2 | 3 })}>Wide rows</button>
        )}
        {keyboard === 'piano' && <button className={`btn sm${scaleLock ? ' on' : ''}`} aria-pressed={scaleLock} onClick={() => setUi({ scaleLock: !scaleLock })}>Scale lock</button>}
        <button className={`btn sm${sustain ? ' on' : ''}`} aria-pressed={sustain} title="Pedal: notes keep ringing after you let go, until Sustain is turned off (or hold Shift)" onClick={() => setUi({ sustain: !sustain })}>Sustain</button>
        <button className={`btn sm${glide ? ' on' : ''}`} aria-pressed={glide} title="Slide a held finger sideways to glide the pitch smoothly between keys" onClick={() => setGlide(!glide)}>Slide</button>
        <span className="muted-text">{tonic} {scale.name}</span>
      </div>
      <StepStrip />
      <div className={`chords${keyboard === 'pads' ? ' over-pads' : ''}`} style={{ gridTemplateColumns: `repeat(${chords.length}, minmax(0, 1fr))` }}>
        {chords.map((c, i) => (
          <button key={i} className="chord" data-chord={i} onPointerDown={(e) => play(c.pitches, e, true)}>
            <strong>{c.name}</strong><span>{c.numeral}</span><span className="kbd-hint">{CHORD_KEYS[i] ?? ''}</span>
          </button>
        ))}
      </div>
      <div className="kbwrap">
        <div className="octbtn">
          <button className="btn" aria-label="Octave up" onClick={() => setOctave(track.id, track.octave + 1)}>▲</button>
          <span>Oct {track.octave}</span>
          <button className="btn" aria-label="Octave down" onClick={() => setOctave(track.id, track.octave - 1)}>▼</button>
        </div>
        {keyboard === 'pads' ? scalePads() : piano()}
      </div>
    </div>
  );

  function scalePads() {
    const rowKeys = padRowKeys(keyboardOctaves);
    const row = (oct: number) => {
      // Every row ends on the Sa above, so the rows' columns line up (the lower row's last pad repeats the upper
      // row's first, for convenience).
      const pitches = Array.from({ length: perRow }, (_, k) => scale.degrees.map((d) => scalePitch(scale, tonic, d, oct + k))).flat();
      pitches.push(scalePitch(scale, tonic, 0, oct + perRow));
      const keys = rowKeys[(oct - track.octave) / perRow] ?? [];
      return (
        <div className="padrow">
          {pitches.map((p, i) => {
            const sa = pitchLabel(p, tonic, true) === 'Sa';
            return (
              <button key={p} className={`spad${sa ? ' sa' : ''}`} data-pitch={p} onPointerDown={(e) => play([p], e)}>
                <strong>{pitchLabel(p, tonic, sargam, false)}</strong><span>{pitchToCode(p)}</span><span className="kbd-hint">{keys[i]?.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      );
    };
    return (
      // One row per octave, lowest at the bottom; pads get smaller as rows are added.
      <div className={`spads rows-${keyboardOctaves}`} style={{ gridTemplateRows: `repeat(${keyboardOctaves}, 1fr)` }}>
        {Array.from({ length: keyboardOctaves }, (_, i) => row(track.octave + (keyboardOctaves - 1 - i) * perRow))}
      </div>
    );
  }

  function piano() {
    const lo = (track.octave + 1) * 12;
    const whites = 7 * pianoOctaves + 1;
    const keys: ReactNode[] = [];
    const blacks: ReactNode[] = [];
    let wi = 0;
    for (let i = 0; i <= 12 * pianoOctaves; i++) {
      const m = lo + i, pc = m % 12, black = BLACK.includes(pc);
      const ok = inScale(scale, tonic, m), off = scaleLock && !ok;
      // In-scale keys play the scale's own pitch, including any microtonal offset.
      const deg = ((m - tonicPc(tonic)) % 12 + 12) % 12;
      const pitch = ok ? scalePitch(scale, tonic, deg, Math.floor((m - tonicPc(tonic)) / 12) - 1) : m;
      const label = ok || !scaleLock ? pitchLabel(m, tonic, sargam, pc === tonicPc(tonic) || i === 0) : '';
      const props = {
        'data-pitch': pitch,
        'aria-label': pitchLabel(m, tonic, false),
        'aria-disabled': off || undefined,
        onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { if (!off) play([pitch], e); },
      };
      const w = 100 / whites;
      const hint = !off && PIANO_HINT[i] ? <span className="kbd-hint">{PIANO_HINT[i]}</span> : null;
      if (black) blacks.push(<button key={m} className={`bk${off ? ' off' : ''}${ok ? ' in' : ''}`} style={{ left: `${wi * w - w * 0.32}%`, width: `${w * 0.64}%` }} {...props}>{hint}<span>{label}</span></button>);
      else { keys.push(<button key={m} className={`wk${off ? ' off' : ''}${ok ? ' in' : ''}`} style={{ left: `${wi * w}%`, width: `${w}%` }} {...props}>{hint}<span>{label}</span></button>); wi++; }
    }
    return <div className="kb">{keys}{blacks}</div>;
  }
}

