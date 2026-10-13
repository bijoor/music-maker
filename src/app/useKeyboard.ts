import { useEffect } from 'react';
import { selectedTrack, useStore } from '../state/store';
import { voiceSound } from '../model/kit';
import { keyboardOf } from '../model/groups';
import { findScale, inScale, scaleChords, scalePitch, tonicPc } from '../model/scales';
import * as recorder from '../engine/recorder';
import * as player from '../engine/player';
import { CHORD_KEYS, PIANO_KEYS, drumKey, padRowKeys } from './keymap';

/** Keys that are not instrument keys: Enter play/stop, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Escape closes a panel. */
function command(e: KeyboardEvent): boolean {
  const s = useStore.getState();
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Enter' && !mod) { if (s.transport === 'playing') player.stop(); else player.play({ countIn: s.mode === 'record' && s.countIn }); return true; }
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
    const voice = drumKey(track.bank, key);
    return voice ? { voice, selector: `[data-voice="${voice}"]` } : null;
  }
  const scale = findScale(s.song), tonic = s.song.key.tonic;
  const ci = CHORD_KEYS.indexOf(key);
  if (ci >= 0) {
    const chord = scaleChords(scale, tonic, track.octave, false, keyboardOf(track).layout === 'pads')[ci];
    return chord ? { pitches: chord.pitches, chord: true, selector: `[data-chord="${ci}"]` } : null;
  }
  if (keyboardOf(track).layout === 'pads') {
    // Rows of keys, lowest octave first (padRowKeys): Z X C V … the track's octave, then A S D F …, Q W E R ….
    const rows = padRowKeys(keyboardOf(track).octaves);
    const r = rows.findIndex((keys) => keys.includes(key));
    const row = r >= 0 && r < keyboardOf(track).octaves ? { i: rows[r].indexOf(key), oct: track.octave + r } : null;
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

/** The instrument key pressed, by position, so Shift (the sustain pedal) does not turn 1 into ! or ; into :. */
function keyOf(e: KeyboardEvent): string {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  const punct: Record<string, string> = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' };
  if (punct[e.code]) return punct[e.code];
  return e.key.toLowerCase();
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
      if (e.key === 'Shift') { recorder.setPedal(true); return; }
      if (e.metaKey || e.ctrlKey || e.repeat) return;
      const key = keyOf(e);
      const s = useStore.getState(), track = selectedTrack(s);
      // Octave down / up: Z / X on the piano; − / = on scale pads, whose lower row uses Z and X.
      const octKeys = track && keyboardOf(track).layout === 'pads' ? ['-', '='] : ['z', 'x'];
      if (track?.kind === 'melodic' && octKeys.includes(key)) { s.setOctave(track.id, track.octave + (key === octKeys[1] ? 1 : -1)); e.preventDefault(); return; }
      if (held.has(key)) return;
      const hit = resolve(key);
      if (!hit || !track) return;
      e.preventDefault();
      const id = nextId++;
      held.set(key, { id, selector: hit.selector });
      flash(hit.selector, true);
      if (hit.voice) {
        recorder.drum(track.id, hit.voice, voiceSound(track.bank, hit.voice), e.timeStamp);
      } else if (hit.pitches) {
        recorder.press(track.id, hit.pitches, id, hit.chord, e.timeStamp);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { recorder.setPedal(false); return; }
      const key = keyOf(e);
      const h = held.get(key);
      if (!h) return;
      e.preventDefault(); // e.g. Space: do not also click a focused button
      held.delete(key);
      flash(h.selector, false);
      recorder.release(h.id, e.timeStamp);
    };
    const blur = () => { recorder.setPedal(false); held.forEach((h) => { flash(h.selector, false); recorder.release(h.id); }); held.clear(); };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); };
  }, []);
}
