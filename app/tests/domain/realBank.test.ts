import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateBank } from '../../src/domain/bank';

const REAL = join(homedir(), 'Documents/controlador/Primer Examen/app-sync/bank.json');

// Read lazily: a skipped describe still runs its body, and CI has no real bank.
const load = () => validateBank(JSON.parse(readFileSync(REAL, 'utf-8')));

describe.skipIf(!existsSync(REAL))('real bank.json from build_bank.py', () => {

  it('passes the app validation', () => {
    expect(load()).toMatchObject({ ok: true });
  });

  it('carries both subjects, every English question in a labelled area', () => {
    const result = load();
    if (!result.ok) throw new Error(result.error);
    const { bank } = result;
    expect(bank.schema).toBe(2);
    expect(bank.tests.some((t) => t.subject === 'ingles')).toBe(true);
    expect(bank.tests.some((t) => t.subject === 'temario')).toBe(true);
    const english = bank.questions.filter((q) => q.subject === 'ingles');
    expect(english.every((q) => q.group in bank.groups.ingles && q.ref)).toBe(true);
  });
});
