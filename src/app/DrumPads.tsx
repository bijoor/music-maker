import { KIT, voiceBank, type KitVoice } from '../model/kit';
import type { Track } from '../model/types';
import * as recorder from '../engine/recorder';
import StepStrip from './StepStrip';

/** Finger-sized pads: large main pads (kick and snare double width), smaller pads for less frequent sounds. */
export default function DrumPads({ track }: { track: Track }) {
  const hit = (k: KitVoice, el: HTMLElement, timeStamp: number) => {
    const [s, n] = k.voice.split(':');
    recorder.drum(track.id, k.voice, { s, ...(n ? { n: +n } : {}), bank: voiceBank(track.bank ?? 'RolandTR909', k.voice) }, timeStamp);
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 150);
  };
  const pad = (k: KitVoice) => (
    <button
      key={k.voice}
      className={`pad${k.voice === 'bd' || k.voice === 'sd' ? ' wide' : ''}${k.main ? '' : ' aux'}`}
      onPointerDown={(e) => hit(k, e.currentTarget, e.timeStamp)}
    >
      <strong>{k.name}</strong>
      <code>{k.voice}</code>
    </button>
  );
  return (
    <div className="padview">
      <StepStrip />
      <div className="kit">
        <div className="kit-main">{KIT.filter((k) => k.main).map(pad)}</div>
        <div className="kit-aux">{KIT.filter((k) => !k.main).map(pad)}</div>
      </div>
    </div>
  );
}
