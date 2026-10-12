import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { KIT, voiceBank } from '../model/kit';
import { STEPS_PER_BAR, type DrumClip, type Track } from '../model/types';
import { findToken } from '../codegen/generate';
import * as engine from '../engine/strudel';
import * as player from '../engine/player';

interface Props {
  track: Track;
  clip: DrumClip;
  slot: number;
  /** Bar of the clip shown. */
  bar: number;
}

/** One row per drum sound, 16 steps per bar. Tap a cell to add or remove a hit. */
export default function DrumGrid({ track, clip, slot, bar }: Props) {
  const toggleHit = useStore((s) => s.toggleHit);
  const ref = useRef<HTMLDivElement>(null);
  const off = bar * STEPS_PER_BAR;

  // Playhead column and per-hit flashes, without re-rendering.
  useEffect(() => {
    let raf = 0, col = -1;
    const tick = () => {
      const ph = player.playhead(track.id);
      const step = ph && ph.slot === slot ? Math.floor(ph.step) - off : -1;
      const want = step >= 0 && step < STEPS_PER_BAR ? step : -1;
      if (want !== col) {
        ref.current?.querySelectorAll('.ph').forEach((el) => el.classList.remove('ph'));
        if (want >= 0) ref.current?.querySelectorAll(`[data-col="${want}"]`).forEach((el) => el.classList.add('ph'));
        col = want;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const offHap = engine.onHap((e) => {
      if (e.track !== track.id) return;
      const g = player.generated();
      const tc = g?.tracks.find((t) => t.trackId === track.id);
      if (!g || !tc) return;
      const tok = findToken(g.tokens, e.locations, tc.start);
      if (!tok || tok.clipId !== clip.id) return;
      const inBar = Math.round((e.cycle - Math.floor(e.cycle)) * STEPS_PER_BAR) % STEPS_PER_BAR;
      const step = tok.steps.find((s) => s % STEPS_PER_BAR === inBar);
      if (step === undefined) return;
      const voice = e.value.n ? `${e.value.s}:${e.value.n}` : String(e.value.s);
      setTimeout(() => {
        const el = ref.current?.querySelector(`[data-cell="${voice}:${step}"]`);
        el?.classList.add('hit');
        setTimeout(() => el?.classList.remove('hit'), 120);
      }, Math.max(0, (e.time - engine.audioTime()) * 1000));
    });
    return () => { cancelAnimationFrame(raf); offHap(); };
  }, [track.id, clip.id, slot, off]);

  const tap = (voice: string, step: number) => {
    const on = toggleHit(track.id, slot, voice, step);
    if (on) {
      const [s, n] = voice.split(':');
      player.preview(track.id, { s, ...(n ? { n: +n } : {}), bank: voiceBank(track.bank ?? 'RolandTR909', voice) });
    }
  };

  return (
    <div className="dgrid" ref={ref}>
      <div />
      {Array.from({ length: STEPS_PER_BAR }, (_, s) => <div key={s} className={`colhead${s % 4 === 0 ? ' b' : ''}`}>{s % 4 === 0 ? s / 4 + 1 : '·'}</div>)}
      {KIT.map((k) => (
        <Row key={k.voice} name={k.name} aux={!k.main}>
          {Array.from({ length: STEPS_PER_BAR }, (_, s) => {
            const step = off + s;
            const on = (clip.hits[k.voice]?.[step] ?? 0) > 0;
            return (
              <button
                key={s}
                className={`cell${s % 4 === 0 ? ' beat' : ''}${on ? ' on' : ''}`}
                data-col={s}
                data-cell={`${k.voice}:${step}`}
                aria-label={`${k.name}, step ${s + 1}${on ? ', on' : ''}`}
                aria-pressed={on}
                onClick={() => tap(k.voice, step)}
              />
            );
          })}
        </Row>
      ))}
    </div>
  );
}

function Row({ name, aux, children }: { name: string; aux: boolean; children: ReactNode }) {
  return (
    <>
      <div className={`rh${aux ? ' aux' : ''}`}>{name}</div>
      {children}
    </>
  );
}
