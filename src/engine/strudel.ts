// Strudel engine wrapper: one scheduler, sample loading, direct triggering, and per-track clip launching
// that lands exactly on bar lines.
//
// Each track has its own timeline of segments. Launching a clip compiles its code first, then picks the first
// bar line the scheduler has not queried yet, so a switch can never land in the past however slow compilation
// is. The final pattern is a stack of the tracks; each track routes queries before a switch bar to the old clip
// and after it to the new one (switchAt).
import { evalScope, evaluate as evaluateCode, repl, Pattern, TimeSpan, silence, stack } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import { webaudioOutput } from '@strudel/webaudio';
import { getFontBufferSource, registerSoundfonts } from '@strudel/soundfonts';
import { getAudioContext, getLoadedBuffer, getSampleInfo, initAudio, loadBuffer, registerSynthSounds, samples, superdough, soundMap } from 'superdough';

export type Location = { start: number; end: number };
export type HapEvent = {
  /** Audio-context time the sound starts. */
  time: number;
  /** Cycle (bar) position of the event onset. */
  cycle: number;
  duration: number;
  value: Record<string, unknown>;
  locations: Location[];
  /** Track the event came from (set by launch/edit). */
  track?: string;
};
type Listener = (e: HapEvent) => void;
type Segment = { at: number; raw: any; pat: any; period: number; shift: boolean };

const SAMPLE_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
const listeners = new Set<Listener>();
const tracks = new Map<string, Segment[]>();
let ready: Promise<void> | null = null;
let r: any = null;
let loaded = false;

/** A pattern that plays `before` until `cycle`, then `after`. Exact to the sample, independent of query windows. */
export function switchAt(before: any, after: any, cycle: number): any {
  return new Pattern((state: any) => {
    const { begin, end } = state.span;
    const b = begin.valueOf(), e = end.valueOf();
    const haps: any[] = [];
    if (b < cycle) haps.push(...before.query(state.setSpan(new TimeSpan(begin, e <= cycle ? end : cycle))));
    if (e > cycle) haps.push(...after.query(state.setSpan(new TimeSpan(b >= cycle ? begin : cycle, end))));
    return haps;
  });
}

/** The latest scheduled sound: which bar position starts at which audio-clock time. */
let clockMap: { cycle: number; time: number } | null = null;

function output(hap: any, deadline: number, duration: number, cps: number, t: number) {
  if (hap.whole) clockMap = { cycle: hap.whole.begin.valueOf(), time: t };
  const ev: HapEvent = {
    time: t,
    cycle: hap.whole?.begin.valueOf() ?? 0,
    duration,
    // Copy: superdough rewrites the value object while playing it (e.g. merging the bank into the sound name).
    value: typeof hap.value === 'object' ? { ...hap.value } : { value: hap.value },
    locations: hap.context?.locations ?? [],
    track: hap.context?.track,
  };
  listeners.forEach((l) => l(ev));
  return webaudioOutput(hap, deadline, duration, cps, t);
}

/**
 * iOS/iPadOS: web audio is muted by Silent mode unless the page declares itself as playback, and the
 * audio context only starts if it is resumed and makes sound inside the user's tap. Must run synchronously
 * in the tap handler.
 */
export function unlockAudio() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'playback';
  const ac = getAudioContext() as AudioContext;
  ac.resume();
  const buf = ac.createBuffer(1, 1, ac.sampleRate);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  src.start(0);
}

/** A plain Web Audio beep, independent of Strudel, to tell audio problems apart from engine problems. */
export function beep() {
  const ac = getAudioContext() as AudioContext;
  ac.resume();
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = 660;
  g.gain.setValueAtTime(0.3, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.45);
}

export function initEngine(): Promise<void> {
  if (!ready) {
    unlockAudio();
    ready = (async () => {
      const ac = getAudioContext();
      await ac.resume();
      await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/webaudio'), import('@strudel/soundfonts'));
      await initAudio();
      registerSynthSounds();
      registerSoundfonts();
      await Promise.all([
        samples(`${SAMPLE_BASE}/tidal-drum-machines.json`),
        samples(`${SAMPLE_BASE}/piano.json`),
        samples(`${SAMPLE_BASE}/Dirt-Samples.json`),
        samples(`${SAMPLE_BASE}/vcsl.json`),
        samples(`${SAMPLE_BASE}/mridangam.json`),
        // Our own maps (scripts/make-sample-maps.mjs): tonejs-instruments and tabla strokes.
        samples(`${import.meta.env.BASE_URL}samples/tonejs.json`),
        // Tabla strokes ship with the app; their map lists paths relative to samples/ (Strudel's own base drops the slash).
        samples(`${import.meta.env.BASE_URL}samples/tabla.json`, new URL(`${import.meta.env.BASE_URL}samples/`, location.href).href),
      ].map((p) => p.catch((e: unknown) => console.warn('[engine] sample map not loaded', e))));
      r = repl({ defaultOutput: output, getTime: () => ac.currentTime, transpiler });
      loaded = true;
    })();
  }
  return ready;
}

