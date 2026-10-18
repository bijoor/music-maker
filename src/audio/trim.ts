// Sounds should start the moment they are played: many sample files begin with a little silence (recorded lead-in,
// or an MP3's encoder delay, which Safari plays), so a key or pad would sound late. Decoded sounds have that lead-in
// cut, keeping a millisecond before the first audible sample.

/** Below this fraction of the sound's peak (−40 dB) counts as silence. */
const SILENT = 0.01;
/** Lead-ins shorter than this are left alone. */
const MIN_CUT_S = 0.002;
/** Kept before the first audible sample. */
const KEEP_S = 0.001;

/** Where a sound's audible part starts, in samples (across all channels), less the bit kept before it. */
export function leadIn(channels: Float32Array[], sampleRate: number): number {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
  if (!peak) return 0;
  let first = Infinity;
  for (const ch of channels) {
    for (let i = 0; i < ch.length && i < first; i++) if (Math.abs(ch[i]) >= peak * SILENT) { first = i; break; }
  }
  const cut = Math.max(0, first - Math.round(KEEP_S * sampleRate));
  return Number.isFinite(cut) && cut >= MIN_CUT_S * sampleRate ? cut : 0;
}

/**
 * A decoded sound without its lead-in, as a new buffer. The audio is only read and written with copyFromChannel /
 * copyToChannel: a buffer whose channel data has been handed out (getChannelData) may be copied by Safari every
 * time it starts playing, which on fast rhythms ate memory until the app was closed.
 */
export function trimLeadIn(buffer: AudioBuffer, ac: BaseAudioContext): AudioBuffer {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => { const a = new Float32Array(buffer.length); buffer.copyFromChannel(a, c); return a; });
  const cut = leadIn(channels, buffer.sampleRate);
  if (!cut) return buffer;
  const out = ac.createBuffer(buffer.numberOfChannels, buffer.length - cut, buffer.sampleRate);
  channels.forEach((ch, c) => out.copyToChannel(ch.subarray(cut), c));
  return out;
}

/** Make every sound this audio context decodes start without its lead-in (both the promise and callback forms). */
export function trimOnDecode(ac: BaseAudioContext) {
  const flag = ac as BaseAudioContext & { __trimmed?: boolean };
  if (flag.__trimmed) return;
  flag.__trimmed = true;
  const decode = ac.decodeAudioData.bind(ac);
  ac.decodeAudioData = ((data: ArrayBuffer, ok?: DecodeSuccessCallback | null, fail?: DecodeErrorCallback | null) =>
    decode(data).then(
      (b) => { const t = trimLeadIn(b, ac); ok?.(t); return t; },
      (err) => { fail?.(err); throw err; },
    )) as BaseAudioContext['decodeAudioData'];
}
