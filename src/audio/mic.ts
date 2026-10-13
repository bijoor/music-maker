// Recording from the microphone (or an audio interface) as raw samples, with a live level for a meter.

export interface MicTake {
  /** Loudness of the last moment of input, 0–1, for a level meter. */
  level(): number;
  /** Stop and return what was recorded. */
  stop(): { samples: Float32Array; sampleRate: number };
}

/**
 * Start recording on `ac`. Echo cancellation, noise suppression and automatic gain are turned off so strokes keep
 * their attack and natural decay. Stops by itself after `maxSeconds`.
 */
export async function recordMic(ac: AudioContext, maxSeconds = 60): Promise<MicTake> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const source = ac.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works everywhere, including Safari on iPad, without a worklet file.
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const mute = ac.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  let total = 0, level = 0, done = false;
  const max = maxSeconds * ac.sampleRate;
  proc.onaudioprocess = (e) => {
    if (done || total >= max) return;
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    total += d.length;
    let s = 0;
    for (const v of d) s += v * v;
    level = Math.min(1, Math.sqrt(s / d.length) * 4);
  };
  source.connect(proc);
  proc.connect(mute).connect(ac.destination);
  return {
    level: () => level,
    stop() {
      done = true;
      proc.disconnect();
      source.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((t) => t.stop()); // frees the mic (and restores normal playback volume on iPad)
      const samples = new Float32Array(total);
      let o = 0;
      for (const c of chunks) { samples.set(c.subarray(0, Math.min(c.length, total - o)), o); o += c.length; }
      return { samples, sampleRate: ac.sampleRate };
    },
  };
}
