import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as engine from '../engine/strudel';
import type { HapEvent } from '../engine/strudel';
import { BANK, BANKS, BASS_2BAR, CLIP_A, CLIP_B, FILL, GROOVE, KIT_VOICES, METRONOME, alignOffset, withOffset } from './tests';

type Status = 'pending' | 'pass' | 'fail' | 'info';
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

export default function Lab() {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [bpm, setBpm] = useState(112);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [log, setLog] = useState<string[]>([]);
  const [lit, setLit] = useState<string>('');
  const [heard, setHeard] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const watches = useRef(new Set<Watch>());
  const taps = useRef<{ beats: number[]; offsets: number[] }>({ beats: [], offsets: [] });
  const barRef = useRef<HTMLSpanElement>(null);

  const say = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 60));
  const set = (key: string, status: Status, detail: string) => setResults((r) => ({ ...r, [key]: { status, detail } }));
  const watch = (fn: Watch, ms: number) => {
    watches.current.add(fn);
    setTimeout(() => watches.current.delete(fn), ms);
  };
  const barMs = () => (1000 / engine.getCps());

  useEffect(() => {
    if (state !== 'ready') return;
    const off = engine.onHap((e) => watches.current.forEach((w) => w(e)));
    let raf = 0;
    const tick = () => {
      const c = engine.cycleNow();
      if (barRef.current) barRef.current.textContent = engine.isStarted() ? `Bar ${Math.floor(c) + 1} · beat ${Math.floor((c % 1) * 4) + 1}` : 'Stopped';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [state]);

  async function start() {
    setState('loading');
    try {
      await engine.initEngine();
      engine.setBpm(bpm);
      setState('ready');
      say('Engine ready: samples and synths loaded');
      runBanks();
    } catch (err) {
      setError(String(err));
      setState('error');
    }
  }

  async function play(c: string, at?: { cycle: number; period?: number }) {
    setCode(c);
    await engine.evaluate(c, at);
  }

  // 1. Sound check
  async function testSound() {
    let count = 0;
    watch(() => count++, 3000);
    await play(`$: ${CLIP_A}`);
    setTimeout(() => set('sound', count > 8 ? 'pass' : 'fail', `${count} events played in 2.5 s`), 2500);
    say('Playing clip A');
  }

  // 2. Bar-line switch: A uses sd, B uses cp.
  async function testSwitch(target: 'A' | 'B', quantised: boolean) {
    if (!engine.isStarted()) await play(`$: ${target === 'A' ? CLIP_B : CLIP_A}`);
    const at = engine.nextBar();
    const outgoing = target === 'B' ? 'sd' : 'cp', incoming = target === 'B' ? 'cp' : 'sd';
    let stray = 0, firstIncoming: number | null = null, early = 0;
    watch((e) => {
      const s = e.value.s;
      if (s === outgoing && e.cycle >= at) stray++;
      if (s === incoming) { if (e.cycle < at) early++; else if (firstIncoming === null) firstIncoming = e.cycle; }
    }, barMs() * 3);
    await play(`$: ${target === 'B' ? CLIP_B : CLIP_A}`, quantised ? { cycle: at } : undefined);
    say(`Switch to ${target} ${quantised ? `queued for bar ${at + 1}` : 'immediately'}`);
    setTimeout(() => {
      const ok = stray === 0 && early === 0 && firstIncoming !== null && firstIncoming < at + 1;
      const detail = `${quantised ? 'Quantised' : 'Immediate'}: switch bar ${at + 1}; ${outgoing} after it: ${stray}; ${incoming} before it: ${early}; first ${incoming} at bar ${firstIncoming === null ? '–' : (firstIncoming + 1).toFixed(2)}`;
      if (quantised) set('switch', ok ? 'pass' : 'fail', detail);
      say(detail);
    }, barMs() * 2.5 + (at - engine.cycleNow()) * barMs());
  }

  // 3. 2-bar clip alignment
  async function testAlign(aligned: boolean) {
    if (!engine.isStarted()) await play(`$: ${GROOVE}`);
    let at = engine.nextBar();
    if (at % 2 === 0) at += 1; // launch on an odd bar, where an unshifted 2-bar clip would start on its bar 2
    const off = aligned ? alignOffset(at, 2) : 0;
    let first: string | null = null;
    watch((e) => { if (e.value.note !== undefined && first === null && e.cycle >= at) first = String(e.value.note); }, barMs() * 4 + (at - engine.cycleNow()) * barMs());
    await play(`$: ${GROOVE}\n$: ${withOffset(BASS_2BAR, off)}`, { cycle: at, period: 2 });
    say(`2-bar bass ${aligned ? `with .late(${off})` : 'without offset'}, launched at bar ${at + 1}`);
    setTimeout(() => {
      const ok = first === 'c2';
      const detail = `${aligned ? 'Aligned' : 'Unaligned'}: launched at bar ${at + 1}, first note ${first ?? '–'} (bar 1 of the clip starts on c2)`;
      if (aligned) set('align', ok ? 'pass' : 'fail', detail);
      else say(`For comparison: ${detail}`);
      say(detail);
    }, (at + 1.5 - engine.cycleNow()) * barMs());
  }

  // 4. arrange(): three bars of groove, one bar of fill (only the fill has cp)
  async function testArrange() {
    if (!engine.isStarted()) await play(`$: ${GROOVE}`);
    const at = engine.nextBar(), off = alignOffset(at, 4);
    const bars: Record<number, boolean> = {};
    setHeard([]);
    watch((e) => {
      if (e.cycle < at) return;
      const bar = Math.floor(e.cycle);
      if (!(bar in bars)) bars[bar] = false;
      if (e.value.s === 'cp') bars[bar] = true;
      setHeard(Object.keys(bars).map(Number).sort((a, b) => a - b).map((b) => (bars[b] ? 'C' : 'A')));
    }, (at + 8.2 - engine.cycleNow()) * barMs());
    await play(`$: ${withOffset(`arrange([3, ${GROOVE}], [1, ${FILL}])`, off)}`, { cycle: at, period: 4 });
    say(`arrange() launched at bar ${at + 1}`);
    setTimeout(() => {
      const seq = Object.keys(bars).map(Number).sort((a, b) => a - b).slice(0, 8).map((b) => (bars[b] ? 'C' : 'A')).join('');
      set('arrange', seq === 'AAACAAAC' ? 'pass' : 'fail', `Bars heard from bar ${at + 1}: ${seq.split('').join(' ')} (expected A A A C A A A C)`);
    }, (at + 8.1 - engine.cycleNow()) * barMs());
  }

  // 5. Latency: tap along to the metronome; offset = tap time − nearest click time.
  async function startTaps() {
    taps.current = { beats: [], offsets: [] };
    watch((e) => { if (e.value.s === 'rim') taps.current.beats.push(e.time); }, 60000);
    await play(`$: ${METRONOME}`);
    const info = engine.audioInfo();
    set('latency', 'info', `Tap the big button on every click (8 taps). Output latency reported by the browser: ${fmtMs(info.outputLatency)}, base ${fmtMs(info.baseLatency)}`);
    say('Metronome playing: tap along');
  }
  function tap() {
    engine.trigger({ s: 'cp', bank: BANK });
    const t = engine.audioTime(), beats = taps.current.beats;
    if (!beats.length) return;
    const nearest = beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    taps.current.offsets.push((t - nearest) * 1000);
    const o = taps.current.offsets;
    if (o.length >= 8) {
      const recent = o.slice(-8), mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
      const info = engine.audioInfo();
      set('latency', 'info', `Average tap offset ${mean.toFixed(0)} ms (spread ±${sd.toFixed(0)} ms) over ${recent.length} taps. Browser output latency ${fmtMs(info.outputLatency)}. A record offset of about ${Math.max(0, mean).toFixed(0)} ms would line taps up with the beat.`);
    } else set('latency', 'info', `${o.length} of 8 taps…`);
  }

  // 6. Highlighting: the played event carries the character range of its token.
  async function testHighlight() {
    const c = `$: ${CLIP_A}`;
    let withLoc = 0, total = 0;
    watch((e) => {
      total++;
      if (e.locations.length) withLoc++;
      const loc = e.locations[0];
      if (loc) setTimeout(() => { setLit(`${loc.start}-${loc.end}`); setTimeout(() => setLit(''), 90); }, Math.max(0, (e.time - engine.audioTime()) * 1000));
    }, barMs() * 3);
    await play(c);
    setTimeout(() => set('highlight', withLoc && withLoc === total ? 'pass' : 'fail', `${withLoc} of ${total} events carried a code location`), barMs() * 2.5);
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
      ...Object.entries(TESTS).map(([k, name]) => `${name}: ${results[k]?.status ?? 'not run'} — ${results[k]?.detail ?? ''}`)].join('\n');
    navigator.clipboard?.writeText(text).then(() => say('Results copied'), () => say('Copy failed; select the results text instead'));
  }

  if (state !== 'ready') {
    return (
      <main className="lab start">
        <h1>Music Maker · Phase 0</h1>
        <p>Checks that Strudel can do what the loop editor needs: switch clips on the bar line, line up multi-bar clips, chain clips, and play pads without delay. Use headphones or speakers.</p>
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
        <button onClick={copyResults}>Copy results</button>
      </header>

      <section className="tests">
        <Card k="sound" results={results}><button onClick={testSound}>Play clip A</button></Card>
        <Card k="switch" results={results}>
          <button onClick={() => testSwitch('B', true)}>Switch to B on next bar</button>
          <button onClick={() => testSwitch('A', true)}>Switch to A on next bar</button>
          <button className="ghost" onClick={() => testSwitch('B', false)}>Switch to B immediately (compare)</button>
        </Card>
        <Card k="align" results={results}>
          <button onClick={() => testAlign(true)}>Launch 2-bar bass (aligned)</button>
          <button className="ghost" onClick={() => testAlign(false)}>Launch without offset (compare)</button>
        </Card>
        <Card k="arrange" results={results}>
          <button onClick={testArrange}>Play A, A, A, C</button>
          <span className="heard">{heard.map((h, i) => <b key={i} className={h === 'C' ? 'fill' : ''}>{h}</b>)}</span>
        </Card>
        <Card k="latency" results={results}>
          <button onClick={startTaps}>Start metronome</button>
          <button className="tap" onPointerDown={tap}>Tap</button>
          <span className="pads">{['bd', 'sd', 'hh', 'oh'].map((v) => <button key={v} className="pad" onPointerDown={() => engine.trigger({ s: v, bank: BANK })}>{v}</button>)}</span>
        </Card>
        <Card k="highlight" results={results}>
          <button onClick={testHighlight}>Play and highlight</button>
        </Card>
        <Card k="banks" results={results}><button onClick={runBanks}>Check again</button></Card>
      </section>

      <section className="code">
        <h2>Code playing now</h2>
        <pre>{renderCode(code, lit)}</pre>
      </section>
      <section className="log"><h2>Log</h2><pre>{log.join('\n')}</pre></section>
    </main>
  );
}

function Card({ k, results, children }: { k: string; results: Record<string, Result>; children: ReactNode }) {
  const r = results[k];
  return (
    <div className={`card ${r?.status ?? 'pending'}`}>
      <div className="title"><strong>{TESTS[k]}</strong><span className="badge">{r?.status === 'pass' ? 'Pass' : r?.status === 'fail' ? 'Fail' : r?.status === 'info' ? 'Info' : 'Not run'}</span></div>
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
