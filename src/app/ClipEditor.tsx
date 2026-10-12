import { lazy, Suspense, useState } from 'react';
import { selectedClip, selectedTrack, useStore } from '../state/store';
import { BANKS, INDIAN_KITS } from '../model/kit';
import { drumPresets } from '../model/presets';
import type { Bars } from '../model/types';
import DrumGrid from './DrumGrid';
import Calibrate from './Calibrate';
import About from './About';
import SoundStrip from './SoundStrip';
import SongsPanel from './SongsPanel';
import SongEditor from './SongEditor';
import ScaleEditor from './ScaleEditor';
// The code editor (CodeMirror) loads only when the code panel is first opened.
const CodeView = lazy(() => import('./CodeView'));
import DrumPads from './DrumPads';
import NoteGrid from './NoteGrid';
import MelodicPlay from './MelodicPlay';
import { SOUNDS } from '../model/sounds';

const LETTERS = 'ABCDEFGH';

/** The selected clip: its settings, and either the Grid (edit notes) or Play (pads/keys) view. */
export default function ClipEditor() {
  const state = useStore();
  const { view, setView, page, setPage, selected, setClipBars, setBank, setSound, applyPreset, duplicateClip, clearClip, deleteClip, removeTrack } = state;
  const track = selectedTrack(state);
  const clip = selectedClip(state);
  const [menu, setMenu] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (state.panel === 'code') return <Suspense fallback={<section className="card editor empty-editor"><p className="muted-text">Loading the code editor…</p></section>}><CodeView /></Suspense>;
  if (state.panel === 'song') return <SongEditor />;
  if (state.panel === 'scale') return <ScaleEditor />;
  if (state.panel === 'calibrate') return <Calibrate />;
  if (state.panel === 'songs') return <SongsPanel />;
  if (state.panel === 'about') return <About />;
  if (!track) return <section className="card editor empty-editor"><p className="muted-text">Add a track to start.</p></section>;
  const slot = selected.slot;
  const bar = clip ? Math.min(page, clip.bars - 1) : 0;

  return (
    <section className="card editor" style={{ ['--tc' as string]: track.color }} aria-label="Clip editor">
      <div className="ehead">
        <span className="sw" />
        <h2>{track.name}{clip && slot !== null && <span> · {LETTERS[slot]} · {clip.name}</span>}</h2>
        {clip && slot !== null && (
          <>
            <div className="seg" role="group" aria-label="Clip length">
              {([1, 2, 4] as Bars[]).map((n) => <button key={n} aria-pressed={clip.bars === n} onClick={() => setClipBars(track.id, slot, n)}>{n} bar{n > 1 ? 's' : ''}</button>)}
            </div>
            {clip.bars > 1 && (
              <div className="seg" role="group" aria-label="Bar shown">
                {Array.from({ length: clip.bars }, (_, b) => <button key={b} aria-pressed={bar === b} onClick={() => setPage(b)}>Bar {b + 1}</button>)}
              </div>
            )}
          </>
        )}
        {track.kind === 'drums' && (
          <select aria-label="Drum kit" value={track.bank} onChange={(e) => setBank(track.id, e.target.value)}>
            <optgroup label="Drum machines">{BANKS.map((b) => <option key={b} value={b}>{b.replace('Roland', '')}</option>)}</optgroup>
            <optgroup label="Indian">{Object.keys(INDIAN_KITS).map((b) => <option key={b} value={b}>{b}</option>)}</optgroup>
          </select>
        )}
        {track.kind === 'melodic' && (
          <select aria-label="Instrument sound" value={track.sound} onChange={(e) => setSound(track.id, e.target.value)}>
            {[...new Set(SOUNDS.map((x) => x.group))].map((g) => (
              <optgroup key={g} label={g}>{SOUNDS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
            ))}
            {!SOUNDS.some((x) => x.id === track.sound) && <option value={track.sound}>{track.sound}</option>}
          </select>
        )}
        {track.kind === 'drums' && clip && slot !== null && view === 'grid' && (
          <select aria-label="Load a preset into this bar" value="" onChange={(e) => e.target.value && applyPreset(track.id, slot, e.target.value, bar)}>
            <option value="">Preset…</option>
            {Object.keys(drumPresets(track.bank)).map((n) => <option key={n}>{n}</option>)}
          </select>
        )}
        {state.mode === 'record' && (
          <>
            <select aria-label="Snap recorded notes to" value={state.quantize} onChange={(e) => state.setUi({ quantize: +e.target.value })}>
              <option value={1}>Snap 1/16</option>
              <option value={2}>Snap 1/8</option>
              <option value={4}>Snap 1/4</option>
            </select>
            <button className={`btn sm${state.countIn ? ' on' : ''}`} aria-pressed={state.countIn} onClick={() => state.setUi({ countIn: !state.countIn })}>Count-in</button>
            <button className="btn sm" onClick={() => state.setPanel('calibrate')} title={`Record offset ${state.recordOffsetMs} ms`}>Calibrate</button>
          </>
        )}
        <button className="btn sm" disabled={!state.past.length} onClick={state.undo} aria-label="Undo">↶<span className="wide-only"> Undo</span></button>
        <button className="btn sm" disabled={!state.future.length} onClick={state.redo} aria-label="Redo">↷</button>
        <span className="spacer" />
        <button className={`btn sm${state.soundOpen ? ' on' : ''}`} aria-pressed={state.soundOpen} onClick={() => state.setUi({ soundOpen: !state.soundOpen })}>Sound</button>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button aria-pressed={view === 'play'} onClick={() => setView('play')}>Play</button>
        </div>
        <div className="menuwrap">
          <button className="btn sm" aria-expanded={menu} aria-label="Clip and track actions" onClick={() => { setMenu(!menu); setConfirmRemove(false); }}>⋯</button>
          {menu && (
            <div className="menu right" role="menu">
              {clip && slot !== null && (
                <>
                  <button role="menuitem" onClick={() => { duplicateClip(track.id, slot); setMenu(false); }}>Duplicate clip to a free slot</button>
                  <button role="menuitem" onClick={() => { clearClip(track.id, slot); setMenu(false); }}>Clear the clip's notes</button>
                  <button role="menuitem" onClick={() => { deleteClip(track.id, slot); setMenu(false); }}>Delete clip</button>
                </>
              )}
              {track.playCode && <button role="menuitem" onClick={() => { state.resetPlayCode(track.id); setMenu(false); }}>Reset the hand-written play line</button>}
              <button role="menuitem" onClick={() => { if (confirmRemove) { removeTrack(track.id); setMenu(false); setConfirmRemove(false); } else setConfirmRemove(true); }}>{confirmRemove ? `Tap again to remove ${track.name} and its clips` : `Remove the ${track.name} track`}</button>
            </div>
          )}
        </div>
      </div>
      {state.soundOpen && <SoundStrip track={track} />}
      <div className="ebody">
        {clip?.code && slot !== null && view === 'grid' ? (
          <div className="custom-banner">
            <strong>This clip plays hand-written code</strong>
            <span className="muted-text">The grid cannot show it, so it is kept exactly as written. Reset to grid plays the grid notes again (your code is dropped).</span>
            <pre>{clip.code}</pre>
            <div className="row">
              <button className="btn sm" onClick={() => state.resetClipCode(track.id, slot)}>Reset to grid</button>
              <button className="btn sm" onClick={() => state.setPanel('code')}>Open code</button>
            </div>
          </div>
        ) : track.kind === 'melodic' ? (
          view === 'play' ? <MelodicPlay track={track} />
          : clip?.kind === 'melodic' && slot !== null ? <NoteGrid track={track} clip={clip} slot={slot} bar={bar} />
          : <div className="placeholder"><p>Tap <b>+</b> in an empty slot above to make a clip, then tap the grid to add notes.</p></div>
        ) : view === 'play' ? (
          <DrumPads track={track} />
        ) : clip?.kind === 'drums' && slot !== null ? (
          <DrumGrid track={track} clip={clip} slot={slot} bar={bar} />
        ) : (
          <div className="placeholder"><p>Tap <b>+</b> in an empty slot above to make a clip, then tap cells here to add hits.</p></div>
        )}
      </div>
    </section>
  );
}
