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

## License

[AGPL-3.0](LICENSE), the same license as Strudel.
