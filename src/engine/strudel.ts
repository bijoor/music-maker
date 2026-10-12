// Strudel engine wrapper: one repl, sample loading, direct triggering, and bar-quantised pattern switching.
import { evalScope, repl, Pattern, TimeSpan, silence } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import { webaudioOutput } from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { getAudioContext, initAudio, registerSynthSounds, samples, superdough, soundMap } from 'superdough';

export type Location = { start: number; end: number };
export type HapEvent = {
  /** Audio-context time the sound starts. */
  time: number;
  /** Cycle (bar) position of the event onset. */
  cycle: number;
  duration: number;
  value: Record<string, unknown>;
  locations: Location[];
};
type Listener = (e: HapEvent) => void;

const SAMPLE_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
const listeners = new Set<Listener>();
let ready: Promise<void> | null = null;
let r: any = null;

// Bar-quantised switching state: `playing` is what sounds now; `pending` takes over at cycle `at`.
let playing: any = silence;
let pending: { pat: any; at: number } | null = null;
let nextSwitch: { at: number; period: number } | null = null;

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

function output(hap: any, deadline: number, duration: number, cps: number, t: number) {
  const ev: HapEvent = {
    time: t,
    cycle: hap.whole?.begin.valueOf() ?? 0,
    duration,
    value: typeof hap.value === 'object' ? hap.value : { value: hap.value },
    locations: hap.context?.locations ?? [],
  };
  listeners.forEach((l) => l(ev));
  return webaudioOutput(hap, deadline, duration, cps, t);
}

function editPattern(pat: any) {
  const sch = r?.scheduler;
  if (nextSwitch && sch?.started) {
    // The scheduler has already queried up to lastEnd; never switch before that.
    let at = nextSwitch.at;
    while (at < sch.lastEnd) at += nextSwitch.period;
    pending = { pat, at };
    nextSwitch = null;
    return switchAt(playing, pat, at);
  }
  nextSwitch = null;
  if (pending) {
    // An edit while a switch is pending updates the incoming pattern, not the outgoing one.
    pending = { pat, at: pending.at };
    return switchAt(playing, pat, pending.at);
  }
  playing = pat;
  return pat;
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
      ]);
      r = repl({ defaultOutput: output, getTime: () => ac.currentTime, transpiler, editPattern });
      setInterval(() => {
        // Once the switch point has been queried, the incoming pattern is simply what plays.
        if (pending && r.scheduler.lastEnd >= pending.at + 1) {
          playing = pending.pat;
          pending = null;
        }
      }, 100);
    })();
  }
  return ready;
}

export const onHap = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Evaluate code now (edits) or so that it takes over exactly at a bar line. */
export async function evaluate(code: string, at?: { cycle: number; period?: number }) {
  if (at) nextSwitch = { at: at.cycle, period: at.period ?? 1 };
  return r.evaluate(code);
}

/** First bar line that has not been scheduled yet. */
export const nextBar = () => (r?.scheduler.started ? Math.ceil(r.scheduler.lastEnd) : 0);
export const cycleNow = () => (r?.scheduler.started ? r.scheduler.now() : 0);
export const isStarted = () => !!r?.scheduler.started;
export const audioTime = () => getAudioContext().currentTime;
export const setBpm = (bpm: number) => r?.setCps(bpm / 60 / 4);
export const getCps = () => r?.scheduler.cps ?? 0.5;

export function stop() {
  r?.stop();
  playing = silence;
  pending = null;
  nextSwitch = null;
}

/** Play a sound immediately, bypassing the pattern scheduler (pads and keys). */
export function trigger(value: Record<string, unknown>, duration = 0.25) {
  const ac = getAudioContext();
  return superdough(value, ac.currentTime + 0.005, duration);
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
