/** The arrow that follows the finger during an edge swipe; solid once letting go goes back. */
export function SwipeCue({ dx }: { dx: number }) {
  const ready = dx > window.innerWidth * 0.3;
  const x = Math.min(dx, 64);
  return (
    <div
      class={ready ? 'swipe-cue ready' : 'swipe-cue'}
      style={{ transform: `translate(${x - 48}px, -50%)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </div>
  );
}
