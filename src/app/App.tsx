import { useEffect } from 'react';
import './app.css';
import { useStore } from '../state/store';
import * as engine from '../engine/strudel';
import Transport from './Transport';
import ClipGrid from './ClipGrid';
import ClipEditor from './ClipEditor';
import CodePanel from './CodePanel';

export default function App() {
  const codeOpen = useStore((s) => s.codeOpen);
  const message = useStore((s) => s.message);
  const setMessage = useStore((s) => s.setMessage);
  usePendingClear();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(t);
  }, [message, setMessage]);
  return (
    <div className="app">
      <Transport />
      <ClipGrid />
      <ClipEditor />
      {codeOpen && <CodePanel />}
      {message && <div className="toast" role="status">{message}</div>}
    </div>
  );
}

/** Clears a track's "queued" look once the bar it was waiting for has started. */
function usePendingClear() {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { pendingAt, setPending } = useStore.getState();
      const now = engine.cycleNow();
      for (const [id, at] of Object.entries(pendingAt)) if (now >= at) setPending(id, null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