/** True once samples are loaded and sounds can be triggered without waiting. */
export const isReady = () => loaded;

export const onHap = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Turn a Strudel expression (e.g. `s("bd*4").bank("RolandTR909")`) into a pattern. Locations are relative to `code`. */
export async function compile(code: string): Promise<any> {
  const { pattern } = await evaluateCode(code, transpiler, {});
  return pattern;
}

const started = () => !!r?.scheduler.started;
/** Everything before this cycle has already been handed to the audio engine. */
const horizon = () => (started() ? r.scheduler.lastEnd : 0);

function shifted(track: string, raw: any, at: number, period: number, shift: boolean) {
  const offset = ((at % period) + period) % period;
  const pat = shift && offset ? raw.late(offset) : raw;
  // Tag events with their track so played notes can be mapped back to that track's code.
  return pat.withContext((ctx: any) => ({ ...ctx, track }));
}

export { silence };

function rebuild() {
  const h = horizon();
  const parts: any[] = [];
  for (const segs of tracks.values()) {
    // Segments whose successor has already started can never be heard again.
    while (segs.length > 1 && segs[1].at <= h) segs.shift();
    let pat = silence;
    for (const s of segs) pat = s.at <= h ? s.pat : switchAt(pat, s.pat, s.at);
    parts.push(pat);
  }
  const all = parts.length ? stack(...parts) : silence;
  r.setPattern(all, true);
}

export type LaunchOptions = {
  /** Length of the clip (or chain) in bars; it starts at its own bar 1 whatever bar it launches on. */
  period?: number;
  /** Launch only on bars where bar % quantum === offset (default: any bar). */
  quantum?: number;
  offset?: number;
  /** false: do not line the clip up (for comparison tests). */
  shift?: boolean;
  /** Never start before this bar (e.g. after a count-in). */
  notBefore?: number;
};

/** Start `pattern` on `track` at the next bar line. Returns the cycle (bar) it starts on. */
export function launch(track: string, pattern: any, opts: LaunchOptions = {}): number {
  const { period = 1, quantum = 1, offset = 0, shift = true, notBefore = 0 } = opts;
  let at = started() ? Math.max(Math.ceil(horizon()), notBefore) : notBefore;
  while (((at - offset) % quantum + quantum) % quantum !== 0) at++;
  const segs = tracks.get(track) ?? [];
  // A later launch on the same bar replaces an earlier one.
  while (segs.length && segs[segs.length - 1].at >= at) segs.pop();
  segs.push({ at, raw: pattern, pat: shifted(track, pattern, at, period, shift), period, shift });
  tracks.set(track, segs);
  rebuild();
  return at;
}

/** Stop `track` at the next bar line. */
export function stopTrack(track: string): number {
  return launch(track, silence);
}

/** Replace the clip a track is playing (or about to play) without waiting for a bar line: for note edits and mutes. */
export function edit(track: string, pattern: any, period?: number) {
  const segs = tracks.get(track);
  if (!segs?.length) return launch(track, pattern, { period });
  const s = segs[segs.length - 1];
  s.raw = pattern;
  if (period) s.period = period;
  s.pat = shifted(track, pattern, s.at, s.period, s.shift);
  rebuild();
  return s.at;
}

/** Scheduler look-ahead (seconds): sounds play this long after the scheduler reaches them. */
const SCHEDULER_LATENCY = 0.1;

/** The bar position you are hearing now: the scheduler's position minus its look-ahead and the output latency. */
export function heardCycle(ago = 0): number {
  if (!started()) return 0;
  const ac = getAudioContext() as AudioContext;
  const delay = SCHEDULER_LATENCY + ((ac as any).outputLatency ?? ac.baseLatency ?? 0) + ago;
  return r.scheduler.now() - delay * r.scheduler.cps;
}

/**
 * The audio-clock time that was coming out of the speaker at a moment on the performance.now() clock (e.g. a
 * touch's event.timeStamp). Uses the browser's output timestamp when it has one, which includes the output
 * device's delay; otherwise the current time minus the reported output latency.
 */
export function audioTimeAt(perfTime = performance.now()): number {
  const ac = getAudioContext() as AudioContext;
  const ts = typeof ac.getOutputTimestamp === 'function' ? ac.getOutputTimestamp() : null;
  if (ts && ts.performanceTime && ts.contextTime !== undefined) return ts.contextTime + (perfTime - ts.performanceTime) / 1000;
  return ac.currentTime - ((ac as any).outputLatency ?? ac.baseLatency ?? 0) - (performance.now() - perfTime) / 1000;
}

