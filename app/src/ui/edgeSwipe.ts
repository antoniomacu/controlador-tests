import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * The iPhone "swipe from the left edge to go back" gesture. A web app added to the home screen
 * does not get the system one, so the app recognises it itself.
 */

/** A drag counts only if it starts this close to the left edge, like the system gesture. */
export const EDGE_PX = 24;
/** Fraction of the screen width the finger must cross before letting go goes back. */
const BACK_FRACTION = 0.3;

export function startsAtEdge(x: number): boolean {
  return x <= EDGE_PX;
}

/** What letting go means: back only for a mostly horizontal drag to the right, far enough. */
export function swipeOutcome(d: { dx: number; dy: number; width: number }): 'back' | 'cancel' {
  if (d.dx <= 0 || Math.abs(d.dy) >= d.dx) return 'cancel';
  return d.dx > d.width * BACK_FRACTION ? 'back' : 'cancel';
}

/**
 * Listens for the edge swipe on the whole document and calls `onBack` on release. Returns how
 * far the finger has travelled (0 when idle) so a cue can follow it. `onBack` null disables it.
 */
export function useEdgeSwipe(onBack: (() => void) | null): number {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const back = useRef(onBack);
  back.current = onBack;

  useEffect(() => {
    const point = (e: TouchEvent, list: 'touches' | 'changedTouches') => e[list]?.[0];
    const onStart = (e: TouchEvent) => {
      const t = point(e, 'touches');
      start.current =
        back.current && t && startsAtEdge(t.clientX) ? { x: t.clientX, y: t.clientY } : null;
    };
    const onMove = (e: TouchEvent) => {
      const t = point(e, 'touches');
      if (start.current && t) setDx(Math.max(0, t.clientX - start.current.x));
    };
    const onEnd = (e: TouchEvent) => {
      const t = point(e, 'changedTouches');
      const s = start.current;
      start.current = null;
      setDx(0);
      if (!s || !t || !back.current) return;
      const outcome = swipeOutcome({
        dx: t.clientX - s.x,
        dy: t.clientY - s.y,
        width: window.innerWidth,
      });
      if (outcome === 'back') back.current();
    };
    // The system took the touch over (a call, the notification centre): never go back.
    const onCancel = () => {
      start.current = null;
      setDx(0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, []);

  return dx;
}
