import { useState } from 'react';
import { useStore } from '../state/store';
import { findScale, SARGAM, TONICS, tonicPc } from '../model/scales';
import * as player from '../engine/player';

/** Build a scale or raga: pick the swaras of one octave and nudge any of them by cents (shrutis). */
export default function ScaleEditor({ onClose }: { onClose(): void }) {
  const { song, addCustomScale } = useStore();
  const base = findScale(song);
  const tonic = song.key.tonic;
  const [name, setName] = useState(base.group === 'Custom' ? base.name : `My ${base.name}`);
  const [degrees, setDegrees] = useState<number[]>([...base.degrees]);
  const [cents, setCents] = useState<Record<number, number>>({ ...(base.cents ?? {}) });

  const toggle = (d: number) => setDegrees((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => a - b)));
  const playScale = () => {
    const track = song.tracks.find((t) => t.kind === 'melodic');
    if (!track) return;
    [...degrees, 12].forEach((d, i) =>
      setTimeout(() => player.preview(track.id, { note: 60 + tonicPc(tonic) + d + (cents[d % 12] ?? 0) / 100, s: 'piano' }, 2), i * 280),
    );
  };
  const save = () => {
    const kept = Object.fromEntries(Object.entries(cents).filter(([d, c]) => c && degrees.includes(+d)));
    addCustomScale({ name: name.trim() || 'My scale', degrees, cents: kept, drone: degrees.includes(7) ? [0, 7] : degrees.includes(5) ? [0, 5] : [0] });
    onClose();
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="se-h">
        <div className="dialog-h"><h2 id="se-h">Custom scale or raga</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        <div className="dialog-b">
          <p className="muted-text">Tap the notes of one octave, with Sa on {tonic}. Nudge a note in cents for shrutis; those notes are written as decimal MIDI numbers in the code, for example <code>note("62.88")</code>.</p>
          <label className="field"><span className="muted-text">Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="swaras">
            {SARGAM.map((s, d) => (
              <div key={d} className="swc">
                <button aria-pressed={degrees.includes(d)} disabled={d === 0} onClick={() => toggle(d)}>
                  {s}<small>{TONICS[(tonicPc(tonic) + d) % 12]}</small>
                </button>
                <input type="number" min={-50} max={50} step={1} value={cents[d] ?? 0} aria-label={`${s} cents`} onChange={(e) => setCents((c) => ({ ...c, [d]: +e.target.value }))} />
              </div>
            ))}
          </div>
          <p className="muted-text">Lowercase = komal, Ma♯ = tivra. {degrees.length} notes.</p>
          <div className="row">
            <button className="btn on" onClick={save} disabled={degrees.length < 2}>Save and use</button>
            <button className="btn" onClick={playScale}>Play scale</button>
          </div>
        </div>
      </div>
    </div>
  );
}
