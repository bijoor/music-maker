import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import * as engine from '../engine/strudel';
import * as player from '../engine/player';

const TAPS = 8;

/**
 * Tap along with the click; the median gap between your taps and the beats becomes this device's record
 * offset. It covers touch-screen delay, Bluetooth headphones and personal timing.
 */
export default function Calibrate({ onClose }: { onClose(): void }) {
  const { transport, metronome, recordOffsetMs, setUi, setRecordOffset } = useStore();
  const [gaps, setGaps] = useState<number[]>([]);
  const wasClick = useRef(metronome);

  useEffect(() => {
    setUi({ metronome: true });
    if (useStore.getState().transport === 'stopped') player.play();
    const keep = wasClick.current;
    return () => setUi({ metronome: keep });
  }, [setUi]);

  const tap = (timeStamp: number) => {
    if (useStore.getState().transport !== 'playing') return;
    // Position in beats you heard when you tapped, with no offset applied; gap to the nearest beat in ms.
    const beats = engine.cycleHeardAt(timeStamp) * 4;
    const gap = ((beats - Math.round(beats)) / 4 / engine.getCps()) * 1000;
    setGaps((g) => [...g, gap].slice(-TAPS));
  };
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const spread = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cal-h">
        <div className="dialog-h"><h2 id="cal-h">Calibrate recording</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        <div className="dialog-b">
          <p className="muted-text">Tap the big button exactly on each click, {TAPS} times. Use the speakers or headphones you will record with. The result is saved on this device.</p>
          <button className="tapbig" disabled={transport !== 'playing'} onPointerDown={(e) => tap(e.timeStamp)}>
            {transport === 'playing' ? `Tap · ${gaps.length} / ${TAPS}` : 'Starting…'}
          </button>
          {gaps.length >= TAPS ? (
            <p>Your taps land <b>{Math.abs(median).toFixed(0)} ms {median >= 0 ? 'after' : 'before'}</b> the beat (spread {spread.toFixed(0)} ms){spread > 120 ? '. That is a wide spread; tap again for a steadier reading.' : '.'}</p>
          ) : (
            <p className="muted-text">Current offset: {recordOffsetMs} ms.</p>
          )}
          <div className="row">
            <button className="btn on" disabled={gaps.length < TAPS} onClick={() => { setRecordOffset(median); onClose(); }}>Use {gaps.length >= TAPS ? `${median.toFixed(0)} ms` : 'result'}</button>
            <button className="btn" onClick={() => setGaps([])}>Start over</button>
            <button className="btn" onClick={() => { setRecordOffset(0); onClose(); }}>Reset to 0</button>
          </div>
        </div>
      </div>
    </div>
  );
}
