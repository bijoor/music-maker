import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import * as player from '../engine/player';
import SongEditor from './SongEditor';

/**
 * Saved scenes and song mode. Tap a scene to launch it (in Edit mode: to rename, update or delete it).
 * Song plays the scenes in the order set in the song editor.
 */
export default function ScenesBar() {
  const { song, mode, songMode, transport, saveScene, launchScene, updateScene, renameScene, deleteScene, addSongStep, setSongMode } = useStore();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [songOpen, setSongOpen] = useState(false);
  const posRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0, last = '';
    const tick = () => {
      const p = player.songPosition();
      const { song: s } = useStore.getState();
      const text = p ? `${s.scenes.find((x) => x.id === s.arrangement[p.index]?.sceneId)?.name ?? ''} · bar ${p.bar + 1}/${p.bars}` : '';
      if (text !== last && posRef.current) { posRef.current.textContent = text; last = text; }
      const nowScene = p ? s.arrangement[p.index]?.sceneId : null;
      document.querySelectorAll<HTMLElement>('.scene[data-scene]').forEach((el) => el.classList.toggle('now', el.dataset.scene === nowScene));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scene = song.scenes.find((x) => x.id === editing);

  return (
    <div className="scenes">
      <span className="lbl">Scenes</span>
      <div className="scene-list">
        {song.scenes.length === 0 && <span className="muted-text">Play some clips, then save them as a scene.</span>}
        {song.scenes.map((sc) => (
          <button key={sc.id} className="scene" data-scene={sc.id} onClick={() => (mode === 'edit' ? setEditing(sc.id) : launchScene(sc.id))} title={mode === 'edit' ? 'Edit this scene' : 'Launch at the next bar'}>
            {sc.name}
          </button>
        ))}
        <button className="btn sm" onClick={() => setSaving(true)}>+ Save scene</button>
      </div>
      <span className="spacer" />
      <span className="song-pos muted-text" ref={posRef} />
      <button
        className={`btn sm${songMode ? ' on' : ''}`}
        aria-pressed={songMode}
        disabled={!song.arrangement.length}
        title={song.arrangement.length ? 'Play the song order' : 'Add scenes to the song first'}
        onClick={() => { setSongMode(!songMode); if (!songMode && transport === 'stopped') player.play(); }}
      >
        {songMode ? '■ Song' : '▶ Song'}
      </button>
      <button className="btn sm" onClick={() => setSongOpen(true)}>Song order{song.arrangement.length ? ` (${song.arrangement.length})` : ''}</button>

      {saving && <SaveScene onClose={() => setSaving(false)} onSave={(name, silent) => { saveScene(name, silent); setSaving(false); }} defaultName={`Scene ${song.scenes.length + 1}`} />}
      {scene && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="sc-h">
            <div className="dialog-h"><h2 id="sc-h">Scene: {scene.name}</h2><button className="btn sm" onClick={() => setEditing(null)}>Close</button></div>
            <div className="dialog-b">
              <label className="field"><span className="muted-text">Name</span><input defaultValue={scene.name} onBlur={(e) => renameScene(scene.id, e.target.value)} /></label>
              <p className="muted-text">Plays: {Object.entries(scene.active).map(([tid, act]) => {
                const t = song.tracks.find((x) => x.id === tid);
                return t ? `${t.name} ${act.length ? act.map((i) => 'ABCDEFGH'[i]).join(' ') : '(stopped)'}` : null;
              }).filter(Boolean).join(' · ') || 'nothing'}</p>
              <div className="row">
                <button className="btn" onClick={() => { launchScene(scene.id); setEditing(null); }}>Launch</button>
                <button className="btn" onClick={() => { updateScene(scene.id, true); setEditing(null); }}>Replace with what is playing now</button>
                <button className="btn" onClick={() => { addSongStep(scene.id); setEditing(null); }}>Add to song</button>
                <button className="btn" onClick={() => { if (confirm(`Delete the scene ${scene.name}?`)) { deleteScene(scene.id); setEditing(null); } }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {songOpen && <SongEditor onClose={() => setSongOpen(false)} />}
    </div>
  );
}

function SaveScene({ defaultName, onSave, onClose }: { defaultName: string; onSave(name: string, silent: boolean): void; onClose(): void }) {
  const [name, setName] = useState(defaultName);
  const [silent, setSilent] = useState(true);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="ss-h">
        <div className="dialog-h"><h2 id="ss-h">Save scene</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        <form className="dialog-b" onSubmit={(e) => { e.preventDefault(); onSave(name, silent); }}>
          <p className="muted-text">Saves the clips every track is playing now (including chains), to launch together later.</p>
          <label className="field"><span className="muted-text">Name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Also stop tracks that are silent now when this scene launches</label>
          <div className="row"><button className="btn on" type="submit">Save</button></div>
        </form>
      </div>
    </div>
  );
}
