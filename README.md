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

## Scenes: building a song live

A song is played and built one **scene** (sequence) at a time. There is always a current scene (highlighted in the scenes bar) and it follows what the tracks play, with no saving. Each track row shows what it plays in the scene: its clips, in turn. **− ×N +** on a step sets how many times it plays (Groove ×3 then a break); tap a step to open its clip; **＋** adds a new empty clip at the end, ready to record. Under the editor header, the open clip's step can move earlier or later, **Clear notes** (to play new notes into it — an earlier scene that plays the clip keeps its own copy), be taken out of the scene (**Remove from scene**), or play another of the track's clips. ■ stops a track (its steps stay, and tapping one turns it back on). A scene lasts as long as its longest track; shorter tracks repeat and are cut at the top so every track restarts together (`.ribbon(0, bars)` in the code), or keep cycling (scene menu → Shorter tracks). **＋ New scene** starts the next scene as a copy of what is heard; change tracks one by one and the song morphs into it, while the earlier scene keeps its clips: editing a clip that an earlier scene also plays edits a copy for the current scene. Tap any scene to play it from the next bar and carry on building it (or start a new one from it). Steps turned off while building a scene are dropped when another scene is chosen.

## Track groups

+ Track offers groups: **Drums** and **Indian drums**, and **Indian**, **Keys**, **Strings & guitars**, **Wind & brass**, **Bass**, **Synth** and **Drone**. A new track takes its group's colour and name ("Strings", "Strings 2"), instrument (or kit) and keyboard: Indian, Wind and Drone open on scale pads, the others on the piano. Each track keeps its own keyboard (piano: 1 or 2 octaves; scale pads: 1 to 4 rows, smaller pads as rows are added, lowest octave at the bottom; **Wide rows** puts two octaves in each row, for 2, 4 or 6 octaves, with the chord row widened to match); changing it also makes it the group's default for new tracks on this device. On a computer keyboard scale pad rows play from Z X C V … (lowest) up through A S D F … and Q W E R …. A track's instrument menu lists its group's instruments first (all the others below), and recorded kits belong to the group chosen when recording them (Indian drums by default).

## Expression: velocity and bends

