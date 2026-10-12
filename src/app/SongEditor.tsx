import { useStore } from '../state/store';
import * as player from '../engine/player';

/** The song order: scenes in sequence, each played for a number of bars. The song loops at the end. */
export default function SongEditor({ onClose }: { onClose(): void }) {
  const { song, songMode, transport, addSongStep, setSongStep, moveSongStep, removeSongStep, setSongMode } = useStore();
  const total = song.arrangement.reduce((a, st) => a + st.bars, 0);
  const seconds = (total * 4 * 60) / song.bpm;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="song-h">
        <div className="dialog-h"><h2 id="song-h">Song order</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        <div className="dialog-b">
          {song.scenes.length === 0 ? (
            <p className="muted-text">Save a scene first: play some clips, then tap <b>+ Save scene</b>.</p>
          ) : (
            <>
              <ol className="song-steps">
                {song.arrangement.map((st, i) => (
                  <li key={i} className="song-step">
                    <span className="num">{i + 1}</span>
                    <select aria-label={`Scene for step ${i + 1}`} value={st.sceneId} onChange={(e) => setSongStep(i, { sceneId: e.target.value })}>
                      {song.scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                    </select>
                    <div className="bpm" aria-label="Bars">
                      <button aria-label="Fewer bars" onClick={() => setSongStep(i, { bars: st.bars - (st.bars > 4 ? 4 : 1) })}>−</button>
                      <output>{st.bars}<small>bars</small></output>
                      <button aria-label="More bars" onClick={() => setSongStep(i, { bars: st.bars + (st.bars >= 4 ? 4 : 1) })}>+</button>
                    </div>
                    <button className="btn sm" aria-label="Move earlier" disabled={i === 0} onClick={() => moveSongStep(i, -1)}>↑</button>
                    <button className="btn sm" aria-label="Move later" disabled={i === song.arrangement.length - 1} onClick={() => moveSongStep(i, 1)}>↓</button>
                    <button className="btn sm" aria-label="Remove step" onClick={() => removeSongStep(i)}>✕</button>
                  </li>
                ))}
              </ol>
              <div className="row">
                <span className="muted-text">Add:</span>
                {song.scenes.map((sc) => <button key={sc.id} className="btn sm" onClick={() => addSongStep(sc.id)}>+ {sc.name}</button>)}
              </div>
              <p className="muted-text">{song.arrangement.length ? `${total} bars, about ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')} at ${song.bpm} BPM. The song loops at the end. A track a scene does not name keeps playing what it played before.` : 'Add scenes in the order they should play.'}</p>
              <div className="row">
                <button className={`btn${songMode ? ' on' : ''}`} disabled={!song.arrangement.length} onClick={() => { setSongMode(!songMode); if (!songMode && transport === 'stopped') player.play(); }}>
                  {songMode ? '■ Stop song mode' : '▶ Play song'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
