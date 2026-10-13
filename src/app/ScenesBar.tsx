import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import * as player from '../engine/player';

/**
 * Scenes (the song's sequences) and song mode. The current scene (highlighted) follows what the tracks play;
 * + New scene starts the next one as a copy of it. Tap a scene to make it current (it plays from the next bar);
 * in Edit mode the tap turns it into a name box, with a menu to set how shorter tracks fit, add it to the song or
 * delete it.
 */
export default function ScenesBar() {
  const { song, mode, songMode, transport, panel, setPanel, newScene, launchScene, setSceneFit, renameScene, deleteScene, addSongStep, setSongMode } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The scene list scrolls sideways, so the menu is placed on the screen (fixed) under its button.
  const [menuAt, setMenuAt] = useState({ left: 0, top: 0 });
  const close = () => { setMenuFor(null); setEditing(null); };
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

  return (
    <div className="scenes">
      <span className="lbl">Scenes</span>
      <div className="scene-list">
        {song.scenes.length === 0 && <span className="muted-text">Play some clips, then start a scene.</span>}
        {song.scenes.map((sc) =>
          editing === sc.id ? (
            <span key={sc.id} className="scene-edit">
              <input
                autoFocus
                aria-label="Scene name"
                defaultValue={sc.name}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  // Enter saves the name, Escape keeps the old one; both finish editing.
                  if (e.key === 'Enter') { renameScene(sc.id, e.currentTarget.value); close(); }
                  if (e.key === 'Escape') close();
                }}
                onBlur={(e) => { if (editing === sc.id) renameScene(sc.id, e.target.value); if (!menuFor) setEditing(null); }}
              />
              <span className="menuwrap">
                <button className="btn sm" aria-label={`More for ${sc.name}`} aria-expanded={menuFor === sc.id} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuAt({ left: Math.min(r.left, innerWidth - 260), top: r.bottom + 4 }); setMenuFor(menuFor === sc.id ? null : sc.id); }}>⋯</button>
                {menuFor === sc.id && (
                  <div className="menu fixed" role="menu" style={menuAt}>
                    <button role="menuitem" onClick={() => { launchScene(sc.id); close(); }}>Launch</button>
                    <button role="menuitem" onClick={() => { setSceneFit(sc.id, sc.fit === 'cycle' ? 'cut' : 'cycle'); close(); }}>
                      Shorter tracks: {sc.fit === 'cycle' ? 'keep cycling' : 'repeat, cut at the top'} (tap to change)
                    </button>
                    <button role="menuitem" onClick={() => { addSongStep(sc.id); close(); }}>Add to the song</button>
                    <button role="menuitem" onClick={() => { deleteScene(sc.id); close(); }}>Delete scene</button>
                  </div>
                )}
              </span>
            </span>
          ) : (
            <button key={sc.id} className={`scene${sc.id === song.current && !songMode ? ' current' : ''}`} aria-current={sc.id === song.current && !songMode} data-scene={sc.id} onClick={() => (mode === 'edit' ? setEditing(sc.id) : launchScene(sc.id))} title={mode === 'edit' ? 'Rename or change this scene' : sc.id === song.current ? 'The scene being played and built: changes are saved into it' : 'Play this scene from the next bar and carry on building it'}>
              {sc.name}
            </button>
          ),
        )}
        <button className="btn sm" onClick={newScene} title="Start a new scene as a copy of this one; then change tracks one by one to morph into it">＋ New scene</button>
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
      <button className={`btn sm${panel === 'song' ? ' on' : ''}`} aria-pressed={panel === 'song'} onClick={() => setPanel(panel === 'song' ? null : 'song')}>Song order{song.arrangement.length ? ` (${song.arrangement.length})` : ''}</button>
    </div>
  );
}
