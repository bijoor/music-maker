// Tap force from the motion sensor: the screen cannot tell how hard a finger presses, but a harder tap jolts the
// iPad a little more (GarageBand uses the same trick). The jolt is read from devicemotion around the moment of a
// touch and turned into a velocity, scaled to how hard the player has been tapping lately.

interface Sample { t: number; m: number }
let samples: Sample[] = [];
let listening = false;
let seen = false;
/** Gravity, followed slowly, when the device only reports acceleration including gravity. */
const g = { x: 0, y: 0, z: 0, init: false };
/** Jolts of recent taps, for scaling (the hardest recent tap is full velocity). */
let recentPeaks: number[] = [];

function onMotion(e: DeviceMotionEvent) {
  let m: number | null = null;
  const a = e.acceleration;
  if (a && a.x != null && a.y != null && a.z != null) m = Math.hypot(a.x, a.y, a.z);
  else {
    const ag = e.accelerationIncludingGravity;
    if (!ag || ag.x == null || ag.y == null || ag.z == null) return;
    if (!g.init) Object.assign(g, { x: ag.x, y: ag.y, z: ag.z, init: true });
    g.x += (ag.x - g.x) * 0.1; g.y += (ag.y - g.y) * 0.1; g.z += (ag.z - g.z) * 0.1;
    m = Math.hypot(ag.x - g.x, ag.y - g.y, ag.z - g.z);
  }
  seen = true;
  const t = e.timeStamp || performance.now();
  samples.push({ t, m });
  while (samples.length && samples[0].t < t - 500) samples.shift();
}

/** Start reading the motion sensor; on iPad this asks permission, so call it from a tap. False if refused. */
export async function enableTapForce(): Promise<boolean> {
  const D = (globalThis as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (!D) return false;
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
  } catch { return false; }
  if (!listening) { addEventListener('devicemotion', onMotion); listening = true; }
  return true;
}
export function disableTapForce() {
  if (listening) removeEventListener('devicemotion', onMotion);
  listening = false; samples = [];
}
export const tapForceListening = () => listening;
/** Whether any motion has been reported (desktops have no sensor). */
export const tapForceSensed = () => seen;

/** Jolt below this (m/s²) is a feather touch. */
const FLOOR = 0.04;
const peakIn = (t0: number, t1: number) => samples.reduce((p, s) => (s.t >= t0 && s.t <= t1 && s.m > p ? s.m : p), 0);

/** Velocity (0.2–1) for a jolt, against the hardest of the recent taps. */
export function joltVelocity(m: number, recent: number[]): number {
  const ceil = Math.max(FLOOR * 8, ...recent);
  if (m <= FLOOR) return 0.2;
  return 0.2 + 0.8 * Math.min(1, Math.log(m / FLOOR) / Math.log(ceil / FLOOR));
}

/**
 * The velocity of a touch at `at` (an event timeStamp), from the jolt read so far; `update` is called once more if a
 * bigger jolt arrives just after (the sensor reports a little behind the touch). Null when there is no sensor data.
 */
export function tapVelocity(at: number, update: (vel: number) => void): number | null {
  if (!listening || !seen) return null;
  const first = peakIn(at - 60, at + 60);
  const vel = joltVelocity(first, recentPeaks);
  setTimeout(() => {
    const peak = peakIn(at - 60, at + 60);
    recentPeaks = [...recentPeaks, peak].slice(-12);
    if (peak > first * 1.15) update(joltVelocity(peak, recentPeaks));
  }, 35);
  return vel;
}
