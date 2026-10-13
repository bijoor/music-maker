import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from '../state/store';
import { isAudible } from '../codegen/generate';
import { GROUPS } from '../model/presets';
import { soundName } from '../model/sounds';
import { STEPS_PER_BAR, type Bars, type Clip, type Step, type Track } from '../model/types';
import { lineOf } from '../model/lines';
import * as player from '../engine/player';
import { kitName, kitVoices, myKitBank } from '../model/kit';
import ScenesBar from './ScenesBar';
import { releaseFingers } from './MelodicPlay';
import * as recorder from '../engine/recorder';
import EditableName from './EditableName';

// Thumbnail rows: cymbals and hats on top, snares and hand percussion in the middle, kicks and toms at the bottom.
const LANE: Record<string, number> = {
  cr: 0, rd: 0, oh: 0, hh: 0, tb: 0, sh: 0, rim: 1, sd: 1, 'sd:1': 1, cp: 1, cb: 1, bd: 2, 'bd:1': 2, lt: 2, mt: 2, ht: 2,
  nam: 0, dhin: 0, chaapu: 0, ardha: 0, na: 0, ta: 1, ki: 1, dhi: 1, ka: 1, thom: 2, tha: 2, dhum: 2, gumki: 2,
  tabla_na: 0, tabla_ta: 0, tabla_tin: 0, tabla_tun: 0, tabla_te: 0, tabla_te2: 0, tabla_tak: 0, tabla_dha: 1, tabla_dhin: 1,
  tabla_ge: 2, tabla_ghe: 2, tabla_gha: 2, tabla_ke: 2, tabla_kat: 2,
};

