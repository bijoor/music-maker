import { selectedClip, useStore } from '../state/store';
import { STEPS_PER_BAR } from '../model/types';

/** Edit mode, Play view: shows and sets the step where the next pad or key press is placed. */
export default function StepStrip() {
  const state = useStore();
  const { mode, cursor, page, setUi, setPage } = state;
  const clip = selectedClip(state);
  if (mode !== 'edit' || !clip) return null;
  const total = clip.bars * STEPS_PER_BAR;
  const cur = cursor % total;
  const bar = Math.floor(cur / STEPS_PER_BAR);
  if (bar !== page) queueMicrotask(() => setPage(bar));
  const move = (by: number) => setUi({ cursor: (cur + by + total) % total });

  return (
    <div className="stepstrip" aria-label="Where the next note goes">
      <span className="muted-text">Next note: bar {bar + 1}, step {(cur % STEPS_PER_BAR) + 1}</span>
      <button className="btn sm" aria-label="Previous step" onClick={() => move(-1)}>◀</button>
      <div className="steps">
        {Array.from({ length: STEPS_PER_BAR }, (_, s) => {
          const step = bar * STEPS_PER_BAR + s;
          return <button key={s} className={`${s % 4 === 0 ? 'b' : ''}${step === cur ? ' cur' : ''}`} aria-label={`Step ${s + 1}`} aria-pressed={step === cur} onClick={() => setUi({ cursor: step })}>{s % 4 === 0 ? s / 4 + 1 : ''}</button>;
        })}
      </div>
      <button className="btn sm" aria-label="Next step" onClick={() => move(1)}>▶</button>
    </div>
  );
}
