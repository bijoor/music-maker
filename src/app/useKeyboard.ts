import { useEffect } from 'react';
import { selectedTrack, useStore } from '../state/store';
import { voiceBank } from '../model/kit';
import { findScale, inScale, scaleChords, scalePitch, tonicPc } from '../model/scales';
import * as recorder from '../engine/recorder';
import * as player from '../engine/player';
import { CHORD_KEYS, DRUM_KEYS, PAD_ROWS, PIANO_KEYS } from './keymap';

/** Keys that are not instrument keys: Space play/stop, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Escape closes a panel. */
function command(e: KeyboardEvent): boolean {
  const s = useStore.getState();
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === ' ' && !mod) { if (s.transport === 'playing') player.stop(); else player.play({ countIn: s.mode === 'record' && s.countIn }); return true; }
  if (mod && e.key.toLowerCase() === 'z') { if (e.shiftKey) s.redo(); else s.undo(); return true; }
  if (e.key === 'Escape' && s.panel) { s.setPanel(null); return true; }
  return false;
}

/** Light up the on-screen key or pad that a computer key plays. */
function flash(selector: string, on: boolean) {
  document.querySelectorAll(selector).forEach((el) => el.classList.toggle('down', on));
}

/** What a key plays on the selected track: drum voice or pitches (and whether it is a chord). */
function resolve(key: string): { voice?: string; pitches?: number[]; chord?: boolean; selector: string } | null {
  const s = useStore.getState();
  const track = selectedTrack(s);
  if (!track) return null;
  if (track.kind === 'drums') {
    const voice = DRUM_KEYS[key];
    return voice ? { voice, selector: `[data-voice="${voice}"]` } : null;
  }
  const scale = findScale(s.song), tonic = s.song.key.tonic;
  const ci = CHORD_KEYS.indexOf(key);
  if (ci >= 0) {
    const chord = scaleChords(scale, tonic, track.octave, false)[ci];
    return chord ? { pitches: chord.pitches, chord: true, selector: `[data-chord="${ci}"]` } : null;
  }
  if (s.keyboard === 'pads') {
    const low = PAD_ROWS.low.indexOf(key), high = PAD_ROWS.high.indexOf(key);
    const row = low >= 0 ? { i: low, oct: track.octave } : high >= 0 ? { i: high, oct: track.octave + 1 } : null;
    if (!row) return null;
    const n = scale.degrees.length;
    const deg = scale.degrees[row.i % n], oct = row.oct + Math.floor(row.i / n);
    const pitch = scalePitch(scale, tonic, deg, oct);
    return { pitches: [pitch], selector: `[data-pitch="${pitch}"]` };
  }
  const semis = PIANO_KEYS[key];
  if (semis === undefined) return null;
  const m = (track.octave + 1) * 12 + semis;
  const ok = inScale(scale, tonic, m);
  if (s.scaleLock && !ok) return null;
  const deg = ((m - tonicPc(tonic)) % 12 + 12) % 12;
  const pitch = ok ? scalePitch(scale, tonic, deg, Math.floor((m - tonicPc(tonic)) / 12) - 1) : m;
  return { pitches: [pitch], selector: `[data-pitch="${pitch}"]` };
}

const held = new Map<string, { id: number; selector: string }>();
let nextId = 10_000;

/** Play the selected track from the computer keyboard; key up releases (for recorded note lengths). */
export function useKeyboard() {
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || !!t.closest('.cm-editor'));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey) return;
      if (command(e)) { e.preventDefault(); return; }
      if (e.metaKey || e.ctrlKey || e.repeat) return;
      const key = e.key.toLowerCase();
      const s = useStore.getState(), track = selectedTrack(s);
      if (track?.kind === 'melodic' && (key === 'z' || key === 'x')) { s.setOctave(track.id, track.octave + (key === 'x' ? 1 : -1)); e.preventDefault(); return; }
      if (held.has(key)) return;
      const hit = resolve(key);
      if (!hit || !track) return;
      e.preventDefault();
      const id = nextId++;
      held.set(key, { id, selector: hit.selector });
      flash(hit.selector, true);
      if (hit.voice) {
        const [sound, n] = hit.voice.split(':');
        recorder.drum(track.id, hit.voice, { s: sound, ...(n ? { n: +n } : {}), bank: voiceBank(track.bank ?? 'RolandTR909', hit.voice) }, e.timeStamp);
      } else if (hit.pitches) {
        recorder.press(track.id, hit.pitches, id, hit.chord, e.timeStamp);
      }
    };
    const up = (e: KeyboardEvent) => {
      const h = held.get(e.key.toLowerCase());
      if (!h) return;
      held.delete(e.key.toLowerCase());
      flash(h.selector, false);
      recorder.release(h.id, e.timeStamp);
    };
    const blur = () => { held.forEach((h) => { flash(h.selector, false); recorder.release(h.id); }); held.clear(); };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
  }, []);
}