export default function ClipGrid() {
  const { song, pendingAt, transport, selected, mode, songMode, select, stopTrack, stopAllTracks, toggleMute, toggleSolo, setGain, addTrack, myKits, renameTrack, toggleStep, setStepTimes, appendClip, setSongMode } = useStore();
  const [newLen, setNewLen] = useState<Bars>(1);
  const [adding, setAdding] = useState(false);
  // The add-track menu floats over the page (the clip area would clip it), anchored under its button.
  const [addAt, setAddAt] = useState({ left: 0, top: 0 });
  const rowsRef = useRef<HTMLDivElement>(null);
  const playing = transport === 'playing';
  const leaveSong = () => { if (songMode) setSongMode(false); };
  useProgress(rowsRef);

  return (
    <section className="card launcher" aria-label="Clips">
      <div className="lhead">
        <h2>Clips</h2>
        <div className="addwrap">
          <button className="btn sm" aria-expanded={adding} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAddAt({ left: Math.max(8, Math.min(r.left, innerWidth - 440)), top: r.bottom + 4 }); setAdding(!adding); }}>+ Track</button>
          {adding && (
            // Two columns that fit on screen (scrolling if they ever do not): drums, then melodic instruments.
            <div className="menu fixed addmenu" role="menu" style={addAt}>
              {(['drums', 'melodic'] as const).map((kind) => (
                <div key={kind} className="addcol">
                  <span className="muted-text">{kind === 'drums' ? 'Drums' : 'Instruments'}</span>
                  {GROUPS.filter((g) => g.kind === kind).map((g) => (
                    <div key={g.id} className="addgroup">
                      <button role="menuitem" onClick={() => { addTrack(g); setAdding(false); }}>
                        <i style={{ background: g.color }} />{g.label}<span className="muted-text">{g.kind === 'drums' ? kitName(g.bank) : soundName(g.sound)}</span>
                      </button>
                      {/* Kits recorded into this group, as a quick start. */}
                      {myKits.filter((k) => (k.group ?? 'indian-drums') === g.id).map((k) => (
                        <button key={k.id} role="menuitem" className="sub" onClick={() => { addTrack(g, myKitBank(k.id)); setAdding(false); }}>
                          <i style={{ background: g.color }} />{k.name}<span className="muted-text">my kit</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="muted-text" htmlFor="newlen">New clips</label>
        <select id="newlen" className="sm" value={newLen} onChange={(e) => setNewLen(+e.target.value as Bars)}>
          {[1, 2, 4].map((n) => <option key={n} value={n}>{n} bar{n > 1 ? 's' : ''}</option>)}
        </select>
        <span className="muted-text hint">{songMode ? 'Song mode: the song order plays. Change a step or tap a scene to take over.' : mode === 'record' ? 'Record: ＋ adds a new clip to a track’s line; play pads or keys into it.' : 'Each track plays its clips in turn: − / + sets how many times, tap a clip to edit it, ＋ adds a new one.'}</span>
        <span className="spacer" />
        <button className="btn sm" title="Stop every track, and silence any note still sounding" onClick={() => { stopAllTracks(); releaseFingers(); recorder.releaseAll(); }}>Stop all</button>
      </div>
      <ScenesBar />
      <div className="lrows" ref={rowsRef}>
        {song.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            audible={isAudible(song, t)}
            queued={playing && pendingAt[t.id] !== undefined}
            songMode={songMode}
            selectedSlot={selected.trackId === t.id ? selected.slot : undefined}
            onStepTap={(i, step) => { leaveSong(); if (step.off) toggleStep(t.id, i); select(t.id, step.slot); }}
            onStepTimes={(i, step, by) => { leaveSong(); setStepTimes(t.id, i, step.times + by); }}
            onAdd={() => { leaveSong(); appendClip(t.id, newLen); }}
            onSelect={() => { const first = t.active[0] ?? t.slots.findIndex(Boolean); select(t.id, first >= 0 ? first : null); }}
            onStop={() => stopTrack(t.id)}
            onMute={() => toggleMute(t.id)}
            onSolo={() => toggleSolo(t.id)}
            onGain={(g) => setGain(t.id, g)}
            onRename={(name) => renameTrack(t.id, name)}
          />
        ))}
      </div>
    </section>
  );
}

interface RowProps {
  track: Track;
  audible: boolean;
  queued: boolean;
  songMode: boolean;
  selectedSlot: number | null | undefined;
  onStepTap(index: number, step: Step): void;
  onStepTimes(index: number, step: Step, by: number): void;
  onAdd(): void;
  onSelect(): void;
  onStop(): void;
  onMute(): void;
  onSolo(): void;
  onGain(g: number): void;
  onRename(name: string): void;
}

/** A track: its header, then its line in the current scene — the clips it plays in turn — and ＋ to add one. */
function TrackRow({ track: t, audible, queued, songMode, selectedSlot, onStepTap, onStepTimes, onAdd, onSelect, onStop, onMute, onSolo, onGain, onRename }: RowProps) {
  const line = lineOf(t);
  return (
    <div className={`lrow${audible ? '' : ' silenced'}${selectedSlot !== undefined ? ' sel' : ''}`} style={{ ['--tc' as string]: t.color }}>
      <div className="thd" onClick={(e) => { if (!(e.target as HTMLElement).closest('input,button')) onSelect(); }}>
        <span className="c" />
        <span className="n">
          <strong><EditableName value={t.name} label={`track ${t.name}`} onRename={onRename} />{t.playCode && <span className="custom"> · custom line</span>}</strong>
          <input className="vol" type="range" min={0} max={1.5} step={0.01} value={t.fx.gain} aria-label={`${t.name} volume`} onChange={(e) => onGain(+e.target.value)} />
        </span>
        <span className="ms">
          <button className="m" aria-pressed={t.mute} aria-label={`Mute ${t.name}`} onClick={onMute}>M</button>
          <button className="s" aria-pressed={t.solo} aria-label={`Solo ${t.name}`} onClick={onSolo}>S</button>
        </span>
      </div>
      <div className="line" aria-label={`${t.name}: what it plays`}>
        {line.map((step, i) => {
          const clip = t.slots[step.slot];
          if (!clip) return null;
          return (
            <StepView
              key={`${i}:${step.slot}`}
              track={t} step={step} index={i} clip={clip}
              playing={!songMode && !step.off} queued={queued} selected={selectedSlot === step.slot}
              onTap={() => onStepTap(i, step)} onTimes={(by) => onStepTimes(i, step, by)}
            />
          );
        })}
        <button className={`addstep${line.length ? '' : ' first'}`} aria-label={`Add a new clip to ${t.name}`} title="A new clip at the end, ready to record" onClick={onAdd}>{line.length ? '＋' : '＋ Clip'}</button>
      </div>
      <button className="tstop" aria-label={`Stop ${t.name}`} title="Turn this track’s clips off" onClick={onStop}>■</button>
    </div>
  );
}

/** One step of a line: tap to open its clip (turning the step on if the track was stopped); − / + for how many times it plays. */
function StepView({ track: t, step, index, clip, playing, queued, selected, onTap, onTimes }: {
  track: Track; step: Step; index: number; clip: Clip; playing: boolean; queued: boolean; selected: boolean;
  onTap(): void; onTimes(by: number): void;
}) {
  const cls = ['clip', 'step', step.off ? 'off' : playing ? (queued ? 'queued' : 'playing') : '', selected ? 'selected' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} data-track={t.id} data-slot={step.slot} data-step={index}>
      <button className="stepmain" aria-label={`${clip.name}${step.times > 1 ? `, ${step.times} times` : ''}${step.off ? ', stopped' : ''}`} onClick={onTap}>
        <span className="cn">{clip.name}<span>{clip.bars} bar{clip.bars > 1 ? 's' : ''}{playing && queued ? ' · next bar' : ''}</span></span>
        <Thumb clip={clip} bank={t.bank} />
        {clip.code && <span className="badge" title="Hand-written code">code</span>}
      </button>
      <span className="times" role="group" aria-label={`Plays ${step.times} time${step.times > 1 ? 's' : ''}`}>
        <button aria-label="Play it once less" disabled={step.times <= 1} onClick={() => onTimes(-1)}>−</button>
        <output>×{step.times}</output>
        <button aria-label="Play it once more" onClick={() => onTimes(1)}>+</button>
      </span>
      <span className="prog" />
    </div>
  );
}

function Thumb({ clip, bank }: { clip: Clip; bank?: string }) {
  const n = clip.bars * STEPS_PER_BAR;
  if (clip.kind === 'drums') {
    const marks: [number, number][] = [];
    for (const k of kitVoices(bank)) clip.hits[k.voice]?.forEach((v, s) => v > 0 && marks.push([s, LANE[k.voice] ?? 1]));
    return <span className="thumb drum" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>{marks.map(([s, l], i) => <i key={i} style={{ gridColumn: s + 1, gridRow: l + 1 }} />)}</span>;
  }
  return (
    <span className="thumb" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {clip.notes.map((x, i) => <i key={i} style={{ gridColumn: `${x.step + 1} / span ${Math.min(x.len, n - x.step)}` }} />)}
    </span>
  );
}

/** Moves the progress bar of the clip each track is playing, and marks it live (also in song mode). */
function useProgress(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { song } = useStore.getState();
      for (const t of song.tracks) {
        const ph = player.playhead(t.id);
        ref.current?.querySelectorAll<HTMLElement>(`.clip[data-track="${t.id}"]`).forEach((el) => {
          const slot = +el.dataset.slot!;
          const clip = t.slots[slot];
          const live = !!ph && ph.slot === slot && !!clip;
          el.classList.toggle('live', live);
          el.style.setProperty('--pos', live ? String(ph!.step / (clip!.bars * STEPS_PER_BAR)) : '0');
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}
