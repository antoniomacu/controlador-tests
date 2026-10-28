import { passes, score } from './scoring';
import type { Attempt, Bank, Subject } from './types';

/** Chapter filter of the home screen: `ALL` ("Todos") or a scope code such as `'T4'`. */
export const ALL = 'all';
export type ScopeFilter = string;

/** How many attempts "Todos" shows; a single chapter shows all of its own. */
const ALL_CAP = 10;

/** Distinct scopes of a subject's tests, in the order they first appear in the bank. */
export function scopesFor(bank: Bank | null, subject: Subject): string[] {
  const tests = (bank?.tests ?? []).filter((t) => t.subject === subject);
  return [...new Set(tests.map((t) => t.scope))];
}

/**
 * Finished attempts of a subject, newest `finished` first. A scope keeps only attempts of that
 * scope's bank tests; random and orphaned attempts have no chapter and appear only under `ALL`.
 */
export function historyFor(
  attempts: readonly Attempt[],
  bank: Bank | null,
  subject: Subject,
  scope: ScopeFilter,
): Attempt[] {
  // Attempts saved before the English subject existed carry no subject: they are temario.
  const mine = attempts.filter(
    (a) => a.status === 'finished' && (a.subject ?? 'temario') === subject,
  );
  const newest = [...mine].sort((a, b) => (b.finished ?? '').localeCompare(a.finished ?? ''));
  if (scope === ALL) return newest.slice(0, ALL_CAP);
  const ids = new Set(
    (bank?.tests ?? []).filter((t) => t.subject === subject && t.scope === scope).map((t) => t.id),
  );
  return newest.filter((a) => ids.has(a.test_id));
}

/** Below the pass reference: the attempt to go back to. */
export function isLowScore(a: Attempt): boolean {
  return !passes(score(a.items), a.pass_ref);
}

/** An exported attempt may already be in the Excel, so only unexported ones can be deleted. */
export function canDelete(a: Attempt): boolean {
  return a.status === 'finished' && !a.exported;
}