/** Bar position that was being heard at a moment on the performance.now() clock (default: now). */
export function cycleHeardAt(perfTime = performance.now()): number {
  if (!started()) return 0;
  if (!clockMap) return heardCycle((performance.now() - perfTime) / 1000);
  return clockMap.cycle + (audioTimeAt(perfTime) - clockMap.time) * r.scheduler.cps;
}

/** Seconds since a DOM event happened (its timeStamp is on the performance.now() clock). */
export const secondsSince = (eventTimeStamp?: number) =>
  eventTimeStamp === undefined ? 0 : Math.max(0, Math.min(0.5, (performance.now() - eventTimeStamp) / 1000));

/**
 * Where `track` is at a bar position (default: what you hear now): bars into its current clip or chain modulo
 * its period, and how many times it has looped. Null if silent.
 */
export function position(track: string, cycle = cycleHeardAt()): { bars: number; period: number; pass: number } | null {
  if (!started()) return null;
  let cur: Segment | undefined;
  for (const s of tracks.get(track) ?? []) if (s.at <= cycle) cur = s;
  if (!cur || cur.raw === silence) return null;
  const rel = cur.shift ? cycle - cur.at : cycle;
  return { bars: ((rel % cur.period) + cur.period) % cur.period, period: cur.period, pass: Math.floor((cycle - cur.at) / cur.period) };
}

export const nextBar = () => (started() ? Math.ceil(horizon()) : 0);
export const cycleNow = () => (started() ? cycleHeardAt() : 0);
export const isStarted = started;
export const audioTime = () => getAudioContext().currentTime;
export const setBpm = (bpm: number) => r?.setCps(bpm / 60 / 4);
export const getCps = () => r?.scheduler.cps ?? 0.5;

export function stop() {
  r?.stop();
  tracks.clear();
  clockMap = null;
}

/** What superdough registered for a sound: sample files (`samples`) or soundfont presets (`fonts`). */
function soundData(s: string, bank?: string): { samples?: string[] | Record<string, string[]>; fonts?: string[] } | undefined {
  return (soundMap.get() as Record<string, any>)[(bank ? `${bank}_${s}` : s).toLowerCase()]?.data;
}

/** The sample file a value plays, keyed as superdough's buffer cache keys it; null for synths and soundfonts. */
function sampleUrl(value: Record<string, unknown>): string | null {
  const samples = soundData(String(value.s ?? ''), value.bank as string | undefined)?.samples;
  try {
    return samples ? String(getSampleInfo(value, samples).url).replace('#', '%23') : null;
  } catch {
    return null; // let superdough report it
  }
}

/**
 * Play a sound immediately, bypassing the pattern scheduler (pads and keys). A sample that is not loaded yet
 * would be dropped by superdough, so it plays as soon as it arrives instead (unless that takes too long).
 */
export function trigger(value: Record<string, unknown>, duration = 0.25) {
  const ac = getAudioContext();
  // Pass the tempo too: tempo-synced effects such as delay then match the pattern.
  const play = () => superdough(value, ac.currentTime + 0.005, duration, r?.scheduler.cps ?? 0.5);
  const url = sampleUrl(value);
  if (!url || getLoadedBuffer(url)) return play();
  const asked = performance.now();
  return loadBuffer(url, ac).then(() => (performance.now() - asked < 1500 ? play() : undefined), () => undefined);
}

// Held notes: a sound's trigger is wrapped so the voice it starts can be faded out when the key is released
// (superdough itself only plays notes of a fixed length).
type Voice = { node?: { gain?: AudioParam }; stop?: (t: number) => void; nodes?: { source?: AudioScheduledSourceNode | AudioScheduledSourceNode[] } };
const sources = (v: Voice) => [v.nodes?.source ?? []].flat();
const holders = new Map<string, (v: Voice) => void>();
const wrapped = new Set<string>();
let holdId = 0;

function wrapSound(s: string) {
  const key = s.toLowerCase();
  const entry = (soundMap.get() as Record<string, any>)[key];
  if (!entry || wrapped.has(key)) return;
  wrapped.add(key);
  const onTrigger = entry.onTrigger;
  soundMap.setKey(key, {
    ...entry,
    onTrigger: async (t: number, value: Record<string, unknown>, ...rest: unknown[]) => {
      let voice = await onTrigger(t, value, ...rest);
      const take = holders.get(String(value.holdId));
      if (take && voice?.node) {
        // A held note gets a volume control of its own after the instrument's envelope, so a sliding finger
        // can make it louder or softer without disturbing the envelope.
        const level = getAudioContext().createGain();
        voice.node.connect(level);
        voice = { ...voice, node: level };
        take(voice);
      }
      return voice;
    },
  });
}

