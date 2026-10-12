// Web MIDI input: a hardware keyboard or pad controller plays the selected track, like the on-screen pads and
// keys (so Record and Edit work with it too). Available in desktop Chrome and Edge; Safari (and so iPad)
// does not support Web MIDI.
import { selectedTrack, useStore } from '../state/store';
import { isIndianKit, kitVoices, voiceSound } from '../model/kit';
import { findScale, inScale, scalePitch, tonicPc } from '../model/scales';
import * as recorder from './recorder';

/** General MIDI drum notes → kit voices (what drum pads and e-kits send). */
export const GM_DRUMS: Record<number, string> = {
  35: 'bd:1', 36: 'bd', 37: 'rim', 38: 'sd', 39: 'cp', 40: 'sd:1', 41: 'lt', 43: 'lt', 45: 'mt', 47: 'mt', 48: 'ht', 50: 'ht',
  42: 'hh', 44: 'hh', 46: 'oh', 49: 'cr', 57: 'cr', 51: 'rd', 59: 'rd', 53: 'rd', 54: 'tb', 56: 'cb', 69: 'sh', 70: 'sh',
};

export type MidiState = 'off' | 'unsupported' | 'denied' | 'waiting' | 'connected';

let access: MIDIAccess | null = null;
const idFor = (note: number) => 30_000 + note;
/** MIDI velocity 1–127 as the grid's 0–1, in steps of 0.05. */
const midiVelocity = (v: number) => Math.max(0.05, Math.round((v / 127) * 20) / 20);

function onMessage(e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || data.length < 3) return;
  const kind = data[0] & 0xf0, note = data[1], vel = data[2];
  const s = useStore.getState();
  const track = selectedTrack(s);
  if (!track) return;
  if (kind === 0x90 && vel > 0) {
    if (track.kind === 'drums') {
      // Indian kits: the strokes in pad order from C2 (MIDI 36) up.
      const voice = isIndianKit(track.bank) ? kitVoices(track.bank)[note - 36]?.voice : GM_DRUMS[note];
      if (!voice) return;
      recorder.drum(track.id, voice, voiceSound(track.bank, voice), e.timeStamp, midiVelocity(vel));
    } else {
      // In-scale notes play the scale's own pitch (including microtonal offsets); others play as sent.
      const scale = findScale(s.song), tonic = s.song.key.tonic;
      const pitch = inScale(scale, tonic, note) ? scalePitch(scale, tonic, ((note - tonicPc(tonic)) % 12 + 12) % 12, Math.floor((note - tonicPc(tonic)) / 12) - 1) : note;
      recorder.press(track.id, [pitch], idFor(note), false, e.timeStamp, midiVelocity(vel));
    }
  } else if (kind === 0x80 || (kind === 0x90 && vel === 0)) {
    recorder.release(idFor(note), e.timeStamp);
  }
}

function attach(): string[] {
  if (!access) return [];
  const names: string[] = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = onMessage;
    names.push(input.name ?? 'MIDI input');
  });
  return names;
}

/** Ask the browser for MIDI access and listen to every input (including ones plugged in later). */
export async function connectMidi(report: (state: MidiState, devices: string[]) => void) {
  if (typeof navigator.requestMIDIAccess !== 'function') { report('unsupported', []); return; }
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    report('denied', []);
    return;
  }
  const update = () => { const names = attach(); report(names.length ? 'connected' : 'waiting', names); };
  access.onstatechange = update;
  update();
}
