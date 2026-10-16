import { useState } from 'react';
import * as recorder from '../engine/recorder';
import { setSampleLevel } from '../engine/strudel';
import { voiceSound } from '../model/kit';
import { setStrokeLevel, strokeLevel } from '../model/strokeLevels';

/** A stroke's base level (dB), kept on the device and applied wherever the stroke plays; heard on letting go. */
export default function StrokeLevel({ trackId, bank, voice, name }: { trackId: string; bank: string | undefined; voice: string; name: string }) {
  const [, redraw] = useState(0);
  const level = strokeLevel(bank, voice);
  const key = bank ?? 'RolandTR909';
  return (
    <label className="shaperow" title="Applies wherever this sound plays: pads, drum and clips">
      <span>{name} · {Math.round(20 * Math.log10(level))} dB</span>
      <input type="range" min={-24} max={6} step={1} value={Math.round(20 * Math.log10(Math.max(level, 0.063)))}
        onChange={(e) => { const l = 10 ** (+e.target.value / 20); setStrokeLevel(key, voice, l); setSampleLevel(voiceSound(bank, voice), l); redraw((n) => n + 1); }}
        onPointerUp={() => recorder.drum(trackId, voice, voiceSound(bank, voice), undefined, 1)} />
    </label>
  );
}
