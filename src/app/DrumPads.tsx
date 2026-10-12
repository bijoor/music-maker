import { kitVoices, voiceSound, type KitVoice } from '../model/kit';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';
import { drumHint } from './keymap';

/** Finger-sized pads: large main pads (kick and snare double width), smaller pads for less frequent sounds. Indian kits show their strokes. */
export default function DrumPads({ track }: { track: Track }) {
  const kit = kitVoices(track.bank);
  const hit = (k: KitVoice, el: HTMLElement, timeStamp: number) => {
    recorder.drum(track.id, k.voice, voiceSound(track.bank, k.voice), timeStamp);
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 150);
  };
  const pad = (k: KitVoice) => (
    <button
      key={k.voice}
      className={`pad${k.span === 2 ? ' wide' : k.span === 4 ? ' full' : ''}${k.main ? '' : ' aux'}`}
      data-voice={k.voice}
      onPointerDown={(e) => hit(k, e.currentTarget, e.timeStamp)}
    >
      <strong>{k.name}</strong>
      <code>{k.voice}</code>
      <span className="kbd-hint">{drumHint(track.bank, k.voice)}</span>
    </button>
  );
  return (
    <div className="padview">
      <StepStrip />
      <div className="kit">
        <div className="kit-main">{kit.filter((k) => k.main).map(pad)}</div>
        {kit.some((k) => !k.main) && <div className="kit-aux">{kit.filter((k) => !k.main).map(pad)}</div>}
      </div>
    </div>
  );
}
