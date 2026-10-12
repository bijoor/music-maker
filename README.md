# Music Maker

A loop-based music maker for iPad that writes [Strudel](https://strudel.cc) code as you play. Build short clips with drum pads, a keyboard and step grids, launch them on the bar line, and read or edit the generated code when you want to.

Status: **Phase 0** — a test page that checks Strudel can do what the loop editor needs. The app itself starts in Phase 1.

## Run it

```bash
npm install
npm run dev -- --host
```

Open the printed `Network` address on the iPad (same Wi-Fi), tap **Start audio**, then run the tests.

## Phase 0 checks

| # | Check | How it is measured |
|---|---|---|
| 1 | Strudel plays | Events reach the audio output |
| 2 | A clip switches exactly on the bar line | Clip B swaps the snare for a clap; no snare may sound after the switch bar and no clap before it |
| 3 | A 2-bar clip launched mid-song starts at its bar 1 | The clip's bar 1 starts on c2; launched on an odd bar with `.late(n)` it must still start on c2 |
| 4 | Chained clips play in turn | `arrange([3, groove], [1, fill])` must be heard as A A A C |
| 5 | Pad latency | Tap along to a metronome; the page reports the average offset |
| 6 | Played notes map back to code | Every played event carries the character range of its code token |
| 7 | Drum sounds per machine | Lists which of the planned pad sounds each drum machine has |

**Copy results** puts a text summary on the clipboard.

## How clips switch on the bar line

`src/engine/strudel.ts` wraps one Strudel repl. When a change should land on the next bar, the newly evaluated pattern is combined with the playing one by `switchAt(before, after, cycle)`: queries before the bar line go to the old pattern and queries after it go to the new one. The switch bar is never earlier than what the scheduler has already queued, so it is exact regardless of timing.

## Project

- `mockup/` — the interactive UI mockups (`index.html` is the current loop-editor design)
- `src/engine/` — Strudel integration
- `src/lab/` — the Phase 0 test page

Plan: see the project plan document (shared separately).

## License

[AGPL-3.0](LICENSE), the same license as Strudel.
