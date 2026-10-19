import { useEffect } from 'react';

/** Where fingers play (pads, drums, keys): every touch there belongs to the page. */
const PLAY_AREAS = '.padgrid, .kit, .drumtouch, .tappads, .kb, .spads, .chords';

/**
 * Keep iOS from holding back fingers. With one finger down, Safari holds a second finger's touch while it decides
 * whether a pinch or two-finger tap is starting, and delivers it only when the first finger moves or lifts — or never,
 * if the second lifts first. Playing two pads alternately at speed lost one pad's taps this way. So touches in the
 * playing areas are claimed by the page (no gesture may start from them), and Safari's pinch gestures are cancelled
 * everywhere (the page cannot be zoomed either; see the viewport in index.html).
 */
export function usePlayTouches() {
  useEffect(() => {
    const claim = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest(PLAY_AREAS)) e.preventDefault();
    };
    const noGesture = (e: Event) => e.preventDefault();
    const opts = { capture: true, passive: false } as const;
    addEventListener('touchstart', claim, opts);
    addEventListener('touchmove', claim, opts);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, noGesture, opts);
    return () => {
      removeEventListener('touchstart', claim, opts);
      removeEventListener('touchmove', claim, opts);
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.removeEventListener(type, noGesture, opts);
    };
  }, []);
}