- **Fade in / Ring out** (Sound strip; `.attack()` / `.release()` on the track's code): each note fades in and keeps ringing after it ends, so a held note repeating every bar — a drone — overlaps itself instead of stopping at the bar line. New Drone tracks start with them set, on the recorded harmonium.
- **Keys sound while held**, like a real instrument (and GeoShred): keys, scale pads and chord pads play until the finger lifts. The **Sustain** button (or holding Shift) is a pedal: notes keep ringing after you let go, until the next note is played (they fade over a quarter second) or Sustain is turned off.
- **Drum pads**: where a pad is struck sets the velocity in both directions (soft top-left, full bottom-right); keeping the finger down and sliding any way swells or fades the hit while it rings. On the tabla's Ge and the mridangam's Thom, sliding up raises the pitch (up to 5 semitones over the pad's height, like pressing into the bass head) and left/right changes the volume.
- **Strike velocity** (as in GeoShred): where you strike a pad, key or scale pad sets how hard the note plays — soft at the top, full near the bottom (More → Strike velocity flips it or turns it off). MIDI velocity is used too. Softer notes and hits show lighter on the grids; a note's velocity can be changed on the note grid. In code: `.velocity("…")` in the notes' rhythm (a drum voice with softer hits gets a layer of its own).
- **Bends**: a note can bend in from the previous note or a semitone or two away (note grid → Bend, with a speed). On the keys and scale pads, moving a held finger onto another key plays that key; with **Slide** on (keyboard bar), sliding sideways instead glides the pitch and lands on notes: while the finger keeps moving one way the pitch glides continuously through the keys it passes (reaching each key's note at its centre); when it stops or reverses, the pitch settles on the note of the key under the finger, and a new glide starts from there (More → Slides settle on the key under the finger; off for free, fretless bends). Wobbles of a resting finger smaller than More → Slide steadiness (4, 8 or 14 px) count as standing still, and a finger has to go that far past a key's edge to count as on the next key (sliding up and down changes the volume smoothly from the velocity it was struck at). Record and Edit write each key the finger passes as a note bending in from the last. In code: Strudel's pitch envelope, `.penv("…").pattack(…)`.

## Recording your own drum kits

More → Record a drum kit (or **＋ Record a new kit…** in a drum track's kit menu): name the kit, tap Record and play strokes one at a time into the iPad's microphone (or an audio interface). The recording is cut into one sample per stroke (each starts just before its attack and is levelled; velocity sets how loud it plays). Name each stroke by its bol, choose the hand that plays it (pads, keys and grid rows follow, as for the tabla), mark bass strokes that should bend when the finger slides up, and remove the ones you do not want; **Record more** adds to the list. Saved kits appear under **My kits** and can be edited (Edit kit) or deleted. In code a recorded stroke is a sound like any other, `s("dholak_na ~ dholak_ge")`. The sounds are kept on the device (IndexedDB), so a song using a recorded kit plays it only where the kit was recorded, for now.

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

Selecting or adding a track starts the sound engine and loads that track's sounds — every pad, or every key its keyboard can show (all rows, plus an octave below) — then the other tracks', so the first press of any key sounds at once; changing the instrument, octave or keyboard loads again. Every sound has the silence before it cut when it loads (anything below −40 dB before the first audible sample, keeping 1 ms), so keys and pads sound the moment they are played: many sample files start with a lead-in of 10–50 ms, and Safari also plays an MP3's encoder delay.

`public/samples/tonejs.json` and `public/samples/tabla.json` are generated by `node scripts/make-sample-maps.mjs`. The tonejs files are served from jsDelivr's GitHub mirror; the tabla strokes (Freesound previews, picked by ear and named by bol) are saved in `public/samples/tabla/` as WAV (MP3s start with a few milliseconds of encoder silence that Safari plays, which makes strokes late) and ship with the app. Because of the msarkar strokes' Sampling Plus licence, the tabla sounds may be shared freely but not sold.

Drum tracks choose a drum machine or an Indian kit (Mridangam, Tabla), each with its own pads, grid rows, keys and presets (Teentaal and Keherwa on tabla; Adi talam on mridangam). Indian kit pads are a grid, by default five columns — left hand (bayan / thoppi) ×2 | both hands | right hand (dayan / valanthalai) ×2 — with each hand's strokes in the drum layout's order. **Arrange** (on the pads): set the grid's **Rows** (1–6) and **Columns** (1–8), then tap any pad and choose its stroke in the panel beside the pads (a stroke can have several pads; Nothing empties a pad); kept per kit on the device, Reset pads goes back. On a computer keyboard the pad grid sits on the keyboard: its bottom row on Z X C V …, the rows above on A S D F …, Q W E R … and 1 2 3 …; on a computer keyboard the left hand plays F D S A / R E W Q / V C X Z, the right hand J K L ; / U I O P / M , . / and both hands G H T Y B N. The drum kit's keys: Space kick, B kick 2, C snare, S snare 2, D rim, M hat, L open hat, F G H toms, P crash, Q ride, R T Y U clap, cowbell, shaker, tambourine. Enter plays and stops the song.

**Drum view.** Indian kits (and recorded kits) can also be played as the instrument itself: Play → **Drum** shows the two heads side by side, bass on the left, each in areas — rim, middle ring, syahi and syahi centre — split into segments that each play a stroke (the default tabla layout: bayan rim Ge and Gha, middle Ghe and Gha, syahi Ke and Kat; dayan rim Tak, Ta and Dha, middle Tak, Te and Te 2, syahi Tun, Tin, Te and Dhin, centre Te 2). Sliding toward the centre from a bending stroke (marked ↗) raises its pitch. As on a real drum, a new stroke stops the one still ringing on the same head (a two-hand bol such as Dha stops both); the Indian-kit pads do the same. Strokes struck within about a tenth of a second of each other all ring (a two-finger roll, or one stroke on two pads), and strokes in quick succession keep their real spacing even though the iPad's audio clock moves in coarse steps. A press the sound engine could not start in time (it drops a sound it is late for, which happened to quick taps on busy moments) is played again at once instead of being lost; About counts them. Velocity: **Depth** makes each area soft at one side and full at the other (choose the loud side, Outside or Inside, per area in Edit layout); **Tap force** reads how hard a tap jolts the iPad from its motion sensor (allow Motion & Orientation access when asked; tap the button again after reopening the app), plays the stroke at once and corrects its volume a few milliseconds later, scaled to your recent hardest taps — it works best with the iPad lying flat. They can be used together. **Hold damps** (on by default, drum view and Indian-kit pads): strike and lift at once and the stroke rings; leave the finger resting and it is damped after about a tenth of a second, like a hand stopping the skin (a sliding finger swells or bends instead, and bending strokes such as Ge are never damped; recorded clips keep the stroke ringing). Each stroke also has a base level (Edit layout → select a segment, or **Levels** on the pads → tap a pad; −24 to +6 dB; it applies wherever the stroke plays, pads and clips included, and is kept on the device); the tabla's loud bayan strokes start lower (Ge −5 dB, Ghe and Gha −8 dB). A limiter before the speakers catches peaks when both hands strike together, so the iPad's own speaker protection does not turn the whole output down. **Edit layout**: tap an area, split it into 1–4 segments, turn them (Rotate segments) to sit under your fingers, and choose each segment's stroke; sliders set the rim width and the syahi size and position. Both heads are drawn the same size, as big as the playing area allows, one in each half. Layouts are kept per kit on the device; Reset returns to the default. **Pads** goes back to the pads.

**Expand** (editor header, every instrument) hides the clips so the pads, keys or drums get the whole screen; **Clips** brings them back.

## License

[AGPL-3.0](LICENSE), the same license as Strudel.
