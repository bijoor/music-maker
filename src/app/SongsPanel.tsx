import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { listSongs, validSong } from '../state/persist';
import { generate } from '../codegen/generate';
import * as player from '../engine/player';
import PanelFrame from './PanelFrame';

/** Offer a file to save. On iPad this opens the share sheet (Save to Files, AirDrop…). */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safe = (name: string) => name.replace(/[^\w\- ]+/g, '').trim() || 'song';

/** Songs saved in this browser, plus files for moving songs between devices or into strudel.cc. */
export default function SongsPanel() {
  const { song, songId, newSong, openSong, duplicateSong, deleteSong, renameSong, importSong, setMessage } = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const songs = listSongs();
  // Switching songs stops playback first, so nothing from the old song keeps sounding.
  const go = (f: () => void) => { player.stop(); f(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const s = validSong(JSON.parse(await file.text()));
      if (!s) throw new Error('not a Music Maker song');
      go(() => importSong(s));
      setMessage(`Opened ${s.name}`);
    } catch (err) {
      setMessage(`Could not open ${file.name}: ${(err as Error).message}`);
    }
  };

  return (
    <PanelFrame title="Songs">
      <div className="pcontent">
        <label className="field"><span className="muted-text">This song's name</span>
          <input key={songId} defaultValue={song.name} onBlur={(e) => renameSong(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="row">
          <button className="btn" onClick={() => go(() => newSong(true))}>New blank song</button>
          <button className="btn" onClick={() => go(() => newSong())}>New song with drums, bass and keys</button>
          <button className="btn" onClick={() => go(duplicateSong)}>Save a copy</button>
          <button className="btn" onClick={() => download(`${safe(song.name)}.music.json`, JSON.stringify(song, null, 2), 'application/json')}>Export song file</button>
          <button className="btn" onClick={() => download(`${safe(song.name)}.strudel.js`, generate(song).code, 'text/javascript')}>Export Strudel code</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import song file…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <ul className="songlist">
          {songs.map((s) => (
            <li key={s.id} className={s.id === songId ? 'current' : ''}>
              <span className="nm">{s.id === songId ? song.name : s.name}</span>
              <span className="muted-text">{new Date(s.updated).toLocaleString()}</span>
              {s.id === songId ? <span className="pill">Open</span> : <button className="btn sm" onClick={() => go(() => openSong(s.id))}>Open</button>}
              <button className="btn sm" onClick={() => (confirm === s.id ? (go(() => deleteSong(s.id)), setConfirm(null)) : setConfirm(s.id))}>{confirm === s.id ? 'Tap again to delete' : 'Delete'}</button>
            </li>
          ))}
        </ul>
        <p className="muted-text">Songs save themselves on this device as you work (there is no Save button to forget); Save a copy keeps this version and carries on in a copy. Export a song file to keep a copy or move it to another device; the Strudel code file runs in strudel.cc.</p>
      </div>
    </PanelFrame>
  );
}
