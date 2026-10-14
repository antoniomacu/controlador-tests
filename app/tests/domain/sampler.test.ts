import {
  availableCount,
  randomTestId,
  sampleQuestions,
  temasOf,
} from '../../src/domain/sampler';
import type { Question } from '../../src/domain/types';

function q(id: string, tema: number, subject: 'temario' | 'ingles' = 'temario'): Question {
  return {
    id,
    subject,
    tema,
    group: String(tema),
    stem: id,
    answer: 'a',
    level: 'N1',
    options: { a: '1', b: '2', c: '3', d: '4' },
  };
}

const pool = [
  ...Array.from({ length: 10 }, (_, i) => q(`T1#${i}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => q(`T2#${i}`, 2)),
  ...Array.from({ length: 5 }, (_, i) => q(`T3#${i}`, 3)),
  q('ING#1', 1, 'ingles'),
];

describe('sampler', () => {
  it('lists chapters per subject', () => {
    expect(temasOf(pool, 'temario')).toEqual([1, 2, 3]);
    expect(temasOf(pool, 'ingles')).toEqual([1]);
  });

  it('counts available questions in the chosen chapters only', () => {
    expect(availableCount(pool, 'temario', [1, 3])).toBe(15);
    expect(availableCount(pool, 'temario', [])).toBe(0);
  });

  it('draws only from chosen chapters and subject, without duplicates', () => {
    const drawn = sampleQuestions(pool, { subject: 'temario', temas: [1, 3], count: 12, seed: 7 });
    expect(drawn).toHaveLength(12);
    expect(new Set(drawn.map((x) => x.id)).size).toBe(12);
    expect(drawn.every((x) => x.subject === 'temario' && [1, 3].includes(x.tema))).toBe(true);
  });

  it('caps the count at what is available', () => {
    const drawn = sampleQuestions(pool, { subject: 'temario', temas: [3], count: 50, seed: 1 });
    expect(drawn).toHaveLength(5);
  });

  it('is reproducible for a seed and differs across seeds', () => {
    const opts = { subject: 'temario' as const, temas: [1, 2], count: 10 };
    const a = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const b = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const c = sampleQuestions(pool, { ...opts, seed: 43 }).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('does not reorder the caller array', () => {
    const before = pool.map((x) => x.id);
    sampleQuestions(pool, { subject: 'temario', temas: [1, 2, 3], count: 25, seed: 9 });
    expect(pool.map((x) => x.id)).toEqual(before);
  });

  it('rejects a count below one', () => {
    expect(() =>
      sampleQuestions(pool, { subject: 'temario', temas: [1], count: 0, seed: 1 }),
    ).toThrow('count must be at least 1');
  });

  it('builds random test IDs with sorted chapters and seconds', () => {
    const date = new Date(2026, 9, 14, 20, 30, 15);
    expect(randomTestId([4, 3, 3], date)).toBe('RND-T34-20261014-203015');
  });
});
