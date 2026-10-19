import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { SCALES, TONICS } from '../model/scales';
import * as engine from '../engine/strudel';
import * as player from '../engine/player';
import { connectMidi, type MidiState } from '../engine/midi';

export default function Transport() {
  const { song, transport, panel, setPanel, updateReady, sargam, mode, countIn, metronome, setBpm, setTonic, setScale, toggleCode, resetSong, setUi, setMode, touchVelocity, setTouchVelocity, pitchSnap, setPitchSnap, slideStill, setSlideStill, openRecorder, newSong, setMessage } = useStore();
  const [more, setMore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [midi, setMidi] = useState<{ state: MidiState; devices: string[] }>({ state: 'off', devices: [] });
  const connect = () =>
    connectMidi((state, devices) => {
      setMidi({ state, devices });
      const msg: Record<MidiState, string> = {
        off: '', unsupported: 'This browser has no Web MIDI (Safari and iPad do not support it); use Chrome or Edge on a computer',
        denied: 'MIDI access was not allowed', waiting: 'MIDI on: plug in a keyboard or pad controller',
        connected: `MIDI: ${devices.join(', ')} plays the selected track`,
      };
      useStore.getState().setMessage(msg[state]);
    });
  const barRef = useRef<HTMLElement>(null);
  const dotsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0, last = '';
    const tick = () => {
      const started = engine.isStarted();
      const c = started ? engine.cycleNow() : 0;
      const bar = Math.floor(c), beat = Math.floor((c - bar) * 4);
      const key = started ? `${bar}:${beat}` : 'stopped';
      if (key !== last) {
        last = key;
        if (barRef.current) barRef.current.textContent = `Bar ${started ? bar + 1 : 1}`;
        dotsRef.current?.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', started && i <= beat));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scales = [...SCALES, ...song.customScales];
  const group = (g: string) => scales.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.name}</option>);

  return (
    <header className="transport">
      <div className="brand">Music Maker</div>
      <button
        className={`btn play${transport === 'playing' ? ' stop' : ''}`}
        disabled={transport === 'loading'}
        aria-label={transport === 'playing' ? 'Stop' : 'Play'}
        onClick={() => (transport === 'playing' ? player.stop() : player.play({ countIn: mode === 'record' && countIn }))}
      >
        {transport === 'playing' ? '■' : transport === 'loading' ? '…' : '▶'}
      </button>
      <div className="counter" aria-live="off">
        <b ref={barRef}>Bar 1</b>
        <span className="beatdots" ref={dotsRef}><i /><i /><i /><i /></span>
      </div>
      {transport === 'loading' && <span className="muted-text">Loading sounds…</span>}
      <div className="bpm">
        <button aria-label="Slower" onClick={() => setBpm(song.bpm - 2)}>−</button>
        <output>{song.bpm}<small>bpm</small></output>
        <button aria-label="Faster" onClick={() => setBpm(song.bpm + 2)}>+</button>
      </div>
      <select aria-label="Key" value={song.key.tonic} onChange={(e) => setTonic(e.target.value)}>
        {TONICS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <select aria-label="Scale" value={song.key.scaleId} onChange={(e) => (e.target.value === '__new' ? setPanel('scale') : setScale(e.target.value))}>
        <optgroup label="Western">{group('Western')}</optgroup>
        <optgroup label="Ragas">{group('Ragas')}</optgroup>
        {song.customScales.length > 0 && <optgroup label="My scales">{group('Custom')}</optgroup>}
        <option value="__new">New custom scale…</option>
      </select>
      <div className="seg modes" role="group" aria-label="Mode">
        <button aria-pressed={mode === 'perform'} onClick={() => setMode('perform')}>Perform</button>
        <button className="rec" aria-pressed={mode === 'record'} onClick={() => setMode('record')}><span className="dot" />Record</button>
        <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>
      </div>
      <button className={`btn sm${metronome ? ' on' : ''}`} aria-pressed={metronome} onClick={() => setUi({ metronome: !metronome })}>Click</button>
      <span className="spacer" />
      <button className={`btn sm songname${panel === 'songs' ? ' on' : ''}`} aria-pressed={panel === 'songs'} title="Songs: new, open, save a copy, export, import" onClick={() => setPanel(panel === 'songs' ? null : 'songs')}>♫ {song.name}</button>
      {updateReady && <button className="btn sm on" onClick={updateReady} title="A new version is ready">Update ready · reload</button>}
      <div className="menuwrap">
        <button className="btn sm" aria-expanded={more} onClick={() => { setMore(!more); setConfirmReset(false); }}>More ⋯</button>
        {more && (
          <div className="menu right" role="menu">
            <button role="menuitem" onClick={() => { player.stop(); newSong(true); setMessage('New blank song · the last one is in Songs'); setMore(false); }}>New blank song</button>
            <button role="menuitem" onClick={() => { setPanel('songs'); setMore(false); }}>Songs: new, open, export, import…</button>
            <button role="menuitem" onClick={() => { connect(); setMore(false); }}>{midi.state === 'connected' ? `MIDI: ${midi.devices.join(', ')}` : midi.state === 'waiting' ? 'MIDI on (no device yet)' : 'Connect a MIDI keyboard or pads'}</button>
            <button role="menuitemcheckbox" aria-checked={sargam} onClick={() => { setUi({ sargam: !sargam }); setMore(false); }}>{sargam ? '✓ ' : ''}Sa Re Ga labels</button>
            <button role="menuitem" onClick={() => { if (confirmReset) { resetSong(); setMore(false); setConfirmReset(false); } else setConfirmReset(true); }}>{confirmReset ? 'Tap again: your clips will be replaced' : 'Reset to the demo song'}</button>
            <button role="menuitem" onClick={() => setTouchVelocity(touchVelocity === 1 ? -1 : touchVelocity === -1 ? 0 : 1)}>
              Strike velocity: {touchVelocity === 1 ? 'louder towards the bottom' : touchVelocity === -1 ? 'louder towards the top' : 'off (always full)'}
            </button>
            <button role="menuitemcheckbox" aria-checked={pitchSnap} onClick={() => setPitchSnap(!pitchSnap)}>{pitchSnap ? '✓ ' : ''}Slides settle on the key under the finger</button>
            <button role="menuitem" onClick={() => setSlideStill(slideStill <= 4 ? 8 : slideStill <= 8 ? 14 : 4)}>
              Slide steadiness: {slideStill <= 4 ? 'fine (4 px)' : slideStill <= 8 ? 'normal (8 px)' : 'steady (14 px)'}
            </button>
            <button role="menuitem" onClick={() => { openRecorder(null); setMore(false); }}>Record a drum kit from an instrument…</button>
            <button role="menuitem" onClick={() => { setPanel('taptest'); setMore(false); }}>Tap test</button>
            <button role="menuitem" onClick={() => { setPanel('about'); setMore(false); }}>About and sound credits</button>
            <a role="menuitem" className="menulink" href="#lab" onClick={() => setMore(false)}>Phase 0 tests</a>
          </div>
        )}
      </div>
      <button className={`btn${panel === 'code' ? ' on' : ''}`} aria-pressed={panel === 'code'} onClick={toggleCode}>Code</button>
    </header>
  );
}
