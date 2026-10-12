import PanelFrame from './PanelFrame';

const SOURCES: { name: string; url: string; what: string; license: string }[] = [
  { name: 'Strudel', url: 'https://strudel.cc', what: 'The music engine, synths and the code language', license: 'AGPL-3.0' },
  { name: 'tidal-drum-machines, piano (dough-samples)', url: 'https://github.com/felixroos/dough-samples', what: 'Drum machines (TR-909, TR-808, TR-707, LinnDrum) and the Piano', license: 'as published by the Strudel project' },
  { name: 'General MIDI soundfonts (webaudiofont)', url: 'https://github.com/surikov/webaudiofont', what: 'Sounds named gm_… such as Sitar, Shehnai, Nylon guitar', license: 'as published with webaudiofont' },
  { name: 'tonejs-instruments', url: 'https://github.com/nbrosowsky/tonejs-instruments', what: 'Harmonium, Acoustic/Nylon/Electric guitar, Violin, Cello, Double bass, Flute, Clarinet, Saxophone, brass, Harp, Church organ, Xylophone — samples by Nicholaus Brosowsky, from public-domain sources', license: 'CC BY 3.0' },
  { name: 'Versilian Community Sample Library (VCSL)', url: 'https://github.com/sgossner/VCSL', what: 'Grand piano, Psaltery, Strumstick, Recorder, Ocarina, Harmonica, Glockenspiel, Tubular bells', license: 'CC0' },
  { name: 'Mridangam strokes (yaxu/mrid)', url: 'https://www.arthurcarabott.com/konnakkol/', what: 'The Mridangam kit — samples © Arthur Carabott 2022, performed by Harishankar V Menon', license: 'CC BY-SA' },
  { name: '“Tabla” by msarkar (Freesound)', url: 'https://freesound.org/people/msarkar/packs/3571/', what: 'Tabla: Na, Ta, Tin, Tun, Te, Dha, Dhin', license: 'Sampling Plus 1.0 (non-commercial sharing)' },
  { name: '“tabla bols” by mmiron (Freesound)', url: 'https://freesound.org/people/mmiron/packs/8162/', what: 'Tabla: Ge, Ghe, Gha, Te 2, Tak', license: 'CC0' },
  { name: '“Tabla Strokes” by ajaysm (Freesound)', url: 'https://freesound.org/people/ajaysm/packs/10737/', what: 'Tabla: Ke, Kat', license: 'CC BY 4.0' },
];

/** Credits for the sounds and the engine, with their licences. */
export default function About() {
  return (
    <PanelFrame title="About and sound credits">
      <div className="about">
        <p>Music Maker writes <a href="https://strudel.cc" target="_blank" rel="noreferrer">Strudel</a> code as you play. Its source is on <a href="https://github.com/bijoor/music-maker" target="_blank" rel="noreferrer">GitHub</a> under the AGPL-3.0.</p>
        <p className="muted-text">Sounds are loaded from these collections the first time they are used (then kept for offline use); the tabla strokes are part of the app. The tabla strokes were chosen by ear and named by bol for this app; some differ from the recordings' original labels.</p>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noreferrer"><strong>{s.name}</strong></a> · <span className="lic">{s.license}</span>
              <div className="muted-text">{s.what}</div>
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  );
}
