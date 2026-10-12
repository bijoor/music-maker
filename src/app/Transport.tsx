import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { SCALES, TONICS } from '../model/scales';
import * as engine from '../engine/strudel';
import * as player from '../engine/player';

export default function Transport() {
  const { song, transport, codeOpen, setBpm, setTonic, setScale, toggleCode, resetSong } = useStore();
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
        onClick={() => (transport === 'playing' ? player.stop() : player.play())}
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
      <select aria-label="Scale" value={song.key.scaleId} onChange={(e) => setScale(e.target.value)}>
        <optgroup label="Western">{group('Western')}</optgroup>
        <optgroup label="Ragas">{group('Ragas')}</optgroup>
        {song.customScales.length > 0 && <optgroup label="My scales">{group('Custom')}</optgroup>}
      </select>
      <span className="spacer" />
      <button className="btn sm" onClick={() => { if (confirm('Replace your song with the demo song? Your current clips will be lost.')) resetSong(); }}>Reset demo</button>
      <a className="btn sm" href="#lab">Tests</a>
      <button className={`btn${codeOpen ? ' on' : ''}`} aria-pressed={codeOpen} onClick={toggleCode}>Code</button>
    </header>
  );
}
