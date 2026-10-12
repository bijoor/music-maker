import { useStore } from '../state/store';
import { isAudible } from '../codegen/generate';

const LETTERS = 'ABCDEFGH';

export default function ClipGrid() {
  const { song, pendingAt, transport, tapSlot, stopTrack, stopAllTracks, toggleMute, toggleSolo } = useStore();
  const playing = transport === 'playing';

  return (
    <section className="card grid-card" aria-label="Clips">
      <div className="grid-head">
        <h2>Clips</h2>
        <span className="muted-text">Tap a clip to play it from the next bar; tap it again to stop it.</span>
        <span className="spacer" />
        <button className="btn sm" onClick={stopAllTracks}>Stop all clips</button>
      </div>
      <div className="rows">
        {song.tracks.map((t) => {
          const queued = playing && pendingAt[t.id] !== undefined;
          return (
            <div key={t.id} className={`trow${isAudible(song, t) ? '' : ' silenced'}`} style={{ ['--tc' as string]: t.color }}>
              <div className="thd">
                <span className="c" style={{ background: t.color }} />
                <strong>{t.name}</strong>
                <span className="ms">
                  <button className="m" aria-pressed={t.mute} aria-label={`Mute ${t.name}`} onClick={() => toggleMute(t.id)}>M</button>
                  <button className="s" aria-pressed={t.solo} aria-label={`Solo ${t.name}`} onClick={() => toggleSolo(t.id)}>S</button>
                </span>
              </div>
              {t.slots.map((clip, i) =>
                clip ? (
                  <button
                    key={i}
                    className={`slot${t.active.includes(i) ? (queued ? ' queued' : ' active') : ''}`}
                    aria-pressed={t.active.includes(i)}
                    onClick={() => tapSlot(t.id, i)}
                  >
                    <strong>{clip.name}</strong>
                    <span>{LETTERS[i]} · {clip.bars} bar{clip.bars > 1 ? 's' : ''}{t.active.includes(i) && queued ? ' · next bar' : ''}</span>
                  </button>
                ) : (
                  <div key={i} className="slot empty" aria-label={`Empty slot ${LETTERS[i]}`}>+</div>
                ),
              )}
              <button className="tstop" aria-label={`Stop ${t.name}`} onClick={() => stopTrack(t.id)}>■</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
