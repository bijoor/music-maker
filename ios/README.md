# Music Maker for iPad (native wrapper)

A prototype: the Music Maker web app in a full-screen WKWebView, with WebKit's own gestures switched off so fast taps on the pads reach the page. Building and installing: see the main [README](../README.md#ipad-app-native-wrapper-prototype).

## Why

Measured on iPad with the bare tap test (`public/taps.html`: two pads, plain Web Audio, nothing drawn while playing): when two pads are tapped alternately faster than ~8 taps a second, about 1 in 6 taps never reaches the page — no touchstart, no pointerdown. The page already does everything a web page can (`user-scalable=no`, `touch-action: none` on play areas, `preventDefault` on touchstart, gesture events cancelled). What is left is in WebKit's native layer: a WKWebView is a scroll view whose content view carries a dozen or more UIKit gesture recognizers, and UIKit hands each touch to all of them. Tap recognizers in particular watch every finger, so two fingers landing close together can be taken as one double tap or two-finger tap. A web page cannot switch these off; an app can.

## What is switched off

Settings → Music Maker+ → **WebKit gestures** (read at launch; swipe the app away after changing it):

What the app finds on an iPad (iPadOS 27 simulator: 65 recognizers) and what each mode does with them:

| Recognizer | What it does | Leave as is | Off for drumming (default) | All off |
|---|---|---|---|---|
| WKTouchEventsGestureRecognizer | turns touches into the page's touch and pointer events | on | **on** | **on** |
| WKTouchActionGestureRecognizer | applies CSS `touch-action` (only ever blocks native gestures) | on | on | off |
| WKSyntheticTapGestureRecognizer, 1 finger 1 tap; "Keyboard dismissal tap" | makes `click` (all buttons), focuses fields; closes the keyboard | on | on | off (an injected script makes clicks) |
| WKDeferringGestureRecognizer "Deferrer for touch start/end (synthetic tap)" | lets `preventDefault` on a pad stop the click | on | on | off |
| Text interaction: single tap, loupe, interactive refinement, range adjustment | placing the cursor and selecting in the code view | on | on | off |
| Scroll view: pan, axis locking, delayed touches began, knob long press, hover, drag auto-scroll, press | scrolling and zooming the page itself (scrolling is also turned off, no bounce) | on | off | off |
| Double taps: WKSyntheticTap (2 taps), 2 × UITapGestureRecognizer (2 taps), two-finger double tap, two-finger tap | double-tap to zoom, double click, … | on | off | off |
| Text interaction: double tap, tap-and-a-half, indirect (trackpad) multi tap | select a word, drag-select | on | off | off |
| The other 6 deferrers (touch start/end immediate and delayed, touch move, image analysis) | hold native gestures back until the page answers a touch | on | off | off |
| Touch-action swipes ×4, long press, link highlight, image analysis, drag lift / add items (delays touches) and their relationship recognizers, pointer hover/press, Pencil hover, mouse, click-driver and secondary-click recognizers | | on | off | off |

The drumming list keeps by name only what the app needs; anything else, including recognizers a future iPadOS adds, is off. Every recognizer that waits for a second tap or finger is off, since those are the ones that could take two quick taps on different pads as one gesture.

Scrolling inside panels (`overflow: auto`) still works in every mode: those are separate scroll views inside the content view, which are not touched. Recognizers are disabled rather than removed, since WebKit wires failure requirements between them and a disabled recognizer simply fails; WebKit re-enables some (double tap follows the viewport) and adds others later (text editing), so the list is checked again at every new touch, before UIKit delivers it. The exact list found on the device, with what was done to each, is at the end of the bare tap test's results.

**All off** is for finding out whether the single-tap and text recognizers matter too. Clicks then come from a small injected script (a quick tap that did not move and whose touchstart was not `preventDefault`ed clicks the element under it); text selection and long-press menus are gone.

## Native touches

`TouchWindow` sees every touch the iPad reports before any recognizer does. With Settings → **Send native touches to the page** on, each touch start/end is also sent to the page as a `nativetouch` event on `window` (`detail: [{ id, phase, x, y, t }]`). In the bare tap test this gives:

- **Native touches on the pads** vs **Touches**: the difference is the taps WebKit lost. If gestures off brings this to 0, the fix is done.
- **Play from native touches**: sounds play from the native events instead of touchstart, skipping WebKit's touch delivery. If some touches are still lost with every gesture off (i.e. inside WebKit's touch-event recognizer itself), this is the fallback: the app's play areas (`src/app/usePlayTouches.ts`) could take their starts from `nativetouch` when `window.musicMakerNative` is present.

## Other things the app does

- Loads the web app built into it (`ios/build-web.sh` runs `npm run build` and copies `dist/` into the app as `web/`, minus the service worker), served at `musicmaker://app/music-maker/` so paths match GitHub Pages. Settings can switch to the published site or a dev server address instead.
- Audio session `playback` (plays with the silent switch on) with a 5 ms buffer request; landscape, status bar and home indicator hidden, edge swipes go to the page first.
- `alert`/`confirm`/`prompt` work; links to other sites open in Safari; the web inspector is on (Safari → Develop → the iPad).
- Data (songs, recorded kits) is the app's own, separate from Safari's and the Home Screen app's: export songs from one and import them in the other.

No signing team is set in the project; pick yours in Xcode (it is stored in the project only if you commit that change — it is a team id, not a secret).
