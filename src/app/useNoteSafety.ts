import { useEffect } from 'react';
import * as recorder from '../engine/recorder';
import { releaseFingers } from './MelodicPlay';

/**
 * Safety nets so a note never keeps sounding without a finger on it. iOS sometimes loses the lift of a finger
 * (fast multi-finger playing, a gesture it claims, a notification): when no finger is touching the screen at all,
 * any key still held is let go. Leaving the app (switching away, locking, hiding the page) lets everything go.
 */
export function useNoteSafety() {
  useEffect(() => {
    const touchEnd = (e: TouchEvent) => { if (e.touches.length === 0) releaseFingers(); };
    const leave = () => { releaseFingers(); recorder.releaseAll(); };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    addEventListener('touchend', touchEnd, { capture: true, passive: true });
    addEventListener('touchcancel', touchEnd, { capture: true, passive: true });
    addEventListener('pagehide', leave);
    addEventListener('blur', leave);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      removeEventListener('touchend', touchEnd, { capture: true });
      removeEventListener('touchcancel', touchEnd, { capture: true });
      removeEventListener('pagehide', leave);
      removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
}
