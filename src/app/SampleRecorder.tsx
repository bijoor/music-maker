import { useEffect, useRef, useState } from 'react';
import { selectedTrack, useStore } from '../state/store';
import { myKitBank, type Hand } from '../model/kit';
import * as engine from '../engine/strudel';
import { recordMic, type MicTake } from '../audio/mic';
import { extract, findStrokes } from '../audio/slice';
import { decodeWav, encodeWav } from '../audio/wav';
import { deleteMyKit, saveMyKit, strokeSound } from '../state/myKits';
import PanelFrame from './PanelFrame';

interface Draft {
  key: string;
  /** Sound name of a stroke already saved in the kit. */
  voice?: string;
  name: string;
  hand: Hand;
  bends: boolean;
  samples?: Float32Array;
  sampleRate: number;
  /** A new recording, to be saved. */
  wav?: Blob;
}

const HANDS: [Hand, string][] = [['left', 'Left'], ['both', 'Both'], ['right', 'Right']];
let keyN = 0;

/**
 * Record a drum kit from a real instrument: play strokes one at a time into the microphone; each becomes a pad,
 * which can be named (by its bol), given a hand and set to bend. Saved kits appear under My kits in the drum kit
 * menu. The sounds stay on this device.
 */
export default function SampleRecorder() {
  const { recorderKit, myKits, setPanel, setBank, setMessage } = useStore();
  const editing = myKits.find((k) => k.id === recorderKit);
  const [name, setName] = useState(editing?.name ?? '');
  const [strokes, setStrokes] = useState<Draft[]>([]);
  const [take, setTake] = useState<MicTake | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meter = useRef<HTMLDivElement>(null);

  // Editing a kit: load its strokes (and their sounds, to audition and draw).
  useEffect(() => {
    if (!editing) return;
    let live = true;
    void Promise.all(editing.strokes.map(async (s) => {
      const blob = await strokeSound(s.voice).catch(() => undefined);
      const audio = blob ? await decodeWav(blob) : undefined;
      return { key: `k${keyN++}`, voice: s.voice, name: s.name, hand: s.hand ?? 'right', bends: !!s.bends, samples: audio?.samples, sampleRate: audio?.sampleRate ?? 44100 } as Draft;
    })).then((d) => { if (live) setStrokes(d); });
    return () => { live = false; };
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Level meter while recording.
  useEffect(() => {
    if (!take) return;
    let raf = 0;
    const tick = () => { if (meter.current) meter.current.style.transform = `scaleX(${take.level()})`; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [take]);

  const start = async () => {
    setError('');
    engine.unlockAudio();
    const ac = engine.audioContext();
    try {
      await ac.resume();
      setTake(await recordMic(ac));
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'The microphone is blocked. Allow it for this site (on iPad: Settings → Safari → Microphone, or the aA menu → Website Settings), then try again.'
        : 'No microphone was found, or it could not be opened.');
    }
  };

  const stop = () => {
    if (!take) return;
    const { samples, sampleRate } = take.stop();
    setTake(null);
    const cuts = findStrokes(samples, sampleRate);
    if (!cuts.length) { setError('No strokes were heard. Play a little louder or closer to the microphone, with a short gap between strokes.'); return; }
    setStrokes((old) => [
      ...old,
      ...cuts.map((c, i) => {
        const x = extract(samples, c, sampleRate);
        return { key: `k${keyN++}`, name: `Stroke ${old.length + i + 1}`, hand: 'right' as Hand, bends: false, samples: x, sampleRate, wav: encodeWav(x, sampleRate) };
      }),
    ]);
  };

  const update = (key: string, patch: Partial<Draft>) => setStrokes((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const play = (s: Draft) => { engine.unlockAudio(); if (s.samples) engine.playSamples(s.samples, s.sampleRate); };

  const save = async () => {
    setBusy(true);
    try {
      const kit = await saveMyKit(
        { id: editing?.id, name, strokes: strokes.map(({ voice, name, hand, bends, wav }) => ({ voice, name, hand, bends, wav })) },
        engine.hasSound,
      );
      const track = selectedTrack(useStore.getState());
      if (track?.kind === 'drums' && (!editing || track.bank === myKitBank(kit.id))) setBank(track.id, myKitBank(kit.id));
      setMessage(`${kit.name} saved`);
      setPanel(null);
    } catch {
      setError('The kit could not be saved. The device may be out of storage space.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!editing) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteMyKit(editing.id);
    setMessage(`${editing.name} deleted`);
    setPanel(null);
  };

  return (
    <PanelFrame
      title={editing ? `Edit kit · ${editing.name}` : 'Record a kit'}
      actions={
        <>
          {editing && <button className="btn sm" onClick={remove}>{confirmDelete ? 'Tap again to delete the kit' : 'Delete kit'}</button>}
          <button className="btn sm on" disabled={busy || !!take || !name.trim() || !strokes.length} onClick={save}>{busy ? 'Saving…' : 'Save kit'}</button>
        </>
      }
    >
      <div className="recorder">
        <div className="rec-top">
          <label className="rec-name">
            <span className="muted-text">Kit name</span>
            <input id="rec-kit-name" value={name} placeholder="e.g. Dholak" onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          {take ? (
            <button className="btn rec on" onClick={stop}>■ Stop</button>
          ) : (
            <button className="btn rec" onClick={start}>● {strokes.length ? 'Record more' : 'Record'}</button>
          )}
          <div className="rec-meter" aria-hidden><div ref={meter} /></div>
        </div>
        <p className="muted-text">
          {take ? 'Recording… play one stroke at a time, letting each ring, with a short gap before the next. Tap Stop when done.'
            : 'Tap Record and play the strokes one at a time (several of each is fine). Record close to the instrument in a quiet room. Each stroke becomes a pad: name it, choose the hand that plays it, and remove the ones you do not want.'}
        </p>
        {error && <p className="rec-error" role="alert">{error}</p>}
        <div className="rec-list">
          {strokes.map((s) => (
            <div key={s.key} className="rec-row">
              <button className="btn sm" aria-label={`Play ${s.name}`} disabled={!s.samples} onClick={() => play(s)}>▶</button>
              <Wave samples={s.samples} />
              <input id={`rec-${s.key}`} aria-label="Stroke name" value={s.name} onChange={(e) => update(s.key, { name: e.target.value })} autoComplete="off" />
              <div className="seg" role="group" aria-label="Hand">
                {HANDS.map(([h, l]) => <button key={h} aria-pressed={s.hand === h} onClick={() => update(s.key, { hand: h })}>{l}</button>)}
              </div>
              <button className={`btn sm${s.bends ? ' on' : ''}`} aria-pressed={s.bends} title="Sliding up on the pad raises the pitch (a bass head)" onClick={() => update(s.key, { bends: !s.bends })}>Bends</button>
              <button className="btn sm" aria-label={`Remove ${s.name}`} onClick={() => setStrokes((all) => all.filter((x) => x.key !== s.key))}>×</button>
            </div>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}

/** A stroke's waveform, drawn small. */
function Wave({ samples }: { samples?: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, g = c?.getContext('2d');
    if (!c || !g) return;
    const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
    g.clearRect(0, 0, w, h);
    if (!samples?.length) return;
    g.fillStyle = getComputedStyle(c).color;
    const step = Math.max(1, Math.floor(samples.length / w));
    for (let x = 0; x < w; x++) {
      let peak = 0;
      for (let i = x * step; i < (x + 1) * step && i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      g.fillRect(x, h / 2 - (peak * h) / 2, 1, Math.max(1, peak * h));
    }
  }, [samples]);
  return <canvas ref={ref} className="rec-wave" />;
}
