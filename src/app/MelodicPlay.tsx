import type { PointerEvent, ReactNode } from 'react';
import { useStore } from '../state/store';
import { findScale, inScale, pitchLabel, scaleChords, scalePitch, tonicPc } from '../model/scales';
import { pitchToCode } from '../model/notes';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { PAD_ROWS, PIANO_HINT } from './keymap';

const BLACK = [1, 3, 6, 8, 10];

/** Chord pads above a piano keyboard or large scale pads; everything plays immediately. */
export default function MelodicPlay({ track }: { track: Track }) {
  const { song, sargam, keyboard, keyboardOctaves, scaleLock, setUi, setOctave } = useStore();
  const scale = findScale(song);
  const tonic = song.key.tonic;
  const chords = scaleChords(scale, tonic, track.octave, sargam);
  const play = (pitches: number[], e: PointerEvent<HTMLElement>, chord = false) => {
    recorder.press(track.id, pitches, e.pointerId, chord, e.timeStamp);
    const el = e.currentTarget;
    el.classList.add('down');
    const up = (ev: Event) => { recorder.release(e.pointerId, ev.timeStamp); el.classList.remove('down'); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', up); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  };

  return (
    <div className="mplay">
      <div className="mtools">
        <div className="seg" role="group" aria-label="Keyboard layout">
          <button aria-pressed={keyboard === 'piano'} onClick={() => setUi({ keyboard: 'piano' })}>Piano</button>
          <button aria-pressed={keyboard === 'pads'} onClick={() => setUi({ keyboard: 'pads' })}>Scale pads</button>
        </div>
        <div className="seg" role="group" aria-label="Keyboard size">
          <button aria-pressed={keyboardOctaves === 1} onClick={() => setUi({ keyboardOctaves: 1 })}>1 oct</button>
          <button aria-pressed={keyboardOctaves === 2} onClick={() => setUi({ keyboardOctaves: 2 })}>2 oct</button>
        </div>
        {keyboard === 'piano' && <button className={`btn sm${scaleLock ? ' on' : ''}`} aria-pressed={scaleLock} onClick={() => setUi({ scaleLock: !scaleLock })}>Scale lock</button>}
        <span className="muted-text">{tonic} {scale.name}</span>
      </div>
      <StepStrip />
      <div className="chords" style={{ gridTemplateColumns: `repeat(${chords.length}, minmax(0, 1fr))` }}>
        {chords.map((c, i) => (
          <button key={i} className="chord" data-chord={i} onPointerDown={(e) => play(c.pitches, e, true)}>
            <strong>{c.name}</strong><span>{c.numeral}</span><span className="kbd-hint">{i + 1}</span>
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
    const row = (oct: number, top: boolean) => {
      const pitches = scale.degrees.map((d) => scalePitch(scale, tonic, d, oct));
      if (top) pitches.push(scalePitch(scale, tonic, 0, oct + 1));
      const keys = oct === track.octave ? PAD_ROWS.low : PAD_ROWS.high;
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
      <div className="spads" style={{ gridTemplateRows: `repeat(${keyboardOctaves}, 1fr)` }}>
        {keyboardOctaves === 2 && row(track.octave + 1, true)}
        {row(track.octave, keyboardOctaves === 1)}
      </div>
    );
  }

  function piano() {
    const lo = (track.octave + 1) * 12;
    const whites = 7 * keyboardOctaves + 1;
    const keys: ReactNode[] = [];
    const blacks: ReactNode[] = [];
    let wi = 0;
    for (let i = 0; i <= 12 * keyboardOctaves; i++) {
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
