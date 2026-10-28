import { describe, expect, it } from 'vitest';
import { ALL, canDelete, historyFor, isLowScore, scopesFor } from '../../src/domain/history';
import type { Attempt, Bank, Subject } from '../../src/domain/types';

const test = (id: string, scope: string, subject: Subject = 'temario') => ({
  id,
  subject,
  scope,
  title: id,
  questions: [],
  limit_min: 20,
  pass_ref: 10,
  synthetic: true,
});

const bank = {
  schema: 2,
  built: 'x',
  groups: { temario: {}, ingles: {} },
  questions: [],
  tests: [
    test('SYN-T3-001', 'T3'),
    test('SYN-T4-001', 'T4'),
    test('SYN-T4-002', 'T4'),
    test('SYN-ING-001', 'ING', 'ingles'),
  ],
} as unknown as Bank;

let n = 0;
/** A finished attempt; `day` orders `finished`, `started` defaults to the same instant. */
function att(testId: string, day: number, over: Partial<Attempt> = {}): Attempt {
  const iso = `2026-10-${String(day).padStart(2, '0')}T10:00:00`;
  return {
    uuid: `u${n++}`,
    test_id: testId,
    kind: 'fixed',
    status: 'finished',
    started: iso,
    finished: iso,
    exported: false,
    subject: testId.startsWith('SYN-ING') ? 'ingles' : 'temario',
    pass_ref: 10,
    items: [],
    ...over,
  } as unknown as Attempt;
}

describe('scopesFor', () => {
  it('lists the subject scopes in bank order', () => {
    expect(scopesFor(bank, 'temario')).toEqual(['T3', 'T4']);
    expect(scopesFor(bank, 'ingles')).toEqual(['ING']);
    expect(scopesFor(null, 'temario')).toEqual([]);
  });
});

describe('historyFor', () => {
  it('returns every attempt of a scope, newest finished first, uncapped', () => {
    const t4 = Array.from({ length: 12 }, (_, i) => att('SYN-T4-001', i + 1));
    const t3 = att('SYN-T3-001', 20);
    const got = historyFor([...t4, t3], bank, 'temario', 'T4');
    expect(got).toHaveLength(12);
    expect(got[0].finished).toBe('2026-10-12T10:00:00');
    expect(got).not.toContain(t3);
  });

  it('caps Todos at the ten newest by finished, even when started order differs', () => {
    const many = Array.from({ length: 12 }, (_, i) => att('SYN-T4-001', i + 1));
    // Started first but finished last: must still be in the ten newest.
    const late = att('SYN-T3-001', 28, { started: '2026-09-01T10:00:00' });
    const got = historyFor([late, ...many], bank, 'temario', ALL);
    expect(got).toHaveLength(10);
    expect(got[0]).toBe(late);
  });

  it('keeps the other subject out, Todos included', () => {
    const ing = att('SYN-ING-001', 5);
    expect(historyFor([ing], bank, 'temario', ALL)).toEqual([]);
    expect(historyFor([ing], bank, 'ingles', ALL)).toEqual([ing]);
  });

  it('treats an attempt saved before subjects existed as temario', () => {
    const old = att('SYN-T4-001', 3, { subject: undefined });
    expect(historyFor([old], bank, 'temario', 'T4')).toEqual([old]);
  });

  it('shows attempts without a chapter only under Todos', () => {
    const random = att('random', 4, { kind: 'random' });
    const orphan = att('SYN-T9-099', 5);
    expect(historyFor([random, orphan], bank, 'temario', ALL)).toHaveLength(2);
    expect(historyFor([random, orphan], bank, 'temario', 'T4')).toEqual([]);
  });

  it('never shows an attempt in progress', () => {
    const open = att('SYN-T4-001', 6, { status: 'in_progress', finished: null });
    expect(historyFor([open], bank, 'temario', ALL)).toEqual([]);
    expect(historyFor([open], bank, 'temario', 'T4')).toEqual([]);
  });
});

describe('isLowScore', () => {
  const items = (right: number) =>
    Array.from({ length: 20 }, (_, i) => ({ key: 'a', ans: i < right ? 'a' : null }));
  it('flags a net below the pass reference only', () => {
    expect(isLowScore(att('SYN-T4-001', 1, { items: items(9) } as never))).toBe(true);
    expect(isLowScore(att('SYN-T4-001', 1, { items: items(10) } as never))).toBe(false);
  });
});

describe('canDelete', () => {
  it('allows only finished attempts that never left the phone', () => {
    expect(canDelete(att('SYN-T4-001', 1))).toBe(true);
    expect(canDelete(att('SYN-T4-001', 1, { exported: true }))).toBe(false);
    expect(canDelete(att('SYN-T4-001', 1, { status: 'in_progress' }))).toBe(false);
  });
});
