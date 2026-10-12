import PanelFrame from './PanelFrame';

const SOURCES: { name: string; url: string; what: string; license: string }[] = [
  { name: 'Strudel', url: 'https://strudel.cc', what: 'The music engine, synths and the code language', license: 'AGPL-3.0' },
  { name: 'tidal-drum-machines, piano (dough-samples)', url: 'https://github.com/felixroos/dough-samples', what: 'Drum machines (TR-909, TR-808, TR-707, LinnDrum) and the Piano', license: 'as published by the Strudel project' },
  { name: 'General MIDI soundfonts (webaudiofont)', url: 'https://github.com/surikov/webaudiofont', what: 'Sounds named gm_… such as Sitar, Shehnai, Nylon guitar', license: 'as published with webaudiofont' },
  { name: 'tonejs-instruments', url: 'https://github.com/nbrosowsky/tonejs-instruments', what: 'Harmonium, Acoustic/Nylon/Electric guitar, Violin, Cello, Double bass, Flute, Clarinet, Saxophone, brass, Harp, Church organ, Xylophone — samples by Nicholaus Brosowsky, from public-domain sources', license: 'CC BY 3.0' },
  { name: 'Versilian Community Sample Library (VCSL)', url: 'https://github.com/sgossner/VCSL', what: 'Grand piano, Psaltery, Strumstick, Recorder, Ocarina, Harmonica, Glockenspiel, Tubular bells', license: 'CC0' },
  { name: 'Mridangam strokes (yaxu/mrid)', url: 'https://www.arthurcarabott.com/konnakkol/', what: 'The Mridangam kit — samples © Arthur Carabott 2022, performed by Harishankar V Menon', license: 'CC BY-SA' },
  { name: 'TidalCycles Dirt-Samples', url: 'https://github.com/tidalcycles/Dirt-Samples', what: 'The Tabla kit (strokes grouped under the nearest bol by this app)', license: 'no licence stated; shared with TidalCycles' },
];

/** Credits for the sounds and the engine, with their licences. */
export default function About() {
  return (
    <PanelFrame title="About and sound credits">
      <div className="about">
        <p>Music Maker writes <a href="https://strudel.cc" target="_blank" rel="noreferrer">Strudel</a> code as you play. Its source is on <a href="https://github.com/bijoor/music-maker" target="_blank" rel="noreferrer">GitHub</a> under the AGPL-3.0.</p>
        <p className="muted-text">Sounds are loaded from these collections the first time they are used (then kept for offline use):</p>
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
