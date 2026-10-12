import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { useStore } from '../state/store';
import { findToken, generate } from '../codegen/generate';
import { parseCode } from '../codegen/parse';
import * as engine from '../engine/strudel';
import PanelFrame from './PanelFrame';

// Playing notes light up in the code: ranges are added and removed with effects.
const flash = StateEffect.define<{ from: number; to: number; on: boolean }>();
const hitMark = Decoration.mark({ class: 'cm-hit' });
const flashes = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(flash)) continue;
      const { from, to, on } = e.value;
      deco = on ? deco.update({ add: [hitMark.range(from, to)] }) : deco.update({ filter: (f, t) => !(f === from && t === to) });
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', background: 'var(--code-bg)', color: 'var(--fg)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-gutters': { background: 'var(--panel)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--accent) 8%, transparent)' },
  '.cm-hit': { background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: '3px' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'color-mix(in srgb, var(--accent) 25%, transparent)' },
});

/**
 * The generated Strudel code, editable. Apply (or Cmd/Ctrl+Enter) reads the edit back into the song: clips the
 * grid can show stay normal clips, the rest become custom code. While there are unapplied edits the view stops
 * following the song; Revert drops them.
 */
export default function CodeView() {
  const { song, songMode, applySong } = useStore();
  const g = useMemo(() => generate(song, { songMode }), [song, songMode]);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const shown = useRef(g.code); // the generated code the editor last showed
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ notes: string[]; errors: string[] } | null>(null);
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: shown.current,
        extensions: [
          basicSetup,
          javascript(),
          theme,
          flashes,
          keymap.of([{ key: 'Mod-Enter', run: () => { applyRef.current(); return true; } }]),
          EditorView.updateListener.of((u) => { if (u.docChanged) setDirty(u.state.doc.toString() !== shown.current); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, []);

  // Follow the song while there are no unapplied edits.
  useEffect(() => {
    const v = view.current;
    if (!v || dirty || v.state.doc.toString() === g.code) { shown.current = g.code; return; }
    shown.current = g.code;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: g.code } });
  }, [g.code, dirty]);

  // Light up notes as they play (only while the editor shows exactly the generated code).
  useEffect(() => {
    return engine.onHap((e) => {
      const v = view.current;
      if (!v || dirty) return;
      const tc = g.tracks.find((t) => t.trackId === e.track);
      const tok = tc && findToken(g.tokens, e.locations, tc.start);
      if (!tok || tok.end > v.state.doc.length) return;
      const range = { from: tok.start, to: tok.end };
      const delay = Math.max(0, (e.time - engine.audioTime()) * 1000);
      setTimeout(() => {
        view.current?.dispatch({ effects: flash.of({ ...range, on: true }) });
        setTimeout(() => view.current?.dispatch({ effects: flash.of({ ...range, on: false }) }), Math.max(80, Math.min(e.duration * 1000, 300)));
      }, delay);
    });
  }, [g, dirty]);

  const apply = async () => {
    const v = view.current;
    if (!v || busy) return;
    setBusy(true);
    try {
      const res = await parseCode(v.state.doc.toString(), useStore.getState().song);
      setReport(res.errors.length || res.notes.length ? { notes: res.notes, errors: res.errors } : { notes: ['No changes'], errors: [] });
      if (!res.errors.length || res.notes.length) applySong(res.song);
      if (!res.errors.length) setDirty(false);
    } finally {
      setBusy(false);
    }
  };
  // The editor's Mod-Enter key binding calls the latest apply.
  useEffect(() => { applyRef.current = apply; });
  const revert = () => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: g.code } });
    setDirty(false);
    setReport(null);
  };

  return (
    <PanelFrame
      title="Strudel code"
      actions={
        <>
          <span className="muted-text">{dirty ? 'Edited · not applied' : songMode ? 'Song mode' : 'Follows the song'}</span>
          <button className="btn sm" disabled={!dirty} onClick={revert}>Revert</button>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(view.current?.state.doc.toString() ?? g.code)}>Copy</button>
          <button className={`btn sm${dirty ? ' on' : ''}`} disabled={!dirty || busy} onClick={apply} title="Cmd/Ctrl + Enter">{busy ? 'Applying…' : 'Apply'}</button>
        </>
      }
    >
      <div className="codeview">
        <div className="cm-host" ref={host} />
        {report && (
          <div className={`code-report${report.errors.length ? ' bad' : ''}`} role="status">
            {report.errors.map((x, i) => <div key={`e${i}`}>⚠ {x}</div>)}
            {report.notes.map((x, i) => <div key={`n${i}`}>{x}</div>)}
          </div>
        )}
        <p className="muted-text code-hint">Edit inside a track's block, then Apply. Clips that fit the grid stay editable on the grid; anything else is kept as custom code and still plays.</p>
      </div>
    </PanelFrame>
  );
}
