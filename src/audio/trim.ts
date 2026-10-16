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

/** Cut a decoded sound's lead-in in place (its length stays; the end is padded with silence). */
export function trimLeadIn(buffer: AudioBuffer): AudioBuffer {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const cut = leadIn(channels, buffer.sampleRate);
  if (cut) for (const ch of channels) { ch.copyWithin(0, cut); ch.fill(0, ch.length - cut); }
  return buffer;
}

/** Make every sound this audio context decodes start without its lead-in (both the promise and callback forms). */
export function trimOnDecode(ac: BaseAudioContext) {
  const flag = ac as BaseAudioContext & { __trimmed?: boolean };
  if (flag.__trimmed) return;
  flag.__trimmed = true;
  const decode = ac.decodeAudioData.bind(ac);
  ac.decodeAudioData = ((data: ArrayBuffer, ok?: DecodeSuccessCallback | null, fail?: DecodeErrorCallback | null) =>
    decode(data).then(
      (b) => { const t = trimLeadIn(b); ok?.(t); return t; },
      (err) => { fail?.(err); throw err; },
    )) as BaseAudioContext['decodeAudioData'];
}