/** Fade a voice out over `fade` seconds from now and stop it. */
function releaseVoice(v: Voice, fade = 0.12) {
  const now = getAudioContext().currentTime, end = now + fade;
  const g = v.node?.gain;
  if (g) {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, end);
  }
  try { v.stop?.(end + 0.01); } catch { /* already stopped */ }
  sources(v).forEach((src) => { try { src.stop(end + 0.01); } catch { /* already stopped */ } });
}

/**
 * Move a voice's pitch to `cents` from where it started, smoothly (a finger sliding along the keys). Works for
 * oscillators and recorded samples, whose `detune` is the pitch; other sources (e.g. supersaw) keep their pitch.
 */
function detuneVoice(v: Voice, cents: number) {
  const now = getAudioContext().currentTime;
  for (const src of sources(v)) {
    if (!(src instanceof OscillatorNode || src instanceof AudioBufferSourceNode)) continue;
    src.detune.cancelScheduledValues(now);
    src.detune.setTargetAtTime(cents, now, 0.012);
  }
}

export interface HeldNote {
  /** Let go: fade out and stop. */
  stop(): void;
  /** Slide the pitch to `semitones` away from the note's own pitch (fractional for a smooth glide). */
  glide(semitones: number): void;
  /** Change the volume smoothly to `ratio` times the volume it was struck at. */
  level(ratio: number): void;
}

/**
 * Play a sound until stopped (a held key), up to `max` seconds; its pitch can glide while it sounds. Samples
 * without a loop still end where the recording ends.
 */
export function hold(value: Record<string, unknown>, max = 30): HeldNote {
  wrapSound(String(value.s ?? 'triangle'));
  const id = String(++holdId);
  let voice: Voice | null = null, released = false, cents = 0, ratio = 1;
  const setLevel = (v: Voice) => {
    const g = v.node?.gain, now = getAudioContext().currentTime;
    if (!g) return;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(ratio, now, 0.015);
  };
  holders.set(id, (v) => {
    voice = v;
    if (cents) detuneVoice(v, cents);
    if (ratio !== 1) setLevel(v);
    if (released) { releaseVoice(v); holders.delete(id); }
  });
  void trigger({ ...value, holdId: id }, max);
  return {
    stop() {
      if (released) return;
      released = true;
      if (voice) { releaseVoice(voice); holders.delete(id); } else setTimeout(() => holders.delete(id), 5000); // still loading
    },
    glide(semitones) {
      cents = semitones * 100;
      if (voice && !released) detuneVoice(voice, cents);
    },
    level(r) {
      ratio = Math.max(0, r);
      if (voice && !released) setLevel(voice);
    },
  };
}

export type SoundRef = { s: string; bank?: string; n?: number; notes?: number[] };

/**
 * Fetch and decode sounds before they are played, so the first press of a pad or key (and the first bar of a
 * new instrument) is heard: for sample maps, the file each of `notes` (or just `n`) plays; for soundfonts, the
 * zones for `notes`. Safe to call repeatedly: loads are cached.
 */
export function preload(sounds: SoundRef[]) {
  if (!loaded) return;
  const ac = getAudioContext();
  for (const x of sounds) {
    const data = soundData(x.s, x.bank);
    const notes = x.notes?.length ? [...new Set(x.notes.map(Math.round))] : [undefined];
    if (data?.samples) {
      const urls = new Set<string>();
      for (const note of notes) {
        try { urls.add(String(getSampleInfo({ s: x.s, n: x.n ?? 0, note }, data.samples).url)); } catch { /* malformed map */ }
      }
      urls.forEach((u) => loadBuffer(u, ac).catch(() => {}));
    } else if (data?.fonts) {
      const font = data.fonts[(x.n ?? 0) % data.fonts.length];
      notes.forEach((note) => note !== undefined && getFontBufferSource(font, { note }, ac).catch(() => {}));
    }
  }
}

export function audioInfo() {
  const ac = getAudioContext() as AudioContext;
  return { sampleRate: ac.sampleRate, baseLatency: ac.baseLatency ?? null, outputLatency: (ac as any).outputLatency ?? null, state: ac.state };
}

/** Sound names registered for a drum machine, e.g. 'RolandTR909' -> ['bd', 'cp', ...]. */
export function bankVoices(bank: string): string[] {
  const prefix = bank.toLowerCase() + '_';
  return Object.keys(soundMap.get()).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)).sort();
}
