import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useStore } from '../state/store';
import { findScale, gridRows, inScale, pitchLabel, scaleChords } from '../model/scales';
import { bendFromPrevious, noteCovering } from '../model/clipEdit';
import { pitchToCode } from '../model/notes';
import { STEPS_PER_BAR, type MelodicClip, type Track } from '../model/types';
import { DEFAULT_BEND_TIME, findToken, num } from '../codegen/generate';
import * as engine from '../engine/strudel';
import * as player from '../engine/player';

interface Props {
  track: Track;
  clip: MelodicClip;
  slot: number;
  bar: number;
}

const LENGTHS: [number, string][] = [[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 bar']];
/** Bend speeds, in seconds (Strudel's pattack). */
const SPEEDS: [number, string][] = [[0.08, 'Fast'], [0.2, 'Medium'], [0.4, 'Slow'], [0.8, 'Very slow']];
const semis = (b: number) => `${Math.abs(b) === 1 ? 'a semitone' : `${num(Math.abs(b))} semitones`} ${b < 0 ? 'below' : 'above'}`;
const key = (p: number) => (Math.round(p * 100) / 100).toString();

/** Rows are the notes of the scale (or raga) over two octaves; tap a cell to add or remove a note. */
export default function NoteGrid({ track, clip, slot, bar }: Props) {
  const { song, sargam, noteLen, chordLen, cursor, toggleNote, placeChord, setBend, setUi } = useStore();
  const scale = findScale(song);
  const tonic = song.key.tonic;
  const off = bar * STEPS_PER_BAR;
  const ref = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => gridRows(scale, tonic, track.octave, clip.notes.flatMap((n) => n.pitches)), [scale, tonic, track.octave, clip.notes]);
  const chords = scaleChords(scale, tonic, track.octave, sargam);
  const cur = cursor >= off && cursor < off + STEPS_PER_BAR ? cursor - off : -1;

  useGridFeedback(ref, track.id, clip.id, slot, off);

  const preview = (pitches: number[], steps: number) => pitches.forEach((p) => player.preview(track.id, { note: p, s: track.sound ?? 'piano' }, steps));
  const tap = (step: number, pitch: number) => {
    const held = noteCovering(clip, step);
    const start = held && held.pitches.some((p) => Math.abs(p - pitch) < 0.001) ? held.step : step;
    if (toggleNote(track.id, slot, start, pitch)) preview([pitch], noteLen);
    setUi({ cursor: step });
  };

  // Bend: applies to the note sounding at the selected step.
  const target = noteCovering(clip, cursor);
  const fromPrev = target ? bendFromPrevious(clip, target.step) : null;
  const bendValue = target?.bend ? String(target.bend) : '0';
  const bendOptions: [string, string][] = [['0', 'No bend']];
  if (fromPrev) bendOptions.push([String(fromPrev), `From the previous note (${semis(fromPrev)})`]);
  for (const b of [-2, -1, 1, 2]) if (b !== fromPrev) bendOptions.push([String(b), `From ${semis(b)}`]);
  if (target?.bend && !bendOptions.some(([v]) => v === bendValue)) bendOptions.push([bendValue, `From ${semis(target.bend)}`]);
  const bendTime = target?.bendTime ?? DEFAULT_BEND_TIME;
  const applyBend = (bend: number, time = bendTime) => {
    if (!target) return;
    setBend(track.id, slot, target.step, bend || null, bend ? time : undefined);
    if (bend) target.pitches.forEach((p) => player.preview(track.id, { note: p, s: track.sound ?? 'piano', penv: -bend, pattack: time }, target.len));
  };

  return (
    <div className="ngrid-wrap">
      <div className="ngrid" ref={ref}>
        <div />
        {Array.from({ length: STEPS_PER_BAR }, (_, s) => (
          <button key={s} className={`colhead${s % 4 === 0 ? ' b' : ''}${s === cur ? ' sel' : ''}`} onClick={() => setUi({ cursor: off + s })} aria-label={`Choose step ${s + 1}`}>
            {s % 4 === 0 ? s / 4 + 1 : '·'}
          </button>
        ))}
        {rows.map((pitch) => (
          <Row key={key(pitch)} label={pitchLabel(pitch, tonic, sargam)} code={pitchToCode(pitch)} out={!inScale(scale, tonic, pitch)} sa={pitchLabel(pitch, tonic, true) === 'Sa'}>
            {Array.from({ length: STEPS_PER_BAR }, (_, s) => {
              const step = off + s;
              const n = noteCovering(clip, step);
              const has = !!n && n.pitches.some((p) => Math.abs(p - pitch) < 0.001);
              const cls = has ? (n!.step === step ? ` on${n!.bend ? (n!.bend < 0 ? ' bend-up' : ' bend-down') : ''}` : ' cont') : '';
              return (
                <button
                  key={s}
                  className={`cell${s % 4 === 0 ? ' beat' : ''}${cls}${s === cur ? ' cur' : ''}`}
                  data-col={s}
                  data-step={n && has ? n.step : step}
                  aria-label={`${pitchLabel(pitch, tonic, false)}, step ${s + 1}${has ? ', on' : ''}`}
                  aria-pressed={has}
                  onClick={() => tap(step, pitch)}
                />
              );
            })}
          </Row>
        ))}
      </div>
      <div className="ngrid-tools">
        <span className="muted-text">New notes</span>
        <div className="seg" role="group" aria-label="Length of new notes">
          {LENGTHS.map(([n, l]) => <button key={n} aria-pressed={noteLen === n} onClick={() => setUi({ noteLen: n })}>{l}</button>)}
        </div>
        <span className="muted-text">Chord at step {(cursor % STEPS_PER_BAR) + 1}</span>
        <select aria-label="Chord length" value={chordLen} onChange={(e) => setUi({ chordLen: +e.target.value })}>
          {LENGTHS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
        </select>
        <span className="muted-text">Bend</span>
        <select aria-label={target ? `Bend into the note at step ${(target.step % STEPS_PER_BAR) + 1}` : 'Bend: select a note first'} disabled={!target} value={bendValue} onChange={(e) => applyBend(+e.target.value)}>
          {target ? bendOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>) : <option value="0">Select a note</option>}
        </select>
        {target?.bend ? (
          <select aria-label="Bend speed" value={String(SPEEDS.find(([t]) => Math.abs(t - bendTime) < 0.001)?.[0] ?? bendTime)} onChange={(e) => applyBend(target.bend!, +e.target.value)}>
            {SPEEDS.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            {!SPEEDS.some(([t]) => Math.abs(t - bendTime) < 0.001) && <option value={bendTime}>{num(bendTime)} s</option>}
          </select>
        ) : null}
        <div className="chordrow">
          {chords.map((c, i) => (
            <button key={i} className="chip" onClick={() => { placeChord(track.id, slot, cursor, c.pitches); preview(c.pitches, chordLen); setUi({ cursor: Math.min(clip.bars * STEPS_PER_BAR - 1, cursor + chordLen) }); }}>
              <strong>{c.name}</strong><span>{c.numeral}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, code, out, sa, children }: { label: string; code: string; out: boolean; sa: boolean; children: ReactNode }) {
  return (
    <>
      <div className={`rh${out ? ' out' : ''}${sa ? ' sa' : ''}`}>{label}{code.toLowerCase() !== label.toLowerCase() && <code>{code}</code>}</div>
      {children}
    </>
  );
}

/** Playhead column and flashes for notes as they play. */
function useGridFeedback(ref: RefObject<HTMLDivElement | null>, trackId: string, clipId: string, slot: number, off: number) {
  useEffect(() => {
    let raf = 0, col = -1;
    const tick = () => {
      const ph = player.playhead(trackId);
      const step = ph && ph.slot === slot ? Math.floor(ph.step) - off : -1;
      const want = step >= 0 && step < STEPS_PER_BAR ? step : -1;
      if (want !== col) {
        ref.current?.querySelectorAll('.ph').forEach((el) => el.classList.remove('ph'));
        if (want >= 0) ref.current?.querySelectorAll(`.cell[data-col="${want}"]`).forEach((el) => el.classList.add('ph'));
        col = want;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const offHap = engine.onHap((e) => {
      if (e.track !== trackId) return;
      const g = player.generated();
      const tc = g?.tracks.find((t) => t.trackId === trackId);
      const tok = g && tc ? findToken(g.tokens, e.locations, tc.start) : undefined;
      if (!tok || tok.clipId !== clipId) return;
      setTimeout(() => {
        const els = ref.current?.querySelectorAll(`.cell.on[data-step="${tok.steps[0]}"]`);
        els?.forEach((el) => el.classList.add('hit'));
        setTimeout(() => els?.forEach((el) => el.classList.remove('hit')), 140);
      }, Math.max(0, (e.time - engine.audioTime()) * 1000));
    });
    return () => { cancelAnimationFrame(raf); offHap(); };
  }, [ref, trackId, clipId, slot, off]);
}
