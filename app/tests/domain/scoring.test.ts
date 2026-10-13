import { passes, score } from '../../src/domain/scoring';

const it_ = (key: 'a' | 'b', ans: 'a' | 'b' | null) => ({ key, ans });

describe('score', () => {
  it('counts correct, wrong and blank and applies -0.33', () => {
    const s = score([it_('a', 'a'), it_('a', 'b'), it_('b', null), it_('b', 'b')]);
    expect(s).toEqual({ correct: 2, wrong: 1, blank: 1, net: 1.67 });
  });

  it('handles all blank and all correct', () => {
    expect(score([it_('a', null), it_('b', null)]).net).toBe(0);
    expect(score([it_('a', 'a'), it_('b', 'b')]).net).toBe(2);
  });

  it('rounds the net score to two decimals', () => {
    const s = score([it_('a', 'b'), it_('a', 'b'), it_('a', 'b')]);
    expect(s.net).toBe(-0.99);
  });
});

describe('passes', () => {
  it('compares the net score with the pass reference', () => {
    expect(passes({ correct: 10, wrong: 0, blank: 10, net: 10 }, 10)).toBe(true);
    expect(passes({ correct: 10, wrong: 1, blank: 9, net: 9.67 }, 10)).toBe(false);
  });
});
