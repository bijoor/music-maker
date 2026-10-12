import { useState } from 'react';
import { selectedClip, selectedTrack, useStore } from '../state/store';
import { BANKS } from '../model/kit';
import { DRUM_PRESETS } from '../model/presets';
import type { Bars } from '../model/types';
import DrumGrid from './DrumGrid';
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
  const [menu, setMenu] = useState<'clip' | 'track' | null>(null);
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
          <select aria-label="Drum machine" value={track.bank} onChange={(e) => setBank(track.id, e.target.value)}>
            {BANKS.map((b) => <option key={b} value={b}>{b.replace('Roland', '')}</option>)}
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
            {Object.keys(DRUM_PRESETS).map((n) => <option key={n}>{n}</option>)}
          </select>
        )}
        <span className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button aria-pressed={view === 'play'} onClick={() => setView('play')}>Play</button>
        </div>
        <div className="menuwrap">
          {clip && slot !== null && <button className="btn sm" aria-expanded={menu === 'clip'} onClick={() => setMenu(menu === 'clip' ? null : 'clip')}>Clip ⋯</button>}
          <button className="btn sm" aria-expanded={menu === 'track'} onClick={() => setMenu(menu === 'track' ? null : 'track')}>Track ⋯</button>
          {menu === 'clip' && clip && slot !== null && (
            <div className="menu right" role="menu">
              <button role="menuitem" onClick={() => { duplicateClip(track.id, slot); setMenu(null); }}>Duplicate to a free slot</button>
              <button role="menuitem" onClick={() => { clearClip(track.id, slot); setMenu(null); }}>Clear notes</button>
              <button role="menuitem" onClick={() => { deleteClip(track.id, slot); setMenu(null); }}>Delete clip</button>
            </div>
          )}
          {menu === 'track' && (
            <div className="menu right" role="menu">
              <button role="menuitem" onClick={() => { if (confirm(`Remove the ${track.name} track and its clips?`)) removeTrack(track.id); setMenu(null); }}>Remove track</button>
            </div>
          )}
        </div>
      </div>
      <div className="ebody">
        {track.kind === 'melodic' ? (
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
