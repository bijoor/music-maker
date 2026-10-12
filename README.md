# Music Maker

A loop-based music maker for iPad that writes [Strudel](https://strudel.cc) code as you play. Build short clips with drum pads, a keyboard and step grids, launch them on the bar line, and read or edit the generated code when you want to.

Status: **Phase 7** — installable on iPad as an app (PWA: Share → Add to Home Screen; works offline once sounds have loaded), computer-keyboard playing with key hints, per-track sound controls, a song library with export/import files, and Web MIDI input (desktop Chrome/Edge). Before that: **Phase 6** — the code view is editable: Apply reads edits back into the song by compiling each clip with Strudel and turning the events it plays back into grid notes; code the grid cannot show is kept as custom code (still plays, Reset to grid). No pop-up dialogs: song order, the raga editor, calibration and code open in the bottom panel. Before that: **Phase 5** — chained slots (Chain: tap slots in the order to play them, e.g. A A A C), saved scenes (launch several tracks' clips together; tracks a scene does not name keep playing) and song mode (scenes in order with bar counts, generated with `arrange()`). Before that: clip grid, drum and melodic clip editors, scales and ragas, and three modes: **Perform** (pads and keys only sound), **Record** (presses snap to the nearest step of the selected clip as it loops; held keys set note length; count-in, snap 1/16–1/4) and **Edit** (tapping a clip selects it without playing; pads and keys place notes at a chosen step). Undo/redo for clip content, a click track, and autosave in the browser. The Phase 0 test page is in the More menu.

## Run it

```bash
npm install
npm run dev -- --host
```

Open the printed `Network` address on the iPad (same Wi-Fi). Add `#lab` to the address for the Phase 0 tests.

To install on iPad: open the published site in Safari, tap Share → Add to Home Screen. App icons are drawn by `node scripts/make-icons.mjs`.

```bash
npm test
```

runs the code generator tests: generated code is compiled with Strudel and must play exactly what the model says.

The latest build of `main` is also published at <https://bijoor.github.io/music-maker/>.

## Phase 0 checks

| # | Check | How it is measured |
|---|---|---|
| 1 | Strudel plays | Events reach the audio output |
| 2 | A clip switches exactly on the bar line | Clip B swaps the snare for a clap; no snare may sound after the switch bar and no clap before it |
| 3 | A 2-bar clip launched mid-song starts at its bar 1 | The clip's bar 1 starts on c2; launched on an odd bar it must still start on c2 |
| 4 | Chained clips play in turn | `arrange([3, groove], [1, fill])` must be heard as A A A C |
| 5 | Pad latency | Tap along to a metronome; the page reports the average offset |
| 6 | Played notes map back to code | Every played event carries the character range of its code token |
| 7 | Drum sounds per machine | Lists which of the planned pad sounds each drum machine has |

**Copy results** puts a text summary on the clipboard.

## How clips switch on the bar line

`src/engine/strudel.ts` keeps a timeline per track. Launching a clip compiles its code first, then picks the first bar line the scheduler has not queued yet, so a switch can never land in the past however slow the device is. Each track plays its old clip until the switch bar and the new one after it (`switchAt`); the tracks are stacked into one pattern. A clip of several bars is shifted so it always starts at its own bar 1.

## Project

- `mockup/` — the interactive UI mockups (`index.html` is the current loop-editor design)
- `src/model/` — song, track, clip and scene types; drum kit; scales and ragas; demo song
- `src/codegen/` — song → Strudel code, with a map from code tokens to clip steps
- `src/engine/` — Strudel integration (`strudel.ts`) and the player that keeps it in step with the song (`player.ts`)
- `src/state/` — app state (zustand)
- `src/app/` — the app screen
- `src/lab/` — the Phase 0 test page

Plan: see the project plan document (shared separately).

## Expression: velocity and bends

- **Keys sound while held**, like a real instrument (and GeoShred): keys, scale pads and chord pads play until the finger lifts. The **Sustain** button (or holding Shift) is a pedal: notes keep ringing after you let go, until the next note is played (they fade over a quarter second) or Sustain is turned off.
- **Drum pads**: where a pad is struck sets the velocity in both directions (soft top-left, full bottom-right); keeping the finger down and sliding any way swells or fades the hit while it rings. On the tabla's Ge, sliding up raises the pitch (up to 5 semitones over the pad's height, like pressing the heel into the bayan) and left/right changes the volume.
- **Strike velocity** (as in GeoShred): where you strike a pad, key or scale pad sets how hard the note plays — soft at the top, full near the bottom (More → Strike velocity flips it or turns it off). MIDI velocity is used too. Softer notes and hits show lighter on the grids; a note's velocity can be changed on the note grid. In code: `.velocity("…")` in the notes' rhythm (a drum voice with softer hits gets a layer of its own).
- **Bends**: a note can bend in from the previous note or a semitone or two away (note grid → Bend, with a speed). On the keys and scale pads, moving a held finger onto another key plays that key; with **Slide** on (keyboard bar), sliding sideways instead glides the pitch smoothly: the note starts exactly on the struck key wherever it was struck and reaches each other key's pitch at its centre; when the finger stops on a key, the pitch settles onto that key (More → Slides settle on the key under the finger; off for free bends) (sliding up and down changes the volume smoothly from the velocity it was struck at). Record and Edit write each key the finger passes as a note bending in from the last. In code: Strudel's pitch envelope, `.penv("…").pattack(…)`.

## Sounds and credits

Sounds load from these collections the first time they are used (the installed app then keeps them offline). The same list is in the app under More → About and sound credits.

| Collection | Used for | Licence |
|---|---|---|
| [Strudel](https://strudel.cc) / [dough-samples](https://github.com/felixroos/dough-samples) | Engine, synths, drum machines (TR-909/808/707, LinnDrum), Piano | AGPL-3.0 (engine); samples as published by the Strudel project |
| [webaudiofont](https://github.com/surikov/webaudiofont) General MIDI soundfonts | `gm_…` sounds: Sitar, Shehnai, guitars, strings, … | as published with webaudiofont |
| [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) (Nicholaus Brosowsky) | Harmonium, acoustic/nylon/electric guitar, violin, cello, double bass, flute, clarinet, saxophone, brass, harp, church organ, xylophone | Samples CC BY 3.0 |
| [VCSL](https://github.com/sgossner/VCSL) (Versilian Community Sample Library) | Grand piano, psaltery, strumstick, recorder, ocarina, harmonica, glockenspiel, tubular bells | CC0 |
| [Mridangam strokes](https://github.com/yaxu/mrid) — © Arthur Carabott 2022, performed by Harishankar V Menon ([konnakkol](https://www.arthurcarabott.com/konnakkol/)) | Mridangam kit | CC BY-SA |
| [“Tabla” by msarkar](https://freesound.org/people/msarkar/packs/3571/) (Freesound) | Tabla: Na, Ta, Tin, Tun, Te, Dha, Dhin | Sampling Plus 1.0 (non-commercial sharing) |
| [“tabla bols” by mmiron](https://freesound.org/people/mmiron/packs/8162/) (Freesound) | Tabla: Ge, Ghe, Gha, Te 2, Tak | CC0 |
| [“Tabla Strokes” by ajaysm](https://freesound.org/people/ajaysm/packs/10737/) (Freesound) | Tabla: Ke, Kat | CC BY 4.0 |

`public/samples/tonejs.json` and `public/samples/tabla.json` are generated by `node scripts/make-sample-maps.mjs`. The tonejs files are served from jsDelivr's GitHub mirror; the tabla strokes (Freesound previews, picked by ear and named by bol) are saved in `public/samples/tabla/` and ship with the app. Because of the msarkar strokes' Sampling Plus licence, the tabla sounds may be shared freely but not sold.

Drum tracks choose a drum machine or an Indian kit (Mridangam, Tabla), each with its own pads, grid rows, keys and presets (Teentaal and Keherwa on tabla; Adi talam on mridangam). Indian kit pads are laid out by hand: left hand (bayan / thoppi) | both hands | right hand (dayan / valanthalai); on a computer keyboard the left hand plays F D S A / R E W Q / V C X Z, the right hand J K L ; / U I O P / M , . / and both hands G H T Y B N. The drum kit's keys: Space kick, B kick 2, C snare, S snare 2, D rim, M hat, L open hat, F G H toms, P crash, Q ride, R T Y U clap, cowbell, shaker, tambourine. Enter plays and stops the song.

## License

[AGPL-3.0](LICENSE), the same license as Strudel.
