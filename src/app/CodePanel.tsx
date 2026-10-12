import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../state/store';
import { findToken, generate } from '../codegen/generate';
import * as engine from '../engine/strudel';

/** Generated code with every note token lit up as it plays. */
export default function CodePanel() {
  const song = useStore((s) => s.song);
  const toggleCode = useStore((s) => s.toggleCode);
  const g = useMemo(() => generate(song), [song]);
  const preRef = useRef<HTMLPreElement>(null);

  const parts = useMemo(() => {
    const out: { text: string; tok?: number; com?: boolean }[] = [];
    let pos = 0;
    const plain = (text: string) => {
      // Dim comment runs inside plain text.
      text.split(/(\/\/[^\n]*)/).forEach((t) => t && out.push({ text: t, com: t.startsWith('//') }));
    };
    g.tokens.forEach((t, i) => {
      if (t.start > pos) plain(g.code.slice(pos, t.start));
      out.push({ text: g.code.slice(t.start, t.end), tok: i });
      pos = t.end;
    });
    plain(g.code.slice(pos));
    return out;
  }, [g]);

  useEffect(() => {
    return engine.onHap((e) => {
      const tc = g.tracks.find((t) => t.trackId === e.track);
      if (!tc) return;
      const tok = findToken(g.tokens, e.locations, tc.start);
      if (!tok) return;
      const i = g.tokens.indexOf(tok);
      const delay = Math.max(0, (e.time - engine.audioTime()) * 1000);
      setTimeout(() => {
        const el = preRef.current?.querySelector(`[data-tok="${i}"]`);
        if (!el) return;
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), Math.max(80, Math.min(e.duration * 1000, 300)));
      }, delay);
    });
  }, [g]);

  return (
    <aside className="code" aria-labelledby="code-h">
      <div className="code-head">
        <h2 id="code-h">Strudel code</h2>
        <span className="muted-text">generated from the song</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(g.code)}>Copy</button>
        <button className="btn sm" onClick={toggleCode}>Close</button>
      </div>
      <pre ref={preRef}>
        {parts.map((p, i) =>
          p.tok !== undefined ? <span key={i} className="tok" data-tok={p.tok}>{p.text}</span> : p.com ? <span key={i} className="com">{p.text}</span> : p.text,
        )}
      </pre>
      <div className="code-foot">Each track is a block: one constant per clip, and a line that plays the active clips. A muted track's line starts with <code>_</code>. Read-only for now; editing comes in Phase 6.</div>
    </aside>
  );
}
