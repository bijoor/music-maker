import { useEffect, useRef, useState } from 'react';
import PanelFrame from './PanelFrame';
import * as engine from '../engine/strudel';
import * as recorder from '../engine/recorder';
import { useStore } from '../state/store';
import { voiceSound } from '../model/kit';

/**
 * Tap test: two pads and a record of every touch, to find the speed at which taps stop being heard. Each pad
 * counts touches the screen reported, presses that reached the page and strokes played; the engine's count of
 * sounds that started is shared. The log shows each event as it arrived, with the gap since the last tap.
 */
const PADS = [
  { name: 'Na', voice: 'tabla_na', hand: 'right' as const },
  { name: 'Ge', voice: 'tabla_ge', hand: 'left' as const },
];
interface Entry { t: number; pad: number; what: string; gap?: number }
interface Counts { touches: number; presses: number; strokes: number }

export default function TapTest() {
  const pads = useRef<(HTMLDivElement | null)[]>([]);
  const log = useRef<Entry[]>([]);
  const counts = useRef<Counts[]>(PADS.map(() => ({ touches: 0, presses: 0, strokes: 0 })));
  const presses = useRef<number[]>([]);
  const t0 = useRef(performance.now());
  const startedAt = useRef(engine.latencyStats().taps.started);
  const best = useRef(0);
  const [, redraw] = useState(0);
  // App path: the drums' own stroke handling (a new stroke stops older ones on the same head) on the selected
  // drum track; off, the engine alone.
  const [appPath, setAppPath] = useState(false);
  const appRef = useRef(appPath);
  appRef.current = appPath;
  const track = useStore((s) => s.song.tracks.find((t) => t.id === s.selected.trackId && t.kind === 'drums'));
  const trackRef = useRef(track);
  trackRef.current = track;

  useEffect(() => {
    engine.unlockAudio();
    void engine.initEngine().then(() => engine.preload(PADS.map((p) => ({ s: p.voice }))));
    const add = (pad: number, what: string, t: number, tap = false) => {
      let gap: number | undefined;
      if (tap) {
        const last = presses.current[presses.current.length - 1];
        if (last !== undefined) gap = t - last;
        presses.current.push(t);
        if (presses.current.length > 200) presses.current.shift();
      }
      log.current.unshift({ t: t - t0.current, pad, what, gap });
      if (log.current.length > 80) log.current.pop();
    };
    const offs: (() => void)[] = [];
    pads.current.forEach((el, i) => {
      if (!el) return;
      const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
        el.addEventListener(type, fn, opts);
        offs.push(() => el.removeEventListener(type, fn, opts));
      };
      on('touchstart', (e) => { e.preventDefault(); counts.current[i].touches += e.changedTouches.length; add(i, `touch ×${e.changedTouches.length}`, e.timeStamp); }, { passive: false });
      on('touchend', (e) => add(i, `lift ×${e.changedTouches.length}`, e.timeStamp));
      on('touchcancel', (e) => add(i, `touch cancelled ×${e.changedTouches.length}`, e.timeStamp));
      on('pointerdown', (e) => {
        counts.current[i].presses++;
        add(i, 'press', e.timeStamp, true);
        const p = PADS[i], tr = trackRef.current;
        if (appRef.current && tr) recorder.drum(tr.id, p.voice, voiceSound(tr.bank, p.voice), e.timeStamp, 1, [p.hand], false);
        else engine.hold({ s: p.voice }, 2);
        counts.current[i].strokes++;
        el.classList.add('down');
        setTimeout(() => el.classList.remove('down'), 90);
      });
      on('pointercancel', (e) => add(i, 'press cancelled', e.timeStamp));
    });
    // Redraw a few times a second (not on every tap, so the test itself does not slow playing down).
    const timer = setInterval(() => {
      const now = performance.now(), recent = presses.current.filter((t) => t > now - 1000).length;
      best.current = Math.max(best.current, recent);
      redraw((n) => n + 1);
    }, 150);
    return () => { offs.forEach((off) => off()); clearInterval(timer); };
  }, []);

  const reset = () => {
    log.current = [];
    counts.current = PADS.map(() => ({ touches: 0, presses: 0, strokes: 0 }));
    presses.current = [];
    best.current = 0;
    t0.current = performance.now();
    startedAt.current = engine.latencyStats().taps.started;
    redraw((n) => n + 1);
  };
  const now = performance.now();
  const rate = presses.current.filter((t) => t > now - 1000).length;
  const gaps = log.current.filter((e) => e.gap !== undefined).slice(0, 8).map((e) => e.gap!);
  const total = counts.current.reduce((a, c) => ({ touches: a.touches + c.touches, presses: a.presses + c.presses, strokes: a.strokes + c.strokes }), { touches: 0, presses: 0, strokes: 0 });
  const started = engine.latencyStats().taps.started - startedAt.current;

  return (
    <PanelFrame title="Tap test" actions={
      <>
        <button className={`btn sm${appPath ? ' on' : ''}`} aria-pressed={appPath} disabled={!track} title={track ? 'Play through the drums’ own stroke handling on the selected drum track' : 'Select a drum track to use its stroke handling'} onClick={() => setAppPath(!appPath)}>App’s stroke handling</button>
        <button className="btn sm" onClick={reset}>Reset</button>
      </>
    }>
      <div className="taptest">
        <div className="tappads">
          {PADS.map((p, i) => (
            <div key={p.voice} ref={(el) => { pads.current[i] = el; }} className="tappad" role="button" aria-label={p.name}>
              <strong>{p.name}</strong>
              <span>touches {counts.current[i].touches} · presses {counts.current[i].presses} · strokes {counts.current[i].strokes}</span>
            </div>
          ))}
        </div>
        <div className="tapstats">
          <p><strong>{rate}</strong> taps in the last second (fastest {best.current}/s) · last gaps {gaps.map((g) => `${Math.round(g)}`).join(', ') || '—'} ms</p>
          <p>Touches {total.touches} → presses {total.presses} → strokes {total.strokes} → sounds started {started}{total.touches > total.presses ? ` · ${total.touches - total.presses} touches never became presses` : ''}{total.strokes > started ? ` · ${total.strokes - started} strokes did not start a sound` : ''}</p>
          <ol className="taplog">
            {log.current.map((e, k) => (
              <li key={k} className={e.what.startsWith('touch ') ? 'touch' : e.what === 'press' ? 'press' : ''}>
                <code>{(e.t / 1000).toFixed(3)}s</code> {PADS[e.pad].name} {e.what}{e.gap !== undefined ? ` · ${Math.round(e.gap)} ms after the last press` : ''}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PanelFrame>
  );
}
