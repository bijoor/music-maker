import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as engine from '../engine/strudel';
import type { HapEvent } from '../engine/strudel';
import { BANK, BANKS, BASS_2BAR, CHAIN, CLIP_A, CLIP_B, GROOVE, KIT_VOICES, METRONOME } from './tests';

type Status = 'pending' | 'running' | 'pass' | 'fail' | 'info';
type Result = { status: Status; detail: string };
type Watch = (e: HapEvent) => void;

const TESTS: Record<string, string> = {
  sound: '1. Strudel plays',
  switch: '2. Clip switches exactly on the bar line',
  align: '3. A 2-bar clip launched mid-song starts at its bar 1',
  arrange: '4. Chained clips play in turn (A, A, A, C)',
  latency: '5. Pad latency (tap along)',
  highlight: '6. Played notes map back to code',
  banks: '7. Drum sounds available per machine',
};
const TAPS_NEEDED = 8;
if (import.meta.env.DEV) (window as unknown as { engine: typeof engine }).engine = engine;

export default function Lab() {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [bpm, setBpm] = useState(112);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [log, setLog] = useState<string[]>([]);
  const [lit, setLit] = useState('');
  const [heard, setHeard] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [tapCount, setTapCount] = useState(0);
  const watches = useRef(new Set<Watch>());
  const taps = useRef<{ beats: number[]; offsets: number[] }>({ beats: [], offsets: [] });
  const barRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLSpanElement>(null);

  const say = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 60));
  const set = (key: string, status: Status, detail: string) => setResults((r) => ({ ...r, [key]: { status, detail } }));
  // Each run of a test gets a number; only the latest run of that test may report its result.
  const runs = useRef<Record<string, number>>({});
  const newRun = (key: string) => { const n = (runs.current[key] ?? 0) + 1; runs.current[key] = n; return (status: Status, detail: string) => { if (runs.current[key] === n) set(key, status, detail); }; };
  const barMs = () => 1000 / engine.getCps();

  /** Collect played events with from <= cycle < to, then call done (or after a generous timeout). */
  function collect(from: number, to: number, done: (evs: HapEvent[]) => void) {
    const evs: HapEvent[] = [];
    let finished = false;
    const finish = () => { if (finished) return; finished = true; watches.current.delete(fn); done(evs); };
    const fn: Watch = (e) => {
      if (e.cycle >= from && e.cycle < to) evs.push(e);
      if (e.cycle >= to) finish();
    };
    watches.current.add(fn);
    const wait = (to - engine.cycleNow() + 2) * barMs();
    setTimeout(finish, wait);
  }

  useEffect(() => {
    if (state !== 'ready') return;
    const off = engine.onHap((e) => watches.current.forEach((w) => w(e)));
    let raf = 0;
    const tick = () => {
      const c = engine.cycleNow();
      if (audioRef.current) { const a = engine.audioInfo(); audioRef.current.textContent = `Audio ${a.state} · ${a.sampleRate} Hz`; }
      if (barRef.current) barRef.current.textContent = engine.isStarted() ? `Bar ${Math.floor(c) + 1} · beat ${Math.floor((c % 1) * 4) + 1}` : 'Stopped';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [state]);

  function start() {
    setState('loading');
    engine.initEngine().then(() => {
      engine.setBpm(bpm);
      setState('ready');
      say('Engine ready: samples and synths loaded');
      runBanks();
    }, (err) => { setError(String(err)); setState('error'); });
  }

  /** Compile a clip and launch it on a track at the next bar line. Logs how long compiling took. */
  async function launch(track: string, c: string, opts?: engine.LaunchOptions) {
    engine.unlockAudio();
    const t0 = performance.now();
    const pat = await engine.compile(c);
    const ms = performance.now() - t0;
    const at = engine.launch(track, pat, opts);
    setCode(c);
    say(`Launched on ${track}, bar ${at + 1} (compiled in ${ms.toFixed(0)} ms)`);
    return at;
  }

  // 1. Sound check
  async function testSound() {
    set('sound', 'running', 'Listening…');
    const at = await launch('drums', CLIP_A);
    collect(at, at + 1, (evs) => set('sound', evs.length >= 8 ? 'pass' : 'fail', `${evs.length} events in the first bar`));
  }

  // 2. Bar-line switch: A uses sd, B uses cp.
  async function testSwitch(target: 'A' | 'B') {
    if (!engine.isStarted()) await launch('drums', target === 'A' ? CLIP_B : CLIP_A);
    const report = newRun('switch');
    report('running', 'Waiting for the bar line…');
    const at = await launch('drums', target === 'B' ? CLIP_B : CLIP_A);
    const outgoing = target === 'B' ? 'sd' : 'cp', incoming = target === 'B' ? 'cp' : 'sd';
    collect(at - 1, at + 1, (evs) => {
      const stray = evs.filter((e) => e.value.s === outgoing && e.cycle >= at).length;
      const early = evs.filter((e) => e.value.s === incoming && e.cycle < at).length;
      const first = evs.find((e) => e.value.s === incoming && e.cycle >= at);
      const ok = stray === 0 && early === 0 && !!first;
      report(ok ? 'pass' : 'fail', `Switched to ${target} at bar ${at + 1}; ${outgoing} after it: ${stray}; ${incoming} before it: ${early}; first ${incoming} at bar ${first ? (first.cycle + 1).toFixed(2) : '–'}`);
    });
  }

  // 3. 2-bar clip launched on an odd bar must still start on its bar 1 (c2).
  async function testAlign(aligned: boolean) {
    if (!engine.isStarted()) await launch('drums', GROOVE);
    if (aligned) set('align', 'running', 'Waiting for an odd bar…');
    const at = await launch('bass', BASS_2BAR, { period: 2, quantum: 2, offset: 1, shift: aligned });
    collect(at, at + 1, (evs) => {
      const first = evs.find((e) => e.value.note !== undefined);
      const note = first ? String(first.value.note) : '–';
      const detail = `${aligned ? 'Aligned' : 'Not aligned (comparison)'}: launched at bar ${at + 1}, first note ${note} (the clip's bar 1 starts on c2)`;
      if (aligned) set('align', note === 'c2' ? 'pass' : 'fail', detail);
      else setResults((r) => (r.align && r.align.status !== 'running' && r.align.status !== 'info' ? r : { ...r, align: { status: 'info', detail } }));
      say(detail);
    });
  }

  // 4. arrange(): three bars of groove, one bar of fill (only the fill has cp).
  async function testArrange() {
    if (engine.isStarted()) engine.stopTrack('bass');
    const report = newRun('arrange');
    report('running', 'Listening for 8 bars…');
    setHeard([]);
    const at = await launch('drums', CHAIN, { period: 4 });
    const bars: boolean[] = Array(8).fill(false);
    const seen = new Set<number>();
    const live: Watch = (e) => {
      const b = Math.floor(e.cycle) - at;
      if (b < 0 || b > 7) return;
      seen.add(b);
      if (e.value.s === 'cp') bars[b] = true;
      setHeard([...seen].sort((x, y) => x - y).map((i) => (bars[i] ? 'C' : 'A')));
    };
    watches.current.add(live);
    collect(at, at + 8, () => {
      watches.current.delete(live);
      const seq = bars.map((c) => (c ? 'C' : 'A')).join(' ');
      report(seq === 'A A A C A A A C' ? 'pass' : 'fail', `Bars ${at + 1}–${at + 8}: ${seq} (expected A A A C A A A C)`);
    });
  }

  // 5. Latency: tap along to the metronome; offset = tap time − nearest click time.
  async function startTaps() {
    if (engine.isStarted()) engine.stopTrack('bass');
    taps.current = { beats: [], offsets: [] };
    setTapCount(0);
    const fn: Watch = (e) => { if (e.value.s === 'rim') taps.current.beats.push(e.time); };
    watches.current.add(fn);
    setTimeout(() => watches.current.delete(fn), 120000);
    await launch('drums', METRONOME);
    const info = engine.audioInfo();
    set('latency', 'running', `Tap the Tap button on every click, ${TAPS_NEEDED} times. Browser output latency ${fmtMs(info.outputLatency)}, base ${fmtMs(info.baseLatency)}.`);
  }
  function tap() {
    engine.trigger({ s: 'cp', bank: BANK });
    const t = engine.audioTime(), beats = taps.current.beats;
    if (!beats.length) { say('Start the metronome first'); return; }
    const nearest = beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    taps.current.offsets.push((t - nearest) * 1000);
    const o = taps.current.offsets;
    setTapCount(o.length);
    if (o.length >= TAPS_NEEDED) {
      const recent = o.slice(-TAPS_NEEDED), mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
      const info = engine.audioInfo();
      set('latency', 'info', `Average tap offset ${mean.toFixed(0)} ms (spread ±${sd.toFixed(0)} ms) over ${recent.length} taps. Browser output latency ${fmtMs(info.outputLatency)}. A record offset of about ${Math.max(0, mean).toFixed(0)} ms would line taps up with the beat.`);
    }
  }

  // 6. Highlighting: the played event carries the character range of its token.
  async function testHighlight() {
    set('highlight', 'running', 'Listening…');
    const at = await launch('drums', CLIP_A);
    const flash: Watch = (e) => {
      const loc = e.locations[0];
      if (loc) setTimeout(() => { setLit(`${loc.start}-${loc.end}`); setTimeout(() => setLit(''), 90); }, Math.max(0, (e.time - engine.audioTime()) * 1000));
    };
    watches.current.add(flash);
    setTimeout(() => watches.current.delete(flash), barMs() * 4);
    collect(at, at + 2, (evs) => {
      const withLoc = evs.filter((e) => e.locations.length).length;
      set('highlight', evs.length && withLoc === evs.length ? 'pass' : 'fail', `${withLoc} of ${evs.length} events carried a code location`);
    });
  }

  function runBanks() {
    const lines = BANKS.map((b) => {
      const have = engine.bankVoices(b);
      const missing = KIT_VOICES.filter((v) => !have.includes(v));
      return `${b}: ${have.length ? `missing ${missing.length ? missing.join(', ') : 'none'}` : 'not found'}`;
    });
    set('banks', 'info', lines.join(' · '));
  }

  function copyResults() {
    const info = engine.audioInfo();
    const text = [`Phase 0 results — ${new Date().toISOString()}`, navigator.userAgent, `Audio: ${info.sampleRate} Hz, output latency ${fmtMs(info.outputLatency)}, base ${fmtMs(info.baseLatency)}`, '',
      ...Object.entries(TESTS).map(([k, name]) => `${name}: ${results[k]?.status ?? 'not run'} — ${results[k]?.detail ?? ''}`), '', 'Log:', ...log.slice(0, 20)].join('\n');
    navigator.clipboard?.writeText(text).then(() => say('Results copied'), () => say('Copy failed; select the results text instead'));
  }

  if (state !== 'ready') {
    return (
      <main className="lab start">
        <h1>Music Maker · Phase 0</h1>
        <p>Checks that Strudel can do what the loop editor needs: switch clips on the bar line, line up multi-bar clips, chain clips, and play pads without delay. Use headphones or speakers.</p>
        <p className="hint">On iPad: turn the volume up. If you hear nothing, check that Silent mode is off in Control Center.</p>
        <button className="big" onClick={start} disabled={state === 'loading'}>{state === 'loading' ? 'Loading sounds…' : 'Start audio'}</button>
        {state === 'error' && <p className="err">Could not start: {error}</p>}
      </main>
    );
  }

  return (
    <main className="lab">
      <header>
        <h1>Phase 0 tests</h1>
        <span className="bar" ref={barRef}>Stopped</span>
        <label>BPM <input type="number" min={60} max={200} value={bpm} onChange={(e) => { const v = +e.target.value; setBpm(v); engine.setBpm(v); }} /></label>
        <button onClick={() => { engine.stop(); setCode(''); say('Stopped'); }}>Stop</button>
        <button onClick={() => { engine.beep(); say('Beep (plain Web Audio, no Strudel)'); }}>Beep</button>
        <button onClick={copyResults}>Copy results</button>
        <span className="audio" ref={audioRef} />
      </header>

      <section className="tests">
        <Card k="sound" results={results}><button onClick={testSound}>Play clip A</button></Card>
        <Card k="switch" results={results}>
          <button onClick={() => testSwitch('B')}>Switch to B on next bar</button>
          <button onClick={() => testSwitch('A')}>Switch to A on next bar</button>
        </Card>
        <Card k="align" results={results}>
          <button onClick={() => testAlign(true)}>Launch 2-bar bass (aligned)</button>
          <button className="ghost" onClick={() => testAlign(false)}>Launch without aligning (compare)</button>
        </Card>
        <Card k="arrange" results={results}>
          <button onClick={testArrange}>Play A, A, A, C</button>
          <span className="heard">{heard.map((h, i) => <b key={i} className={h === 'C' ? 'fill' : ''}>{h}</b>)}</span>
        </Card>
        <Card k="latency" results={results}>
          <button onClick={startTaps}>Start metronome</button>
          <button className="tap" onPointerDown={tap}>Tap<small>{tapCount} / {TAPS_NEEDED}</small></button>
          <span className="pads">{['bd', 'sd', 'hh', 'oh'].map((v) => <button key={v} className="pad" onPointerDown={() => engine.trigger({ s: v, bank: BANK })}>{v}</button>)}</span>
        </Card>
        <Card k="highlight" results={results}>
          <button onClick={testHighlight}>Play and highlight</button>
        </Card>
        <Card k="banks" results={results}><button onClick={runBanks}>Check again</button></Card>
      </section>

      <section className="code">
        <h2>Last launched clip</h2>
        <pre>{renderCode(code, lit)}</pre>
      </section>
      <section className="log"><h2>Log</h2><pre>{log.join('\n')}</pre></section>
    </main>
  );
}

function Card({ k, results, children }: { k: string; results: Record<string, Result>; children: ReactNode }) {
  const r = results[k];
  const label = { pass: 'Pass', fail: 'Fail', info: 'Info', running: 'Running…', pending: 'Not run' }[r?.status ?? 'pending'];
  return (
    <div className={`card ${r?.status ?? 'pending'}`}>
      <div className="title"><strong>{TESTS[k]}</strong><span className="badge">{label}</span></div>
      <div className="actions">{children}</div>
      {r && <p className="detail">{r.detail}</p>}
    </div>
  );
}

function renderCode(code: string, lit: string) {
  if (!lit || !code) return code;
  const [a, b] = lit.split('-').map(Number);
  return <>{code.slice(0, a)}<mark>{code.slice(a, b)}</mark>{code.slice(b)}</>;
}

const fmtMs = (s: number | null) => (s == null ? 'n/a' : `${(s * 1000).toFixed(0)} ms`);
