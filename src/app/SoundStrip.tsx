import { useStore } from '../state/store';
import type { Track } from '../model/types';
import { num } from '../codegen/generate';

// Cutoff slider: 0–1 maps to 100 Hz–20 kHz on a log scale; the top end means "filter open".
const toCut = (v: number) => (v >= 0.995 ? undefined : Math.round(100 * Math.pow(200, v)));
const fromCut = (hz?: number) => (hz === undefined ? 1 : Math.log(hz / 100) / Math.log(200));

/** The track's sound controls, inline above the editor; each change shows up in the track's line of code. */
export default function SoundStrip({ track }: { track: Track }) {
  const setFx = useStore((s) => s.setFx);
  const f = track.fx;
  const slider = (label: string, value: number, min: number, max: number, step: number, show: string, on: (v: number) => void) => (
    <label className="fxs">
      <span className="lbl">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={`${track.name} ${label}`} onChange={(e) => on(+e.target.value)} />
      <output>{show}</output>
    </label>
  );
  const pan = f.pan === 0.5 ? 'centre' : f.pan < 0.5 ? `L ${Math.round((0.5 - f.pan) * 200)}` : `R ${Math.round((f.pan - 0.5) * 200)}`;
  return (
    <div className="soundstrip">
      {slider('Volume', f.gain, 0, 1.5, 0.01, num(f.gain), (v) => setFx(track.id, { gain: v }))}
      {slider('Pan', f.pan, 0, 1, 0.01, pan, (v) => setFx(track.id, { pan: Math.abs(v - 0.5) < 0.03 ? 0.5 : v }))}
      {slider('Cutoff', fromCut(f.lpf), 0, 1, 0.005, f.lpf === undefined ? 'open' : f.lpf >= 1000 ? `${(f.lpf / 1000).toFixed(1)} kHz` : `${f.lpf} Hz`, (v) => setFx(track.id, { lpf: toCut(v) }))}
      {slider('Reverb', f.room ?? 0, 0, 1, 0.01, num(f.room ?? 0), (v) => setFx(track.id, { room: v || undefined }))}
      {slider('Delay', f.delay ?? 0, 0, 1, 0.01, num(f.delay ?? 0), (v) => setFx(track.id, { delay: v || undefined }))}
      {slider('Fade in', f.attack ?? 0, 0, 2, 0.05, f.attack ? `${num(f.attack)} s` : 'off', (v) => setFx(track.id, { attack: v || undefined }))}
      {slider('Ring out', f.release ?? 0, 0, 4, 0.05, f.release ? `${num(f.release)} s` : 'off', (v) => setFx(track.id, { release: v || undefined }))}
    </div>
  );
}
