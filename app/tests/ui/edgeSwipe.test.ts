import { describe, expect, it } from 'vitest';
import { EDGE_PX, startsAtEdge, swipeOutcome } from '../../src/ui/edgeSwipe';

const W = 390; // iPhone width in CSS px

describe('startsAtEdge', () => {
  it('only accepts touches that begin against the left edge', () => {
    expect(startsAtEdge(0)).toBe(true);
    expect(startsAtEdge(EDGE_PX)).toBe(true);
    expect(startsAtEdge(EDGE_PX + 1)).toBe(false);
  });
});

describe('swipeOutcome', () => {
  it('goes back after a horizontal swipe past 30% of the screen', () => {
    expect(swipeOutcome({ dx: 0.3 * W + 1, dy: 10, width: W })).toBe('back');
  });

  it('cancels a swipe released before 30% of the screen', () => {
    expect(swipeOutcome({ dx: 0.3 * W - 1, dy: 0, width: W })).toBe('cancel');
  });

  it('cancels a mostly vertical drag, which is a scroll', () => {
    expect(swipeOutcome({ dx: 200, dy: 220, width: W })).toBe('cancel');
  });

  it('cancels a swipe towards the left', () => {
    expect(swipeOutcome({ dx: -200, dy: 0, width: W })).toBe('cancel');
  });
});
