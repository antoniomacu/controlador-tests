import {
  availableCount,
  groupsOf,
  randomTestId,
  sampleQuestions,
} from '../../src/domain/sampler';
import type { Question } from '../../src/domain/types';

function q(id: string, group: string, subject: 'temario' | 'ingles' = 'temario'): Question {
  return {
    id,
    subject,
    tema: subject === 'temario' ? Number(group) : null,
    group,
    stem: id,
    answer: 'a',
    options: { a: '1', b: '2', c: '3', d: '4' },
  };
}

const pool = [
  ...Array.from({ length: 10 }, (_, i) => q(`T1#${i}`, '1')),
  ...Array.from({ length: 10 }, (_, i) => q(`T2#${i}`, '2')),
  ...Array.from({ length: 5 }, (_, i) => q(`T3#${i}`, '3')),
  ...Array.from({ length: 4 }, (_, i) => q(`L#${i}`, 'lexico', 'ingles')),
  ...Array.from({ length: 3 }, (_, i) => q(`M#${i}`, 'morfo', 'ingles')),
];

describe('sampler', () => {
  it('lists groups per subject, numerically for chapters', () => {
    const many = [...pool, q('T10#0', '10')];
    expect(groupsOf(many, 'temario')).toEqual(['1', '2', '3', '10']);
    expect(groupsOf(pool, 'ingles')).toEqual(['lexico', 'morfo']);
  });

  it('counts available questions in the chosen groups only', () => {
    expect(availableCount(pool, 'temario', ['1', '3'])).toBe(15);
    expect(availableCount(pool, 'ingles', ['morfo'])).toBe(3);
    expect(availableCount(pool, 'temario', [])).toBe(0);
  });

  it('draws only from chosen groups and subject, without duplicates', () => {
    const drawn = sampleQuestions(pool, { subject: 'temario', groups: ['1', '3'], count: 12, seed: 7 });
    expect(drawn).toHaveLength(12);
    expect(new Set(drawn.map((x) => x.id)).size).toBe(12);
    expect(drawn.every((x) => x.subject === 'temario' && ['1', '3'].includes(x.group))).toBe(true);
  });

  it('draws English questions only from the chosen areas', () => {
    const drawn = sampleQuestions(pool, { subject: 'ingles', groups: ['morfo'], count: 5, seed: 3 });
    expect(drawn).toHaveLength(3);
    expect(drawn.every((x) => x.group === 'morfo')).toBe(true);
  });

  it('is reproducible for a seed and differs across seeds', () => {
    const opts = { subject: 'temario' as const, groups: ['1', '2'], count: 10 };
    const a = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const b = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const c = sampleQuestions(pool, { ...opts, seed: 43 }).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('does not reorder the caller array', () => {
    const before = pool.map((x) => x.id);
    sampleQuestions(pool, { subject: 'temario', groups: ['1', '2', '3'], count: 25, seed: 9 });
    expect(pool.map((x) => x.id)).toEqual(before);
  });

  it('rejects a count below one', () => {
    expect(() =>
      sampleQuestions(pool, { subject: 'temario', groups: ['1'], count: 0, seed: 1 }),
    ).toThrow('count must be at least 1');
  });

  it('names random tests per subject', () => {
    const d = new Date(2026, 9, 14, 20, 30, 15);
    expect(randomTestId('temario', ['4', '3', '3'], d)).toBe('RND-T34-20261014-203015');
    expect(randomTestId('ingles', ['morfo', 'lexico'], d)).toBe('RND-ING-20261014-203015');
  });
});
